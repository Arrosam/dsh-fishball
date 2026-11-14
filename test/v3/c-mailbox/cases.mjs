/**
 * C-MAILBOX black-box cases (v3-tasks.md row C-MAILBOX, wave W2; docs/test-design/v3/
 * 04-events-interception.md): EVT-UC-01, EVT-EP-02, EVT-EP-04 rows 1, 2, 5, 6 (rows 3 and 4 are
 * C-HTTP's), EVT-BVA-01, EVT-BVA-02, EVT-ST-01. Requirements R-CON-03, R-CON-04, R-EVS-01,
 * R-EVT-02, R-EVT-04, R-ID-06, R-TOK-05, R-CON-09, R-EXT-18, R-EXT-19; design §3.3, §3.4; the K1
 * freeze (`Mailbox`, `HintSink`, MAILBOX, QUEUE, REFUSAL and its K decisions).
 *
 * Techniques, each case keeps its own: Use Case first (EVT-UC-01, one test per flow), then
 * Equivalence Partitioning (EVT-EP-02, EVT-EP-04: one test per row), Boundary Value Analysis
 * (EVT-BVA-01, EVT-BVA-02: one test per boundary row) and State Transition (EVT-ST-01: one test
 * per transition row).
 *
 * Level: the module over real DSH storage of the SDK under test, with C-HTTP's `HintSink` faked
 * and an injected clock (subject.mjs). Every value comes from K1 (constants.mjs). Rows that need
 * a later task are `todo` and name it. The tests fail until C-MAILBOX's module exists.
 *
 * Oracles, all through the K1 interface: "a hint" = one `HintSink.resourceUpdated(pair, uri)` call;
 * "pending" = returned by `poll` and counted by `summary`; "refused" = the README's common oracle:
 * the K1 code, nothing changed in either pair's mailbox, nothing of the other pair leaked.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { validatorFor } from '../k1/schema-module.mjs'
import { caseName } from '../shared/cases.mjs'
import {
  CONTRIBUTED_TYPE_PREFIX, DECISION_KIND_OF, EVENT_TYPE, FIXTURE, LATER, MAILBOX, MAILBOX_EVENT_SCHEMA, MAILBOX_SUMMARY_SCHEMA,
  OFFER_ID, QUEUE, REFUSAL, RESOURCE, RETIREMENT_REASON, SETTLED_BY, SETTLEMENT_OUTCOME, WAIT, WIRE, formatOfferId, payloadSchemaOf,
} from './constants.mjs'
import { worldFor } from './subject.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({ uc01: 'EVT-UC-01', ep02: 'EVT-EP-02', ep04: 'EVT-EP-04', bva01: 'EVT-BVA-01', bva02: 'EVT-BVA-02', st01: 'EVT-ST-01' })
const { p: P, q: Q } = FIXTURE
const LIMIT = MAILBOX.pageMax
const MAX = QUEUE.maxQueuedInputs
const CONTRIBUTED = CONTRIBUTED_TYPE_PREFIX + FIXTURE.namespace + '.' + FIXTURE.contributedEvent

/** One test per case row, named as every V3 suite names them; `todo` names the owning task. */
function row(sdk, id, part, title, fn, todo) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, T, fn)
}

// ------------------------------------------------------------------------------------------------
// Drafts (K1 `EventDraft`) with payloads of each type's K1 shape. The marker is in every payload,
// so a summary or a refusal that carries a body is found by text.

