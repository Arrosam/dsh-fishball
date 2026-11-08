/**
 * Revision 11 rev11g on H-STUB: what question.answer refuses, its bounds, children, and no instance (DESIGN §7a.10
 * "Fishball's tool", "Children", "Fishball off"; contract 1.1 §3.1 (exact keys; a frame that fails validation closes
 * the channel), §4.2 question.answer and its refusals, §8 limits; §9 no instance; connector.md C1-EP-06, C1-DT-06).
 * One host; cases run in order.
 *
 * Validation rules (DESIGN §7a.10; contract §4.2): each question id exactly once; selected labels are unique and
 * offered options of that question; a single-select question takes one label, or custom text alone; a multi-select
 * takes several labels and may add custom text; 1–32 answers, ≤ 32 selected labels of ≤ 200 characters, custom
 * ≤ 500, note ≤ 500. Two kinds of refusal: a well-formed payload whose answer does not fit is `bad-answer`
 * (channel open); a payload that breaks the frame's own rules (types, uniqueness, bounds, keys) is answered
 * `limit-exceeded` or `invalid-envelope` in an error frame, and the channel stays open (§3.1) — either way the answer
 * is not taken and the question stays open.
 * Fit rules (a label offered for that question, the single-select rule, every question id answered and no other)
 * have a named refusal, `bad-answer` (§4.2), so they must come back as an error frame with the channel open; the
 * list rules of §4.2/§8 (types, 1–32 items, unique ids and labels, counts and lengths) are payload validation.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | VAL-01 ×13 | DT (malformed batches, each on a three-question batch of its own) | §7a.10 "a bad batch is refused and the question stays open" | fit rules: a bad-answer error frame; shape rules: limit-exceeded or invalid-envelope error frame; the channel stays open, the own card stays open and the agent still waits |
 * | VAL-02  | EP (valid after refusals) | §7a.10; §4.2 bad-answer | an unoffered label, two labels on a single-select, an unknown id: each bad-answer with the channel open; the same question then accepts a good batch; the result is exactly that batch |
 * | VAL-03  | BVA (single-select: one label / label + custom / custom alone / no label and no custom / two labels) | §7a.10; §4.2 "an empty selected skips the question" | one label ok; label + custom refused; custom alone ok; skipped ok; two labels refused |
 * | VAL-04  | BVA (multi-select: zero / one / all labels, with and without custom; the same label twice) | §7a.10; §4.2 "unique labels" | all accepted; the same label twice refused |
 * | VAL-06  | BVA (customChars 500 / 501; noteChars 500 / 501; labelChars 200 / 201) | contract §8 | at the limit accepted; one above refused and the question stays open |
 * | VAL-07  | BVA (questionsPerRequest: 32 answers / 33; selectedLabelsPerAnswer 32 / 33) | contract §8 | 32 accepted (a 32-question ask); 33 refused |
 * | VAL-08  | DT (envelope sessionId ≠ payload sessionId; another session's question id; a session that is yours) | contract §4 "Scoped"; §4.2 | none accepted; the question stays open |
 * | CHD-01  | EP (a subagent's question) | §7a.10 Children | the child's call fails (no human can answer); no own card for it, no offer, no notice |
 * | OFF-01  | ST (no instance attached) | contract §9; C1-EP-06 | the question shows in its own card at once and is not offered; your answer reaches the session; nothing arrives for it after the attach |
 * | OFF-02  | ST (the instance detaches while a question waits for it) | contract §5.1 "a request waiting for the instance at a detach goes to its own session's prompt at once" | the question stays in its own card only; after a new attach it is not offered again and its id answers expired; your answer is the result |
 * | OFF-03  | ST (attached again) | C1-DT-06 | the next question is offered and the instance's answer reaches the session |
 *
 * Retired:
 * - VAL-05 (the pile route with a malformed batch): the pile and its question route are deleted (slim §12).
 * - OFF-01/02/04 as written (the Permission requests plugin toggle, Fishball's session archived): those switches and the in-process session are gone (slim §12: "Hand over, watches and permission requests are always on"); the "Fishball off" state is now "no instance attached", which OFF-01..03 cover.
 * - The "no tag" parts: tag records were removed (slim T15).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PRESET } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import { A, Q, QSTUB, REFUSAL, assertStillOpen, bootQ, codeOf, qTools, quiet, refusedFrame, refuseShape, resultText, tokens, until } from './support/instance-stub-questions.mjs'

const { tok, cid } = tokens('VAL')
const LONG = { timeout: 120000 }
const L = QSTUB.limits
/** A question with n plain options (labels L1..Ln), multi-select when asked. */
const manyOptions = (text, n, multi = false) => [{ id: 'many', question: 'Pick some? ' + text, ...(multi ? { multi_select: true } : {}), options: Array.from({ length: n }, (_, i) => ({ label: 'L' + (i + 1) })) }]
/** n free-text questions (ids q1..qn). */
const manyQuestions = (text, n) => Array.from({ length: n }, (_, i) => ({ id: 'q' + (i + 1), question: 'Free ' + (i + 1) + '? ' + text }))
const free = (text) => [{ id: 'free', question: 'Name? ' + text }]

