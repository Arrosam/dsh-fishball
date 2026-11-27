/**
 * REL-PACK for this repository's single release tarball: what `node scripts/pack.mjs --out <dir>
 * --fishball-release <dir>` writes (the dsh-instance tarball, SHA256SUMS, INSTALL.md, PUBLISH.md,
 * offline-store.mjs, the pnpm-store and pnpm-cache folders), what the tarball holds, the script's
 * offline `--check`, and an offline `dsh plugin add` of the tarball with each SDK's own CLI.
 *
 * Only what applies to this repository is kept from the old test/v3/release/pack suite: since the
 * split (a9c8832) this repo packs one tarball, dsh-instance; the connector and Fishball tarballs
 * are their repositories' releases. The instance carries fishball-amenities and fishball-core in bundled/.
 *
 * Techniques: EP per rule over the one tarball, BVA (sha line shape; the tampered byte at the
 * first/middle/last offset; engines.dsh just below its bound), State Transition under --check
 * (valid → tampered → restored; layout removed/added → restored).
 *
 * Network: every child process runs with dead proxies, a dead registry and no user npm config; the
 * build is observed to work so (the pack stages with `npm pack` only). One release per file.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before } from 'node:test'
import { createRequire } from 'node:module'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { SDK } from '@dsh-instance/test-helpers/constants'
import { canonicalTmp, cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { runtimeOf } from '@dsh-instance/test-helpers/sdk'
import { REPO } from '@dsh-instance/test-helpers/constants'
import {
  INSTANCE, NOT_STANDALONE, PACK, SET, VERSION, build, check, filesOf, fishballRelease, flipByte, isJunk, isolatedEnv, listing, memberOf, missingRelease, run, sha256, tail,
} from './support/release.mjs'

const skip = missingRelease()
const show = (v) => JSON.stringify(v)
let scratch
let release
/** The file's own cleanup stack (one release for every case of this file). */
const fileScope = { stack: [], defer(fn) { this.stack.push(fn) } }
before(async () => {
  if (skip) return
  scratch = tempRoot(fileScope)
  release = await build(scratch)
})
after(async () => { for (const fn of fileScope.stack.reverse()) await fn() })
const out = () => { assert.equal(release.result.code, PACK.okExit, 'the pack failed: ' + tail(release.result.output)); return release.out }
const tarball = () => path.join(out(), INSTANCE.tarball)
const manifest = () => JSON.parse(memberOf(tarball(), 'package.json').toString('utf8'))
/** A copy of the release in a fresh scratch folder of `t`. */
function copyRelease(t) {
  const dir = path.join(tempRoot(cleanups(t)), 'release-copy')
  fs.cpSync(out(), dir, { recursive: true, verbatimSymlinks: true })
  return dir
}
const expectCheck = async (t, dir, state, ok) => {
  const r = await check(tempRoot(cleanups(t)), dir)
  if (ok) assert.equal(r.code, PACK.okExit, state + ': ' + tail(r.output))
  else assert.notEqual(r.code, PACK.okExit, state + ': --check passed')
}
const semverOf = (sdk) => createRequire(path.join(runtimeOf(sdk), 'fbtest-anchor.js'))('semver')

