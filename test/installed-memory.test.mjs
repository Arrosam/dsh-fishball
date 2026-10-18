import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fork, spawnSync } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { Config as BaseConfig, validateConfig } from '../src/config.mjs';
import { Config, validateInstalledConfig } from '../src/installed-config.mjs';
import { MEMORY_ACCOUNTING, prepareInstalledMemory } from '../src/installed-memory.mjs';
import * as Installed from '../src/installed-plugin.mjs';
import { DSH_WEB_RUNTIME_ROOT, resolveHostSource } from '../src/host-probe.mjs';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import { ContextAssembler, compactContext } from '../src/context.mjs';
import { FixtureCredentialProvider } from '../scripts/runtime-web-credentials.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const choice = Object.freeze({ enabled: true, byteLimit: 65536, tokenLimit: 8192 });
const scope = Object.freeze({ ownerId: 'synthetic-ni1-owner', workspaceId: 'synthetic-ni1-workspace' });
const profile = Object.freeze({ dir: '/tmp/synthetic-ni1-profile', name: 'synthetic-ni1' });
const accepted = preview => ({ previewRef: preview.previewRef, planDigest: preview.planDigest, accept: true });
function temporary(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-ni1-author-')); chmodSync(directory, 0o755);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, databasePath: join(directory, 'df/runtime.sqlite'), profile: { dir: directory, name: 'synthetic-ni1' } };
}
const invalid = value => {
  assert.throws(() => validateInstalledConfig(value), error => error.code === 'CONFIG_INVALID' && error.message === 'CONFIG_INVALID');
  assert.deepEqual(Config['~standard'].validate(value), { issues: [{ message: 'CONFIG_INVALID' }] });
};

test('installed config preserves base validation, ordinary/null prototypes, detached frozen choices and disabled default', () => {
  const base = { databasePath: '/tmp/synthetic-ni1/runtime.sqlite' };
  assert.deepEqual(validateInstalledConfig(base).memory, { enabled: false });
  assert.deepEqual(validateInstalledConfig({ ...base, memory: { enabled: false } }), validateInstalledConfig(base));
  for (const nullPrototype of [false, true]) {
    const limits = { maxActive: 1 }, memory = { ...choice }, input = { ...base, limits, memory };
    if (nullPrototype) { Object.setPrototypeOf(input, null); Object.setPrototypeOf(memory, null); Object.setPrototypeOf(limits, null); }
    const result = validateInstalledConfig(input); memory.byteLimit = 1; limits.maxActive = 3;
    assert.equal(result.memory.byteLimit, 65536); assert.equal(result.limits.maxActive, 1);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.memory) && Object.isFrozen(result.limits));
    assert.deepEqual(Config['~standard'].validate({ ...base, memory: choice }).value.memory, choice);
  }
  assert.equal(Installed.Config, Config); assert.notEqual(Config, BaseConfig);
  assert.throws(() => validateConfig({ ...base, memory: choice }), { code: 'CONFIG_INVALID' });
  assert.ok(BaseConfig['~standard'].validate({ ...base, memory: choice }).issues);
});

