/**
 * F-ASKCARD black-box cases (USE-CASES.md): PLAT-UC-07 (docs/test-design/v3/11-platform.md) and the
 * task's own rows ASK-UC/EP/BVA/DT/ST. Requirements R-FB-11, R-UI-12, R-CON-05, R-CON-06, R-CON-08;
 * K3 `ask-card.d.ts`, `ui.d.ts` `asks`; the user's decision Q3 = A.
 *
 * Techniques, and only these: Use Cases first (each flow is a test), then Equivalence Partitioning
 * (one test per partition), Boundary Values (the reason's blank/non-blank edge, 48 h), Decision
 * Tables (one test per rule) and State Transitions (one test per transition). Expected outcomes are
 * the requirements', never the implementation's.
 *
 * Levels: integration (the module over a real dsh-storage-domain table, a fake link of K1 shapes,
 * a fake Fetch registry with real Request/Response objects) and system (PLAT-UC-07 main and A1:
 * `ask_user` registered in a real DSH tool runtime and called by a scripted model in a real agent).
 * The page UI is E2E-CORE's (W6).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from 'fishball-test-helpers/cases'
import {
  ANSWER, ARGUMENTS_STATUS, ASK_TOOL, CARDABLE, CLOCK, CODE, CONNECTOR_OK, DETAIL_REASON_ROWS, DETAIL_STATUS_ROWS, EVENT_TYPE, FIXTURE, INVALID_ANSWERS, INVALID_TOOL_ARGS, K3,
  REASON_ROWS, ROUTE, TOOL, WAIT,
} from './constants.mjs'
import { askEvent, expectedCard, frames, offerOf, reofferOf, replayOf, request, retirementOf, routesFor, settlementOf, turns, worldFor } from './world.mjs'
import { registerRfixAskCases } from './rfix.mjs'
import { asksModule, exported } from './subject.mjs'
import { ID_PATTERN, SEAM_TARGETS, SOURCE, askHandle, askToolNameOf } from '../support/targets-oracle.mjs'
import { until } from 'fishball-test-helpers/wait'
import { registerMultiAskCases } from './multi.mjs'

const T = { timeout: WAIT.testMs }
const json = (value) => JSON.stringify(value)
const ID = Object.freeze({
  uc07: 'PLAT-UC-07', uc01: 'ASK-UC-01', uc02: 'ASK-UC-02', uc03: 'ASK-UC-03', uc05: 'ASK-UC-05', uc06: 'ASK-UC-06',
  ep01: 'ASK-EP-01', ep02: 'ASK-EP-02', ep03: 'ASK-EP-03', ep04: 'ASK-EP-04', bva01: 'ASK-BVA-01', bva02: 'ASK-BVA-02',
  dt01: 'ASK-DT-01', dt02: 'ASK-DT-02', dt03: 'ASK-DT-03', st01: 'ASK-ST-01',
  rc07: 'ASK-UC-07', ep05: 'ASK-EP-05', dt04: 'ASK-DT-04',
  ep06: 'ASK-EP-06', uc08: 'ASK-UC-08', st02: 'ASK-ST-02', st03: 'ASK-ST-03', ep07: 'ASK-EP-07', bva03: 'ASK-BVA-03',
})
const row = (id, part, title, fn) => test(caseName(id, part, title), T, fn)

// ------------------------------------------------------------------------------------------------
// Shared observations (each states one requirement oracle once).

const ok = Object.freeze({ ok: true })
const refused = (code) => ({ ok: false, code })
/** The `approval_answer` args the requirements fix for `event`'s card, `choice` and the committed `reason`. */
function answerArgs(event, choice, reason = ANSWER.defaultReason) {
  const d = event.payload
  return { sessionId: event.sourceSessionId, approvalId: d.approvalId, offerId: d.offerId, answer: { decision: choice, risk: ANSWER.riskOf[choice], reason } }
}
/** The card of `event` is in `list()` with exactly K3's fields and `state`. */
function assertCard(world, event, state) {
  const card = world.card(event.payload.approvalId)
  assert.ok(card, `no card for ${event.payload.approvalId}; list ${json(world.service.list())}`)
  assert.deepEqual(Object.keys(card).sort(), [...K3.fields].sort(), 'the card has other fields than K3 AskCard')
  assert.deepEqual({ ...card, choices: [...card.choices] }, expectedCard(event, state))
}
/** Nothing changed and nothing was sent since `before` (a refused or late answer). */
function assertUnchanged(world, before, sentBefore = 0) {
  assert.deepEqual(world.service.list(), before, 'the cards changed')
  assert.equal(world.link.sent().length, sentBefore, 'an approval_answer was sent')
}
/** A filed open card for a fresh ask (the starting state of most rows). */
async function openCard(world, options) {
  const event = askEvent(options)
  const filed = await world.file(event)
  assert.equal(filed?.ok, true, `ask_user did not file the card: ${json(filed)}`)
  return event
}
const approvalIdOf = (event) => event.payload.approvalId
/** MULTI-0 (ui.d.ts): the service answers by the card's opaque handle, never a raw approvalId. */
const handleOfEvent = (event, source = SOURCE.a) => askHandle(source, approvalIdOf(event))
const answer = (world, event, choice, text) => world.service.answer(handleOfEvent(event), text === undefined ? { choice } : { choice, text })

// ------------------------------------------------------------------------------------------------
// Startup reconciliation (Fishball's decision 2026-11-16): an unfiled ask whose call ended is deleted.

/** Polls `events` (none filed), then restarts over the same table: the state a startup reconciles. */
async function unfiledAtStartup(w, ...events) {
  await w.poll(...events)
  await w.restart()
}
/** `approvals_list` answering that `events` are live. */
const live = (...events) => ({ ok: true, approvals: events.map((e) => e.payload) })
/** The ask was deleted: ask_user answers expired in this process and no card appears. */
async function assertDeleted(w, event) {
  assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.expired))
  assert.equal(w.card(approvalIdOf(event)), undefined, 'a deleted ask has a card')
}
/** The ask was kept: ask_user still files its card. */
async function assertKept(w, event) {
  const filed = await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) })
  assert.equal(filed?.ok, true, `a kept ask could not be filed: ${json(filed)}`)
  assertCard(w, event, K3.state.open)
}
const counts = (deleted, kept) => ({ deleted, kept })
const listCall = (event) => ({ sessionId: event.sourceSessionId })

/** ASK-DT-04 rules for one unfiled ask of one session: the approvals_list answer → deleted or kept. */
const RECONCILE_RULES = Object.freeze([
  ['ok, listed', (e) => live(e), false],
  ['ok, not listed', (e) => live(askEvent({ sourceSessionId: e.sourceSessionId })), true],
  ['ok, empty list', () => live(), true],
  [CODE.unknownSession, () => refused(CODE.unknownSession), true],
  [CODE.notManaged, () => refused(CODE.notManaged), false],
  [CODE.forbidden, () => refused(CODE.forbidden), false],
  [CODE.disconnected, () => refused(CODE.disconnected), false],
  [CODE.operationFailed, () => refused(CODE.operationFailed), false],
  ['callTool rejects', () => ({ reject: new Error(FIXTURE.injectedFault) }), false],
])

