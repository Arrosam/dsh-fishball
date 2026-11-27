/**
 * Values of the release and package-boundary rows. Sources (never an implementation): the REL-PACK task
 * and the user's release brief of 2026-11-17 (old test/v3/release/pack constants), R-ARCH-08 / R-BND-01 /
 * F-UI / the amenities split (old test/v3/contract/package-boundaries constants), the user's decision of
 * 2026-11-21 (2e1dbfd4: the amenities, fishball-board included, ship with Fishball, SHELVE-BOARD's release
 * half ended; core and fishball-ui still name the board nowhere), and the test restructure
 * (docs/testing/README.md, 2026-11-22: tests/ folders never ship; fishball-test-helpers is private and no
 * package under test imports it). A value marked "harness" is a budget or plumbing, not an oracle.
 */
import path from 'node:path'
import { REPO } from 'fishball-test-helpers/packages'

export const VERSION = '1.0.0-alpha.1'

/** The Fishball packages (all of this repository's packages under test) and their roles. */
export const FISHBALL = Object.freeze({
  library: 'fishball-shared',
  core: 'fishball-core',
  ui: 'fishball-ui',
  amenities: 'fishball-amenities',
  board: 'fishball-board',
  heartbeat: 'fishball-heartbeat',
  taskboard: 'fishball-taskboard',
  consultant: 'fishball-consultant',
  helpers: 'fishball-test-helpers',
})
/** Every package under test (fishball-test-helpers is a test tool, not one of them). */
export const NAMES = Object.freeze([FISHBALL.library, FISHBALL.core, FISHBALL.ui, FISHBALL.board, FISHBALL.heartbeat, FISHBALL.taskboard, FISHBALL.consultant, FISHBALL.amenities])
/** The amenities: each finds core only through the optional `fishballInstance` service (design §9.1), never by import. */
export const FEATURES = Object.freeze([FISHBALL.board, FISHBALL.heartbeat, FISHBALL.taskboard])

/**
 * The release: one tarball per published package (scripts/release/constants.mjs PACKAGES is the pack's
 * own list; fishball-ui ships inside fishball-core's tarball, its manifest is private). `folder` is the
 * repository.directory every manifest names; it is read from the catalogue by name, never written here.
 */
export const RELEASED = Object.freeze([FISHBALL.library, FISHBALL.core, FISHBALL.board, FISHBALL.heartbeat, FISHBALL.taskboard, FISHBALL.consultant, FISHBALL.amenities])
export const LIBRARIES = Object.freeze([FISHBALL.library])
/**
 * A package shipped inside another's tarball (fishball-core's manifest `files` lists `ui/`; fishball-ui is
 * private): Node resolves its bare imports from the carrier's bundled node_modules, so the carrier's
 * manifest is the one that must depend on and bundle what it imports.
 */
export const CARRIED = Object.freeze({ [FISHBALL.ui]: FISHBALL.core })
export const tarballName = (name) => name + '-' + VERSION + '.tgz'

/** Manifest and dependency vocabulary (npm's and DSH's own field names). */
export const FIELDS = Object.freeze({
  deps: Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']),
  dev: 'devDependencies',
  runtime: 'dependencies',
  bundled: Object.freeze(['bundleDependencies', 'bundledDependencies']),
  peersMeta: 'peerDependenciesMeta',
  dsh: 'dsh', client: 'client', exports: 'exports', private: 'private',
})

