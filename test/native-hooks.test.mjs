import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveHostSource } from '../src/host-probe.mjs';
import { WorkerManager } from '../src/worker.mjs';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { NativeAdapter } from '../src/native-adapter.mjs';
import { EnvironmentRegistry, workerDigest as d } from '../src/environment.mjs';
import { getTestingProviderBinding, TESTING_SYSTEM_PROMPT } from '../src/testing-provider.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const load=x=>import(pathToFileURL(resolveHostSource('@deepseek-ai/'+x)).href);
const {Context}=await load('cordis');
const {default:Loader}=await load('cordis-plugin-loader');
const {default:SessionStore}=await load('dsh-session');
const {default:Projection}=await load('dsh-session-projection');
const {default:Approval,setApprovalPolicy}=await load('dsh-user-approval');
const Persistence=await load('dsh-session-persistence-jsonl'); // rc.2 plugin namespace
const {AgentRegistry}=await load('dsh-agent');
const {LlmRuntime}=await load('dsh-llm');
const {default:SystemPrompt}=await load('dsh-system-prompt');
const {default:Tools}=await load('dsh-tools');
const {default:Loop}=await load('dsh-agent-loop');
async function fixture(t,{commit=true,bind=true,lateSetup,validationFault=false,ledgerTask,preparedContext,assertCurrent=()=>true}={}){
 const directory=mkdtempSync(join(realpathSync(tmpdir()),'df-ni2-hooks-')),ctx=new Context(),fibers=[];let providerEntry,adapter,ticket,permit;const trace=[];
 ctx.logger.exporters?.clear?.();
 t.after(async()=>{if(ticket)await adapter.shutdown(ticket);await providerEntry?.fiber.dispose();for(const f of fibers.reverse())await f.dispose();rmSync(directory,{recursive:true,force:true});});
 async function install(p,c){const f=ctx.plugin(p,c);fibers.push(f);await f;}
 await install(Projection);await install(SessionStore);await install(Approval,{policy:'never'});await install(Persistence,{root:join(directory,'df-sessions'),compression:'none'});await install(AgentRegistry);await install(LlmRuntime);await install(SystemPrompt,{});await install(Tools,{});await install(Loop,{agents:[],maxParallelToolCalls:1});await install(Loader,{baseUrl:new URL('../',import.meta.url).href});
 const id=await ctx.loader.create({name:'dsh-fishball/testing-provider',config:{}});await ctx.loader.await();providerEntry=ctx.loader.resolve(id);const provider=getTestingProviderBinding(ctx);
 const env={environmentRef:d('env'),workspaceRef:ledgerTask?.workspaceRef??d('workspace'),bindingDigest:d('binding'),toolsDigest:d('tools'),permissionPolicyDigest:d('permission'),cwd:directory,root:directory,provider:'df-testing-local',model:'df-testing-worker-v1',reasoningEffort:'deterministic',modelRef:d('model'),reasoningRef:d('effort'),presetRef:d('preset')};
 const registry=new EnvironmentRegistry({entries:[env],currentState:()=>d('current')});const environments={bind:(...v)=>registry.bind(...v),assertCurrent:v=>registry.assertCurrent(v),inspect:(v,cb)=>registry.inspect(v,c=>cb({...c,maxOutputTokens:128}))};
 const content=preparedContext??JSON.stringify({contractVersion:'df.execution-context/v1',content:'Synthetic local context'});
 const spec={actionRef:d('action'),kind:'write',role:'worker',targetDigest:d('target'),dataDigest:hash(content),units:1,charges:{runtimeMs:1,usageUnits:4224,costEstimateMicros:0},attemptGroupRef:d('attempt'),attemptIndex:1,resourcePolicyVersion:2,modelPolicyVersion:1,executor:{mode:'create',generationRef:d(directory),environmentRef:env.environmentRef,bindingDigest:env.bindingDigest,toolsDigest:env.toolsDigest,permissionPolicyDigest:env.permissionPolicyDigest},model:{modelRef:env.modelRef,reasoningRef:env.reasoningRef,presetRef:env.presetRef,catalogEvidenceRef:d('catalog')}};
 const hooks={async setupAgent(agentCtx,agent,binding){trace.push('setup');assert.equal(binding.options.maxTokens,128);await lateSetup?.();agentCtx.tools.restrict({allow:[]});agentCtx.systemPrompt.section({name:'df-only',order:0,text:TESTING_SYSTEM_PROMPT,complete:true,interpolate:false});agentCtx.systemPrompt.suppressRuntimeContext();setApprovalPolicy(agent.session,'never');},commitAgent(){trace.push('commit');return commit;},bindExecution(agent,execution,context){trace.push('bind');if(!bind)return false;permit=provider.issue({agent,executionRef:execution.executionRef,content:context.content,maxOutputTokens:128,requestBytes:4096,resultBytes:128,usageUnits:4224,assertCurrent});return true;},async validateResult(agent,result){trace.push('validate');if(validationFault)throw Error('PRIVATE_CANARY');assert.equal(await ctx.sessions.flush(agent.session),true);const read=await ctx.sessionPersistence.open(agent.id,'read');try{const log=await read.read(0,128);assert.ok(log.events.some(e=>e.seq===result.cursor&&e.type==='assistant/message'));assert.ok(log.events.some(e=>e.type==='user/message'&&e.data.id===result.executionRef));}finally{await read.close();}const usage=permit.usage();assert.equal(usage.resultDigest,result.digest);return{usageUnits:usage.totalUnits,evidenceRef:d('persisted-result',result.digest),resultDigest:result.digest};}};
 adapter=new NativeAdapter(ctx,{environments,permission:()=>true,toolGuard:({schemas})=>schemas.length===0,nativeHooks:hooks});
 const task=ledgerTask??{taskRef:d('task'),workspaceRef:env.workspaceRef,version:1,authEpoch:0};ticket=await adapter.prepare(spec,task,d('actionDigest'));adapter.bindClaim(ticket,{actionRef:spec.actionRef,claimRef:d('claim'),reservationRef:d('reservation'),actionDigest:d('actionDigest'),generationRef:spec.executor.generationRef},()=>true);
 const execution={executionRef:d('exec'),taskRef:task.taskRef,claimRef:d('claim'),generationRef:spec.executor.generationRef,contextRecordRef:d('context'),actionDigest:d('actionDigest'),dataDigest:spec.dataDigest};
 const context={recordRef:execution.contextRecordRef,kind:'context',content,digest:hash(content),byteLength:Buffer.byteLength(content)};
 return{directory,ctx,adapter,spec,ticket,trace,execution,context,usage:()=>permit?.usage(),send:()=>adapter.executeContext(ticket,execution,context,()=>({...execution,admitted:true,state:'dispatch_intent'}))};
}
test('installed native hooks keep original creation idle, bind one actual request, validate scoped persisted output and stop only owned handle',async t=>{
 const f=await fixture(t);assert.equal(existsSync(join(f.directory,'df-sessions')),false);assert.equal(f.usage(),undefined);
 assert.equal((await f.adapter.create(f.ticket)).phase,'created');assert.deepEqual(f.trace,['setup','commit']);assert.equal(f.usage(),undefined);
 const result=await f.send();assert.equal(result.state,'committed');assert.ok(f.usage()?.totalUnits>0);
 const captured=await f.adapter.validateResult(f.ticket,f.execution.executionRef);assert.equal(captured.usageUnits,f.usage().totalUnits);
 const stopped=await f.adapter.finishExecution(f.ticket,f.execution.executionRef);assert.equal(stopped.worker.phase,'stopped');assert.equal(stopped.usageUnits,captured.usageUnits);assert.equal(f.ctx.sessions.list().length,0);
});
test('false final unpublished hook never publishes an owned agent or mints execution permit',async t=>{const f=await fixture(t,{commit:false});await assert.rejects(f.adapter.create(f.ticket),{code:'WORKER_CREATE_UNKNOWN'});assert.equal(f.ctx.agents.list().length,0);assert.equal(f.usage(),undefined);});
test('false execution hook after durable admission never enters source-owned adapter',async t=>{const f=await fixture(t,{bind:false});await f.adapter.create(f.ticket);await assert.rejects(f.send(),{code:'WORKER_REQUEST_DENIED'});assert.equal(f.usage(),undefined);await assert.rejects(f.adapter.validateResult(f.ticket,f.execution.executionRef),{code:'WORKER_RESULT_UNAVAILABLE'});});
test('finish refuses uncaptured native output and does not dispose the original live worker',async t=>{const f=await fixture(t);await f.adapter.create(f.ticket);await f.send();await assert.rejects(f.adapter.finishExecution(f.ticket,f.execution.executionRef),{code:'WORKER_FINISH_UNAVAILABLE'});assert.equal(f.ctx.sessions.list().length,1);});

