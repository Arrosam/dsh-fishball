/**
 * Vocabulary for the REL-PACK black-box cases (the release tarballs, their checker and their offline
 * install with the real DSH CLI).
 *
 * Every value comes from the REL-PACK task statement given to the test author (requirements 1–7 and
 * the offline-install cases, with the lead's corrections of 2026-11-17: the connector's npm name
 * `dsh-agent-connector`, the `pnpm-cache/` folder and the dead-proxy isolation, zod allowed inside
 * core's third-party bundle, top-level-only metadata rules, importers derived from manifests) and
 * docs/planning/v3-tasks.md (REL-PACK row), never from an implementation. A value marked
 * "harness" is a budget or plumbing of this suite, not a product oracle.
 */
import os from 'node:os'
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
import { MCP_PINS } from './mcp-pins.mjs'

/** REL-PACK: the one shared release version of every package. */
export const VERSION = '1.0.0-alpha.1'

/** npm pack naming: `<name>-<version>.tgz` (no package is scoped). */
const tarballName = (name) => `${name}-${VERSION}.tgz`
const pkg = (name, folder) => Object.freeze({ name, folder: 'packages/' + folder, tarball: tarballName(name) })

/**
 * The 8 packages and their repo folders: the ONE place a package name lives (the connector's npm
 * name was an open product question; the lead set it to `dsh-agent-connector` on 2026-11-17, its
 * folder stays packages/dsh-connector). A rename is a one-line edit here.
 * Re-baselined (SHELVE-BOARD, was 9): fishball-board is out of 1.0.0-alpha.1. The user, 2026-11-18:
 * "fishball-board先从这次release中移除，我要改的地方太多了。先封存，留到下一批再说。所以不要预留在子实例的Fishball内。"
 */
export const PACKAGES = Object.freeze({
  connector: pkg('dsh-agent-connector', 'dsh-connector'),
  connectorUi: pkg('dsh-connector-ui', 'dsh-connector-ui'),
  instance: pkg('dsh-instance', 'dsh-instance'),
  adapter: pkg('dsh-connector-adapter', 'dsh-connector-adapter'),
  dshShared: pkg('dsh-connector-shared', 'dsh-connector-shared'),
  core: pkg('fishball-core', 'core'),
  ui: pkg('fishball-ui', 'fishball-ui'),
  shared: pkg('fishball-shared', 'shared'),
})
/**
 * SHELVE-BOARD: the shelved package (packages/board stays in the repo, unchanged). It is named only
 * so the cases can say it is absent: no tarball, no SHA256SUMS line, no bundled copy, no doc mention,
 * nothing in a hosted child. `mention` is the one rule for "names the board" every SHELVE row uses
 * (release docs, core/ui sources, the manager's prompt): the package name, or the word itself (also
 * as a `board_` tool prefix); "dashboard", "clipboard", "onboarding" are other words.
 */
export const SHELVED = Object.freeze({
  board: pkg('fishball-board', 'board'),
  mention: /fishball-board|(?<![a-z])board(?![a-z])/i,
})
/**
 * The hosted child profile's placement files (I-PLACE's relayed seam, 2026-11-15): the record the
 * instance writes, and the two folders each placed package is copied to. The one place these names
 * live; dsh-instance/placement's RELAYED and the SHELVE rows read them from here.
 */
export const CHILD_PLACEMENT = Object.freeze({ record: 'fishball-placement.json', copyDirs: Object.freeze(['vendor', 'node_modules']) })
/** SHELVE-BOARD (BVA on the count): exactly this many tarballs, SHA256SUMS lines and publish lines. */
export const RELEASE_COUNT = Object.freeze({ tarballs: 8, bundled: 2 })
/**
 * SHELVE-BOARD: what INSTALL.md and PUBLISH.md must never name (the package, or the board at all);
 * the word itself (also as a tool prefix, board_…), so "dashboard" or "clipboard" do not count. Each doc's `npm publish` lines.
 */
