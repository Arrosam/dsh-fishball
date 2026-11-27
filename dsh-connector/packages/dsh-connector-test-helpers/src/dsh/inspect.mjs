/** DSH's own path inspection (the Plugins page's "add" check) on one installed version, offline, against a throwaway profile. */
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { npmTempRoot } from '../static/packages.mjs'
import { NPM } from '../static/constants.mjs'
import { sdkFile } from '../sdk.mjs'

const MANAGER = Object.freeze({ entry: ['@deepseek-ai', 'dsh-plugin-manager', 'lib', 'index.js'], tempPrefix: 'dsh-test-inspect-' })
/** DSH's refusal words for a package without dsh.bundle. */
export const INSPECT = Object.freeze({ refused: 'refused', notABundle: 'not-a-bundle' })

export async function dshInspect(version, dir) {
  const { PluginManager } = await import(pathToFileURL(sdkFile(version, ...MANAGER.entry)).href)
  const scratch = await mkdtemp(path.join(npmTempRoot(), MANAGER.tempPrefix))
  try {
    fs.writeFileSync(path.join(scratch, 'package.json'), JSON.stringify({ name: 'dsh-test-inspect-profile', dependencies: {} }))
    fs.writeFileSync(path.join(scratch, 'anchor.json'), JSON.stringify({ dependencies: {} }))
    // Only the fields inspect() reads for a local path; registries are answered empty, so nothing is fetched.
    const self = { profile: { dir: scratch, installAnchor: path.join(scratch, 'anchor.json') }, registries: async () => ({ registry: null, fallbackRegistries: [], resolved: null }) }
    return await PluginManager.prototype.inspect.call(self, dir)
  } finally {
    if (path.dirname(scratch) !== path.resolve(NPM.tempRoot) || !path.basename(scratch).startsWith(MANAGER.tempPrefix)) throw new Error('unexpected temp dir ' + scratch)
    await rm(scratch, { recursive: true, force: true })
  }
}
