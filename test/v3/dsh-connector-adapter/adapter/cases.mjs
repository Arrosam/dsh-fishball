/**
 * Black-box cases for `dsh-connector-adapter` (USE-CASES.md beside this file): AUTH-UC-12/13/14,
 * AUTH-EP-12/13/14, AUTH-BVA-09, AUTH-DT-11/12, AUTH-ST-06/07, ADP-EP-01 / ADP-BVA-01 and the review
 * rows ADP-REV-* (Fishball's decisions of 2026-11-16).
 *
 * Level: integration. N is an in-process DSH of each SDK with the real credential store,
 * authorization seam, tool registry and the stock dsh-mcp-client the adapter mounts. C is the fake
 * DSH connector and X the non-DSH server, behind the injected fetch. A fake clock drives the refresh
 * timer, token expiry and the attempt timeout. Every test title is `[SDK <v>] <id> <row> …`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import { ADAPTER, APPROVAL_MESSAGE, DSH, END, FIXTURE, HOP, K, K1, OAUTH, REASON, RESULT, ROWS, RPC, START_ERROR, STATE, WAIT, WEB } from './constants.mjs'
import { browser, eventually, portAccepts, staysFalse } from './fakes.mjs'
import { leakHits, logText, modeOf, sweepableHome } from '../../dsh-connector-adapter/oauth-client/subject.mjs'
import { caseTest, closedPort, rawRequest } from '../../dsh-connector-adapter/oauth-client/cases.mjs'
import {
  adapterWorld, bodyOfBytes, callBody, discovers, isClientError, listeningEndpoints, mcpHeaders, toolCalls, untilChild, untilState,
} from './subject.mjs'

const M = ROWS.m
const X = ROWS.x
const WHOAMI = 'whoami'
const PAIR = 'pair'

// ------------------------------------------------------------------ shared steps

/** Signs `m` in end to end: approval-url, owner approves, authorized, child mounted. Returns the URL result. */
export async function signedIn(w, n = w.n, server = M) {
  const r = await n.signIn(server)
  assert.equal(r.status, RESULT.approvalUrl, 'sign-in did not return approval-url: ' + JSON.stringify(r))
  await browser.approve(w.c, r.url)
  await untilState(n, server, STATE.authorized)
  await untilChild(n, server, WHOAMI)
  return r
}
/** A world already signed in, with the first grant's expiry E. */
export async function authorizedWorld(t, sdk, options) {
  const w = await adapterWorld(t, sdk, options)
  await signedIn(w)
  const grant = (await w.n.record(M)).payload
  return { w, grant, E: grant.tokens.expiresAt }
}
/** The stored access token of `m`. */
export const storedToken = async (n, server = M) => (await n.record(server))?.payload?.tokens?.access_token

/** One raw HTTP request to the proxy (no client library), recording status and body. */
export function proxyRequest(proxyUrl, { method = WEB.post, headers = {}, body, chunked = false } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(proxyUrl)
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (body !== undefined) {
      if (chunked) { const half = Math.floor(body.length / 2); req.write(body.slice(0, half)); req.write(body.slice(half)) } else req.write(body)
    }
    req.end()
  })
}
/** The upstream requests C received for one tools/call id (the proxy forwarding it). */
/** Whether an upstream request record carries the JSON-RPC id `id`. */
export const carriesId = (r, id) => r.body.includes(`"id":${id}`)
export const forwardedOf = (c, id) => c.mcpRequests().filter((r) => carriesId(r, id))
let rawId = ROWS.rawId
export const nextId = () => ++rawId

/** The parameters of an approval URL. */
const paramsOf = (url) => new URL(url).searchParams
/** The callback port of an approval URL's redirect URI. */
const callbackPortOf = (url) => Number(new URL(paramsOf(url).get(OAUTH.redirectUri)).port)

