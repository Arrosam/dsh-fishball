/**
 * V3 suites import the connector's published modules by name (`dsh-connector/mcp-schema`,
 * `dsh-connector/tools`: the K1/K2 and core-seam rows). In the repo the connector is not installed
 * as a dependency, so a source-linked run needs the workspace-shaped link at the repo root. (The V2
 * `dsh-connector/contract` this link was first made for is gone since C-WIRE-2; REMOVE-V2c kept the
 * link because those V3 rows still resolve through it.)
 *
 * test/run.mjs makes the link before node:test starts any file: files that import instance modules
 * directly (body-soul-*, …) would otherwise race the first worker boot and fail with
 * ERR_MODULE_NOT_FOUND. The worker still calls it, for a file run on its own without run.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CONNECTOR, LIBRARIES, REPO } from './constants.mjs'

/**
 * Also links each library (V3 R-SHARED, R-ARCH-08; `dsh-connector-shared` and `fishball-shared` since
 * SPLIT-SHARED) when this checkout has its folder: instance, connector and core modules import them by
 * name and Node resolves them from their real path, so each needs the same root link as the connector.
 * A checkout from before a library has no such folder and gets no link for it.
 */
export function linkContractForSourceRun() {
  linkAtRoot(CONNECTOR)
  for (const library of LIBRARIES) if (fs.existsSync(library.dir)) linkAtRoot(library)
}

function linkAtRoot(pkg) {
  const dir = path.join(REPO, 'node_modules')
  const target = path.join(dir, pkg.name)
  fs.mkdirSync(dir, { recursive: true })
  try {
    fs.symlinkSync(pkg.dir, target)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    // npm can already have installed a relative workspace link. Do not remove another run's link.
    const linked = path.resolve(dir, fs.readlinkSync(target))
    if (linked !== pkg.dir && fs.realpathSync(target) !== fs.realpathSync(pkg.dir)) throw new Error(`unexpected source link: ${target}`, { cause: error })
  }
}
