// SOURCE ONLY. No constructors, authority minting, mocks, RPC callbacks or runner.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RuntimeStore } from '../ni6-runtime-composition-r4/src/runtime-store.mjs';
import { MemoryAdapter } from '../ni6-runtime-composition-r4/src/memory.mjs';
import { WorkerManager } from '../ni6-runtime-composition-r4/src/worker.mjs';
import { keys, ref, uint, task, qFromCapture, executionIdentity, command,
  commandIndex, unchangedSnapshot, noNativeDelta, stableRefusal } from './public-oracles.mjs';

function genuine(value, type, methods) {
  assert.equal(Object.getPrototypeOf(value), type.prototype);
  for (const name of methods) assert.equal(value[name], type.prototype[name]);
}
function core(store) {
  genuine(store, RuntimeStore, ['task','snapshot','readPreparedContextCheck',
    'recordOwnerNativeFinishIntent','readOwnerNativeFinishCommand','listOwnerNativeFinishCommands',
    'readNormalNativeArtifact','readNormalNativeAuditResult','readNormalNativeFinish','readData']);
}

export async function currentPreparation({store, owner, memory, request, trace}) {
  core(store); genuine(memory, MemoryAdapter, ['prepareExecutionContext']);
  keys(request, ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','terms','now']);
  assert.deepEqual(request.terms, ['synthetic-continuation']);
  const initialTask = store.task(owner, request.taskRef); task(initialTask);
  assert.equal(request.expectedTaskVersion, initialTask.version);
  assert.equal(request.expectedAuthEpoch, initialTask.authEpoch);
  const nativeBefore = trace.counts();
  const receipt = await memory.prepareExecutionContext(request);
  keys(receipt, ['recordRef','digest','kind','byteLength','cryptoVersion','sourceRef','task',
    'sourceTaskVersion','sourceAuthEpoch','memory','inputCounts','retainedRefs','droppedRefs','verification']);
  ref(receipt.recordRef); ref(receipt.digest); ref(receipt.sourceRef); uint(receipt.byteLength);
  assert.equal(receipt.kind, 'context'); assert.equal(receipt.cryptoVersion, 2);
  assert.equal(receipt.verification, 'module_prepared_execution_context_only');
  assert.equal(receipt.sourceTaskVersion, initialTask.version); assert.equal(receipt.sourceAuthEpoch, initialTask.authEpoch);
  task(receipt.task); assert.equal(receipt.task.taskRef, initialTask.taskRef);
  keys(receipt.memory, ['namespaceRef','revision']); ref(receipt.memory.namespaceRef); uint(receipt.memory.revision);
  keys(receipt.inputCounts, ['bytes','tokens']); uint(receipt.inputCounts.bytes); uint(receipt.inputCounts.tokens);
  const current = store.task(owner, request.taskRef);
  const check = store.readPreparedContextCheck(owner, {taskRef:request.taskRef,contextRecordRef:receipt.recordRef,
    expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch});
  keys(check, ['check','currentness']);
  keys(check.check, ['contractVersion','checkRef','taskRef','contextRecordRef','contextDigest',
    'sourceTaskVersion','sourceAuthEpoch','committedTaskVersion','committedAuthEpoch','semanticRevision',
    'generatedAt','ledgerSnapshotDigest','memory','method','winningSources','summaryChecks','conflicts',
    'ownerRef','workspaceRef','commandRef','preparationPrincipalRef','preparationRequestDigest','selectionMode','checkedSetDigest']);
  assert.equal(check.check.contractVersion, 'df.prepared-context-check/v1');
  assert.equal(check.check.method, 'version-currentness/v1');
  assert.equal(check.check.contextDigest, receipt.digest);
  assert.equal(check.check.contextRecordRef, receipt.recordRef); assert.deepEqual(check.check.memory, receipt.memory);
  assert.equal(check.check.commandRef, request.commandRef);
  assert.equal(check.check.sourceTaskVersion, receipt.sourceTaskVersion);
  assert.equal(check.check.sourceAuthEpoch, receipt.sourceAuthEpoch);
  assert.equal(check.check.committedTaskVersion, current.version);
  assert.equal(check.check.committedAuthEpoch, current.authEpoch);
  assert.equal(check.check.ownerRef, current.ownerRef); assert.equal(check.check.workspaceRef, current.workspaceRef);
  const body = store.readData(owner, {taskRef:request.taskRef,recordRef:receipt.recordRef});
  assert.equal(body.kind, 'context'); assert.equal(body.digest, receipt.digest);
  assert.equal(Buffer.byteLength(body.content), receipt.byteLength);
  assert.equal(createHash('sha256').update(body.content).digest('hex'), receipt.digest);
  for (const list of [receipt.retainedRefs,receipt.droppedRefs]) {
    assert(Array.isArray(list) && list.length <= 64); for (const value of list) ref(value);
  }
  assert.deepEqual(check.currentness, {instructionsCurrent:true,memoryCurrent:true,taskSnapshotCurrent:true,reasonCodes:[]});
  const beforeDuplicate = store.snapshot(owner, {taskRef:request.taskRef});
  const duplicate = await memory.prepareExecutionContext(request);
  assert.deepEqual(duplicate, receipt);
  unchangedSnapshot(beforeDuplicate, store.snapshot(owner, {taskRef:request.taskRef}));
  noNativeDelta(trace, nativeBefore);
  return {receipt,check}; // Actual original DTOs, not a native admission receipt.
}

export function capturedOwnerIntent({store, owner, actualCoordinator, artifact, commandRef, staleVersionCommandRef, trace}) {
  core(store); ref(commandRef); ref(staleVersionCommandRef); assert.notEqual(commandRef, staleVersionCommandRef);
  keys(artifact, ['taskRef','artifactRef','version']);
  const current = store.task(owner, artifact.taskRef); task(current); assert(current.version > 1);
  const graph = store.readNormalNativeArtifact(owner, {...artifact,
    expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch});
  assert.equal(graph.outputCapture.purpose, 'producer'); assert.equal(graph.outputCapture.phase, 'output');
  assert.equal(graph.finish, null); assert.equal(graph.outputCapture.taskRef, current.taskRef);
  const q = qFromCapture(graph.outputCapture, current, commandRef), identity = executionIdentity(q);
  const before = store.snapshot(owner, {taskRef:q.taskRef}), nativeBefore = trace.counts();
  command(store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:q.commandRef}), q, 'unreceived');
  const first = store.recordOwnerNativeFinishIntent(owner, q); command(first, q, 'intent_committed');
  command(store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:q.commandRef}), q, 'intent_committed');
  const firstIndex = store.listOwnerNativeFinishCommands(owner, identity); commandIndex(firstIndex, q, 'intent_committed');
  unchangedSnapshot(before, store.snapshot(owner, {taskRef:q.taskRef}));
  const duplicate = store.recordOwnerNativeFinishIntent(owner, q); assert.deepEqual(duplicate, first);
  assert.deepEqual(store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:q.commandRef}), first);
  assert.deepEqual(store.listOwnerNativeFinishCommands(owner, identity), firstIndex);
  unchangedSnapshot(before, store.snapshot(owner, {taskRef:q.taskRef}));
  // actualCoordinator must be an existing original root-admitted coordinator;
  // no constructor, clone, payload role or fake authority is accepted here.
  for (const attempt of [
    () => store.recordOwnerNativeFinishIntent(actualCoordinator, q),
    () => store.readOwnerNativeFinishCommand(actualCoordinator, {taskRef:q.taskRef,commandRef:q.commandRef}),
    () => store.listOwnerNativeFinishCommands(actualCoordinator, identity),
  ]) {
    stableRefusal(attempt, 'UNAUTHORIZED');
    unchangedSnapshot(before, store.snapshot(owner, {taskRef:q.taskRef}));
    noNativeDelta(trace, nativeBefore);
  }
  const stale = Object.freeze({...q,commandRef:staleVersionCommandRef,expectedTaskVersion:q.expectedTaskVersion-1});
  stableRefusal(() => store.recordOwnerNativeFinishIntent(owner, stale), 'STALE_VERSION');
  command(store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:stale.commandRef}), stale, 'unreceived');
  assert.deepEqual(store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:q.commandRef}), first);
  assert.deepEqual(store.listOwnerNativeFinishCommands(owner, identity), firstIndex);
  unchangedSnapshot(before, store.snapshot(owner, {taskRef:q.taskRef})); noNativeDelta(trace, nativeBefore);
  return {q,command:first,commands:firstIndex}; // Intent remains pending; never stop or settle it here.
}

