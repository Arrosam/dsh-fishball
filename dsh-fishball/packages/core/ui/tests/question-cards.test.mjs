// Fishball's question forms in the composer dock, with the page stream and answer route scripted.
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { FORM, batch, batchAnswers, freeBatch, freeAnswers } from 'fishball-test-helpers/manager-question-cards'
import { byAttr, edit, findAll, textOf, walk } from 'fishball-test-helpers/react-shim'
import { settle } from 'fishball-test-helpers/scripted-page'
import { ASK, askCard, askCards, askFrame } from './support/ask-card.mjs'
import { ASK_SOURCE } from './support/b-targets.mjs'
import { PAGE_STREAM } from './support/page-stream.mjs'
import { uiPage } from './support/ui-page.mjs'

const UI = Object.freeze({
  manager: 'manager-dock', other: 'other-dock',
  when: Date.UTC(2026, 0, 1), post: 'POST', ok: 200,
  pileTitle: 'Waiting for you', send: 'Send answer', skip: 'Skip', allow: 'Allow once', reject: 'Reject',
  countLimit: 99,
})
const card = (cardId, questions) => ({
  kind: FORM.kind, cardId, handle: cardId, sessionId: FORM.sessionId, state: FORM.open, askedAt: UI.when, questions,
})
const multi = card(FORM.cardA, batch)
const free = card(FORM.cardB, freeBatch)
const LONG = Object.freeze({
  id: 'rollout-card',
  notes: { ...FORM.free, id: 'notes' },
  skip: { id: 'release-date', question: 'When should the release start?', options: [{ label: 'Today' }] },
})
const long = card(LONG.id, [...batch, LONG.notes, LONG.skip])

async function openPage(t) {
  const p = await uiPage(t, {
    prepareWorld(world) { world.route(FORM.answer, () => ({ status: UI.ok, json: { ok: true } }), { method: UI.post }) },
  })
  const { world } = p
  assert.ok(world.entries(FORM.slot).length > 0, 'question cards belong in the composer permission dock')
  await p.mountAll(UI.manager, FORM.slot, { sessionId: FORM.sessionId })
  await p.mountAll(UI.other, FORM.slot, { sessionId: FORM.otherSessionId })
  const rows = (name = UI.manager) => byAttr(world.entries(FORM.slot).flatMap((_entry, i) => world.shim.treeOf(name + i)), ASK.card)
  return {
    rows,
    dock: p.tree,
    styles: () => world.document.head.querySelectorAll('style').map((style) => style.textContent).join('\n'),
    async show(cards) {
      assert.ok(p.carriers().length > 0, 'page did not connect to its SSE stream')
      await p.deliver(PAGE_STREAM.topic.asks, askFrame(cards, FORM.sessionId))
    },
    answers: (route = FORM.answer) => world.fetches.filter(({ path, method }) => path === route && method === UI.post).map((call) => call.json()),
  }
}

const summary = ({ header, question }) => header ?? question
const disclosure = (row) => byAttr(row.children, ASK.expanded)[0]
const namedRows = (page, prompt) => page.rows().filter((row) => textOf(disclosure(row)).includes(summary(prompt)))
const visibleButton = (tree, label) => findAll(tree, (node) => node.tag === 'button' && textOf(node).trim() === label)[0]

function rowFor(page, prompt) {
  const matches = namedRows(page, prompt)
  assert.equal(matches.length, 1, 'expected one row for ' + summary(prompt))
  return matches[0]
}

function toggleOf(page, prompt, expanded) {
  const toggle = disclosure(rowFor(page, prompt))
  assert.equal(String(toggle.props[ASK.expanded]), String(expanded), summary(prompt))
  return toggle
}

async function expand(page, prompt) {
  await press(toggleOf(page, prompt, false))
  toggleOf(page, prompt, true)
  assert.equal(page.rows().filter((row) => String(disclosure(row)?.props[ASK.expanded]) === 'true').length, 1,
    'only one question or permission row may be open')
}

async function press(node) {
  assert.ok(node && !node.props.disabled && typeof node.props.onClick === 'function', 'control must be actionable: ' + textOf(node))
  node.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
  await settle()
}

const option = (page, prompt, label) => findAll(rowFor(page, prompt).children, (node) =>
  node.tag === 'input' && node.props.value === label)[0]

