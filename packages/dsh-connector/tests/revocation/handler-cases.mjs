/**
 * C-REVOKE step 2 black-box cases: the revocation module (`createRevocation(ports)`, relayed by the
 * dev session; subject.mjs revocationModuleWorld). Written from the requirements only (R-TOK-05,
 * R-TOK-09, R-OA-06, R-ID-09, R-ROUTE-04, R-ROUTE-06, R-WATCH-01, R-CON-05; design §5.3; test design
 * AUTH-UC-06, AUTH-DT-04, AUTH-UC-03 E1; K1 / K1d `mcp-schema/index.d.ts`; the C-REVOKE brief in
 * .runtime/reports/v3-w4-briefs.md and revoke-brief.md with its amendments 1–3). No file of
 * packages/dsh-connector/src/ was read.
 *
 * Level: the module over the REAL C-ROUTE routing and the REAL C-MAILBOX on real DSH storage of the
 * SDK under test (the step-1 world), with the C-ROUTE suite's fakes for tokens, pairs, presence,
 * settings and sessions, and recording fakes for closeEntry, SettingsWriter, SessionNotes, the card
 * port and the timers (fakes.mjs PortCalls, FakeTimers over the world's fake clock).
 *
 * ── Use Cases ────────────────────────────────────────────────────────────────────────────────
 * C-WIRE-2 re-baseline (the user: "不给ask_agent工具"; q5 "Remove agentToken entirely"; relayed
 * 2026-11-17: no `cards` port, routing.onLeft): the steps and rows about the ask, the designated role
 * and setDesignated are withdrawn (listed as skipped with the decision); the offers to the user are
 * observed through routing.onLeft. The text below is the original brief.
 * AUTH-UC-06 The user revokes P(E1), the designated principal, by disabling or deleting E1.
 *   Pre: P manages S1 (pending permission O1, an acked question) and S2 (a pending plan-review);
 *   P's box holds a `message` and a `turn-finished`, and an `ask` from unmanaged S3 whose asker
 *   waits; Q manages S4 with its own pending offer.
 *   Main (disable): 1. E1 is switched off (onRevoked disabled); 2. (C-OAUTH: 401 / invalid_client,
 *   its own suite); 3. P's listen streams close (closeEntry); P's box is held BEFORE management
 *   ends; O1, the question and the plan-review are withdrawn (a `retirement` each) and each goes
 *   to the user's card in its session; 4. S1 and S2 become unmanaged, each with exactly one English
 *   `system` note that starts no turn; 5. every other queued event, the ask included, is kept and
 *   the asker keeps waiting (no timer); 6. E1 stays designated (no writer call): a new ask_agent
 *   from an unmanaged session answers `unavailable` at once and message_agent queues; 7. E1 is
 *   switched on again (a settings change) → the same pair, the box released, the kept events
 *   pollable with the same eventIds.
 *   A1 (delete): steps 3–4 hold; the `revoked` retirements run before the drop and no fresh one is
 *   committed; the box is dropped; the waiting ask answers `unavailable`; the pair is removed;
 *   `routing.agentToken` is unset through the SettingsWriter (only because E1 was designated).
 *   A4 (30 days disabled): the kept events are dropped as on delete and the asker gets `unavailable`.
 *   E1: an answer already in flight when the revocation lands completes; its offer is not retired.
 *   Post: after a disable E1 stays bound (R-ID-09).
 * AUTH-UC-03 E1 (revocation part): an entry disabled between a token's expiry and the
 *   re-authentication keeps its pair, name and (held) mailbox; re-enabling restores them.
 *
 * ── Techniques ───────────────────────────────────────────────────────────────────────────────
 * EP   REV-EP-06 the revoked entry (paired / never paired / paired with nothing: the succession
 *      delete), REV-EP-07 the module's constants (note text, timing), REV-EP-08 a deleted principal's
 *      asks (waiting in the box / acked / none) and an acked ask at expiry (amendment 3).
 * BVA  REV-BVA-02 the hold's end at since + MAILBOX.disabledRetentionMs − 1 / exactly (at start and
 *      on the sweep timer), the sweep delay (≤ 2³¹−1), the retry delay retryMs − 1 / retryMs,
 *      ended sessions 0 / 1 (2: the UC rows).
 * DT   REV-DT-03 kind × paired × designated (this / another / none) → the port calls;
 *      AUTH-DT-04 rules 1–9 and 11 × kind (2a/2b: the service half; 10: C-OAUTH's suite);
 *      REV-DT-04 which step rejects (hold, endPrincipal, drop, remove, setDesignated, release, a
 *      note, a card) → logged, retried after retryMs from that step only, or not retried.
 * ST   REV-ST-04 the per-entry job chain (disable then delete; two entries overlap; a re-enable
 *      waits for the job), REV-ST-05 the box (Pending / Held / Released / Dropped), REV-ST-06 the
 *      module (start: remembered holds, amendment 1's release, expireHolds once, one sweep timer;
 *      close: subscriptions, timers, retries, running jobs); HAND-ST-01 row 6, PLAT-ST-01 row 6.
 * Also the rows other suites left `todo` for C-REVOKE: WATCH-UC-02 A2 note, HAND-ST-01 6 note,
 * HAND-UC-03 E1 (service part), PLAT-ST-01 6, NAME-EP-02 9 (revocation), and the mailbox's
 * EVT-ST-01 6a trigger / 6c (AUTH-DT-04 rules 3 and 8 here).
 *
 * Oracles common to every row: the module's log lines name no entry key, principal key, label or
 * token value (it logs codes only); a "logged" failure is a warn or error line.
 * The note "starts no turn": the module reaches a session only through K1d SessionNotes.system,
 * whose contract is a non-waking transcript entry; the rows check that the note goes there, once,
 * and that the session produces nothing for anyone. The transcript itself is C-WIRE's binding.
 * Not here: a partly failed endPrincipal leaves its earlier sessions without a note (amendment 1,
 * a known limit); a `session_start` racing a disable (user Q4, "as it is").
 */
import assert from 'node:assert/strict'
import { httpWorld } from '../mcp-http/subject.mjs'
import { listener } from '../mcp-http/cases.mjs'
import {
  ackOffer, counting, expectOne, manage, messageTo, offerTo, pendingOf, quiet, settlementOf, settlesWithin,
  unwatched, until,
} from '../routing/cases.mjs'
import {
  NO_ASK, assertDroppedEmpty, assertNotLive, assertRetiredBeforeDrop, assertRetiredIn, journalOf, listed,
  retirementsNaming, row, withdrawnRow,
} from './cases.mjs'
import {
  CASE, EVENT_TYPE, FIXTURE, HANDLER_FIXTURE, HANDLER_WAIT, LATER, LOGGED_LEVELS, MAILBOX, NOTE_RULE, OP, PHASE, PORT, REFUSAL, RELAYED_TIMING,
  REVOCATION, TIMER, WAIT,
} from './constants.mjs'

/** C-WIRE-2 (the user's q5, "Remove agentToken entirely"): no designated agent, so no designated role to keep or clear. */
const NO_DESIGNATED = 'withdrawn by C-WIRE-2: the user (q5) "Remove agentToken entirely" — no designated role, no setDesignated, no no-recipient queue (第三版其实就是第一版)'
/** C-WIRE-2 (relayed 2026-11-17): the `cards` port is gone; routing hands retired offers to the user itself (routing.onLeft). */
const NO_CARD_PORT = 'withdrawn by C-WIRE-2: createRevocation takes no cards port; routing.onLeft hands the offers to the user (routing suite ROUTE-ST-06)'
import { revocationModuleWorld } from './subject.mjs'

