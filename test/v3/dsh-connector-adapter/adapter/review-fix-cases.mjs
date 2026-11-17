/**
 * Review-fix rows of the adapter (USE-CASES.md "Review fixes (R-FIX-ADAPTER)"; findings F1–F8 of
 * review-x-dsh-connector-adapter.md). Black box over the adapter world (subject.mjs) and the fake
 * connector's script (oauth-client/fakes.mjs `beforeMcp`, `mcpReply`, `tokenError.times`,
 * `tokenDrop`, `tokenStall`). A second host on the same credentials file stands for another process.
 *
 * - ADP-FIX-F0 (guard): the product's named constants hold the requirement's values.
 * - ADP-FIX-F1 (DT): a same-key record for another upstream / version written during a 401.
 * - ADP-FIX-F2 (EP + BVA): upstream 301/302/303/307/308 → 502, no Location; 300 / 304 relayed.
 * - ADP-FIX-F3 (ST): overlapping 401s for a late token and the current one; a timer and a 401.
 * - ADP-FIX-F4 (BVA + ST): scheduled-refresh retry 30 s ×2 up to 300 s; reset; invalid_grant; dispose.
 * - ADP-FIX-F5 (DT): gateway statuses / a broken body, then a rotation → remount; otherwise not.
 * - ADP-FIX-F6 (ST): a stalled client bounds the upstream lead; resume; disconnect; SSE.
 * - ADP-FIX-F7 (ST): another process rotates or removes the record during a failing refresh.
 * - ADP-FIX-F8 (EP): response headers named by the upstream Connection header are dropped.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import { FIX, FIXTURE, K, K1, MARK, REVIEW_FIX, ROWS, RPC, STATE, WAIT, WEB } from './constants.mjs'
import { eventually, plant, rpcResult, sleep, sseFrame, staysFalse } from './fakes.mjs'
import { callBody, discovers, mcpHeaders, untilChild, untilState } from './subject.mjs'
import { caseTest } from '../oauth-client/cases.mjs'
import { libraryModule, mcpSdk, openHost, requireModule } from '../oauth-client/subject.mjs'
import { authorizedWorld, carriesId, forwardedOf, nextId, proxyRequest, storedToken } from './cases.mjs'

const M = ROWS.m
const WHOAMI = 'whoami'
const ID = REVIEW_FIX.adapterId
const REFRESH = K1.GRANT.refreshToken

// ------------------------------------------------------------------ shared steps

const productConstants = (sdk) => requireModule(sdk, FIX.product)
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
const bearerOf = (r) => r.headers[WEB.authorization]
/** The retry delays `LIMIT` gives for `count` consecutive failures (F4). */
const retryDelays = (LIMIT, count) => Array.from({ length: count }, (_, k) => Math.min(LIMIT.refreshRetryFirstMs * LIMIT.refreshRetryFactor ** k, LIMIT.refreshRetryMaxMs))

/** `exchange`, settled: the head and body, or `{error}` when the proxy dropped the connection. */
const settled = (proxy, id) => exchange(proxy, id).then(async (r) => ({ ...r, end: await r.done }), (error) => ({ error }))

/**
 * One raw POST of a `tools/call` with `id` through the proxy. Resolves at the response head with
 * `{status, headers, done, body(), flow(), close()}`; `done` settles when the body ended or broke.
 * With `paused`, nothing is read until `flow()` (the client stalls; F6).
 */
function exchange(proxy, id, { paused = false } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(proxy.url)
    const chunks = []
    const finished = deferred()
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: WEB.post, headers: mcpHeaders(proxy.auth) }, (res) => {
      res.on('end', () => finished.resolve({ complete: true }))
      res.on('close', () => finished.resolve({ complete: res.complete }))
      res.on('error', () => {})
      const flow = () => res.on('data', (c) => chunks.push(c))
      if (!paused) flow()
      resolve({ status: res.statusCode, headers: res.headers, done: finished.promise, body: () => Buffer.concat(chunks), flow, close: () => req.destroy() })
    })
    req.on('error', (error) => { finished.resolve({ error }); reject(error) })
    req.end(callBody(id))
  })
}

