import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, existsSync, mkdirSync, chmodSync, lstatSync, readdirSync, readFileSync, writeFileSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { resolveHostSource } from '../src/host-probe.mjs';
import { validateInstalledWorker } from '../src/installed-worker-config.mjs';
import { resolveInstalledWorkerFacts, installedRef } from '../src/installed-worker-facts.mjs';
import { RuntimeStore, reference as r } from '../src/runtime-store.mjs';

// Original installed no-listener services. The profile carrier, metadata-only
// adapter and trusted lifetime/invocation callbacks are explicit fixture doubles.
// No native create, provider stream, model/tool body or HTTP occurs in this file.
const load = name => import(pathToFileURL(resolveHostSource('@deepseek-ai/' + name)).href);
const { Context, symbols } = await load('cordis');
const { default: Loader, Entry } = await load('cordis-plugin-loader');
const { default: Sessions, SessionStore } = await load('dsh-session');
const { default: Projections } = await load('dsh-session-projection');
const { default: Approval } = await load('dsh-user-approval');
const { AgentRegistry } = await load('dsh-agent');
const { LlmRuntime, LlmAdapter } = await load('dsh-llm');
const { default: Prompt } = await load('dsh-system-prompt');
const { default: Tools } = await load('dsh-tools');
const { default: Presets } = await load('dsh-agent-preset-registry');
const { default: AgentLoop } = await load('dsh-agent-loop');
// rc.2 JSONL persistence exports a plugin namespace; its service is a SessionPersistence subclass.
const Jsonl = await load('dsh-session-persistence-jsonl');
const { SessionPersistence } = await load('dsh-session-persistence');
const runFile = promisify(execFile);
const baseUrl = new URL('../', import.meta.url).href;
const CANARY = 'SYNTHETIC_FACTS_PRIVATE_ERROR_CANARY';
const originalIdentity = value => value?.[symbols.original] ?? value;
const refs = label => Object.fromEntries(['taskRef', 'actionRef', 'claimRef', 'generationRef'].map(key => [key, installedRef('independent-' + key, label)]));
const dirFact = path => {
  const s = lstatSync(path);
  return { dev: s.dev, ino: s.ino, uid: s.uid, mode: s.mode & 0o777 };
};
const safeCode = code => error => error.code === code && error.message === code && !String(error).includes(CANARY);

