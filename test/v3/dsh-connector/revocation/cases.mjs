/**
 * C-REVOKE step 1 black-box cases: routing's `endPrincipal` (C-WIRE-2 removed `askDropped`: no
 * ask_agent, the user's "不给ask_agent工具"), and K1d
 * `Mailbox.retire` misuse. Written from the requirements only (design/v3 @ 9a531192:
 * docs/planning/v3-design.md §5.3; v3-requirements.md R-TOK-05, R-ROUTE-06, R-WATCH-01, R-CON-05;
 * K1 / K1d `mcp-schema/index.d.ts` `Mailbox`) and the step-1 routing surface the dev session
 * relayed (subject.mjs). No file of packages/dsh-connector/src/routing/ or src/mailbox/ was read.
 *
 * Level: the REAL C-ROUTE routing module over the REAL C-MAILBOX and real DSH storage of the SDK
 * under test, with the C-ROUTE suite's fakes for pairs, tokens, presence, settings and sessions
 * (subject.mjs). Step 2's handler does not exist yet, so each row plays C-REVOKE's sequencing
 * itself: a disable is `tokens.disable` + `Mailbox.hold` + `endPrincipal(e, {freshRetirements:
 * true})` (+ `release` on re-enable); a delete is `tokens.remove` + `endPrincipal(e,
 * {freshRetirements: false})` + `Mailbox.drop` + `askDropped` for each dropped ask.
 *
 * ── Use Cases ────────────────────────────────────────────────────────────────────────────────
 * REV-UC-01 Disable an entry whose principal P manages sessions.
 *   Pre: P manages S1 (a pending permission, an acked question) and S2 (a pending plan-review and
 *   an ask that waits); Q manages S3 with its own pending offer.
 *   Main: 1. the entry is disabled; 2. P's mailbox is held; 3. endPrincipal(E_P, fresh: true)
 *   resolves {principalKey: P, sessions: [S1, S2], offers: the three non-ask offers};
 *   4. S1 and S2 are unmanaged, S3 still Q's; 5. on re-enable (release) P polls a `revoked`
 *   retirement for each pending offer instead of the offer, a fresh one for the acked offer, and
 *   the ask still pending; S1's later turns reach nobody; 6. the retired offers are no longer live
 *   (settle / withdraw false); the asker keeps waiting with no timer (R-CON-05).
 *   A1: re-enabled → the ask is still live: answering it answers the asker.
 *   E1: the entry has no known principal → {principalKey: undefined, sessions: [], offers: []}.
 *   Post (step 2, handler-cases.mjs): one system note per ended session; streams close; the
 *   30-day hold ends in a drop.
 * REV-UC-02 Delete an entry whose principal P manages sessions (same Pre).
 *   Main: 1. the entry is deleted; 2. endPrincipal(E_P, fresh: false) resolves the same listing;
 *   3. every `revoked` retirement has run before `Mailbox.drop`; no fresh retirement is committed
 *   for the acked offer; 4. drop returns the ask's offer id; askDropped answers the asker
 *   `unavailable`; 5. P's mailbox is empty; Q is untouched.
 *   Post (step 2, handler-cases.mjs): the pair is removed; the designated role is cleared.
 *
 * ── Techniques ───────────────────────────────────────────────────────────────────────────────
 * EP   REV-EP-01 entryKey (misuse / unknown / never paired / paired / disabled / pair removed in
 *      the same sync), REV-EP-02 options, REV-EP-03 offer types (+ ask), REV-EP-04 Mailbox.retire
 *      arguments (misuse vs data), REV-EP-05 scope (only that principal).
 * BVA  REV-BVA-01 managed sessions 0 / 1 / 2, live offers 0 / 1 / 2, key length 0 / 1,
 *      the empty event id on a held box.
 * DT   REV-DT-01 kind (disable / delete) × offer state (pending / acked / ask) × box held at
 *      endPrincipal (no / yes); REV-DT-02 routing's ledger saw the ack (no: retire says
 *      {retired: false}) × freshRetirements.
 * ST   REV-ST-01 management (Managed(P) → Unmanaged; onRevoked alone changes nothing; second
 *      call; durable), REV-ST-02 offer (Live → Retired; failing and slow retirements),
 *      REV-ST-03 box (Pending / Held → Released / Dropped, both hold orders).
 *
 * Not here (user Q4, "as it is"): a `session_start` landing just after a revocation gets no
 * special check, so no row is written for it.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import {
  ackOffer, counting, expectEntries, expectNone, managedByP, managedSet, manage, offerTo, pendingOf, quiet,
  refusedAtCall, settleRefused, settlementOf, settlesWithin, unwatched, until,
} from '../routing/cases.mjs'
import {
  CASE, EVENT_TYPE, FIXTURE, LOGGED_LEVELS, MISUSE, OFFER_TYPES, OP, RETIREMENT_REASON, RETIRE_OUTCOME, REVOCATION,
  WAIT,
} from './constants.mjs'
import { revocationWorld } from './subject.mjs'

const T = { timeout: WAIT.testMs }
const { ids: ID, sessions: S } = FIXTURE
const ET = EVENT_TYPE
const REVOKED = RETIREMENT_REASON.revoked
/**
 * C-WIRE-2 (the user: "不给ask_agent工具"): nothing produces an `ask`, so no asker exists and
 * `Mailbox.drop`'s `droppedAsks` is always empty (K1 keeps the field; C-MAILBOX is unchanged).
 */
