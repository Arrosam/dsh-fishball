/**
 * The booted DSH of these rows (fishball-test-helpers/dsh-world): fishball-shared as a library and
 * fishball-core as the one bundle (its patch inserts fishball-ui's rows; fishball-ui is core's ./ui/
 * component, so DSH loads it from core's folder), each found BY NAME; plus a test's own stand-ins.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { NAMES } from './names.mjs'

const require = createRequire(path.join(import.meta.dirname, '..', '..', 'package.json'))
export const dirOfName = (name) => path.dirname(require.resolve(name + '/package.json'))
export const EXTENSION = path.join(import.meta.dirname, 'world-ext.mjs')
export const corePackages = (more = []) => [{ dir: dirOfName(NAMES.shared), name: NAMES.shared, selected: false }, ...more, { dir: dirOfName(NAMES.core), name: NAMES.core }]
