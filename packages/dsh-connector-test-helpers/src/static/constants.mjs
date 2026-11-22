/**
 * The repository's packages as the static checks see them (folder → npm name), and the settings of
 * the analysis. A package folder that does not exist is left out.
 */
import os from 'node:os'
import path from 'node:path'
import { ENV } from '../constants.mjs'
import { packageDir } from '../repo.mjs'

const pkg = (name, ...folder) => Object.freeze({ name, dir: packageDir(...folder) })

/** Every product package of the repository (the libraries included). */
export const PRODUCT = Object.freeze({
  connector: pkg('dsh-agent-connector', 'dsh-connector'),
  ui: pkg('dsh-connector-ui', 'dsh-connector', 'ui'),
  adapter: pkg('dsh-connector-adapter', 'dsh-connector-adapter'),
  watchdog: pkg('dsh-connector-watchdog', 'dsh-connector-watchdog'),
  amenities: pkg('dsh-connector-amenities', 'dsh-connector-amenities'),
  shared: pkg('dsh-connector-shared', 'dsh-connector-shared'),
})
export const PRODUCT_NAMES = Object.freeze(Object.values(PRODUCT).map((p) => p.name))
/** The libraries: plain dependencies, bundled by their users, never bundles of their own. */
export const LIBRARY_NAMES = Object.freeze([PRODUCT.shared.name])

export const JS_FILE = /\.(?:c|m)?js$/

export const NPM = Object.freeze({
  path: '/opt/homebrew/bin:/usr/bin:/bin',
  /** A real npm pack (lifecycle scripts included) on a throwaway copy, offline. */
  args: Object.freeze(['pack', '--dry-run', '--json']),
  timeoutMs: 120000,
  maxStdoutBytes: 16 * 1024 * 1024,
  tempPrefix: 'dsh-test-pack-',
  /** Throwaway copies live under the run's homes (the runner's isolated tree), else the OS temp dir. */
  tempRoot: process.env[ENV.homes] ?? path.join(os.tmpdir(), 'dsh-test-static'),
})

export const WORKER = Object.freeze({
  specifiers: path.join(import.meta.dirname, 'specifiers-worker.mjs'),
  tokens: path.join(import.meta.dirname, 'tokens-worker.mjs'),
  execArgv: Object.freeze(['--expose-internals', '--experimental-import-meta-resolve', '--no-warnings']),
})
