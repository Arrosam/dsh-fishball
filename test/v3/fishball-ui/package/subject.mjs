/**
 * What the F-UI cases read, and how. Black box: manifests and patch files are read through DSH's own
 * loaders of the SDK under test (dsh-app-boot `loadOverlayPatches`, `bundlePatchPaths`,
 * `composeEntries`); a row's `!!js` condition is evaluated by the SDK's own loader evaluator
 * (cordis-plugin-loader `evaluate`) against a real Cordis Context of that SDK that provides
 * `profileContext`, exactly as DSH's Loader evaluates `disabled` at entry activation. The browser
 * scripts run unread in support/browser-sandbox.mjs. Only the shared library's `ui-seam` module and
 * core's constants module (both data-only) are imported.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { readManifest } from '../../contract/package-boundaries/packages.mjs'
import { runtimeOf } from '../../fishball-core/package/constants.mjs'
import { importBound } from '../../shared/dsh-host/subject.mjs'
import { CONDITION, CORE_SPLIT, FIXTURE, SEAM, UI_PACKAGE } from './constants.mjs'

const SDK_SCOPE = '@deepseek-ai/'
const sdkModule = (sdk, name) => import(pathToFileURL(path.join(runtimeOf(sdk), SDK_SCOPE + name, 'lib', 'index.js')).href)
const LABEL = 'fbtest-f-ui'
/** loadClient's word for a chunk whose load rejects (the cases pass it). */
export const CHUNK_FAILS = 'fail'

export const uiManifest = () => readManifest(UI_PACKAGE.dir)
export const needUi = () => assert.ok(uiManifest(), 'packages/fishball-ui/package.json is missing (F-UI interface item 1)')

/** A bundle's patch as `sdk`'s DSH parses it (relative module names become file: URLs). */
export async function patchOf(sdk, dir, file) {
  const { loadOverlayPatches } = await sdkModule(sdk, 'dsh-app-boot')
  return loadOverlayPatches(LABEL, path.join(dir, file))
}
export const uiPatch = (sdk) => { needUi(); return patchOf(sdk, UI_PACKAGE.dir, UI_PACKAGE.patchFile) }
export const corePatch = (sdk) => patchOf(sdk, V3.core.dir, UI_PACKAGE.patchFile)

/** The top-level row ops of a patch list (no insert), and every inserted row. */
export const rowOps = (patches) => patches.filter((op) => op && !Array.isArray(op.insert) && op.id !== undefined)
export const insertedOf = (patches) => patches.flatMap((op) => (Array.isArray(op?.insert) ? op.insert : []))

/** A row module name as a file path, or null for a package name / subpath. */
export function rowFile(name) {
  if (typeof name !== 'string') return null
  if (name.startsWith('file:')) return fileURLToPath(name)
  return path.isAbsolute(name) ? name : null
}
/** Whether a row's `name` is `relative` inside `dir` (DSH anchors relative names to the patch file). */
export const namesFile = (name, dir, relative) => rowFile(name) === path.join(dir, relative)

/** Whether a value is a loader `!!js` expression node (the SDK's own predicate). */
export async function isExpression(sdk, value) {
  const { isJsExpr } = await sdkModule(sdk, 'cordis-plugin-loader')
  return isJsExpr(value)
}

/**
 * The effective `disabled` of a row in a DSH process started with `startedBundles`: a `!!js`
 * expression evaluated by the SDK's Loader evaluator against a Context providing `profileContext`,
 * or the plain boolean.
 */
export async function disabledWhen(sdk, row, startedBundles) {
  const [{ Context }, { evaluate, isJsExpr }] = await Promise.all([sdkModule(sdk, 'cordis'), sdkModule(sdk, 'cordis-plugin-loader')])
  if (!isJsExpr(row.disabled)) return Boolean(row.disabled)
  const ctx = new Context()
  ctx.provide(CONDITION.service, { startedBundles: Object.freeze([...startedBundles]) })
  try { return Boolean(evaluate(ctx, row.disabled.__jsExpr)) } finally { await ctx.fiber?.dispose?.() }
}