function registerReconcileCases() {
  // ============================================================== ASK-EP-05: what reconcile looks at
  row(ID.ep05, 'no asks', 'no ask at all → {deleted: 0, kept: 0} and no approvals_list call', async (t) => {
    const w = await worldFor(t)
    await w.restart()
    assert.deepEqual(await w.reconcile(), counts(0, 0))
    assert.deepEqual(w.link.listed(), [])
  })
  row(ID.ep05, 'only filed cards', 'filed cards only (open, answered, closed), the session ended → {0, 0}, no approvals_list call, every card unchanged', async (t) => {
    const w = await worldFor(t)
    const open = await openCard(w)
    const answered = await openCard(w)
    const closed = await openCard(w)
    await answer(w, answered, ANSWER.allow)
    await w.poll(settlementOf(approvalIdOf(closed)))
    await w.restart()
    const before = w.service.list()
    w.link.approvals.set(FIXTURE.askingSession, refused(CODE.unknownSession))
    assert.deepEqual(await w.reconcile(), counts(0, 0))
    assert.deepEqual(w.link.listed(), [])
    assert.deepEqual(w.service.list(), before)
    for (const [event, state] of [[open, K3.state.open], [answered, K3.state.answered], [closed, K3.state.closed]]) assertCard(w, event, state)
  })
  row(ID.ep05, 'once per session', 'two unfiled asks of one session → one approvals_list call; the listed one is kept, the other deleted', async (t) => {
    const w = await worldFor(t)
    const kept = askEvent()
    const ended = askEvent()
    await unfiledAtStartup(w, kept, ended)
    w.link.approvals.set(FIXTURE.askingSession, live(kept))
    assert.deepEqual(await w.reconcile(), counts(1, 1))
    assert.deepEqual(w.link.listed(), [listCall(kept)])
    await assertDeleted(w, ended)
    await assertKept(w, kept)
  })

  // ============================================================== ASK-DT-04: approvals_list answer × listed × filed
  for (const [rule, answerOf, deletes] of RECONCILE_RULES) {
    row(ID.dt04, `unfiled, ${rule}`, `an unfiled ask, approvals_list answers ${rule} → ${deletes ? 'deleted' : 'kept'}; one approvals_list call for its session`, async (t) => {
      const w = await worldFor(t)
      const event = askEvent()
      await unfiledAtStartup(w, event)
      w.link.approvals.set(event.sourceSessionId, answerOf(event))
      assert.deepEqual(await w.reconcile(), deletes ? counts(1, 0) : counts(0, 1))
      assert.deepEqual(w.link.listed(), [listCall(event)])
      if (deletes) await assertDeleted(w, event)
      else await assertKept(w, event)
    })
  }
  for (const [state, settle] of [
    [K3.state.open, async () => {}],
    [K3.state.answered, async (w, e) => { await answer(w, e, ANSWER.allow) }],
    [K3.state.closed, async (w, e) => { await w.poll(settlementOf(approvalIdOf(e))) }],
  ]) {
    for (const [rule, answerOf] of [['ok, not listed', () => live()], [CODE.unknownSession, () => refused(CODE.unknownSession)]]) {
      row(ID.dt04, `filed ${state}, ${rule}`, `a filed ${state} card beside an unfiled ask of its session, approvals_list answers ${rule} → the unfiled one is deleted (counted), the card is untouched (not counted)`, async (t) => {
        const w = await worldFor(t)
        const filed = await openCard(w)
        await settle(w, filed)
        const unfiled = askEvent()
        await unfiledAtStartup(w, unfiled)
        w.link.approvals.set(FIXTURE.askingSession, answerOf())
        assert.deepEqual(await w.reconcile(), counts(1, 0))
        assert.deepEqual(w.link.listed(), [listCall(unfiled)])
        assertCard(w, filed, state)
        await assertDeleted(w, unfiled)
      })
    }
  }

  // ============================================================== ASK-UC-07: the startup flow
  row(ID.rc07, 'two sessions', 'S1 ended (unknown-session), S2 live (its ask listed) → S1\'s unfiled ask deleted, S2\'s kept; one approvals_list call per session', async (t) => {
    const w = await worldFor(t)
    const ended = askEvent({ sourceSessionId: FIXTURE.askingSession })
    const running = askEvent({ sourceSessionId: FIXTURE.otherSession })
    await unfiledAtStartup(w, ended, running)
    w.link.approvals.set(FIXTURE.askingSession, refused(CODE.unknownSession))
    w.link.approvals.set(FIXTURE.otherSession, live(running))
    assert.deepEqual(await w.reconcile(), counts(1, 1))
    const sessions = (calls) => calls.map((c) => c.sessionId).sort()
    assert.deepEqual(sessions(w.link.listed()), [FIXTURE.askingSession, FIXTURE.otherSession].sort())
    await assertDeleted(w, ended)
    await assertKept(w, running)
  })
  row(ID.rc07, 'replay', 'a replay of a deleted ask\'s event in the same process does not bring it back: ask_user still answers expired', async (t) => {
    const w = await worldFor(t)
    const event = askEvent()
    await unfiledAtStartup(w, event)
    w.link.approvals.set(event.sourceSessionId, refused(CODE.unknownSession))
    await w.reconcile()
    await w.poll(event)
    await assertDeleted(w, event)
  })
  row(ID.rc07, 'another restart', 'after another restart a deleted ask is unknown: ask_user answers unknown-offer', async (t) => {
    const w = await worldFor(t)
    const event = askEvent()
    await unfiledAtStartup(w, event)
    w.link.approvals.set(event.sourceSessionId, refused(CODE.unknownSession))
    assert.deepEqual(await w.reconcile(), counts(1, 0))
    await w.restart()
    assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.unknownOffer))
    assert.deepEqual(w.service.list(), [])
  })
  row(ID.rc07, 'no onChange', 'deleting an unfiled ask fires no onChange and leaves list() as it was', async (t) => {
    const w = await worldFor(t)
    const filed = await openCard(w)
    const event = askEvent()
    await unfiledAtStartup(w, event)
    const seen = []
    w.service.onChange((cards) => seen.push(cards))
    const before = w.service.list()
    w.link.approvals.set(event.sourceSessionId, refused(CODE.unknownSession))
    assert.deepEqual(await w.reconcile(), counts(1, 0))
    await turns()
    assert.deepEqual(seen, [], 'onChange fired for an ask that was never listed')
    assert.deepEqual(w.service.list(), before)
    assertCard(w, filed, K3.state.open)
  })
  row(ID.rc07, 'same process', 'reconcile without a restart deletes an ended unfiled ask polled in this process', async (t) => {
    const w = await worldFor(t)
    const event = askEvent()
    await w.poll(event)
    w.link.approvals.set(event.sourceSessionId, refused(CODE.unknownSession))
    assert.deepEqual(await w.reconcile(), counts(1, 0))
    await assertDeleted(w, event)
  })
  row(ID.rc07, 'no timer', 'without a reconcile call nothing is reconciled: 48 h on a fake clock sends no approvals_list and the ask can still be filed', async (t) => {
    const w = await worldFor(t)
    const event = askEvent()
    await unfiledAtStartup(w, event)
    w.link.approvals.set(event.sourceSessionId, refused(CODE.unknownSession))
    t.mock.timers.enable({ apis: [...CLOCK.apis], now: Date.now() })
    try {
      t.mock.timers.tick(CLOCK.waitedMs)
      await turns()
    } finally { t.mock.timers.reset() }
    assert.deepEqual(w.link.listed(), [])
    await assertKept(w, event)
  })
}

// ------------------------------------------------------------------------------------------------
// F-FIX: permission requests become cards (the user, 2026-11-17, answering "ask cards after
// ask_agent removed": "Permission requests become cards"). ask-card.d.ts as amended: a card is filed
// for a `permission` offer (or a frozen, unproduced `ask`); fields unchanged; question = prompt.

