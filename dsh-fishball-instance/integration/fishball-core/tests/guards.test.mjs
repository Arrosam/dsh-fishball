/**
 * The V2 guard cases in a hosted child (V3 rule, design §5a.2 and §6.2): the guards come from the
 * REAL fishball-core's own bundle patch, applied after the base bundles (core last, R-FB-12); the
 * launch overlay carries none (R-HOST-04; README "No guard row and no token: the guards are
 * fishball-core's own patch"); the owner's profile layer wins over core's ("can override", Q20).
 *
 * The composition is the instance's own `composedProfile` (export './native-runtime') over the
 * sibling checkout's fishball-core, then composed with the SDK's own dsh-app-boot. Nothing is launched.
 *
 * Techniques: EP over the guard classes (guarded rows, shipped presets, policy rows), the owner
 * override partition (SET-EP-12), HOST-UC-06's postcondition on the overlay.
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups } from '@dsh-instance/test-helpers/scratch'
import { missingSibling } from '@dsh-instance/test-helpers/siblings'
import { composeChild, effective, findRows, ownerPatch } from './support/compose.mjs'
import { DSH_ROW, OVERLAY, WIDER } from './support/constants.mjs'
import { guards } from './support/guards.mjs'

const skip = missingSibling('fishball')
const one = (rows, id) => findRows(rows, id)[0]

/** The guard rule for a hosted child (design §5a.2 as amended at 32fca3c5; core's IntendedPolicy). */
function assertGuarded(rows) {
  const g = guards()
  assert.equal(one(rows, DSH_ROW.sandbox)?.config?.mode, g.policy.sandbox, 'sandbox-policy')
  assert.equal(one(rows, DSH_ROW.approval)?.config?.policy, g.policy.approval, 'approval')
  assert.deepEqual(Object.keys(one(rows, DSH_ROW.permission)?.config?.presets ?? {}), [...g.policy.permissionPresets], 'permission presets')
  assert.equal(one(rows, DSH_ROW.permission)?.config?.defaultPreset, g.policy.defaultPermissionPreset)
  assert.equal(one(rows, DSH_ROW.agentPresetRegistry)?.config?.default, g.policy.defaultAgentPreset, 'default agent preset')
  // Present-only rows: a guarded row the composition has is disabled.
  const on = g.rows.flatMap((id) => findRows(rows, id)).filter((row) => row.disabled !== true).map((row) => row.id)
  assert.deepEqual(on, [], 'guarded rows left on')
  // Q-S6-2 B (32fca3c5): every shipped preset is switched off, not deleted.
  const presets = g.shippedPresets.flatMap((id) => findRows(rows, id))
  assert.ok(presets.length > 0, 'precondition: the SDK ships preset rows')
  assert.deepEqual(presets.filter((row) => row.disabled !== true).map((row) => row.id), [], 'shipped presets left on')
}

eachSdk((sdk) => {
  caseTest(sdk, 'LITE-UC-03', 'hosted', "effective read-only in a hosted child's composed profile (core's patch last + the launch overlay), shipped presets off", async (t) => {
    const c = await composeChild(sdk, cleanups(t))
    assertGuarded(await effective(sdk, c))
  }, { skip })

  caseTest(sdk, 'LITE-EP-13', 'hosted', 'no ordinary child creation: every guarded row the composition has is disabled, every shipped preset off, /permission read-only only', async (t) => {
    const rows = await effective(sdk, await composeChild(sdk, cleanups(t)))
    assertGuarded(rows)
    assert.deepEqual(Object.keys(one(rows, DSH_ROW.permission).config.presets), [guards().policy.sandbox])
  }, { skip })

  caseTest(sdk, 'SET-EP-12', 'hosted', "the overlay patches no sandbox-policy; the effective sandbox is core's read-only", async (t) => {
    const c = await composeChild(sdk, cleanups(t))
    assert.deepEqual(c.overlay.filter((op) => op?.id === DSH_ROW.sandbox), [], 'the launch overlay patches sandbox-policy (R-HOST-04)')
    assert.equal(one(await effective(sdk, c), DSH_ROW.sandbox)?.config?.mode, guards().policy.sandbox)
  }, { skip })

  caseTest(sdk, 'SET-EP-12', 'hosted', "a stored wider sandbox in the owner's profile layer wins (Q20 'can override')", async (t) => {
    // The owner's choice is saved in the child profile's own patch after the child exists (a first compose lays it out).
    const first = await composeChild(sdk, cleanups(t))
    await ownerPatch(sdk, first.profile, [{ id: DSH_ROW.sandbox, config: { mode: WIDER } }])
    const c = await composeChild(sdk, null, { mainHome: first.mainHome })
    assert.equal(one(await effective(sdk, c), DSH_ROW.sandbox)?.config?.mode, WIDER)
  }, { skip })

  // HOST-UC-06 postcondition (R-HOST-04, Q-5): core's patch is what disables; the overlay switches only hmr off.
  caseTest(sdk, 'HOST-UC-06', 'post', 'with the real core: the launch overlay disables nothing but hmr (no guarded row, no shipped preset, no dsh-instance) and inserts only the two required instance rows', async (t) => {
    const c = await composeChild(sdk, cleanups(t))
    assert.deepEqual(c.overlay.filter((op) => op?.disabled === true).map((op) => op.id), [OVERLAY.hmr])
    const presetOps = c.overlay.filter((op) => guards().shippedPresets.includes(op?.id))
    assert.deepEqual(presetOps.filter((op) => Object.hasOwn(op, 'disabled')).map((op) => op.id), [], 'an overlay op sets disabled on a shipped preset')
    const inserted = c.overlay.flatMap((op) => op?.insert ?? [])
    assert.deepEqual(inserted.map((r) => r.id).sort(), [...OVERLAY.runtimeRows].sort())
    for (const row of inserted) assert.equal(row.required, true, row.id)
    assert.deepEqual(c.overlay.filter((op) => guards().rows.includes(op?.id)).map((op) => op.id), [], 'guard rows in the overlay')
  }, { skip })

  caseTest(sdk, 'LITE-UC-03', 'hosted', 'the private Skills exception and a live child agent refused child creation and write', () => {}, { skip: 'E2E-UI: needs a live child agent turn driven in a browser (W6 flows); no browser in this package' })
})