async function choose(page, prompt, label) {
  const input = option(page, prompt, label)
  assert.ok(input && !input.props.disabled && typeof input.props.onChange === 'function', 'no actionable choice for ' + label)
  const target = { checked: !input.props.checked, value: input.props.value }
  input.props.onChange({ target, currentTarget: target })
  await settle()
}

function textField(page, prompt) {
  const [field] = findAll(rowFor(page, prompt).children, (node) => node.tag === 'textarea' || node.tag === 'input' && node.props.type === 'text')
  assert.ok(field && !field.props.disabled && typeof field.props.onChange === 'function', 'missing editable field: ' + summary(prompt))
  return field
}

async function writeAnswer(page, prompt, text) {
  edit(textField(page, prompt), text)
  await settle()
}

const rowAction = (page, prompt, label) => visibleButton(rowFor(page, prompt).children, label)
const postFor = (ask, answer) => ({ cardId: ask.cardId, answers: [answer] })

caseTest('ASK-QUESTIONS-ST-01', 'disclosure and ownership', 'each question has its own collapsed row, with a header or question fallback', async (t) => {
  const page = await openPage(t)
  assert.deepEqual(page.rows(), [])
  const foreign = { ...free, cardId: FORM.otherSessionId, handle: FORM.otherSessionId, sessionId: FORM.otherSessionId }
  await page.show([multi, free, foreign])
  const questions = [...multi.questions, ...free.questions]
  expectPile(page, questions.length)
  assert.deepEqual(page.rows(UI.other), [], 'another session must not show manager cards')
  for (const prompt of questions) {
    toggleOf(page, prompt, false)
    assert.equal(rowAction(page, prompt, UI.send), undefined, 'a collapsed question must hide its answer controls')
  }
  await expand(page, FORM.first)
  await expand(page, FORM.second)
  toggleOf(page, FORM.first, false)
  await press(toggleOf(page, FORM.second, true))
  toggleOf(page, FORM.second, false)
  assert.deepEqual(page.answers(), [], 'expanding and collapsing should not answer anything')
})

caseTest('ASK-QUESTIONS-ST-02', 'answer forms', 'single-choice, multi-choice and free-text drafts stay separate even when cards share a question id', async (t) => {
  const page = await openPage(t)
  await page.show([multi, free])
  const [preview, stable] = FORM.first.options.map(({ label }) => label)
  await expand(page, FORM.first)
  await choose(page, FORM.first, stable)
  await choose(page, FORM.first, preview)
  assert.equal(option(page, FORM.first, stable).props.checked, false, 'a radio answer replaces the previous choice')
  await expand(page, FORM.second)
  assert.ok(FORM.second.options.every(({ label }) => !option(page, FORM.second, label).props.checked))
  for (const { label } of FORM.second.options) await choose(page, FORM.second, label)
  await expand(page, FORM.free)
  assert.equal(textField(page, FORM.free).props.value, '', 'the equal id on another card must not inherit the first draft')
  await writeAnswer(page, FORM.free, FORM.text)
  await expand(page, FORM.first)
  assert.equal(option(page, FORM.first, preview).props.checked, true, 'the first row must retain its draft across collapses')
  await press(rowAction(page, FORM.first, UI.send))
  const expected = [postFor(multi, batchAnswers[0])]
  assert.deepEqual(page.answers(), expected)
  for (const prompt of [FORM.second, FORM.free]) rowFor(page, prompt)
  await page.show([{ ...multi, questions: [FORM.second] }, free])
  expectPile(page, 2)
  await expand(page, FORM.free)
  assert.equal(textField(page, FORM.free).props.value, FORM.text, 'the other card must retain its draft after a Send')
  await press(rowAction(page, FORM.free, UI.send))
  expected.push(postFor(free, freeAnswers[0]))
  assert.deepEqual(page.answers(), expected)
  rowFor(page, FORM.second)
  await page.show([{ ...multi, questions: [FORM.second] }, { ...free, state: ASK.state.answered }])
  expectPile(page, 1)
  const remaining = disclosure(rowFor(page, FORM.second))
  if (String(remaining.props[ASK.expanded]) === 'false') await expand(page, FORM.second)
  assert.ok(FORM.second.options.every(({ label }) => option(page, FORM.second, label).props.checked), 'the sibling row must retain its draft after another Send')
  await press(rowAction(page, FORM.second, UI.send))
  expected.push(postFor(multi, batchAnswers[1]))
  assert.deepEqual(page.answers(), expected)
  await page.show([{ ...multi, state: ASK.state.answered }])
  assert.deepEqual(page.rows(), [], 'settled requests must leave the dock')
})

