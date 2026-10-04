import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createCipheriv } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync, symlinkSync, readlinkSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script, createContext } from 'node:vm';
import { Readable, Writable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { fixtureDatabasePath } from '../scripts/dsh-web.mjs';
import { FishballMemoryCore, MEMORY_VERSION, LEGACY_MEMORY_VERSION } from '../src/fishball-memory-core.mjs';
import { MemoryAdapter, MEMORY_PROJECTION_VERSION, LEGACY_MEMORY_PROJECTION_VERSION } from '../src/memory.mjs';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { createPlugin, name as nativeName } from '../src/index.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { installOperatorBridge } from '../src/operator-bridge.mjs';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { NativeAdapter } from '../src/native-adapter.mjs';
import { EnvironmentRegistry } from '../src/environment.mjs';

// Rename-only development fixtures. All contents/keys/callers are synthetic;
// no server, profile, browser, model/provider, network or real account is used.
const sha = value => createHash('sha256').update(value).digest('hex');
const scope = { ownerRef: sha('rename-owner'), workspaceRef: sha('rename-workspace') };
const secret = 'RENAME-INDEPENDENT-SYNTHETIC-CANARY';
function directory(t) { const path = mkdtempSync(join(tmpdir(), 'df-rename-independent-')); t.after(() => rmSync(path, { recursive: true, force: true })); return path; }
function bytesAt(path) { return new Map(readdirSync(path).sort().map(name => [name, readFileSync(join(path, name))])); }
function unchanged(path, before) { assert.deepEqual(readdirSync(path).sort(), [...before.keys()]); for (const [name, bytes] of before) assert.deepEqual(readFileSync(join(path, name)), bytes); }

test('independent rename paths: empty/current/legacy/both partitions never rewrite or silently select another store', t => {
  for (const state of ['empty', 'current', 'legacy', 'both']) {
    const home = directory(t), current = join(home, 'dsh-fishball.sqlite'), legacy = join(home, 'bubbles.sqlite');
    if (state === 'current' || state === 'both') writeFileSync(current, Buffer.from([0, 1, 2, 255, 10]));
    if (state === 'legacy' || state === 'both') writeFileSync(legacy, Buffer.from('synthetic legacy bytes\0中文', 'utf8'));
    const before = bytesAt(home);
    if (state === 'both') assert.throws(() => fixtureDatabasePath(home), { message: 'STORE_PATH_AMBIGUOUS' });
    else assert.equal(fixtureDatabasePath(home), state === 'legacy' ? legacy : current);
    unchanged(home, before);
  }
});

test('independent rename encrypted path: sole legacy basename reads existing v2 without rehashing IDs, new file or authority change', t => {
  const home = directory(t), owner = {}, foreign = {}, host = {}, key = Buffer.alloc(32, 43);
  const config = { databasePath: join(home, 'bubbles.sqlite'), encryptionKey: key, clock: () => 100,
    principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'rename-owner', workspaceId: 'rename-workspace' } },
      { handle: host, role: 'host', scope: { ownerId: 'rename-owner', workspaceId: 'rename-workspace' } },
      { handle: foreign, role: 'owner', scope: { ownerId: 'foreign-owner', workspaceId: 'rename-workspace' } }] };
  let store = new RuntimeStore(config); t.after(() => store.close());
  const content = 'Synthetic approved content 中文', task = store.intake(owner, { taskId: 'original-task', provider: 'fixture', source: 'original-source', eventId: 'original-event', commandRef: reference('original-command'), goal: content }).task;
  const [record] = store.listData(owner, { taskRef: task.taskRef });
  assert.equal(record.cryptoVersion, 2); store.close(); const before = bytesAt(home);
  store = new RuntimeStore({ ...config, databasePath: fixtureDatabasePath(home) });
  assert.deepEqual(store.task(owner, task.taskRef), task);
  const read = store.readData(owner, { taskRef: task.taskRef, recordRef: record.recordRef });
  assert.equal(read.content, content); assert.equal(read.digest, sha(content)); assert.equal(read.recordRef, record.recordRef);
  assert.throws(() => store.task(foreign, task.taskRef), { code: 'TASK_NOT_FOUND' });
  assert.throws(() => store.task({ role: 'owner', ...scope }, task.taskRef), { code: 'UNAUTHORIZED' });
  assert.equal(existsSync(join(home, 'dsh-fishball.sqlite')), false); store.close(); unchanged(home, before);
});

