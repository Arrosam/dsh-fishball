/**
 * MULTI-1 ask-card rows (PLAN-MULTI §5, Q07; ask-card.d.ts `handle`, `source`, `voided`; ui.d.ts
 * `asks.answer(handle, …)`; SEAM_TARGETS `ask`, `http`; contracts README example "A and B both offer
 * approvalId ap-1"). Integration level: the real cards table and store over a world with two target
 * links (world.mjs `sources`), bound to the relayed seam `createAsks({targets, …})`, `take(page,
 * source)`, `toolFor(source, name)`, `voidWhere(pred)`.
 *
 * Techniques:
 * - EP over where an equal approvalId comes from (A, B, both) and over the handle (A's, B's, unknown);
 * - Decision table MULTI-ASK-DT-01: card state (open / answered) × void cause (target removed /
 *   epoch retired) → voided or kept, and what is sent (nothing);
 * - State transition MULTI-ASK-ST-01: open → voided → (answer refused, restart keeps it voided).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { ANSWER, ASK_TOOL, CODE, EVENT_TYPE, K3, ROUTE, TOOL, WAIT } from './constants.mjs'
import { askEvent, offerOf, request, routesFor, worldFor } from './world.mjs'
import { SEAM_TARGETS, SOURCE, askHandle, askToolNameOf, tupleOfHandle, TARGETS } from '../wire/targets-oracle.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({ ep: 'MULTI-ASK-EP-01', dt: 'MULTI-ASK-DT-01', st: 'MULTI-ASK-ST-01', route: 'MULTI-ASK-ROUTE-01' })
const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)
const json = (v) => JSON.stringify(v)
const refused = (code) => ({ ok: false, code })
const TWO = Object.freeze([SOURCE.a, SOURCE.b])
const sentOn = (w, s) => w.linkOf(s).sent()

/** The same ask event (equal approvalId, offerId, eventId) as both targets send it. */
function twinAsk() { return askEvent({ type: EVENT_TYPE.permission }) }
/** Takes `event` on `source` and files it through that target's own ask_user; returns the result. */
async function fileOn(w, source, event) {
  await w.pollFrom(source, event)
  return w.tools.get(source).execute({ [ASK_TOOL.arg]: offerOf(event) })
}
const cardOf = (w, source, event) => w.card(event.payload.approvalId, source)
/**
 * The relayed seam names `voidWhere(pred)` without the predicate's argument; the harness accepts a
 * TargetSource-like argument or a card/record carrying `source` (an ambiguity the report names).
 */
const sourceIn = (x) => x?.source ?? x
const removed = (s) => (x) => sourceIn(x)?.targetId === s.targetId
const retired = (s) => (x) => sourceIn(x)?.targetId === s.targetId && sourceIn(x)?.endpointEpoch === s.endpointEpoch

