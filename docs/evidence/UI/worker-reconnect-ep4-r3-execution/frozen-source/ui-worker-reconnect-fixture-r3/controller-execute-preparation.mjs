import assert from 'node:assert/strict';
import {DTO} from './support/public-dtos.mjs';
import {createModelFixture} from './support/public-model-fixture.mjs';

// Four sealed independent public-flow cells. These exports do not execute on import.
// EP03 deliberately chooses ONLY the null-detail representative, not the separate stale-version cell.
const expected={EP01:{S:5,R:16,E:1},EP02:{S:5,R:16,E:1},EP03:{S:4,R:13,E:0},EP04:{S:5,R:16,E:1}};

async function EP01(f) {
  const pending=f.track(f.workerModel.execute());
  const entered=await f.wait(f.carrier.executeEntered.promise);
  f.assertCounts(5,12,1); assert.equal(entered.taskRef,DTO.references.taskA);
  // A labelled complete store stimulus plus the declared public lifecycle method.
  // The standalone model does not subscribe to generation; this is not Apply/native proof.
  f.generation.publish(undefined);
  f.workerModel.disconnected(); f.taskModel.disconnected();
  f.state.publish('connecting');
  assert.equal(entered.signal.aborted,true); f.assertUnknown();
  assert.equal(f.workerModel.getSnapshot().phase,'offline');
  assert.equal(f.workerModel.getSnapshot().grant,null); assert.equal(f.workerModel.getSnapshot().actionPreview,null);
  f.carrier.executeReply.reject(new Error('UNIT_ONLY_REPLY_LOST'));
  assert.equal(await f.wait(pending),false); f.assertCounts(5,12,1);
  f.state.publish('connected'); assert.equal(f.generation.getSnapshot(),undefined);
  f.generation.publish(f.G2);
  await f.wait(f.track(f.taskModel.refresh()));
  assert.equal(await f.wait(f.track(f.workerModel.refresh())),true);
  assert.equal(await f.wait(f.track(f.workerModel.query())),true);
  f.assertCounts(5,16,1); f.assertUnknown();
  const recovered=f.workerModel.getSnapshot();
  assert.equal(recovered.phase,'ready'); assert.equal(recovered.stale,false); assert.equal(recovered.worker.phase,'ready'); assert.equal(recovered.execution,null);
  for (let i=0;i<3;i++) assert.equal(await f.wait(f.track(f.workerModel.execute())),false);
  f.assertCounts(5,16,1); f.assertUnknown();
  assert.equal(f.carrier.commands().length,5); assert.equal(f.dependencies().uuidCalls,5);
}

async function EP02(f) {
  const pending=f.track(f.workerModel.execute());
  const entered=await f.wait(f.carrier.executeEntered.promise); f.assertCounts(5,12,1);
  // Switching selection invalidates the entered request before its lost reply settles.
  await f.wait(f.track(f.taskModel.select(DTO.references.taskB)));
  assert.equal(entered.signal.aborted,true); f.assertUnknown();
  assert.equal(f.taskModel.getSnapshot().detail.task.taskRef,DTO.references.taskB);
  f.carrier.executeReply.reject(new Error('UNIT_ONLY_REPLY_LOST'));
  assert.equal(await f.wait(pending),false);
  assert.equal(await f.wait(f.track(f.workerModel.refresh())),true); f.assertCounts(5,14,1);
  assert.equal(await f.wait(f.track(f.workerModel.execute())),false); f.assertUnknown();
  await f.wait(f.track(f.taskModel.select(DTO.references.taskA)));
  assert.equal(await f.wait(f.track(f.workerModel.refresh())),true); f.assertCounts(5,16,1);
  for (let i=0;i<2;i++) assert.equal(await f.wait(f.track(f.workerModel.execute())),false);
  f.assertUnknown(); f.assertCounts(5,16,1);
  assert.equal(f.taskModel.getSnapshot().detail.task.taskRef,DTO.references.taskA);
  assert.equal(f.workerModel.getSnapshot().action,null); assert.equal(f.workerModel.getSnapshot().worker,null);
  assert.equal(f.carrier.enteredExecute.taskRef,DTO.references.taskA); assert.equal(f.carrier.commands().length,5); assert.equal(f.dependencies().uuidCalls,5);
}