export const SHELVED_DOC = Object.freeze({
  names: Object.freeze([SHELVED.mention]),
  publishLine: /^\s*npm publish\s+\S*?([\w.-]+\.tgz)\b/,
  publishDoc: 'PUBLISH.md',
  /** `--check`'s word for an extra tarball in the folder (SHELVE-BOARD requirement 1). */
  unexpected: /unexpected/i,
  /** Oracle self-check (EP: the package name and the bare word; look-alikes that are other words). */
  samples: Object.freeze({
    hit: Object.freeze(['fishball-board', 'Fishball-Board@1.0.0-alpha.1', 'the board', 'Board:', '(board)', 'board_search']),
    clean: Object.freeze(['dashboard', 'clipboard-write', 'onboarding', 'keyboard', 'fishball-ui', 'billboards']),
  }),
  /** Oracle self-check of `publishLine` (EP: a publish line with ./ and without; lines that publish nothing). */
  publishSamples: Object.freeze({
    hit: Object.freeze(['npm publish ./fishball-core-1.0.0-alpha.1.tgz --tag alpha', '  npm publish fishball-ui-1.0.0-alpha.1.tgz']),
    clean: Object.freeze(['npm view fishball-core@1.0.0-alpha.1 version', '# npm publish', 'shasum -a 256 -c SHA256SUMS']),
  }),
})
export const ALL = Object.freeze(Object.values(PACKAGES))
export const ALL_NAMES = Object.freeze(ALL.map((p) => p.name))
/** Requirement 1: the two libraries (no engines.dsh rule); every other package is a plugin. */
export const LIBRARIES = Object.freeze([PACKAGES.dshShared, PACKAGES.shared])
export const isLibrary = (p) => LIBRARIES.includes(p)
/** Requirement 3: fishball-shared's importers are named; dsh-connector-shared's are derived from the manifests (lead, 2026-11-17). */
export const NAMED_IMPORTERS = Object.freeze({ [PACKAGES.shared.name]: Object.freeze([PACKAGES.core.name, PACKAGES.ui.name]) })

/** The release output (written beforehand by `node scripts/pack-v3.mjs`). */
export const RELEASE = Object.freeze({
  env: 'FBTEST_RELEASE_DIR',
  /** Resolved, so every tarball path handed to the DSH CLI is absolute. */
  dir: path.resolve(process.env.FBTEST_RELEASE_DIR ?? path.join(REPO, '.runtime', 'release', VERSION)),
  /** Shown in failures, so a reader sees which folder was read. */
  defaultHint: '.runtime/release/' + VERSION,
  tarballSuffix: '.tgz',
  sums: 'SHA256SUMS',
  /** `<64 lowercase hex>  <file name>` (two spaces; the name starts with a non-space, so three spaces fail). */
  sumLine: /^([0-9a-f]{64}) {2}(\S(?:.*\S)?)$/,
  /** Oracle self-check of `sumLine` (BVA: hex length 63/64/65, one/two/three spaces, case, tab). */
  sumSamples: Object.freeze({
    valid: Object.freeze(['a'.repeat(64) + '  x.tgz', '0123456789abcdef'.repeat(4) + '  fishball-core-1.0.0-alpha.1.tgz']),
    invalid: Object.freeze(['a'.repeat(63) + '  x.tgz', 'a'.repeat(65) + '  x.tgz', 'a'.repeat(64) + ' x.tgz', 'a'.repeat(64) + '   x.tgz',
      'A'.repeat(64) + '  x.tgz', 'a'.repeat(64) + '\tx.tgz', 'a'.repeat(64) + '  ', 'g'.repeat(64) + '  x.tgz']),
  }),
  lineBreak: '\n',
  digest: 'sha256',
  digestEncoding: 'hex',
  docs: Object.freeze(['INSTALL.md', 'PUBLISH.md']),
  /** The warmed pnpm store and its metadata cache (pnpm offline needs both; lead, 2026-11-17). */
  store: 'pnpm-store',
  cache: 'pnpm-cache',
  /** The reader's instruction when the output is missing. */
  missingHint: 'run `node scripts/pack-v3.mjs` first',
})

