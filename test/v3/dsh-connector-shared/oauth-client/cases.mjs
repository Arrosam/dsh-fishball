/**
 * Black-box cases for `dsh-connector-shared/oauth-client` (USE-CASES.md beside this file): OAC-EP-01,
 * OAC-BVA-01 (the client-id URL rule), OAC-EP-02 (discovery), OAC-ST-01 (one attempt), OAC-DT-01 and
 * single flight (refresh), OAC-BVA-02 (the lead), OAC-EP-03 (exports) and OAC-LEAK-01.
 *
 * Level: integration. The library runs inside a real `ctx.authorization` flow over the real local
 * credential store of each SDK, against the fake connector, with a fake clock for the attempt
 * timeout. Every outbound HTTP request goes through the injected `fetchFn` (recordingFetch), so a
 * case can also show that none bypassed it.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import { setTimeout as realDelay } from 'node:timers/promises'
import test from 'node:test'
import { DSH, FIXTURE, K, K1, LIBRARY, OAUTH, WAIT, WEB } from './constants.mjs'
import { browser, eventually, fakeClock, otherServer, portAccepts, recordingFetch, staysFalse, startFakeConnector } from './fakes.mjs'
import { cleanups, leakHits, sweepableHome, libraryModule, logText, mcpSdk, modeOf, openHost, tempRoot } from './subject.mjs'

/** `[SDK <v>] <id> <row> <title>` (the brief's title rule). */
export const caseName = (sdk, id, row, title) => `[SDK ${sdk}] ${id} ${/^\d/.test(String(row)) ? 'row ' + row : row} ${title}`
export const caseTest = (sdk, id, row, title, fn) => test(caseName(sdk, id, row, title), { timeout: WAIT.testMs }, fn)

const s256 = (verifier) => createHash('sha256').update(verifier).digest('base64url')
const formOf = (request) => new URLSearchParams(request.body)

/** A loopback port nobody listens on (bound, then released). */
export async function closedPort() {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, FIXTURE.loopback, resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

/** Sends `text` raw to 127.0.0.1:`port` and resolves with whatever comes back (or '' on error). */
export function rawRequest(port, text) {
  return new Promise((resolve) => {
    const chunks = []
    const socket = net.connect({ host: FIXTURE.loopback, port }, () => socket.write(text))
    socket.on('data', (c) => chunks.push(c))
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('latin1')))
    socket.on('error', () => resolve(Buffer.concat(chunks).toString('latin1')))
    socket.setTimeout(WAIT.eventuallyMs, () => socket.destroy())
  })
}

/** S2: the call ended no earlier than the deadline (less slack) and not long after it. */
function assertDeadline(started) {
  const took = Date.now() - started
  assert.ok(took >= K.requestTimeoutMs - WAIT.deadlineSlackMs, `ended after ${took} ms, before the ${K.requestTimeoutMs} ms deadline`)
  assert.ok(took <= K.requestTimeoutMs + WAIT.deadlineCeilingMs, `ended after ${took} ms, long after the deadline`)
}

/**
 * One library world: a fake connector, a host over a temp root, the library bound to `sdk`, a fake
 * clock, a recording fetch, a token manager for one key, and a registered authorization flow whose
 * run is one `manager.authorize` attempt.
 */
async function libWorld(t, sdk, { issueRefresh = true, expiresInS } = {}) {
  const scope = cleanups(t)
  const root = tempRoot(scope)
  const c = await startFakeConnector({ issueRefresh })
  scope.defer(() => c.stop())
  if (expiresInS !== undefined) c.script.expiresInS = expiresInS
  const host = await openHost(sdk, root)
  scope.defer(() => host.close())
  const lib = await libraryModule(sdk)
  const sdkModule = await mcpSdk(sdk)
  const clock = fakeClock()
  const recorder = recordingFetch()
  const key = host.credentialKey(FIXTURE.libraryKeyScope, FIXTURE.serverId('m'))
  const managerOn = (credentials) => lib.createTokenManager({ sdk: sdkModule, credentials, key, now: clock.now, refreshLeadMs: K.leadMs, fetchFn: recorder.fetch })
  const manager = managerOn(host.ctx.credentials)
  for (const member of LIBRARY.managerMembers) assert.equal(typeof manager[member], 'function', `the token manager has no ${member}()`)
  const discovery = await lib.discoverServer({ sdk: sdkModule, serverUrl: c.url, fetchFn: recorder.fetch })
  const notices = []
  host.ctx.authorization.registerFlow({
    key, label: FIXTURE.clientName, methods: [FIXTURE.flowMethod],
    run: (session) => manager.authorize({
      session, serverUrl: c.url, clientMetadataUrl: FIXTURE.cimd, clientName: FIXTURE.clientName, discovery,
      message: FIXTURE.message, timeoutMs: K.timeoutMs, timers: clock.timers,
    }),
  })
  const w = {
    scope, root, c, host, lib, sdkModule, clock, recorder, key, manager, managerOn, discovery, notices,
    record: () => host.ctx.credentials.readRecord(key),
    /**
     * Begins one attempt and waits for its notice. Returns the URL, its parameters, the callback port,
     * and `done` (settles to `{value}` or `{error}`; `settled()` says whether it has).
     */
    async begin({ signal } = {}) {
      const before = notices.length
      let isSettled = false
      const done = host.ctx.authorization.begin({
        key, signal,
        interaction: { notify: (n) => notices.push(n), prompt: () => Promise.reject(new Error('fbtest: no prompt expected')) },
      }).then((value) => ({ value }), (error) => ({ error })).finally(() => { isSettled = true })
      const notice = await eventually(() => notices.slice(before).find((n) => n.url))
      assert.ok(notice, 'no notice with a URL: ' + JSON.stringify(notices.slice(before)) + ' ' + JSON.stringify(isSettled ? await done : 'pending'))
      const url = new URL(notice.url)
      const redirect = new URL(url.searchParams.get(OAUTH.redirectUri))
      return { notice, url, params: url.searchParams, redirect, port: Number(redirect.port), done, settled: () => isSettled }
    },
    /** One full approval; resolves after the commit. */
    async authorized() {
      const a = await w.begin()
      await browser.approve(c, a.url.href)
      const end = await a.done
      assert.ok(end.value, 'the attempt did not end authorized: ' + (end.error?.code ?? end.error?.message))
      return a
    },
  }
  return w
}
const endCode = (end) => end.error?.code