const NO_ASK = 'withdrawn by C-WIRE-2: the user "不给ask_agent工具" — no ask_agent, so no ask offer, no asker and no askDropped (第三版其实就是第一版)'

// ------------------------------------------------------------------------------------------------
// Row registration

export function row(sdk, id, part, title, fn, todo) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, T, fn)
}
/** A row a later decision withdrew: still listed, skipped with the decision. */
export const withdrawnRow = (sdk, id, part, title, reason) => test(caseName(sdk, id, part, title), { skip: reason }, () => {})
export { NO_ASK }
const worldRow = (sdk, id, part, title, fn, opts) => row(sdk, id, part, title, async (t) => fn(await revocationWorld(t, sdk, opts)))

// ------------------------------------------------------------------------------------------------
// Steps and oracles

/** How C-REVOKE revokes (step 2's handler, played by the rows): the token change and the fresh flag. */
const KIND = Object.freeze({
  disable: { revocation: REVOCATION.disabled, fresh: true, token: (w, id) => w.tokens.disable(id) },
  delete: { revocation: REVOCATION.deleted, fresh: false, token: (w, id) => w.tokens.remove(id) },
})
const endPrincipal = (w, id, fresh) => w.routing.endPrincipal(FIXTURE.entry(id), { freshRetirements: fresh })
const hold = (w, key) => w.mailbox.hold(key, w.clock.now())

const byOffer = (a, b) => a.offerId.localeCompare(b.offerId)
/** endPrincipal's answer as plain sorted data (its lists are in no order the contract names). */
const plain = (r) => ({ principalKey: r.principalKey, sessions: [...r.sessions].sort(), offers: [...r.offers].map((o) => ({ ...o })).sort(byOffer) })
/** The listing an offer event should have in endPrincipal's `offers`. */
export const listed = (e) => ({ offerId: e.offer.offerId, sessionId: e.sourceSessionId, type: e.type })
const ended = (principalKey, sessions, offers) => ({ principalKey, sessions: [...sessions].sort(), offers: offers.map(listed).sort(byOffer) })
const NOTHING = Object.freeze({ principalKey: undefined, sessions: [], offers: [] })

/** The journal entries of `op` (fakes.mjs revocationPort), optionally only those naming `eventId`. */
export const journalOf = (w, op, eventId) => w.mailbox.journal.filter((j) => j.op === op && (eventId === undefined || j.eventId === eventId || j.retiredEventId === eventId))
export const retirementsNaming = (events, eventId) => events.filter((e) => e.type === ET.retirement && e.payload.retiredEventId === eventId)

/** `events` (a pair's pending list) holds exactly one `revoked` retirement naming `offer`, and not `offer` itself. */
export function assertRetiredIn(events, offer) {
  assert.ok(!events.some((e) => e.eventId === offer.eventId), `the retired ${offer.type} offer is still pending`)
  assert.deepEqual(retirementsNaming(events, offer.eventId).map((e) => e.payload), [{ retiredEventId: offer.eventId, reason: REVOKED }], 'not exactly one revoked retirement naming the offer')
}
/** routing retired `offer` through Mailbox.retire and the mailbox replaced it ({retired: true}). */
function assertReplacedByRetire(w, p, offer) {
  assert.deepEqual(journalOf(w, OP.retire, offer.eventId).map((j) => [j.principalKey, j.reason, j.outcome]), [[p, REVOKED, RETIRE_OUTCOME.replaced]],
    'the pending offer was not replaced by one Mailbox.retire(…, revoked) answering {retired: true}')
}
/** routing committed exactly `n` fresh `revoked` retirements naming `offer`, to `p`. */
function assertFreshRetirements(w, p, offer, n) {
  const fresh = journalOf(w, OP.freshRetirement, offer.eventId)
  assert.deepEqual(fresh.map((j) => [j.principalKey, j.reason]), Array.from({ length: n }, () => [p, REVOKED]), `expected ${n} fresh retirement(s) of the acked offer`)
}
/** Every retirement (retire or fresh) the journal holds ran before the first `drop` started. */
export function assertRetiredBeforeDrop(w) {
  const at = w.mailbox.journal.findIndex((j) => j.op === OP.drop)
  assert.ok(at >= 0, 'no drop was journaled')
  const late = w.mailbox.journal.slice(at).filter((j) => j.op === OP.retire || j.op === OP.freshRetirement)
  assert.deepEqual(late, [], 'a retirement ran after Mailbox.drop began')
}
/** The offer is no longer live: settle and withdraw of it both resolve false, and commit nothing. */
export async function assertNotLive(w, offer) {
  await settleRefused(w, offer.offer.offerId, settlementOf(offer.payload.approvalId))
  assert.equal(await w.routing.withdraw(offer.offer.offerId), false, 'withdraw of a revoked offer found it live')
}
/**
 * Drops `key`'s mailbox as C-REVOKE does on delete. C-WIRE-2: no ask exists, so `droppedAsks` is
 * always empty and there is no askDropped to call (the user: "不给ask_agent工具").
 * The deleted pair's mailbox is gone, so it leaves the world's observed keys (K1 does not say
 * whether a box dropped while held still refuses poll); rows check it with `assertDroppedEmpty`.
 */
