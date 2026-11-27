/**
 * fishball-test-helpers' own cases: the current-DSH choice, the release matrix, case names, the
 * package catalogue and the independence rule (docs/testing/README.md). Techniques: EP over the
 * version sources and the import kinds, BVA on the case-name row part, DT for the boundary rule
 * (specifier kind × where it points).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { checkFile } from '../boundaries.mjs'
import { caseName } from '../cases.mjs'
import { DSH_VERSION, RELEASE_MATRIX, SUPPORTED, isInstalled, launcherVersion } from '../dsh.mjs'
import { REPO, packageByName, packageOf, packages, testFiles } from '../packages.mjs'

const T = Object.freeze({ id: 'HLP-EP-01', other: 'fishball-taskboard', core: 'fishball-core', ui: 'fishball-ui', self: 'fishball-test-helpers' })

test('HLP-DSH-EP-01 the current DSH is installed and is the launcher\'s unless FBTEST_DSH_VERSION names one', () => {
  assert.ok(isInstalled(DSH_VERSION))
  assert.equal(DSH_VERSION, process.env.FBTEST_DSH_VERSION ?? launcherVersion())
})

test('HLP-DSH-EP-02 the release matrix holds every supported version and the current launcher version, once each', () => {
  for (const v of SUPPORTED) assert.ok(RELEASE_MATRIX.includes(v), v)
  if (launcherVersion()) assert.ok(RELEASE_MATRIX.includes(launcherVersion()))
  assert.equal(new Set(RELEASE_MATRIX).size, RELEASE_MATRIX.length)
})

test('HLP-CASE-BVA-01 case names: a digit row is "row n", any other part as given, an empty part is left out', () => {
  assert.equal(caseName('X-DT-01', 3, 't', '9.9.9'), 'X-DT-01 row 3 [DSH 9.9.9] t')
  assert.equal(caseName('X-DT-01', '0b', 't', '9.9.9'), 'X-DT-01 row 0b [DSH 9.9.9] t')
  assert.equal(caseName('X-UC-01', 'main 2', 't', '9.9.9'), 'X-UC-01 main 2 [DSH 9.9.9] t')
  assert.equal(caseName('X-UC-01', '', 't', '9.9.9'), 'X-UC-01 [DSH 9.9.9] t')
  assert.equal(caseName('X-UC-01', undefined, 't', '9.9.9'), 'X-UC-01 [DSH 9.9.9] t')
})

test('HLP-PKG-EP-01 the catalogue knows every plugin package, fishball-ui nested in fishball-core, and itself', () => {
  for (const name of [T.core, T.ui, T.other, 'fishball-heartbeat', 'fishball-board', 'fishball-amenities', 'fishball-shared', T.self]) assert.ok(packages().has(name), name)
  const core = packageByName(T.core)
  assert.ok(core.excludes.includes(packageByName(T.ui).abs), "fishball-ui's folder is not fishball-core's")
  assert.equal(packageOf(path.join(packageByName(T.ui).abs, 'client.js')).name, T.ui)
  assert.equal(packageOf(path.join(core.abs, 'client.js')).name, T.core)
})

test('HLP-PKG-EP-02 testFiles lists only *.test.mjs under the package\'s tests folder', () => {
  const own = testFiles(packageByName(T.self))
  assert.ok(own.length > 0)
  for (const f of own) assert.match(f, /^packages\/test-helpers\/tests\/.+\.test\.mjs$/)
})

/**
 * Decision table: one probe file inside a package's tests, one source line per row. The rows are data
 * (fixtures/boundary-rows.json), so this file's own imports stay the only ones the rule reads here.
 * Row 12: fishball-core's tests may not reach fishball-ui's files, though they sit inside core's folder.
 */
const RULE_ROWS = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'boundary-rows.json'), 'utf8'))

for (const r of RULE_ROWS) {
  test(`HLP-BND-DT-01 row ${r.row} ${r.why} → ${r.ok ? 'allowed' : 'refused'}`, (t) => {
    const pkg = packageByName(r.pkg ?? T.other)
    fs.mkdirSync(pkg.tests, { recursive: true })
    const dir = mkdtempSync(path.join(pkg.tests, '.probe-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const file = path.join(dir, 'probe.mjs')
    fs.writeFileSync(file, r.spec + '\n')
    const problems = checkFile(pkg, file)
    assert.equal(problems.length === 0, r.ok, JSON.stringify(problems))
  })
}

test('HLP-BND-EP-03 the helpers import no package under test', () => {
  const self = packageByName(T.self)
  assert.deepEqual(self.uses, [], 'fishball-test-helpers declares no dependency')
  assert.ok(fs.existsSync(path.join(REPO, 'package.json')))
})