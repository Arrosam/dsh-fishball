import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { INSTALL_SETS, PACKAGES, VERSION } from '../../../../scripts/release/constants.mjs'
import { CORE, runtimeOf } from '../../fishball-core/package/constants.mjs'
import { insertedRows } from '../../fishball-core/package/static.mjs'
import { CONSULTANT, LIBRARY, UMBRELLA } from './constants.mjs'

const COLLECTION = 'amenities'
const HOST = '0.2.2-rc.1'
const EXPECTED_ROW = { id: CONSULTANT.name, name: CONSULTANT.name, config: {} }
const ROOT = new URL('../../../../', import.meta.url)
const manifest = async (dir) => JSON.parse(await readFile(new URL('package.json', dir), 'utf8'))
const packageDir = (folder) => new URL(folder + '/', ROOT)

async function patchRows(dir, pkg) {
  const patch = pkg.dsh?.bundle?.patch
  assert.ok(patch, pkg.name + ' must declare its DSH patch')
  const { loadOverlayPatches } = await import(pathToFileURL(path.join(runtimeOf(HOST), CORE.patchLoader)).href)
  return insertedRows(loadOverlayPatches(CORE.patchLabel, fileURLToPath(new URL(patch, dir))))
}

const collectionDir = packageDir('packages/' + UMBRELLA.folder)
const consultantDir = packageDir(CONSULTANT.folder)

test('collection pins and bundles the consultant at the batch version', async () => {
  const collection = await manifest(collectionDir)
  assert.equal(collection.dependencies?.[CONSULTANT.name], VERSION)
  assert.equal(collection.bundleDependencies?.filter((name) => name === CONSULTANT.name).length, 1)
  assert.equal(collection.version, VERSION)
  const own = await manifest(consultantDir)
  assert.equal(own.name, CONSULTANT.name)
  assert.equal(own.version, VERSION)
  assert.equal(own.dependencies?.[LIBRARY.name], VERSION)
  assert.ok(own.bundleDependencies?.includes(LIBRARY.name))
  const root = await manifest(ROOT)
  assert.ok(root.workspaces.includes(CONSULTANT.folder))
})

test('the standalone and collection patches insert the same single consultant row', async () => {
  const carried = (await patchRows(collectionDir, await manifest(collectionDir)))
    .filter((row) => row.id === CONSULTANT.name || row.name === CONSULTANT.name)
  assert.deepEqual(carried, [EXPECTED_ROW])
  const own = await patchRows(consultantDir, await manifest(consultantDir))
  assert.deepEqual(own, carried)
})

test('release stages the standalone consultant before the collection that bundles it', () => {
  const member = PACKAGES.findIndex((pkg) => pkg.key === CONSULTANT.key)
  const collection = PACKAGES.findIndex((pkg) => pkg.key === COLLECTION)
  assert.ok(member !== -1 && member < collection, 'consultant must precede amenities in publish order')
  assert.equal(PACKAGES[member].folder, CONSULTANT.folder)
  assert.deepEqual(INSTALL_SETS[CONSULTANT.key], [CONSULTANT.key])
  assert.deepEqual(INSTALL_SETS[COLLECTION], [COLLECTION])
})
