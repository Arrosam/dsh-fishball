/**
 * Core's bundle patch as the current DSH reads it: parsed by dsh-app-boot `loadOverlayPatches`, composed
 * after DSH's shipped bundles by `composeEntries` (`bundlePatchPaths` of dsh-base and dsh-web-app), and a
 * row value resolved by DSH's own loader (cordis-plugin-loader `interpolate`) against a real Cordis
 * Context that provides `profileContext` (and `hmr`) as DSH's Loader does at entry activation.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dshPackageDir, importDsh } from 'fishball-test-helpers/dsh'
import { NAME, fileOf } from './packages.mjs'

export const PATCH = Object.freeze({
  file: 'cordis.patch.yml', label: 'fbtest-int-core-ui', shipped: Object.freeze(['dsh-base', 'dsh-web-app']),
  profileContext: 'profileContext', hmr: 'hmr',
})

export async function corePatch() {
  const { loadOverlayPatches } = await importDsh('dsh-app-boot')
  return loadOverlayPatches(PATCH.label, fileOf(NAME.core, PATCH.file))
}
/** The top-level row ops of a patch list (no insert), and every inserted row. */
export const rowOps = (patches) => patches.filter((op) => op && !Array.isArray(op.insert) && op.id !== undefined)
export const insertedOf = (patches) => patches.flatMap((op) => (Array.isArray(op?.insert) ? op.insert : []))
/** A row module name as a file path, or null for a package name or subpath. */
export function rowFile(name) {
  if (typeof name !== 'string') return null
  if (name.startsWith('file:')) return fileURLToPath(name)
  return path.isAbsolute(name) ? name : null
}

/** DSH's shipped bundles, then `layers` (patch lists), composed by DSH. */
export async function composedWith(...layers) {
  const boot = await importDsh('dsh-app-boot')
  const shipped = PATCH.shipped.map((name) => {
    const dir = dshPackageDir(name)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return boot.bundlePatchPaths(dir, manifest.dsh.bundle).flatMap((file) => boot.loadOverlayPatches(PATCH.label, file))
  })
  return boot.composeEntries([...shipped, ...layers])
}
export function findRows(rows, id, out = []) {
  for (const row of rows) {
    if (row?.id === id) out.push(row)
    if (row?.group && Array.isArray(row.config)) findRows(row.config, id, out)
    if (Array.isArray(row?.config?.plugins)) findRows(row.config.plugins, id, out)
  }
  return out
}
/** A patch value as DSH's Loader resolves it; `profileContext` null: none provided. */
export async function resolvedWith(value, profileContext, { hmr = false } = {}) {
  const [{ Context }, { interpolate }] = await Promise.all([importDsh('cordis'), importDsh('cordis-plugin-loader')])
  const ctx = new Context()
  if (profileContext !== null) ctx.provide(PATCH.profileContext, Object.freeze({ ...profileContext }))
  if (hmr) ctx.provide(PATCH.hmr, Object.freeze({}))
  try { return interpolate(ctx, { value }).value } finally { await ctx.fiber?.dispose?.() }
}
export const profileContextOf = (startedBundles, overlays = []) => ({ startedBundles: Object.freeze([...startedBundles]), overlays: Object.freeze([...overlays]) })
