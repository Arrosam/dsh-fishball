/**
 * The instance imports `fishball-connector/contract` (docs/package-layout.md §5). In the repo the
 * connector is not installed as its dependency, so a source-linked run needs the workspace-shaped
 * link at the repo root; the tarball install test resolves it as a sibling in the profile instead.
 *
 * test/run.mjs makes the link before node:test starts any file: files that import instance modules
 * directly (body-soul-*, limits-source, …) would otherwise race the first worker boot and fail with
 * ERR_MODULE_NOT_FOUND. The worker still calls it, for a file run on its own without run.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CONNECTOR, REPO, SHARED } from './constants.mjs'

/**
 * Also links `fishball-shared` (V3 R-SHARED, R-ARCH-08) when this checkout has `packages/shared`:
 * instance modules import it by name and Node resolves it from their real path, so it needs the
 * same root link as the contract. A checkout from before R-SHARED has no such folder and gets none.
 */
export function linkContractForSourceRun() {
  linkAtRoot(CONNECTOR)
  if (fs.existsSync(SHARED.dir)) linkAtRoot(SHARED)
}

function linkAtRoot(pkg) {
  const dir = path.join(REPO, 'node_modules')
  const target = path.join(dir, pkg.name)
  fs.mkdirSync(dir, { recursive: true })
  let current = null
  try { current = fs.readlinkSync(target) } catch { /* missing */ }
  if (current === pkg.dir) return
  fs.rmSync(target, { force: true })
  try {
    fs.symlinkSync(pkg.dir, target)
  } catch (error) {
    // Concurrent workers can both find the link missing; the loser's EEXIST is fine if the winner's link is right.
    if (error?.code !== 'EEXIST' || fs.readlinkSync(target) !== pkg.dir) throw error
  }
}
