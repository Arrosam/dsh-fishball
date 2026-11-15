/**
 * The one place that binds the adapter cases to `packages/dsh-connector-adapter/index.js`, through the
 * relayed surface only:
 * - `createAdapterPlugin({now, timers, fetch})` → `{name, inject, Config, apply}`;
 * - the `dshConnectorAdapter` service's `status()`;
 * - the global tool `dsh_connector_sign_in`;
 * - the grant record `dsh-connector-adapter/server-<hex>`;
 * - the stock `dsh-mcp-client` child row, found through cordis' public registry (the fibers of that
 *   plugin and their config). That is how a case learns the proxy URL and the local bearer.
 *
 * A world is one fake connector (C), the non-DSH server (X, behind the recording fetch), a fake clock,
 * and one or more in-process DSH hosts (N) over one temp root. `restart()` disposes N and builds it
 * again on the same credentials file (an N restart). Nothing of the product is read or imitated.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { ADAPTER, DSH, FIXTURE, LSOF, RPC, STATE, WAIT, WEB, K1 } from './constants.mjs'
import { eventually, fakeClock, otherServer, recordingFetch, startFakeConnector } from './fakes.mjs'
import { cleanups, openHost, requireModule, tempRoot } from '../../dsh-connector-shared/oauth-client/subject.mjs'

export const adapterModule = (sdk) => requireModule(sdk, ADAPTER)

/** The value of a tool result: the canonical JSON value (a string value is parsed). */
const valueOf = (v) => (typeof v === 'string' ? JSON.parse(v) : v)

let callSeq = 0
/** Runs a registered tool's body with a fresh signal, as the registry would. */
export async function runTool(definition, args) {
  assert.ok(definition, 'the tool is not registered')
  const signal = new AbortController().signal
  callSeq += 1
  const callId = 'fbtest-call-' + callSeq
  return definition.execute(args, { callId, rootCallId: callId, name: definition.name, arguments: args, signal, deferContext() {}, concludeTurn() {} })
}

/**
 * One DSH host N with the adapter mounted from `config`. Returns the handle, or `{error}` when the
 * plugin refused to start (its fiber's await rejected).
 */
async function startN(w, config, { name = 'n' } = {}) {
  const host = await openHost(w.sdk, w.root, { tools: true })
  const mod = await adapterModule(w.sdk)
  const mcp = host.parts[DSH.mcpClient]
  const plugin = mod.createAdapterPlugin({ now: w.clock.now, timers: w.clock.timers, fetch: w.recorder.fetch })
  for (const member of ['name', 'inject', 'Config', 'apply']) assert.notEqual(plugin?.[member], undefined, `createAdapterPlugin() returned no ${member}`)
  const wrapped = host.ctx.plugin(plugin, config)
  const fiber = wrapped.ctx.fiber
  let error
  try { await wrapped } catch (e) { error = e }
  const results = []
  const n = {
    name, host, mod, plugin, fiber, error, results, config,
    service: () => host.ctx.get(ADAPTER.service),
    status: () => n.service()?.status(),
    stateOf: (serverName) => n.status()?.servers.find((s) => s.serverName === serverName),
    /** The live child rows (fibers of the stock dsh-mcp-client plugin). */
    children: () => [...(host.ctx.registry.get(mcp.apply)?.fibers ?? [])].filter((f) => f.uid !== null),
    child: (serverName) => n.children().find((f) => f.config?.serverName === serverName),
    tool: (name_) => host.ctx.tools.get(name_),
    /** `dsh_connector_sign_in({server})`: the value, recorded with its rendered output (the transcript). */
    async signIn(server) {
      const def = n.tool(ADAPTER.tool)
      const args = { [ADAPTER.toolParam]: server }
      const value = valueOf(await runTool(def, args))
      results.push({ value, rendered: def.output.render(args, value) })
      return value
    },
    /** Calls `mcp__<server>__<tool>` through the child; resolves `{value}` or `{error}`. */
    call: (serverName, tool) => runTool(n.tool(ADAPTER.mcpTool(serverName, tool)), {}).then((value) => ({ value }), (error) => ({ error })),
    /** The child row's proxy URL and local bearer (as the stock row was configured). */
    proxyOf(serverName) {
      const f = n.child(serverName)
      assert.ok(f, 'no child row for ' + serverName)
      const auth = f.config.headers?.Authorization ?? f.config.headers?.authorization
      return { url: f.config.url, bearer: auth?.startsWith(WEB.bearer) ? auth.slice(WEB.bearer.length) : undefined, auth, config: f.config }
    },
    key: (serverName) => host.credentialKey(ADAPTER.keyScope, FIXTURE.serverId(serverName)),
    record: (serverName) => host.ctx.credentials.readRecord(n.key(serverName)),
    /** The adapter's own log lines (by its logger name). */
    adapterLogs: (type) => host.logs.filter((l) => l.name.startsWith(ADAPTER.loggerName) && (type === undefined || l.type === type)),
    async stop() { await host.close() },
  }
  w.scope.defer(() => n.stop())
  return n
}

