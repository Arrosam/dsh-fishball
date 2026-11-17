/**
 * UI-POLISH-D rows of the connector's settings page (the requirements relayed 2026-11-18;
 * constants.mjs POLISH). The restyle keeps every route, setting key, data hook and role; what is new
 * is the page's layout and a few words, which these rows pin:
 * - EP over the page language (en, zh): three `h3` section headings, in order, and the icon
 *   buttons' accessible names (the old words as aria-label and title);
 * - BVA over the token count (0 → no count beside Tokens, 1, many) and over a row's index for the
 *   Move up / Move down disabled states (single item; first, middle, last of three);
 * - state transition: Move down on the first row stages the new order, and the disabled states follow;
 * - EP over the pair state (paired connected, paired offline, unpaired) and the approval status
 *   (ok, port in use): a StateDot before the unchanged words;
 * - the primitives the page draws with (Input for text fields, icons on New token, Copy, the notice).
 *
 * Level: integration, as cases.mjs: the real client.js in the scripted page (page.mjs) over the real
 * routes and registry; GET state answers from a stand-in `state()` port (PLAT-EP-03 row 1 (routes, state)).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { findAll, textOf, walk } from '../../../support/rp-recommend.mjs'
import { worldFor } from '../tokens/world.mjs'
import { CLIENT, FIXTURE, POLISH, SUBJECT, WAIT } from './constants.mjs'
import { click, input, openTokensPage } from './page.mjs'
import { pageModule } from './subject.mjs'

const T = { timeout: WAIT.testMs }
const ID = POLISH.id
const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)

/** The rendered nodes below `nodes` (each element once). */
const all = (nodes) => findAll(nodes, () => true)
const text = (node) => textOf(node).replace(/\s+/g, ' ').trim()
const isPrimitive = (node, name) => node.props[CLIENT.primitiveAttr] === name
/** The parent of every node, by identity. */
export function parents(nodes) {
  const map = new Map()
  for (const { node, parent } of walk(nodes)) map.set(node, parent)
  return map
}
/** The `section` element that holds `node`. */
function sectionOf(tree, node) {
  const up = parents(tree)
  for (let at = up.get(node); at; at = up.get(at)) if (at.tag === 'section') return at
  return undefined
}
const headingsOf = (tree) => findAll(tree, (n) => n.tag === POLISH.headingTag)
/** The text beside a heading in its own head line (the count), or '' when there is none. */
function besideHeading(tree, heading) {
  const head = parents(tree).get(heading)
  return text(head).slice(text(heading).length).trim()
}
/** The first element child of `node` (its leading glyph). */
const firstElement = (node) => (node.children ?? []).find((c) => typeof c !== 'string')

/**
 * The page over a world holding `labels` (each created through the registry, so each has a record),
 * with GET state answering `state(world)` when given; `settings` and `answerState` go to
 * openTokensPage (R-FIX-CUI). Returns `{world, page, view}`.
 */
export async function openPolished(t, sdk, { labels = [], state, lang, tokens, settings, answerState } = {}) {
  const world = await worldFor(t, sdk, tokens === undefined ? {} : { tokens })
  for (const label of labels) await world.registry.create(label)
  const mod = await pageModule(sdk)
  const routes = mod[SUBJECT.routes]({ tokens: world.registry, logger: world.logger, ...(state === undefined ? {} : { state: () => state(world) }) })
  const page = await openTokensPage(t, { sdk, world, routes, lang, settings, answerState })
  const view = await page.open()
  return { world, page, view }
}
const rowsOf = (view) => view.find(CLIENT.attr.row)
/** The row's three icon buttons by their accessible name, in `lang`. */
function rowButtons(rowNode, lang) {
  const names = POLISH.buttons[lang]
  const buttons = findAll([rowNode], (n) => n.tag === 'button')
  return Object.fromEntries(Object.entries(names).map(([key, name]) => {
    const found = buttons.filter((b) => b.props[POLISH.ariaLabel] === name)
    assert.equal(found.length, 1, `buttons named ${name}: ${found.length}`)
    return [key, found[0]]
  }))
}
/** A state answer: `entries(world)` rows and the approval listener's status. */
export const stateWith = (entries, approval = { status: 'ok', port: POLISH.approvalPort, defaultPort: POLISH.defaultPort }) => (world) => ({ entries: entries(world), approval })
/** A state route row of entry `item` (C-WIRE state shape). */
export const entryRow = (item, over) => ({ key: item.key, label: item.label, enabled: item.enabled, paired: false, id: null, name: null, connected: false, lastSeenAt: null, ...over })

