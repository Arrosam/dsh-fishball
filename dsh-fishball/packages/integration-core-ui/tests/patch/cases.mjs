/**
 * fishball-ui's rows as fishball-core's bundle patch carries them, read, composed and evaluated by the
 * current DSH (old test/v3/fishball-ui/package rows needing both packages: UI-BVA-01 inserted, UI-UC-06
 * rows, UI-DT-01, UI-EP-03, UI-EP-02 reverse, UI-UC-07 E1, UI-UC-08, EFIX3-UI-*, NOCORE-*). fishball-ui
 * has no patch of its own (117cb2a2): whether its rows exist and what they say is decided only by core's
 * file, so every row here reads the two packages together.
 *
 * Techniques: EP (startedBundles lists; overlays), DT (EFIX3-UI-DT-01: child row / standalone / no
 * profileContext), BVA (empty lists), a drift check (the notice version in DSH's own welcome step; ui-seam
 * against core's contracts), composition (DSH's shipped layers, core's patch, the owner's layer).
 * Level: unit and integration (DSH's patch loader, composer and Loader evaluator; core's client.js
 * run in fishball-test-helpers' browser sandbox).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createBrowserSandbox } from 'fishball-test-helpers/browser-sandbox'
import { caseTest } from 'fishball-test-helpers/cases'
import { dshPackageDir } from 'fishball-test-helpers/dsh'
import * as CONTRACTS from 'fishball-core/contracts'
import * as SEAM from 'fishball-shared/ui-seam'
import { NAME, dirOf, fileOf, manifestOf } from '../support/packages.mjs'
import { composedWith, corePatch, findRows, insertedOf, profileContextOf, resolvedWith, rowFile, rowOps } from '../support/dsh-patch.mjs'
import { CORE_CLIENT, CORE_SPLIT, NOTICE, OVERLAYS, ROWS, SEAM_DRIFT, STARTED } from './constants.mjs'

const show = (v) => JSON.stringify(v)
const DEP_FIELDS = Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies', 'bundleDependencies', 'bundledDependencies'])
const SOURCE = /\.(?:c|m)?js$/
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
const namesIn = (manifest) => DEP_FIELDS.flatMap((f) => { const v = manifest?.[f]; return Array.isArray(v) ? v : Object.keys(v ?? {}) })
const noticeOp = async () => {
  const ops = rowOps(await corePatch()).filter((op) => op.id === NOTICE.row)
  assert.equal(ops.length, 1, `core's patch has ${ops.length} ${NOTICE.row} ops`)
  return ops[0]
}
const resolvedVersion = async (profileContext) => (await resolvedWith((await noticeOp()).config, profileContext))?.[NOTICE.field]
const hostedOverlays = OVERLAYS.find(([, , child]) => child)[1]

/** Every shipped JS file of core's own folder (fishball-ui's ui/ and tests/ excluded: not core's code). */
function coreSources() {
  const dir = dirOf(NAME.core)
  const files = (manifestOf(NAME.core).files ?? []).filter((f) => !f.startsWith('!'))
  const out = []
  const walk = (abs) => {
    const rel = path.relative(dir, abs).split(path.sep)
    if (rel[0] === 'ui' || rel.includes('tests') || rel.includes('node_modules')) return
    if (fs.statSync(abs).isDirectory()) { for (const e of fs.readdirSync(abs)) walk(path.join(abs, e)); return }
    if (SOURCE.test(abs)) out.push(abs)
  }
  for (const f of files) { const abs = path.join(dir, f); if (fs.existsSync(abs)) walk(abs) }
  return out
}

