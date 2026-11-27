/**
 * The one way dsh-instance's tests reach the package under test: a file of this package, by its path
 * relative to the package root, imported bound to one installed SDK (its `@deepseek-ai/*` imports
 * resolve to that SDK). Every area's tests import the package through here, never by a hard-coded
 * path, so a moved module is fixed in one place.
 */
import path from 'node:path'
import { importBound } from '@dsh-instance/test-helpers/sdk'

/** packages/dsh-instance. */
export const PACKAGE_DIR = path.resolve(import.meta.dirname, '..', '..')

/** An absolute path inside the package. */
export const packageFile = (relative) => path.join(PACKAGE_DIR, relative)

/** Import `relative` (e.g. 'src/host/hosted.js') bound to `sdk`. */
export const importInstance = (sdk, relative) => importBound(sdk, packageFile(relative))
