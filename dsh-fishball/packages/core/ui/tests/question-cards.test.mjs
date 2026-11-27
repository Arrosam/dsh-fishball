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
  submit: /^(?:submit|send|answer)\b/i, skip: /^skip$/i, next: /^next\b/i,
  pileTitle: 'Waiting for you', send: 'Send answer', allow: 'Allow once', reject: 'Reject',
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
  const cards = (name = UI.manager, id) => byAttr(world.entries(FORM.slot).flatMap((_entry, i) => world.shim.treeOf(name + i)), ASK.card, id)
  return {
    cards,
    dock: p.tree,
    styles: () => world.document.head.querySelectorAll('style').map((style) => style.textContent).join('\n'),
    card(id) {
      const [item] = cards(UI.manager, id)
      assert.ok(item, 'missing visible card ' + id)
      return item.children
    },
    async show(cards) {
      assert.ok(p.carriers().length > 0, 'page did not connect to its SSE stream')
      await p.deliver(PAGE_STREAM.topic.asks, askFrame(cards, FORM.sessionId))
    },
    answers: (route = FORM.answer) => world.fetches.filter(({ path, method }) => path === route && method === UI.post).map((call) => call.json()),
  }
}

function toggleOf(page, id, expanded) {
  const [toggle] = byAttr(page.card(id), ASK.expanded)
  assert.ok(toggle, 'pending card should provide an accessible accordion toggle: ' + id)
  assert.equal(String(toggle.props[ASK.expanded]), String(expanded))
  return toggle
}