/** dsh-base + dsh-web-app of `sdk`, then the given bundle patches, composed by DSH (no process). */
export async function composedWith(sdk, ...layers) {
  const boot = await sdkModule(sdk, 'dsh-app-boot')
  const shipped = ['dsh-base', 'dsh-web-app'].map((name) => {
    const dir = path.join(runtimeOf(sdk), SDK_SCOPE + name)
    return boot.bundlePatchPaths(dir, readManifest(dir).dsh.bundle).flatMap((file) => boot.loadOverlayPatches(LABEL, file))
  })
  return boot.composeEntries([...shipped, ...layers])
}
/** Every row with `id` in a composed entry list, nested group and preset rows included. */
export function findRows(rows, id, out = []) {
  for (const row of rows) {
    if (row?.id === id) out.push(row)
    if (row?.group && Array.isArray(row.config)) findRows(row.config, id, out)
    if (Array.isArray(row?.config?.plugins)) findRows(row.config.plugins, id, out)
  }
  return out
}

/** fishball-shared's ui-seam module and core's constants module (both data only). */
export async function seamModule() {
  assert.ok(fs.existsSync(SEAM.file), 'packages/shared/ui-seam.js is missing (F-UI interface item 7)')
  return import(pathToFileURL(SEAM.file).href)
}
export const coreConstants = () => import(pathToFileURL(CORE_SPLIT.constantsFile).href)

// ------------------------------------------------------------------------------------- browser

/**
 * Run fishball-ui's `client.js` unread in a scripted page and materialize its module (DSH's module
 * loader face: `require`, `require.async('./<chunk>')`, `require.asset`). `chunks` decides what a
 * chunk load gives: `'real'` runs the real chunk file, `'fail'` rejects, a function `(file) => exports`
 * stands in for it. Returns the registrations, the module's exports, every chunk load and require.
 */
