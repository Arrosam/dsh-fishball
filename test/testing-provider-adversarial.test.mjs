import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveHostSource } from '../src/host-probe.mjs';
import providerPlugin, { Config, inject, getTestingProviderBinding, TESTING_ACCOUNTING, TESTING_SYSTEM_PROMPT } from '../src/testing-provider.mjs';

// Independent FUNCTIONAL fixtures: original pinned public services, no listener
// or HTTP. The assertCurrent callbacks below are explicit authority doubles;
// they do not prove installed owner/ledger admission or native model quality.
const digest = value => createHash('sha256').update(value).digest('hex');
const load = name => import(pathToFileURL(resolveHostSource(`@deepseek-ai/${name}`)).href);
const { Context } = await load('cordis');
const { default: Loader } = await load('cordis-plugin-loader');
const { default: SessionProjectionRegistry } = await load('dsh-session-projection');
const { default: SessionStore } = await load('dsh-session');
const { default: ApprovalService } = await load('dsh-user-approval');
const { AgentRegistry } = await load('dsh-agent');
const { LlmRuntime, LlmAdapter, markAgentLoopRequest } = await load('dsh-llm');
const JsonlPersistence = await load('dsh-session-persistence-jsonl'); // rc.2 plugin namespace
const { default: SystemPrompt } = await load('dsh-system-prompt');
const { default: ToolRuntime } = await load('dsh-tools');
const { default: AgentLoop } = await load('dsh-agent-loop');
// Since 4fea280 (NAT05) a successful stream checks the private current callback
// once before the one-use consume and again after each of its three yielded
// chunks (text-delta, usage, finish). Denials before consume still check 0 or 1.
const SUCCESS_CURRENT_CHECKS = 4;
const collect = async stream => { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks; };
const responseFor = content => `Synthetic local result; approved input SHA-256: ${digest(content)}.`;
const inputBytes = request => Buffer.byteLength(JSON.stringify(request.messages));
const outputBytes = content => Buffer.byteLength(responseFor(content));
const assertDenied = (chunks, permit, callbackCount = undefined) => {
  assert.equal(chunks.filter(chunk => chunk.type === 'text-delta').length, 0);
  assert.equal(chunks.filter(chunk => chunk.type === 'usage').length, 0);
  assert.equal(chunks.at(-1)?.type, 'finish');
  assert.ok(['error', 'aborted'].includes(chunks.at(-1).reason.kind));
  assert.equal(permit?.usage() ?? null, null);
  if (callbackCount !== undefined) assert.equal(callbackCount, 0);
  assert.equal(JSON.stringify(chunks).includes('PRIVATE_PROVIDER_CANARY'), false);
};

