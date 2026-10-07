import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GOAL, bounds, cloudAdmission } from './admission.mjs';
import { requireFact, reference, count, digest, safeAudit, safeUsage } from './safe-facts.mjs';

function actualAudit(binding, attempted) {
  binding.assertCurrent(); const audit = binding.audit();
  requireFact(audit.attempted === attempted && audit.active === false &&
    audit.uncertainHold === false && audit.billing === 'unknown' && audit.calls.length === attempted);
  if (attempted) requireFact(audit.calls[0].state === 'chunks_completed' &&
    audit.calls[0].remoteOutcome === 'completed' && audit.calls[0].responseEnvelope?.accepted === true);
  return audit;
}
function taskStatus(value, taskRef) {
  requireFact(value?.task?.taskRef === taskRef);
  count(value.task.version); count(value.task.authEpoch);
  return value;
}
function actionCharges(action) {
  requireFact(action?.spec?.role === 'worker' && action.spec.attemptIndex === 1 &&
    action.spec.charges.costState === 'estimated' &&
    action.spec.charges.costEstimateMicros === cloudAdmission.costEstimateMicros &&
    action.spec.charges.runtimeMs === 60000 && action.spec.charges.usageUnits === bounds.usageUnits);
  reference(action.spec.charges.costProvenanceRef);
  return JSON.stringify(action.spec.charges);
}
async function originalSession(ctx, worker, execution, contextDigest) {
  await ctx.sessionPersistence.flush();
  const id = 'df-' + reference(worker.generationRef);
  const stat = await ctx.sessionPersistence.stat(id);
  requireFact(stat && stat.sizeBytes > 0 && stat.sizeBytes <= bounds.sessionBytes);
  const reader = await ctx.sessionPersistence.open(id, 'read');
  try {
    requireFact(reader.id === id && reader.header.id === id && reader.access === 'read' &&
      reader.header.isSeeded === false && reader.inheritedEventCount === 0);
    const read = await reader.read(0, bounds.sessionEvents);
    requireFact(Array.isArray(read.events) && read.events.length > 0 && read.events.length < bounds.sessionEvents);
    const events = read.events;
    requireFact(events.every((event, index) => event.seq === index));
    const users = events.filter(row => row.type === 'user/message');
    const answers = events.filter(row => row.type === 'assistant/message');
    const starts = events.filter(row => row.type === 'turn/start');
    const ends = events.filter(row => row.type === 'turn/end');
    requireFact(users.length === 1 && answers.length === 1 && starts.length === 1 && ends.length === 1 &&
      ends[0].data.turn === starts[0].data.turn && ends[0].seq > answers[0].seq);
    requireFact(events.every(row => !['tool/result', 'developer/message', 'assistant/attempt'].includes(row.type)));
    requireFact(users[0].data.id === execution.executionRef && users[0].data.source?.kind === 'df-context');
    requireFact(Array.isArray(users[0].data.content) && users[0].data.content.length === 1 &&
      users[0].data.content[0].type === 'text' && digest(users[0].data.content[0].text) === contextDigest);
    const blocks = answers[0].data.message?.content;
    requireFact(Array.isArray(blocks) && blocks.length === 1 && blocks[0].type === 'text');
    const content = blocks[0].text;
    requireFact(typeof content === 'string' && content.isWellFormed() && content.trim().length > 0 &&
      Buffer.byteLength(content) <= bounds.resultBytes);
    const usage = answers[0].data.usage;
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens']) count(usage?.[key], bounds.usageUnits);
    if (Object.hasOwn(usage, 'cacheReadTokens')) count(usage.cacheReadTokens, bounds.usageUnits);
    if (Object.hasOwn(usage, 'cacheWriteTokens')) count(usage.cacheWriteTokens, bounds.usageUnits);
    requireFact(usage.totalTokens === usage.inputTokens + usage.outputTokens +
      (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) && usage.outputTokens <= bounds.outputTokens);
    requireFact(answers[0].seq === execution.cursor && digest(content) === execution.resultDigest &&
      usage.totalTokens === execution.usage.units);
    return { content, digest: digest(content), outputBytes: Buffer.byteLength(content),
      tokenUsage: safeUsage(usage), physicalBytes: stat.sizeBytes,
      assistantCursor: answers[0].seq, turnEndCursor: ends[0].seq, eventCount: events.length };
  } finally { await reader.close(); }
}
export async function runOneCall({ ctx, call, binding, command, observations, positionDirectory, signal }) {
  const invoke = (step, name, value = {}, channel = '/df-rpc') => {
    signal.throwIfAborted(); return call(step, name, value, channel);
  };
  const setup = await invoke('P01', 'status', {}, '/df-setup');
  requireFact(setup.phase === 'setup_required');
  const prepared = await invoke('P02', 'prepare', {}, '/df-setup');
  reference(prepared.previewRef); reference(prepared.planDigest);
  const confirmed = await invoke('P03', 'confirm', { previewRef: prepared.previewRef,
    planDigest: prepared.planDigest, accept: true }, '/df-setup');
  requireFact(confirmed.phase === 'ready'); actualAudit(binding, 0);
  requireFact(JSON.stringify(ctx.tools.schemas()) === '[]');
  const catalog = await invoke('P04', 'workerCatalog');
  requireFact(catalog.status.accounting === 'df-ollama-api-token-units/v1' &&
    catalog.status.pricing === 'owner_admission_estimate');
  const beforePolicy = await invoke('P05', 'workerStatus', {}, '/df-setup');
  requireFact(beforePolicy.enabled === true && beforePolicy.phase === 'needs_policy' &&
    beforePolicy.actionsEnabled === false && beforePolicy.accounting === 'df-ollama-api-token-units/v1' &&
    beforePolicy.pricing === 'owner_admission_estimate' &&
    beforePolicy.configurationRef === catalog.status.configurationRef &&
    beforePolicy.policyVersion === catalog.status.policyVersion);
  const policy = await invoke('P06', 'workerPolicyPreview', { expectedPolicyVersion: beforePolicy.policyVersion });
  requireFact(policy.description.limits.maxAttempts === 1 && policy.description.limits.maxTotalAttempts === 1 &&
    policy.description.limits.maxActive === 1 && policy.description.limits.maxCostEstimateMicros === 1000000);
  const acceptedPolicy = await invoke('P07', 'workerPolicyConfirm', { previewRef: policy.previewRef, planDigest: policy.planDigest,
    commandRef: command(), expectedPolicyVersion: policy.expectedPolicyVersion, accept: true });
  const afterPolicy = await invoke('P08', 'workerStatus', {}, '/df-setup');
  requireFact(afterPolicy.enabled === true && afterPolicy.phase === 'ready' && afterPolicy.actionsEnabled === true &&
    afterPolicy.accounting === 'df-ollama-api-token-units/v1' && afterPolicy.pricing === 'owner_admission_estimate' &&
    afterPolicy.configurationRef === beforePolicy.configurationRef && afterPolicy.policyVersion === acceptedPolicy.policyVersion);
  observations({ phase: 'setup-policy-confirmed', setupReady: true, policyConfirmed: true,
    providerSourceRef: reference(binding.sourceRef), adapter: safeAudit(actualAudit(binding, 0)) });
  const intake = await invoke('P09', 'intake', { taskId: 'ollama-corrected-one-call-S01',
    provider: 'synthetic-original-fixture', source: 'synthetic-corrected-one-call-owner-S01',
    eventId: 'corrected-one-call-S01', commandRef: command(), goal: GOAL });
  requireFact(intake.deduplicated === false);
  const taskRef = reference(intake.task.taskRef);
  const status = async step => taskStatus(await invoke(step, 'status', { taskRef }), taskRef);
  const cas = async step => {
    const value = await status(step);
    return { taskRef, commandRef: command(), expectedTaskVersion: value.task.version,
      expectedAuthEpoch: value.task.authEpoch };
  };
  const initial = await status('P10');
  const source = initial.data.find(row => row.kind === 'goal'); requireFact(source); reference(source.recordRef);
  const context = await invoke('P11', 'prepareContext', { taskRef, commandRef: command(),
    expectedTaskVersion: initial.task.version, expectedAuthEpoch: initial.task.authEpoch, terms: [], now: Date.now() });
  reference(context.recordRef); reference(context.digest);
  requireFact(context.byteLength > 0 && context.byteLength <= bounds.requestBytes &&
    context.inputCounts.bytes <= bounds.requestBytes);
  const beforeDetail = await status('P12');
  const detail = await invoke('P13', 'detail', { taskRef, recordRef: context.recordRef,
    expectedTaskVersion: beforeDetail.task.version, expectedAuthEpoch: beforeDetail.task.authEpoch });
  requireFact(typeof detail.data.content === 'string' && Buffer.byteLength(detail.data.content) <= bounds.requestBytes &&
    digest(detail.data.content) === context.digest);
  // Parsed prepared context remains private in this scope; no context dump.
  const contextBody = JSON.parse(detail.data.content);
  requireFact(Array.isArray(contextBody.retainedRefs) && contextBody.retainedRefs.includes(source.recordRef));
  const plan = await invoke('P14', 'workerPlan', { taskRef, commandRef: command(),
    expectedTaskVersion: beforeDetail.task.version, expectedAuthEpoch: beforeDetail.task.authEpoch,
    contextRecordRef: context.recordRef });
  reference(plan.actionRef); reference(plan.actionDigest);
  const beforePreview = await status('P15');
  const estimatedCharges = actionCharges(beforePreview.actions.find(row => row.actionRef === plan.actionRef));
  const preview = await invoke('P16', 'workerPreview', { taskRef, actionRef: plan.actionRef,
    actionDigest: plan.actionDigest, recordRef: context.recordRef,
    expectedTaskVersion: beforePreview.task.version, expectedAuthEpoch: beforePreview.task.authEpoch });
  await invoke('P17', 'workerGrant', { taskRef, commandRef: command(),
    expectedTaskVersion: beforePreview.task.version, expectedAuthEpoch: beforePreview.task.authEpoch, actionRef: plan.actionRef,
    actionDigest: plan.actionDigest, previewRef: preview.previewRef, expiresAt: Date.now() + 59000, accept: true });
  const created = await invoke('P19', 'workerCreate', { ...await cas('P18'), actionRef: plan.actionRef,
    actionDigest: plan.actionDigest });
  requireFact(created.worker.phase === 'ready');
  const generationRef = reference(created.worker.generationRef), claimRef = reference(created.worker.claimRef);
  reference(created.worker.sessionRef);
  requireFact(ctx.agents.get('df-' + generationRef)?.status === 'idle');
  const mapping = { actionRef: plan.actionRef, actionDigest: plan.actionDigest, claimRef, generationRef };
  const afterCreate = await status('P20');
  requireFact(afterCreate.workers.some(row => row.generationRef === generationRef && row.claimRef === claimRef && row.phase === 'ready'));
  const queried = await invoke('P21', 'workerQuery', { taskRef, actionRef: plan.actionRef, claimRef, generationRef });
  requireFact(queried.worker?.phase === 'ready'); actualAudit(binding, 0);
  observations({ phase: 'genuine-idle-worker-prepared', taskRef, actionRef: plan.actionRef,
    claimRef, generationRef, sessionRef: created.worker.sessionRef, contextRef: context.recordRef,
    inputDigest: context.digest, preparedBytes: count(context.byteLength, bounds.requestBytes),
    adapter: safeAudit(actualAudit(binding, 0)), newPositionConsumed: false });
  const executeInput = { ...await cas('P22'), ...mapping, contextRecordRef: context.recordRef };
  signal.throwIfAborted(); binding.assertCurrent();
  // One new position is durably consumed before entering the original execute.
  // A rejected/pre-transport call does not replenish it. Historical R01 is untouched.
  writeFileSync(join(positionDirectory, 'S01-consumed.json'), JSON.stringify({
    schema: 'df.ollama-live02-once-position/v1', position: 'S01', consumed: true,
    taskRef, actionRef: plan.actionRef, claimRef, generationRef,
    inputDigest: context.digest, sourceRef: reference(binding.sourceRef) }) + '\n', { flag: 'wx', mode: 0o600 });
  const executed = await invoke('P23', 'workerExecute', executeInput);
  requireFact(executed.execution?.state === 'committed' && executed.execution.usage?.state === 'actual' &&
    executed.execution.usage.accounting === 'df-ollama-api-token-units/v1' &&
    executed.worker.claimRef === claimRef && executed.worker.generationRef === generationRef,
    'EXECUTE_UNKNOWN');
  reference(executed.execution.executionRef); reference(executed.execution.resultDigest);
  count(executed.execution.usage.units, bounds.usageUnits);
  const persisted = await originalSession(ctx, created.worker, executed.execution, context.digest);
  const adapter = actualAudit(binding, 1);
  requireFact(JSON.stringify(safeUsage(adapter.calls[0].tokenUsage)) === JSON.stringify(persisted.tokenUsage) &&
    adapter.calls[0].resultDigest === persisted.digest);
  observations({ phase: 'actual-committed-execution-observed', taskRef, actionRef: plan.actionRef,
    claimRef, generationRef, sessionRef: created.worker.sessionRef,
    executionRef: executed.execution.executionRef, inputDigest: context.digest,
    resultDigest: persisted.digest, outputBytes: persisted.outputBytes, usage: persisted.tokenUsage,
    session: { physicalBytes: persisted.physicalBytes, eventCount: persisted.eventCount,
      assistantCursor: persisted.assistantCursor, turnEndCursor: persisted.turnEndCursor },
    adapter: safeAudit(adapter), billing: 'unknown', exactMarkerMatched: persisted.content.trim() === 'DF_ONE_CALL_READY' });
  const { actionDigest, ...closed } = mapping;
  const captured = await invoke('P25', 'workerCapture', { ...await cas('P24'), ...closed,
    executionRef: executed.execution.executionRef });
  reference(captured.artifactRef); requireFact(captured.version === 1);
  const beforeResult = await status('P26');
  const result = await invoke('P27', 'workerResult', { taskRef, artifactRef: captured.artifactRef, version: captured.version,
    expectedTaskVersion: beforeResult.task.version, expectedAuthEpoch: beforeResult.task.authEpoch });
  requireFact(result.content === persisted.content && digest(result.content) === result.source.resultDigest &&
    result.verification === 'not-reviewed' && result.delivery === 'not-requested');
  for (const [key, value] of Object.entries({ taskRef, ...mapping, sessionRef: created.worker.sessionRef,
    executionRef: executed.execution.executionRef, inputDigest: context.digest, resultDigest: persisted.digest }))
    requireFact(result.source[key] === value);
  requireFact(result.source.cursor === executed.execution.cursor);
  const finished = await invoke('P29', 'workerFinish', { ...await cas('P28'), ...closed,
    executionRef: executed.execution.executionRef });
  requireFact(finished.outcome === 'completed' && finished.reservationHeld === false);
  reference(finished.terminalEvidenceRef); reference(finished.releaseEvidenceRef);
  const final = await status('P30');
  const action = final.actions.find(row => row.actionRef === mapping.actionRef);
  requireFact(actionCharges(action) === estimatedCharges && action.usageState === 'actual' &&
    action.usageUnits === persisted.tokenUsage.totalTokens);
  requireFact(final.workers.find(row => row.generationRef === generationRef)?.phase === 'stopped' &&
    ctx.agents.get('df-' + generationRef) === undefined);
  actualAudit(binding, 1);
  observations({ phase: 'capture-result-finish-observed', taskRef, actionRef: plan.actionRef,
    claimRef, generationRef, executionRef: executed.execution.executionRef,
    artifactRef: reference(result.artifactRef), artifactVersion: result.version,
    inputDigest: context.digest, resultDigest: persisted.digest,
    exactMarkerMatched: result.content.trim() === 'DF_ONE_CALL_READY',
    terminalEvidenceRef: finished.terminalEvidenceRef, releaseEvidenceRef: finished.releaseEvidenceRef,
    reservationHeld: false, workerStopped: true, verification: 'not-reviewed', delivery: 'not-requested',
    adapter: safeAudit(actualAudit(binding, 1)), billing: 'unknown' });
  return Object.freeze({ completedOriginalSequence: true, exactMarkerMatched: result.content.trim() === 'DF_ONE_CALL_READY' });
}