const { ids: ID, sessions: S } = FIXTURE
const X = HANDLER_FIXTURE.sessions
const ET = EVENT_TYPE
const E = FIXTURE.entry
const R = MAILBOX.disabledRetentionMs

// ------------------------------------------------------------------------------------------------
// Row registration

/** A row on a fresh step-2 world (the module created and started unless `opts` says otherwise). */
const moduleRow = (sdk, id, part, title, fn, opts) => row(sdk, id, part, title, async (t) => {
  const w = await revocationModuleWorld(t, sdk, opts)
  await fn(w, t)
  assertLogsClean(w)
})
const todoRow = (sdk, id, part, title, owner) => row(sdk, id, part, title, null, owner)

// ------------------------------------------------------------------------------------------------
// Driving the module

const turn = () => new Promise((resolve) => { setImmediate(resolve) })
/**
 * Waits until the module's port calls have settled: none in flight, and the journal unchanged for
 * HANDLER_WAIT.stableTurns event-loop turns (the module's own steps between port calls are short).
 */
async function drain(w) {
  const end = Date.now() + WAIT.eventMs
  let seen = -1
  let stable = 0
  while (stable < HANDLER_WAIT.stableTurns) {
    await turn()
    const n = w.calls.entries.length
    if (w.calls.unsettled() === 0 && n === seen) stable += 1
    else { stable = 0; seen = n }
    assert.ok(Date.now() < end, `the revocation module did not settle within ${WAIT.eventMs} ms`)
  }
}
/**
 * The user switches entry `id` off: C-TOKENS fires onRevoked(disabled). P's box is then held, so
 * it leaves the world's observed keys (a held box refuses poll) until it is released.
 */
async function disable(w, id) {
  w.keys.delete(FIXTURE.principal(id))
  w.tokens.disable(id)
  await drain(w)
}
/** The user deletes entry `id`: onRevoked(deleted). The dropped box leaves the observed keys. */
async function remove(w, id) {
  w.keys.delete(FIXTURE.principal(id))
  w.tokens.remove(id)
  await drain(w)
}
/**
 * The user switches entry `id` on again: the native settings save makes it enabled (C-TOKENS fires
 * no event for it), and the settings onChange the module listens to fires.
 */
function switchOn(w, id) {
  w.tokens.add(id)
  w.settings.set({})
}
async function reenable(w, id) {
  switchOn(w, id)
  await drain(w)
  w.keys.add(FIXTURE.principal(id))
}
/** Moves the fake clock by `ms`, firing the module's timers due on the way (each followed by a drain). */
const advance = (w, ms) => w.timers.advance(ms, () => drain(w))
/** Moves the clock to `instant` without firing anything, then fires every timer now due (an overdue timer fires once, late). */
async function jumpTo(w, instant) {
  w.clock.advance(instant - w.clock.now())
  await advance(w, 0)
}

// ------------------------------------------------------------------------------------------------
// Reading the journal

const callsOf = (w, label, first) => w.calls.of(label, PHASE.call, first)
const doneOf = (w, label, first) => w.calls.of(label, PHASE.done, first)
const argsOf = (w, label, first) => callsOf(w, label, first).map((c) => c.args)
const at = (w, label, phase, first, nth) => w.calls.indexOf(label, phase, first, nth)
/** The one resolved endPrincipal of entry `e` (nth, default the first) and its answer. */
function endedBy(w, e, nth = 0) {
  const done = doneOf(w, PORT.endPrincipal, e)
  assert.ok(done.length > nth, `endPrincipal(${e}) did not resolve`)
  return done[nth].result
}
const byOffer = (a, b) => a.offerId.localeCompare(b.offerId)
const offerFields = (o) => ({ offerId: o.offerId, sessionId: o.sessionId, type: o.type })
/** The offers handed to the user (routing.onLeft, journaled as PORT.card), as `{offerId, sessionId, type}`, sorted. */
const cards = (w) => callsOf(w, PORT.card).map((c) => offerFields(c.args[0])).sort(byOffer)
/** The system notes, as `[sessionId, note]`, sorted by session. */
const notes = (w) => argsOf(w, PORT.note).map(([sessionId, note]) => [sessionId, note]).sort((a, b) => a[0].localeCompare(b[0]))

/** Exactly one note per session of `sessions`, each the module's REVOCATION_NOTE.text, and no other. */
function assertNotes(w, sessions) {
  assert.deepEqual(notes(w), [...sessions].sort().map((s) => [s, w.NOTE.text]), 'not exactly one system note per ended session')
}
/** Exactly one card per offer event of `offers` (`{offerId, sessionId, type}`), and they are endPrincipal's offers. */
function assertCards(w, e, offers) {
  const want = offers.map(listed).sort(byOffer)
  assert.deepEqual(cards(w), want, 'not exactly one card per retired offer')
  assert.deepEqual([...endedBy(w, e).offers].map(offerFields).sort(byOffer), want)
}
/** `key`'s box is held: poll is refused `forbidden` (K1 Mailbox.hold "not pollable"). */
async function assertHeld(w, key) {
  assert.deepEqual(await w.realMailbox.poll(key, undefined, MAILBOX.pageMax), { ok: false, code: REFUSAL.forbidden }, 'the box is not held')
}
/** `key`'s box is pollable and holds every event of `events` with its eventId. */
async function assertPollable(w, key, events) {
  const ids = new Set((await pendingOf(w, key)).map((e) => e.eventId))
  for (const e of events) assert.ok(ids.has(e.eventId), `the ${e.type} event ${e.eventId} is not pollable again`)
}
/** No log line names a key, label or token value of any fixture principal (the module logs codes only). */
function assertLogsClean(w) {
  const secrets = Object.values(ID).flatMap((id) => [E(id), FIXTURE.principal(id), FIXTURE.label(id), FIXTURE.tokenValue(id)])
  for (const line of w.revLogger.lines) {
    for (const secret of secrets) assert.ok(!line.text.includes(secret), `a log line names ${secret}`)
  }
}
const logged = (w) => w.revLogger.lines.filter((l) => LOGGED_LEVELS.includes(l.level))
/** The only pending timer is the one sweep, armed for REVOCATION_TIMING.expirySweepMs. */
function assertOnlySweep(w) {
  assert.deepEqual(w.timers.pending().map((x) => x.delay), [w.TIMING.expirySweepMs], 'a timer other than the one expiry sweep is armed')
}
// ------------------------------------------------------------------------------------------------
// Worlds

/**
 * AUTH-UC-06's world: P manages S1 (pending permission, acked question) and S2 (pending
 * plan-review); P's box holds a turn-finished and a message of S1; Q manages S4 with a pending
 * permission. Returns the keys and events. (C-WIRE-2: P is no designated agent and there is no ask,
 * so the message is a managed session's: the user's q5 and "不给ask_agent工具".)
 */
async function ucWorld(w) {
  const p = w.principal(ID.p, { connected: true })
  const q = w.principal(ID.q, { connected: true })
  for (const s of [S.s1, S.s2, X.s4]) w.session(s)
  await manage(w, S.s1, p)
  await manage(w, S.s2, p)
  await manage(w, X.s4, q)
  const permission = await offerTo(w, S.s1, ET.permission, p)
  const question = await offerTo(w, S.s1, ET.question, p)
  await ackOffer(w, p, question)
  const planReview = await offerTo(w, S.s2, ET.planReview, p)
  const qOffer = await offerTo(w, X.s4, ET.permission, q)
  const turnEvent = (await expectOne(w, () => w.sessions.finishTurn(S.s1), p, ET.turnFinished)).event
  const message = await messageTo(w, S.s1, p)
  return {
    p, q, e: E(ID.p), permission, question, planReview, qOffer,
    offers: [permission, question, planReview], sessions: [S.s1, S.s2], kept: [turnEvent, message],
  }
}
/**
 * AUTH-DT-04 rules 5–6: queues P a `handover` and a `takeback` (S5 handed over to P and
 * taken back), a `settlement` (an S2 offer settled by the user) and a `retirement` (an S2 offer withdrawn).
 * Returns those events and the settled offer's own event (K1: it stays pending).
 * Re-baselined by CONN-REPORT A1/A3 (user-approved 2026-11-21): no `state` event is produced any
 * more, and the settlement is the user's (a principal's is no longer produced).
 */