async function fixture(t, { unrelated = false } = {}) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-ni2-independent-provider-'));
  const ctx = new Context(), fibers = [], handles = [];
  ctx.logger.exporters?.clear?.();
  let entry, unrelatedRegistration, serial = 0, unrelatedStreams = 0;
  t.after(async () => {
    for (const handle of handles.reverse()) await handle.dispose();
    await entry?.fiber?.dispose();
    unrelatedRegistration?.();
    for (const fiber of fibers.reverse()) await fiber.dispose();
    rmSync(directory, { recursive: true, force: true });
  });
  const install = async (plugin, config) => { const fiber = ctx.plugin(plugin, config); fibers.push(fiber); await fiber; };
  await install(SessionProjectionRegistry); await install(SessionStore); await install(ApprovalService, { policy: 'never' });
  await install(JsonlPersistence, { root: join(directory, 'sessions'), compression: 'none' });
  await install(AgentRegistry); await install(LlmRuntime); await install(SystemPrompt, {}); await install(ToolRuntime, {});
  await install(AgentLoop, { agents: [], maxParallelToolCalls: 1 });
  await install(Loader, { baseUrl: new URL('../', import.meta.url).href });
  if (unrelated) {
    class IndependentLocalAdapter extends LlmAdapter {
      async *stream() {
        unrelatedStreams++;
        yield { type: 'text-delta', index: 0, text: 'Unrelated synthetic native route remains usable.' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      }
    }
    unrelatedRegistration = ctx.llm.registerAdapter(['independent-local'], new IndependentLocalAdapter());
  }
  const id = await ctx.loader.create({ name: 'dsh-fishball/testing-provider', config: {} });
  await ctx.loader.await(); entry = ctx.loader.resolve(id);
  const binding = getTestingProviderBinding(ctx);
  const agent = async (provider = 'df-testing-local') => {
    const handle = await ctx.agents.create({ sessionId: `df-${digest(`${directory}/${++serial}`)}`, meta: { cwd: directory }, agentOptions: { provider, model: provider === 'df-testing-local' ? 'df-testing-worker-v1' : 'independent-model', ...(provider === 'df-testing-local' ? { reasoningEffort: 'deterministic' } : {}), maxTokens: 128 } });
    handles.push(handle); return handle.agent;
  };
  const request = (agent, content, { executionRef = digest('independent-execution'), systemId = digest('independent-system') } = {}) => ({
    provider: 'df-testing-local', model: 'df-testing-worker-v1', reasoningEffort: 'deterministic', maxTokens: 128, sessionId: agent.id,
    messages: [
      { id: systemId, role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: TESTING_SYSTEM_PROMPT }] },
      { id: executionRef, role: 'user', source: { kind: 'df-context', form: 'local' }, content: [{ type: 'text', text: content }] },
    ], tools: [],
  });
  const issueInput = (agent, content, options = {}) => ({ agent, executionRef: digest('independent-execution'), content, maxOutputTokens: 128, requestBytes: 131072, resultBytes: 128, usageUnits: 1000000, assertCurrent: () => true, ...options });
  const issue = (agent, content, options) => binding.issue(issueInput(agent, content, options));
  const stream = (agent, options) => ctx.agents.withInitiator(agent, () => collect(ctx.llm.stream(options)));
  const prepared = async options => ctx.llm.prepareCall({ provider: options.provider, model: options.model, reasoningEffort: options.reasoningEffort, maxTokens: options.maxTokens });
  const readPrepared = (agent, iterator) => ctx.agents.withInitiator(agent, () => collect(iterator));
  const exactRequestContent = (agent, bytes) => {
    const prefix = '汉😀\n"\\', remaining = bytes - inputBytes(request(agent, prefix));
    assert.ok(remaining >= 0);
    const content = prefix + '"'.repeat(Math.floor(remaining / 2)) + (remaining % 2 ? 'a' : '');
    assert.equal(inputBytes(request(agent, content)), bytes);
    assert.ok(Buffer.byteLength(content) <= 65536);
    return content;
  };
  return { ctx, directory, get entry() { return entry; }, binding, agent, request, issue, issueInput, stream, prepared, readPrepared, exactRequestContent, get unrelatedStreams() { return unrelatedStreams; }, async reload() { await entry.fiber.dispose(); const newId = await ctx.loader.create({ name: 'dsh-fishball/testing-provider', config: {} }); await ctx.loader.await(); entry = ctx.loader.resolve(newId); return getTestingProviderBinding(ctx); } };
}

test('P01 independent provider rejects hidden/symbol/revoked config without executing its descriptors', () => {
  let traps = 0;
  const revoked = Proxy.revocable({}, { ownKeys() { traps++; throw Error('PRIVATE_PROVIDER_CANARY'); } }); revoked.revoke();
  const hidden = Object.defineProperty({}, 'price', { value: 0 });
  const symbolic = { [Symbol('authority')]: true };
  const accessor = Object.defineProperty({}, 'price', { enumerable: true, get() { traps++; throw Error('PRIVATE_PROVIDER_CANARY'); } });
  for (const value of [hidden, symbolic, accessor, revoked.proxy, Object.create({}), { constructor: Object }, { price: undefined }]) {
    assert.deepEqual(Config['~standard'].validate(value), { issues: [{ message: 'CONFIG_INVALID' }] });
  }
  assert.equal(traps, 0);
  assert.deepEqual(inject, ['llm', 'agents', 'sessions']); assert.equal(Object.isFrozen(inject), true);
  assert.equal(Object.isFrozen(Config['~standard'].validate({}).value), true);
});

