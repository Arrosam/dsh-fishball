/**
 * Observation layer for the REL-PACK cases: the release folder, its tarballs read entry by entry,
 * isolated child processes (DSH CLI, npm, the pack script's checker) and throwaway folders.
 *
 * Black box: only the release output, the repo package folders' `npm pack` listings and the CLIs'
 * exit codes and written files are read; no product module and no pack-script code is loaded.
 * A tarball is parsed here (gzip + ustar/pax) so each entry's type (regular, symlink, hard link) and
 * bytes are seen exactly as packed; `tar -tzf` cross-checks the parser's listing (REL-ORACLE).
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import test from 'node:test'
import { REQUIRED_RELEASE } from '../../../support/constants.mjs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { ALL, BUDGET, BUNDLE, CHILD_PLACEMENT, DSH, INSTALL_DOC, ISOLATION, JUNK, LIBRARIES, OFFLINE, PACK_SCRIPT, RELEASE, REPORT, SHELVED, TAR_TOOL, TARBALL, TEMP, VERSION } from './constants.mjs'

/** ustar header layout (POSIX.1-1988 / pax): field offsets and the type flags this suite tells apart. */
const TAR = Object.freeze({
  block: 512, name: [0, 100], size: [124, 136], type: 156, linkname: [157, 257], magic: [257, 263], prefix: [345, 500],
  magicPrefix: 'ustar', octal: 8, base256Flag: 0x80,
  regular: Object.freeze(['0', '7']), hardLink: '1', symlink: '2', directory: '5',
  paxLocal: 'x', paxGlobal: 'g', gnuLongName: 'L', gnuLongLink: 'K',
  paxPath: 'path', paxLinkpath: 'linkpath',
})
const NUL_TAIL = /\0.*$/s
const PAX_RECORD = /^(\d+) /

function field(header, [from, to]) {
  return header.subarray(from, to).toString('utf8').replace(NUL_TAIL, '')
}
function parsePax(body) {
  const out = {}
  let at = 0
  while (at < body.length) {
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
    const entryPath = pax[TAR.paxPath] ?? longName ?? (prefix ? prefix + '/' : '') + field(header, TAR.name)
    entries.push({ path: entryPath, type, linkname: pax[TAR.paxLinkpath] ?? longLink ?? field(header, TAR.linkname), data })
    pax = {}
    longName = undefined
    longLink = undefined
  }
  return entries
}
export const isRegular = (entry) => TAR.regular.includes(entry.type)
export const isDirectory = (entry) => entry.type === TAR.directory
export const isLink = (entry) => entry.type === TAR.symlink || entry.type === TAR.hardLink
export const describeEntry = (entry) => `${entry.path} (type ${entry.type}${entry.linkname ? ' -> ' + entry.linkname : ''})`

/** A tarball's entries keyed by their path inside `package/` (entries outside the prefix keep their full path). */
export function packageFiles(entries) {
  return new Map(entries.map((e) => [e.path.startsWith(TARBALL.prefix) ? e.path.slice(TARBALL.prefix.length) : e.path, e]))
}

// ---- the release folder ----

const missing = (what) => `${what} is missing: ${RELEASE.missingHint} (release folder ${RELEASE.dir}; ${RELEASE.env} moves it)`
/** The release folder, or a failure telling the reader to run the pack script first. */
export function releaseDir() {
  assert.ok(fs.existsSync(RELEASE.dir) && fs.statSync(RELEASE.dir).isDirectory(), missing('the release folder'))
  return RELEASE.dir
}
const MISSING_RELEASE = Object.freeze({ errno: 'ENOENT', reason: 'release folder missing' })

/** Optional source runs skip only absent artifacts; malformed or incomplete releases still fail. */
export function releaseTest(name, options, fn) {
  test(name, options, (t) => {
    if (process.env[REQUIRED_RELEASE.env] !== REQUIRED_RELEASE.on) {
      try {
        // lstat distinguishes a dangling symlink from an absent path.
        fs.lstatSync(RELEASE.dir)
      } catch (error) {
        if (error.code !== MISSING_RELEASE.errno) throw error
        t.skip(MISSING_RELEASE.reason)
        return
      }
    }
    releaseDir()
    return fn(t)
  })
}

