/**
 * Observation layer of the release rows: the release folder, its tarballs read entry by entry (gzip +
 * ustar/pax, so an entry's type and bytes are seen exactly as packed; `tar -tzf` cross-checks the
 * parser, REL-ORACLE), isolated child processes (DSH's CLI, npm, the pack script's checker) and
 * throwaway folders. Black box: no product module and no pack-script code is loaded. Ported from the
 * old test/v3/release/pack/release.mjs (its instance and hosted-child parts are gone with dsh-instance).
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { DSH_RUNTIME } from 'fishball-test-helpers/dsh'
import { BUDGET, DSH, INSTALL_DOC, ISOLATION, JUNK, MANIFEST, PACK, RELEASE, VERSION, tarballName } from '../constants.mjs'

const TAR = Object.freeze({
  block: 512, name: [0, 100], size: [124, 136], type: 156, linkname: [157, 257], magic: [257, 263], prefix: [345, 500],
  magicPrefix: 'ustar', octal: 8, base256Flag: 0x80,
  regular: Object.freeze(['0', '7']), hardLink: '1', symlink: '2', directory: '5',
  paxLocal: 'x', paxGlobal: 'g', gnuLongName: 'L', gnuLongLink: 'K', paxPath: 'path', paxLinkpath: 'linkpath',
})
const NUL_TAIL = /\0.*$/s
const PAX_RECORD = /^(\d+) /
const field = (header, [from, to]) => header.subarray(from, to).toString('utf8').replace(NUL_TAIL, '')
function parsePax(body) {
  const out = {}
  for (let at = 0; at < body.length;) {
    const head = PAX_RECORD.exec(body.subarray(at, at + 32).toString('utf8'))
    if (head === null) break
    const record = body.subarray(at + head[0].length, at + Number(head[1]) - 1).toString('utf8')
    const eq = record.indexOf('=')
    out[record.slice(0, eq)] = record.slice(eq + 1)
    at += Number(head[1])
  }
  return out
}
/** Every entry of a .tgz: { path, type, linkname, data } in archive order. */
export function parseTarball(file) {
  const buf = gunzipSync(fs.readFileSync(file))
  const entries = []
  let pax = {}
  let longName
  let longLink
  for (let at = 0; at + TAR.block <= buf.length;) {
    const header = buf.subarray(at, at + TAR.block)
    if (header.every((b) => b === 0)) break
    if (header[TAR.size[0]] & TAR.base256Flag) throw new Error(file + ': base-256 size field is not supported by this parser')
    const size = parseInt(field(header, TAR.size).trim() || '0', TAR.octal)
    const type = header[TAR.type] === 0 ? TAR.regular[0] : String.fromCharCode(header[TAR.type])
    const data = buf.subarray(at + TAR.block, at + TAR.block + size)
    at += TAR.block + Math.ceil(size / TAR.block) * TAR.block
    if (type === TAR.paxLocal) { pax = parsePax(data); continue }
    if (type === TAR.paxGlobal) continue
    if (type === TAR.gnuLongName) { longName = data.toString('utf8').replace(NUL_TAIL, ''); continue }
    if (type === TAR.gnuLongLink) { longLink = data.toString('utf8').replace(NUL_TAIL, ''); continue }
    const prefix = field(header, TAR.magic).startsWith(TAR.magicPrefix) ? field(header, TAR.prefix) : ''
    entries.push({ path: pax[TAR.paxPath] ?? longName ?? (prefix ? prefix + '/' : '') + field(header, TAR.name), type, linkname: pax[TAR.paxLinkpath] ?? longLink ?? field(header, TAR.linkname), data })
    pax = {}
    longName = undefined
    longLink = undefined
  }
  return entries
}
export const isRegular = (e) => TAR.regular.includes(e.type)
export const isDirectory = (e) => e.type === TAR.directory
export const isLink = (e) => e.type === TAR.symlink || e.type === TAR.hardLink
export const describeEntry = (e) => `${e.path} (type ${e.type}${e.linkname ? ' -> ' + e.linkname : ''})`
export const show = (v) => JSON.stringify(v)
export const tail = (output) => String(output).slice(-BUDGET.tailChars)
export const json = (entry) => JSON.parse(entry.data.toString('utf8'))
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// ---- the release folder (the old release-check gate: absent → skip with the reason; FBTEST_RELEASE_REQUIRED=1 → fail)

