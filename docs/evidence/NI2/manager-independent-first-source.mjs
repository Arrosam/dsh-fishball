// Independent functional execution, not a CODE review or physical acceptance.
// Original factories/persistence/composer/provider are used unchanged. The
// explicit profile, identity, key, HTTP authentication and currentness guards
// are synthetic fixture doubles. Spies/barriers always delegate original calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { resolveHostSource } from '../src/host-probe.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { createInstalledWorker } from '../src/installed-worker.mjs';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { NativeAdapter } from '../src/native-adapter.mjs';
import { BootstrapError } from '../src/config.mjs';
import { runInstalledWorkerInvocation, captureInstalledWorkerInvocation,
  withInstalledWorkerInvocation, assertInstalledWorkerInvocation } from '../src/installed-invocation.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const ref = label => sha('independent-manager-functional/v1:' + label);
const load = name => import(pathToFileURL(resolveHostSource('@deepseek-ai/' + name)).href);
const { Context, symbols } = await load('cordis');
const { default: Loader } = await load('cordis-plugin-loader');
const { default: Sessions } = await load('dsh-session');
const { default: Projections } = await load('dsh-session-projection');
const { default: Approval } = await load('dsh-user-approval');
const { AgentRegistry } = await load('dsh-agent');
const { LlmRuntime } = await load('dsh-llm');
const { default: Prompt } = await load('dsh-system-prompt');
const { default: Tools } = await load('dsh-tools');
const { default: Presets } = await load('dsh-agent-preset-registry');
const { WebServer } = await load('dsh-host-webserver');
const { HostConnectionService } = await load('dsh-client-connection');
const original = value => value?.[symbols.original] ?? value;
const timeout = { timeout: 20000 };
const allowed = () => true;
function deferred() {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const released = new Promise(resolve => { release = resolve; });
  return { entered, release, async wait() { enter(); await released; } };
}
function instrument(prototype, method, wrapper) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
  assert.equal(typeof descriptor.value, 'function');
  Object.defineProperty(prototype, method, { ...descriptor, value: wrapper(descriptor.value) });
  return () => Object.defineProperty(prototype, method, descriptor);
}
function facts(directory) {
  const db = new DatabaseSync(join(directory, 'manager.sqlite'), { readOnly: true });
  try {
    const count = table => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    return { schema: db.prepare('PRAGMA user_version').get().user_version,
      reservations: count('reservations'), commands: count('runtime_commands'),
      artifacts: db.prepare("SELECT count(*) AS n FROM runtime_records WHERE kind='artifact'").get().n,
      intents: db.prepare("SELECT count(*) AS n FROM automation_records WHERE kind='execution'").get().n,
      workers: db.prepare('SELECT payload FROM runtime_workers ORDER BY claim').all().map(row => JSON.parse(row.payload)),
      attempts: db.prepare('SELECT attempts FROM actions ORDER BY claim_id').all().map(row => row.attempts) };
  } finally { db.close(); }
}
class Response extends Writable {
  parts = [];
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  writeHead(code, headers) { this.statusCode = code; this.headers = headers; }
}

