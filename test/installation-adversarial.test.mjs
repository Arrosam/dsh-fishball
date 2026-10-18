import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { SetupState, SETUP_BOUNDS } from '../src/setup-state.mjs';
import * as Installed from '../src/installed-plugin.mjs';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { resolveHostSource } from '../src/host-probe.mjs';
import { FixtureCredentialProvider } from '../scripts/runtime-web-credentials.mjs';

// Independent consent/storage/module tests only. Public WebServer below is
// constructed without Service.init/listen. No native CLI, HTTP or provider runs.
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const accepted = preview => ({ previewRef: preview.previewRef, planDigest: preview.planDigest, accept: true });
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const moduleUrl = name => pathToFileURL(resolveHostSource(name)).href;
const { Context } = await import(moduleUrl('@deepseek-ai/cordis'));
const Connection = await import(moduleUrl('@deepseek-ai/dsh-client-connection'));
const { WebServer } = await import(moduleUrl('@deepseek-ai/dsh-host-webserver'));
const { default: SessionStore } = await import(moduleUrl('@deepseek-ai/dsh-session'));
const { default: ApprovalService } = await import(moduleUrl('@deepseek-ai/dsh-user-approval'));
const { Loader } = await import(moduleUrl('@deepseek-ai/cordis-plugin-loader'));

