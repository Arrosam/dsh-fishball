/**
 * Standalone DSH composition and one-time self-reorder (PLAT-DT-04, PLAT-UC-04, UIM-DT-01).
 * Requirements R-FB-02, R-FB-09, R-FB-12, R-FB-13, R-ARCH-02; design §5a.2.
 * DT: HMR on/off and initial bundle order; ST: first start, restart, owner move, late install.
 * EP: owner row/policy/preset overrides, and new/resumed controller sessions.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { WORLD, scenario } from 'fishball-test-helpers/dsh-world'
import { until } from 'fishball-test-helpers/wait'
import { NAMES, NATIVE_MANAGER_TOOLS } from '../support/names.mjs'
import { EXTENSION, corePackages } from '../support/world.mjs'
import { FIXTURE, G, GUARDS, OWNER } from './constants.mjs'

const show = (v) => JSON.stringify(v)
const CORE = NAMES.core
const ALL_GUARD_ROWS = Object.freeze([...GUARDS.rows, ...GUARDS.shippedPresets])
// These sessions are created by the DSH controller, not by Fishball, even on the same preset.
const CONTROLLER_TOOLS = Object.freeze([...NATIVE_MANAGER_TOOLS, 'ask_user_question'].sort())
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures')
const fixture = (name, selected = true) => ({ dir: path.join(FIXTURES, name), name, selected })
/** The packages of one first boot: the stand-ins and core, in install order (`order` names them). */
const install = (order, deselected = []) => [
  { ...corePackages()[0] },
  ...order.map((name) => (name === CORE ? corePackages().at(-1) : fixture(name))),
  ...deselected.map((name) => fixture(name, false)),
]
// Reorder starts asynchronously. Its durable record follows the manifest decision, even if no move is needed.
async function waitReorder(h) {
  const { directory, suffix } = G.reorderRecord
  const file = path.join(h.home, ...directory, WORLD.profile + suffix)
  return waitForChange(() => fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')), Boolean, 'no reorder record: ' + file)
}

async function waitForChange(read, matches, description) {
  const value = await until(async () => { const actual = await read(); return matches(actual) && actual }, G.recomposeMs, G.pollMs)
  assert.ok(value, description)
  return value
}

const waitRow = (h, id, disabled) => waitForChange(
  async () => (await h.call('rows', { ids: [id] }))[0],
  (row) => row.present && row.disabled === disabled,
  `row ${id} did not become ${disabled ? 'disabled' : 'enabled'}`,
)

const needGuardsHeld = (rows) => assert.equal(rows.find((r) => r.id === FIXTURE.instance)?.disabled, true, "precondition: core's guards hold (dsh-instance off): " + show(rows))

export function registerGuardCases() {
  const t = (id, row, title, fn) => caseTest(id, row, title, { timeout: G.caseMs }, fn)
  const reader = (source) => async () => { const f = await source(); if (f.error) throw f.error; return f }

  // ================================================================ NATIVE: core installed FIRST (DSH's native order), HMR on
  const native = reader(scenario(G.home.native, [
    async (boot, f) => {
      const h = await boot({ packages: install([CORE, FIXTURE.instance, FIXTURE.other]) })
      f.reorder1 = await waitReorder(h)
      await waitRow(h, FIXTURE.instance, true)
      f.bundles1 = await h.call('bundles')
      f.manifest1 = await h.call('manifestStat')
      f.rows1 = await h.call('rows', { ids: [...ALL_GUARD_ROWS] })
      f.presets1 = await h.call('presets')
      f.policy1 = await h.call('policy')
      f.bundleList1 = await h.call('bundleList')
      f.manager = await h.call('newSession')
      f.override = { rows: {}, policies: {} }
      for (const id of [GUARDS.uiRow, GUARDS.coreRow, GUARDS.shippedPresets[0]]) {
        await h.call('setRowEnabled', { id, enabled: true })
        const row = await waitRow(h, id, false)
        f.override.rows[id] = { row, presets: await h.call('presets'), alive: (await h.request('/')).status }
        await h.call('setRowEnabled', { id, enabled: false })
        await waitRow(h, id, true)
      }
      for (const [key, value, text] of [['sandbox', OWNER.widerMode, OWNER.sandboxOverride], ['approval', OWNER.approval, OWNER.approvalOverride]]) {
        await h.call('writeProfilePatch', { text })
        const read = () => h.call('policy')
        const policy = await waitForChange(read, (p) => p[key] === value, 'owner policy did not take effect: ' + key)
        f.override.policies[key] = { policy, alive: (await h.request('/')).status }
        await h.call('writeProfilePatch', { text: OWNER.emptyPatch })
        await waitForChange(read, (p) => p[key] === GUARDS.policy[key], 'default policy was not restored: ' + key)
      }
    },
    async (boot, f) => {
      const h = await boot()
      f.manifest2 = await h.call('manifestStat')
      f.starts2 = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
      f.resumed = await h.call('resumeSession', { sessionId: f.manager.sessionId })
      await h.call('moveBundle', { name: CORE, index: 0 })
      f.bundles2b = await h.call('bundles')
    },
    async (boot, f) => {
      const h = await boot()
      await waitReorder(h)
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
  t('PLAT-UC-04', 'main', 'the controller session resumes in a new process with the same native tools, read-only', async () => {
    const f = await native()
    assert.ok(f.resumed.resumed, show(f.resumed))
    assert.deepEqual([...f.resumed.tools].sort(), CONTROLLER_TOOLS)
    assert.equal(f.resumed.sandbox, GUARDS.policy.sandbox)
    assert.equal(f.resumed.permission, GUARDS.policy.defaultPermissionPreset)
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
  t('PLAT-DT-04', '3a', 'standalone, HMR on, core first: core moves itself last in dsh.profile.bundles at its first start; the others keep their order', async () => {
    const f = await native()
    assert.equal(f.reorder1.outcome, G.reorderRecord.moved)
    assert.equal(f.bundles1.at(-1), CORE, show(f.bundles1))
    assert.equal(f.bundles1.filter((b) => b === CORE).length, 1)
    const installed = [FIXTURE.instance, FIXTURE.other]
    assert.deepEqual(f.bundles1.filter((b) => installed.includes(b)), installed)
  })
  t('PLAT-DT-04', '3a', 'DSH recomposes live: dsh-instance is off in the same process', async () => {
    const f = await native()
    assert.equal(f.rows1.find((r) => r.id === FIXTURE.instance)?.disabled, true)
  })
  t('PLAT-DT-04', '3c', 'a later start that finds core last writes nothing (manifest unchanged); dsh-instance never starts', async () => {
    const f = await native()
    assert.equal(f.manifest2.text, f.manifest1.text)
    assert.equal(f.manifest2.mtimeMs, f.manifest1.mtimeMs)
    assert.deepEqual(f.starts2.filter((s) => s.row === FIXTURE.instance), [])
  })
  t('PLAT-DT-04', 4, 'the owner moves core first again: core does not move it back (live and at the next start)', async () => {
    const f = await native()
    assert.equal(f.bundles2b[0], CORE, show(f.bundles2b))
    assert.equal(f.bundles3[0], CORE, show(f.bundles3))
  })
  t('PLAT-UC-04', 'A1', "a shipped preset switched on is offered alongside core's", async () => {
    const { rows } = (await native()).override
    const id = GUARDS.shippedPresets[0]
    assert.ok(rows[id].presets.ids.includes(OWNER.presetIdOf(id)), show(rows[id].presets))
  })
  t('PLAT-UC-04', 'E1', "owner row and policy overrides take effect and the page keeps responding", async () => {
    const { rows, policies } = (await native()).override
    for (const { row, alive } of Object.values(rows)) {
      assert.equal(row.disabled, false, show(row))
      assert.ok(alive < G.pageOk)
    }
    assert.equal(policies.sandbox.policy.sandbox, OWNER.widerMode)
    assert.equal(policies.approval.policy.approval, OWNER.approval)
    for (const { alive } of Object.values(policies)) assert.ok(alive < G.pageOk)
  })
  t('UIM-DT-01', 9, 'F (standalone): its own UI is the page, guards as hosted (rows off, read-only)', async () => {
    const f = await native()
    needGuardsHeld(f.rows1)
    assert.equal(f.policy1.sandbox, GUARDS.policy.sandbox)
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
    await waitRow(h, GUARDS.coreRow, false)
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
      f.reorder1 = await waitReorder(h)
      f.bundles1 = await h.call('bundles')
      f.rows1 = await h.call('rows', { ids: [FIXTURE.instance] })
      f.manifest1 = await h.call('manifestStat')
    },
    async (boot, f) => {
      const h = await boot({ overlay: [{ id: FIXTURE.hmrRow, disabled: true }] })
      f.rows2 = await h.call('rows', { ids: [FIXTURE.instance] })
      f.starts2 = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
      f.manifest2 = await h.call('manifestStat')
    },
  ], { extension: EXTENSION }))
  t('PLAT-DT-04', '3b', 'standalone, HMR off, core first: core moves itself last; the instance stays on until the next start', async () => {
    const f = await nohmr()
    assert.equal(f.reorder1.outcome, G.reorderRecord.moved)
    assert.equal(f.bundles1.at(-1), CORE, show(f.bundles1))
    assert.equal(f.rows1[0].disabled, false, show(f.rows1))
  })
  t('PLAT-DT-04', '3b', 'from the next start the instance is never started; HMR off: that start writes nothing', async () => {
    const f = await nohmr()
    assert.equal(f.rows2[0].disabled, true, show(f.rows2))
    assert.deepEqual(f.starts2.filter((s) => s.row === FIXTURE.instance), [])
    assert.equal(f.manifest2.text, f.manifest1.text)
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
      f.firstReorder = await waitReorder(h)
      f.bundles1 = await h.call('bundles')
      f.deps1 = await h.call('dependencies')
      f.manager = await h.call('newSession')
    },
    async (boot, f) => {
      // Rule 5: a guarded bundle installed after core's first start (appended after core).
      const h = await boot({ packages: [fixture(FIXTURE.instance)] })
      await waitReorder(h)
      f.bundles2 = await h.call('bundles')
    },
    async (boot, f) => {
      // R-FB-13: while DSH is down the owner gives the Fishball preset writing file tools.
      fs.writeFileSync(path.join(f.home, G.profilesDir, WORLD.profile, G.profilePatch), JSON.stringify([{ id: OWNER.presetRowOf(GUARDS.policy.defaultAgentPreset), config: { id: GUARDS.policy.defaultAgentPreset, plugins: [OWNER.fileTools(OWNER.writableFiles)] } }]))
      const h = await boot()
      f.resumed3 = await h.call('resumeSession', { sessionId: f.manager.sessionId })
    },
  ], { extension: EXTENSION }))
  t('PLAT-DT-04', 2, 'standalone, core already after every guarded bundle: nothing moved', async () => {
    const f = await last()
    assert.equal(f.firstReorder.outcome, G.reorderRecord.unchanged)
    assert.deepEqual(f.bundles1.filter((name) => [FIXTURE.other, CORE].includes(name)), [FIXTURE.other, CORE])
  })
  t('PLAT-DT-04', 5, "a guarded bundle installed after core's first start: core is not moved", async () => {
    const f = await last()
    assert.equal(f.bundles2.at(-1), FIXTURE.instance, show(f.bundles2))
  })
  t('PLAT-DT-04', 6, "core never changes another bundle's own on/off state (an installed, deselected bundle stays deselected)", async () => {
    const f = await last()
    assert.ok(f.deps1.includes(FIXTURE.deselected), 'precondition: installed')
    assert.equal(f.bundles1.includes(FIXTURE.deselected), false, show(f.bundles1))
    assert.equal(f.bundles2.includes(FIXTURE.deselected), false, show(f.bundles2))
    assert.ok(f.bundles2.includes(FIXTURE.other))
  })
  t('PLAT-UC-04', 'A1', "R-FB-13: a resumed controller session on the Fishball preset uses the owner's changed toolset", async () => {
    const f = await last()
    assert.ok(f.resumed3.resumed && f.resumed3.answered, show(f.resumed3))
    for (const tool of OWNER.writableToolNames) assert.ok(f.resumed3.tools.includes(tool), show(f.resumed3))
    assert.equal(f.resumed3.sandbox, GUARDS.policy.sandbox)
  })

  // ================================================================ SHAPED (PLAT-DT-04 rule 1): the hosted child's profile shape, HMR off
  const shaped = reader(scenario(G.home.shaped, [async (boot, f) => {
    const h = await boot({ packages: install([FIXTURE.instance, FIXTURE.other, CORE]), overlay: [{ id: FIXTURE.hmrRow, disabled: true }] })
    f.reorder = await waitReorder(h)
    f.rows = await h.call('rows', { ids: [FIXTURE.instance] })
    f.starts = (await h.call('standinStarts')).filter((s) => s.pid === h.pid)
    f.bundles = await h.call('bundles')
  }], { extension: EXTENSION }))
  t('PLAT-DT-04', 1, 'core last, HMR off: guards apply from the first start; dsh-instance never started', async () => {
    const f = await shaped()
    assert.equal(f.reorder.outcome, G.reorderRecord.unchanged)
    assert.equal(f.rows[0].disabled, true)
    assert.deepEqual(f.starts.filter((s) => s.row === FIXTURE.instance), [])
    assert.equal(f.bundles.at(-1), CORE)
  })

  // ================================================================ PRESET (PLAT-UC-04 A1, EP over the offered presets)
  const preset = reader(scenario(G.home.preset, [async (boot, f) => {
    const h = await boot({ packages: install([FIXTURE.extraPreset.name, CORE]) })
    await waitReorder(h)
    f.presets = await h.call('presets')
    f.bundles = await h.call('bundles')
  }], { extension: EXTENSION }))
  t('PLAT-UC-04', 'A1', "one more agent preset is offered beside core's; the default stays core's", async () => {
    const f = await preset()
    assert.equal(f.bundles.at(-1), CORE, show(f.bundles))
    assert.ok(f.presets.ids.includes(FIXTURE.extraPreset.id), show(f.presets))
    assert.equal(f.presets.defaultId, GUARDS.policy.defaultAgentPreset)
  })
}