async function fixture(t, { normal = true, apiTransform = api => api } = {}) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-manager-independent-'));
  const ctx = new Context(), fibers = [], entries = [], releases = [], restores = [];
  ctx.baseUrl = new URL('../', import.meta.url).href;
  ctx.logger.exporters?.clear?.();
  const profile = { dir: directory, name: 'synthetic-independent-manager' };
  ctx.provide('profileContext', Object.freeze(profile));
  let child, server, unregisterPreset, api, operations, composed;
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await child?.dispose(); } };
  t.after(async () => {
    for (const release of releases) release();
    try { await close(); await unregisterPreset?.();
      for (const entry of entries.reverse()) await entry.fiber?.dispose();
      for (const fiber of fibers.reverse()) await fiber.dispose();
    } finally { for (const restore of restores.reverse()) restore(); rmSync(directory, { recursive: true, force: true }); }
  });
  const install = async (plugin, config) => { const fiber = ctx.plugin(plugin, config); fibers.push(fiber); await fiber; };
  await install(Projections); await install(Sessions); await install(Approval, { policy: 'never' });
  await install({ apply(webCtx) { server = new WebServer(webCtx, { host: '127.0.0.1', port: 3080, compression: 'none' }); } });
  assert.equal(server.server, undefined, 'the real public server is never initialized');
  await install({ inject: ['webServer'], apply(connectionCtx) {
    // Explicit no-listener authentication double; the original connection owns
    // the actual OperatorPeer and the original per-request abort signal.
    new HostConnectionService(connectionCtx, [], { isAuthenticated: req => req.headers['x-fixture-owner'] === 'synthetic-approved' });
  } });
  if (normal) {
    await install(AgentRegistry); await install(LlmRuntime); await install(Prompt, {}); await install(Tools, {});
    await install(Loader, { baseUrl: ctx.baseUrl });
    const entry = async (name, config) => { const id = await ctx.loader.create({ name, config }); await ctx.loader.await(); const value = ctx.loader.resolve(id); assert.equal(value.fiber.state, 2); entries.push(value); };
    await entry('@deepseek-ai/dsh-session-persistence-jsonl', { root: join(directory, 'original-jsonl'), compression: 'none' });
    await entry('@deepseek-ai/dsh-agent-loop', { agents: [], maxParallelToolCalls: 1 });
    await install(Presets, { default: 'empty' });
    unregisterPreset = await ctx.agentPresets.register({ id: 'empty', plugins: [] });
    await entry('dsh-fishball/testing-provider', {});
  }
  const selection = { enabled: true,
    selection: { provider: 'df-testing-local', model: 'df-testing-worker-v1', agentPreset: 'empty', reasoningEffort: null, maxOutputTokens: 128 },
    environment: { root: directory, cwd: directory }, persistence: { directory: join(directory, 'original-jsonl'), compression: 'none', retention: 'owner-managed' },
    bounds: { requestBytes: 8192, resultBytes: 128 }, policy: { maxRuntimeMs: 10000, maxUsageUnits: 20000, maxCostEstimateMicros: 0 },
    charges: { runtimeMs: 1000, usageUnits: 8320 }, previewTtlMs: 30000, grantTtlMs: 60000 };
  const identity = { ownerId: 'manager-independent-owner', workspaceId: 'manager-independent-workspace' };
  const normalInstaller = normal && createInstalledWorker({ selection, identity, profile }).installedWorkerInstaller;
  const installedWorkerInstaller = normal && (value => {
    api = value;
    // Retain actual closed closures for negative tests; no replacement store,
    // factory, receipt or callback publisher is created.
    const retainedApi = Object.freeze({ ...value, composeNativeWorker: input => {
      composed = value.composeNativeWorker(input); return composed;
    } });
    const installed = normalInstaller(apiTransform(retainedApi)); operations = installed.operations; return installed;
  });
  child = ctx.plugin(createRuntimePlugin({ identity: () => identity, encryptionKey: () => Buffer.alloc(32, 89),
    forbiddenSecrets: ['SYNTHETIC_PRIVATE_CANARY_MANAGER'],
    memory: { namespaceRef: ref('memory'), tokenize: text => Buffer.byteLength(text), byteLimit: 65536, tokenLimit: 8192 },
    ...(normal ? { installedWorkerInstaller } : {}) }), { databasePath: join(directory, 'manager.sqlite'), limits: { maxMetadataBytes: 4096 } });
  await child;
  let sequence = 0;
  const rpc = async (command, payload = {}, { authenticated = true, responseReady } = {}) => {
    const method = 'v1/' + command;
    const request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'independent-' + ++sequence, method, payload }))]);
    Object.assign(request, { method: 'POST', url: '/df-rpc/' + method,
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-fixture-owner': authenticated ? 'synthetic-approved' : 'synthetic-denied' } });
    const response = new Response(); responseReady?.(response);
    await server.prefixes.get('/df-rpc').handler(request, response);
    const text = Buffer.concat(response.parts).toString();
    return { status: response.statusCode, text, ...(text && response.statusCode === 200 ? JSON.parse(text).result : {}) };
  };
  const ok = async (name, value = {}) => { const result = await rpc(name, value); assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
  const direct = (name, value, current = allowed) => operations[name](value, { assertCurrent: current });
  const gate = () => { const value = deferred(); releases.push(value.release); return value; };
  const spy = (proto, method, wrapper) => { const restore = instrument(proto, method, wrapper); restores.push(restore); return restore; };
  return { ctx, directory, child, rpc, ok, direct, gate, spy, close,
    api: () => api, manager: () => composed, operations: () => operations,
    snapshot: taskRef => ok('status', { taskRef }), facts: () => facts(directory),
    status: () => child.ctx.df.diagnostics(), noListener: () => assert.equal(server.server, undefined) };
}
async function planned(f, label, goal = 'Independent approved 中文🚀 context') {
  const policy = await f.ok('workerPolicyPreview', { expectedPolicyVersion: 1 });
  await f.ok('workerPolicyConfirm', { previewRef: policy.previewRef, planDigest: policy.planDigest, commandRef: ref(label + ':policy'), expectedPolicyVersion: 1, accept: true });
  const intake = await f.ok('intake', { taskId: label, provider: 'synthetic', source: 'manager-fixture', eventId: label,
    commandRef: ref(label + ':intake'), goal });
  const taskRef = intake.task.taskRef;
  const cas = async tag => { const { task } = await f.snapshot(taskRef); return { taskRef, commandRef: ref(label + ':' + tag), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch }; };
  const context = await f.ok('prepareContext', { ...await cas('context'), terms: [], now: Date.now() });
  const action = await f.ok('workerPlan', { ...await cas('plan'), contextRecordRef: context.recordRef });
  const binding = await cas('preview');
  const preview = await f.ok('workerPreview', { taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest,
    recordRef: context.recordRef, expectedTaskVersion: binding.expectedTaskVersion, expectedAuthEpoch: binding.expectedAuthEpoch });
  await f.ok('workerGrant', { ...await cas('grant'), actionRef: action.actionRef, actionDigest: action.actionDigest,
    expiresAt: Date.now() + 59000, previewRef: preview.previewRef, accept: true });
  const createInput = async () => ({ ...await cas('create'), actionRef: action.actionRef, actionDigest: action.actionDigest });
  return { taskRef, action, context, cas, createInput };
}
async function running(f, p, current = allowed) {
  const created = await f.direct('workerCreate', await p.createInput(), current);
  const refs = { taskRef: p.taskRef, actionRef: p.action.actionRef, claimRef: created.worker.claimRef, generationRef: created.worker.generationRef };
  return { refs, created, executeInput: async () => ({ ...await p.cas('execute'), ...refs,
    actionDigest: p.action.actionDigest, contextRecordRef: p.context.recordRef }) };
}
async function executed(f, p) {
  const row = await running(f, p), result = await f.direct('workerExecute', await row.executeInput());
  assert.equal(result.execution.state, 'committed');
  return { ...row, result, executionRef: result.execution.executionRef,
    executionInput: async tag => ({ ...await p.cas(tag), ...row.refs, executionRef: result.execution.executionRef }) };
}
const rejects = (promise, code) => assert.rejects(promise, { code });
const phaseCounts = events => Object.fromEntries(['user/message', 'assistant/message', 'assistant/attempt', 'turn/start', 'turn/end', 'tool/result'].map(type => [type, events.filter(e => e.type === type).length]));
async function originalLog(f, id) {
  const session = f.ctx.sessions.get(id);
  if (session) assert.equal(await f.ctx.sessions.flush(session), true);
  const reader = await f.ctx.sessionPersistence.open(id, 'read');
  try { assert.equal(reader.id, id); assert.equal(reader.access, 'read'); return (await reader.read(0, 128)).events; }
  finally { await reader.close(); }
}

test('M01 actual normal chain: independent bytes, original receivers/receipts and factual stop accounting', timeout, async t => {
  const f = await fixture(t), calls = [], streamRequests = [], flushes = [];
  const methods = ['snapshot', 'readData', 'assertClaimCurrent', 'claimAction', 'beginContextExecution', 'assertExecutionCurrent', 'writeArtifact', 'settleAction', 'control', 'putHandoff', 'workerObservation'];
  for (const method of methods) f.spy(RuntimeStore.prototype, method, fn => function (...args) {
    assert.ok(this instanceof RuntimeStore); const value = Reflect.apply(fn, this, args);
    calls.push({ method, receiver: this, handle: args[0], input: args[1], receipt: value }); return value;
  });
  f.spy(Sessions.prototype, 'flush', fn => function (session) { flushes.push(session); return Reflect.apply(fn, this, [session]); });
  const remove = f.ctx.on('llm/stream', (options, next) => { streamRequests.push(structuredClone(options.messages)); return next(); }); t.after(remove);
  assert.equal(f.facts().schema, 5); assert.equal(f.ctx.sessions.list().length, 0); assert.equal(streamRequests.length, 0);
  const p = await planned(f, 'm01'), r = await running(f, p), nativeId = 'df-' + r.refs.generationRef;
  assert.equal(r.created.worker.phase, 'ready'); assert.equal(original(f.ctx.agents.get(nativeId)).status, 'idle');
  assert.equal(streamRequests.length, 0); assert.equal(f.facts().intents, 0);
  const { commandRef: contextReadCommand, ...contextReadCAS } = await p.cas('context-read');
  const contextRead = await f.ok('detail', { ...contextReadCAS, recordRef: p.context.recordRef });
  const body = contextRead.data.content, expected = `Synthetic local result; approved input SHA-256: ${sha(body)}.`;
  assert.equal(sha(body), p.context.digest); assert.match(body, /中文🚀/);
  const result = await f.direct('workerExecute', await r.executeInput());
  assert.equal(result.execution.state, 'committed'); assert.equal(streamRequests.length, 1);
  assert.equal(streamRequests[0][1].content[0].text, body);
  const expectedUnits = Buffer.byteLength(JSON.stringify(streamRequests[0])) + Buffer.byteLength(expected);
  assert.equal(result.execution.usage.units, expectedUnits); assert.equal(result.execution.resultDigest, sha(expected));
  assert.equal(f.facts().intents, 1); assert.deepEqual(f.facts().attempts, [1]);
  const capture = await f.direct('workerCapture', { ...await p.cas('capture'), ...r.refs, executionRef: result.execution.executionRef });
  assert.ok(flushes.some(session => original(session) === original(f.ctx.sessions.get(nativeId))));
  const events = await originalLog(f, nativeId);
  assert.deepEqual(phaseCounts(events), { 'user/message': 1, 'assistant/message': 1, 'assistant/attempt': 0, 'turn/start': 1, 'turn/end': 1, 'tool/result': 0 });
  const assistant = events.find(e => e.type === 'assistant/message');
  assert.equal(assistant.seq, result.execution.cursor); assert.equal(assistant.data.message.content[0].text, expected);
  assert.equal(assistant.data.usage.totalTokens, expectedUnits);
  const readCAS = await p.cas('result');
  const read = await f.direct('workerResult', { taskRef: p.taskRef, artifactRef: capture.artifactRef, version: 1,
    expectedTaskVersion: readCAS.expectedTaskVersion, expectedAuthEpoch: readCAS.expectedAuthEpoch });
  assert.equal(read.content, expected); assert.equal(read.source.inputDigest, sha(body)); assert.equal(read.source.resultDigest, sha(expected));
  const { commandRef: artifactReadCommand, ...artifactReadCAS } = await p.cas('artifact-read');
  const raw = await f.ok('detail', { ...artifactReadCAS, recordRef: capture.recordRef });
  assert.equal(sha(raw.data.content), capture.digest); assert.equal(JSON.parse(raw.data.content).source.cursor, assistant.seq);
  assert.equal(f.facts().reservations, 1); assert.equal(f.facts().artifacts, 1);
  const finish = await f.direct('workerFinish', { ...await p.cas('finish'), ...r.refs, executionRef: result.execution.executionRef });
  assert.equal(finish.outcome, 'completed'); assert.equal(finish.reservationHeld, false);
  assert.equal(f.ctx.agents.list().length, 0); assert.equal(f.ctx.sessions.list().length, 0); assert.equal(f.facts().reservations, 0);
  assert.deepEqual(f.facts().attempts, [1]); assert.notEqual((await f.snapshot(p.taskRef)).task.status, 'completed');
  const mutations = calls.filter(x => ['claimAction', 'beginContextExecution', 'assertExecutionCurrent', 'writeArtifact', 'settleAction'].includes(x.method));
  assert.deepEqual(mutations.map(x => x.method), ['claimAction', 'beginContextExecution', 'assertExecutionCurrent', 'writeArtifact', 'settleAction']);
  assert.equal(new Set(calls.map(x => x.receiver)).size, 1);
  assert.equal(calls.find(x => x.method === 'claimAction').handle, calls.find(x => x.method === 'writeArtifact').handle);
  assert.equal(calls.find(x => x.method === 'beginContextExecution').handle, calls.find(x => x.method === 'settleAction').handle);
  assert.notEqual(calls.find(x => x.method === 'claimAction').handle, calls.find(x => x.method === 'settleAction').handle);
  assert.equal(capture, calls.find(x => x.method === 'writeArtifact').receipt, 'actual original artifact receipt identity is forwarded');
  assert.deepEqual(finish, calls.find(x => x.method === 'settleAction').receipt);
  assert.equal(calls.filter(x => x.method === 'putHandoff').length, 0);
  f.noListener();
});

test('M02 carrier partitions require literal true and retain the first bounded denial', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm02'), input = await p.createInput(), before = f.facts();
  for (const current of [() => false, () => 1, () => Promise.resolve(true), () => { throw new Error('SYNTHETIC_PRIVATE_CANARY_MANAGER'); }, () => { throw new BootstrapError('OPERATOR_REQUIRED'); }]) {
    await rejects(f.direct('workerCreate', input, current), current.toString().includes('OPERATOR_REQUIRED') ? 'OPERATOR_REQUIRED' : 'SERVICE_DISPOSED');
  }
  assert.deepEqual(f.facts(), before); assert.equal(f.ctx.agents.list().length, 0);
  let current = true, token;
  await runInstalledWorkerInvocation(f.api().ctx, () => { if (!current) throw new BootstrapError('REQUEST_ABORTED'); return true; }, () => { token = captureInstalledWorkerInvocation(f.api().ctx); });
  current = false; assert.throws(() => withInstalledWorkerInvocation(f.api().ctx, token, () => true), { code: 'REQUEST_ABORTED' });
  current = true; assert.throws(() => withInstalledWorkerInvocation(f.api().ctx, token, () => true), { code: 'REQUEST_ABORTED' });
  const malformed = await f.rpc('workerCreate', { ...input, assertCurrent: true, observation: ref('forged-receipt') });
  assert.equal(malformed.ok, false); assert.deepEqual(malformed.error.details, {});
  assert.doesNotMatch(malformed.text, /SYNTHETIC_PRIVATE_CANARY_MANAGER|encryptionKey|hostHandle|assertCurrent/);
  assert.deepEqual(f.facts(), before);
});

