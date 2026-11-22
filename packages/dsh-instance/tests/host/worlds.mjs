/**
 * The host area's worlds: the real host modules of dsh-instance, bound to one SDK, wired over the
 * fakes of fakes.mjs. Nothing here reads or imitates the implementation; each world plays only the
 * documented surface of what it stands in for.
 *
 *   hostedWorld   createHostedToken (hosted.js) + createChildLocator (locator.js) + the real
 *                 credential client and receiver over an in-memory wire + a fake connector, child
 *                 store and lifecycle; the record in memory or the real openHostedRecord file.
 *   credentialPair  the real client and receiver on one in-memory wire.
 *   routesWorld   registerInstanceRoutes (routes.js) over a fake Fetch registry.
 *   admissionWorld  the child-side row's registerAdmission (child-row.js) with the real redeemer.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { importInstance } from '../support/instance.mjs'
import { FIXTURE, HOSTNAME, IMPORT, MODULE, RECORD, TICKET } from './constants.mjs'
import { fakeChildCredentials, fakeLifecycle, fakeProviderSync, fakeTokens, memoryRecord, memoryWire, parseFrame } from './fakes.mjs'

/** One package module bound to `sdk`. */
export const load = (sdk, key) => importInstance(sdk, MODULE[key])

// One LIFO cleanup stack per test, so record owners drain before the scratch folder is removed.
const scopes = new WeakMap()
export function scopeOf(t) {
  if (!scopes.has(t)) scopes.set(t, cleanups(t))
  return scopes.get(t)
}
export const scratch = (t) => tempRoot(scopeOf(t), FIXTURE.tempPrefix)

/** A canonical scratch main home, or an alias of one (`alias`: the home is a link; `ancestor`: a link above it). */
export function homeOf(t, kind) {
  const base = fs.realpathSync(scratch(t))
  const real = path.join(base, 'real-home')
  fs.mkdirSync(real)
  if (kind === 'canonical') return { home: real, base }
  if (kind === 'alias') {
    fs.symlinkSync(real, path.join(base, 'alias-home'))
    return { home: path.join(base, 'alias-home'), base }
  }
  fs.symlinkSync(real, path.join(base, 'ancestor-link'))
  fs.mkdirSync(path.join(real, 'home'))
  return { home: path.join(base, 'ancestor-link', 'home'), base }
}
/** <mainHome>/fishball/hosted.json; its owner-only folder exists in any host that laid out its child. */
export function recordFile(mainHome) {
  const dir = path.join(mainHome, RECORD.dir)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  return path.join(dir, RECORD.file)
}

/** The real credential client and receiver on one in-memory wire; `receiver: false` never answers. */
export async function credentialPair(t, sdk, { credentials = fakeChildCredentials(), receiver = true, timeoutMs = FIXTURE.timeoutMs } = {}) {
  const { createCredentialClient, createCredentialReceiver } = await load(sdk, 'credential')
  const wire = memoryWire()
  const r = receiver ? createCredentialReceiver({ credentials }) : undefined
  r?.attach(wire.child)
  const client = createCredentialClient(wire.host, { timeoutMs, importTimeoutMs: timeoutMs })
  scopeOf(t).defer(() => { client.close(); r?.close() })
  return { client, wire, credentials, receiver: r }
}

/**
 * One hosted world on `sdk`. Options: `tokens` (false = no connector; a number = that apiVersion),
 * `remote` (an extra remoteTarget dependency, adversarial since MULTI-2), `credentials`
 * (fakeChildCredentials options), `record` ('file' = the real record under a scratch main home;
 * else an in-memory record seeded with these keys), `lifecycle` (initial status), `receiver`
 * (false = a child that never answers), `ticket` (the locator's mint).
 * `order` records the order of the child's store write and the record's add.
 */
