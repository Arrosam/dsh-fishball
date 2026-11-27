/**
 * Oracle values of the amenities-split rows (AM-*), taken only from the requirement the lead relayed
 * (the user's decision, 2026-11-21):
 * "Every fishball-amenities component is its own independent package with its own package.json, name
 * and version (1.0.0-alpha.1), installable on its own. fishball-amenities becomes a thin umbrella that
 * pulls them in so they install together. Only a package with browser code carries dsh.client, so that
 * no package resolves from multiple loader sources. DSH activates only packages that are DIRECT profile
 * dependencies as bundles, so the umbrella's own cordis.patch.yml inserts its members' rows (the way
 * DSH's @deepseek-ai/dsh-cua-bundle does); a member installed alone uses its own patch."
 * and the layout the lead named with it (row ids = package names, fishball-shared/instance-follower).
 * Only manifests, patches and import specifiers are read; no implementation file is opened.
 */
import path from 'node:path'

/** Manifest and patch vocabulary (npm's and DSH's own field names). */
export const MANIFEST = Object.freeze({
  dependencies: 'dependencies',
  /** npm reads both spellings. */
  bundled: Object.freeze(['bundleDependencies', 'bundledDependencies']),
  /** Every field a manifest names another package in. */
  depFields: Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']),
  files: 'files',
  exports: 'exports',
  dsh: 'dsh',
  bundle: 'bundle',
  patchField: 'patch',
  client: 'client',
  clientPlatform: 'web',
  clientExport: './client',
  clientFile: 'client.js',
})

/** The library's module for the members, and the module it already had for fishball-core and fishball-ui (the split keeps it). */
export const LIBRARY_EXPORTS = Object.freeze({
  follower: Object.freeze({ exportKey: './instance-follower', exportFile: './instance-follower.js', specifier: 'fishball-shared/instance-follower' }),
  seam: Object.freeze({ exportKey: './ui-seam', exportFile: './ui-seam.js' }),
})

/** The members' old folders inside the umbrella, before the split (fishball-board → board/, …). */
export const OLD_FOLDER = (name) => name.replace(/^fishball-/, '')

/** A row's module name: a package name, never a path into a folder (./x, ../x, /x, file:x). */
export const PATH_ROW = /^(?:\.{1,2}\/|\/|file:)/

/** JavaScript sources a package holds; a bundled copy (node_modules) is another package's. */
export const SOURCE = Object.freeze({ js: /\.(?:c|m)?js$/, skip: Object.freeze(['node_modules']) })

/** DSH's own readers of the current DSH: the overlay patch loader and the Plugins page's path inspection. */
export const DSH = Object.freeze({
  patchLoader: 'dsh-app-boot',
  patchLabel: 'fbtest-amenities',
  manager: 'dsh-plugin-manager',
  /** inspect() refuses a package without dsh.bundle with this status. */
  refused: 'refused',
  inspectPrefix: 'fbtest-amenities-inspect-',
  profile: Object.freeze({ manifest: 'package.json', anchor: 'anchor.json', name: 'fbtest-inspect-profile' }),
})

/** The specifier worker: Node's own acorn (needs --expose-internals; nothing is installed). */
export const WORKER = Object.freeze({
  file: path.join(import.meta.dirname, 'specifiers-worker.mjs'),
  execArgv: Object.freeze(['--expose-internals', '--no-warnings']),
})