/** npm pack and the tarball layout. */
export const PACK = Object.freeze({
  command: 'npm', manifest: 'package.json', nodeModules: 'node_modules', prefix: 'package/',
  dryRunArgs: Object.freeze(['pack', '--dry-run', '--json', '--ignore-scripts']),
  env: Object.freeze({ npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' }),
  jsonStart: /^\[/m,
  maxStdoutBytes: 64 * 1024 * 1024,
})

/** The parse worker (harness). */
export const SCAN = Object.freeze({
  worker: path.join(import.meta.dirname, 'support', 'parse-worker.mjs'),
  execArgv: Object.freeze(['--expose-internals', '--no-warnings']),
  js: /\.(?:c|m)?js$/,
  digest: 'sha256',
})

/** The test restructure (2026-11-22): what never ships and what no package under test imports. */
export const TESTS_RULE = Object.freeze({
  /** A tests/ (or test/, __tests__/) folder segment anywhere in a shipped path. */
  folder: /(?:^|\/)(?:tests?|__tests__)\//,
  samples: Object.freeze({
    hit: Object.freeze(['tests/a.test.mjs', 'ui/tests/x/README.md', 'node_modules/z/test/a.js', '__tests__/a.js']),
    clean: Object.freeze(['src/testing.js', 'contest.js', 'tests.js', 'src/attest/x.js', 'latest/x.js']),
  }),
  /** The controlled world: a synthetic package with a nested folder holding tests (as fishball-core holds ui/). */
  sample: Object.freeze({ prefix: 'fbtest-int-release-tests-', name: 'fbtest-tests-sample', version: '0.0.0', file: 'ui/tests/a.test.mjs', kept: 'ui/index.js' }),
  controlled: Object.freeze([
    Object.freeze({ partition: 'folder only', files: Object.freeze(['ui/']), ships: true }),
    Object.freeze({ partition: 'folder with !ui/tests/', files: Object.freeze(['ui/', '!ui/tests/']), ships: false }),
  ]),
})

/** R-ARCH-08 rule (5) read strictly (Fishball, 2026-11-16): every library module has at least this many users. */
export const MIN_LIBRARY_USERS = 2
/** REMOVE-V2b: fishball-shared's single-user modules moved into their one user, fishball-core. */
export const MOVED_INTO_CORE = Object.freeze(['files', 'oauth-client'].map((module) => Object.freeze({ module, file: module + '.js', specifier: FISHBALL.library + '/' + module })))
/** R-SHARED (3): core's private Skills store, which since REMOVE-V2b takes no helper from the library. */
export const SHARED_READER = 'skills-store.js'
/** Row 6 self-check of the counting rule on synthetic importer tables (no package is read). */
export const USERS_RULE = Object.freeze({
  module: 'fbtest-module.js', reexport: 'fbtest-reexport.js',
  cases: Object.freeze([
    { partition: 'BVA no importer', direct: [], via: [], pass: false },
    { partition: 'BVA one importer', direct: [FISHBALL.core], via: [], pass: false },
    { partition: 'BVA two importers', direct: [FISHBALL.core, FISHBALL.ui], via: [], pass: true },
    { partition: 'EP three importers', direct: [FISHBALL.core, FISHBALL.ui, FISHBALL.board], via: [], pass: true },
    { partition: 'EP one package importing it from two files counts once', direct: [FISHBALL.core, FISHBALL.core], via: [], pass: false },
    { partition: 'EP the library importing its own module does not count', direct: [FISHBALL.core, FISHBALL.library], via: [], pass: false },
    { partition: 'EP two packages reaching it only through a re-exporting library module', direct: [], via: [FISHBALL.core, FISHBALL.ui], pass: true },
  ].map(Object.freeze)),
})

/**
 * SHELVE-BOARD's code half, still standing after 2e1dbfd4 (its message: "SHELVE-BOARD's rule that core
 * and fishball-ui never name the board still holds"): no identifier or string of their shipped JS, no
 * shipped data file (READMEs and licences are prose) and no manifest field names the board.
 */
export const SHELVED_BOARD = Object.freeze({
  pkg: FISHBALL.board,
  holders: Object.freeze([FISHBALL.core, FISHBALL.ui]),
  mention: /fishball-board|(?<![a-z])board(?![a-z])/i,
  prose: /(?:^|\/)(?:README|LICENSE|THIRD_PARTY_NOTICES)[^/]*$/i,
  samples: Object.freeze({
    hit: Object.freeze(['fishball-board', '/api/fishball/board', 'board_search', 'Board', 'open the board']),
    clean: Object.freeze(['dashboard', 'clipboard-write', 'onboarding', 'keyboard', 'settings.onboarding', 'fishball-taskboard', 'taskboard']),
  }),
})
/** A package with browser code ships a client entry (the amenities split: only such a package carries dsh.client). */
export const CLIENT = Object.freeze({ file: /^client(?:\.[\w-]+)?\.js$/ })

/** DSH's own path inspection (the Plugins page's add) refuses a package with no dsh.bundle with this problem. */
export const INSPECT = Object.freeze({ manager: 'dsh-plugin-manager', refused: 'refused', notABundle: 'not-a-bundle', tempPrefix: 'fbtest-int-release-inspect-', profileName: 'fbtest-inspect-profile', manifest: 'package.json', anchor: 'anchor.json' })

/** The release folder (written beforehand by `node scripts/pack-v3.mjs`; FBTEST_RELEASE_DIR moves it). */
export const RELEASE = Object.freeze({
  env: 'FBTEST_RELEASE_DIR',
  /** FBTEST_RELEASE_REQUIRED=1: a missing release fails instead of skipping (the old release-check gate). */
  requiredEnv: 'FBTEST_RELEASE_REQUIRED', requiredOn: '1',
  dir: path.resolve(process.env.FBTEST_RELEASE_DIR ?? path.join(REPO, '.runtime', 'release', VERSION)),
  skipReason: 'release folder missing: run `node scripts/pack-v3.mjs` first (.runtime/release/' + VERSION + '; FBTEST_RELEASE_DIR moves it)',
  tarballSuffix: '.tgz', sums: 'SHA256SUMS', install: 'INSTALL.md', publish: 'PUBLISH.md', offlineStore: 'offline-store.mjs',
  docs: Object.freeze(['INSTALL.md', 'PUBLISH.md']),
  store: 'pnpm-store', cache: 'pnpm-cache',
  sumLine: /^([0-9a-f]{64}) {2}(\S(?:.*\S)?)$/,
  sumSamples: Object.freeze({
    valid: Object.freeze(['a'.repeat(64) + '  x.tgz', '0123456789abcdef'.repeat(4) + '  fishball-core-1.0.0-alpha.1.tgz']),
    invalid: Object.freeze(['a'.repeat(63) + '  x.tgz', 'a'.repeat(65) + '  x.tgz', 'a'.repeat(64) + ' x.tgz', 'a'.repeat(64) + '   x.tgz',
      'A'.repeat(64) + '  x.tgz', 'a'.repeat(64) + '\tx.tgz', 'a'.repeat(64) + '  ', 'g'.repeat(64) + '  x.tgz']),
  }),
  publishLine: /^\s*npm publish\s+\S*?([\w.-]+\.tgz)\b/,
  publishSamples: Object.freeze({
    hit: Object.freeze(['npm publish ./fishball-core-1.0.0-alpha.1.tgz --tag alpha', '  npm publish fishball-shared-1.0.0-alpha.1.tgz']),
    clean: Object.freeze(['npm view fishball-core@1.0.0-alpha.1 version', '# npm publish', 'shasum -a 256 -c SHA256SUMS']),
  }),
  lineBreak: '\n',
})

/** Requirement 1: every top-level manifest in a tarball. */
export const MANIFEST = Object.freeze({
  enginesNode: '>=22.14', enginesDsh: '>=0.2.1-rc.5', dshEngine: 'dsh', license: 'MIT',
  repositoryUrlPart: 'github.com/Arrosam/dsh-fishball', publishTag: 'alpha',
  zod: 'zod', zodRange: '*', zodForbiddenFields: Object.freeze(['dependencies', 'optionalDependencies', 'devDependencies']),
  peerField: 'peerDependencies', hostScope: '@deepseek-ai/', hostPeerRange: '*',
  exactInternalFields: Object.freeze(['dependencies', 'optionalDependencies']),
  dshSemverOptions: Object.freeze({ includePrerelease: true }),
  /** BVA around `>=0.2.1-rc.5`: the prerelease just below the bound. */
  dshBelowBound: '0.2.1-rc.4',
  /** Fishball's release pin of its own MCP client (old mcp-pins.mjs; core's manifest note: pinned at 2.4.0). */
  mcpPins: Object.freeze({ [FISHBALL.core]: Object.freeze([Object.freeze({ name: '@modelcontextprotocol/client', version: '2.4.0' })]) }),
  semver: 'semver',
})

/** Requirement 6: no tests or runtime junk anywhere in a tarball (bundled node_modules included). */
export const JUNK = Object.freeze({
  dirSegments: Object.freeze(['test', 'tests', '__tests__', 'spikes', '.runtime', 'coverage']),
  fileNames: Object.freeze([/\.test\./, /\.log$/, /^\.DS_Store$/, /^\.env$/, /\.sqlite/, /\.db$/, /^\.npmrc$/, /^pnpm-lock\.yaml$/, /^package-lock\.json$/]),
  samples: Object.freeze({
    junk: Object.freeze(['test/a.js', 'lib/tests/a.js', 'node_modules/z/__tests__/x.js', 'spikes/s.js', '.runtime/x.json', 'coverage/lcov.info',
      'a.test.js', 'src/b.test.mjs', 'debug.log', 'lib/.DS_Store', '.env', 'data.sqlite', 'data.sqlite-wal', 'x.db', '.npmrc', 'pnpm-lock.yaml', 'node_modules/q/package-lock.json']),
    clean: Object.freeze(['testing/a.js', 'contest.js', 'lib/test.js', 'tests.js', 'latest/x.js', 'src/attest/x.js', 'log.txt', 'db.js',
      'catalog.json', 'node_modules/q/package.json', 'environment.js', 'logger.mjs']),
  }),
})

/** Requirement 4: fishball-core bundles its runtime closure, its MCP client among it. */
export const CORE_CLOSURE = Object.freeze({ owner: FISHBALL.core, mcpClient: MANIFEST.mcpPins[FISHBALL.core][0], walkFields: Object.freeze(['dependencies']) })
/** Requirement 7: the pack script stages bundled packages into node_modules/; every other path matches the folder's own listing. */
export const STAGED = Object.freeze([/^node_modules\//])

/** The pack script's checker (`--check`, `--out <dir>`; exit 0 = intact). */
export const PACK_SCRIPT = Object.freeze({
  catalog: path.join(REPO, 'scripts', 'release', 'constants.mjs'),
  file: path.join(REPO, 'scripts', 'pack-v3.mjs'), check: '--check', out: '--out', okExit: 0,
  absentDir: 'no-such-release', flipMask: 0xff,
  offsets: Object.freeze({ first: () => 0, middle: (size) => Math.floor(size / 2), last: (size) => size - 1 }),
  tamperTarget: FISHBALL.core, strayTarball: 'fbtest-stray-' + VERSION + '.tgz', unexpected: /unexpected/i,
})

/** DSH's CLI and profile (the release documents use the web profile). */
export const DSH = Object.freeze({
  bin: path.join('.bin', 'dsh'), profile: 'web', okExit: 0,
  profileDir: (home, profile) => path.join(home, 'profiles', profile),
  bundlesPath: Object.freeze(['dsh', 'profile', 'bundles']),
  cacheArgs: (cache) => ['--cache-dir=' + cache, '--registry=https://registry.npmjs.org'],
  pluginArgs: (profile, tarballs, store, cache) => ['plugin', '--profile', profile, 'add', ...tarballs, '--offline', '--store-dir=' + store, ...DSH.cacheArgs(cache), '--ignore-scripts'],
  storePathArgs: (profile) => ['plugin', '--profile', profile, 'store', 'path'],
  /** A later install with no --store-dir (INSTALL.md: keep the folder; a later --offline add needs its cache and the registry). */
  laterArgs: (profile, tarball, cache) => ['plugin', '--profile', profile, 'add', tarball, '--offline', ...DSH.cacheArgs(cache)],
})

/**
 * INSTALL.md's install sets (scripts/release/constants.mjs INSTALL_SETS: standalone = core, the
 * umbrella, each amenity alone), each with an `other` plugin of the release installed later from
 * outside the folder (REL-ST-02; one with no third-party dependency of its own, as the old rows chose).
 */
export const SETS = Object.freeze([
  Object.freeze({ key: 'standalone', pkgs: Object.freeze([FISHBALL.core]), other: FISHBALL.heartbeat }),
  Object.freeze({ key: 'amenities', pkgs: Object.freeze([FISHBALL.amenities]), other: FISHBALL.core }),
  Object.freeze({ key: 'board', pkgs: Object.freeze([FISHBALL.board]), other: FISHBALL.heartbeat }),
  Object.freeze({ key: 'heartbeat', pkgs: Object.freeze([FISHBALL.heartbeat]), other: FISHBALL.board }),
  Object.freeze({ key: 'taskboard', pkgs: Object.freeze([FISHBALL.taskboard]), other: FISHBALL.heartbeat }),
  Object.freeze({ key: 'consultant', pkgs: Object.freeze([FISHBALL.consultant]), other: FISHBALL.heartbeat }),
])
export const INSTALL_DOC = Object.freeze({
  fence: /^\s*```/,
  addLine: /\bdsh plugin --profile web add\s/,
  tarballArg: /[\w.-]+\.tgz/g,
  onlineSpec: /([\w.-]+)@1\.0\.0-alpha\.1/g,
  offlineFlag: '--offline',
  shell: '/bin/bash', shellArgs: Object.freeze(['-e', '-c']),
  binDir: 'bin', cliName: 'dsh', laterDir: 'later', runs: 2,
  unexpectedStore: /ERR_PNPM_UNEXPECTED_STORE/,
  modulesYaml: Object.freeze(['node_modules', '.modules.yaml']), storeDirKey: 'storeDir',
})

/** Isolation of every child process (harness): a scratch HOME and caches, no user npm config, a dead proxy. */
export const ISOLATION = Object.freeze({
  path: '/opt/homebrew/bin:/usr/bin:/bin', userconfig: '/dev/null', globalconfigFile: 'globalrc',
  deadProxy: 'http://127.0.0.1:9', proxyScheme: 'http://', proxyHost: '127.0.0.1',
  proxyVars: Object.freeze(['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'npm_config_https_proxy', 'npm_config_proxy']),
  homeDir: 'home', npmCacheDir: 'npm-cache', dshHomeDir: 'dsh-home', emptyStoreDir: 'empty-store', emptyCacheDir: 'empty-cache', copyDir: 'release-copy',
  tempPrefix: 'fbtest-int-release-', tar: '/usr/bin/tar', tarList: '-tzf', npm: '/opt/homebrew/bin/npm',
})
/** Harness budgets (waiting only). */
export const BUDGET = Object.freeze({ toolMs: 300000, checkCaseMs: 1800000, installCaseMs: 600000, docCaseMs: 1200000, maxOutputBytes: 64 * 1024 * 1024, tailChars: 4000 })

/** Case ids: the old suites' families. */
export const CONSULTANT_RELEASE = Object.freeze({ member: 'consultant', collection: 'amenities' })

export const CASE = Object.freeze({
  consultant: 'REL-CONSULTANT',
  plat: 'PLAT-EP-07', host: 'HOST-EP-03', shelve: 'SHELVE-EP-01', tests: 'REL-TESTS', helpers: 'REL-HELPERS',
  oracle: 'REL-ORACLE', layout: 'REL-EP-01', sums: 'REL-EP-02', extras: 'REL-EP-03', manifest: 'REL-EP-04', engines: 'REL-DT-01', peers: 'REL-DT-02',
  links: 'REL-EP-05', bundling: 'REL-DT-03', closure: 'REL-EP-06', junk: 'REL-EP-08', dryRun: 'REL-EP-09', check: 'REL-ST-01',
  standalone: 'REL-SYS-02', alone: 'REL-SYS-03', emptyStore: 'REL-DT-04', docOrder: 'REL-EP-10', docFresh: 'REL-ST-02', publish: 'REL-EP-14',
})
