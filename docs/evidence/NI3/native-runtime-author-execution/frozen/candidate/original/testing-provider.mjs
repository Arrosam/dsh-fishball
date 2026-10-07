import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { types } from 'node:util';
import { BootstrapError } from './config.mjs';
import { workerChoiceRecord } from './installed-worker-config.mjs';
import { canonical, exact, ref, integer } from './runtime-security.mjs';
import { DSH_WEB_RUNTIME_ROOT, resolveHostSource } from './host-probe.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const denied = () => { throw new BootstrapError('WORKER_REQUEST_DENIED'); };
const modulePath = realpathSync(fileURLToPath(import.meta.url)), loadedSource = hash(readFileSync(modulePath));
const sourcePins = Object.freeze({
  'cordis':['4.0.5-alpha.1','6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e'],
  'dsh-llm':['0.2.1-alpha.1','a8a8288910c8862342cda571d096e1ea4489b01dd0f70b5db28bc86525ee283e'],
  'cordis-plugin-loader':['1.0.6-alpha.1','638b9ad360e01236120772323f80a65570c4f3f42f4cfc6243330241025b6d72'],
  'dsh-scope':['0.2.1-alpha.1','2829df71d76e08941457d4dd173eac60783e55354921137c8b75e8b5c0d2ecca'],
  'dsh-agent':['0.2.1-alpha.1','7b9aa39474de83115cf890dd7f8904cf0d59df0811cb335ab85565a04f1aac93'],
  'dsh-session':['0.2.1-alpha.1','b847e7ec736ce4049ec40ea0b20753bad5d7c2388785b4369d2bf00baa32472b'],
});
function publicSource(name) {
  const packageName=`@deepseek-ai/${name}`, source=resolveHostSource(packageName), [version,pin]=sourcePins[name];
  const metadata=JSON.parse(readFileSync(resolveHostSource(packageName,'package.json')));
  if(metadata.name!==packageName||metadata.version!==version||hash(readFileSync(source))!==pin||import.meta.resolve(packageName)!==pathToFileURL(source).href)denied();
  return source;
}
async function publicModule(name) { const source=publicSource(name), value=await import(pathToFileURL(source).href); if(publicSource(name)!==source)denied(); return value; }
const llmModule = await publicModule('dsh-llm');
const { Context, symbols } = await publicModule('cordis');
if(hash(readFileSync(resolveHostSource('@deepseek-ai/cordis','lib/types/utils.d.ts'))) !== '87149646f2227b818f9bdef4980fedc0539572b4574b63d75e1bbb7702390acb')denied();
const { Entry } = await publicModule('cordis-plugin-loader');
const { scopeOf } = await publicModule('dsh-scope');
const { AgentRegistry } = await publicModule('dsh-agent');
const { SessionStore } = await publicModule('dsh-session');
const bindings = new WeakMap();
const original = value => value?.[symbols.original] ?? value;
export const TESTING_ACCOUNTING = 'df-testing-utf8-byte-units/v1';
export const TESTING_SYSTEM_PROMPT = 'You are a dsh-fishball worker. Use only the approved task context supplied in this turn. Tools and external actions are unavailable.';
export const name = 'dsh-fishball-testing-provider';
export const inject = Object.freeze(['llm','agents','sessions']);
function validConfig(value) { try { workerChoiceRecord(value, []); return Object.freeze({}); } catch { throw new BootstrapError('CONFIG_INVALID'); } }
export const Config = Object.freeze({ '~standard': Object.freeze({ version: 1, vendor: 'df', validate(value) { try { return { value: validConfig(value) }; } catch { return { issues: [{ message: 'CONFIG_INVALID' }] }; } } }) });
function modelInfo() {
  return { provider: 'df-testing-local', id: 'df-testing-worker-v1', name: 'Synthetic local worker (no model quality)', description: 'Source-owned deterministic text; synthetic UTF-8 byte accounting', inputModalities: ['text'], context: { contextWindow: 135168 }, defaultMaxTokens: 128, reasoning: { efforts: [{ id: 'deterministic', name: 'Synthetic deterministic' }], defaultEffort: 'deterministic' } };
}
function checkHost(ctx) {
  try {
    for(const name of Object.keys(sourcePins))publicSource(name);
    if(hash(readFileSync(resolveHostSource('@deepseek-ai/cordis','lib/types/utils.d.ts'))) !== '87149646f2227b818f9bdef4980fedc0539572b4574b63d75e1bbb7702390acb')denied();
    if (process.version !== 'v22.22.2' || !(ctx instanceof Context) || !(ctx.llm instanceof llmModule.LlmRuntime) || hash(readFileSync(`${DSH_WEB_RUNTIME_ROOT}/package-lock.json`)) !== hash(readFileSync(new URL('../scripts/dsh-web-runtime-lock.json', import.meta.url)))) denied();
  } catch { denied(); }
}
function boundCurrent(binding) {
  try {
    checkHost(binding.ctx);
    const { ctx, entry } = binding;
    if (!binding.active || binding.invalidated || ctx.fiber.state !== 2 || ctx.fiber.uid === null || binding.epoch !== binding.registeredEpoch || original(ctx.llm) !== binding.llm || !(entry instanceof Entry) || ctx.fiber.entry !== entry || entry.fiber !== ctx.fiber || entry.disabled || entry.moduleNamespace?.default !== plugin || entry.options.name !== 'dsh-fishball/testing-provider' || hash(readFileSync(modulePath)) !== loadedSource || realpathSync(fileURLToPath(import.meta.resolve('dsh-fishball/testing-provider'))) !== modulePath) denied();
    if (binding.adapter.constructor !== TestingAdapter || bindings.get(binding.llm) !== binding || typeof binding.registration !== 'function') denied();
    return true;
  } catch { denied(); }
}
function ownedAgent(binding, agent) {
  if (!(binding.ctx.agents instanceof AgentRegistry) || !(binding.ctx.sessions instanceof SessionStore) || !agent || original(scopeOf(agent.ctx)) !== original(agent) || original(agent.ctx?.agents) !== original(binding.ctx.agents) || original(binding.ctx.agents.get(agent.id)) !== original(agent) || original(binding.ctx.sessions.get(agent.id)) !== original(agent.session) || agent.session.id !== agent.id) denied();
}
function requestFacts(binding, permit, options) {
  if (!options || typeof options !== 'object' || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype) denied();
  const descriptors = Object.getOwnPropertyDescriptors(options);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === 'symbol') continue; // The public LOOP marker is not authority.
    if (!['provider','model','reasoningEffort','maxTokens','messages','tools','toolHistory','signal','sessionId','system','temperature','stop','purpose'].includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key],'value')) denied();
  }
  const read = key => descriptors[key]?.value;
  const signal=read('signal');
  if(signal!==undefined&&(!(signal instanceof AbortSignal)||types.isProxy(signal)||Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal)))denied();
  if (read('provider') !== 'df-testing-local' || read('model') !== 'df-testing-worker-v1' || read('reasoningEffort') !== 'deterministic' || read('maxTokens') !== permit.maxOutputTokens || read('sessionId') !== permit.agent.id || read('system') !== undefined || read('temperature') !== undefined || read('stop') !== undefined || read('purpose') !== undefined) denied();
  const tools = read('tools'); if (tools !== undefined && canonical(tools) !== '[]') denied();
  const history = read('toolHistory'); if (history !== undefined && canonical(history) !== canonical({ tools: [], updates: [] })) denied();
  const rawMessages = read('messages'), messages = JSON.parse(canonical(rawMessages));
  if (messages.length !== 2) denied();
  const [system,user] = messages;
  exact(system,['id','role','content','source']); exact(system.source,['kind']);
  exact(user,['id','role','content','source']); exact(user.source,['kind','form']);
  if (typeof system.id !== 'string' || !system.id.length || Buffer.byteLength(system.id)>128 || system.role !== 'system' || system.source.kind !== 'system-prompt' || canonical(system.content) !== canonical([{type:'text',text:TESTING_SYSTEM_PROMPT}]) || user.role !== 'user' || user.id !== permit.executionRef || user.source.kind !== 'df-context' || user.source.form !== 'local' || canonical(user.content) !== canonical([{type:'text',text:permit.content}])) denied();
  const inputUnits = Buffer.byteLength(JSON.stringify(rawMessages)), response = `Synthetic local result; approved input SHA-256: ${hash(permit.content)}.`, outputUnits = Buffer.byteLength(response);
  if (inputUnits > permit.requestBytes || outputUnits > permit.resultBytes || outputUnits > permit.maxOutputTokens || inputUnits + outputUnits > 135168 || inputUnits + outputUnits > permit.usageUnits) denied();
  return { inputUnits, outputUnits, response };
}
class TestingAdapter extends llmModule.LlmAdapter {
  #binding;
  constructor(binding) { super(); this.#binding = binding; }
  providerInfo(provider) { if(provider !== 'df-testing-local') denied(); return { id: provider, name: 'Synthetic local DF provider (no network)' }; }
  providerRetryPolicy(provider) { if(provider !== 'df-testing-local') denied(); return { mode:'normal',maxRetries:0,retryableCodes:[],initialDelayMs:500,maxDelayMs:10000,jitterRatio:0 }; }
  async listModels(provider) { if(provider !== 'df-testing-local') denied(); return [modelInfo()]; }
  async resolveModel(provider,model,signal) { if(provider !== 'df-testing-local'||model !== 'df-testing-worker-v1'||signal?.aborted) denied(); return modelInfo(); }
  async *stream(options) {
    const binding = this.#binding;
    boundCurrent(binding);
    const agent = original(binding.ctx.agents.currentInitiator()), permit = binding.permits.get(agent);
    if (!permit || permit.state !== 'prepared') denied();
    ownedAgent(binding,agent);
    let facts;
    try {facts=requestFacts(binding,permit,options);}catch{permit.state='sealed';denied();}
    try { if (permit.assertCurrent(options) !== true) denied(); }
    catch { permit.state='sealed'; denied(); }
    // No await separates the final current check, one-use consume and first
    // deterministic effect. Old prepared adapter streams also reach this gate.
    boundCurrent(binding); ownedAgent(binding,agent);
    if (original(binding.ctx.agents.currentInitiator()) !== agent || permit.state !== 'prepared') denied();
    permit.state = 'consumed';
    permit.usage = Object.freeze({ accounting: TESTING_ACCOUNTING, inputUnits:facts.inputUnits, outputUnits:facts.outputUnits, totalUnits:facts.inputUnits+facts.outputUnits, resultDigest:hash(facts.response) });
    yield {type:'text-delta',index:0,text:facts.response};
    yield {type:'usage',usage:{inputTokens:facts.inputUnits,outputTokens:facts.outputUnits,totalTokens:facts.inputUnits+facts.outputUnits}};
    yield {type:'finish',reason:{kind:'stop'}};
  }
}
export function apply(ctx,input) {
  validConfig(input); checkHost(ctx);
  const binding = {ctx,llm:original(ctx.llm),entry:ctx.fiber.entry,epoch:0,registeredEpoch:null,active:true,invalidated:false,registration:null,adapter:null,permits:new WeakMap(),issued:0};
  const stop = () => { binding.active=false; binding.invalidated=true; if(bindings.get(binding.llm)===binding) bindings.delete(binding.llm); };
  ctx.on('llm/adapters-updated',()=>{binding.epoch++;if(binding.registeredEpoch!==null)binding.invalidated=true;});
  ctx.on('internal/status',changed=>{if(changed===ctx.fiber&&(ctx.fiber.state===3||ctx.fiber.uid===null))stop();});
  ctx.effect(()=>()=>{stop();binding.registration?.();},'df.testing-provider');
  binding.adapter = new TestingAdapter(binding);
  binding.registration = ctx.llm.registerAdapter(['df-testing-local'],binding.adapter);
  binding.registeredEpoch = binding.epoch;
  bindings.set(binding.llm,binding);
}
const plugin = Object.freeze({name,inject,Config,apply});
export default plugin;

// Trusted installed composition only: never service, Config, RPC or client.
// The live registration held here is owned by the source-defined adapter;
// provider names and caller booleans cannot create this map entry.
export function getTestingProviderBinding(ctx) {
  const binding = bindings.get(original(ctx.llm)); if(!binding) denied();
  boundCurrent(binding); if(!(ctx instanceof Context)||original(ctx.llm)!==binding.llm)denied();
  return Object.freeze({entry:binding.entry,sourceRef:loadedSource,accounting:TESTING_ACCOUNTING,assertCurrent:()=>boundCurrent(binding),issue(input){
    exact(input,['agent','executionRef','content','maxOutputTokens','requestBytes','resultBytes','usageUnits','assertCurrent']);
    boundCurrent(binding); ownedAgent(binding,input.agent); ref(input.executionRef);
    const agent=original(input.agent);
    if(typeof input.content!=='string'||!input.content.isWellFormed()||Buffer.byteLength(input.content)>65536||typeof input.assertCurrent!=='function'||binding.permits.has(agent)||binding.issued>=128)denied();
    integer(input.maxOutputTokens,128,4096);integer(input.requestBytes,512,131072);integer(input.resultBytes,128,16384);integer(input.usageUnits,1,100000000);
    const permit={...input,agent,state:'prepared',usage:null}; binding.issued++; binding.permits.set(agent,permit);
    return Object.freeze({seal(){permit.state='sealed';},usage(){return permit.usage;}});
  }});
}