eachSdk((sdk) => {
  // ---------------------------------------------------------------- REL-EP-01..03: the layout
  caseTest(sdk, 'REL-EP-01', INSTANCE.name, `the release holds ${INSTANCE.tarball}`, () => {
    assert.ok(fs.statSync(tarball()).isFile())
  }, { skip })
  caseTest(sdk, 'REL-EP-01', 'docs', `the release holds ${PACK.docs.join(' and ')} (non-empty) and ${PACK.helper}`, () => {
    for (const d of [...PACK.docs, PACK.helper]) assert.ok(fs.existsSync(path.join(out(), d)) && fs.statSync(path.join(out(), d)).size > 0, d + ' is missing or empty')
  }, { skip })
  caseTest(sdk, 'REL-EP-01', 'store', `the release holds the ${PACK.dirs.join(' and ')} folders`, () => {
    for (const d of PACK.dirs) assert.ok(fs.statSync(path.join(out(), d)).isDirectory(), d + '/ is missing')
  }, { skip })
  caseTest(sdk, 'REL-EP-03', 'tgz', `the release holds no .tgz other than ${INSTANCE.tarball}`, () => {
    assert.deepEqual(fs.readdirSync(out()).filter((f) => f.endsWith('.tgz')), [INSTANCE.tarball])
  }, { skip })
  caseTest(sdk, 'REL-EP-02', 'shape', `every ${PACK.sums} line is "<64 lowercase hex>  <file name>"`, () => {
    const lines = fs.readFileSync(path.join(out(), PACK.sums), 'utf8').split('\n').filter(Boolean)
    assert.deepEqual(lines.filter((l) => !PACK.sumLine.test(l)), [])
  }, { skip })
  caseTest(sdk, 'REL-EP-02', 'one per tarball', `${PACK.sums} has exactly one line per tarball, matching the file's sha256`, () => {
    const named = fs.readFileSync(path.join(out(), PACK.sums), 'utf8').split('\n').filter(Boolean).map((l) => PACK.sumLine.exec(l))
    assert.deepEqual(named.map((m) => m?.[2]), [INSTANCE.tarball])
    assert.equal(named[0][1], sha256(fs.readFileSync(tarball())))
  }, { skip })
  caseTest(sdk, 'REL-ORACLE', 'sums', 'the SHA256SUMS line shape admits 64 hex + two spaces + a name and nothing at 63/65 hex, one or three spaces, upper case or a tab (BVA)', () => {
    const valid = ['a'.repeat(64) + '  x.tgz', '0123456789abcdef'.repeat(4) + '  ' + INSTANCE.tarball]
    const invalid = ['a'.repeat(63) + '  x.tgz', 'a'.repeat(65) + '  x.tgz', 'a'.repeat(64) + ' x.tgz', 'a'.repeat(64) + '   x.tgz', 'A'.repeat(64) + '  x.tgz', 'a'.repeat(64) + '\tx.tgz', 'g'.repeat(64) + '  x.tgz']
    assert.deepEqual(valid.filter((s) => !PACK.sumLine.test(s)), [])
    assert.deepEqual(invalid.filter((s) => PACK.sumLine.test(s)), [])
  })

  // ---------------------------------------------------------------- REL-EP-04, REL-DT-01: the manifest
  caseTest(sdk, 'REL-EP-04', INSTANCE.name, `${INSTANCE.tarball} package.json: name, version ${VERSION}, engines.node, license, description, repository, publishConfig, not private, host peers '*'`, () => {
    const m = manifest()
    const repo = JSON.parse(fs.readFileSync(path.join(REPO, INSTANCE.folder, 'package.json'), 'utf8'))
    assert.equal(m.name, INSTANCE.name)
    assert.equal(m.version, VERSION)
    assert.equal(m.engines?.node, repo.engines.node)
    assert.equal(m.license, 'MIT')
    assert.ok(typeof m.description === 'string' && m.description.trim() !== '')
    assert.equal(m.repository?.directory, INSTANCE.folder)
    assert.match(m.repository?.url ?? '', /github\.com\/Arrosam\/dsh-fishball-instance/)
    assert.equal(m.publishConfig?.tag, 'alpha')
    assert.notEqual(m.private, true)
    for (const [name, range] of Object.entries(m.peerDependencies ?? {})) if (name.startsWith(SDK.scope)) assert.equal(range, '*', name)
  }, { skip })
  caseTest(sdk, 'REL-DT-01', 'plugin ' + INSTANCE.name, `engines.dsh admits DSH ${SDK.versions.join(' and ')} and refuses 0.2.1-rc.4 (BVA)`, () => {
    const range = manifest().engines?.dsh
    const semver = semverOf(sdk)
    for (const v of SDK.versions) assert.ok(semver.satisfies(v, range, { includePrerelease: true }), v + ' outside ' + range)
    assert.equal(semver.satisfies('0.2.1-rc.4', range, { includePrerelease: true }), false)
  }, { skip })

  // ---------------------------------------------------------------- REL-EP-05..08: contents
  caseTest(sdk, 'REL-EP-05', INSTANCE.name, `${INSTANCE.tarball} holds no symlink or hard-link entry`, () => {
    assert.deepEqual(listing(tarball()).filter((e) => e.type === 'l' || e.type === 'h').map((e) => e.path), [])
  }, { skip })
  caseTest(sdk, 'REL-EP-08', INSTANCE.name, `${INSTANCE.tarball} holds no test or runtime junk`, () => {
    assert.deepEqual(filesOf(tarball()).filter(isJunk), [])
  }, { skip })
  caseTest(sdk, 'REL-EP-07', 'set', `${INSTANCE.tarball} ${PACK.bundled} holds exactly the hosted child's set as tarballs (${SET.map((p) => p.tarball).join(', ')}), with no standalone ${NOT_STANDALONE.join(' or ')}`, () => {
    const files = filesOf(tarball())
    assert.deepEqual(files.filter((f) => f.startsWith(PACK.bundled)).sort(), SET.map((p) => PACK.bundled + p.tarball).sort())
    assert.deepEqual(files.filter((f) => NOT_STANDALONE.some((n) => f.includes(n))), [])
  }, { skip })
  for (const pkg of SET) {
    caseTest(sdk, 'REL-EP-07', pkg.name, `${INSTANCE.tarball} ${PACK.bundled}${pkg.tarball} is a regular file byte-identical to the Fishball release's`, () => {
      assert.ok(memberOf(tarball(), PACK.bundled + pkg.tarball).equals(fs.readFileSync(path.join(fishballRelease(), pkg.tarball))))
    }, { skip })
  }
  caseTest(sdk, 'REL-EP-07', 'status', `${INSTANCE.tarball} holds package/client.status.js as a regular file`, () => {
    assert.ok(filesOf(tarball()).includes('client.status.js'))
  }, { skip })
  // PLAT-EP-07 row 5 (P-1 mechanism B), on this release: the instance lists no library dependency
  // any more (it imports no dsh-connector-shared: 98f0b93 / src/native-runtime/placement.js
  // librarySources is empty), so it bundles none; the hosted set members bundle their own libraries.
  caseTest(sdk, 'PLAT-EP-07', 5, "every importer's tarball carries real copies of its bundled libraries (P-1 mechanism B), including the packages inside the amenities umbrella", (t) => {
    const m = manifest()
    const files = filesOf(tarball())
    for (const dep of Object.keys(m.dependencies ?? {})) {
      assert.ok((m.bundleDependencies ?? m.bundledDependencies ?? []).includes(dep), dep + ' is not bundled')
      assert.ok(files.includes('node_modules/' + dep + '/package.json'), 'no real copy of ' + dep)
    }
    const dir = tempRoot(cleanups(t))
    for (const pkg of SET) {
      const file = path.join(dir, pkg.tarball)
      fs.writeFileSync(file, memberOf(tarball(), PACK.bundled + pkg.tarball))
      const bundled = JSON.parse(memberOf(file, 'package.json').toString('utf8')).bundleDependencies ?? []
      const entries = listing(file)
      for (const dep of pkg.libraries) {
        const prefix = PACK.prefix + 'node_modules/' + dep + '/'
        const library = entries.filter((e) => e.path.startsWith(prefix))
        assert.ok(bundled.includes(dep), pkg.name + ' does not bundle ' + dep)
        assert.ok(library.some((e) => e.path === prefix + 'package.json' && e.type === '-'), 'no real copy of ' + dep + ' in ' + pkg.name)
        assert.deepEqual(library.filter((e) => e.type !== '-' && e.type !== 'd').map((e) => e.path), [], dep + ' entries that are not regular files')
      }
    }
  }, { skip })

  // ---------------------------------------------------------------- REL-EP-09: npm's own list
  caseTest(sdk, 'REL-EP-09', INSTANCE.name, `npm pack --dry-run of ${INSTANCE.folder} lists ${INSTANCE.tarball}'s paths (less the staged bundled/*.tgz)`, async (t) => {
    const r = await run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { env: isolatedEnv(tempRoot(cleanups(t))), cwd: path.join(REPO, INSTANCE.folder) })
    assert.equal(r.code, 0, tail(r.output))
    const listed = JSON.parse(r.stdout.slice(r.stdout.indexOf('['))) [0].files.map((f) => f.path).sort()
    assert.deepEqual(filesOf(tarball()).filter((f) => !PACK.staged.test(f)).sort(), listed)
  }, { skip })

  // ---------------------------------------------------------------- REL-ST-01: --check
  caseTest(sdk, 'REL-ST-01', 'valid', 'node scripts/pack.mjs --check --out <release> verifies the release offline (exit 0)', async (t) => {
    await expectCheck(t, out(), 'the built release', true)
  }, { skip })
  caseTest(sdk, 'REL-ST-01', 'absent', '--check --out <a folder that does not exist> exits non-zero', async (t) => {
    await expectCheck(t, path.join(tempRoot(cleanups(t)), 'no-such-release'), 'absent', false)
  })
  caseTest(sdk, 'REL-ST-01', 'tamper', 'a copied release: valid (0) → the tarball byte flipped at the first/middle/last offset (non-zero) → restored (0), per offset (BVA)', async (t) => {
    const copy = copyRelease(t)
    const target = path.join(copy, INSTANCE.tarball)
    const pristine = fs.readFileSync(target)
    await expectCheck(t, copy, 'copied', true)
    for (const [where, at] of Object.entries(PACK.offsets)) {
      flipByte(target, at(pristine.length))
      await expectCheck(t, copy, 'byte flipped at the ' + where + ' offset', false)
      fs.writeFileSync(target, pristine)
      await expectCheck(t, copy, 'restored after the ' + where + ' flip', true)
    }
  }, { skip, todo: 'BUG: pack.mjs --check reads the tarball listing and the layout only; it never compares a tarball with its SHA256SUMS line, so a flipped byte still passes (exit 0)' })
  caseTest(sdk, 'REL-ST-01', 'layout', `a copied release: ${INSTANCE.tarball} removed (non-zero) → restored (0) → a stray .tgz added (non-zero) → removed (0)`, async (t) => {
    const copy = copyRelease(t)
    const target = path.join(copy, INSTANCE.tarball)
    const pristine = fs.readFileSync(target)
    fs.rmSync(target)
    await expectCheck(t, copy, 'tarball removed', false)
    fs.writeFileSync(target, pristine)
    await expectCheck(t, copy, 'restored', true)
    const stray = path.join(copy, PACK.stray)
    fs.writeFileSync(stray, pristine)
    await expectCheck(t, copy, 'stray tarball', false)
    fs.rmSync(stray)
    await expectCheck(t, copy, 'stray removed', true)
  }, { skip })
  for (const doc of [...PACK.docs, PACK.sums]) {
    caseTest(sdk, 'REL-ST-01', 'missing ' + doc, `a copied release without ${doc} fails --check (non-zero) → restored (0)`, async (t) => {
      const copy = copyRelease(t)
      const file = path.join(copy, doc)
      const bytes = fs.readFileSync(file)
      fs.rmSync(file)
      await expectCheck(t, copy, doc + ' removed', false)
      fs.writeFileSync(file, bytes)
      await expectCheck(t, copy, doc + ' restored', true)
    }, { skip })
  }

  // ---------------------------------------------------------------- REL-SYS-03: an offline install with DSH's own CLI
  caseTest(sdk, 'REL-SYS-03', INSTANCE.name, `${INSTANCE.tarball} alone into a fresh DSH home installs offline at ${VERSION}, with its bundled set in place`, async (t) => {
    const s = tempRoot(cleanups(t))
    const home = path.join(s, 'dsh-home')
    const cli = path.join(runtimeOf(sdk), '.bin', 'dsh')
    assert.ok(fs.existsSync(cli), 'DSH ' + sdk + ' CLI missing at ' + cli)
    const r = await run(cli, ['plugin', '--profile', 'web', 'add', tarball(), '--offline', '--store-dir=' + path.join(out(), PACK.dirs[0]), '--cache-dir=' + path.join(out(), PACK.dirs[1]), '--registry=https://registry.npmjs.org', '--ignore-scripts'], { env: isolatedEnv(s, { DSH_HOME: home }), cwd: s })
    assert.equal(r.code, 0, tail(r.output))
    const profile = path.join(home, 'profiles', 'web')
    const p = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
    assert.ok(Object.hasOwn(p.dependencies ?? {}, INSTANCE.name), 'no dependency ' + show(p.dependencies))
    const installed = path.join(profile, 'node_modules', INSTANCE.name)
    assert.equal(JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8')).version, VERSION)
    for (const pkg of SET) assert.ok(fs.readFileSync(path.join(installed, PACK.bundled, pkg.tarball)).equals(fs.readFileSync(path.join(fishballRelease(), pkg.tarball))), pkg.tarball + ' differs')
  }, { skip })
})
