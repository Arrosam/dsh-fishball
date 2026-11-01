/**
 * Revision 11 rev11g: what answer_question refuses, children, and Fishball or Permission requests off (DESIGN §7a.10
 * "Fishball's tool", "Children", "Fishball off", §11 "Failure modes"; §16 Q-r11-question-off; the done-when list:
 * "a malformed batch is refused and the question stays open", "A child agent's question never reaches Fishball",
 * "With Fishball or Permission requests off, a managed session's question stays in its own question card and Fishball
 * takes no step"). One host; cases run in order; the plugin toggles come last.
 *
 * Validation rules (S36 Q1; DESIGN §7a.10): each question id exactly once; selected labels must be offered options; a
 * single-select question takes one label, or custom text alone; a multi-select takes several labels and may add custom
 * text. Equivalence partitions over one three-question batch (single color, multi parts, free name):
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | VAL-01 ×13 | DT (malformed batches) | refused; the own card stays open; the agent still waits; no tag; the pile unchanged |
 * | VAL-02  | EP (valid after the refusals) | the same question then accepts a good batch; the result is exactly that batch |
 * | VAL-03  | BVA (single-select: one label / one label + custom / custom alone / no label and no custom) | one label ok; label + custom refused; custom alone ok; (skipped) no label and no custom ok |
 * | VAL-04  | BVA (multi-select: zero / one / all labels, with and without custom) | all accepted |
 * | VAL-05  | EP (route with a malformed batch) | not 200; the card stays |
 * | CHD-01  | EP (a subagent's question) | the child's call fails (no human can answer); no own card for it, no notice, no pile card, no Fishball step |
 * | OFF-01  | ST (Permission requests off) | a managed session's question stays in its own card; Fishball takes no step; your answer is the result; no tag |
 * | OFF-02  | ST (Permission requests off while a question waits for Fishball) | the question goes back to its own card only (no pile card, no answer path through Fishball) |
 * | OFF-03  | ST (Permission requests back on) | the next question is routed to Fishball again |
 * | OFF-04  | ST (Fishball stopped) | as OFF-01 |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, OWN_PLUGINS, PRESET, STATUS } from './support/constants.mjs'
import { HOOK, T, settledIdle } from './support/expect.mjs'
import { A, Q, QUIET_MS, cardId, qHost, qTools, refused, resultText, sleep, tokens, until } from './support/rev11g.mjs'

const { tok, cid } = tokens('VAL')
const LONG = { timeout: 120000 }

describe('Revision 11 rev11g: refused answers, children, and off', () => {
  let ctx
  let q
  let x
  const toggleApprovals = async (on) => {
    const r = await ctx.host.post(API.plugins, { plugin: OWN_PLUGINS.approvals.key, on })
    assert.equal(r.status, 200, r.text)
    assert.ok(await until(async () => (await ctx.host.state()).features?.approvals === on, 10000, 100), 'features.approvals ' + on)
  }
  const waiting = async (sid, id) => !(await q.allEvents(sid)).some((e) => e.type === 'tool/result' && e.result.callId === id)
  before(async () => {
    ctx = await qHost('rev11g-validate')
    q = qTools(ctx, { tok, cid })
    x = await q.session('val-x')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  describe('VAL: one open three-question batch', () => {
    const text = tok('v')
    const id = cid('v')
    let qid
    let own
    before(async () => {
      own = await q.ask(x, text, id, { questions: Q.mixed(text) })
      qid = await q.questionId(text)
    })
    const ok = [{ id: 'color', selected: ['Red'] }, { id: 'parts', selected: ['Tests'] }, { id: 'name', selected: [], custom: 'a' }]
    const malformed = [
      ['an item missing', ok.slice(0, 2)],
      ['empty answers', []],
      ['a duplicate id', [...ok, ok[0]]],
      ['a question id twice, another missing', [ok[0], ok[0], ok[2]]],
      ['an unknown id replacing one', [ok[0], ok[1], { id: 'other', selected: [], custom: 'a' }]],
      ['an extra unknown id', [...ok, { id: 'other', selected: [], custom: 'a' }]],
      ['a label that is not offered', [{ id: 'color', selected: ['Green'] }, ok[1], ok[2]]],
      ['a label of another question', [{ id: 'color', selected: ['Docs'] }, ok[1], ok[2]]],
      ['two labels on a single-select', [{ id: 'color', selected: ['Red', 'Blue'] }, ok[1], ok[2]]],
      ['a label and custom text on a single-select', [{ id: 'color', selected: ['Red'], custom: 'x' }, ok[1], ok[2]]],
      ['selected not a list', [{ id: 'color', selected: 'Red' }, ok[1], ok[2]]],
      ['answers not a list', 'color=Red'],
      ['a multi-select label not offered', [ok[0], { id: 'parts', selected: ['Docs', 'Nope'] }, ok[2]]],
    ]
    for (const [label, answers] of malformed) {
      it(`VAL-01 ${label}: refused; the question stays open`, T, async () => {
        const r = await q.fbAnswer({ question_id: qid, answers })
        assert.equal(refused(r), true, r.result.text)
        assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'open')
        assert.equal(await waiting(x, id), true, 'the agent still waits')
        assert.equal(q.tagsOf(id).length, 0)
        assert.equal((await q.pile()).length, 0)
      })
    }
    it('VAL-05 the route with a malformed batch is not 200; the question stays open', T, async () => {
      await q.t.setLimit({ approvalAnswerSeconds: 1 })
      const card = await q.pileCard(x, 8000)
      assert.ok(card, 'to the pile after the limit')
      const r = await q.route({ questionId: cardId(card), answers: ok.slice(0, 2) })
      assert.notEqual(r.status, 200, r.text)
      assert.ok(await q.pileCard(x, 500), 'the card stays')
      assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'open')
    })
    it('VAL-02 a good batch is then accepted, and the result is exactly that batch', T, async () => {
      const r = await q.route({ questionId: qid, answers: ok })
      assert.equal(r.status, 200, r.text)
      assert.equal((await q.result(x, id)).text, resultText(ok))
      await ctx.host.call('waitIdle', { sessionId: x })
      await q.t.setLimit({ approvalAnswerSeconds: 120 })
    })
  })

  describe('VAL-03 / VAL-04 boundaries of selection', () => {
    const cases = [
      ['single: one label', Q.single, [{ id: 'color', selected: ['Blue'] }], true],
      ['single: one label and custom', Q.single, [{ id: 'color', selected: ['Blue'], custom: 'teal' }], false],
      ['single: custom alone', Q.single, [{ id: 'color', selected: [], custom: 'teal' }], true],
      ['single: neither (skipped)', Q.single, [{ id: 'color', selected: [] }], true],
      ['single: two labels', Q.single, [{ id: 'color', selected: ['Red', 'Blue'] }], false],
      ['multi: none', (t) => Q.mixed(t).slice(1, 2), [{ id: 'parts', selected: [] }], true],
      ['multi: one', (t) => Q.mixed(t).slice(1, 2), [{ id: 'parts', selected: ['Tests'] }], true],
      ['multi: all three', (t) => Q.mixed(t).slice(1, 2), [{ id: 'parts', selected: ['Docs', 'Tests', 'Code'] }], true],
      ['multi: all three and custom', (t) => Q.mixed(t).slice(1, 2), [{ id: 'parts', selected: ['Docs', 'Tests', 'Code'], custom: 'and CI' }], true],
      ['multi: the same label twice', (t) => Q.mixed(t).slice(1, 2), [{ id: 'parts', selected: ['Docs', 'Docs'] }], null],
    ]
    for (const [label, build, answers, accepted] of cases) {
      it(label + (accepted === null ? ' (not specified: only that the question never crashes)' : accepted ? ': accepted' : ': refused'), T, async () => {
        const text = tok('b')
        const id = cid('b')
        await q.ask(x, text, id, { questions: build(text) })
        const qid = await q.questionId(text)
        const r = await q.fbAnswer({ question_id: qid, answers })
        if (accepted === true) {
          assert.equal(r.json?.ok, true, r.result.text)
          assert.equal((await q.result(x, id)).text, resultText(answers))
        } else {
          if (accepted === false) assert.equal(refused(r), true, r.result.text)
          await q.stop(x)
        }
        await ctx.host.call('waitIdle', { sessionId: x })
      })
    }
  })

  it('CHD-01 a subagent\'s question never reaches Fishball', T, async () => {
    const parent = (await ctx.host.call('ordinary', { preset: PRESET.standard, folder: 'chd' })).sessionId
    await ctx.host.call('drive', { sessionId: parent, script: [[{ text: 'hello' }]], text: 'first words' })
    const { makeManaged } = await import('./support/expect.mjs')
    await makeManaged(ctx.host, ctx.fb, parent)
    const marker = tok('child')
    const qtext = tok('childq')
    const childId = cid('child')
    await ctx.host.call('queueMarker', { marker, except: parent, script: [[{ tool: 'ask_user_question', args: { questions: Q.single(qtext) }, id: childId }], [{ text: 'child done' }]] })
    await settledIdle(ctx.host, ctx.fb)
    const before = await q.fbWork()
    const first = await q.cardCount()
    await ctx.host.call('drive', { sessionId: parent, script: [[{ tool: 'subagent', args: { description: 'fbtest sub', prompt: marker + ' please' } }], [{ text: 'parent done' }]], text: 'delegate' })
    assert.ok(await until(async () => (await ctx.host.call('markerState', { marker })).left === 0, 15000, 100), 'the child ran its script')
    const [child] = (await ctx.host.call('markerState', { marker })).sessions
    assert.ok(child && child !== parent)
    await sleep(QUIET_MS)
    // The finished child is no longer live, so its log is read from the model's second request, which carries the call's result.
    const seen = (await ctx.host.call('requests', { sessionId: child })).map((r) => r.texts).join('\n')
    assert.match(seen, /another live agent|unavailable|delegated|human interaction/i, 'the child\'s call failed: no human can answer it')
    assert.equal((await ctx.host.call('qCards', {})).length, first, 'no card in any session')
    assert.equal((await q.notices(qtext)).length, 0, 'nothing reached Fishball')
    assert.equal((await q.pile()).length, 0)
    assert.equal((await q.fbWork()).items, before.items)
  })

  it('OFF-01 Permission requests off: the question stays in its own card; Fishball takes no step', LONG, async () => {
    await toggleApprovals(false)
    try {
      await settledIdle(ctx.host, ctx.fb)
      const before = await q.fbWork()
      const text = tok('o1')
      const id = cid('o1')
      await q.ask(x, text, id)
      await sleep(QUIET_MS * 2)
      assert.deepEqual(await q.fbWork(), before, 'no Fishball step, no intake item')
      assert.equal((await q.notices(text)).length, 0)
      assert.equal((await q.pile()).length, 0)
      assert.equal(await ctx.host.call('qAnswer', { sessionId: x, answers: A.single }), true)
      assert.equal((await q.result(x, id)).text, resultText(A.single))
      await ctx.host.call('waitIdle', { sessionId: x })
      assert.equal(q.tagsOf(id).length, 0)
    } finally { await toggleApprovals(true) }
  })

  it('OFF-02 turned off while the question waits for Fishball: it is only the session\'s own card afterwards', LONG, async () => {
    const text = tok('o2')
    const id = cid('o2')
    const own = await q.ask(x, text, id)
    const qid = await q.questionId(text)
    await toggleApprovals(false)
    try {
      await sleep(QUIET_MS)
      assert.equal((await q.pile()).length, 0, 'not a pile card')
      assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'open', 'the own card stays open')
      assert.equal((await q.route({ questionId: qid, answers: A.single })).status, 409, 'there is no question for Fishball or the pile any more')
      assert.equal(await ctx.host.call('qAnswer', { sessionId: x, answers: A.single }), true)
      assert.equal((await q.result(x, id)).text, resultText(A.single))
      await ctx.host.call('waitIdle', { sessionId: x })
    } finally { await toggleApprovals(true) }
  })

  it('OFF-03 back on: the next question is routed to Fishball again', LONG, async () => {
    const text = tok('o3')
    const id = cid('o3')
    await q.planAnswer(text, { answers: A.single })
    await q.ask(x, text, id, { waitCard: false })
    assert.equal((await q.result(x, id)).text, resultText(A.single))
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.equal((await q.untilTag(id))?.kind, 'question')
  })

  it('OFF-04 Fishball stopped: the question stays in its own card', LONG, async () => {
    const archived = await ctx.host.call('archive', { sessionId: ctx.fb, stopActivity: true })
    assert.equal(archived.ok, true, JSON.stringify(archived))
    try {
      const text = tok('o4')
      const id = cid('o4')
      await q.ask(x, text, id)
      await sleep(QUIET_MS)
      assert.equal((await q.pile()).length, 0)
      assert.equal(await ctx.host.call('qAnswer', { sessionId: x, answers: A.single }), true)
      assert.equal((await q.result(x, id)).text, resultText(A.single))
      await ctx.host.call('waitIdle', { sessionId: x })
    } finally {
      await ctx.host.call('unarchive', { sessionId: ctx.fb })
      const rec = await ctx.host.post(API.recovery, { action: 'retry' })
      assert.equal(rec.status, 200, rec.text)
      await ctx.host.waitStatus(STATUS.live)
      await settledIdle(ctx.host, ctx.fb)
    }
  })
})
