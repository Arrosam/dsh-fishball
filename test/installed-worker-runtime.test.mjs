import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { reference } from '../src/runtime-store.mjs';
import { BootstrapError } from '../src/config.mjs';

const packages = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const { Context } = await import(pathToFileURL(`${packages}/cordis/lib/index.js`).href);
const { default: SessionStore } = await import(pathToFileURL(`${packages}/dsh-session/lib/index.js`).href);
const { default: ApprovalService } = await import(pathToFileURL(`${packages}/dsh-user-approval/lib/index.js`).href);
const { WebServer } = await import(pathToFileURL(`${packages}/dsh-host-webserver/lib/index.js`).href);
const { HostConnectionService } = await import(pathToFileURL(`${packages}/dsh-client-connection/lib/index.js`).href);

class CapturedResponse extends Writable {
  constructor() { super(); this.parts = []; }
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; }
  text() { return Buffer.concat(this.parts).toString('utf8'); }
}
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-native-'));
  const ctx = new Context();
  let server;
  await ctx.plugin({ apply(webCtx) { server = new WebServer(webCtx, { host: '127.0.0.1', port: 3080, compression: 'none' }); } });
  const routes = server.prefixes;
  assert.equal(server.server, undefined);
  ctx.logger.exporters?.clear?.();
  t.after(async () => { try { await ctx.fiber.dispose(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  await ctx.plugin(SessionStore);
  await ctx.plugin(ApprovalService, { policy: 'never' });
  await ctx.plugin({ name: 'synthetic-connection', inject: ['webServer'], apply(connectionCtx) {
    // The exported native Connection owns the actual peer/trust fence/RPC
    // framing. BrowserAuth is a private synthetic double, without credentials,
    // server listener, cookies, browser, provider or external model calls.
    new HostConnectionService(connectionCtx, [], {isAuthenticated:request => request.headers['x-synthetic-auth'] === 'approved',authenticateApi:()=>undefined});
  } });
  const send = async (command, payload = {}, headers = {}) => {
    const method = `v1/${command}`, envelope = { type: 'client-request', rpcId: 'fixture-rpc', method, payload };
    const request = Readable.from([Buffer.from(JSON.stringify(envelope))]);
    Object.assign(request, { method: 'POST', url: `/df-rpc/${method}`,
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-synthetic-auth': 'approved', ...headers } });
    const response = new CapturedResponse();
    const route = routes.get('/df-rpc');
    assert.ok(route, 'public native route was registered');
    await route.handler(request, response);
    const text = response.text();
    return { status: response.statusCode, text, ...(response.statusCode === 200 ? { result: JSON.parse(text).result } : {}) };
  };
  return { ctx, routes, directory, send };
}


const names=['workerCatalog','workerPolicyPreview','workerPolicyConfirm','workerPlan','workerPreview','workerGrant','workerCreate','workerExecute','workerQuery','workerCapture','workerResult','workerFinish'];
const status=()=>({enabled:false,phase:'disabled',reasonCode:null,configurationRef:null,policyVersion:null,selection:null,environment:null,persistence:null,bounds:null,accounting:null,pricing:'unknown',actionsEnabled:false});
function installer(overrides={}) { return api=>Object.freeze({hostPermission:()=>false,previewResolver:()=>{throw Error('UNEXPECTED_BOOT_RESOLVE');},previewTtlMs:10000,operations:Object.fromEntries(names.map(name=>[name,()=>{throw Error('UNIMPLEMENTED_FIXTURE_OPERATION');}])),status,dispose(){},...overrides(api)}); }
function options(installedWorkerInstaller){return{identity:()=>({ownerId:'synthetic-owner',workspaceId:'synthetic-workspace'}),encryptionKey:()=>Buffer.alloc(32,21),memory:{namespaceRef:reference('memory'),tokenize:text=>Buffer.byteLength(text),byteLimit:65536,tokenLimit:8192},installedWorkerInstaller};}
test('lazy installed runtime receives only closed private seams and boots without optional native services or resolver work',async t=>{
 const f=await fixture(t);let captured,disposed=0,callbacks=0;
 const plugin=createRuntimePlugin(options(installer(api=>{captured=api;return{previewResolver:()=>{callbacks++;throw Error('MUST_NOT_RESOLVE_ON_BOOT');},dispose(){disposed++;},operations:Object.fromEntries(names.map(name=>[name,()=>({fixture:true})]))};})));
 const fiber=f.ctx.plugin(plugin,{databasePath:join(f.directory,'lazy.sqlite'),limits:{maxMetadataBytes:4096}});await fiber;
 assert.deepEqual(Object.keys(captured).sort(),['ctx','snapshotOwner','readOwnerData','currentPolicy','installOwnerPolicy','planOwnerAction','assertNativeRequestCurrent','composeNativeWorker','prepareOwnerPreview','grantOwnerPreview','subscribeRuntimeReceipts','isAlive'].sort());
 assert.equal(callbacks,0);assert.equal(f.ctx.reflect.get('agents'),undefined);assert.equal(f.ctx.reflect.get('llm'),undefined);assert.equal(f.ctx.sessions.list().length,0);
 assert.equal(f.ctx.df.diagnostics().capabilities.memory,true);assert.equal(f.ctx.df.diagnostics().capabilities.worker,false);assert.equal(f.ctx.df.diagnostics().installedWorkerStatus.actionsEnabled,false);
 assert.equal((await f.send('workerCatalog')).result.ok,true);assert.equal(callbacks,0);
 await fiber.dispose();assert.equal(disposed,1);assert.equal(captured.isAlive(),false);assert.throws(()=>captured.currentPolicy(),{code:'SERVICE_DISPOSED'});
});
test('original module-prepared context receipt is detached, frozen and synchronously observed exactly once before owner reply',async t=>{
 const f=await fixture(t),events=[];let api;
 const fiber=f.ctx.plugin(createRuntimePlugin(options(installer(value=>{api=value;value.subscribeRuntimeReceipts(event=>{events.push(event);assert.equal(Object.isFrozen(event.input),true);assert.equal(Object.isFrozen(event.receipt),true);});return{};}))),{databasePath:join(f.directory,'receipts.sqlite'),limits:{maxMetadataBytes:4096}});await fiber;
 assert.throws(()=>api.subscribeRuntimeReceipts(()=>{}),{code:'RUNTIME_ADAPTER_INVALID'});
 const task=(await f.send('intake',{taskId:'receipt-task',provider:'fixture',source:'local',eventId:'one',commandRef:reference('intake'),goal:'Synthetic scoped input'})).result.value.task;
 const input={taskRef:task.taskRef,commandRef:reference('prepared'),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,terms:[],now:Date.now()};
 const prepared=(await f.send('prepareContext',input)).result;assert.equal(prepared.ok,true);assert.equal(events.length,1);assert.equal(events[0].operation,'prepareContext');assert.deepEqual(events[0].receipt,prepared.value);assert.deepEqual(events[0].input,input);
 assert.equal(Object.isFrozen(events[0].input.terms),true);assert.throws(()=>{events[0].receipt.recordRef='forged';},TypeError);
 const failure=(await f.send('prepareContext',{...input,commandRef:reference('stale')})).result;assert.equal(failure.ok,false);assert.equal(events.length,1);
 await fiber.dispose();
});
test('receipt observer failure preserves actual policy commit, exposes bounded uncertainty and seals installed admission',async t=>{
 const f=await fixture(t);let api;
 const fiber=f.ctx.plugin(createRuntimePlugin(options(installer(value=>{api=value;value.subscribeRuntimeReceipts(()=>{throw Error('PRIVATE_RECEIPT_CANARY');});return{};}))),{databasePath:join(f.directory,'failed-observer.sqlite'),limits:{maxMetadataBytes:4096}});await fiber;
 const policy={commandRef:reference('policy'),expectedVersion:1,limits:{maxActive:1,maxAttempts:1,maxTotalAttempts:1},modelPolicy:{version:1,presetRefs:[reference('preset')],catalogEvidenceRef:reference('catalog')}};
 assert.throws(()=>api.installOwnerPolicy(policy),error=>error.code==='WORKER_SOURCE_UNAVAILABLE'&&!String(error).includes('PRIVATE_RECEIPT_CANARY'));
 assert.equal(api.currentPolicy().version,2);assert.equal(api.isAlive(),false);assert.equal(f.ctx.df.diagnostics().capabilities.memory,true);
 await fiber.dispose();
});
test('lazy original preview closures refuse before construction and never mint caller accept or a boot grant',async t=>{
 const f=await fixture(t);let api;
 const fiber=f.ctx.plugin(createRuntimePlugin(options(installer(value=>{api=value;assert.throws(()=>value.prepareOwnerPreview({}),{code:'PREVIEW_UNAVAILABLE'});assert.throws(()=>value.grantOwnerPreview({}),{code:'PREVIEW_UNAVAILABLE'});return{};}))),{databasePath:join(f.directory,'preview.sqlite'),limits:{maxMetadataBytes:4096}});await fiber;
 assert.equal(api.currentPolicy().version,1);await assert.rejects(api.prepareOwnerPreview({}),{code:'INVALID_INPUT'});await assert.rejects(api.grantOwnerPreview({accept:true}),{code:'INVALID_INPUT'});assert.equal(f.ctx.sessions.list().length,0);await fiber.dispose();
});
test('closed installer rejects authority-bearing extras, missing operations and mixed advanced worker/preview composition',async t=>{
 assert.throws(()=>createRuntimePlugin({...options(()=>{}),worker:{}}),{code:'RUNTIME_ADAPTER_INVALID'});assert.throws(()=>createRuntimePlugin({...options(()=>{}),previewResolver:()=>{},previewTtlMs:1000}),{code:'RUNTIME_ADAPTER_INVALID'});
 const f=await fixture(t);
 for(const [i,extra] of [{owner:{}},{operations:{}},{previewTtlMs:60001}].entries()){
 const fiber=f.ctx.plugin(createRuntimePlugin(options(installer(()=>extra))),{databasePath:join(f.directory,'invalid-'+i+'.sqlite')});await assert.rejects(Promise.resolve(fiber),{code:'RUNTIME_ADAPTER_INVALID'});await fiber.dispose();assert.equal(f.routes.has('/df-rpc'),false);
 }
});

test('the one original ApprovalPreview creates only the actual once-observed grant and refuses concurrent or repeated confirmation',async t=>{
 const f=await fixture(t),events=[];let api;
 const resolver=spec=>({targetDigest:spec.targetDigest,...spec.model,environmentRef:spec.executor.environmentRef,bindingDigest:spec.executor.bindingDigest,toolsDigest:spec.executor.toolsDigest,permissionPolicyDigest:spec.executor.permissionPolicyDigest,evidenceRef:reference('current-evidence'),targetLabel:'Synthetic owned local directory; native plaintext session; no tools',providerLabel:'Synthetic provider',modelLabel:'Synthetic model',reasoningLabel:'Synthetic reasoning',presetLabel:'Empty preset',environmentLabel:'Synthetic owned environment',cwd:f.directory,toolNames:[]});
 const fiber=f.ctx.plugin(createRuntimePlugin(options(installer(value=>{api=value;value.subscribeRuntimeReceipts(event=>{events.push(event);});return{previewResolver:resolver};}))),{databasePath:join(f.directory,'actual-preview.sqlite'),limits:{maxMetadataBytes:4096}});await fiber;
 const task=(await f.send('intake',{taskId:'preview-task',provider:'fixture',source:'local',eventId:'one',commandRef:reference('intake-preview'),goal:'Synthetic scoped goal'})).result.value.task;
 api.installOwnerPolicy({commandRef:reference('policy-preview'),expectedVersion:1,limits:{maxActive:1,maxAttempts:1,maxTotalAttempts:1},modelPolicy:{version:1,presetRefs:[reference('preset')],catalogEvidenceRef:reference('catalog')}});
 const prepared=(await f.send('prepareContext',{taskRef:task.taskRef,commandRef:reference('context-preview'),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,terms:[],now:Date.now()})).result.value;
 const spec={actionRef:reference('action'),kind:'write',role:'worker',targetDigest:reference('target'),dataDigest:prepared.digest,units:1,charges:{runtimeMs:1,usageUnits:1,costState:'estimated',costEstimateMicros:0,costProvenanceRef:reference('source-cost')},attemptGroupRef:reference('attempt'),attemptIndex:1,resourcePolicyVersion:2,modelPolicyVersion:1,executor:{mode:'create',generationRef:reference('generation'),sessionRef:reference('df-native-id'),environmentRef:reference('environment'),bindingDigest:reference('binding'),toolsDigest:reference('tools'),permissionPolicyDigest:reference('permission')},model:{modelRef:reference('model'),reasoningRef:reference('reasoning'),presetRef:reference('preset'),catalogEvidenceRef:reference('catalog')}};
 const action=api.planOwnerAction({taskRef:task.taskRef,commandRef:reference('plan-preview'),expectedTaskVersion:prepared.task.version,expectedAuthEpoch:prepared.task.authEpoch,spec});
 const current=api.snapshotOwner({taskRef:task.taskRef}).task;
 const prepare={taskRef:task.taskRef,actionRef:action.actionRef,actionDigest:action.actionDigest,recordRef:prepared.recordRef,expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch};
 const preview=await api.prepareOwnerPreview(prepare);assert.equal(events.filter(e=>e.operation==='grant').length,0);
 const grant={taskRef:task.taskRef,actionRef:action.actionRef,actionDigest:action.actionDigest,commandRef:reference('grant-preview'),expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch,expiresAt:Date.now()+5000,previewRef:preview.previewRef};
 await assert.rejects(api.grantOwnerPreview({...grant,accept:true}),{code:'INVALID_INPUT'});assert.equal(events.filter(e=>e.operation==='grant').length,0);
 const [first,second]=await Promise.allSettled([api.grantOwnerPreview(grant),api.grantOwnerPreview(grant)]);assert.equal(first.status,'fulfilled');assert.equal(second.status,'rejected');assert.equal(second.reason.code,'PREVIEW_BUSY');
 const observed=events.filter(e=>e.operation==='grant');assert.equal(observed.length,1);const {previewRef,...originalGrant}=grant;assert.deepEqual(observed[0].input,originalGrant);assert.deepEqual(observed[0].receipt,first.value);assert.equal(Object.isFrozen(observed[0].receipt.task),true);
 await assert.rejects(api.grantOwnerPreview(grant),{code:'PREVIEW_STALE'});assert.equal(events.filter(e=>e.operation==='grant').length,1);assert.equal(f.ctx.sessions.list().length,0);await fiber.dispose();
});
test('native normal operation failures project only the closed NI2 source and availability codes',async t=>{
 const f=await fixture(t);let selected;
 const codes=['WORKER_NOT_CONFIGURED','WORKER_CATALOG_UNAVAILABLE','WORKER_POLICY_REQUIRED','WORKER_POLICY_STALE','WORKER_CONFIRMATION_REQUIRED','WORKER_PREVIEW_STALE','WORKER_PRESET_UNAVAILABLE','WORKER_PERSISTENCE_UNSUPPORTED','WORKER_SOURCE_UNAVAILABLE','WORKER_REQUEST_DENIED','WORKER_FINISH_UNAVAILABLE'];
 const fiber=f.ctx.plugin(createRuntimePlugin(options(installer(()=>({operations:Object.fromEntries(names.map(name=>[name,()=>{throw new BootstrapError(selected);}])),})))),{databasePath:join(f.directory,'source-codes.sqlite'),limits:{maxMetadataBytes:4096}});await fiber;
 for(const code of [...codes,'PRIVATE_PROVIDER_ERROR_CANARY']){selected=code;const result=(await f.send('workerCatalog')).result;const projected=code==='PRIVATE_PROVIDER_ERROR_CANARY'?'OPERATION_REJECTED':code;assert.deepEqual(result,{ok:false,error:{code:projected,message:projected,details:{}}});assert.equal(JSON.stringify(result).includes('CANARY'),false);}
 await fiber.dispose();
});
