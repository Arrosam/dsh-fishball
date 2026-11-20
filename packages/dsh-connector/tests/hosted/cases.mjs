/**
 * C-SUCCEED black-box cases: the K3 `dshConnectorTokens` service of `packages/dsh-connector/src/hosted/`
 * (createHosted, entryState, retire, onChange), routing's succession step, and K1d `Mailbox.transfer`.
 * Written from the requirements only: R-HOST-05, R-HOST-09, R-HOST-10, R-NAME-07, R-WATCH-04, R-ROUTE-01,
 * R-EVT-02; design §5.4; K3 host-services/tokens.d.ts + README (DECIDED #13, #14); K1 / K1d
 * `PairStore.succeed`, `Mailbox.transfer`, `SettingsWriter`, `SessionNotes`; the test designs HOST-UC-03,
 * HOST-DT-02, HOST-ST-02 (08-hosted.md), NAME-ST-01 rows 8–9 (02-names.md), HAND-ST-01 row 7,
 * WATCH-EP-01 row 6, WATCH-ST-01 row 6, PLAT-ST-01 row 7; the C-SUCCEED test brief
 * (.runtime/reports/v3-w4-briefs.md) and the surface the dev session relayed (succeed-brief.md, its
 * Amendment 1 and the phase-3 contract after the independent review: C-MAILBOX `stage`, the staged
 * re-issue, `succeededBy` + `resume()`, the notes retry; subject.mjs). No file of
 * packages/dsh-connector/src/ was read.
 *
 * Level: the hosted module over REAL C-PAIR, C-MAILBOX, C-TOKENS and C-ROUTE modules on real DSH storage
 * of the SDK under test (subject.mjs), with fakes for the SettingsWriter, SessionNotes, timers, presence,
 * settings and sessions, and a write-failure seam over every storage domain and every port call
 * (fakes.mjs). The agent-answer rows add C-TOOLS on C-HTTP's endpoint (world.mjs).
 *
 * ── Use Cases ────────────────────────────────────────────────────────────────────────────────
 * C-WIRE-2 re-baseline (the user's q5, "Remove agentToken entirely"; "不给ask_agent工具"): Eo holds no
 * designated role and no ask; the succession moves sessions, events, offers and the name only. The
 * rows about the role and the ask are listed as skipped with the decision (constants.mjs WITHDRAWN).
 * HOST-UC-03 Reinstall succession (connector part).
 *   Pre: Eo = createHosted(I), paired as fb-old named "Navigator", designated, manages S1 and S2,
 *   holds live permission O1 (S1) and live question O2 (S2), pending events e1 (turn-finished S1) and
 *   e2 (message to Eo), none acked; Q (user-made, named) manages S3 with its own offer; S4 is En's.
 *   Main: 1. En = createHosted(I) pairs fb-new with "Navigator" → nameless, name-taken;
 *   2.–3. retire(Eo, En) → {ok: true}; in one step: S1, S2 managed by En (never unmanaged in between);
 *   designated = En; En named "Navigator", Eo's pair gone; O1, O2 re-issued as <request>.r2 to En
 *   (same type, session, descriptor otherwise) and their old events retired `reissued`; e1, e2 in
 *   En's mailbox with their eventIds, once; Eo's settings item and hosted record gone (entryState →
 *   deleted); 4. one system note per moved session (S1, S2), naming "Navigator"; none in S3 or S4.
 *   A1: Eo managed no sessions and held no role → only the name moves and Eo is deleted; no note.
 *   E1: an agent's answer to O1's old id → `expired` (C-TOOLS); routing.settle with the old id
 *     settles the current revision.
 *   E1a: the user's answer (routing.settle / withdraw with any revision) during or after the step is
 *     never refused.
 *   E2: a write fails at any step before the commit → {ok: false, operation-failed}; Eo keeps
 *     sessions, role, name, offers, events; En nameless; nothing half-moved (the `succeededBy` mark
 *     undone, so a later resume() deletes nothing); a retry succeeds. A compensation that fails is
 *     logged and never replaces operation-failed.
 *   E2a (rollback after the barrier): a watch event of a moved session produced during the step
 *     lands with En behind the barrier; after the failure it is back in Eo's box (sequence order),
 *     En's box holds only its own events.
 *   E4 (staging visibility): until the commit point En's poll stops at the barrier (none of Eo's
 *     moved events, none of the r2 offers), En's ack of a moved event is unknown-event, no hint
 *     reaches En; Eo's hosted record is marked succeededBy En. After it, the events are pollable
 *     from the cursor En had, and En is hinted.
 *   E5 (acked ask): an ask Eo had already acked is committed again to En (same offer id, new
 *     eventId) and En's answer settles the asker; on rollback En never sees it.
 *   E6 (durable cleanup): removeToken(Eo) fails at every try → {ok: true}; Eo is 'deleted' for
 *     entryState and not-hosted for retire while still listed; after a restart, resume() removes
 *     Eo's item and its hosted record.
 *   E7 (notes retry): a failed note is retried every HOSTED_TIMING.retryMs until written; one note
 *     per moved session.
 *   E3: the old entry was user-made → not-hosted; nothing moves.
 *   Post: "Navigator" never on two pairs at any sampled instant; later S1/S2 events go to En only;
 *   no event delivered twice.
 *
 * ── Techniques ───────────────────────────────────────────────────────────────────────────────
 * EP   SUCC-EP-01 the service object (members, apiVersion, frozen, no value member); SUCC-EP-02
 *      createHosted's instanceId (non-empty string / every other kind); SUCC-EP-03 entryState's key
 *      (enabled / disabled / unknown / user-made / record-less / retired); SUCC-EP-04 what moves
 *      (offer types permission, question, plan-review → re-issued; ask → moved, not re-issued);
 *      WATCH-EP-01 row 6.
 * BVA  SUCC-BVA-01 managed sessions 0 / 1 / 2; instanceId length 1; offer revision r1 → r2 and r2 → r3;
 *      pending events 0 / 1 / 2.
 * DT   HOST-DT-02 (the connector's rules: 1 succession, 2 successor-unpaired, 3 not-hosted; rules 4–5
 *      are the instance's, todo); SUCC-DT-01 createHosted (registry ok / fails × record write ok /
 *      fails); SUCC-DT-02 retire's refusals (each key: unknown / user-made / record-less /
 *      other instance / unpaired) with their precedence; SUCC-DT-03 old entry (paired, named,
 *      designated, managing) × successor named → what moves; post-commit failures (removeToken,
 *      hosted record delete, note, re-issue) → still {ok: true}, logged, retried.
 * ST   HOST-ST-02 rows 1–5; NAME-ST-01 rows 8–9; HAND-ST-01 row 7; WATCH-ST-01 row 6; PLAT-ST-01
 *      row 7; SUCC-ST-01 after the step (retry timer, restart durability, a second retire, the
 *      successor becomes the old entry of a later succession).
 * K1d  K1d-TRANSFER rows B1–B5 on the real mailbox; SUCC-STAGE-01 C-MAILBOX `stage` (the barrier
 *      states Staged → Confirmed / Undone, a second stage into a staged box) on the real mailbox.
 *
 * The failure sweep (HOST-UC-03 E2, SUCC-DT-03): a reference world runs the whole succession and the
 * seam journals every step (storage write or port call) between `retire`'s call and its answer. For
 * each pre-commit step a fresh world is built the same way and that one step fails: the answer is
 * operation-failed and the state equals the reference world's state before the call. Each post-commit
 * step fails in another fresh world: the answer is still {ok: true} and the name and sessions moved.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { descriptor, pendingOf, quiet, settlementOf, settlesWithin, until } from '../routing/cases.mjs'
import {
  CALL, CASE, DECISION, DECISION_KIND_OF, DOMAIN, EVENT_TYPE, FIXTURE, HOSTED_LABEL, K3, LATER, LOGGED_LEVELS, MAILBOX, OFFER_ID, OFFER_TYPES,
  PORT, QUEUE, REFUSAL, RETIREMENT_REASON, REVOCATION_KIND, RISK, SUBJECT, SUCCEED_TIMING, TIME_UNIT, TOOL, VALUE_ANYWHERE, VALUE_PATTERN, WAIT, WITHDRAWN,
  formatOfferId, k3Literals, nameKey, principalLabel,
} from './constants.mjs'
import { afterCommit, callStep, sameStep, writeStep } from './fakes.mjs'
import { pollAll } from '../mailbox/cases.mjs'
import { worldFor as mailboxWorld } from '../mailbox/subject.mjs'
import { hostedModule, succeedWorld } from './subject.mjs'
import { TURN_FACTS } from '../routing/constants.mjs'
import { toolsOver } from './world.mjs'
import { registerReviewXHostedCases } from './review-x-cases.mjs'

const T = { timeout: WAIT.testMs }
const { ids: ID, names: NAME, sessions: S } = FIXTURE
const ET = EVENT_TYPE
const CODE = K3.codes
const OK = Object.freeze({ ok: true })
const refused = (code) => ({ ok: false, code })

// ------------------------------------------------------------------------------------------------
// Row registration

function row(sdk, id, part, title, fn, todo, timeout = T) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, timeout, fn)
}
const worldRow = (sdk, id, part, title, fn) => row(sdk, id, part, title, async (t) => fn(await succeedWorld(t, sdk), t))
const todoRow = (sdk, id, part, title, owner) => row(sdk, id, part, title, null, owner)
/** A row a later decision withdrew: still listed, skipped with the decision (C-WIRE-2). */
const withdrawnRow = (sdk, id, part, title, reason) => test(caseName(sdk, id, part, title), { skip: reason }, () => {})

// ------------------------------------------------------------------------------------------------
// Preconditions (HOST-UC-03 Pre)

/** Eo (hosted, fb-old, `name`; `null` = nameless), connected. Returns {eo, old}. (C-WIRE-2: no designated role, q5.) */
async function oldEntry(w, { name = NAME.navigator, instance = FIXTURE.instance } = {}) {
  const eo = await w.hostedEntry(instance)
  const { key } = await w.pair(eo, ID.old, name)
  return { eo, old: key }
}
/** En (hosted for `instance`), paired as fb-new asking for `name` (`null` = none) unless `paired` is false. Returns {en, succ, paired}. */
async function successor(w, { name = NAME.navigator, instance = FIXTURE.instance, paired = true } = {}) {
  const en = await w.hostedEntry(instance)
  if (!paired) return { en }
  const { key, result } = await w.pair(en, ID.new, name)
  return { en, succ: key, paired: result }
}
/** An offer of `type` from `sessionId`, committed by routing to `key`. Returns {descriptor, event} (the event as polled). */
async function offerOf(w, sessionId, type, key) {
  const d = descriptor(type)
  const value = await w.routing.offer(sessionId, type, d)
  assert.equal(value?.recipient, key, `harness: the ${type} offer did not go to ${key}: ${JSON.stringify(value)}`)
  const event = (await pendingOf(w, key)).find((e) => e.offer?.offerId === d.offerId)
  assert.ok(event, 'harness: the offer is not pending')
  return { descriptor: d, event }
}
/** A plain event committed straight to `key`'s mailbox (e1 / e2 of the case: not offers). Returns its eventId. */
async function plainEvent(w, key, draft) {
  const r = await w.realMailbox.commit(key, draft)
  assert.equal(r?.ok, true, `harness: commit refused: ${JSON.stringify(r)}`)
  return r.eventId
}
// Re-baselined by CONN-REPORT B (user-approved 2026-11-21): the turn-finished payload is the report {sessionId, outcome, finalMessage?, stop?}.
const turnDraft = (sessionId) => ({ type: ET.turnFinished, sourceSessionId: sessionId, correlationId: null, payload: { sessionId, ...TURN_FACTS.completed } })
const messageDraft = (sessionId, n) => ({ type: ET.message, sourceSessionId: sessionId, correlationId: null, payload: { text: FIXTURE.text(n), images: [] } })

/**
 * HOST-UC-03's whole precondition (see the header). `sessions`: how many of S1, S2 Eo manages (BVA);
 * `offers`: the offer types Eo holds, one each, from the moved sessions in turn (so at least one
 * session when any); `events`: how many
 * plain pending events (e1 turn-finished of S1, e2 a message of S2) Eo has; `oldName` /
 * `successorName`: `null` = nameless.
 */
