/**
 * C-MAILBOX cases for the K1 amendments after W2 (mcp-schema README "DECIDED #W2-1", index.d.ts
 * `Mailbox.release` / `Mailbox.retireContributor` / `EventDraft.activationTag`). No design case
 * exists for these rows, so they are named K1-AMEND-<n> (the EVT-UC-01 E2 row they unblock is in
 * cases.mjs).
 *
 * - K1-AMEND-1 (State Transition, one test per transition): a pair's mailboxGeneration is set when
 *   its storage is first made; `drop`, `hold`, `release` and the end of a hold (`expireHolds(at)`)
 *   keep it, and a cursor taken before them pages normally; only lost or reset storage starts a new
 *   one, and then an older cursor is `{resync: {reason: stale-cursor, headSequence}}`.
 * - K1-AMEND-3 (Decision Table, one test per rule; Equivalence Partitioning for the draft
 *   validation): `retireContributor(namespace, activationTag)` retires, as `retire` does, every
 *   pending `contributed:<namespace>.*` event committed with that tag, in every pair's mailbox,
 *   held ones included; nothing else. A polled event never carries `activationTag`. A tag on a
 *   non-contributed draft, or a tag that is not a non-empty string, is a programming error: commit
 *   rejects with TypeError (the suite's convention for draft misuse).
 * - K1-AMEND-9 (Decision Table on the event's state × the answer, Equivalence Partitioning of the
 *   reason, State Transition; DECIDED #W3-1, the fix of W2 finding SF3): `retire` resolves
 *   `{retired: true}` when it replaced a pending event of that pair, `{retired: false}` when nothing
 *   was pending there to replace (acked, already retired, unknown, another pair's): then nothing is
 *   committed, nothing changes and no hint is sent. Misuse still throws. Not covered: retire on a
 *   held mailbox (K1 does not say whether a held event counts as "pending" for retire).
 *
 * Level: the module over real DSH storage (subject.mjs), as cases.mjs. Every value is K1's or
 * fixture data (constants.mjs AMEND).
 */
import assert from 'node:assert/strict'
import { commitMany, commitOk, ids, page, pendingEvent, pollAll, receiptOf, row, snapshot } from './cases.mjs'
import {
  AMEND, CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, FIXTURE, MAILBOX, REFUSAL, RESYNC_REASON, RETIRE_FIXTURE, RETIRE_OUTCOME, RETIREMENT_REASON,
} from './constants.mjs'
import { worldFor } from './subject.mjs'

const ID = Object.freeze({ generation: 'K1-AMEND-1', retireContributor: 'K1-AMEND-3', retireOutcome: 'K1-AMEND-9' })
const { p: P, q: Q } = FIXTURE
const LIMIT = MAILBOX.pageMax
const TAG = AMEND.tag

// ------------------------------------------------------------------------------------------------
// K1-AMEND-1: mailboxGeneration

const generationOf = async (mailbox, key) => (await mailbox.summary(key)).mailboxGeneration
/** A poll that must be a page, not a resync (the generation was kept). */
async function assertPages(mailbox, key, cursor) {
  const result = await mailbox.poll(key, cursor, LIMIT)
  assert.equal(result?.resync, undefined, `a kept generation answered resync: ${JSON.stringify(result)}`)
  assert.equal(result?.ok, true, `poll refused: ${JSON.stringify(result)}`)
  assert.ok(Array.isArray(result.events), `no page: ${JSON.stringify(result)}`)
  return result
}

