/**
 * What each product package ships: its real `npm pack` listing, the specifiers its shipped JS
 * files name, and the package each one lands in. Only manifests, packed listings and import
 * specifiers are read; no product module is loaded. Everything runs on a throwaway copy of
 * the connector product packages, so the checkout is never written.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { Worker } from 'node:worker_threads'
import { MONOREPO } from '../repo.mjs'
import { JS_FILE, LIBRARY_NAMES, NPM, PRODUCT, PRODUCT_NAMES, WORKER } from './constants.mjs'

const run = promisify(execFile)
const MANIFEST = 'package.json'
const NODE_MODULES = 'node_modules'
const PRODUCT_DIRS = Object.freeze(Object.values(PRODUCT).map(({ dir }) => path.relative(MONOREPO, dir)))
const JSON_START = /^\[/m
const DIGEST = 'sha256'

/** The `.runtime` folder for throwaway copies (created on first use; the runner creates it too). */
export function npmTempRoot() {
  fs.mkdirSync(NPM.tempRoot, { recursive: true })
  return NPM.tempRoot
}

export const readManifest = (dir) => {
  const file = path.join(dir, MANIFEST)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep)
const productName = (name) => PRODUCT_NAMES.find((n) => n.toLowerCase() === String(name).toLowerCase())
export const bareName = (specifier) => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}
const isPath = (specifier) => specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')
const posix = (p) => p.split(path.sep).join('/')

/**
 * A throwaway copy of the root manifest and connector product packages (tracked and untracked files,
 * not ignored ones), with a root `node_modules/` of links standing in for the workspace install, so
 * a bare library name (`fishball-shared`, `dsh-connector-shared`) resolves from an importing file as
 * it would after `npm install`.
 */
async function workspaceCopy() {
  const root = await mkdtemp(path.join(npmTempRoot(), NPM.tempPrefix))
  const { stdout } = await run('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', MANIFEST, ...PRODUCT_DIRS], { cwd: MONOREPO, maxBuffer: NPM.maxStdoutBytes })
  for (const rel of stdout.split('\0').filter(Boolean)) {
    const from = path.join(MONOREPO, rel)
    if (!fs.existsSync(from)) continue
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.cpSync(from, path.join(root, rel), { verbatimSymlinks: true })
  }
  const links = path.join(root, NODE_MODULES)
  fs.mkdirSync(links)
  for (const p of Object.values(PRODUCT)) {
    const dir = path.join(root, path.relative(MONOREPO, p.dir))
    if (!fs.existsSync(path.join(dir, MANIFEST))) continue
    fs.mkdirSync(path.dirname(path.join(links, p.name)), { recursive: true })
    fs.symlinkSync(dir, path.join(links, p.name))
  }
  // npm reads no user or global config: both point at empty files of this copy (never ~/.npmrc).
  fs.mkdirSync(path.join(root, '.home'))
  for (const f of ['.userrc', '.globalrc']) fs.writeFileSync(path.join(root, f), '')
  return fs.realpathSync(root)
}

async function removeCopy(root) {
  // Guard the one recursive delete: only a directory this module created under its temp root.
  if (path.dirname(root) !== fs.realpathSync(NPM.tempRoot) || !path.basename(root).startsWith(NPM.tempPrefix)) throw new Error('unexpected temp dir ' + root)
  await rm(root, { recursive: true, force: true })
}

/** Every packed file path of one package (copy folder `dir`), from an isolated `npm pack --dry-run`. */
async function packedFiles(root, dir) {
  const env = ['-i', 'PATH=' + NPM.path, 'HOME=' + path.join(root, '.home'), 'npm_config_userconfig=' + path.join(root, '.userrc'),
    'npm_config_globalconfig=' + path.join(root, '.globalrc'), 'npm_config_cache=' + path.join(root, '.npm-cache'),
    'npm_config_offline=true', 'npm_config_audit=false', 'npm_config_fund=false']
  const { stdout } = await run('/usr/bin/env', [...env, 'npm', ...NPM.args], { cwd: dir, timeout: NPM.timeoutMs, maxBuffer: NPM.maxStdoutBytes })
  // A lifecycle script's own output comes before npm's JSON report.
  const [report] = JSON.parse(stdout.slice(stdout.search(JSON_START)))
  return report.files.map((f) => posix(f.path)).sort()
}

/** Specifiers of many files at once, read in the worker (see specifiers-worker.mjs). */
function readSpecifiers(files) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER.specifiers, { workerData: { files, resolveNames: PRODUCT_NAMES.map((n) => n.toLowerCase()) }, execArgv: [...WORKER.execArgv] })
    worker.once('message', (m) => { resolve(m.results); worker.terminate() })
    worker.once('error', reject)
  })
}

/**
 * A unit is one product package as shipped. Files of a nested product package inside a tarball (a folder with
 * its own package.json naming a product package: such as a
 * bundled `node_modules/<library>`) belong to that nested package, not to the tarball's owner.
 * A nested copy of a package that also has its own folder is not analysed twice.
 */
