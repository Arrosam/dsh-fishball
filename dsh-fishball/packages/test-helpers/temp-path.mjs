/**
 * Canonical containment of a temp path, checked immediately before each helper-owned mutation:
 * `tempPath(target, {root, allowRoot})` answers the real path of `target` when it lies below `root`
 * (or is `root` itself with `allowRoot`), and `root` lies inside the boundary (the canonical OS temp
 * folder, or `boundary`); anything else throws. Existing ancestors are resolved too, so a missing leaf
 * cannot hide an escaping symlink, and a dangling symlink is refused.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TEMP = Object.freeze({ dangling: 'refusing dangling temp path ', unsafe: 'refusing unsafe temp path ', notAbsolute: 'temp paths must be absolute' })

function realTarget(target) {
  const absolute = path.resolve(target)
  try {
    return fs.realpathSync(absolute)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    // A dangling symlink is not a missing directory that we may create through.
    let entry = null
    try { entry = fs.lstatSync(absolute) } catch (entryError) { if (entryError.code !== 'ENOENT') throw entryError }
    if (entry) throw new Error(TEMP.dangling + absolute)
    const parent = path.dirname(absolute)
    if (parent === absolute) throw error
    return path.join(realTarget(parent), path.basename(absolute))
  }
}

export function tempPath(target, { root = os.tmpdir(), allowRoot = false, boundary = os.tmpdir() } = {}) {
  if (!path.isAbsolute(target) || !path.isAbsolute(root) || !path.isAbsolute(boundary)) throw new Error(TEMP.notAbsolute)
  const edge = fs.realpathSync(boundary)
  const resolvedRoot = realTarget(root)
  const resolved = realTarget(target)
  const below = (parent, child) => child.startsWith(parent + path.sep)
  if ((resolvedRoot !== edge && !below(edge, resolvedRoot)) || (!below(resolvedRoot, resolved) && !(allowRoot && resolved === resolvedRoot))) {
    throw new Error(TEMP.unsafe + target)
  }
  return resolved
}