test('closed memory flags and exact enabled integer boundary partitions', async t => {
  const base = { databasePath: '/tmp/synthetic-ni1/runtime.sqlite' };
  for (const memory of [undefined, null, {}, [], true, false, { enabled: 1 }, { enabled: 'true' }, { enabled: true }, { enabled: false, byteLimit: 1 }, { enabled: false, tokenLimit: 1 }, { ...choice, namespaceRef: reference('spoof') }, { ...choice, tokenize: () => 1 }, { ...choice, identity: scope }]) invalid({ ...base, memory });
  for (const [field, max] of [['byteLimit', 65536], ['tokenLimit', 131072]]) {
    for (const value of [1, 2, max - 1, max]) await t.test(`${field} accepts ${value}`, () => assert.equal(validateInstalledConfig({ ...base, memory: { ...choice, [field]: value } }).memory[field], value));
    for (const value of [0, -1, max + 1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', true]) invalid({ ...base, memory: { ...choice, [field]: value } });
    const missing = { ...choice }; delete missing[field]; invalid({ ...base, memory: missing });
  }
});

test('hostile config descriptors/prototypes never invoke hooks or reveal supplied canaries', () => {
  const base = { databasePath: '/tmp/synthetic-ni1/runtime.sqlite' }; let invoked = 0;
  const hostile = () => [
    Object.defineProperty({}, 'enabled', { value: true }),
    Object.defineProperty({}, 'enabled', { enumerable: true, get() { invoked++; throw Error('SYNTHETIC_PRIVATE_CANARY'); } }),
    { ...choice, [Symbol('SYNTHETIC_PRIVATE_CANARY')]: 1 },
    Object.assign(Object.create({}), choice),
    new Proxy({ ...choice }, { getPrototypeOf() { invoked++; throw Error('SYNTHETIC_PRIVATE_CANARY'); } }),
  ];
  for (const memory of hostile()) invalid({ ...base, memory });
  for (const input of [new Proxy(base, {}), Object.defineProperty({}, 'databasePath', { value: base.databasePath }), { ...base, [Symbol('canary')]: true }, Object.defineProperty({}, 'databasePath', { enumerable: true, get() { invoked++; throw Error('SYNTHETIC_PRIVATE_CANARY'); } })]) invalid(input);
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); invalid({ ...base, memory: revoked.proxy });
  invalid({ ...base, limits: Object.defineProperty({}, 'maxActive', { value: 1 }) }); assert.equal(invoked, 0);
});

test('actual public estimate has exact UTF-16 heuristic and private stable namespace across bounds/scope partitions', async () => {
  const bind = await prepareInstalledMemory(choice), options = bind(scope, profile);
  const { estimateContent } = await import('@deepseek-ai/dsh-token-meter/estimate');
  assert.equal(MEMORY_ACCOUNTING, 'dsh-fixed-density-text/v1'); assert.ok(Object.isFrozen(bind) && Object.isFrozen(options));
  for (const text of ['', 'a', 'abc', 'abcd', 'abcde', 'abcdefg', 'abcdefgh', 'abcdefghi', '中文', '🙂🙂', 'header\n\nSYNTHETIC_BODY']) {
    assert.equal(options.tokenize(text), Math.ceil(text.length / 4) + 4); assert.equal(options.tokenize(text), estimateContent([{ type: 'text', text }]));
  }
  assert.notEqual(Buffer.byteLength('🙂🙂'), '🙂🙂'.length);
  assert.throws(() => options.tokenize({ toString() { throw Error('SYNTHETIC_PRIVATE_CANARY'); } }), { code: 'TOKENIZER_UNAVAILABLE' });
  assert.throws(() => options.tokenize('\ud800'), { code: 'TOKENIZER_UNAVAILABLE' });
  assert.equal(options.namespaceRef, digest(JSON.stringify(['df.installed-memory/v1', scope.ownerId, scope.workspaceId, profile.dir, profile.name])));
  assert.equal((await prepareInstalledMemory({ ...choice, byteLimit: 4096, tokenLimit: 256 }))(scope, profile).namespaceRef, options.namespaceRef);
  for (const [identity, location] of [[{ ...scope, ownerId: 'another-owner' }, profile], [{ ...scope, workspaceId: 'another-workspace' }, profile], [scope, { ...profile, dir: '/tmp/另一个-profile' }], [scope, { ...profile, name: 'other' }]]) assert.notEqual(bind(identity, location).namespaceRef, options.namespaceRef);
  const unicode = { ownerId: '甲:乙', workspaceId: '🙂' }; assert.equal(bind(unicode, profile).namespaceRef, digest(JSON.stringify(['df.installed-memory/v1', unicode.ownerId, unicode.workspaceId, profile.dir, profile.name])));
});

test('rendered accounting boundaries drop whole backgrounds and protect exact instructions', async () => {
  const options = (await prepareInstalledMemory(choice))(scope, profile), protectedText = 'CURRENT_SYNTHETIC_INSTRUCTIONS';
  const backgrounds = [{ ref: reference('background'), text: 'OPTIONAL_SYNTHETIC_BACKGROUND' }];
  const full = `${protectedText}\n\n${backgrounds[0].text}`, tokens = options.tokenize(full);
  for (const byteLimit of [Buffer.byteLength(full), Buffer.byteLength(full) + 1]) assert.equal(compactContext({ protectedText, backgrounds, byteLimit, tokenLimit: tokens, tokenize: options.tokenize }).text, full);
  const reduced = compactContext({ protectedText, backgrounds, byteLimit: Buffer.byteLength(full) - 1, tokenLimit: tokens - 1, tokenize: options.tokenize });
  assert.equal(reduced.text, protectedText); assert.deepEqual(reduced.droppedRefs, [backgrounds[0].ref]); assert.equal(reduced.tokens, options.tokenize(protectedText));
  assert.throws(() => compactContext({ protectedText, backgrounds, byteLimit: protectedText.length - 1, tokenLimit: 131072, tokenize: options.tokenize }), { code: 'CONTEXT_LIMIT' });
});

test('canonical public estimator provenance refuses missing/mixed/aliased/source/lock mutations without fallback', async t => {
  const root = temporary(t).directory, sourceRoot = new URL('../', import.meta.url);
  for (const variant of ['canonical', 'missing', 'version', 'source', 'alias', 'symlink', 'lock', 'mixed']) {
    const directory = join(root, variant); mkdirSync(join(directory, 'src'), { recursive: true }); mkdirSync(join(directory, 'scripts'));
    for (const file of ['config.mjs', 'host-probe.mjs', 'installed-memory.mjs']) cpSync(new URL(`src/${file}`, sourceRoot), join(directory, 'src', file));
    cpSync(new URL('scripts/dsh-web-runtime-lock.json', sourceRoot), join(directory, 'scripts/dsh-web-runtime-lock.json'));
    const host = join(directory, 'host'), peers = join(host, 'node_modules/@deepseek-ai'); mkdirSync(peers, { recursive: true });
    for (const name of ['dsh', 'dsh-token-meter']) {
      const target = join(peers, name); mkdirSync(target); cpSync(resolveHostSource(`@deepseek-ai/${name}`, 'package.json'), join(target, 'package.json'));
    }
    const target = join(peers, 'dsh-token-meter'), source = join(target, 'lib/types/estimate.js'); mkdirSync(dirname(source), { recursive: true }); cpSync(resolveHostSource('@deepseek-ai/dsh-token-meter', 'lib/types/estimate.js'), source);
    cpSync(join(DSH_WEB_RUNTIME_ROOT, 'package-lock.json'), join(host, 'package-lock.json'));
    mkdirSync(join(directory, 'node_modules/@deepseek-ai'), { recursive: true });
    for (const name of ['dsh', 'dsh-token-meter']) symlinkSync(join(peers, name), join(directory, 'node_modules/@deepseek-ai', name));
    if (variant === 'missing') rmSync(target, { recursive: true });
    if (variant === 'version' || variant === 'alias') { const manifest = JSON.parse(readFileSync(join(target, 'package.json'))); if (variant === 'version') manifest.version = '0.2.1-alpha.2'; else { cpSync(source, join(target, 'lib/types/alias.js')); manifest.exports['./estimate'].default = './lib/types/alias.js'; } writeFileSync(join(target, 'package.json'), JSON.stringify(manifest)); }
    if (variant === 'source') writeFileSync(source, `${readFileSync(source, 'utf8')}\n`);
    if (variant === 'symlink') { cpSync(source, join(target, 'lib/types/alias.js')); rmSync(source); symlinkSync(join(target, 'lib/types/alias.js'), source); }
    if (variant === 'lock') writeFileSync(join(host, 'package-lock.json'), `${readFileSync(join(host, 'package-lock.json'), 'utf8')}\n`);
    if (variant === 'mixed') { const outside = join(directory, 'outside'); cpSync(target, outside, { recursive: true }); rmSync(join(directory, 'node_modules/@deepseek-ai/dsh-token-meter')); symlinkSync(outside, join(directory, 'node_modules/@deepseek-ai/dsh-token-meter')); }
    const script = `import {prepareInstalledMemory} from './src/installed-memory.mjs'; try {const bind=await prepareInstalledMemory(${JSON.stringify(choice)}); process.stdout.write(JSON.stringify({count:bind(${JSON.stringify(scope)},${JSON.stringify(profile)}).tokenize('abc')}))}catch(error){process.stdout.write(JSON.stringify({code:error.code,message:error.message}))}`;
    writeFileSync(join(directory, 'probe.mjs'), script);
    const result = spawnSync(process.execPath, ['probe.mjs'], { cwd: directory, env: { PATH: process.env.PATH, NODE_PATH: join(DSH_WEB_RUNTIME_ROOT, 'node_modules') }, encoding: 'utf8', timeout: 10000 }); assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), variant === 'canonical' ? { count: 5 } : { code: 'HOST_CAPABILITY_UNSUPPORTED', message: 'HOST_CAPABILITY_UNSUPPORTED' });
    assert.equal(existsSync(join(directory, 'runtime.sqlite')), false);
  }
});