async function queueEveryType(w, x) {
  w.session(X.s5)
  const one = async (act, type) => (await expectOne(w, act, x.p, type)).event
  const handover = await one(() => w.handover.handOver(X.s5, x.p, FIXTURE.note), ET.handover)
  const takeback = await one(() => w.handover.takeBack(X.s5, FIXTURE.note), ET.takeback)
  const settled = await offerTo(w, S.s2, ET.permission, x.p)
  const settlement = await one(() => w.routing.settle(settled.offer.offerId, settlementOf(settled.payload.approvalId)), ET.settlement)
  const withdrawn = await offerTo(w, S.s2, ET.question, x.p)
  const retirement = await one(() => w.routing.withdraw(withdrawn.offer.offerId), ET.retirement)
  return [handover, takeback, settlement, retirement, settled]
}
/** Q is untouched: S4 still Q's, Q's offer pending in Q's box, no note for S4, no card for Q's offer. */
async function assertQUntouched(w, x) {
  assert.equal(w.managed.managerOf(X.s4), x.q, 'another principal\'s session was ended')
  assert.ok((await pendingOf(w, x.q)).some((e) => e.eventId === x.qOffer.eventId), 'Q\'s offer left Q\'s box')
  assert.ok(!notes(w).some(([s]) => s === X.s4), 'Q\'s session got a note')
  assert.ok(!cards(w).some((c) => c.offerId === x.qOffer.offer.offerId), 'Q\'s offer went to the user')
}
/** The disable's port calls: closeEntry, then hold(P, now) resolved before endPrincipal(E, fresh: true); nothing of a delete. */
function assertDisableCalls(w, x, heldAt) {
  assert.deepEqual(argsOf(w, PORT.closeEntry), [[x.e]], 'the entry\'s streams were not closed exactly once')
  assert.deepEqual(argsOf(w, PORT.hold), [[x.p, heldAt]], 'the box was not held once at the disable instant')
  const ends = callsOf(w, PORT.endPrincipal)
  assert.deepEqual(ends.map((c) => [c.args[0], c.args[1]?.freshRetirements]), [[x.e, true]], 'not one endPrincipal(E, {freshRetirements: true})')
  assert.ok(at(w, PORT.closeEntry, PHASE.call, x.e) < at(w, PORT.endPrincipal, PHASE.call, x.e), 'the streams closed after management ended')
  assert.ok(at(w, PORT.hold, PHASE.done, x.p) < at(w, PORT.endPrincipal, PHASE.call, x.e), 'endPrincipal ran before the box was held')
  for (const label of [PORT.drop, PORT.remove, PORT.release]) assert.deepEqual(argsOf(w, label), [], `a disable called ${label}`)
}
/**
 * The delete's port calls, in order: closeEntry; endPrincipal(E, fresh: false); only after it
 * resolved, drop(P); then pairs.remove(E). No hold, no release, no fresh retirement. (C-WIRE-2: no
 * askDropped and no setDesignated: "不给ask_agent工具"; q5.)
 */
function assertDeleteCalls(w, x) {
  assert.deepEqual(argsOf(w, PORT.closeEntry), [[x.e]])
  const ends = callsOf(w, PORT.endPrincipal)
  assert.deepEqual(ends.map((c) => [c.args[0], c.args[1]?.freshRetirements]), [[x.e, false]], 'not one endPrincipal(E, {freshRetirements: false})')
  assert.deepEqual(argsOf(w, PORT.drop), [[x.p]])
  assert.ok(at(w, PORT.drop, PHASE.call, x.p) > at(w, PORT.endPrincipal, PHASE.done, x.e), 'the drop started before endPrincipal resolved')
  assertRetiredBeforeDrop(w)
  assert.deepEqual(journalOf(w, OP.freshRetirement), [], 'a fresh retirement was committed on a delete')
  assert.deepEqual(argsOf(w, PORT.remove), [[x.e]], 'the pair was not removed once')
  assert.ok(at(w, PORT.remove, PHASE.call, x.e) > at(w, PORT.drop, PHASE.done, x.p), 'the pair was removed before the drop')
  for (const label of [PORT.hold, PORT.release]) assert.deepEqual(argsOf(w, label), [], `a delete called ${label}`)
}
/** The journal index of the last step of entry `e`'s first job: its first endPrincipal's resolution, or a later note or card. */
function jobEnd(w, e) {
  const settled = [...w.calls.of(PORT.note, PHASE.done), ...w.calls.of(PORT.note, PHASE.failed), ...w.calls.of(PORT.card, PHASE.done), ...w.calls.of(PORT.card, PHASE.failed)]
  return Math.max(at(w, PORT.endPrincipal, PHASE.done, e), ...settled.map((x) => w.calls.entries.indexOf(x)))
}

// ================================================================================================
// Use Cases
// ================================================================================================