async function fixture(t, { synthetic = false, providerCount = 1, modelCount = 1, effortCount = 0 } = {}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'df-independent-facts-'));
  // A normal owned profile/environment may be 0755. The data parent is 0700.
  chmodSync(dir, 0o755);
  const dataParent = join(dir, 'data'), environment = join(dir, 'environment'), cwd = join(environment, 'cwd');
  mkdirSync(dataParent, { mode: 0o700 }); mkdirSync(environment, { mode: 0o755 }); mkdirSync(cwd, { mode: 0o755 });
  const directory = join(dataParent, 'df-sessions'), ctx = new Context(), fibers = [], entries = [], removers = [];
  ctx.baseUrl = baseUrl;
  ctx.logger.exporters?.clear?.();
  const profile = Object.freeze({ dir, name: 'independent-synthetic-profile' });
  ctx.provide('profileContext', profile);
  let alive = true;
  const state = { streams: 0, listCalls: 0, resolveCalls: 0, listHook: null, resolveHook: null,
    catalogName: 'Independent display model', contextWindow: 8192, defaultMaxTokens: 512,
    inputModalities: ['text'], effortCount, modelCount, providerName: 'Free label is not pricing authority' };
  const routes = Array.from({ length: providerCount }, (_, index) => index ? 'independent-route-' + index : 'independent-metadata');
  function model(provider, id, index = 0) {
    return { provider, id, name: index ? 'Other model ' + index : state.catalogName,
      inputModalities: state.inputModalities, context: { contextWindow: state.contextWindow }, defaultMaxTokens: state.defaultMaxTokens,
      ...(state.effortCount ? { reasoning: { efforts: Array.from({ length: state.effortCount }, (_, i) => ({ id: 'effort-' + i, name: 'Effort ' + i })), defaultEffort: 'effort-0' } } : {}) };
  }
  class MetadataFixture extends LlmAdapter {
    providerInfo(provider) { return { id: provider, name: state.providerName }; }
    async listModels(provider) {
      state.listCalls++;
      await state.listHook?.(provider, state.listCalls);
      return Array.from({ length: state.modelCount }, (_, index) => model(provider, index ? 'model-' + index : 'text-v1', index));
    }
    async resolveModel(provider, id) {
      state.resolveCalls++;
      await state.resolveHook?.(provider, id, state.resolveCalls);
      return model(provider, id);
    }
    async *stream() { state.streams++; throw new Error('INFERENCE_NOT_AUTHORIZED_IN_FACTS_FIXTURE'); }
  }
  const adapter = new MetadataFixture();
  t.after(async () => {
    alive = false;
    for (const remove of removers.reverse()) await remove();
    for (const entry of entries.reverse()) await entry.fiber?.dispose();
    for (const fiber of fibers.reverse()) await fiber.dispose();
    rmSync(dir, { recursive: true, force: true });
  });
  async function install(plugin, config) {
    const fiber = ctx.plugin(plugin, config); fibers.push(fiber); await fiber; assert.equal(fiber.state, 2); return fiber;
  }
  async function entry(name, config) {
    const id = await ctx.loader.create({ name, config });
    await ctx.loader.await();
    const value = ctx.loader.resolve(id); entries.push(value); assert.equal(value.fiber.state, 2); return value;
  }
  await install(Projections); await install(Sessions); await install(Approval, { policy: 'never' });
  await install(AgentRegistry); const llmFiber = await install(LlmRuntime); await install(Prompt, {}); await install(Tools, {});
  await install(Loader, { baseUrl });
  const persistenceEntry = await entry('@deepseek-ai/dsh-session-persistence-jsonl', { root: directory, compression: 'none' });
  const loopEntry = await entry('@deepseek-ai/dsh-agent-loop', { agents: [], maxParallelToolCalls: 1 });
  await install(Presets, { default: 'independent-empty' });
  removers.push(await ctx.agentPresets.register({ id: 'independent-empty', plugins: [] }));
  let providerEntry;
  if (synthetic) providerEntry = await entry('dsh-fishball/testing-provider', {});
  else removers.push(ctx.llm.registerAdapter(routes, adapter));
  const choice = validateInstalledWorker({ enabled: true,
    selection: { provider: synthetic ? 'df-testing-local' : routes[0], model: synthetic ? 'df-testing-worker-v1' : 'text-v1', agentPreset: 'independent-empty', reasoningEffort: null, maxOutputTokens: 128 },
    environment: { root: environment, cwd }, persistence: { directory, compression: 'none', retention: 'owner-managed' },
    bounds: { requestBytes: 4096, resultBytes: 128 }, policy: { maxRuntimeMs: 10000, maxUsageUnits: 10000, maxCostEstimateMicros: 0 },
    charges: { runtimeMs: 1000, usageUnits: 4224 }, previewTtlMs: 1000, grantTtlMs: 1000 });
  const resolve = options => resolveInstalledWorkerFacts({ ctx, choice, profile, isAlive: () => alive, ...options });
  function noWork() {
    assert.equal(state.streams, 0); assert.equal(ctx.sessions.list().length, 0); assert.equal(ctx.agents.list().length, 0);
  }
  return { dir, dataParent, directory, environment, cwd, profile, ctx, choice, state, adapter, removers, fibers,
    persistenceEntry, loopEntry, llmFiber, providerEntry, install, entry, resolve, noWork, stop() { alive = false; } };
}

