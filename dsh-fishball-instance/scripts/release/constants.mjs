import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = fileURLToPath(new URL('../../', import.meta.url))
export const VERSION = '1.0.0-alpha.1'
export const DIST_TAG = 'alpha'
export const REGISTRY = 'https://registry.npmjs.org'
export const RELEASE_DIR = path.join(REPO, '.runtime', 'release', VERSION)

export const PACKAGES = Object.freeze([
  Object.freeze({ key: 'instance', folder: 'packages/dsh-instance' }),
])

export const HOSTED_SET = Object.freeze(['fishball-amenities', 'fishball-core'])
export const SET_CARRIER = Object.freeze({ key: 'instance', folder: 'bundled' })

export const INSTALL_SETS = Object.freeze({
  instance: Object.freeze(['instance']),
})

export const PROFILE = 'web'
export const SDKS = Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1'])

export const LAYOUT = Object.freeze({
  sums: 'SHA256SUMS',
  install: 'INSTALL.md',
  publish: 'PUBLISH.md',
  store: 'pnpm-store',
  cache: 'pnpm-cache',
  tarball: (name, version) => name + '-' + version + '.tgz',
  sumLine: (digest, name) => digest + '  ' + name,
  sumPattern: /^([0-9a-f]{64}) {2}(\S+)$/,
  tarballSuffix: '.tgz',
  offlineStore: 'offline-store.mjs',
  packageRoot: 'package',
  tar: 'tar',
  linkEntry: /^[lh]/,
})

export const OFFLINE = Object.freeze({
  storeVariable: 'FISHBALL_INSTANCE_STORE',
  modulesQuery: 'root --silent',
  storeQuery: 'store path --silent',
})

export const JUNK = Object.freeze({
  directories: Object.freeze(['test', 'tests', '__tests__', 'spikes', '.runtime', 'coverage', '.bin']),
  names: Object.freeze(['.DS_Store', '.env', '.npmrc', 'pnpm-lock.yaml', 'package-lock.json']),
  patterns: Object.freeze([/\.test\.[^/]+$/, /\.log$/, /\.sqlite/, /\.db$/, /^\.env\./]),
})

export const MANIFEST = Object.freeze({
  engines: Object.freeze({ node: '>=22.14', dsh: '>=0.2.1-rc.5' }),
  repository: Object.freeze({ type: 'git', url: 'git+https://github.com/Arrosam/dsh-fishball-instance.git' }),
  license: 'MIT',
  bundled: 'bundleDependencies',
  peersOnly: Object.freeze({ zod: '*' }),
})

export const COMMAND = Object.freeze({
  npm: 'npm',
  pnpm: 'pnpm',
  ignoreScripts: '--ignore-scripts',
  registry: '--registry=' + REGISTRY,
  offline: '--offline',
  noLockfile: '--config.lockfile=false',
  userconfig: '/dev/null',
})

export const ISOLATION = Object.freeze({
  npmSetting: /^npm_config_/i,
  home: 'home',
  globalconfig: 'npmrc-global',
  npmCache: 'npm-cache',
  xdg: Object.freeze(['config', 'data', 'cache', 'state']),
  xdgVariable: (name) => 'XDG_' + name.toUpperCase() + '_HOME',
  maxOutputBytes: 256 * 1024 * 1024,
})

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
  workspaceText: 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n',
})

export const CLI = Object.freeze({
  check: 'check',
  out: 'out',
  fishballRelease: 'fishball-release',
  usage: 'Usage: node scripts/pack.mjs [--out <dir>] [--fishball-release <dir>]\n       node scripts/pack.mjs --check [--out <dir>]\n',
  refuseOut: (out) => 'refusing to replace ' + out + ': not empty and not a release folder (no SHA256SUMS)\n',
  exit: Object.freeze({ ok: 0, failed: 1, usage: 2 }),
})
