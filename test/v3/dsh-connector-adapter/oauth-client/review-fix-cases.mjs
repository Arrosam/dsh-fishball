/**
 * Review-fix rows of the token manager (USE-CASES.md "Review fixes (R-FIX-ADAPTER)"; review findings
 * F1 and F3 of review-x-dsh-connector-adapter.md). Black box over `createTokenManager` on the real
 * credential store of each SDK, against the fake connector (its token endpoint records every
 * refresh grant).
 *
 * - OAC-FIX-F1 (DT): the `upstream` option binds the stored grant (v 1 and `upstream` equal). A
 *   foreign or other-version record counts as absent: `refresh` sends nothing, reports
 *   `no-refresh-token` and leaves the record as it was; `dropTokens` leaves it as it was.
 * - OAC-FIX-F3 (ST, ordering): overlapping refreshes share one flight only for the same failed
 *   token; a late 401 for an older token never makes the current token's recovery decline.
 */
import assert from 'node:assert/strict'
import { FIXTURE, K, LIBRARY, OAUTH, REVIEW_FIX, WAIT } from './constants.mjs'
import { caseTest, grantedWorld } from './cases.mjs'
import { sleep } from './fakes.mjs'

const OUTCOME = LIBRARY.refreshOutcome
const ID = REVIEW_FIX.libraryId

/** The refresh grants that presented `refreshToken` at the token endpoint. */
const presented = (c, refreshToken) => c.refreshRequests().filter((r) => new URLSearchParams(r.body).get(OAUTH.refreshToken) === refreshToken)

/** Replaces the stored payload of the world's key with `shape(payload)`; returns the stored record. */
async function rewrite(w, shape) {
  await w.host.ctx.credentials.modifyRecord(w.key, async (rec) => ({ ...rec, payload: shape(rec.payload) }))
  return w.record()
}

/**
 * The world's credentials with every `modifyRecord` held until `release()`, so calls issued together
 * enter the record lock together (in the order they were issued).
 */
