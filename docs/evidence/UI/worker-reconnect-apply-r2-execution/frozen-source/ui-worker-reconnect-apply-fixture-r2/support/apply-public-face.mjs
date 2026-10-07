import assert from 'node:assert/strict';
import {DTO,clone,ok} from '../../ui-worker-reconnect-fixture-r2/support/public-dtos.mjs';
import {loadModelOnlyClient,unitStore} from '../../ui-worker-reconnect-fixture-r2/support/public-model-fixture.mjs';
import {deferred,waitFor,cleanupWithin} from '../../ui-worker-reconnect-fixture-r2/support/finite-deferred.mjs';

export const G1=Object.freeze({id:1,host:Object.freeze({home:'/tmp/UNIT_ONLY/df-ui-worker-r2'})});
export const G2=Object.freeze({id:2,host:G1.host});
export const setupReady=Object.freeze({phase:'ready',executionEnabled:false,storage:Object.freeze({location:'/tmp/UNIT_ONLY/df-ui-worker-r2/storage'})});
export const setupUnavailable=Object.freeze({...setupReady,phase:'unavailable',reasonCode:'SETUP_UNAVAILABLE'});

// Exact synchronous subset consumed by unchanged r2 Apply. Already-declared slots
// run inject synchronously. This is a UNIT_ONLY context face, never original Cordis.
function publicContext(connection) {
  let active=true,models=null,resetListener=null;
  const disposers=[],disposalTrace=[],registrations=[];
  function owned(dispose,label) {
    assert.equal(typeof dispose,'function'); let released=false;
    const once=()=>{ if(released)return; released=true; disposalTrace.push(label); dispose(); };
    disposers.push(once); return once;
  }
  const ctx={connection,layout:Object.freeze({fixtureOnly:true}),
    effect(body,label) { assert.equal(active,true); return owned(body(),label); },
    on(name,listener) { assert.equal(active,true); assert.equal(name,'connection/reset'); assert.equal(resetListener,null); resetListener=listener; return owned(()=>{resetListener=null;},'connection/reset listener'); },
    slots:{
      inject(name,callback) { assert.equal(active,true); assert.ok(['main','sidebar.panellist'].includes(name)); return owned(callback(),`slot injection ${name}`); },
      register(options,component) {
        assert.equal(active,true); assert.equal(typeof component,'function'); registrations.push(options.name);
        if(options.name==='main') { assert.equal(options.key,'df'); assert.equal(models,null); models=options.inject(); }
        return owned(()=>{},`slot registration ${options.name}`);
      },
    },
  };
  return Object.freeze({ctx,getModels:()=>models,
    reset() { if(active && resetListener) resetListener(); },
    dispose() { if(!active)return; active=false; for(const release of [...disposers].reverse())release(); },
    inventory:()=>({active,resetListenerPresent:!!resetListener,registeredSlots:[...registrations],disposalTrace:[...disposalTrace]}),
  });
}

