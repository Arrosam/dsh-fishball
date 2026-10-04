import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fork, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { Readable, Writable } from 'node:stream';
import { Config as BaseConfig, validateConfig } from '../src/config.mjs';
import { Config, validateInstalledConfig } from '../src/installed-config.mjs';
import { prepareInstalledMemory, MEMORY_ACCOUNTING } from '../src/installed-memory.mjs';
import { installOperatorBridge } from '../src/operator-bridge.mjs';
import { DSH_WEB_RUNTIME_ROOT, resolveHostSource } from '../src/host-probe.mjs';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { ContextAssembler, compactContext } from '../src/context.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import * as Installed from '../src/installed-plugin.mjs';
import { FixtureCredentialProvider } from '../scripts/runtime-web-credentials.mjs';

// Independent NI1 cases. Typed capture, actual encrypted store, and genuine
// public no-listener native framing are explicitly separate evidence levels.
const sha = value => createHash('sha256').update(value).digest('hex');
const choice = { enabled: true, byteLimit: 65536, tokenLimit: 131072 };
const scope = { ownerId: 'NI1-independent-owner', workspaceId: 'NI1-independent-workspace' };
const canary = 'SYNTHETIC_NI1_PRIVATE_CANARY';
const stable = code => error => error.code === code && error.message === code;
function temporary(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-ni1-istqb-'));
  chmodSync(directory, 0o755);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function tableState(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return Object.fromEntries(['tasks', 'events', 'runtime_tasks', 'runtime_data', 'runtime_commands', 'workspace_memory'].map(name => {
      const rows = db.prepare(`SELECT * FROM ${name}`).all().map(row => JSON.stringify(row)).sort();
      return [name, { rows: rows.length, digest: sha(JSON.stringify(rows)) }];
    }));
  } finally { db.close(); }
}
function candidate(text, sourceRef = reference('independent-source'), confidence = 0.9) {
  return { kind: 'preference', content: { text }, sourceRefs: [sourceRef], observedAt: 1000, confidence, embedding: [-0.125, 0.5, 1] };
}
async function actualStore(t, overrides = {}) {
  const directory = temporary(t), databasePath = join(directory, 'ledger.sqlite'), key = randomBytes(32), owner = {}, other = {}, otherOwner = {};
  const profile = { dir: directory, name: 'independent-ni1' };
  const options = (await prepareInstalledMemory(choice))(scope, profile);
  const store = new RuntimeStore({ databasePath, encryptionKey: key, clock: () => 1000, hostPermission: () => false,
    principals: [{ handle: owner, role: 'owner', scope }, { handle: other, role: 'owner', scope: { ...scope, workspaceId: 'NI1-foreign-workspace' } }, { handle: otherOwner, role: 'owner', scope: { ...scope, ownerId: 'NI1-foreign-owner' } }],
    ...overrides });
  t.after(() => { store.close(); key.fill(0); });
  const assembler = new ContextAssembler({ store, tokenize: options.tokenize, clock: () => 1000, byteLimit: choice.byteLimit, tokenLimit: choice.tokenLimit });
  const memory = new MemoryAdapter({ store, handle: owner, contextAssembler: assembler, ...options });
  const intake = (goal = 'CURRENT GOAL FRONT; no network; CURRENT GOAL END', id = 'primary') => store.intake(owner,
    { taskId: id, provider: 'fixture', source: 'independent-source', eventId: `event-${id}`, commandRef: reference(`intake-${id}`), goal }).task;
  const input = task => ({ taskRef: task.taskRef, commandRef: reference('independent-prepared-context'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, terms: [], now: 1000 });
  return { directory, databasePath, key, owner, other, otherOwner, profile, options, store, assembler, memory, intake, input };
}
function transport(operations, isAlive) {
  const peer = {}, calls = []; let handler;
  const wrapped = Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, input => { calls.push({ name, input }); return operation(input); }]));
  const bridge = installOperatorBridge({ connection: { operator: peer, rpc: { handle(channel, fn) { assert.equal(channel, '/df-rpc'); handler = fn; return () => {}; } } }, operations: wrapped, ...(isAlive ? { isAlive } : {}) });
  return { peer, calls, bridge, call: (endpoint, payload, caller = peer, signal) => handler(endpoint, payload, signal, caller) };
}

test('NI1-01/02 independent closed installed-only config retains exact detached integer choices', () => {
  const base = { databasePath: '/tmp/synthetic-independent/df/runtime.sqlite' };
  assert.deepEqual(validateInstalledConfig(base), validateInstalledConfig({ ...base, memory: { enabled: false } }));
  for (const field of ['byteLimit', 'tokenLimit']) {
    const max = field === 'byteLimit' ? 65536 : 131072;
    for (const value of [1, 2, max - 1, max]) {
      const input = Object.assign(Object.create(null), { ...base, limits: Object.assign(Object.create(null), { maxActive: 1 }), memory: Object.assign(Object.create(null), { ...choice, [field]: value }) });
      const out = validateInstalledConfig(input); input.memory[field] = 0; input.limits.maxActive = 20;
      assert.equal(out.memory[field], value); assert.equal(out.limits.maxActive, 1);
      assert.ok(Object.isFrozen(out) && Object.isFrozen(out.memory) && Object.isFrozen(out.limits));
    }
    for (const value of [-0, -1, 0.9, max + 1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity, '1', true]) {
      const input = { ...base, memory: { ...choice, [field]: value } };
      assert.throws(() => validateInstalledConfig(input), stable('CONFIG_INVALID'));
      assert.deepEqual(Config['~standard'].validate(input), { issues: [{ message: 'CONFIG_INVALID' }] });
    }
  }
  for (const memory of [undefined, null, {}, { enabled: true, byteLimit: 1 }, { enabled: false, tokenLimit: 1 }, { ...choice, numericMode: true }, { ...choice, namespaceRef: reference('forged') }])
    assert.throws(() => validateInstalledConfig({ ...base, memory }), stable('CONFIG_INVALID'));
  assert.throws(() => validateConfig({ ...base, memory: choice }), stable('CONFIG_INVALID'));
  assert.ok(BaseConfig['~standard'].validate(base).value);
});