function unitsOf(owner, dir, files) {
  const nested = files.filter((f) => path.posix.basename(f) === MANIFEST && f !== MANIFEST)
    .map((f) => ({ prefix: path.posix.dirname(f) + '/', name: productName(readManifest(path.join(dir, path.posix.dirname(f)))?.name) }))
    .filter((n) => n.name !== undefined)
    .sort((a, b) => b.prefix.length - a.prefix.length)
  const units = new Map([[owner, { name: owner, dir, own: true, files: [] }]])
  for (const f of files) {
    const n = nested.find((x) => f.startsWith(x.prefix))
    if (n === undefined) { units.get(owner).files.push(f); continue }
    if (!units.has(n.name)) units.set(n.name, { name: n.name, dir: path.join(dir, n.prefix), own: false, files: [] })
    units.get(n.name).files.push(f.slice(n.prefix.length))
  }
  return [...units.values()]
}

let cache
/**
 * Pack and scan every product package of this checkout, once per process.
 * Result: { packed: {name: string[]}, units: Map<name, Unit> }, Unit = { name, own, manifest,
 * files: string[] (shipped, package-relative), digests: Map<jsFile, sha256>, parseErrors: string[], refs: Ref[] },
 * Ref = { file, kind, specifier (null when not a literal), target? (the product package it lands in,
 * when not the unit itself), library? and libraryModule? (the library and its file the reference lands on), outside? (a path leaving the package
 * into no product package), unresolved? }.
 */
export function observe() {
  cache ??= observeOnce()
  return cache
}

async function observeOnce() {
  const root = await workspaceCopy()
  try {
    const present = Object.values(PRODUCT).map((p) => ({ name: p.name, dir: path.join(root, path.relative(MONOREPO, p.dir)) })).filter((p) => readManifest(p.dir) !== null)
    const packed = {}
    for (const p of present) packed[p.name] = await packedFiles(root, p.dir)
    const units = new Map()
    for (const p of present) {
      for (const unit of unitsOf(p.name, p.dir, packed[p.name])) {
        const known = units.get(unit.name)
        if (known === undefined || (!known.own && unit.own)) units.set(unit.name, unit)
      }
    }
    // Longest folder first, so a nested unit wins over the package that ships it.
    const dirs = [...units.values()].map((u) => ({ name: u.name, dir: fs.realpathSync(u.dir) })).sort((a, b) => b.dir.length - a.dir.length)
    const unitAt = (file) => dirs.find((d) => inside(d.dir, file))?.name
    /** The file of library `name` that `file` is, by the library's folder or a node_modules/<name>/ copy. */
    const libraryModule = (name, file) => {
      const dir = dirs.find((d) => d.name === name)?.dir
      if (dir !== undefined && inside(dir, file)) return posix(path.relative(dir, file))
      const marker = path.sep + path.join(NODE_MODULES, name) + path.sep
      const at = file.lastIndexOf(marker)
      return at < 0 ? undefined : posix(file.slice(at + marker.length))
    }
    for (const unit of units.values()) {
      unit.manifest = readManifest(unit.dir)
      const own = fs.realpathSync(unit.dir)
      const js = unit.files.filter((f) => JS_FILE.test(f) && !f.split('/').includes(NODE_MODULES)).map((f) => path.join(own, f))
      const scanned = await readSpecifiers(js)
      // The copy is removed after observation: keep a digest of each shipped JS file for the one-owner check.
      unit.digests = new Map(js.map((f) => [posix(path.relative(own, f)), createHash(DIGEST).update(fs.readFileSync(f)).digest('hex')]))
      unit.refs = []
      unit.parseErrors = []
      for (const [file, { error, refs }] of Object.entries(scanned)) {
        if (error) unit.parseErrors.push(posix(path.relative(own, file)) + ': ' + error)
        for (const ref of refs) {
          const entry = { file: posix(path.relative(own, file)), kind: ref.kind, specifier: ref.specifier }
          let resolved = ref.resolved
          if (ref.specifier !== null && isPath(ref.specifier)) {
            const at = path.resolve(path.dirname(file), ref.specifier)
            resolved = fs.existsSync(at) ? fs.realpathSync(at) : at
          }
          const named = ref.specifier === null || isPath(ref.specifier) ? undefined : productName(bareName(ref.specifier))
          const landed = resolved === undefined ? undefined : unitAt(resolved)
          const target = named ?? landed
          if (target !== undefined && target !== unit.name) entry.target = target
          if (resolved !== undefined && named === undefined && landed === undefined && !inside(own, resolved)) entry.outside = true
          // Also set for a library's own internal imports, so usage can follow its re-exports.
          const library = LIBRARY_NAMES.find((n) => n === target || n === landed)
          if (resolved !== undefined && library !== undefined) Object.assign(entry, { library, libraryModule: libraryModule(library, resolved) })
          if (ref.unresolved !== undefined) entry.unresolved = ref.unresolved
          unit.refs.push(entry)
        }
      }
    }
    return { packed, units }
  } finally {
    await removeCopy(root)
  }
}

/** Every package name a manifest names in the given fields, with the field. */
export function manifestNames(manifest, fields) {
  const names = []
  for (const field of fields) {
    const value = manifest?.[field]
    if (Array.isArray(value)) names.push(...value.map((name) => ({ field, name })))
    else if (value && typeof value === 'object') names.push(...Object.keys(value).map((name) => ({ field, name })))
  }
  return names
}