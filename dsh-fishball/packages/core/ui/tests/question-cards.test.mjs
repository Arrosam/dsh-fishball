// Fishball's question forms in the composer dock, with the page stream and answer route scripted.
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { FORM, batch, batchAnswers, freeBatch, freeAnswers } from 'fishball-test-helpers/manager-question-cards'
import { byAttr, findAll, textOf } from 'fishball-test-helpers/react-shim'
import { settle } from 'fishball-test-helpers/scripted-page'
import { ASK, askFrame } from './support/ask-card.mjs'
import { PAGE_STREAM } from './support/page-stream.mjs'
import { uiPage } from './support/ui-page.mjs'

const UI = Object.freeze({
  manager: 'manager-dock', other: 'other-dock',
  when: Date.UTC(2026, 0, 1), post: 'POST', ok: 200,
})
const card = (cardId, questions) => ({
  kind: FORM.kind, cardId, handle: cardId, sessionId: FORM.sessionId, state: FORM.open, askedAt: UI.when, questions,
})
const multi = card(FORM.cardA, batch)
const free = card(FORM.cardB, freeBatch)

async function openPage(t) {
  const p = await uiPage(t, {
    prepareWorld(world) { world.route(FORM.answer, () => ({ status: UI.ok, json: { ok: true } }), { method: UI.post }) },
  })
  const { world } = p
  assert.ok(world.entries(FORM.slot).length > 0, 'question cards belong in the composer permission dock')
  await p.mountAll(UI.manager, FORM.slot, { sessionId: FORM.sessionId })
  await p.mountAll(UI.other, FORM.slot, { sessionId: FORM.otherSessionId })
  const cards = (name = UI.manager, id) => byAttr(world.entries(FORM.slot).flatMap((_entry, i) => world.shim.treeOf(name + i)), ASK.card, id)
  return {
    cards,
    card(id) {
      const [item] = cards(UI.manager, id)
      assert.ok(item, 'missing visible card ' + id)
      return item.children
    },
    async show(cards) {
      assert.ok(p.carriers().length > 0, 'page did not connect to its SSE stream')
      await p.deliver(PAGE_STREAM.topic.asks, askFrame(cards, FORM.sessionId))
    },
    answers: () => world.fetches.filter(({ path, method }) => path === FORM.answer && method === UI.post).map((call) => call.json()),
  }
}

function toggleOf(page, id, expanded) {
  const [toggle] = byAttr(page.card(id), ASK.expanded)
  assert.ok(toggle, 'pending card should provide an accessible accordion toggle: ' + id)
  assert.equal(String(toggle.props[ASK.expanded]), String(expanded))
  return toggle
}

async function press(node) {
  assert.ok(!node.props.disabled && typeof node.props.onClick === 'function', 'control must be actionable: ' + textOf(node))
  node.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
  await settle()
}

async function choose(page, id, label) {
  const tree = page.card(id)
  const controls = findAll(tree, (node) => textOf(node).includes(label) && typeof node.props.onClick === 'function')
  if (controls.length) return press(controls.at(-1))
  const [nativeLabel] = findAll(tree, (node) => node.tag === 'label' && textOf(node).includes(label))
  const input = findAll(nativeLabel?.children ?? [], (node) => node.tag === 'input')[0] ??
    findAll(tree, (node) => node.tag === 'input' && (
      (nativeLabel?.props.htmlFor !== undefined && node.props.id === nativeLabel.props.htmlFor) ||
      node.props['aria-label'] === label || node.props.value === label
    ))[0]
  assert.ok(input && !input.props.disabled && typeof input.props.onChange === 'function', 'no actionable choice for ' + label)
  const target = { checked: !input.props.checked, value: input.props.value }
  input.props.onChange({ target, currentTarget: target })
  await settle()
}

