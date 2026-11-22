/**
 * HOST-EP-03 row 7 (which rows a hosted child holds from core) and the placed set, with the REAL
 * fishball-core of the sibling dsh-fishball checkout: its bundle patch as each SDK's own
 * dsh-app-boot parses it, and what the instance's `composedProfile` places in the child profile.
 *
 * Re-baselined for the unified bundle (this repo 8fdd0ef "place unified fishball-core bundle",
 * PLACEMENT.retiredBundle fishball-ui; dsh-fishball 117cb2a2 "Combine fishball-core + fishball-ui
 * components"): the Fishball page, Recommended tab and child-plugins rows are core's own rows now,
 * each a path row into its own ui/ sub-package. The placed set is fishball-core only.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups } from '@dsh-instance/test-helpers/scratch'
import { missingSibling } from '@dsh-instance/test-helpers/siblings'
import { composeChild, coreDir, corePatch, insertedBy, nearestManifestDir, rowFile } from './support/compose.mjs'
import { CORE_ROWS, SET } from './support/constants.mjs'

const skip = missingSibling('fishball')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

eachSdk((sdk) => {
  caseTest(sdk, 'HOST-EP-03', 7, "core's patch has no path row whose nearest package.json is fishball-core's, except its guards row fishball-core-guards", async () => {
    const own = fs.realpathSync(coreDir())
    const into = insertedBy(await corePatch(sdk)).filter((r) => rowFile(r.name) !== null && nearestManifestDir(rowFile(r.name)) === own).map((r) => r.id)
    assert.deepEqual(into, [CORE_ROWS.guardsRow])
  }, { skip })

  // OUTDATED (8fdd0ef / dsh-fishball 117cb2a2): was "core's patch inserts neither fishball-page nor
  // fishball-recommend-plugins (they are fishball-ui's since F-UI)". fishball-ui merged into core.
  caseTest(sdk, 'HOST-EP-03', 7, "core's patch inserts the Fishball UI rows (fishball-page, fishball-recommend-plugins, fishball-child-plugins) as path rows into their own ui/ packages (unified bundle, 8fdd0ef)", async () => {
    const rows = insertedBy(await corePatch(sdk))
    const own = fs.realpathSync(coreDir())
    for (const id of CORE_ROWS.uiPackageRows) {
      const row = rows.find((r) => r.id === id)
      assert.ok(row, "core's patch has no " + id + ' row')
      const file = rowFile(row.name)
      assert.ok(file, id + ' is not a path row: ' + row.name)
      const dir = nearestManifestDir(file)
      assert.notEqual(dir, own, id + " resolves to core's own manifest")
      assert.ok(dir.startsWith(own + path.sep), id + ' points outside core: ' + dir)
    }
  }, { skip })

  caseTest(sdk, 'HOST-EP-03', 7, `core's patch inserts no slim child row (${CORE_ROWS.slim.join(', ')}) and its main row ${CORE_ROWS.main.id} is the ${CORE_ROWS.main.name} subpath`, async () => {
    const rows = insertedBy(await corePatch(sdk))
    assert.deepEqual(rows.filter((r) => CORE_ROWS.slim.includes(r.id)).map((r) => r.id), [])
    assert.deepEqual(rows.filter((r) => r.id === CORE_ROWS.main.id).map((r) => r.name), [CORE_ROWS.main.name])
  }, { skip })

  // Was TODO I-HOST "a hosted child places fishball-ui": withdrawn by 8fdd0ef (fishball-ui retired;
  // its rows are core's). What holds now: the child holds core only, core last, nothing of fishball-ui.
  caseTest(sdk, 'HOST-EP-03', 7, 'a hosted child places fishball-core only (core last in the bundles), and no fishball-ui or fishball-board copy, dependency, bundle or record entry (8fdd0ef)', async (t) => {
    const c = await composeChild(sdk, cleanups(t))
    const manifest = readJson(path.join(c.profile, 'package.json'))
    const bundles = manifest.dsh.profile.bundles
    assert.deepEqual(bundles.filter((b) => b.startsWith('fishball-')), [...SET.placed])
    assert.equal(bundles.at(-1), SET.placed.at(-1), 'core is not last: ' + JSON.stringify(bundles))
    const record = readJson(path.join(c.profile, 'fishball-placement.json'))
    assert.deepEqual(record.placed, [...SET.placed])
    for (const gone of [SET.retired, SET.shelved]) {
      for (const dir of ['vendor', 'node_modules']) assert.equal(fs.existsSync(path.join(c.profile, dir, gone)), false, gone + ' in ' + dir)
      assert.equal(Object.hasOwn(manifest.dependencies ?? {}, gone), false, gone + ' is a dependency')
    }
  }, { skip })
})