function generationCases(sdk) {
  const st = (part, title, fn) => row(sdk, ID.generation, part, title, fn)

  st('1 (first use)', '(no storage) → first commit → a generation is set; every event and the summary carry it', async (t) => {
    const w = await worldFor(t, sdk)
    const events = await commitMany(w.mailbox, P, 2)
    const generation = await generationOf(w.mailbox, P)
    assert.equal(typeof generation, 'string')
    assert.ok(generation.length > 0, 'an empty mailboxGeneration')
    assert.deepEqual((await pollAll(w.mailbox, P)).map((e) => e.mailboxGeneration), events.map(() => generation))
  })

  st('2 (restart)', 'a restart over the same storage is no loss: the generation is kept and a cursor from before pages', async (t) => {
    const w = await worldFor(t, sdk)
    const [, second] = await commitMany(w.mailbox, P, 2)
    const generation = await generationOf(w.mailbox, P)
    const cursor = (await page(w.mailbox, P, undefined, 1)).nextCursor
    await w.reopen()
    assert.equal(await generationOf(w.mailbox, P), generation)
    assert.deepEqual(ids((await assertPages(w.mailbox, P, cursor)).events), [second.eventId])
  })

  st('3 (hold, release)', 'Pending → hold → release: the generation is kept; a cursor taken before the hold pages to the rest, same generation', async (t) => {
    const w = await worldFor(t, sdk)
    const [, second] = await commitMany(w.mailbox, P, 2)
    const generation = await generationOf(w.mailbox, P)
    const cursor = (await page(w.mailbox, P, undefined, 1)).nextCursor
    await w.mailbox.hold(P, w.clock.now())
    await w.mailbox.release(P)
    assert.equal(await generationOf(w.mailbox, P), generation, 'hold / release changed the generation')
    const { events } = await assertPages(w.mailbox, P, cursor)
    assert.deepEqual(ids(events), [second.eventId])
    assert.deepEqual(events.map((e) => e.mailboxGeneration), [generation])
  })

  st('4 (drop)', 'Pending → drop (delete) → the generation is kept; a cursor from before pages (no resync) and reaches a later event', async (t) => {
    const w = await worldFor(t, sdk)
    await commitMany(w.mailbox, P, 2)
    const generation = await generationOf(w.mailbox, P)
    const cursor = (await page(w.mailbox, P, undefined, LIMIT)).nextCursor
    await w.mailbox.drop(P)
    assert.equal(await generationOf(w.mailbox, P), generation, 'drop changed the generation')
    const later = await commitOk(w.mailbox, P, EVENT_TYPE.message)
    assert.equal(await generationOf(w.mailbox, P), generation, 'the first commit after a drop changed the generation')
    const { events } = await assertPages(w.mailbox, P, cursor)
    assert.deepEqual(ids(events), [later.eventId], 'a cursor of the kept generation skipped the later event')
    assert.deepEqual(events.map((e) => e.mailboxGeneration), [generation])
  })

  // A held box is not pollable (K1 Mailbox.hold, R-TOK-05), and stays so after its hold expires: the
  // entry is disabled until re-enabled. The expiry dropped the events; release makes it pollable again.
  st('5 (hold expiry)', `Held → expireHolds(at) past MAILBOX.disabledRetentionMs → still held (forbidden), generation kept → release → a cursor from before pages (empty, no resync); a new commit carries the same generation`, async (t) => {
    const w = await worldFor(t, sdk)
    await commitMany(w.mailbox, P, 2)
    const generation = await generationOf(w.mailbox, P)
    const cursor = (await page(w.mailbox, P, undefined, 1)).nextCursor
    const heldAt = w.clock.now()
    await w.mailbox.hold(P, heldAt)
    assert.equal(typeof w.mailbox.expireHolds, 'function', 'the mailbox has no expireHolds(at) (K1 Mailbox.release: the end of a hold)')
    const at = heldAt + MAILBOX.disabledRetentionMs + AMEND.justAfterMs
    w.clock.advance(at - heldAt)
    await w.mailbox.expireHolds(at)
    assert.deepEqual(await w.mailbox.poll(P, cursor, LIMIT), { ok: false, code: REFUSAL.forbidden }, 'a held box was pollable after its hold expired')
    assert.equal(await generationOf(w.mailbox, P), generation, 'the end of the hold changed the generation')
    await w.mailbox.release(P)
    const after = await assertPages(w.mailbox, P, cursor)
    assert.deepEqual(after.events, [], 'the expired hold did not drop its events')
    const fresh = await commitOk(w.mailbox, P, EVENT_TYPE.message)
    assert.equal(await generationOf(w.mailbox, P), generation, 'the first commit after the expiry changed the generation')
    const { events } = await assertPages(w.mailbox, P, after.nextCursor)
    assert.deepEqual(events.map((e) => [e.eventId, e.mailboxGeneration]), [[fresh.eventId, generation]])
  })

  st('6 (storage lost)', 'storage lost → a new generation; the new events carry it; an older cursor is resync with the current headSequence', async (t) => {
    const w = await worldFor(t, sdk)
    await commitMany(w.mailbox, P, 3)
    const old = await generationOf(w.mailbox, P)
    const stale = (await page(w.mailbox, P, undefined, 1)).nextCursor
    await w.loseStorage()
    const [fresh] = await commitMany(w.mailbox, P, 1)
    const summary = await w.mailbox.summary(P)
    assert.notEqual(summary.mailboxGeneration, old)
    assert.deepEqual((await pollAll(w.mailbox, P)).map((e) => [e.eventId, e.mailboxGeneration]), [[fresh.eventId, summary.mailboxGeneration]])
    assert.deepEqual(await w.mailbox.poll(P, stale, LIMIT), { ok: true, resync: { reason: RESYNC_REASON.staleCursor, headSequence: summary.headSequence } })
  })

  st('6 (storage lost, nothing since)', 'storage lost, nothing committed since: an older cursor is resync with the summary\'s headSequence, never an empty page', async (t) => {
    const w = await worldFor(t, sdk)
    await commitMany(w.mailbox, P, 2)
    const stale = (await page(w.mailbox, P, undefined, 1)).nextCursor
    await w.loseStorage()
    const { headSequence } = await w.mailbox.summary(P)
    assert.deepEqual(await w.mailbox.poll(P, stale, LIMIT), { ok: true, resync: { reason: RESYNC_REASON.staleCursor, headSequence } })
  })

  st('6 (foreign cursor)', 'storage lost: another pair\'s cursor of the old generation is still forbidden, never resync', async (t) => {
    const w = await worldFor(t, sdk)
    await commitOk(w.mailbox, P, EVENT_TYPE.message)
    const qEvent = await commitOk(w.mailbox, Q, EVENT_TYPE.message)
    const qCursor = (await page(w.mailbox, Q, undefined, LIMIT)).nextCursor
    await w.loseStorage()
    await commitOk(w.mailbox, P, EVENT_TYPE.message)
    const result = await w.mailbox.poll(P, qCursor, LIMIT)
    assert.deepEqual(result, { ok: false, code: REFUSAL.forbidden }, JSON.stringify(result))
    assert.ok(!JSON.stringify(result).includes(qEvent.marker) && !JSON.stringify(result).includes(Q), 'the refusal leaks Q')
  })

  st('7 (pair isolation)', 'dropping P keeps Q\'s generation too; Q\'s cursor still pages', async (t) => {
    const w = await worldFor(t, sdk)
    await commitOk(w.mailbox, P, EVENT_TYPE.message)
    const [, q2] = await commitMany(w.mailbox, Q, 2)
    const generation = await generationOf(w.mailbox, Q)
    const cursor = (await page(w.mailbox, Q, undefined, 1)).nextCursor
    await w.mailbox.drop(P)
    assert.equal(await generationOf(w.mailbox, Q), generation)
    assert.deepEqual(ids((await assertPages(w.mailbox, Q, cursor)).events), [q2.eventId])
  })
}