test('P02 independent original Loader and idle genuine AgentLoop do not enter a provider iterator', async t => {
  const f = await fixture(t);
  assert.equal(f.entry.moduleNamespace.default, providerPlugin); assert.equal(f.entry.options.name, 'dsh-fishball/testing-provider');
  assert.equal(f.ctx.sessions.list().length, 0); assert.equal(existsSync(join(f.directory, 'sessions')), false);
  assert.equal(f.ctx.llm.listProviders().filter(row => row.id === 'df-testing-local').length, 1);
  const agent = await f.agent(), content = 'Synthetic idle input'; let callbacks = 0;
  const permit = f.issue(agent, content, { assertCurrent: () => { callbacks++; return true; } });
  const request = f.request(agent, content), call = await f.prepared(request), iterator = call.stream(request);
  assert.equal(callbacks, 0); assert.equal(permit.usage(), null); assert.equal(f.ctx.sessions.list().length, 1);
  permit.seal(); const chunks = await f.readPrepared(agent, iterator); assertDenied(chunks, permit, callbacks);
});

test('P03 independent prepared iterator rechecks the private callback only when first next is requested', async t => {
  const f = await fixture(t), agent = await f.agent(), content = 'Synthetic delayed admission'; let current = true, callbacks = 0;
  const permit = f.issue(agent, content, { assertCurrent: () => { callbacks++; return current; } });
  const request = f.request(agent, content), call = await f.prepared(request), iterator = call.stream(request);
  assert.equal(callbacks, 0); assert.equal(permit.usage(), null);
  current = false;
  const chunks = await f.readPrepared(agent, iterator); assertDenied(chunks, permit); assert.equal(callbacks, 1);
  current = true; assertDenied(await f.stream(agent, request), permit); assert.equal(callbacks, 1);
});

test('P04 independent UTF8 whole serialized request reaches the actual minimum request cap at N-1/N/N+1', async t => {
  const f = await fixture(t);
  for (const bytes of [511, 512, 513]) await t.test(`messages bytes ${bytes}`, async () => {
    const agent = await f.agent(), content = f.exactRequestContent(agent, bytes), request = f.request(agent, content); let callbacks = 0;
    const permit = f.issue(agent, content, { requestBytes: 512, assertCurrent: () => { callbacks++; return true; } });
    const chunks = await f.stream(agent, request);
    if (bytes === 513) assertDenied(chunks, permit, callbacks);
    else { assert.equal(callbacks, SUCCESS_CURRENT_CHECKS); assert.equal(chunks[0].text, responseFor(content)); assert.equal(permit.usage().inputUnits, bytes); assert.ok(bytes > Buffer.byteLength(content)); }
  });
});

test('P05 independent escaped UTF8 input reaches the actual upper request cap at N-1/N/N+1', async t => {
  const f = await fixture(t);
  for (const bytes of [131071, 131072, 131073]) await t.test(`messages bytes ${bytes}`, async () => {
    const agent = await f.agent(), content = f.exactRequestContent(agent, bytes), request = f.request(agent, content); let callbacks = 0;
    const permit = f.issue(agent, content, { requestBytes: 131072, assertCurrent: () => { callbacks++; return true; } });
    const chunks = await f.stream(agent, request);
    if (bytes === 131073) assertDenied(chunks, permit, callbacks);
    else { assert.equal(callbacks, SUCCESS_CURRENT_CHECKS); assert.equal(chunks[0].text, responseFor(content)); assert.equal(permit.usage().inputUnits, bytes); assert.equal(chunks[1].usage.totalTokens, bytes + outputBytes(content)); }
  });
});