async function dropAndAnswer(w, key) {
  const dropped = await w.mailbox.drop(key)
  w.keys.delete(key)
  assert.deepEqual([...(dropped.droppedAsks ?? [])], [], 'a dropped mailbox held an ask')
  return dropped
}
/** The dropped pair's summary counts nothing pending (the one read K1 defines for any key, as the C-MAILBOX suite reads it). */
export async function assertDroppedEmpty(w, key) {
  assert.equal((await w.realMailbox.summary(key)).pending, 0, 'something is pending in the dropped mailbox')
}
/** New warn / error log lines since `before` lines. */
const loggedSince = (w, before) => w.logger.lines.slice(before).filter((l) => LOGGED_LEVELS.includes(l.level))

/**
 * The UC world: P manages S1 (pending permission, acked question) and S2 (pending plan-review);
 * Q manages S3 with a pending permission. Returns the events. (C-WIRE-2: no ask, "不给ask_agent工具".)
 */
async function ucWorld(w) {
  const { p } = await managedByP(w)
  const q = w.principal(ID.q, { connected: true })
  w.session(S.s2)
  w.session(S.s3)
  await manage(w, S.s2, p)
  await manage(w, S.s3, q)
  const permission = await offerTo(w, S.s1, ET.permission, p)
  const question = await offerTo(w, S.s1, ET.question, p)
  await ackOffer(w, p, question)
  const planReview = await offerTo(w, S.s2, ET.planReview, p)
  const qOffer = await offerTo(w, S.s3, ET.permission, q)
  return { p, q, permission, question, planReview, qOffer, offers: [permission, question, planReview] }
}
/** Q is untouched: S3 still Q's, Q's offer still pending with no retirement naming it. */
async function assertQUntouched(w, x) {
  assert.equal(w.managed.managerOf(S.s3), x.q, 'another principal\'s session was ended')
  const qs = await pendingOf(w, x.q)
  assert.ok(qs.some((e) => e.eventId === x.qOffer.eventId), 'Q\'s offer left Q\'s mailbox')
  assert.deepEqual(retirementsNaming(qs, x.qOffer.eventId), [])
}

// ================================================================================================
// Use Cases
// ================================================================================================

function useCases(sdk) {
  worldRow(sdk, CASE.uc01, 'main', 'disable: hold, endPrincipal(fresh: true) → P\'s sessions unmanaged; pending offers replaced by revoked retirements, the acked one gets a fresh one; after release P polls them; Q untouched', async (w) => {
    const x = await ucWorld(w)
    KIND.disable.token(w, ID.p)
    await hold(w, x.p)
    const r = await endPrincipal(w, ID.p, KIND.disable.fresh)
    assert.deepEqual(plain(r), ended(x.p, [S.s1, S.s2], x.offers))
    assert.deepEqual([w.managed.managerOf(S.s1), w.managed.managerOf(S.s2)], [undefined, undefined])
    await w.mailbox.release(x.p)
    const events = await pendingOf(w, x.p)
    for (const offer of [x.permission, x.planReview]) assertRetiredIn(events, offer)
    assert.deepEqual(retirementsNaming(events, x.question.eventId).map((e) => e.payload), [{ retiredEventId: x.question.eventId, reason: REVOKED }], 'the acked offer got no fresh retirement')
    for (const offer of x.offers) await assertNotLive(w, offer)
    await assertQUntouched(w, x)
    await unwatched(w, S.s1)
  })
  withdrawnRow(sdk, CASE.uc01, 'A1', 're-enabled after a disable → the ask is still live: settling it answers the asker', NO_ASK)
  worldRow(sdk, CASE.uc01, 'E1', 'an entry with no known principal (never paired) → {principalKey: undefined, sessions: [], offers: []}; nothing produced', async (w) => {
    await managedByP(w)
    w.principal(ID.x, { paired: false })
    const { value } = await expectNone(w, () => endPrincipal(w, ID.x, true))
    assert.deepEqual(plain(value), NOTHING)
  })

  worldRow(sdk, CASE.uc02, 'main', 'delete: endPrincipal(fresh: false) then drop → retirements all before the drop, no fresh retirement for the acked offer; no dropped ask; P\'s mailbox empty; Q untouched', async (w) => {
    const x = await ucWorld(w)
    KIND.delete.token(w, ID.p)
    const r = await endPrincipal(w, ID.p, KIND.delete.fresh)
    assert.deepEqual(plain(r), ended(x.p, [S.s1, S.s2], x.offers))
    assert.deepEqual([w.managed.managerOf(S.s1), w.managed.managerOf(S.s2)], [undefined, undefined])
    const dropped = await dropAndAnswer(w, x.p)
    assertRetiredBeforeDrop(w)
    for (const offer of [x.permission, x.planReview]) assertReplacedByRetire(w, x.p, offer)
    assert.deepEqual(journalOf(w, OP.freshRetirement), [], 'a fresh retirement was committed on a delete')
    assert.deepEqual([...dropped.droppedAsks], [])
    for (const offer of x.offers) await assertNotLive(w, offer)
    await assertDroppedEmpty(w, x.p)
    await assertQUntouched(w, x)
  })
  worldRow(sdk, CASE.uc02, 'contrast', 'the same world disabled instead → a fresh retirement for the acked offer, and nothing dropped', async (w) => {
    const x = await ucWorld(w)
    KIND.disable.token(w, ID.p)
    await hold(w, x.p)
    await endPrincipal(w, ID.p, KIND.disable.fresh)
    assertFreshRetirements(w, x.p, x.question, 1)
    assert.deepEqual(journalOf(w, OP.drop), [])
  })
}

