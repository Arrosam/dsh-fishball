// Independent NI2 functional fixtures. Authority/installer/clock callbacks are
// explicit synthetic doubles. Cordis, Connection, SessionStore, ApprovalPreview
// and the encrypted RuntimeStore are original implementations; no listener runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { resolveHostSource } from '../src/host-probe.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { ApprovalPreview } from '../src/approval-preview.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { EnvironmentRegistry } from '../src/environment.mjs';
import { BootstrapError } from '../src/config.mjs';
import { SCHEMA_VERSION } from '../src/ledger.mjs';
import { runInstalledWorkerInvocation, captureInstalledWorkerInvocation, withInstalledWorkerInvocation } from '../src/installed-invocation.mjs';

const load = name => import(pathToFileURL(resolveHostSource(`@deepseek-ai/${name}`)).href);
const { Context } = await load('cordis');
const { default: SessionStore } = await load('dsh-session');
const { default: ApprovalService } = await load('dsh-user-approval');
const { WebServer } = await load('dsh-host-webserver');
const { HostConnectionService } = await load('dsh-client-connection');
const ref = label => reference(`independent-runtime-seams:${label}`);
const hash = text => createHash('sha256').update(text).digest('hex');
const opts = { timeout: 15000 };
const names = ['workerCatalog', 'workerPolicyPreview', 'workerPolicyConfirm', 'workerPlan', 'workerPreview', 'workerGrant', 'workerCreate', 'workerExecute', 'workerQuery', 'workerCapture', 'workerResult', 'workerFinish'];
const seamNames = ['ctx', 'snapshotOwner', 'readOwnerData', 'currentPolicy', 'installOwnerPolicy', 'planOwnerAction', 'assertNativeRequestCurrent', 'composeNativeWorker', 'prepareOwnerPreview', 'grantOwnerPreview', 'subscribeRuntimeReceipts', 'isAlive'];
const disabledStatus = () => ({ enabled: false, phase: 'disabled', reasonCode: null, configurationRef: null, policyVersion: null, selection: null, environment: null, persistence: null, bounds: null, accounting: null, pricing: 'unknown', actionsEnabled: false });
function barrier() {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const released = new Promise(resolve => { release = resolve; });
  return { entered, release, async wait() { enter(); await released; } };
}
// Since 4fea280 every owner-mutating installed seam requires the private
// installed invocation carrier the product's /df-rpc operations establish with
// runInstalledWorkerInvocation(ctx, assertCurrent, ...). Trusted direct seam
// calls below enter one real carrier whose guard mirrors the bridge guard (the
// actual runtime fiber is live; installed sealing stays the product's own
// checkOwner decision); carrier-less calls stay pinned to SERVICE_DISPOSED.
async function captureCarrier(api, fiber) {
  let token;
  await runInstalledWorkerInvocation(api.ctx, () => { if (fiber.state !== 2 || fiber.uid === null) throw new BootstrapError('SERVICE_DISPOSED'); return true; }, () => { token = captureInstalledWorkerInvocation(api.ctx); });
  return token;
}
// Installer operation doubles enter the exact bridge guard, as the installed
// worker's own operations do (src/installed-worker.mjs operations wrapper).
const inCarrier = (api, invocation, callback) => runInstalledWorkerInvocation(api.ctx, invocation.assertCurrent, callback);
function recursivelyFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach(recursivelyFrozen);
}
function dbFacts(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const n = table => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    return { tasks: n('tasks'), commands: n('runtime_commands'), data: n('runtime_data'), grants: n('grants'), reservations: n('reservations'), artifacts: db.prepare("SELECT count(*) AS n FROM runtime_records WHERE kind='artifact'").get().n };
  } finally { db.close(); }
}
class ResponseCollector extends Writable {
  parts = [];
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; }
  result() {
    const text = Buffer.concat(this.parts).toString('utf8');
    return { status: this.statusCode, text, ...(text && this.statusCode === 200 ? { result: JSON.parse(text).result } : {}) };
  }
}
function runtimeOptions(installedWorkerInstaller) {
  return { identity: () => ({ ownerId: 'independent-seam-owner', workspaceId: 'independent-seam-workspace' }), encryptionKey: () => Buffer.alloc(32, 39),
    memory: { namespaceRef: ref('memory'), tokenize: text => Buffer.byteLength(text, 'utf8'), byteLimit: 65536, tokenLimit: 8192 }, installedWorkerInstaller };
}
async function runtimeFixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-ni2-runtime-functional-'));
  const databasePath = join(directory, 'runtime.sqlite'), ctx = new Context(), fibers = [];
  let web;
  const webFiber = ctx.plugin({ name: 'independent-original-web-carrier', apply(c) { web = new WebServer(c, { host: '127.0.0.1', port: 3080, compression: 'none' }); } }); await webFiber; fibers.push(webFiber);
  assert.equal(web.server, undefined, 'no server start/listener');
  ctx.logger.exporters.clear();
  for (const [plugin, config] of [[SessionStore, undefined], [ApprovalService, { policy: 'never' }]]) { const fiber = ctx.plugin(plugin, config); await fiber; fibers.push(fiber); }
  const connectionFiber = ctx.plugin({ name: 'independent-synthetic-auth', inject: ['webServer'], apply(c) {
    // This one authentication callback is a double. The original service owns
    // peer creation, admission, request AbortSignal, framing and route lifetime.
    new HostConnectionService(c, [], { isAuthenticated: request => request.headers['x-independent-owner'] === 'synthetic-approved', authenticateApi: () => undefined });
  } }); await connectionFiber; fibers.push(connectionFiber);
  const gates = [];
  t.after(async () => { gates.forEach(g => g.release()); try { for (const fiber of [...fibers].reverse()) await fiber.dispose(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  const f = { ctx, web, fibers, connectionFiber, directory, databasePath, events: [], api: undefined, resolverCalls: 0, observerCalls: 0, disposeCalls: 0, observeMode: 'record', resolveGate: null, resolverChange: {}, gates };
  f.newGate = () => { const gate = barrier(); gates.push(gate); return gate; };
  f.labels = spec => ({ targetDigest: spec.targetDigest, ...spec.model,
    environmentRef: spec.executor.environmentRef, bindingDigest: spec.executor.bindingDigest, toolsDigest: spec.executor.toolsDigest, permissionPolicyDigest: spec.executor.permissionPolicyDigest,
    evidenceRef: ref('display-current'), targetLabel: 'Synthetic local target 中文🚀', providerLabel: 'Independent synthetic provider', modelLabel: 'Independent synthetic model', reasoningLabel: 'Explicit synthetic reasoning', presetLabel: 'Empty synthetic preset', environmentLabel: 'Owned local fixture', cwd: directory, toolNames: [], ...f.resolverChange });
  f.resolve = async spec => { f.resolverCalls++; if (f.resolveGate) await f.resolveGate.wait(); return f.labels(spec); };
  f.installer = customization => api => {
    f.api = api;
    api.subscribeRuntimeReceipts(event => {
      f.observerCalls++; f.events.push(event);
      if (f.observeMode === 'throw') throw Error('PRIVATE_OBSERVER_CANARY');
      if (f.observeMode === 'promise') return Promise.reject(Error('PRIVATE_ASYNC_OBSERVER_CANARY'));
    });
    const value = { hostPermission: () => false, previewResolver: f.resolve, previewTtlMs: 60000,
      operations: Object.fromEntries(names.map(name => [name, () => { throw Object.assign(Error('CAPABILITY_UNAVAILABLE'), { code: 'CAPABILITY_UNAVAILABLE' }); }])), status: disabledStatus, dispose() { f.disposeCalls++; } };
    return customization ? customization(api, value) : value;
  };
  f.install = async (customization, { advanced = false } = {}) => {
    const config = advanced ? { ...runtimeOptions(undefined), previewResolver: f.resolve, previewTtlMs: 60000 } : runtimeOptions(f.installer(customization));
    const fiber = ctx.plugin(createRuntimePlugin(config), { databasePath, limits: { maxMetadataBytes: 4096 } }); fibers.push(fiber); await fiber; f.runtimeFiber = fiber;
    if (!advanced) f.token = await captureCarrier(f.api, fiber);
    return fiber;
  };
  // Synchronous re-entry of the captured real carrier for trusted seam calls.
  f.owned = (callback, api = f.api, token = f.token) => withInstalledWorkerInvocation(api.ctx, token, callback);
  f.start = (name, payload = {}, headers = {}) => {
    const method = `v1/${name}`, envelope = { type: 'client-request', rpcId: `synthetic-${name}`, method, payload };
    const request = Readable.from([Buffer.from(JSON.stringify(envelope))]);
    Object.assign(request, { method: 'POST', url: `/df-rpc/${method}`, headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-independent-owner': 'synthetic-approved', ...headers } });
    const response = new ResponseCollector(), route = web.prefixes.get('/df-rpc'); assert.ok(route);
    // Direct in-memory invocation of the original public route; no socket/HTTP
    // client/server launch, private registered handler extraction or fake peer.
    const done = Promise.resolve(route.handler(request, response)).then(() => response.result());
    return { done, request, response };
  };
  f.send = async (...args) => (await f.start(...args).done);
  f.good = async (...args) => { const r = await f.send(...args); assert.equal(r.status, 200); assert.equal(r.result.ok, true, JSON.stringify(r.result)); return r.result.value; };
  f.current = taskRef => f.api.snapshotOwner({ taskRef }).task;
  return f;
}
function policyInput() { return { commandRef: ref('resource-policy'), expectedVersion: 1, limits: { maxActive: 1, maxAttempts: 1, maxTotalAttempts: 1 }, modelPolicy: { version: 1, presetRefs: [ref('preset')], catalogEvidenceRef: ref('catalog') } }; }
function actionSpec(dataDigest) {
  return { actionRef: ref('action'), kind: 'write', role: 'worker', targetDigest: ref('target'), dataDigest, units: 1,
    charges: { runtimeMs: 11, usageUnits: 9, costState: 'estimated', costEstimateMicros: 0, costProvenanceRef: ref('cost-source') },
    attemptGroupRef: ref('attempt'), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1,
    executor: { mode: 'create', generationRef: ref('generation'), sessionRef: ref('session'), environmentRef: ref('environment'), bindingDigest: ref('binding'), toolsDigest: ref('empty-tools'), permissionPolicyDigest: ref('permission') },
    model: { modelRef: ref('model'), reasoningRef: ref('reasoning'), presetRef: ref('preset'), catalogEvidenceRef: ref('catalog') } };
}
async function runtimeAction(f) {
  const goal = 'INDEPENDENT_RUNTIME_CURRENT_GOAL 中文🚀\nsecond line';
  const task = (await f.good('intake', { taskId: 'independent-task', provider: 'synthetic', source: 'independent-local', eventId: 'one', commandRef: ref('intake'), goal })).task;
  f.owned(() => f.api.installOwnerPolicy(policyInput()));
  const prepareInput = { taskRef: task.taskRef, commandRef: ref('context'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, terms: [], now: Date.now() };
  const prepared = await f.good('prepareContext', prepareInput);
  const planInput = { taskRef: task.taskRef, commandRef: ref('plan'), expectedTaskVersion: prepared.task.version, expectedAuthEpoch: prepared.task.authEpoch, spec: actionSpec(prepared.digest) };
  assert.throws(() => f.api.planOwnerAction(planInput), { code: 'SERVICE_DISPOSED' }, 'carrier-less trusted seam is refused');
  const action = f.owned(() => f.api.planOwnerAction(planInput)), current = f.current(task.taskRef);
  const prepare = { taskRef: task.taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, recordRef: prepared.recordRef, expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch };
  const grant = preview => ({ taskRef: task.taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, commandRef: ref('grant'), expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch, expiresAt: Date.now() + 30000, previewRef: preview.previewRef });
  const data = f.api.readOwnerData({ taskRef: task.taskRef, recordRef: prepared.recordRef });
  return { task, prepared, data, prepareInput, planInput, action, current, prepare, grant, goal };
}
async function componentFixture(t, { ttl = 100, namespace = 'component' } = {}) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-ni2-preview-component-')), databasePath = join(directory, 'encrypted.sqlite');
  const owner = Object.freeze({}), coordinator = Object.freeze({}), scope = { ownerId: `independent-${namespace}-owner`, workspaceId: 'independent-component-workspace' };
  let now = 1900000000000, alive = true, gate = null, change = {}, calls = 0;
  const store = new RuntimeStore({ databasePath, encryptionKey: Buffer.alloc(32, 41), clock: () => now, principals: [{ handle: owner, role: 'owner', scope }, { handle: coordinator, role: 'coordinator', scope }] });
  const tokenize = text => Buffer.byteLength(text, 'utf8');
  const memory = new MemoryAdapter({ store, handle: coordinator, namespaceRef: ref(namespace), tokenize, byteLimit: 65536, tokenLimit: 8192, contextAssembler: new ContextAssembler({ store, tokenize, byteLimit: 65536, tokenLimit: 8192 }) });
  const task = store.intake(owner, { taskId: 'component-task', provider: 'synthetic', source: 'component', eventId: 'one', commandRef: ref('component-intake'), goal: 'COMPONENT_ENCRYPTED_CONTEXT 中文🚀' }).task;
  store.policy(owner, policyInput());
  const prepared = await memory.prepareExecutionContext({ taskRef: task.taskRef, commandRef: ref('component-context'), expectedTaskVersion: task.version, expectedAuthEpoch: 0, terms: [], now });
  const action = store.planAction(owner, { taskRef: task.taskRef, commandRef: ref('component-plan'), expectedTaskVersion: prepared.task.version, expectedAuthEpoch: prepared.task.authEpoch, spec: actionSpec(prepared.digest) });
  const current = store.task(owner, task.taskRef), input = { taskRef: task.taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, recordRef: prepared.recordRef, expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch };
  const labels = spec => ({ targetDigest: spec.targetDigest, ...spec.model, environmentRef: spec.executor.environmentRef, bindingDigest: spec.executor.bindingDigest, toolsDigest: spec.executor.toolsDigest, permissionPolicyDigest: spec.executor.permissionPolicyDigest, evidenceRef: ref('component-evidence'), targetLabel: 'Synthetic component target', providerLabel: 'Synthetic provider', modelLabel: 'Synthetic model', reasoningLabel: 'Synthetic reasoning', presetLabel: 'Synthetic preset', environmentLabel: 'Synthetic component environment', cwd: directory, toolNames: [], ...change });
  const resolver = async spec => { calls++; if (gate) await gate.wait(); return labels(spec); };
  const boundary = new ApprovalPreview({ store, ownerHandle: owner, resolve: resolver, ttlMs: ttl, clock: () => now, isAlive: () => alive });
  const gates = [];
  t.after(() => { gates.forEach(g => g.release()); boundary.dispose(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, owner, databasePath, boundary, input, prepared, action, labels,
    grantInput: preview => ({ taskRef: input.taskRef, actionRef: input.actionRef, actionDigest: input.actionDigest, commandRef: ref('component-grant'), expectedTaskVersion: input.expectedTaskVersion, expectedAuthEpoch: input.expectedAuthEpoch, expiresAt: now + 10000, previewRef: preview.previewRef }),
    setNow: value => { now = value; }, now: () => now, setChange: value => { change = value; }, setGate: value => { gate = value; }, calls: () => calls, retire: () => { alive = false; }, newGate() { const value = barrier(); gates.push(value); return value; } };
}

test('R01 closed installer authority, loading preview refusal and zero optional native boot', opts, async t => {
  const f = await runtimeFixture(t);
  await f.install((api, value) => {
    assert.deepEqual(Reflect.ownKeys(api).sort(), [...seamNames].sort()); assert.equal(Object.isFrozen(api), true);
    assert.throws(() => { api.owner = {}; }, TypeError);
    assert.throws(() => api.prepareOwnerPreview({}), { code: 'PREVIEW_UNAVAILABLE' });
    assert.throws(() => api.grantOwnerPreview({}), { code: 'PREVIEW_UNAVAILABLE' });
    assert.equal(api.isAlive(), false, 'original fiber is still loading');
    assert.throws(() => api.currentPolicy(), { code: 'SERVICE_DISPOSED' });
    return value;
  });
  assert.equal(f.api.currentPolicy().version, 1); assert.equal(f.api.isAlive(), true);
  assert.equal(f.resolverCalls, 0); assert.equal(f.observerCalls, 0); assert.equal(f.ctx.sessions.list().length, 0);
  for (const name of ['agents', 'llm', 'tools', 'loader', 'sessionPersistence']) assert.equal(f.ctx.reflect.get(name), undefined);
  assert.deepEqual(dbFacts(f.databasePath), { tasks: 0, commands: 0, data: 0, grants: 0, reservations: 0, artifacts: 0 });
  assert.deepEqual(Reflect.ownKeys(f.ctx.df), ['diagnostics']);
  const diagnostics = f.ctx.df.diagnostics(); recursivelyFrozen(diagnostics);
  assert.equal(diagnostics.capabilities.worker, false); assert.equal(diagnostics.capabilities.memory, true); assert.equal(diagnostics.schemaVersion, SCHEMA_VERSION);
  assert.equal(JSON.stringify(diagnostics).includes(f.directory), false);
});

for (const defect of ['extra-handle', 'symbol', 'accessor', 'missing-operation', 'non-function-operation', 'async-installer', 'ttl-zero', 'ttl-over', 'ttl-fraction', 'missing-resolver']) test(`R02 installer rejects ${defect} before owner channel/native work`, opts, async t => {
  const f = await runtimeFixture(t); let getterReads = 0;
  const customization = (api, value) => {
    if (defect === 'extra-handle') value.ownerHandle = {};
    if (defect === 'symbol') value[Symbol('authority')] = true;
    if (defect === 'accessor') Object.defineProperty(value, 'hostPermission', { enumerable: true, get() { getterReads++; throw Error('PRIVATE_DESCRIPTOR_CANARY'); } });
    if (defect === 'missing-operation') delete value.operations.workerFinish;
    if (defect === 'non-function-operation') value.operations.workerCapture = true;
    if (defect === 'async-installer') return Promise.resolve(value);
    if (defect === 'ttl-zero') value.previewTtlMs = 0;
    if (defect === 'ttl-over') value.previewTtlMs = 60001;
    if (defect === 'ttl-fraction') value.previewTtlMs = 1.5;
    if (defect === 'missing-resolver') delete value.previewResolver;
    return value;
  };
  await assert.rejects(f.install(customization), { code: 'RUNTIME_ADAPTER_INVALID' });
  await f.fibers.at(-1).dispose();
  assert.equal(getterReads, 0); assert.equal(f.web.prefixes.has('/df-rpc'), false); assert.equal(f.resolverCalls, 0); assert.equal(f.ctx.sessions.list().length, 0);
  assert.throws(() => f.api.currentPolicy(), { code: 'SERVICE_DISPOSED' });
});

test('R03 optional native composition failure seals only installed admission and preserves actual task/memory/read work', opts, async t => {
  const f = await runtimeFixture(t); await f.install();
  assert.throws(() => f.api.composeNativeWorker({ worker: {} }), { code: 'SERVICE_DISPOSED' }, 'carrier-less composition is refused');
  assert.throws(() => f.owned(() => f.api.composeNativeWorker({ worker: {} })), { code: 'RUNTIME_ADAPTER_INVALID' });
  assert.equal(f.api.isAlive(), true, 'invalid shape has not attempted native construction');
  const environments = new EnvironmentRegistry({ entries: [{ environmentRef: ref('environment'), workspaceRef: reference('independent-seam-workspace'), bindingDigest: ref('binding'), toolsDigest: ref('empty-tools'), permissionPolicyDigest: ref('permission'), cwd: f.directory, root: f.directory, provider: 'synthetic', model: 'synthetic-model', modelRef: ref('model'), reasoningRef: ref('reasoning'), presetRef: ref('preset') }], currentState: () => ref('environment-current') });
  const input = { worker: { environments, permission: () => false, toolGuard: () => false }, nativeHooks: { setupAgent() {}, commitAgent() {}, bindExecution() {}, validateResult() {} } };
  // Since 4fea280 composition is lazy: the valid contribution is recorded and
  // the original NativeAdapter is constructed at the first planned native use.
  const planned = await runtimeAction(f), facade = f.owned(() => f.api.composeNativeWorker(input));
  const dispatch = { taskRef: planned.task.taskRef, actionRef: planned.action.actionRef };
  await assert.rejects(async () => f.owned(() => facade.dispatch(dispatch)), { code: 'WORKER_HOST_UNSUPPORTED' }, 'optional agents/llm are absent');
  await assert.rejects(async () => f.owned(() => facade.dispatch(dispatch)), { code: 'WORKER_SOURCE_UNAVAILABLE' }, 'one native construction attempt only');
  assert.throws(() => f.owned(() => f.api.composeNativeWorker(input)), { code: 'WORKER_SOURCE_UNAVAILABLE' });
  const task = (await f.good('intake', { taskId: 'missing-native', provider: 'synthetic', source: 'local', eventId: 'one', commandRef: ref('missing-native-intake'), goal: 'Scoped task without optional native dependencies' })).task;
  const remembered = await f.good('memoryRemember', { commandRef: ref('remember'), expectedRevision: 0, candidate: { kind: 'preference', content: { text: 'SYNTHETIC_MEMORY_STAYS_USABLE' }, sourceRefs: [ref('preference-source')], observedAt: Date.now(), confidence: 0.75 } });
  assert.equal(remembered.revision, 1); assert.equal((await f.good('memoryRead')).revision, 1);
  assert.equal(f.api.snapshotOwner({ taskRef: task.taskRef }).task.taskRef, task.taskRef);
  assert.equal((await f.good('list')).length, 2); assert.equal(f.ctx.sessions.list().length, 0);
  assert.equal((await f.send('workerCreate', {})).result.error.code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(f.ctx.df.diagnostics().capabilities.worker, false); assert.equal(f.resolverCalls, 0);
  // 4fea280 lazy ensureManager() no longer sets installedSealed on a failed
  // NativeAdapter construction; the one-attempt latch above is the native fence
  // (flagged to the lead as a behaviour change, not silently accepted).
  assert.equal(f.api.isAlive(), true);
  await assert.rejects(async () => f.owned(() => facade.dispatch(dispatch)), { code: 'WORKER_SOURCE_UNAVAILABLE' }, 'native remains permanently unavailable');
});

test('R04 explicit original policy/plan replay repeats saved receipts while repeated prepare still checks current CAS', opts, async t => {
  const f = await runtimeFixture(t); await f.install(); const x = await runtimeAction(f), before = dbFacts(f.databasePath);
  const originalEvent = f.events.find(e => e.operation === 'prepareContext');
  recursivelyFrozen(originalEvent); assert.deepEqual(originalEvent.input, x.prepareInput); assert.deepEqual(originalEvent.receipt, x.prepared);
  const policy = f.owned(() => f.api.installOwnerPolicy(policyInput())), plan = f.owned(() => f.api.planOwnerAction(x.planInput));
  assert.deepEqual(policy, f.events.find(e => e.operation === 'policy').receipt); assert.deepEqual(plan, x.action); assert.deepEqual(dbFacts(f.databasePath), before);
  const policyEvents = f.events.filter(e => e.operation === 'policy'), planEvents = f.events.filter(e => e.operation === 'plan');
  for (const events of [policyEvents, planEvents]) { assert.equal(events.length, 2); assert.deepEqual(events[1], events[0]); assert.notEqual(events[1], events[0]); assert.notEqual(events[1].receipt, events[0].receipt); }
  const repeat = await f.send('prepareContext', x.prepareInput); assert.equal(repeat.result.ok, false); assert.equal(repeat.result.error.code, 'STALE_VERSION');
  x.prepareInput.terms.push('caller mutation'); x.planInput.spec.model.modelRef = ref('changed-after-return');
  assert.deepEqual(originalEvent.input.terms, []); assert.equal(f.events.find(e => e.operation === 'plan').input.spec.model.modelRef, ref('model'));
  const rejected = await f.send('prepareContext', { ...x.prepareInput, commandRef: ref('stale-context') });
  assert.equal(rejected.result.ok, false); assert.equal(f.events.filter(e => e.operation === 'prepareContext').length, 1);
  assert.equal(f.ctx.sessions.list().length, 0); assert.equal(before.grants, 0); assert.equal(before.reservations, 0);
});

test('R05 original six/eight-field preview/grant detach caller mutation and fan out one actual committed grant', opts, async t => {
  const f = await runtimeFixture(t); await f.install(); const x = await runtimeAction(f), before = dbFacts(f.databasePath);
  f.resolveGate = f.newGate(); const mutablePrepare = { ...x.prepare }, pending = f.owned(() => f.api.prepareOwnerPreview(mutablePrepare));
  await f.resolveGate.entered; mutablePrepare.recordRef = ref('foreign'); mutablePrepare.expectedTaskVersion += 100; f.resolveGate.release();
  const preview = await pending; f.resolveGate = null; recursivelyFrozen(preview);
  assert.equal(preview.description.data.content, x.data.content); assert.equal(preview.description.data.digest, hash(x.data.content));
  assert.deepEqual(dbFacts(f.databasePath), before); assert.equal(f.events.filter(e => e.operation === 'grant').length, 0);
  const grant = x.grant(preview), captured = structuredClone(grant);
  for (const input of [{ ...grant, accept: true }, { ...grant, owner: true }, { ...grant, assertCurrent: true }]) await assert.rejects(f.owned(() => f.api.grantOwnerPreview(input)), { code: 'INVALID_INPUT' });
  assert.throws(() => f.api.grantOwnerPreview(grant), { code: 'SERVICE_DISPOSED' }, 'carrier-less grant is refused before preview');
  f.resolveGate = f.newGate(); const a = f.owned(() => f.api.grantOwnerPreview(grant)); await f.resolveGate.entered;
  grant.actionRef = ref('changed-during-await'); grant.expiresAt = 1;
  const busy = f.owned(() => f.api.grantOwnerPreview(captured)); await assert.rejects(busy, { code: 'PREVIEW_BUSY' });
  assert.equal(dbFacts(f.databasePath).grants, 0); f.resolveGate.release(); const receipt = await a; f.resolveGate = null;
  const events = f.events.filter(e => e.operation === 'grant'); assert.equal(events.length, 1);
  const { previewRef, ...storeInput } = captured; assert.deepEqual(events[0].input, storeInput); assert.deepEqual(events[0].receipt, receipt); recursivelyFrozen(events[0]);
  assert.equal(Reflect.ownKeys(events[0].input).length, 7); assert.equal(Object.hasOwn(events[0].input, 'accept'), false);
  assert.equal(receipt.task.authEpoch, x.current.authEpoch + 1); assert.equal(dbFacts(f.databasePath).grants, 1); assert.equal(f.ctx.sessions.list().length, 0);
  await assert.rejects(f.owned(() => f.api.grantOwnerPreview(captured)), { code: 'PREVIEW_STALE' }); assert.equal(f.events.filter(e => e.operation === 'grant').length, 1);
});

for (const mode of ['throw', 'promise']) test(`R06 ${mode} observer failure after grant preserves commit and seals installed admission without automatic replay`, opts, async t => {
  const f = await runtimeFixture(t); await f.install(); const x = await runtimeAction(f), preview = await f.owned(() => f.api.prepareOwnerPreview(x.prepare));
  const before = dbFacts(f.databasePath), oldCalls = f.observerCalls; f.observeMode = mode;
  await assert.rejects(f.owned(() => f.api.grantOwnerPreview(x.grant(preview))), error => error.code === 'WORKER_SOURCE_UNAVAILABLE' && !String(error).includes('CANARY'));
  assert.equal(f.api.isAlive(), false); const committed = dbFacts(f.databasePath);
  assert.equal(committed.grants, before.grants + 1); assert.equal(committed.commands, before.commands + 1); assert.equal(committed.reservations, 0);
  assert.equal(f.current(x.task.taskRef).authEpoch, x.current.authEpoch + 1); assert.equal(f.observerCalls, oldCalls + 1);
  assert.equal(f.events.filter(e => e.operation === 'grant').length, 1);
  // 4fea280 checkOwner() refuses a sealed installed lifetime as SERVICE_DISPOSED
  // before the former PREVIEW_UNAVAILABLE branch; both carrier forms refuse.
  assert.throws(() => f.api.grantOwnerPreview(x.grant(preview)), { code: 'SERVICE_DISPOSED' });
  assert.throws(() => f.owned(() => f.api.grantOwnerPreview(x.grant(preview))), { code: 'SERVICE_DISPOSED' });
  assert.throws(() => f.owned(() => f.api.prepareOwnerPreview(x.prepare)), { code: 'SERVICE_DISPOSED' });
  assert.throws(() => f.api.assertNativeRequestCurrent({}), { code: 'WORKER_SOURCE_UNAVAILABLE' });
  await f.good('list'); await f.good('memoryRead'); assert.deepEqual(dbFacts(f.databasePath), committed); assert.equal(f.observerCalls, oldCalls + 1);
  f.observeMode = 'record'; await f.runtimeFiber.dispose(); await f.install();
  assert.equal(f.api.isAlive(), true); assert.equal(f.current(x.task.taskRef).authEpoch, x.current.authEpoch + 1);
  assert.equal(f.events.filter(e => e.operation === 'grant').length, 1); assert.equal(f.ctx.sessions.list().length, 0);
  await assert.rejects(f.owned(() => f.api.grantOwnerPreview(x.grant(preview))), { code: 'PREVIEW_STALE' }); assert.deepEqual(dbFacts(f.databasePath), committed);
});

for (const drift of ['policy', 'pause', 'cancel', 'meaning', 'unload']) test(`R07 original grant resolver await rejects ${drift} drift with zero new grant`, opts, async t => {
  const f = await runtimeFixture(t); await f.install(); const x = await runtimeAction(f), preview = await f.owned(() => f.api.prepareOwnerPreview(x.prepare));
  f.resolveGate = f.newGate(); const pending = f.owned(() => f.api.grantOwnerPreview(x.grant(preview)));
  const outcome = pending.then(value => ({ value }), error => ({ error })); await f.resolveGate.entered;
  if (drift === 'policy') f.owned(() => f.api.installOwnerPolicy({ ...policyInput(), commandRef: ref('new-policy'), expectedVersion: 2 }));
  if (drift === 'pause' || drift === 'cancel') await f.good('control', { taskRef: x.task.taskRef, commandRef: ref(drift), expectedTaskVersion: x.current.version, expectedAuthEpoch: x.current.authEpoch, kind: drift });
  if (drift === 'meaning') f.resolverChange = { evidenceRef: ref('changed-catalog-meaning') };
  if (drift === 'unload') await f.runtimeFiber.dispose();
  f.resolveGate.release(); const r = await outcome;
  assert.equal(r.value, undefined); assert.ok(['PREVIEW_STALE', 'PREVIEW_UNAVAILABLE', 'SERVICE_DISPOSED'].includes(r.error?.code));
  assert.equal(f.events.filter(e => e.operation === 'grant').length, 0); assert.equal(f.ctx.sessions.list().length, 0);
  if (drift === 'unload') { await f.install(); } // public reopened encrypted facts
  assert.equal(dbFacts(f.databasePath).grants, 0); assert.equal(dbFacts(f.databasePath).reservations, 0);
});

test('R08 stale runtime closures/tokens cannot bind to replacement lifetime; data reads remain exactly scoped', opts, async t => {
  const f = await runtimeFixture(t); await f.install(); const x = await runtimeAction(f), preview = await f.owned(() => f.api.prepareOwnerPreview(x.prepare)), old = f.api, oldToken = f.token;
  const read = old.readOwnerData({ taskRef: x.task.taskRef, recordRef: x.prepared.recordRef }); assert.equal(read.content, x.data.content); assert.equal(read.digest, x.prepared.digest);
  assert.throws(() => old.readOwnerData({ taskRef: ref('foreign-task'), recordRef: x.prepared.recordRef }));
  const exported = await f.good('export', { taskRef: x.task.taskRef }); assert.equal(JSON.stringify(exported).includes(x.goal), false);
  assert.equal(readFileSync(f.databasePath).includes(Buffer.from(x.goal)), false);
  await f.runtimeFiber.dispose(); await f.install();
  assert.throws(() => old.prepareOwnerPreview(x.prepare), { code: 'SERVICE_DISPOSED' });
  assert.throws(() => f.owned(() => old.prepareOwnerPreview(x.prepare), old, oldToken), { code: 'SERVICE_DISPOSED' }, 'retired carrier stays retired');
  // A separate replacement carrier: a ctx mismatch permanently seals the borrowed carrier.
  const borrowed = await captureCarrier(f.api, f.runtimeFiber);
  assert.throws(() => f.owned(() => old.prepareOwnerPreview(x.prepare), old, borrowed), { code: 'SERVICE_DISPOSED' }, 'replacement carrier cannot revive a retired closure');
  assert.throws(() => old.currentPolicy(), { code: 'SERVICE_DISPOSED' }); assert.equal(old.isAlive(), false);
  await assert.rejects(f.owned(() => f.api.grantOwnerPreview(x.grant(preview))), { code: 'PREVIEW_STALE' });
  assert.equal(f.api.readOwnerData({ taskRef: x.task.taskRef, recordRef: x.prepared.recordRef }).content, x.data.content);
  assert.equal(dbFacts(f.databasePath).grants, 0); assert.equal(f.ctx.sessions.list().length, 0);
});

test('R09 unsubscription is single-use, diagnostics detach the installed status, and owner auth is original admission', opts, async t => {
  const f = await runtimeFixture(t); let unsubscribe, status;
  const installer = api => {
    f.api = api; unsubscribe = api.subscribeRuntimeReceipts(event => f.events.push(event)); status = disabledStatus();
    return { hostPermission: () => false, previewResolver: f.resolve, previewTtlMs: 60000, operations: Object.fromEntries(names.map(name => [name, () => null])), status: () => status, dispose() {} };
  };
  const fiber = f.ctx.plugin(createRuntimePlugin(runtimeOptions(installer)), { databasePath: f.databasePath }); f.fibers.push(fiber); await fiber; f.runtimeFiber = fiber;
  const initial = f.ctx.df.diagnostics(); status.enabled = true; assert.equal(initial.installedWorkerStatus.enabled, false); recursivelyFrozen(initial);
  unsubscribe(); unsubscribe(); assert.throws(() => f.api.subscribeRuntimeReceipts(() => {}), { code: 'RUNTIME_ADAPTER_INVALID' });
  assert.throws(() => f.api.installOwnerPolicy(policyInput()), { code: 'SERVICE_DISPOSED' });
  f.token = await captureCarrier(f.api, fiber); f.owned(() => f.api.installOwnerPolicy(policyInput())); assert.equal(f.events.length, 0);
  const payload = { taskId: 'auth-task', provider: 'synthetic', source: 'local', eventId: 'one', commandRef: ref('auth-intake') };
  assert.equal((await f.send('intake', payload, { 'x-independent-owner': 'denied' })).status, 401);
  assert.equal((await f.send('intake', payload, { host: 'foreign.invalid', origin: 'http://foreign.invalid' })).status, 403);
  assert.equal((await f.good('list')).length, 0); assert.equal((await f.good('intake', payload)).task.workspaceRef, reference('independent-seam-workspace'));
  const borrow = f.ctx.df; await fiber.dispose(); assert.throws(() => borrow.diagnostics(), { code: 'SERVICE_DISPOSED' }); assert.equal(f.web.prefixes.has('/df-rpc'), false);
});

for (const order of ['loss-first', 'commit-first']) test(`R10 actual original request AbortSignal ${order} gates an installer operation and preserves exact persisted facts`, opts, async t => {
  const f = await runtimeFixture(t), gate = f.newGate(); let calls = 0, errorCode, guard;
  await f.install((api, value) => {
    value.operations.workerPolicyConfirm = async (input, invocation) => {
      calls++; guard = invocation.assertCurrent; assert.deepEqual(Reflect.ownKeys(invocation), ['assertCurrent']); assert.equal(Object.isFrozen(invocation), true); guard();
      return inCarrier(api, invocation, async () => {
        if (order === 'commit-first') api.installOwnerPolicy(input);
        await gate.wait();
        try { guard(); } catch (error) { errorCode = error.code; throw error; }
        return api.installOwnerPolicy(input);
      });
    }; return value;
  });
  const req = f.start('workerPolicyConfirm', policyInput()); await gate.entered;
  req.response.emit('close'); gate.release(); const carrier = await req.done;
  assert.equal(carrier.text, '', 'original carrier suppresses output after close'); assert.equal(errorCode, 'REQUEST_ABORTED'); assert.equal(calls, 1);
  assert.throws(() => guard(), { code: 'REQUEST_ABORTED' });
  assert.equal(f.api.currentPolicy().version, order === 'commit-first' ? 2 : 1);
  assert.equal(dbFacts(f.databasePath).commands, order === 'commit-first' ? 1 : 0);
  assert.equal(f.events.filter(e => e.operation === 'policy').length, order === 'commit-first' ? 1 : 0);
  assert.equal((await f.good('list')).length, 0); assert.equal(calls, 1); assert.equal(f.ctx.sessions.list().length, 0);
});

test('R11 original request guards stay separate while one request aborts and the other commits', opts, async t => {
  const f = await runtimeFixture(t), gates = { a: f.newGate(), b: f.newGate() }, guards = [], errors = [];
  await f.install((api, value) => { value.operations.workerPolicyConfirm = async (input, invocation) => {
    guards.push(invocation.assertCurrent); invocation.assertCurrent();
    return inCarrier(api, invocation, async () => {
      await gates[input.id].wait();
      try { invocation.assertCurrent(); } catch (error) { errors.push(error.code); throw error; }
      return api.installOwnerPolicy(policyInput());
    });
  }; return value; });
  const a = f.start('workerPolicyConfirm', { id: 'a' }), b = f.start('workerPolicyConfirm', { id: 'b' }); await Promise.all([gates.a.entered, gates.b.entered]);
  assert.notEqual(guards[0], guards[1]); a.response.emit('close'); gates.b.release();
  assert.equal((await b.done).result.ok, true); gates.a.release(); assert.equal((await a.done).text, '');
  assert.deepEqual(errors, ['REQUEST_ABORTED']); assert.equal(f.api.currentPolicy().version, 2); assert.equal(dbFacts(f.databasePath).commands, 1); assert.equal(f.events.filter(e => e.operation === 'policy').length, 1);
});

test('R12 own runtime unload seals captured invocation before installer teardown completes', opts, async t => {
  const f = await runtimeFixture(t), gate = f.newGate(), cleanup = f.newGate(); let postAwait = 0, guard, failure;
  await f.install((api, value) => { value.operations.workerPolicyConfirm = async (input, invocation) => { guard = invocation.assertCurrent; guard(); return inCarrier(api, invocation, async () => { await gate.wait(); try { guard(); } catch (error) { failure = error.code; throw error; } postAwait++; return api.installOwnerPolicy(input); }); }; value.dispose = () => cleanup.wait(); return value; });
  const req = f.start('workerPolicyConfirm', policyInput()); await gate.entered; const disposal = f.runtimeFiber.dispose(); await cleanup.entered;
  assert.equal(f.api.isAlive(), false); assert.throws(() => guard(), { code: 'SERVICE_DISPOSED' }); gate.release(); const response = await req.done;
  assert.equal(response.result.error.code, 'SERVICE_DISPOSED'); assert.equal(failure, 'SERVICE_DISPOSED'); assert.equal(postAwait, 0); assert.equal(dbFacts(f.databasePath).commands, 0);
  cleanup.release(); await disposal; assert.equal(f.web.prefixes.has('/df-rpc'), false);
});

test('R13 unchanged advanced preview path works without an installer or receipt subscriber', opts, async t => {
  const f = await runtimeFixture(t); await f.install(undefined, { advanced: true });
  const task = (await f.good('intake', { taskId: 'advanced-task', provider: 'synthetic', source: 'local', eventId: 'one', commandRef: ref('advanced-intake'), goal: 'ADVANCED_ORIGINAL_CONTEXT' })).task;
  await f.good('policy', policyInput());
  const prepared = await f.good('prepareContext', { taskRef: task.taskRef, commandRef: ref('advanced-context'), expectedTaskVersion: task.version, expectedAuthEpoch: 0, terms: [], now: Date.now() });
  const action = await f.good('plan', { taskRef: task.taskRef, commandRef: ref('advanced-plan'), expectedTaskVersion: prepared.task.version, expectedAuthEpoch: prepared.task.authEpoch, spec: actionSpec(prepared.digest) });
  const input = { taskRef: task.taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, recordRef: prepared.recordRef, expectedTaskVersion: prepared.task.version, expectedAuthEpoch: prepared.task.authEpoch };
  const preview = await f.good('preview', input); const grant = { taskRef: input.taskRef, actionRef: input.actionRef, actionDigest: input.actionDigest, commandRef: ref('advanced-grant'), expectedTaskVersion: input.expectedTaskVersion, expectedAuthEpoch: input.expectedAuthEpoch, expiresAt: Date.now() + 30000, previewRef: preview.previewRef };
  const receipt = await f.good('grant', grant); assert.equal(receipt.authEpoch, 1); assert.equal(dbFacts(f.databasePath).grants, 1); assert.equal(f.events.length, 0);
  assert.equal(Object.hasOwn(f.ctx.df.diagnostics(), 'installedWorkerStatus'), false); assert.equal(f.ctx.sessions.list().length, 0);
});

for (const edge of ['before-expiry', 'expiry-equality', 'clock-rollback']) test(`P01 original preview clock ${edge} uses actual encrypted authority`, opts, async t => {
  const f = await componentFixture(t), preview = await f.boundary.prepare(f.input);
  assert.equal(preview.expiresAt, f.now() + 100); const baseline = dbFacts(f.databasePath);
  if (edge === 'before-expiry') f.setNow(preview.expiresAt - 1);
  if (edge === 'expiry-equality') f.setNow(preview.expiresAt);
  if (edge === 'clock-rollback') f.setNow(f.now() - 1);
  if (edge === 'before-expiry') { const receipt = await f.boundary.grant(f.grantInput(preview)); assert.equal(receipt.authEpoch, 1); assert.equal(dbFacts(f.databasePath).grants, 1); }
  else { await assert.rejects(f.boundary.grant(f.grantInput(preview)), { code: edge === 'clock-rollback' ? 'PREVIEW_UNAVAILABLE' : 'PREVIEW_STALE' }); assert.deepEqual(dbFacts(f.databasePath), baseline); }
});

test('P02 cached63 plus pending1 share the original64 cap; resolver failure returns a slot', opts, async t => {
  const f = await componentFixture(t), previews = [];
  for (let i = 0; i < 63; i++) previews.push(await f.boundary.prepare(f.input));
  const gate = f.newGate(); f.setGate(gate); const pending = f.boundary.prepare(f.input), outcome = pending.then(value => ({ value }), error => ({ error })); await gate.entered;
  await assert.rejects(f.boundary.prepare(f.input), { code: 'PREVIEW_CAPACITY' }); assert.equal(f.calls(), 64);
  f.setChange({ targetDigest: ref('wrong-current-target') }); gate.release(); assert.equal((await outcome).error.code, 'PREVIEW_STALE');
  f.setGate(null); f.setChange({}); const last = await f.boundary.prepare(f.input); assert.ok(last.previewRef);
  await assert.rejects(f.boundary.prepare(f.input), { code: 'PREVIEW_CAPACITY' }); assert.equal(dbFacts(f.databasePath).grants, 0);
  f.setNow(last.expiresAt); const fresh = await f.boundary.prepare(f.input); assert.ok(fresh.previewRef); assert.equal(f.calls(), 66);
});

test('P03 expiry crossing a grant await and policy CAS crossing a prepare await produce no grant or stale token', opts, async t => {
  for (const drift of ['expiry', 'policy']) {
    const f = await componentFixture(t, { namespace: drift }), preview = await f.boundary.prepare(f.input), gate = f.newGate(); f.setGate(gate);
    const pending = drift === 'expiry' ? f.boundary.grant(f.grantInput(preview)) : f.boundary.prepare(f.input);
    const outcome = pending.then(value => ({ value }), error => ({ error })); await gate.entered;
    if (drift === 'expiry') f.setNow(preview.expiresAt);
    else f.store.policy(f.owner, { ...policyInput(), expectedVersion: 2, commandRef: ref('component-policy-drift') });
    gate.release(); assert.equal((await outcome).error.code, 'PREVIEW_STALE'); assert.equal(dbFacts(f.databasePath).grants, 0); assert.equal(dbFacts(f.databasePath).reservations, 0);
  }
});

test('P04 foreign original preview instance and caller token copy cannot substitute for process-private original cache', opts, async t => {
  const a = await componentFixture(t, { namespace: 'foreign-a' }), b = await componentFixture(t, { namespace: 'foreign-b' }), preview = await a.boundary.prepare(a.input);
  await assert.rejects(b.boundary.grant({ ...b.grantInput(preview), previewRef: preview.previewRef }), { code: 'PREVIEW_STALE' });
  const input = a.grantInput(preview); await assert.rejects(a.boundary.grant({ ...input, previewRef: ref('equal-looking-caller-token') }), { code: 'PREVIEW_STALE' });
  assert.equal(dbFacts(a.databasePath).grants, 0); assert.equal(dbFacts(b.databasePath).grants, 0);
  assert.equal((await a.boundary.grant(input)).authEpoch, 1); await assert.rejects(a.boundary.grant(input), { code: 'PREVIEW_STALE' });
  assert.equal(dbFacts(a.databasePath).grants, 1);
});
