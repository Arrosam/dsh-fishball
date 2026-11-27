import { join } from 'node:path'
import { packageByName } from 'fishball-test-helpers/packages'
import { NAMES } from './names.mjs'

/** fishball-ui ships the Fishball page as a Cordis sub-package, not a Node subpath export. */
export const fishballPageFile = (entry) => join(packageByName(NAMES.ui).abs, 'fishball-page', entry)
