/**
 * C-OAUTH-WEB black-box cases (v3-tasks.md row C-OAUTH-WEB, wave W2): the approval listener, the
 * approval page, CIMD, PKCE, the `authorization_code` and `refresh_token` grants. The rows of the
 * old typed-id and chain-renewal model are rewritten to K1d's page id (C-PAGE-ID: the id is the
 * request's `agent_id`, a reconnect keeps the principal, no chain ends by age; R-OA-22, R-OA-23;
 * PAGE-ID-USE-CASES.md); the new C-PAGE-ID rows are page-id-cases.mjs. Cases from docs/test-design/v3/01-auth-pairing.md and 09-standalone-remote.md
 * that the row names: AUTH-UC-10, AUTH-DT-07, AUTH-DT-08, AUTH-DT-09, AUTH-ST-04, AUTH-ST-05,
 * AUTH-BVA-07, AUTH-BVA-08, AUTH-EP-08, AUTH-EP-10, plus K1b-DT-07 (the K1b todo row that named
 * C-OAUTH-WEB). Requirements R-OA-11…16, R-OA-17, R-OA-20, R-REM-05, R-ID-13; design §5.5a; K1
 * `OAuthTokenStore`, `FailureLimiter`, `PairStore`, `TokenRegistry`; K1b `RequestGate`, `GrantHandler`.
 *
 * Techniques, and only these, in this order: Use Case (each test names its flow: main step,
 * A<n>, E<n>, post), Equivalence Partitioning and Boundary Value Analysis (one test per row),
 * Decision Table (one per rule) and State Transition (one per transition row).
 *
 * Level: integration over fakes of every seam (fakes.mjs) with an injected clock, the page driven
 * by a scripted browser over a loopback listener (browser.mjs), the CIMD fetcher over a stubbed
 * resolver and transport (no network). The cases stand in for C-OAUTH's token endpoint by calling
 * the two GrantHandlers (subject.mjs `token`). Parts that need another task are `todo` naming it
 * (constants.mjs LATER).
 *
 * Oracles from the relayed decisions (Fishball, 2026-11-14; constants.mjs RELAYED and subject.mjs):
 * store keys are lowercase hex SHA-256; a browser access token's `clientId` is the bound fishball
 * id, a refresh record's the CIMD URL; a secret on `refresh_token` is `invalid_grant` and on
 * `authorization_code` `invalid_client`, both counted; a replayed code within its 60 s life
 * revokes the chain; each refresh compares the entry's generation; the decision body is capped at
 * 8 KiB (413, no body); pending requests and the CIMD cache hold 256 each, oldest evicted first; a
 * page render carries a fresh form nonce (masked before a byte comparison, browser.mjs `masked`).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { fields, forms, isRequired, masked, pageText } from './browser.mjs'
import {
  APPROVAL_LISTENER, CIMD_LIMITS, CLIENT_AUTH, CONNECTOR_STATUS, DOC, ENTRY_STATUS, FAILURE_LIMIT, FIXTURE, GATE_SURFACE, GRANT,
  HOSTS, HTTP_HEADER, HTTP_METHOD, HTTP_STATUS, ID_REFUSAL, LATER, LIFETIME, NAME_RULES, OAUTH_ERROR, PAGE_TEXT, PARAM, PATHS, PLAIN_METHOD,
  REFRESH_RECORD_MEMBERS, REFUSAL, RELAYED, REQUEST_GATE, SCOPE, STUB, SUBJECT, TIME_UNIT, oauthUrls,
} from './constants.mjs'
import {
  approvalListener, authorizeParams, cimdFetcher, digest, documentOf, freePort, holdPort, lockDefaultPort, pkce, probe, read,
  served, stalled, stubTransport, waitFor, webModule, webWorld,
} from './subject.mjs'
import { fakeClock } from './fakes.mjs'

const ID = FIXTURE.id
const NAME = FIXTURE.name
const E = FIXTURE.entry
const V = FIXTURE.value
const CASE = Object.freeze({
  uc10: 'AUTH-UC-10', dt07: 'AUTH-DT-07', dt08: 'AUTH-DT-08', dt09: 'AUTH-DT-09', st04: 'AUTH-ST-04', st05: 'AUTH-ST-05',
  bva07: 'AUTH-BVA-07', bva08: 'AUTH-BVA-08', ep08: 'AUTH-EP-08', ep10: 'AUTH-EP-10', k1bDt07: 'K1b-DT-07',
})

// ---------------------------------------------------------------------------------------------
// Oracles and steps shared by the cases
// ---------------------------------------------------------------------------------------------

/** The fake clock: `offsetMs` after the reference instant. */
const at = (offsetMs = 0) => FIXTURE.t0 + offsetMs
const seconds = (s) => s * TIME_UNIT.msPerSecond
const lower = (text) => text.toLowerCase()
const textOf = (res) => lower(pageText(res.body))

/** The redirect a response carries: `{status, target, params}` (target = origin + path), or undefined. */
export function redirectOf(res) {
  const location = res.headers[HTTP_HEADER.location]
  if (location === undefined) return undefined
  const url = new URL(location)
  return { status: res.status, target: url.origin + url.pathname, params: Object.fromEntries(url.searchParams) }
}

/** One pending request: a fresh PKCE pair and the page `/authorize` answered. */
export async function open(w, { browser = w.browser(), overrides = {} } = {}) {
  const { verifier, challenge } = pkce()
  const res = await browser.open(PATHS.authorize, authorizeParams(w, challenge, overrides))
  return { b: browser, verifier, challenge, page: res }
}
/**
 * Opens a request and presses Authorize with `fill` (default: v(E5), no name). The id is not a
 * form field (R-OA-11, 1.32 R13): `fill.id` is the `agent_id` the request passes (default
 * agent-w-1, subject.mjs authorizeParams), `fill.id: undefined` passes none (the derived id).
 */
export async function approve(w, fill = {}, options = {}) {
  const { id, ...form } = fill
  const overrides = Object.hasOwn(fill, 'id') ? { [PARAM.agentId]: id, ...options.overrides } : options.overrides
  const flow = await open(w, { ...options, overrides })
  const res = await flow.b.authorize({ token: V(5), ...form })
  return { ...flow, res, redirect: redirectOf(res) }
}
/** C-OAUTH's token request for the code of `flow` (AUTH-UC-10 main step 6). */
export const redeem = (w, flow, overrides = {}, options = {}) => w.token({
  [PARAM.grantType]: GRANT.authorizationCode, [PARAM.code]: flow.redirect?.params[PARAM.code], [PARAM.redirectUri]: flow.redirectUri ?? FIXTURE.redirect,
  [PARAM.codeVerifier]: flow.verifier, [PARAM.clientId]: FIXTURE.clientId, [PARAM.resource]: w.urls.resource, ...overrides,
}, options)
/** C-OAUTH's `refresh_token` request. */
export const refresh = (w, rt, overrides = {}, options = {}) => w.token({
  [PARAM.grantType]: GRANT.refreshToken, [PARAM.refreshToken]: rt, [PARAM.clientId]: FIXTURE.clientId, [PARAM.resource]: w.urls.resource, ...overrides,
}, options)

/**
 * The state a redirect must echo: FIXTURE.state unless the caller names `state`. A default
 * parameter cannot do this, because it also applies to an explicit `{state: undefined}`, which
 * here means "no state was sent, none comes back" (R-OA-14, AUTH-DT-07 row 11, AUTH-UC-10 A2).
 */
const expectedState = (options) => (Object.hasOwn(options, 'state') ? options.state : FIXTURE.state)

/** A success redirect to `target` with a code, the issuer and the state (R-OA-14, R-OA-12 (4)). */
export function assertCode(w, flow, options = {}) {
  const { target = FIXTURE.redirect } = options
  const state = expectedState(options)
  assert.ok(flow.redirect, `no redirect; page says: ${pageText(flow.res.body)}`)
  assert.equal(flow.redirect.status, APPROVAL_LISTENER.redirectStatus, 'the redirect after the form is 303')
  assert.equal(flow.redirect.target, target)
  assert.equal(typeof flow.redirect.params[PARAM.code], 'string')
  assert.ok(flow.redirect.params[PARAM.code].length > 0)
  assert.equal(flow.redirect.params[PARAM.iss], w.urls.issuer)
  assert.equal(flow.redirect.params[PARAM.state], state)
}
/** A redirected OAuth error (R-OA-14, R-OA-15): `error`, `iss`, `state` if sent, and no code. */
export function assertRedirectedError(w, res, error, options = {}) {
  const { target = FIXTURE.redirect } = options
  const state = expectedState(options)
  const r = redirectOf(res)
  assert.ok(r, `expected a redirect with ${error}; page says: ${pageText(res.body)}`)
  assert.equal(r.target, target)
  assert.equal(r.params[PARAM.error], error)
  assert.equal(r.params[PARAM.iss], w.urls.issuer)
  assert.equal(r.params[PARAM.state], state)
  assert.equal(r.params[PARAM.code], undefined)
}
/** An answer shown on the page, never redirected, carrying `text` (case-insensitive). */
export function assertOnPage(res, ...texts) {
  assert.equal(res.headers[HTTP_HEADER.location], undefined, 'shown on the page, never redirected')
  for (const text of texts) assert.ok(textOf(res).includes(lower(text)), `page lacks "${text}": ${pageText(res.body)}`)
}
/** An error page for an invalid client or redirect: no redirect and no token form (R-OA-14). */
function assertPageError(res) {
  assert.equal(res.headers[HTTP_HEADER.location], undefined, 'never redirected')
  assert.ok(res.status >= HTTP_STATUS.badRequest, `an error status, got ${res.status}`)
  assert.equal(forms(res.body).flatMap((f) => fields(f).passwords).length, 0, 'no token field for an invalid request')
}
/** The page itself (AUTH-DT-07 rule 1): 200, the frozen headers, one masked token field. */
export function assertPageShown(res) {
  assert.equal(res.status, HTTP_STATUS.ok, `page not shown: ${pageText(res.body)}`)
  assertPageHeaders(res)
  assert.equal(forms(res.body).flatMap((f) => fields(f).passwords).length, 1, 'one token field')
}
/** R-OA-11, R-OA-12: the page's response headers (APPROVAL_LISTENER.headers). */
function assertPageHeaders(res) {
  for (const [name, value] of Object.entries(APPROVAL_LISTENER.headers)) assert.equal(res.headers[name], value, `page header ${name}`)
}
/** A GrantResult refusal with `error`. */
export function assertGrantError(result, error) {
  assert.equal(result.ok, false, `expected ${error}, got ${JSON.stringify(result)}`)
  assert.equal(result.error, error)
}
/** A GrantResult success: `scope: fishball`, 3600 s, a refresh token (R-OA-14, R-OA-16). */
export function assertGrantOk(result) {
  assert.equal(result.ok, true, `expected a token response, got ${JSON.stringify(result)}`)
  assert.equal(result.body.scope, SCOPE.full)
  assert.equal(result.body.expires_in, LIFETIME.accessTokenMs / TIME_UNIT.msPerSecond)
  assert.equal(typeof result.body.access_token, 'string')
  assert.equal(typeof result.body.refresh_token, 'string')
  return result.body
}
const sawCall = (w, name, arg) => w.store.calls.some(([n, a]) => n === name && (arg === undefined || a === arg))
/** Every pair as plain data, to show a refusal changed nothing. */
export const snapshot = (w) => JSON.parse(JSON.stringify(w.pairs.list()))
/** No entry value appears anywhere the connector wrote or answered (R-OA-12, R-TOK-00). */
export function assertNoLeak(w, ...values) {
  const haystacks = [
    ...w.browsers.flatMap((b) => b.responses.map((r) => `${r.path}\n${JSON.stringify(r.headers)}\n${r.body}`)),
    ...w.logger.lines.map((l) => l.text),
    JSON.stringify(w.store.calls), JSON.stringify(w.store.persisted()), JSON.stringify(w.limiter.failures), JSON.stringify(w.limiter.checks),
    JSON.stringify(w.pairs.calls), JSON.stringify(w.cimd.calls ?? []), JSON.stringify(w.gate.calls), JSON.stringify(w.tokenResults),
  ]
  for (const value of values) assert.equal(haystacks.filter((h) => h.includes(value)).length, 0, 'a token value leaked')
}

