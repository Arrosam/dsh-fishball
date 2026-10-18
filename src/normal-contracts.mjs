// Source-only capsule. Pure closed parsers; no native or durable effects.
import { types } from 'node:util';
import { posix } from 'node:path';
import { fail } from './ledger.mjs';
import { canonical, canonicalDigest, exact, ref, integer, hash } from './runtime-security.mjs';
export const NATIVE_KINDS=Object.freeze(['normal_native_intent','normal_native_origin','normal_native_capture','normal_native_finish','normal_resume','normal_resume_claim']);
export const NATIVE_DATA_KINDS=Object.freeze(['native_identity','native_configuration','native_history','native_request','context_check']);
export const POLICY_FIELDS=Object.freeze(['queueCapacity','maxActive','maxAttempts','maxTotalAttempts','maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros']);
export const LIMIT_FIELDS=Object.freeze(['queueCapacity','maxActive','maxAttempts','maxTotalAttempts','maxTasks','maxActionsPerTask','maxEventsPerTask','maxMetadataBytes','maxDataBytes','maxRecordsPerTask','maxCommands','maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros','maxControlCommands']);
export const detach=value=>JSON.parse(canonical(value));
export function text(value,max=65536){if(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||Buffer.byteLength(value)>max)fail('INVALID_INPUT');return value;}
export function array(value,max=128,min=0){if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<min||value.length>max)fail('INVALID_INPUT');const d=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(d).some(k=>typeof k!=='string'||k!=='length'&&(!/^(0|[1-9]\d*)$/.test(k)||Number(k)>=value.length||!d[k].enumerable||!Object.hasOwn(d[k],'value'))))fail('INVALID_INPUT');for(let i=0;i<value.length;i++)if(!Object.hasOwn(d,String(i)))fail('INVALID_INPUT');return value;}
export function sortedRefs(value,max=64,min=0){array(value,max,min);value.forEach(ref);if(value.some((v,i)=>i&&value[i-1]>=v))fail('INVALID_INPUT');return value;}
export function fullLimits(value,ceilings){exact(value,LIMIT_FIELDS);for(const k of LIMIT_FIELDS){integer(value[k],POLICY_FIELDS.includes(k)?0:k==='maxMetadataBytes'?256:1,k==='maxRuntimeMs'?Number.MAX_SAFE_INTEGER:100000000);if(ceilings&&!POLICY_FIELDS.includes(k)&&value[k]!==ceilings[k])fail('STALE_POLICY');}return detach(value);}
export function stableSource(value){exact(value,['contractVersion','host','product']);if(value.contractVersion!=='df.native-source/v1')fail('INVALID_INPUT');exact(value.host,['version','lockDigest','modules']);if(value.host.version!=='0.2.1-rc.2')fail('INVALID_INPUT');ref(value.host.lockDigest);const files=value=>{array(value,64,1);let last='';for(const row of value){exact(row,['path','digest']);text(row.path,512);ref(row.digest);if(row.path<=last||row.path.startsWith('/')||row.path.includes('\\')||posix.normalize(row.path)!==row.path||row.path.split('/').some(p=>p==='..'||p==='.'||p===''))fail('INVALID_INPUT');last=row.path;}};array(value.host.modules,32,1);let last='';for(const m of value.host.modules){exact(m,['name','version','files']);text(m.name,128);text(m.version,64);if(m.name<=last)fail('INVALID_INPUT');last=m.name;array(m.files,32,1);files(m.files);}exact(value.product,['name','version','files']);if(value.product.name!=='dsh-fishball')fail('INVALID_INPUT');text(value.product.version,64);files(value.product.files);return detach(value);}
function environment(v){exact(v,['root','cwd']);for(const k of ['root','cwd']){text(v[k],1024);if(!v[k].startsWith('/')||posix.normalize(v[k])!==v[k])fail('INVALID_INPUT');}if(v.cwd!==v.root&&!v.cwd.startsWith(v.root+'/'))fail('INVALID_INPUT');}
export function backend(v){exact(v,['contractVersion','sourceRef','directory','compression','retention','encrypted']);if(v.contractVersion!=='df.native-backend/v1'||v.retention!=='owner-managed'||v.encrypted!==false||!['none','zstd'].includes(v.compression))fail('INVALID_INPUT');ref(v.sourceRef);text(v.directory,1024);if(!v.directory.startsWith('/')||posix.normalize(v.directory)!==v.directory)fail('INVALID_INPUT');return v;}
function selection(v){exact(v,['provider','model','agentPreset','reasoningEffort','maxOutputTokens']);text(v.provider,128);text(v.model,256);text(v.agentPreset,128);if(v.reasoningEffort!==null)text(v.reasoningEffort,128);integer(v.maxOutputTokens,128,4096);}
function charges(v){exact(v,['runtimeMs','usageUnits']);integer(v.runtimeMs,1,60000);integer(v.usageUnits,1,100000000);}
function bounds(v){exact(v,['requestBytes','resultBytes']);integer(v.requestBytes,512,131072);integer(v.resultBytes,128,16384);}
function policy(v){exact(v,['maxRuntimeMs','maxUsageUnits','maxCostEstimateMicros']);integer(v.maxRuntimeMs,1,3600000);integer(v.maxUsageUnits,1,100000000);integer(v.maxCostEstimateMicros,0,100000000);}
export function continuation(v){exact(v,['enabled','maxContinuations','maxTotalAttempts','history']);if(v.enabled!==true)fail('INVALID_INPUT');integer(v.maxContinuations,1,8);integer(v.maxTotalAttempts,2,32);exact(v.history,['maxEvents','maxMessages','maxBytes']);integer(v.history.maxEvents,1,96);integer(v.history.maxMessages,3,17);integer(v.history.maxBytes,256,49152);return v;}
export function configuration(v,source,ceilings){exact(v,['source','configuration','backend','environment','selection','preset','tools','permission']);stableSource(v.source);if(source&&canonical(v.source)!==canonical(source))fail('WORKER_SOURCE_UNAVAILABLE');backend(v.backend);if(v.backend.sourceRef!==canonicalDigest(v.source))fail('INVALID_INPUT');environment(v.environment);exact(v.configuration,['worker','audit','continuation','acceptedPolicy']);const w=v.configuration.worker;exact(w,['enabled','selection','environment','persistence','bounds','policy','charges','previewTtlMs','grantTtlMs']);if(w.enabled!==true)fail('INVALID_INPUT');selection(w.selection);environment(w.environment);exact(w.persistence,['directory','compression','retention']);if(w.persistence.directory!==v.backend.directory||w.persistence.compression!==v.backend.compression||w.persistence.retention!==v.backend.retention||canonical(w.environment)!==canonical(v.environment))fail('INVALID_INPUT');bounds(w.bounds);policy(w.policy);charges(w.charges);integer(w.previewTtlMs,1,60000);integer(w.grantTtlMs,1,60000);
 const a=v.configuration.audit;if(a!==null){exact(a,['enabled','inputByteLimit','resultByteLimit','maxPrivateReviewers','blockingSeverities','maxRepairRounds','maxTotalAttempts','review','repair'],['enabled','inputByteLimit','resultByteLimit','maxPrivateReviewers','blockingSeverities','maxRepairRounds','maxTotalAttempts','review']);if(a.enabled!==true)fail('INVALID_INPUT');integer(a.inputByteLimit,1,65536);integer(a.resultByteLimit,1,65536);integer(a.maxPrivateReviewers,1,32);integer(a.maxRepairRounds,0,8);integer(a.maxTotalAttempts,2,32);array(a.blockingSeverities,4);if(new Set(a.blockingSeverities).size!==a.blockingSeverities.length||a.blockingSeverities.some(s=>!['fatal','blocking','warning','info'].includes(s)))fail('INVALID_INPUT');for(const r of [a.review,...(a.repair?[a.repair]:[])]){exact(r,['selection','charges']);selection(r.selection);charges(r.charges);}if(a.maxRepairRounds>0&&!a.repair)fail('INVALID_INPUT');}
 if(v.configuration.continuation!==null)continuation(v.configuration.continuation);const p=v.configuration.acceptedPolicy;exact(p,['version','limits','modelPolicy']);integer(p.version,1);fullLimits(p.limits,ceilings);exact(p.modelPolicy,['version','presetRefs','catalogEvidenceRef']);integer(p.modelPolicy.version,1);array(p.modelPolicy.presetRefs,32,1).forEach(ref);ref(p.modelPolicy.catalogEvidenceRef);
 const purposes=['producer',...(a?['audit_review',...(a.repair?['audit_repair']:[])]:[])];array(v.selection,3,1);array(v.preset,3,1);if(v.selection.length!==purposes.length||v.preset.length!==purposes.length)fail('INVALID_INPUT');for(let i=0;i<purposes.length;i++){const r=v.selection[i];exact(r,['purpose','selection','charges','bounds','systemPrompt','recipeDigest']);if(r.purpose!==purposes[i])fail('INVALID_INPUT');selection(r.selection);if(r.selection.reasoningEffort!=='deterministic')fail('MODEL_SOURCE_UNAVAILABLE');charges(r.charges);bounds(r.bounds);text(r.systemPrompt);ref(r.recipeDigest);const pr=v.preset[i];exact(pr,['purpose','description']);if(pr.purpose!==r.purpose)fail('INVALID_INPUT');exact(pr.description,['id','presetRef','documentDigest','moduleRefs','leakedServiceRefs']);text(pr.description.id,128);ref(pr.description.presetRef);ref(pr.description.documentDigest);array(pr.description.moduleRefs,0);array(pr.description.leakedServiceRefs,0);}
 exact(v.tools,['schemaRefs','restriction','vetoCode','toolsDigest']);array(v.tools.schemaRefs,0);ref(v.tools.toolsDigest);if(v.tools.restriction!=='allow-empty'||v.tools.vetoCode!=='DF_TOOL_DISPATCH_UNAVAILABLE')fail('INVALID_INPUT');exact(v.permission,['policy','resourcePolicyVersion','modelPolicyVersion','permissionPolicyDigest']);policy(v.permission.policy);integer(v.permission.resourcePolicyVersion,1);integer(v.permission.modelPolicyVersion,1);ref(v.permission.permissionPolicyDigest);if(p.version!==v.permission.resourcePolicyVersion||p.modelPolicy.version!==v.permission.modelPolicyVersion)fail('STALE_POLICY');return detach(v);}
