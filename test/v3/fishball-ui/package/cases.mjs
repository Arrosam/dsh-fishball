/**
 * F-UI black-box cases: fishball-ui as core's ./ui/ component since 117cb2a2 (requirements 1.38 Q-N2; R-FB-14, R-FB-01,
 * R-FB-02, R-FB-09, R-FB-11, R-ARCH-08, R-ARCH-10; Q-G1, Q-G2 = A; design §1.0). The Use Cases and
 * the technique index are in USE-CASES.md beside this file; every value comes from constants.mjs.
 *
 * Levels:
 * - unit / integration (static): manifests and import specifiers through the R-SHARED observation
 *   layer; both bundle patches read and composed by the SDK's own dsh-app-boot; each `!!js` row
 *   condition evaluated by the SDK's own loader evaluator against a Context providing
 *   `profileContext` (subject.mjs);
 * - integration (browser, offline): fishball-ui's `client.js` and its chunks run unread in the
 *   scripted page (support/browser-sandbox.mjs), applied by the SDK's own Cordis;
 * - system: a real standalone DSH of the SDK the file names, booted by the F-GUARDS worker with this
 *   checkout's core installed (../guards/worker.mjs); fishball-ui is its ./ui/ component.
 * Rows a later task owns are `todo` and name it.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO, TEST_HOMES } from '../../../support/constants.mjs'
import { createReactShim } from '../../../support/rp-recommend.mjs'
import { fakePrimitives } from '../../../support/set-panel.mjs'
import { until } from '../../../support/util.mjs'
import { caseTest, dshInspect, describeRef, edgesTo, manifestEdges, unitOf } from '../../contract/package-boundaries/cases.mjs'
import { BUNDLED_FIELDS, DSH_FIELD, RUNTIME_DEP_FIELD, SDK, V3 } from '../../contract/package-boundaries/constants.mjs'
import { observe, readManifest } from '../../contract/package-boundaries/packages.mjs'
import { runtimeOf } from '../../fishball-core/package/constants.mjs'
import { bootGraph } from '../../fishball-core/package/page.mjs'
import { BUDGET as G_BUDGET, REPORT } from '../guards/constants.mjs'
import { bootEnv, isOk, scenario, waitReport } from '../guards/harness.mjs'
import {
  CLIENT, CONDITION, CORDIS, CORE_CLIENT, CORE_MISSING, CORE_SPLIT, FIXTURE, FORBIDDEN, KEEP_ON, LATER, MOVED, NOTICE, NOTICE_STARTED, OVERLAYS, ROUTE, ROWS, SEAM, STARTED,
  UI_PACKAGE, UI_PACKAGES, UI_STARTED, WAIT,
} from './constants.mjs'
import {
  CHUNK_FAILS, composedWith, configWhen, coreConstants, corePatch, disabledWhen, findRows, insertedOf, isExpression, loadChunk, loadClient, namesFile, needUi, profileContextOf,
  coreIntendedReader, rowFile, rowOps, seamModule, styleHead, uiManifest, uiPatch,
} from './subject.mjs'
import { registerNavCases } from './nav-cases.mjs'
import { registerEmbedLocaleCases } from './embed-locale-cases.mjs'
import { registerNoCoreCases } from './no-core-cases.mjs'
import { registerFrameLayoutCases } from './frame-layout-cases.mjs'

const show = (v) => JSON.stringify(v)
const CORE = V3.core.name
const UI = V3.ui.name
const settle = async () => { for (let i = 0; i < WAIT.settleRounds; i++) await new Promise((resolve) => setImmediate(resolve)) }
const ALL_INSERTED = Object.freeze([...Object.keys(ROWS.withCore), ROWS.coreMissing.id])
const coreMissingLines = (logs) => logs.filter((l) => l.text.includes(CORE_MISSING.text))
const isCoreMissingLine = (l) => l.name === CORE_MISSING.logger && l.type === CORE_MISSING.type && l.text === CORE_MISSING.text
/** Paths (`a.b[0]`) of every object reachable from `value` that is not frozen, and of every function. */
const unfrozen = (value, at) => {
  if (typeof value === 'function') return [at + ' (a function)']
  if (value === null || typeof value !== 'object') return []
  return [...(Object.isFrozen(value) ? [] : [at]), ...Object.entries(value).flatMap(([k, v]) => unfrozen(v, `${at}.${k}`))]
}
/**
 * The UI guard row op for `id`. Re-baselined (R-FIX-FUI F2, Q-G2 = A, the user 2026-11-18): the UI
 * guard rows moved from fishball-ui's patch into core's, each a bare `{id, disabled: !!js}` op.
 */
