/**
 * The packages the umbrella's rows read: fishball-amenities itself (this folder's package) and the
 * packages its manifest depends on (fishball-board, fishball-heartbeat, fishball-taskboard,
 * fishball-shared), each found BY NAME as Node resolves it from here — the umbrella bundles them
 * (bundleDependencies), so their manifests and icons ship inside its tarball. No other package of the
 * repository is reached (docs/testing/README.md "Independence, enforced").
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
export const MANIFEST_FILE = 'package.json'

/** The release version every package of the split carries (the user's decision, 2026-11-21). */
export const VERSION = '1.0.0-alpha.1'

/**
 * The packages of the split. `browser`: the package has browser code (the lead's layout: the
 * umbrella's settings-page hint and fishball-taskboard's Task board tab), so it, and only it, carries dsh.client.
 * `own`: this package (located by its folder, not by name).
 */
const pkg = (name, browser, own = false) => Object.freeze({ name, browser, own })
export const UMBRELLA = pkg('fishball-amenities', true, true)
export const MEMBERS = Object.freeze([pkg('fishball-board', false), pkg('fishball-heartbeat', false), pkg('fishball-taskboard', true)])
export const PACKAGES = Object.freeze([...MEMBERS, UMBRELLA])
/** The Fishball side's library the members bundle (no dsh field: not a plugin). */
export const LIBRARY = pkg('fishball-shared', false)

const OWN_DIR = path.resolve(import.meta.dirname, '..', '..')
const dirs = new Map()
/** A package's folder (realpath): this package's own, or a dependency's as Node resolves its manifest from here. */
export function dirOf(p) {
  if (!dirs.has(p.name)) dirs.set(p.name, fs.realpathSync(p.own ? OWN_DIR : path.dirname(require.resolve(p.name + '/' + MANIFEST_FILE))))
  return dirs.get(p.name)
}
export const manifestOf = (p) => JSON.parse(fs.readFileSync(path.join(dirOf(p), MANIFEST_FILE), 'utf8'))
/** A file of a package, named by its package-relative path. */
export const fileOf = (p, ...parts) => path.join(dirOf(p), ...parts)