const missing = (what) => what + ' is missing: ' + RELEASE.skipReason
export function releaseDir() {
  assert.ok(fs.existsSync(RELEASE.dir) && fs.statSync(RELEASE.dir).isDirectory(), missing('the release folder ' + RELEASE.dir))
  return RELEASE.dir
}
/** A row that needs an existing release folder: skipped with that reason when it is absent (unless required). */
export function releaseTest(name, options, fn) {
  test(name, options, (t) => {
    if (process.env[RELEASE.requiredEnv] !== RELEASE.requiredOn) {
      try { fs.lstatSync(RELEASE.dir) } catch (error) {
        if (error.code !== 'ENOENT') throw error
        t.skip(RELEASE.skipReason)
        return
      }
    }
    releaseDir()
    return fn(t)
  })
}
export function tarballPath(name, dir = releaseDir()) {
  const file = path.join(dir, tarballName(name))
  assert.ok(fs.existsSync(file), missing(tarballName(name)))
  return file
}
const tarballs = new Map()
/** One package's release tarball, parsed once: { file, entries, files: Map<rel, entry>, manifest }. */
export function tarball(name) {
  const file = tarballPath(name)
  if (!tarballs.has(file)) {
    const entries = parseTarball(file)
    const files = new Map(entries.map((e) => [e.path.startsWith(PACK.prefix) ? e.path.slice(PACK.prefix.length) : e.path, e]))
    const manifest = files.get(PACK.manifest)
    tarballs.set(file, { file, entries, files, manifest: manifest === undefined ? null : json(manifest) })
  }
  return tarballs.get(file)
}

// ---- rules

/** Requirement 6: a path is junk when a directory segment or its file name is a banned one. */
export function isJunk(rel) {
  const parts = rel.split('/')
  const name = parts.pop()
  return parts.some((s) => JUNK.dirSegments.includes(s)) || JUNK.fileNames.some((re) => re.test(name))
}
export const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null)
/** A module the current DSH ships in its own node_modules (semver, yaml). */
export const dshModule = (name) => createRequire(path.join(DSH_RUNTIME, PACK.manifest))(name)
/** Node's package lookup inside a tree: `<dir>/node_modules/<name>/package.json` from `fromDir` up, never leaving `stopAt`. */
export function resolveIn(has, fromDir, name, stopAt) {
  for (let dir = path.posix.normalize(fromDir || '.'); ; dir = path.posix.dirname(dir)) {
    if (path.posix.basename(dir) !== PACK.nodeModules) {
      const candidate = path.posix.join(dir, PACK.nodeModules, name, PACK.manifest)
      if (has(candidate)) return candidate
    }
    if (dir === stopAt || path.posix.dirname(dir) === dir) return null
  }
}

// ---- isolated processes and throwaway folders

