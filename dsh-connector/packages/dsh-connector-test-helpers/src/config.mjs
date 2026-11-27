/**
 * Runtime configuration of a test run: where DSH versions are installed, which one is current, and
 * which versions this run covers. Day to day a run covers the current DSH only; the release script
 * sets DSH_TEST_MATRIX so the same cases run once per release-matrix version.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DSH_APP, ENV, RELEASE_MATRIX } from './constants.mjs'

export const versionsDir = path.resolve(process.env[ENV.versionsDir] ?? path.join(DSH_APP.root, ...DSH_APP.versions))
export const sdkRoot = (version) => path.join(versionsDir, version)
const installed = (v) => typeof v === 'string' && fs.existsSync(sdkRoot(v))

/** The version the DSH shell launches by default, read from its settings; undefined when unknown. */
function launchedVersion() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(DSH_APP.root, DSH_APP.settings), 'utf8'))
    const presets = settings.launchPresets ?? []
    const preset = presets.find((p) => p.name === DSH_APP.currentPreset) ?? presets[0]
    return preset?.usedVersion ?? preset?.version
  } catch {
    return undefined
  }
}

/** The current DSH: DSH_TEST_CURRENT, else the shell's launched version, else the newest installed matrix version. */
export function currentVersion() {
  const pick = process.env[ENV.current] || launchedVersion() || [...RELEASE_MATRIX].reverse().find(installed)
  if (!installed(pick)) throw new Error(`DSH ${pick} is not installed under ${versionsDir} (set ${ENV.current})`)
  return pick
}

/** The versions this run covers: the matrix when DSH_TEST_MATRIX is set, else the current DSH. */
export function runVersions() {
  const matrix = process.env[ENV.matrix]
  if (!matrix) return [currentVersion()]
  const list = matrix.split(',').map((v) => v.trim()).filter(Boolean)
  for (const v of list) if (!installed(v)) throw new Error(`DSH ${v} (from ${ENV.matrix}) is not installed under ${versionsDir}`)
  return list
}