test('M03 real retained manager closures reject missing/copied/foreign carrier with zero effects', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm03'); await running(f, p);
  const before = f.facts(), manager = f.manager();
  for (const method of ['dispatch', 'executeContext', 'query', 'sessionLink', 'captureResult', 'finishExecution']) {
    assert.throws(() => manager[method]({}), { code: 'SERVICE_DISPOSED' });
  }
  let token;
  await runInstalledWorkerInvocation(f.api().ctx, allowed, () => { token = captureInstalledWorkerInvocation(f.api().ctx); });
  assert.throws(() => withInstalledWorkerInvocation(f.api().ctx, { ...token }, () => manager.query({})), { code: 'SERVICE_DISPOSED' });
  await rejects(runInstalledWorkerInvocation(new Context(), allowed, () => manager.query({})), 'SERVICE_DISPOSED');
  assert.deepEqual(f.facts(), before);
});

test('M04 prepare-first loss refuses claim and captures immutable caller input', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm04'), gate = f.gate(); let denial = false, seen;
  f.spy(NativeAdapter.prototype, 'prepare', fn => async function (...args) { const ticket = await Reflect.apply(fn, this, args); seen = args; await gate.wait(); return ticket; });
  const input = await p.createInput(), expectedAction = input.actionRef;
  const pending = f.direct('workerCreate', input, () => { if (denial) throw new BootstrapError('REQUEST_ABORTED'); return true; });
  const checked = rejects(pending, 'REQUEST_ABORTED'); await gate.entered;
  input.actionRef = ref('mutated-action'); input.taskRef = ref('mutated-task'); input.expectedTaskVersion = 999;
  denial = true; gate.release(); await checked;
  assert.equal(seen[0].actionRef, expectedAction); assert.equal(seen[1].taskRef, p.taskRef);
  assert.equal(f.facts().reservations, 0); assert.equal(f.facts().workers.length, 0); assert.equal(f.facts().intents, 0);
  assert.equal(f.ctx.sessions.list().length, 0); assert.equal(existsSync(join(f.directory, 'original-jsonl')), false);
});