/** Run a program; resolves { code, stdout, output } (never rejects on a non-zero exit). */
export function runTool(file, args, { env, cwd, timeoutMs = BUDGET.toolMs }) {
  return new Promise((resolve) => {
    execFile(file, args, { env, cwd, timeout: timeoutMs, maxBuffer: BUDGET.maxOutputBytes }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : error.signal ?? String(error.code)) : 0
      resolve({ code, stdout, output: `${stdout}\n${stderr}` })
    })
  })
}
export const tarListing = (file) => runTool(ISOLATION.tar, [ISOLATION.tarList, file], { env: { PATH: ISOLATION.path } })
/** A child environment built from scratch: no user npm config, a scratch HOME and cache, a dead (or counting) proxy. */
export function isolatedEnv(scratch, extra = {}, proxy = ISOLATION.deadProxy) {
  const home = path.join(scratch, ISOLATION.homeDir)
  const cache = path.join(scratch, ISOLATION.npmCacheDir)
  const globalconfig = path.join(scratch, ISOLATION.globalconfigFile)
  for (const d of [home, cache]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(globalconfig, '')
  const env = { PATH: ISOLATION.path, HOME: home, TMPDIR: os.tmpdir(), npm_config_userconfig: ISOLATION.userconfig, npm_config_globalconfig: globalconfig, npm_config_cache: cache, ...extra }
  for (const v of ISOLATION.proxyVars) env[v] = proxy
  return env
}
export async function withScratch(fn) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), ISOLATION.tempPrefix)))
  try { return await fn(dir) } finally {
    // Guard the one recursive delete: only a folder this call made directly under the temp dir.
    if (path.dirname(dir) === fs.realpathSync(os.tmpdir()) && path.basename(dir).startsWith(ISOLATION.tempPrefix)) fs.rmSync(dir, { recursive: true, force: true })
  }
}
export function copyRelease(scratch) {
  const copy = path.join(scratch, ISOLATION.copyDir)
  fs.cpSync(releaseDir(), copy, { recursive: true, verbatimSymlinks: true })
  return copy
}
export function flipByte(file, offset, mask) {
  const fd = fs.openSync(file, 'r+')
  try { const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, offset); b[0] ^= mask; fs.writeSync(fd, b, 0, 1, offset) } finally { fs.closeSync(fd) }
}
/** `fn(proxyUrl, hits)` with a loopback proxy that records every connection and answers none. */
export async function withCountingProxy(fn) {
  const hits = []
  const server = net.createServer((socket) => { hits.push(socket.remoteAddress); socket.destroy() })
  await new Promise((resolve) => server.listen(0, ISOLATION.proxyHost, resolve))
  try { return await fn(ISOLATION.proxyScheme + ISOLATION.proxyHost + ':' + server.address().port, hits) } finally { await new Promise((resolve) => server.close(resolve)) }
}

// ---- DSH's CLI (offline installs)

/** The current DSH's real `dsh` CLI, asserted to exist (a missing CLI must never pass a "must fail" row). */
export function checkedCli() {
  const bin = path.join(DSH_RUNTIME, DSH.bin)
  assert.ok(fs.existsSync(bin), 'DSH CLI is missing at ' + bin)
  return bin
}
export const bundlesOf = (manifest) => DSH.bundlesPath.reduce((v, k) => v?.[k], manifest) ?? []
export const installedDir = (profileDir, name) => path.join(profileDir, PACK.nodeModules, name)
export const releaseStore = () => ({ store: path.join(releaseDir(), RELEASE.store), cache: path.join(releaseDir(), RELEASE.cache) })
/** `dsh plugin --profile web add <tarballs…>` offline into a fresh DSH_HOME under `scratch`. */
export async function dshAdd(scratch, files, { store, cache }) {
  const home = path.join(scratch, ISOLATION.dshHomeDir)
  const r = await runTool(checkedCli(), DSH.pluginArgs(DSH.profile, files, store, cache), { env: isolatedEnv(scratch, { DSH_HOME: home }), cwd: scratch, timeoutMs: BUDGET.installCaseMs })
  return { ...r, home, profileDir: DSH.profileDir(home, DSH.profile) }
}
/** What a profile lacks for `names`: a dependency, an installed copy at VERSION, and (when asked) a bundles entry. */
export function installProblems(profileDir, names, { bundles }) {
  const profile = readJson(path.join(profileDir, PACK.manifest))
  if (profile === null) return ['no profile package.json at ' + profileDir]
  const problems = []
  for (const name of names) {
    if (!Object.hasOwn(profile.dependencies ?? {}, name)) problems.push('profile dependencies lack ' + name)
    if (bundles && !bundlesOf(profile).includes(name)) problems.push(DSH.bundlesPath.join('.') + ' lacks ' + name)
    const v = readJson(path.join(installedDir(profileDir, name), PACK.manifest))?.version
    if (v !== VERSION) problems.push(`installed ${name} version ${show(v)}`)
  }
  return problems
}
export async function installAndCheck(scratch, names, { bundles }, where = releaseStore()) {
  const r = await dshAdd(scratch, names.map((n) => tarballPath(n)), where)
  assert.equal(r.code, DSH.okExit, tail(r.output))
  assert.deepEqual(installProblems(r.profileDir, names, { bundles }), [], tail(r.output))
  return r
}
/** `dep` resolves, by Node's lookup from the installed `owner`, to a copy inside the owner's own bundle at `dep.version`. */
export function assertFromOwnBundle(profileDir, owner, dep) {
  const from = installedDir(profileDir, owner)
  const found = resolveIn(fs.existsSync, from, dep.name, profileDir)
  assert.ok(found, dep.name + ' does not resolve from ' + from)
  assert.ok(found.startsWith(path.join(from, PACK.nodeModules) + path.sep), `${dep.name} resolves outside ${owner}'s bundle: ${found}`)
  assert.equal(readJson(found).version, dep.version)
}

