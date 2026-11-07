/**
 * P6 W3-W6, W8 on H-STUB: when watches fire, the instance's watch operations and notifyWhenFinished.
 * Requirements: DESIGN.md §5c (finished / per-turn, once / repeat, the reasons, the notice, "One rule,
 * every trigger"), §5b/§5d (notify_when_finished), §16 (maxActiveWatches, maxQueuedInputs, watchesShown);
 * contract §4.1 (session.watch/watches/unwatch/read/message/start, notifyWhenFinished), §4.5 (inbox kind
 * `watch`), §9 (the queue bound); connector.md C1-DT-03. In-process Fishball's tools become the stub's
 * contract requests; "Fishball got a notice" becomes an `inbox.push` of kind `watch` (slim §5.2).
 *
 * Contract §4.1 has `mode` (once / repeat) only, so the condition is the default `finished`; `per-turn`
 * cannot be asked for through the contract (FIR-05/06 and QFL-03 are retired below).
 *
 * | id     | technique | requirement | expected |
 * |--------|-----------|-------------|----------|
 * | FIR-01 | EP (completed) | DESIGN §5c "Notice"; contract §4.5; C1-DT-03 | exactly one `watch` push from the target: the first line says a watched session finished, the JSON-quoted reason, the watch id and who set it up (assistant); one untrusted block with session_id, session_title, session_folder, last_answer; session.watches shows it closed |
 * | FIR-02 | ST (closed once watch –another turn→) | DESIGN §5c "`once` watches close after firing" | no second notice; still closed |
 * | FIR-03 ×4 | EP (reasons error / max-tokens / aborted / blocked) | DESIGN §5c reasons | one notice with that JSON-quoted reason; closed |
 * | FIR-04 | ST (turn end → queued follow-up starts before idle → settles), repeat | DESIGN §5c "finished fires only for the last turn end" | one notice for the whole stretch, after it settles; last_answer is the final answer; repeat stays active |
 * | FIR-07 | ST (repeat, two settled turns) | DESIGN §5c, contract §6 WATCH_MODE | two notices, each with its own answer, in order; still active |
 * | WST-01 | EP (observed) | contract §5 `watch.status` | any watch.status event has {watchId, status:{state, lastSequence}}, state from WATCH_STATE (when it is sent is not documented; count is a diagnostic) |
 * | TOL-02 | EP (mode once, a managed session) | contract §4.1 | {watchId}; session.watches lists it with exactly {watchId, sessionId, mode:'once', status:'active'} |
 * | TOL-03 ×4 | DT (target / limit) | contract §4.1, §6; DESIGN §5c checks, §16 | unknown-session, is-fishball, archived, limit-reached; nothing added |
 * | TOL-04 | EP | contract §4.1 | session.watches entries have exactly the four keys, mode and status from WATCH_MODE / WATCH_STATUS |
 * | TOL-05 | ST (active –unwatch→ closed) | contract §4.1 | {ok:true}; session.watches shows it closed |
 * | TOL-06 ×5 | DT (relation of session.read) | contract §4.1 "related session"; DESIGN §5c "Relatedness" | ok for: managed now, watched now (taken back after), watched before (closed), forwarded by the user (Hand over with a note, then taken back), started by the instance |
 * | TOL-06b ×4 | EP (not a session: topic, intake identity, forward identity, watch id) | DESIGN §5c review | session.read never answers a response |
 * | TOL-06c ×3 | DT | contract §4.1 | an unrelated session (the user's, never handed over) is refused, never read; Fishball's own is-fishball; an unknown id unknown-session |
 * | TOL-07 | BVA (20 turns of 1500-byte answers, maxMessages 12, maxBytes 12288) | contract §4.1 "cuts the reply to fit and reports truncated" | at most 12 messages, the newest kept, text at most 12288 bytes, truncated true |
 * | TOL-07b | BVA (one answer of about 16 KB) | contract §4.1 | text at most 12288 bytes, no broken character, truncated true |
 * | NTF-01 | EP (session.message + notifyWhenFinished) | contract §4.1; DESIGN §5c | {status:'delivered', watchId}; one notice after the target's turn, with its answer |
 * | NTF-02 | EP (session.start + notifyWhenFinished) | contract §4.1 | {sessionId, managed:true, watchId}; one notice after its first turn |
 * | NTF-03 ×2 | DT (flag × watch refused: limit) | contract §4.1 "A refused watch never undoes the message" | session.message: {status:'delivered', watchError:'limit-reached'}, no watchId, the message reaches the target; message_fishball: ok, watchError, the message is delivered |
 * | NTF-04 | EP (message_fishball + notify_when_finished) | DESIGN §5c; contract §4.5 | ok, a watch on the caller (createdBy agent, the caller); the `session` push first, then one `watch` push when the caller's turn ends |
 * | NTF-05 | EP (subagent of a managed session + flag) | DESIGN §5e "no Fishball tools" | the child has no message_fishball; no watch on the root or the child |
 * | NTF-06 ×3 | EP (no flag) | contract §4.1 "watchId? or watchError?" | session.message, session.start and message_fishball carry neither watchId/watch nor watchError; no watch is added |
 * | NTF-07/08 | EP (fast turn: the target's first model call fails at once) | contract §4.1 "watermark read before the delivery" | session.message / session.start with the flag: one notice, reason error |
 * | QFL-02 | ST (queue full: maxQueuedInputs 1 and one unacked item → target finishes → the item is acked late → (a ready edge if nothing came yet)) | DESIGN §5c "A notice the ledger refuses keeps the watermark … scanned again"; contract §9; slim §5.2 ready edge | not delivered while full; exactly one notice later, with its answer, without a DSH restart (diagnostic: whether the ack alone was enough) |
 *
 * Retired:
 * - FIR-05, FIR-06, QFL-03: the per-turn condition has no contract field (session.watch is {sessionId, mode}, contract §4.1), so the instance cannot set one up.
 * - TOL-01: Fishball's four in-process tools are gone (slim §12); the instance has the contract operations instead.
 * - TOL-08: the read_session untrusted block is gone; session.read returns structured messages (contract §4.1), framing is the instance's.
 * - TOL-09: the outbox entry it pruned belonged to the in-process message_session (slim §12).
 * - WKC-01, WKC-02: the wake-up cap went with the in-process agent (slim §5.2 "Wake-up belongs to the child").
 * - TOL-06 "messaged Fishball" / "messaged by Fishball": both make the session managed (DESIGN §5e), so they are the "managed now" row.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { EVENT } from 'fishball-connector/contract'
import { LIMITS, PRESET } from './support/constants.mjs'
import { HOOK, T, callScript, jsonOf, toolNames, turn } from './support/expect.mjs'
import { KIND, STUB, bootStub, managedSession, messageFishball, quietPushes, stopStub, takeBack, userSession } from './support/instance-stub.mjs'
import { sleep, until } from './support/util.mjs'
import {
  WATCHES, ackLate, allPushes, answerTurn, attachReady, assertNotice, closeAll, folderOf, messageWith, noticeBlock, noticesSettled, readOp, refusalOf, setLimit, startWith, tok,
  unwatchOp, watchEntry, watchList, watchOk, watchOp, watched, watchesOn,
} from './support/instance-stub-watches.mjs'

const { mode: WMODE, status: WSTATUS, error: WERR, reason: REASON, creator: CREATOR } = WATCHES
/** contract §4.1 session.read bounds as the old read_session defaults (DESIGN §16 readSessionMessages/Bytes). */
const READ = Object.freeze({ messages: 12, bytes: 12288 })
/** The old TOL-07 sizes: 20 turns, both sides long, so 12 messages exceed the byte bound. */
const LONG_READ = Object.freeze({ turns: 20, padBytes: 1500, bigChars: 8000 })
const LONG = { timeout: 90000 }

