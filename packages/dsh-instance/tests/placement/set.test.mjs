/**
 * The placed set in a scratch main home, through the public composedProfile (package export
 * "./native-runtime": a start's layout, placement and profile load, no child process), with
 * FISHBALL_REPO pointing at a fake dsh-fishball checkout (subject.mjs fakeFishball).
 *
 * Requirements: README "Placement"; constants.js PLACEMENT as amended by 8fdd0ef ("place unified
 * fishball-core bundle": the set is fishball-core alone, fishball-ui retired, PLACEMENT.retiredBundle);
 * SHELVE-BOARD (the user, 2026-11-18: "不要预留在子实例的Fishball内"); R-BND-01…03, R-FB-12.
 *
 * - EP PLACE Q2 / Q1: which Fishball packages a child holds, and where;
 * - State transition PLACE SHELVE: fresh → first compose → second compose on the same home;
 * - Decision table PLAT-DT-01: the record × the owner's switch × presence × compatibility
 *   (rules 1–7) at the next start, and rule 9: the host's own manifest names no set member.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { show } from '@dsh-instance/test-helpers/json'
import { cleanups, modeOf } from '@dsh-instance/test-helpers/scratch'
import { packageFile } from '../support/instance.mjs'
import { CHILD, CODE, FAKE_REPO, MANIFEST, SET } from './constants.mjs'
import {
  composeWorld, fishballBundles, placedCopy, placementRecord, placementRecordFile, profileBundles, profileManifest, deleteCopies, setProfileBundles, tracesOf,
} from './subject.mjs'

const enabled = (mainHome) => profileBundles(mainHome).includes(SET.core)
const coreOff = (mainHome) => setProfileBundles(mainHome, profileBundles(mainHome).filter((name) => name !== SET.core))
const coreOn = (mainHome) => { if (!enabled(mainHome)) setProfileBundles(mainHome, [...profileBundles(mainHome), SET.core]) }
/** Make the fake checkout's core incompatible with every SDK (its engines.dsh), so the next placement copies an incompatible core. */
function makeIncompatible(core) {
  const file = path.join(core, MANIFEST)
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  manifest.engines = { ...manifest.engines, dsh: FAKE_REPO.impossibleEngine }
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
}

