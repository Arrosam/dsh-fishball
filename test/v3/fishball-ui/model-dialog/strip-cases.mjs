/**
 * UI-POLISH-F §2 black-box rows: the drawn status card (.runtime/reports/ui-polish-f/SPEC.md §2).
 * Component level (strip.mjs): fishball-ui's real client in the scripted DSH page, frames from the
 * real pure `stripView`.
 *
 * Techniques:
 * - Decision table UIPF-STRIP-DT-01: first-line kind (every row of SPEC §2's table, en and zh) →
 *   `data-fishball-strip-state`, the heading text, the badge text inside a DSH Tag, the StateDot
 *   state before the heading;
 * - EP UIPF-STRIP-EP-01: lines keep their `data-fishball-strip-line` kinds and texts; the
 *   contributed-tools chip carries `title` = toolsHint (en, zh);
 * - Decision table UIPF-STRIP-DT-02: control none / connect / cancel → no button / primary Connect /
 *   outline Cancel (labels unchanged);
 * - State transition UIPF-STRIP-ST-01: control connect → pressed, answered with an approval URL →
 *   control cancel: the link `a[data-fishball-strip-approval]` with href, target, rel, title = URL and
 *   the text `Open the approval page` / `打开授权页面` (not the raw URL).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { STAND_IN } from '../../fishball-core/settings/primitives.mjs'
import { UI_CARD } from '../../fishball-core/status/constants.mjs'
import { STRIP_PAGE } from './constants.mjs'
import { snapshotOf, stripPage } from './strip.mjs'

const show = (v) => JSON.stringify(v)
const H = STRIP_PAGE.hook
const KINDS = Object.freeze([...Object.entries(UI_CARD.table), [UI_CARD.otherKind, UI_CARD.otherRow]])
const LANG_INDEX = Object.freeze({ en: 1, zh: 2 })
const DOT = 3
/** Line kinds the rows use (SPEC §2's table keys). */
const STRIP_KIND = Object.freeze({ connected: 'connected', needsAuthorization: 'needs-authorization', authorizing: 'authorizing', failed: 'failed' })
const textsOf = (node) => (typeof node === 'string' ? [node.trim()].filter(Boolean) : (node.children ?? []).flatMap(textsOf))