async function navigatorWorld(w, { sessions = 2, offers = [ET.permission, ET.question], events = 2, oldName = NAME.navigator, successorName = NAME.navigator } = {}) {
  const { eo, old } = await oldEntry(w, { name: oldName })
  const q = await w.userEntry()
  const { key: qKey } = await w.pair(q, ID.q, NAME.q)
  const moved = [S.s1, S.s2].slice(0, sessions)
  for (const s of [S.s1, S.s2, S.s3, S.s4]) w.session(s)
  for (const s of moved) await w.manage(s, old)
  await w.manage(S.s3, qKey)
  const qOffer = await offerOf(w, S.s3, ET.permission, qKey)
  assert.ok(offers.length === 0 || moved.length > 0, 'harness: an offer needs a managed session')
  const held = []
  for (const [i, type] of offers.entries()) held.push(await offerOf(w, moved[i % moved.length], type, old))
  const drafts = [turnDraft(S.s1), messageDraft(S.s2, 0)]
  const pending = []
  for (const d of drafts.slice(0, events)) pending.push(await plainEvent(w, old, d))
  const n = await successor(w, { name: successorName })
  await w.manage(S.s4, n.succ)
  return { eo, old, q, qKey, qOffer, moved, held, pending, ...n }
}

// ------------------------------------------------------------------------------------------------
// Observation

/** The managed set as sorted plain data. */
const managedSet = (w) => [...w.managed.managed()].map((r) => ({ sessionId: r.sessionId, principalKey: r.principalKey })).sort((a, b) => a.sessionId.localeCompare(b.sessionId))
/** Every pair as plain data. */
const pairsOf = (w) => JSON.parse(JSON.stringify(w.pairs.list())).sort((a, b) => a.entryKey.localeCompare(b.entryKey))
/** Every pending event of every mailbox the world made, as `{key: [eventId…]}` with ids in mailbox order. */
async function boxes(w) {
  const out = {}
  for (const key of [...w.keys].sort()) out[key] = (await pendingOf(w, key)).map((e) => ({ eventId: e.eventId, type: e.type, offerId: e.offer?.offerId ?? null }))
  return out
}
/** Everything a refused or rolled-back retire must leave as it was (E2, E3, DT refusals). */
async function stateOf(w) {
  return {
    managed: managedSet(w),
    pairs: pairsOf(w),
    tokens: w.doc.tokens.map((i) => ({ ...i })),
    entries: w.registry.list().map((e) => ({ entryKey: e.entryKey, enabled: e.enabled, hosted: e.hosted })),
    // Whole records (phase 3): a rolled-back step must also undo the `succeededBy` mark.
    hosted: JSON.parse(JSON.stringify(w.hostedRecords())).sort(([a], [b]) => String(a).localeCompare(String(b))),
    live: w.liveOffers(),
    boxes: await boxes(w),
  }
}
/**
 * The stored part of stateOf, compared across a connector restart: routing's live-offer ledger
 * belongs to DSH approval calls that a restart ends, and no requirement makes it durable.
 */
async function storedStateOf(w) {
  const { live, ...stored } = await stateOf(w)
  void live
  return stored
}
/**
 * The name invariant at one instant (R-NAME-07): no folded name on two pairs, and no two principals
 * both shown as holding it to the hand-over control. Returns the violation text or null.
 */
function nameClash(w) {
  const seen = new Map()
  for (const p of w.pairs.list()) {
    if (p.name === null) continue
    const k = nameKey(p.name)
    if (seen.has(k)) return `name ${p.name} on ${seen.get(k)} and ${p.principalKey}`
    seen.set(k, p.principalKey)
  }
  const shown = w.handover.principals().filter((p) => p.name !== null).map((p) => nameKey(p.name))
  if (new Set(shown).size !== shown.length) return 'principals() shows one name twice'
  return null
}
/**
 * Samples the world before and after every step of the succession (fakes.mjs Seam observers):
 * the name invariant, and that every session in `sessions` has a manager in `managed()`.
 */
function sampler(w, sessions) {
  const faults = []
  const check = () => {
    const clash = nameClash(w)
    if (clash) faults.push(clash)
    const managed = new Set(w.handover.managed().map((m) => m.sessionId))
    for (const s of sessions) if (!managed.has(s)) faults.push(`${s} unmanaged between two steps`)
  }
  w.seam.observers.add(check)
  return { faults, stop: () => w.seam.observers.delete(check) }
}
/** The `system` notes the notes port got, by session. */
const notesBySession = (w) => Object.fromEntries([S.s1, S.s2, S.s3, S.s4].map((s) => [s, w.notes.of(s)]))
/** The label the succession note names (brief: the name, or `ID: <id>` if nameless). */
function labelOf(name, id) {
  const label = principalLabel(name, id)
  return label.name ?? label.prefix + label.id
}
/** Every log line, flattened (for leak and "logged" checks). */
const logText = (w) => JSON.stringify(w.logger.lines)
/** The warn / error lines logged since the last retireFailing call (all of them when none ran). */
const logged = (w) => w.logger.lines.slice(w.logMark ?? 0).filter((l) => LOGGED_LEVELS.includes(l.level))

/** retire, run with the world's sampler over `sessions`; returns {result, faults}. */
async function retireSampled(w, eo, en, sessions = [S.s1, S.s2]) {
  const s = sampler(w, sessions)
  try {
    const result = await w.service.retire(eo, en)
    return { result, faults: s.faults }
  } finally { s.stop() }
}

/** retire(Eo, En) paused at PairStore.succeed's write (the commit point); resolves {gate, retiring} once it waits there. */
async function pausedAtCommit(w, u) {
  const gate = w.seam.holdNext(writeStep(DOMAIN.pairs))
  const retiring = w.service.retire(u.eo, u.en)
  await gate.reached
  return { gate, retiring }
}
/** `mailbox`'s pending events of `key` from `cursor` on, every page: {events, cursor} (cursor: the last page's nextCursor). */
async function pollFrom(mailbox, key, cursor) {
  const events = []
  for (;;) {
    const page = await mailbox.poll(key, cursor, MAILBOX.pageMax)
    assert.ok(page?.ok === true && Array.isArray(page.events), `poll of ${key} answered no events page: ${JSON.stringify(page)}`)
    events.push(...page.events)
    cursor = page.nextCursor
    if (!page.hasMore) return { events, cursor }
  }
}
/** An event's inbox_ack receipt. */
const receipt = (e) => ({ eventId: e.eventId, payloadDigest: e.payloadDigest })
/** How many hints `key`'s listen streams got (either world's recording HintSink: calls of [principalKey, uri]). */
const hintsTo = (w, key) => w.hints.calls.filter(([k]) => k === key).length
/** A step matcher: the note for `sessionId`. */
const noteFor = (sessionId) => (s) => callStep(PORT.notes, CALL.system)(s) && s.args.sessionId === sessionId
/** A step matcher: routing's commit of a turn-finished to `key` through the mailbox port (a watch event). */
const watchCommitTo = (key) => (s) => callStep(PORT.mailbox, CALL.commit)(s) && s.args[0] === key && s.args[1]?.type === ET.turnFinished

// ------------------------------------------------------------------------------------------------
// Oracles of a succeeded step (each stated once)

/** HOST-UC-03 main step 3: sessions, role, name, events and deletion of Eo, after {ok: true}. */
async function assertSucceeded(w, u) {
  for (const s of u.moved) assert.equal(w.managed.managerOf(s), u.succ, `${s} is not managed by the successor`)
  assert.equal(w.managed.managerOf(S.s3), u.qKey, 'S3 changed manager')
  assert.equal(w.managed.managerOf(S.s4), u.succ, 'S4 (the successor\'s own) changed manager')
  const succ = w.pairs.pairOf(u.en)
  assert.equal(succ.id, ID.new)
  assert.equal(succ.principalKey, u.succ, 'the successor\'s principal key changed')
  assert.equal(w.pairs.pairOf(u.eo), undefined, 'the old entry still has a pair')
  assert.equal(w.pairs.byPrincipal(u.old), undefined, 'the old principal is still found')
  assert.equal(nameClash(w), null)
  assert.equal(w.registry.get(u.eo), undefined, 'the old entry still exists in the registry')
  assert.ok(!w.doc.tokens.some((i) => i.key === u.eo), 'the old entry\'s settings item is still in the document')
  assert.ok(!w.hasHostedRecord(u.eo), 'the old entry\'s hosted record is still stored')
  assert.equal(w.service.entryState(u.eo), K3.states.deleted)
  assert.equal(w.service.entryState(u.en), K3.states.enabled)
  const mine = await pendingOf(w, u.succ)
  for (const id of u.pending) assert.equal(mine.filter((e) => e.eventId === id).length, 1, `pending event ${id} is not in the successor's mailbox exactly once`)
  const left = await pendingOf(w, u.old).catch(() => [])
  for (const id of u.pending) assert.ok(!left.some((e) => e.eventId === id), `pending event ${id} is still in the old mailbox`)
}
/** Each held offer is re-issued to the successor as r<n+1>, its old event retired `reissued` (SUCC-EP-04). */
async function assertReissued(w, u) {
  const mine = await pendingOf(w, u.succ)
  for (const { descriptor: d, event } of u.held) {
    const next = formatOfferId(d.approvalId, OFFER_ID.firstRevision + 1)
    const fresh = mine.filter((e) => e.offer?.offerId === next)
    assert.equal(fresh.length, 1, `offer ${d.offerId} was not re-issued once as ${next} to the successor`)
    const e = fresh[0]
    assert.deepEqual([e.type, e.sourceSessionId, e.correlationId, e.offer.revision, e.offer.decisionKind], [event.type, event.sourceSessionId, next, OFFER_ID.firstRevision + 1, DECISION_KIND_OF[event.type]])
    assert.deepEqual(e.payload, { ...event.payload, offerId: next }, 'the re-issued descriptor changed beyond its offerId')
    assert.notEqual(e.eventId, event.eventId, 'the re-issue reused the old event id')
    assert.ok(!mine.some((x) => x.eventId === event.eventId), `the old event of ${d.offerId} is still pending (not retired)`)
    const retirements = mine.filter((x) => x.type === ET.retirement && x.payload.retiredEventId === event.eventId)
    assert.deepEqual(retirements.map((x) => x.payload.reason), [RETIREMENT_REASON.reissued], `the old event of ${d.offerId} was not retired once, reissued`)
    assert.deepEqual(w.routing.liveOffers(event.sourceSessionId).filter((o) => o.descriptor.approvalId === d.approvalId).map((o) => [o.principalKey, o.descriptor.offerId]), [[u.succ, next]])
  }
}
/** One `system` note in each moved session naming the new principal; none elsewhere (HOST-UC-03 step 4). */
function assertNotes(w, u, label = labelOf(w.pairs.pairOf(u.en).name, ID.new)) {
  const want = Object.fromEntries([S.s1, S.s2, S.s3, S.s4].map((s) => [s, u.moved.includes(s) ? [w.mod.SUCCESSION_NOTE.text(label)] : []]))
  assert.deepEqual(notesBySession(w), want)
  for (const s of u.moved) assert.ok(w.notes.of(s)[0].includes(label), `the note in ${s} does not name ${label}`)
}

/**
 * After a post-commit failure every held offer is re-issued: the r2 commit is staged before the
 * commit point (phase 3), so nothing after it can leave an offer at its old id. Live as r2, held by
 * the successor, its r2 event pending once; its old event retired, or, when the failed step was that
 * retirement, still pending with the failure logged (phase 3: "a failed retire is logged only").
 */
async function assertEachOfferConsistent(w, u, what) {
  const mine = await pendingOf(w, u.succ)
  for (const { descriptor: d, event } of u.held) {
    const next = formatOfferId(d.approvalId, OFFER_ID.firstRevision + 1)
    const live = w.routing.liveOffers(event.sourceSessionId).filter((o) => o.descriptor.approvalId === d.approvalId).map((o) => [o.principalKey, o.descriptor.offerId])
    assert.deepEqual(live, [[u.succ, next]], `${what}: ${d.offerId} is not live as ${next}, held by the successor`)
    assert.equal(mine.filter((e) => e.offer?.offerId === next).length, 1, `${what}: ${next} is live but its event is not pending once in the successor's mailbox`)
    if (mine.some((e) => e.eventId === event.eventId)) assert.ok(logged(w).length > 0, `${what}: ${next} is live, the old event is still pending, and nothing was logged`)
  }
}

// ------------------------------------------------------------------------------------------------
// The failure sweep

/** The journal of a reference succession: the steps between retire's call and its answer, split at the commit. */
async function referenceSteps(t, sdk, build) {
  const w = await succeedWorld(t, sdk)
  const u = await build(w)
  const from = w.seam.mark()
  assert.deepEqual(await w.service.retire(u.eo, u.en), OK, 'harness: the reference succession did not succeed')
  const steps = w.seam.since(from)
  const commit = steps.findIndex(writeStep(DOMAIN.pairs))
  assert.ok(commit >= 0, 'the succession wrote nothing to the pair store (PairStore.succeed is the commit point)')
  return { pre: steps.slice(0, commit + 1), post: steps.slice(commit + 1) }
}
/**
 * A fresh world built by `build`, with `step` (named as in the reference) failing during retire.
 * Returns {w, u, result, before}: `before` is this world's state just before the call.
 */
