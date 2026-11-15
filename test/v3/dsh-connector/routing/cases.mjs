/**
 * C-ROUTE black-box cases (.runtime/reports/v3-w3-briefs.md "C-ROUTE test brief"; v3-tasks.md row
 * C-ROUTE, wave W3). Written from the requirements (R-EVS-02/03, R-ROUTE-01…06, R-WATCH-01/02/04/05,
 * R-CON-03/08/09/11, R-SEC-01, R-ARCH-03), the case files (docs/test-design/v3/03-handover.md,
 * 04-events-interception.md, 06-watch.md, 11-platform.md), the K1 / K1c freeze
 * (`dsh-connector/mcp-schema`: Router, Presence, ManagedState, MANAGED_REFUSAL, QUEUE,
 * NoRecipient) and K3 (`host-services/handover.d.ts`), and Fishball's answers of 2026-11-14
 * (constants.mjs RELAYED). No file of packages/dsh-connector/src/routing/ or src/handover/ was read.
 *
 * Techniques, and only these five, Use Cases first: UC (WATCH-UC-01, WATCH-UC-02, HAND-UC-02
 * service part, PLAT-UC-03: one test per flow), EP (EVT-EP-01, EVT-EP-04 end to end, WATCH-EP-01,
 * HAND-EP-01, ROUTE-EP-01), BVA (ROUTE-BVA-01), DT (EVT-DT-01, HAND-DT-01, HAND-DT-02, ROUTE-DT-01,
 * ROUTE-DT-02) and ST (HAND-ST-01, WATCH-ST-01 rows 1–6, ROUTE-ST-01, ROUTE-ST-02). The ROUTE-* ids
 * are this suite's own: rules K1c and K3 freeze that no case file numbers (ManagedState, the
 * no-recipient queue, principals(), onChange).
 *
 * Not here (the brief): WATCH-UC-01 E1 and WATCH-ST-01 rows 7–8 are C-TOOLS'; the `system` notes
 * of revocation are C-REVOKE's (the rows assert only that management ends); succession rows are
 * C-SUCCEED's `todo`.
 *
 * Level: C-ROUTE's module over real DSH storage and the real C-MAILBOX of the SDK under test, with
 * the other ports faked (subject.mjs); EVT-EP-04 adds the real C-HTTP route and SDK MCP clients.
 * Rows that need a later task are `todo` and name it. The tests fail until C-ROUTE's module exists.
 *
 * Oracles:
 * - "one event to X" = across **every** mailbox of the world, exactly one new entry, in X's, of that
 *   type (EVT-DT-01 rule 9); "nothing produced" = no new entry in any mailbox after WAIT.quietMs;
 * - "refused" = README's common oracle: the code, the managed set unchanged, no event, and no
 *   entry label, credential ref or token value in the answer;
 * - "connected" = an open listen stream on `dsh-agent://events` (K1 CONNECTED; here FakePresence).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { listener } from '../mcp-http/cases.mjs'
import { httpWorld } from '../mcp-http/subject.mjs'
import {
  CONNECTED, CONTRIBUTED, DECISION_KIND_OF, EVENT_TYPE, FALLBACK, FIXTURE, HANDOVER, LATER, MAILBOX, MANAGED_REFUSAL, OFFER_ID, OFFER_TYPES,
  PATHS, QUEUE, REFUSAL, RELAYED, REQUEST_GATE, RETIREMENT_REASON, REVOCATION, TOOL_NAMES, WAIT, formatOfferId, handoverCodes,
} from './constants.mjs'
import { MUTATION, RETIRE_OUTCOME, SETTLED_BY, SETTLEMENT_OUTCOME, SETTLE_FIXTURE } from './constants.mjs'
import { gatedMailboxPort, lateAckPort } from './fakes.mjs'
import { cordisContext, routeWorld } from './subject.mjs'

const T = { timeout: WAIT.testMs }
const { ids: ID, sessions: S, names: NAME } = FIXTURE
const ET = EVENT_TYPE

// ------------------------------------------------------------------------------------------------
// Row registration

/** One test per case row, named as every V3 suite names them; `todo` names the owning task. */
function row(sdk, id, part, title, fn, todo) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, T, fn)
}
/** A row on a fresh C-ROUTE world. */
const worldRow = (sdk, id, part, title, fn) => row(sdk, id, part, title, async (t) => fn(await routeWorld(t, sdk), t))
const todoRow = (sdk, id, part, title, owner) => row(sdk, id, part, title, null, owner)

// ------------------------------------------------------------------------------------------------
// Observation: every mailbox of the world

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const quiet = () => sleep(WAIT.quietMs)
/** Waits until `cond()` (sync or async) is truthy; fails after WAIT.eventMs naming `what`. */
export async function until(cond, what) {
  const end = Date.now() + WAIT.eventMs
  while (!(await cond())) {
    assert.ok(Date.now() < end, `${what} within ${WAIT.eventMs} ms`)
    await sleep(WAIT.pollMs)
  }
}
/** Whether `promise` settles within `ms`. */
export const settlesWithin = (promise, ms) => Promise.race([promise.then(() => true, () => true), sleep(ms).then(() => false)])

/** Every pending event of `key`'s mailbox, read with C-MAILBOX's poll at its largest page. */
export async function pendingOf(w, key) {
  const events = []
  let cursor
  for (;;) {
    const page = await w.realMailbox.poll(key, cursor, MAILBOX.pageMax)
    assert.equal(page?.ok, true, `poll of ${key} refused: ${JSON.stringify(page)}`)
    events.push(...page.events)
    if (!page.hasMore) return events
    cursor = page.nextCursor
  }
}
/** Every pending entry of every mailbox the world made: [{key, e}]. */
export async function allEntries(w) {
  const out = []
  for (const key of w.keys) for (const e of await pendingOf(w, key)) out.push({ key, e })
  return out
}
/**
 * Runs `act` and returns `{value, fresh}`: `act`'s value and the entries that are new in any
 * mailbox, once `n` have appeared and WAIT.quietMs passed with no more (EVT-DT-01 rule 9).
 */
export async function expectEntries(w, act, n) {
  const before = new Set((await allEntries(w)).map((x) => x.e.eventId))
  const value = await act()
  const fresh = async () => (await allEntries(w)).filter((x) => !before.has(x.e.eventId))
  if (n > 0) await until(async () => (await fresh()).length >= n, `${n} new mailbox entr${n === 1 ? 'y' : 'ies'}`)
  await quiet()
  const got = await fresh()
  assert.equal(got.length, n, `expected ${n} new entries across every mailbox, got ${JSON.stringify(got.map((x) => [x.key, x.e.type]))}`)
  return { value, fresh: got }
}
/** Exactly one new entry across every mailbox: in `key`'s, of `type`. Returns `{value, event}`. */
export async function expectOne(w, act, key, type) {
  const { value, fresh } = await expectEntries(w, act, 1)
  assert.deepEqual([fresh[0].key, fresh[0].e.type], [key, type], 'the one event went to the wrong pair or has the wrong type')
  return { value, event: fresh[0].e }
}
export const expectNone = (w, act) => expectEntries(w, act, 0)

/** The managed set as sorted plain data (ManagedState.managed() is in no particular order). */
export const managedSet = (w) => [...w.managed.managed()].map((r) => ({ sessionId: r.sessionId, principalKey: r.principalKey })).sort((a, b) => a.sessionId.localeCompare(b.sessionId))
/** Entry labels and credential refs, which no answer may carry (README common oracle). */
const secretsOf = (w) => w.tokens.list().flatMap((e) => [e.label, e.ref])
function assertNoLeak(w, value) {
  const text = JSON.stringify(value)
  for (const secret of secretsOf(w)) assert.ok(!text.includes(secret), `the answer leaks ${secret}`)
}
/** README's refusal oracle: code, nothing produced, managed set unchanged, nothing leaked. */
async function assertRefused(w, act, code) {
  const before = managedSet(w)
  const { value } = await expectNone(w, act)
  assert.equal(value?.ok, false, `not refused: ${JSON.stringify(value)}`)
  assert.equal(value.code, code)
  assert.deepEqual(managedSet(w), before, 'a refusal changed the managed set')
  assertNoLeak(w, value)
  return value
}

// ------------------------------------------------------------------------------------------------
// Steps (each states one oracle once)

let counter = 0
/** A K1 offer descriptor for `type` (shapes.js `descriptor`): its offerId is `<approvalId>.r1`. */
export function descriptor(type) {
  const n = ++counter
  const approvalId = FIXTURE.offerPrefix + n
  return {
    approvalId, offerId: formatOfferId(approvalId, OFFER_ID.firstRevision), kind: DECISION_KIND_OF[type], prompt: FIXTURE.text(n),
    choices: [], title: FIXTURE.text(n), at: FIXTURE.epochMs, toolName: FIXTURE.toolName, callId: null, reason: FIXTURE.text(n), quotes: [],
  }
}
const message = () => ({ text: FIXTURE.text(++counter), images: [] })
const designate = (w, id) => w.settings.set({ agentToken: FIXTURE.entry(id) })
/**
 * A revocation of entry `id` (`kind`: REVOCATION.disabled or .deleted) as C-REVOKE runs it: the
 * token change, then `routing.endPrincipal`, which C-REVOKE's own onRevoked handler calls (routing
 * no longer subscribes to onRevoked; disable → fresh retirements, delete → none). Resolves undefined.
 */
async function revokeEntry(w, id, kind) {
  if (kind === REVOCATION.deleted) w.tokens.remove(id)
  else w.tokens.disable(id)
  await w.routing.endPrincipal(FIXTURE.entry(id), { freshRetirements: kind !== REVOCATION.deleted })
}

export async function manage(w, sessionId, key) {
  const result = await w.managed.manage(sessionId, key)
  assert.deepEqual(result, { ok: true }, `manage refused: ${JSON.stringify(result)}`)
}
/** A Hand over that succeeds: one `handover {sessionId, note}` to `key`, and `key` manages. */
async function handOverOk(w, sessionId, key, note = FIXTURE.note) {
  const { value, event } = await expectOne(w, () => w.handover.handOver(sessionId, key, note), key, ET.handover)
  assert.equal(value?.ok, true, `handOver refused: ${JSON.stringify(value)}`)
  assert.deepEqual(Object.keys(value.principal).sort(), [...HANDOVER.refFields].sort())
  assert.equal(value.principal.key, key)
  assert.deepEqual(event.payload, { sessionId, note })
  assert.equal(w.managed.managerOf(sessionId), key)
  return event
}
/** A Take back that succeeds: one `takeback {sessionId, note}` to `key`, the manager until then. */
async function takeBackOk(w, sessionId, key, note = FIXTURE.note) {
  const { value, event } = await expectOne(w, () => w.handover.takeBack(sessionId, note), key, ET.takeback)
  assert.deepEqual(value, { ok: true })
  assert.deepEqual(event.payload, { sessionId, note })
  assert.equal(w.managed.managerOf(sessionId), undefined)
  return event
}
/** One turn end of `sessionId`: exactly one `turn-finished {sessionId, running, queued}`, to `key`. */
async function turnTo(w, sessionId, key, flags = { running: false, queued: false }) {
  const { event } = await expectOne(w, () => w.sessions.finishTurn(sessionId, flags), key, ET.turnFinished)
  assert.deepEqual(event.payload, { sessionId, ...flags })
  return event
}
/** One state change of `sessionId`: exactly one `state {sessionId, running, pendingInteraction}`, to `key`. */
async function stateTo(w, sessionId, key, flags = { running: true, pendingInteraction: false }) {
  const { event } = await expectOne(w, () => w.sessions.changeState(sessionId, flags), key, ET.state)
  assert.deepEqual(event.payload, { sessionId, ...flags })
  return event
}
/** A turn end and a state change of `sessionId` produce nothing, for anyone (R-WATCH-02). */
export async function unwatched(w, sessionId) {
  await expectNone(w, () => { w.sessions.finishTurn(sessionId); w.sessions.changeState(sessionId, { running: true }) })
}
/** An offer that becomes an event in `key`'s mailbox (offer and correlation id = its offerId). */
export async function offerTo(w, sessionId, type, key) {
  const d = descriptor(type)
  const { value, event } = await expectOne(w, () => w.routing.offer(sessionId, type, d), key, type)
  assert.equal(value?.recipient, key)
  assert.deepEqual([event.offer?.offerId, event.correlationId, event.sourceSessionId], [d.offerId, d.offerId, sessionId])
  return event
}
/** An offer with no principal recipient: `{recipient: null, fallback}`, nothing produced. */
export async function offerFallsBack(w, sessionId, type, fallback) {
  const { value } = await expectNone(w, () => w.routing.offer(sessionId, type, descriptor(type)))
  assert.deepEqual(value, { recipient: null, fallback })
}
/** A `message_agent` that becomes one `message` in `key`'s mailbox. */
export async function messageTo(w, sessionId, key) {
  const m = message()
  const { value, event } = await expectOne(w, () => w.routing.messageAgent(sessionId, m), key, ET.message)
  assert.deepEqual(value, { ok: true })
  assert.deepEqual(event.payload, m)
  return event
}
/** A `message_agent` that is accepted and held in the no-recipient queue (nothing in any mailbox). */
async function messageHeld(w, sessionId = S.s1) {
  const m = message()
  const { value } = await expectNone(w, () => w.routing.messageAgent(sessionId, m))
  assert.deepEqual(value, { ok: true })
  return m
}
/** An `ask_agent` that becomes one `ask` offer in `key`'s mailbox and keeps the asker waiting. */
export async function askTo(w, sessionId, key) {
  const { value, event } = await expectOne(w, () => ({ promise: w.routing.askAgent(sessionId, { question: FIXTURE.question }) }), key, ET.ask)
  assert.equal(event.offer?.decisionKind, DECISION_KIND_OF[ET.ask])
  assert.equal(await settlesWithin(value.promise, WAIT.quietMs), false, 'ask_agent did not wait for its answer')
  return { event, promise: value.promise }
}
/** An `ask_agent` answered `unavailable` at once, with nothing produced (R-CON-09). */
async function askUnavailable(w, sessionId) {
  const { value } = await expectNone(w, () => ({ promise: w.routing.askAgent(sessionId, { question: FIXTURE.question }) }))
  assert.ok(await settlesWithin(value.promise, WAIT.quietMs), 'ask_agent did not answer at once')
  assert.deepEqual(await value.promise, { ok: false, code: REFUSAL.unavailable })
}
/** The texts of the `message` events now pending in `key`'s mailbox, in mailbox order. */
const messageTexts = async (w, key) => (await pendingOf(w, key)).filter((e) => e.type === ET.message).map((e) => e.payload.text)
/** Every public member of `o`, own or inherited (a class instance's methods too), sorted. */
function memberNames(o) {
  const names = new Set()
  for (let x = o; x !== null && x !== Object.prototype; x = Object.getPrototypeOf(x)) {
    for (const k of Object.getOwnPropertyNames(x)) if (k !== 'constructor') names.add(k)
  }
  return [...names].sort()
}
/** Counts `onChange` calls of `source` (K3 handover or K1c ManagedState). */
export function counting(source) {
  const seen = { n: 0 }
  seen.dispose = source.onChange(() => { seen.n += 1 })
  return seen
}