export function loadClient({ chunks = {}, platform = {}, dir = UI_PACKAGE.dir, file: entryFile = UI_PACKAGE.clientFiles[0], prepare = () => {} } = {}) {
  const page = createBrowserSandbox({ lang: 'en', baseURI: FIXTURE.baseURI, fetch: async () => new Response('', { status: 404 }) })
  prepare(page)
  const run = (file) => page.run(fs.readFileSync(file, 'utf8'), file, pathToFileURL(file).href)
  run(path.join(dir, entryFile))
  const entry = page.registrations.find((r) => r.chunk === undefined)
  const loads = []
  const required = []
  const requireFor = () => {
    const require = (spec) => {
      required.push(spec)
      if (spec in platform) return platform[spec]
      throw new Error('fbtest scripted page: unexpected require ' + JSON.stringify(spec))
    }
    require.async = async (spec) => {
      loads.push(spec)
      const file = spec.replace(/^\.\//, '')
      const how = chunks[file] ?? 'real'
      if (how === CHUNK_FAILS) throw new Error(FIXTURE.chunkFault)
      if (typeof how === 'function') return how(file)
      run(path.join(dir, file))
      const reg = page.registrations.find((r) => r.chunk === file)
      if (!reg) throw new Error('the chunk ' + file + ' registered nothing')
      return reg.factory(requireFor())
    }
    require.asset = (reference) => reference
    return require
  }
  const exports = entry ? entry.factory(requireFor()) : undefined
  return { page, registrations: page.registrations, entry, exports, loads, required, run }
}

/** Run one chunk file alone and materialize it (its registration and exports). */
export function loadChunk(file, platform = {}) {
  const page = createBrowserSandbox({ lang: 'en', baseURI: FIXTURE.baseURI, fetch: async () => new Response('', { status: 404 }) })
  page.run(fs.readFileSync(path.join(UI_PACKAGE.dir, file), 'utf8'), file)
  const required = []
  const regs = page.registrations
  const require = Object.assign((spec) => { required.push(spec); if (!(spec in platform)) throw new Error('unexpected require ' + spec); return platform[spec] }, { async: async () => ({}), asset: (r) => r })
  const exports = regs.length === 1 ? regs[0].factory(require) : undefined
  return { registrations: regs, exports, required, page }
}

/** A fake `document.head` that keeps appended `<style>` elements (id, textContent) and removes them on `remove()`. */
export function styleHead(page) {
  const styles = []
  const element = (tag) => {
    const node = { tagName: String(tag).toUpperCase(), id: '', textContent: '', attributes: {}, setAttribute(k, v) { node.attributes[k] = String(v); if (k === 'id') node.id = String(v) }, remove() { const at = styles.indexOf(node); if (at >= 0) styles.splice(at, 1) }, append() {}, appendChild() {}, style: {} }
    return node
  }
  page.document.createElement = element
  const add = (node) => { styles.push(node); return node }
  page.document.head = { append: (...nodes) => nodes.forEach(add), appendChild: add, removeChild: (node) => node.remove() }
  page.document.getElementById = (id) => styles.find((s) => s.id === id) ?? null
  page.document.querySelector = (selector) => styles.find((s) => '#' + s.id === selector || `style#${s.id}` === selector) ?? null
  return styles
}

/**
 * E-FIX-3 (B7): a row's `config` as DSH's Loader resolves it at entry activation: every `!!js`
 * node evaluated by the SDK's own `interpolate` (cordis-plugin-loader; `evaluate` is
 * `new Function('ctx', 'expr', 'with (ctx) { return eval(expr) }')`) against a real Cordis Context
 * of that SDK, which provides `profileContext` when one is given (`null`: no `profileContext`, a
 * Cordis context outside a dsh-launched profile).
 */
export async function configWhen(sdk, config, profileContext) {
  const [{ Context }, { interpolate }] = await Promise.all([sdkModule(sdk, 'cordis'), sdkModule(sdk, 'cordis-plugin-loader')])
  const ctx = new Context()
  if (profileContext !== null) ctx.provide(CONDITION.service, Object.freeze({ ...profileContext }))
  try { return interpolate(ctx, config) } finally { await ctx.fiber?.dispose?.() }
}
/** A `profileContext` with the facts the decision reads (`startedBundles`, `overlays`). */
export const profileContextOf = (startedBundles, overlays) => ({ startedBundles: Object.freeze([...startedBundles]), overlays: Object.freeze([...overlays]) })
/**
 * Re-baselined (R-FIX-FUI F2): fishball-ui's guard-row reader (src/guards.js) is gone; the UI guard
 * rows are core's, read by core's `readIntendedGuards()` (src/guards/intended.js, the requirement's
 * public name), imported bound to `sdk` (its `@deepseek-ai/*` imports, dsh-app-boot among them,
 * resolve to that SDK, as in a DSH process; the repository installs no DSH package itself).
 */
export const coreIntendedReader = async (sdk) => (await importBound(sdk, path.join(V3.core.dir, 'src', 'guards', 'intended.js'))).readIntendedGuards

/**
 * R-FIX-FUI F2: any patch value (a `!!js` node, a plain value, or an object holding them) as DSH's
 * Loader resolves it, by the SDK's own `interpolate`, against a real Cordis Context of that SDK that
 * provides `profileContext` (when not null) and, when `hmr` is true, an `hmr` service (DSH's live
 * reload row, present in a standalone DSH by default). The value is wrapped so a bare `!!js` node
 * and a plain boolean resolve alike.
 */
export async function resolvedWith(sdk, value, profileContext, { hmr = false } = {}) {
  const [{ Context }, { interpolate }] = await Promise.all([sdkModule(sdk, 'cordis'), sdkModule(sdk, 'cordis-plugin-loader')])
  const ctx = new Context()
  if (profileContext !== null) ctx.provide(CONDITION.service, Object.freeze({ ...profileContext }))
  if (hmr) ctx.provide(CONDITION.hmr, Object.freeze({}))
  try { return interpolate(ctx, { value }).value } finally { await ctx.fiber?.dispose?.() }
}
