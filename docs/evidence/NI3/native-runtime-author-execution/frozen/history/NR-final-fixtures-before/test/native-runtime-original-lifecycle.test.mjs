import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { reference } from '../src/runtime-store.mjs';
import { createInstalledAudit } from '../src/installed-audit.mjs';
import { BootstrapError } from '../src/config.mjs';

const packages = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const { Context } = await import(pathToFileURL(`${packages}/cordis/lib/index.js`).href);
const { default: SessionStore } = await import(pathToFileURL(`${packages}/dsh-session/lib/index.js`).href);
const { default: ApprovalService } = await import(pathToFileURL(`${packages}/dsh-user-approval/lib/index.js`).href);
const { WebServer } = await import(pathToFileURL(`${packages}/dsh-host-webserver/lib/index.js`).href);
const { HostConnectionService } = await import(pathToFileURL(`${packages}/dsh-client-connection/lib/index.js`).href);

class CapturedResponse extends Writable {
  constructor() { super(); this.parts = []; }
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; }
  text() { return Buffer.concat(this.parts).toString('utf8'); }
}
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-native-'));
  const ctx = new Context();
  let server;
  await ctx.plugin({ apply(webCtx) { server = new WebServer(webCtx, { host: '127.0.0.1', port: 3080, compression: 'none' }); } });
  const routes = server.prefixes;
  assert.equal(server.server, undefined);
  ctx.logger.exporters?.clear?.();
  t.after(async () => { try { await ctx.fiber.dispose(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  await ctx.plugin(SessionStore);
  await ctx.plugin(ApprovalService, { policy: 'never' });
  await ctx.plugin({ name: 'synthetic-connection', inject: ['webServer'], apply(connectionCtx) {
    // The exported native Connection owns the actual peer/trust fence/RPC
    // framing. BrowserAuth is a private synthetic double, without credentials,
    // server listener, cookies, browser, provider or external model calls.
    new HostConnectionService(connectionCtx, [], { isAuthenticated: request => request.headers['x-synthetic-auth'] === 'approved' });
  } });
  const send = async (command, payload = {}, headers = {}) => {
    const method = `v1/${command}`, envelope = { type: 'client-request', rpcId: 'fixture-rpc', method, payload };
    const request = Readable.from([Buffer.from(JSON.stringify(envelope))]);
    Object.assign(request, { method: 'POST', url: `/df-rpc/${method}`,
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-synthetic-auth': 'approved', ...headers } });
    const response = new CapturedResponse();
    const route = routes.get('/df-rpc');
    assert.ok(route, 'public native route was registered');
    await route.handler(request, response);
    const text = response.text();
    return { status: response.statusCode, text, ...(response.statusCode === 200 ? { result: JSON.parse(text).result } : {}) };
  };
  return { ctx, routes, directory, send };
}


test('original disabled audit installs once without resolving sources or allocating sessions, and seals at owned lifecycle close',async t=>{
 const f=await fixture(t);let captured,disposed=0;
 const actual=createInstalledAudit({selection:{enabled:false},worker:{enabled:false},identity:{ownerId:'synthetic-owner',workspaceId:'synthetic-workspace'},profile:{dir:f.directory,name:'synthetic'}}).installedAuditInstaller;
 const auditInstaller=api=>{captured=api;const module=actual(api);return Object.freeze({...module,dispose(){disposed++;return module.dispose();}});};
 const fiber=f.ctx.plugin(createRuntimePlugin({identity:()=>({ownerId:'synthetic-owner',workspaceId:'synthetic-workspace'}),encryptionKey:()=>Buffer.alloc(32,21),installedAuditInstaller:auditInstaller,installedAuditSelection:{enabled:false},installedWorkerSelection:{enabled:false}}),{databasePath:join(f.directory,'audit-disabled.sqlite'),limits:{maxMetadataBytes:4096}});await fiber;
 assert.equal(Object.keys(captured).length,17);assert.equal(f.ctx.reflect.get('agents'),undefined);assert.equal(f.ctx.reflect.get('llm'),undefined);assert.equal(f.ctx.sessions.list().length,0);assert.equal(f.ctx.df.diagnostics().installedAuditStatus.enabled,false);assert.equal(f.ctx.df.diagnostics().installedAuditStatus.bounds,null);
 assert.equal((await f.send('configureAudit',{})).result.error.code,'AUDIT_DISABLED');assert.equal(f.ctx.sessions.list().length,0);await fiber.dispose();assert.equal(disposed,1);assert.equal(captured.isAlive(),false);
});