export function registerAdapterCases(sdk) {
  // ================================================================== AUTH-UC-12
  caseTest(sdk, 'AUTH-UC-12', 'main 1', 'before sign-in: needs-authorization, no child row, no mcp__m__ tool, no request', async (t) => {
    const w = await adapterWorld(t, sdk)
    assert.equal(w.n.stateOf(M)?.state, STATE.needsAuthorization)
    assert.equal(w.n.stateOf(M)?.url, w.c.url)
    assert.equal(w.n.children().length, 0)
    assert.equal(w.n.tool(ADAPTER.mcpTool(M, WHOAMI)), undefined)
    assert.deepEqual(w.c.requests, [])
  })
  caseTest(sdk, 'AUTH-UC-12', 'main 2–3', 'sign-in reads PRM then AS metadata and returns approval-url at once with the standard parameters; authorizing; no registration', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    assert.equal(r.status, RESULT.approvalUrl)
    assert.equal(r.server, M)
    const u = new URL(r.url)
    assert.equal(u.origin + u.pathname, w.c.approvalOrigin + K1.PATHS.authorize)
    const p = u.searchParams
    assert.equal(p.get(OAUTH.clientId), FIXTURE.cimd)
    assert.equal(p.get(OAUTH.responseType), K1.RESPONSE_TYPE.code)
    assert.equal(p.get(OAUTH.codeChallengeMethod), K1.PKCE.method)
    assert.ok(p.get(OAUTH.state) && p.get(OAUTH.codeChallenge))
    assert.equal(p.get(OAUTH.scope), K1.SCOPE.full)
    assert.equal(p.get(OAUTH.resource), w.c.url)
    const redirect = new URL(p.get(OAUTH.redirectUri))
    assert.equal(`${redirect.protocol}//${redirect.hostname}${redirect.pathname}`, `http://${FIXTURE.loopback}/callback`)
    for (const re of APPROVAL_MESSAGE) assert.match(r.message, re)
    assert.equal(w.n.stateOf(M).state, STATE.authorizing)
    const reads = w.c.discoveryRequests().map((x) => x.path)
    assert.deepEqual(reads.slice(0, 2), [K1.PATHS.protectedResourcePrefix + K1.PATHS.mcp, K1.PATHS.authorizationServerPrefix + K1.PATHS.issuer])
    assert.deepEqual(w.forbidden(), [], 'an authorization, registration or token request before the owner acted')
  })
  caseTest(sdk, 'AUTH-UC-12', 'main 4–5', 'the owner approves: state and iss checked, one exchange (verifier, redirect_uri, client_id, resource; no secret), grant committed', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    await browser.approve(w.c, r.url)
    await untilState(w.n, M, STATE.authorized)
    const [exchange, ...more] = w.c.codeRequests()
    assert.equal(more.length, 0)
    const f = new URLSearchParams(exchange.body)
    assert.equal(f.get(OAUTH.clientId), FIXTURE.cimd)
    assert.equal(f.get(OAUTH.redirectUri), paramsOf(r.url).get(OAUTH.redirectUri))
    assert.equal(f.get(OAUTH.resource), w.c.url)
    assert.ok(f.get(OAUTH.codeVerifier))
    assert.equal(f.has(OAUTH.clientSecret), false)
    assert.equal(exchange.headers[WEB.authorization], undefined)
    const record = await w.n.record(M)
    assert.equal(record?.kind, 'grant')
  })
  caseTest(sdk, 'AUTH-UC-12', 'main 6', 'authorized: a stock child row (streamable-http, serverName m) on the loopback proxy; mcp__m__pair and mcp__m__whoami; whoami is dsh-n', async (t) => {
    const w = await adapterWorld(t, sdk)
    await signedIn(w)
    const proxy = w.n.proxyOf(M)
    assert.equal(proxy.config.transport, ADAPTER.transport)
    assert.equal(proxy.config.serverName, M)
    const u = new URL(proxy.url)
    assert.equal(u.hostname, FIXTURE.loopback)
    assert.equal(u.pathname, ADAPTER.proxyRoute(M))
    assert.equal(proxy.bearer.length, Math.ceil(K.bearerBytes * 4 / 3), 'the local bearer is not 32 bytes base64url')
    assert.match(proxy.bearer, /^[A-Za-z0-9_-]+$/)
    assert.ok(w.n.tool(ADAPTER.mcpTool(M, PAIR)))
    const call = await w.n.call(M, WHOAMI)
    assert.match(JSON.stringify(call.value), new RegExp(FIXTURE.agentId))
  })
  caseTest(sdk, 'AUTH-UC-12', 'main 7', 'a tool call and a subscriptions/listen stream go through the proxy with Authorization: Bearer <access token> upstream', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    await w.n.call(M, WHOAMI)
    const at = await storedToken(w.n)
    const call = toolCalls(w.c).at(-1)
    assert.equal(call.headers[WEB.authorization], WEB.bearer + at)
    const proxy = w.n.proxyOf(M)
    const listen = await openListen(proxy)
    t.after(() => listen.close())
    assert.ok(await eventually(() => listen.text().includes(RPC.acknowledged)), 'no acknowledgement through the proxy')
    assert.equal(w.c.mcpRequests().at(-1).headers[WEB.authorization], WEB.bearer + at)
  })
  caseTest(sdk, 'AUTH-UC-12', 'main 8', 'across three lifetimes: one refresh per lifetime at E − LEAD; the child row is never restarted and keeps working', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const fiber = w.n.child(M)
    const connects = discovers(w.c).length
    for (let i = 1; i <= ROWS.lifetimes; i += 1) {
      const E = (await w.n.record(M)).payload.tokens.expiresAt
      await w.clock.to(E - K.leadMs)
      assert.ok(await eventually(() => w.c.refreshRequests().length === i), `lifetime ${i}: ${w.c.refreshRequests().length} refreshes`)
      const call = await w.n.call(M, WHOAMI)
      assert.ok(call.value, `lifetime ${i}: the call failed: ${call.error}`)
    }
    assert.equal(w.c.refreshRequests().length, ROWS.lifetimes)
    assert.equal(w.n.child(M), fiber, 'the child row was replaced')
    assert.equal(discovers(w.c).length, connects, 'the child row reconnected')
    assert.equal(w.c.stats.reuse, 0)
  })
  caseTest(sdk, 'AUTH-UC-12', 'main 9', 'a later sign-in returns authorized and changes nothing', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const before = { requests: w.c.requests.length, record: await w.n.record(M) }
    assert.deepEqual(await w.n.signIn(M), { status: RESULT.authorized, server: M })
    assert.equal(w.c.requests.length, before.requests)
    assert.deepEqual(await w.n.record(M), before.record)
  })
  caseTest(sdk, 'AUTH-UC-12', 'A1', 'C restarts: the next call gets 401, one refresh, one retry; the call succeeds; no browser step', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    w.c.restart()
    const approvals = w.c.approvalRequests().length
    const call = await w.n.call(M, WHOAMI)
    assert.ok(call.value, 'the call failed: ' + call.error)
    assert.equal(w.c.refreshRequests().length, 1)
    assert.equal(w.c.approvalRequests().length, approvals)
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
  })
  caseTest(sdk, 'AUTH-UC-12', 'A2', 'N restarts: authorized from the stored grant, no request at start, child row mounted again', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const before = w.c.requests.length
    const fetches = w.recorder.calls.length
    await w.restart()
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
    await untilChild(w.n, M, WHOAMI)
    const sinceRestart = w.c.requests.slice(before)
    assert.deepEqual(sinceRestart.filter((r) => r.path !== K1.PATHS.mcp), [], 'a discovery, token or authorization request at start')
    assert.deepEqual(w.recorder.calls.slice(fetches).filter((x) => !new URL(x.url).pathname.startsWith(K1.PATHS.mcp)), [])
  })
  caseTest(sdk, 'AUTH-UC-12', 'A3', 'C drops the access token early: the call that hits the 401 succeeds after one refresh and one retry', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    w.c.dropAccess()
    const call = await w.n.call(M, WHOAMI)
    assert.ok(call.value, 'the call failed: ' + call.error)
    assert.equal(w.c.refreshRequests().length, 1)
  })
  caseTest(sdk, 'AUTH-UC-12', 'A4', 'eight calls on a dead access token: all succeed with exactly one refresh grant; no reuse at C', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    w.c.dropAccess()
    const calls = await Promise.all(Array.from({ length: ROWS.concurrentCalls }, () => w.n.call(M, WHOAMI)))
    assert.deepEqual(calls.filter((c) => c.error).map((c) => String(c.error)), [])
    assert.equal(w.c.refreshRequests().length, 1)
    assert.equal(w.c.stats.reuse, 0)
  })
  caseTest(sdk, 'AUTH-UC-12', 'A5', 'two N on one credential store both reach E − LEAD: one refresh grant in total; both use the new token', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    const n2 = await w.start(w.n.config, { name: 'n2' })
    assert.equal(n2.error, undefined)
    await untilState(n2, M, STATE.authorized)
    await untilChild(n2, M, WHOAMI)
    await w.clock.to(E - K.leadMs)
    assert.ok(await eventually(() => w.c.refreshRequests().length >= 1))
    assert.equal(await staysFalse(() => w.c.refreshRequests().length > 1), true, 'more than one refresh grant')
    assert.equal(w.c.stats.reuse, 0)
    const fresh = await eventually(async () => { const a = await storedToken(w.n); const b = await storedToken(n2); return a === b && a })
    assert.ok(fresh, 'the two Ns hold different tokens')
    for (const n of [w.n, n2]) {
      assert.ok((await n.call(M, WHOAMI)).value)
      assert.equal(toolCalls(w.c).at(-1).headers[WEB.authorization], WEB.bearer + fresh)
    }
  })
  caseTest(sdk, 'AUTH-UC-12', 'E1', 'the entry is disabled: the next refresh gets invalid_grant; needs-authorization, one warning, tokens dropped, child gone, no further refresh', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    w.c.disableEntry()
    const warnings = w.n.adapterLogs('warn').length
    await w.clock.to(E - K.leadMs)
    await untilState(w.n, M, STATE.needsAuthorization)
    const record = await w.n.record(M)
    assert.ok(record, 'the grant record was removed')
    assert.equal(record.payload.tokens, undefined, 'the tokens were kept')
    assert.ok(await eventually(() => w.n.child(M) === undefined), 'the child row stayed')
    assert.equal(w.n.adapterLogs('warn').length - warnings, 1, 'not exactly one warning: ' + logText(w.n.adapterLogs('warn')))
    const refreshes = w.c.refreshRequests().length
    await w.clock.advance(ROWS.quietHours * ROWS.hourMs)
    assert.equal(w.c.refreshRequests().length, refreshes, 'a refresh after invalid_grant')
  })
  caseTest(sdk, 'AUTH-UC-12', 'E2', 'Cancel: access_denied with iss; END; no child row', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    await browser.approve(w.c, r.url, { decision: OAUTH.decision.cancel })
    await untilState(w.n, M, END)
    assert.equal(w.n.children().length, 0)
    assert.equal(await w.n.record(M), undefined)
  })
  for (const [row, label, mutate] of [
    ['E3 (state)', 'a wrong state', (l) => l.searchParams.set(OAUTH.state, 'x' + l.searchParams.get(OAUTH.state))],
    ['E3 (iss)', 'a wrong iss', (l, w) => l.searchParams.set(OAUTH.iss, w.c.origin + FIXTURE.wrong.issuerPath)],
  ]) {
    caseTest(sdk, 'AUTH-UC-12', row, `a callback with ${label}: no code exchange, no grant; the attempt ends (END)`, async (t) => {
      const w = await adapterWorld(t, sdk)
      const r = await w.n.signIn(M)
      await browser.approve(w.c, r.url, { mutate: (l) => mutate(l, w) })
      await untilState(w.n, M, END)
      assert.equal(w.c.codeRequests().length, 0)
      assert.equal(await w.n.record(M), undefined)
    })
  }
  caseTest(sdk, 'AUTH-UC-12', 'E4', 'the 401 persists after the refresh and retry: the call fails; needs-authorization; no third request', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    w.c.script.rejectAllAccess = true
    const before = toolCalls(w.c).length
    const call = await w.n.call(M, WHOAMI)
    assert.ok(call.error, 'the call succeeded')
    assert.equal(toolCalls(w.c).length - before, 2, 'not exactly one request and one retry upstream')
    assert.equal(w.c.refreshRequests().length, 1)
    await untilState(w.n, M, STATE.needsAuthorization)
  })
  caseTest(sdk, 'AUTH-UC-12', 'E5', 'the adapter is disabled: the child row and its tools are gone and no refresh follows', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    await w.n.fiber.dispose()
    assert.ok(await eventually(() => w.n.children().length === 0), 'the child row stayed')
    assert.equal(w.n.tool(ADAPTER.mcpTool(M, WHOAMI)), undefined)
    await w.clock.to(E)
    assert.equal(w.c.refreshRequests().length, 0)
  })
  caseTest(sdk, 'AUTH-UC-12', 'post', 'C saw only standard OAuth requests: no secret, no registration, no non-standard header or grant', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    await w.n.call(M, WHOAMI)
    await w.clock.to(E - K.leadMs)
    await eventually(() => w.c.refreshRequests().length === 1)
    for (const r of w.c.tokenRequests()) {
      const f = new URLSearchParams(r.body)
      assert.ok([K1.GRANT.authorizationCode, K1.GRANT.refreshToken].includes(f.get(OAUTH.grantType)), 'grant ' + f.get(OAUTH.grantType))
      assert.equal(f.has(OAUTH.clientSecret), false)
      assert.equal(r.headers[WEB.authorization], undefined)
    }
    assert.deepEqual(w.c.requests.filter((r) => r.path.includes(OAUTH.registrationPath)), [])
    assert.deepEqual(w.c.requests.flatMap((r) => Object.keys(r.headers)).filter((h) => /^x-|fishball|dsh/i.test(h)), [])
  })

  // ================================================================== AUTH-UC-13 / AUTH-EP-12
  const noSetting = (c) => ({ servers: [{ serverName: M, url: c.url }] })
  caseTest(sdk, 'AUTH-UC-13', 'main 1–2', 'no clientMetadataUrl: needs-configuration (missing); sign-in returns it with no URL; no request', async (t) => {
    const w = await adapterWorld(t, sdk, { config: noSetting })
    assert.deepEqual(pick(w.n.stateOf(M)), { state: STATE.needsConfiguration, reason: REASON.missing })
    assert.equal(w.n.children().length, 0)
    const r = await w.n.signIn(M)
    assert.deepEqual(r, { status: RESULT.needsConfiguration, server: M, reason: REASON.missing })
    assert.deepEqual(w.c.requests, [])
  })
  caseTest(sdk, 'AUTH-UC-13', 'main 3', 'the owner saves a valid setting: needs-authorization; the next sign-in proceeds with the CIMD client id', async (t) => {
    const w = await adapterWorld(t, sdk, { config: noSetting })
    await w.n.fiber.update({ ...noSetting(w.c), clientMetadataUrl: FIXTURE.cimd })
    await untilState(w.n, M, STATE.needsAuthorization)
    assert.deepEqual(w.c.requests, [], 'a request on saving the setting')
    const r = await w.n.signIn(M)
    assert.equal(r.status, RESULT.approvalUrl)
    assert.equal(paramsOf(r.url).get(OAUTH.clientId), FIXTURE.cimd)
  })
  caseTest(sdk, 'AUTH-EP-12', 1, 'absent: needs-configuration (missing); sign-in needs-configuration; no request', async (t) => {
    const w = await adapterWorld(t, sdk, { config: noSetting })
    await expectConfigRefusal(w, REASON.missing)
  })
  caseTest(sdk, 'AUTH-EP-12', 2, 'empty: as row 1 (missing)', async (t) => {
    const w = await adapterWorld(t, sdk, { config: (c) => ({ ...noSetting(c), clientMetadataUrl: '' }) })
    await expectConfigRefusal(w, REASON.missing)
  })
  for (const [row, label, value] of ROWS.invalidUrls) {
    caseTest(sdk, 'AUTH-EP-12', row, `${label} (${value}): needs-configuration (invalid); no request`, async (t) => {
      const w = await adapterWorld(t, sdk, { config: (c) => ({ ...noSetting(c), clientMetadataUrl: value }) })
      await expectConfigRefusal(w, REASON.invalid)
    })
  }
  caseTest(sdk, 'AUTH-EP-12', 7, 'https with a non-root path: needs-authorization; approval-url whose client_id is exactly the value', async (t) => {
    const w = await adapterWorld(t, sdk)
    assert.equal(w.n.stateOf(M).state, STATE.needsAuthorization)
    const r = await w.n.signIn(M)
    assert.equal(paramsOf(r.url).get(OAUTH.clientId), FIXTURE.cimd)
  })
  caseTest(sdk, 'AUTH-EP-12', 8, 'valid, then removed, with no grant: needs-configuration again (= AUTH-UC-13 E1)', async (t) => {
    const w = await adapterWorld(t, sdk)
    await w.n.fiber.update(noSetting(w.c))
    await untilState(w.n, M, STATE.needsConfiguration)
    await expectConfigRefusal(w, REASON.missing)
  })
  caseTest(sdk, 'AUTH-UC-13', 'A1/E1', 'an invalid value saved after a valid one, no grant: needs-configuration (invalid)', async (t) => {
    const w = await adapterWorld(t, sdk)
    await w.n.fiber.update({ ...noSetting(w.c), clientMetadataUrl: ROWS.invalidUrls[0][2] })
    await untilState(w.n, M, STATE.needsConfiguration)
    await expectConfigRefusal(w, REASON.invalid)
  })
  caseTest(sdk, 'AUTH-EP-12', '8b', 'a stored grant, then an invalid setting: needs-configuration, no child, no refresh, no request, record untouched; valid again → authorized with no browser', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    const before = await w.n.record(M)
    const requests = w.c.requests.length
    await w.n.fiber.update({ ...noSetting(w.c), clientMetadataUrl: ROWS.invalidUrls[0][2] })
    await untilState(w.n, M, STATE.needsConfiguration)
    assert.ok(await eventually(() => w.n.children().length === 0), 'the child row stayed')
    await w.clock.to(E - K.leadMs)
    assert.equal(await staysFalse(() => w.c.requests.length > requests), true, 'a request while needs-configuration')
    assert.deepEqual(await w.n.record(M), before)
    await w.n.fiber.update({ ...noSetting(w.c), clientMetadataUrl: FIXTURE.cimd })
    await untilState(w.n, M, STATE.authorized)
    assert.equal(w.c.approvalPages().length, 1, 'a second browser step')
  })

  // ================================================================== AUTH-UC-14 / AUTH-DT-11
  const otherConfig = () => ({ clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: X, url: FIXTURE.other.origin + FIXTURE.other.mcpPath }] })
  caseTest(sdk, 'AUTH-UC-14', 'main', 'a stock OAuth MCP server: needs-configuration (not-a-dsh-connector); no URL, no request, no grant, no child', async (t) => {
    const w = await adapterWorld(t, sdk, { config: otherConfig })
    const r = await w.n.signIn(X)
    assert.deepEqual(r, { status: RESULT.needsConfiguration, server: X, reason: REASON.notDsh })
    assert.deepEqual(pick(w.n.stateOf(X)), { state: STATE.needsConfiguration, reason: REASON.notDsh })
    assert.deepEqual(w.other.forbiddenRequests(), [])
    assert.equal(await w.n.record(X), undefined)
    assert.equal(w.n.children().length, 0)
  })
  caseTest(sdk, 'AUTH-UC-14', 'E1', 'a second call: the same result; still no authorization, registration or token request', async (t) => {
    const w = await adapterWorld(t, sdk, { config: otherConfig })
    const first = await w.n.signIn(X)
    assert.deepEqual(await w.n.signIn(X), first)
    assert.deepEqual(w.other.forbiddenRequests(), [])
  })
  caseTest(sdk, 'AUTH-DT-11', 'rule 1', 'a DSH connector: approval-url; nothing after the metadata reads until the browser acts', async (t) => {
    const w = await adapterWorld(t, sdk)
    assert.equal((await w.n.signIn(M)).status, RESULT.approvalUrl)
    assert.deepEqual(w.forbidden(), [])
  })
  const rules = [
    [2, 'PRM resource is another URL', (c) => ({ resource: c.origin + FIXTURE.wrong.resourcePath })],
    [3, 'authorization_servers[0] on another origin', () => ({ authorizationServers: [FIXTURE.other.origin + K1.PATHS.issuer] })],
    [4, 'authorization_servers[0] on another path', (c) => ({ authorizationServers: [c.origin + FIXTURE.wrong.issuerPath] })],
    [5, 'scopes_supported lacks agent', () => ({ scopes: [...FIXTURE.other.scopes] })],
    [6, 'scopes_supported absent', () => ({ scopes: null })],
    [8, 'only the second authorization server is the connector\'s', (c) => ({ authorizationServers: [FIXTURE.other.origin + FIXTURE.other.issuerPath, c.urls.issuer] })],
  ]
  for (const [rule, label, metadata] of rules) {
    caseTest(sdk, 'AUTH-DT-11', `rule ${rule}`, `${label}: refused, needs-configuration (not-a-dsh-connector); no request after the reads`, async (t) => {
      const w = await adapterWorld(t, sdk)
      w.c.script.metadata = metadata(w.c)
      await expectNotDsh(w, M)
    })
  }
  caseTest(sdk, 'AUTH-DT-11', 'rule 7', 'the configured path is /mcp: refused, needs-configuration; no request after the reads', async (t) => {
    const w = await adapterWorld(t, sdk, { config: (c) => ({ clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: M, url: c.origin + FIXTURE.wrong.mcpPath }] }) })
    await expectNotDsh(w, M)
  })
  for (const [rule, label, arrange] of [
    ['9a', 'unreachable (a closed port)', async () => ({ url: `http://${FIXTURE.loopback}:${await closedPort()}${K1.PATHS.mcp}` })],
    ['9b', 'the PRM answers 500', async (w) => { w.c.script.prm = 'status'; return {} }],
    ['9c', 'the PRM is not JSON', async (w) => { w.c.script.prm = 'not-json'; return {} }],
  ]) {
    caseTest(sdk, 'AUTH-DT-11', `rule ${rule}`, `${label}: failed (discovery-failed); no sign-in; no request after the reads`, async (t) => {
      const w = await adapterWorld(t, sdk, { start: false })
      const { url } = await arrange(w)
      w.n = await w.start({ clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: M, url: url ?? w.c.url }] })
      const r = await w.n.signIn(M)
      assert.deepEqual(r, { status: RESULT.failed, server: M, reason: REASON.discoveryFailed })
      assert.deepEqual(pick(w.n.stateOf(M)), { state: STATE.failed, reason: REASON.discoveryFailed })
      assert.deepEqual(w.forbidden(), [])
    })
  }

  // ================================================================== AUTH-DT-12
  caseTest(sdk, 'AUTH-DT-12', 'rule 1', 'setting missing: needs-configuration (client-id setting missing); no request', async (t) => {
    const w = await adapterWorld(t, sdk, { config: noSetting })
    assert.equal((await w.n.signIn(M)).reason, REASON.missing)
    assert.deepEqual(w.c.requests, [])
  })
  caseTest(sdk, 'AUTH-DT-12', 'rule 2', 'not a DSH connector: needs-configuration (not-a-dsh-connector); no authorization/registration/token request', async (t) => {
    const w = await adapterWorld(t, sdk, { config: otherConfig })
    assert.equal((await w.n.signIn(X)).reason, REASON.notDsh)
    assert.deepEqual(w.other.forbiddenRequests(), [])
  })
  caseTest(sdk, 'AUTH-DT-12', 'rule 3', 'live tokens: authorized; no request; no new attempt', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const before = w.c.requests.length
    assert.equal((await w.n.signIn(M)).status, RESULT.authorized)
    assert.equal(w.c.requests.length, before)
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
  })
  caseTest(sdk, 'AUTH-DT-12', 'rule 4', 'no tokens, nothing pending: approval-url with a new URL; authorizing', async (t) => {
    const w = await adapterWorld(t, sdk)
    assert.equal((await w.n.signIn(M)).status, RESULT.approvalUrl)
    assert.equal(w.n.stateOf(M).state, STATE.authorizing)
  })
  caseTest(sdk, 'AUTH-DT-12', 'rule 5', 'pending: the same URL, byte-identical; no second attempt or listener', async (t) => {
    const w = await adapterWorld(t, sdk)
    const first = await w.n.signIn(M)
    const listening = listeningEndpoints()
    const second = await w.n.signIn(M)
    assert.equal(second.url, first.url)
    assert.deepEqual(listeningEndpoints(), listening, 'a second listener opened')
  })
  caseTest(sdk, 'AUTH-DT-12', 'rule 6a', 'the last attempt was cancelled: a new URL (new state); the old one stays dead', async (t) => {
    const w = await adapterWorld(t, sdk)
    const first = await w.n.signIn(M)
    await browser.approve(w.c, first.url, { decision: OAUTH.decision.cancel })
    await untilState(w.n, M, END)
    const second = await w.n.signIn(M)
    assert.notEqual(second.url, first.url)
    assert.notEqual(paramsOf(second.url).get(OAUTH.state), paramsOf(first.url).get(OAUTH.state))
    assert.equal(await portAccepts(callbackPortOf(first.url)), callbackPortOf(first.url) === callbackPortOf(second.url))
  })
  caseTest(sdk, 'AUTH-DT-12', 'rule 6b', 'tokens dropped by invalid_grant: a new URL', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    w.c.disableEntry()
    await w.clock.to(E - K.leadMs)
    await untilState(w.n, M, STATE.needsAuthorization)
    const r = await w.n.signIn(M)
    assert.equal(r.status, RESULT.approvalUrl)
  })
  caseTest(sdk, 'AUTH-DT-12', 'rule 7', 'the result returns before any approval (no browser action at all)', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await Promise.race([w.n.signIn(M), new Promise((resolve) => setTimeout(() => resolve('waited'), WAIT.eventuallyMs))])
    assert.notEqual(r, 'waited')
    assert.equal(w.c.approvalRequests().length, 0)
  })
  caseTest(sdk, 'AUTH-DT-12', 'rule 8', 'an unknown server: {status: unknown-server, server}; nothing changes; no request', async (t) => {
    const w = await adapterWorld(t, sdk)
    const before = JSON.stringify(w.n.status())
    assert.deepEqual(await w.n.signIn('nobody'), { status: RESULT.unknownServer, server: 'nobody' })
    assert.equal(JSON.stringify(w.n.status()), before)
    assert.deepEqual(w.c.requests, [])
  })

  // ================================================================== AUTH-ST-06
  caseTest(sdk, 'AUTH-ST-06', 1, '(start), setting missing → needs-configuration; no child; no request', async (t) => {
    const w = await adapterWorld(t, sdk, { config: noSetting })
    assert.equal(w.n.stateOf(M).state, STATE.needsConfiguration)
    assert.equal(w.n.children().length, 0)
    assert.deepEqual(w.c.requests, [])
  })
  caseTest(sdk, 'AUTH-ST-06', '1b', '(start), setting invalid, a stored grant → needs-configuration; no child; no request (K)', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const before = w.c.requests.length
    await w.restart({ ...noSetting(w.c), clientMetadataUrl: ROWS.invalidUrls[0][2] })
    assert.deepEqual(pick(w.n.stateOf(M)), { state: STATE.needsConfiguration, reason: REASON.invalid })
    assert.equal(await staysFalse(() => w.n.children().length > 0), true)
    assert.equal(w.c.requests.length, before)
  })
  caseTest(sdk, 'AUTH-ST-06', 2, 'needs-configuration + a valid setting saved → needs-authorization; no request yet', async (t) => {
    const w = await adapterWorld(t, sdk, { config: noSetting })
    await w.n.fiber.update({ ...noSetting(w.c), clientMetadataUrl: FIXTURE.cimd })
    await untilState(w.n, M, STATE.needsAuthorization)
    assert.deepEqual(w.c.requests, [])
  })
  caseTest(sdk, 'AUTH-ST-06', 3, '(start), valid, no grant → needs-authorization; no child; no discovery at start', async (t) => {
    const w = await adapterWorld(t, sdk)
    assert.equal(w.n.stateOf(M).state, STATE.needsAuthorization)
    assert.equal(w.n.children().length, 0)
    assert.deepEqual(w.recorder.calls, [])
  })
  caseTest(sdk, 'AUTH-ST-06', 4, '(start), valid, a stored grant → authorized; child mounted; no browser and no token request at start', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const tokens = w.c.tokenRequests().length
    const approvals = w.c.approvalRequests().length
    await w.restart()
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
    await untilChild(w.n, M, WHOAMI)
    assert.equal(w.c.tokenRequests().length, tokens)
    assert.equal(w.c.approvalRequests().length, approvals)
  })
  caseTest(sdk, 'AUTH-ST-06', 5, 'needs-authorization + the check fails at sign-in → needs-configuration; no auth/registration/token request', async (t) => {
    const w = await adapterWorld(t, sdk)
    assert.equal(w.n.stateOf(M).state, STATE.needsAuthorization)
    w.c.script.metadata = { scopes: null }
    await expectNotDsh(w, M)
  })
  caseTest(sdk, 'AUTH-ST-06', 6, 'needs-authorization + sign-in, check passes → authorizing; approval-url', async (t) => {
    const w = await adapterWorld(t, sdk)
    assert.equal((await w.n.signIn(M)).status, RESULT.approvalUrl)
    assert.equal(w.n.stateOf(M).state, STATE.authorizing)
  })
  caseTest(sdk, 'AUTH-ST-06', 7, 'authorizing + sign-in → authorizing; the same URL', async (t) => {
    const w = await adapterWorld(t, sdk)
    const first = await w.n.signIn(M)
    assert.equal((await w.n.signIn(M)).url, first.url)
    assert.equal(w.n.stateOf(M).state, STATE.authorizing)
  })
  caseTest(sdk, 'AUTH-ST-06', 8, 'authorizing + a valid callback → authorized; code exchanged; grant committed; child mounted', async (t) => {
    const w = await adapterWorld(t, sdk)
    await signedIn(w)
    assert.equal(w.c.codeRequests().length, 1)
    assert.ok((await w.n.record(M))?.payload?.tokens)
    assert.ok(w.n.child(M))
  })
  caseTest(sdk, 'AUTH-ST-06', 9, 'authorizing + a wrong state → END (K: Ended(rejected)); no exchange; no grant', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    await browser.approve(w.c, r.url, { mutate: (l) => l.searchParams.set(OAUTH.state, 'forged') })
    await untilState(w.n, M, END)
    assert.equal(w.c.codeRequests().length, 0)
    assert.equal(await w.n.record(M), undefined)
  })
  caseTest(sdk, 'AUTH-ST-06', 10, 'authorizing + access_denied → END; no child', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    await browser.approve(w.c, r.url, { decision: OAUTH.decision.cancel })
    await untilState(w.n, M, END)
    assert.equal(w.n.children().length, 0)
  })
  caseTest(sdk, 'AUTH-ST-06', 11, 'authorizing + TIMEOUT → END; the URL is dead (its callback no longer accepts)', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    await w.clock.advance(K.timeoutMs)
    await untilState(w.n, M, END)
    assert.ok(await eventually(async () => !(await portAccepts(callbackPortOf(r.url)))), 'the callback still listens')
  })
  for (const [row, label, arrange, mutate] of [
    ['12a', 'server_error at the code exchange', (w) => { w.c.script.tokenError = { grant: K1.GRANT.authorizationCode, error: K1.OAUTH_ERROR.serverError, status: WEB.serverError } }, undefined],
    ['12b', 'server_error on the callback', () => {}, (l) => { l.searchParams.delete(OAUTH.code); l.searchParams.set(OAUTH.error, K1.OAUTH_ERROR.serverError) }],
  ]) {
    caseTest(sdk, 'AUTH-ST-06', row, `authorizing + ${label} → failed (authorization-failed)`, async (t) => {
      const w = await adapterWorld(t, sdk)
      arrange(w)
      const r = await w.n.signIn(M)
      await browser.approve(w.c, r.url, { mutate })
      const entry = await untilState(w.n, M, STATE.failed)
      assert.equal(entry.reason, REASON.authorizationFailed)
      assert.equal(await w.n.record(M), undefined)
    })
  }
  caseTest(sdk, 'AUTH-ST-06', 13, 'authorized + LEAD before expiry → authorized; one refresh; no row restart', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    const fiber = w.n.child(M)
    await w.clock.to(E - K.leadMs)
    assert.ok(await eventually(() => w.c.refreshRequests().length === 1))
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
    assert.equal(w.n.child(M), fiber)
  })
  caseTest(sdk, 'AUTH-ST-06', 14, 'authorized + 401 after a connector restart, refresh succeeds → authorized; the call succeeds', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    w.c.restart()
    assert.ok((await w.n.call(M, WHOAMI)).value)
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
  })
  caseTest(sdk, 'AUTH-ST-06', 15, 'authorized + invalid_grant on refresh → needs-authorization; tokens dropped; one warning; no loop', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    w.c.disableEntry()
    w.c.restart()
    const call = await w.n.call(M, WHOAMI)
    assert.ok(call.error)
    await untilState(w.n, M, STATE.needsAuthorization)
    assert.equal((await w.n.record(M)).payload.tokens, undefined)
    const refreshes = w.c.refreshRequests().length
    await w.clock.to(E + ROWS.hourMs)
    assert.equal(w.c.refreshRequests().length, refreshes)
  })
  caseTest(sdk, 'AUTH-ST-06', 16, 'authorized + 401 again after the retry → needs-authorization; no third request', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    w.c.script.rejectAllAccess = true
    const before = toolCalls(w.c).length
    await w.n.call(M, WHOAMI)
    await untilState(w.n, M, STATE.needsAuthorization)
    assert.equal(toolCalls(w.c).length - before, 2)
  })
  caseTest(sdk, 'AUTH-ST-06', 17, 'authorized + the grant record is removed → needs-authorization; child row disposed of', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    await w.n.host.ctx.credentials.deleteRecord(w.n.key(M))
    await untilState(w.n, M, STATE.needsAuthorization)
    assert.ok(await eventually(() => w.n.child(M) === undefined), 'the child row stayed')
  })
  caseTest(sdk, 'AUTH-ST-06', 18, 'authorized + sign-in → authorized; nothing changes', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const fiber = w.n.child(M)
    assert.equal((await w.n.signIn(M)).status, RESULT.authorized)
    assert.equal(w.n.child(M), fiber)
  })
  caseTest(sdk, 'AUTH-ST-06', 19, 'any + adapter disabled → stopped: no refresh, no child row, nothing written but the credentials file', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    const files = new Map(fs.readdirSync(w.root, { recursive: true }).map(String).map((f) => [f, statOf(w.root, f)]))
    await w.n.fiber.dispose()
    await w.clock.to(E + ROWS.hourMs)
    assert.equal(w.c.refreshRequests().length, 0)
    assert.equal(w.n.children().length, 0)
    const now = new Map(fs.readdirSync(w.root, { recursive: true }).map(String).map((f) => [f, statOf(w.root, f)]))
    const changed = [...now].filter(([f, s]) => files.get(f) !== s).map(([f]) => f)
    assert.deepEqual(changed.filter((f) => !f.startsWith('.credentials.yaml')), [])
  })

  // ================================================================== AUTH-ST-07
  caseTest(sdk, 'AUTH-ST-07', 1, '(none) + sign-in → Pending(u1); the callback listens on a fresh OS port', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    assert.equal(await portAccepts(callbackPortOf(r.url)), true)
  })
  caseTest(sdk, 'AUTH-ST-07', 2, 'Pending(u1) + sign-in → u1 byte-identical; no second attempt, no second listener', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    const listening = listeningEndpoints()
    const again = await w.n.signIn(M)
    assert.equal(again.url, r.url)
    assert.deepEqual(listeningEndpoints(), listening)
  })
  caseTest(sdk, 'AUTH-ST-07', '3 + 7', 'Pending + valid callback → Ended(authorized); replaying the redirect is not accepted', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    let back
    await browser.approve(w.c, r.url, { mutate: (l) => { back = new URL(l) } })
    await untilState(w.n, M, STATE.authorized)
    await browser.follow(back)
    assert.equal(w.c.codeRequests().length, 1)
  })
  caseTest(sdk, 'AUTH-ST-07', '3a', 'Pending + wrong state → Ended(rejected) (K); no exchange; a correct replay is not accepted', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    let good
    await browser.approve(w.c, r.url, { mutate: (l) => { good = new URL(l); l.searchParams.set(OAUTH.state, 'forged') } })
    await untilState(w.n, M, END)
    await browser.follow(good)
    assert.equal(w.c.codeRequests().length, 0)
    assert.equal(await w.n.record(M), undefined)
  })
  caseTest(sdk, 'AUTH-ST-07', '4 + 7', 'Pending + access_denied → Ended(denied); a later redirect for u1 is not accepted', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    let back
    await browser.approve(w.c, r.url, { decision: OAUTH.decision.cancel, mutate: (l) => { back = new URL(l) } })
    await untilState(w.n, M, END)
    back.searchParams.delete(OAUTH.error)
    back.searchParams.set(OAUTH.code, 'fbtest-late-code')
    await browser.follow(back)
    assert.equal(w.c.codeRequests().length, 0)
  })
  caseTest(sdk, 'AUTH-ST-07', '5 + 7', 'Pending + TIMEOUT → Ended(expired); a later redirect for u1 is not accepted', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    await w.clock.advance(K.timeoutMs)
    await untilState(w.n, M, END)
    await browser.approve(w.c, r.url).catch(() => {})
    assert.equal(w.c.codeRequests().length, 0)
    assert.equal(await w.n.record(M), undefined)
  })
  caseTest(sdk, 'AUTH-ST-07', 6, 'Pending + N restarts → Ended: the callback refuses; a new sign-in gives u2 ≠ u1', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    await w.restart()
    assert.ok(await eventually(async () => !(await portAccepts(callbackPortOf(r.url)))), 'the old callback still listens')
    assert.equal(w.n.stateOf(M).state, STATE.needsAuthorization)
    const again = await w.n.signIn(M)
    assert.notEqual(again.url, r.url)
  })
  caseTest(sdk, 'AUTH-ST-07', 8, 'Ended(denied / expired) + sign-in → u2 with a new state and a new code_challenge', async (t) => {
    const w = await adapterWorld(t, sdk)
    const u1 = await w.n.signIn(M)
    await browser.approve(w.c, u1.url, { decision: OAUTH.decision.cancel })
    await untilState(w.n, M, END)
    const u2 = await w.n.signIn(M)
    await w.clock.advance(K.timeoutMs)
    await untilState(w.n, M, END)
    const u3 = await w.n.signIn(M)
    for (const [a, b] of [[u1, u2], [u2, u3]]) {
      assert.notEqual(paramsOf(b.url).get(OAUTH.state), paramsOf(a.url).get(OAUTH.state))
      assert.notEqual(paramsOf(b.url).get(OAUTH.codeChallenge), paramsOf(a.url).get(OAUTH.codeChallenge))
    }
  })
  caseTest(sdk, 'AUTH-ST-07', 9, 'Ended(authorized) + sign-in → authorized; no URL', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const r = await w.n.signIn(M)
    assert.equal(r.status, RESULT.authorized)
    assert.equal(r.url, undefined)
  })

  // ================================================================== AUTH-BVA-09
  caseTest(sdk, 'AUTH-BVA-09', '1–3', 'E − LEAD − 1 ms: no refresh; E − LEAD: exactly one; E − LEAD + 1 ms: no second', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    await w.clock.to(E - K.leadMs - K.tickMs)
    assert.equal(await staysFalse(() => w.c.refreshRequests().length > 0), true, 'row 1: a refresh before E − LEAD')
    await w.clock.to(E - K.leadMs)
    assert.ok(await eventually(() => w.c.refreshRequests().length === 1), 'row 2: no refresh at E − LEAD')
    await w.clock.to(E - K.leadMs + K.tickMs)
    assert.equal(await staysFalse(() => w.c.refreshRequests().length > 1), true, 'row 3: a second refresh')
  })
  caseTest(sdk, 'AUTH-BVA-09', 4, 'one 401: one refresh, one retry; the call succeeds', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    w.c.dropAccess()
    const before = toolCalls(w.c).length
    assert.ok((await w.n.call(M, WHOAMI)).value)
    assert.equal(toolCalls(w.c).length - before, 2)
    assert.equal(w.c.refreshRequests().length, 1)
  })
  caseTest(sdk, 'AUTH-BVA-09', 5, 'two 401s: the call fails; needs-authorization; two upstream requests and one refresh', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    w.c.script.rejectAllAccess = true
    const before = toolCalls(w.c).length
    assert.ok((await w.n.call(M, WHOAMI)).error)
    assert.equal(toolCalls(w.c).length - before, 2)
    assert.equal(w.c.refreshRequests().length, 1)
    await untilState(w.n, M, STATE.needsAuthorization)
  })
  caseTest(sdk, 'AUTH-BVA-09', 6, 'pending at TIMEOUT − 1 ms: a sign-in returns the same URL', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    await w.clock.advance(K.timeoutMs - K.tickMs)
    assert.equal((await w.n.signIn(M)).url, r.url)
  })
  caseTest(sdk, 'AUTH-BVA-09', 7, 'pending at TIMEOUT: ended (END); a sign-in returns a new URL', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    await w.clock.advance(K.timeoutMs)
    await untilState(w.n, M, END)
    assert.notEqual((await w.n.signIn(M)).url, r.url)
  })
  caseTest(sdk, 'AUTH-BVA-09', 8, 'the frozen TIMEOUT ≤ the connector\'s 600 s pending lifetime', async () => {
    assert.ok(K.timeoutMs <= K.pendingLifetimeMs)
  })
  caseTest(sdk, 'AUTH-BVA-09', '9 (K)', 'start with a stored grant already within LEAD: no refresh at +999 ms, one at +1000 ms (minimum delay)', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    await w.n.stop()
    await w.clock.to(E - K.leadMs + K.tickMs)
    w.n = await w.start(w.n.config)
    await w.clock.advance(K.minRefreshDelayMs - K.tickMs)
    assert.equal(await staysFalse(() => w.c.refreshRequests().length > 0), true, 'a refresh before the minimum delay')
    await w.clock.advance(K.tickMs)
    assert.ok(await eventually(() => w.c.refreshRequests().length === 1), 'no refresh at the minimum delay')
  })
  caseTest(sdk, 'AUTH-BVA-09', '10 (K)', 'start with a stored grant before E − LEAD: no request at start', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const before = w.recorder.calls.length
    const tokenReqs = w.c.tokenRequests().length
    await w.restart()
    assert.equal(w.c.tokenRequests().length, tokenReqs)
    assert.deepEqual(w.recorder.calls.slice(before).filter((x) => !new URL(x.url).pathname.startsWith(K1.PATHS.mcp)), [])
  })

  // ================================================================== AUTH-EP-13 leak check
  caseTest(sdk, 'AUTH-EP-13', '1–8', 'no planted value in config, logs, results, transcript, files, status or upstream URLs; .credentials.yaml 0600 holds the grant only', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    await w.n.call(M, WHOAMI)
    w.c.dropAccess()
    await w.n.call(M, WHOAMI)
    await w.clock.to((await w.n.record(M)).payload.tokens.expiresAt - K.leadMs)
    await eventually(() => w.c.refreshRequests().length >= 2)
    await w.n.signIn(M)
    const bearer = w.n.proxyOf(M).bearer
    const planted = new Set([...w.c.planted, bearer])
    const childConfig = { ...w.n.child(M).config, headers: undefined }
    const hits = leakHits(planted, {
      places: {
        'row 1 config': JSON.stringify(w.n.fiber.config) + JSON.stringify(childConfig),
        'row 2 logs': logText(w.n.host.logs),
        'row 3 results': JSON.stringify(w.n.results.map((r) => r.value)),
        'row 4 transcript': JSON.stringify(w.n.results.map((r) => r.rendered)),
        'row 8 status': JSON.stringify(w.n.status()),
      },
      dirs: [w.root, ...sweepableHome()],
      allowed: [w.n.host.credentialsFile],
    })
    assert.deepEqual(hits, [])
    for (const r of w.n.results.filter((x) => x.value.url)) assert.deepEqual([...paramsOf(r.value.url).keys()].filter((k) => !OAUTH.urlParams.includes(k)), [], 'row 3: extra URL parameters')
    assert.equal(modeOf(w.n.host.credentialsFile), DSH.fileMode, 'row 6: mode')
    const store = fs.readFileSync(w.n.host.credentialsFile, 'utf8')
    assert.ok(store.includes(await storedToken(w.n)), 'row 6: the grant is not in .credentials.yaml')
    assert.equal(store.includes(w.c.entry.token), false, 'row 6: the connector token is in .credentials.yaml')
    assert.equal(store.includes(bearer), false, 'row 6: the local bearer is on disk')
    for (const r of w.c.mcpRequests()) {
      for (const v of planted) assert.equal(r.path.includes(v) || r.query.includes(v), false, 'row 7: a secret in an upstream URL')
      assert.equal(JSON.stringify(r.headers).includes(bearer), false, 'row 7: the local bearer upstream')
    }
    assert.ok(E > 0)
  })

  // ================================================================== AUTH-EP-14 proxy
  caseTest(sdk, 'AUTH-EP-14', 1, 'the correct local bearer: forwarded with the real access token; the response comes back', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const p = w.n.proxyOf(M)
    const id = nextId()
    const r = await proxyRequest(p.url, { headers: mcpHeaders(p.auth), body: callBody(id) })
    assert.equal(r.status, WEB.ok)
    assert.match(r.body, new RegExp(FIXTURE.agentId))
    assert.equal(forwardedOf(w.c, id)[0]?.headers[WEB.authorization], WEB.bearer + await storedToken(w.n))
  })
  for (const [row, label, authOf] of [
    [2, 'no Authorization header', () => undefined],
    [3, 'a wrong bearer of the same length', (p) => WEB.bearer + flip(p.bearer)],
    [4, 'a wrong bearer of another length', (p) => WEB.bearer + p.bearer + 'x'],
  ]) {
    caseTest(sdk, 'AUTH-EP-14', row, `${label}: refused at the proxy; nothing forwarded`, async (t) => {
      const { w } = await authorizedWorld(t, sdk)
      const p = w.n.proxyOf(M)
      const id = nextId()
      const r = await proxyRequest(p.url, { headers: mcpHeaders(authOf(p)), body: callBody(id) })
      assert.ok(isClientError(r.status), 'answered ' + r.status)
      assert.deepEqual(forwardedOf(w.c, id), [])
    })
  }
  caseTest(sdk, 'AUTH-EP-14', 5, 'a bearer from before an N restart: refused (per start, never on disk)', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const old = w.n.proxyOf(M)
    await w.restart()
    await untilChild(w.n, M, WHOAMI)
    const now = w.n.proxyOf(M)
    assert.notEqual(now.bearer, old.bearer)
    const id = nextId()
    const r = await proxyRequest(now.url, { headers: mcpHeaders(old.auth), body: callBody(id) })
    assert.ok(isClientError(r.status), 'answered ' + r.status)
    assert.deepEqual(forwardedOf(w.c, id), [])
  })
  caseTest(sdk, 'AUTH-EP-14', 6, 'the caller\'s own Authorization is never forwarded (no token passthrough)', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    await w.n.call(M, WHOAMI)
    const p = w.n.proxyOf(M)
    for (const r of w.c.mcpRequests()) assert.notEqual(r.headers[WEB.authorization], p.auth)
    const id = nextId()
    await proxyRequest(p.url, { headers: mcpHeaders(WEB.bearer + ROWS.callerToken), body: callBody(id) })
    for (const r of forwardedOf(w.c, id)) assert.equal(r.headers[WEB.authorization].includes(ROWS.callerToken), false)
  })
  for (const [row, label, named] of [
    [7, 'the listed hop-by-hop headers (connection, keep-alive, transfer-encoding, upgrade, te, trailer, proxy-authorization)', false],
    ['7b', 'a header the Connection header names (hop-by-hop by RFC 9110 §7.6.1)', true],
  ]) {
    caseTest(sdk, 'AUTH-EP-14', row, `${label}: not forwarded; a chunked body arrives whole`, async (t) => {
      const { w } = await authorizedWorld(t, sdk)
      const p = w.n.proxyOf(M)
      const id = nextId()
      const headers = { ...mcpHeaders(p.auth), ...HOP.headers, connection: named ? 'keep-alive, ' + HOP.named : 'keep-alive' }
      if (named) headers[HOP.named] = 'drop-me'
      const r = await proxyRequest(p.url, { headers, body: callBody(id), chunked: true })
      assert.equal(r.status, WEB.ok)
      const [up] = forwardedOf(w.c, id)
      assert.ok(up, 'not forwarded')
      const dropped = named ? [HOP.named] : Object.keys(HOP.headers)
      for (const h of dropped) assert.equal(up.headers[h], undefined, h + ' was forwarded')
      if (!named) assert.ok(up.headers.connection === undefined || up.headers.connection === 'keep-alive' || up.headers.connection === 'close', 'the caller\'s connection header was forwarded: ' + up.headers.connection)
      assert.equal(up.headers[HOP.endToEnd], K1.PROTOCOL.version, 'an end-to-end header was lost')
      assert.equal(JSON.parse(up.body).id, id)
    })
  }
  caseTest(sdk, 'AUTH-EP-14', 8, 'the proxy listens on 127.0.0.1 only', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const u = new URL(w.n.proxyOf(M).url)
    assert.equal(u.hostname, FIXTURE.loopback)
    const mine = listeningEndpoints().filter((e) => e.endsWith(':' + u.port))
    assert.deepEqual(mine, [`${FIXTURE.loopback}:${u.port}`])
  })
  caseTest(sdk, 'AUTH-EP-14', 9, 'a subscriptions/listen stream stays open and streams events', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const listen = await openListen(w.n.proxyOf(M))
    t.after(() => listen.close())
    assert.ok(await eventually(() => listen.text().includes(RPC.acknowledged)))
    await new Promise((resolve) => setTimeout(resolve, WAIT.quietMs))
    w.c.emitEvent()
    assert.ok(await eventually(() => listen.text().includes(RPC.resourceUpdated)), 'the event did not stream through')
    assert.equal(listen.ended(), false)
  })
  caseTest(sdk, 'AUTH-EP-14', 10, 'a body at the 8 MiB cap is forwarded; one byte over is refused and nothing forwarded', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const p = w.n.proxyOf(M)
    const at = nextId()
    const ok = await proxyRequest(p.url, { headers: mcpHeaders(p.auth), body: bodyOfBytes(K.bodyCapBytes, at) })
    assert.equal(ok.status, WEB.ok, 'at the cap: ' + ok.status)
    assert.equal(forwardedOf(w.c, at)[0]?.bodyBytes, K.bodyCapBytes)
    const over = nextId()
    const refused = await proxyRequest(p.url, { headers: mcpHeaders(p.auth), body: bodyOfBytes(K.bodyCapBytes + 1, over) }).catch((e) => ({ status: 'reset', error: e }))
    assert.ok(refused.status === 'reset' || isClientError(refused.status), 'over the cap: ' + refused.status)
    assert.deepEqual(forwardedOf(w.c, over), [])
  })

  // ================================================================== ADP-EP-01 / ADP-BVA-01
  caseTest(sdk, 'ADP-EP-01', 1, 'servers omitted: status().servers is []', async (t) => {
    const w = await adapterWorld(t, sdk, { config: () => ({ clientMetadataUrl: FIXTURE.cimd }) })
    assert.deepEqual(w.n.status().servers, [])
  })
  caseTest(sdk, 'ADP-EP-01', 2, 'a duplicate serverName: the plugin refuses to start (code duplicate-server)', async (t) => {
    const w = await adapterWorld(t, sdk, { start: false })
    const n = await w.start({ clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: M, url: w.c.url }, { serverName: M, url: w.c.url }] })
    assert.ok(n.error, 'the adapter started')
    assert.equal(n.error.code, START_ERROR.duplicate)
    assert.equal(n.service(), undefined)
  })
  caseTest(sdk, 'ADP-EP-01', 3, 'the grant of m: key dsh-connector-adapter/server-6d, kind grant, payload v1 with every field; expiresAt = t0 + 3600 s', async (t) => {
    const { w, grant } = await authorizedWorld(t, sdk)
    assert.equal(String(w.n.key(M)), 'dsh-connector-adapter/server-6d')
    const record = await w.n.host.ctx.credentials.readRecord('dsh-connector-adapter/server-6d')
    assert.equal(record.kind, 'grant')
    assert.equal(grant.v, 1)
    assert.equal(grant.upstream, w.c.url)
    assert.equal(grant.resource, w.c.url)
    for (const f of ['clientInformation', 'discovery']) assert.ok(grant[f] !== undefined, 'no ' + f)
    for (const f of ['access_token', 'refresh_token', 'token_type', 'scope', 'expiresAt']) assert.ok(grant.tokens[f] !== undefined, 'no tokens.' + f)
    assert.equal(grant.tokens.expiresAt, FIXTURE.t0 + K.accessTokenMs)
    assert.ok(w.n.host.ctx.authorization.describe(w.n.key(M)), 'no authorization flow under the same key')
    assert.deepEqual(w.n.host.ctx.authorization.describe(w.n.key(M)).methods.map((m) => m.id), ['browser'])
  })
  caseTest(sdk, 'ADP-EP-01', 4, 'the sign-in tool is global, named dsh_connector_sign_in, with server required', async (t) => {
    const w = await adapterWorld(t, sdk)
    const def = w.n.tool(ADAPTER.tool)
    assert.ok(def, 'not in the global view')
    assert.deepEqual(def.parameters.required, [ADAPTER.toolParam])
    assert.equal(def.parameters.properties[ADAPTER.toolParam].type, 'string')
  })
  caseTest(sdk, 'ADP-EP-01', 5, 'the relayed exports: name and inject', async () => {
    const { adapterModule } = await import('./subject.mjs')
    const mod = await adapterModule(sdk)
    assert.equal(mod.name, ADAPTER.name)
    assert.deepEqual([...mod.inject], [...ADAPTER.inject])
    assert.equal(typeof mod.apply, 'function')
    assert.equal(typeof mod.createAdapterPlugin, 'function')
  })
  caseTest(sdk, 'ADP-BVA-01', 1, 'a serverName of 32 characters: accepted; key server-<64 hex>', async (t) => {
    const w = await adapterWorld(t, sdk, { config: (c) => ({ clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: ROWS.name32, url: c.url }] }) })
    assert.equal(w.n.stateOf(ROWS.name32)?.state, STATE.needsAuthorization)
    assert.equal(String(w.n.key(ROWS.name32)), ADAPTER.keyScope + '/' + FIXTURE.serverId(ROWS.name32))
    assert.equal(FIXTURE.serverId(ROWS.name32).length, 'server-'.length + 64)
  })
  caseTest(sdk, 'ADP-BVA-01', 2, 'a serverName of 33 characters: refused at start', async (t) => {
    const w = await adapterWorld(t, sdk, { start: false })
    const n = await w.start({ clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: ROWS.name33, url: w.c.url }] })
    assert.ok(n.error, 'the adapter started')
  })

  // ================================================================== review decisions (Fishball, 2026-11-16)
  caseTest(sdk, 'ADP-REV-B1', 1, 'pending + `GET //` on the callback: 404, no crash; a later valid callback completes the attempt', async (t) => {
    const w = await adapterWorld(t, sdk)
    const r = await w.n.signIn(M)
    const reply = await rawRequest(callbackPortOf(r.url), FIXTURE.badRequestLine)
    assert.match(reply, /^HTTP\/1\.[01] 404/)
    assert.equal(w.n.stateOf(M).state, STATE.authorizing)
    await browser.approve(w.c, r.url)
    await untilState(w.n, M, STATE.authorized)
  })
  for (const [row, label, mutate] of [
    [1, 'the url changed (same serverName)', null],
    [2, 'v missing', ({ v, ...p }) => p],
    [3, 'v = 2', (p) => ({ ...p, v: FIXTURE.otherGrantVersion })],
  ]) {
    caseTest(sdk, 'ADP-REV-B2', row, `a stored grant whose ${label} does not count: needs-authorization, no child, no timer, no request; record untouched until the next sign-in overwrites it`, async (t) => {
      const { w, E } = await authorizedWorld(t, sdk)
      const c2 = mutate === null ? await (await import('./fakes.mjs')).startFakeConnector() : undefined
      if (c2) w.scope.defer(() => c2.stop())
      const cfg = c2 ? { clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: M, url: c2.url }] } : w.n.config
      await w.restart(cfg, {
        between: mutate === null ? undefined : async () => {
          const editor = await (await import('../../dsh-connector-adapter/oauth-client/subject.mjs')).openHost(sdk, w.root)
          await editor.ctx.credentials.modifyRecord(w.n.key(M), async (rec) => ({ ...rec, payload: mutate(rec.payload) }))
          await editor.close()
        },
      })
      const before = await w.n.record(M)
      const requests = w.c.requests.length + (c2?.requests.length ?? 0)
      assert.equal(w.n.stateOf(M).state, STATE.needsAuthorization)
      assert.equal(await staysFalse(() => w.n.children().length > 0), true, 'a child row was mounted')
      await w.clock.to(E)
      assert.equal(w.c.requests.length + (c2?.requests.length ?? 0), requests, 'a request to the old or the new URL')
      assert.deepEqual(await w.n.record(M), before, 'the old record was changed')
      const target = c2 ?? w.c
      const signIn = await w.n.signIn(M)
      assert.equal(signIn.status, RESULT.approvalUrl)
      await browser.approve(target, signIn.url)
      await untilState(w.n, M, STATE.authorized)
      const fresh = (await w.n.record(M)).payload
      assert.equal(fresh.v, 1)
      assert.equal(fresh.upstream, target.url)
    })
  }
  for (const [row, expiresIn, armed] of [[1, FIXTURE.expiresInS.belowLead, false], [2, FIXTURE.expiresInS.atLead, false], [3, FIXTURE.expiresInS.aboveLead, true]]) {
    caseTest(sdk, 'ADP-REV-S1', row, `expires_in ${expiresIn} s: ${armed ? 'a refresh timer due 1 s after issue' : 'no refresh timer; refreshed only on a 401 (one refresh, one retry)'}`, async (t) => {
      const w = await adapterWorld(t, sdk)
      w.c.script.expiresInS = expiresIn
      await signedIn(w)
      if (armed) {
        await w.clock.advance(K.minRefreshDelayMs - K.tickMs)
        assert.equal(await staysFalse(() => w.c.refreshRequests().length > 0), true, 'refreshed before 1 s')
        await w.clock.advance(K.tickMs)
        assert.ok(await eventually(() => w.c.refreshRequests().length === 1), 'no refresh 1 s after issue')
        return
      }
      await w.clock.advance(expiresIn * K.msPerSecond * 2)
      assert.equal(await staysFalse(() => w.c.refreshRequests().length > 0), true, 'a timer refreshed a token whose lifetime is ≤ LEAD')
      w.c.dropAccess()
      const before = toolCalls(w.c).length
      assert.ok((await w.n.call(M, WHOAMI)).value)
      assert.equal(w.c.refreshRequests().length, 1)
      assert.equal(toolCalls(w.c).length - before, 2)
    })
  }
  caseTest(sdk, 'ADP-REV-S1', 4, 'expires_in far beyond 24.8 days: the timer is clamped to 2^31 − 1 ms; no refresh, no tight loop', async (t) => {
    const w = await adapterWorld(t, sdk)
    w.c.script.expiresInS = FIXTURE.expiresInS.huge
    await signedIn(w)
    const delays = w.clock.pending()
    assert.ok(delays.every((d) => d <= K.maxTimerMs), 'a timer beyond the bound: ' + delays)
    const fired = w.clock.fired()
    await w.clock.advance(K.maxTimerMs - K.tickMs)
    assert.equal(w.c.refreshRequests().length, 0)
    assert.ok(w.clock.fired() - fired < WAIT.maxTimerFires)
  })
  caseTest(sdk, 'ADP-REV-S3', 1, 'the attempt ends before its URL is known (cancelled at once): needs-authorization', async (t) => {
    const w = await adapterWorld(t, sdk)
    const svc = w.n.host.ctx.get('authorization')
    const begin = svc.begin.bind(svc)
    svc.begin = (request) => { const run = begin(request); svc.cancel(request.key); return run }
    const r = await w.n.signIn(M)
    assert.deepEqual(r, { status: RESULT.needsAuthorization, server: M })
    assert.equal(w.n.stateOf(M).state, STATE.needsAuthorization)
  })
  caseTest(sdk, 'ADP-REV-S4', 1, 'another N just refreshed to a new token: a second 401 seen with the old token keeps the new tokens', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const n2 = await w.start(w.n.config, { name: 'n2' })
    await untilChild(n2, M, WHOAMI)
    const old = await storedToken(w.n)
    let held = 0
    // N's call with the old token: the first upstream request is refused, and while N refreshes, N2
    // (which also saw a 401) refreshes first; N's retry with the old token is refused too (its second 401).
    w.c.script.beforeMcp = async (r) => {
      if (r.headers[WEB.authorization] !== WEB.bearer + old || !r.body.includes(`"${RPC.toolsCall}"`)) return false
      held += 1
      if (held === 1) await n2.call(M, WHOAMI)
      return true
    }
    await w.n.call(M, WHOAMI)
    w.c.script.beforeMcp = undefined
    const fresh = await storedToken(n2)
    assert.ok(fresh && fresh !== old, 'N2 did not refresh')
    assert.ok(await eventually(async () => (await storedToken(w.n)) === fresh), 'the new tokens were dropped')
    assert.ok((await n2.call(M, WHOAMI)).value, 'N2 lost its token')
  })
  for (const [label, url] of ROWS.serverUrls.ok) {
    caseTest(sdk, 'ADP-REV-S8', `EP ok ${label}`, `servers[].url ${label}: the adapter starts`, async (t) => {
      const w = await adapterWorld(t, sdk, { start: false })
      const n = await w.start({ clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: M, url: url.replace('{port}', String(new URL(w.c.url).port)) }] })
      assert.equal(n.error, undefined, 'refused: ' + n.error?.code)
      assert.equal(n.stateOf(M)?.state, STATE.needsAuthorization)
    })
  }
  for (const [label, url] of ROWS.serverUrls.refused) {
    caseTest(sdk, 'ADP-REV-S8', `EP refused ${label}`, `servers[].url ${label}: apply rejects with code insecure-server-url`, async (t) => {
      const w = await adapterWorld(t, sdk, { start: false })
      const n = await w.start({ clientMetadataUrl: FIXTURE.cimd, servers: [{ serverName: M, url }] })
      assert.ok(n.error, 'the adapter started')
      assert.equal(n.error.code, START_ERROR.insecureUrl)
    })
  }
}

