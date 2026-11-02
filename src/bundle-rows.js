/**
 * The rows a Fishball-only plugin mounts in the private tree (DESIGN §4 "Mounting a
 * Fishball-only plugin"). They are read from the bundle's own patch files, which DSH's
 * plugin manager reports through `listBundles` (rows, overrides) and app-boot parses with
 * the same loader as the profile (`loadOverlayPatches`).
 *
 * A bundle can run Fishball-only only when its patch adds its own top-level rows and edits
 * nothing else (spike S1). Edits are:
 * - `overrides` non-empty: it configures or disables host rows;
 * - a patch entry with an `id`: with no `insert` it edits that row; with `insert` it inserts
 *   INTO that row's group (cordis-plugin-include), which edits a host row too (review M8a).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { bundlePatchPaths, loadOverlayPatches, resolveBundleDir } from '@deepseek-ai/dsh-app-boot'
import { ModuleLoader } from '@deepseek-ai/cordis-plugin-loader'
import { FISHBALL_PACKAGES, PLUGIN, PLUGIN_ERROR } from './constants.js'

/** A module name that is a URL (file:, cordis:, ...) rather than a bare package specifier. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const EMPTY_ATTRIBUTES = Object.freeze({})

/** Thrown with a PLUGIN_ERROR code when a bundle cannot run Fishball-only. */
export class BundleRowsError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

/**
 * Read the rows one installed bundle inserts.
 * @param bundle - BundleInfo from `pluginManager.listBundles()`.
 * @param profile - `ctx.profileContext` ({ dir, installAnchor }).
 * @returns detached EntryOptions, in declaration order.
 * @throws BundleRowsError(editsOtherRows | noRows | noProfile); a missing or unparsable file
 *   throws its own error, which the caller maps to a stable code.
 */
export function readBundleRows(bundle, profile) {
  if (profile === undefined) throw new BundleRowsError(PLUGIN_ERROR.noProfile)
  if (bundle.overrides.length > 0) throw new BundleRowsError(PLUGIN_ERROR.editsOtherRows)
  return readPackageRows(resolveBundleDir(PLUGIN.name, bundle.name, profile.installAnchor, profile.dir))
}

/**
 * Read the rows the bundle package in `dir` inserts (its own patch files). A patch entry that
 * edits another row is refused here, which also covers what `listBundles` reports as overrides.
 * @returns detached EntryOptions, in declaration order.
 * @throws BundleRowsError(editsOtherRows | noRows); a missing or unparsable file throws its own error.
 */
export function readPackageRows(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, FISHBALL_PACKAGES.manifest), 'utf8'))
  const rows = []
  for (const file of bundlePatchPaths(dir, manifest.dsh.bundle)) {
    for (const patch of loadOverlayPatches(PLUGIN.name, file)) {
      if (patch.id !== undefined || patch.insert === undefined) throw new BundleRowsError(PLUGIN_ERROR.editsOtherRows)
      rows.push(...patch.insert)
    }
  }
  if (rows.length === 0) throw new BundleRowsError(PLUGIN_ERROR.noRows)
  return structuredClone(rows)
}

/**
 * Rows of a package that lives outside the DSH profile (Fishball's own package folder), with
 * every bare module name resolved from that package to a file URL. The private tree imports
 * bare names from the profile's base URL, where this package is not installed, or where a DSH
 * plugin of the same name is a different package. Resolving from the package's own directory
 * goes through DSH's runtime resolution, so its peers are the host's packages (spike S22).
 * Paths and URLs are left as they are (`loadOverlayPatches` already made paths file URLs).
 * @param rows - detached rows from readPackageRows; @param dir - the package directory.
 * @returns new rows (group children included).
 * @throws when Node's module loader is unavailable or a module cannot be resolved; the caller
 *   reports that as a row failure.
 */
export function anchorRowModules(rows, dir) {
  const internal = ModuleLoader.fromInternal()
  if (internal === undefined) throw new BundleRowsError(PLUGIN_ERROR.rowFailed)
  const parentURL = pathToFileURL(path.join(dir, FISHBALL_PACKAGES.manifest)).href
  // The two loader shapes take their arguments in a different order (cordis-plugin-loader internal.d.ts).
  const resolve = (specifier) => (internal.version === 'v1'
    ? internal.resolveSync(specifier, parentURL, EMPTY_ATTRIBUTES)
    : internal.resolveSync(parentURL, { specifier, attributes: EMPTY_ATTRIBUTES })).url
  const anchor = (row) => ({
    ...row,
    ...(typeof row.name === 'string' && !URL_SCHEME.test(row.name) && !row.name.startsWith('.') && !path.isAbsolute(row.name) ? { name: resolve(row.name) } : {}),
    ...(row.group && Array.isArray(row.config) ? { config: row.config.map(anchor) } : {}),
  })
  return rows.map(anchor)
}