test('P06 independent total usage reservation is input JSON plus exact fixed output at N-1/N/N+1', async t => {
  const f = await fixture(t);
  for (const difference of [-1, 0, 1]) await t.test(`reservation difference ${difference}`, async () => {
    const agent = await f.agent(), content = '汉😀\n"\\ Synthetic whole-request accounting', request = f.request(agent, content);
    const total = inputBytes(request) + outputBytes(content); let callbacks = 0;
    const permit = f.issue(agent, content, { usageUnits: total + difference, assertCurrent: () => { callbacks++; return true; } });
    const chunks = await f.stream(agent, request);
    if (difference < 0) assertDenied(chunks, permit, callbacks);
    else {
      assert.equal(callbacks, SUCCESS_CURRENT_CHECKS); assert.deepEqual(chunks.map(chunk => chunk.type), ['text-delta', 'usage', 'finish']);
      assert.deepEqual(permit.usage(), { accounting: TESTING_ACCOUNTING, inputUnits: inputBytes(request), outputUnits: outputBytes(content), totalUnits: total, resultDigest: digest(responseFor(content)) });
      assert.equal(Object.isFrozen(permit.usage()), true); assert.throws(() => { permit.usage().totalUnits = 0; }, TypeError);
      assert.deepEqual(chunks[1].usage, { inputTokens: inputBytes(request), outputTokens: outputBytes(content), totalTokens: total });
    }
  });
});

test('P07 independent exact content UTF8 boundary and malformed Unicode are checked before permits are minted', async t => {
  const f = await fixture(t), prefix = '汉😀\n"\\';
  for (const bytes of [65535, 65536, 65537]) await t.test(`content bytes ${bytes}`, async () => {
    const agent = await f.agent(), content = prefix + 'a'.repeat(bytes - Buffer.byteLength(prefix)); assert.equal(Buffer.byteLength(content), bytes);
    if (bytes === 65537) { assert.throws(() => f.issue(agent, content), { code: 'WORKER_REQUEST_DENIED' }); return; }
    const permit = f.issue(agent, content), chunks = await f.stream(agent, f.request(agent, content));
    assert.equal(chunks[0].text, responseFor(content)); assert.equal(permit.usage().inputUnits, inputBytes(f.request(agent, content)));
  });
  for (const content of ['\ud800', '\udfff', 'prefix\ud800suffix']) {
    const agent = await f.agent(); assert.throws(() => f.issue(agent, content), { code: 'WORKER_REQUEST_DENIED' });
    assert.equal(f.issue(agent, 'Corrected synthetic input').usage(), null);
  }
});

test('P08 independent output/token and safe integer permit limits retain their exact allowed endpoints', async t => {
  const f = await fixture(t), content = 'Synthetic finite permit values';
  const cases = [
    ['maxOutputTokens', 127, false], ['maxOutputTokens', 128, true], ['maxOutputTokens', 4096, true], ['maxOutputTokens', 4097, false],
    ['resultBytes', 127, false], ['resultBytes', 128, true], ['resultBytes', 16384, true], ['resultBytes', 16385, false],
    ['requestBytes', 511, false], ['requestBytes', 512, true], ['requestBytes', 131072, true], ['requestBytes', 131073, false],
    ['usageUnits', 0, false], ['usageUnits', 1, true], ['usageUnits', 100000000, true], ['usageUnits', 100000001, false],
    ['usageUnits', 1.5, false], ['usageUnits', NaN, false], ['usageUnits', Infinity, false], ['usageUnits', Number.MAX_SAFE_INTEGER + 1, false],
  ];
  for (const [key, value, valid] of cases) await t.test(`${key}=${value}`, async () => {
    const agent = await f.agent();
    if (valid) { const permit = f.issue(agent, content, { [key]: value }); assert.equal(permit.usage(), null); permit.seal(); }
    else assert.throws(() => f.issue(agent, content, { [key]: value }), { code: 'INVALID_INPUT' });
  });
  assert.ok(outputBytes(content) < 128, 'fixed output is below the minimum output cap; overflow is unreachable in this source unit');
});

