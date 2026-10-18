import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { SetupState, SETUP_BOUNDS } from '../src/setup-state.mjs';
import * as Installed from '../src/installed-plugin.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { resolveHostSource } from '../src/host-probe.mjs';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { FixtureCredentialProvider } from '../scripts/runtime-web-credentials.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const moduleUrl = name => pathToFileURL(resolveHostSource(name)).href;
const { Context } = await import(moduleUrl('@deepseek-ai/cordis'));
const Connection = await import(moduleUrl('@deepseek-ai/dsh-client-connection'));
const { WebServer } = await import(moduleUrl('@deepseek-ai/dsh-host-webserver'));
const { default: SessionStore } = await import(moduleUrl('@deepseek-ai/dsh-session'));
const { default: ApprovalService } = await import(moduleUrl('@deepseek-ai/dsh-user-approval'));
const { Loader } = await import(moduleUrl('@deepseek-ai/cordis-plugin-loader'));
function temporary(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-install-author-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  chmodSync(directory, 0o755);
  return { directory, databasePath: join(directory, 'df/runtime.sqlite'), profile: { dir: directory, name: 'synthetic-install' } };
}
const accepted = preview => ({ previewRef: preview.previewRef, planDigest: preview.planDigest, accept: true });
function state(t, options = {}) {
  const f = temporary(t); let activations = 0, stops = 0, keyReference, namespace;
  const setup = new SetupState({ ...f, activate: ({ encryptionKey, identity }) => { activations++; keyReference = encryptionKey; namespace = identity; return () => { stops++; }; }, ...options });
  t.after(() => setup.dispose());
  return { ...f, setup, counts: () => ({ activations, stops }), key: () => keyReference, identity: () => namespace };
}
function snapshot(directory) {
  const values = [];
  function visit(path, tail = '') { for (const name of readdirSync(path).sort()) { const target = join(path, name), info = lstatSync(target), relative = join(tail, name); values.push([relative, info.ino, info.mode & 0o777, info.size, info.isFile() ? digest(readFileSync(target)) : 'entry']); if (info.isDirectory() && !info.isSymbolicLink()) visit(target, relative); } }
  visit(directory); return values;
}

test('read-only first status/preview and strict consent denials never create persistent entries', async t => {
  const f = state(t), before = snapshot(f.directory);
  assert.deepEqual(f.setup.status(), { phase: 'setup_required', executionEnabled: false, storage: { location: f.databasePath } });
  const preview = f.setup.prepare(); assert.equal(preview.description.externalExecution, false); assert.equal(preview.expiresAt > Date.now(), true);
  for (const accept of [undefined, false, 0, 1, 'true']) await assert.rejects(f.setup.confirm({ ...accepted(preview), accept }), { code: 'SETUP_CONFIRMATION_REQUIRED' });
  for (const input of [null, [], 'secret', { role: 'owner' }, Object.defineProperty({}, 'role', { get() { throw new Error('SYNTHETIC_SECRET'); } }), new Proxy({}, { getPrototypeOf() { throw new Error('SYNTHETIC_SECRET'); } })]) {
    assert.throws(() => f.setup.prepare(input), { code: 'SETUP_INVALID_INPUT' });
    await assert.rejects(f.setup.confirm(input), { code: 'SETUP_INVALID_INPUT' });
  }
  await assert.rejects(f.setup.confirm({ ...accepted(preview), key: 'SYNTHETIC_SECRET' }), { code: 'SETUP_INVALID_INPUT' });
  await assert.rejects(f.setup.confirm({ ...accepted(preview), planDigest: reference('different') }), { code: 'SETUP_PREVIEW_STALE' });
  assert.deepEqual(snapshot(f.directory), before); assert.equal(f.counts().activations, 0);
});