async function press(node) {
  assert.ok(node && !node.props.disabled && typeof node.props.onClick === 'function', 'control must be actionable: ' + textOf(node))
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

const action = (tree, name) => findAll(tree, (node) => node.tag === 'button' && name.test((node.props['aria-label'] ?? textOf(node)).trim()))[0]

async function submit(page, id) {
  const button = action(page.card(id), UI.submit)
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
  edit(field, FORM.text)
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
const minHeight = (style) => style['min-height'] ?? style['min-block-size']
const flexShrinks = (style) => style.flex !== 'none' &&
  (style['flex-shrink'] ?? style.flex?.split(/\s+/)[1]) !== '0'

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
  const children = (node) => node.children.filter((child) => styles.has(child))
  const column = (node) => ['flex', 'inline-flex'].includes(styleOf(node).display) && styleOf(node)['flex-direction'] === 'column'
  const takesRemainingHeight = (node) => flexShrinks(styleOf(node)) &&
    (scrollsY(styleOf(node)) || /^0(?:px)?$/.test(minHeight(styleOf(node)) ?? ''))
  // A capped column can pass its height constraint through shrinkable items, even
  // when the scroller itself has no height declaration.
  const scrollRegions = (node) => scrollsY(styleOf(node)) ? [node] : column(node)
    ? children(node).filter(takesRemainingHeight).flatMap(scrollRegions) : []

  function reachable(control) {
    const path = new Set()
    let hasScrollPath = false
    for (const node of ancestry(control)) {
      path.add(node)
      const style = styleOf(node)
      const parent = styleOf(parents.get(node))
      const clipped = ['hidden', 'clip'].includes(overflowY(style))
      // An outer scrollport cannot reveal the content of a clipped intrinsic grid item.
      if (clipped && parent.display === 'grid' && !['max-content', 'min-content'].includes(parent['grid-auto-rows']) &&
        !['min-content', 'max-content'].includes(minHeight(style))) return false
      if (!hasHeightBound(style)) continue
      if (scrollsY(style)) hasScrollPath = true
      if (!clipped) continue
      if (scrollRegions(node).some((region) => path.has(region))) hasScrollPath = true
      else if (!hasScrollPath && ![...path].some((item) => {
        const flexParent = parents.get(item)
        // An unshrinkable footer can stay outside the scrollport when a sibling
        // absorbs the height constraint. A clipped cap without either path fails.
        return path.has(flexParent) && column(flexParent) && !flexShrinks(styleOf(item)) &&
          scrollRegions(node).some((region) => scrollRegions(flexParent).includes(region))
      })) return false
    }
    return hasScrollPath
  }
  return { ancestry, reachable, styleOf }
}

caseTest('ASK-QUESTIONS-ST-03', 'long-card reachability', 'a four-question ask has a bounded scroller and keeps the send footer outside the prompt scroll', async (t) => {
  const page = await openPage(t)
  await page.show([long])
  toggleOf(page, long.cardId, true)
  const tree = page.card(long.cardId)
  const fields = findAll(tree, (node) => node.tag === 'fieldset')
  assert.equal(fields.length, long.questions.length, 'all prompts must have reachable question controls')
  const submitButton = action(tree, UI.submit)
  assert.ok(submitButton, 'the long card must render Submit')
  const { ancestry, reachable, styleOf } = dockLayout(page.dock(), page.styles())
  for (const [index, field] of fields.entries()) {
    assert.ok(reachable(field), 'bounded scrolling must reach: ' + long.questions[index].question)
  }
  assert.ok(reachable(submitButton), 'the bounded card must not clip the send footer')
  const [firstField] = fields
  const promptScroller = [...ancestry(firstField)].find((node) => scrollsY(styleOf(node)))
  assert.ok(promptScroller, 'the prompts need a vertically scrollable region')
  const footerPath = [...ancestry(submitButton)]
  const scrollsWithPrompts = footerPath.includes(promptScroller)
  const anchored = scrollsWithPrompts && footerPath.slice(0, footerPath.indexOf(promptScroller)).some((node) => {
    const style = styleOf(node)
    return ['sticky', 'fixed'].includes(style.position) && (style.bottom || style['inset-block-end'])
  })
  assert.ok(!scrollsWithPrompts || anchored, 'the send footer must stay in place while the prompts scroll')
})

function fieldFor(tree, question) {
  return findAll(tree, (node) => node.tag === 'fieldset' &&
    node.children.some((child) => child.tag === 'legend' && textOf(child) === question.question))[0]
}

async function reachQuestion(page, question) {
  const tree = () => page.card(long.cardId)
  for (const _ of long.questions) {
    const field = fieldFor(tree(), question)
    if (field) return field
    const next = action(tree(), UI.next)
    assert.ok(next, 'no route to question: ' + question.question)
    await press(next)
  }
  assert.fail('page navigation never reached question: ' + question.question)
}

caseTest('ASK-QUESTIONS-ST-04', 'long-card answer', 'choices, custom text and an explicit skip survive accordion use and post one full reply', async (t) => {
  const page = await openPage(t)
  await page.show([long, free])
  await press(toggleOf(page, long.cardId, false))
  await reachQuestion(page, FORM.first)
  await choose(page, long.cardId, FORM.first.options[0].label)
  await press(toggleOf(page, free.cardId, false))
  toggleOf(page, long.cardId, false)
  await press(toggleOf(page, long.cardId, false))
  toggleOf(page, free.cardId, false)

  await reachQuestion(page, FORM.second)
  for (const { label } of FORM.second.options) await choose(page, long.cardId, label)
  const notes = await reachQuestion(page, LONG.notes)
  const [text] = findAll(notes.children, (node) => node.tag === 'textarea')
  assert.ok(text && !text.props.disabled && typeof text.props.onChange === 'function', 'the later optionless question must accept text')
  edit(text, FORM.text)
  await settle()

  const skipped = await reachQuestion(page, LONG.skip)
  await press(action(skipped.children, UI.skip))
  assert.deepEqual(page.answers(), [], 'answering and skipping must not submit individual questions')
  await submit(page, long.cardId)
  assert.deepEqual(page.answers(), [{
    cardId: long.cardId,
    answers: [...batchAnswers, { id: LONG.notes.id, selected: [], custom: FORM.text }, { id: LONG.skip.id, selected: [] }],
  }])
})

const ownsText = (node, text) => node.children.some((child) => typeof child === 'string' && child.includes(text))
const pileHeading = (tree) => findAll(tree, (node) => ownsText(node, UI.pileTitle))
const visibleButton = (tree, label) => findAll(tree, (node) => node.tag === 'button' && textOf(node).trim() === label)[0]

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
  assert.equal(headerText, expected, 'the single heading must carry the total open-card count (not the prompt count)')
  const pile = parents.get(header)
  assert.ok(pile, 'the heading must belong to the same surface as the request rows')
  assert.equal(byAttr([pile], ASK.card).length, count, 'all open request rows must live in the one shared pile')
  return pile
}

