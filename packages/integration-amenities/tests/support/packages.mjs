/**
 * The packages these rows read, each found BY NAME (fishball-test-helpers/packages' catalogue of the
 * workspace), never by a folder string: the four amenities, fishball-core (the icon family's reference),
 * fishball-ui (its shipped icon asset) and the library fishball-shared. All are this package's
 * dependencies (package.json), so the independence check admits them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO, packageByName } from 'fishball-test-helpers/packages'

export const MANIFEST_FILE = 'package.json'
export { REPO }

/** The packages by role. `asset`: a package with no manifest icon whose shipped icon file joins the distinctness row. */
const pkg = (name, extra = {}) => Object.freeze({ name, ...extra })
export const PKG = Object.freeze({
  amenities: pkg('fishball-amenities'),
  board: pkg('fishball-board'),
  heartbeat: pkg('fishball-heartbeat'),
  taskboard: pkg('fishball-taskboard'),
  consultant: pkg('fishball-consultant'),
  core: pkg('fishball-core'),
  /**
   * fishball-ui (core's inner package) declares no manifest icon; it ships this asset (its manifest
   * `files` lists it), the family's other drawn icon. The old suite named the same path.
   */
  ui: pkg('fishball-ui', { asset: 'assets/fishball-ui-icon.svg' }),
  shared: pkg('fishball-shared'),
})
/** The icon subjects (the amenities umbrella and its members) and the family reference. */
export const SUBJECTS = Object.freeze([PKG.amenities, PKG.board, PKG.heartbeat, PKG.taskboard])
export const REFERENCE = PKG.core

const dirs = new Map()
/** A package's folder (realpath), from the workspace catalogue. */
export function dirOf(p) {
  if (!dirs.has(p.name)) dirs.set(p.name, fs.realpathSync(packageByName(p.name).abs))
  return dirs.get(p.name)
}
/** A package's folder relative to the repository root, POSIX (how the root workspaces name it). */
export const workspaceOf = (p) => packageByName(p.name).dir
export const manifestOf = (p) => JSON.parse(fs.readFileSync(path.join(dirOf(p), MANIFEST_FILE), 'utf8'))
