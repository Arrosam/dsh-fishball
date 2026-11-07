/**
 * Revision 11 rev11g on H-STUB, FIRST: the held wait of a timed question (DESIGN §7a.10 "Time limit", §16
 * Q-r11-timed-wait, Q-r11-timed-release; S36-attachWait). The router claims a timed question's foreground wait and
 * passes it on to the session card untimed, so the tool's own shorter `timeout` does not end it: the instance's
 * answer within `approvalAnswerSeconds` is the call's result in the same turn, and after the limit the session
 * keeps waiting in the same turn until you answer. Fishball is the stub instance (contract 1.1 §4.2, §5);
 * approvalAnswerSeconds and the call's `timeout` are whole seconds.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | HLD-01  | BVA (timeout 1 s < approvalAnswerSeconds 6 s; the instance answers at about 2 s) | §7a.10 Time limit | the own card is untimed; no pending result after 1 s+; the own card still open; the offer is still listed; the instance's answer is the call's result in the same turn |
 * | HLD-02  | BVA (timeout 1 s, approvalAnswerSeconds 2 s; nobody answers) | §7a.10 "keeps holding" | the question leaves the instance after about 2 s; the call has no result 3 s later; DSH never marked it continued; you answer in the own card: the result, same turn |
 * | HLD-03  | BVA (timeout 2 s > approvalAnswerSeconds 1 s) | §7a.10 | it leaves the instance after 1 s; still no result after the tool's own 2 s; your answer is the same turn's result |
 * | HLD-04  | EP (timeout -1: no foreground limit) | §7a.10 | the instance's answer within approvalAnswerSeconds is the call's result |
 * | HLD-05  | EP (default timeout 120 s, the instance answers at once) | §7a.10 | the answer is the same turn's result (no pending) |
 * | HLD-06  | ST (you answer in the own card while held) | §7a.10 The race | the call's result; the instance's late answer is refused |
 * | HLD-07  | ST (your Stop while held, after the limit) | §7a.10 "Stop needs no handling" | the own card closes; a late answer is refused; no answer was recorded for the call |
 *
 * Retired:
 * - HLD-02/03/07 pile parts ("the pile card exists", "you answer on the card", "the route answers 409"): the pile and its question route are deleted (slim §12); the user answers only in the session's own card, which these cases use instead.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { LIMITS, PRESET } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import { A, Q, QSTUB, assertStillOpen, bootQ, codeOf, qTools, resultText, sleep, tokens } from './support/instance-stub-questions.mjs'

const { tok, cid } = tokens('HLD')
/** Waits measured from the moment the own card opened, in ms: past a 1 s and a 2 s tool timeout, and the 3 s re-check. */
const WAIT = { pastOneSecond: 2200, pastTwoSeconds: 2800, afterMove: 3000, beforeAnswer: 1500, tolerance: 300 }