export function tarballPath(pkg, dir = releaseDir()) {
  const file = path.join(dir, pkg.tarball)
  assert.ok(fs.existsSync(file), missing(pkg.tarball))
  return file
}
const tarballCache = new Map()
/** One package's release tarball, parsed once per process: { file, entries, files: Map<rel, entry>, manifest }. */
export function tarball(pkg) {
  const file = tarballPath(pkg)
  if (!tarballCache.has(file)) {
    const entries = parseTarball(file)
    const files = packageFiles(entries)
    const manifest = files.get(TARBALL.manifest)
    tarballCache.set(file, { file, entries, files, manifest: manifest === undefined ? null : JSON.parse(manifest.data.toString('utf8')) })
  }
  return tarballCache.get(file)
}
export const sha256 = (bytes) => createHash(RELEASE.digest).update(bytes).digest(RELEASE.digestEncoding)

// ---- rules shared by several cases ----

/** Requirement 6: a path is junk when a directory segment or its file name is one of the banned ones. */
export function isJunk(rel) {
  const parts = rel.split('/')
  const name = parts.pop()
  return parts.some((s) => JUNK.dirSegments.includes(s)) || JUNK.fileNames.some((re) => re.test(name))
}
/** The installed or packed manifest at `dir`, or null. */
export function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}
/** A module the SDK ships in its own node_modules (semver, yaml), loaded from there. */
export function sdkModule(sdk, name) {
  return createRequire(path.join(DSH.versionsDir, sdk, DSH.semverAnchor))(name)
}
/** The semver DSH ships with this SDK (DSH checks engines.dsh with it). */
export const sdkSemver = (sdk) => sdkModule(sdk, DSH.semver)
/**
 * Node's package lookup: `<dir>/node_modules/<name>/package.json` from `fromDir` up to the top
 * (`.` for a tarball-relative path, `/` for an absolute one), skipping `node_modules` folders
 * themselves. `has(path)` says whether a manifest exists; returns the first path found, or null.
 * `stopAt` (optional) ends the walk there, so a lookup never leaves the tree under test.
 */
export function resolveIn(has, fromDir, name, stopAt) {
  for (let dir = path.posix.normalize(fromDir || '.'); ; dir = path.posix.dirname(dir)) {
    if (path.posix.basename(dir) !== TARBALL.nodeModules) {
      const candidate = path.posix.join(dir, TARBALL.nodeModules, name, TARBALL.manifest)
      if (has(candidate)) return candidate
    }
    if (dir === stopAt || path.posix.dirname(dir) === dir) return null
  }
}

// ---- requirement 3: library copies (shared with PLAT-EP-07 row 5 in contract/package-boundaries and dsh-instance/placement) ----

/** The 9 packages whose tarball manifest lists `lib` in dependencies (requirement 3, derived, never a fixed list). */
export function importersOf(lib) {
  return ALL.filter((p) => p !== lib && Object.hasOwn(tarball(p).manifest?.[BUNDLE.dependencyField] ?? {}, lib.name))
}
/**
 * Requirement 3 for one library (shared with PLAT-EP-07 row 5 in contract/package-boundaries and
 * dsh-instance/placement): each importer lists it in bundleDependencies and its tarball holds
 * node_modules/<lib>/ with exactly the library's own shipped files, byte-identical, as regular
 * entries; a package that does not list it holds no copy. Returns { importers, problems }.
 */