function useCases(sdk) {
  // Re-baselined by C-WIRE-2: no waiting ask ("不给ask_agent工具") and no designated role (q5); offers reach the user through routing.onLeft.
  moduleRow(sdk, CASE.authUc06, 'main', 'disable: streams closed; box held before management ends; offers retired and to the user; S1, S2 unmanaged with one note each; kept events; re-enable → same pair, events pollable', async (w) => {
    const x = await ucWorld(w)
    const heldAt = w.clock.now()
    await disable(w, ID.p)
    // Step 3.
    assertDisableCalls(w, x, heldAt)
    assertCards(w, x.e, x.offers)
    for (const offer of x.offers) await assertNotLive(w, offer)
    // Step 4.
    assert.deepEqual([w.managed.managerOf(S.s1), w.managed.managerOf(S.s2)], [undefined, undefined])
    assertNotes(w, x.sessions)
    await unwatched(w, S.s1)
    await assertQUntouched(w, x)
    // Step 5.
    await assertHeld(w, x.p)
    // Step 6 (the designated role) is withdrawn by C-WIRE-2 (q5).
    // Step 7.
    await reenable(w, ID.p)
    assert.deepEqual(argsOf(w, PORT.release), [[x.p]])
    assert.equal(w.pairs.pairOf(x.e)?.principalKey, x.p, 'the re-enabled entry is not the same principal')
    await assertPollable(w, x.p, x.kept)
    const events = await pendingOf(w, x.p)
    for (const offer of [x.permission, x.planReview]) assertRetiredIn(events, offer)
    assert.equal(retirementsNaming(events, x.question.eventId).length, 1, 'the acked offer got no fresh retirement')
  })
  moduleRow(sdk, CASE.authUc06, 'A1', 'delete: retirements before the drop, none fresh; the box dropped; the pair removed; nothing else cleared (q5); one note per session; offers to the user', async (w) => {
    const x = await ucWorld(w)
    await remove(w, ID.p)
    assertDeleteCalls(w, x)
    assertNotes(w, x.sessions)
    assertCards(w, x.e, x.offers)
    assert.equal(w.pairs.pairOf(x.e), undefined, 'the deleted entry is still paired')
    await assertDroppedEmpty(w, x.p)
    await assertQUntouched(w, x)
  })
  moduleRow(sdk, CASE.authUc06, 'A4', 'disabled for MAILBOX.disabledRetentionMs → the kept events are dropped; the pair stays; re-enable → an empty box', async (w) => {
    const x = await ucWorld(w)
    const heldAt = w.clock.now()
    await disable(w, ID.p)
    await jumpTo(w, heldAt + R + HANDLER_FIXTURE.pastHoldMs)
    assert.deepEqual(argsOf(w, PORT.remove), [], 'the expiry removed the pair')
    await reenable(w, ID.p)
    assert.equal(w.pairs.pairOf(x.e)?.principalKey, x.p)
    assert.deepEqual(await pendingOf(w, x.p), [], 'the expired hold kept events')
  })
  // CONN-REPORT A3 (user-approved 2026-11-21): the in-flight answer is the user's (settlementOf), whose settlement is still produced.
  moduleRow(sdk, CASE.authUc06, 'E1', 'an approval answer in flight when the disable lands completes (settle true, its settlement kept); its offer is neither retired nor sent to the user', async (w) => {
    const x = await ucWorld(w)
    const answer = settlementOf(x.permission.payload.approvalId)
    const answering = w.routing.settle(x.permission.offer.offerId, answer)
    w.keys.delete(x.p)
    w.tokens.disable(ID.p)
    assert.equal(await answering, true, 'the in-flight answer was refused')
    await drain(w)
    assertCards(w, x.e, [x.question, x.planReview])
    await reenable(w, ID.p)
    const events = await pendingOf(w, x.p)
    assert.deepEqual(events.filter((e) => e.type === ET.settlement && e.correlationId === x.permission.offer.offerId).map((e) => e.payload), [answer])
    assert.deepEqual(retirementsNaming(events, x.permission.eventId), [], 'the answered offer was retired')
  })
  todoRow(sdk, CASE.authUc06, 'main step 2 (MCP)', 'the next MCP request with any access token of E1 gets 401 on the real endpoint', LATER.wire401)
  row(sdk, CASE.authUc06, 'main step 3 (real stream)', 'the module\'s closeEntry, bound to the real C-HTTP route, closes P\'s open listen stream; Q\'s stays open', async (t) => {
    const http = await httpWorld(t, sdk)
    // C-WIRE binds closeEntry to C-HTTP's route; the http world exposes it through its own fake
    // registry's onRevoked wiring, so the port forwards the module's call there.
    const w = await revocationModuleWorld(t, sdk, { closeEntry: (entryKey) => http.tokens.revoke(entryKey, REVOCATION.disabled, FIXTURE.generation + 1) })
    const [p, q] = [await listener(http, ID.p), await listener(http, ID.q)]
    w.principal(ID.p, { connected: true })
    w.principal(ID.q, { connected: true })
    await disable(w, ID.p)
    assert.ok(await settlesWithin(p.subscription.closed, WAIT.eventMs), 'P\'s listen stream stayed open')
    assert.equal(await settlesWithin(q.subscription.closed, WAIT.quietMs), false, 'Q\'s listen stream closed')
    assertLogsClean(w)
  })
  moduleRow(sdk, CASE.authUc03, 'E1 (revocation part)', 'E1 disabled between expiry and re-auth → its pair, id and name stay and its box is held, not dropped; re-enabled → the same principal and its events', async (w) => {
    const p = w.principal(ID.p, { connected: true, name: FIXTURE.names.p })
    w.session(S.s1)
    await manage(w, S.s1, p)
    const queued = (await expectOne(w, () => w.sessions.finishTurn(S.s1), p, ET.turnFinished)).event
    const pair = w.pairs.pairOf(E(ID.p))
    await disable(w, ID.p)
    assert.deepEqual(w.pairs.pairOf(E(ID.p)), pair, 'the disable changed the pair')
    await assertHeld(w, p)
    assert.deepEqual([argsOf(w, PORT.drop), argsOf(w, PORT.remove)], [[], []])
    await reenable(w, ID.p)
    assert.deepEqual(w.pairs.pairOf(E(ID.p)), pair)
    await assertPollable(w, p, [queued])
  })
}

// ================================================================================================
// Equivalence Partitioning
// ================================================================================================

function equivalencePartitions(sdk) {
  // REV-EP-06 — the revoked entry.
  moduleRow(sdk, CASE.ep06, 'never paired deleted', 'a deleted entry that was never paired (the succession\'s old hosted entry with no pair) → streams closed, endPrincipal finds nothing; no hold, drop, note or card', async (w) => {
    w.principal(ID.x, { paired: false })
    await remove(w, ID.x)
    assert.deepEqual(argsOf(w, PORT.closeEntry), [[E(ID.x)]])
    assert.deepEqual(argsOf(w, PORT.endPrincipal).map(([e, o]) => [e, o?.freshRetirements]), [[E(ID.x), false]])
    for (const label of [PORT.hold, PORT.drop, PORT.note, PORT.card]) assert.deepEqual(argsOf(w, label), [], `${label} was called`)
  })
  moduleRow(sdk, CASE.ep06, 'paired, nothing held, deleted', 'a deleted paired entry with no session, no offer and an empty box (as after a succession) → no note, no card; the pair is removed', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    await remove(w, ID.p)
    for (const label of [PORT.note, PORT.card]) assert.deepEqual(argsOf(w, label), [], `${label} was called`)
    assert.deepEqual(argsOf(w, PORT.remove), [[E(ID.p)]])
    await assertDroppedEmpty(w, p)
  })
  moduleRow(sdk, CASE.ep06, 'never paired disabled', 'a disabled entry that was never paired → streams closed, endPrincipal(fresh: true) finds nothing; no hold, no note, no card', async (w) => {
    w.principal(ID.x, { paired: false })
    await disable(w, ID.x)
    assert.deepEqual(argsOf(w, PORT.closeEntry), [[E(ID.x)]])
    assert.deepEqual(argsOf(w, PORT.endPrincipal).map(([e, o]) => [e, o?.freshRetirements]), [[E(ID.x), true]])
    for (const label of [PORT.hold, PORT.note, PORT.card]) assert.deepEqual(argsOf(w, label), [], `${label} was called`)
  })

  // REV-EP-07 — the module's exported constants.
  moduleRow(sdk, CASE.ep07, 'note', 'REVOCATION_NOTE.text is non-empty English (model-facing, Q7) and names no key, label or value; every note carries exactly it', async (w) => {
    const text = w.NOTE.text
    assert.equal(typeof text, 'string')
    assert.ok(text.trim().length > 0, 'an empty note')
    assert.match(text, NOTE_RULE.latin)
    assert.doesNotMatch(text, NOTE_RULE.cjk, 'the note is not English only')
    const x = await ucWorld(w)
    await disable(w, ID.p)
    for (const secret of [x.e, x.p, FIXTURE.label(ID.p), FIXTURE.tokenValue(ID.p)]) assert.ok(!text.includes(secret), `the note names ${secret}`)
    assertNotes(w, x.sessions)
  })
  moduleRow(sdk, CASE.ep07, 'timing', `REVOCATION_TIMING is the relayed ${RELAYED_TIMING.expirySweepMs} ms sweep and ${RELAYED_TIMING.retryMs} ms retry, each one setTimeout-safe delay`, async (w) => {
    assert.deepEqual({ expirySweepMs: w.TIMING.expirySweepMs, retryMs: w.TIMING.retryMs }, RELAYED_TIMING)
    for (const ms of Object.values(RELAYED_TIMING)) assert.ok(ms > 0 && ms <= TIMER.maxDelayMs)
  })

  // REV-EP-08 — a deleted principal's asks. Withdrawn by C-WIRE-2 (NO_ASK).
  for (const name of ['waiting', 'acked', 'waiting and acked', 'none']) withdrawnRow(sdk, CASE.ep08, `delete ${name}`, `delete with ${name} asks → askDropped for each`, NO_ASK)
  withdrawnRow(sdk, CASE.ep08, 'acked ask at expiry', 'disabled with an acked and a waiting ask → the hold ends: only the waiting ask answers unavailable', NO_ASK)
}

