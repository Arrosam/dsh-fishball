import assert from 'node:assert/strict';
import {DTO,clone,ok} from '../ui-worker-reconnect-fixture-r2/support/public-dtos.mjs';
import {createApplyFixture,G1,G2,setupReady,setupUnavailable} from './support/apply-public-face.mjs';

const currentWorker=label=>({...clone(DTO.workerStatus),selection:{...DTO.workerStatus.selection,model:label}});
const expectedR={AP01:3,WC04:3,WC06:4,WC08:4,WC11:6,WC12:6,WC13:6,WC15:3,WC22:6,WC24:4,WC29:3};

// AP01 is the root-requested joint ordering supplement. It does NOT close WC02's
// independently preserved original-service oracle or invent another service owner.
async function AP01(f) {
  assert.equal(f.models.workerModel.getSnapshot().phase,'offline');assert.equal(f.counts().R,0);
  f.state.publish('connected'); await f.quiescent();
  assert.equal(f.counts().R,0,'connected alone does not schedule readonly recovery');
  assert.equal(f.models.workerModel.getSnapshot().phase,'offline');
  f.generation.publish(G1); f.reset(); // Original success ordering + subsequent reset in one public turn.
  await f.until(f.fresh);await f.quiescent();
  assert.equal(f.counts().R,3);assert.equal(f.counts().resetInputs,1);
  assert.deepEqual(f.trace().map(row=>`${row.channel}:${row.method}`),['/df-setup:v1/status','/df-rpc:v1/list','/df-setup:v1/workerStatus']);
  assert.equal(f.models.workerModel.getSnapshot().phase,'ready');f.assertNoAuthority();
}
async function WC04(f) {
  await f.until(f.fresh);assert.equal(f.counts().R,3);
  for(let i=0;i<3;i++){assert.equal(f.state.getSnapshot(),'connected');assert.equal(f.generation.getSnapshot(),G1);}
  await f.quiescent();assert.equal(f.counts().resetInputs,0);f.assertNoAuthority();
}
async function WC06(f) {
  await f.until(()=>f.models.setupModel.getSnapshot().phase==='unavailable' && !f.models.setupModel.getSnapshot().busy);
  assert.equal(f.counts().R,1);assert.equal(f.models.workerModel.getSnapshot().phase,'offline');
  const generation=f.generation.getSnapshot();
  assert.equal(await f.wait(f.models.setupModel.refresh()),true);await f.until(f.fresh);await f.quiescent();
  assert.equal(f.generation.getSnapshot(),generation);assert.equal(f.counts().R,4);f.assertNoAuthority();
}
async function WC08(f) {
  await f.until(f.fresh);const held=f.holdNextWorker();
  const pending=f.models.workerModel.refresh();const entered=await f.wait(held.entered.promise);
  f.generation.publish(undefined);assert.equal(f.state.getSnapshot(),'connected');
  assert.equal(entered.signal.aborted,true);assert.equal(f.models.workerModel.getSnapshot().phase,'offline');
  held.reply.resolve(ok(DTO.workerStatus));assert.equal(await f.wait(pending),false);await f.quiescent();
  assert.equal(f.models.workerModel.getSnapshot().phase,'offline');assert.equal(f.models.workerModel.getSnapshot().stale,true);f.assertNoAuthority();
}
async function WC11(f) {
  const entered=await f.wait(f.initialHold.entered.promise);assert.equal(f.counts().R,3);
  f.generation.publish(undefined);f.state.publish('connecting');assert.equal(entered.signal.aborted,true);
  f.setWorkerRow(currentWorker('UNIT_ONLY-current-G2'));
  f.state.publish('connected');f.generation.publish(G2);f.reset();
  await f.until(f.fresh);
  f.initialHold.reply.resolve(ok(currentWorker('UNIT_ONLY-late-G1')));await f.quiescent();
  assert.equal(f.models.workerModel.getSnapshot().status.selection.model,'UNIT_ONLY-current-G2');assert.equal(f.generation.getSnapshot(),G2);f.assertNoAuthority();
}
async function WC12(f) {
  const entered=await f.wait(f.initialHold.entered.promise);assert.equal(f.counts().R,3);
  for(let i=0;i<8;i++)f.reset(); // Exactly eight external inputs; never self-generated.
  assert.equal(entered.signal.aborted,true);await f.until(f.fresh);
  f.initialHold.reply.resolve(ok(DTO.workerStatus));await f.quiescent();
  assert.equal(f.counts().resetInputs,8);assert.equal(f.counts().R,6);f.assertNoAuthority();
}
async function WC13(f) {
  const entered=await f.wait(f.initialHold.entered.promise);assert.equal(f.counts().R,3);
  assert.equal(G1.host,G2.host);assert.notEqual(G1.id,G2.id);
  f.setWorkerRow(currentWorker('UNIT_ONLY-current-G2'));f.generation.publish(G2);f.reset();
  assert.equal(entered.signal.aborted,true);await f.until(f.fresh);
  const current=f.models.workerModel.getSnapshot();
  f.initialHold.reply.resolve(ok(currentWorker('UNIT_ONLY-late-G1')));await f.quiescent();
  assert.equal(f.models.workerModel.getSnapshot(),current);assert.equal(current.status.selection.model,'UNIT_ONLY-current-G2');f.assertNoAuthority();
}
async function WC15(f) {
  const entered=await f.wait(f.initialHold.entered.promise);assert.equal(f.counts().R,3);
  f.generation.publish(undefined);assert.equal(entered.signal.aborted,true);
  f.initialHold.reply.resolve(ok(DTO.workerStatus));await f.quiescent();
  assert.equal(f.models.workerModel.getSnapshot().phase,'offline');assert.equal(f.models.workerModel.getSnapshot().stale,true);f.assertNoAuthority();
}
async function WC22(f) {
  await f.until(f.fresh);assert.equal(f.models.workerModel.getSnapshot().phase,'needs_policy');f.assertNoAuthority();
  f.reset();await f.until(f.fresh);await f.quiescent();
  assert.equal(f.models.workerModel.getSnapshot().phase,'needs_policy');assert.equal(f.models.workerModel.canConfirmPolicy(),false);f.assertNoAuthority();
}
async function WC24(f) {
  await f.until(()=>f.models.workerModel.getSnapshot().phase==='unavailable' && !f.models.workerModel.getSnapshot().busy);
  assert.equal(f.models.workerModel.getSnapshot().error,'WORKER_CATALOG_UNAVAILABLE');assert.equal(f.models.workerModel.getSnapshot().stale,true);
  const generation=f.generation.getSnapshot();f.setWorkerRow(DTO.workerStatus);
  assert.equal(await f.wait(f.models.workerModel.refresh()),true);await f.quiescent();
  assert.equal(f.models.workerModel.getSnapshot().phase,'ready');assert.equal(f.models.workerModel.getSnapshot().error,null);assert.equal(f.state.getSnapshot(),'connected');assert.equal(f.generation.getSnapshot(),generation);f.assertNoAuthority();
}
async function WC29(f) {
  const entered=await f.wait(f.initialHold.entered.promise);assert.equal(f.counts().R,3);
  f.disposeOwner();assert.equal(entered.signal.aborted,true);
  const snapshot=f.models.workerModel.getSnapshot();
  f.state.publish('connecting');f.generation.publish(undefined);f.state.publish('connected');f.generation.publish(G2);f.reset();
  f.initialHold.reply.resolve(ok(DTO.workerStatus));await f.quiescent();
  assert.equal(f.models.workerModel.getSnapshot(),snapshot);assert.equal(f.counts().R,3);assert.equal(f.state.listenerCount(),0);assert.equal(f.generation.listenerCount(),0);
}

