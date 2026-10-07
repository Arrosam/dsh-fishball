// SOURCE ONLY. Root must review/freeze genuine original setup before any import.
import assert from 'node:assert/strict';

export function keys(value, required, optional = []) {
  assert(value !== null && typeof value === 'object');
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  const actual = Reflect.ownKeys(value);
  assert(actual.every(key => typeof key === 'string'));
  assert(actual.every(key => [...required, ...optional].includes(key)));
  for (const key of required) assert(actual.includes(key));
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert(Object.hasOwn(descriptor, 'value'));
    assert(!Object.hasOwn(descriptor, 'get') && !Object.hasOwn(descriptor, 'set'));
    assert.equal(descriptor.enumerable, true);
  }
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

// Pure window oracle only. Prefix equality is evidence of array consistency;
// actual boundary capture and original host authority remain root prerequisites.
export function resumeEventWindow(rows, preResumePrefix, preExecutePrefix, expected) {
  for (const list of [rows,preResumePrefix,preExecutePrefix]) {
    assert(Array.isArray(list) && list.length <= 32);
    for (const row of list) {
      const kindDescriptor = Object.getOwnPropertyDescriptor(row, 'kind');
      assert(kindDescriptor && Object.hasOwn(kindDescriptor, 'value'));
      const kind = kindDescriptor.value;
      if (kind === 'modelStreams') keys(row, ['kind']);
      else if (kind === 'sessionCreated' || kind === 'sessionDisposed') keys(row, ['kind','sessionId']);
      else if (kind === 'agentCreated') keys(row, ['kind','agentId','sessionId','source']);
      else if (kind === 'agentDisposed') keys(row, ['kind','agentId','sessionId']);
      else assert.fail('Unknown natural trace row');
    }
  }
  keys(expected, ['nativeAgentId','nativeSessionId']);
  for (const id of Object.values(expected)) assert(typeof id === 'string' && id.length > 0);
  assert(preResumePrefix.length < preExecutePrefix.length);
  assert(preExecutePrefix.length <= rows.length);
  assert.deepEqual(preResumePrefix, rows.slice(0, preResumePrefix.length));
  assert.deepEqual(preExecutePrefix, rows.slice(0, preExecutePrefix.length));
  const suffix = rows.slice(preResumePrefix.length);
  const beforeExecute = rows.slice(preResumePrefix.length, preExecutePrefix.length);
  const afterExecute = rows.slice(preExecutePrefix.length);
  const announcements = suffix.filter(row => row.kind === 'sessionCreated');
  const publications = suffix.filter(row => row.kind === 'agentCreated');
  assert.equal(announcements.length, 1); assert.equal(publications.length, 1);
  assert.equal(announcements[0].sessionId, expected.nativeSessionId);
  assert.equal(publications[0].agentId, expected.nativeAgentId);
  assert.equal(publications[0].sessionId, expected.nativeSessionId);
  assert.equal(publications[0].source, 'resume');
  const announcedAt = beforeExecute.indexOf(announcements[0]);
  const publishedAt = beforeExecute.indexOf(publications[0]);
  assert(announcedAt >= 0 && announcedAt < publishedAt);
  assert.equal(beforeExecute.filter(row => row.kind === 'modelStreams').length, 0);
  assert.equal(afterExecute.filter(row => row.kind === 'modelStreams').length, 1);
}
