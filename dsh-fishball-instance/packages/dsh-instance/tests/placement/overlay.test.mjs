/**
 * The launch overlay a start writes (README "How it starts"; R-HOST-04; design §6.2; Q-5; the
 * isolation decided 2026-11-15: Fishball never reads the user's skills or project instructions):
 * HMR off, the child's own origin and port, the two instance rows (the lifecycle row and the
 * child-side row dsh-instance-child), the isolation of instructions and skills; no guard row, no
 * token. Read through the public composedProfile (`overlay`), and applied over the child's loaded
 * profile with the SDK's own dsh-app-boot, as `dsh --patch` applies it.
 *
 * - Use case HOST-UC-06 post: the overlay's postcondition;
 * - EP HOST-EP-03 row 6: what the overlay may carry (isolation, no settings row, nothing of core).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups } from '@dsh-instance/test-helpers/scratch'
import { CHILD, GUARDED_ROWS, OVERLAY, POLICY_ROWS, SET, SHIPPED_PRESETS } from './constants.mjs'
import { show } from '@dsh-instance/test-helpers/json'
import { composeWorld, effectiveRows, findRows, insertedOf, touchedOf } from './subject.mjs'

const { instructions, skills } = OVERLAY.isolation
const isIsolation = (id) => id === instructions.id || id === skills.id || OVERLAY.presetRow.test(id)
/** Strictly below `root` (the root itself does not count). */
const below = (dir, root) => { const rel = path.relative(root, dir); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) }
const within = (dir, root) => dir === root || below(dir, root)
/** Every key of a JSON value, nested ones included. */
const keysOf = (value) => (value && typeof value === 'object' ? Object.entries(value).flatMap(([key, inner]) => [...(Array.isArray(value) ? [] : [key]), ...keysOf(inner)]) : [])

/** One composition in a scratch main home: { world, result }. */
async function composed(t, sdk) {
  const world = await composeWorld(cleanups(t), sdk)
  return { world, result: await world.compose() }
}