export function registerStripCases(sdk) {
  const t = (id, row, title, fn, todo) => caseTest(sdk, id, row, title, fn, todo)

  for (const lang of STRIP_PAGE.langs) {
    for (const [kind, row] of KINDS) {
      const [state, , , dot] = row
      const badge = row[LANG_INDEX[lang]]
      t('UIPF-STRIP-DT-01', `${kind} ${lang}`, `(${lang}) first line ${kind}: root [role=status][data-fishball-strip-state=${state}], heading = card.title, badge ${show(badge)} in a DSH Tag, StateDot ${dot} before the heading`, async (c) => {
        const p = await stripPage(c, sdk, { lang })
        const frame = await p.show(snapshotOf(kind))
        const root = p.root()
        assert.ok(root, 'no [data-fishball-strip] root')
        assert.equal(root.tag, 'div')
        assert.equal(root.props.role, STRIP_PAGE.role)
        assert.equal(root.props[H.state], state, `${H.state}`)
        const title = frame.card?.title
        assert.ok(title, 'precondition: stripView gave a card title')
        const flat = p.nodes()
        // The heading: the element whose own text is the card title.
        const heading = flat.find((n) => (n.children ?? []).some((ch) => typeof ch === 'string' && ch.trim() === title))
        assert.ok(heading, `no element shows the card title ${show(title)}`)
        const badges = p.byHook(H.badge)
        assert.equal(badges.length, 1, `${H.badge} elements: ${badges.length}`)
        assert.equal(p.text(badges[0]).trim(), badge, 'badge text')
        // "DSH Tag with the badge text and data-fishball-strip-badge": DSH's Tag forwards no data-*
        // prop, so the hook is either on the Tag or on an element inside it; the Tag holds the text.
        const tags = flat.filter((n) => n.props[STAND_IN.primitive] === 'Tag')
        assert.ok(tags.some((tag) => containsNode(tag, badges[0]) || containsNode(badges[0], tag)), 'the badge is not a DSH Tag (or not inside one)')
        assert.ok(tags.some((tag) => p.text(tag).trim() === badge), 'no DSH Tag shows the badge text')
        const dots = flat.filter((n) => n.props[STAND_IN.primitive] === 'StateDot')
        const before = dots.filter((n) => flat.indexOf(n) < flat.indexOf(heading))
        assert.ok(before.length >= 1, 'no StateDot before the heading')
        assert.equal(before.at(-1).props['data-state'], dot, 'StateDot state')
        if (dot === 'ongoing') assert.equal(before.at(-1).tag, 'svg', 'the connecting dot is not the spinner')
        // Lines keep their kinds and their texts.
        for (const line of frame.lines.filter((l) => l.kind !== UI_CARD.toolsKind)) {
          const marked = p.byHook(H.line, line.kind)
          assert.equal(marked.length, 1, `${H.line}=${line.kind}: ${marked.length}`)
          assert.equal(p.text(marked[0]).trim(), line.text, `${line.kind} text`)
        }
      })
    }
    // SPEC §2 (revised after review): a focusable chip (tabIndex 0) whose DSH Tooltip label is
    // card.toolsHint, aria-label `<chip text> · <toolsHint>`, and no native title.
    t('UIPF-STRIP-EP-01', `tools chip ${lang}`, `(${lang}) the contributed-tools line is a chip: ${H.line}=contributed-tools, tabIndex 0, Tooltip label = toolsHint, aria-label "<text> · <toolsHint>", no title; text reworded (BVA 0, 1, 2)`, async (c) => {
      const p = await stripPage(c, sdk, { lang })
      for (const count of UI_CARD.toolsBva) {
        await p.show(snapshotOf(STRIP_KIND.connected, { contributedTools: count }))
        const chips = p.byHook(H.line, UI_CARD.toolsKind)
        assert.equal(chips.length, 1, `count ${count}: ${chips.length} chips`)
        const [chip] = chips
        const text = UI_CARD.tools[lang](count)
        assert.equal(textsOf(chip).join(' '), text, `count ${count}: chip text`)
        assert.equal(Number(chip.props.tabIndex), 0, `count ${count}: tabIndex`)
        assert.equal(chip.props.title, undefined, `count ${count}: a native title`)
        assert.equal(chip.props['aria-label'], `${text}${UI_CARD.chipSeparator}${UI_CARD.toolsHint[lang]}`, `count ${count}: aria-label`)
        assert.equal(chip.props[STAND_IN.tooltip], UI_CARD.toolsHint[lang], `count ${count}: the DSH Tooltip label`)
      }
    })
    for (const [row, control, expected] of [['none', null, null], ['connect', 'connect', UI_CARD.control.connect], ['cancel', 'cancel', UI_CARD.control.cancel]]) {
      t('UIPF-STRIP-DT-02', `${row} ${lang}`, `(${lang}) control ${row} → ${expected ? `one button[${H.control}=${control}] ${show(expected[lang])} with the ${expected.variant} look` : 'no control button'}`, async (c) => {
        const p = await stripPage(c, sdk, { lang })
        const kind = { none: STRIP_KIND.connected, connect: STRIP_KIND.needsAuthorization, cancel: STRIP_KIND.authorizing }[row]
        await p.show(snapshotOf(kind, { control }))
        const buttons = p.nodes().filter((n) => n.tag === 'button')
        if (expected === null) { assert.deepEqual(buttons.map((b) => p.text(b)), [], 'a button without a control'); return }
        const marked = p.byHook(H.control, control)
        assert.equal(marked.length, 1, `${H.control}=${control}: ${marked.length}`)
        assert.equal(marked[0].tag, 'button')
        assert.equal(p.text(marked[0]).trim(), expected[lang])
        assert.equal(marked[0].props[STAND_IN.variant], expected.variant, 'button look (DSH Button variant)')
      })
    }
    t('UIPF-STRIP-ST-01', `approval ${lang}`, `(${lang}) connect pressed, Connect answers an approval URL, then control cancel → the approval link: href and title the URL, target _blank, rel noopener noreferrer, text ${show(UI_CARD.openApproval[lang])}`, async (c) => {
      const p = await stripPage(c, sdk, { lang })
      p.world.connect.post = () => ({ status: 200, json: { outcome: STRIP_PAGE.approvalOutcome, url: STRIP_PAGE.approvalUrl } })
      await p.show(snapshotOf(STRIP_KIND.needsAuthorization, { control: 'connect' }))
      assert.deepEqual(p.byHook(H.approval), [], 'a link before Connect')
      await p.press(p.byHook(H.control, 'connect')[0])
      await p.show(snapshotOf(STRIP_KIND.authorizing, { control: 'cancel' }))
      const links = p.byHook(H.approval)
      assert.equal(links.length, 1, `approval links: ${links.length}`)
      const [a] = links
      assert.equal(a.tag, 'a')
      assert.deepEqual([a.props.href, a.props.target, a.props.rel, a.props.title], [STRIP_PAGE.approvalUrl, UI_CARD.approval.target, UI_CARD.approval.rel, STRIP_PAGE.approvalUrl])
      assert.equal(p.text(a).trim(), UI_CARD.openApproval[lang], 'link text (no longer the raw URL)')
    })
  }
  t('UIPF-STRIP-ST-01', 'no approval without cancel', 'the approval link shows only while the control is cancel: back to connect → no link', async (c) => {
    const p = await stripPage(c, sdk)
    p.world.connect.post = () => ({ status: 200, json: { outcome: STRIP_PAGE.approvalOutcome, url: STRIP_PAGE.approvalUrl } })
    await p.show(snapshotOf(STRIP_KIND.needsAuthorization, { control: 'connect' }))
    await p.press(p.byHook(H.control, 'connect')[0])
    await p.show(snapshotOf(STRIP_KIND.authorizing, { control: 'cancel' }))
    assert.equal(p.byHook(H.approval).length, 1, 'precondition: the link')
    await p.show(snapshotOf(STRIP_KIND.failed, { control: 'connect' }))
    assert.deepEqual(p.byHook(H.approval), [], 'the link stayed after the control left cancel')
  })
}

function containsNode(ancestor, node) {
  if (ancestor === node) return true
  return (ancestor.children ?? []).some((c) => typeof c !== 'string' && containsNode(c, node))
}