test('M05 reverse completion keeps separate live carriers and aborts only original A', timeout, async t => {
  const a = await fixture(t), b = await fixture(t), pa = await planned(a, 'm05-a'), pb = await planned(b, 'm05-b');
  const gate = a.gate(); let loss = false;
  a.spy(NativeAdapter.prototype, 'prepare', fn => async function (...args) { const ticket = await Reflect.apply(fn, this, args); if (args[1].taskRef === pa.taskRef) await gate.wait(); return ticket; });
  const pendingA = a.direct('workerCreate', await pa.createInput(), () => { if (loss) throw new BootstrapError('OPERATOR_REQUIRED'); return true; });
  const checkedA = rejects(pendingA, 'OPERATOR_REQUIRED'); await gate.entered;
  const rb = await running(b, pb); assert.equal(rb.created.worker.phase, 'ready'); loss = true; gate.release(); await checkedA;
  assert.equal(a.facts().reservations, 0); assert.equal(a.ctx.agents.list().length, 0);
  assert.equal(b.facts().reservations, 1); assert.equal(b.ctx.agents.list().length, 1);
  const query = await b.direct('workerQuery', rb.refs); assert.equal(query.worker.phase, 'ready');
});

test('M06 fresh query and execution never reuse an expired create callback', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm06'); let valid = true, oldChecks = 0;
  const r = await running(f, p, () => { oldChecks++; if (!valid) throw new BootstrapError('REQUEST_ABORTED'); return true; });
  const checkpoint = oldChecks; valid = false;
  const before = f.facts(); for (let i = 0; i < 3; i++) assert.equal((await f.direct('workerQuery', r.refs)).worker.phase, 'ready');
  assert.deepEqual(f.facts(), before); assert.equal(oldChecks, checkpoint);
  const result = await f.direct('workerExecute', await r.executeInput()); assert.equal(result.execution.state, 'committed');
  assert.equal(oldChecks, checkpoint); assert.equal(f.facts().intents, 1); assert.equal(f.facts().reservations, 1);
});

