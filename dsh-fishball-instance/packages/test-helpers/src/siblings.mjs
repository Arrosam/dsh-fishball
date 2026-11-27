/**
 * Where the sibling checkouts are. Integration packages test this repository's packages together
 * with the packages of two other repositories: dsh-connector (dsh-agent-connector and its shared
 * library) and dsh-fishball (fishball-core). They are found beside this repository's MAIN checkout
 * (a git worktree's main checkout, found through git's common folder), or where
 * DSH_CONNECTOR_REPO / FISHBALL_REPO point. Integration tests only read them; nothing is written there.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from './constants.mjs'

export const SIBLING = Object.freeze({
  connector: Object.freeze({ env: 'DSH_CONNECTOR_REPO', folder: 'dsh-connector' }),
  fishball: Object.freeze({ env: 'FISHBALL_REPO', folder: 'dsh-fishball' }),
})

/** The folder holding this repository's main checkout. */
export function checkoutsDir() {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim()
  return path.dirname(path.dirname(fs.realpathSync(common)))
}

/** The sibling checkout `which` ('connector' | 'fishball'), or undefined when it is absent. */
export function siblingRepo(which) {
  const { env, folder } = SIBLING[which]
  const dir = process.env[env] ? path.resolve(process.env[env]) : path.join(checkoutsDir(), folder)
  return fs.existsSync(path.join(dir, 'package.json')) ? dir : undefined
}

/** `packages/<folder>` of a sibling checkout, or undefined. */
export function siblingPackage(which, folder) {
  const repo = siblingRepo(which)
  const dir = repo && path.join(repo, 'packages', folder)
  return dir && fs.existsSync(path.join(dir, 'package.json')) ? dir : undefined
}

/** A node:test skip reason when a sibling checkout is missing, else false. */
export const missingSibling = (which) => (siblingRepo(which) ? false : `the ${SIBLING[which].folder} checkout is absent (set ${SIBLING[which].env})`)
