/**
 * Vocabulary of the placement cases. Every value is a requirement, never read from the code:
 * - shippedFiles (the "files" exclusion fix, fab3837): a package ships its package.json plus exactly
 *   its manifest "files" entries; a folder entry ships every regular file beneath it; '*' matches
 *   within the last segment only; an entry starting with '!' excludes that path (file or folder, with
 *   or without a trailing '/') and everything under it, whatever the order, as npm pack reads it; a
 *   nonexistent exclusion is not refused; a name-prefix sibling is kept; a missing positive entry
 *   rejects PLACEMENT_SOURCE_UNAVAILABLE and a symlink in a shipped tree UNSAFE_PLACEMENT_SOURCE;
 * - placement (README "Placement", constants.js PLACEMENT): at every start fishball-amenities
 *   and fishball-core are copied into <profile>/vendor/<name> and <profile>/node_modules/<name>,
 *   declared file:./vendor/<name>, and appended to the bundles in that order. Their bundled
 *   dependencies go beside them, never as bundles; the record fishball-placement.json keeps the
 *   owner's switches. The old standalone fishball-ui is no longer placed;
 * - the launch overlay (README "How it starts", R-HOST-04, design §6.2): HMR off, origin and port,
 *   the two instance rows, the isolation of instructions and skills; no guard row, no token.
 * Fixture paths are POSIX and converted to the platform separator by the cases.
 */
import path from 'node:path'

/** Placement's refusal codes (constants.js PLACEMENT.code, README "Placement"). */
export const CODE = Object.freeze({ unavailable: 'PLACEMENT_SOURCE_UNAVAILABLE', unsafe: 'UNSAFE_PLACEMENT_SOURCE', incompatible: 'PROFILE_INCOMPATIBLE' })

export const MANIFEST = 'package.json'

/** The env var that points the SHIP cases at another dsh-instance folder (before-fix.mjs, the fab3837 regression demo). */
export const PLACEMENT_FROM = 'FBTEST_PLACEMENT_FROM'
/** The placement module, relative to the dsh-instance package. */
export const PLACEMENT_MODULE = path.join('src', 'native-runtime', 'placement.js')
/** The instance's public runtime export (package.json exports "./native-runtime"). */
export const RUNTIME_MODULE = path.join('src', 'native-runtime', 'index.js')

// ------------------------------------------------------------------ shippedFiles (SHIP-*)

/**
 * The fixture package every SHIP case starts from. ui/tests-helper.js and ui/testsuite/x.js share
 * the name prefix "tests" with the excluded folder ui/tests/ (they must survive "!ui/tests").
 */
export const TREE = Object.freeze([
  'ui/a.js', 'ui/b.css', 'ui/tests/a.test.js', 'ui/tests/deep/b.test.js', 'ui/tests-helper.js', 'ui/testsuite/x.js', 'ui/sub/c.js',
  'src/index.js', 'README.md',
])
export const FIXTURE_NAME = 'dshi-shipped-files-fixture'
const UI_ALL = Object.freeze(TREE.filter((f) => f.startsWith('ui/')))
const without = (list, ...gone) => Object.freeze(list.filter((f) => !gone.includes(f)))
const UI_NO_TESTS = without(UI_ALL, 'ui/tests/a.test.js', 'ui/tests/deep/b.test.js')
const FILES = Object.freeze(['ui/tests/a.test.js', 'ui/tests-helper.js'])
const WILD = Object.freeze(['ui/a.js', 'ui/tests-helper.js', 'ui/tests/a.test.js'])

/**
 * SHIP-DT-01 column 1: the positive entry kind, its entries, and what each exclusion (column 2 key)
 * leaves of the fixture. The order (column 3) never changes the expectation.
 */
export const KINDS = Object.freeze([
  Object.freeze({
    kind: 'folder', positive: Object.freeze(['ui/']),
    expect: Object.freeze({ none: UI_ALL, folderSlash: UI_NO_TESTS, folderNoSlash: UI_NO_TESTS, file: without(UI_ALL, 'ui/tests/a.test.js'), missing: UI_ALL, prefix: UI_ALL }),
  }),
  Object.freeze({
    kind: 'file', positive: FILES,
    expect: Object.freeze({
      none: FILES, folderSlash: without(FILES, 'ui/tests/a.test.js'), folderNoSlash: without(FILES, 'ui/tests/a.test.js'),
      file: without(FILES, 'ui/tests/a.test.js'), missing: FILES, prefix: FILES,
    }),
  }),
  Object.freeze({
    // '*' within the last segment only: ui/*.js takes neither ui/b.css nor ui/sub/c.js; ui/tests/*.js not deep/.
    kind: 'wildcard', positive: Object.freeze(['ui/*.js', 'ui/tests/*.js']),
    expect: Object.freeze({
      none: WILD, folderSlash: without(WILD, 'ui/tests/a.test.js'), folderNoSlash: without(WILD, 'ui/tests/a.test.js'),
      file: without(WILD, 'ui/tests/a.test.js'), missing: WILD, prefix: WILD,
    }),
  }),
])

