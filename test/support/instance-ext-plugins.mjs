/**
 * Loading helpers for the W0 plugin skeleton B1 (board). The package is created by
 * its own task; a missing file fails the case with the task id and the designed path, never
 * a bare ERR_MODULE_NOT_FOUND.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { linkContractForSourceRun } from './contract-link.mjs'
import { resolveOfficialSDK } from './provider-sync-sdk.mjs'
import { REPO } from './constants.mjs'

linkContractForSourceRun()

export const PACKAGE = Object.freeze({
  board: { name: 'fishball-board', dir: 'packages/fishball-board', task: 'B1' },
})

/** Read one designed file of a package, failing with the task id when the package is absent. */
export async function packageFile(pkg, relative) {
  const file = path.join(REPO, pkg.dir, relative)
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(pkg.task + ': ' + pkg.name + ' has no ' + relative + ' yet (' + file + ')')
    throw error
  }
}

export async function packageJson(pkg) {
  return JSON.parse(await packageFile(pkg, 'package.json'))
}

/** Import one module of a package by its path inside the package. */
export async function packageModule(pkg, relative) {
  await packageFile(pkg, relative)
  // The DSH runtime resolve hooks (`@deepseek-ai/*` from FBTEST_DSH_RUNTIME). They used to be
  // installed as a side effect of loading the V2 instance contract, which is gone.
  resolveOfficialSDK()
  return import(pathToFileURL(path.join(REPO, pkg.dir, relative)).href)
}

/** The schema's declared default for one config key (DSH's schemastery stores it in meta). */
export function configDefault(Config, key) {
  const field = Config?.dict?.[key]
  if (field === undefined) throw new Error('the config schema has no key ' + key)
  return field.meta?.default
}
