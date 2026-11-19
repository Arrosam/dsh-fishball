/**
 * C-HTTP black-box cases (v3-tasks.md row C-HTTP, wave W2): the MCP route on DSH's listener, its
 * check order, listener exposure, Host and Origin, the bearer 401s, body and in-flight limits,
 * per-principal listen streams, and the one `RequestGate` implementation (K1b).
 *
 * Cases (docs/test-design/v3/): PLAT-UC-01, PLAT-EP-01, PLAT-BVA-02 (11-platform.md); REM-UC-03,
 * REM-EP-02, REM-EP-03 (09-standalone-remote.md); EVT-EP-04 rows 3 and 4 (04-events-interception.md;
 * rows 1, 2, 5, 6 are C-MAILBOX's); AUTH-EP-02 rows 1, 2, 11–14 (01-auth-pairing.md; the other rows
 * are C-OAUTH's verifier); and the K1b rows test/v3/contract/k1-mcp-schema/k1b-cases.mjs left `todo` for C-HTTP:
 * K1b-UC-01, K1b-DT-05, K1b-BVA-02, K1b-ST-02. Written from the requirements, the design, the K1
 * freeze (`mcp-schema/index.d.ts` and its constants) only; `src/mcp/http/` was not read.
 *
 * Techniques, and only these, in this order: Use Case (each test names its flow: main step, A<n>,
 * E<n>, post), Equivalence Partitioning, Boundary Value Analysis, Decision Table (one test per
 * rule) and State Transition (one test per transition row).
 *
 * Level: integration (real HTTP to the route, the installed SDK's own MCP client) for the PLAT,
 * REM, EVT and AUTH cases; unit (the gate alone, fake clock) for the K1b rows, as k1b-cases.mjs
 * states them. Flows that need a later task are `todo`, naming that task (constants.mjs LATER).
 *
 * Common refusal oracle (README): the exact status and body, nothing processed (no JSON-RPC result,
 * and a refusal before the bearer step never looked a token up) and nothing leaked (a 403/405 has
 * no body, a 401 no JSON-RPC body).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import {
  APPROVAL_LISTENER, BEARER_CHALLENGE, BODY_CAP_BYTES, DIAGNOSTIC_LEVELS, ENDPOINT_LIMITS, FIXTURE, GATE_SURFACE, HEADER, HOSTS, HTTP_METHOD,
  HTTP_REFUSAL, HTTP_STATUS, LATER, OAUTH_ERROR, OAUTH_ERROR_STATUS, PATHS, PROTOCOL, RATE_LIMITS, REQUEST_GATE, RESOURCE,
  REVOCATION, RPC, SSE, TIME_UNIT, WAIT, bearerChallenge,
} from './constants.mjs'
import { callerOf, gateUnit, httpWorld, sdkClient } from './subject.mjs'

const CASE = Object.freeze({
  platUc01: 'PLAT-UC-01', remUc03: 'REM-UC-03',
  platEp01: 'PLAT-EP-01', remEp02: 'REM-EP-02', remEp03: 'REM-EP-03', authEp02: 'AUTH-EP-02', evtEp04: 'EVT-EP-04',
  platBva02: 'PLAT-BVA-02',
  k1bUc01: 'K1b-UC-01', k1bDt05: 'K1b-DT-05', k1bBva02: 'K1b-BVA-02', k1bSt02: 'K1b-ST-02',
})
const LIMIT = ENDPOINT_LIMITS.bodyBytes
const MAX_IN_FLIGHT = ENDPOINT_LIMITS.inFlightPerPrincipal
const IN_FLIGHT_RETRY_AFTER = String(REQUEST_GATE.inFlightRetryAfterMs / TIME_UNIT.msPerSecond)
const MCP_METHODS = REQUEST_GATE.routes[GATE_SURFACE.mcp][PATHS.mcp]
const ALLOW_MCP = MCP_METHODS.join(REQUEST_GATE.allowSeparator)
/** A method of HTTP_METHOD the MCP route does not serve (PLAT-EP-01 row 1's GET). */
const WRONG_MCP_METHOD = Object.values(HTTP_METHOD).find((m) => !MCP_METHODS.includes(m))
const RIGHT_MCP_METHOD = MCP_METHODS[0]
const NO_HEADERS = Object.freeze({})

// ---------------------------------------------------------------------------------------------
// Oracles and steps shared by the cases
// ---------------------------------------------------------------------------------------------

/** The MCP wire names the installed SDK owns (`_meta` keys, the legacy revision, METHOD_NOT_FOUND). */
export async function wireOf(sdk) {
  const m = await sdkClient(sdk)
  return {
    legacyVersion: m.LATEST_PROTOCOL_VERSION,
    versionKey: m.PROTOCOL_VERSION_META_KEY,
    infoKey: m.CLIENT_INFO_META_KEY,
    capabilitiesKey: m.CLIENT_CAPABILITIES_META_KEY,
    methodNotFound: m.METHOD_NOT_FOUND,
  }
}

/** A 2026-07-28 request: the per-request `_meta` envelope claims `version` [spec: 2026-07-28 basic]. */
export const modernRpc = (wire, method, { version = PROTOCOL.version, params = {} } = {}) => ({
  jsonrpc: RPC.jsonrpc, id: FIXTURE.rpcId, method,
  params: { ...params, _meta: { [wire.versionKey]: version, [wire.infoKey]: FIXTURE.clientInfo, [wire.capabilitiesKey]: {} } },
})
/** A 2025-11-25 `initialize` (PLAT-UC-01 E1). */
const legacyInitialize = (wire) => ({
  jsonrpc: RPC.jsonrpc, id: FIXTURE.rpcId, method: RPC.initialize,
  params: { protocolVersion: wire.legacyVersion, capabilities: {}, clientInfo: FIXTURE.clientInfo },
})
/** `body` serialised and padded with JSON whitespace to exactly `bytes` bytes (still valid JSON). */
export function sized(body, bytes) {
  const text = JSON.stringify(body)
  assert.ok(bytes >= Buffer.byteLength(text), `harness: ${bytes} bytes cannot hold the request`)
  return text + FIXTURE.pad.repeat(bytes - Buffer.byteLength(text))
}

