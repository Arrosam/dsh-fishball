import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveHostSource } from '../src/host-probe.mjs';
import { getTestingProviderBinding, Config, TESTING_ACCOUNTING, TESTING_SYSTEM_PROMPT } from '../src/testing-provider.mjs';
const r = value => createHash('sha256').update(value).digest('hex');
const load = name => import(pathToFileURL(resolveHostSource(`@deepseek-ai/${name}`)).href);
const { Context } = await load('cordis');
const { default: Loader } = await load('cordis-plugin-loader');
const { default: SessionStore } = await load('dsh-session');
const { default: SessionProjectionRegistry } = await load('dsh-session-projection');
const { default: ApprovalService } = await load('dsh-user-approval');
const { AgentRegistry } = await load('dsh-agent');
const { LlmRuntime, LlmAdapter, markAgentLoopRequest } = await load('dsh-llm');
const JsonlPersistence = await load('dsh-session-persistence-jsonl'); // rc.2 plugin namespace
const { default: SystemPrompt } = await load('dsh-system-prompt');
const { default: ToolRuntime } = await load('dsh-tools');
const { default: AgentLoop } = await load('dsh-agent-loop');
async function fixture(t,{agent=false}={}) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()),'df-ni2-provider-')),ctx = new Context(),fibers=[];
  ctx.logger.exporters?.clear?.();
  let handle,entry;
  t.after(async()=>{await handle?.dispose();await entry?.fiber?.dispose();for(const fiber of fibers.reverse())await fiber.dispose();rmSync(directory,{recursive:true,force:true});});
  async function install(plugin,config){const fiber=ctx.plugin(plugin,config);fibers.push(fiber);await fiber;}
  await install(SessionProjectionRegistry);await install(SessionStore);await install(ApprovalService,{policy:'never'});
  await install(JsonlPersistence,{root:join(directory,'df-sessions'),compression:'none'});
  await install(AgentRegistry);await install(LlmRuntime);await install(SystemPrompt,{});await install(ToolRuntime,{});await install(AgentLoop,{agents:[],maxParallelToolCalls:1});
  await install(Loader,{baseUrl:new URL('../',import.meta.url).href});
  const id=await ctx.loader.create({name:'dsh-fishball/testing-provider',config:{}});await ctx.loader.await();
  entry=ctx.loader.resolve(id);const binding=getTestingProviderBinding(ctx);
  if(agent)handle=await ctx.agents.create({sessionId:`df-${r(directory)}`,meta:{cwd:directory},agentOptions:{provider:'df-testing-local',model:'df-testing-worker-v1',reasoningEffort:'deterministic',maxTokens:128}});
  const content='{"materialKind":"execution_context","content":"Synthetic approved input"}',executionRef=r('synthetic-execution');
  const request=handle?{provider:'df-testing-local',model:'df-testing-worker-v1',reasoningEffort:'deterministic',maxTokens:128,sessionId:handle.agent.id,messages:[{role:'system',id:r('synthetic-system'),source:{kind:'system-prompt'},content:[{type:'text',text:TESTING_SYSTEM_PROMPT}]},{role:'user',id:executionRef,source:{kind:'df-context',form:'local'},content:[{type:'text',text:content}]}],tools:[]}:null;
  const issue=(assertCurrent=()=>true)=>binding.issue({agent:handle.agent,executionRef,content,maxOutputTokens:128,requestBytes:4096,resultBytes:128,usageUnits:4224,assertCurrent});
  const read=async stream=>{const chunks=[];for await(const chunk of stream)chunks.push(chunk);return chunks;};
  const stream=async options=>ctx.agents.withInitiator(handle.agent,()=>read(ctx.llm.stream(options)));
  return {ctx,directory,entry,binding,handle,content,executionRef,request,issue,read,stream};
}
test('testing-provider accepts only exact empty config without executing hostile descriptors',()=>{
  assert.deepEqual(Config['~standard'].validate({}),{value:{}});let calls=0;
  for(const input of [undefined,null,[],true,{enabled:true},{provider:'free'},Object.create(null),new Proxy({},{ownKeys(){calls++;throw Error('PRIVATE_CANARY');}}),Object.defineProperty({},'x',{enumerable:true,get(){calls++;throw Error('PRIVATE_CANARY');}})])assert.deepEqual(Config['~standard'].validate(input),{issues:[{message:'CONFIG_INVALID'}]});
  assert.equal(calls,0);
});
test('actual original Loader registration supplies bounded detached synthetic metadata and no boot session/files',async t=>{
  const f=await fixture(t);
  assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(join(f.directory,'df-sessions')),false);
  assert.equal(f.entry.fiber.state,2);assert.equal(f.binding.assertCurrent(),true);assert.equal(f.binding.accounting,TESTING_ACCOUNTING);
  const providers=f.ctx.llm.listProviders();assert.ok(providers.some(row=>row.id==='df-testing-local'));
  const models=await f.ctx.llm.listModels('df-testing-local');assert.equal(models.length,1);models[0].name='mutated';
  const model=await f.ctx.llm.resolveModelInfo('df-testing-local','df-testing-worker-v1');assert.equal(model.context.contextWindow,135168);assert.equal(model.inputModalities[0],'text');assert.equal(model.reasoning.defaultEffort,'deterministic');assert.equal(model.name,'Synthetic local worker (no model quality)');
  const call=await f.ctx.llm.prepareCall({provider:'df-testing-local',model:'df-testing-worker-v1',maxTokens:128});assert.equal(call.config.reasoningEffort,'deterministic');assert.equal(call.retryPolicy.maxRetries,0);assert.deepEqual(call.retryPolicy.retryableCodes,[]);
});
test('private exact original owned request consumes once at actual iterator entry and records whole-request synthetic usage',async t=>{
  const f=await fixture(t,{agent:true}),permit=f.issue();assert.equal(permit.usage(),null);
  const result=await f.stream(f.request);assert.deepEqual(result.map(row=>row.type),['text-delta','usage','finish']);
  const output=`Synthetic local result; approved input SHA-256: ${r(f.content)}.`;
  assert.equal(result[0].text,output);assert.deepEqual(result[2].reason,{kind:'stop'});
  const inputUnits=Buffer.byteLength(JSON.stringify(f.request.messages)),outputUnits=Buffer.byteLength(output);
  assert.deepEqual(result[1].usage,{inputTokens:inputUnits,outputTokens:outputUnits,totalTokens:inputUnits+outputUnits});
  assert.deepEqual(permit.usage(),{accounting:TESTING_ACCOUNTING,inputUnits,outputUnits,totalUnits:inputUnits+outputUnits,resultDigest:r(output)});
  const again=await f.stream(f.request);assert.equal(again.some(row=>row.type==='text-delta'),false);assert.equal(again.at(-1).type,'finish');assert.equal(again.at(-1).reason.kind,'error');
  assert.throws(()=>f.issue(),{code:'WORKER_REQUEST_DENIED'});
});
test('prepared stream after unrelated original adapter update loses synthetic binding before its iterator starts',async t=>{
  const f=await fixture(t,{agent:true}),permit=f.issue(),call=await f.ctx.llm.prepareCall({provider:'df-testing-local',model:'df-testing-worker-v1',reasoningEffort:'deterministic',maxTokens:128}),stream=call.stream(f.request);
  class Unrelated extends LlmAdapter {async *stream(){throw Error('UNEXPECTED_UNRELATED_OUTPUT');}}
  const remove=f.ctx.llm.registerAdapter(['unrelated-synthetic'],new Unrelated());
  assert.throws(()=>f.binding.assertCurrent(),{code:'WORKER_REQUEST_DENIED'});
  const chunks=await f.ctx.agents.withInitiator(f.handle.agent,()=>f.read(stream));assert.equal(chunks.some(chunk=>chunk.type==='text-delta'),false);assert.equal(permit.usage(),null);
  remove();assert.throws(()=>getTestingProviderBinding(f.ctx),{code:'WORKER_REQUEST_DENIED'});
});
test('late private seal and false/throw/promise current callbacks refuse output without raw canary',async t=>{
  for(const scenario of ['sealed','false','throw','promise'])await t.test(scenario,async t=>{
    const f=await fixture(t,{agent:true}),permit=f.issue(scenario==='false'?()=>false:scenario==='throw'?()=>{throw Error('PRIVATE_CANARY');}:scenario==='promise'?()=>Promise.resolve(true):()=>true);
    if(scenario==='sealed')permit.seal();
    const chunks=await f.stream(f.request);assert.equal(chunks.some(chunk=>chunk.type==='text-delta'),false);assert.equal(permit.usage(),null);assert.equal(JSON.stringify(chunks).includes('PRIVATE_CANARY'),false);
  });
});
test('forged name/marker/direct request and mismatched real agent history never acquire a private permit',async t=>{
  const f=await fixture(t,{agent:true});
  const direct=await f.read(f.ctx.llm.stream(f.request));assert.equal(direct.some(row=>row.type==='text-delta'),false);
  const marked=await f.stream(markAgentLoopRequest({...f.request}));assert.equal(marked.some(row=>row.type==='text-delta'),false);
  const unbound=await f.stream(f.request);assert.equal(unbound.some(row=>row.type==='text-delta'),false);
  f.issue();const altered={...f.request,messages:[...f.request.messages,{id:r('prior'),role:'assistant',source:{kind:'model',provider:'other',model:'other'},content:[{type:'text',text:'UNAPPROVED_PRIOR_CANARY'}]}]};
  const history=await f.stream(altered);assert.equal(history.some(row=>row.type==='text-delta'),false);assert.equal(JSON.stringify(history).includes('UNAPPROVED_PRIOR_CANARY'),false);
});
test('current synthetic permit rejects changed exact input/options and retains no claimed usage',async t=>{
  for(const scenario of ['user-id','user-text','system-text','tool','purpose','temperature','stop','tokens','session'])await t.test(scenario,async t=>{
    const f=await fixture(t,{agent:true}),permit=f.issue(),request=structuredClone(f.request);
    if(scenario==='user-id')request.messages[1].id=r('different-execution');
    if(scenario==='user-text')request.messages[1].content[0].text='UNAPPROVED_CONTENT_CANARY';
    if(scenario==='system-text')request.messages[0].content[0].text='UNAPPROVED_SYSTEM_CANARY';
    if(scenario==='tool')request.tools=[{name:'UNAPPROVED_TOOL_CANARY',description:'never execute',parameters:{type:'object'}}];
    if(scenario==='purpose')request.purpose='session-title';
    if(scenario==='temperature')request.temperature=0.5;
    if(scenario==='stop')request.stop=['UNAPPROVED_STOP_CANARY'];
    if(scenario==='tokens')request.maxTokens=129;
    if(scenario==='session')request.sessionId='unowned-session';
    const chunks=await f.stream(request);assert.equal(chunks.some(row=>row.type==='text-delta'),false);assert.equal(permit.usage(),null);assert.equal(JSON.stringify(chunks).includes('UNAPPROVED_'),false);
  });
});
test('withdrawn original entry prevents both new bindings and already prepared iterator output',async t=>{
  const f=await fixture(t,{agent:true}),permit=f.issue(),call=await f.ctx.llm.prepareCall({provider:'df-testing-local',model:'df-testing-worker-v1',reasoningEffort:'deterministic',maxTokens:128}),stream=call.stream(f.request);
  await f.entry.fiber.dispose();assert.throws(()=>getTestingProviderBinding(f.ctx),{code:'WORKER_REQUEST_DENIED'});
  const chunks=await f.ctx.agents.withInitiator(f.handle.agent,()=>f.read(stream));assert.equal(chunks.some(row=>row.type==='text-delta'),false);assert.equal(permit.usage(),null);
});