test('NI1-01 independent hidden nested config and revoked Proxy cannot invoke supplied hooks', () => {
  let traps = 0;
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const base = { databasePath: '/tmp/synthetic-independent/df/runtime.sqlite' };
  const sources = [
    { ...base, memory: Object.defineProperty({ enabled: true, tokenLimit: 1 }, 'byteLimit', { value: 1 }) },
    { ...base, memory: Object.defineProperty({}, 'enabled', { enumerable: true, get() { traps++; throw Error(canary); } }) },
    { ...base, limits: new Proxy({}, { getPrototypeOf() { traps++; throw Error(canary); } }) },
    { ...base, memory: revoked.proxy },
    Object.defineProperty({}, 'memory', { enumerable: true, get() { traps++; throw Error(canary); } }),
    { ...base, memory: { ...choice, [Symbol(canary)]: 0.9 } },
  ];
  for (const input of sources) assert.throws(() => validateInstalledConfig(input), stable('CONFIG_INVALID'));
  assert.equal(traps, 0);
});

test('NI1-04/09 public heuristic measures complete UTF-16 blocks and stable unambiguous private namespaces', async () => {
  const bind = await prepareInstalledMemory(choice), profile = { dir: '/tmp/synthetic-independent-profile', name: 'NI1' }, options = bind(scope, profile);
  assert.equal(MEMORY_ACCOUNTING, 'dsh-fixed-density-text/v1');
  for (const text of ['a'.repeat(3), 'a'.repeat(4), 'a'.repeat(5), '中文🙂\n\n', '🙂'.repeat(129), '"\\\n\t']) {
    assert.equal(options.tokenize(text), Math.ceil(text.length / 4) + 4);
    const composed = compactContext({ protectedText: text, backgrounds: [], byteLimit: Buffer.byteLength(text), tokenLimit: options.tokenize(text), tokenize: options.tokenize });
    assert.equal(composed.bytes, Buffer.byteLength(text, 'utf8')); assert.equal(composed.tokens, options.tokenize(text));
  }
  const expected = (identity, location) => sha(JSON.stringify(['df.installed-memory/v1', identity.ownerId, identity.workspaceId, location.dir, location.name]));
  assert.equal(options.namespaceRef, expected(scope, profile));
  assert.equal((await prepareInstalledMemory({ ...choice, byteLimit: 4096, tokenLimit: 256 }))(scope, profile).namespaceRef, options.namespaceRef);
  const pairs = [[{ ownerId: 'a:b', workspaceId: 'c' }, profile], [{ ownerId: 'a', workspaceId: 'b:c' }, profile], [scope, { ...profile, name: 'NI1:other' }], [scope, { ...profile, dir: profile.dir + '/other' }]];
  assert.equal(new Set(pairs.map(([identity, location]) => bind(identity, location).namespaceRef)).size, pairs.length);
  for (const [identity, location] of pairs) assert.equal(bind(identity, location).namespaceRef, expected(identity, location));
  assert.throws(() => options.tokenize('\udfff'), stable('TOKENIZER_UNAVAILABLE'));
});

