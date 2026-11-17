/**
 * PINST black-box cases: a PACKED dsh-instance installs the hosted child's plugin set into the child
 * profile (REL-PACK item 5; requirements relayed by the lead 2026-11-17; design §19).
 *
 * The packed instance is built as REL-SYS-01 builds it: the release's hosted set
 * (dsh-agent-connector, dsh-connector-ui, dsh-instance) added in one offline `dsh plugin add` to a
 * fresh DSH home. Its public seam `composedProfile({ mainHome, installAnchor })`
 * (src/native-runtime/index.js of the INSTALLED copy) lays out the child profile and places the set;
 * no child process is launched. While it runs, every proxy of this process points at a dead port, so
 * the registry spec install fails and the bundled-tarball fallback is what places the set.
 *
 * Techniques:
 * - State Transition (PINST-ST-01): fresh → placed by the fallback → re-run skipped (manifest and
 *   lockfile byte-identical) → a member disabled by the owner → re-run keeps it off;
 * - Decision Table (PINST-DT-01, the skip rule × the install outcome): all three installed at <v> →
 *   skip; one member at the version just below <v> (BVA) or missing → install again, back at <v>;
 *   registry dead and a bundled tarball tampered (first/middle/last byte, BVA) or missing →
 *   PLACEMENT_INSTALL_FAILED;
 * - Use Case (PINST-UC-01): the registry spec path succeeding — todo, nothing is published.
 *
 * One packed instance per test process (cases run in order within a file). PINST-ST-01 and the skip
 * rows share one main home, in order; every failure row uses its own fresh main home and restores
 * the instance's bundled tarball afterwards. The repo-checkout path (no bundled/ tarballs) is the
 * dsh-instance.placement suite's.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after } from 'node:test'
import { pathToFileURL } from 'node:url'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { relCase } from '../../release/pack/cases.mjs'
import { ISOLATION, TARBALL } from '../../release/pack/constants.mjs'
import {
  assertFromOwnBundle, bundlesOf, flipByte, installAndCheck, installedDir, installProblems, makeScratch, readJson, removeScratch, show, withProcessEnv,
} from '../../release/pack/release.mjs'
import { BUDGET, CASE, CHILD, DEAD_NETWORK, FAILED, LATER, PACKED, SCRATCH, TAMPER } from './constants.mjs'

/** The process environment while composedProfile runs: dead proxies, no user npm config (never ~/.npmrc), HOME and npm cache in `scratch`. */
function deadEnv(scratch) {
  const home = path.join(scratch, SCRATCH.home)
  const npmCache = path.join(scratch, SCRATCH.npmCache)
  for (const d of [home, npmCache]) fs.mkdirSync(d, { recursive: true })
  return { ...Object.fromEntries(ISOLATION.proxyVars.map((v) => [v, DEAD_NETWORK.url])), npm_config_userconfig: ISOLATION.userconfig, npm_config_cache: npmCache, HOME: home }
}
const childProfile = (mainHome) => path.join(mainHome, ...CHILD.profile)
const childManifest = (mainHome) => readJson(path.join(childProfile(mainHome), CHILD.manifest))
const readBytes = (file) => (fs.existsSync(file) ? fs.readFileSync(file) : null)
const snapshot = (mainHome) => ({
  manifest: readBytes(path.join(childProfile(mainHome), CHILD.manifest)),
  lockfile: readBytes(path.join(childProfile(mainHome), CHILD.lockfile)),
})

let packed
let packedScratch
/**
 * The packed instance of this process, built once: { scratch, instanceDir, compose(mainHome), newHome(label) }.
 * A missing release fails here with REL-PACK's "run `node scripts/pack-v3.mjs` first".
 */
