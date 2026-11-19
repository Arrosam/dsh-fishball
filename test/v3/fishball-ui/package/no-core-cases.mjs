/**
 * R-FIX-FUI F2 black-box rows: without core, fishball-ui changes nothing (Q-G2 = A; the user's
 * decision 2026-11-18). The UI guard rows and the hosted child's Preview Notice row live in core's
 * patch; fishball-ui's patch keeps only its insert rows.
 *
 * Level: integration over DSH's own composition, no process. The REAL patches (core's and
 * fishball-ui's, read by the SDK's `loadOverlayPatches`) are composed by the SDK's
 * `composeEntries` (cordis-plugin-include `applyEntryPatches`) over dsh-base and dsh-web-app's rows
 * and an EARLIER bundle layer that sets `ui-permission` disabled and acknowledges the welcome notice;
 * each resulting value is resolved by the SDK's own loader `interpolate` against a Cordis Context
 * with a fake `profileContext` (startedBundles, overlays, dir) and with or without `hmr`.
 *
 * Techniques:
 * - Decision table NOCORE-DT-01 (bundles in the DSH: fishball-ui only / core + fishball-ui / core
 *   only; HMR off): rules (a), (b), (c) of the requirement;
 * - Decision table NOCORE-DT-02 (fishball-ui started × fishball-ui selected in the manifest × HMR
 *   present × manifest readable): the live-HMR rule;
 * - Decision table NOCORE-DT-03 (hosted child overlay × fishball-ui started): rule (d);
 * - EP NOCORE-EP-01: (a) leaves the composition exactly as without Fishball (every guard row, the
 *   notice row), only core-missing is enabled;
 * - static F7-EP-01: core's `contracts/guards.d.ts` `GuardedRow` union is exactly core's guard rows
 *   (`readIntendedGuards().rows` without the shipped presets, which are `ShippedPresetRow`) plus `uiRows`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { GUARDS } from '../guards/constants.mjs'
import { CORE_SPLIT, NOTICE, ROWS } from './constants.mjs'
import { composedWith, coreIntendedReader, corePatch, findRows, resolvedWith, uiPatch } from './subject.mjs'

const show = (v) => JSON.stringify(v)
const CORE = V3.core.name
const UI = V3.ui.name
/** The earlier bundle layer (test data): a third-party bundle that switched one UI row off and acknowledged the notice. */
const EARLIER = Object.freeze({
  bundle: 'fbtest-earlier-bundle',
  row: 'ui-permission',
  ack: 'fbtest-earlier-ack',
  layer: () => [{ id: 'ui-permission', disabled: true }, { id: NOTICE.row, config: { [NOTICE.field]: 'fbtest-earlier-ack' } }],
})
const childOverlay = Object.freeze([Object.freeze({ insert: Object.freeze([Object.freeze({ id: NOTICE.childRow, name: 'fbtest-child-row', config: Object.freeze({}) })]) })])
const INSERTED = Object.freeze({ withCore: Object.keys(ROWS.withCore), coreMissing: ROWS.coreMissing.id })
const TEMP_PREFIX = 'fbtest-r-fix-fui-profile-'
/**
 * Core's own guard rows that DSH's shipped layers have (dsh-instance is inserted by the instance's
 * bundle, absent here, so a patch of it matches nothing in this composition).
 */
const CORE_GUARDS = Object.freeze(CORE_SPLIT.guards.filter((id) => id !== V3.instance.name))

/** A profile folder whose manifest selects `bundles` (`dsh.profile.bundles`), removed after the case; `null` → no manifest. */
function profileDir(t, bundles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX))
  t.after(() => { if (path.basename(dir).startsWith(TEMP_PREFIX)) fs.rmSync(dir, { recursive: true, force: true }) })
  if (bundles !== null) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fbtest-profile', dsh: { profile: { bundles } } }))
  return dir
}