test('NI1-03 independent physical public-export origins refuse executable/source alias and NODE_PATH rescue before import', async t => {
  const directory = temporary(t);
  for (const variant of ['canonical', 'missing', 'altered-source', 'conditional-alias', 'metadata-symlink', 'foreign-root', 'wrong-name']) {
    await t.test(variant, () => {
      const root = join(directory, variant), host = join(root, 'host'), peers = join(host, 'node_modules/@deepseek-ai'), plugin = join(host, 'node_modules/dsh-fishball');
      mkdirSync(join(plugin, 'src'), { recursive: true }); mkdirSync(join(plugin, 'scripts'));
      for (const name of ['config.mjs', 'installed-config.mjs', 'installed-worker-config.mjs', 'host-probe.mjs', 'installed-memory.mjs']) copyFileSync(new URL(`../src/${name}`, import.meta.url), join(plugin, 'src', name));
      copyFileSync(new URL('../scripts/dsh-web-runtime-lock.json', import.meta.url), join(plugin, 'scripts/dsh-web-runtime-lock.json'));
      for (const name of ['dsh', 'dsh-token-meter']) { mkdirSync(join(peers, name), { recursive: true }); copyFileSync(resolveHostSource('@deepseek-ai/' + name, 'package.json'), join(peers, name, 'package.json')); }
      const meter = join(peers, 'dsh-token-meter'), source = join(meter, 'lib/types/estimate.js'), metadata = join(meter, 'package.json');
      mkdirSync(dirname(source), { recursive: true }); copyFileSync(resolveHostSource('@deepseek-ai/dsh-token-meter', 'lib/types/estimate.js'), source);
      copyFileSync(join(DSH_WEB_RUNTIME_ROOT, 'package-lock.json'), join(host, 'package-lock.json'));
      if (variant === 'missing') rmSync(meter, { recursive: true });
      if (variant === 'altered-source') writeFileSync(source, readFileSync(source, 'utf8') + '\nglobalThis.NI1_UNREVIEWED_CODE_EXECUTED = true;\n');
      if (variant === 'conditional-alias') { const m = JSON.parse(readFileSync(metadata)); copyFileSync(source, join(dirname(source), 'alternate.js')); m.exports['./estimate'] = { import: './lib/types/alternate.js', ...m.exports['./estimate'] }; writeFileSync(metadata, JSON.stringify(m)); }
      if (variant === 'metadata-symlink') { const alias = metadata + '.same-bytes'; copyFileSync(metadata, alias); rmSync(metadata); symlinkSync(alias, metadata); }
      if (variant === 'foreign-root') { const alias = join(root, 'outside'); mkdirSync(join(alias, 'lib/types'), { recursive: true }); copyFileSync(metadata, join(alias, 'package.json')); copyFileSync(source, join(alias, 'lib/types/estimate.js')); rmSync(meter, { recursive: true }); symlinkSync(alias, meter); }
      if (variant === 'wrong-name') { const m = JSON.parse(readFileSync(metadata)); m.name = '@synthetic/dsh-token-meter'; writeFileSync(metadata, JSON.stringify(m)); }
      const script = join(plugin, 'probe.mjs');
      writeFileSync(script, `import {validateInstalledConfig} from './src/installed-config.mjs'; import {prepareInstalledMemory} from './src/installed-memory.mjs'; const disabled=validateInstalledConfig({databasePath:'/tmp/synthetic-independent/df/runtime.sqlite'}).memory; let result; try {const bind=await prepareInstalledMemory(${JSON.stringify(choice)}); result={count:bind(${JSON.stringify(scope)},{dir:'/tmp/synthetic',name:'NI1'}).tokenize('🙂🙂'),disabled:disabled.enabled,executed:globalThis.NI1_UNREVIEWED_CODE_EXECUTED===true};}catch(error){result={code:error.code,message:error.message,disabled:disabled.enabled,executed:globalThis.NI1_UNREVIEWED_CODE_EXECUTED===true};}console.log(JSON.stringify(result));`);
      const result = spawnSync(process.execPath, [script], { cwd: root, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', NODE_PATH: join(DSH_WEB_RUNTIME_ROOT, 'node_modules') }, timeout: 10000, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim().split('\n').length, 1);
      assert.deepEqual(JSON.parse(result.stdout), variant === 'canonical' ? { count: 5, disabled: false, executed: false } : { code: 'HOST_CAPABILITY_UNSUPPORTED', message: 'HOST_CAPABILITY_UNSUPPORTED', disabled: false, executed: false });
      assert.equal(existsSync(join(root, 'runtime.sqlite')), false);
    });
  }
});

test('NI1-N01/N05/N06 independent exact classification preserves fractions but denies every other registered name', async () => {
  const names = ['memoryRemember', 'prepareContext', 'memoryRead', 'memoryRememberNear', 'prepareContextNear', 'control', 'policy', 'grant', 'execute', 'configureNotifications'];
  const f = transport(Object.fromEntries(names.map(name => [name, input => input])));
  for (const name of names) for (const value of [0.9, 0.9 + Number.EPSILON, -0.125, Number.MIN_VALUE, 4503599627370495.5]) {
    const before = f.calls.length, source = { value, nested: [{ value }], method: 'memoryRemember', fractions: true };
    const result = await f.call(`v1/${name}`, source);
    if (['memoryRemember', 'prepareContext'].includes(name)) {
      assert.equal(result.ok, true); assert.ok(Object.is(result.value.nested[0].value, value)); assert.notEqual(result.value, source);
      assert.ok(Object.isFrozen(result.value.nested[0]));
    } else { assert.equal(result.error.code, 'INVALID_INPUT'); assert.equal(f.calls.length, before); }
  }
  for (const name of names) for (const value of [0, 1, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]) assert.equal((await f.call(`v1/${name}`, { value })).ok, true);
  for (const name of ['memoryRemember', 'prepareContext']) for (const value of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1e100]) {
    const before = f.calls.length; assert.equal((await f.call(`v1/${name}`, { nested: [value] })).error.code, 'INVALID_INPUT'); assert.equal(f.calls.length, before);
  }
  for (const endpoint of ['v1/memoryRemember%00', 'v1/prepareContext?mode=fractional', 'v1/memoryRemember\n', 'v1/%70repareContext', '/v1/prepareContext', 'v1/preparecontext']) {
    const before = f.calls.length; assert.equal((await f.call(endpoint, new Proxy({}, {}))).error.code, 'ENDPOINT_NOT_FOUND'); assert.equal(f.calls.length, before);
  }
  await f.bridge.dispose();
});

test('NI1-N07/N08 independent recursive multibyte size, descriptor and pre-admission fences remain strict', async () => {
  let traps = 0, alive = true;
  const f = transport({ memoryRemember: input => input, prepareContext: input => input }, () => alive);
  const overhead = Buffer.byteLength(JSON.stringify({ confidence: 0.9, text: '' }));
  for (const bytes of [65535, 65536, 65537]) {
    const fill = bytes - overhead, input = { confidence: 0.9, text: '中'.repeat(Math.floor(fill / 3)) + 'a'.repeat(fill % 3) };
    assert.equal(Buffer.byteLength(JSON.stringify(input)), bytes);
    const before = f.calls.length, result = await f.call('v1/prepareContext', input);
    if (bytes <= 65536) assert.equal(result.ok, true); else { assert.equal(result.error.code, 'INPUT_TOO_LARGE'); assert.equal(f.calls.length, before); }
  }
  const hostile = new Proxy({}, { getPrototypeOf() { traps++; throw Error(canary); } });
  const accessor = Object.defineProperty({ confidence: 0.9 }, 'nested', { enumerable: true, get() { traps++; throw Error(canary); } });
  const bad = [{ nested: hostile }, accessor, { values: Object.assign([0.9], { hidden: 1 }) }, { values: new Array(1) }, Object.assign(Object.create(null), { confidence: 0.9 }), { value: Object.defineProperty({}, 'confidence', { value: 0.9 }) }, { confidence: 0.9, [Symbol(canary)]: 1 }];
  for (const input of bad) { const before = f.calls.length; assert.equal((await f.call('v1/memoryRemember', input)).error.code, 'INVALID_INPUT'); assert.equal(f.calls.length, before); }
  assert.equal((await f.call('v1/memoryRemember', hostile, {})).error.code, 'OPERATOR_REQUIRED');
  const abort = new AbortController(); abort.abort(); assert.equal((await f.call('v1/prepareContext', hostile, f.peer, abort.signal)).error.code, 'REQUEST_ABORTED');
  alive = false; assert.equal((await f.call('v1/memoryRemember', hostile)).error.code, 'SERVICE_DISPOSED'); assert.equal(traps, 0);
  await f.bridge.dispose();
});

test('NI1-N09 independent captured decimals survive caller mutation and committed fact is not erased by late abort', async () => {
  let resolve, seen, writes = 0;
  const gate = new Promise(r => { resolve = r; });
  const f = transport({ memoryRemember: async input => { seen = input; writes++; await gate; return { confidence: input.candidate.confidence }; }, prepareContext() { throw Object.assign(Error(canary), { code: canary }); } });
  const abort = new AbortController(), source = { candidate: { confidence: 0.9, embedding: [-0.125, 0.5] } };
  const pending = f.call('v1/memoryRemember', source, f.peer, abort.signal);
  source.candidate.confidence = 0.1; source.candidate.embedding[0] = 0.9; abort.abort(); resolve();
  assert.deepEqual((await pending).value, { confidence: 0.9 }); assert.deepEqual(seen.candidate.embedding, [-0.125, 0.5]); assert.equal(writes, 1);
  assert.deepEqual(await f.call('v1/prepareContext', { vectors: [[0.1]] }), { ok: false, error: { code: 'OPERATION_REJECTED', message: 'OPERATION_REJECTED', details: {} } });
  await f.bridge.dispose();
});

test('NI1-05/08 actual encrypted empty memory and cross-workspace/profile identical query remain isolated', async t => {
  const f = await actualStore(t), before = tableState(f.databasePath);
  assert.equal(f.memory.state().revision, 0); assert.deepEqual(tableState(f.databasePath), before);
  const text = 'SYNTHETIC_INDEPENDENT_LANGUAGE_PREFERENCE';
  f.memory.remember({ commandRef: reference('first-remember'), expectedRevision: 0, candidate: candidate(text) });
  const foreign = new MemoryAdapter({ store: f.store, handle: f.other, ...f.options });
  assert.deepEqual(foreign.retrieve({ terms: [text], now: 1000 }).candidates, []);
  const foreignOwner = new MemoryAdapter({ store: f.store, handle: f.otherOwner, ...f.options });
  assert.deepEqual(foreignOwner.retrieve({ terms: [text], now: 1000 }).candidates, []);
  const profileOptions = (await prepareInstalledMemory(choice))(scope, { ...f.profile, name: 'another-profile' });
  const anotherProfile = new MemoryAdapter({ store: f.store, handle: f.owner, ...profileOptions });
  assert.deepEqual(anotherProfile.retrieve({ terms: [text], now: 1000 }).candidates, []);
  assert.equal(f.memory.retrieve({ terms: [text], now: 1000 }).candidates[0].provenance.confidence, 0.9);
  assert.equal(readFileSync(f.databasePath).includes(Buffer.from(text)), false);
  assert.throws(() => new MemoryAdapter({ store: f.store, handle: {}, ...f.options }), stable('UNAUTHORIZED'));
});

test('NI1-08 adapter-only encrypted correction/delete keeps fresh sourced revisions and historical replay after reopen', async t => {
  const f = await actualStore(t), original = { commandRef: reference('history-original'), expectedRevision: 0, candidate: candidate('ORIGINAL_SYNTHETIC_MEMORY') };
  const first = f.memory.remember(original), id = first.result.id;
  const corrected = f.memory.correct({ commandRef: reference('history-correction'), expectedRevision: 1, id, expectedFactRevision: 1, candidate: candidate('CURRENT_CORRECTED_SYNTHETIC_MEMORY', reference('correction-source'), 0.1) });
  assert.equal(corrected.revision, 2); assert.equal(f.memory.state().projection.core.preferences[0].text, 'CURRENT_CORRECTED_SYNTHETIC_MEMORY');
  const fact = f.memory.state().projection.facts[0]; assert.equal(fact.revision, 2); assert.equal(fact.previousRevision, 1); assert.equal(fact.confidence, 0.1);
  assert.equal(f.memory.forget({ commandRef: reference('history-deletion'), expectedRevision: 2, id, expectedFactRevision: 2 }).revision, 3);
  assert.equal(f.memory.state().projection.core.preferences.length, 0); assert.equal(f.memory.state().projection.facts[0].deleted, true);
  const next = f.memory.remember({ commandRef: reference('history-next'), expectedRevision: 3, candidate: candidate('NEXT_SYNTHETIC_MEMORY', reference('next-source'), 0) });
  assert.ok(next.result.id > id); assert.equal(next.revision, 4);
  f.store.close();
  const reopened = new RuntimeStore({ databasePath: f.databasePath, encryptionKey: f.key, clock: () => 1000, principals: [{ handle: f.owner, role: 'owner', scope }] }); t.after(() => reopened.close());
  const memory = new MemoryAdapter({ store: reopened, handle: f.owner, ...f.options }), before = tableState(f.databasePath), replay = memory.remember(original);
  assert.equal(replay.deduplicated, true); assert.equal(replay.revision, 1); assert.equal(replay.digest, first.digest); assert.equal(memory.state().revision, 4);
  assert.equal(memory.state().projection.core.preferences[0].text, 'NEXT_SYNTHETIC_MEMORY'); assert.deepEqual(tableState(f.databasePath), before);
});

test('NI1-09/10 public heuristic token N-1/N/N+1 removes optional records whole including separators', async () => {
  const options = (await prepareInstalledMemory(choice))(scope, { dir: '/tmp/synthetic-independent', name: 'token-boundary' });
  const protectedText = 'CURRENT Chinese约束 🙂 MUST NEVER TRIM', backgrounds = [{ ref: reference('optional-one'), text: 'FIRST OPTIONAL SOURCED BACKGROUND' }, { ref: reference('optional-two'), text: 'SECOND OPTIONAL SOURCED BACKGROUND' }];
  const full = [protectedText, ...backgrounds.map(value => value.text)].join('\n\n'), count = options.tokenize(full);
  for (const tokenLimit of [count, count + 1]) {
    const out = compactContext({ protectedText, backgrounds, byteLimit: 65536, tokenLimit, tokenize: options.tokenize });
    assert.equal(out.text, full); assert.deepEqual(out.retainedRefs, backgrounds.map(value => value.ref)); assert.deepEqual(out.droppedRefs, []);
  }
  const reduced = compactContext({ protectedText, backgrounds, byteLimit: 65536, tokenLimit: count - 1, tokenize: options.tokenize });
  assert.equal(reduced.text, protectedText + '\n\n' + backgrounds[0].text); assert.deepEqual(reduced.droppedRefs, [backgrounds[1].ref]);
  assert.equal(reduced.tokens, Math.ceil(reduced.text.length / 4) + 4); assert.equal(reduced.bytes, Buffer.byteLength(reduced.text));
  assert.throws(() => compactContext({ protectedText, backgrounds, byteLimit: 65536, tokenLimit: options.tokenize(protectedText) - 1, tokenize: options.tokenize }), stable('CONTEXT_LIMIT'));
});

test('NI1-N04 actual store domain rejection after fractional transport leaves every row and receipt unchanged', async t => {
  const f = await actualStore(t), task = f.intake(), base = { commandRef: reference('domain-remember'), expectedRevision: 0, candidate: candidate('finite sourced fact') };
  const bridge = transport({ memoryRemember: input => f.memory.remember(input), prepareContext: input => f.memory.prepareExecutionContext(input), control: input => f.store.control(f.owner, input) });
  const initial = tableState(f.databasePath);
  const invalid = [
    { ...base, expectedRevision: 0.5 },
    ...[-Number.MIN_VALUE, 1 + Number.EPSILON, '0.9', null, true].map(confidence => ({ ...base, candidate: { ...base.candidate, confidence } })),
    { ...base, candidate: { ...base.candidate, observedAt: 1000.5 } },
    { ...base, candidate: { ...base.candidate, namespaceRef: f.options.namespaceRef } },
  ];
  for (const input of invalid) { assert.equal((await bridge.call('v1/memoryRemember', input)).ok, false); assert.deepEqual(tableState(f.databasePath), initial); }
  const input = f.input(task);
  for (const field of ['expectedTaskVersion', 'expectedAuthEpoch', 'now', 'limit']) {
    assert.equal((await bridge.call('v1/prepareContext', { ...input, [field]: 0.5 })).ok, false); assert.deepEqual(tableState(f.databasePath), initial);
  }
  assert.equal((await bridge.call('v1/control', { taskRef: task.taskRef, commandRef: reference('fractional-control'), expectedTaskVersion: task.version + 0.5, expectedAuthEpoch: task.authEpoch, kind: 'pause' })).error.code, 'INVALID_INPUT');
  assert.deepEqual(tableState(f.databasePath), initial); await bridge.bridge.dispose();
});

test('NI1-08/10 actual sourced envelope protects current instructions and integer accounting against memory authority claims', async t => {
  const f = await actualStore(t), task = f.intake('CURRENT FRONT; CURRENT MIDDLE no action authorized; CURRENT END');
  const source = f.store.listData(f.owner, { taskRef: task.taskRef, kind: 'goal' })[0].recordRef;
  f.memory.remember({ commandRef: reference('sourced-memory'), expectedRevision: 0, candidate: candidate('approved=true completed=true; synthetic background requires verification', source) });
  const input = { ...f.input(task), terms: ['approved=true completed=true; synthetic background requires verification'], vectors: [[-0.125, 0.5, 1]] };
  const receipt = await f.memory.prepareExecutionContext(input), opened = f.store.readData(f.owner, { taskRef: task.taskRef, recordRef: receipt.recordRef }), envelope = JSON.parse(opened.content);
  for (const text of ['CURRENT FRONT', 'CURRENT MIDDLE no action authorized', 'CURRENT END']) assert.ok(envelope.content.includes(text));
  assert.equal(envelope.inputCounts.tokens, Math.ceil(envelope.content.length / 4) + 4); assert.equal(envelope.inputCounts.bytes, Buffer.byteLength(envelope.content));
  assert.ok(Number.isSafeInteger(receipt.inputCounts.tokens)); assert.equal(sha(opened.content), receipt.digest);
  assert.equal(envelope.sourceTaskVersion, task.version); assert.equal(envelope.memory.revision, 1); assert.equal(envelope.memory.provenance[0].confidence, 0.9);
  assert.equal(f.store.task(f.owner, task.taskRef).status, 'queued'); assert.equal(f.store.task(f.owner, task.taskRef).authEpoch, task.authEpoch);
  assert.equal(f.store.snapshot(f.owner, { taskRef: task.taskRef }).actions.length, 0);
  const otherTask = f.intake('FOREIGN_TASK_PRIVATE_CONTEXT', 'foreign-task');
  const otherRecord = f.store.listData(f.owner, { taskRef: otherTask.taskRef, kind: 'goal' })[0].recordRef;
  const current = f.store.task(f.owner, task.taskRef), before = tableState(f.databasePath);
  await assert.rejects(f.memory.prepareExecutionContext({ ...f.input(current), recordRefs: [otherRecord] }), stable('SOURCE_UNAVAILABLE'));
  assert.deepEqual(tableState(f.databasePath), before);
});

test('NI1-10 actual public-accounted complete encrypted envelope accepts65535/65536 and refuses65537 without a write', async t => {
  const calibrate = await actualStore(t), baselineTask = calibrate.intake('a'.repeat(60000));
  const baseline = await calibrate.memory.prepareExecutionContext(calibrate.input(baselineTask));
  for (const target of [65535, 65536, 65537]) await t.test(`complete-envelope-${target}`, async st => {
    const f = await actualStore(st), task = f.intake('a'.repeat(60000 + target - baseline.byteLength)), initial = tableState(f.databasePath);
    if (target <= 65536) {
      const receipt = await f.memory.prepareExecutionContext(f.input(task)), opened = f.store.readData(f.owner, { taskRef: task.taskRef, recordRef: receipt.recordRef });
      assert.equal(receipt.byteLength, target); assert.equal(Buffer.byteLength(opened.content), target);
      const value = JSON.parse(opened.content); assert.equal(value.inputCounts.tokens, Math.ceil(value.content.length / 4) + 4); assert.ok(value.inputCounts.bytes < target);
    } else { await assert.rejects(f.memory.prepareExecutionContext(f.input(task)), stable('CONTEXT_LIMIT')); assert.deepEqual(tableState(f.databasePath), initial); }
  });
});

test('NI1-10 actual rendered protected minimum N-1 refuses and exactN/N+1 preserve text', async t => {
  const f = await actualStore(t), task = f.intake('首部 🙂 MIDDLE CONSTRAINT 禁止授权 END');
  const assembled = await f.assembler.assemble(f.owner, { taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
  const { commandRef: _prepareOnly, ...assemblyInput } = f.input(task);
  for (const delta of [-1, 0, 1]) {
    const opts = { ...f.options, byteLimit: assembled.bytes + delta };
    const memory = new MemoryAdapter({ store: f.store, handle: f.owner, ...opts, contextAssembler: new ContextAssembler({ store: f.store, tokenize: opts.tokenize, clock: () => 1000, byteLimit: opts.byteLimit, tokenLimit: opts.tokenLimit }) });
    const before = tableState(f.databasePath);
    if (delta < 0) await assert.rejects(memory.assembleContext(assemblyInput), stable('CONTEXT_LIMIT'));
    else { const value = await memory.assembleContext(assemblyInput); assert.equal(value.text, assembled.text); assert.equal(value.bytes, assembled.bytes); }
    assert.deepEqual(tableState(f.databasePath), before);
  }
});

test('NI1-11 actual async namespace and task/auth races refuse stale prepared writes', async t => {
  for (const kind of ['memory', 'task']) await t.test(kind, async st => {
    const f = await actualStore(st), task = f.intake();
    const pending = f.memory.prepareExecutionContext(f.input(task));
    if (kind === 'memory') f.memory.remember({ commandRef: reference('race-memory'), expectedRevision: 0, candidate: candidate('new current memory') });
    else f.store.control(f.owner, { taskRef: task.taskRef, commandRef: reference('race-pause'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, kind: 'pause' });
    const winner = tableState(f.databasePath);
    await assert.rejects(pending, stable(kind === 'memory' ? 'STALE_MEMORY' : 'STALE_VERSION'));
    assert.deepEqual(tableState(f.databasePath), winner); assert.equal(f.store.listData(f.owner, { taskRef: task.taskRef, kind: 'context' }).length, 0);
  });
});

test('NI1-14 actual registered secret is refused before memory/context persistence', async t => {
  const f = await actualStore(t, { forbiddenSecrets: [canary] }), memory = new MemoryAdapter({ store: f.store, handle: f.owner, knownSecrets: [canary], ...f.options }), before = tableState(f.databasePath);
  assert.throws(() => memory.remember({ commandRef: reference('secret-memory'), expectedRevision: 0, candidate: candidate(canary) }), stable('SECRET_REJECTED'));
  assert.deepEqual(tableState(f.databasePath), before); assert.equal(readFileSync(f.databasePath).includes(Buffer.from(canary)), false);
});

class Response extends Writable {
  constructor() { super(); this.parts = []; }
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  writeHead(status) { this.status = status; }
}
async function native(t) {
  const directory = temporary(t), databasePath = join(directory, 'df/runtime.sqlite'), module = name => import(pathToFileURL(resolveHostSource('@deepseek-ai/' + name)).href);
  const [{ Context }, { WebServer }, { default: SessionStore }, { default: ApprovalService }, { Loader }] = await Promise.all([module('cordis'), module('dsh-host-webserver'), module('dsh-session'), module('dsh-user-approval'), module('cordis-plugin-loader')]);
  const ctx = new Context(); ctx.logger.exporters.clear(); t.after(() => ctx.fiber.dispose());
  let server;
  await ctx.plugin({ apply(c) { server = new WebServer(c, { host: '127.0.0.1', port: 3080, compression: 'none' }); } });
  assert.equal(server.server, undefined);
  await ctx.plugin({ apply(c) { new FixtureCredentialProvider(c, join(directory, 'synthetic-auth.json')); c.provide('profileContext', Object.freeze({ dir: directory, name: 'independent-ni1', builtin: false, installAnchor: directory })); } });
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' }); await ctx.plugin(Loader);
  const connectionId = await ctx.loader.create({ name: resolveHostSource('@deepseek-ai/dsh-client-connection'), inject: ['webServer'], config: { trustedHosts: [] } });
  await ctx.loader.await(); await ctx.loader.resolve(connectionId).fiber.await();
  const url = new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3080')); let cookie;
  ctx.connection.authorizeIndex({ method: 'GET', url: url.pathname + url.search, headers: { host: url.host } }, { writeHead(status, headers) { assert.equal(status, 303); cookie = headers['set-cookie'].split(';')[0]; }, end() {} });
  let sequence = 0;
  const send = async (channel, method, payload = {}, headers = {}, borrowed) => {
    const request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: `NI1-${++sequence}`, method: `v1/${method}`, payload }))]);
    Object.assign(request, { method: 'POST', url: `${channel}/v1/${method}`, headers: { host: url.host, origin: url.origin, cookie, 'content-type': 'application/json', ...headers } });
    const response = new Response(), route = borrowed ?? server.prefixes.get(channel); assert.ok(route);
    await route.handler(request, response);
    return { status: response.status, ...(response.status === 200 ? JSON.parse(Buffer.concat(response.parts).toString()).result : {}) };
  };
  const good = async (method, payload = {}) => { const value = await send('/df-rpc', method, payload); assert.equal(value.ok, true, value.error?.code); return value.value; };
  return { directory, databasePath, ctx, server, send, good };
}

