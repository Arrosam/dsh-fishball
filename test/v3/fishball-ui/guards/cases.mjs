/**
 * F-GUARDS black-box cases (.runtime/reports/v3-remaining-plan.md W2 row F-GUARDS; v3-tasks.md row
 * F-GUARDS): PLAT-UC-04 (composition), PLAT-DT-04, UIM-DT-01 rows 9, 10b, 14 and HOST-UC-08 A3.
 * The fishball-hosted-settings rows (HOST-DT-03 rule 6, HOST-UC-08 E2) left with that bundle, and
 * a guarded DSH offers only core's agent preset (REMOVE-WD, design §1.0, §7). Requirements R-FB-02,
 * R-FB-09, R-FB-12, R-FB-13, R-ARCH-02;
 * design §5a.2; spike V3-S6 (`86800d2`, `7c2230e`). Task done-when: "the guards are defined exactly
 * once; the report is set and cleared at app ready and on a settings change; the standalone
 * self-reorder works".
 *
 * Techniques, Use Cases first: Use Case (PLAT-UC-04 main, A1, A3, E1; HOST-UC-08 A3, E2), Decision
 * Table (PLAT-DT-04 rules 1–6; UIM-DT-01 rows; the override table A1 × guard
 * class), State Transition (the report: none → ok / guards-overridden at app ready, then set and
 * cleared by each owner change and restore), EP (the classes of OverriddenGuard; the offered
 * presets: core's alone, or one more) and BVA (the
 * app-ready boundary: nothing before it, a report at it).
 *
 * Level: integration. Each scenario is one throwaway standalone DSH home on the SDK the file names,
 * booted once or more (worker.mjs), with this checkout's `packages/core`, `packages/fishball-ui`
 * (F-UI: the UI-only guard rows are its patch's, applied when core is started) and generated stand-in
 * bundles. Every guard value is K3's (constants.mjs reads guards.d.ts). Flows a later task owns are
 * `todo` and name it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { until } from '../../../support/util.mjs'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { corePatch, ownFiles, tokensOf, unitOf } from '../../fishball-core/package/static.mjs'
import { CORE as CORE_PACKAGE, SLOT, runtimeOf } from '../../fishball-core/package/constants.mjs'
import { DSH as SETTINGS_DSH } from '../../fishball-core/settings/constants.mjs'
import { withdrawnCase } from '../../fishball-core/settings/withdrawn.mjs'
import { bootGraph, openSettingsPage } from '../../fishball-core/package/page.mjs'
import { readManifest } from '../../contract/package-boundaries/packages.mjs'
import { bootEnv, isOk, scenario, waitReport } from './harness.mjs'
import { BUDGET, DSH_ROW, FIXTURE, GUARDS, LATER, OWNER, PROFILE, REPORT, SDK_SCOPE, SPLIT, UI_COMPONENT } from './constants.mjs'

const JS = /\.(?:c|m)?js$/
const CORE = V3.core.name
const UI = UI_COMPONENT
const CORE_PATCH = CORE_PACKAGE.patchFile
const INSTANCE = FIXTURE.instance
const ALL_GUARD_ROWS = Object.freeze([...GUARDS.rows, ...GUARDS.shippedPresets])
/** R-FB-12 names the instance in the report until the guard holds; K3 also offers `bundle-order`. Either names it. */
const ORDER_NAMES = Object.freeze([REPORT.row(GUARDS.instanceRow), REPORT.bundleOrder])
const namesOrder = (report) => report?.status === REPORT.overridden && report.overridden.some((g) => ORDER_NAMES.includes(g))
const show = (v) => JSON.stringify(v)
/** Preconditions that keep a "never" case from passing vacuously before core's guards exist. */
function needGuardsHeld(rows) {
  const instance = rows.find((r) => r.id === INSTANCE)
  assert.equal(instance?.disabled, true, "precondition: core's guards hold (dsh-instance off): " + show(instance))
}
function needReports(history) {
  assert.ok(history.some((h) => h.report !== null), 'precondition: core published a guard report')
}
/** The instance's launch code, where V2 kept the LITE guard rows (v3-tasks.md F-GUARDS "Owns"). */
const INSTANCE_LAUNCH = 'src/native-runtime/'
/** A bundle patch as the SDK's own loader reads it (dsh-app-boot loadOverlayPatches, both SDKs). */
async function patchRows(sdk, dir) {
  const { loadOverlayPatches } = await import(pathToFileURL(path.join(runtimeOf(sdk), SDK_SCOPE + 'dsh-app-boot', 'lib', 'index.js')).href)
  return loadOverlayPatches('dsh', path.join(dir, CORE_PATCH))
}
/**
 * A row's effective `disabled` in a DSH started with core (F-UI: fishball-ui's UI guard rows are a
 * `!!js` condition on `profileContext.startedBundles`), evaluated by the SDK's own loader evaluator.
 */
async function disabledWithCore(sdk, row) {
  const [{ Context }, { evaluate, isJsExpr }] = await Promise.all(['cordis', 'cordis-plugin-loader'].map((n) => import(pathToFileURL(path.join(runtimeOf(sdk), SDK_SCOPE + n, 'lib', 'index.js')).href)))
  if (!isJsExpr(row.disabled)) return row.disabled === true
  const ctx = new Context()
  ctx.provide('profileContext', { startedBundles: [CORE, UI] })
  return Boolean(evaluate(ctx, row.disabled.__jsExpr))
}