// ================================================================================================
// Equivalence Partitioning
// ================================================================================================

/** Whatever `call` does, it throws TypeError synchronously and changes nothing (managed set, mailboxes, journal). */
async function misuseChangesNothing(w, call) {
  const managed = managedSet(w)
  const journal = w.mailbox.journal.length
  await expectNone(w, () => refusedAtCall(call))
  assert.deepEqual(managedSet(w), managed, 'a misuse changed the managed set')
  assert.equal(w.mailbox.journal.length, journal, 'a misuse reached the mailbox')
}
/** P's mailbox as a misuse may not change it: its summary, its pending ids, and the hints sent. */
async function boxState(w, key, { held = false } = {}) {
  return {
    summary: await w.realMailbox.summary(key),
    events: held ? null : (await pendingOf(w, key)).map((e) => e.eventId),
    hints: w.hints.calls.length,
  }
}

function equivalencePartitions(sdk) {
  // REV-EP-01 — entryKey.
  for (const [name, entryKey] of Object.entries(MISUSE.entryKeys)) {
    worldRow(sdk, CASE.ep01, `misuse ${name}`, `entryKey ${name} → TypeError at the call; management, offers and mailboxes unchanged`, async (w) => {
      const { p } = await managedByP(w)
      const offer = await offerTo(w, S.s1, ET.permission, p)
      await misuseChangesNothing(w, () => w.routing.endPrincipal(entryKey, { freshRetirements: true }))
      assert.equal(w.managed.managerOf(S.s1), p)
      assert.equal(await w.routing.withdraw(offer.offer.offerId), true, 'the offer is not live after a refused endPrincipal')
    })
  }
  worldRow(sdk, CASE.ep01, 'unknown entry', 'an entry key no token entry has → {principalKey: undefined, sessions: [], offers: []}; P keeps managing', async (w) => {
    const { p } = await managedByP(w)
    const { value } = await expectNone(w, () => w.routing.endPrincipal(MISUSE.unknownEntry, { freshRetirements: true }))
    assert.deepEqual(plain(value), NOTHING)
    assert.equal(w.managed.managerOf(S.s1), p)
  })
  worldRow(sdk, CASE.ep01, 'current pair', 'an enabled, paired entry → its principal key; its sessions ended', async (w) => {
    const { p } = await managedByP(w)
    const r = await endPrincipal(w, ID.p, true)
    assert.deepEqual(plain(r), ended(p, [S.s1], []))
  })
  worldRow(sdk, CASE.ep01, 'disabled', 'an entry already disabled in TokenRegistry, pair kept → its principal key; its sessions ended', async (w) => {
    const { p } = await managedByP(w)
    KIND.disable.token(w, ID.p)
    assert.deepEqual(plain(await endPrincipal(w, ID.p, true)), ended(p, [S.s1], []))
  })
  worldRow(sdk, CASE.ep01, 'lastPair', 'deleted and its pair removed in the same settings sync, before endPrincipal → the pair it was last seen bound to; its sessions and offers ended', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    KIND.delete.token(w, ID.p)
    await w.pairs.remove(FIXTURE.entry(ID.p))
    const r = await endPrincipal(w, ID.p, false)
    assert.deepEqual(plain(r), ended(p, [S.s1], [offer]))
    assert.equal(w.managed.managerOf(S.s1), undefined)
    assertReplacedByRetire(w, p, offer)
  })

  // REV-EP-02 — the options argument.
  for (const [name, args] of Object.entries(MISUSE.options)) {
    worldRow(sdk, CASE.ep02, `misuse ${name}`, `${name} → TypeError at the call; nothing changed`, async (w) => {
      const { p } = await managedByP(w)
      await misuseChangesNothing(w, () => w.routing.endPrincipal(FIXTURE.entry(ID.p), ...args))
      assert.equal(w.managed.managerOf(S.s1), p)
    })
  }

  // REV-EP-03 — offer types: each non-ask offer type is listed and retired `revoked`; an ask is neither.
  for (const type of OFFER_TYPES) {
    worldRow(sdk, CASE.ep03, type, `a pending ${type} offer → listed {offerId, sessionId, type: ${type}}; one revoked retirement replaces it`, async (w) => {
      const { p } = await managedByP(w)
      const offer = await offerTo(w, S.s1, type, p)
      const { value, fresh } = await expectEntries(w, () => endPrincipal(w, ID.p, true), 1)
      assert.deepEqual(plain(value), ended(p, [S.s1], [offer]))
      assert.equal(fresh[0].key, p)
      assertRetiredIn(await pendingOf(w, p), offer)
      assertReplacedByRetire(w, p, offer)
    })
  }
  withdrawnRow(sdk, CASE.ep03, 'ask', 'an ask of a managed session → not listed, not retired; its asker waits', NO_ASK)

  // REV-EP-04 — Mailbox.retire's arguments: misuse (throws at the call) vs data (resolves false).
  /** P with one pending permission in its real mailbox (committed through routing). */
  const pendingOfP = async (w) => { const { p } = await managedByP(w); return { p, offer: await offerTo(w, S.s1, ET.permission, p) } }
  const retireMisuse = (name, args) => worldRow(sdk, CASE.ep04, `misuse ${name}`, `Mailbox.retire with ${name} → TypeError synchronously; nothing committed, P's mailbox and hints unchanged`, async (w) => {
    const { p, offer } = await pendingOfP(w)
    const before = await boxState(w, p)
    const [key, eventId, reason] = args(p, offer.eventId)
    refusedAtCall(() => w.realMailbox.retire(key, eventId, reason))
    await quiet()
    assert.deepEqual(await boxState(w, p), before, 'a misused retire changed the mailbox')
  })
  for (const [name, key] of Object.entries(MISUSE.principalKeys)) retireMisuse(`principalKey ${name}`, (p, id) => [key, id, REVOKED])
  for (const [name, eventId] of Object.entries(MISUSE.eventIds)) retireMisuse(`eventId ${name}`, (p) => [p, eventId, REVOKED])
  for (const [name, reason] of Object.entries(MISUSE.reasons)) retireMisuse(`reason ${name}`, (p, id) => [p, id, reason])
  for (const [name, eventId] of Object.entries(MISUSE.dataEventIds)) {
    worldRow(sdk, CASE.ep04, `data ${name}`, `Mailbox.retire(P, ${JSON.stringify(eventId)}, revoked) → {retired: false}; nothing committed or changed`, async (w) => {
      const { p } = await pendingOfP(w)
      const before = await boxState(w, p)
      assert.deepEqual(await w.realMailbox.retire(p, eventId, REVOKED), RETIRE_OUTCOME.nothing)
      assert.deepEqual(await boxState(w, p), before)
    })
  }
  worldRow(sdk, CASE.ep04, 'held pending', 'Mailbox.retire of a pending event of a HELD mailbox → {retired: true}; after release P polls the retirement, not the event', async (w) => {
    const { p, offer } = await pendingOfP(w)
    await hold(w, p)
    assert.deepEqual(await w.realMailbox.retire(p, offer.eventId, REVOKED), RETIRE_OUTCOME.replaced)
    await w.mailbox.release(p)
    assertRetiredIn(await pendingOf(w, p), offer)
  })

  // REV-EP-05 — scope: only the named entry's principal.
  // Re-baselined by C-WIRE-2: D's ask is gone ("不给ask_agent工具"; q5 no designated agent).
  worldRow(sdk, CASE.ep05, '1', 'P and Q each manage a session with an offer → endPrincipal(P) produces exactly one retirement, in P\'s mailbox; Q\'s offer stays live', async (w) => {
    const x = await ucWorldScope(w)
    const { value, fresh } = await expectEntries(w, () => endPrincipal(w, ID.p, true), 1)
    assert.deepEqual(plain(value), ended(x.p, [S.s1], [x.pOffer]))
    assert.deepEqual([fresh[0].key, fresh[0].e.type, fresh[0].e.payload.retiredEventId], [x.p, ET.retirement, x.pOffer.eventId])
    assert.equal(w.managed.managerOf(S.s2), x.q)
    assert.equal(await w.routing.withdraw(x.qOffer.offer.offerId), true, 'Q\'s offer is not live')
  })
}
/** P manages S1 with an offer, Q manages S2 with an offer. */
async function ucWorldScope(w) {
  const { p } = await managedByP(w)
  const q = w.principal(ID.q, { connected: true })
  w.session(S.s2)
  await manage(w, S.s2, q)
  return {
    p, q,
    pOffer: await offerTo(w, S.s1, ET.permission, p),
    qOffer: await offerTo(w, S.s2, ET.permission, q),
  }
}

