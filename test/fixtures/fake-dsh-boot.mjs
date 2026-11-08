/**
 * A minimal stand-in for @deepseek-ai/dsh-app-boot, used by the X0-B start-up tests.
 *
 * `initializeProfile` imports the boot API by the path in `installation.bootPath`. This fixture
 * writes and reads a real profile manifest, and reports as skipped exactly the profile
 * dependencies that are not present under `<profile>/node_modules` (the resolution rule SP-FN1
 * found: DSH resolves a bundle only through node_modules).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const manifestPath = (profileDir) => path.join(profileDir, 'package.json')

export function resolveProfileDir(name, home) {
  return path.join(home, 'profiles', name)
}

export function initProfile(profileDir, bundles) {
  mkdirSync(profileDir, { recursive: true })
  if (existsSync(manifestPath(profileDir))) return
  writeFileSync(manifestPath(profileDir), JSON.stringify({ name: 'fishball', private: true, dsh: { profile: { bundles: [...bundles] } } }, null, 2) + '\n')
}

export function readProfileManifest(name, profileDir) {
  return JSON.parse(readFileSync(manifestPath(profileDir), 'utf8'))
}

export function writeProfileBundles(profileDir, manifest, bundles) {
  manifest.dsh = { ...(manifest.dsh ?? {}), profile: { ...(manifest.dsh?.profile ?? {}), bundles } }
  writeFileSync(manifestPath(profileDir), JSON.stringify(manifest, null, 2) + '\n')
}

export function loadProfileDirectory(name, profileDir) {
  const manifest = JSON.parse(readFileSync(manifestPath(profileDir), 'utf8'))
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const skippedBundles = []
  for (const bundle of bundles) {
    if (bundle === '@deepseek-ai/dsh-base') continue
    if (!existsSync(path.join(profileDir, 'node_modules', bundle, 'package.json'))) skippedBundles.push(bundle)
  }
  return { layers: [], patches: [], skippedBundles }
}

export async function createRuntimeResolution() { return { modules: [] } }

export function loadOptionalPatches() { return [] }

export function composeEntries(patches) { return patches }

export const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'
