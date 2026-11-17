/**
 * The one place that binds the C-OAUTH-WEB cases to C-OAUTH-WEB's module
 * (`packages/dsh-connector/src/mcp/oauth-web/index.js`). The surface is the one Fishball relayed from
 * the dev session (2026-11-14), and nothing else of the module is read:
 *
 * - `createApprovalHandler({gate, originOf, secure, cimd, tokens, pairs, store, limiter, dshName,
 *   dshPort(), approvalPort(), now(), logger?})` → a node:http request handler;
 * - `createApprovalListener({handler, host, port, createServer?, timers?, logger?, onStatus?})` →
 *   `{start, setPort, close, status, port, listening}`, status `ok` or `approval-port-in-use`;
 * - `createCimdFetcher({resolve?(hostname) → addresses, transport?{get(url, addresses, signal) →
 *   {status, headers, body: AsyncIterable}}, now?, timers?})` → `{fetch(clientId)}` →
 *   `{ok: true, doc}` or `{ok: false, reason}`;
 * - `createAuthorizationCodeGrant({store, tokens, pairs})`, `createRefreshTokenGrant({store,
 *   tokens, pairs})` → K1b `GrantHandler`s;
 * - `originOf(req, {secure})`, injected: `"<scheme>//<Host>"` exactly as dialled, or `undefined`.
 *
 * Everything the handler depends on is a fake (fakes.mjs). The cases stand in for C-OAUTH's token
 * endpoint: they call a grant's `handle(form, ctx)` with the context C-OAUTH builds, and record a
 * `countedFailure` on the shared limiter as C-OAUTH does (K1b GrantResult). No real network: the
 * handler listens on an ephemeral loopback port, and the CIMD fetcher gets a stubbed resolver and
 * transport.
 */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { INSTANCE } from '../../../support/constants.mjs'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { resolveRuntimePackages } from '../pairs/subject.mjs'
import { base32 } from '../../contract/k1d-amendments/subject.mjs'
import { Browser } from './browser.mjs'
import {
  CLIENT_AUTH, DERIVED_AGENT_ID, FIXTURE, GRANT, HOSTS, LIFETIME, PARAM, PATHS, PKCE, RESPONSE_TYPE, STUB, SUBJECT, TOKEN_VALUE, documentFor, oauthUrls,
} from './constants.mjs'
import { fakeCimd, fakeClock, fakeGate, fakeLimiter, fakeLogger, fakeOAuthStore, fakePairs, fakeTimers, fakeTokens } from './fakes.mjs'

/** C-OAUTH-WEB's entry bound to one SDK, with the relayed exports required. */
export async function webModule(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (C-OAUTH-WEB "Owns" packages/dsh-connector/src/mcp/oauth-web/)`)
  resolveRuntimePackages()
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  for (const name of [SUBJECT.handler, SUBJECT.listener, SUBJECT.fetcher, SUBJECT.codeGrant, SUBJECT.refreshGrant]) {
    assert.equal(typeof mod[name], 'function', `the C-OAUTH-WEB entry exports no ${name}()`)
  }
  return mod
}

/** A member the relayed surface names that may be a value or a getter function. */
export const read = (value) => (typeof value === 'function' ? value() : value)

/** The injected `originOf`: loopback names are `http:` unless the listener is TLS; any other host `https:` (HOSTS). */
export function originOf(req, { secure }) {
  const host = req.headers.host
  if (host === undefined || host === '') return undefined
  const hostname = host.replace(/:\d+$/, '')
  const scheme = !secure && HOSTS.loopbackNames.includes(hostname) ? HOSTS.loopbackScheme : HOSTS.remoteScheme
  return `${scheme}//${host}`
}

/** Lowercase hex SHA-256 (the relayed store-key decision; TOKEN_VALUE.digestAlgorithm). */
export const digest = (value) => createHash(TOKEN_VALUE.digestAlgorithm).update(value).digest('hex')
/**
 * K1 DERIVED_AGENT_ID, computed by the test (K1d-5): the prefix and the first `chars` characters of
 * the unpadded base32 (the RFC 4648 encoder the K1d gate checks against RFC 4648 §10's vectors) of
 * the raw digest of the UTF-8 client id exactly as sent.
 */
export const derivedId = (clientId) => DERIVED_AGENT_ID.prefix
  + base32(createHash(DERIVED_AGENT_ID.digestAlgorithm).update(clientId, 'utf8').digest(), DERIVED_AGENT_ID.alphabet).slice(0, DERIVED_AGENT_ID.chars)
const base64url = (buf) => Buffer.from(buf).toString('base64url')
/** RFC 7636 §4.1–4.2: a verifier and its S256 challenge. */
export function pkce() {
  const verifier = base64url(randomBytes(FIXTURE.pkceVerifierBytes))
  return { verifier, challenge: base64url(createHash(TOKEN_VALUE.digestAlgorithm).update(verifier).digest()) }
}

