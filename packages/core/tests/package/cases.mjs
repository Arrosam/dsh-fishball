/**
 * fishball-core's package area (README.md): what core's own published files say about its place
 * among the packages (HOST-EP-03 rows 1 and 4, R-CORE; R-ARCH-05/08/10, R-BND-01, R-FB-01; DESIGN §20).
 * Unit level, static: core's manifest, its bundle patch as the current DSH parses it, DSH's own
 * bundle inspection of core's folder, and the import specifiers of core's shipped source. No product
 * module is loaded. Technique: EP (each row one partition of "what core may name / ship").
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { importDsh } from 'fishball-test-helpers/dsh'
import { CORE_FILES, coreImports, coreManifest, corePatchRows, insertedRows } from '../support/core-static.mjs'
import { CORE, INSPECT } from './constants.mjs'

const F = CORE.fields
const bare = (specifier) => (specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0])
/** Package names one manifest lists in `fields`. */
const namesIn = (manifest, fields) => fields.flatMap((f) => (Array.isArray(manifest[f]) ? manifest[f] : Object.keys(manifest[f] ?? {})))
/** Whether a row's module `name` is a module of package `pkg` (its name or a subpath of it). */
const isModuleOf = (name, pkg) => typeof name === 'string' && (name === pkg || name.startsWith(pkg + '/'))

/** DSH's own inspection of a local path (the Plugins page's add), in a throwaway profile; nothing is fetched. */
async function dshInspect(dir) {
  const { PluginManager } = await importDsh('dsh-plugin-manager')
  const tmp = fs.realpathSync(os.tmpdir())
  const scratch = await mkdtemp(path.join(tmp, INSPECT.tempPrefix))
  try {
    fs.writeFileSync(path.join(scratch, INSPECT.manifest), JSON.stringify({ name: INSPECT.profileName, dependencies: {} }))
    fs.writeFileSync(path.join(scratch, INSPECT.anchor), JSON.stringify({ dependencies: {} }))
    // Only the fields inspect() reads for a local path; registries are answered empty, so nothing is fetched.
    const self = { profile: { dir: scratch, installAnchor: path.join(scratch, INSPECT.anchor) }, registries: async () => ({ registry: null, fallbackRegistries: [], resolved: null }) }
    return await PluginManager.prototype.inspect.call(self, dir)
  } finally {
    // Guard the one recursive delete: the mkdtemp folder this call made.
    if (path.dirname(scratch) === tmp && path.basename(scratch).startsWith(INSPECT.tempPrefix)) await rm(scratch, { recursive: true, force: true })
  }
}

export function registerPackageCases() {
  const row = (part, title, fn) => caseTest('HOST-EP-03', part, title, fn)
  row(1, "core's manifest names fishball-core, has a dsh bundle and a dsh.client entry (core's own settings page; fishball-ui is its own package since F-UI)", () => {
    const manifest = coreManifest()
    assert.equal(manifest.name, CORE.name)
    assert.ok(manifest[F.dsh]?.bundle, 'no dsh.bundle')
    assert.ok(manifest[F.dsh]?.client && typeof manifest[F.dsh].client === 'object', 'no dsh.client entry')
  })
  row(1, "DSH's own bundle inspection accepts fishball-core as a bundle", async () => {
    const answer = await dshInspect(CORE_FILES.dir)
    assert.notEqual(answer.status, INSPECT.refused, JSON.stringify(answer))
    assert.equal(answer.bundle, true, JSON.stringify(answer))
    assert.equal(answer.name, CORE.name, JSON.stringify(answer))
  })
  // The R-CORE snapshot "empty patch" ended with F-GUARDS, which adds the guard rows (design §5a.2,
  // R-FB-02, R-FB-12). What stays true: the patch never brings the instance into core.
  row(1, "core's cordis.patch.yml carries the F-GUARDS rows and inserts no row or module of the instance", async () => {
    const patches = await corePatchRows()
    assert.ok(Array.isArray(patches) && patches.length > 0, 'the patch is not a non-empty list (F-GUARDS adds the guard rows)')
    const inserted = insertedRows(patches)
    assert.deepEqual(inserted.filter((r) => CORE.neverInserted.includes(r?.id)).map((r) => r.id), [], 'core inserts these rows')
    assert.deepEqual(inserted.filter((r) => isModuleOf(r?.name, CORE.dshSide.instance)).map((r) => `${r.id}: ${r.name}`), [], 'core inserts modules of dsh-instance')
  })
  // SPLIT-SHARED (requirements 1.40): core's library is its own side's fishball-shared, never dsh-connector-shared.
  row(1, 'core depends on fishball-shared (dependencies and bundleDependencies); never on the connector, the instance or dsh-connector-shared', () => {
    const manifest = coreManifest()
    assert.ok(Object.hasOwn(manifest[F.runtime] ?? {}, CORE.shared), 'fishball-shared not in ' + F.runtime)
    assert.ok(F.bundled.some((f) => (manifest[f] ?? []).includes(CORE.shared)), 'fishball-shared not in ' + F.bundled.join('/'))
    const named = namesIn(manifest, [...F.deps, ...F.bundled])
    assert.deepEqual(named.filter((n) => Object.values(CORE.dshSide).includes(n)), [], 'core names a DSH-side package')
  })
  // Re-baselined (F-WIRE, same decision): no module of core imports the DSH side, ./contract included.
  row(1, 'core imports nothing of dsh-agent-connector, dsh-instance or dsh-connector-shared (no ./contract either)', () => {
    assert.deepEqual(coreImports().filter((r) => Object.values(CORE.dshSide).includes(bare(r.specifier))).map((r) => r.file + ': ' + r.specifier), [])
  })
  // Re-baselined (F-WIRE): DESIGN.md §20 deletes `src/slim/**` and the V2 child rows ("V2 was never deployed").
  row(1, 'core ships no file under src/slim/ (DESIGN §20 deletes it)', () => {
    // core ships src/ whole (manifest `files`), so a src/slim/ folder would ship.
    assert.ok(coreManifest().files.some((f) => CORE.retiredFolder.startsWith(f)), 'precondition: core no longer ships src/')
    assert.equal(fs.existsSync(path.join(CORE_FILES.dir, CORE.retiredFolder)), false)
  })
  row(1, `core's patch inserts ${CORE.mainRow.id} (${CORE.mainRow.name}) once beside ${CORE.keptRows.join(', ')}, and none of ${CORE.retiredRows.join(', ')}`, async () => {
    const inserted = insertedRows(await corePatchRows())
    const main = inserted.filter((r) => r?.id === CORE.mainRow.id)
    assert.equal(main.length, 1, 'main rows: ' + JSON.stringify(main))
    assert.equal(main[0].name, CORE.mainRow.name)
    for (const id of CORE.keptRows) assert.equal(inserted.filter((r) => r?.id === id).length, 1, id)
    assert.deepEqual(inserted.filter((r) => CORE.retiredRows.includes(r?.id)).map((r) => r.id), [])
  })
  // HOST-EP-03 row 4, core's half: core's settings page is core's own (its marker ships in core);
  // that the instance ships none of it is dsh-instance's row.
  row(4, "core ships its own settings page (a shipped file renders core's settings page marker)", () => {
    const files = ['client.js', 'client.settings.js'].filter((f) => coreManifest().files.includes(f))
    assert.ok(files.some((f) => fs.readFileSync(path.join(CORE_FILES.dir, f), CORE_FILES.encoding).includes(CORE.corePage)), 'no shipped client file holds ' + CORE.corePage)
  })
}