async function failingAt(t, sdk, build, step) {
  const w = await succeedWorld(t, sdk)
  const u = await build(w)
  const before = await stateOf(w)
  w.seam.mark()
  w.seam.failNext(sameStep(step))
  const result = await w.service.retire(u.eo, u.en)
  if (w.seam.failArmed) await quiet()
  return { w, u, result, before, ran: !w.seam.failArmed }
}
/** A sweep subtest whose step did not recur in its own world is skipped by name (the reference's numbering did not repeat), never passed. */
function skipUnlessRan(tt, ran, step) {
  if (!ran) tt.skip(`${step.descriptor} #${step.ordinal} did not recur in a second world built the same way`)
  return ran
}
/** retire with the first step matching `match` failing; the failure must have fired. */
async function retireFailing(w, u, match, what = 'the armed step') {
  w.logMark = w.logger.lines.length
  w.seam.failNext(match)
  const result = await w.service.retire(u.eo, u.en)
  // A step of the reference may run a moment after retire answered; it still counts as having run.
  if (w.seam.failArmed) await quiet()
  assert.equal(w.seam.failArmed, false, `${what} never ran, so nothing failed`)
  return result
}
/**
 * Fires the pending retry timers until `done()` holds (each timer may start asynchronous work, so
 * each round also waits for it); at most FIXTURE.retryRounds rounds. Returns whether `done()` held.
 */
async function retryUntil(w, done) {
  for (let i = 0; i < FIXTURE.retryRounds && !(await done()); i += 1) {
    await w.timers.runAll()
    await until(async () => (await done()) || w.timers.pending > 0, 'the retry to finish or to schedule the next one').catch(() => {})
  }
  return done()
}

// ================================================================================================
// Use Cases
// ================================================================================================

function useCases(sdk) {
  const uc = (part, title, fn) => worldRow(sdk, CASE.uc03, part, title, fn)

  uc('main 1', 'En (a new hosted entry for the same instance) pairs with the name Eo holds → paired nameless, nameRefused name-taken', async (w) => {
    await oldEntry(w)
    const { paired, en } = await successor(w)
    assert.equal(paired.name, null)
    assert.equal(paired.nameRefused, REFUSAL.nameTaken)
    assert.equal(w.pairs.pairOf(en).name, null)
  })
  uc('main 2-3', 'retire(Eo, En) → {ok: true}: S1, S2 to En, the role, the name, O1/O2 re-issued r2, e1/e2 kept, Eo deleted', async (w) => {
    const u = await navigatorWorld(w)
    const { result, faults } = await retireSampled(w, u.eo, u.en)
    assert.deepEqual(result, OK)
    assert.deepEqual(faults, [], 'an observable instant broke the name or the management invariant')
    await assertSucceeded(w, u)
    assert.equal(w.pairs.pairOf(u.en).name, NAME.navigator)
    await assertReissued(w, u)
  })
  uc('main 4', 'S1 and S2 each get exactly one system note naming "Navigator"; S3 and S4 none', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    assertNotes(w, u, NAME.navigator)
  })
  uc('main (Q untouched)', 'the user-made principal Q keeps S3, its name and its live offer; the successor\'s own S4 stays its own', async (w) => {
    const u = await navigatorWorld(w)
    const qBefore = w.pairs.pairOf(u.q)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    assert.deepEqual(w.pairs.pairOf(u.q), qBefore)
    assert.deepEqual(w.routing.liveOffers(S.s3).map((o) => [o.principalKey, o.descriptor.offerId]), [[u.qKey, u.qOffer.descriptor.offerId]])
    assert.ok((await pendingOf(w, u.qKey)).some((e) => e.eventId === u.qOffer.event.eventId), 'Q\'s offer left its mailbox')
  })
  uc('A1', 'Eo managed no sessions, no offer, no event → only the name moves and Eo is deleted; no note', async (w) => {
    const { eo } = await oldEntry(w)
    const { en } = await successor(w)
    for (const s of [S.s1, S.s2]) w.session(s)
    assert.deepEqual(await w.service.retire(eo, en), OK)
    assert.equal(w.pairs.pairOf(en).name, NAME.navigator)
    assert.equal(w.pairs.pairOf(eo), undefined)
    assert.equal(w.registry.get(eo), undefined)
    assert.deepEqual(w.notes.calls, [])
  })
  // Re-baselined by C-WIRE-2 (q5): no designated role moves.
  uc('A1 (unpaired old)', 'Eo never paired: nothing to move; Eo is deleted; the successor keeps its own name', async (w) => {
    const eo = await w.hostedEntry()
    const { en } = await successor(w, { name: NAME.successorOwn })
    assert.deepEqual(await w.service.retire(eo, en), OK)
    assert.equal(w.pairs.pairOf(en).name, NAME.successorOwn)
    assert.equal(w.registry.get(eo), undefined)
    assert.equal(w.service.entryState(eo), K3.states.deleted)
    assert.deepEqual(w.notes.calls, [])
  })
  uc('E1', 'an agent\'s (the successor\'s) answer to O1\'s old id through approval_answer → expired, isError, nothing settled', async (w, t) => {
    const u = await navigatorWorld(w, { offers: [ET.permission] })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertAgentExpired(t, sdk, w, u, u.held[0])
  })
  uc('E1 (routing, old id)', 'routing.settle with O1\'s old id after the step settles the current revision: one settlement to En, correlationId = r2', async (w) => {
    const u = await navigatorWorld(w, { offers: [ET.permission] })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertUserSettles(w, u, u.held[0], u.held[0].descriptor.offerId)
  })
  uc('E1a (during)', 'the user answers O1 while the step is in flight (held at PairStore.succeed) → settled, never refused; one settlement, no re-issue left live', async (w) => {
    const u = await navigatorWorld(w, { offers: [ET.permission] })
    const { gate, retiring } = await pausedAtCommit(w, u)
    const s = settlementOf(u.held[0].descriptor.approvalId)
    const settling = w.routing.settle(u.held[0].descriptor.offerId, s)
    gate.open()
    assert.deepEqual(await retiring, OK)
    assert.equal(await settling, true, 'the user\'s answer during the succession was refused')
    const settlements = (await allPending(w)).filter((x) => x.e.type === ET.settlement && x.e.payload.approvalId === s.approvalId)
    assert.equal(settlements.length, 1, 'not exactly one settlement of the request')
    assert.deepEqual(w.routing.liveOffers(S.s1).filter((o) => o.descriptor.approvalId === s.approvalId), [], 'the settled request is still live')
  })
  uc('E1a (after, withdraw)', 'after the step, withdraw with O1\'s old id ends the current revision (true); the request is no longer live', async (w) => {
    const u = await navigatorWorld(w, { offers: [ET.permission] })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    assert.equal(await w.routing.withdraw(u.held[0].descriptor.offerId), true)
    assert.deepEqual(w.routing.liveOffers(S.s1), [])
  })
  uc('E2', 'the pair step fails (injected storage failure) → operation-failed; nothing moved: Eo keeps sessions, role, name; En nameless', async (w) => {
    const u = await navigatorWorld(w)
    const before = await stateOf(w)
    assert.deepEqual(await retireFailing(w, u, writeStep(DOMAIN.pairs)), refused(CODE.operationFailed))
    assert.deepEqual(await stateOf(w), before)
    assert.equal(w.pairs.pairOf(u.en).name, null)
    assert.equal(w.pairs.pairOf(u.eo).name, NAME.navigator)
    assert.deepEqual(w.notes.calls, [])
  })
  uc('E2 (retry)', 'after a failed step the instance retries (at its next start) → the succession runs in full', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await retireFailing(w, u, writeStep(DOMAIN.pairs)), refused(CODE.operationFailed))
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertSucceeded(w, u)
    await assertReissued(w, u)
    assertNotes(w, u, NAME.navigator)
  })
  uc('E2 (resume)', 'after a failed step, a restart and resume() delete nothing: the succeededBy mark was undone, Eo is still listed, enabled, hosted', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await retireFailing(w, u, writeStep(DOMAIN.pairs)), refused(CODE.operationFailed))
    const stored = await storedStateOf(w)
    await w.reopen()
    await w.resume()
    assert.deepEqual(await storedStateOf(w), stored)
    assert.equal(w.service.entryState(u.eo), K3.states.enabled)
  })
  uc('E2 (compensation fails)', 'PairStore.succeed fails and the staged undo fails too → still operation-failed (a failed compensation never replaces the error); the failed compensation is logged', async (w) => {
    const u = await navigatorWorld(w)
    const undo = w.seam.failEvery(callStep(PORT.mailbox, CALL.stagedUndo))
    try {
      assert.deepEqual(await retireFailing(w, u, writeStep(DOMAIN.pairs)), refused(CODE.operationFailed))
    } finally { undo.stop() }
    assert.ok(undo.count() > 0, 'the staged undo never ran, so no compensation failed')
    assert.ok(logged(w).length > 0, 'the failed compensation was not logged')
  })
  uc('E2a (rollback after the barrier)', 'a turn-finished of S1 produced while paused at PairStore.succeed lands with En (hidden behind the barrier); PairStore.succeed then fails → operation-failed; the event is back in Eo\'s box after Eo\'s events (sequence order); En\'s box holds only its own', async (w) => {
    const u = await navigatorWorld(w)
    const before = await stateOf(w)
    const { gate, retiring } = await pausedAtCommit(w, u)
    const from = w.seam.journal.length
    w.sessions.finishTurn(S.s1)
    await until(() => w.seam.since(from).some(watchCommitTo(u.succ)), 'the turn-finished of S1 committed to En (its manager during the step)')
    await quiet()
    assert.deepEqual((await boxes(w))[u.succ], before.boxes[u.succ], 'En sees an event behind the barrier')
    gate.open(true)
    assert.deepEqual(await retiring, refused(CODE.operationFailed))
    const { boxes: after, ...rest } = await stateOf(w)
    const { boxes: was, ...wasRest } = before
    assert.deepEqual(rest, wasRest, 'the rollback left a change beyond the mailboxes')
    const old = await pendingOf(w, u.old)
    const watch = old.at(-1)
    assert.deepEqual([watch?.type, watch?.sourceSessionId], [ET.turnFinished, S.s1], 'the watch event is not last in Eo\'s box')
    assert.deepEqual(after, { ...was, [u.old]: [...was[u.old], { eventId: watch.eventId, type: ET.turnFinished, offerId: null }] }, 'the mailboxes are not the ones before plus the watch event in Eo\'s')
    const seq = old.map((e) => e.sequence)
    assert.deepEqual(seq, [...seq].sort((a, b) => a - b), 'Eo\'s box is not in sequence order')
  })
  uc('E4 (staging)', 'paused at PairStore.succeed: En\'s poll shows only its own events (none of Eo\'s moved events, no r2 offer), its ack of a moved receipt is unknown-event, En is not hinted, Eo\'s hosted record is marked succeededBy En; after the commit En reads them from the cursor it had and is hinted', async (w) => {
    const u = await navigatorWorld(w)
    const moved = await pendingOf(w, u.old)
    const own = (await pendingOf(w, u.succ)).map((e) => e.eventId)
    const hints = hintsTo(w, u.succ)
    const { gate, retiring } = await pausedAtCommit(w, u)
    try {
      const during = await pollFrom(w.realMailbox, u.succ)
      assert.deepEqual(during.events.map((e) => e.eventId), own, 'En sees more than its own events before the commit point')
      for (const e of moved) assert.deepEqual(await w.realMailbox.ack(u.succ, [receipt(e)]), refused(REFUSAL.unknownEvent), `En's ack of moved ${e.type} event was not unknown-event`)
      assert.equal(hintsTo(w, u.succ), hints, 'En was hinted before the commit point')
      assert.equal(w.hostedRecordOf(u.eo)?.[SUBJECT.succeededBy], u.en, 'Eo\'s hosted record is not marked succeededBy En before the commit point')
      gate.open()
      assert.deepEqual(await retiring, OK)
      const later = (await pollFrom(w.realMailbox, u.succ, during.cursor)).events
      for (const id of u.pending) assert.equal(later.filter((e) => e.eventId === id).length, 1, `moved event ${id} is not read once from En's cursor after the commit`)
      for (const { descriptor: d } of u.held) {
        const next = formatOfferId(d.approvalId, OFFER_ID.firstRevision + 1)
        assert.equal(later.filter((e) => e.offer?.offerId === next).length, 1, `${next} is not read once from En's cursor after the commit`)
      }
      assert.ok(hintsTo(w, u.succ) > hints, 'En was not hinted after the commit')
    } finally { gate.open() }
  })
  withdrawnRow(sdk, CASE.uc03, 'E5 (acked ask)', 'Eo had already acked a live ask → after retire En polls it once and En\'s answer settles the waiting asker', WITHDRAWN.ask)
  withdrawnRow(sdk, CASE.uc03, 'E5 (acked ask, rollback)', 'Eo had acked a live ask; PairStore.succeed fails → En never sees the ask', WITHDRAWN.ask)
  uc('E6 (durable cleanup)', 'removeToken(Eo) fails at every try until close → {ok: true}; at once Eo is deleted for entryState and not-hosted for retire though still listed; after a restart resume() removes Eo\'s item and hosted record, and nothing else', async (w) => {
    const u = await navigatorWorld(w)
    const failing = w.seam.failEvery(afterCommit(DOMAIN.pairs, callStep(PORT.writer, CALL.removeToken)))
    let en2
    try {
      assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
      assert.equal(w.service.entryState(u.eo), K3.states.deleted, 'the succeeded old entry is not deleted for entryState')
      assert.notEqual(w.registry.get(u.eo), undefined, 'Eo is no longer listed though every removeToken failed')
      assert.equal(w.hostedRecordOf(u.eo)?.[SUBJECT.succeededBy], u.en, 'Eo\'s hosted record is not kept marked succeededBy En')
      en2 = await w.hostedEntry()
      await w.pair(en2, ID.next)
      assert.deepEqual(await w.service.retire(u.eo, en2), refused(CODE.notHosted))
      assert.ok(w.timers.scheduled.includes(w.mod.HOSTED_TIMING.retryMs), 'no retry was scheduled at HOSTED_TIMING.retryMs')
      await w.timers.runAll()
      await until(() => failing.count() >= 2, 'the retry of removeToken')
      await w.reopen()
    } finally { failing.stop() }
    assert.equal(w.service.entryState(u.eo), K3.states.deleted, 'after a restart the succeeded old entry is eligible again')
    await w.resume()
    assert.equal(w.registry.get(u.eo), undefined, 'resume() did not remove Eo')
    assert.ok(!w.doc.tokens.some((i) => i.key === u.eo), 'resume() left Eo\'s settings item')
    assert.ok(!w.hasHostedRecord(u.eo), 'resume() left Eo\'s hosted record')
    for (const k of [u.en, en2]) {
      assert.equal(w.service.entryState(k), K3.states.enabled, 'resume() touched an entry not marked succeededBy')
      assert.ok(w.hasHostedRecord(k))
    }
  })
  uc('E3', 'the old entry was made by the user (New token), not by createHosted → not-hosted; nothing moves', async (w) => {
    const eo = await w.userEntry()
    const { key: old } = await w.pair(eo, ID.old, NAME.navigator)
    w.session(S.s1)
    await w.manage(S.s1, old)
    const { en } = await successor(w)
    const before = await stateOf(w)
    assert.deepEqual(await w.service.retire(eo, en), refused(CODE.notHosted))
    assert.deepEqual(await stateOf(w), before)
  })
  uc('post (later events)', 'after the step, S1\'s and S2\'s later turns and offers go to En only; nothing to the old principal', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertLaterEventsTo(w, u)
  })
  uc('post (delivered once)', 'e1 and e2 are polled once from En\'s mailbox; after En acks them, nothing of them is pending anywhere', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    const events = (await pendingOf(w, u.succ)).filter((e) => u.pending.includes(e.eventId))
    assert.deepEqual(events.map((e) => e.eventId).sort(), [...u.pending].sort())
    assert.equal((await w.realMailbox.ack(u.succ, events.map((e) => ({ eventId: e.eventId, payloadDigest: e.payloadDigest })))).ok, true)
    assert.deepEqual((await allPending(w)).filter((x) => u.pending.includes(x.e.eventId)), [], 'a moved event is still pending after its ack')
  })
  uc('post (no value)', 'no token value appears in any log line or in retire\'s answer', async (w) => {
    const u = await navigatorWorld(w)
    const answer = await w.service.retire(u.eo, u.en)
    for (const value of w.values) {
      assert.ok(!logText(w).includes(value), 'a token value was logged')
      assert.ok(!JSON.stringify(answer).includes(value), 'retire answered a token value')
    }
  })
}

