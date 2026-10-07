import { stableErrorCode } from './stable-error-code.mjs';
// SOURCE ONLY. Derived from the reviewed BP01 public constructor composition.
// In-process operator authentication is synthetic; no physical browser claim.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, chmodSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { resolveHostSource } from '../../src/host-probe.mjs';
import { hash } from '../../src/runtime-security.mjs';
import { getApprovedOllamaBinding } from '../ollama-dsh-integration-currentness-r1/ollama-binding.mjs';
import { installedConfig, bounds } from './admission.mjs';
import { createStreamObservation } from './stream-observer.mjs';

export async function within(promise, ms, code = 'DEADLINE_UNKNOWN') {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => { const error = new Error(code); error.code = code; reject(error); }, ms);
  })]); } finally { clearTimeout(timer); }
}
class Response extends Writable {
  constructor() { super(); this.parts = []; this.bytes = 0; }
  _write(chunk, encoding, done) {
    this.bytes += chunk.length;
    if (this.bytes > 1048576) { done(new Error('RPC_OUTPUT_BOUND')); return; }
    this.parts.push(Buffer.from(chunk)); done();
  }
  writeHead(status) { this.statusCode = status; }
}
export async function createNativeFixture({ checkpoint, registerCleanup }) {
  const load = name => import(pathToFileURL(resolveHostSource('@deepseek-ai/' + name)).href);
  const { Context } = await load('cordis'), { default: Sessions } = await load('dsh-session'),
    { default: Projections } = await load('dsh-session-projection'), { default: Approval } = await load('dsh-user-approval'),
    { AgentRegistry } = await load('dsh-agent'), { LlmRuntime } = await load('dsh-llm'),
    { default: Tools } = await load('dsh-tools'), { default: Prompt } = await load('dsh-system-prompt'),
    { default: Presets } = await load('dsh-agent-preset-registry'), { default: Loader } = await load('cordis-plugin-loader'),
    { WebServer } = await load('dsh-host-webserver'), { HostConnectionService } = await load('dsh-client-connection');
  const scratch = fileURLToPath(new URL('./private-runs/', import.meta.url));
  mkdirSync(scratch, { recursive: true, mode: 0o700 });
  const dir = mkdtempSync(join(realpathSync(scratch), 'functional-')); chmodSync(dir, 0o700);
  const data = join(dir, 'data'), environment = join(dir, 'environment');
  mkdirSync(data, { mode: 0o700 }); mkdirSync(environment, { mode: 0o700 });
  const directory = join(data, 'df-sessions');
  const ctx = new Context(), baseUrl = new URL('../dsh-web/', import.meta.url).href;
  ctx.baseUrl = baseUrl; ctx.logger.exporters?.clear?.();
  ctx.provide('profileContext', { dir, name: 'ollama-functional-synthetic' });
  registerCleanup(async () => { await ctx.fiber.dispose(); });
  checkpoint({ phase: 'original-context-created', scratchPath: dir, retained: true });
  const install = async (plugin, config) => {
    const fiber = ctx.plugin(plugin, config); await fiber; assert.equal(fiber.state, 2); return fiber;
  };
  // Do not activate WebServer as a class plugin: no init, listen or HTTP server.
  const server = new WebServer(ctx, { host: '127.0.0.1', port: 0, compression: 'none' });
  assert.equal(server.server, undefined); assert.equal(server.listenedPort, undefined);
  new HostConnectionService(ctx, [], { isAuthenticated: req => req.headers['x-synthetic-auth'] === 'approved' });
  await install(Projections); await install(Sessions); await install(Approval, { policy: 'never' });
  await install(AgentRegistry); await install(LlmRuntime); await install(Prompt, {}); await install(Tools, {});
  await install(Loader, { baseUrl });
  const entry = async (name, config) => {
    const id = await ctx.loader.create({ name, config }); await ctx.loader.await();
    const current = ctx.loader.resolve(id); assert.equal(current.fiber.state, 2); return current;
  };
  await entry('@deepseek-ai/dsh-session-persistence-jsonl', { root: directory, compression: 'none' });
  await entry('@deepseek-ai/dsh-agent-loop', { agents: [], maxParallelToolCalls: 1 });
  await install(Presets, { default: 'df-ollama-empty' });
  await ctx.agentPresets.register({ id: 'df-ollama-empty', plugins: [] });
  const observer = createStreamObservation(); await install(observer.plugin);
  const provider = await entry(new URL('../ollama-dsh-integration-currentness-r1/ollama-binding.mjs', import.meta.url).href, {});
  const binding = getApprovedOllamaBinding(provider.fiber.ctx); binding.assertCurrent();
  assert.equal(binding.audit().attempted, 0); assert.equal(binding.billingState, 'unknown');
  const config = installedConfig({ data, environment, directory });
  await entry(new URL('./installed-source.mjs', import.meta.url).href, config);
  let serial = 0;
  const command = () => hash(`${dir}:original-command:${++serial}`);
  async function wire(channel, name, payload = {}) {
    const rpcId = `ollama-functional-${++serial}`, method = `v1/${name}`;
    const envelope = { type: 'client-request', rpcId, method, payload };
    assert.ok(Buffer.byteLength(JSON.stringify(envelope)) <= 65536);
    const req = Readable.from([Buffer.from(JSON.stringify(envelope))]);
    Object.assign(req, { method: 'POST', url: `${channel}/${method}`, headers: {
      host: '127.0.0.1:0', origin: 'http://127.0.0.1:0', 'content-type': 'application/json', 'x-synthetic-auth': 'approved' } });
    const response = new Response();
    const route = server.prefixes.get(channel); assert.ok(route);
    await route.handler(req, response); assert.equal(response.statusCode, 200);
    const reply = JSON.parse(Buffer.concat(response.parts).toString('utf8'));
    assert.equal(reply.rpcId, rpcId); return reply.result;
  }
  async function call(name, payload = {}, channel = '/df-rpc') {
    const reply = await within(wire(channel, name, payload), bounds.rpcWindowMs);
    if (reply.ok !== true) { const error = new Error('ORIGINAL_OPERATION_DENIED'); error.code = stableErrorCode(reply.error, 'rpc'); throw error; }
    return reply.value;
  }
  assert.equal((await call('status', {}, '/df-setup')).phase, 'setup_required');
  const preview = await call('prepare', {}, '/df-setup');
  assert.equal((await call('confirm', { previewRef: preview.previewRef, planDigest: preview.planDigest, accept: true }, '/df-setup')).phase, 'ready');
  assert.equal(binding.audit().attempted, 0);
  assert.deepEqual(ctx.tools.schemas(), []);
  checkpoint({ phase: 'genuine-installed-setup-ready', providerSourceRef: binding.sourceRef,
    accounting: binding.accounting, billingState: binding.billingState, syntheticOperatorCarrier: true,
    originalLoaderEntries: true, listenerStarted: false });
  return { ctx, call, wire, command, binding, observer, directory, dir, data, config };
}