/**
 * A raw POST of `body` (an object, or text) to the MCP route, with the 2026-07-28 headers mirrored
 * from its `_meta` claim (none for a legacy request). `token` adds the bearer header; `headers` overrides or adds (`undefined` removes one).
 */
export function post(w, wire, body, { token, headers = {}, method = RIGHT_MCP_METHOD, query = '' } = {}) {
  const parsed = typeof body === 'string' ? JSON.parse(body) : body
  const claimed = parsed.params?._meta?.[wire.versionKey]
  const base = {
    [HEADER.contentType]: HEADER.json,
    [HEADER.accept]: [HEADER.json, HEADER.sse].join(HEADER.listSeparator),
    ...(claimed === undefined ? {} : { [HEADER.protocolVersion]: claimed, [HEADER.mcpMethod]: parsed.method }),
    ...(token === undefined ? {} : { [HEADER.authorization]: BEARER_CHALLENGE.scheme + HEADER.schemeSeparator + token }),
  }
  const all = Object.fromEntries(Object.entries({ ...base, ...headers }).filter(([, v]) => v !== undefined))
  return w.request({ method, path: PATHS.mcp + query, headers: all, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

/** The JSON-RPC message of a response: the JSON body, or the first `data:` message of an SSE stream. */
function messageOf(res) {
  const type = res.headers[HEADER.contentType] ?? ''
  if (type.startsWith(HEADER.sse)) {
    const data = res.text.split(SSE.lineBreak).filter((l) => l.startsWith(SSE.dataField)).map((l) => l.slice(SSE.dataField.length).trim())
    const message = data.map((d) => JSON.parse(d)).find((m) => m.id !== undefined)
    assert.ok(message, `no JSON-RPC response in the SSE stream: ${res.text}`)
    return message
  }
  return JSON.parse(res.text)
}
const isJsonRpc = (text) => { try { return JSON.parse(text)?.jsonrpc === RPC.jsonrpc } catch { return false } }

/** Dispatched: a `server/discover` result offering the one served revision. */
export function assertDiscovered(res) {
  assert.equal(res.status, HTTP_STATUS.ok, `not dispatched: ${res.status} ${res.text.slice(0, 200)}`)
  const message = messageOf(res)
  assert.equal(message.error, undefined, JSON.stringify(message.error))
  assert.ok(message.result.supportedVersions.includes(PROTOCOL.version), JSON.stringify(message.result))
}
/** A refusal with no body and no JSON-RPC processing (405, 403). */
function assertBare(res, status, headers = {}) {
  assert.equal(res.status, status, res.text.slice(0, 200))
  assert.equal(res.text, '', 'a 405 / 403 has no body (the user\'s decision, 2026-11-14)')
  for (const [name, value] of Object.entries(headers)) assert.equal(res.headers[name], value, name)
}
/** ENDPOINT_LIMITS' structured refusal: a JSON-RPC error with no `id` member (K1b-EP-13). */
const limitBody = (message) => ({ jsonrpc: RPC.jsonrpc, error: { code: ENDPOINT_LIMITS.jsonRpcCode, message } })
export function assertLimit(res, status, message) {
  assert.equal(res.status, status, res.text.slice(0, 200))
  assert.deepEqual(JSON.parse(res.text), limitBody(message))
}
const assertInsecure = (res) => {
  assert.equal(res.status, HTTP_STATUS.serviceUnavailable, res.text.slice(0, 200))
  assert.deepEqual(JSON.parse(res.text), { error: HTTP_REFUSAL.insecureListener })
}
/** A 401 (R-TOK-01): the challenge for `w`'s origin, `error` only when a value was presented, no JSON-RPC body. */
export function assert401(w, res, { presented = false } = {}) {
  assert.equal(res.status, HTTP_STATUS.unauthorized, res.text.slice(0, 200))
  const challenge = presented ? bearerChallenge(w.origin, { error: OAUTH_ERROR.invalidToken }) : bearerChallenge(w.origin)
  assert.equal(res.headers[HEADER.wwwAuthenticate], challenge)
  assert.ok(!isJsonRpc(res.text), 'a 401 carries no JSON-RPC body (no MCP processing)')
}
/** The verifier was never asked: the refusal came before the bearer step (R-REM-03, R-TOK-00). */
const assertNoLookup = (w) => assert.deepEqual(w.verifier.calls, [], 'a token was looked up before the refusal')
/** The log lines at a diagnostic level. */
const diagnostics = (logger) => logger.lines.filter((l) => DIAGNOSTIC_LEVELS.includes(l.level))

/** Waits until `count()` reaches `n`; fails after WAIT.eventMs. */
async function until(count, n, what) {
  const end = Date.now() + WAIT.eventMs
  while (count() < n) {
    assert.ok(Date.now() < end, `${what}: ${count()} of ${n} within ${WAIT.eventMs} ms`)
    await new Promise((resolve) => setTimeout(resolve, WAIT.pollMs))
  }
}
const quiet = () => new Promise((resolve) => setTimeout(resolve, WAIT.quietMs))
/** Whether `promise` settles within `ms`. */
const settlesWithin = (promise, ms) => Promise.race([promise.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), ms))])

/**
 * A principal with a full access token, connected with the SDK client and holding an open listen
 * stream on the events resource; `uris` are the `resources/updated` hints it received.
 */
export async function listener(w, id) {
  const { token, caller } = w.principal(id)
  const uris = []
  const client = await w.connect(token, PROTOCOL.version, { [RPC.resourceUpdated]: (n) => { uris.push(n.params.uri) } })
  const subscription = await client.listen({ resourceSubscriptions: [RESOURCE.events.uri] }, { timeout: WAIT.ackMs })
  return { token, caller, client, subscription, uris }
}

