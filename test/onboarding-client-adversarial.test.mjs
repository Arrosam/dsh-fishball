// Independent typed-client/module vectors. No browser, real transport, native
// authentication, persistent file, provider, inference or tool is exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const React = {
  Fragment: 'fragment',
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(value => value !== false && value != null) }),
  useSyncExternalStore: (_subscribe, get) => get(),
  useState: initial => [initial, () => {}],
  useEffect: () => {},
};
const materialize = factory => factory(name => { assert.equal(name, 'react'); return React; });
const source = materialize(require('../src/client-entry.cjs'));
let registration;
// Same realm as the typed RPC JSON fixture; this evaluates only the emitted
// lazy registration. It creates no DOM and runs no listener/browser code.
new Function('window', readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))({
  __ModuleLoader__: { load(value) { assert.equal(registration, undefined); registration = value; } },
});
assert.equal(registration.id, 'dsh-fishball');
const bundle = materialize(registration.factory);
const hex = value => createHash('sha256').update(value).digest('hex');
const location = '/synthetic-profile/private-vault/tasks.sqlite';
const canary = 'SYNTHETIC_ONBOARDING_PRIVATE_CANARY';
const ok = value => ({ ok: true, value });
const status = (phase = 'setup_required', target = location) => ({ phase, executionEnabled: false, storage: { location: target } });
const plan = (changes = {}) => ({ previewRef: hex('independent-preview'), planDigest: hex('independent-plan'), expiresAt: 61000,
  description: { operation: 'create-local-storage', databaseLocation: location, identityMode: 'native-dsh-owner', encrypted: true, permissions: 'owner-only', externalExecution: false }, ...changes });
const gate = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const drain = () => new Promise(resolve => setImmediate(resolve));
const allNodes = value => value && typeof value === 'object' ? [value, ...value.children.flatMap(allNodes)] : [];
const renderedText = value => value && typeof value === 'object' ? value.children.map(renderedText).join(' ') : String(value);
const publicSnapshot = model => JSON.parse(JSON.stringify(model.getSnapshot()));

function fixture(client, { handler, currentStatus = status(), currentPlan = plan(), clock } = {}) {
  let time = 1000;
  const calls = [];
  const rpc = { async call(channel, endpoint, input, signal) {
    assert.equal(channel, '/df-setup');
    calls.push({ channel, endpoint, input: structuredClone(input), signal });
    if (handler) {
      const value = await handler(endpoint, input, signal);
      if (value !== undefined) return value;
    }
    if (endpoint === 'v1/status') return ok(currentStatus);
    if (endpoint === 'v1/prepare') return ok(currentPlan);
    if (endpoint === 'v1/confirm') return ok(status('ready'));
    throw new Error('UNEXPECTED_TYPED_ENDPOINT');
  } };
  const model = client.createSetupModel(rpc, { clock: clock || (() => time) });
  return { model, calls, time: value => { time = value; }, panel: () => client.Panel({ model: client.createModel({ call: async () => ok([]) }), setupModel: model }) };
}
const prepared = async f => { assert.equal(await f.model.refresh(), true); assert.equal(await f.model.prepare(), true); };
const confirmedCalls = f => f.calls.filter(call => call.endpoint === 'v1/confirm');
const safe = f => { assert.equal(JSON.stringify(publicSnapshot(f.model)).includes(canary), false); assert.equal(renderedText(f.panel()).includes(canary), false); };

function application(client, rpc) {
  const registrations = [], events = new Map(), cleanups = [], generation = { current: {} };
  client.apply({
    connection: { rpc, generation: { getSnapshot: () => generation.current }, state: { subscribe() { return () => {}; } } },
    layout: {},
    slots: { inject(_slot, install) { install(); }, register(spec, component) { registrations.push({ spec, component }); return () => {}; } },
    effect(install) { const cleanup = install(); if (typeof cleanup === 'function') cleanups.push(cleanup); },
    on(name, callback) { events.set(name, callback); },
  });
  const props = registrations.find(value => value.spec.key === 'df').spec.inject();
  return { ...props, panel: () => client.Panel(props), reset: () => events.get('connection/reset')(), close: () => cleanups.reverse().forEach(fn => fn()) };
}

