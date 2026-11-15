/**
 * Vocabulary for the R-SHARED cases (PLAT-EP-07 static rows; HOST-EP-03 rows 1–2).
 *
 * Every value comes from docs/test-design/v3/11-platform.md and 08-hosted.md (TQ-R5 decided B,
 * `fc19e02`), docs/planning/v3-requirements.md R-ARCH-08 / R-BND-01 and the task table
 * docs/planning/v3-tasks.md (R-SHARED, R-CORE, R-EMBED, I-PLACE, FEAT-PEERS), never from an
 * implementation.
 */
import os from 'node:os'
import path from 'node:path'
import { REPO, TEST_HOMES } from '../../support/constants.mjs'

const pkg = (name, folder) => Object.freeze({ name, dir: path.join(REPO, 'packages', folder) })

/** The V3 packages by role (R-ARCH-01, R-ARCH-08, design §9.1); folders as the task table names them. */
export const V3 = Object.freeze({
  shared: pkg('fishball-shared', 'shared'),
  core: pkg('fishball-core', 'core'),
  instance: pkg('dsh-instance', 'dsh-instance'),
  connector: pkg('dsh-connector', 'dsh-connector'),
  // S4-Q3 decided B (questions.md at b1295de): all lowercase, as npm and DSH's plugin manager require.
  embed: pkg('dsh-connector-ui', 'dsh-connector-ui'),
  board: pkg('fishball-board', 'board'),
  foldNotify: pkg('fishball-fold-notify', 'fold-notify'),
  watchdog: pkg('fishball-watchdog', 'watchdog'),
})
/** The hosted-only settings bundle (R-HOST-11); placed by the instance from I-PLACE on. */
export const HOSTED_SETTINGS = 'fishball-hosted-settings'
/** Every V3 package name (rows 3/7b: fishball-shared imports none of them). */
export const V3_NAMES = Object.freeze([...Object.values(V3).map((p) => p.name), HOSTED_SETTINGS])
/** R-BND-01: the plugin set and the hosted settings bundle (row 7c: the connector imports none of them). */
export const SET_SIDE = Object.freeze([V3.core.name, V3.board.name, V3.foldNotify.name, V3.watchdog.name, HOSTED_SETTINGS])
/** Design §9.1: the feature plugins find core only through the optional `fishballInstance?` inject. */
export const FEATURES = Object.freeze([V3.board.name, V3.foldNotify.name, V3.watchdog.name])
/** Design §9.1: embed-UI may take `./tools` from the connector (types and data), nothing else. */
export const EMBED_CONNECTOR_ALLOWED = Object.freeze(['dsh-connector/tools'])

/** Manifest fields that name a package edge, and the bundled-dependency fields (npm reads both spellings). */
export const DEP_FIELDS = Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'])
export const RUNTIME_DEP_FIELD = 'dependencies'
export const BUNDLED_FIELDS = Object.freeze(['bundleDependencies', 'bundledDependencies'])
/** Row 4: no `dsh` field at all. */
export const DSH_FIELD = 'dsh'
/** R-SHARED: the library joins the root workspaces. */
export const ROOT_WORKSPACE = 'packages/shared'

/**
 * HOST-EP-03 row 2 / R-SHARED "stay in the instance": the DSH-side modules, found in the instance's
 * shipped files wherever R-CORE later re-homes them (src/child-settings/), by name or folder.
 */
export const DSH_SIDE = Object.freeze({ basenames: Object.freeze(['native-web.js', 'settings-relay.js']), folder: 'slim/host/' })
/** R-SHARED (3): a named reader of the files.js helpers that move (it imports them from the library); found by file name. */
export const SHARED_READER = 'skills-store.js'

/** JavaScript files a package ships (by its `npm pack` listing). */
export const JS_FILE = /\.(?:c|m)?js$/

/** Isolated `npm pack --dry-run` (no user/global config, fresh HOME and cache, offline). */
export const NPM = Object.freeze({
  path: '/opt/homebrew/bin:/usr/bin:/bin',
  /**
   * Row 5 is about the packed tarball, so lifecycle scripts run as a real `npm pack` runs them (a
   * package may fill `node_modules/fishball-shared` in `prepack`). It runs on a throwaway copy of
   * `packages/`, offline, so nothing is written to the checkout and nothing reaches a registry.
   */
  args: Object.freeze(['pack', '--dry-run', '--json']),
  timeoutMs: 120000,
  maxStdoutBytes: 16 * 1024 * 1024,
  tempPrefix: 'fbtest-v3-shared-npm-',
  /** The throwaway copy, and npm's cache inside it, live under the run's `.runtime` folder (never a user cache). */
  tempRoot: path.dirname(TEST_HOMES),
  bundledDir: (name) => 'node_modules/' + name + '/',
})

/** The SDKs every case runs on (R-COMPAT-01); FBTEST_DSH_VERSIONS moves their parent folder. */
export const SDK = Object.freeze({
  versionsDir: process.env.FBTEST_DSH_VERSIONS ?? path.join(os.homedir(), 'Library', 'Application Support', 'DSH', 'data', 'versions'),
  versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  managerEntry: path.join('node_modules', '@deepseek-ai', 'dsh-plugin-manager', 'lib', 'index.js'),
  /** DSH's own path inspection (the Plugins page's add) refuses a package without dsh.bundle with this problem. */
  inspect: Object.freeze({ refused: 'refused', notABundle: 'not-a-bundle', tempPrefix: 'fbtest-v3-shared-inspect-' }),
})

/** The specifier worker (Node's built-in acorn; see specifiers-worker.mjs). */
export const WORKER = Object.freeze({
  file: path.join(import.meta.dirname, 'specifiers-worker.mjs'),
  execArgv: Object.freeze(['--expose-internals', '--experimental-import-meta-resolve', '--no-warnings']),
})

/** Owners of the rows R-SHARED cannot check yet (v3-tasks.md). */
export const LATER = Object.freeze({
  core: 'R-CORE (creates packages/core, W1 step 2)',
  embed: 'R-EMBED (creates packages/dsh-connector-ui, W1 step 3)',
  rowSixTwoPackages: 'R-CORE (until core exists, the instance is the only package that can import the library)',
  hostedSettings: 'I-PLACE (fishball-hosted-settings, a placed bundle importing the library)',
  featurePeers: 'FEAT-PEERS and WD-ROUTE (feature plugins drop the dsh-instance peer for the optional fishballInstance? inject)',
  pluginsPage: 'X-MATRIX (no Plugins page of a started DSH lists fishball-shared)',
  hostTrace: 'X-SEC (PLAT-EP-07 runtime part: module-load trace of a running hosted setup C + I + U)',
  standalone: 'unassigned in v3-tasks.md (standalone install of the core tarball with no registry; core is not standalone-loadable before S6/F-GUARDS)',
})