// ================================================================================================
// Boundary Values
// ================================================================================================

function boundaryValues(sdk) {
  // REV-BVA-01 — managed sessions 0 / 1 / 2 and live offers 0 / 1 / 2 per session.
  worldRow(sdk, CASE.bva01, 'sessions 0', 'paired P manages nothing → {principalKey: P, sessions: [], offers: []}; nothing produced', async (w) => {
    const p = w.principal(ID.p, { connected: true })
    const { value } = await expectNone(w, () => endPrincipal(w, ID.p, true))
    assert.deepEqual(plain(value), ended(p, [], []))
  })
  worldRow(sdk, CASE.bva01, 'sessions 1 offers 0', 'P manages S1 with no live offer → sessions [S1], offers []; nothing produced', async (w) => {
    const { p } = await managedByP(w)
    const { value } = await expectNone(w, () => endPrincipal(w, ID.p, true))
    assert.deepEqual(plain(value), ended(p, [S.s1], []))
  })
  worldRow(sdk, CASE.bva01, 'sessions 2 offers 2+1', 'P manages S1 (two offers) and S2 (one) → both sessions, all three offers listed; three retirements to P', async (w) => {
    const { p } = await managedByP(w)
    w.session(S.s2)
    await manage(w, S.s2, p)
    const offers = [await offerTo(w, S.s1, ET.permission, p), await offerTo(w, S.s1, ET.question, p), await offerTo(w, S.s2, ET.planReview, p)]
    const { value, fresh } = await expectEntries(w, () => endPrincipal(w, ID.p, true), offers.length)
    assert.deepEqual(plain(value), ended(p, [S.s1, S.s2], offers))
    assert.ok(fresh.every((x) => x.key === p && x.e.type === ET.retirement && x.e.payload.reason === REVOKED), 'not three revoked retirements to P')
    assert.deepEqual([w.managed.managerOf(S.s1), w.managed.managerOf(S.s2)], [undefined, undefined])
  })
  // Key length: '' is misuse (REV-EP-01 / REV-EP-04); one character is the shortest valid key.
  worldRow(sdk, CASE.bva01, 'entry key length 1', 'endPrincipal of a one-character entry key (valid, unknown) → resolves {principalKey: undefined, sessions: [], offers: []}', async (w) => {
    await managedByP(w)
    const { value } = await expectNone(w, () => w.routing.endPrincipal(MISUSE.shortestKey, { freshRetirements: false }))
    assert.deepEqual(plain(value), NOTHING)
  })
  worldRow(sdk, CASE.bva01, 'principal key length 1', 'Mailbox.retire under a one-character principal key (valid, empty box) → {retired: false}', async (w) => {
    assert.deepEqual(await w.realMailbox.retire(MISUSE.shortestKey, MISUSE.dataEventIds.unknown, REVOKED), RETIRE_OUTCOME.nothing)
  })
  worldRow(sdk, CASE.bva01, 'empty event id held', 'Mailbox.retire(P, \'\', revoked) on a HELD mailbox → {retired: false}; its summary unchanged', async (w) => {
    const { p } = await managedByP(w)
    await offerTo(w, S.s1, ET.permission, p)
    await hold(w, p)
    const before = await boxState(w, p, { held: true })
    assert.deepEqual(await w.realMailbox.retire(p, MISUSE.dataEventIds['empty string'], REVOKED), RETIRE_OUTCOME.nothing)
    assert.deepEqual(await boxState(w, p, { held: true }), before)
  })
}