/** Answers the first upstream request carrying `id` with `answer(res)`; a retry gets C's own answer. */
function replyTo(w, id, answer) {
  w.c.script.mcpReply = async (r, res) => {
    if (!carriesId(r, id)) return false
    w.c.script.mcpReply = undefined
    await answer(res)
    return true
  }
}
/** A status-only upstream answer, with optional headers and a JSON body unless bodyless. */
const statusAnswer = (status, headers = {}, body = '{}') => (res) => { res.writeHead(status, { 'content-type': WEB.json, ...headers }); res.end(body) }

/** Moves to the stored grant's E − LEAD and waits until its token rotated; returns the new token. */
async function rotateByTimer(w) {
  const before = await storedToken(w.n)
  await w.clock.to((await w.n.record(M)).payload.tokens.expiresAt - K.leadMs)
  const fresh = await eventually(async () => { const at = await storedToken(w.n); return at !== before && at })
  assert.ok(fresh, 'the timer did not rotate the token')
  return fresh
}

/** A loopback listener that records every request (a redirect target). */
async function startSink(scope) {
  const requests = []
  const server = http.createServer((req, res) => { requests.push({ method: req.method, url: req.url }); req.resume(); res.end() })
  await new Promise((resolve) => server.listen(0, FIXTURE.loopback, resolve))
  scope.defer(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) }))
  return { url: `http://${FIXTURE.loopback}:${server.address().port}${FIX.sinkPath}`, requests }
}

/** Another process on the same credentials file. */
async function otherProcess(w, sdk) {
  const host = await openHost(sdk, w.root)
  w.scope.defer(() => host.close())
  return host
}

