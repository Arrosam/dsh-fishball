/**
 * The one place that binds the C-OAUTH cases to C-OAUTH's module (`packages/connector/src/mcp/oauth/`).
 *
 * K1 freezes what the module answers (`OAuthTokenStore`, `FailureLimiter`, `BearerVerifier`,
 * `GrantRegistry`, index.d.ts) but no factory. This seam binds the module's own, and only here, so
 * a case never changes with the names. Each is the one function export whose name matches
 * BINDING.roles (SUBJECT.factories plus the revocation follower); where several match, the one
 * BINDING.prefer names:
 *
 *   openOAuthTokenStore(ctx, {defineDomain, domainTable}) → Promise<{store, close}>: the durable
 *       store over DSH's `storageDomain` (`putRefresh` persists, K1a), as C-PAIR's pair store.
 *       The module also exports `createOAuthTokenStore(tables)` over bare KvTables; the world
 *       restarts over real files, so it takes `open…`.
 *   followRevocations(tokenRegistry, store, {logger}) → unsubscribe: C-TOKENS' revocations applied
 *       to the store, as C-WIRE mounts it once per store.
 *   createFailureLimiter() → FailureLimiter (in memory; the clock is each call's `now`).
 *   createBearerVerifier({tokenStore, tokenRegistry, pairStore}) → BearerVerifier
 *       tokenRegistry: C-TOKENS' TokenRegistry (faked); pairStore: C-PAIR's PairStore (faked).
 *   createTokenEndpoint({gate, failureLimiter, tokenStore, tokenRegistry, pairStore, secure,
 *       approvalOrigin, now, logger}) → {register, routes, …}: `routes` are the exact DSH WebRoutes
 *       for `webServer.register` (design §3.1), serving the token endpoint and both metadata
 *       documents (REQUEST_GATE.routes.token); `register` is K1b's GrantRegistry. `gate` is C-HTTP's
 *       RequestGate (faked); `secure`, `now` and the approval port come from the GateListenerFacts.
 *
 * The world serves `routes` on 127.0.0.1 as DSH's webServer does (exact path, else 404) with a real Node HTTP server, so a request carries any
 * `Host` the case names and the stock `ClientCredentialsProvider` can run against it. The store
 * runs in a real DSH storage domain of the SDK under test in a throwaway root, so a restart is a
 * close and reopen of the same files.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { INSTANCE } from '../../support/constants.mjs'
import { SKILL_SDK } from '../../private-skills/support/constants.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { MCP } from '../k1/constants.mjs'
import { resolveRuntimePackages, storageContext } from '../c-pair/subject.mjs'
import { APPROVAL_LISTENER, FIXTURE, HOSTS, SUBJECT } from './constants.mjs'
import { FakeGate, FakePairStore, FakeTokenRegistry, fakeClock, recordingLogger } from './fakes.mjs'

const LISTEN_HOST = HOSTS.loopbackNames[1]

/**
 * The export each role binds to. The store pattern matches both `createOAuthTokenStore` (bare
 * tables) and `openOAuthTokenStore` (a storage domain on a ctx); the world needs the durable one.
 */
const BINDING = Object.freeze({
  roles: Object.freeze({ ...SUBJECT.factories, revocations: /^follow\w*Revocations$/i }),
  prefer: Object.freeze({ store: /^open/i }),
})
/** What DSH's webServer answers for a path no route serves (dsh-host-webserver, no fallback). */
const NO_ROUTE = Object.freeze({ status: 404, urlBase: 'http://x' })