/**
 * How a watch ends (R-WATCH-01, R-ROUTE-06): release, Take back, the entry disabled or deleted.
 * Revocation ends management through routing.endPrincipal (RELAYED.revocation, revokeEntry); its `system` note is C-REVOKE's, and on
 * delete C-REVOKE drops the mailbox, so "queued events stay with P" is asserted for release and
 * Take back only (R-WATCH-04).
 */
const ENDINGS = Object.freeze({
  release: { keepsQueued: true, end: async (w, s, p) => assert.deepEqual(await w.managed.release(s, p), { ok: true }) },
  takeBack: { keepsQueued: true, end: (w, s, p) => takeBackOk(w, s, p) },
  disabled: { keepsQueued: false, end: (w) => revokeEntry(w, ID.p, REVOCATION.disabled) },
  deleted: { keepsQueued: false, end: async (w) => { await revokeEntry(w, ID.p, REVOCATION.deleted); await w.pairs.remove(FIXTURE.entry(ID.p)) } },
})
/** P manages S1 and has one turn-finished queued; `ending` ends the watch; nothing later is produced. */
async function watchEnds(w, ending) {
  const p = w.principal(ID.p, { connected: true })
  w.principal(ID.d, { connected: true, designated: true })
  w.session(S.s1)
  await manage(w, S.s1, p)
  const queued = await turnTo(w, S.s1, p)
  await ending.end(w, S.s1, p)
  await until(() => w.managed.managerOf(S.s1) === undefined, 'S1 unmanaged')
  if (ending.keepsQueued) assert.ok((await pendingOf(w, p)).some((e) => e.eventId === queued.eventId), 'an event queued for P before the end left its mailbox')
  await unwatched(w, S.s1)
}

/** A world with P (connected) managing S1 and D designated (connected): the common start. */
export async function managedByP(w, { pConnected = true } = {}) {
  const p = w.principal(ID.p, { connected: pConnected })
  const d = w.principal(ID.d, { connected: true, designated: true })
  w.session(S.s1)
  await manage(w, S.s1, p)
  return { p, d }
}

// ================================================================================================
// Use Cases
// ================================================================================================

function useCases(sdk) {
  // WATCH-UC-01 — A principal automatically watches a session it starts (E1 is C-TOOLS').
  worldRow(sdk, 'WATCH-UC-01', 'main 1-2', 'P starts S1 (ManagedState.manage, no watch argument); a turn ends with nothing queued → P gets one turn-finished {running: false, queued: false}', async (w) => {
    const { p } = await managedByP(w)
    await turnTo(w, S.s1, p, { running: false, queued: false })
  })
  worldRow(sdk, 'WATCH-UC-01', 'main 3', 'every change of S1\'s running or pending-interaction state gives P one state event', async (w) => {
    const { p } = await managedByP(w)
    for (const flags of [{ running: true, pendingInteraction: false }, { running: true, pendingInteraction: true }, { running: false, pendingInteraction: false }]) await stateTo(w, S.s1, p, flags)
  })
  worldRow(sdk, 'WATCH-UC-01', 'A1', 'a turn that ends at once after P starts managing S1 is still reported to P', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    const { event } = await expectOne(w, async () => { await manage(w, S.s1, p); w.sessions.finishTurn(S.s1) }, p, ET.turnFinished)
    assert.equal(event.payload.sessionId, S.s1)
  })
  todoRow(sdk, 'WATCH-UC-01', 'A1 (DSH)', 'session_message on an idle S1 whose turn ends at once: the watermark is read before the message on a real DSH session', LATER.wire)
  worldRow(sdk, 'WATCH-UC-01', 'A2', 'a turn ends while a message is queued → turn-finished with queued: true', async (w) => {
    const { p } = await managedByP(w)
    await turnTo(w, S.s1, p, { running: true, queued: true })
  })
  worldRow(sdk, 'WATCH-UC-01', 'post', 'no other principal (D included) received any turn-finished / state of S1', async (w) => {
    const { p, d } = await managedByP(w)
    w.principal(ID.q, { connected: true })
    await turnTo(w, S.s1, p)
    await stateTo(w, S.s1, p)
    assert.deepEqual((await pendingOf(w, d)).concat(await pendingOf(w, FIXTURE.principal(ID.q))), [])
  })

  // WATCH-UC-02 — A watch ends with management.
  worldRow(sdk, 'WATCH-UC-02', 'main', 'P calls session_release → events already queued for P stay; S1\'s later turns produce nothing for anyone', (w) => watchEnds(w, ENDINGS.release))
  worldRow(sdk, 'WATCH-UC-02', 'A1', 'Take back by the user → the same', (w) => watchEnds(w, ENDINGS.takeBack))
  worldRow(sdk, 'WATCH-UC-02', 'A2', `P's entry revoked → management ends (${RELAYED.revocation})`, (w) => watchEnds(w, ENDINGS.disabled))
  todoRow(sdk, 'WATCH-UC-02', 'A2 note', 'P\'s entry revoked → plus one system note in S1', LATER.revokeNote)

  // HAND-UC-02 — The user takes a session back (service part; the marks are U-MARKS').
  worldRow(sdk, 'HAND-UC-02', 'main', 'Take back of S1 handed to P(E2): one takeback to P(E2), S1 unmanaged, onChange fires', async (w) => {
    const p2 = w.principal(ID.q, { connected: true })
    w.session(S.s1)
    await handOverOk(w, S.s1, p2)
    const seen = counting(w.handover)
    await takeBackOk(w, S.s1, p2)
    assert.ok(seen.n >= 1, 'onChange did not fire on Take back')
    assert.deepEqual(w.handover.managed(), [])
  })
  worldRow(sdk, 'HAND-UC-02', 'A1', 'events queued for P(E2) before Take back stay in its mailbox; no later turn-finished / state of S1 for anyone', (w) => watchEnds(w, ENDINGS.takeBack))
  worldRow(sdk, 'HAND-UC-02', 'E1', `S1 unmanaged → refused ${HANDOVER.codes.notManaged}, no event`, async (w) => {
    w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await assertRefused(w, () => w.handover.takeBack(S.s1), HANDOVER.codes.notManaged)
  })
  worldRow(sdk, 'HAND-UC-02', 'post', 'after Take back S1\'s permission request goes to the user, and its message_agent to the designated Fishball', async (w) => {
    const { p, d } = await managedByP(w)
    await takeBackOk(w, S.s1, p)
    await offerFallsBack(w, S.s1, ET.permission, FALLBACK.toUser)
    await messageTo(w, S.s1, d)
  })
  todoRow(sdk, 'HAND-UC-02', 'main 3', 'the mark disappears and S1 shows the Hand over control again (R-UI-10)', 'U-MARKS (embed-UI marks and the Hand over control)')

  // PLAT-UC-03 — A main-DSH session calls message_agent / ask_agent.
  worldRow(sdk, 'PLAT-UC-03', 'main', 'unmanaged S1: message_agent → one message for D; ask_agent → one ask for D, and S1 waits', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    await messageTo(w, S.s1, d)
    await askTo(w, S.s1, d)
  })
  todoRow(sdk, 'PLAT-UC-03', 'main answer', 'the waiting ask_agent gets D\'s answer', LATER.toolsAnswer)
  worldRow(sdk, 'PLAT-UC-03', 'A1', 'S1 managed by P → both go to P, never D', async (w) => {
    const { p } = await managedByP(w)
    await messageTo(w, S.s1, p)
    await askTo(w, S.s1, p)
  })
  worldRow(sdk, 'PLAT-UC-03', 'E1 no D', 'no D set → ask_agent answers unavailable at once; message_agent is held (queued), not refused', async (w) => {
    w.session(S.s1)
    w.principal(ID.q, { connected: true })
    await askUnavailable(w, S.s1)
    await messageHeld(w)
  })
  worldRow(sdk, 'PLAT-UC-03', 'E1 D offline', 'D set but not connected → ask_agent unavailable at once; message_agent waits in D\'s mailbox (K1c-3: connected or not)', async (w) => {
    const d = w.principal(ID.d, { connected: false, designated: true })
    w.session(S.s1)
    await askUnavailable(w, S.s1)
    await messageTo(w, S.s1, d)
  })
  worldRow(sdk, 'PLAT-UC-03', 'E1 full', `no D → message_agent queues up to maxQueuedInputs (live ${FIXTURE.smallQueue}), then ${REFUSAL.queueFull}`, async (w) => {
    w.session(S.s1)
    w.principal(ID.q)
    w.settings.set({ maxQueuedInputs: FIXTURE.smallQueue })
    for (let i = 0; i < FIXTURE.smallQueue; i += 1) await messageHeld(w)
    await assertQueueFull(w)
  })
  worldRow(sdk, 'PLAT-UC-03', 'E2', 'S1 managed by P, P not connected → S1\'s permission request is an offer in P\'s mailbox and waits (48 h later still there); never to the user', async (w) => {
    const { p } = await managedByP(w, { pConnected: false })
    const event = await offerTo(w, S.s1, ET.permission, p)
    w.clock.advance(FIXTURE.longWaitMs)
    await quiet()
    assert.ok((await pendingOf(w, p)).some((e) => e.eventId === event.eventId), 'the offer left P\'s mailbox')
  })
  worldRow(sdk, 'PLAT-UC-03', 'E2 ask', `S1 managed by P, P not connected → ask_agent is an offer waiting in P's mailbox, not unavailable (${RELAYED.askManagedOffline})`, async (w) => {
    const { p } = await managedByP(w, { pConnected: false })
    await askTo(w, S.s1, p)
  })
  worldRow(sdk, 'PLAT-UC-03', 'post', '"connected" is no timer: an ask waiting for a connected D is still waiting 48 h later (fake clock)', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    const { promise } = await askTo(w, S.s1, d)
    w.clock.advance(FIXTURE.longWaitMs)
    assert.equal(await settlesWithin(promise, WAIT.quietMs), false, 'the ask settled on a timer')
  })
  todoRow(sdk, 'PLAT-UC-03', 'DSH', 'the same flows through the main-session tools on a real DSH session (both SDKs)', LATER.wireTools)
}

/** One more message with no recipient is `queue-full` and changes nothing. */
async function assertQueueFull(w) {
  const { value } = await expectNone(w, () => w.routing.messageAgent(S.s1, message()))
  assert.deepEqual(value, { ok: false, code: REFUSAL.queueFull })
}

// ================================================================================================
// Equivalence Partitioning
// ================================================================================================

