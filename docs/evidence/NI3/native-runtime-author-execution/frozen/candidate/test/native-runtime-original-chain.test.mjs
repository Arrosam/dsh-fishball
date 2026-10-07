import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, chmodSync, rmSync, lstatSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { resolveHostSource } from '../src/host-probe.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { createInstalledWorker } from '../src/installed-worker.mjs';
import { createInstalledAudit } from '../src/installed-audit.mjs';
import { hash } from '../src/runtime-security.mjs';
const load=name=>import(pathToFileURL(resolveHostSource('@deepseek-ai/'+name)).href);
const {Context}=await load('cordis'),{default:Sessions}=await load('dsh-session'),{default:Projections}=await load('dsh-session-projection'),{default:Approval}=await load('dsh-user-approval'),{AgentRegistry}=await load('dsh-agent'),{LlmRuntime}=await load('dsh-llm'),{default:Tools}=await load('dsh-tools'),{default:Prompt}=await load('dsh-system-prompt'),{default:Presets}=await load('dsh-agent-preset-registry'),{default:Loader}=await load('cordis-plugin-loader'),{WebServer}=await load('dsh-host-webserver'),{HostConnectionService}=await load('dsh-client-connection');
class Response extends Writable{constructor(){super();this.parts=[];}_write(chunk,encoding,done){this.parts.push(Buffer.from(chunk));done();}writeHead(status){this.statusCode=status;}}
// Future separately held executable fixture: original public in-process
// services and JSONL persistence, one synthetic source-owned provider, no
// server.listen/HTTP/network/live accounts/tools/external inference.
async function fixture(t){
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'df-ni3-original-chain-'));chmodSync(dir,0o700);const data=join(dir,'data'),environment=join(dir,'environment');mkdirSync(data,{mode:0o700});mkdirSync(environment,{mode:0o700});
 const ctx=new Context(),baseUrl=new URL('../',import.meta.url).href;ctx.baseUrl=baseUrl;ctx.logger.exporters?.clear?.();ctx.provide('profileContext',{dir,name:'ni3-synthetic'});
 const install=async(plugin,config)=>{const fiber=ctx.plugin(plugin,config);await fiber;assert.equal(fiber.state,2);return fiber;};
 t.after(async()=>{try{await ctx.fiber.dispose();}finally{rmSync(dir,{recursive:true,force:true});}});
 let server;await install({apply(child){server=new WebServer(child,{host:'127.0.0.1',port:3080,compression:'none'});}});assert.equal(server.server,undefined);
 await install(Projections);await install(Sessions);await install(Approval,{policy:'never'});await install(AgentRegistry);await install(LlmRuntime);await install(Prompt,{});await install(Tools,{});await install(Loader,{baseUrl});
 const entry=async(name,config)=>{const id=await ctx.loader.create({name,config});await ctx.loader.await();const e=ctx.loader.resolve(id);assert.equal(e.fiber.state,2);return e;};
 const directory=join(data,'df-sessions');await entry('@deepseek-ai/dsh-session-persistence-jsonl',{root:directory,compression:'none'});await entry('@deepseek-ai/dsh-agent-loop',{agents:[],maxParallelToolCalls:1});await install(Presets,{default:'ni3-empty'});await ctx.agentPresets.register({id:'ni3-empty',plugins:[]});await entry('dsh-fishball/testing-provider',{});
 await install({name:'ni3-source-connection',inject:['webServer'],apply(child){new HostConnectionService(child,[],{isAuthenticated:req=>req.headers['x-synthetic-auth']==='approved'});}});
 const selection=model=>({provider:'df-testing-local',model,agentPreset:'ni3-empty',reasoningEffort:'deterministic',maxOutputTokens:model==='df-testing-worker-v1'?128:2048});
 const worker={enabled:true,selection:selection('df-testing-worker-v1'),environment:{root:environment,cwd:environment},persistence:{directory,compression:'none',retention:'owner-managed'},bounds:{requestBytes:131072,resultBytes:2048},policy:{maxRuntimeMs:60000,maxUsageUnits:600000,maxCostEstimateMicros:0},charges:{runtimeMs:1000,usageUnits:135168},previewTtlMs:60000,grantTtlMs:60000};
 const audit={enabled:true,inputByteLimit:65536,resultByteLimit:2048,maxPrivateReviewers:1,blockingSeverities:['blocking','fatal'],maxRepairRounds:1,maxTotalAttempts:4,review:{selection:selection('df-testing-review-v1'),charges:{runtimeMs:1000,usageUnits:135168}},repair:{selection:selection('df-testing-repair-v1'),charges:{runtimeMs:1000,usageUnits:135168}}};
 const identity={ownerId:'ni3-original-owner',workspaceId:'ni3-original-workspace'},profile={dir,name:'ni3-synthetic'};
 await install(createRuntimePlugin({identity:()=>identity,encryptionKey:()=>Buffer.alloc(32,71),memory:{namespaceRef:hash('ni3-memory'),tokenize:text=>Buffer.byteLength(text),byteLimit:65536,tokenLimit:131072},...createInstalledWorker({selection:worker,auditSelection:audit,identity,profile}),...createInstalledAudit({selection:audit,worker,identity,profile}),installedAuditSelection:audit,installedWorkerSelection:worker}),{databasePath:join(data,'runtime.sqlite'),limits:{maxMetadataBytes:4096}});
 let serial=0;const command=()=>hash('ni3-command-'+(++serial));
 async function call(name,payload={}){const method='v1/'+name,envelope={type:'client-request',rpcId:'ni3-fixture-'+serial,method,payload},req=Readable.from([Buffer.from(JSON.stringify(envelope))]);Object.assign(req,{method:'POST',url:'/df-rpc/'+method,headers:{host:'127.0.0.1:3080',origin:'http://127.0.0.1:3080','content-type':'application/json','x-synthetic-auth':'approved'}});const response=new Response();await server.prefixes.get('/df-rpc').handler(req,response);assert.equal(response.statusCode,200);const result=JSON.parse(Buffer.concat(response.parts).toString()).result;assert.equal(result.ok,true,name+': '+JSON.stringify(result.error));return result.value;}
 const intake=await call('intake',{taskId:'ni3-original-task',provider:'fixture',source:'local',eventId:'one',commandRef:command(),goal:'Synthetic local audit chain; no semantic completion'}),taskRef=intake.task.taskRef;
 const task=async()=>(await call('status',{taskRef})).task,cas=async()=>{const t=await task();return{taskRef,commandRef:command(),expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch};};
 return{ctx,call,command,taskRef,task,cas,directory};
}
const leafFact = directory => { const s = lstatSync(directory); return { dev: s.dev, ino: s.ino, uid: s.uid, mode: s.mode & 0o777 }; };
// Independently read the real original backend after each stream and again
// after finish. These are read handles, never session recreation or replay.
async function persisted(f, worker, executionRef, sourceKind) {
  const id = 'df-' + worker.generationRef, stat = await f.ctx.sessionPersistence.stat(id);
  assert.ok(stat && stat.sizeBytes > 0 && stat.sizeBytes <= 1048576);
  const read = await f.ctx.sessionPersistence.open(id, 'read');
  try {
    assert.equal(read.id, id); assert.equal(read.header.id, id);
    assert.equal(read.access, 'read'); assert.equal(read.header.isSeeded, false); assert.equal(read.inheritedEventCount, 0);
    const log = await read.read(0, 128), events = log.events;
    assert.deepEqual(events.map(e => e.seq), events.map((_, i) => i));
    const users = events.filter(e => e.type === 'user/message'), answers = events.filter(e => e.type === 'assistant/message');
    const starts = events.filter(e => e.type === 'turn/start'), ends = events.filter(e => e.type === 'turn/end');
    assert.equal(users.length, 1); assert.equal(answers.length, 1); assert.equal(starts.length, 1); assert.equal(ends.length, 1);
    assert.equal(ends[0].data.turn, starts[0].data.turn); assert.ok(ends[0].seq > answers[0].seq);
    assert.equal(users[0].data.id, executionRef); assert.equal(users[0].data.source.kind, sourceKind);
    assert.equal(events.some(e => ['tool/result', 'developer/message', 'assistant/attempt'].includes(e.type)), false);
    const content = answers[0].data.message.content;
    assert.equal(content.length, 1); assert.equal(content[0].type, 'text');
    const usage = answers[0].data.usage;
    assert.ok(Number.isSafeInteger(usage.inputTokens) && usage.inputTokens > 0);
    assert.equal(usage.outputTokens, Buffer.byteLength(content[0].text));
    assert.equal(usage.totalTokens, usage.inputTokens + usage.outputTokens); assert.ok(usage.totalTokens <= 135168);
    return { content: content[0].text, input: users[0].data.content[0].text, usage, digest: hash(content[0].text) };
  } finally { await read.close(); }
}
test('original source chain produces unknown review, fixed119 repair and fresh unknown re-review with separate charged native sessions',async t=>{
 const f=await fixture(t);assert.equal(existsSync(f.directory),false);const catalog=await f.call('workerCatalog'),policy=await f.call('workerPolicyPreview',{expectedPolicyVersion:catalog.status.policyVersion});assert.equal(policy.description.limits.maxTotalAttempts,4);assert.equal(policy.description.limits.maxAttempts,1);assert.deepEqual(Object.keys(policy.description.auditRoles).sort(),['repair','review']);
 const confirmed=await f.call('workerPolicyConfirm',{previewRef:policy.previewRef,planDigest:policy.planDigest,commandRef:f.command(),expectedPolicyVersion:policy.expectedPolicyVersion,accept:true});
 assert.equal(existsSync(f.directory),false,'catalog/policy confirmation must not allocate backend leaf');
 let allocatedLeaf;const stable=async()=>{const fresh=await f.call('workerCatalog');assert.equal(fresh.status.policyVersion,confirmed.policyVersion);assert.equal(fresh.status.phase,'ready');assert.equal(fresh.status.actionsEnabled,true);assert.deepEqual(leafFact(f.directory),allocatedLeaf);};
 let context=await f.call('prepareContext',{...await f.cas(),terms:[],now:Date.now()}),plan=await f.call('workerPlan',{...await f.cas(),contextRecordRef:context.recordRef});
 let version=await f.task(),preview=await f.call('workerPreview',{taskRef:f.taskRef,actionRef:plan.actionRef,actionDigest:plan.actionDigest,recordRef:context.recordRef,expectedTaskVersion:version.version,expectedAuthEpoch:version.authEpoch});
 await f.call('workerGrant',{...await f.cas(),actionRef:plan.actionRef,actionDigest:plan.actionDigest,expiresAt:Date.now()+30000,previewRef:preview.previewRef,accept:true});
 const producer=await f.call('workerCreate',{...await f.cas(),actionRef:plan.actionRef,actionDigest:plan.actionDigest});assert.equal(producer.worker.phase,'ready');assert.equal(f.ctx.agents.get('df-'+producer.worker.generationRef).status,'idle');allocatedLeaf=leafFact(f.directory);assert.equal(allocatedLeaf.mode,0o700);assert.equal(allocatedLeaf.uid,process.getuid());await stable();
 const mapping={actionRef:plan.actionRef,actionDigest:plan.actionDigest,claimRef:producer.worker.claimRef,generationRef:producer.worker.generationRef};
 const execution=await f.call('workerExecute',{...await f.cas(),...mapping,contextRecordRef:context.recordRef});assert.equal(execution.execution.state,'committed');const{actionDigest,...execMapping}=mapping;
 const producerLog=await persisted(f,producer.worker,execution.execution.executionRef,'df-context');assert.equal(Buffer.byteLength(producerLog.content),113);assert.equal(producerLog.digest,execution.execution.resultDigest);assert.equal(execution.execution.usage.state,'actual');assert.equal(execution.execution.usage.units,producerLog.usage.totalTokens);
 const artifact=await f.call('workerCapture',{...await f.cas(),...execMapping,executionRef:execution.execution.executionRef});const producerFinish=await f.call('workerFinish',{...await f.cas(),...execMapping,executionRef:execution.execution.executionRef});assert.equal(producerFinish.reservationHeld,false);assert.equal(producerFinish.outcome,'completed');assert.deepEqual(await persisted(f,producer.worker,execution.execution.executionRef,'df-context'),producerLog);await stable();
 const auditRef=f.command();let requirement=await f.call('configureAudit',{...await f.cas(),auditRef,expectedAuditRevision:0,artifactRef:artifact.artifactRef,artifactVersion:artifact.version,digest:artifact.digest,contextRecordRef:context.recordRef,material:[{recordRef:artifact.recordRef,digest:artifact.digest},{recordRef:context.recordRef,digest:context.digest}]});const generations=new Set([producer.worker.generationRef]),sessions=new Set([producer.worker.sessionRef]);
 async function role(purpose){await stable();const input=await f.call('prepareAuditInput',{...await f.cas(),auditRef,expectedAuditRevision:requirement.auditRevision,purpose,round:purpose==='audit_review'?requirement.round:requirement.round+1,...(purpose==='audit_repair'?{previousReportRef:requirement.reportRef}:{})});const p=await f.call('planAuditAction',{...await f.cas(),auditRef,inputRecordRef:input.recordRef,purpose}),t=await f.task(),pv=await f.call('auditPreview',{taskRef:f.taskRef,actionRef:p.actionRef,actionDigest:p.actionDigest,recordRef:input.recordRef,expectedTaskVersion:t.version,expectedAuthEpoch:t.authEpoch});assert.equal(pv.description.data.digest,input.digest);assert.notEqual(input.digest,requirement.digest);
 await f.call('auditGrant',{...await f.cas(),actionRef:p.actionRef,actionDigest:p.actionDigest,previewRef:pv.previewRef,expiresAt:Date.now()+30000,accept:true});const w=await f.call('dispatchAudit',{...await f.cas(),actionRef:p.actionRef,actionDigest:p.actionDigest});assert.ok(!generations.has(w.generationRef));assert.ok(!sessions.has(w.sessionRef));generations.add(w.generationRef);sessions.add(w.sessionRef);
 const m={actionRef:p.actionRef,actionDigest:p.actionDigest,claimRef:w.claimRef,generationRef:w.generationRef},e=await f.call('executeAudit',{...await f.cas(),...m,inputRecordRef:input.recordRef});assert.equal(e.state,'committed');const persistedLog=await persisted(f,w,e.executionRef,'df-audit-input');assert.equal(hash(persistedLog.input),input.digest);const{actionDigest,...closed}=m,collect=await f.call('collectAuditResult',{...await f.cas(),...closed,executionRef:e.executionRef});
 const before=f.ctx.agents.list().length;await f.call('auditQuery',{taskRef:f.taskRef,...closed});assert.equal(f.ctx.agents.list().length,before);const finish=await f.call('auditFinish',{...await f.cas(),...closed,executionRef:e.executionRef});assert.equal(finish.reservationHeld,false);assert.equal(finish.outcome,'completed');assert.deepEqual(await persisted(f,w,e.executionRef,'df-audit-input'),persistedLog);await stable();return{collect,input,persistedLog};}
 const review=await role('audit_review');assert.equal(review.collect.report.verdict,'unknown');assert.deepEqual(review.collect.report.coverageRefs,[]);assert.deepEqual(review.collect.report.findings,[]);assert.equal(review.collect.report.unexaminedRefs.length,2);const reviewWire=JSON.parse(review.persistedLog.content);assert.equal(reviewWire.verdict,'unknown');assert.deepEqual(reviewWire.coverageRefs,[]);assert.deepEqual(reviewWire.findings,[]);
 const detail=await f.call('status',{taskRef:f.taskRef});requirement=detail.audits.find(a=>a.auditRef===auditRef);const repair=await role('audit_repair');assert.equal(repair.collect.artifact.version,2);
 const data=await f.call('detail',{taskRef:f.taskRef,recordRef:repair.collect.artifact.recordRef,expectedTaskVersion:(await f.task()).version,expectedAuthEpoch:(await f.task()).authEpoch});assert.equal(Buffer.byteLength(data.data.content),119);assert.equal(data.data.content,repair.persistedLog.content);assert.equal(data.data.content,`Synthetic local repair; approved audit input SHA-256: ${repair.input.digest}.`);
 context=await f.call('prepareContext',{...await f.cas(),terms:[],now:Date.now()});requirement=await f.call('configureAudit',{...await f.cas(),auditRef,expectedAuditRevision:requirement.auditRevision,artifactRef:repair.collect.artifact.artifactRef,artifactVersion:2,digest:repair.collect.artifact.digest,contextRecordRef:context.recordRef,material:[{recordRef:repair.collect.artifact.recordRef,digest:repair.collect.artifact.digest},{recordRef:context.recordRef,digest:context.digest}]});const fresh=await role('audit_review');assert.equal(fresh.collect.report.verdict,'unknown');assert.equal(generations.size,4);assert.equal(sessions.size,4);assert.deepEqual(leafFact(f.directory),allocatedLeaf);assert.deepEqual(f.ctx.tools.schemas(),[]);assert.equal((await f.ctx.sessionPersistence.list()).length,4);assert.notEqual((await f.task()).status,'completed');
});
