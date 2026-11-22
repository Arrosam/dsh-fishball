/**
 * Core's own published files, read as DSH reads them (the static rows of the wire, package and
 * child-plugins areas): its manifest, its bundle patch parsed by the current DSH's dsh-app-boot
 * (loadOverlayPatches) and composed with DSH's shipped bundles (composeEntries), a `!!js` row value
 * resolved by DSH's own loader (cordis-plugin-loader interpolate) against a real cordis Context, and
 * the import specifiers of core's shipped source. No product module is loaded.
 *
 * Owned by the wire area (packages/core/tests/support/ is port-core-wire's).
 */
import fs from 'node:fs'
import path from 'node:path'
import { dshPackageDir, importDsh } from 'fishball-test-helpers/dsh'

export const CORE_FILES = Object.freeze({
  dir: path.join(import.meta.dirname, '..', '..'),
  manifest: 'package.json', patch: 'cordis.patch.yml', label: 'fbtest-core-static', encoding: 'utf8',
  /** DSH's shipped bundles every profile composes before a Fishball bundle. */
  shipped: Object.freeze(['dsh-base', 'dsh-web-app']),
  /** Folders of core's folder that are not core's shipped source: its tests and fishball-ui (its own package). */
  scanSkip: Object.freeze(['node_modules', '.git', 'tests', 'ui']),
  source: /\.(?:[cm]?js|tsx?)$/,
  specifier: /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s*)['"]([^'"]+)['"]/g,
  profileContext: 'profileContext',
})
const F = CORE_FILES

export const coreManifest = () => JSON.parse(fs.readFileSync(path.join(F.dir, F.manifest), F.encoding))

/** A patch file as the current DSH parses it. */
export async function patchOf(dir, file) {
  const { loadOverlayPatches } = await importDsh('dsh-app-boot')
  return loadOverlayPatches(F.label, path.join(dir, file))
}
export const corePatchRows = () => patchOf(F.dir, F.patch)

/** The entry list DSH composes from its shipped bundles, then `layers` (patch lists) in order. */
export async function composedWith(...layers) {
  const boot = await importDsh('dsh-app-boot')
  const shipped = F.shipped.map((name) => {
    const dir = dshPackageDir(name)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, F.manifest), F.encoding))
    return boot.bundlePatchPaths(dir, manifest.dsh.bundle).flatMap((file) => boot.loadOverlayPatches(F.label, file))
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
/** Every row a patch list inserts, nested rows included (a group's config list, a preset's plugins). */
export function insertedRows(patches) {
  const walk = (row) => {
    const children = Array.isArray(row?.config) ? row.config : Array.isArray(row?.config?.plugins) ? row.config.plugins : []
    return [row, ...children.flatMap(walk)]
  }
  return patches.flatMap((p) => (p?.insert ?? []).flatMap(walk))
}
/** A row value (a `!!js` expression or a plain value) as DSH's loader resolves it; `profileContext` null: none provided. */
export async function resolvedWith(value, profileContext) {
  const [{ Context }, { interpolate }] = await Promise.all([importDsh('cordis'), importDsh('cordis-plugin-loader')])
  const ctx = new Context()
  if (profileContext !== null) ctx.provide(F.profileContext, Object.freeze({ ...profileContext }))
  try { return interpolate(ctx, { value }).value } finally { await ctx.fiber?.dispose?.() }
}

/** Every import specifier of core's shipped source files: `{file, specifier}` (paths relative to core). */
export function coreImports() {
  const found = []
  const visit = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (F.scanSkip.includes(e.name)) continue
      const file = path.join(dir, e.name)
      if (e.isDirectory()) visit(file)
      else if (F.source.test(file)) for (const m of fs.readFileSync(file, F.encoding).matchAll(F.specifier)) found.push({ file: path.relative(F.dir, file), specifier: m[1] })
    }
  }
  visit(F.dir)
  return found
}