test('F01 actual classes and supplying factory entries expose resolved selected metadata without allocation', async t => {
  const f = await fixture(t, { effortCount: 2 }), before = readdirSync(f.dataParent), facts = await f.resolve();
  for (const [name, C] of Object.entries({ sessions: SessionStore, agents: AgentRegistry, llm: LlmRuntime, tools: Tools,
    systemPrompt: Prompt, approval: Approval, agentPresets: Presets, loader: Loader, sessionPersistence: SessionPersistence, agentLoop: AgentLoop })) {
    assert.ok(facts.services[name] instanceof C, name);
    assert.equal(originalIdentity(facts.services[name]), originalIdentity(f.ctx.reflect.get(name)), name);
  }
  for (const entry of [f.loopEntry, f.persistenceEntry]) assert.ok(entry instanceof Entry);
  assert.equal(f.loopEntry.moduleNamespace.default, AgentLoop); assert.equal(f.persistenceEntry.moduleNamespace, Jsonl); assert.equal(originalIdentity(facts.services.sessionPersistence).name, Jsonl.name);
  assert.ok(f.loopEntry.ctx.reflect.get('sessionPersistence') instanceof SessionPersistence);
  assert.equal(originalIdentity(f.loopEntry.ctx.reflect.get('sessionPersistence')), originalIdentity(f.ctx.sessionPersistence));
  const nativeList = await f.ctx.llm.listModels(f.choice.selection.provider);
  assert.equal(nativeList[0].context, undefined); assert.equal(nativeList[0].reasoning, undefined);
  assert.equal(facts.catalog.models[0].contextUnits, 8192); assert.equal(facts.catalog.models[0].maxOutputTokens, 512);
  assert.equal(facts.catalog.models[0].defaultEffort, 'effort-0'); assert.equal(facts.effort, 'effort-0');
  assert.equal(facts.reasoningRef, installedRef('df.installed-worker-reasoning/v1', 'effort-0', 128));
  assert.equal(facts.pricing, 'unknown'); assert.equal(facts.accounting, null); assert.equal(facts.providerBinding, null);
  assert.ok(Object.isFrozen(facts.labels)); assert.ok(Object.isFrozen(facts.catalog.models[0].reasoningEfforts[0]));
  assert.deepEqual(readdirSync(f.dataParent), before); assert.equal(existsSync(f.directory), false); f.noWork();
});

test('F02 fresh public resolution changes descriptive evidence and cannot rewrite an earlier frozen view', async t => {
  const f = await fixture(t), old = await f.resolve(), oldSnapshot = JSON.stringify(old.catalog);
  f.state.catalogName = 'Fresh model name'; f.state.contextWindow = 16384; f.state.defaultMaxTokens = 1024;
  const fresh = await f.resolve();
  assert.notEqual(fresh.modelRef, old.modelRef); assert.notEqual(fresh.catalogEvidenceRef, old.catalogEvidenceRef);
  assert.equal(fresh.sourceRef, old.sourceRef); assert.equal(fresh.environmentRef, old.environmentRef);
  assert.equal(fresh.catalog.models[0].contextUnits, 16384); assert.equal(fresh.labels.model, 'Fresh model name');
  assert.equal(JSON.stringify(old.catalog), oldSnapshot); assert.equal(old.labels.model, 'Independent display model');
  // assertCurrent is the documented source/lifetime/filesystem guard. It does
  // not turn descriptive generic catalogue metadata into a dispatch lease.
  assert.equal(old.assertCurrent(), true); assert.equal(fresh.pricing, 'unknown'); f.noWork();
});

test('F03 actual public catalogue bounds use N-1/N/N+1 without streams or a forged price', async t => {
  for (const [kind, boundary] of [['providerCount', 32], ['modelCount', 64], ['effortCount', 16]]) {
    for (const count of [boundary - 1, boundary, boundary + 1]) await t.test(kind + '=' + count, async t => {
      const f = await fixture(t, { [kind]: count });
      if (count > boundary) await assert.rejects(f.resolve(), safeCode('WORKER_CATALOG_UNAVAILABLE'));
      else {
        const facts = await f.resolve();
        const actual = kind === 'providerCount' ? facts.catalog.providers.length : kind === 'modelCount' ? facts.catalog.models.length : facts.catalog.models[0].reasoningEfforts.length;
        assert.equal(actual, count); assert.equal(facts.pricing, 'unknown');
      }
      assert.equal(existsSync(f.directory), false); f.noWork();
    });
  }
});