export function canonicalContent(content,validator,max=65536){text(content,max);let v;try{v=JSON.parse(content);}catch{fail('INVALID_INPUT');}validator(v);if(canonical(v)!==content)fail('INVALID_INPUT');return v;}
export function finiteRequestCanonical(value){const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;return JSON.stringify(sorted(value));}
export function preparationRequest(v,knownSecrets=[]){exact(v,['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','terms','now','recordRefs','vectors','limit'],['taskRef','commandRef','expectedTaskVersion','expectedAuthEpoch','terms','now']);for(const key of ['recordRefs','vectors','limit'])if(Object.hasOwn(v,key)&&v[key]===undefined)fail('INVALID_INPUT');ref(v.taskRef);ref(v.commandRef);integer(v.expectedTaskVersion,1);integer(v.expectedAuthEpoch);integer(v.now);array(v.terms,32).forEach(t=>text(t,8192));if(v.recordRefs!==undefined)array(v.recordRefs,64).forEach(ref);if(v.limit!==undefined)integer(v.limit,0,32);if(v.vectors!==undefined)for(const vector of array(v.vectors,32))for(const n of array(vector,128))if(typeof n!=='number'||!Number.isFinite(n)||!Number.isFinite(Math.fround(n))||Number.isInteger(n)&&!Number.isSafeInteger(n))fail('INVALID_INPUT');const encoded=finiteRequestCanonical(v);if(Buffer.byteLength(encoded)>65536)fail('INPUT_TOO_LARGE');if(knownSecrets.some(secret=>encoded.includes(secret)||v.terms.some(term=>term.includes(secret))))fail('SECRET_REJECTED');return structuredClone(v);}
export function preparationDigest(c,v){preparationRequest(v);return hash(finiteRequestCanonical(['df.prepared-context.request/v1',c.ownerRef,c.workspaceRef,c.namespaceRef,c.principalRef,'putPreparedContext',v]));}
export function ownerFinishRequest(v){exact(v,['taskRef','actionRef','claimRef','generationRef','executionRef','commandRef','expectedTaskVersion','expectedAuthEpoch']);for(const k of ['taskRef','actionRef','claimRef','generationRef','executionRef','commandRef'])ref(v[k]);integer(v.expectedTaskVersion,1);integer(v.expectedAuthEpoch);return detach(v);}
export const finishDigest=(c,q)=>canonicalDigest(['df.normal-native.finish-command/v1',c.ownerRef,c.workspaceRef,ownerFinishRequest(q)]);
export function message(v){exact(v,['id','role','content','source']);text(v.id,128);array(v.content,1,1);exact(v.content[0],['type','text']);if(v.content[0].type!=='text')fail('INVALID_INPUT');text(v.content[0].text);if(v.role==='system'){exact(v.source,['kind']);if(v.source.kind!=='system-prompt')fail('INVALID_INPUT');}else if(v.role==='user'){ref(v.id);exact(v.source,['kind','form']);if(!['df-context','df-audit-input'].includes(v.source.kind)||v.source.form!=='local')fail('INVALID_INPUT');}else if(v.role==='assistant'){exact(v.source,['kind','provider','model']);if(v.source.kind!=='model')fail('INVALID_INPUT');text(v.source.provider,128);text(v.source.model,256);}else fail('INVALID_INPUT');return v;}
export function header(v){exact(v,['version','id','createdAt','cwd','isSeeded','agentPreset','delegationDepth'],['version','id','createdAt','cwd','isSeeded','delegationDepth']);if(v.version!==4||v.isSeeded!==false)fail('INVALID_INPUT');text(v.id,128);integer(v.createdAt);text(v.cwd,1024);integer(v.delegationDepth,0,0);if(v.agentPreset!==undefined)text(v.agentPreset,128);}
export function surface(v,eventCount){exact(v,['nodes','replaceGeneration','contentGeneration']);array(v.nodes,128);v.nodes.forEach(n=>integer(n,0,eventCount-1));if(new Set(v.nodes).size!==v.nodes.length)fail('INVALID_INPUT');integer(v.replaceGeneration);integer(v.contentGeneration);if(v.replaceGeneration||v.contentGeneration)fail('WORKER_RESUME_REPAIR_REQUIRED');}
function usage(v){exact(v,['inputTokens','outputTokens','totalTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'],['inputTokens','outputTokens']);Object.values(v).forEach(n=>integer(n));}
function assistantStream(v){array(v,128);for(const r of v){if(r.type==='text-chunks'){exact(r,['type','time0','index','dt','texts']);integer(r.time0);integer(r.index);array(r.dt,128).forEach(n=>integer(n));array(r.texts,128,1).forEach(t=>text(t));if(r.dt.length+1!==r.texts.length)fail('INVALID_INPUT');}else if(r.type==='chunk'){exact(r,['type','time','chunk']);integer(r.time);const c=r.chunk;switch(c.type){case'block-start':exact(c,['type','index','blockType']);integer(c.index);if(c.blockType!=='text')fail('INVALID_INPUT');break;case'block-end':exact(c,['type','index','block']);integer(c.index);exact(c.block,['type','text']);if(c.block.type!=='text')fail('INVALID_INPUT');text(c.block.text);break;case'usage':exact(c,['type','usage']);usage(c.usage);break;case'finish':exact(c,['type','reason']);exact(c.reason,['kind']);if(c.reason.kind!=='stop')fail('INVALID_INPUT');break;default:fail('INVALID_INPUT');}}else fail('INVALID_INPUT');}}
export function nativeEvents(events,max=128){array(events,max);let turn=null,step=null;for(let i=0;i<events.length;i++){const e=events[i];exact(e,['type','seq','time','data','ignorable','surfaceOp','sourceEventSeqs'],['type','seq','time','data']);integer(e.seq);integer(e.time);if(e.seq!==i||e.ignorable!==undefined&&e.ignorable!==true)fail('INVALID_INPUT');const surfaceEvent=['system/message','user/message','assistant/message'].includes(e.type);if(surfaceEvent){if(e.surfaceOp!=='append')fail('INVALID_INPUT');if(e.sourceEventSeqs!==undefined){if(e.type==='assistant/message')fail('INVALID_INPUT');array(e.sourceEventSeqs,128,1).forEach(n=>integer(n,0,i-1));if(new Set(e.sourceEventSeqs).size!==e.sourceEventSeqs.length)fail('INVALID_INPUT');}}else if(e.surfaceOp!==undefined||e.sourceEventSeqs!==undefined)fail('INVALID_INPUT');const d=e.data;switch(e.type){case'session/end-seed':exact(d,[]);break;case'turn/start':exact(d,['turn']);integer(d.turn,1);if(turn!==null)fail('WORKER_RESUME_REPAIR_REQUIRED');turn=d.turn;break;case'turn/end':exact(d,['turn','reason']);integer(d.turn,1);exact(d.reason,['kind']);if(d.reason.kind!=='completed'||turn!==d.turn||step!==null)fail('WORKER_RESUME_REPAIR_REQUIRED');turn=null;break;case'step/start':exact(d,['turn','step']);integer(d.turn,1);integer(d.step,1);if(d.turn!==turn||step!==null)fail('INVALID_INPUT');step=d.step;break;case'step/end':exact(d,['turn','step']);integer(d.turn,1);integer(d.step,1);if(d.turn!==turn||d.step!==step)fail('INVALID_INPUT');step=null;break;case'user/message':message(d);if(d.role!=='user')fail('INVALID_INPUT');break;case'system/message':exact(d,['turn','step','message']);integer(d.turn,1);integer(d.step,1);message(d.message);if(d.message.role!=='system')fail('INVALID_INPUT');break;case'assistant/message':exact(d,['turn','step','message','stream','usage'],['turn','step','message','stream']);integer(d.turn,1);integer(d.step,1);if(d.turn!==turn||d.step!==step)fail('INVALID_INPUT');message(d.message);if(d.message.role!=='assistant')fail('INVALID_INPUT');assistantStream(d.stream);if(d.usage!==undefined)usage(d.usage);break;case'request/header':exact(d,['header','reason','startsSeries'],['header','reason']);if(!['initial','resume','change','series'].includes(d.reason)||d.startsSeries!==undefined&&d.startsSeries!==true)fail('INVALID_INPUT');exact(d.header,['config','adapterDefaults'],['config']);exact(d.header.config,['provider','model','reasoningEffort','maxTokens'],['provider','model']);text(d.header.config.provider,128);text(d.header.config.model,256);if(d.header.config.reasoningEffort!==undefined&&d.header.config.reasoningEffort!=='deterministic')fail('INVALID_INPUT');if(d.header.config.maxTokens!==undefined)integer(d.header.config.maxTokens,128,4096);if(d.header.adapterDefaults!==undefined){exact(d.header.adapterDefaults,['reasoningEffort','maxTokens'],[]);if(Object.values(d.header.adapterDefaults).some(v=>v!==true))fail('INVALID_INPUT');}break;case'request/context':exact(d,['provider','model','contextWindow','systemPromptUpdate'],['provider','model']);text(d.provider,128);text(d.model,256);if(d.contextWindow!==undefined)integer(d.contextWindow,1);if(d.systemPromptUpdate!==undefined&&d.systemPromptUpdate!=='in-history')fail('INVALID_INPUT');break;case'agent-preset/selected':exact(d,['agentPreset']);text(d.agentPreset,128);break;case'approval/policy':exact(d,['policy']);if(d.policy!=='never')fail('INVALID_INPUT');break;case'agent/inbox/spliced':exact(d,['target','start','removedCount','inserted','outcome'],['target','start','inserted']);if(!['next-turn','next-step'].includes(d.target)||d.outcome!==undefined&&d.outcome!=='canceled')fail('INVALID_INPUT');integer(d.start);if(d.removedCount!==undefined)integer(d.removedCount);array(d.inserted,1);d.inserted.forEach(m=>{message(m);if(m.role!=='user')fail('INVALID_INPUT');});break;default:fail('INVALID_INPUT');}}if(turn!==null||step!==null)fail('WORKER_RESUME_REPAIR_REQUIRED');return events;}
export function historyObservation(v){exact(v,['schema','ownerRef','workspaceRef','taskRef','claimRef','generationRef','sessionRef','sourceRef','stableSourceRef','configurationDigest','header','events','surface','messages']);if(v.schema!=='df.native-history/v1')fail('INVALID_INPUT');for(const k of ['ownerRef','workspaceRef','taskRef','claimRef','generationRef','sessionRef','sourceRef','stableSourceRef','configurationDigest'])ref(v[k]);header(v.header);nativeEvents(v.events);surface(v.surface,v.events.length);array(v.messages,19).forEach(message);const projected=v.surface.nodes.map(n=>{const e=v.events[n];return e.type==='user/message'?e.data:e.data.message;});if(projected.some(v=>!v)||canonical(projected)!==canonical(v.messages))fail('INVALID_INPUT');return v;}
export function resumeHistory(v){exact(v,['schema','ownerRef','workspaceRef','taskRef','originRef','predecessor','ordinal','sessionRef','persistence','header','events','surface','messages','contextRecordRef','contextDigest','configurationRef','sourceRef']);if(v.schema!=='df.resume-history/v1')fail('INVALID_INPUT');for(const k of ['ownerRef','workspaceRef','taskRef','originRef','sessionRef','contextRecordRef','contextDigest','configurationRef','sourceRef'])ref(v[k]);integer(v.ordinal,1,8);exact(v.predecessor,['predecessorActionRef','predecessorClaimRef','predecessorGenerationRef','predecessorExecutionRef','artifactRef','artifactVersion','artifactDigest','releaseEvidenceRef']);for(const [k,x]of Object.entries(v.predecessor))k==='artifactVersion'?integer(x,1,1):ref(x);backend(v.persistence);header(v.header);nativeEvents(v.events,96);surface(v.surface,v.events.length);array(v.messages,17,3).forEach(message);if(canonical(v.surface.nodes.map(n=>v.events[n].type==='user/message'?v.events[n].data:v.events[n].data.message))!==canonical(v.messages))fail('INVALID_INPUT');return v;}
export function resumeInput(v){exact(v,['schema','ownerRef','workspaceRef','taskRef','originRef','ordinal','sessionRef','historyDigest','historyMessages','contextRecordRef','contextDigest','contextContent']);if(v.schema!=='df.resume-input/v1')fail('INVALID_INPUT');for(const k of ['ownerRef','workspaceRef','taskRef','originRef','sessionRef','historyDigest','contextRecordRef','contextDigest'])ref(v[k]);integer(v.ordinal,1,8);array(v.historyMessages,17,3).forEach(message);text(v.contextContent);if(hash(v.contextContent)!==v.contextDigest)fail('INVALID_INPUT');return v;}