// ================================================================================================
// Boundary Values
// ================================================================================================

/**
 * P manages S1 with one queued turn-finished; P is disabled; returns `{p, heldAt}`. (C-WIRE-2: the
 * held box's ask became a turn-finished, "不给ask_agent工具"; a drop is now seen in the box itself.)
 */
async function heldWithEvent(w) {
  const p = w.principal(ID.p, { connected: true })
  w.session(S.s1)
  await manage(w, S.s1, p)
  await expectOne(w, () => w.sessions.finishTurn(S.s1), p, ET.turnFinished)
  const heldAt = w.clock.now()
  await disable(w, ID.p)
  return { p, heldAt }
}
/** The held box still holds its event (not dropped). */
async function assertKept(w, key) {
  await assertHeld(w, key)
  assert.ok((await w.realMailbox.summary(key)).pending > 0, 'the held box was dropped before the hold ended')
}

function boundaryValues(sdk) {
  // REV-BVA-02 — the end of the hold, at start (expireHolds(now()) once).
  moduleRow(sdk, CASE.bva02, 'start at since + retention − 1', 'the module restarts 1 ms before the hold ends → expireHolds(that instant) drops nothing: the box still held with its event', async (w) => {
    const x = await heldWithEvent(w)
    w.clock.advance(x.heldAt + R - 1 - w.clock.now())
    await w.restartRevocation()
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.expireHolds).at(-1), [x.heldAt + R - 1])
    await assertKept(w, x.p)
  })
  moduleRow(sdk, CASE.bva02, 'start at since + retention', 'the module restarts exactly when the hold ends → expireHolds drops the box: nothing pending', async (w) => {
    const x = await heldWithEvent(w)
    w.clock.advance(x.heldAt + R - w.clock.now())
    await w.restartRevocation()
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.expireHolds).at(-1), [x.heldAt + R])
    await assertDroppedEmpty(w, x.p)
  })
  // On the sweep timer: a sweep due exactly at the end of the hold. Every delay the module arms is
  // setTimeout-safe (FakeTimers fires a longer one at once, as Node does).
  moduleRow(sdk, CASE.bva02, 'sweep at since + retention − 1 and at it', 'a sweep re-armed every expirySweepMs: nothing drops while the clock is 1 ms short of the hold\'s end; the sweep at the end drops it; every delay ≤ 2^31−1 and only one sweep is armed', async (w) => {
    const x = await heldWithEvent(w)
    const end = x.heldAt + R
    await jumpTo(w, end - w.TIMING.expirySweepMs)
    assertOnlySweep(w)
    await advance(w, w.TIMING.expirySweepMs - 1)
    await assertKept(w, x.p)
    await advance(w, 1)
    assert.deepEqual(argsOf(w, PORT.expireHolds).at(-1), [end])
    await assertDroppedEmpty(w, x.p)
    assertOnlySweep(w)
    assert.ok(w.timers.delays.every((ms) => ms <= TIMER.maxDelayMs), `a delay above ${TIMER.maxDelayMs} ms: ${w.timers.delays}`)
  })
  moduleRow(sdk, CASE.bva02, 'sweep re-arm', 'start runs expireHolds(now) once and arms one sweep; each expirySweepMs later it runs expireHolds(now) again and re-arms one', async (w) => {
    const startedAt = w.clock.now()
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.expireHolds), [[startedAt]])
    assertOnlySweep(w)
    for (const n of [1, 2]) {
      await advance(w, w.TIMING.expirySweepMs)
      assert.deepEqual(argsOf(w, PORT.expireHolds).at(-1), [startedAt + n * w.TIMING.expirySweepMs])
      assert.equal(argsOf(w, PORT.expireHolds).length, n + 1)
      assertOnlySweep(w)
    }
  })
  // Ended sessions 0 and 1 (2: AUTH-UC-06).
  moduleRow(sdk, CASE.bva02, 'sessions 0', 'P manages nothing → disable: no note, no card', async (w) => {
    w.principal(ID.p, { connected: true })
    await disable(w, ID.p)
    assert.deepEqual([notes(w), cards(w)], [[], []])
  })
  moduleRow(sdk, CASE.bva02, 'sessions 1 offers 0', 'P manages S1 with no live offer → disable: one note in S1, no card', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await manage(w, S.s1, p)
    await disable(w, ID.p)
    assertNotes(w, [S.s1])
    assert.deepEqual(cards(w), [])
  })
}

// ================================================================================================
// Decision Tables
// ================================================================================================

/**
 * The retried steps of each job, in contract order (closeEntry, the first step of both, is checked
 * on its own: the contract does not order it against `hold`). C-WIRE-2: no askDropped and no
 * setDesignated in a delete ("不给ask_agent工具"; q5).
 */
const STEPS = Object.freeze({
  disable: Object.freeze([PORT.hold, PORT.endPrincipal]),
  delete: Object.freeze([PORT.endPrincipal, PORT.drop, PORT.remove]),
})
/** How many times each step of `steps` was called. */
const counts = (w, steps) => steps.map((label) => callsOf(w, label).length)

