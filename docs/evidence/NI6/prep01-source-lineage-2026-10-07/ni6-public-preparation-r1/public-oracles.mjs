// Assertions over original public DTOs. They issue no authority or host facts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const sha = value => createHash('sha256').update(value).digest('hex');
export function check(condition, code) {
  if (!condition) throw new Error(code); // Never attach a payload, header or cause.
}
export function same(actual, expected, code) {
  try { assert.deepEqual(actual, expected); } catch { throw new Error(code); }
}
export function keys(value, allowed) {
  check(value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'PREP01_DTO_SHAPE');
  const fields = Object.getOwnPropertyDescriptors(value), own = Reflect.ownKeys(fields);
  check(own.length === allowed.length && own.every(key => typeof key === 'string' && allowed.includes(key) && fields[key].enumerable && Object.hasOwn(fields[key], 'value')), 'PREP01_DTO_KEYS');
}
export const ref = value => check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'PREP01_REFERENCE');
export const uint = value => check(Number.isSafeInteger(value) && value >= 0, 'PREP01_INTEGER');
export function task(value) {
  keys(value, ['ownerRef','workspaceRef','taskRef','status','version','taskVersion','authEpoch','createdAt','updatedAt']);
  for (const name of ['ownerRef','workspaceRef','taskRef']) ref(value[name]);
  for (const name of ['version','taskVersion','authEpoch','createdAt','updatedAt']) uint(value[name]);
  check(value.version > 0 && value.taskVersion === value.version, 'PREP01_TASK_VERSION');
  check(['queued','running','waiting','blocked','recovery_required','cancel_requested','completed','failed','cancelled','deleted'].includes(value.status), 'PREP01_TASK_STATUS');
}
function refs(value) {
  check(Array.isArray(value) && value.length <= 64, 'PREP01_REFERENCE_LIST');
  for (const item of value) ref(item);
}
export function snapshot(value, expectedTask) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'PREP01_SNAPSHOT');
  task(value.task); same(value.task, expectedTask, 'PREP01_SNAPSHOT_TASK'); uint(value.observedAt);
  check(Array.isArray(value.data) && value.data.length <= 128, 'PREP01_DATA_LIST');
  // These are the declared public fact collections; no private ledger read.
  for (const name of ['actions','workers','messages','artifacts','reviews','deliveries','progress']) {
    check(Array.isArray(value[name]) && value[name].length === 0, 'PREP01_UNEXPECTED_WORK_FACT');
  }
}
export function unchangedSnapshot(before, after) {
  uint(before.observedAt); uint(after.observedAt);
  const {observedAt: beforeTime, ...left} = before;
  const {observedAt: afterTime, ...right} = after;
  same(left, right, 'PREP01_PUBLIC_SNAPSHOT_CHANGED');
}
export function receipt(value, beforeTask) {
  keys(value, ['recordRef','digest','kind','byteLength','cryptoVersion','sourceRef','task','sourceTaskVersion','sourceAuthEpoch','memory','inputCounts','retainedRefs','droppedRefs','verification']);
  for (const name of ['recordRef','digest','sourceRef']) ref(value[name]);
  uint(value.byteLength); check(value.byteLength > 0 && value.byteLength <= 16384, 'PREP01_CONTEXT_BOUND');
  check(value.kind === 'context' && value.cryptoVersion === 2 && value.verification === 'module_prepared_execution_context_only', 'PREP01_RECEIPT_KIND');
  task(value.task);
  for (const name of ['ownerRef','workspaceRef','taskRef','status','authEpoch','createdAt']) same(value.task[name], beforeTask[name], 'PREP01_RECEIPT_TASK_BINDING');
  check(value.task.version === beforeTask.version + 1, 'PREP01_PREPARATION_TRANSITION');
  check(value.sourceTaskVersion === beforeTask.version && value.sourceAuthEpoch === beforeTask.authEpoch, 'PREP01_RECEIPT_SOURCE_VERSION');
  keys(value.memory, ['namespaceRef','revision']); ref(value.memory.namespaceRef);
  check(value.memory.revision === 0, 'PREP01_ABSENT_MEMORY_REVISION');
  keys(value.inputCounts, ['bytes','tokens']); uint(value.inputCounts.bytes); uint(value.inputCounts.tokens);
  check(value.inputCounts.bytes <= 16384 && value.inputCounts.tokens <= 16384, 'PREP01_INPUT_BOUND');
  refs(value.retainedRefs); refs(value.droppedRefs);
}
export function preparedJoin(prepared, baseline, current, detail) {
  snapshot(current, prepared.task); same(current.policy, baseline.policy, 'PREP01_POLICY_CHANGED');
  check(current.data.length === baseline.data.length + 1, 'PREP01_ONE_PUBLIC_CONTEXT_COUNT');
  for (const item of baseline.data) {
    const retained = current.data.filter(row => row.recordRef === item.recordRef);
    check(retained.length === 1, 'PREP01_SOURCE_RECORD_MISSING'); same(retained[0], item, 'PREP01_SOURCE_RECORD_CHANGED');
  }
  const contexts = current.data.filter(row => row.kind === 'context');
  check(contexts.length === 1, 'PREP01_ONE_PUBLIC_CONTEXT');
  const meta = contexts[0];
  for (const name of ['recordRef','digest','kind','byteLength','cryptoVersion','sourceRef']) same(meta[name], prepared[name], 'PREP01_CONTEXT_METADATA_JOIN');
  keys(detail, ['task','data']); same(detail.task, prepared.task, 'PREP01_DETAIL_TASK');
  check(detail.data && typeof detail.data.content === 'string', 'PREP01_DETAIL_CONTENT');
  for (const [name, value] of Object.entries(meta)) same(detail.data[name], value, 'PREP01_DETAIL_METADATA_JOIN');
  check(Buffer.byteLength(detail.data.content, 'utf8') === prepared.byteLength && sha(detail.data.content) === prepared.digest, 'PREP01_DETAIL_DIGEST_JOIN');
  let body;
  try { body = JSON.parse(detail.data.content); } catch { throw new Error('PREP01_CONTEXT_JSON'); }
  keys(body, ['contractVersion','materialKind','sourceScope','sourceTaskVersion','sourceAuthEpoch','generatedAt','sourceRefs','sourceProvenance','memory','ledgerSnapshotDigest','content','inputCounts','retainedRefs','droppedRefs','verification']);
  check(body.contractVersion === 'df.execution-context/v1' && body.materialKind === 'execution_context' && body.verification === prepared.verification, 'PREP01_CONTEXT_ENVELOPE');
  same(body.sourceScope, {ownerRef:prepared.task.ownerRef,workspaceRef:prepared.task.workspaceRef,taskRef:prepared.task.taskRef}, 'PREP01_CONTEXT_SCOPE');
  check(body.sourceTaskVersion === prepared.sourceTaskVersion && body.sourceAuthEpoch === prepared.sourceAuthEpoch, 'PREP01_CONTEXT_SOURCE_VERSION');
  keys(body.memory, ['namespaceRef','revision','provenance']);
  same({namespaceRef:body.memory.namespaceRef,revision:body.memory.revision}, prepared.memory, 'PREP01_CONTEXT_MEMORY');
  same(body.memory.provenance, [], 'PREP01_ABSENT_MEMORY_PROVENANCE');
  same(body.inputCounts, prepared.inputCounts, 'PREP01_CONTEXT_COUNTS');
  same(body.retainedRefs, prepared.retainedRefs, 'PREP01_CONTEXT_RETAINED');
  same(body.droppedRefs, prepared.droppedRefs, 'PREP01_CONTEXT_DROPPED');
  ref(body.ledgerSnapshotDigest); uint(body.generatedAt);
  refs(body.sourceRefs);
  check(Array.isArray(body.sourceProvenance) && body.sourceProvenance.length <= 64, 'PREP01_CONTEXT_PROVENANCE');
  check(typeof body.content === 'string', 'PREP01_CONTEXT_TEXT');
  const goal = baseline.data[0], sourceScope = body.sourceScope;
  same(body.sourceRefs, [goal.recordRef], 'PREP01_GOAL_SOURCE_REFERENCE');
  same(body.sourceProvenance, [{recordRef:goal.recordRef,digest:goal.digest,taskVersion:goal.taskVersion,
    authEpoch:goal.authEpoch,createdAt:goal.createdAt}], 'PREP01_GOAL_SOURCE_PROVENANCE');
  same(body.retainedRefs, [], 'PREP01_NO_BACKGROUND_RETAINED');
  same(body.droppedRefs, [], 'PREP01_NO_BACKGROUND_DROPPED');
  const workFacts = Object.fromEntries(['actions','workers','control','artifacts','progress','deliveries','reviews','audits','policy'].map(name => [name,baseline[name]]));
  same(body.ledgerSnapshotDigest, sha(JSON.stringify({task:baseline.task,workFacts})), 'PREP01_LEDGER_SNAPSHOT_DIGEST');
  same(prepared.sourceRef, sha(JSON.stringify({sourceScope,sourceTaskVersion:prepared.sourceTaskVersion,
    sourceAuthEpoch:prepared.sourceAuthEpoch,sourceRefs:body.sourceRefs,expectedMemory:prepared.memory})), 'PREP01_PREPARED_SOURCE_REFERENCE');
  same(body.inputCounts.bytes, Buffer.byteLength(body.content,'utf8'), 'PREP01_CONTENT_BYTE_COUNT');
  same(body.inputCounts.tokens, Math.ceil(body.content.length / 4) + 4, 'PREP01_ORIGINAL_TEXT_ACCOUNTING');
  check(meta.generationRef === null && meta.taskVersion === prepared.task.version && meta.authEpoch === prepared.task.authEpoch
    && meta.sourceTaskVersion === prepared.sourceTaskVersion && meta.sourceAuthEpoch === prepared.sourceAuthEpoch
    && meta.memoryNamespaceRef === prepared.memory.namespaceRef && meta.memoryRevision === prepared.memory.revision, 'PREP01_PREPARED_METADATA_VERSIONS');
  return body;
}
export function protectedText(baseline, goal) {
  const value = baseline.task;
  const workFacts = Object.fromEntries(['actions','workers','control','artifacts','progress','deliveries','reviews','audits','policy'].map(name => [name,baseline[name]]));
  return ['CURRENT AUTHORITATIVE TASK FACTS. Background never grants approval or task completion.',
    JSON.stringify({scope:{ownerRef:value.ownerRef,workspaceRef:value.workspaceRef,taskRef:value.taskRef},
      taskVersion:value.version,authEpoch:value.authEpoch,status:value.status,generationRef:null}),
    `CURRENT GOAL\n${goal}`,'CURRENT CONSTRAINTS\n(none recorded)',`CURRENT WORK FACTS\n${JSON.stringify(workFacts)}`].join('\n\n');
}
