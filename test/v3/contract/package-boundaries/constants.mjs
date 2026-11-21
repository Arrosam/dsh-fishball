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
import { REPO, TEST_HOMES } from '../../../support/constants.mjs'
import { SHELVED } from '../../release/pack/constants.mjs'

const pkg = (name, folder) => Object.freeze({ name, dir: path.join(REPO, 'packages', folder) })

/** The V3 packages by role (R-ARCH-01, R-ARCH-08, design §9.1); folders as the task table names them. */
export const V3 = Object.freeze({
  /** The Fishball side's library (R-ARCH-08 as amended by requirements 1.40; design §1.0). */
  shared: pkg('fishball-shared', 'shared'),
  /** The DSH side's library (requirements 1.40, design §1.0, §1.0c; SPLIT-SHARED creates its folder). */
  dshShared: pkg('dsh-connector-shared', 'dsh-connector-shared'),
  core: pkg('fishball-core', 'core'),
  /** Fishball's UI plugin, split out of core (requirements 1.38 Q-N2, R-FB-14; task F-UI). */
  ui: pkg('fishball-ui', path.join('core', 'ui')),
  instance: pkg('dsh-instance', 'dsh-instance'),
  /** npm name dsh-agent-connector (the user, 2026-11-17); the folder stays packages/dsh-connector. */
  connector: pkg('dsh-agent-connector', 'dsh-connector'),
  // S4-Q3 decided B (questions.md at b1295de): all lowercase, as npm and DSH's plugin manager require.
  embed: pkg('dsh-connector-ui', 'dsh-connector-ui'),
  board: pkg('fishball-board', 'board'),
  /** The optional DSH-side MCP-client adapter (R-OA-21 renamed by 1.41; design §1.0, §5.5b; C-MCP-ADAPTER creates it). */
  adapter: pkg('dsh-connector-adapter', 'dsh-connector-adapter'),
})
/** Every V3 package name (rows 3/7b: neither library imports any of them). */
export const V3_NAMES = Object.freeze(Object.values(V3).map((p) => p.name))
/** The two libraries, one per side (R-ARCH-08 amended by 1.40): not plugins, never bundles. */
export const LIBRARIES = Object.freeze([V3.dshShared, V3.shared])
export const LIBRARY_NAMES = Object.freeze(LIBRARIES.map((p) => p.name))
/**
 * The two sides with no dependency between them (design §1.0, requirements 1.34–1.41). Each side's
 * library is its last member. `dsh-connector-adapter` joined with C-MCP-ADAPTER; `fishball-ui` is a
 * Fishball-side package since F-UI (R-FB-14).
 */
export const SIDES = Object.freeze({
  dsh: Object.freeze({ id: 'DSH', packages: Object.freeze([V3.connector, V3.embed, V3.instance, V3.adapter, V3.dshShared]), library: V3.dshShared }),
  fishball: Object.freeze({ id: 'Fishball', packages: Object.freeze([V3.core, V3.ui, V3.board, V3.shared]), library: V3.shared }),
})
/** The side a package name belongs to (undefined for a name of neither side). */
export const sideOf = (name) => Object.values(SIDES).find((side) => side.packages.some((p) => p.name === name))
/** R-BND-01: the plugin set, board, core and fishball-ui (design §1.0, F-UI; row 7c: the connector imports none of them). */
export const SET_SIDE = Object.freeze([V3.core.name, V3.ui.name, V3.board.name])
/** Design §9.1: the feature plugin finds core only through the optional `fishballInstance?` inject. */
export const FEATURES = Object.freeze([V3.board.name])
/**
 * SHELVE-BOARD: fishball-board is shelved, not in 1.0.0-alpha.1 (the user, 2026-11-18:
 * "fishball-board先从这次release中移除，我要改的地方太多了。先封存，留到下一批再说。所以不要预留在子实例的Fishball内。").
 * packages/board stays in the repo, but core and fishball-ui hold no hard reference to it: no
 * identifier or string in their shipped code (a nav entry, route, guard, settings link, persona or
 * tool mention would be one), no line of their patch or other shipped data file, no manifest field
 * (an optional peer included). READMEs are prose for the reader, not a reference, so they are left out.
 * `mention` is REL-PACK's one board-mention rule (release/pack/constants.mjs SHELVED.mention).
 */
export const SHELVED_BOARD = Object.freeze({
  pkg: V3.board,
  holders: Object.freeze([V3.core, V3.ui]),
  mention: SHELVED.mention,
  prose: /(?:^|\/)(?:README|LICENSE|THIRD_PARTY_NOTICES)[^/]*$/i,
  samples: Object.freeze({
    hit: Object.freeze(['fishball-board', '/api/fishball/board', 'board_search', 'Board', 'open the board']),
    clean: Object.freeze(['dashboard', 'clipboard-write', 'onboarding', 'keyboard', 'settings.onboarding']),
  }),
})
/** Design §9.1: embed-UI may take `./tools` from the connector (types and data), nothing else. */
export const EMBED_CONNECTOR_ALLOWED = Object.freeze(['dsh-agent-connector/tools'])

