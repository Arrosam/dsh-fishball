// Test composition of the original public classes; no alternate native runtime.
import { mkdirSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '../dsh-web/node_modules/@deepseek-ai/cordis/lib/index.js';
import Loader from '../dsh-web/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js';
import Projections from '../dsh-web/node_modules/@deepseek-ai/dsh-session-projection/lib/index.js';
import Sessions from '../dsh-web/node_modules/@deepseek-ai/dsh-session/lib/index.js';
import Approval from '../dsh-web/node_modules/@deepseek-ai/dsh-user-approval/lib/index.js';
import Agents from '../dsh-web/node_modules/@deepseek-ai/dsh-agent/lib/index.js';
import Llm from '../dsh-web/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
import SystemPrompt from '../dsh-web/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js';
import Tools from '../dsh-web/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
import { LocalCredentialProvider } from '../dsh-web/node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js';
import { createLaunchEnvironmentSnapshot } from '../dsh-web/node_modules/@deepseek-ai/dsh-launch-environment/lib/index.js';
import WebServer from '../dsh-web/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js';
import * as Connection from '../dsh-web/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js';
import { check, same } from './public-oracles.mjs';
import { createPublicTransport } from './http-rpc.mjs';

const ZERO = Object.freeze({agentCreated:0,agentDisposed:0,sessionCreated:0,sessionDisposed:0,sessionEvents:0,streams:0,tools:0});
export async function createOriginalPreparationFixture({capsule, product, bounded, cleanupBounded}) {
  const run = resolve(capsule, 'private-runtime');
  check(!existsSync(run), 'PREP01_NAMESPACE_ALREADY_USED');
  const make = path => {
    mkdirSync(path, {mode:0o700}); const s = lstatSync(path);
    check(s.isDirectory() && !s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 0o777) === 0o700 && realpathSync(path) === path, 'PREP01_SYNTHETIC_DIRECTORY');
    return path;
  };
  make(run);
  const profileDir = make(resolve(run, 'profile'));
  const workspace = make(resolve(profileDir, 'workspace'));
  const storage = make(resolve(profileDir, 'storage'));
  const authHome = make(resolve(profileDir, 'auth'));
  const profile = Object.freeze({dir:profileDir,name:'ni6-prep01'});
  const databasePath = resolve(storage, 'ledger.sqlite');
  const sessionDirectory = resolve(storage, 'df-sessions-prep01');
  const config = {
    databasePath, limits:{queueCapacity:4,maxActive:1,maxAttempts:1,maxTasks:4,maxActionsPerTask:8,maxEventsPerTask:128,maxMetadataBytes:4096},
    memory:{enabled:true,byteLimit:16384,tokenLimit:16384},
    worker:{enabled:true,selection:{provider:'df-testing-local',model:'df-testing-worker-v1',agentPreset:'ni6-prep01-empty',reasoningEffort:'deterministic',maxOutputTokens:128},
      environment:{root:workspace,cwd:workspace},persistence:{directory:sessionDirectory,compression:'none',retention:'owner-managed'},
      bounds:{requestBytes:16384,resultBytes:1024},policy:{maxRuntimeMs:60000,maxUsageUnits:65536,maxCostEstimateMicros:0},
      charges:{runtimeMs:15000,usageUnits:32768},previewTtlMs:60000,grantTtlMs:60000},
    audit:{enabled:false},automation:{enabled:false},results:{enabled:false},
  };
  const ctx = new Context().intercept('logger', {level:-1}); // Supported original scoped logger config; no console exporter.
  ctx.baseUrl = pathToFileURL(resolve(product, 'package.json')).href;
  ctx.provide('profileContext', profile); // Trusted fresh host metadata, not an owner capability.
  ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([
    {source:'process',values:{DSH_HOME:authHome,XDG_CONFIG_HOME:authHome}},
  ])); // Original launch snapshot; no inherited credentials or dotenv layers.
  const counts = {...ZERO}; let live = true, transport, entry, disposed = false, entryDisposed = false, inspections = 0, diagnosticReads = 0;
  for (const [event, name] of [['agent/created','agentCreated'],['agent/disposed','agentDisposed'],['session/created','sessionCreated'],['session/disposed','sessionDisposed'],['session/event','sessionEvents']]) {
    ctx.on(event, () => { counts[name]++; }, {global:true});
  }
  ctx.on('llm/stream', (_options, next) => { counts.streams++; return next(); }, {global:true});
  ctx.on('tools/execute', (_execution, next) => { counts.tools++; return next(); }, {global:true});
  const noNative = () => {
    inspections++;
    check(live, 'PREP01_OBSERVER_CLOSED'); same(counts, ZERO, 'PREP01_NATIVE_EVENT');
    same(ctx.agents.list(), [], 'PREP01_AGENT_REGISTRY'); same(ctx.sessions.list(), [], 'PREP01_SESSION_REGISTRY');
    same(ctx.tools.schemas(), [], 'PREP01_TOOL_INVENTORY');
    same(ctx.llm.listProviders(), [], 'PREP01_PROVIDER_INVENTORY');
    check(!existsSync(sessionDirectory), 'PREP01_NATIVE_STORAGE_EFFECT');
  };
  const install = async (plugin, options) => {
    const fiber = ctx.plugin(plugin, options); await bounded(fiber, 'PREP01_ORIGINAL_PLUGIN_START');
    check(fiber.state === 2 && fiber.uid !== null, 'PREP01_ORIGINAL_PLUGIN_ACTIVE'); return fiber;
  };
  try {
    await install(Loader, {baseUrl:ctx.baseUrl});
    await install(Projections); await install(Sessions); await install(Approval, {policy:'never'});
    await install(Agents); await install(Llm); await install(SystemPrompt, {});
    await install(Tools, {mode:'native',maxParallelSubCalls:1});
    await install(LocalCredentialProvider, {path:resolve(authHome,'.credentials.yaml'),dshHome:authHome,watch:false,debounceMs:100});
    await install(WebServer, {host:'127.0.0.1',port:0,compression:'none'});
    await install(Connection, {trustedHosts:[],cookieMaxAgeDays:1,maxRequestBodyBytes:65536,recovery:{}});
    check(ctx.webServer.host === '127.0.0.1' && ctx.webServer.port !== 3080, 'PREP01_ORIGINAL_LISTENER');
    ctx.effect(() => ctx.webServer.register({kind:'exact',path:'/',handler(req,res) {
      if (ctx.connection.authorizeIndex(req,res)) { res.writeHead(200, {'cache-control':'no-store'}); res.end(); }
    }}), 'ni6.prep01.original-index-auth');
    noNative();
    const entryId = await bounded(ctx.loader.create({name:pathToFileURL(resolve(product,'src/installed-plugin.mjs')).href,config}), 'PREP01_ORIGINAL_LOADER_CREATE');
    await bounded(ctx.loader.await(), 'PREP01_ORIGINAL_LOADER_SETTLED');
    entry = ctx.loader.resolve(entryId); await bounded(entry.fiber, 'PREP01_INSTALLED_ENTRY_START');
    check(entry.fiber.state === 2 && entry.fiber.uid !== null, 'PREP01_INSTALLED_ENTRY_ACTIVE');
    noNative();
    transport = createPublicTransport(ctx.connection, ctx.webServer.port);
    return Object.freeze({profile, databasePath, transport, noNative,
      diagnostics() {
        check(live && !entryDisposed && ++diagnosticReads === 1, 'PREP01_DIAGNOSTICS_COUNT');
        return ctx.df.diagnostics(); // The documented public metadata-only facade.
      },
      async disposeEntry() {
        check(!disposed && !entryDisposed && entry?.fiber, 'PREP01_DISPOSAL_ORDER');
        entryDisposed = true;
        const fiber = entry.fiber; await bounded(fiber.dispose(), 'PREP01_INSTALLED_ENTRY_DISPOSE');
        await bounded(ctx.loader.await(), 'PREP01_LOADER_AFTER_DISPOSAL');
        check(fiber.uid === null && fiber.state === 4, 'PREP01_INSTALLED_ENTRY_CLOSED'); noNative();
      },
      async close() {
        if (disposed) return;
        let failure;
        try { noNative(); } catch (error) { failure = error; }
        try { await cleanupBounded(ctx.fiber.dispose(), 'PREP01_ORIGINAL_ROOT_DISPOSE', 5000);
          check(ctx.fiber.uid === null && ctx.fiber.state === 4, 'PREP01_ORIGINAL_ROOT_CLOSED');
          same(counts, ZERO, 'PREP01_DISPOSAL_NATIVE_EVENT');
        } catch (error) { failure ??= error;
        } finally { disposed = true; live = false; transport.close(); }
        if (failure) throw failure;
      },
      historicalCounts() { check(disposed, 'PREP01_HISTORY_BEFORE_CLOSE'); return Object.freeze({...counts}); },
      historicalInspectionCount() { check(disposed, 'PREP01_HISTORY_BEFORE_CLOSE'); return inspections; },
    });
  } catch {
    try { await cleanupBounded(ctx.fiber.dispose(), 'PREP01_ORIGINAL_START_CLEANUP', 5000); } finally { live = false; transport?.close(); }
    throw new Error('PREP01_ORIGINAL_BOOTSTRAP_FAILED');
  }
}