// ================================================================================================
// Decision Tables
// ================================================================================================

/**
 * REV-DT-01's offer states: `setup` makes one item on S1 (managed by P); `disabled` checks P's
 * pending list after release; `deleted` checks after the drop.
 */
const STATES = Object.freeze({
  pending: {
    setup: async (w, p) => ({ offer: await offerTo(w, S.s1, ET.permission, p) }),
    listed: (x) => [x.offer],
    disabled: (w, p, x, events) => { assertRetiredIn(events, x.offer); assertReplacedByRetire(w, p, x.offer) },
    deleted: async (w, p, x, dropped) => { assertReplacedByRetire(w, p, x.offer); assert.deepEqual([...dropped.droppedAsks], []) },
  },
  acked: {
    setup: async (w, p) => { const offer = await offerTo(w, S.s1, ET.permission, p); await ackOffer(w, p, offer); return { offer } },
    listed: (x) => [x.offer],
    disabled: (w, p, x, events) => {
      assert.deepEqual(retirementsNaming(events, x.offer.eventId).map((e) => e.payload), [{ retiredEventId: x.offer.eventId, reason: REVOKED }], 'not one fresh retirement of the acked offer')
      assertFreshRetirements(w, p, x.offer, 1)
    },
    deleted: async (w, p, x, dropped) => { assertFreshRetirements(w, p, x.offer, 0); assert.deepEqual([...dropped.droppedAsks], []) },
  },
})