class Response extends Writable { constructor() { super(); this.parts = []; } _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); } writeHead(status, headers = {}) { this.status = status; this.headers = headers; } }
async function native(t) {
  const f = temporary(t), moduleUrl = name => pathToFileURL(resolveHostSource(name)).href;
  const { Context } = await import(moduleUrl('@deepseek-ai/cordis')), { WebServer } = await import(moduleUrl('@deepseek-ai/dsh-host-webserver'));
  const { default: SessionStore } = await import(moduleUrl('@deepseek-ai/dsh-session')), { default: ApprovalService } = await import(moduleUrl('@deepseek-ai/dsh-user-approval')), { Loader } = await import(moduleUrl('@deepseek-ai/cordis-plugin-loader'));
  const ctx = new Context(); ctx.logger.exporters.clear(); t.after(() => ctx.fiber.dispose());
  let server; await ctx.plugin({ apply(c) { server = new WebServer(c, { host: '127.0.0.1', port: 3080, compression: 'none' }); } }); assert.equal(server.server, undefined);
  await ctx.plugin({ apply(c) { new FixtureCredentialProvider(c, join(f.directory, 'synthetic-auth.json')); c.provide('profileContext', Object.freeze({ ...f.profile, builtin: false, installAnchor: f.directory })); } });
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' }); await ctx.plugin(Loader);
  const id = await ctx.loader.create({ name: resolveHostSource('@deepseek-ai/dsh-client-connection'), inject: ['webServer'], config: { trustedHosts: [] } }); await ctx.loader.await(); await ctx.loader.resolve(id).fiber.await();
  const url = new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3080')); let cookie;
  ctx.connection.authorizeIndex({ method: 'GET', url: url.pathname + url.search, headers: { host: url.host } }, { writeHead(status, headers) { assert.equal(status, 303); cookie = headers['set-cookie'].split(';')[0]; }, end() {} });
  async function send(channel, method, payload = {}, headers = {}, borrowed) {
    const request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'synthetic-ni1-rpc', method: `v1/${method}`, payload }))]);
    Object.assign(request, { method: 'POST', url: `${channel}/v1/${method}`, headers: { host: url.host, origin: url.origin, cookie, 'content-type': 'application/json', ...headers } });
    const response = new Response(), route = borrowed ?? server.prefixes.get(channel); assert.ok(route); await route.handler(request, response);
    const text = Buffer.concat(response.parts).toString(); return { status: response.status, ...(response.status === 200 ? JSON.parse(text).result : {}) };
  }
  const good = async (method, payload = {}) => { const result = await send('/df-rpc', method, payload); assert.equal(result.ok, true, result.error?.code); return result.value; };
  return { ...f, ctx, server, send, good };
}

