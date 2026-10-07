import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, chmodSync, rmSync, lstatSync, existsSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveHostSource } from '../src/host-probe.mjs';
import { resolveInstalledWorkerFacts } from '../src/installed-worker-facts.mjs';
import { runInstalledWorkerInvocation, assertInstalledWorkerInvocation } from '../src/installed-invocation.mjs';
import { BootstrapError } from '../src/config.mjs';
import { hash } from '../src/runtime-security.mjs';

// Source resolver and actual original public classes only. No engine author
// fixtures, WorkerManager/NativeAdapter, DB, listener, agent/session creation,
// tool dispatch or LLM stream/inference. Catalog metadata resolution is real.
const load = name => import(pathToFileURL(resolveHostSource('@deepseek-ai/' + name)).href);
const { Context } = await load('cordis');
const { default: Sessions } = await load('dsh-session');
const { default: Projections } = await load('dsh-session-projection');
const { default: Approval } = await load('dsh-user-approval');
const { AgentRegistry } = await load('dsh-agent');
const { LlmRuntime } = await load('dsh-llm');
const { default: Tools } = await load('dsh-tools');
const { default: Prompt } = await load('dsh-system-prompt');
const { default: Presets } = await load('dsh-agent-preset-registry');
const { default: Loader } = await load('cordis-plugin-loader');
const models = { producer: 'df-testing-worker-v1', review: 'df-testing-review-v1', repair: 'df-testing-repair-v1' };
const denied = error => ['WORKER_SOURCE_UNAVAILABLE', 'WORKER_PERSISTENCE_UNSUPPORTED', 'SERVICE_DISPOSED'].includes(error.code);
const leafFact = directory => { const s = lstatSync(directory); return { dev: s.dev, ino: s.ino, uid: s.uid, mode: s.mode & 0o777 }; };

async function fixture(t, { existing = false } = {}) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'df-ni3-directory-'));
  chmodSync(dir, 0o700);
  const data = join(dir, 'data'), environment = join(dir, 'environment'), directory = join(data, 'df-sessions');
  mkdirSync(data, { mode: 0o700 }); mkdirSync(environment, { mode: 0o700 });
  if (existing) mkdirSync(directory, { mode: 0o700 });
  const ctx = new Context(), baseUrl = new URL('../', import.meta.url).href;
  ctx.baseUrl = baseUrl; ctx.logger.exporters?.clear?.();
  const profile = { dir, name: 'ni3-directory-synthetic' }; ctx.provide('profileContext', profile);
  t.after(async () => { try { await ctx.fiber.dispose(); } finally { rmSync(dir, { recursive: true, force: true }); } });
  const install = async (plugin, config) => { const fiber = ctx.plugin(plugin, config); await fiber; assert.equal(fiber.state, 2); return fiber; };
  await install(Projections); await install(Sessions); await install(Approval, { policy: 'never' });
  await install(AgentRegistry); await install(LlmRuntime); await install(Prompt, {}); await install(Tools, {}); await install(Loader, { baseUrl });
  const entry = async (name, config) => { const id = await ctx.loader.create({ name, config }); await ctx.loader.await(); const e = ctx.loader.resolve(id); assert.equal(e.fiber.state, 2); return e; };
  const persistenceEntry = await entry('@deepseek-ai/dsh-session-persistence-jsonl', { root: directory, compression: 'none' });
  await entry('@deepseek-ai/dsh-agent-loop', { agents: [], maxParallelToolCalls: 1 });
  await install(Presets, { default: 'ni3-directory-empty' }); await ctx.agentPresets.register({ id: 'ni3-directory-empty', plugins: [] });
  const providerEntry = await entry('dsh-fishball/testing-provider', {});
  let sourceCtx, ownerCurrent = true, streams = 0;
  await install({ name: 'ni3-original-directory-source', inject: ['agents','llm','sessions','tools','systemPrompt','agentPresets','sessionPersistence','approval','agentLoop','loader','profileContext'], apply(child) { sourceCtx = child; } });
  ctx.on('llm/stream', () => { streams++; throw new Error('Allocation fixture must not stream'); });
  const guard = () => { if (!ownerCurrent) throw new BootstrapError('OPERATOR_REQUIRED'); return true; };
  const run = callback => runInstalledWorkerInvocation(sourceCtx, guard, callback);
  const isAlive = () => sourceCtx.fiber.state === 2 && sourceCtx.fiber.uid !== null;
  const choice = role => ({ enabled: true, selection: { provider: 'df-testing-local', model: models[role], agentPreset: 'ni3-directory-empty', reasoningEffort: 'deterministic', maxOutputTokens: role === 'producer' ? 128 : 2048 }, environment: { root: environment, cwd: environment }, persistence: { directory, compression: 'none', retention: 'owner-managed' }, bounds: { requestBytes: 131072, resultBytes: 2048 }, policy: { maxRuntimeMs: 60000, maxUsageUnits: 600000, maxCostEstimateMicros: 0 }, charges: { runtimeMs: 1000, usageUnits: 135168 }, previewTtlMs: 60000, grantTtlMs: 60000 });
  const resolve = (role, previous, directoryBinding, changes = {}) => run(() => resolveInstalledWorkerFacts({ ctx: sourceCtx, choice: choice(role), profile, isAlive, previous, ...(directoryBinding === undefined ? {} : { directoryBinding }), assertInvocation: () => assertInstalledWorkerInvocation(sourceCtx), ...changes }));
  let serial = 0;
  const claim = facts => run(() => facts.claimDirectory(Object.fromEntries(['taskRef','actionRef','claimRef','generationRef'].map(key => [key, hash('ni3-directory-' + key + '-' + (++serial))]))));
  const assertNoExecution = () => { assert.equal(streams, 0); assert.equal(ctx.agents.list().length, 0); assert.equal(ctx.sessions.list().length, 0); assert.deepEqual(ctx.tools.schemas(), []); };
  return { ctx, sourceCtx, profile, directory, environment, dir, choice, install, resolve, claim, run, isAlive, persistenceEntry, providerEntry, assertNoExecution, revokeOwner() { ownerCurrent = false; } };
}