export function createApplyFixture(caseId,signal,options={}) {
  const {setupRows=[setupReady],workerRow=DTO.workerStatus,holdInitialWorker=false,maxR=6}=options;
  const initialState=Object.hasOwn(options,'initialState')?options.initialState:'connected';
  const initialGeneration=Object.hasOwn(options,'initialGeneration')?options.initialGeneration:G1;
  const client=loadModelOnlyClient(),state=unitStore(initialState),generation=unitStore(initialGeneration);
  let R=0,M=0,unexpected=0,worker=clone(workerRow),setupIndex=0,held=null,cleaned=false,resetInputs=0;
  const trace=[],barriers=[],pendingReplies=new Set(),publicTrace=[];
  const onEntry=new Set();
  function holdNextWorker() {
    assert.equal(held,null); const hold={entered:deferred(`${caseId}:worker-status-entered/${barriers.length}`),reply:deferred(`${caseId}:worker-status-reply/${barriers.length}`)};
    barriers.push(hold.entered,hold.reply); held=hold; return Object.freeze(hold);
  }
  const initialHold=holdInitialWorker?holdNextWorker():null;
  const rpc=Object.freeze({async call(channel,method,payload,transportSignal) {
    const route=`${channel}:${method}`,allowed=['/df-setup:v1/status','/df-rpc:v1/list','/df-setup:v1/workerStatus'].includes(route);
    if(allowed)R++; else { unexpected++; if(!['v1/status','v1/list','v1/workerStatus'].includes(method))M++; }
    trace.push(Object.freeze({classification:'UNIT_ONLY',entry:trace.length+1,channel,method,R,M,unexpected,signalPresent:transportSignal instanceof AbortSignal}));
    for(const listener of [...onEntry])listener();
    assert.ok(transportSignal instanceof AbortSignal); assert.deepEqual(payload,{}); assert.ok(allowed && R<=maxR && M===0 && unexpected===0,'readonly Apply carrier budget');
    if(route==='/df-setup:v1/status')return ok(setupRows[Math.min(setupIndex++,setupRows.length-1)]);
    if(route==='/df-rpc:v1/list')return ok([]); // No hidden status/detail/task-control/preparation.
    if(held) {
      const hold=held;held=null;hold.entered.resolve({signal:transportSignal}); pendingReplies.add(hold.reply.promise);
      try{return await hold.reply.promise;}finally{pendingReplies.delete(hold.reply.promise);}
    }
    return Object.hasOwn(worker,'ok')?clone(worker):ok(worker);
  }});
  const connection=Object.freeze({rpc,state,generation});
  const owner=publicContext(connection);
  // This executes the REAL unchanged public Apply, not a reconstructed scheduler.
  client.apply(owner.ctx);
  const models=owner.getModels(); assert.ok(models?.workerModel && models?.setupModel && models?.model);
  const observe=()=>publicTrace.push(Object.freeze({R,M,workerPhase:models.workerModel.getSnapshot().phase,workerBusy:models.workerModel.getSnapshot().busy,workerStale:models.workerModel.getSnapshot().stale,setupPhase:models.setupModel.getSnapshot().phase,taskPhase:models.model.getSnapshot().phase,state:state.getSnapshot(),generationId:generation.getSnapshot()?.id??null}));
  const unsubscribers=[models.workerModel.subscribe(observe),models.setupModel.subscribe(observe),models.model.subscribe(observe)];
  const counts=()=>({R,M,unexpected,resetInputs});
  async function until(predicate) {
    if(predicate())return;
    const ready=deferred(`${caseId}:public-observation`),unsub=[];
    const check=()=>{if(!ready.settled && predicate())ready.resolve();};
    try {
      unsub.push(models.workerModel.subscribe(check),models.setupModel.subscribe(check),models.model.subscribe(check));onEntry.add(check);check();
      await waitFor(ready.promise,signal);
    } finally { for(const stop of unsub)stop();onEntry.delete(check);ready.close(); }
  }
  async function quiescent() {
    const before=counts();
    // Two finite public event-loop turns, no private queue/clock instrumentation.
    await waitFor(new Promise(resolve=>setImmediate(resolve)),signal);
    await waitFor(new Promise(resolve=>setImmediate(resolve)),signal);
    assert.deepEqual(counts(),before,'no input-independent request loop');
  }
  const fresh=()=>!models.workerModel.getSnapshot().stale && !models.workerModel.getSnapshot().busy && models.setupModel.getSnapshot().phase==='ready' && !models.model.getSnapshot().stale;
  function assertNoAuthority() {
    const w=models.workerModel.getSnapshot();
    assert.equal(w.policyAccepted,false);assert.equal(w.actionAccepted,false);assert.equal(w.policyPreview,null);assert.equal(w.actionPreview,null);assert.equal(w.grant,null);assert.equal(w.worker,null);assert.equal(w.execution,null);assert.equal(w.capture,null);assert.equal(w.result,null);assert.equal(w.uncertain,null);
    assert.equal(models.workerModel.canGrant(),false);assert.equal(models.workerModel.canCreate(),false);assert.equal(M,0);
  }
  async function cleanup() {
    assert.equal(cleaned,false);cleaned=true;
    for(const stop of unsubscribers)stop(); owner.dispose();
    const snapshot=models.workerModel.getSnapshot(),before=counts(),notifications=publicTrace.length;
    for(const b of barriers)b.close(); held=null;
    await cleanupWithin(Promise.allSettled([...pendingReplies]),150);
    await Promise.resolve();await Promise.resolve();
    state.publish('connected');generation.publish(G2);owner.reset();
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(counts(),before);assert.equal(models.workerModel.getSnapshot(),snapshot);assert.equal(publicTrace.length,notifications);
    assert.equal(state.listenerCount(),0);assert.equal(generation.listenerCount(),0);assert.equal(owner.inventory().resetListenerPresent,false);
    const disposal=owner.inventory().disposalTrace;
    for(const label of ['df.client-model','df.connection-state','df.connection-generation','connection/reset listener'])assert.equal(disposal.filter(value=>value===label).length,1);
    for(const b of barriers){assert.equal(b.settled,true);assert.equal(b.releases,1);}
    return {zeroNewEntries:true,stableDisposedSnapshot:true,originalApplyDisposersOnce:true};
  }
  return Object.freeze({caseId,models,connection,state,generation,initialHold,holdNextWorker,until,fresh,quiescent,assertNoAuthority,
    wait:promise=>waitFor(promise,signal),setWorkerRow:value=>{worker=clone(value);},
    reset(){resetInputs++;owner.reset();},counts,trace:()=>[...trace],publicTrace:()=>[...publicTrace],cleanup,
    disposeOwner:()=>owner.dispose(),ownerInventory:()=>owner.inventory(),
    barriers:()=>barriers.map(b=>({label:b.label,settled:b.settled,releases:b.releases})),
  });
}