export function readActualHeldAuditCommand({store, owner, q, auditResultRef, trace}) {
  core(store); const before = store.snapshot(owner, {taskRef:q.taskRef}), nativeBefore = trace.counts();
  const stored = store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:q.commandRef});
  command(stored, q, 'finish_committed'); assert.equal(stored.settlement.reservationHeld, true);
  assert.equal(stored.settlement.releaseEvidenceRef, null);
  ref(auditResultRef);
  const current = store.task(owner, q.taskRef);
  const graph = store.readNormalNativeAuditResult(owner, {taskRef:q.taskRef,resultRef:auditResultRef,
    expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch});
  assert(['audit_review','audit_repair'].includes(graph.capture.purpose));
  for (const key of ['taskRef','actionRef','claimRef','generationRef','executionRef']) assert.equal(graph.capture[key], q[key]);
  assert(graph.finish); assert.equal(graph.finish.releaseState, 'held');
  assert.equal(graph.finish.releaseEvidenceRef, null);
  if (graph.capture.purpose === 'audit_repair') assert.equal(graph.finish.artifactCaptureRef, null);
  const original = store.readNormalNativeFinish(owner, q);
  assert(original); assert.deepEqual(original.receipt, stored.settlement);
  unchangedSnapshot(before, store.snapshot(owner, {taskRef:q.taskRef})); noNativeDelta(trace, nativeBefore);
  // This tests truthful held history only. Genuine review/repair capture and
  // absent report/fixed-artifact provenance stay IH02/IH03 prerequisites.
  return stored;
}