function decisionTables(sdk) {
  // REV-DT-03 — kind × paired → the module's port calls (one test per rule). Its "designated" column is
  // withdrawn by C-WIRE-2 (the user's q5): no rule calls the writer any more.
  for (const kind of [REVOCATION.disabled, REVOCATION.deleted]) {
    for (const paired of [true, false]) {
      const deleting = kind === REVOCATION.deleted
      moduleRow(sdk, CASE.dt03, `${kind} ${paired ? 'paired' : 'unpaired'} designated none`, `${kind}, ${paired ? 'paired' : 'never paired'} → closeEntry; endPrincipal(fresh: ${!deleting})${paired && !deleting ? '; hold first' : ''}${paired && deleting ? '; drop, remove' : ''}; no writer call`, async (w) => {
        const key = w.principal(ID.p, { connected: true, paired })
        w.session(S.s1)
        const offer = paired ? (await manage(w, S.s1, key), await offerTo(w, S.s1, ET.permission, key)) : undefined
        const heldAt = w.clock.now()
        if (deleting) await remove(w, ID.p)
        else await disable(w, ID.p)
        assert.deepEqual(argsOf(w, PORT.closeEntry), [[E(ID.p)]])
        assert.deepEqual(argsOf(w, PORT.endPrincipal).map(([e, o]) => [e, o?.freshRetirements]), [[E(ID.p), !deleting]])
        assert.deepEqual(argsOf(w, PORT.hold), paired && !deleting ? [[key, heldAt]] : [])
        assert.deepEqual(argsOf(w, PORT.drop), paired && deleting ? [[key]] : [])
        if (!deleting) assert.deepEqual(argsOf(w, PORT.remove), [])
        if (paired && deleting) assert.deepEqual(argsOf(w, PORT.remove), [[E(ID.p)]])
        assert.deepEqual([...argsOf(w, PORT.addToken), ...argsOf(w, PORT.removeToken)], [], 'a revocation called the SettingsWriter')
        assertNotes(w, paired ? [S.s1] : [])
        assert.deepEqual(cards(w), paired ? [listed(offer)] : [])
        assert.deepEqual(argsOf(w, PORT.release), [])
      })
      for (const designated of ['this entry', 'another entry']) withdrawnRow(sdk, CASE.dt03, `${kind} ${paired ? 'paired' : 'unpaired'} designated ${designated}`, `${kind}, designated ${designated}`, NO_DESIGNATED)
    }
  }

  // AUTH-DT-04 — revocation effect by item kind (rules 1–9, 11; 10 and the HTTP halves of 2a/2b: C-OAUTH / C-HTTP).
  const dt = (rule, kind, title, fn) => moduleRow(sdk, CASE.authDt04, `${rule} ${kind}`, title, fn)
  const revoke = (w, kind) => (kind === REVOCATION.deleted ? remove(w, ID.p) : disable(w, ID.p))
  for (const kind of [REVOCATION.disabled, REVOCATION.deleted]) {
    const deleting = kind === REVOCATION.deleted
    dt('1', kind, `${kind}: the open listen streams close at once (closeEntry, before management ends)`, async (w) => {
      const x = await ucWorld(w)
      await revoke(w, kind)
      assert.deepEqual(argsOf(w, PORT.closeEntry), [[x.e]])
      assert.ok(at(w, PORT.closeEntry, PHASE.call, x.e) < at(w, PORT.endPrincipal, PHASE.call, x.e))
    })
    dt('2b (service)', kind, `${kind}: an answer to a retired offer after the revocation is refused (settle false, nothing committed)`, async (w) => {
      const x = await ucWorld(w)
      await revoke(w, kind)
      for (const offer of x.offers) await assertNotLive(w, offer)
    })
    dt('3', kind, `${kind}: each live offer is withdrawn (a revoked retirement) and handed to the user's card once; no timer is armed for it`, async (w) => {
      const x = await ucWorld(w)
      await revoke(w, kind)
      assertCards(w, x.e, x.offers)
      assertOnlySweep(w)
      if (deleting) assertRetiredBeforeDrop(w)
      else {
        await reenable(w, ID.p)
        for (const offer of [x.permission, x.planReview]) assertRetiredIn(await pendingOf(w, x.p), offer)
      }
      await advance(w, FIXTURE.longWaitMs)
      assert.equal(cards(w).length, x.offers.length, 'an offer went to the user twice')
    })
    dt('4', kind, `${kind}: each managed session becomes unmanaged with exactly one system note; it then produces nothing`, async (w) => {
      const x = await ucWorld(w)
      const handover = counting(w.handover)
      await revoke(w, kind)
      assert.deepEqual(w.handover.managed().map((m) => m.sessionId).sort(), [X.s4])
      assert.ok(handover.n >= 1, 'the hand-over service did not report the change')
      assertNotes(w, x.sessions)
      for (const s of x.sessions) await unwatched(w, s)
    })
    dt('5–6', kind, `${kind}: queued message, turn-finished, handover, takeback, settlement and retirement are ${deleting ? 'dropped' : 'kept, pollable on re-enable with their eventIds'}`, async (w) => {
      const x = await ucWorld(w)
      const queued = [...x.kept, ...await queueEveryType(w, x)]
      await revoke(w, kind)
      if (deleting) return assertDroppedEmpty(w, x.p)
      await reenable(w, ID.p)
      await assertPollable(w, x.p, queued)
    })
    withdrawnRow(sdk, CASE.authDt04, `7 ${kind}`, `${kind}: the queued ask is ${deleting ? 'dropped and its asker answers unavailable' : 'kept, its asker waits'}`, NO_ASK)
    withdrawnRow(sdk, CASE.authDt04, `9 ${kind}`, `${kind}: the designated role is ${deleting ? 'cleared' : 'kept'}`, NO_DESIGNATED)
  }
  dt('2a (service)', REVOCATION.deleted, 'deleted: an answer in flight when the delete lands completes (settle true); its offer goes to no card', async (w) => {
    const x = await ucWorld(w)
    const answering = w.routing.settle(x.permission.offer.offerId, settlementOf(x.permission.payload.approvalId))
    w.keys.delete(x.p)
    w.tokens.remove(ID.p)
    assert.equal(await answering, true)
    await drain(w)
    assertCards(w, x.e, [x.question, x.planReview])
  })
  dt('8', REVOCATION.disabled, 'disabled for 30 days: the kept events are dropped as on delete', async (w) => {
    const x = await ucWorld(w)
    const heldAt = w.clock.now()
    await disable(w, ID.p)
    await jumpTo(w, heldAt + R + HANDLER_FIXTURE.pastHoldMs)
    await reenable(w, ID.p)
    assert.deepEqual(await pendingOf(w, x.p), [])
  })
  dt('11', REVOCATION.disabled, 're-enabled: the same pair; the box released once; the kept events pollable with their eventIds', async (w) => {
    const x = await ucWorld(w)
    await disable(w, ID.p)
    await reenable(w, ID.p)
    assert.deepEqual(argsOf(w, PORT.release), [[x.p]])
    assert.equal(w.pairs.pairOf(x.e)?.principalKey, x.p)
    await assertPollable(w, x.p, x.kept)
  })
  dt('11', REVOCATION.deleted, 'deleted: re-enabling is not possible: the pair is gone, and a later settings change releases nothing', async (w) => {
    const x = await ucWorld(w)
    await remove(w, ID.p)
    w.settings.set({})
    await drain(w)
    assert.equal(w.pairs.pairOf(x.e), undefined)
    assert.deepEqual(argsOf(w, PORT.release), [])
  })

  // REV-DT-04 — a step rejects → logged, retried after retryMs from that step only; earlier steps
  // are not repeated (no note twice) and later steps wait for it.
  for (const [kind, steps] of [[REVOCATION.disabled, STEPS.disable], [REVOCATION.deleted, STEPS.delete]]) {
    for (const failing of steps) {
      const k = steps.indexOf(failing)
      moduleRow(sdk, CASE.dt04, `${kind} ${failing}`, `${kind}, ${failing} rejects once → logged; nothing later runs and nothing earlier repeats; at retryMs − 1 still waiting; at retryMs ${failing} again, then the rest once; one note per session`, async (w) => {
        const x = await ucWorld(w)
        w.calls.failNext(failing)
        await revoke(w, kind)
        const before = steps.map((_, i) => (i <= k ? 1 : 0))
        assert.deepEqual(counts(w, steps), before, 'the steps around the failed one')
        assert.ok(logged(w).length >= 1, 'the rejection was not logged')
        await advance(w, w.TIMING.retryMs - 1)
        assert.deepEqual(counts(w, steps), before, 'retried before retryMs')
        await advance(w, 1)
        assert.deepEqual(counts(w, steps), steps.map((_, i) => (i === k ? 2 : 1)), 'not retried from the failed step only')
        assert.deepEqual(argsOf(w, PORT.closeEntry), [[x.e]], 'the streams were closed again on the retry')
        assertNotes(w, x.sessions)
      })
    }
  }
  moduleRow(sdk, CASE.dt04, 'deleted endPrincipal twice', 'delete, endPrincipal rejects twice → no drop after the first retry; the drop runs only after the second retry resolved', async (w) => {
    const x = await ucWorld(w)
    w.calls.failNext(PORT.endPrincipal, 2)
    await remove(w, ID.p)
    await advance(w, w.TIMING.retryMs)
    assert.deepEqual([callsOf(w, PORT.endPrincipal).length, callsOf(w, PORT.drop).length], [2, 0], 'a drop ran after a rejected endPrincipal')
    await advance(w, w.TIMING.retryMs)
    assert.deepEqual([callsOf(w, PORT.endPrincipal).length, callsOf(w, PORT.drop).length], [3, 1])
    assert.ok(at(w, PORT.drop, PHASE.call, x.p) > at(w, PORT.endPrincipal, PHASE.done, x.e))
    assertNotes(w, x.sessions)
  })
  moduleRow(sdk, CASE.dt04, 're-enable release', 're-enable, release rejects once → logged, the box still held; retried after retryMs → released, the kept events pollable', async (w) => {
    const x = await ucWorld(w)
    await disable(w, ID.p)
    w.calls.failNext(PORT.release)
    switchOn(w, ID.p)
    await drain(w)
    assert.equal(callsOf(w, PORT.release).length, 1)
    assert.ok(logged(w).length >= 1, 'the rejection was not logged')
    await assertHeld(w, x.p)
    await advance(w, w.TIMING.retryMs)
    assert.deepEqual(argsOf(w, PORT.release), [[x.p], [x.p]])
    w.keys.add(x.p)
    await assertPollable(w, x.p, x.kept)
  })
  withdrawnRow(sdk, CASE.dt04, 'disabled cards.toUser', 'a card rejects → logged and never retried', NO_CARD_PORT)
  for (const [label, what] of [[PORT.note, 'a system note']]) {
    moduleRow(sdk, CASE.dt04, `disabled ${label}`, `${what} rejects → logged and never retried; every other note and card is delivered`, async (w) => {
      const x = await ucWorld(w)
      w.calls.failNext(label)
      await disable(w, ID.p)
      assert.ok(logged(w).length >= 1, 'the rejection was not logged')
      await advance(w, 2 * w.TIMING.retryMs)
      assertNotes(w, x.sessions)
      assert.equal(cards(w).length, x.offers.length, 'a card was retried or skipped')
      assert.equal(w.calls.of(label, PHASE.failed).length, 1)
    })
  }
}