function currentMemory() {
  const core = new FishballMemoryCore({ scope });
  core.recordWorldFact({ id: 7, question: '合成问题', answer: 'Synthetic answer', ttl: 'ONE_MONTH', tier: 'LOW', recordedAt: 1000 });
  core.recordPreference({ id: 9, text: 'Synthetic preference', kind: 'CURRENT_STATE', ttl: 'SIX_MONTHS', recordedAt: 1001, confirmedAt: 1002 });
  core.appendTurn({ id: 11, sessionId: 4, at: 1003, speaker: 'USER', text: 'Synthetic retired turn' }); core.dropTurns([11]);
  core.saveSession({ id: 4, startedAt: 900, bridge: 'synthetic session bridge', compactedThrough: 11 });
  return core.snapshot();
}
function legacyMemory() { return { ...currentMemory(), contractVersion: LEGACY_MEMORY_VERSION }; }

test('independent rename memory: exact prior label normalizes in memory with IDs/session/facts preserved and zero persistence', () => {
  const prior = legacyMemory(), source = JSON.stringify(prior); let writes = 0;
  const core = new FishballMemoryCore({ scope, snapshotText: source, persist() { writes++; throw Error('UNEXPECTED_RENAME_WRITE'); } });
  assert.deepEqual(core.snapshot(), currentMemory()); assert.equal(core.snapshot().contractVersion, MEMORY_VERSION);
  assert.equal(core.snapshot().idSeq, 11); assert.equal(core.snapshot().world[0].id, 7); assert.equal(core.snapshot().preferences[0].id, 9);
  assert.deepEqual(core.loadSession(), prior.session); assert.equal(core.turnCount(), 0);
  assert.equal(JSON.stringify(prior), source); assert.equal(writes, 0);
  const returned = core.snapshot(); returned.world[0].answer = secret;
  assert.equal(core.snapshot().world[0].answer, 'Synthetic answer'); assert.equal(writes, 0);
});

test('independent rename memory rejection: future/near-label/cross-owner/workspace and extra fields never gain compatibility', () => {
  const prior = legacyMemory(); let writes = 0;
  for (const version of ['bubbles.fishball-memory/v2', 'df.fishball-memory/v2', 'bubbles.fishball-memory/v1 ', 'df.fishball-memory/v1\n', 'bubbles.fishball-memory', '', null]) {
    assert.throws(() => new FishballMemoryCore({ scope, snapshotText: JSON.stringify({ ...prior, contractVersion: version }), persist() { writes++; return true; } }), { code: 'MEMORY_SCOPE' });
  }
  for (const key of ['ownerRef', 'workspaceRef']) assert.throws(() => new FishballMemoryCore({ scope, snapshotText: JSON.stringify({ ...prior, scope: { ...scope, [key]: sha(`foreign-${key}`) } }) }), { code: 'MEMORY_SCOPE' });
  assert.throws(() => new FishballMemoryCore({ scope, snapshotText: JSON.stringify({ ...prior, owner: true }) }), { code: 'MEMORY_INVALID' });
  assert.equal(writes, 0);
});

function projectionFixture() {
  const handle = {}, namespaceRef = sha('namespace'); let writes = 0;
  const projection = { contractVersion: LEGACY_MEMORY_PROJECTION_VERSION, scope, core: legacyMemory(), facts: [
    { id: 7, kind: 'world', revision: 2, previousRevision: 1, sourceRefs: [sha('source-7')], observedAt: 1000, confidence: 0.5, deleted: false, conflictRefs: [sha('conflict')] },
    { id: 9, kind: 'preference', revision: 1, sourceRefs: [sha('source-9')], observedAt: 1001, confidence: 1, deleted: false, conflictRefs: [] },
    { id: 11, kind: 'turn', revision: 2, previousRevision: 1, sourceRefs: [sha('source-11')], observedAt: 1003, confidence: 1, deleted: true, conflictRefs: [] },
  ] };
  const row = { ...scope, namespaceRef, revision: 5, recordRef: sha('memory-record'), deleted: false, createdAt: 1000, updatedAt: 1004 };
  const set = value => { row.content = JSON.stringify(value); row.digest = sha(row.content); };
  set(projection);
  const store = { memoryBinding(caller) { assert.equal(caller, handle); return { ...scope, role: 'owner' }; },
    getMemory(caller, input) { assert.equal(caller, handle); assert.deepEqual(input, { namespaceRef }); return structuredClone(row); },
    listMemory() { return []; }, memoryCommandReceipt() { return null; },
    putMemory() { writes++; throw Error('UNEXPECTED_RENAME_WRITE'); }, deleteMemory() { writes++; throw Error('UNEXPECTED_RENAME_DELETE'); } };
  const adapter = new MemoryAdapter({ store, handle, namespaceRef });
  return { projection, row, set, adapter, writes: () => writes };
}

