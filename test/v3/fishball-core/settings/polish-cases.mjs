/**
 * UI-POLISH-F §5 and §7 black-box rows (.runtime/reports/ui-polish-f/SPEC.md): the two Fishball-page
 * header entries as icon buttons with a Tooltip, and core's settings page sections. Integration level
 * on the F-SETTINGS scripted page (page.mjs; DSH primitive stand-ins in primitives.mjs).
 *
 * Techniques:
 * - EP UIPF-ENTRY-EP-01: entry (fishball, dsh) × language (en, zh) → icon only (one svg aria-hidden,
 *   no text node), aria-label = the previous text, Tooltip label = aria-label, side bottom;
 *   the DSH entry keeps aria-haspopup="dialog";
 * - EP UIPF-CORE-EP-01: core's page sections: `section[data-fishball-model]`, `section[data-fishball-connect]`;
 *   the Connect section has a visible h3 `Connect` / `连接` naming it (aria-labelledby), a StateDot;
 *   the entries' glyphs (sliders for Fishball settings, gear for DSH settings);
 * - Decision table UIPF-CORE-DT-01: the Connect state read (every CONNECT.state and unavailable) →
 *   heading and StateDot in each; the button primary in needs-authorization and failed, else outline.
 * The behaviour rows (SET3-DT-02 / DT-03 presses, the missing-launcher alert) stay in cases.mjs.
 */
import assert from 'node:assert/strict'
import { caseName, caseTest as baseCaseTest } from '../../contract/package-boundaries/cases.mjs'
import test from 'node:test'
import { MULTI_SET as MULTI_WITHDRAWN, isWithdrawnMulti } from './constants.mjs'

/** MULTI-1: a row MULTI-0 withdrew (constants.mjs WITHDRAWN_MULTI) is registered skipped with its reason. */
const caseTest = (sdk, id, row, title, fn, todo) => (isWithdrawnMulti(id, row)
  ? test(caseName(sdk, id, row, title), { skip: MULTI_WITHDRAWN.withdrawn }, () => {})
  : baseCaseTest(sdk, id, row, title, fn, todo))
import { CONNECT, DSH, HARNESS, MARK, POLISH_CONNECT, POLISH_ENTRIES, ROUTE } from './constants.mjs'
import { createWorld, loadPage, settle } from './page.mjs'
import { DESIGN, STAND_IN } from './primitives.mjs'

const show = (v) => JSON.stringify(v)
const subtree = (node) => [node, ...(node.children ?? []).filter((c) => typeof c !== 'string').flatMap(subtree)]
const texts = (node) => (typeof node === 'string' ? [node.trim()].filter(Boolean) : (node.children ?? []).flatMap(texts))
const ownText = (node) => (node.children ?? []).filter((c) => typeof c === 'string').join('').trim()

async function entryOf(t, sdk, lang, which) {
  const page = await loadPage(t, createWorld({ sdk, lang }))
  for (const h of await page.headers()) {
    const [node] = page.byAttr(POLISH_ENTRIES.hook, which, h.tree)
    if (node) return { page, node }
  }
  throw new Error(`no header entry ${POLISH_ENTRIES.hook}="${which}"`)
}
async function corePage(t, sdk, lang, connectAnswer) {
  const world = createWorld({ sdk, lang, core: {} })
  if (connectAnswer) world.connect.get = connectAnswer
  const page = await loadPage(t, world)
  await page.open(DSH.view.page)
  await settle()
  return page
}