test('preview supersession, exact expiry, rollback and precommit abort have zero writes', async t => {
  for (const boundary of [-1, 0, 1]) {
    let now = 100; const f = state(t, { clock: () => now }); const preview = f.setup.prepare(); now = preview.expiresAt + boundary;
    if (boundary === -1) assert.equal((await f.setup.confirm(accepted(preview))).phase, 'ready');
    else { await assert.rejects(f.setup.confirm(accepted(preview)), { code: 'SETUP_PREVIEW_STALE' }); assert.deepEqual(snapshot(f.directory), []); }
  }
  let now = 100; const f = state(t, { clock: () => now }); const old = f.setup.prepare(); f.setup.prepare();
  await assert.rejects(f.setup.confirm(accepted(old)), { code: 'SETUP_PREVIEW_STALE' });
  const current = f.setup.prepare(); now = 99; await assert.rejects(f.setup.confirm(accepted(current)), { code: 'SETUP_PREVIEW_STALE' });
  now = 101; const next = f.setup.prepare(), abort = new AbortController(); abort.abort();
  await assert.rejects(f.setup.confirm(accepted(next), { signal: abort.signal }), { code: 'REQUEST_ABORTED' });
  assert.deepEqual(snapshot(f.directory), []);
});

test('clock crossing expiry during final trusted path recheck refuses the first persistent write', async t => {
  let now = 100, advance = false; const f = temporary(t);
  const setup = new SetupState({ ...f, clock: () => now, currentProfile() { if (advance) now = 60100; return f.profile; }, activate() { assert.fail('expired consent cannot activate'); } });
  const preview = setup.prepare(); advance = true;
  await assert.rejects(setup.confirm(accepted(preview)), { code: 'SETUP_PREVIEW_STALE' }); assert.deepEqual(snapshot(f.directory), []); await setup.dispose();
});

test('consented same-schema encrypted core, private state, one-use preview and retained namespace reopen', async t => {
  const f = state(t), preview = f.setup.prepare(); assert.equal((await f.setup.confirm(accepted(preview))).phase, 'ready');
  assert.equal(f.key().every(byte => byte === 0), true);
  const namespace = `${f.databasePath}.df-setup`, key = readFileSync(join(namespace, 'key.bin')), identity = f.identity(), owner = {};
  assert.equal(lstatSync(namespace).mode & 0o777, 0o700);
  for (const path of [f.databasePath, join(namespace, 'key.bin'), join(namespace, 'state.json')]) assert.equal(lstatSync(path).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(namespace).sort(), ['key.bin', 'state.json']);
  const store = new RuntimeStore({ databasePath: f.databasePath, encryptionKey: key, principals: [{ handle: owner, role: 'owner', scope: identity }], hostPermission: () => false });
  const input = { taskId: 'synthetic-install-task', provider: 'fixture', source: 'synthetic', eventId: 'one', commandRef: reference('one'), goal: 'SYNTHETIC_ENCRYPTED_GOAL_CANARY' };
  const task = store.intake(owner, input).task; store.close();
  assert.equal(readFileSync(f.databasePath).includes(Buffer.from(input.goal)), false); const before = snapshot(f.directory);
  await assert.rejects(f.setup.confirm(accepted(preview)), { code: 'SETUP_PREVIEW_STALE' }); await f.setup.dispose();
  let resumedKey; const next = new SetupState({ ...f, activate: ({ encryptionKey, identity: current }) => { resumedKey = encryptionKey; assert.deepEqual(current, identity); const reopened = new RuntimeStore({ databasePath: f.databasePath, encryptionKey, principals: [{ handle: owner, role: 'owner', scope: current }] }); assert.equal(reopened.intake(owner, { ...input, commandRef: reference('two') }).deduplicated, true); assert.equal(reopened.snapshot(owner, { taskRef: task.taskRef }).task.taskRef, task.taskRef); reopened.close(); return () => {}; } });
  assert.equal(next.status().phase, 'unavailable'); assert.equal((await next.resume()).phase, 'ready'); assert.equal(resumedKey.every(byte => byte === 0), true);
  assert.equal(digest(readFileSync(join(namespace, 'key.bin'))), digest(key)); assert.equal(snapshot(f.directory).length, before.length);
  await next.dispose(); key.fill(0);
});