/** Every pending event of every mailbox: [{key, e}]. */
async function allPending(w) {
  const out = []
  for (const key of w.keys) for (const e of await pendingOf(w, key)) out.push({ key, e })
  return out
}

/** The user's (or routing's) settle with `offerId` (any revision) settles the request's current revision, held by the successor. */
async function assertUserSettles(w, u, held, offerId) {
  const s = settlementOf(held.descriptor.approvalId)
  const current = formatOfferId(held.descriptor.approvalId, OFFER_ID.firstRevision + 1)
  assert.equal(await w.routing.settle(offerId, s), true, 'the answer with this revision was refused')
  const settlements = (await allPending(w)).filter((x) => x.e.type === ET.settlement && x.e.payload.approvalId === s.approvalId)
  assert.deepEqual(settlements.map((x) => [x.key, x.e.correlationId]), [[u.succ, current]])
  assert.equal(await w.routing.settle(current, s), false, 'a second answer settled the request again')
}

/** An agent's (the successor's) approval_answer to `held`'s old id → expired; the request stays live as r2. */
async function assertAgentExpired(t, sdk, w, u, held) {
  const tools = await toolsOver(t, sdk, w)
  const client = await tools.connect(u.en)
  const result = await client.callTool({
    name: TOOL.approvalAnswer,
    arguments: { sessionId: held.event.sourceSessionId, approvalId: held.descriptor.approvalId, offerId: held.descriptor.offerId, answer: { decision: DECISION.allow, risk: RISK.low, reason: FIXTURE.reason } },
  })
  assert.equal(result.isError, true, `the old id was not refused: ${JSON.stringify(result.structuredContent)}`)
  assert.deepEqual([result.structuredContent?.ok, result.structuredContent?.code], [false, REFUSAL.expired])
  assert.deepEqual(tools.domainCalls, [], 'the answer to the old id reached the domain')
  const next = formatOfferId(held.descriptor.approvalId, OFFER_ID.firstRevision + 1)
  assert.deepEqual(w.routing.liveOffers(held.event.sourceSessionId).map((o) => [o.principalKey, o.descriptor.offerId]), [[u.succ, next]], 'the request is no longer live as r2')
}

/** Later turn-finished of S1 and an offer of S2 go to the successor only (R-WATCH-04). */
async function assertLaterEventsTo(w, u) {
  const before = new Set((await allPending(w)).map((x) => x.e.eventId))
  w.sessions.finishTurn(S.s1)
  const later = await offerOf(w, S.s2, ET.planReview, u.succ)
  await until(async () => (await allPending(w)).filter((x) => !before.has(x.e.eventId)).length >= 2, 'the later turn and offer')
  await quiet()
  const fresh = (await allPending(w)).filter((x) => !before.has(x.e.eventId))
  assert.deepEqual(fresh.map((x) => [x.key, x.e.type]).sort(), [[u.succ, ET.planReview], [u.succ, ET.turnFinished]].sort())
  assert.equal(later.event.offer.offerId, later.descriptor.offerId)
}

// ================================================================================================
// Equivalence Partitioning
// ================================================================================================