const listen = (server, port = 0) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(port, FIXTURE.loopback, () => { server.off('error', reject); resolve(server.address().port) })
})
const closeServer = (server) => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) })

/**
 * One connector's browser-authorization side over fakes, served on an ephemeral loopback port.
 * `options.trustedHosts` are DSH's `--trusted-host` list; `options.cimd` replaces the fake fetcher
 * (e.g. the real one over a stubbed transport); `options.store(t)` resolves the OAuthTokenStore to
 * use instead of the fake (C-OAUTH's real one, test/v3/dsh-connector/oauth/chain-cases.mjs).
 * @param {import('node:test').TestContext} t
 */
export async function webWorld(t, sdk, options = {}) {
  const mod = await webModule(sdk)
  const clock = fakeClock(FIXTURE.t0)
  const tokens = fakeTokens(FIXTURE.entry)
  const pairs = fakePairs()
  const store = options.store === undefined ? fakeOAuthStore() : await options.store(t)
  const limiter = fakeLimiter()
  const logger = fakeLogger()
  // `options.cimd(mod, clock)` builds the fetcher (e.g. the real one over a stubbed transport).
  const cimd = options.cimd === undefined ? fakeCimd() : options.cimd(mod, clock)
  const facts = { host: FIXTURE.loopback, secure: false, trustedHosts: options.trustedHosts ?? [] }
  const gate = fakeGate(facts)
  const dshOrigin = `${HOSTS.loopbackScheme}//${FIXTURE.loopback}:${FIXTURE.dshPort}`
  let server
  let port
  let handler
  let codeGrant
  let refreshGrant
  const boot = async () => {
    handler = mod[SUBJECT.handler]({
      gate, originOf, secure: facts.secure, cimd, tokens, pairs, store, limiter, dshName: options.dshName ?? STUB.dshName,
      dshPort: () => FIXTURE.dshPort, approvalPort: () => port, now: clock.now, logger,
    })
    assert.equal(typeof handler, 'function', `${SUBJECT.handler}() returned no request handler`)
    codeGrant = mod[SUBJECT.codeGrant]({ store, tokens, pairs })
    refreshGrant = mod[SUBJECT.refreshGrant]({ store, tokens, pairs })
    server = http.createServer(handler)
    port = await listen(server)
  }
  t.after(() => closeServer(server))
  await boot()
  if (options.cimd === undefined) cimd.document(FIXTURE.clientId, documentOf(FIXTURE.clientId))

  const world = {
    mod, clock, tokens, pairs, store, limiter, logger, cimd, gate, dshOrigin,
    get port() { return port },
    get handler() { return handler },
    get codeGrant() { return codeGrant },
    get refreshGrant() { return refreshGrant },
    urls: oauthUrls(dshOrigin),
    browsers: [],
    tokenResults: [],
    /** A browser dialling the approval listener as `host` (default `127.0.0.1:<port>`). */
    browser({ host = `${FIXTURE.loopback}:${port}`, scheme = HOSTS.loopbackScheme } = {}) {
      const b = new Browser({ port, host, scheme })
      world.browsers.push(b)
      return b
    },
    /** A connector restart: memory goes (the store's access tokens and codes, every pending request), persisted fakes stay. */
    async restart() {
      await closeServer(server)
      store.restart?.()
      await boot()
      for (const b of world.browsers) { b.port = port; b.host = b.host.replace(/:\d+$/, `:${port}`); b.origin = b.origin.replace(/:\d+$/, `:${port}`) }
    },
    /**
     * C-OAUTH's token endpoint, as K1b describes it: dispatch on `grant_type`, call the handler with
     * the request's context, record a counted failure on the shared limiter. Returns the GrantResult.
     */
    async token(form, { client, origin = dshOrigin, now = clock.now() } = {}) {
      const clean = Object.freeze(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== undefined)))
      const auth = client ?? { method: CLIENT_AUTH.none, clientId: clean[PARAM.clientId] }
      const handler = clean[PARAM.grantType] === GRANT.authorizationCode ? codeGrant : refreshGrant
      const failureKey = Object.freeze({ remoteAddress: FIXTURE.remoteAddress, clientId: auth.clientId })
      const result = await handler.handle(clean, Object.freeze({ origin, client: Object.freeze(auth), failureKey, now }))
      if (result.ok === false && result.countedFailure) limiter.recordFailure(failureKey, now)
      world.tokenResults.push(result)
      return result
    },
  }
  return world
}

/** The fixture document for a client id (constants.mjs documentFor). */
export const documentOf = (clientId, redirectUris = [FIXTURE.redirect], extra = {}) => documentFor(clientId, redirectUris, extra)

