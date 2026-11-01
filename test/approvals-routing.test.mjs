/**
 * P7 routing: requests that bypass Fishball (P7 a-d) and Fishball stopping while requests wait (P12).
 * Same harness as approvals-broker.test.mjs (FBTEST_APPROVER_AFTER=1: the scripted answerer stands in
 * for the browser prompt after the broker). One host; the cases run in order.
 *
 * | id      | technique | req | expected |
 * |---------|-----------|-----|----------|
 * | RTE-01 ×2 | EP (Fishball's own request: set_plugin_enabled with unchecked tools, add_plugin) | P7a; rev11f | CHANGED by rev11f (DESIGN §7a.11): the stock prompt is NOT asked for Fishball's session; the call returns waiting-for-approval at once and a card of Fishball's session is in the pile; still no request message for Fishball and not in state.approvals |
 * | RTE-02 | BVA (maxPendingApprovals 2, Fishball busy: 1 pending → routed) | P7c | a request message; pending 2 |
 * | RTE-03 | BVA (2 pending = limit → bypass) | P7c | the next answerer is asked at once (< 1 s); no request message; not recorded |
 * | RTE-04 | BVA (maxQueuedInputs 1, queue full) | P7d | bypass: at once, no request message, not recorded |
 * | RTE-05 | ST (requests waiting –archive Fishball→) | P12 | each waiting request goes to the next answerer at once (well before the 120 s answer time); audit answer timeout |
 * | RTE-06 | EP (Fishball archived, not live) | P7b | bypass: at once, no request message |
 * | RTE-07 | ST (archived –unarchive + retry→ live) | P7b | requests reach Fishball again |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ADDED_BUNDLE, APPROVER_AFTER_ENV, ASK_REASON, ASK_TOOL, FIXTURE_BUNDLE, LIMITS, OUTCOME, PRESET, STATUS } from './support/constants.mjs'
import { HOOK, T, approvalsNow, askSettled, fishballCall, messageFishball, requestMessages, settledIdle, startAsk, turn, waitRequest, makeManaged } from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'RTE' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
/** A bypass reaches the next answerer at once; a routed request would wait for Fishball first. */
const AT_ONCE_MS = 1000