// This is a style contract, not a geometry measurement. Match the class-based
// layout rules in the mounted sheets against the rendered ancestry.
function matchesLayoutRule(node, selector, parents) {
  const [last, ...ancestors] = selector.trim().split(/\s*>\s*/).reverse()
  const match = /^\.([\w-]+)$|^:not\(\.([\w-]+)\)$/.exec(last)
  if (!node || !match) return false
  const [, name, excluded] = match
  const classes = String(node.props.className ?? '').split(/\s+/)
  return (name ? classes.includes(name) : !classes.includes(excluded)) &&
    (!ancestors.length || matchesLayoutRule(parents.get(node), ancestors.reverse().join('>'), parents))
}

const overflowY = (style) => style['overflow-y'] ?? style.overflow?.split(/\s+/).at(-1)
const scrollsY = (style) => ['auto', 'scroll'].includes(overflowY(style))
const hasHeightBound = (style) => ['max-height', 'max-block-size', 'height', 'block-size'].some((name) =>
  style[name] && !['auto', 'none', 'max-content', 'min-content'].includes(style[name]))
function dockLayout(tree, css) {
  const parents = new Map([...walk(tree)].map(({ node, parent }) => [node, parent]))
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const styles = new Map([...parents.keys()].map((node) => {
    const declarations = rules.filter(([, selectors]) => selectors.split(',').some((selector) => matchesLayoutRule(node, selector, parents)))
      .flatMap(([, , body]) => [...body.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map(([, key, value]) => [key, value.trim()]))
    const inline = Object.entries(node.props.style ?? {}).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()), String(value)])
    return [node, Object.fromEntries([...declarations, ...inline])]
  }))
  const styleOf = (node) => styles.get(node) ?? {}
  const ancestry = function* (node) {
    for (let at = node; at; at = parents.get(at)) yield at
  }
  return { ancestry, styleOf }
}

function fieldFor(tree, question) {
  return findAll(tree, (node) => node.tag === 'fieldset' &&
    node.children.some((child) => child.tag === 'legend' && textOf(child) === question.question))[0]
}

caseTest('ASK-QUESTIONS-ST-03', 'long-card reachability', 'four questions share a bounded pile and reveal only one question form at a time', async (t) => {
  const page = await openPage(t)
  await page.show([long])
  expectPile(page, long.questions.length)
  for (const prompt of long.questions) {
    await expand(page, prompt)
    const pile = expectPile(page, long.questions.length)
    const { ancestry, styleOf } = dockLayout(page.dock(), page.styles())
    assert.ok(hasHeightBound(styleOf(pile)) && scrollsY(styleOf(pile)), 'the shared pile must be height-bounded and scroll vertically')
    const fields = findAll(page.dock(), (node) => node.tag === 'fieldset')
    const field = fieldFor(rowFor(page, prompt).children, prompt)
    assert.ok(field, 'missing question controls: ' + prompt.question)
    assert.deepEqual(fields, [field], 'expanding a row renders only its own question controls')
    const send = rowAction(page, prompt, UI.send)
    assert.ok(send, 'the open row must have its own Send action')
    for (const control of [field, send]) {
      const path = [...ancestry(control)]
      assert.ok(path.includes(pile), 'all question controls must be reachable in the shared scroller')
      for (const item of path.slice(0, path.indexOf(pile))) {
        const style = styleOf(item)
        assert.ok(!hasHeightBound(style) || !['hidden', 'clip'].includes(overflowY(style)),
          'a bounded descendant must not clip the question controls')
      }
    }
  }
})

caseTest('ASK-QUESTIONS-ST-04', 'explicit skip', 'Skip replaces a draft without sending; Send then posts an empty singleton answer', async (t) => {
  const page = await openPage(t)
  await page.show([long])
  await expand(page, LONG.skip)
  assert.ok(rowAction(page, LONG.skip, UI.send)?.props.disabled, 'Send must wait for an answer or an explicit Skip')
  await choose(page, LONG.skip, LONG.skip.options[0].label)
  await press(rowAction(page, LONG.skip, UI.skip))
  assert.deepEqual(page.answers(), [], 'Skip must not submit')
  await press(rowAction(page, LONG.skip, UI.send))
  assert.deepEqual(page.answers(), [postFor(long, { id: LONG.skip.id, selected: [] })])
  const remaining = long.questions.filter((prompt) => prompt !== LONG.skip)
  for (const prompt of remaining) rowFor(page, prompt)
  await page.show([{ ...long, questions: remaining }])
  expectPile(page, remaining.length)
  assert.deepEqual(namedRows(page, LONG.skip), [], 'only the answered question leaves the pile')
})