async function uiGuardOp(sdk, id) {
  const op = rowOps(await corePatch(sdk)).find((r) => r.id === id)
  assert.ok(op, `core's patch has no row op for ${id}`)
  return op
}
async function uiInserted(sdk, id) {
  // 117cb2a2: the UI rows are inserted by core's patch.
  const row = insertedOf(await corePatch(sdk)).find((r) => r.id === id)
  assert.ok(row, `core's patch inserts no ${id}`)
  return row
}
/** The core's file at the task's base commit, written into a scratch folder (git show), for the "moved unchanged" rows. */
function baseFile(t, relative) {
  // Direct file runs have no suite-runner test home yet; create its anchor like the runner does.
  const anchor = path.dirname(TEST_HOMES)
  fs.mkdirSync(anchor, { recursive: true })
  const root = fs.realpathSync(anchor)
  const dir = fs.mkdtempSync(path.join(root, MOVED.tempPrefix))
  t.after(() => {
    if (path.dirname(dir) !== root || !path.basename(dir).startsWith(MOVED.tempPrefix)) throw new Error('unexpected temp dir ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const file = path.join(dir, path.basename(relative))
  fs.writeFileSync(file, execFileSync('git', ['show', `${MOVED.ref}:${relative}`], { cwd: REPO, encoding: 'utf8' }))
  return file
}

export function registerUiCases(sdk) {
  /** Apply a client module's plugin in a fresh Cordis root of `sdk`; records every fiber that fails. */
  async function applyIn(c, exports) {
    const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), CORDIS.entry)).href)
    const root = new Context()
    const failed = []
    root.on(CORDIS.statusEvent, (fiber) => { if (fiber.state === CORDIS.failed) failed.push(fiber.runtime?.name ?? fiber.name) })
    const plugin = exports?.default ?? exports
    assert.equal(typeof plugin?.apply, 'function', 'the client exports no client plugin')
    const fiber = root.plugin(plugin)
    c.after(async () => { await fiber.dispose?.() })
    await settle()
    return { failed }
  }

  const t = (id, row, title, fn, todo) => caseTest(sdk, id, row, title, fn, todo)

  // ================================================================ UI-POLISH-F §1: the Fishball page's icon navigation
  registerNavCases(sdk)
  registerEmbedLocaleCases(sdk)
  // ================================================================ R-FIX-FUI F2: without core, fishball-ui changes nothing
  registerNoCoreCases(sdk)
  // ================================================================ MULTI-3 requirement F: the restyled real sidebar
  registerFrameLayoutCases(sdk)

  // ================================================================ UI-UC-06: the package
  t('UI-UC-06', 'main 1', 'fishball-ui exists at packages/core/ui as core\'s component package', () => {
    needUi()
    assert.equal(uiManifest().name, UI_PACKAGE.name)
    assert.ok(readManifest(REPO).workspaces?.includes('packages/core'), 'root workspaces lack packages/core')
  })
  t('UI-UC-06', 'main 2', `it is core's UI component: dsh.client.platform ${UI_PACKAGE.platform}, no dsh.bundle of its own`, () => {
    needUi()
    assert.equal(uiManifest()[DSH_FIELD]?.bundle, undefined)
    assert.equal(uiManifest()[DSH_FIELD]?.client?.platform, UI_PACKAGE.platform)
  })
  // 117cb2a2: fishball-ui is a component row inside core's bundle, not a bundle DSH installs alone.
  t('UI-UC-06', 'main 2', "DSH's own bundle inspection sees fishball-ui as a component, not a bundle", null, 'fishball-ui is core\'s ./ui/ component (117cb2a2); core is the bundle')
  t('UI-EP-02', 'exports', `the export map is exactly ${Object.keys(UI_PACKAGE.exports).join(', ')}, each a shipped file`, () => {
    needUi()
    assert.deepEqual(uiManifest().exports, { ...UI_PACKAGE.exports })
    for (const file of Object.values(UI_PACKAGE.exports)) assert.ok(fs.existsSync(path.join(UI_PACKAGE.dir, file)), file + ' is missing')
  })
  t('UI-UC-06', 'main 3', 'it declares no runtime dependencies; core carries fishball-shared', () => {
    needUi()
    const m = uiManifest()
    for (const field of [RUNTIME_DEP_FIELD, ...BUNDLED_FIELDS]) assert.deepEqual(Object.keys(m[field] ?? {}), [], field + ': ' + show(m[field]))
    const core = readManifest(V3.core.dir)
    assert.ok(Object.hasOwn(core[RUNTIME_DEP_FIELD] ?? {}, UI_PACKAGE.library), UI_PACKAGE.library + ' not in core ' + RUNTIME_DEP_FIELD)
  })
  t('UI-UC-06', 'main 3', "the nested UI package ships its client, page, tab and data files (npm pack's files list)", null, 'packaging is checked by npm pack --dry-run; the nested package is not a workspace tarball here')
  // The bundled library copy in a packed tarball is PLAT-EP-07 row 5's for every importer
  // (package-boundaries), fishball-ui included; it waits for REL-PACK there.
  t('UI-UC-06', 'main 3', "the packed tarball carries a real copy of fishball-shared", null, LATER.relPack)
  // R-ARCH-10 / R-FB-14 "Fishball side only" (EP over manifest fields × forbidden names).
  t('UI-EP-02', 'manifest', `the manifest names no DSH-side package (${FORBIDDEN.dshSide.join(', ')}) and not fishball-core, in any dependency field`, () => {
    needUi()
    assert.deepEqual(manifestEdges(uiManifest(), [...FORBIDDEN.dshSide, FORBIDDEN.core]).map((e) => e.field + ': ' + e.name), [])
  })
  t('UI-EP-02', 'manifest', 'every other name in its dependency fields is fishball-shared or a DSH host package (@deepseek-ai/*)', () => {
    needUi()
    const m = uiManifest()
    const names = ['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap((f) => Object.keys(m[f] ?? {}))
    assert.deepEqual(names.filter((n) => n !== UI_PACKAGE.library && !n.startsWith(UI_PACKAGE.hostScope)), [])
  })
  t('UI-EP-02', 'imports', 'no shipped file of fishball-ui imports a DSH-side package or fishball-core (by name or path)', async () => {
    needUi()
    const unit = await unitOf(UI)
    assert.deepEqual(unit.parseErrors, [], 'unparsed shipped files')
    assert.deepEqual(unit.refs.filter((r) => [...FORBIDDEN.dshSide, FORBIDDEN.core].includes(r.target)).map(describeRef), [])
    assert.deepEqual(unit.refs.filter((r) => r.outside).map(describeRef), [], 'a path leaving the package')
  })
  t('UI-EP-02', 'imports', 'fishball-ui imports fishball-shared (its one library)', async () => {
    needUi()
    assert.ok(edgesTo(await unitOf(UI), UI_PACKAGE.library).length > 0, 'no file imports ' + UI_PACKAGE.library)
  })
  t('UI-EP-02', 'reverse', 'fishball-core neither imports nor names fishball-ui (core is the backend; Q-G1)', async () => {
    const unit = await unitOf(CORE)
    assert.deepEqual([...unit.refs.filter((r) => r.target === UI).map(describeRef), ...manifestEdges(unit.manifest, [UI]).map((e) => e.field + ': ' + e.name)], [])
  })

  // ================================================================ UI-DT-01 / UI-BVA-01: the patch rows
  // Re-baselined (F-WIRE): eight rows, ui-model-selection last; the user: "Hide it. Only core's settings choose the model".
  // Re-baselined (E-FIX-3, B7, Fishball 2026-11-17): the patch has a third kind of op, the
  // `ui-settings-general` config row `{id, config: {welcomeNoticeVersion}}` (no `disabled`); the
  // guard rows themselves are unchanged. So: the bare {id, disabled} ops are exactly the guard rows
  // in order, and the only other non-insert op is that config row.
  // 117cb2a2: fishball-ui has no patch; its rows live in core's patch.
  t('UI-BVA-01', 'no UI patch', "fishball-ui has no cordis.patch.yml; core's patch inserts its rows", () => {
    assert.equal(fs.existsSync(path.join(UI_PACKAGE.dir, UI_PACKAGE.patchFile)), false)
  })
  t('UI-BVA-01', 'inserted', "core's patch inserts fishball-ui, fishball-page and fishball-recommend-plugins (and no core-missing row)", async () => {
    const ids = insertedOf(await corePatch(sdk)).map((r) => r.id)
    for (const id of Object.keys(ROWS.withCore)) assert.ok(ids.includes(id), 'no ' + id + ' in ' + show(ids))
    assert.equal(ids.includes(ROWS.coreMissing.id), false)
  })
  for (const [id, file] of Object.entries(ROWS.withCore)) {
    t('UI-UC-06', 'rows', `${id} runs ${file} of core's ./ui/ component (a path row into core)`, async () => {
      const row = await uiInserted(sdk, id)
      const relative = path.posix.join('ui', file.replace(/^\.\//, ''))
      assert.ok(namesFile(row.name, V3.core.dir, relative), `${id}: ${show(row.name)}`)
    })
  }
  // 117cb2a2: core's patch always inserts the UI rows; there is no core-missing row any more.
  t('UI-UC-06', 'rows', `${ROWS.coreMissing.id} is no longer inserted`, null, '117cb2a2: fishball-ui is core\'s ./ui/ component; the client logs core-missing, no row')
  for (const [folder, name] of Object.entries(UI_PACKAGES)) {
    t('UI-UC-06', 'rows', `${folder}/ is its own package ${name} with its own ./client (so DSH serves its client apart from fishball-ui's)`, () => {
      const own = readManifest(path.join(UI_PACKAGE.dir, folder))
      assert.equal(own?.name, name)
      assert.ok(Object.hasOwn(own?.exports ?? {}, './client'), folder + ' exports no ./client')
      assert.ok(own?.dsh?.client, folder + ' declares no dsh.client')
    })
  }
  // 117cb2a2: no UI patch; core's patch holds the UI rows as plain rows.
  t('UI-DT-01', 'rows', "core's patch inserts the UI rows and disables the UI guard rows with plain true", async () => {
    const patch = await corePatch(sdk)
    const ids = insertedOf(patch).map((r) => r.id)
    for (const id of Object.keys(ROWS.withCore)) assert.ok(ids.includes(id), id + ' not inserted')
    for (const id of ROWS.guards) {
      const op = rowOps(patch).find((r) => r.id === id)
      assert.ok(op, id + ' missing')
      assert.equal(op.disabled, true, id + ': ' + show(op))
    }
  })
  t('UI-DT-01', 'composed', "composed with DSH's own layers and core's patch: every UI guard row exists", async () => {
    const effective = await composedWith(sdk, await corePatch(sdk))
    const missing = ROWS.guards.filter((id) => findRows(effective, id).length === 0)
    assert.deepEqual(missing, [], 'UI guard rows DSH does not have on this SDK')
  })
  t('UI-EP-03', 'component rows', 'the UI guard rows are disabled for every startedBundles list; there is no per-bundle condition', async () => {
    for (const [, bundles] of UI_STARTED) {
      const wrong = []
      for (const id of ROWS.guards) {
        const value = await disabledWhen(sdk, await uiGuardOp(sdk, id), bundles)
        if (value !== true) wrong.push(id + ' → ' + value)
      }
      assert.deepEqual(wrong, [])
    }
  })
  t('UI-EP-01', 'startedBundles', 'the old core-started partitions no longer gate the UI rows', null, "117cb2a2: the UI rows are core's component rows, inserted unconditionally by core's patch")

  // ================================================================ E-FIX-3 (B7): no DSH Preview Notice in a hosted child
  /** The notice row op, as DSH's loadOverlayPatches parsed it. */
  async function noticeOp() {
    const ops = rowOps(await corePatch(sdk)).filter((op) => op.id === NOTICE.row)
    assert.equal(ops.length, 1, `core's patch has ${ops.length} ${NOTICE.row} ops`)
    return ops[0]
  }
  /** The resolved `welcomeNoticeVersion` of the notice row for one `profileContext` (null: none). */
  const resolvedVersion = async (profileContext) => (await configWhen(sdk, (await noticeOp()).config, profileContext))?.[NOTICE.field]
  t('EFIX3-UI-SHAPE-01', 'row', `core's patch has one op {id: ${NOTICE.row}, config: {${NOTICE.field}: …}}: only that config key, no disabled, no name`, async () => {
    const op = await noticeOp()
    assert.deepEqual(Object.keys(op).sort(), ['config', 'id'])
    assert.deepEqual(Object.keys(op.config ?? {}), [NOTICE.field])
  })
  t('EFIX3-UI-SHAPE-01', 'version drift', `DSH's copy version is ${NOTICE.version} in this SDK's welcome step (dsh-client-ui-settings-models)`, () => {
    const file = path.join(runtimeOf(sdk), '@deepseek-ai', NOTICE.versionSource.pkg, NOTICE.versionSource.file)
    assert.equal(fs.readFileSync(file, 'utf8').match(NOTICE.versionSource.pattern)?.[1], NOTICE.version)
  })
  t('EFIX3-UI-SHAPE-01', 'composed', `composed with DSH's own layers and core's patch: the ${NOTICE.row} row exists and carries the notice config`, async () => {
    const effective = await composedWith(sdk, await corePatch(sdk))
    const rows = findRows(effective, NOTICE.row)
    assert.equal(rows.length, 1, `${NOTICE.row} rows in the composed list`)
    assert.ok(Object.hasOwn(rows[0].config ?? {}, NOTICE.field), show(rows[0]))
  })
  // 117cb2a2: the notice row is core's; its condition is the hosted child overlay only (the old
  // fishball-ui startedBundles condition is gone).
  const [hostedOverlay] = OVERLAYS.filter(([, , child]) => child)
  const [standaloneOverlay] = OVERLAYS.filter(([, overlays]) => overlays.length === 0)
  const noticeRules = [
    ['rule 1', 'the hosted child row inserted', profileContextOf([CORE], hostedOverlay[1]), NOTICE.version],
    ['rule 2', 'no overlay (standalone DSH)', profileContextOf([CORE], standaloneOverlay[1]), undefined],
    ['rule 3', 'no profileContext at all', null, undefined],
  ]
  for (const [rule, title, profileContext, expected] of noticeRules) {
    t('EFIX3-UI-DT-01', rule, `${title} → ${NOTICE.field} resolves to ${show(expected) ?? 'undefined'}`, async () => {
      assert.equal(await resolvedVersion(profileContext), expected)
    })
  }
  // EP over profileContext.overlays with core started: only an INSERTED row with exactly that id counts.
  for (const [label, overlays, child] of OVERLAYS) {
    t('EFIX3-UI-EP-01', label, `core started, overlays ${label} → ${child ? NOTICE.version : 'undefined'}`, async () => {
      assert.equal(await resolvedVersion(profileContextOf([CORE], overlays)), child ? NOTICE.version : undefined)
    })
  }
  t('EFIX3-UI-EP-02', 'startedBundles', 'the notice row no longer reads startedBundles: an empty list with the child row still resolves the version', async () => {
    assert.equal(await resolvedVersion(profileContextOf([], hostedOverlay[1])), NOTICE.version)
  })
  t('EFIX3-UI-GUARD-01', 'uiRows', 'core\'s readIntendedGuards().uiRows is empty; the UI guard rows are plain rows now', async () => {
    const intended = (await coreIntendedReader(sdk))()
    assert.deepEqual(Object.keys(intended).sort(), ['policy', 'rows', 'uiRows'])
    assert.deepEqual([...intended.uiRows], [])
    for (const id of ROWS.guards) assert.ok(intended.rows.includes(id), id + ' not in rows')
    assert.equal(intended.rows.includes(NOTICE.row), false)
  })
  t('EFIX3-UI-GUARD-01', 'rows', `core's readIntendedGuards().rows holds the core guards, the shipped presets and the ${ROWS.guards.length} UI guard ids`, async () => {
    const intended = (await coreIntendedReader(sdk))()
    const plain = rowOps(await corePatch(sdk)).filter((op) => Object.keys(op).length === 2 && op.disabled === true).map((op) => op.id)
    assert.deepEqual([...intended.rows], plain)
    for (const id of [...CORE_SPLIT.guards, ...CORE_SPLIT.shippedPresets, ...ROWS.guards]) assert.ok(intended.rows.includes(id), id)
  })
  t('EFIX3-UI-GUARD-01', 'gone', 'fishball-ui has no src/guards.js and no peer dependency on @deepseek-ai/dsh-app-boot', () => {
    assert.equal(fs.existsSync(path.join(UI_PACKAGE.dir, 'src', 'guards.js')), false)
    const m = uiManifest()
    assert.equal(Object.hasOwn(m.peerDependencies ?? {}, '@deepseek-ai/dsh-app-boot'), false, show(m.peerDependencies))
  })
  t('EFIX3-UI-OWNER-01', 'owner layer', `the owner's profile layer setting ${NOTICE.row}.config.${NOTICE.field} still wins over core's (composed by DSH after the bundle patches)`, async () => {
    const owner = [{ id: NOTICE.row, config: { [NOTICE.field]: NOTICE.ownerValue } }]
    const effective = await composedWith(sdk, await corePatch(sdk), owner)
    const [row] = findRows(effective, NOTICE.row)
    const resolved = await configWhen(sdk, row.config, profileContextOf([CORE], hostedOverlay[1]))
    assert.equal(resolved?.[NOTICE.field], NOTICE.ownerValue)
  })

  // ================================================================ UI-UC-08: core's patch after the split
  // Re-baselined (R-FIX-FUI F2, Q-G2 = A, the user 2026-11-18): the UI guard rows and the notice row moved into core's patch.
  t('UI-UC-08', 'main', `core's patch holds the ${ROWS.guards.length} UI guard rows as bare {id, disabled: true} ops and inserts the UI component rows`, async () => {
    const patch = await corePatch(sdk)
    const guards = rowOps(patch).filter((r) => ROWS.guards.includes(r.id))
    assert.deepEqual(guards.map((r) => r.id), [...ROWS.guards])
    for (const op of guards) {
      assert.deepEqual(Object.keys(op).sort(), ['disabled', 'id'], op.id + ' is not a bare {id, disabled} row')
      assert.equal(op.disabled, true, op.id + ' is not disabled')
    }
    const inserted = insertedOf(patch).map((r) => r.id)
    for (const id of Object.keys(ROWS.withCore)) assert.ok(inserted.includes(id), id + ' not inserted')
    assert.equal(inserted.includes(ROWS.coreMissing.id), false)
  })
  t('UI-UC-08', 'main', `core's patch keeps ${CORE_SPLIT.guards.join(', ')} and the four shipped presets disabled (plain true)`, async () => {
    const ops = rowOps(await corePatch(sdk))
    for (const id of [...CORE_SPLIT.guards, ...CORE_SPLIT.shippedPresets]) assert.equal(ops.find((r) => r.id === id)?.disabled, true, id)
  })
  t('UI-UC-08', 'main', `core's patch inserts ${CORE_SPLIT.ownPreset} and ${CORE_SPLIT.guardsRow.id} at ./src/guards/row.js`, async () => {
    const inserted = insertedOf(await corePatch(sdk))
    assert.ok(inserted.some((r) => r.id === CORE_SPLIT.ownPreset), CORE_SPLIT.ownPreset)
    const row = inserted.find((r) => r.id === CORE_SPLIT.guardsRow.id)
    assert.ok(row, 'no ' + CORE_SPLIT.guardsRow.id + ' row; inserted ' + show(inserted.map((r) => r.id)))
    assert.ok(namesFile(row.name, V3.core.dir, CORE_SPLIT.guardsRow.tail), show(row.name))
  })
  for (const gone of CORE_SPLIT.gone) {
    t('UI-UC-08', 'gone', `core has no ${gone}`, () => assert.equal(fs.existsSync(path.join(V3.core.dir, gone)), false))
  }
  t('UI-UC-08', 'constants', `core's GUARDS.pluginName is ${CORE_SPLIT.pluginName}; core's constants no longer export ${CORE_SPLIT.movedExport}`, async () => {
    const c = await coreConstants()
    assert.equal(c.GUARDS?.pluginName, CORE_SPLIT.pluginName)
    assert.equal(Object.hasOwn(c, CORE_SPLIT.movedExport), false)
  })
  t('UI-UC-08', 'client', "core's client.js still registers fishball-core and loads only client.settings.js", async (c) => {
    // Any export the stand-in chunk offers: the oracle is which chunks core's client asks for.
    const standIn = (file) => new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? { name: FIXTURE.partName(file), apply() {} } : undefined) })
    const client = loadClient({ dir: CORE_CLIENT.dir, file: CORE_CLIENT.file, chunks: Object.fromEntries(CORE_CLIENT.chunks.map((s) => [s.slice(2), standIn])) })
    assert.equal(client.entry?.id, CORE_CLIENT.moduleId)
    await applyIn(c, client.exports)
    assert.deepEqual(client.loads, [...CORE_CLIENT.chunks])
  })

  // ================================================================ UI-UC-07: the shared seam
  t('UI-UC-07', 'main', `fishball-shared exports ${SEAM.exportKey} → ${SEAM.exportFile}`, () => {
    assert.equal(readManifest(V3.shared.dir)?.exports?.[SEAM.exportKey], SEAM.exportFile)
  })
  t('UI-UC-07', 'UI_SEAM', 'UI_SEAM is {member: ui, coreMissing: fishball-core-missing}, deeply frozen', async () => {
    const m = await seamModule()
    assert.deepEqual(m.UI_SEAM, { ...SEAM.UI_SEAM })
    assert.deepEqual(unfrozen(m.UI_SEAM, 'UI_SEAM'), [])
  })
  t('UI-UC-07', 'UI_GUARDS', 'UI_GUARDS is {service: fishballUiGuards}, deeply frozen', async () => {
    const m = await seamModule()
    assert.deepEqual(m.UI_GUARDS, { ...SEAM.UI_GUARDS })
    assert.deepEqual(unfrozen(m.UI_GUARDS, 'UI_GUARDS'), [])
  })
  t('UI-UC-07', 'SEAM_STATUS', `SEAM_STATUS has exactly ${SEAM.keys.join(', ')}, deeply frozen data, with the status model's words`, async () => {
    const m = await seamModule()
    assert.deepEqual(Object.keys(m.SEAM_STATUS ?? {}).sort(), [...SEAM.keys].sort())
    assert.deepEqual(unfrozen(m.SEAM_STATUS, 'SEAM_STATUS'), [])
    for (const [key, words] of Object.entries(SEAM.status)) assert.deepEqual(m.SEAM_STATUS[key], { ...words }, key)
  })
  for (const [key, [exported, member]] of Object.entries(SEAM.drift)) {
    t('UI-UC-07', 'E1 drift', `SEAM_STATUS.${key} equals core's ${exported}.${member} (contracts/constants.js)`, async () => {
      const [m, c] = await Promise.all([seamModule(), coreConstants()])
      assert.ok(c[exported]?.[member], `core's constants have no ${exported}.${member}`)
      assert.deepEqual(m.SEAM_STATUS?.[key], c[exported][member])
    })
  }
  t('UI-UC-07', 'data only', 'ui-seam imports nothing (a data-only module both sides load)', async () => {
    const unit = await unitOf(V3.shared.name)
    assert.deepEqual(unit.refs.filter((r) => r.file === path.basename(SEAM.file)).map(describeRef), [])
  })

  // ================================================================ moved unchanged (interface item 10)
  // Re-baselined (R-FIX-FUI F1): PAIRING_TEXT gained the card's `title`, `chooseFailed` and `locale`;
  // every key core's copy had still answers as it did.
  t('UI-UC-06', 'moved', 'src/pairing/text.js: PAIRING_TEXT answers as core\'s ui/pairing/text.js did for every key it had (every formatter, en and zh), and adds title, chooseFailed and locale', async (c) => {
    const now = (await import(pathToFileURL(path.join(UI_PACKAGE.dir, MOVED.pairing.after)).href))[MOVED.pairing.export]
    const before = (await import(pathToFileURL(baseFile(c, MOVED.pairing.before)).href))[MOVED.pairing.export]
    const picture = (o, keysOf) => Object.fromEntries(Object.entries(o).map(([lang, words]) => [lang, Object.fromEntries(keysOf(lang).map((k) => [k, typeof words[k] === 'function' ? words[k](...MOVED.args) : words[k]]))]))
    const oldKeys = (lang) => Object.keys(before[lang])
    assert.deepEqual(picture(now, oldKeys), picture(before, oldKeys))
    for (const lang of Object.keys(before)) assert.deepEqual(Object.keys(now[lang]).filter((k) => !oldKeys(lang).includes(k)).sort(), [...MOVED.pairing.added].sort(), lang)
  })
  t('UI-UC-06', 'moved', `src/status/index.js exports ${MOVED.status.exports.join(', ')}`, async () => {
    const mod = await import(pathToFileURL(path.join(UI_PACKAGE.dir, MOVED.status.after)).href)
    for (const name of MOVED.status.exports) assert.notEqual(mod[name], undefined, name)
  })
  t('UI-UC-06', 'moved', `src/recommended.js exports recommendedList and RECOMMENDED_* (the tab's data)`, async () => {
    const mod = await import(pathToFileURL(path.join(UI_PACKAGE.dir, MOVED.recommended.after)).href)
    assert.equal(typeof mod.recommendedList, 'function')
    assert.ok(Object.keys(mod).some((k) => k.startsWith(MOVED.recommended.prefix)), 'no RECOMMENDED_* export')
  })

  // ================================================================ UI-UC-04 / UI-UC-05: the browser half
  const platform = () => { const shim = createReactShim({ stale() {} }); return { react: shim.React, 'react-dom': { createPortal: (n) => n }, 'react/jsx-runtime': { jsx: shim.React.createElement, jsxs: shim.React.createElement, Fragment: shim.React.Fragment }, '@deepseek-ai/dsh-client-ui-primitives': fakePrimitives(shim.React) } }
  t('UI-UC-04', 'main 1', `client.js registers exactly one module, id ${CLIENT.moduleId}, with no chunk`, () => {
    needUi()
    // Re-baselined (R-FIX-FUI F3): the entry's kit draws the shared stream notice, so its factory requires the page's react and primitives.
    const { registrations } = loadClient({ chunks: {}, platform: platform() })
    assert.deepEqual(registrations.map((r) => [r.id, r.chunk]), [[CLIENT.moduleId, undefined]])
  })
  /** Apply fishball-ui's client in a Cordis root of `sdk`; chunk stand-ins record the kit and the started parts. */
  async function startClient(c, how) {
    const started = []
    const kits = []
    const standIn = (file, exportName) => () => ({ [exportName]: (kit) => { kits.push({ file, kit }); return { name: FIXTURE.partName(file), apply() { started.push(file) } } } })
    const chunks = Object.fromEntries(Object.values(CLIENT.parts).map((p) => [p.file, how[p.file] === CHUNK_FAILS ? CHUNK_FAILS : standIn(p.file, p.export)]))
    let styles
    const client = loadClient({ chunks, platform: platform(), prepare: (page) => { styles = styleHead(page) } })
    const { failed } = await applyIn(c, client.exports)
    return { ...client, started, kits, failed, styles }
  }
  // Re-baselined (2026-11-25): client.js loads four parts (entries, asks, strip, brand); client.model.js is removed.
  t('UI-UC-04', 'main 2', `its plugin loads ${CLIENT.partOrder.map((f) => './' + f).join(', ')} in that order and starts each part (and never loads ${CLIENT.removedParts.join(', ')})`, async (c) => {
    needUi()
    const r = await startClient(c, {})
    assert.deepEqual([...r.loads], CLIENT.partOrder.map((f) => './' + f))
    for (const removed of CLIENT.removedParts) {
      assert.equal(r.loads.includes('./' + removed), false, `client.js must not load removed chunk ./${removed}`)
      assert.equal(fs.existsSync(path.join(UI_PACKAGE.dir, removed)), false, `removed chunk ${removed} still exists on disk`)
      assert.equal((uiManifest().files ?? []).includes(removed), false, `removed chunk ${removed} still listed in package.json files`)
    }
    assert.deepEqual([...r.started].sort(), Object.values(CLIENT.parts).map((p) => p.file).sort())
    assert.deepEqual(r.failed, [])
  })
  for (const part of Object.values(CLIENT.parts)) {
    // Follows main 2's re-baseline: with four parts, every other part still starts.
    const others = Object.values(CLIENT.parts).filter((p) => p !== part).map((p) => p.file)
    t('UI-UC-04', 'E1', `${part.file} fails to load: only its part is lost; ${others.join(', ')} still start; nothing fails`, async (c) => {
      needUi()
      const r = await startClient(c, { [part.file]: CHUNK_FAILS })
      assert.deepEqual([...r.started].sort(), [...others].sort())
      assert.deepEqual(r.failed, [])
    })
  }
  t('UI-UC-04', 'E2', 'every chunk fails: no part starts and the entry plugin does not fail', async (c) => {
    needUi()
    const r = await startClient(c, Object.fromEntries(Object.values(CLIENT.parts).map((p) => [p.file, CHUNK_FAILS])))
    assert.deepEqual(r.started, [])
    assert.deepEqual(r.failed, [])
  })
  t('UI-ST-03', 'mountStyle', 'kit.mountStyle(id, css): none → one <style id> with that text → its disposer removes it; a second dispose changes nothing', async (c) => {
    needUi()
    const r = await startClient(c, {})
    const kit = r.kits[0]?.kit
    assert.equal(typeof kit?.[CLIENT.kitStyle], 'function', 'the part got no kit.mountStyle')
    assert.deepEqual(r.styles.filter((s) => s.id === FIXTURE.styleId), [], 'precondition: no such style')
    const dispose = kit[CLIENT.kitStyle](FIXTURE.styleId, FIXTURE.css)
    const mine = r.styles.filter((s) => s.id === FIXTURE.styleId)
    assert.equal(mine.length, 1, 'one style element')
    assert.equal(mine[0].tagName.toLowerCase(), CLIENT.styleTag)
    assert.equal(mine[0].textContent, FIXTURE.css)
    assert.equal(typeof dispose, 'function')
    dispose()
    assert.deepEqual(r.styles.filter((s) => s.id === FIXTURE.styleId), [])
    dispose()
    assert.deepEqual(r.styles.filter((s) => s.id === FIXTURE.styleId), [])
  })
  for (const part of Object.values(CLIENT.parts)) {
    t('UI-UC-05', part.file, `${part.file} registers {id: fishball-ui, chunk: ${part.file}} and exports ${part.export}(kit) → a plugin ${part.plugin === null ? 'with a name' : `named "${part.plugin}"`} {inject, apply}`, () => {
      needUi()
      const { registrations, exports, required } = loadChunk(part.file, platform())
      // R-FIX-FUI F3: a part may get the kit's shared stream members; this row checks the factory shape only.
      assert.deepEqual(registrations.map((r) => [r.id, r.chunk]), [[CLIENT.moduleId, part.file]])
      assert.equal(typeof exports?.[part.export], 'function', 'no ' + part.export)
      const plugin = exports[part.export]({ [CLIENT.kitStyle]: () => () => {} })
      if (part.plugin === null) assert.ok(typeof plugin?.name === 'string' && plugin.name.length > 0, 'the plugin has no name')
      else assert.equal(plugin?.name, part.plugin)
      assert.ok(Array.isArray(plugin?.inject), 'no inject list')
      assert.equal(typeof plugin?.apply, 'function')
      assert.deepEqual(required.filter((n) => !CLIENT.platform.includes(n)), [], 'requires outside the page set')
    })
  }
  t('UI-UC-06', 'window style', "the window style the embed UI shows is fishball-page's own (a frame-only rule)", null, LATER.frame)

  // ================================================================ system: real standalone DSH processes
  // Scenario BOTH (UI-UC-01): core and fishball-ui installed; the owner keeps one UI row on, then restores it.
  const both = scenario('v3-fui-both', sdk, [async (boot, f) => {
    // 117cb2a2: fishball-ui is core's ./ui/ component; core is the one bundle to install.
    const h = await boot(bootEnv({ members: [CORE] }))
    f.started = await h.call('startedBundles')
    f.report = await waitReport(h, (r) => r !== null, G_BUDGET.readyMs)
    f.settled = await waitReport(h, isOk, G_BUDGET.readyMs)
    f.rows = await h.call('rows', { ids: [...ROWS.guards, ...ALL_INSERTED] })
    f.notice = await h.call('rowConfig', { id: NOTICE.row, field: NOTICE.field })
    f.service = await h.call('service', { name: CONDITION.service2 })
    f.graph = (await bootGraph({ origin: h.origin, cookie: h.cookie })).map((e) => e.id)
    f.tab = (await fetch(h.origin + ROUTE.recommended, { headers: { cookie: h.cookie } })).status
    f.logs = await h.call('logs')
    f.override = await (async () => {
      const id = ROWS.guards[0]
      await h.call('setRowEnabled', { id, enabled: true })
      const set = await waitReport(h, (r) => r?.overridden?.includes(REPORT.row(id)))
      await h.call('setRowEnabled', { id: CORE_SPLIT.guards[0], enabled: true })
      const two = await waitReport(h, (r) => r?.overridden?.includes(REPORT.row(CORE_SPLIT.guards[0])))
      await h.call('setRowEnabled', { id, enabled: false })
      await h.call('setRowEnabled', { id: CORE_SPLIT.guards[0], enabled: false })
      return { id, set, two, cleared: await waitReport(h, isOk) }
    })()
  }])
  t('UI-UC-01', 'main 1', 'core is the started bundle; fishball-ui is its ./ui/ component row', async () => {
    const f = await both()
    assert.ok(f.started.includes(CORE), show(f.started))
    assert.equal(f.started.includes(UI), false, 'fishball-ui is a bundle: ' + show(f.started))
  })
  t('UI-UC-01', 'main 2', `core + fishball-ui: the ${ROWS.guards.length} UI guard rows are disabled`, async () => {
    const f = await both()
    assert.deepEqual(f.rows.filter((r) => ROWS.guards.includes(r.id) && r.present && !r.disabled).map((r) => r.id), [])
  })
  t('UI-UC-01', 'main 2', 'core + its UI component: fishball-ui, fishball-page and fishball-recommend-plugins run; there is no core-missing row', async () => {
    const f = await both()
    const state = Object.fromEntries(f.rows.map((r) => [r.id, r]))
    for (const id of Object.keys(ROWS.withCore)) assert.ok(state[id]?.present && !state[id].disabled && state[id].active, id + ': ' + show(state[id]))
    assert.equal(state[ROWS.coreMissing.id]?.present ?? false, false, show(state[ROWS.coreMissing.id]))
  })
  // Re-baselined (F-WIRE): eight ids, ui-model-selection last ("Hide it. Only core's settings choose the model").
  // Re-baselined (R-FIX-FUI F2): fishballUiGuards is a presence marker (a frozen object) and no longer carries `rows`.
  t('UI-UC-01', 'main 3', `core + fishball-ui: ${CONDITION.service2} is provided and carries no rows`, async () => {
    const f = await both()
    assert.ok(f.service.present, 'no ' + CONDITION.service2 + ' service')
    assert.equal(Object.hasOwn(f.service.value, 'rows'), false, show(f.service.value))
  })
  t('UI-UC-01', 'main 4', 'core + fishball-ui: the guard report is ok', async () => {
    const f = await both()
    assert.ok(isOk(f.settled), show(f.settled))
  })
  t('UI-UC-01', 'main 5', "core + fishball-ui: the page serves fishball-ui's client entry, the page and the tab; the tab's route answers", async () => {
    const f = await both()
    for (const id of [UI, ...Object.values(UI_PACKAGES)]) assert.ok(f.graph.includes(id), id + ' not in ' + show(f.graph))
    assert.equal(f.tab, ROUTE.ok)
  })
  t('EFIX3-UI-SYS-01', 'standalone', `core + fishball-ui in a real standalone DSH (no --patch child row): ${NOTICE.row} runs with no ${NOTICE.field} (the notice behaves as before)`, async () => {
    const f = await both()
    assert.equal(f.notice.present, true, 'no ' + NOTICE.row + ' row: ' + show(f.notice))
    assert.equal(f.notice.described, true, 'DSH\'s settings service does not describe ' + NOTICE.row + ': ' + show(f.notice))
    assert.equal(f.notice.has, false, show(f.notice))
  })
  t('EFIX3-UI-SYS-01', 'hosted', `a hosted child resolves ${NOTICE.field} to ${NOTICE.version} in a real process`, null, 'out of scope for E-FIX-3 tests (the parent excluded rows that launch a hosted child); EFIX3-UI-DT-01 rule 1 covers it with DSH\'s own evaluator')
  t('UI-UC-01', 'E1', 'core + fishball-ui: no fishball-core-missing line', async () => {
    const f = await both()
    assert.deepEqual(coreMissingLines(f.logs), [])
  })
  t('UI-UC-01', 'A1', 'the owner re-enables a UI row: guards-overridden naming row:<id> (R-FB-09); restoring it clears the report', async () => {
    const f = await both()
    assert.equal(f.override.set?.status, REPORT.overridden, show(f.override.set))
    assert.ok(f.override.set.overridden.includes(REPORT.row(f.override.id)), show(f.override.set))
    assert.ok(isOk(f.override.cleared), show(f.override.cleared))
  })
  t('UI-UC-01', 'A2', "a core row and a UI row on at once: both are named, core's row first (core's rows, then the UI's)", async () => {
    const f = await both()
    const list = f.override.two?.overridden ?? []
    const coreAt = list.indexOf(REPORT.row(CORE_SPLIT.guards[0]))
    const uiAt = list.indexOf(REPORT.row(f.override.id))
    assert.ok(coreAt >= 0 && uiAt >= 0, show(f.override.two))
    assert.ok(coreAt < uiAt, show(list))
  })

  // UI-UC-02 / UI-UC-03 / UI-ST-01 / UI-ST-02 described "fishball-ui without core" and "core
  // without fishball-ui". Since 117cb2a2 the UI is core's ./ui/ component, so neither DSH exists;
  // the core-only scenario above is the one system setup.
  for (const [id, row, title] of [
    ['UI-UC-02', 'main 2', 'fishball-ui alone: the core-missing warning'],
    ['UI-UC-02', 'main 3', 'fishball-ui alone: no DSH row disabled'],
    ['UI-UC-02', 'main 4', 'fishball-ui alone: no Fishball row or client entry'],
    ['UI-ST-01', 'next start', 'fishball-ui alone: one core-missing line per process'],
    ['UI-UC-03', 'main 2', 'core alone: it boots and the report is ok'],
    ['UI-UC-03', 'main 3', 'core alone: the UI rows are on and unreported'],
    ['UI-UC-03', 'main 4', 'core alone: no Fishball log line'],
    ['UI-ST-02', 'enabled live', 'fishball-ui enabled while core runs'],
  ]) t(id, row, title, null, "fishball-ui is core's ./ui/ component since 117cb2a2; there is no separate UI bundle to disable or enable")

  // ================================================================ later
  t('UI-UC-01', 'hosted', "a hosted child holds fishball-ui beside core, with the page and the tab", null, LATER.hosted)
  t('UI-UC-04', 'e2e', 'the entries, cards, strip and pairing warning drawn in a real browser', null, LATER.e2e)
}
