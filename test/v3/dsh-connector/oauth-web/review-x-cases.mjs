/**
 * R-FIX-CONNECTOR black-box rows for review finding F06 (.runtime/reports/review-x-dsh-connector.md;
 * R-OA-06/16: a re-enable never revives old authority). The approval page matches the token at
 * generation g, then awaits the pair bind (or the reconnect). Expected outcome, as relayed: when the
 * entry is disabled (its generation moves on, the revocation runs) and re-enabled while that write
 * is suspended, the resumed approval issues NO authorization code (no 303 carrying `code`; the page
 * again or an error status), so no access/refresh chain can be minted from that stale approval
 * under the new generation. With no revocation in the window the normal flow still issues a code
 * that redeems.
 *
 * Level: the suite's C-OAUTH-WEB world (subject.mjs): the real approval handler and code grant over
 * the suite's fakes, the fake pair store's bind or reconnect held mid-call (fakes.mjs `holdNext`), a
 * real browser request to the loopback listener. Techniques: State Transition (Matched(g) → bind
 * held → disabled (g+1) → re-enabled → bind resumes), Equivalence Partitioning (first bind,
 * reconnect; no revocation).
 */
import assert from 'node:assert/strict'
import { FIXTURE, HTTP_HEADER, PARAM, REVIEW_X as RX } from './constants.mjs'
import { assertCode, assertGrantOk, open, redeem, redirectOf, row } from './cases.mjs'

const E = FIXTURE.entry
const V = FIXTURE.value

/** The token value of entry 5, its entry enabled (and, for a reconnect, first bound by a full approval). */
async function entry5(w, { reconnect }) {
  w.tokens.add(5, V(5))
  if (!reconnect) return
  const first = await open(w)
  const res = await first.b.authorize({ token: V(5) })
  assertCode(w, { ...first, res, redirect: redirectOf(res) })
}

/** Authorize with v(E5) while the pair write is held; disable and re-enable E5 inside the hold; then release. */
async function revokedWhileBinding(w, member) {
  const flow = await open(w)
  const gate = w.pairs.holdNext(member)
  const pressing = flow.b.authorize({ token: V(5) })
  await gate.reached
  const before = w.tokens.get(E(5)).generation
  // The revocation as C-OAUTH follows it (followRevocations: revokeEntry at the new generation).
  w.tokens.disable(5)
  await w.store.revokeEntry(E(5), w.tokens.get(E(5)).generation)
  w.tokens.enable(5)
  assert.ok(w.tokens.get(E(5)).generation > before, 'harness: the disable did not move the generation on')
  gate.open()
  const res = await pressing
  return { ...flow, res, redirect: redirectOf(res) }
}

/** No authorization code came out of `flow`: no redirect carrying `code`. */
function assertNoCode(flow) {
  assert.equal(flow.redirect?.params?.[PARAM.code], undefined, `an authorization code was issued for a decision that crossed a revocation (status ${flow.res.status}, location ${flow.res.headers[HTTP_HEADER.location]})`)
}
/** How many codes the store was given. */
const codesStored = (w) => w.store.calls.filter(([n]) => n === 'putCode').length

export function registerReviewXWebCases(sdk) {
  for (const [label, member, reconnect] of [['first bind', RX.bind, false], ['reconnect', RX.reconnect, true]]) {
    row(sdk, RX.id, `ST (${label} held, disabled and re-enabled)`, 'the resumed approval issues no authorization code: no 303 with code; no chain can be redeemed from it', async (w) => {
      await entry5(w, { reconnect })
      const codesBefore = codesStored(w)
      const flow = await revokedWhileBinding(w, member)
      assertNoCode(flow)
      assert.equal(codesStored(w), codesBefore, 'a code was stored for the stale approval')
    })
  }
  row(sdk, RX.id, 'EP (bind held, no revocation)', 'the same held bind with no revocation in the window → a 303 with a code that redeems', async (w) => {
    await entry5(w, { reconnect: false })
    const flow = await open(w)
    const gate = w.pairs.holdNext(RX.bind)
    const pressing = flow.b.authorize({ token: V(5) })
    await gate.reached
    gate.open()
    const res = await pressing
    const done = { ...flow, res, redirect: redirectOf(res) }
    assertCode(w, done)
    assertGrantOk(await redeem(w, done))
  })
}