export function registerNoCoreCases(sdk) {
  const t = (id, row, title, fn) => caseTest(sdk, id, row, title, fn)
  /** The composition of DSH's layers, the earlier bundle and the given Fishball patches (core last). */
  async function compose({ core, ui }) {
    const layers = [EARLIER.layer()]
    if (ui) layers.push(await uiPatch(sdk))
    if (core) layers.push(await corePatch(sdk))
    return composedWith(sdk, ...layers)
  }
  /** Every value the rows decide, resolved for one context: the 8 UI rows, core's own guards, the notice, the inserted rows. */
  async function decide(rows, profileContext, hmr = false) {
    const one = (id) => { const found = findRows(rows, id); return found.length === 0 ? undefined : found.at(-1) }
    const disabled = async (id) => { const row = one(id); return row === undefined ? 'absent' : Boolean(await resolvedWith(sdk, row.disabled ?? false, profileContext, { hmr })) }
    const out = { guards: {}, core: {}, inserted: {} }
    for (const id of ROWS.guards) out.guards[id] = await disabled(id)
    for (const id of CORE_GUARDS) out.core[id] = await disabled(id)
    for (const id of [...INSERTED.withCore, INSERTED.coreMissing]) out.inserted[id] = await disabled(id)
    const notice = one(NOTICE.row)
    out.notice = notice === undefined ? 'absent' : (await resolvedWith(sdk, notice.config ?? {}, profileContext, { hmr }))?.[NOTICE.field]
    return out
  }
  const context = (startedBundles, extra = {}) => Object.freeze({ startedBundles: Object.freeze([...startedBundles]), overlays: Object.freeze([]), ...extra })

  // ---- NOCORE-EP-01 / DT-01 rule (a): fishball-ui only, no core
  t('NOCORE-DT-01', '(a) values', 'fishball-ui only (no core), no HMR: the earlier bundle\'s ui-permission stays disabled and its welcome acknowledgement stays', async () => {
    const started = [EARLIER.bundle, UI]
    const d = await decide(await compose({ core: false, ui: true }), context(started))
    assert.equal(d.guards[EARLIER.row], true, show(d.guards))
    assert.equal(d.notice, EARLIER.ack)
  })
  t('NOCORE-EP-01', '(a) unchanged', 'fishball-ui only: every UI guard row and the notice row resolve exactly as in the same DSH without any Fishball patch', async () => {
    const started = [EARLIER.bundle, UI]
    const without = await decide(await compose({ core: false, ui: false }), context(started))
    const withUi = await decide(await compose({ core: false, ui: true }), context(started))
    assert.deepEqual(withUi.guards, without.guards)
    assert.equal(withUi.notice, without.notice)
  })
  t('NOCORE-EP-01', '(a) rows', 'fishball-ui only: only fishball-ui-core-missing is enabled; fishball-ui, fishball-page and fishball-recommend-plugins are disabled', async () => {
    const d = await decide(await compose({ core: false, ui: true }), context([EARLIER.bundle, UI]))
    assert.deepEqual(d.inserted, { ...Object.fromEntries(INSERTED.withCore.map((id) => [id, true])), [INSERTED.coreMissing]: false })
  })
  // ---- rule (b): core + fishball-ui
  t('NOCORE-DT-01', '(b) both', 'core + fishball-ui, no HMR: all 8 UI guard rows are disabled; core\'s own guard rows disabled; the core-missing row off', async () => {
    const d = await decide(await compose({ core: true, ui: true }), context([EARLIER.bundle, UI, CORE]))
    assert.deepEqual(d.guards, Object.fromEntries(ROWS.guards.map((id) => [id, true])))
    assert.deepEqual(d.core, Object.fromEntries(CORE_GUARDS.map((id) => [id, true])))
    assert.deepEqual(d.inserted, { ...Object.fromEntries(INSERTED.withCore.map((id) => [id, false])), [INSERTED.coreMissing]: true })
  })
  // ---- rule (c): core only (documented limit: the earlier bundle's disable is not preserved)
  t('NOCORE-DT-01', '(c) core only', 'core only, no HMR: every UI guard row is enabled (DSH stock), the earlier ui-permission disable included (documented limit); core\'s own guard rows unchanged (disabled)', async () => {
    const d = await decide(await compose({ core: true, ui: false }), context([EARLIER.bundle, CORE]))
    assert.deepEqual(d.guards, Object.fromEntries(ROWS.guards.map((id) => [id, false])))
    assert.deepEqual(d.core, Object.fromEntries(CORE_GUARDS.map((id) => [id, true])))
  })

  // ---- NOCORE-DT-02: the live-HMR rule (core + fishball-ui patches composed)
  // [rule, started has ui, manifest (null: unreadable), hmr, expected disabled]
  const hmrRules = [
    ['1 HMR, ui selected now, not started (enabled live)', false, [CORE, UI], true, true],
    ['2 HMR, ui deselected now, started (disabled live)', true, [CORE], true, false],
    ['3 HMR, manifest unreadable → startedBundles (ui started)', true, null, true, true],
    ['4 HMR, manifest unreadable → startedBundles (ui not started)', false, null, true, false],
    ['5 no HMR, manifest selects ui but not started → startedBundles', false, [CORE, UI], false, false],
    ['6 no HMR, manifest without ui but started → startedBundles', true, [CORE], false, true],
  ]
  for (const [rule, started, manifest, hmr, expected] of hmrRules) {
    t('NOCORE-DT-02', rule, `UI guard rows ${expected ? 'disabled' : 'enabled'}`, async (c) => {
      const rows = await compose({ core: true, ui: true })
      const ctxOf = context(started ? [CORE, UI] : [CORE], { dir: profileDir(c, manifest) })
      const d = await decide(rows, ctxOf, hmr)
      assert.deepEqual(d.guards, Object.fromEntries(ROWS.guards.map((id) => [id, expected])))
    })
  }

  // ---- NOCORE-DT-03: rule (d), the hosted child's welcome acknowledgement
  // [rule, overlays, started, expected]
  for (const [rule, overlays, started, expected] of [
    ['hosted child, both', childOverlay, [CORE, UI], NOTICE.version],
    ['standalone, both', [], [CORE, UI], undefined],
    ['hosted child, core only', childOverlay, [CORE], undefined],
  ]) {
    t('NOCORE-DT-03', rule, `${NOTICE.row}.${NOTICE.field} → ${show(expected) ?? 'undefined'} (no HMR; the earlier bundle acknowledged ${EARLIER.ack})`, async () => {
      const d = await decide(await compose({ core: started.includes(CORE), ui: started.includes(UI) }), context([EARLIER.bundle, ...started], { overlays }))
      assert.equal(d.notice, expected)
    })
  }

  // ---- F7: the K3 GuardedRow union matches core's patch rows + uiRows
  t('F7-EP-01', 'GuardedRow', "guards.d.ts GuardedRow (read as declaration text) = core's guard rows (no shipped presets) ∪ uiRows, ui-model-selection included", async () => {
    const intended = (await coreIntendedReader(sdk))()
    const expected = [...intended.rows.filter((id) => !GUARDS.shippedPresets.includes(id)), ...intended.uiRows]
    assert.deepEqual([...GUARDS.rows].sort(), [...expected].sort())
    assert.ok(GUARDS.rows.includes('ui-model-selection'), show(GUARDS.rows))
  })
}