export async function cancelOwnReleasedDonor({store, owner, manager, input, q, trace}) {
  core(store); genuine(manager, WorkerManager, ['cancel']);
  keys(input, ['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch']);
  const current = store.task(owner, input.taskRef); task(current);
  assert.equal(input.expectedTaskVersion, current.version); assert.equal(input.expectedAuthEpoch, current.authEpoch);
  const old = store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:q.commandRef});
  command(old, q, 'finish_committed'); assert.equal(old.settlement.reservationHeld, false);
  assert.equal(input.taskRef, q.taskRef);
  const nativeBefore = trace.counts(); const result = await manager.cancel(owner, input);
  keys(result, ['receipt','workers']);
  assert.equal(result.receipt.control, 'cancel_requested'); assert.equal(result.receipt.cancellation, 'requested');
  assert.equal(result.receipt.task.status, 'cancel_requested'); assert.equal(result.receipt.reservationsHeld, 0);
  const after = store.snapshot(owner, {taskRef:input.taskRef}); assert.equal(after.control, 'cancel_requested');
  assert.deepEqual(store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:q.commandRef}), old);
  noNativeDelta(trace, nativeBefore);
  // Formerly approved workerResume refusal is separate IH03 transport scope;
  // no generic dispatch substitute is used to claim that denial boundary.
  return result;
}

export function readonlyCommandInNewProcess({store, owner, previousProcessId, previousCommand, q, trace}) {
  core(store); assert(Number.isSafeInteger(previousProcessId) && previousProcessId > 0);
  assert.notEqual(previousProcessId, process.pid); // Root must separately prove A exited and B is fresh.
  assert(['intent_committed','finish_committed'].includes(previousCommand.state));
  command(previousCommand, q, previousCommand.state);
  const before = store.snapshot(owner, {taskRef:q.taskRef}), nativeBefore = trace.counts();
  assert.deepEqual(nativeBefore, {sessionCreated:0,agentCreated:0,agentDisposed:0,sessionDisposed:0,modelStreams:0});
  const restored = store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:q.commandRef});
  assert.deepEqual(restored, previousCommand);
  const index = store.listOwnerNativeFinishCommands(owner, executionIdentity(q)); commandIndex(index, q, previousCommand.state);
  if (restored.state === 'finish_committed') {
    const original = store.readNormalNativeFinish(owner, q); assert(original); assert.deepEqual(original.receipt, restored.settlement);
  }
  assert.deepEqual(store.readOwnerNativeFinishCommand(owner, {taskRef:q.taskRef,commandRef:q.commandRef}), restored);
  unchangedSnapshot(before, store.snapshot(owner, {taskRef:q.taskRef})); noNativeDelta(trace, nativeBefore);
  return {command:restored,commands:index};
}
