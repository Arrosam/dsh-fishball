/** The repository root and its package folders. */
import path from 'node:path'

export const REPO = path.resolve(import.meta.dirname, '..', '..', '..')
export const PACKAGES_DIR = path.join(REPO, 'packages')
/** A package folder of this repository, e.g. packageDir('dsh-connector', 'ui'). */
export const packageDir = (...parts) => path.join(PACKAGES_DIR, ...parts)
