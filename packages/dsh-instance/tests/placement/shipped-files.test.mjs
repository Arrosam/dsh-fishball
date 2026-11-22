/**
 * shippedFiles (src/native-runtime/placement.js; JSDoc: "The files a package ships: its manifest and
 * exactly its `files` entries … A listed entry that is missing means a broken source and is
 * refused") and the "files" exclusion fix fab3837: an entry starting with '!' is an exclusion as npm
 * pack reads it. Real case: fishball-core lists "ui/" and "!ui/tests/" (e07228ff).
 *
 * - Decision table SHIP-DT-01: entry kind (folder / file / wildcard) × exclusion (none / folder with
 *   slash / folder without slash / single file / nonexistent / name prefix) × order (before / after):
 *   3 × (1 + 5 × 2) = 33 rules;
 * - BVA / EP SHIP-EP-01: exclusion depth, a positive entry after the exclusion, only exclusions,
 *   several exclusions, file-name prefixes one character short and long;
 * - SHIP-EP-02: the refusals the fix keeps;
 * - Use case SHIP-UC-01: a fishball-core with core's own files list (a fake; never the real checkout).
 * Regression: FBTEST_PLACEMENT_FROM=<dsh-instance folder> runs these cases against another copy of
 * the module (before-fix.mjs runs them against fab3837^).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { EXCLUSIONS, EXTRA, FAKE_REPO, FIXTURE_NAME, KINDS, MANIFEST, ORDERS, REFUSALS, TREE } from './constants.mjs'
import { fakeFishball, native, placementModule, show, writeFile } from './subject.mjs'

/** A fresh fixture package (TREE plus a package.json listing `files`); resolves to [root, manifest]. */
function fixture(t, files) {
  const root = tempRoot(cleanups(t))
  for (const rel of TREE) writeFile(path.join(root, native(rel)), rel + '\n')
  const manifest = { name: FIXTURE_NAME, version: '1.0.0', files: [...files] }
  writeFile(path.join(root, MANIFEST), manifest)
  return [root, manifest]
}

/** The result is exactly package.json plus `expected`, in any order. */
async function assertShips(t, sdk, files, expected) {
  const { shippedFiles } = await placementModule(sdk)
  const [root, manifest] = fixture(t, files)
  const got = await shippedFiles(root, manifest)
  assert.ok(Array.isArray(got), 'shippedFiles did not resolve to an array: ' + show(got))
  assert.deepEqual([...got].sort(), [MANIFEST, ...expected.map(native)].sort(), 'files ' + show(files))
}

eachSdk((sdk) => {
  for (const { kind, positive, expect } of KINDS) {
    for (const { key, entry, label } of EXCLUSIONS) {
      for (const order of entry === null ? [null] : ORDERS) {
        const files = entry === null ? positive : order === ORDERS[0] ? [entry, ...positive] : [...positive, entry]
        const where = order === null ? '' : ', exclusion ' + order
        caseTest(sdk, 'SHIP-DT-01', `${kind} × ${key}${order ? ' × ' + order : ''}`, `${kind} entry, ${label}${where}: ${show(files)} ships ${show(expect[key])}`, (t) => assertShips(t, sdk, files, expect[key]))
      }
    }
  }

  for (const [part, title, files, expected] of EXTRA) {
    caseTest(sdk, 'SHIP-EP-01', part, `${title}: ${show(files)}`, (t) => assertShips(t, sdk, files, expected))
  }

  for (const [part, title, files, link, code] of REFUSALS) {
    caseTest(sdk, 'SHIP-EP-02', part, `${title}: ${show(files)} rejects ${code}`, async (t) => {
      const { shippedFiles } = await placementModule(sdk)
      const [root, manifest] = fixture(t, files)
      // An absolute link to a real regular file of the fixture: only the link itself is unsafe.
      if (link) fs.symlinkSync(path.join(root, native(TREE[0])), path.join(root, native(link)))
      await assert.rejects(shippedFiles(root, manifest), (error) => {
        assert.equal(error?.code, code, 'error code; error ' + (error?.stack ?? show(error)))
        return true
      })
    })
  }

  // The case fab3837 was found on: a fishball-core whose files list holds "ui/" and "!ui/tests/"
  // (e07228ff) ships ui/ without ui/tests/, and is not refused (a fake core; never the real checkout).
  caseTest(sdk, 'SHIP-UC-01', 'core', `a fishball-core listing ${show(FAKE_REPO.coreFiles)} ships ${FAKE_REPO.mustShip} and nothing under ${FAKE_REPO.excluded}/`, async (t) => {
    const { shippedFiles } = await placementModule(sdk)
    const { core } = fakeFishball(tempRoot(cleanups(t)), { presets: [] })
    const got = await shippedFiles(core, JSON.parse(fs.readFileSync(path.join(core, MANIFEST), 'utf8')))
    assert.ok(got.includes(MANIFEST) && got.includes(native(FAKE_REPO.mustShip)), 'shipped ' + show(got))
    const excluded = native(FAKE_REPO.excluded)
    assert.deepEqual(got.filter((f) => f === excluded || f.startsWith(excluded + path.sep)), [], 'paths under ' + FAKE_REPO.excluded + ' shipped')
  })
})