test('retained target, every sidecar, dangling entries and lexical/path/mode drift preserve bytes', async t => {
  for (const suffix of ['', '-wal', '-shm', '-journal', '.df-setup']) {
    const f = state(t); mkdirSync(join(f.directory, 'df'), { mode: 0o700 }); writeFileSync(f.databasePath + suffix, 'synthetic-retained', { mode: 0o600 }); const before = snapshot(f.directory);
    assert.equal(f.setup.status().phase, suffix === '.df-setup' ? 'unavailable' : 'recovery_required'); assert.throws(() => f.setup.prepare(), { code: 'SETUP_RECOVERY_REQUIRED' }); assert.deepEqual(snapshot(f.directory), before);
  }
  for (const dangling of [false, true]) {
    const f = temporary(t), outside = join(f.directory, 'outside'); if (!dangling) mkdirSync(outside, { mode: 0o700 }); symlinkSync(outside, join(f.directory, 'df'));
    assert.throws(() => new SetupState({ ...f, activate: () => () => {} }), { code: 'SETUP_UNAVAILABLE' }); assert.equal(existsSync(join(outside, 'runtime.sqlite')), false);
  }
  const f = state(t), preview = f.setup.prepare(); chmodSync(f.directory, 0o777);
  await assert.rejects(f.setup.confirm(accepted(preview)), { code: 'SETUP_UNAVAILABLE' }); chmodSync(f.directory, 0o755);
  assert.deepEqual(snapshot(f.directory), []);
  for (const databasePath of [f.directory, join(f.directory, 'root.sqlite'), `${f.directory}-foreign/db.sqlite`, join(f.directory, 'df/../bad.sqlite')]) assert.throws(() => new SetupState({ ...f, databasePath, activate: () => () => {} }), { code: 'SETUP_UNAVAILABLE' });
});

test('publication contender, callback secrets and activation failure preserve accountable partials', async t => {
  const contender = state(t, { observeCommit(point) { if (point === 'staging_closed') writeFileSync(contender.databasePath, 'synthetic-other-owner', { mode: 0o600, flag: 'wx' }); } });
  await assert.rejects(contender.setup.confirm(accepted(contender.setup.prepare())), { code: 'SETUP_RECOVERY_REQUIRED' });
  assert.equal(readFileSync(contender.databasePath, 'utf8'), 'synthetic-other-owner'); assert.equal(existsSync(`${contender.databasePath}.df-setup/key.bin`), false);
  const f = state(t, { observeCommit(point) { if (point === 'key_published') throw new Error('SYNTHETIC_ERROR_PRIVATE_CANARY'); } });
  await assert.rejects(f.setup.confirm(accepted(f.setup.prepare())), error => error.message === 'SETUP_RECOVERY_REQUIRED');
  const before = snapshot(f.directory); assert.equal(f.setup.status().phase, 'recovery_required'); await f.setup.resume(); assert.deepEqual(snapshot(f.directory), before);
  const failed = state(t, { activate() { throw new Error('SYNTHETIC_ACTIVATION_CANARY'); } });
  await assert.rejects(failed.setup.confirm(accepted(failed.setup.prepare())), { code: 'SETUP_RECOVERY_REQUIRED' });
  assert.equal(existsSync(`${failed.databasePath}.df-setup/claim.json`), true); assert.equal(failed.setup.status().phase, 'recovery_required');
});

test('activation awaits recheck key/metadata/inode and own disposal, without replay or false ready', async t => {
  for (const change of ['key', 'metadata', 'database', 'dispose']) {
    let release, entered, stopped = 0, keyReference; const started = new Promise(resolve => { entered = resolve; });
    const f = state(t, { activate: ({ encryptionKey }) => { keyReference = encryptionKey; entered(); return new Promise(resolve => { release = () => resolve(() => { stopped++; }); }); } });
    const pending = f.setup.confirm(accepted(f.setup.prepare())); await started;
    if (change === 'dispose') await f.setup.dispose();
    else if (change === 'database') { renameSync(f.databasePath, `${f.databasePath}.retained`); writeFileSync(f.databasePath, 'different-inode', { mode: 0o600 }); }
    else { const path = `${f.databasePath}.df-setup/${change === 'key' ? 'key.bin' : 'state.json'}`; writeFileSync(path, change === 'key' ? Buffer.alloc(32, 7) : '{}'); }
    release(); await assert.rejects(pending, { code: change === 'dispose' ? 'SERVICE_DISPOSED' : 'SETUP_RECOVERY_REQUIRED' });
    assert.equal(keyReference.every(byte => byte === 0), true); assert.equal(stopped, 1); assert.equal(existsSync(`${f.databasePath}.df-setup/claim.json`), true);
  }
});