describe('P7 routing and bypass', () => {
  let host
  let fb
  const sessions = []
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const seenFor = async (text) => (await host.call('approvals', {})).filter((a) => a.reason === ASK_REASON(text))
  const recentKeys = async () => ((await approvalsNow(host))?.recent ?? []).map((r) => r.key)
  async function session(folder) {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await turn(host, sid, [[{ text: 'hello' }]], 'first words')
    // rev11a: only a managed session's permission requests reach Fishball (DESIGN §7a.1).
    await makeManaged(host, fb, sid)
    sessions.push(sid)
    return sid
  }
  async function holdFishball() {
    await settledIdle(host, fb)
    await host.call('holdNext', { sessionId: fb })
    await host.call('driveStart', { sessionId: fb, text: 'busy turn' })
    assert.ok(await until(() => host.call('isHeld', { sessionId: fb }), 5000, 50), 'Fishball is held in a turn')
  }
  async function releaseFishball() { await host.call('releaseHold', { sessionId: fb }); await settledIdle(host, fb) }
  /** Ask from sid and expect the bypass: the next answerer is asked at once and Fishball gets no request. */
  async function expectBypass(sid, text) {
    const keys = await recentKeys()
    await startAsk(host, sid, ASK_TOOL, { text })
    const done = await askSettled(host, text, 5000)
    assert.equal(done.outcome, OUTCOME.reject, "the next answerer's outcome")
    const seen = await seenFor(text)
    assert.equal(seen.length, 1, 'the next answerer was asked once')
    assert.ok(seen[0].at - done.askedAt < AT_ONCE_MS, 'at once: ' + (seen[0].at - done.askedAt) + ' ms')
    await sleep(300)
    assert.deepEqual(await requestMessages(host, fb, text), [], 'no request message for Fishball')
    assert.deepEqual(await recentKeys(), keys, 'a bypassed request is not recorded')
    await settledIdle(host, sid)
  }
  async function cancelAll() {
    for (const a of await host.call('asks', {})) if (a.outcome === null) await host.call('cancel', { sessionId: a.sessionId })
    for (const sid of sessions) await settledIdle(host, sid)
  }

  before(async () => {
    host = await bootHost(newHome('approvals-route'), { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  describe('RTE-01 Fishball\'s own requests always go to the next answerer', () => {
    for (const [label, tool, args] of [
      ['set_plugin_enabled with unchecked tools', 'set_plugin_enabled', { plugin: FIXTURE_BUNDLE.name, on: true }],
      ['add_plugin', 'add_plugin', { spec: ADDED_BUNDLE.dir, reason: 'fbtest' }],
    ]) {
      it(label, T, async () => {
        const before = (await host.call('approvals', { sessionId: fb })).length
        const keys = await recentKeys()
        const msgs = (await requestMessages(host, fb)).length
        const { json } = await fishballCall(host, fb, tool, args)
        // rev11f: no stock prompt; the request is a card of Fishball's session and the call returned "waiting".
        assert.equal(json?.code, 'waiting-for-approval', 'a card, not a prompt: ' + JSON.stringify(json))
        const seen = (await host.call('approvals', { sessionId: fb })).slice(before)
        assert.deepEqual(seen, [], 'the stock prompt was not asked')
        const cards = ((await host.state()).pile ?? []).filter((c) => c.sessionId === fb && c.toolName === tool)
        assert.equal(cards.length, 1, 'one card in the pile: ' + JSON.stringify((await host.state()).pile))
        assert.equal((await requestMessages(host, fb)).length, msgs, 'Fishball got no request message')
        assert.deepEqual(await recentKeys(), keys, 'not recorded')
        await host.post('/api/fishball/requests/answer', { requestId: cards[0].requestId, decision: 'reject' })
      })
    }
  })

  it('RTE-02 maxPendingApprovals 2 with 1 pending: the next request is routed to Fishball', T, async () => {
    const s1 = await session('rte-1')
    const s2 = await session('rte-2')
    await session('rte-3')
    await setLimit({ maxPendingApprovals: 2 })
    await holdFishball()
    const t1 = tok('02a')
    await startAsk(host, s1, ASK_TOOL, { text: t1 })
    assert.ok(await until(async () => (await approvalsNow(host)).pending.length === 1, 5000, 50), 'one pending')
    const t2 = tok('02b')
    await startAsk(host, s2, ASK_TOOL, { text: t2 })
    assert.ok(await until(async () => (await approvalsNow(host)).pending.length === 2, 5000, 50), 'two pending')
    // Fishball is held inside a turn, so the request message waits in its inbox until the next step;
    // being pending (bypassed requests never are) and not at the next answerer shows it was routed.
    await sleep(AT_ONCE_MS)
    assert.deepEqual(await seenFor(t2), [], 'not at the next answerer')
  })

  it('RTE-03 maxPendingApprovals 2 with 2 pending: the next request bypasses Fishball', T, async () => {
    await expectBypass(sessions[2], tok('03'))
    assert.equal((await approvalsNow(host)).pending.length, 2)
    await cancelAll()
    await releaseFishball()
    await setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default })
  })

  it('RTE-04 Fishball\'s queue is full: the request bypasses Fishball', T, async () => {
    const [s1, s2] = sessions
    await setLimit({ maxQueuedInputs: 1 })
    await holdFishball()
    try {
      const m = await messageFishball(host, s1, { message: tok('04fill') })
      assert.equal(m.json?.ok, true, 'precondition: one queued input')
      const full = await messageFishball(host, s1, { message: tok('04full') })
      assert.equal(full.json?.code, 'queue-full', 'precondition: the queue is full')
      await expectBypass(s2, tok('04'))
    } finally {
      await releaseFishball()
      await setLimit({ maxQueuedInputs: LIMITS.maxQueuedInputs.default })
    }
  })

  it('RTE-05 Fishball archived while requests wait: each goes to the next answerer at once', T, async (t) => {
    const [s1, s2] = sessions
    const texts = [tok('05a'), tok('05b')]
    await startAsk(host, s1, ASK_TOOL, { text: texts[0] })
    await startAsk(host, s2, ASK_TOOL, { text: texts[1] })
    for (const text of texts) assert.ok(await waitRequest(host, fb, text), 'routed first')
    await settledIdle(host, fb)
    assert.equal((await approvalsNow(host)).pending.length, 2)
    const at = Date.now()
    const archived = await host.call('archive', { sessionId: fb, stopActivity: true })
    assert.equal(archived.ok, true, JSON.stringify(archived))
    for (const text of texts) {
      const done = await askSettled(host, text, 10000)
      assert.equal(done.outcome, OUTCOME.reject, "the next answerer's outcome")
      const seen = await seenFor(text)
      assert.equal(seen.length, 1)
      t.diagnostic(text + ' went on ' + (seen[0].at - at) + ' ms after the archive')
      assert.ok(seen[0].at - at < 5000, 'at once, not after the answer time')
    }
    const recent = (await approvalsNow(host))?.recent ?? []
    t.diagnostic('audit after archive: ' + JSON.stringify(recent.slice(0, 2).map((r) => [r.answer, r.finalOutcome])))
    for (const sid of [s1, s2]) assert.ok(recent.some((r) => r.sessionId === sid && r.answer === 'timeout' && r.finalOutcome === OUTCOME.reject), 'audit answer timeout for ' + sid)
    for (const sid of [s1, s2]) await settledIdle(host, sid)
  })

  it('RTE-06 Fishball not live (archived): a request bypasses Fishball', T, async () => {
    assert.equal((await host.state()).status, STATUS.archived)
    await expectBypass(sessions[0], tok('06'))
  })

  it('RTE-07 live again: requests reach Fishball again', T, async () => {
    await host.call('unarchive', { sessionId: fb })
    const r = await host.post('/api/fishball/recovery', { action: 'retry' })
    assert.equal(r.status, 200, r.text)
    await host.waitStatus(STATUS.live)
    await settledIdle(host, fb)
    const text = tok('07')
    await startAsk(host, sessions[0], ASK_TOOL, { text })
    assert.ok(await waitRequest(host, fb, text), 'routed to Fishball')
    await cancelAll()
  })
})
