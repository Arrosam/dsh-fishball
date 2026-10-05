import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,realpathSync,rmSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable,Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { resolveHostSource } from '../src/host-probe.mjs';
import { createInstalledWorker } from '../src/installed-worker.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { reference } from '../src/runtime-store.mjs';
import { BootstrapError } from '../src/config.mjs';
const load=n=>import(pathToFileURL(resolveHostSource('@deepseek-ai/'+n)).href);
const {Context}=await load('cordis');const {default:Loader}=await load('cordis-plugin-loader');const {default:Sessions}=await load('dsh-session');const {default:Projections}=await load('dsh-session-projection');const {default:Approval}=await load('dsh-user-approval');const {AgentRegistry}=await load('dsh-agent');const {LlmRuntime}=await load('dsh-llm');const {default:Prompt}=await load('dsh-system-prompt');const {default:Tools}=await load('dsh-tools');const {default:Presets}=await load('dsh-agent-preset-registry');const {WebServer}=await load('dsh-host-webserver');const {HostConnectionService}=await load('dsh-client-connection');
class Response extends Writable {parts=[];_write(chunk,encoding,done){this.parts.push(Buffer.from(chunk));done();}writeHead(status,headers){this.statusCode=status;this.headers=headers;}}
async function fixture(t,{native=true,interceptComposition}={}){
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'df-ni2-normal-')),ctx=new Context(),fibers=[],entries=[];ctx.baseUrl=new URL('../',import.meta.url).href;ctx.logger.exporters?.clear?.();let removePreset,child;
 const profile=Object.freeze({dir,name:'synthetic-normal'});ctx.provide('profileContext',profile);
 t.after(async()=>{await child?.dispose();await removePreset?.();for(const entry of entries.reverse())await entry.fiber?.dispose();for(const fiber of fibers.reverse())await fiber.dispose();rmSync(dir,{recursive:true,force:true});});
 async function install(plugin,config){const f=ctx.plugin(plugin,config);fibers.push(f);await f;}
 await install(Projections);await install(Sessions);await install(Approval,{policy:'never'});let server;
 await install({apply(webCtx){server=new WebServer(webCtx,{host:'127.0.0.1',port:3080,compression:'none'});}});assert.equal(server.server,undefined);
 await install({name:'synthetic-owner-connection',inject:['webServer'],apply(connectionCtx){new HostConnectionService(connectionCtx,[],{isAuthenticated:request=>request.headers['x-synthetic-auth']==='approved'});}});
 if(native){await install(AgentRegistry);await install(LlmRuntime);await install(Prompt,{});await install(Tools,{});await install(Loader,{baseUrl:ctx.baseUrl});
 async function entry(name,config){const id=await ctx.loader.create({name,config});await ctx.loader.await();const e=ctx.loader.resolve(id);entries.push(e);assert.equal(e.fiber.state,2);}
 await entry('@deepseek-ai/dsh-session-persistence-jsonl',{root:join(dir,'df-sessions'),compression:'none'});await entry('@deepseek-ai/dsh-agent-loop',{agents:[],maxParallelToolCalls:1});await install(Presets,{default:'empty'});removePreset=await ctx.agentPresets.register({id:'empty',plugins:[]});await entry('dsh-fishball/testing-provider',{});}
 const selection={enabled:true,selection:{provider:'df-testing-local',model:'df-testing-worker-v1',agentPreset:'empty',reasoningEffort:null,maxOutputTokens:128},environment:{root:dir,cwd:dir},persistence:{directory:join(dir,'df-sessions'),compression:'none',retention:'owner-managed'},bounds:{requestBytes:8192,resultBytes:128},policy:{maxRuntimeMs:10000,maxUsageUnits:20000,maxCostEstimateMicros:0},charges:{runtimeMs:1000,usageUnits:8320},previewTtlMs:30000,grantTtlMs:60000};
 const identity={ownerId:'synthetic-normal-owner',workspaceId:'synthetic-normal-workspace'},created=createInstalledWorker({selection,identity,profile});
 let privateOperations;
 // Trusted test instrumentation only: retain the actual installed closures
 // and intercept a public composition seam. No wire/config carries a guard.
 const installedWorkerInstaller=api=>{const composedApi=interceptComposition?Object.freeze({...api,composeNativeWorker:value=>api.composeNativeWorker(interceptComposition(value))}):api;const installed=created.installedWorkerInstaller(composedApi);privateOperations=installed.operations;return installed;};
 child=ctx.plugin(createRuntimePlugin({identity:()=>identity,encryptionKey:()=>Buffer.alloc(32,31),memory:{namespaceRef:reference('normal-memory'),tokenize:text=>Buffer.byteLength(text),byteLimit:65536,tokenLimit:8192},installedWorkerInstaller}),{databasePath:join(dir,'ledger.sqlite'),limits:{maxMetadataBytes:4096}});await child;
 let index=0;
 const call=async(command,payload={},authenticated=true,onResponse)=>{const method='v1/'+command,request=Readable.from([Buffer.from(JSON.stringify({type:'client-request',rpcId:'normal-'+(++index),method,payload}))]);Object.assign(request,{method:'POST',url:'/df-rpc/'+method,headers:{host:'127.0.0.1:3080',origin:'http://127.0.0.1:3080','content-type':'application/json','x-synthetic-auth':authenticated?'approved':'denied'}});const response=new Response();onResponse?.(response);await server.prefixes.get('/df-rpc').handler(request,response);const text=Buffer.concat(response.parts).toString();return{status:response.statusCode,text,...(text&&response.statusCode===200?JSON.parse(text).result:{})};};
 const ok=async(command,payload={})=>{const result=await call(command,payload);assert.equal(result.ok,true,`${command}: ${JSON.stringify(result)}`);return result.value;};
 return{ctx,dir,child,selection,call,ok,privateOperations:()=>privateOperations,status:()=>child.ctx.df.diagnostics().installedWorkerStatus};
}
const command=tag=>reference(tag);
test('enabled normal installer boots with missing optional services and leaves existing task-memory usable',async t=>{const f=await fixture(t,{native:false});assert.equal(f.status().phase,'needs_refresh');assert.equal(f.status().actionsEnabled,false);assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(join(f.dir,'df-sessions')),false);assert.equal((await f.call('workerCatalog')).ok,false);const task=await f.ok('intake',{taskId:'optional-missing',provider:'synthetic',source:'local',eventId:'one',commandRef:command('missing-intake'),goal:'Synthetic goal'});assert.ok(task.task.taskRef);assert.equal(f.ctx.sessions.list().length,0);});
test('catalogue and explicit policy consent use actual original facts and zero boot/session work',async t=>{
 const f=await fixture(t);assert.equal(f.status().phase,'needs_refresh');const catalog=await f.ok('workerCatalog');assert.equal(catalog.status.pricing,'source_zero');assert.equal(catalog.status.actionsEnabled,false);assert.equal(catalog.models[0].contextUnits,135168);assert.equal(catalog.status.persistence.encrypted,false);
 assert.equal((await f.call('workerPolicyPreview',{expectedPolicyVersion:2})).ok,false);
 const preview=await f.ok('workerPolicyPreview',{expectedPolicyVersion:1});assert.equal(preview.description.limits.maxTotalAttempts,1);assert.equal(preview.description.effectiveReasoningEffort,'deterministic');assert.equal(preview.description.pricing,'source_zero');assert.equal(f.status().actionsEnabled,false);assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(join(f.dir,'df-sessions')),false);
 const denied=await f.call('workerPolicyConfirm',{previewRef:preview.previewRef,planDigest:preview.planDigest,commandRef:command('no-consent'),expectedPolicyVersion:1,accept:false});assert.equal(denied.ok,false);
 const confirmed=await f.ok('workerPolicyConfirm',{previewRef:preview.previewRef,planDigest:preview.planDigest,commandRef:command('consent'),expectedPolicyVersion:1,accept:true});assert.equal(confirmed.policyVersion,2);assert.equal(confirmed.status.actionsEnabled,true);assert.equal((await f.call('workerPolicyConfirm',{previewRef:preview.previewRef,planDigest:preview.planDigest,commandRef:command('consent'),expectedPolicyVersion:1,accept:true})).ok,false);assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(join(f.dir,'df-sessions')),false);
});
test('complete fresh normal path requires actual prepared context, separate action consent, idle create, native output capture and explicit finish',async t=>{
 const f=await fixture(t),policy=await f.ok('workerPolicyPreview',{expectedPolicyVersion:1});await f.ok('workerPolicyConfirm',{previewRef:policy.previewRef,planDigest:policy.planDigest,commandRef:command('flow-policy'),expectedPolicyVersion:1,accept:true});
 const intake=await f.ok('intake',{taskId:'normal-flow',provider:'synthetic',source:'local',eventId:'flow-one',commandRef:command('flow-intake'),goal:'Produce synthetic output from approved context'}),taskRef=intake.task.taskRef;
 const bind=async tag=>{const snap=await f.ok('status',{taskRef});return{taskRef,commandRef:command(tag),expectedTaskVersion:snap.task.version,expectedAuthEpoch:snap.task.authEpoch};};
 const prepared=await f.ok('prepareContext',{...await bind('flow-context'),terms:[],now:Date.now()});
 const action=await f.ok('workerPlan',{...await bind('flow-plan'),contextRecordRef:prepared.recordRef});assert.equal(f.ctx.sessions.list().length,0);
 const pre=await bind('flow-preview');const preview=await f.ok('workerPreview',{taskRef,actionRef:action.actionRef,actionDigest:action.actionDigest,recordRef:prepared.recordRef,expectedTaskVersion:pre.expectedTaskVersion,expectedAuthEpoch:pre.expectedAuthEpoch});assert.match(preview.description.targetLabel,/unencrypted/);
 await f.ok('workerGrant',{...await bind('flow-grant'),actionRef:action.actionRef,actionDigest:action.actionDigest,expiresAt:Date.now()+59000,previewRef:preview.previewRef,accept:true});assert.equal(f.ctx.sessions.list().length,0);
 const created=await f.ok('workerCreate',{...await bind('flow-create'),actionRef:action.actionRef,actionDigest:action.actionDigest});assert.equal(created.worker.phase,'ready');assert.equal(f.ctx.sessions.list().length,1);assert.equal(f.ctx.agents.list()[0].status,'idle');
 const refs={taskRef,actionRef:action.actionRef,claimRef:created.worker.claimRef,generationRef:created.worker.generationRef};
 const execute=await f.ok('workerExecute',{...await bind('flow-execute'),...refs,actionDigest:action.actionDigest,contextRecordRef:prepared.recordRef});assert.equal(execute.execution.state,'committed');assert.equal(execute.execution.usage.state,'actual');assert.ok(execute.execution.usage.units>0);
 const capture=await f.ok('workerCapture',{...await bind('flow-capture'),...refs,executionRef:execute.execution.executionRef});assert.equal(capture.verification,null);assert.equal(f.ctx.sessions.list().length,1);
 const read=await bind('flow-read'),result=await f.ok('workerResult',{taskRef,artifactRef:capture.artifactRef,version:1,expectedTaskVersion:read.expectedTaskVersion,expectedAuthEpoch:read.expectedAuthEpoch});assert.match(result.content,/^Synthetic local result; approved input SHA-256: [a-f0-9]{64}\.$/);assert.equal(result.verification,'not-reviewed');assert.equal(result.delivery,'not-requested');
 const finished=await f.ok('workerFinish',{...await bind('flow-finish'),...refs,executionRef:execute.execution.executionRef});assert.equal(finished.outcome,'completed');assert.equal(finished.reservationHeld,false);assert.equal(f.ctx.sessions.list().length,0);
});

