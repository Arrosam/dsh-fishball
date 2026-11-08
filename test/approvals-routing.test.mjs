/**
 * P7 routing on the H-STUB harness: requests that bypass the instance (P7 a-d; DESIGN §7a.1, §7a.5, §7a.6 "Cap";
 * contract §5.1, §9) and the instance going away while requests wait (P12; connector.md C1-EP-05, C1-ST-08,
 * K1-P-16). FBTEST_APPROVER_AFTER=1: the scripted stock prompt sits after the broker. One host; cases run in order.
 *
 * | id      | technique | req | expected |
 * |---------|-----------|-----|----------|
 * | RTE-02 | BVA (maxPendingApprovals 2, 1 waiting → routed) | §7a.6 Cap | the second request is offered to the instance; 2 listed; not at the stock prompt |
 * | RTE-03 | BVA (2 waiting = limit → bypass) | §7a.1 "over the cap → pass-through" | the stock prompt at once (< 1 s); no offer, no notice; not audited |
 * | RTE-04 | BVA (maxQueuedInputs 1, queue full) | §7a.6 "a notice that cannot be delivered", contract §9 | the stock prompt at once; never offered as a live request (approval.list empty); audited once (`to-user`) |
 * | RTE-05 ×2 | ST (requests waiting –detach / onClose→) | §7a.5, contract §5.1, C1-ST-08 | each waiting request goes to its own stock prompt at once (well before the 120 s answer time); no longer offered; audit names the release |
 * | RTE-06 | EP (no instance) | contract §9, C1-EP-05 | the stock prompt in under 1 s; no offer and no notice reach the instance after the next attach; it is never offered again |
 * | RTE-07 | ST (no instance –attach→ ready) | §7a.1 | requests reach the instance again |
 * | RTE-08 | ST (offered –detach, attach→) | K1-P-16 `[OQ-05]`, contract §5.1 | a request that went to the user's prompt at the detach is not offered again after the new handshake (§5.1 "never offered again"; K1-P-16's other reading is ruled out by conn-OQ-05) |
 *
 * Retired:
 * - RTE-01 ×2: Fishball's own requests (set_plugin_enabled, add_plugin) and their cards went with the in-process agent and its plugin tools (slim §12).
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import { ASK_REASON, LIMITS, OUTCOME } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { managedSession, messageFishball, quietPushes, stopStub } from './support/instance-stub.mjs'
import {
  APPROVALS, ackAllAndReconnect, auditOfSession, auditedFor, bootApprovals, clearSession, listed, offerFor, offersWhere, outcomeOf, requestFor, setLimit, startCall, stockFor, tok, untilStock,
} from './support/instance-stub-approvals.mjs'
import { sleep } from './support/util.mjs'

describe('P7 routing and bypass (H-STUB)', () => {
  let booted
  let host
  let stub
  const sessions = []
  const offered = async (text) => offersWhere(stub, (d) => d.reason === ASK_REASON(text))
  const noticed = async (text) => (await stub.pushTexts(ASK_REASON(text)))

  /** Ask from sid and expect the bypass: the stock prompt at once and the instance gets no live request. */
  async function expectBypass(sid, text) {
    const t0 = Date.now()
    await startCall(host, sid, { text })
    const seen = await untilStock(host, text)
    assert.equal(seen.length, 1, 'the stock prompt was asked once')
    assert.ok(seen[0].at - t0 < APPROVALS.ms.atOnce, 'at once: ' + (seen[0].at - t0) + ' ms')
    assert.equal((await outcomeOf(host, text)).outcome, APPROVALS.stock.default, "the stock prompt's outcome")
    await clearSession(host, sid)
  }
  async function clearAll() { for (const sid of sessions) await clearSession(host, sid) }

  before(async () => {
    booted = await bootApprovals('approvals-route')
    ;({ host, stub } = booted)
    for (const folder of ['rte-1', 'rte-2', 'rte-3']) sessions.push(await managedSession(host, folder))
  }, HOOK)
  after(() => stopStub(booted), HOOK)
  afterEach(clearAll, HOOK)

  it('RTE-02 maxPendingApprovals 2 with 1 waiting: the next request is offered to the instance', T, async () => {
    const [s1, s2] = sessions
    await setLimit(host, { maxPendingApprovals: 2 })
    const t1 = tok('02a')
    await requestFor(booted, s1, t1)
    const t2 = tok('02b')
    const second = await requestFor(booted, s2, t2)
    assert.equal(second.sessionId, s2)
    assert.equal((await listed(stub, s1)).length + (await listed(stub, s2)).length, 2, 'two waiting for the instance')
    await sleep(APPROVALS.ms.atOnce)
    assert.deepEqual(await stockFor(host, t2), [], 'not at the stock prompt')
  })

  it('RTE-03 maxPendingApprovals 2 with 2 waiting: the next request bypasses the instance', T, async () => {
    const [s1, s2, s3] = sessions
    try {
      await requestFor(booted, s1, tok('03a'))
      await requestFor(booted, s2, tok('03b'))
      const text = tok('03')
      await expectBypass(s3, text)
      await sleep(APPROVALS.ms.quiet)
      assert.deepEqual(await offered(text), [], 'no offer')
      assert.deepEqual(await noticed(text), [], 'no notice')
      assert.deepEqual(auditOfSession(booted.home, s3), [], 'a bypassed request is not recorded')
    } finally { await setLimit(host, { maxPendingApprovals: LIMITS.maxPendingApprovals.default }) }
  })

  it('RTE-04 the connector\'s queue is full: the request goes to the user at once', T, async (t) => {
    const [s1, s2] = sessions
    // A push from the previous case's cleanup can still be waiting for its ack; freezing acks now
    // would drop that ack and leave the row open, filling the one-item queue before the fill.
    await quietPushes(stub)
    await setLimit(host, { maxQueuedInputs: 1 })
    // An unacknowledged item stays open, so it fills the one-item queue (contract §9 counts pushed-but-unacked items).
    await stub.ackPolicy(0)
    try {
      const fill = await messageFishball(host, s1, { message: tok('04fill') })
      assert.equal(fill.json?.ok, true, 'precondition: one queued input: ' + JSON.stringify(fill.json))
      const text = tok('04')
      const auditBefore = auditOfSession(booted.home, s2).length
      await expectBypass(s2, text)
      assert.deepEqual(await listed(stub, s2), [], 'never offered as a live request')
      // The design does not say whether the event is still sent for a request that goes to the user at once; recorded only.
      t.diagnostic('approval.request events for it: ' + (await offered(text)).length)
      // rev11e (DESIGN §7a.6, §16 manager's decision): a notice that cannot be delivered is audited once.
      assert.equal(auditOfSession(booted.home, s2).length - auditBefore, 1, 'an undelivered request is recorded once')
    } finally {
      await setLimit(host, { maxQueuedInputs: LIMITS.maxQueuedInputs.default })
      await ackAllAndReconnect(stub)
    }
  })

  for (const [label, end] of [['detach', (s) => s.detach()], ['the transport closes (onClose)', (s) => s.fireClose()]]) {
    it('RTE-05 the instance goes away while requests wait (' + label + '): each goes to its own prompt at once', T, async (t) => {
      const [s1, s2] = sessions
      const texts = [tok('05a'), tok('05b')]
      const reqs = [await requestFor(booted, s1, texts[0]), await requestFor(booted, s2, texts[1])]
      const at = Date.now()
      await end(stub)
      try {
        for (const text of texts) {
          const seen = await untilStock(host, text)
          assert.equal(seen.length, 1)
          t.diagnostic(text + ' went on ' + (seen[0].at - at) + ' ms after the end')
          assert.ok(seen[0].at - at < APPROVALS.ms.atOnce * 5, 'at once, not after the answer time')
          assert.equal((await outcomeOf(host, text)).outcome, APPROVALS.stock.default)
        }
        for (const req of reqs) assert.ok((await auditedFor(booted.home, req.descriptor.approvalId))[0]?.finalOutcome, 'audited with its outcome')
      } finally {
        const a = await stub.attach()
        assert.ok(a.ok, 'reattach')
      }
      for (const req of reqs) assert.equal((await listed(stub, req.sessionId)).some((d) => d.approvalId === req.descriptor.approvalId), false, 'not offered after the reattach')
    })
  }

  it('RTE-06 no instance attached: a request goes to the user in its session at once, and is never offered later', T, async () => {
    const [s1] = sessions
    await stub.detach()
    const text = tok('06')
    try { await expectBypass(s1, text) } finally {
      const a = await stub.attach()
      assert.ok(a.ok, 'reattach')
    }
    await sleep(APPROVALS.ms.quiet)
    assert.deepEqual(await offered(text), [], 'no approval.request after the attach')
    assert.deepEqual(await noticed(text), [], 'no approval inbox item after the attach')
    assert.deepEqual(await listed(stub, s1), [])
  })

  it('RTE-07 attached again: requests reach the instance again', T, async () => {
    const text = tok('07')
    const req = await requestFor(booted, sessions[0], text)
    assert.equal(req.sessionId, sessions[0])
  })

  it('RTE-08 a request offered before a detach is not offered again after the new handshake', T, async () => {
    const [s1] = sessions
    // Hold the stock prompt open, so the request is still showing in its session when the new instance attaches.
    await host.call('setApprover', { outcome: APPROVALS.stock.hold })
    try {
      const text = tok('08')
      const req = await requestFor(booted, s1, text)
      await stub.detach()
      await untilStock(host, text)
      const a = await stub.attach()
      assert.ok(a.ok, 'reattach')
      await sleep(APPROVALS.ms.quiet)
      assert.deepEqual(await offerFor(stub, text, { timeoutMs: 0 }), undefined, 'not offered on the new channel')
      assert.deepEqual(await listed(stub, s1), [], 'not listed')
      assert.equal((await host.call('asks', {})).find((e) => e.text === text).outcome, null, 'still waiting at the stock prompt')
      assert.equal(await host.call('releaseApproval', { outcome: OUTCOME.allow }), true)
      assert.equal((await outcomeOf(host, text)).outcome, OUTCOME.allow, 'the user answered it in the session')
      assert.ok(req)
    } finally { await host.call('setApprover', { outcome: APPROVALS.stock.default }) }
  })
})
