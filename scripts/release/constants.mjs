/**
 * REL-PACK's fixed values (task REL-PACK, the user's brief of 2026-11-17 and its clarifications).
 * Each value is defined here once; scripts/pack-v3.mjs and scripts/release/*.mjs read them.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root (this file is scripts/release/constants.mjs). */
export const REPO = fileURLToPath(new URL('../../', import.meta.url))

/** The one release version every package carries (requirements Q-G10; the user, REL-PACK item 1). */
export const VERSION = '1.0.0-alpha.1'

/** The npm dist-tag every publish uses (the user, 2026-11-17: "the publish tag `alpha`"). */
export const DIST_TAG = 'alpha'

/** The registry every registry-touching command names (the user's environment rule). */
export const REGISTRY = 'https://registry.npmjs.org'

/** Where a pack writes, under the repo: `.runtime/release/<version>/` (REL-PACK item 6). */
export const RELEASE_DIR = path.join(REPO, '.runtime', 'release', VERSION)

/**
 * The eight packages, by key, in publish order: every package after the ones it depends on, so a
 * registry install of any of them never names an unpublished version. A library is a bundled
 * dependency, but publishing it first also keeps it installable on its own. `library` marks the two
 * libraries, which are not DSH plugins (R-ARCH-08: no `dsh` field) and carry no engines.dsh.
 * fishball-board (packages/board) is not one of them: it is shelved, not in this release (SHELVE-BOARD,
 * the user, 2026-11-18). Its folder stays in the repo unchanged; add it back here for its release.
 */
export const PACKAGES = Object.freeze([
  Object.freeze({ key: 'dshShared', folder: 'packages/dsh-connector-shared', library: true }),
  Object.freeze({ key: 'fishballShared', folder: 'packages/shared', library: true }),
  Object.freeze({ key: 'connector', folder: 'packages/dsh-connector' }),
  Object.freeze({ key: 'instance', folder: 'packages/dsh-instance' }),
  Object.freeze({ key: 'connectorUi', folder: 'packages/dsh-connector-ui' }),
  Object.freeze({ key: 'adapter', folder: 'packages/dsh-connector-adapter' }),
  Object.freeze({ key: 'ui', folder: 'packages/fishball-ui' }),
  Object.freeze({ key: 'core', folder: 'packages/core' }),
])

/**
 * The hosted child's set, which dsh-instance carries as tarballs in `bundled/` (REL-PACK item 5;
 * the instance's placement reads them, src/native-runtime/placement.js). Keys of PACKAGES.
 */
export const HOSTED_SET = Object.freeze(['ui', 'core'])

/** Which package carries the hosted set, and the folder it goes in (dsh-instance PLACEMENT.packed). */
export const SET_CARRIER = Object.freeze({ key: 'instance', folder: 'bundled' })

/**
 * The install procedure's two sets (REL-PACK item 7). Hosted: the main DSH gets the connector,
 * its UI and the instance. Standalone: a Fishball DSH gets the fishball-* plugins in the order the
 * instance installs them (fishball-ui, then fishball-core last); the connector it pairs
 * with runs in another DSH. The adapter goes into a DSH that uses another DSH's connector.
 */
export const INSTALL_SETS = Object.freeze({
  hosted: Object.freeze(['connector', 'connectorUi', 'instance']),
  // Standalone's managed DSH: the hosted set without the instance.
  managed: Object.freeze(['connector', 'connectorUi']),
  standalone: Object.freeze(['ui', 'core']),
  adapter: Object.freeze(['adapter']),
})

/** The profile the documents and checks use, DSH's own Web template (dsh-app-boot PROFILE_TEMPLATES.web). */
export const PROFILE = 'web'

/** The two DSH runtimes this release supports (the user: "Must work on DSH 0.2.1-rc.5 and 0.2.2-rc.1"). */
export const SDKS = Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1'])

/** Release folder layout (the black-box suite test/v3/release/pack pins the same names). */
export const LAYOUT = Object.freeze({
  sums: 'SHA256SUMS',
  install: 'INSTALL.md',
  publish: 'PUBLISH.md',
  store: 'pnpm-store',
  cache: 'pnpm-cache',
  tarball: (name, version) => name + '-' + version + '.tgz',
  // `<sha256 hex>  <file name>`, as `shasum -a 256` writes and `shasum -c` reads.
  sumLine: (digest, name) => digest + '  ' + name,
  sumPattern: /^([0-9a-f]{64}) {2}(\S+)$/,
  tarballSuffix: '.tgz',
  // The helper INSTALL.md's offline install runs (scripts/release/offline-store.mjs, copied as is).
  offlineStore: 'offline-store.mjs',
  // npm pack puts every file under `package/`; `tar -tv` marks a symlink `l`, a hard link `h`.
  packageRoot: 'package',
  tar: 'tar',
  linkEntry: /^[lh]/,
})