/** One gate request of `surface` to its first listed path; `host` is the `Host`. */
function gateRequest(surface, { method, path, host, origin } = {}) {
  const [listedPath, methods] = Object.entries(REQUEST_GATE.routes[surface])[0]
  return {
    method: method ?? methods[0],
    path: path ?? listedPath,
    headers: { [REQUEST_GATE.headers.host]: host, ...(origin === undefined ? {} : { [REQUEST_GATE.headers.origin]: origin }) },
  }
}
/** The `Host` a client sends to `surface` on loopback: DSH's port, or the approval listener's. */
const loopbackHost = (surface, name = FIXTURE.loopback) =>
  `${name}:${surface === GATE_SURFACE.approval ? APPROVAL_LISTENER.defaultPort : FIXTURE.dshPort}`
const APPROVAL_FACTS = Object.freeze({ approvalPort: () => APPROVAL_LISTENER.defaultPort })
const PASS = Object.freeze({ pass: true })
const forbidden = Object.freeze({ pass: false, status: HTTP_STATUS.forbidden, headers: NO_HEADERS, body: null })
const insecure = Object.freeze({ pass: false, status: HTTP_STATUS.serviceUnavailable, headers: NO_HEADERS, body: { error: HTTP_REFUSAL.insecureListener } })
const methodRefusal = (allowed) => ({ pass: false, status: HTTP_STATUS.methodNotAllowed, headers: { [REQUEST_GATE.headers.allow]: allowed.join(REQUEST_GATE.allowSeparator) }, body: null })
export const tooLarge = { pass: false, status: HTTP_STATUS.payloadTooLarge, headers: NO_HEADERS, body: limitBody(HTTP_REFUSAL.tooLarge) }
export const inFlightRefusal = { pass: false, status: HTTP_STATUS.tooManyRequests, headers: { [RATE_LIMITS.retryAfterHeader]: IN_FLIGHT_RETRY_AFTER }, body: limitBody(HTTP_REFUSAL.rateLimited) }
/** A refusal as plain data, so it compares by value (`done` is a function; a refusal has none). */
const plain = (result) => JSON.parse(JSON.stringify(result))
/** A gate `check` result compared by value. */
export const assertCheck = (result, expected) => assert.deepEqual(plain(result), plain(expected))

/** `admit` on `mcp` for `caller` with `bodyBytes`; returns the result. */
export const admit = (gate, caller, bodyBytes = 0) =>
  gate.admit({ ...gateRequest(GATE_SURFACE.mcp, { host: loopbackHost(GATE_SURFACE.mcp) }), bodyBytes }, GATE_SURFACE.mcp, caller)
/** `n` passing admits of `caller` that stay in flight; returns their `done`s. */
export function hold(gate, caller, n) {
  return Array.from({ length: n }, (_, i) => {
    const result = admit(gate, caller)
    assert.equal(result.pass, true, `harness: admit ${i + 1} of ${n} refused: ${JSON.stringify(plain(result))}`)
    return result.done
  })
}
export const unitCaller = (id, options) => callerOf(id, `${HOSTS.loopbackScheme}//${loopbackHost(GATE_SURFACE.mcp)}${PATHS.mcp}`, options)

/** One case on a fresh HTTP world built from `facts`. */
export function world(sdk, id, part, title, fn, facts) {
  caseTest(sdk, id, part, title, async (t) => fn(await httpWorld(t, sdk, facts), await wireOf(sdk)))
}
/** One case on a fresh gate built from `facts`. */
export function unit(sdk, id, part, title, fn, facts) {
  caseTest(sdk, id, part, title, async () => fn(await gateUnit(sdk, facts)))
}
const todo = (sdk, id, part, title, owner) => caseTest(sdk, id, part, title, null, owner)

// Listener facts of the exposure classes (REM-EP-02, design §3.1).
const LISTENER = Object.freeze({
  loopback: Object.freeze({}),
  remoteHttps: Object.freeze({ host: FIXTURE.lanHost, secure: true }),
  remoteHttp: Object.freeze({ host: FIXTURE.lanHost, secure: false }),
  tunnel: Object.freeze({ trustedHosts: Object.freeze([FIXTURE.tunnelHost]) }),
})
/** The `Host` a client of `w` sends under `name` (the world's socket is loopback either way). */
const hostAs = (w, name) => `${name}:${w.port}`

// ---------------------------------------------------------------------------------------------
// Use Cases
// ---------------------------------------------------------------------------------------------

