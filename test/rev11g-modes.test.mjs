/**
 * Revision 11 rev11g on H-STUB: the question mode (requirements item 25; DESIGN §7a.10 "The mode", §9; contract 1.1
 * §0/§8 (connector settings only in DSH's form), §4.2 `mode-user`; connector.md C2-R1, C2-P-07; slim §0.7, D24).
 * The mode is the volatile `questionMode` field of the fishball-connector row config, changed only in DSH's own
 * settings form (here DSH's settings service, as the form saves it); the old question-mode route is gone (404).
 * Code enforces only User mode: there the instance's answer is refused `mode-user` and a note is accepted. The Auto
 * rule ("only when your words cover it") is prompt-only and not tested here. One host; the restart case is last.
 *
 * Decision table (blocking question in a managed session; approvalAnswerSeconds 1 so "nobody answers" is quick):
 *
 * | mode     | the instance answers | you answer in the session | nobody answers |
 * |----------|----------------------|---------------------------|----------------|
 * | auto     | accepted: the result | the result                | it leaves the instance after the limit; the agent keeps waiting |
 * | fishball | accepted: the result | the result                | it leaves the instance after the limit; the agent keeps waiting |
 * | user     | refused mode-user; the question stays open; a note is accepted | the result | the agent keeps waiting in its own card |
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | MOD-01  | EP (fresh host) | §9 "absent means auto"; C2-P-01 | the snapshot's questionMode is auto; DSH's form shows auto; nothing stored in the row config |
 * | MOD-02  | EP (each valid mode) | C2-R1 | DSH's form accepts questionMode; the snapshot shows it; the row config holds it |
 * | MOD-03 ×4 | DT (bad values; null is left out: DSH's settings service accepts a null field value as JSON data) | C2-R1 | DSH's form refuses it; the mode is unchanged |
 * | MOD-08  | EP (retired route) | slim §0.7, D24; C2-R2 | POST /api/fishball/question-mode answers 404 and changes nothing |
 * | MOD-04  | DT (auto × 3 columns) | §7a.10 | as the table |
 * | MOD-05  | DT (fishball × 3 columns) | §7a.10 | as the table |
 * | MOD-06  | DT (user × 3 columns); C2-P-07 | §7a.10; §4.2 mode-user | as the table; the mode applies without a restart; the instance learns the question only to add a note |
 * | MOD-07  | ST (restart) | C2-R1 "persist" | the mode survives |
 *
 * Retired:
 * - The "a question tag" / "no tag" parts of MOD-04..06: tag records were removed (slim T15).
 * - MOD-06 "the note shows on the card" and every "pile card" column: the pile is deleted (slim §12); the user answers only in the session's own question card.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { LIMITS, QUESTION_API, QUESTION_MODE } from './support/constants.mjs'
import { HOOK, T, savedRowConfig } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import { A, Q, QSTUB, assertStillOpen, bootQ, codeOf, qTools, quiet, restartQ, resultText, tokens, until } from './support/instance-stub-questions.mjs'

const { tok, cid } = tokens('MOD')
const LONG = { timeout: 120000 }
const FIELD = QSTUB.field.mode

describe('Revision 11 rev11g on H-STUB: the question mode', () => {
  const ctx = {}
  let q
  let x
  /** DSH's form of the fishball-connector row, as its Save does: returns {ok} or {ok:false, error}. */
  const setFormMode = (mode) => q.host().call('settingsUpdate', { patch: { [FIELD]: mode } })
  const snapshotMode = async () => (await q.host().state()).questionMode
  before(async () => {
    Object.assign(ctx, await bootQ('rev11g-modes'))
    q = qTools(ctx)
  }, HOOK)
  /** The managed session MOD-04..06 ask in. */
  const needX = async () => { x ??= await q.session('mod-x') }
  after(async () => { await stopStub(ctx.booted) }, HOOK)

  it('MOD-01 the default mode is auto', T, async () => {
    assert.equal(await snapshotMode(), QUESTION_MODE.auto)
    assert.equal((await q.rowConfig())?.value?.[FIELD], QUESTION_MODE.auto, 'DSH\'s form shows auto')
    assert.equal(savedRowConfig(q.home())?.[FIELD], undefined, 'nothing stored before a change')
  })

  it('MOD-02 each valid mode: DSH\'s form accepts it, the snapshot shows it, the row config holds it', T, async () => {
    for (const mode of [QUESTION_MODE.fishball, QUESTION_MODE.user, QUESTION_MODE.auto]) {
      const r = await setFormMode(mode)
      assert.equal(r.ok, true, JSON.stringify(r.error))
      assert.ok(await until(async () => (await snapshotMode()) === mode, QSTUB.markerWaitMs, QSTUB.pollMs), 'the snapshot shows ' + mode)
      assert.equal(savedRowConfig(q.home())?.[FIELD], mode, 'the row config holds ' + mode)
    }
  })

  for (const [label, value] of [['unknown word', 'bogus'], ['wrong case', 'AUTO'], ['a number', 1], ['an empty string', '']]) {
    it(`MOD-03 bad value (${label}): DSH's form refuses it; the mode is unchanged`, T, async () => {
      assert.equal((await setFormMode(QUESTION_MODE.fishball)).ok, true, 'precondition: fishball mode')
      const r = await setFormMode(value)
      assert.equal(r.ok, false, 'refused')
      assert.equal(await snapshotMode(), QUESTION_MODE.fishball)
      assert.equal(savedRowConfig(q.home())?.[FIELD], QUESTION_MODE.fishball)
      assert.equal((await setFormMode(QUESTION_MODE.auto)).ok, true)
    })
  }

  it('MOD-08 the retired question-mode route answers 404 and changes nothing', T, async () => {
    const before = await snapshotMode()
    const r = await q.host().post(QUESTION_API.mode, { mode: QUESTION_MODE.user })
    assert.equal(r.status, 404, r.text)
    assert.equal(await snapshotMode(), before)
  })

  /** Ask in x; returns the own card, the call id and the question id the instance learned (offer, else its notice). */
  async function askX(label) {
    const text = tok(label)
    const id = cid(label)
    const { card, offer } = await q.ask(x, text, id, { questions: Q.single(text), offer: false })
    return { card, id, text, qid: await q.learnedId(text, id) }
  }

  for (const [id, mode] of [['MOD-04', QUESTION_MODE.auto], ['MOD-05', QUESTION_MODE.fishball]]) {
    describe(`${id} ${mode} mode`, () => {
      before(async () => { await needX(); await q.setMode(mode); await q.setSeconds(1) })
      after(async () => { await q.setSeconds(LIMITS.approvalAnswerSeconds.default) })

      it('the instance answers: accepted; the result is the batch', T, async () => {
        const { id: callId, qid } = await askX(id + 'a')
        assert.ok(qid, 'the instance was offered the question')
        assert.deepEqual((await q.answer(x, qid, { answers: A.single })).payload, { accepted: true })
        assert.equal((await q.result(x, callId)).text, resultText(A.single))
        await q.waitIdle(x)
      })
      it('you answer in the session: the result is your batch', T, async () => {
        const { id: callId } = await askX(id + 'b')
        assert.equal(await q.qAnswer(x, A.single), true)
        assert.equal((await q.result(x, callId)).text, resultText(A.single))
        await q.waitIdle(x)
      })
      it('nobody answers: it leaves the instance after the limit; the agent keeps waiting', T, async () => {
        const { card, id: callId, qid } = await askX(id + 'c')
        assert.ok(await q.settled(qid, { timeoutMs: QSTUB.limitLateMs }), 'it left the instance')
        assert.equal(codeOf(await q.answer(x, qid, { answers: A.single })), QSTUB.code.expired)
        await assertStillOpen(q, x, card, callId, 'after the limit')
        await q.userStop(x)
      })
    })
  }

  describe('MOD-06 user mode (C2-P-07: set in DSH\'s form, no restart)', () => {
    before(async () => { await needX(); await q.setMode(QUESTION_MODE.user) })
    after(async () => { await q.setMode(QUESTION_MODE.auto) })

    it('the instance answers: refused mode-user; the question stays open; a note is accepted; you answer', T, async () => {
      const { card, id: callId, qid } = await askX('06a')
      assert.ok(qid, 'the instance learned the question id (to add a note)')
      const r = await q.answer(x, qid, { answers: A.single })
      assert.equal(codeOf(r), QSTUB.code.modeUser, JSON.stringify(r))
      await assertStillOpen(q, x, card, callId, 'after the refusal')
      const n = await q.answer(x, qid, { note: 'my view: pick Blue ' + qid })
      assert.deepEqual(n.payload, { accepted: true }, JSON.stringify(n))
      assert.equal(await q.qAnswer(x, A.single), true)
      assert.equal((await q.result(x, callId)).text, resultText(A.single))
      await q.waitIdle(x)
    })
    it('you answer in the session: the result is your batch', T, async () => {
      const { id: callId } = await askX('06b')
      assert.equal(await q.qAnswer(x, A.single), true)
      assert.equal((await q.result(x, callId)).text, resultText(A.single))
      await q.waitIdle(x)
    })
    it('nobody answers: the agent keeps waiting in its own card', T, async () => {
      const { card, id: callId } = await askX('06c')
      await quiet(QSTUB.quietMs * 2)
      await assertStillOpen(q, x, card, callId, 'nobody answered')
      await q.userStop(x)
    })
  })

  it('MOD-07 a restart keeps the mode', LONG, async () => {
    assert.equal((await setFormMode(QUESTION_MODE.user)).ok, true)
    await restartQ(ctx)
    assert.equal(await snapshotMode(), QUESTION_MODE.user)
    assert.equal(savedRowConfig(q.home())?.[FIELD], QUESTION_MODE.user)
    assert.equal((await q.rowConfig())?.value?.[FIELD], QUESTION_MODE.user, 'DSH\'s form shows it')
  })
})
