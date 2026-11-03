import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CASE = Object.freeze({
  version: '0.2.1-rc.3', timeout: 15000, namespace: 'transportProbe',
  package: '@independent/runtime-isolation-transport', event: 'transport-probe/control',
  host: 'host', private: 'private', text: 'synthetic-only', channel: '/api',
  url: 'http://synthetic.invalid/api/', rpcId: 'independent-probe',
});
const PACKAGES = Object.freeze({
  cordis: '@deepseek-ai/cordis', registry: '@deepseek-ai/dsh-typert-registry',
  protocol: '@deepseek-ai/dsh-typert-protocol', gateway: '@deepseek-ai/dsh-api-gateway',
  access: '@deepseek-ai/dsh-api-remote-access', connection: '@deepseek-ai/dsh-client-connection',
  approval: '@deepseek-ai/dsh-user-approval', remotes: '@deepseek-ai/dsh-api-remotes',
  wire: '@deepseek-ai/dsh-api-gateway/stream-protocol',
});
export async function loadRuntime(root) {
  const canonical = await realpath(resolve(root));
  const require = createRequire(join(canonical, '__transport_probe__.cjs'));
  const modules = {};
  for (const [key, name] of Object.entries(PACKAGES)) {
    const entry = await realpath(require.resolve(name));
    assert.ok(entry.startsWith(canonical + sep), 'runtime entry must belong to explicit installation');
    modules[key] = await import(pathToFileURL(entry).href);
  }
  const manifest = JSON.parse(await readFile(require.resolve('@deepseek-ai/dsh/package.json'), 'utf8'));
  assert.equal(manifest.version, CASE.version);
  return modules;
}
export async function* empty() {}

// Synthetic controller and DTOs only. No Session/Agent factory, loader, profile,
// credentials, HTTP listener, browser ClientSession or account service is started.
export async function createRoot(runtime, label, home) {
  const ctx = new runtime.cordis.Context();
  const observed = { calls: [], events: [], approvals: [] };
  const journal = [{ type: 'turn/start', data: {} }];
  const session = { get seq() { return journal.length; }, eventAt: index => journal[index],
    append: (type, data) => journal.push({ type, data }) };
  const agent = { id: label + '-synthetic-agent', ctx, session };
  const pending = new AbortController();
  class Controller extends runtime.protocol.TypertRemoteService {
    constructor(owner) { super(owner, CASE.namespace); }
    invoke(value) {
      observed.calls.push(['invoke', value]);
      this.ctx.emit(CASE.event, value);
      return { root: label, value };
    }
    async *stream(value) {
      observed.calls.push(['stream', value]);
      yield { root: label, value };
      for await (const item of this.ctx.invocation.uplink()) yield { root: label, value: item };
    }
    approve() {
      observed.calls.push(['approve']);
      return this.ctx.approval.request({ agent, toolName: CASE.namespace, reason: CASE.text, signal: pending.signal });
    }
    cancel() { pending.abort(); return { root: label, cancelled: true }; }
  }
  ctx.plugin(runtime.registry.default);
  ctx.plugin(runtime.access.default);
  // BrowserAuth is deliberately unusable: direct Fetch adapter gets an explicit
  // public Peer; invoking authentication here is a test failure, not fake login.
  new runtime.connection.HostConnectionService(ctx, [], new Proxy({}, {
    get() { throw new Error('browser authentication is outside this probe'); },
  }));
  ctx.plugin(runtime.gateway.default);
  ctx.plugin(runtime.approval.default, { policy: 'ask' });
  ctx.plugin(Controller);
  ctx.on(CASE.event, value => observed.events.push(value));
  ctx.on('approval/request', (request, next) => {
    observed.approvals.push(request.toolName);
    return next();
  });
  await ctx.plugin(() => {}).await();
  const codec = { mode: 'src-json' };
  ctx.typert.register({ package: CASE.package, face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: ['invoke', 'stream', 'approve', 'cancel'].map(method => ({
      id: CASE.package + '#' + method, service: CASE.namespace, namespace: CASE.namespace,
      method, invocation: { kind: 'direct' }, result: codec,
      parameters: ['invoke', 'stream'].includes(method)
        ? [{ name: 'value', wire: 'value', source: 'json', codec }] : [],
      ...(method === 'stream' ? { mode: 'stream', uplink: { codec } } : {}),
    })),
  });
  const peer = ctx.connection.createPeer({ principal: { kind: 'owner' } });
  const handler = ctx.connection.createSharedFetchHandler(CASE.channel);
  const rpc = async (endpoint, payload, selectedPeer = peer) => {
    const request = new Request(CASE.url + endpoint, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: CASE.rpcId, method: endpoint, payload }),
    });
    const response = await handler.fetch(request, selectedPeer);
    assert.equal(response.status, 200);
    return (await response.json()).result;
  };
  return { ctx, label, peer, rpc, observed, journal, agent, home,
    invoke: (method, args = {}) => ctx.typertGateway.invoke({ namespace: CASE.namespace, method, args, peer }),
    mountRemotes: async () => { await ctx.plugin(runtime.remotes).await(); },
    dispose: () => ctx.fiber.dispose(),
  };
}
