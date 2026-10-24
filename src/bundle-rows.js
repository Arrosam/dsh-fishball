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
import { bundlePatchPaths, loadOverlayPatches, resolveBundleDir } from '@deepseek-ai/dsh-app-boot'
import { PLUGIN, PLUGIN_ERROR } from './constants.js'

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
  const dir = resolveBundleDir(PLUGIN.name, bundle.name, profile.installAnchor, profile.dir)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
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