async function EP03(f) {
  const pending=f.track(f.workerModel.execute());
  await f.wait(f.digestEntered.promise); f.assertCounts(4,12,0);
  const status=f.carrier.holdNextStatus();
  const selection=f.track(f.taskModel.select(DTO.references.taskA));
  assert.equal(f.taskModel.getSnapshot().detail,null); assert.equal(f.taskModel.getSnapshot().stale,true);
  await f.wait(status.entered.promise); f.assertCounts(4,13,0);
  f.digestReply.resolve(f.digestValue());
  assert.equal(await f.wait(pending),false);
  assert.equal(f.workerModel.getSnapshot().uncertain,null); assert.equal(f.workerModel.getSnapshot().uncertainTaskRef,null);
  assert.equal(f.carrier.enteredExecute,null); assert.equal(f.workerModel.getSnapshot().execution,null);
  for (let i=0;i<2;i++) assert.equal(await f.wait(f.track(f.workerModel.execute())),false);
  f.assertCounts(4,13,0); assert.equal(f.carrier.commands().length,4);
  assert.equal(f.dependencies().digestCalls,5); assert.equal(f.dependencies().uuidCalls,5);
  assert.equal(f.workerModel.getSnapshot().actionPreview,null); assert.equal(f.workerModel.getSnapshot().grant,null);
  status.reply.resolve(f.carrier.currentStatus(DTO.references.taskA));
  await f.wait(selection);
  assert.equal(f.taskModel.getSnapshot().detail.task.taskRef,DTO.references.taskA);
  f.assertCounts(4,13,0); assert.equal(f.workerModel.getSnapshot().uncertain,null);
}

async function EP04(f) {
  const acknowledged=await f.wait(f.track(f.workerModel.execute()));
  assert.equal(acknowledged,true,'schema-valid acknowledgement is not effect settlement');
  f.assertCounts(5,14,1); f.assertUnknown();
  const initial=f.workerModel.getSnapshot(),execution=initial.execution;
  assert.equal(execution.state,'unknown'); assert.equal(execution.cursor,null); assert.equal(execution.resultDigest,null);
  assert.deepEqual(execution.usage,{state:'unknown',units:null,accounting:null});
  assert.equal(await f.wait(f.track(f.workerModel.refresh())),true);
  assert.equal(await f.wait(f.track(f.workerModel.query())),true); f.assertCounts(5,16,1); f.assertUnknown();
  assert.equal(f.workerModel.getSnapshot().execution,execution,'ready query cannot replace unknown execution');
  assert.equal(await f.wait(f.track(f.workerModel.prepareContext())),false);
  assert.equal(await f.wait(f.track(f.workerModel.plan())),false);
  f.assertCounts(5,16,1); f.assertUnknown();
  const final=f.workerModel.getSnapshot();
  assert.equal(final.contextRecordRef,initial.contextRecordRef); assert.equal(final.action,initial.action); assert.equal(final.execution,execution);
  assert.equal(final.worker.phase,'ready'); assert.equal(f.carrier.commands().length,5); assert.equal(f.dependencies().uuidCalls,5);
}

const cells={EP01,EP02,EP03,EP04};
export const caseIds=Object.freeze(Object.keys(cells));
export async function runExecutePreparationCase(caseId,signal) {
  assert.ok(Object.hasOwn(cells,caseId));
  const f=createModelFixture(caseId,signal);
  let failure,cleanup;
  try { await f.prepare(); await cells[caseId](f); }
  catch (error) { failure=error; }
  try { cleanup=await f.cleanup(); } catch (error) { failure ??= error; }
  if (failure) {
    failure.unitEvidence={caseId,classification:'UNIT_ONLY_PUBLIC_MODEL',counts:f.carrier.counts(),carrierTrace:f.carrier.trace(),publicSnapshotTrace:f.traces(),barriers:f.carrier.barrierInventory(),cleanup:cleanup??null,actualHostProof:false};
    throw failure;
  }
  const counts=f.carrier.counts(),bounds=expected[caseId];
  assert.equal(counts.S,bounds.S); assert.equal(counts.R,bounds.R); assert.equal(counts.E,bounds.E);
  return Object.freeze({caseId,classification:'UNIT_ONLY_PUBLIC_MODEL',result:'UNIT_CASE_PASSED',counts,cleanup,carrierTrace:f.carrier.trace(),publicSnapshotTrace:f.traces(),nativeEffects:0,modelInference:0,network:0,actualHostProof:false});
}
