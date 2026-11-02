/**
 * Revision 10c (DESIGN §10d "Fishball's own plugins"): Permission requests switched off and on. Same harness as
 * approvals-routing.test.mjs (FBTEST_APPROVER_AFTER=1: the scripted answerer stands in for DSH's normal prompt
 * AFTER Fishball's broker). One host; cases run in order. Effects follow the APPLIED state only (coordinator's
 * correction): an off made while Fishball runs a turn takes effect at the idle-phase apply.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | OFA-01 | EP (precondition, on) | an ordinary session's request is routed to Fishball (a request message; pending 1) |
 * | OFA-02 | ST (pending request –user off while idle→) | the waiting request goes to the normal prompt at once (< 5 s); pending 0; features.approvals false; answer_approval plugin-off |
 * | OFA-03 | EP (new request while off) | goes straight to the normal prompt (< 1 s); no request message for Fishball |
 * | OFA-04 | EP (tools while off) | answer_approval absent from Fishball's request; a direct call is a tool error |
 * | OFA-05 | ST off -user on-> on | features.approvals true; requests reach Fishball again |
 * | OFA-06 | ST (pending request; user off while Fishball is held in a turn) | until the turn ends: features.approvals true, the request still waits, a new request is still routed to Fishball; after the turn: both go to the normal prompt and features.approvals is false |
 * | OFA-02/06 (note) | EP (released by the feature going off) | Fishball's next turn carries no "timed out" note for the released requests |
 * | OFA-07 | EP (control, feature on: approvalAnswerSeconds 1 runs out) | unchanged: the timed-out note naming the request is in Fishball's next turn |
 * | OFA-08 | ST (Fishball stops (archive) while a request waits → unarchive, retry) | unchanged from before revision 10c (baseline observed on 90a6a8c): released to the normal prompt; no timed-out note in Fishball's next turn |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ANSWER_TOOL, API, APPROVER_AFTER_ENV, APR_NOTE, ASK_REASON, LIMITS, ASK_TOOL, OUTCOME, OWN_PLUGINS, PRESET, STATUS, TOOL_STATUS } from './support/constants.mjs'
import {
  HOOK, T, approvalsNow, askSettled, callTool, catalogSettled, holdFishball, nextTools, requestMessages, settledIdle, startAsk, toolIn, turn, untilCatalog, pluginIn, waitRequest, makeManaged } from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'OFA' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const AT_ONCE_MS = 1000
const RELEASE_MS = 5000
const LONG = { timeout: 120000 }

describe('Revision 10c: Permission requests off', () => {
  const spec = OWN_PLUGINS.approvals
  let host
  let fb
  const sessions = []
  const seenFor = async (text) => (await host.call('approvals', {})).filter((a) => a.reason === ASK_REASON(text))
  const features = async () => (await host.state()).features
  const toggle = async (on) => {
    const r = await host.post(API.plugins, { plugin: spec.key, on })
    assert.equal(r.status, 200, r.text)
    return r
  }
  async function session(folder) {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await turn(host, sid, [[{ text: 'hello' }]], 'first words')
    // rev11a: only a managed session's permission requests reach Fishball (DESIGN §7a.1).
    await makeManaged(host, fb, sid)
    sessions.push(sid)
    return sid
  }
  /** Fishball's next turn: whether it carries the timed-out note for each request id (notes do not wake Fishball). */
  async function timeoutNotes(ids) {
    await settledIdle(host, fb)
    const texts = (await turn(host, fb, [[{ text: 'ok' }]], 'anything new?')).requests.at(-1).texts
    const events = (await host.call('inspect', { sessionId: fb, events: true })).events ?? []
    return ids.map((id) => texts.includes(APR_NOTE.timeout) && events.some((e) => e.type === 'user/message' && e.text.includes(id) && e.text.includes(APR_NOTE.timeout)))
  }
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  async function cancelAll() {
    for (const a of await host.call('asks', {})) if (a.outcome === null) await host.call('cancel', { sessionId: a.sessionId })
    for (const sid of sessions) await settledIdle(host, sid)
  }

  before(async () => {
    host = await bootHost(newHome('own-plugins-approvals'), { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
    await session('ofa-1')
    await session('ofa-2')
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  let waiting
  let waitingId
  it('OFA-01 precondition: with Permission requests on, a request is routed to Fishball', T, async () => {
    waiting = tok('01')
    await startAsk(host, sessions[0], ASK_TOOL, { text: waiting })
    const req = await waitRequest(host, fb, waiting)
    assert.ok(req?.id, 'a request message for Fishball')
    waitingId = req.id
    await settledIdle(host, fb)
    assert.equal((await approvalsNow(host)).pending.length, 1)
    assert.deepEqual(await seenFor(waiting), [], 'not at the normal prompt yet')
  })

  it('OFA-02 off while idle releases the waiting request to the normal prompt at once', T, async (t) => {
    const at = Date.now()
    await toggle(false)
    const done = await askSettled(host, waiting, 10000)
    assert.equal(done?.outcome, OUTCOME.reject, "the normal prompt's answer")
    const seen = await seenFor(waiting)
    assert.equal(seen.length, 1)
    t.diagnostic('released ' + (seen[0].at - at) + ' ms after the switch')
    assert.ok(seen[0].at - at < RELEASE_MS, 'at once, not after the answer time')
    assert.equal((await approvalsNow(host)).pending.length, 0)
    assert.equal((await features()).approvals, false)
    assert.equal(toolIn(await catalogSettled(host), spec.key, ANSWER_TOOL)?.status, TOOL_STATUS.pluginOff)
    await settledIdle(host, sessions[0])
    assert.deepEqual(await timeoutNotes([waitingId]), [false], 'no "timed out" note for a request released by the off')
  })

  it('OFA-03 a new request while off goes straight to the normal prompt', T, async () => {
    const text = tok('03')
    await startAsk(host, sessions[1], ASK_TOOL, { text })
    const done = await askSettled(host, text, 5000)
    assert.equal(done?.outcome, OUTCOME.reject)
    const seen = await seenFor(text)
    assert.equal(seen.length, 1)
    assert.ok(seen[0].at - done.askedAt < AT_ONCE_MS, 'at once: ' + (seen[0].at - done.askedAt) + ' ms')
    await sleep(300)
    assert.deepEqual(await requestMessages(host, fb, text), [], 'Fishball gets no request message')
    await settledIdle(host, sessions[1])
  })

  it('OFA-04 answer_approval is masked while off', T, async () => {
    assert.equal((await nextTools(host, fb)).includes(ANSWER_TOOL), false)
    const { result } = await callTool(host, fb, ANSWER_TOOL, { id: 'apr_0', answer: 'escalate', rationale: 'fbtest', risk: 'high' })
    assert.equal(result.isError, true, result.text)
  })

  it('OFA-05 on again: requests reach Fishball again', T, async () => {
    await toggle(true)
    await catalogSettled(host)
    assert.equal((await features()).approvals, true)
    const text = tok('05')
    await startAsk(host, sessions[0], ASK_TOOL, { text })
    assert.ok(await waitRequest(host, fb, text), 'routed to Fishball')
    assert.deepEqual(await seenFor(text), [])
    await settledIdle(host, fb)
    await cancelAll()
  })

  it('OFA-06 off while Fishball runs a turn takes effect at the idle-phase apply', LONG, async (t) => {
    const first = tok('06a')
    await startAsk(host, sessions[0], ASK_TOOL, { text: first })
    const firstReq = await waitRequest(host, fb, first)
    assert.ok(firstReq?.id, 'precondition: routed')
    await holdFishball(host, fb)
    let second
    try {
      await toggle(false)
      const p = pluginIn((await host.state()).catalog, spec.key)
      assert.equal(p.on, false)
      assert.equal(p.applied, true, 'not applied mid-turn')
      assert.equal((await features()).approvals, true, 'still on until the apply')
      await sleep(AT_ONCE_MS)
      assert.deepEqual(await seenFor(first), [], 'the waiting request still waits for Fishball')
      second = tok('06b')
      await startAsk(host, sessions[1], ASK_TOOL, { text: second })
      assert.ok(await until(async () => (await approvalsNow(host)).pending.length === 2, 5000, 50), 'the new request is still routed (pending 2)')
      assert.deepEqual(await seenFor(second), [], 'not at the normal prompt mid-turn')
    } finally {
      await host.call('releaseHold', { sessionId: fb })
    }
    const at = Date.now()
    assert.ok(await untilCatalog(host, (c) => pluginIn(c, spec.key).applied === false, 20000), 'applied after the turn')
    for (const text of [first, second]) {
      const done = await askSettled(host, text, 20000)
      assert.equal(done?.outcome, OUTCOME.reject, text + ' answered at the normal prompt')
      const seen = await seenFor(text)
      assert.equal(seen.length, 1, text)
      t.diagnostic(text + ' released ' + (seen[0].at - at) + ' ms after the hold was released')
    }
    assert.equal((await features()).approvals, false)
    assert.equal((await approvalsNow(host)).pending.length, 0)
    for (const sid of sessions) await settledIdle(host, sid)
    const secondReq = (await requestMessages(host, fb, second)).at(-1)
    const ids = [firstReq.id, ...(secondReq ? [/^\[permission request (apr_[0-9a-f]+)\]/.exec(secondReq.text)?.[1]] : [])]
    assert.deepEqual(await timeoutNotes(ids), ids.map(() => false), 'no "timed out" note for requests released by the off')
    await toggle(true)
    await catalogSettled(host)
  })

  it('OFA-07 control: with the feature on, a real answer timeout still gives the timed-out note', LONG, async () => {
    assert.equal((await features()).approvals, true, 'precondition: on')
    await setLimit({ approvalAnswerSeconds: 1 })
    try {
      const text = tok('07')
      await startAsk(host, sessions[0], ASK_TOOL, { text })
      const req = await waitRequest(host, fb, text)
      assert.ok(req?.id, 'routed')
      assert.equal((await askSettled(host, text, 10000))?.outcome, OUTCOME.reject, 'went to the normal prompt after the answer time')
      await settledIdle(host, sessions[0])
      assert.deepEqual(await timeoutNotes([req.id]), [true], 'the timed-out note is in Fishball\'s next turn')
    } finally { await setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })

  it('OFA-08 Fishball stopping (archive) while a request waits behaves as before revision 10c', LONG, async () => {
    const text = tok('08')
    await startAsk(host, sessions[1], ASK_TOOL, { text })
    const req = await waitRequest(host, fb, text)
    assert.ok(req?.id, 'routed')
    await settledIdle(host, fb)
    const archived = await host.call('archive', { sessionId: fb, stopActivity: true })
    assert.equal(archived.ok, true, JSON.stringify(archived))
    assert.equal((await askSettled(host, text, 10000))?.outcome, OUTCOME.reject, 'released to the normal prompt')
    await host.call('unarchive', { sessionId: fb })
    assert.equal((await host.post(API.recovery, { action: 'retry' })).status, 200)
    assert.equal((await host.waitStatus(STATUS.live))?.status, STATUS.live)
    assert.equal((await features()).approvals, true, 'the feature itself stayed on')
    // Baseline observed on 90a6a8c (CASES.md A141): no timed-out note reaches Fishball after a stop.
    assert.deepEqual(await timeoutNotes([req.id]), [false])
    await settledIdle(host, sessions[1])
  })
})
