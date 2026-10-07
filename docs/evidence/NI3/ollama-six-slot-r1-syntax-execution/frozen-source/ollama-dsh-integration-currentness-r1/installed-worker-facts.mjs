import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, realpathSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types } from 'node:util';
import { BootstrapError } from '../../src/config.mjs';
import { canonical, canonicalDigest, hash, exact } from '../../src/runtime-security.mjs';
import { resolveHostSource, DSH_WEB_RUNTIME_ROOT } from '../../src/host-probe.mjs';
const fail=code=>{throw new BootstrapError(code);};
const pins=Object.freeze({
  "cordis": {
    "version": "4.0.5-alpha.1",
    "source": "6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e",
    "metadata": "37ac1aefbfc2a8d601bd061cec506159a1ca47aabf116f9682e4253fce1ead27",
    "types": "51237bf92ef225c92c897c5fb0aa8e4482267a5ae6ff1cf768726a40c9a7db86"
  },
  "cordis-plugin-loader": {
    "version": "1.0.6-alpha.1",
    "source": "638b9ad360e01236120772323f80a65570c4f3f42f4cfc6243330241025b6d72",
    "metadata": "1b2ce10f17c6606bca88440f3a09d46b4c2add768e5cfa0e430187afd8edb683",
    "types": "0440e9d9724ca3ba99205924c1d464a9062d1ac94ccb20b49dea854aeb8155a4"
  },
  "dsh-agent": {
    "version": "0.2.1-alpha.1",
    "source": "7b9aa39474de83115cf890dd7f8904cf0d59df0811cb335ab85565a04f1aac93",
    "metadata": "0d342b74618bc8942f899bd922850216567fc1d8b08d0214cf7a47c66ba345e9",
    "types": "3531899158347ff10627228732c67462c78ea0352e31a7eabc19631f90b08bc1"
  },
  "dsh-agent-loop": {
    "version": "0.2.1-alpha.1",
    "source": "00c4814d63f3d1e2754eb09144832d19b30499d6ea444730473f740b587948c2",
    "metadata": "5acd0a47642f9a75b69c92ab83c8cba0d420f4f3a93ef3eb436fca0e05b9fca2",
    "types": "906f202b859b11f7b0a399d8c4921c47384dd6177c990d59b8a93026a9875e8e"
  },
  "dsh-llm": {
    "version": "0.2.1-alpha.1",
    "source": "a8a8288910c8862342cda571d096e1ea4489b01dd0f70b5db28bc86525ee283e",
    "metadata": "8a116e03c629ba2bbbaad960ad30dcc18f00f4482085e52598ad2f7e355502bc",
    "types": "c5e3c6d92c7c2cf1529ff34eeaf0af92ccee56f2e5ae0f06c36f8548736f9c55"
  },
  "dsh-session": {
    "version": "0.2.1-alpha.1",
    "source": "b847e7ec736ce4049ec40ea0b20753bad5d7c2388785b4369d2bf00baa32472b",
    "metadata": "e9d5af863ff3cb1544425bf31902e78ef232f2d8d127cf6e5d90c245bc535d2c",
    "types": "0d7bec761fd4917f4641d6aa38bb64b322e6a4a5ca86bf7d2baf62c8b4521a7f"
  },
  "dsh-tools": {
    "version": "0.2.1-alpha.1",
    "source": "2e9b6a72ba6b917197965c08eb894d4e8d01dc6f81e0e1c9870a5ae8514687a7",
    "metadata": "ce999c619acafd8dea49050553b125f6cb45c610d9bafb1a047a9664c18ba5ee",
    "types": "3536b173ec22361dcda85c05281921fc850db49984813b138d05395c4fe4510f"
  },
  "dsh-system-prompt": {
    "version": "0.2.1-alpha.1",
    "source": "ff422afac6ba85f89afa985d921aed0b603feb354a05a549c48eae04cf0d2f57",
    "metadata": "e8ededbd4fb2f5c754f2f980d7d2c767a074a59bede849d54d534b4f8320c656",
    "types": "954717f76586dc0e824f74bb51378529cf4963aff4582e3d25a7bc3c8142727d"
  },
  "dsh-agent-preset-registry": {
    "version": "0.2.1-alpha.1",
    "source": "7e23c01514303b2dfa1b69a95929cb19e43ba761d3478a3104d0f565ca537be7",
    "metadata": "81eccf1abe20b6cfb419fe7b530069c0ca6887da42bd1a15b10f309b2e25370e",
    "types": "47e6ec0952cfd9bffb30d1a0092c8303aa03800836cdd6d242fccc3e0770e6a9"
  },
  "dsh-session-persistence": {
    "version": "0.2.1-alpha.1",
    "source": "cc0b6d3a224133af611b428d5a49020e300f86c3b4ba28037aeb219029bde3eb",
    "metadata": "ba6bd5ccbf6bb722de342973294bf4a9e1d0c68e7977fe7e7a53e118a04b0c32",
    "types": "405eed914b242e16a07c8343004e134669b8948b26d1067e300fb222baf10b96"
  },
  "dsh-session-persistence-jsonl": {
    "version": "0.2.1-alpha.1",
    "source": "0845707017acc2b4a8a75eab2244fa3fd88587b8094ab32014321dce7ca1e31b",
    "metadata": "ca8d23f5f34bbb9014047af1390e9e2ccd929e9903e7bf31919301f4832c9f1f",
    "types": "806dfa610c3ed3ce80ffac89900993288d7013d4278ab21e2b55b193c542f79a"
  },
  "dsh-user-approval": {
    "version": "0.2.1-alpha.1",
    "source": "6a5ad1ba3c3dc3abbbae52e6c8c4463970ee0c1c8988cebb0d5cf2acd17ee90b",
    "metadata": "f18e487b31f9c92300be732674defca4ba3e1556fe94bf6b696aa71d0fbb4d7e",
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
function lifetime(value){let nonce=lifetimes.get(value);if(!nonce){nonce=hash(randomUUID());lifetimes.set(value,nonce);}return nonce;}
async function originalModules(){
 assertSources();
 if(process.version!=='v22.22.2'||digest(readFileSync(`${DSH_WEB_RUNTIME_ROOT}/package-lock.json`))!==digest(readFileSync(new URL('../../scripts/dsh-web-runtime-lock.json',import.meta.url))))fail('WORKER_SOURCE_UNAVAILABLE');
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
 if(process.version!=='v22.22.2'||digest(readFileSync(`${DSH_WEB_RUNTIME_ROOT}/package-lock.json`))!==digest(readFileSync(new URL('../../scripts/dsh-web-runtime-lock.json',import.meta.url))))fail('WORKER_SOURCE_UNAVAILABLE');
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
function locate(loader,Entry,plugin,serviceName,service,original){
 const found=[];
 for(const entry of loader.entries())if(entry instanceof Entry&&!entry.disabled&&entry.fiber?.state===2&&entry.fiber.uid!==null&&entry.moduleNamespace?.default===plugin&&original(entry.ctx.reflect.get(serviceName))===original(service))found.push(entry);
 if(found.length!==1)fail('WORKER_SOURCE_UNAVAILABLE');return found[0];
}
// No services are registered, resolved or files allocated at installation.
// This function is called only by an explicit active owner preparation.
export async function resolveInstalledWorkerFacts({ctx,choice,profile,isAlive,previous,assertInvocation=()=>true,cloudAdmission=null}){
 try{
  const checkpoint=()=>{if(assertInvocation()!==true||isAlive()!==true)fail('SERVICE_DISPOSED');};checkpoint();
  if(isAlive()!==true||ctx.fiber.state!==2)fail('SERVICE_DISPOSED');
  const m=await originalModules();checkpoint();
  const original=value=>value?.[m.cordis.symbols.original]??value;
  if(!(ctx instanceof m.cordis.Context))fail('WORKER_SOURCE_UNAVAILABLE');
  const get=name=>ctx.reflect.get(name),services={agents:get('agents'),llm:get('llm'),sessions:get('sessions'),tools:get('tools'),systemPrompt:get('systemPrompt'),agentPresets:get('agentPresets'),sessionPersistence:get('sessionPersistence'),approval:get('approval'),agentLoop:get('agentLoop'),loader:get('loader')};
  const classes={agents:m['dsh-agent'].AgentRegistry,llm:m['dsh-llm'].LlmRuntime,sessions:m['dsh-session'].SessionStore,tools:m['dsh-tools'].default,systemPrompt:m['dsh-system-prompt'].default,agentPresets:m['dsh-agent-preset-registry'].default,sessionPersistence:m['dsh-session-persistence-jsonl'].default,approval:m['dsh-user-approval'].default,agentLoop:m['dsh-agent-loop'].default,loader:m['cordis-plugin-loader'].default};
  for(const [key,C]of Object.entries(classes))if(!(services[key] instanceof C))fail(key==='agentPresets'?'WORKER_PRESET_UNAVAILABLE':key==='sessionPersistence'?'WORKER_PERSISTENCE_UNSUPPORTED':'WORKER_SOURCE_UNAVAILABLE');
  const Entry=m['cordis-plugin-loader'].Entry,loopEntry=locate(services.loader,Entry,classes.agentLoop,'agentLoop',services.agentLoop,original),persistenceEntry=locate(services.loader,Entry,classes.sessionPersistence,'sessionPersistence',services.sessionPersistence,original);
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
  if(choice.selection.provider==='df-testing-local'&&choice.selection.model==='df-testing-worker-v1'){
   const own=await import('../../src/testing-provider.mjs');checkpoint();
   const providerEntry=locate(services.loader,Entry,own.default,'llm',services.llm,original);
   // Its actual original entry has its declared llm injection. Keep all
   // operations scoped; an optional installed child never needs a getter for
   // an undeclared mandatory service and never uses the original raw object.
   providerBinding=own.getTestingProviderBinding(providerEntry.fiber.ctx);providerBinding.assertCurrent();providerSource=providerBinding.sourceRef;
  }
  if(choice.selection.provider==='df-approved-ollama'&&choice.selection.model==='deepseek-v4.1-flash:cloud'){
   if(!cloudAdmission)fail('WORKER_CATALOG_UNAVAILABLE');
   const own=await import('./ollama-binding.mjs');checkpoint();
   const providerEntry=locate(services.loader,Entry,own.default,'llm',services.llm,original);
   providerBinding=own.getApprovedOllamaBinding(providerEntry.fiber.ctx);providerBinding.assertCurrent();providerSource=providerBinding.sourceRef;
  }
  const supplied=[loopEntry,persistenceEntry].map(entry=>Object.freeze({entry,fiber:entry.fiber,namespace:entry.moduleNamespace}));
  const sourceRef=installedRef('df.installed-worker-source/v1',Object.fromEntries(Object.entries(services).map(([key,value])=>[key,lifetime(original(value))])),lifetime(loopEntry.fiber),lifetime(persistenceEntry.fiber),providerSource,providerBinding?lifetime(providerBinding.entry.fiber):null);
  const modelRef=installedRef('df.installed-worker-model/v1',model.provider,model.id,JSON.parse(JSON.stringify(selected))),presetRef=installedRef('df.installed-worker-preset/v1',preset.id,document,declared[0]),reasoningRef=installedRef('df.installed-worker-reasoning/v1',effort,choice.selection.maxOutputTokens),catalogEvidenceRef=installedRef('df.installed-worker-catalog/v1',modelRef,presetRef,reasoningRef,sourceRef);
  let allocation=previous?.allocation??null;
  if(allocation&&!same(allocation.currentLeaf,leaf))fail('WORKER_SOURCE_UNAVAILABLE');
  const approvedLeaf=allocation?allocation.approvedLeaf:leaf;
  const paths=immutable({parent,root,cwd,profile:profileFact,leaf:approvedLeaf});
  const environmentRef=installedRef('df.installed-worker-environment/v1',choice.environment,choice.persistence,paths);
  const assertCurrent=()=>{
   assertSources();
   if(isAlive()!==true||ctx.fiber.state!==2||ctx.fiber.uid===null)fail('SERVICE_DISPOSED');
   for(const[key,value]of Object.entries(services))if(original(get(key))!==original(value))fail('WORKER_SOURCE_UNAVAILABLE');
   for(const {entry,fiber,namespace} of supplied)if(entry.disabled||entry.fiber!==fiber||entry.moduleNamespace!==namespace||fiber.state!==2||fiber.uid===null)fail('WORKER_SOURCE_UNAVAILABLE');
   if(!same(fsFact(dirname(choice.persistence.directory),{privateMode:true}),parent)||!same(fsFact(choice.environment.root),root)||!same(fsFact(choice.environment.cwd),cwd)||!same(fsFact(profile.dir),profileFact)||!same(fsFact(choice.persistence.directory,{privateMode:true,absent:true}),allocation?.currentLeaf??leaf))fail('WORKER_SOURCE_UNAVAILABLE');
   if(services.sessionPersistence.config.root!==choice.persistence.directory||(services.sessionPersistence.config.compression??'zstd')!==choice.persistence.compression)fail('WORKER_PERSISTENCE_UNSUPPORTED');
   const activeProfile=get('profileContext');if(!activeProfile||activeProfile.dir!==profile.dir||activeProfile.name!==profile.name)fail('WORKER_SOURCE_UNAVAILABLE');
   providerBinding?.assertCurrent();return true;
  };
  if(isAlive()!==true)fail('SERVICE_DISPOSED');assertCurrent();
  return Object.freeze({services:Object.freeze(services),modules:Object.freeze(m),sourceRef,modelRef,presetRef,reasoningRef,catalogEvidenceRef,environmentRef,effort,providerBinding,pricing:providerBinding?.accounting==='df-ollama-api-token-units/v1'?'owner_admission_estimate':providerBinding?'source_zero':'unknown',admissionEstimate:providerBinding?.accounting==='df-ollama-api-token-units/v1'?immutable(cloudAdmission):null,accounting:providerBinding?.accounting??null,catalog:immutable({providers:providerRows,models,presets:[{id:preset.id,name:boundedText(preset.name??preset.id),available:true}]}),labels:immutable({provider:providerRows.find(row=>row.id===model.provider).name,model:model.name,reasoning:effort??'Native default',preset:boundedText(preset.name??preset.id)}),assertCurrent,get allocation(){return allocation;},claimDirectory(binding){
   exact(binding,['taskRef','actionRef','claimRef','generationRef']);
   for(const key of ['taskRef','actionRef','claimRef','generationRef'])if(typeof binding[key]!=='string'||!/^[a-f0-9]{64}$/.test(binding[key]))fail('WORKER_SOURCE_UNAVAILABLE');
   assertCurrent();if(leaf===null&&!allocation){try{mkdirSync(choice.persistence.directory,{mode:0o700});}catch{fail('WORKER_SOURCE_UNAVAILABLE');}allocation=Object.freeze({approvedLeaf:null,currentLeaf:fsFact(choice.persistence.directory,{privateMode:true}),claim:Object.freeze({taskRef:binding.taskRef,actionRef:binding.actionRef,claimRef:binding.claimRef,generationRef:binding.generationRef})});}assertCurrent();return true;
  }});
 }catch(error){const d=error&&!types.isProxy(error)?Object.getOwnPropertyDescriptor(error,'code'):null;const code=d?.value;throw new BootstrapError(['SERVICE_DISPOSED','OPERATOR_REQUIRED','REQUEST_ABORTED','WORKER_CATALOG_UNAVAILABLE','WORKER_PRESET_UNAVAILABLE','WORKER_PERSISTENCE_UNSUPPORTED','WORKER_SOURCE_UNAVAILABLE'].includes(code)?code:'WORKER_SOURCE_UNAVAILABLE');}
}
