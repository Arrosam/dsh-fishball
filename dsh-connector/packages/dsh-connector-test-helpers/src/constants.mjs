/**
 * Fixed vocabulary of the test helpers. Deployment-dependent values (where DSH keeps its versions,
 * which version is current, the release matrix in use) are resolved once in config.mjs.
 */
import os from 'node:os'
import path from 'node:path'

/** Environment variables the helpers read. Each one is optional. */
export const ENV = Object.freeze({
  /** Folder holding one sub-folder per installed DSH version (each with node_modules/). */
  versionsDir: 'DSH_TEST_VERSIONS_DIR',
  /** The DSH version day-to-day runs use (overrides the version the DSH shell launches). */
  current: 'DSH_TEST_CURRENT',
  /** Comma-separated versions: set by the release script to run the matrix. Unset = current only. */
  matrix: 'DSH_TEST_MATRIX',
  /** Folder under which a run creates its throwaway homes. */
  homes: 'DSH_TEST_HOMES',
  /** Chromium binary for the browser cases (otherwise the Playwright cache is searched). */
  chrome: 'DSH_TEST_CHROME',
  /** A file: the runner also writes one JSON line per finished case there (names-reporter.mjs). */
  names: 'DSH_TEST_NAMES',
})

/**
 * Where the DSH desktop shell keeps its state on this machine. The real user's home, not $HOME: the
 * runner points HOME at a throwaway folder so no case touches the user's own DSH state.
 */
export const DSH_APP = Object.freeze({
  root: path.join(os.userInfo().homedir, 'Library', 'Application Support', 'DSH'),
  versions: Object.freeze(['data', 'versions']),
  settings: 'settings.json',
  /** The launch preset whose version is "the current DSH" (the shell's default preset). */
  currentPreset: 'DSH',
})

/** The DSH versions a release supports (the release matrix; the first is every package's engines.dsh floor). */
export const RELEASE_MATRIX = Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.3'])

/** Layout of one installed DSH version. */
export const SDK_LAYOUT = Object.freeze({
  nodeModules: 'node_modules',
  packageFile: 'package.json',
  entry: path.join('lib', 'index.js'),
  scope: '@deepseek-ai/',
})

/** The URL query tag that binds a module graph to one DSH version (sdk.mjs). */
export const VERSION_TAG = 'dshsdk'

/** Test-file layout every package follows: <package>/tests/**\/*.test.mjs. */
export const SUITES = Object.freeze({ dir: 'tests', suffix: '.test.mjs', manifest: 'package.json' })

/** Runner bookkeeping. */
export const RUN = Object.freeze({
  homesPrefix: 'dsh-test-run-',
  homesTail: Object.freeze(['.runtime', 'test-homes']),
  signals: Object.freeze(['SIGINT', 'SIGTERM']),
  cancelExit: 130,
  fileConcurrency: 3,
})