function gated(credentials) {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const held = new Proxy(credentials, {
    get(target, prop) {
      if (prop === 'modifyRecord') return async (...args) => { await gate; return target.modifyRecord(...args) }
      const value = target[prop]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return { credentials: held, release }
}

/** A granted world whose stored token was rotated once: A (the first, now stale) and B (stored, refresh token RB). */
async function rotatedWorld(t, sdk) {
  const g = await grantedWorld(t, sdk)
  const { grant: second } = await g.w.manager.refresh({ failedAccessToken: g.at })
  return { ...g, A: g.at, B: g.w.lib.accessTokenOf(second), RB: second.tokens.refresh_token, before: g.w.c.refreshRequests().length }
}

/**
 * Issues `calls` (each `{failedAccessToken}` or undefined for the timer's form) together on one gated
 * manager, in order, and resolves with their results.
 */
async function together(w, calls) {
  const { credentials, release } = gated(w.host.ctx.credentials)
  const manager = w.managerOn(credentials)
  const pending = calls.map((args) => manager.refresh(args))
  await sleep(WAIT.settleMs)
  release()
  return Promise.all(pending)
}

export function registerOAuthClientReviewFixCases(sdk) {
  // ------------------------------------------------------------------ F1 upstream binding
  const foreign = (p) => ({ ...p, upstream: REVIEW_FIX.foreignUpstream })
  const otherVersion = (p) => ({ ...p, v: FIXTURE.otherGrantVersion })
  const own = (p) => p
  const failedStored = (w, stored) => ({ failedAccessToken: w.lib.accessTokenOf(stored) })
  const timerForm = () => undefined
  /** Moves the clock into the stored grant's lead (the timer's form refreshes only then). */
  const due = async (w, stored) => w.clock.to(stored.tokens.expiresAt - K.leadMs)
  const notDue = async () => {}
  const refreshRows = [
    ['rule 1', 'own grant, upstream set, failed = stored', own, true, notDue, failedStored, OUTCOME.refreshed],
    ['rule 2', 'another upstream, upstream set, failed = stored (not due)', foreign, true, notDue, failedStored, OUTCOME.noRefreshToken],
    ['rule 3', 'another upstream, upstream set, timer form within the lead (due)', foreign, true, due, timerForm, OUTCOME.noRefreshToken],
    ['rule 4', 'v = 2, upstream set, failed = stored (not due)', otherVersion, true, notDue, failedStored, OUTCOME.noRefreshToken],
    ['rule 5', 'v = 2, upstream set, timer form within the lead (due)', otherVersion, true, due, timerForm, OUTCOME.noRefreshToken],
    ['rule 6', 'another upstream, upstream omitted, failed = stored (as before: no binding check)', foreign, false, notDue, failedStored, OUTCOME.refreshed],
  ]
  for (const [row, label, shape, bound, when, argsOf, expected] of refreshRows) {
    const counts = expected === OUTCOME.noRefreshToken
    caseTest(sdk, ID('F1'), row, `refresh: ${label} → ${expected}${counts ? '; no token request; the record is unchanged' : ''}`, async (t) => {
      const { w } = await grantedWorld(t, sdk)
      const stored = await rewrite(w, shape)
      await when(w, stored.payload)
      const manager = w.managerOn(w.host.ctx.credentials, bound ? { upstream: w.c.url } : {})
      const result = await manager.refresh(argsOf(w, stored.payload))
      assert.equal(result.outcome, expected)
      if (!counts) {
        assert.equal(w.c.refreshRequests().length, 1)
        return
      }
      assert.deepEqual(w.c.refreshRequests(), [], 'a refresh grant was sent for a grant of another upstream or version')
      assert.deepEqual(await w.record(), stored, 'the foreign record was modified')
    })
  }
  const dropRows = [
    ['drop 1', 'own grant, failed = stored (control)', own, failedStored, true],
    ['drop 2', 'another upstream, failed = stored', foreign, failedStored, false],
    ['drop 3', 'another upstream, no failed token', foreign, timerForm, false],
    ['drop 4', 'v = 2, failed = stored', otherVersion, failedStored, false],
  ]
  for (const [row, label, shape, argsOf, drops] of dropRows) {
    caseTest(sdk, ID('F1'), row, `dropTokens with upstream set: ${label} → ${drops ? 'the tokens are dropped' : 'the record is unchanged'}`, async (t) => {
      const { w } = await grantedWorld(t, sdk)
      const stored = await rewrite(w, shape)
      await w.managerOn(w.host.ctx.credentials, { upstream: w.c.url }).dropTokens(argsOf(w, stored.payload))
      if (drops) assert.equal((await w.record()).payload.tokens, undefined)
      else assert.deepEqual(await w.record(), stored, 'the foreign record was modified')
    })
  }

  // ------------------------------------------------------------------ F3 mixed-token single flight
  /**
   * The current token's caller got a new token C from exactly one refresh grant, which presented RB
   * once; the stored grant is C and still refreshable. Returns C.
   */
  const expectFreshFromOneRefresh = async (g, result) => {
    const { w, A, B, RB, before } = g
    const C = w.lib.accessTokenOf(result.grant)
    assert.ok(C !== undefined && C !== A && C !== B, 'no new token for the current token\'s 401')
    assert.equal(w.c.refreshRequests().length, before + 1, 'not exactly one refresh grant')
    assert.equal(presented(w.c, RB).length, 1, 'RB was not presented exactly once')
    assert.equal(w.c.stats.reuse, 0)
    const stored = (await w.record()).payload
    assert.equal(w.lib.accessTokenOf(stored), C)
    assert.ok(stored.tokens.refresh_token, 'the refreshable grant was dropped')
    return C
  }
  for (const [row, order] of [['mixed 1', ['A', 'B']], ['mixed 2', ['B', 'A']]]) {
    caseTest(sdk, ID('F3'), row, `refresh(A, late 401) and refresh(B, stored) overlap, ${order.join(' then ')}: A declines; B refreshes once to C; RB presented once; the grant is kept`, async (t) => {
      const g = await rotatedWorld(t, sdk)
      const results = await together(g.w, order.map((x) => ({ failedAccessToken: g[x] })))
      const of = (x) => results[order.indexOf(x)]
      assert.equal(of('B').outcome, OUTCOME.refreshed, 'the caller of the current token did not refresh')
      const C = await expectFreshFromOneRefresh(g, of('B'))
      assert.equal(of('A').outcome, OUTCOME.declined, 'the late 401 for A did not decline')
      const seen = g.w.lib.accessTokenOf(of('A').grant)
      assert.ok([g.B, C].includes(seen), 'A\'s caller got neither B nor C')
      if (order[0] === 'A') assert.equal(seen, g.B, 'A ran first and saw B stored')
    })
  }
  caseTest(sdk, ID('F3'), 'same 1', 'two overlapping refresh(B) share one token request and one result', async (t) => {
    const g = await rotatedWorld(t, sdk)
    const results = await together(g.w, [{ failedAccessToken: g.B }, { failedAccessToken: g.B }])
    for (const r of results) assert.equal(r.outcome, OUTCOME.refreshed)
    const C = await expectFreshFromOneRefresh(g, results[0])
    assert.equal(g.w.lib.accessTokenOf(results[1].grant), C)
  })
  for (const [row, label, inLead, order] of [
    ['timer 1', 'timer (not due) then refresh(B)', false, ['timer', 'B']],
    ['timer 2', 'refresh(B) then timer (not due)', false, ['B', 'timer']],
    ['timer 3', 'timer (due) then refresh(B)', true, ['timer', 'B']],
    ['timer 4', 'refresh(B) then timer (due)', true, ['B', 'timer']],
  ]) {
    caseTest(sdk, ID('F3'), row, `${label} overlap: the 401 caller gets a fresh token; RB presented once`, async (t) => {
      const g = await rotatedWorld(t, sdk)
      if (inLead) await g.w.clock.to((await g.w.record()).payload.tokens.expiresAt - K.leadMs)
      const results = await together(g.w, order.map((x) => (x === 'timer' ? undefined : { failedAccessToken: g.B })))
      // The 401 caller may refresh itself or find the timer's new token (declined): either way a fresh one.
      const C = await expectFreshFromOneRefresh(g, results[order.indexOf('B')])
      const timer = results[order.indexOf('timer')]
      assert.ok([OUTCOME.refreshed, OUTCOME.declined].includes(timer.outcome), 'timer outcome ' + timer.outcome)
      assert.ok([g.B, C].includes(g.w.lib.accessTokenOf(timer.grant)))
    })
  }
}