/** A browser chain on E5: bound to agent-w-1 at `at()`, code redeemed. Returns the first token response. */
export async function chain(w, { redirectUri } = {}) {
  if (w.tokens.get(E(5)) === undefined) w.tokens.add(5, V(5))
  const flow = await approve(w, {}, redirectUri === undefined ? {} : { overrides: { [PARAM.redirectUri]: redirectUri } })
  assertCode(w, flow, redirectUri === undefined ? {} : { target: redirectUri })
  const first = assertGrantOk(await redeem(w, { ...flow, redirectUri }))
  const record = w.store.getRefresh(digest(first.refresh_token))
  assert.ok(record, 'the refresh token is stored by its lowercase hex SHA-256 digest')
  return { flow, first, rt: first.refresh_token, chainId: record.chainId }
}

/** One case test on a fresh world; `todo` (a LATER owner) registers a todo instead. */
export function row(sdk, id, part, title, fn, todo, options) {
  caseTest(sdk, id, part, title, todo === undefined ? async (t) => fn(await webWorld(t, sdk, options?.(t)), t) : null, todo)
}
const todo = (sdk, id, part, title, owner) => row(sdk, id, part, title, null, owner)
/** A case on the module alone (no world). */
export const plain = (sdk, id, part, title, fn) => caseTest(sdk, id, part, title, async (t) => fn(await webModule(sdk), t))

// ---------------------------------------------------------------------------------------------
// Use Cases
// ---------------------------------------------------------------------------------------------

