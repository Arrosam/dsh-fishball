import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const client=createRequire(import.meta.url)('../src/client-entry.cjs')(()=>({}));
const ok=value=>({ok:true,value});
const ref='a'.repeat(64),location='/synthetic/df/runtime.sqlite';
const task={taskRef:ref,status:'running',version:1,authEpoch:0,updatedAt:1};
const setupStatus=phase=>({phase,executionEnabled:false,storage:{location}});
const workerStatus=()=>({enabled:true,phase:'needs_policy',reasonCode:null,configurationRef:ref,policyVersion:1,selection:{provider:'df-testing-local',model:'df-testing-worker-v1',agentPreset:'empty',reasoningEffort:'deterministic',maxOutputTokens:128},environment:{root:'/synthetic/df',cwd:'/synthetic/df'},persistence:{directory:'/synthetic/df/df-sessions',compression:'none',retention:'owner-managed',encrypted:false},bounds:{requestBytes:8192,resultBytes:1024},accounting:'df-testing-utf8-byte-units/v1',pricing:'source_zero',actionsEnabled:false});
const taskStatus=()=>({task,data:[],actions:[],workers:[],artifacts:[],executions:[]});
const readRoutes=new Set(['/df-setup/v1/status','/df-setup/v1/workerStatus','/df-rpc/v1/list','/df-rpc/v1/status']);
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let i=0;i<12;i++){if(predicate())return;await turn();}assert.fail('Expected frontend recovery state did not settle');}
function observable(initial){
  let value=initial;const listeners=new Set();
  return {getSnapshot:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},publish(next){if(Object.is(value,next))return;value=next;for(const fn of [...listeners])fn();},listenerCount:()=>listeners.size};
}
function gate(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve,request:null};}
function application({connected=true,phase='ready',holdRoute}={}){
  const generation=observable(connected?{id:1,host:{home:'/synthetic'}}:undefined),state=observable(connected?'connected':undefined);
  const calls=[],events=new Map(),cleanups=[],registrations=[],holds=new Map();
  if(holdRoute)holds.set(holdRoute,gate());
  const initialGate=holds.get(holdRoute);
  let setupPhase=phase,setupFailure=false,disposed=false;
  const rpc={async call(channel,endpoint,input,signal){
    const route=channel+'/'+endpoint,request={route,input,signal,generation:generation.getSnapshot()};calls.push(request);
    const pending=holds.get(route);if(pending){holds.delete(route);pending.request=request;return pending.promise;}
    if(route==='/df-setup/v1/status')return setupFailure?{ok:false,error:{code:'OPERATOR_REQUIRED'}}:ok(setupStatus(setupPhase));
    if(route==='/df-setup/v1/workerStatus')return ok(workerStatus());
    if(route==='/df-rpc/v1/list')return ok([task]);
    if(route==='/df-rpc/v1/status')return ok(taskStatus());
    if(route==='/df-setup/v1/prepare')return ok({previewRef:ref,planDigest:ref,expiresAt:Date.now()+60000,description:{operation:'create-local-storage',databaseLocation:location,identityMode:'native-dsh-owner',encrypted:true,permissions:'owner-only',externalExecution:false}});
    if(route==='/df-setup/v1/confirm'){setupPhase='ready';return ok(setupStatus('ready'));}
    assert.fail('Unexpected frontend operation: '+route);
  }};
  client.apply({connection:{rpc,generation,state},layout:{},slots:{inject(_slot,install){install();},register(spec){registrations.push(spec);return()=>{};}},effect(install){const cleanup=install();if(typeof cleanup==='function')cleanups.push(cleanup);},on(event,fn){events.set(event,fn);}});
  const props=registrations.find(row=>row.key==='df').inject();
  return {...props,calls,generation,state,initialGate,
    count:route=>calls.filter(row=>row.route===route).length,
    reset(){events.get('connection/reset')();},
    disconnect(){generation.publish(undefined);state.publish('connecting');},
    connect(id){state.publish('connected');generation.publish({id,host:{home:'/synthetic'}});events.get('connection/reset')();},
    failSetup(value){setupFailure=value;},
    holdNext(route){const pending=gate();holds.set(route,pending);return pending;},
    close(){if(disposed)return;disposed=true;for(const cleanup of cleanups.splice(0).reverse())cleanup();},
  };
}
function cleared(app){const s=app.workerModel.getSnapshot();assert.equal(s.policyPreview,null);assert.equal(s.policyAccepted,false);assert.equal(s.actionPreview,null);assert.equal(s.actionAccepted,false);assert.equal(s.grant,null);assert.equal(app.workerModel.canCreate(),false);}
function onlyReads(app){assert.equal(app.calls.every(row=>readRoutes.has(row.route)),true,'automatic recovery sends only setup/task/cached-status reads');cleared(app);}
async function recovered(app){await until(()=>app.workerModel.getSnapshot().phase==='needs_policy'&&!app.workerModel.getSnapshot().stale&&app.workerModel.getSnapshot().busy===null);assert.equal(app.model.getSnapshot().detail.task.taskRef,ref);assert.equal(app.setupModel.getSnapshot().phase,'ready');}