export function registerAdapterReviewFixCases(sdk) {
  // ================================================================== F0 the named constants
  caseTest(sdk, ID('F0'), 'guard', 'LIMIT.refreshRetry* and PROXY.status.badGateway hold the requirement\'s values; the retry schedule is 30, 60, 120, 240, 300, 300 s', async () => {
    const { LIMIT, PROXY } = await productConstants(sdk)
    assert.deepEqual([LIMIT.refreshRetryFirstMs, LIMIT.refreshRetryMaxMs, LIMIT.refreshRetryFactor], [FIX.retry.firstMs, FIX.retry.maxMs, FIX.retry.factor])
    assert.deepEqual(retryDelays(LIMIT, FIX.retrySchedule.length), [...FIX.retrySchedule])
    assert.equal(PROXY.status.badGateway, FIX.badGateway)
  })

  // ================================================================== F1 upstream binding of recovery
  const foreignTokens = (now, lifetimeMs) => ({ access_token: plant(MARK.access), refresh_token: plant(MARK.refresh), expiresAt: now + lifetimeMs })
  for (const [row, label, change, lifetimeOf] of [
    ['rule 1', 'another upstream, not yet due', (p) => ({ ...p, upstream: REVIEW_FIX.foreignUpstream }), () => K.accessTokenMs],
    ['rule 2', 'another upstream, due (expiresAt = now + LEAD)', (p) => ({ ...p, upstream: REVIEW_FIX.foreignUpstream }), () => K.leadMs],
    ['rule 3', 'v = 2, not yet due', (p) => ({ ...p, v: FIXTURE.otherGrantVersion }), () => K.accessTokenMs],
  ]) {
    caseTest(sdk, ID('F1'), row, `another process writes a same-key grant (${label}) while a request gets 401: no foreign token reaches C; the record stays byte-identical; needs-authorization`, async (t) => {
      const { w } = await authorizedWorld(t, sdk)
      const editor = await otherProcess(w, sdk)
      const A = await storedToken(w.n)
      const refreshes = w.c.refreshRequests().length
      const p = w.n.proxyOf(M)
      const id = nextId()
      const planted = foreignTokens(w.clock.now(), lifetimeOf())
      let fileAfterWrite
      w.c.script.beforeMcp = async (r) => {
        if (!carriesId(r, id) || bearerOf(r) !== WEB.bearer + A || fileAfterWrite !== undefined) return false
        await editor.ctx.credentials.modifyRecord(w.n.key(M), async (rec) => ({ ...rec, payload: { ...change(rec.payload), tokens: { ...rec.payload.tokens, ...planted } } }))
        fileAfterWrite = fs.readFileSync(w.n.host.credentialsFile, 'utf8')
        return true
      }
      await settled(p, id)
      await untilState(w.n, M, STATE.needsAuthorization)
      assert.ok(await eventually(() => w.n.child(M) === undefined), 'the child row stayed')
      await sleep(WAIT.quietMs)
      const seen = JSON.stringify(w.c.requests)
      for (const v of [planted.access_token, planted.refresh_token]) assert.equal(seen.includes(v), false, 'a foreign token was sent to C')
      assert.deepEqual([...new Set(forwardedOf(w.c, id).map(bearerOf))], [WEB.bearer + A], 'the old endpoint received another bearer than its own')
      assert.equal(w.c.refreshRequests().length, refreshes, 'the foreign grant was refreshed')
      assert.equal(fs.readFileSync(w.n.host.credentialsFile, 'utf8'), fileAfterWrite, 'the foreign record was modified')
    })
  }

  // ================================================================== F2 redirects are not relayed
  const sameOrigin = async (w) => ({ url: w.c.origin + FIX.sinkPath, hits: () => w.c.requests.filter((r) => r.path === FIX.sinkPath) })
  const crossOrigin = async (w) => { const s = await startSink(w.scope); return { url: s.url, hits: () => s.requests } }
  const redirectRows = [
    ...FIX.redirectStatuses.map((status) => [`${status} cross-origin`, status, crossOrigin]),
    ...[WEB.temporaryRedirect, FIX.redirectStatuses.at(-1)].map((status) => [`${status} same-origin`, status, sameOrigin]),
  ]
  for (const [row, status, targetOf] of redirectRows) {
    caseTest(sdk, ID('F2'), row, `upstream answers ${status} to a loopback target: the proxy answers 502 with no Location; a default-follow client never reaches the target`, async (t) => {
      const { w } = await authorizedWorld(t, sdk)
      const { PROXY } = await productConstants(sdk)
      const target = await targetOf(w)
      const id = nextId()
      replyTo(w, id, statusAnswer(status, { [WEB.location]: target.url }))
      const p = w.n.proxyOf(M)
      const res = await globalThis.fetch(p.url, { method: WEB.post, headers: mcpHeaders(p.auth), body: callBody(id) })
      await res.arrayBuffer().catch(() => {})
      assert.equal(res.redirected, false, 'the client followed a relayed redirect')
      assert.equal(res.status, PROXY.status.badGateway)
      assert.equal(res.headers.get(WEB.location), null, 'a Location was relayed')
      assert.equal(await staysFalse(() => target.hits().length > 0), true, 'the redirect target received a request')
    })
  }
  caseTest(sdk, ID('F2'), `${WEB.temporaryRedirect} to plain http off loopback`, 'upstream answers 307 to an http:// non-loopback URL: 502 with no Location (read with redirect manual; nothing is contacted)', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const { PROXY } = await productConstants(sdk)
    const id = nextId()
    replyTo(w, id, statusAnswer(WEB.temporaryRedirect, { [WEB.location]: FIX.plainHttpTarget }))
    const answer = await settled(w.n.proxyOf(M), id)
    assert.equal(answer.status, PROXY.status.badGateway)
    assert.equal(answer.headers?.[WEB.location], undefined)
  })
  for (const [row, status, body] of [['300 (below the set)', FIX.multipleChoices, '{}'], ['304 (inside 3xx, not followed)', FIX.notModified, undefined]]) {
    caseTest(sdk, ID('F2'), row, `upstream answers ${status}: relayed as ${status}`, async (t) => {
      const { w } = await authorizedWorld(t, sdk)
      const id = nextId()
      replyTo(w, id, statusAnswer(status, {}, body))
      assert.equal((await settled(w.n.proxyOf(M), id)).status, status)
    })
  }

  // ================================================================== F3 mixed-token single flight, end to end
  /**
   * Holds the first upstream request with `id` and bearer `token()` at C until `gate`, then answers it
   * 401. Several holds share one `beforeMcp`.
   */
  const holds = (w) => {
    const plan = []
    w.c.script.beforeMcp = async (r) => {
      const hold = plan.find((h) => !h.done && carriesId(r, h.id) && bearerOf(r) === WEB.bearer + h.token)
      if (!hold) return false
      hold.done = true
      hold.held.resolve()
      await hold.gate.promise
      return true
    }
    return (id, token) => { const h = { id, token, held: deferred(), gate: deferred() }; plan.push(h); return h }
  }
  /** The request's final answer is 200, retried with a new token C ≠ `old`; C is stored; tokens kept. */
  const expectRetriedFresh = async (w, id, answer, old) => {
    await answer.done
    assert.equal(answer.status, WEB.ok, 'the request did not succeed')
    const sent = forwardedOf(w.c, id).map(bearerOf)
    const C = await storedToken(w.n)
    assert.ok(C !== undefined && !old.includes(C), 'no new token stored')
    assert.equal(sent.at(-1), WEB.bearer + C, 'the retry did not carry the new token: ' + sent.length + ' attempts')
    assert.equal(w.c.stats.reuse, 0, 'a refresh token was presented twice')
    assert.ok((await w.n.record(M)).payload.tokens?.refresh_token, 'the tokens were dropped')
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
  }
  for (const [row, order] of [['mixed 1', ['A', 'B']], ['mixed 2', ['B', 'A']]]) {
    caseTest(sdk, ID('F3'), row, `a late 401 for A and a 401 for the stored B arrive together (${order.join(' then ')}): the B request is retried with a new C and succeeds; one refresh; authorized`, async (t) => {
      const { w } = await authorizedWorld(t, sdk)
      const hold = holds(w)
      const p = w.n.proxyOf(M)
      const A = await storedToken(w.n)
      const ids = { A: nextId(), B: nextId() }
      const hA = hold(ids.A, A)
      const sentA = exchange(p, ids.A)
      await hA.held.promise
      const B = await rotateByTimer(w)
      const refreshes = w.c.refreshRequests().length
      const hB = hold(ids.B, B)
      const sentB = exchange(p, ids.B)
      await hB.held.promise
      for (const x of order) (x === 'A' ? hA : hB).gate.resolve()
      await expectRetriedFresh(w, ids.B, await sentB, [A, B])
      assert.equal(w.c.refreshRequests().length, refreshes + 1, 'not exactly one refresh for B\'s 401')
      await (await sentA).done
    })
  }
  caseTest(sdk, ID('F3'), 'timer + 401', 'the timer fires at E − LEAD while a 401 for the stored token arrives: the call is retried with a fresh token; one refresh token presented once', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    const hold = holds(w)
    const A = await storedToken(w.n)
    const id = nextId()
    const h = hold(id, A)
    const sent = exchange(w.n.proxyOf(M), id)
    await h.held.promise
    h.gate.resolve()
    await w.clock.to(E - K.leadMs)
    await expectRetriedFresh(w, id, await sent, [A])
    assert.equal(w.c.refreshRequests().length, 1)
  })

  // ================================================================== F4 scheduled-refresh retry
  const transient = (error, status) => (w) => { w.c.script.tokenError = { grant: REFRESH, error, status, times: Infinity } }
  /** Asserts no refresh before `delay` and exactly one at it, then lets that attempt settle. */
  const expectAttemptAt = async (w, delay, label) => {
    const n = w.c.refreshRequests().length
    await w.clock.advance(delay - K.tickMs)
    assert.equal(await staysFalse(() => w.c.refreshRequests().length > n), true, `${label}: a refresh before ${delay} ms`)
    await w.clock.advance(K.tickMs)
    assert.ok(await eventually(() => w.c.refreshRequests().length === n + 1), `${label}: no refresh at ${delay} ms`)
    await sleep(WAIT.quietMs)
  }
  /** The scheduled refresh at E − LEAD fails once (`arrange`), settled after `settleMs`. */
  const failAtLead = async (w, E, arrange, settleMs = WAIT.quietMs) => {
    arrange(w)
    await w.clock.to(E - K.leadMs)
    assert.ok(await eventually(() => w.c.refreshRequests().length === 1), 'no scheduled refresh at E − LEAD')
    await sleep(settleMs)
  }
  const expectKept = async (w, grant) => {
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
    assert.deepEqual((await w.n.record(M)).payload.tokens, grant.tokens, 'the credentials changed during the retries')
  }
  caseTest(sdk, ID('F4'), 'schedule', 'a standing server_error (500): retries at +30, +60, +120, +240, +300, +300 s, none 1 ms before each; credentials kept; authorized', async (t) => {
    const { w, grant, E } = await authorizedWorld(t, sdk)
    const { LIMIT } = await productConstants(sdk)
    await failAtLead(w, E, transient(K1.OAUTH_ERROR.serverError, FIX.serverError))
    for (const [k, delay] of retryDelays(LIMIT, FIX.retrySchedule.length).entries()) {
      await expectAttemptAt(w, delay, `retry ${k + 1}`)
      await expectKept(w, grant)
    }
  })
  for (const [row, arrange, settleMs] of [
    ['429', transient(K1.OAUTH_ERROR.temporarilyUnavailable, FIX.tooManyRequests)],
    ['503', transient(K1.OAUTH_ERROR.serverError, FIX.gatewayStatuses[1])],
    ['network error', (w) => { w.c.script.tokenDrop = Infinity }],
    ['timeout', (w) => { w.c.script.tokenStall = true }, K.requestTimeoutMs + WAIT.deadlineSlackMs],
  ]) {
    caseTest(sdk, ID('F4'), row, `the scheduled refresh fails (${row}): the next attempt is 30 s later, none before; credentials kept; authorized`, async (t) => {
      const { w, grant, E } = await authorizedWorld(t, sdk)
      const { LIMIT } = await productConstants(sdk)
      await failAtLead(w, E, arrange, settleMs)
      await expectKept(w, grant)
      await expectAttemptAt(w, LIMIT.refreshRetryFirstMs, 'retry 1')
      await expectKept(w, grant)
    })
  }
  caseTest(sdk, ID('F4'), 'recovery', 'two failures then success: the new token is stored, the next refresh is at the new E − LEAD, and a later failure retries after 30 s again (backoff reset)', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    const { LIMIT } = await productConstants(sdk)
    const [first, second] = retryDelays(LIMIT, 2)
    await failAtLead(w, E, (x) => { x.c.script.tokenError = { grant: REFRESH, error: K1.OAUTH_ERROR.serverError, status: FIX.serverError, times: 2 } })
    await expectAttemptAt(w, first, 'retry 1 (fails)')
    const before = await storedToken(w.n)
    await expectAttemptAt(w, second, 'retry 2 (succeeds)')
    assert.ok(await eventually(async () => (await storedToken(w.n)) !== before), 'the successful retry was not stored')
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
    const E2 = (await w.n.record(M)).payload.tokens.expiresAt
    w.c.script.tokenError = { grant: REFRESH, error: K1.OAUTH_ERROR.serverError, status: FIX.serverError, times: 1 }
    const n = w.c.refreshRequests().length
    await w.clock.to(E2 - K.leadMs - K.tickMs)
    assert.equal(await staysFalse(() => w.c.refreshRequests().length > n), true, 'a refresh before the new E − LEAD')
    await w.clock.advance(K.tickMs)
    assert.ok(await eventually(() => w.c.refreshRequests().length === n + 1), 'no refresh at the new E − LEAD')
    await sleep(WAIT.quietMs)
    await expectAttemptAt(w, first, 'after the reset')
  })
  caseTest(sdk, ID('F4'), 'invalid_grant', 'a transient failure, then invalid_grant on the retry: needs-authorization, tokens dropped, no further refresh', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    const { LIMIT } = await productConstants(sdk)
    await failAtLead(w, E, transient(K1.OAUTH_ERROR.serverError, FIX.serverError))
    w.c.script.tokenError = { grant: REFRESH, error: K1.OAUTH_ERROR.invalidGrant, status: FIX.badRequest, times: Infinity }
    await expectAttemptAt(w, LIMIT.refreshRetryFirstMs, 'retry 1 (invalid_grant)')
    await untilState(w.n, M, STATE.needsAuthorization)
    assert.equal((await w.n.record(M)).payload.tokens, undefined)
    const n = w.c.refreshRequests().length
    await w.clock.advance(FIX.quietSpans * LIMIT.refreshRetryMaxMs)
    assert.equal(w.c.refreshRequests().length, n, 'a refresh after invalid_grant')
  })
  caseTest(sdk, ID('F4'), 'dispose', 'the adapter is disposed during the backoff: no further refresh request', async (t) => {
    const { w, E } = await authorizedWorld(t, sdk)
    const { LIMIT } = await productConstants(sdk)
    await failAtLead(w, E, transient(K1.OAUTH_ERROR.serverError, FIX.serverError))
    await w.n.fiber.dispose()
    const n = w.c.refreshRequests().length
    await w.clock.advance(FIX.quietSpans * LIMIT.refreshRetryMaxMs)
    assert.equal(await staysFalse(() => w.c.refreshRequests().length > n), true, 'a refresh after the adapter was disposed')
  })

  // ================================================================== F5 gateway outages
  /** Writes a 200 head and a partial body, then breaks the upstream connection. */
  const brokenBody = (res) => { res.writeHead(WEB.ok, { 'content-type': WEB.json }); res.write('{"jsonrpc"'); res.socket.destroy() }
  /** One proxied request answered by `answer`, then (optionally) one ordinary request. */
  const outage = async (w, answer, { recovered = false } = {}) => {
    const id = nextId()
    replyTo(w, id, answer)
    await settled(w.n.proxyOf(M), id)
    if (recovered) assert.equal((await proxyRequest(w.n.proxyOf(M).url, { headers: mcpHeaders(w.n.proxyOf(M).auth), body: callBody(nextId()) })).status, WEB.ok)
  }
  const expectRemount = async (w, fiber, connects) => {
    assert.ok(await eventually(() => w.n.child(M) !== undefined && w.n.child(M) !== fiber), 'the child row was not mounted again')
    await untilChild(w.n, M, WHOAMI)
    assert.ok(discovers(w.c).length > connects, 'the new child row did not connect')
    assert.ok((await w.n.call(M, WHOAMI)).value, 'the new child row does not work')
  }
  const expectSameChild = async (w, fiber) => {
    assert.equal(await staysFalse(() => w.n.child(M) !== fiber), true, 'the child row was replaced')
  }
  const gatewayRows = [
    ...FIX.gatewayStatuses.map((status) => [`${status}`, statusAnswer(status), {}, true]),
    ['broken body', brokenBody, {}, true],
    ['502, then a successful request', statusAnswer(FIX.gatewayStatuses[0]), { recovered: true }, false],
    ['broken body, then a successful request', brokenBody, { recovered: true }, false],
    ['400 (not a gateway status)', statusAnswer(FIX.badRequest), {}, false],
    ['500 (boundary: not in 502–504)', statusAnswer(FIX.serverError), {}, false],
  ]
  for (const [row, answer, options, remounts] of gatewayRows) {
    caseTest(sdk, ID('F5'), row, `a proxied upstream answer: ${row}; then the timer rotates the token → ${remounts ? 'the child row is disposed and a fresh one mounted' : 'the same child row stays'}`, async (t) => {
      const { w } = await authorizedWorld(t, sdk)
      const fiber = w.n.child(M)
      const connects = discovers(w.c).length
      await outage(w, answer, options)
      await rotateByTimer(w)
      assert.equal(w.n.stateOf(M).state, STATE.authorized)
      if (remounts) await expectRemount(w, fiber, connects)
      else await expectSameChild(w, fiber)
    })
  }
  caseTest(sdk, ID('F5'), '401 (refresh path)', 'a proxied 401 (once) is recovered by a refresh: not an outage; the same child row stays', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const fiber = w.n.child(M)
    const before = await storedToken(w.n)
    await outage(w, statusAnswer(WEB.unauthorized, { [WEB.wwwAuthenticate]: K1.invalidTokenChallenge(w.c.origin) }))
    assert.ok(await eventually(async () => (await storedToken(w.n)) !== before), 'the 401 was not recovered by a refresh')
    await expectSameChild(w, fiber)
  })
  caseTest(sdk, ID('F5'), 'client disconnect', 'the client itself disconnects mid-stream (not an upstream failure); then a rotation: the same child row stays', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const fiber = w.n.child(M)
    const id = nextId()
    const upstreamClosed = deferred()
    replyTo(w, id, (res) => {
      res.on('close', () => upstreamClosed.resolve())
      res.writeHead(WEB.ok, { 'content-type': WEB.sse })
      res.write(sseFrame({ jsonrpc: RPC.jsonrpc, method: RPC.resourceUpdated, params: { uri: FIX.stream.sseMarker(0) } }))
    })
    const r = await exchange(w.n.proxyOf(M), id)
    assert.ok(await eventually(() => r.body().length > 0), 'no first frame')
    r.close()
    await upstreamClosed.promise
    await rotateByTimer(w)
    await expectSameChild(w, fiber)
  })

  // ================================================================== F6 backpressure
  const S = FIX.stream
  /** Streams `S.chunks` chunks of `S.chunkBytes` (chunk k filled with k mod 256), honouring drain. */
  const producer = () => {
    const state = { produced: 0, closed: false }
    const answer = (res) => {
      res.on('close', () => { state.closed = true })
      res.writeHead(WEB.ok, { 'content-type': S.octet })
      ;(async () => {
        for (let k = 0; k < S.chunks && !state.closed; k += 1) {
          state.produced += 1
          if (!res.write(Buffer.alloc(S.chunkBytes, k % S.byteValues))) await new Promise((resolve) => { res.once('drain', resolve); res.once('close', resolve) })
        }
        if (!state.closed) res.end()
      })()
    }
    return { state, answer }
  }
  const stalled = async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const id = nextId()
    const p = producer()
    replyTo(w, id, p.answer)
    const r = await exchange(w.n.proxyOf(M), id, { paused: true })
    await sleep(S.pauseMs)
    assert.ok(p.state.produced < S.chunks * S.pausedLeadFraction, `the proxy pulled ${p.state.produced} of ${S.chunks} chunks while the client was paused`)
    return { w, p, r }
  }
  caseTest(sdk, ID('F6'), 'stall + resume', 'a paused client and a fast 32 MiB upstream: under a quarter is pulled while paused; on resume the whole body arrives in order', async (t) => {
    const { r } = await stalled(t)
    r.flow()
    assert.equal((await r.done).complete, true, 'the body did not complete')
    const body = r.body()
    assert.equal(body.length, S.chunks * S.chunkBytes)
    for (let k = 0; k < S.chunks; k += 1) {
      const expected = k % S.byteValues
      assert.ok(body[k * S.chunkBytes] === expected && body[(k + 1) * S.chunkBytes - 1] === expected, `chunk ${k} out of order`)
    }
  })
  caseTest(sdk, ID('F6'), 'disconnect while blocked', 'the paused client disconnects: the upstream body is cancelled; the proxy keeps serving', async (t) => {
    const { w, p, r } = await stalled(t)
    r.close()
    assert.ok(await eventually(() => p.state.closed), 'the upstream response was not cancelled')
    assert.ok(p.state.produced < S.chunks)
    const next = await proxyRequest(w.n.proxyOf(M).url, { headers: mcpHeaders(w.n.proxyOf(M).auth), body: callBody(nextId()) })
    assert.equal(next.status, WEB.ok)
  })
  caseTest(sdk, ID('F6'), 'SSE', 'an SSE response: each frame reaches the client before the upstream writes the next or ends', async (t) => {
    const { w } = await authorizedWorld(t, sdk)
    const id = nextId()
    const opened = deferred()
    replyTo(w, id, (res) => { res.writeHead(WEB.ok, { 'content-type': WEB.sse }); res.flushHeaders(); opened.resolve(res) })
    // The proxy may send its response head only with the first frame, so the head is awaited after it.
    const head = exchange(w.n.proxyOf(M), id)
    const upstream = await opened.promise
    let r
    for (let k = 1; k <= S.sseFrames; k += 1) {
      upstream.write(sseFrame({ jsonrpc: RPC.jsonrpc, method: RPC.resourceUpdated, params: { uri: S.sseMarker(k) } }))
      r ??= await head
      assert.ok(await eventually(() => r.body().toString('utf8').includes(S.sseMarker(k))), `frame ${k} did not arrive before the upstream went on`)
    }
    upstream.end()
    assert.equal((await r.done).complete, true)
  })

  // ================================================================== F7 credential updates during own writes
  /**
   * Another process (its own store and token manager on the same file) acts right before N's
   * scheduled refresh, which fails transiently (one server_error); returns what it left on disk.
   */
  const raceScheduledRefresh = async (t, act) => {
    const { w, E } = await authorizedWorld(t, sdk)
    const editor = await otherProcess(w, sdk)
    const lib = await libraryModule(sdk)
    const manager = lib.createTokenManager({ sdk: await mcpSdk(sdk), credentials: editor.ctx.credentials, key: w.n.key(M), now: w.clock.now, refreshLeadMs: K.leadMs, fetchFn: w.recorder.fetch })
    const A = await storedToken(w.n)
    await act({ w, editor, manager, lib, A })
    w.c.script.tokenError = { grant: REFRESH, error: K1.OAUTH_ERROR.serverError, status: FIX.serverError, times: 1 }
    await w.clock.to(E - K.leadMs)
    await sleep(WAIT.quietMs)
    return { w, A, file: fs.readFileSync(w.n.host.credentialsFile, 'utf8') }
  }
  caseTest(sdk, ID('F7'), 'rotation', 'another process rotates A → B (same expiry, still due) just before N\'s scheduled refresh, which fails: N\'s proxy sends B on the next request, with no further file change', async (t) => {
    let B
    const { w, A, file } = await raceScheduledRefresh(t, async ({ manager, lib, A: old }) => {
      const { outcome, grant } = await manager.refresh({ failedAccessToken: old })
      assert.equal(outcome, lib.OAUTH_CLIENT.refreshOutcome.refreshed, 'precondition: the other process rotated the grant')
      B = grant.tokens.access_token
    })
    assert.notEqual(B, A)
    assert.equal(w.n.stateOf(M).state, STATE.authorized)
    const id = nextId()
    const r = await proxyRequest(w.n.proxyOf(M).url, { headers: mcpHeaders(w.n.proxyOf(M).auth), body: callBody(id) })
    assert.equal(r.status, WEB.ok)
    assert.equal(bearerOf(forwardedOf(w.c, id)[0]), WEB.bearer + B, 'the proxy still sends the old token')
    assert.equal(fs.readFileSync(w.n.host.credentialsFile, 'utf8'), file, 'the file changed (convergence needed a new write)')
  })
  caseTest(sdk, ID('F7'), 'removal', 'another process removes the record just before N\'s scheduled refresh: needs-authorization; the child row is disposed of', async (t) => {
    const { w } = await raceScheduledRefresh(t, async ({ w: x, editor }) => { await editor.ctx.credentials.deleteRecord(x.n.key(M)) })
    await untilState(w.n, M, STATE.needsAuthorization)
    assert.ok(await eventually(() => w.n.child(M) === undefined), 'the child row stayed')
  })

  // ================================================================== F8 response hop-by-hop
  const H = FIX.hop
  for (const [row, connection, named] of [
    ['one name', H.a, [H.a]],
    ['upper case', H.a.toUpperCase(), [H.a]],
    ['two names, mixed case and whitespace', `  ${H.a} ,${H.b.toUpperCase()}  `, [H.a, H.b]],
    ['with a standard token', `keep-alive, ${H.b}`, [H.b]],
  ]) {
    caseTest(sdk, ID('F8'), row, `upstream Connection: "${connection}": the named response headers are not forwarded; the others are`, async (t) => {
      const { w } = await authorizedWorld(t, sdk)
      const id = nextId()
      const headers = { connection, [H.a]: H.value, [H.b]: H.value, [H.endToEnd]: H.value, [H.session]: H.sessionValue }
      replyTo(w, id, statusAnswer(WEB.ok, headers, JSON.stringify(rpcResult(id, { content: [] }))))
      const r = await settled(w.n.proxyOf(M), id)
      assert.equal(r.status, WEB.ok)
      for (const h of named) assert.equal(r.headers[h], undefined, h + ' was forwarded')
      for (const h of [H.a, H.b].filter((x) => !named.includes(x))) assert.equal(r.headers[h], H.value, 'the un-named ' + h + ' was dropped')
      assert.equal(r.headers[H.endToEnd], H.value)
      assert.equal(r.headers[H.session], H.sessionValue)
      assert.match(r.headers['content-type'] ?? '', new RegExp(WEB.json))
    })
  }
}
