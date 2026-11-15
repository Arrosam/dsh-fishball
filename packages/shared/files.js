/**
 * File helpers of the Fishball side (fishball-shared, R-ARCH-08): the child's private Skills
 * store confines a path with `inside`. dsh-connector-shared/files is the DSH side's own copy
 * (design §1.0b row 5: no module is shared across the sides).
 */
import path from 'node:path'

/** Whether `file` is `root` or below it, by path only (no link is resolved). */
export const inside = (root, file) => {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}