function fixture(t, { parent = false } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'df-setup-istqb-'));
  const directory = join(root, 'profile'); mkdirSync(directory, { mode: 0o755 }); chmodSync(directory, 0o755);
  const profile = Object.freeze({ dir: directory, name: 'independent-local-install' });
  const databasePath = join(directory, 'df-data/runtime.sqlite');
  if (parent) { mkdirSync(dirname(databasePath), { mode: 0o755 }); chmodSync(dirname(databasePath), 0o755); }
  const finalizers = [];
  t.after(async () => {
    try { for (const fn of finalizers.reverse()) await fn(); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
  return { root, directory, databasePath, profile, finally(fn) { finalizers.push(fn); } };
}
function setup(f, options = {}) {
  let activations = 0, stops = 0, key, identity;
  const state = new SetupState({ databasePath: f.databasePath, profile: f.profile,
    activate(value) { activations++; key = value.encryptionKey; identity = value.identity; return () => { stops++; }; }, ...options });
  f.finally(() => state.dispose());
  return { state, counts: () => ({ activations, stops }), key: () => key, identity: () => identity };
}
function facts(directory) {
  const values = [];
  function visit(path, prefix = '') {
    for (const name of readdirSync(path).sort()) {
      const target = join(path, name), tail = join(prefix, name), info = lstatSync(target);
      values.push({ path: tail, dev: info.dev, ino: info.ino, mode: info.mode, uid: info.uid, nlink: info.nlink, size: info.size,
        content: info.isSymbolicLink() ? { link: readlinkSync(target) } : info.isFile() ? digest(readFileSync(target)) : 'directory' });
      if (info.isDirectory() && !info.isSymbolicLink()) visit(target, tail);
    }
  }
  visit(directory); return values;
}
async function rejectsCode(operation, code) {
  let error; try { await operation(); } catch (value) { error = value; }
  assert.ok(error, 'expected stable setup denial');
  assert.equal(error.code, code); assert.equal(error.message, code);
  assert.equal(String(error.stack).includes('SYNTHETIC_PRIVATE_SETUP_CANARY'), false);
}
const statePaths = f => ({ namespace: `${f.databasePath}.df-setup`, key: `${f.databasePath}.df-setup/key.bin`, metadata: `${f.databasePath}.df-setup/state.json` });

test('independent setup normal 0755 profile and parent are read-only until consent, then only private state is created', async t => {
  const f = fixture(t, { parent: true }), s = setup(f), before = facts(f.directory);
  assert.deepEqual(s.state.status(), { phase: 'setup_required', executionEnabled: false, storage: { location: f.databasePath } });
  const plan = s.state.prepare(); assert.deepEqual(facts(f.directory), before);
  assert.deepEqual(plan.description, { operation: 'create-local-storage', databaseLocation: f.databasePath, identityMode: 'native-dsh-owner', encrypted: true, permissions: 'owner-only', externalExecution: false });
  assert.equal(Object.isFrozen(plan), true); assert.equal(Object.isFrozen(plan.description), true);
  assert.equal((await s.state.confirm(accepted(plan))).phase, 'ready');
  for (const path of [f.directory, dirname(f.databasePath)]) assert.equal(lstatSync(path).mode & 0o7777, 0o755);
  const paths = statePaths(f); assert.equal(lstatSync(paths.namespace).mode & 0o7777, 0o700);
  for (const path of [f.databasePath, paths.key, paths.metadata]) {
    const info = lstatSync(path); assert.equal(info.mode & 0o7777, 0o600); assert.equal(info.uid, process.getuid()); assert.equal(info.nlink, 1);
  }
  assert.deepEqual(readdirSync(paths.namespace).sort(), ['key.bin', 'state.json']);
  assert.equal(s.key().length, 32); assert.equal(s.key().every(byte => byte === 0), true);
  assert.equal(s.counts().activations, 1); assert.equal(s.counts().stops, 0);
});

test('independent setup relative depth 1 rejects, 2/15/16 allow volatile prepare, and 17 rejects without writes', async t => {
  for (const depth of [1, 2, 15, 16, 17]) await t.test(`depth-${depth}`, () => {
    const f = fixture(t), path = join(f.directory, ...Array.from({ length: depth - 1 }, (_, i) => `p${i}`), 'runtime.sqlite');
    const before = facts(f.directory);
    if (depth < 2 || depth > 16) assert.throws(() => new SetupState({ databasePath: path, profile: f.profile, activate: () => () => {} }), { code: 'SETUP_UNAVAILABLE' });
    else { const state = new SetupState({ databasePath: path, profile: f.profile, activate: () => () => {} }); f.finally(() => state.dispose()); assert.equal(state.prepare().description.databaseLocation, path); }
    assert.deepEqual(facts(f.directory), before);
  });
  assert.equal(SETUP_BOUNDS.pathDepth, 16);
});

test('independent setup lexical path-length 1023/1024/1025 and exact UTF-8 validity are separate from filesystem support', async t => {
  for (const length of [1023, 1024, 1025]) await t.test(`constructor-character-length-${length}`, () => {
    const f = fixture(t), prefix = `${f.directory}/df-data/`, path = prefix + 'x'.repeat(length - prefix.length);
    assert.equal(path.length, length); const before = facts(f.directory);
    if (length > 1024) assert.throws(() => new SetupState({ databasePath: path, profile: f.profile, activate: () => () => {} }), { code: 'SETUP_UNAVAILABLE' });
    else {
      const state = new SetupState({ databasePath: path, profile: f.profile, activate: () => () => {} }); f.finally(() => state.dispose());
      // The basename intentionally exceeds the OS limit. This is constructor
      // character validation evidence, not a usable 1024-character path claim.
      assert.throws(() => state.prepare(), { code: 'SETUP_UNAVAILABLE' });
    }
    assert.deepEqual(facts(f.directory), before);
  });
  for (const tail of ['unpaired-\ud800.sqlite', 'unpaired-\udfff.sqlite', 'control-\n.sqlite', 'control-\u0000.sqlite']) {
    const f = fixture(t); assert.throws(() => new SetupState({ databasePath: join(f.directory, 'df-data', tail), profile: f.profile, activate: () => () => {} }), { code: 'SETUP_UNAVAILABLE' }); assert.deepEqual(facts(f.directory), []);
  }
  const f = fixture(t), path = join(f.directory, '数据', '😀.sqlite'), state = new SetupState({ databasePath: path, profile: f.profile, activate: () => () => {} });
  f.finally(() => state.dispose()); assert.equal(state.prepare().description.databaseLocation, path); assert.deepEqual(facts(f.directory), []);
});

test('independent setup hostile payloads are rejected without executing traps or persisting secret canaries', async t => {
  const f = fixture(t), s = setup(f), plan = s.state.prepare(), before = facts(f.directory); let traps = 0;
  const getter = Object.defineProperty({}, 'previewRef', { enumerable: true, get() { traps++; throw new Error('SYNTHETIC_PRIVATE_SETUP_CANARY'); } });
  const proxy = new Proxy({}, { get() { traps++; throw new Error('SYNTHETIC_PRIVATE_SETUP_CANARY'); }, ownKeys() { traps++; throw new Error('SYNTHETIC_PRIVATE_SETUP_CANARY'); }, getPrototypeOf() { traps++; throw new Error('SYNTHETIC_PRIVATE_SETUP_CANARY'); } });
  const hidden = Object.defineProperty({}, 'accept', { value: true });
  const values = [getter, proxy, hidden, { [Symbol('owner')]: true }, [], Array(2), null, 'SYNTHETIC_PRIVATE_SETUP_CANARY', { ownerId: 'owner' }, { encryptionKey: 'SYNTHETIC_PRIVATE_SETUP_CANARY' }];
  for (const input of values) {
    assert.throws(() => s.state.status(input), { code: 'SETUP_INVALID_INPUT' });
    assert.throws(() => s.state.prepare(input), { code: 'SETUP_INVALID_INPUT' });
    await rejectsCode(() => s.state.confirm(input), 'SETUP_INVALID_INPUT');
  }
  await rejectsCode(() => s.state.confirm({ ...accepted(plan), previewRef: 'SYNTHETIC_PRIVATE_SETUP_CANARY'.repeat(80) }), 'SETUP_INVALID_INPUT');
  assert.equal(traps, 0); assert.deepEqual(facts(f.directory), before); assert.equal(s.counts().activations, 0);
});

test('independent setup consent reference/digest are private-instance bound and require literal acceptance', async t => {
  const f = fixture(t), a = setup(f), b = setup(f), current = a.state.prepare(), foreign = b.state.prepare(), before = facts(f.directory);
  for (const accept of [false, undefined, null, 0, 1, 'true', {}]) await rejectsCode(() => a.state.confirm({ ...accepted(current), accept }), 'SETUP_CONFIRMATION_REQUIRED');
  await rejectsCode(() => a.state.confirm(accepted(foreign)), 'SETUP_PREVIEW_STALE');
  for (const field of ['previewRef', 'planDigest']) for (const value of ['a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), reference('different-private-plan')]) await rejectsCode(() => a.state.confirm({ ...accepted(current), [field]: value }), 'SETUP_PREVIEW_STALE');
  assert.deepEqual(facts(f.directory), before); assert.deepEqual(a.counts(), { activations: 0, stops: 0 }); assert.deepEqual(b.counts(), { activations: 0, stops: 0 });
  assert.equal((await a.state.confirm(accepted(current))).phase, 'ready'); const committed = facts(f.directory);
  await rejectsCode(() => a.state.confirm(accepted(current)), 'SETUP_PREVIEW_STALE');
  await rejectsCode(() => b.state.confirm(accepted(foreign)), 'SETUP_RECOVERY_REQUIRED');
  assert.deepEqual(facts(f.directory), committed);
});

test('independent setup final trusted callback expiry/abort and lifetime loss prevent the first write', async t => {
  for (const kind of ['expiry', 'abort', 'lifetime']) await t.test(kind, async () => {
    const f = fixture(t, { parent: true }); let now = 1000, trigger = false, alive = true; const abort = new AbortController();
    const s = setup(f, { clock: () => now, isAlive: () => alive, currentProfile() { if (trigger) { if (kind === 'expiry') now = 61000; if (kind === 'abort') abort.abort(); if (kind === 'lifetime') alive = false; } return f.profile; } });
    const plan = s.state.prepare(), before = facts(f.directory); now = plan.expiresAt - 1; trigger = true;
    await rejectsCode(() => s.state.confirm(accepted(plan), { signal: abort.signal }), kind === 'expiry' ? 'SETUP_PREVIEW_STALE' : kind === 'abort' ? 'REQUEST_ABORTED' : 'SERVICE_DISPOSED');
    assert.deepEqual(facts(f.directory), before); assert.equal(s.counts().activations, 0);
  });
});

test('independent setup plan binds existing parent inode, profile identity and unsafe final mode', async t => {
  for (const change of ['parent-inode', 'profile-name', 'profile-writable']) await t.test(change, async () => {
    const f = fixture(t, { parent: true }); let drift = false;
    const s = setup(f, { currentProfile: () => drift ? { ...f.profile, name: 'other-native-profile' } : f.profile });
    const plan = s.state.prepare();
    if (change === 'parent-inode') { renameSync(dirname(f.databasePath), join(f.directory, 'retired-parent')); mkdirSync(dirname(f.databasePath), { mode: 0o755 }); }
    if (change === 'profile-name') drift = true;
    if (change === 'profile-writable') chmodSync(f.directory, 0o777);
    const before = facts(f.directory);
    await rejectsCode(() => s.state.confirm(accepted(plan)), change === 'parent-inode' ? 'SETUP_PREVIEW_STALE' : 'SETUP_UNAVAILABLE');
    assert.deepEqual(facts(f.directory), before); assert.equal(s.counts().activations, 0);
    if (change === 'profile-writable') chmodSync(f.directory, 0o755);
  });
});

test('independent setup orphan sidecar links and directory entries refuse with exact preservation', async t => {
  for (const kind of ['dangling-wal', 'directory-shm', 'hardlinked-journal']) await t.test(kind, async () => {
    const f = fixture(t, { parent: true }), s = setup(f);
    if (kind === 'dangling-wal') symlinkSync(join(f.root, 'missing-synthetic-target'), `${f.databasePath}-wal`);
    if (kind === 'directory-shm') mkdirSync(`${f.databasePath}-shm`, { mode: 0o700 });
    if (kind === 'hardlinked-journal') { const original = join(f.root, 'synthetic-foreign-entry'); writeFileSync(original, 'SYNTHETIC_PRESERVED_SIDECAR', { mode: 0o600 }); linkSync(original, `${f.databasePath}-journal`); }
    const before = facts(f.directory);
    assert.equal(s.state.status().phase, 'recovery_required'); assert.throws(() => s.state.prepare(), { code: 'SETUP_RECOVERY_REQUIRED' });
    assert.equal((await s.state.resume()).phase, 'recovery_required'); assert.deepEqual(facts(f.directory), before); assert.equal(s.counts().activations, 0); assert.equal(existsSync(statePaths(f).key), false);
  });
});

test('independent setup a real OS permission failure creates no ready state or replacement entries', async t => {
  const f = fixture(t, { parent: true }), s = setup(f); assert.notEqual(process.getuid(), 0);
  chmodSync(dirname(f.databasePath), 0o555); const before = facts(f.directory), probe = join(dirname(f.databasePath), 'permission-probe');
  try {
    assert.throws(() => writeFileSync(probe, 'synthetic', { flag: 'wx', mode: 0o600 }), { code: 'EACCES' });
    const plan = s.state.prepare(); await rejectsCode(() => s.state.confirm(accepted(plan)), 'SETUP_RECOVERY_REQUIRED');
    assert.notEqual(s.state.status().phase, 'ready'); assert.deepEqual(facts(f.directory), before); assert.equal(s.counts().activations, 0);
  } finally { chmodSync(dirname(f.databasePath), 0o755); }
});

test('independent setup late sidecar contender prevents target publication and partial state cannot replay', async t => {
  const f = fixture(t, { parent: true }); let cuts = 0;
  const s = setup(f, { observeCommit(point) { if (point === 'staging_closed') { cuts++; writeFileSync(`${f.databasePath}-journal`, 'SYNTHETIC_CONTENDER_JOURNAL', { mode: 0o600, flag: 'wx' }); } } });
  await rejectsCode(() => s.state.confirm(accepted(s.state.prepare())), 'SETUP_RECOVERY_REQUIRED');
  assert.equal(cuts, 1); assert.equal(s.counts().activations, 0); assert.equal(existsSync(f.databasePath), false); assert.equal(existsSync(statePaths(f).key), false);
  const before = facts(f.directory); assert.equal(readFileSync(`${f.databasePath}-journal`, 'utf8'), 'SYNTHETIC_CONTENDER_JOURNAL');
  assert.equal((await s.state.resume()).phase, 'recovery_required'); assert.throws(() => s.state.prepare(), { code: 'SETUP_RECOVERY_REQUIRED' }); assert.deepEqual(facts(f.directory), before);
});

test('independent setup authenticated metadata byte boundary 4095/4096/4097 retains legitimate whitespace', async t => {
  for (const bytes of [4095, 4096, 4097]) await t.test(`metadata-bytes-${bytes}`, async () => {
    const f = fixture(t), initial = setup(f); await initial.state.confirm(accepted(initial.state.prepare())); await initial.state.dispose();
    const path = statePaths(f).metadata, body = readFileSync(path); assert.equal(body.length < bytes, true);
    writeFileSync(path, Buffer.concat([body, Buffer.alloc(bytes - body.length, 0x20)])); const before = facts(f.directory), next = setup(f);
    if (bytes <= 4096) { assert.equal(next.state.status().phase, 'unavailable'); assert.equal((await next.state.resume()).phase, 'ready'); assert.equal(next.counts().activations, 1); }
    else { assert.equal(next.state.status().phase, 'recovery_required'); assert.equal((await next.state.resume()).phase, 'recovery_required'); assert.equal(next.counts().activations, 0); }
    assert.deepEqual(facts(f.directory), before);
  });
});

test('independent setup exact key length 31/32/33 and HMAC/format/private-file linkage reject without resealing', async t => {
  for (const kind of ['key31', 'key32', 'key33', 'bad-mac', 'future-format', 'key-hardlink', 'metadata-mode']) await t.test(kind, async () => {
    const f = fixture(t), initial = setup(f); await initial.state.confirm(accepted(initial.state.prepare())); await initial.state.dispose(); const paths = statePaths(f);
    if (kind === 'key31' || kind === 'key33') { const key = readFileSync(paths.key); writeFileSync(paths.key, kind === 'key31' ? key.subarray(0, 31) : Buffer.concat([key, Buffer.from([0]) ])); key.fill(0); }
    if (kind === 'bad-mac' || kind === 'future-format') { const value = JSON.parse(readFileSync(paths.metadata, 'utf8')); if (kind === 'bad-mac') value.mac = value.mac[0] === 'a' ? 'b' + value.mac.slice(1) : 'a' + value.mac.slice(1); else value.format = 'df-installed/v999'; writeFileSync(paths.metadata, JSON.stringify(value)); }
    if (kind === 'key-hardlink') linkSync(paths.key, join(f.root, 'synthetic-second-key-link'));
    if (kind === 'metadata-mode') chmodSync(paths.metadata, 0o640);
    const before = facts(f.directory), next = setup(f);
    assert.equal((await next.state.resume()).phase, kind === 'key32' ? 'ready' : 'recovery_required');
    assert.equal(next.counts().activations, kind === 'key32' ? 1 : 0); assert.deepEqual(facts(f.directory), before);
  });
});

test('independent setup one pending confirmation, late disposal and callback errors preserve closed receipts and partial facts', async t => {
  const f = fixture(t), entered = gate(), release = gate(); let activations = 0, stops = 0, key;
  const s = setup(f, { async activate(value) { activations++; key = value.encryptionKey; entered.resolve(); await release.promise; return () => { stops++; }; } });
  const plan = s.state.prepare(), pending = s.state.confirm(accepted(plan)), denied = rejectsCode(() => pending, 'SERVICE_DISPOSED'); await entered.promise;
  await rejectsCode(() => s.state.confirm(accepted(plan)), 'SETUP_PREVIEW_STALE'); const before = facts(f.directory);
  await s.state.dispose(); release.resolve(); await denied;
  assert.equal(activations, 1); assert.equal(stops, 1); assert.equal(key.every(byte => byte === 0), true); assert.deepEqual(facts(f.directory), before);
  const next = setup(f); assert.equal((await next.state.resume()).phase, 'recovery_required'); assert.equal(next.counts().activations, 0);
  for (const kind of ['throw-canary', 'wrong-disposer']) await t.test(kind, async () => {
    const f = fixture(t); let key;
    const s = setup(f, { activate(value) { key = value.encryptionKey; if (kind === 'throw-canary') throw new Error('SYNTHETIC_PRIVATE_SETUP_CANARY'); return { dispose() { assert.fail('untrusted disposer object must not run'); } }; } });
    await rejectsCode(() => s.state.confirm(accepted(s.state.prepare())), 'SETUP_RECOVERY_REQUIRED');
    assert.equal(key.every(byte => byte === 0), true); const before = facts(f.directory);
    assert.equal((await s.state.resume()).phase, 'recovery_required'); assert.deepEqual(facts(f.directory), before);
  });
});

const childSource = `import { SetupState } from ${JSON.stringify(new URL('../src/setup-state.mjs', import.meta.url).href)};
import { RuntimeStore, reference } from ${JSON.stringify(new URL('../src/runtime-store.mjs', import.meta.url).href)};
const options = JSON.parse(process.argv[2]), mode = process.argv[3];
let store, taskRef;
const state = new SetupState({ ...options, activate({ identity, encryptionKey }) {
  if (mode === 'ack-crash') { const owner = {}; store = new RuntimeStore({ databasePath: options.databasePath, encryptionKey, principals: [{ handle: owner, role: 'owner', scope: identity }], hostPermission: () => false });
    taskRef = store.intake(owner, { taskId: 'acknowledged-task', provider: 'fixture', source: 'independent', eventId: 'ack-event', commandRef: reference('ack-intake'), goal: 'SYNTHETIC_ACK_CRASH_ENCRYPTED_GOAL' }).task.taskRef; }
  return () => store?.close();
}, observeCommit(point) { if (mode === 'staging-crash' && point === 'staging_closed') process.exit(79); } });
const plan = state.prepare(); process.send({ phase: 'prepared' });
process.once('message', async () => { if (mode === 'precommit-crash') process.exit(79);
  try { const result = await state.confirm({ previewRef: plan.previewRef, planDigest: plan.planDigest, accept: true });
    process.send({ phase: result.phase, ...(taskRef ? { taskRef } : {}) }, async () => { if (mode === 'ack-crash') process.exit(79); await state.dispose(); process.exit(0); });
  } catch (error) { process.send({ phase: 'denied', code: error.code }, () => process.exit(0)); }
});`;
async function child(f, mode) {
  const path = join(f.root, `child-${mode}-${Math.random().toString(16).slice(2)}.mjs`); writeFileSync(path, childSource, { mode: 0o600 });
  const running = fork(path, [JSON.stringify({ databasePath: f.databasePath, profile: f.profile }), mode], { env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const messages = [], ready = gate(); running.on('message', value => { messages.push(value); if (value.phase === 'prepared') ready.resolve(); });
  const exit = new Promise((resolve, reject) => { const timer = setTimeout(() => { running.kill('SIGTERM'); reject(new Error('SYNTHETIC_SETUP_CHILD_TIMEOUT')); }, 10000); running.once('exit', code => { clearTimeout(timer); resolve(code); }); running.once('error', error => { clearTimeout(timer); reject(error); }); });
  f.finally(async () => { if (running.exitCode === null && running.signalCode === null) running.kill('SIGTERM'); await exit; });
  await Promise.race([ready.promise, exit.then(() => { throw new Error('SYNTHETIC_SETUP_CHILD_PREPARE_FAILED'); })]);
  return { running, exit, messages };
}

test('independent setup two already-prepared OS processes publish one namespace with no overwrite or extra key', async t => {
  const f = fixture(t, { parent: true }), first = await child(f, 'race'), second = await child(f, 'race');
  assert.deepEqual(facts(f.directory).map(value => value.path), ['df-data']); first.running.send('commit'); second.running.send('commit');
  assert.deepEqual(await Promise.all([first.exit, second.exit]), [0, 0]); const results = [first.messages.at(-1), second.messages.at(-1)];
  assert.equal(results.filter(value => value.phase === 'ready').length, 1); assert.equal(results.filter(value => value.phase === 'denied').length, 1);
  assert.equal(['SETUP_PREVIEW_STALE', 'SETUP_RECOVERY_REQUIRED'].includes(results.find(value => value.phase === 'denied').code), true);
  assert.deepEqual(readdirSync(statePaths(f).namespace).sort(), ['key.bin', 'state.json']); const before = facts(f.directory), next = setup(f);
  assert.equal((await next.state.resume()).phase, 'ready'); assert.equal(next.counts().activations, 1); assert.deepEqual(facts(f.directory), before);
});

test('independent setup actual process exits before commit and during staging preserve exact uncertainty boundary', async t => {
  for (const mode of ['precommit-crash', 'staging-crash']) await t.test(mode, async () => {
    const f = fixture(t, { parent: true }), before = facts(f.directory), running = await child(f, mode); running.running.send('commit'); assert.equal(await running.exit, 79);
    const cut = facts(f.directory), next = setup(f);
    if (mode === 'precommit-crash') { assert.deepEqual(cut, before); assert.equal((await next.state.resume()).phase, 'setup_required'); }
    else { assert.equal((await next.state.resume()).phase, 'recovery_required'); assert.equal(existsSync(f.databasePath), false); assert.equal(existsSync(statePaths(f).key), false); assert.throws(() => next.state.prepare(), { code: 'SETUP_RECOVERY_REQUIRED' }); }
    assert.equal(next.counts().activations, 0); assert.deepEqual(facts(f.directory), cut);
  });
});

test('independent setup real post-ack abrupt exit retains one encrypted task, exact namespace/key and dedup without replay', async t => {
  const f = fixture(t), running = await child(f, 'ack-crash'); running.running.send('commit'); assert.equal(await running.exit, 79);
  const ack = running.messages.at(-1); assert.equal(ack.phase, 'ready'); assert.match(ack.taskRef, /^[a-f0-9]{64}$/);
  const before = facts(f.directory), keyDigest = digest(readFileSync(statePaths(f).key)); assert.equal(readFileSync(f.databasePath).includes(Buffer.from('SYNTHETIC_ACK_CRASH_ENCRYPTED_GOAL')), false);
  let store, key, replays = 0; const owner = {};
  const s = setup(f, { activate(value) {
    key = value.encryptionKey; store = new RuntimeStore({ databasePath: f.databasePath, encryptionKey: key, principals: [{ handle: owner, role: 'owner', scope: value.identity }], hostPermission: () => false });
    const current = store.snapshot(owner, { taskRef: ack.taskRef }); assert.equal(current.task.status, 'queued'); assert.equal(current.workers.length, 0);
    const result = store.intake(owner, { taskId: 'acknowledged-task', provider: 'fixture', source: 'independent', eventId: 'ack-event', commandRef: reference('ack-readback'), goal: 'SYNTHETIC_ACK_CRASH_ENCRYPTED_GOAL' });
    assert.equal(result.deduplicated, true); assert.equal(result.task.taskRef, ack.taskRef); assert.equal(store.listTasks(owner).length, 1); replays++; return () => store.close();
  } });
  assert.equal((await s.state.resume()).phase, 'ready'); assert.equal(replays, 1); assert.equal(key.every(byte => byte === 0), true);
  assert.equal(digest(readFileSync(statePaths(f).key)), keyDigest); assert.deepEqual(facts(f.directory).filter(value => value.path.endsWith('key.bin') || value.path.endsWith('state.json')), before.filter(value => value.path.endsWith('key.bin') || value.path.endsWith('state.json')));
});

class CapturedResponse extends Writable {
  chunks = [];
  _write(chunk, encoding, done) { this.chunks.push(Buffer.from(chunk)); done(); }
  writeHead(status, headers = {}) { this.status = status; this.headers = headers; }
}
async function native(f) {
  const ctx = new Context(); ctx.logger.exporters.clear(); f.finally(() => ctx.fiber.dispose());
  let server; await ctx.plugin({ apply(c) { server = new WebServer(c, { host: '127.0.0.1', port: 3080, compression: 'none' }); } }); assert.equal(server.server, undefined);
  await ctx.plugin({ apply(c) { new FixtureCredentialProvider(c, join(f.root, 'synthetic-native-auth.json')); c.provide('profileContext', Object.freeze({ ...f.profile, builtin: false, installAnchor: f.root })); } });
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' }); await ctx.plugin(Loader);
  const id = await ctx.loader.create({ name: resolveHostSource('@deepseek-ai/dsh-client-connection'), inject: ['webServer'], config: { trustedHosts: [] } }); await ctx.loader.await(); const entry = ctx.loader.resolve(id); await entry.fiber.await();
  assert.equal(entry.moduleNamespace, Connection); assert.equal(entry.moduleNamespace.apply, Connection.apply); assert.equal(entry.moduleNamespace.Config, Connection.Config);
  const url = new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3080')); let cookie;
  ctx.connection.authorizeIndex({ method: 'GET', url: url.pathname + url.search, headers: { host: url.host } }, { writeHead(status, headers) { assert.equal(status, 303); cookie = headers['set-cookie'].split(';')[0]; }, end() {} });
  async function send(channel, endpoint, payload = {}, headers = {}, capturedRoute) {
    const request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'independent-setup-native', method: `v1/${endpoint}`, payload }))]);
    Object.assign(request, { method: 'POST', url: `${channel}/v1/${endpoint}`, headers: { host: url.host, origin: url.origin, cookie, 'content-type': 'application/json', ...headers } });
    const response = new CapturedResponse(), route = capturedRoute ?? server.prefixes.get(channel); assert.ok(route, 'native module route registered');
    await route.handler(request, response); const text = Buffer.concat(response.chunks).toString('utf8');
    return { status: response.status, text, ...(response.status === 200 ? { result: JSON.parse(text).result } : {}) };
  }
  return { ctx, server, send };
}

test('independent installed original native owner carrier enforces no-write auth, explicit storage consent and own closure', async t => {
  const f = fixture(t, { parent: true }), n = await native(f), before = facts(f.directory), fiber = n.ctx.plugin(Installed, { databasePath: f.databasePath }); await fiber;
  assert.equal(n.ctx.connection instanceof Connection.HostConnectionService, true); assert.deepEqual(Object.keys(n.ctx.dfSetup), ['diagnostics']); assert.equal(n.server.prefixes.has('/df-rpc'), false);
  assert.equal((await n.send('/df-setup', 'prepare', {}, { cookie: undefined })).status, 401);
  assert.equal((await n.send('/df-setup', 'prepare', {}, { origin: 'http://synthetic-untrusted.invalid' })).status, 403);
  const preview = (await n.send('/df-setup', 'prepare')).result.value;
  assert.deepEqual(Object.keys(preview).sort(), ['description', 'expiresAt', 'planDigest', 'previewRef']);
  for (const payload of [{ ...accepted(preview), ownerId: 'owner' }, { ...accepted(preview), role: 'owner' }, { ...accepted(preview), encryptionKey: 'SYNTHETIC_PRIVATE_SETUP_CANARY' }]) assert.equal((await n.send('/df-setup', 'confirm', payload)).result.error.code, 'SETUP_INVALID_INPUT');
  assert.equal((await n.send('/df-setup', 'confirm', { ...accepted(preview), accept: false })).result.error.code, 'SETUP_CONFIRMATION_REQUIRED');
  assert.equal((await n.send('/df-setup', 'not-supported')).result.error.code, 'ENDPOINT_NOT_FOUND'); assert.deepEqual(facts(f.directory), before);
  const confirmed = await n.send('/df-setup', 'confirm', accepted(preview)); assert.equal(confirmed.result.ok, true); assert.equal(confirmed.result.value.phase, 'ready');
  assert.deepEqual(Object.keys(confirmed.result.value).sort(), ['executionEnabled', 'phase', 'storage']); assert.equal(confirmed.result.value.executionEnabled, false);
  const child = n.ctx.df, setupDiagnostic = n.ctx.dfSetup; assert.deepEqual(child.diagnostics().capabilities, { memory: false, memoryContinuity: false, preview: false, worker: false, delivery: false, reviewer: false, automation: false, notifications: false });
  const input = { taskId: 'independent-native-task', provider: 'fixture', source: 'independent', eventId: 'native-event', commandRef: reference('native-command'), goal: 'SYNTHETIC_NATIVE_SETUP_ENCRYPTED_GOAL' };
  assert.equal((await n.send('/df-rpc', 'intake', input)).result.ok, true); assert.equal(readFileSync(f.databasePath).includes(Buffer.from(input.goal)), false);
  const oldSetupRoute = n.server.prefixes.get('/df-setup'), oldTaskRoute = n.server.prefixes.get('/df-rpc'), keyHash = digest(readFileSync(statePaths(f).key));
  const closing = fiber.dispose(); assert.throws(() => setupDiagnostic.diagnostics(), { code: 'SERVICE_DISPOSED' }); assert.throws(() => child.diagnostics(), { code: 'SERVICE_DISPOSED' });
  assert.equal((await n.send('/df-setup', 'confirm', accepted(preview), {}, oldSetupRoute)).result.error.code, 'SERVICE_DISPOSED');
  assert.equal((await n.send('/df-rpc', 'intake', { ...input, taskId: 'late-task', eventId: 'late-event', commandRef: reference('late-command') }, {}, oldTaskRoute)).result.error.code, 'SERVICE_DISPOSED');
  await closing; assert.equal(n.server.prefixes.has('/df-setup'), false); assert.equal(n.server.prefixes.has('/df-rpc'), false);
  const reload = n.ctx.plugin(Installed, { databasePath: f.databasePath }); await reload;
  assert.equal((await n.send('/df-setup', 'status')).result.value.phase, 'ready'); assert.equal((await n.send('/df-rpc', 'list')).result.value.length, 1);
  assert.equal(digest(readFileSync(statePaths(f).key)), keyHash); assert.equal(n.ctx.sessions.list().length, 0); assert.equal(n.server.server, undefined); await reload.dispose();
});

test('independent installed and testing-provider metadata retains original factory/client mappings', () => {
  const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(metadata.exports, { '.': './src/index.mjs', './runtime': './src/runtime-plugin.mjs', './installed': './src/installed-plugin.mjs', './client': './lib/client.js', './testing-provider': './src/testing-provider.mjs' });
  assert.equal(metadata.name, 'dsh-fishball'); assert.equal(metadata.version, '0.1.0-preview.1'); assert.equal(metadata.license, 'MIT');
  assert.equal(Installed.default.apply, Installed.apply); assert.equal(Installed.default.Config, Installed.Config);
  assert.deepEqual(Installed.inject, ['connection', 'sessions', 'approval', 'webServer', 'profileContext']);
  assert.equal(Installed.Config['~standard'].validate({ databasePath: '/synthetic/df-data/runtime.sqlite', profile: { dir: '/spoof' } }).issues[0].message, 'CONFIG_INVALID');
});
