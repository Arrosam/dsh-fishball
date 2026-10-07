import { stableErrorCode } from './stable-error-code.mjs';
import assert from 'node:assert/strict';
import { hash } from '../../src/runtime-security.mjs';
import { bounds, cloudAdmission } from './admission.mjs';
import { goals, preferenceOriginal, preferenceCorrected, refinement, advisory } from './prompts.mjs';
import { within } from './native-fixture.mjs';

async function snapshot(f, taskRef) { return f.call('status', { taskRef }); }
async function cas(f, taskRef) {
  const { task } = await snapshot(f, taskRef);
  return { taskRef, commandRef: f.command(), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch };
}
function charges(action) {
  assert.equal(action.spec.role, 'worker'); assert.equal(action.spec.attemptIndex, 1);
  assert.equal(action.spec.charges.costState, 'estimated');
  assert.equal(action.spec.charges.costEstimateMicros, cloudAdmission.costEstimateMicros);
  assert.match(action.spec.charges.costProvenanceRef, /^[a-f0-9]{64}$/u);
  assert.equal(action.spec.charges.runtimeMs, 60000); assert.equal(action.spec.charges.usageUnits, bounds.usageUnits);
  return structuredClone(action.spec.charges);
}
function healthy(f, count) {
  f.binding.assertCurrent(); const audit = f.binding.audit();
  assert.equal(audit.attempted, count); assert.equal(audit.active, false);
  assert.equal(audit.uncertainHold, false); assert.equal(audit.billing, 'unknown');
  assert.equal(audit.calls.length, count);
  if (count) { assert.equal(audit.calls.at(-1).remoteOutcome, 'completed'); assert.equal(audit.calls.at(-1).state, 'chunks_completed'); }
  return audit;
}
async function persisted(f, worker, executionRef) {
  await f.ctx.sessionPersistence.flush();
  const id = 'df-' + worker.generationRef;
  const stat = await f.ctx.sessionPersistence.stat(id);
  assert.ok(stat && stat.sizeBytes > 0 && stat.sizeBytes <= 1048576);
  const read = await f.ctx.sessionPersistence.open(id, 'read');
  try {
    assert.equal(read.id, id); assert.equal(read.header.id, id); assert.equal(read.access, 'read');
    assert.equal(read.header.isSeeded, false); assert.equal(read.inheritedEventCount, 0);
    const { events } = await read.read(0, 128); assert.ok(events.length < 128);
    assert.deepEqual(events.map(event => event.seq), events.map((_, index) => index));
    const users = events.filter(event => event.type === 'user/message');
    const answers = events.filter(event => event.type === 'assistant/message');
    const starts = events.filter(event => event.type === 'turn/start'), ends = events.filter(event => event.type === 'turn/end');
    assert.equal(users.length, 1); assert.equal(answers.length, 1); assert.equal(starts.length, 1); assert.equal(ends.length, 1);
    assert.equal(ends[0].data.turn, starts[0].data.turn); assert.ok(ends[0].seq > answers[0].seq);
    assert.equal(users[0].data.id, executionRef); assert.equal(users[0].data.source.kind, 'df-context');
    assert.equal(events.some(event => ['tool/result', 'developer/message', 'assistant/attempt'].includes(event.type)), false);
    const blocks = answers[0].data.message.content;
    assert.equal(blocks.length, 1); assert.equal(blocks[0].type, 'text');
    const usage = answers[0].data.usage;
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens']) assert.ok(Number.isSafeInteger(usage[key]) && usage[key] >= 0);
    if (Object.hasOwn(usage, 'cacheReadTokens')) assert.ok(Number.isSafeInteger(usage.cacheReadTokens) && usage.cacheReadTokens >= 0);
    assert.equal(usage.totalTokens, usage.inputTokens + (usage.cacheReadTokens ?? 0) + usage.outputTokens);
    assert.ok(usage.outputTokens <= bounds.outputTokens); assert.ok(usage.totalTokens <= bounds.usageUnits);
    const content = blocks[0].text;
    assert.ok(Buffer.byteLength(content) <= bounds.resultBytes);
    return { id, physicalBytes: stat.sizeBytes, cursor: answers[0].seq, endCursor: ends[0].seq,
      content, digest: hash(content), inputDigest: hash(users[0].data.content[0].text), tokenUsage: structuredClone(usage) };
  } finally { await read.close(); }
}
async function prepare(f, slot, goal, memoryRequirement) {
  assert.ok(Buffer.byteLength(goal) <= bounds.goalBytes);
  healthy(f, Number(slot.slice(1)) - 1); f.observer.select(slot);
  const intake = await f.call('intake', { taskId: 'ollama-functional-' + slot,
    provider: 'synthetic-original-fixture', source: 'synthetic-owner-' + slot,
    eventId: slot, commandRef: f.command(), goal });
  const taskRef = intake.task.taskRef; assert.equal(intake.deduplicated, false);
  const initial = await snapshot(f, taskRef), source = initial.data.find(row => row.kind === 'goal'); assert.ok(source);
  let remembered;
  if (slot === 'R02') {
    const memory = await f.call('memoryRead');
    remembered = await f.call('memoryRemember', { commandRef: f.command(), expectedRevision: memory.revision,
      candidate: { kind: 'preference', content: { text: preferenceOriginal }, confidence: 1,
        sourceRefs: [source.recordRef], observedAt: Date.now() } });
    assert.equal(remembered.result.authority, 'memory_only');
    memoryRequirement = { id: remembered.result.id, revision: 1, sourceRef: source.recordRef, memoryRevision: remembered.revision };
  }
  if (slot === 'R04') {
    const memory = await f.call('memoryRead');
    const correction = await f.call('memoryCorrect', { commandRef: f.command(), expectedRevision: memory.revision,
      id: memoryRequirement.id, expectedFactRevision: memoryRequirement.revision, accept: true,
      candidate: { kind: 'preference', content: { text: preferenceCorrected }, confidence: 1,
        sourceRefs: [source.recordRef], observedAt: Date.now() } });
    assert.equal(correction.result.authority, 'memory_only');
    assert.equal(correction.result.factRevision, memoryRequirement.revision + 1);
    memoryRequirement = { id: correction.result.id, revision: correction.result.factRevision,
      sourceRef: source.recordRef, memoryRevision: correction.revision };
    remembered = correction;
  }
  const context = await f.call('prepareContext', { ...await cas(f, taskRef), terms: slot === 'R02' || slot === 'R04' ? ['paper', 'token', 'packing', 'checklist', 'group', 'destination', 'color'] : [], now: Date.now() });
  assert.ok(context.byteLength <= bounds.requestBytes); assert.ok(context.inputCounts.bytes <= bounds.requestBytes);
  return { slot, taskRef, source, context, remembered, memoryRequirement };
}