// ================================================================================================
// State Transitions
// ================================================================================================

function stateTransitions(sdk) {
  // REV-ST-04 — the per-entry job chain.
  moduleRow(sdk, CASE.st04, '1', 'Disabled (held) → deleted inside the hold → the delete job drops the box; no note again; the hold ends nothing more later', async (w) => {
    const x = await ucWorld(w)
    const heldAt = w.clock.now()
    await disable(w, ID.p)
    await remove(w, ID.p)
    assert.deepEqual(argsOf(w, PORT.drop), [[x.p]])
    assertNotes(w, x.sessions)
    await jumpTo(w, heldAt + R + HANDLER_FIXTURE.pastHoldMs)
    assert.deepEqual(argsOf(w, PORT.drop), [[x.p]], 'the cancelled hold still dropped something')
    assert.deepEqual(argsOf(w, PORT.release), [])
  })
  // Row 2 (dev session decision, 2026-11-16): closeEntry runs AT ONCE, synchronously inside the
  // onRevoked listener and outside the per-entry chain, so a revocation closes its streams at once
  // (R-TOK-05); only the later steps are serial per entry (2a pins the first, 2b the rest).
  /** P's disable job held at endPrincipal, then the delete fires: `{x, gate, closedAtOnce}`. */
  const deleteDuringDisable = async (w) => {
    const x = await ucWorld(w)
    const gate = w.calls.gateNext(PORT.endPrincipal)
    w.keys.delete(x.p)
    w.tokens.disable(ID.p)
    const closedAtDisable = callsOf(w, PORT.closeEntry).length
    await gate.reached
    w.tokens.remove(ID.p)
    const closedAtDelete = callsOf(w, PORT.closeEntry).length
    await quiet()
    return { x, gate, closedAtOnce: [closedAtDisable, closedAtDelete] }
  }
  moduleRow(sdk, CASE.st04, '2a', 'a delete while the disable job of the same entry is running → its closeEntry runs at once, synchronously in onRevoked, once per revocation, before that job\'s first other port call', async (w) => {
    const { x, gate, closedAtOnce } = await deleteDuringDisable(w)
    try {
      assert.deepEqual(closedAtOnce, [1, 2], 'closeEntry did not run synchronously inside each onRevoked')
      assert.deepEqual(argsOf(w, PORT.closeEntry), [[x.e], [x.e]])
    } finally { gate.open() }
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.closeEntry), [[x.e], [x.e]], 'closeEntry did not run exactly once per revocation')
    const deleteClosed = at(w, PORT.closeEntry, PHASE.call, x.e, 1)
    for (const [label, first] of [[PORT.endPrincipal, x.e], [PORT.drop, x.p]]) {
      const firstOfJob = label === PORT.endPrincipal ? at(w, label, PHASE.call, first, 1) : at(w, label, PHASE.call, first)
      assert.ok(deleteClosed < firstOfJob, `the delete's closeEntry ran after its ${label}`)
    }
  })
  moduleRow(sdk, CASE.st04, '2b', 'a delete while the disable job of the same entry is running → the delete\'s endPrincipal and drop run only after the disable job ended', async (w) => {
    const { x, gate } = await deleteDuringDisable(w)
    try {
      assert.deepEqual([callsOf(w, PORT.endPrincipal).length, callsOf(w, PORT.drop).length], [1, 0], 'the delete job went on while the disable job was running')
    } finally { gate.open() }
    await drain(w)
    assert.ok(at(w, PORT.endPrincipal, PHASE.call, x.e, 1) > jobEnd(w, x.e), 'the delete\'s endPrincipal ran before the disable job ended')
    assert.deepEqual(argsOf(w, PORT.endPrincipal).map(([, o]) => o?.freshRetirements), [true, false])
    assert.deepEqual(argsOf(w, PORT.drop), [[x.p]])
  })
  moduleRow(sdk, CASE.st04, '3', 'two entries revoked together → their jobs may overlap: Q\'s job ends while P\'s is still running', async (w) => {
    const x = await ucWorld(w)
    const gate = w.calls.gateNext(PORT.endPrincipal)
    w.keys.delete(x.p)
    w.tokens.disable(ID.p)
    await gate.reached
    w.keys.delete(x.q)
    w.tokens.disable(ID.q)
    try {
      await until(() => doneOf(w, PORT.note, X.s4).length === 1, 'Q\'s note while P\'s job waits')
      assert.equal(doneOf(w, PORT.endPrincipal, x.e).length, 0)
    } finally { gate.open() }
    await drain(w)
    assertNotes(w, [...x.sessions, X.s4])
  })
  moduleRow(sdk, CASE.st04, '4', 'a re-enable while the disable job is running → release waits for the job, then runs once', async (w) => {
    const x = await ucWorld(w)
    const gate = w.calls.gateNext(PORT.endPrincipal)
    w.keys.delete(x.p)
    w.tokens.disable(ID.p)
    await gate.reached
    switchOn(w, ID.p)
    await quiet()
    assert.deepEqual(argsOf(w, PORT.release), [], 'released while the disable job was running')
    gate.open()
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.release), [[x.p]])
    assert.ok(at(w, PORT.release, PHASE.call, x.p) > jobEnd(w, x.e), 'the release ran before the disable job ended')
    w.keys.add(x.p)
    await assertPollable(w, x.p, x.kept)
  })

  // REV-ST-05 — P's box: Pending, Held, Released, Dropped.
  moduleRow(sdk, CASE.st05, '1', 'Held → re-enabled → Pending → disabled again → Held → re-enabled → Pending: one hold and one release each time, same eventIds', async (w) => {
    const x = await ucWorld(w)
    await disable(w, ID.p)
    await reenable(w, ID.p)
    await disable(w, ID.p)
    await assertHeld(w, x.p)
    await reenable(w, ID.p)
    assert.deepEqual([argsOf(w, PORT.hold).length, argsOf(w, PORT.release)], [2, [[x.p], [x.p]]])
    await assertPollable(w, x.p, x.kept)
  })
  moduleRow(sdk, CASE.st05, '2', 'Pending, never disabled → a settings change → nothing released', async (w) => {
    await ucWorld(w)
    w.settings.set({})
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.release), [])
  })
  moduleRow(sdk, CASE.st05, '3', 'Held → a settings change while the entry is still off → still Held, nothing released', async (w) => {
    const x = await ucWorld(w)
    await disable(w, ID.p)
    w.settings.set({})
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.release), [])
    await assertHeld(w, x.p)
  })
  moduleRow(sdk, CASE.st05, '4', 'Held → deleted → Dropped and forgotten: a later settings change releases nothing', async (w) => {
    const x = await ucWorld(w)
    await disable(w, ID.p)
    await remove(w, ID.p)
    w.settings.set({})
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.release), [])
    await assertDroppedEmpty(w, x.p)
  })

  // REV-ST-06 — the module: start and close.
  moduleRow(sdk, CASE.st06, '1', 'Held, module and connector restarted → the new module remembers the hold: re-enable releases it and the kept event is pollable', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await manage(w, S.s1, p)
    const queued = (await expectOne(w, () => w.sessions.finishTurn(S.s1), p, ET.turnFinished)).event
    await disable(w, ID.p)
    await w.restartRevocation({ reopen: true })
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.release), [], 'the restart released a box whose entry is still off')
    await reenable(w, ID.p)
    assert.deepEqual(argsOf(w, PORT.release), [[p]])
    await assertPollable(w, p, [queued])
  })
  moduleRow(sdk, CASE.st06, '2', 'Held, the entry switched on while the module was stopped (no event) → start releases its box once (amendment 1: every listed, enabled, paired entry\'s box is released at start)', async (w) => {
    const x = await ucWorld(w)
    await disable(w, ID.p)
    await w.closeRevocation()
    w.tokens.add(ID.p)
    await w.createRevocation().start()
    await drain(w)
    assert.deepEqual(argsOf(w, PORT.release, x.p), [[x.p]])
    assert.deepEqual(argsOf(w, PORT.release).map(([k]) => k).sort(), [x.p, x.q].sort(), 'start did not release exactly the enabled, paired entries\' boxes')
    w.keys.add(x.p)
    await assertPollable(w, x.p, x.kept)
  })
  moduleRow(sdk, CASE.st06, '3', 'Started → close → onRevoked and settings changes reach nothing; no timer stays armed', async (w) => {
    await ucWorld(w)
    await drain(w)
    await w.closeRevocation()
    const n = w.calls.entries.length
    w.keys.delete(FIXTURE.principal(ID.p))
    w.tokens.disable(ID.p)
    w.settings.set({})
    await quiet()
    await advance(w, w.TIMING.expirySweepMs)
    assert.equal(w.calls.entries.length, n, 'the closed module still acted')
    assert.deepEqual(w.timers.pending(), [])
  })
  moduleRow(sdk, CASE.st06, '4', 'a retry pending → close → the retry is cleared: nothing runs after retryMs', async (w) => {
    await ucWorld(w)
    w.calls.failNext(PORT.hold)
    await disable(w, ID.p)
    await w.closeRevocation()
    assert.deepEqual(w.timers.pending(), [])
    const n = w.calls.entries.length
    await advance(w, w.TIMING.retryMs)
    assert.equal(w.calls.entries.length, n, 'a cleared retry ran')
  })
  moduleRow(sdk, CASE.st06, '5', 'a job running → close resolves only once that job stopped; nothing runs afterwards', async (w) => {
    const x = await ucWorld(w)
    const gate = w.calls.gateNext(PORT.endPrincipal)
    w.keys.delete(x.p)
    w.tokens.disable(ID.p)
    await gate.reached
    const closing = w.closeRevocation()
    assert.equal(await settlesWithin(closing, WAIT.quietMs), false, 'close resolved while a job was running')
    gate.open()
    assert.ok(await settlesWithin(closing, WAIT.eventMs), 'close did not resolve after the job stopped')
    await closing
    const n = w.calls.entries.length
    await advance(w, w.TIMING.retryMs)
    assert.equal(w.calls.entries.length, n, 'the module acted after close resolved')
  })
}