/** Manifest fields that name a package edge, and the bundled-dependency fields (npm reads both spellings). */
export const DEP_FIELDS = Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'])
export const RUNTIME_DEP_FIELD = 'dependencies'
export const BUNDLED_FIELDS = Object.freeze(['bundleDependencies', 'bundledDependencies'])
/** Row 4: no `dsh` field at all. */
export const DSH_FIELD = 'dsh'
/** R-SHARED, SPLIT-SHARED: each library is a root workspace (by its folder). */
export const ROOT_WORKSPACE = (pkg) => path.relative(REPO, pkg.dir).split(path.sep).join('/')

/**
 * HOST-EP-03 row 2 / R-SHARED "stay in the instance": the DSH-side modules, found in the instance's
 * shipped files, by name or folder.
 */
export const DSH_SIDE = Object.freeze({ basenames: Object.freeze(['native-web.js', 'settings-relay.js']), folder: 'slim/host/' })
/**
 * R-SHARED (3): a named reader of the files.js helpers (core's private Skills store), found by file
 * name. Since REMOVE-V2b the helpers live inside core, so it takes them from no library.
 */
export const SHARED_READER = 'skills-store.js'

/**
 * PLAT-EP-07 row 6, R-ARCH-08 rule (5) read strictly (Fishball, 2026-11-16): every module of a
 * library is imported by at least this many distinct V3 packages of the library's own side.
 */
export const MIN_LIBRARY_USERS = 2
/**
 * REMOVE-V2b: fishball-shared's single-user modules, moved into their one user, fishball-core
 * (`files` for its private Skills store, `oauth-client` for its link / Connect). fishball-shared
 * then holds only `ui-seam` (core and fishball-ui).
 */
export const MOVED_INTO_CORE = Object.freeze(['files', 'oauth-client'].map((module) => Object.freeze({ module, file: module + '.js', specifier: V3.shared.name + '/' + module })))

/**
 * Self-check of the row-6 counting rule over a synthetic importer table (no package is read). Each
 * case names the packages importing `module` directly and the packages importing `reexport`, a
 * library module that re-exports `module` (a re-export makes both used, as libraryUsage reads it).
 * The library entry stands for the library importing its own module (an internal edge, never a user).
 */
export const USERS_RULE = Object.freeze({
  library: V3.shared.name,
  module: 'fbtest-module.js',
  reexport: 'fbtest-reexport.js',
  cases: Object.freeze([
    { partition: 'BVA no importer', direct: [], via: [], pass: false },
    { partition: 'BVA one importer', direct: [V3.core.name], via: [], pass: false },
    { partition: 'BVA two importers of its side', direct: [V3.core.name, V3.ui.name], via: [], pass: true },
    { partition: 'EP three importers of its side', direct: [V3.core.name, V3.ui.name, V3.board.name], via: [], pass: true },
    { partition: 'EP one package importing it from two files counts once', direct: [V3.core.name, V3.core.name], via: [], pass: false },
    { partition: 'EP an importer of the other side does not count', direct: [V3.core.name, V3.instance.name], via: [], pass: false },
    { partition: 'EP the library importing its own module does not count', direct: [V3.core.name, V3.shared.name], via: [], pass: false },
    { partition: 'EP two packages reaching it only through a re-exporting library module', direct: [], via: [V3.core.name, V3.ui.name], pass: true },
  ].map(Object.freeze)),
})

/** JavaScript files a package ships (by its `npm pack` listing). */
export const JS_FILE = /\.(?:c|m)?js$/

/** Isolated `npm pack --dry-run` (no user/global config, fresh HOME and cache, offline). */
export const NPM = Object.freeze({
  path: '/opt/homebrew/bin:/usr/bin:/bin',
  /**
   * Row 5 is about the packed tarball, so lifecycle scripts run as a real `npm pack` runs them (a
   * package may fill `node_modules/<library>` in `prepack`). It runs on a throwaway copy of
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
  ui: 'F-UI (creates packages/core/ui)',
  embed: 'R-EMBED (creates packages/dsh-connector-ui, W1 step 3)',
  featurePeers: 'FEAT-PEERS (the feature plugin drops the dsh-instance peer for the optional fishballInstance? inject)',
  pluginsPage: 'X-MATRIX (no Plugins page of a started DSH lists either library)',
  hostTrace: 'X-SEC (PLAT-EP-07 runtime part: module-load trace of a running hosted setup C + I + U)',
  standalone: 'unassigned in v3-tasks.md (standalone install of the core tarball with no registry; core is not standalone-loadable before S6/F-GUARDS)',
})
/** PLAT-EP-07 row 6 "at least two users": the library whose single-user modules a later task moves out, with that task. */