test('NI1-06/07 public native features before consent are closed read-only metadata, never memory authority', async t => {
  const f = await native(t), fiber = f.ctx.plugin(Installed, { databasePath: f.databasePath, memory: choice }); await fiber;
  const expected = { memory: { enabled: true, ready: false, accounting: MEMORY_ACCOUNTING, bounds: { byteLimit: 65536, tokenLimit: 131072 } } };
  for (let i = 0; i < 4; i++) assert.deepEqual((await f.send('/df-setup', 'features')).value, expected);
  assert.equal((await f.send('/df-setup', 'features', {}, { cookie: undefined })).status, 401);
  assert.equal((await f.send('/df-setup', 'features', {}, { origin: 'http://synthetic-foreign.invalid' })).status, 403);
  for (const payload of [{ enabled: true }, { ownerId: scope.ownerId }, { memory: { ready: true } }]) assert.equal((await f.send('/df-setup', 'features', payload)).error.code, 'SETUP_INVALID_INPUT');
  const preview = (await f.send('/df-setup', 'prepare')).value;
  assert.equal((await f.send('/df-setup', 'confirm', { ...preview, accept: false })).ok, false);
  assert.equal(existsSync(dirname(f.databasePath)), false); assert.equal(f.ctx.get('df'), undefined); assert.equal(f.ctx.sessions.list().length, 0);
  assert.equal(f.ctx.get('tokenMeter'), undefined); assert.equal(f.server.server, undefined); await fiber.dispose();
});