function equivalencePartitions(sdk) {
  // EVT-EP-01 — Event types and recipient (M = manager of the named session, D = designated).
  for (const [n, type] of [['1', ET.permission], ['2', ET.question], ['3', ET.planReview]]) {
    worldRow(sdk, 'EVT-EP-01', n, `${type} of a managed session → M only`, async (w) => {
      const { p } = await managedByP(w)
      await offerTo(w, S.s1, type, p)
    })
  }
  worldRow(sdk, 'EVT-EP-01', '4', 'permission of an unmanaged session → no principal: the user answers in the session (to-user)', async (w) => {
    w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    await offerFallsBack(w, S.s1, ET.permission, FALLBACK.toUser)
  })
  for (const [n, type] of [['4a', ET.question], ['4b', ET.planReview]]) {
    worldRow(sdk, 'EVT-EP-01', n, `${type} of an unmanaged session → to-user (${RELAYED.offersUnmanaged})`, async (w) => {
      w.principal(ID.d, { connected: true, designated: true })
      w.session(S.s1)
      await offerFallsBack(w, S.s1, type, FALLBACK.toUser)
    })
  }
  worldRow(sdk, 'EVT-EP-01', '5', 'settlement → the pair that held the offer, even when another pair manages the session now', async (w) => {
    const p = w.principal(ID.p)
    const q = w.principal(ID.q)
    w.session(S.s1)
    await manage(w, S.s1, q)
    assert.deepEqual(w.router.recipientFor({ type: ET.settlement, sessionId: S.s1, followsPrincipal: p }), { recipient: p })
  })
  worldRow(sdk, 'EVT-EP-01', '6', `retirement → the pair that held the offer (session_release retires P's live offer to P, ${RETIREMENT_REASON.released})`, async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    const { event } = await expectRetirement(w, () => w.managed.release(S.s1, p), p, offer)
    assert.equal(event.payload.reason, RETIREMENT_REASON.released)
  })
  worldRow(sdk, 'EVT-EP-01', '7', 'turn-finished of a managed session → M; the payload says running and queued', async (w) => {
    const { p } = await managedByP(w)
    await turnTo(w, S.s1, p, { running: false, queued: true })
  })
  worldRow(sdk, 'EVT-EP-01', '8', 'state of a managed session → M', async (w) => {
    const { p } = await managedByP(w)
    await stateTo(w, S.s1, p)
  })
  worldRow(sdk, 'EVT-EP-01', '9', 'turn-finished / state of an unmanaged session → not produced at all', async (w) => {
    w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    await unwatched(w, S.s1)
  })
  worldRow(sdk, 'EVT-EP-01', '10', 'message_agent from a managed session → M', async (w) => {
    const { p } = await managedByP(w)
    await messageTo(w, S.s1, p)
  })
  worldRow(sdk, 'EVT-EP-01', '11', 'message_agent from an unmanaged session → D', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    await messageTo(w, S.s1, d)
  })
  worldRow(sdk, 'EVT-EP-01', '12 managed', 'ask_agent from a managed session → M', async (w) => {
    const { p } = await managedByP(w)
    await askTo(w, S.s1, p)
  })
  worldRow(sdk, 'EVT-EP-01', '12 unmanaged', 'ask_agent from an unmanaged session → D', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    await askTo(w, S.s1, d)
  })
  worldRow(sdk, 'EVT-EP-01', '13', 'handover → the principal handed to (now M), not D', async (w) => {
    w.principal(ID.d, { connected: true, designated: true })
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await handOverOk(w, S.s1, p)
  })
  worldRow(sdk, 'EVT-EP-01', '14', 'takeback → the previous M', async (w) => {
    const { p } = await managedByP(w)
    await takeBackOk(w, S.s1, p)
  })
  worldRow(sdk, 'EVT-EP-01', '15', 'notice naming no session → D (router; C-ROUTE produces no notice, K1c-4)', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    assert.deepEqual(w.router.recipientFor({ type: ET.notice, sessionId: null }), { recipient: d })
  })
  worldRow(sdk, 'EVT-EP-01', '16', 'contributed:<ns>.<e> with / without sessionId → EXT-DT-02 rules 1–5 (router)', async (w) => {
    const m = w.principal(ID.p)
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    w.session(S.s2)
    await manage(w, S.s1, m)
    const route = (sessionId) => w.router.recipientFor({ type: CONTRIBUTED, sessionId, contributor: FIXTURE.namespace })
    assert.deepEqual([route(S.s1), route(S.s2), route(null)], [{ recipient: m }, { recipient: d }, { recipient: d }], 'rules 1, 2, 4')
    w.settings.set({ agentToken: undefined })
    assert.deepEqual([route(S.s2), route(null)], [{ recipient: null, fallback: FALLBACK.noAgent }, { recipient: null, fallback: FALLBACK.noAgent }], 'rules 3, 5')
  })

  // EVT-EP-04 — Per-principal isolation of streams and hints, end to end: C-ROUTE commits through
  // the real C-MAILBOX, whose hints go to the real C-HTTP route's listen streams.
  const e2e = (part, title, fn, ids = [ID.p, ID.q]) => row(sdk, 'EVT-EP-04', part, title, async (t) => {
    const http = await httpWorld(t, sdk)
    const w = await routeWorld(t, sdk, { hints: http.hints })
    const [p, q] = await Promise.all(ids.map((id) => listener(http, id)))
    const keys = ids.map((id) => w.principal(id, { connected: true }))
    for (const [i, s] of [S.s1, S.s2].entries()) { w.session(s); await manage(w, s, keys[i]) }
    await fn({ w, http, p, q, keys: { p: keys[0], q: keys[1] } })
  })
  const hintsOn = async (stream, n) => { await until(() => stream.uris.length >= n, `${n} hint(s)`); await quiet() }
  e2e('1', 'an event C-ROUTE commits to P\'s mailbox → one hint on P\'s stream, nothing on Q\'s', async ({ w, p, q, keys }) => {
    await messageTo(w, S.s1, keys.p)
    await hintsOn(p, 1)
    assert.deepEqual([p.uris, q.uris], [[CONNECTED.listenResource], []])
  })
  e2e('2', 'an event committed to Q\'s mailbox → nothing on P\'s stream, one hint on Q\'s', async ({ w, p, q, keys }) => {
    await messageTo(w, S.s2, keys.q)
    await hintsOn(q, 1)
    assert.deepEqual([p.uris, q.uris], [[], [CONNECTED.listenResource]])
  })
  e2e('3', `ids differing only in case (${FIXTURE.caseIds.lower} / ${FIXTURE.caseIds.upper}): rows 1–2 hold`, async ({ w, p, q, keys }) => {
    await messageTo(w, S.s1, keys.p)
    await hintsOn(p, 1)
    await messageTo(w, S.s2, keys.q)
    await hintsOn(q, 1)
    assert.deepEqual([p.uris, q.uris], [[CONNECTED.listenResource], [CONNECTED.listenResource]])
  }, [FIXTURE.caseIds.lower, FIXTURE.caseIds.upper])
  e2e('4', 'P\'s entry disabled → P\'s stream closes and P\'s management ends; Q\'s stream stays open and gets its own hints', async ({ w, http, p, q, keys }) => {
    // Two fakes stand for C-TOKENS' one onRevoked: the route's (closes streams) and C-ROUTE's (ends management).
    http.tokens.revoke(p.caller.entryKey, REVOCATION.disabled, FIXTURE.generation + 1)
    await revokeEntry(w, ID.p, REVOCATION.disabled)
    assert.ok(await settlesWithin(p.subscription.closed, WAIT.eventMs), 'P\'s listen stream stayed open')
    await until(() => w.managed.managerOf(S.s1) === undefined, 'S1 unmanaged after P\'s disable')
    assert.equal(await settlesWithin(q.subscription.closed, WAIT.quietMs), false, 'Q\'s listen stream closed')
    await messageTo(w, S.s2, keys.q)
    await hintsOn(q, 1)
    assert.deepEqual(p.uris, [])
  })
  e2e('5', 'Q polls after row 1 → Q\'s mailbox has nothing of P\'s', async ({ w, keys }) => {
    const e = await messageTo(w, S.s1, keys.p)
    const qs = await pendingOf(w, keys.q)
    assert.ok(!qs.some((x) => x.eventId === e.eventId || JSON.stringify(x).includes(e.payload.text)), 'Q sees P\'s event')
  })
  e2e('6', `${FIXTURE.burst} events to P in a burst → at least one hint, never more than one per commit; nothing on Q`, async ({ w, p, q }) => {
    await Promise.all(Array.from({ length: FIXTURE.burst }, () => w.routing.messageAgent(S.s1, message())))
    await until(async () => (await pendingOf(w, FIXTURE.principal(ID.p))).length >= FIXTURE.burst, `${FIXTURE.burst} events in P's mailbox`)
    await hintsOn(p, 1)
    assert.ok(p.uris.length >= 1 && p.uris.length <= FIXTURE.burst, `P got ${p.uris.length} hints`)
    assert.deepEqual(q.uris, [])
  })

  // WATCH-EP-01 — Who receives turn-finished / state.
  worldRow(sdk, 'WATCH-EP-01', '1', 'started by P → P only', async (w) => {
    const { p } = await managedByP(w)
    await turnTo(w, S.s1, p)
    await stateTo(w, S.s1, p)
  })
  worldRow(sdk, 'WATCH-EP-01', '2', 'handed over to D → D only', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await handOverOk(w, S.s1, d)
    await turnTo(w, S.s1, d)
    await stateTo(w, S.s1, d)
  })
  worldRow(sdk, 'WATCH-EP-01', '3', 'unmanaged → nobody (not produced)', async (w) => {
    w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    await unwatched(w, S.s1)
  })
  worldRow(sdk, 'WATCH-EP-01', '4', 'managed by P with D a different principal → P only, never D', async (w) => {
    const { p, d } = await managedByP(w)
    await turnTo(w, S.s1, p)
    assert.deepEqual(await pendingOf(w, d), [])
  })
  todoRow(sdk, 'WATCH-EP-01', '6', 'after Q24 succession P → P\' → P\' only', LATER.succeed)

  // HAND-EP-01 — Who can reach the hand-over service.
  worldRow(sdk, 'HAND-EP-01', '1', `a plugin in the same DSH injects ${HANDOVER.service} and can call handOver / takeBack / managed / principals`, async (w, t) => {
    const ctx = await cordisContext(t, sdk)
    w.routing.provide(ctx)
    const service = ctx.get(HANDOVER.service)
    assert.equal(service?.apiVersion, HANDOVER.apiVersion)
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    assert.equal((await service.handOver(S.s1, p)).ok, true)
    assert.deepEqual(service.managed().map((m) => [m.sessionId, m.principal.key]), [[S.s1, p]])
    assert.ok(service.principals().some((x) => x.key === p))
    assert.deepEqual(await service.takeBack(S.s1), { ok: true })
  })
  row(sdk, 'HAND-EP-01', '2', 'an MCP client: no core tool exposes hand-over (no handover / takeback / handOver tool name in K1 TOOL_NAMES)', () => {
    assert.deepEqual(TOOL_NAMES.filter((n) => FIXTURE.handoverToolName.test(n)), [])
  })
  todoRow(sdk, 'HAND-EP-01', '2 live', 'a tools/call of a handover tool name on the live endpoint → the MCP unknown-tool error', 'C-TOOLS (tools/list and tools/call on the MCP endpoint)')
  row(sdk, 'HAND-EP-01', '3', 'a browser fetch: no connector route serves hand-over (no hand-over path in K1 PATHS or REQUEST_GATE routes)', () => {
    const paths = [...Object.values(PATHS), ...Object.values(REQUEST_GATE.routes).flatMap((r) => Object.keys(r))]
    assert.deepEqual(paths.filter((x) => FIXTURE.handoverToolName.test(x)), [])
  })
  todoRow(sdk, 'HAND-EP-01', '3 live', 'a browser fetch to any path of the loaded connector: no hand-over route, nothing served', LATER.wireRoutes)
  worldRow(sdk, 'HAND-EP-01', '4', 'a plugin in another DSH (another Cordis root) does not reach the service', async (w, t) => {
    const here = await cordisContext(t, sdk)
    const elsewhere = await cordisContext(t, sdk)
    w.routing.provide(here)
    assert.equal(elsewhere.get(HANDOVER.service), undefined)
  })
  worldRow(sdk, 'HAND-EP-01', '5', 'the service has exactly apiVersion, managed, principals, onChange, handOver, takeBack; principal.key is no token, ref or label; principal.id is the fishball id', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.principal(ID.x)
    w.session(S.s1)
    await handOverOk(w, S.s1, p)
    assert.deepEqual(memberNames(w.handover), [...HANDOVER.members].sort())
    for (const x of w.handover.principals()) {
      const entry = w.tokens.get(FIXTURE.entry(x.id))
      assert.ok(![entry.label, entry.ref, FIXTURE.tokenValue(x.id)].includes(x.key), `principal.key ${x.key} is a label, ref or token`)
    }
    assert.equal(w.handover.managed()[0].principal.id, ID.p)
    assertNoLeak(w, [w.handover.principals(), w.handover.managed()])
  })

  // ROUTE-EP-01 — principals() (K3 HandoverPrincipal; R-UI-10).
  worldRow(sdk, 'ROUTE-EP-01', '1', `every token entry is listed with exactly {${HANDOVER.principalFields.join(', ')}}`, async (w) => {
    w.principal(ID.p, { name: NAME.p, connected: true, designated: true })
    w.principal(ID.x, { paired: false })
    const list = w.handover.principals()
    assert.equal(list.length, 2)
    for (const x of list) assert.deepEqual(Object.keys(x).sort(), [...HANDOVER.principalFields].sort())
  })
  worldRow(sdk, 'ROUTE-EP-01', '2', 'enabled, paired, named, online, designated → {name, id, online: true, enabled: true, paired: true, designated: true}', async (w) => {
    const key = w.principal(ID.p, { name: NAME.p, connected: true, designated: true })
    assert.deepEqual(w.handover.principals(), [{ key, name: NAME.p, id: ID.p, online: true, enabled: true, paired: true, designated: true }])
  })
  worldRow(sdk, 'ROUTE-EP-01', '3', 'an unpaired entry → id null, paired false, online false', async (w) => {
    w.principal(ID.x, { paired: false })
    const [x] = w.handover.principals()
    assert.deepEqual([x.id, x.paired, x.online], [null, false, false])
  })
  worldRow(sdk, 'ROUTE-EP-01', '4', 'a disabled entry → enabled false (the control filters it, the service still lists it)', async (w) => {
    w.principal(ID.p)
    w.tokens.disable(ID.p)
    await until(() => w.handover.principals()[0]?.enabled === false, 'enabled false')
  })
  worldRow(sdk, 'ROUTE-EP-01', '5', 'a nameless principal → name null (shown as ID: <id> by embed-UI)', async (w) => {
    w.principal(ID.x)
    assert.equal(w.handover.principals()[0].name, null)
  })
  worldRow(sdk, 'ROUTE-EP-01', '6', 'online follows the listen stream only: connect → true, disconnect → false', async (w) => {
    const key = w.principal(ID.p)
    const online = () => w.handover.principals()[0].online
    assert.equal(online(), false)
    w.presence.connect(key)
    await until(() => online() === true, 'online after connect')
    w.presence.disconnect(key)
    await until(() => online() === false, 'offline after disconnect')
  })
  // Key of an entry (decided by Fishball, 2026-11-14, reconciling K1 mcp-schema PrincipalKey with K3
  // handOver(sessionId, principalKey)): while unpaired an entry is listed under its opaque EntryKey;
  // once paired, under its PrincipalKey, the same key as managed().principal.key. K3's "stable for
  // the life of the token entry" holds from pairing on, so Q's key changes at the bind; its place
  // in the order does not.
  worldRow(sdk, 'ROUTE-EP-01', '7', 'order = the native settings list; a rename, a connection change or a pairing never moves an entry (Q: EntryKey until paired, then its PrincipalKey)', async (w) => {
    const keys = [w.principal(ID.p), w.principal(ID.q, { paired: false }), w.principal(ID.x)]
    const order = () => w.handover.principals().map((x) => x.key)
    assert.deepEqual(order(), keys)
    await w.pairs.setName(keys[2], NAME.renamed)
    w.presence.connect(keys[0])
    // bind returns Q's PrincipalKey, the key w.principal(Q) returns for a paired entry.
    keys[1] = w.pairs.bind(ID.q)
    await quiet()
    assert.deepEqual(order(), keys)
  })
  worldRow(sdk, 'ROUTE-EP-01', '8', 'managed() names the current principal: a rename shows without a new hand over', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await handOverOk(w, S.s1, p)
    await w.pairs.setName(p, NAME.renamed)
    await until(() => w.handover.managed()[0]?.principal.name === NAME.renamed, 'the renamed principal in managed()')
  })
}