function partitions(sdk) {
  // SUCC-EP-01 — the service object (K3 DshConnectorTokens).
  row(sdk, CASE.service, '1', `the module's exports: HOSTED_SERVICE {name: ${K3.service}, apiVersion: ${K3.apiVersion}}, HOSTED_TIMING.retryMs a positive number, SUCCESSION_NOTE.text a function`, async () => {
    const mod = await hostedModule(sdk)
    assert.deepEqual([mod.HOSTED_SERVICE.name, mod.HOSTED_SERVICE.apiVersion], [K3.service, K3.apiVersion])
    assert.ok(Number.isFinite(mod.HOSTED_TIMING.retryMs) && mod.HOSTED_TIMING.retryMs > 0, 'HOSTED_TIMING.retryMs is no positive number')
    assert.equal(typeof mod.SUCCESSION_NOTE.text, 'function')
    assert.equal(typeof mod.HostedServiceError, 'function')
  })
  row(sdk, CASE.service, '2', 'the exported refusal codes and entry states are exactly K3\'s (RetireRefusalCode, HostedEntryState)', async () => {
    const mod = await hostedModule(sdk)
    assert.deepEqual(Object.values(mod.RETIRE_REFUSAL).sort(), k3Literals(K3.types.retire).sort())
    assert.deepEqual(Object.values(mod.HOSTED_ENTRY_STATE).sort(), k3Literals(K3.types.state).sort())
    assert.deepEqual(Object.values(CODE).sort(), k3Literals(K3.types.retire).sort(), 'this suite\'s K3 codes drifted from tokens.d.ts')
  })
  worldRow(sdk, CASE.service, '3', `the service is frozen, has exactly ${K3.members.join(', ')}, apiVersion ${K3.apiVersion}, and no value / reveal member`, (w) => {
    const service = w.service
    assert.ok(Object.isFrozen(service), 'the service is not frozen')
    assert.deepEqual(Object.keys(service).sort(), [...K3.members].sort())
    assert.equal(service.apiVersion, K3.apiVersion)
    for (const m of K3.members.filter((n) => n !== 'apiVersion')) assert.equal(typeof service[m], 'function')
  })
  row(sdk, CASE.service, '5', `HOSTED_TIMING.retryMs is ${SUCCEED_TIMING.retrySeconds} s in K1 TIME_UNIT`, async () => {
    const mod = await hostedModule(sdk)
    assert.equal(mod.HOSTED_TIMING.retryMs, SUCCEED_TIMING.retrySeconds * TIME_UNIT.msPerSecond)
  })
  todoRow(sdk, CASE.service, '4', `the service is provided on the connector's context as ${K3.service} (not by this module)`, LATER.wire)

  // SUCC-EP-01 row 6 — K3 amendment I-SUCCEED, the user's Q1 = C, 2026-11-17: `onChange(fn) → dispose`,
  // `fn()` after each change of the pair store (K1 PairStore.onChange: "Listeners run once after a change").
  // States: subscribed → (pair change) → fn() once → dispose → (pair change) → no call; dispose twice is harmless (K3 Dispose).
  worldRow(sdk, CASE.service, '6 (pair)', 'onChange(fn): a successor\'s pair → fn called once, with no argument; it returns a dispose function', async (w) => {
    await oldEntry(w)
    const en = await w.hostedEntry()
    const seen = []
    const dispose = w.service.onChange((...args) => { seen.push(args) })
    assert.equal(typeof dispose, 'function', 'onChange returned no disposer')
    await w.pair(en, ID.new, NAME.successorOwn)
    await until(() => seen.length > 0, 'onChange after the pair')
    await quiet()
    assert.deepEqual(seen, [[]], 'one call with no argument per pair change')
  })
  worldRow(sdk, CASE.service, '6 (dispose)', 'after dispose, a pair change calls fn no more; a second dispose does nothing; another listener still hears it', async (w) => {
    const [first, second] = [await w.hostedEntry(), await w.hostedEntry()]
    let disposed = 0
    let kept = 0
    const dispose = w.service.onChange(() => { disposed += 1 })
    const keep = w.service.onChange(() => { kept += 1 })
    dispose()
    dispose()
    await w.pair(first, ID.old, NAME.navigator)
    await until(() => kept > 0, 'the kept listener after the pair')
    await w.pair(second, ID.new, NAME.successorOwn)
    await until(() => kept > 1, 'the kept listener after the second pair')
    await quiet()
    assert.equal(disposed, 0, 'a disposed listener was called')
    keep()
  })
  // EP of onChange's argument: a function / anything else (relayed round 2: a non-function is a caller bug → TypeError).
  for (const [kind, value] of Object.entries({ undefined, null: null, number: 42, string: 'fn', object: Object.freeze({}) })) {
    worldRow(sdk, CASE.service, '6 (argument)', `onChange(${kind}) → throws TypeError; a pair change afterwards still works`, async (w) => {
      assert.throws(() => w.service.onChange(value), TypeError)
      await w.pair(await w.hostedEntry(), ID.new, NAME.successorOwn)
    })
  }
  worldRow(sdk, CASE.service, '6 (retire)', 'a successful retire changes the pairs (the old pair goes, the name moves) → fn called', async (w) => {
    const { eo } = await oldEntry(w)
    const { en } = await successor(w)
    let calls = 0
    const dispose = w.service.onChange(() => { calls += 1 })
    assert.deepEqual(await w.service.retire(eo, en), OK)
    await until(() => calls > 0, 'onChange after the succession')
    dispose()
  })

  // SUCC-EP-02 — createHosted's instanceId.
  for (const [name, value] of Object.entries(FIXTURE.badInstances)) {
    worldRow(sdk, CASE.create, '1', `instanceId ${name} → rejects TypeError; no entry, no settings item, no hosted record`, async (w) => {
      const before = await stateOf(w)
      await assert.rejects(w.service.createHosted(value), TypeError)
      assert.deepEqual(await stateOf(w), before)
      assert.deepEqual(w.writer.calls, [])
    })
  }
  worldRow(sdk, CASE.create, '2', `a valid instanceId → {entryKey, label: "${HOSTED_LABEL}", value} once; the entry is listed hosted, enabled, in the settings document`, async (w) => {
    const made = await w.service.createHosted(FIXTURE.instance)
    assert.deepEqual(Object.keys(made).sort(), [...K3.createdFields].sort())
    assert.equal(made.label, HOSTED_LABEL)
    assert.match(made.value, VALUE_PATTERN)
    assert.deepEqual(w.registry.get(made.entryKey) && { hosted: w.registry.get(made.entryKey).hosted, enabled: w.registry.get(made.entryKey).enabled, label: w.registry.get(made.entryKey).label }, { hosted: true, enabled: true, label: HOSTED_LABEL })
    assert.deepEqual(w.doc.tokens.filter((i) => i.key === made.entryKey).map((i) => [i.label, i.enabled]), [[HOSTED_LABEL, true]])
    assert.equal(w.service.entryState(made.entryKey), K3.states.enabled)
    assert.ok(w.hasHostedRecord(made.entryKey), 'no hosted record for the new entry')
  })
  worldRow(sdk, CASE.create, '3', 'the value is stored nowhere by the host: not in any hosted record, any log line or any file of the world', async (w) => {
    const made = await w.service.createHosted(FIXTURE.instance)
    assert.ok(!JSON.stringify(w.hostedRecords()).includes(made.value), 'a hosted record holds the value')
    assert.ok(!logText(w).includes(made.value), 'the value was logged')
    assert.ok(!JSON.stringify(w.doc).includes(made.value), 'the settings document holds the value')
    await w.reopen()
    for (const f of fs.readdirSync(w.root, { recursive: true }).map((x) => path.join(w.root, String(x))).filter((x) => fs.statSync(x).isFile())) {
      assert.ok(!fs.readFileSync(f, 'latin1').includes(made.value), 'a stored file holds the value')
    }
  })
  worldRow(sdk, CASE.create, '4', 'two calls for one instance make two distinct entries with distinct values (no reuse: R-HOST-05 "a new entry")', async (w) => {
    const a = await w.service.createHosted(FIXTURE.instance)
    const b = await w.service.createHosted(FIXTURE.instance)
    assert.notEqual(a.entryKey, b.entryKey)
    assert.notEqual(a.value, b.value)
    assert.deepEqual(w.doc.tokens.filter((i) => i.label === HOSTED_LABEL).length, 2)
  })
  withdrawnRow(sdk, CASE.create, '5', 'createHosted does not designate the new entry', WITHDRAWN.designated)

  // SUCC-EP-03 — entryState's key (read only).
  const stateRow = (part, title, make, want) => worldRow(sdk, CASE.state, part, `${title} → ${want}; nothing changes`, async (w) => {
    const key = await make(w)
    const before = await stateOf(w)
    const calls = w.seam.journal.length
    assert.equal(w.service.entryState(key), want)
    assert.deepEqual(await stateOf(w), before)
    assert.equal(w.seam.journal.length, calls, 'entryState wrote something')
  })
  stateRow('1', 'a hosted entry, enabled', (w) => w.hostedEntry(), K3.states.enabled)
  stateRow('2', 'a hosted entry the user switched off', async (w) => {
    const key = await w.hostedEntry()
    assert.equal((await w.save(w.doc.tokens.map((i) => (i.key === key ? { ...i, enabled: false } : i)))).ok, true)
    return key
  }, K3.states.disabled)
  stateRow('3', 'a hosted entry switched off and on again', async (w) => {
    const key = await w.hostedEntry()
    await w.save(w.doc.tokens.map((i) => (i.key === key ? { ...i, enabled: false } : i)))
    await w.save(w.doc.tokens.map((i) => (i.key === key ? { ...i, enabled: true } : i)))
    return key
  }, K3.states.enabled)
  stateRow('4', 'a hosted entry the user deleted', async (w) => {
    const key = await w.hostedEntry()
    await w.save(w.doc.tokens.filter((i) => i.key !== key))
    return key
  }, K3.states.deleted)
  stateRow('5', 'a key no entry has', () => FIXTURE.unknownEntry, K3.states.deleted)
  stateRow('6', 'the empty string', () => '', K3.states.deleted)
  stateRow('7', 'a user-made entry (hosted: false), enabled', (w) => w.userEntry(), K3.states.deleted)
  stateRow('8', 'a hosted entry whose hosted record was lost', async (w) => {
    const key = await w.hostedEntry()
    await w.loseHostedRecord(key)
    return key
  }, K3.states.deleted)
  worldRow(sdk, CASE.state, '9', 'after a restart a hosted entry still answers enabled (the hosted record is durable)', async (w) => {
    const key = await w.hostedEntry()
    await w.reopen()
    assert.equal(w.service.entryState(key), K3.states.enabled)
  })

  // SUCC-EP-04 — what the step does with each kind of live item (Amendment 1: only OFFER_TYPES are re-issued).
  for (const type of OFFER_TYPES) {
    worldRow(sdk, CASE.offers, type, `a live ${type} offer of S1 → re-issued to En as r2 (same type, session, descriptor but offerId); its old event retired ${RETIREMENT_REASON.reissued}`, async (w) => {
      const u = await navigatorWorld(w, { offers: [type] })
      assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
      await assertReissued(w, u)
    })
  }
  withdrawnRow(sdk, CASE.offers, ET.ask, 'a live ask Eo holds → moves to En with its event, not re-issued; the asker keeps waiting', WITHDRAWN.ask)
  worldRow(sdk, CASE.offers, 'none', 'Eo holds no live offer → nothing is re-issued and nothing retired', async (w) => {
    const u = await navigatorWorld(w, { offers: [] })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    const mine = await pendingOf(w, u.succ)
    assert.deepEqual(mine.filter((e) => e.type === ET.retirement), [])
  })
  worldRow(sdk, CASE.offers, 'ledger', 'routing.liveOffers descriptors are frozen copies detached from the offered object, before and after the succession (r2)', async (w) => {
    const u = await navigatorWorld(w, { offers: [ET.permission] })
    const offered = u.held[0].descriptor
    const read = () => w.routing.liveOffers(S.s1).find((o) => o.descriptor.approvalId === offered.approvalId).descriptor
    const check = (offerId) => {
      const d = read()
      assert.ok(Object.isFrozen(d), 'a live-offer descriptor is not frozen')
      assert.notEqual(d, offered, 'the ledger hands out the object the offer was made with')
      assert.equal(d.offerId, offerId)
      assert.throws(() => { d.prompt = FIXTURE.reason }, TypeError)
    }
    check(offered.offerId)
    const prompt = read().prompt
    offered.prompt = FIXTURE.reason
    assert.equal(read().prompt, prompt, 'changing the offered object changed the ledger')
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    check(formatOfferId(offered.approvalId, OFFER_ID.firstRevision + 1))
  })

  // WATCH-EP-01 row 6.
  // CONN-REPORT A1 (user-approved 2026-11-21): state is no longer produced, so only turn-finished is followed.
  worldRow(sdk, CASE.watchEp01, '6', 'after Q24 succession P → P\': turn-finished of S1 goes to P\' only', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertLaterEventsTo(w, u)
  })
}

// ================================================================================================
// Boundary Value Analysis
// ================================================================================================

function boundaries(sdk) {
  worldRow(sdk, CASE.bva, 'instanceId 1 char', `the shortest non-empty instanceId ("${FIXTURE.shortestInstance}") is accepted`, async (w) => {
    const made = await w.service.createHosted(FIXTURE.shortestInstance)
    assert.equal(w.service.entryState(made.entryKey), K3.states.enabled)
  })
  for (const n of FIXTURE.sessionCounts) {
    worldRow(sdk, CASE.bva, `sessions ${n}`, `Eo manages ${n} session(s) → all ${n} move to En, ${n} note(s)`, async (w) => {
      const u = await navigatorWorld(w, { sessions: n, offers: n > 0 ? [ET.permission] : [], events: n })
      assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
      await assertSucceeded(w, u)
      assert.equal(w.notes.calls.length, n)
      assertNotes(w, u, NAME.navigator)
    })
  }
  worldRow(sdk, CASE.bva, 'revision r2 → r3', 'an offer already at r2 (a first succession) is re-issued as r3 by a second succession En → En2', async (w) => {
    const u = await navigatorWorld(w, { offers: [ET.permission] })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    const en2 = await w.hostedEntry()
    const { key: succ2 } = await w.pair(en2, ID.next, NAME.navigator)
    assert.deepEqual(await w.service.retire(u.en, en2), OK)
    const r3 = formatOfferId(u.held[0].descriptor.approvalId, OFFER_ID.firstRevision + 2)
    assert.deepEqual(w.routing.liveOffers(S.s1).map((o) => [o.principalKey, o.descriptor.offerId]), [[succ2, r3]])
    assert.equal(w.pairs.pairOf(en2).name, NAME.navigator)
    assert.equal(await w.routing.settle(u.held[0].descriptor.offerId, settlementOf(u.held[0].descriptor.approvalId)), true, 'the r1 id did not settle the r3 revision')
  })
  for (const n of [0, 1, 2]) {
    worldRow(sdk, CASE.bva, `pending events ${n}`, `Eo has ${n} pending plain event(s) → exactly those move, same eventIds, in their order after En's own`, async (w) => {
      const u = await navigatorWorld(w, { offers: [], events: n })
      await plainEvent(w, u.succ, messageDraft(S.s4, n))
      const own = (await pendingOf(w, u.succ)).map((e) => e.eventId)
      assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
      const after = (await pendingOf(w, u.succ)).map((e) => e.eventId)
      assert.deepEqual(after.slice(0, own.length), own, 'En\'s own events were reordered')
      assert.deepEqual(after.slice(own.length).filter((id) => u.pending.includes(id)), u.pending)
    })
  }
}

// ================================================================================================
// Decision Tables
// ================================================================================================