/** One owner action while DSH runs, then the report once it has settled to `test` (or the timeout). */
async function ownerChange(h, action, test) {
  await action()
  return waitReport(h, test)
}
const profilePatchFile = (home) => path.join(home, 'profiles', PROFILE, 'cordis.patch.yml')
/** The owner's profile patch rows as YAML text (JSON is a YAML subset; `!!js` needs YAML). */
const sandboxOverride = `- id: ${DSH_ROW.sandbox}\n  config:\n    mode: ${OWNER.widerMode}\n    workspaceRoot: !!js process.cwd()\n`
const approvalOverride = JSON.stringify([{ id: DSH_ROW.approval, config: { policy: OWNER.approval } }])
const EMPTY_PATCH = '[]\n'

/**
 * A scripted page of one running standalone DSH (core/page.mjs), read once and closed. The slim
 * panel it used to read is removed (requirements 1.34 item 4); what is read now is the page's main
 * slot keys (no slim panel entry may remain) and its failed plugins. Core's own settings page in
 * standalone mode is F-SETTINGS' row SET3-UC-01 A4 (test/v3/fishball-core/settings).
 */
async function settingsFacts(sdk, h) {
  const cleanups = []
  try {
    const page = await openSettingsPage({ after: (fn) => cleanups.push(fn) }, { sdk, child: { origin: h.origin, cookie: h.cookie } })
    return {
      mainKeys: page.entriesOf(SLOT.main).map((e) => e.options.key ?? e.options.id),
      failed: page.failed(),
    }
  } finally {
    for (const fn of cleanups.reverse()) await fn()
  }
}
async function graphIds(h) { return (await bootGraph({ origin: h.origin, cookie: h.cookie })).map((e) => e.id) }

