import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byAttr, findAll, textOf } from '../../../test/support/rp-recommend.mjs'
import { sdkRuntime } from '../../../test/v2-page-cases/lite-browser.mjs'
import { eventSourceClass, isPageStream, PAGE_STREAM, pageMessage } from '../../../test/v3/fishball-ui/stream/event-source.mjs'
import { createWorld, loadPage, settle } from '../../../test/v3/fishball-core/settings/page.mjs'
import { FORM, batch, batchAnswers, freeBatch, freeAnswers } from './fixtures/manager-question-cards.mjs'

const UI = Object.freeze({
  sdk: '0.2.2-rc.3', card: 'data-fishball-ask', expanded: 'aria-expanded',
  manager: 'manager-dock', other: 'other-dock', answered: 'answered',
  when: Date.UTC(2026, 0, 1), post: 'POST', ok: 200,
})
const options = { skip: !sdkRuntime(UI.sdk) && 'DSH ' + UI.sdk + ' is not installed' }
const card = (cardId, questions) => ({
  kind: FORM.kind, cardId, handle: cardId, sessionId: FORM.sessionId, state: FORM.open, askedAt: UI.when, questions,
})
const multi = card(FORM.cardA, batch)
const free = card(FORM.cardB, freeBatch)

async function openPage(t) {
  const { EventSource, opened } = eventSourceClass()
  const world = createWorld({ sdk: UI.sdk })
  world.EventSource = EventSource
  const answerUrl = new URL(FORM.answer.slice(1), world.base).href
  world.fetchOther = ({ url }) => url === answerUrl ? { status: UI.ok, json: { ok: true } } : { status: 404 }
  await loadPage(t, world)
  const entries = world.entries(FORM.slot)
  assert.ok(entries.length > 0, 'question cards belong in the composer permission dock')
  for (const [name, sessionId] of [[UI.manager, FORM.sessionId], [UI.other, FORM.otherSessionId]]) {
    for (const [index, entry] of entries.entries()) world.shim.mount(name + index, () => world.renderEntry(entry, { sessionId }))
  }
  await settle()
  const tree = (name) => entries.flatMap((_entry, index) => world.shim.treeOf(name + index))
  return {
    cards: (name = UI.manager) => byAttr(tree(name), UI.card),
    card(id) {
      const [item] = byAttr(tree(UI.manager), UI.card, id)
      assert.ok(item, 'missing visible card ' + id)
      return item.children
    },
    async show(cards) {
      const streams = opened.filter((source) => isPageStream(source, world.base) && !source.closed)
      assert.ok(streams.length > 0, 'page did not connect to its SSE stream')
      for (const source of streams) source.deliver(pageMessage(PAGE_STREAM.topic.asks, { managerSessionId: FORM.sessionId, cards }))
      await settle()
    },
    answers: () => world.fetches.filter(({ url, method }) => url === answerUrl && method === UI.post).map(({ body }) => JSON.parse(body)),
  }
}

function toggleOf(page, id, expanded) {
  const [toggle] = byAttr(page.card(id), UI.expanded)
  assert.ok(toggle, 'pending card should provide an accessible accordion toggle: ' + id)
  assert.equal(String(toggle.props[UI.expanded]), String(expanded))
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

test('multiple pending cards are collapsed on page load and use a header, question fallback and count badge', options, async (t) => {
  const page = await openPage(t)
  assert.deepEqual(page.cards(), [])
  const foreign = { ...free, cardId: FORM.otherSessionId, handle: FORM.otherSessionId, sessionId: FORM.otherSessionId }
  await page.show([multi, free, foreign])
  expectCollapsed(page)
  assert.deepEqual(page.cards().map((item) => item.props[UI.card]).sort(), [multi.cardId, free.cardId].sort(), 'the manager should not see a card from another session')
  assert.deepEqual(page.cards(UI.other), [], 'another session must not show manager cards')
  await press(toggleOf(page, multi.cardId, false))
  toggleOf(page, multi.cardId, true)
  toggleOf(page, free.cardId, false)
  await press(toggleOf(page, multi.cardId, true))
  expectCollapsed(page)
  assert.deepEqual(page.answers(), [], 'expanding and collapsing should not answer anything')
})

test('question forms send the correct card and question ids for free text, single-choice and multi-choice answers', options, async (t) => {
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
  await page.show([multi, { ...free, state: UI.answered }])
  assert.deepEqual(page.cards().map((item) => item.props[UI.card]), [multi.cardId], 'settling a card withdraws only its form')

  const [toggle] = byAttr(page.card(multi.cardId), UI.expanded)
  if (String(toggle?.props[UI.expanded]) === 'false') await press(toggle)
  await choose(page, multi.cardId, FORM.first.options[1].label)
  await choose(page, multi.cardId, FORM.first.options[0].label)
  for (const { label } of FORM.second.options) await choose(page, multi.cardId, label)
  await submit(page, multi.cardId)
  assert.deepEqual(page.answers(), [{ cardId: free.cardId, answers: freeAnswers }, { cardId: multi.cardId, answers: batchAnswers }])
  await page.show([{ ...multi, state: UI.answered }, { ...free, state: UI.answered }])
  assert.deepEqual(page.cards(), [], 'settled cards must no longer occupy the permission dock')
})