test('P09 independent issue refuses opaque input descriptor tricks without authority callback or reflection traps', async t => {
  const f = await fixture(t), agent = await f.agent(), content = 'Synthetic detached permit'; let traps = 0, callbacks = 0;
  const base = f.issueInput(agent, content, { assertCurrent: () => { callbacks++; return true; } });
  const getter = Object.defineProperty({ ...base }, 'content', { enumerable: true, get() { traps++; throw Error('PRIVATE_PROVIDER_CANARY'); } });
  const hidden = Object.defineProperty({ ...base }, 'content', { value: content, enumerable: false });
  const proxy = new Proxy(base, { getPrototypeOf() { traps++; throw Error('PRIVATE_PROVIDER_CANARY'); }, ownKeys() { traps++; throw Error('PRIVATE_PROVIDER_CANARY'); } });
  const revoked = Proxy.revocable(base, {}); revoked.revoke();
  const bad = [getter, hidden, proxy, revoked.proxy, { ...base, zeroCost: true }, { ...base, [Symbol('permit')]: true }, Object.assign(Object.create(null), base)];
  for (const value of bad) assert.throws(() => f.binding.issue(value), { code: 'INVALID_INPUT' });
  assert.equal(traps, 0); assert.equal(callbacks, 0);
  const permit = f.binding.issue(base); base.content = 'MUTATED_UNAPPROVED_CONTENT'; base.assertCurrent = () => false;
  const chunks = await f.stream(agent, f.request(agent, content)); assert.equal(callbacks, SUCCESS_CURRENT_CHECKS); assert.equal(chunks[0].text, responseFor(content)); assert.notEqual(permit.usage(), null);
});

test('P10 independent partial consumption is already charged and cannot be retried after iterator return or abort', async t => {
  const f = await fixture(t), agent = await f.agent(), content = 'Synthetic interrupted consumer', controller = new AbortController(); let callbacks = 0;
  const permit = f.issue(agent, content, { assertCurrent: () => { callbacks++; return true; } }), request = { ...f.request(agent, content), signal: controller.signal };
  const call = await f.prepared(request), iterator = call.stream(request)[Symbol.asyncIterator]();
  const first = await f.ctx.agents.withInitiator(agent, () => iterator.next());
  assert.equal(first.done, false); assert.equal(first.value.type, 'text-delta'); assert.equal(first.value.text, responseFor(content));
  assert.equal(callbacks, 1); assert.equal(permit.usage().totalUnits, inputBytes(request) + outputBytes(content));
  controller.abort(); await iterator.return();
  assertDenied(await f.stream(agent, f.request(agent, content)), undefined); assert.equal(callbacks, 1);
  assert.equal(permit.usage().resultDigest, digest(responseFor(content))); assert.throws(() => f.issue(agent, content), { code: 'WORKER_REQUEST_DENIED' });
});

test('P11 independent source callback seal/disposal synchronously defeats the final source gate', async t => {
  for (const action of ['seal', 'entry-dispose']) await t.test(action, async t => {
    const f = await fixture(t), agent = await f.agent(), content = 'Synthetic final gate'; let callbacks = 0, permit, disposal;
    permit = f.issue(agent, content, { assertCurrent: () => { callbacks++; if (action === 'seal') permit.seal(); else disposal = f.entry.fiber.dispose(); return true; } });
    const chunks = await f.stream(agent, f.request(agent, content)); assertDenied(chunks, permit); assert.equal(callbacks, 1); await disposal;
  });
});

