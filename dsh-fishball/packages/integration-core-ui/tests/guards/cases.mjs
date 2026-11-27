/**
 * Core's guards beside fishball-ui (old test/v3/fishball-ui/guards: PLAT-DT-04, PLAT-UC-04, UIM-DT-01 rows 9,
 * 10b, 14, all rows). Requirements R-FB-02, R-FB-09, R-FB-12, R-FB-13, R-ARCH-02; design §5a.2; K3 guards.d.ts.
 * A real standalone DSH (fishball-test-helpers/dsh-world) with core (and its ./ui/ component) and stand-in
 * bundles (tests/fixtures), booted once or more on one home per scenario.
 *
 * Techniques: UC (PLAT-UC-04 main, A1, A2, E1), DT (PLAT-DT-04 rules 1–6; UIM-DT-01; the override table A1 ×
 * guard class), ST (the report: none → report at app ready, set and cleared by each owner change), EP (the
 * classes of OverriddenGuard; the offered presets), BVA (the app-ready boundary).
 * Retired (mapping): rows whose subject is the instance repository's (the real dsh-instance, its launch
 * code), todos owned by F-WIRE / E2E-CORE / REL-PACK / X-MATRIX.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { WORLD, scenario } from 'fishball-test-helpers/dsh-world'
import { until } from 'fishball-test-helpers/wait'
import { NAMES } from '../support/names.mjs'
import { EXTENSION, corePackages } from '../support/world.mjs'
import { FIXTURE, G, GUARDS, OWNER, REPORT } from './constants.mjs'

const show = (v) => JSON.stringify(v)
const CORE = NAMES.core
const ALL_GUARD_ROWS = Object.freeze([...GUARDS.rows, ...GUARDS.shippedPresets])
// These sessions are created by the DSH controller, not by Fishball, even on the same preset.
const CONTROLLER_TOOLS = Object.freeze(['read', 'read_image', 'working_directory', 'ask_user_question'].sort())
const ORDER_NAMES = Object.freeze([REPORT.row(GUARDS.instanceRow), REPORT.bundleOrder])
const namesOrder = (r) => r?.status === REPORT.overridden && r.overridden.some((g) => ORDER_NAMES.includes(g))
const isOk = (r) => r?.status === REPORT.ok && r.overridden.length === 0
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures')
const fixture = (name, selected = true) => ({ dir: path.join(FIXTURES, name), name, selected })
/** The packages of one first boot: the stand-ins and core, in install order (`order` names them). */
const install = (order, deselected = []) => [
  { ...corePackages()[0] },
  ...order.map((name) => (name === CORE ? corePackages().at(-1) : fixture(name))),
  ...deselected.map((name) => fixture(name, false)),
]
async function waitReport(h, test, ms = G.recomposeMs) {
  let last
  await until(async () => { last = await h.call('report'); return test(last) }, ms, G.pollMs)
  return last
}
async function ownerChange(h, action, test) { await action(); return waitReport(h, test) }
const needGuardsHeld = (rows) => assert.equal(rows.find((r) => r.id === FIXTURE.instance)?.disabled, true, "precondition: core's guards hold (dsh-instance off): " + show(rows))
const needReports = (history) => assert.ok(history.some((h) => h.report !== null), 'precondition: core published a guard report')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function registerGuardCases() {
  const t = (id, row, title, fn) => caseTest(id, row, title, { timeout: G.caseMs }, fn)
  const reader = (source) => async () => { const f = await source(); if (f.error) throw f.error; return f }

  // ================================================================ NATIVE: core installed FIRST (DSH's native order), HMR on
  const native = reader(scenario(G.home.native, [
    async (boot, f) => {
      const h = await boot({ packages: install([FIXTURE.probe, CORE, FIXTURE.instance, FIXTURE.other]) })
      f.home = h.home
      f.readyAt1 = await h.call('readyAt')
      f.probe = await h.call('probe')
      await until(async () => (await h.call('rows', { ids: [FIXTURE.instance] }))[0].disabled === true, G.recomposeMs, G.pollMs)
      f.settled1 = await waitReport(h, isOk)
      f.history1 = await h.call('history')
      f.bundles1 = await h.call('bundles')
      f.manifest1 = await h.call('manifestStat')
      f.rows1 = await h.call('rows', { ids: [...ALL_GUARD_ROWS] })
      f.presets1 = await h.call('presets')
      f.policy1 = await h.call('policy')
      f.bundleList1 = await h.call('bundleList')
      f.manager = await h.call('newSession')
      f.override = {}
      const rows = { row: GUARDS.uiRow, coreRow: GUARDS.coreRow, preset: GUARDS.shippedPresets[0] }
      for (const [key, id] of Object.entries(rows)) {
        const guard = REPORT.row(id)
        f.override[key] = { guard }
        f.override[key].set = await ownerChange(h, () => h.call('setRowEnabled', { id, enabled: true }), (r) => r?.overridden?.includes(guard))
        if (key === 'row') f.override.row.rowAfter = (await h.call('rows', { ids: [id] }))[0]
        if (key === 'preset') f.override.preset.presetsAfter = await h.call('presets')
        f.override[key].cleared = await ownerChange(h, () => h.call('setRowEnabled', { id, enabled: false }), (r) => !r?.overridden?.includes(guard))
      }
      for (const [key, text, policyKey] of [['sandbox', OWNER.sandboxOverride, 'sandbox'], ['approval', OWNER.approvalOverride, 'approval']]) {
        const guard = REPORT.policy(policyKey)
        f.override[key] = { guard }
        f.override[key].set = await ownerChange(h, () => h.call('writeProfilePatch', { text }), (r) => r?.overridden?.includes(guard))
        f.override[key].policyAfter = await h.call('policy')
        f.override[key].cleared = await ownerChange(h, () => h.call('writeProfilePatch', { text: OWNER.emptyPatch }), (r) => !r?.overridden?.includes(guard))
      }
      f.alive1 = (await h.request('/')).status
    },
    async (boot, f) => {
      const h = await boot()
      f.pid2 = h.pid
      f.report2 = await waitReport(h, (r) => r !== null, G.readyMs)
      f.manifest2 = await h.call('manifestStat')
      f.starts2 = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
      f.resumed = await h.call('resumeSession', { sessionId: f.manager.sessionId })
      f.movedBack = await h.call('moveBundle', { name: CORE, index: 0 })
      f.report2b = await waitReport(h, (r) => namesOrder(r))
      f.bundles2b = await h.call('bundles')
    },
    async (boot, f) => {
      const h = await boot()
      f.report3 = await waitReport(h, (r) => namesOrder(r), G.readyMs)
      f.bundles3 = await h.call('bundles')
    },
  ], { extension: EXTENSION }))

  t('PLAT-UC-04', 'main', 'the guarded rows and the shipped preset rows are present and switched off (not deleted) once core holds', async () => {
    const f = await native()
    assert.deepEqual(f.rows1.filter((r) => r.present && !r.disabled).map((r) => r.id), [], 'enabled guard rows')
    assert.deepEqual(f.rows1.filter((r) => GUARDS.shippedPresets.includes(r.id) && !r.present).map((r) => r.id), [], 'a shipped preset row was deleted')
  })
  t('PLAT-UC-04', 'main', 'the effective policy is the intended one (sandbox, approval read directly, permission presets, defaults)', async () => {
    assert.deepEqual((await native()).policy1, { ...GUARDS.policy, permissionPresets: [...GUARDS.policy.permissionPresets] })
  })
  t('PLAT-UC-04', 'main', "agentPresets.list() offers exactly core's preset, the default", async () => {
    const f = await native()
    assert.deepEqual([...f.presets1.ids].sort(), [...GUARDS.offeredPresets].sort())
    assert.equal(f.presets1.defaultId, GUARDS.policy.defaultAgentPreset)
  })
  t('PLAT-UC-04', 'main', 'a new controller session on the Fishball preset retains the native question tool, read-only', async () => {
    const f = await native()
    assert.ok(f.manager.answered, 'the model was not called')
    assert.deepEqual([...f.manager.tools].sort(), CONTROLLER_TOOLS)
    assert.equal(f.manager.sandbox, GUARDS.policy.sandbox)
    assert.equal(f.manager.permission, GUARDS.policy.defaultPermissionPreset)
  })
  t('PLAT-UC-04', 'main', 'the controller session resumes in a new process with the same native tools, read-only; no manager-tools report', async () => {
    const f = await native()
    assert.ok(f.resumed.resumed, show(f.resumed))
    assert.deepEqual([...f.resumed.tools].sort(), CONTROLLER_TOOLS)
    assert.equal(f.resumed.sandbox, GUARDS.policy.sandbox)
    assert.equal(f.report2?.overridden?.includes(REPORT.managerTools), false, show(f.report2))
  })
  t('PLAT-UC-04', 'main', "the plugin list holds fishball-core once; fishball-ui is core's component row, not a bundle", async () => {
    const names = (await native()).bundleList1.map((b) => b.name)
    assert.equal(names.filter((n) => n === CORE).length, 1, show(names))
    assert.equal(names.includes(NAMES.ui), false, show(names))
  })
  t('PLAT-UC-04', 'post', 'no stand-in bundle file was changed by core (only DSH and the owner write)', async () => {
    const f = await native()
    needGuardsHeld(f.rows1)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(FIXTURES, FIXTURE.instance, 'cordis.patch.yml'), 'utf8')), [{ insert: [{ id: FIXTURE.instance, name: FIXTURE.instance, config: {} }] }])
  })
  t('PLAT-UC-04', 'A1', 'ST none → report: nothing is published before app ready (probe during boot)', async () => {
    const f = await native()
    assert.ok(f.probe, 'the probe row did not run')
    needReports(f.history1)
    assert.deepEqual(f.probe.beforeReady.filter((s) => s.report !== null), [], 'a report before app ready')
  })
  t('PLAT-UC-04', 'A1', 'ST none → report: a report exists from app ready on, its first value not earlier than app ready', async () => {
    const f = await native()
    const first = f.history1.find((h) => h.report !== null)
    assert.ok(first && f.readyAt1 !== null && first.at >= f.readyAt1, show({ first, readyAt: f.readyAt1 }))
  })
  t('PLAT-DT-04', '3a', 'standalone, HMR on, core first: core moves itself last in dsh.profile.bundles at its first start; the others keep their order', async () => {
    const f = await native()
    assert.equal(f.bundles1.at(-1), CORE, show(f.bundles1))
    assert.equal(f.bundles1.filter((b) => b === CORE).length, 1)
    const installed = [FIXTURE.probe, FIXTURE.instance, FIXTURE.other]
    assert.deepEqual(f.bundles1.filter((b) => installed.includes(b)), installed)
  })
  t('PLAT-DT-04', '3a', 'DSH recomposes live: dsh-instance (already started once) is then off, in the same process', async () => {
    assert.equal((await native()).rows1.find((r) => r.id === FIXTURE.instance)?.disabled, true)
  })
  t('PLAT-DT-04', '3a', 'report: names the instance (or bundle-order) until the recompose', async () => {
    const reports = (await native()).history1.map((h) => h.report).filter(Boolean)
    const firstOk = reports.findIndex(isOk)
    assert.ok(reports.slice(0, firstOk < 0 ? reports.length : firstOk).some(namesOrder), 'never named the order: ' + show(reports))
  })
  t('PLAT-DT-04', '3a ok', 'report: ok after the recompose', async () => {
    const f = await native()
    assert.ok(isOk(f.settled1), show(f.settled1))
  })
  t('PLAT-DT-04', '3c', 'a later start that finds core last writes nothing (manifest unchanged); dsh-instance never starts', async () => {
    const f = await native()
    assert.equal(f.manifest2.text, f.manifest1.text)
    assert.equal(f.manifest2.mtimeMs, f.manifest1.mtimeMs)
    assert.deepEqual(f.starts2.filter((s) => s.row === FIXTURE.instance), [])
  })
  t('PLAT-DT-04', '3c ok', 'the later start: the report is ok at app ready', async () => {
    const f = await native()
    assert.ok(isOk(f.report2), show(f.report2))
  })
  t('PLAT-DT-04', 4, 'the owner moves core first again: core does not move it back (live and at the next start); the report names the order', async () => {
    const f = await native()
    assert.equal(f.bundles2b[0], CORE, show(f.bundles2b))
    assert.equal(f.bundles3[0], CORE, show(f.bundles3))
    assert.ok(namesOrder(f.report2b), 'live: ' + show(f.report2b))
    assert.ok(namesOrder(f.report3), 'next start: ' + show(f.report3))
  })
  for (const [key, title] of [['row', "a UI-only guarded row (fishball-ui's) switched on through DSH's Plugins switch"], ['coreRow', "a guarded row of core's own switched on"], ['sandbox', "a wider sandbox default in the owner's profile patch"], ['approval', "another approval policy in the owner's profile patch"], ['preset', 'a DSH-shipped agent preset switched on']]) {
    t('PLAT-UC-04', 'A1', `override ${key}: ${title} → guards-overridden naming it; core keeps running`, async () => {
      const o = (await native()).override[key]
      assert.equal(o.set?.status, REPORT.overridden, show(o.set))
      assert.ok(o.set.overridden.includes(o.guard), show(o.set))
    })
    t('PLAT-UC-04', 'A1', `override ${key}: restoring it clears that guard at the next check`, async () => {
      const o = (await native()).override[key]
      assert.equal(o.cleared?.overridden?.includes(o.guard), false, show(o.cleared))
    })
  }
  t('PLAT-UC-04', 'A1', "a shipped preset switched on is also reported as agent-presets (a preset other than core's is offered)", async () => {
    const o = (await native()).override.preset
    assert.ok(o.set?.overridden?.includes(REPORT.agentPresets), show(o.set))
    assert.ok(o.presetsAfter.ids.includes(OWNER.presetIdOf(GUARDS.shippedPresets[0])), show(o.presetsAfter))
  })
  t('PLAT-UC-04', 'E1', "nothing re-applies an overridden guard: the row stays on and the policy stays the owner's while overridden", async () => {
    const o = (await native()).override
    assert.equal(o.row.rowAfter.disabled, false, show(o.row.rowAfter))
    assert.equal(o.sandbox.policyAfter.sandbox, OWNER.widerMode)
    assert.equal(o.approval.policyAfter.approval, OWNER.approval)
  })
  t('PLAT-UC-04', 'A1', 'core keeps running through every override (the page answers)', async () => {
    assert.ok((await native()).alive1 < G.pageOk)
  })
  t('UIM-DT-01', 9, 'F (standalone): its own UI is the page, guards as hosted (rows off, read-only)', async () => {
    const f = await native()
    needGuardsHeld(f.rows1)
    assert.equal(f.policy1.sandbox, GUARDS.policy.sandbox)
  })
  t('UIM-DT-01', 14, 'any F with a guard overridden: Fishball keeps running with guards-overridden naming the guard', async () => {
    const f = await native()
    assert.ok(f.override.row.set?.overridden?.includes(f.override.row.guard))
    assert.ok(f.alive1 < G.pageOk)
  })
  t('UIM-DT-01', 'all rows', 'R-ARCH-02: no other plugin is refused, hidden or disabled because core is present', async () => {
    const f = await native()
    needGuardsHeld(f.rows1)
    assert.equal(f.bundleList1.find((b) => b.name === FIXTURE.other)?.enabled, true, show(f.bundleList1))
  })

  // ================================================================ CORE-OFF (PLAT-UC-04 A2)
  const coreOff = reader(scenario(G.home.coreOff, [async (boot, f) => {
    const h = await boot({ packages: install([FIXTURE.instance, CORE]) })
    f.before = await h.call('rows', { ids: [FIXTURE.instance] })
    await h.call('setBundleEnabled', { name: CORE, enabled: false })
    await until(async () => (await h.call('rows', { ids: [GUARDS.coreRow] }))[0].disabled === false, G.recomposeMs, G.pollMs)
    f.rows = await h.call('rows', { ids: [GUARDS.coreRow, GUARDS.instanceRow, ...GUARDS.shippedPresets] })
    f.policy = await h.call('policy')
  }, async (boot, f) => {
    const h = await boot({ env: { [NAMES.coreOffEnv]: '1' } })
    f.rowsNext = await h.call('rows', { ids: [...ALL_GUARD_ROWS] })
    f.policyNext = await h.call('policy')
  }], { extension: EXTENSION }))
  t('PLAT-UC-04', 'A2', "the owner disables fishball-core: core's guards are off at once (live)", async () => {
    const f = await coreOff()
    needGuardsHeld(f.before)
    assert.deepEqual(f.rows.filter((r) => r.present && r.disabled).map((r) => r.id), [])
    assert.notEqual(f.policy.sandbox, GUARDS.policy.sandbox)
  })
  t('PLAT-UC-04', 'A2', 'the owner disables fishball-core: from the next start every guard row is on again, the UI rows included', async () => {
    const f = await coreOff()
    assert.deepEqual(f.rowsNext.filter((r) => r.present && r.disabled).map((r) => r.id), [])
    assert.notEqual(f.policyNext.sandbox, GUARDS.policy.sandbox)
  })

  // ================================================================ NOHMR (PLAT-DT-04 3b; UIM-DT-01 10b)
  const nohmr = reader(scenario(G.home.nohmr, [
    async (boot, f) => {
      const h = await boot({ packages: install([CORE, FIXTURE.instance]), overlay: [{ id: FIXTURE.hmrRow, disabled: true }] })
      f.bundles1 = await h.call('bundles')
      await sleep(G.settleMs)
      f.rows1 = await h.call('rows', { ids: [FIXTURE.instance] })
      f.report1 = await h.call('report')
      f.manifest1 = await h.call('manifestStat')
    },
    async (boot, f) => {
      const h = await boot({ overlay: [{ id: FIXTURE.hmrRow, disabled: true }] })
      f.report2 = await waitReport(h, (r) => r !== null, G.readyMs)
      f.rows2 = await h.call('rows', { ids: [FIXTURE.instance] })
      f.starts2 = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
      f.manifest2 = await h.call('manifestStat')
    },
  ], { extension: EXTENSION }))
  t('PLAT-DT-04', '3b', 'standalone, HMR off, core first: core moves itself last; the instance stays on until the next start and the report names it (or bundle-order)', async () => {
    const f = await nohmr()
    assert.equal(f.bundles1.at(-1), CORE, show(f.bundles1))
    assert.equal(f.rows1[0].disabled, false, show(f.rows1))
    assert.ok(namesOrder(f.report1), show(f.report1))
  })
  t('PLAT-DT-04', '3b', 'from the next start the instance is never started; HMR off: that start writes nothing', async () => {
    const f = await nohmr()
    assert.equal(f.rows2[0].disabled, true, show(f.rows2))
    assert.deepEqual(f.starts2.filter((s) => s.row === FIXTURE.instance), [])
    assert.equal(f.manifest2.text, f.manifest1.text)
  })
  t('PLAT-DT-04', '3b ok', 'from the next start the report is ok', async () => {
    const f = await nohmr()
    assert.ok(isOk(f.report2), show(f.report2))
  })
  t('UIM-DT-01', '10b', 'F + I: after one restart dsh-instance is off and core is last; the instance never ran in the restarted DSH', async () => {
    const f = await nohmr()
    assert.equal(f.bundles1.at(-1), CORE)
    assert.equal(f.rows2[0].disabled, true)
    assert.deepEqual(f.starts2, [])
  })

  // ================================================================ LAST (PLAT-DT-04 rules 2, 5, 6; R-FB-13 mismatch)
  const last = reader(scenario(G.home.last, [
    async (boot, f) => {
      const h = await boot({ packages: install([FIXTURE.other, CORE], [FIXTURE.deselected]) })
      f.home = h.home
      f.bundles0 = await h.call('bundles')
      f.report1 = await waitReport(h, (r) => r !== null, G.readyMs)
      await sleep(G.settleMs)
      f.history1 = await h.call('history')
      f.bundles1 = await h.call('bundles')
      f.deps1 = await h.call('dependencies')
      f.manager = await h.call('newSession')
    },
    async (boot, f) => {
      // Rule 5: a guarded bundle installed after core's first start (appended after core).
      const h = await boot({ packages: [fixture(FIXTURE.instance)] })
      await waitReport(h, (r) => r !== null, G.readyMs)
      await sleep(G.settleMs)
      f.report2 = await h.call('report')
      f.bundles2 = await h.call('bundles')
    },
    async (boot, f) => {
      // R-FB-13: while DSH is down the owner gives the Fishball preset writing file tools.
      fs.writeFileSync(path.join(f.home, G.profilesDir, WORLD.profile, G.profilePatch), JSON.stringify([{ id: OWNER.presetRowOf(GUARDS.policy.defaultAgentPreset), config: { id: GUARDS.policy.defaultAgentPreset, plugins: [OWNER.fileTools(OWNER.writableFiles)] } }]))
      const h = await boot()
      f.resumed3 = await h.call('resumeSession', { sessionId: f.manager.sessionId })
      f.report3 = await waitReport(h, (r) => r?.overridden?.includes(REPORT.managerTools), G.observeMs)
    },
  ], { extension: EXTENSION }))
  t('PLAT-DT-04', 2, 'standalone, core already after every guarded bundle: nothing moved', async () => {
    const f = await last()
    needReports(f.history1)
    assert.deepEqual(f.bundles1, f.bundles0)
  })
  t('PLAT-DT-04', 2, 'report ok from app ready, never guards-overridden in that start', async () => {
    const f = await last()
    assert.ok(isOk(f.report1), show(f.report1))
    assert.deepEqual(f.history1.map((h) => h.report).filter((r) => r && !isOk(r)), [])
  })
  t('PLAT-DT-04', 5, "a guarded bundle installed after core's first start: core is not moved; the report names that bundle's guarded rows", async () => {
    const f = await last()
    assert.equal(f.bundles2.at(-1), FIXTURE.instance, show(f.bundles2))
    assert.ok(namesOrder(f.report2), show(f.report2))
  })
  t('PLAT-DT-04', 6, "core never changes another bundle's own on/off state (an installed, deselected bundle stays deselected)", async () => {
    const f = await last()
    assert.ok(f.deps1.includes(FIXTURE.deselected), 'precondition: installed')
    assert.equal(f.bundles1.includes(FIXTURE.deselected), false, show(f.bundles1))
    assert.equal(f.bundles2.includes(FIXTURE.deselected), false, show(f.bundles2))
    assert.ok(f.bundles2.includes(FIXTURE.other))
  })
  t('PLAT-UC-04', 'A1', 'R-FB-13: a resumed controller session on the Fishball preset reports extra and missing tools after the owner changes its toolset', async () => {
    const f = await last()
    assert.ok(f.resumed3.resumed, show(f.resumed3))
    assert.notDeepEqual([...f.resumed3.tools].sort(), CONTROLLER_TOOLS, 'precondition: the owner changed the tools')
    assert.ok(f.report3?.overridden?.includes(REPORT.managerTools), show(f.report3))
    const extra = [...new Set(f.resumed3.tools)].filter((n) => !CONTROLLER_TOOLS.includes(n)).sort()
    assert.ok(extra.every((n) => f.report3.extraManagerTools.includes(n)), show({ extra, report: f.report3 }))
    assert.deepEqual(f.report3.missingManagerTools, CONTROLLER_TOOLS.filter((n) => !f.resumed3.tools.includes(n)))
  })
  t('PLAT-UC-04', 'main extras', 'an ok report on a default install carries extraManagerTools [] and missingManagerTools []', async () => {
    const f = await last()
    assert.ok(isOk(f.report1), show(f.report1))
    assert.deepEqual(f.report1.extraManagerTools, [])
    assert.deepEqual(f.report1.missingManagerTools, [])
  })

  // ================================================================ SHAPED (PLAT-DT-04 rule 1): the hosted child's profile shape, HMR off
  const shaped = reader(scenario(G.home.shaped, [async (boot, f) => {
    const h = await boot({ packages: install([FIXTURE.instance, FIXTURE.other, CORE]), overlay: [{ id: FIXTURE.hmrRow, disabled: true }] })
    f.report = await waitReport(h, (r) => r !== null, G.readyMs)
    await sleep(G.settleMs)
    f.rows = await h.call('rows', { ids: [FIXTURE.instance] })
    f.starts = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
    f.bundles = await h.call('bundles')
  }], { extension: EXTENSION }))
  t('PLAT-DT-04', 1, 'core last, HMR off: guards apply from the first start; dsh-instance never started', async () => {
    const f = await shaped()
    assert.equal(f.rows[0].disabled, true)
    assert.deepEqual(f.starts.filter((s) => s.row === FIXTURE.instance), [])
    assert.equal(f.bundles.at(-1), CORE)
  })
  t('PLAT-DT-04', '1 ok', 'core last, HMR off: report ok at app ready', async () => {
    const f = await shaped()
    assert.ok(isOk(f.report), show(f.report))
  })

  // ================================================================ PRESET (PLAT-UC-04 A1, EP over the offered presets)
  const preset = reader(scenario(G.home.preset, [async (boot, f) => {
    const h = await boot({ packages: install([FIXTURE.extraPreset.name, CORE]) })
    f.report = await waitReport(h, (r) => r?.overridden?.includes(REPORT.agentPresets), G.readyMs)
    f.presets = await h.call('presets')
    f.bundles = await h.call('bundles')
  }], { extension: EXTENSION }))
  t('PLAT-UC-04', 'A1', "one more agent preset offered beside core's: guards-overridden naming agent-presets; the default stays core's", async () => {
    const f = await preset()
    assert.equal(f.bundles.at(-1), CORE, show(f.bundles))
    assert.ok(f.presets.ids.includes(FIXTURE.extraPreset.id), show(f.presets))
    assert.ok(f.report?.overridden?.includes(REPORT.agentPresets), show(f.report))
    assert.equal(f.presets.defaultId, GUARDS.policy.defaultAgentPreset)
  })
  t('PLAT-UC-04', 'A1 only', "one more agent preset offered: agent-presets is the only guard named", async () => {
    const f = await preset()
    assert.deepEqual([...f.report.overridden], [REPORT.agentPresets], show(f.report))
  })
}
