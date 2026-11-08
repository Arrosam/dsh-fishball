/**
 * The connector's limits take effect live, read at their next use (DESIGN §16 "Today's constants", "Revision 11's new
 * limits"; contract §0, §8, §9; slim conn-OQ-20), on the H-STUB harness. The connector form keeps the 15 fields its own
 * code reads (state.limits; support/constants.mjs LIMITS, LIMITS_R11, LIMITS_R11B, as test/config.test.mjs checks), and
 * an instance has no operation that reads them (contract §0), so each one is shown where the connector applies it: in a
 * contract reply or frame, in a managed session's own tool result, or in the connector's store. Each case goes default
 * → changed → default through DSH's settings service (state transitions, no restart). One host with the scripted
 * answerer after the connector's broker; the cases run in order, each with its own sessions.
 *
 * | id     | technique | requirement | expected |
 * |--------|-----------|-------------|----------|
 * | L50    | ST (readSessionMessages 12 → 3 → 1 → 12) | §16, conn-OQ-20, contract §4.1 session.read | a 20-message session read with maxMessages 100: at most 12, then 3 (the newest answer kept), then 1, then 12 again; `truncated` when cut; a smaller maxMessages (5) is honoured |
 * | L51    | ST (readSessionBytes 12288 → 2000 → 12288) | §16, contract §4.1 | about 13 KB of text read with maxBytes 1000000: at most 12288 and more than 2000, then at most 2000, then the default excerpt again |
 * | L52    | ST (watchesShown 50 → 2 → 50) | §16 ("list_watches"), contract §4.1 session.watches | all watches, then at most 2 with an active one among them, then all again |
 * | L55    | ST (forwardExcerptBytes 3072 → 100 → 3072) | §16, slim §8.3 | a Hand over with a note of a session whose answer is 500 bytes: last_answer cut to ≤ 100 bytes (a prefix), then whole |
 * | L56    | ST (requestUserMessageBytes 2048 → 100 → 2048) | §16, contract §4.5 approval item | latest_user_message of a 300-byte message in the approval item: ≤ 100 bytes (a prefix), then whole |
 * | L57    | ST (rationaleChars 500 → 10 → 500) | §16 (audit), contract §5.1 | the stored audit rationale of a 60-character reason: ≤ 10 characters (a prefix), then whole (the descriptor's own `reason` at 10: diagnostic) |
 * | L60    | BVA/ST (maxMessageBytes 65536 → 100 → 65536) | §16, §5b | message_fishball of 100 bytes ok, 101 bytes too-large; back at the default 101 bytes ok |
 * | L61    | ST (maxActiveWatches 50 → active+1 → 50) | §16, contract §6 WATCH_ERROR | one more watch is accepted, the next is watchError limit-reached; back at the default it is accepted |
 * | L62    | ST (maxPendingApprovals 8 → 1 → 8) | §16, §7a | with one request offered, a second session's request goes to its stock prompt at once and is not offered; back at the default it is offered |
 * | L63    | ST (approvalAnswerSeconds 120 → 2 → 120) | §16, contract §5.1 expiresAt | the offer's expiresAt − at is 2000 ms and the unanswered request reaches the stock prompt after about 2 s; back at the default 120000 ms |
 * | L64    | ST (argumentExcerptBytes 8192 → 10 → 8192) | §16, contract §5.1 | the descriptor's arguments are cut to ≤ 10 bytes with argumentsStatus truncated and allow is refused arguments-incomplete; back at the default the arguments are complete and whole |
 * | L65    | ST (auditEntriesKept 500 → 1 → 500) | §16 (audit lists) | after one more decision at 1, one audit record is kept; back at the default the next decision is kept beside it |
 * | L66    | BVA/ST (maxQueuedInputs 200 → 1 → 200, no instance) | §16, contract §9 | at 1 the first message_fishball is queued, the second refused queue-full; back at 200 the next is queued; after the attach both queued items arrive |
 * | L67    | ST (userMessagesListed 20 → 2 → 20, userMessageExcerptChars 1000 → 5 → 1000) | §16, §7a.2 | list_user_messages returns every message (≤ 20), then the 2 newest with excerpts of ≤ 5 characters (prefixes), then all whole again |
 * | L59    | ST (no restart) | §16 "applied without a restart" | the instance stayed attached through every change: the same attachment, never closed by the connector, attachCount unchanged, status live |
 *
 * Retired:
 * - L53 (intakeRowsShown), L54 (outboxShown), L58 (approvalsShown): the field is removed from the connector form with no reader left (slim conn-OQ-20).
 * - L59 (Fishball is the same agent, never disposed): Fishball's own model requests and agent no longer exist in the main DSH (slim §12); L59 now checks the attached instance instead.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ARGUMENTS_STATUS, DECISION, ERROR, EVENT, RISK, WATCH_ERROR, WATCH_MODE, WATCH_STATUS } from 'fishball-connector/contract'
import { ASK_REASON, ELLIPSIS, LIMITS, LIMITS_R11, LIMITS_R11B, LIST_USER_MESSAGES, OUTCOME, P5_CODE } from './support/constants.mjs'
import { HOOK, T, askSettled, auditOf, approvalAudit, bytes, settledIdle, stockSeen, turn, untrustedBlock } from './support/expect.mjs'
import { KIND, OPERATION, STUB, handOver, messageFishball, quietPushes, sessionCall, stopStub, userSession } from './support/instance-stub.mjs'
import {
  MANAGED_STUB, answerOffer, askFrom, bootManaged, detachStub, handOverWithNote, offerOf, reattach, scoped, setLimit,
} from './support/instance-stub-managed.mjs'
import { until } from './support/util.mjs'

/** The defaults of the 15 fields (DESIGN §16). */
const D = Object.fromEntries(Object.entries({ ...LIMITS, ...LIMITS_R11, ...LIMITS_R11B }).map(([k, v]) => [k, v.default]))
/** The changed values each case sets (small enough to cut what the case produces). */
const SET = Object.freeze({
  readMessages: [3, 1], readBytes: 2000, watchesShown: 2, forwardBytes: 100, userMessageBytes: 100, rationaleChars: 10,
  messageBytes: 100, pending: 1, answerSeconds: 2, argumentBytes: 10, auditKept: 1, queued: 1, listed: 2, excerptChars: 5,
})
/** What the cases produce: turns of a long session, a long answer, a long message, a reason, extra watches. */
const MAKE = Object.freeze({ turns: 8, answerPad: 1500, forwardAnswerBytes: 500, userMessageBytes: 300, reason: 'R' + 'r'.repeat(58) + 'Z', watches: 4, userMessages: 3 })
/** session.read asks for far more than any limit, so the connector's limit is what cuts the reply. */
const READ_ALL = Object.freeze({ maxMessages: 100, maxBytes: 1000000, fewer: 5 })
const MS_PER_S = 1000
/** approvalAnswerSeconds' wait: the stock prompt comes after the deadline, give or take this. */
const DEADLINE_SLACK_MS = 1500
/** `at` and `expiresAt` are stamped by two clock reads, which may lie a millisecond or two apart. */
const STAMP_SKEW_MS = 5
/** The offer's lifetime equals the setting, within the stamp skew. */
const assertLifetime = (offer, seconds) => assert.ok(Math.abs(offer.expiresAt - offer.at - seconds * MS_PER_S) <= STAMP_SKEW_MS, 'expiresAt − at = ' + (offer.expiresAt - offer.at) + ' ms for ' + seconds + ' s')
const LONG = { timeout: 120000 }
/** A cut value without its trailing ellipsis, for the prefix check. */
const bare = (s) => (s.endsWith(ELLIPSIS) ? s.slice(0, -ELLIPSIS.length) : s)
let seq = 0
const tok = (label) => 'LIM' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)

