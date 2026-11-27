/**
 * The placed set in a scratch main home, through the public composedProfile (package export
 * "./native-runtime": a start's layout, placement and profile load, no child process), with
 * FISHBALL_REPO pointing at a fake dsh-fishball checkout (subject.mjs fakeFishball).
 *
 * Requirements: README "Placement"; R-BND-01…03 and R-FB-12. Amenities precedes core, with
 * the amenity packages placed only as its dependencies. The standalone fishball-ui is retired.
 *
 * - EP PLACE Q2 / Q1: which Fishball packages a child holds, and where;
 * - State transition PLACE restart: fresh → first compose → second compose on the same home;
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
import { AMENITY_PACKAGES, BUNDLES, CHILD, CODE, FAKE_REPO, MANIFEST, SET } from './constants.mjs'
import {
  composeWorld, fishballBundles, placedCopy, placementRecord, placementRecordFile, profileBundles, profileManifest, deleteCopies, setProfileBundles, tracesOf,
} from './subject.mjs'

function assertCopies(mainHome, name) {
  for (const dir of CHILD.copyDirs) {
    const manifest = JSON.parse(fs.readFileSync(path.join(placedCopy(mainHome, name, dir), MANIFEST), 'utf8'))
    assert.equal(manifest.name, name, dir + ' copy')
  }
  assert.equal(profileManifest(mainHome).dependencies?.[name], CHILD.dependency(name), name)
}

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
  caseTest(sdk, 'PLACE', 'Q2', 'amenities and core are the only Fishball bundles and end the composed profile list in that order', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    const bundles = profileBundles(world.mainHome)
    assert.deepEqual(fishballBundles(world.mainHome), BUNDLES, show(bundles))
    assert.deepEqual(bundles.slice(-BUNDLES.length), BUNDLES, show(bundles))
  })
  caseTest(sdk, 'PLACE', 'Q2 copies', 'both bundles are copied to vendor/ and node_modules/ and declared as vendor dependencies', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    for (const name of BUNDLES) assertCopies(world.mainHome, name)
  })
  caseTest(sdk, 'PLACE', 'Q1', 'the amenity packages and shared library are copied as dependencies, not enabled or recorded as bundles', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    const bundles = profileBundles(world.mainHome)
    const record = placementRecord(world.mainHome)?.[CHILD.record.key]
    assert.ok(Array.isArray(record), 'placement record has no bundle list')
    for (const name of [...AMENITY_PACKAGES, SET.library]) {
      assertCopies(world.mainHome, name)
      assert.equal(bundles.includes(name), false, name + ' is a bundle')
      assert.equal(record.includes(name), false, name + ' is recorded as a bundle')
    }
    for (const dir of CHILD.copyDirs) {
      const copies = fs.readdirSync(path.dirname(placedCopy(world.mainHome, SET.library, dir))).filter((name) => name.startsWith(SET.library))
      assert.deepEqual(copies, [SET.library], dir + ': ' + show(copies))
    }
  })
  caseTest(sdk, 'PLACE', 'Q1 files', "the child's copy of core holds exactly core's shipped files: ui/ without the excluded ui/tests/", async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    const copy = placedCopy(world.mainHome, SET.core, CHILD.copyDirs[0])
    assert.ok(fs.existsSync(path.join(copy, ...FAKE_REPO.mustShip.split('/'))), FAKE_REPO.mustShip + ' not copied')
    assert.equal(fs.existsSync(path.join(copy, ...FAKE_REPO.excluded.split('/'))), false, FAKE_REPO.excluded + ' copied')
  })

  // ============================================================== ST: the same placed set over two starts
  caseTest(sdk, 'PLACE', 'restart', 'two starts on the same home keep the amenities/core order and do not revive standalone fishball-ui', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    for (const start of ['first', 'second']) {
      await world.compose()
      assert.deepEqual(tracesOf(world.mainHome, SET.retired), [], 'after the ' + start + ' start')
      assert.deepEqual(profileBundles(world.mainHome).slice(-BUNDLES.length), BUNDLES, start + ': ' + show(profileBundles(world.mainHome)))
    }
  })

  // ============================================================== DT: PLAT-DT-01
  caseTest(sdk, 'PLAT-DT-01', 1, 'first placement: amenities and core enabled, and recorded in a format-1 record readable by the owner only (0600)', async (t) => {
    const world = await composeWorld(cleanups(t), sdk)
    await world.compose()
    const record = placementRecord(world.mainHome)
    assert.equal(record?.format, CHILD.record.format, show(record))
    assert.deepEqual(record[CHILD.record.key], BUNDLES)
    assert.deepEqual(fishballBundles(world.mainHome), BUNDLES)
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
      assertCopies(world.mainHome, SET.core)
      assert.deepEqual(fishballBundles(world.mainHome), on ? BUNDLES : [SET.amenities], show(profileBundles(world.mainHome)))
      assert.deepEqual(placementRecord(world.mainHome)?.[CHILD.record.key], BUNDLES, 'both still recorded')
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

  caseTest(sdk, 'PLAT-DT-01', 9, "the instance's own manifest selects no Fishball package as a bundle or dependency of the host", () => {
    const manifest = JSON.parse(fs.readFileSync(packageFile(MANIFEST), 'utf8'))
    const named = ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies']
      .flatMap((field) => (Array.isArray(manifest[field]) ? manifest[field] : Object.keys(manifest[field] ?? {})))
    assert.deepEqual(named.filter((name) => name.startsWith(SET.prefix)), [])
    assert.equal(JSON.stringify(manifest.dsh ?? {}).includes(SET.prefix), false, 'dsh field names a Fishball package: ' + show(manifest.dsh))
  })
})