async function roles(f) {
  const producer = await f.resolve('producer');
  return { producer, review: await f.resolve('review', undefined, producer.directoryBinding), repair: await f.resolve('repair', undefined, producer.directoryBinding) };
}

test('original absent directory allocation survives producer aggregate spread and review repair fresh-review refresh', async t => {
  const f = await fixture(t), r = await roles(f);
  assert.equal(existsSync(f.directory), false);
  for (const facts of Object.values(r)) { assert.equal(facts.allocation, null); assert.equal(facts.directoryBinding, r.producer.directoryBinding); }
  // Exact aggregate object operation used by installed-worker.refresh().
  const aggregate = Object.freeze({ ...r.producer, catalogEvidenceRef: r.producer.catalogEvidenceRef });
  const environmentRef = aggregate.environmentRef;
  await f.claim(aggregate);
  const originalLeaf = leafFact(f.directory), firstAllocation = r.producer.allocation;
  assert.equal(originalLeaf.mode, 0o700); assert.equal(originalLeaf.uid, process.getuid());
  assert.equal(aggregate.allocation, null, 'spread snapshot remains stale; authentic token must carry source state');
  for (const facts of Object.values(r)) { await f.run(() => assert.equal(facts.assertCurrent(), true)); assert.equal(facts.allocation, firstAllocation); }
  const refreshed = await f.resolve('producer', aggregate);
  assert.equal(refreshed.environmentRef, environmentRef); assert.equal(refreshed.directoryBinding, aggregate.directoryBinding);
  let review = await f.resolve('review', r.review, refreshed.directoryBinding);
  const repair = await f.resolve('repair', r.repair, refreshed.directoryBinding);
  await f.claim(review); await f.claim(repair);
  review = await f.resolve('review', review, refreshed.directoryBinding); await f.claim(review);
  for (const facts of [refreshed, review, repair]) { assert.equal(facts.allocation, firstAllocation); assert.equal(facts.environmentRef, environmentRef); }
  assert.deepEqual(leafFact(f.directory), originalLeaf); f.assertNoExecution();
});

test('original review-first allocation is the same authenticated backend leaf for later repair and producer', async t => {
  const f = await fixture(t), r = await roles(f); await f.claim(r.review);
  const leaf = leafFact(f.directory), first = r.review.allocation;
  await f.claim(r.repair); await f.claim(r.producer);
  for (const facts of Object.values(r)) { assert.equal(facts.allocation, first); await f.run(() => assert.equal(facts.assertCurrent(), true)); }
  assert.deepEqual(leafFact(f.directory), leaf); f.assertNoExecution();
});

test('genuine preexisting leaf stays approved and source-issued token refuses copied or foreign provenance', async t => {
  const f = await fixture(t, { existing: true }), r = await roles(f), leaf = leafFact(f.directory);
  for (const facts of Object.values(r)) { await f.claim(facts); assert.equal(facts.allocation, null); }
  assert.deepEqual(leafFact(f.directory), leaf);
  await assert.rejects(f.resolve('review', undefined, Object.freeze({})), denied);
  await assert.rejects(f.resolve('review', undefined, { allocation: r.producer.allocation }), denied);
  await assert.rejects(f.resolve('review', undefined, JSON.parse(JSON.stringify(r.producer.directoryBinding))), denied);
  await assert.rejects(f.resolve('review', undefined, false), denied);
  await assert.rejects(f.resolve('review', undefined, null), denied);
  await assert.rejects(f.resolve('producer', { allocation: r.producer.allocation }), denied);
  await assert.rejects(f.resolve('producer', { directoryBinding: JSON.parse(JSON.stringify(r.producer.directoryBinding)), allocation: r.producer.allocation }), denied);
  await assert.rejects(f.resolve('review', undefined, r.producer.directoryBinding, { profile: { ...f.profile, name: 'different-source-profile' } }), denied);
  const other = await fixture(t, { existing: true });
  await assert.rejects(other.resolve('review', undefined, r.producer.directoryBinding), denied);
  f.assertNoExecution(); other.assertNoExecution();
});