describe('Revision 11 rev11g on H-STUB: refused answers, bounds, children, and no instance', () => {
  const ctx = {}
  let q
  let x
  before(async () => {
    Object.assign(ctx, await bootQ('rev11g-validate'))
    q = qTools(ctx)
    x = await q.session('val-x')
  }, HOOK)
  after(async () => { await stopStub(ctx.booted) }, HOOK)

  /** Ask once with these questions; returns {card, offer, id}. */
  async function raised(label, questions) {
    const text = tok(label)
    const id = cid(label)
    const r = await q.ask(x, text, id, { questions: questions(text) })
    return { ...r, id, text }
  }
  /** The instance's answer is refused (any refusal) and the question stays open; it is then closed by your Stop. */
  async function refusedThenStop(r, label, payload, kind) {
    await refuseShape(q, x, r, r.id, label, payload, kind)
    await q.userStop(x)
  }
  /** The instance's answer is accepted and the result is exactly that batch. */
  async function accepted(r, answers) {
    assert.deepEqual((await q.answer(x, r.offer.approvalId, { answers })).payload, { accepted: true })
    assert.equal((await q.result(x, r.id)).text, resultText(answers))
    await q.waitIdle(x)
  }

  describe('VAL: a three-question batch', () => {
    // A refusal that closes the channel detaches the instance, and the question then goes to its own session only
    // (contract §5.1), so every malformed batch is tried on a question of its own.
    const ok = [{ id: 'color', selected: ['Red'] }, { id: 'parts', selected: ['Tests'] }, { id: 'name', selected: [], custom: 'a' }]
    const malformed = [
      ['an item missing', ok.slice(0, 2), REFUSAL.fit],
      ['empty answers', [], REFUSAL.shape],
      ['a duplicate id', [...ok, ok[0]], REFUSAL.shape],
      ['a question id twice, another missing', [ok[0], ok[0], ok[2]], REFUSAL.shape],
      ['an unknown id replacing one', [ok[0], ok[1], { id: 'other', selected: [], custom: 'a' }], REFUSAL.fit],
      ['an extra unknown id', [...ok, { id: 'other', selected: [], custom: 'a' }], REFUSAL.fit],
      ['a label that is not offered', [{ id: 'color', selected: ['Green'] }, ok[1], ok[2]], REFUSAL.fit],
      ['a label of another question', [{ id: 'color', selected: ['Docs'] }, ok[1], ok[2]], REFUSAL.fit],
      ['two labels on a single-select', [{ id: 'color', selected: ['Red', 'Blue'] }, ok[1], ok[2]], REFUSAL.fit],
      ['a label and custom text on a single-select', [{ id: 'color', selected: ['Red'], custom: 'x' }, ok[1], ok[2]], REFUSAL.fit],
      ['selected not a list', [{ id: 'color', selected: 'Red' }, ok[1], ok[2]], REFUSAL.shape],
      ['answers not a list', 'color=Red', REFUSAL.shape],
      ['a multi-select label not offered', [ok[0], { id: 'parts', selected: ['Docs', 'Nope'] }, ok[2]], REFUSAL.fit],
    ]
    for (const [label, answers, kind] of malformed) {
      it(`VAL-01 ${label}: refused (${kind === REFUSAL.fit ? 'bad-answer error frame' : 'limit-exceeded or invalid-envelope error frame, channel open'}); the question stays open`, T, async () => {
        await refusedThenStop(await raised('v', Q.mixed), label, { answers }, kind)
      })
    }
    it('VAL-02 after refused batches that leave the channel open (bad-answer), the same question accepts a good batch exactly', T, async () => {
      const r = await raised('v2', Q.mixed)
      for (const [label, answers] of [malformed[6], malformed[8], malformed[4]]) {
        assert.equal(codeOf(await refuseShape(q, x, r, r.id, label, { answers })), QSTUB.code.badAnswer, label)
      }
      await accepted(r, ok)
    })
  })

  describe('VAL-03 / VAL-04 boundaries of selection', () => {
    const multi = (t) => Q.mixed(t).slice(1, 2)
    const cases = [
      ['single: one label', Q.single, [{ id: 'color', selected: ['Blue'] }], true],
      ['single: one label and custom', Q.single, [{ id: 'color', selected: ['Blue'], custom: 'teal' }], REFUSAL.fit],
      ['single: custom alone', Q.single, [{ id: 'color', selected: [], custom: 'teal' }], true],
      ['single: neither (skipped)', Q.single, [{ id: 'color', selected: [] }], true],
      ['single: two labels', Q.single, [{ id: 'color', selected: ['Red', 'Blue'] }], REFUSAL.fit],
      ['multi: none', multi, [{ id: 'parts', selected: [] }], true],
      ['multi: one', multi, [{ id: 'parts', selected: ['Tests'] }], true],
      ['multi: all three', multi, [{ id: 'parts', selected: ['Docs', 'Tests', 'Code'] }], true],
      ['multi: all three and custom', multi, [{ id: 'parts', selected: ['Docs', 'Tests', 'Code'], custom: 'and CI' }], true],
      ['multi: the same label twice', multi, [{ id: 'parts', selected: ['Docs', 'Docs'] }], REFUSAL.shape],
    ]
    // The last column: true = accepted, otherwise the refusal kind (refuseShape).
    for (const [label, build, answers, outcome] of cases) {
      it(label + (outcome === true ? ': accepted' : ': refused'), T, async () => {
        const r = await raised('b', build)
        if (outcome === true) await accepted(r, answers)
        else await refusedThenStop(r, label, { answers }, outcome)
      })
    }
  })

  describe('VAL-06 text bounds (contract §8)', () => {
    const at = (n) => 'c'.repeat(n)
    const bounds = [
      ['customChars', free, (n) => ({ answers: [{ id: 'free', selected: [], custom: at(n) }] }), L.customChars],
      // The offered label is itself at most labelChars (an option label over it cannot be offered, §4.2), so 201 is a
      // selected label above the bound that is also not offered.
      ['labelChars (a selected label)', (t) => [{ id: 'long', question: 'Long? ' + t, options: [{ label: at(L.labelChars) }, { label: 'short' }] }], (n) => ({ answers: [{ id: 'long', selected: [at(n)] }] }), L.labelChars],
    ]
    for (const [name, build, payload, limit] of bounds) {
      it(`${name} ${limit}: accepted`, T, async () => { const r = await raised('t', build); await accepted(r, payload(limit).answers) })
      it(`${name} ${limit + 1}: refused; the question stays open`, T, async () => { const r = await raised('t', build); await refusedThenStop(r, name + ' over', payload(limit + 1), REFUSAL.shape) })
    }
    it(`noteChars ${L.noteChars} accepted; ${L.noteChars + 1} refused; the question stays open`, T, async () => {
      const r = await raised('n', Q.single)
      assert.deepEqual((await q.answer(x, r.offer.approvalId, { note: 'n'.repeat(L.noteChars) })).payload, { accepted: true })
      await assertStillOpen(q, x, r.card, r.id, 'a note is not an answer')
      await refusedThenStop(r, 'note over', { note: 'n'.repeat(L.noteChars + 1) }, REFUSAL.shape)
    })
  })

  describe('VAL-07 count bounds (contract §8)', () => {
    const answersFor = (n) => Array.from({ length: n }, (_, i) => ({ id: 'q' + (i + 1), selected: [], custom: 'a' }))
    it(`questionsPerRequest ${L.questionsPerRequest}: a ${L.questionsPerRequest}-question batch is accepted`, T, async () => {
      const r = await raised('c32', (t) => manyQuestions(t, L.questionsPerRequest))
      await accepted(r, answersFor(L.questionsPerRequest))
    })
    it(`questionsPerRequest ${L.questionsPerRequest + 1}: ${L.questionsPerRequest + 1} answers are refused`, T, async () => {
      const r = await raised('c33', (t) => manyQuestions(t, L.questionsPerRequest))
      await refusedThenStop(r, '33 answers', { answers: answersFor(L.questionsPerRequest + 1) }, REFUSAL.shape)
    })
    const labels = (n) => Array.from({ length: n }, (_, i) => 'L' + (i + 1))
    it(`selectedLabelsPerAnswer ${L.selectedLabelsPerAnswer}: accepted`, T, async () => {
      const r = await raised('s32', (t) => manyOptions(t, L.selectedLabelsPerAnswer + 1, true))
      await accepted(r, [{ id: 'many', selected: labels(L.selectedLabelsPerAnswer) }])
    })
    it(`selectedLabelsPerAnswer ${L.selectedLabelsPerAnswer + 1}: refused`, T, async () => {
      const r = await raised('s33', (t) => manyOptions(t, L.selectedLabelsPerAnswer + 1, true))
      await refusedThenStop(r, '33 labels', { answers: [{ id: 'many', selected: labels(L.selectedLabelsPerAnswer + 1) }] }, REFUSAL.shape)
    })
  })

  it('VAL-08 wrong scope: another session in the envelope, another session\'s question, a session that is yours', T, async () => {
    const y = await q.session('val-y')
    const r = await raised('w', Q.single)
    const other = await q.ask(y, tok('wy'), cid('wy'), { questions: Q.single(tok('wy')) })
    const envelope = await q.stub().op(QSTUB.op.questionAnswer, { sessionId: x, questionId: r.offer.approvalId, answers: A.single }, y)
    assert.equal(refusedFrame(envelope), true, 'envelope sessionId ≠ payload sessionId: ' + JSON.stringify(envelope))
    await q.reattachIfClosed()
    const crossed = await q.answer(y, r.offer.approvalId, { answers: A.single })
    assert.equal(refusedFrame(crossed), true, 'x\'s question answered as y\'s: ' + JSON.stringify(crossed))
    await q.reattachIfClosed()
    const own = await q.yours('val-yours')
    const yours = await q.answer(own, r.offer.approvalId, { answers: A.single })
    assert.equal(refusedFrame(yours), true, 'a session that is yours: ' + JSON.stringify(yours))
    await q.reattachIfClosed()
    await assertStillOpen(q, x, r.card, r.id, 'after the wrong scopes')
    await q.userStop(x)
    await q.userStop(y)
    assert.ok(other)
  })

  it('CHD-01 a subagent\'s question never reaches the instance', T, async () => {
    const parent = await q.session('chd', PRESET.standard)
    const marker = tok('child')
    const qtext = tok('childq')
    const childId = cid('child')
    await q.host().call('queueMarker', { marker, except: parent, script: [[{ tool: 'ask_user_question', args: { questions: Q.single(qtext) }, id: childId }], [{ text: 'child done' }]] })
    const first = await q.cardCount()
    await q.host().call('drive', { sessionId: parent, script: [[{ tool: 'subagent', args: { description: 'fbtest sub', prompt: marker + ' please' } }], [{ text: 'parent done' }]], text: 'delegate' })
    assert.ok(await until(async () => (await q.host().call('markerState', { marker })).left === 0, QSTUB.resultWaitMs, QSTUB.pollMs), 'the child ran its script')
    const [child] = (await q.host().call('markerState', { marker })).sessions
    assert.ok(child && child !== parent)
    await quiet()
    const seen = (await q.host().call('requests', { sessionId: child })).map((x2) => x2.texts).join('\n')
    assert.match(seen, /another live agent|unavailable|delegated|human interaction/i, 'the child\'s call failed: no human can answer it')
    assert.equal(await q.cardCount(), first, 'no card in any session')
    assert.equal(await q.toldAbout(qtext), false, 'nothing reached the instance')
  })

  describe('no instance attached (contract §9)', () => {
    it('OFF-01 detached: the question shows in its own card at once, is not offered, and is never offered later', LONG, async () => {
      await q.stub().detach()
      const text = tok('o1')
      const id = cid('o1')
      const t0 = Date.now()
      const { card } = await q.ask(x, text, id, { questions: Q.single(text), offer: false })
      assert.ok(Date.now() - t0 < QSTUB.atOnceMs, 'at once, not after approvalAnswerSeconds')
      assert.equal(await q.qAnswer(x, A.single), true)
      assert.equal((await q.result(x, id)).text, resultText(A.single))
      await q.waitIdle(x)
      assert.ok(card)
      const a = await q.stub().attach()
      assert.ok(a.ok)
      await quiet()
      assert.equal(await q.toldAbout(text), false, 'nothing arrives for it after the attach')
    })

    it('OFF-02 the instance detaches while a question waits for it: only its own card; not offered again', LONG, async () => {
      const text = tok('o2')
      const id = cid('o2')
      const r = await q.ask(x, text, id, { questions: Q.single(text) })
      await q.stub().detach()
      await quiet()
      await assertStillOpen(q, x, r.card, id, 'after the detach')
      assert.ok((await q.stub().attach()).ok)
      await quiet()
      assert.deepEqual(await q.listed(x), [], 'not offered again after the new handshake (§5.1)')
      assert.equal(codeOf(await q.answer(x, r.offer.approvalId, { answers: A.single })), QSTUB.code.expired)
      assert.equal(await q.qAnswer(x, A.single), true)
      assert.equal((await q.result(x, id)).text, resultText(A.single))
      await q.waitIdle(x)
    })

    it('OFF-03 attached again: the next question is offered and the instance\'s answer reaches the session', LONG, async () => {
      const r = await raised('o3', Q.single)
      assert.ok(r.offer, 'offered')
      await accepted(r, A.single)
    })
  })
})