// ---- INSTALL.md, read and run as written

export function docLines(doc, dir = releaseDir()) {
  const file = path.join(dir, doc)
  assert.ok(fs.existsSync(file), missing(doc))
  return fs.readFileSync(file, 'utf8').split(RELEASE.lineBreak)
}
export function fencedBlocks(lines) {
  const blocks = []
  let open = null
  lines.forEach((line, i) => {
    if (!INSTALL_DOC.fence.test(line)) return
    if (open === null) { open = i; return }
    blocks.push({ open, close: i, lines: lines.slice(open + 1, i) })
    open = null
  })
  return blocks
}
export const isAddLine = (line) => INSTALL_DOC.addLine.test(line)
const tarballsOf = (line) => line.match(INSTALL_DOC.tarballArg) ?? []
const specsOf = (line) => [...line.matchAll(INSTALL_DOC.onlineSpec)].map((m) => m[1])
/** The one fenced block whose add line's .tgz arguments are exactly `names`' tarballs, in order. */
export function offlineBlock(lines, names) {
  const want = show(names.map(tarballName))
  const found = fencedBlocks(lines).filter((b) => b.lines.some((l) => isAddLine(l) && show(tarballsOf(l)) === want))
  assert.equal(found.length, 1, `${RELEASE.install} has ${found.length} fenced blocks adding exactly ${want} (one expected)`)
  return found[0]
}
/** The first add line naming exactly `names` as `<name>@VERSION`, in order, with no tarball; -1 when none. */
export function onlineLineIndex(lines, names) {
  const want = show(names)
  return lines.findIndex((l) => isAddLine(l) && tarballsOf(l).length === 0 && show(specsOf(l)) === want)
}
/**
 * A DSH home under `scratch` for running INSTALL.md as a user would: `dsh` on PATH is the current DSH's
 * CLI, every network attempt goes to `proxy`.
 */
export function docProfile(scratch, proxy) {
  const bin = path.join(scratch, INSTALL_DOC.binDir)
  fs.mkdirSync(bin, { recursive: true })
  fs.symlinkSync(checkedCli(), path.join(bin, INSTALL_DOC.cliName))
  const home = path.join(scratch, ISOLATION.dshHomeDir)
  const profileDir = DSH.profileDir(home, DSH.profile)
  const env = isolatedEnv(scratch, { DSH_HOME: home, PATH: bin + path.delimiter + ISOLATION.path }, proxy)
  const run = (file, args, cwd = scratch) => runTool(file, args, { env, cwd, timeoutMs: BUDGET.installCaseMs })
  return {
    home, profileDir,
    cli: (args) => run(checkedCli(), args),
    runBlock: (block, cwd) => run(INSTALL_DOC.shell, [...INSTALL_DOC.shellArgs, block.lines.join(RELEASE.lineBreak)], cwd),
    storeDir: () => {
      const file = path.join(profileDir, ...INSTALL_DOC.modulesYaml)
      if (!fs.existsSync(file)) return undefined
      // pnpm 10 writes the file as JSON (a YAML subset); the yaml DSH ships reads both.
      return dshModule('yaml').parse(fs.readFileSync(file, 'utf8'))?.[INSTALL_DOC.storeDirKey]
    },
  }
}
export { MANIFEST }
