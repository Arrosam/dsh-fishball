/**
 * Which installed DSH the tests run on.
 *
 * Day to day: the current DSH, the one this machine's DSH launcher starts (`<data>/.bin/dsh` names
 * `versions/<version>/`). Release: every version of RELEASE_MATRIX, one run each
 * (scripts/test-release.mjs). The runner resolves the version once and hands it to every test process
 * as FBTEST_DSH_VERSION, so a run never mixes two versions.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const DSH_ENV = Object.freeze({
  version: 'FBTEST_DSH_VERSION',
  versions: 'FBTEST_DSH_VERSIONS',
  data: 'FBTEST_DSH_DATA',
  /** The runtime folder (`versions/<v>/node_modules`): older helpers and DSH workers read it. */
  runtime: 'FBTEST_DSH_RUNTIME',
})

/**
 * DSH's data folder. os.userInfo() and not $HOME: the runner replaces HOME with a throwaway folder,
 * and the installed versions are still the real user's.
 */
const DATA = process.env[DSH_ENV.data] ?? path.join(os.userInfo().homedir, 'Library', 'Application Support', 'DSH', 'data')
export const VERSIONS_DIR = process.env[DSH_ENV.versions] ?? path.join(DATA, 'versions')
const LAUNCHER = Object.freeze({ file: path.join(DATA, '.bin', 'dsh'), version: /versions\/([^/]+)\/node_modules\// })
const LAYOUT = Object.freeze({ modules: 'node_modules', scope: '@deepseek-ai', entry: path.join('lib', 'index.js'), manifest: 'package.json' })

/**
 * The DSH versions a release is tested on: the versions the root README supports, and the current
 * one (added when it is not among them). Change this list with the README's "Supported DSH versions".
 */
export const SUPPORTED = Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1'])

/** The launcher's version, or null when no launcher is installed. */
export function launcherVersion() {
  if (!fs.existsSync(LAUNCHER.file)) return null
  return LAUNCHER.version.exec(fs.readFileSync(LAUNCHER.file, 'utf8'))?.[1] ?? null
}

export const isInstalled = (version) => fs.existsSync(path.join(VERSIONS_DIR, version, LAYOUT.modules, LAYOUT.scope))

/** The version this process tests on: FBTEST_DSH_VERSION, else the launcher's. Throws when neither is installed. */
export function currentVersion() {
  const version = process.env[DSH_ENV.version] ?? launcherVersion()
  if (!version) throw new Error('no current DSH: set ' + DSH_ENV.version + ' or install DSH (' + LAUNCHER.file + ' is missing)')
  if (!isInstalled(version)) throw new Error('DSH ' + version + ' is not installed under ' + VERSIONS_DIR)
  return version
}

export const RELEASE_MATRIX = Object.freeze([...new Set([...SUPPORTED, ...(launcherVersion() ? [launcherVersion()] : [])])])

/** `versions/<v>/node_modules` of one version. */
export const runtimeOf = (version) => path.join(VERSIONS_DIR, version, LAYOUT.modules)
/** The folder of one installed DSH package (`@deepseek-ai/<name>`). */
export const dshPackageDir = (name, version = currentVersion()) => path.join(runtimeOf(version), LAYOUT.scope, name)
/**
 * Import one installed DSH package by its own manifest's ESM entry (as Node would resolve the bare
 * name from inside that DSH), or a named file of it. Most DSH packages use `lib/index.js`; some
 * (schemastery) name another entry, so the manifest decides.
 */
export async function importDsh(name, file, version = currentVersion()) {
  const dir = dshPackageDir(name, version)
  return import(pathToFileURL(path.join(dir, file ?? entryOf(dir))).href)
}
function entryOf(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, LAYOUT.manifest), 'utf8'))
  const root = manifest.exports?.['.'] ?? manifest.exports
  const pick = (target) => (typeof target === 'string' ? target : target?.import ?? target?.default ?? (target?.node ? pick(target.node) : undefined))
  return pick(root) ?? manifest.module ?? manifest.main ?? LAYOUT.entry
}

/** The current version, read once per process (case names carry it). */
export const DSH_VERSION = currentVersion()
export const DSH_RUNTIME = runtimeOf(DSH_VERSION)