test('shared factual finish requires private validated capture, releases only actual stopped usage, survives revoked grant and deduplicates exact command',async t=>{
 const directory=mkdtempSync(join(realpathSync(tmpdir()),'df-ni2-finish-')),owner={},host={};
 const store=new RuntimeStore({databasePath:join(directory,'ledger.sqlite'),encryptionKey:Buffer.alloc(32,8),principals:[{handle:owner,role:'owner',scope:{ownerId:'ni2-synthetic-owner',workspaceId:'ni2-synthetic-workspace'}},{handle:host,role:'host',scope:{ownerId:'ni2-synthetic-owner',workspaceId:'ni2-synthetic-workspace'}}],hostPermission:()=>true});
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 const task=store.intake(owner,{taskId:'ni2-finish',provider:'fixture',source:'local',eventId:'one',commandRef:d('intake'),goal:'Produce bounded synthetic output'}).task;
 const bind=command=>{const current=store.task(owner,task.taskRef);return{taskRef:task.taskRef,commandRef:d(command),expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch};};
 store.policy(owner,{commandRef:d('policy'),expectedVersion:1,limits:{maxActive:1,maxAttempts:1,maxTotalAttempts:1,maxUsageUnits:100000},modelPolicy:{version:1,presetRefs:[d('preset')],catalogEvidenceRef:d('catalog')}});
 const tokenize=text=>Buffer.byteLength(text),memory=new MemoryAdapter({store,handle:owner,namespaceRef:d('memory'),tokenize,contextAssembler:new ContextAssembler({store,tokenize})});
 const prepared=await memory.prepareExecutionContext({...bind('prepare'),terms:[],now:Date.now()}),data=store.readData(owner,{taskRef:task.taskRef,recordRef:prepared.recordRef});
 let nativeBinding;
 const f=await fixture(t,{ledgerTask:store.task(owner,task.taskRef),preparedContext:data.content,assertCurrent:()=>{store.assertNativeRequestCurrent(host,nativeBinding);return true;}});
 const manager=new WorkerManager({store,hostHandle:host,adapter:f.adapter});
 try{
 const action=store.planAction(owner,{...bind('plan'),spec:f.spec});store.grantAction(owner,{...bind('grant'),actionRef:action.actionRef,actionDigest:action.actionDigest,expiresAt:Date.now()+60000});
 const worker=await manager.dispatch(owner,{...bind('create'),actionRef:action.actionRef,actionDigest:action.actionDigest});assert.equal(worker.phase,'ready');
 const executeInput={...bind('execute'),actionRef:action.actionRef,actionDigest:action.actionDigest,claimRef:worker.claimRef,generationRef:worker.generationRef,contextRecordRef:prepared.recordRef};
 // Observe the actual host execution binding, not a caller current flag.
 const originalBegin=store.beginContextExecution.bind(store);store.beginContextExecution=(h,input)=>{const receipt=originalBegin(h,input);nativeBinding={taskRef:input.taskRef,claimRef:input.claimRef,generationRef:input.generationRef,actionDigest:input.actionDigest,executionRef:receipt.executionRef};return receipt;};
 const executed=await manager.executeContext(owner,executeInput);assert.equal(executed.state,'committed');
 const refs={taskRef:task.taskRef,actionRef:action.actionRef,claimRef:worker.claimRef,generationRef:worker.generationRef,executionRef:executed.executionRef};
 await assert.rejects(manager.finishExecution(owner,{...refs,...bind('too-early')}),{code:'WORKER_FINISH_UNAVAILABLE'});
 await manager.captureValidatedResult(owner,{...refs,...bind('capture'),artifactRef:d('local-artifact'),version:1});
 const captured=store.snapshot(owner,{taskRef:task.taskRef});assert.equal(captured.actions[0].releaseEvidenceRef,null);assert.equal(f.ctx.sessions.list().length,1);
 store.revokeAction(owner,{...bind('revoke'),actionRef:action.actionRef,actionDigest:action.actionDigest});
 const finish={...refs,...bind('finish')},receipt=await manager.finishExecution(owner,finish);assert.equal(receipt.reservationHeld,false);assert.equal(receipt.outcome,'completed');
 assert.equal(f.ctx.sessions.list().length,0);const finished=store.snapshot(owner,{taskRef:task.taskRef});assert.ok(finished.actions[0].releaseEvidenceRef);assert.equal(finished.actions[0].usageUnits,f.usage().totalUnits);assert.equal(finished.actions[0].usageState,'actual');assert.equal(finished.actions[0].attempts,1);assert.equal(finished.policy.limits.maxTotalAttempts,1);
 assert.deepEqual(await manager.finishExecution(owner,finish),receipt);
 await assert.rejects(manager.finishExecution(owner,{...finish,commandRef:d('different-finish')}),{code:'WORKER_FINISH_UNAVAILABLE'});
 }finally{await manager.close();}
});

test('throwing durability callback refuses capture with a stable code and leaves the owned worker live',async t=>{
 const f=await fixture(t,{validationFault:true});await f.adapter.create(f.ticket);await f.send();
 await assert.rejects(f.adapter.validateResult(f.ticket,f.execution.executionRef),error=>error.code==='WORKER_RESULT_UNAVAILABLE'&&!String(error).includes('PRIVATE_CANARY'));
 await assert.rejects(f.adapter.finishExecution(f.ticket,f.execution.executionRef),{code:'WORKER_FINISH_UNAVAILABLE'});assert.equal(f.ctx.sessions.list().length,1);
});