test('independent rename projection: exact old/current label combinations preserve revisions/sources/tombstones without writes', () => {
  const f = projectionFixture();
  for (const outer of [LEGACY_MEMORY_PROJECTION_VERSION, MEMORY_PROJECTION_VERSION]) for (const inner of [LEGACY_MEMORY_VERSION, MEMORY_VERSION]) {
    f.set({ ...f.projection, contractVersion: outer, core: { ...f.projection.core, contractVersion: inner } });
    const original = structuredClone(f.row), state = f.adapter.state();
    assert.equal(state.revision, 5); assert.equal(state.projection.contractVersion, MEMORY_PROJECTION_VERSION);
    assert.equal(state.projection.core.contractVersion, MEMORY_VERSION); assert.equal(state.projection.core.idSeq, 11);
    assert.deepEqual(state.projection.facts, f.projection.facts); assert.deepEqual(state.projection.core.session, f.projection.core.session);
    assert.deepEqual(f.row, original); assert.equal(f.writes(), 0);
  }
});

test('independent rename projection rejection: future/cross-scope/corrupt content is never persisted or silently relabeled', () => {
  const f = projectionFixture();
  for (const outer of ['bubbles.memory-projection/v2', 'df.memory-projection/v2', 'df.memory-projection/v1 ']) { f.set({ ...f.projection, contractVersion: outer }); assert.throws(() => f.adapter.state(), { code: 'MEMORY_CORRUPT' }); }
  for (const inner of ['bubbles.fishball-memory/v2', 'df.fishball-memory/v2']) { f.set({ ...f.projection, core: { ...f.projection.core, contractVersion: inner } }); assert.throws(() => f.adapter.state(), { code: 'MEMORY_SCOPE' }); }
  for (const key of ['ownerRef', 'workspaceRef']) for (const inner of [false, true]) {
    const different = { ...scope, [key]: sha(`foreign-${key}`) };
    f.set(inner ? { ...f.projection, core: { ...f.projection.core, scope: different } } : { ...f.projection, scope: different });
    assert.throws(() => f.adapter.state(), { code: 'MEMORY_SCOPE' });
  }
  f.set(f.projection); f.row.digest = sha('different content'); assert.throws(() => f.adapter.state(), { code: 'MEMORY_CORRUPT' });
  f.set(f.projection); f.row.deleted = true; assert.throws(() => f.adapter.state(), { code: 'MEMORY_DELETED' });
  assert.equal(f.writes(), 0);
});

test('independent rename public identities: MIT/private preview package, native plugin, lazy module and df panel agree', async () => {
  const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(metadata.name, 'dsh-fishball'); assert.equal(metadata.license, 'MIT'); assert.equal(metadata.private, true); assert.match(metadata.version, /preview/);
  assert.equal(metadata.exports['./runtime'], './src/runtime-plugin.mjs'); assert.equal(metadata.exports['./client'], './lib/client.js');
  assert.equal(nativeName, metadata.name); assert.equal(createPlugin().name, metadata.name); assert.equal(createRuntimePlugin().name, metadata.name);
  assert.match(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'), /^MIT License\n/);
  let module, imports = 0;
  new Script(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')).runInContext(createContext({ AbortController, window: { __ModuleLoader__: { load(value) { assert.equal(module, undefined); module = value; } } } }));
  assert.equal(module.id, metadata.name); assert.equal(imports, 0);
  const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(v => v !== false && v != null) }), useSyncExternalStore: (_, get) => get(), useState: () => ['', () => {}] };
  const client = module.factory(name => { imports++; assert.equal(name, 'react'); return React; }); assert.equal(imports, 1);
  const calls = [], model = client.createModel({ async call(channel, endpoint) { calls.push({ channel, endpoint }); return { ok: true, value: [] }; } }, { clock: () => 100 });
  await model.refresh(); assert.deepEqual(calls, [{ channel: '/df-rpc', endpoint: 'v1/list' }]);
  const tree = client.Panel({ model }), nodes = value => value && typeof value === 'object' ? [value, ...value.children.flatMap(nodes)] : [];
  assert.equal(tree.props['aria-label'], 'dsh-fishball task panel');
  assert.equal(nodes(tree).some(node => node.type === 'label' && node.props.htmlFor === 'df-goal'), true);
  assert.equal(nodes(tree).some(node => node.type === 'textarea' && node.props.id === 'df-goal'), true);
  assert.equal(nodes(tree).some(node => node.props.dangerouslySetInnerHTML), false); model.dispose();
});

