/**
 * PINST: a PACKED dsh-instance places fishball-amenities, then fishball-core, from its bundled
 * tarballs (README "Placement"). It tries exact npm specs first, falls back to those tarballs
 * offline when the registry fails, and skips installation when both members are already at that
 * version. A disable survives (R-BND-02); if neither install works, PLACEMENT_INSTALL_FAILED.
 *
 * The packed instance is this file's own build (`node scripts/pack.mjs`), its tarball unpacked into
 * scratch; its public seam is the manifest export './native-runtime' `composedProfile({mainHome,
 * installAnchor})`, which lays out and places the child profile and starts no process. While it
 * runs every proxy and the registry point at a dead port, so the registry install fails and the
 * fallback places the set; HOME and npm's cache are scratch folders.
 *
 * Techniques: State Transition (PINST-ST-01: fresh → placed by the fallback → re-run skipped →
 * disabled by the owner → stays off), Decision Table (PINST-DT-01: stale (BVA, the version just
 * below) or missing → installed again; tampered (first/middle/last byte, BVA) or missing tarball →
 * PLACEMENT_INSTALL_FAILED), RFI-F02 (a vendor/ symlink is never written through).
 *
 * One packed instance per SDK, the ST-01 and skip rows sharing one main home in order; each failure
 * row uses a fresh main home and restores the bundled tarball.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before } from 'node:test'
import { pathToFileURL } from 'node:url'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { tempRoot } from '@dsh-instance/test-helpers/scratch'
import { runtimeOf } from '@dsh-instance/test-helpers/sdk'
import { CORE, DEAD, INSTANCE, NOT_STANDALONE, PACK, PROXIES, SET, VERSION, build, flipByte, missingRelease, tail, unpack } from './support/release.mjs'

const skip = missingRelease()
const show = (v) => JSON.stringify(v)
const CHILD = Object.freeze({ profile: Object.freeze(['fishball', 'runtime', 'dsh-home', 'profiles', 'fishball']), record: 'fishball-placement.json', lock: 'pnpm-lock.yaml', vendor: 'vendor' })
const FAILED = 'PLACEMENT_INSTALL_FAILED'
const UNSAFE = 'UNSAFE_DIRECTORY'
const STALE = '1.0.0-alpha.0'
const fileScope = { stack: [], defer(fn) { this.stack.push(fn) } }
let scratch
let packed
before(async () => {
  if (skip) return
  scratch = tempRoot(fileScope)
  const { out, result } = await build(scratch)
  assert.equal(result.code, 0, 'the pack failed: ' + tail(result.output))
  packed = unpack(path.join(out, INSTANCE.tarball), path.join(scratch, 'instance'))
})
after(async () => { for (const fn of fileScope.stack.reverse()) await fn() })

const childProfile = (home) => path.join(home, ...CHILD.profile)
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const manifestOf = (home) => readJson(path.join(childProfile(home), 'package.json'))
const bundlesOf = (home) => manifestOf(home).dsh?.profile?.bundles ?? []
const fishballBundles = (bundles) => bundles.filter((b) => b.startsWith('fishball-'))
const installed = (home, name) => path.join(childProfile(home), 'node_modules', name)
const bundled = (pkg) => path.join(packed, PACK.bundled, pkg.tarball)
let homes = 0
const newHome = () => { const d = path.join(scratch, 'main-home-' + ++homes); fs.mkdirSync(d); return fs.realpathSync(d) }

/** composedProfile of the packed instance, with this process's network dead and HOME/npm cache in scratch. */
async function compose(sdk, mainHome) {
  const exp = readJson(path.join(packed, 'package.json')).exports['./native-runtime']
  const mod = await import(pathToFileURL(path.join(packed, exp)).href)
  const vars = { ...Object.fromEntries(PROXIES.map((v) => [v, DEAD])), npm_config_registry: DEAD + '/', npm_config_userconfig: '/dev/null', npm_config_cache: path.join(scratch, 'npm-cache'), HOME: path.join(scratch, 'home') }
  fs.mkdirSync(vars.HOME, { recursive: true })
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
  Object.assign(process.env, vars)
  try {
    return await mod.composedProfile({ mainHome, installAnchor: path.join(runtimeOf(sdk), '@deepseek-ai', 'dsh', 'package.json') })
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
}
const refused = (promise, code) => assert.rejects(promise, (e) => { assert.equal(e?.code, code, show({ code: e?.code, message: e?.message })); return true })

/** Everything a placed child profile shows (first placement or a re-install). */
function assertPlaced(home) {
  const m = manifestOf(home)
  for (const pkg of SET) {
    assert.ok(Object.hasOwn(m.dependencies ?? {}, pkg.name), 'no dependency ' + pkg.name)
    const dir = installed(home, pkg.name)
    assert.equal(readJson(path.join(dir, 'package.json')).version, VERSION, pkg.name + ' version')
    for (const dep of pkg.libraries) assert.ok(fs.existsSync(path.join(dir, 'node_modules', dep, 'package.json')), dep + ' not in ' + pkg.name)
  }
  const bundles = bundlesOf(home)
  const names = SET.map((p) => p.name)
  assert.deepEqual(fishballBundles(bundles), names, 'the Fishball bundles ' + show(bundles))
  assert.equal(bundles.at(-1), CORE.name, 'core is not last')
  assert.deepEqual(readJson(path.join(childProfile(home), CHILD.record)).placed, names)
}
/** No standalone UI or amenity package at the profile level; nested amenity dependencies are expected. */
function standaloneTraces(home) {
  const p = childProfile(home)
  const m = manifestOf(home)
  const record = fs.existsSync(path.join(p, CHILD.record)) ? fs.readFileSync(path.join(p, CHILD.record), 'utf8') : ''
  return NOT_STANDALONE.flatMap((name) => [
    ...['vendor', 'node_modules'].flatMap((d) => (fs.existsSync(path.join(p, d)) ? fs.readdirSync(path.join(p, d)).filter((f) => f.startsWith(name)).map((f) => d + '/' + f) : [])),
    ...(Object.hasOwn(m.dependencies ?? {}, name) ? ['dependency ' + name] : []),
    ...(bundlesOf(home).includes(name) ? ['bundle ' + name] : []),
    ...(record.includes(name) ? ['record names ' + name] : []),
    ...(JSON.stringify(m).includes(name + '@') ? ['install spec ' + name] : []),
  ])
}
async function withTarball(pkg, change, fn) {
  const file = bundled(pkg)
  const pristine = fs.readFileSync(file)
  try { change(file, pristine); await fn() } finally { fs.writeFileSync(file, pristine) }
}

eachSdk((sdk) => {
  let home
  const placed = () => { assert.ok(home, 'the first placement case did not run'); return home }

  caseTest(sdk, 'PINST-ST-01', 'first', `fresh child profile, registry dead → the bundled fallback places the set: vendor tarballs, dependencies, versions and bundle order`, async () => {
    home = undefined
    const h = newHome()
    await compose(sdk, h)
    home = h
    for (const pkg of SET) {
      const copy = path.join(childProfile(h), CHILD.vendor, pkg.tarball)
      assert.ok(fs.existsSync(copy), 'no vendor/' + pkg.tarball)
      assert.ok(fs.readFileSync(copy).equals(fs.readFileSync(bundled(pkg))), 'vendor/' + pkg.tarball + ' differs from the bundled copy')
    }
    assertPlaced(h)
  }, { skip })
  caseTest(sdk, 'PINST-SHELVE', 'first', `after the first placement the child profile holds no standalone ${NOT_STANDALONE.join(' or ')} (vendor, node_modules, dependencies, bundles, ${CHILD.record}, install spec)`, () => {
    assert.deepEqual(standaloneTraces(placed()), [])
  }, { skip })
  caseTest(sdk, 'PINST-ST-01', 'skip', 'second run with the set installed at the instance version → nothing installed: package.json and pnpm-lock.yaml byte-identical', async () => {
    const h = placed()
    const bytes = () => ['package.json', CHILD.lock].map((f) => fs.readFileSync(path.join(childProfile(h), f)))
    const before = bytes()
    await compose(sdk, h)
    bytes().forEach((b, i) => assert.ok(b.equals(before[i]), ['package.json', CHILD.lock][i] + ' changed'))
    assert.deepEqual(standaloneTraces(h), [], 'after the second run')
  }, { skip })
  caseTest(sdk, 'PINST-ST-01', 'disable ' + CORE.name, `${CORE.name} disabled by the owner (bundles edited while the child is down) → the next run keeps it off and the other member on (R-BND-02)`, async () => {
    const h = placed()
    const file = path.join(childProfile(h), 'package.json')
    const original = fs.readFileSync(file)
    try {
      const m = JSON.parse(original)
      m.dsh.profile.bundles = m.dsh.profile.bundles.filter((b) => b !== CORE.name)
      fs.writeFileSync(file, JSON.stringify(m, null, 2))
      await compose(sdk, h)
      const bundles = fishballBundles(bundlesOf(h))
      assert.deepEqual(bundles, SET.filter((p) => p !== CORE).map((p) => p.name), 'the enabled Fishball bundles ' + show(bundles))
    } finally { fs.writeFileSync(file, original) }
  }, { skip })
  caseTest(sdk, 'PINST-DT-01', 'stale ' + CORE.name, `installed ${CORE.name} at ${STALE} (just below the instance version) → the next run installs again: the set back at the instance version`, async () => {
    const h = placed()
    const file = path.join(installed(h, CORE.name), 'package.json')
    fs.writeFileSync(file, JSON.stringify({ ...readJson(file), version: STALE }, null, 2))
    await compose(sdk, h)
    assertPlaced(h)
  }, { skip })
  caseTest(sdk, 'PINST-DT-01', 'missing installed', `installed ${CORE.name} removed from node_modules → the next run installs it again`, async () => {
    const h = placed()
    const dir = installed(h, CORE.name)
    assert.equal(path.dirname(dir), path.join(childProfile(h), 'node_modules'), 'unexpected folder ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
    await compose(sdk, h)
    assertPlaced(h)
  }, { skip })
  for (const [where, at] of Object.entries(PACK.offsets)) {
    caseTest(sdk, 'PINST-DT-01', 'tampered ' + where, `registry dead, bundled ${CORE.tarball} with its ${where} byte flipped → ${FAILED} (fresh main home)`, async () => {
      await withTarball(CORE, (file, pristine) => flipByte(file, at(pristine.length)), () => refused(compose(sdk, newHome()), FAILED))
    }, { skip })
  }
  caseTest(sdk, 'PINST-DT-01', 'missing ' + CORE.name, `registry dead, bundled ${CORE.tarball} missing → ${FAILED} (fresh main home)`, async () => {
    await withTarball(CORE, (file) => fs.rmSync(file), () => refused(compose(sdk, newHome()), FAILED))
  }, { skip })
  caseTest(sdk, 'RFI-F02', 'vendor symlink', `F02 the fallback's vendor/ is a symlink to an outside folder with a same-named tarball → ${UNSAFE}; the outside file keeps its bytes`, async () => {
    const h = newHome()
    await compose(sdk, h)
    const profile = childProfile(h)
    const vendor = path.join(profile, CHILD.vendor)
    const outside = path.join(scratch, 'outside-vendor-' + path.basename(h))
    fs.mkdirSync(outside)
    const planted = 'fbtest outside tarball: must not change'
    for (const pkg of SET) fs.writeFileSync(path.join(outside, pkg.tarball), planted)
    assert.equal(path.dirname(vendor), profile)
    fs.rmSync(vendor, { recursive: true, force: true })
    fs.symlinkSync(outside, vendor)
    const file = path.join(installed(h, CORE.name), 'package.json')
    fs.writeFileSync(file, JSON.stringify({ ...readJson(file), version: STALE }, null, 2))
    await refused(compose(sdk, h), UNSAFE)
    for (const pkg of SET) assert.equal(fs.readFileSync(path.join(outside, pkg.tarball), 'utf8'), planted, pkg.tarball + ' outside the profile changed')
    assert.deepEqual(fs.readdirSync(outside).sort(), SET.map((p) => p.tarball).sort(), 'the outside folder changed')
  }, { skip })
  caseTest(sdk, 'PINST-UC-01', 'main', `a reachable registry: DSH's plugin-manager add of ${SET.map((p) => p.name + '@<v>').join(', ')} places the set (no vendor fallback)`, () => {}, { skip: 'REL-PUBLISH: the registry spec path needs both hosted bundles published at the instance version; nothing is published, and this package runs offline' })
})
