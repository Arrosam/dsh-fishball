// SOURCE ONLY until root reviews the sealed closure and authorizes one command.
// Static imports below use built-ins and inert fixture modules, never host/model code.
import { readFileSync, realpathSync, lstatSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { AC_SHA256, bounds, installedConfig } from './admission.mjs';
import { createHTTP } from './http-fixture.mjs';
import { createObservations, requireFact, reference, digest, safeFailure, safeAudit, within } from './safe-facts.mjs';
import { runOneCall } from './one-call-scenario.mjs';

const capsule = realpathSync(fileURLToPath(new URL('.', import.meta.url)));
const repository = realpathSync(join(capsule, '../..'));
const runtime = join(capsule, 'private-run');
const goPath = join(capsule, 'root-execution-go.json');
const freezePath = join(capsule, 'source-freeze.json');
let observations, http, binding, rootContext, rootDispose, presetDispose, runtimeCreated = false;
let presetDisposed = false, rootDisposed = false, cleanupRequested = false, cleanupPromise;
let cleanupState = 'not-started', outcome = 'HOLD', failureCode = null, markerMatched = null;
let workTimer, outerTimer, rootOwnerDisposeCalls = 0, presetOwnerDisposeCalls = 0;
const controller = new AbortController();
const signal = controller.signal;
function closedStatus() {
  let adapter = null;
  try { if (binding) adapter = safeAudit(binding.audit()); } catch { /* No raw audit fallback. */ }
  return { schema: 'df.ollama-live02-process/v1', outcome, failureCode,
    exactMarkerMatched: markerMatched, historicalAttemptsBefore: 1,
    additionalAttemptLimit: 1, adapter, counters: http?.snapshot() ?? null,
    cleanup: cleanupState, rootOwnerDisposeCalls, presetOwnerDisposeCalls,
    durableScratchRetained: runtimeCreated, remoteTerminationFromCleanup: 'unproved', billing: 'unknown',
    browserAcceptance: 'HOLD', nativeColdContinuation: 'HOLD', all87: 'HOLD', CODE: 'HOLD' };
}
function checkpointFailure() {
  try { observations?.({ phase: 'stopped-HOLD', failureCode: failureCode ?? 'SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT',
    adapter: closedStatus().adapter, counters: http?.snapshot() ?? null,
    terminalOrReleaseRequestedByFixtureAfterFailure: false, billing: 'unknown' }); } catch { /* Closed failure only. */ }
}
function stop(code) {
  failureCode ??= code; outcome = 'HOLD';
  if (!signal.aborted) controller.abort();
}
async function disposePresetOnce() {
  if (!presetDispose || presetDisposed) return;
  presetDisposed = true; presetOwnerDisposeCalls++; await presetDispose();
}
async function disposeRootOnce() {
  if (!rootDispose || rootDisposed) return;
  rootDisposed = true; rootOwnerDisposeCalls++; await rootDispose();
}
async function cleanup() {
  cleanupRequested = true;
  if (cleanupPromise) return cleanupPromise;
  cleanupState = 'pending';
  cleanupPromise = within((async () => {
    try { await disposePresetOnce(); } finally { await disposeRootOnce(); }
  })(), bounds.cleanupMs, 'LOCAL_CLEANUP_UNKNOWN').then(() => {
    cleanupState = 'public-disposers-resolved';
  }, () => { cleanupState = 'unknown'; stop('LOCAL_CLEANUP_UNKNOWN'); });
  return cleanupPromise;
}
function exclusiveJSON(path, value) {
  const bytes = JSON.stringify(value) + '\n';
  requireFact(Buffer.byteLength(bytes) <= bounds.observationBytes);
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
}
function checkedFile(path, maxBytes = 209715200) {
  const stat = lstatSync(path);
  requireFact(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maxBytes && realpathSync(path) === path);
  return readFileSync(path);
}
function pin(pinRecord) {
  const path = resolve(repository, pinRecord.path);
  requireFact(path.startsWith(repository + '/') && !pinRecord.path.split('/').includes('..'));
  const bytes = checkedFile(path);
  requireFact(bytes.length === pinRecord.bytes && digest(bytes) === pinRecord.sha256, 'HOST_CAPABILITY_UNSUPPORTED');
}
function authorize() {
  // Missing/false GO cannot create a marker, import an original module, read a
  // profile, send HTTP, or activate the provider. Template is deliberately false.
  requireFact(process.argv.length === 2);
  const go = JSON.parse(checkedFile(goPath, 16384));
  requireFact(go.schema === 'df.ollama-live02-root-go/v1' && go.go === true && go.acSha256 === AC_SHA256 &&
    go.onceOnly === true && go.historicalAttemptsBefore === 1 && go.maxAdditionalModelPOST === 1 &&
    go.originalHostGraphVerified === true && go.privateCommandStreams === true &&
    go.codeReview?.accepted === true && go.designReview?.accepted === true);
  reference(go.codeReview.sha256); reference(go.designReview.sha256);
  reference(go.fixtureFreezeSha256); reference(go.rootPlanSha256);
  requireFact(digest(checkedFile(freezePath, 1048576)) === go.fixtureFreezeSha256);
  requireFact(digest(checkedFile(join(capsule, 'root-plan.json'), 65536)) === go.rootPlanSha256);
  const freeze = JSON.parse(checkedFile(freezePath, 1048576));
  requireFact(freeze.schema === 'df.ollama-live02-source-freeze/v1' && freeze.acSha256 === AC_SHA256 &&
    freeze.copiedSourceDeltaCount === 6 && freeze.node.version === 'v22.22.2' &&
    process.version === freeze.node.version && realpathSync(process.execPath) === freeze.node.path &&
    digest(checkedFile(freeze.node.path)) === freeze.node.sha256, 'HOST_CAPABILITY_UNSUPPORTED');
  requireFact(Array.isArray(freeze.files) && freeze.files.length <= 512);
  for (const item of freeze.files) pin(item);
  for (const path of ['preflight-attempt.json', 'private-run']) {
    try { lstatSync(join(capsule, path)); requireFact(false, 'RESOURCE_LIMIT'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  return freeze;
}
function ownDirectory(path) {
  mkdirSync(path, { mode: 0o700 });
  const stat = lstatSync(path);
  requireFact(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === path &&
    stat.uid === process.getuid() && (stat.mode & 0o7777) === 0o700);
}
function retainedInventory() {
  let files = 0, directories = 0, bytes = 0;
  const walk = path => {
    const stat = lstatSync(path);
    requireFact(!stat.isSymbolicLink() && stat.uid === process.getuid());
    if (stat.isDirectory()) {
      requireFact(++directories <= bounds.retainedDirectories);
      for (const name of readdirSync(path)) walk(join(path, name));
    } else {
      requireFact(stat.isFile() && ++files <= bounds.retainedFiles && stat.nlink === 1);
      bytes += stat.size; requireFact(bytes <= bounds.retainedBytes, 'RESOURCE_LIMIT');
    }
  };
  walk(runtime); return { files, directories, bytes,
    observationOnly: true, physicalPrewriteInterceptor: false };
}
async function main() {
  const freeze = authorize();
  signal.throwIfAborted();
  const elapsedProcessMs = Math.ceil(process.uptime() * 1000);
  requireFact(elapsedProcessMs < bounds.workMs, 'DEADLINE_UNKNOWN');
  exclusiveJSON(join(capsule, 'preflight-attempt.json'), { schema: 'df.ollama-live02-once-attempt/v1',
    attempted: true, historicalAttemptsBefore: 1, additionalPosition: 'S01',
    acSha256: AC_SHA256, freezeSha256: digest(checkedFile(freezePath, 1048576)) });
  outerTimer = setTimeout(() => {
    stop('DEADLINE_UNKNOWN'); cleanupRequested = true; checkpointFailure();
    // Local process expiration proves no cloud termination or reservation release.
    // It writes no terminal/settlement to original state. Original cleanup is
    // requested first; a still-pending disposer remains UNKNOWN in the record.
    void cleanup();
    process.stdout.write(JSON.stringify(closedStatus()) + '\n');
    process.exit(2);
  }, bounds.outerProcessMs - elapsedProcessMs);
  workTimer = setTimeout(() => { stop('DEADLINE_UNKNOWN'); void cleanup(); }, bounds.workMs - elapsedProcessMs);
  ownDirectory(runtime); runtimeCreated = true;
  const home = join(runtime, 'home'), xdg = join(runtime, 'xdg'), profiles = join(home, 'profiles');
  const profile = join(profiles, 'ollama-corrected-one-call'), data = join(profile, 'data');
  const environment = join(profile, 'environment'), index = join(runtime, 'index');
  const observationDirectory = join(runtime, 'observations'), positionDirectory = join(runtime, 'position-ledger');
  for (const path of [home, xdg, profiles, profile, data, environment, index, observationDirectory, positionDirectory]) ownDirectory(path);
  observations = createObservations(observationDirectory);
  // Only these two variables are materialized and put into the original snapshot.
  // HOME is neither changed nor consulted by the fixture. Explicit provider
  // path/dshHome and this early environment precede every host/model import.
  process.env.DSH_HOME = home; process.env.XDG_CONFIG_HOME = xdg;
  process.chdir(environment);
  http = createHTTP({ signal });
  const metadata = await http.metadata();
  observations({ phase: 'readonly-exact-model-metadata', ...metadata });
  signal.throwIfAborted();
  const hostBase = new URL('../dsh-web/', import.meta.url).href;
  const load = name => import(new URL(`node_modules/@deepseek-ai/${name}/lib/index.js`, hostBase).href);
  const [{ boot }, { createLaunchEnvironmentSnapshot, DSH_LAUNCH_ENVIRONMENT_KEY }, { Context }, bindingModule] = await Promise.all([
    load('dsh-app-boot'), load('dsh-launch-environment'), load('cordis'), import('./ollama-binding.mjs')]);
  signal.throwIfAborted();
  const directory = join(data, 'df-sessions');
  const rows = [
    { id: 'webserver', name: '@deepseek-ai/dsh-host-webserver', config: { host: '127.0.0.1', port: 0, compression: 'none' } },
    { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local', config: { path: join(home, '.credentials.yaml'), dshHome: home, watch: false } },
    { id: 'connection', name: '@deepseek-ai/dsh-client-connection', config: { trustedHosts: [], cookieMaxAgeDays: 1, maxRequestBodyBytes: 65536 } },
    { id: 'frontend-static', name: '@deepseek-ai/dsh-host-frontend-static', config: { distIndex: join(index, 'index.html') } },
    { id: 'session-projections', name: '@deepseek-ai/dsh-session-projection' },
    { id: 'sessions', name: '@deepseek-ai/dsh-session' },
    { id: 'approval', name: '@deepseek-ai/dsh-user-approval', config: { policy: 'never' } },
    { id: 'agents', name: '@deepseek-ai/dsh-agent' },
    { id: 'llm', name: '@deepseek-ai/dsh-llm' },
    { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt', config: {} },
    { id: 'tools', name: '@deepseek-ai/dsh-tools', config: {} },
    { id: 'session-persistence', name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: directory, compression: 'none' } },
    { id: 'agent-loop', name: '@deepseek-ai/dsh-agent-loop', config: { agents: [], maxParallelToolCalls: 1 } },
    { id: 'presets', name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'df-ollama-empty' } },
    { id: 'approved-provider', name: new URL('./ollama-binding.mjs', import.meta.url).href, config: {} },
    { id: 'installed-df', name: new URL('./installed-source.mjs', import.meta.url).href,
      config: installedConfig({ data, environment, directory }) },
  ];
  exclusiveJSON(join(profile, 'cordis.yml'), rows);
  exclusiveJSON(join(profile, 'cordis.patch.yml'), []);
  writeFileSync(join(index, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic public-auth fixture</title><body>DF public-auth fixture</body></html>\n', { flag: 'wx', mode: 0o600 });
  const profileContext = Object.freeze({ name: 'ollama-corrected-one-call', dir: profile,
    patchPath: join(profile, 'cordis.patch.yml'), installAnchor: fileURLToPath(new URL('node_modules/@deepseek-ai/dsh/package.json', hostBase)),
    cwd: environment, home, startedBundles: Object.freeze([]), overlays: Object.freeze([]), telemetryDisabledEnv: '1' });
  const launch = createLaunchEnvironmentSnapshot([{ source: 'process', values: { DSH_HOME: home, XDG_CONFIG_HOME: xdg } }]);
  const root = await within(boot('df-ollama-live02', join(profile, 'cordis.yml'), [], async ctx => {
    requireFact(ctx instanceof Context);
    rootContext = ctx; rootDispose = () => ctx.fiber.dispose();
    if (cleanupRequested || signal.aborted) { await disposeRootOnce(); signal.throwIfAborted(); }
    // Published Context intercept map/config; no logger exporter clearing,
    // service substitution, raw sink, or process stdout/stderr replacement.
    ctx[Context.intercept].logger = { level: -1 };
    ctx.provide('profileContext', profileContext);
    ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, launch);
  }, hostBase), bounds.bootMs);
  requireFact(root === rootContext && !signal.aborted && !cleanupRequested);
  for (const row of rows) {
    const entry = root.loader.entries();
    const current = [...entry].find(item => item.options.id === row.id);
    requireFact(current && current.disabled === false && current.fiber?.state === 2 && current.fiber.uid !== null,
      'HOST_CAPABILITY_UNSUPPORTED');
  }
  const providerEntry = [...root.loader.entries()].find(item => item.options.id === 'approved-provider');
  binding = bindingModule.getApprovedOllamaBinding(providerEntry.fiber.ctx); binding.assertCurrent();
  requireFact(binding.audit().attempted === 0 && binding.billingState === 'unknown');
  const disposer = await root.agentPresets.register({ id: 'df-ollama-empty', plugins: [] });
  requireFact(typeof disposer === 'function'); presetDispose = disposer;
  if (cleanupRequested || signal.aborted) { await disposePresetOnce(); signal.throwIfAborted(); }
  requireFact(root.webServer.host === '127.0.0.1');
  const fences = await http.fences(root.connection, root.webServer.port);
  observations({ phase: 'original-boot-and-auth-fences', originalBoot: true,
    originalLoaderRowsActive: rows.length, originalCookieExchange: true,
    fences, listenerIPv4Loopback: true, endpointDifferentFromQA3080: true,
    applicationScriptCount: 0, browserAcceptance: 'HOLD', providerSourceRef: reference(binding.sourceRef) });
  let commandSerial = 0;
  const command = () => digest(`${AC_SHA256}:LIVE02:S01:${++commandSerial}`);
  const result = await runOneCall({ ctx: root, call: http.call, binding, command,
    observations, positionDirectory, signal });
  requireFact(result.completedOriginalSequence === true);
  markerMatched = result.exactMarkerMatched; outcome = 'original-sequence-observed';
  requireFact(http.snapshot().controlHTTP === 35 && http.snapshot().dfRPC === 30 &&
    http.snapshot().metadataHTTP === 3 && binding.audit().attempted === 1);
  return freeze;
}
const onSignal = () => { stop('REQUEST_ABORTED'); void cleanup(); };
const onUnhandled = error => { stop(safeFailure(error)); void cleanup(); };
process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
process.on('unhandledRejection', onUnhandled); process.on('uncaughtException', onUnhandled);
try {
  await main();
} catch (error) {
  stop(safeFailure(error, 'entry')); checkpointFailure();
} finally {
  clearTimeout(workTimer);
  // This abort stops only fixture HTTP. Original worker/native/cloud holds are
  // retained and are never rewritten through a fabricated cancel/finish call.
  if (!signal.aborted) controller.abort();
  await cleanup();
  if (observations) {
    try { observations({ phase: 'local-public-cleanup', cleanup: cleanupState,
      rootOwnerDisposeCalls, presetOwnerDisposeCalls, retained: retainedInventory(),
      adapter: closedStatus().adapter, counters: http?.snapshot() ?? null,
      remoteTermination: 'unproved', billing: 'unknown', all87: 'HOLD', CODE: 'HOLD' }); }
    catch { stop('RESOURCE_LIMIT'); }
  }
  clearTimeout(outerTimer);
  process.stdout.write(JSON.stringify(closedStatus()) + '\n');
  process.exitCode = outcome === 'original-sequence-observed' && cleanupState === 'public-disposers-resolved' ? 0 : 2;
  if (outcome === 'HOLD' || cleanupState === 'unknown') process.exit(2);
}