function useCases(sdk) {
  // PLAT-UC-01 — A 2026-07-28 client uses the endpoint; an older one is told to upgrade.
  world(sdk, CASE.platUc01, 'main step 1', `server/discover with ${PROTOCOL.version}: the SDK client connects; the result offers ${PROTOCOL.version} and advertises ${PROTOCOL.clientCredentialsExtension} (R-OA-09)`, async (w) => {
    const client = await w.connect(w.principal(FIXTURE.idP).token, PROTOCOL.version)
    const discovered = client.getDiscoverResult()
    assert.ok(discovered?.supportedVersions.includes(PROTOCOL.version), JSON.stringify(discovered))
    const extension = discovered.capabilities?.extensions?.[PROTOCOL.clientCredentialsExtension]
    assert.ok(extension !== null && typeof extension === 'object', `no ${PROTOCOL.clientCredentialsExtension} in ${JSON.stringify(discovered.capabilities)}`)
  })
  todo(sdk, CASE.platUc01, 'main step 2', 'tools/list with a full AT lists the core tools', LATER.tools)
  todo(sdk, CASE.platUc01, 'main step 3', 'tools/call sessions_list returns its structured result', LATER.tools)
  world(sdk, CASE.platUc01, 'main step 4', `subscriptions/listen on ${RESOURCE.events.uri}: acknowledged with that filter`, async (w) => {
    const { subscription } = await listener(w, FIXTURE.idP)
    assert.deepEqual(subscription.honoredFilter.resourceSubscriptions, [RESOURCE.events.uri])
  })
  world(sdk, CASE.platUc01, 'E1', `initialize from a 2025-era client (this SDK's legacy revision): a JSON-RPC error naming ${PROTOCOL.version}`, async (w, wire) => {
    const message = messageOf(await post(w, wire, legacyInitialize(wire), { token: w.principal(FIXTURE.idP).token }))
    assert.equal(message.result, undefined, 'initialize was served')
    assert.ok(message.error?.message.includes(PROTOCOL.version), JSON.stringify(message.error))
  })
  world(sdk, CASE.platUc01, 'E2', `this SDK's legacy revision in the header and _meta: 400 UnsupportedProtocolVersion (${PROTOCOL.unsupportedVersionCode}) listing ${PROTOCOL.version}`, async (w, wire) => {
    const res = await post(w, wire, modernRpc(wire, RPC.discover, { version: wire.legacyVersion }), { token: w.principal(FIXTURE.idP).token })
    assert.equal(res.status, HTTP_STATUS.badRequest, res.text.slice(0, 200))
    const { error } = messageOf(res)
    assert.equal(error?.code, PROTOCOL.unsupportedVersionCode)
    assert.deepEqual(error.data?.supported, [PROTOCOL.version])
  })
  for (const method of [WRONG_MCP_METHOD, FIXTURE.deleteMethod]) {
    world(sdk, CASE.platUc01, `E3 ${method}`, `${method} on the endpoint: 405, no body, Allow: ${ALLOW_MCP}`, async (w) => {
      assertBare(await w.request({ method, headers: { [HEADER.authorization]: BEARER_CHALLENGE.scheme + HEADER.schemeSeparator + w.principal(FIXTURE.idP).token } }),
        HTTP_STATUS.methodNotAllowed, { [REQUEST_GATE.headers.allow]: ALLOW_MCP })
      assertNoLookup(w)
    })
  }
  world(sdk, CASE.platUc01, 'E4', `${RPC.subscribe}: method not found`, async (w, wire) => {
    const res = await post(w, wire, modernRpc(wire, RPC.subscribe, { params: { uri: RESOURCE.events.uri } }), { token: w.principal(FIXTURE.idP).token })
    assert.equal(messageOf(res).error?.code, wire.methodNotFound, res.text.slice(0, 200))
  })
  world(sdk, CASE.platUc01, 'E5 / post', `an ${HEADER.sessionId} header is ignored: two requests with different ids are both served statelessly; no response sets one`, async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    for (const sessionId of FIXTURE.sessionIds) {
      const res = await post(w, wire, modernRpc(wire, RPC.discover), { token, headers: { [HEADER.sessionId]: sessionId } })
      assertDiscovered(res)
      assert.equal(res.headers[HEADER.sessionId], undefined, 'the server created a protocol session')
    }
  })
  world(sdk, CASE.platUc01, 'E6', `${HEADER.mcpMethod} naming another method than the body: 400 HeaderMismatch (${PROTOCOL.headerMismatchCode})`, async (w, wire) => {
    const res = await post(w, wire, modernRpc(wire, RPC.discover), { token: w.principal(FIXTURE.idP).token, headers: { [HEADER.mcpMethod]: RPC.toolsList } })
    assert.equal(res.status, HTTP_STATUS.badRequest, res.text.slice(0, 200))
    assert.equal(messageOf(res).error?.code, PROTOCOL.headerMismatchCode)
  })

  // REM-UC-03 — The owner exposes the connector beyond loopback.
  world(sdk, CASE.remUc03, 'main', `DSH's listener on loopback: ${PATHS.mcp} answers on DSH's own port over plain http`, async (w, wire) => {
    assertDiscovered(await post(w, wire, modernRpc(wire, RPC.discover), { token: w.principal(FIXTURE.idP).token }))
  }, LISTENER.loopback)
  todo(sdk, CASE.remUc03, 'main (metadata, token endpoint)', 'the OAuth metadata and the token endpoint answer on DSH\'s own port', LATER.oauth)
  todo(sdk, CASE.remUc03, 'main (no setting)', 'no separate port or TLS setting exists for the MCP route, the metadata or the token endpoint', LATER.wire)
  world(sdk, CASE.remUc03, 'A1', 'DSH\'s listener exposed over https: the route is reachable under the bind address', async (w, wire) => {
    assertDiscovered(await post(w, wire, modernRpc(wire, RPC.discover), { token: w.principal(FIXTURE.idP).token, headers: { host: hostAs(w, FIXTURE.lanHost) } }))
  }, LISTENER.remoteHttps)
  world(sdk, CASE.remUc03, 'E1', `non-loopback plain http: 503 ${HTTP_REFUSAL.insecureListener} on every request, one diagnostic`, async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    for (const host of [hostAs(w, FIXTURE.lanHost), w.host]) assertInsecure(await post(w, wire, modernRpc(wire, RPC.discover), { token, headers: { host } }))
    assert.equal(diagnostics(w.logger).length, 1, JSON.stringify(w.logger.lines))
  }, LISTENER.remoteHttp)
  todo(sdk, CASE.remUc03, 'E1 (token endpoint)', 'the token endpoint is not served on an insecure listener either', LATER.oauth)
  world(sdk, CASE.remUc03, 'E2', 'a present Origin outside the allowlist: 403 on the MCP endpoint, before authentication', async (w, wire) => {
    assertBare(await post(w, wire, modernRpc(wire, RPC.discover), { token: w.principal(FIXTURE.idP).token, headers: { origin: FIXTURE.foreignOrigin } }), HTTP_STATUS.forbidden)
    assertNoLookup(w)
  })
  todo(sdk, CASE.remUc03, 'E2 (token endpoint)', 'a foreign Origin: 403 on the token endpoint', LATER.oauth)
  todo(sdk, CASE.remUc03, 'E2 (approval listener)', 'a foreign Origin: 403 on the approval listener', LATER.web)
  world(sdk, CASE.remUc03, 'E3', 'a Host that is no loopback name, bind address or --trusted-host: 403 before authentication', async (w, wire) => {
    assertBare(await post(w, wire, modernRpc(wire, RPC.discover), { token: w.principal(FIXTURE.idP).token, headers: { host: hostAs(w, FIXTURE.foreignHost) } }), HTTP_STATUS.forbidden)
    assertNoLookup(w)
  })
  todo(sdk, CASE.remUc03, 'E4', 'the approval listener: same exposure rule, its configured port, only the authorize page and the decision form', LATER.web)
  world(sdk, CASE.remUc03, 'E5', 'on loopback the route is plain http and this SDK\'s MCP client accepts it', async (w) => {
    const client = await w.connect(w.principal(FIXTURE.idP).token, PROTOCOL.version)
    assert.ok(client.getDiscoverResult()?.supportedVersions.includes(PROTOCOL.version))
  })
  todo(sdk, CASE.remUc03, 'E5 (metadata, token endpoint, page)', 'the SDK client accepts the plain-http loopback metadata, token endpoint and page', LATER.oauth)
  todo(sdk, CASE.remUc03, 'post', 'apart from the approval listener nothing listens on any other port', LATER.wire)
}