const ownsText = (node, text) => node.children.some((child) => typeof child === 'string' && child.includes(text))
const pileHeading = (tree) => findAll(tree, (node) => ownsText(node, UI.pileTitle))

function expectPile(page, count) {
  const tree = page.dock()
  const [heading, ...duplicates] = pileHeading(tree)
  assert.ok(heading, 'dock must have a visible Waiting for you heading')
  assert.equal(duplicates.length, 0, 'approval and question rows must not repeat the pile heading')
  const parents = new Map([...walk(tree)].map(({ node, parent }) => [node, parent]))
  let header = heading
  while (parents.has(header) && !byAttr([parents.get(header)], ASK.card).length) header = parents.get(header)
  const expected = count > UI.countLimit ? UI.countLimit + '+' : String(count)
  const headerText = textOf(header).replace(UI.pileTitle, '').replace(/[\s()]/g, '')
  assert.equal(headerText, expected, 'the single heading must carry the total pending row count')
  const pile = parents.get(header)
  assert.ok(pile, 'the heading must belong to the same surface as the request rows')
  assert.equal(byAttr([pile], ASK.card).length, count, 'all open request rows must live in the one shared pile')
  return pile
}

caseTest('ASK-PILE-BVA-01', '0, 1, 2, 99 and 100', 'one shared Waiting for you heading counts open permission and question rows and caps only the badge', async (t) => {
  const page = await openPage(t)
  assert.deepEqual(pileHeading(page.dock()), [], 'no empty heading')
  await page.show([free])
  expectPile(page, 1)
  toggleOf(page, FORM.free, true)
  const approvals = askCards(UI.countLimit)
  const history = askCard({ state: ASK.state.answered })
  for (const count of [batch.length, batch.length + 1, UI.countLimit, UI.countLimit + 1]) {
    await page.show([multi, ...approvals.slice(0, count - batch.length), history])
    const pile = expectPile(page, count)
    if (count === batch.length + 1) {
      const { styleOf } = dockLayout(page.dock(), page.styles())
      const surface = styleOf(pile)
      assert.match(surface['background-color'] ?? surface.background ?? '', /var\(--dsw-[\w-]*layer-1\b/,
        'the pile should sit on one neutral layer-1 surface')
    }
    for (const prompt of batch) toggleOf(page, prompt, false)
  }
  await page.show([{ ...multi, state: ASK.state.voided }, history])
  assert.deepEqual(pileHeading(page.dock()), [], 'finished cards do not leave a pile behind')
})

caseTest('ASK-PILE-ST-01', 'mixed accordion', 'permission and question rows disclose exclusively and keep their distinct controls', async (t) => {
  const page = await openPage(t)
  const approval = askCard()
  await page.show([multi, approval])
  expectPile(page, batch.length + 1)
  assert.equal(rowAction(page, approval, UI.allow), undefined)
  for (const [prompt, type] of [[FORM.first, 'radio'], [FORM.second, 'checkbox']]) {
    await expand(page, prompt)
    const fieldset = fieldFor(rowFor(page, prompt).children, prompt)
    assert.ok(fieldset, 'missing choice group for ' + prompt.question)
    assert.equal(findAll([fieldset], (node) => node.props.type === type || node.props.role === type).length, prompt.options.length)
    assert.ok(rowAction(page, prompt, UI.send), 'the answer action must visibly say Send answer')
  }

  await expand(page, approval)
  toggleOf(page, FORM.second, false)
  assert.ok(!textField(page, approval).props.required, 'approval provides an optional reason field')
  for (const [label, choice] of [[UI.allow, ASK.choices.allow], [UI.reject, ASK.choices.reject]]) {
    const button = rowAction(page, approval, label)
    assert.ok(button, 'the approval action must visibly say ' + label)
    assert.equal(button.props[ASK.choice], choice, 'approval actions must remain distinct')
  }
  assert.deepEqual(page.answers(), [], 'disclosure does not send a question or approval reply')
  await writeAnswer(page, approval, FORM.text)
  await press(rowAction(page, approval, UI.allow))
  assert.deepEqual(page.answers(ASK_SOURCE.answerPath), [{ handle: approval.handle, choice: ASK.choices.allow, text: FORM.text }])
})