const permissionEvent = (options = {}) => askEvent({ ...options, type: EVENT_TYPE.permission })
/** The new offer of a re-offer is open and unfiled: list() does not show it until it is filed. */
const listedOffers = (w) => w.service.list().map((c) => c.offerId)

function registerPermissionCases() {
  // ASK-EP-06: which offer types ask_user files (EP over K1's offer types).
  for (const type of CARDABLE.filed) {
    row(ID.ep06, `card-able (${type})`, `ask_user with a polled ${type} event's offer id → {ok:true, card}: sessionId, sessionTitle, question = prompt, choices exactly allow/reject, state open`, async (t) => {
      const w = await worldFor(t)
      const event = askEvent({ type, choices: FIXTURE.otherChoices })
      const filed = await w.file(event)
      assert.equal(filed?.ok, true, `ask_user did not file the ${type}: ${json(filed)}`)
      assert.deepEqual({ ...filed.card, choices: [...filed.card.choices] }, expectedCard(event, K3.state.open))
      assertCard(w, event, K3.state.open)
    })
  }
  row(ID.ep06, 'permission, empty title', 'a permission whose title is "" → sessionTitle null', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w, { type: EVENT_TYPE.permission, title: FIXTURE.emptyTitle })
    assert.equal(w.card(approvalIdOf(event)).sessionTitle, null)
  })
  row(ID.ep06, 'permission, unfiled', 'a polled permission that Fishball does not file → no card listed, nothing sent', async (t) => {
    const w = await worldFor(t)
    await w.poll(permissionEvent())
    assert.deepEqual(w.service.list(), [])
    assert.deepEqual(w.link.sent(), [])
  })

  // ASK-UC-08: the permission card's life, as an ask card's (DT over choice × reason; closing events).
  for (const choice of ANSWER.choices) {
    for (const [reasonLabel, text, reason] of [['with a reason', FIXTURE.text, FIXTURE.text], ['no reason', undefined, ANSWER.defaultReason]]) {
      row(ID.uc08, `answer ${choice}, ${reasonLabel}`, `the user answers a permission card ${choice} (${reasonLabel}) → one approval_answer {sessionId, approvalId, offerId, answer: {decision, risk, reason}}; the card is answered`, async (t) => {
        const w = await worldFor(t)
        const event = await openCard(w, { type: EVENT_TYPE.permission })
        assert.deepEqual(await answer(w, event, choice, text), ok)
        assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(event, choice, reason)])
        assertCard(w, event, K3.state.answered)
        assert.deepEqual(await answer(w, event, choice), refused(CODE.alreadySettled))
        assert.equal(w.link.sent().length, 1)
      })
    }
  }
  for (const [how, closer] of [['a settlement', (e) => settlementOf(approvalIdOf(e))], ['a retirement', (e) => retirementOf(e.eventId)]]) {
    row(ID.uc08, `closed by ${how}`, `a filed permission card is closed by ${how}; a late answer gets expired and sends nothing`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w, { type: EVENT_TYPE.permission })
      await w.poll(closer(event))
      assertCard(w, event, K3.state.closed)
      const before = w.service.list()
      assert.deepEqual(await answer(w, event, ANSWER.allow), refused(CODE.expired))
      assertUnchanged(w, before)
    })
    row(ID.uc08, `ended before filing by ${how}`, `a permission ended by ${how} before it was filed → ask_user answers expired, no card`, async (t) => {
      const w = await worldFor(t)
      const event = permissionEvent()
      await w.poll(event, closer(event))
      assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.expired))
      assert.deepEqual(w.service.list(), [])
    })
  }
  row(ID.uc08, 'ask still works', 'an ask event is still filed and answered as before (the type stays frozen) beside a permission card', async (t) => {
    const w = await worldFor(t)
    const permission = await openCard(w, { type: EVENT_TYPE.permission })
    const ask = await openCard(w)
    assertCard(w, ask, K3.state.open)
    assert.deepEqual(await answer(w, ask, ANSWER.reject), ok)
    assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(ask, ANSWER.reject)])
    assertCard(w, ask, K3.state.answered)
    assertCard(w, permission, K3.state.open)
  })
  row(ID.uc08, 'system', 'a polled permission reaches Fishball; its model calls ask_user({offer_id}) in a real DSH turn → one open card', async (t) => {
    const w = await worldFor(t, { agent: true })
    const event = permissionEvent()
    await w.poll(event)
    const result = await w.fishballTurn({ [ASK_TOOL.arg]: offerOf(event) })
    assert.ok(result && json(result.content).includes(approvalIdOf(event)), `the tool result names no card: ${json(result?.content)}`)
    assertCard(w, event, K3.state.open)
  })

  // ASK-ST-02: re-offer, by revision (F-FIX, corrected 2026-11-17: the order is the mailbox event's
  // `offer.revision`, offer ids `<approvalId>.r<n>`). A HIGHER revision on a record not answered
  // replaces it, open and unfiled (not listed until filed), and the replaced offer id then answers
  // `expired`; the same or a LOWER revision is a replay and changes nothing; a new offer for an
  // answered record changes nothing. BVA on the revision: n+1, n+2 (higher), n (same), n-1 (lower).
  const assertExpired = async (w, event) => assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.expired), `filing the replaced ${offerOf(event)}`)
  const assertFiles = async (w, event) => {
    const filed = await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) })
    assert.equal(filed?.ok, true, `filing ${offerOf(event)} answered ${json(filed)}`)
    assertCard(w, event, K3.state.open)
  }
  for (const [label, step] of [['r1 → r2 (n+1)', 1], ['r1 → r3 (n+2)', 2]]) {
    row(ID.st02, `unfiled, higher ${label}`, `an unfiled permission, then ${label} → replaced: not listed; the replaced id answers expired; the new id files with its own prompt`, async (t) => {
      const w = await worldFor(t)
      const first = permissionEvent()
      const next = reofferOf(first, first.offer.revision + step)
      await w.poll(first)
      await w.poll(next)
      assert.deepEqual(w.service.list(), [], 'an unfiled re-offer is listed')
      await assertExpired(w, first)
      assert.deepEqual(w.service.list(), [], 'filing the replaced id filed something')
      await assertFiles(w, next)
      assert.equal(w.service.list().length, 1)
    })
  }
  row(ID.st02, 'open, higher', 'a filed, unanswered card, then r2 → replaced, unfiled: neither r1 nor r2 listed; r1 answers expired; r2 files; its answer commits r2\'s offer id', async (t) => {
    const w = await worldFor(t)
    const first = await openCard(w, { type: EVENT_TYPE.permission })
    const second = reofferOf(first)
    await w.poll(second)
    assert.deepEqual(listedOffers(w), [], `listed after the re-offer: ${json(listedOffers(w))}`)
    await assertExpired(w, first)
    await assertFiles(w, second)
    assert.deepEqual(await answer(w, second, ANSWER.allow), ok)
    assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(second, ANSWER.allow)], 'the answer did not commit the new offer id')
  })
  row(ID.st02, 'open, same (replay)', 'a replay of the filed offer (same revision) changes nothing: the card stays; filing again answers the same card', async (t) => {
    const w = await worldFor(t)
    const event = permissionEvent()
    const first = await w.file(event)
    const before = w.service.list()
    await w.poll(replayOf(event))
    assert.deepEqual(w.service.list(), before)
    assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), first)
  })
  row(ID.st02, 'unfiled, same (replay)', 'a replay of an unfiled offer changes nothing: still not listed; it can still be filed', async (t) => {
    const w = await worldFor(t)
    const event = permissionEvent()
    await w.poll(event)
    await w.poll(replayOf(event))
    assert.deepEqual(w.service.list(), [])
    await assertFiles(w, event)
  })
  row(ID.st02, 'open r2, lower r1', 'r2 filed, then r1 arrives (a lower revision) → a replay: the r2 card stays filed and listed; r1 answers expired', async (t) => {
    const w = await worldFor(t)
    const first = permissionEvent()
    const second = reofferOf(first)
    await w.poll(first, second)
    await assertFiles(w, second)
    const before = w.service.list()
    await w.poll(replayOf(first))
    assert.deepEqual(w.service.list(), before, 'a lower revision changed the cards')
    await assertExpired(w, first)
    assertCard(w, second, K3.state.open)
  })
  row(ID.st02, 're-polled page [r1, r2]', 'r2 filed, then the page [r1, r2] is polled again → nothing changes: the r2 card stays filed and listed', async (t) => {
    const w = await worldFor(t)
    const first = permissionEvent()
    const second = reofferOf(first)
    await w.poll(first, second)
    await assertFiles(w, second)
    const before = w.service.list()
    await w.poll(replayOf(first), replayOf(second))
    assert.deepEqual(w.service.list(), before)
    assertCard(w, second, K3.state.open)
  })
  // r2 here was never the record (it came after r3), so it was never "replaced": the requirement
  // fixes `expired` only for a replaced id, and a lower revision only "changes nothing". So r2 is
  // refused with either code, and r3 stays the record.
  row(ID.st02, 'unfiled r3, lower r2', 'unfiled r1 → r3, then r2 (lower than r3) → nothing changes: r2 cannot be filed (unknown-offer or expired), r3 files', async (t) => {
    const w = await worldFor(t)
    const r1 = permissionEvent()
    const r3 = reofferOf(r1, r1.offer.revision + 2)
    const r2 = reofferOf(r1, r1.offer.revision + 1)
    await w.poll(r1)
    await w.poll(r3)
    await w.poll(r2)
    const late = await w.tool.execute({ [ASK_TOOL.arg]: offerOf(r2) })
    assert.ok(late?.ok === false && [CODE.unknownOffer, CODE.expired].includes(late.code), `filing the never-held r2 answered ${json(late)}`)
    assert.deepEqual(w.service.list(), [])
    await assertFiles(w, r3)
  })
  row(ID.st02, 'answered, higher', 'a new offer for an already answered card changes nothing: the answered card stays, nothing is sent; the new id is not filed', async (t) => {
    const w = await worldFor(t)
    const first = await openCard(w, { type: EVENT_TYPE.permission })
    assert.deepEqual(await answer(w, first, ANSWER.reject), ok)
    const before = w.service.list()
    const second = reofferOf(first)
    await w.poll(second)
    assertUnchanged(w, before, 1)
    assertCard(w, first, K3.state.answered)
  })
  row(ID.st02, 'two re-offers', 'unfiled r1 → r2 → r3: r1 and r2 answer expired; only r3 files', async (t) => {
    const w = await worldFor(t)
    const r1 = permissionEvent()
    const r2 = reofferOf(r1)
    const r3 = reofferOf(r2)
    await w.poll(r1)
    await w.poll(r2)
    await w.poll(r3)
    for (const stale of [r1, r2]) await assertExpired(w, stale)
    await assertFiles(w, r3)
  })

  // ASK-ST-03: moves that act on one offer (F-FIX). Each move names the offer it acts on; a record
  // that moved on to a newer offer is not changed by a move on the older one.
  /** r1 filed and its answer held; r2 replaces the record while the answer is in flight. */
  async function answerInFlight(w, outcome) {
    const r1 = await openCard(w, { type: EVENT_TYPE.permission })
    const gate = Promise.withResolvers()
    w.link.answers.push({ hold: gate.promise, then: outcome })
    const pending = answer(w, r1, ANSWER.allow)
    await turns()
    assert.equal(w.link.sent().length, 1, 'precondition: r1\'s answer was not sent')
    const r2 = reofferOf(r1)
    await w.poll(r2)
    gate.resolve()
    await pending.catch(() => undefined)
    await turns()
    return { r1, r2 }
  }
  for (const code of [CODE.expired, CODE.alreadySettled]) {
    row(ID.st03, `r1 answer ${code} after r2`, `r1's answer in flight, r2 replaces the record, then the connector answers r1 ${code} → r2 stays open and unfiled; filing r2 succeeds`, async (t) => {
      const w = await worldFor(t)
      const { r2 } = await answerInFlight(w, refused(code))
      assert.deepEqual(listedOffers(w), [], `listed after r1's late refusal: ${json(w.service.list())}`)
      await assertFiles(w, r2)
    })
  }
  row(ID.st03, 'r1 answer ok after r2', 'r1\'s answer in flight, r2 replaces the record, then r1\'s answer succeeds → r2 is not marked answered', async (t) => {
    const w = await worldFor(t)
    const { r2 } = await answerInFlight(w, { ...CONNECTOR_OK })
    assert.equal(w.service.list().some((c) => c.offerId === offerOf(r2) && c.state === K3.state.answered), false, `r2 listed as answered: ${json(w.service.list())}`)
    const filed = await w.tool.execute({ [ASK_TOOL.arg]: offerOf(r2) })
    assert.notEqual(filed?.card?.state, K3.state.answered, `filing r2 answered ${json(filed)}`)
  })
  row(ID.st03, 'ask_user(r1) after r2', 'ask_user on r1 after r2 replaced it → expired, and r2 is not filed by it', async (t) => {
    const w = await worldFor(t)
    const r1 = await openCard(w, { type: EVENT_TYPE.permission })
    const r2 = reofferOf(r1)
    await w.poll(r2)
    await assertExpired(w, r1)
    assert.deepEqual(w.service.list(), [], `ask_user(r1) filed something: ${json(w.service.list())}`)
    await assertFiles(w, r2)
  })
  row(ID.st03, 'settlement closes r2 card', 'r1 filed, r2 replaces it and is filed; a settlement naming the approvalId closes the r2 card', async (t) => {
    const w = await worldFor(t)
    const r1 = await openCard(w, { type: EVENT_TYPE.permission })
    const r2 = reofferOf(r1)
    await w.poll(r2)
    await assertFiles(w, r2)
    await w.poll(settlementOf(approvalIdOf(r1)))
    assertCard(w, r2, K3.state.closed)
  })
  row(ID.st03, 'settlement ends unfiled r2', 'r1 filed, r2 replaces it (unfiled); a settlement naming the approvalId ends it: ask_user(r2) answers expired, nothing listed', async (t) => {
    const w = await worldFor(t)
    const r1 = await openCard(w, { type: EVENT_TYPE.permission })
    const r2 = reofferOf(r1)
    await w.poll(r2)
    await w.poll(settlementOf(approvalIdOf(r1)))
    assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(r2) }), refused(CODE.expired))
    assert.equal(w.service.list().some((c) => c.state === K3.state.open), false, `an open card after the settlement: ${json(w.service.list())}`)
  })
  row(ID.st03, 'retirement closes r2 card', 'r2 filed after replacing r1; a retirement naming r2\'s event closes the card', async (t) => {
    const w = await worldFor(t)
    const r1 = await openCard(w, { type: EVENT_TYPE.permission })
    const r2 = reofferOf(r1)
    await w.poll(r2)
    await assertFiles(w, r2)
    await w.poll(retirementOf(r2.eventId))
    assertCard(w, r2, K3.state.closed)
  })
  row(ID.st03, 'reconcile vs re-offer', 'startup reconcile judges unfiled r1 ended, but r2 replaced it while approvals_list was in flight → the record is kept: r2 files', async (t) => {
    const w = await worldFor(t)
    const r1 = permissionEvent()
    await unfiledAtStartup(w, r1)
    const gate = Promise.withResolvers()
    w.link.approvals.set(r1.sourceSessionId, { hold: gate.promise, then: live() })
    const reconciled = w.reconcile()
    assert.ok(await until(() => w.link.listed().length > 0, WAIT.settleMs, WAIT.pollMs), 'precondition: reconcile sent no approvals_list')
    const r2 = reofferOf(r1)
    await w.poll(r2)
    gate.resolve()
    await reconciled
    await assertFiles(w, r2)
  })
  row(ID.st03, 'reconcile, no re-offer (control)', 'startup reconcile judges unfiled r1 ended and nothing replaced it → deleted: ask_user(r1) answers expired', async (t) => {
    const w = await worldFor(t)
    const r1 = permissionEvent()
    await unfiledAtStartup(w, r1)
    w.link.approvals.set(r1.sourceSessionId, live())
    await w.reconcile()
    await assertDeleted(w, r1)
  })

  // ASK-EP-07: the card's detail (F-FIX; the user, 2026-11-17: "Show arguments and reason").
  for (const [label, status, choices] of DETAIL_STATUS_ROWS) {
    row(ID.ep07, `argumentsStatus ${label}`, `a permission with arguments and argumentsStatus ${label} → card.arguments is the text, argumentsStatus ${status ?? 'null'}, choices ${json(choices)}`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w, { type: EVENT_TYPE.permission, argumentsText: FIXTURE.argumentsText, argumentsStatus: status })
      assertCard(w, event, K3.state.open)
      assert.deepEqual([...w.card(approvalIdOf(event)).choices], [...choices])
    })
  }
  row(ID.ep07, 'no arguments', 'a permission with neither arguments nor argumentsStatus → both null, choices allow/reject', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w, { type: EVENT_TYPE.permission })
    const card = w.card(approvalIdOf(event))
    assert.deepEqual({ arguments: card.arguments, argumentsStatus: card.argumentsStatus, choices: [...card.choices] }, { arguments: null, argumentsStatus: null, choices: [...ANSWER.choices] })
  })
  for (const status of [ARGUMENTS_STATUS.truncated, ARGUMENTS_STATUS.unavailable]) {
    row(ID.ep07, `allow on a ${status} card`, `answering allow on a card whose arguments are ${status} → invalid-arguments, nothing sent, the card stays open; reject still commits`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w, { type: EVENT_TYPE.permission, argumentsText: FIXTURE.argumentsText, argumentsStatus: status })
      const before = w.service.list()
      assert.deepEqual(await answer(w, event, ANSWER.allow), refused(CODE.invalidArguments))
      assertUnchanged(w, before)
      assert.deepEqual(await answer(w, event, ANSWER.reject), ok)
      assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(event, ANSWER.reject)])
    })
  }
  // ASK-EP-07 'stored before F-FIX' was withdrawn by MULTI-0 (fresh install, no old-format reader) and is
  // not ported. ASK-UI-01 (the drawn card) runs fishball-ui's client.asks.js: an integration row of the
  // fishball-ui + fishball-core pair, not one of core's own (packages/core/tests/asks/README.md).

  // ASK-BVA-03: the descriptor's reason at the blank / non-blank edge.
  for (const [label, reason, shown] of DETAIL_REASON_ROWS) {
    row(ID.bva03, `reason ${label}`, `a permission whose reason is ${label} → card.reason ${shown === null ? 'null' : json(shown)}`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w, { type: EVENT_TYPE.permission, reason })
      assert.equal(w.card(approvalIdOf(event)).reason, shown)
    })
  }
}