// ---------------------------------------------------------------------------------------------
// Equivalence Partitioning
// ---------------------------------------------------------------------------------------------

function equivalencePartitions(sdk) {
  // PLAT-EP-01 — Request check order: each row fails exactly one check, later ones would fail too.
  const ep01 = (row, title, fn) => world(sdk, CASE.platEp01, row, title, fn)
  ep01('1', `${WRONG_MCP_METHOD}, bad Origin, no token: 405`, async (w, wire) => {
    assertBare(await post(w, wire, modernRpc(wire, RPC.discover), { method: WRONG_MCP_METHOD, headers: { origin: FIXTURE.foreignOrigin } }),
      HTTP_STATUS.methodNotAllowed, { [REQUEST_GATE.headers.allow]: ALLOW_MCP })
  })
  ep01('2', `${RIGHT_MCP_METHOD}, bad Origin, no token: 403`, async (w, wire) => {
    assertBare(await post(w, wire, modernRpc(wire, RPC.discover), { headers: { origin: FIXTURE.foreignOrigin } }), HTTP_STATUS.forbidden)
    assertNoLookup(w)
  })
  ep01('3', `${RIGHT_MCP_METHOD}, good Origin (none), no token, oversize body: 401`, async (w, wire) => {
    assert401(w, await post(w, wire, sized(modernRpc(wire, RPC.discover), LIMIT + 1)))
  })
  ep01('4', `${RIGHT_MCP_METHOD}, valid AT, oversize body, wrong version: 413 structured`, async (w, wire) => {
    const body = sized(modernRpc(wire, RPC.discover, { version: wire.legacyVersion }), LIMIT + 1)
    assertLimit(await post(w, wire, body, { token: w.principal(FIXTURE.idP).token }), HTTP_STATUS.payloadTooLarge, HTTP_REFUSAL.tooLarge)
  })
  ep01('5', `${RIGHT_MCP_METHOD}, valid AT, ok body, wrong version: 400 ${PROTOCOL.unsupportedVersionCode}`, async (w, wire) => {
    const res = await post(w, wire, modernRpc(wire, RPC.discover, { version: wire.legacyVersion }), { token: w.principal(FIXTURE.idP).token })
    assert.equal(res.status, HTTP_STATUS.badRequest)
    assert.equal(messageOf(res).error?.code, PROTOCOL.unsupportedVersionCode)
  })
  ep01('6', 'all good: dispatched', async (w, wire) => {
    assertDiscovered(await post(w, wire, modernRpc(wire, RPC.discover), { token: w.principal(FIXTURE.idP).token }))
  })

  // REM-EP-02 — Listener exposure classes (MCP route; metadata and token endpoint: C-OAUTH).
  const ep02 = (row, title, facts, host, served) => world(sdk, CASE.remEp02, row, `${title}: ${served ? 'served' : 'refused, one diagnostic'}`, async (w, wire) => {
    const res = await post(w, wire, modernRpc(wire, RPC.discover), { token: w.principal(FIXTURE.idP).token, headers: { host: hostAs(w, host) } })
    if (served) assertDiscovered(res)
    else {
      assertInsecure(res)
      assert.equal(diagnostics(w.logger).length, 1, JSON.stringify(w.logger.lines))
    }
  }, facts)
  ep02('1', 'loopback http', LISTENER.loopback, FIXTURE.loopback, true)
  ep02('2', 'non-loopback https', LISTENER.remoteHttps, FIXTURE.lanHost, true)
  ep02('3', 'non-loopback http', LISTENER.remoteHttp, FIXTURE.lanHost, false)
  ep02('4', 'a tunnel to loopback (its name a --trusted-host)', LISTENER.tunnel, FIXTURE.tunnelHost, true)
  todo(sdk, CASE.remEp02, '1–4 (metadata, token endpoint)', 'the same four classes for the OAuth metadata and the token endpoint', LATER.oauth)

  // REM-EP-03 — Origin header classes (MCP endpoint; token endpoint: C-OAUTH).
  world(sdk, CASE.remEp03, '1', 'Origin absent: continues to the token check (no token: 401)', async (w, wire) => {
    assert401(w, await post(w, wire, modernRpc(wire, RPC.discover)))
    assert.equal(w.verifier.calls.length, 1, 'the token check did not run')
  })
  // The allowlist is empty and has no setting (design §3.1; DECIDED #60), so "in the allowlist"
  // has no member: even the origin of a trusted host does not continue.
  world(sdk, CASE.remEp03, '2', 'in the allowlist: the class is empty; the origin of a --trusted-host is refused 403 too', async (w, wire) => {
    const origin = `${HOSTS.remoteScheme}//${FIXTURE.tunnelHost}`
    assertBare(await post(w, wire, modernRpc(wire, RPC.discover), { token: w.principal(FIXTURE.idP).token, headers: { host: hostAs(w, FIXTURE.tunnelHost), origin } }), HTTP_STATUS.forbidden)
    assertNoLookup(w)
  }, LISTENER.tunnel)
  const refusedOrigin = (row, title, originOf) => world(sdk, CASE.remEp03, row, `${title}: 403 before any token check`, async (w, wire) => {
    assertBare(await post(w, wire, modernRpc(wire, RPC.discover), { token: w.principal(FIXTURE.idP).token, headers: { origin: originOf(w) } }), HTTP_STATUS.forbidden)
    assertNoLookup(w)
  })
  refusedOrigin('3', 'not in the allowlist', () => FIXTURE.foreignOrigin)
  refusedOrigin('4', `Origin ${FIXTURE.nullOrigin}`, () => FIXTURE.nullOrigin)
  refusedOrigin('5', 'DSH\'s own web origin, allowlist empty', (w) => w.origin)
  todo(sdk, CASE.remEp03, '1–5 (token endpoint)', 'the same five Origin classes at the token endpoint', LATER.oauth)

  // AUTH-EP-02 — Bearer value classes at the MCP endpoint (rows 1, 2, 11–14; the rest: C-OAUTH).
  const ep02a = (row, title, fn) => world(sdk, CASE.authEp02, row, title, fn)
  /** Rows 1, 2, 13, 14 answer byte-identically: one 401 as reference. */
  const reference = async (w, wire) => post(w, wire, modernRpc(wire, RPC.discover))
  const assertSame401 = async (w, wire, res) => {
    assert401(w, res)
    const ref = await reference(w, wire)
    assert.deepEqual([res.status, res.headers[HEADER.wwwAuthenticate], res.text], [ref.status, ref.headers[HEADER.wwwAuthenticate], ref.text], 'the 401s differ')
  }
  ep02a('1', `no ${HEADER.authorization} header: 401, challenge without error=`, async (w, wire) => {
    assert401(w, await reference(w, wire))
  })
  ep02a('2', `a non-Bearer scheme (${BEARER_CHALLENGE.basicScheme}): 401, the same bytes as row 1`, async (w, wire) => {
    const basic = BEARER_CHALLENGE.basicScheme + HEADER.schemeSeparator + FIXTURE.basicCredentials
    await assertSame401(w, wire, await post(w, wire, modernRpc(wire, RPC.discover), { headers: { [HEADER.authorization]: basic } }))
  })
  const queryToken = (token) => `?${BEARER_CHALLENGE.queryParameter}=${token}`
  const refusedQuery = (row, title, withHeader) => ep02a(row, `${title}: ${OAUTH_ERROR_STATUS[OAUTH_ERROR.invalidRequest]} ${OAUTH_ERROR.invalidRequest}, no lookup, no processing`, async (w, wire) => {
    const { token } = w.principal(FIXTURE.idP)
    const res = await post(w, wire, modernRpc(wire, RPC.discover), { token: withHeader ? token : undefined, query: queryToken(token) })
    assert.equal(res.status, OAUTH_ERROR_STATUS[OAUTH_ERROR.invalidRequest], res.text.slice(0, 200))
    assert.ok(!isJsonRpc(res.text), 'the request was processed')
    assertNoLookup(w)
  })
  refusedQuery('11', `a valid full AT in the header and ${BEARER_CHALLENGE.queryParameter} in the query`, true)
  refusedQuery('12', 'a valid AT in the query only', false)
  ep02a('13', `${RPC.discover} without a token: 401 (no unauthenticated discovery)`, async (w, wire) => {
    await assertSame401(w, wire, await post(w, wire, modernRpc(wire, RPC.discover)))
  })
  ep02a('14', `${RPC.listen} without a token: 401, no stream`, async (w, wire) => {
    const res = await post(w, wire, modernRpc(wire, RPC.listen, { params: { notifications: { resourceSubscriptions: [RESOURCE.events.uri] } } }))
    assert.notEqual(res.headers[HEADER.contentType]?.startsWith(HEADER.sse), true, 'a listen stream was opened')
    await assertSame401(w, wire, res)
  })

  // EVT-EP-04 — Per-principal isolation of streams and hints (rows 3, 4; rows 1, 2, 5, 6: C-MAILBOX).
  world(sdk, CASE.evtEp04, '3', `P (${FIXTURE.idP}) and Q (${FIXTURE.idQ}), ids differing only in case: each hint reaches its own pair's stream only`, async (w) => {
    const p = await listener(w, FIXTURE.idP)
    const q = await listener(w, FIXTURE.idQ)
    w.hints.resourceUpdated(p.caller.principalKey, RESOURCE.events.uri)
    await until(() => p.uris.length, 1, 'P\'s hint')
    await quiet()
    assert.deepEqual([p.uris, q.uris], [[RESOURCE.events.uri], []], 'row 1: one hint on P, nothing on Q')
    w.hints.resourceUpdated(q.caller.principalKey, RESOURCE.events.uri)
    await until(() => q.uris.length, 1, 'Q\'s hint')
    await quiet()
    assert.deepEqual([p.uris, q.uris], [[RESOURCE.events.uri], [RESOURCE.events.uri]], 'row 2: one hint on Q, nothing more on P')
  })
  world(sdk, CASE.evtEp04, '4', `P's entry is ${REVOCATION.disabled}: P's stream closes; Q's stays open and keeps receiving its own hints`, async (w) => {
    const p = await listener(w, FIXTURE.idP)
    const q = await listener(w, FIXTURE.idQ)
    w.tokens.revoke(p.caller.entryKey, REVOCATION.disabled, FIXTURE.generation + 1)
    assert.ok(await settlesWithin(p.subscription.closed, WAIT.eventMs), 'P\'s listen stream stayed open')
    assert.equal(await settlesWithin(q.subscription.closed, WAIT.quietMs), false, 'Q\'s listen stream closed')
    w.hints.resourceUpdated(q.caller.principalKey, RESOURCE.events.uri)
    await until(() => q.uris.length, 1, 'Q\'s hint after P\'s revocation')
    assert.deepEqual(p.uris, [])
  })
}

