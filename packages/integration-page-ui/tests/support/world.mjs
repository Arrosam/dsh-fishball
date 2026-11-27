/**
 * The booted DSH of the page rows (fishball-test-helpers/dsh-world): fishball-shared as a library and
 * fishball-core as the one bundle. fishball-ui is core's ./ui/ component: core's patch inserts its rows
 * (fishball-page among them), so DSH loads it from core's folder. Both folders are found BY NAME
 * (createRequire from this package's manifest; fishball-shared from core's own dependency).
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { NAMES } from './names.mjs'

const own = createRequire(path.join(import.meta.dirname, '..', '..', 'package.json'))
const CORE_DIR = path.dirname(own.resolve(NAMES.core + '/package.json'))
const SHARED_DIR = path.dirname(createRequire(path.join(CORE_DIR, 'package.json')).resolve(NAMES.shared + '/package.json'))

export const EXTENSION = path.join(import.meta.dirname, 'world-ext.mjs')
export const corePackages = () => [{ dir: SHARED_DIR, name: NAMES.shared, selected: false }, { dir: CORE_DIR, name: NAMES.core }]