function packedInstance(sdk) {
  packed ??= (async () => {
    const scratch = await makeScratch()
    packedScratch = scratch
    const r = await installAndCheck(sdk, scratch, PACKED.hostedSet, { bundles: true })
    const instanceDir = installedDir(r.profileDir, PACKED.instance)
    const module = await import(pathToFileURL(path.join(instanceDir, ...PACKED.module)).href)
    assert.equal(typeof module[PACKED.exportName], 'function', `${PACKED.instance.name} exports no ${PACKED.exportName}`)
    let homes = 0
    return {
      scratch,
      instanceDir,
      /** A fresh, canonical main home in the scratch folder. */
      newHome() {
        const dir = path.join(scratch, `${PACKED.mainHomeDir}-${++homes}`)
        fs.mkdirSync(dir)
        return fs.realpathSync(dir)
      },
      compose: (mainHome) => withProcessEnv(deadEnv(scratch), () => module[PACKED.exportName]({ mainHome, installAnchor: PACKED.installAnchor(sdk) })),
    }
  })()
  return packed
}

/** The instance's own bundled tarball of `pkg`. */
const bundledTarball = (instanceDir, pkg) => path.join(instanceDir, PACKED.bundledDir, pkg.tarball)

/** Everything a placed child profile must show (first placement, or a re-install). */
function assertPlaced(instanceDir, mainHome) {
  const profileDir = childProfile(mainHome)
  assert.deepEqual(installProblems(profileDir, CHILD.bundleOrder, { bundles: true }), [])
  const bundles = bundlesOf(childManifest(mainHome))
  assert.deepEqual(bundles.slice(-CHILD.bundleOrder.length), CHILD.bundleOrder.map((p) => p.name), 'bundles ' + show(bundles))
  for (const dep of CHILD.coreProvides) assertFromOwnBundle(profileDir, CHILD.core, dep)
  assert.ok(fs.existsSync(path.join(installedDir(profileDir, CHILD.beside), TARBALL.manifest)), `${CHILD.beside.name} is not placed beside the bundles`)
  assert.equal(bundles.includes(CHILD.beside.name), false, `${CHILD.beside.name} is a bundle`)
}

/** Run `fn` with the instance's bundled tarball of `pkg` changed by `change(file)`, restoring it afterwards. */
async function withBundledTarball(instanceDir, pkg, change, fn) {
  const file = bundledTarball(instanceDir, pkg)
  const pristine = fs.readFileSync(file)
  try {
    change(file, pristine)
    await fn()
  } finally {
    fs.writeFileSync(file, pristine)
  }
}
const assertRefused = (promise) => assert.rejects(promise, (error) => {
  assert.equal(error?.code, FAILED.code, show({ code: error?.code, message: error?.message }))
  return true
})