/**
 * The `/authorize` query of a valid request (AUTH-DT-07 rule 1) from a Fishball-like client that
 * passes its id, agent-w-1, as K1d's `agent_id` (R-OA-22 (a)); `overrides` set or (undefined) drop
 * members, so `{[PARAM.agentId]: undefined}` is a generic client that passes none (R-OA-22 (b)).
 */
export function authorizeParams(w, challenge, overrides = {}) {
  const params = {
    [PARAM.responseType]: RESPONSE_TYPE.code, [PARAM.clientId]: FIXTURE.clientId, [PARAM.redirectUri]: FIXTURE.redirect,
    [PARAM.codeChallenge]: challenge, [PARAM.codeChallengeMethod]: PKCE.method, [PARAM.state]: FIXTURE.state,
    [PARAM.resource]: w.urls.resource, [PARAM.agentId]: FIXTURE.id.agentW, ...overrides,
  }
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
}

/** The real CIMD fetcher over a stubbed resolver and transport (no network). */
export function cimdFetcher(mod, { resolve, transport, now }) {
  const fetcher = mod[SUBJECT.fetcher]({ resolve, transport, now })
  assert.equal(typeof fetcher?.fetch, 'function', `${SUBJECT.fetcher}() returned no fetch()`)
  return fetcher
}

/** A stub transport: `routes` maps a URL to a response script; every call is recorded. */
export function stubTransport(routes) {
  const calls = []
  return {
    calls,
    async get(url, addresses, signal) {
      calls.push({ url: String(url), addresses: [...(addresses ?? [])], signal })
      const route = routes(String(url), calls.length, signal)
      return typeof route === 'function' ? route(signal) : route
    },
  }
}
/** A response whose body is `text`, in one chunk. */
export function served(text, { status = 200, headers = {} } = {}) {
  return { status, headers: { 'content-type': STUB.jsonType, ...headers }, body: (async function* chunks() { yield Buffer.from(text) })() }
}
/** A response whose body never ends until `signal` aborts (slower than the time bound). */
export function stalled(signal) {
  return {
    status: 200,
    headers: { 'content-type': STUB.jsonType },
    body: (async function* chunks() {
      yield Buffer.from('{')
      await new Promise((resolve) => signal?.addEventListener('abort', resolve, { once: true }))
    })(),
  }
}

/** A port nobody holds right now (bound and released). */
export async function freePort() {
  const probe = http.createServer()
  const port = await listen(probe)
  await closeServer(probe)
  return port
}

/** A plain listener on `port` answering STUB.holderMarker (another process holding the port). */
export async function holdPort(t, port) {
  const holder = http.createServer((req, res) => res.end(STUB.holderMarker))
  await listen(holder, port)
  let open = true
  const release = async () => { if (open) { open = false; await closeServer(holder) } }
  t.after(release)
  return { release }
}

/** What answers `GET /authorize` on `port` now: the body, or `null` when nothing listens. */
export function probe(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: FIXTURE.loopback, port, path: PATHS.authorize, headers: { host: `${FIXTURE.loopback}:${port}` } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', () => resolve(null))
  })
}

/**
 * The approval listener over a world's handler, with fake timers (the relayed `timers?`, assumed
 * Node-shaped: setTimeout / clearTimeout / setInterval / clearInterval) and every status reported
 * through `onStatus` kept. Closed by `t`'s cleanup.
 */
export function approvalListener(t, w, port) {
  const timers = fakeTimers()
  const statuses = []
  const logger = fakeLogger()
  const l = w.mod[SUBJECT.listener]({ handler: w.handler, host: FIXTURE.loopback, port, timers, logger, onStatus: (s) => statuses.push(s) })
  for (const member of SUBJECT.listenerMembers) assert.equal(typeof l?.[member], 'function', `the approval listener has no ${member}()`)
  t.after(() => Promise.resolve(l.close()).catch(() => {}))
  return { l, timers, statuses, logger, start: () => Promise.resolve().then(() => l.start()).catch((error) => error) }
}

/** Polls `predicate` until it holds or `ms` pass. */
export async function waitFor(predicate, ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, FIXTURE.lockPollMs))
  }
  return predicate()
}

/**
 * Holds a cross-process lock for the rows that bind the frozen default port: both SDK files run at
 * once (test/run-v3.mjs), and only one of them may hold the port.
 */
export async function lockDefaultPort(t) {
  const lock = path.join(os.tmpdir(), FIXTURE.defaultPortLock)
  for (;;) {
    try { fs.closeSync(fs.openSync(lock, 'wx')); break } catch (error) {
      if (error.code !== 'EEXIST') throw error
      await new Promise((resolve) => setTimeout(resolve, FIXTURE.lockPollMs))
    }
  }
  t.after(() => fs.rmSync(lock, { force: true }))
}

export { LIFETIME }
