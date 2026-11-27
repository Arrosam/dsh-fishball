/**
 * Integration package sources: prefer the components in this worktree rather than silently
 * testing the main checkout. Standalone component checkouts retain their sibling fallback and
 * DSH_CONNECTOR_REPO / FISHBALL_REPO overrides. These sources are read only.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from './constants.mjs'

export const SIBLING = Object.freeze({
  connector: Object.freeze({ env: 'DSH_CONNECTOR_REPO', folder: 'dsh-connector', anchor: 'dsh-connector' }),
  fishball: Object.freeze({ env: 'FISHBALL_REPO', folder: 'dsh-fishball', anchor: 'core' }),
})
const ROOT = path.dirname(REPO)
const PACKAGES = 'packages'
const MANIFEST = 'package.json'
const AMENITIES = 'amenities'
const AMENITY_DIRS = new Map([
  ['fishball-amenities', 'fishball-amenities'],
  ['fishball-board', 'board'],
  ['fishball-consultant', 'consultant'],
  ['fishball-heartbeat', 'heartbeat'],
  ['fishball-taskboard', 'taskboard'],
])
const hasManifest = (dir) => fs.existsSync(path.join(dir, MANIFEST))
const hasComponent = (dir, { anchor }) => hasManifest(path.join(dir, PACKAGES, anchor))
const fishballComponentAt = (root) => path.join(root, SIBLING.fishball.folder)
const FISHBALL_WORKSPACE = 'dsh-fishball/packages/core'
function isMonorepo(root) {
  if (!hasManifest(root)) return false
  const { workspaces } = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8'))
  return Array.isArray(workspaces) && workspaces.includes(FISHBALL_WORKSPACE)
}

/** The folder holding this repository's main checkout. */
export function checkoutsDir() {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim()
  return path.dirname(path.dirname(fs.realpathSync(common)))
}

/** The selected checkout root, or undefined when the component is absent. */
export function siblingRepo(which) {
  const spec = SIBLING[which]
  const override = process.env[spec.env]
  const fishball = which === 'fishball'
  // Do not fall back to another checkout if the root workspace describes a missing component.
  const dir = override ? path.resolve(override) : isMonorepo(ROOT) ? (fishball ? ROOT : path.join(ROOT, spec.folder)) : path.join(checkoutsDir(), spec.folder)
  const parent = path.dirname(dir)
  // A relocated component folder alone does not contain the amenity sources.
  if (fishball && dir === fishballComponentAt(parent) && isMonorepo(parent)) return undefined
  const component = fishball && isMonorepo(dir) ? fishballComponentAt(dir) : dir
  return hasComponent(component, spec) ? dir : undefined
}

/** The component carries the Fishball release output even when sources span the monorepo. */
export function fishballComponent() {
  const root = siblingRepo('fishball')
  return root && isMonorepo(root) ? fishballComponentAt(root) : root
}

/** In-tree tests exercise the placement default unless they request an override. */
export function fishballSourceEnv() {
  const { env } = SIBLING.fishball
  const root = siblingRepo('fishball')
  return root && (process.env[env] || root !== ROOT) ? { [env]: root } : {}
}

/** A component package by its original folder (for moved amenities, their package name). */
export function siblingPackage(which, folder) {
  const repo = siblingRepo(which)
  if (!repo) return undefined
  const relocated = which === 'fishball' && isMonorepo(repo)
  const amenity = relocated && AMENITY_DIRS.get(folder)
  const dir = amenity ? path.join(repo, AMENITIES, amenity) : path.join(relocated ? fishballComponentAt(repo) : repo, PACKAGES, folder)
  return hasManifest(dir) ? dir : undefined
}

/** A node:test skip reason when a sibling checkout is missing, else false. */
export const missingSibling = (which) => (siblingRepo(which) ? false : `the ${SIBLING[which].folder} checkout is absent (set ${SIBLING[which].env})`)
