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
 * The nine packages, by key, in publish order: every package after the ones it depends on, so a
 * registry install of any of them never names an unpublished version. A library is a bundled
 * dependency, but publishing it first also keeps it installable on its own. `library` marks the two
 * libraries, which are not DSH plugins (R-ARCH-08: no `dsh` field) and carry no engines.dsh.
 */
export const PACKAGES = Object.freeze([
  Object.freeze({ key: 'dshShared', folder: 'packages/dsh-connector-shared', library: true }),
  Object.freeze({ key: 'fishballShared', folder: 'packages/shared', library: true }),
  Object.freeze({ key: 'connector', folder: 'packages/dsh-connector' }),
  Object.freeze({ key: 'instance', folder: 'packages/dsh-instance' }),
  Object.freeze({ key: 'connectorUi', folder: 'packages/dsh-connector-ui' }),
  Object.freeze({ key: 'adapter', folder: 'packages/dsh-connector-adapter' }),
  Object.freeze({ key: 'board', folder: 'packages/board' }),
  Object.freeze({ key: 'ui', folder: 'packages/fishball-ui' }),
  Object.freeze({ key: 'core', folder: 'packages/core' }),
])

/**
 * The hosted child's set, which dsh-instance carries as tarballs in `bundled/` (REL-PACK item 5;
 * the instance's placement reads them, src/native-runtime/placement.js). Keys of PACKAGES.
 */
export const HOSTED_SET = Object.freeze(['ui', 'board', 'core'])

/** Which package carries the hosted set, and the folder it goes in (dsh-instance PLACEMENT.packed). */
export const SET_CARRIER = Object.freeze({ key: 'instance', folder: 'bundled' })

/**
 * The install procedure's two sets (REL-PACK item 7). Hosted: the main DSH gets the connector,
 * its UI and the instance. Standalone: a Fishball DSH gets the fishball-* plugins in the order the
 * instance installs them (fishball-ui, fishball-board, fishball-core last); the connector it pairs
 * with runs in another DSH. The adapter goes into a DSH that uses another DSH's connector.
 */
export const INSTALL_SETS = Object.freeze({
  hosted: Object.freeze(['connector', 'connectorUi', 'instance']),
  standalone: Object.freeze(['ui', 'board', 'core']),
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
})

/**
 * What a staged package may not ship (the user: "files (no tests or runtime junk)"). Applied to
 * every staged file, the bundled third-party closure included (zod ships its own tests), so a
 * tarball holds runtime code, manifests and licences only.
 */
export const JUNK = Object.freeze({
  directories: Object.freeze(['test', 'tests', '__tests__', 'spikes', '.runtime', 'coverage']),
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
  // npm 11 refuses /dev/null as the global config too, so the pack writes an empty one (see isolate).
  userconfig: '/dev/null',
})

/** The pack script's command line. */
export const CLI = Object.freeze({
  check: '--check',
  out: '--out',
  usage: 'Usage: node scripts/pack-v3.mjs [--out <dir>]\n       node scripts/pack-v3.mjs --check [--out <dir>]\n',
  exit: Object.freeze({ ok: 0, failed: 1, usage: 2 }),
})
