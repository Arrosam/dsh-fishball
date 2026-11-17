/**
 * The one place that binds the C-HTTP cases to C-HTTP's module (`packages/dsh-connector/src/mcp/http/`).
 *
 * K1b freezes `RequestGate` (check, admit), `GateListenerFacts` and C-HTTP's `HintSink`
 * (index.d.ts), but no factory. The module's entry exports these two; the dev session adapts this
 * file, never a case:
 *
 *   createRequestGate(facts, {originOf}) → RequestGate
 *     facts     K1b GateListenerFacts: {host, secure, trustedHosts, approvalPort(), now}
 *     originOf  C-OAUTH's `originOf(req, {secure})`, faked below (C-OAUTH is not merged yet)
 *   createMcpEndpoint({gate, verifier, failures, pairs, originOf, secure, readEvents, now, logger})
 *       → {handler, hints, presence, toolsChanged, closeEntry, close}
 *     gate        the gate above (C-WIRE builds the one gate; the route calls it)
 *     verifier    K1 BearerVerifier (C-OAUTH's), faked below
 *     failures    K1a FailureLimiter (C-OAUTH's; "C-HTTP against a fake FailureLimiter"), faked below
 *     pairs       K1 PairStore's `pairOf` and `seen` (C-PAIR's), faked below: the endpoint derives a
 *                 pair-only caller's 403 reason from it
 *     secure      the same boolean as the gate's facts.secure (one listener)
 *     readEvents  the `resources/read dsh-agent://events` result (C-MAILBOX's), faked below
 *     logger      a cordis-style logger ({debug, info, warn, error}); the world records every line
 *   route.handler(req, res)   the raw Node handler DSH's `webServer.register({kind: 'exact', path:
 *                             PATHS.mcp, handler})` takes (design §3.1)
 *   route.hints               K1 HintSink: the mailbox's side calls `resourceUpdated(principalKey, uri)`
 *   route.closeEntry(entryKey) a revocation closes that entry's listen streams only (R-TOK-05); the
 *                             world wires the fake TokenRegistry's `onRevoked` to it, as C-WIRE does
 *   route.close()             awaited when the world goes away
 *
 * `populate` (the tools, C-TOOLS) is not passed: every tools row is `todo` (constants.mjs LATER).
 *
 * The world is real HTTP: a Node server on loopback that answers PATHS.mcp with the route (exact,
 * as DSH's listener) and 404 elsewhere. The listener facts the gate gets are the case's (a
 * "non-loopback https listener" is facts {host: <LAN address>, secure: true} over the same loopback
 * socket), which is what the gate reads: no request header ever says how the listener is bound.
 * MCP clients are the installed SDK's own `@modelcontextprotocol/client`, so "[SDK x]" is the
 * client of that SDK talking to the route. The route's `@deepseek-ai/*` imports bind to that SDK
 * (sdk.mjs); its MCP server packages resolve from the connector, as on a real install.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { INSTANCE, REPO } from '../../../support/constants.mjs'
import { SKILL_SDK } from '../../../private-skills/support/constants.mjs'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import {
  BEARER_CHALLENGE, FAILURE_LIMIT, FIXTURE, HEADER, HOSTS, OAUTH_ERROR, PATHS, REQUEST_GATE, RESOURCE, SCOPE, oauthUrls, SDK_CLIENT, SUBJECT, VERIFY, WAIT,
} from './constants.mjs'

/** C-HTTP's entry bound to `sdk`, with exactly one factory of each kind. */
async function factories(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(REPO, SUBJECT.entry)} does not exist (C-HTTP "Owns" packages/dsh-connector/src/mcp/http/)`)
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  const one = (pattern) => {
    const names = Object.keys(mod).filter((n) => typeof mod[n] === 'function' && pattern.test(n))
    assert.equal(names.length, 1, `the C-HTTP entry should export exactly one factory matching ${pattern}; found ${JSON.stringify(names)}`)
    return mod[names[0]]
  }
  return { gate: one(SUBJECT.gateFactory), route: one(SUBJECT.routeFactory) }
}

/** The installed SDK's MCP client module. */
export const sdkClient = (sdk) => import(pathToFileURL(path.join(SKILL_SDK.versionsDir, sdk, SDK_CLIENT.dir, SDK_CLIENT.entry)).href)

/** A fake clock; `advance` moves it. */
export function fakeClock(start = FIXTURE.t0) {
  let ms = start
  return { now: () => ms, advance: (by) => { ms += by } }
}

/** A logger that records every line by level. */
export function recordingLogger() {
  const lines = []
  const at = (level) => (...args) => { lines.push({ level, text: args.map(String).join(' ') }) }
  return { lines, debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') }
}

/**
 * C-OAUTH's BearerVerifier, faked over a table of issued access tokens. It records every call, so
 * a case can see that a refusal before the bearer step never looked a token up.
 */
export class FakeVerifier {
  calls = []
  #issued = new Map()
  issue(token, caller) { this.#issued.set(token, caller) }
  verify(authorization, audience, now) {
    this.calls.push({ authorization, audience, now })
    const [scheme, value] = (authorization ?? '').split(HEADER.schemeSeparator)
    if (scheme !== BEARER_CHALLENGE.scheme || !value) return { error: VERIFY.missing }
    return this.#issued.get(value) ?? { error: OAUTH_ERROR.invalidToken }
  }
}

/** K1a FailureLimiter, faked: never limited; records what it is told. */
export class FakeFailures {
  recorded = []
  checks = []
  check(key, now) { this.checks.push({ key, now }); return { limited: false } }
  recordFailure(key, now) { this.recorded.push({ key, now }) }
}
/**
 * K1a FailureLimiter, faked to K1 FAILURE_LIMIT's rule (X-SEC X-03 rows): limited once a key has
 * perKeyPerWindow recorded failures (an MCP bearer's key is the address alone) within windowMs.
 */
export class LimitingFailures extends FakeFailures {
  check(key, now) {
    this.checks.push({ key, now })
    const recent = this.recorded.filter((f) => f.key.remoteAddress === key.remoteAddress && now - f.now < FAILURE_LIMIT.windowMs)
    return recent.length >= FAILURE_LIMIT.perKeyPerWindow ? { limited: true, retryAfterMs: recent[0].now + FAILURE_LIMIT.windowMs - now } : { limited: false }
  }
}

/** Characters no bare `Host` authority holds: whitespace, path, query, fragment, userinfo, backslash. */
const NOT_AUTHORITY = /[\s/?#@\\]/

/**
 * C-OAUTH's `originOf(req, {secure})`, faked to its contract (C-OAUTH is not merged yet):
 * `<scheme>//<Host>` with the `Host` exactly as dialled, `https:` on a secure listener, else
 * `http:` for a loopback hostname and `https:` for any other. Undefined when `Host` is missing,
 * empty, repeated or not a bare authority. It never judges whether the host is allowed (the gate
 * does) and never reads a forwarded header.
 */