test('independent rename RPC: channel rename never admits JSON or cloned peers, aliases or disposed captured handlers', async () => {
  const peer = {}, captures = []; let operations = 0;
  const bridge = installOperatorBridge({ connection: { operator: peer, rpc: { handle(channel, handler) { captures.push({ channel, handler }); return () => {}; } } }, operations: { list() { operations++; return []; } } });
  assert.equal(captures.length, 1); assert.equal(captures[0].channel, '/df-rpc'); const call = captures[0].handler;
  for (const caller of [{}, { role: 'owner', channel: '/df-rpc', verified: true }, undefined]) {
    const result = await call('v1/list', { role: 'owner', scope, verified: true }, undefined, caller); assert.equal(result.error.code, 'OPERATOR_REQUIRED');
  }
  assert.equal(operations, 0); assert.equal((await call('bubbles/list', {}, undefined, peer)).error.code, 'ENDPOINT_NOT_FOUND');
  assert.equal((await call('v1/list', {}, undefined, peer)).ok, true); assert.equal(operations, 1);
  bridge.deactivate(); assert.equal((await call('v1/list', {}, undefined, peer)).error.code, 'SERVICE_DISPOSED'); assert.equal(operations, 1); await bridge.dispose();
});

const packageRoot = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const { Context } = await import(`${packageRoot}/cordis/lib/index.js`);
const { default: SessionStore } = await import(`${packageRoot}/dsh-session/lib/index.js`);
const { default: ApprovalService } = await import(`${packageRoot}/dsh-user-approval/lib/index.js`);
const { HostConnectionService } = await import(`${packageRoot}/dsh-client-connection/lib/index.js`);

test('independent rename native carrier: df diagnostics and RPC retain trusted scope, auth rejection and unload fencing', async t => {
  const home = directory(t), ctx = new Context(), routes = new Map(); ctx.logger.exporters?.clear?.();
  t.after(() => ctx.fiber.dispose());
  ctx.provide('webServer', { register(route) { assert.equal(routes.has(route.path), false); routes.set(route.path, route); return () => routes.delete(route.path); } });
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' });
  await ctx.plugin({ apply(connectionCtx) { new HostConnectionService(connectionCtx, [], { isAuthenticated: request => request.headers['x-synthetic-auth'] === 'approved' }); } });
  const identity = { ownerId: 'rename-owner', workspaceId: 'rename-workspace' };
  const plugin = ctx.plugin(createRuntimePlugin({ identity: () => identity, encryptionKey: () => Buffer.alloc(32, 44), forbiddenSecrets: [secret] }), { databasePath: join(home, 'dsh-fishball.sqlite') }); await plugin;
  const service = ctx.df; assert.deepEqual(Object.keys(service), ['diagnostics']); assert.equal(ctx.reflect.get('bubbles'), undefined);
  assert.equal(service.diagnostics().channel, '/df-rpc'); assert.equal(routes.has('/bubbles-rpc'), false);
  identity.ownerId = 'changed-after-load'; identity.workspaceId = 'changed-after-load';
  async function send(endpoint, payload = {}, headers = {}) {
    const method = `v1/${endpoint}`, request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'rename-rpc', method, payload }))]);
    Object.assign(request, { method: 'POST', url: `/df-rpc/${method}`, headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-synthetic-auth': 'approved', ...headers } });
    const parts = [], response = new Writable({ write(chunk, _encoding, done) { parts.push(Buffer.from(chunk)); done(); } }); response.writeHead = status => { response.statusCode = status; };
    await routes.get('/df-rpc').handler(request, response); const text = Buffer.concat(parts).toString('utf8');
    return { status: response.statusCode, text, result: response.statusCode === 200 ? JSON.parse(text).result : undefined };
  }
  const intake = { taskId: 'rename-task', provider: 'fixture', source: 'source', eventId: 'event', commandRef: reference('rename-intake'), goal: 'Synthetic renamed scoped goal 中文' };
  assert.equal((await send('intake', intake, { 'x-synthetic-auth': 'denied' })).status, 401);
  assert.equal((await send('intake', intake, { host: 'foreign.example', origin: 'http://foreign.example' })).status, 403);
  assert.deepEqual((await send('list')).result.value, []);
  const result = (await send('intake', intake)).result; assert.equal(result.ok, true);
  assert.equal(result.value.task.ownerRef, scope.ownerRef); assert.equal(result.value.task.workspaceRef, scope.workspaceRef);
  const forged = await send('intake', { ...intake, eventId: 'forged', commandRef: reference('forged'), role: 'owner', ownerId: 'other', verified: true }); assert.equal(forged.result.ok, false);
  const rejected = await send('intake', { ...intake, eventId: 'secret', commandRef: reference('secret'), goal: secret }); assert.equal(rejected.result.ok, false); assert.equal(rejected.text.includes(secret), false);
  assert.equal((await send('list')).result.value.length, 1); assert.equal(ctx.sessions.list().length, 0);
  const exported = await send('export', { taskRef: result.value.task.taskRef }); assert.equal(exported.text.includes(intake.goal), false);
  const pending = plugin.dispose(); assert.throws(() => service.diagnostics(), { code: 'SERVICE_DISPOSED' }); await pending;
  assert.equal(routes.has('/df-rpc'), false); assert.equal(ctx.reflect.get('df'), undefined);
});