test('NI1-N02/N03 public native decimal domains, exact receipts and encrypted context survive disable/re-enable own closure', async t => {
  const f = await native(t), fiber = f.ctx.plugin(Installed, { databasePath: f.databasePath, memory: choice }); await fiber;
  const preview = (await f.send('/df-setup', 'prepare')).value;
  const confirmed = await f.send('/df-setup', 'confirm', { previewRef: preview.previewRef, planDigest: preview.planDigest, accept: true }); assert.equal(confirmed.value.phase, 'ready');
  assert.equal((await f.send('/df-setup', 'features')).value.memory.ready, true);
  const emptyRows = tableState(f.databasePath), empty = await f.good('memoryRead'); assert.equal(empty.revision, 0); assert.deepEqual(tableState(f.databasePath), emptyRows);
  const task = (await f.good('intake', { taskId: 'native-independent', provider: 'fixture', source: 'source', eventId: 'event', commandRef: reference('native-intake'), goal: 'CURRENT_NATIVE_FRONT preserve constraints CURRENT_NATIVE_END' })).task;
  const sourceRef = (await f.good('status', { taskRef: task.taskRef })).data.find(row => row.kind === 'goal').recordRef;
  const text = 'SYNTHETIC_NATIVE_FRACTIONAL_PREFERENCE', request = { commandRef: reference('native-remember'), expectedRevision: 0, candidate: candidate(text, sourceRef, 0.9) };
  const remembered = await f.good('memoryRemember', request); assert.equal(remembered.revision, 1);
  const committed = tableState(f.databasePath), replay = await f.good('memoryRemember', request); assert.equal(replay.deduplicated, true); assert.deepEqual(tableState(f.databasePath), committed);
  assert.equal((await f.send('/df-rpc', 'memoryRemember', { ...request, candidate: { ...request.candidate, confidence: 0.9 + Number.EPSILON } })).ok, false); assert.deepEqual(tableState(f.databasePath), committed);
  for (const [field, value] of [['expectedRevision', 1.5], ['observedAt', 1000.5], ['confidence', -Number.MIN_VALUE], ['confidence', 1 + Number.EPSILON]]) {
    const invalid = field === 'expectedRevision' ? { ...request, expectedRevision: value } : { ...request, expectedRevision: 1, candidate: { ...request.candidate, [field]: value } };
    invalid.commandRef = reference(`native-invalid-${field}-${value}`);
    assert.equal((await f.send('/df-rpc', 'memoryRemember', invalid)).ok, false); assert.deepEqual(tableState(f.databasePath), committed);
  }
  const input = { taskRef: task.taskRef, commandRef: reference('native-context'), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, terms: [text], vectors: [[-0.125, 0.5, 1]], now: 1000 };
  for (const field of ['expectedTaskVersion', 'expectedAuthEpoch', 'now', 'limit']) {
    assert.equal((await f.send('/df-rpc', 'prepareContext', { ...input, commandRef: reference(`native-invalid-${field}`), [field]: 0.5 })).ok, false); assert.deepEqual(tableState(f.databasePath), committed);
  }
  const prepared = await f.good('prepareContext', input), current = (await f.good('status', { taskRef: task.taskRef })).task;
  const detail = await f.good('detail', { taskRef: task.taskRef, recordRef: prepared.recordRef, expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch }), envelope = JSON.parse(detail.data.content);
  assert.equal(envelope.memory.provenance[0].confidence, 0.9); assert.equal(envelope.inputCounts.tokens, Math.ceil(envelope.content.length / 4) + 4); assert.equal(envelope.inputCounts.bytes, Buffer.byteLength(envelope.content));
  assert.equal(sha(detail.data.content), prepared.digest); assert.equal(envelope.sourceTaskVersion, task.version); assert.equal(readFileSync(f.databasePath).includes(Buffer.from(text)), false);
  const key = sha(readFileSync(f.databasePath + '.df-setup/key.bin')), state = sha(readFileSync(f.databasePath + '.df-setup/state.json'));
  const staleSetup = f.server.prefixes.get('/df-setup'), staleRpc = f.server.prefixes.get('/df-rpc'), borrowed = f.ctx.df;
  const stopping = fiber.dispose(); assert.throws(() => borrowed.diagnostics(), stable('SERVICE_DISPOSED'));
  assert.equal((await f.send('/df-rpc', 'memoryRemember', request, {}, staleRpc)).error.code, 'SERVICE_DISPOSED');
  assert.equal((await f.send('/df-setup', 'features', {}, {}, staleSetup)).error.code, 'SERVICE_DISPOSED'); await stopping;
  const disabled = f.ctx.plugin(Installed, { databasePath: f.databasePath }); await disabled;
  assert.equal((await f.send('/df-rpc', 'memoryRead')).error.code, 'CAPABILITY_UNAVAILABLE'); assert.deepEqual((await f.send('/df-setup', 'features')).value.memory, { enabled: false, ready: false, accounting: null, bounds: null }); await disabled.dispose();
  const reenabled = f.ctx.plugin(Installed, { databasePath: f.databasePath, memory: { ...choice, byteLimit: 4096, tokenLimit: 512 } }); await reenabled;
  const retained = await f.good('memoryRead'); assert.equal(retained.namespaceRef, empty.namespaceRef); assert.equal(retained.revision, 1); assert.equal(retained.projection.facts[0].confidence, 0.9);
  assert.equal((await f.send('/df-setup', 'features')).value.memory.ready, true); assert.equal(sha(readFileSync(f.databasePath + '.df-setup/key.bin')), key); assert.equal(sha(readFileSync(f.databasePath + '.df-setup/state.json')), state);
  assert.deepEqual(readdirSync(f.databasePath + '.df-setup').sort(), ['key.bin', 'state.json']); assert.equal(f.ctx.sessions.list().length, 0); assert.equal(f.ctx.get('tokenMeter'), undefined); assert.equal(f.server.server, undefined); await reenabled.dispose();
});

