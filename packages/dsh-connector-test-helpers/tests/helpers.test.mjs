/**
 * The helpers' own behaviour: suite discovery, case naming, the DSH versions a run covers, and the
 * version binding of a repository module. Techniques: EP (discovery partitions, matrix set / unset),
 * BVA (row numbering), regression (a nested package's suites are not its parent's).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { caseName } from '../src/cases.mjs'
import { ENV, RELEASE_MATRIX } from '../src/constants.mjs'
import { currentVersion } from '../src/config.mjs'
import { suiteFiles } from '../src/runner/run.mjs'
import { boundUrl, versionOf } from '../src/sdk.mjs'
import { REPO } from '../src/repo.mjs'

const tree = (files) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'dsh-test-helpers-'))
  for (const [file, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text) }
  return root
}
const rel = (root, files) => files.map((f) => path.relative(root, f).split(path.sep).join('/'))

test('HLP-EP-01 discovery: only *.test.mjs files inside a tests/ folder are suites', (t) => {
  const root = tree({ 'package.json': '{}', 'tests/a.test.mjs': '', 'tests/sub/b.test.mjs': '', 'tests/c.mjs': '', 'src/d.test.mjs': '', 'src/tests/e.test.mjs': '' })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.deepEqual(rel(root, suiteFiles(root)), ['src/tests/e.test.mjs', 'tests/a.test.mjs', 'tests/sub/b.test.mjs'])
})

test('HLP-EP-02 regression: a nested package folder (its own package.json) keeps its suites; the parent does not run them', (t) => {
  // Failed on the first version of suiteFiles, which walked into ui/tests from the parent package.
  const root = tree({ 'package.json': '{}', 'tests/own.test.mjs': '', 'ui/package.json': '{}', 'ui/tests/nested.test.mjs': '' })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.deepEqual(rel(root, suiteFiles(root)), ['tests/own.test.mjs'])
  assert.deepEqual(rel(path.join(root, 'ui'), suiteFiles(path.join(root, 'ui'))), ['tests/nested.test.mjs'])
})

test('HLP-EP-03 discovery: node_modules and dot folders are never searched', (t) => {
  const root = tree({ 'package.json': '{}', 'node_modules/x/tests/a.test.mjs': '', '.runtime/tests/b.test.mjs': '', 'tests/c.test.mjs': '' })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.deepEqual(rel(root, suiteFiles(root)), ['tests/c.test.mjs'])
})

test('HLP-BVA-01 case names: a numeric row reads "row <n>", any other row is used as written', () => {
  assert.equal(caseName('0.2.2-rc.3', 'X-EP-01', 1, 't'), 'X-EP-01 row 1 [SDK 0.2.2-rc.3] t')
  assert.equal(caseName('0.2.2-rc.3', 'X-EP-01', '10 max', 't'), 'X-EP-01 row 10 max [SDK 0.2.2-rc.3] t')
  assert.equal(caseName('0.2.2-rc.3', 'X-UC-01', 'main 2', 't'), 'X-UC-01 main 2 [SDK 0.2.2-rc.3] t')
})

/** The versions a fresh process would cover with `env` (config is read at import time). */
const coveredWith = (env) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
  "import { runVersions } from './src/config.mjs'; console.log(JSON.stringify(runVersions()))"], { cwd: path.join(import.meta.dirname, '..'), env: { ...process.env, ...env }, encoding: 'utf8' }))

test('HLP-EP-04 day to day a run covers the current DSH only', () => {
  const env = { [ENV.matrix]: '' }
  assert.deepEqual(coveredWith(env), [currentVersion()])
})

test('HLP-EP-05 the release matrix covers every listed version, in order', () => {
  const installed = RELEASE_MATRIX.filter((v) => { try { coveredWith({ [ENV.matrix]: v }); return true } catch { return false } })
  assert.ok(installed.length > 0, 'no release-matrix DSH is installed')
  assert.deepEqual(coveredWith({ [ENV.matrix]: installed.join(',') }), installed)
})

test('HLP-EP-06 a matrix naming a DSH that is not installed fails the run instead of silently skipping it', () => {
  assert.throws(() => coveredWith({ [ENV.matrix]: '0.0.0-not-installed' }), /not installed/)
})

test('HLP-EP-07 regression: the current DSH is found under the runner\'s throwaway HOME, and DSH_TEST_CURRENT names it', () => {
  // Failed when config read the shell settings from $HOME, which the runner replaces.
  const v = currentVersion()
  assert.deepEqual(coveredWith({ [ENV.current]: v, [ENV.matrix]: '' }), [v])
})

test('HLP-ST-01 a bound module URL carries its version; a URL outside the repository carries none', () => {
  const url = boundUrl('0.2.2-rc.3', path.join(REPO, 'package.json'))
  assert.equal(versionOf(url), '0.2.2-rc.3')
  assert.equal(versionOf('file:///elsewhere/x.js?dshsdk=0.2.2-rc.3'), undefined)
})