async function planAndCreate(f, item) {
  const { taskRef, context } = item;
  const { task } = await snapshot(f, taskRef);
  const detail = await f.call('detail', { taskRef, recordRef: context.recordRef,
    expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
  const envelope = JSON.parse(detail.data.content);
  assert.equal(hash(detail.data.content), context.digest);
  if (item.memoryRequirement) {
    const required = item.memoryRequirement;
    assert.equal(envelope.memory.revision, required.memoryRevision);
    assert.ok(envelope.memory.provenance.some(row => row.id === required.id && row.revision === required.revision && row.sourceRefs.includes(required.sourceRef)), 'actual requested memory must be retained before inference');
  }
  const plan = await f.call('workerPlan', { ...await cas(f, taskRef), contextRecordRef: context.recordRef });
  const beforePreview = await snapshot(f, taskRef), action = beforePreview.actions.find(row => row.actionRef === plan.actionRef);
  item.estimatedCharges = charges(action);
  const preview = await f.call('workerPreview', { taskRef, actionRef: plan.actionRef, actionDigest: plan.actionDigest,
    recordRef: context.recordRef, expectedTaskVersion: beforePreview.task.version, expectedAuthEpoch: beforePreview.task.authEpoch });
  await f.call('workerGrant', { ...await cas(f, taskRef), actionRef: plan.actionRef, actionDigest: plan.actionDigest,
    previewRef: preview.previewRef, expiresAt: Date.now() + 59000, accept: true });
  const created = await f.call('workerCreate', { ...await cas(f, taskRef), actionRef: plan.actionRef, actionDigest: plan.actionDigest });
  assert.equal(created.worker.phase, 'ready');
  assert.equal(f.ctx.agents.get('df-' + created.worker.generationRef).status, 'idle');
  const mapping = { actionRef: plan.actionRef, actionDigest: plan.actionDigest, claimRef: created.worker.claimRef, generationRef: created.worker.generationRef };
  await f.call('workerQuery', { taskRef, actionRef: mapping.actionRef, claimRef: mapping.claimRef, generationRef: mapping.generationRef });
  assert.equal(f.binding.audit().attempted, Number(item.slot.slice(1)) - 1);
  return Object.assign(item, { plan, created, mapping, envelopeObservation: { memory: envelope.memory,
    inputCounts: envelope.inputCounts, retainedRefs: envelope.retainedRefs, droppedRefs: envelope.droppedRefs } });
}
async function ordinary(f, item, consumePosition, checkpoint) {
  const { taskRef, mapping, context } = item;
  consumePosition(item.slot); // persistent outer reservation; never reclaimed even if dispatch denies
  const executed = await f.call('workerExecute', { ...await cas(f, taskRef), ...mapping, contextRecordRef: context.recordRef });
  assert.equal(executed.execution.state, 'committed'); assert.equal(executed.execution.usage.state, 'actual');
  const originalLog = await persisted(f, item.created.worker, executed.execution.executionRef);
  assert.equal(originalLog.inputDigest, context.digest); assert.equal(originalLog.digest, executed.execution.resultDigest);
  assert.equal(originalLog.tokenUsage.totalTokens, executed.execution.usage.units);
  const slotStream = f.observer.rows.find(row => row.slot === item.slot);
  assert.deepEqual(slotStream.chunks.find(chunk => chunk.type === 'usage').usage, originalLog.tokenUsage);
  const { actionDigest, ...closed } = mapping;
  const captured = await f.call('workerCapture', { ...await cas(f, taskRef), ...closed, executionRef: executed.execution.executionRef });
  const now = await snapshot(f, taskRef);
  const result = await f.call('workerResult', { taskRef, artifactRef: captured.artifactRef, version: captured.version,
    expectedTaskVersion: now.task.version, expectedAuthEpoch: now.task.authEpoch });
  assert.equal(result.content, originalLog.content); assert.equal(hash(result.content), result.source.resultDigest);
  assert.equal(result.verification, 'not-reviewed'); assert.equal(result.delivery, 'not-requested');
  for (const [key, value] of Object.entries({ taskRef, ...mapping, sessionRef: item.created.worker.sessionRef,
    executionRef: executed.execution.executionRef, inputDigest: context.digest, resultDigest: originalLog.digest })) assert.equal(result.source[key], value);
  assert.equal(result.source.cursor, executed.execution.cursor);
  const finished = await f.call('workerFinish', { ...await cas(f, taskRef), ...closed, executionRef: executed.execution.executionRef });
  assert.equal(finished.outcome, 'completed'); assert.equal(finished.reservationHeld, false);
  assert.match(finished.terminalEvidenceRef, /^[a-f0-9]{64}$/u); assert.match(finished.releaseEvidenceRef, /^[a-f0-9]{64}$/u);
  const final = await snapshot(f, taskRef), action = final.actions.find(row => row.actionRef === mapping.actionRef);
  assert.deepEqual(charges(action), item.estimatedCharges); assert.equal(action.usageState, 'actual'); assert.equal(action.usageUnits, originalLog.tokenUsage.totalTokens);
  assert.equal(final.workers.find(row => row.generationRef === mapping.generationRef).phase, 'stopped');
  assert.equal(f.ctx.agents.get('df-' + mapping.generationRef), undefined);
  const afterStop = await persisted(f, item.created.worker, executed.execution.executionRef); assert.deepEqual(afterStop, originalLog);
  const audit = healthy(f, Number(item.slot.slice(1)));
  assert.deepEqual(audit.calls.at(-1).tokenUsage, originalLog.tokenUsage);
  checkpoint({ slot: item.slot, state: 'actual-native-functional-observed', captured, resultMetadata: { ...result, content: undefined },
    contentDigest: originalLog.digest, outputBytes: Buffer.byteLength(result.content), tokenUsage: originalLog.tokenUsage,
    prepared: item.context, preparedObservation: item.envelopeObservation, memoryReceipt: item.remembered,
    execution: executed, finish: finished, ownerAction: action, workerStop: final.workers,
    persistence: { id: originalLog.id, physicalBytes: originalLog.physicalBytes, assistantCursor: originalLog.cursor, turnEndCursor: originalLog.endCursor },
    adapterAudit: audit, billingState: 'unknown', semanticAcceptance: 'not-assessed' });
  return { content: result.content, digest: originalLog.digest, source: result.source, memoryRequirement: item.memoryRequirement };
}
async function interruption(f, item, consumePosition, checkpoint) {
  f.observer.arm(); consumePosition('R06');
  const executeInput = { ...await cas(f, item.taskRef), ...item.mapping, contextRecordRef: item.context.recordRef };
  const execution = f.call('workerExecute', executeInput).then(value => ({ ok: true, value }), error => ({ ok: false, code: stableErrorCode(error, 'execute') }));
  const reached = await within(Promise.race([f.observer.reached.then(value => ({ reached: true, value })), execution.then(value => ({ reached: false, value }))]), 65000, 'BARRIER_NOT_OBSERVED');
  if (!reached.reached) { checkpoint({ slot: 'R06', state: 'NOT_EXERCISED/HOLD', reason: 'real block-start barrier absent', execution: reached.value }); return; }
  let lifecycleReads = 0;
  const observe = async () => { assert.ok(++lifecycleReads <= 4); return snapshot(f, item.taskRef); };
  try {
    const before = await observe();
    const cancel = f.call('control', { taskRef: item.taskRef, commandRef: f.command(), expectedTaskVersion: before.task.version,
      expectedAuthEpoch: before.task.authEpoch, kind: 'cancel' }).then(value => ({ ok: true, value }), error => ({ ok: false, code: stableErrorCode(error, 'cancel') }));
    await within(f.observer.loss, 10000, 'ORIGINAL_ABORT_NOT_OBSERVED');
    const during = await observe(); assert.equal(during.control, 'cancel_requested');
    f.observer.release();
    const [executeResult, cancelResult] = await within(Promise.all([execution, cancel]), 10000, 'LOCAL_DRAIN_UNKNOWN');
    const after = await observe(), observation = f.observer.snapshot();
    const late = observation.rows.find(row => row.slot === 'R06').chunks.filter(chunk => chunk.afterLoss);
    assert.equal(late.some(chunk => ['text-delta', 'reasoning-delta', 'block-end', 'usage'].includes(chunk.type) || chunk.type === 'finish' && ['stop', 'max-tokens'].includes(chunk.reason?.kind)), false);
    assert.equal(after.artifacts.length, 0); // no capture operation is issued for interrupted work
    assert.equal(f.binding.audit().attempted, 6);
    checkpoint({ slot: 'R06', state: 'cancellation-observed/settlement-HOLD', executeResult, cancelResult,
      originalBefore: before, originalDuring: during, originalAfter: after, streamObservation: observation,
      lifecycleReads, adapterAudit: f.binding.audit(), remoteTermination: 'unproved', drain: 'original-public-result-only', release: 'not-requested' });
  } finally { f.observer.release(); }
}
export function createSixPositionSequence(f, { consumePosition, checkpoint }) {
  let preflightStarted = false, preflightReady = false, liveStarted = false, preparedFirst;
  const generations = new Set(), sessions = new Set(), tasks = new Set(), actions = new Set();
  const rememberDistinct = item => {
    for (const [set, value] of [[generations, item.created.worker.generationRef],
      [sessions, item.created.worker.sessionRef], [tasks, item.taskRef],
      [actions, item.plan.actionRef]]) {
      assert.ok(!set.has(value)); set.add(value);
    }
    return item;
  };
  const create = async (slot, goal, requirement) => rememberDistinct(
    await planAndCreate(f, await prepare(f, slot, goal, requirement)));
  const execute = async (slot, goal, requirement) => ordinary(f, await create(slot, goal, requirement), consumePosition, checkpoint);
  return Object.freeze({
    async preflight() {
      assert.equal(preflightStarted, false); preflightStarted = true;
      const catalog = await f.call('workerCatalog'); assert.equal(catalog.status.accounting, 'df-ollama-api-token-units/v1');
      assert.equal(catalog.status.pricing, 'owner_admission_estimate');
      const policy = await f.call('workerPolicyPreview', { expectedPolicyVersion: catalog.status.policyVersion });
      assert.equal(policy.description.limits.maxAttempts, 1); assert.equal(policy.description.limits.maxTotalAttempts, 1);
      assert.equal(policy.description.limits.maxActive, 1); assert.equal(policy.description.limits.maxCostEstimateMicros, 6000000);
      await f.call('workerPolicyConfirm', { previewRef: policy.previewRef, planDigest: policy.planDigest, commandRef: f.command(),
        expectedPolicyVersion: policy.expectedPolicyVersion, accept: true });
      checkpoint({ phase: 'original-policy-confirmed', policy, aggregateAllocation: { runtimeMs: 360000, usageUnits: 199680, admissionEstimateMicros: 6000000 } });
      preparedFirst = await create('R01', goals.R01);
      healthy(f, 0);
      assert.equal(f.observer.rows.length, 0);
      assert.equal(f.ctx.agents.get('df-' + preparedFirst.created.worker.generationRef).status, 'idle');
      checkpoint({ phase: 'genuine-no-inference-preflight-ready',
        taskRef: preparedFirst.taskRef, worker: preparedFirst.created.worker,
        context: preparedFirst.context, providerAudit: f.binding.audit(),
        livePositionsReserved: false, cloudBilling: 'unknown' });
      preflightReady = true;
    },
    async run() {
      assert.equal(preflightReady, true); assert.ok(preparedFirst);
      assert.equal(liveStarted, false); liveStarted = true;
      await ordinary(f, preparedFirst, consumePosition, checkpoint);
      const first = await execute('R02', goals.R02);
      await execute('R03', goals.R03);
      assert.ok(Buffer.byteLength(first.content) <= bounds.forwardedOutputBytes, 'R04/R05 HOLD: full original R02 result exceeds forwarding bound');
      const revised = await execute('R04', refinement(first), first.memoryRequirement);
      assert.ok(Buffer.byteLength(revised.content) <= bounds.forwardedOutputBytes, 'R05 HOLD: full original R04 result exceeds forwarding bound');
      await execute('R05', advisory(first, revised));
      const last = await create('R06', goals.R06);
      await within(interruption(f, last, consumePosition, checkpoint), bounds.interruptWindowMs, 'R06_WINDOW_UNKNOWN');
    },
  });
}
