// SOURCE ONLY. Root must review/freeze genuine original setup before any import.
import assert from 'node:assert/strict';

export function keys(value, required, optional = []) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  const actual = Object.keys(value).sort();
  assert(actual.every(key => [...required, ...optional].includes(key)));
  for (const key of required) assert(actual.includes(key));
  for (const key of actual) assert.equal(Object.getOwnPropertyDescriptor(value, key).get, undefined);
}
export function ref(value) { assert.match(value, /^[a-f0-9]{64}$/); }
export function uint(value) { assert(Number.isSafeInteger(value) && value >= 0); }
export function task(value) {
  keys(value, ['ownerRef','workspaceRef','taskRef','status','version','taskVersion','authEpoch','createdAt','updatedAt']);
  for (const key of ['ownerRef','workspaceRef','taskRef']) ref(value[key]);
  uint(value.version); assert(value.version > 0); assert.equal(value.taskVersion, value.version);
  for (const key of ['authEpoch','createdAt','updatedAt']) uint(value[key]);
}
export function qFromCapture(capture, currentTask, commandRef) {
  task(currentTask); ref(commandRef);
  assert.equal(capture.taskRef, currentTask.taskRef);
  const q = { taskRef:currentTask.taskRef, actionRef:capture.actionRef,
    claimRef:capture.claimRef, generationRef:capture.generationRef,
    executionRef:capture.executionRef, commandRef,
    expectedTaskVersion:currentTask.version, expectedAuthEpoch:currentTask.authEpoch };
  for (const key of ['taskRef','actionRef','claimRef','generationRef','executionRef','commandRef']) ref(q[key]);
  return Object.freeze(q);
}
export function executionIdentity(q) {
  return { taskRef:q.taskRef, actionRef:q.actionRef, claimRef:q.claimRef,
    generationRef:q.generationRef, executionRef:q.executionRef };
}
export function command(value, q, expectedState) {
  keys(value, ['state','request','ownerRequestDigest','settlement']);
  assert.equal(value.state, expectedState);
  if (expectedState === 'unreceived' || expectedState === 'legacy_unrestorable') {
    assert.equal(value.request, null); assert.equal(value.ownerRequestDigest, null);
    assert.equal(value.settlement, null); return;
  }
  keys(value.request, ['taskRef','actionRef','claimRef','generationRef','executionRef','commandRef','expectedTaskVersion','expectedAuthEpoch']);
  assert.deepEqual(value.request, q); ref(value.ownerRequestDigest);
  if (expectedState === 'intent_committed') assert.equal(value.settlement, null);
  else settlement(value.settlement, q);
}
export function settlement(value, q) {
  keys(value, ['task','claimRef','reservationRef','reservationHeld','outcome'], ['terminalEvidenceRef','releaseEvidenceRef']);
  task(value.task); assert.equal(value.task.taskRef, q.taskRef);
  assert.equal(value.claimRef, q.claimRef); ref(value.reservationRef);
  assert.equal(typeof value.reservationHeld, 'boolean');
  assert(['completed','failed','unknown','terminated'].includes(value.outcome));
  if (value.terminalEvidenceRef !== undefined) ref(value.terminalEvidenceRef);
  if (value.releaseEvidenceRef !== undefined && value.releaseEvidenceRef !== null) ref(value.releaseEvidenceRef);
}
export function commandIndex(value, q, state) {
  keys(value, ['commands']); assert(Array.isArray(value.commands)); assert(value.commands.length <= 16);
  for (const row of value.commands) {
    keys(row, ['commandRef','state']); ref(row.commandRef);
    assert(['intent_committed','finish_committed','legacy_unrestorable'].includes(row.state));
  }
  const ids = value.commands.map(row => row.commandRef);
  assert.deepEqual(ids, [...ids].sort()); assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(value.commands.filter(row => row.commandRef === q.commandRef), [{commandRef:q.commandRef,state}]);
}
export function unchangedSnapshot(before, after) {
  // Preserve every public field. observedAt is the read clock, not durable state.
  uint(before.observedAt); uint(after.observedAt); assert(after.observedAt >= before.observedAt);
  const left = structuredClone(before), right = structuredClone(after);
  left.observedAt = 0; right.observedAt = 0; assert.deepEqual(right, left);
}
export function noNativeDelta(trace, before) { assert.deepEqual(trace.counts(), before); }
export function stableRefusal(call, code) {
  let caught;
  try { call(); } catch (error) { caught = error; }
  assert(caught, 'Expected one public refusal'); assert.equal(caught.code, code);
  return {code}; // Never serialize the original error or payload.
}