function useCases(sdk) {
  const uc = (part, title, fn, owner) => row(sdk, CASE.uc10, part, title, fn, owner)

  todo(sdk, CASE.uc10, 'main step 1', 'the client\'s 401, both metadata documents with client_id_metadata_document_supported, S256 and authorization_endpoint on the approval listener', LATER.metadata)
  uc('main step 2', 'the connector fetches the client\'s CIMD for /authorize and shows the page', async (w) => {
    const flow = await open(w)
    assert.deepEqual(w.cimd.calls, [FIXTURE.clientId])
    assertPageShown(flow.page)
  })
  uc('main step 3', 'the page shows the client (unverified), redirect host, warning, client-id host, this DSH, its MCP URI, rights, fields and controls; no login', async (w) => {
    const { page } = await open(w)
    assertOnPage(page, FIXTURE.clientName, PAGE_TEXT.unverified, FIXTURE.loopback, PAGE_TEXT.localhost, new URL(FIXTURE.clientId).host,
      STUB.dshName, w.urls.resource, PAGE_TEXT.fullRights, PAGE_TEXT.oneAgent)
    const form = forms(page.body).find((f) => fields(f).token !== undefined)
    const { token, name, texts, passwords } = fields(form)
    assert.equal(passwords.length, 1, 'one masked field: the token; no password or ticket field')
    assert.equal(token.autocomplete, RELAYED.tokenAutocomplete, 'no autofill (R-OA-11)')
    assert.ok(!token.value, 'the token field is never echoed')
    // 1.32 R13: the page asks for a name, not an id; the id comes with the request (R-OA-22).
    assert.equal(texts.length, 1, 'one text field, the name: no id field')
    assert.ok(name && !isRequired(name), 'an optional name field')
    assert.ok(!name.value, 'client_name is only a hint, never a default value')
    assert.ok(w.browsers[0].control(PAGE_TEXT.authorize) && w.browsers[0].control(PAGE_TEXT.cancel), 'Authorize and Cancel')
    assertPageHeaders(page)
  })
  uc('main steps 4–5', 'v(E5), no name, agent_id agent-w-1 in the request → E5 bound to agent-w-1 with the client recorded, no name, pairedAt; 303 with code, state, iss', async (w) => {
    w.tokens.add(5, V(5))
    w.clock.set(at(seconds(1)))
    const flow = await approve(w)
    assertCode(w, flow)
    const pair = w.pairs.pairOf(E(5))
    assert.deepEqual({ id: pair.id, name: pair.name, pairedAt: pair.pairedAt, clientIdUrl: pair.clientIdUrl, redirectUri: pair.redirectUri },
      { id: ID.agentW, name: null, pairedAt: at(seconds(1)), clientIdUrl: FIXTURE.clientId, redirectUri: FIXTURE.redirect })
  })
  todo(sdk, CASE.uc10, 'main step 5 (display)', 'E5\'s principal reads ID: agent-w-1 wherever it is shown (R-NAME-08)', LATER.marks)
  uc('main step 6', 'the code with verifier, redirect, client_id and resource → scope fishball, 3600 s, a refresh token; the AT is the bound id\'s, audience-bound; no pair call', async (w) => {
    const c = await chain(w)
    const access = w.store.getAccess(digest(c.first.access_token))
    assert.ok(access, 'the access token is stored by its lowercase hex SHA-256 digest')
    assert.deepEqual({ entryKey: access.entryKey, clientId: access.clientId, audience: access.audience, chainId: access.chainId },
      { entryKey: E(5), clientId: ID.agentW, audience: w.urls.resource, chainId: c.chainId })
    const record = w.store.getRefresh(digest(c.rt))
    assert.deepEqual({ entryKey: record.entryKey, clientId: record.clientId, audience: record.audience },
      { entryKey: E(5), clientId: FIXTURE.clientId, audience: w.urls.resource })
    assert.equal(w.pairs.calls.filter(([n]) => n === 'pair').length, 0, 'no pair call')
  })
  todo(sdk, CASE.uc10, 'main step 6 (MCP)', 'MCP calls succeed at full power with that access token', LATER.mcp)
  uc('main step 7', 'an hour later the refresh token gives a new AT and a new RT; concurrent refreshes within 10 s all get the identical successor', async (w) => {
    const c = await chain(w)
    w.clock.set(at(LIFETIME.accessTokenMs))
    const results = await Promise.all(FIXTURE.concurrentOffsetsMs.map((ms) => refresh(w, c.rt, {}, { now: at(LIFETIME.accessTokenMs + ms) })))
    const next = assertGrantOk(results[0])
    assert.notEqual(next.refresh_token, c.rt)
    assert.notEqual(next.access_token, c.first.access_token)
    for (const r of results) assert.deepEqual(r, results[0])
  })
  uc('A1', 'Cancel → 303 with access_denied, iss, state; E5 stays unpaired', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    const res = await flow.b.cancel()
    assert.equal(res.status, APPROVAL_LISTENER.redirectStatus)
    assertRedirectedError(w, res, OAUTH_ERROR.accessDenied)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  uc('A2', 'no state → still valid; the response carries no state', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await approve(w, {}, { overrides: { [PARAM.state]: undefined } })
    assertCode(w, flow, { state: undefined })
    assert.equal(Object.hasOwn(flow.redirect.params, PARAM.state), false)
  })
  uc('A6', 'every response to the redirect carries iss; after Authorize or Cancel it is a 303 with no token value', async (w) => {
    w.tokens.add(5, V(5))
    w.tokens.add(6, V(6))
    const granted = await approve(w)
    const cancelled = await open(w)
    const denied = await cancelled.b.cancel()
    const error = await open(w, { overrides: { [PARAM.responseType]: GRANT.authorizationCode } })
    for (const res of [granted.res, denied, error.page]) assert.equal(redirectOf(res).params[PARAM.iss], w.urls.issuer)
    for (const res of [granted.res, denied]) assert.equal(res.status, APPROVAL_LISTENER.redirectStatus)
    assertNoLeak(w, V(5), V(6))
  })
  uc('A3', 'another person holding v(E5), in another browser, authorizes the same way (the token is the proof)', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await approve(w, {}, { browser: w.browser() })
    assertCode(w, flow)
    assert.equal(w.pairs.pairOf(E(5)).id, ID.agentW)
  })
  uc('A4', 'the user also types the free name Watcher → the principal is named Watcher', async (w) => {
    w.tokens.add(5, V(5))
    assertCode(w, await approve(w, { name: NAME.watcher }))
    assert.equal(w.pairs.pairOf(E(5)).name, NAME.watcher)
  })
  uc('A5', 'a loopback redirect on another port (127.0.0.1:50123/cb for :7777/cb) is accepted and used', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await approve(w, {}, { overrides: { [PARAM.redirectUri]: FIXTURE.redirectOtherPort } })
    assertCode(w, flow, { target: FIXTURE.redirectOtherPort })
    assertGrantOk(await redeem(w, { ...flow, redirectUri: FIXTURE.redirectOtherPort }))
  })
  // A7 was the renewal of a chain ended by its 365-day lifetime (R-OA-16 (7)), withdrawn by
  // R-OA-23; it is now the reconnect of R-OA-22 (Q-A2 A), with no age or chain condition.
  uc('A7', 'reconnect: the bound client opens the page again with agent-w-1 and enters v(E5) → a code; the same principal, nothing re-bound', async (w) => {
    await chain(w)
    const before = w.pairs.pairOf(E(5))
    w.clock.advance(seconds(1))
    const flow = await approve(w)
    assertCode(w, flow)
    assertGrantOk(await redeem(w, flow))
    const after = w.pairs.pairOf(E(5))
    assert.deepEqual(after, before, 'same principal, id, name, pairedAt and client')
    assert.equal(w.pairs.calls.filter(([n]) => n === 'bindFromPage').length, 1, 'nothing re-bound')
    assert.ok(w.pairs.calls.some(([n, entryKey, id]) => n === 'reconnectFromPage' && entryKey === E(5) && id === ID.agentW), 'reconnected through PairStore.reconnectFromPage')
  })
  uc('E1', 'a wrong, a disabled and a deleted value → one uniform "not valid"; the request stays pending; each attempt counted', async (w) => {
    w.tokens.add(5, V(5))
    w.tokens.add(6, V(6))
    w.tokens.disable(6)
    w.tokens.add(7, V(7))
    w.tokens.remove(7)
    const flow = await open(w)
    for (const [n, value] of [[1, V(1)], [2, V(6)], [3, V(7)]]) {
      assertOnPage(await flow.b.authorize({ token: value }), PAGE_TEXT.invalid)
      assert.equal(w.limiter.failures.length, n)
    }
    assert.deepEqual(w.limiter.failures.map((f) => f.key.clientId), [FIXTURE.clientId, FIXTURE.clientId, FIXTURE.clientId], 'keyed by the CIMD URL')
    const res = await flow.b.authorize({ token: V(5) })
    assertCode(w, { res, redirect: redirectOf(res) })
  })
  uc('E2', 'v(E5) already paired → already-paired on the page: "create a new token", the bound name and last-seen; nothing changes', async (w) => {
    w.tokens.add(5, V(5))
    await w.pairs.pair(E(5), ID.machine, NAME.watcher, at())
    const before = snapshot(w)
    const flow = await approve(w)
    assertOnPage(flow.res, PAGE_TEXT.createNew, NAME.watcher)
    assert.deepEqual(snapshot(w), before)
  })
  uc('E2a', 'agent_id agent-w-1 held → id-taken; agent.w → id-invalid; the held name Fishball → name-taken; E5 stays unpaired, each request pending', async (w) => {
    w.tokens.add(1, V(1))
    w.tokens.add(5, V(5))
    await w.pairs.pair(E(1), ID.agentW, NAME.fishball, at())
    for (const [fill, code] of [[{ id: ID.agentW }, REFUSAL.idTaken], [{ id: ID.dotted }, ID_REFUSAL.idInvalid], [{ id: ID.other, name: NAME.fishball }, REFUSAL.nameTaken]]) {
      const flow = await approve(w, fill)
      assertOnPage(flow.res, code)
      assert.equal(w.pairs.pairOf(E(5)), undefined)
      // Pending: Cancel still answers the client with access_denied (R-OA-15).
      assertRedirectedError(w, await flow.b.cancel(), OAUTH_ERROR.accessDenied)
    }
    const flow = await approve(w, { id: ID.other })
    assertCode(w, flow)
  })
  uc('E3', 'the request waits 10 min → Authorize shows "this request has expired, start again from your agent"', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    w.clock.set(at(LIFETIME.pendingRequestMs))
    assertOnPage(await flow.b.authorize({ token: V(5) }), PAGE_TEXT.expired)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  uc('E4', 'a cross-site POST (other origin) and a replayed form value are refused; nothing bound', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    const cross = await flow.b.authorize({ token: V(5) }, { origin: `${HOSTS.remoteScheme}//evil.example` })
    assert.equal(cross.status, HTTP_STATUS.forbidden)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
    const captured = flow.b.formBody(PAGE_TEXT.authorize, { token: V(5) })
    await flow.b.cancel()
    const replay = await flow.b.post(captured)
    assert.equal(redirectOf(replay)?.params[PARAM.code], undefined, 'no code from a replayed form')
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  uc('E5', 'the connector restarts with a request pending → the request is gone', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    const captured = flow.b.formBody(PAGE_TEXT.authorize, { token: V(5) })
    await w.restart()
    const res = await flow.b.post(captured)
    assert.equal(redirectOf(res)?.params[PARAM.code], undefined)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  uc('post', 'E5 paired with its client-id URL; no entry created by the page; v(E5) in no URL, redirect, code, page, response or log; pages no-store', async (w) => {
    w.tokens.add(5, V(5))
    const entries = w.tokens.list().length
    const c = await chain(w)
    await refresh(w, c.rt, {}, { now: at(seconds(1)) })
    assert.equal(w.pairs.pairOf(E(5)).clientIdUrl, FIXTURE.clientId)
    assert.equal(w.tokens.list().length, entries)
    for (const b of w.browsers) for (const r of b.responses) if (r.headers[HTTP_HEADER.location] === undefined) assertPageHeaders(r)
    assertNoLeak(w, V(5))
  })
  todo(sdk, CASE.uc10, 'post (settings)', 'native settings show E5 paired with its client-id URL; disable, re-enable and delete work', LATER.wire)
  todo(sdk, CASE.uc10, 'end to end', 'the DSH SDK client on both SDKs and the Python MCP client authorize and cancel against the wired connector', LATER.wire)
}

// ---------------------------------------------------------------------------------------------
// Equivalence Partitioning
// ---------------------------------------------------------------------------------------------

/** A public resolver unless `answers[hostname]` says otherwise; records each lookup. */
export function resolver(answers = {}) {
  const calls = []
  const resolve = async (hostname) => { calls.push(hostname); return answers[hostname] ?? [FIXTURE.publicAddress] }
  resolve.calls = calls
  return resolve
}
const docText = (clientId = FIXTURE.clientId) => JSON.stringify(documentOf(clientId))

function equivalencePartitions(sdk) {
  // AUTH-EP-08: the CIMD fetch limits (R-OA-13), over a stubbed resolver and transport.
  const ep08 = (n, title, fn) => plain(sdk, CASE.ep08, n, title, fn)
  const refused = async (mod, clientId, resolve, transport = stubTransport(() => served(docText(clientId)))) => {
    const result = await cimdFetcher(mod, { resolve, transport, now: fakeClock(FIXTURE.t0).now }).fetch(clientId)
    assert.equal(result.ok, false, `${clientId} fetched: ${JSON.stringify(result)}`)
    return transport
  }
  ep08('1', 'a public https host → fetched, connecting to the resolved address', async (mod) => {
    const transport = stubTransport(() => served(docText()))
    const result = await cimdFetcher(mod, { resolve: resolver(), transport, now: fakeClock(FIXTURE.t0).now }).fetch(FIXTURE.clientId)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(result.doc, documentOf(FIXTURE.clientId))
    assert.equal(transport.calls.length, 1)
    assert.ok(transport.calls[0].addresses.includes(FIXTURE.publicAddress))
  })
  ep08('2', '127.0.0.1, ::1, localhost → refused before connecting', async (mod) => {
    for (const clientId of FIXTURE.loopbackClientIds) {
      const transport = await refused(mod, clientId, resolver({ localhost: FIXTURE.privateAddresses.loopback }))
      assert.equal(transport.calls.length, 0, `${clientId}: connected`)
    }
  })
  for (const [part, cls, addresses] of [['3', 'RFC 1918', FIXTURE.privateAddresses.rfc1918], ['3', 'link-local', FIXTURE.privateAddresses.linkLocal], ['3', 'unique-local', FIXTURE.privateAddresses.uniqueLocal], ['3', 'loopback after resolution', FIXTURE.privateAddresses.loopback]]) {
    ep08(part, `a name resolving to ${cls} (${addresses.join(', ')}) → refused, never connected`, async (mod) => {
      for (const address of addresses) {
        const transport = await refused(mod, FIXTURE.clientId, resolver({ [new URL(FIXTURE.clientId).hostname]: [address] }))
        assert.equal(transport.calls.length, 0, `${address}: connected`)
      }
    })
  }
  ep08('3', 'one private address among public ones → refused', async (mod) => {
    await refused(mod, FIXTURE.clientId, resolver({ [new URL(FIXTURE.clientId).hostname]: [FIXTURE.publicAddress, FIXTURE.privateAddresses.rfc1918[0]] }))
  })
  for (const [form, address] of RELAYED.embeddedIpv4) {
    ep08('3 (embedded IPv4)', `an IPv6 address embedding IPv4, ${form} (${address}) → refused`, async (mod) => {
      const transport = await refused(mod, FIXTURE.clientId, resolver({ [new URL(FIXTURE.clientId).hostname]: [address] }))
      assert.equal(transport.calls.length, 0)
    })
  }
  ep08('4', 'a public name that redirects to a private address → refused; the target is never fetched', async (mod) => {
    const transport = await refused(mod, FIXTURE.clientId, resolver(), stubTransport(() => ({ ...served(''), status: STUB.found, headers: { [HTTP_HEADER.location]: FIXTURE.redirectTarget } })))
    assert.deepEqual(transport.calls.map((c) => c.url), [FIXTURE.clientId])
  })
  ep08('5', 'an http: client id → refused, never connected', async (mod) => {
    const transport = await refused(mod, FIXTURE.badClientIds[0], resolver())
    assert.equal(transport.calls.length, 0)
  })
  ep08('6', 'a body over 5 KiB → refused', async (mod) => {
    const big = docText().padEnd(CIMD_LIMITS.maxBytes + 1, ' ')
    await refused(mod, FIXTURE.clientId, resolver(), stubTransport(() => served(big)))
  })
  ep08('6', 'a body slower than the time bound → refused within the bound', async (mod) => {
    const started = Date.now()
    await refused(mod, FIXTURE.clientId, resolver(), stubTransport(() => (signal) => stalled(signal)))
    assert.ok(Date.now() - started <= CIMD_LIMITS.timeoutMs + FIXTURE.timeoutMarginMs, 'the fetch outlived its time bound')
  })
  ep08('6a', 'the document\'s host answers with a redirect → refused (no redirect followed)', async (mod) => {
    const transport = await refused(mod, FIXTURE.clientId, resolver(), stubTransport(() => ({ ...served(''), status: STUB.found, headers: { [HTTP_HEADER.location]: FIXTURE.otherClientId } })))
    assert.equal(transport.calls.length, 1)
  })
  ep08('6b', 'a client-id URL with a dot segment, fragment or userinfo → refused', async (mod) => {
    for (const clientId of FIXTURE.unparsedClientIds) {
      const transport = await refused(mod, clientId, resolver())
      assert.equal(transport.calls.length, 0, `${clientId}: fetched`)
    }
  })
  ep08('6c', 'a failed fetch is not cached: the next request fetches again', async (mod) => {
    const transport = stubTransport((url, n) => (n === 1 ? served('', { status: STUB.serverError }) : served(docText())))
    const fetcher = cimdFetcher(mod, { resolve: resolver(), transport, now: fakeClock(FIXTURE.t0).now })
    assert.equal((await fetcher.fetch(FIXTURE.clientId)).ok, false)
    assert.equal((await fetcher.fetch(FIXTURE.clientId)).ok, true)
    assert.equal(transport.calls.length, 2)
  })
  ep08('7', 'max-age=60, a second request at 30 s → served from the cache, no fetch', async (mod) => {
    const clock = fakeClock(FIXTURE.t0)
    const transport = stubTransport(() => served(docText(), { headers: { [HTTP_HEADER.cacheControl]: `max-age=${FIXTURE.cacheMaxAgeS}` } }))
    const fetcher = cimdFetcher(mod, { resolve: resolver(), transport, now: clock.now })
    assert.equal((await fetcher.fetch(FIXTURE.clientId)).ok, true)
    clock.set(at(seconds(FIXTURE.cacheSecondAtS)))
    const again = await fetcher.fetch(FIXTURE.clientId)
    assert.deepEqual(again.doc, documentOf(FIXTURE.clientId))
    assert.equal(transport.calls.length, 1)
  })

  // AUTH-EP-10: behind the user's tunnel (R-REM-05). The tunnel is the Host the browser dials.
  const tunnel = `${HOSTS.remoteScheme}//${FIXTURE.tunnelHost}`
  const tunnelUrls = oauthUrls(tunnel)
  const trusted = () => ({ trustedHosts: [FIXTURE.tunnelHost] })
  const tunnelBrowser = (w) => w.browser({ host: FIXTURE.tunnelHost, scheme: HOSTS.remoteScheme })
  const ep10 = (n, title, fn, options) => row(sdk, CASE.ep10, n, title, fn, undefined, options)
  ep10('1', 'a trusted tunnel host: the page works under https://fb.example; iss and the canonical URI use it; the code redeems there', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await approve(w, {}, { browser: tunnelBrowser(w), overrides: { [PARAM.resource]: tunnelUrls.resource } })
    assert.equal(flow.redirect?.params[PARAM.iss], tunnelUrls.issuer, `page says: ${pageText(flow.res.body)}`)
    assertOnPage(flow.page, tunnelUrls.resource)
    const body = assertGrantOk(await redeem(w, flow, { [PARAM.resource]: tunnelUrls.resource }, { origin: tunnel }))
    assert.equal(w.store.getAccess(digest(body.access_token)).audience, tunnelUrls.resource)
  }, trusted)
  todo(sdk, CASE.ep10, '1 (DSH listener)', 'PRM, AS metadata and the token endpoint under https://fb.example, authorization_endpoint on the tunnel', LATER.metadata)
  ep10('2', 'a tunnel host not in --trusted-host → refused before authentication on the approval listener', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w, { browser: tunnelBrowser(w) })
    assert.equal(flow.page.status, HTTP_STATUS.forbidden)
    assert.deepEqual(w.cimd.calls, [], 'nothing processed')
  })
  todo(sdk, CASE.ep10, '2 (DSH listener)', 'the same refusal on DSH\'s listener', LATER.metadata)
  ep10('3', 'an AT issued under https://fb.example has that audience, not http://127.0.0.1', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await approve(w, {}, { browser: tunnelBrowser(w), overrides: { [PARAM.resource]: tunnelUrls.resource } })
    const body = assertGrantOk(await redeem(w, flow, { [PARAM.resource]: tunnelUrls.resource }, { origin: tunnel }))
    assert.notEqual(w.store.getAccess(digest(body.access_token)).audience, w.urls.resource)
  }, trusted)
  todo(sdk, CASE.ep10, '3 (MCP)', 'that AT used under http://127.0.0.1 → 401 (other canonical URI)', LATER.verifier)
  ep10('4', 'X-Forwarded-Proto: http from the tunnel is ignored: iss stays https', async (w) => {
    w.tokens.add(5, V(5))
    const b = tunnelBrowser(w)
    const { challenge } = pkce()
    const query = new URLSearchParams(authorizeParams(w, challenge, { [PARAM.resource]: tunnelUrls.resource })).toString()
    await b.send(HTTP_METHOD.get, `${PATHS.authorize}?${query}`, { headers: { [HTTP_HEADER.forwardedProto]: HOSTS.loopbackScheme.replace(':', '') } })
    const res = await b.authorize({ token: V(5) }, { headers: { [HTTP_HEADER.forwardedProto]: HOSTS.loopbackScheme.replace(':', '') } })
    assert.equal(redirectOf(res)?.params[PARAM.iss], tunnelUrls.issuer)
  }, trusted)
  todo(sdk, CASE.ep10, '5', 'only DSH\'s listener forwarded: machine exchange works, the page is unreachable (documented in the README)', LATER.docs)
  plain(sdk, CASE.ep10, '6', 'the module offers no tunnel, relay or exposure option', (mod) => {
    assert.deepEqual(Object.keys(mod).filter((name) => /tunnel|relay|expos/i.test(name)), [])
  })
  todo(sdk, CASE.ep10, '6 (settings)', 'the connector\'s settings hold no tunnel, relay or exposure setting', LATER.wire)
}