test('NI1-11/13 independent already-open processes deduplicate one decimal command and retain abrupt acknowledgement', async t => {
  const directory = temporary(t), databasePath = join(directory, 'ledger.sqlite'), keyPath = join(directory, 'synthetic-key.bin'), key = randomBytes(32), owner = {};
  writeFileSync(keyPath, key, { mode: 0o600 });
  const initial = new RuntimeStore({ databasePath, encryptionKey: key, principals: [{ handle: owner, role: 'owner', scope }] }); initial.close(); key.fill(0);
  const script = join(directory, 'contender.mjs'), moduleUrl = name => new URL(`../src/${name}`, import.meta.url).href;
  writeFileSync(script, `import {readFileSync} from 'node:fs'; import {RuntimeStore,reference} from ${JSON.stringify(moduleUrl('runtime-store.mjs'))}; import {MemoryAdapter} from ${JSON.stringify(moduleUrl('memory.mjs'))}; import {prepareInstalledMemory} from ${JSON.stringify(moduleUrl('installed-memory.mjs'))}; const f=JSON.parse(process.argv[2]),handle={},store=new RuntimeStore({databasePath:f.databasePath,encryptionKey:readFileSync(f.keyPath),principals:[{handle,role:'owner',scope:f.scope}],fixtureMode:f.cut===true,fixtureFaults:f.cut?point=>{if(point==='before_commit')process.exit(78)}:undefined}); const options=(await prepareInstalledMemory(f.choice))(f.scope,{dir:f.directory,name:'process'}),memory=new MemoryAdapter({...options,store,handle}); process.send({ready:true,revision:memory.state().revision}); process.once('message',()=>{try{const r=memory.remember({commandRef:reference('SAME_COMMAND'),expectedRevision:0,candidate:{kind:'preference',content:{text:'SYNTHETIC_PROCESS_DECIMAL'},sourceRefs:[reference('source')],observedAt:1000,confidence:0.9,embedding:[-0.125,0.5]}});process.send({ack:true,revision:r.revision,digest:r.digest,deduplicated:r.deduplicated===true},()=>process.exit(79));}catch(e){process.send({denied:e.code},()=>process.exit(80));}});`);
  function child(cut = false) {
    const proc = fork(script, [JSON.stringify({ directory, databasePath, keyPath, scope, choice, cut })], { env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    t.after(() => { if (proc.exitCode === null) proc.kill('SIGTERM'); });
    const messages = [], opened = new Promise((resolve, reject) => { proc.once('error', reject); proc.once('message', resolve); });
    proc.on('message', value => messages.push(value));
    const exited = new Promise((resolve, reject) => { const timer = setTimeout(() => { proc.kill('SIGTERM'); reject(Error('NI1_CHILD_TIMEOUT')); }, 15000); proc.once('exit', code => { clearTimeout(timer); resolve(code); }); });
    return { proc, messages, opened, exited };
  }
  const cut = child(true); assert.deepEqual(await cut.opened, { ready: true, revision: 0 }); cut.proc.send('commit'); assert.equal(await cut.exited, 78);
  const first = child(), second = child(); assert.deepEqual(await first.opened, { ready: true, revision: 0 }); assert.deepEqual(await second.opened, { ready: true, revision: 0 }); first.proc.send('commit'); second.proc.send('commit');
  const exits = await Promise.all([first.exited, second.exited]); assert.ok(exits.every(code => [79, 80].includes(code)));
  const outcomes = [first.messages.at(-1), second.messages.at(-1)]; assert.ok(outcomes.some(value => value.ack));
  for (const value of outcomes) if (value.denied) assert.equal(value.denied, 'STALE_MEMORY'); else assert.equal(value.revision, 1);
  const replay = child(); assert.deepEqual(await replay.opened, { ready: true, revision: 1 }); replay.proc.send('commit'); assert.equal(await replay.exited, 79); assert.equal(replay.messages.at(-1).deduplicated, true);
  assert.equal(replay.messages.at(-1).digest, outcomes.find(value => value.ack).digest);
  const reopened = new RuntimeStore({ databasePath, encryptionKey: readFileSync(keyPath), principals: [{ handle: owner, role: 'owner', scope }] }); t.after(() => reopened.close());
  const options = (await prepareInstalledMemory(choice))(scope, { dir: directory, name: 'process' }), memory = new MemoryAdapter({ store: reopened, handle: owner, ...options });
  assert.equal(memory.state().revision, 1); assert.equal(memory.state().projection.facts.length, 1); assert.equal(memory.state().projection.facts[0].confidence, 0.9); assert.equal(readFileSync(databasePath).includes(Buffer.from('SYNTHETIC_PROCESS_DECIMAL')), false);
});
