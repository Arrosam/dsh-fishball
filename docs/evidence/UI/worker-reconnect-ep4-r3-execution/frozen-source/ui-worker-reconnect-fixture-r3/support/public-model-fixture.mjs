import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DTO} from './public-dtos.mjs';
import {modelOnlyRequire} from './model-only-react.mjs';
import {createPublicCarrier} from './public-carrier.mjs';
import {deferred, waitFor, cleanupWithin} from './finite-deferred.mjs';

const candidateURL = new URL('../candidate/client-entry.cjs',import.meta.url);
export const candidateSHA256 = '4ba377f9973eddd6d1aebe66e014370f9f8ff7b1392b95528a51790040fd9e82';
export function loadModelOnlyClient() {
  assert.equal(createHash('sha256').update(readFileSync(candidateURL)).digest('hex'),candidateSHA256,'complete r2 source pin');
  const clientFactory = createRequire(import.meta.url)(candidateURL.pathname);
  assert.equal(typeof clientFactory,'function');
  return clientFactory(modelOnlyRequire); // Callable public require, never {React} shorthand.
}

export function unitStore(initial) {
  let snapshot=initial;
  const listeners=new Set(),events=[];
  return Object.freeze({
    getSnapshot:()=>snapshot,
    subscribe(listener) { listeners.add(listener); return ()=>listeners.delete(listener); },
    publish(value) { if (Object.is(value,snapshot)) return; snapshot=value; events.push(value); for (const listener of [...listeners]) listener(); },
    eventCount:()=>events.length, listenerCount:()=>listeners.size,
  });
}

const observeWorker = snapshot => Object.freeze({phase:snapshot.phase,busy:snapshot.busy,stale:snapshot.stale,uncertain:snapshot.uncertain,uncertainTaskRef:snapshot.uncertainTaskRef,taskRef:snapshot.taskRef,workerPhase:snapshot.worker?.phase??null,executionState:snapshot.execution?.state??null,grantPresent:!!snapshot.grant,actionPreviewPresent:!!snapshot.actionPreview,actionAccepted:snapshot.actionAccepted,error:snapshot.error});
const observeTask = snapshot => Object.freeze({selected:snapshot.selected,phase:snapshot.phase,stale:snapshot.stale,taskRef:snapshot.detail?.task.taskRef??null,version:snapshot.detail?.task.version??null,authEpoch:snapshot.detail?.task.authEpoch??null});