export function registerPlacementInstallCases(sdk) {
  // One packed instance for the whole file: its scratch folder goes when the file's last case is done.
  after(() => (packedScratch === undefined ? undefined : removeScratch(packedScratch)))
  let home
  const placed = async () => {
    const p = await packedInstance(sdk)
    assert.ok(home, 'the first placement case did not run')
    return p
  }

  // ---- PINST-ST-01: fresh → fallback placement → skip → disable survives
  relCase(sdk, CASE.id, 'first', 'fresh child profile, registry dead → the bundled fallback places the set: vendor tarballs, dependencies, versions, bundles board, ui, core (core last)', async () => {
    const p = await packedInstance(sdk)
    const mainHome = p.newHome()
    await p.compose(mainHome)
    home = mainHome
    const vendor = path.join(childProfile(mainHome), CHILD.vendorDir)
    for (const pkg of CHILD.specOrder) {
      const copy = path.join(vendor, pkg.tarball)
      assert.ok(fs.existsSync(copy), `no ${CHILD.vendorDir}/${pkg.tarball} (the fallback copies the bundled tarballs there)`)
      assert.ok(fs.readFileSync(copy).equals(fs.readFileSync(bundledTarball(p.instanceDir, pkg))), `${CHILD.vendorDir}/${pkg.tarball} differs from the instance's bundled copy`)
    }
    assertPlaced(p.instanceDir, mainHome)
  }, BUDGET.caseMs)
  relCase(sdk, CASE.id, 'skip', 'second run with all three installed at the instance version → nothing installed: package.json and pnpm-lock.yaml byte-identical', async () => {
    const p = await placed()
    const before = snapshot(home)
    assert.ok(before.manifest, 'no child package.json after the first placement')
    await p.compose(home)
    assert.deepEqual(snapshot(home), before)
  }, BUDGET.caseMs)
  for (const member of CHILD.bundleOrder) {
    relCase(sdk, CASE.id, 'disable ' + member.name, `${member.name} disabled by the owner (bundles edited while the child is down) → the next run keeps it off and the others on (R-BND-02)`, async () => {
      const p = await placed()
      const file = path.join(childProfile(home), CHILD.manifest)
      const original = fs.readFileSync(file)
      const manifest = JSON.parse(original)
      const on = bundlesOf(manifest)
      try {
        manifest.dsh.profile.bundles = on.filter((b) => b !== member.name)
        fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
        await p.compose(home)
        const after = bundlesOf(childManifest(home))
        assert.equal(after.includes(member.name), false, `${member.name} switched back on: ${show(after)}`)
        for (const other of CHILD.bundleOrder.filter((o) => o !== member)) assert.ok(after.includes(other.name), `${other.name} switched off: ${show(after)}`)
      } finally {
        // Back to the owner's previous choice, so the next row starts from the placed state.
        fs.writeFileSync(file, original)
      }
    }, BUDGET.caseMs)
  }

  // ---- PINST-DT-01: the skip rule's "otherwise" rows (one member stale or missing → installed again)
  for (const member of CHILD.bundleOrder) {
    relCase(sdk, CASE.fail, 'stale ' + member.name, `installed ${member.name} at ${CHILD.staleVersion} (just below the instance version) → the next run installs again: all three back at the instance version`, async () => {
      const p = await placed()
      const file = path.join(installedDir(childProfile(home), member), TARBALL.manifest)
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
      fs.writeFileSync(file, JSON.stringify({ ...manifest, version: CHILD.staleVersion }, null, 2))
      await p.compose(home)
      assertPlaced(p.instanceDir, home)
    }, BUDGET.caseMs)
  }
  relCase(sdk, CASE.fail, 'missing installed', `installed ${CHILD.core.name} removed from node_modules → the next run installs it again`, async () => {
    const p = await placed()
    const dir = installedDir(childProfile(home), CHILD.core)
    // Guard the one recursive delete: a package folder directly in the child profile's node_modules.
    if (path.dirname(dir) !== path.join(childProfile(home), TARBALL.nodeModules)) throw new Error('unexpected folder ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
    await p.compose(home)
    assertPlaced(p.instanceDir, home)
  }, BUDGET.caseMs)

  // ---- PINST-DT-01: registry dead and the fallback broken → the start is refused
  for (const [where, offsetOf] of Object.entries(TAMPER.offsets)) {
    relCase(sdk, CASE.fail, 'tampered ' + where, `registry dead, bundled ${TAMPER.target.tarball} with its ${where} byte flipped → ${FAILED.code} (fresh main home)`, async () => {
      const p = await packedInstance(sdk)
      await withBundledTarball(p.instanceDir, TAMPER.target, (file, pristine) => flipByte(file, offsetOf(pristine.length)), () => assertRefused(p.compose(p.newHome())))
    }, BUDGET.caseMs)
  }
  for (const pkg of CHILD.specOrder) {
    relCase(sdk, CASE.fail, 'missing ' + pkg.name, `registry dead, bundled ${pkg.tarball} missing → ${FAILED.code} (fresh main home)`, async () => {
      const p = await packedInstance(sdk)
      await withBundledTarball(p.instanceDir, pkg, (file) => fs.rmSync(file), () => assertRefused(p.compose(p.newHome())))
    }, BUDGET.caseMs)
  }

  // ---- PINST-UC-01: the registry spec path (fishball-ui@<v>, fishball-board@<v>, fishball-core@<v>, in that order)
  caseTest(sdk, CASE.registry, 'main', `a reachable registry: DSH's plugin-manager add of ${CHILD.specOrder.map((p) => `${p.name}@${CHILD.version}`).join(', ')} places the set (no vendor fallback)`, null, LATER.registry)
}