export function libraryCopies(lib) {
  const own = new Map([...tarball(lib).files].filter(([, e]) => isRegular(e)))
  const importers = importersOf(lib)
  const problems = []
  for (const pkg of ALL) {
    if (pkg === lib) continue
    const { files, manifest } = tarball(pkg)
    const prefix = BUNDLE.copyDir(lib.name)
    const copy = new Map([...files].filter(([rel]) => rel.startsWith(prefix)).map(([rel, e]) => [rel.slice(prefix.length), e]))
    if (!importers.includes(pkg)) {
      if (copy.size > 0) problems.push(`${pkg.name} does not list ${lib.name} in ${BUNDLE.dependencyField} but ships ${prefix}`)
      continue
    }
    if (!BUNDLE.bundleFields.some((f) => (manifest[f] ?? []).includes(lib.name))) problems.push(`${pkg.name}: ${lib.name} is not in ${BUNDLE.bundleFields.join('/')}`)
    for (const [rel, e] of own) {
      const c = copy.get(rel)
      if (c === undefined) problems.push(`${pkg.name} lacks ${prefix}${rel}`)
      else if (!isRegular(c)) problems.push(`${pkg.name}: ${describeEntry(c)} is not a regular file`)
      else if (!c.data.equals(e.data)) problems.push(`${pkg.name}: ${prefix}${rel} differs from ${lib.tarball}`)
    }
    for (const [rel, c] of copy) if (!isDirectory(c) && !own.has(rel)) problems.push(`${pkg.name}: ${describeEntry(c)} is not one of ${lib.name}'s shipped files`)
  }
  return { importers, problems }
}
/**
 * Requirement 3 / PLAT-EP-07 row 5 as one assertion, for the library named `name` (callers in other
 * suites name libraries by their own constants): at least one importer, each named one among them,
 * and no copy problem.
 */
export function assertLibraryCopies(name, named = []) {
  const lib = LIBRARIES.find((p) => p.name === name)
  assert.ok(lib, name + ' is not a release library')
  const { importers, problems } = libraryCopies(lib)
  assert.ok(importers.length > 0, 'no release tarball lists ' + name + ' in ' + BUNDLE.dependencyField)
  for (const n of named) assert.ok(importers.some((p) => p.name === n), `${n} does not list ${name} in ${BUNDLE.dependencyField}`)
  assert.deepEqual(problems, [])
}

// ---- isolated processes and throwaway folders ----

/** Run a program; resolves { code, stdout, output } (never rejects on a non-zero exit; a signal or spawn error is a non-zero code). */
export function runTool(file, args, { env, cwd, timeoutMs }) {
  return new Promise((resolve) => {
    execFile(file, args, { env, cwd, timeout: timeoutMs, maxBuffer: BUDGET.maxOutputBytes }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : error.signal ?? String(error.code)) : 0
      resolve({ code, stdout, output: `${stdout}\n${stderr}` })
    })
  })
}
export const tarListing = (file) => runTool(TAR_TOOL.file, [TAR_TOOL.list, file], { env: { PATH: ISOLATION.path }, timeoutMs: BUDGET.dryRunMs })

/**
 * The environment of every child: built from scratch, no user npm config, a dead proxy for any
 * network attempt (or `proxy`, e.g. a counting one, which answers nothing either).
 */
