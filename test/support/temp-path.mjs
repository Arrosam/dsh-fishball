import fs from 'node:fs'
import path from 'node:path'

const TEMP = Object.freeze({ root: '/private/tmp' })

/** Resolve existing ancestors too: a missing leaf must not hide an escaping symlink. */
function realTarget(target) {
  const absolute = path.resolve(target)
  try {
    return fs.realpathSync(absolute)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    // A dangling symlink is not a missing directory that we may create through.
    try {
      fs.lstatSync(absolute)
      throw new Error('refusing dangling temp path ' + absolute)
    } catch (entryError) {
      if (entryError.code !== 'ENOENT') throw entryError
    }
    const parent = path.dirname(absolute)
    if (parent === absolute) throw error
    return path.join(realTarget(parent), path.basename(absolute))
  }
}

/** Canonical containment, checked immediately before each helper-owned mutation. */
export function tempPath(target, { root = TEMP.root, allowRoot = false } = {}) {
  if (!path.isAbsolute(target) || !path.isAbsolute(root)) throw new Error('temp paths must be absolute')
  const boundary = fs.realpathSync(TEMP.root)
  const resolvedRoot = realTarget(root)
  const resolved = realTarget(target)
  const below = (parent, child) => child.startsWith(parent + path.sep)
  if ((resolvedRoot !== boundary && !below(boundary, resolvedRoot)) ||
      (!below(resolvedRoot, resolved) && !(allowRoot && resolved === resolvedRoot))) {
    throw new Error('refusing unsafe temp path ' + target)
  }
  return resolved
}
