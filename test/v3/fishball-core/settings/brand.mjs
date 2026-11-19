/**
 * LOGO-BUTTON's settings and status rows for `fishball-core.settings` (the suite's README lists the
 * ids): core owns the logo theme's choice.
 *
 * - The settings page (`plugins.bundle.config` for core's namespace) gains one plain two-option
 *   control, `[data-fs-brand-style]`, labelled "Fishball" / "DeepSeek" (the same two names in zh),
 *   default Fishball. It reads core's top-level string `brandStyle`; an absent or unknown value is
 *   Fishball. Choosing an option writes that value through the config form
 *   (`form.set('brandStyle', value)`); a refused/rejected write is reported visibly.
 * - Core's public status snapshot carries `brand: {style}` beside fishball/guards/set/targets; the
 *   style is always `fishball` or `deepseek` and defaults to `fishball` for absent/unknown values.
 *   It follows the stored choice live (the status reads it on every snapshot).
 *
 * Observation points only: the form's public `ConfigForm` snapshot and `mutate` calls (page.mjs),
 * and the status factory's public `{snapshot, onChange}` face (../status/world.mjs).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { createWorld, loadPage, settle } from './page.mjs'
import { CORE, DSH } from './constants.mjs'
import { STAND_IN } from './primitives.mjs'
import { worldFor } from '../status/world.mjs'

const show = (v) => JSON.stringify(v)
const BRAND = Object.freeze({
  hook: 'data-fishball-brand-style',
  field: 'brandStyle',
  values: Object.freeze(['fishball', 'deepseek']),
  labels: Object.freeze({ fishball: 'Fishball', deepseek: 'DeepSeek' }),
  default: 'fishball',
})

/** Enumerate the rendered controls/choices before comparing them: filtering by the expected
 * values, or looking up only their labels, would silently discard duplicate or unknown radios. */
function controlOf(page) {
  const controls = page.byAttr(BRAND.hook)
  assert.equal(controls.length, 1, `expected exactly one [${BRAND.hook}] control`)
  return controls[0]
}

const isRadio = (n) => n.tag === 'input' && n.props.type === 'radio'
function optionWords(control) {
  return findAll([control], (n) => n.tag === 'option' || isRadio(n)).map((choice) => {
    const label = isRadio(choice) ? findAll([control], (n) => n.tag === 'label' && findAll([n], (x) => x === choice).length > 0)[0] : choice
    return [String(choice.props.value), label ? textOf(label) : undefined]
  })
}

/** The selected value as the control shows it (a select's value, or the checked radio). */
function selectedOf(control) {
  if (control.tag === 'select') return control.props.value
  const checked = findAll([control], (n) => n.tag === 'input' && n.props.type === 'radio' && n.props.checked === true)[0]
  return checked?.props.value
}

/** Choose one value through the control's own change handler. */
async function choose(page, control, value) {
  if (control.tag === 'select') {
    control.props.onChange?.({ target: { value }, currentTarget: { value } })
  } else {
    const input = findAll([control], (n) => n.tag === 'input' && String(n.props.value) === value)[0]
    assert.ok(input, `no radio for ${value}`)
    input.props.onChange?.({ target: { checked: true, value }, currentTarget: { checked: true, value } })
  }
  await settle()
}

async function pageOf(t, version, options = {}) {
  const page = await loadPage(t, createWorld({ sdk: version, core: {}, ...options }))
  await page.open(DSH.view.page)
  return page
}