// 4fea280 widened v1/features with disabled automation/results metadata and
// memory.continuityReady; none of these confers authority before consent.
const closedFeatures = memory => ({ automation: { enabled: false, ready: false, automaticStart: false, choices: [] },
  results: { enabled: false, ready: false, route: null, requires: [], notificationsEnabled: false, opening: 'unknown' }, memory });

test('normal native disabled/omitted config retains exact carriers and cannot enable later features', async t => {
  for (const memory of [undefined, { enabled: false }]) {
    const f = await native(t), fiber = f.ctx.plugin(Installed, { databasePath: f.databasePath, ...(memory ? { memory } : {}) }); await fiber;
    assert.deepEqual((await f.send('/df-setup', 'features')).value, closedFeatures({ enabled: false, ready: false, continuityReady: false, accounting: null, bounds: null }));
    assert.equal(existsSync(dirname(f.databasePath)), false); const preview = (await f.send('/df-setup', 'prepare')).value;
    assert.equal((await f.send('/df-setup', 'confirm', accepted(preview))).value.phase, 'ready');
    assert.equal((await f.send('/df-rpc', 'memoryRead')).error.code, 'CAPABILITY_UNAVAILABLE');
    assert.deepEqual(f.ctx.df.diagnostics().capabilities, { memory: false, memoryContinuity: false, preview: false, worker: false, delivery: false, reviewer: false, automation: false, notifications: false });
    assert.equal(f.ctx.get('tokenMeter'), undefined); assert.equal(f.ctx.sessions.list().length, 0); await fiber.dispose();
  }
});