eachSdk((sdk) => {
  // ============================================================== HOST-UC-06 postcondition
  caseTest(sdk, 'HOST-UC-06', 'post', 'the launch overlay inserts only required fishball-native-child and dsh-instance-child (I-READY)', async (t) => {
    const { result } = await composed(t, sdk)
    const inserted = insertedOf(result.overlay)
    assert.deepEqual(inserted.map((row) => row.id).sort(), [...OVERLAY.runtimeRows].sort())
    for (const row of inserted) assert.equal(row.required, true, row.id + ' is not required')
  })
  caseTest(sdk, 'HOST-UC-06', 'post', 'the launch overlay disables nothing but hmr: no guarded row, no shipped preset, no dsh-instance', async (t) => {
    const { result } = await composed(t, sdk)
    assert.deepEqual(result.overlay.filter((op) => op?.disabled === true).map((op) => op.id), [OVERLAY.hmr])
  })
  // Isolation (row 6 as amended in 57ae8e96): a shipped preset row nests the isolated plugins, so it
  // may carry a config-only op; an op that sets or clears `disabled` on it is a guard op, forbidden.
  caseTest(sdk, 'HOST-UC-06', 'post', 'the launch overlay touches only the allowed rows: hmr, origin and port, the two instance rows, and the isolation rows', async (t) => {
    const { result } = await composed(t, sdk)
    const allowed = [OVERLAY.hmr, ...OVERLAY.origin]
    assert.deepEqual(touchedOf(result.overlay).filter((id) => !allowed.includes(id) && !isIsolation(id)), [], 'rows beyond the allowed ones')
    assert.deepEqual(touchedOf(result.overlay).filter((id) => [...GUARDED_ROWS, ...POLICY_ROWS].includes(id)), [], 'guard or policy rows in the overlay')
    const presetOps = result.overlay.filter((op) => SHIPPED_PRESETS.includes(op?.id))
    assert.deepEqual(presetOps.filter((op) => Object.keys(op).some((key) => !OVERLAY.presetOpKeys.includes(key))).map((op) => op.id), [], 'a shipped preset op is not config only')
    assert.ok(result.overlay.some((op) => op?.id === OVERLAY.hmr && op.disabled === true), 'hmr is not switched off')
  })
  caseTest(sdk, 'HOST-UC-06', 'post', 'the composed child keeps every shipped preset disabled: true, the isolation config ops included', async (t) => {
    const { world, result } = await composed(t, sdk)
    const effective = await effectiveRows(sdk, world.mainHome, result.overlay)
    const rows = SHIPPED_PRESETS.flatMap((id) => findRows(effective, id))
    assert.ok(rows.length > 0, 'precondition: the composed child has the shipped preset rows')
    for (const row of rows) assert.equal(row.disabled, true, 'shipped preset on in the composed child: ' + row.id)
  })
  // The old case was a todo (I-HOST); the rule holds: the hosted import travels on the wire and the
  // admission key is derived from the lifecycle secret at both ends, so neither is in the overlay.
  caseTest(sdk, 'HOST-UC-06', 'post', 'the launch overlay carries no token: not the lifecycle secret, no 64-hex value, no token, secret, credential or admission field', async (t) => {
    const { world, result } = await composed(t, sdk)
    const text = JSON.stringify(result.overlay)
    const secret = fs.readFileSync(path.join(world.mainHome, ...CHILD.runtime, CHILD.secret), 'utf8').trim()
    assert.equal(text.includes(secret), false, 'the lifecycle secret is in the overlay')
    assert.equal(OVERLAY.hex64.test(text), false, 'a 64-hex value is in the overlay')
    assert.deepEqual(keysOf(result.overlay).filter((key) => /token|secret|credential|admission/i.test(key)), [], 'secret-like fields')
  })

  // ============================================================== HOST-EP-03 row 6: isolation
  caseTest(sdk, 'HOST-EP-03', '6 isolation', 'the overlay sets agent-instructions projectRootMarkers to [] wherever the row is composed', async (t) => {
    const { world, result } = await composed(t, sdk)
    const rows = findRows(await effectiveRows(sdk, world.mainHome, result.overlay), instructions.name)
    assert.ok(rows.length > 0, 'precondition: the SDK has agent-instructions rows')
    for (const row of rows) assert.deepEqual(row.config?.[instructions.field], [], 'project instructions read: ' + show(row.config))
  })
  caseTest(sdk, 'HOST-EP-03', '6 isolation', 'the overlay limits skill-filesystem to the child runtime with includeDefaultRoots false wherever it is composed', async (t) => {
    const { world, result } = await composed(t, sdk)
    const rows = findRows(await effectiveRows(sdk, world.mainHome, result.overlay), skills.name)
    assert.ok(rows.length > 0, 'precondition: the SDK has skill-filesystem rows')
    const runtimeRoot = path.join(world.mainHome, ...CHILD.runtime)
    const userAgents = path.join(os.homedir(), OVERLAY.isolation.userAgentsDir)
    for (const row of rows) {
      const config = row.config ?? {}
      assert.equal(config[skills.field], false, 'default roots read: ' + show(config))
      assert.equal(config[skills.home], result.paths.home, "the skills home is not the child's: " + show(config))
      assert.equal(typeof config[skills.agentsHome], 'string', 'no agentsHome: ' + show(config))
      for (const dir of [config[skills.agentsHome], ...(config[skills.customDirs] ?? [])]) {
        assert.notEqual(dir, world.mainHome, 'a skills folder is the main home itself')
        assert.ok(below(dir, runtimeRoot), `${dir} is not under the child runtime root ${runtimeRoot}`)
        assert.equal(within(dir, userAgents), false, `${dir} is the user's real ${userAgents}`)
      }
    }
  })
  caseTest(sdk, 'HOST-EP-03', '6 isolation', 'the isolation edits are config only: no isolation row is disabled or inserted by the overlay', async (t) => {
    const { result } = await composed(t, sdk)
    assert.deepEqual(result.overlay.filter((op) => isIsolation(op?.id ?? '') && (Object.hasOwn(op, 'disabled') || Array.isArray(op.insert))).map((op) => op.id), [])
    assert.deepEqual(insertedOf(result.overlay).filter((row) => isIsolation(row.id)).map((row) => row.id), [])
  })
  caseTest(sdk, 'HOST-EP-03', 6, 'no settings row: the overlay inserts no panel row', async (t) => {
    const { result } = await composed(t, sdk)
    assert.deepEqual(insertedOf(result.overlay).map((row) => row.id).filter((id) => OVERLAY.settingsRow.test(id)), [])
  })
  caseTest(sdk, 'HOST-EP-03', 6, 'no overlay row points into core (core is a placed bundle; its rows come from its own patch)', async (t) => {
    const { world, result } = await composed(t, sdk)
    const names = result.overlay.flatMap((op) => [op?.name, ...(op?.insert ?? []).map((row) => row.name)]).filter((name) => typeof name === 'string')
    assert.deepEqual(names.filter((name) => name.includes(SET.core) || name.startsWith(world.core)), [])
  })
})