// ------------------------------------------------------------------------------------------------
// K1-AMEND-3: retireContributor and EventDraft.activationTag

let counter = 0
/** A contributor draft of `namespace` (K1 CONTRIBUTED_PAYLOAD_SCHEMA shape), tagged unless `tag` is undefined. */
function contributed(namespace, tag, { sourceSessionId = FIXTURE.s1, correlationId = AMEND.correlationId } = {}) {
  const marker = FIXTURE.marker + 'amend-' + ++counter
  const draft = {
    type: CONTRIBUTED_TYPE_PREFIX + namespace + AMEND.typeSeparator + FIXTURE.contributedEvent,
    sourceSessionId, correlationId,
    payload: { namespace, event: FIXTURE.contributedEvent, data: { marker }, summary: marker },
  }
  if (tag !== undefined) draft.activationTag = tag
  return { draft, marker }
}
/** Commits a contributor draft; returns it as polled (pending). */
async function pendingContributed(mailbox, key, namespace, tag, options) {
  const { draft } = contributed(namespace, tag, options)
  const result = await mailbox.commit(key, draft)
  assert.equal(result?.ok, true, `commit refused: ${JSON.stringify(result)}`)
  const got = (await pollAll(mailbox, key)).find((e) => e.eventId === result.eventId)
  assert.ok(got, 'the committed contributor event is not pending')
  return got
}
/** Every retirement in `key`'s pending events naming `eventId`. */
const retirementsOf = async (mailbox, key, eventId) =>
  (await pollAll(mailbox, key)).filter((e) => e.type === EVENT_TYPE.retirement && e.payload?.retiredEventId === eventId)