test('normal enabled native memory has no preconsent writes, exact owner admission, empty read and default-1024 sourced context', async t => {
  const f = await native(t), fiber = f.ctx.plugin(Installed, { databasePath: f.databasePath, memory: choice }); await fiber;
  const expected = (ready, continuityReady = false) => closedFeatures({ enabled: true, ready, continuityReady, accounting: MEMORY_ACCOUNTING, bounds: { byteLimit: 65536, tokenLimit: 8192 } });
  for (let n = 0; n < 3; n++) { assert.deepEqual((await f.send('/df-setup', 'features')).value, expected(false)); assert.equal((await f.send('/df-setup', 'status')).value.phase, 'setup_required'); }
  assert.equal((await f.send('/df-setup', 'features', {}, { cookie: undefined })).status, 401);
  assert.equal((await f.send('/df-setup', 'features', { role: 'owner' })).error.code, 'SETUP_INVALID_INPUT');
  const preview = (await f.send('/df-setup', 'prepare')).value;
  assert.equal((await f.send('/df-setup', 'confirm', { ...accepted(preview), accept: false })).error.code, 'SETUP_CONFIRMATION_REQUIRED'); assert.equal(existsSync(dirname(f.databasePath)), false);
  assert.equal((await f.send('/df-setup', 'confirm', accepted(preview))).value.phase, 'ready'); assert.deepEqual((await f.send('/df-setup', 'features')).value, expected(true, true));
  const read = await f.good('memoryRead'); assert.equal(read.revision, 0); assert.equal(read.projection.facts.length, 0);
  const keyDigest = digest(readFileSync(`${f.databasePath}.df-setup/key.bin`)), metadataDigest = digest(readFileSync(`${f.databasePath}.df-setup/state.json`));
  const intake = await f.good('intake', { taskId: 'synthetic-ni1-task', provider: 'fixture', source: 'synthetic', eventId: 'one', commandRef: reference('ni1-intake'), goal: 'Current synthetic goal; memory never approves work.' });
  const sourceSnapshot = await f.good('status', { taskRef: intake.task.taskRef });
  const sourceRef = sourceSnapshot.data.find(value => value.kind === 'goal').recordRef;
  const request = { commandRef: reference('ni1-remember'), expectedRevision: 0, candidate: { kind: 'preference', content: { text: 'SYNTHETIC_NI1_MEMORY_PREFERENCE English' }, sourceRefs: [sourceRef], observedAt: Date.now(), confidence: 0.9, embedding: [-0.125, 0.5, 1] } };
  const remembered = await f.good('memoryRemember', request); assert.equal(remembered.revision, 1);
  const replay = await f.good('memoryRemember', request); assert.equal(replay.deduplicated, true); assert.equal(replay.revision, 1);
  assert.equal((await f.send('/df-rpc', 'memoryRemember', { ...request, candidate: { ...request.candidate, confidence: 0.1 } })).error.code, 'IDEMPOTENCY_CONFLICT');
  const memoryState = await f.good('memoryRead'); assert.equal(memoryState.revision, 1); assert.equal(memoryState.projection.facts[0].confidence, 0.9); assert.deepEqual(memoryState.projection.core.preferences[0].embedding, [-0.125, 0.5, 1]);
  for (const invalid of [{ ...request, commandRef: reference('ni1-bad-revision'), expectedRevision: 1.5 }, { ...request, commandRef: reference('ni1-bad-time'), expectedRevision: 1, candidate: { ...request.candidate, observedAt: 1.5 } }, ...[-0.01, 1.01].map(confidence => ({ ...request, commandRef: reference(`ni1-bad-confidence-${confidence}`), expectedRevision: 1, candidate: { ...request.candidate, confidence } }))]) {
    assert.equal((await f.send('/df-rpc', 'memoryRemember', invalid)).ok, false); assert.equal((await f.good('memoryRead')).revision, 1);
  }
  const snapshot = await f.good('status', { taskRef: intake.task.taskRef });
  const prepare = { taskRef: snapshot.task.taskRef, commandRef: reference('ni1-prepare'), expectedTaskVersion: snapshot.task.version, expectedAuthEpoch: snapshot.task.authEpoch, terms: ['SYNTHETIC_NI1_MEMORY_PREFERENCE English'], vectors: [[-0.125, 0.5, 1]], now: Date.now() };
  for (const field of ['expectedTaskVersion', 'expectedAuthEpoch', 'now', 'limit']) {
    const rejected = await f.send('/df-rpc', 'prepareContext', { ...prepare, commandRef: reference(`ni1-bad-context-${field}`), [field]: 1.5 }); assert.equal(rejected.ok, false);
    const current = await f.good('status', { taskRef: snapshot.task.taskRef }); assert.equal(current.task.version, snapshot.task.version); assert.equal(current.data.filter(value => value.kind === 'context').length, 0);
  }
  assert.equal((await f.send('/df-rpc', 'control', { taskRef: snapshot.task.taskRef, commandRef: reference('ni1-fractional-control'), expectedTaskVersion: snapshot.task.version + 0.5, expectedAuthEpoch: snapshot.task.authEpoch, kind: 'pause' })).error.code, 'INVALID_INPUT');
  const prepared = await f.good('prepareContext', prepare);
  const after = await f.good('status', { taskRef: snapshot.task.taskRef }), detail = await f.good('detail', { taskRef: snapshot.task.taskRef, recordRef: prepared.recordRef, expectedTaskVersion: after.task.version, expectedAuthEpoch: after.task.authEpoch });
  const envelope = JSON.parse(detail.data.content); assert.equal(envelope.materialKind, 'execution_context'); assert.equal(envelope.memory.revision, 1); assert.ok(envelope.content.includes('Current synthetic goal')); assert.ok(envelope.content.includes('SYNTHETIC_NI1_MEMORY_PREFERENCE')); assert.equal(envelope.inputCounts.tokens, Math.ceil(envelope.content.length / 4) + 4);
  assert.equal(envelope.inputCounts.bytes, Buffer.byteLength(envelope.content)); assert.equal(digest(detail.data.content), prepared.digest); assert.equal(prepared.task.authEpoch, snapshot.task.authEpoch);
  assert.equal(readFileSync(f.databasePath).includes(Buffer.from('SYNTHETIC_NI1_MEMORY_PREFERENCE')), false);
  assert.deepEqual(f.ctx.df.diagnostics().capabilities, { memory: true, memoryContinuity: true, preview: false, worker: false, delivery: false, reviewer: false, automation: false, notifications: false }); assert.equal(f.ctx.sessions.list().length, 0); assert.equal(f.ctx.get('tokenMeter'), undefined);
  assert.equal(digest(readFileSync(`${f.databasePath}.df-setup/key.bin`)), keyDigest); assert.equal(digest(readFileSync(`${f.databasePath}.df-setup/state.json`)), metadataDigest); assert.deepEqual(readdirSync(`${f.databasePath}.df-setup`).sort(), ['key.bin', 'state.json']);
  const oldRoute = f.server.prefixes.get('/df-setup'), oldDiagnostics = f.ctx.df; const stopping = fiber.dispose(); assert.throws(() => oldDiagnostics.diagnostics(), { code: 'SERVICE_DISPOSED' }); assert.equal((await f.send('/df-setup', 'features', {}, {}, oldRoute)).error.code, 'SERVICE_DISPOSED'); await stopping;
  const disabled = f.ctx.plugin(Installed, { databasePath: f.databasePath }); await disabled; assert.equal((await f.send('/df-rpc', 'memoryRead')).error.code, 'CAPABILITY_UNAVAILABLE'); await disabled.dispose();
  for (let cycle = 0; cycle < 10; cycle++) {
    const current = f.ctx.plugin(Installed, { databasePath: f.databasePath, memory: { ...choice, tokenLimit: 8192 + cycle } }); await current;
    const retained = await f.good('memoryRead'); assert.equal(retained.namespaceRef, read.namespaceRef); assert.equal(retained.revision, 1); assert.equal(retained.projection.facts[0].confidence, 0.9); assert.deepEqual(retained.projection.core.preferences[0].embedding, [-0.125, 0.5, 1]); assert.equal((await f.send('/df-setup', 'features')).value.memory.ready, true); assert.equal(f.ctx.sessions.list().length, 0); await current.dispose();
  }
  assert.equal(digest(readFileSync(`${f.databasePath}.df-setup/key.bin`)), keyDigest); assert.equal(digest(readFileSync(`${f.databasePath}.df-setup/state.json`)), metadataDigest); assert.equal(f.server.server, undefined);
});

