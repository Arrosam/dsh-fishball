/**
 * The packed release, built by this package's own tests: `node scripts/pack.mjs --out <scratch>
 * --fishball-release <dir>` with the Fishball release folder of the sibling dsh-fishball checkout
 * (.runtime/release/<version>, read only). One build per test file (the cases of a file run in
 * order). A tarball is read with the system tar, never with a product module.
 *
 * Isolation: every child process gets an environment built from scratch (no user npm config, a
 * scratch HOME and npm cache, every proxy pointing at a dead port), so a network attempt fails.
 */
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from '@dsh-instance/test-helpers/constants'
import { siblingRepo } from '@dsh-instance/test-helpers/siblings'

const INSTANCE_MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO, 'packages', 'dsh-instance', 'package.json'), 'utf8'))
export const VERSION = INSTANCE_MANIFEST.version
export const INSTANCE = Object.freeze({ name: INSTANCE_MANIFEST.name, tarball: INSTANCE_MANIFEST.name + '-' + VERSION + '.tgz', folder: 'packages/dsh-instance' })
/** The hosted set a packed instance carries in bundled/ (README "Placement"; 8fdd0ef: fishball-core only). */
export const SET = Object.freeze([Object.freeze({ name: 'fishball-core', tarball: 'fishball-core-' + VERSION + '.tgz' })])
export const RETIRED = Object.freeze(['fishball-ui', 'fishball-board'])

export const PACK = Object.freeze({
  script: path.join(REPO, 'scripts', 'pack.mjs'),
  okExit: 0,
  sums: 'SHA256SUMS',
  docs: Object.freeze(['INSTALL.md', 'PUBLISH.md']),
  helper: 'offline-store.mjs',
  dirs: Object.freeze(['pnpm-store', 'pnpm-cache']),
  sumLine: /^([0-9a-f]{64}) {2}(\S+)$/,
  bundled: 'bundled/',
  prefix: 'package/',
  /** Whatever the pack stages beside npm's own file list: the bundled set tarballs. */
  staged: /^bundled\/[^/]+\.tgz$/,
  /** Requirement 6 of REL-PACK: no test or runtime junk. */
  junkDirs: Object.freeze(['test', 'tests', '__tests__', 'spikes', '.runtime', 'coverage']),
  junkNames: Object.freeze([/\.test\./, /\.log$/, /^\.DS_Store$/, /^\.env$/, /\.sqlite/, /\.db$/, /^\.npmrc$/, /^pnpm-lock\.yaml$/, /^package-lock\.json$/]),
  flipMask: 0xff,
  offsets: Object.freeze({ first: () => 0, middle: (size) => Math.floor(size / 2), last: (size) => size - 1 }),
  stray: 'fbtest-stray-' + VERSION + '.tgz',
})
export const DEAD = 'http://127.0.0.1:9'
export const PROXIES = Object.freeze(['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'npm_config_https_proxy', 'npm_config_proxy'])

/** The sibling's Fishball release folder for this version, or undefined. */
export function fishballRelease() {
  const repo = siblingRepo('fishball')
  const dir = repo && path.join(repo, '.runtime', 'release', VERSION)
  return dir && SET.every((p) => fs.existsSync(path.join(dir, p.tarball))) ? dir : undefined
}
/** A node:test skip reason when the Fishball release folder is missing, else false. */
export function missingRelease() {
  if (!siblingRepo('fishball')) return 'the dsh-fishball checkout is absent (set FISHBALL_REPO)'
  return fishballRelease() ? false : `the Fishball release folder dsh-fishball/.runtime/release/${VERSION} with ${SET.map((p) => p.tarball).join(', ')} is absent (pack dsh-fishball first)`
}

/** An environment from scratch under `scratch`: no user npm config, scratch HOME and cache, dead proxies. */
export function isolatedEnv(scratch, extra = {}) {
  const home = path.join(scratch, 'env-home')
  const globalconfig = path.join(scratch, 'env-npmrc-global')
  fs.mkdirSync(home, { recursive: true })
  fs.writeFileSync(globalconfig, '')
  const env = { PATH: process.env.PATH, HOME: home, TMPDIR: process.env.TMPDIR ?? '', npm_config_userconfig: '/dev/null', npm_config_globalconfig: globalconfig, npm_config_cache: path.join(scratch, 'env-npm-cache'), npm_config_registry: DEAD + '/', ...extra }
  for (const v of PROXIES) env[v] = DEAD
  return env
}

/** Run a program; resolves {code, stdout, output} (never rejects on a non-zero exit). */
export function run(file, args, { env, cwd }) {
  return new Promise((resolve) => {
    execFile(file, args, { env, cwd, maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : String(error.code ?? error.signal)) : 0, stdout, output: stdout + '\n' + stderr })
    })
  })
}
export const tail = (t) => String(t).slice(-3000)

/** `node scripts/pack.mjs <args>` in an isolated environment. */
export const packScript = (scratch, args) => run(process.execPath, [PACK.script, ...args], { env: isolatedEnv(scratch), cwd: REPO })
export const check = (scratch, out) => packScript(scratch, ['--check', '--out', out])

/** Build the release into `<scratch>/release`; resolves {out, result}. */
export async function build(scratch) {
  const out = path.join(scratch, 'release')
  const result = await packScript(scratch, ['--out', out, '--fishball-release', fishballRelease()])
  return { out, result }
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** The entries of a tarball as `tar -tvzf` lists them: [{type, path}] (type is the mode's first character). */
export function listing(file) {
  return execFileSync('tar', ['-tvzf', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).split('\n').filter(Boolean).map((line) => {
    const parts = line.trim().split(/\s+/)
    const at = parts.findIndex((p, i) => i >= 8 && p.startsWith(PACK.prefix))
    return { type: line[0], path: parts.slice(at >= 0 ? at : 8).join(' ').replace(/ -> .*$/, '') }
  })
}
/** The package-relative paths of a tarball's regular files. */
export const filesOf = (file) => listing(file).filter((e) => e.type === '-').map((e) => e.path.slice(PACK.prefix.length))
/** One member of a tarball as bytes. */
export const memberOf = (file, rel) => execFileSync('tar', ['-xOzf', file, PACK.prefix + rel], { maxBuffer: 256 * 1024 * 1024 })
/** Unpack a tarball into `dir` (its package/ folder lands at `dir/package`). */
export function unpack(file, dir) {
  fs.mkdirSync(dir, { recursive: true })
  execFileSync('tar', ['-xzf', file, '-C', dir])
  return path.join(dir, 'package')
}
/** XOR one byte of `file` at `offset`, in place. */
export function flipByte(file, offset) {
  const bytes = fs.readFileSync(file)
  bytes[offset] ^= PACK.flipMask
  fs.writeFileSync(file, bytes)
}
export const isJunk = (rel) => {
  const parts = rel.split('/')
  const name = parts.pop()
  return parts.some((s) => PACK.junkDirs.includes(s)) || PACK.junkNames.some((re) => re.test(name))
}