let counter = 0
const descriptor = (type, marker, offerId) => ({
  approvalId: marker, offerId, kind: DECISION_KIND_OF[type], prompt: marker, choices: [], title: marker,
  at: FIXTURE.epochMs, toolName: marker, callId: null, reason: marker, quotes: [],
})
const PAYLOAD = Object.freeze({
  [EVENT_TYPE.permission]: descriptor,
  [EVENT_TYPE.ask]: descriptor,
  [EVENT_TYPE.message]: (_t, marker) => ({ text: marker, images: [] }),
  [EVENT_TYPE.handover]: (_t, marker) => ({ sessionId: FIXTURE.s1, note: FIXTURE.note + ' ' + marker }),
  [EVENT_TYPE.turnFinished]: () => ({ sessionId: FIXTURE.s1, running: false, queued: false }),
  [EVENT_TYPE.settlement]: (_t, marker) => ({ approvalId: marker, outcome: SETTLEMENT_OUTCOME.allowed, by: SETTLED_BY.user }),
  [CONTRIBUTED]: (_t, marker) => ({ namespace: FIXTURE.namespace, event: FIXTURE.contributedEvent, data: { marker }, summary: marker }),
})
/** A fresh draft of `type`; offers and `ask` carry an offer and its id as correlation id (R-EVT-02). */
function draft(type, { sourceSessionId = FIXTURE.s1 } = {}) {
  const marker = FIXTURE.marker + ++counter
  const offerId = DECISION_KIND_OF[type] === undefined ? undefined : formatOfferId(marker.toLowerCase().replace(/[^a-z0-9]/g, ''), OFFER_ID.firstRevision)
  const d = { type, sourceSessionId, correlationId: offerId ?? null, payload: PAYLOAD[type](type, marker, offerId) }
  if (offerId !== undefined) d.offer = { offerId, revision: OFFER_ID.firstRevision, decisionKind: DECISION_KIND_OF[type] }
  return { draft: d, marker }
}

// ------------------------------------------------------------------------------------------------
// Shared steps and observations (each states one oracle once).

/** Commits one fresh draft of `type` to `key`; asserts it was accepted and returns `{eventId, marker, draft}`. */
async function commitOk(mailbox, key, type, options) {
  const made = draft(type, options)
  const result = await mailbox.commit(key, made.draft)
  assert.equal(result?.ok, true, `commit of ${type} refused: ${JSON.stringify(result)}`)
  assert.equal(typeof result.eventId, 'string', 'commit returned no eventId')
  return { ...made, eventId: result.eventId }
}
/** `n` commits of `type` in order. */
async function commitMany(mailbox, key, n, type = EVENT_TYPE.message) {
  const out = []
  for (let i = 0; i < n; i += 1) out.push(await commitOk(mailbox, key, type))
  return out
}
/** One page; asserts a page (not a resync or refusal) came back. */
async function page(mailbox, key, cursor, limit) {
  const result = await mailbox.poll(key, cursor, limit)
  assert.equal(result?.ok, true, `poll refused: ${JSON.stringify(result)}`)
  assert.ok(Array.isArray(result.events), `poll returned no page: ${JSON.stringify(result)}`)
  return result
}
/** Every pending event of `key`, paging with the cursor at the largest page. */
async function pollAll(mailbox, key) {
  const events = []
  let cursor
  for (;;) {
    const result = await page(mailbox, key, cursor, LIMIT)
    events.push(...result.events)
    if (!result.hasMore) return events
    cursor = result.nextCursor
  }
}
const receiptOf = (event) => ({ eventId: event.eventId, payloadDigest: event.payloadDigest })
/** An event's identity (R-EVT-02: a replay has the same one). */
const identity = (e) => ({ eventId: e.eventId, mailboxGeneration: e.mailboxGeneration, sequence: e.sequence, type: e.type, payloadDigest: e.payloadDigest })
const ids = (events) => events.map((e) => e.eventId)

/** Both pairs' mailboxes as the interface shows them: summaries and every pending identity. */
async function snapshot(mailbox) {
  const out = {}
  for (const key of [P, Q]) out[key] = { summary: await mailbox.summary(key), events: (await pollAll(mailbox, key)).map(identity) }
  return out
}
/**
 * README's common refusal oracle: the K1 code, nothing changed (`before` is a snapshot taken just
 * before the refused call), and nothing of `other` (a principal key or marker) in the answer.
 */
async function assertRefused(mailbox, result, code, before, other = []) {
  assert.equal(result?.ok, false, `not refused: ${JSON.stringify(result)}`)
  assert.equal(result.code, code)
  assert.deepEqual(await snapshot(mailbox), before, 'a refusal changed a mailbox')
  const text = JSON.stringify(result)
  for (const secret of other) assert.ok(!text.includes(secret), `the refusal leaks ${secret}`)
}
/** The hints `key`'s listen streams got: each exactly `(key, fishball://events)`, nothing else. */
function hintsOf(world, key) {
  const calls = world.hints.for(key)
  for (const call of calls) assert.deepEqual(call, [key, RESOURCE.events.uri], 'a hint carries more than its pair and the events URI')
  return calls.length
}

// ------------------------------------------------------------------------------------------------

