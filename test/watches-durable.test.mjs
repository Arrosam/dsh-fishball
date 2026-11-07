/**
 * P6 W3 (interrupted), W7, W8 on H-STUB: watches across restarts, catch-up while no instance is
 * attached or the connector row was not running, targets that disappear, a notice that meets a full
 * queue, and the no-instance queue (DESIGN.md §5c "Catch-up after restart", "One rule, every
 * trigger", "Target gone", "When Fishball is not running"; §11 start order step 5; contract §4.5,
 * §9; connector.md C1-EP-03, C1-P-06; slim §5.2 "Child down: queue, never refuse").
 * "Fishball archived" of the old cases is now "no instance attached": the connector row keeps
 * watching, and what it queued reaches the next instance (contract §9).
 *
 * | id     | technique | requirement | expected |
 * |--------|-----------|-------------|----------|
 * | DWT-01 | ST (active watch –restart→) | DESIGN §5c, §11 | the same watch is listed active after the restart; it still fires once (the answer of the turn after the restart); closed |
 * | DWT-02 | ST (no instance → target finishes → attach) | DESIGN §5c "reported once it is live again"; contract §9 | exactly one notice after the attach, with that answer; closed |
 * | DWT-03 | ST (repeat watch; no instance → target turn ends → DSH restart → attach → another restart → attach) | DESIGN §5c catch-up, dedupe `watch:<id>:<seq>`; contract §4.5 | one notice after the first catch-up; nothing pushed again for it after the second restart |
 * | DWT-04 | ST (repeat watch; two target turns with no instance → attach) | DESIGN §5c "each turn end in order" for repeat | two notices, in order, each with the answer as of its own turn end; still active |
 * | DWT-06 | ST (once; DSH booted with the connector row off → 3 target turns, the last ending max-tokens → row on again) | DESIGN §5c "finished fires only for the last turn end" | one notice, for the last turn end: its answer and reason max-tokens; closed |
 * | DWT-06b | ST (once; no instance, the row running → 3 settled turns → attach) | DESIGN §5c "as of the turn end the watch saw" | exactly one notice (which turn it reports is a diagnostic) |
 * | DWT-05 | ST (target files deleted while DSH is down → restart) | DESIGN §5c "Target gone" | session.watches shows target-missing; no notice |
 * | INT-01 | ST (target's turn running → DSH killed → restart → the target's log is closed 'interrupted') | DESIGN §5c "`interrupted` (a crash) does not count" | no notice for the interrupted end; the watch stays active |
 * | QFL-01 | ST (maxQueuedInputs 1, one unacked item → target finishes → DSH restart → attach) | DESIGN §5c "keeps the watermark"; contract §9 | the notice is not lost: exactly one notice arrives after the restart |
 * | C1-EP-03 | EP (finished notice, no instance) | connector.md C1-EP-03; contract §9 | message_fishball with notify_when_finished is ok and queued; after the attach the finished notice (`watch`) is delivered once, after `m1` (`session`) |
 * | C1-P-06 | P (global arrival order) | connector.md C1-P-06; contract §9 | Hand over with note n1, then m1 with the flag, then the turn ends, then attach: `user` (n1 outside the untrusted block), `session` (m1), `watch`, each once |
 * | NIA-01 | ST (delivered → detach → attach) | contract §4.5, §9 "delivered once" | an acked notice is not pushed again after a reconnect |
 *
 * Retired: none (every old case has its no-instance or restart form above).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { LIMITS } from './support/constants.mjs'
import { HOOK, deleteSession, messageFishball, untrustedBlock } from './support/expect.mjs'
import { bootHost } from './support/host.mjs'
import { KIND, STUB, bootStub, managedSession, quietPushes, stopStub, stubEnv, userSession } from './support/instance-stub.mjs'
import { sleep, until } from './support/util.mjs'
import {
  WATCHES, allPushes, answerTurn, attachReady, crashKeeping, noticeBlock, noticePushes, noticesSettled, restartKeeping, setLimit, tok, watchEntry, watched,
} from './support/instance-stub-watches.mjs'

const { mode: WMODE, status: WSTATUS, reason: REASON } = WATCHES
const LONG = WATCHES.longCase
const catchUp = (extra = {}) => ({ timeoutMs: WATCHES.catchUpMs, ...extra })

describe('P6 watches across restarts and without an instance (H-STUB)', () => {
  let booted
  /** Every push the stubs of earlier hosts of this home received (a restart starts a new journal). */
  const history = []
  const host = () => booted.host
  const stub = () => booted.stub
  /** Restart DSH on the same home; attach: false leaves the new host with no instance. */
  const restart = async (opts = {}) => { booted = await restartKeeping(booted, history, opts) }
  /** Three settled turns of the target; the last ends max-tokens. Returns the answers. */
  async function threeTurns(sid) {
    const answers = [await answerTurn(host(), sid, 'dwt06a'), await answerTurn(host(), sid, 'dwt06b'), tok('dwt06c')]
    await host().call('drive', { sessionId: sid, script: [[{ text: answers[2], finish: 'max-tokens' }]] })
    await host().call('flush', { sessionId: sid })
    return answers
  }

  before(async () => { booted = await bootStub('watch-durable') }, HOOK)
  after(() => stopStub(booted), HOOK)

  it('DWT-01 an active watch survives a restart and still fires once', LONG, async () => {
    const { sid, watchId } = await watched(host(), stub(), 'd-01')
    const listed = await watchEntry(stub(), watchId)
    await restart()
    assert.deepEqual(await watchEntry(stub(), watchId), listed, 'the same watch after the restart')
    await host().call('resume', { sessionId: sid })
    const answer = await answerTurn(host(), sid, 'dwt01')
    const got = await noticesSettled(stub(), watchId, 1, { history })
    assert.equal(got.length, 1)
    assert.equal(noticeBlock(got[0]).fields.last_answer, answer)
    assert.equal((await watchEntry(stub(), watchId)).status, WSTATUS.closed)
  })

  it('DWT-02 a target that finished while no instance was attached gives one notice after the attach', LONG, async () => {
    const { sid, watchId } = await watched(host(), stub(), 'd-02')
    await stub().detach()
    const answer = await answerTurn(host(), sid, 'dwt02')
    await sleep(STUB.quietMs)
    await attachReady(stub())
    const got = await noticesSettled(stub(), watchId, 1, catchUp({ history }))
    assert.equal(got.length, 1, 'one notice after the attach')
    assert.equal(noticeBlock(got[0]).fields.last_answer, answer)
    assert.equal((await watchEntry(stub(), watchId)).status, WSTATUS.closed)
  })

  it('DWT-06 several turns while the connector row was not running give ONE notice, for the last turn end', LONG, async () => {
    const { sid, watchId } = await watched(host(), stub(), 'd-06-off')
    history.push(...(await allPushes(stub())))
    await host().stop()
    // The connector bundle is not selected on this boot: nothing of the connector runs while the target works.
    const off = await bootHost(booted.home, { env: stubEnv({ FBTEST_PLUGIN: 'off' }) })
    booted = { ...booted, host: off }
    await off.call('resume', { sessionId: sid })
    const answers = await threeTurns(sid)
    assert.equal((await off.call('lastTurnEnd', { sessionId: sid }))?.kind, REASON.maxTokens, 'precondition: the last turn ended max-tokens')
    await off.stop()
    booted = await bootStub('watch-durable-on', { home: booted.home })
    const got = await noticesSettled(stub(), watchId, 1, catchUp({ history, quietMs: WATCHES.longQuietMs }))
    assert.equal(got.length, 1, 'one notice, not one per turn')
    assert.equal(noticeBlock(got[0]).fields.last_answer, answers[2])
    assert.ok(got[0].text.includes(JSON.stringify(REASON.maxTokens)), 'the last turn end is reported: ' + got[0].text.slice(0, 200))
    assert.equal((await watchEntry(stub(), watchId)).status, WSTATUS.closed)
  })

  it('DWT-06b several settled turns while no instance is attached (row running) give ONE notice', LONG, async (t) => {
    const { sid, watchId } = await watched(host(), stub(), 'd-06-noinst')
    await stub().detach()
    const answers = await threeTurns(sid)
    await attachReady(stub())
    const got = await noticesSettled(stub(), watchId, 1, catchUp({ history, quietMs: WATCHES.longQuietMs }))
    assert.equal(got.length, 1, 'one notice, not one per turn')
    // The row keeps watching with no instance, so the first settled turn end already counts (A69).
    const which = answers.indexOf(noticeBlock(got[0]).fields.last_answer)
    t.diagnostic('the notice reports turn ' + (which + 1) + ' of 3')
    assert.ok(which >= 0)
  })

  it('DWT-03 a missed turn end caught up after a full DSH restart is noticed once, and not again after another restart', LONG, async () => {
    const { sid, watchId } = await watched(host(), stub(), 'd-03', WMODE.repeat)
    await stub().detach()
    await answerTurn(host(), sid, 'dwt03')
    await host().call('flush', { sessionId: sid })
    await restart({ attach: false })
    await attachReady(stub())
    assert.equal((await noticesSettled(stub(), watchId, 1, catchUp({ history }))).length, 1, 'caught up once')
    await restart()
    await sleep(WATCHES.longQuietMs)
    assert.equal((await noticePushes(stub(), watchId, history)).length, 1, 'never pushed twice for the same turn end')
  })

  it('DWT-04 a repeat watch catches up one notice per missed turn end, in order', LONG, async () => {
    const { sid, watchId } = await watched(host(), stub(), 'd-04', WMODE.repeat)
    await stub().detach()
    const answers = [await answerTurn(host(), sid, 'dwt04a'), await answerTurn(host(), sid, 'dwt04b')]
    await attachReady(stub())
    const got = await noticesSettled(stub(), watchId, answers.length, catchUp({ history }))
    assert.deepEqual(got.map((n) => noticeBlock(n).fields.last_answer), answers, 'each notice has the answer as of its own turn end, in order')
    assert.equal((await watchEntry(stub(), watchId)).status, WSTATUS.active)
  })

  it('DWT-05 a target whose files are gone becomes target-missing at catch-up', LONG, async () => {
    const { sid, watchId } = await watched(host(), stub(), 'd-05')
    history.push(...(await allPushes(stub())))
    await host().stop()
    assert.ok(deleteSession(booted.home, sid).length > 0, 'precondition: its files existed')
    booted = await bootStub('watch-durable-missing', { home: booted.home })
    const missing = await until(async () => (await watchEntry(stub(), watchId))?.status === WSTATUS.targetMissing, WATCHES.catchUpMs, STUB.pollMs)
    assert.ok(missing, 'got ' + (await watchEntry(stub(), watchId))?.status)
    assert.equal((await noticesSettled(stub(), watchId, 0, { history })).length, 0)
  })

  it('INT-01 a turn closed as interrupted after a crash never fires', LONG, async (t) => {
    const { sid, watchId } = await watched(host(), stub(), 'i-01', WMODE.repeat)
    await host().call('holdNext', { sessionId: sid })
    await host().call('driveStart', { sessionId: sid, text: 'crash in the middle' })
    assert.ok(await until(() => host().call('isHeld', { sessionId: sid }), STUB.waitMs, STUB.pollMs))
    await host().call('flush', { sessionId: sid })
    booted = await crashKeeping(booted, history)
    await host().call('resume', { sessionId: sid })
    const ends = await host().call('turnEnds', { sessionId: sid })
    t.diagnostic('turn ends after the crash: ' + JSON.stringify(ends))
    assert.equal(ends.at(-1), REASON.interrupted, 'precondition: the open turn is closed interrupted')
    assert.equal((await noticesSettled(stub(), watchId, 0, { history, quietMs: WATCHES.longQuietMs })).length, 0, 'no notice for interrupted')
    assert.equal((await watchEntry(stub(), watchId)).status, WSTATUS.active)
  })

  it('QFL-01 a notice due while the queue is full is not lost across a restart', LONG, async () => {
    const { sid, watchId } = await watched(host(), stub(), 'q-01')
    const sender = await managedSession(host(), 'q-01-sender')
    await quietPushes(stub())
    await setLimit(host(), { maxQueuedInputs: 1 })
    try {
      // One pushed but unacked item counts toward the bound (contract §9): the queue is full.
      await stub().ackPolicy(0)
      const fill = tok('qfill')
      assert.equal((await messageFishball(host(), sender, { message: fill })).json?.ok, true, 'fills the queue')
      assert.ok(await stub().waitPush(fill), 'precondition: pushed and not acked')
      const answer = await answerTurn(host(), sid, 'qfl01')
      await host().call('flush', { sessionId: sid })
      assert.equal((await noticesSettled(stub(), watchId, 0, { history })).length, 0, 'not delivered while full')
      await setLimit(host(), { maxQueuedInputs: LIMITS.maxQueuedInputs.default })
      await restart()
      const got = await noticesSettled(stub(), watchId, 1, catchUp({ history }))
      assert.equal(got.length, 1, 'exactly one notice arrives later')
      assert.equal(noticeBlock(got[0]).fields.last_answer, answer)
    } finally {
      await stub().ackPolicy(null)
      await setLimit(host(), { maxQueuedInputs: LIMITS.maxQueuedInputs.default })
    }
  })

  describe('no instance: the queued finished notice (contract §9)', () => {
    /** The kinds of the pushes of the newest attachment whose text contains any needle, in push order. */
    const kindsOf = async (needles) => (await stub().pushes()).map((f) => f.payload).filter((p) => needles.some((n) => p.text.includes(n)))

    let delivered
    it('C1-EP-03 message_fishball with the flag and no instance: the notice is delivered once after the attach, after m1', LONG, async () => {
      const sid = await managedSession(host(), 'c1-ep-03')
      await quietPushes(stub())
      await stub().detach()
      const m1 = tok('m1')
      const { json } = await messageFishball(host(), sid, { message: m1, notify_when_finished: true })
      assert.equal(json?.ok, true, JSON.stringify(json))
      assert.ok(json.watch?.id, 'a watch: ' + JSON.stringify(json))
      await sleep(STUB.quietMs)
      await attachReady(stub())
      await noticesSettled(stub(), json.watch.id, 1, catchUp({ history }))
      const got = await kindsOf([m1, json.watch.id])
      assert.deepEqual(got.map((p) => p.kind), [KIND.session, KIND.watch], 'm1, then the notice, each once')
      delivered = { watchId: json.watch.id }
    })

    it('NIA-01 an acked notice is not pushed again after a reconnect', LONG, async () => {
      assert.ok(delivered, 'precondition: C1-EP-03')
      await quietPushes(stub())
      await stub().detach()
      await attachReady(stub())
      await sleep(WATCHES.longQuietMs)
      assert.equal((await stub().pushes()).filter((f) => f.payload.text.includes(delivered.watchId)).length, 0, 'nothing for it on the new attachment')
    })

    it('C1-P-06 the note, m1 and the finished notice arrive in arrival order, each once', LONG, async () => {
      const sid = await userSession(host(), 'c1-p-06')
      await quietPushes(stub())
      await stub().detach()
      const n1 = tok('n1')
      assert.equal((await host().post(WATCHES.sendRoute, { sessionId: sid, note: n1 })).status, 200, 'Hand over with a note')
      const m1 = tok('m1')
      const { json } = await messageFishball(host(), sid, { message: m1, notify_when_finished: true })
      assert.equal(json?.ok, true, JSON.stringify(json))
      await sleep(STUB.quietMs)
      await attachReady(stub())
      await noticesSettled(stub(), json.watch.id, 1, catchUp({ history }))
      const got = await kindsOf([n1, m1, json.watch.id])
      assert.deepEqual(got.map((p) => p.kind), [KIND.user, KIND.session, KIND.watch])
      const note = untrustedBlock(got[0].text)
      assert.ok((note ? note.header : got[0].text).includes(n1), 'n1 is outside the untrusted block')
    })
  })
})