const cells={AP01,WC04,WC06,WC08,WC11,WC12,WC13,WC15,WC22,WC24,WC29};
export const caseIds=Object.freeze(Object.keys(cells));
export async function runApplyReadonlyCase(caseId,signal) {
  assert.ok(Object.hasOwn(cells,caseId));
  const options={};
  if(caseId==='AP01'){options.initialState=undefined;options.initialGeneration=undefined;}
  if(caseId==='WC06')options.setupRows=[setupUnavailable,setupReady];
  if(['WC11','WC12','WC13','WC15','WC29'].includes(caseId))options.holdInitialWorker=true;
  if(caseId==='WC12')options.maxR=27;
  if(caseId==='WC22')options.workerRow={...clone(DTO.workerStatus),phase:'needs_policy',actionsEnabled:false,policyVersion:null,configurationRef:null,reasonCode:'WORKER_POLICY_REQUIRED'};
  if(caseId==='WC24')options.workerRow={ok:false,error:{code:'WORKER_CATALOG_UNAVAILABLE'}};
  const f=createApplyFixture(caseId,signal,options);let failure,cleanup;
  try{await cells[caseId](f);assert.equal(f.counts().R,expectedR[caseId]);assert.equal(f.counts().M,0);}
  catch(error){failure=error;}
  try{cleanup=await f.cleanup();}catch(error){failure??=error;}
  const evidence={caseId,classification:'UNIT_ONLY_UNCHANGED_APPLY_MODEL',counts:f.counts(),carrierTrace:f.trace(),publicSnapshotTrace:f.publicTrace(),contextDisposal:f.ownerInventory(),barriers:f.barriers(),cleanup:cleanup??null,actualOriginalServiceProof:false,actualRenderedUIProof:false};
  if(failure){failure.unitEvidence=evidence;throw failure;}
  return Object.freeze({...evidence,result:'UNIT_SUBPARTITION_PASSED',fullFamilyAcceptance:'HOLD',nativeEffects:0,modelInference:0,network:0});
}