test('M07 inner gate after actual outer readonly admission refuses all provider output', timeout, async t => {
  let denied = false, currentCalls = 0;
  const f = await fixture(t, { apiTransform: api => Object.freeze({ ...api, assertNativeRequestCurrent(value) {
    const result = api.assertNativeRequestCurrent(value); currentCalls++; denied = true; return result;
  } }) });
  const p = await planned(f, 'm07'), r = await running(f, p);
  const pending = f.direct('workerExecute', await r.executeInput(), () => { if (denied) throw new BootstrapError('REQUEST_ABORTED'); return true; });
  await rejects(pending, 'REQUEST_ABORTED'); assert.equal(currentCalls, 1, 'outer original readonly check succeeded before inner denied carrier');
  const id = 'df-' + r.refs.generationRef, events = await originalLog(f, id), counts = phaseCounts(events);
  assert.equal(counts['user/message'], 1); assert.equal(counts['assistant/message'], 0); assert.equal(counts['assistant/attempt'], 1);
  const snapshot = await f.snapshot(p.taskRef); assert.equal(snapshot.executions[0].state, 'dispatch_intent');
  assert.equal(f.facts().reservations, 1); assert.equal(f.facts().artifacts, 0);
  assert.equal((await f.rpc('workerCapture', { ...await p.cas('capture'), ...r.refs, executionRef: snapshot.executions[0].executionRef })).ok, false);
});

