/**
 * C-OAUTH black-box cases (v3-tasks.md row C-OAUTH, wave W2): the token store, the
 * FailureLimiter, the BearerVerifier, the token endpoint's dispatch and `client_credentials`, and
 * both metadata documents. Cases from docs/test-design/v3/01-auth-pairing.md that the row names:
 * AUTH-UC-07, AUTH-UC-08, AUTH-EP-01, AUTH-EP-02 (rows 3–10), AUTH-EP-05, AUTH-EP-07, AUTH-EP-09,
 * AUTH-BVA-01, AUTH-BVA-02, AUTH-BVA-06, AUTH-DT-01, AUTH-ST-02; the C-OAUTH parts of AUTH-ST-04
 * (the failure limit, the code store) and AUTH-ST-05 (the refresh store; `chainsOf` withdrawn by
 * K1d, R-OA-23); the K1b
 * rows that named C-OAUTH (K1b-UC-02, K1b-DT-06); and the C-PAIR rows that named C-OAUTH (AUTH-UC-02
 * main 2–3, A2, E1; AUTH-UC-04 E1; AUTH-EP-03 rows 1–6; AUTH-EP-06 row 9; AUTH-ST-01 row 14).
 * Requirements R-OA-01…09, R-OA-17, R-TOK-00…07, R-ID-02/03; design §5.5; K1 and K1b index.d.ts.
 *
 * Techniques, and only these, in this order: Use Case (each test names its flow), Equivalence
 * Partitioning and Boundary Value Analysis (one test per row), Decision Table (one per rule) and
 * State Transition (one per transition row).
 *
 * Level: integration over the real token store (a DSH storage domain of the SDK under test), the
 * real limiter, verifier and endpoint, served on 127.0.0.1 (subject.mjs), with fakes for C-HTTP's
 * RequestGate, C-OAUTH-WEB's grants, C-TOKENS' registry and C-PAIR's store (fakes.mjs) and an
 * injected clock. A flow that needs a later task is `todo` and names it (constants.mjs LATER).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import {
  BEARER_CHALLENGE, CALLER_FIELDS, CLIENT_AUTH, ERROR_BODY_FIELDS, FAILURE_LIMIT, FIXTURE, GATE_SURFACE, GRANT, GRANT_CONTEXT,
  GRANT_DISPATCH, HOSTS, HTTP_METHOD, HTTP_STATUS, HTTP_WIRE, ID_CLASSES, ID_LENGTHS, ID_MAX, LATER, LIFETIME, OAUTH_ERROR, OAUTH_ERROR_STATUS,
  OAUTH_METADATA, PATHS, RATE_LIMITS, REQUEST_GATE, SCOPE, TIME_UNIT, TOKEN_RESPONSE_HEADERS, VERIFY_ERROR, authorizationServerMetadata, oauthErrorBody,
  oauthUrls, protectedResourceMetadata, tokenResponse,
} from './constants.mjs'
import { FakeGrant } from './fakes.mjs'
import { limiterOf, oauthWorld, stockClient, storeWorld } from './subject.mjs'

const ID = FIXTURE.id
const FORM = HTTP_WIRE.form_
const CASE = Object.freeze({
  uc02: 'AUTH-UC-02', uc03: 'AUTH-UC-03', uc04: 'AUTH-UC-04', uc06: 'AUTH-UC-06', uc07: 'AUTH-UC-07', uc08: 'AUTH-UC-08',
  ep01: 'AUTH-EP-01', ep02: 'AUTH-EP-02', ep03: 'AUTH-EP-03', ep05: 'AUTH-EP-05', ep06: 'AUTH-EP-06', ep07: 'AUTH-EP-07', ep09: 'AUTH-EP-09',
  bva01: 'AUTH-BVA-01', bva02: 'AUTH-BVA-02', bva06: 'AUTH-BVA-06', dt01: 'AUTH-DT-01', k1bDt06: 'K1b-DT-06', k1bUc02: 'K1b-UC-02',
  st01: 'AUTH-ST-01', st02: 'AUTH-ST-02', st04: 'AUTH-ST-04', st05: 'AUTH-ST-05',
})

// ---------------------------------------------------------------------------------------------
// Requests, oracles and steps shared by the cases
// ---------------------------------------------------------------------------------------------

/** The fake clock: `offsetMs` after the reference instant. */
export const at = (offsetMs = 0) => FIXTURE.t0 + offsetMs
const seconds = (s) => s * TIME_UNIT.msPerSecond
const basic = (id, secret) => `${BEARER_CHALLENGE.basicScheme} ${Buffer.from(`${encodeURIComponent(id)}${HTTP_WIRE.basicSeparator}${encodeURIComponent(secret)}`).toString('base64')}`
const bearer = (value) => `${BEARER_CHALLENGE.scheme} ${value}`
/** `resource: ABSENT` leaves the parameter out (AUTH-EP-01 row 8). */
const ABSENT = null

/**
 * One token request (RFC 6749 §4.4.2) under `host`: `auth` is CLIENT_AUTH.basic (the Authorization
 * header), `.post` (id and secret in the form) or `.none` (the id only). `grant: ABSENT` omits
 * `grant_type`; `extra` appends parameters (a repeat included); `query` is appended to the path.
 */
export function tokenRequest(w, { host, auth = CLIENT_AUTH.basic, clientId, secret, grant = GRANT.clientCredentials, resource, scope, extra = [], query = '', method = HTTP_METHOD.post } = {}) {
  const form = new URLSearchParams()
  if (grant !== ABSENT) form.set(GRANT_DISPATCH.formField, grant)
  const headers = { [HTTP_WIRE.contentType]: HTTP_WIRE.form }
  if (auth === CLIENT_AUTH.basic) headers[HTTP_WIRE.authorization] = basic(clientId, secret)
  if (auth !== CLIENT_AUTH.basic && clientId !== undefined) form.set(FORM.clientId, clientId)
  if (auth === CLIENT_AUTH.post && secret !== undefined) form.set(FORM.clientSecret, secret)
  const target = resource === undefined ? oauthUrls(w.origin(host)).resource : resource
  if (target !== ABSENT) form.set(FORM.resource, target)
  if (scope !== undefined) form.set(FORM.scope, scope)
  for (const [k, v] of extra) form.append(k, v)
  return w.send({ method, path: PATHS.token + query, host: w.hostHeader(host), headers, body: method === HTTP_METHOD.post ? form.toString() : undefined })
}
/** A GET of one metadata document under `host`. */
const metadata = (w, path, host) => w.send({ method: HTTP_METHOD.get, path, host: w.hostHeader(host) })
const PRM_PATH = PATHS.protectedResourcePrefix + PATHS.mcp
const ASM_PATH = PATHS.authorizationServerPrefix + PATHS.issuer
/** Where the approval listener answers for a client under `host` (R-OA-11, S7b F4). */
const approvalOrigin = (w, host = FIXTURE.host.loopback) => (HOSTS.loopbackNames.includes(host) ? `${HOSTS.loopbackScheme}//${host}:${w.facts.approvalPort()}` : w.origin(host))
export const audience = (w, host) => oauthUrls(w.origin(host)).resource

/** A 200 token response: exactly K1's `tokenResponse` (standard fields only, no refresh token) with TOKEN_RESPONSE_HEADERS. */
export function assertToken(res, scope) {
  assert.equal(res.status, HTTP_STATUS.ok, `expected a token, got ${res.status} ${res.text}`)
  for (const [name, value] of Object.entries(TOKEN_RESPONSE_HEADERS)) assert.equal(res.headers[name], value, `header ${name}`)
  assert.equal(typeof res.body?.access_token, 'string')
  assert.ok(res.body.access_token.length > 0, 'an empty access token')
  assert.deepEqual(res.body, { ...tokenResponse({ accessToken: res.body.access_token, scope }) })
  return res.body.access_token
}
/** An OAuth error: its status (OAUTH_ERROR_STATUS), the code, only the RFC 6749 §5.2 fields, no token. */
export function assertError(res, error) {
  assert.equal(res.status, OAUTH_ERROR_STATUS[error], `expected ${error}, got ${res.status} ${res.text}`)
  assert.equal(res.body?.error, error)
  assert.deepEqual(Object.keys(res.body).filter((k) => !ERROR_BODY_FIELDS.includes(k)), [], 'fields beyond the OAuth error body')
}
/** The rate- or failure-limit answer (RATE_LIMITS, FAILURE_LIMIT): 429, whole-second Retry-After, `{error}` alone. */
export function assertLimited(res) {
  assert.equal(res.status, HTTP_STATUS.tooManyRequests, `expected 429, got ${res.status} ${res.text}`)
  assert.deepEqual(res.body, { ...oauthErrorBody(OAUTH_ERROR.temporarilyUnavailable) })
  const retry = res.headers[RATE_LIMITS.retryAfterHeader]
  assert.match(retry ?? '', /^\d+$/, 'Retry-After is not whole seconds')
  return seconds(Number(retry))
}
/** A response as the client sees it, for "identical" (only the `Date` header may differ). */
export const shape = (res) => ({ status: res.status, text: res.text, headers: Object.fromEntries(Object.entries(res.headers).filter(([k]) => k !== HTTP_WIRE.date)) })

