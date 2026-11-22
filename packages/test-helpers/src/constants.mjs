/**
 * Values the helpers share. Paths default to this machine's DSH install; FBTEST_DSH_VERSIONS moves
 * the folder holding the installed SDK versions.
 */
import os from 'node:os'
import path from 'node:path'

/** The repository this helpers package sits in (packages/test-helpers/src → the root). */
export const REPO = path.resolve(import.meta.dirname, '..', '..', '..')

/** The installed DSH SDKs every unit case runs on (the instance's engines.dsh floor and the next release). */
export const SDK = Object.freeze({
  versionsDir: process.env.FBTEST_DSH_VERSIONS ?? path.join(os.homedir(), 'Library', 'Application Support', 'DSH', 'data', 'versions'),
  versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  nodeModules: 'node_modules',
  entry: path.join('lib', 'index.js'),
  packageFile: 'package.json',
  /** Only DSH's own packages are taken from the selected SDK. */
  scope: '@deepseek-ai/',
  /** Query tag that binds one module graph to one installed SDK version. */
  versionTag: 'fbsdk',
  cordisEntry: path.join('@deepseek-ai', 'cordis', 'lib', 'index.js'),
  frontendAssets: path.join('@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets'),
})

/** The React stand-in's runaway guard. */
export const SHIM = Object.freeze({ renderGuard: 200 })

/** What a scripted DSH page offers a classic client script. */
export const PAGE = Object.freeze({
  platform: Object.freeze({ react: 'react', reactDom: 'react-dom', reactDomClient: 'react-dom/client', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  settleRounds: 60,
  /** How often `until` re-checks its condition (never a deadline). */
  pollMs: 15,
})

/** Scratch folders: prefix of every temp root a helper makes. */
export const SCRATCH = Object.freeze({ prefix: 'dshi-test-' })

/** Package test layout and the runner's isolated environment. */
export const RUN = Object.freeze({
  testsDir: 'tests',
  suffix: '.test.mjs',
  fileConcurrency: 3,
  prefix: 'dshi-run-',
  signals: Object.freeze(['SIGINT', 'SIGTERM']),
  cancelExit: 130,
  dirs: Object.freeze({ home: 'home', tmp: 'tmp', cache: 'cache', config: 'config', data: 'data', state: 'state', homes: path.join('.runtime', 'test-homes') }),
  noUserConfig: '/dev/null',
  /** The name the runner links this package under in the root node_modules (what a workspace install would link). */
  helpersName: '@dsh-instance/test-helpers',
})