// ---------------------------------------------------------------------------------------------
// Boundary Value Analysis
// ---------------------------------------------------------------------------------------------

function boundaryValues(sdk) {
  // PLAT-BVA-02 — Endpoint body limits (integration; LIMIT = ENDPOINT_LIMITS.bodyBytes).
  const body = (row, title, bytes, processed) => world(sdk, CASE.platBva02, row, `${title} (${bytes} bytes): ${processed ? 'processed' : '413 structured'}`, async (w, wire) => {
    const res = await post(w, wire, sized(modernRpc(wire, RPC.discover), bytes), { token: w.principal(FIXTURE.idP).token })
    if (processed) assertDiscovered(res)
    else assertLimit(res, HTTP_STATUS.payloadTooLarge, HTTP_REFUSAL.tooLarge)
  })
  body('1', 'limit − 1', LIMIT - 1, true)
  body('2', 'limit', LIMIT, true)
  body('3', 'limit + 1', LIMIT + 1, false)
  // The in-flight requests are taken on the route's own gate, for the same entry, so the one HTTP
  // request over the limit is the route's: no core tool stays in flight on its own (C-TOOLS).
  world(sdk, CASE.platBva02, '4', `in-flight = max (${MAX_IN_FLIGHT}), one more: 429 structured with ${RATE_LIMITS.retryAfterHeader} ${IN_FLIGHT_RETRY_AFTER}; served again once one ends`, async (w, wire) => {
    const { token, caller } = w.principal(FIXTURE.idP)
    const dones = hold(w.gate, caller, MAX_IN_FLIGHT)
    const res = await post(w, wire, modernRpc(wire, RPC.discover), { token })
    assertLimit(res, HTTP_STATUS.tooManyRequests, HTTP_REFUSAL.rateLimited)
    assert.equal(res.headers[RATE_LIMITS.retryAfterHeader], IN_FLIGHT_RETRY_AFTER)
    dones[0]()
    assertDiscovered(await post(w, wire, modernRpc(wire, RPC.discover), { token }))
  })

  // K1b-BVA-02 — admit on mcp (unit): the PLAT-BVA-02 boundaries at the gate.
  const k1b = (row, title, fn) => unit(sdk, CASE.k1bBva02, row, title, fn)
  k1b('PLAT-BVA-02 1', 'bodyBytes = limit − 1: pass', ({ gate }) => assert.equal(admit(gate, unitCaller(FIXTURE.idP), LIMIT - 1).pass, true))
  k1b('PLAT-BVA-02 2', 'bodyBytes = 8 MiB: pass', ({ gate }) => assert.equal(admit(gate, unitCaller(FIXTURE.idP), BODY_CAP_BYTES).pass, true))
  k1b('PLAT-BVA-02 3', 'bodyBytes = 8 MiB + 1: 413, ENDPOINT_LIMITS\' body, no headers', ({ gate }) => assertCheck(admit(gate, unitCaller(FIXTURE.idP), BODY_CAP_BYTES + 1), tooLarge))
  k1b('PLAT-BVA-02 4', `in-flight = max passes; one more: 429 with ${RATE_LIMITS.retryAfterHeader} ${IN_FLIGHT_RETRY_AFTER}`, ({ gate }) => {
    const caller = unitCaller(FIXTURE.idP)
    hold(gate, caller, MAX_IN_FLIGHT)
    assertCheck(admit(gate, caller), inFlightRefusal)
  })
  k1b('entryKey', 'counted per entryKey: at max for P, another entry still passes', ({ gate }) => {
    hold(gate, unitCaller(FIXTURE.idP), MAX_IN_FLIGHT)
    assert.equal(admit(gate, unitCaller(FIXTURE.idQ)).pass, true)
  })
  k1b('pair-only', 'a pair-only caller (no principalKey) is counted on its entry too: max, then 429', ({ gate }) => {
    const caller = unitCaller(FIXTURE.idP, { pairOnly: true })
    hold(gate, caller, MAX_IN_FLIGHT)
    assertCheck(admit(gate, caller), inFlightRefusal)
  })
}