test('M08 actual validation flush precedes owner loss with zero artifact and retained source result', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm08'), r = await executed(f, p), gate = f.gate(); let loss = false, sessionSeen;
  f.spy(Sessions.prototype, 'flush', fn => async function (session) { const result = await Reflect.apply(fn, this, [session]); sessionSeen = session; await gate.wait(); return result; });
  const pending = f.direct('workerCapture', await r.executionInput('capture'), () => { if (loss) throw new BootstrapError('OPERATOR_REQUIRED'); return true; });
  const checked = rejects(pending, 'OPERATOR_REQUIRED'); await gate.entered;
  assert.equal(original(sessionSeen), original(f.ctx.sessions.get('df-' + r.refs.generationRef)));
  loss = true; gate.release(); await checked;
  assert.equal(f.facts().artifacts, 0); assert.equal(f.facts().reservations, 1);
  const events = await originalLog(f, 'df-' + r.refs.generationRef); assert.equal(phaseCounts(events)['assistant/message'], 1);
  const source = events.find(e => e.type === 'assistant/message'); assert.equal(sha(source.data.message.content[0].text), r.result.execution.resultDigest);
});

test('M09 actual stopped facts survive denial; pending finish cannot replay stop or settlement', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm09'), r = await executed(f, p);
  await f.direct('workerCapture', await r.executionInput('capture'));
  const gate = f.gate(); let denial = false, stops = 0, settlements = 0;
  f.spy(NativeAdapter.prototype, 'finishExecution', fn => async function (...args) { const result = await Reflect.apply(fn, this, args); await gate.wait(); return result; });
  f.spy(NativeAdapter.prototype, 'dispose', fn => function (...args) { stops++; return Reflect.apply(fn, this, args); });
  f.spy(RuntimeStore.prototype, 'settleAction', fn => function (...args) { settlements++; return Reflect.apply(fn, this, args); });
  const input = await r.executionInput('finish'), pending = f.direct('workerFinish', input, () => { if (denial) throw new BootstrapError('REQUEST_ABORTED'); return true; });
  const checked = rejects(pending, 'REQUEST_ABORTED'); await gate.entered;
  assert.equal(f.facts().workers[0].phase, 'stopped'); assert.equal(f.ctx.sessions.list().length, 0);
  await rejects(f.direct('workerFinish', { ...input, commandRef: ref('m09:duplicate-pending') }), 'WORKER_FINISH_UNAVAILABLE');
  assert.equal(stops, 1); assert.equal(settlements, 0); denial = true; gate.release(); await checked;
  await rejects(f.direct('workerFinish', await r.executionInput('later-finish')), 'WORKER_FINISH_UNAVAILABLE');
  assert.equal(stops, 1); assert.equal(settlements, 0); assert.equal(f.facts().reservations, 1);
  assert.equal((await f.direct('workerQuery', r.refs)).worker.phase, 'stopped');
});