/** One `retirement` to `key` naming `offer`'s event; the offer itself is no longer pending. */
async function expectRetirement(w, act, key, offer) {
  const before = (await allEntries(w)).length
  const value = await act()
  assert.deepEqual(value, { ok: true })
  await until(async () => (await pendingOf(w, key)).some((e) => e.type === ET.retirement && e.payload.retiredEventId === offer.eventId), 'the retirement of the offer')
  await quiet()
  const entries = await allEntries(w)
  assert.equal(entries.length, before, 'release produced more than the retirement that replaces its offer')
  const event = entries.find((x) => x.e.type === ET.retirement && x.e.payload.retiredEventId === offer.eventId)
  assert.equal(event.key, key)
  assert.ok(!entries.some((x) => x.e.eventId === offer.eventId), 'the retired offer is still pending')
  return { event: event.e }
}

// ================================================================================================
// Boundary Value Analysis
// ================================================================================================

function boundaryValues(sdk) {
  // ROUTE-BVA-01 — The no-recipient message queue bound (K1c-3; live maxQueuedInputs).
  const N = FIXTURE.smallQueue
  /** A world with no designated paired entry and S1 unmanaged; `bound` sets the live setting. */
  const queueWorld = (w, bound) => {
    w.session(S.s1)
    if (bound !== undefined) w.settings.set({ maxQueuedInputs: bound })
  }
  /** Designates D (offline) and returns D's message texts once `n` have moved in. */
  const flushTo = async (w, n) => {
    const d = w.principal(ID.d)
    designate(w, ID.d)
    await until(async () => (await messageTexts(w, d)).length >= n, `${n} messages in D's mailbox`)
    await quiet()
    return messageTexts(w, d)
  }
  worldRow(sdk, 'ROUTE-BVA-01', '1', `held max − 1 (${N - 1}) → the next message is accepted`, async (w) => {
    queueWorld(w, N)
    for (let i = 0; i < N - 1; i += 1) await messageHeld(w)
    await messageHeld(w)
  })
  worldRow(sdk, 'ROUTE-BVA-01', '2', `held max (${N}) → the next is ${REFUSAL.queueFull}; nothing changed (exactly ${N} move in later)`, async (w) => {
    queueWorld(w, N)
    const held = []
    for (let i = 0; i < N; i += 1) held.push((await messageHeld(w)).text)
    await assertQueueFull(w)
    assert.deepEqual(await flushTo(w, N), held)
  })
  worldRow(sdk, 'ROUTE-BVA-01', '3', `setting unset → the K1 default bound QUEUE.maxQueuedInputs (${QUEUE.maxQueuedInputs}): the ${QUEUE.maxQueuedInputs}th accepted, the next ${REFUSAL.queueFull}`, async (w) => {
    queueWorld(w)
    for (let i = 0; i < QUEUE.maxQueuedInputs; i += 1) assert.deepEqual(await w.routing.messageAgent(S.s1, message()), { ok: true })
    await assertQueueFull(w)
  })
  worldRow(sdk, 'ROUTE-BVA-01', '4', `held max, then the live setting raised to max + 1 → one more is accepted`, async (w) => {
    queueWorld(w, N)
    for (let i = 0; i < N; i += 1) await messageHeld(w)
    w.settings.set({ maxQueuedInputs: N + 1 })
    await messageHeld(w)
    await assertQueueFull(w)
  })
}

// ================================================================================================
// Decision Tables
// ================================================================================================

/** The router's answer for each type, as one object, for one session id. */
const answers = (w, types, sessionId, extra = {}) => Object.fromEntries(types.map((type) => [type, w.router.recipientFor({ type, sessionId, ...(type === CONTRIBUTED ? { contributor: FIXTURE.namespace } : {}), ...extra })]))
const all = (types, answer) => Object.fromEntries(types.map((type) => [type, answer]))
const TO_D_TYPES = Object.freeze([ET.message, ET.ask, ET.notice, CONTRIBUTED])
const WATCH_TYPES = Object.freeze([ET.turnFinished, ET.state])
const SESSION_TYPES = Object.freeze([...OFFER_TYPES, ...WATCH_TYPES, ...TO_D_TYPES])
/** The no-D answers of rules 3 and 5 (R-CON-09, R-EXT-17, K1c-3; RELAYED.noticeNoD). */
const NO_D = Object.freeze({
  [ET.message]: { recipient: null, fallback: FALLBACK.queue },
  [ET.ask]: { recipient: null, fallback: FALLBACK.unavailable },
  [CONTRIBUTED]: { recipient: null, fallback: FALLBACK.noAgent },
})
/** A notice with no D reaches no agent and no user (RELAYED.noticeNoD): no recipient, not to-user, not queued. */
function assertNoticeNowhere(answer) {
  assert.equal(answer?.recipient, null)
  assert.ok(![FALLBACK.toUser, FALLBACK.queue].includes(answer.fallback), `a notice with no D falls back to ${answer.fallback}`)
}

function decisionTables(sdk) {
  // EVT-DT-01 — Recipient of an event (router, then integration).
  for (const connected of [true, false]) {
    worldRow(sdk, 'EVT-DT-01', `1 (M ${connected ? 'online' : 'offline'})`, 'names a managed session → M, for every type that names a session', async (w) => {
      const m = w.principal(ID.p, { connected })
      w.principal(ID.d, { connected: true, designated: true })
      w.session(S.s1)
      await manage(w, S.s1, m)
      assert.deepEqual(answers(w, SESSION_TYPES, S.s1), all(SESSION_TYPES, { recipient: m }))
    })
  }
  worldRow(sdk, 'EVT-DT-01', '2', 'names an unmanaged session, D exists → D for message, ask, notice, contributor; offers to-user; turn-finished / state dropped', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    assert.deepEqual(answers(w, SESSION_TYPES, S.s1), {
      ...all(OFFER_TYPES, { recipient: null, fallback: FALLBACK.toUser }),
      ...all(WATCH_TYPES, { recipient: null, fallback: FALLBACK.dropped }),
      ...all(TO_D_TYPES, { recipient: d }),
    })
  })
  /** Rule 3 under a "no D" variant (none, unpaired, disabled): the no-principal rules. */
  const ruleThree = (part, title, setup) => worldRow(sdk, 'EVT-DT-01', part, title, async (w) => {
    w.principal(ID.p, { connected: true })
    w.session(S.s1)
    setup(w)
    const got = answers(w, SESSION_TYPES, S.s1)
    assert.deepEqual({ ...got, [ET.notice]: undefined }, {
      ...all(OFFER_TYPES, { recipient: null, fallback: FALLBACK.toUser }),
      ...all(WATCH_TYPES, { recipient: null, fallback: FALLBACK.dropped }),
      ...NO_D,
      [ET.notice]: undefined,
    })
    assertNoticeNowhere(got[ET.notice])
  })
  ruleThree('3', 'names an unmanaged session, no D set → message queue, ask unavailable, contributor no-agent, offers to-user, notice nowhere', () => {})
  ruleThree('3a', 'D set to an entry that is not paired → as no D (K1c-3)', (w) => { w.principal(ID.d, { paired: false }); designate(w, ID.d) })
  ruleThree('3b', `D paired but disabled → as no D (${RELAYED.disabledD})`, (w) => { w.principal(ID.d, { connected: true, designated: true }); w.tokens.disable(ID.d) })
  worldRow(sdk, 'EVT-DT-01', '4', 'names no session, D exists → D', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    assert.deepEqual(answers(w, TO_D_TYPES, null), all(TO_D_TYPES, { recipient: d }))
  })
  worldRow(sdk, 'EVT-DT-01', '5', 'names no session, no D → as rule 3', async (w) => {
    const got = answers(w, TO_D_TYPES, null)
    assert.deepEqual({ ...got, [ET.notice]: undefined }, { ...NO_D, [ET.notice]: undefined })
    assertNoticeNowhere(got[ET.notice])
  })
  worldRow(sdk, 'EVT-DT-01', '6', 'settlement / retirement → the pair that held the offer, whatever the session\'s manager or D', async (w) => {
    const f = w.principal(ID.q)
    const m = w.principal(ID.p, { connected: true })
    w.principal(ID.d, { connected: true, designated: true })
    await manage(w, S.s1, m)
    const follow = [ET.settlement, ET.retirement]
    for (const sessionId of [S.s1, S.s2, null]) assert.deepEqual(answers(w, follow, sessionId, { followsPrincipal: f }), all(follow, { recipient: f }), String(sessionId))
  })
  worldRow(sdk, 'EVT-DT-01', '7', 'takeback after Take back → the pair that managed the session until then', async (w) => {
    const { p } = await managedByP(w)
    await takeBackOk(w, S.s1, p)
    assert.deepEqual(w.router.recipientFor({ type: ET.takeback, sessionId: S.s1, followsPrincipal: p }), { recipient: p })
  })
  worldRow(sdk, 'EVT-DT-01', '8', 'managed by M when created; M changes before delivery → the event stays M\'s (decided at creation)', async (w) => {
    const { p } = await managedByP(w)
    const q = w.principal(ID.q, { connected: true })
    const e = await turnTo(w, S.s1, p)
    await takeBackOk(w, S.s1, p)
    await handOverOk(w, S.s1, q)
    assert.ok((await pendingOf(w, p)).some((x) => x.eventId === e.eventId), 'the event left M\'s mailbox')
    assert.ok(!(await pendingOf(w, q)).some((x) => x.eventId === e.eventId), 'the event reached the new manager')
  })
  worldRow(sdk, 'EVT-DT-01', '9', 'across the rules: every produced event is exactly one entry in exactly one mailbox (every mailbox counted)', async (w) => {
    const { p, d } = await managedByP(w)
    w.session(S.s2)
    w.session(S.s3)
    await offerTo(w, S.s1, ET.permission, p)
    await turnTo(w, S.s1, p)
    await stateTo(w, S.s1, p)
    await messageTo(w, S.s1, p)
    await askTo(w, S.s1, p)
    await messageTo(w, S.s2, d)
    await askTo(w, S.s2, d)
    // S3 holds no live offer: what a Take back does to live offers is not specified (no row assumes it).
    await handOverOk(w, S.s3, p)
    await takeBackOk(w, S.s3, p)
    await unwatched(w, S.s3)
    await offerFallsBack(w, S.s3, ET.permission, FALLBACK.toUser)
  })

  // HAND-DT-01 — handOver(sessionId, principalKey) outcome.
  row(sdk, 'HAND-DT-01', 'codes', 'K3 HandOverRefusalCode is exactly unknown-session, conflict, no-agent', () => {
    const { unknownSession, conflict, noAgent } = HANDOVER.codes
    assert.deepEqual(handoverCodes('HandOverRefusalCode'), [unknownSession, conflict, noAgent])
  })
  worldRow(sdk, 'HAND-DT-01', '1', `no such session → ${HANDOVER.codes.unknownSession}, no event`, async (w) => {
    const p = w.principal(ID.p, { connected: true })
    await assertRefused(w, () => w.handover.handOver(FIXTURE.unknownSession, p), HANDOVER.codes.unknownSession)
  })
  worldRow(sdk, 'HAND-DT-01', '2', `no enabled, paired principal at all → ${HANDOVER.codes.noAgent}, no event`, async (w) => {
    const x = w.principal(ID.x, { paired: false })
    w.session(S.s1)
    await assertRefused(w, () => w.handover.handOver(S.s1, x), HANDOVER.codes.noAgent)
  })
  worldRow(sdk, 'HAND-DT-01', '3', 'enabled, paired, online → ok; manager = chosen; one handover with the note, with the usual hint', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await handOverOk(w, S.s1, p)
    assert.ok(w.hints.calls.some(([key, uri]) => key === p && uri === CONNECTED.listenResource), 'no hint for the handover')
  })
  worldRow(sdk, 'HAND-DT-01', '3 note', `note omitted → the handover carries "${HANDOVER.omittedNote}"`, async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    const { event } = await expectOne(w, () => w.handover.handOver(S.s1, p), p, ET.handover)
    assert.equal(event.payload.note, HANDOVER.omittedNote)
  })
  worldRow(sdk, 'HAND-DT-01', '4', 'the designated Fishball → ok, as rule 3 (no special case)', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    await handOverOk(w, S.s1, d)
  })
  worldRow(sdk, 'HAND-DT-01', '5', 'enabled, paired, offline → ok; the handover waits in its mailbox', async (w) => {
    const p = w.principal(ID.p, { connected: false })
    w.session(S.s1)
    await handOverOk(w, S.s1, p)
  })
  for (const [part, how, revoke] of [['6 disabled', 'disabled', (w) => revokeEntry(w, ID.p, REVOCATION.disabled)], ['6 deleted', 'deleted', async (w) => { await revokeEntry(w, ID.p, REVOCATION.deleted); await w.pairs.remove(FIXTURE.entry(ID.p)) }]]) {
    worldRow(sdk, 'HAND-DT-01', part, `the chosen principal ${how} at call time → ${HANDOVER.codes.noAgent}, no event; onChange refreshes the control`, async (w) => {
      const p = w.principal(ID.p, { connected: true })
      w.principal(ID.q, { connected: true })
      w.session(S.s1)
      const seen = counting(w.handover)
      await revoke(w)
      await until(() => seen.n >= 1, 'onChange on the entry change')
      await assertRefused(w, () => w.handover.handOver(S.s1, p), HANDOVER.codes.noAgent)
    })
  }
  for (const [part, by] of [['7 other', ID.q], ['7 same', ID.p]]) {
    worldRow(sdk, 'HAND-DT-01', part, `session already managed (${by === ID.p ? 'by the chosen principal' : 'by another'}) → ${HANDOVER.codes.conflict}; manager unchanged`, async (w) => {
      const p = w.principal(ID.p, { connected: true })
      const holder = by === ID.p ? p : w.principal(ID.q, { connected: true })
      w.session(S.s1)
      await manage(w, S.s1, holder)
      await assertRefused(w, () => w.handover.handOver(S.s1, p), HANDOVER.codes.conflict)
      assert.equal(w.managed.managerOf(S.s1), holder)
    })
  }
  worldRow(sdk, 'HAND-DT-01', '7a', `enabled but unpaired → ${HANDOVER.codes.noAgent}`, async (w) => {
    const x = w.principal(ID.x, { paired: false })
    w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await assertRefused(w, () => w.handover.handOver(S.s1, x), HANDOVER.codes.noAgent)
  })
  worldRow(sdk, 'HAND-DT-01', '8', `unknown key → ${HANDOVER.codes.noAgent} (as a deleted entry, DECIDED #11)`, async (w) => {
    w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await assertRefused(w, () => w.handover.handOver(S.s1, FIXTURE.unknownKey), HANDOVER.codes.noAgent)
  })
  worldRow(sdk, 'HAND-DT-01', 'order 1', `unknown session and unknown key → ${HANDOVER.codes.unknownSession} (first in K3's order)`, async (w) => {
    w.principal(ID.p, { connected: true })
    await assertRefused(w, () => w.handover.handOver(FIXTURE.unknownSession, FIXTURE.unknownKey), HANDOVER.codes.unknownSession)
  })
  worldRow(sdk, 'HAND-DT-01', 'order 2', `managed session and unknown key → ${HANDOVER.codes.conflict} (before ${HANDOVER.codes.noAgent})`, async (w) => {
    const { p } = await managedByP(w)
    await assertRefused(w, () => w.handover.handOver(S.s1, FIXTURE.unknownKey), HANDOVER.codes.conflict)
    assert.equal(w.managed.managerOf(S.s1), p)
  })

  // HAND-DT-02 — takeBack(sessionId) outcome.
  row(sdk, 'HAND-DT-02', 'codes', 'K3 TakeBackRefusalCode is exactly unknown-session, not-managed', () => {
    assert.deepEqual(handoverCodes('TakeBackRefusalCode'), [HANDOVER.codes.unknownSession, HANDOVER.codes.notManaged])
  })
  worldRow(sdk, 'HAND-DT-02', '1', 'managed by P after a Hand over to P → ok; takeback to P', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await handOverOk(w, S.s1, p)
    await takeBackOk(w, S.s1, p)
  })
  worldRow(sdk, 'HAND-DT-02', '2', 'managed by P2, which started it → ok; takeback to P2', async (w) => {
    const p2 = w.principal(ID.q, { connected: false })
    w.session(S.s1)
    await manage(w, S.s1, p2)
    await takeBackOk(w, S.s1, p2)
  })
  worldRow(sdk, 'HAND-DT-02', '3', `managed by nobody → ${HANDOVER.codes.notManaged}; no event`, async (w) => {
    w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await assertRefused(w, () => w.handover.takeBack(S.s1), HANDOVER.codes.notManaged)
  })
  worldRow(sdk, 'HAND-DT-02', '4', `unknown session → ${HANDOVER.codes.unknownSession}; no event`, async (w) => {
    w.principal(ID.p, { connected: true })
    await assertRefused(w, () => w.handover.takeBack(FIXTURE.unknownSession), HANDOVER.codes.unknownSession)
  })

  // ROUTE-DT-01 / ROUTE-DT-02 — what fires onChange: K3's handover service (every online, name,
  // entry or managed change, design §3.6) and K1c's ManagedState (every change of the managed set).
  const TRIGGER = Object.freeze({
    connect: (w, k) => w.presence.connect(k.q),
    disconnect: (w, k) => w.presence.disconnect(k.p),
    rename: (w, k) => w.pairs.setName(k.p, NAME.renamed),
    pair: (w) => w.pairs.bind(ID.x),
    disable: (w) => revokeEntry(w, ID.q, REVOCATION.disabled),
    delete: async (w) => { await revokeEntry(w, ID.q, REVOCATION.deleted); await w.pairs.remove(FIXTURE.entry(ID.q)) },
    designate: (w) => designate(w, ID.q),
    manage: (w, k) => w.managed.manage(S.s2, k.q),
    release: (w, k) => w.managed.release(S.s1, k.p),
    handOver: (w, k) => w.handover.handOver(S.s2, k.q),
    takeBack: (w) => w.handover.takeBack(S.s1),
    revoke: (w) => revokeEntry(w, ID.p, REVOCATION.disabled),
  })
  /** P (connected) manages S1; Q (offline) and an unpaired X exist; S2 is unmanaged. */
  const triggerWorld = async (w) => {
    const p = w.principal(ID.p, { connected: true })
    const q = w.principal(ID.q)
    w.principal(ID.x, { paired: false })
    w.session(S.s1)
    w.session(S.s2)
    await manage(w, S.s1, p)
    return { p, q }
  }
  const triggerTable = (id, source, triggers) => {
    for (const name of triggers) {
      worldRow(sdk, id, name, `${name} → onChange fires`, async (w) => {
        const k = await triggerWorld(w)
        const seen = counting(source(w))
        await TRIGGER[name](w, k)
        await until(() => seen.n >= 1, `onChange after ${name}`)
      })
    }
    worldRow(sdk, id, 'throwing listener', 'a listener that throws does not stop the others; a disposed listener is not called', async (w) => {
      const k = await triggerWorld(w)
      source(w).onChange(() => { throw new Error(FIXTURE.listenerError) })
      const live = counting(source(w))
      const gone = counting(source(w))
      gone.dispose()
      gone.dispose()
      await TRIGGER.manage(w, k)
      await until(() => live.n >= 1, 'the second listener after a throwing first')
      assert.equal(gone.n, 0, 'a disposed listener was called')
    })
  }
  triggerTable('ROUTE-DT-01', (w) => w.handover, Object.keys(TRIGGER))
  triggerTable('ROUTE-DT-02', (w) => w.managed, ['manage', 'release', 'handOver', 'takeBack', 'revoke'])
}