function decisionTables(sdk) {
  // HOST-DT-02 — succession eligibility (the connector's rules).
  worldRow(sdk, CASE.dt02, '1', 'reinstall: old entry made by I, new pairing succeeded → succession', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertSucceeded(w, u)
  })
  worldRow(sdk, CASE.dt02, '2', 'reinstall: old made by I, the new entry has not paired → successor-unpaired; nothing moves', async (w) => {
    const { eo, old } = await oldEntry(w)
    w.session(S.s1)
    await w.manage(S.s1, old)
    const { en } = await successor(w, { paired: false })
    const before = await stateOf(w)
    assert.deepEqual(await w.service.retire(eo, en), refused(CODE.successorUnpaired))
    assert.deepEqual(await stateOf(w), before)
    assert.deepEqual(w.notes.calls, [])
  })
  worldRow(sdk, CASE.dt02, '3', 'reinstall: old entry user-made, new pairing succeeded → not-hosted; nothing moves', async (w) => {
    const eo = await w.userEntry()
    await w.pair(eo, ID.old, NAME.navigator)
    const { en } = await successor(w)
    const before = await stateOf(w)
    assert.deepEqual(await w.service.retire(eo, en), refused(CODE.notHosted))
    assert.deepEqual(await stateOf(w), before)
  })
  todoRow(sdk, CASE.dt02, '4', 'user delete + Retry: the instance creates a new entry and calls no retire', LATER.instance)
  todoRow(sdk, CASE.dt02, '5', 'restart: no new pairing, no retire', LATER.instance)

  // SUCC-DT-01 — createHosted: registry × hosted record write.
  worldRow(sdk, CASE.createDt, '1', 'registry ok, record ok → resolves the entry (see SUCC-EP-02 row 2)', async (w) => {
    assert.equal(w.service.entryState(await w.hostedEntry()), K3.states.enabled)
  })
  worldRow(sdk, CASE.createDt, '2', `the registry's settings save fails → rejects a HostedServiceError with code ${CODE.operationFailed}; nothing created, no hosted record`, async (w) => {
    const before = await stateOf(w)
    w.seam.failNext(callStep(PORT.writer, CALL.addToken))
    await assert.rejects(w.service.createHosted(FIXTURE.instance), (e) => e instanceof w.mod.HostedServiceError && e.code === CODE.operationFailed)
    assert.deepEqual(await stateOf(w), before)
  })
  worldRow(sdk, CASE.createDt, '3', `the registry's digest record write fails → rejects ${CODE.operationFailed}; nothing created`, async (w) => {
    const before = await stateOf(w)
    w.seam.failNext(writeStep(DOMAIN.tokens))
    await assert.rejects(w.service.createHosted(FIXTURE.instance), (e) => e?.code === CODE.operationFailed)
    assert.deepEqual(await stateOf(w), before)
  })
  worldRow(sdk, CASE.createDt, '4', `the hosted record write fails → the new entry is removed again (removeToken) and it rejects ${CODE.operationFailed}; no value returned`, async (w) => {
    const before = await stateOf(w)
    w.seam.failNext(writeStep(DOMAIN.hosted))
    await assert.rejects(w.service.createHosted(FIXTURE.instance), (e) => e?.code === CODE.operationFailed && !Object.hasOwn(e, 'value'))
    const added = w.writer.of(CALL.addToken)
    assert.equal(added.length, 1)
    assert.deepEqual(w.writer.of(CALL.removeToken).map((c) => c.entryKey), [added[0].item.key])
    assert.deepEqual(await stateOf(w), before)
    assert.equal(w.registry.get(added[0].item.key), undefined, 'the half-made entry is still listed')
    assert.equal(w.service.entryState(added[0].item.key), K3.states.deleted)
  })
  worldRow(sdk, CASE.createDt, '5', 'a failed createHosted logs no token value, and a later call succeeds', async (w) => {
    w.seam.failNext(writeStep(DOMAIN.hosted))
    await assert.rejects(w.service.createHosted(FIXTURE.instance))
    assert.ok(!VALUE_ANYWHERE.test(logText(w)), 'a token-looking value was logged')
    assert.equal(w.service.entryState(await w.hostedEntry()), K3.states.enabled)
  })

  // SUCC-DT-02 — retire's refusals: each key's kind, and their order (unknown-entry, not-hosted, successor-unpaired).
  const KIND = Object.freeze({
    unknown: { make: () => FIXTURE.unknownEntry, code: CODE.unknownEntry },
    deleted: { make: async (w) => { const k = await w.hostedEntry(); await w.save(w.doc.tokens.filter((i) => i.key !== k)); return k }, code: CODE.unknownEntry },
    user: { make: async (w, id) => { const k = await w.userEntry(); if (id) await w.pair(k, id); return k }, code: CODE.notHosted },
    recordless: { make: async (w, id) => { const k = await w.hostedEntry(); if (id) await w.pair(k, id); await w.loseHostedRecord(k); return k }, code: CODE.notHosted },
    other: { make: async (w, id) => { const k = await w.hostedEntry(FIXTURE.otherInstance); if (id) await w.pair(k, id); return k }, code: CODE.notHosted },
    unpaired: { make: (w) => w.hostedEntry(), code: CODE.successorUnpaired },
    good: { make: async (w, id) => { const k = await w.hostedEntry(); await w.pair(k, id); return k } },
  })
  const refusalRow = (part, oldKind, newKind, want) => worldRow(sdk, CASE.refusalDt, part, `old ${oldKind}, successor ${newKind} → ${want}; nothing moves`, async (w) => {
    const eo = await KIND[oldKind].make(w, ID.old)
    const en = await KIND[newKind].make(w, ID.new)
    const before = await stateOf(w)
    const from = w.seam.mark()
    assert.deepEqual(await w.service.retire(eo, en), refused(want))
    assert.deepEqual(await stateOf(w), before)
    assert.deepEqual(w.seam.since(from), [], 'a refusal wrote or called something')
  })
  refusalRow('1', 'unknown', 'good', CODE.unknownEntry)
  refusalRow('2', 'good', 'unknown', CODE.unknownEntry)
  refusalRow('3', 'deleted', 'good', CODE.unknownEntry)
  refusalRow('4', 'user', 'good', CODE.notHosted)
  refusalRow('5', 'good', 'user', CODE.notHosted)
  refusalRow('6', 'recordless', 'good', CODE.notHosted)
  refusalRow('7', 'good', 'recordless', CODE.notHosted)
  refusalRow('8', 'other', 'good', CODE.notHosted)
  refusalRow('9', 'good', 'unpaired', CODE.successorUnpaired)
  refusalRow('10 (order)', 'unknown', 'user', CODE.unknownEntry)
  refusalRow('11 (order)', 'user', 'unpaired', CODE.notHosted)
  refusalRow('12 (order)', 'other', 'unpaired', CODE.notHosted)
  worldRow(sdk, CASE.refusalDt, '13', 'retire(K, K) with one key twice → rejects TypeError; nothing changes', async (w) => {
    const { eo } = await oldEntry(w)
    const before = await stateOf(w)
    await assert.rejects(async () => w.service.retire(eo, eo), TypeError)
    assert.deepEqual(await stateOf(w), before)
  })
  worldRow(sdk, CASE.refusalDt, '14', 'a refusal is data: retire resolves (never rejects) for unknown keys of any string', async (w) => {
    assert.deepEqual(await w.service.retire(FIXTURE.unknownEntry, ''), refused(CODE.unknownEntry))
  })

  // SUCC-DT-03 — what the step moves, by the old entry's state × the successor's name.
  const moveRow = (part, title, opts, check) => worldRow(sdk, CASE.stepDt, part, title, async (w) => {
    const u = await navigatorWorld(w, opts)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await check(w, u)
  })
  moveRow('1', 'old named, successor nameless → the successor takes the old name', {}, (w, u) => assert.equal(w.pairs.pairOf(u.en).name, NAME.navigator))
  moveRow('2', 'old named, successor named (its own name) → the successor\'s own name is replaced by the old one', { successorName: NAME.successorOwn }, (w, u) => assert.equal(w.pairs.pairOf(u.en).name, NAME.navigator))
  moveRow('3', 'old nameless, successor named → the successor becomes nameless; the note names it ID: <id>', { oldName: null, successorName: NAME.successorOwn }, (w, u) => {
    assert.equal(w.pairs.pairOf(u.en).name, null)
    assertNotes(w, u, labelOf(null, ID.new))
  })
  withdrawnRow(sdk, CASE.stepDt, '4', 'old not designated (another entry is) → the designated role is not touched', WITHDRAWN.designated)

  // The failure sweep: every pre-commit step fails in its own world (HOST-UC-03 E2 at EVERY step).
  const build = (w) => navigatorWorld(w)
  // All or nothing (K3 retire, R-HOST-09): a failure the module absorbs is acceptable only when the
  // answer is {ok: true} and the whole succession happened, durably; otherwise it is operation-failed
  // and nothing moved, and the instance's retry then succeeds.
  row(sdk, CASE.stepDt, 'E2 sweep (pre-commit)', 'a write failing at ANY step up to and including PairStore.succeed → all or nothing: operation-failed with the world exactly as before (and a retry succeeds), or {ok: true} with the whole succession done, durably', async (t) => {
    const { pre } = await referenceSteps(t, sdk, build)
    for (const step of pre) {
      await t.test(`${step.descriptor} #${step.ordinal}`, async (tt) => {
        const what = `failing ${step.descriptor} #${step.ordinal}`
        const { w, u, result, before, ran } = await failingAt(tt, sdk, build, step)
        if (!skipUnlessRan(tt, ran, step)) return
        if (result?.ok === true) {
          await assertSucceeded(w, u)
          await assertReissued(w, u)
          assertNotes(w, u, NAME.navigator)
          await w.reopen()
          await assertSucceeded(w, u)
          return
        }
        assert.deepEqual(result, refused(CODE.operationFailed), what)
        assert.deepEqual(await stateOf(w), before, `${what} answered operation-failed but left a change`)
        assert.deepEqual(w.notes.calls, [], 'a note was written by a failed succession')
        const { live, ...stored } = before
        void live
        await w.reopen()
        assert.deepEqual(await storedStateOf(w), stored, `${what}: after a restart the stored state is not the state before the call`)
        assert.deepEqual(await w.service.retire(u.eo, u.en), OK, 'the retry after the failure did not succeed')
        await assertSucceeded(w, u)
      })
    }
  }, undefined, { timeout: WAIT.sweepMs })
  row(sdk, CASE.stepDt, 'post-commit sweep', 'a step failing AFTER PairStore.succeed (re-issue, delete of Eo, hosted record, a note) → still {ok: true}; the name and sessions moved; the failure is logged', async (t) => {
    const { post } = await referenceSteps(t, sdk, build)
    assert.ok(post.length > 0, 'nothing ran after the commit point (the delete of Eo and the notes are after it)')
    for (const step of post) {
      await t.test(`${step.descriptor} #${step.ordinal}`, async (tt) => {
        const what = `failing ${step.descriptor} #${step.ordinal}`
        const { w, u, result, ran } = await failingAt(tt, sdk, build, step)
        if (!skipUnlessRan(tt, ran, step)) return
        assert.deepEqual(result, OK, `${what} after the commit changed the answer`)
        for (const s of u.moved) assert.equal(w.managed.managerOf(s), u.succ)
        assert.equal(w.pairs.pairOf(u.en).name, NAME.navigator)
        await assertEachOfferConsistent(w, u, what)
        await retryUntil(w, () => w.registry.get(u.eo) === undefined && !w.hasHostedRecord(u.eo))
        assert.equal(w.registry.get(u.eo), undefined, `${what}: the old entry was never deleted`)
        assert.ok(!w.hasHostedRecord(u.eo), `${what}: the old hosted record was never removed`)
        await w.reopen()
        for (const s of u.moved) assert.equal(w.managed.managerOf(s), u.succ, `${what}: after a restart ${s} is not the successor's`)
        assert.equal(w.pairs.pairOf(u.en).name, NAME.navigator)
        const mine = (await pendingOf(w, u.succ)).map((e) => e.eventId)
        for (const id of u.pending) assert.equal(mine.filter((x) => x === id).length, 1, `${what}: after a restart moved event ${id} is not in the successor's mailbox once`)
      })
    }
  }, undefined, { timeout: WAIT.sweepMs })


  // Post-commit decision rows, each with its own observable consequence.
  worldRow(sdk, CASE.stepDt, 'P1', 'removeToken(Eo) fails → {ok: true}; logged; retried every HOSTED_TIMING.retryMs until Eo is gone', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await retireFailing(w, u, afterCommit(DOMAIN.pairs, callStep(PORT.writer, CALL.removeToken))), OK)
    assert.ok(logged(w).length > 0, 'the failed delete was not logged')
    assert.ok(w.timers.scheduled.includes(w.mod.HOSTED_TIMING.retryMs), 'no retry was scheduled at HOSTED_TIMING.retryMs')
    const gone = () => w.registry.get(u.eo) === undefined && !w.hasHostedRecord(u.eo)
    assert.equal(await retryUntil(w, gone), true, 'the retry did not delete the old entry and its hosted record')
    assert.equal(w.registry.get(u.eo), undefined, 'the retry did not delete the old entry')
    assert.ok(!w.hasHostedRecord(u.eo), 'the old hosted record is still stored')
  })
  worldRow(sdk, CASE.stepDt, 'P2', 'the old hosted record\'s delete fails → {ok: true}; logged; retried until it is gone', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await retireFailing(w, u, afterCommit(DOMAIN.pairs, writeStep(DOMAIN.hosted))), OK)
    assert.ok(logged(w).length > 0)
    assert.ok(w.timers.scheduled.includes(w.mod.HOSTED_TIMING.retryMs), 'no retry was scheduled at HOSTED_TIMING.retryMs')
    assert.equal(await retryUntil(w, () => !w.hasHostedRecord(u.eo)), true, 'the retry did not remove the old hosted record')
    assert.equal(w.service.entryState(u.eo), K3.states.deleted)
  })
  worldRow(sdk, CASE.stepDt, 'P3', 'the note for S1 is rejected once → {ok: true}; logged; S2 gets its note; S1\'s is retried after HOSTED_TIMING.retryMs and written: exactly one note per moved session', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await retireFailing(w, u, noteFor(S.s1)), OK)
    assert.ok(logged(w).length > 0, 'the failed note was not logged')
    assert.deepEqual([w.notes.of(S.s1).length, w.notes.of(S.s2).length], [0, 1])
    assert.ok(w.timers.scheduled.includes(w.mod.HOSTED_TIMING.retryMs), 'no retry was scheduled at HOSTED_TIMING.retryMs')
    assert.equal(await retryUntil(w, () => w.notes.of(S.s1).length > 0), true, 'the note for S1 was never written')
    assertNotes(w, u, NAME.navigator)
    assert.equal(w.notes.attemptsOf(S.s1), 2, 'the note for S1 was not retried exactly once')
  })
  worldRow(sdk, CASE.stepDt, 'P3 (close)', 'every note is rejected → {ok: true}; a retry stays pending until close(), which cancels it', async (w) => {
    const u = await navigatorWorld(w)
    const failing = w.seam.failEvery(callStep(PORT.notes, CALL.system))
    try {
      assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
      assert.ok(w.timers.pending > 0, 'no note retry is pending')
      await w.closeService()
      assert.equal(w.timers.pending, 0, 'close() left a note retry pending')
    } finally { failing.stop() }
    assert.deepEqual(w.notes.stored, [])
  })
  worldRow(sdk, CASE.stepDt, 'P4', 'the staged r2 commit of O1 fails (before the commit point) → operation-failed; the world as before (O1 live with its old id, held by Eo; En never sees r2); a retry succeeds', async (w) => {
    const u = await navigatorWorld(w, { offers: [ET.permission] })
    const d = u.held[0].descriptor
    const before = await stateOf(w)
    assert.deepEqual(await retireFailing(w, u, callStep(PORT.mailbox, CALL.stagedCommit)), refused(CODE.operationFailed))
    assert.deepEqual(await stateOf(w), before)
    assert.deepEqual(w.routing.liveOffers(S.s1).map((o) => [o.principalKey, o.descriptor.offerId]), [[u.old, d.offerId]])
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertReissued(w, u)
  })
  worldRow(sdk, CASE.stepDt, 'P5', 'the retirement of O1\'s old event fails after the commit → {ok: true}; logged only (not retried): O1 is live as r2, held by En, its old event still pending in En\'s box once; settle with the old id settles r2', async (w) => {
    const u = await navigatorWorld(w, { offers: [ET.permission] })
    const { descriptor: d, event } = u.held[0]
    const next = formatOfferId(d.approvalId, OFFER_ID.firstRevision + 1)
    assert.deepEqual(await retireFailing(w, u, afterCommit(DOMAIN.pairs, callStep(PORT.mailbox, CALL.retire))), OK)
    assert.ok(logged(w).length > 0, 'the failed retirement was not logged')
    await w.timers.runAll()
    assert.deepEqual(w.routing.liveOffers(S.s1).map((o) => [o.principalKey, o.descriptor.offerId]), [[u.succ, next]])
    const mine = await pendingOf(w, u.succ)
    assert.deepEqual([mine.filter((e) => e.eventId === event.eventId).length, mine.filter((e) => e.offer?.offerId === next).length], [1, 1])
    assert.ok(!mine.some((e) => e.type === ET.retirement && e.payload.retiredEventId === event.eventId), 'the failed retirement was retried')
    await assertUserSettles(w, u, u.held[0], d.offerId)
  })
}