/** As `retire` does (EVT-ST-01 row 4): no longer pending, one retirement naming it, keeping its session and correlation. */
async function assertRetired(mailbox, key, event) {
  assert.ok(!ids(await pollAll(mailbox, key)).includes(event.eventId), 'the event is still pending')
  const retirements = await retirementsOf(mailbox, key, event.eventId)
  assert.equal(retirements.length, 1, `retirements naming it: ${retirements.length}`)
  assert.deepEqual(retirements[0].payload, { retiredEventId: event.eventId, reason: RETIREMENT_REASON.contributorWithdrawn })
  assert.equal(retirements[0].sourceSessionId, event.sourceSessionId)
  assert.equal(retirements[0].correlationId, event.correlationId)
}
async function assertUntouched(mailbox, key, event) {
  assert.ok(ids(await pollAll(mailbox, key)).includes(event.eventId), 'an event that should stay pending was retired')
  assert.deepEqual(await retirementsOf(mailbox, key, event.eventId), [], 'a retirement names it')
}

function retireContributorCases(sdk) {
  const rule = (part, title, fn) => row(sdk, ID.retireContributor, part, title, async (t) => fn(await worldFor(t, sdk)))
  const NS = FIXTURE.namespace

  rule('1 (pending, namespace, tag)', 'a pending contributed:<ns>.* event with the tag → retired as retire does (contributor-withdrawn, session and correlation kept)', async (w) => {
    const e = await pendingContributed(w.mailbox, P, NS, TAG.a)
    await w.mailbox.retireContributor(NS, TAG.a)
    await assertRetired(w.mailbox, P, e)
  })
  rule('1 (ack after)', 'the retired event acked later → a no-op success counting 0', async (w) => {
    const e = await pendingContributed(w.mailbox, P, NS, TAG.a)
    await w.mailbox.retireContributor(NS, TAG.a)
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(e)]), { ok: true, acked: 0 })
  })
  rule('2 (acked)', 'an acked event of that namespace and tag → left alone: no retirement names it', async (w) => {
    const acked = await pendingContributed(w.mailbox, P, NS, TAG.a)
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(acked)]), { ok: true, acked: 1 })
    await w.mailbox.retireContributor(NS, TAG.a)
    assert.deepEqual(await retirementsOf(w.mailbox, P, acked.eventId), [])
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(acked)]), { ok: true, acked: 0 }, 'the acked receipt is still known')
  })
  rule('3 (other namespace)', 'the same tag in another namespace (sharing the prefix) → left alone', async (w) => {
    const other = await pendingContributed(w.mailbox, P, AMEND.otherNamespace, TAG.a)
    const mine = await pendingContributed(w.mailbox, P, NS, TAG.a)
    await w.mailbox.retireContributor(NS, TAG.a)
    await assertUntouched(w.mailbox, P, other)
    await assertRetired(w.mailbox, P, mine)
  })
  rule('4 (other tag)', 'the same namespace, another activation\'s tag → left alone (a reload retires only the old activation)', async (w) => {
    const old = await pendingContributed(w.mailbox, P, NS, TAG.a)
    const current = await pendingContributed(w.mailbox, P, NS, TAG.b)
    await w.mailbox.retireContributor(NS, TAG.a)
    await assertRetired(w.mailbox, P, old)
    await assertUntouched(w.mailbox, P, current)
  })
  rule('4 (untagged)', 'a contributor event committed with no tag → left alone', async (w) => {
    const untagged = await pendingContributed(w.mailbox, P, NS, undefined)
    await w.mailbox.retireContributor(NS, TAG.a)
    await assertUntouched(w.mailbox, P, untagged)
  })
  rule('5 (non-contributed)', 'other event types of the pair → left alone', async (w) => {
    const message = await commitOk(w.mailbox, P, EVENT_TYPE.message)
    const offer = await commitOk(w.mailbox, P, EVENT_TYPE.permission)
    await pendingContributed(w.mailbox, P, NS, TAG.a)
    await w.mailbox.retireContributor(NS, TAG.a)
    const pending = ids(await pollAll(w.mailbox, P))
    assert.ok(pending.includes(message.eventId) && pending.includes(offer.eventId), 'a non-contributed event was retired')
  })
  rule('6 (every pair)', 'matching events in P\'s and Q\'s mailboxes → both retired, each retirement in its own pair\'s mailbox', async (w) => {
    const p = await pendingContributed(w.mailbox, P, NS, TAG.a)
    const q = await pendingContributed(w.mailbox, Q, NS, TAG.a)
    await w.mailbox.retireContributor(NS, TAG.a)
    await assertRetired(w.mailbox, P, p)
    await assertRetired(w.mailbox, Q, q)
    assert.deepEqual(await retirementsOf(w.mailbox, P, q.eventId), [], 'Q\'s retirement is in P\'s mailbox')
  })
  rule('7 (held)', 'a matching event in a held mailbox → retired too: after release it is gone and its retirement is pending', async (w) => {
    const e = await pendingContributed(w.mailbox, Q, NS, TAG.a)
    await w.mailbox.hold(Q, w.clock.now())
    await w.mailbox.retireContributor(NS, TAG.a)
    await w.mailbox.release(Q)
    await assertRetired(w.mailbox, Q, e)
  })
  rule('8 (repeat)', 'retireContributor twice → the second retires nothing new (one retirement per event)', async (w) => {
    const e = await pendingContributed(w.mailbox, P, NS, TAG.a)
    await w.mailbox.retireContributor(NS, TAG.a)
    const after = await snapshot(w.mailbox)
    await w.mailbox.retireContributor(NS, TAG.a)
    assert.deepEqual(await snapshot(w.mailbox), after, 'a repeat changed a mailbox')
    await assertRetired(w.mailbox, P, e)
  })
  rule('8 (already retired)', 'an event already retired by retire → no second retirement', async (w) => {
    const e = await pendingContributed(w.mailbox, P, NS, TAG.a)
    await w.mailbox.retire(P, e.eventId, RETIREMENT_REASON.contributorWithdrawn)
    await w.mailbox.retireContributor(NS, TAG.a)
    await assertRetired(w.mailbox, P, e)
  })
  rule('9 (no match)', 'a tag no event carries → nothing changes', async (w) => {
    await pendingContributed(w.mailbox, P, NS, TAG.a)
    await pendingContributed(w.mailbox, Q, NS, TAG.b)
    const before = await snapshot(w.mailbox)
    await w.mailbox.retireContributor(NS, TAG.unknown)
    assert.deepEqual(await snapshot(w.mailbox), before)
  })
  rule('10 (durable)', 'the tag is stored with the event: after a restart retireContributor still finds it', async (w) => {
    const e = await pendingContributed(w.mailbox, P, NS, TAG.a)
    await w.reopen()
    await w.mailbox.retireContributor(NS, TAG.a)
    await assertRetired(w.mailbox, P, e)
  })

  // Equivalence Partitioning of EventDraft.activationTag.
  rule('EP 1 (never polled)', 'a tagged contributor event as polled carries no activationTag', async (w) => {
    const e = await pendingContributed(w.mailbox, P, NS, TAG.a)
    assert.ok(!Object.hasOwn(e, 'activationTag'), `the polled event carries activationTag: ${JSON.stringify(e)}`)
    assert.ok(!JSON.stringify(await w.mailbox.poll(P, undefined, LIMIT)).includes(TAG.a), 'the tag reached a page')
  })
  rule('EP 2 (non-contributed)', 'an activationTag on a non-contributed draft → commit throws TypeError; nothing committed', async (w) => {
    const before = await snapshot(w.mailbox)
    const draft = { type: EVENT_TYPE.message, sourceSessionId: FIXTURE.s1, correlationId: null, payload: { text: FIXTURE.marker, images: [] }, activationTag: TAG.a }
    await assert.rejects(async () => w.mailbox.commit(P, draft), TypeError)
    assert.deepEqual(await snapshot(w.mailbox), before)
  })
  for (const bad of AMEND.badTags) {
    rule(`EP 3 (tag ${JSON.stringify(bad)})`, `a contributor draft whose activationTag is ${JSON.stringify(bad)} (not a non-empty string) → commit throws TypeError; nothing committed`, async (w) => {
      const before = await snapshot(w.mailbox)
      await assert.rejects(async () => w.mailbox.commit(P, contributed(NS, bad).draft), TypeError)
      assert.deepEqual(await snapshot(w.mailbox), before)
    })
  }
}

