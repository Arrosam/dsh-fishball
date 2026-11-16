/**
 * F-UI black-box cases: fishball-ui as its own bundle (requirements 1.38 Q-N2; R-FB-14, R-FB-01,
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
 *   checkout's core and/or fishball-ui installed (../guards/worker.mjs): core+ui, ui alone, core alone,
 *   and core then ui enabled while it runs.
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
  CLIENT, CONDITION, CORDIS, CORE_CLIENT, CORE_MISSING, CORE_SPLIT, FIXTURE, FORBIDDEN, KEEP_ON, LATER, MOVED, ROUTE, ROWS, SEAM, STARTED, UI_PACKAGE, UI_PACKAGES, WAIT,
} from './constants.mjs'
import {
  CHUNK_FAILS, composedWith, coreConstants, corePatch, disabledWhen, findRows, insertedOf, isExpression, loadChunk, loadClient, namesFile, needUi, rowFile, rowOps,
  seamModule, styleHead, uiManifest, uiPatch,
} from './subject.mjs'

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
/** The guard row op of fishball-ui's patch for `id` (a top-level `{id, disabled}` op). */
async function uiGuardOp(sdk, id) {
  const op = rowOps(await uiPatch(sdk)).find((r) => r.id === id)
  assert.ok(op, `fishball-ui's patch has no row op for ${id}`)
  return op
}
async function uiInserted(sdk, id) {
  const row = insertedOf(await uiPatch(sdk)).find((r) => r.id === id)
  assert.ok(row, `fishball-ui's patch inserts no ${id}`)
  return row
}
/** The core's file at the task's base commit, written into a scratch folder (git show), for the "moved unchanged" rows. */
function baseFile(t, relative) {
  const root = path.dirname(fs.realpathSync(TEST_HOMES))
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

  // ================================================================ UI-UC-06: the package
  t('UI-UC-06', 'main 1', 'fishball-ui exists in packages/fishball-ui and is a root workspace', () => {
    needUi()
    assert.equal(uiManifest().name, UI_PACKAGE.name)
    assert.ok(readManifest(REPO).workspaces?.includes(UI_PACKAGE.workspace), 'root workspaces lack ' + UI_PACKAGE.workspace)
  })
  t('UI-UC-06', 'main 2', `it is a DSH bundle: dsh.bundle.patch ${UI_PACKAGE.patch}, dsh.client.platform ${UI_PACKAGE.platform}`, () => {
    needUi()
    assert.equal(uiManifest()[DSH_FIELD]?.bundle?.patch, UI_PACKAGE.patch)
    assert.equal(uiManifest()[DSH_FIELD]?.client?.platform, UI_PACKAGE.platform)
  })
  t('UI-UC-06', 'main 2', "DSH's own bundle inspection accepts fishball-ui as a bundle named fishball-ui", async () => {
    needUi()
    const answer = await dshInspect(sdk, UI_PACKAGE.dir)
    assert.notEqual(answer.status, SDK.inspect.refused, show(answer))
    assert.equal(answer.bundle, true, show(answer))
    assert.equal(answer.name, UI_PACKAGE.name, show(answer))
  })
  t('UI-EP-02', 'exports', `the export map is exactly ${Object.keys(UI_PACKAGE.exports).join(', ')}, each a shipped file`, () => {
    needUi()
    assert.deepEqual(uiManifest().exports, { ...UI_PACKAGE.exports })
    for (const file of Object.values(UI_PACKAGE.exports)) assert.ok(fs.existsSync(path.join(UI_PACKAGE.dir, file)), file + ' is missing')
  })
  t('UI-UC-06', 'main 3', 'it depends on fishball-shared (dependencies and bundleDependencies)', () => {
    needUi()
    const m = uiManifest()
    assert.ok(Object.hasOwn(m[RUNTIME_DEP_FIELD] ?? {}, UI_PACKAGE.library), UI_PACKAGE.library + ' not in ' + RUNTIME_DEP_FIELD)
    assert.ok(BUNDLED_FIELDS.some((f) => (m[f] ?? []).includes(UI_PACKAGE.library)), UI_PACKAGE.library + ' not bundled')
  })
  t('UI-UC-06', 'main 3', 'the shipped tarball carries every module its rows load (page, tab, core-missing, data, client parts)', async () => {
    needUi()
    const { packed } = await observe()
    const files = packed[UI] ?? []
    assert.ok(files.length > 0, 'fishball-ui is not packed')
    const needed = [...UI_PACKAGE.clientFiles, UI_PACKAGE.patchFile, ...Object.values(ROWS.withCore).map((f) => path.posix.normalize(f)), UI_PACKAGE.exports['./core-missing'].slice(2), MOVED.recommended.after, MOVED.status.after, MOVED.pairing.after]
      .map((f) => f.split(path.sep).join('/'))
    assert.deepEqual(needed.filter((f) => !files.includes(f)), [], 'not packed')
  })
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
  t('UI-BVA-01', 'guards', `fishball-ui's patch has exactly the ${ROWS.guards.length} UI guard row ops, in order: ${ROWS.guards.join(', ')}`, async () => {
    const ops = rowOps(await uiPatch(sdk))
    assert.deepEqual(ops.map((r) => r.id), [...ROWS.guards])
    for (const op of ops) assert.deepEqual(Object.keys(op).sort(), ['disabled', 'id'], op.id + ' is not a bare {id, disabled} row')
  })
  t('UI-BVA-01', 'inserted', `fishball-ui's patch inserts exactly ${ALL_INSERTED.join(', ')}`, async () => {
    assert.deepEqual(insertedOf(await uiPatch(sdk)).map((r) => r.id).sort(), [...ALL_INSERTED].sort())
  })
  for (const [id, file] of Object.entries(ROWS.withCore)) {
    t('UI-UC-06', 'rows', `${id} runs ${file} of fishball-ui (a path row into the package)`, async () => {
      const row = await uiInserted(sdk, id)
      assert.ok(namesFile(row.name, UI_PACKAGE.dir, file), `${id}: ${show(row.name)}`)
    })
  }
  t('UI-UC-06', 'rows', `${ROWS.coreMissing.id} runs ${ROWS.coreMissing.name} (a package subpath, not a path row)`, async () => {
    const row = await uiInserted(sdk, ROWS.coreMissing.id)
    assert.equal(row.name, ROWS.coreMissing.name)
    assert.equal(rowFile(row.name), null)
  })
  for (const [folder, name] of Object.entries(UI_PACKAGES)) {
    t('UI-UC-06', 'rows', `${folder}/ is its own package ${name} with its own ./client (so DSH serves its client apart from fishball-ui's)`, () => {
      const own = readManifest(path.join(UI_PACKAGE.dir, folder))
      assert.equal(own?.name, name)
      assert.ok(Object.hasOwn(own?.exports ?? {}, './client'), folder + ' exports no ./client')
      assert.ok(own?.dsh?.client, folder + ' declares no dsh.client')
    })
  }
  t('UI-DT-01', 'shape', 'every condition in fishball-ui\'s patch is a !!js expression (decided at DSH start), not a fixed boolean', async () => {
    const rows = [...rowOps(await uiPatch(sdk)), ...insertedOf(await uiPatch(sdk))]
    const fixed = []
    for (const r of rows) if (!(await isExpression(sdk, r.disabled))) fixed.push(r.id + ': ' + show(r.disabled))
    assert.deepEqual(fixed, [])
  })
  const kinds = [
    ['UI guard rows', async () => Promise.all(ROWS.guards.map((id) => uiGuardOp(sdk, id))), { started: true, missing: false }],
    ['fishball-ui, fishball-page, fishball-recommend-plugins', async () => Promise.all(Object.keys(ROWS.withCore).map((id) => uiInserted(sdk, id))), { started: false, missing: true }],
    [ROWS.coreMissing.id, async () => [await uiInserted(sdk, ROWS.coreMissing.id)], { started: true, missing: false }],
  ]
  for (const [kind, rowsOf, disabled] of kinds) {
    for (const [rule, started, bundles] of [['core started', true, [CORE, UI]], ['core not started', false, [UI]]]) {
      t('UI-DT-01', `${kind} × ${rule}`, `${kind}: disabled is ${started ? disabled.started : disabled.missing} when the process started ${show(bundles)}`, async () => {
        const wrong = []
        for (const row of await rowsOf()) {
          const value = await disabledWhen(sdk, row, bundles)
          if (value !== (started ? disabled.started : disabled.missing)) wrong.push(row.id + ' → ' + value)
        }
        assert.deepEqual(wrong, [])
      })
    }
  }
  // EP / BVA over startedBundles: only an exact fishball-core entry counts as "core started".
  for (const [label, bundles, coreStarted] of STARTED) {
    t('UI-EP-01', label, `startedBundles ${show(bundles)} → core ${coreStarted ? 'started' : 'not started'}: guard rows ${coreStarted ? 'off' : 'on'}, the page row ${coreStarted ? 'on' : 'off'}, core-missing ${coreStarted ? 'off' : 'on'}`, async () => {
      const guard = await disabledWhen(sdk, await uiGuardOp(sdk, ROWS.guards[0]), bundles)
      const page = await disabledWhen(sdk, await uiInserted(sdk, ROWS.self), bundles)
      const missing = await disabledWhen(sdk, await uiInserted(sdk, ROWS.coreMissing.id), bundles)
      assert.deepEqual({ guard, page, missing }, { guard: coreStarted, page: !coreStarted, missing: coreStarted })
    })
  }
  t('UI-DT-01', 'composed', "composed with DSH's own layers, core's and fishball-ui's patches: every UI guard row exists in DSH and is the row fishball-ui disables (no row of fishball-ui's matches nothing)", async () => {
    const effective = await composedWith(sdk, await corePatch(sdk), await uiPatch(sdk))
    const missing = ROWS.guards.filter((id) => findRows(effective, id).length === 0)
    assert.deepEqual(missing, [], 'UI guard rows DSH does not have on this SDK')
  })

  // ================================================================ UI-UC-08: core's patch after the split
  t('UI-UC-08', 'main', `core's patch holds none of the ${ROWS.guards.length} UI guard rows nor the page / tab rows`, async () => {
    const patch = await corePatch(sdk)
    const ids = [...rowOps(patch).map((r) => r.id), ...insertedOf(patch).map((r) => r.id)]
    assert.deepEqual(ids.filter((id) => ROWS.guards.includes(id) || Object.keys(ROWS.withCore).includes(id) || id === ROWS.coreMissing.id), [])
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
  t('UI-UC-06', 'moved', 'src/pairing/text.js: PAIRING_TEXT answers as core\'s ui/pairing/text.js did (every key, every formatter, en and zh)', async (c) => {
    const now = (await import(pathToFileURL(path.join(UI_PACKAGE.dir, MOVED.pairing.after)).href))[MOVED.pairing.export]
    const before = (await import(pathToFileURL(baseFile(c, MOVED.pairing.before)).href))[MOVED.pairing.export]
    const picture = (o) => Object.fromEntries(Object.entries(o).map(([lang, words]) => [lang, Object.fromEntries(Object.entries(words).map(([k, v]) => [k, typeof v === 'function' ? v(...MOVED.args) : v]))]))
    assert.deepEqual(picture(now), picture(before))
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
    const { registrations } = loadClient({ chunks: {} })
    assert.deepEqual(registrations.map((r) => [r.id, r.chunk]), [[CLIENT.moduleId, undefined]])
  })
  /** Apply fishball-ui's client in a Cordis root of `sdk`; chunk stand-ins record the kit and the started parts. */
  async function startClient(c, how) {
    const started = []
    const kits = []
    const standIn = (file, exportName) => () => ({ [exportName]: (kit) => { kits.push({ file, kit }); return { name: FIXTURE.partName(file), apply() { started.push(file) } } } })
    const chunks = Object.fromEntries(Object.values(CLIENT.parts).map((p) => [p.file, how[p.file] === CHUNK_FAILS ? CHUNK_FAILS : standIn(p.file, p.export)]))
    let styles
    const client = loadClient({ chunks, prepare: (page) => { styles = styleHead(page) } })
    const { failed } = await applyIn(c, client.exports)
    return { ...client, started, kits, failed, styles }
  }
  // Re-baselined (F-WIRE lead, 2026-11-17): "client.js now loads FOUR parts: client.entries.js, client.asks.js,
  // client.strip.js (the status strip, stripPart) and client.model.js (the model dialog, modelPart)".
  t('UI-UC-04', 'main 2', `its plugin loads ${Object.values(CLIENT.parts).map((p) => './' + p.file).join(', ')} and starts each part`, async (c) => {
    needUi()
    const r = await startClient(c, {})
    assert.deepEqual([...r.loads].sort(), Object.values(CLIENT.parts).map((p) => './' + p.file).sort())
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
    const h = await boot(bootEnv({ members: [UI, CORE] }))
    f.started = await h.call('startedBundles')
    f.report = await waitReport(h, (r) => r !== null, G_BUDGET.readyMs)
    f.settled = await waitReport(h, isOk, G_BUDGET.readyMs)
    f.rows = await h.call('rows', { ids: [...ROWS.guards, ...ALL_INSERTED] })
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
  t('UI-UC-01', 'main 1', 'core + fishball-ui: both are started bundles of the process', async () => {
    const f = await both()
    for (const name of [CORE, UI]) assert.ok(f.started.includes(name), show(f.started))
  })
  t('UI-UC-01', 'main 2', `core + fishball-ui: the ${ROWS.guards.length} UI guard rows are disabled`, async () => {
    const f = await both()
    assert.deepEqual(f.rows.filter((r) => ROWS.guards.includes(r.id) && r.present && !r.disabled).map((r) => r.id), [])
  })
  t('UI-UC-01', 'main 2', 'core + fishball-ui: fishball-ui, fishball-page and fishball-recommend-plugins run; the core-missing row is off', async () => {
    const f = await both()
    const state = Object.fromEntries(f.rows.map((r) => [r.id, r]))
    for (const id of Object.keys(ROWS.withCore)) assert.ok(state[id]?.present && !state[id].disabled && state[id].active, id + ': ' + show(state[id]))
    assert.ok(!state[ROWS.coreMissing.id]?.present || state[ROWS.coreMissing.id].disabled, show(state[ROWS.coreMissing.id]))
  })
  // Re-baselined (F-WIRE): eight ids, ui-model-selection last ("Hide it. Only core's settings choose the model").
  t('UI-UC-01', 'main 3', `core + fishball-ui: ${CONDITION.service2}.rows is the ${ROWS.guards.length} guard ids, frozen, in patch order`, async () => {
    const f = await both()
    assert.ok(f.service.present, 'no ' + CONDITION.service2 + ' service')
    assert.deepEqual(f.service.value.rows, [...ROWS.guards])
    assert.equal(f.service.frozen.rows, true, 'rows is not frozen')
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

  // Scenario UI ALONE (UI-UC-02, Q-G2 = A), booted twice for UI-ST-01.
  const alone = scenario('v3-fui-alone', sdk, [async (boot, f) => {
    const h = await boot(bootEnv({ members: [UI] }))
    f.rows = await h.call('rows', { ids: [...ROWS.guards, ...ALL_INSERTED] })
    f.disabled = await h.call('disabledIds')
    f.service = await h.call('service', { name: CONDITION.service2 })
    f.graph = (await bootGraph({ origin: h.origin, cookie: h.cookie })).map((e) => e.id)
    f.tab = (await fetch(h.origin + ROUTE.recommended, { headers: { cookie: h.cookie } })).status
    f.logs1 = await h.call('logs')
  }, async (boot, f) => {
    const h = await boot(bootEnv())
    f.logs2 = await h.call('logs')
  }])
  // The DSH a test compares with: the same worker with no Fishball bundle (what is disabled anyway).
  const plain = scenario('v3-fui-plain', sdk, [async (boot, f) => {
    const h = await boot(bootEnv({ members: [] }))
    f.disabled = await h.call('disabledIds')
  }])
  t('UI-UC-02', 'main 2', 'fishball-ui alone: exactly one warn line fishball-core-missing under logger fishball-ui (UI-BVA-01)', async () => {
    const f = await alone()
    const lines = coreMissingLines(f.logs1)
    assert.equal(lines.length, 1, show(lines))
    assert.ok(isCoreMissingLine(lines[0]), show(lines[0]))
  })
  t('UI-UC-02', 'main 2', 'fishball-ui alone: fishball-ui logs nothing else', async () => {
    const f = await alone()
    assert.deepEqual(f.logs1.filter((l) => l.name === CORE_MISSING.logger && !isCoreMissingLine(l)), [])
  })
  t('UI-UC-02', 'main 3', `fishball-ui alone: no DSH row is disabled by it (the ${ROWS.guards.length} UI rows run; the disabled set equals a DSH without Fishball)`, async () => {
    const [f, p] = await Promise.all([alone(), plain()])
    assert.deepEqual(f.rows.filter((r) => ROWS.guards.includes(r.id) && r.present && r.disabled).map((r) => r.id), [], 'UI rows disabled')
    const extra = f.disabled.filter((id) => !p.disabled.includes(id) && !ALL_INSERTED.includes(id))
    assert.deepEqual(extra, [], 'rows disabled only because fishball-ui is installed')
  })
  t('UI-UC-02', 'main 4', 'fishball-ui alone: no fishball row runs (fishball-ui, fishball-page, fishball-recommend-plugins off)', async () => {
    const f = await alone()
    const state = Object.fromEntries(f.rows.map((r) => [r.id, r]))
    for (const id of Object.keys(ROWS.withCore)) assert.ok(!state[id]?.present || (state[id].disabled && !state[id].active), id + ': ' + show(state[id]))
  })
  t('UI-UC-02', 'main 4', `fishball-ui alone: no ${CONDITION.service2} service`, async () => {
    const f = await alone()
    assert.equal(f.service.present, false, show(f.service))
  })
  t('UI-UC-02', 'main 4', "fishball-ui alone: no Fishball client entry is served and the tab's route is absent", async () => {
    const f = await alone()
    assert.deepEqual(f.graph.filter((id) => /fishball/i.test(id)), [])
    assert.notEqual(f.tab, ROUTE.ok)
  })
  t('UI-ST-01', 'next start', 'fishball-ui alone, the next start: again exactly one fishball-core-missing line in that process', async () => {
    const f = await alone()
    const lines = coreMissingLines(f.logs2)
    assert.equal(lines.length, 1, show(lines))
    assert.ok(isCoreMissingLine(lines[0]), show(lines[0]))
  })

  // Scenario CORE ALONE (UI-UC-03, Q-G1), with the owner keeping one UI row on; then fishball-ui enabled live (UI-ST-02).
  const coreAlone = scenario('v3-fui-core', sdk, [async (boot, f) => {
    const h = await boot(bootEnv({ members: [CORE], deselected: [UI] }))
    f.report = await waitReport(h, (r) => r !== null, G_BUDGET.readyMs)
    f.settled = await waitReport(h, isOk, G_BUDGET.readyMs)
    f.rows = await h.call('rows', { ids: [...ROWS.guards] })
    f.service = await h.call('service', { name: CONDITION.service2 })
    f.logs = await h.call('logs')
    f.alive = (await fetch(h.origin + '/', { headers: { cookie: h.cookie } })).status
    // UI-ST-02: the owner enables fishball-ui while core runs and keeps one UI row on in the profile patch.
    await h.call('writeProfilePatch', { text: KEEP_ON.patch(KEEP_ON.row) })
    await h.call('setBundleEnabled', { name: UI, enabled: true })
    await until(async () => (await h.call('service', { name: CONDITION.service2 })).present, G_BUDGET.recomposeMs, G_BUDGET.pollMs)
    f.serviceLater = await h.call('service', { name: CONDITION.service2 })
    f.reportLater = await waitReport(h, (r) => r?.overridden?.includes(REPORT.row(KEEP_ON.row)))
  }])
  t('UI-UC-03', 'main 2', 'core alone: it boots and the guard report is ok', async () => {
    const f = await coreAlone()
    assert.ok(f.alive < 400, 'page status ' + f.alive)
    assert.ok(isOk(f.settled), show(f.settled))
  })
  t('UI-UC-03', 'main 3', 'core alone: the UI rows are on (DSH\'s), yet none is reported; no fishballUiGuards', async () => {
    const f = await coreAlone()
    assert.ok(f.rows.some((r) => r.present && !r.disabled), 'precondition: a UI row of DSH runs: ' + show(f.rows))
    assert.deepEqual((f.settled?.overridden ?? []).filter((g) => ROWS.guards.some((id) => g === REPORT.row(id))), [])
    assert.equal(f.service.present, false)
  })
  t('UI-UC-03', 'main 4', 'core alone: no log line names fishball-ui or fishball-core-missing (Q-G1)', async () => {
    const f = await coreAlone()
    assert.deepEqual(f.logs.filter((l) => l.name === UI || l.text.includes(UI) || l.text.includes(CORE_MISSING.text)), [])
  })
  t('UI-ST-02', 'enabled live', `fishball-ui enabled while core runs: ${CONDITION.service2} appears and core re-checks: a UI row kept on is reported`, async () => {
    const f = await coreAlone()
    assert.ok(f.serviceLater.present, 'no ' + CONDITION.service2 + ' after enabling fishball-ui')
    assert.ok(f.reportLater?.overridden?.includes(REPORT.row(KEEP_ON.row)), show(f.reportLater))
  })

  // ================================================================ later
  t('UI-UC-01', 'hosted', "a hosted child holds fishball-ui beside core, with the page and the tab", null, LATER.hosted)
  t('UI-UC-04', 'e2e', 'the entries, cards, strip and pairing warning drawn in a real browser', null, LATER.e2e)
}