export function registerMailboxCases(sdk) {
  const validator = validatorFor(sdk)
  const assertSchema = async (schema, value, what) => assert.ok((await validator)(schema)(value), `${what} does not match its K1 schema: ${JSON.stringify(value)}`)

  // ---------------------------------------------------------------- EVT-UC-01 (Use Case) — first
  row(sdk, ID.uc01, 'main 1', 'P opens subscriptions/listen on fishball://events and gets the acknowledgement', null, LATER.http)

  row(sdk, ID.uc01, 'main 2', 'S1 asks a permission: the hint to P is sent by the time the commit resolves, and carries no event body', async (t) => {
    const w = await worldFor(t, sdk)
    const e = await commitOk(w.mailbox, P, EVENT_TYPE.permission)
    assert.equal(hintsOf(w, P), 1, 'one hint per commit to P (R-EVT-04: within the same dispatch as the commit)')
    assert.ok(!JSON.stringify(w.hints.calls).includes(e.marker), 'the hint carries the event body')
  })

  row(sdk, ID.uc01, 'main 3', 'P polls: one typed event with eventId, source session S1, correlation id = offer id and a bounded payload', async (t) => {
    const w = await worldFor(t, sdk)
    const e = await commitOk(w.mailbox, P, EVENT_TYPE.permission)
    const { events } = await page(w.mailbox, P)
    assert.equal(events.length, 1)
    const [got] = events
    await assertSchema(MAILBOX_EVENT_SCHEMA, got, 'the polled event')
    await assertSchema(payloadSchemaOf(got.type), got.payload, 'its payload')
    assert.equal(got.eventId, e.eventId)
    assert.equal(got.type, EVENT_TYPE.permission)
    assert.equal(got.sourceSessionId, FIXTURE.s1)
    assert.equal(got.correlationId, e.draft.offer.offerId)
    assert.deepEqual(got.offer, e.draft.offer)
    assert.deepEqual(got.payload, e.draft.payload)
    assert.match(got.payloadDigest, WIRE.digestPattern)
  })

  row(sdk, ID.uc01, 'main 4', 'P acks with the receipt; a later poll does not return the event', async (t) => {
    const w = await worldFor(t, sdk)
    await commitOk(w.mailbox, P, EVENT_TYPE.permission)
    const [got] = (await page(w.mailbox, P)).events
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(got)]), { ok: true, acked: 1 })
    assert.deepEqual((await page(w.mailbox, P)).events, [])
  })

  row(sdk, ID.uc01, 'A1', 'P never subscribes: the same event is on its next poll', async (t) => {
    const w = await worldFor(t, sdk)
    const e = await commitOk(w.mailbox, P, EVENT_TYPE.message)
    assert.deepEqual(ids((await page(w.mailbox, P)).events), [e.eventId])
  })

  row(sdk, ID.uc01, 'A2', 'the hint is lost and the connector restarts: P re-listens, polls once and gets the event', async (t) => {
    const w = await worldFor(t, sdk)
    const e = await commitOk(w.mailbox, P, EVENT_TYPE.message)
    w.hints.calls.length = 0 // the stream dropped: the hint never arrived
    await w.reopen()
    assert.deepEqual(ids((await page(w.mailbox, P)).events), [e.eventId], 'a lost hint lost the event')
  })

  row(sdk, ID.uc01, 'A3', 'P polls without acking: the event is returned again with the same identity, across a restart too', async (t) => {
    const w = await worldFor(t, sdk)
    await commitOk(w.mailbox, P, EVENT_TYPE.permission)
    const [first] = (await page(w.mailbox, P)).events
    const [again] = (await page(w.mailbox, P)).events
    assert.deepEqual(identity(again), identity(first))
    await w.reopen()
    const [replayed] = (await page(w.mailbox, P)).events
    assert.deepEqual(identity(replayed), identity(first))
    assert.deepEqual(replayed.payload, first.payload)
  })

  row(sdk, ID.uc01, 'E1', 'P polls with a cursor of another pair: forbidden', async (t) => {
    const w = await worldFor(t, sdk)
    const qEvent = await commitOk(w.mailbox, Q, EVENT_TYPE.message)
    await commitOk(w.mailbox, P, EVENT_TYPE.message)
    const qCursor = (await page(w.mailbox, Q)).nextCursor
    const before = await snapshot(w.mailbox)
    await assertRefused(w.mailbox, await w.mailbox.poll(P, qCursor, LIMIT), REFUSAL.forbidden, before, [Q, qEvent.marker])
  })

  row(sdk, ID.uc01, 'E2', 'P polls with a stale cursor (older mailbox generation): explicit resync, never a silent skip', null, LATER.generation)
  row(sdk, ID.uc01, 'E3', 'resources/read or subscribe on any other event URI: not found; no per-kind stream', null, LATER.httpUri)

  row(sdk, ID.uc01, 'post', 'P received all its events in order, each typed, unchanged (no interception for an external agent)', async (t) => {
    const w = await worldFor(t, sdk)
    const types = [EVENT_TYPE.permission, EVENT_TYPE.message, EVENT_TYPE.handover, EVENT_TYPE.turnFinished, CONTRIBUTED, EVENT_TYPE.ask]
    const committed = []
    for (const type of types) committed.push(await commitOk(w.mailbox, P, type))
    const events = await pollAll(w.mailbox, P)
    assert.deepEqual(ids(events), ids(committed))
    assert.deepEqual(events.map((e) => e.type), types)
    assert.deepEqual(events.map((e) => e.payload), committed.map((c) => c.draft.payload))
  })

  // ---------------------------------------------------------------- EVT-EP-02 (Equivalence Partitioning)
  row(sdk, ID.ep02, 1, 'the pair itself: poll, ack and the summary serve its own mailbox', async (t) => {
    const w = await worldFor(t, sdk)
    const [a, b] = await commitMany(w.mailbox, P, 2)
    const events = await pollAll(w.mailbox, P)
    assert.deepEqual(ids(events), [a.eventId, b.eventId])
    assert.equal((await w.mailbox.summary(P)).pending, 2)
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(events[0])]), { ok: true, acked: 1 })
    assert.deepEqual(ids(await pollAll(w.mailbox, P)), [b.eventId])
    assert.equal((await w.mailbox.summary(P)).pending, 1)
  })

  row(sdk, ID.ep02, 2, 'pair B reads fishball://events: B\'s mailbox only, never A\'s events', async (t) => {
    const w = await worldFor(t, sdk)
    const aEvents = await commitMany(w.mailbox, P, 2)
    const qEvent = await commitOk(w.mailbox, Q, EVENT_TYPE.message)
    assert.equal((await w.mailbox.summary(Q)).pending, 1)
    const qSeen = await pollAll(w.mailbox, Q)
    assert.deepEqual(ids(qSeen), [qEvent.eventId])
    const text = JSON.stringify([qSeen, await w.mailbox.summary(Q)])
    for (const a of aEvents) assert.ok(!text.includes(a.eventId) && !text.includes(a.marker), 'B sees A\'s event')
  })

  row(sdk, ID.ep02, 3, 'a pair-only access token: HTTP 403 insufficient_scope', null, LATER.http)

  row(sdk, ID.ep02, 4, 'an ack naming another pair\'s eventId is unknown-event and acks nothing, not even the own receipt beside it', async (t) => {
    const w = await worldFor(t, sdk)
    await commitOk(w.mailbox, P, EVENT_TYPE.message)
    const qEvent = await commitOk(w.mailbox, Q, EVENT_TYPE.message)
    const [own] = (await page(w.mailbox, P)).events
    const [foreign] = (await page(w.mailbox, Q)).events
    const before = await snapshot(w.mailbox)
    // All or nothing (DECIDED #61); the code never says "another pair's" (DECIDED #5).
    await assertRefused(w.mailbox, await w.mailbox.ack(P, [receiptOf(own), receiptOf(foreign)]), REFUSAL.unknownEvent, before, [Q, qEvent.marker])
  })

  row(sdk, ID.ep02, 5, 'an ack with a wrong payloadDigest is digest-mismatch and acks nothing', async (t) => {
    const w = await worldFor(t, sdk)
    await commitMany(w.mailbox, P, 2)
    const [first, second] = (await page(w.mailbox, P)).events
    assert.notEqual(second.payloadDigest, FIXTURE.wrongDigest, 'fixture: the wrong digest is the event\'s own')
    const before = await snapshot(w.mailbox)
    await assertRefused(w.mailbox, await w.mailbox.ack(P, [receiptOf(first), { eventId: second.eventId, payloadDigest: FIXTURE.wrongDigest }]), REFUSAL.digestMismatch, before, [Q])
  })

  row(sdk, ID.ep02, 6, 'the fishball://events contents: {pending, headSequence, mailboxGeneration} only, never bodies', async (t) => {
    const w = await worldFor(t, sdk)
    const committed = [await commitOk(w.mailbox, P, EVENT_TYPE.permission), await commitOk(w.mailbox, P, EVENT_TYPE.message)]
    const summary = await w.mailbox.summary(P)
    await assertSchema(MAILBOX_SUMMARY_SCHEMA, summary, 'the summary')
    assert.equal(summary.pending, 2)
    const [, last] = await pollAll(w.mailbox, P)
    assert.equal(summary.headSequence, last.sequence)
    assert.equal(summary.mailboxGeneration, last.mailboxGeneration)
    const text = JSON.stringify(summary)
    for (const c of committed) assert.ok(!text.includes(c.marker) && !text.includes(c.eventId), 'the summary carries an event')
  })

  row(sdk, ID.ep02, 7, 'answering an offer of another pair: forbidden', null, LATER.tools)
  row(sdk, ID.ep02, 8, 'an ack confers no answer authority: answering after the offer\'s revocation is refused', null, LATER.tools)

  // ---------------------------------------------------------------- EVT-EP-04 rows 1, 2, 5, 6 (Equivalence Partitioning)
  // Rows 3 (ids that differ only in case) and 4 (a disabled entry closes only its streams) are C-HTTP's.
  for (const [n, to, other] of [[1, P, Q], [2, Q, P]]) {
    row(sdk, ID.ep04, n, `an event committed to ${to === P ? 'P' : 'Q'}'s mailbox: one hint on its streams, nothing on the other pair's`, async (t) => {
      const w = await worldFor(t, sdk)
      await commitOk(w.mailbox, to, EVENT_TYPE.message)
      assert.equal(hintsOf(w, to), 1)
      assert.equal(hintsOf(w, other), 0)
      assert.equal(w.hints.calls.length, 1, 'a hint went to a third principal')
    })
  }

  row(sdk, ID.ep04, 5, 'Q polls after an event to P: Q\'s mailbox has nothing of P\'s', async (t) => {
    const w = await worldFor(t, sdk)
    const e = await commitOk(w.mailbox, P, EVENT_TYPE.message)
    const qPage = await page(w.mailbox, Q)
    assert.deepEqual(qPage.events, [])
    assert.ok(!JSON.stringify(qPage).includes(e.eventId), 'Q\'s page names P\'s event')
    assert.equal((await w.mailbox.summary(Q)).pending, 0)
  })

  row(sdk, ID.ep04, 6, `${FIXTURE.burst} events to P in a burst: at least one hint, never more than one per commit, none to Q; none lost`, async (t) => {
    const w = await worldFor(t, sdk)
    const results = await Promise.all(Array.from({ length: FIXTURE.burst }, () => w.mailbox.commit(P, draft(EVENT_TYPE.message).draft)))
    assert.ok(results.every((r) => r?.ok === true), `a burst commit was refused: ${JSON.stringify(results.find((r) => r?.ok !== true))}`)
    const hints = hintsOf(w, P)
    assert.ok(hints >= 1 && hints <= FIXTURE.burst, `P got ${hints} hints for ${FIXTURE.burst} commits`)
    assert.equal(hintsOf(w, Q), 0)
    assert.deepEqual(new Set(ids(await pollAll(w.mailbox, P))), new Set(results.map((r) => r.eventId)))
  })

  // ---------------------------------------------------------------- EVT-BVA-01 (Boundary Value Analysis)
  // LIMIT = MAILBOX.pageMax; `limit` undefined = inbox_poll without limit (subject.mjs).
  row(sdk, ID.bva01, 1, '0 pending, default limit: events [], hasMore false', async (t) => {
    const w = await worldFor(t, sdk)
    const result = await page(w.mailbox, P)
    assert.deepEqual(result.events, [])
    assert.equal(result.hasMore, false)
  })

  row(sdk, ID.bva01, 2, '1 pending, default limit: 1 event', async (t) => {
    const w = await worldFor(t, sdk)
    const e = await commitOk(w.mailbox, P, EVENT_TYPE.message)
    const result = await page(w.mailbox, P)
    assert.deepEqual(ids(result.events), [e.eventId])
    assert.equal(result.hasMore, false)
  })

  row(sdk, ID.bva01, 3, `LIMIT (${LIMIT}) pending, limit LIMIT: LIMIT events, hasMore false`, async (t) => {
    const w = await worldFor(t, sdk)
    const committed = await commitMany(w.mailbox, P, LIMIT)
    const result = await page(w.mailbox, P, undefined, LIMIT)
    assert.deepEqual(ids(result.events), ids(committed))
    assert.equal(result.hasMore, false)
  })

  row(sdk, ID.bva01, 4, `LIMIT + 1 pending, limit LIMIT: LIMIT events, hasMore true; the next page gives 1`, async (t) => {
    const w = await worldFor(t, sdk)
    const committed = await commitMany(w.mailbox, P, LIMIT + 1)
    const first = await page(w.mailbox, P, undefined, LIMIT)
    assert.deepEqual(ids(first.events), ids(committed.slice(0, LIMIT)))
    assert.equal(first.hasMore, true)
    const next = await page(w.mailbox, P, first.nextCursor, LIMIT)
    assert.deepEqual(ids(next.events), [committed[LIMIT].eventId])
    assert.equal(next.hasMore, false)
  })

  // K decision (K1 README, EVT-BVA-01 rows 5–6): 1–pageMax, otherwise limit-exceeded, never clamped.
  for (const [n, limit] of [[5, 0], [6, LIMIT + 1]]) {
    row(sdk, ID.bva01, n, `limit ${limit}: refused limit-exceeded, never clamped`, async (t) => {
      const w = await worldFor(t, sdk)
      await commitMany(w.mailbox, P, 2)
      const before = await snapshot(w.mailbox)
      await assertRefused(w.mailbox, await w.mailbox.poll(P, undefined, limit), REFUSAL.limitExceeded, before, [Q])
    })
  }

  row(sdk, ID.bva01, 7, 'ordering: e1, e2, e3 committed are returned e1, e2, e3 with sequences one apart', async (t) => {
    const w = await worldFor(t, sdk)
    const committed = await commitMany(w.mailbox, P, 3)
    const { events } = await page(w.mailbox, P)
    assert.deepEqual(ids(events), ids(committed))
    assert.deepEqual(events.map((e) => e.sequence - events[0].sequence), [0, 1, 2], 'sequence grows by one per commit (K1 mailboxEvent)')
  })

  // ---------------------------------------------------------------- EVT-BVA-02 (Boundary Value Analysis)
  // max = QUEUE.maxQueuedInputs, the setting's default (the mailbox is opened without one).
  row(sdk, ID.bva02, 1, `max − 1 (${MAX - 1}) queued automated events, then a message: queued`, async (t) => {
    const w = await worldFor(t, sdk)
    await commitMany(w.mailbox, P, MAX - 1)
    const e = await commitOk(w.mailbox, P, EVENT_TYPE.message)
    assert.equal((await w.mailbox.summary(P)).pending, MAX)
    assert.ok(ids(await pollAll(w.mailbox, P)).includes(e.eventId))
  })

  row(sdk, ID.bva02, 2, `max (${MAX}) queued, then a message: queue-full to the caller, nothing queued, no hint`, async (t) => {
    const w = await worldFor(t, sdk)
    await commitMany(w.mailbox, P, MAX)
    const hints = hintsOf(w, P)
    const before = await snapshot(w.mailbox)
    const refused = draft(EVENT_TYPE.message)
    await assertRefused(w.mailbox, await w.mailbox.commit(P, refused.draft), REFUSAL.queueFull, before, [Q, refused.marker])
    assert.equal(hintsOf(w, P), hints, 'a refused commit sent a hint')
  })

  row(sdk, ID.bva02, 3, `max queued, then a handover with the user's note: queued anyway (D§3.4)`, async (t) => {
    const w = await worldFor(t, sdk)
    await commitMany(w.mailbox, P, MAX)
    const e = await commitOk(w.mailbox, P, EVENT_TYPE.handover)
    assert.equal((await w.mailbox.summary(P)).pending, MAX + 1)
    assert.ok(ids(await pollAll(w.mailbox, P)).includes(e.eventId))
  })

  row(sdk, ID.bva02, 4, 'max queued, one acked, then a message: queued', async (t) => {
    const w = await worldFor(t, sdk)
    await commitMany(w.mailbox, P, MAX)
    const [oldest] = (await page(w.mailbox, P, undefined, 1)).events
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(oldest)]), { ok: true, acked: 1 })
    const e = await commitOk(w.mailbox, P, EVENT_TYPE.message)
    assert.equal((await w.mailbox.summary(P)).pending, MAX)
    assert.ok(ids(await pollAll(w.mailbox, P)).includes(e.eventId))
  })

  // ---------------------------------------------------------------- EVT-ST-01 (State Transition)
  /** Commits `type` to P and returns it as polled (Pending). */
  async function pending(w, type) {
    const e = await commitOk(w.mailbox, P, type)
    const got = (await pollAll(w.mailbox, P)).find((x) => x.eventId === e.eventId)
    assert.ok(got, 'the committed event is not pending')
    return got
  }
  /** The `retirement` naming `eventId` among P's pending events, if any. */
  const retirementOf = async (w, eventId) => (await pollAll(w.mailbox, P)).filter((e) => e.type === EVENT_TYPE.retirement && e.payload?.retiredEventId === eventId)
  /** Holds, restarts and releases P; returns P's pending identities after the release. */
  async function holdRestartRelease(w) {
    await w.mailbox.hold(P, w.clock.now())
    await w.reopen()
    await w.mailbox.release(P)
    return (await pollAll(w.mailbox, P)).map(identity)
  }

  row(sdk, ID.st01, 1, '(none) → commit → Pending: pollable, counted, one hint to the pair', async (t) => {
    const w = await worldFor(t, sdk)
    const got = await pending(w, EVENT_TYPE.message)
    const summary = await w.mailbox.summary(P)
    assert.equal(summary.pending, 1)
    assert.equal(summary.headSequence, got.sequence)
    assert.equal(hintsOf(w, P), 1)
  })

  row(sdk, ID.st01, 2, 'Pending → poll → Pending with the same identity', async (t) => {
    const w = await worldFor(t, sdk)
    const got = await pending(w, EVENT_TYPE.message)
    assert.deepEqual((await pollAll(w.mailbox, P)).map(identity), [identity(got)])
    assert.equal((await w.mailbox.summary(P)).pending, 1)
  })

  row(sdk, ID.st01, 3, 'Pending → ack with the correct digest → Acked: no longer pending', async (t) => {
    const w = await worldFor(t, sdk)
    const got = await pending(w, EVENT_TYPE.message)
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(got)]), { ok: true, acked: 1 })
    assert.deepEqual(await pollAll(w.mailbox, P), [])
    assert.equal((await w.mailbox.summary(P)).pending, 0)
  })

  row(sdk, ID.st01, 4, 'Pending (contributed type) → contributor withdrawn → Retired: replaced by a retirement naming it', async (t) => {
    const w = await worldFor(t, sdk)
    const got = await pending(w, CONTRIBUTED)
    await w.mailbox.retire(P, got.eventId, RETIREMENT_REASON.contributorWithdrawn)
    const after = await pollAll(w.mailbox, P)
    assert.ok(!ids(after).includes(got.eventId), 'the withdrawn contributor\'s event is still pending')
    const retirements = await retirementOf(w, got.eventId)
    assert.equal(retirements.length, 1)
    assert.deepEqual(retirements[0].payload, { retiredEventId: got.eventId, reason: RETIREMENT_REASON.contributorWithdrawn })
  })

  row(sdk, ID.st01, 5, 'Pending (offer type) → settled by the user → the offer event stays pending; the settlement follows it', async (t) => {
    const w = await worldFor(t, sdk)
    const offer = await pending(w, EVENT_TYPE.permission)
    const settlement = await commitOk(w.mailbox, P, EVENT_TYPE.settlement)
    const after = await pollAll(w.mailbox, P)
    assert.deepEqual(ids(after), [offer.eventId, settlement.eventId], 'K1: a settled offer\'s event is not retired')
    assert.deepEqual(identity(after[0]), identity(offer))
  })

  row(sdk, ID.st01, 6, 'Pending (non-offer, ask included) → principal disabled → Held: kept across a restart, same identities', async (t) => {
    const w = await worldFor(t, sdk)
    const message = await pending(w, EVENT_TYPE.message)
    const ask = await pending(w, EVENT_TYPE.ask)
    await w.mailbox.hold(P, w.clock.now())
    // K1 Mailbox.hold: "held, not pollable". The answer's shape is not frozen; no held event may be in it.
    const whileHeld = JSON.stringify(await w.mailbox.poll(P, undefined, LIMIT))
    for (const e of [message, ask]) assert.ok(!whileHeld.includes(e.eventId), 'a held event was returned by poll')
    await w.mailbox.release(P)
    assert.deepEqual(await holdRestartRelease(w), [identity(message), identity(ask)])
  })

  row(sdk, ID.st01, '6a', 'Pending (offer type) → principal disabled → Retired: the offer\'s event is replaced and does not come back', async (t) => {
    const w = await worldFor(t, sdk)
    const offer = await pending(w, EVENT_TYPE.permission)
    // The mailbox half of 6a; C-REVOKE's withdrawal to the user is the trigger (todo below).
    await w.mailbox.retire(P, offer.eventId, RETIREMENT_REASON.revoked)
    const after = await holdRestartRelease(w)
    assert.ok(!after.some((e) => e.eventId === offer.eventId), 'the revoked offer\'s event came back')
    const retirements = await retirementOf(w, offer.eventId)
    assert.equal(retirements.length, 1)
    assert.equal(retirements[0].payload.reason, RETIREMENT_REASON.revoked)
  })
  row(sdk, ID.st01, '6a trigger', 'disabling the principal withdraws its live offers to the user', null, LATER.revokeOffers)

  for (const [part, held] of [['6b Pending', false], ['6b Held', true]]) {
    row(sdk, ID.st01, part, `${held ? 'Held' : 'Pending'} → principal deleted → Dropped; the dropped asks are returned, so their askers get unavailable`, async (t) => {
      const w = await worldFor(t, sdk)
      await pending(w, EVENT_TYPE.message)
      const ask = await pending(w, EVENT_TYPE.ask)
      const qEvent = await commitOk(w.mailbox, Q, EVENT_TYPE.message)
      if (held) await w.mailbox.hold(P, w.clock.now())
      const result = await w.mailbox.drop(P)
      assert.deepEqual([...result.droppedAsks], [ask.correlationId])
      // After a delete the pair is gone; its summary is the one read K1 defines for any key.
      assert.equal((await w.mailbox.summary(P)).pending, 0)
      if (!held) assert.deepEqual(await pollAll(w.mailbox, P), [])
      assert.deepEqual(ids(await pollAll(w.mailbox, Q)), [qEvent.eventId], 'dropping P touched Q\'s mailbox')
    })
  }

  row(sdk, ID.st01, '6c', 'Held → 30 days pass → Dropped (as 6b)', null, LATER.revokeExpiry)

  row(sdk, ID.st01, 7, 'Held → entry re-enabled → Pending with the same identities', async (t) => {
    const w = await worldFor(t, sdk)
    const got = await pending(w, EVENT_TYPE.message)
    await w.mailbox.hold(P, w.clock.now())
    await w.mailbox.release(P)
    assert.deepEqual((await pollAll(w.mailbox, P)).map(identity), [identity(got)])
    assert.equal((await w.mailbox.summary(P)).pending, 1)
  })

  row(sdk, ID.st01, 8, 'Acked → ack again → Acked: a no-op success, counted as 0', async (t) => {
    const w = await worldFor(t, sdk)
    const got = await pending(w, EVENT_TYPE.message)
    await w.mailbox.ack(P, [receiptOf(got)])
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(got)]), { ok: true, acked: 0 })
    assert.deepEqual(await pollAll(w.mailbox, P), [])
  })

  row(sdk, ID.st01, 9, 'Acked → contributor withdrawn → Acked: it stays with the client, no retirement follows', async (t) => {
    const w = await worldFor(t, sdk)
    const got = await pending(w, CONTRIBUTED)
    await w.mailbox.ack(P, [receiptOf(got)])
    // K1 states `retire` for pending events only; what it answers for an acked one is not frozen,
    // so only the resulting state is checked (R-EXT-19: acked events stay with the client).
    await w.mailbox.retire(P, got.eventId, RETIREMENT_REASON.contributorWithdrawn).catch(() => undefined)
    assert.deepEqual(await pollAll(w.mailbox, P), [], 'a retirement replaced an acked event')
    assert.deepEqual(await w.mailbox.ack(P, [receiptOf(got)]), { ok: true, acked: 0 }, 'the acked receipt is no longer known')
  })
}