// ---------------------------------------------------------------------------------------------
// Decision Tables
// ---------------------------------------------------------------------------------------------

function decisionTables(sdk) {
  // K1b-DT-05 — check per surface (unit).
  const surfaces = Object.values(GATE_SURFACE)
  const rule = (row, title, fn, facts) => unit(sdk, CASE.k1bDt05, row, title, fn, { ...APPROVAL_FACTS, ...facts })
  rule('1', `a foreign Host (AUTH-EP-09 row 5) → 403 on ${surfaces.join(', ')}; a loopback Host passes`, ({ gate }) => {
    for (const s of surfaces) {
      assertCheck(gate.check(gateRequest(s, { host: loopbackHost(s, FIXTURE.foreignHost) }), s), forbidden)
      assertCheck(gate.check(gateRequest(s, { host: loopbackHost(s) }), s), PASS)
    }
  })
  rule('2', `a present Origin → 403 on ${GATE_SURFACE.mcp} and ${GATE_SURFACE.token}; on ${GATE_SURFACE.approval} its own origin passes, any other (${FIXTURE.nullOrigin} included) → 403`, ({ gate }) => {
    for (const s of [GATE_SURFACE.mcp, GATE_SURFACE.token]) {
      for (const origin of [FIXTURE.foreignOrigin, FIXTURE.nullOrigin, `${HOSTS.loopbackScheme}//${loopbackHost(s)}`]) {
        assertCheck(gate.check(gateRequest(s, { host: loopbackHost(s), origin }), s), forbidden)
      }
    }
    const host = loopbackHost(GATE_SURFACE.approval)
    assertCheck(gate.check(gateRequest(GATE_SURFACE.approval, { host, origin: `${HOSTS.loopbackScheme}//${host}` }), GATE_SURFACE.approval), PASS)
    for (const origin of [FIXTURE.foreignOrigin, FIXTURE.nullOrigin, `${HOSTS.loopbackScheme}//${loopbackHost(GATE_SURFACE.mcp)}`]) {
      assertCheck(gate.check(gateRequest(GATE_SURFACE.approval, { host, origin }), GATE_SURFACE.approval), forbidden)
    }
  })
  rule('3', `a non-loopback http listener → 503 {error: ${HTTP_REFUSAL.insecureListener}} on every surface`, ({ gate }) => {
    for (const s of surfaces) assertCheck(gate.check(gateRequest(s, { host: loopbackHost(s, FIXTURE.lanHost) }), s), insecure)
  }, LISTENER.remoteHttp)
  rule('3 (https)', 'the same non-loopback listener over https passes every surface', ({ gate }) => {
    for (const s of surfaces) assertCheck(gate.check(gateRequest(s, { host: loopbackHost(s, FIXTURE.lanHost) }), s), PASS)
  }, LISTENER.remoteHttps)
  rule('4', `an unlisted path skips only 405: any method passes, a foreign Host is still 403`, ({ gate }) => {
    for (const s of surfaces) {
      for (const method of [...Object.values(HTTP_METHOD), FIXTURE.deleteMethod]) {
        assertCheck(gate.check(gateRequest(s, { method, path: FIXTURE.unlistedPath, host: loopbackHost(s) }), s), PASS)
      }
      assertCheck(gate.check(gateRequest(s, { path: FIXTURE.unlistedPath, host: loopbackHost(s, FIXTURE.foreignHost) }), s), forbidden)
    }
  })
  rule('4 (insecure)', 'an unlisted path on an insecure listener is still 503', ({ gate }) => {
    for (const s of surfaces) assertCheck(gate.check(gateRequest(s, { path: FIXTURE.unlistedPath, host: loopbackHost(s, FIXTURE.lanHost) }), s), insecure)
  }, LISTENER.remoteHttp)
}