export function fakeOriginOf(req, { secure }) {
  const host = req.headers[REQUEST_GATE.headers.host]
  // A bare `host[:port]`: anything URL parsing would drop or reinterpret is no authority.
  if (typeof host !== 'string' || host === '' || NOT_AUTHORITY.test(host)) return undefined
  let hostname
  try {
    hostname = new URL(`${HOSTS.loopbackScheme}//${host}`).hostname
  } catch {
    return undefined
  }
  const scheme = secure || !HOSTS.loopbackNames.includes(hostname) ? HOSTS.remoteScheme : HOSTS.loopbackScheme
  return `${scheme}//${host}`
}

/**
 * C-PAIR's PairStore (`pairOf`, `seen`), faked: `bind` records the pair a full principal has, so a
 * pair-only caller of an unbound entry is `not-paired` and of an entry bound to another id is
 * `id-mismatch`. `seen` records what it is told.
 */
export class FakePairs {
  seenCalls = []
  #pairs = new Map()
  bind(entryKey, principalKey, id) {
    this.#pairs.set(entryKey, Object.freeze({ entryKey, principalKey, id, name: null, pairedAt: FIXTURE.t0, lastSeenAt: null }))
  }
  pairOf(entryKey) { return this.#pairs.get(entryKey) }
  seen(principalKey, now) { this.seenCalls.push({ principalKey, now }) }
}

/** C-MAILBOX's `resources/read dsh-agent://events` result, faked: an empty event list. */
const readEvents = async () => ({
  contents: [{ uri: RESOURCE.events.uri, mimeType: RESOURCE.events.mimeType, text: JSON.stringify([]) }],
})

/** C-TOKENS' `onRevoked`, faked: `revoke` fires it as the registry would (R-TOK-05). */
export class FakeTokens {
  #listeners = new Set()
  onRevoked(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }
  revoke(entryKey, kind, generation) { for (const l of [...this.#listeners]) l(entryKey, kind, generation) }
}

/**
 * A K1 `Caller` of fishball id `id` on its own entry: full power with a principal key, or
 * pair-only (no binding, scope `agent:pair`).
 */
export const callerOf = (id, audience, { pairOnly = false } = {}) => Object.freeze({
  entryKey: FIXTURE.entry(id),
  clientId: id,
  ...(pairOnly ? {} : { principalKey: FIXTURE.principal(id) }),
  scope: pairOnly ? SCOPE.pair : SCOPE.full,
  audience,
  generation: FIXTURE.generation,
})

/** One raw HTTP exchange with the world's listener; `headers.host` may name any Host. */
function exchange(port, { method, path: target, headers, body }) {
  return new Promise((resolve, reject) => {
    let answered = false
    const sized = body === undefined ? headers : { ...headers, [HEADER.contentLength]: Buffer.byteLength(body) }
    const req = http.request({ host: FIXTURE.loopback, port, method, path: target, headers: sized }, (res) => {
      answered = true
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    // A route may answer (401, 413) before it reads an oversized body and then drop the socket:
    // a write error after the answer is not the case's concern.
    req.on('error', (error) => { if (!answered) reject(error) })
    req.end(body)
  })
}

/**
 * The gate of `make` over `facts` (defaults: DSH's listener on loopback http, no trusted hosts)
 * and the fake `originOf`. Returns {gate, clock, logger, facts}.
 */
function gateOf(make, facts) {
  const clock = fakeClock()
  const logger = recordingLogger()
  const listenerFacts = {
    host: FIXTURE.loopback, secure: false, trustedHosts: [], approvalPort: () => 0, now: clock.now, ...facts,
  }
  // `logger` beside the required `originOf`: the module surface names none for the gate, but the one
  // diagnostic of an insecure listener (REM-UC-03 E1) may be the gate's or the endpoint's to write.
  const gate = make.gate(listenerFacts, { originOf: fakeOriginOf, logger })
  for (const m of SUBJECT.gateMethods) assert.equal(typeof gate?.[m], 'function', `the gate has no ${m}() (K1b RequestGate)`)
  return { gate, clock, logger, facts: listenerFacts }
}

/**
 * A C-HTTP world on loopback for `t`: the gate built from `facts` (defaults: DSH's listener on
 * loopback http, no trusted hosts), the route mounted on PATHS.mcp, and the fakes.
 * Returns {port, host, gate, verifier, failures, tokens, pairs, hints, logger, clock, principal, request, connect}.
 */
export async function httpWorld(t, sdk, facts = {}, { failures = new FakeFailures() } = {}) {
  const make = await factories(sdk)
  const { gate, clock, logger, facts: listenerFacts } = gateOf(make, facts)
  const verifier = new FakeVerifier()
  const tokens = new FakeTokens()
  const pairs = new FakePairs()
  const route = await make.route({
    gate, verifier, failures, pairs, originOf: fakeOriginOf, secure: listenerFacts.secure, readEvents, logger, now: clock.now,
  })
  assert.equal(typeof route?.handler, 'function', 'the route has no handler(req, res)')
  assert.equal(typeof route?.hints?.resourceUpdated, 'function', 'the route has no hints.resourceUpdated (K1 HintSink)')
  assert.equal(typeof route?.closeEntry, 'function', 'the route has no closeEntry(entryKey)')
  // C-WIRE's wiring: a token entry's revocation closes that entry's listen streams (R-TOK-05).
  const unsubscribe = tokens.onRevoked((entryKey) => route.closeEntry(entryKey))

  const server = http.createServer((req, res) => {
    // Exact match on the pathname, as DSH's listener routes (S1 F3).
    if (new URL(req.url, FIXTURE.urlBase).pathname === PATHS.mcp) return route.handler(req, res)
    res.statusCode = 404
    res.end()
  })
  await new Promise((resolve) => server.listen(0, FIXTURE.loopback, resolve))
  const { port } = server.address()
  const clients = []
  t.after(async () => {
    await Promise.allSettled(clients.map((c) => c.close()))
    unsubscribe()
    await route.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  const world = {
    port, gate, verifier, failures, tokens, pairs, hints: route.hints, logger, clock, facts: listenerFacts,
    /** The Host of a request to this listener under its loopback name, and its origin. */
    host: `${FIXTURE.loopback}:${port}`,
    get origin() { return `${HOSTS.loopbackScheme}//${world.host}` },
    /**
     * An access token of a principal with id `id` and full power (or pair-only: no principalKey),
     * known to the fake verifier. Returns {token, caller}.
     */
    principal(id, { pairOnly = false } = {}) {
      const caller = callerOf(id, oauthUrls(world.origin).resource, { pairOnly })
      const token = FIXTURE.accessToken(id)
      verifier.issue(token, caller)
      // A full principal is its entry's pair under its own id; a pair-only one has no pair yet.
      if (!pairOnly) pairs.bind(caller.entryKey, caller.principalKey, id)
      return { token, caller }
    },
    /** One raw request; `host` defaults to the loopback Host. */
    request: ({ method, path: target = PATHS.mcp, headers = {}, body }) =>
      exchange(port, { method, path: target, headers: { host: world.host, ...headers }, body }),
    /**
     * An SDK client of `sdk`, pinned to `version`, authenticated with `token`, connected
     * (its `server/discover` probe done), with `handlers` ({notification method: handler}) set
     * before it connects. Closed with the world.
     */
    async connect(token, version, handlers = {}) {
      const { Client, StreamableHTTPClientTransport } = await sdkClient(sdk)
      const client = new Client(FIXTURE.clientInfo, { capabilities: {}, versionNegotiation: { mode: { pin: version } } })
      for (const [method, handler] of Object.entries(handlers)) client.setNotificationHandler(method, handler)
      const transport = new StreamableHTTPClientTransport(new URL(oauthUrls(world.origin).resource), {
        authProvider: { token: async () => token },
      })
      await client.connect(transport, { timeout: WAIT.ackMs })
      clients.push(client)
      return client
    },
  }
  return world
}

/** A bare gate from `facts`, for the unit rows (K1b). Returns {gate, clock, logger}. */
export async function gateUnit(sdk, facts = {}) {
  const { gate, clock, logger } = gateOf(await factories(sdk), facts)
  return { gate, clock, logger }
}