async function submit(page, id) {
  const [button] = findAll(page.card(id), (node) => node.tag === 'button' && /^(?:submit|send|answer)\b/i.test(textOf(node).trim()))
  assert.ok(button, 'expanded card must provide an answer action')
  const [form] = findAll(page.card(id), (node) => node.tag === 'form' && typeof node.props.onSubmit === 'function')
  if (button.props.onClick) await press(button)
  else {
    assert.ok(form && !button.props.disabled, 'form answer action must be enabled')
    form.props.onSubmit({ preventDefault() {}, stopPropagation() {} })
    await settle()
  }
}

function expectCollapsed(page) {
  const withHeader = toggleOf(page, multi.cardId, false)
  const withoutHeader = toggleOf(page, free.cardId, false)
  const header = textOf(withHeader)
  assert.ok(header.includes(FORM.first.header), 'summary should use the supplied header')
  assert.match(header, /\b2\b/, 'summary should show a question count for a multi-question card')
  assert.ok(textOf(withoutHeader).includes(FORM.free.question), 'a short question should be the fallback summary')
  assert.ok(!findAll(page.card(free.cardId), (node) => ['textarea', 'input'].includes(node.tag)).length)
  assert.ok(!page.card(multi.cardId).map(textOf).join('').includes(FORM.first.options[0].label), 'collapsed choices should not be visible')
}

caseTest('ASK-QUESTIONS-ST-01', 'disclosure and ownership', 'multiple pending cards are collapsed on page load and use a header, question fallback and count badge', async (t) => {
  const page = await openPage(t)
  assert.deepEqual(page.cards(), [])
  const foreign = { ...free, cardId: FORM.otherSessionId, handle: FORM.otherSessionId, sessionId: FORM.otherSessionId }
  await page.show([multi, free, foreign])
  expectCollapsed(page)
  assert.deepEqual(page.cards().map((item) => item.props[ASK.card]).sort(), [multi.cardId, free.cardId].sort(), 'the manager should not see a card from another session')
  assert.deepEqual(page.cards(UI.other), [], 'another session must not show manager cards')
  await press(toggleOf(page, multi.cardId, false))
  toggleOf(page, multi.cardId, true)
  toggleOf(page, free.cardId, false)
  await press(toggleOf(page, multi.cardId, true))
  expectCollapsed(page)
  assert.deepEqual(page.answers(), [], 'expanding and collapsing should not answer anything')
})

caseTest('ASK-QUESTIONS-ST-02', 'answer forms', 'question forms send the correct card and question ids for free text, single-choice and multi-choice answers', async (t) => {
  const page = await openPage(t)
  await page.show([multi])
  await page.show([multi, free])
  expectCollapsed(page)

  await press(toggleOf(page, free.cardId, false))
  const [field] = findAll(page.card(free.cardId), (node) => ['input', 'textarea'].includes(node.tag) && typeof node.props.onChange === 'function')
  assert.ok(field, 'optionless question should accept free text')
  field.props.onChange({ target: { value: FORM.text }, currentTarget: { value: FORM.text } })
  await settle()
  await submit(page, free.cardId)
  assert.deepEqual(page.answers(), [{ cardId: free.cardId, answers: freeAnswers }])
  await page.show([multi, { ...free, state: ASK.state.answered }])
  assert.deepEqual(page.cards().map((item) => item.props[ASK.card]), [multi.cardId], 'settling a card withdraws only its form')

  const [toggle] = byAttr(page.card(multi.cardId), ASK.expanded)
  if (String(toggle?.props[ASK.expanded]) === 'false') await press(toggle)
  await choose(page, multi.cardId, FORM.first.options[1].label)
  await choose(page, multi.cardId, FORM.first.options[0].label)
  for (const { label } of FORM.second.options) await choose(page, multi.cardId, label)
  await submit(page, multi.cardId)
  assert.deepEqual(page.answers(), [{ cardId: free.cardId, answers: freeAnswers }, { cardId: multi.cardId, answers: batchAnswers }])
  await page.show([{ ...multi, state: ASK.state.answered }, { ...free, state: ASK.state.answered }])
  assert.deepEqual(page.cards(), [], 'settled cards must no longer occupy the permission dock')
})
