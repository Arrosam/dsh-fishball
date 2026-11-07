/**
 * P6 W3 (interrupted), W7, W8: watches across restarts, catch-up while Fishball was down, targets
 * that disappear, and a notice that meets a full queue. Requirements in CASES.md (P6 cases).
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | DWT-01 | ST (active watch –restart→) | W7 | the watch is still active with the same fields; it still fires once after the restart |
 * | DWT-02 | ST (Fishball archived → target finishes → unarchive + retry → live) | W7 | exactly one notice after Fishball is live again |
 * | DWT-03 | ST (per-turn watch; Fishball archived → target turn ends → DSH restart → live → another restart) | W7 | one notice after the first catch-up; none for the same turn end after the second restart; firedCount 1 |
 * | DWT-06 | ST (finished once; DSH booted with the Fishball row off → 3 target turns, the last ending max-tokens → row on again) | W3/W7 review | one notice for the last turn end: last_answer of the 3rd turn, lastReason max-tokens; closed |
 * | DWT-06b | ST (same, but Fishball archived with its row running) | W3/W7 review | one notice (which turn it reports is a diagnostic, A69) |
 * | DWT-04 | ST (per-turn watch; two target turns while Fishball is archived → live) | W7, re-review | one notice per missed turn end, in order, each with the answer as of that turn end |
 * | DWT-05 | ST (target files deleted while DSH is down → restart) | W7 | the watch becomes target-missing; no notice |
 * | INT-01 | ST (target's turn running → DSH killed → restart → the target's log is closed 'interrupted') | W3 | no notice for the interrupted end; the watch stays active |
 * | QFL-01 | ST (maxQueuedInputs 1 and the queue full while Fishball is held → target finishes → release, restart) | W8 | the notice is not lost: exactly one notice arrives later (diagnostic: when) |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, LIMITS, MS, PRESET, STATUS, WATCH_API, WATCH_STATUS, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, makeManaged, deleteSession, fishballCall, intakeNow, messageFishball, noticesSettled, settledIdle, turn, untrustedBlock, watchById, watchNotices, watchesOn } from './support/expect.mjs'
import { bootHost, bootLive, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'TOK' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 8)
const LONG = { timeout: 150000 }

describe('P6 watches across restarts', { skip: NEEDS_INSTANCE_STUB }, () => {
  let host
  let home
  let fb
  const ordinary = async (folder) => (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  async function reboot(resume = []) {
    await host.stop()
    host = await bootHost(home)
    const st = await host.waitStatus([STATUS.live, STATUS.archived, STATUS.recovery, STATUS.failed], MS.boot)
    for (const sessionId of resume) await host.call('resume', { sessionId })
    return st
  }
  async function userWatch(sid) {
    assert.equal((await host.post(WATCH_API.add, { sessionId: sid })).status, 200)
    return (await watchesOn(host, sid)).find((w) => w.status === WATCH_STATUS.active)
  }
  async function toolWatch(args) {
    const { json } = await fishballCall(host, fb, 'watch_session', args)
    assert.equal(json?.ok, true, JSON.stringify(json))
    return json.watch
  }
  async function archiveFishball() {
    await settledIdle(host, fb)
    assert.equal((await host.call('archive', { sessionId: fb, stopActivity: true })).ok, true)
    await host.waitStatus(STATUS.archived)
  }
  async function revive() {
    await host.call('unarchive', { sessionId: fb })
    assert.equal((await host.post(API.recovery, { action: 'retry' })).status, 200)
    assert.equal((await host.waitStatus(STATUS.live))?.status, STATUS.live)
  }

  before(async () => {
    home = newHome('watch-durable')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    await setLimit({ wakeupsPerHour: 0 })
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('DWT-01 an active watch survives a restart and still fires once', LONG, async () => {
    const sid = await ordinary('d-01')
    await turn(host, sid, [[{ text: 'warm-up' }]])
    const w = await userWatch(sid)
    assert.equal((await reboot([sid]))?.status, STATUS.live)
    assert.deepEqual(await watchById(host, w.id), w, 'same watch after the restart')
    const answer = tok('dwt01')
    await turn(host, sid, [[{ text: answer }]])
    const got = await noticesSettled(host, fb, w.id, 1)
    assert.equal(got.length, 1)
    assert.equal(untrustedBlock(got[0].text).fields.last_answer, answer)
    assert.equal((await watchById(host, w.id)).status, WATCH_STATUS.closed)
  })

  it('DWT-02 a target that finished while Fishball was archived gives one notice once it is live', LONG, async () => {
    const sid = await ordinary('d-02')
    await turn(host, sid, [[{ text: 'warm-up' }]])
    const w = await userWatch(sid)
    await archiveFishball()
    const answer = tok('dwt02')
    await turn(host, sid, [[{ text: answer }]])
    await sleep(1000)
    await revive()
    const got = await noticesSettled(host, fb, w.id, 1, { timeoutMs: 20000 })
    assert.equal(got.length, 1, 'one notice after Fishball is live')
    assert.equal(untrustedBlock(got[0].text).fields.last_answer, answer)
    assert.equal((await watchById(host, w.id)).status, WATCH_STATUS.closed)
  })

  /** Three settled turns of the target; the last ends max-tokens. Returns the answers. */
  async function threeTurns(sid) {
    const answers = [tok('dwt06a'), tok('dwt06b'), tok('dwt06c')]
    await turn(host, sid, [[{ text: answers[0] }]])
    await turn(host, sid, [[{ text: answers[1] }]])
    await host.call('drive', { sessionId: sid, script: [[{ text: answers[2], finish: 'max-tokens' }]] })
    await host.call('flush', { sessionId: sid })
    return answers
  }

  it('DWT-06 several turns while the Fishball row was not running (plugin off) give ONE notice, for the last turn end', LONG, async () => {
    const sid = await ordinary('d-06-down')
    await turn(host, sid, [[{ text: 'warm-up' }]])
    const w = await userWatch(sid)
    await host.stop()
    // The row is not selected: nothing of Fishball runs while the target works.
    host = await bootHost(home, { env: { FBTEST_PLUGIN: 'off' } })
    await host.call('resume', { sessionId: sid })
    const answers = await threeTurns(sid)
    assert.equal((await reboot())?.status, STATUS.live)
    const got = await noticesSettled(host, fb, w.id, 1, { timeoutMs: 20000, quietMs: 2500 })
    assert.equal(got.length, 1, 'one notice, not one per turn')
    assert.equal(untrustedBlock(got[0].text).fields.last_answer, answers[2])
    const now = await watchById(host, w.id)
    assert.equal(now.lastReason, 'max-tokens', 'the last turn end is reported')
    assert.equal(now.status, WATCH_STATUS.closed)
  })

  it('DWT-06b several settled turns while Fishball is archived (row running) give ONE notice', LONG, async (t) => {
    const sid = await ordinary('d-06-arch')
    await turn(host, sid, [[{ text: 'warm-up' }]])
    const w = await userWatch(sid)
    await archiveFishball()
    const answers = await threeTurns(sid)
    await revive()
    const got = await noticesSettled(host, fb, w.id, 1, { timeoutMs: 20000, quietMs: 2500 })
    assert.equal(got.length, 1, 'one notice, not one per turn')
    // The row keeps watching while Fishball is archived, so the first settled turn end already counts (A69).
    const which = answers.indexOf(untrustedBlock(got[0].text).fields.last_answer)
    t.diagnostic('the notice reports turn ' + (which + 1) + ' of 3, lastReason ' + (await watchById(host, w.id)).lastReason)
    assert.ok(which >= 0)
  })

  it('DWT-03 a missed turn end caught up after a full DSH restart is noticed once, and not again after another restart', LONG, async () => {
    const sid = await ordinary('d-03')
    await turn(host, sid, [[{ text: 'warm-up' }]])
    const w = await toolWatch({ session_id: sid, condition: 'per-turn', mode: 'repeat' })
    await archiveFishball()
    await turn(host, sid, [[{ text: tok('dwt03') }]])
    await host.call('flush', { sessionId: sid })
    const st = await reboot()
    assert.equal(st?.status, STATUS.archived)
    await revive()
    assert.equal((await noticesSettled(host, fb, w.id, 1, { timeoutMs: 20000 })).length, 1, 'caught up once')
    assert.equal((await reboot())?.status, STATUS.live)
    await sleep(2000)
    assert.equal((await noticesSettled(host, fb, w.id, 0)).length, 1, 'never twice for the same turn end')
    assert.equal((await watchById(host, w.id)).firedCount, 1)
  })

  it('DWT-04 a per-turn watch catches up one notice per missed turn end', LONG, async () => {
    const sid = await ordinary('d-04')
    await turn(host, sid, [[{ text: 'warm-up' }]])
    const w = await toolWatch({ session_id: sid, condition: 'per-turn', mode: 'repeat' })
    await archiveFishball()
    const answers = [tok('dwt04a'), tok('dwt04b')]
    for (const a of answers) await turn(host, sid, [[{ text: a }]])
    await revive()
    const got = await noticesSettled(host, fb, w.id, 2, { timeoutMs: 20000 })
    assert.equal(got.length, 2)
    assert.deepEqual(got.map((n) => untrustedBlock(n.text).fields.last_answer), answers, 'each notice has the answer as of its own turn end, in order')
    assert.equal((await watchById(host, w.id)).status, WATCH_STATUS.active)
  })

  it('DWT-05 a target whose files are gone becomes target-missing at catch-up', LONG, async () => {
    const sid = await ordinary('d-05')
    await turn(host, sid, [[{ text: 'warm-up' }]])
    const w = await userWatch(sid)
    await host.stop()
    assert.ok(deleteSession(home, sid).length > 0, 'precondition: its files existed')
    host = await bootHost(home)
    assert.equal((await host.waitStatus(STATUS.live, MS.boot))?.status, STATUS.live)
    const missing = await until(async () => (await watchById(host, w.id))?.status === WATCH_STATUS.targetMissing, 10000, 100)
    const others = (await host.state()).watches.watches.filter((x) => x.status === WATCH_STATUS.active).map((x) => x.id === w.id ? 'this' : x.targetSessionId)
    assert.ok(missing, 'got ' + (await watchById(host, w.id))?.status + '; active watches at catch-up: ' + JSON.stringify(others) + '; target header now: ' + JSON.stringify(await host.call('header', { sessionId: sid })))
    assert.equal((await watchNotices(host, fb, w.id)).length, 0)
  })

  it('INT-01 a turn closed as interrupted after a crash never fires', LONG, async (t) => {
    const sid = await ordinary('i-01')
    await turn(host, sid, [[{ text: 'warm-up' }]])
    const w = await toolWatch({ session_id: sid, condition: 'per-turn', mode: 'repeat' })
    await host.call('holdNext', { sessionId: sid })
    await host.call('driveStart', { sessionId: sid, text: 'crash in the middle' })
    assert.ok(await until(() => host.call('isHeld', { sessionId: sid }), 5000, 50))
    await host.call('flush', { sessionId: sid })
    await host.kill()
    host = await bootHost(home)
    assert.equal((await host.waitStatus(STATUS.live, MS.boot))?.status, STATUS.live)
    await host.call('resume', { sessionId: sid })
    const ends = await host.call('turnEnds', { sessionId: sid })
    t.diagnostic('turn ends after the crash: ' + JSON.stringify(ends))
    assert.equal(ends.at(-1), 'interrupted', 'precondition: the open turn is closed interrupted')
    await sleep(2500)
    await settledIdle(host, fb)
    assert.equal((await watchNotices(host, fb, w.id)).length, 0, 'no notice for interrupted')
    const now = await watchById(host, w.id)
    assert.equal(now.status, WATCH_STATUS.active)
    assert.equal(now.firedCount, 0)
  })

  it('QFL-01 a notice due while the queue is full is not lost', LONG, async (t) => {
    const sid = await ordinary('q-01')
    const sender = await ordinary('q-01-sender')
    await makeManaged(host, fb, sender) // rev11a: only a managed session has message_fishball
    await turn(host, sid, [[{ text: 'warm-up' }]])
    const w = await userWatch(sid)
    await settledIdle(host, fb)
    await setLimit({ maxQueuedInputs: 1 })
    try {
      await host.call('holdNext', { sessionId: fb })
      await host.call('driveStart', { sessionId: fb, text: 'held turn' })
      assert.ok(await until(() => host.call('isHeld', { sessionId: fb }), 5000, 50))
      assert.equal((await messageFishball(host, sender, { message: tok('qfill') })).json?.ok, true, 'fills the queue')
      assert.equal((await intakeNow(host)).queued, 1)
      await turn(host, sid, [[{ text: tok('qfl01') }]])
      await sleep(1500)
      t.diagnostic('while full: ' + JSON.stringify(await watchById(host, w.id)))
      assert.equal((await watchById(host, w.id)).firedCount, 0, 'not fired while full')
      await host.call('releaseHold', { sessionId: fb })
      await settledIdle(host, fb)
      await sleep(2000)
      const afterRelease = (await watchNotices(host, fb, w.id)).length
      t.diagnostic('notices after the queue drained, before a restart: ' + afterRelease)
      await setLimit({ maxQueuedInputs: LIMITS.maxQueuedInputs.default })
      if (afterRelease === 0) assert.equal((await reboot())?.status, STATUS.live)
      const got = await noticesSettled(host, fb, w.id, 1, { timeoutMs: 20000 })
      assert.equal(got.length, 1, 'exactly one notice arrives later')
    } finally {
      await host.call('releaseHold', { sessionId: fb }).catch(() => {})
      await setLimit({ maxQueuedInputs: LIMITS.maxQueuedInputs.default }).catch(() => {})
    }
  })
})