/** The pack script's checker: `--check` re-verifies offline (0 = valid); `--out <dir>` selects the release. */
export const PACK_SCRIPT = Object.freeze({
  file: path.join(REPO, 'scripts', 'pack-v3.mjs'),
  check: '--check',
  out: '--out',
  okExit: 0,
  /** A path that is no release (an absent folder inside the case's temp dir). */
  absentDir: 'no-such-release',
  /** Tampering: XOR one byte with this mask, at the first, middle and last offset (BVA over the file). */
  flipMask: 0xff,
  offsets: Object.freeze({ first: () => 0, middle: (size) => Math.floor(size / 2), last: (size) => size - 1 }),
  tamperTarget: PACKAGES.core,
  /** A stray tarball (breaks "no other .tgz"; the lead, 2026-11-17: --check verifies the layout). */
  strayTarball: `fbtest-stray-${VERSION}.tgz`,
})

/** npm tarball layout and the manifest file name. */
export const TARBALL = Object.freeze({ prefix: 'package/', manifest: 'package.json', nodeModules: 'node_modules' })

/** Requirement 1: rules for every top-level manifest (package/package.json). */
export const MANIFEST = Object.freeze({
  enginesNode: '>=22.14',
  enginesDsh: '>=0.2.1-rc.5',
  /** The engines key DSH checks; plugins carry it, the two libraries never do (the lead, 2026-11-17). */
  dshEngine: 'dsh',
  license: 'MIT',
  repositoryUrlPart: 'github.com/Arrosam/dsh-fishball',
  publishTag: 'alpha',
  zod: 'zod',
  zodRange: '*',
  /** "zod appears only in peerDependencies": every other dependency field. */
  zodForbiddenFields: Object.freeze(['dependencies', 'optionalDependencies', 'devDependencies']),
  peerField: 'peerDependencies',
  hostScope: '@deepseek-ai/',
  hostPeerRange: '*',
  /** Requirement 2: fields whose entries on another of the 8 must name exactly VERSION (peers only "admit" it). */
  exactInternalFields: Object.freeze(['dependencies', 'optionalDependencies']),
  /** How DSH checks engines.dsh (semver with prerelease admitted). */
  dshSemverOptions: Object.freeze({ includePrerelease: true }),
  /** BVA around `>=0.2.1-rc.5`: the prerelease just below the bound must be refused; the bound itself is DSH.versions[0]. */
  dshBelowBound: '0.2.1-rc.4',
})

/** Requirement 2: dsh-connector-ui's peers admit VERSION with includePrerelease false and true. */
export const UI_PEERS = Object.freeze({
  from: PACKAGES.connectorUi,
  peers: Object.freeze([PACKAGES.connector, PACKAGES.instance]),
  includePrerelease: Object.freeze([false, true]),
})

/** Requirement 3: library copies. */
export const BUNDLE = Object.freeze({
  dependencyField: 'dependencies',
  bundleFields: Object.freeze(['bundleDependencies', 'bundledDependencies']),
  copyDir: (name) => `node_modules/${name}/`,
})

/** These packages ship MCP dependencies independently of the SDK supplied by a DSH host. */
export const PACKED_MCP_PINS = Object.freeze({
  [PACKAGES.connector.name]: [MCP_PINS.server, MCP_PINS.node],
  [PACKAGES.adapter.name]: [MCP_PINS.client],
  [PACKAGES.core.name]: [MCP_PINS.client],
})

/** Requirement 4: fishball-core bundles its runtime dependency closure. */
export const CORE_CLOSURE = Object.freeze({
  owner: PACKAGES.core,
  mcpClient: MCP_PINS.client,
  /** The non-peer runtime field walked for every bundled package (optional ones are not stated). */
  walkFields: Object.freeze(['dependencies']),
  /** A bundled package folder: `.../node_modules/<name>` or `.../node_modules/@scope/<name>`. */
  packageDir: /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/,
})

/**
 * Requirement 5: the hosted child's plugin set, shipped inside dsh-instance as tarballs.
 * Re-baselined (SHELVE-BOARD, was ui, board, core): fishball-ui and fishball-core only, the user's
 * decision of 2026-11-18 ("不要预留在子实例的Fishball内": nothing of the board in the child).
 */