caseTest('ASK-PILE-BVA-01', '0, 1, 2, 99 and 100', 'one shared Waiting for you heading counts mixed open cards and caps only the badge at 99+', async (t) => {
  const page = await openPage(t)
  assert.deepEqual(pileHeading(page.dock()), [], 'no empty heading')
  const approvals = askCards(UI.countLimit)
  const history = askCard({ state: ASK.state.answered })
  for (const count of [1, 2, UI.countLimit, UI.countLimit + 1]) {
    await page.show([multi, ...approvals.slice(0, count - 1), history])
    const pile = expectPile(page, count)
    if (count === 2) {
      const { styleOf } = dockLayout(page.dock(), page.styles())
      const surface = styleOf(pile)
      assert.match(surface['background-color'] ?? surface.background ?? '', /var\(--dsw-[\w-]*layer-1\b/,
        'the pile should sit on one neutral layer-1 surface')
    }
    toggleOf(page, multi.cardId, count === 1)
  }
  const other = { ...multi, state: ASK.state.voided }
  await page.show([other, history])
  assert.deepEqual(pileHeading(page.dock()), [], 'finished cards do not leave a pile behind')
})

caseTest('ASK-PILE-ST-01', 'mixed accordion', 'mixed rows disclose exclusively, with radio and checkbox choices, visible actions, and optional approval reason', async (t) => {
  const page = await openPage(t)
  const approval = askCard()
  await page.show([multi, approval])
  const questionSummary = toggleOf(page, multi.cardId, false)
  const approvalSummary = toggleOf(page, approval.handle, false)
  assert.ok(textOf(questionSummary).includes(FORM.first.header), 'question summary uses the supplied header')
  assert.ok(textOf(approvalSummary).includes(approval.question), 'approval summary identifies the request')
  assert.equal(visibleButton(page.card(multi.cardId), UI.send), undefined)
  assert.equal(visibleButton(page.card(approval.handle), UI.allow), undefined)

  await press(questionSummary)
  toggleOf(page, approval.handle, false)
  const question = page.card(multi.cardId)
  for (const [prompt, type] of [[FORM.first, 'radio'], [FORM.second, 'checkbox']]) {
    const fieldset = fieldFor(question, prompt)
    assert.ok(fieldset, 'missing choice group for ' + prompt.question)
    assert.equal(findAll([fieldset], (node) => node.props.type === type || node.props.role === type).length, prompt.options.length)
  }
  assert.ok(visibleButton(question, UI.send), 'the answer action must visibly say Send answer')

  await press(toggleOf(page, approval.handle, false))
  toggleOf(page, multi.cardId, false)
  const [reason] = findAll(page.card(approval.handle), (node) => node.tag === 'textarea' || node.tag === 'input')
  assert.ok(reason && !reason.props.required, 'approval provides an optional reason field')
  for (const [label, choice] of [[UI.allow, ASK.choices.allow], [UI.reject, ASK.choices.reject]]) {
    const button = visibleButton(page.card(approval.handle), label)
    assert.ok(button, 'the approval action must visibly say ' + label)
    assert.equal(button.props[ASK.choice], choice, 'approval actions must remain distinct')
  }
  assert.deepEqual(page.answers(), [], 'disclosure does not send a question or approval reply')
  edit(reason, FORM.text)
  await settle()
  await press(visibleButton(page.card(approval.handle), UI.allow))
  assert.deepEqual(page.answers(ASK_SOURCE.answerPath), [{ handle: approval.handle, choice: ASK.choices.allow, text: FORM.text }])
})