test('F04 exact selected model and advertised effort cannot be inferred from a label or catalog shape', async t => {
  for (const kind of ['missing-model', 'image-only', 'unsupported-effort']) await t.test(kind, async t => {
    const f = await fixture(t, { effortCount: 1 }); let choice = f.choice;
    if (kind === 'missing-model') f.state.modelCount = 0;
    if (kind === 'image-only') f.state.inputModalities = ['image'];
    if (kind === 'unsupported-effort') choice = validateInstalledWorker({ ...choice, selection: { ...choice.selection, reasoningEffort: 'unadvertised' } });
    await assert.rejects(f.resolve({ choice }), error => ['WORKER_CATALOG_UNAVAILABLE', 'WORKER_SOURCE_UNAVAILABLE'].includes(error.code) && !String(error).includes(CANARY));
    assert.equal(existsSync(f.directory), false); f.noWork();
  });
});

test('F05 original asynchronous list and both resolution boundaries recheck the private invocation', async t => {
  for (const stage of ['list', 'selected-model', 'effective-call']) await t.test(stage, async t => {
    const f = await fixture(t); let release, enteredResolve, allowed = true;
    const entered = new Promise(resolve => { enteredResolve = resolve; });
    const barrier = new Promise(resolve => { release = resolve; });
    if (stage === 'list') f.state.listHook = async () => { enteredResolve(); await barrier; };
    else f.state.resolveHook = async (_provider, _id, call) => {
      if (call === (stage === 'selected-model' ? 1 : 2)) { enteredResolve(); await barrier; }
    };
    const pending = f.resolve({ assertInvocation() { if (!allowed) { const e = new Error(CANARY); e.code = 'REQUEST_ABORTED'; throw e; } return true; } });
    await entered; allowed = false; release();
    await assert.rejects(pending, safeCode('REQUEST_ABORTED'));
    assert.equal(existsSync(f.directory), false); f.noWork();
  });
});

test('F06 lifetime decisions require synchronous true and redact hostile callback errors without reflection', async t => {
  const values = [false, 1, 'true', {}, Promise.resolve(true)];
  for (let i = 0; i < values.length; i++) await t.test('nonliteral-' + i, async t => {
    const f = await fixture(t); await assert.rejects(f.resolve({ assertInvocation: () => values[i] }), safeCode('SERVICE_DISPOSED'));
    assert.equal(f.state.listCalls, 0); assert.equal(existsSync(f.directory), false); f.noWork();
  });
  for (const kind of ['plain-throw', 'proxy-throw', 'code-getter']) await t.test(kind, async t => {
    const f = await fixture(t); let traps = 0;
    let error = new Error(CANARY);
    if (kind === 'proxy-throw') error = new Proxy(error, { get() { traps++; throw new Error(CANARY); }, getOwnPropertyDescriptor() { traps++; throw new Error(CANARY); } });
    if (kind === 'code-getter') Object.defineProperty(error, 'code', { get() { traps++; throw new Error(CANARY); } });
    await assert.rejects(f.resolve({ assertInvocation: () => { throw error; } }), safeCode('WORKER_SOURCE_UNAVAILABLE'));
    assert.equal(traps, 0); assert.equal(existsSync(f.directory), false); f.noWork();
  });
});

test('F07 filesystem drift during an actual native model await invalidates the completed observation', async t => {
  const f = await fixture(t); let release, start;
  const barrier = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { start = resolve; });
  f.state.resolveHook = async (_provider, _id, call) => { if (call === 1) { start(); await barrier; } };
  const pending = f.resolve(); await entered; chmodSync(f.dataParent, 0o755); release();
  await assert.rejects(pending, safeCode('WORKER_SOURCE_UNAVAILABLE'));
  assert.equal(existsSync(f.directory), false); f.noWork();
});

