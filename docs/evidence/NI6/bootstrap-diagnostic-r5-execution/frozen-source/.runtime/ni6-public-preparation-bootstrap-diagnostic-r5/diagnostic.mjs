// Separate source-only proposal. Original host/public calls; no HTTP client.
import { readFileSync, realpathSync, lstatSync, readlinkSync, existsSync, readdirSync,
  mkdirSync, openSync, closeSync, writeFileSync, fchmodSync, fstatSync, fsyncSync, constants } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const STARTED = performance.now();
const WORK_END = STARTED + 24000, FINAL_END = STARTED + 30000;
const ROOT = '/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball';
const NAME = '.runtime/ni6-public-preparation-bootstrap-diagnostic-r5';
const CAPSULE = resolve(ROOT, NAME), HOST = resolve(ROOT, '.runtime/dsh-web');
const PRODUCT = resolve(ROOT, '.runtime/ni6-public-preparation-bootstrap-diagnostic-r4/package');
const PLAN_NAME = '.runtime/root-ni6-bootstrap-diagnostic-r5-execution-plan.json';
const RESULT = resolve(CAPSULE, 'diagnostic-result.json');
const GRAPH_NAME = '.runtime/ni3-native-runtime/public-graph-pins.json';
const NODE = '/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node';
const PYTHON = '/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14';
const HOST_KEYS = Object.freeze([
  "harnessVersion", "harnessSource", "cordisVersion", "cordisSource",
  "sessionsVersion", "sessionsSource", "approvalVersion", "approvalSource",
  "webVersion", "webSource", "webServerVersion", "webServerSource",
  "nativeContext", "sessionsProvenance", "approvalProvenance", "context.provide",
  "context.effect", "context.on", "sessions.create", "sessions.get",
  "sessions.list", "approval.request", "approval.effectivePolicy", "runtimeVersion",
  "runtimeLock", "sqlite",
]);
const ENTRY_STAGES = Object.freeze(["NOT_REACHED","VALIDATION","NORMAL_SELECTION","HOST_CHECK","MEMORY_PREPARATION","LIVE_FIBER","CONNECTION_IDENTITY","PEER_PROFILE","SETUP_STATE","STATUS_REGISTRATION","EFFECT_REGISTRATION","RPC_REGISTRATION","RPC_RESULT_CHECK","PROVIDE","RESUME","COMPLETE"]);
const PHASES = Object.freeze([
  "PREFLIGHT", "IMPORTS", "NAMESPACE", "CONTEXT",
  "PLUGIN_LOADER", "PLUGIN_PROJECTIONS", "PLUGIN_SESSIONS", "PLUGIN_APPROVAL",
  "PLUGIN_AGENTS", "PLUGIN_LLM", "PLUGIN_SYSTEM_PROMPT", "PLUGIN_TOOLS",
  "PLUGIN_CREDENTIALS", "PLUGIN_WEB_SERVER", "PLUGIN_CONNECTION", "LISTENER_FENCE",
  "INDEX_ROUTE", "BEFORE_ENTRY", "CONFIG_GATE", "NORMAL_SELECTION_GATE",
  "HOST_GATE", "HOST_GATE_HARNESSVERSION", "HOST_GATE_HARNESSSOURCE", "HOST_GATE_CORDISVERSION",
  "HOST_GATE_CORDISSOURCE", "HOST_GATE_SESSIONSVERSION", "HOST_GATE_SESSIONSSOURCE", "HOST_GATE_APPROVALVERSION",
  "HOST_GATE_APPROVALSOURCE", "HOST_GATE_WEBVERSION", "HOST_GATE_WEBSOURCE", "HOST_GATE_WEBSERVERVERSION",
  "HOST_GATE_WEBSERVERSOURCE", "HOST_GATE_NATIVECONTEXT", "HOST_GATE_SESSIONSPROVENANCE", "HOST_GATE_APPROVALPROVENANCE",
  "HOST_GATE_CONTEXT_PROVIDE", "HOST_GATE_CONTEXT_EFFECT", "HOST_GATE_CONTEXT_ON", "HOST_GATE_SESSIONS_CREATE",
  "HOST_GATE_SESSIONS_GET", "HOST_GATE_SESSIONS_LIST", "HOST_GATE_APPROVAL_REQUEST", "HOST_GATE_APPROVAL_EFFECTIVEPOLICY",
  "HOST_GATE_RUNTIMEVERSION", "HOST_GATE_RUNTIMELOCK", "HOST_GATE_SQLITE", "MEMORY_GATE",
  "CONNECTION_GATE", "PEER_PROFILE_GATE", "LOADER_CREATE", "LOADER_SETTLE",
  "ENTRY_RESOLVE", "ENTRY_START", "ENTRY_APPLY_NOT_REACHED", "ENTRY_APPLY_VALIDATION",
  "ENTRY_APPLY_NORMAL_SELECTION", "ENTRY_APPLY_HOST_CHECK", "ENTRY_APPLY_MEMORY_PREPARATION", "ENTRY_APPLY_LIVE_FIBER",
  "ENTRY_APPLY_CONNECTION_IDENTITY", "ENTRY_APPLY_PEER_PROFILE", "ENTRY_APPLY_SETUP_STATE", "ENTRY_APPLY_STATUS_REGISTRATION",
  "ENTRY_APPLY_EFFECT_REGISTRATION", "ENTRY_APPLY_RPC_REGISTRATION", "ENTRY_APPLY_RPC_RESULT_CHECK", "ENTRY_APPLY_PROVIDE",
  "ENTRY_APPLY_RESUME", "ENTRY_APPLY_COMPLETE", "ENTRY_STATE", "AFTER_ENTRY",
  "ENTRY_REMOVE", "ENTRY_DISPOSAL", "LOADER_REMOVAL_SETTLE", "AFTER_REMOVAL",
  "ROOT_CLEANUP", "COMPLETE",
]);
const CATEGORIES = Object.freeze(['NONE','REJECTION','INVARIANT','DEADLINE']);
const ZERO = Object.freeze({agentCreated:0,agentDisposed:0,sessionCreated:0,sessionDisposed:0,sessionEvents:0,streams:0,tools:0});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let phase = 'PREFLIGHT', firstFailure, admitted = false, completedPlugins = 0;
let entryRemoved = false, rootClosed = false, zeroNative = false;
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
  invariant(realpathSync(ROOT) === ROOT && fileURLToPath(import.meta.url) === resolve(CAPSULE,'diagnostic.mjs'));
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
  equal(manifest.phases,PHASES); equal(manifest.categories,CATEGORIES);
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