test('postcommit request abort retains valid ready state and cannot undo consent or initialize twice', async t => {
  const abort = new AbortController(), f = state(t, { activate() { abort.abort(); return () => {}; } }); const preview = f.setup.prepare();
  await assert.rejects(f.setup.confirm(accepted(preview), { signal: abort.signal }), { code: 'REQUEST_ABORTED' });
  assert.equal(f.setup.status().phase, 'ready'); assert.equal(existsSync(`${f.databasePath}.df-setup/claim.json`), false);
  await assert.rejects(f.setup.confirm(accepted(preview)), { code: 'SETUP_PREVIEW_STALE' });
});

test('future/corrupt/partial retained setup refuses repair or key replacement', async t => {
  for (const change of ['future', 'missing-key', 'key-mode', 'metadata-corrupt', 'unknown-entry', 'key-link']) {
    const f = state(t); await f.setup.confirm(accepted(f.setup.prepare())); await f.setup.dispose(); const namespace = `${f.databasePath}.df-setup`;
    if (change === 'future') { const value = JSON.parse(readFileSync(join(namespace, 'state.json'))); value.format = 'df-installed/v999'; writeFileSync(join(namespace, 'state.json'), JSON.stringify(value)); }
    if (change === 'missing-key') unlinkSync(join(namespace, 'key.bin'));
    if (change === 'key-mode') chmodSync(join(namespace, 'key.bin'), 0o644);
    if (change === 'metadata-corrupt') writeFileSync(join(namespace, 'state.json'), '{');
    if (change === 'unknown-entry') writeFileSync(join(namespace, 'foreign'), 'preserve', { mode: 0o600 });
    if (change === 'key-link') { renameSync(join(namespace, 'key.bin'), join(namespace, 'retained.bin')); symlinkSync(join(namespace, 'retained.bin'), join(namespace, 'key.bin')); }
    const before = snapshot(f.directory), next = new SetupState({ ...f, activate() { assert.fail('partial state must not activate'); } });
    assert.equal(next.status().phase, 'recovery_required', change); assert.equal((await next.resume()).phase, 'recovery_required', change); assert.throws(() => next.prepare()); assert.deepEqual(snapshot(f.directory), before); await next.dispose();
  }
});

test('exact inode and profile binding refuse same-byte replacement without following retained state', async t => {
  for (const replace of ['database', 'key', 'parent']) {
    const f = state(t); await f.setup.confirm(accepted(f.setup.prepare())); await f.setup.dispose();
    if (replace === 'parent') { renameSync(join(f.directory, 'df'), join(f.directory, 'retained')); mkdirSync(join(f.directory, 'df'), { mode: 0o700 }); renameSync(join(f.directory, 'retained/runtime.sqlite'), f.databasePath); renameSync(join(f.directory, 'retained/runtime.sqlite.df-setup'), `${f.databasePath}.df-setup`); }
    else { const path = replace === 'key' ? `${f.databasePath}.df-setup/key.bin` : f.databasePath; const bytes = readFileSync(path); renameSync(path, `${path}.retained`); writeFileSync(path, bytes, { mode: 0o600 }); bytes.fill(0); }
    const before = snapshot(f.directory), next = new SetupState({ ...f, activate() { assert.fail('replacement must not activate'); } });
    assert.equal(next.status().phase, 'recovery_required'); assert.equal((await next.resume()).phase, 'recovery_required'); assert.deepEqual(snapshot(f.directory), before); await next.dispose();
  }
  const f = state(t); const preview = f.setup.prepare(); const current = { ...f.profile }; const bound = new SetupState({ ...f, currentProfile: () => current, activate: () => () => {} }); const boundPreview = bound.prepare(); current.name = 'other-profile';
  await assert.rejects(bound.confirm(accepted(boundPreview)), { code: 'SETUP_UNAVAILABLE' }); assert.deepEqual(snapshot(f.directory), []); await bound.dispose();
  assert.throws(() => new SetupState({ ...f, databasePath: join(f.directory, 'df/\ud800.sqlite'), activate: () => () => {} }), { code: 'SETUP_UNAVAILABLE' }); assert.equal(preview.description.externalExecution, false);
  const alias = join(f.directory, 'alias'); symlinkSync(f.directory, alias);
  assert.throws(() => new SetupState({ ...f, profile: { ...f.profile, dir: alias }, activate: () => () => {} }), { code: 'SETUP_UNAVAILABLE' });
});

