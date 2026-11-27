/**
 * The F-LINK fake connector: fishball-test-helpers/fake-connector's `FakeConnector` (K1's metadata,
 * client-credentials token endpoint and MCP 2026-07-28 endpoint, request recording, drop/restore)
 * with only what the link rows add on top, each off by default:
 * - `mode`: MODE.v2 answers 404 to everything (R-MIG-03); MODE.redirect answers every request on the
 *   MCP path with a redirect to `redirectTo` (REM-UC-01 E4);
 * - `issuerOrigin`: the protected-resource metadata names that foreign authorization server;
 * - `tools()`: what `tools/list` answers, read per request (R-FIX-CORE F02);
 * - `onTool(name, args)`: a scripted tool result (a promise may hold the call);
 * - `onRpc(message)`: a raw HTTP answer `{status, body, headers?}` to an authenticated request;
 * - `hint()`, `revokeAccess()`, `acceptSecret(bool)`: the events hint, a revoked chain (access tokens
 *   die, listen streams stay open) and a secret the token endpoint refuses (R-FIX-CORE F03/F04).
 * The cases' one principal holds full scope from its first token (the link rows test no pairing;
 * the identity area does), as the old F-LINK fake gave it.
 */
import http from 'node:http'
import { FakeConnector, RPC as FAKE_RPC, readBody, sendJson } from 'fishball-test-helpers/fake-connector'
import { HARNESS, K1, MAILBOX, PRINCIPAL, WEB } from './constants.mjs'

/** How the fake behaves (one decision-table input per value). */
export const MODE = Object.freeze({ v3: Symbol('v3'), v2: Symbol('v2'), redirect: Symbol('redirect') })

/** A mailbox event of K1's shape (MAILBOX_EVENT_SCHEMA), with a fake digest of K1's length. */
export function mailboxEvent(sequence, type, payload, offer) {
  return {
    eventId: `e${sequence}`, mailboxGeneration: MAILBOX.generation, sequence, type, at: Date.now(),
    sourceSessionId: null, correlationId: null, ...(offer === undefined ? {} : { offer }), payload,
    payloadDigest: MAILBOX.digestFill.repeat(K1.WIRE.digestHexChars),
  }
}

class LinkConnector extends FakeConnector {
  constructor({ mode = MODE.v3, issuerOrigin, redirectTo, tools, onTool, onRpc }) {
    super({ entries: [{ entryKey: PRINCIPAL.entryKey, secret: PRINCIPAL.secret }], generation: MAILBOX.generation })
    Object.assign(this, { mode, issuerOrigin, redirectTo, toolsOf: tools, script: onTool })
    const base = this.methods
    // onRpc answers before any method; `tools()` replaces the fixed list (both R-FIX-CORE hooks).
    const wrapped = Object.fromEntries(Object.entries(base).map(([name, fn]) => [name, function (arg) {
      const raw = onRpc?.(arg.message)
      if (raw === undefined) return fn.call(this, arg)
      sendJson(arg.res, raw.status, raw.body, raw.headers)
      return undefined
    }]))
    const list = wrapped[FAKE_RPC.toolsList]
    wrapped[FAKE_RPC.toolsList] = function (arg) {
      if (this.toolsOf !== undefined) this.state.tools = [...this.toolsOf()]
      return list.call(this, arg)
    }
    this.methods = wrapped
  }

  scopeOf() { return K1.SCOPE.full }
  /** A scripted result answers first, for every tool (`pair` included: the F02 rows script it). */
  async toolResult(caller, name, args) {
    const scripted = await this.script?.(name, args)
    if (scripted === undefined) return super.toolResult(caller, name, args)
    this.calls.push({ name, args, clientId: caller.clientId, entryKey: caller.entryKey, at: Date.now(), result: scripted })
    return K1.okResult(scripted)
  }
  /** `approval_answer` is accepted (K1's output schema requires `accepted`); any other tool answers `{}`. */
  defaultTool(name) { return K1.okResult(name === K1.TOOL.approvalAnswer ? { accepted: true } : {}) }
  async beforeRoute(req, res, url) {
    if (this.mode === MODE.v2) { sendJson(res, K1.HTTP_STATUS.notFound, {}); return true }
    if (this.mode === MODE.redirect && url.pathname === K1.PATHS.mcp) { res.writeHead(WEB.temporaryRedirect, { [WEB.location]: this.redirectTo }); res.end(); return true }
    return false
  }
  protectedResource(origin, resourcePath) {
    const doc = super.protectedResource(origin, resourcePath)
    return this.issuerOrigin === undefined ? doc : { ...doc, authorization_servers: [this.issuerOrigin + K1.PATHS.issuer] }
  }

  /** Origin under one loopback name, e.g. `http://[::1]:49152`. */
  origin(host) { return `${K1.HOSTS.loopbackScheme}//${host}:${this.port}` }
  /** Queue events for the next inbox_poll, with no hint (a commit the link learns of on its next poll). */
  enqueue(...events) { this.mailbox.push(...events) }
  /** The events hint on every open listen stream (R-CON-04). */
  hint() { return this.hintEvents() }
  /** Every access token dies; the listen streams stay open (a revoked OAuth chain). */
  revokeAccess() { this.access.clear() }
  /** The token endpoint refuses (`false`) or accepts (`true`) the principal's secret. */
  acceptSecret(accepted) { this.state.refuseTokens = !accepted }
}

/** Starts the F-LINK fake on a dual-stack loopback port (127.0.0.1, localhost and [::1] reach it). */
export const startFakeConnector = (options = {}) => new LinkConnector(options).open()

/** A plain recorder on another origin: answers 404 to everything and records what it was sent. */
export async function startRecorder() {
  const requests = []
  const server = http.createServer(async (req, res) => {
    requests.push({ method: req.method, path: req.url, headers: { ...req.headers }, body: await readBody(req) })
    sendJson(res, K1.HTTP_STATUS.notFound, {})
  })
  await new Promise((resolve) => server.listen(0, HARNESS.bindHost, resolve))
  const { port } = server.address()
  return {
    requests,
    origin: (host) => `${K1.HOSTS.loopbackScheme}//${host}:${port}`,
    stop: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) }),
  }
}

/** A loopback port with nothing listening on it (bound once, then released). */
export async function freePort() {
  const server = http.createServer()
  await new Promise((resolve) => server.listen(0, HARNESS.bindHost, resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}