/** SHIP-DT-01 column 2: the exclusion (none = no '!' entry). */
export const EXCLUSIONS = Object.freeze([
  Object.freeze({ key: 'none', entry: null, label: 'no exclusion' }),
  Object.freeze({ key: 'folderSlash', entry: '!ui/tests/', label: 'folder with slash' }),
  Object.freeze({ key: 'folderNoSlash', entry: '!ui/tests', label: 'folder without slash' }),
  Object.freeze({ key: 'file', entry: '!ui/tests/a.test.js', label: 'single file' }),
  Object.freeze({ key: 'missing', entry: '!ui/ghost/', label: 'nonexistent path, not refused' }),
  // One character short of the folder name "tests": it names no path, so it drops nothing.
  Object.freeze({ key: 'prefix', entry: '!ui/test', label: 'prefix of sibling names' }),
])

/** SHIP-DT-01 column 3: where the exclusion stands relative to the positive entries. */
export const ORDERS = Object.freeze(['before', 'after'])

/** SHIP-EP-01 boundary and equivalence rows: [part, title, files, expected shipped files beside package.json]. */
export const EXTRA = Object.freeze([
  ['nested', 'a deeper exclusion "!ui/tests/deep/" keeps ui/tests/a.test.js', ['ui/', '!ui/tests/deep/'], without(UI_ALL, 'ui/tests/deep/b.test.js')],
  ['nested', 'a deeper exclusion without slash "!ui/tests/deep" keeps ui/tests/a.test.js', ['ui/', '!ui/tests/deep'], without(UI_ALL, 'ui/tests/deep/b.test.js')],
  ['equal', 'the exclusion equals the positive folder "!ui/": nothing of it ships', ['ui/', '!ui/'], []],
  ['equal', 'the exclusion names the positive folder without slash "!ui": nothing of it ships', ['ui/', '!ui'], []],
  ['parent', 'a parent-folder exclusion drops the whole ui tree, another entry (src/) still ships', ['ui/', 'src/', '!ui'], ['src/index.js']],
  ['later positive', 'a positive file entry AFTER the exclusion, inside the excluded folder, stays out', ['ui/', '!ui/tests/', 'ui/tests/a.test.js'], UI_NO_TESTS],
  ['later positive', 'a positive folder entry AFTER the exclusion, inside the excluded folder, stays out', ['ui/', '!ui/tests', 'ui/tests/'], UI_NO_TESTS],
  ['only exclusion', 'a list of only an existing exclusion ships package.json alone', ['!ui/tests/'], []],
  ['only exclusion', 'a list of only a nonexistent exclusion ships package.json alone and is not refused', ['!ghost.js'], []],
  ['several', 'two exclusions in one list both apply', ['ui/', '!ui/tests/', '!ui/sub'], without(UI_NO_TESTS, 'ui/sub/c.js')],
  ['top-level file', 'a top-level file exclusion "!README.md" drops that file only', ['README.md', 'src/', '!README.md'], ['src/index.js']],
  ['file prefix', 'an exclusion one character short of a file name ("!ui/a.j") keeps ui/a.js', ['ui/a.js', '!ui/a.j'], ['ui/a.js']],
  ['file prefix', 'an exclusion one character longer than a file name ("!ui/a.jsx", nonexistent) keeps ui/a.js', ['ui/a.js', '!ui/a.jsx'], ['ui/a.js']],
])

/** SHIP-EP-02, the refusals the fix keeps: [part, title, files, a symlink to add (or null), expected code]. */
export const REFUSALS = Object.freeze([
  ['missing positive', 'a missing positive entry is still refused beside an exclusion', ['ui/', 'ghost/', '!ui/tests/'], null, CODE.unavailable],
  ['symlink', 'a symlink in a shipped part of the tree is refused beside an exclusion', ['ui/', '!ui/tests/'], 'ui/sub/link.js', CODE.unsafe],
])

// ------------------------------------------------------------------ the placed set (PLACE-*, PLAT-DT-01)