describe('P6 watches fire (H-STUB)', () => {
  let booted
  let host
  let stub
  let fb
  /** A fresh folder under the home, for session.start (it never creates folders, contract §4.1). */
  const newFolder = (name) => { const dir = path.join(booted.home, 'work', name); fs.mkdirSync(dir, { recursive: true }); return dir }

  before(async () => {
    booted = await bootStub('watch-fire')
    ;({ host, stub } = booted)
    fb = (await host.state()).sessionId
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  describe('W3 finished', () => {
    let first
    it('FIR-01 a completed turn gives exactly one framed watch notice and closes the once watch', T, async () => {
      const { sid, watchId } = await watched(host, stub, 'f-01')
      const answer = tok('fir01') + ' all "done"'
      await turn(host, sid, [[{ text: answer }]])
      const got = await noticesSettled(stub, watchId, 1)
      assert.equal(got.length, 1, 'exactly one notice')
      assertNotice(assert, got[0], { sid, watchId, reason: REASON.completed, creator: CREATOR.assistant, folder: await folderOf(host, sid), answer })
      assert.equal((await watchEntry(stub, watchId)).status, WSTATUS.closed)
      first = { sid, watchId }
    })

    it('FIR-02 a closed once watch gives no notice for later turns', T, async () => {
      assert.ok(first, 'precondition: FIR-01')
      await answerTurn(host, first.sid, 'fir02a')
      await answerTurn(host, first.sid, 'fir02b')
      assert.equal((await noticesSettled(stub, first.watchId, 0)).length, 1)
      assert.equal((await watchEntry(stub, first.watchId)).status, WSTATUS.closed)
    })

    const reasons = [
      [REASON.error, (sid) => host.call('drive', { sessionId: sid, script: [[{ fail: 'FBTEST_FATAL' }]] })],
      [REASON.maxTokens, (sid) => host.call('drive', { sessionId: sid, script: [[{ text: 'cut short', finish: 'max-tokens' }]] })],
      [REASON.aborted, async (sid) => {
        await host.call('holdNext', { sessionId: sid })
        await host.call('driveStart', { sessionId: sid, text: 'to be stopped' })
        assert.ok(await until(() => host.call('isHeld', { sessionId: sid }), STUB.waitMs, STUB.pollMs))
        await host.call('cancel', { sessionId: sid })
        await host.call('releaseHold', { sessionId: sid })
        await host.call('waitIdle', { sessionId: sid })
      }],
      [REASON.blocked, async (sid) => { await host.call('rejectNextStep', { sessionId: sid }); return host.call('drive', { sessionId: sid, script: [[{ text: 'never' }]] }) }],
    ]
    for (const [reason, drive] of reasons) {
      it('FIR-03 a turn that ends ' + reason + ' fires once with that reason', T, async () => {
        const { sid, watchId } = await watched(host, stub, 'f-03-' + reason)
        await drive(sid)
        assert.equal((await host.call('turnEnds', { sessionId: sid })).at(-1), reason, 'precondition: the turn ended ' + reason)
        const got = await noticesSettled(stub, watchId, 1)
        assert.equal(got.length, 1)
        assertNotice(assert, got[0], { sid, watchId, reason })
        assert.equal((await watchEntry(stub, watchId)).status, WSTATUS.closed)
      })
    }

    it('FIR-04 a turn followed by a queued follow-up before idle gives one notice when it settles', T, async () => {
      const { sid, watchId } = await watched(host, stub, 'f-04', WMODE.repeat)
      const [a1, a2] = [tok('fir04one'), tok('fir04two')]
      await host.call('holdNext', { sessionId: sid })
      await host.call('driveStart', { sessionId: sid, text: 'one', script: [[{ text: a1 }], [{ text: a2 }]] })
      assert.ok(await until(() => host.call('isHeld', { sessionId: sid }), STUB.waitMs, STUB.pollMs))
      await host.call('followup', { sessionId: sid, text: 'two' })
      await host.call('releaseHold', { sessionId: sid })
      await until(async () => (await host.call('turnEnds', { sessionId: sid })).length >= 3, STUB.waitMs, STUB.pollMs)
      assert.ok((await host.call('turnEnds', { sessionId: sid })).length >= 3, 'precondition: two turns ran after the first')
      const got = await noticesSettled(stub, watchId, 1, { quietMs: WATCHES.longQuietMs })
      assert.equal(got.length, 1, 'one notice for the busy stretch')
      assert.equal(noticeBlock(got[0]).fields.last_answer, a2, 'the settled (final) answer')
      assert.equal((await watchEntry(stub, watchId)).status, WSTATUS.active, 'repeat stays active')
    })

    it('FIR-07 a repeat watch gives one notice per settled turn, in order, and stays active', T, async () => {
      const { sid, watchId } = await watched(host, stub, 'f-07', WMODE.repeat)
      const answers = [await answerTurn(host, sid, 'fir07a')]
      await noticesSettled(stub, watchId, 1)
      answers.push(await answerTurn(host, sid, 'fir07b'))
      const got = await noticesSettled(stub, watchId, answers.length)
      assert.deepEqual(got.map((n) => noticeBlock(n).fields.last_answer), answers)
      assert.equal((await watchEntry(stub, watchId)).status, WSTATUS.active)
    })
  })

  // contract §5 defines watch.status but no document says when it is sent, so only its shape is checked;
  // the count is a diagnostic (an open question, not a requirement).
  it('WST-01 (observed) every watch.status event so far has {watchId, status:{state, lastSequence}}', T, async (t) => {
    const events = await stub.events(EVENT.watchStatus)
    t.diagnostic('watch.status events after the W3 cases: ' + events.length)
    for (const { payload } of events) {
      assert.deepEqual(Object.keys(payload).sort(), ['status', 'watchId'])
      assert.deepEqual(Object.keys(payload.status).sort(), ['lastSequence', 'state'])
      assert.ok(Object.values(WATCHES.state).includes(payload.status.state), payload.status.state)
    }
  })

  describe('W5 the watch operations', () => {
    it('TOL-02 session.watch with mode once on a managed session answers {watchId}; the list shows it active', T, async () => {
      const sid = await managedSession(host, 't-02')
      const reply = await watchOp(stub, sid, WMODE.once)
      assert.equal(reply.type, 'response', JSON.stringify(reply))
      assert.deepEqual(Object.keys(reply.payload), ['watchId'])
      assert.deepEqual(await watchEntry(stub, reply.payload.watchId), { watchId: reply.payload.watchId, sessionId: sid, mode: WMODE.once, status: WSTATUS.active })
    })

    describe('TOL-03 session.watch refusals', () => {
      let archivedId
      let extra
      before(async () => {
        archivedId = await managedSession(host, 't-03-arch')
        assert.equal((await host.call('archive', { sessionId: archivedId, stopActivity: true })).ok, true)
        extra = await managedSession(host, 't-03-extra')
      }, HOOK)
      after(() => setLimit(host, { maxActiveWatches: LIMITS.maxActiveWatches.default }), HOOK)
      for (const [label, sid, code] of [
        ['an unknown session', () => WATCHES.missingSession, WERR.unknownSession],
        ["Fishball's own session", () => fb, WERR.isFishball],
        ['an archived session', () => archivedId, WERR.archived],
      ]) {
        it(label + ' → ' + code, T, async () => {
          const before = await watchList(stub)
          const reply = await watchOp(stub, sid())
          assert.equal(refusalOf(reply), code, JSON.stringify(reply))
          assert.deepEqual(await watchList(stub), before)
        })
      }
      it('at maxActiveWatches → limit-reached', T, async () => {
        await closeAll(stub)
        await setLimit(host, { maxActiveWatches: 1 })
        await watchOk(stub, await managedSession(host, 't-03-fill'))
        const reply = await watchOp(stub, extra)
        assert.equal(reply.type, 'response', JSON.stringify(reply))
        assert.deepEqual(reply.payload, { watchError: WERR.limitReached })
        assert.equal((await watchesOn(stub, extra)).length, 0)
        await closeAll(stub)
      })
    })

    it('TOL-04 session.watches entries have exactly {watchId, sessionId, mode, status} with contract values', T, async () => {
      await watched(host, stub, 't-04')
      const list = await watchList(stub)
      assert.ok(list.length > 0)
      for (const w of list) {
        assert.deepEqual(Object.keys(w).sort(), WATCHES.listKeys)
        assert.ok(Object.values(WMODE).includes(w.mode), w.mode)
        assert.ok(Object.values(WSTATUS).includes(w.status), w.status)
      }
    })

    it('TOL-05 session.unwatch closes a watch', T, async () => {
      const { watchId } = await watched(host, stub, 't-05')
      assert.deepEqual((await unwatchOp(stub, watchId)).payload, { ok: true })
      assert.equal((await watchEntry(stub, watchId)).status, WSTATUS.closed)
    })

    describe('TOL-06 session.read relatedness', () => {
      /** Each arrange gives the target (a session that already had a turn with a known answer) its relation. */
      const related = [
        ['managed now', async () => {}],
        ['watched now (then taken back)', async (sid) => { await watchOk(stub, sid, WMODE.repeat); await takeBack(host, sid) }],
        ['watched before (closed, then taken back)', async (sid) => { await unwatchOp(stub, await watchOk(stub, sid)); await takeBack(host, sid) }],
        // Hand over with a note forwards the session and manages it; the second Take back leaves only the forward.
        ['forwarded by the user (Hand over with a note, then taken back)', async (sid) => { await takeBack(host, sid); assert.equal((await host.post(WATCHES.sendRoute, { sessionId: sid, note: tok('fwd') })).status, 200); await takeBack(host, sid) }],
      ]
      for (const [label, arrange] of related) {
        it(label + ' → a response with its messages', T, async () => {
          const sid = await managedSession(host, 't-06-' + label.replace(/\W+/g, '-'))
          const answer = await answerTurn(host, sid, 't06ans')
          await arrange(sid)
          const reply = await readOp(stub, sid, READ.messages, READ.bytes)
          assert.equal(reply.type, 'response', JSON.stringify(reply))
          assert.ok(reply.payload.messages.some((m) => m.text.includes(answer)), 'its last answer is there')
        })
      }
      it('started by the instance → a response', T, async () => {
        const { reply: started } = await startWith(host, stub, newFolder('t-06-started'), { label: 't06start', script: [[{ text: 'started ok' }]] })
        assert.equal(started.type, 'response', JSON.stringify(started))
        await until(async () => (await host.call('agentStatus', { sessionId: started.payload.sessionId })) === 'idle', STUB.waitMs, STUB.pollMs)
        const reply = await readOp(stub, started.payload.sessionId, READ.messages, READ.bytes)
        assert.equal(reply.type, 'response', JSON.stringify(reply))
      })
      // DESIGN §5c review: only exact session sources count; intake identities and watch ids are not sessions.
      for (const [label, arg] of [
        ['the unchecked-tools topic', () => 'unchecked-tools'],
        ['an intake identity', () => 'fishball/unchecked-tools'],
        ['a forward identity', () => 'user/forward/' + fb],
        ['a watch id', async () => (await watchList(stub))[0]?.watchId ?? 'no-watch'],
      ]) {
        it('TOL-06b ' + label + ' → never read', T, async () => {
          const id = await arg()
          const reply = await readOp(stub, id, READ.messages, READ.bytes)
          assert.notEqual(reply.type, 'response', JSON.stringify(reply).slice(0, 300))
        })
      }
      it('TOL-06c an unrelated session (the user\'s, never handed over, watched or forwarded) is never read', T, async () => {
        const sid = await userSession(host, 't-06-unrelated')
        const reply = await readOp(stub, sid, READ.messages, READ.bytes)
        assert.notEqual(reply.type, 'response', JSON.stringify(reply).slice(0, 300))
      })
      for (const [label, sid, code] of [["Fishball's own session", () => fb, WERR.isFishball], ['an unknown session', () => WATCHES.missingSession, WERR.unknownSession]]) {
        it('TOL-06c ' + label + ' → ' + code, T, async () => {
          const reply = await readOp(stub, sid(), READ.messages, READ.bytes)
          assert.equal(reply.type, 'error', JSON.stringify(reply))
          assert.equal(reply.payload.code, code)
        })
      }
    })

    const textBytes = (messages) => messages.reduce((n, m) => n + Buffer.byteLength(m.text), 0)
    it('TOL-07 session.read is bounded by maxMessages and maxBytes, newest kept, truncated reported', LONG, async (t) => {
      const sid = await managedSession(host, 't-07')
      let last
      for (let i = 0; i < LONG_READ.turns; i++) { last = tok('t07n' + i) + 'z'.repeat(LONG_READ.padBytes); await turn(host, sid, [[{ text: last }]], 'user turn ' + i + ' ' + 'u'.repeat(LONG_READ.padBytes)) }
      const reply = await readOp(stub, sid, READ.messages, READ.bytes)
      assert.equal(reply.type, 'response', JSON.stringify(reply).slice(0, 300))
      const msgs = reply.payload.messages
      t.diagnostic('messages ' + msgs.length + ', text bytes ' + textBytes(msgs) + ', truncated ' + reply.payload.truncated)
      assert.ok(msgs.length > 0 && msgs.length <= READ.messages, 'messages: ' + msgs.length)
      assert.ok(textBytes(msgs) <= READ.bytes, 'text bytes ' + textBytes(msgs))
      assert.ok(msgs.some((m) => m.text.includes(last.slice(0, 20))), 'the newest answer is kept')
      assert.equal(reply.payload.truncated, true)
    })

    it('TOL-07b one answer larger than maxBytes still gives a bounded excerpt with no broken character', T, async (t) => {
      const sid = await managedSession(host, 't-07b')
      await turn(host, sid, [[{ text: tok('t07b') + 'é'.repeat(LONG_READ.bigChars) }]])
      const reply = await readOp(stub, sid, READ.messages, READ.bytes)
      assert.equal(reply.type, 'response', JSON.stringify(reply).slice(0, 300))
      const msgs = reply.payload.messages
      t.diagnostic('messages ' + msgs.length + ', text bytes ' + textBytes(msgs))
      assert.ok(textBytes(msgs) <= READ.bytes, 'text bytes ' + textBytes(msgs))
      assert.equal(JSON.stringify(msgs).includes('\uFFFD'), false, 'no broken character')
      assert.equal(reply.payload.truncated, true)
    })
  })

  describe('W6 notifyWhenFinished', () => {
    before(async () => { await closeAll(stub); await setLimit(host, { maxActiveWatches: LIMITS.maxActiveWatches.default }) }, HOOK)

    it('NTF-01 session.message with the flag watches the target and fires after its turn', T, async () => {
      const sid = await managedSession(host, 'n-01')
      const answer = tok('ntf01ans')
      const { reply } = await messageWith(host, stub, sid, { label: 'ntf01', script: [[{ text: answer }]], notifyWhenFinished: true })
      assert.equal(reply.type, 'response', JSON.stringify(reply))
      assert.equal(reply.payload.status, 'delivered')
      assert.equal(typeof reply.payload.watchId, 'string')
      assert.equal('watchError' in reply.payload, false, 'never both')
      assert.equal((await watchEntry(stub, reply.payload.watchId))?.sessionId, sid)
      const got = await noticesSettled(stub, reply.payload.watchId, 1)
      assert.equal(got.length, 1)
      assertNotice(assert, got[0], { sid, watchId: reply.payload.watchId, answer })
    })

    it('NTF-02 session.start with the flag watches the new session and fires after its first turn', T, async () => {
      const { reply } = await startWith(host, stub, newFolder('n-02'), { label: 'ntf02', script: [[{ text: 'NTF02 finished' }]], notifyWhenFinished: true })
      assert.equal(reply.type, 'response', JSON.stringify(reply))
      assert.equal(reply.payload.managed, true)
      assert.equal(typeof reply.payload.watchId, 'string')
      assert.equal((await watchEntry(stub, reply.payload.watchId))?.sessionId, reply.payload.sessionId)
      const got = await noticesSettled(stub, reply.payload.watchId, 1)
      assert.equal(got.length, 1)
      assertNotice(assert, got[0], { sid: reply.payload.sessionId, watchId: reply.payload.watchId, answer: 'NTF02 finished' })
    })

    describe('NTF-03 a refused watch never undoes the message', () => {
      before(async () => {
        await closeAll(stub)
        await setLimit(host, { maxActiveWatches: 1 })
        await watchOk(stub, await managedSession(host, 'n-03-fill'))
      }, HOOK)
      after(async () => { await closeAll(stub); await setLimit(host, { maxActiveWatches: LIMITS.maxActiveWatches.default }) }, HOOK)

      it('session.message: delivered, watchError limit-reached, no watchId; the target got it', T, async () => {
        const sid = await managedSession(host, 'n-03')
        const { marker, reply } = await messageWith(host, stub, sid, { label: 'ntf03', script: [[{ text: 'got it' }]], notifyWhenFinished: true })
        assert.equal(reply.type, 'response', JSON.stringify(reply))
        assert.deepEqual(reply.payload, { status: 'delivered', watchError: WERR.limitReached })
        assert.equal((await watchesOn(stub, sid)).length, 0)
        assert.ok(await until(async () => (await host.call('requestsContaining', { needle: marker })).some((r) => r.sessionId === sid), STUB.waitMs, STUB.pollMs), 'delivered')
      })

      it('message_fishball: ok with watchError limit-reached; the message is delivered', T, async () => {
        const sid = await managedSession(host, 'n-03b')
        const text = tok('ntf03b')
        const { json } = await messageFishball(host, sid, { message: text, notify_when_finished: true })
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.watchError, WERR.limitReached)
        assert.equal(json.watch, undefined)
        assert.ok(await stub.waitPush(text, { kind: KIND.session }), 'the message reached the instance')
      })
    })

    it('NTF-07 session.message with the flag reports a target turn that fails at once (error)', T, async () => {
      const sid = await managedSession(host, 'n-07')
      const { reply } = await messageWith(host, stub, sid, { label: 'ntf07', script: [[{ fail: 'FBTEST_FATAL' }]], notifyWhenFinished: true })
      assert.equal(typeof reply.payload?.watchId, 'string', JSON.stringify(reply))
      const got = await noticesSettled(stub, reply.payload.watchId, 1)
      assert.equal(got.length, 1, 'the immediate turn end is reported')
      assertNotice(assert, got[0], { sid, watchId: reply.payload.watchId, reason: REASON.error })
    })

    it('NTF-08 session.start with the flag reports a first turn that fails at once (error)', T, async () => {
      const { reply } = await startWith(host, stub, newFolder('n-08'), { label: 'ntf08', script: [[{ fail: 'FBTEST_FATAL' }]], notifyWhenFinished: true })
      assert.equal(typeof reply.payload?.watchId, 'string', JSON.stringify(reply))
      const got = await noticesSettled(stub, reply.payload.watchId, 1)
      assert.equal(got.length, 1, 'the immediate turn end is reported')
      assertNotice(assert, got[0], { sid: reply.payload.sessionId, watchId: reply.payload.watchId, reason: REASON.error })
    })

    it('NTF-04 message_fishball with the flag watches the caller (createdBy agent) and fires when its turn ends', T, async () => {
      const sid = await managedSession(host, 'n-04')
      const text = tok('ntf04')
      const { json } = await messageFishball(host, sid, { message: text, notify_when_finished: true })
      assert.equal(json?.ok, true, JSON.stringify(json))
      assert.equal(json.watch?.targetSessionId, sid)
      assert.deepEqual(json.watch.createdBy, { kind: CREATOR.agent, id: sid })
      const got = await noticesSettled(stub, json.watch.id, 1)
      assert.equal(got.length, 1)
      assertNotice(assert, got[0], { sid, watchId: json.watch.id, creator: CREATOR.agent })
      const order = (await allPushes(stub)).filter((p) => p.text.includes(text) || p.text.includes(json.watch.id)).map((p) => p.kind)
      assert.deepEqual(order, [KIND.session, KIND.watch], 'the message first, then the notice')
    })

    it('NTF-05 a subagent of a managed session has no message_fishball, so no watch', LONG, async () => {
      const std = await managedSession(host, 'n-05', PRESET.standard)
      const marker = tok('ntf05sub')
      await host.call('queueMarker', { marker, except: std, script: [[{ tool: 'message_fishball', args: { message: tok('ntf05'), notify_when_finished: true } }], [{ text: 'sub done' }]] })
      const r = await turn(host, std, [[{ tool: 'subagent', args: { description: 'fbtest sub', prompt: marker + ' please' } }], [{ text: 'parent done' }]])
      assert.equal(r.results[0]?.isError, false, r.results[0]?.text)
      assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, STUB.waitMs, STUB.pollMs), 'precondition: the child ran')
      const child = (await host.call('markerState', { marker })).sessions[0]
      for (const req of await host.call('requests', { sessionId: child })) assert.equal(toolNames(req).includes('message_fishball'), false, 'the child lists message_fishball')
      await quietPushes(stub)
      assert.equal((await watchesOn(stub, std)).length, 0, 'no watch on the root')
      assert.equal((await watchesOn(stub, child)).length, 0, 'no watch on the child')
    })

    describe('NTF-06 without the flag no watch is added', () => {
      it('session.message', T, async () => {
        const sid = await managedSession(host, 'n-06a')
        const { reply } = await messageWith(host, stub, sid, { label: 'n06a', script: [[{ text: 'ok' }]] })
        assert.deepEqual(reply.payload, { status: 'delivered' })
        await host.call('waitIdle', { sessionId: sid })
        assert.equal((await watchesOn(stub, sid)).length, 0)
      })
      it('session.start', T, async () => {
        const { reply } = await startWith(host, stub, newFolder('n-06b'), { label: 'n06b', script: [[{ text: 'ok' }]] })
        assert.equal(reply.type, 'response', JSON.stringify(reply))
        for (const key of ['watchId', 'watchError']) assert.equal(key in reply.payload, false, key)
        assert.equal((await watchesOn(stub, reply.payload.sessionId)).length, 0)
      })
      it('message_fishball', T, async () => {
        const sid = await managedSession(host, 'n-06c')
        const r = await turn(host, sid, callScript('message_fishball', { message: tok('n06') }))
        const json = jsonOf(r.results[0])
        assert.equal(json?.ok, true, JSON.stringify(json))
        for (const key of ['watch', 'watchError']) assert.equal(key in json, false, key)
        assert.equal((await watchesOn(stub, sid)).length, 0)
      })
    })
  })

  describe('W8 a notice refused by a full queue', () => {
    after(async () => { await stub.ackPolicy(null); await setLimit(host, { maxQueuedInputs: LIMITS.maxQueuedInputs.default }) }, HOOK)

    it('QFL-02 a finished notice refused while the queue is full arrives once later, without a restart', T, async (t) => {
      const { sid, watchId } = await watched(host, stub, 'q-02')
      const sender = await managedSession(host, 'q-02-sender')
      await quietPushes(stub)
      // One item pushed but never acked counts toward the bound (contract §9), so the queue is full at 1.
      await setLimit(host, { maxQueuedInputs: 1 })
      await stub.ackPolicy(0)
      const fill = tok('qfill')
      assert.equal((await messageFishball(host, sender, { message: fill })).json?.ok, true, 'fills the queue')
      assert.ok(await stub.waitPush(fill), 'precondition: the filling item was pushed (and is not acked)')
      const answer = await answerTurn(host, sid, 'qfl02')
      assert.equal((await noticesSettled(stub, watchId, 0)).length, 0, 'not delivered while full')
      // The queue drains: the instance acks the item late, on the same connection.
      await stub.ackPolicy(null)
      await ackLate(stub, fill)
      await setLimit(host, { maxQueuedInputs: LIMITS.maxQueuedInputs.default })
      const early = (await noticesSettled(stub, watchId, 0)).length
      t.diagnostic('notices after the queue drained, before a new ready edge: ' + early)
      // The instance's ready edge stands in for "Fishball goes live" (slim §5.2): a re-scan trigger, not a restart.
      if (early === 0) { await stub.detach(); await attachReady(stub) }
      const got = await noticesSettled(stub, watchId, 1, { timeoutMs: WATCHES.catchUpMs })
      assert.equal(got.length, 1, 'exactly one notice arrives later')
      assert.equal(noticeBlock(got[0]).fields.last_answer, answer)
      assert.equal((await watchEntry(stub, watchId)).status, WSTATUS.closed)
    })
  })
})