export async function hostedWorld(t, sdk, options = {}) {
  const { createHostedToken } = await load(sdk, 'hosted')
  const { createChildLocator } = await load(sdk, 'locator')
  const { createCredentialClient, createCredentialReceiver } = await load(sdk, 'credential')
  const { admissionKey, mintTicket } = await load(sdk, 'ticket')
  const order = []
  const tokens = options.tokens === false ? undefined : fakeTokens(typeof options.tokens === 'number' ? { apiVersion: options.tokens } : {})
  const credentials = fakeChildCredentials(options.credentials)
  const set = credentials.set.bind(credentials)
  credentials.set = async (name, value) => { order.push('child-set'); return set(name, value) }
  let mainHome
  let record
  if (options.record === 'file') {
    mainHome = scratch(t)
    const { openHostedRecord } = await load(sdk, 'record')
    record = await openHostedRecord(recordFile(mainHome))
  } else record = memoryRecord(options.record ?? [])
  const add = record.add.bind(record)
  const recorded = {
    add: async (key, opts) => { order.push('record-add'); return add(key, opts) },
    entries: () => record.entries(),
    runtime: () => record.runtime(),
    pending: () => record.pending(),
    settle: (old) => record.settle(old),
  }
  const lifecycle = fakeLifecycle(options.lifecycle)
  const providerSync = fakeProviderSync()
  const wires = []
  let client
  let receiver
  /** A new authenticated wire (a start, a restart or a reconnect of the link); the previous ends close. */
  function connect() {
    client?.close()
    receiver?.close()
    const wire = memoryWire()
    receiver = options.receiver === false ? undefined : createCredentialReceiver({ credentials })
    receiver?.attach(wire.child)
    client = createCredentialClient(wire.host, { timeoutMs: FIXTURE.timeoutMs, importTimeoutMs: FIXTURE.timeoutMs })
    wires.push(wire)
    return wire
  }
  scopeOf(t).defer(() => { client?.close(); receiver?.close() })
  connect()
  let changes = 0
  const hosted = createHostedToken({
    tokens: () => tokens,
    record: recorded,
    credentials: () => client,
    instanceId: () => FIXTURE.instanceId,
    // MULTI-2: no remote override exists; an extra dependency of that name must change nothing.
    remoteTarget: () => options.remote ?? FIXTURE.blank,
    runtimeId: () => FIXTURE.runtimeId,
    changed: () => { changes += 1 },
  })
  scopeOf(t).defer(() => hosted.close())
  const issued = []
  const key = admissionKey(FIXTURE.secret)
  const ticket = options.ticket ?? (async (claims) => { issued.push(claims); return mintTicket(key, { generation: FIXTURE.generation, ...claims }) })
  const locator = createChildLocator({ lifecycle, origin: lifecycle.origin, ticket, hosted, providerSync })
  const imports = () => wires.flatMap((w) => w.frames.toChild).map(parseFrame).filter((f) => f?.op === IMPORT.ops.import)
  return {
    tokens, credentials, record, lifecycle, providerSync, hosted, locator, order, issued, mainHome, wires, connect, imports,
    get wire() { return wires.at(-1) },
    get changes() { return changes },
    /** Every frame on every wire so far, both directions. */
    frames: () => wires.flatMap((w) => [...w.frames.toChild.map((text) => ({ dir: 'toChild', text })), ...w.frames.toHost.map((text) => ({ dir: 'toHost', text }))]),
    /** Seed an entry from an earlier pairing in the connector and the record, then set its state. */
    async seedEntry(state) {
      const entry = await tokens.createHosted(FIXTURE.instanceId)
      tokens.calls.created.pop()
      await record.add(entry.entryKey)
      tokens.setState(entry.entryKey, state)
      return entry.entryKey
    },
    /** A child restart: a new wire, then the host's first-start question again. */
    async restart() { connect(); await hosted.firstStart() },
    /** A reinstall: the child home (and its store) is gone, then a start. */
    async reinstall() { credentials.wipe(); connect(); await hosted.firstStart() },
  }
}

/**
 * One request to a route a row registered on DSH's Fetch registry (`{path, fetch}`), as the page
 * sends it: `{body, host}` → `{status, json, headers, text}`.
 */
export async function callRoute(routes, method, routePath, { body, host = HOSTNAME.ipv4 + ':' + FIXTURE.port } = {}) {
    const route = routes.find((r) => r.path === routePath)
    assert.ok(route, 'no route registered at ' + routePath + '; registered: ' + routes.map((r) => r.path).join(', '))
    const request = new Request(`http://${HOSTNAME.ipv4}:${FIXTURE.port}${routePath}`, {
      method,
      headers: { host, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    })
    const response = await route.fetch(request)
    const text = await response.text()
    return { status: response.status, json: parseFrame(text), headers: response.headers, text }
}

/** routes.js over a fake Fetch registry. */
export async function routesWorld(sdk, service, ctx) {
  const { registerInstanceRoutes } = await load(sdk, 'routes')
  registerInstanceRoutes(ctx.ctx, service)
  return { call: (...args) => callRoute(ctx.routes, ...args), routes: ctx.routes }
}

/**
 * The child side of admission: child-row.js registerAdmission over a fake child context whose
 * `nativeRuntime.redeemTicket` is the real redeemer for `secret`/`generation` on the injected
 * clock `now`, whose web server listens on `port`, and whose DSH login (`authorizeIndex`) issues the
 * child's own cookie for the launch URL only (`cookie: null` = no cookie). `get(ticket, host, method)`
 * plays one browser request and answers `{status, headers, body}`.
 */
export async function admissionWorld(sdk, { now = () => FIXTURE.t0, cookie = FIXTURE.cookie } = {}) {
  const { registerAdmission } = await load(sdk, 'childRow')
  const { admissionKey, createTicketRedeemer } = await load(sdk, 'ticket')
  const redeemer = createTicketRedeemer(admissionKey(FIXTURE.secret), FIXTURE.generation, now)
  const routes = []
  const origin = `http://127.0.0.1:${FIXTURE.port}`
  const ctx = {
    nativeRuntime: { redeemTicket: (ticket, audience) => redeemer.redeem(ticket, audience) },
    webServer: { register(route) { routes.push(route); return () => {} }, getOrigin: () => origin },
    connection: {
      authenticatedUrl: (base) => { const u = new URL(base); u.searchParams.set('token', FIXTURE.launchToken); return u.href },
      authorizeIndex(request, sink) {
        if (!String(request.url).includes(FIXTURE.launchToken) || cookie === null) return false
        sink.writeHead(303, { location: '/', 'set-cookie': cookie })
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
    const route = routes.find((r) => r.path === TICKET.path)
    assert.ok(route, 'the admission route is not registered at ' + TICKET.path)
    const url = ticket === undefined ? TICKET.path : `${TICKET.path}?${TICKET.param}=${encodeURIComponent(ticket)}`
    const res = nodeResponse()
    await route.handler({ method, url, headers: { host } }, res)
    await res.done
    return res.result()
  }
  return { get, routes }
}

/** A Node ServerResponse stand-in that records the answer. */
function nodeResponse() {
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