// ------------------------------------------------------------------------------------------------
// K1-AMEND-9: Mailbox.retire resolves {retired: boolean} (DECIDED #W3-1)

/** `retire` answered "nothing to replace": `{retired: false}`, both mailboxes as before, no hint sent. */
async function assertNothingRetired(w, act) {
  const before = await snapshot(w.mailbox)
  const hints = w.hints.calls.length
  assert.deepEqual(await act(), RETIRE_OUTCOME.nothing)
  assert.deepEqual(await snapshot(w.mailbox), before, 'a retire that replaced nothing changed a mailbox')
  assert.equal(w.hints.calls.length, hints, 'a retire that replaced nothing sent a hint')
}

function retireOutcomeCases(sdk) {
  const rule = (part, title, fn) => row(sdk, ID.retireOutcome, part, title, async (t) => fn(await worldFor(t, sdk)))
  const offer = EVENT_TYPE.permission
  const reason = RETIREMENT_REASON.withdrawn

  // Decision Table: the event's state in the named pair's mailbox × the answer. Rule 1 for every
  // K1 reason (Equivalence Partitioning of `reason`: the answer does not depend on it).
  for (const why of Object.values(RETIREMENT_REASON)) {
    rule(`1 (pending, ${why})`, `a pending event of the pair, reason ${why} → {retired: true}; it is replaced by one retirement {retiredEventId, reason: ${why}}`, async (w) => {
      const e = await pendingEvent(w.mailbox, P, offer)
      assert.deepEqual(await w.mailbox.retire(P, e.eventId, why), RETIRE_OUTCOME.replaced)
      const after = await pollAll(w.mailbox, P)
      assert.ok(!ids(after).includes(e.eventId), 'the retired event is still pending')
      const retirements = await retirementsOf(w.mailbox, P, e.eventId)
      assert.deepEqual(retirements.map((r) => r.payload), [{ retiredEventId: e.eventId, reason: why }])
    })
  }
  rule('2 (acked)', 'an acked event → {retired: false}; nothing committed, nothing changed; its receipt is still known', async (w) => {
    const e = await pendingEvent(w.mailbox, P, offer)
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(e)]), { ok: true, acked: 1 })
    await assertNothingRetired(w, () => w.mailbox.retire(P, e.eventId, reason))
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(e)]), { ok: true, acked: 0 })
  })
  rule('3 (already retired)', 'retire twice → the first {retired: true}, the second {retired: false}; one retirement names it', async (w) => {
    const e = await pendingEvent(w.mailbox, P, offer)
    assert.deepEqual(await w.mailbox.retire(P, e.eventId, reason), RETIRE_OUTCOME.replaced)
    await assertNothingRetired(w, () => w.mailbox.retire(P, e.eventId, reason))
    assert.equal((await retirementsOf(w.mailbox, P, e.eventId)).length, 1)
  })
  rule('3 (retired by retireContributor)', 'an event retireContributor already retired → retire answers {retired: false}', async (w) => {
    const e = await pendingContributed(w.mailbox, P, FIXTURE.namespace, TAG.a)
    await w.mailbox.retireContributor(FIXTURE.namespace, TAG.a)
    await assertNothingRetired(w, () => w.mailbox.retire(P, e.eventId, RETIREMENT_REASON.contributorWithdrawn))
    await assertRetired(w.mailbox, P, e)
  })
  rule('4 (unknown)', 'an event id no commit returned → {retired: false}; nothing changed', async (w) => {
    await commitOk(w.mailbox, P, offer)
    await assertNothingRetired(w, () => w.mailbox.retire(P, RETIRE_FIXTURE.unknownEventId, reason))
  })
  rule('5 (another pair\'s)', 'Q\'s pending event named under P → {retired: false}; Q\'s event stays pending, no retirement anywhere', async (w) => {
    const q = await pendingEvent(w.mailbox, Q, offer)
    await assertNothingRetired(w, () => w.mailbox.retire(P, q.eventId, reason))
    assert.ok(ids(await pollAll(w.mailbox, Q)).includes(q.eventId), 'Q\'s event left Q\'s mailbox')
    assert.deepEqual(await retirementsOf(w.mailbox, Q, q.eventId), [])
  })
  rule('6 (misuse)', 'a principal key that is no string → retire throws (as before); nothing changed', async (w) => {
    const e = await pendingEvent(w.mailbox, P, offer)
    const before = await snapshot(w.mailbox)
    await assert.rejects(async () => w.mailbox.retire(RETIRE_FIXTURE.badPrincipalKey, e.eventId, reason))
    assert.deepEqual(await snapshot(w.mailbox), before)
  })

  // State Transition: the answer follows the event's state, across a restart too.
  rule('ST 1 (Pending → ack → retire)', 'Pending → ack → Acked → retire → {retired: false} (the ack/retire race seen from the mailbox)', async (w) => {
    const e = await pendingEvent(w.mailbox, P, offer)
    await w.mailbox.ack(P, [receiptOf(e)])
    await assertNothingRetired(w, () => w.mailbox.retire(P, e.eventId, reason))
  })
  rule('ST 2 (Pending → retire → ack)', 'Pending → retire {retired: true} → Retired → ack of its receipt → a no-op success counting 0; a second retire → {retired: false}', async (w) => {
    const e = await pendingEvent(w.mailbox, P, offer)
    assert.deepEqual(await w.mailbox.retire(P, e.eventId, reason), RETIRE_OUTCOME.replaced)
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(e)]), { ok: true, acked: 0 })
    await assertNothingRetired(w, () => w.mailbox.retire(P, e.eventId, reason))
  })
  rule('ST 3 (restart)', 'a pending event survives a restart: retire after it → {retired: true}; an acked one after a restart → {retired: false}', async (w) => {
    const pendingOne = await pendingEvent(w.mailbox, P, offer)
    const ackedOne = await pendingEvent(w.mailbox, P, offer)
    await w.mailbox.ack(P, [receiptOf(ackedOne)])
    await w.reopen()
    assert.deepEqual(await w.mailbox.retire(P, pendingOne.eventId, reason), RETIRE_OUTCOME.replaced)
    await assertNothingRetired(w, () => w.mailbox.retire(P, ackedOne.eventId, reason))
  })
}

/** The K1-amendment cases on one SDK. */
export function registerMailboxAmendCases(sdk) {
  generationCases(sdk)
  retireContributorCases(sdk)
  retireOutcomeCases(sdk)
}