describe('Revision 11 rev11g on H-STUB: the held wait of a timed question', () => {
  const ctx = {}
  let q
  let x
  before(async () => {
    Object.assign(ctx, await bootQ('rev11g-hold'))
    q = qTools(ctx)
    x = await q.session('hld-x', PRESET.askTimed)
  }, HOOK)
  after(async () => { await q?.setSeconds(LIMITS.approvalAnswerSeconds.default).catch(() => {}); await stopStub(ctx.booted) }, HOOK)

  const replies = (sid) => q.replies(sid)
  const isPending = (r) => QSTUB.pending.test(r?.text ?? '')
  const ends = async (sid) => (await q.turnEnds(sid)).length
  /** Ask with a tool timeout; returns the own card, the offer and when the card opened. */
  async function askTimed(text, id, timeout) {
    const r = await q.ask(x, text, id, { questions: Q.single(text), ...(timeout === undefined ? {} : { timeout }) })
    return { ...r, opened: r.card.openedAt }
  }
  /** The question leaves the instance (approval.settled) within the limit plus slack; returns when it did. */
  async function movedAt(offer, seconds) {
    const frame = await q.stub().waitEvent(QSTUB.event.approvalSettled, (p) => p.approvalId === offer.approvalId, { timeoutMs: seconds * QSTUB.secondMs + QSTUB.limitLateMs })
    assert.ok(frame, 'the question left the instance after approvalAnswerSeconds')
    return frame.at
  }
  /** Your answer in the own card is the call's result in the same turn, and no late-reply message follows. */
  async function answerHere(id, endsBefore) {
    assert.equal(await q.qAnswer(x, A.single), true)
    const got = await q.result(x, id)
    assert.equal(got.text, resultText(A.single))
    await q.waitIdle(x)
    assert.equal((await replies(x)).length, 0, 'same turn: no late-reply message')
    if (endsBefore !== undefined) assert.equal(await ends(x), endsBefore + 1, 'one turn')
  }

  it('HLD-01 timeout 1 s, approvalAnswerSeconds 6 s: the wait outlives the tool timeout; the instance answers in the same turn', T, async () => {
    await q.setSeconds(6)
    const text = tok('01')
    const id = cid('01')
    const endsBefore = await ends(x)
    const { card, offer, opened } = await askTimed(text, id, 1)
    assert.equal(card.timed, false, 'the session\'s own card is passed on untimed, so it shows no countdown (S36-attachWait amendment)')
    await sleep(Math.max(0, opened + WAIT.pastOneSecond - Date.now()))
    await assertStillOpen(q, x, card, id, 'after the tool\'s own 1 s')
    assert.deepEqual(await q.listed(x), [offer.approvalId], 'still the instance\'s: it has until 6 s')
    assert.deepEqual((await q.answer(x, offer.approvalId, { answers: A.single })).payload, { accepted: true })
    const got = await q.result(x, id)
    assert.equal(got.text, resultText(A.single), 'the answer, not the pending result')
    assert.equal(isPending(got), false)
    await q.waitIdle(x)
    assert.equal((await replies(x)).length, 0, 'no late-reply message: the answer was the call\'s own result')
    assert.equal(await ends(x), endsBefore + 1, 'one turn')
  })

  it('HLD-02 timeout 1 s, approvalAnswerSeconds 2 s: it leaves the instance after 2 s and the wait is still held', T, async () => {
    await q.setSeconds(2)
    const text = tok('02')
    const id = cid('02')
    const endsBefore = await ends(x)
    const { card, offer, opened } = await askTimed(text, id, 1)
    const moved = await movedAt(offer, 2)
    assert.ok(moved - opened >= 2 * QSTUB.secondMs * QSTUB.limitEarlyShare - WAIT.tolerance, 'not before about approvalAnswerSeconds: ' + (moved - opened) + ' ms')
    await sleep(WAIT.afterMove)
    await assertStillOpen(q, x, card, id, '3 s after the move (the tool timeout passed twice)')
    const continued = ((await q.host().call('qProjection', { sessionId: x }))?.active ?? []).filter((c) => c.state === 'continued')
    assert.deepEqual(continued, [], 'DSH never marked it continued')
    await answerHere(id, endsBefore)
  })

  it('HLD-03 timeout 2 s, approvalAnswerSeconds 1 s: it leaves the instance after 1 s; still held after the tool\'s own 2 s', T, async () => {
    await q.setSeconds(1)
    const text = tok('03')
    const id = cid('03')
    const { card, offer, opened } = await askTimed(text, id, 2)
    await movedAt(offer, 1)
    await sleep(Math.max(0, opened + WAIT.pastTwoSeconds - Date.now()))
    await assertStillOpen(q, x, card, id, 'after the tool\'s own 2 s')
    await answerHere(id)
  })

  it('HLD-04 timeout -1 (no foreground limit): the instance answers within approvalAnswerSeconds', T, async () => {
    await q.setSeconds(8)
    const text = tok('04')
    const id = cid('04')
    const { offer } = await askTimed(text, id, -1)
    assert.deepEqual((await q.answer(x, offer.approvalId, { answers: A.single })).payload, { accepted: true })
    assert.equal((await q.result(x, id)).text, resultText(A.single))
    await q.waitIdle(x)
  })

  it('HLD-05 default timeout 120 s, the instance answers at once: the answer is the same turn\'s result', T, async () => {
    await q.setSeconds(LIMITS.approvalAnswerSeconds.default)
    const text = tok('05')
    const id = cid('05')
    const { offer } = await askTimed(text, id)
    await q.answer(x, offer.approvalId, { answers: A.single })
    const got = await q.result(x, id)
    assert.equal(got.text, resultText(A.single))
    assert.equal(isPending(got), false)
    await q.waitIdle(x)
    assert.equal((await replies(x)).length, 0)
  })

  it('HLD-06 you answer in the own card while the wait is held: the call\'s result; the instance\'s late answer is refused', T, async () => {
    await q.setSeconds(6)
    const text = tok('06')
    const id = cid('06')
    const { offer } = await askTimed(text, id, 1)
    await sleep(WAIT.beforeAnswer)
    await answerHere(id)
    assert.ok(QSTUB.lateCodes.includes(codeOf(await q.answer(x, offer.approvalId, { answers: A.single }))), 'already settled')
  })

  it('HLD-07 your Stop while the wait is held (after the limit): the own card closes; a late answer is refused', T, async () => {
    await q.setSeconds(2)
    const text = tok('07')
    const id = cid('07')
    const { card, offer } = await askTimed(text, id, 1)
    await movedAt(offer, 2)
    await q.userStop(x)
    assert.equal(await q.cardState(x, card.index), QSTUB.card.closed)
    assert.ok(QSTUB.lateCodes.includes(codeOf(await q.answer(x, offer.approvalId, { answers: A.single }))), 'refused')
    const result = await q.resultNow(x, id)
    assert.ok(!result || !result.text.includes('"answers"'), 'no answer was recorded for the stopped call')
  })
})