test('F08 private directory binding rejects hostile descriptors before access or allocation', async t => {
  const f = await fixture(t), facts = await f.resolve(), good = refs('descriptor'); let traps = 0;
  const descriptorCases = [
    { label: 'payload accessor', value: Object.defineProperty({ ...good }, 'taskRef', { enumerable: true, get() { traps++; throw new Error(CANARY); } }) },
    { label: 'unknown accessor', value: { ...good, get authority() { traps++; throw new Error(CANARY); } } },
    { label: 'Proxy', value: new Proxy(good, { getPrototypeOf() { traps++; throw new Error(CANARY); }, ownKeys() { traps++; throw new Error(CANARY); } }) },
    { label: 'hidden', value: Object.defineProperty({ ...good }, 'taskRef', { value: good.taskRef, enumerable: false }) },
    { label: 'symbol', value: { ...good, [Symbol('authority')]: true } },
    { label: 'null prototype', value: Object.assign(Object.create(null), good) },
    { label: 'missing', value: { actionRef: good.actionRef, claimRef: good.claimRef, generationRef: good.generationRef } },
  ];
  for (const item of descriptorCases) await t.test(item.label, () => assert.throws(() => facts.claimDirectory(item.value), safeCode('INVALID_INPUT')));
  for (const value of [good.taskRef.slice(1), good.taskRef + 'a', good.taskRef.toUpperCase(), 1]) await t.test('reference-' + String(value).length, () => assert.throws(() => facts.claimDirectory({ ...good, taskRef: value }), safeCode('WORKER_SOURCE_UNAVAILABLE')));
  assert.equal(traps, 0); assert.equal(facts.allocation, null); assert.equal(existsSync(f.directory), false); f.noWork();
});

test('F09 two absent observations cannot both adopt the exclusive claimed leaf', async t => {
  const f = await fixture(t), [a, b] = await Promise.all([f.resolve(), f.resolve()]);
  assert.equal(a.environmentRef, b.environmentRef); assert.equal(existsSync(f.directory), false);
  assert.equal(a.claimDirectory(refs('winner')), true); const inode = dirFact(f.directory);
  assert.equal(inode.mode, 0o700); assert.equal(a.allocation.approvedLeaf, null);
  assert.throws(() => b.claimDirectory(refs('loser')), safeCode('WORKER_SOURCE_UNAVAILABLE'));
  assert.equal(b.allocation, null); assert.deepEqual(dirFact(f.directory), inode);
  assert.deepEqual(a.allocation.claim, refs('winner')); assert.equal(a.assertCurrent(), true);
  assert.equal(a.claimDirectory(refs('winner')), true); assert.deepEqual(dirFact(f.directory), inode); f.noWork();
});

test('F10 a separate process winning the absent-leaf race is preserved and never adopted', async t => {
  const f = await fixture(t), facts = await f.resolve();
  const code = "const fs=require('node:fs');const p=process.argv[1];fs.mkdirSync(p,{mode:0o700});fs.writeFileSync(p+'/synthetic-winner.txt','independent child owns this leaf',{mode:0o600,flag:'wx'});";
  const child = await runFile(process.execPath, ['-e', code, f.directory], { env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, timeout: 10000 });
  assert.equal(child.stdout, ''); assert.equal(child.stderr, '');
  const inode = dirFact(f.directory), marker = readFileSync(join(f.directory, 'synthetic-winner.txt'));
  assert.throws(() => facts.claimDirectory(refs('late-parent')), safeCode('WORKER_SOURCE_UNAVAILABLE'));
  assert.equal(facts.allocation, null); assert.deepEqual(dirFact(f.directory), inode);
  assert.deepEqual(readFileSync(join(f.directory, 'synthetic-winner.txt')), marker); f.noWork();
});

test('F11 raced files and symlinks and changed inode facts refuse without overwrite or chmod', async t => {
  for (const kind of ['regular-file', 'dangling-symlink', 'foreign-directory', 'unsafe-directory']) await t.test(kind, async t => {
    const f = await fixture(t), facts = await f.resolve();
    if (kind === 'regular-file') writeFileSync(f.directory, 'synthetic existing entry', { mode: 0o600, flag: 'wx' });
    else if (kind === 'dangling-symlink') symlinkSync('synthetic-missing-target', f.directory);
    else mkdirSync(f.directory, { mode: kind === 'unsafe-directory' ? 0o755 : 0o700 });
    const before = dirFact(f.directory);
    assert.throws(() => facts.claimDirectory(refs(kind)), safeCode('WORKER_SOURCE_UNAVAILABLE'));
    assert.deepEqual(dirFact(f.directory), before); assert.equal(facts.allocation, null);
    if (kind === 'regular-file') assert.equal(readFileSync(f.directory, 'utf8'), 'synthetic existing entry');
    f.noWork();
  });
  for (const kind of ['data-parent', 'environment', 'cwd']) await t.test('replaced-' + kind, async t => {
    const f = await fixture(t), facts = await f.resolve(), path = kind === 'data-parent' ? f.dataParent : f[kind];
    const old = path + '-old'; renameSync(path, old); mkdirSync(path, { mode: kind === 'data-parent' ? 0o700 : 0o755 });
    if (kind === 'environment') mkdirSync(f.cwd, { mode: 0o755 });
    assert.throws(() => facts.assertCurrent(), safeCode('WORKER_SOURCE_UNAVAILABLE'));
    assert.equal(existsSync(f.directory), false); f.noWork();
  });
});