for (const [label, client] of [['source', source], ['generated', bundle]]) {
  test(`independent onboarding ${label} public location UTF8 N-1/N/N+1 and well-formed text partitions`, async () => {
    for (const bytes of [4095,4096,4097]) {
      const target='/'+'汉'.repeat(1364)+'a'.repeat(bytes-4093);
      assert.equal(Buffer.byteLength(target),bytes);
      const f=fixture(client,{currentStatus:status('setup_required',target)});
      assert.equal(await f.model.refresh(),bytes<=4096);
      assert.equal(f.model.getSnapshot().phase,bytes<=4096?'setup_required':'unavailable');
      assert.equal(confirmedCalls(f).length,0);f.model.dispose();
    }
    for(const target of ['relative','', '/bad\0path','/bad\rpath','/bad\tpath','/bad\u007fpath','/bad\ud800path','/bad\udc00path']){
      const f=fixture(client,{currentStatus:status('setup_required',target)});
      assert.equal(await f.model.refresh(),false);assert.equal(f.model.getSnapshot().error,'INVALID_RESPONSE');assert.equal(confirmedCalls(f).length,0);f.model.dispose();
    }
    const valid=fixture(client,{currentStatus:status('setup_required','/synthetic/😀/汉字.sqlite')});
    assert.equal(await valid.model.refresh(),true);valid.model.dispose();
  });

  test(`independent onboarding ${label} closed RPC envelope/error partitions never publish secrets or acquire fallback`, async () => {
    let reads=0;
    const accessor=Object.defineProperty({value:status()},'ok',{enumerable:true,get(){reads++;throw new Error(canary);}});
    const hidden=Object.defineProperty(ok(status()),'secret',{value:canary});
    const symbol={...ok(status()),[Symbol(canary)]:canary};
    const wrongPrototype=Object.assign(Object.create({secret:canary}),ok(status()));
    const envelopes=[null,[],true,{ok:1,value:status()},{ok:true,value:status(),error:{code:canary}},
      {ok:false,error:{code:'SETUP_UNAVAILABLE'},value:status()}, {ok:true}, {ok:false},
      {...ok(status()),secret:canary},accessor,hidden,symbol,wrongPrototype];
    for(const response of envelopes){
      const f=fixture(client,{handler:()=>response});assert.equal(await f.model.refresh(),false);
      assert.equal(f.model.getSnapshot().routeMissing,false);assert.equal(confirmedCalls(f).length,0);safe(f);f.model.dispose();
    }
    assert.equal(reads,0);
    const errors=[{code:canary,message:canary,details:{key:canary}},
      {code:'SETUP_UNAVAILABLE',message:canary,details:{token:canary}},
      {code:'transport failure for /df-setup/v1/status: HTTP 404',message:canary}];
    for(const error of errors){
      const f=fixture(client,{handler:()=>({ok:false,error})});assert.equal(await f.model.refresh(),false);
      assert.equal(f.model.getSnapshot().routeMissing,false);safe(f);f.model.dispose();
    }
  });

  test(`independent onboarding ${label} primitive snapshots stay immutable after reply objects change`, async () => {
    const rawStatus=status(),rawPlan=plan();const f=fixture(client,{currentStatus:rawStatus,currentPlan:rawPlan});await prepared(f);
    const snapshot=f.model.getSnapshot();assert.equal(Object.isFrozen(snapshot),true);assert.equal(Object.isFrozen(snapshot.storage),true);
    assert.equal(Object.isFrozen(snapshot.preview),true);assert.equal(Object.isFrozen(snapshot.preview.description),true);
    rawStatus.storage.location='/changed/'+canary;rawPlan.previewRef=hex('changed');rawPlan.planDigest=hex('changed-plan');rawPlan.description.externalExecution=true;rawPlan.description.databaseLocation='/changed/'+canary;
    assert.equal(f.model.getSnapshot(),snapshot);assert.equal(snapshot.preview.description.databaseLocation,location);
    assert.throws(()=>{snapshot.preview.planDigest=hex('new');},TypeError);
    assert.equal(f.model.setAccepted(true),true);assert.equal(await f.model.confirm(),true);
    assert.deepEqual(confirmedCalls(f)[0].input,{previewRef:hex('independent-preview'),planDigest:hex('independent-plan'),accept:true});safe(f);f.model.dispose();
  });

  test(`independent onboarding ${label} delayed prepare expiry and response-clock lifetime boundaries fence consent`, async () => {
    for(const delta of [-1,0,1,60000,60001]){
      const f=fixture(client,{handler:endpoint=>{if(endpoint==='v1/prepare'){f.time(5000);return ok(plan({expiresAt:5000+delta}));}}});
      await f.model.refresh();assert.equal(await f.model.prepare(),delta>0&&delta<=60000);
      if(delta>0&&delta<=60000){assert.equal(f.model.setAccepted(true),true);assert.equal(f.model.canConfirm(),true);}else assert.equal(f.model.setAccepted(true),false);
      assert.equal(confirmedCalls(f).length,0);f.model.dispose();
    }
    for(const value of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1000']){
      const f=fixture(client,{clock:()=>value});await f.model.refresh();assert.equal(await f.model.prepare(),false);
      assert.equal(f.model.canConfirm(),false);assert.equal(confirmedCalls(f).length,0);f.model.dispose();
    }
  });

  test(`independent onboarding ${label} an acknowledged commit arriving after local expiry remains an observed fact`, async () => {
    const receipt=gate();const f=fixture(client,{handler:endpoint=>endpoint==='v1/confirm'?receipt.promise:undefined});await prepared(f);f.model.setAccepted(true);
    const pending=f.model.confirm();assert.equal(confirmedCalls(f).length,1);f.time(61001);
    assert.equal(f.model.canConfirm(),false);receipt.resolve(ok(status('ready')));
    assert.equal(await pending,true);assert.equal(f.model.getSnapshot().phase,'ready');assert.equal(f.model.getSnapshot().executionEnabled,false);
    assert.equal(f.calls.filter(call=>call.endpoint==='v1/status').length,1);f.model.dispose();
  });

  test(`independent onboarding ${label} known non-ready acknowledgements cannot infer initialization or retry`, async () => {
    for(const phase of ['setup_required','recovery_required','unavailable']){
      const f=fixture(client,{handler:endpoint=>endpoint==='v1/confirm'?ok(status(phase)):undefined});await prepared(f);f.model.setAccepted(true);
      assert.equal(await f.model.confirm(),false);assert.equal(f.model.getSnapshot().phase,phase);
      assert.equal(f.model.getSnapshot().preview,null);assert.equal(f.model.getSnapshot().accepted,false);
      assert.equal(await f.model.confirm(),false);assert.equal(confirmedCalls(f).length,1);f.model.dispose();
    }
  });

  test(`independent onboarding ${label} uncertain readback disconnect preserves no-automatic-confirm rule`, async () => {
    const readback=gate();let statuses=0;
    const f=fixture(client,{handler:endpoint=>{if(endpoint==='v1/status'&&++statuses>1)return readback.promise;if(endpoint==='v1/confirm')throw new Error(canary);}});
    await prepared(f);f.model.setAccepted(true);const pending=f.model.confirm();await drain();
    assert.equal(f.model.getSnapshot().busy,'status');assert.equal(confirmedCalls(f).length,1);f.model.disconnected();
    readback.resolve(ok(status('ready')));assert.equal(await pending,false);assert.equal(f.model.getSnapshot().phase,'offline');
    assert.equal(f.model.getSnapshot().preview,null);assert.equal(f.model.getSnapshot().accepted,false);assert.equal(await f.model.confirm(),false);safe(f);f.model.dispose();
  });

  test(`independent onboarding ${label} stale current-target change discards checked plan and delayed prepare`, async () => {
    const delayed=gate();let count=0;
    const f=fixture(client,{handler:endpoint=>{if(endpoint==='v1/prepare'&&++count>1)return delayed.promise;}});
    await prepared(f);f.model.setAccepted(true);const pending=f.model.prepare();f.model.disconnected();await f.model.refresh();
    const current=f.model.getSnapshot();delayed.resolve(ok(plan({description:{...plan().description,databaseLocation:'/different'}})));
    assert.equal(await pending,false);assert.equal(f.model.getSnapshot(),current);assert.equal(f.model.setAccepted(true),false);
    assert.equal(await f.model.confirm(),false);assert.equal(confirmedCalls(f).length,0);f.model.dispose();
  });

  test(`independent onboarding ${label} post-ready service error prevents the task panel accepting old data`, async () => {
    let setupPhase='ready';const calls=[];
    const app=application(client,{async call(channel,endpoint){calls.push({channel,endpoint});if(channel==='/df-setup'){if(setupPhase==='error')throw new Error('OPERATOR_REQUIRED');return ok(status(setupPhase));}return ok([]);}});
    await drain();assert.equal(renderedText(app.panel()).includes('Create task'),true);
    setupPhase='error';app.reset();await drain();assert.equal(renderedText(app.panel()).includes('Create task'),false);
    assert.equal(app.model.getSnapshot().stale,true);assert.equal(app.setupModel.getSnapshot().error,'OPERATOR_REQUIRED');
    assert.equal(calls.filter(call=>call.endpoint==='v1/confirm').length,0);app.close();
  });

  test(`independent onboarding ${label} a stale advanced list cannot bypass newer setup-required status`, async () => {
    const list=gate();let mount=true;const calls=[];
    const app=application(client,{async call(channel,endpoint){calls.push({channel,endpoint});if(channel==='/df-setup'){if(mount)throw new Error('transport failure for /df-setup/v1/status: HTTP 404');return ok(status());}return list.promise;}});
    await drain();assert.equal(calls.filter(call=>call.channel==='/df-rpc').length,1);
    mount=false;app.reset();await drain();const current=app.setupModel.getSnapshot();list.resolve(ok([]));await drain();
    assert.equal(app.setupModel.getSnapshot(),current);assert.equal(current.phase,'setup_required');assert.equal(current.routeMissing,false);
    assert.equal(renderedText(app.panel()).includes('Create task'),false);assert.equal(app.model.getSnapshot().stale,true);app.close();
  });

  test(`independent onboarding ${label} exact-route fallback also requires structurally valid fresh original list`, async () => {
    for(const response of [ok(null),ok({tasks:[]}),ok([{taskRef:hex('task'),version:0,authEpoch:0,updatedAt:0,status:'queued'}]),{ok:false,error:{code:'OPERATOR_REQUIRED'}}]){
      const calls=[];const app=application(client,{async call(channel,endpoint){calls.push({channel,endpoint});if(channel==='/df-setup')throw new Error('transport failure for /df-setup/v1/status: HTTP 404');return response;}});
      await drain();assert.equal(app.setupModel.getSnapshot().routeMissing,true);assert.equal(app.model.getSnapshot().phase,'error');
      assert.equal(renderedText(app.panel()).includes('Create task'),false);assert.equal(calls.filter(call=>call.channel==='/df-rpc').length,1);app.close();
    }
  });

  test(`independent onboarding ${label} synchronous closed/refresh listeners fence captured consent before RPC`, async () => {
    for(const operation of ['dispose','disconnected','refresh']){
      const f=fixture(client);await prepared(f);f.model.setAccepted(true);
      f.model.subscribe(()=>{if(f.model.getSnapshot().busy==='confirm')void f.model[operation]();});
      assert.equal(await f.model.confirm(),false);assert.equal(confirmedCalls(f).length,0);
      await drain();f.model.dispose();
    }
  });

  test(`independent onboarding ${label} declared setup reason/output never renders raw structured or thrown callback secrets`, async () => {
    let getters=0;const failure={};Object.defineProperty(failure,'message',{get(){getters++;throw new Error(canary);}});
    const faults=[new Error(canary),{message:canary},failure];
    for(const fault of faults){const f=fixture(client,{handler(){throw fault;}});assert.equal(await f.model.refresh(),false);assert.equal(f.model.getSnapshot().error,'RESULT_UNCONFIRMED');safe(f);f.model.dispose();}
    assert.equal(getters,0);
    const hidden=Object.defineProperty(status(),'phase',{value:'ready',enumerable:false});
    const symbol={...status(),[Symbol(canary)]:canary};
    for(const currentStatus of [hidden,symbol,{...status(),reasonCode:canary}]){
      const f=fixture(client,{currentStatus});assert.equal(await f.model.refresh(),false);assert.equal(confirmedCalls(f).length,0);safe(f);f.model.dispose();
    }
  });
}