export function registerSettingsPolishCases(sdk) {
  const t = (id, row, title, fn, todo) => caseTest(sdk, id, row, title, fn, todo)

  // ---- §5: header entries
  for (const lang of DSH.locales) {
    for (const which of Object.values(MARK.entries)) {
      const label = POLISH_ENTRIES.labels[lang][which]
      t('UIPF-ENTRY-EP-01', `${which} ${lang}`, `(${lang}) the ${which} entry: a button, icon only, aria-label ${show(label)}, Tooltip label equals it, side ${POLISH_ENTRIES.side}`, async (c) => {
        const { node } = await entryOf(c, sdk, lang, which)
        assert.equal(node.tag, 'button', `the ${which} entry is not a button`)
        const svgs = subtree(node).filter((n) => n.tag === 'svg')
        assert.equal(svgs.length, 1, `${svgs.length} svg elements`)
        assert.equal(String(svgs[0].props['aria-hidden']), DESIGN.hidden, 'the svg is not aria-hidden')
        assert.deepEqual(texts(node), [], `visible text ${show(texts(node))} (icon only)`)
        assert.equal(node.props['aria-label'], label)
        assert.equal(node.props[STAND_IN.tooltip], label, 'Tooltip label (or no DSH Tooltip)')
        assert.equal(node.props[STAND_IN.tooltipSide], POLISH_ENTRIES.side, 'Tooltip side')
        assert.match(String(svgs[0].props[STAND_IN.primitive]), POLISH_ENTRIES.glyph[which], `the ${which} glyph`)
      })
    }
  }
  t('UIPF-ENTRY-EP-01', 'dsh haspopup', `the DSH entry keeps aria-haspopup="${POLISH_ENTRIES.haspopup}"`, async (c) => {
    const { node } = await entryOf(c, sdk, DSH.locales[0], MARK.entries.dsh)
    assert.equal(node.props['aria-haspopup'], POLISH_ENTRIES.haspopup)
  })
  t('UIPF-ENTRY-ST-01', 'tooltip', 'an entry\'s Tooltip shows on hover with its label and goes on leave', async (c) => {
    const { page, node } = await entryOf(c, sdk, DSH.locales[0], MARK.entries.fishball)
    const tips = () => page.find((n) => n.props.role === DESIGN.tooltipRole, page.all())
    assert.deepEqual(tips(), [])
    node.props.onMouseEnter?.({})
    await settle()
    assert.deepEqual(tips().map((n) => texts(n).join(' ')), [POLISH_ENTRIES.labels.en.fishball])
    const again = page.byAttr(POLISH_ENTRIES.hook, MARK.entries.fishball, page.all())[0]
    again.props.onMouseLeave?.({})
    await settle()
    assert.deepEqual(tips(), [])
  })

  // ---- §7: core's settings page sections
  for (const lang of DSH.locales) {
    t('UIPF-CORE-EP-01', `sections ${lang}`, `(${lang}) Model and Connect are section[data-fishball-model] and section[data-fishball-connect]`, async (c) => {
      const page = await corePage(c, sdk, lang)
      for (const hook of [POLISH_CORE.model, MARK.connect]) {
        const nodes = page.byAttr(hook)
        assert.equal(nodes.length, 1, `${hook}: ${nodes.length}`)
        assert.equal(nodes[0].tag, POLISH_CONNECT.section, `${hook} is a ${nodes[0].tag}`)
      }
    })
    t('UIPF-CORE-EP-01', `connect heading ${lang}`, `(${lang}) the Connect section shows an h3 ${show(POLISH_CONNECT.heading[lang])} that names it (aria-labelledby, no aria-label), a StateDot and the Connect button`, async (c) => {
      const page = await corePage(c, sdk, lang)
      assertConnectCard(page, lang)
    })
  }
  const answers = [
    ...Object.values(CONNECT.state).map((state) => [state, () => ({ status: ROUTE.ok, json: { state, code: state === CONNECT.state.needsConfiguration ? CONNECT.configuration.metadataUrlMissing : null } })]),
    [MARK.unavailable, () => ({ status: ROUTE.unavailable.status, json: ROUTE.unavailable.body })],
  ]
  for (const [state, answer] of answers) {
    const look = POLISH_CONNECT.primaryIn.includes(state) ? POLISH_CONNECT.primary : POLISH_CONNECT.otherwise
    t('UIPF-CORE-DT-01', state, `Connect read ${state}: the section keeps its heading and a StateDot; the Connect button is ${look}`, async (c) => {
      const page = await corePage(c, sdk, DSH.locales[0], answer)
      const deadline = Date.now() + HARNESS.waitMs
      while (page.byAttr(MARK.connect)[0]?.props[MARK.connectState] !== state && Date.now() < deadline) await settle()
      assert.equal(page.byAttr(MARK.connect)[0]?.props[MARK.connectState], state, 'precondition: the state read')
      const [button] = assertConnectCard(page, DSH.locales[0])
      assert.equal(button.props[STAND_IN.variant], look, `the Connect button look in ${state}`)
    })
  }
}

/** `data-fishball-model` is the relayed model-section hook (SPEC §7; constants of core's page). */
const POLISH_CORE = Object.freeze({ model: 'data-fishball-model' })

function assertConnectCard(page, lang) {
  const [section] = page.byAttr(MARK.connect)
  assert.ok(section, 'no Connect section')
  const inside = subtree(section)
  const headings = inside.filter((n) => n.tag === POLISH_CONNECT.headingTag && ownText(n) === POLISH_CONNECT.heading[lang])
  assert.equal(headings.length, 1, `h3 ${show(POLISH_CONNECT.heading[lang])}: ${show(inside.filter((n) => /^h\d$/.test(n.tag)).map((n) => [n.tag, ownText(n)]))}`)
  assert.ok(headings[0].props.id, 'the heading has no id to be named by')
  assert.equal(section.props['aria-labelledby'], headings[0].props.id, 'the section is not aria-labelledby its h3')
  assert.equal(section.props['aria-label'], undefined, 'the section still has an aria-label')
  assert.ok(inside.some((n) => n.props[STAND_IN.primitive] === 'StateDot'), 'no StateDot in the Connect section')
  const begin = inside.filter((n) => n.tag === 'button' && n.props[MARK.connectBegin] !== undefined)
  assert.equal(begin.length, 1, 'Connect buttons')
  return begin
}