// ---------------------------------------------------------------------------------------------
// Boundary Value Analysis
// ---------------------------------------------------------------------------------------------

function boundaryValues(sdk) {
  // AUTH-BVA-07: code and request lifetimes (60 s, 10 min).
  for (const [n, offset, ok] of [['1', LIFETIME.codeMs - seconds(1), true], ['2', LIFETIME.codeMs, false], ['3', LIFETIME.codeMs + seconds(1), false]]) {
    row(sdk, CASE.bva07, n, `code redeemed at ${offset / TIME_UNIT.msPerSecond} s → ${ok ? 'AT' : 'invalid_grant'}`, async (w) => {
      w.tokens.add(5, V(5))
      const flow = await approve(w)
      const result = await redeem(w, flow, {}, { now: at(offset) })
      if (ok) assertGrantOk(result)
      else assertGrantError(result, OAUTH_ERROR.invalidGrant)
    })
  }
  for (const [n, offset, ok] of [['4', LIFETIME.pendingRequestMs - seconds(1), true], ['5', LIFETIME.pendingRequestMs, false], ['6', LIFETIME.pendingRequestMs + seconds(1), false]]) {
    row(sdk, CASE.bva07, n, `Authorize at ${offset / TIME_UNIT.msPerSecond} s after /authorize → ${ok ? 'code issued' : 'expired'}`, async (w) => {
      w.tokens.add(5, V(5))
      const flow = await open(w)
      w.clock.set(at(offset))
      const res = await flow.b.authorize({ token: V(5) })
      if (ok) assertCode(w, { res, redirect: redirectOf(res) })
      else { assertOnPage(res, PAGE_TEXT.expired); assert.equal(w.pairs.pairOf(E(5)), undefined) }
    })
  }

  // AUTH-BVA-08: the refresh grace window (10 s). RT1 spent at t = 0 (its spend), producing RT2.
  const grace = (n, title, fn) => row(sdk, CASE.bva08, n, title, async (w) => {
    const c = await chain(w)
    const spentAt = at(seconds(1))
    const successor = await refresh(w, c.rt, {}, { now: spentAt })
    assertGrantOk(successor)
    await fn(w, c, successor, spentAt)
  })
  const G = FIXTURE.graceProbeMs
  for (const [n, ms] of [['1', G.justAfter], ['2', G.justBefore]]) {
    grace(n, `RT1 again at ${ms / TIME_UNIT.msPerSecond} s → the identical successor (RT2 and its AT)`, async (w, c, successor, spentAt) => {
      assert.deepEqual(await refresh(w, c.rt, {}, { now: spentAt + ms }), successor)
      assert.equal(sawCall(w, 'revokeChain'), false)
    })
  }
  for (const [n, ms] of [['3', G.at], ['4', G.after]]) {
    grace(n, `RT1 again at ${ms / TIME_UNIT.msPerSecond} s → reuse: invalid_grant, chain revoked`, async (w, c, successor, spentAt) => {
      assertGrantError(await refresh(w, c.rt, {}, { now: spentAt + ms }), OAUTH_ERROR.invalidGrant)
      assert.ok(sawCall(w, 'revokeChain', c.chainId))
      assertGrantError(await refresh(w, successor.body.refresh_token, {}, { now: spentAt + ms }), OAUTH_ERROR.invalidGrant)
    })
  }
  grace('5', 'RT1 again at 5 s by another client_id → reuse: chain revoked', async (w, c, successor, spentAt) => {
    assert.equal((await refresh(w, c.rt, { [PARAM.clientId]: FIXTURE.otherClientId }, { now: spentAt + G.middle })).ok, false)
    assert.ok(sawCall(w, 'revokeChain', c.chainId))
  })
  grace('6', '3 concurrent presentations at 0.1–0.3 s → all the identical successor; the chain intact', async (w, c, successor, spentAt) => {
    const results = await Promise.all(FIXTURE.concurrentOffsetsMs.map((ms) => refresh(w, c.rt, {}, { now: spentAt + ms })))
    for (const r of results) assert.deepEqual(r, successor)
    assertGrantOk(await refresh(w, successor.body.refresh_token, {}, { now: spentAt + G.after }))
  })

  // The decision body cap (relayed: 8 KiB; over it 413 with no body). Pads the form with an extra field.
  const padded = (captured, bytes) => {
    const pad = `&${PARAM.state}x=`
    return { ...captured, body: captured.body + pad + 'p'.repeat(Math.max(0, bytes - captured.body.length - pad.length)) }
  }
  for (const [part, bytes, over] of [['cap', RELAYED.decisionBodyBytes, false], ['cap + 1', RELAYED.decisionBodyBytes + 1, true]]) {
    row(sdk, CASE.dt08, `body ${part}`, `a decision body of ${bytes} bytes → ${over ? '413 with no body, nothing bound' : 'processed'}`, async (w) => {
      w.tokens.add(5, V(5))
      const flow = await open(w)
      const body = padded(flow.b.formBody(PAGE_TEXT.authorize, { token: V(5) }), bytes)
      assert.equal(Buffer.byteLength(body.body), bytes, 'harness: padded size')
      const res = await flow.b.post(body)
      if (over) {
        assert.equal(res.status, HTTP_STATUS.payloadTooLarge)
        assert.equal(res.body, '')
        assert.equal(w.pairs.pairOf(E(5)), undefined)
      } else assert.notEqual(res.status, HTTP_STATUS.payloadTooLarge)
    })
  }

  // The pending-request cap (relayed: 256, oldest evicted first; an evicted request reads as expired).
  for (const [part, count] of [['cap', RELAYED.pendingMax], ['cap + 1', RELAYED.pendingMax + 1]]) {
    row(sdk, CASE.st04, `pending ${part}`, `${count} pending requests → the oldest ${count > RELAYED.pendingMax ? 'reads as expired' : 'still authorizes'}`, async (w) => {
      w.tokens.add(5, V(5))
      const flows = []
      for (let i = 0; i < count; i += 1) flows.push(await open(w))
      const res = await flows[0].b.authorize({ token: V(5) })
      if (count > RELAYED.pendingMax) assertOnPage(res, PAGE_TEXT.expired)
      else assertCode(w, { res, redirect: redirectOf(res) })
    })
  }

  // The CIMD cache cap (relayed: 256, oldest evicted first).
  for (const [part, count] of [['cap', RELAYED.cimdCacheMax], ['cap + 1', RELAYED.cimdCacheMax + 1]]) {
    plain(sdk, CASE.ep08, `7 (cache ${part})`, `${count} cached documents → the oldest is ${count > RELAYED.cimdCacheMax ? 'evicted and fetched again' : 'still cached'}`, async (mod) => {
      const ids = Array.from({ length: count }, (_, i) => `https://agent.example/cimd-${i}.json`)
      const transport = stubTransport((url) => served(JSON.stringify(documentOf(url)), { headers: { [HTTP_HEADER.cacheControl]: `max-age=${FIXTURE.cacheMaxAgeS}` } }))
      const fetcher = cimdFetcher(mod, { resolve: resolver(), transport, now: fakeClock(FIXTURE.t0).now })
      for (const id of ids) assert.equal((await fetcher.fetch(id)).ok, true)
      await fetcher.fetch(ids[0])
      assert.equal(transport.calls.length, count + (count > RELAYED.cimdCacheMax ? 1 : 0))
    })
  }
}

