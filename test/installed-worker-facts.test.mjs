import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, existsSync, chmodSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveHostSource } from '../src/host-probe.mjs';
import { validateInstalledWorker } from '../src/installed-worker-config.mjs';
import { resolveInstalledWorkerFacts, installedRef } from '../src/installed-worker-facts.mjs';
const load=n=>import(pathToFileURL(resolveHostSource('@deepseek-ai/'+n)).href);
const {Context}=await load('cordis');
const {default:Loader}=await load('cordis-plugin-loader');
const {default:Sessions}=await load('dsh-session');
const {default:Projections}=await load('dsh-session-projection');
const {default:Approval}=await load('dsh-user-approval');
const {AgentRegistry}=await load('dsh-agent');
const {LlmRuntime,LlmAdapter}=await load('dsh-llm');
const {default:Prompt}=await load('dsh-system-prompt');
const {default:Tools}=await load('dsh-tools');
const {default:Presets}=await load('dsh-agent-preset-registry');
async function fixture(t,{broader=false,synthetic=false}={}){
 const dir=mkdtempSync(join(realpathSync(tmpdir()),'df-ni2-facts-')),ctx=new Context(),fibers=[],entries=[];ctx.baseUrl=new URL('../',import.meta.url).href;ctx.logger.exporters?.clear?.();let removePreset,removeAdapter;
 const profile=Object.freeze({dir,name:'synthetic-facts'});ctx.provide('profileContext',profile);
 t.after(async()=>{await removePreset?.();removeAdapter?.();for(const entry of entries.reverse())await entry.fiber?.dispose();for(const fiber of fibers.reverse())await fiber.dispose();rmSync(dir,{recursive:true,force:true});});
 async function install(plugin,config){const f=ctx.plugin(plugin,config);fibers.push(f);await f;}
 await install(Projections);await install(Sessions);await install(Approval,{policy:'never'});await install(AgentRegistry);await install(LlmRuntime);await install(Prompt,{});await install(Tools,{});await install(Loader,{baseUrl:new URL('../',import.meta.url).href});
 async function entry(name,config){const id=await ctx.loader.create({name,config});await ctx.loader.await();const e=ctx.loader.resolve(id);entries.push(e);assert.equal(e.fiber.state,2);return e;}
 await entry('@deepseek-ai/dsh-session-persistence-jsonl',{root:join(dir,broader?'other-sessions':'df-sessions'),compression:'none'});
 const loop=await entry('@deepseek-ai/dsh-agent-loop',{agents:[],maxParallelToolCalls:1});
 await install(Presets,{default:'synthetic-empty'});removePreset=await ctx.agentPresets.register({id:'synthetic-empty',plugins:[]});assert.deepEqual(await ctx.agentPresets.resolve('synthetic-empty'),{id:'synthetic-empty'});
 class MetadataOnly extends LlmAdapter {providerInfo(){return{id:'metadata-only',name:'Unpriced original adapter'};}async listModels(){return[{provider:'metadata-only',id:'text-v1',name:'Metadata-only fixture',inputModalities:['text'],context:{contextWindow:4096},defaultMaxTokens:128}];}async resolveModel(){return(await this.listModels())[0];}async *stream(){throw Error('UNAUTHORIZED_INFERENCE');}}
 if(synthetic)await entry('dsh-fishball/testing-provider',{});else removeAdapter=ctx.llm.registerAdapter(['metadata-only'],new MetadataOnly());
 const choice=validateInstalledWorker({enabled:true,selection:{provider:synthetic?'df-testing-local':'metadata-only',model:synthetic?'df-testing-worker-v1':'text-v1',agentPreset:'synthetic-empty',reasoningEffort:null,maxOutputTokens:128},environment:{root:dir,cwd:dir},persistence:{directory:join(dir,'df-sessions'),compression:'none',retention:'owner-managed'},bounds:{requestBytes:4096,resultBytes:128},policy:{maxRuntimeMs:10000,maxUsageUnits:10000,maxCostEstimateMicros:0},charges:{runtimeMs:1000,usageUnits:4224},previewTtlMs:1000,grantTtlMs:1000});
 let alive=true;
 const resolve=options=>resolveInstalledWorkerFacts({ctx,choice,profile,isAlive:()=>alive,...options});
 return{ctx,dir,choice,profile,loop,resolve,stop(){alive=false;}};
}
test('explicit original facts derive generic unknown pricing with no files, sessions or registration changes',async t=>{
 const f=await fixture(t),facts=await f.resolve();assert.equal(facts.pricing,'unknown');assert.equal(facts.providerBinding,null);assert.equal(facts.accounting,null);assert.equal(facts.effort,null);assert.equal(facts.assertCurrent(),true);
 assert.equal(existsSync(f.choice.persistence.directory),false);assert.equal(f.ctx.sessions.list().length,0);assert.deepEqual(facts.catalog.providers,[{id:'metadata-only',name:'Unpriced original adapter'}]);assert.equal(facts.catalog.models[0].contextUnits,4096);assert.equal(facts.catalog.models[0].defaultEffort,null);assert.equal(Object.isFrozen(facts.catalog.models[0]),true);
 const stat=statSync(f.dir),directoryFact={dev:stat.dev,ino:stat.ino,uid:stat.uid,mode:stat.mode&0o777};assert.equal(facts.environmentRef,installedRef('df.installed-worker-environment/v1',f.choice.environment,f.choice.persistence,{parent:directoryFact,root:directoryFact,cwd:directoryFact,profile:directoryFact,leaf:null}));
});
test('actual broader original backend is unavailable without replacement or directory creation',async t=>{const f=await fixture(t,{broader:true});await assert.rejects(f.resolve(),{code:'WORKER_PERSISTENCE_UNSUPPORTED'});assert.equal(existsSync(f.choice.persistence.directory),false);assert.equal(f.ctx.sessions.list().length,0);});
test('leaf claim is exclusive, descriptor safe and retains approved absent digest only in this lifetime',async t=>{
 const f=await fixture(t),facts=await f.resolve(),refs=Object.fromEntries(['taskRef','actionRef','claimRef','generationRef'].map(k=>[k,installedRef(k)]));let getter=0;
 assert.throws(()=>facts.claimDirectory({...refs,get extra(){getter++;return true;}}));assert.equal(getter,0);assert.equal(existsSync(f.choice.persistence.directory),false);
 assert.equal(facts.claimDirectory(refs),true);assert.equal(facts.allocation.approvedLeaf,null);assert.equal(facts.assertCurrent(),true);
 const refreshed=await f.resolve({previous:facts});assert.equal(refreshed.environmentRef,facts.environmentRef);
 const fresh=await f.resolve();assert.notEqual(fresh.environmentRef,facts.environmentRef);
 chmodSync(f.choice.persistence.directory,0o755);assert.throws(()=>facts.assertCurrent(),{code:'WORKER_SOURCE_UNAVAILABLE'});
});
test('raced existing leaf and original entry/lifecycle loss deny without adopting native storage',async t=>{
 const f=await fixture(t),facts=await f.resolve();mkdirSync(f.choice.persistence.directory,{mode:0o700});assert.throws(()=>facts.assertCurrent(),{code:'WORKER_SOURCE_UNAVAILABLE'});
 const g=await fixture(t),current=await g.resolve();g.stop();assert.throws(()=>current.assertCurrent(),{code:'SERVICE_DISPOSED'});
});
test('exact invocation guard is rechecked after original awaited model resolution and raw errors stay bounded',async t=>{
 const f=await fixture(t);let checks=0;
 await assert.rejects(f.resolve({assertInvocation:()=>{checks++;if(checks===3){const error=new Error('PRIVATE_CANARY');error.code='REQUEST_ABORTED';throw error;}return true;}}),error=>error.code==='REQUEST_ABORTED'&&!String(error).includes('PRIVATE_CANARY'));
 assert.equal(checks,3);assert.equal(existsSync(f.choice.persistence.directory),false);assert.equal(f.ctx.sessions.list().length,0);
});
test('withdrawn actual original factory entry and changed actual backend config invalidate prior facts',async t=>{
 const f=await fixture(t),facts=await f.resolve();await f.loop.fiber.dispose();assert.throws(()=>facts.assertCurrent(),{code:'WORKER_SOURCE_UNAVAILABLE'});assert.equal(f.ctx.sessions.list().length,0);
 const g=await fixture(t),current=await g.resolve();g.ctx.sessionPersistence.config.root=join(g.dir,'different-root');assert.throws(()=>current.assertCurrent(),{code:'WORKER_PERSISTENCE_UNSUPPORTED'});assert.equal(existsSync(g.choice.persistence.directory),false);
});
test('profile provenance and owner-only parent mode must remain actual and current',async t=>{
 const f=await fixture(t),facts=await f.resolve();chmodSync(f.dir,0o755);assert.throws(()=>facts.assertCurrent(),{code:'WORKER_SOURCE_UNAVAILABLE'});chmodSync(f.dir,0o700);
 await assert.rejects(resolveInstalledWorkerFacts({ctx:f.ctx,choice:f.choice,profile:{dir:f.dir,name:'different-profile'},isAlive:()=>true}),{code:'WORKER_SOURCE_UNAVAILABLE'});assert.equal(existsSync(f.choice.persistence.directory),false);
});
test('only actual owned provider entry registration supplies source zero; later topology update invalidates facts',async t=>{
 const f=await fixture(t,{synthetic:true});
 const own=await import('../src/testing-provider.mjs'),ownedEntry=f.ctx.loader.entries().find(e=>e.moduleNamespace?.default===own.default);assert.ok(ownedEntry);assert.equal(own.getTestingProviderBinding(ownedEntry.fiber.ctx).assertCurrent(),true);
 // A normal child declares no optional llm injection. Its public reflect
 // service still resolves the actual scoped original service for operations.
 let child;const fiber=f.ctx.plugin({name:'synthetic-optional-child',inject:[],apply(ctx){child=ctx;}},{});await fiber;t.after(()=>fiber.dispose());
 const facts=await resolveInstalledWorkerFacts({ctx:child,choice:f.choice,profile:f.profile,isAlive:()=>fiber.state===2});
 assert.equal(facts.pricing,'source_zero');assert.equal(facts.accounting,'df-testing-utf8-byte-units/v1');assert.equal(facts.effort,'deterministic');assert.equal(facts.catalog.models[0].contextUnits,135168);assert.equal(facts.assertCurrent(),true);assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(f.choice.persistence.directory),false);
 class Unrelated extends LlmAdapter {async *stream(){throw Error('NEVER_INFERENCE');}}
 const remove=f.ctx.llm.registerAdapter(['unrelated-metadata-only'],new Unrelated());t.after(remove);assert.throws(()=>facts.assertCurrent(),{code:'WORKER_REQUEST_DENIED'});
});
test('own provider disabled and explicit reload reject the retained observation and require fresh facts',async t=>{
 const f=await fixture(t,{synthetic:true}),facts=await f.resolve(),own=await import('../src/testing-provider.mjs'),entry=f.ctx.loader.entries().find(e=>e.moduleNamespace?.default===own.default);
 await entry.update({disabled:true});await f.ctx.loader.await();assert.throws(()=>facts.assertCurrent(),{code:'WORKER_REQUEST_DENIED'});await assert.rejects(f.resolve(),error=>['WORKER_CATALOG_UNAVAILABLE','WORKER_SOURCE_UNAVAILABLE'].includes(error.code));
 await entry.update({disabled:false});await f.ctx.loader.await();const fresh=await f.resolve();assert.equal(fresh.pricing,'source_zero');assert.notEqual(fresh.sourceRef,facts.sourceRef);assert.throws(()=>facts.assertCurrent(),{code:'WORKER_REQUEST_DENIED'});assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(f.choice.persistence.directory),false);
});
test('same provider/model labels from a foreign original adapter cannot prove owned source zero',async t=>{
 const f=await fixture(t);
 class Foreign extends LlmAdapter {providerInfo(){return{id:'df-testing-local',name:'free'};}async listModels(){return[{provider:'df-testing-local',id:'df-testing-worker-v1',inputModalities:['text'],context:{contextWindow:135168},defaultMaxTokens:128,reasoning:{efforts:[{id:'deterministic',name:'free'}],defaultEffort:'deterministic'}}];}async resolveModel(){return(await this.listModels())[0];}async *stream(){throw Error('NO_INFERENCE');}}
 const remove=f.ctx.llm.registerAdapter(['df-testing-local'],new Foreign());t.after(remove);const choice=validateInstalledWorker({...f.choice,selection:{...f.choice.selection,provider:'df-testing-local',model:'df-testing-worker-v1'}});
 await assert.rejects(resolveInstalledWorkerFacts({ctx:f.ctx,choice,profile:f.profile,isAlive:()=>true}),{code:'WORKER_SOURCE_UNAVAILABLE'});assert.equal(f.ctx.sessions.list().length,0);assert.equal(existsSync(f.choice.persistence.directory),false);
});