test('M10 admission seals before original shutdown, owned stop drains before store close', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm10'); let priorValid = true;
  await running(f, p, () => { if (!priorValid) throw new BootstrapError('REQUEST_ABORTED'); return true; }); priorValid = false;
  const gate = f.gate(), trace = [];
  f.spy(NativeAdapter.prototype, 'shutdown', fn => async function (...args) { trace.push('shutdown-enter'); await gate.wait(); const result = await Reflect.apply(fn, this, args); trace.push('shutdown-return'); return result; });
  f.spy(RuntimeStore.prototype, 'workerObservation', fn => function (...args) { const result = Reflect.apply(fn, this, args); trace.push('observation:' + args[1].phase); return result; });
  f.spy(RuntimeStore.prototype, 'close', fn => function (...args) { trace.push('store-close'); return Reflect.apply(fn, this, args); });
  const closing = f.close(); await gate.entered;
  await rejects(f.direct('workerCatalog', {}), 'SERVICE_DISPOSED'); assert.throws(() => f.manager().query({}), { code: 'SERVICE_DISPOSED' });
  assert.equal(f.facts().reservations, 1); gate.release(); await closing;
  assert.equal(f.facts().workers[0].phase, 'stopped'); assert.equal(f.facts().reservations, 1); assert.equal(f.ctx.agents.list().length, 0);
  assert.ok(trace.indexOf('observation:stopped') > trace.indexOf('shutdown-enter'));
  assert.ok(trace.lastIndexOf('observation:stopped') < trace.indexOf('store-close'));
  assert.ok(trace.indexOf('shutdown-return') < trace.indexOf('store-close'));
  await rejects(f.direct('workerCatalog', {}), 'SERVICE_DISPOSED');
});

test('M11 copied tickets and copied native event identities cannot become actual owned facts', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm11'); let adapter, ticket;
  f.spy(NativeAdapter.prototype, 'prepare', fn => async function (...args) { adapter = this; ticket = await Reflect.apply(fn, this, args); return ticket; });
  const r = await running(f, p), before = f.facts(), agent = f.ctx.agents.get('df-' + r.refs.generationRef);
  assert.throws(() => adapter.query({ ...ticket }), { code: 'WORKER_INVALID' });
  f.ctx.emit('agent/disposed', { agent: { id: agent.id, session: agent.session, status: 'idle' } });
  f.ctx.emit('session/event', { id: agent.session.id }, { seq: 99, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'forged' }] } } });
  assert.deepEqual(f.facts(), before); assert.equal((await f.direct('workerQuery', r.refs)).worker.phase, 'ready');
  assert.equal(f.ctx.agents.list().length, 1); assert.equal(f.facts().artifacts, 0); assert.equal(f.facts().intents, 0);
});

test('M12 a fresh original query returns its observation task version and repeating it is readonly', timeout, async t => {
  const gate = deferred(); let lose = false;
  const f = await fixture(t, { apiTransform: api => Object.freeze({ ...api, composeNativeWorker: value => api.composeNativeWorker({ ...value,
    nativeHooks: { ...value.nativeHooks, async commitAgent(...args) { const result = await value.nativeHooks.commitAgent(...args); await gate.wait(); return result; } } }) }) });
  t.after(gate.release);
  const p = await planned(f, 'm12'), pending = f.direct('workerCreate', await p.createInput(), () => { if (lose) throw new BootstrapError('OPERATOR_REQUIRED'); return true; });
  const checked = rejects(pending, 'OPERATOR_REQUIRED'); await gate.entered; lose = true; gate.release(); await checked;
  const before = await f.snapshot(p.taskRef), worker = before.workers[0], refs = { taskRef: p.taskRef, actionRef: p.action.actionRef, claimRef: worker.claimRef, generationRef: worker.generationRef };
  const prior = f.facts(), query = await f.direct('workerQuery', refs), after = await f.snapshot(p.taskRef);
  assert.equal(query.worker.phase, 'unknown'); assert.equal(after.task.status, 'recovery_required');
  assert.equal(query.task.version, after.task.version); assert.deepEqual(query.task, after.task);
  assert.ok(after.task.version > before.task.version); assert.equal(f.facts().commands, prior.commands + 1);
  const final = f.facts(); assert.deepEqual((await f.direct('workerQuery', refs)).task, after.task); assert.deepEqual(f.facts(), final);
  assert.equal(final.reservations, 1); assert.equal(final.intents, 0); assert.equal(f.ctx.agents.list().length, 0);
});