// ---------------------------------------------------------------------------------------------
// Decision Tables
// ---------------------------------------------------------------------------------------------

/** A world whose CIMD is the real fetcher over a stubbed transport serving `respond(url)`. */
const realCimd = (respond) => () => ({ cimd: (mod, clock) => cimdFetcher(mod, { resolve: resolver(), transport: stubTransport(respond), now: clock.now }) })
const serving = (doc) => realCimd(() => served(typeof doc === 'string' ? doc : JSON.stringify(doc)))

function decisionTables(sdk) {
  // AUTH-DT-07: authorization request validation, through the real CIMD fetcher.
  const dt07 = (rule, title, options, fn) => row(sdk, CASE.dt07, rule, title, fn, undefined, options)
  dt07('1', 'valid CIMD URL, exact redirect, code, S256, canonical resource → page shown', serving(documentOf(FIXTURE.clientId)), async (w) => {
    assertPageShown((await open(w)).page)
  })
  for (const clientId of FIXTURE.badClientIds) {
    dt07('2', `client_id ${clientId} (not an https URL with a path) → error on the page, no redirect`, serving(documentOf(clientId)), async (w) => {
      assertPageError((await open(w, { overrides: { [PARAM.clientId]: clientId } })).page)
    })
  }
  const broken = [
    ['unreachable', realCimd(() => served('', { status: STUB.serverError }))],
    ['not JSON', serving(STUB.notJson)],
    ['missing client_name', serving({ ...documentOf(FIXTURE.clientId), [DOC.clientName]: undefined })],
    ['missing redirect_uris', serving({ ...documentOf(FIXTURE.clientId), [DOC.redirectUris]: undefined })],
    ['its client_id differs from the URL', serving(documentOf(FIXTURE.otherClientId))],
  ]
  for (const [what, options] of broken) dt07('3', `document ${what} → error on the page, no redirect`, options, async (w) => assertPageError((await open(w)).page))
  for (const redirect of [FIXTURE.redirectTrailingSlash, FIXTURE.redirectForeign]) {
    dt07('4', `redirect ${redirect} not in the document → error on the page`, serving(documentOf(FIXTURE.clientId)), async (w) => {
      assertPageError((await open(w, { overrides: { [PARAM.redirectUri]: redirect } })).page)
    })
  }
  dt07('4a', 'a loopback redirect differing only in port → page shown', serving(documentOf(FIXTURE.clientId)), async (w) => {
    assertPageShown((await open(w, { overrides: { [PARAM.redirectUri]: FIXTURE.redirectOtherPort } })).page)
  })
  dt07('4c', 'http://localhost:7777/cb when only 127.0.0.1 is registered → error on the page (distinct hosts)', serving(documentOf(FIXTURE.clientId)), async (w) => {
    assertPageError((await open(w, { overrides: { [PARAM.redirectUri]: FIXTURE.redirectLocalhost } })).page)
  })
  dt07('4b', 'an https redirect differing only in port → error on the page (exact match)', serving(documentOf(FIXTURE.clientId, [FIXTURE.httpsRedirect])), async (w) => {
    assertPageError((await open(w, { overrides: { [PARAM.redirectUri]: FIXTURE.httpsRedirectOtherPort } })).page)
  })
  const redirected = [
    ['5', 'response_type token → unsupported_response_type', { [PARAM.responseType]: 'token' }, OAUTH_ERROR.unsupportedResponseType],
    ['6', 'no code_challenge → invalid_request', { [PARAM.codeChallenge]: undefined, [PARAM.codeChallengeMethod]: undefined }, OAUTH_ERROR.invalidRequest],
    ['7', 'code_challenge_method plain → invalid_request', { [PARAM.codeChallengeMethod]: PLAIN_METHOD }, OAUTH_ERROR.invalidRequest],
    ['8', 'no resource → invalid_target', { [PARAM.resource]: undefined }, OAUTH_ERROR.invalidTarget],
    ['8', 'a foreign resource → invalid_target', { [PARAM.resource]: oauthUrls(`${HOSTS.remoteScheme}//other.example`).resource }, OAUTH_ERROR.invalidTarget],
  ]
  for (const [rule, title, overrides, error] of redirected) {
    dt07(rule, `${title} + iss, redirected`, serving(documentOf(FIXTURE.clientId)), async (w) => {
      assertRedirectedError(w, (await open(w, { overrides })).page, error)
    })
    dt07('11', `${error} without state → error and iss, no state`, serving(documentOf(FIXTURE.clientId)), async (w) => {
      const res = (await open(w, { overrides: { ...overrides, [PARAM.state]: undefined } })).page
      assertRedirectedError(w, res, error, { state: undefined })
      assert.equal(Object.hasOwn(redirectOf(res).params, PARAM.state), false)
    })
  }
  dt07('9', 'the document lists an http non-localhost redirect URI → error on the page', serving(documentOf(FIXTURE.clientId, [FIXTURE.redirect, FIXTURE.httpNonLoopbackRedirect])), async (w) => {
    assertPageError((await open(w)).page)
  })
  for (const [what, extra] of [
    ['client_secret', { [CIMD_LIMITS.forbiddenAuthFields[0]]: STUB.secret }],
    ['client_secret_expires_at', { [CIMD_LIMITS.forbiddenAuthFields[1]]: 0 }],
    [`token_endpoint_auth_method ${STUB.secretMethod}`, { [DOC.authMethod]: STUB.secretMethod }],
    [`token_endpoint_auth_method ${CLIENT_AUTH.post}`, { [DOC.authMethod]: CLIENT_AUTH.post }],
  ]) {
    dt07('10', `the document names ${what} → error on the page (public clients only)`, serving(documentOf(FIXTURE.clientId, [FIXTURE.redirect], extra)), async (w) => {
      assertPageError((await open(w)).page)
    })
  }

  // AUTH-DT-08: what entering a token on the page does.
  const dt08 = (rule, title, fn) => row(sdk, CASE.dt08, rule, title, fn)
  const invalidCases = [
    ['1', 'matches no entry', () => {}, () => V(1)],
    ['2', 'matches a disabled entry', (w) => { w.tokens.add(2, V(2)); w.tokens.disable(2) }, () => V(2)],
    ['3', 'matches a deleted entry\'s old value', (w) => { w.tokens.add(3, V(3)); w.tokens.remove(3) }, () => V(3)],
    ['4', 'a user-set value under 32 characters', (w) => { w.tokens.add(4, FIXTURE.shortValue, { status: ENTRY_STATUS.tokenTooShort }) }, () => FIXTURE.shortValue],
  ]
  for (const [rule, what, setup, value] of invalidCases) {
    dt08(rule, `${what} → "this token is not valid"; nothing changes; failure counted`, async (w) => {
      setup(w)
      const before = snapshot(w)
      const flow = await open(w)
      assertOnPage(await flow.b.authorize({ token: value() }), PAGE_TEXT.invalid)
      assert.deepEqual(snapshot(w), before)
      assert.equal(w.limiter.failures.length, 1)
    })
  }
  dt08('1–4', 'the four refusals return byte-identical page bodies (the per-render form nonce masked)', async (w) => {
    for (const [, , setup] of invalidCases) setup(w)
    const flow = await open(w)
    const bodies = []
    for (const [, , , value] of invalidCases) bodies.push(masked((await flow.b.authorize({ token: value() })).body))
    for (const body of bodies.slice(1)) assert.equal(body, bodies[0])
  })
  const bindsAs = (rule, title, fill, setup, expected) => dt08(rule, title, async (w) => {
    w.tokens.add(5, V(5))
    await setup?.(w)
    const flow = await approve(w, fill)
    assertCode(w, flow)
    const pair = w.pairs.pairOf(E(5))
    assert.deepEqual({ id: pair.id, name: pair.name }, expected)
    assert.equal(pair.pairedAt, w.clock.now())
  })
  bindsAs('5', 'valid; agent_id valid and free; name empty → code; bound to the id with no name, pairedAt set', {}, undefined, { id: ID.agentW, name: null })
  bindsAs('5a', 'valid; id and name valid and free → bound and named', { name: NAME.watcher }, undefined, { id: ID.agentW, name: NAME.watcher })
  const refusedOnPage = (rule, title, fill, setup, code) => dt08(rule, title, async (w) => {
    w.tokens.add(5, V(5))
    await setup?.(w)
    const before = snapshot(w)
    const flow = await approve(w, fill)
    assertOnPage(flow.res, code)
    assert.deepEqual(snapshot(w), before)
  })
  // Rule 5b now means the request's agent_id is invalid (R-OA-22 (a)); the page asks for no id.
  refusedOnPage('5b', 'agent_id with a dot → id-invalid', { id: ID.dotted }, undefined, ID_REFUSAL.idInvalid)
  refusedOnPage('5b', 'agent_id over 64 characters → id-invalid', { id: ID.long }, undefined, ID_REFUSAL.idInvalid)
  refusedOnPage('5c', 'an id a machine client\'s entry holds → id-taken', {}, (w) => w.pairs.pair(E(1), ID.agentW, undefined, at()), REFUSAL.idTaken)
  refusedOnPage('5c', 'an id a browser client\'s entry holds → id-taken', {}, (w) => w.pairs.bindFromPage(E(2), ID.agentW, undefined, { clientIdUrl: FIXTURE.otherClientId, redirectUri: FIXTURE.redirect }, at()), REFUSAL.idTaken)
  refusedOnPage('5c', 'an id a disabled entry holds → id-taken', {}, async (w) => { w.tokens.add(3, V(3)); await w.pairs.pair(E(3), ID.agentW, undefined, at()); w.tokens.disable(3) }, REFUSAL.idTaken)
  bindsAs('5g', 'an id a since-deleted entry held → accepted', {}, async (w) => { w.tokens.add(1, V(1)); await w.pairs.pair(E(1), ID.agentW, undefined, at()); w.tokens.remove(1); await w.pairs.remove(E(1)) }, { id: ID.agentW, name: null })
  bindsAs('5d', 'an id differing from another\'s only in case → accepted (case-sensitive)', { id: ID.caseA }, (w) => w.pairs.pair(E(1), ID.caseB, undefined, at()), { id: ID.caseA, name: null })
  refusedOnPage('5e', 'a name another principal holds → name-taken', { name: NAME.fishball }, (w) => w.pairs.pair(E(1), ID.machine, NAME.fishball, at()), REFUSAL.nameTaken)
  bindsAs('5f', 'a whitespace-only name → treated as empty: bound with no name', { name: NAME.blank }, undefined, { id: ID.agentW, name: null })
  dt08('6', 'paired to a machine client → already-paired, "create a new token", the bound name and last-seen time; nothing changes', async (w) => {
    w.tokens.add(5, V(5))
    await w.pairs.pair(E(5), ID.machine, NAME.watcher, at())
    const before = snapshot(w)
    const flow = await open(w)
    const first = await flow.b.authorize({ token: V(5) })
    assertOnPage(first, PAGE_TEXT.createNew, NAME.watcher)
    assert.deepEqual(snapshot(w), before)
    w.pairs.seen(w.pairs.pairOf(E(5)).principalKey, at(LIFETIME.accessTokenMs))
    const second = await flow.b.authorize({ token: V(5) })
    assert.notEqual(masked(second.body), masked(first.body), 'the page shows the bound pair\'s last-seen time')
  })
  // Rule 7 was "already-paired" (1.9) and 7a / 7b the renewal of an ended chain (R-OA-16 (7)).
  // R-OA-22 (1.33 Q-A2 A) makes the same id a reconnect; R-OA-23 withdraws 7a (no chain ends by
  // age) and folds 7b into rule 8 (another id). PAGE-ID-USE-CASES.md AUTH-DT-08.
  dt08('7', 'paired on the page to this same client, chain live, the same agent_id → code (reconnect); the principal unchanged', async (w) => {
    await chain(w)
    const before = snapshot(w)
    assertCode(w, await approve(w))
    assert.deepEqual(snapshot(w), before)
  })
  dt08('8 (was 7b)', 'paired on the page to agent-w-1, another agent_id → already-paired; nothing changes', async (w) => {
    await chain(w)
    const before = snapshot(w)
    const flow = await approve(w, { id: ID.other })
    assertOnPage(flow.res, PAGE_TEXT.createNew)
    assert.equal(flow.redirect, undefined)
    assert.deepEqual(snapshot(w), before)
  })
  dt08('8', 'paired to another browser client with another id → already-paired', async (w) => {
    w.tokens.add(5, V(5))
    await w.pairs.bindFromPage(E(5), ID.other, undefined, { clientIdUrl: FIXTURE.otherClientId, redirectUri: FIXTURE.redirect }, at())
    const before = snapshot(w)
    assertOnPage((await approve(w)).res, PAGE_TEXT.createNew)
    assert.deepEqual(snapshot(w), before)
  })
  bindsAs('9', 'unpaired, name empty, client_name held by another principal → bound with no name (client_name only a hint)', {}, (w) => w.pairs.pair(E(1), ID.machine, FIXTURE.clientName, at()), { id: ID.agentW, name: null })
  dt08('10', 'an empty token field → "enter a token"; not counted as a failure', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await approve(w, { token: '' })
    assertOnPage(flow.res, PAGE_TEXT.empty)
    assert.equal(w.limiter.failures.length, 0)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  dt08('11', 'across every outcome the value appears in no URL, redirect, code, log or response; pages are no-store', async (w) => {
    w.tokens.add(5, V(5))
    w.tokens.add(6, V(6))
    await w.pairs.pair(E(6), ID.machine, undefined, at())
    const flow = await open(w)
    for (const fill of [{ token: V(1) }, { token: V(6) }, { token: '' }, { token: V(5) }]) {
      const res = await flow.b.authorize(fill)
      if (res.headers[HTTP_HEADER.location] === undefined) assertPageHeaders(res)
    }
    const dotted = await approve(w, { id: ID.dotted, token: V(5) })
    assertPageHeaders(dotted.res)
    assertNoLeak(w, V(1), V(5), V(6))
  })

  // AUTH-DT-09: the approval listener's port (a second listener holds the port).
  const dt09 = (rule, title, fn) => row(sdk, CASE.dt09, rule, title, fn)
  const served_ = async (w, port) => {
    const before = w.gate.calls.length
    const answer = await probe(port)
    return answer !== null && answer.body !== STUB.holderMarker && w.gate.calls.length > before
  }
  const statusOf = (a) => read(a.l.status)
  dt09('1', 'the default port, free → open, status ok, the page reachable', async (w, t) => {
    await lockDefaultPort(t)
    const a = approvalListener(t, w, APPROVAL_LISTENER.defaultPort)
    await a.start()
    assert.equal(statusOf(a), SUBJECT.statusOk)
    assert.equal(read(a.l.port), APPROVAL_LISTENER.defaultPort)
    assert.ok(await served_(w, APPROVAL_LISTENER.defaultPort))
  })
  dt09('2', 'a user-set free port P → open on P, status ok', async (w, t) => {
    const port = await freePort()
    const a = approvalListener(t, w, port)
    await a.start()
    assert.equal(statusOf(a), SUBJECT.statusOk)
    assert.equal(read(a.l.port), port)
    assert.ok(await served_(w, port))
  })
  dt09('3', 'the default port held by another process → not open, approval-port-in-use, one diagnostic; the page unreachable', async (w, t) => {
    await lockDefaultPort(t)
    await holdPort(t, APPROVAL_LISTENER.defaultPort)
    const a = approvalListener(t, w, APPROVAL_LISTENER.defaultPort)
    await a.start()
    assert.equal(statusOf(a), CONNECTOR_STATUS.approvalPortInUse)
    assert.ok(a.statuses.includes(CONNECTOR_STATUS.approvalPortInUse), 'reported through onStatus')
    assert.equal(read(a.l.listening), false)
    assert.equal(a.logger.lines.filter((l) => l.level === 'warn' || l.level === 'error').length, 1, 'one diagnostic')
    assert.equal((await probe(APPROVAL_LISTENER.defaultPort)).body, STUB.holderMarker)
  })
  todo(sdk, CASE.dt09, '3 (metadata)', 'the metadata keeps authorization_endpoint on the default port; MCP and machine exchange work; stock clients accept it', LATER.metadata)
  dt09('4', 'a clash, then the other process frees the port → bound again on the next retry (APPROVAL_LISTENER.retryMs), status ok', async (w, t) => {
    const port = await freePort()
    const holder = await holdPort(t, port)
    const a = approvalListener(t, w, port)
    await a.start()
    assert.equal(statusOf(a), CONNECTOR_STATUS.approvalPortInUse)
    assert.ok(a.timers.delays().includes(APPROVAL_LISTENER.retryMs), 'a retry is scheduled every APPROVAL_LISTENER.retryMs')
    await holder.release()
    a.timers.fire(APPROVAL_LISTENER.retryMs)
    assert.ok(await waitFor(() => statusOf(a) === SUBJECT.statusOk, FIXTURE.retryMarginMs), 'not bound after the retry')
    assert.ok(await served_(w, port))
  })
  dt09('5', 'the setting changed from a clashing port to a free one → rebinds at once on the new port, status ok', async (w, t) => {
    const clash = await freePort()
    await holdPort(t, clash)
    const a = approvalListener(t, w, clash)
    await a.start()
    const port = await freePort()
    await a.l.setPort(port)
    assert.ok(await waitFor(() => statusOf(a) === SUBJECT.statusOk, FIXTURE.retryMarginMs))
    assert.equal(read(a.l.port), port)
    assert.ok(await served_(w, port))
  })
  todo(sdk, CASE.dt09, '5 (metadata)', 'authorization_endpoint follows the new port', LATER.metadata)
  dt09('6', 'P equal to DSH\'s own web port → not open, approval-port-in-use; DSH\'s listener keeps answering', async (w, t) => {
    const dshPort = await freePort()
    await holdPort(t, dshPort)
    const a = approvalListener(t, w, dshPort)
    await a.start()
    assert.equal(statusOf(a), CONNECTOR_STATUS.approvalPortInUse)
    assert.equal((await probe(dshPort)).body, STUB.holderMarker, 'DSH\'s UI unaffected')
  })
  dt09('7', 'while the connector runs the listener stays open; it is never closed between requests', async (w, t) => {
    const port = await freePort()
    const a = approvalListener(t, w, port)
    await a.start()
    for (let i = 0; i < 3; i += 1) {
      assert.ok(await served_(w, port), `request ${i + 1} not served`)
      assert.equal(read(a.l.listening), true)
    }
  })

  // K1b-DT-07 (the K1b todo row naming C-OAUTH-WEB): the approval listener over the gate.
  const k1b = (rule, title, fn) => row(sdk, CASE.k1bDt07, rule, title, fn)
  const gateRefusal = async (w, method, path, allow) => {
    const res = await w.browser().send(method, path)
    assert.equal(res.status, HTTP_STATUS.methodNotAllowed)
    assert.equal(res.headers[REQUEST_GATE.headers.allow], allow)
    assert.equal(res.body, '')
    assert.ok(w.gate.calls.some((c) => c.surface === GATE_SURFACE.approval && c.path === path), 'the gate checked the approval surface')
  }
  k1b('1', 'POST /authorize → 405, Allow: GET, no body', (w) => gateRefusal(w, HTTP_METHOD.post, PATHS.authorize, REQUEST_GATE.routes.approval[PATHS.authorize].join(REQUEST_GATE.allowSeparator)))
  k1b('2', 'GET /authorize/decision → 405, Allow: POST, no body', (w) => gateRefusal(w, HTTP_METHOD.get, PATHS.decision, REQUEST_GATE.routes.approval[PATHS.decision].join(REQUEST_GATE.allowSeparator)))
  k1b('3', 'an unknown path passes the gate and gets 404; admit is never called on the approval surface', async (w) => {
    const res = await w.browser().send(HTTP_METHOD.get, PATHS.mcp)
    assert.equal(res.status, HTTP_STATUS.notFound)
    assert.ok(w.gate.calls.some((c) => c.path === PATHS.mcp && c.surface === GATE_SURFACE.approval))
    await approve(w)
    assert.deepEqual(w.gate.admits, [])
  })
}

// ---------------------------------------------------------------------------------------------
// State Transitions
// ---------------------------------------------------------------------------------------------

function stateTransitions(sdk) {
  // AUTH-ST-04: a pending browser authorization and its code (fake clock).
  const st04 = (n, title, fn) => row(sdk, CASE.st04, n, title, fn)
  st04('1', '(none) → valid /authorize → Pending: a page with one token field', async (w) => {
    assertPageShown((await open(w)).page)
  })
  st04('2', 'Pending → Authorize with a valid, enabled, unpaired token, a free id and an empty name → CodeIssued: bound; code, iss', async (w) => {
    w.tokens.add(5, V(5))
    assertCode(w, await approve(w))
    assert.equal(w.pairs.pairOf(E(5)).id, ID.agentW)
  })
  st04('2a', 'Pending → good token but id-invalid, id-taken, name-invalid or name-taken → Pending: the refusal on the page; nothing bound', async (w) => {
    w.tokens.add(5, V(5))
    await w.pairs.pair(E(1), ID.machine, NAME.fishball, at())
    // The id refusals come from the request's agent_id (R-OA-22), so each is its own request; a
    // second Authorize on the same request shows the same refusal: it stayed pending.
    for (const [id, code] of [[ID.dotted, ID_REFUSAL.idInvalid], [ID.machine, REFUSAL.idTaken]]) {
      const flow = await approve(w, { id })
      assertOnPage(flow.res, code)
      assertOnPage(await flow.b.authorize({ token: V(5) }), code)
      assert.equal(w.pairs.pairOf(E(5)), undefined)
    }
    const flow = await open(w)
    for (const [name, code] of [[FIXTURE.idFill.repeat(NAME_RULES.maxChars + 1), REFUSAL.nameInvalid], [NAME.fishball, REFUSAL.nameTaken]]) {
      assertOnPage(await flow.b.authorize({ token: V(5), name }), code)
      assert.equal(w.pairs.pairOf(E(5)), undefined)
    }
    const res = await flow.b.authorize({ token: V(5) })
    assertCode(w, { res, redirect: redirectOf(res) })
  })
  st04('3', 'Pending → an invalid token → Pending: uniform "not valid"; failure counted', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    assertOnPage(await flow.b.authorize({ token: V(1) }), PAGE_TEXT.invalid)
    assert.equal(w.limiter.failures.length, 1)
    const res = await flow.b.authorize({ token: V(5) })
    assertCode(w, { res, redirect: redirectOf(res) })
  })
  st04('4', 'Pending → a valid but paired token → Pending: already-paired; nothing changes', async (w) => {
    w.tokens.add(5, V(5))
    w.tokens.add(6, V(6))
    await w.pairs.pair(E(6), ID.machine, undefined, at())
    const before = snapshot(w)
    const flow = await open(w)
    assertOnPage(await flow.b.authorize({ token: V(6) }), PAGE_TEXT.createNew)
    assert.deepEqual(snapshot(w), before)
    const res = await flow.b.authorize({ token: V(5) })
    assertCode(w, { res, redirect: redirectOf(res) })
  })
  // Row 4a was the renewal of a chain ended by age (withdrawn, R-OA-23); it is now the reconnect.
  st04('4a', 'Pending → a page-bound token with its bound agent_id (no age or chain condition) → CodeIssued; the pair unchanged (reconnect)', async (w) => {
    await chain(w)
    const before = snapshot(w)
    assertCode(w, await approve(w))
    assert.deepEqual(snapshot(w), before)
    assert.ok(w.pairs.calls.some(([n, entryKey, id]) => n === 'reconnectFromPage' && entryKey === E(5) && id === ID.agentW))
  })
  st04('5', 'Pending → Cancel → Closed: access_denied; nothing bound; Authorize no longer issues a code', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    const captured = flow.b.formBody(PAGE_TEXT.authorize, { token: V(5) })
    assertRedirectedError(w, await flow.b.cancel(), OAUTH_ERROR.accessDenied)
    assert.equal(redirectOf(await flow.b.post(captured))?.params[PARAM.code], undefined)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  st04('6', 'Pending → 10 min pass → Expired: Authorize shows the expiry message; nothing bound', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    w.clock.advance(LIFETIME.pendingRequestMs)
    assertOnPage(await flow.b.authorize({ token: V(5) }), PAGE_TEXT.expired)
    assert.equal(w.pairs.pairOf(E(5)), undefined)
  })
  st04('7', 'Pending → the per-client failure limit reached → refused with the rate-limit answer, valid or not; nothing revealed', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    for (let i = 0; i < FAILURE_LIMIT.perKeyPerWindow; i += 1) assertOnPage(await flow.b.authorize({ token: V(1) }), PAGE_TEXT.invalid)
    const valid = await flow.b.authorize({ token: V(5) })
    const invalid = await flow.b.authorize({ token: V(1) })
    assert.equal(valid.status, HTTP_STATUS.tooManyRequests)
    assert.equal(valid.headers[HTTP_HEADER.location], undefined)
    assert.equal(masked(valid.body), masked(invalid.body), 'a limited answer says nothing about the token')
    assert.equal(w.pairs.pairOf(E(5)), undefined)
    assert.equal(w.limiter.failures.length, FAILURE_LIMIT.perKeyPerWindow, 'a limited request is not counted again')
  })
  st04('8', 'CodeIssued → the token request with the correct verifier, redirect and resource within 60 s → Redeemed: scope fishball AT', async (w) => {
    w.tokens.add(5, V(5))
    assertGrantOk(await redeem(w, await approve(w), {}, { now: at(seconds(1)) }))
  })
  st04('9', 'CodeIssued → a wrong code_verifier → CodeIssued: invalid_grant; the code not consumed', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await approve(w)
    assertGrantError(await redeem(w, flow, { [PARAM.codeVerifier]: pkce().verifier }), OAUTH_ERROR.invalidGrant)
    assertGrantError(await redeem(w, flow, { [PARAM.redirectUri]: FIXTURE.redirectOtherPort }), OAUTH_ERROR.invalidGrant)
    assertGrantOk(await redeem(w, flow))
  })
  st04('9a', 'CodeIssued → a client secret on the code grant → invalid_client, counted', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await approve(w)
    const result = await redeem(w, flow, {}, { client: { method: CLIENT_AUTH.basic, clientId: FIXTURE.clientId, secret: STUB.secret } })
    assertGrantError(result, RELAYED.secretOnGrant[GRANT.authorizationCode])
    assert.equal(result.countedFailure, true)
  })
  st04('10', 'CodeIssued → 60 s pass → Expired: invalid_grant', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await approve(w)
    assertGrantError(await redeem(w, flow, {}, { now: at(LIFETIME.codeMs) }), OAUTH_ERROR.invalidGrant)
  })
  st04('11', 'Redeemed → the same code again → invalid_grant; every token issued from it revoked', async (w) => {
    const c = await chain(w)
    assertGrantError(await redeem(w, c.flow, {}, { now: at(seconds(1)) }), OAUTH_ERROR.invalidGrant)
    assert.ok(sawCall(w, 'revokeChain', c.chainId))
    assert.equal(w.store.getAccess(digest(c.first.access_token)), undefined)
    assertGrantError(await refresh(w, c.rt, {}, { now: at(seconds(2)) }), OAUTH_ERROR.invalidGrant)
  })
  st04('12', 'any → connector restart → pending requests and codes lost; bindings stay', async (w) => {
    w.tokens.add(5, V(5))
    w.tokens.add(6, V(6))
    const issued = await approve(w)
    const waiting = await open(w, { overrides: { [PARAM.agentId]: ID.other } })
    const captured = waiting.b.formBody(PAGE_TEXT.authorize, { token: V(6) })
    await w.restart()
    assertGrantError(await redeem(w, issued), OAUTH_ERROR.invalidGrant)
    assert.equal(redirectOf(await waiting.b.post(captured))?.params[PARAM.code], undefined)
    assert.equal(w.pairs.pairOf(E(5)).id, ID.agentW, 'the binding stays')
    assert.equal(w.pairs.pairOf(E(6)), undefined)
  })

  // AUTH-ST-05: a browser client's refresh-token chain. RT1 from the redemption; each refresh returns the next.
  const st05 = (n, title, fn) => row(sdk, CASE.st05, n, title, fn)
  /** Refreshes `rt` `count` times, a grace window apart, returning every response body. */
  const rotate = async (w, rt, count) => {
    const bodies = []
    for (let i = 0; i < count; i += 1) {
      w.clock.advance(LIFETIME.refreshGraceMs)
      bodies.push(assertGrantOk(await refresh(w, bodies.at(-1)?.refresh_token ?? rt)))
    }
    return bodies
  }
  st05('1', 'Chain(RT1) → refresh with RT1, same client_id and resource → Chain(RT2): new AT + RT2 in the same chain; RT1 used', async (w) => {
    const c = await chain(w)
    const [rt2] = await rotate(w, c.rt, 1)
    assert.notEqual(rt2.refresh_token, c.rt)
    assert.notEqual(rt2.access_token, c.first.access_token)
    const record = w.store.getRefresh(digest(rt2.refresh_token))
    // K1d `RefreshRecord` (K1d-5: `chainStartedAt` withdrawn with the chain cap): exactly these members.
    assert.deepEqual(Object.keys(record).filter((k) => record[k] !== undefined).sort(), REFRESH_RECORD_MEMBERS)
    assert.equal(record.chainId, c.chainId)
    w.clock.advance(LIFETIME.refreshGraceMs)
    assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
  })
  st05('2', 'Chain(RT2) → refresh with RT2 → Chain(RT3)', async (w) => {
    const c = await chain(w)
    const [rt2, rt3] = await rotate(w, c.rt, 2)
    assert.notEqual(rt3.refresh_token, rt2.refresh_token)
  })
  st05('3', 'Chain(RT3) → RT1 again outside the window → Revoked: invalid_grant; RT3 and every AT of the chain dead', async (w) => {
    const c = await chain(w)
    const bodies = await rotate(w, c.rt, 2)
    w.clock.advance(LIFETIME.refreshGraceMs)
    assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
    assert.ok(sawCall(w, 'revokeChain', c.chainId))
    assertGrantError(await refresh(w, bodies[1].refresh_token), OAUTH_ERROR.invalidGrant)
    for (const body of [c.first, ...bodies]) assert.equal(w.store.getAccess(digest(body.access_token)), undefined)
  })
  todo(sdk, CASE.st05, '3 (MCP)', 'the revoked chain\'s access tokens get 401 at the MCP endpoint', LATER.verifier)
  st05('3a', 'Chain(RT2, RT1 spent < 10 s ago) → RT1 again, same client and resource → the identical response; nothing revoked', async (w) => {
    const c = await chain(w)
    const issued = await refresh(w, c.rt)
    assert.deepEqual(await refresh(w, c.rt, {}, { now: at(LIFETIME.refreshGraceMs - 1) }), issued)
    assert.equal(sawCall(w, 'revokeChain'), false)
  })
  for (const [what, overrides] of [['another client_id', { [PARAM.clientId]: FIXTURE.otherClientId }], ['another resource', { [PARAM.resource]: oauthUrls(`${HOSTS.remoteScheme}//other.example`).resource }]]) {
    st05('3b', `Chain(RT2, RT1 spent < 10 s ago) → RT1 from ${what} → Revoked`, async (w) => {
      const c = await chain(w)
      const issued = assertGrantOk(await refresh(w, c.rt))
      assert.equal((await refresh(w, c.rt, overrides, { now: at(seconds(1)) })).ok, false)
      assert.ok(sawCall(w, 'revokeChain', c.chainId))
      assertGrantError(await refresh(w, issued.refresh_token, {}, { now: at(seconds(2)) }), OAUTH_ERROR.invalidGrant)
    })
  }
  st05('3c', 'Chain(RT1) → RT1 with no resource → invalid_target; nothing rotated', async (w) => {
    const c = await chain(w)
    assertGrantError(await refresh(w, c.rt, { [PARAM.resource]: undefined }), OAUTH_ERROR.invalidTarget)
    assertGrantOk(await refresh(w, c.rt))
  })
  st05('4', 'Chain(RTn) → another client_id → invalid_grant; nothing rotated', async (w) => {
    const c = await chain(w)
    assertGrantError(await refresh(w, c.rt, { [PARAM.clientId]: FIXTURE.otherClientId }), OAUTH_ERROR.invalidGrant)
    assertGrantOk(await refresh(w, c.rt))
  })
  st05('5', 'Chain(RTn) → a foreign resource → invalid_target; nothing rotated', async (w) => {
    const c = await chain(w)
    assertGrantError(await refresh(w, c.rt, { [PARAM.resource]: oauthUrls(`${HOSTS.remoteScheme}//other.example`).resource }), OAUTH_ERROR.invalidTarget)
    assertGrantOk(await refresh(w, c.rt))
  })
  for (const [what, act] of [['disabled', (w) => w.tokens.disable(5)], ['deleted', (w) => w.tokens.remove(5)], ['given a new value', (w) => w.tokens.changeValue(5, FIXTURE.changedValue(5))]]) {
    st05('6', `Chain(RTn) → the entry ${what} → Revoked: the next refresh is invalid_grant`, async (w) => {
      const c = await chain(w)
      act(w)
      assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
    })
  }
  todo(sdk, CASE.st05, '6 (MCP)', 'the entry\'s access tokens get 401 after disable, delete or value change', LATER.verifier)
  // Row 7's "re-entering is already-paired" is superseded by R-OA-22 (1.33 Q-A2 A; relayed reading,
  // PAGE-ID-USE-CASES.md): the same id reconnects; the revoked chain stays revoked.
  st05('7', 'Revoked (entry disabled) → re-enabled → Revoked: no refresh token revived; re-entering the token with the bound id reconnects (a new chain, the same principal)', async (w) => {
    const c = await chain(w)
    const principal = w.pairs.pairOf(E(5)).principalKey
    w.tokens.disable(5)
    w.tokens.enable(5)
    assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
    const flow = await approve(w)
    assertCode(w, flow)
    const fresh = assertGrantOk(await redeem(w, flow))
    assert.notEqual(w.store.getRefresh(digest(fresh.refresh_token)).chainId, c.chainId)
    assert.equal(w.pairs.pairOf(E(5)).principalKey, principal)
    assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
  })
  st05('8', 'Chain(RTn) → connector restart → ATs gone; RTn refreshes to RTn+1; storage holds RTn\'s digest, never its value', async (w) => {
    const c = await chain(w)
    const [rtn] = await rotate(w, c.rt, 1)
    const persisted = JSON.stringify(w.store.persisted())
    assert.ok(persisted.includes(digest(rtn.refresh_token)), 'the lowercase hex SHA-256 digest is persisted')
    for (const value of [c.rt, rtn.refresh_token]) assert.equal(persisted.includes(value), false, 'a refresh token value persisted')
    await w.restart()
    assert.deepEqual(w.store.accessTokens(), [])
    w.clock.advance(LIFETIME.refreshGraceMs)
    const next = assertGrantOk(await refresh(w, rtn.refresh_token))
    assert.notEqual(next.refresh_token, rtn.refresh_token)
  })
  st05('8a', 'Chain(RTn, RTn−1 spent < 10 s before the restart) → RTn−1 after the restart → Revoked (the window is not persisted)', async (w) => {
    const c = await chain(w)
    await refresh(w, c.rt)
    await w.restart()
    assert.equal((await refresh(w, c.rt, {}, { now: at(seconds(1)) })).ok, false)
    assert.ok(sawCall(w, 'revokeChain', c.chainId))
  })
  st05('8b', 'Chain(RTn) → the entry disabled while the connector is down, then restart → refresh invalid_grant', async (w) => {
    const c = await chain(w)
    w.tokens.disable(5, { silently: true })
    await w.restart()
    assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
  })
  st05('9', '(machine client) a refresh_token grant with any value → invalid_grant', async (w) => {
    w.tokens.add(1, V(1))
    await w.pairs.pair(E(1), ID.machine, undefined, at())
    assertGrantError(await refresh(w, V(1), { [PARAM.clientId]: ID.machine }), OAUTH_ERROR.invalidGrant)
  })
  st05('9', '(machine client) a refresh_token grant with its client secret → invalid_grant, counted', async (w) => {
    w.tokens.add(1, V(1))
    const result = await refresh(w, V(1), { [PARAM.clientId]: ID.machine }, { client: { method: CLIENT_AUTH.basic, clientId: ID.machine, secret: V(1) } })
    assertGrantError(result, RELAYED.secretOnGrant[GRANT.refreshToken])
    assert.equal(result.countedFailure, true)
  })
  // Rows 10–12e were the 365-day chain cap and the renewal of an ended chain (R-OA-16 (5), (7)),
  // withdrawn by R-OA-23 (1.32 R14). Rows 10 and 11 now say "no age"; 12, 12a, 12b and 12e are the
  // reconnect (R-OA-22); 12c and 12d are withdrawn (no chain condition on reconnect). The ages are
  // AUTH-BVA-11 in page-id-cases.mjs as well.
  st05('10', 'Chain started at T → refresh at T + 365 days − 1 ms → RTn+1', async (w) => {
    const c = await chain(w)
    w.clock.set(at(FIXTURE.withdrawnChainCapMs - 1))
    assertGrantOk(await refresh(w, c.rt))
  })
  for (const [label, offsetMs] of [['T + 365 days', FIXTURE.withdrawnChainCapMs], ['T + 10 years', FIXTURE.tenYearsMs]]) {
    st05('11', `Chain started at T → refresh at ${label} → RTn+1 (no chain cap, R-OA-23); the pair unchanged`, async (w) => {
      const c = await chain(w)
      const before = snapshot(w)
      w.clock.set(at(offsetMs))
      const next = assertGrantOk(await refresh(w, c.rt))
      assert.equal(w.store.getRefresh(digest(next.refresh_token)).chainId, c.chainId, 'the same chain rotates')
      assert.deepEqual(snapshot(w), before)
    })
  }
  st05('12', 'a live chain, years later → the bound client re-enters the token with the bound id → a code, then a new chain for the same principal', async (w) => {
    const c = await chain(w)
    const principal = w.pairs.pairOf(E(5)).principalKey
    w.clock.set(at(FIXTURE.tenYearsMs))
    const flow = await approve(w)
    assertCode(w, flow)
    const fresh = assertGrantOk(await redeem(w, flow))
    const record = w.store.getRefresh(digest(fresh.refresh_token))
    assert.notEqual(record.chainId, c.chainId)
    assert.equal(w.store.getAccess(digest(fresh.access_token)).entryKey, E(5))
    assert.equal(w.pairs.pairOf(E(5)).principalKey, principal)
    assert.equal(w.tokens.list().length, 1, 'no new token')
    // A reconnect from the same client ends no chain: only reuse, a replayed code or a disable / delete does (R-OA-23).
    assertGrantOk(await refresh(w, c.rt))
  })
  st05('12a', 'a chain → re-entry with another id → already-paired; nothing changes', async (w) => {
    await chain(w)
    const before = snapshot(w)
    const flow = await approve(w, { id: ID.other })
    assertOnPage(flow.res, PAGE_TEXT.createNew)
    assert.deepEqual(snapshot(w), before)
  })
  for (const [what, revoke, token] of [
    ['reuse', async (w, c) => { await refresh(w, c.rt); w.clock.advance(LIFETIME.refreshGraceMs); await refresh(w, c.rt) }, () => V(5)],
    ['disable and re-enable', async (w) => { w.tokens.disable(5); w.tokens.enable(5) }, () => V(5)],
  ]) {
    st05('12b', `Revoked (by ${what}) → the bound client re-enters the token with the bound id → a code (reconnect); the revoked chain stays revoked`, async (w) => {
      const c = await chain(w)
      await revoke(w, c)
      const flow = await approve(w, { token: token() })
      assertCode(w, flow)
      assertGrantOk(await redeem(w, flow))
      assertGrantError(await refresh(w, c.rt), OAUTH_ERROR.invalidGrant)
    })
  }
  st05('12e', 'reconnect with another redirect URI the document lists → accepted; the new redirect URI recorded', async (w) => {
    w.cimd.document(FIXTURE.clientId, documentOf(FIXTURE.clientId, [FIXTURE.redirect, FIXTURE.redirectSecond]))
    await chain(w)
    const flow = await approve(w, {}, { overrides: { [PARAM.redirectUri]: FIXTURE.redirectSecond } })
    assertCode(w, flow, { target: FIXTURE.redirectSecond })
    assert.equal(w.pairs.pairOf(E(5)).redirectUri, FIXTURE.redirectSecond)
    assertGrantOk(await redeem(w, { ...flow, redirectUri: FIXTURE.redirectSecond }))
  })
}

/** Every C-OAUTH-WEB case on one SDK: Use Cases first, then EP, BVA, DT and ST. */
export function registerCOAuthWebCases(sdk) {
  useCases(sdk)
  equivalencePartitions(sdk)
  boundaryValues(sdk)
  decisionTables(sdk)
  stateTransitions(sdk)
}