// ================================================================================================
// The rows other suites left `todo` for C-REVOKE
// ================================================================================================

function otherSuitesRows(sdk) {
  moduleRow(sdk, CASE.watchUc02, 'A2 note', 'P\'s entry revoked → S1 unmanaged and unwatched, plus one system note in S1', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await manage(w, S.s1, p)
    await disable(w, ID.p)
    assert.equal(w.managed.managerOf(S.s1), undefined)
    await unwatched(w, S.s1)
    assertNotes(w, [S.s1])
  })
  for (const kind of [REVOCATION.disabled, REVOCATION.deleted]) {
    moduleRow(sdk, CASE.handSt01, `6 note ${kind}`, `Managed(P) → P's entry ${kind} → Unmanaged; one system note in the session; its live offer to the user`, async (w) => {
      const p = w.principal(ID.p, { connected: true })
      w.session(S.s1)
      await manage(w, S.s1, p)
      const offer = await offerTo(w, S.s1, ET.permission, p)
      if (kind === REVOCATION.deleted) await remove(w, ID.p)
      else await disable(w, ID.p)
      assert.equal(w.managed.managerOf(S.s1), undefined)
      assertNotes(w, [S.s1])
      assertCards(w, E(ID.p), [offer])
    })
  }
  moduleRow(sdk, CASE.handUc03, 'E1 (service)', 'the nameless agent-b principal managing S2 is revoked → managed() no longer lists S2, onChange fires; S2 gets one system note', async (w) => {
    const b = w.principal(ID.x, { connected: true })
    const p = w.principal(ID.p, { connected: true, name: FIXTURE.names.hf })
    for (const s of [S.s1, S.s2]) w.session(s)
    await manage(w, S.s1, p)
    await manage(w, S.s2, b)
    const seen = counting(w.handover)
    await disable(w, ID.x)
    assert.deepEqual(w.handover.managed().map((m) => m.sessionId), [S.s1])
    assert.ok(seen.n >= 1, 'the hand-over service did not report the change')
    assertNotes(w, [S.s2])
  })
  moduleRow(sdk, CASE.platSt01, '6', 'Live(P) → P revoked → Live(user): one card {offerId, sessionId, type} in the session; P can no longer settle it', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await manage(w, S.s1, p)
    const offer = await offerTo(w, S.s1, ET.question, p)
    await disable(w, ID.p)
    assertCards(w, E(ID.p), [offer])
    await assertNotLive(w, offer)
  })
  moduleRow(sdk, CASE.nameEp02, '9 (revocation)', 'disabling the name holder\'s entry keeps its pair and name (no pairs.remove); deleting it removes the pair, freeing the name', async (w) => {
    w.principal(ID.p, { connected: true, name: FIXTURE.names.p })
    await disable(w, ID.p)
    assert.equal(w.pairs.pairOf(E(ID.p))?.name, FIXTURE.names.p, 'the disabled entry lost its name')
    assert.deepEqual(argsOf(w, PORT.remove), [])
    await remove(w, ID.p)
    assert.deepEqual(argsOf(w, PORT.remove), [[E(ID.p)]])
    assert.equal(w.pairs.list().some((pair) => pair.name === FIXTURE.names.p), false, 'the deleted entry still holds its name')
  })
}

// ------------------------------------------------------------------------------------------------

export function registerRevocationHandlerCases(sdk) {
  useCases(sdk)
  equivalencePartitions(sdk)
  boundaryValues(sdk)
  decisionTables(sdk)
  stateTransitions(sdk)
  otherSuitesRows(sdk)
}