test('P12 independent current callback Promise/thenable never becomes synchronous consent and preserves redaction', async t => {
  for (const action of ['false', 'throw', 'promise', 'thenable']) await t.test(action, async t => {
    const f = await fixture(t), agent = await f.agent(), content = 'Synthetic callback boundary'; let callbacks = 0, thenCalls = 0;
    const check = () => { callbacks++; if (action === 'throw') throw Error('PRIVATE_PROVIDER_CANARY'); if (action === 'promise') return Promise.resolve(true); if (action === 'thenable') return { then() { thenCalls++; } }; return false; };
    const permit = f.issue(agent, content, { assertCurrent: check }); assertDenied(await f.stream(agent, f.request(agent, content)), permit); assert.equal(callbacks, 1); assert.equal(thenCalls, 0);
    assertDenied(await f.stream(agent, f.request(agent, content)), permit); assert.equal(callbacks, 1);
  });
});

test('P13 independent wrong genuine agent cannot use another native session permit; unrelated route still works', async t => {
  const f = await fixture(t, { unrelated: true }), owner = await f.agent(), stranger = await f.agent(), other = await f.agent('independent-local'), content = 'Synthetic exact native owner'; let callbacks = 0;
  const permit = f.issue(owner, content, { assertCurrent: () => { callbacks++; return true; } });
  assertDenied(await f.stream(stranger, markAgentLoopRequest(f.request(owner, content))), undefined); assert.equal(callbacks, 0); assert.equal(permit.usage(), null);
  const otherRequest = { provider: 'independent-local', model: 'independent-model', maxTokens: 128, sessionId: other.id, messages: [{ id: digest('unrelated-user'), role: 'user', source: { kind: 'input', form: 'local' }, content: [{ type: 'text', text: 'Unrelated synthetic native session' }] }], tools: [] };
  const unrelated = await f.stream(other, otherRequest); assert.equal(unrelated[0].text, 'Unrelated synthetic native route remains usable.'); assert.equal(f.unrelatedStreams, 1); assert.equal(f.binding.assertCurrent(), true);
  const chunks = await f.stream(owner, f.request(owner, content)); assert.equal(chunks[0].text, responseFor(content)); assert.equal(callbacks, SUCCESS_CURRENT_CHECKS); assert.notEqual(permit.usage(), null);
});

test('P14 independent prepared registration cannot revive after topology reversion; explicit own reload is separate', async t => {
  const f = await fixture(t), agent = await f.agent(), content = 'Synthetic old captured registration'; let callbacks = 0;
  const permit = f.issue(agent, content, { assertCurrent: () => { callbacks++; return true; } }), request = f.request(agent, content), call = await f.prepared(request), iterator = call.stream(request);
  class EmptyUnrelated extends LlmAdapter { async *stream() { throw Error('UNEXPECTED_UNRELATED_CALL'); } }
  const remove = f.ctx.llm.registerAdapter(['independent-topology'], new EmptyUnrelated()); remove();
  assert.throws(() => f.binding.assertCurrent(), { code: 'WORKER_REQUEST_DENIED' });
  assertDenied(await f.readPrepared(agent, iterator), permit, callbacks);
  const fresh = await f.reload(); assert.equal(fresh.assertCurrent(), true); assert.throws(() => f.binding.issue(f.issueInput(agent, content)), { code: 'WORKER_REQUEST_DENIED' });
  const freshAgent = await f.agent(), freshInput = f.issueInput(freshAgent, 'Synthetic after explicit own reload'), freshPermit = fresh.issue(freshInput);
  const chunks = await f.stream(freshAgent, f.request(freshAgent, freshInput.content)); assert.equal(chunks[0].text, responseFor(freshInput.content)); assert.notEqual(freshPermit.usage(), null); assert.equal(permit.usage(), null);
});