/**
 * A world. `config(c)` builds the adapter config from the connector (default: CIMD and `{m: U}`);
 * `start: false` leaves N unstarted.
 */
export async function adapterWorld(t, sdk, { config, start = true, issueRefresh = true } = {}) {
  const scope = cleanups(t)
  const root = tempRoot(scope)
  const c = await startFakeConnector({ issueRefresh })
  scope.defer(() => c.stop())
  const other = otherServer()
  const clock = fakeClock()
  const recorder = recordingFetch(other)
  const w = {
    sdk, scope, root, c, other, clock, recorder,
    /** The default config: the user's CIMD and one server `m` at U. */
    config: config ?? ((cc) => ({ clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: 'm', url: cc.url }] })),
    n: undefined,
    start: async (cfg = w.config(c), opts) => { const n = await startN(w, cfg, opts); w.n ??= n; return n },
    /**
     * An N restart: dispose the host, run `between()` while N is down (e.g. a store edit made by
     * another process), then start a new host on the same credentials file.
     */
    async restart(cfg = w.n.config, { between } = {}) {
      await w.n.stop()
      if (between) await between()
      w.n = await startN(w, cfg)
      return w.n
    },
    /** Every request the world's servers received that a refusal forbids (authorization, registration, token). */
    forbidden: () => [...c.forbiddenRequests(), ...other.forbiddenRequests()],
  }
  if (start) {
    w.n = await w.start()
    assert.equal(w.n.error, undefined, 'the adapter refused to start: ' + (w.n.error?.stack ?? w.n.error))
  }
  return w
}

/** Waits until `serverName`'s state is `state`; returns its entry. */
export async function untilState(n, serverName, state) {
  const entry = await eventually(() => (n.stateOf(serverName)?.state === state ? n.stateOf(serverName) : undefined))
  assert.ok(entry, `${serverName} never became ${state}; status: ${JSON.stringify(n.status())}`)
  return entry
}

/** Waits until the child row of `serverName` is mounted and its tools are registered. */
export async function untilChild(n, serverName, tool) {
  const ok = await eventually(() => n.child(serverName) && n.tool(ADAPTER.mcpTool(serverName, tool)))
  assert.ok(ok, `no child row / ${ADAPTER.mcpTool(serverName, tool)}; children: ${n.children().length}`)
}

/** The `server/discover` requests C received (the child row connecting). */
export const discovers = (c) => c.mcpRequests().filter((r) => r.body.includes(`"${RPC.discover}"`))
/** The `tools/call` requests C received. */
export const toolCalls = (c) => c.mcpRequests().filter((r) => r.body.includes(`"${RPC.toolsCall}"`))

/** The listening TCP endpoints of this process (`lsof`), e.g. `127.0.0.1:54321`. */
export function listeningEndpoints() {
  const out = execFileSync(LSOF.bin, LSOF.args(process.pid), { encoding: 'utf8' })
  return out.split('\n').filter((l) => l.startsWith('n')).map((l) => l.slice(1)).sort()
}

/** A JSON-RPC POST body of exactly `bytes` bytes (a `tools/call` padded in its arguments). */
export function bodyOfBytes(bytes, id) {
  const base = { jsonrpc: RPC.jsonrpc, id, method: RPC.toolsCall, params: { name: 'whoami', arguments: { pad: '' } } }
  const empty = Buffer.byteLength(JSON.stringify(base))
  base.params.arguments.pad = 'x'.repeat(bytes - empty)
  const text = JSON.stringify(base)
  assert.equal(Buffer.byteLength(text), bytes)
  return text
}

/** The headers a stock MCP client sends on a POST (spec terms), with `auth` as Authorization. */
export const mcpHeaders = (auth) => ({
  'content-type': WEB.json,
  accept: `${WEB.json}, ${WEB.sse}`,
  'mcp-protocol-version': K1.PROTOCOL.version,
  ...(auth === undefined ? {} : { authorization: auth }),
})

/** A small valid `tools/call` body. */
export const callBody = (id) => JSON.stringify({ jsonrpc: RPC.jsonrpc, id, method: RPC.toolsCall, params: { name: 'whoami', arguments: {} } })

export const isClientError = (status) => status >= WEB.clientErrorMin && status <= WEB.clientErrorMax
export const listFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).sort() : [])
export { STATE, WAIT }
