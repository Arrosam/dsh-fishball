import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { GOAL, bounds, cloudAdmission, remainingWorkMs } from './admission.mjs';
import { requireFact, reference, count, digest, safeAudit, safeUsage, readAudit } from './safe-facts.mjs';

function actualAudit(binding, attempted) {
  binding.assertCurrent(); const audit = readAudit(binding);
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
// These projections are independent observations of the pinned public DTOs.
// They do not replace a producer, hydrate authority, or access a private handle.
function exactKeys(value, keys) {
  requireFact(value && typeof value === 'object' && !Array.isArray(value) &&
    isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort()));
}
function same(actual, expected) { requireFact(isDeepStrictEqual(actual, expected)); }
function canonicalJSON(value) {
  const ordered = item => Array.isArray(item) ? item.map(ordered) :
    item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])])) : item;
  return JSON.stringify(ordered(value));
}
function originalTask(task) {
  exactKeys(task, ['ownerRef', 'workspaceRef', 'taskRef', 'status', 'version', 'taskVersion', 'authEpoch', 'createdAt', 'updatedAt']);
  for (const key of ['ownerRef', 'workspaceRef', 'taskRef']) reference(task[key]);
  for (const key of ['version', 'taskVersion', 'authEpoch', 'createdAt', 'updatedAt']) count(task[key]);
  requireFact(task.version >= 1 && task.taskVersion === task.version && task.updatedAt >= task.createdAt &&
    ['queued', 'running', 'blocked', 'waiting', 'completed', 'failed', 'cancel_requested', 'cancelled', 'recovery_required', 'deleted'].includes(task.status));
  // Exact taskRecord field order from original src/runtime-store.mjs.
  return { ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, taskRef: task.taskRef,
    status: task.status, version: task.version, taskVersion: task.taskVersion,
    authEpoch: task.authEpoch, createdAt: task.createdAt, updatedAt: task.updatedAt };
}
function scopeOf(task) { return { ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, taskRef: task.taskRef }; }
function taskJoin(actual, expected) { same(originalTask(actual), originalTask(expected)); }
function metadataJoin(actual, expected) {
  requireFact(actual && expected);
  for (const key of Object.keys(expected)) requireFact(Object.hasOwn(actual, key) && isDeepStrictEqual(actual[key], expected[key]));
}
function preparedContext({ intake, intakeCommand, initial, receipt, preparationCommand, beforeDetail, detail }) {
  exactKeys(receipt, ['recordRef', 'digest', 'kind', 'byteLength', 'cryptoVersion', 'sourceRef', 'task',
    'sourceTaskVersion', 'sourceAuthEpoch', 'memory', 'inputCounts', 'retainedRefs', 'droppedRefs', 'verification']);
  exactKeys(detail, ['task', 'data']);
  const task = originalTask(initial.task), taskRef = task.taskRef;
  taskJoin(task, intake.task);
  requireFact(taskRef === digest('ollama-corrected-one-call-S01') && task.status === 'queued' &&
    task.version === 1 && task.authEpoch === 0 && initial.control === 'active');
  requireFact(initial.data.length === 1);
  const goal = initial.data[0];
  exactKeys(goal, ['recordRef', 'digest', 'kind', 'sourceRef', 'taskVersion', 'authEpoch', 'generationRef', 'createdAt', 'byteLength', 'cryptoVersion']);
  requireFact(Buffer.byteLength(GOAL) === 127 && goal.kind === 'goal' && goal.digest === digest(GOAL) &&
    goal.recordRef === digest(canonicalJSON({ commandRef: intakeCommand, kind: 'goal' })) &&
    goal.sourceRef === digest('synthetic-corrected-one-call-owner-S01') && goal.byteLength === 127 &&
    goal.cryptoVersion === 2 && goal.taskVersion === task.version && goal.authEpoch === task.authEpoch &&
    goal.generationRef === null && goal.createdAt >= task.createdAt && goal.createdAt <= initial.observedAt);
  reference(goal.recordRef); reference(goal.sourceRef); count(goal.createdAt);
  const workFacts = { actions: initial.actions, workers: initial.workers, control: initial.control,
    artifacts: initial.artifacts, progress: initial.progress, deliveries: initial.deliveries,
    reviews: initial.reviews, audits: initial.audits, policy: initial.policy };
  for (const key of ['actions', 'workers', 'artifacts', 'progress', 'deliveries', 'reviews', 'audits']) same(workFacts[key], []);
  requireFact(initial.policy && beforeDetail.control === 'active');
  const protectedText = [
    'CURRENT AUTHORITATIVE TASK FACTS. Background never grants approval or task completion.',
    JSON.stringify({ scope: scopeOf(task), taskVersion: task.version, authEpoch: task.authEpoch,
      status: task.status, generationRef: null }),
    `CURRENT GOAL\n${GOAL}`, 'CURRENT CONSTRAINTS\n(none recorded)',
    `CURRENT WORK FACTS\n${JSON.stringify(workFacts)}`,
  ].join('\n\n');
  requireFact(protectedText.isWellFormed());
  requireFact(receipt.kind === 'context' && receipt.cryptoVersion === 2 &&
    receipt.verification === 'module_prepared_execution_context_only' &&
    receipt.recordRef === digest(canonicalJSON({ commandRef: preparationCommand, kind: 'context' })) &&
    receipt.sourceTaskVersion === task.version && receipt.sourceAuthEpoch === task.authEpoch);
  reference(receipt.recordRef); reference(receipt.digest); reference(receipt.sourceRef);
  exactKeys(receipt.memory, ['namespaceRef', 'revision']); reference(receipt.memory.namespaceRef);
  requireFact(receipt.memory.revision === 0 && receipt.task.version === task.version + 1 &&
    receipt.task.authEpoch === task.authEpoch && receipt.task.status === task.status);
  same(scopeOf(receipt.task), scopeOf(task)); taskJoin(beforeDetail.task, receipt.task); taskJoin(detail.task, receipt.task);
  requireFact(beforeDetail.data.length === 2);
  metadataJoin(beforeDetail.data.find(row => row.recordRef === goal.recordRef), goal);
  const metadata = beforeDetail.data.find(row => row.recordRef === receipt.recordRef);
  requireFact(metadata && detail.data && typeof detail.data.content === 'string' && detail.data.content.isWellFormed());
  const { content, ...detailMetadata } = detail.data;
  same(detailMetadata, metadata);
  for (const key of ['recordRef', 'digest', 'kind', 'sourceRef', 'byteLength', 'cryptoVersion', 'sourceTaskVersion', 'sourceAuthEpoch'])
    requireFact(metadata[key] === receipt[key]);
  requireFact(metadata.taskVersion === receipt.task.version && metadata.authEpoch === task.authEpoch &&
    metadata.generationRef === null && metadata.memoryNamespaceRef === receipt.memory.namespaceRef &&
    metadata.memoryRevision === 0 && metadata.semanticRevision === beforeDetail.semanticRevision &&
    metadata.createdAt >= goal.createdAt && metadata.createdAt <= beforeDetail.observedAt);
  count(metadata.createdAt); count(metadata.semanticRevision);
  requireFact(Buffer.byteLength(content) === receipt.byteLength && receipt.byteLength > 0 &&
    receipt.byteLength <= bounds.requestBytes && digest(content) === receipt.digest);
  // Parsed context/content remains private. No raw field is exported.
  const body = JSON.parse(content);
  exactKeys(body, ['contractVersion', 'materialKind', 'sourceScope', 'sourceTaskVersion', 'sourceAuthEpoch', 'generatedAt',
    'sourceRefs', 'sourceProvenance', 'memory', 'ledgerSnapshotDigest', 'content', 'inputCounts', 'retainedRefs', 'droppedRefs', 'verification']);
  requireFact(body.contractVersion === 'df.execution-context/v1' && body.materialKind === 'execution_context' &&
    body.verification === receipt.verification && body.sourceTaskVersion === task.version &&
    body.sourceAuthEpoch === task.authEpoch && body.generatedAt >= initial.observedAt && body.generatedAt <= metadata.createdAt &&
    body.content === protectedText && JSON.stringify(body) === content);
  count(body.generatedAt); same(body.sourceScope, scopeOf(task)); same(body.sourceRefs, [goal.recordRef]);
  same(body.sourceProvenance, [{ recordRef: goal.recordRef, digest: goal.digest, taskVersion: goal.taskVersion,
    authEpoch: goal.authEpoch, createdAt: goal.createdAt }]);
  same(body.memory, { namespaceRef: receipt.memory.namespaceRef, revision: 0, provenance: [] });
  same(body.inputCounts, { bytes: Buffer.byteLength(protectedText), tokens: Math.ceil(protectedText.length / 4) + 4 });
  requireFact(body.inputCounts.bytes <= 16384 && body.inputCounts.tokens <= 8192);
  same(receipt.inputCounts, body.inputCounts); same(body.retainedRefs, []); same(body.droppedRefs, []);
  same(receipt.retainedRefs, []); same(receipt.droppedRefs, []);
  const expectedMemory = { namespaceRef: receipt.memory.namespaceRef, revision: 0 };
  requireFact(receipt.sourceRef === digest(JSON.stringify({ sourceScope: body.sourceScope,
    sourceTaskVersion: body.sourceTaskVersion, sourceAuthEpoch: body.sourceAuthEpoch,
    sourceRefs: body.sourceRefs, expectedMemory })) &&
    body.ledgerSnapshotDigest === digest(JSON.stringify({ task, workFacts })));
  return { body, goal, metadata };
}
function selectedAction(snapshot, plan, spec) {
  requireFact(snapshot.control === 'active' && snapshot.actions.length === 1);
  const action = snapshot.actions[0];
  requireFact(action.actionRef === plan.actionRef && action.actionDigest === plan.actionDigest &&
    action.plannedTaskVersion === plan.taskVersion && action.plannedAuthEpoch === plan.authEpoch);
  if (spec) same(action.spec, spec);
  return action;
}
function workerTuple(worker, tuple, phase, taskRefExposed = true) {
  requireFact(worker && worker.phase === phase);
  for (const key of ['actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'sessionRef'])
    requireFact(worker[key] === tuple[key]);
  if (taskRefExposed) requireFact(worker.taskRef === tuple.taskRef);
}
function claimedSnapshot(snapshot, plan, spec, tuple, phase) {
  const action = selectedAction(snapshot, plan, spec);
  requireFact(action.claimRef === tuple.claimRef && action.reservationRef === tuple.reservationRef &&
    action.generationRef === tuple.generationRef && action.attempts === 1 &&
    action.state === 'dispatch_intent' && action.usageState === 'estimated' &&
    action.outcome === null && action.releaseEvidenceRef === null);
  requireFact(snapshot.workers.length === 1);
  workerTuple(snapshot.workers[0], tuple, phase, false);
  count(snapshot.workers[0].cursor); reference(snapshot.workers[0].evidenceRef);
  requireFact(snapshot.workers[0].terminalEvidenceRef === null);
  return action;
}
function executionSnapshot(snapshot, executed, tuple, context, executeInput) {
  requireFact(snapshot.executions.length === 1);
  const row = snapshot.executions[0];
  for (const [key, value] of Object.entries({ executionRef: executed.execution.executionRef,
    taskRef: tuple.taskRef, actionRef: tuple.actionRef, actionDigest: tuple.actionDigest,
    claimRef: tuple.claimRef, generationRef: tuple.generationRef, contextRecordRef: context.recordRef,
    dataDigest: context.digest, commandRef: executeInput.commandRef })) requireFact(row[key] === value);
  requireFact(row.state === 'dispatch_intent'); count(row.createdAt); count(row.admittedAt);
  requireFact(row.admittedAt >= row.createdAt);
  return row;
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
    requireFact(users[0].data.id === execution.executionRef && users[0].data.role === 'user' &&
      users[0].data.source?.kind === 'df-context' && users[0].data.source.form === 'local' &&
      answers[0].data.interrupted !== true);
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
export async function runOneCall({ ctx, call, binding, command, observations, positionDirectory, signal, progress }) {
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
  const intakeCommand = command();
  const intake = await invoke('P09', 'intake', { taskId: 'ollama-corrected-one-call-S01',
    provider: 'synthetic-original-fixture', source: 'synthetic-corrected-one-call-owner-S01',
    eventId: 'corrected-one-call-S01', commandRef: intakeCommand, goal: GOAL });
  requireFact(intake.deduplicated === false);
  const taskRef = reference(intake.task.taskRef); originalTask(intake.task);
  const status = async step => taskStatus(await invoke(step, 'status', { taskRef }), taskRef);
  const cas = value => ({ taskRef, commandRef: command(), expectedTaskVersion: value.task.version,
    expectedAuthEpoch: value.task.authEpoch });
  const initial = await status('P10');
  const preparationCommand = command();
  const context = await invoke('P11', 'prepareContext', { taskRef, commandRef: preparationCommand,
    expectedTaskVersion: initial.task.version, expectedAuthEpoch: initial.task.authEpoch, terms: [], now: Date.now() });
  const beforeDetail = await status('P12');
  const detail = await invoke('P13', 'detail', { taskRef, recordRef: context.recordRef,
    expectedTaskVersion: beforeDetail.task.version, expectedAuthEpoch: beforeDetail.task.authEpoch });
  const contextObservation = preparedContext({ intake, intakeCommand, initial, receipt: context,
    preparationCommand, beforeDetail, detail });
  const plan = await invoke('P14', 'workerPlan', { taskRef, commandRef: command(),
    expectedTaskVersion: beforeDetail.task.version, expectedAuthEpoch: beforeDetail.task.authEpoch,
    contextRecordRef: context.recordRef });
  reference(plan.actionRef); reference(plan.actionDigest);
  requireFact(plan.taskVersion === beforeDetail.task.version && plan.authEpoch === beforeDetail.task.authEpoch);
  const beforePreview = await status('P15'); taskJoin(beforePreview.task, beforeDetail.task);
  const planned = selectedAction(beforePreview, plan);
  requireFact(planned.state === 'requested' && planned.attempts === 0 && planned.outcome === null &&
    planned.terminalEvidenceRef === null && planned.releaseEvidenceRef === null &&
    planned.plannedTaskVersion === plan.taskVersion && planned.plannedAuthEpoch === plan.authEpoch);
  const spec = structuredClone(planned.spec);
  exactKeys(spec, ['actionRef', 'kind', 'role', 'targetDigest', 'dataDigest', 'units', 'charges', 'attemptGroupRef',
    'attemptIndex', 'resourcePolicyVersion', 'modelPolicyVersion', 'executor', 'model']);
  exactKeys(spec.executor, ['mode', 'generationRef', 'sessionRef', 'environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest']);
  exactKeys(spec.model, ['modelRef', 'reasoningRef', 'presetRef', 'catalogEvidenceRef']);
  requireFact(spec.actionRef === plan.actionRef && spec.kind === 'write' && spec.role === 'worker' &&
    spec.units === 1 && spec.dataDigest === context.digest && spec.executor.mode === 'create' &&
    spec.executor.sessionRef === digest('df-' + reference(spec.executor.generationRef)) &&
    spec.resourcePolicyVersion === beforePreview.policy.version && spec.resourcePolicyVersion === afterPolicy.policyVersion &&
    spec.modelPolicyVersion === beforePreview.policy.modelPolicy.version &&
    beforePreview.policy.modelPolicy.presetRefs.includes(spec.model.presetRef) &&
    spec.model.catalogEvidenceRef === beforePreview.policy.modelPolicy.catalogEvidenceRef);
  for (const key of ['targetDigest', 'dataDigest', 'attemptGroupRef']) reference(spec[key]);
  for (const [key, value] of Object.entries(spec.executor)) if (key !== 'mode') reference(value);
  for (const value of Object.values(spec.model)) reference(value);
  requireFact(plan.actionDigest === digest(canonicalJSON({ ownerRef: initial.task.ownerRef,
    workspaceRef: initial.task.workspaceRef, taskRef, taskVersion: plan.taskVersion, authEpoch: plan.authEpoch, spec })));
  const estimatedCharges = actionCharges(planned);
  const preview = await invoke('P16', 'workerPreview', { taskRef, actionRef: plan.actionRef,
    actionDigest: plan.actionDigest, recordRef: context.recordRef,
    expectedTaskVersion: beforePreview.task.version, expectedAuthEpoch: beforePreview.task.authEpoch });
  requireFact(preview.taskRef === taskRef && preview.actionRef === plan.actionRef && preview.actionDigest === plan.actionDigest &&
    preview.taskVersion === beforePreview.task.version && preview.authEpoch === beforePreview.task.authEpoch &&
    preview.description.kind === spec.kind && preview.description.role === spec.role);
  reference(preview.previewRef); reference(preview.description.evidenceRef); count(preview.expiresAt);
  same(preview.description.data, { recordRef: context.recordRef, digest: context.digest, kind: 'context', content: detail.data.content });
  same(preview.description.toolNames, []);
  same(preview.description.limits, { units: spec.units, attemptIndex: spec.attemptIndex, charges: spec.charges });
  requireFact(preview.description.environment.environmentRef === spec.executor.environmentRef);
  const grantExpiry = Date.now() + 59000;
  const granted = await invoke('P17', 'workerGrant', { taskRef, commandRef: command(),
    expectedTaskVersion: beforePreview.task.version, expectedAuthEpoch: beforePreview.task.authEpoch, actionRef: plan.actionRef,
    actionDigest: plan.actionDigest, previewRef: preview.previewRef, expiresAt: grantExpiry, accept: true });
  requireFact(granted.actionRef === plan.actionRef && granted.actionDigest === plan.actionDigest &&
    granted.taskVersion === beforePreview.task.version && granted.authEpoch === beforePreview.task.authEpoch + 1 &&
    granted.expiresAt === grantExpiry && granted.task.version === granted.taskVersion && granted.task.authEpoch === granted.authEpoch);
  same(scopeOf(granted.task), scopeOf(initial.task));
  const beforeCreate = await status('P18'); taskJoin(beforeCreate.task, granted.task);
  selectedAction(beforeCreate, plan, spec);
  requireFact(beforeCreate.workers.length === 0 && beforeCreate.executions.length === 0);
  const created = await invoke('P19', 'workerCreate', { ...cas(beforeCreate), actionRef: plan.actionRef,
    actionDigest: plan.actionDigest });
  const generationRef = reference(created.worker.generationRef), claimRef = reference(created.worker.claimRef);
  const reservationRef = reference(created.worker.reservationRef), sessionRef = reference(created.worker.sessionRef);
  const tuple = { taskRef, actionRef: plan.actionRef, actionDigest: plan.actionDigest,
    claimRef, reservationRef, generationRef, sessionRef };
  workerTuple(created.worker, tuple, 'ready');
  requireFact(generationRef === spec.executor.generationRef && sessionRef === spec.executor.sessionRef &&
    reservationRef === digest(canonicalJSON({ claimRef, actionDigest: plan.actionDigest })) &&
    created.task.status === 'running' && created.task.version === beforeCreate.task.version + 1 &&
    created.task.authEpoch === beforeCreate.task.authEpoch);
  same(scopeOf(created.task), scopeOf(initial.task)); originalTask(created.task);
  requireFact(ctx.agents.get('df-' + generationRef)?.status === 'idle');
  const mapping = { actionRef: plan.actionRef, actionDigest: plan.actionDigest, claimRef, generationRef };
  const afterCreate = await status('P20'); taskJoin(afterCreate.task, created.task);
  claimedSnapshot(afterCreate, plan, spec, tuple, 'ready');
  requireFact(afterCreate.executions.length === 0);
  const queried = await invoke('P21', 'workerQuery', { taskRef, actionRef: plan.actionRef, claimRef, generationRef });
  taskJoin(queried.task, created.task); workerTuple(queried.worker, tuple, 'ready'); actualAudit(binding, 0);
  observations({ phase: 'genuine-idle-worker-prepared', taskRef, actionRef: plan.actionRef,
    claimRef, reservationRef, generationRef, sessionRef, contextRef: context.recordRef,
    inputDigest: context.digest, preparedBytes: count(context.byteLength, bounds.requestBytes),
    contextContractJoined: true, sourceScopeJoined: true, protectedGoalProvenanceJoined: true,
    retainedBackgroundCount: contextObservation.body.retainedRefs.length, memoryRevision: contextObservation.body.memory.revision,
    immutableSpecJoined: true, adapter: safeAudit(actualAudit(binding, 0)), newPositionConsumed: false });
  const beforeExecute = await status('P22'); taskJoin(beforeExecute.task, created.task);
  claimedSnapshot(beforeExecute, plan, spec, tuple, 'ready'); requireFact(beforeExecute.executions.length === 0);
  const executeInput = { ...cas(beforeExecute), ...mapping, contextRecordRef: context.recordRef };
  signal.throwIfAborted(); binding.assertCurrent();
  requireFact(remainingWorkMs() >= bounds.executeAdmissionMs, 'DEADLINE_UNKNOWN');
  // Exclusive persistence is one-shot; no fsync/power-loss guarantee is claimed.
  // A slow write or pre-transport refusal does not refund S01. R01 is untouched.
  progress({ newPositionConsumed: null }); // Entered write; outcome not confirmed yet.
  writeFileSync(join(positionDirectory, 'S01-consumed.json'), JSON.stringify({
    schema: 'df.ollama-live02-once-position/v1', position: 'S01', consumed: true,
    taskRef, actionRef: plan.actionRef, claimRef, generationRef,
    inputDigest: context.digest, sourceRef: reference(binding.sourceRef) }) + '\n', { flag: 'wx', mode: 0o600 });
  progress({ newPositionConsumed: true });
  signal.throwIfAborted();
  requireFact(remainingWorkMs() >= bounds.executeAdmissionMs, 'DEADLINE_UNKNOWN');
  const executed = await invoke('P23', 'workerExecute', executeInput);
  requireFact(executed.execution?.state === 'committed' && executed.execution.usage?.state === 'actual' &&
    executed.execution.usage.accounting === 'df-ollama-api-token-units/v1', 'EXECUTE_UNKNOWN');
  taskJoin(executed.task, beforeExecute.task); workerTuple(executed.worker, tuple, 'ready');
  reference(executed.execution.executionRef); reference(executed.execution.resultDigest);
  count(executed.execution.cursor); count(executed.execution.usage.units, bounds.usageUnits);
  const persisted = await originalSession(ctx, created.worker, executed.execution, context.digest);
  const adapter = actualAudit(binding, 1);
  requireFact(JSON.stringify(safeUsage(adapter.calls[0].tokenUsage)) === JSON.stringify(persisted.tokenUsage) &&
    adapter.calls[0].resultDigest === persisted.digest);
  const matched = persisted.content.trim() === 'DF_ONE_CALL_READY';
  progress({ exactMarkerMatched: matched, scopedGoal: matched ? 'PASS' : 'FAIL' });
  observations({ phase: 'actual-committed-execution-observed', taskRef, actionRef: plan.actionRef,
    claimRef, reservationRef, generationRef, sessionRef,
    executionRef: executed.execution.executionRef, inputDigest: context.digest,
    resultDigest: persisted.digest, outputBytes: persisted.outputBytes, usage: persisted.tokenUsage,
    session: { physicalBytes: persisted.physicalBytes, eventCount: persisted.eventCount,
      assistantCursor: persisted.assistantCursor, turnEndCursor: persisted.turnEndCursor },
    adapter: safeAudit(adapter), billing: 'unknown', exactMarkerMatched: matched, scopedGoal: matched ? 'PASS' : 'FAIL' });
  const { actionDigest, ...closed } = mapping;
  const beforeCapture = await status('P24'); taskJoin(beforeCapture.task, executed.task);
  const pendingAction = claimedSnapshot(beforeCapture, plan, spec, tuple, 'ready');
  requireFact(pendingAction.executionRef === executed.execution.executionRef);
  const originalExecution = executionSnapshot(beforeCapture, executed, tuple, context, executeInput);
  const captured = await invoke('P25', 'workerCapture', { ...cas(beforeCapture), ...closed,
    executionRef: executed.execution.executionRef });
  reference(captured.artifactRef); reference(captured.recordRef); reference(captured.digest);
  requireFact(captured.version === 1 && captured.producerClaimRef === claimRef && captured.generationRef === generationRef &&
    captured.verification === null && captured.task.version === beforeCapture.task.version + 1 &&
    captured.task.authEpoch === beforeCapture.task.authEpoch && captured.task.status === beforeCapture.task.status);
  same(scopeOf(captured.task), scopeOf(initial.task));
  const beforeResult = await status('P26'); taskJoin(beforeResult.task, captured.task);
  claimedSnapshot(beforeResult, plan, spec, tuple, 'ready');
  same(executionSnapshot(beforeResult, executed, tuple, context, executeInput), originalExecution);
  requireFact(beforeResult.artifacts.length === 1);
  const artifact = beforeResult.artifacts[0], { task: ignoredCaptureTask, ...captureMetadata } = captured;
  same(artifact, captureMetadata);
  const result = await invoke('P27', 'workerResult', { taskRef, artifactRef: captured.artifactRef, version: captured.version,
    expectedTaskVersion: beforeResult.task.version, expectedAuthEpoch: beforeResult.task.authEpoch });
  requireFact(result.artifactRef === captured.artifactRef && result.version === captured.version &&
    result.recordRef === captured.recordRef && result.digest === captured.digest &&
    result.content === persisted.content && digest(result.content) === result.source.resultDigest &&
    result.verification === 'not-reviewed' && result.delivery === 'not-requested');
  const source = { taskRef, actionRef: plan.actionRef, actionDigest: plan.actionDigest,
    claimRef, generationRef, sessionRef, executionRef: executed.execution.executionRef,
    inputDigest: context.digest, cursor: executed.execution.cursor, resultDigest: persisted.digest };
  same(result.source, source);
  // Exact original captureResult field order. Wrapper and full-content hashes
  // are separate observations, and neither implies review or delivery.
  const wrapper = JSON.stringify({ contractVersion: 'df.native-result/v1', source, content: persisted.content });
  requireFact(digest(wrapper) === result.digest && result.digest === artifact.digest);
  const artifactData = beforeResult.data.find(row => row.recordRef === artifact.recordRef);
  requireFact(artifactData && artifactData.kind === 'artifact' && artifactData.digest === artifact.digest &&
    artifactData.sourceRef === artifact.artifactRef && artifactData.byteLength === Buffer.byteLength(wrapper) &&
    artifactData.cryptoVersion === 2 && artifactData.generationRef === null && artifactData.taskVersion === captured.task.version &&
    artifactData.authEpoch === captured.task.authEpoch);
  reference(captured.producerRef); count(artifactData.createdAt);
  const beforeFinish = await status('P28'); taskJoin(beforeFinish.task, captured.task);
  claimedSnapshot(beforeFinish, plan, spec, tuple, 'ready');
  same(executionSnapshot(beforeFinish, executed, tuple, context, executeInput), originalExecution);
  same(beforeFinish.artifacts, beforeResult.artifacts);
  const finished = await invoke('P29', 'workerFinish', { ...cas(beforeFinish), ...closed,
    executionRef: executed.execution.executionRef });
  requireFact(finished.claimRef === claimRef && finished.reservationRef === reservationRef &&
    finished.outcome === 'completed' && finished.reservationHeld === false);
  reference(finished.terminalEvidenceRef); reference(finished.releaseEvidenceRef);
  taskJoin(finished.task, beforeFinish.task);
  const final = await status('P30'); taskJoin(final.task, finished.task);
  const action = selectedAction(final, plan, spec);
  requireFact(actionCharges(action) === estimatedCharges && action.usageState === 'actual' &&
    action.usageUnits === persisted.tokenUsage.totalTokens && action.state === 'completed' && action.outcome === 'completed' &&
    action.attempts === 1 && action.claimRef === claimRef && action.reservationRef === reservationRef &&
    action.generationRef === generationRef && action.executionRef === executed.execution.executionRef &&
    action.terminalEvidenceRef === finished.terminalEvidenceRef && action.releaseEvidenceRef === finished.releaseEvidenceRef);
  reference(action.outcomeEvidenceRef);
  requireFact(action.releaseEvidenceRef === digest(canonicalJSON({ claimRef,
    terminal: action.terminalEvidenceRef, outcome: action.outcomeEvidenceRef })));
  requireFact(final.workers.length === 1); const stoppedWorker = final.workers[0];
  workerTuple(stoppedWorker, tuple, 'stopped', false);
  requireFact(stoppedWorker.terminalEvidenceRef === action.terminalEvidenceRef &&
    stoppedWorker.evidenceRef === action.terminalEvidenceRef && stoppedWorker.cursor >= executed.execution.cursor);
  count(stoppedWorker.cursor); requireFact(final.executions.length === 1);
  const finalExecution = final.executions[0];
  metadataJoin(finalExecution, { ...originalExecution, state: 'completed',
    outcomeEvidenceRef: action.outcomeEvidenceRef, terminalEvidenceRef: action.terminalEvidenceRef });
  same(final.artifacts, beforeResult.artifacts);
  requireFact(final.control === 'active' && final.task.status === 'running' &&
    final.deliveries.length === 0 && final.reviews.length === 0 &&
    ctx.agents.get('df-' + generationRef) === undefined && ctx.sessions.get('df-' + generationRef) === undefined);
  actualAudit(binding, 1);
  observations({ phase: 'capture-result-finish-observed', taskRef, actionRef: plan.actionRef,
    claimRef, reservationRef, generationRef, sessionRef, executionRef: executed.execution.executionRef,
    artifactRef: reference(result.artifactRef), artifactVersion: result.version, recordRef: result.recordRef,
    wrapperDigest: result.digest, inputDigest: context.digest, resultDigest: persisted.digest,
    exactMarkerMatched: matched, scopedGoal: matched ? 'PASS' : 'FAIL',
    terminalEvidenceRef: finished.terminalEvidenceRef, releaseEvidenceRef: finished.releaseEvidenceRef,
    reservationHeld: false, workerStopped: true, taskCompletedByFixture: false,
    verification: 'not-reviewed', delivery: 'not-requested',
    adapter: safeAudit(actualAudit(binding, 1)), billing: 'unknown' });
  return Object.freeze({ completedOriginalSequence: true, exactMarkerMatched: matched,
    scopedGoal: matched ? 'PASS' : 'FAIL' });
}