test('unload before trusted activation and corrupt ready-state read seals child admission', async t => {
  const f = state(t), preview = f.setup.prepare(); await f.setup.dispose();
  await assert.rejects(f.setup.confirm(accepted(preview)), { code: 'SERVICE_DISPOSED' }); assert.deepEqual(snapshot(f.directory), []);
  const active = state(t); await active.setup.confirm(accepted(active.setup.prepare())); unlinkSync(`${active.databasePath}.df-setup/key.bin`);
  assert.equal(active.setup.status().phase, 'recovery_required'); assert.equal(active.counts().stops, 1);
  assert.equal(active.setup.status().phase, 'recovery_required'); assert.equal(active.counts().stops, 1);
});

const childSource = `import { SetupState } from ${JSON.stringify(new URL('../src/setup-state.mjs', import.meta.url).href)};
const options=JSON.parse(process.argv[2]);
const state=new SetupState({...options,activate:()=>()=>{},observeCommit(point){if(process.argv[3]===point)process.exit(73)}});
const plan=state.prepare();process.send({phase:'prepared'});
process.once('message',async()=>{try{const result=await state.confirm({previewRef:plan.previewRef,planDigest:plan.planDigest,accept:true});process.send({phase:result.phase});await state.dispose();process.exit(0)}catch(error){process.send({phase:'denied',code:error.code});process.exit(0)}});`;
async function child(t, f, cut = '') {
  const path = join(f.directory, 'child.mjs'); writeFileSync(path, childSource, { mode: 0o600 });
  const processChild = fork(path, [JSON.stringify({ databasePath: f.databasePath, profile: f.profile }), cut], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => { if (processChild.exitCode === null) processChild.kill('SIGTERM'); });
  const messages = []; processChild.on('message', value => messages.push(value));
  const exit = new Promise((resolve, reject) => { const timer = setTimeout(() => { processChild.kill('SIGTERM'); reject(new Error('SYNTHETIC_CHILD_TIMEOUT')); }, 10000); processChild.once('exit', code => { clearTimeout(timer); resolve(code); }); processChild.once('error', reject); });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('SYNTHETIC_CHILD_PREPARE_TIMEOUT')), 10000); processChild.once('message', value => { clearTimeout(timer); assert.equal(value.phase, 'prepared'); resolve(); }); });
  return { processChild, exit, messages };
}

test('two genuine processes prepare before barrier and only one publishes the owned namespace', async t => {
  const f = temporary(t), a = await child(t, f), b = await child(t, f); a.processChild.send('confirm'); b.processChild.send('confirm');
  assert.deepEqual(await Promise.all([a.exit, b.exit]), [0, 0]); const results = [a.messages.at(-1), b.messages.at(-1)];
  assert.equal(results.filter(value => value.phase === 'ready').length, 1); assert.equal(results.filter(value => value.phase === 'denied').length, 1);
  const keyDigest = digest(readFileSync(`${f.databasePath}.df-setup/key.bin`));
  const next = new SetupState({ ...f, activate: () => () => {} }); assert.equal((await next.resume()).phase, 'ready'); assert.equal(digest(readFileSync(`${f.databasePath}.df-setup/key.bin`)), keyDigest); await next.dispose();
});

test('genuine abrupt child exits at six durable cuts preserve partial facts and never resume or replay', async t => {
  for (const cut of ['namespace_claimed', 'staging_closed', 'database_published', 'key_published', 'metadata_published', 'runtime_ready']) {
    const f = temporary(t), running = await child(t, f, cut); running.processChild.send('confirm'); assert.equal(await running.exit, 73);
    const before = snapshot(f.directory); let activations = 0; const next = new SetupState({ ...f, activate() { activations++; return () => {}; } });
    assert.equal(next.status().phase, 'recovery_required'); assert.equal((await next.resume()).phase, 'recovery_required'); assert.throws(() => next.prepare()); assert.equal(activations, 0); assert.deepEqual(snapshot(f.directory), before); await next.dispose();
  }
});