export const INSTANCE_BUNDLED = Object.freeze({
  owner: PACKAGES.instance,
  dir: 'bundled/',
  packages: Object.freeze([PACKAGES.ui, PACKAGES.core]),
  /** Requirement 6: a regular file at package/client.status.js. */
  statusFile: 'client.status.js',
})

/** Requirement 6: no tests or runtime junk anywhere in a tarball (bundled node_modules included). */
export const JUNK = Object.freeze({
  dirSegments: Object.freeze(['test', 'tests', '__tests__', 'spikes', '.runtime', 'coverage']),
  fileNames: Object.freeze([/\.test\./, /\.log$/, /^\.DS_Store$/, /^\.env$/, /\.sqlite/, /\.db$/, /^\.npmrc$/, /^pnpm-lock\.yaml$/, /^package-lock\.json$/]),
  /** Oracle self-check (BVA on segment vs substring and on the exact names). */
  samples: Object.freeze({
    junk: Object.freeze(['test/a.js', 'lib/tests/a.js', 'node_modules/z/__tests__/x.js', 'spikes/s.js', '.runtime/x.json', 'coverage/lcov.info',
      'a.test.js', 'src/b.test.mjs', 'debug.log', 'lib/.DS_Store', '.env', 'data.sqlite', 'data.sqlite-wal', 'x.db', '.npmrc',
      'pnpm-lock.yaml', 'node_modules/q/package-lock.json']),
    clean: Object.freeze(['testing/a.js', 'contest.js', 'lib/test.js', 'tests.js', 'latest/x.js', 'src/attest/x.js', 'log.txt', 'db.js',
      'catalog.json', 'node_modules/q/package.json', 'environment.js', 'logger.mjs']),
  }),
})

/**
 * Requirement 7: `npm pack --dry-run --json` of each repo folder, isolated, against the tarball. The pack
 * script stages each package in a temporary copy (never in packages/*), so the paths it adds there are
 * every path under node_modules/ (the library copies and core's third-party closure alike) and
 * dsh-instance's bundled/*.tgz (lead, 2026-11-17); every other path must match exactly.
 */