/** A token for `clientId` on entry `e`, required to succeed with `scope`; returns the access token. */
export async function issue(w, e, clientId, scope, options = {}) {
  return assertToken(await tokenRequest(w, { clientId, secret: e.value, ...options }), scope)
}
/** An enabled entry bound to `id` in the fake pair store (a `pair` made earlier at the MCP endpoint). */
function boundEntry(w, id) {
  const e = w.tokens.add()
  w.pairs.bind(e.entryKey, id)
  return e
}
/** `verify` of a bearer value under `host` at `now`. */
export const verify = (w, value, now = w.clock.now(), host) => w.verifier.verify(bearer(value), audience(w, host), now)
/** K1 `Caller` as plain data (absent members dropped). */
const callerOf = (c) => Object.fromEntries(CALLER_FIELDS.filter((k) => c?.[k] !== undefined).map((k) => [k, c[k]]))
/** The Caller of a token of `clientId` on entry `e` (R-ID-03: full only when the entry is bound to `clientId`). */
function expectedCaller(w, e, clientId, { host, generation = FIXTURE.firstGeneration } = {}) {
  const pair = w.pairs.pairOf(e.entryKey)
  const full = pair?.id === clientId
  return callerOf({ entryKey: e.entryKey, clientId, principalKey: full ? pair.principalKey : undefined, scope: full ? SCOPE.full : SCOPE.pair, audience: audience(w, host), generation })
}
export const INVALID = Object.freeze({ error: VERIFY_ERROR.invalidToken })
/** The fake C-OAUTH-WEB grants: a 200 with a refresh token, and the `invalid_grant` a machine client gets. */
export const okGrant = (grantType) => new FakeGrant(grantType, { ok: true, body: tokenResponse({ accessToken: FIXTURE.fakeAccess, scope: SCOPE.full, refreshToken: FIXTURE.fakeRefresh }) })
export const refusingGrant = (grantType, error, countedFailure = false) => new FakeGrant(grantType, { ok: false, error, countedFailure })
/** A form of the fake code grant (a public client: the id only, CLIENT_AUTH.none). */
export const codeRequest = (w, extra = []) => tokenRequest(w, { auth: CLIENT_AUTH.none, clientId: FIXTURE.cimd, grant: GRANT.authorizationCode, extra: [[FORM.code, FIXTURE.fakeCode], ...extra] })

/** One case test on a fresh world; `todo` (a LATER owner) registers a todo instead. */
export function row(sdk, id, part, title, fn, todo) {
  caseTest(sdk, id, part, title, todo === undefined ? async (t) => fn(await oauthWorld(t, sdk), t) : null, todo)
}
const todo = (sdk, id, part, title, owner) => row(sdk, id, part, title, null, owner)
/** A store-only row (OAuthTokenStore over its own DSH storage). */
export const storeRow = (sdk, id, part, title, fn) => caseTest(sdk, id, part, title, async (t) => fn(await storeWorld(t, sdk)))
/** A limiter-only row (a fresh FailureLimiter). */
const limiterRow = (sdk, id, part, title, fn) => caseTest(sdk, id, part, title, async () => fn(await limiterOf(sdk)))

// ---------------------------------------------------------------------------------------------
// Use Cases
// ---------------------------------------------------------------------------------------------