// ================================================================================================
// State Transitions
// ================================================================================================

function stateTransitions(sdk) {
  // HAND-ST-01 — Management of one session (management = watch). States Unmanaged, Managed(P).
  worldRow(sdk, 'HAND-ST-01', '1', '(none) → P session_start → Managed(P); nothing for the start itself; later turn-finished / state to P', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await expectNone(w, () => manage(w, S.s1, p))
    assert.equal(w.managed.managerOf(S.s1), p)
    await turnTo(w, S.s1, p)
    await stateTo(w, S.s1, p)
  })
  for (const connected of [true, false]) {
    worldRow(sdk, 'HAND-ST-01', `2 (${connected ? 'online' : 'offline'})`, 'Unmanaged → Hand over to enabled, paired P → Managed(P); one handover to P (queued if offline)', async (w) => {
      const p = w.principal(ID.p, { connected })
      w.session(S.s1)
      await handOverOk(w, S.s1, p)
    })
  }
  worldRow(sdk, 'HAND-ST-01', '3', `Unmanaged → Hand over with no enabled, paired principal → Unmanaged; ${HANDOVER.codes.noAgent}`, async (w) => {
    w.session(S.s1)
    await assertRefused(w, () => w.handover.handOver(S.s1, FIXTURE.unknownKey), HANDOVER.codes.noAgent)
    assert.equal(w.managed.managerOf(S.s1), undefined)
  })
  worldRow(sdk, 'HAND-ST-01', '4', 'Managed(P) → Take back → Unmanaged; one takeback to P', async (w) => {
    const { p } = await managedByP(w)
    await takeBackOk(w, S.s1, p)
  })
  worldRow(sdk, 'HAND-ST-01', '5', 'Managed(P) → P session_release (no live offer) → Unmanaged; nothing produced (K1c-2)', async (w) => {
    const { p } = await managedByP(w)
    const { value } = await expectNone(w, () => w.managed.release(S.s1, p))
    assert.deepEqual(value, { ok: true })
    assert.equal(w.managed.managerOf(S.s1), undefined)
  })
  worldRow(sdk, 'HAND-ST-01', '5a', `Managed(P) with two live offers → release → Unmanaged; one retirement (${RETIREMENT_REASON.released}) per offer to P, nothing else; later offers to the user (${RELAYED.offerLedger})`, async (w) => {
    const { p } = await managedByP(w)
    const first = await offerTo(w, S.s1, ET.permission, p)
    const second = await offerTo(w, S.s1, ET.question, p)
    const before = (await allEntries(w)).length
    assert.deepEqual(await w.managed.release(S.s1, p), { ok: true })
    const retired = async () => (await pendingOf(w, p)).filter((e) => e.type === ET.retirement && e.payload.reason === RETIREMENT_REASON.released).map((e) => e.payload.retiredEventId)
    await until(async () => (await retired()).length >= 2, 'two retirements')
    await quiet()
    assert.deepEqual((await retired()).sort(), [first.eventId, second.eventId].sort())
    assert.equal((await allEntries(w)).length, before, 'release produced more than the two retirements replacing the offers')
    await offerFallsBack(w, S.s1, ET.permission, FALLBACK.toUser)
  })
  worldRow(sdk, 'HAND-ST-01', '6', `Managed(P) → P's entry disabled → Unmanaged (${RELAYED.revocation})`, async (w) => {
    await managedByP(w)
    await revokeEntry(w, ID.p, REVOCATION.disabled)
    await until(() => w.managed.managerOf(S.s1) === undefined, 'S1 unmanaged')
  })
  worldRow(sdk, 'HAND-ST-01', '6 deleted', 'Managed(P) → P\'s entry deleted → Unmanaged', async (w) => {
    await managedByP(w)
    await revokeEntry(w, ID.p, REVOCATION.deleted)
    await w.pairs.remove(FIXTURE.entry(ID.p))
    await until(() => w.managed.managerOf(S.s1) === undefined, 'S1 unmanaged')
  })
  todoRow(sdk, 'HAND-ST-01', '6 note', 'one system note in the session; live offers to the user', LATER.revokeNote)
  todoRow(sdk, 'HAND-ST-01', '7', 'Managed(P) → Q24 succession P → P\' → Managed(P\'); one system note; later events to P\'', LATER.succeed)
  worldRow(sdk, 'HAND-ST-01', '8', 'Managed(P) → the designated Fishball changes → Managed(P); nothing produced', async (w) => {
    const { p } = await managedByP(w)
    w.principal(ID.q, { connected: true })
    await expectNone(w, () => designate(w, ID.q))
    assert.equal(w.managed.managerOf(S.s1), p)
  })
  worldRow(sdk, 'HAND-ST-01', '9', `Managed(P) → Q session_release → Managed(P); refused ${MANAGED_REFUSAL.otherManager}`, async (w) => {
    const { p } = await managedByP(w)
    const q = w.principal(ID.q, { connected: true })
    await assertRefused(w, () => w.managed.release(S.s1, q), MANAGED_REFUSAL.otherManager)
    assert.equal(w.managed.managerOf(S.s1), p)
  })
  worldRow(sdk, 'HAND-ST-01', '10', 'Unmanaged → any event of the session → Unmanaged; no turn-finished / state for anyone', async (w) => {
    w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    await unwatched(w, S.s1)
  })
  worldRow(sdk, 'HAND-ST-01', '11', `Managed(P) → Hand over → Managed(P); ${HANDOVER.codes.conflict}`, async (w) => {
    const { p, d } = await managedByP(w)
    await assertRefused(w, () => w.handover.handOver(S.s1, d), HANDOVER.codes.conflict)
    assert.equal(w.managed.managerOf(S.s1), p)
  })
  worldRow(sdk, 'HAND-ST-01', '12', 'Unmanaged → Hand over to a principal that just disconnected → Managed(P); its handover waits in P\'s mailbox', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    w.presence.disconnect(p)
    await handOverOk(w, S.s1, p)
  })
  worldRow(sdk, 'HAND-ST-01', '13', `Unmanaged → Hand over to a principal disabled a moment before → Unmanaged; ${HANDOVER.codes.noAgent}`, async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    w.tokens.disable(ID.p)
    await assertRefused(w, () => w.handover.handOver(S.s1, p), HANDOVER.codes.noAgent)
  })

  // WATCH-ST-01 — Watch follows management (rows 1–6; rows 7–8 are C-TOOLS').
  worldRow(sdk, 'WATCH-ST-01', '1', 'Unwatched → session_start by P → Watched(P): the next turn → P', async (w) => {
    const { p } = await managedByP(w)
    await turnTo(w, S.s1, p)
  })
  worldRow(sdk, 'WATCH-ST-01', '2', 'Unwatched → Hand over to connected P → Watched(P)', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await handOverOk(w, S.s1, p)
    await turnTo(w, S.s1, p)
  })
  worldRow(sdk, 'WATCH-ST-01', '3', 'Watched(P) → session_release → Unwatched; queued events stay with P; no later ones', (w) => watchEnds(w, ENDINGS.release))
  worldRow(sdk, 'WATCH-ST-01', '4', 'Watched(P) → Take back → Unwatched; the same', (w) => watchEnds(w, ENDINGS.takeBack))
  worldRow(sdk, 'WATCH-ST-01', '5 disabled', 'Watched(P) → P\'s entry disabled → Unwatched; no later events', (w) => watchEnds(w, ENDINGS.disabled))
  worldRow(sdk, 'WATCH-ST-01', '5 deleted', 'Watched(P) → P\'s entry deleted → Unwatched; no later events', (w) => watchEnds(w, ENDINGS.deleted))
  todoRow(sdk, 'WATCH-ST-01', '6', 'Watched(P) → succession P → P\' → Watched(P\'); later events to P\' only, none sent twice', LATER.succeed)

  // ROUTE-ST-01 — K1c ManagedState of one session.
  worldRow(sdk, 'ROUTE-ST-01', '1', 'Unmanaged → manage(P) → Managed(P): ok, managerOf and managed() show it once resolved, no event', async (w) => {
    const p = w.principal(ID.p)
    const { value } = await expectNone(w, () => w.managed.manage(S.s1, p))
    assert.deepEqual(value, { ok: true })
    assert.equal(w.managed.managerOf(S.s1), p)
    assert.deepEqual(managedSet(w), [{ sessionId: S.s1, principalKey: p }])
  })
  for (const [part, who] of [['2', 'the same principal'], ['3', 'another principal']]) {
    worldRow(sdk, 'ROUTE-ST-01', part, `Managed(P) → manage by ${who} → Managed(P); ${MANAGED_REFUSAL.alreadyManaged}`, async (w) => {
      const p = w.principal(ID.p)
      const caller = part === '2' ? p : w.principal(ID.q)
      await manage(w, S.s1, p)
      await assertRefused(w, () => w.managed.manage(S.s1, caller), MANAGED_REFUSAL.alreadyManaged)
    })
  }
  worldRow(sdk, 'ROUTE-ST-01', '4', 'Managed(P) → release(P) → Unmanaged; managerOf undefined, managed() empty', async (w) => {
    const p = w.principal(ID.p)
    await manage(w, S.s1, p)
    assert.deepEqual(await w.managed.release(S.s1, p), { ok: true })
    assert.deepEqual([w.managed.managerOf(S.s1), managedSet(w)], [undefined, []])
  })
  worldRow(sdk, 'ROUTE-ST-01', '5', `Unmanaged → release(P) → Unmanaged; ${MANAGED_REFUSAL.notManaged}`, async (w) => {
    const p = w.principal(ID.p)
    await assertRefused(w, () => w.managed.release(S.s1, p), MANAGED_REFUSAL.notManaged)
  })
  worldRow(sdk, 'ROUTE-ST-01', '6', `Managed(P) → release(Q) → Managed(P); ${MANAGED_REFUSAL.otherManager}`, async (w) => {
    const p = w.principal(ID.p)
    const q = w.principal(ID.q)
    await manage(w, S.s1, p)
    await assertRefused(w, () => w.managed.release(S.s1, q), MANAGED_REFUSAL.otherManager)
  })
  worldRow(sdk, 'ROUTE-ST-01', '7', 'Managed(P) → connector restart → Managed(P) (durable); release after the restart works', async (w) => {
    const p = w.principal(ID.p)
    await manage(w, S.s1, p)
    await w.reopen()
    assert.equal(w.managed.managerOf(S.s1), p)
    assert.deepEqual(await w.managed.release(S.s1, p), { ok: true })
    await w.reopen()
    assert.equal(w.managed.managerOf(S.s1), undefined)
  })
  worldRow(sdk, 'ROUTE-ST-01', '8', `two overlapping manage calls (P first, then Q) → P wins, Q ${MANAGED_REFUSAL.alreadyManaged} (serial)`, async (w) => {
    const p = w.principal(ID.p)
    const q = w.principal(ID.q)
    const [a, b] = await Promise.all([w.managed.manage(S.s1, p), w.managed.manage(S.s1, q)])
    assert.deepEqual([a, b], [{ ok: true }, { ok: false, code: MANAGED_REFUSAL.alreadyManaged }])
    assert.equal(w.managed.managerOf(S.s1), p)
  })
  worldRow(sdk, 'ROUTE-ST-01', '9', 'overlapping release(P) and manage(Q) on Managed(P) → serial: release first, then Q manages', async (w) => {
    const p = w.principal(ID.p)
    const q = w.principal(ID.q)
    await manage(w, S.s1, p)
    const [a, b] = await Promise.all([w.managed.release(S.s1, p), w.managed.manage(S.s1, q)])
    assert.deepEqual([a, b], [{ ok: true }, { ok: true }])
    assert.equal(w.managed.managerOf(S.s1), q)
  })
  worldRow(sdk, 'ROUTE-ST-01', '10', 'Hand over and Take back change the same state ManagedState shows (one owner)', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    w.session(S.s1)
    await handOverOk(w, S.s1, p)
    assert.deepEqual(managedSet(w), [{ sessionId: S.s1, principalKey: p }])
    await assertRefused(w, () => w.managed.manage(S.s1, p), MANAGED_REFUSAL.alreadyManaged)
    await takeBackOk(w, S.s1, p)
    assert.deepEqual(managedSet(w), [])
  })

  // ROUTE-ST-02 — The no-recipient message queue (K1c-3). States: Empty, Held(n).
  worldRow(sdk, 'ROUTE-ST-02', '1', 'Empty → message from an unmanaged session, no D → Held(1); nothing in any mailbox', async (w) => {
    w.session(S.s1)
    w.principal(ID.q)
    await messageHeld(w)
  })
  worldRow(sdk, 'ROUTE-ST-02', '2', 'Held(3) → a paired entry designated, offline → Empty; the three move into its mailbox in order', async (w) => {
    w.session(S.s1)
    const held = [await messageHeld(w), await messageHeld(w), await messageHeld(w)].map((m) => m.text)
    const d = w.principal(ID.d)
    designate(w, ID.d)
    await until(async () => (await messageTexts(w, d)).length >= held.length, 'the held messages in D\'s mailbox')
    assert.deepEqual(await messageTexts(w, d), held)
  })
  worldRow(sdk, 'ROUTE-ST-02', '3', 'Held(2) → an unpaired entry designated → Held(2); nothing moves', async (w) => {
    w.session(S.s1)
    await messageHeld(w)
    await messageHeld(w)
    await expectNone(w, () => { w.principal(ID.x, { paired: false }); designate(w, ID.x) })
  })
  worldRow(sdk, 'ROUTE-ST-02', '4', `Held(2) → a paired but disabled entry designated → Held(2) (${RELAYED.disabledD})`, async (w) => {
    w.session(S.s1)
    await messageHeld(w)
    await messageHeld(w)
    const d = w.principal(ID.d)
    w.tokens.disable(ID.d)
    await expectNone(w, () => designate(w, ID.d))
    assert.deepEqual(await messageTexts(w, d), [])
  })
  worldRow(sdk, 'ROUTE-ST-02', '5', 'Held(2) → connector restart → Held(2) (durable); then designated → both move in, in order', async (w) => {
    w.session(S.s1)
    const held = [await messageHeld(w), await messageHeld(w)].map((m) => m.text)
    await w.reopen()
    const d = w.principal(ID.d)
    designate(w, ID.d)
    await until(async () => (await messageTexts(w, d)).length >= held.length, 'the held messages after a restart')
    assert.deepEqual(await messageTexts(w, d), held)
  })
  worldRow(sdk, 'ROUTE-ST-02', '6', 'Held → a message from a managed session → goes to its manager at once, never into the queue', async (w) => {
    w.session(S.s1)
    w.session(S.s2)
    await messageHeld(w)
    const p = w.principal(ID.p)
    await manage(w, S.s2, p)
    await messageTo(w, S.s2, p)
  })
  worldRow(sdk, 'ROUTE-ST-02', '7', `Held(2), D's mailbox full → designated: nothing fits, Held(2); a new message joins the end; each freed slot (ack) moves the oldest in, in order (${RELAYED.roomSignal})`, async (w) => {
    w.session(S.s1)
    const d = w.principal(ID.d)
    const fill = []
    for (let i = 0; i < QUEUE.maxQueuedInputs; i += 1) {
      const result = await w.realMailbox.commit(d, { type: ET.message, sourceSessionId: null, correlationId: null, payload: message() })
      assert.equal(result?.ok, true, `filling D's mailbox: ${JSON.stringify(result)}`)
    }
    fill.push(...await pendingOf(w, d))
    const held = [await messageHeld(w), await messageHeld(w)].map((m) => m.text)
    await expectNone(w, () => designate(w, ID.d))
    held.push((await messageHeld(w)).text)
    for (const [i, text] of held.entries()) {
      const ack = await w.mailbox.ack(d, [{ eventId: fill[i].eventId, payloadDigest: fill[i].payloadDigest }])
      assert.equal(ack?.ok, true, `ack: ${JSON.stringify(ack)}`)
      await until(async () => (await messageTexts(w, d)).includes(text), `held message ${i + 1} moved in`)
      await quiet()
      const texts = await messageTexts(w, d)
      assert.deepEqual(held.filter((h) => texts.includes(h)), held.slice(0, i + 1), 'held messages moved in out of order or more than the freed room')
    }
  })
  todoRow(sdk, 'ROUTE-ST-02', 'DSH', 'held messages flush after a real connector restart with the setting changed in native settings', LATER.wire)
}