test('F12 borrowed facts methods keep their original native context and filesystem closure', async t => {
  const a = await fixture(t), b = await fixture(t), facts = await a.resolve();
  assert.equal(facts.claimDirectory.call({ ctx: b.ctx, choice: b.choice }, refs('borrowed-receiver')), true);
  assert.equal(existsSync(a.directory), true); assert.equal(existsSync(b.directory), false);
  assert.equal(facts.assertCurrent.call({ ctx: b.ctx }), true);
  await assert.rejects(resolveInstalledWorkerFacts({ ctx: b.ctx, choice: a.choice, profile: a.profile, isAlive: () => true }), safeCode('WORKER_PERSISTENCE_UNSUPPORTED'));
  a.noWork(); b.noWork();
});

test('F13 actual public service replacement and own factory reload retire captured facts', async t => {
  for (const kind of ['llm-service', 'jsonl-entry', 'loop-entry']) await t.test(kind, async t => {
    const f = await fixture(t), old = await f.resolve();
    if (kind === 'llm-service') {
      await f.llmFiber.dispose(); await f.install(LlmRuntime); f.removers.push(f.ctx.llm.registerAdapter(['independent-metadata'], f.adapter));
    } else {
      const entry = kind === 'jsonl-entry' ? f.persistenceEntry : f.loopEntry;
      await entry.update({ disabled: true }); await f.ctx.loader.await();
      assert.throws(() => old.assertCurrent(), error => ['WORKER_SOURCE_UNAVAILABLE', 'WORKER_PERSISTENCE_UNSUPPORTED'].includes(error.code));
      await entry.update({ disabled: false }); await f.ctx.loader.await();
    }
    assert.throws(() => old.assertCurrent(), safeCode('WORKER_SOURCE_UNAVAILABLE'));
    const fresh = await f.resolve(); assert.notEqual(fresh.sourceRef, old.sourceRef); assert.equal(fresh.assertCurrent(), true);
    assert.equal(existsSync(f.directory), false); f.noWork();
  });
});

test('F14 actual own provider source zero uses original entry fiber context in an optional child', async t => {
  const f = await fixture(t, { synthetic: true });
  const own = await import('../src/testing-provider.mjs');
  assert.equal(f.providerEntry.moduleNamespace.default, own.default); assert.ok(f.providerEntry instanceof Entry);
  assert.ok(f.providerEntry.fiber.ctx instanceof Context); assert.ok(Object.hasOwn(f.providerEntry.fiber.inject, 'llm'));
  assert.equal(f.providerEntry.fiber.inject.llm, null);
  assert.equal(own.getTestingProviderBinding(f.providerEntry.fiber.ctx).assertCurrent(), true);
  let child;
  const fiber = await f.install({ name: 'independent-optional-facts-child', inject: [], apply(ctx) { child = ctx; } }, {});
  assert.equal(Object.hasOwn(fiber.inject, 'llm'), false);
  const facts = await f.resolve({ ctx: child, isAlive: () => fiber.state === 2 });
  assert.equal(facts.pricing, 'source_zero'); assert.equal(facts.accounting, 'df-testing-utf8-byte-units/v1');
  assert.equal(facts.catalog.models[0].contextUnits, 135168); assert.equal(facts.effort, 'deterministic');
  assert.equal(facts.providerBinding.entry, f.providerEntry); assert.equal(facts.assertCurrent(), true);
  assert.equal(existsSync(f.directory), false); f.noWork();
  // Own child closure, not an unsupported immediate ancestor-disposal promise.
  const closing = fiber.dispose();
  assert.throws(() => facts.assertCurrent(), safeCode('SERVICE_DISPOSED'));
  assert.throws(() => facts.claimDirectory(refs('closed-child')), safeCode('SERVICE_DISPOSED'));
  await closing; assert.equal(existsSync(f.directory), false);
});