// ---------------------------------------------------------------------------------------------
// State Transitions and the K1b use case
// ---------------------------------------------------------------------------------------------

function stateTransitions(sdk) {
  // K1b-UC-01 — one MCP request through check → bearer → admit (unit; the bearer step is the
  // verifier's, so here a missing token stands for its 401). Rows of PLAT-EP-01.
  const BEARER_401 = Object.freeze({ pass: false, status: HTTP_STATUS.unauthorized })
  /** The first refusal of check → bearer → admit, or PASS. */
  function pipeline(gate, { method = RIGHT_MCP_METHOD, origin, token, bodyBytes }) {
    const req = gateRequest(GATE_SURFACE.mcp, { method, host: loopbackHost(GATE_SURFACE.mcp), origin })
    const checked = gate.check(req, GATE_SURFACE.mcp)
    if (!checked.pass) return checked
    if (!token) return BEARER_401
    const admitted = gate.admit({ ...req, bodyBytes }, GATE_SURFACE.mcp, unitCaller(FIXTURE.idP))
    return admitted.pass ? PASS : admitted
  }
  const rows = [
    ['1', `${WRONG_MCP_METHOD}, bad Origin, no token, oversize → 405`, { method: WRONG_MCP_METHOD, origin: FIXTURE.foreignOrigin, bodyBytes: LIMIT + 1 }, methodRefusal(MCP_METHODS)],
    ['2', `${RIGHT_MCP_METHOD}, bad Origin, no token, oversize → 403`, { origin: FIXTURE.foreignOrigin, bodyBytes: LIMIT + 1 }, forbidden],
    ['3', 'no Origin, no token, oversize → 401 (beats 413)', { bodyBytes: LIMIT + 1 }, BEARER_401],
    ['4', 'valid AT, oversize, wrong version → 413', { token: true, bodyBytes: LIMIT + 1 }, tooLarge],
    ['5', 'valid AT, ok body, wrong version → the gate passes (400 -32022 is the version check\'s)', { token: true, bodyBytes: LIMIT }, PASS],
    ['6', 'all good → the gate passes (dispatched)', { token: true, bodyBytes: 0 }, PASS],
  ]
  for (const [row, title, req, expected] of rows) {
    unit(sdk, CASE.k1bUc01, `PLAT-EP-01 ${row}`, title, ({ gate }) => assertCheck(pipeline(gate, req), expected))
  }
  unit(sdk, CASE.k1bUc01, 'PLAT-UC-01 E3', `${WRONG_MCP_METHOD} and ${FIXTURE.deleteMethod} on the MCP endpoint: 405, no body, Allow: ${ALLOW_MCP}`, ({ gate }) => {
    for (const method of [WRONG_MCP_METHOD, FIXTURE.deleteMethod]) {
      assertCheck(gate.check(gateRequest(GATE_SURFACE.mcp, { method, host: loopbackHost(GATE_SURFACE.mcp) }), GATE_SURFACE.mcp), methodRefusal(MCP_METHODS))
    }
  })

  // K1b-ST-02 — an in-flight slot (states: free → taken → free).
  unit(sdk, CASE.k1bSt02, '1', 'free → taken by a pass → freed by done(): at max one more is 429; after one done() it passes', ({ gate }) => {
    const caller = unitCaller(FIXTURE.idP)
    const dones = hold(gate, caller, MAX_IN_FLIGHT)
    assertCheck(admit(gate, caller), inFlightRefusal)
    dones[0]()
    assert.equal(admit(gate, caller).pass, true)
  })
  // Integration: the listen request is admitted on the route's gate like any request, then frees
  // its slot as soon as the stream is open (the user's decision, 2026-11-14).
  world(sdk, CASE.k1bSt02, '2', 'a listen stream frees its slot once open: with max − 1 held and the stream open, one more request still passes', async (w) => {
    const { caller } = await listener(w, FIXTURE.idP)
    hold(w.gate, caller, MAX_IN_FLIGHT - 1)
    assert.equal(admit(w.gate, caller).pass, true, 'the open listen stream still holds an in-flight slot')
    assertCheck(admit(w.gate, caller), inFlightRefusal)
  })
  unit(sdk, CASE.k1bSt02, '3', 'a refusal takes no slot: a 413 and a 429 leave the count unchanged', ({ gate }) => {
    const caller = unitCaller(FIXTURE.idP)
    const dones = hold(gate, caller, MAX_IN_FLIGHT - 1)
    assertCheck(admit(gate, caller, LIMIT + 1), tooLarge)
    const last = admit(gate, caller)
    assert.equal(last.pass, true, 'the 413 took a slot')
    assertCheck(admit(gate, caller), inFlightRefusal)
    dones[0]()
    assert.equal(admit(gate, caller).pass, true, 'the 429 took a slot')
  })
}

/** Every C-HTTP case for `sdk`, Use Cases first. */
export function registerCHttpCases(sdk) {
  useCases(sdk)
  equivalencePartitions(sdk)
  boundaryValues(sdk)
  decisionTables(sdk)
  stateTransitions(sdk)
}