function decisionTables(sdk) {
  // REV-DT-01 — kind × offer state × box held when endPrincipal runs. A disable always holds the
  // box: "not held" is endPrincipal first, then hold; "held" is hold first. For a delete "held"
  // stands for an entry disabled before (its hold still on) and then deleted.
  for (const [kindName, kind] of Object.entries(KIND)) {
    for (const [stateName, state] of Object.entries(STATES)) {
      for (const held of [false, true]) {
        const title = `${kindName} × ${stateName} × ${held ? 'held' : 'not held'} → ${kindName === 'disable' ? 'after release' : 'after drop'}: ` + {
          pending: 'retire {retired: true} replaced it (revoked)',
          acked: kind.fresh ? 'one fresh revoked retirement' : 'no fresh retirement',
        }[stateName]
        worldRow(sdk, CASE.dt01, `${kindName} ${stateName} ${held ? 'held' : 'open'}`, title, async (w) => {
          const { p } = await managedByP(w)
          const x = await state.setup(w, p)
          kind.token(w, ID.p)
          if (held) await hold(w, p)
          const r = await endPrincipal(w, ID.p, kind.fresh)
          assert.deepEqual(plain(r), ended(p, [S.s1], state.listed(x)))
          if (kind === KIND.disable) {
            if (!held) await hold(w, p)
            await w.mailbox.release(p)
            await state.disabled(w, p, x, await pendingOf(w, p))
          } else {
            const dropped = await dropAndAnswer(w, p)
            assertRetiredBeforeDrop(w)
            await state.deleted(w, p, x, dropped)
          }
          for (const offer of state.listed(x)) await assertNotLive(w, offer)
          if (kind === KIND.delete) await assertDroppedEmpty(w, p)
        })
      }
    }
  }

  // REV-DT-01's `ask` state column is withdrawn by C-WIRE-2 (NO_ASK).
  for (const kindName of Object.keys(KIND)) for (const held of [false, true]) withdrawnRow(sdk, CASE.dt01, `${kindName} ask ${held ? 'held' : 'open'}`, `${kindName} × ask × ${held ? 'held' : 'not held'}`, NO_ASK)

  // REV-DT-02 — the ack landed in the mailbox but routing's onAcked had not marked it (the W3 race:
  // its retire answers {retired: false}) × freshRetirements.
  for (const fresh of [true, false]) {
    worldRow(sdk, CASE.dt02, `late ack fresh ${fresh}`, `offer acked, onAcked not yet fired → endPrincipal(fresh: ${fresh}): retire answers {retired: false}; ${fresh ? 'one fresh revoked retirement to P' : 'nothing committed for it'}; listed; no longer live`, async (w) => {
      const { p } = await managedByP(w)
      const offer = await offerTo(w, S.s1, ET.permission, p)
      await ackOffer(w, p, offer)
      const { value } = await expectEntries(w, () => endPrincipal(w, ID.p, fresh), fresh ? 1 : 0)
      assert.deepEqual(plain(value), ended(p, [S.s1], [offer]))
      assert.deepEqual(journalOf(w, OP.retire, offer.eventId).map((j) => j.outcome), [RETIRE_OUTCOME.nothing], 'routing did not try Mailbox.retire for an offer its ledger saw pending')
      assertFreshRetirements(w, p, offer, fresh ? 1 : 0)
      await expectNone(w, () => w.mailbox.announceAcks())
      await assertNotLive(w, offer)
    }, { lateAck: true })
  }
}

// ================================================================================================
// State Transitions
// ================================================================================================