test('F15 topology change and explicit same-source reload cannot resurrect retained source-zero observations', async t => {
  const f = await fixture(t, { synthetic: true }), old = await f.resolve();
  const remove = f.ctx.llm.registerAdapter(['independent-unrelated-route'], f.adapter); f.removers.push(remove);
  assert.throws(() => old.assertCurrent(), safeCode('WORKER_REQUEST_DENIED'));
  remove();
  assert.throws(() => old.assertCurrent(), safeCode('WORKER_REQUEST_DENIED'));
  await f.providerEntry.update({ disabled: true }); await f.ctx.loader.await();
  await f.providerEntry.update({ disabled: false }); await f.ctx.loader.await();
  const fresh = await f.resolve(); assert.equal(fresh.pricing, 'source_zero'); assert.notEqual(fresh.sourceRef, old.sourceRef);
  assert.throws(() => old.claimDirectory(refs('stale-zero')), safeCode('WORKER_REQUEST_DENIED'));
  assert.equal(existsSync(f.directory), false); f.noWork();
});

test('F16 foreign same-name source and JSON labels never establish source-zero pricing', async t => {
  const f = await fixture(t);
  class ForeignLabels extends LlmAdapter {
    providerInfo(provider) { return { id: provider, name: 'Synthetic local DF provider (no network)' }; }
    async listModels(provider) { return [{ provider, id: 'df-testing-worker-v1', name: 'free', inputModalities: ['text'] }]; }
    async resolveModel(provider, id) { return { provider, id, name: 'free', inputModalities: ['text'], context: { contextWindow: 135168 }, defaultMaxTokens: 128,
      reasoning: { efforts: [{ id: 'deterministic', name: 'deterministic' }], defaultEffort: 'deterministic' } }; }
    async *stream() { throw new Error('NEVER_CALLED'); }
  }
  f.removers.push(f.ctx.llm.registerAdapter(['df-testing-local'], new ForeignLabels()));
  const choice = validateInstalledWorker({ ...f.choice, selection: { ...f.choice.selection, provider: 'df-testing-local', model: 'df-testing-worker-v1' } });
  await assert.rejects(f.resolve({ choice }), safeCode('WORKER_SOURCE_UNAVAILABLE'));
  assert.equal(existsSync(f.directory), false); f.noWork();
});