export const DRY_RUN = Object.freeze({
  args: Object.freeze(['pack', '--dry-run', '--json', '--ignore-scripts']),
  jsonStart: /^\[/m,
  staged: Object.freeze([
    Object.freeze({ owner: null, path: /^node_modules\// }),
    Object.freeze({ owner: PACKAGES.instance, path: /^bundled\/[^/]+\.tgz$/ }),
  ]),
})

/** The metadata cache and the registry it is keyed by: what an offline add needs of the release's pnpm-cache/ (lead, 2026-11-17). */
const cacheArgs = (cache) => ['--cache-dir=' + cache, '--registry=https://registry.npmjs.org']

/** The DSH SDKs (R-COMPAT-01); FBTEST_DSH_VERSIONS moves their parent folder. */
export const DSH = Object.freeze({
  versionsDir: process.env.FBTEST_DSH_VERSIONS ?? path.join(os.homedir(), 'Library', 'Application Support', 'DSH', 'data', 'versions'),
  versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  bin: path.join('node_modules', '.bin', 'dsh'),
  /** The SDK's own semver (DSH checks engines.dsh with it); createRequire needs a file inside node_modules. */
  semverAnchor: path.join('node_modules', 'fbtest-anchor.js'),
  semver: 'semver',
  profile: 'web',
  profileDir: (home, profile) => path.join(home, 'profiles', profile),
  /** `plugin --profile <p> add <tarballs…> <offline flags>` (lead, 2026-11-17: store, cache and the registry the cache is keyed by). */
  pluginArgs: (profile, tarballs, store, cache) => ['plugin', '--profile', profile, 'add', ...tarballs, '--offline',
    '--store-dir=' + store, ...cacheArgs(cache), '--ignore-scripts'],
  okExit: 0,
  bundlesPath: Object.freeze(['dsh', 'profile', 'bundles']),
})

/** The install sets of the system cases. */
export const SETS = Object.freeze({
  hosted: Object.freeze([PACKAGES.connector, PACKAGES.connectorUi, PACKAGES.instance]),
  /**
   * In this order: fishball-ui, then fishball-core (core last), plus the adapter. Re-baselined
   * (SHELVE-BOARD, was ui, board, core): the board is out of 1.0.0-alpha.1 (the user, 2026-11-18).
   */
  standalone: Object.freeze([PACKAGES.ui, PACKAGES.core, PACKAGES.adapter]),
  /** Empty store and cache: core's closure is bundled (installs), the connector's dependencies come from the registry (fails). */
  emptyStore: Object.freeze({ bundled: PACKAGES.core, registry: PACKAGES.connector }),
})

/**
 * E-FIX-2 (bug B2): INSTALL.md's documented offline install, run as written. A set's offline block
 * is the fenced block holding a `dsh plugin … add` line whose .tgz arguments are exactly the set's
 * tarballs, in order; its online command is an add line naming the set's packages at VERSION, in order.
 * Each set's `other` is a second plugin with no third-party dependency: a "used" profile gets it first
 * from another store, and on a fresh profile it is the later install (from a tarball outside the
 * release folder, which stays in place: INSTALL.md says to keep it while packages are installed from
 * it). Re-baselined (SHELVE-BOARD): fishball-board, the bug report's example, is no longer in the
 * release (the user, 2026-11-18: "fishball-board先从这次release中移除…先封存"), so the other plugin is
 * fishball-ui, a plugin of the release with no third-party dependency (its one dependency is bundled),
 * as the board was; the standalone set holds fishball-ui itself, so its other stays dsh-connector-shared
 * (so "the earlier plugin stays" is not trivially true).
 */
export const OFFLINE = Object.freeze({
  sets: Object.freeze([
    Object.freeze({ key: 'hosted', pkgs: SETS.hosted, other: PACKAGES.ui }),
    /** Standalone step 1: the managed DSH's connector and its UI (its own offline block since 0ff8cdfb). */
    Object.freeze({ key: 'managed', pkgs: Object.freeze([PACKAGES.connector, PACKAGES.connectorUi]), other: PACKAGES.ui }),
    // SHELVE-BOARD: fishball-ui then fishball-core, core last (was ui, board, core).
    Object.freeze({ key: 'standalone', pkgs: Object.freeze([PACKAGES.ui, PACKAGES.core]), other: PACKAGES.dshShared }),
    Object.freeze({ key: 'adapter', pkgs: Object.freeze([PACKAGES.adapter]), other: PACKAGES.ui }),
  ]),
  /** Profile states (decision table): never given a plugin, or given the set's `other` from another store first. */
  states: Object.freeze({ fresh: 'fresh', used: 'used' }),
  /** The doc says bash or zsh; `-e` stops at a failed line, so every line of the block must succeed. */
  shell: '/bin/bash',
  shellArgs: Object.freeze(['-e', '-c']),
  /** The block calls `dsh` from PATH: a folder of the scratch dir holding a link to the SDK's CLI. */
  binDir: 'bin',
  cliName: 'dsh',
  otherStoreDir: 'other-store',
  /** The later install's tarball is copied here, outside the release folder. */
  laterDir: 'later',
  /** The bug B2 error a later add must not show. */
  unexpectedStore: /ERR_PNPM_UNEXPECTED_STORE/,
  /** "No registry": the block's add line carries pnpm's offline flag. */
  offlineFlag: '--offline',
  /** Idempotence: the block run this many times in a row. */
  runs: 2,
  modulesYaml: Object.freeze([TARBALL.nodeModules, '.modules.yaml']),
  storeDirKey: 'storeDir',
  yaml: 'yaml',
  storePathArgs: (profile) => ['plugin', '--profile', profile, 'store', 'path'],
  /** "Used" profile set-up, from the bug report: `add <tarball> --offline --store-dir=<another temp store>`. */
  otherArgs: (profile, tarball, store) => ['plugin', '--profile', profile, 'add', tarball, '--offline', '--store-dir=' + store],
  /**
   * A later install with no --store-dir (the profile must not be linked to the release folder's store),
   * with the release's metadata cache and registry, as INSTALL.md says a later --offline add needs (66dbf20d).
   */
  laterArgs: (profile, tarball, cache) => ['plugin', '--profile', profile, 'add', tarball, '--offline', ...cacheArgs(cache)],
})

/** Escape a literal for a RegExp. */
const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A literal not glued to a longer name (`dsh-fishball` must not match inside `dsh-fishball-*`). */
const standalone = (s) => new RegExp(`(?<![\\w-])${literal(s)}(?![\\w-])`)

/** E-FIX-2 (bugs B2, B6): what INSTALL.md must say. */
export const INSTALL_DOC = Object.freeze({
  file: RELEASE.docs[0],
  fence: /^\s*```/,
  heading: /^## /,
  paragraphBreak: /^\s*$/,
  addLine: new RegExp(`\\bdsh plugin --profile ${literal(DSH.profile)} add\\s`),
  tarballArg: /[\w.-]+\.tgz/g,
  onlineSpec: new RegExp(`([\\w.-]+)@${literal(VERSION)}`, 'g'),
  /** B6: earlier Fishball packages and the old data folder, removed before installing. */
  earlier: Object.freeze({
    names: Object.freeze(['dsh-fishball', 'fishball-connector', 'fishball-instance', 'fishball-embed-ui', 'dsh-fishball-*', '<DSH_HOME>/fishball/'].map(standalone)),
    verb: /\bremove\b/i,
  }),
  /** B6: pnpm's "missing peer" warning about DSH's own packages is expected (one paragraph says all three). */
  missingPeer: Object.freeze([/missing peer/i, /@deepseek-ai\//, /\bexpected\b/i]),
  /** The paragraph on installing from the release folder with no network, and its instruction to keep the folder. */
  offlineParagraph: Object.freeze([new RegExp(literal(RELEASE.store + '/')), /no network/i]),
  keepFolder: /\bkeep\b[^.]*\bfolder\b/i,
  /** …and that a later --offline add on that profile needs the folder's cache and the registry (both flags as the rows pass them). */
  laterNeeds: Object.freeze([/\blater\b[^.]*--offline/i, new RegExp(literal(`--cache-dir="$PWD/${RELEASE.cache}"`)), new RegExp(literal(cacheArgs('')[1]))]),
  /** B6: standalone's token-field path beside Connect, in the section of the standalone offline block. */
  tokenPath: Object.freeze([/New token/, /connector settings/, /Token for connecting a DSH/, /fishball-core/, /\bTarget\b/, /\bConnect\b/]),
  standaloneKey: 'standalone',
})

/**
 * E-FIX-2: each tarball's own top-level README.md and its manifest description. B3: the README names
 * no `ask_agent` and does not say the packages are not published. B4: README and description carry no
 * stale version note and no internal id (`R-XXX-NN`, `Q-XN`, `PLAT-XXX-NN`, `W<digit>`, `K<digit>`).
 * The connector's mcp-schema/README.md and tools/README.md are maintainers' notes, out of scope.
 */
export const DOC_TEXT = Object.freeze({
  readme: 'README.md',
  descriptionField: 'description',
  /** B3, README only. */
  b3: Object.freeze([/ask_agent/, /\bnot\s+(?:\w+\s+){0,2}published\b/i, /\bunpublished\b/i]),
  /** B4, README and description. */
  b4: Object.freeze([/0\.1\.0-alpha\.0/, /manifest still reads/i, /\bskeleton\b/i, /\bW\d+\b/, /\bK\d+\b/,
    /\bR-[A-Z]+-\d+\b/, /\bQ-[A-Z]\d+\b/, /\bPLAT-[A-Z]+-\d+\b/]),
  /** Oracle self-check (EP: each banned form; BVA: 0..2 words between "not" and "published", ids glued to letters). */
  samples: Object.freeze({
    b3: Object.freeze({
      hit: Object.freeze(['use ask_agent', 'not published', 'not yet published', 'has not yet been published', 'unpublished packages', 'Not Published']),
      clean: Object.freeze(['published on npm', 'once the packages are published', 'publishing', 'ask the agent', 'not a plugin; published', 'not one of the three that are published']),
    }),
    b4: Object.freeze({
      hit: Object.freeze(['0.1.0-alpha.0', 'the manifest still reads', 'W0 skeleton', 'Skeleton', 'W4', 'K2', 'R-ARCH-04', 'R-FB-12', 'R-BRD-01',
        'PLAT-BVA-01', 'Q-G2', '(R-COMPAT-01)']),
      clean: Object.freeze(['1.0.0-alpha.1', 'W3C', 'K8s', 'Windows', 'KW', 'R-1', 'R-ARCH', 'Q-G', 'PLAT-01', 'MCP over OAuth', 'skeletons', 'w0']),
    }),
  }),
})

/**
 * Isolation of every child process: no user npm config, a temp HOME and npm cache, and a dead proxy
 * so any network attempt fails (lead, 2026-11-17). The environment is built from scratch (harness).
 */
export const ISOLATION = Object.freeze({
  path: '/opt/homebrew/bin:/usr/bin:/bin',
  userconfig: '/dev/null',
  /** npm refuses one file as both user and global config, so the global one is an empty file of the scratch folder. */
  globalconfigFile: 'globalrc',
  deadProxy: 'http://127.0.0.1:9',
  /** E-FIX-2: the counting proxy (an ephemeral loopback port; it answers nothing, like the dead one). */
  proxyScheme: 'http://',
  proxyHost: '127.0.0.1',
  proxyVars: Object.freeze(['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'npm_config_https_proxy', 'npm_config_proxy']),
  homeDir: 'home',
  npmCacheDir: 'npm-cache',
  dshHomeDir: 'dsh-home',
  emptyStoreDir: 'empty-store',
  emptyCacheDir: 'empty-cache',
  copyDir: 'release-copy',
})

/** Requirement 7 runs npm itself (looked up on ISOLATION.path). */
export const NPM_TOOL = '/opt/homebrew/bin/npm'

/** Harness budgets (waiting only). */
export const BUDGET = Object.freeze({ installMs: 300000, installCaseMs: 600000, checkMs: 300000, checkCaseMs: 1800000, docCaseMs: 1200000, dryRunMs: 120000, maxOutputBytes: 64 * 1024 * 1024 })
/** How much of a failed child's output a failure message shows (harness). */
export const REPORT = Object.freeze({ tailChars: 4000 })
export const TEMP = Object.freeze({ prefix: 'fbtest-rel-pack-' })
export const TAR_TOOL = Object.freeze({ file: '/usr/bin/tar', list: '-tzf' })

/** Case ids (one family per technique). */
export const CASE = Object.freeze({
  layout: 'REL-EP-01', sums: 'REL-EP-02', extras: 'REL-EP-03', oracle: 'REL-ORACLE',
  manifest: 'REL-EP-04', engines: 'REL-DT-01', peers: 'REL-DT-02', links: 'REL-EP-05', bundling: 'REL-DT-03',
  closure: 'REL-EP-06', instance: 'REL-EP-07', junk: 'REL-EP-08', dryRun: 'REL-EP-09',
  check: 'REL-ST-01', hosted: 'REL-SYS-01', standalone: 'REL-SYS-02', alone: 'REL-SYS-03', emptyStore: 'REL-DT-04',
  // E-FIX-2: INSTALL.md's offline blocks (set × profile state; the fresh profile's transitions), its text, the READMEs.
  docUsed: 'REL-DT-05', docFresh: 'REL-ST-02', docOrder: 'REL-EP-10', docBefore: 'REL-EP-11', readme: 'REL-EP-12', description: 'REL-EP-13',
  // SHELVE-BOARD: the shelved board is nowhere in the release (counts, docs, --check on an extra board tarball).
  shelved: 'REL-SHELVE',
})