class Response extends Writable { constructor() { super(); this.parts = []; } _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); } writeHead(status, headers = {}) { this.status = status; this.headers = headers; } }
async function native(t) {
  const f = temporary(t), ctx = new Context(); ctx.logger.exporters.clear();
  t.after(async () => { await ctx.fiber.dispose(); });
  let server; await ctx.plugin({ apply(c) { server = new WebServer(c, { host: '127.0.0.1', port: 3080, compression: 'none' }); } }); assert.equal(server.server, undefined);
  await ctx.plugin({ apply(c) { new FixtureCredentialProvider(c, join(f.directory, 'synthetic-native-auth.json')); c.provide('profileContext', Object.freeze({ dir: f.profile.dir, name: f.profile.name, builtin: false, installAnchor: f.directory })); } });
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' }); await ctx.plugin(Loader);
  const id = await ctx.loader.create({ name: resolveHostSource('@deepseek-ai/dsh-client-connection'), inject: ['webServer'], config: { trustedHosts: [] } }); await ctx.loader.await(); const original = ctx.loader.resolve(id); await original.fiber.await();
  assert.equal(original.moduleNamespace, Connection); assert.equal(original.moduleNamespace.apply, Connection.apply); assert.deepEqual(Object.keys(original.fiber.inject).sort(), ['credentials', 'webServer']);
  const url = new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3080')); let cookie;
  ctx.connection.authorizeIndex({ method: 'GET', url: url.pathname + url.search, headers: { host: url.host } }, { writeHead(status, headers) { assert.equal(status, 303); cookie = headers['set-cookie'].split(';')[0]; }, end() {} });
  async function send(channel, method, payload = {}, headers = {}, borrowedRoute) {
    const request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'synthetic-installed-rpc', method: `v1/${method}`, payload }))]);
    Object.assign(request, { method: 'POST', url: `${channel}/v1/${method}`, headers: { host: url.host, origin: url.origin, cookie, 'content-type': 'application/json', ...headers } });
    const response = new Response(), route = borrowedRoute ?? server.prefixes.get(channel); assert.ok(route);
    await route.handler(request, response); const text = Buffer.concat(response.parts).toString(); return { status: response.status, text, ...(response.status === 200 ? { result: JSON.parse(text).result } : {}) };
  }
  return { ...f, ctx, server, send };
}