export function registerPatchCases() {
  // ---------------------------------------------------------------- UI-BVA-01 / UI-UC-06 / UI-DT-01: the rows
  caseTest('UI-BVA-01', 'inserted', "core's patch inserts fishball-ui, fishball-page and fishball-recommend-plugins (and no core-missing row)", async () => {
    const ids = insertedOf(await corePatch()).map((r) => r.id)
    for (const id of Object.keys(ROWS.component)) assert.ok(ids.includes(id), 'no ' + id + ' in ' + show(ids))
    assert.equal(ids.includes(ROWS.coreMissing), false)
  })
  for (const [id, file] of Object.entries(ROWS.component)) {
    caseTest('UI-UC-06', 'rows', `${id} runs fishball-ui's ${file} (a path row of core's patch into its ./ui/ component)`, async () => {
      const row = insertedOf(await corePatch()).find((r) => r.id === id)
      assert.ok(row, 'no ' + id)
      assert.equal(rowFile(row.name), fileOf(NAME.ui, file), `${id}: ${show(row.name)}`)
    })
  }
  for (const [folder, name] of Object.entries(ROWS.subPackages)) {
    caseTest('UI-UC-06', 'rows', `fishball-ui's ${folder}/ is its own package ${name} with its own ./client (so DSH serves its client apart from fishball-ui's)`, () => {
      const own = manifestOf(NAME.ui, folder)
      assert.equal(own?.name, name)
      assert.ok(Object.hasOwn(own?.exports ?? {}, './client'), folder + ' exports no ./client')
      assert.ok(own?.dsh?.client, folder + ' declares no dsh.client')
    })
  }
  caseTest('UI-DT-01', 'rows', "core's patch inserts the UI rows and disables the UI guard rows with plain true", async () => {
    const patch = await corePatch()
    const ids = insertedOf(patch).map((r) => r.id)
    for (const id of Object.keys(ROWS.component)) assert.ok(ids.includes(id), id + ' not inserted')
    for (const id of ROWS.guards) assert.equal(rowOps(patch).find((r) => r.id === id)?.disabled, true, id)
  })
  caseTest('UI-DT-01', 'composed', "composed with DSH's own layers and core's patch: every UI guard row exists", async () => {
    const effective = await composedWith(await corePatch())
    assert.deepEqual(ROWS.guards.filter((id) => findRows(effective, id).length === 0), [], 'UI guard rows DSH does not have')
  })
  caseTest('UI-EP-03', 'component rows', 'the UI guard rows are disabled for every startedBundles list, with and without HMR; there is no per-bundle condition', async () => {
    const ops = rowOps(await corePatch())
    const wrong = []
    for (const [label, bundles] of STARTED) for (const hmr of [false, true]) for (const id of ROWS.guards) {
      const value = await resolvedWith(ops.find((r) => r.id === id).disabled, profileContextOf(bundles), { hmr })
      if (value !== true) wrong.push(`${label} hmr=${hmr}: ${id} → ${show(value)}`)
    }
    assert.deepEqual(wrong, [])
  })
  caseTest('NOCORE-ARCH', 'core composition', "core's patch with DSH's own layers: the UI rows are inserted and the UI guard rows are plain disabled:true", async () => {
    const effective = await composedWith(await corePatch())
    for (const id of Object.keys(ROWS.component)) assert.equal(findRows(effective, id).length, 1, id)
    for (const id of ROWS.guards) assert.equal(findRows(effective, id).at(-1)?.disabled, true, id)
  })

  // ---------------------------------------------------------------- UI-EP-02 reverse, UI-UC-07 E1
  caseTest('UI-EP-02', 'reverse', "fishball-core neither imports nor names fishball-ui in its shipped files and manifest (core is the backend; Q-G1)", () => {
    const named = namesIn(manifestOf(NAME.core)).filter((n) => n === NAME.ui)
    const imports = coreSources().flatMap((file) => [...fs.readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((m) => ({ file: path.relative(dirOf(NAME.core), file), spec: m[1] })))
      .filter(({ spec }) => spec === NAME.ui || spec.startsWith(NAME.ui + '/') || spec.startsWith('./ui/') || spec.startsWith('../ui/'))
    assert.deepEqual([...named.map((n) => 'package.json: ' + n), ...imports.map((r) => r.file + ': ' + r.spec)], [])
  })
  for (const [key, [exported, member]] of Object.entries(SEAM_DRIFT)) {
    caseTest('UI-UC-07', 'E1 drift', `fishball-shared's SEAM_STATUS.${key} equals core's ${exported}.${member} (contracts/constants.js)`, () => {
      assert.ok(CONTRACTS[exported]?.[member], `core's contracts have no ${exported}.${member}`)
      assert.deepEqual(SEAM.SEAM_STATUS?.[key], CONTRACTS[exported][member])
    })
  }

  // ---------------------------------------------------------------- E-FIX-3 (B7): DSH's Preview Notice only in a hosted child
  caseTest('EFIX3-UI-SHAPE-01', 'row', `core's patch has one op {id: ${NOTICE.row}, config: {${NOTICE.field}: …}}: only that config key, no disabled, no name`, async () => {
    const op = await noticeOp()
    assert.deepEqual(Object.keys(op).sort(), ['config', 'id'])
    assert.deepEqual(Object.keys(op.config ?? {}), [NOTICE.field])
  })
  caseTest('EFIX3-UI-SHAPE-01', 'version drift', `DSH's copy version is ${NOTICE.version} in the current DSH's welcome step (${NOTICE.source.pkg})`, () => {
    const text = fs.readFileSync(path.join(dshPackageDir(NOTICE.source.pkg), NOTICE.source.file), 'utf8')
    assert.equal(text.match(NOTICE.source.pattern)?.[1], NOTICE.version)
  })
  caseTest('EFIX3-UI-SHAPE-01', 'composed', `composed with DSH's own layers and core's patch: the ${NOTICE.row} row exists and carries the notice config`, async () => {
    const rows = findRows(await composedWith(await corePatch()), NOTICE.row)
    assert.equal(rows.length, 1)
    assert.ok(Object.hasOwn(rows[0].config ?? {}, NOTICE.field), show(rows[0]))
  })
  const standaloneOverlays = OVERLAYS.find(([, overlays]) => overlays.length === 0)[1]
  for (const [rule, title, ctx, expected] of [
    ['rule 1', 'the hosted child row inserted', profileContextOf([NAME.core], hostedOverlays), NOTICE.version],
    ['rule 2', 'no overlay (standalone DSH)', profileContextOf([NAME.core], standaloneOverlays), undefined],
    ['rule 3', 'no profileContext at all', null, undefined],
  ]) {
    caseTest('EFIX3-UI-DT-01', rule, `${title} → ${NOTICE.field} resolves to ${show(expected) ?? 'undefined'}`, async () => {
      assert.equal(await resolvedVersion(ctx), expected)
    })
  }
  for (const [label, overlays, child] of OVERLAYS) {
    caseTest('EFIX3-UI-EP-01', label, `core started, overlays ${label} → ${child ? NOTICE.version : 'undefined'}`, async () => {
      assert.equal(await resolvedVersion(profileContextOf([NAME.core], overlays)), child ? NOTICE.version : undefined)
    })
  }
  caseTest('EFIX3-UI-EP-02', 'startedBundles', 'the notice row does not read startedBundles: an empty list with the child row still resolves the version', async () => {
    assert.equal(await resolvedVersion(profileContextOf([], hostedOverlays)), NOTICE.version)
  })
  for (const [id, label] of [['NOCORE-NOTICE', 'hosted'], ['NOCORE-NOTICE', 'standalone']]) {
    const hosted = label === 'hosted'
    caseTest(id, label, `core's notice row resolves ${NOTICE.field} to ${hosted ? NOTICE.version : 'undefined'} ${hosted ? 'when the hosted child row is inserted' : 'in a standalone DSH'}`, async () => {
      assert.equal(await resolvedVersion(profileContextOf([NAME.core], hosted ? hostedOverlays : standaloneOverlays)), hosted ? NOTICE.version : undefined)
    })
  }
  caseTest('EFIX3-UI-OWNER-01', 'owner layer', `the owner's profile layer setting ${NOTICE.row}.config.${NOTICE.field} still wins over core's (composed by DSH after the bundle patches)`, async () => {
    const owner = [{ id: NOTICE.row, config: { [NOTICE.field]: NOTICE.ownerValue } }]
    const [row] = findRows(await composedWith(await corePatch(), owner), NOTICE.row)
    assert.equal((await resolvedWith(row.config, profileContextOf([NAME.core], hostedOverlays)))?.[NOTICE.field], NOTICE.ownerValue)
  })

  // ---------------------------------------------------------------- UI-UC-08: core's patch after the split
  caseTest('UI-UC-08', 'main', `core's patch holds the ${ROWS.guards.length} UI guard rows as bare {id, disabled: true} ops, in order, and inserts the UI component rows`, async () => {
    const patch = await corePatch()
    const guards = rowOps(patch).filter((r) => ROWS.guards.includes(r.id))
    assert.deepEqual(guards.map((r) => r.id), [...ROWS.guards])
    for (const op of guards) assert.deepEqual(op, { id: op.id, disabled: true })
    const inserted = insertedOf(patch).map((r) => r.id)
    for (const id of Object.keys(ROWS.component)) assert.ok(inserted.includes(id), id + ' not inserted')
  })
  caseTest('UI-UC-08', 'main', `core's patch keeps ${CORE_SPLIT.guards.join(', ')} and the four shipped presets disabled (plain true)`, async () => {
    const ops = rowOps(await corePatch())
    for (const id of [...CORE_SPLIT.guards, ...CORE_SPLIT.shippedPresets]) assert.equal(ops.find((r) => r.id === id)?.disabled, true, id)
  })
  caseTest('UI-UC-08', 'main', `core's patch inserts ${CORE_SPLIT.ownPreset} and ${CORE_SPLIT.reorderRow.id} at ./${CORE_SPLIT.reorderRow.file}`, async () => {
    const inserted = insertedOf(await corePatch())
    assert.ok(inserted.some((r) => r.id === CORE_SPLIT.ownPreset), CORE_SPLIT.ownPreset)
    const row = inserted.find((r) => r.id === CORE_SPLIT.reorderRow.id)
    assert.equal(rowFile(row?.name), fileOf(NAME.core, CORE_SPLIT.reorderRow.file), show(row))
  })
  for (const gone of CORE_SPLIT.gone) caseTest('UI-UC-08', 'gone', `core has no ${gone} (it is fishball-ui's)`, () => assert.equal(fs.existsSync(fileOf(NAME.core, gone)), false))
  caseTest('UI-UC-08', 'constants', `core's contracts no longer export ${CORE_SPLIT.movedExport} (fishball-shared's)`, () => {
    assert.equal(Object.hasOwn(CONTRACTS, CORE_SPLIT.movedExport), false)
    assert.ok(SEAM[CORE_SPLIT.movedExport], 'fishball-shared exports no ' + CORE_SPLIT.movedExport)
  })
  caseTest('UI-UC-08', 'client', "core's client.js registers fishball-core and loads only client.settings.js (no fishball-ui chunk)", async () => {
    const page = createBrowserSandbox({ lang: 'en', baseURI: CORE_CLIENT.base, fetch: async () => new Response('', { status: 404 }) })
    const file = fileOf(NAME.core, CORE_CLIENT.file)
    page.runFile(file)
    const entry = page.registrations.find((r) => r.chunk === undefined)
    assert.equal(entry?.id, CORE_CLIENT.moduleId)
    const loads = []
    const standIn = (spec) => new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? { name: CORE_CLIENT.partName(spec), apply() {} } : undefined) })
    const require = Object.assign((spec) => { throw new Error('unexpected require ' + spec) }, { async: async (spec) => { loads.push(spec); return standIn(spec) }, asset: (r) => r })
    const exported = entry.factory(require)
    const plugin = exported?.default ?? exported
    const { importDsh } = await import('fishball-test-helpers/dsh')
    const { Context } = await importDsh('cordis')
    const root = new Context()
    for (const name of plugin.inject ?? []) if (typeof name === 'string') root.provide(name, new Proxy({}, { get: () => () => () => {} }))
    const fiber = root.plugin(plugin)
    await fiber
    await new Promise((resolve) => setTimeout(resolve, 0))
    await fiber.dispose?.()
    assert.deepEqual(loads, [...CORE_CLIENT.chunks])
  })
}