// ================================================================================================
// State Transitions
// ================================================================================================

function transitions(sdk) {
  // HOST-ST-02 — the hosted principal across reinstall.
  worldRow(sdk, CASE.st02, '1', 'Old(Eo) active → reinstall (createHosted + pair) → Old(Eo) + New(En) provisional: both entries enabled, En nameless, Eo unchanged', async (w) => {
    const { eo } = await oldEntry(w)
    const oldPair = w.pairs.pairOf(eo)
    const { en } = await successor(w)
    assert.deepEqual([w.service.entryState(eo), w.service.entryState(en)], [K3.states.enabled, K3.states.enabled])
    assert.deepEqual(w.pairs.pairOf(eo), oldPair)
    assert.equal(w.pairs.pairOf(en).name, null)
  })
  worldRow(sdk, CASE.st02, '2', 'Old + New provisional → succession ok → New(En) only, with Eo\'s sessions, role and name', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertSucceeded(w, u)
    assert.deepEqual(w.registry.list().filter((e) => e.hosted).map((e) => e.entryKey), [u.en])
  })
  worldRow(sdk, CASE.st02, '3', 'Old + New provisional → succession fails → Old + New provisional (unchanged)', async (w) => {
    const u = await navigatorWorld(w)
    const before = await stateOf(w)
    assert.deepEqual(await retireFailing(w, u, callStep(PORT.mailbox, CALL.stage)), refused(CODE.operationFailed))
    assert.deepEqual(await stateOf(w), before)
  })
  // Re-baselined by C-WIRE-2 (q5): no role move exists, so the failing pre-commit step is the staged transfer.
  worldRow(sdk, CASE.st02, '4', 'Old + New provisional (a pre-commit step failed) → the instance\'s next start retries, succession ok → New(En) only', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await retireFailing(w, u, callStep(PORT.mailbox, CALL.stage)), refused(CODE.operationFailed))
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertSucceeded(w, u)
  })
  worldRow(sdk, CASE.st02, '5', 'New(En) only → an agent answers with Eo\'s old offer id → expired', async (w, t) => {
    const u = await navigatorWorld(w, { offers: [ET.question] })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertAgentExpired(t, sdk, w, u, u.held[0])
  })

  // NAME-ST-01 rows 8–9.
  worldRow(sdk, CASE.nameSt01, '8', 'Nameless (successor) → retire succeeds → Named(old), moved in the same step: no sampled instant shows the name twice or nowhere', async (w) => {
    const u = await navigatorWorld(w)
    const holders = []
    const sample = () => holders.push(w.pairs.list().filter((p) => p.name !== null && nameKey(p.name) === nameKey(NAME.navigator)).length)
    w.seam.observers.add(sample)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    w.seam.observers.delete(sample)
    assert.ok(holders.length > 0, 'no step was sampled')
    assert.deepEqual([...new Set(holders)], [1], 'at some instant "Navigator" was held by more or fewer than one pair')
  })
  worldRow(sdk, CASE.nameSt01, '8 (old nameless)', 'Nameless (successor) → retire succeeds with a nameless old principal → Nameless (shown ID: <id>)', async (w) => {
    const u = await navigatorWorld(w, { oldName: null })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    assert.equal(w.pairs.pairOf(u.en).name, null)
  })
  worldRow(sdk, CASE.nameSt01, '9', 'Nameless (successor) → retire fails (injected) → Nameless; the old principal keeps its name', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await retireFailing(w, u, writeStep(DOMAIN.pairs)), refused(CODE.operationFailed))
    assert.equal(w.pairs.pairOf(u.en).name, null)
    assert.equal(w.pairs.pairOf(u.eo).name, NAME.navigator)
  })
  worldRow(sdk, CASE.nameSt01, '9 (refused)', 'Nameless (successor) → retire refused (successor-unpaired) → the old principal keeps its name', async (w) => {
    const { eo } = await oldEntry(w)
    const { en } = await successor(w, { paired: false })
    assert.deepEqual(await w.service.retire(eo, en), refused(CODE.successorUnpaired))
    assert.equal(w.pairs.pairOf(eo).name, NAME.navigator)
  })

  // HAND-ST-01 row 7, WATCH-ST-01 row 6, PLAT-ST-01 row 7.
  worldRow(sdk, CASE.handSt01, '7', 'Managed(P) → Q24 succession P → P\' → Managed(P\'); one system note; later events to P\'; no handover / takeback / retirement of the sessions', async (w) => {
    const u = await navigatorWorld(w, { offers: [] })
    const seen = { n: 0 }
    const off = w.handover.onChange(() => { seen.n += 1 })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    off()
    for (const s of u.moved) assert.deepEqual(w.handover.managed().filter((m) => m.sessionId === s).map((m) => m.principal.key), [u.succ])
    assert.ok(seen.n > 0, 'the hand-over service did not signal the change')
    const mine = await pendingOf(w, u.succ)
    assert.deepEqual(mine.filter((e) => [ET.handover, ET.takeback, ET.retirement].includes(e.type)), [], 'the move produced hand-over events')
    assertNotes(w, u, NAME.navigator)
    await assertLaterEventsTo(w, u)
  })
  worldRow(sdk, CASE.watchSt01, '6', 'Watched(P) → succession P → P\' → Watched(P\'); later events to P\' only, none sent twice (pending ones moved with their eventIds)', async (w) => {
    const u = await navigatorWorld(w, { offers: [] })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    const ids = (await allPending(w)).map((x) => x.e.eventId)
    assert.equal(new Set(ids).size, ids.length, 'an event is pending twice')
    await assertLaterEventsTo(w, u)
  })
  worldRow(sdk, CASE.platSt01, '7', 'Live(P) → succession → Live(P\'): the same request, revision + 1; the old id answers expired to any principal; the user\'s answer settles the one request', async (w, t) => {
    const u = await navigatorWorld(w, { offers: [ET.planReview] })
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await assertReissued(w, u)
    await assertAgentExpired(t, sdk, w, u, u.held[0])
    await assertUserSettles(w, u, u.held[0], u.held[0].descriptor.offerId)
  })

  // SUCC-ST-01 — after the step.
  worldRow(sdk, CASE.post, '1', 'durable: after a connector restart S1, S2 are still En\'s, En is still Navigator, Eo is still gone, e1/e2 still in En\'s mailbox', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    await w.reopen()
    await assertSucceeded(w, u)
  })
  worldRow(sdk, CASE.post, '2', 'a second retire(Eo, En) after a success → unknown-entry (Eo is deleted); nothing changes', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    const before = await stateOf(w)
    assert.deepEqual(await w.service.retire(u.eo, u.en), refused(CODE.unknownEntry))
    assert.deepEqual(await stateOf(w), before)
  })
  worldRow(sdk, CASE.post, '3', 'the old entry\'s delete fires a deleted revocation for Eo; with no pair, sessions or events left, nothing visible changes for En', async (w) => {
    const u = await navigatorWorld(w)
    const revoked = []
    const off = w.registry.onRevoked((entryKey, kind) => revoked.push([entryKey, kind]))
    assert.deepEqual(await w.service.retire(u.eo, u.en), OK)
    off()
    assert.deepEqual(revoked.filter(([k]) => k === u.eo).map(([, kind]) => kind), [REVOCATION_KIND.deleted])
    await assertSucceeded(w, u)
  })
  // C-REVOKE's handler of that deleted revocation (it ends nothing, drops nothing) runs in packages/dsh-connector/tests/revocation REV-EP-06.
  todoRow(sdk, CASE.post, '4', 'the note starts no turn in a real DSH session (K1d SessionNotes, W4 Q2 = A)', LATER.wire)
  worldRow(sdk, CASE.post, '5', 'close() during a pending post-commit retry cancels its timer', async (w) => {
    const u = await navigatorWorld(w)
    assert.deepEqual(await retireFailing(w, u, afterCommit(DOMAIN.pairs, callStep(PORT.writer, CALL.removeToken))), OK)
    assert.ok(w.timers.pending > 0, 'no retry is pending')
    await w.closeService()
    assert.equal(w.timers.pending, 0, 'close() left a retry timer pending')
  })
  worldRow(sdk, CASE.post, '6', 'resume() with no hosted record marked succeededBy (a hosted entry, a user-made one) → nothing changes, nothing is written', async (w) => {
    await w.hostedEntry()
    await w.userEntry()
    const before = await stateOf(w)
    const from = w.seam.mark()
    await w.resume()
    assert.deepEqual(await stateOf(w), before)
    assert.deepEqual(w.seam.since(from), [], 'resume() wrote or called something')
  })
}


// ================================================================================================
// K1d Mailbox.transfer (C-SUCCEED's slice of C-MAILBOX)
// ================================================================================================