// ================================================================================================
// Merge-review fix 1 (integrate/v3-w2 review): `settle` on the managed chain, and the payloads
// `message_agent` and `settle` accept are taken as they were at the call. Requirements as the
// review states them; the routing/index.js JSDoc of `settle` / `withdraw` is the contract.
//   ROUTE-ST-03  the live-offer ledger under settle (Queued, Live, Settled, Withdrawn, Retired)
//   ROUTE-DT-03  settle racing a release, a revocation or a withdraw: order on the chain decides
//   ROUTE-EP-02  message_agent payload mutated after the call: path × field × value × timing
//   ROUTE-EP-03  settle's settlement payload: mutated after the call, uncopyable, schema-invalid
// ================================================================================================

/** A row on a world whose mailbox port can hold one commit (fakes.mjs gatedMailboxPort); every hold is opened at the end. */
const gatedRow = (sdk, id, part, title, fn) => row(sdk, id, part, title, async (t) => {
  const w = await routeWorld(t, sdk, { port: gatedMailboxPort })
  try { await fn(w, t) } finally { w.mailbox.openAll() }
})
/** A K1 settlement payload (EVENT_PAYLOAD_SHAPES.settlement) for `approvalId`. */
export const settlementOf = (approvalId, outcome = SETTLEMENT_OUTCOME.allowed, by = SETTLED_BY.principal) => ({ approvalId, outcome, by })
/** The answer a waiting ask_agent gets when its ask is settled (routing/index.js JSDoc of settle). */
export const askSettled = (settlement) => ({ ok: true, settlement })
const UNKNOWN_OFFER = formatOfferId(MUTATION.unknownApproval, OFFER_ID.firstRevision)

/** `settle` of a live offer: resolves true and commits exactly one `settlement` (correlationId = offerId, payload `want`) to `key`. */
export async function settledTo(w, act, key, offerId, want) {
  const { value, event } = await expectOne(w, act, key, ET.settlement)
  assert.equal(value, true, 'settle of a live offer did not return true')
  assert.equal(event.correlationId, offerId)
  assert.deepEqual(event.payload, want)
  return event
}
/** `settle` of an offer that is not live: resolves false and commits nothing. */
export async function settleRefused(w, offerId, settlement) {
  const { value } = await expectNone(w, () => w.routing.settle(offerId, settlement))
  assert.equal(value, false, 'settle of an offer that is not live did not return false')
}
/** A live ask from unmanaged S1 to the connected designated D: `{d, event, offerId, approvalId, promise}`. */
async function liveAsk(w) {
  const d = w.principal(ID.d, { connected: true, designated: true })
  w.session(S.s1)
  const { event, promise } = await askTo(w, S.s1, d)
  return { d, event, offerId: event.offer.offerId, approvalId: event.payload.approvalId, promise }
}
/**
 * Starts `start()` (an offer or ask call) with its mailbox commit held: resolves once that commit
 * waits, i.e. once the offer's step is in flight on the managed chain. Returns the call's promise,
 * the held draft and the gate.
 */
async function inFlight(w, type, start) {
  const gate = w.mailbox.holdNext((_, draft) => draft.type === type)
  const call = start()
  const { draft } = await gate.reached
  return { call, draft, gate }
}
/** Every settlement of `offerId` and every retirement of `eventId`, across every mailbox: [{key, e}]. */
export async function endsOf(w, offerId, eventId) {
  return (await allEntries(w)).filter(({ e }) => (e.type === ET.settlement && e.correlationId === offerId) || (e.type === ET.retirement && e.payload.retiredEventId === eventId))
}

