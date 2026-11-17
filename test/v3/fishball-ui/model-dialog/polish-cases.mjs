/**
 * UI-POLISH-F §4 black-box rows: the model dialog's grouped choices (.runtime/reports/ui-polish-f/SPEC.md §4).
 * Component level: fishball-ui's real client in the scripted page (subject.mjs `page`).
 *
 * Techniques:
 * - EP UIPF-MODEL-EP-01: a plain model / a model with efforts (one choice per effort) → each choice
 *   button's aria-label is `<group> / <model>` or `<group> / <model> · <effort>`; it shows the model
 *   name (and the effort as a DSH Tag); en and zh;
 * - EP UIPF-MODEL-EP-02: the choices sit under their provider (group) name as a heading;
 * - BVA UIPF-MODEL-BVA-01: one group / two groups → one heading each, every choice under its own;
 * - EP UIPF-MODEL-EP-03: the catalog read refused → an error line with role="alert" and no choice.
 * Unchanged rows (MODEL-EP-01 … MODEL-BVA-01) stay in cases.mjs.
 */
import assert from 'node:assert/strict'
import { textOf } from '../../../support/rp-recommend.mjs'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { STAND_IN } from '../../fishball-core/settings/primitives.mjs'
import { POLISH_CATALOG, POLISH_MODEL, U } from './constants.mjs'
import { page } from './subject.mjs'

const show = (v) => JSON.stringify(v)
/** Every choice the catalog offers: [group name, model name, effort name or undefined]. */
const choicesOf = (catalog) => catalog.groups.flatMap((g) => g.models.flatMap((m) => (m.reasoning?.efforts?.length
  ? m.reasoning.efforts.map((e) => [g.name, m.name, e.name])
  : [[g.name, m.name, undefined]])))
const choiceButtons = (p) => p.nodes().filter((n) => n.tag === U.button && n.props[POLISH_MODEL.choice] !== undefined)
const subtree = (node) => [node, ...(node.children ?? []).filter((c) => typeof c !== 'string').flatMap(subtree)]

