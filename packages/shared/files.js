/**
 * File helpers both Fishball sides use (fishball-shared, R-ARCH-08). Moved unchanged from
 * dsh-instance's src/native-runtime/files.js, whose other helpers are the instance runtime's
 * alone: the runtime and the child's private Skills store both confine a path with `inside`.
 */
import path from 'node:path'

/** Whether `file` is `root` or below it, by path only (no link is resolved). */
export const inside = (root, file) => {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}