function settleTransitions(sdk) {
  // ROUTE-ST-03 — One offer in C-ROUTE's live-offer ledger under settle (RELAYED.offerLedger).
  // States: Queued (its commit in flight on the managed chain), Live, Settled, Withdrawn, Retired.
  worldRow(sdk, 'ROUTE-ST-03', '1', 'Live → settle → Settled: true; one settlement to the pair that held it, correlationId = offerId, payload = the settlement', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    const s = settlementOf(offer.payload.approvalId)
    await settledTo(w, () => w.routing.settle(offer.offer.offerId, s), p, offer.offer.offerId, s)
  })
  worldRow(sdk, 'ROUTE-ST-03', '2', 'Settled → settle again → false; nothing committed', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    const s = settlementOf(offer.payload.approvalId)
    await settledTo(w, () => w.routing.settle(offer.offer.offerId, s), p, offer.offer.offerId, s)
    await settleRefused(w, offer.offer.offerId, s)
  })
  worldRow(sdk, 'ROUTE-ST-03', '3', 'no such offer → settle → false; nothing committed', async (w) => {
    await managedByP(w)
    await settleRefused(w, UNKNOWN_OFFER, settlementOf(MUTATION.unknownApproval))
  })
  worldRow(sdk, 'ROUTE-ST-03', '4', 'Live → withdraw → Withdrawn; then settle → false; nothing committed', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    assert.equal(await w.routing.withdraw(offer.offer.offerId), true)
    await until(async () => (await endsOf(w, offer.offer.offerId, offer.eventId)).length >= 1, 'the withdrawn offer\'s retirement')
    await settleRefused(w, offer.offer.offerId, settlementOf(offer.payload.approvalId))
  })
  worldRow(sdk, 'ROUTE-ST-03', '5', `Live → session_release → Retired (${RETIREMENT_REASON.released}); then settle → false; nothing committed`, async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    await expectRetirement(w, () => w.managed.release(S.s1, p), p, offer)
    await settleRefused(w, offer.offer.offerId, settlementOf(offer.payload.approvalId))
  })
  worldRow(sdk, 'ROUTE-ST-03', '6', 'Live ask → settle → Settled: one settlement to D; the waiting ask_agent resolves {ok: true, settlement}', async (w) => {
    const ask = await liveAsk(w)
    const s = settlementOf(ask.approvalId)
    await settledTo(w, () => w.routing.settle(ask.offerId, s), ask.d, ask.offerId, s)
    assert.deepEqual(await ask.promise, askSettled(s))
  })
  gatedRow(sdk, 'ROUTE-ST-03', '7', 'Queued (the offer\'s commit in flight) → settle → runs after the commit: true; the offer and one settlement in P\'s mailbox; a second settle → false', async (w) => {
    const { p } = await managedByP(w)
    const d = descriptor(ET.permission)
    const s = settlementOf(d.approvalId)
    const { value } = await expectEntries(w, async () => {
      const { call, gate } = await inFlight(w, ET.permission, () => w.routing.offer(S.s1, ET.permission, d))
      const settled = w.routing.settle(d.offerId, s)
      assert.equal(await settlesWithin(settled, WAIT.quietMs), false, 'settle answered before the offer\'s own commit ran (it is not on the managed chain)')
      gate.open()
      return { offered: await call, settled: await settled }
    }, 2)
    assert.equal(value.offered?.recipient, p)
    assert.equal(value.settled, true, 'settle of an offer still queued on the chain did not find it')
    const mine = await pendingOf(w, p)
    assert.deepEqual(mine.filter((e) => e.correlationId === d.offerId).map((e) => e.type).sort(), [ET.permission, ET.settlement].sort())
    assert.deepEqual(mine.find((e) => e.type === ET.settlement).payload, s)
    await settleRefused(w, d.offerId, s)
  })
  gatedRow(sdk, 'ROUTE-ST-03', '8', 'Queued ask (its commit in flight) → settle → true after the commit; one settlement to D; the waiting ask_agent resolves {ok: true, settlement}', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    let asked
    const { value } = await expectEntries(w, async () => {
      const flight = await inFlight(w, ET.ask, () => w.routing.askAgent(S.s1, { question: FIXTURE.question }))
      asked = flight.call
      const s = settlementOf(flight.draft.payload.approvalId)
      const settled = w.routing.settle(flight.draft.correlationId, s)
      assert.equal(await settlesWithin(settled, WAIT.quietMs), false, 'settle answered before the ask\'s own commit ran')
      flight.gate.open()
      return { s, offerId: flight.draft.correlationId, settled: await settled }
    }, 2)
    assert.equal(value.settled, true, 'settle of an ask still queued on the chain did not find it')
    const settlement = (await pendingOf(w, d)).filter((e) => e.type === ET.settlement)
    assert.deepEqual(settlement.map((e) => [e.correlationId, e.payload]), [[value.offerId, value.s]])
    assert.deepEqual(await asked, askSettled(value.s))
  })

  // ROUTE-DT-03 — settle(A) racing a management change or a withdraw of A. Both are queued, in
  // call order, behind a held commit of another offer B of S1, so their order on the managed chain
  // is the call order. Rules: whichever runs first wins; exactly one of settlement / retirement of A.
  const RACERS = Object.freeze({
    release: { end: (w, p) => w.managed.release(S.s1, p), value: () => ({ ok: true }), reason: RETIREMENT_REASON.released },
    revocation: { end: (w) => revokeEntry(w, ID.p, REVOCATION.disabled), value: () => undefined, reason: undefined },
    withdraw: { end: (w, p, offerId) => w.routing.withdraw(offerId), value: (endFirst) => endFirst, reason: RETIREMENT_REASON.withdrawn },
  })
  for (const [name, racer] of Object.entries(RACERS)) {
    for (const settleFirst of [true, false]) {
      const order = settleFirst ? `settle, then ${name}` : `${name}, then settle`
      const outcome = settleFirst ? 'settle true; one settlement of A to P; no retirement of A' : `settle false; one retirement of A${racer.reason ? ` (${racer.reason})` : ''} to P; no settlement`
      gatedRow(sdk, 'ROUTE-DT-03', `${name} ${settleFirst ? '1' : '2'}`, `${order} on the chain → ${outcome}`, async (w) => {
        const { p } = await managedByP(w)
        const a = await offerTo(w, S.s1, ET.permission, p)
        const s = settlementOf(a.payload.approvalId)
        const b = descriptor(ET.permission)
        const { call, gate } = await inFlight(w, ET.permission, () => w.routing.offer(S.s1, ET.permission, b))
        const run = { settle: () => w.routing.settle(a.offer.offerId, s), end: () => racer.end(w, p, a.offer.offerId) }
        const [first, second] = settleFirst ? [run.settle(), run.end()] : [run.end(), run.settle()]
        gate.open()
        const [settled, ended] = settleFirst ? [await first, await second] : [await second, await first]
        await call
        assert.equal(settled, settleFirst, `settle ${settleFirst ? 'lost to' : 'won over'} a ${name} that ran ${settleFirst ? 'after' : 'before'} it`)
        assert.deepEqual(ended, racer.value(!settleFirst))
        await until(async () => (await endsOf(w, a.offer.offerId, a.eventId)).length >= 1, 'a settlement or retirement of A')
        await quiet()
        const ends = await endsOf(w, a.offer.offerId, a.eventId)
        assert.deepEqual(ends.map((x) => [x.key, x.e.type]), [[p, settleFirst ? ET.settlement : ET.retirement]], 'not exactly one end of A')
        if (settleFirst) assert.deepEqual(ends[0].e.payload, s)
        else if (racer.reason !== undefined) assert.equal(ends[0].e.payload.reason, racer.reason)
      })
    }
  }
}

/** A `message_agent` payload with one image (K1 EVENT_PAYLOAD_SHAPES.message), so a nested field exists. */
const imaged = () => { const n = ++counter; return { text: FIXTURE.text(n), images: [MUTATION.image(n)] } }
/**
 * Writes a caller can make to a payload object (ROUTE-EP-02 partitions): top-level vs nested, and
 * the value left valid, of the wrong type, no JSON at all, or uncopyable. `valid`: whether the
 * payload still satisfies K1 after it.
 */
const PAYLOAD_MUTATIONS = Object.freeze({
  'top-level valid': { valid: true, apply: (m) => { m.text = MUTATION.text } },
  'top-level wrong type': { valid: false, apply: (m) => { m.text = MUTATION.wrongType } },
  'top-level non-JSON': { valid: false, apply: (m) => { m.text = MUTATION.nonJson } },
  'top-level function': { valid: false, apply: (m) => { m[MUTATION.extraKey] = () => MUTATION.text } },
  'top-level cycle': { valid: false, apply: (m) => { m[MUTATION.extraKey] = m } },
  'nested valid': { valid: true, apply: (m) => { m.images[0].attachmentId = MUTATION.text } },
  'nested wrong type': { valid: false, apply: (m) => { m.images[0].width = MUTATION.notAnImage } },
  'nested non-JSON': { valid: false, apply: (m) => { m.images[0].bytes = MUTATION.nonJson } },
  'nested entry replaced': { valid: false, apply: (m) => { m.images[0] = MUTATION.notAnImage } },
})
const TIMINGS = Object.freeze({ beforeResolve: 'before the call resolves', afterResolve: 'after the call resolves' })
/** Calls messageAgent with `m`, applying `mutate` at `timing`; returns the call's answer. */
async function callThenMutate(w, m, mutate, timing) {
  const pending = w.routing.messageAgent(S.s1, m)
  if (timing === TIMINGS.beforeResolve) mutate(m)
  const value = await pending
  if (timing === TIMINGS.afterResolve) mutate(m)
  return value
}
/** The payloads of the `message` events pending in `key`'s mailbox, in mailbox order. */
const messagePayloads = async (w, key) => (await pendingOf(w, key)).filter((e) => e.type === ET.message).map((e) => e.payload)
/** Designates D (offline) and waits until `want` are its messages, exactly and in order; a new message then follows them. */
async function flushedAs(w, want) {
  const d = w.principal(ID.d)
  designate(w, ID.d)
  await until(async () => (await messagePayloads(w, d)).length >= want.length, `${want.length} held messages in D's mailbox`)
  await quiet()
  assert.deepEqual(await messagePayloads(w, d), want, 'the held queue flushed something other than the payloads as they were at their calls')
  const next = await messageTo(w, S.s1, d)
  assert.deepEqual(await messagePayloads(w, d), [...want, next.payload], 'a new message did not follow the flushed ones')
}
/** README's "refused at the call": a TypeError thrown synchronously by `call`, not a promise. */
export function refusedAtCall(call) {
  let result
  try { result = call() } catch (e) {
    assert.ok(e instanceof TypeError, `refused with ${e?.name}, not TypeError`)
    return
  }
  Promise.resolve(result).catch(() => {})
  assert.fail('not refused at the call: it returned instead of throwing a TypeError')
}