function useCases(sdk) {
  // AUTH-UC-02 (C-PAIR's rows that named C-OAUTH): entry E1 enabled and unbound; the agent is agent-a.
  const uc02 = (part, title, fn) => row(sdk, CASE.uc02, part, title, fn)
  uc02('main step 2', 'protected resource metadata, then authorization server metadata at the issuer\'s path-inserted URI; its issuer equals the one used to build that URL', async (w) => {
    const prm = await metadata(w, PRM_PATH)
    assert.equal(prm.status, HTTP_STATUS.ok)
    assert.deepEqual(prm.body, { ...protectedResourceMetadata(w.origin()) })
    const issuer = prm.body.authorization_servers[0]
    assert.equal(oauthUrls(w.origin()).authorizationServerMetadata, w.origin() + PATHS.authorizationServerPrefix + new URL(issuer).pathname)
    const asm = await metadata(w, ASM_PATH)
    assert.equal(asm.status, HTTP_STATUS.ok)
    assert.equal(asm.body.issuer, issuer)
  })
  uc02('main step 3', 'client_credentials with agent-a + v(E1) and the canonical resource on an unbound entry: 200, scope agent:pair, expires_in 3600, standard fields only, no refresh_token', async (w) => {
    const e = w.tokens.add()
    await issue(w, e, ID.agentA, SCOPE.pair)
    assert.deepEqual(w.pairs.writes, [], 'the token endpoint never pairs')
  })
  uc02('A2', 'client_secret_post gives the same result as client_secret_basic', async (w) => {
    const e = w.tokens.add()
    const viaBasic = await tokenRequest(w, { clientId: ID.agentA, secret: e.value })
    const viaPost = await tokenRequest(w, { auth: CLIENT_AUTH.post, clientId: ID.agentA, secret: e.value })
    assertToken(viaBasic, SCOPE.pair)
    assertToken(viaPost, SCOPE.pair)
    assert.deepEqual(callerOf(verify(w, viaPost.body.access_token)), callerOf(verify(w, viaBasic.body.access_token)))
  })
  uc02('E1', 'no id (client_id absent or empty): invalid_client, no access token', async (w) => {
    const e = w.tokens.add()
    assertError(await tokenRequest(w, { auth: CLIENT_AUTH.post, secret: e.value }), OAUTH_ERROR.invalidClient)
    assertError(await tokenRequest(w, { clientId: '', secret: e.value }), OAUTH_ERROR.invalidClient)
  })

  // AUTH-UC-03: P(E1, agent-a) holds a full access token issued at t0.
  const uc03 = (part, title, fn) => row(sdk, CASE.uc03, part, title, async (w) => {
    const e = boundEntry(w, ID.agentA)
    await fn(w, e, await issue(w, e, ID.agentA, SCOPE.full))
  })
  uc03('main step 1', 'at t0 + 3600 the token is invalid_token', (w, e, token) => {
    assert.deepEqual(verify(w, token, at(LIFETIME.accessTokenMs)), INVALID)
  })
  uc03('main steps 2–3', 'it re-authenticates with agent-a + v(E1): a full token, scope fishball, never refused because E1 is bound to agent-a; no pair call', async (w, e) => {
    w.clock.set(at(LIFETIME.accessTokenMs))
    const next = await issue(w, e, ID.agentA, SCOPE.full)
    assert.deepEqual(callerOf(verify(w, next)), expectedCaller(w, e, ID.agentA))
    assert.deepEqual(w.pairs.writes, [], 'the token endpoint paired')
  })
  uc03('A1', 'the client process restarts: step 2 directly, with the old token still valid, gives a second full token', async (w, e, token) => {
    const next = await issue(w, e, ID.agentA, SCOPE.full)
    assert.notEqual(next, token)
    assert.equal(verify(w, token).scope, SCOPE.full)
  })
  uc03('A2', 'the connector restarts: every old token is invalid_token (memory only, TQ-5); step 2 gives a full token with the pair intact', async (w, e, token) => {
    await w.reopen()
    assert.deepEqual(verify(w, token), INVALID)
    assert.deepEqual(callerOf(verify(w, await issue(w, e, ID.agentA, SCOPE.full))), expectedCaller(w, e, ID.agentA))
  })
  uc03('E1', 'E1 disabled between steps 1 and 2: step 2 is invalid_client', async (w, e) => {
    w.tokens.disable(e.entryKey)
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value }), OAUTH_ERROR.invalidClient)
  })
  uc03('E2', 'grant_type=refresh_token from the machine client: the endpoint hands it to the refresh grant and sends its invalid_grant; no token', async (w, e, token) => {
    const refresh = refusingGrant(GRANT.refreshToken, OAUTH_ERROR.invalidGrant)
    w.register(refresh)
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value, grant: GRANT.refreshToken, extra: [[FORM.refreshToken, token]] }), OAUTH_ERROR.invalidGrant)
    assert.equal(refresh.calls.length, 1)
  })

  // AUTH-UC-06 (C-OAUTH's part): P(E1, a) bound; E1's value generated by C.
  const uc06 = (part, title, fn) => row(sdk, CASE.uc06, part, title, async (w) => {
    const e = boundEntry(w, ID.a)
    await fn(w, e, await issue(w, e, ID.a, SCOPE.full))
  })
  uc06('main step 2', 'after the disable, the next verify of any token derived from E1 is invalid_token and the token endpoint answers invalid_client', async (w, e, token) => {
    const pairOnly = await issue(w, e, ID.x, SCOPE.pair)
    w.tokens.disable(e.entryKey)
    for (const t of [token, pairOnly]) assert.deepEqual(verify(w, t), INVALID)
    assertError(await tokenRequest(w, { clientId: ID.a, secret: e.value }), OAUTH_ERROR.invalidClient)
  })
  // Main steps 3–6 (streams, offers, sessions, kept events, the designated role) run in test/v3/dsh-connector/revocation.
  uc06('main step 7', 'E1 switched on again: old tokens stay invalid_token; a new request with a gives a full token', async (w, e, token) => {
    w.tokens.disable(e.entryKey)
    w.tokens.enable(e.entryKey)
    assert.deepEqual(verify(w, token), INVALID)
    await issue(w, e, ID.a, SCOPE.full)
  })
  uc06('A1', 'E1 deleted: its tokens are invalid_token and its value is invalid_client', async (w, e, token) => {
    w.tokens.remove(e.entryKey)
    assert.deepEqual(verify(w, token), INVALID)
    assertError(await tokenRequest(w, { clientId: ID.a, secret: e.value }), OAUTH_ERROR.invalidClient)
  })
  // AUTH-UC-06 A3 (a value change) is withdrawn by design §5.9: a value never changes (requirements 1.27).
  todo(sdk, CASE.uc06, 'E1', 'a request already past the token check when the revocation lands completes; the next is refused', LATER.http)

  // AUTH-UC-04 E1 (C-PAIR's row): E1 bound to 123.
  row(sdk, CASE.uc04, 'E1', 'an invalid token with id 123: invalid_client, identical to an unknown id\'s, no already-paired and no field of the bound pair', async (w) => {
    boundEntry(w, ID.n123)
    const refused = await tokenRequest(w, { clientId: ID.n123, secret: FIXTURE.value() })
    assertError(refused, OAUTH_ERROR.invalidClient)
    assert.deepEqual(shape(refused), shape(await tokenRequest(w, { clientId: ID.n999, secret: FIXTURE.value() })))
  })

  // AUTH-UC-07: E1 enabled and bound to agent-a; the client has static headers only.
  const uc07 = (part, title, fn) => row(sdk, CASE.uc07, part, title, async (w) => fn(w, boundEntry(w, ID.agentA)))
  uc07('main step 1', 'Bearer agent-a.<v(E1)>: invalid_token, identical to any invalid access token', (w, e) => {
    assert.deepEqual(verify(w, `${ID.agentA}.${e.value}`), INVALID)
    assert.deepEqual(verify(w, FIXTURE.value()), INVALID)
  })
  uc07('main step 2', 'Bearer <v(E1)>: invalid_token (the token is never a bearer credential)', (w, e) => {
    assert.deepEqual(verify(w, e.value), INVALID)
  })
  todo(sdk, CASE.uc07, 'main step 2 (id header)', 'v(E1) with Fishball-Agent-Id: agent-a at the MCP endpoint: the same 401', LATER.http)
  todo(sdk, CASE.uc07, 'main step 3', 'the connector settings have no directAccess switch', LATER.wire)
  uc07('A1', 'an access token from the token endpoint with agent-a + v(E1) is accepted: full power', async (w, e) => {
    const token = await issue(w, e, ID.agentA, SCOPE.full)
    assert.deepEqual(callerOf(verify(w, token)), expectedCaller(w, e, ID.agentA))
  })
  uc07('E1 (token surface)', 'a present Origin at the token endpoint: 403 from the gate before any token check', async (w, e) => {
    const res = await w.send({ method: HTTP_METHOD.post, path: PATHS.token, host: w.hostHeader(), headers: { [REQUEST_GATE.headers.origin]: w.origin(), [HTTP_WIRE.contentType]: HTTP_WIRE.form, [HTTP_WIRE.authorization]: basic(ID.agentA, e.value) }, body: new URLSearchParams({ [GRANT_DISPATCH.formField]: GRANT.clientCredentials, [FORM.resource]: audience(w) }).toString() })
    assert.equal(res.status, HTTP_STATUS.forbidden)
    assert.equal(res.text, '')
    assert.equal(w.tokens.matchCalls, 0, 'a token was checked before the gate passed (R-TOK-00)')
  })
  todo(sdk, CASE.uc07, 'E1', 'the static header from a disallowed Origin at the MCP endpoint: 403 before any token check', LATER.http)
  uc07('post', 'neither the token value nor an access token is ever logged', async (w, e) => {
    const token = await issue(w, e, ID.agentA, SCOPE.full)
    verify(w, e.value)
    verify(w, `${ID.agentA}.${e.value}`)
    await tokenRequest(w, { clientId: ID.agentA, secret: e.value.slice(0, -1) })
    assert.deepEqual(w.logger.lines.filter((l) => l.includes(e.value) || l.includes(token)), [])
  })
  todo(sdk, CASE.uc07, 'post (limit)', 'a static-header request counts toward the per-client failure limit like any invalid bearer', LATER.http)

  // AUTH-UC-08: E1 enabled; the stock ClientCredentialsProvider of this SDK's @modelcontextprotocol/client.
  const uc08 = (part, title, fn) => row(sdk, CASE.uc08, part, title, fn)
  /** Runs the stock provider's `auth()` against the world, recording every request it sends. */
  async function stockAuth(w, e, expectedIssuer = oauthUrls(w.origin()).issuer) {
    const { ClientCredentialsProvider, auth } = await stockClient(sdk)
    const provider = new ClientCredentialsProvider({ clientId: ID.agentA, clientSecret: e.value, expectedIssuer })
    const sent = []
    const fetchFn = (url, init) => { sent.push({ url: String(url), method: init?.method, body: init?.body === undefined ? undefined : String(init.body) }); return fetch(url, init) }
    const result = await auth(provider, { serverUrl: audience(w), fetchFn })
    return { result, provider, sent }
  }
  uc08('main', 'the stock provider discovers both metadata documents and gets a token, with configuration only; the token is accepted for the canonical MCP URI', async (w) => {
    const e = w.tokens.add()
    const { result, provider, sent } = await stockAuth(w, e)
    const token = provider.tokens()?.access_token
    assert.ok(token, `no token (auth() answered ${result})`)
    assert.ok(sent.some((r) => r.url === oauthUrls(w.origin()).protectedResourceMetadata), 'no protected resource metadata read')
    assert.ok(sent.some((r) => r.url === oauthUrls(w.origin()).authorizationServerMetadata), 'no authorization server metadata read')
    assert.deepEqual(callerOf(verify(w, token)), expectedCaller(w, e, ID.agentA))
  })
  todo(sdk, CASE.uc08, 'main (MCP)', 'server/discover → tools/list → a tool call → subscriptions/listen with that token', LATER.tools)
  uc08('A1', 'the expected issuer differs from the metadata: the client refuses to send the secret (no token request reaches the endpoint)', async (w) => {
    const e = w.tokens.add()
    await assert.rejects(stockAuth(w, e, oauthUrls(w.origin(FIXTURE.host.localhost)).issuer))
    assert.deepEqual(w.gate.checksOf(PATHS.token), [], 'a token request was sent')
  })
  uc08('A2', 'under another allowed host the metadata names that host\'s issuer and canonical URI, and a token from the first host is refused under the second', async (w) => {
    const e = w.tokens.add()
    for (const host of [FIXTURE.host.loopback, FIXTURE.host.localhost]) {
      assert.deepEqual((await metadata(w, PRM_PATH, host)).body, { ...protectedResourceMetadata(w.origin(host)) })
      assert.equal((await metadata(w, ASM_PATH, host)).body.issuer, oauthUrls(w.origin(host)).issuer)
    }
    const token = await issue(w, e, ID.agentA, SCOPE.pair)
    assert.deepEqual(verify(w, token, w.clock.now(), FIXTURE.host.localhost), INVALID)
  })
  uc08('E1', 'the authorization server metadata lists no registration endpoint: it is exactly K1\'s document', async (w) => {
    const asm = await metadata(w, ASM_PATH)
    assert.deepEqual(asm.body, { ...authorizationServerMetadata(w.origin(), approvalOrigin(w)) })
    assert.ok(!Object.keys(asm.body).some((k) => /registration/.test(k)), 'a registration endpoint is listed')
  })
  uc08('post', 'the token is audience-bound: presented for another resource it is refused', async (w) => {
    const token = await issue(w, w.tokens.add(), ID.agentA, SCOPE.pair)
    assert.deepEqual(w.verifier.verify(bearer(token), FIXTURE.foreignResource, w.clock.now()), INVALID)
  })

  // K1b-UC-02: the token endpoint over the gate and its grant_type dispatch.
  const k1b = (part, title, fn) => row(sdk, CASE.k1bUc02, part, title, fn)
  k1b('AUTH-EP-01 6', 'GET on the token endpoint: 405 with Allow: POST; the token surface calls check, never admit', async (w) => {
    const res = await tokenRequest(w, { method: HTTP_METHOD.get, clientId: ID.agentA, secret: FIXTURE.value() })
    assert.equal(res.status, HTTP_STATUS.methodNotAllowed)
    assert.equal(res.headers[REQUEST_GATE.headers.allow], REQUEST_GATE.routes[GATE_SURFACE.token][PATHS.token].join(REQUEST_GATE.allowSeparator))
    assert.equal(res.body?.access_token, undefined)
    await tokenRequest(w, { clientId: ID.agentA, secret: w.tokens.add().value })
    await metadata(w, PRM_PATH)
    await metadata(w, ASM_PATH)
    for (const path of [PATHS.token, PRM_PATH, ASM_PATH]) assert.ok(w.gate.checksOf(path).length > 0 && w.gate.checksOf(path).every((c) => c.surface === GATE_SURFACE.token), `${path} not checked on ${GATE_SURFACE.token}`)
    assert.deepEqual(w.gate.admits, [], 'the token surface called admit')
  })
  k1b('AUTH-EP-01 1–5 (dispatch)', 'each grant_type reaches its registered GrantHandler with the form and the context {origin, client, failureKey, now}; its token body is sent with TOKEN_RESPONSE_HEADERS', async (w) => {
    const code = okGrant(GRANT.authorizationCode)
    const refresh = okGrant(GRANT.refreshToken)
    w.register(code)
    w.register(refresh)
    w.clock.advance(FIXTURE.justUnderMs)
    const res = await codeRequest(w)
    assert.equal(res.status, HTTP_STATUS.ok)
    assert.deepEqual(res.body, { ...code.answer.body })
    for (const [name, value] of Object.entries(TOKEN_RESPONSE_HEADERS)) assert.equal(res.headers[name], value)
    assert.equal(code.calls.length, 1)
    assert.equal(refresh.calls.length, 0, 'the other handler ran')
    const [{ form, ctx }] = code.calls
    assert.equal(form[GRANT_DISPATCH.formField], GRANT.authorizationCode)
    assert.equal(form[FORM.code], FIXTURE.fakeCode)
    assert.deepEqual(Object.keys(ctx).sort(), [...GRANT_CONTEXT.fields].sort())
    assert.equal(ctx.origin, w.origin())
    assert.equal(ctx.now, w.clock.now())
    assert.deepEqual({ ...ctx.client }, { method: CLIENT_AUTH.none, clientId: FIXTURE.cimd })
    assert.deepEqual({ ...ctx.failureKey }, { remoteAddress: w.remoteAddresses.at(-1), clientId: FIXTURE.cimd })
  })
  k1b('AUTH-EP-01 1–5 (missing)', 'no grant_type: 400 invalid_request; no handler runs', async (w) => {
    const code = okGrant(GRANT.authorizationCode)
    w.register(code)
    assertError(await tokenRequest(w, { auth: CLIENT_AUTH.none, clientId: FIXTURE.cimd, grant: ABSENT }), OAUTH_ERROR.invalidRequest)
    assert.equal(code.calls.length, 0)
  })
  k1b('AUTH-EP-01 1–5 (unknown)', 'a grant_type with no handler (password; authorization_code while unregistered): unsupported_grant_type', async (w) => {
    const e = w.tokens.add()
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value, grant: FIXTURE.unsupportedGrant }), OAUTH_ERROR.unsupportedGrantType)
    assertError(await codeRequest(w), OAUTH_ERROR.unsupportedGrantType)
  })
  k1b('AUTH-EP-01 1–5 (repeat)', 'a repeated parameter: 400 invalid_request before any handler runs (RFC 6749 §3.2)', async (w) => {
    const code = okGrant(GRANT.authorizationCode)
    w.register(code)
    assertError(await codeRequest(w, [[FORM.code, FIXTURE.fakeCode]]), OAUTH_ERROR.invalidRequest)
    assert.equal(code.calls.length, 0)
  })
  for (const error of [OAUTH_ERROR.invalidGrant, OAUTH_ERROR.invalidTarget, OAUTH_ERROR.invalidRequest, OAUTH_ERROR.invalidClient]) {
    k1b(`AUTH-EP-01 1–5 (refusal ${error})`, `a handler's ${error} is sent as oauthErrorBody with OAUTH_ERROR_STATUS (${OAUTH_ERROR_STATUS[error]})`, async (w) => {
      w.register(refusingGrant(GRANT.authorizationCode, error))
      const res = await codeRequest(w)
      assertError(res, error)
      assert.deepEqual(res.body, { ...oauthErrorBody(error) })
    })
  }
  // Re-baselined by X-SEC X-03 (C-WIRE-2): the handler runs first; a failing request while limited is the
  // 429, uncounted; a valid one is served (K1 FAILURE_LIMIT, amending S7b P2).
  k1b('AUTH-EP-01 1–5 (counted)', 'countedFailure true is recorded on ctx.failureKey: after FAILURE_LIMIT.perKeyPerWindow of them a failing request is 429 and is not counted again (X-03)', async (w) => {
    const code = refusingGrant(GRANT.authorizationCode, OAUTH_ERROR.invalidGrant, true)
    w.register(code)
    for (let i = 0; i < FAILURE_LIMIT.perKeyPerWindow; i += 1) assertError(await codeRequest(w), OAUTH_ERROR.invalidGrant)
    assertLimited(await codeRequest(w))
    assert.equal(w.limiter.check({ remoteAddress: w.remoteAddresses.at(-1), clientId: FIXTURE.cimd }, w.clock.now()).limited, true)
  })
  k1b('AUTH-EP-01 1–5 (valid while limited)', 'a key past the failure limit: a valid authorization_code request is still served (X-03)', async (w) => {
    const refusing = refusingGrant(GRANT.authorizationCode, OAUTH_ERROR.invalidGrant, true)
    w.register(refusing)
    for (let i = 0; i < FAILURE_LIMIT.perKeyPerWindow; i += 1) assertError(await codeRequest(w), OAUTH_ERROR.invalidGrant)
    refusing.answer = okGrant(GRANT.authorizationCode).answer
    assert.equal((await codeRequest(w)).status, HTTP_STATUS.ok)
  })
  k1b('AUTH-EP-01 1–5 (uncounted)', 'countedFailure false is not recorded: more than FAILURE_LIMIT.perKeyPerWindow refusals still reach the handler', async (w) => {
    const code = refusingGrant(GRANT.authorizationCode, OAUTH_ERROR.invalidGrant, false)
    w.register(code)
    for (let i = 0; i <= FAILURE_LIMIT.perKeyPerWindow; i += 1) assertError(await codeRequest(w), OAUTH_ERROR.invalidGrant)
    assert.equal(code.calls.length, FAILURE_LIMIT.perKeyPerWindow + 1)
  })
  k1b('AUTH-EP-01 1–5 (throw)', 'a handler that throws: 500 server_error', async (w) => {
    const code = okGrant(GRANT.authorizationCode)
    code.throws = true
    w.register(code)
    assertError(await codeRequest(w), OAUTH_ERROR.serverError)
  })
}

