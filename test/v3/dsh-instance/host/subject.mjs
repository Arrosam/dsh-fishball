/**
 * The one place that binds the I-HOST cases to the code under test (the seam the dev session
 * relayed, 2026-11-16; constants.mjs RELAYED). If the surface differs, only this file is adapted.
 *
 *   createChildLocator({lifecycle, origin, ticket, hosted, providerSync}) → K3 dshInstanceChild
 *   createHostedToken({tokens, record, credentials, instanceId, remoteTarget, changed})
 *     → {firstStart(), reconnect(), targetStatus(), retryNotice(), notice()}
 *   childTargetUrl({instanceTargetUrl, hostOrigin, connectorUsable}) → string
 *   openHostedRecord(file) → {entries(), add(entryKey)}
 *   registerInstanceRoutes(ctx, service)          ctx.connection.fetch.register({path, fetch})
 *   admissionKey(secret), mintTicket(key, {generation, audience, view, lang}, now),
 *   verifyTicket(key, ticket, {generation, audience}, now), createTicketRedeemer(key, generation, now)
 *   createCredentialClient(transport, {timeoutMs}), createCredentialReceiver({credentials})
 *   registerAdmission(ctx) (child-row.js): ctx.nativeRuntime.redeemTicket, ctx.webServer.register /
 *     getOrigin, ctx.connection.authenticatedUrl / authorizeIndex
 *   launchOverlay(paths, record, childModule, limits, control, entries, child)
 *
 * Every module is imported bound to the SDK of the test file (`?fbsdk=`), so `@deepseek-ai/*`
 * resolves to that SDK. Nothing here reads or imitates the implementation.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { canonicalTmp, requireModule } from '../../dsh-connector-adapter/oauth-client/subject.mjs'
import { FIXTURE, HOSTNAME, IMPORT, K3, RELAYED } from './constants.mjs'
import { fakeChildCredentials, fakeLifecycle, fakeProviderSync, fakeTokens, memoryRecord, memoryWire } from './fakes.mjs'

const TASK = 'I-HOST'
const at = (relative) => path.join(V3.instance.dir, relative)

/** One relayed module of dsh-instance bound to `sdk`, its relayed exports required. */
export const instanceModule = (sdk, key, exports = []) => requireModule(sdk, { entry: at(RELAYED.modules[key]), exports: [exports].flat(), task: TASK })

export const ticketModule = (sdk) => instanceModule(sdk, 'ticket', RELAYED.exports.ticket)
export const credentialModule = (sdk) => instanceModule(sdk, 'credential', RELAYED.exports.credential)
export const hostedModule = (sdk) => instanceModule(sdk, 'hosted', RELAYED.exports.hosted)
export const locatorModule = (sdk) => instanceModule(sdk, 'locator', RELAYED.exports.locator)
export const recordModule = (sdk) => instanceModule(sdk, 'record', RELAYED.exports.record)
export const routesModule = (sdk) => instanceModule(sdk, 'routes', RELAYED.exports.routes)
export const childRowModule = (sdk) => instanceModule(sdk, 'childRow', RELAYED.exports.admission)
export const runtimeModule = (sdk) => instanceModule(sdk, 'runtime', RELAYED.exports.overlay)
export const constantsModule = (sdk) => instanceModule(sdk, 'constants', Object.values(RELAYED.constantNames))

/** What an async call did: `{value}` or `{error}` (the error itself, so its `code` can be read). */
export async function settle(fn) {
  try { return { value: await fn() } } catch (error) { return { error } }
}
export const tick = (ms = FIXTURE.settleMs) => new Promise((resolve) => setTimeout(resolve, ms))