const PAYLOAD_SCHEMAS={
  "PreparedCheck": {
    "contractVersion": "'df.prepared-context-check/v1'",
    "checkRef": "Ref",
    "taskRef": "Ref",
    "contextRecordRef": "Ref",
    "contextDigest": "Digest",
    "sourceTaskVersion": "Positive",
    "sourceAuthEpoch": "UInt",
    "committedTaskVersion": "Positive",
    "committedAuthEpoch": "UInt",
    "semanticRevision": "UInt",
    "generatedAt": "UInt",
    "ledgerSnapshotDigest": "Digest",
    "memory": "MemoryVersion",
    "method": "'version-currentness/v1'",
    "winningSources": "sorted distinct WinningSource[1..64]",
    "summaryChecks": "sorted distinct SummaryCheck[0..64]",
    "conflicts": "sorted distinct ContextConflict[0..64]",
    "ownerRef": "Ref",
    "workspaceRef": "Ref",
    "commandRef": "Ref",
    "preparationPrincipalRef": "Ref",
    "preparationRequestDigest": "Digest",
    "selectionMode": "SelectionMode",
    "checkedSetDigest": "Digest"
  },
  "PreparedBinding": {
    "contractVersion": "'df.prepared-context-binding/v1'",
    "checkRef": "Ref",
    "taskRef": "Ref",
    "contextRecordRef": "Ref",
    "contextDigest": "Digest",
    "checkRecordRef": "Ref",
    "checkDigest": "Digest",
    "commandRef": "Ref",
    "preparationPrincipalRef": "Ref",
    "preparationRequestDigest": "Digest",
    "selectionMode": "SelectionMode",
    "checkedSetDigest": "Digest",
    "sourceTaskVersion": "Positive",
    "sourceAuthEpoch": "UInt",
    "committedTaskVersion": "Positive",
    "committedAuthEpoch": "UInt",
    "semanticRevision": "UInt",
    "generatedAt": "UInt",
    "namespaceRef": "Ref",
    "memoryRevision": "UInt",
    "method": "'version-currentness/v1'"
  },
  "NativeIntent": {
    "contractVersion": "'df.normal-native/normal_native_intent/v1'",
    "intentRef": "Ref equals claimRef",
    "taskRef": "Ref",
    "actionRef": "Ref",
    "actionDigest": "Ref",
    "claimRef": "Ref",
    "generationRef": "Ref",
    "sessionRef": "Ref",
    "identityRecordRef": "Ref",
    "identityDigest": "Digest",
    "configurationRecordRef": "Ref",
    "configurationDigest": "Digest",
    "sourceRef": "Ref stableSourceRef",
    "createConfigDigest": "Digest configurationDigest",
    "backendRef": "Ref",
    "createdAt": "UInt",
    "purpose": "Purpose",
    "inputBinding": "PreparedInputBinding if producer else AuditInputBinding"
  },
  "NativeOrigin": {
    "contractVersion": "'df.normal-native/normal_native_origin/v1'",
    "originRef": "Ref",
    "intentRef": "Ref",
    "taskRef": "Ref",
    "claimRef": "Ref",
    "generationRef": "Ref",
    "sessionRef": "Ref",
    "creationEvidenceRef": "Ref",
    "baselineHistoryRecordRef": "Ref",
    "baselineHistoryDigest": "Digest",
    "createdAt": "UInt"
  },
  "NativeCapture": {
    "contractVersion": "'df.normal-native/normal_native_capture/v1'",
    "captureRef": "Ref",
    "originRef": "Ref",
    "taskRef": "Ref",
    "actionRef": "Ref",
    "actionDigest": "Ref",
    "claimRef": "Ref",
    "generationRef": "Ref",
    "sessionRef": "Ref",
    "executionRef": "Ref",
    "contextRecordRef": "Ref actual protected context",
    "contextDigest": "Digest actual protected context",
    "resumeRef": "Ref|null",
    "fullInputDigest": "Digest|null",
    "artifactRef": "Ref|null",
    "artifactVersion": "Positive|null",
    "artifactDigest": "Digest|null",
    "resultDigest": "Digest",
    "cursor": "UInt",
    "persistenceEvidenceRef": "Ref",
    "committedHistoryRecordRef": "Ref",
    "committedHistoryDigest": "Digest",
    "eventCount": "UInt<=128",
    "headerDigest": "Digest",
    "messagesDigest": "Digest",
    "usageUnits": "UInt<=actual reserved bound",
    "accounting": "'df-testing-utf8-byte-units/v1'",
    "createdAt": "UInt",
    "phase": "'output'|'repair_artifact'",
    "purpose": "Purpose",
    "inputCursor": "UInt<cursor",
    "auditBinding": "AuditCaptureBinding|null",
    "outputCaptureRef": "Ref|null"
  },
  "NativeFinish": {
    "contractVersion": "'df.normal-native/normal_native_finish/v1'",
    "finishRef": "Ref equals claimRef",
    "taskRef": "Ref",
    "claimRef": "Ref",
    "generationRef": "Ref",
    "executionRef": "Ref",
    "captureRef": "Ref primary output",
    "terminalEvidenceRef": "Ref",
    "outcomeEvidenceRef": "Ref",
    "releaseEvidenceRef": "Ref|null",
    "usageState": "'actual'|'unknown'",
    "usageUnits": "UInt|null only unknown",
    "releaseState": "'held'|'released'",
    "createdAt": "UInt",
    "commandRef": "Ref",
    "ownerRequestDigest": "Digest",
    "artifactCaptureRef": "Ref|null"
  },
  "NativeResume": {
    "contractVersion": "'df.normal-native/normal_resume/v1'",
    "resumeRef": "Ref",
    "taskRef": "Ref",
    "originRef": "Ref",
    "predecessorClaimRef": "Ref",
    "predecessorCaptureRef": "Ref",
    "predecessorFinishRef": "Ref",
    "ordinal": "integer1..8",
    "sessionRef": "Ref",
    "contextRecordRef": "Ref",
    "contextDigest": "Digest",
    "historyRecordRef": "Ref",
    "historyDigest": "Digest",
    "inputRecordRef": "Ref",
    "inputDigest": "Digest",
    "configurationRecordRef": "Ref",
    "configurationDigest": "Digest",
    "semanticRevision": "UInt",
    "sourceTaskVersion": "Positive",
    "sourceAuthEpoch": "UInt",
    "createdAt": "UInt"
  },
  "NativeResumeClaim": {
    "contractVersion": "'df.normal-native/normal_resume_claim/v1'",
    "claimRef": "Ref",
    "resumeRef": "Ref",
    "taskRef": "Ref",
    "originRef": "Ref",
    "predecessorClaimRef": "Ref",
    "actionRef": "Ref",
    "actionDigest": "Ref",
    "generationRef": "Ref",
    "sessionRef": "Ref",
    "reservationRef": "Ref",
    "createdAt": "UInt"
  }
};
export function payload(name,value){const fields=PAYLOAD_SCHEMAS[name];if(!fields)fail('INVALID_INPUT');exact(value,Object.keys(fields));for(const [key,type]of Object.entries(fields)){const v=value[key];if(v===null&&type.includes('null'))continue;if(type==='Purpose'){if(!['producer','audit_review','audit_repair'].includes(v))fail('INVALID_INPUT');}else if(type.startsWith('Ref')||type.startsWith('Digest')){if(type.includes('[')){array(v,64).forEach(ref);}else ref(v);}else if(type.startsWith('Positive'))integer(v,1);else if(type.startsWith('UInt'))integer(v);else if(type.startsWith('integer1..8'))integer(v,1,8);else if(type.startsWith("'")){const literals=[...type.matchAll(/'([^']+)'/g)].map(m=>m[1]);if(!literals.includes(v))fail('INVALID_INPUT');}}
 if(name==='PreparedCheck'){
  if(value.contractVersion!=='df.prepared-context-check/v1'||value.method!=='version-currentness/v1'||!['all_eligible','explicit_records'].includes(value.selectionMode))fail('INVALID_INPUT');exact(value.memory,['namespaceRef','revision']);ref(value.memory.namespaceRef);integer(value.memory.revision);
  array(value.winningSources,64,1);let last='';for(const row of value.winningSources){exact(row,['recordRef','digest','kind']);ref(row.recordRef);ref(row.digest);if(!['goal','constraints','current_instruction'].includes(row.kind)||row.recordRef<=last)fail('INVALID_INPUT');last=row.recordRef;}
  array(value.summaryChecks,64);last='';for(const row of value.summaryChecks){exact(row,['recordRef','digest','sourceTaskVersion','sourceAuthEpoch','generatedAt','sourceRefs','disposition']);ref(row.recordRef);ref(row.digest);integer(row.sourceTaskVersion,1,value.sourceTaskVersion);integer(row.sourceAuthEpoch,0,value.sourceAuthEpoch);integer(row.generatedAt,0,value.generatedAt);array(row.sourceRefs,16,1).forEach(ref);if(!['retained_background','dropped_for_budget','excluded_stale_summary'].includes(row.disposition)||row.recordRef<=last)fail('INVALID_INPUT');last=row.recordRef;}
  array(value.conflicts,64);last='';for(const row of value.conflicts){exact(row,['recordRef','reason','winningTaskVersion','winningAuthEpoch']);ref(row.recordRef);if(row.reason!=='stale_summary'||row.recordRef<=last||row.winningTaskVersion!==value.sourceTaskVersion||row.winningAuthEpoch!==value.sourceAuthEpoch)fail('INVALID_INPUT');last=row.recordRef;}
  if(value.checkedSetDigest!==canonicalDigest(value.summaryChecks.map(({recordRef,digest})=>({recordRef,digest}))))fail('INVALID_INPUT');
 }
 if(name==='PreparedBinding'&&(value.contractVersion!=='df.prepared-context-binding/v1'||value.method!=='version-currentness/v1'||!['all_eligible','explicit_records'].includes(value.selectionMode)))fail('INVALID_INPUT');
 if(name==='NativeIntent'){if(value.purpose==='producer'){exact(value.inputBinding,['checkRef','contextRecordRef','contextDigest','preparationPrincipalRef','preparationRequestDigest']);Object.values(value.inputBinding).forEach(ref);}else{exact(value.inputBinding,['inputRecordRef','inputDigest','auditRef','bindingDigest','materialDigest','previousReportRef','artifactTarget']);for(const k of ['inputRecordRef','inputDigest','auditRef','bindingDigest','materialDigest'])ref(value.inputBinding[k]);if(value.inputBinding.previousReportRef!==null)ref(value.inputBinding.previousReportRef);artifactTarget(value.inputBinding.artifactTarget);if(value.purpose==='audit_review'&&(value.inputBinding.previousReportRef!==null||value.inputBinding.artifactTarget!==null)||value.purpose==='audit_repair'&&(value.inputBinding.previousReportRef===null||value.inputBinding.artifactTarget===null))fail('INVALID_INPUT');}}
 if(name==='NativeCapture'){if(value.cursor<=value.inputCursor||value.eventCount>128||value.accounting!=='df-testing-utf8-byte-units/v1')fail('INVALID_INPUT');if(value.purpose==='producer'){if(value.auditBinding!==null||value.artifactRef===null||value.artifactDigest===null||value.artifactVersion!==1||value.outputCaptureRef!==null||value.phase!=='output')fail('INVALID_INPUT');}else{const a=value.auditBinding;exact(a,['resultRef','resultRecordRef','resultDigest','inputRecordRef','inputDigest','auditRef','bindingDigest','materialDigest','previousReportRef','artifactTarget']);for(const k of ['resultRef','resultRecordRef','resultDigest','inputRecordRef','inputDigest','auditRef','bindingDigest','materialDigest'])ref(a[k]);if(a.previousReportRef!==null)ref(a.previousReportRef);artifactTarget(a.artifactTarget);if(value.purpose==='audit_review'&&(value.artifactRef!==null||value.artifactVersion!==null||value.artifactDigest!==null||a.artifactTarget!==null||value.phase!=='output'||value.outputCaptureRef!==null))fail('INVALID_INPUT');if(value.purpose==='audit_repair'&&(a.artifactTarget===null||a.previousReportRef===null||value.phase==='output'&&(value.artifactRef!==null||value.artifactVersion!==null||value.artifactDigest!==null||value.outputCaptureRef!==null)))fail('INVALID_INPUT');if(value.phase==='repair_artifact'&&(value.purpose!=='audit_repair'||!value.outputCaptureRef||!value.artifactRef||!value.artifactVersion||!value.artifactDigest))fail('INVALID_INPUT');}}
 if(name==='NativeFinish'){if(value.usageState!=='actual'||value.usageUnits===null||(value.releaseState==='released')!==(value.releaseEvidenceRef!==null))fail('INVALID_INPUT');}
 return detach(value);}
function artifactTarget(v){if(v!==null){exact(v,['artifactRef','version']);ref(v.artifactRef);integer(v.version,1);}}

export function normalInput(value){if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)fail('INVALID_INPUT');exact(value,Object.keys(Object.getOwnPropertyDescriptors(value)));const request=value.request===undefined?undefined:preparationRequest(value.request),copy=detach({...value,...(request===undefined?{}:{request:{}})});if(request!==undefined)copy.request=request;const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};return freeze(copy);}
