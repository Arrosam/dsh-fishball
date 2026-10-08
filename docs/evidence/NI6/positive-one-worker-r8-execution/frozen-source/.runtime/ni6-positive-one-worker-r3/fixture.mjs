// Source-only positive fixture. Genuine original public services and owner HTTP.
import { readFileSync, realpathSync, lstatSync, readlinkSync, existsSync, readdirSync,
  mkdirSync, openSync, closeSync, writeFileSync, fchmodSync, fstatSync, fsyncSync, constants } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { request } from 'node:http';

const STARTED = performance.now();
const WORK_END = STARTED + 24000, FINAL_END = STARTED + 30000;
const ROOT = '/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball';
const NAME = '.runtime/ni6-positive-one-worker-r3';
const CAPSULE = resolve(ROOT, NAME), HOST = resolve(ROOT, '.runtime/dsh-web');
const PRODUCT = resolve(ROOT, '.runtime/ni6-public-preparation-r3/package');
const PLAN_NAME = '.runtime/root-ni6-positive-one-worker-r3-execution-plan.json';
const RESULT = resolve(CAPSULE, 'fixture-result.json');
const GRAPH_NAME = '.runtime/ni3-native-runtime/public-graph-pins.json';
const NODE = '/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node';
const PYTHON = '/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14';
const PHASES = Object.freeze(["PREFLIGHT", "IMPORTS", "NAMESPACE", "CONTEXT", "PLUGIN_LOADER", "PLUGIN_PROJECTIONS", "PLUGIN_SESSIONS", "PLUGIN_APPROVAL", "PLUGIN_AGENTS", "PLUGIN_LLM", "PLUGIN_SYSTEM_PROMPT", "PLUGIN_TOOLS", "PLUGIN_CREDENTIALS", "PLUGIN_WEB_SERVER", "PLUGIN_CONNECTION", "LISTENER_FENCE", "INDEX_ROUTE", "PUBLIC_SERVICES", "PRESET", "ENTRY_START", "AUTH", "SETUP_STATUS", "SETUP_PREPARE", "SETUP_CONFIRM", "SETUP_READY", "LIST", "INTAKE", "STATUS", "CONTEXT_PREPARE", "CONTEXT_DETAIL", "CATALOG", "POLICY_PREVIEW", "POLICY_CONFIRM", "WORKER_PLAN", "WORKER_PREVIEW", "WORKER_GRANT", "WORKER_CREATE", "WORKER_IDLE", "WORKER_EXECUTE", "WORKER_QUERY", "WORKER_CAPTURE", "WORKER_RESULT", "WORKER_FINISH", "FINAL_STATUS", "PRESET_RELEASE", "ENTRY_REMOVE", "POST_DISPOSAL", "ROOT_CLEANUP", "COMPLETE"]);
const CATEGORIES = Object.freeze(['NONE','REJECTION','INVARIANT','DEADLINE']);
const ZERO = Object.freeze({agentCreated:0,agentDisposed:0,sessionCreated:0,sessionDisposed:0,sessionEvents:0,streams:0,tools:0});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let phase = 'PREFLIGHT', firstFailure, admitted = false, completedPlugins = 0;
let entryRemoved = false, rootClosed = false;
function failure(category) { firstFailure ??= Object.freeze({phase,category}); }
function invariant(condition) {
  if (!condition) { failure('INVARIANT'); throw new Error(); }
}
function equal(actual, expected) {
  try { assert.deepEqual(actual, expected); } catch { failure('INVARIANT'); throw new Error(); }
}
function clock(end = WORK_END) {
  if (!(performance.now() < end)) { failure('DEADLINE'); throw new Error(); }
}
async function step(name, action, maximum = 3000, end = WORK_END) {
  phase = name; clock(end);
  const remaining = Math.min(maximum, end - performance.now());
  let timer;
  try {
    const value = await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
      timer = setTimeout(() => { failure('DEADLINE'); reject(new Error()); }, remaining);
    })]);
    clock(end); return value;
  } catch { failure('REJECTION'); throw new Error(); }
  finally { clearTimeout(timer); }
}
function regular(path, mode) {
  const s = lstatSync(path);
  invariant(s.isFile() && !s.isSymbolicLink() && realpathSync(path) === path
    && (mode === undefined || (s.uid === process.getuid() && (s.mode & 0o777) === mode)));
  return s;
}
function directory(path) {
  const s = lstatSync(path);
  invariant(s.isDirectory() && !s.isSymbolicLink() && realpathSync(path) === path
    && s.uid === process.getuid() && (s.mode & 0o777) === 0o700);
}
function contained(name) {
  invariant(typeof name === 'string' && !name.startsWith('/')
    && name.split('/').every(part => part && part !== '.' && part !== '..'));
  const path = resolve(ROOT,name);
  invariant(path.startsWith(ROOT + sep) && realpathSync(path) === path); return path;
}
function bytes(path) { clock(); regular(path); const value = readFileSync(path); clock(); return value; }
function json(path) { return JSON.parse(bytes(path).toString('utf8')); }
function preflight() {
  invariant(process.argv.length === 2 && process.version === 'v22.22.2' && realpathSync(process.execPath) === NODE);
  invariant(realpathSync(ROOT) === ROOT && fileURLToPath(import.meta.url) === resolve(CAPSULE,'fixture.mjs'));
  directory(CAPSULE);
  const manifestPath = resolve(CAPSULE,'source-manifest.json');
  const manifest = json(manifestPath), proposal = json(resolve(CAPSULE,'execution-plan.proposed.json'));
  const planPath = contained(PLAN_NAME); regular(planPath,0o600);
  const plan = json(planPath);
  for (const key of manifest.environmentMustBeAbsent) invariant(!Object.hasOwn(process.env,key));
  invariant(plan.rootReviewedExecutionGO === true && plan.rootSupportedExecutionApprovalGranted === true
    && plan.rootReviewedFinalAffectedReports === true);
  equal(Object.keys(plan).sort(), Object.keys(proposal).sort());
  for (const key of Object.keys(proposal)) {
    if (!['rootReviewedExecutionGO','rootSupportedExecutionApprovalGranted','rootReviewedFinalAffectedReports','pins'].includes(key)) equal(plan[key],proposal[key]);
  }
  equal(manifest.phases,PHASES); equal(manifest.categories,CATEGORIES); equal(manifest.createPhases,CREATE_PHASES);
  const expected = new Map([...manifest.ownedFiles,...manifest.inputFiles].map(row => [row.path,row.sha256]));
  expected.set(NAME + '/source-manifest.json',sha(bytes(manifestPath)));
  equal(Object.keys(plan.pins).sort(),[...expected.keys(),...manifest.requiredAffectedReviews].sort());
  for (const [name,digest] of expected) invariant(plan.pins[name] === digest);
  for (const [name,digest] of Object.entries(plan.pins)) {
    invariant(typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest));
    const path = name.startsWith('/') ? name : contained(name);
    invariant(!name.startsWith('/') || path === NODE || path === PYTHON);
    invariant(sha(bytes(path)) === digest);
  }
  for (const row of [...manifest.ownedFiles,...manifest.inputFiles]) {
    const path = row.path.startsWith('/') ? row.path : contained(row.path);
    invariant(bytes(path).length === row.bytes);
  }
  for (const link of manifest.topology) {
    clock(); invariant(lstatSync(link.path).isSymbolicLink() && readlinkSync(link.path) === link.target
      && realpathSync(link.path) === link.resolved); clock();
  }
  const graph = json(contained(GRAPH_NAME));
  invariant(graph.root === HOST && Object.keys(graph.files).length === 27577 && Object.keys(graph.links).length === 12);
  for (const [name,digest] of Object.entries(graph.files)) {
    invariant(name.startsWith('node_modules/'));
    invariant(sha(bytes(contained('.runtime/dsh-web/' + name))) === digest);
  }
  for (const [name,link] of Object.entries(graph.links)) {
    clock(); const path = resolve(HOST,name);
    invariant(name.startsWith('node_modules/') && !name.split('/').some(part => !part || part === '.' || part === '..')
      && lstatSync(path).isSymbolicLink() && readlinkSync(path) === link.target && realpathSync(path) === link.resolved); clock();
  }
  const seenFiles = new Set(), seenLinks = new Set();
  function inventory(directory) {
    clock(); invariant(realpathSync(directory) === directory);
    for (const name of readdirSync(directory)) {
      clock(); const path = resolve(directory,name), rel = relative(HOST,path), item = lstatSync(path);
      if (item.isSymbolicLink()) { invariant(Object.hasOwn(graph.links,rel)); seenLinks.add(rel); }
      else if (item.isDirectory()) inventory(path);
      else { invariant(item.isFile() && Object.hasOwn(graph.files,rel)); seenFiles.add(rel); }
      clock();
    }
  }
  inventory(resolve(HOST,'node_modules'));
  equal([...seenFiles].sort(),Object.keys(graph.files).sort()); equal([...seenLinks].sort(),Object.keys(graph.links).sort());
  const observed = json(contained(manifest.actualBuildReturn));
  invariant(observed.contractVersion === 'df.ni6-prep01-observed-build-driver-return/v1'
    && observed.actualDriverExitCode === 0 && observed.actualCommandsExitZero === 4
    && observed.fixtureManifestSha256 === manifest.ancestorSourceManifestSha256
    && observed.generatedClientSha256 === manifest.builtClientSha256 && observed.generatedDescriptorSha256 === manifest.builtDescriptorSha256);
  const build = json(contained(manifest.buildReadback));
  invariant(build.contractVersion === 'df.ni6-prep01-build-readback/v1' && build.sourceManifestSha256 === manifest.ancestorSourceManifestSha256
    && build.generated.clientSha256 === manifest.builtClientSha256 && build.generated.descriptorSha256 === manifest.builtDescriptorSha256
    && build.productBuildInputCount === 63 && build.productDescriptorFileCount === 64);
  invariant(!existsSync(resolve(CAPSULE,'private-runtime')) && !existsSync(RESULT));
  clock(); admitted = true;
}