test('original public native owner setup has zero preconsent writes, actual child readiness, encrypted dedup and ten reloads', async t => {
  const f = await native(t), before = snapshot(f.directory), fiber = f.ctx.plugin(Installed, { databasePath: f.databasePath }); await fiber;
  assert.deepEqual(Object.keys(f.ctx.dfSetup), ['diagnostics']); assert.equal(f.server.prefixes.has('/df-rpc'), false); assert.equal((await f.send('/df-setup', 'status')).result.value.phase, 'setup_required');
  assert.equal((await f.send('/df-setup', 'prepare', {}, { cookie: undefined })).status, 401);
  assert.equal((await f.send('/df-setup', 'prepare', {}, { origin: 'http://synthetic.invalid' })).status, 403);
  const preview = (await f.send('/df-setup', 'prepare')).result.value; assert.deepEqual(snapshot(f.directory), before);
  assert.equal((await f.send('/df-setup', 'confirm', { ...accepted(preview), role: 'owner' })).result.error.code, 'SETUP_INVALID_INPUT'); assert.deepEqual(snapshot(f.directory), before);
  const result = await f.send('/df-setup', 'confirm', accepted(preview)); assert.deepEqual(result.result.error, undefined); assert.equal(result.result.ok, true); assert.equal(result.result.value.phase, 'ready'); assert.equal(f.server.prefixes.has('/df-rpc'), true);
  assert.deepEqual(f.ctx.df.diagnostics().capabilities, { memory: false, memoryContinuity: false, preview: false, worker: false, delivery: false, reviewer: false, automation: false, notifications: false });
  const input = { taskId: 'native-installed-task', provider: 'fixture', source: 'synthetic', eventId: 'one', commandRef: reference('native-intake'), goal: 'SYNTHETIC_NATIVE_ENCRYPTED_GOAL' };
  assert.equal((await f.send('/df-rpc', 'intake', input)).result.ok, true);
  const keyDigest = digest(readFileSync(`${f.databasePath}.df-setup/key.bin`)), metadataDigest = digest(readFileSync(`${f.databasePath}.df-setup/state.json`));
  assert.equal(readFileSync(f.databasePath).includes(Buffer.from(input.goal)), false);
  const oldRoute = f.server.prefixes.get('/df-setup'), borrowed = f.ctx.dfSetup; let current = fiber;
  for (let cycle = 0; cycle < 10; cycle++) {
    const taskDiagnostic = f.ctx.df, stopping = current.dispose(); assert.throws(() => borrowed.diagnostics(), { code: 'SERVICE_DISPOSED' }); assert.throws(() => taskDiagnostic.diagnostics(), { code: 'SERVICE_DISPOSED' }); assert.equal((await f.send('/df-setup', 'confirm', accepted(preview), {}, oldRoute)).result.error.code, 'SERVICE_DISPOSED'); await stopping;
    assert.equal(f.server.prefixes.has('/df-setup'), false); assert.equal(f.server.prefixes.has('/df-rpc'), false);
    current = f.ctx.plugin(Installed, { databasePath: f.databasePath }); await current;
    assert.equal((await f.send('/df-setup', 'status')).result.value.phase, 'ready'); assert.equal((await f.send('/df-rpc', 'list')).result.value.length, 1);
    assert.equal((await f.send('/df-rpc', 'intake', { ...input, commandRef: reference(`reload-${cycle}`) })).result.value.deduplicated, true);
    assert.equal(digest(readFileSync(`${f.databasePath}.df-setup/key.bin`)), keyDigest); assert.equal(digest(readFileSync(`${f.databasePath}.df-setup/state.json`)), metadataDigest);
  }
  assert.equal(f.ctx.sessions.list().length, 0); assert.equal(f.server.server, undefined); await current.dispose();
  const advanced = f.ctx.plugin(createRuntimePlugin(), { databasePath: join(f.directory, 'must-not-exist.sqlite') }); await assert.rejects(Promise.resolve(advanced), { code: 'RUNTIME_ADAPTER_UNAVAILABLE' }); await advanced.dispose();
  assert.equal(existsSync(join(f.directory, 'must-not-exist.sqlite')), false);
});

test('native startup future-schema refusal preserves setup/database facts and mounts no task route', async t => {
  const f = await native(t), fiber = f.ctx.plugin(Installed, { databasePath: f.databasePath }); await fiber;
  const preview = (await f.send('/df-setup', 'prepare')).result.value; assert.equal((await f.send('/df-setup', 'confirm', accepted(preview))).result.value.phase, 'ready'); await fiber.dispose();
  const db = new DatabaseSync(f.databasePath); db.exec('PRAGMA user_version=999'); db.close(); const before = snapshot(f.directory);
  const reopen = f.ctx.plugin(Installed, { databasePath: f.databasePath }); await reopen;
  assert.equal((await f.send('/df-setup', 'status')).result.value.phase, 'recovery_required'); assert.equal(f.server.prefixes.has('/df-rpc'), false); assert.deepEqual(snapshot(f.directory), before); await reopen.dispose();
});

test('installed entry missing concrete carrier remains pending before any storage or runtime', async t => {
  const f = temporary(t), ctx = new Context(); ctx.logger.exporters.clear(); t.after(() => ctx.fiber.dispose());
  const pending = ctx.plugin(Installed, { databasePath: f.databasePath }); assert.equal(pending.state, 0); assert.equal(ctx.get('dfSetup'), undefined); assert.deepEqual(snapshot(f.directory), []); await pending.dispose();
  assert.equal(Installed.default.apply, Installed.apply); assert.equal(Installed.default.Config, Installed.Config);
  assert.equal(Installed.Config['~standard'].validate({ databasePath: f.databasePath, ownerId: 'spoof' }).issues[0].message, 'CONFIG_INVALID');
  assert.equal(SETUP_BOUNDS.pathDepth, 16); assert.equal(SETUP_BOUNDS.previewLifetimeMs, 60000);
});