export function registerBrandSettingCases(version) {
  const t = (id, row, title, fn) => caseTest(version, id, row, title, fn)
  const brandOf = (snapshot) => snapshot.brand?.style
  const open = (c, options) => pageOf(c, version, options)

  // ============================================================== the control and its choice
  for (const lang of DSH.locales) {
    t('BRAND-SET-EP-01', `control ${lang}`, `(${lang}) core's settings page has one [${BRAND.hook}] control with exactly the options ${BRAND.values.join(' / ')} labelled ${BRAND.labels.fishball} / ${BRAND.labels.deepseek}; with no stored brandStyle Fishball is selected`, async (c) => {
      const page = await open(c, { lang })
      const control = controlOf(page)
      assert.deepEqual(optionWords(control), BRAND.values.map((value) => [value, BRAND.labels[value]]))
      assert.equal(selectedOf(control), BRAND.default)
    })
  }
  for (const [label, core, expected] of [
    ['absent', {}, BRAND.default],
    ['fishball', { brandStyle: 'fishball' }, 'fishball'],
    ['deepseek', { brandStyle: 'deepseek' }, 'deepseek'],
    ['unknown', { brandStyle: 'orca' }, BRAND.default],
    ['another case', { brandStyle: 'DeepSeek' }, BRAND.default],
    ['a non-string', { brandStyle: 7 }, BRAND.default],
  ]) {
    t('BRAND-SET-EP-02', label, `stored ${label} (${show(core.brandStyle)}) → the control shows ${expected}`, async (c) => {
      const page = await open(c, { core })
      assert.equal(selectedOf(controlOf(page)), expected)
    })
  }
  t('BRAND-SET-UC-01', 'choose DeepSeek', "choosing DeepSeek writes {op:'set', path:['brandStyle'], value:'deepseek'} through core's config form, and the page shows the stored value", async (c) => {
    const page = await open(c)
    const control = controlOf(page)
    await choose(page, control, 'deepseek')
    // Requirement: the write goes through the config form's `form.set(field, value)`.
    assert.deepEqual(page.world.mutations.map((m) => ({ ns: m.ns, ops: m.ops })), [{ ns: CORE.namespace, ops: [{ op: DSH.op.set, path: [BRAND.field], value: 'deepseek' }] }])
    assert.equal(page.world.coreValue()[BRAND.field], 'deepseek')
    assert.equal(selectedOf(controlOf(page)), 'deepseek')
  })
  t('BRAND-SET-UC-01', 'choose Fishball', 'choosing Fishball writes brandStyle fishball and the page shows it', async (c) => {
    const page = await open(c, { core: { brandStyle: 'deepseek' } })
    const control = controlOf(page)
    await choose(page, control, 'fishball')
    assert.deepEqual(page.world.mutations.map((m) => m.ops), [[{ op: DSH.op.set, path: [BRAND.field], value: 'fishball' }]])
    assert.equal(selectedOf(controlOf(page)), 'fishball')
  })
  for (const [row, answer] of [['refused', false], ['rejected', 'reject']]) {
    t('BRAND-SET-E1', row, `the Host ${row} the write: a visible alert/save-failed line, and the stored value stays ${BRAND.default}`, async (c) => {
      const page = await open(c)
      page.world.mutateAnswer = answer
      await choose(page, controlOf(page), 'deepseek')
      const visible = [...page.alerts(), ...page.byAttr(STAND_IN.saveFailed)].filter((n) => textOf(n).trim() !== '')
      assert.ok(visible.length > 0, `${row}: no visible save failure`)
      assert.equal(page.world.coreValue()?.brandStyle, undefined)
    })
  }

  // ============================================================== core's normalized status snapshot
  t('BRAND-STATUS-EP-01', 'default', 'with no brand port (an absent stored value) the status snapshot brand is exactly {style: fishball}', async (c) => {
    const w = await worldFor(c, version)
    assert.deepEqual(w.snapshot().brand, { style: BRAND.default })
    assert.ok(Object.isFrozen(w.snapshot().brand), 'brand is not frozen')
  })
  for (const [row, brand, expected] of [
    ['fishball', () => 'fishball', 'fishball'],
    ['deepseek', () => 'deepseek', 'deepseek'],
    ['undefined', () => undefined, BRAND.default],
    ['null', () => null, BRAND.default],
    ['empty', () => '', BRAND.default],
    ['unknown', () => 'orca', BRAND.default],
    ['another case', () => 'DeepSeek', BRAND.default],
    ['a number', () => 7, BRAND.default],
    ['an object', () => ({ style: 'deepseek' }), BRAND.default],
    ['an array', () => ['deepseek'], BRAND.default],
  ]) {
    t('BRAND-STATUS-EP-02', row, `stored logo theme ${row} → brand.style ${expected}`, async (c) => {
      const w = await worldFor(c, version, { brand })
      assert.deepEqual(w.snapshot().brand, { style: expected })
    })
  }
  t('BRAND-STATUS-ST-01', 'live', 'after the stored choice changes and core recomposes (its settings write / HMR path), the new status snapshot reads fishball → deepseek → fishball', async (c) => {
    let stored = 'fishball'
    const w = await worldFor(c, version, { brand: () => stored })
    assert.equal(brandOf(w.snapshot()), 'fishball')
    stored = 'deepseek'
    assert.equal(brandOf((await w.recompose()).snapshot()), 'deepseek')
    stored = 'fishball'
    assert.equal(brandOf((await w.recompose()).snapshot()), 'fishball')
  })
  t('BRAND-STATUS-SHAPE-01', 'shape', 'every snapshot keeps exactly {fishball, guards, set, targets, brand} and brand.style one of fishball/deepseek', async (c) => {
    for (const brand of [() => undefined, () => 'fishball', () => 'deepseek', () => 'orca']) {
      const w = await worldFor(c, version, { brand })
      const s = w.snapshot()
      assert.deepEqual(Object.keys(s).sort(), ['brand', 'fishball', 'guards', 'set', 'targets'])
      assert.ok(BRAND.values.includes(s.brand.style), show(s.brand.style))
    }
  })
}