/**
 * INSTALL.md's offline install (e2e B2). pnpm refuses a `--store-dir` other than the store a
 * profile's node_modules is linked to, so the release's store is copied into the profile's own
 * store first (offline-store.mjs) and that store is named. These are the shell spellings the
 * document's commands use; `storeVariable` holds the helper's answer between the two lines.
 */
export const OFFLINE = Object.freeze({
  storeVariable: 'FISHBALL_STORE',
  // DSH's own pnpm pass-through answers for the profile: its node_modules, and pnpm's store for it.
  // `--silent`: inside `$(…)` stdout is no TTY, so pnpm would print its notices there, before the path.
  modulesQuery: 'root --silent',
  storeQuery: 'store path --silent',
})

/**
 * What a staged package may not ship (the user: "files (no tests or runtime junk)"). Applied to
 * every staged file, the bundled third-party closure included (zod ships its own tests), so a
 * tarball holds runtime code, manifests and licences only.
 */
export const JUNK = Object.freeze({
  // .bin holds links to bundled packages' executables; nothing in a plugin runs them.
  directories: Object.freeze(['test', 'tests', '__tests__', 'spikes', '.runtime', 'coverage', '.bin']),
  names: Object.freeze(['.DS_Store', '.env', '.npmrc', 'pnpm-lock.yaml', 'package-lock.json']),
  patterns: Object.freeze([/\.test\.[^/]+$/, /\.log$/, /\.sqlite/, /\.db$/, /^\.env\./]),
})

/** The manifest fields REL-PACK sets in every package (REL-PACK item 1; the user's 2026-11-17 list). */
export const MANIFEST = Object.freeze({
  engines: Object.freeze({ node: '>=22.14', dsh: '>=0.2.1-rc.5' }),
  repository: Object.freeze({ type: 'git', url: 'git+https://github.com/Arrosam/dsh-fishball.git' }),
  license: 'MIT',
  bundled: 'bundleDependencies',
  // A dependency every importer must take from the host DSH, never bundle (REL-PACK item 1).
  peersOnly: Object.freeze({ zod: '*' }),
})

/** The commands the pack runs. Every npm/pnpm call names the registry and ignores scripts. */
export const COMMAND = Object.freeze({
  npm: 'npm',
  pnpm: 'pnpm',
  ignoreScripts: '--ignore-scripts',
  registry: '--registry=' + REGISTRY,
  offline: '--offline',
  // No lockfile is written or committed (the user's REL-PACK rule).
  noLockfile: '--config.lockfile=false',
  // npm 11 refuses /dev/null as the global config too, so the pack writes an empty one (see isolate).
  userconfig: '/dev/null',
})

/** How a pack isolates npm and pnpm from the user's configuration (tools.mjs isolate). */
export const ISOLATION = Object.freeze({
  // Every npm or pnpm setting the shell exports, in either case (NPM_CONFIG_USERCONFIG included).
  npmSetting: /^npm_config_/i,
  home: 'home',
  globalconfig: 'npmrc-global',
  npmCache: 'npm-cache',
  // pnpm also reads $XDG_CONFIG_HOME/pnpm/rc and keeps state under the other two.
  xdg: Object.freeze(['config', 'data', 'cache', 'state']),
  xdgVariable: (name) => 'XDG_' + name.toUpperCase() + '_HOME',
  // npm pack --json of fishball-core lists ~1000 files; this bounds a run's captured stdout.
  maxOutputBytes: 256 * 1024 * 1024,
})

/** The pack's scratch folder layout and the closure project it installs third-party packages in. */
export const SCRATCH = Object.freeze({
  prefix: 'rel-pack-',
  stage: 'stage',
  closure: 'closure',
  storeProject: 'store',
  projectName: 'rel-pack-closure',
  modules: 'node_modules',
  manifest: 'package.json',
  workspace: 'pnpm-workspace.yaml',
  hidden: '.',
  scope: '@',
  /**
   * pnpm settings for the closure project: the text dsh-app-boot initProfile writes into every DSH
   * profile (PROFILE_PNPM_WORKSPACE, identical in 0.2.1-rc.5 and 0.2.2-rc.1), so the closure
   * resolves and lays out as a profile install does. A copy, because the pack runs from a checkout
   * with no DSH installed; revisit if DSH changes that text.
   */
  workspaceText: 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n',
})


/** The pack script's command line. */
export const CLI = Object.freeze({
  check: 'check',
  out: 'out',
  usage: 'Usage: node scripts/pack-v3.mjs [--out <dir>]\n       node scripts/pack-v3.mjs --check [--out <dir>]\n',
  // A pack replaces --out only when it is empty, missing or an earlier release (it holds SHA256SUMS).
  refuseOut: (out) => 'refusing to replace ' + out + ': not empty and not a release folder (no SHA256SUMS)\n',
  exit: Object.freeze({ ok: 0, failed: 1, usage: 2 }),
})
