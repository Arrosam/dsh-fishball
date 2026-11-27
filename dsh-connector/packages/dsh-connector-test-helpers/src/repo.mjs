/** Connector component and monorepo paths. REPO remains the anchor for the legacy fixtures. */
import path from 'node:path'

export const REPO = path.resolve(import.meta.dirname, '..', '..', '..')
export const MONOREPO = path.dirname(REPO)
export const PACKAGES_DIR = path.join(REPO, 'packages')
const AMENITIES_DIR = path.join(MONOREPO, 'amenities')
/** A package folder of this repository, e.g. packageDir('dsh-connector', 'ui'). */
export const packageDir = (...parts) => path.join(PACKAGES_DIR, ...parts)
export const amenityDir = (...parts) => path.join(AMENITIES_DIR, ...parts)