function stateTransitions(sdk) {
  // REV-ST-01 — management of P's sessions.
  worldRow(sdk, CASE.st01, '1', 'Managed(P) → endPrincipal → Unmanaged; ManagedState onChange and the hand-over service\'s K3 onChange fire; later turns reach nobody', async (w) => {
    await managedByP(w)
    const managed = counting(w.managed)
    const handover = counting(w.handover)
    await endPrincipal(w, ID.p, true)
    assert.equal(w.managed.managerOf(S.s1), undefined)
    await until(() => managed.n >= 1 && handover.n >= 1, 'ManagedState and handover onChange after endPrincipal')
    assert.deepEqual(w.handover.managed(), [])
    await unwatched(w, S.s1)
  })
  worldRow(sdk, CASE.st01, '2', 'a manage(S2, P) queued before endPrincipal (not yet resolved) → ended too: listed, S2 unmanaged', async (w) => {
    const { p } = await managedByP(w)
    w.session(S.s2)
    const queued = w.managed.manage(S.s2, p)
    const r = await endPrincipal(w, ID.p, true)
    assert.deepEqual(await queued, { ok: true })
    assert.deepEqual(plain(r), ended(p, [S.s1, S.s2], []))
    assert.deepEqual(managedSet(w), [])
  })
  worldRow(sdk, CASE.st01, '3', 'Unmanaged (after endPrincipal) → endPrincipal again → empty sessions and offers; nothing produced', async (w) => {
    const { p } = await managedByP(w)
    await offerTo(w, S.s1, ET.permission, p)
    await endPrincipal(w, ID.p, true)
    const { value } = await expectNone(w, () => endPrincipal(w, ID.p, true))
    assert.deepEqual([[...value.sessions], [...value.offers]], [[], []])
  })
  for (const [kindName, kind] of Object.entries(KIND)) {
    worldRow(sdk, CASE.st01, `4 onRevoked ${kindName}`, `the TokenRegistry's onRevoked alone (${kind.revocation}) → nothing produced; P still manages S1 and its offer is still live`, async (w) => {
      const { p } = await managedByP(w)
      const offer = await offerTo(w, S.s1, ET.permission, p)
      const seen = counting(w.managed)
      await expectNone(w, () => kind.token(w, ID.p))
      assert.equal(w.managed.managerOf(S.s1), p, 'onRevoked alone ended management')
      assert.equal(seen.n, 0, 'onRevoked alone changed the managed set')
      assert.equal(await w.routing.withdraw(offer.offer.offerId), true, 'onRevoked alone retired the offer')
    })
  }
  worldRow(sdk, CASE.st01, '5', 'Unmanaged by endPrincipal → connector restart → still unmanaged (durable)', async (w) => {
    await managedByP(w)
    await endPrincipal(w, ID.p, true)
    await w.reopen()
    assert.equal(w.managed.managerOf(S.s1), undefined)
  })

  // REV-ST-02 — one live offer.
  worldRow(sdk, CASE.st02, '1', 'Live → endPrincipal → Retired (revoked): settle false, withdraw false; nothing committed', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    await endPrincipal(w, ID.p, true)
    await assertNotLive(w, offer)
  })
  worldRow(sdk, CASE.st02, '2', 'Live → endPrincipal with a slow Mailbox.retire → endPrincipal does not resolve until the retire has run', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    const gate = w.mailbox.holdRetires()
    try {
      const pending = endPrincipal(w, ID.p, true)
      assert.ok(await settlesWithin(gate.reached, WAIT.eventMs), 'no Mailbox.retire reached the mailbox')
      assert.equal(await settlesWithin(pending, WAIT.quietMs), false, 'endPrincipal resolved before its retirement ran')
      gate.open()
      assert.deepEqual(plain(await pending), ended(p, [S.s1], [offer]))
      assertReplacedByRetire(w, p, offer)
    } finally { gate.open() }
  })
  worldRow(sdk, CASE.st02, '3', 'Live ×2 → endPrincipal, Mailbox.retire of one rejects → resolves; the failure logged; both listed and no longer live; the other retired', async (w) => {
    const { p } = await managedByP(w)
    const failing = await offerTo(w, S.s1, ET.permission, p)
    const other = await offerTo(w, S.s1, ET.question, p)
    w.mailbox.failRetireOf(failing.eventId)
    const lines = w.logger.lines.length
    const r = await endPrincipal(w, ID.p, true)
    assert.deepEqual(plain(r), ended(p, [S.s1], [failing, other]))
    assert.ok(loggedSince(w, lines).length >= 1, 'the failed retirement was not logged')
    assertReplacedByRetire(w, p, other)
    for (const offer of [failing, other]) await assertNotLive(w, offer)
  })
  worldRow(sdk, CASE.st02, '4', 'acked offer → endPrincipal(fresh: true), its fresh retirement commit rejects → resolves; logged; listed; no longer live', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    await ackOffer(w, p, offer)
    w.mailbox.failFreshRetirementOf(offer.eventId)
    const lines = w.logger.lines.length
    const r = await endPrincipal(w, ID.p, true)
    assert.deepEqual(plain(r), ended(p, [S.s1], [offer]))
    assert.ok(loggedSince(w, lines).length >= 1, 'the failed retirement was not logged')
    await assertNotLive(w, offer)
  })

  // REV-ST-03 — P's mailbox: Pending, Held, Released, Dropped.
  for (const [order, steps] of [
    ['hold first', async (w, p) => { await hold(w, p); return endPrincipal(w, ID.p, true) }],
    ['endPrincipal first', async (w, p) => { const r = await endPrincipal(w, ID.p, true); await hold(w, p); return r }],
  ]) {
    worldRow(sdk, CASE.st03, `1 ${order}`, `Pending → ${order === 'hold first' ? 'hold → endPrincipal' : 'endPrincipal → hold'} → release → P polls the revoked retirement and never the original offer; retire answered {retired: true}`, async (w) => {
      const { p } = await managedByP(w)
      const offer = await offerTo(w, S.s1, ET.permission, p)
      KIND.disable.token(w, ID.p)
      const r = await steps(w, p)
      assert.deepEqual(plain(r), ended(p, [S.s1], [offer]))
      await w.mailbox.release(p)
      assertRetiredIn(await pendingOf(w, p), offer)
      assertReplacedByRetire(w, p, offer)
    })
  }
  worldRow(sdk, CASE.st03, '2', 'Held, acked offer → endPrincipal(fresh: true) → its fresh retirement is committed while held → release → pollable', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    await ackOffer(w, p, offer)
    await hold(w, p)
    await endPrincipal(w, ID.p, true)
    const holdAt = w.mailbox.journal.findIndex((j) => j.op === OP.hold)
    const fresh = journalOf(w, OP.freshRetirement, offer.eventId)
    assert.equal(fresh.length, 1, 'no fresh retirement while held')
    assert.ok(w.mailbox.journal.indexOf(fresh[0]) > holdAt && !journalOf(w, OP.release).length, 'the fresh retirement was not committed while held')
    await w.mailbox.release(p)
    assert.equal(retirementsNaming(await pendingOf(w, p), offer.eventId).length, 1)
  })
  // Re-baselined by C-WIRE-2: the kept ask is gone ("不给ask_agent工具"); the drop holds no ask.
  worldRow(sdk, CASE.st03, '3', 'Disabled (held, endPrincipal done) → deleted → endPrincipal(fresh: false) finds nothing more → drop → Dropped', async (w) => {
    const { p } = await managedByP(w)
    const offer = await offerTo(w, S.s1, ET.permission, p)
    KIND.disable.token(w, ID.p)
    await hold(w, p)
    await endPrincipal(w, ID.p, true)
    KIND.delete.token(w, ID.p)
    const r = await endPrincipal(w, ID.p, false)
    assert.deepEqual([[...r.sessions], [...r.offers]], [[], []])
    const dropped = await dropAndAnswer(w, p)
    assertRetiredBeforeDrop(w)
    assertReplacedByRetire(w, p, offer)
    assert.deepEqual([...dropped.droppedAsks], [])
    await assertDroppedEmpty(w, p)
  })
}

// ------------------------------------------------------------------------------------------------

export function registerRevocationCases(sdk) {
  useCases(sdk)
  equivalencePartitions(sdk)
  boundaryValues(sdk)
  decisionTables(sdk)
  stateTransitions(sdk)
}