export function registerPolishSettingsCases(sdk) {
  // ---------------------------------------------------------------- sections (EP over the language)
  for (const lang of POLISH.langs) {
    row(sdk, ID.sections, lang, `three h3 sections in order: ${POLISH.headings[lang].join(', ')}; tokens in the first, the port and DSH name in the second, the limits in the third`, async (t) => {
      const { view } = await openPolished(t, sdk, { labels: [FIXTURE.labelA], lang })
      const tree = view.tree()
      assert.deepEqual(headingsOf(tree).map(text), [...POLISH.headings[lang]])
      const [tokens, approval, limits] = headingsOf(tree).map((h) => sectionOf(tree, h))
      assert.ok(tokens && approval && limits, 'a heading outside a section')
      for (const node of [view.one(CLIENT.attr.newLabel), view.one(CLIENT.attr.newToken), ...rowsOf(view)]) assert.equal(sectionOf(tree, node), tokens, 'a token part outside the Tokens section')
      const settings = findAll(tree, (n) => n.props[POLISH.attr.setting] !== undefined)
      assert.deepEqual(settings.filter((n) => sectionOf(tree, n) === approval).map((n) => n.props[POLISH.attr.setting]), ['approval.port', 'approval.dshName'])
      assert.equal(settings.filter((n) => sectionOf(tree, n) === limits).length, 5, 'limit rows')
      assert.ok(limits.props['data-dsh-connector-limits'] !== undefined, 'the limits hook is not on the Safety limits section')
    })
  }

  // ---------------------------------------------------------------- the count beside Tokens (BVA)
  for (const count of POLISH.counts) {
    row(sdk, ID.count, count, `${count} token(s) → ${count === 0 ? 'no count beside Tokens' : `"${count}" beside Tokens`}`, async (t) => {
      const { view } = await openPolished(t, sdk, { labels: POLISH.labels.slice(0, count) })
      const [tokens] = headingsOf(view.tree())
      assert.equal(text(tokens), POLISH.headings.en[0])
      assert.equal(besideHeading(view.tree(), tokens), count === 0 ? '' : String(count))
      assert.equal(rowsOf(view).length, count)
    })
  }

  // ---------------------------------------------------------------- icon buttons (EP names, BVA index)
  for (const lang of POLISH.langs) {
    row(sdk, ID.buttons, `names (${lang})`, `each row's Move up / Move down / Delete are icon-only buttons named ${Object.values(POLISH.buttons[lang]).join(' / ')} (aria-label and title)`, async (t) => {
      const { view } = await openPolished(t, sdk, { labels: POLISH.labels, lang })
      for (const r of rowsOf(view)) {
        for (const [key, button] of Object.entries(rowButtons(r, lang))) {
          assert.equal(button.props[POLISH.title], POLISH.buttons[lang][key], 'title of ' + key)
          assert.equal(text(button), '', key + ' shows words beside its icon')
          assert.ok(all([button]).some((n) => String(n.props[CLIENT.primitiveAttr] ?? '').startsWith(POLISH.iconPrefix)), key + ' has no icon')
        }
      }
    })
  }
  for (const [part, count, index, upOff, downOff] of [['single', 1, 0, true, true], ['first of 3', 3, 0, true, false], ['middle of 3', 3, 1, false, false], ['last of 3', 3, 2, false, true]]) {
    row(sdk, ID.buttons, part, `row ${index + 1} of ${count}: Move up ${upOff ? 'disabled' : 'enabled'}, Move down ${downOff ? 'disabled' : 'enabled'}, Delete enabled`, async (t) => {
      const { view } = await openPolished(t, sdk, { labels: POLISH.labels.slice(0, count) })
      const b = rowButtons(rowsOf(view)[index], 'en')
      assert.deepEqual([Boolean(b.up.props.disabled), Boolean(b.down.props.disabled), Boolean(b.remove.props.disabled)], [upOff, downOff, false])
    })
  }
  row(sdk, ID.buttons, 'ST', 'Move down on row 1 of 3 → the rows read B, A, C (staged); A is now the middle row with both moves enabled; nothing saved', async (t) => {
    const { world, page, view } = await openPolished(t, sdk, { labels: POLISH.labels })
    const keys = world.doc.tokens.map((i) => i.key)
    click(rowButtons(rowsOf(view)[0], 'en').down)
    await page.until(() => rowsOf(view)[0]?.props[CLIENT.attr.row] === keys[1])
    assert.deepEqual(rowsOf(view).map((r) => r.props[CLIENT.attr.row]), [keys[1], keys[0], keys[2]])
    const moved = rowButtons(rowsOf(view)[1], 'en')
    assert.deepEqual([Boolean(moved.up.props.disabled), Boolean(moved.down.props.disabled)], [false, false])
    assert.deepEqual(page.mutations, [], 'a move saved by itself')
  })

  // ---------------------------------------------------------------- StateDots (EP)
  row(sdk, ID.dots, 'pair', 'paired + connected → StateDot done before the words; paired + offline → StateDot idle; unpaired → no dot; the data hooks unchanged', async (t) => {
    const state = stateWith((world) => world.doc.tokens.map((item, i) => entryRow(item, i < 2 ? { paired: true, id: POLISH.pairId + i, name: POLISH.pairName + i, connected: i === 0 } : {})))
    const { world, page, view } = await openPolished(t, sdk, { labels: POLISH.labels, state })
    await page.until(() => view.find(POLISH.attr.pair, POLISH.paired).length === 2)
    const pairOf = (key) => findAll(view.find(CLIENT.attr.row, key), (n) => n.props[POLISH.attr.pair] !== undefined)[0]
    const [a, b, c] = world.doc.tokens.map((item) => pairOf(item.key))
    for (const [node, connected, dot, words] of [[a, true, POLISH.dot.connected, 'connected'], [b, false, POLISH.dot.offline, 'not connected']]) {
      assert.equal(String(node.props[POLISH.attr.connected]), String(connected))
      const glyph = firstElement(node)
      assert.ok(glyph && isPrimitive(glyph, POLISH.stateDot), 'no StateDot before the words')
      assert.equal(glyph.props.state, dot)
      assert.ok(text(node).includes(words), 'words: ' + text(node))
    }
    assert.ok(text(a).includes(POLISH.pairName + 0) && !text(a).includes('not connected'))
    assert.equal(c.props[POLISH.attr.pair], 'unpaired')
    assert.deepEqual(all([c]).filter((n) => isPrimitive(n, POLISH.stateDot)), [], 'a dot on an unpaired entry')
  })
  const approvalStatus = (view) => {
    const [region] = view.find(POLISH.attr.approval)
    return findAll([region], (n) => n.props[POLISH.role] === POLISH.status)[0]
  }
  const approvalCases = [['ok', { status: 'ok', port: POLISH.approvalPort, defaultPort: POLISH.defaultPort }], ['port in use', { status: POLISH.portInUse, port: POLISH.approvalPort, defaultPort: POLISH.defaultPort }]]
  for (const [part, approval] of approvalCases) {
    row(sdk, ID.dots, `approval ${part}`, `approval ${approval.status} → a role=status line: a StateDot, then "${approval.status === 'ok' ? POLISH.approvalOk(approval.port) : POLISH.approvalPrefix + '…'}"; beside the port's label, not inside it`, async (t) => {
      const { page, view } = await openPolished(t, sdk, { state: stateWith(() => [], approval) })
      await page.until(() => approvalStatus(view) !== undefined)
      const status = approvalStatus(view)
      assert.equal(view.one(POLISH.attr.approval).props[POLISH.attr.approval], approval.status)
      assert.ok(isPrimitive(firstElement(status), POLISH.stateDot), 'no StateDot before the words')
      if (approval.status === 'ok') assert.equal(text(status), POLISH.approvalOk(approval.port))
      else assert.ok(text(status).startsWith(POLISH.approvalPrefix) && !text(status).includes(String(approval.port)), text(status))
      const label = view.one(POLISH.attr.setting, 'approval.port')
      assert.equal(label.tag, 'label')
      assert.ok(!all([label]).includes(status), 'the status sits inside the label')
      assert.ok(all([label]).some((n) => isPrimitive(n, POLISH.input)), 'the port field is not in its label')
    })
  }
  row(sdk, ID.dots, 'approval ok vs in use', 'the ok dot and the port-in-use dot differ', async (t) => {
    const dots = []
    for (const [, approval] of approvalCases) {
      const { page, view } = await openPolished(t, sdk, { state: stateWith(() => [], approval) })
      await page.until(() => approvalStatus(view) !== undefined)
      dots.push(firstElement(approvalStatus(view)).props.state)
    }
    assert.notEqual(dots[0], dots[1])
  })

  // ---------------------------------------------------------------- a setting row's error (EP: valid, invalid)
  for (const [part, typed, invalid] of [['valid', '2', false], ['invalid', 'abc', true]]) {
    row(sdk, ID.primitives, `setting error (${part})`, `a limit field holding ${JSON.stringify(typed)} → ${invalid ? 'one role=alert in the row, outside the <label data-dsh-connector-setting>' : 'no alert'}; the label holds only the title and the Input`, async (t) => {
      const { page, view } = await openPolished(t, sdk)
      const field = 'maxQueuedInputs'
      const label = () => view.one(POLISH.attr.setting, field)
      const inputOf = () => findAll([label()], (n) => isPrimitive(n, POLISH.input))[0]
      input(inputOf(), typed)
      await page.settle()
      const rowNode = parents(view.tree()).get(label())
      const alerts = findAll([rowNode], (n) => n.props[POLISH.role] === 'alert')
      assert.equal(alerts.length, invalid ? 1 : 0, 'alerts in the row')
      assert.deepEqual(findAll([label()], (n) => n.props[POLISH.role] === 'alert'), [], 'an alert inside the label')
      assert.equal(String(inputOf().props['aria-invalid']), String(invalid))
      const elements = (label().children ?? []).filter((c) => typeof c !== 'string')
      assert.equal(elements.length, 2, 'the label holds more than its title and its control')
      assert.ok(text(label()).length > 0 && !text(label()).includes(alerts[0] ? text(alerts[0]) : '\u0000'), 'the label\'s name carries the error')
    })
  }

  // ---------------------------------------------------------------- primitives and glyphs
  row(sdk, ID.primitives, 'inputs', 'the new-label field, each row label and each setting field are DSH\'s Input, carrying their aria-label / placeholder / data hooks; New token has a plus icon', async (t) => {
    const { view } = await openPolished(t, sdk, { labels: [FIXTURE.labelA] })
    const newLabel = view.one(CLIENT.attr.newLabel)
    assert.ok(isPrimitive(newLabel, POLISH.input), 'the new-label field is not Input')
    assert.equal(newLabel.props[POLISH.ariaLabel], newLabel.props.placeholder)
    const [labelField] = findAll(rowsOf(view), (n) => isPrimitive(n, POLISH.input))
    assert.equal(labelField?.props.value, FIXTURE.labelA)
    for (const setting of findAll(view.tree(), (n) => n.props[POLISH.attr.setting] !== undefined)) {
      assert.equal(setting.tag, 'label', 'a setting row is not a <label>')
      assert.equal(findAll([setting], (n) => isPrimitive(n, POLISH.input)).length, 1, setting.props[POLISH.attr.setting] + ': inputs')
    }
    assert.match(view.one(CLIENT.attr.newToken).props.icon?.type?.displayName ?? '', POLISH.icon.plus)
  })
  row(sdk, ID.primitives, 'copy', 'Reveal: Copy keeps the word "Copy" and its copy icon; after a copy its icon is a check and the status says "Copied"', async (t) => {
    const { page, view } = await openPolished(t, sdk)
    input(view.one(CLIENT.attr.newLabel), FIXTURE.labelA)
    await page.settle()
    click(view.one(CLIENT.attr.newToken))
    await page.until(() => view.modal().length === 1)
    const copy = () => view.one(CLIENT.attr.copy)
    assert.equal(text(copy()), 'Copy')
    assert.match(copy().props.icon?.type?.displayName ?? '', POLISH.icon.copy)
    click(copy())
    await page.until(() => page.clipboard.length > 0 && POLISH.icon.check.test(copy().props.icon?.type?.displayName ?? ''))
    assert.equal(text(copy()), 'Copy')
    assert.ok(findAll(view.modal(), (n) => n.props[POLISH.role] === POLISH.status).some((n) => text(n) === 'Copied'), 'no "Copied" status')
  })
  row(sdk, ID.primitives, 'notice', 'the duplicate notice keeps role=alert and its data hook, with a warning icon before its text', async (t) => {
    const { page, view } = await openPolished(t, sdk, { tokens: [{ label: FIXTURE.handLabel, enabled: true, key: FIXTURE.handKey }] })
    await page.until(() => view.find(CLIENT.attr.notice).length === 1)
    const notice = view.one(CLIENT.attr.notice)
    assert.equal(notice.props[POLISH.role], 'alert')
    const glyph = all([notice]).find((n) => String(n.props[CLIENT.primitiveAttr] ?? '').startsWith(POLISH.iconPrefix))
    assert.match(String(glyph?.props[CLIENT.primitiveAttr] ?? ''), POLISH.icon.warning)
    assert.ok(text(notice).includes(FIXTURE.handLabel))
    assert.ok(text(notice).indexOf(FIXTURE.handLabel) > 0)
  })
}