function payloadPartitions(sdk) {
  // ROUTE-EP-02 — message_agent's payload is taken as it was at the call (merge review fix 1).
  for (const [name, mutation] of Object.entries(PAYLOAD_MUTATIONS)) {
    for (const timing of Object.values(TIMINGS)) {
      worldRow(sdk, 'ROUTE-EP-02', `held ${name} ${timing === TIMINGS.beforeResolve ? 'early' : 'late'}`, `no recipient: payload held, then ${name} mutation ${timing} → the flush carries the payload as at the call; the next held and a new message follow in order`, async (w) => {
        w.session(S.s1)
        const first = imaged()
        const want = structuredClone(first)
        const { value } = await expectNone(w, () => callThenMutate(w, first, mutation.apply, timing))
        assert.deepEqual(value, { ok: true })
        const second = await messageHeld(w)
        await flushedAs(w, [want, second])
      })
      worldRow(sdk, 'ROUTE-EP-02', `routed ${name} ${timing === TIMINGS.beforeResolve ? 'early' : 'late'}`, `D designated: ${name} mutation ${timing} → D's message carries the payload as at the call; the next message follows`, async (w) => {
        const d = w.principal(ID.d, { connected: true, designated: true })
        w.session(S.s1)
        const m = imaged()
        const want = structuredClone(m)
        const { value, event } = await expectOne(w, () => callThenMutate(w, m, mutation.apply, timing), d, ET.message)
        assert.deepEqual(value, { ok: true })
        assert.deepEqual(event.payload, want)
        await messageTo(w, S.s1, d)
      })
    }
    if (mutation.valid) continue
    worldRow(sdk, 'ROUTE-EP-02', `call ${name} held`, `no recipient: a payload already ${name} at the call → TypeError at the call; nothing held (only the valid messages around it flush)`, async (w) => {
      w.session(S.s1)
      const before = await messageHeld(w)
      const bad = imaged()
      mutation.apply(bad)
      await expectNone(w, () => refusedAtCall(() => w.routing.messageAgent(S.s1, bad)))
      const after = await messageHeld(w)
      await flushedAs(w, [before, after])
    })
    worldRow(sdk, 'ROUTE-EP-02', `call ${name} routed`, `D designated: a payload already ${name} at the call → TypeError at the call; nothing committed; the next message goes through`, async (w) => {
      const d = w.principal(ID.d, { connected: true, designated: true })
      w.session(S.s1)
      const bad = imaged()
      mutation.apply(bad)
      await expectNone(w, () => refusedAtCall(() => w.routing.messageAgent(S.s1, bad)))
      await messageTo(w, S.s1, d)
    })
  }

  // ROUTE-EP-03 — settle's settlement payload: taken as it was at the call; an uncopyable or
  // schema-invalid one is refused (TypeError) and leaves the offer live.
  worldRow(sdk, 'ROUTE-EP-03', '1', 'ask settled, then the settlement\'s top-level outcome changed before settle resolves → the committed payload and the ask\'s answer are as at the call', async (w) => {
    const ask = await liveAsk(w)
    const s = settlementOf(ask.approvalId)
    const want = structuredClone(s)
    await settledTo(w, () => { const pending = w.routing.settle(ask.offerId, s); s.outcome = SETTLEMENT_OUTCOME.rejected; return pending }, ask.d, ask.offerId, want)
    assert.deepEqual(await ask.promise, askSettled(want))
  })
  worldRow(sdk, 'ROUTE-EP-03', '2', 'question offer settled answered, then a nested answer changed before settle resolves → the committed payload is as at the call', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.question, p)
    const s = { ...settlementOf(offer.payload.approvalId, SETTLEMENT_OUTCOME.answered), answers: [structuredClone(SETTLE_FIXTURE.answer)] }
    const want = structuredClone(s)
    await settledTo(w, () => { const pending = w.routing.settle(offer.offer.offerId, s); s.answers[0].selected.push(SETTLE_FIXTURE.otherChoice); return pending }, p, offer.offer.offerId, want)
  })
  gatedRow(sdk, 'ROUTE-EP-03', '3', 'settle queued behind the ask\'s in-flight commit; the settlement changed while queued → the committed payload and the ask\'s answer are as at the call', async (w) => {
    const d = w.principal(ID.d, { connected: true, designated: true })
    w.session(S.s1)
    const { call, draft, gate } = await inFlight(w, ET.ask, () => w.routing.askAgent(S.s1, { question: FIXTURE.question }))
    const s = settlementOf(draft.payload.approvalId)
    const want = structuredClone(s)
    const settled = w.routing.settle(draft.correlationId, s)
    s.outcome = SETTLEMENT_OUTCOME.rejected
    s.by = SETTLED_BY.user
    gate.open()
    assert.equal(await settled, true)
    await until(async () => (await pendingOf(w, d)).some((e) => e.type === ET.settlement), 'the settlement in D\'s mailbox')
    assert.deepEqual((await pendingOf(w, d)).filter((e) => e.type === ET.settlement).map((e) => e.payload), [want])
    assert.deepEqual(await call, askSettled(want))
  })
  /** Settlements no K1 settlement payload allows: uncopyable (b) and copyable but schema-invalid (c). */
  const BAD_SETTLEMENTS = Object.freeze({
    'uncopyable function': (s) => { s[MUTATION.extraKey] = () => MUTATION.text },
    'uncopyable cycle': (s) => { s[MUTATION.extraKey] = s },
    'non-JSON outcome': (s) => { s.outcome = MUTATION.nonJson },
    'outcome not a K1 outcome': (s) => { s.outcome = SETTLE_FIXTURE.badOutcome },
    'by missing': (s) => { delete s.by },
    'approvalId of the wrong type': (s) => { s.approvalId = MUTATION.wrongType },
    'an extra member': (s) => { s[MUTATION.extraKey] = MUTATION.text },
  })
  /** Settles `ask` with a settlement made bad by `spoil`: rejects TypeError, nothing committed, the ask still waits. */
  async function badSettleKeepsLive(w, ask, spoil) {
    const bad = settlementOf(ask.approvalId)
    spoil(bad)
    await expectNone(w, () => assert.rejects(() => w.routing.settle(ask.offerId, bad), TypeError))
    assert.equal(await settlesWithin(ask.promise, WAIT.quietMs), false, 'a refused settlement answered the waiting ask')
  }
  for (const [name, spoil] of Object.entries(BAD_SETTLEMENTS)) {
    worldRow(sdk, 'ROUTE-EP-03', `bad ${name}`, `settle with a settlement whose ${name} → rejects TypeError; nothing committed; the ask still waits; a later valid settle → true, one settlement, the ask answered`, async (w) => {
      const ask = await liveAsk(w)
      await badSettleKeepsLive(w, ask, spoil)
      const s = settlementOf(ask.approvalId)
      await settledTo(w, () => w.routing.settle(ask.offerId, s), ask.d, ask.offerId, s)
      assert.deepEqual(await ask.promise, askSettled(s))
    })
  }
  worldRow(sdk, 'ROUTE-EP-03', 'bad then withdraw', `a refused settlement, then withdraw → true; one retirement (${RETIREMENT_REASON.withdrawn}) of the ask to D; the ask answers ${REFUSAL.unavailable}`, async (w) => {
    const ask = await liveAsk(w)
    await badSettleKeepsLive(w, ask, BAD_SETTLEMENTS['outcome not a K1 outcome'])
    assert.equal(await w.routing.withdraw(ask.offerId), true, 'withdraw did not find the ask live after a refused settlement')
    await until(async () => (await endsOf(w, ask.offerId, ask.event.eventId)).length >= 1, 'the ask\'s retirement')
    await quiet()
    const ends = await endsOf(w, ask.offerId, ask.event.eventId)
    assert.deepEqual(ends.map((x) => [x.key, x.e.type, x.e.payload.reason]), [[ask.d, ET.retirement, RETIREMENT_REASON.withdrawn]])
    assert.deepEqual(await ask.promise, { ok: false, code: REFUSAL.unavailable })
  })
}

// ================================================================================================
// K1 amendment at the W3 merge (DECIDED #W3-1, the fix of W2 finding SF3): `Mailbox.retire`
// resolves `{retired: boolean}`. When C-ROUTE retires a live offer (permission, question,
// plan-review) its ledger has not seen acked, it calls `retire`; on `{retired: false}` (an
// `inbox_ack` landed before the retire, before its `onAcked` listener marked the offer acked) it
// commits a fresh `retirement {retiredEventId, reason}` to the same pair, as it does for an offer it
// knows is acked; on `{retired: true}` nothing more. Every cause: withdraw (`withdrawn`), release
// and Take back (`released`), revocation (`revoked`).
//   ROUTE-DT-04  ledger acked × retire's answer × cause (one test per rule)
//   ROUTE-EP-04  the race for each offer type
//   ROUTE-ST-04  the race as transitions: ack resolved, onAcked late, then the cause; and the late ack
// The oracle in every rule is the pair's view: exactly one `retirement` naming the offer's event,
// in the pair's mailbox, with the cause's reason; the offer's event no longer pending; nothing else.
// ================================================================================================

/** How a live offer of S1 (managed by P) is retired: the call, what it answers, its reason, and any other event it makes. */
const RETIRE_CAUSES = Object.freeze({
  withdraw: { act: (w, p, offerId) => w.routing.withdraw(offerId), value: true, reason: RETIREMENT_REASON.withdrawn, extras: [] },
  release: { act: (w, p) => w.managed.release(S.s1, p), value: { ok: true }, reason: RETIREMENT_REASON.released, extras: [] },
  takeBack: { act: (w) => w.handover.takeBack(S.s1, FIXTURE.note), value: { ok: true }, reason: RETIREMENT_REASON.released, extras: [ET.takeback] },
  revocation: { act: (w) => revokeEntry(w, ID.p, REVOCATION.disabled), value: undefined, reason: RETIREMENT_REASON.revoked, extras: [] },
})
/** P's offer as P's client acks it through the port (`inbox_ack`): resolves `{ok: true, acked: 1}`. */
export async function ackOffer(w, p, offer) {
  assert.deepEqual(await w.mailbox.ack(p, [{ eventId: offer.eventId, payloadDigest: offer.payloadDigest }]), { ok: true, acked: 1 })
}
/**
 * Runs `cause` on `offer` (held by `p`) and checks the pair's view: its answer, then exactly one
 * new `retirement` across every mailbox, in `p`'s, `{retiredEventId: offer.eventId, reason}`, plus
 * only the cause's own extra events; the offer's event is pending nowhere.
 */
async function retiredOnce(w, cause, p, offer) {
  const { value, fresh } = await expectEntries(w, () => cause.act(w, p, offer.offer.offerId), 1 + cause.extras.length)
  assert.deepEqual(value, cause.value)
  assert.deepEqual(fresh.map((x) => x.e.type).sort(), [ET.retirement, ...cause.extras].sort(), 'the cause produced something other than one retirement (and its own events)')
  const retirement = fresh.find((x) => x.e.type === ET.retirement)
  assert.equal(retirement.key, p, 'the retirement went to another pair')
  assert.deepEqual(retirement.e.payload, { retiredEventId: offer.eventId, reason: cause.reason })
  assert.ok(!(await allEntries(w)).some((x) => x.e.eventId === offer.eventId), 'the retired offer\'s event is still pending')
}
/** C-ROUTE's `retire` calls for `offer` with the mailbox's answers (fakes.mjs mailboxPort `retires`). */
const retiresOf = (w, offer) => w.mailbox.retires.filter((r) => r.eventId === offer.eventId).map(({ principalKey, reason, outcome }) => ({ principalKey, reason, outcome }))
/** A row on a world whose port tells `onAcked` of an ack only on `announceAcks()` (fakes.mjs lateAckPort). */
const lateAckRow = (sdk, id, part, title, fn) => row(sdk, id, part, title, async (t) => fn(await routeWorld(t, sdk, { port: lateAckPort })))
/** P manages S1 and holds one live offer of `type`, whose `inbox_ack` has landed but `onAcked` has not fired yet. */
async function racedOffer(w, type) {
  const { p } = await managedByP(w)
  const offer = await offerTo(w, S.s1, type, p)
  await ackOffer(w, p, offer)
  return { p, offer }
}

function retireOutcomeTables(sdk) {
  const R = RETIRE_OUTCOME
  // ROUTE-DT-04 — conditions: the ledger saw the ack (yes / no) × retire's answer (true / false) ×
  // cause. "Ledger acked: yes" needs no retire answer (the rule's "—"); "no × false" is the SF3 race.
  for (const [name, cause] of Object.entries(RETIRE_CAUSES)) {
    worldRow(sdk, 'ROUTE-DT-04', `${name} 1`, `ledger not acked, retire → {retired: true} (${cause.reason}): the offer's event replaced; no fresh retirement (exactly one in all)`, async (w) => {
      const { p } = await managedByP(w)
      const offer = await offerTo(w, S.s1, ET.permission, p)
      await retiredOnce(w, cause, p, offer)
      assert.deepEqual(retiresOf(w, offer), [{ principalKey: p, reason: cause.reason, outcome: R.replaced }], 'C-ROUTE did not retire the pending offer through Mailbox.retire')
    })
    lateAckRow(sdk, 'ROUTE-DT-04', `${name} 2`, `ledger not acked (ack landed, onAcked not yet fired), retire → {retired: false} (${cause.reason}): one fresh retirement naming the offer to the pair`, async (w) => {
      const { p, offer } = await racedOffer(w, ET.permission)
      await retiredOnce(w, cause, p, offer)
      assert.deepEqual(retiresOf(w, offer), [{ principalKey: p, reason: cause.reason, outcome: R.nothing }], 'C-ROUTE did not call Mailbox.retire for an offer its ledger had not seen acked')
    })
    worldRow(sdk, 'ROUTE-DT-04', `${name} 3`, `ledger acked (onAcked fired) (${cause.reason}): one fresh retirement naming the offer to the pair, never two`, async (w) => {
      const { p } = await managedByP(w)
      const offer = await offerTo(w, S.s1, ET.permission, p)
      await ackOffer(w, p, offer)
      await retiredOnce(w, cause, p, offer)
    })
  }

  // ROUTE-EP-04 — the race for every offer type (permission is ROUTE-DT-04's).
  for (const type of OFFER_TYPES.filter((x) => x !== ET.permission)) {
    lateAckRow(sdk, 'ROUTE-EP-04', type, `a ${type} offer acked just before withdraw (onAcked late) → retire {retired: false}; one fresh retirement (${RETIREMENT_REASON.withdrawn}) to the pair`, async (w) => {
      const { p, offer } = await racedOffer(w, type)
      await retiredOnce(w, RETIRE_CAUSES.withdraw, p, offer)
      assert.deepEqual(retiresOf(w, offer).map((r) => r.outcome), [R.nothing])
    })
  }

  // ROUTE-ST-04 — the SF3 race as a sequence: Live → ack resolves (onAcked pending) → withdraw →
  // Withdrawn with one fresh retirement → onAcked fires late → nothing more; settle → false.
  lateAckRow(sdk, 'ROUTE-ST-04', '1', 'Live → ack resolved, onAcked not fired → withdraw → one fresh retirement → the late onAcked → nothing more; settle → false', async (w) => {
    const { p, offer } = await racedOffer(w, ET.permission)
    await retiredOnce(w, RETIRE_CAUSES.withdraw, p, offer)
    await expectNone(w, () => w.mailbox.announceAcks())
    await settleRefused(w, offer.offer.offerId, settlementOf(offer.payload.approvalId))
  })
  lateAckRow(sdk, 'ROUTE-ST-04', '2', 'Live → withdraw ({retired: true}) → Withdrawn → the pair acks the offer\'s old receipt (acked 0) and onAcked fires → nothing more', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    await retiredOnce(w, RETIRE_CAUSES.withdraw, p, offer)
    assert.deepEqual(await w.mailbox.ack(p, [{ eventId: offer.eventId, payloadDigest: offer.payloadDigest }]), { ok: true, acked: 0 })
    await expectNone(w, () => w.mailbox.announceAcks())
  })
  lateAckRow(sdk, 'ROUTE-ST-04', '3', 'two live offers, one acked just before release (onAcked late) → release: one retirement each (released), the acked one fresh, the pending one by retire', async (w) => {
    const { p, offer: acked } = await racedOffer(w, ET.permission)
    const pending = await offerTo(w, S.s1, ET.question, p)
    const { fresh } = await expectEntries(w, () => w.managed.release(S.s1, p), 2)
    assert.deepEqual(fresh.map((x) => [x.key, x.e.type, x.e.payload.reason, x.e.payload.retiredEventId]).sort(),
      [[p, ET.retirement, RETIREMENT_REASON.released, acked.eventId], [p, ET.retirement, RETIREMENT_REASON.released, pending.eventId]].sort())
    assert.deepEqual(retiresOf(w, acked).map((r) => r.outcome), [R.nothing])
    assert.deepEqual(retiresOf(w, pending).map((r) => r.outcome), [R.replaced])
  })
}

// ------------------------------------------------------------------------------------------------

export function registerRouteCases(sdk) {
  useCases(sdk)
  equivalencePartitions(sdk)
  boundaryValues(sdk)
  decisionTables(sdk)
  stateTransitions(sdk)
  settleTransitions(sdk)
  payloadPartitions(sdk)
  retireOutcomeTables(sdk)
}
