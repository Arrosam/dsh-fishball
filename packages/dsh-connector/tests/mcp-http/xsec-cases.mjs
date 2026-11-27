/**
 * X-SEC X-03, MCP-endpoint part (.runtime/reports/x-sec-audit.md; the C-WIRE-2 requirements relayed
 * 2026-11-17; K1 FAILURE_LIMIT amended): a valid bearer always passes; an invalid bearer is counted
 * (its key is the remote address alone); while the address is limited an invalid bearer gets 429 with
 * Retry-After and is not counted again. State transition: Open --(perAddressPerWindow / perKeyPerWindow
 * refused bearers)--> Limited; in Limited a valid bearer → 200, an invalid one → 429.
 * The limiter is a fake that applies K1 FAILURE_LIMIT's rule (subject.mjs LimitingFailures).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'dsh-connector-test-helpers/cases'
import { assert401, assertDiscovered, modernRpc, post, wireOf } from './cases.mjs'
import { FAILURE_LIMIT, FIXTURE, HTTP_STATUS, RATE_LIMITS, RPC } from './constants.mjs'
import { LimitingFailures, httpWorld } from './subject.mjs'

const ID = 'X-SEC X-03'
const WRONG = FIXTURE.wrongToken
/** One case on a world whose failure limiter applies K1's rule. */
const limitedWorld = (sdk, part, title, fn) => caseTest(sdk, ID, part, title, async (t) => fn(await httpWorld(t, sdk, {}, { failures: new LimitingFailures() }), await wireOf(sdk)))
/** `n` requests with unknown bearers from the world's one address; returns the answers. */
async function refusedBearers(w, wire, n) {
  const out = []
  for (let i = 0; i < n; i += 1) out.push(await post(w, wire, modernRpc(wire, RPC.discover), { token: WRONG(i) }))
  return out
}
/** The number of refused bearers that limits the address under either K1 ceiling. */
const TO_LIMIT = Math.max(FAILURE_LIMIT.perKeyPerWindow, FAILURE_LIMIT.perAddressPerWindow)

export function registerXsecHttpCases(sdk) {
  limitedWorld(sdk, 'counted', 'each unknown bearer is 401 and counted on the address', async (w, wire) => {
    const [res] = await refusedBearers(w, wire, 1)
    assert401(w, res, { presented: true })
    assert.equal(w.failures.recorded.length, 1)
  })
  limitedWorld(sdk, 'valid while limited', `after ${TO_LIMIT} refused bearers from ${FIXTURE.loopback}, a valid bearer from ${FIXTURE.loopback} → 200`, async (w, wire) => {
    await refusedBearers(w, wire, TO_LIMIT)
    const { token } = w.principal(FIXTURE.idP)
    assertDiscovered(await post(w, wire, modernRpc(wire, RPC.discover), { token }))
  })
  limitedWorld(sdk, 'invalid while limited', 'while limited an unknown bearer → 429 with a whole-second Retry-After, not counted again', async (w, wire) => {
    await refusedBearers(w, wire, TO_LIMIT)
    const counted = w.failures.recorded.length
    const res = await post(w, wire, modernRpc(wire, RPC.discover), { token: WRONG(TO_LIMIT) })
    assert.equal(res.status, HTTP_STATUS.tooManyRequests)
    assert.match(res.headers[RATE_LIMITS.retryAfterHeader] ?? '', /^\d+$/)
    assert.equal(w.failures.recorded.length, counted, 'a limited refusal was counted')
  })
}