test('P15 independent aborted request and unknown string proof fields refuse before private current callback', async t => {
  const f = await fixture(t);
  for (const scenario of ['already-aborted', 'extra-field', 'extra-user-source', 'extra-content-block', 'system-id-129']) await t.test(scenario, async () => {
    const agent = await f.agent(), content = 'Synthetic request descriptor', request = f.request(agent, content); let callbacks = 0;
    const permit = f.issue(agent, content, { assertCurrent: () => { callbacks++; return true; } });
    if (scenario === 'already-aborted') { const controller = new AbortController(); controller.abort(); request.signal = controller.signal; }
    if (scenario === 'extra-field') request.ownedExecution = true;
    if (scenario === 'extra-user-source') request.messages[1].source.verified = true;
    if (scenario === 'extra-content-block') request.messages[1].content.push({ type: 'text', text: 'UNAPPROVED_FOREIGN_CANARY' });
    if (scenario === 'system-id-129') request.messages[0].id = '汉'.repeat(43);
    assertDenied(await f.stream(agent, request), permit, callbacks);
  });
});

// Decision table over the denial index k of the private current callback
// (src/testing-provider.mjs:111 pre-consume, :120 after text-delta, :122 after
// usage, :124 after finish). The provider yields the chunks that precede the
// denying check; the host LlmRuntime then terminates the stream with an error
// finish (measured: at k=4 this follows the provider's own stop finish). Usage
// is charged from the one-use consume (k>=2) and never reset; any second
// stream on the same permit is refused before the callback runs again.
test('P16 independent authority denial index k=1..4 decides yielded chunks, charged usage and single use', async t => {
  const PROVIDER_CHUNKS = ['text-delta', 'usage', 'finish'];
  const label = chunk => chunk.type === 'finish' ? `finish:${chunk.reason.kind}` : chunk.type;
  for (const mode of ['false', 'throw']) for (const k of [1, 2, 3, 4]) await t.test(`${mode} at call ${k}`, async t => {
    const f = await fixture(t), agent = await f.agent(), content = 'Synthetic per-chunk currentness', request = f.request(agent, content); let callbacks = 0;
    const permit = f.issue(agent, content, { assertCurrent: () => { if (++callbacks !== k) return true; if (mode === 'throw') throw Error('PRIVATE_PROVIDER_CANARY'); return false; } });
    const chunks = await f.stream(agent, request), yielded = PROVIDER_CHUNKS.slice(0, k - 1);
    assert.equal(callbacks, k);
    assert.deepEqual(chunks.map(label), [...yielded.map(type => type === 'finish' ? 'finish:stop' : type), 'finish:error']);
    // H1 ISTQB TC3 found the post-consume checks leaked a throwing callback's raw
    // message (measured failure.message 'PRIVATE_PROVIDER_CANARY' at k>=2) before
    // src/testing-provider.mjs gained its redacting recheck(); this pins the fix.
    assert.equal(JSON.stringify(chunks).includes('PRIVATE_PROVIDER_CANARY'), false);
    assert.equal(chunks.at(-1).reason.failure?.message, 'WORKER_REQUEST_DENIED');
    if (k === 1) assert.equal(permit.usage(), null);
    else assert.deepEqual(permit.usage(), { accounting: TESTING_ACCOUNTING, inputUnits: inputBytes(request), outputUnits: outputBytes(content), totalUnits: inputBytes(request) + outputBytes(content), resultDigest: digest(responseFor(content)) });
    if (k >= 2) assert.equal(chunks[0].text, responseFor(content));
    if (k >= 3) assert.deepEqual(chunks[1].usage, { inputTokens: inputBytes(request), outputTokens: outputBytes(content), totalTokens: inputBytes(request) + outputBytes(content) });
    const usage = permit.usage();
    assertDenied(await f.stream(agent, request), undefined); assert.equal(callbacks, k, 'second stream is refused before the callback');
    assert.equal(permit.usage(), usage);
  });
});
