/** Throwaway folders under the run's TMPDIR, made by this module and removed by `removeTemps` (a file's after hook). */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temps = new Set()
/** A fresh folder (realpath) under the OS temp directory, its name starting with `prefix`. */
export function tempDir(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
  temps.add({ dir, prefix })
  return dir
}
export function removeTemps() {
  const anchor = fs.realpathSync(os.tmpdir())
  for (const { dir, prefix } of temps) {
    // Guard the one recursive delete: only a folder this module made directly under the temp dir.
    if (path.dirname(dir) !== anchor || !path.basename(dir).startsWith(prefix)) throw new Error('unexpected temp dir ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  }
  temps.clear()
}