test('normal client consumes actual original encrypted-core/native receipts through all explicit create operations',async t=>{
 const f=await fixture(t);const{createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const React={Fragment:'fragment',createElement:()=>null,useSyncExternalStore:(_,get)=>get(),useState:()=>['',()=>{}],useEffect:()=>{}};
 const client=require('../src/client-entry.cjs')(()=>React);let count=0;
 // This no-listener fixture has the real df-rpc bridge. Cached workerStatus is
 // explicitly read from the actual child diagnostics; it is not a setup/auth proof.
 const rpc={async call(channel,endpoint,value,signal){if(signal.aborted)throw new Error('REQUEST_ABORTED');if(channel==='/df-setup'){assert.equal(endpoint,'v1/workerStatus');return{ok:true,value:f.status()};}assert.equal(channel,'/df-rpc');const result=await f.call(endpoint.slice(3),value);return result.ok?{ok:true,value:result.value}:{ok:false,error:result.error};}};
 const options={clock:Date.now,uuid:()=>`actual-client-${++count}`,digest:async text=>command(text)};
 const model=client.createModel(rpc,options),worker=client.createWorkerModel(rpc,model,options);t.after(()=>{worker.dispose();model.dispose();});
 await f.ok('intake',{taskId:'native-client-flow',provider:'synthetic',source:'local',eventId:'client-one',commandRef:command('actual-client-intake'),goal:'Synthetic client-approved context'});
 await model.refresh();assert.equal(model.getSnapshot().phase,'ready');assert.equal(model.getSnapshot().stale,false);assert.equal(await worker.refresh(),true);assert.equal(await worker.catalog(),true);
 assert.equal(await worker.previewPolicy(worker.getSnapshot().status.policyVersion),true);worker.setPolicyAccepted(true);assert.equal(await worker.confirmPolicy(),true);
 assert.equal(await worker.prepareContext(),true,JSON.stringify(worker.getSnapshot()));assert.equal(await worker.plan(),true,JSON.stringify({worker:worker.getSnapshot(),task:model.getSnapshot()}));assert.equal(await worker.previewAction(),true,JSON.stringify(worker.getSnapshot()));assert.equal(await worker.create(),false);
 worker.setActionAccepted(true);assert.equal(await worker.grant(Date.now()+59000),true,JSON.stringify(worker.getSnapshot()));assert.equal(await worker.create(),true,JSON.stringify(worker.getSnapshot()));assert.equal(f.ctx.agents.list()[0].status,'idle');
 assert.equal(await worker.execute(),true,JSON.stringify(worker.getSnapshot()));assert.equal(worker.getSnapshot().execution.state,'committed');assert.equal(await worker.execute(),false);
 assert.equal(await worker.capture(),true,JSON.stringify(worker.getSnapshot()));assert.equal(await worker.loadResult(),true,JSON.stringify(worker.getSnapshot()));assert.equal(worker.getSnapshot().result.verification,'not-reviewed');assert.equal(worker.getSnapshot().result.delivery,'not-requested');
 assert.equal(await worker.finish(),true,JSON.stringify(worker.getSnapshot()));assert.equal(worker.getSnapshot().worker.phase,'stopped');assert.equal(f.ctx.sessions.list().length,0);
});

function barrier() { let entered, release; const entry=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});return{entry,release,async wait(){entered();await gate;}}; }
function ledgerCounts(f) { const db=new DatabaseSync(join(f.dir,'ledger.sqlite'),{readOnly:true});try{return{reservations:db.prepare('SELECT count(*) AS n FROM reservations').get().n,artifacts:db.prepare("SELECT count(*) AS n FROM runtime_records WHERE kind='artifact'").get().n,workers:db.prepare('SELECT payload FROM runtime_workers').all().map(row=>JSON.parse(row.payload))};}finally{db.close();} }
async function planned(f,tag) {
 const policy=await f.ok('workerPolicyPreview',{expectedPolicyVersion:1});await f.ok('workerPolicyConfirm',{previewRef:policy.previewRef,planDigest:policy.planDigest,commandRef:command(tag+'-policy'),expectedPolicyVersion:1,accept:true});
 const {task}=await f.ok('intake',{taskId:tag,provider:'synthetic',source:'local',eventId:tag,commandRef:command(tag+'-intake'),goal:'Bounded synthetic guard race'}),taskRef=task.taskRef;
 const bind=async suffix=>{const {task}=await f.ok('status',{taskRef});return{taskRef,commandRef:command(tag+'-'+suffix),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch};};
 const prepared=await f.ok('prepareContext',{...await bind('context'),terms:[],now:Date.now()}),action=await f.ok('workerPlan',{...await bind('plan'),contextRecordRef:prepared.recordRef});
 const version=await bind('preview'),preview=await f.ok('workerPreview',{taskRef,actionRef:action.actionRef,actionDigest:action.actionDigest,recordRef:prepared.recordRef,expectedTaskVersion:version.expectedTaskVersion,expectedAuthEpoch:version.expectedAuthEpoch});
 await f.ok('workerGrant',{...await bind('grant'),actionRef:action.actionRef,actionDigest:action.actionDigest,expiresAt:Date.now()+59000,previewRef:preview.previewRef,accept:true});
 return{taskRef,action,prepared,bind};
}
async function executed(f,plan) {
 const {action,prepared,taskRef,bind}=plan,created=await f.ok('workerCreate',{...await bind('create'),actionRef:action.actionRef,actionDigest:action.actionDigest});
 const refs={taskRef,actionRef:action.actionRef,claimRef:created.worker.claimRef,generationRef:created.worker.generationRef};
 const result=await f.ok('workerExecute',{...await bind('execute'),...refs,actionDigest:action.actionDigest,contextRecordRef:prepared.recordRef});assert.equal(result.execution.state,'committed');return{refs,executionRef:result.execution.executionRef};
}
for(const code of ['REQUEST_ABORTED','OPERATOR_REQUIRED','SERVICE_DISPOSED']) {
 test(`normal ${code} after original asynchronous preparation refuses claim and native create`,async t=>{
  let denial=null;
  const f=await fixture(t,{interceptComposition:value=>({...value,worker:{...value.worker,environments:{...value.worker.environments,inspect(token,callback){const result=value.worker.environments.inspect(token,callback);queueMicrotask(()=>{denial=code;});return result;}}}})}),plan=await planned(f,'prepare-'+code);
  const payload={...await plan.bind('create'),actionRef:plan.action.actionRef,actionDigest:plan.action.actionDigest};
  await assert.rejects(f.privateOperations().workerCreate(payload,{assertCurrent(){if(denial)throw new BootstrapError(denial);return true;}}),{code});
  assert.deepEqual(ledgerCounts(f),{reservations:0,artifacts:0,workers:[]});assert.equal(f.ctx.agents.list().length,0);assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(join(f.dir,'df-sessions')),false);
 });
 test(`normal ${code} after actual persisted result validation refuses artifact write`,async t=>{
  const gate=barrier();let denial=null;
  const f=await fixture(t,{interceptComposition:value=>({...value,nativeHooks:{...value.nativeHooks,async validateResult(...args){const result=await value.nativeHooks.validateResult(...args);await gate.wait();return result;}}})});t.after(()=>gate.release());
  const plan=await planned(f,'capture-'+code),execution=await executed(f,plan),payload={...await plan.bind('capture'),...execution.refs,executionRef:execution.executionRef};
  const pending=f.privateOperations().workerCapture(payload,{assertCurrent(){if(denial)throw new BootstrapError(denial);return true;}}),checked=assert.rejects(pending,{code});
  await gate.entry;denial=code;gate.release();await checked;
  const facts=ledgerCounts(f);assert.equal(facts.artifacts,0);assert.equal(facts.reservations,1);assert.equal(facts.workers.length,1);assert.equal(f.ctx.agents.list().length,1);
 });
 test(`normal ${code} after actual native stop preserves factual stop and held reservation`,async t=>{
  const f=await fixture(t),plan=await planned(f,'finish-'+code),execution=await executed(f,plan);await f.ok('workerCapture',{...await plan.bind('capture'),...execution.refs,executionRef:execution.executionRef});
  let denial=null,disposed=0;const remove=f.ctx.on('agent/disposed',({agent})=>{if(agent.id==='df-'+execution.refs.generationRef){disposed++;denial=code;}});t.after(remove);
  await assert.rejects(f.privateOperations().workerFinish({...await plan.bind('finish'),...execution.refs,executionRef:execution.executionRef},{assertCurrent(){if(denial)throw new BootstrapError(denial);return true;}}),{code});
  assert.equal(disposed,1);assert.equal(f.ctx.agents.list().length,0);assert.equal(f.ctx.sessions.list().length,0);
  const facts=ledgerCounts(f);assert.equal(facts.reservations,1);assert.equal(facts.artifacts,1);assert.equal(facts.workers[0].phase,'stopped');
  const observed=await f.ok('workerQuery',execution.refs);assert.equal(observed.worker.phase,'stopped');assert.equal(ledgerCounts(f).reservations,1);
 });
}
test('installed generic manager aliases refuse before composition while task-memory remains usable',async t=>{
 const f=await fixture(t);for(const name of ['dispatch','execute','query','sessionLink','handoff','captureResult'])assert.equal((await f.call(name,{})).error.code,'WORKER_REQUEST_DENIED',name);
 assert.equal(f.ctx.agents.list().length,0);assert.equal(f.ctx.sessions.list().length,0);assert.equal(f.ctx.df.diagnostics().capabilities.worker,false);
 const {task}=await f.ok('intake',{taskId:'aliases',provider:'synthetic',source:'local',eventId:'aliases',commandRef:command('aliases-intake'),goal:'Retain task-memory capability'});const result=await f.ok('prepareContext',{taskRef:task.taskRef,commandRef:command('aliases-context'),expectedTaskVersion:task.version,expectedAuthEpoch:task.authEpoch,terms:[],now:Date.now()});assert.equal(result.kind,'context');
});
test('owned runtime shutdown persists actual native stopped fact without settlement or new work',async t=>{
 const f=await fixture(t),plan=await planned(f,'shutdown');await f.ok('workerCreate',{...await plan.bind('create'),actionRef:plan.action.actionRef,actionDigest:plan.action.actionDigest});
 assert.equal(ledgerCounts(f).reservations,1);await f.child.dispose();
 const facts=ledgerCounts(f);assert.equal(facts.reservations,1);assert.equal(facts.artifacts,0);assert.equal(facts.workers[0].phase,'stopped');assert.equal(f.ctx.agents.list().length,0);assert.equal(f.ctx.sessions.list().length,0);
});
test('fresh query after denied native publication returns the post-observation authoritative task',async t=>{
 const gate=barrier();let aborted=false;
 const f=await fixture(t,{interceptComposition:value=>({...value,nativeHooks:{...value.nativeHooks,async setupAgent(...args){const result=await value.nativeHooks.setupAgent(...args);await gate.wait();return result;}}})});t.after(()=>gate.release());
 const plan=await planned(f,'query-after-publication-loss'),pending=f.privateOperations().workerCreate({...await plan.bind('create'),actionRef:plan.action.actionRef,actionDigest:plan.action.actionDigest},{assertCurrent(){if(aborted)throw new BootstrapError('REQUEST_ABORTED');return true;}}),checked=assert.rejects(pending,{code:'REQUEST_ABORTED'});
 await gate.entry;aborted=true;gate.release();await checked;
 const before=await f.ok('status',{taskRef:plan.taskRef}),worker=before.workers[0];assert.equal(worker.phase,'submitted');assert.equal(ledgerCounts(f).reservations,1);
 const result=await f.ok('workerQuery',{taskRef:plan.taskRef,actionRef:plan.action.actionRef,claimRef:worker.claimRef,generationRef:worker.generationRef}),after=await f.ok('status',{taskRef:plan.taskRef});
 assert.equal(result.worker.phase,'unknown');assert.equal(after.task.status,'recovery_required');assert.ok(after.task.version>before.task.version);
 assert.deepEqual(result.task,after.task,'query reply must include its actual newly recorded observation');assert.equal(ledgerCounts(f).reservations,1);assert.equal(f.ctx.agents.list().length,0);
});
test('installed generic control commits and stops under its actual original owner invocation',async t=>{
 const f=await fixture(t),plan=await planned(f,'control-current');await f.ok('workerCreate',{...await plan.bind('create'),actionRef:plan.action.actionRef,actionDigest:plan.action.actionDigest});
 const controlled=await f.ok('control',{...await plan.bind('cancel'),kind:'cancel'});assert.equal(controlled.workers[0].phase,'stopped');assert.equal(controlled.receipt.task.status,'cancel_requested');
 assert.equal(f.ctx.agents.list().length,0);assert.equal(ledgerCounts(f).reservations,1);assert.equal(ledgerCounts(f).workers[0].phase,'stopped');
});
test('actual original response-close signal after native stop retains control and held stopped facts',async t=>{
 const f=await fixture(t),plan=await planned(f,'control-response-loss');await f.ok('workerCreate',{...await plan.bind('create'),actionRef:plan.action.actionRef,actionDigest:plan.action.actionDigest});
 let response,stops=0;const remove=f.ctx.on('agent/disposed',()=>{stops++;assert.equal(response.writableEnded,false);response.emit('close');});t.after(remove);
 const result=await f.call('control',{...await plan.bind('cancel'),kind:'cancel'},true,value=>{response=value;});assert.equal(stops,1);assert.equal(result.text,'','the original aborted HTTP response carries no acknowledgement');
 const observed=await f.ok('status',{taskRef:plan.taskRef});assert.equal(observed.task.status,'cancel_requested');assert.equal(ledgerCounts(f).workers[0].phase,'stopped');assert.equal(ledgerCounts(f).reservations,1);assert.equal(f.ctx.agents.list().length,0);
});
test('actual original response-close signal before owner control leaves the worker and task unchanged',async t=>{
 const f=await fixture(t),plan=await planned(f,'control-loss-first');await f.ok('workerCreate',{...await plan.bind('create'),actionRef:plan.action.actionRef,actionDigest:plan.action.actionDigest});
 const payload={...await plan.bind('cancel'),kind:'cancel'},before=await f.ok('status',{taskRef:plan.taskRef});
 const result=await f.call('control',payload,true,response=>{queueMicrotask(()=>response.emit('close'));});assert.equal(result.text,'');
 const after=await f.ok('status',{taskRef:plan.taskRef});assert.deepEqual(after.task,before.task);assert.equal(after.workers[0].phase,'ready');assert.equal(f.ctx.agents.list().length,1);assert.equal(ledgerCounts(f).reservations,1);
});