export function registerMultiAskCases(sdk) {
  // ------------------------------------------------------------------ EP: equal approvalIds, two cards
  row(sdk, ID.ep, '1 equal approvalId on A and B', 'A and B offer the same approvalId → two cards, two handles (each the base64url of ["approval", targetId, epoch, approvalId]), each card\'s source its own target', async (t) => {
    const w = await worldFor(t, sdk, { sources: TWO })
    const event = twinAsk()
    assert.equal((await fileOn(w, SOURCE.a, event))?.ok, true)
    assert.equal((await fileOn(w, SOURCE.b, event))?.ok, true)
    const cards = w.service.list()
    assert.equal(cards.length, 2, 'not two cards: ' + json(cards))
    for (const source of TWO) {
      const card = cardOf(w, source, event)
      assert.ok(card, 'no card under ' + source.targetId)
      assert.deepEqual(tupleOfHandle(card.handle), [TARGETS.key.kind.approval, source.targetId, source.endpointEpoch, event.payload.approvalId])
      assert.deepEqual(card.source, { ...source })
      assert.equal(card.approvalId, event.payload.approvalId, 'the raw approvalId changed')
    }
    assert.notEqual(cards[0].handle, cards[1].handle)
  })
  row(sdk, ID.ep, '2 answer A only', 'answer(handle A) sends one approval_answer on A\'s link only; B\'s card stays open and B\'s link gets nothing', async (t) => {
    const w = await worldFor(t, sdk, { sources: TWO })
    const event = twinAsk()
    await fileOn(w, SOURCE.a, event)
    await fileOn(w, SOURCE.b, event)
    assert.deepEqual(await w.service.answer(askHandle(SOURCE.a, event.payload.approvalId), { choice: ANSWER.reject }), { ok: true })
    assert.equal(sentOn(w, SOURCE.a).length, 1, 'A\'s link did not get one answer')
    assert.equal(sentOn(w, SOURCE.b).length, 0, 'B\'s link got A\'s answer')
    assert.equal(cardOf(w, SOURCE.a, event).state, K3.state.answered)
    assert.equal(cardOf(w, SOURCE.b, event).state, K3.state.open)
    assert.deepEqual(w.misrouted, [])
  })
  row(sdk, ID.ep, '3 file only through own tool', 'B\'s ask_user cannot file A\'s offer: an offer taken only on A is unknown to B\'s tool, and A\'s card is filed only by A\'s tool', async (t) => {
    const w = await worldFor(t, sdk, { sources: TWO })
    const event = twinAsk()
    await w.pollFrom(SOURCE.a, event)
    assert.deepEqual(await w.tools.get(SOURCE.b).execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.unknownOffer))
    assert.equal(w.service.list().length, 0, 'a card was filed through the other target\'s tool')
  })
  row(sdk, ID.ep, '4 tool names per target', 'each target\'s local ask_user has its own frozen name mcp__<readable>__ask_user_<digest> (origin local); A\'s and B\'s differ', async (t) => {
    const w = await worldFor(t, sdk, { sources: TWO })
    for (const source of TWO) assert.equal(w.tools.get(source).name, askToolNameOf(source, ASK_TOOL.name))
    assert.notEqual(w.tools.get(SOURCE.a).name, w.tools.get(SOURCE.b).name)
  })

  // ------------------------------------------------------------------ DT: voiding (Q07)
  for (const [rule, settle, cause, voided] of [
    ['1 open × removed', null, removed, true],
    ['2 open × epoch retired', null, retired, true],
    ['3 answered × removed', ANSWER.allow, removed, false],
  ]) {
    row(sdk, ID.dt, rule, `A's card ${settle === null ? 'open' : 'answered'}, then A ${rule.includes('removed') ? 'is removed' : 'retires its epoch'} → ${voided ? 'voided' : 'stays answered'}; B's equal card stays open; nothing is sent to either target`, async (t) => {
      const w = await worldFor(t, sdk, { sources: TWO })
      const event = twinAsk()
      await fileOn(w, SOURCE.a, event)
      await fileOn(w, SOURCE.b, event)
      if (settle !== null) await w.service.answer(askHandle(SOURCE.a, event.payload.approvalId), { choice: settle })
      const sentBefore = [sentOn(w, SOURCE.a).length, sentOn(w, SOURCE.b).length]
      w.retire(SOURCE.a)
      await w.voidWhere(cause(SOURCE.a))
      assert.equal(cardOf(w, SOURCE.a, event)?.state, voided ? K3.state.voided : K3.state.answered)
      assert.equal(cardOf(w, SOURCE.b, event)?.state, K3.state.open)
      assert.deepEqual([sentOn(w, SOURCE.a).length, sentOn(w, SOURCE.b).length], sentBefore, 'voiding sent an answer')
      assert.deepEqual(w.misrouted, [], 'voiding called a target')
    })
  }

  // ------------------------------------------------------------------ ST: voided is read-only and survives restart
  row(sdk, ID.st, '1 voided → answer refused → restart', 'a voided card: listed (read-only history), answer(handle) refused (expired) with nothing sent; after a restart it is still listed voided', async (t) => {
    const w = await worldFor(t, sdk, { sources: TWO })
    const event = twinAsk()
    await fileOn(w, SOURCE.a, event)
    w.retire(SOURCE.a)
    await w.voidWhere(removed(SOURCE.a))
    const handle = askHandle(SOURCE.a, event.payload.approvalId)
    const answered = await w.service.answer(handle, { choice: ANSWER.allow })
    assert.equal(answered.ok, false)
    // SEAM_TARGETS ask: "a voided card answers K1 expired (409), as a closed one does".
    assert.equal(answered.code, CODE.expired, json(answered))
    assert.equal(sentOn(w, SOURCE.a).length, 0)
    await w.restart()
    assert.equal(cardOf(w, SOURCE.a, event)?.state, K3.state.voided, 'the voided card was not kept as history')
  })

  // ------------------------------------------------------------------ the answer route by handle
  for (const [part, title, body, status, code] of [
    ['B by handle', 'POST {handle: B\'s, choice} → 200; only B\'s link answers', (e) => ({ [SEAM_TARGETS.ask.handleField]: askHandle(SOURCE.b, e.payload.approvalId), choice: ANSWER.reject }), ROUTE.status.ok, undefined],
    ['unknown handle', 'POST {handle: unknown} → 404 unknown-target; nothing sent', (e) => ({ [SEAM_TARGETS.ask.handleField]: askHandle(SOURCE.aNext, e.payload.approvalId), choice: ANSWER.reject }), ROUTE.status.notFound, CODE.unknownTarget],
  ]) {
    row(sdk, ID.route, part, title, async (t) => {
      const w = await worldFor(t, sdk, { sources: TWO })
      const event = twinAsk()
      await fileOn(w, SOURCE.a, event)
      await fileOn(w, SOURCE.b, event)
      const { routes, dispose } = routesFor(w)
      t.after(dispose)
      const response = await routes.get(ROUTE.answer).fetch(request(ROUTE.answer, ROUTE.post, body(event)))
      assert.equal(response.status, status)
      const answered = await response.json()
      if (code !== undefined) assert.deepEqual(answered, refused(code))
      assert.equal(sentOn(w, SOURCE.a).length, 0, 'A\'s link answered')
      assert.equal(sentOn(w, SOURCE.b).length, status === ROUTE.status.ok ? 1 : 0)
      if (status === ROUTE.status.ok) assert.equal(sentOn(w, SOURCE.b)[0].name, TOOL.approvalAnswer)
    })
  }
}