const GOAL = 'Synthetic NI6 positive01: return one bounded deterministic local result.';
const ROUTES = Object.freeze([
 ['/df-setup','status'],['/df-setup','prepare'],['/df-setup','confirm'],['/df-setup','status'],
 ['/df-rpc','list'],['/df-rpc','intake'],['/df-rpc','status'],['/df-rpc','prepareContext'],['/df-rpc','detail'],
 ...['workerCatalog','workerPolicyPreview','workerPolicyConfirm','workerPlan','workerPreview','workerGrant','workerCreate','workerQuery','workerExecute','workerQuery','workerCapture','workerResult','workerFinish','status'].map(n=>['/df-rpc',n])]);
const REFUSALS = Object.freeze(["NONE", "STALE_VERSION", "WORKER_POLICY_REQUIRED", "WORKER_POLICY_STALE", "WORKER_PREVIEW_STALE", "WORKER_CONFIRMATION_REQUIRED", "WORKER_CONTEXT_INVALID", "WORKER_MAPPING_MISMATCH", "WORKER_RESULT_UNAVAILABLE", "WORKER_FINISH_UNAVAILABLE", "WORKER_SOURCE_UNAVAILABLE", "WORKER_PERSISTENCE_UNSUPPORTED", "WORKER_PRESET_UNAVAILABLE", "WORKER_REQUEST_DENIED", "WORKER_SESSION_UNAVAILABLE", "WORKER_CATALOG_UNAVAILABLE", "WORKER_NOT_CONFIGURED", "COST_UNKNOWN", "CONFIG_INVALID", "INPUT_INVALID", "OUTPUT_TOO_LARGE", "SERVICE_DISPOSED", "CONTEXT_LIMIT", "STORAGE_INVALID", "WORKER_EXECUTION_ALREADY_SUBMITTED", "INVALID_INPUT", "STALE_AUTHORITY", "HOST_PERMISSION_DENIED", "STALE_MEMORY", "HOST_DENIED", "APPROVAL_INVALID", "CLAIM_REVOKED", "SPEC_MISMATCH", "STALE_POLICY", "ACTIVE_FULL", "OPERATION_REJECTED", "OTHER_REFUSAL"]);
const CREATE_PHASES = Object.freeze(["NOT_RETURNED", "created", "ready", "running", "unknown", "cancel_requested", "stopped", "not_created"]);
let refusalCode='NONE',createPhase='NOT_RETURNED';
const RESULT_FIELDS = Object.freeze(['contractVersion','result','phase','category','refusalCode','createPhase','positivePath','taskCreated','workerCreated',
 'executionCommitted','resultReturned','workerStopped','reservationReleased','entryRemoved','ownedEntriesRemoved','rootClosed',
 'completedPlugins','httpRequests','requests','streams','tools','stepStarts','stepEnds','turnStarts','turnEnds','all87','CODE']);