// ---------------------------------------------------------------------------------------------
// Equivalence Partitioning
// ---------------------------------------------------------------------------------------------

function equivalencePartitions(sdk) {
  // AUTH-EP-01: entry E1 enabled; the client is agent-a.
  const ep01 = (n, title, fn) => row(sdk, CASE.ep01, n, title, async (w) => fn(w, w.tokens.add()))
  ep01('1', 'valid basic: POST form, client_credentials, valid id and enabled token, canonical resource → 200 access token', async (w, e) => {
    await issue(w, e, ID.agentA, SCOPE.pair)
  })
  ep01('2', 'valid post (client_secret_post) → 200 access token', async (w, e) => {
    await issue(w, e, ID.agentA, SCOPE.pair, { auth: CLIENT_AUTH.post })
  })
  ep01('3', 'refresh_token from a client_credentials client: the endpoint dispatches it to the refresh grant and sends its invalid_grant', async (w, e) => {
    const refresh = refusingGrant(GRANT.refreshToken, OAUTH_ERROR.invalidGrant)
    w.register(refresh)
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value, grant: GRANT.refreshToken, extra: [[FORM.refreshToken, FIXTURE.fakeRefresh]] }), OAUTH_ERROR.invalidGrant)
    assert.equal(refresh.calls.length, 1)
  })
  todo(sdk, CASE.ep01, '3 (grant)', 'the refresh_token grant answers invalid_grant for any refresh token not issued to a browser client', LATER.web)
  ep01('4', 'other grant (password) → unsupported_grant_type, no access token', async (w, e) => {
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value, grant: FIXTURE.unsupportedGrant }), OAUTH_ERROR.unsupportedGrantType)
  })
  ep01('5', 'grant missing → invalid_request (K), no access token', async (w, e) => {
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value, grant: ABSENT }), OAUTH_ERROR.invalidRequest)
  })
  ep01('6', 'wrong method (GET) → 405 (K), no access token', async (w, e) => {
    const res = await tokenRequest(w, { method: HTTP_METHOD.get, clientId: ID.agentA, secret: e.value })
    assert.equal(res.status, HTTP_STATUS.methodNotAllowed)
    assert.equal(res.body?.access_token, undefined)
  })
  ep01('7', 'foreign resource → invalid_target, no access token', async (w, e) => {
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value, resource: FIXTURE.foreignResource }), OAUTH_ERROR.invalidTarget)
  })
  ep01('8', 'resource absent → invalid_target, no access token', async (w, e) => {
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value, resource: ABSENT }), OAUTH_ERROR.invalidTarget)
  })
  ep01('8a', 'the stock ClientCredentialsProvider (default configuration) sends the canonical resource and gets 200', async (w, e) => {
    const { ClientCredentialsProvider, auth } = await stockClient(sdk)
    const provider = new ClientCredentialsProvider({ clientId: ID.agentA, clientSecret: e.value, expectedIssuer: oauthUrls(w.origin()).issuer })
    const forms = []
    const fetchFn = (url, init) => { if (String(url) === oauthUrls(w.origin()).tokenEndpoint) forms.push(new URLSearchParams(String(init.body))); return fetch(url, init) }
    await auth(provider, { serverUrl: audience(w), fetchFn })
    assert.equal(forms.length, 1, 'one token request')
    assert.equal(forms[0].get(FORM.resource), audience(w))
    assert.ok(provider.tokens()?.access_token, 'no access token')
  })
  ep01('9', 'secret in the query (?client_secret=…) with a valid form → 400 invalid_request', async (w, e) => {
    const query = HTTP_WIRE.queryStart + new URLSearchParams({ [BEARER_CHALLENGE.queryClientSecret]: e.value })
    assertError(await tokenRequest(w, { clientId: ID.agentA, secret: e.value, query }), OAUTH_ERROR.invalidRequest)
  })
  ep01('10', 'no client authentication (id only) → invalid_client', async (w) => {
    assertError(await tokenRequest(w, { auth: CLIENT_AUTH.post, clientId: ID.agentA }), OAUTH_ERROR.invalidClient)
  })
  ep01('11', 'no 200 client_credentials response has a refresh_token (unbound and bound)', async (w, e) => {
    const res = await tokenRequest(w, { clientId: ID.agentA, secret: e.value })
    assertToken(res, SCOPE.pair)
    const bound = boundEntry(w, ID.x)
    const full = await tokenRequest(w, { clientId: ID.x, secret: bound.value })
    assertToken(full, SCOPE.full)
    assert.deepEqual([res, full].filter((r) => FORM.refreshToken in r.body), [])
  })

  // AUTH-EP-02 rows 3–10: bearer values at the verifier; E1 enabled and bound to agent-a.
  const ep02 = (n, title, fn) => row(sdk, CASE.ep02, n, title, async (w) => fn(w, boundEntry(w, ID.agentA)))
  ep02('3', 'a random unknown value → invalid_token', (w) => { assert.deepEqual(verify(w, FIXTURE.value()), INVALID) })
  ep02('4', 'an expired access token → invalid_token', async (w, e) => {
    const token = await issue(w, e, ID.agentA, SCOPE.full)
    assert.deepEqual(verify(w, token, at(LIFETIME.accessTokenMs)), INVALID)
  })
  for (const [kind, revoke] of [['disabled', (w, e) => w.tokens.disable(e.entryKey)], ['deleted', (w, e) => w.tokens.remove(e.entryKey)]]) {
    ep02(`5 (${kind})`, `an access token of a ${kind} entry → invalid_token on the next request`, async (w, e) => {
      const token = await issue(w, e, ID.agentA, SCOPE.full)
      revoke(w, e)
      assert.deepEqual(verify(w, token), INVALID)
    })
  }
  ep02('6', 'an access token issued for another resource (audience) → invalid_token', async (w, e) => {
    const token = await issue(w, e, ID.agentA, SCOPE.full)
    assert.deepEqual(w.verifier.verify(bearer(token), FIXTURE.foreignResource, w.clock.now()), INVALID)
  })
  ep02('7', 'the raw token value v(E1) → invalid_token', (w, e) => { assert.deepEqual(verify(w, e.value), INVALID) })
  ep02('8', '<id>.<v(E1)> → invalid_token', (w, e) => { assert.deepEqual(verify(w, `${ID.agentA}.${e.value}`), INVALID) })
  ep02('8b', 'v(E1) as the bearer of its bound id\'s client (the verifier reads the Authorization value only) → invalid_token', (w, e) => {
    assert.deepEqual(verify(w, e.value), INVALID)
  })
  todo(sdk, CASE.ep02, '8b (header)', 'v(E1) with Fishball-Agent-Id of its bound id at the MCP endpoint: 401 invalid_token', LATER.http)
  ep02('8a', 'an access token issued under another allowed host (other canonical URI) → invalid_token', async (w, e) => {
    const token = await issue(w, e, ID.agentA, SCOPE.full, { host: FIXTURE.host.localhost })
    assert.deepEqual(verify(w, token, w.clock.now(), FIXTURE.host.loopback), INVALID)
    assert.deepEqual(callerOf(verify(w, token, w.clock.now(), FIXTURE.host.localhost)), expectedCaller(w, e, ID.agentA, { host: FIXTURE.host.localhost }))
  })
  ep02('9', 'a valid pair-only access token → a Caller with scope agent:pair and no principal key', async (w, e) => {
    const token = await issue(w, e, ID.n999, SCOPE.pair)
    assert.deepEqual(callerOf(verify(w, token)), expectedCaller(w, e, ID.n999))
  })
  ep02('10', 'a valid full access token → a Caller with scope fishball and the pair\'s principal key', async (w, e) => {
    const token = await issue(w, e, ID.agentA, SCOPE.full)
    assert.deepEqual(callerOf(verify(w, token)), expectedCaller(w, e, ID.agentA))
  })
  todo(sdk, CASE.ep02, '1–2, 11–14', 'no header, a non-Bearer scheme, query tokens and unauthenticated discover / listen at the MCP endpoint; every 401 byte-identical', LATER.http)

  // AUTH-EP-03 rows 1–6 (C-PAIR's rows): the id at the token endpoint with a valid enabled token.
  for (const [n, cls, ids, valid] of ID_CLASSES) {
    row(sdk, CASE.ep03, n, `${cls} (${ids.map((i) => JSON.stringify(i)).join(', ')}) at the token endpoint: ${valid ? 'accepted' : 'invalid_client'}`, async (w) => {
      const e = w.tokens.add()
      for (const id of ids) {
        const res = await tokenRequest(w, { auth: CLIENT_AUTH.post, clientId: id, secret: e.value })
        if (valid) assertToken(res, SCOPE.pair)
        else assertError(res, OAUTH_ERROR.invalidClient)
      }
    })
  }

  // AUTH-EP-05: id 123; every refusal is identical to row 1's.
  const ep05 = (n, title, setUp) => row(sdk, CASE.ep05, n, title, async (w) => {
    const secret = setUp(w)
    const unknown = await tokenRequest(w, { clientId: ID.n123, secret: FIXTURE.value() })
    assertError(unknown, OAUTH_ERROR.invalidClient)
    if (secret !== undefined) assert.deepEqual(shape(await tokenRequest(w, { clientId: ID.n123, secret })), shape(unknown))
  })
  ep05('1', 'an unknown secret → invalid_client (401)', () => undefined)
  ep05('2', 'a disabled entry bound to 123 → identical to row 1', (w) => { const e = boundEntry(w, ID.n123); w.tokens.disable(e.entryKey); return e.value })
  ep05('3', 'a deleted entry → identical to row 1', (w) => { const e = boundEntry(w, ID.n123); w.tokens.remove(e.entryKey); return e.value })
  ep05('4', 'enabled, bound to 123, the secret off by one character → identical to row 1', (w) => {
    const { value } = boundEntry(w, ID.n123)
    return value.slice(0, -1) + (value.at(-1) === FIXTURE.idFill ? FIXTURE.idDot : FIXTURE.idFill)
  })
  row(sdk, CASE.ep05, '5', `${FIXTURE.failedAttempts} failed attempts with random secrets, then the valid one: each answer is the uniform invalid_client or the rate-limit answer, which names no token or id`, async (w) => {
    const e = boundEntry(w, ID.n123)
    const answers = []
    for (let i = 0; i < FIXTURE.failedAttempts; i += 1) answers.push(await tokenRequest(w, { clientId: ID.n123, secret: FIXTURE.value() }))
    const valid = await tokenRequest(w, { clientId: ID.n123, secret: e.value })
    const [first, limited] = [answers[0], answers.find((r) => r.status === HTTP_STATUS.tooManyRequests)]
    assertError(first, OAUTH_ERROR.invalidClient)
    if (limited !== undefined) assertLimited(limited)
    const allowed = [shape(first), limited && shape(limited)].filter(Boolean).map((s) => JSON.stringify(s))
    assert.deepEqual(answers.map((r) => JSON.stringify(shape(r))).filter((s) => !allowed.includes(s)), [], 'a failure answer differs')
    if (valid.status !== HTTP_STATUS.ok) assert.equal(JSON.stringify(shape(valid)), JSON.stringify(shape(limited)))
    assert.deepEqual([...answers, valid].filter((r) => r.text.includes(ID.n123) || r.text.includes(e.entryKey)), [], 'an answer names the id or the entry')
  })
  row(sdk, CASE.ep05, '6 (endpoint)', 'every secret is checked through TokenRegistry.match (the constant-time comparator), once per request', async (w) => {
    const e = w.tokens.add()
    await tokenRequest(w, { clientId: ID.agentA, secret: FIXTURE.value() })
    await tokenRequest(w, { clientId: ID.agentA, secret: e.value })
    assert.equal(w.tokens.matchCalls, 2)
  })
  todo(sdk, CASE.ep05, '6', 'the comparator itself is constant-time', LATER.tokens)

  // AUTH-EP-06 row 9 (C-PAIR's row).
  row(sdk, CASE.ep06, '9', 'a token request with scope=fishball while unpaired: 200, narrowed to agent:pair (not invalid_scope), for an unbound entry and one bound to another id', async (w) => {
    const unbound = w.tokens.add()
    await issue(w, unbound, ID.agentA, SCOPE.pair, { scope: SCOPE.full })
    const other = boundEntry(w, ID.x)
    await issue(w, other, ID.agentA, SCOPE.pair, { scope: SCOPE.full })
  })

  // AUTH-EP-07: principal identity sources.
  todo(sdk, CASE.ep07, '1', 'the same access token with different clientInfo in _meta acts as the same principal', LATER.tools)
  row(sdk, CASE.ep07, '2', 'two different full access tokens of the same pair: the same principal', async (w) => {
    const e = boundEntry(w, ID.x)
    const [a, b] = [await issue(w, e, ID.x, SCOPE.full), await issue(w, e, ID.x, SCOPE.full)]
    assert.notEqual(a, b, 'two requests gave one access token')
    assert.equal(verify(w, a).principalKey, verify(w, b).principalKey)
    assert.equal(verify(w, a).principalKey, w.pairs.pairOf(e.entryKey).principalKey)
  })
  row(sdk, CASE.ep07, '3', 'different pairs: different principals', async (w) => {
    const [e1, e2] = [boundEntry(w, ID.x), boundEntry(w, ID.y)]
    assert.notEqual(verify(w, await issue(w, e1, ID.x, SCOPE.full)).principalKey, verify(w, await issue(w, e2, ID.y, SCOPE.full)).principalKey)
  })
  todo(sdk, CASE.ep07, '4', 'a request field naming another principal is ignored; the call acts as the token\'s pair', LATER.tools)

  // AUTH-EP-09: the Host of the request (rows 1–4, 6, 7 on DSH's listener; the approval listener is C-OAUTH-WEB's).
  const ep09 = (n, title, fn) => row(sdk, CASE.ep09, n, title, fn)
  const servedUnder = async (w, host) => {
    const [prm, asm] = [await metadata(w, PRM_PATH, host), await metadata(w, ASM_PATH, host)]
    assert.deepEqual(prm.body, { ...protectedResourceMetadata(w.origin(host)) })
    assert.deepEqual(asm.body, { ...authorizationServerMetadata(w.origin(host), approvalOrigin(w, host)) })
    await issue(w, w.tokens.add(), ID.agentA, SCOPE.pair, { host })
  }
  ep09('1', '127.0.0.1:<port>: served; issuer and canonical URI use 127.0.0.1:<port>', (w) => servedUnder(w, FIXTURE.host.loopback))
  ep09('2', 'localhost:<port>: served; issuer and canonical URI use localhost:<port>', (w) => servedUnder(w, FIXTURE.host.localhost))
  ep09('3', 'the bind address: served', (w) => servedUnder(w, w.facts.host))
  ep09('4', 'a host in DSH\'s --trusted-host list: served; issuer under that host (https)', (w) => servedUnder(w, FIXTURE.host.trusted))
  ep09('5', 'any other host (evil.example): refused before authentication', async (w) => {
    const e = w.tokens.add()
    for (const res of [await metadata(w, PRM_PATH, FIXTURE.host.evil), await metadata(w, ASM_PATH, FIXTURE.host.evil), await tokenRequest(w, { host: FIXTURE.host.evil, clientId: ID.agentA, secret: e.value })]) {
      assert.equal(res.status, HTTP_STATUS.forbidden)
      assert.equal(res.text, '')
    }
    assert.equal(w.tokens.matchCalls, 0, 'a token was checked under a refused host')
  })
  todo(sdk, CASE.ep09, '5 (approval)', 'any other host on the approval listener: refused before authentication', LATER.web)
  ep09('6', 'an access token issued under host 1 and used under host 2: invalid_token (different canonical URI)', async (w) => {
    const token = await issue(w, w.tokens.add(), ID.agentA, SCOPE.pair, { host: FIXTURE.host.loopback })
    assert.deepEqual(verify(w, token, w.clock.now(), FIXTURE.host.localhost), INVALID)
  })
  ep09('7', 'the AS metadata fetched under H: its issuer equals the issuer built from H', async (w) => {
    for (const host of [FIXTURE.host.loopback, FIXTURE.host.localhost, FIXTURE.host.trusted]) assert.equal((await metadata(w, ASM_PATH, host)).body.issuer, oauthUrls(w.origin(host)).issuer)
  })
}