/** C-OAUTH's four factories bound to `sdk` (its `@deepseek-ai/*` imports resolve to that SDK). */
async function factories(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (C-OAUTH "Owns" packages/connector/src/mcp/oauth/)`)
  resolveRuntimePackages()
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  return Object.fromEntries(Object.entries(BINDING.roles).map(([role, pattern]) => {
    const matching = Object.keys(mod).filter((n) => typeof mod[n] === 'function' && pattern.test(n))
    const prefer = BINDING.prefer[role]
    const names = matching.length > 1 && prefer !== undefined ? matching.filter((n) => prefer.test(n)) : matching
    assert.equal(names.length, 1, `the C-OAUTH entry should export exactly one ${role} factory (${pattern}${prefer === undefined ? '' : `, preferring ${prefer}`}); found ${JSON.stringify(matching)}`)
    return [role, mod[names[0]]]
  }))
}

/** The stock MCP client of `sdk` (`@modelcontextprotocol/client` 2.2.0 on both). */
export function stockClient(sdk) {
  return import(pathToFileURL(path.join(SKILL_SDK.versionsDir, sdk, SKILL_SDK.nodeModules, MCP.client, MCP.clientEntry)).href)
}

/** A throwaway root under the OS temp dir, removed by `t`'s cleanup after `beforeRemove`. */
async function tempRoot(t, beforeRemove) {
  const root = await mkdtemp(path.join(os.tmpdir(), FIXTURE.tempPrefix))
  t.after(async () => {
    await beforeRemove()
    // Guard the one recursive delete: only the directory this helper created under the OS temp dir.
    assert.ok(path.dirname(root) === os.tmpdir() && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    await rm(root, { recursive: true, force: true })
  })
  return root
}

/**
 * A token store over a fresh DSH storage root: `{store, reopen()}`. `reopen()` closes it and opens
 * the same files again (a connector restart); `store` then names the new one.
 */
export async function storeWorld(t, sdk) {
  const made = await factories(sdk)
  let open
  const stop = async () => {
    if (open === undefined) return
    const { ctx, close } = open
    open = undefined
    await close?.()
    await ctx.fiber.dispose()
  }
  const root = await tempRoot(t, stop)
  const start = async () => {
    const { ctx, helpers } = await storageContext(sdk, root)
    const opened = await made.store(ctx, helpers)
    const store = opened?.store ?? opened
    for (const member of ['putAccess', 'getAccess', 'putCode', 'takeCode', 'putRefresh', 'getRefresh', 'revokeChain', 'revokeEntry', 'chainsOf']) {
      assert.equal(typeof store?.[member], 'function', `the token store has no ${member}()`)
    }
    return { ctx, store, close: opened?.close?.bind(opened) ?? store.close?.bind(store) }
  }
  open = await start()
  return { made, get store() { return open.store }, async reopen() { await stop(); open = await start() } }
}

/** A fresh FailureLimiter of `sdk`. */
export async function limiterOf(sdk) {
  const limiter = (await factories(sdk)).limiter()
  for (const member of ['check', 'recordFailure']) assert.equal(typeof limiter?.[member], 'function', `the failure limiter has no ${member}()`)
  return limiter
}

/** One request to the world's server, with any `Host`; the body is read whole. */
function send(port, { method, path: target, host, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: LISTEN_HOST, port, method, path: target, setHost: false, headers: { host, ...headers } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = text === '' ? null : JSON.parse(text) } catch { json = null }
        resolve({ status: res.statusCode, headers: res.headers, text, body: json })
      })
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

/**
 * The full C-OAUTH world: the fakes, the real store, limiter, verifier and endpoint, served on
 * 127.0.0.1. `reopen()` is a connector restart: the store reopens over the same files and the
 * limiter, verifier and endpoint are built again (everything in memory is gone); the grants
 * registered with `register` are registered again, as C-WIRE would.
 * @param {import('node:test').TestContext} t
 */
export async function oauthWorld(t, sdk) {
  const clock = fakeClock()
  const logger = recordingLogger()
  const tokens = new FakeTokenRegistry()
  const pairs = new FakePairStore()
  const facts = Object.freeze({
    host: LISTEN_HOST, secure: false, trustedHosts: Object.freeze([FIXTURE.host.trusted]), approvalPort: () => APPROVAL_LISTENER.defaultPort, now: clock.now,
  })
  const gate = new FakeGate(facts)
  const stores = await storeWorld(t, sdk)
  const registered = []
  const remoteAddresses = []
  /**
   * The approval listener's origin for a request with checked `origin` (design §5.5a item 8, as
   * C-WIRE supplies it): a loopback host on the approval port, any other host unchanged.
   */
  const approvalOrigin = (req, origin) => {
    const { protocol, hostname } = new URL(origin)
    return HOSTS.loopbackNames.includes(hostname) ? `${protocol}//${hostname}:${facts.approvalPort()}` : origin
  }
  let parts
  let unfollow
  const build = () => {
    unfollow?.()
    const tokenStore = stores.store
    unfollow = stores.made.revocations(tokens, tokenStore, { logger })
    const limiter = stores.made.limiter()
    const verifier = stores.made.verifier({ tokenStore, tokenRegistry: tokens, pairStore: pairs })
    const endpoint = stores.made.endpoint({
      gate, failureLimiter: limiter, tokenStore, tokenRegistry: tokens, pairStore: pairs, secure: facts.secure, approvalOrigin, now: facts.now, logger,
    })
    assert.equal(typeof verifier?.verify, 'function', 'the bearer verifier has no verify()')
    assert.equal(typeof endpoint?.register, 'function', 'the token endpoint has no register()')
    assert.ok(Array.isArray(endpoint?.routes), 'the token endpoint has no routes')
    for (const grant of registered) endpoint.register(grant)
    parts = { limiter, verifier, endpoint }
  }
  build()
  t.after(() => unfollow?.())
  const server = http.createServer((req, res) => {
    remoteAddresses.push(req.socket.remoteAddress)
    const pathname = new URL(req.url ?? '/', NO_ROUTE.urlBase).pathname
    const route = parts.endpoint.routes.find((r) => r.path === pathname)
    if (route !== undefined) return route.handler(req, res)
    res.writeHead(NO_ROUTE.status)
    res.end()
  })
  await new Promise((resolve) => server.listen(0, LISTEN_HOST, resolve))
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) }))
  const port = server.address().port
  return {
    clock, logger, tokens, pairs, facts, gate, port, remoteAddresses,
    get store() { return stores.store },
    get limiter() { return parts.limiter },
    get verifier() { return parts.verifier },
    /** K1b GrantRegistry.register, kept for a restart. */
    register(grant) { parts.endpoint.register(grant); registered.push(grant) },
    /** The endpoint's own register, for the rows that expect it to throw. */
    get endpoint() { return parts.endpoint },
    /** The `Host` header a client dialling `host` sends (loopback names carry the port). */
    hostHeader: (host = LISTEN_HOST) => (HOSTS.loopbackNames.includes(host) ? `${host}:${port}` : host),
    /** The checked origin of a request under `host` (R-OA-01, HOSTS: loopback http, else https). */
    origin: (host = LISTEN_HOST) => (HOSTS.loopbackNames.includes(host) ? `${HOSTS.loopbackScheme}//${host}:${port}` : `${HOSTS.remoteScheme}//${host}`),
    /** The loopback URL of the server, for the stock client's real fetch. */
    url: (target) => `${HOSTS.loopbackScheme}//${LISTEN_HOST}:${port}${target}`,
    send: (req) => send(port, req),
    async reopen() { await stores.reopen(); build() },
  }
}