test('F17 actual encrypted claim precedes the private filesystem primitive; reopen holds uncertainty without native work', async t => {
  const f = await fixture(t, { synthetic: true }), facts = await f.resolve();
  assert.equal(existsSync(f.directory), false); assert.deepEqual(readdirSync(f.dataParent), []);
  const owner = {}, host = {}, scope = { ownerId: 'independent-facts-owner', workspaceId: 'independent-facts-workspace' }, key = Buffer.alloc(32, 109);
  let store, sequence = 0; const command = () => r('independent-facts-command-' + ++sequence);
  const config = { databasePath: join(f.dataParent, 'runtime.sqlite'), encryptionKey: key,
    principals: [{ handle: owner, role: 'owner', scope }, { handle: host, role: 'host', scope }], clock: () => 1000,
    hostPermission: () => facts.assertCurrent() };
  store = new RuntimeStore(config); f.removers.push(() => { store?.close(); key.fill(0); });
  const task = store.intake(owner, { taskId: 'independent-facts-task', provider: 'fixture', source: 'independent', eventId: 'one', commandRef: command(), goal: 'Independent synthetic approved goal' }).task;
  const holding = () => {
    const observation = new DatabaseSync(config.databasePath, { readOnly: true });
    try {
      return observation.prepare('SELECT count(*) AS n FROM reservations WHERE owner=? AND workspace=? AND task=?').get(task.ownerRef, task.workspaceRef, task.taskRef).n;
    } finally { observation.close(); }
  };
  const content = 'Independent synthetic encrypted prepared context';
  const context = store.putData(owner, { taskRef: task.taskRef, commandRef: command(), expectedTaskVersion: task.version,
    expectedAuthEpoch: task.authEpoch, kind: 'context', sourceRef: r('independent-prepared-source'), content,
    expectedMemory: { namespaceRef: r('independent-empty-memory'), revision: 0 } });
  const policy = store.policy(owner, { commandRef: command(), expectedVersion: 1, limits: { maxActive: 1 },
    modelPolicy: { version: 1, presetRefs: [facts.presetRef], catalogEvidenceRef: facts.catalogEvidenceRef } });
  const spec = { actionRef: command(), kind: 'write', role: 'worker', targetDigest: r('independent-target'), dataDigest: context.digest, units: 1,
    charges: { runtimeMs: f.choice.charges.runtimeMs, usageUnits: f.choice.charges.usageUnits, costEstimateMicros: 0, costState: 'estimated', costProvenanceRef: facts.sourceRef },
    attemptGroupRef: command(), attemptIndex: 1, resourcePolicyVersion: policy.version, modelPolicyVersion: 1,
    model: { presetRef: facts.presetRef, modelRef: facts.modelRef, reasoningRef: facts.reasoningRef, catalogEvidenceRef: facts.catalogEvidenceRef },
    executor: { mode: 'create', generationRef: command(), environmentRef: facts.environmentRef, bindingDigest: r('independent-binding'), toolsDigest: r('empty-tools'), permissionPolicyDigest: r('default-deny') } };
  const planned = store.planAction(owner, { taskRef: task.taskRef, commandRef: command(), expectedTaskVersion: context.task.version, expectedAuthEpoch: context.task.authEpoch, spec });
  const granted = store.grantAction(owner, { taskRef: task.taskRef, commandRef: command(), expectedTaskVersion: context.task.version,
    expectedAuthEpoch: context.task.authEpoch, actionRef: planned.actionRef, actionDigest: planned.actionDigest, expiresAt: 2000 });
  const preClaim = store.snapshot(owner, { taskRef: task.taskRef });
  assert.equal(existsSync(f.directory), false); assert.equal(preClaim.actions[0].state, 'requested'); assert.equal(holding(), 0);
  const claim = store.claimAction(host, { taskRef: task.taskRef, commandRef: command(), expectedTaskVersion: granted.task.version,
    expectedAuthEpoch: granted.authEpoch, actionRef: planned.actionRef, actionDigest: planned.actionDigest });
  const beforeDirectory = store.snapshot(owner, { taskRef: task.taskRef });
  assert.equal(beforeDirectory.actions[0].state, 'dispatch_intent'); assert.equal(holding(), 1);
  assert.equal(beforeDirectory.actions[0].claimRef, claim.claimRef); assert.equal(beforeDirectory.actions[0].releaseEvidenceRef, null);
  const exactClaim = { taskRef: task.taskRef, actionRef: claim.actionRef, claimRef: claim.claimRef, generationRef: claim.generationRef };
  assert.equal(facts.claimDirectory(exactClaim), true); assert.deepEqual(facts.allocation.claim, exactClaim);
  assert.deepEqual(store.snapshot(owner, { taskRef: task.taskRef }), beforeDirectory);
  assert.equal(readFileSync(config.databasePath).includes(Buffer.from(content)), false);
  const inode = dirFact(f.directory), environmentRef = facts.environmentRef;
  store.close(); store = new RuntimeStore(config);
  const recovered = store.snapshot(owner, { taskRef: task.taskRef });
  assert.equal(recovered.task.status, 'recovery_required'); assert.equal(holding(), 1);
  assert.equal(recovered.actions[0].claimRef, claim.claimRef); assert.equal(recovered.actions[0].releaseEvidenceRef, null);
  assert.equal(recovered.actions[0].state, 'unknown'); assert.deepEqual(dirFact(f.directory), inode);
  assert.equal(facts.environmentRef, environmentRef); f.noWork();
});
