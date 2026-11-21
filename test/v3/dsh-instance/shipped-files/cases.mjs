/**
 * shippedFiles black-box cases (the "files" exclusion fix, relayed by the lead 2026-11-21): an entry
 * of a manifest's "files" that starts with '!' is an exclusion, as npm pack reads it. The path after
 * '!' (a file or a folder, with or without a trailing '/') and everything under it are left out of
 * the result whatever the order of the positive entries; a nonexistent exclusion is not refused; a
 * sibling that merely shares a name prefix is kept. Real case: fishball-core lists "ui/" and
 * "!ui/tests/".
 *
 * Techniques:
 * - Decision Table SHIP-DT-01: entry kind (folder / file / wildcard) × exclusion (none / folder with
 *   slash / folder without slash / single file / nonexistent / name prefix) × order (exclusion
 *   before / after the positive entries): 3 × 6 × 2 = 36 rules (constants.mjs KINDS, EXCLUSIONS, ORDERS);
 * - Boundary values and equivalence partitions SHIP-EP-01 (constants.mjs EXTRA): exclusion depth
 *   (deeper, equal, parent), a positive entry after the exclusion, lists of only exclusions, several
 *   exclusions, file-name prefixes one character short and one character long;
 * - The kept refusals SHIP-EP-02 (constants.mjs REFUSALS);
 * - Use Case SHIP-UC-01: the real fishball-core checkout.
 *
 * Level: unit over real files. Each case builds its fixture package in a fresh mkdtemp directory
 * under os.tmpdir(), removed after the test. Only the public export shippedFiles is imported.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { caseName, caseTest } from '../../contract/package-boundaries/cases.mjs'
import { EXCLUSIONS, EXTRA, KINDS, MANIFEST, ORDERS, REAL_CORE, REFUSALS, SUBJECT, TEMP_PREFIX, TREE } from './constants.mjs'

const show = (v) => JSON.stringify(v)
const native = (posix) => posix.split('/').join(path.sep)
const shippedFiles = async (...args) => (await import(pathToFileURL(SUBJECT.file).href))[SUBJECT.name](...args)

/** A fresh fixture package (TREE plus a package.json listing `files`), removed after the test; resolves to [root, manifest]. */
function fixture(t, files) {
  const base = fs.realpathSync(os.tmpdir())
  const root = fs.mkdtempSync(path.join(base, TEMP_PREFIX))
  t.after(() => {
    // Guard the one recursive delete: the mkdtemp directory this case created.
    if (path.dirname(root) !== base || !path.basename(root).startsWith(TEMP_PREFIX)) throw new Error('refusing to remove ' + root)
    fs.rmSync(root, { recursive: true, force: true })
  })
  for (const rel of TREE) {
    const file = path.join(root, native(rel))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, rel + '\n')
  }
  const manifest = { name: 'fbtest-shipped-files-fixture', version: '1.0.0', files: [...files] }
  fs.writeFileSync(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2))
  return [root, manifest]
}

/** The result must be exactly package.json plus `expected` (POSIX fixture paths), in any order. */
async function assertShips(t, files, expected) {
  const [root, manifest] = fixture(t, files)
  const got = await shippedFiles(root, manifest)
  assert.ok(Array.isArray(got), 'shippedFiles did not resolve to an array: ' + show(got))
  assert.deepEqual([...got].sort(), [MANIFEST, ...expected.map(native)].sort(), 'files ' + show(files))
}

export function registerShippedFilesCases(sdk) {
  // ============================================================== Decision Table SHIP-DT-01
  for (const { kind, positive, expect } of KINDS) {
    for (const { key, entry, label } of EXCLUSIONS) {
      for (const order of entry === null ? [null] : ORDERS) {
        const files = entry === null ? positive : order === ORDERS[0] ? [entry, ...positive] : [...positive, entry]
        const where = order === null ? '' : ', exclusion ' + order
        caseTest(sdk, 'SHIP-DT-01', `${kind} × ${key}${order ? ' × ' + order : ''}`, `${kind} entry, ${label}${where}: ${show(files)} ships ${show(expect[key])}`, (t) => assertShips(t, files, expect[key]))
      }
    }
  }

  // ============================================================== BVA / EP SHIP-EP-01
  for (const [row, title, files, expected] of EXTRA) {
    caseTest(sdk, 'SHIP-EP-01', row, `${title}: ${show(files)}`, (t) => assertShips(t, files, expected))
  }

  // ============================================================== The kept refusals SHIP-EP-02
  for (const [row, title, files, link, code] of REFUSALS) {
    caseTest(sdk, 'SHIP-EP-02', row, `${title}: ${show(files)} rejects ${code}`, async (t) => {
      const [root, manifest] = fixture(t, files)
      // An absolute link to a real regular file of the fixture: only the link itself is unsafe.
      if (link) fs.symlinkSync(path.join(root, native(TREE[0])), path.join(root, native(link)))
      await assert.rejects(shippedFiles(root, manifest), (error) => {
        assert.equal(error?.code, code, 'error code; error ' + (error?.stack ?? show(error)))
        return true
      })
    })
  }

  // ============================================================== Use Case SHIP-UC-01: the real fishball-core
  const realName = caseName(sdk, 'SHIP-UC-01', 'main', `the real fishball-core (${REAL_CORE.dir}) ships ${REAL_CORE.mustShip} and nothing under ${REAL_CORE.excluded}`)
  if (!fs.existsSync(path.join(REAL_CORE.dir, MANIFEST))) test(realName, { skip: REAL_CORE.skip }, () => {})
  else {
    test(realName, async () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(REAL_CORE.dir, MANIFEST), 'utf8'))
      assert.ok(manifest.files.includes('!' + REAL_CORE.excluded), 'precondition: core lists !' + REAL_CORE.excluded + ': ' + show(manifest.files))
      const got = await shippedFiles(REAL_CORE.dir, manifest)
      assert.ok(got.includes(native(REAL_CORE.mustShip)), REAL_CORE.mustShip + ' is not shipped')
      assert.ok(got.includes(MANIFEST), MANIFEST + ' is not shipped')
      const excluded = native(REAL_CORE.excluded)
      assert.deepEqual(got.filter((f) => f.startsWith(excluded)), [], 'paths under ' + REAL_CORE.excluded + ' shipped')
    })
  }
}