/** A scratch directory under the canonical temp dir, removed after the test (guarded). */
export function scratch(t) {
  const base = canonicalTmp()
  const dir = fs.mkdtempSync(path.join(base, FIXTURE.tempPrefix))
  t.after(() => {
    assert.ok(path.dirname(dir) === base && path.basename(dir).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

/**
 * The hosted record file of a main home. Its folder `<mainHome>/fishball` exists in any host that
 * has laid out its child; a scratch main home gets it here (owner-only), so the record's own write
 * is what a case observes.
 */
export function recordFile(mainHome) {
  const dir = path.join(mainHome, ...RELAYED.record.dirs)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  return path.join(dir, RELAYED.record.file)
}

/**
 * One hosted world on `sdk`: the fake connector service, the child's credential store with the
 * real receiver on the child end of an in-memory wire, the real credential client on the host end,
 * the real hosted-token logic and the real locator over a fake lifecycle.
 *
 * Options: `tokens` (false = no connector; a number = that apiVersion), `remote` (the instance
 * targetUrl), `credentials` (fakeChildCredentials options), `record` ('file' = the real
 * openHostedRecord under a scratch main home; else an in-memory record seeded with these keys),
 * `lifecycle` (its initial status), `wire` (false = no wire yet), `timeoutMs` (both the probe and
 * the import wait, `{timeoutMs, importTimeoutMs}` of the relayed client).
 * `order` records the observable order of the child's store write and the record's add.
 */
export async function hostedWorld(t, sdk, options = {}) {
  const { createCredentialClient, createCredentialReceiver } = await credentialModule(sdk)
  const { createHostedToken } = await hostedModule(sdk)
  const { createChildLocator } = await locatorModule(sdk)
  const order = []
  const tokens = options.tokens === false ? undefined : fakeTokens(typeof options.tokens === 'number' ? { apiVersion: options.tokens } : {})
  const credentials = fakeChildCredentials(options.credentials)
  const set = credentials.set.bind(credentials)
  credentials.set = async (name, value) => { order.push('child-set'); return set(name, value) }
  let mainHome
  let record
  if (options.record === 'file') {
    mainHome = scratch(t)
    const { openHostedRecord } = await recordModule(sdk)
    record = await openHostedRecord(recordFile(mainHome))
  } else record = memoryRecord(options.record ?? [])
  const add = record.add.bind(record)
  const recorded = { add: async (key) => { order.push('record-add'); return add(key) }, entries: () => record.entries() }
  const lifecycle = fakeLifecycle(options.lifecycle)
  const providerSync = fakeProviderSync()
  const timeoutMs = options.timeoutMs ?? FIXTURE.longTimeoutMs
  const wires = []
  let client
  let receiver
  const clients = []
  /** A new authenticated wire (a start, a restart or a reconnect of the link). */
  function connect() {
    client?.close()
    receiver?.close()
    const wire = memoryWire()
    // `receiver: false` is a child that never answers on the channel (the client's timeout rows).
    receiver = options.receiver === false ? undefined : createCredentialReceiver({ credentials })
    receiver?.attach(wire.child)
    client = createCredentialClient(wire.host, { timeoutMs, importTimeoutMs: timeoutMs })
    clients.push(client)
    wires.push(wire)
    return wire
  }
  if (options.wire !== false) connect()
  t.after(() => { for (const c of clients) c.close(); receiver?.close() })
  let changes = 0
  let remote = options.remote ?? FIXTURE.blank
  const hosted = createHostedToken({
    tokens: () => tokens,
    record: recorded,
    credentials: () => client,
    instanceId: () => FIXTURE.instanceId,
    remoteTarget: () => remote,
    changed: () => { changes += 1 },
  })
  const issued = []
  const ticketKey = (await ticketModule(sdk)).admissionKey(FIXTURE.secret)
  const { mintTicket } = await ticketModule(sdk)
  const ticket = options.ticket ?? (async (claims) => { issued.push(claims); return mintTicket(ticketKey, { generation: FIXTURE.generation, ...claims }, Date.now()) })
  const locator = createChildLocator({ lifecycle, origin: lifecycle.origin, ticket, hosted, providerSync })
  return {
    tokens, credentials, record, lifecycle, providerSync, hosted, locator, order, issued, ticketKey, mainHome,
    connect,
    get wire() { return wires.at(-1) },
    wires,
    get changes() { return changes },
    setRemote(value) { remote = value },
    /** Every frame on every wire so far, both directions. */
    frames: () => wires.flatMap((w) => [...w.frames.toChild.map((text) => ({ dir: 'toChild', text })), ...w.frames.toHost.map((text) => ({ dir: 'toHost', text }))]),
    /** The import frames the host sent (parsed). */
    imports: () => wires.flatMap((w) => w.frames.toChild).map(parse).filter((f) => f?.op === IMPORT.ops.import),
    /** A child restart: a new wire, then the host's first-start question again. */
    async restart() { connect(); await hosted.firstStart() },
    /** A reinstall: the child home (and its store) is gone, then a start. */
    async reinstall() { credentials.wipe(); connect(); await hosted.firstStart() },
  }
}
const parse = (text) => { try { return JSON.parse(text) } catch { return undefined } }
export const parseFrame = parse

/** A fake ctx for the routes, and a call helper: `call(method, route, {body, host})` → `{status, json, headers, text}`. */
export async function routesWorld(sdk, service, ctx) {
  const { registerInstanceRoutes } = await routesModule(sdk)
  registerInstanceRoutes(ctx.ctx, service)
  const handlerOf = (route) => route.fetch ?? route.handler
  async function call(method, routePath, { body, host = HOSTNAME.ipv4 + ':' + FIXTURE.port } = {}) {
    const route = ctx.routes.find((r) => r.path === routePath)
    assert.ok(route, 'no route registered at ' + routePath + '; registered: ' + ctx.routes.map((r) => r.path).join(', '))
    const request = new Request(`http://${HOSTNAME.ipv4}:${FIXTURE.port}${routePath}`, {
      method,
      headers: { host, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    })
    const response = await handlerOf(route)(request)
    const text = await response.text()
    return { status: response.status, json: parse(text), headers: response.headers, text }
  }
  return { call, routes: ctx.routes }
}

/**
 * The child side of admission on `sdk`: the real child-row `registerAdmission` over a fake child
 * context whose `nativeRuntime.redeemTicket` is the real redeemer for `secret` and `generation`
 * (or `redeem`), whose web server listens on `port`, and whose DSH login (`authorizeIndex`) issues
 * the child's own cookie for the launch URL only. `get(ticket, host, method)` plays one browser
 * request and answers `{status, headers, body}`.
 */
export async function admissionWorld(sdk, { secret = FIXTURE.secret, generation = FIXTURE.generation, now, port = FIXTURE.port, cookie = FIXTURE.cookie, redeem } = {}) {
  const { registerAdmission } = await childRowModule(sdk)
  const { admissionKey, createTicketRedeemer } = await ticketModule(sdk)
  const redeemer = redeem === undefined ? createTicketRedeemer(admissionKey(secret), generation, now) : undefined
  const routes = []
  const seen = { authorize: [], redeem: [] }
  const origin = `http://127.0.0.1:${port}`
  const ctx = {
    nativeRuntime: { redeemTicket(ticket, audience) { seen.redeem.push({ ticket, audience }); return redeem ? redeem(ticket, audience) : redeemer.redeem(ticket, audience) } },
    webServer: { register(route) { routes.push(route); return () => {} }, getOrigin: () => origin },
    connection: {
      authenticatedUrl: (base) => { const u = new URL(base); u.searchParams.set('token', FIXTURE.launchToken); return u.href },
      authorizeIndex(request, sink) {
        seen.authorize.push(request)
        if (!String(request.url).includes(FIXTURE.launchToken) || cookie === null) return false
        sink.writeHead(RELAYED.admit.seeOther, { location: '/', 'set-cookie': cookie })
        sink.end()
        return true
      },
    },
    logger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
    effect(fn) { return fn() },
    on: () => () => {},
  }
  registerAdmission(ctx)
  async function get(ticket, host, method = 'GET') {
    const route = routes.find((r) => r.path === RELAYED.ticket.path)
    assert.ok(route, 'the admission route is not registered at ' + RELAYED.ticket.path)
    const url = ticket === undefined ? RELAYED.ticket.path : `${RELAYED.ticket.path}?${RELAYED.ticket.param}=${encodeURIComponent(ticket)}`
    const req = { method, url, headers: { host } }
    const res = response()
    await route.handler(req, res)
    await res.done
    return res.result()
  }
  return { get, routes, seen, ctx, origin }
}

/** A Node-like ServerResponse stand-in that records the answer. */
function response() {
  const headers = {}
  let status
  let body = ''
  let resolve
  const done = new Promise((r) => { resolve = r })
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers[String(name).toLowerCase()] = value },
    getHeader(name) { return headers[String(name).toLowerCase()] },
    writeHead(code, extra = {}) { status = code; for (const [k, v] of Object.entries(extra ?? {})) headers[k.toLowerCase()] = v; return res },
    write(chunk) { body += String(chunk) },
    end(chunk) { if (chunk !== undefined) body += String(chunk); resolve() },
    done,
    result: () => ({ status: status ?? res.statusCode, headers, body }),
  }
  return res
}

/** A deep text of any value, for leak sweeps. */
export const textOf = (value) => JSON.stringify(value, (_, v) => (Buffer.isBuffer(v) ? v.toString('hex') : v)) ?? ''

/** HostServiceError code of a rejection. */
export const codeOf = (outcome) => outcome?.error?.code

export { K3 }
