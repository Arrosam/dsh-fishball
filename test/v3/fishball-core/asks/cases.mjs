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
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { REPO } from '../../../support/constants.mjs'
import {
  ANSWER, ASK_TOOL, CLOCK, CODE, CONNECTOR_OK, EVENT_TYPE, FIXTURE, INVALID_ANSWERS, INVALID_TOOL_ARGS, K3, MAIN_DSH_FORBIDDEN, MAIN_DSH_PACKAGES,
  REASON_ROWS, ROUTE, SUBJECT, SWEEP, TOOL, WAIT,
} from './constants.mjs'
import { askEvent, expectedCard, frames, offerOf, request, retirementOf, routesFor, settlementOf, turns, worldFor } from './world.mjs'
import { asksModule, exported } from './subject.mjs'

const T = { timeout: WAIT.testMs }
const json = (value) => JSON.stringify(value)
const ID = Object.freeze({
  uc07: 'PLAT-UC-07', uc01: 'ASK-UC-01', uc02: 'ASK-UC-02', uc03: 'ASK-UC-03', uc04: 'ASK-UC-04', uc05: 'ASK-UC-05', uc06: 'ASK-UC-06',
  ep01: 'ASK-EP-01', ep02: 'ASK-EP-02', ep03: 'ASK-EP-03', ep04: 'ASK-EP-04', bva01: 'ASK-BVA-01', bva02: 'ASK-BVA-02',
  dt01: 'ASK-DT-01', dt02: 'ASK-DT-02', dt03: 'ASK-DT-03', st01: 'ASK-ST-01',
  rc07: 'ASK-UC-07', ep05: 'ASK-EP-05', dt04: 'ASK-DT-04',
})
const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)

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
const answer = (world, event, choice, text) => world.service.answer(approvalIdOf(event), text === undefined ? { choice } : { choice, text })

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

