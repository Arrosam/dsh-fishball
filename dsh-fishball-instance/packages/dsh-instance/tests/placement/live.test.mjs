/** Live placement through the same public composition API as default copy placement. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups } from '@dsh-instance/test-helpers/scratch'
import { AMENITY_PACKAGES, BUNDLES, CHILD, FAKE_REPO, MANIFEST, OVERLAY, SET } from './constants.mjs'
import { childProfile, composeWorld, deleteCopies, fakeFishball, fishballBundles, native, placedCopy, profileBundles, profileManifest, setProfileBundles, writeFile } from './subject.mjs'

const LIVE = Object.freeze({
  checkout: 'live checkout',
  consultant: 'fishball-consultant',
  sharedFolder: 'shared',
  unrelated: 'unrelated-plugin',
  missingRoot: 'no checkout',
  emptyRoot: 'empty checkout',
  movedCheckout: 'moved checkout',
  staleTarball: SET.core + '-' + SET.version + '.tgz',
})
const LIVE_PACKAGES = Object.freeze([
  [SET.core, FAKE_REPO.coreFolder],
  [SET.library, LIVE.sharedFolder],
  ...[SET.amenities, ...AMENITY_PACKAGES, LIVE.consultant].map((name) => [name, name]),
])
const [VENDOR, MODULES] = CHILD.copyDirs
const packages = (repo, ...segments) => path.join(repo, FAKE_REPO.packages, ...segments)
const linkSpec = (target) => 'link:' + target

async function liveWorld(t, sdk, { shadowShared = false } = {}) {
  const world = await composeWorld(cleanups(t), sdk)
  // Keep the configured live repo independent of the default copy source (FISHBALL_REPO).
  const { repo: liveRepo } = fakeFishball(path.join(world.root, LIVE.checkout))
  const sharedLookup = path.join(liveRepo, FAKE_REPO.modules, SET.library)
  const sharedRoot = packages(liveRepo, LIVE.sharedFolder)
  if (shadowShared) {
    fs.cpSync(sharedLookup, sharedRoot, { recursive: true })
  } else {
    // Workspace Node resolution and the child's live link must reach the same package root.
    fs.renameSync(sharedLookup, sharedRoot)
    fs.symlinkSync(sharedRoot, sharedLookup, 'dir')
  }
  writeFile(packages(liveRepo, LIVE.consultant, MANIFEST), { name: LIVE.consultant, version: SET.version })
  return { ...world, liveRepo, composeLive: () => world.compose({ fishballLiveRepo: liveRepo }) }
}

function fishballDependencies(mainHome) {
  return Object.fromEntries(Object.entries(profileManifest(mainHome).dependencies).filter(([name]) => name.startsWith(SET.prefix)))
}

const liveDependencySpecs = (repo) => Object.fromEntries(LIVE_PACKAGES.map(([name, folder]) => [name, linkSpec(packages(repo, folder))]))

function declareDependencies(mainHome, specs) {
  const manifest = profileManifest(mainHome)
  Object.assign(manifest.dependencies, specs)
  writeFile(path.join(childProfile(mainHome), MANIFEST), manifest)
  return manifest
}

function assertLiveResolution({ mainHome, liveRepo }) {
  assert.deepEqual(fishballDependencies(mainHome), liveDependencySpecs(liveRepo))
  for (const [name, folder] of LIVE_PACKAGES) {
    const target = packages(liveRepo, folder)
    assert.equal(fs.realpathSync(placedCopy(mainHome, name, MODULES)), fs.realpathSync(target), name + ' resolves to checkout')
  }
}

function assertDefaultPlacement({ mainHome }) {
  const names = [...BUNDLES, ...AMENITY_PACKAGES, SET.library]
  assert.deepEqual(fishballDependencies(mainHome), Object.fromEntries(names.map((name) => [name, CHILD.dependency(name)])))
  for (const dir of CHILD.copyDirs) {
    const core = placedCopy(mainHome, SET.core, dir)
    assert.ok(fs.lstatSync(core).isDirectory(), dir + ': core must be a real copy')
    assert.ok(fs.existsSync(path.join(core, native(FAKE_REPO.mustShip))), dir + ': included source must be copied')
    assert.equal(fs.existsSync(path.join(core, native(FAKE_REPO.excluded))), false, dir + ': release exclusion must still apply')
  }
}

const INVALID_REPOS = [
  ['relative', () => LIVE.checkout, /fishballLiveRepo|absolute/i],
  ['missing', ({ root }) => path.join(root, LIVE.missingRoot), /fishballLiveRepo|no checkout/i],
  ['file, not a directory', ({ liveRepo }) => path.join(liveRepo, MANIFEST), /fishballLiveRepo|package[.]json/i],
  ['missing packages directory', ({ root }) => fs.mkdtempSync(path.join(root, LIVE.emptyRoot)), /fishballLiveRepo|packages/i],
  ['missing member', ({ liveRepo }) => {
    fs.renameSync(packages(liveRepo, LIVE.consultant, MANIFEST), packages(liveRepo, LIVE.consultant, MANIFEST + '.absent'))
    return liveRepo
  }, /fishball-consultant/i],
  ['wrong package identity', ({ liveRepo }) => {
    writeFile(packages(liveRepo, LIVE.sharedFolder, MANIFEST), { name: LIVE.unrelated, version: SET.version })
    return liveRepo
  }, /fishball-shared|unrelated-plugin/i],
]

eachSdk((sdk) => {
  caseTest(sdk, 'LIVE-DT-01', 'default and live', 'keeps server HMR off in default placement and enables it for a live checkout', async (t) => {
    const world = await liveWorld(t, sdk)
    const hmrOf = ({ overlay }) => overlay.find(({ id }) => id === OVERLAY.hmr)
    assert.equal(hmrOf(await world.compose())?.disabled, true, 'server HMR must stay off in default placement')
    const liveHmr = hmrOf(await world.composeLive())
    assert.equal(liveHmr?.disabled, false, 'the live overlay must enable server HMR')
    const roots = liveHmr.config?.root
    assert.ok(Array.isArray(roots), 'server HMR must have a list of watch roots')
    for (const [name, folder] of LIVE_PACKAGES) {
      const realRoot = fs.realpathSync(packages(world.liveRepo, folder))
      assert.ok(roots.includes(realRoot), name + ' checkout root must be watched by server HMR')
    }
  })

  caseTest(sdk, 'LIVE-UC-01', 'fresh', 'links the seven checkout packages without making vendor copies or enabling extra bundles', async (t) => {
    const world = await liveWorld(t, sdk)
    await world.composeLive()
    assertLiveResolution(world)
    assert.deepEqual(fishballBundles(world.mainHome), BUNDLES)
    for (const [name] of LIVE_PACKAGES) {
      assert.equal(fs.lstatSync(placedCopy(world.mainHome, name, VENDOR), { throwIfNoEntry: false }), undefined, name + ' made a vendor copy')
    }
    assert.ok(fs.existsSync(path.join(placedCopy(world.mainHome, SET.core, MODULES), native(FAKE_REPO.excluded))), 'live core exposes checkout files excluded from a release copy')
  })

  caseTest(sdk, 'LIVE-ST-01', 'copy → live → copy', 'preserves a disabled bundle, ignores the stale core tarball in live mode and restores release copies', async (t) => {
    const world = await liveWorld(t, sdk)
    await world.compose()
    assertDefaultPlacement(world)
    setProfileBundles(world.mainHome, profileBundles(world.mainHome).filter((name) => name !== SET.core))
    // A prior packed child can leave a tarball. Its presence must not select it in live mode.
    writeFile(placedCopy(world.mainHome, LIVE.staleTarball, VENDOR), 'not a usable tarball')
    await world.composeLive()
    assertLiveResolution(world)
    assert.deepEqual(fishballBundles(world.mainHome), [SET.amenities])
    await world.compose()
    assertDefaultPlacement(world)
    assert.deepEqual(fishballBundles(world.mainHome), [SET.amenities])
    assert.equal(fs.lstatSync(placedCopy(world.mainHome, LIVE.consultant, MODULES), { throwIfNoEntry: false }), undefined, 'live-only consultant link must not survive copy placement')
  })

  caseTest(sdk, 'LIVE-ST-02', 'retry and restore', 'repairs a partially switched profile and restores copies after the checkout moves', async (t) => {
    const world = await liveWorld(t, sdk)
    const { mainHome, liveRepo } = world
    await world.compose()
    // Simulate an interruption after publishing the links, before repairing all package slots.
    declareDependencies(mainHome, liveDependencySpecs(liveRepo))
    deleteCopies(mainHome, SET.amenities)
    assert.ok(fs.lstatSync(placedCopy(mainHome, SET.core, MODULES)).isDirectory(), 'core is still a snapshot')
    assert.ok(!fs.existsSync(placedCopy(mainHome, SET.amenities, MODULES)), 'the amenities slot is still missing')
    await world.composeLive()
    assertLiveResolution(world)
    assert.deepEqual(fishballBundles(mainHome), BUNDLES)

    fs.renameSync(liveRepo, path.join(world.root, LIVE.movedCheckout))
    const coreSlot = placedCopy(mainHome, SET.core, MODULES)
    assert.ok(fs.lstatSync(coreSlot).isSymbolicLink() && !fs.existsSync(coreSlot), 'the managed core link is now dangling')
    await world.compose()
    assertDefaultPlacement(world)
    assert.deepEqual(fishballBundles(mainHome), BUNDLES)
    assert.equal(fs.lstatSync(placedCopy(mainHome, LIVE.consultant, MODULES), { throwIfNoEntry: false }), undefined, 'default placement removes the dangling live-only link')
  })

  for (const [part, invalidRepo, diagnostic] of INVALID_REPOS) {
    caseTest(sdk, 'LIVE-EP-01', part, 'rejects an invalid live repo instead of falling back to an available copy source', async (t) => {
      const world = await liveWorld(t, sdk)
      await assert.rejects(world.compose({ fishballLiveRepo: invalidRepo(world) }), diagnostic)
    })
  }

  caseTest(sdk, 'LIVE-EP-02', 'workspace shadow', 'refuses a separate node_modules copy that shadows the selected shared checkout package', async (t) => {
    const world = await liveWorld(t, sdk, { shadowShared: true })
    await assert.rejects(world.composeLive(), /fishball-shared/i)
  })

  caseTest(sdk, 'LIVE-EP-02', 'mismatched managed link', 'rejects a managed profile slot that points to an undeclared checkout location without replacing it', async (t) => {
    const world = await liveWorld(t, sdk)
    const { mainHome, liveRepo } = world
    await world.compose()
    const target = packages(liveRepo, LIVE.unrelated)
    writeFile(path.join(target, MANIFEST), { name: LIVE.consultant, version: SET.version })
    const slot = placedCopy(mainHome, LIVE.consultant, MODULES)
    fs.symlinkSync(target, slot, 'dir')
    const before = declareDependencies(mainHome, liveDependencySpecs(liveRepo))
    await assert.rejects(world.composeLive(), /fishball-consultant/i)
    assert.equal(fs.readlinkSync(slot), target, 'the mismatched link must not be replaced')
    assert.deepEqual(profileManifest(mainHome), before)
    assert.ok(fs.lstatSync(placedCopy(mainHome, SET.core, MODULES)).isDirectory(), 'other managed slots must not be replaced')
  })

  caseTest(sdk, 'LIVE-EP-02', 'unrelated link', 'refuses an unrelated external profile link even inside the selected checkout', async (t) => {
    const world = await liveWorld(t, sdk)
    await world.compose()
    const target = packages(world.liveRepo, LIVE.unrelated)
    writeFile(path.join(target, MANIFEST), { name: LIVE.unrelated, version: SET.version })
    fs.symlinkSync(target, placedCopy(world.mainHome, LIVE.unrelated, MODULES), 'dir')
    declareDependencies(world.mainHome, { [LIVE.unrelated]: linkSpec(target) })
    await assert.rejects(world.composeLive(), /unrelated-plugin/i)
  })
})