test('independent rename crypto boundary: genuine old v1 rejects unchanged independently of filename branding', t => {
  for (const name of ['bubbles.sqlite', 'dsh-fishball.sqlite']) {
    const home = directory(t), owner = {}, key = Buffer.alloc(32, 45), config = { databasePath: join(home, name), encryptionKey: key, clock: () => 100, principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'rename-owner', workspaceId: 'rename-workspace' } }] };
    const store = new RuntimeStore(config), content = 'Synthetic genuine pre-integrity ciphertext';
    store.intake(owner, { taskId: 'crypto-task', provider: 'fixture', source: 'source', eventId: 'event', commandRef: reference('crypto-command'), goal: content }); store.close();
    const db = new DatabaseSync(config.databasePath);
    try {
      const row = db.prepare('SELECT * FROM runtime_data').get(), metadata = JSON.parse(row.metadata); delete metadata.cryptoVersion;
      const cipher = createCipheriv('aes-256-gcm', key, row.nonce); cipher.setAAD(Buffer.from(JSON.stringify({ digest: row.digest, id: row.id, keys: [row.owner, row.workspace, row.task], kind: row.kind })));
      const ciphertext = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]); db.prepare('UPDATE runtime_data SET ciphertext=?,tag=?,metadata=?').run(ciphertext, cipher.getAuthTag(), JSON.stringify(metadata));
    } finally { db.close(); }
    const before = bytesAt(home); assert.equal(fixtureDatabasePath(home), config.databasePath);
    assert.throws(() => new RuntimeStore({ ...config, databasePath: fixtureDatabasePath(home) }), { code: 'CRYPTO_LEGACY_UNVERIFIED' }); unchanged(home, before);
  }
});