// ---------------------------------------------------------------------------------------------
// Boundary Value Analysis
// ---------------------------------------------------------------------------------------------

function boundaryValues(sdk) {
  // AUTH-BVA-01: issued at t0 (fake clock); E1 bound to agent-a.
  const bva01 = (n, title, fn) => row(sdk, CASE.bva01, n, title, async (w) => {
    const e = boundEntry(w, ID.agentA)
    await fn(w, e, await issue(w, e, ID.agentA, SCOPE.full))
  })
  const justUnder = LIFETIME.accessTokenMs - FIXTURE.justUnderMs
  for (const [n, offset, valid] of [['1', 0, true], ['2', seconds(1), true], ['3', LIFETIME.accessTokenMs - seconds(1), true], ['4', justUnder, true], ['5', LIFETIME.accessTokenMs, false], ['6', LIFETIME.accessTokenMs + seconds(1), false]]) {
    bva01(n, `a request at t0 + ${offset / TIME_UNIT.msPerSecond} s: ${valid ? 'accepted' : 'invalid_token'}`, (w, e, token) => {
      const got = verify(w, token, at(offset))
      if (valid) assert.deepEqual(callerOf(got), expectedCaller(w, e, ID.agentA))
      else assert.deepEqual(got, INVALID)
    })
  }
  bva01('7', 're-authentication at t0 + 3600: a new token valid until t0 + 7200; the pair unchanged and no pair call', async (w, e) => {
    w.clock.set(at(LIFETIME.accessTokenMs))
    const next = await issue(w, e, ID.agentA, SCOPE.full)
    assert.deepEqual(callerOf(verify(w, next, at(2 * LIFETIME.accessTokenMs - FIXTURE.justUnderMs))), expectedCaller(w, e, ID.agentA))
    assert.deepEqual(verify(w, next, at(2 * LIFETIME.accessTokenMs)), INVALID)
    assert.deepEqual(w.pairs.writes, [])
  })
  bva01('8', 'a token used at t0 + 3599 is not extended by use', (w, e, token) => {
    assert.equal(verify(w, token, at(LIFETIME.accessTokenMs - seconds(1))).error, undefined)
    assert.deepEqual(verify(w, token, at(LIFETIME.accessTokenMs)), INVALID)
  })

  // AUTH-BVA-02: ids of `a` only (row 7: 64 with one dot), a valid enabled token.
  const idOf = (length) => FIXTURE.idFill.repeat(length)
  for (const [n, length, valid] of ID_LENGTHS) {
    row(sdk, CASE.bva02, n, `an id of length ${length}: ${valid ? 'accepted' : 'invalid_client'}`, async (w) => {
      const res = await tokenRequest(w, { auth: CLIENT_AUTH.post, clientId: idOf(length), secret: w.tokens.add().value })
      if (valid) assertToken(res, SCOPE.pair)
      else assertError(res, OAUTH_ERROR.invalidClient)
    })
  }
  row(sdk, CASE.bva02, '7', 'an id of length 64 including one dot: invalid_client (the dot, not the length)', async (w) => {
    const id = idOf(ID_MAX / 2) + FIXTURE.idDot + idOf(ID_MAX / 2 - 1)
    assert.equal([...id].length, ID_MAX)
    assertError(await tokenRequest(w, { auth: CLIENT_AUTH.post, clientId: id, secret: w.tokens.add().value }), OAUTH_ERROR.invalidClient)
  })

  // AUTH-BVA-06: LIMIT = RATE_LIMITS.tokenRequestsPerWindow, valid requests from one client.
  const LIMIT = RATE_LIMITS.tokenRequestsPerWindow
  const bva06 = (n, title, fn) => row(sdk, CASE.bva06, n, title, async (w) => fn(w, w.tokens.add()))
  const valid = (w, e) => tokenRequest(w, { clientId: ID.agentA, secret: e.value })
  const burst = async (w, e, count) => { const out = []; for (let i = 0; i < count; i += 1) out.push(await valid(w, e)); return out }
  bva06('1', '1 token request: served', async (w, e) => { assertToken(await valid(w, e), SCOPE.pair) })
  bva06('2', '2 token requests (one failed call of the stock client): both served, never rate-limited', async (w, e) => {
    for (const res of await burst(w, e, 2)) assertToken(res, SCOPE.pair)
  })
  bva06('3', `LIMIT (${LIMIT}) token requests: all served`, async (w, e) => {
    for (const res of await burst(w, e, LIMIT)) assertToken(res, SCOPE.pair)
  })
  bva06('4', 'LIMIT + 1: the extra request is refused with a rate-limit answer that names no token or id', async (w, e) => {
    const all = await burst(w, e, LIMIT + 1)
    assertLimited(all.at(-1))
    assert.ok(!all.at(-1).text.includes(ID.agentA) && !all.at(-1).text.includes(e.entryKey))
  })
  bva06('5', 'a valid credential after row 4, once the window admits one more (Retry-After): served', async (w, e) => {
    const wait = assertLimited((await burst(w, e, LIMIT + 1)).at(-1))
    w.clock.advance(wait)
    assertToken(await valid(w, e), SCOPE.pair)
  })
  caseTest(sdk, CASE.bva06, '6', `the frozen LIMIT (${LIMIT}) is at least 2`, () => { assert.ok(LIMIT >= 2) })
  row(sdk, CASE.bva06, '7', 'authorization_code token requests from one client are counted in the same limit: LIMIT pass, the next is 429 and reaches no handler', async (w) => {
    const code = okGrant(GRANT.authorizationCode)
    w.register(code)
    for (let i = 0; i < LIMIT; i += 1) assert.equal((await codeRequest(w)).status, HTTP_STATUS.ok)
    assertLimited(await codeRequest(w))
    assert.equal(code.calls.length, LIMIT)
  })
}