eachSdk((sdk) => {
  // ============================================================== EP: what a child holds
  // OUTDATED (8fdd0ef): the old Q2 expected fishball-ui, fishball-core; the set is fishball-core alone.
  caseTest(sdk, 'PLACE', 'Q2', 'the composed child profile\'s Fishball bundles are exactly fishball-core, and it ends the list (core last)', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    assert.deepEqual(fishballBundles(world.mainHome), [SET.core], show(profileBundles(world.mainHome)))
    assert.equal(profileBundles(world.mainHome).at(-1), SET.core, show(profileBundles(world.mainHome)))
  })
  caseTest(sdk, 'PLACE', 'Q2 copies', 'fishball-core is copied to vendor/ and node_modules/ and declared file:./vendor/fishball-core', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    for (const dir of CHILD.copyDirs) assert.ok(fs.existsSync(path.join(placedCopy(world.mainHome, SET.core, dir), MANIFEST)), `${SET.core} not in ${dir}/`)
    assert.equal(profileManifest(world.mainHome).dependencies?.[SET.core], CHILD.dependency(SET.core))
  })
  // OUTDATED (8fdd0ef): the old Q1 expected a fishball-ui copy; it is retired, so a sibling
  // fishball-ui folder is never placed, and core's fishball-shared is placed once, beside it.
  caseTest(sdk, 'PLACE', 'Q1', 'the retired fishball-ui is not placed even beside core in the checkout; core\'s fishball-shared is placed once in each folder, never as a bundle', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    assert.deepEqual(tracesOf(world.mainHome, SET.retired), [], SET.retired + ' traces')
    for (const dir of CHILD.copyDirs) {
      assert.ok(fs.existsSync(path.join(placedCopy(world.mainHome, SET.library, dir), MANIFEST)), `${SET.library} not in ${dir}/`)
      const copies = fs.readdirSync(path.join(path.dirname(placedCopy(world.mainHome, SET.library, dir)))).filter((entry) => entry.startsWith(SET.library))
      assert.deepEqual(copies, [SET.library], dir + ': ' + show(copies))
    }
    assert.equal(profileBundles(world.mainHome).includes(SET.library), false, SET.library + ' is a bundle')
  })
  caseTest(sdk, 'PLACE', 'Q1 files', "the child's copy of core holds exactly core's shipped files: ui/ without the excluded ui/tests/", async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    const copy = placedCopy(world.mainHome, SET.core, CHILD.copyDirs[0])
    assert.ok(fs.existsSync(path.join(copy, ...FAKE_REPO.mustShip.split('/'))), FAKE_REPO.mustShip + ' not copied')
    assert.equal(fs.existsSync(path.join(copy, ...FAKE_REPO.excluded.split('/'))), false, FAKE_REPO.excluded + ' copied')
  })

  // ============================================================== ST: SHELVE-BOARD over two starts
  caseTest(sdk, 'PLACE', 'SHELVE', 'first start and a second start on the same home: no fishball-board in vendor/, node_modules/, dependencies, bundles, the placement record or an install spec', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    for (const start of ['first', 'second']) {
      await world.compose()
      assert.deepEqual(tracesOf(world.mainHome, SET.shelved), [], 'after the ' + start + ' start')
      assert.deepEqual(fishballBundles(world.mainHome), [SET.core], `${start}: ${show(profileBundles(world.mainHome))}`)
    }
  })

  // ============================================================== DT: PLAT-DT-01
  caseTest(sdk, 'PLAT-DT-01', 1, 'first placement: core placed, on, last, and recorded in a format-1 record readable by the owner only (0600)', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    const record = placementRecord(world.mainHome)
    assert.equal(record?.format, CHILD.record.format, show(record))
    assert.deepEqual(record[CHILD.record.key], [SET.core])
    assert.equal(profileBundles(world.mainHome).at(-1), SET.core)
    assert.equal(modeOf(placementRecordFile(world.mainHome)), CHILD.record.mode)
  })
  // Rules 2–5: what the owner did while the child was down, and core's state at the next start.
  for (const [rule, title, whileDown, on] of [
    [2, 'recorded, present, on → stays on', () => {}, true],
    [3, 'recorded, present, off → stays off (a disable survives the restart)', coreOff, false],
    [4, 'recorded, deleted while off → placed again, off', (home) => { coreOff(home); deleteCopies(home, SET.core) }, false],
    [5, 'recorded, deleted while on → placed again, on', (home) => { coreOn(home); deleteCopies(home, SET.core) }, true],
  ]) {
    caseTest(sdk, 'PLAT-DT-01', rule, title, async (t) => {
      const world = await composeWorld(cleanups(t), sdk)
      await world.compose()
      whileDown(world.mainHome)
      await world.compose()
      for (const dir of CHILD.copyDirs) assert.ok(fs.existsSync(path.join(placedCopy(world.mainHome, SET.core, dir), MANIFEST)), `${SET.core} not in ${dir}/`)
      assert.equal(enabled(world.mainHome), on, show(profileBundles(world.mainHome)))
      assert.deepEqual(placementRecord(world.mainHome)?.[CHILD.record.key], [SET.core], 'still recorded')
      if (on) assert.equal(profileBundles(world.mainHome).at(-1), SET.core, 'core last')
    })
  }
  // Rule 6 was a todo in the old suite (it needed a real host); composedProfile loads the profile as a start does.
  caseTest(sdk, 'PLAT-DT-01', 6, 'core on and incompatible blocks the start: PROFILE_INCOMPATIBLE, naming fishball-core (R-FB-10: core follows the same rules)', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    makeIncompatible(world.core)
    await assert.rejects(world.compose(), (error) => {
      assert.equal(error?.code, CODE.incompatible, error?.stack)
      assert.equal(error?.plugin, SET.core, 'the blocking bundle: ' + show({ plugin: error?.plugin, message: error?.message }))
      return true
    })
  })
  caseTest(sdk, 'PLAT-DT-01', 7, 'core off and incompatible → the start is not blocked (only enabled bundles block), and core stays off', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    coreOff(world.mainHome)
    makeIncompatible(world.core)
    await world.compose()
    assert.equal(enabled(world.mainHome), false, show(profileBundles(world.mainHome)))
  })

  caseTest(sdk, 'PLAT-DT-01', 9, "the instance's own manifest selects no set member or library as a bundle or dependency of the host", () => {
    const manifest = JSON.parse(fs.readFileSync(packageFile(MANIFEST), 'utf8'))
    const named = ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies']
      .flatMap((field) => (Array.isArray(manifest[field]) ? manifest[field] : Object.keys(manifest[field] ?? {})))
    assert.deepEqual(named.filter((name) => [SET.core, SET.library, SET.retired, SET.shelved].includes(name)), [])
    assert.equal(JSON.stringify(manifest.dsh ?? {}).includes(SET.prefix), false, 'dsh field names a Fishball package: ' + show(manifest.dsh))
  })
})
