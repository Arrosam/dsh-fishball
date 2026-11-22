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
import { callRoute, nodeResponse } from '@dsh-instance/test-helpers/routes'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { credentialLink } from '../support/credential-link.mjs'
import { fakeChildCredentials, fakeLifecycle, fakeTokens } from '../support/fakes.mjs'
import { importInstance } from '../support/instance.mjs'
import { FIXTURE, HOSTNAME, K3, MODULE, RECORD, TICKET } from './constants.mjs'
import { fakeProviderSync, memoryRecord } from './fakes.mjs'

/** The origin the settings page sends its requests from. */
export const ROUTE_ORIGIN = `http://${HOSTNAME.ipv4}:${FIXTURE.port}`
/** The area's connector: no onChange member (its cases drive the record, not pair changes). */
const connector = (apiVersion = K3.tokensApiVersion) => fakeTokens({ fixture: FIXTURE, apiVersion, onChange: false })

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
  const link = await credentialLink(sdk, credentials, { receiver, timeoutMs })
  const wire = link.connect()
  scopeOf(t).defer(link.close)
  return { client: link.client, wire, credentials, receiver: link.receiver }
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
  const { admissionKey, mintTicket } = await load(sdk, 'ticket')
  const order = []
  const tokens = options.tokens === false ? undefined : connector(typeof options.tokens === 'number' ? options.tokens : undefined)
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
  const lifecycle = fakeLifecycle({ initial: options.lifecycle, port: FIXTURE.port })
  const providerSync = fakeProviderSync()
  // A new authenticated wire (a start, a restart or a reconnect of the link); the previous ends close.
  const link = await credentialLink(sdk, credentials, { receiver: options.receiver !== false, timeoutMs: FIXTURE.timeoutMs })
  const { wires, connect, imports } = link
  scopeOf(t).defer(link.close)
  connect()
  let changes = 0
  const hosted = createHostedToken({
    tokens: () => tokens,
    record: recorded,
    credentials: () => link.client,
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

/** routes.js over a fake Fetch registry. */
export async function routesWorld(sdk, service, ctx) {
  const { registerInstanceRoutes } = await load(sdk, 'routes')
  registerInstanceRoutes(ctx.ctx, service)
  return { call: (method, routePath, options) => callRoute(ctx.routes, method, routePath, { origin: ROUTE_ORIGIN, ...options }), routes: ctx.routes }
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