test('independent rename paths: dangling/directory entries never select a blank store and both-entry ambiguity preserves every entry', t => {
  const capture = home => readdirSync(home).sort().map(name => {
    const path = join(home, name), info = lstatSync(path);
    return { name, type: info.isSymbolicLink() ? 'link' : info.isDirectory() ? 'directory' : 'file', value: info.isSymbolicLink() ? readlinkSync(path) : info.isDirectory() ? readdirSync(path) : readFileSync(path), mtimeMs: info.mtimeMs };
  });
  for (const basename of ['bubbles.sqlite', 'dsh-fishball.sqlite']) for (const kind of ['dangling', 'directory']) {
    const home = directory(t), path = join(home, basename);
    if (kind === 'dangling') symlinkSync(join(home, 'missing-target'), path); else mkdirSync(path);
    const before = capture(home);
    assert.throws(() => fixtureDatabasePath(home), { message: 'STORE_PATH_UNSUPPORTED' });
    assert.deepEqual(capture(home), before); assert.equal(existsSync(join(home, 'missing-target')), false);
  }
  for (const kinds of [['dangling', 'file'], ['file', 'dangling'], ['dangling', 'dangling'], ['directory', 'file']]) {
    const home = directory(t);
    for (const [i, kind] of kinds.entries()) {
      const path = join(home, i === 0 ? 'bubbles.sqlite' : 'dsh-fishball.sqlite');
      if (kind === 'dangling') symlinkSync(join(home, `missing-target-${i}`), path);
      else if (kind === 'directory') mkdirSync(path); else writeFileSync(path, `synthetic distinct bytes ${i}`);
    }
    const before = capture(home); assert.throws(() => fixtureDatabasePath(home), { message: 'STORE_PATH_AMBIGUOUS' }); assert.deepEqual(capture(home), before);
  }
});

const { AgentRegistry } = await import(`${packageRoot}/dsh-agent/lib/index.js`);
const { LlmRuntime, LlmAdapter } = await import(`${packageRoot}/dsh-llm/lib/index.js`);

test('independent rename native session: exact prebound legacy/current refs survive without consent rewrite; only new unbound defaults df', async t => {
  const home = realpathSync(directory(t)), ctx = new Context(); ctx.logger.exporters?.clear?.(); t.after(() => ctx.fiber.dispose());
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' }); await ctx.plugin(AgentRegistry); await ctx.plugin(LlmRuntime);
  let streams = 0, creates = 0;
  class SyntheticProvider extends LlmAdapter {
    async resolveModel(provider, model) { return { provider, id: model, name: model, reasoning: { efforts: [{ id: 'fixture-effort', name: 'Fixture' }] } }; }
    async *stream() { streams++; throw Error('RENAME_STREAM_MUST_NOT_RUN'); }
  }
  ctx.llm.registerAdapter(['synthetic-provider'], new SyntheticProvider());
  ctx.agents.setFactory({ async createAgent() { creates++; throw Error('RENAME_CREATE_MUST_NOT_RUN'); }, async resume() { creates++; throw Error('RENAME_RESUME_MUST_NOT_RUN'); } });
  const entry = { environmentRef: sha('environment'), workspaceRef: scope.workspaceRef, bindingDigest: sha('binding'), toolsDigest: sha('tools'), permissionPolicyDigest: sha('permission'), root: home, cwd: home, provider: 'synthetic-provider', model: 'synthetic-model', reasoningEffort: 'fixture-effort', modelRef: sha('model'), reasoningRef: sha('reasoning'), presetRef: sha('preset') };
  const environments = new EnvironmentRegistry({ entries: [entry], currentState: () => sha('state') });
  const task = { ...scope, taskRef: sha('task'), version: 2, authEpoch: 1 };
  const generationRef = sha('prebrand-generation'), actionDigest = sha('approved-immutable-action');
  const base = { actionRef: sha('action'), kind: 'write', role: 'worker', targetDigest: sha('target'), dataDigest: sha('data'), units: 1, charges: { runtimeMs: 1, usageUnits: 0, costEstimateMicros: 0 }, attemptGroupRef: sha('group'), attemptIndex: 1, resourcePolicyVersion: 1, modelPolicyVersion: 1,
    executor: { mode: 'create', generationRef, environmentRef: entry.environmentRef, bindingDigest: entry.bindingDigest, toolsDigest: entry.toolsDigest, permissionPolicyDigest: entry.permissionPolicyDigest },
    model: { catalogEvidenceRef: sha('catalog'), modelRef: entry.modelRef, reasoningRef: entry.reasoningRef, presetRef: entry.presetRef } };
  const adapter = new NativeAdapter(ctx, { environments, permission: () => true, toolGuard: () => true });
  for (const prefix of ['bubbles-', 'df-', undefined]) {
    const sessionRef = sha(`${prefix ?? 'df-'}${generationRef}`), spec = { ...base, executor: { ...base.executor, ...(prefix === undefined ? {} : { sessionRef }) } }, original = structuredClone(spec);
    const ticket = await adapter.prepare(spec, task, actionDigest), receipt = adapter.query(ticket);
    assert.equal(receipt.sessionRef, sessionRef); assert.equal(receipt.generationRef, generationRef); assert.equal(receipt.actionDigest, actionDigest); assert.equal(receipt.phase, 'unknown');
    assert.deepEqual(spec, original, 'rename neither rewrites consent nor inserts a prebound session into original intent');
  }
  await assert.rejects(adapter.prepare({ ...base, executor: { ...base.executor, sessionRef: sha('unrelated-session') } }, task, actionDigest), { code: 'SESSION_MISMATCH' });
  await assert.rejects(adapter.prepare({ ...base, executor: { ...base.executor, mode: 'resume', sessionRef: sha(`bubbles-${generationRef}`) } }, task, actionDigest), { code: 'SESSION_UNAVAILABLE' });
  const denied = new NativeAdapter(ctx, { environments, toolGuard: () => true }); await assert.rejects(denied.prepare(base, task, actionDigest), { code: 'HOST_PERMISSION_DENIED' });
  assert.equal(creates, 0); assert.equal(streams, 0); assert.equal(ctx.agents.list().length, 0); assert.equal(ctx.sessions.list().length, 0);
});