function ref(value) { invariant(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)); return value; }
function uint(value) { invariant(Number.isSafeInteger(value) && value >= 0); return value; }
function keys(value, names) { invariant(value !== null && typeof value === 'object' && !Array.isArray(value)); equal(Object.keys(value).sort(),[...names].sort()); }
function publicTask(value, taskRef) {
 invariant(value && ref(value.taskRef) && Number.isSafeInteger(value.version) && value.version>0 && uint(value.authEpoch)>=0);
 if (taskRef !== undefined) invariant(value.taskRef===taskRef);
 invariant(value.status !== 'completed'); return value;
}
function transport(connection,port) {
 invariant(Number.isSafeInteger(port)&&port>0&&port<=65535&&port!==3080);
 const authority=`127.0.0.1:${port}`; let cookie,posts=0,total=0,exchanges=0,active=true;
 async function send(method,path,body,auth) {
  clock(); invariant(active&&++total<=25&&path.startsWith('/')&&!/[\r\n]/.test(path));
  const data=body===undefined?undefined:Buffer.from(JSON.stringify(body));invariant(!data||data.length<=2048);
  const headers={Host:authority,Origin:`http://${authority}`};if(auth){invariant(typeof cookie==='string');headers.Cookie=cookie;}
  if(data){headers['Content-Type']='application/json';headers['Content-Length']=data.length;}
  return new Promise((done,reject)=>{
   let settled=false,timer;const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);reject(new Error());};
   const req=request({hostname:'127.0.0.1',port,method,path,headers,agent:false},res=>{
    let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>65536){res.destroy();req.destroy();fail();}else chunks.push(chunk);});
    res.on('error',fail);res.on('end',()=>{if(settled)return;settled=true;clearTimeout(timer);done({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)});});
   });req.on('error',fail);timer=setTimeout(()=>{req.destroy();fail();},Math.max(1,Math.min(2000,WORK_END-performance.now())));req.end(data);
  });
 }
 return {async authenticate(){invariant(++exchanges===1&&posts===0);const u=new URL(connection.authenticatedUrl(`http://${authority}/`));invariant(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port===String(port)&&u.pathname==='/');
   const r=await send('GET',u.pathname+u.search,undefined,false);invariant(r.status===303&&r.headers.location==='./'&&r.bytes.length===0);const c=r.headers['set-cookie'];invariant(Array.isArray(c)&&c.length===1);cookie=c[0].split(';',1)[0];invariant(cookie.length>0&&Buffer.byteLength(cookie)<=4096&&!/[\r\n]/.test(cookie));clock();},
  async call(channel,name,payload){clock();invariant(exchanges===1&&posts<23);equal([channel,name],ROUTES[posts]);const rpcId=`ni6-positive01-${++posts}`;
   const r=await send('POST',`${channel}/v1/${name}`,{type:'client-request',rpcId,method:`v1/${name}`,payload},true);clock();invariant(r.status===200&&r.headers['content-type']?.split(';')[0]==='application/json');
   const m=JSON.parse(r.bytes.toString('utf8'));keys(m,['type','rpcId','result']);invariant(m.type==='server-response'&&m.rpcId===rpcId);invariant(typeof m.result.ok==='boolean');if(!m.result.ok){keys(m.result,['ok','error']);keys(m.result.error,['code','message','details']);const code=m.result.error.code;invariant(typeof code==='string'&&Buffer.byteLength(code)<=128);refusalCode=REFUSALS.includes(code)&&code!=='NONE'?code:'OTHER_REFUSAL';failure('REJECTION');throw new Error();}keys(m.result,['ok','value']);return m.result.value;},
  async removed(payload){invariant(posts===23&&exchanges===1);const r=await send('POST','/df-rpc/v1/status',{type:'client-request',rpcId:'ni6-positive01-24',method:'v1/status',payload},true);invariant(r.status===404&&r.bytes.length===0);},
  total:()=>total,close(){active=false;cookie=undefined;}};
}
async function main() {
 let ctx,http,presetDisposer,presetReleased=false,workerAgent,currentTask,addressed,positivePath=false;
 const entries=[],counts={...ZERO},facts={taskCreated:false,workerCreated:false,executionCommitted:false,resultReturned:false,workerStopped:false,reservationReleased:false,ownedEntriesRemoved:false};
 let requests=0,stepStarts=0,stepEnds=0,turnStarts=0,turnEnds=0,ownedEventCount=0,inputMessageBytes=0;
 const empty=()=>{equal(ctx.agents.list(),[]);equal(ctx.sessions.list(),[]);invariant(counts.tools===0);};
 async function loaderEntry(name,config,inject=[]) {
  clock();const id=await step('PUBLIC_SERVICES',()=>ctx.loader.create({name,config,...(inject.length?{inject}:{})}));
  const row={id,fiber:null,removed:false,product:name.endsWith('/src/installed-plugin.mjs')};entries.push(row);
  await step('PUBLIC_SERVICES',()=>ctx.loader.await());row.fiber=ctx.loader.resolve(id)?.fiber;invariant(row.fiber);await step('PUBLIC_SERVICES',()=>row.fiber.await());invariant(row.fiber.state===2&&row.fiber.uid!==null);return row;
 }
 async function remove(row,end) {
  phase='ENTRY_REMOVE';clock(end);invariant(!row.removed);row.removed=true;
  const fiber=row.fiber??ctx.loader.resolve(row.id)?.fiber;ctx.loader.remove(row.id);clock(end);
  invariant(fiber);await step('ENTRY_REMOVE',()=>fiber.await(),5000,end);await step('ENTRY_REMOVE',()=>ctx.loader.await(),5000,end);
  invariant(fiber.uid===null&&fiber.state===4&&!Array.from(ctx.loader.entries()).some(e=>e.id===row.id));if(row.product)entryRemoved=true;
 }
 const synthetic=label=>sha(Buffer.from(`df.ni6-positive01.synthetic/v1:${label}`));
 const cas=()=>({taskRef:currentTask.taskRef,expectedTaskVersion:currentTask.version,expectedAuthEpoch:currentTask.authEpoch});
 const update=value=>{
  if(value?.task) currentTask=publicTask(value.task,currentTask?.taskRef);
  else if(value&&Number.isSafeInteger(value.taskVersion)&&Number.isSafeInteger(value.authEpoch))currentTask={...currentTask,version:value.taskVersion,authEpoch:value.authEpoch};
  return value;
 };
 async function rpc(p,channel,name,payload){const v=await step(p,()=>http.call(channel,name,payload),2500);clock();return update(v);}
 try {
  preflight();
  const modules=await step('IMPORTS',()=>Promise.all([
   import('../dsh-web/node_modules/@deepseek-ai/cordis/lib/index.js'),import('../dsh-web/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js'),
   import('../dsh-web/node_modules/@deepseek-ai/dsh-session-projection/lib/index.js'),import('../dsh-web/node_modules/@deepseek-ai/dsh-session/lib/index.js'),
   import('../dsh-web/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js'),import('../dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/index.js'),
   import('../dsh-web/node_modules/@deepseek-ai/dsh-llm/lib/index.js'),import('../dsh-web/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js'),
   import('../dsh-web/node_modules/@deepseek-ai/dsh-tools/lib/index.js'),import('../dsh-web/node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js'),
   import('../dsh-web/node_modules/@deepseek-ai/dsh-launch-environment/lib/index.js'),import('../dsh-web/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js'),
   import('../dsh-web/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js')]),5000);
  const [{Context},{default:Loader},{default:Projections},{default:Sessions},{default:Approval},{default:Agents},{default:Llm},{default:SystemPrompt},{default:Tools},{LocalCredentialProvider},{createLaunchEnvironmentSnapshot},{default:WebServer}]=modules;
  phase='NAMESPACE';clock();const make=p=>{clock();mkdirSync(p,{mode:0o700});directory(p);clock();return p;};
  const run=make(resolve(CAPSULE,'private-runtime')),profileDir=make(resolve(run,'profile')),workspace=make(resolve(profileDir,'workspace')),storage=make(resolve(profileDir,'storage')),authHome=make(resolve(profileDir,'auth'));
  const databasePath=resolve(storage,'ledger.sqlite'),sessionDirectory=resolve(storage,'df-sessions-positive01'),preset='ni6-positive01-empty';
  const config={databasePath,limits:{queueCapacity:4,maxActive:1,maxAttempts:1,maxTasks:4,maxActionsPerTask:8,maxEventsPerTask:128,maxMetadataBytes:4096},memory:{enabled:true,byteLimit:16384,tokenLimit:16384},
   worker:{enabled:true,selection:{provider:'df-testing-local',model:'df-testing-worker-v1',agentPreset:preset,reasoningEffort:'deterministic',maxOutputTokens:128},environment:{root:workspace,cwd:workspace},persistence:{directory:sessionDirectory,compression:'none',retention:'owner-managed'},bounds:{requestBytes:16384,resultBytes:1024},policy:{maxRuntimeMs:60000,maxUsageUnits:65536,maxCostEstimateMicros:0},charges:{runtimeMs:15000,usageUnits:32768},previewTtlMs:60000,grantTtlMs:60000},audit:{enabled:false},automation:{enabled:false},results:{enabled:false}};
  phase='CONTEXT';clock();ctx=new Context().intercept('logger',{level:-1});ctx.baseUrl=pathToFileURL(resolve(PRODUCT,'package.json')).href;
  ctx.provide('profileContext',Object.freeze({dir:profileDir,name:'ni6-positive01'}));ctx.provide('launchEnvironment',createLaunchEnvironmentSnapshot([{source:'process',values:{DSH_HOME:authHome,XDG_CONFIG_HOME:authHome}}]));
  for(const[event,name]of[['agent/created','agentCreated'],['agent/disposed','agentDisposed'],['session/created','sessionCreated'],['session/disposed','sessionDisposed'],['session/event','sessionEvents']])ctx.on(event,()=>{counts[name]++;},{global:true});
  ctx.on('llm/stream',(options,next)=>{counts.streams++;invariant(counts.streams===1);inputMessageBytes=Buffer.byteLength(JSON.stringify(options.messages),'utf8');invariant(Number.isSafeInteger(inputMessageBytes)&&inputMessageBytes>0&&inputMessageBytes<=16384);return next();},{global:true});ctx.on('tools/execute',(_execution,next)=>{counts.tools++;return next();},{global:true});
  ctx.on('agent/request',(payload,next)=>{invariant(payload.agent===workerAgent&&++requests===1&&payload.turn===1&&payload.step===1);return next();},{global:true});
  ctx.on('session/event',(session,event)=>{if(!workerAgent||session!==workerAgent.session)return;invariant(++ownedEventCount<=128);const fields={'step/start':'stepStarts','step/end':'stepEnds','turn/start':'turnStarts','turn/end':'turnEnds'};
   if(Object.hasOwn(fields,event.type)){invariant(event.data.turn===1);if(event.type.startsWith('step/'))invariant(event.data.step===1);if(event.type==='step/start')stepStarts++;if(event.type==='step/end')stepEnds++;if(event.type==='turn/start')turnStarts++;if(event.type==='turn/end')turnEnds++;}},{global:true});
  const install=async(p,plugin,options)=>step(p,async()=>{const f=ctx.plugin(plugin,options);await f;invariant(f.state===2&&f.uid!==null);completedPlugins++;});
  await install('PLUGIN_LOADER',Loader,{baseUrl:ctx.baseUrl});await install('PLUGIN_PROJECTIONS',Projections);await install('PLUGIN_SESSIONS',Sessions);await install('PLUGIN_APPROVAL',Approval,{policy:'never'});await install('PLUGIN_AGENTS',Agents);await install('PLUGIN_LLM',Llm);await install('PLUGIN_SYSTEM_PROMPT',SystemPrompt,{});await install('PLUGIN_TOOLS',Tools,{mode:'native',maxParallelSubCalls:1});await install('PLUGIN_CREDENTIALS',LocalCredentialProvider,{path:resolve(authHome,'.credentials.yaml'),dshHome:authHome,watch:false,debounceMs:100});await install('PLUGIN_WEB_SERVER',WebServer,{host:'127.0.0.1',port:0,compression:'none'});
  await step('PLUGIN_CONNECTION',async()=>{await loaderEntry(pathToFileURL(resolve(HOST,'node_modules/@deepseek-ai/dsh-client-connection/lib/index.js')).href,{trustedHosts:[],cookieMaxAgeDays:1,maxRequestBodyBytes:65536,recovery:{}},['webServer']);completedPlugins++;});
  phase='LISTENER_FENCE';clock();invariant(ctx.webServer.host==='127.0.0.1'&&ctx.webServer.port>0&&ctx.webServer.port!==3080);
  phase='INDEX_ROUTE';ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/',handler(req,res){if(ctx.connection.authorizeIndex(req,res)){res.writeHead(200,{'cache-control':'no-store'});res.end();}}}),'ni6.positive01.index-auth');empty();equal(counts,ZERO);
  const host=name=>pathToFileURL(resolve(HOST,`node_modules/@deepseek-ai/${name}/lib/index.js`)).href;
  await loaderEntry(host('dsh-session-persistence-jsonl'),{root:sessionDirectory,compression:'none'});
  await loaderEntry(host('dsh-agent-loop'),{agents:[],maxParallelToolCalls:1},['sessionPersistence']);
  await loaderEntry(host('dsh-agent-preset-registry'),{default:preset});
  presetDisposer=await step('PRESET',()=>ctx.agentPresets.register({id:preset,plugins:[]}));invariant(typeof presetDisposer==='function');
  await loaderEntry('dsh-fishball/testing-provider',{});
  await step('ENTRY_START',()=>loaderEntry(pathToFileURL(resolve(PRODUCT,'src/installed-plugin.mjs')).href,config));empty();invariant(counts.streams===0);
  http=transport(ctx.connection,ctx.webServer.port);await step('AUTH',()=>http.authenticate(),2500);
  const setup=await rpc('SETUP_STATUS','/df-setup','status',{});invariant(setup.phase==='setup_required'&&setup.executionEnabled===false&&setup.storage.location===databasePath&&!existsSync(databasePath));
  const sp=await rpc('SETUP_PREPARE','/df-setup','prepare',{});ref(sp.previewRef);ref(sp.planDigest);invariant(sp.expiresAt>Date.now()&&!existsSync(databasePath));
  const sc=await rpc('SETUP_CONFIRM','/df-setup','confirm',{previewRef:sp.previewRef,planDigest:sp.planDigest,accept:true});invariant(sc.phase==='ready');
  invariant((await rpc('SETUP_READY','/df-setup','status',{})).phase==='ready');equal(await rpc('LIST','/df-rpc','list',{}),[]);
  const intake=await rpc('INTAKE','/df-rpc','intake',{taskId:'ni6-positive01-task',provider:'synthetic-local',source:'ni6-positive01',eventId:'ni6-positive01-event-1',commandRef:synthetic('intake'),goal:GOAL});invariant(intake.deduplicated===false);currentTask=publicTask(intake.task);addressed={taskRef:currentTask.taskRef};facts.taskCreated=true;
  const baseline=await rpc('STATUS','/df-rpc','status',addressed);invariant(baseline.task.status==='queued'&&baseline.workers.length===0&&baseline.executions.length===0&&baseline.artifacts.length===0);
  const prepared=await rpc('CONTEXT_PREPARE','/df-rpc','prepareContext',{...cas(),commandRef:synthetic('prepare'),terms:[],now:Date.now()});ref(prepared.recordRef);ref(prepared.digest);invariant(prepared.memory.revision===0);
  const detail=await rpc('CONTEXT_DETAIL','/df-rpc','detail',{...cas(),recordRef:prepared.recordRef});invariant(detail.data.kind==='context'&&typeof detail.data.content==='string'&&sha(Buffer.from(detail.data.content))===prepared.digest&&Buffer.byteLength(detail.data.content)<=16384);
  const expected=`Synthetic local result; approved input SHA-256: ${sha(Buffer.from(detail.data.content))}.`;
  const catalogue=await rpc('CATALOG','/df-rpc','workerCatalog',{});invariant(catalogue.status.phase==='needs_policy');
  const pp=await rpc('POLICY_PREVIEW','/df-rpc','workerPolicyPreview',{expectedPolicyVersion:baseline.policy.version});ref(pp.previewRef);ref(pp.planDigest);
  invariant(pp.description.selection.provider==='df-testing-local'&&pp.description.selection.model==='df-testing-worker-v1'&&pp.description.effectiveReasoningEffort==='deterministic');
  const pc=await rpc('POLICY_CONFIRM','/df-rpc','workerPolicyConfirm',{previewRef:pp.previewRef,planDigest:pp.planDigest,commandRef:synthetic('policy'),expectedPolicyVersion:pp.expectedPolicyVersion,accept:true});invariant(pc.status.phase==='ready');
  const action=await rpc('WORKER_PLAN','/df-rpc','workerPlan',{...cas(),contextRecordRef:prepared.recordRef,commandRef:synthetic('plan')});ref(action.actionRef);ref(action.actionDigest);
  const binding=()=>({...cas(),actionRef:action.actionRef,actionDigest:action.actionDigest});
  const preview=await rpc('WORKER_PREVIEW','/df-rpc','workerPreview',{...binding(),recordRef:prepared.recordRef});ref(preview.previewRef);
  await rpc('WORKER_GRANT','/df-rpc','workerGrant',{...binding(),previewRef:preview.previewRef,commandRef:synthetic('grant'),expiresAt:Date.now()+55000,accept:true});
  const created=await rpc('WORKER_CREATE','/df-rpc','workerCreate',{...binding(),commandRef:synthetic('create')});const worker=created.worker;
  invariant(worker&&CREATE_PHASES.includes(worker.phase)&&worker.phase!=='NOT_RETURNED');createPhase=worker.phase;invariant(createPhase==='ready');
  for(const k of ['claimRef','generationRef','sessionRef','reservationRef'])ref(worker[k]);invariant(worker.taskRef===currentTask.taskRef&&worker.actionRef===action.actionRef&&worker.actionDigest===action.actionDigest);
  const ids=ctx.agents.list();invariant(ids.length===1);workerAgent=ids[0];invariant(workerAgent&&ctx.agents.get(workerAgent.id)===workerAgent&&sha(Buffer.from(workerAgent.id))===worker.sessionRef&&ctx.sessions.get(workerAgent.id)===workerAgent.session&&counts.agentCreated===1&&counts.sessionCreated===1&&counts.streams===0);facts.workerCreated=true;
  const query={taskRef:currentTask.taskRef,actionRef:action.actionRef,claimRef:worker.claimRef,generationRef:worker.generationRef};
  const idle=await rpc('WORKER_IDLE','/df-rpc','workerQuery',query);invariant(idle.worker.phase==='ready'&&counts.streams===0);
  const executed=await rpc('WORKER_EXECUTE','/df-rpc','workerExecute',{...binding(),claimRef:worker.claimRef,generationRef:worker.generationRef,contextRecordRef:prepared.recordRef,commandRef:synthetic('execute')});const execution=executed.execution;ref(execution.executionRef);ref(execution.resultDigest);
  invariant(execution.state==='committed'&&execution.usage.state==='actual'&&execution.usage.accounting==='df-testing-utf8-byte-units/v1'&&uint(execution.usage.units)<=32768&&execution.usage.units===inputMessageBytes+Buffer.byteLength(expected,'utf8')&&execution.resultDigest===sha(Buffer.from(expected))&&counts.streams===1&&requests===1&&counts.tools===0&&stepStarts===1&&stepEnds===1&&turnStarts===1&&turnEnds===1);facts.executionCommitted=true;
  await rpc('WORKER_QUERY','/df-rpc','workerQuery',query);
  const finish=()=>({...cas(),actionRef:action.actionRef,claimRef:worker.claimRef,generationRef:worker.generationRef,executionRef:execution.executionRef});
  const captured=await rpc('WORKER_CAPTURE','/df-rpc','workerCapture',{...finish(),commandRef:synthetic('capture')});ref(captured.artifactRef);invariant(captured.version===1);
  const returned=await rpc('WORKER_RESULT','/df-rpc','workerResult',{...cas(),artifactRef:captured.artifactRef,version:1});
  invariant(returned.content===expected&&returned.verification==='not-reviewed'&&returned.delivery==='not-requested');
  for(const k of ['taskRef','actionRef','claimRef','generationRef','sessionRef'])invariant(returned.source[k]===(k==='taskRef'?currentTask.taskRef:k==='actionRef'?action.actionRef:worker[k]));
  invariant(returned.source.executionRef===execution.executionRef&&returned.source.actionDigest===action.actionDigest&&returned.source.resultDigest===execution.resultDigest&&returned.source.inputDigest===prepared.digest);facts.resultReturned=true;
  const finished=await rpc('WORKER_FINISH','/df-rpc','workerFinish',{...finish(),commandRef:synthetic('finish')});invariant(typeof finished.reservationHeld==='boolean');facts.reservationReleased=finished.reservationHeld===false;
  const final=await rpc('FINAL_STATUS','/df-rpc','status',addressed);invariant(final.workers.length===1&&final.workers[0].phase==='stopped'&&final.executions.length===1&&final.artifacts.length===1);empty();invariant(counts.agentDisposed===1&&counts.sessionDisposed===1);facts.workerStopped=true;
  invariant(facts.reservationReleased&&counts.streams===1&&counts.tools===0);
  await step('PRESET_RELEASE',async()=>{presetReleased=true;await presetDisposer();});
  for(const row of [...entries].reverse())if(!row.removed)await remove(row,WORK_END);
  facts.ownedEntriesRemoved=true;await step('POST_DISPOSAL',()=>http.removed(addressed),2500);invariant(http.total()===25);empty();positivePath=true;
 } catch {failure('REJECTION');}
 finally {
  if(ctx){const end=Math.min(performance.now()+5000,FINAL_END-500);
   if(presetDisposer&&!presetReleased)try{await step('PRESET_RELEASE',async()=>{presetReleased=true;await presetDisposer();},5000,end);}catch{failure('REJECTION');}
   for(const row of [...entries].reverse())if(!row.removed)try{await remove(row,end);}catch{failure('REJECTION');}
   try{await step('ROOT_CLEANUP',()=>ctx.fiber.dispose(),5000,end);rootClosed=ctx.fiber.uid===null&&ctx.fiber.state===4;invariant(rootClosed);}catch{failure('REJECTION');}
  }http?.close();
 }
 if(!admitted){process.exitCode=1;return;}
 const result={contractVersion:'df.ni6-positive-one-worker/v1',result:firstFailure?'FAILED_HOLD':'PASS',phase:firstFailure?.phase??'COMPLETE',category:firstFailure?.category??'NONE',refusalCode,createPhase,positivePath,...facts,entryRemoved,rootClosed,completedPlugins,httpRequests:http?.total()??0,requests,streams:counts.streams,tools:counts.tools,stepStarts,stepEnds,turnStarts,turnEnds,all87:'HOLD',CODE:'BLOCKED_UNCHANGED'};
 keys(result,RESULT_FIELDS);invariant(Object.values(result).every(v=>['string','boolean','number'].includes(typeof v)));clock(FINAL_END);directory(CAPSULE);
 const output=Buffer.from(JSON.stringify(result)+'\n');invariant(output.length<=1024);
 const fd=openSync(RESULT,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{fchmodSync(fd,0o600);const created=fstatSync(fd);invariant(created.isFile()&&created.uid===process.getuid()&&(created.mode&0o777)===0o600);writeFileSync(fd,output);fsyncSync(fd);const final=regular(RESULT,0o600);invariant(final.ino===created.ino&&final.dev===created.dev);clock(FINAL_END);}finally{closeSync(fd);}
 process.exitCode=result.result==='PASS'?0:1;
}
main().catch(()=>{process.exitCode=1;});