test('M13 six aliases deny before and after composition; original task/memory remains usable', timeout, async t => {
  const f = await fixture(t); let nativeCalls = 0, handoffs = 0;
  for (const method of ['prepare', 'executeContext', 'query', 'dispose']) f.spy(NativeAdapter.prototype, method, fn => function (...args) { nativeCalls++; return Reflect.apply(fn, this, args); });
  f.spy(RuntimeStore.prototype, 'putHandoff', fn => function (...args) { handoffs++; return Reflect.apply(fn, this, args); });
  const denyAliases = async () => { const before = f.facts(), count = nativeCalls; for (const name of ['dispatch', 'execute', 'query', 'sessionLink', 'handoff', 'captureResult']) {
    const reply = await f.rpc(name, { taskRef: ref('wire-forgery'), commandRef: ref('wire-command'), phase: 'stopped', evidenceRef: ref('wire-evidence') });
    assert.equal(reply.error.code, 'WORKER_REQUEST_DENIED'); assert.deepEqual(reply.error.details, {});
  } assert.deepEqual(f.facts(), before); assert.equal(nativeCalls, count); assert.equal(handoffs, 0); };
  await denyAliases(); const p = await planned(f, 'm13'); await running(f, p); await denyAliases();
  const memory = await f.ok('memoryRead'); assert.equal(memory.namespaceRef, ref('memory'));
  assert.equal((await f.snapshot(p.taskRef)).task.taskRef, p.taskRef); assert.equal(f.status().capabilities.memory, true);
  assert.doesNotMatch(JSON.stringify(f.status()), /SYNTHETIC_PRIVATE_CANARY_MANAGER|assertCurrent|hostHandle|encryptionKey/);
});

test('M14 original response close during preparation denies claim with read-first durable facts', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm14'), gate = f.gate(); let response;
  f.spy(NativeAdapter.prototype, 'prepare', fn => async function (...args) { const result = await Reflect.apply(fn, this, args); await gate.wait(); return result; });
  const before = f.facts(), pending = f.rpc('workerCreate', await p.createInput(), { responseReady: value => { response = value; } });
  await gate.entered; response.emit('close'); gate.release(); const result = await pending;
  assert.equal(result.text, ''); assert.deepEqual(f.facts(), before); assert.equal(f.ctx.sessions.list().length, 0);
  assert.equal((await f.snapshot(p.taskRef)).workers.length, 0); f.noListener();
});

test('M15 original response loss after control preserves actual held stop and no second effect', timeout, async t => {
  const f = await fixture(t), p = await planned(f, 'm15'), r = await running(f, p); let response, stops = 0, controls = 0;
  f.spy(RuntimeStore.prototype, 'control', fn => function (...args) { controls++; return Reflect.apply(fn, this, args); });
  const remove = f.ctx.on('agent/disposed', ({ agent }) => { if (agent.id === 'df-' + r.refs.generationRef) { stops++; response.emit('close'); } }); t.after(remove);
  const before = f.facts(), result = await f.rpc('control', { ...await p.cas('cancel'), kind: 'cancel' }, { responseReady: value => { response = value; } });
  assert.equal(result.text, ''); assert.equal(stops, 1); assert.equal(controls, 1);
  const snapshot = await f.snapshot(p.taskRef); assert.equal(snapshot.task.status, 'cancel_requested'); assert.equal(snapshot.workers[0].phase, 'stopped');
  assert.equal(f.facts().reservations, 1); assert.equal(f.facts().artifacts, 0); assert.equal(f.facts().intents, 0);
  assert.ok(f.facts().commands > before.commands); const committed = f.facts();
  const query = await f.direct('workerQuery', r.refs); assert.equal(query.worker.phase, 'stopped');
  assert.deepEqual(f.facts(), committed); assert.equal(stops, 1); assert.equal(controls, 1); f.noListener();
});

test('M16 absent installed mode preserves unrelated generic operations and readonly diagnostics', timeout, async t => {
  const f = await fixture(t, { normal: false });
  assert.equal(f.status().capabilities.worker, false); assert.equal(f.status().capabilities.memory, true);
  assert.equal(f.ctx.sessions.list().length, 0); const before = f.facts();
  await f.ok('memoryRead'); f.status(); assert.deepEqual(f.facts(), before);
  const intake = await f.ok('intake', { taskId: 'm16', provider: 'synthetic', source: 'independent', eventId: 'm16', commandRef: ref('m16:intake'), goal: 'Generic task without installed worker' });
  const { task } = await f.snapshot(intake.task.taskRef);
  const control = await f.ok('control', { taskRef: task.taskRef, commandRef: ref('m16:pause'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, kind: 'pause' });
  assert.equal(control.receipt.control, 'paused'); assert.deepEqual(control.workers, []);
  assert.equal((await f.rpc('workerCatalog')).ok, false); assert.equal(f.facts().reservations, 0); assert.equal(f.ctx.sessions.list().length, 0); f.noListener();
});