describe('the connector limits apply live (H-STUB)', () => {
  let booted
  let host
  let stub
  let attachCount

  /** A managed session (handed over), after one plain turn. */
  async function managed(folder) {
    const sid = await userSession(host, folder)
    const r = await handOver(host, sid)
    assert.equal(r.status, 200, r.text)
    return sid
  }
  /** Run body with the patch applied, then restore the defaults of the patched fields. */
  async function withLimit(patch, body) {
    await setLimit(host, patch)
    try { return await body() } finally { await setLimit(host, Object.fromEntries(Object.keys(patch).map((k) => [k, D[k]]))) }
  }
  const read = async (sid, maxMessages = READ_ALL.maxMessages) => {
    const r = await scoped(stub, OPERATION.sessionRead, { sessionId: sid, maxMessages, maxBytes: READ_ALL.maxBytes })
    assert.equal(r.type, 'response', JSON.stringify(r).slice(0, 300))
    return r.payload
  }
  const textBytes = (msgs) => msgs.reduce((n, m) => n + bytes(m.text), 0)
  const watches = async () => (await stub.op(OPERATION.sessionWatches, {})).payload.watches
  const watch = (sid) => scoped(stub, OPERATION.sessionWatch, { sessionId: sid, mode: WATCH_MODE.once })
  const unwatch = (watchId) => stub.op(OPERATION.sessionUnwatch, { watchId })
  /** Reject an offer so its session is free again. */
  const reject = (sid, offer) => answerOffer(booted, sid, offer, { decision: DECISION.reject, risk: RISK.high, reason: MANAGED_STUB.rejectReason })
  /** One request from sid that the instance answers as given; returns the offer. */
  async function decided(sid, answer, turnText) {
    const text = await askFrom(host, sid, turnText)
    const offer = await offerOf(booted, text)
    await answerOffer(booted, sid, offer, answer)
    await askSettled(host, text)
    await settledIdle(host, sid)
    return { ...offer, askedText: text }
  }

  before(async () => {
    booted = await bootManaged('limits-live')
    ;({ host, stub } = booted)
    attachCount = (await host.state()).instance.attachCount
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  describe('session.read', () => {
    let sid
    before(async () => {
      sid = await managed('l50')
      for (let i = 0; i < MAKE.turns; i++) await turn(host, sid, [[{ text: tok('ans' + i) + 'z'.repeat(MAKE.answerPad) }]], 'user turn ' + i)
    }, HOOK)

    it('L50 readSessionMessages: at most 12 by default, then 3, then 1, then 12 again', LONG, async () => {
      const all = await read(sid)
      assert.ok(all.messages.length <= D.readSessionMessages, 'default: ' + all.messages.length + ' messages for maxMessages ' + READ_ALL.maxMessages)
      assert.equal(all.truncated, true, 'the session has more than the limit')
      assert.equal((await read(sid, READ_ALL.fewer)).messages.length, READ_ALL.fewer, 'a smaller request is honoured')
      const newest = all.messages.at(-1)
      for (const n of SET.readMessages) {
        await withLimit({ readSessionMessages: n }, async () => {
          const cut = await read(sid)
          assert.equal(cut.messages.length, n, 'at ' + n)
          assert.equal(cut.truncated, true, 'the cut is reported (the user\'s decision: an explicit reason when a cap cuts a read)')
          assert.deepEqual(cut.messages.at(-1), newest, 'the newest message is kept')
        })
      }
      assert.equal((await read(sid)).messages.length, all.messages.length, 'back to the default')
    })

    it('L51 readSessionBytes: at most 12288 text bytes by default, at most 2000 at 2000, the default excerpt again after', LONG, async (t) => {
      const first = await read(sid)
      const base = textBytes(first.messages)
      t.diagnostic('default text bytes ' + base)
      // The session holds more text than the default allows (MAKE.turns answers of MAKE.answerPad bytes), so the default cuts too.
      assert.ok(base > SET.readBytes && base <= D.readSessionBytes, 'default: ' + base)
      assert.equal(first.truncated, true, 'the default cut is reported')
      await withLimit({ readSessionBytes: SET.readBytes }, async () => {
        const cut = await read(sid)
        assert.ok(textBytes(cut.messages) <= SET.readBytes, 'at most ' + SET.readBytes + ' bytes: ' + textBytes(cut.messages))
        assert.equal(cut.truncated, true, 'the cut is reported')
      })
      assert.equal(textBytes((await read(sid)).messages), base, 'back to the default excerpt')
    })
  })

  it('L61 maxActiveWatches: one more watch is accepted, the next refused limit-reached; back at the default it is accepted', LONG, async () => {
    const targets = [await managed('l61-a'), await managed('l61-b')]
    const active = (await watches()).filter((w) => w.status === WATCH_STATUS.active).length
    let first
    await withLimit({ maxActiveWatches: active + 1 }, async () => {
      first = await watch(targets[0])
      assert.equal(typeof first.payload?.watchId, 'string', 'the last free slot: ' + JSON.stringify(first))
      const over = await watch(targets[1])
      assert.equal(over.payload?.watchError, WATCH_ERROR.limitReached, JSON.stringify(over))
    })
    const again = await watch(targets[1])
    assert.equal(typeof again.payload?.watchId, 'string', 'accepted at the default: ' + JSON.stringify(again))
    for (const w of [first, again]) await unwatch(w.payload.watchId)
  })

  it('L52 watchesShown: session.watches shows at most 2 at 2, an active one among them, all again after', LONG, async () => {
    const made = []
    for (let i = 0; i < MAKE.watches; i++) made.push((await watch(await managed('l52-' + i))).payload.watchId)
    const all = await watches()
    assert.ok(all.length >= MAKE.watches, 'precondition: ' + MAKE.watches + ' watches shown by default, got ' + all.length)
    await withLimit({ watchesShown: SET.watchesShown }, async () => {
      const shown = await watches()
      assert.ok(shown.length >= 1 && shown.length <= SET.watchesShown, 'shows ' + shown.length)
      assert.ok(shown.some((w) => made.includes(w.watchId) && w.status === WATCH_STATUS.active), 'an active watch is shown')
    })
    assert.equal((await watches()).length, all.length, 'all again')
    for (const id of made) await unwatch(id)
  })

  it('L55 forwardExcerptBytes: a hand-over note carries at most 100 bytes of the last answer at 100, the whole answer after', LONG, async () => {
    /** Hand over a fresh session whose last answer is 500 bytes, with a note; returns the answer and what the note carries. */
    async function forward(folder) {
      const sid = await userSession(host, folder)
      const head = tok('fwd')
      const answer = head + 'a'.repeat(MAKE.forwardAnswerBytes - head.length)
      await turn(host, sid, [[{ text: answer }]], 'make an answer')
      assert.equal((await handOverWithNote(host, sid, tok('note'))).status, 200)
      const item = await stub.waitPush(head, { kind: KIND.user })
      assert.ok(item, 'the note reached the instance')
      return { answer, shown: untrustedBlock(item.text)?.fields?.last_answer }
    }
    const cut = await withLimit({ forwardExcerptBytes: SET.forwardBytes }, () => forward('l55-cut'))
    assert.equal(typeof cut.shown, 'string')
    assert.ok(bytes(cut.shown) <= SET.forwardBytes, 'at most ' + SET.forwardBytes + ' bytes: ' + bytes(cut.shown))
    assert.ok(cut.answer.startsWith(bare(cut.shown)), 'a prefix of the answer')
    const whole = await forward('l55-whole')
    assert.equal(whole.shown, whole.answer)
  })

  describe('permission requests', () => {
    let x
    let y
    before(async () => { x = await managed('l56-x'); y = await managed('l56-y') }, HOOK)

    it('L56 requestUserMessageBytes: the approval item shows at most 100 bytes of your message at 100, all of it after', LONG, async () => {
      const message = 'q'.repeat(MAKE.userMessageBytes)
      /** The latest_user_message the approval item of one request from x carries. */
      async function shown() {
        const text = await askFrom(host, x, message)
        const offer = await offerOf(booted, text)
        const item = await stub.waitPush(offer.approvalId, { kind: KIND.approval })
        assert.ok(item, 'an approval item')
        await reject(x, offer)
        await askSettled(host, text)
        await settledIdle(host, x)
        return untrustedBlock(item.text)?.fields?.latest_user_message
      }
      const cut = await withLimit({ requestUserMessageBytes: SET.userMessageBytes }, shown)
      assert.equal(typeof cut, 'string')
      assert.ok(bytes(cut) <= SET.userMessageBytes, 'at most ' + SET.userMessageBytes + ' bytes: ' + bytes(cut))
      assert.ok(message.startsWith(bare(cut)), 'a prefix')
      assert.equal(await shown(), message)
    })

    it('L57 rationaleChars: the audit keeps at most 10 characters of the reason at 10, all of it after', LONG, async (t) => {
      const allow = { decision: DECISION.allow, risk: RISK.low, reason: MAKE.reason }
      const rationale = (offer) => auditOf(booted.home, offer.approvalId)[0]?.rationale
      const cutOffer = await withLimit({ rationaleChars: SET.rationaleChars }, () => decided(x, allow))
      // rationaleChars bounds Fishball's rationale in the audit (§16). Whether it also bounds the asking call's own reason
      // in the descriptor is not specified (contract §5.1 bounds it by reasonChars, 500), so it is recorded only.
      t.diagnostic('descriptor reason at rationaleChars ' + SET.rationaleChars + ': ' + JSON.stringify(cutOffer.reason) + ' (the call\'s own: ' + JSON.stringify(ASK_REASON(cutOffer.askedText)) + ')')
      const cut = rationale(cutOffer)
      assert.equal(typeof cut, 'string')
      assert.ok([...cut].length <= SET.rationaleChars, 'at most ' + SET.rationaleChars + ' characters: ' + cut)
      assert.ok(MAKE.reason.startsWith(bare(cut)), 'a prefix: ' + cut)
      assert.equal(rationale(await decided(x, allow)), MAKE.reason)
    })

    it('L62 maxPendingApprovals: at 1 a second request goes to its stock prompt at once; back at the default it is offered', LONG, async () => {
      await withLimit({ maxPendingApprovals: SET.pending }, async () => {
        const first = await askFrom(host, x)
        const offer = await offerOf(booted, first)
        const second = await askFrom(host, y)
        const done = await askSettled(host, second)
        assert.equal(done?.outcome, OUTCOME.reject, 'the stock prompt answered')
        const seen = await stockSeen(host, second)
        assert.equal(seen.length, 1)
        assert.ok(seen[0].at - done.askedAt < MANAGED_STUB.atOnceMs, 'at once: ' + (seen[0].at - done.askedAt) + ' ms')
        assert.deepEqual((await stub.events(EVENT.approvalRequest)).filter((f) => f.payload.approvalId !== offer.approvalId && f.payload.reason.includes(second)), [], 'not offered')
        await reject(x, offer)
        await askSettled(host, first)
      })
      await settledIdle(host, y)
      await decided(y, { decision: DECISION.reject, risk: RISK.high, reason: MANAGED_STUB.rejectReason })
    })

    it('L63 approvalAnswerSeconds: at 2 the offer expires 2000 ms after it is made and the request reaches the stock prompt then; 120000 ms after', LONG, async () => {
      await withLimit({ approvalAnswerSeconds: SET.answerSeconds }, async () => {
        const text = await askFrom(host, x)
        const offer = await offerOf(booted, text)
        assertLifetime(offer, SET.answerSeconds)
        const done = await askSettled(host, text, SET.answerSeconds * MS_PER_S + STUB.waitMs)
        assert.equal(done?.outcome, OUTCOME.reject, 'the stock prompt answered')
        const [seen] = await stockSeen(host, text)
        const waited = seen.at - offer.at
        assert.ok(waited >= SET.answerSeconds * MS_PER_S - DEADLINE_SLACK_MS && waited <= SET.answerSeconds * MS_PER_S + DEADLINE_SLACK_MS, 'about the deadline: ' + waited + ' ms')
        await settledIdle(host, x)
      })
      const text = await askFrom(host, x)
      const offer = await offerOf(booted, text)
      assertLifetime(offer, D.approvalAnswerSeconds)
      await reject(x, offer)
      await askSettled(host, text)
      await settledIdle(host, x)
    })

    it('L64 argumentExcerptBytes: at 10 the arguments are cut and allow is refused; whole after', LONG, async () => {
      /** One request from x with long arguments; the instance tries allow, then rejects; returns the offer and allow's reply. */
      async function tried() {
        const text = await askFrom(host, x)
        const offer = await offerOf(booted, text)
        const allow = await scoped(stub, OPERATION.approvalAnswer, { sessionId: x, approvalId: offer.approvalId, offerId: offer.offerId, answer: { decision: DECISION.allow, risk: RISK.low, reason: MANAGED_STUB.releaseReason } })
        if (allow.type !== 'response') await reject(x, offer)
        await askSettled(host, text)
        await settledIdle(host, x)
        return { offer, allow, text }
      }
      const cut = await withLimit({ argumentExcerptBytes: SET.argumentBytes }, tried)
      assert.equal(cut.offer.argumentsStatus, ARGUMENTS_STATUS.truncated)
      assert.ok(bytes(cut.offer.arguments) <= SET.argumentBytes, 'at most ' + SET.argumentBytes + ' bytes: ' + cut.offer.arguments)
      assert.equal(cut.allow.payload?.code, ERROR.argumentsIncomplete, JSON.stringify(cut.allow))
      const whole = await tried()
      assert.equal(whole.offer.argumentsStatus, ARGUMENTS_STATUS.complete)
      assert.deepEqual(JSON.parse(whole.offer.arguments), { text: whole.text })
      assert.equal(whole.allow.type, 'response', 'allowed at the default: ' + JSON.stringify(whole.allow))
    })

    it('L65 auditEntriesKept: at 1 one audit record is kept; back at the default the next is kept beside it', LONG, async () => {
      const rejectAnswer = { decision: DECISION.reject, risk: RISK.high, reason: MANAGED_STUB.rejectReason }
      assert.ok(approvalAudit(booted.home).length > SET.auditKept, 'precondition: more than one record')
      await withLimit({ auditEntriesKept: SET.auditKept }, async () => {
        await decided(x, rejectAnswer)
        assert.ok(await until(() => approvalAudit(booted.home).length === SET.auditKept, STUB.waitMs, 100), 'kept ' + approvalAudit(booted.home).length)
      })
      await decided(x, rejectAnswer)
      assert.ok(await until(() => approvalAudit(booted.home).length === SET.auditKept + 1, STUB.waitMs, 100), 'kept ' + approvalAudit(booted.home).length)
    })
  })

  it('L60 maxMessageBytes: at 100 a 100-byte message is delivered and a 101-byte one refused too-large; 101 bytes after', LONG, async () => {
    const sid = await managed('l60')
    const sized = (n) => { const head = tok('mb'); return head + 'b'.repeat(n - head.length) }
    await withLimit({ maxMessageBytes: SET.messageBytes }, async () => {
      assert.equal((await messageFishball(host, sid, { message: sized(SET.messageBytes) })).json?.ok, true, 'at the limit')
      assert.equal((await messageFishball(host, sid, { message: sized(SET.messageBytes + 1) })).json?.code, P5_CODE.tooLarge, 'above it')
    })
    assert.equal((await messageFishball(host, sid, { message: sized(SET.messageBytes + 1) })).json?.ok, true, 'back at the default')
  })

  it('L67 userMessagesListed and userMessageExcerptChars: 2 newest with 5-character excerpts, then all whole', LONG, async () => {
    const sid = await managed('l67')
    const typed = []
    for (let i = 0; i < MAKE.userMessages; i++) { typed.push(tok('um' + i) + ' please do part ' + i); await turn(host, sid, [[{ text: 'ok' }]], typed.at(-1)) }
    const listed = async () => { const { json } = await sessionCall(host, sid, LIST_USER_MESSAGES, {}); assert.equal(json?.ok, true, JSON.stringify(json)); return json.messages }
    const all = await listed()
    assert.ok(all.length > SET.listed && all.length <= D.userMessagesListed, 'default: ' + all.length)
    for (const m of typed) assert.ok(all.some((x) => x.excerpt === m), 'whole excerpt of ' + m)
    await withLimit({ userMessagesListed: SET.listed, userMessageExcerptChars: SET.excerptChars }, async () => {
      const cut = await listed()
      assert.equal(cut.length, SET.listed)
      // Newest first. Each listing turn adds one user message of its own before the tool runs, so the newest two are
      // this turn's message and the previous listing turn's, which headed the default list.
      assert.equal(cut[1].id, all[0].id, 'the newest: ' + JSON.stringify(cut))
      for (const m of cut) {
        assert.ok([...m.excerpt].length <= SET.excerptChars, 'at most ' + SET.excerptChars + ' characters: ' + m.excerpt)
        assert.ok(bare(m.excerpt).length > 0)
      }
    })
    const again = await listed()
    assert.ok(again.length >= all.length)
    for (const m of typed) assert.ok(again.some((x) => x.excerpt === m), 'whole again: ' + m)
  })

  it('L66 maxQueuedInputs: with no instance, at 1 the second message is refused queue-full; back at 200 the next is queued', LONG, async () => {
    const sid = await managed('l66')
    await quietPushes(stub)
    await detachStub(booted)
    const sent = []
    try {
      await withLimit({ maxQueuedInputs: SET.queued }, async () => {
        sent.push(tok('q1'))
        assert.equal((await messageFishball(host, sid, { message: sent[0] })).json?.ok, true, 'queued under the bound')
        assert.equal((await messageFishball(host, sid, { message: tok('q2') })).json?.code, P5_CODE.queueFull, 'refused at the bound')
      })
      sent.push(tok('q3'))
      assert.equal((await messageFishball(host, sid, { message: sent[1] })).json?.ok, true, 'queued at the default')
    } finally {
      await reattach(booted)
    }
    for (const m of sent) assert.ok(await stub.waitPush(m, { kind: KIND.session }), 'delivered after the attach: ' + m)
    attachCount += 1
  })

  it('L59 none of the changes re-attached or closed the instance', T, async () => {
    const st = await host.state()
    assert.equal(st.status, 'live')
    assert.equal(st.instance.attached, true)
    assert.equal(st.instance.attachCount, attachCount, 'no attach besides the case\'s own detach/attach')
    assert.equal((await stub.transportCalls()).closedByConnector, false, 'the connector never closed the channel')
  })
})