// ---------------------------------------------------------------------------------------------
// Decision Tables
// ---------------------------------------------------------------------------------------------

function decisionTables(sdk) {
  // AUTH-DT-01: X = agent-a, Y = 999.
  const dt01 = (rule, title, fn) => row(sdk, CASE.dt01, rule, title, fn)
  const refusedRules = [
    ['1', 'unknown token, any id → invalid_client 401', () => ({ clientId: ID.agentA, secret: FIXTURE.value() })],
    ['2', 'disabled token, valid id, bound to X with id X → invalid_client 401', (w) => { const e = boundEntry(w, ID.agentA); w.tokens.disable(e.entryKey); return { clientId: ID.agentA, secret: e.value } }],
    ['3', 'revoked (deleted) token → invalid_client 401', (w) => { const e = boundEntry(w, ID.agentA); w.tokens.remove(e.entryKey); return { clientId: ID.agentA, secret: e.value } }],
    ['4', 'valid token, invalid id (fb.1) → invalid_client', (w) => ({ clientId: ID.dotted, secret: w.tokens.add().value })],
    // Rule 8 (a value too short, token-too-short) is withdrawn by design §5.9: every value is generated.
  ]
  for (const [rule, title, credentials] of refusedRules) {
    dt01(rule, title, async (w) => assertError(await tokenRequest(w, { auth: CLIENT_AUTH.post, ...credentials(w) }), OAUTH_ERROR.invalidClient))
  }
  dt01('1–4 (identical)', 'the responses of rules 1–4 are identical (EP-05)', async (w) => {
    const shapes = []
    for (const [, , credentials] of refusedRules) shapes.push(JSON.stringify(shape(await tokenRequest(w, { auth: CLIENT_AUTH.post, ...credentials(w) }))))
    assert.equal(new Set(shapes).size, 1, shapes.join('\n'))
  })
  dt01('5', 'valid token, valid id, unbound → 200, scope agent:pair, pair-only power', async (w) => {
    const e = w.tokens.add()
    assert.equal(verify(w, await issue(w, e, ID.agentA, SCOPE.pair)).scope, SCOPE.pair)
  })
  dt01('6', 'valid token, valid id X, bound to X → 200, scope fishball, full power', async (w) => {
    const e = boundEntry(w, ID.agentA)
    assert.equal(verify(w, await issue(w, e, ID.agentA, SCOPE.full)).scope, SCOPE.full)
  })
  dt01('7', 'valid token, valid id Y, bound to X ≠ Y → 200, scope agent:pair, pair-only power', async (w) => {
    const e = boundEntry(w, ID.agentA)
    assert.equal(verify(w, await issue(w, e, ID.n999, SCOPE.pair)).scope, SCOPE.pair)
  })
  dt01('9', 'valid, unbound, the request asks scope=fishball → 200, scope agent:pair (narrowed)', async (w) => {
    await issue(w, w.tokens.add(), ID.agentA, SCOPE.pair, { scope: SCOPE.full })
  })
  dt01('10', 'any 200: only access_token, token_type, expires_in, scope; no fishball_pairing, no refresh_token', async (w) => {
    const bodies = [await tokenRequest(w, { clientId: ID.agentA, secret: w.tokens.add().value }), await tokenRequest(w, { clientId: ID.x, secret: boundEntry(w, ID.x).value })].map((r) => r.body)
    const standard = Object.keys(tokenResponse({ accessToken: FIXTURE.fakeAccess, scope: SCOPE.pair }))
    assert.deepEqual(bodies.flatMap((b) => Object.keys(b).filter((k) => !standard.includes(k))), [])
  })

  // K1b-DT-06: GrantRegistry.register.
  const dt06 = (rule, title, fn) => row(sdk, CASE.k1bDt06, rule, title, fn)
  dt06('1', 'a supported grant that is not built in (authorization_code, refresh_token) registers and is dispatched', async (w) => {
    const grants = [okGrant(GRANT.authorizationCode), okGrant(GRANT.refreshToken)]
    for (const g of grants) assert.doesNotThrow(() => w.register(g))
    assert.equal((await codeRequest(w)).status, HTTP_STATUS.ok)
    assert.equal(grants[0].calls.length, 1)
  })
  dt06('2', `a built-in grant (${GRANT_DISPATCH.builtIn.join(', ')}) throws TypeError`, (w) => {
    for (const g of GRANT_DISPATCH.builtIn) assert.throws(() => w.endpoint.register(okGrant(g)), TypeError)
  })
  dt06('3', 'an already-registered grant throws TypeError; the first stays registered', async (w) => {
    const first = okGrant(GRANT.authorizationCode)
    w.register(first)
    assert.throws(() => w.endpoint.register(okGrant(GRANT.authorizationCode)), TypeError)
    await codeRequest(w)
    assert.equal(first.calls.length, 1)
  })
  dt06('4', 'a grant outside grant_types_supported (password) throws TypeError', (w) => {
    assert.ok(!OAUTH_METADATA.authorizationServer.grant_types_supported.includes(FIXTURE.unsupportedGrant))
    assert.throws(() => w.endpoint.register(okGrant(FIXTURE.unsupportedGrant)), TypeError)
  })
}