export function registerGuardCases(sdk) {
  // ============================================================================================
  // Scenario NATIVE (PLAT-DT-04 rule 3a, 3c, 4; PLAT-UC-04 main, A1, A3, E1; UIM-DT-01 rows 9, 14):
  // a standalone DSH where the owner installed core FIRST (DSH's native install order), HMR on.
  // ============================================================================================
  const native = scenario('v3-fg-native', sdk, [
    async (boot, f) => {
      const h = await boot(bootEnv({ members: [FIXTURE.probe.name, CORE, UI, INSTANCE, FIXTURE.other] }))
      f.home = h.home
      f.pid1 = h.pid
      f.readyAt1 = await h.call('readyAt')
      f.probe = await h.call('probe')
      // HMR on: DSH recomposes live after core's reorder; wait until the instance row is off.
      await until(async () => (await h.call('rows', { ids: [INSTANCE] }))[0].disabled === true, BUDGET.recomposeMs, BUDGET.pollMs)
      f.settled1 = await waitReport(h, isOk)
      f.history1 = await h.call('history')
      f.bundles1 = await h.call('bundles')
      f.manifest1 = await h.call('manifestStat')
      f.rows1 = await h.call('rows', { ids: [...ALL_GUARD_ROWS] })
      f.presets1 = await h.call('presets')
      f.policy1 = await h.call('policy')
      f.bundleList1 = await h.call('bundleList')
      f.graph1 = await graphIds(h)
      f.manager = await h.call('newSession')
      // A1 × guard class (decision table): each owner override sets the report; each restore clears it.
      // F-UI: a guarded row is either fishball-ui's (a UI-only row, reported because fishball-ui is
      // present) or core's own; one of each.
      const row = SPLIT.uiRows[0]
      const coreRow = SPLIT.coreRows.find((r) => r !== GUARDS.instanceRow)
      const preset = GUARDS.shippedPresets[0]
      f.override = {}
      f.override.row = { guard: REPORT.row(row) }
      f.override.row.set = await ownerChange(h, () => h.call('setRowEnabled', { id: row, enabled: true }), (r) => r?.overridden?.includes(f.override.row.guard))
      f.override.row.rowAfter = (await h.call('rows', { ids: [row] }))[0]
      f.override.row.cleared = await ownerChange(h, () => h.call('setRowEnabled', { id: row, enabled: false }), isOk)
      f.override.coreRow = { guard: REPORT.row(coreRow) }
      f.override.coreRow.set = await ownerChange(h, () => h.call('setRowEnabled', { id: coreRow, enabled: true }), (r) => r?.overridden?.includes(f.override.coreRow.guard))
      f.override.coreRow.cleared = await ownerChange(h, () => h.call('setRowEnabled', { id: coreRow, enabled: false }), isOk)
      f.override.sandbox = { guard: REPORT.policy('sandbox') }
      f.override.sandbox.set = await ownerChange(h, () => h.call('writeProfilePatch', { text: sandboxOverride }), (r) => r?.overridden?.includes(f.override.sandbox.guard))
      f.override.sandbox.policyAfter = await h.call('policy')
      f.override.sandbox.cleared = await ownerChange(h, () => h.call('writeProfilePatch', { text: EMPTY_PATCH }), isOk)
      f.override.approval = { guard: REPORT.policy('approval') }
      f.override.approval.set = await ownerChange(h, () => h.call('writeProfilePatch', { text: approvalOverride }), (r) => r?.overridden?.includes(f.override.approval.guard))
      f.override.approval.policyAfter = await h.call('policy')
      f.override.approval.cleared = await ownerChange(h, () => h.call('writeProfilePatch', { text: EMPTY_PATCH }), isOk)
      f.override.preset = { guard: REPORT.row(preset), offered: REPORT.agentPresets }
      f.override.preset.set = await ownerChange(h, () => h.call('setRowEnabled', { id: preset, enabled: true }), (r) => r?.overridden?.includes(f.override.preset.guard))
      f.override.preset.presetsAfter = await h.call('presets')
      f.override.preset.cleared = await ownerChange(h, () => h.call('setRowEnabled', { id: preset, enabled: false }), isOk)
      f.alive1 = (await fetch(h.origin + '/', { headers: { cookie: h.cookie } })).status
      f.historyEnd1 = await h.call('history')
    },
    async (boot, f) => {
      // The next start (rule 3c): core already last, nothing written; the instance never starts.
      const h = await boot(bootEnv())
      f.pid2 = h.pid
      f.report2 = await waitReport(h, (r) => r !== null, BUDGET.readyMs)
      f.manifest2 = await h.call('manifestStat')
      f.starts2 = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
      f.resumed = await h.call('resumeSession', { sessionId: f.manager.sessionId })
      // Rule 4: the owner moves core first again while DSH runs.
      f.movedBack = await h.call('moveBundle', { name: CORE, index: 0 })
      f.report2b = await waitReport(h, (r) => r?.status === REPORT.overridden)
      f.bundles2b = await h.call('bundles')
    },
    async (boot, f) => {
      // Rule 4, the following start: not moved back; the report keeps naming what no longer applies.
      const h = await boot(bootEnv())
      f.report3 = await waitReport(h, (r) => r?.status === REPORT.overridden, BUDGET.readyMs)
      f.bundles3 = await h.call('bundles')
    },
  ])

  // ---------------------------------------------------------------- PLAT-UC-04 main flow (composition)
  caseTest(sdk, 'PLAT-UC-04', 'main', 'the guarded rows and the shipped preset rows are present and switched off (not deleted) once core holds', async () => {
    const f = await native()
    const wrong = f.rows1.filter((r) => ALL_GUARD_ROWS.includes(r.id) && r.present && !r.disabled)
    assert.deepEqual(wrong, [], 'enabled guard rows')
    const missing = f.rows1.filter((r) => GUARDS.shippedPresets.includes(r.id) && !r.present)
    assert.deepEqual(missing, [], 'a shipped preset row was deleted, not switched off')
  })
  caseTest(sdk, 'PLAT-UC-04', 'main', 'the effective policy is the intended one (sandbox, approval read directly, permission presets, defaults)', async () => {
    const f = await native()
    assert.deepEqual(f.policy1, { ...GUARDS.policy, permissionPresets: [...GUARDS.policy.permissionPresets] })
  })
  caseTest(sdk, 'PLAT-UC-04', 'main', "agentPresets.list() offers exactly core's preset (K3 FishballAgentPreset), the default", async () => {
    const f = await native()
    assert.deepEqual([...f.presets1.ids].sort(), [...GUARDS.offeredPresets].sort())
    assert.equal(f.presets1.defaultId, GUARDS.policy.defaultAgentPreset)
  })
  caseTest(sdk, 'PLAT-UC-04', 'main', 'a new session runs the default Fishball preset with exactly the manager tools, read-only', async () => {
    const f = await native()
    assert.ok(f.manager.answered, 'the model was not called for the new session')
    assert.deepEqual([...f.manager.tools].sort(), [...GUARDS.managerTools].sort())
    assert.equal(f.manager.sandbox, GUARDS.policy.sandbox)
    assert.equal(f.manager.permission, GUARDS.policy.defaultPermissionPreset)
  })
  caseTest(sdk, 'PLAT-UC-04', 'main', 'the manager session resumes in a new process with the same tools, read-only (R-FB-13); no manager-tools report', async () => {
    const f = await native()
    assert.ok(f.resumed.resumed, 'not resumed: ' + show(f.resumed))
    assert.deepEqual([...f.resumed.tools].sort(), [...GUARDS.managerTools].sort())
    assert.equal(f.resumed.sandbox, GUARDS.policy.sandbox)
    assert.equal(f.report2?.overridden?.includes(REPORT.managerTools), false, show(f.report2))
  })
  // F-UI (requirements 1.38 Q-N2, R-FB-14): fishball-ui is its own bundle beside core (it replaced
  // "no separate fishball-ui bundle", which held while the UI shipped inside core).
  caseTest(sdk, 'PLAT-UC-04', 'main', 'the plugin list holds fishball-core and fishball-ui, each once', async () => {
    const f = await native()
    const names = f.bundleList1.map((b) => b.name)
    for (const name of [CORE, UI]) assert.equal(names.filter((n) => n === name).length, 1, name + ': ' + show(names))
  })
  // V3 rule (design e1e5577 §9.1 and §5a.2; Fishball decisions 2026-11-15, I-PLACE; F-UI): DSH serves
  // a client only for a path row (its nearest manifest) or a bare package name. So core's and
  // fishball-ui's manifests give one entry each, and fishball-page and fishball-recommend-plugins
  // come from their own packages inside fishball-ui. Any other Fishball client entry still fails.
  caseTest(sdk, 'PLAT-UC-04', 'main', "the page's client graph holds core's and fishball-ui's entries, and only the page and recommended-tab packages of fishball-ui beside them", async () => {
    const f = await native()
    const fishball = f.graph1.filter((id) => !id.startsWith(SDK_SCOPE) && /fishball/i.test(id))
    const uiPackages = Object.entries(SPLIT.uiPackages)
    assert.deepEqual(fishball.filter((id) => !uiPackages.some(([ui]) => ui === id)).sort(), [CORE, UI].sort(), 'Fishball client entries other than core, fishball-ui and its packages')
    // A graph entry's id is the name of the manifest it is served from: each allowed one must be its own package's.
    for (const [id, folder] of uiPackages.filter(([ui]) => fishball.includes(ui))) {
      const own = readManifest(path.join(V3.ui.dir, folder))
      assert.equal(own?.name, id, `${id} is not the name of fishball-ui/${folder}/package.json`)
      assert.ok(own?.dsh?.client, `fishball-ui/${folder}/package.json declares no dsh.client`)
    }
  })
  caseTest(sdk, 'PLAT-UC-04', 'main', "core's and fishball-ui's patches (read by the SDK's patch loader) together switch every guard row off when core is started", async () => {
    assert.notEqual(corePatch(), null, 'packages/core/cordis.patch.yml is missing')
    const rows = [...await patchRows(sdk, V3.core.dir), ...await patchRows(sdk, V3.ui.dir)].filter((r) => r?.id !== undefined && !Array.isArray(r.insert))
    const off = new Set()
    for (const r of rows) if (await disabledWithCore(sdk, r)) off.add(r.id)
    assert.deepEqual(ALL_GUARD_ROWS.filter((id) => !off.has(id)), [], 'guard rows neither patch switches off')
  })
  caseTest(sdk, 'PLAT-UC-04', 'main', "the guards are defined once: the instance's launch code no longer holds the guard rows (the LITE rows moved out)", async () => {
    const files = ownFiles(await unitOf(V3.instance.name)).filter((f) => JS.test(f) && f.startsWith(INSTANCE_LAUNCH))
    assert.ok(files.length > 0, 'no shipped instance file under ' + INSTANCE_LAUNCH)
    const tokens = await tokensOf(fs.realpathSync(V3.instance.dir), files)
    // dsh-instance is the instance's own row id, so it is not evidence of a guard definition.
    const guardIds = ALL_GUARD_ROWS.filter((id) => id !== GUARDS.instanceRow)
    const hits = [...tokens].flatMap(([file, t]) => guardIds.filter((id) => t.strings.includes(id)).map((id) => file + ': ' + id))
    assert.deepEqual(hits, [])
  })
  caseTest(sdk, 'PLAT-UC-04', 'main', 'exactly one Fishball manager session', null, LATER.wire)
  caseTest(sdk, 'PLAT-UC-04', 'main', 'the A-lite page (navigation hidden, not focusable; shortcuts remapped), the recommended tab and slim settings in a browser', null, LATER.page)
  caseTest(sdk, 'PLAT-UC-04', 'main', 'install of the four tarballs natively; the plugin list shows four Fishball entries', null, LATER.pack)
  caseTest(sdk, 'PLAT-UC-04', 'post', 'no DSH code, bundle or other plugin file was patched (the SDK and the stand-in bundles are unchanged)', async () => {
    const f = await native()
    needGuardsHeld(f.rows1)
    const standin = path.join(f.home, FIXTURE.dir, INSTANCE, 'cordis.patch.yml')
    assert.ok(fs.existsSync(standin))
    assert.deepEqual(JSON.parse(fs.readFileSync(standin, 'utf8')), [{ insert: [{ id: INSTANCE, name: INSTANCE, config: {} }] }])
  })

  // ---------------------------------------------------------------- the report's state machine: app-ready boundary (BVA)
  caseTest(sdk, 'PLAT-UC-04', 'A1', 'ST none → report: nothing is published before app ready (probe during boot)', async () => {
    const f = await native()
    assert.ok(f.probe, 'the probe row did not run')
    needReports(f.history1)
    assert.deepEqual(f.probe.beforeReady.filter((s) => s.report !== null), [], 'a report before app ready')
  })
  caseTest(sdk, 'PLAT-UC-04', 'A1', 'ST none → report: a report exists from app ready on, and its first value is not earlier than app ready', async () => {
    const f = await native()
    const first = f.history1.find((h) => h.report !== null)
    assert.ok(first, 'no report in the first boot')
    assert.ok(f.readyAt1 !== null && first.at >= f.readyAt1, show({ first, readyAt: f.readyAt1 }))
  })

  // ---------------------------------------------------------------- PLAT-DT-04 rule 3a
  caseTest(sdk, 'PLAT-DT-04', '3a', 'standalone, HMR on, core first: core moves itself last in dsh.profile.bundles at its first start', async () => {
    const f = await native()
    assert.equal(f.bundles1.at(-1), CORE, show(f.bundles1))
    assert.equal(f.bundles1.filter((b) => b === CORE).length, 1)
  })
  caseTest(sdk, 'PLAT-DT-04', '3a', 'the other bundles keep their relative order (only core moves)', async () => {
    const f = await native()
    assert.equal(f.bundles1.at(-1), CORE, 'precondition: core moved')
    const others = f.bundles1.filter((b) => b !== CORE)
    const installed = [FIXTURE.probe.name, INSTANCE, FIXTURE.other]
    assert.deepEqual(others.filter((b) => installed.includes(b)), installed)
  })
  caseTest(sdk, 'PLAT-DT-04', '3a', 'DSH recomposes live: dsh-instance (already started once) is then off, in the same process', async () => {
    const f = await native()
    assert.equal(f.rows1.find((r) => r.id === INSTANCE)?.disabled, true, show(f.rows1))
  })
  caseTest(sdk, 'PLAT-DT-04', '3a', 'report: guards-overridden naming the instance (or bundle-order) until the recompose, then ok', async () => {
    const f = await native()
    const reports = f.history1.map((h) => h.report).filter(Boolean)
    const firstOk = reports.findIndex(isOk)
    assert.ok(reports.slice(0, firstOk < 0 ? reports.length : firstOk).some(namesOrder), 'never named the order before ok: ' + show(reports))
    assert.ok(isOk(f.settled1), 'not ok after the recompose: ' + show(f.settled1))
  })

  // ---------------------------------------------------------------- PLAT-DT-04 rule 3c
  caseTest(sdk, 'PLAT-DT-04', '3c', 'a later start that finds core last writes nothing (manifest unchanged)', async () => {
    const f = await native()
    assert.equal(f.bundles1.at(-1), CORE, 'precondition: core was moved last at its first start')
    assert.equal(f.manifest2.text, f.manifest1.text)
    assert.equal(f.manifest2.mtimeMs, f.manifest1.mtimeMs)
  })
  caseTest(sdk, 'PLAT-DT-04', '3c', 'the later start: dsh-instance never starts, and the report is ok at app ready', async () => {
    const f = await native()
    assert.deepEqual(f.starts2.filter((s) => s.row === INSTANCE), [], 'the instance started in the second process')
    assert.ok(isOk(f.report2), show(f.report2))
  })

  // ---------------------------------------------------------------- PLAT-DT-04 rule 4
  caseTest(sdk, 'PLAT-DT-04', 4, 'the owner moves core first again: core does not move it back (live, and at the next start)', async () => {
    const f = await native()
    assert.equal(f.bundles1.at(-1), CORE, 'precondition: core moved itself last once')
    assert.equal(f.bundles2b[0], CORE, show(f.bundles2b))
    assert.equal(f.bundles3[0], CORE, show(f.bundles3))
  })
  caseTest(sdk, 'PLAT-DT-04', 4, 'report: guards-overridden naming the guards that no longer apply', async () => {
    const f = await native()
    assert.ok(namesOrder(f.report2b), 'live: ' + show(f.report2b))
    assert.ok(namesOrder(f.report3), 'next start: ' + show(f.report3))
  })

  // ---------------------------------------------------------------- PLAT-UC-04 A1 × guard class (decision table, EP over OverriddenGuard)
  const overrideCases = [
    ['row', 'a UI-only guarded row (fishball-ui\'s) switched back on through DSH\'s native Plugins switch'],
    ['coreRow', 'a guarded row of core\'s own switched back on through DSH\'s native Plugins switch'],
    ['sandbox', 'a wider sandbox default in the owner\'s profile patch'],
    ['approval', 'another approval policy in the owner\'s profile patch (read from ctx.approval.config.policy)'],
    ['preset', 'a DSH-shipped agent preset switched back on'],
  ]
  for (const [key, title] of overrideCases) {
    caseTest(sdk, 'PLAT-UC-04', 'A1', `override ${key}: ${title} → guards-overridden naming it; core keeps running`, async () => {
      const f = await native()
      const o = f.override[key]
      assert.equal(o.set?.status, REPORT.overridden, show(o.set))
      assert.ok(o.set.overridden.includes(o.guard), `${o.guard} not named: ${show(o.set)}`)
    })
    caseTest(sdk, 'PLAT-UC-04', 'A1', `override ${key}: restoring it clears the report at the next check (ok)`, async () => {
      const f = await native()
      assert.ok(isOk(f.override[key].cleared), show(f.override[key].cleared))
    })
  }
  caseTest(sdk, 'PLAT-UC-04', 'A1', "a shipped preset switched back on is also reported as agent-presets (a preset other than core's is offered)", async () => {
    const f = await native()
    const o = f.override.preset
    assert.ok(o.set?.overridden?.includes(o.offered), show(o.set))
    assert.ok(o.presetsAfter.ids.includes(OWNER.presetIdOf(GUARDS.shippedPresets[0])), 'the owner\'s preset is offered: ' + show(o.presetsAfter))
  })
  caseTest(sdk, 'PLAT-UC-04', 'E1', 'nothing re-applies an overridden guard: the row stays on and the policy stays the owner\'s while overridden', async () => {
    const f = await native()
    assert.equal(f.override.row.set?.status, REPORT.overridden, 'precondition: the override was detected')
    assert.equal(f.override.row.rowAfter.disabled, false, show(f.override.row.rowAfter))
    assert.equal(f.override.sandbox.policyAfter.sandbox, OWNER.widerMode)
    assert.equal(f.override.approval.policyAfter.approval, OWNER.approval)
  })
  caseTest(sdk, 'PLAT-UC-04', 'A1', 'core keeps running through every override (the page answers)', async () => {
    const f = await native()
    assert.equal(f.override.row.set?.status, REPORT.overridden, 'precondition: the override was detected')
    assert.ok(f.alive1 < 400, 'page status ' + f.alive1)
  })
  caseTest(sdk, 'PLAT-UC-04', 'A1', 'one line on the page\'s status strip and one notice to Fishball per override', null, LATER.page + '; ' + LATER.wire)
  // Its own home: switching core off ends this DSH's Fishball.
  // F-UI: core's own guards go with core at once; fishball-ui's UI rows follow the bundles the
  // process STARTED with (interface item 2), so they are on again from the next start.
  const coreOff = scenario('v3-fg-core-off', sdk, [async (boot, f) => {
    const h = await boot(bootEnv({ members: [INSTANCE, CORE, UI] }))
    f.before = await h.call('rows', { ids: [INSTANCE] })
    await h.call('setBundleEnabled', { name: CORE, enabled: false })
    await until(async () => (await h.call('rows', { ids: [SPLIT.coreRows[0]] }))[0].disabled === false, BUDGET.recomposeMs, BUDGET.pollMs)
    f.rows = await h.call('rows', { ids: [...SPLIT.coreRows, ...GUARDS.shippedPresets] })
    f.policy = await h.call('policy')
  }, async (boot, f) => {
    const h = await boot(bootEnv())
    f.rowsNext = await h.call('rows', { ids: [...ALL_GUARD_ROWS] })
    f.policyNext = await h.call('policy')
  }])
  caseTest(sdk, 'PLAT-UC-04', 'A2', "the owner disables fishball-core: core's guards are off at once (live)", async () => {
    const f = await coreOff()
    needGuardsHeld(f.before)
    assert.deepEqual(f.rows.filter((r) => r.present && r.disabled).map((r) => r.id), [], "core's guard rows still off")
    assert.notEqual(f.policy.sandbox, GUARDS.policy.sandbox, 'the read-only sandbox is still applied')
  })
  caseTest(sdk, 'PLAT-UC-04', 'A2', 'the owner disables fishball-core: from the next start every guard row is on again, the UI rows included', async () => {
    const f = await coreOff()
    needGuardsHeld(f.before)
    assert.deepEqual(f.rowsNext.filter((r) => r.present && r.disabled).map((r) => r.id), [], 'guard rows still off at the next start')
    assert.notEqual(f.policyNext.sandbox, GUARDS.policy.sandbox)
  })

  // ---------------------------------------------------------------- UIM-DT-01 rows 9 and 14
  caseTest(sdk, 'UIM-DT-01', 9, 'F (standalone): its own UI is the page, guards as hosted (rows off, read-only, report ok)', async () => {
    const f = await native()
    assert.ok(f.graph1.includes(CORE), 'core serves no client entry')
    assert.ok(f.graph1.includes(UI), 'fishball-ui serves no client entry (its page is the standalone UI, F-UI)')
    assert.ok(isOk(f.settled1), show(f.settled1))
    assert.equal(f.policy1.sandbox, GUARDS.policy.sandbox)
  })
  caseTest(sdk, 'UIM-DT-01', 9, 'F → elsewhere with a manual token', null, LATER.link)
  caseTest(sdk, 'UIM-DT-01', 14, 'any F with a guard overridden: Fishball keeps running with guards-overridden naming the guard', async () => {
    const f = await native()
    assert.equal(f.override.row.set?.status, REPORT.overridden)
    assert.ok(f.override.row.set.overridden.includes(f.override.row.guard))
    assert.ok(f.alive1 < 400)
  })
  caseTest(sdk, 'UIM-DT-01', 'all rows', 'R-ARCH-02: no other plugin is refused, hidden or disabled because core is present (the deselected stand-in only by its owner)', async () => {
    const f = await native()
    needGuardsHeld(f.rows1)
    const other = f.bundleList1.find((b) => b.name === FIXTURE.other)
    assert.equal(other?.enabled, true, show(other))
  })

  // ============================================================================================
  // Scenario NOHMR (PLAT-DT-04 rule 3b; UIM-DT-01 row 10b): core first, HMR off.
  // ============================================================================================
  const nohmr = scenario('v3-fg-nohmr', sdk, [
    async (boot, f) => {
      const h = await boot(bootEnv({ members: [CORE, UI, INSTANCE], hmr: false }))
      f.pid1 = h.pid
      f.bundles1 = await h.call('bundles')
      await new Promise((resolve) => setTimeout(resolve, BUDGET.settleMs))
      f.rows1 = await h.call('rows', { ids: [INSTANCE] })
      f.report1 = await h.call('report')
      f.starts1 = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
      f.manifest1 = await h.call('manifestStat')
    },
    async (boot, f) => {
      const h = await boot(bootEnv({ hmr: false }))
      f.report2 = await waitReport(h, (r) => r !== null, BUDGET.readyMs)
      f.rows2 = await h.call('rows', { ids: [INSTANCE] })
      f.starts2 = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
      f.manifest2 = await h.call('manifestStat')
    },
  ])
  caseTest(sdk, 'PLAT-DT-04', '3b', 'standalone, HMR off, core first: core moves itself last at its first start', async () => {
    const f = await nohmr()
    assert.equal(f.bundles1.at(-1), CORE, show(f.bundles1))
  })
  caseTest(sdk, 'PLAT-DT-04', '3b', 'the instance stays on until the next start; the report names it (or bundle-order) until then', async () => {
    const f = await nohmr()
    assert.equal(f.rows1[0].disabled, false, show(f.rows1))
    assert.ok(namesOrder(f.report1), show(f.report1))
  })
  caseTest(sdk, 'PLAT-DT-04', '3b', 'from the next start the instance is never started and the report is ok', async () => {
    const f = await nohmr()
    assert.equal(f.rows2[0].disabled, true, show(f.rows2))
    assert.deepEqual(f.starts2.filter((s) => s.row === INSTANCE), [])
    assert.ok(isOk(f.report2), show(f.report2))
  })
  caseTest(sdk, 'PLAT-DT-04', '3c', 'HMR off: the next start writes nothing', async () => {
    const f = await nohmr()
    assert.equal(f.bundles1.at(-1), CORE, 'precondition: core was moved last at its first start')
    assert.equal(f.manifest2.text, f.manifest1.text)
  })
  caseTest(sdk, 'UIM-DT-01', '10b', 'F + I: after one restart dsh-instance is off and core is last; no nested child (the instance never ran in the restarted DSH)', async () => {
    const f = await nohmr()
    assert.equal(f.bundles1.at(-1), CORE)
    assert.equal(f.rows2[0].disabled, true)
    assert.deepEqual(f.starts2, [])
  })
  caseTest(sdk, 'UIM-DT-01', '10b', 'F + I with the real dsh-instance package (no nested child DSH process)', null, LATER.matrix)

  // ============================================================================================
  // Scenario LAST (PLAT-DT-04 rules 2, 5, 6; HOST-UC-08 A3; R-FB-13 mismatch): core installed after
  // every guarded bundle, then a guarded bundle installed after core's first start.
  // ============================================================================================
  const last = scenario('v3-fg-last', sdk, [
    async (boot, f) => {
      const h = await boot(bootEnv({ members: [FIXTURE.other, UI, CORE], deselected: [FIXTURE.deselected] }))
      f.home = h.home
      f.bundles0 = JSON.parse(fs.readFileSync(path.join(h.home, 'profiles', PROFILE, 'package.json'), 'utf8')).dsh.profile.bundles
      f.report1 = await waitReport(h, (r) => r !== null, BUDGET.readyMs)
      await new Promise((resolve) => setTimeout(resolve, BUDGET.settleMs))
      f.history1 = await h.call('history')
      f.bundles1 = await h.call('bundles')
      f.settings = await settingsFacts(sdk, h)
      f.graph = await graphIds(h)
      f.deps1 = await h.call('dependencies')
      f.manager = await h.call('newSession')
    },
    async (boot, f) => {
      // Rule 5: a guarded bundle installed after core's first start (appended after core).
      const h = await boot(bootEnv({ add: [INSTANCE] }))
      f.report2 = await waitReport(h, (r) => r !== null, BUDGET.readyMs)
      await new Promise((resolve) => setTimeout(resolve, BUDGET.settleMs))
      f.report2 = await h.call('report')
      f.bundles2 = await h.call('bundles')
    },
    async (boot, f) => {
      // R-FB-13 mismatch: while DSH is down the owner gives the Fishball preset writing file tools.
      const presetRow = OWNER.presetRowOf(GUARDS.policy.defaultAgentPreset)
      fs.writeFileSync(profilePatchFile(f.home), JSON.stringify([{ id: presetRow, config: { id: GUARDS.policy.defaultAgentPreset, plugins: [DSH_ROW.fileTools(OWNER.writableFiles)] } }]))
      const h = await boot(bootEnv())
      f.resumed3 = await h.call('resumeSession', { sessionId: f.manager.sessionId })
      f.report3 = await waitReport(h, (r) => r?.overridden?.includes(REPORT.managerTools), BUDGET.observeMs)
    },
  ])
  caseTest(sdk, 'PLAT-DT-04', 2, 'standalone, core already after every guarded bundle: nothing moved', async () => {
    const f = await last()
    needReports(f.history1)
    assert.deepEqual(f.bundles1, f.bundles0)
  })
  caseTest(sdk, 'PLAT-DT-04', 2, 'report ok from app ready, never guards-overridden in that start (no restart needed)', async () => {
    const f = await last()
    assert.ok(isOk(f.report1), show(f.report1))
    assert.deepEqual(f.history1.map((h) => h.report).filter((r) => r && !isOk(r)), [])
  })
  caseTest(sdk, 'PLAT-DT-04', 5, 'a guarded bundle installed after core\'s first start: core is not moved', async () => {
    const f = await last()
    needReports(f.history1)
    assert.equal(f.bundles2.at(-1), INSTANCE, show(f.bundles2))
  })
  caseTest(sdk, 'PLAT-DT-04', 5, "report: guards-overridden for that bundle's guarded rows", async () => {
    const f = await last()
    assert.ok(namesOrder(f.report2), show(f.report2))
  })
  caseTest(sdk, 'PLAT-DT-04', 6, "core never changes another bundle's own on/off state (an installed, deselected bundle stays deselected)", async () => {
    const f = await last()
    assert.ok(f.deps1.includes(FIXTURE.deselected), 'precondition: installed')
    needReports(f.history1)
    assert.equal(f.bundles1.includes(FIXTURE.deselected), false, show(f.bundles1))
    assert.equal(f.bundles2.includes(FIXTURE.deselected), false, show(f.bundles2))
    assert.ok(f.bundles2.includes(FIXTURE.other))
  })
  caseTest(sdk, 'PLAT-UC-04', 'A1', 'R-FB-13: a resumed manager whose tools are not exactly the manager tools is reported as manager-tools', async () => {
    const f = await last()
    assert.ok(f.resumed3.resumed, show(f.resumed3))
    assert.notDeepEqual([...f.resumed3.tools].sort(), [...GUARDS.managerTools].sort(), 'precondition: the owner changed the tools')
    assert.ok(f.report3?.overridden?.includes(REPORT.managerTools), show(f.report3))
  })
  withdrawnCase(sdk, 'HOST-UC-08', 'A3', 'standalone: the same core package shows the generic settings only (Read Only line, DSH links, no hosted section, no error)')
  // Re-pointed: the slim panel is removed (1.34 item 4); a standalone core page carries none of it and nothing fails.
  caseTest(sdk, 'HOST-UC-08', 'A3', 'standalone: no slim settings panel entry remains, and no Fishball plugin fails', async () => {
    const f = await last()
    assert.equal(f.settings.mainKeys.includes(SETTINGS_DSH.removedPanelKey), false, show(f.settings))
    assert.deepEqual(f.settings.failed, [])
  })

  // ============================================================================================
  // Scenario HOSTED-SHAPED (PLAT-DT-04 rule 1): the profile a hosted child gets (the instance, the
  // other bundles, then core last), HMR off, built here by the test.
  // ============================================================================================
  const shaped = scenario('v3-fg-shaped', sdk, [
    async (boot, f) => {
      const h = await boot(bootEnv({ members: [INSTANCE, FIXTURE.other, UI, CORE], hmr: false }))
      f.report = await waitReport(h, (r) => r !== null, BUDGET.readyMs)
      await new Promise((resolve) => setTimeout(resolve, BUDGET.settleMs))
      f.history = await h.call('history')
      f.rows = await h.call('rows', { ids: [INSTANCE] })
      f.starts = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
      f.bundles = await h.call('bundles')
    },
  ])
  caseTest(sdk, 'PLAT-DT-04', 1, 'core last, HMR off: guards apply from the first start; dsh-instance never started; report ok', async () => {
    const f = await shaped()
    assert.equal(f.rows.find((r) => r.id === INSTANCE)?.disabled, true)
    assert.deepEqual(f.starts.filter((s) => s.row === INSTANCE), [])
    assert.ok(isOk(f.report), show(f.report))
    assert.equal(f.bundles.at(-1), CORE)
  })

  // ============================================================================================
  // Scenario PRESET (PLAT-UC-04 A1, EP over the offered presets): core last, plus a bundle that
  // offers one more agent preset. K3 FishballAgentPreset is core's preset alone (design §7), so any
  // other offered preset is an `agent-presets` override, reported from app ready on.
  // ============================================================================================
  const preset = scenario('v3-fg-preset', sdk, [
    async (boot, f) => {
      const h = await boot(bootEnv({ members: [FIXTURE.extraPreset.name, UI, CORE] }))
      f.report = await waitReport(h, (r) => r?.status === REPORT.overridden, BUDGET.readyMs)
      f.presets = await h.call('presets')
      f.bundles = await h.call('bundles')
    },
  ])
  caseTest(sdk, 'PLAT-UC-04', 'A1', "one more agent preset offered beside core's: guards-overridden naming agent-presets only", async () => {
    const f = await preset()
    assert.equal(f.bundles.at(-1), CORE, 'precondition: core last, so no row guard applies late: ' + show(f.bundles))
    assert.ok(f.presets.ids.includes(FIXTURE.extraPreset.id), 'precondition: the extra preset is offered: ' + show(f.presets))
    assert.equal(f.report?.status, REPORT.overridden, show(f.report))
    assert.deepEqual([...f.report.overridden], [REPORT.agentPresets], show(f.report))
  })
  caseTest(sdk, 'PLAT-UC-04', 'A1', "one more agent preset offered: the default stays core's preset", async () => {
    const f = await preset()
    assert.equal(f.presets.defaultId, GUARDS.policy.defaultAgentPreset, show(f.presets))
  })
}