export function registerAskCases() {
  registerMultiAskCases()
  // R-FIX-CORE (F12): rfix.mjs.
  registerRfixAskCases()
  registerReconcileCases()
  // ============================================================== PLAT-UC-07 / ASK-UC-01 (system)
  row(ID.uc07, 'main 1–3', 'S1\'s ask reaches Fishball; its model calls ask_user → one open card in Fishball\'s conversation; the user\'s Allow is committed once as Fishball\'s approval_answer', async (t) => {
    const w = await worldFor(t, { agent: true })
    const event = askEvent()
    await w.poll(event)
    const result = await w.fishballTurn({ [ASK_TOOL.arg]: offerOf(event) })
    assert.ok(result, 'the model\'s ask_user call got no tool result')
    assert.ok(json(result.content).includes(approvalIdOf(event)), `the tool result names no card: ${json(result.content)}`)
    assertCard(w, event, K3.state.open)
    assert.equal(w.service.list().length, 1)
    assert.deepEqual(await answer(w, event, ANSWER.allow, FIXTURE.text), ok)
    assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(event, ANSWER.allow, FIXTURE.text)])
    assertCard(w, event, K3.state.answered)
  })
  row(ID.uc07, 'A1', 'Fishball decides itself (no ask_user call) → no card, nothing sent', async (t) => {
    const w = await worldFor(t, { agent: true })
    await w.poll(askEvent())
    assert.equal(await w.fishballTurn(), undefined, 'the model made a tool call')
    assert.deepEqual(w.service.list(), [])
    assert.deepEqual(w.link.sent(), [])
  })
  row(ID.uc07, 'A2', 'ask_user again on the same open ask → the same card, no duplicate', async (t) => {
    const w = await worldFor(t)
    const event = askEvent()
    const first = await w.file(event)
    const again = await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) })
    assert.deepEqual(again, first)
    assert.equal(w.service.list().length, 1)
  })
  row(ID.uc07, 'E1', 'nobody answers for 48 h (fake clock) → the card stays open; no timer answers or closes it', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w)
    const before = w.service.list()
    t.mock.timers.enable({ apis: [...CLOCK.apis], now: Date.now() })
    try {
      t.mock.timers.tick(CLOCK.waitedMs)
      await turns()
      assertUnchanged(w, before)
      assertCard(w, event, K3.state.open)
    } finally { t.mock.timers.reset() }
  })
  for (const [how, closer] of [['a settlement', (e) => settlementOf(approvalIdOf(e))], ['a retirement', (e) => retirementOf(e.eventId)]]) {
    row(ID.uc07, 'E2', `settled elsewhere first (${how}) → the card is closed; a late answer gets expired and sends nothing`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      await w.poll(closer(event))
      assertCard(w, event, K3.state.closed)
      const before = w.service.list()
      assert.deepEqual(await answer(w, event, ANSWER.allow), refused(CODE.expired))
      assertUnchanged(w, before)
    })
    row(ID.uc01, 'E3', `settled before it was filed (${how}) → ask_user answers expired and no card is filed`, async (t) => {
      const w = await worldFor(t)
      const event = askEvent()
      await w.poll(event, closer(event))
      assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.expired))
      assert.deepEqual(w.service.list(), [])
    })
  }
  row(ID.uc01, 'E4', 'the link is down when the user answers → disconnected, the card stays open, and a later answer commits once', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w)
    w.link.answers.push(refused(CODE.disconnected))
    assert.deepEqual(await answer(w, event, ANSWER.reject), refused(CODE.disconnected))
    assertCard(w, event, K3.state.open)
    assert.deepEqual(await answer(w, event, ANSWER.reject), ok)
    assertCard(w, event, K3.state.answered)
    assert.equal(w.link.sent().length, 2, 'the retry was not sent')
  })
  row(ID.uc01, 'E5', 'two concurrent answers to one open card → one approval_answer; the second answers already-settled (first commit wins)', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w)
    const gate = Promise.withResolvers()
    w.link.answers.push({ hold: gate.promise })
    // Both answers start before the first commit returns; when the second resolves is not specified.
    const first = answer(w, event, ANSWER.allow)
    const second = answer(w, event, ANSWER.reject, FIXTURE.text)
    await turns()
    gate.resolve()
    assert.deepEqual(await first, ok)
    assert.deepEqual(await second, refused(CODE.alreadySettled))
    assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(event, ANSWER.allow)])
    assertCard(w, event, K3.state.answered)
  })
  row(ID.uc07, 'post', 'exactly one answer was committed for the ask, however many times the user answers', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w)
    assert.deepEqual(await answer(w, event, ANSWER.allow), ok)
    for (const choice of ANSWER.choices) assert.deepEqual(await answer(w, event, choice), refused(CODE.alreadySettled))
    assert.equal(w.link.sent().length, 1)
  })

  // ============================================================== ASK-UC-02: the routes
  row(ID.uc02, 'main 1', 'the module registers exactly the events (GET) and answer (POST) routes, each with a request body mode', async (t) => {
    const w = await worldFor(t)
    const { routes, dispose } = routesFor(w)
    t.after(dispose)
    assert.deepEqual([...routes.keys()].sort(), [ROUTE.answer, ROUTE.events].sort())
    assert.ok(routes.get(ROUTE.events).methods.includes(ROUTE.get))
    assert.ok(routes.get(ROUTE.answer).methods.includes(ROUTE.post))
    for (const route of routes.values()) {
      assert.equal(typeof route.fetch, 'function')
      assert.notEqual(route.requestBody, undefined, `${route.path} declares no requestBody`)
    }
  })
  row(ID.uc02, 'main 2', 'GET events: an SSE stream whose first frame has the manager session id and the cards at once, then one frame per change', async (t) => {
    const w = await worldFor(t)
    const existing = await openCard(w)
    const { routes, dispose } = routesFor(w)
    t.after(dispose)
    const response = await routes.get(ROUTE.events).fetch(request(ROUTE.events, ROUTE.get))
    assert.equal(response.status, ROUTE.status.ok)
    assert.ok(response.headers.get(ROUTE.contentType)?.startsWith(ROUTE.sse), `content-type ${response.headers.get(ROUTE.contentType)}`)
    const stream = frames(response)
    t.after(stream.cancel)
    assert.deepEqual(await stream.next(), { managerSessionId: FIXTURE.managerSession, cards: [expectedCard(existing, K3.state.open)] })
    const added = await openCard(w)
    assert.deepEqual(await stream.next(), { managerSessionId: FIXTURE.managerSession, cards: w.service.list() })
    assert.ok(w.card(approvalIdOf(added)))
    await answer(w, existing, ANSWER.allow)
    const after = await stream.next()
    assert.equal(after.cards.find((c) => c.handle === handleOfEvent(existing))?.state, K3.state.answered)
  })
  row(ID.uc02, 'main 3', 'POST answer {handle, choice, text} → 200 {ok:true}, committed as the service commits it', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w)
    const { routes, dispose } = routesFor(w)
    t.after(dispose)
    const response = await routes.get(ROUTE.answer).fetch(request(ROUTE.answer, ROUTE.post, { [SEAM_TARGETS.ask.handleField]: handleOfEvent(event), choice: ANSWER.reject, text: FIXTURE.text }))
    assert.equal(response.status, ROUTE.status.ok)
    assert.deepEqual(await response.json(), ok)
    assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(event, ANSWER.reject, FIXTURE.text)])
    assertCard(w, event, K3.state.answered)
  })
  for (const [part, title, body, status, code] of [
    // MULTI-0 (SEAM_TARGETS ask): an unknown handle answers 404 unknown-target; a known handle whose card cannot be answered stays 409.
    ['E1 unknown handle', 'a handle no card holds → 404 {ok:false, code: unknown-target}', () => ({ [SEAM_TARGETS.ask.handleField]: askHandle(SOURCE.a, FIXTURE.unknownApproval), choice: ANSWER.allow }), ROUTE.status.notFound, CODE.unknownTarget],
    ['E1 invalid', 'a choice that is not offered → 400 invalid-arguments', (e) => ({ [SEAM_TARGETS.ask.handleField]: handleOfEvent(e), choice: ANSWER.allow.toUpperCase() }), ROUTE.status.badRequest, CODE.invalidArguments],
    ['E1 raw approvalId', 'the withdrawn body {approvalId} (no handle) → 400, never answered by id', (e) => ({ approvalId: approvalIdOf(e), choice: ANSWER.allow }), ROUTE.status.badRequest, undefined],
    ['E1 unreadable', 'an unreadable body → 400', () => FIXTURE.unreadableBody, ROUTE.status.badRequest, undefined],
  ]) {
    row(ID.uc02, part, `POST answer: ${title}; nothing is sent and the card stays open`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      const before = w.service.list()
      const { routes, dispose } = routesFor(w)
      t.after(dispose)
      const response = await routes.get(ROUTE.answer).fetch(request(ROUTE.answer, ROUTE.post, body(event)))
      assert.equal(response.status, status)
      const answered = await response.json()
      assert.equal(answered.ok, false)
      if (code !== undefined) assert.equal(answered.code, code)
      assertUnchanged(w, before)
    })
  }
  row(ID.uc02, 'E2', 'the routes\' disposer withdraws both routes and ends an open stream', async (t) => {
    const w = await worldFor(t)
    const { routes, dispose, disposed } = routesFor(w)
    const response = await routes.get(ROUTE.events).fetch(request(ROUTE.events, ROUTE.get))
    const stream = frames(response)
    t.after(stream.cancel)
    await stream.next()
    dispose()
    assert.equal(disposed(), routes.size, 'not every route was withdrawn')
    assert.equal(await stream.ends(), true, 'the open stream did not end')
  })

  // ============================================================== ASK-UC-03: restart
  row(ID.uc03, 'main', 'a new store over the same table lists the same cards and states; the answered one stays answered, the open one commits once', async (t) => {
    const w = await worldFor(t)
    const answered = await openCard(w)
    const open = await openCard(w)
    const closed = await openCard(w)
    await answer(w, answered, ANSWER.allow)
    await w.poll(settlementOf(approvalIdOf(closed)))
    const byId = (cards) => [...cards].sort((a, b) => a.approvalId.localeCompare(b.approvalId))
    const before = byId(w.service.list())
    await w.restart()
    assert.deepEqual(byId(w.service.list()), before)
    assert.deepEqual(await answer(w, answered, ANSWER.reject), refused(CODE.alreadySettled))
    assert.deepEqual(await answer(w, closed, ANSWER.reject), refused(CODE.expired))
    assert.deepEqual(await answer(w, open, ANSWER.reject), ok)
    assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(open, ANSWER.reject)])
  })
  row(ID.uc03, 'A1', 'after a restart a settlement naming a filed open card still closes it', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w)
    await w.restart()
    await w.poll(settlementOf(approvalIdOf(event)))
    assertCard(w, event, K3.state.closed)
  })

  // ASK-UC-04 (nothing in the main DSH) is not core's: main 1 and 2 read fishball-ui's chunk and
  // manifest (fishball-ui's own subject), main 3 swept packages that left this repository in
  // 6b7c53bf (retired). See packages/core/tests/asks/README.md.

  // ============================================================== ASK-UC-05: onChange
  row(ID.uc05, 'main', 'onChange calls fn(cards) with list() after filing, answering and closing; its disposer stops the calls', async (t) => {
    const w = await worldFor(t)
    const seen = []
    const dispose = w.service.onChange((cards) => seen.push(structuredClone(cards)))
    const answered = await openCard(w)
    assert.deepEqual(seen.at(-1), structuredClone(w.service.list()), 'no call after filing')
    const closed = await openCard(w)
    await answer(w, answered, ANSWER.allow)
    assert.equal(seen.at(-1).find((c) => c.handle === handleOfEvent(answered)).state, K3.state.answered, 'no call after answering')
    await w.poll(settlementOf(approvalIdOf(closed)))
    assert.deepEqual(seen.at(-1), structuredClone(w.service.list()), 'no call after closing')
    dispose()
    const count = seen.length
    await openCard(w)
    assert.equal(seen.length, count, 'a disposed listener was called')
  })
  row(ID.uc05, 'E1', 'a throwing listener affects no other listener and no operation', async (t) => {
    const w = await worldFor(t)
    w.service.onChange(() => { throw new Error(FIXTURE.listenerFault) })
    const seen = []
    w.service.onChange((cards) => seen.push(cards))
    const event = await openCard(w)
    assert.equal(seen.length > 0, true, 'the second listener was not called')
    assert.deepEqual(await answer(w, event, ANSWER.allow), ok)
    assert.equal(seen.at(-1).find((c) => c.handle === handleOfEvent(event)).state, K3.state.answered)
  })

  // ============================================================== ASK-UC-06: following the link
  // MULTI-1: createAsks no longer subscribes to one link (its "follows the link once" oracle is
  // withdrawn with the scalar link); core hands each target's page to take(page, source). What
  // remains of the row: after close(), an ask taken afterwards is unknown.
  row(ID.uc06, 'main', 'close() stops the store: an ask taken afterwards is unknown', async (t) => {
    const w = await worldFor(t)
    await w.closeAsks()
    const event = askEvent()
    await w.poll(event)
    assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.unknownOffer))
  })

  // ============================================================== ASK-EP-01: ask_user arguments
  row(ID.ep01, 'definition', 'the tool is a DSH tool definition named ask_user; ASKS and CARD_STATE carry the frozen values', async () => {
    const mod = await asksModule()
    const constants = exported(mod, 'constants')
    assert.equal(constants.tool, ASK_TOOL.name)
    assert.equal(constants.defaultReason, ANSWER.defaultReason)
    assert.deepEqual(Object.values(exported(mod, 'states')).sort(), Object.values(K3.state).sort())
  })
  // MULTI-0 (README "Tool names"): each target's local ask_user is registered as
  // mcp__<readable>__ask_user_<digest12>, origin `local`; the bare `ask_user` is no longer model-facing.
  row(ID.ep01, 'definition (tool)', 'toolFor(source)\'s tool is named mcp__<readable>__ask_user_<digest> (origin local) and has description, parameters, output and execute', async (t) => {
    const w = await worldFor(t)
    assert.equal(w.tool.name, askToolNameOf(SOURCE.a, ASK_TOOL.name))
    assert.match(w.tool.name, ID_PATTERN.toolName)
    assert.equal(typeof w.tool.description, 'string')
    assert.equal(typeof w.tool.parameters, 'object')
    assert.equal(typeof w.tool.output, 'object')
    assert.equal(typeof w.tool.execute, 'function')
  })
  for (const [partition, args] of INVALID_TOOL_ARGS) {
    row(ID.ep01, partition, `ask_user with ${partition} → invalid-arguments, no card`, async (t) => {
      const w = await worldFor(t)
      await w.poll(askEvent())
      assert.deepEqual(await w.tool.execute(args), refused(CODE.invalidArguments))
      assert.deepEqual(w.service.list(), [])
    })
  }
  row(ID.ep01, 'never seen', 'ask_user with an offer id no polled ask carries → unknown-offer, no card', async (t) => {
    const w = await worldFor(t)
    const polled = askEvent()
    await w.poll(polled)
    assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(askEvent()) }), refused(CODE.unknownOffer))
    assert.deepEqual(w.service.list(), [])
  })
  // Re-baselined (F-FIX; the user, 2026-11-17: "Permission requests become cards"): row 5 was "a
  // permission event's offer id → unknown-offer". A permission is now card-able (ASK-EP-06), so
  // row 5 is the offer types that are still never card-able: question and plan-review.
  for (const type of CARDABLE.never) {
    row(ID.ep01, `not card-able (${type})`, `ask_user with the offer id of a ${type} event → unknown-offer, no card`, async (t) => {
      const w = await worldFor(t)
      const event = askEvent({ type })
      await w.poll(event)
      assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.unknownOffer))
      assert.deepEqual(w.service.list(), [])
    })
  }
  row(ID.ep01, 'a seen ask', 'ask_user with a polled ask\'s offer id → {ok:true, card}, the card list() shows', async (t) => {
    const w = await worldFor(t)
    const event = askEvent()
    const filed = await w.file(event)
    assert.equal(filed.ok, true)
    assert.deepEqual({ ...filed.card, choices: [...filed.card.choices] }, expectedCard(event, K3.state.open))
    assertCard(w, event, K3.state.open)
  })

  registerPermissionCases()

  // ============================================================== ASK-EP-02: card fields
  row(ID.ep02, 1, 'every field comes from the event: ids and question from the descriptor, sessionId from sourceSessionId, askedAt from the descriptor\'s at', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w, { sourceSessionId: FIXTURE.otherSession })
    assertCard(w, event, K3.state.open)
  })
  row(ID.ep02, 2, 'an empty descriptor title → sessionTitle null', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w, { title: FIXTURE.emptyTitle })
    assert.equal(w.card(approvalIdOf(event)).sessionTitle, null)
  })
  row(ID.ep02, 3, 'a descriptor with its own choices → the card still offers exactly allow, reject (Q3 = A)', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w, { choices: FIXTURE.otherChoices })
    assert.deepEqual([...w.card(approvalIdOf(event)).choices], [...ANSWER.choices])
  })

  // ============================================================== ASK-EP-03: invalid answers
  for (const [partition, value] of INVALID_ANSWERS) {
    row(ID.ep03, partition, `an answer that is ${partition} → invalid-arguments; nothing sent, the card stays open`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      const before = w.service.list()
      assert.deepEqual(await w.service.answer(handleOfEvent(event), value), refused(CODE.invalidArguments))
      assertUnchanged(w, before)
    })
  }

  // ============================================================== ASK-EP-04: events that close a card
  for (const [part, title, eventFor, state] of [
    [1, 'a settlement naming the card\'s approvalId → closed', (e) => settlementOf(approvalIdOf(e)), K3.state.closed],
    [2, 'a settlement naming another ask → still open', () => settlementOf(approvalIdOf(askEvent())), K3.state.open],
    [3, 'a retirement naming the ask event\'s eventId → closed', (e) => retirementOf(e.eventId), K3.state.closed],
    [4, 'a retirement naming the approvalId (not the eventId) → still open', (e) => retirementOf(approvalIdOf(e)), K3.state.open],
  ]) {
    row(ID.ep04, part, title, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      await w.poll(eventFor(event))
      assertCard(w, event, state)
      assert.deepEqual(w.link.sent(), [])
    })
  }

  // ============================================================== ASK-BVA-01: the reason
  for (const [partition, text, reason] of REASON_ROWS) {
    row(ID.bva01, partition, `the user's text ${partition} → reason ${reason === undefined ? 'is the fixed line' : json(reason)}`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      assert.deepEqual(await answer(w, event, ANSWER.allow, text), ok)
      assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(event, ANSWER.allow, reason ?? ANSWER.defaultReason)])
    })
  }

  // ============================================================== ASK-BVA-02: 48 h (see PLAT-UC-07 E1), and just after filing
  row(ID.bva02, 'filed at once', 'a card answered right after filing commits (no minimum wait)', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w)
    assert.deepEqual(await answer(w, event, ANSWER.reject), ok)
  })

  // ============================================================== ASK-DT-01: the answer object
  for (const choice of ANSWER.choices) {
    for (const [given, text] of [['with a reason', FIXTURE.text], ['without a reason', undefined]]) {
      row(ID.dt01, `${choice} ${given}`, `${choice} ${given} → {decision: ${choice}, risk: ${ANSWER.riskOf[choice]}, reason: ${text === undefined ? 'the fixed line' : 'the text'}}`, async (t) => {
        const w = await worldFor(t)
        const event = await openCard(w)
        assert.deepEqual(await answer(w, event, choice, text), ok)
        assert.deepEqual(w.link.sent(), [{ name: TOOL.approvalAnswer, args: answerArgs(event, choice, text ?? ANSWER.defaultReason) }])
      })
    }
  }

  // ============================================================== ASK-DT-02: the connector's answer
  const DT02 = [
    ['ok', CONNECTOR_OK, ok, K3.state.answered],
    [CODE.alreadySettled, refused(CODE.alreadySettled), refused(CODE.alreadySettled), K3.state.closed],
    [CODE.expired, refused(CODE.expired), refused(CODE.expired), K3.state.closed],
    [CODE.disconnected, refused(CODE.disconnected), refused(CODE.disconnected), K3.state.open],
    [CODE.reasonRequired, refused(CODE.reasonRequired), refused(CODE.reasonRequired), K3.state.open],
    [CODE.argumentsIncomplete, refused(CODE.argumentsIncomplete), refused(CODE.argumentsIncomplete), K3.state.open],
    ['callTool rejects', { reject: new Error(FIXTURE.injectedFault) }, refused(CODE.operationFailed), K3.state.open],
  ]
  for (const [rule, connector, result, state] of DT02) {
    row(ID.dt02, rule, `the connector answers ${rule} → the user gets ${json(result)}; the card is ${state}`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      w.link.answers.push(connector)
      assert.deepEqual(await answer(w, event, ANSWER.allow), result)
      assertCard(w, event, state)
      assert.equal(w.link.sent().length, 1)
    })
  }

  // ============================================================== ASK-DT-03: late answers and late filing
  for (const [rule, prepare, code] of [
    ['answered card', async (w, e) => { await answer(w, e, ANSWER.allow) }, CODE.alreadySettled],
    ['closed card', async (w, e) => { await w.poll(settlementOf(approvalIdOf(e))) }, CODE.expired],
  ]) {
    row(ID.dt03, `answer on ${rule}`, `an answer on an ${rule} → ${code}; nothing changes, nothing is sent`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      await prepare(w, event)
      const before = w.service.list()
      const sent = w.link.sent().length
      assert.deepEqual(await answer(w, event, ANSWER.reject, FIXTURE.text), refused(code))
      assertUnchanged(w, before, sent)
    })
    row(ID.dt03, `ask_user on ${rule}`, `ask_user on an ${rule} → expired; the card is unchanged`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      await prepare(w, event)
      const before = w.service.list()
      assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.expired))
      assert.deepEqual(w.service.list(), before)
    })
  }
  // MULTI-0 (ui.d.ts asks.answer): an unknown handle answers unknown-target. AMBIGUITY (reported):
  // the handle of an ask that was polled on a live target but never filed names no card, yet its
  // target and approval are known; the freeze does not say whether that is "unknown" (unknown-target)
  // or a not-open request (K1 expired, as before MULTI-0). Both are accepted; nothing may be sent.
  row(ID.dt03, 'polled, unfiled handle', 'an answer for the handle of an ask only polled, never filed → refused (unknown-target or expired: ambiguous); nothing is sent', async (t) => {
    const w = await worldFor(t)
    const polledOnly = askEvent()
    await w.poll(polledOnly)
    const answered = await answer(w, polledOnly, ANSWER.allow)
    assert.equal(answered.ok, false)
    assert.ok([CODE.unknownTarget, CODE.expired].includes(answered.code), json(answered))
    assertUnchanged(w, [])
  })
  for (const [part, title, handle] of [
    ['never seen', 'a handle of this target\'s tuple with an approvalId never polled', () => askHandle(SOURCE.a, FIXTURE.unknownApproval)],
    ['another target', 'the handle of a filed card\'s approvalId under a target this world never had', (e) => askHandle(SOURCE.b, approvalIdOf(e))],
    ['retired epoch', 'the handle of a filed card\'s approvalId under its target\'s other (never live) epoch', (e) => askHandle(SOURCE.aNext, approvalIdOf(e))],
    ['not a handle', 'a string that decodes to no tuple', () => FIXTURE.notAHandle],
  ]) {
    row(ID.dt03, 'unknown handle ' + part, `answer(${title}) → unknown-target; nothing is sent; the filed card stays open`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      const before = w.service.list()
      assert.deepEqual(await w.service.answer(handle(event), { choice: ANSWER.allow }), refused(CODE.unknownTarget))
      assertUnchanged(w, before)
      assert.deepEqual(w.misrouted, [], 'a call went to a target the world does not hold')
    })
  }

  // ============================================================== ASK-ST-01: state transitions
  row(ID.st01, 'open → open (replay)', 'a replay of the ask event (same eventId) leaves the one open card as it was', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w)
    const before = w.service.list()
    await w.poll(event)
    assert.deepEqual(w.service.list(), before)
  })
  row(ID.st01, 'open → open → answered', 'a refusal that keeps the card open, then an answer that commits → answered', async (t) => {
    const w = await worldFor(t)
    const event = await openCard(w)
    w.link.answers.push(refused(CODE.reasonRequired))
    await answer(w, event, ANSWER.allow)
    assertCard(w, event, K3.state.open)
    assert.deepEqual(await answer(w, event, ANSWER.allow, FIXTURE.text), ok)
    assertCard(w, event, K3.state.answered)
  })
  for (const [label, later] of [
    ['the settlement of its own answer', (e) => settlementOf(approvalIdOf(e))],
    ['a retirement of the ask', (e) => retirementOf(e.eventId)],
    ['a replay of the ask', (e) => e],
  ]) {
    row(ID.st01, `answered → answered (${label})`, `an answered card stays answered on ${label}`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      await answer(w, event, ANSWER.allow)
      await w.poll(later(event))
      assertCard(w, event, K3.state.answered)
    })
  }
  for (const [label, later] of [
    ['a second settlement', (e) => settlementOf(approvalIdOf(e))],
    ['a replay of the ask', (e) => e],
  ]) {
    row(ID.st01, `closed → closed (${label})`, `a closed card stays closed on ${label}`, async (t) => {
      const w = await worldFor(t)
      const event = await openCard(w)
      await w.poll(retirementOf(event.eventId))
      await w.poll(later(event))
      assertCard(w, event, K3.state.closed)
    })
  }
  row(ID.st01, 'one card per ask', 'two asks give two independent cards: answering one leaves the other open', async (t) => {
    const w = await worldFor(t)
    const first = await openCard(w)
    const second = await openCard(w)
    await answer(w, first, ANSWER.allow)
    assertCard(w, first, K3.state.answered)
    assertCard(w, second, K3.state.open)
  })
}