test('apply on an established generation restores cached worker status after task detail reads',async t=>{
  const app=application();t.after(()=>app.close());await recovered(app);
  assert.deepEqual(app.calls.map(row=>row.route),['/df-setup/v1/status','/df-rpc/v1/list','/df-rpc/v1/status','/df-setup/v1/workerStatus']);
  onlyReads(app);
});

test('connected state before generation performs no reads and generation/reset restore worker controls',async t=>{
  const app=application({connected:false});t.after(()=>app.close());
  assert.equal(app.workerModel.getSnapshot().phase,'offline');assert.equal(app.calls.length,0);
  app.state.publish('connected');await turn();assert.equal(app.calls.length,0);assert.equal(app.workerModel.getSnapshot().phase,'offline');
  app.generation.publish({id:1,host:{home:'/synthetic'}});app.reset();await recovered(app);onlyReads(app);
  app.disconnect();const count=app.calls.length;
  assert.equal(app.workerModel.getSnapshot().phase,'offline');assert.equal(app.workerModel.getSnapshot().stale,true);cleared(app);
  app.state.publish('connected');await turn();assert.equal(app.calls.length,count,'state alone does not establish readiness');
  app.connect(2);await recovered(app);assert.equal(app.count('/df-setup/v1/workerStatus'),2);onlyReads(app);
});

test('setup-required mount remains gated until explicit setup confirmation publishes ready',async t=>{
  const app=application({phase:'setup_required'});t.after(()=>app.close());await until(()=>app.setupModel.getSnapshot().phase==='setup_required');
  assert.deepEqual(app.calls.map(row=>row.route),['/df-setup/v1/status']);cleared(app);
  assert.equal(await app.setupModel.prepare(),true);assert.equal(app.setupModel.setAccepted(true),true);assert.equal(await app.setupModel.confirm(),true);
  await recovered(app);
  assert.deepEqual(app.calls.filter(row=>!readRoutes.has(row.route)).map(row=>row.route),['/df-setup/v1/prepare','/df-setup/v1/confirm'],'only the explicit local setup clicks write; recovery never approves or runs a worker');cleared(app);
});

for(const route of ['/df-setup/v1/status','/df-rpc/v1/list','/df-rpc/v1/status','/df-setup/v1/workerStatus']){
  test('reset fences a late old reply from '+route,async t=>{
    const app=application({holdRoute:route});t.after(()=>app.close());const pending=app.initialGate;
    await until(()=>pending.request!==null);app.reset();assert.equal(pending.request.signal.aborted,true);
    await recovered(app);const snapshot=app.workerModel.getSnapshot(),calls=app.calls.length,detail=app.model.getSnapshot().detail;
    const old=route==='/df-setup/v1/status'?setupStatus('unavailable'):route==='/df-rpc/v1/list'?[]:route==='/df-rpc/v1/status'?{...taskStatus(),task:{...task,version:99}}:{...workerStatus(),phase:'unavailable'};
    pending.resolve(ok(old));await turn();await turn();
    assert.equal(app.calls.length,calls,'late replies do not start a fresh worker read');assert.equal(app.workerModel.getSnapshot(),snapshot);assert.equal(app.model.getSnapshot().detail,detail);onlyReads(app);
  });
}

test('failed setup leaves worker consent gated and a later authenticated reset recovers by reads',async t=>{
  const app=application();t.after(()=>app.close());await recovered(app);app.failSetup(true);app.reset();await until(()=>app.setupModel.getSnapshot().phase==='unavailable');
  assert.equal(app.workerModel.getSnapshot().phase,'offline');assert.equal(app.workerModel.getSnapshot().stale,true);cleared(app);
  app.failSetup(false);app.reset();await recovered(app);onlyReads(app);
});

test('disposal aborts pending recovery, releases observable subscriptions and prevents follow-up reads',async()=>{
  const app=application({holdRoute:'/df-rpc/v1/list'}),pending=app.initialGate;await until(()=>pending.request!==null);
  app.close();assert.equal(pending.request.signal.aborted,true);assert.equal(app.generation.listenerCount(),0);assert.equal(app.state.listenerCount(),0);
  const calls=app.calls.length;pending.resolve(ok([task]));await turn();app.state.publish('connecting');app.generation.publish({id:2,host:{home:'/synthetic'}});await turn();
  assert.equal(app.calls.length,calls);assert.equal(app.count('/df-setup/v1/workerStatus'),0);onlyReads(app);
});