test('actual encrypted context refuses protected overflow and stale CAS without a context write', async t => {
  const f = temporary(t), owner = {}, key = randomBytes(32), options = (await prepareInstalledMemory(choice))(scope, f.profile);
  const store = new RuntimeStore({ databasePath: join(f.directory, 'ledger.sqlite'), encryptionKey: key, principals: [{ handle: owner, role: 'owner', scope }], hostPermission: () => false }); t.after(() => { store.close(); key.fill(0); });
  const memory = new MemoryAdapter({ ...options, store, handle: owner, contextAssembler: new ContextAssembler({ store, tokenize: options.tokenize, byteLimit: 1, tokenLimit: 1 }) });
  const task = store.intake(owner, { taskId: 'overflow', provider: 'fixture', source: 'synthetic', eventId: 'one', commandRef: reference('overflow-intake'), goal: 'CURRENT_PROTECTED_SYNTHETIC_INSTRUCTIONS' }).task;
  const input = { taskRef: task.taskRef, commandRef: reference('overflow-context'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, terms: [], now: Date.now() };
  await assert.rejects(memory.prepareExecutionContext(input), { code: 'CONTEXT_LIMIT' }); assert.equal(store.listData(owner, { taskRef: task.taskRef, kind: 'context' }).length, 0); assert.equal(store.task(owner, task.taskRef).version, task.version);
  await assert.rejects(memory.prepareExecutionContext({ ...input, expectedTaskVersion: task.version + 1 }), { code: 'STALE_VERSION' }); assert.equal(store.listData(owner, { taskRef: task.taskRef, kind: 'context' }).length, 0);
});

test('independent processes race one encrypted memory revision and preserve the acknowledged receipt on abrupt exit', async t => {
  const f = temporary(t), databasePath = join(f.directory, 'ledger.sqlite'), keyPath = join(f.directory, 'synthetic-key.bin'); writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
  const owner = {}, initial = new RuntimeStore({ databasePath, encryptionKey: readFileSync(keyPath), principals: [{ handle: owner, role: 'owner', scope }] }); initial.close();
  const childSource = `import {readFileSync} from 'node:fs'; import {RuntimeStore,reference} from ${JSON.stringify(new URL('../src/runtime-store.mjs', import.meta.url).href)}; import {MemoryAdapter} from ${JSON.stringify(new URL('../src/memory.mjs', import.meta.url).href)}; import {prepareInstalledMemory} from ${JSON.stringify(new URL('../src/installed-memory.mjs', import.meta.url).href)};
const f=JSON.parse(process.argv[2]),handle={},key=readFileSync(f.keyPath);const store=new RuntimeStore({databasePath:f.databasePath,encryptionKey:key,principals:[{handle,role:'owner',scope:f.scope}]});key.fill(0);const options=(await prepareInstalledMemory(f.choice))(f.scope,f.profile),memory=new MemoryAdapter({...options,store,handle});process.send({phase:'opened',revision:memory.state().revision});process.once('message',()=>{try{const receipt=memory.remember({commandRef:reference(f.id),expectedRevision:0,candidate:{kind:'preference',content:{text:f.id},confidence:0.9,sourceRefs:[reference('synthetic-source')],observedAt:1000}});process.send({phase:'ack',revision:receipt.revision,digest:receipt.digest},()=>process.exit(73))}catch(error){process.send({phase:'denied',code:error.code},()=>process.exit(74))}});`;
  const script = join(f.directory, 'child.mjs'); writeFileSync(script, childSource, { mode: 0o600 });
  async function child(id) {
    const processChild = fork(script, [JSON.stringify({ databasePath, keyPath, scope, choice, profile: f.profile, id })], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); t.after(() => { if (processChild.exitCode === null) processChild.kill('SIGTERM'); });
    const messages = []; processChild.on('message', message => messages.push(message));
    const exit = new Promise((resolve, reject) => { const timer = setTimeout(() => { processChild.kill('SIGTERM'); reject(Error('SYNTHETIC_NI1_TIMEOUT')); }, 10000); processChild.once('exit', code => { clearTimeout(timer); resolve(code); }); });
    await new Promise(resolve => processChild.once('message', value => { assert.deepEqual(value, { phase: 'opened', revision: 0 }); resolve(); })); return { processChild, messages, exit };
  }
  const first = await child('SYNTHETIC_PROCESS_A'), second = await child('SYNTHETIC_PROCESS_B'); first.processChild.send('commit'); second.processChild.send('commit');
  assert.deepEqual((await Promise.all([first.exit, second.exit])).sort(), [73, 74]); const receipts = [first.messages.at(-1), second.messages.at(-1)]; assert.equal(receipts.find(row => row.phase === 'denied').code, 'STALE_MEMORY');
  const reopened = new RuntimeStore({ databasePath, encryptionKey: readFileSync(keyPath), principals: [{ handle: owner, role: 'owner', scope }] }); t.after(() => reopened.close());
  const options = (await prepareInstalledMemory(choice))(scope, f.profile), memory = new MemoryAdapter({ ...options, store: reopened, handle: owner }); assert.equal(memory.state().revision, 1); assert.equal(reopened.getMemory(owner, { namespaceRef: options.namespaceRef }).digest, receipts.find(row => row.phase === 'ack').digest);
});
