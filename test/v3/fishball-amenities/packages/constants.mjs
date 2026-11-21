/**
 * Oracle values of the amenities-split cases (fishball-amenities.packages), taken only from the
 * requirement the lead relayed (the user's decision, 2026-11-21):
 * "Every fishball-amenities component is its own independent package with its own package.json, name
 * and version (1.0.0-alpha.1), installable on its own. fishball-amenities becomes a thin umbrella that
 * pulls them in so they install together. Only a package with browser code carries dsh.client, so that
 * no package resolves from multiple loader sources. DSH activates only packages that are DIRECT profile
 * dependencies as bundles, so the umbrella's own cordis.patch.yml inserts its members' rows (the way
 * DSH's @deepseek-ai/dsh-cua-bundle does); a member installed alone uses its own patch."
 * and the layout the lead named with it (folders, row ids, fishball-shared/instance-follower).
 * Only manifests, patches and import specifiers are read; no implementation file is opened.
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

/** The one release version every package carries. */
export const VERSION = '1.0.0-alpha.1'

/**
 * The packages of the split. `browser`: the package has browser code (the lead's layout: the
 * umbrella's settings-page hint and taskboard's Task board tab), so it, and only it, carries dsh.client.
 */
const member = (pkg, browser) => Object.freeze({ name: pkg.name, dir: pkg.dir, folder: path.basename(pkg.dir), browser })
export const MEMBERS = Object.freeze([
  member(V3.board, false),
  member(V3.heartbeat, false),
  member(V3.taskboard, true),
])
export const UMBRELLA = member(V3.amenities, true)
export const PACKAGES = Object.freeze([...MEMBERS, UMBRELLA])

/** The Fishball side's library the members bundle, and its module for them. */
export const LIBRARY = Object.freeze({
  name: V3.shared.name,
  dir: V3.shared.dir,
  follower: Object.freeze({ exportKey: './instance-follower', exportFile: './instance-follower.js', specifier: V3.shared.name + '/instance-follower' }),
  /** The module it already had for fishball-core and fishball-ui; the split keeps it. */
  seam: Object.freeze({ exportKey: './ui-seam', exportFile: './ui-seam.js' }),
})

/** Manifest and patch vocabulary (npm's and DSH's own field names). */
export const MANIFEST = Object.freeze({
  file: 'package.json',
  root: path.join(REPO, 'package.json'),
  workspaces: 'workspaces',
  dependencies: 'dependencies',
  /** npm reads both spellings. */
  bundled: Object.freeze(['bundleDependencies', 'bundledDependencies']),
  files: 'files',
  exports: 'exports',
  dsh: 'dsh',
  bundle: 'bundle',
  patchField: 'patch',
  client: 'client',
  clientPlatform: 'web',
  clientExport: './client',
  clientFile: 'client.js',
  /** A folder of the packages root (the workspaces are named by repo-relative folder). */
  packagesDir: 'packages',
})

/** A row's module name: a package name, never a path into a folder (./x, ../x, /x, file:x). */
export const PATH_ROW = /^(?:\.{1,2}\/|\/|file:)/

/** JavaScript sources a package holds; a bundled copy (node_modules) is another package's. */
export const SOURCE = Object.freeze({ js: /\.(?:c|m)?js$/, skip: Object.freeze(['node_modules']) })