test('original allocated leaf mode replacement symlink and unowned creation remain closed refusals', async t => {
  const f = await fixture(t), r = await roles(f); await f.claim(r.producer);
  chmodSync(f.directory, 0o755); await assert.rejects(f.run(() => r.review.assertCurrent()), denied); chmodSync(f.directory, 0o700);
  const original = join(f.dir, 'original-leaf'); renameSync(f.directory, original);
  await assert.rejects(f.run(() => r.repair.assertCurrent()), denied);
  await assert.rejects(f.claim(r.repair), denied);
  assert.equal(existsSync(f.directory), false, 'deletion is refused without recreation');
  mkdirSync(f.directory, { mode: 0o700 });
  await assert.rejects(f.run(() => r.repair.assertCurrent()), denied); rmSync(f.directory, { recursive: true });
  symlinkSync(original, f.directory); await assert.rejects(f.run(() => r.review.assertCurrent()), denied); rmSync(f.directory); renameSync(original, f.directory);
  await f.run(() => assert.equal(r.producer.assertCurrent(), true));
  const absent = await fixture(t), ar = await roles(absent); mkdirSync(absent.directory, { mode: 0o700 });
  await assert.rejects(absent.claim(ar.producer), denied); assert.equal(ar.producer.allocation, null);
  f.assertNoExecution(); absent.assertNoExecution();
});

test('actual original backend source lifecycle and original owner carrier refuse stale allocation access', async t => {
  const backend = await fixture(t), br = await roles(backend); await backend.claim(br.producer);
  await backend.persistenceEntry.update({ disabled: true }); await backend.ctx.loader.await();
  await assert.rejects(backend.run(() => br.review.assertCurrent()), denied);
  const source = await fixture(t), sr = await roles(source); await source.claim(sr.producer);
  await source.providerEntry.update({ disabled: true }); await source.ctx.loader.await();
  await assert.rejects(source.run(() => sr.repair.assertCurrent()), denied);
  const owner = await fixture(t), or = await roles(owner); owner.revokeOwner();
  await assert.rejects(owner.claim(or.review), error => error.code === 'OPERATOR_REQUIRED'); assert.equal(existsSync(owner.directory), false);
  owner.assertNoExecution();
});


test('original profile environment and backend configuration drift cannot adopt the retained directory token', async t => {
  const profile = await fixture(t), pr = await roles(profile);
  profile.profile.name = 'changed-current-profile';
  await assert.rejects(profile.run(() => pr.review.assertCurrent()), denied);
  await assert.rejects(profile.resolve('producer', pr.producer), denied);
  assert.equal(existsSync(profile.directory), false);
  const environment = await fixture(t), er = await roles(environment);
  chmodSync(environment.environment, 0o755);
  await assert.rejects(environment.run(() => er.repair.assertCurrent()), denied);
  await assert.rejects(environment.resolve('producer', er.producer), denied);
  assert.equal(existsSync(environment.directory), false);
  const backend = await fixture(t), br = await roles(backend), newDirectory = join(backend.dir, 'data', 'changed-sessions');
  await backend.persistenceEntry.update({ config: { root: newDirectory, compression: 'none' } });
  await backend.ctx.loader.await();
  await assert.rejects(backend.run(() => br.producer.assertCurrent()), denied);
  await assert.rejects(backend.resolve('review', undefined, br.producer.directoryBinding), denied);
  assert.equal(existsSync(backend.directory), false); assert.equal(existsSync(newDirectory), false);
  profile.assertNoExecution(); environment.assertNoExecution(); backend.assertNoExecution();
});

test('another genuine original contribution context cannot reuse an authentic source directory token', async t => {
  const f = await fixture(t), r = await roles(f); let foreign;
  await f.install({ name: 'ni3-original-foreign-source', inject: ['agents','llm','sessions','tools','systemPrompt','agentPresets','sessionPersistence','approval','agentLoop','loader','profileContext'], apply(child) { foreign = child; } });
  assert.notEqual(foreign, f.sourceCtx);
  await assert.rejects(f.resolve('review', undefined, r.producer.directoryBinding, { ctx: foreign }), denied);
  assert.equal(existsSync(f.directory), false); f.assertNoExecution();
});

// DIR7 is explicitly NOT_AUTHORED/NOT_RUN: inducing failure specifically
// between unchanged pre-mkdir filesystem guards and original mkdirSync needs
// a separately proposed literal seam. No source test hook or OS fault bypass.
