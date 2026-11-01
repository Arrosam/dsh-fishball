/**
 * Revision 11 rev11g: the question mode (requirements item 25; DESIGN §7a.10 "The mode", §9 `settings['questions']`,
 * §10e "Question mode" and "Host API", §16 Q-r11-mode-place). Code enforces only User mode: there Fishball's answer
 * is refused with `mode-user` and a note is accepted. The Auto rule ("only when your words cover it") is prompt-only
 * and is not tested here. One host; the restart case is last.
 *
 * Decision table (blocking question in a managed session; approvalAnswerSeconds 1 so "no answer" is quick):
 *
 * | mode     | Fishball answers | you answer in the session | nobody answers |
 * |----------|------------------|---------------------------|----------------|
 * | auto     | accepted: result, tag          | result, no tag | pile card after the limit |
 * | fishball | accepted: result, tag          | result, no tag | pile card after the limit |
 * | user     | refused mode-user; stays open  | result, no tag | pile card at once, stays    |
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | MOD-01  | EP (fresh host) | the snapshot's questionMode is auto; nothing stored |
 * | MOD-02  | EP (each valid mode) | route 200; the snapshot shows it; the stored settings row holds it |
 * | MOD-03 ×6 | DT (bad bodies) | 400 bad-body; the mode is unchanged |
 * | MOD-04  | DT (auto × 3 columns) | as the table |
 * | MOD-05  | DT (fishball × 3 columns) | as the table |
 * | MOD-06  | DT (user × 3 columns) | as the table; the note is accepted in User mode and shows on the card |
 * | MOD-07  | ST (restart) | the mode survives |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { LIMITS, MODE_USER_CODE, QUESTION_MODE, QUESTION_SETTINGS, QUESTION_TAG_KIND } from './support/constants.mjs'
import { HOOK, T, settledIdle, storedRows } from './support/expect.mjs'
import { A, AT_ONCE_MS, QUIET_MS, boot, cardId, cardMentions, qHost, qTools, refused, resultText, sleep, tokens } from './support/rev11g.mjs'
import fs from 'node:fs'
import { STORE } from './support/constants.mjs'

const { tok, cid } = tokens('MOD')
const LONG = { timeout: 120000 }

describe('Revision 11 rev11g: the question mode', () => {
  let ctx
  let q
  let x
  const storedMode = () => {
    try { return JSON.parse(fs.readFileSync(STORE.file(ctx.home), 'utf8')).tables?.[QUESTION_SETTINGS.table]?.[QUESTION_SETTINGS.key]?.mode } catch { return undefined }
  }
  before(async () => {
    ctx = await qHost('rev11g-modes')
    q = qTools(ctx, { tok, cid })
    x = await q.session('mod-x')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('MOD-01 the default mode is auto', T, async () => {
    assert.equal((await ctx.host.state()).questionMode, QUESTION_MODE.auto)
    assert.ok(storedMode() === undefined || storedMode() === QUESTION_MODE.auto)
  })

  it('MOD-02 each valid mode: route 200, the snapshot shows it, the stored row holds it', T, async () => {
    for (const mode of [QUESTION_MODE.fishball, QUESTION_MODE.user, QUESTION_MODE.auto]) {
      const r = await q.setMode(mode)
      assert.equal(r.status, 200, r.text)
      assert.equal((await ctx.host.state()).questionMode, mode)
      assert.equal(storedMode(), mode)
    }
  })

  for (const [label, body, raw] of [['unknown word', { mode: 'bogus' }], ['wrong case', { mode: 'AUTO' }], ['a number', { mode: 1 }], ['missing', {}], ['null mode', { mode: null }], ['not JSON', '{nope', true]]) {
    it(`MOD-03 bad body (${label}): 400 bad-body; the mode is unchanged`, T, async () => {
      await q.mode(QUESTION_MODE.fishball)
      const r = await ctx.host.post('/api/fishball/question-mode', body, { raw: Boolean(raw) })
      assert.equal(r.status, 400, r.text)
      assert.equal(r.json?.code, 'bad-body')
      assert.equal((await ctx.host.state()).questionMode, QUESTION_MODE.fishball)
      await q.mode(QUESTION_MODE.auto)
    })
  }

  for (const [id, mode] of [['MOD-04', QUESTION_MODE.auto], ['MOD-05', QUESTION_MODE.fishball]]) {
    describe(`${id} ${mode} mode`, () => {
      before(async () => { await q.mode(mode); await q.t.setLimit({ approvalAnswerSeconds: 1 }) })
      after(async () => { await q.t.setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) })

      it('Fishball answers: accepted; the result is the batch; a question tag', T, async () => {
        const text = tok(id + 'a')
        const callId = cid(id + 'a')
        await q.planAnswer(text, { answers: A.single })
        await q.ask(x, text, callId, { waitCard: false })
        assert.equal((await q.result(x, callId)).text, resultText(A.single))
        const tag = await q.untilTag(callId)
        assert.equal(tag?.kind, QUESTION_TAG_KIND.question)
        await ctx.host.call('waitIdle', { sessionId: x })
      })
      it('you answer in the session: the result is your batch; no tag', T, async () => {
        const text = tok(id + 'b')
        const callId = cid(id + 'b')
        await q.ask(x, text, callId)
        assert.equal(await ctx.host.call('qAnswer', { sessionId: x, answers: A.single }), true)
        assert.equal((await q.result(x, callId)).text, resultText(A.single))
        await ctx.host.call('waitIdle', { sessionId: x })
        assert.equal(q.tagsOf(callId).length, 0)
      })
      it('nobody answers: a pile card after the limit; the agent keeps waiting', T, async () => {
        const text = tok(id + 'c')
        const callId = cid(id + 'c')
        await q.ask(x, text, callId)
        assert.ok(await q.pileCard(x, 8000))
        assert.equal((await q.allEvents(x)).some((e) => e.type === 'tool/result' && e.result.callId === callId), false)
        await q.stop(x)
      })
    })
  }

  describe('MOD-06 user mode', () => {
    before(async () => { await q.mode(QUESTION_MODE.user) })
    after(async () => { await q.mode(QUESTION_MODE.auto) })

    it('Fishball answers: refused with mode-user; the question stays open and is your card at once', T, async () => {
      const text = tok('06a')
      const callId = cid('06a')
      const t0 = Date.now()
      const own = await q.ask(x, text, callId)
      const card = await q.pileCard(x, 8000)
      assert.ok(card, 'always the pile')
      assert.ok(Date.now() - t0 < AT_ONCE_MS + 6000, 'at once, not after approvalAnswerSeconds: ' + (Date.now() - t0))
      const qid = cardId(card)
      const r = await q.fbAnswer({ question_id: qid, answers: A.single })
      assert.equal(refused(r), true, r.result.text)
      assert.equal(r.json?.code ?? (/mode-user/.test(r.result.text) ? MODE_USER_CODE : undefined), MODE_USER_CODE)
      assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'open', 'still open in the session')
      assert.ok(await q.pileCard(x, 500), 'still your card')
      assert.equal(q.tagsOf(callId).length, 0)
      assert.equal((await q.allEvents(x)).some((e) => e.type === 'tool/result' && e.result.callId === callId), false)
      // A note is accepted and shows on the card.
      const note = 'my view: pick Blue ' + text
      const n = await q.fbAnswer({ question_id: qid, note })
      assert.equal(n.json?.ok, true, n.result.text)
      assert.ok(cardMentions(await q.pileCard(x, 3000), note), 'the note is on the card')
      assert.equal((await q.route({ questionId: qid, answers: A.single })).status, 200)
      assert.equal((await q.result(x, callId)).text, resultText(A.single))
      await ctx.host.call('waitIdle', { sessionId: x })
    })
    it('you answer in the session: the result is your batch; the card leaves; no tag', T, async () => {
      const text = tok('06b')
      const callId = cid('06b')
      await q.ask(x, text, callId)
      assert.ok(await q.pileCard(x, 8000))
      assert.equal(await ctx.host.call('qAnswer', { sessionId: x, answers: A.single }), true)
      assert.equal((await q.result(x, callId)).text, resultText(A.single))
      assert.ok(await q.noPileCard(x))
      assert.equal(q.tagsOf(callId).length, 0)
      await ctx.host.call('waitIdle', { sessionId: x })
    })
    it('nobody answers: it stays in the pile and the agent keeps waiting', T, async () => {
      const text = tok('06c')
      const callId = cid('06c')
      await q.ask(x, text, callId)
      assert.ok(await q.pileCard(x, 8000))
      await sleep(QUIET_MS * 2)
      assert.ok(await q.pileCard(x, 500))
      assert.equal((await q.allEvents(x)).some((e) => e.type === 'tool/result' && e.result.callId === callId), false)
      await q.stop(x)
    })
  })

  it('MOD-07 a restart keeps the mode', LONG, async () => {
    await q.mode(QUESTION_MODE.user)
    await ctx.host.call('flush', { sessionId: x })
    await ctx.host.stop()
    await boot(ctx)
    assert.equal((await ctx.host.state()).questionMode, QUESTION_MODE.user)
    assert.equal(storedMode(), QUESTION_MODE.user)
  })
})
