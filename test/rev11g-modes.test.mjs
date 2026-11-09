/**
 * D2 maintenance of rev11g modes on H-STUB (contract 1.2 §3.2.2).
 * Stored questionMode remains raw data, not a routing switch or an editor control.
 * MOD-01/02/03 retired: editor default, valid-mode saves and invalid-mode form validation
 * no longer exist. MOD-04/05/06 preserve the three-row decision table for each stored mode:
 * instance answers -> accepted; user answers -> user result; silence -> still offered/held.
 * MOD-07 keeps raw restart retention; MOD-08 keeps the retired-route regression.
 * No claim about rendered settings controls is inferred from config/schema retention.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { QUESTION_API, QUESTION_MODE } from './support/constants.mjs'
import { HOOK, T, savedRowConfig } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import { A, Q, QSTUB, assertStillOpen, bootQ, qTools, quiet, restartQ, resultText, tokens } from './support/instance-stub-questions.mjs'

const { tok, cid } = tokens('MOD')
const LONG = { timeout: 120000 }
const FIELD = QSTUB.field.mode

describe('Revision 11 rev11g on H-STUB: the question mode', () => {
  const ctx = {}
  let q
  let x
  before(async () => {
    Object.assign(ctx, await bootQ('rev11g-modes'))
    q = qTools(ctx)
  }, HOOK)
  /** The managed session MOD-04..06 ask in. */
  const needX = async () => { x ??= await q.session('mod-x') }
  after(async () => { await stopStub(ctx.booted) }, HOOK)

  it('MOD-08 the retired question-mode route answers 404 and changes nothing', T, async () => {
    await q.seedStoredConfig({ [FIELD]: QUESTION_MODE.user }, { resume: [x].filter(Boolean) })
    const storedBefore = savedRowConfig(q.home())
    const r = await q.host().post(QUESTION_API.mode, { mode: QUESTION_MODE.user })
    assert.equal(r.status, 404, r.text)
    assert.deepEqual(savedRowConfig(q.home()), storedBefore)
  })

  /** Ask in x; returns the own card, the call id and the question id the instance learned. */
  async function askX(label) {
    const text = tok(label)
    const id = cid(label)
    const { card, offer } = await q.ask(x, text, id, { questions: Q.single(text), offer: false })
    return { card, id, text, qid: await q.learnedId(text, id) }
  }

  for (const [id, mode] of [['MOD-04', QUESTION_MODE.auto], ['MOD-05', QUESTION_MODE.fishball], ['MOD-06', QUESTION_MODE.user]]) {
    describe(`${id} ${mode} mode`, () => {
      before(async () => {
        await q.seedStoredConfig({ [FIELD]: mode, approvalAnswerSeconds: 1 }, { resume: [x].filter(Boolean) })
        await needX()
        assert.equal(savedRowConfig(q.home())?.[FIELD], mode, 'the original stored value is retained')
      })

      it('the instance answers: accepted; the result is the batch', T, async () => {
        const { id: callId, qid } = await askX(id + 'a')
        assert.ok(qid, 'the instance was offered the question')
        if (mode === QUESTION_MODE.user) {
          assert.deepEqual((await q.answer(x, qid, { note: 'my view: pick Blue ' + qid })).payload, { accepted: true }, 'notes remain accepted independently of saved mode')
        }
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
      it('nobody answers: it stays offered past the former window and the agent keeps waiting', T, async () => {
        const { card, id: callId, qid } = await askX(id + 'c')
        await quiet(QSTUB.secondMs + QSTUB.quietMs)
        assert.deepEqual(await q.settledNow(qid), [], 'silence does not settle')
        assert.deepEqual(await q.listed(x), [qid], 'still offered in every saved mode')
        await assertStillOpen(q, x, card, callId, 'after the former limit')
        await q.userStop(x)
      })
    })
  }

  it('MOD-07 a restart keeps raw user mode without restoring the routing switch', LONG, async () => {
    await q.seedStoredConfig({ [FIELD]: QUESTION_MODE.user }, { resume: [x].filter(Boolean) })
    const stored = savedRowConfig(q.home())?.[FIELD]
    assert.equal(stored, QUESTION_MODE.user)
    await restartQ(ctx)
    if (x) assert.equal((await q.host().call('resume', { sessionId: x })).live, true)
    assert.equal(savedRowConfig(q.home())?.[FIELD], stored)
    await needX()
    const { id: callId, qid } = await askX('07')
    assert.ok(qid, 'saved user mode still permits an eligible offer after restart')
    assert.deepEqual((await q.answer(x, qid, { answers: A.single })).payload, { accepted: true })
    assert.equal((await q.result(x, callId)).text, resultText(A.single))
    await q.waitIdle(x)
    assert.equal(savedRowConfig(q.home())?.[FIELD], stored, 'answering did not silently rewrite the saved value')
  })
})