export function registerModelPolishCases(sdk) {
  const t = (id, row, title, fn, todo) => caseTest(sdk, id, row, title, fn, todo)
  for (const lang of U.lang) {
    t('UIPF-MODEL-EP-01', `aria-labels ${lang}`, `(${lang}) every choice button's aria-label is "<group> / <model>" or "<group> / <model> · <effort>"; one per model, one per effort`, async (c) => {
      const p = await page(c, sdk, { lang, catalog: POLISH_CATALOG })
      const labels = choiceButtons(p).map((b) => b.props['aria-label'])
      assert.deepEqual([...labels].sort(), choicesOf(POLISH_CATALOG).map(([g, m, e]) => POLISH_MODEL.label(g, m, e)).sort())
    })
    t('UIPF-MODEL-EP-01', `visible ${lang}`, `(${lang}) a choice shows the model name; an effort choice shows the effort in a DSH Tag; the group name is not repeated inside the button`, async (c) => {
      const p = await page(c, sdk, { lang, catalog: POLISH_CATALOG })
      for (const [group, model, effort] of choicesOf(POLISH_CATALOG)) {
        const button = choiceButtons(p).find((b) => b.props['aria-label'] === POLISH_MODEL.label(group, model, effort))
        assert.ok(button, `no choice ${POLISH_MODEL.label(group, model, effort)}`)
        const text = textOf(button)
        assert.ok(text.includes(model), `${show(text)} does not show ${model}`)
        assert.ok(!text.includes(group), `${show(text)} repeats the group name`)
        if (effort !== undefined) {
          const tags = subtree(button).filter((n) => n.props[STAND_IN.primitive] === 'Tag')
          assert.ok(tags.some((tag) => textOf(tag).trim() === effort), `the effort ${effort} is not a Tag: ${show(tags.map(textOf))}`)
        }
      }
    })
  }
  t('UIPF-MODEL-EP-02', 'headings', 'each provider (group) name is shown once as a heading, before its choices; a choice comes after its own group\'s heading and before the next', async (c) => {
    const p = await page(c, sdk, { catalog: POLISH_CATALOG })
    const flat = p.nodes()
    const headingAt = POLISH_CATALOG.groups.map((g) => flat.findIndex((n) => n.tag !== U.button && (n.children ?? []).some((ch) => typeof ch === 'string' && ch.trim() === g.name)))
    assert.ok(headingAt.every((i) => i >= 0), `a group heading is missing: ${show(headingAt)}`)
    assert.deepEqual([...headingAt].sort((a, b) => a - b), headingAt, 'groups out of catalog order')
    for (const [gi, group] of POLISH_CATALOG.groups.entries()) {
      for (const button of choiceButtons(p).filter((b) => String(b.props['aria-label']).startsWith(group.name + ' / '))) {
        const at = flat.indexOf(button)
        assert.ok(at > headingAt[gi] && (gi + 1 === headingAt.length || at < headingAt[gi + 1]), `${button.props['aria-label']} is not under ${group.name}`)
      }
    }
  })
  // SPEC §4 (revised after review): each group is role="group" labelled by its heading.
  t('UIPF-MODEL-EP-02', 'role group', 'each provider group is a role="group" whose label is its heading (aria-labelledby → the heading, or aria-label = its name), holding exactly its own choices', async (c) => {
    const p = await page(c, sdk, { catalog: POLISH_CATALOG })
    const flat = p.nodes()
    const groups = flat.filter((n) => n.props.role === POLISH_MODEL.groupRole)
    assert.equal(groups.length, POLISH_CATALOG.groups.length, `role=group elements: ${groups.length}`)
    for (const [gi, group] of POLISH_CATALOG.groups.entries()) {
      const node = groups[gi]
      const by = node.props['aria-labelledby']
      const named = by !== undefined
        ? String(by).split(' ').map((id) => flat.find((n) => n.props.id === id)).filter(Boolean).map((n) => textOf(n).trim()).join(' ')
        : node.props['aria-label']
      assert.equal(named, group.name, `group ${gi} accessible name`)
      if (by !== undefined) assert.ok(String(by).split(' ').every((id) => subtree(node).some((n) => n.props.id === id)), 'the label is not the group\'s own heading')
      const inside = subtree(node).filter((n) => n.tag === U.button && n.props[POLISH_MODEL.choice] !== undefined).map((b) => b.props['aria-label'])
      assert.deepEqual(inside.sort(), choicesOf({ groups: [group] }).map(([g, m, e]) => POLISH_MODEL.label(g, m, e)).sort(), `${group.name} choices`)
    }
  })
  t('UIPF-MODEL-BVA-01', 'one group', 'a catalog of one group with one model → one heading, one choice "<group> / <model>"', async (c) => {
    const one = { ...POLISH_CATALOG, groups: [POLISH_CATALOG.groups[0]].map((g) => ({ ...g, models: [g.models[0]] })) }
    const p = await page(c, sdk, { catalog: one })
    assert.deepEqual(choiceButtons(p).map((b) => b.props['aria-label']), [POLISH_MODEL.label(one.groups[0].name, one.groups[0].models[0].name)])
  })
  t('UIPF-MODEL-EP-03', 'refused', 'the catalog read refused → a role="alert" line in the dialog and no choice', async (c) => {
    const p = await page(c, sdk, { modelCatalog: async () => ({ ok: false, error: { message: 'fbtest refused' } }) })
    assert.ok(p.dialogs().length, 'no dialog')
    assert.deepEqual(choiceButtons(p), [], 'choices without a catalog')
    const alerts = p.nodes().filter((n) => n.props.role === 'alert' && textOf(n).trim() !== '')
    assert.equal(alerts.length, 1, `alerts ${show(alerts.map(textOf))}`)
  })
  t('UIPF-MODEL-EP-03', 'none', 'an empty catalog → no choice, and the Open DSH settings button', async (c) => {
    const p = await page(c, sdk, { catalog: { ...U.catalog, groups: [], routableProviders: [] } })
    assert.deepEqual(choiceButtons(p), [])
    assert.ok(p.buttons().some((b) => U.settings.test(textOf(b))), 'no settings button in the empty state')
  })
}
