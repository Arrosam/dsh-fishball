import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, realpathSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types } from 'node:util';
import { BootstrapError } from './config.mjs';
import { canonical, canonicalDigest, hash, exact } from './runtime-security.mjs';
import { resolveHostSource, DSH_WEB_RUNTIME_ROOT } from './host-probe.mjs';
const fail=code=>{throw new BootstrapError(code);};
const pins=Object.freeze({
 "dsh-scope": {"version": "0.2.1-rc.2", "source": "2829df71d76e08941457d4dd173eac60783e55354921137c8b75e8b5c0d2ecca", "metadata": "3720f660ae9e868ef6eafcb04f879de6cc5ee26572b2b41edda3182e98a618e6", "types": "203beba1f2b00636990eefa4fe763207c1d657987a16531ca89dc6de3713f96e"},
  "cordis": {
    "version": "4.0.5",
    "source": "6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e",
    "metadata": "b73831b926b16cbd684aa1b277461e7800a2b35e2dd351ad3c2c8c0db158589d",
    "types": "51237bf92ef225c92c897c5fb0aa8e4482267a5ae6ff1cf768726a40c9a7db86"
  },
  "cordis-plugin-loader": {
    "version": "1.0.6",
    "source": "638b9ad360e01236120772323f80a65570c4f3f42f4cfc6243330241025b6d72",
    "metadata": "270d8d1ee5751e4173e7c4f9953bc19a1d370306d254c0ffaf21c37bc6deb78a",
    "types": "0440e9d9724ca3ba99205924c1d464a9062d1ac94ccb20b49dea854aeb8155a4"
  },
  "dsh-agent": {
    "version": "0.2.1-rc.2",
    "source": "7b59cf82c2784c25bdce4e3e24e5e5303b02b9f1003efacf50255492d17baf8b",
    "metadata": "4f3d36d223b60d0fbf416a2e790eac4fb4638382bcbe6b783e465f79e245b516",
    "types": "3531899158347ff10627228732c67462c78ea0352e31a7eabc19631f90b08bc1"
  },
  "dsh-agent-loop": {
    "version": "0.2.1-rc.2",
    "source": "cf57e3ecd487ac5c2553455aaa5cef2c6fb41e6bd61be5aa455675d1d7193033",
    "metadata": "158d0cce6603c36272aa16011d98fa9fb70c0253e35e0c96b3a1e187a31651dc",
    "types": "906f202b859b11f7b0a399d8c4921c47384dd6177c990d59b8a93026a9875e8e"
  },
  "dsh-llm": {
    "version": "0.2.1-rc.2",
    "source": "d18d8ae4c8d961e628708c1e4698e09716a0ebb80e55a672e0bde1029bec1155",
    "metadata": "409d065250b680487ed411f9e8bb91d621b0850d6db7b743fc549a096c4569aa",
    "types": "895a2d357b3da2d2ec18eada1271274d43169acaa6591d57bb6e84878e1b88fe"
  },
  "dsh-session": {
    "version": "0.2.1-rc.2",
    "source": "2f5dd07cb5c744a29abbb8003a8a4cefd9e582c6e2538074ca299a0ddd02a3bf",
    "metadata": "06c940188426e4c21ea84fad21c7fda49febfd1f209368b79323410313f909ad",
    "types": "f3e7b142a37713ec13a40a7269ee871cff83ad8184d84ce58c8b6adcc8107b08"
  },
  "dsh-tools": {
    "version": "0.2.1-rc.2",
    "source": "1e53932e7c4213ea24a7d87f06960b7a7702cb21f8a5741c97242b4a470a442a",
    "metadata": "13adfd07328b98cd248054efb17be7895ba9db0e01ab87f4adca3d4c6385d636",
    "types": "049df0624956583b8ca05badfd6e9115c6933481571dc17965f36f407bdf95f0"
  },
  "dsh-system-prompt": {
    "version": "0.2.1-rc.2",
    "source": "7be9f7aafbf345d01ddcc12fd297b16e9a1d41283a6a04073b867becca0bf020",
    "metadata": "f2195d2ec056f26988a7135f9036b9ade365ebdedf291bc7b7092a28abf5061b",
    "types": "8ddabd2930e7405b85e6b3b0e6698e2084ce7550abd5e945d5d2016b47963bec"
  },
  "dsh-agent-preset-registry": {
    "version": "0.2.1-rc.2",
    "source": "95edcc66175a87091ba90fe0809246821df470bf960e1cfd725b5ca6baaf4f07",
    "metadata": "68a32854e6492b0f92be76e7f9f5be61909bf7798ab22c210362e259947680d5",
    "types": "522519826855083e6cb1b57386d8c779020cfda186b98c38e3e237bec3b477a7"
  },
  "dsh-session-persistence": {
    "version": "0.2.1-rc.2",
    "source": "cc0b6d3a224133af611b428d5a49020e300f86c3b4ba28037aeb219029bde3eb",
    "metadata": "c7b9a12d966df8e096865cf50f63e37ac3cb763a51d5d1fbd8cc4a07050cc42a",
    "types": "dbaf738284416ceb76e365cf2844d50527750e4af97aaad2d3f4f1bd006faf5a"
  },
  "dsh-session-persistence-jsonl": {
    "version": "0.2.1-rc.2",
    "source": "973dd78679b2661d6f492343bc22b124ae958aa597d3b36c698a2c650f909984",
    "metadata": "965c4c6a2b1d9f5f821bba233b2b77200e581cc60e3d5aa12e82e442a58c5b0f",
    "types": "a0508a5c516ad8c293de03df67371dadf0e4ce416959f2865b0f44c75e7f62d4"
  },
  "dsh-user-approval": {
    "version": "0.2.1-rc.2",
    "source": "6a5ad1ba3c3dc3abbbae52e6c8c4463970ee0c1c8988cebb0d5cf2acd17ee90b",
    "metadata": "c970630f7ecef71b9b2376dadadbce8309b216f084881c540b3e11c60396825e",
    "types": "64176292d685552b826f37213219d99e853b64dbf4ecfb784815a99e61f384b2"
  }
});
const digest=value=>createHash('sha256').update(value).digest('hex');
const declarationPins=Object.freeze({
 'cordis/lib/types/fiber.d.ts':'eec0d229849c8a293ede90cc2b107c54262db28acfdcdf9181cfec5cd1d0a7d4',
 'cordis/lib/types/reflect.d.ts':'84a46d00b1a6528add43e0f27c1f27bab158f1454d8d05c7ea120a0907a6dc7b',
 'cordis/lib/types/utils.d.ts':'87149646f2227b818f9bdef4980fedc0539572b4574b63d75e1bbb7702390acb',
 'cordis-plugin-loader/lib/types/config/entry.d.ts':'047a95a352588e566336593969e4a3a7164b3a6ef1bd0ca16a1eb6b766b1c6a5',
 'cordis-plugin-loader/lib/types/config/tree.d.ts':'82c2812f98f18b377d7ffffe1c8576a54fde3b1704d79761b3e58961d430c520',
});
export const installedRef=(tag,...parts)=>canonicalDigest([tag,...parts]);
export function immutable(value){const copy=JSON.parse(canonical(value));const freeze=item=>{if(item&&typeof item==='object'){Object.values(item).forEach(freeze);Object.freeze(item);}return item;};return freeze(copy);}
const lifetimes=new WeakMap();
// Source-issued opaque state for one current original backend/profile directory.
const directoryBindings=new WeakMap();
function lifetime(value){let nonce=lifetimes.get(value);if(!nonce){nonce=hash(randomUUID());lifetimes.set(value,nonce);}return nonce;}
async function originalModules(){
 assertSources();
 if(process.version!=='v22.22.2'||digest(readFileSync(`${DSH_WEB_RUNTIME_ROOT}/package-lock.json`))!==digest(readFileSync(new URL('../scripts/dsh-web-runtime-lock.json',import.meta.url))))fail('WORKER_SOURCE_UNAVAILABLE');
 const modules={};
 for(const [name,pin] of Object.entries(pins)){
  const pkg='@deepseek-ai/'+name,source=resolveHostSource(pkg),metadata=resolveHostSource(pkg,'package.json');
  if(digest(readFileSync(source))!==pin.source||digest(readFileSync(metadata))!==pin.metadata||digest(readFileSync(resolveHostSource(pkg,'lib/types/index.d.ts')))!==pin.types||import.meta.resolve(pkg)!==pathToFileURL(source).href)fail('WORKER_SOURCE_UNAVAILABLE');
  const info=JSON.parse(readFileSync(metadata));if(info.name!==pkg||info.version!==pin.version)fail('WORKER_SOURCE_UNAVAILABLE');
  modules[name]=await import(pathToFileURL(source).href);
  if(digest(readFileSync(source))!==pin.source)fail('WORKER_SOURCE_UNAVAILABLE');
 }
 return modules;
}
function assertSources(){
 if(process.version!=='v22.22.2'||digest(readFileSync(`${DSH_WEB_RUNTIME_ROOT}/package-lock.json`))!==digest(readFileSync(new URL('../scripts/dsh-web-runtime-lock.json',import.meta.url))))fail('WORKER_SOURCE_UNAVAILABLE');
 for(const[name,pin]of Object.entries(pins))for(const[file,expected]of [['lib/index.js',pin.source],['package.json',pin.metadata],['lib/types/index.d.ts',pin.types]])if(digest(readFileSync(resolveHostSource('@deepseek-ai/'+name,file)))!==expected)fail('WORKER_SOURCE_UNAVAILABLE');
 for(const[path,pin]of Object.entries(declarationPins)){const [name,...rest]=path.split('/');if(digest(readFileSync(resolveHostSource('@deepseek-ai/'+name,rest.join('/'))))!==pin)fail('WORKER_SOURCE_UNAVAILABLE');}
}
function fsFact(path,{privateMode=false,absent=false}={}){
 try{
  if(resolve(path)!==path||realpathSync(dirname(path))!==dirname(path))fail('WORKER_SOURCE_UNAVAILABLE');
  const s=lstatSync(path);
  if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||realpathSync(path)!==path||privateMode&&(s.mode&0o777)!==0o700)fail('WORKER_SOURCE_UNAVAILABLE');
  return immutable({dev:s.dev,ino:s.ino,uid:s.uid,mode:s.mode&0o777});
 }catch(error){if(absent&&error?.code==='ENOENT')return null;fail('WORKER_SOURCE_UNAVAILABLE');}
}
function same(a,b){return canonical(a)===canonical(b);}
function boundedText(value,max=512){if(typeof value!=='string'||!value.isWellFormed()||!value.trim()||Buffer.byteLength(value)>max||/[\x00-\x1f\x7f]/.test(value))fail('WORKER_CATALOG_UNAVAILABLE');return value;}
function displayModel(value){
 if(!value||types.isProxy(value))fail('WORKER_CATALOG_UNAVAILABLE');
 canonical(value);
 const efforts=value.reasoning?.efforts??[];if(!Array.isArray(efforts)||efforts.length>16)fail('WORKER_CATALOG_UNAVAILABLE');
 const reasoningEfforts=efforts.map(row=>({id:boundedText(row.id,128),name:boundedText(row.name??row.id)}));
 if(new Set(reasoningEfforts.map(row=>row.id)).size!==reasoningEfforts.length)fail('WORKER_CATALOG_UNAVAILABLE');
 const maxOutputTokens=Number.isSafeInteger(value.defaultMaxTokens)&&value.defaultMaxTokens>0?value.defaultMaxTokens:null;
 const contextUnits=Number.isSafeInteger(value.context?.contextWindow)&&value.context.contextWindow>0?value.context.contextWindow:null;
 return {provider:boundedText(value.provider,128),id:boundedText(value.id,256),name:boundedText(value.name??value.id),reasoningEfforts,defaultEffort:value.reasoning?.defaultEffort===undefined?null:boundedText(value.reasoning.defaultEffort,128),maxOutputTokens,contextUnits};
}
// `owns(namespace)` binds the entry to the exact pinned public module. rc.2
// JSONL persistence exports a plugin namespace (`apply`/`Config`/`name`)
// instead of alpha.1's default service class, so callers select the binding.
function locate(loader,Entry,owns,serviceName,service,original){
 const found=[];
 for(const entry of loader.entries())if(entry instanceof Entry&&!entry.disabled&&entry.fiber?.state===2&&entry.fiber.uid!==null&&owns(entry.moduleNamespace)&&original(entry.ctx.reflect.get(serviceName))===original(service))found.push(entry);
 if(found.length!==1)fail('WORKER_SOURCE_UNAVAILABLE');return found[0];
}
// No services are registered, resolved or files allocated at installation.
// This function is called only by an explicit active owner preparation.
export async function resolveInstalledWorkerFacts({ctx,choice,profile,isAlive,previous,directoryBinding,assertInvocation=()=>true}){
 try{
  const checkpoint=()=>{if(assertInvocation()!==true||isAlive()!==true)fail('SERVICE_DISPOSED');};checkpoint();
  if(isAlive()!==true||ctx.fiber.state!==2)fail('SERVICE_DISPOSED');
  const m=await originalModules();checkpoint();
  const original=value=>value?.[m.cordis.symbols.original]??value;
  if(!(ctx instanceof m.cordis.Context))fail('WORKER_SOURCE_UNAVAILABLE');
  const get=name=>ctx.reflect.get(name),services={agents:get('agents'),llm:get('llm'),sessions:get('sessions'),tools:get('tools'),systemPrompt:get('systemPrompt'),agentPresets:get('agentPresets'),sessionPersistence:get('sessionPersistence'),approval:get('approval'),agentLoop:get('agentLoop'),loader:get('loader')};
  const classes={agents:m['dsh-agent'].AgentRegistry,llm:m['dsh-llm'].LlmRuntime,sessions:m['dsh-session'].SessionStore,tools:m['dsh-tools'].default,systemPrompt:m['dsh-system-prompt'].default,agentPresets:m['dsh-agent-preset-registry'].default,sessionPersistence:m['dsh-session-persistence'].SessionPersistence,approval:m['dsh-user-approval'].default,agentLoop:m['dsh-agent-loop'].default,loader:m['cordis-plugin-loader'].default};
  for(const [key,C]of Object.entries(classes))if(!(services[key] instanceof C))fail(key==='agentPresets'?'WORKER_PRESET_UNAVAILABLE':key==='sessionPersistence'?'WORKER_PERSISTENCE_UNSUPPORTED':'WORKER_SOURCE_UNAVAILABLE');
  const Entry=m['cordis-plugin-loader'].Entry,loopEntry=locate(services.loader,Entry,ns=>ns?.default===classes.agentLoop,'agentLoop',services.agentLoop,original),persistenceEntry=locate(services.loader,Entry,ns=>ns===m['dsh-session-persistence-jsonl']&&typeof ns.apply==='function',`sessionPersistence`,services.sessionPersistence,original);
  // The public base class alone admits any backend; also require the pinned JSONL backend label.
  if(original(services.sessionPersistence).name!=='session-persistence-jsonl')fail('WORKER_PERSISTENCE_UNSUPPORTED');
  if(original(loopEntry.ctx.reflect.get('sessionPersistence'))!==original(services.sessionPersistence)||!(loopEntry.ctx.reflect.get('sessionPersistence') instanceof m['dsh-session-persistence'].SessionPersistence)||loopEntry.ctx.reflect.get('sessionPersistence').identity!==services.sessionPersistence.identity)fail('WORKER_PERSISTENCE_UNSUPPORTED');
  if(!Array.isArray(services.agentLoop.config.agents)||services.agentLoop.config.agents.some(row=>['id','sessionId','resumeSessionId'].some(key=>typeof row?.[key]==='string'&&row[key].startsWith('df-'))))fail('WORKER_SOURCE_UNAVAILABLE');
  if(services.sessionPersistence.config.root!==choice.persistence.directory||(services.sessionPersistence.config.compression??'zstd')!==choice.persistence.compression)fail('WORKER_PERSISTENCE_UNSUPPORTED');
  const currentProfile=get('profileContext');if(!currentProfile||currentProfile.dir!==profile.dir||currentProfile.name!==profile.name)fail('WORKER_SOURCE_UNAVAILABLE');
  const parent=fsFact(dirname(choice.persistence.directory),{privateMode:true}),root=fsFact(choice.environment.root),cwd=fsFact(choice.environment.cwd),profileFact=fsFact(profile.dir),leaf=fsFact(choice.persistence.directory,{privateMode:true,absent:true});
  if(dirname(choice.persistence.directory)!==profile.dir&&!dirname(choice.persistence.directory).startsWith(profile.dir+'/'))fail('WORKER_SOURCE_UNAVAILABLE');
  const providers=services.llm.listProviders();if(!Array.isArray(providers)||providers.length>32)fail('WORKER_CATALOG_UNAVAILABLE');
  const providerRows=providers.map(row=>({id:boundedText(row.id,128),name:boundedText(row.name??row.id)}));if(new Set(providerRows.map(row=>row.id)).size!==providerRows.length||!providerRows.some(row=>row.id===choice.selection.provider))fail('WORKER_CATALOG_UNAVAILABLE');
  const modelRows=await services.llm.listModels(choice.selection.provider);checkpoint();if(!Array.isArray(modelRows)||modelRows.length>64)fail('WORKER_CATALOG_UNAVAILABLE');
  const models=modelRows.map(displayModel);if(new Set(models.map(row=>row.id)).size!==models.length)fail('WORKER_CATALOG_UNAVAILABLE');
  const selected=await services.llm.resolveModelInfo(choice.selection.provider,choice.selection.model);checkpoint();const model=displayModel(selected);
  if(!Array.isArray(selected.inputModalities)||!selected.inputModalities.includes('text'))fail('WORKER_CATALOG_UNAVAILABLE');
  if(model.provider!==choice.selection.provider||model.id!==choice.selection.model||!models.some(row=>row.id===model.id))fail('WORKER_CATALOG_UNAVAILABLE');
  // The public list may omit resolved capacity/reasoning metadata. Project the
  // selected row from its actual fresh resolution rather than guessing it.
  models[models.findIndex(row=>row.id===model.id)]=model;
  const resolved=await services.llm.resolveCallConfig({provider:choice.selection.provider,model:choice.selection.model,...(choice.selection.reasoningEffort===null?{}:{reasoningEffort:choice.selection.reasoningEffort}),maxTokens:choice.selection.maxOutputTokens});
  checkpoint();
  const effort=resolved.reasoningEffort??null;if(resolved.provider!==choice.selection.provider||resolved.model!==choice.selection.model||resolved.maxTokens!==choice.selection.maxOutputTokens||effort!==null&&!model.reasoningEfforts.some(row=>row.id===effort))fail('WORKER_CATALOG_UNAVAILABLE');
  // Public diagnostics await Loader settlement and must never run at apply.
  const preset=await services.agentPresets.resolve(choice.selection.agentPreset);checkpoint();const document=await services.agentPresets.readDocument(choice.selection.agentPreset);checkpoint();const inventory=await services.agentPresets.compositionInventory();checkpoint();
  const declared=inventory.filter(row=>row.id===choice.selection.agentPreset);if(preset.id!==choice.selection.agentPreset||preset.broken||document.agentPreset!==preset.id||declared.length!==1||declared[0].broken||!Array.isArray(declared[0].rows)||declared[0].rows.length!==0)fail('WORKER_PRESET_UNAVAILABLE');
  const inspections=services.agentPresets.inspectCompositions().filter(row=>row.id===preset.id);if(inspections.length<1||inspections.some(row=>row.modules.length!==0||row.leakedServices.length!==0))fail('WORKER_PRESET_UNAVAILABLE');
  let providerBinding=null,providerSource=null;
  if(choice.selection.provider==='df-testing-local'&&['df-testing-worker-v1','df-testing-review-v1','df-testing-repair-v1'].includes(choice.selection.model)){
   const own=await import('./testing-provider.mjs');checkpoint();
   const providerEntry=locate(services.loader,Entry,ns=>ns?.default===own.default,'llm',services.llm,original);
   // Its actual original entry has its declared llm injection. Keep all
   // operations scoped; an optional installed child never needs a getter for
   // an undeclared mandatory service and never uses the original raw object.
   providerBinding=own.getTestingProviderBinding(providerEntry.fiber.ctx);providerBinding.assertCurrent();providerSource=providerBinding.sourceRef;
  }
  const supplied=[loopEntry,persistenceEntry].map(entry=>Object.freeze({entry,fiber:entry.fiber,namespace:entry.moduleNamespace}));
  const sourceRef=installedRef('df.installed-worker-source/v1',Object.fromEntries(Object.entries(services).map(([key,value])=>[key,lifetime(original(value))])),lifetime(loopEntry.fiber),lifetime(persistenceEntry.fiber),providerSource,providerBinding?lifetime(providerBinding.entry.fiber):null);
  const modelRef=installedRef('df.installed-worker-model/v1',model.provider,model.id,JSON.parse(JSON.stringify(selected))),presetRef=installedRef('df.installed-worker-preset/v1',preset.id,document,declared[0]),reasoningRef=installedRef('df.installed-worker-reasoning/v1',effort,choice.selection.maxOutputTokens),catalogEvidenceRef=installedRef('df.installed-worker-catalog/v1',modelRef,presetRef,reasoningRef,sourceRef);
  let directoryToken=directoryBinding===undefined?previous?.directoryBinding:directoryBinding,directoryState;
  if(previous!==undefined&&(!previous.directoryBinding||directoryBinding!==undefined&&directoryBinding!==previous.directoryBinding))fail('WORKER_SOURCE_UNAVAILABLE');
  const directoryIdentity=immutable({directory:choice.persistence.directory,persistence:choice.persistence,profile,paths:{parent,root,cwd,profile:profileFact}});
  if(directoryToken===undefined){
   directoryToken=Object.freeze({});directoryState={ctx,backend:original(services.sessionPersistence),sourceRef,identity:directoryIdentity,approvedLeaf:leaf,allocation:null};directoryBindings.set(directoryToken,directoryState);
  }else{
   directoryState=directoryBindings.get(directoryToken);
   if(!directoryState||directoryState.ctx!==ctx||directoryState.backend!==original(services.sessionPersistence)||directoryState.sourceRef!==sourceRef||!same(directoryState.identity,directoryIdentity))fail('WORKER_SOURCE_UNAVAILABLE');
  }
  if(!same(directoryState.allocation?.currentLeaf??directoryState.approvedLeaf,leaf))fail('WORKER_SOURCE_UNAVAILABLE');
  const approvedLeaf=directoryState.approvedLeaf;
  const paths=immutable({parent,root,cwd,profile:profileFact,leaf:approvedLeaf});
  const environmentRef=installedRef('df.installed-worker-environment/v1',choice.environment,choice.persistence,paths);
  const assertCurrent=()=>{
   assertSources();
   if(isAlive()!==true||ctx.fiber.state!==2||ctx.fiber.uid===null)fail('SERVICE_DISPOSED');
   for(const[key,value]of Object.entries(services))if(original(get(key))!==original(value))fail('WORKER_SOURCE_UNAVAILABLE');
   for(const {entry,fiber,namespace} of supplied)if(entry.disabled||entry.fiber!==fiber||entry.moduleNamespace!==namespace||fiber.state!==2||fiber.uid===null)fail('WORKER_SOURCE_UNAVAILABLE');
   if(!same(fsFact(dirname(choice.persistence.directory),{privateMode:true}),parent)||!same(fsFact(choice.environment.root),root)||!same(fsFact(choice.environment.cwd),cwd)||!same(fsFact(profile.dir),profileFact)||!same(fsFact(choice.persistence.directory,{privateMode:true,absent:true}),directoryState.allocation?.currentLeaf??directoryState.approvedLeaf))fail('WORKER_SOURCE_UNAVAILABLE');
   if(services.sessionPersistence.config.root!==choice.persistence.directory||(services.sessionPersistence.config.compression??'zstd')!==choice.persistence.compression)fail('WORKER_PERSISTENCE_UNSUPPORTED');
   const activeProfile=get('profileContext');if(!activeProfile||activeProfile.dir!==profile.dir||activeProfile.name!==profile.name)fail('WORKER_SOURCE_UNAVAILABLE');
   providerBinding?.assertCurrent();return true;
  };
  if(isAlive()!==true)fail('SERVICE_DISPOSED');assertCurrent();
  return Object.freeze({services:Object.freeze(services),modules:Object.freeze(m),sourceRef,modelRef,presetRef,reasoningRef,catalogEvidenceRef,environmentRef,effort,providerBinding,pricing:providerBinding?'source_zero':'unknown',accounting:providerBinding?.accounting??null,catalog:immutable({providers:providerRows,models,presets:[{id:preset.id,name:boundedText(preset.name??preset.id),available:true}]}),labels:immutable({provider:providerRows.find(row=>row.id===model.provider).name,model:model.name,reasoning:effort??'Native default',preset:boundedText(preset.name??preset.id)}),assertCurrent,directoryBinding:directoryToken,get allocation(){return directoryState.allocation;},claimDirectory(binding){
   exact(binding,['taskRef','actionRef','claimRef','generationRef']);
   for(const key of ['taskRef','actionRef','claimRef','generationRef'])if(typeof binding[key]!=='string'||!/^[a-f0-9]{64}$/.test(binding[key]))fail('WORKER_SOURCE_UNAVAILABLE');
   assertCurrent();if(directoryState.approvedLeaf===null&&!directoryState.allocation){try{mkdirSync(choice.persistence.directory,{mode:0o700});}catch{fail('WORKER_SOURCE_UNAVAILABLE');}directoryState.allocation=Object.freeze({approvedLeaf:null,currentLeaf:fsFact(choice.persistence.directory,{privateMode:true}),claim:Object.freeze({taskRef:binding.taskRef,actionRef:binding.actionRef,claimRef:binding.claimRef,generationRef:binding.generationRef})});}assertCurrent();return true;
  }});
 }catch(error){const d=error&&!types.isProxy(error)?Object.getOwnPropertyDescriptor(error,'code'):null;const code=d?.value;throw new BootstrapError(['SERVICE_DISPOSED','OPERATOR_REQUIRED','REQUEST_ABORTED','WORKER_CATALOG_UNAVAILABLE','WORKER_PRESET_UNAVAILABLE','WORKER_PERSISTENCE_UNSUPPORTED','WORKER_SOURCE_UNAVAILABLE'].includes(code)?code:'WORKER_SOURCE_UNAVAILABLE');}
}