/** The hosted set (README "Placement") and the retired standalone UI bundle. */
export const SET = Object.freeze({
  amenities: 'fishball-amenities',
  core: 'fishball-core',
  library: 'fishball-shared',
  retired: 'fishball-ui',
  version: '1.0.0-alpha.1',
  prefix: 'fishball-',
})
export const BUNDLES = Object.freeze([SET.amenities, SET.core])
export const AMENITY_PACKAGES = Object.freeze(['fishball-board', 'fishball-heartbeat', 'fishball-taskboard'])

/** The fake dsh-fishball checkout FISHBALL_REPO points at: packages/<folder> per package. */
export const FAKE_REPO = Object.freeze({
  env: 'FISHBALL_REPO',
  root: 'dsh-fishball',
  packages: 'packages',
  coreFolder: 'core',
  modules: 'node_modules',
  patch: 'cordis.patch.yml',
  /** core's own files list, as the real core writes it since e07228ff: "ui/" and "!ui/tests/". */
  coreFiles: Object.freeze(['cordis.patch.yml', 'src/', 'ui/', '!ui/tests/']),
  coreTree: Object.freeze(['src/index.js', 'ui/client.js', 'ui/tests/client.test.js']),
  mustShip: 'ui/client.js',
  excluded: 'ui/tests',
  libraryFiles: Object.freeze(['index.js']),
  engines: Object.freeze({ dsh: '>=0.2.1-rc.5' }),
  /** An engines.dsh range no SDK of the matrix meets (makes core incompatible). */
  impossibleEngine: '>=99.0.0',
})

/** The DSH-shipped agent preset rows (K3 guards.d.ts ShippedPresetRow): core's patch switches them off. */
export const SHIPPED_PRESETS = Object.freeze(['preset-standard', 'preset-ptc', 'preset-cordis', 'preset-minimal'])
/** The rows core's guard patch owns (K3 guards.d.ts GuardedRow); the overlay never touches one. */
export const GUARDED_ROWS = Object.freeze([
  'ui-subagent', 'ui-schedule', 'schedule', 'ui-permission', 'ui-agent-preset', 'entry-customization',
  'ui-open-in-app', 'open-in-app', 'ui-sidebar-terminal', 'terminal-controller', 'dsh-instance', 'ui-model-selection',
])
/** DSH's policy rows core's patch sets (K3 IntendedPolicy); the overlay never patches them (R-HOST-04). */
export const POLICY_ROWS = Object.freeze(['sandbox-policy', 'approval', 'permission', 'agent-preset-registry'])

/** Where the child lives below the main home (README "Where"). */
export const CHILD = Object.freeze({
  runtime: Object.freeze(['fishball', 'runtime']),
  profile: Object.freeze(['fishball', 'runtime', 'dsh-home', 'profiles', 'fishball']),
  secret: 'control.secret',
  copyDirs: Object.freeze(['vendor', 'node_modules']),
  dependency: (name) => 'file:./vendor/' + name,
  record: Object.freeze({ file: 'fishball-placement.json', format: 1, key: 'placed', mode: 0o600 }),
  /** The installed DSH package whose installation the child runs. */
  anchor: Object.freeze(['@deepseek-ai', 'dsh', 'package.json']),
  bootPackage: '@deepseek-ai/dsh-app-boot',
  binName: 'fishball',
})

/** HOST-EP-03 row 6 / R-HOST-04 / design §6.2: what the launch overlay may carry. */
export const OVERLAY = Object.freeze({
  hmr: 'hmr',
  /** The two instance runtime rows (Q-5; I-HOST, I-READY): the lifecycle row and the child-side row. */
  runtimeRows: Object.freeze(['fishball-native-child', 'dsh-instance-child']),
  /** The child's own origin and port (V2 PG-ORIGIN). */
  origin: Object.freeze(['webserver', 'web-runtime']),
  isolation: Object.freeze({
    instructions: Object.freeze({ id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', field: 'projectRootMarkers' }),
    skills: Object.freeze({ id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', field: 'includeDefaultRoots', home: 'dshHome', agentsHome: 'agentsHome', customDirs: 'customSkillDirs' }),
    /** The user's real agents folder under the OS home (DSH's ~/.agents default). */
    userAgentsDir: '.agents',
  }),
  presetRow: /^preset-/,
  presetOpKeys: Object.freeze(['id', 'config']),
  /** A panel or settings row (withdrawn settings section, R-HOST-11). */
  settingsRow: /settings/,
  /** The shape of a lifecycle secret or an admission key. */
  hex64: /[0-9a-f]{64}/i,
})
