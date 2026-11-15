/**
 * File helpers of the DSH side (dsh-connector-shared, R-ARCH-08). Moved unchanged from
 * dsh-instance's src/native-runtime/files.js, whose other helpers are the instance runtime's
 * alone: the instance runtime confines a path with `inside`. fishball-shared/files is the
 * Fishball side's own copy (design §1.0b row 5: no module is shared across the sides).
 */
import path from 'node:path'

/** Whether `file` is `root` or below it, by path only (no link is resolved). */
export const inside = (root, file) => {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}