function registerReconcileCases(sdk) {
  // ============================================================== ASK-EP-05: what reconcile looks at
  row(sdk, ID.ep05, 'no asks', 'no ask at all → {deleted: 0, kept: 0} and no approvals_list call', async (t) => {
    const w = await worldFor(t, sdk)
    await w.restart()
    assert.deepEqual(await w.reconcile(), counts(0, 0))
    assert.deepEqual(w.link.listed(), [])
  })
  row(sdk, ID.ep05, 'only filed cards', 'filed cards only (open, answered, closed), the session ended → {0, 0}, no approvals_list call, every card unchanged', async (t) => {
    const w = await worldFor(t, sdk)
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
  row(sdk, ID.ep05, 'once per session', 'two unfiled asks of one session → one approvals_list call; the listed one is kept, the other deleted', async (t) => {
    const w = await worldFor(t, sdk)
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
    row(sdk, ID.dt04, `unfiled, ${rule}`, `an unfiled ask, approvals_list answers ${rule} → ${deletes ? 'deleted' : 'kept'}; one approvals_list call for its session`, async (t) => {
      const w = await worldFor(t, sdk)
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
      row(sdk, ID.dt04, `filed ${state}, ${rule}`, `a filed ${state} card beside an unfiled ask of its session, approvals_list answers ${rule} → the unfiled one is deleted (counted), the card is untouched (not counted)`, async (t) => {
        const w = await worldFor(t, sdk)
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
  row(sdk, ID.rc07, 'two sessions', 'S1 ended (unknown-session), S2 live (its ask listed) → S1\'s unfiled ask deleted, S2\'s kept; one approvals_list call per session', async (t) => {
    const w = await worldFor(t, sdk)
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
  row(sdk, ID.rc07, 'replay', 'a replay of a deleted ask\'s event in the same process does not bring it back: ask_user still answers expired', async (t) => {
    const w = await worldFor(t, sdk)
    const event = askEvent()
    await unfiledAtStartup(w, event)
    w.link.approvals.set(event.sourceSessionId, refused(CODE.unknownSession))
    await w.reconcile()
    await w.poll(event)
    await assertDeleted(w, event)
  })
  row(sdk, ID.rc07, 'another restart', 'after another restart a deleted ask is unknown: ask_user answers unknown-offer', async (t) => {
    const w = await worldFor(t, sdk)
    const event = askEvent()
    await unfiledAtStartup(w, event)
    w.link.approvals.set(event.sourceSessionId, refused(CODE.unknownSession))
    assert.deepEqual(await w.reconcile(), counts(1, 0))
    await w.restart()
    assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.unknownOffer))
    assert.deepEqual(w.service.list(), [])
  })
  row(sdk, ID.rc07, 'no onChange', 'deleting an unfiled ask fires no onChange and leaves list() as it was', async (t) => {
    const w = await worldFor(t, sdk)
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
  row(sdk, ID.rc07, 'same process', 'reconcile without a restart deletes an ended unfiled ask polled in this process', async (t) => {
    const w = await worldFor(t, sdk)
    const event = askEvent()
    await w.poll(event)
    w.link.approvals.set(event.sourceSessionId, refused(CODE.unknownSession))
    assert.deepEqual(await w.reconcile(), counts(1, 0))
    await assertDeleted(w, event)
  })
  row(sdk, ID.rc07, 'no timer', 'without a reconcile call nothing is reconciled: 48 h on a fake clock sends no approvals_list and the ask can still be filed', async (t) => {
    const w = await worldFor(t, sdk)
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

export function registerAskCases(sdk) {
  registerReconcileCases(sdk)
  // ============================================================== PLAT-UC-07 / ASK-UC-01 (system)
  row(sdk, ID.uc07, 'main 1–3', 'S1\'s ask reaches Fishball; its model calls ask_user → one open card in Fishball\'s conversation; the user\'s Allow is committed once as Fishball\'s approval_answer', async (t) => {
    const w = await worldFor(t, sdk, { agent: true })
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
  row(sdk, ID.uc07, 'A1', 'Fishball decides itself (no ask_user call) → no card, nothing sent', async (t) => {
    const w = await worldFor(t, sdk, { agent: true })
    await w.poll(askEvent())
    assert.equal(await w.fishballTurn(), undefined, 'the model made a tool call')
    assert.deepEqual(w.service.list(), [])
    assert.deepEqual(w.link.sent(), [])
  })
  row(sdk, ID.uc07, 'A2', 'ask_user again on the same open ask → the same card, no duplicate', async (t) => {
    const w = await worldFor(t, sdk)
    const event = askEvent()
    const first = await w.file(event)
    const again = await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) })
    assert.deepEqual(again, first)
    assert.equal(w.service.list().length, 1)
  })
  row(sdk, ID.uc07, 'E1', 'nobody answers for 48 h (fake clock) → the card stays open; no timer answers or closes it', async (t) => {
    const w = await worldFor(t, sdk)
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
    row(sdk, ID.uc07, 'E2', `settled elsewhere first (${how}) → the card is closed; a late answer gets expired and sends nothing`, async (t) => {
      const w = await worldFor(t, sdk)
      const event = await openCard(w)
      await w.poll(closer(event))
      assertCard(w, event, K3.state.closed)
      const before = w.service.list()
      assert.deepEqual(await answer(w, event, ANSWER.allow), refused(CODE.expired))
      assertUnchanged(w, before)
    })
    row(sdk, ID.uc01, 'E3', `settled before it was filed (${how}) → ask_user answers expired and no card is filed`, async (t) => {
      const w = await worldFor(t, sdk)
      const event = askEvent()
      await w.poll(event, closer(event))
      assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.expired))
      assert.deepEqual(w.service.list(), [])
    })
  }
  row(sdk, ID.uc01, 'E4', 'the link is down when the user answers → disconnected, the card stays open, and a later answer commits once', async (t) => {
    const w = await worldFor(t, sdk)
    const event = await openCard(w)
    w.link.answers.push(refused(CODE.disconnected))
    assert.deepEqual(await answer(w, event, ANSWER.reject), refused(CODE.disconnected))
    assertCard(w, event, K3.state.open)
    assert.deepEqual(await answer(w, event, ANSWER.reject), ok)
    assertCard(w, event, K3.state.answered)
    assert.equal(w.link.sent().length, 2, 'the retry was not sent')
  })
  row(sdk, ID.uc01, 'E5', 'two concurrent answers to one open card → one approval_answer; the second answers already-settled (first commit wins)', async (t) => {
    const w = await worldFor(t, sdk)
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
  row(sdk, ID.uc07, 'post', 'exactly one answer was committed for the ask, however many times the user answers', async (t) => {
    const w = await worldFor(t, sdk)
    const event = await openCard(w)
    assert.deepEqual(await answer(w, event, ANSWER.allow), ok)
    for (const choice of ANSWER.choices) assert.deepEqual(await answer(w, event, choice), refused(CODE.alreadySettled))
    assert.equal(w.link.sent().length, 1)
  })

  // ============================================================== ASK-UC-02: the routes
  row(sdk, ID.uc02, 'main 1', 'the module registers exactly the events (GET) and answer (POST) routes, each with a request body mode', async (t) => {
    const w = await worldFor(t, sdk)
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
  row(sdk, ID.uc02, 'main 2', 'GET events: an SSE stream whose first frame has the manager session id and the cards at once, then one frame per change', async (t) => {
    const w = await worldFor(t, sdk)
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
    assert.equal(after.cards.find((c) => c.approvalId === approvalIdOf(existing))?.state, K3.state.answered)
  })
  row(sdk, ID.uc02, 'main 3', 'POST answer {approvalId, choice, text} → 200 {ok:true}, committed as the service commits it', async (t) => {
    const w = await worldFor(t, sdk)
    const event = await openCard(w)
    const { routes, dispose } = routesFor(w)
    t.after(dispose)
    const response = await routes.get(ROUTE.answer).fetch(request(ROUTE.answer, ROUTE.post, { approvalId: approvalIdOf(event), choice: ANSWER.reject, text: FIXTURE.text }))
    assert.equal(response.status, ROUTE.status.ok)
    assert.deepEqual(await response.json(), ok)
    assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(event, ANSWER.reject, FIXTURE.text)])
    assertCard(w, event, K3.state.answered)
  })
  for (const [part, title, body, status, code] of [
    ['E1 refused', 'a refusal (an unknown card) → 409 {ok:false, code: expired}', () => ({ approvalId: FIXTURE.unknownApproval, choice: ANSWER.allow }), ROUTE.status.conflict, CODE.expired],
    ['E1 invalid', 'a choice that is not offered → 400 invalid-arguments', (e) => ({ approvalId: approvalIdOf(e), choice: ANSWER.allow.toUpperCase() }), ROUTE.status.badRequest, CODE.invalidArguments],
    ['E1 unreadable', 'an unreadable body → 400', () => FIXTURE.unreadableBody, ROUTE.status.badRequest, undefined],
  ]) {
    row(sdk, ID.uc02, part, `POST answer: ${title}; nothing is sent and the card stays open`, async (t) => {
      const w = await worldFor(t, sdk)
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
  row(sdk, ID.uc02, 'E2', 'the routes\' disposer withdraws both routes and ends an open stream', async (t) => {
    const w = await worldFor(t, sdk)
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
  row(sdk, ID.uc03, 'main', 'a new store over the same table lists the same cards and states; the answered one stays answered, the open one commits once', async (t) => {
    const w = await worldFor(t, sdk)
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
  row(sdk, ID.uc03, 'A1', 'after a restart a settlement naming a filed open card still closes it', async (t) => {
    const w = await worldFor(t, sdk)
    const event = await openCard(w)
    await w.restart()
    await w.poll(settlementOf(approvalIdOf(event)))
    assertCard(w, event, K3.state.closed)
  })

  // ============================================================== ASK-UC-04: nothing in the main DSH
  row(sdk, ID.uc04, 'main 1', 'client.asks.js exists and ships in core\'s package.json files', () => {
    assert.ok(fs.existsSync(SUBJECT.chunk.file), 'packages/core/client.asks.js does not exist')
    const { files } = JSON.parse(fs.readFileSync(SUBJECT.coreManifest, SWEEP.encoding))
    assert.ok(files.some((f) => f === SUBJECT.chunk.name || path.matchesGlob(SUBJECT.chunk.name, f)), `core's files ${json(files)} do not ship ${SUBJECT.chunk.name}`)
  })
  row(sdk, ID.uc04, 'main 2', 'client.asks.js is a flat chunk of core\'s own client (id fishball-core, chunk client.asks.js), not a row of its own', () => {
    const loads = []
    // A browser global: `window`, `self` and `globalThis` are one object holding the loader.
    const sandbox = vm.createContext({ __ModuleLoader__: { load: (spec) => loads.push(spec) } })
    vm.runInContext(`globalThis.window = globalThis; globalThis.self = globalThis`, sandbox)
    vm.runInContext(fs.readFileSync(SUBJECT.chunk.file, SWEEP.encoding), sandbox)
    assert.equal(loads.length, 1, 'the chunk does not load exactly once')
    assert.equal(loads[0].id, SUBJECT.chunk.owner)
    assert.equal(loads[0].chunk, SUBJECT.chunk.name)
    assert.equal(typeof loads[0].factory, 'function')
  })
  row(sdk, ID.uc04, 'main 3', 'no main-DSH package (connector, embed-UI, instance) names the card chunk or the card routes', () => {
    const hits = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === SWEEP.skip) continue
        const file = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(file)
        else if (SWEEP.files.test(entry.name)) {
          const text = fs.readFileSync(file, SWEEP.encoding)
          for (const needle of MAIN_DSH_FORBIDDEN) if (text.includes(needle)) hits.push(`${path.relative(REPO, file)}: ${needle}`)
        }
      }
    }
    for (const pkg of MAIN_DSH_PACKAGES) walk(path.join(REPO, pkg))
    assert.deepEqual(hits, [])
  })

  // ============================================================== ASK-UC-05: onChange
  row(sdk, ID.uc05, 'main', 'onChange calls fn(cards) with list() after filing, answering and closing; its disposer stops the calls', async (t) => {
    const w = await worldFor(t, sdk)
    const seen = []
    const dispose = w.service.onChange((cards) => seen.push(structuredClone(cards)))
    const answered = await openCard(w)
    assert.deepEqual(seen.at(-1), structuredClone(w.service.list()), 'no call after filing')
    const closed = await openCard(w)
    await answer(w, answered, ANSWER.allow)
    assert.equal(seen.at(-1).find((c) => c.approvalId === approvalIdOf(answered)).state, K3.state.answered, 'no call after answering')
    await w.poll(settlementOf(approvalIdOf(closed)))
    assert.deepEqual(seen.at(-1), structuredClone(w.service.list()), 'no call after closing')
    dispose()
    const count = seen.length
    await openCard(w)
    assert.equal(seen.length, count, 'a disposed listener was called')
  })
  row(sdk, ID.uc05, 'E1', 'a throwing listener affects no other listener and no operation', async (t) => {
    const w = await worldFor(t, sdk)
    w.service.onChange(() => { throw new Error(FIXTURE.listenerFault) })
    const seen = []
    w.service.onChange((cards) => seen.push(cards))
    const event = await openCard(w)
    assert.equal(seen.length > 0, true, 'the second listener was not called')
    assert.deepEqual(await answer(w, event, ANSWER.allow), ok)
    assert.equal(seen.at(-1).find((c) => c.approvalId === approvalIdOf(event)).state, K3.state.answered)
  })

  // ============================================================== ASK-UC-06: following the link
  row(sdk, ID.uc06, 'main', 'createAsks follows the link once; close() stops it, and an ask polled afterwards is unknown', async (t) => {
    const w = await worldFor(t, sdk)
    assert.equal(w.link.subscriptions, 1)
    assert.equal(w.link.listeners, 1)
    await w.closeAsks()
    assert.equal(w.link.listeners, 0, 'close() did not stop following the link')
    const event = askEvent()
    await w.poll(event)
    assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.unknownOffer))
  })

  // ============================================================== ASK-EP-01: ask_user arguments
  row(sdk, ID.ep01, 'definition', 'the tool is a DSH tool definition named ask_user; ASKS and CARD_STATE carry the frozen values', async () => {
    const mod = await asksModule(sdk)
    const constants = exported(mod, 'constants')
    assert.equal(constants.tool, ASK_TOOL.name)
    assert.equal(constants.defaultReason, ANSWER.defaultReason)
    assert.deepEqual(Object.values(exported(mod, 'states')).sort(), Object.values(K3.state).sort())
  })
  row(sdk, ID.ep01, 'definition (tool)', 'createAsks\' tool has name, description, parameters, output and execute', async (t) => {
    const w = await worldFor(t, sdk)
    assert.equal(w.tool.name, ASK_TOOL.name)
    assert.equal(typeof w.tool.description, 'string')
    assert.equal(typeof w.tool.parameters, 'object')
    assert.equal(typeof w.tool.output, 'object')
    assert.equal(typeof w.tool.execute, 'function')
  })
  for (const [partition, args] of INVALID_TOOL_ARGS) {
    row(sdk, ID.ep01, partition, `ask_user with ${partition} → invalid-arguments, no card`, async (t) => {
      const w = await worldFor(t, sdk)
      await w.poll(askEvent())
      assert.deepEqual(await w.tool.execute(args), refused(CODE.invalidArguments))
      assert.deepEqual(w.service.list(), [])
    })
  }
  row(sdk, ID.ep01, 'never seen', 'ask_user with an offer id no polled ask carries → unknown-offer, no card', async (t) => {
    const w = await worldFor(t, sdk)
    const polled = askEvent()
    await w.poll(polled)
    assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(askEvent()) }), refused(CODE.unknownOffer))
    assert.deepEqual(w.service.list(), [])
  })
  row(sdk, ID.ep01, 'not an ask', 'ask_user with the offer id of a permission event (not an ask) → unknown-offer, no card', async (t) => {
    const w = await worldFor(t, sdk)
    const permission = askEvent({ type: EVENT_TYPE.permission })
    await w.poll(permission)
    assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(permission) }), refused(CODE.unknownOffer))
    assert.deepEqual(w.service.list(), [])
  })
  row(sdk, ID.ep01, 'a seen ask', 'ask_user with a polled ask\'s offer id → {ok:true, card}, the card list() shows', async (t) => {
    const w = await worldFor(t, sdk)
    const event = askEvent()
    const filed = await w.file(event)
    assert.equal(filed.ok, true)
    assert.deepEqual({ ...filed.card, choices: [...filed.card.choices] }, expectedCard(event, K3.state.open))
    assertCard(w, event, K3.state.open)
  })

  // ============================================================== ASK-EP-02: card fields
  row(sdk, ID.ep02, 1, 'every field comes from the event: ids and question from the descriptor, sessionId from sourceSessionId, askedAt from the descriptor\'s at', async (t) => {
    const w = await worldFor(t, sdk)
    const event = await openCard(w, { sourceSessionId: FIXTURE.otherSession })
    assertCard(w, event, K3.state.open)
  })
  row(sdk, ID.ep02, 2, 'an empty descriptor title → sessionTitle null', async (t) => {
    const w = await worldFor(t, sdk)
    const event = await openCard(w, { title: FIXTURE.emptyTitle })
    assert.equal(w.card(approvalIdOf(event)).sessionTitle, null)
  })
  row(sdk, ID.ep02, 3, 'a descriptor with its own choices → the card still offers exactly allow, reject (Q3 = A)', async (t) => {
    const w = await worldFor(t, sdk)
    const event = await openCard(w, { choices: FIXTURE.otherChoices })
    assert.deepEqual([...w.card(approvalIdOf(event)).choices], [...ANSWER.choices])
  })

  // ============================================================== ASK-EP-03: invalid answers
  for (const [partition, value] of INVALID_ANSWERS) {
    row(sdk, ID.ep03, partition, `an answer that is ${partition} → invalid-arguments; nothing sent, the card stays open`, async (t) => {
      const w = await worldFor(t, sdk)
      const event = await openCard(w)
      const before = w.service.list()
      assert.deepEqual(await w.service.answer(approvalIdOf(event), value), refused(CODE.invalidArguments))
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
    row(sdk, ID.ep04, part, title, async (t) => {
      const w = await worldFor(t, sdk)
      const event = await openCard(w)
      await w.poll(eventFor(event))
      assertCard(w, event, state)
      assert.deepEqual(w.link.sent(), [])
    })
  }

  // ============================================================== ASK-BVA-01: the reason
  for (const [partition, text, reason] of REASON_ROWS) {
    row(sdk, ID.bva01, partition, `the user's text ${partition} → reason ${reason === undefined ? 'is the fixed line' : json(reason)}`, async (t) => {
      const w = await worldFor(t, sdk)
      const event = await openCard(w)
      assert.deepEqual(await answer(w, event, ANSWER.allow, text), ok)
      assert.deepEqual(w.link.sent().map((c) => c.args), [answerArgs(event, ANSWER.allow, reason ?? ANSWER.defaultReason)])
    })
  }

  // ============================================================== ASK-BVA-02: 48 h (see PLAT-UC-07 E1), and just after filing
  row(sdk, ID.bva02, 'filed at once', 'a card answered right after filing commits (no minimum wait)', async (t) => {
    const w = await worldFor(t, sdk)
    const event = await openCard(w)
    assert.deepEqual(await answer(w, event, ANSWER.reject), ok)
  })

  // ============================================================== ASK-DT-01: the answer object
  for (const choice of ANSWER.choices) {
    for (const [given, text] of [['with a reason', FIXTURE.text], ['without a reason', undefined]]) {
      row(sdk, ID.dt01, `${choice} ${given}`, `${choice} ${given} → {decision: ${choice}, risk: ${ANSWER.riskOf[choice]}, reason: ${text === undefined ? 'the fixed line' : 'the text'}}`, async (t) => {
        const w = await worldFor(t, sdk)
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
    row(sdk, ID.dt02, rule, `the connector answers ${rule} → the user gets ${json(result)}; the card is ${state}`, async (t) => {
      const w = await worldFor(t, sdk)
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
    row(sdk, ID.dt03, `answer on ${rule}`, `an answer on an ${rule} → ${code}; nothing changes, nothing is sent`, async (t) => {
      const w = await worldFor(t, sdk)
      const event = await openCard(w)
      await prepare(w, event)
      const before = w.service.list()
      const sent = w.link.sent().length
      assert.deepEqual(await answer(w, event, ANSWER.reject, FIXTURE.text), refused(code))
      assertUnchanged(w, before, sent)
    })
    row(sdk, ID.dt03, `ask_user on ${rule}`, `ask_user on an ${rule} → expired; the card is unchanged`, async (t) => {
      const w = await worldFor(t, sdk)
      const event = await openCard(w)
      await prepare(w, event)
      const before = w.service.list()
      assert.deepEqual(await w.tool.execute({ [ASK_TOOL.arg]: offerOf(event) }), refused(CODE.expired))
      assert.deepEqual(w.service.list(), before)
    })
  }
  row(sdk, ID.dt03, 'unknown approvalId', 'an answer for an approvalId with no card → expired; nothing is sent', async (t) => {
    const w = await worldFor(t, sdk)
    const polledOnly = askEvent()
    await w.poll(polledOnly)
    assert.deepEqual(await answer(w, polledOnly, ANSWER.allow), refused(CODE.expired))
    assertUnchanged(w, [])
  })

  // ============================================================== ASK-ST-01: state transitions
  row(sdk, ID.st01, 'open → open (replay)', 'a replay of the ask event (same eventId) leaves the one open card as it was', async (t) => {
    const w = await worldFor(t, sdk)
    const event = await openCard(w)
    const before = w.service.list()
    await w.poll(event)
    assert.deepEqual(w.service.list(), before)
  })
  row(sdk, ID.st01, 'open → open → answered', 'a refusal that keeps the card open, then an answer that commits → answered', async (t) => {
    const w = await worldFor(t, sdk)
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
    row(sdk, ID.st01, `answered → answered (${label})`, `an answered card stays answered on ${label}`, async (t) => {
      const w = await worldFor(t, sdk)
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
    row(sdk, ID.st01, `closed → closed (${label})`, `a closed card stays closed on ${label}`, async (t) => {
      const w = await worldFor(t, sdk)
      const event = await openCard(w)
      await w.poll(retirementOf(event.eventId))
      await w.poll(later(event))
      assertCard(w, event, K3.state.closed)
    })
  }
  row(sdk, ID.st01, 'one card per ask', 'two asks give two independent cards: answering one leaves the other open', async (t) => {
    const w = await worldFor(t, sdk)
    const first = await openCard(w)
    const second = await openCard(w)
    await answer(w, first, ANSWER.allow)
    assertCard(w, first, K3.state.answered)
    assertCard(w, second, K3.state.open)
  })
}
