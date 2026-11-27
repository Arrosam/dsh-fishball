/**
 * The booted DSH of these rows (fishball-test-helpers/dsh-world): fishball-shared as a library,
 * fishball-core as a bundle (its patch carries fishball-ui's rows), optionally fishball-taskboard as a
 * bundle, each folder found BY NAME (createRequire from this package's manifest), and this package's
 * world ops (./world-ext.mjs).
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { NAMES } from './names.mjs'

const require = createRequire(path.join(import.meta.dirname, '..', '..', 'package.json'))
const dirOf = (name) => path.dirname(require.resolve(name + '/package.json'))
export const EXTENSION = path.join(import.meta.dirname, 'world-ext.mjs')

export const corePackages = () => [{ dir: dirOf(NAMES.shared), name: NAMES.shared, selected: false }, { dir: dirOf(NAMES.core), name: NAMES.core }]
export const taskboardPackage = () => ({ dir: dirOf(NAMES.taskboard), name: NAMES.taskboard })