// ---------------------------------------------------------------------------------------------
// State Transitions
// ---------------------------------------------------------------------------------------------

function stateTransitions(sdk) {
  // AUTH-ST-01 row 14 (C-PAIR's row).
  row(sdk, CASE.st01, '14', 'Off-Bound(X) → a token request with X: invalid_client, so pair is never reachable', async (w) => {
    const e = boundEntry(w, ID.x)
    w.tokens.disable(e.entryKey)
    assertError(await tokenRequest(w, { clientId: ID.x, secret: e.value }), OAUTH_ERROR.invalidClient)
  })

  // AUTH-ST-02: the access-token lifecycle; E1, the client X.
  const st02 = (n, title, fn) => row(sdk, CASE.st02, n, title, fn)
  st02('1', 'Pair-only → pair succeeds with it → Full (the same access token)', async (w) => {
    const e = w.tokens.add()
    const token = await issue(w, e, ID.x, SCOPE.pair)
    assert.equal(verify(w, token).scope, SCOPE.pair)
    w.pairs.bind(e.entryKey, ID.x)
    assert.deepEqual(callerOf(verify(w, token)), expectedCaller(w, e, ID.x))
  })
  st02('2', 'Pair-only → the entry is bound by another id → Pair-only-mismatch (still agent:pair, no principal key)', async (w) => {
    const e = w.tokens.add()
    const token = await issue(w, e, ID.x, SCOPE.pair)
    w.pairs.bind(e.entryKey, ID.y)
    assert.deepEqual(callerOf(verify(w, token)), expectedCaller(w, e, ID.x))
  })
  st02('3', 'Full and Pair-only → t ≥ t0 + 3600 → Expired (invalid_token)', async (w) => {
    const e = boundEntry(w, ID.x)
    for (const token of [await issue(w, e, ID.x, SCOPE.full), await issue(w, e, ID.y, SCOPE.pair)]) assert.deepEqual(verify(w, token, at(LIFETIME.accessTokenMs)), INVALID)
  })
  for (const [kind, revoke] of [['disabled', (w, e) => w.tokens.disable(e.entryKey)], ['deleted', (w, e) => w.tokens.remove(e.entryKey)]]) {
    st02(`4 (${kind})`, `any live token → the entry ${kind} → Invalid (invalid_token)`, async (w) => {
      const e = boundEntry(w, ID.x)
      const tokens = [await issue(w, e, ID.x, SCOPE.full), await issue(w, e, ID.y, SCOPE.pair)]
      revoke(w, e)
      for (const token of tokens) assert.deepEqual(verify(w, token), INVALID)
    })
  }
  st02('5', 'Invalid → the entry re-enabled → still Invalid; a new request with X is full', async (w) => {
    const e = boundEntry(w, ID.x)
    const old = await issue(w, e, ID.x, SCOPE.full)
    w.tokens.disable(e.entryKey)
    w.tokens.enable(e.entryKey)
    assert.deepEqual(verify(w, old), INVALID)
    const fresh = await issue(w, e, ID.x, SCOPE.full)
    assert.equal(verify(w, fresh).generation, w.tokens.get(e.entryKey).generation)
  })
  // AUTH-ST-02 '5 (value restored)' (AUTH-DT-04 rule 12) is withdrawn by design §5.9: a value never changes.
  st02('6', 'Expired (machine exchange) → refresh_token grant → still Expired: the endpoint sends the refresh grant\'s invalid_grant and issues nothing', async (w) => {
    const e = boundEntry(w, ID.x)
    const token = await issue(w, e, ID.x, SCOPE.full)
    w.register(refusingGrant(GRANT.refreshToken, OAUTH_ERROR.invalidGrant))
    w.clock.set(at(LIFETIME.accessTokenMs))
    assertError(await tokenRequest(w, { clientId: ID.x, secret: e.value, grant: GRANT.refreshToken, extra: [[FORM.refreshToken, token]] }), OAUTH_ERROR.invalidGrant)
    assert.deepEqual(verify(w, token), INVALID)
  })
  st02('7', 'Expired → client credentials again → a new token, Full or Pair-only by the pair state', async (w) => {
    const e = boundEntry(w, ID.x)
    await issue(w, e, ID.x, SCOPE.full)
    w.clock.set(at(LIFETIME.accessTokenMs))
    assert.equal(verify(w, await issue(w, e, ID.x, SCOPE.full)).scope, SCOPE.full)
    assert.equal(verify(w, await issue(w, e, ID.y, SCOPE.pair)).scope, SCOPE.pair)
  })
  st02('restart', 'any live token → connector restart → Invalid (in memory only, TQ-5); the pair is intact and a new token is full', async (w) => {
    const e = boundEntry(w, ID.x)
    const old = await issue(w, e, ID.x, SCOPE.full)
    await w.reopen()
    assert.deepEqual(verify(w, old), INVALID)
    await issue(w, e, ID.x, SCOPE.full)
  })
  storeRow(sdk, CASE.st02, '4 (store)', 'revokeEntry(entry, g) removes every access and refresh token issued below g, and keeps those issued at g', async (s) => {
    const entryKey = FIXTURE.entryKey(1)
    const access = (generation) => ({ entryKey, clientId: ID.x, audience: FIXTURE.foreignResource, generation, issuedAt: at() })
    s.store.putAccess(FIXTURE.digest(1), access(FIXTURE.firstGeneration))
    s.store.putAccess(FIXTURE.digest(2), access(FIXTURE.firstGeneration + 1))
    await s.store.putRefresh(FIXTURE.digest(3), refreshRecord(entryKey, FIXTURE.chain(1), FIXTURE.firstGeneration))
    await s.store.revokeEntry(entryKey, FIXTURE.firstGeneration + 1)
    assert.equal(s.store.getAccess(FIXTURE.digest(1)), undefined)
    assert.deepEqual({ ...s.store.getAccess(FIXTURE.digest(2)) }, access(FIXTURE.firstGeneration + 1))
    assert.equal(s.store.getRefresh(FIXTURE.digest(3)), undefined)
  })

  // AUTH-ST-04: C-OAUTH's parts: the per-client failure limit (row 7) and the code store (rows 11, 12).
  const key = (clientId = FIXTURE.cimd, remoteAddress = FIXTURE.address) => ({ remoteAddress, clientId })
  const fail = (limiter, k, times, now = at()) => { for (let i = 0; i < times; i += 1) limiter.recordFailure(k, now) }
  const st04 = (n, title, fn) => limiterRow(sdk, CASE.st04, n, title, fn)
  st04('7 (below)', `Pending, perKeyPerWindow − 1 (${FAILURE_LIMIT.perKeyPerWindow - 1}) failures → not limited`, (l) => {
    fail(l, key(), FAILURE_LIMIT.perKeyPerWindow - 1)
    assert.deepEqual(l.check(key(), at()), { limited: false })
  })
  st04('7 (reached)', `perKeyPerWindow (${FAILURE_LIMIT.perKeyPerWindow}) failures → limited, with a positive retryAfterMs within the window`, (l) => {
    fail(l, key(), FAILURE_LIMIT.perKeyPerWindow)
    const got = l.check(key(), at())
    assert.equal(got.limited, true)
    assert.ok(got.retryAfterMs > 0 && got.retryAfterMs <= FAILURE_LIMIT.windowMs, `retryAfterMs ${got.retryAfterMs}`)
  })
  st04('7 (released)', 'limited → retryAfterMs later → not limited (the window admits one more)', (l) => {
    fail(l, key(), FAILURE_LIMIT.perKeyPerWindow)
    const { retryAfterMs } = l.check(key(), at())
    assert.deepEqual(l.check(key(), at(retryAfterMs)), { limited: false })
  })
  st04('7 (still limited)', 'limited → just before the window passes → still limited', (l) => {
    fail(l, key(), FAILURE_LIMIT.perKeyPerWindow)
    assert.equal(l.check(key(), at(FAILURE_LIMIT.windowMs - FIXTURE.justUnderMs)).limited, true)
  })
  st04('7 (other key)', 'one key limited → another client id from the same address is not limited', (l) => {
    fail(l, key(), FAILURE_LIMIT.perKeyPerWindow)
    assert.deepEqual(l.check(key(ID.x), at()), { limited: false })
    assert.deepEqual(l.check(key(FIXTURE.cimd, FIXTURE.otherAddress), at()), { limited: false })
  })
  st04('7 (address)', `perAddressPerWindow (${FAILURE_LIMIT.perAddressPerWindow}) failures over many client ids of one address → every key of that address is limited; another address is not`, (l) => {
    const perKey = FAILURE_LIMIT.perKeyPerWindow - 1
    const keys = Math.ceil(FAILURE_LIMIT.perAddressPerWindow / perKey)
    let left = FAILURE_LIMIT.perAddressPerWindow
    for (let i = 0; i < keys; i += 1) { fail(l, key(`${ID.x}${i}`), Math.min(perKey, left)); left -= Math.min(perKey, left) }
    assert.equal(l.check(key(ID.y), at()).limited, true)
    assert.deepEqual(l.check(key(ID.y, FIXTURE.otherAddress), at()), { limited: false })
  })
  st04('7 (address below)', 'perAddressPerWindow − 1 failures over many client ids of one address → a fresh key is not limited', (l) => {
    const perKey = FAILURE_LIMIT.perKeyPerWindow - 1
    let left = FAILURE_LIMIT.perAddressPerWindow - 1
    for (let i = 0; left > 0; i += 1) { fail(l, key(`${ID.x}${i}`), Math.min(perKey, left)); left -= Math.min(perKey, left) }
    assert.deepEqual(l.check(key(ID.y), at()), { limited: false })
  })
  st04('7 (bearer key)', 'an MCP bearer\'s key (the address alone, no clientId) is limited by its own failures', (l) => {
    const bare = { remoteAddress: FIXTURE.address }
    fail(l, bare, FAILURE_LIMIT.perKeyPerWindow)
    assert.equal(l.check(bare, at()).limited, true)
  })
  // Re-baselined by X-SEC X-03 (C-WIRE-2): a valid credential is never refused by the failure limit; a
  // failing one while limited is the 429, uncounted (K1 FAILURE_LIMIT, amending S7b P2).
  row(sdk, CASE.st04, '7 (shared)', 'the limiter is shared: failures another surface records for (address, id) make the next FAILING request 429; a valid one is served (X-03)', async (w) => {
    const e = w.tokens.add()
    await issue(w, e, ID.agentA, SCOPE.pair)
    fail(w.limiter, key(ID.agentA, w.remoteAddresses.at(-1)), FAILURE_LIMIT.perKeyPerWindow, w.clock.now())
    assertLimited(await tokenRequest(w, { clientId: ID.agentA, secret: FIXTURE.value() }))
    await issue(w, e, ID.agentA, SCOPE.pair)
  })
  row(sdk, CASE.st04, '7 (counted)', 'the endpoint counts each invalid_client on (address, client id): after perKeyPerWindow of them a wrong secret is 429 and not counted again; the right secret is served (X-03)', async (w) => {
    const e = w.tokens.add()
    for (let i = 0; i < FAILURE_LIMIT.perKeyPerWindow; i += 1) assertError(await tokenRequest(w, { clientId: ID.agentA, secret: FIXTURE.value() }), OAUTH_ERROR.invalidClient)
    const wait = assertLimited(await tokenRequest(w, { clientId: ID.agentA, secret: FIXTURE.value() }))
    assert.deepEqual(w.limiter.check(key(ID.agentA, w.remoteAddresses.at(-1)), w.clock.now() + wait), { limited: false }, 'the limited request was counted')
    await issue(w, e, ID.agentA, SCOPE.pair)
  })
  const code = Object.freeze({ entryKey: FIXTURE.entryKey(1), clientId: FIXTURE.cimd, redirectUri: FIXTURE.cimd, codeChallenge: FIXTURE.digest(9), audience: FIXTURE.foreignResource, issuedAt: at() })
  storeRow(sdk, CASE.st04, '11 (store)', 'CodeIssued → takeCode → Redeemed: the record once; a second take is undefined', (s) => {
    s.store.putCode(FIXTURE.digest(1), code)
    assert.deepEqual({ ...s.store.takeCode(FIXTURE.digest(1)) }, code)
    assert.equal(s.store.takeCode(FIXTURE.digest(1)), undefined)
  })
  storeRow(sdk, CASE.st04, '12 (store)', 'any → connector restart → codes are gone (memory only)', async (s) => {
    s.store.putCode(FIXTURE.digest(1), code)
    await s.reopen()
    assert.equal(s.store.takeCode(FIXTURE.digest(1)), undefined)
  })

  // AUTH-ST-05: the token store's side of a refresh chain (the grant itself is C-OAUTH-WEB's).
  // K1d (R-OA-23): no chain ends by age, so `chainsOf` and `RefreshRecord.chainStartedAt` are
  // withdrawn; the rows that asked `chainsOf` (none, 1, 3, 8, 8b, 10, 11, 11 (restart), 12b, 12c,
  // 12d, "chains of another entry") now ask what the store holds. Withdrawn outright: 10, 11,
  // 11 (restart), 12c, 12d (store) and "none", which only meant a chain state; their "no age" and
  // reconnect rows are AUTH-BVA-11 / AUTH-ST-05 in chain-cases.mjs and oauth-web.
  const E = FIXTURE.entryKey(1)
  const G = FIXTURE.firstGeneration
  const st05 = (n, title, fn) => storeRow(sdk, CASE.st05, n, title, fn)
  /** Chain(RT1 live): chain `n` of entry `entryKey` under generation G. */
  const liveChain = (s, n = 1, entryKey = E) => s.store.putRefresh(FIXTURE.digest(n), refreshRecord(entryKey, FIXTURE.chain(n), G))
  const access = (chainId) => ({ entryKey: E, clientId: FIXTURE.cimd, audience: FIXTURE.foreignResource, generation: G, issuedAt: at(), chainId })
  st05('1 (store)', 'Chain(RT1 live): putRefresh of a K1d RefreshRecord (no chainStartedAt) → getRefresh returns exactly that record', async (s) => {
    const record = refreshRecord(E, FIXTURE.chain(1), G)
    await s.store.putRefresh(FIXTURE.digest(1), record)
    assert.deepEqual({ ...s.store.getRefresh(FIXTURE.digest(1)) }, record)
  })
  st05('3 (store)', 'Chain live → revokeChain → Revoked: its refresh and access tokens are gone, another chain\'s are kept', async (s) => {
    await liveChain(s)
    await liveChain(s, 2)
    s.store.putAccess(FIXTURE.digest(3), access(FIXTURE.chain(1)))
    s.store.putAccess(FIXTURE.digest(4), access(FIXTURE.chain(2)))
    await s.store.revokeChain(FIXTURE.chain(1))
    assert.equal(s.store.getRefresh(FIXTURE.digest(1)), undefined)
    assert.equal(s.store.getAccess(FIXTURE.digest(3)), undefined)
    assert.ok(s.store.getRefresh(FIXTURE.digest(2)), 'the other chain\'s refresh token was revoked')
    assert.ok(s.store.getAccess(FIXTURE.digest(4)), 'the other chain\'s access token was revoked')
  })
  st05('8 (store)', 'Chain(RTn live) → connector restart → the refresh record persists (its digest), access tokens are gone', async (s) => {
    const record = refreshRecord(E, FIXTURE.chain(1), G)
    await s.store.putRefresh(FIXTURE.digest(1), record)
    s.store.putAccess(FIXTURE.digest(2), access(FIXTURE.chain(1)))
    await s.reopen()
    assert.deepEqual({ ...s.store.getRefresh(FIXTURE.digest(1)) }, record)
    assert.equal(s.store.getAccess(FIXTURE.digest(2)), undefined)
  })
  st05('8b (store)', 'Chain live → the entry\'s generation moved on while down → revokeEntry with the new generation after the restart removes the chain', async (s) => {
    await liveChain(s)
    await s.reopen()
    await s.store.revokeEntry(E, G + 1)
    assert.equal(s.store.getRefresh(FIXTURE.digest(1)), undefined)
  })
  st05('12b (store)', 'a chain revoked by reuse (revokeChain) stays revoked after a restart', async (s) => {
    await liveChain(s)
    await s.store.revokeChain(FIXTURE.chain(1))
    await s.reopen()
    assert.equal(s.store.getRefresh(FIXTURE.digest(1)), undefined)
  })
  st05('chains of another entry', 'revokeEntry of one entry never touches another entry\'s chain', async (s) => {
    await liveChain(s, 1, FIXTURE.entryKey(2))
    await s.store.revokeEntry(E, G + 1)
    assert.ok(s.store.getRefresh(FIXTURE.digest(1)), 'another entry\'s chain was revoked')
  })
}

/** A refresh record of K1d's shape (`RefreshRecord`: no `chainStartedAt`, K1d-5) for the store rows. */
export function refreshRecord(entryKey, chainId, generation) {
  return { chainId, entryKey, clientId: FIXTURE.cimd, audience: FIXTURE.foreignResource, generation }
}

export function registerCOAuthCases(sdk) {
  useCases(sdk)
  equivalencePartitions(sdk)
  boundaryValues(sdk)
  decisionTables(sdk)
  stateTransitions(sdk)
}