export function isolatedEnv(scratch, extra = {}, proxy = ISOLATION.deadProxy) {
  const home = path.join(scratch, ISOLATION.homeDir)
  const cache = path.join(scratch, ISOLATION.npmCacheDir)
  const globalconfig = path.join(scratch, ISOLATION.globalconfigFile)
  for (const d of [home, cache]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(globalconfig, '')
  const env = {
    PATH: ISOLATION.path, HOME: home, TMPDIR: os.tmpdir(),
    npm_config_userconfig: ISOLATION.userconfig, npm_config_globalconfig: globalconfig, npm_config_cache: cache,
    ...extra,
  }
  for (const v of ISOLATION.proxyVars) env[v] = proxy
  return env
}

/**
 * Run `fn` with `vars` set in this process's own environment (for an in-process call whose child
 * processes inherit it), restoring every touched variable afterwards. Cases run one at a time per file.
 */
export async function withProcessEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
  Object.assign(process.env, vars)
  try {
    return await fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
}

/** A fresh folder under the OS temp dir, removed after `fn` (guarded: only a folder this suite created). */
export async function withScratch(fn) {
  const dir = await makeScratch()
  try {
    return await fn(dir)
  } finally {
    await removeScratch(dir)
  }
}
export async function makeScratch() {
  return fs.realpathSync(await mkdtemp(path.join(os.tmpdir(), TEMP.prefix)))
}
export async function removeScratch(dir) {
  if (path.dirname(dir) !== fs.realpathSync(os.tmpdir()) || !path.basename(dir).startsWith(TEMP.prefix)) throw new Error('unexpected temp dir ' + dir)
  await rm(dir, { recursive: true, force: true })
}

/**
 * `dsh plugin --profile <p> add <tarballs…>` of SDK `sdk` into a fresh DSH_HOME under `scratch`,
 * offline against `store`/`cache`. Resolves { code, output, home, profileDir }.
 */
export async function dshAdd(sdk, scratch, tarballs, { store, cache }) {
  const home = path.join(scratch, ISOLATION.dshHomeDir)
  const env = isolatedEnv(scratch, { DSH_HOME: home })
  const result = await runTool(cliPath(sdk), DSH.pluginArgs(DSH.profile, tarballs, store, cache), { env, cwd: scratch, timeoutMs: BUDGET.installMs })
  return { ...result, home, profileDir: DSH.profileDir(home, DSH.profile) }
}

// ---- offline installs with the DSH CLI (shared with dsh-instance/placement-install) ----

export const show = (v) => JSON.stringify(v)
export const tail = (output) => String(output).slice(-REPORT.tailChars)
/** A profile manifest's `dsh.profile.bundles` (empty when absent). */
export const bundlesOf = (manifest) => DSH.bundlesPath.reduce((v, k) => v?.[k], manifest) ?? []
/** The release's warmed pnpm store and metadata cache. */
export const releaseStore = () => ({ store: path.join(releaseDir(), RELEASE.store), cache: path.join(releaseDir(), RELEASE.cache) })
export const installedDir = (profileDir, pkg) => path.join(profileDir, TARBALL.nodeModules, pkg.name)

const cliPath = (sdk) => path.join(DSH.versionsDir, sdk, DSH.bin)
/** The SDK's real `dsh` CLI, asserted to exist (a missing CLI must never pass a "must fail" case). */
export function checkedCli(sdk) {
  const bin = cliPath(sdk)
  assert.ok(fs.existsSync(bin), `DSH ${sdk} CLI is missing at ${bin} (FBTEST_DSH_VERSIONS moves its folder)`)
  return bin
}
/** `dshAdd`, after asserting the SDK's CLI exists. */
export async function dshAddChecked(sdk, scratch, tarballs, where) {
  checkedCli(sdk)
  return dshAdd(sdk, scratch, tarballs, where)
}
/**
 * `dsh plugin add` of the release tarballs of `pkgs` (one add, in order) into a fresh home under
 * `scratch`; asserts exit 0, the profile's dependencies, each installed version and, when asked,
 * the bundles. Resolves dshAdd's result ({ code, output, home, profileDir }).
 */
export async function installAndCheck(sdk, scratch, pkgs, { bundles }, where = releaseStore()) {
  const r = await dshAddChecked(sdk, scratch, pkgs.map((p) => tarballPath(p)), where)
  assert.equal(r.code, DSH.okExit, tail(r.output))
  assert.deepEqual(installProblems(r.profileDir, pkgs, { bundles }), [], tail(r.output))
  return r
}
/**
 * What a DSH profile at `profileDir` lacks for `pkgs`: a dependency entry, an installed
 * node_modules/<name> at VERSION and, when `bundles`, a `dsh.profile.bundles` entry.
 */
export function installProblems(profileDir, pkgs, { bundles }) {
  const profile = readJson(path.join(profileDir, TARBALL.manifest))
  if (profile === null) return ['no profile package.json at ' + profileDir]
  const problems = []
  for (const p of pkgs) {
    if (!Object.hasOwn(profile.dependencies ?? {}, p.name)) problems.push(`profile dependencies lack ${p.name}`)
    if (bundles && !bundlesOf(profile).includes(p.name)) problems.push(`${DSH.bundlesPath.join('.')} lacks ${p.name}`)
    const v = readJson(path.join(installedDir(profileDir, p), TARBALL.manifest))?.version
    if (v !== VERSION) problems.push(`installed ${p.name} version ${show(v)}`)
  }
  return problems
}
/**
 * Package `dep` ({ name, version? }) resolves, by Node's lookup from the installed `owner` in
 * `profileDir`, to a copy inside the owner's own node_modules (its bundle), at `dep.version` when given.
 */
export function assertFromOwnBundle(profileDir, owner, dep) {
  const from = installedDir(profileDir, owner)
  const found = resolveIn(fs.existsSync, from, dep.name, profileDir)
  assert.ok(found, `${dep.name} does not resolve from ${from}`)
  assert.ok(found.startsWith(path.join(from, TARBALL.nodeModules) + path.sep), `${dep.name} resolves outside ${owner.name}'s bundle: ${found}`)
  if (dep.version !== undefined) assert.equal(readJson(found).version, dep.version)
}
/**
 * SHELVE-BOARD (the user, 2026-11-18: "…所以不要预留在子实例的Fishball内"): every trace of the shelved
 * board in the hosted child profile at `profileDir`, empty when none. A copy in vendor/ or
 * node_modules/ (a folder or a tarball named after it), a dependency, a `dsh.profile.bundles` entry,
 * any mention in the placement record (so a disabled or reserved entry counts), an install spec
 * `fishball-board@…` anywhere in the profile manifest. Shared by every instance suite's SHELVE rows.
 */
export function shelvedTraces(profileDir) {
  const { name } = SHELVED.board
  const manifest = readJson(path.join(profileDir, TARBALL.manifest)) ?? {}
  const record = readJson(path.join(profileDir, CHILD_PLACEMENT.record))
  const copies = CHILD_PLACEMENT.copyDirs.flatMap((dir) => {
    const at = path.join(profileDir, dir)
    return fs.existsSync(at) ? fs.readdirSync(at).filter((f) => f.startsWith(name)).map((f) => `${dir}/${f}`) : []
  })
  return [
    ...copies,
    ...(Object.hasOwn(manifest.dependencies ?? {}, name) ? [`dependencies.${name} = ${show(manifest.dependencies[name])}`] : []),
    ...(bundlesOf(manifest).includes(name) ? [`${DSH.bundlesPath.join('.')} holds ${name}`] : []),
    ...(JSON.stringify(record).includes(name) ? [`${CHILD_PLACEMENT.record} names ${name}: ${show(record)}`] : []),
    ...(JSON.stringify(manifest).includes(name + '@') ? [`an install spec ${name}@… in the profile manifest`] : []),
  ]
}
/** XOR one byte of `file` at `offset` with the tamper mask, in place. */
export function flipByte(file, offset) {
  const fd = fs.openSync(file, 'r+')
  try {
    const b = Buffer.alloc(1)
    fs.readSync(fd, b, 0, 1, offset)
    b[0] ^= PACK_SCRIPT.flipMask
    fs.writeSync(fd, b, 0, 1, offset)
  } finally {
    fs.closeSync(fd)
  }
}

/** A copy of the release folder inside `scratch` (so a case may modify or delete it). */
export function copyRelease(scratch) {
  const copy = path.join(scratch, ISOLATION.copyDir)
  fs.cpSync(releaseDir(), copy, { recursive: true, verbatimSymlinks: true })
  return copy
}
/** Every file path under `dir`, relative to it (sorted). */
export const filesUnder = (dir) => fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort()

/**
 * Run `fn(proxyUrl, hits)` with a local proxy that records every connection and answers none, so a
 * child pointed at it can reach no registry and any attempt is counted (an ephemeral port, never a
 * fixed one).
 */
export async function withCountingProxy(fn) {
  const hits = []
  const server = net.createServer((socket) => { hits.push(socket.remoteAddress); socket.destroy() })
  await new Promise((resolve) => server.listen(0, ISOLATION.proxyHost, resolve))
  try {
    return await fn(ISOLATION.proxyScheme + ISOLATION.proxyHost + ':' + server.address().port, hits)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// ---- INSTALL.md, read and run as written (E-FIX-2) ----

/** INSTALL.md of the release folder `dir`, as lines. */
export function installDocLines(dir = releaseDir()) {
  const file = path.join(dir, INSTALL_DOC.file)
  assert.ok(fs.existsSync(file), missing(INSTALL_DOC.file))
  return fs.readFileSync(file, 'utf8').split(RELEASE.lineBreak)
}
/** The fenced code blocks: { open, close, lines } (the fence lines' indexes and the lines between). */
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
/** The one fenced block with an add line whose .tgz arguments are exactly `pkgs`' tarballs, in order. */
export function offlineBlock(lines, pkgs) {
  const want = show(pkgs.map((p) => p.tarball))
  const found = fencedBlocks(lines).filter((b) => b.lines.some((l) => isAddLine(l) && show(tarballsOf(l)) === want))
  assert.equal(found.length, 1, `${INSTALL_DOC.file} has ${found.length} fenced blocks adding exactly ${want} (one expected)`)
  return found[0]
}
/** The first add line naming exactly `pkgs` as `<name>@VERSION`, in order, with no tarball; -1 when none. */
export function onlineLineIndex(lines, pkgs) {
  const want = show(pkgs.map((p) => p.name))
  return lines.findIndex((l) => isAddLine(l) && tarballsOf(l).length === 0 && show(specsOf(l)) === want)
}
/** The `## ` section holding line `at` (from its heading to the next one). */
export function sectionOf(lines, at) {
  const start = lines.findLastIndex((l, i) => i <= at && INSTALL_DOC.heading.test(l))
  const next = lines.findIndex((l, i) => i > at && INSTALL_DOC.heading.test(l))
  return lines.slice(Math.max(start, 0), next === -1 ? lines.length : next)
}
/** Paragraphs (runs of non-blank lines), each joined into one string. */
export function paragraphs(lines) {
  const out = [[]]
  for (const l of lines) if (INSTALL_DOC.paragraphBreak.test(l)) out.push([]); else out.at(-1).push(l)
  return out.filter((p) => p.length > 0).map((p) => p.join(RELEASE.lineBreak))
}

/**
 * A DSH home under `scratch` for running INSTALL.md as a user would: `dsh` on PATH is the SDK's real
 * CLI, every network attempt goes to `proxy`. `cli(args)` runs the CLI; `runBlock(block, cwd)` runs a
 * fenced block's lines, in order, as one bash script (stopping at a failed line); `storeDir()` is
 * node_modules/.modules.yaml's storeDir (read with the SDK's own yaml); `storePath()` is
 * `dsh plugin --profile <p> store path`.
 */
export function docProfile(sdk, scratch, proxy) {
  const bin = path.join(scratch, OFFLINE.binDir)
  fs.mkdirSync(bin, { recursive: true })
  fs.symlinkSync(checkedCli(sdk), path.join(bin, OFFLINE.cliName))
  const home = path.join(scratch, ISOLATION.dshHomeDir)
  const profileDir = DSH.profileDir(home, DSH.profile)
  const env = isolatedEnv(scratch, { DSH_HOME: home, PATH: bin + path.delimiter + ISOLATION.path }, proxy)
  const run = (file, args, cwd = scratch) => runTool(file, args, { env, cwd, timeoutMs: BUDGET.installMs })
  const cli = (args) => run(cliPath(sdk), args)
  return {
    home, profileDir, cli,
    runBlock: (block, cwd) => run(OFFLINE.shell, [...OFFLINE.shellArgs, block.lines.join(RELEASE.lineBreak)], cwd),
    storeDir: () => {
      const file = path.join(profileDir, ...OFFLINE.modulesYaml)
      return fs.existsSync(file) ? sdkModule(sdk, OFFLINE.yaml).parse(fs.readFileSync(file, 'utf8'))?.[OFFLINE.storeDirKey] : undefined
    },
    storePath: async () => {
      const r = await cli(OFFLINE.storePathArgs(DSH.profile))
      assert.equal(r.code, DSH.okExit, tail(r.output))
      return r.stdout.split(RELEASE.lineBreak).map((l) => l.trim()).filter(Boolean).at(-1)
    },
  }
}