async function main() {
  let ctx, entry, entryId, removalAttempted = false, counts = {...ZERO}, observedReady = false;
  const noNative = () => {
    zeroNative = false;
    equal(counts,ZERO); equal(ctx.agents.list(),[]); equal(ctx.sessions.list(),[]);
    equal(ctx.tools.schemas(),[]); equal(ctx.llm.listProviders(),[]);
    invariant(!existsSync(resolve(CAPSULE,'private-runtime/profile/storage/df-sessions-prep01')));
    observedReady = true; zeroNative = true;
  };
  try {
    preflight();
    const modules = await step('IMPORTS',() => Promise.all([
      import('../dsh-web/node_modules/@deepseek-ai/cordis/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-session-projection/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-session/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-llm/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-tools/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-launch-environment/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js'),
      import('../dsh-web/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js'),
    ]),5000);
    const [{Context},{default:Loader},{default:Projections},{default:Sessions},{default:Approval},
      {default:Agents},{default:Llm},{default:SystemPrompt},{default:Tools},{LocalCredentialProvider},
      {createLaunchEnvironmentSnapshot},{default:WebServer},Connection] = modules;
    phase = 'NAMESPACE'; clock();
    const make = path => { clock(); mkdirSync(path,{mode:0o700}); directory(path); clock(); return path; };
    const run = make(resolve(CAPSULE,'private-runtime'));
    const profileDir = make(resolve(run,'profile')), workspace = make(resolve(profileDir,'workspace'));
    const storage = make(resolve(profileDir,'storage')), authHome = make(resolve(profileDir,'auth'));
    const profile = Object.freeze({dir:profileDir,name:'ni6-prep01'});
    const databasePath = resolve(storage,'ledger.sqlite'), sessionDirectory = resolve(storage,'df-sessions-prep01');
    const config = {
      databasePath, limits:{queueCapacity:4,maxActive:1,maxAttempts:1,maxTasks:4,maxActionsPerTask:8,maxEventsPerTask:128,maxMetadataBytes:4096},
      memory:{enabled:true,byteLimit:16384,tokenLimit:16384},
      worker:{enabled:true,selection:{provider:'df-testing-local',model:'df-testing-worker-v1',agentPreset:'ni6-prep01-empty',reasoningEffort:'deterministic',maxOutputTokens:128},
        environment:{root:workspace,cwd:workspace},persistence:{directory:sessionDirectory,compression:'none',retention:'owner-managed'},
        bounds:{requestBytes:16384,resultBytes:1024},policy:{maxRuntimeMs:60000,maxUsageUnits:65536,maxCostEstimateMicros:0},
        charges:{runtimeMs:15000,usageUnits:32768},previewTtlMs:60000,grantTtlMs:60000},
      audit:{enabled:false},automation:{enabled:false},results:{enabled:false},
    };
    phase = 'CONTEXT'; clock();
    ctx = new Context().intercept('logger',{level:-1});
    ctx.baseUrl = pathToFileURL(resolve(PRODUCT,'package.json')).href;
    ctx.provide('profileContext',profile);
    ctx.provide('launchEnvironment',createLaunchEnvironmentSnapshot([
      {source:'process',values:{DSH_HOME:authHome,XDG_CONFIG_HOME:authHome}},
    ]));
    for (const [event,name] of [['agent/created','agentCreated'],['agent/disposed','agentDisposed'],['session/created','sessionCreated'],['session/disposed','sessionDisposed'],['session/event','sessionEvents']]) {
      ctx.on(event,() => { counts[name]++; },{global:true});
    }
    ctx.on('llm/stream',(_options,next) => { counts.streams++; return next(); },{global:true});
    ctx.on('tools/execute',(_execution,next) => { counts.tools++; return next(); },{global:true});
    const install = async (name,plugin,options) => step(name,async () => {
      const fiber = ctx.plugin(plugin,options); await fiber;
      invariant(fiber.state === 2 && fiber.uid !== null); completedPlugins++;
    });
    await install('PLUGIN_LOADER',Loader,{baseUrl:ctx.baseUrl});
    await install('PLUGIN_PROJECTIONS',Projections); await install('PLUGIN_SESSIONS',Sessions);
    await install('PLUGIN_APPROVAL',Approval,{policy:'never'}); await install('PLUGIN_AGENTS',Agents);
    await install('PLUGIN_LLM',Llm); await install('PLUGIN_SYSTEM_PROMPT',SystemPrompt,{});
    await install('PLUGIN_TOOLS',Tools,{mode:'native',maxParallelSubCalls:1});
    await install('PLUGIN_CREDENTIALS',LocalCredentialProvider,{path:resolve(authHome,'.credentials.yaml'),dshHome:authHome,watch:false,debounceMs:100});
    await install('PLUGIN_WEB_SERVER',WebServer,{host:'127.0.0.1',port:0,compression:'none'});
    await step('PLUGIN_CONNECTION',async () => {
      const connectionId = await ctx.loader.create({
        name:pathToFileURL(resolve(HOST,'node_modules/@deepseek-ai/dsh-client-connection/lib/index.js')).href,
        inject:['webServer'],
        config:{trustedHosts:[],cookieMaxAgeDays:1,maxRequestBodyBytes:65536,recovery:{}},
      });
      await ctx.loader.await();
      const connectionEntry = ctx.loader.resolve(connectionId);
      invariant(connectionEntry && connectionEntry.fiber);
      const fiber = connectionEntry.fiber; await fiber.await();
      invariant(fiber.state === 2 && fiber.uid !== null); completedPlugins++;
    });
    phase = 'LISTENER_FENCE'; clock();
    invariant(ctx.webServer.host === '127.0.0.1' && Number.isSafeInteger(ctx.webServer.port)
      && ctx.webServer.port > 0 && ctx.webServer.port <= 65535 && ctx.webServer.port !== 3080);
    phase = 'INDEX_ROUTE'; clock();
    ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/',handler(req,res) {
      if (ctx.connection.authorizeIndex(req,res)) { res.writeHead(200,{'cache-control':'no-store'}); res.end(); }
    }}),'ni6.prep01.original-index-auth'); // Registered original route; never dispatched.
    phase = 'BEFORE_ENTRY'; clock(); noNative(); clock();
    // Original public startup gates; only fixed phase/boolean outcomes escape.
    const validated = await step('CONFIG_GATE',async () => {
      const {validateInstalledConfig} = await import('../ni6-public-preparation-r3/package/src/installed-config.mjs');
      return validateInstalledConfig(config);
    });
    await step('NORMAL_SELECTION_GATE',async () => {
      const {splitNormalWorkerSelection} = await import('../ni6-public-preparation-r3/package/src/normal-native-selection.mjs');
      splitNormalWorkerSelection(validated.worker,validated.memory.enabled);
    });
    await step('HOST_GATE',async () => {
      const {probeHost} = await import('../ni6-public-preparation-r3/package/src/host-probe.mjs');
      const report = probeHost(ctx);
      for (const key of HOST_KEYS) {
        if (report.checks[key] !== true) {
          phase = 'HOST_GATE_' + key.toUpperCase().replaceAll('.', '_');
          invariant(false);
        }
      }
      invariant(report.supported === true);
    });
    await step('MEMORY_GATE',async () => {
      const {prepareInstalledMemory} = await import('../ni6-public-preparation-r3/package/src/installed-memory.mjs');
      await prepareInstalledMemory(validated.memory); // Discard binder; never invoke it.
    });
    await step('CONNECTION_GATE',() => invariant(ctx.connection instanceof Connection.HostConnectionService));
    await step('PEER_PROFILE_GATE',() => invariant(!!ctx.connection.operator && !!ctx.profileContext));
    let entryModule;
    entryId = await step('LOADER_CREATE',async () => {
      entryModule = await import(pathToFileURL(resolve(PRODUCT,'src/installed-plugin.mjs')).href);
      return ctx.loader.create({name:pathToFileURL(resolve(PRODUCT,'src/installed-plugin.mjs')).href,config});
    });
    await step('LOADER_SETTLE',() => ctx.loader.await());
    phase = 'ENTRY_RESOLVE'; clock(); entry = ctx.loader.resolve(entryId); invariant(entry && entry.fiber); clock();
    await step('ENTRY_START',() => entry.fiber.await().finally(() => {
      // Snapshot only this exact module's finite own scalar at raw settlement.
      const observedStage = entryModule.ni6StartupStage;
      invariant(ENTRY_STAGES.includes(observedStage));
      phase = 'ENTRY_APPLY_' + observedStage;
    })); // finally preserves the original rejection; no error parameter/read.
    phase = 'ENTRY_STATE'; clock(); invariant(entry.fiber.state === 2 && entry.fiber.uid !== null);
    phase = 'AFTER_ENTRY'; clock(); noNative(); clock();
    const fiber = entry.fiber;
    phase = 'ENTRY_REMOVE'; clock(); removalAttempted = true; ctx.loader.remove(entryId); clock(); // Once only.
    await step('ENTRY_DISPOSAL',() => fiber.await());
    await step('LOADER_REMOVAL_SETTLE',() => ctx.loader.await());
    invariant(!Array.from(ctx.loader.entries()).some(item => item.id === entryId)
      && fiber.uid === null && fiber.state === 4); entryRemoved = true;
    phase = 'AFTER_REMOVAL'; clock(); noNative(); clock();
    invariant(!existsSync(databasePath) && !existsSync(databasePath + '.df-setup') && !existsSync(sessionDirectory));
  } catch { failure('REJECTION'); }
  finally {
    // Save first work failure before cleanup. Root observers can unload during
    // this restart; no fresh post-root registries or continuous event proof.
    if (ctx) {
      const cleanupEnd = Math.min(performance.now() + 5000,FINAL_END - 500);
      if (entryId !== undefined && !removalAttempted) {
        try {
          const pendingFiber = entry?.fiber;
          phase = 'ENTRY_REMOVE'; clock(cleanupEnd); removalAttempted = true;
          ctx.loader.remove(entryId); clock(cleanupEnd);
          if (pendingFiber) await step('ENTRY_DISPOSAL',() => pendingFiber.await(),5000,cleanupEnd);
          await step('LOADER_REMOVAL_SETTLE',() => ctx.loader.await(),5000,cleanupEnd);
          entryRemoved = !!pendingFiber && !Array.from(ctx.loader.entries()).some(item => item.id === entryId)
            && pendingFiber.uid === null && pendingFiber.state === 4;
          if (completedPlugins === 11 && entryRemoved) {
            phase = 'AFTER_REMOVAL'; clock(cleanupEnd); noNative(); clock(cleanupEnd);
          }
        } catch { failure('REJECTION'); }
      }
      try {
        await step('ROOT_CLEANUP',() => ctx.fiber.dispose(),5000,cleanupEnd);
        rootClosed = ctx.fiber.uid === null && ctx.fiber.state === 4;
        invariant(rootClosed); // Original terminal assertion retained; restart is not closure.
      } catch { failure('REJECTION'); }
    }
    // Only already covered ready/removal boundaries and retained natural history.
    zeroNative = observedReady && zeroNative && Object.keys(ZERO).every(name => counts[name] === 0);
  }
  if (!admitted) { process.exitCode = 1; return; }
  const result = {contractVersion:'df.ni6-prep01-bootstrap-diagnostic/v1',result:firstFailure ? 'FAILED_HOLD' : 'PASS',
    phase:firstFailure?.phase ?? 'COMPLETE',category:firstFailure?.category ?? 'NONE',completedPlugins,
    entryRemoved,rootClosed,zeroNative,all87:'HOLD',CODE:'BLOCKED_UNCHANGED'};
  if (!firstFailure && !(completedPlugins === 11 && entryRemoved && rootClosed && zeroNative)) {
    phase = 'ROOT_CLEANUP'; failure('INVARIANT'); result.result = 'FAILED_HOLD'; result.phase = firstFailure.phase; result.category = firstFailure.category;
  }
  clock(FINAL_END); directory(CAPSULE);
  invariant(PHASES.includes(result.phase) && CATEGORIES.includes(result.category));
  const output = Buffer.from(JSON.stringify(result) + '\n'); invariant(output.length <= 512);
  const fd = openSync(RESULT,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
  try {
    fchmodSync(fd,0o600); const created = fstatSync(fd);
    invariant(created.isFile() && created.uid === process.getuid() && (created.mode & 0o777) === 0o600);
    writeFileSync(fd,output); fsyncSync(fd);
    const final = regular(RESULT,0o600); invariant(final.ino === created.ino && final.dev === created.dev);
    clock(FINAL_END);
  } finally { closeSync(fd); }
  process.exitCode = result.result === 'PASS' ? 0 : 1;
}
main().catch(() => { process.exitCode = 1; }); // Never print caught error/object/stack.