export function createModelFixture(caseId, signal) {
  const client=loadModelOnlyClient(),carrier=createPublicCarrier(caseId),promises=[],workerTrace=[],taskTrace=[];
  const digestEntered=deferred(`${caseId}:execute-digest-entered`),digestReply=deferred(`${caseId}:execute-digest-reply`);
  let uuidCalls=0,digestCalls=0,cleaned=false;
  const options={clock:()=>DTO.clock,uuid:()=>`UNIT_ONLY/${caseId}/command/${++uuidCalls}`,async digest(text) {
    digestCalls++;
    const value=createHash('sha256').update(text).digest('hex');
    if (caseId === 'EP03' && digestCalls === 5) { digestEntered.resolve({call:digestCalls}); return await digestReply.promise; }
    return value;
  }};
  // Only original declared constructor options. No model hydration or connection argument.
  const taskModel=client.createModel(carrier.rpc,options),workerModel=client.createWorkerModel(carrier.rpc,taskModel,options);
  const unsubscribeWorker=workerModel.subscribe(()=>workerTrace.push(observeWorker(workerModel.getSnapshot())));
  const unsubscribeTask=taskModel.subscribe(()=>taskTrace.push(observeTask(taskModel.getSnapshot())));
  const G1=Object.freeze({id:1,host:Object.freeze({home:'/tmp/UNIT_ONLY/df-ui-worker-r2'})}),G2=Object.freeze({id:2,host:Object.freeze({home:'/tmp/UNIT_ONLY/df-ui-worker-r2'})});
  const state=unitStore('connected'),generation=unitStore(G1);
  const track = promise => { promises.push(promise); promise.catch(()=>{}); return promise; };
  const wait = promise => waitFor(promise,signal);
  function assertCounts(S,R,E=0) {
    const n=carrier.counts(); assert.equal(n.S,S); assert.equal(n.P,Math.min(S,4)); assert.equal(n.E,E); assert.equal(n.C,0); assert.equal(n.R,R); assert.equal(n.unexpected,0);
  }
  function assertUnknown() {
    const snapshot=workerModel.getSnapshot();
    assert.equal(snapshot.uncertain,'workerExecute'); assert.equal(snapshot.uncertainTaskRef,DTO.references.taskA);
    assert.equal(snapshot.capture,null); assert.equal(snapshot.result,null);
    assert.equal(workerModel.canGrant(),false); assert.equal(workerModel.canCreate(),false);
  }
  async function prepare() {
    await wait(track(taskModel.refresh()));
    assert.equal(taskModel.getSnapshot().detail?.task.taskRef,DTO.references.taskA);
    assert.equal(await wait(track(workerModel.refresh())),true); assertCounts(0,3);
    assert.equal(await wait(track(workerModel.prepareContext())),true); assertCounts(1,5);
    assert.equal(taskModel.getSnapshot().detail.task.version,2); assert.equal(taskModel.getSnapshot().detail.task.authEpoch,0);
    assert.equal(await wait(track(workerModel.plan())),true); assertCounts(2,7);
    assert.equal(await wait(track(workerModel.previewAction())),true); assertCounts(2,8);
    const preview=workerModel.getSnapshot().actionPreview;
    assert.equal(preview.previewRef,DTO.references.preview);
    assert.equal(workerModel.setActionAccepted(true,preview.previewRef),true);
    assert.equal(workerModel.canGrant(),true);
    assert.equal(await wait(track(workerModel.grant(DTO.grantExpiresAt,preview.previewRef))),true); assertCounts(3,10);
    assert.equal(taskModel.getSnapshot().detail.task.version,2); assert.equal(taskModel.getSnapshot().detail.task.authEpoch,1);
    assert.equal(workerModel.canCreate(),true);
    assert.equal(await wait(track(workerModel.create())),true); assertCounts(4,12);
    assert.equal(workerModel.getSnapshot().worker.phase,'ready'); assert.equal(workerModel.getSnapshot().execution,null); assert.equal(workerModel.getSnapshot().uncertain,null);
    assert.equal(uuidCalls,4); assert.equal(digestCalls,4);
  }
  async function cleanup() {
    assert.equal(cleaned,false); cleaned=true;
    const before=carrier.counts();
    unsubscribeWorker(); unsubscribeTask();
    workerModel.dispose(); taskModel.dispose();
    const finalSnapshot=workerModel.getSnapshot(),workerNotifications=workerTrace.length,taskNotifications=taskTrace.length;
    carrier.close(); digestEntered.close(); digestReply.close();
    await cleanupWithin(Promise.allSettled(promises));
    await Promise.resolve();
    assert.deepEqual(carrier.counts(),before,'cleanup has zero new carrier entries');
    assert.equal(workerModel.getSnapshot(),finalSnapshot,'disposed model rejects late publication');
    assert.equal(workerTrace.length,workerNotifications); assert.equal(taskTrace.length,taskNotifications);
    assert.equal(state.listenerCount(),0); assert.equal(generation.listenerCount(),0);
    for (const barrier of [...carrier.barrierInventory(),{label:digestEntered.label,settled:digestEntered.settled,releases:digestEntered.releases},{label:digestReply.label,settled:digestReply.settled,releases:digestReply.releases}]) { assert.equal(barrier.settled,true); assert.equal(barrier.releases,1); }
    return {zeroNewEntries:true,disposedSnapshotStable:true,allBarriersReleasedOnce:true};
  }
  return Object.freeze({caseId,carrier,taskModel,workerModel,state,generation,G1,G2,track,wait,prepare,assertCounts,assertUnknown,digestEntered,digestReply,
    digestValue:() => createHash('sha256').update(`UNIT_ONLY/${caseId}/command/5`).digest('hex'),
    dependencies:()=>({uuidCalls,digestCalls}),traces:()=>({worker:[...workerTrace],task:[...taskTrace]}),cleanup});
}