function transferRows(sdk) {
  /** A row on the C-MAILBOX suite's world (the real mailbox only: these rows need no other module). */
  const tr = (part, title, fn) => row(sdk, CASE.transfer, part, title, async (t) => fn(await mailboxWorld(t, sdk)))
  const box = (w) => w.mailbox
  const ids = async (w, key) => (await pollAll(w.mailbox, key)).map((e) => e.eventId)
  const commitN = async (w, key, n) => {
    const out = []
    for (let i = 0; i < n; i += 1) {
      const r = await w.mailbox.commit(key, messageDraft(S.s1, i))
      assert.equal(r?.ok, true, `harness: commit refused: ${JSON.stringify(r)}`)
      out.push(r.eventId)
    }
    return out
  }
  const both = async (w) => ({ from: await ids(w, FIXTURE.from), to: await ids(w, FIXTURE.to) })

  tr('B1', 'every pending event of from moves to to, in order, after to\'s own, with its eventId, type, at, session, correlation, payload and digest; {moved} counts them', async (w) => {
    const own = await commitN(w, FIXTURE.to, 1)
    const moving = await commitN(w, FIXTURE.from, 2)
    const before = await pollAll(w.mailbox, FIXTURE.from)
    assert.deepEqual(await box(w).transfer(FIXTURE.from, FIXTURE.to), { moved: moving.length })
    const after = await pollAll(w.mailbox, FIXTURE.to)
    assert.deepEqual(after.map((e) => e.eventId), [...own, ...moving])
    const kept = (e) => [e.type, e.at, e.sourceSessionId, e.correlationId, e.payloadDigest, e.payload]
    for (const e of before) assert.deepEqual(kept(after.find((x) => x.eventId === e.eventId)), kept(e))
    assert.deepEqual(await ids(w, FIXTURE.from), [])
    const seq = after.map((e) => e.sequence)
    assert.deepEqual(seq, [...seq].sort((a, b) => a - b), 'the moved events do not carry the new mailbox\'s ascending sequences')
    const generation = (await box(w).summary(FIXTURE.to)).mailboxGeneration
    for (const e of after) assert.equal(e.mailboxGeneration, generation, 'a moved event does not carry the new mailbox\'s generation')
  })
  tr('B1 (held source)', 'a held source\'s pending events move too; the source stays held', async (w) => {
    await commitN(w, FIXTURE.from, 1)
    await box(w).hold(FIXTURE.from, w.clock.now())
    assert.deepEqual(await box(w).transfer(FIXTURE.from, FIXTURE.to), { moved: 1 })
    assert.equal((await ids(w, FIXTURE.to)).length, 1)
    assert.equal((await box(w).poll(FIXTURE.from, undefined, MAILBOX.pageMax)).ok, false, 'the source is no longer held')
  })
  tr('B1 (held destination)', 'a held destination receives the events; they are pollable once it is released', async (w) => {
    await commitN(w, FIXTURE.from, 1)
    await box(w).hold(FIXTURE.to, w.clock.now())
    assert.deepEqual(await box(w).transfer(FIXTURE.from, FIXTURE.to), { moved: 1 })
    assert.equal((await box(w).poll(FIXTURE.to, undefined, MAILBOX.pageMax)).ok, false, 'the destination is no longer held')
    await box(w).release(FIXTURE.to)
    assert.equal((await ids(w, FIXTURE.to)).length, 1)
  })
  tr('B1 (hint)', 'moved > 0 → one hint to to\'s listen streams, none to from\'s; moved = 0 → no hint', async (w) => {
    await commitN(w, FIXTURE.from, 1)
    const count = (key) => w.hints.for(key).length
    const [to, from] = [count(FIXTURE.to), count(FIXTURE.from)]
    await box(w).transfer(FIXTURE.from, FIXTURE.to)
    assert.deepEqual([count(FIXTURE.to) - to, count(FIXTURE.from) - from], [1, 0])
    await box(w).transfer(FIXTURE.from, FIXTURE.to)
    assert.equal(count(FIXTURE.to) - to, 1, 'a transfer that moved nothing sent a hint')
  })
  tr('B1 (restart)', 'the move is durable: after a restart the events are in to\'s mailbox only', async (w) => {
    const moving = await commitN(w, FIXTURE.from, 2)
    await box(w).transfer(FIXTURE.from, FIXTURE.to)
    await w.reopen()
    assert.deepEqual(await both(w), { from: [], to: moving })
  })
  tr('B2', 'acked and retired events stay behind; nothing new is committed (no retirement)', async (w) => {
    const [acked, retired, kept] = await commitN(w, FIXTURE.from, 3)
    const e = (await pollAll(w.mailbox, FIXTURE.from)).find((x) => x.eventId === acked)
    assert.equal((await box(w).ack(FIXTURE.from, [{ eventId: e.eventId, payloadDigest: e.payloadDigest }])).ok, true)
    assert.deepEqual(await box(w).retire(FIXTURE.from, retired, RETIREMENT_REASON.withdrawn), { retired: true })
    const left = await pollAll(w.mailbox, FIXTURE.from)
    assert.deepEqual(await box(w).transfer(FIXTURE.from, FIXTURE.to), { moved: left.length })
    const got = await pollAll(w.mailbox, FIXTURE.to)
    assert.deepEqual(got.map((x) => x.eventId), left.map((x) => x.eventId), 'not exactly the pending events moved')
    assert.ok(got.some((x) => x.eventId === kept))
    assert.ok(!got.some((x) => x.eventId === acked || x.eventId === retired), 'an acked or retired event moved')
  })
  tr('B2 (queue full)', `the destination at QUEUE.maxQueuedInputs (${QUEUE.maxQueuedInputs}) still takes a moved event`, async (w) => {
    await commitN(w, FIXTURE.to, QUEUE.maxQueuedInputs)
    await commitN(w, FIXTURE.from, 1)
    assert.deepEqual(await box(w).transfer(FIXTURE.from, FIXTURE.to), { moved: 1 })
    assert.equal((await ids(w, FIXTURE.to)).length, QUEUE.maxQueuedInputs + 1)
  })
  tr('B3', 'an unknown source → {moved: 0}; a repeat of a done transfer moves nothing more', async (w) => {
    assert.deepEqual(await box(w).transfer(FIXTURE.nobody, FIXTURE.to), { moved: 0 })
    await commitN(w, FIXTURE.from, 1)
    assert.deepEqual(await box(w).transfer(FIXTURE.from, FIXTURE.to), { moved: 1 })
    assert.deepEqual(await box(w).transfer(FIXTURE.from, FIXTURE.to), { moved: 0 })
    assert.equal((await ids(w, FIXTURE.to)).length, 1)
  })
  for (const [name, [from, to]] of Object.entries(FIXTURE.badTransfers)) {
    tr('B4', `${name} → throws TypeError synchronously; nothing changes`, async (w) => {
      await commitN(w, FIXTURE.from, 1)
      const before = await both(w)
      assert.throws(() => box(w).transfer(from, to), TypeError)
      assert.deepEqual(await both(w), before)
    })
  }
  /** Two pending events in `from`'s mailbox of a succession world; returns the world's boxes before the transfer. */
  const twoToMove = async (w) => {
    for (const k of [FIXTURE.from, FIXTURE.to]) w.keys.add(k)
    for (let i = 0; i < 2; i += 1) await plainEvent(w, FIXTURE.from, messageDraft(S.s1, i))
    return boxes(w)
  }
  row(sdk, CASE.transfer, 'B5', 'K1d "a failed write moves nothing": whichever storage write of the transfer fails, it rejects with both mailboxes as before, or resolves having moved everything (also after a restart)', async (t) => {
    const ref = await succeedWorld(t, sdk)
    await twoToMove(ref)
    const from = ref.seam.mark()
    await ref.realMailbox.transfer(FIXTURE.from, FIXTURE.to)
    const writes = ref.seam.since(from).filter(writeStep(DOMAIN.mailbox))
    assert.ok(writes.length > 0, 'the transfer wrote nothing')
    for (const step of writes) {
      await t.test(`${step.descriptor} #${step.ordinal}`, async (tt) => {
        const w = await succeedWorld(tt, sdk)
        const before = await twoToMove(w)
        w.seam.mark()
        w.seam.failNext(sameStep(step))
        const outcome = await w.realMailbox.transfer(FIXTURE.from, FIXTURE.to).then((value) => ({ value }), (error) => ({ error }))
        assert.equal(w.seam.failArmed, false, 'the step did not run, so nothing failed')
        // Absorbing a failed write is acceptable only if the whole move then happened, durably.
        const want = outcome.error === undefined ? { [FIXTURE.from]: [], [FIXTURE.to]: before[FIXTURE.from] } : before
        if (outcome.error === undefined) assert.deepEqual(outcome.value, { moved: before[FIXTURE.from].length })
        assert.deepEqual(await boxes(w), want, outcome.error === undefined ? 'the transfer resolved but did not move everything' : 'the transfer rejected but moved something')
        await w.reopen()
        assert.deepEqual(await boxes(w), want, 'after a restart the stored mailboxes are not what the transfer answered')
      })
    }
  })
}

// ================================================================================================
// C-MAILBOX stage (C-SUCCEED's staged transfer; phase-3 contract, not K1)
// ================================================================================================

function stageRows(sdk) {
  const st = (part, title, fn) => row(sdk, CASE.stage, part, title, async (t) => fn(await mailboxWorld(t, sdk)))
  const commitOf = async (w, key, sessionId, n) => {
    const r = await w.mailbox.commit(key, messageDraft(sessionId, n))
    assert.equal(r?.ok, true, `harness: commit refused: ${JSON.stringify(r)}`)
    return r.eventId
  }
  const ids = async (w, key) => (await pollFrom(w.mailbox, key)).events.map((e) => e.eventId)
  /** to holds one own event (of S4), from two (of S1, S2). Returns {own, moving, polled}: from's events as polled. */
  const twoBoxes = async (w) => {
    const own = [await commitOf(w, FIXTURE.to, S.s4, 0)]
    const moving = [await commitOf(w, FIXTURE.from, S.s1, 1), await commitOf(w, FIXTURE.from, S.s2, 2)]
    return { own, moving, polled: (await pollFrom(w.mailbox, FIXTURE.from)).events }
  }

  st('1 (staged)', 'stage(from, to) → movedIds are from\'s pending events; from is empty; to\'s poll stops at the barrier (its own events, hasMore false), even after a staged commit; to\'s ack of a moved event is unknown-event; no hint to to', async (w) => {
    const b = await twoBoxes(w)
    const hints = hintsTo(w, FIXTURE.to)
    const staged = await w.mailbox.stage(FIXTURE.from, FIXTURE.to)
    assert.deepEqual([...staged.movedIds], b.moving)
    assert.deepEqual(await ids(w, FIXTURE.from), [])
    const page = await w.mailbox.poll(FIXTURE.to, undefined, MAILBOX.pageMax)
    assert.deepEqual([page.ok, page.hasMore, page.events?.map((e) => e.eventId)], [true, false, b.own])
    assert.equal(typeof await staged.commit(messageDraft(S.s1, 3)), 'string', 'staged.commit resolved no eventId')
    assert.deepEqual(await ids(w, FIXTURE.to), b.own, 'a staged commit is visible before confirm()')
    for (const e of b.polled) assert.deepEqual(await w.mailbox.ack(FIXTURE.to, [receipt(e)]), refused(REFUSAL.unknownEvent))
    assert.equal(hintsTo(w, FIXTURE.to), hints, 'to was hinted while staged')
  })
  st('2 (confirm)', 'confirm() lifts the barrier: from the cursor polled while staged, to reads the moved events then the staged commit, in order; one hint to to; the moved events ack', async (w) => {
    const b = await twoBoxes(w)
    const staged = await w.mailbox.stage(FIXTURE.from, FIXTURE.to)
    const extra = await staged.commit(messageDraft(S.s1, 3))
    const { cursor } = await pollFrom(w.mailbox, FIXTURE.to)
    const hints = hintsTo(w, FIXTURE.to)
    staged.confirm()
    assert.deepEqual((await pollFrom(w.mailbox, FIXTURE.to, cursor)).events.map((e) => e.eventId), [...b.moving, extra])
    assert.deepEqual(await ids(w, FIXTURE.to), [...b.own, ...b.moving, extra])
    assert.equal(hintsTo(w, FIXTURE.to) - hints, 1, 'confirm() did not hint to once')
    assert.deepEqual(await w.mailbox.ack(FIXTURE.to, b.polled.map(receipt)), { ok: true, acked: b.polled.length })
  })
  st('3 (undo)', 'undo([S1, S2]) → the staged commit is gone; from holds its moved events again, then the event of S1 committed to to while staged; to keeps its own and the event of S3 committed while staged, now visible', async (w) => {
    const b = await twoBoxes(w)
    const staged = await w.mailbox.stage(FIXTURE.from, FIXTURE.to)
    const extra = await staged.commit(messageDraft(S.s1, 3))
    const ofS1 = await commitOf(w, FIXTURE.to, S.s1, 4)
    const ofS3 = await commitOf(w, FIXTURE.to, S.s3, 5)
    await staged.undo([S.s1, S.s2])
    assert.deepEqual(await ids(w, FIXTURE.from), [...b.moving, ofS1])
    assert.deepEqual(await ids(w, FIXTURE.to), [...b.own, ofS3])
    assert.ok(![...await ids(w, FIXTURE.from), ...await ids(w, FIXTURE.to)].includes(extra), 'the staged commit survived undo()')
  })
  st('4 (second stage)', 'a second stage into a staged to rejects TypeError and moves nothing; after confirm(), and after undo(), a new stage into to is accepted', async (w) => {
    await twoBoxes(w)
    const staged = await w.mailbox.stage(FIXTURE.from, FIXTURE.to)
    const third = await commitOf(w, FIXTURE.third, S.s3, 6)
    await assert.rejects(async () => w.mailbox.stage(FIXTURE.third, FIXTURE.to), TypeError)
    assert.deepEqual(await ids(w, FIXTURE.third), [third], 'the refused stage moved something')
    staged.confirm()
    const again = await w.mailbox.stage(FIXTURE.third, FIXTURE.to)
    assert.deepEqual([...again.movedIds], [third])
    await again.undo([S.s3])
    assert.deepEqual(await ids(w, FIXTURE.third), [third])
    const last = await w.mailbox.stage(FIXTURE.third, FIXTURE.to)
    last.confirm()
    assert.ok((await ids(w, FIXTURE.to)).includes(third), 'the stage after undo() was not accepted')
  })
}

/** Registers every C-SUCCEED case for `sdk`. */
export function registerSucceedCases(sdk) {
  useCases(sdk)
  partitions(sdk)
  boundaries(sdk)
  decisionTables(sdk)
  transitions(sdk)
  transferRows(sdk)
  stageRows(sdk)
  registerReviewXHostedCases(sdk)
}