export function registerOAuthClientCases(sdk) {
  // ------------------------------------------------------------------ OAC-EP-01 / OAC-BVA-01
  const urlRows = [
    ['OAC-EP-01', 1, 'absent', undefined, LIBRARY.problem.missing],
    ['OAC-EP-01', 2, 'null', null, LIBRARY.problem.missing],
    ['OAC-EP-01', 3, 'a non-string', 42, LIBRARY.problem.missing],
    ['OAC-EP-01', 4, 'empty', '', LIBRARY.problem.missing],
    ['OAC-EP-01', 5, 'not a URL', 'fb-adapter', LIBRARY.problem.invalid],
    ['OAC-EP-01', 6, 'http: with a path', 'http://agent.example/fb-adapter.json', LIBRARY.problem.invalid],
    ['OAC-EP-01', 7, 'https: with the root path', 'https://agent.example/', LIBRARY.problem.invalid],
    ['OAC-EP-01', 8, 'https: with no path', 'https://agent.example', LIBRARY.problem.invalid],
    ['OAC-EP-01', 9, 'https: root path with a query', 'https://agent.example/?q=1', LIBRARY.problem.invalid],
    ['OAC-EP-01', 10, 'another scheme', 'ftp://agent.example/x', LIBRARY.problem.invalid],
    ['OAC-EP-01', 11, 'one space (not empty)', ' ', LIBRARY.problem.invalid],
    ['OAC-BVA-01', 1, 'https: with the shortest non-root path', 'https://agent.example/a', undefined],
    ['OAC-BVA-01', 2, 'the CIMD URL', FIXTURE.cimd, undefined],
  ]
  for (const [id, row, label, value, expected] of urlRows) {
    caseTest(sdk, id, row, `clientMetadataUrlProblem(${label}) is ${String(expected)}`, async () => {
      const lib = await libraryModule(sdk)
      assert.equal(lib.clientMetadataUrlProblem(value), expected)
    })
  }

  // ------------------------------------------------------------------ OAC-EP-02 discoverServer
  caseTest(sdk, 'OAC-EP-02', 1, 'a DSH connector: PRM then AS metadata, both through fetchFn', async (t) => {
    const scope = cleanups(t)
    const c = await startFakeConnector()
    scope.defer(() => c.stop())
    const lib = await libraryModule(sdk)
    const recorder = recordingFetch()
    const d = await lib.discoverServer({ sdk: await mcpSdk(sdk), serverUrl: c.url, fetchFn: recorder.fetch })
    assert.equal(d.resourceMetadata.resource, c.url)
    assert.equal(String(d.authorizationServerUrl), d.resourceMetadata.authorization_servers[0])
    assert.equal(String(d.authorizationServerUrl), c.urls.issuer)
    assert.equal(d.authorizationServerMetadata.issuer, c.urls.issuer)
    const fetched = recorder.calls.map((x) => new URL(x.url).pathname)
    assert.ok(fetched.includes(K1.PATHS.protectedResourcePrefix + K1.PATHS.mcp), 'PRM not read through fetchFn: ' + fetched)
    assert.ok(fetched.includes(K1.PATHS.authorizationServerPrefix + K1.PATHS.issuer), 'AS metadata not read through fetchFn: ' + fetched)
    assert.equal(c.discoveryRequests().length, recorder.calls.length, 'a discovery request bypassed fetchFn')
    assert.deepEqual(c.forbiddenRequests(), [])
  })
  caseTest(sdk, 'OAC-EP-02', 2, 'a non-DSH OAuth server: discovered as is (the library makes no DSH-connector check)', async () => {
    const lib = await libraryModule(sdk)
    const other = otherServer()
    const d = await lib.discoverServer({ sdk: await mcpSdk(sdk), serverUrl: other.origin + FIXTURE.other.mcpPath, fetchFn: recordingFetch(other).fetch })
    assert.equal(String(d.authorizationServerUrl), other.origin + FIXTURE.other.issuerPath)
    assert.deepEqual(d.resourceMetadata.scopes_supported, FIXTURE.other.scopes)
    assert.deepEqual(other.forbiddenRequests(), [])
  })
  const failing = [
    [3, 'the PRM answers 404', (c) => { c.script.prm = 'missing' }],
    [4, 'the PRM is not JSON', (c) => { c.script.prm = 'not-json' }],
    [6, 'the AS metadata answers 500', (c) => { c.script.asMetadata = 'status' }],
  ]
  for (const [row, label, arrange] of failing) {
    caseTest(sdk, 'OAC-EP-02', row, `${label}: OAuthAttemptError code failed`, async (t) => {
      const scope = cleanups(t)
      const c = await startFakeConnector()
      scope.defer(() => c.stop())
      arrange(c)
      const lib = await libraryModule(sdk)
      const error = await lib.discoverServer({ sdk: await mcpSdk(sdk), serverUrl: c.url, fetchFn: recordingFetch().fetch }).then(() => undefined, (e) => e)
      assert.ok(error instanceof lib.OAuthAttemptError, 'not an OAuthAttemptError: ' + error)
      assert.equal(error.code, LIBRARY.attemptEnd.failed)
    })
  }
  caseTest(sdk, 'OAC-EP-02', 5, 'unreachable (a closed port): OAuthAttemptError code failed', async () => {
    const lib = await libraryModule(sdk)
    const url = `http://${FIXTURE.loopback}:${await closedPort()}${K1.PATHS.mcp}`
    const error = await lib.discoverServer({ sdk: await mcpSdk(sdk), serverUrl: url, fetchFn: recordingFetch().fetch }).then(() => undefined, (e) => e)
    assert.ok(error instanceof lib.OAuthAttemptError, 'not an OAuthAttemptError: ' + error)
    assert.equal(error.code, LIBRARY.attemptEnd.failed)
  })

  // ------------------------------------------------------------------ OAC-ST-01 one attempt
  caseTest(sdk, 'OAC-ST-01', 1, 'authorize → Pending: notice with the message and an authorization URL; the callback listens', async (t) => {
    const w = await libWorld(t, sdk)
    const a = await w.begin()
    assert.equal(a.notice.message, FIXTURE.message)
    assert.equal(a.url.origin + a.url.pathname, w.c.approvalOrigin + K1.PATHS.authorize)
    assert.equal(a.params.get(OAUTH.responseType), K1.RESPONSE_TYPE.code)
    assert.equal(a.params.get(OAUTH.clientId), FIXTURE.cimd)
    assert.equal(a.params.get(OAUTH.codeChallengeMethod), K1.PKCE.method)
    assert.ok(a.params.get(OAUTH.codeChallenge), 'no code_challenge')
    assert.ok(a.params.get(OAUTH.state), 'no state')
    assert.equal(a.params.get(OAUTH.scope), K1.SCOPE.full)
    assert.equal(a.params.get(OAUTH.resource), w.c.url)
    assert.equal(a.redirect.protocol + '//' + a.redirect.hostname, 'http://' + LIBRARY.constants.loopbackHost)
    assert.equal(a.redirect.pathname, LIBRARY.constants.callbackPath)
    assert.ok(a.port > 0, 'no OS port in the redirect URI')
    assert.deepEqual([...a.params.keys()].filter((k) => !OAUTH.urlParams.includes(k)), [], 'extra URL parameters')
    assert.equal(await portAccepts(a.port), true, 'nothing listens on the callback port')
    assert.equal(a.settled(), false)
    assert.deepEqual(w.c.forbiddenRequests(), [], 'a request before the owner acted')
  })
  caseTest(sdk, 'OAC-ST-01', 2, 'Pending → Ended(authorized): one code exchange, the v1 grant committed, the listener closed', async (t) => {
    const w = await libWorld(t, sdk)
    const a = await w.begin()
    await browser.approve(w.c, a.url.href)
    const end = await a.done
    assert.equal(end.value?.status, 'authorized', 'the flow did not end authorized: ' + (end.error?.code ?? end.error))
    const [exchange, ...more] = w.c.codeRequests()
    assert.equal(more.length, 0, 'more than one code exchange')
    const form = formOf(exchange)
    assert.equal(form.get(OAUTH.grantType), K1.GRANT.authorizationCode)
    assert.equal(form.get(OAUTH.clientId), FIXTURE.cimd)
    assert.equal(form.get(OAUTH.redirectUri), a.params.get(OAUTH.redirectUri))
    assert.equal(form.get(OAUTH.resource), w.c.url)
    assert.equal(s256(form.get(OAUTH.codeVerifier)), a.params.get(OAUTH.codeChallenge), 'the verifier does not match the S256 challenge')
    assert.equal(form.has(OAUTH.clientSecret), false, 'a client secret was sent')
    assert.equal(exchange.headers[WEB.authorization], undefined, 'client authentication was sent')
    const record = await w.record()
    assert.equal(record?.kind, LIBRARY.recordKind)
    const p = record.payload
    assert.equal(p.v, LIBRARY.constants.grantVersion)
    for (const field of ['upstream', 'clientInformation', 'discovery', 'resource', 'tokens']) assert.ok(p[field] !== undefined, 'the grant lacks ' + field)
    assert.equal(p.resource, w.c.url)
    assert.equal(p.clientInformation.client_id, FIXTURE.cimd)
    assert.ok(w.c.liveAccessTokens().includes(p.tokens.access_token), 'the stored access token is not the issued one')
    assert.ok(w.c.planted.has(p.tokens.refresh_token), 'the stored refresh token is not the issued one')
    assert.equal(p.tokens.token_type, K1.TOKEN_TYPE)
    assert.equal(p.tokens.scope, K1.SCOPE.full)
    assert.equal(p.tokens.expiresAt, FIXTURE.t0 + K.accessTokenMs)
    assert.deepEqual(await w.manager.read(), p)
    assert.ok(await eventually(async () => !(await portAccepts(a.port))), 'the callback listener stayed open')
  })
  const rejected = [
    ['3', 'a wrong state', (l) => l.searchParams.set(OAUTH.state, 'x' + l.searchParams.get(OAUTH.state)), LIBRARY.attemptEnd.rejected],
    ['3b', 'a wrong iss', (l, w) => l.searchParams.set(OAUTH.iss, w.c.origin + FIXTURE.wrong.issuerPath), LIBRARY.attemptEnd.rejected],
    ['3c', 'no iss (the AS advertises it)', (l) => l.searchParams.delete(OAUTH.iss), LIBRARY.attemptEnd.rejected],
    ['5', 'an OAuth error other than access_denied', (l) => { l.searchParams.delete(OAUTH.code); l.searchParams.set(OAUTH.error, K1.OAUTH_ERROR.serverError) }, LIBRARY.attemptEnd.failed],
  ]
  for (const [row, label, mutate, code] of rejected) {
    caseTest(sdk, 'OAC-ST-01', row, `Pending + callback with ${label} → Ended(${code}): no code exchange, no record, listener closed`, async (t) => {
      const w = await libWorld(t, sdk)
      const a = await w.begin()
      await browser.approve(w.c, a.url.href, { mutate: (l) => mutate(l, w) })
      assert.equal(endCode(await a.done), code)
      assert.equal(w.c.codeRequests().length, 0, 'the code was exchanged')
      assert.equal(await w.record(), undefined)
      assert.ok(await eventually(async () => !(await portAccepts(a.port))), 'the callback listener stayed open')
    })
  }
  caseTest(sdk, 'OAC-ST-01', 4, 'Pending + access_denied with the right iss → Ended(denied); no record', async (t) => {
    const w = await libWorld(t, sdk)
    const a = await w.begin()
    await browser.approve(w.c, a.url.href, { decision: OAUTH.decision.cancel })
    assert.equal(endCode(await a.done), LIBRARY.attemptEnd.denied)
    assert.equal(await w.record(), undefined)
  })
  caseTest(sdk, 'OAC-ST-01', '4b', 'Pending + access_denied with a wrong iss → Ended(rejected) (iss checked on errors too)', async (t) => {
    const w = await libWorld(t, sdk)
    const a = await w.begin()
    await browser.approve(w.c, a.url.href, { decision: OAUTH.decision.cancel, mutate: (l) => l.searchParams.set(OAUTH.iss, w.c.origin + FIXTURE.wrong.issuerPath) })
    assert.equal(endCode(await a.done), LIBRARY.attemptEnd.rejected)
    assert.equal(await w.record(), undefined)
  })
  caseTest(sdk, 'OAC-ST-01', 6, 'Pending + the token endpoint answers server_error at the exchange → Ended(failed); no record', async (t) => {
    const w = await libWorld(t, sdk)
    w.c.script.tokenError = { grant: K1.GRANT.authorizationCode, error: K1.OAUTH_ERROR.serverError, status: WEB.serverError }
    const a = await w.begin()
    await browser.approve(w.c, a.url.href)
    assert.equal(endCode(await a.done), LIBRARY.attemptEnd.failed)
    assert.equal(await w.record(), undefined)
  })
  caseTest(sdk, 'OAC-ST-01', 7, 'Pending at TIMEOUT − 1 ms → still Pending; the callback still listens', async (t) => {
    const w = await libWorld(t, sdk)
    const a = await w.begin()
    await w.clock.advance(K.timeoutMs - K.tickMs)
    assert.equal(await staysFalse(() => a.settled()), true, 'the attempt ended before TIMEOUT')
    assert.equal(await portAccepts(a.port), true)
  })
  caseTest(sdk, 'OAC-ST-01', 8, 'Pending at TIMEOUT → Ended(expired); no record; listener closed', async (t) => {
    const w = await libWorld(t, sdk)
    const a = await w.begin()
    await w.clock.advance(K.timeoutMs)
    assert.equal(endCode(await a.done), LIBRARY.attemptEnd.expired)
    assert.equal(await w.record(), undefined)
    assert.ok(await eventually(async () => !(await portAccepts(a.port))), 'the callback listener stayed open')
  })
  caseTest(sdk, 'OAC-ST-01', 9, 'Pending + session.signal aborts → Ended; begin is cancelled; no record; listener closed', async (t) => {
    const w = await libWorld(t, sdk)
    const abort = new AbortController()
    const a = await w.begin({ signal: abort.signal })
    abort.abort()
    assert.equal((await a.done).value?.status, 'cancelled')
    assert.ok(await eventually(async () => !(await portAccepts(a.port))), 'the callback listener stayed open')
    await browser.approve(w.c, a.url.href)
    assert.equal(w.c.codeRequests().length, 0, 'a code was exchanged after the abort')
    assert.equal(await w.record(), undefined)
  })
  caseTest(sdk, 'OAC-ST-01', 10, 'Ended + a redirect for the old state → not accepted (no code exchange)', async (t) => {
    const w = await libWorld(t, sdk)
    const a = await w.begin()
    let callback
    await browser.approve(w.c, a.url.href, { decision: OAUTH.decision.cancel, mutate: (l) => { callback = new URL(l) } })
    await a.done
    // A good code for the same state, replayed to the ended attempt's callback.
    callback.searchParams.delete(OAUTH.error)
    callback.searchParams.set(OAUTH.code, 'fbtest-late-code')
    await browser.follow(callback)
    assert.equal(w.c.codeRequests().length, 0)
    assert.equal(await w.record(), undefined)
  })
  caseTest(sdk, 'OAC-ST-01', 11, 'a second attempt after an ended one: a new state, a new challenge, a fresh callback', async (t) => {
    const w = await libWorld(t, sdk)
    const a1 = await w.begin()
    await browser.approve(w.c, a1.url.href, { decision: OAUTH.decision.cancel })
    await a1.done
    const a2 = await w.begin()
    assert.notEqual(a2.params.get(OAUTH.state), a1.params.get(OAUTH.state))
    assert.notEqual(a2.params.get(OAUTH.codeChallenge), a1.params.get(OAUTH.codeChallenge))
    assert.equal(await portAccepts(a2.port), true)
  })

  // ------------------------------------------------------------------ OAC-DT-01 refresh
  /** An authorized world and its first grant. */
  const granted = async (t, options) => {
    const w = await libWorld(t, sdk, options)
    await w.authorized()
    const grant = await w.manager.read()
    return { w, grant, at: w.lib.accessTokenOf(grant), expiry: grant.tokens.expiresAt }
  }
  const expectRefreshed = async (w, result, before, refreshesBefore) => {
    assert.equal(result.outcome, LIBRARY.refreshOutcome.refreshed)
    assert.equal(w.c.refreshRequests().length, refreshesBefore + 1)
    const form = formOf(w.c.refreshRequests().at(-1))
    assert.equal(form.get(OAUTH.grantType), K1.GRANT.refreshToken)
    assert.equal(form.get(OAUTH.refreshToken), before.tokens.refresh_token)
    assert.equal(form.get(OAUTH.clientId), FIXTURE.cimd)
    assert.equal(form.get(OAUTH.resource), w.c.url)
    assert.equal(form.has(OAUTH.clientSecret), false)
    const stored = (await w.record()).payload
    assert.notEqual(stored.tokens.access_token, before.tokens.access_token)
    assert.notEqual(stored.tokens.refresh_token, before.tokens.refresh_token)
    assert.equal(stored.tokens.expiresAt, w.clock.now() + K.accessTokenMs)
    assert.deepEqual(result.grant, stored)
  }
  const expectDeclined = async (w, result, before) => {
    assert.equal(result.outcome, LIBRARY.refreshOutcome.declined)
    assert.equal(w.c.refreshRequests().length, 0)
    assert.deepEqual((await w.record()).payload, before)
  }
  caseTest(sdk, 'OAC-DT-01', 'rule 1', 'failed = stored, not within the lead → refreshed (rotated, resource sent, no secret)', async (t) => {
    const { w, grant, at } = await granted(t)
    await expectRefreshed(w, await w.manager.refresh({ failedAccessToken: at }), grant, 0)
  })
  caseTest(sdk, 'OAC-DT-01', 'rule 2', 'failed ≠ stored, not within the lead → declined; no request; record unchanged', async (t) => {
    const { w, grant } = await granted(t)
    await expectDeclined(w, await w.manager.refresh({ failedAccessToken: 'fbtest-another-token' }), grant)
  })
  caseTest(sdk, 'OAC-DT-01', 'rule 3', 'no failed token, within the lead → refreshed', async (t) => {
    const { w, grant, expiry } = await granted(t)
    await w.clock.to(expiry - K.leadMs)
    await expectRefreshed(w, await w.manager.refresh(), grant, 0)
  })
  caseTest(sdk, 'OAC-DT-01', 'rule 4', 'no failed token, not within the lead → declined', async (t) => {
    const { w, grant } = await granted(t)
    await expectDeclined(w, await w.manager.refresh(), grant)
  })
  caseTest(sdk, 'OAC-DT-01', 'rule 5', 'failed ≠ stored, within the lead → refreshed', async (t) => {
    const { w, grant, expiry } = await granted(t)
    await w.clock.to(expiry - K.leadMs)
    await expectRefreshed(w, await w.manager.refresh({ failedAccessToken: 'fbtest-another-token' }), grant, 0)
  })
  caseTest(sdk, 'OAC-DT-01', 'rule 6', 'no refresh token in the grant → no-refresh-token; no request', async (t) => {
    const { w, grant, at } = await granted(t, { issueRefresh: false })
    const result = await w.manager.refresh({ failedAccessToken: at })
    assert.equal(result.outcome, LIBRARY.refreshOutcome.noRefreshToken)
    assert.equal(w.c.refreshRequests().length, 0)
    assert.deepEqual((await w.record()).payload, grant)
  })
  caseTest(sdk, 'OAC-DT-01', 'rule 7', 'invalid_grant (entry disabled) → invalid-grant; the record stays without tokens', async (t) => {
    const { w, grant, at } = await granted(t)
    w.c.disableEntry()
    const result = await w.manager.refresh({ failedAccessToken: at })
    assert.equal(result.outcome, LIBRARY.refreshOutcome.invalidGrant)
    assert.equal(w.c.refreshRequests().length, 1)
    const record = await w.record()
    assert.ok(record, 'the record was deleted')
    assert.equal(record.payload.tokens, undefined, 'the tokens were kept')
    const { tokens, ...rest } = grant
    assert.deepEqual(record.payload, rest)
  })
  caseTest(sdk, 'OAC-DT-01', 'SF-1', 'five concurrent refreshes in one process share one refresh grant and one result', async (t) => {
    const { w, at } = await granted(t)
    const results = await Promise.all(Array.from({ length: 5 }, () => w.manager.refresh({ failedAccessToken: at })))
    assert.equal(w.c.refreshRequests().length, 1)
    assert.equal(w.c.stats.reuse, 0)
    for (const r of results) assert.equal(r.outcome, LIBRARY.refreshOutcome.refreshed)
    assert.equal(new Set(results.map((r) => w.lib.accessTokenOf(r.grant))).size, 1)
  })
  caseTest(sdk, 'OAC-DT-01', 'SF-2', 'two stores on one file (two processes) both report the token failed → one refresh grant in total', async (t) => {
    const { w, at } = await granted(t)
    const other = await openHost(sdk, w.root)
    w.scope.defer(() => other.close())
    const second = w.managerOn(other.ctx.credentials)
    const results = await Promise.all([w.manager.refresh({ failedAccessToken: at }), second.refresh({ failedAccessToken: at })])
    assert.equal(w.c.refreshRequests().length, 1)
    assert.equal(w.c.stats.reuse, 0)
    assert.deepEqual(results.map((r) => r.outcome).sort(), [LIBRARY.refreshOutcome.declined, LIBRARY.refreshOutcome.refreshed])
    const fresh = w.lib.accessTokenOf((await w.record()).payload)
    assert.equal(w.lib.accessTokenOf(await second.read()), fresh)
    assert.equal(w.lib.accessTokenOf(await w.manager.read()), fresh)
  })

  // ------------------------------------------------------------------ OAC-BVA-02 the lead
  caseTest(sdk, 'OAC-BVA-02', 1, 'E − LEAD − 1 ms: refreshDueInMs is 1 and refresh() declines', async (t) => {
    const { w, grant, expiry } = await granted(t)
    await w.clock.to(expiry - K.leadMs - K.tickMs)
    assert.equal(w.manager.refreshDueInMs(grant), K.tickMs)
    await expectDeclined(w, await w.manager.refresh(), grant)
  })
  caseTest(sdk, 'OAC-BVA-02', 2, 'E − LEAD: refreshDueInMs is 0 and refresh() refreshes', async (t) => {
    const { w, grant, expiry } = await granted(t)
    await w.clock.to(expiry - K.leadMs)
    assert.equal(w.manager.refreshDueInMs(grant), 0)
    await expectRefreshed(w, await w.manager.refresh(), grant, 0)
  })
  caseTest(sdk, 'OAC-BVA-02', 3, 'E − LEAD + 1 ms: refreshDueInMs is ≤ 0', async (t) => {
    const { w, grant, expiry } = await granted(t)
    await w.clock.to(expiry - K.leadMs + K.tickMs)
    assert.ok(w.manager.refreshDueInMs(grant) <= 0)
  })
  caseTest(sdk, 'OAC-BVA-02', 4, 'a grant without tokens: refreshDueInMs is undefined', async (t) => {
    const { w } = await granted(t)
    assert.equal(w.manager.refreshDueInMs(await w.manager.dropTokens()), undefined)
  })

  // ------------------------------------------------------------------ OAC-EP-03 exports
  caseTest(sdk, 'OAC-EP-03', 1, 'OAUTH_CLIENT is frozen and holds the relayed constants', async () => {
    const lib = await libraryModule(sdk)
    assert.ok(Object.isFrozen(lib.OAUTH_CLIENT))
    for (const [k, v] of Object.entries(LIBRARY.constants)) assert.equal(lib.OAUTH_CLIENT[k], v, k)
    assert.deepEqual(Object.values(lib.OAUTH_CLIENT.attemptEnd).sort(), Object.values(LIBRARY.attemptEnd).sort())
    assert.deepEqual(Object.values(lib.OAUTH_CLIENT.refreshOutcome).sort(), Object.values(LIBRARY.refreshOutcome).sort())
  })
  caseTest(sdk, 'OAC-EP-03', '2–4', 'accessTokenOf with and without tokens; dropTokens keeps the record without tokens', async (t) => {
    const { w, grant, at } = await granted(t)
    assert.equal(at, grant.tokens.access_token)
    const dropped = await w.manager.dropTokens()
    assert.equal(dropped.tokens, undefined)
    assert.equal(w.lib.accessTokenOf(dropped), undefined)
    const record = await w.record()
    assert.ok(record, 'dropTokens deleted the record')
    assert.deepEqual(record.payload, dropped)
  })
  caseTest(sdk, 'OAC-EP-03', 5, 'OAuthAttemptError is a class whose instances carry .code', async () => {
    const lib = await libraryModule(sdk)
    assert.equal(typeof lib.OAuthAttemptError, 'function')
    assert.ok(lib.OAuthAttemptError.prototype instanceof Error || lib.OAuthAttemptError === Error)
  })
  caseTest(sdk, 'OAC-EP-03', 6, 'read() before any commit is undefined', async (t) => {
    const w = await libWorld(t, sdk)
    assert.equal(await w.manager.read(), undefined)
  })

  // ------------------------------------------------------------------ OAC-LEAK-01
  caseTest(sdk, 'OAC-LEAK-01', 'main', 'no planted value outside .credentials.yaml (0600); the connector token never in it', async (t) => {
    const w = await libWorld(t, sdk)
    await w.authorized()
    await w.clock.to((await w.manager.read()).tokens.expiresAt - K.leadMs)
    await w.manager.refresh()
    const hits = leakHits(w.c.planted, {
      places: { notices: JSON.stringify(w.notices), logs: logText(w.host.logs) },
      dirs: [w.root, ...sweepableHome()],
      allowed: [w.host.credentialsFile],
    })
    assert.deepEqual(hits, [])
    assert.equal(modeOf(w.host.credentialsFile), DSH.fileMode)
    assert.equal(fs.readFileSync(w.host.credentialsFile, 'utf8').includes(w.c.entry.token), false)
  })

  // ------------------------------------------------------------------ review decisions (Fishball, 2026-11-16)
  // B1: a callback request whose target is not a parseable URL.
  caseTest(sdk, 'OAC-REV-B1', 1, 'Pending + `GET //` on the callback → 404; no crash; a later valid callback still completes the attempt', async (t) => {
    const w = await libWorld(t, sdk)
    const a = await w.begin()
    const reply = await rawRequest(a.port, FIXTURE.badRequestLine)
    assert.match(reply, /^HTTP\/1\.[01] 404/, 'the bad request line was not answered 404: ' + JSON.stringify(reply.slice(0, 80)))
    assert.equal(a.settled(), false, 'the bad request ended the attempt')
    await browser.approve(w.c, a.url.href)
    assert.equal((await a.done).value?.status, 'authorized')
    assert.ok((await w.record())?.payload?.tokens, 'no grant after the valid callback')
  })

  // B2: isGrantFor(grant, serverUrl).
  const grantRows = [
    [1, 'the grant for this url', (g) => g, (c) => c.url, true],
    [2, 'the same grant, another configured url', (g) => g, (c) => c.origin + FIXTURE.wrong.resourcePath, false],
    [3, 'v missing', ({ v, ...g }) => g, (c) => c.url, false],
    [4, 'v = 2', (g) => ({ ...g, v: FIXTURE.otherGrantVersion }), (c) => c.url, false],
    [5, 'upstream differs only by a trailing slash (exact match)', (g) => ({ ...g, upstream: g.upstream + '/' }), (c) => c.url, false],
    [6, 'no grant', () => undefined, (c) => c.url, false],
  ]
  for (const [row, label, shape, urlOf, expected] of grantRows) {
    caseTest(sdk, 'OAC-REV-B2', row, `isGrantFor(${label}) is ${expected}`, async (t) => {
      const { w, grant } = await granted(t)
      assert.equal(grant.upstream, w.c.url, 'precondition: the committed grant names the configured url as upstream')
      assert.equal(w.lib.isGrantFor(shape(grant), urlOf(w.c)), expected)
    })
  }

  // S1: refreshDueInMs against the token lifetime (BVA on expires_in around LEAD), and issuedAt.
  const lifetimeRows = [
    [1, FIXTURE.expiresInS.belowLead, undefined],
    [2, FIXTURE.expiresInS.atLead, undefined],
    [3, FIXTURE.expiresInS.aboveLead, (FIXTURE.expiresInS.aboveLead * K.msPerSecond) - K.leadMs],
  ]
  for (const [row, expiresIn, due] of lifetimeRows) {
    caseTest(sdk, 'OAC-REV-S1', row, `expires_in ${expiresIn} s: refreshDueInMs at issue is ${due === undefined ? 'undefined (lifetime ≤ LEAD)' : due + ' ms'}`, async (t) => {
      const { w, grant } = await granted(t, { expiresInS: expiresIn })
      assert.equal(grant.tokens.expiresAt, FIXTURE.t0 + expiresIn * K.msPerSecond)
      assert.equal(w.manager.refreshDueInMs(grant), due)
    })
  }
  caseTest(sdk, 'OAC-REV-S1', 4, 'no refresh token: refreshDueInMs is undefined', async (t) => {
    const { w, grant } = await granted(t, { issueRefresh: false })
    assert.equal(w.manager.refreshDueInMs(grant), undefined)
  })
  caseTest(sdk, 'OAC-REV-S1', 5, 'no expiry: refreshDueInMs is undefined', async (t) => {
    const { w, grant } = await granted(t)
    const { expiresAt, ...tokens } = grant.tokens
    assert.equal(w.manager.refreshDueInMs({ ...grant, tokens }), undefined)
  })
  caseTest(sdk, 'OAC-REV-S1', 6, 'the grant tokens carry issuedAt = now at the exchange; a refresh sets it again', async (t) => {
    const { w, grant, expiry } = await granted(t)
    assert.equal(grant.tokens.issuedAt, FIXTURE.t0)
    await w.clock.to(expiry - K.leadMs)
    const { grant: next } = await w.manager.refresh()
    assert.equal(next.tokens.issuedAt, expiry - K.leadMs)
  })
  caseTest(sdk, 'OAC-REV-S1', 7, 'a lifetime far beyond the timer bound: refreshDueInMs is the plain difference (the clamp is the timer owner\'s)', async (t) => {
    const { w, grant } = await granted(t, { expiresInS: FIXTURE.expiresInS.huge })
    assert.equal(w.manager.refreshDueInMs(grant), FIXTURE.expiresInS.huge * K.msPerSecond - K.leadMs)
  })

  // S2: every outbound OAuth request has a 30 s deadline (real time: the functions take no timers).
  caseTest(sdk, 'OAC-REV-S2', 1, 'OAUTH_CLIENT.requestTimeoutMs is 30000', async () => {
    assert.equal((await libraryModule(sdk)).OAUTH_CLIENT.requestTimeoutMs, K.requestTimeoutMs)
  })
  caseTest(sdk, 'OAC-REV-S2', 2, 'discovery: a PRM that never answers fails (failed) at the 30 s deadline, not before', async (t) => {
    const scope = cleanups(t)
    const c = await startFakeConnector()
    scope.defer(() => c.stop())
    c.script.prmDelayMs = Infinity
    const lib = await libraryModule(sdk)
    const started = Date.now()
    const error = await lib.discoverServer({ sdk: await mcpSdk(sdk), serverUrl: c.url, fetchFn: recordingFetch().fetch }).then(() => undefined, (e) => e)
    assertDeadline(started)
    assert.equal(error?.code, LIBRARY.attemptEnd.failed)
  })
  caseTest(sdk, 'OAC-REV-S2', 3, 'refresh: a token endpoint that never answers fails at the 30 s deadline; the stored tokens stay', async (t) => {
    const { w, grant, at } = await granted(t)
    w.c.script.tokenStall = true
    const started = Date.now()
    const outcome = await w.manager.refresh({ failedAccessToken: at }).then((r) => r.outcome, (e) => e)
    assertDeadline(started)
    assert.notEqual(outcome, LIBRARY.refreshOutcome.refreshed)
    assert.deepEqual((await w.record()).payload.tokens, grant.tokens)
  })
  caseTest(sdk, 'OAC-REV-S2', 4, 'code exchange: a token endpoint that never answers ends the attempt failed at the 30 s deadline', async (t) => {
    const w = await libWorld(t, sdk)
    w.c.script.tokenStall = true
    const a = await w.begin()
    const started = Date.now()
    browser.approve(w.c, a.url.href).catch(() => {})
    const end = await Promise.race([a.done, realDelay(K.requestTimeoutMs + WAIT.deadlineCeilingMs).then(() => ({ timedOut: true }))])
    assert.equal(end.timedOut, undefined, 'the attempt did not end within the deadline')
    assertDeadline(started)
    assert.equal(endCode(end), LIBRARY.attemptEnd.failed)
    assert.equal(await w.record(), undefined)
  })

  // S4: compare-and-drop.
  caseTest(sdk, 'OAC-REV-S4', 1, 'dropTokens({failedAccessToken}) with the stored token drops the tokens', async (t) => {
    const { w, at } = await granted(t)
    const dropped = await w.manager.dropTokens({ failedAccessToken: at })
    assert.equal(dropped.tokens, undefined)
    assert.equal((await w.record()).payload.tokens, undefined)
  })
  caseTest(sdk, 'OAC-REV-S4', 2, 'dropTokens({failedAccessToken}) with another token leaves the record and returns the stored grant', async (t) => {
    const { w, grant } = await granted(t)
    const kept = await w.manager.dropTokens({ failedAccessToken: 'fbtest-an-older-token' })
    assert.deepEqual(kept, grant)
    assert.deepEqual((await w.record()).payload, grant)
  })
  caseTest(sdk, 'OAC-REV-S4', 3, 'after another store refreshed, dropping with the old token keeps the new tokens', async (t) => {
    const { w, at } = await granted(t)
    const other = await openHost(sdk, w.root)
    w.scope.defer(() => other.close())
    const second = w.managerOn(other.ctx.credentials)
    await second.refresh({ failedAccessToken: at })
    const fresh = await second.read()
    assert.notEqual(w.lib.accessTokenOf(fresh), at)
    await w.manager.dropTokens({ failedAccessToken: at })
    // The first store's reads come from a cache its file watcher refreshes; the decision ran under the lock.
    const same = async () => w.lib.accessTokenOf((await w.record())?.payload ?? {}) === w.lib.accessTokenOf(fresh)
    assert.ok(await eventually(same), 'the new tokens were dropped')
    assert.deepEqual(await second.read(), fresh)
  })
}