test('independent rename namespaces: orphan/mixed/nonregular sidecars cannot route to a blank store or change any recoverable entry', t => {
  const capture = home => readdirSync(home).sort().map(name => {
    const path = join(home, name), info = lstatSync(path);
    return { name, type: info.isSymbolicLink() ? 'link' : info.isDirectory() ? 'directory' : 'file', value: info.isSymbolicLink() ? readlinkSync(path) : info.isDirectory() ? readdirSync(path) : readFileSync(path), mtimeMs: info.mtimeMs };
  });
  for (const basename of ['bubbles.sqlite', 'dsh-fishball.sqlite']) for (const suffix of ['-wal', '-shm', '-journal']) {
    const home = directory(t); writeFileSync(join(home, `${basename}${suffix}`), `synthetic recoverable orphan ${basename}${suffix}`);
    const before = capture(home); assert.throws(() => fixtureDatabasePath(home), { message: 'STORE_PATH_ORPHANED' }); assert.deepEqual(capture(home), before);
    assert.equal(existsSync(join(home, 'bubbles.sqlite')), false); assert.equal(existsSync(join(home, 'dsh-fishball.sqlite')), false);
  }
  for (const entries of [
    ['bubbles.sqlite-wal', 'dsh-fishball.sqlite'],
    ['bubbles.sqlite', 'dsh-fishball.sqlite-shm'],
    ['bubbles.sqlite-journal', 'dsh-fishball.sqlite-wal'],
    ['bubbles.sqlite-shm', 'dsh-fishball.sqlite-journal'],
  ]) {
    const home = directory(t); for (const name of entries) writeFileSync(join(home, name), `synthetic distinct bytes for ${name}`);
    const before = capture(home); assert.throws(() => fixtureDatabasePath(home), { message: 'STORE_PATH_AMBIGUOUS' }); assert.deepEqual(capture(home), before);
  }
  for (const basename of ['bubbles.sqlite', 'dsh-fishball.sqlite']) for (const suffix of ['-wal', '-shm', '-journal']) for (const kind of ['dangling', 'directory']) {
    const home = directory(t); writeFileSync(join(home, basename), 'synthetic main bytes');
    const sidecar = join(home, `${basename}${suffix}`);
    if (kind === 'dangling') symlinkSync(join(home, 'missing-sidecar-target'), sidecar); else mkdirSync(sidecar);
    const before = capture(home); assert.throws(() => fixtureDatabasePath(home), { message: 'STORE_PATH_UNSUPPORTED' }); assert.deepEqual(capture(home), before);
    assert.equal(existsSync(join(home, 'missing-sidecar-target')), false);
  }
  for (const basename of ['bubbles.sqlite', 'dsh-fishball.sqlite']) {
    const home = directory(t); for (const suffix of ['', '-wal', '-shm', '-journal']) writeFileSync(join(home, `${basename}${suffix}`), `synthetic selected namespace ${suffix}`);
    const before = capture(home); assert.equal(fixtureDatabasePath(home), join(home, basename)); assert.deepEqual(capture(home), before);
    // Resolver preserves the selected namespace; SQLite validity/recovery is a
    // separate guard. Opaque sidecar bytes are never opened as a real journal.
  }
});