// ------------------------------------------------------------------ helpers used above

/** The `{state, reason}` part of a status entry. */
const pick = (entry) => (entry === undefined ? undefined : { state: entry.state, ...(entry.reason === undefined ? {} : { reason: entry.reason }) })
/** One character of `s` changed, length kept (EP-14 row 3). */
const flip = (s) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1)
/** A cheap file identity: size and mtime. */
const statOf = (root, f) => { try { const s = fs.statSync(root + '/' + f); return s.isFile() ? `${s.size}:${s.mtimeMs}` : 'dir' } catch { return 'gone' } }

/** EP-12 / UC-13: the server is needs-configuration with `reason`, sign-in says so, no request, no URL. */
async function expectConfigRefusal(w, reason) {
  assert.deepEqual(pick(w.n.stateOf(M)), { state: STATE.needsConfiguration, reason })
  const r = await w.n.signIn(M)
  assert.deepEqual(r, { status: RESULT.needsConfiguration, server: M, reason })
  assert.equal(r.url, undefined)
  assert.deepEqual(w.forbidden(), [])
  assert.deepEqual(w.c.discoveryRequests(), [], 'discovery while the setting is not valid')
  assert.equal(w.n.children().length, 0)
}
/** DT-11 refusals: needs-configuration / not-a-dsh-connector, no forbidden request, no grant, no child. */
async function expectNotDsh(w, server) {
  const r = await w.n.signIn(server)
  assert.deepEqual(r, { status: RESULT.needsConfiguration, server, reason: REASON.notDsh })
  assert.deepEqual(pick(w.n.stateOf(server)), { state: STATE.needsConfiguration, reason: REASON.notDsh })
  assert.deepEqual(w.forbidden(), [])
  assert.equal(await w.n.record(server), undefined)
  assert.equal(w.n.children().length, 0)
}

/** A raw `subscriptions/listen` POST through the proxy with the child's bearer; the SSE text accumulates. */
export function openListen(proxy) {
  return new Promise((resolve, reject) => {
    const u = new URL(proxy.url)
    let text = ''
    let ended = false
    const body = JSON.stringify({ jsonrpc: RPC.jsonrpc, id: nextId(), method: RPC.listen, params: { notifications: { resourceSubscriptions: [K1.RESOURCE.events.uri] } } })
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: WEB.post, headers: mcpHeaders(proxy.auth) }, (res) => {
      res.setEncoding('utf8')
      res.on('data', (c) => { text += c })
      res.on('end', () => { ended = true })
      res.on('error', () => { ended = true })
      resolve({ status: res.statusCode, text: () => text, ended: () => ended, close: () => req.destroy() })
    })
    req.on('error', (e) => (ended ? undefined : reject(e)))
    req.end(body)
  })
}
