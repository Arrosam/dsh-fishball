/**
 * The observation layer of the boundary rows: what each Fishball package ships (its own `npm pack
 * --dry-run` listing, from its folder found by name), the specifiers and tokens of its shipped JS
 * files (./parse-worker.mjs), and the package each specifier lands in. Black box: manifests, listings
 * and specifiers only; no product module is loaded and nothing in the checkout is written (npm runs
 * with --ignore-scripts, offline, under the runner's isolated HOME and cache).
 *
 * A package folder holding another package (fishball-core holds fishball-ui) is split as npm and
 * Node see it: fishball-ui's files belong to fishball-ui even though core's tarball carries them.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { Worker } from 'node:worker_threads'
import { packageByName } from 'fishball-test-helpers/packages'
import { FISHBALL, NAMES, PACK, SCAN } from '../constants.mjs'

const run = promisify(execFile)
const posix = (p) => p.split(path.sep).join('/')
export const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep)
export const bareName = (specifier) => (specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0])
export const isPath = (specifier) => specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')
export const readManifest = (dir) => { const f = path.join(dir, PACK.manifest); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null }

/** A package's folder (realpath), from the workspace catalogue by name. */
export const dirOf = (name) => fs.realpathSync(packageByName(name).abs)

/** Every package-relative POSIX path `npm pack --dry-run` lists for the folder `dir`. */
export async function packedFilesAt(dir) {
  const { stdout } = await run(PACK.command, [...PACK.dryRunArgs], { cwd: dir, env: { ...process.env, ...PACK.env }, maxBuffer: PACK.maxStdoutBytes })
  const [report] = JSON.parse(stdout.slice(stdout.search(PACK.jsonStart)))
  return report.files.map((f) => posix(f.path)).sort()
}
const packs = new Map()
/** The listing of the package `name` (its folder by name; cached). */
export function packedFiles(name) {
  if (!packs.has(name)) packs.set(name, packedFilesAt(dirOf(name)))
  return packs.get(name)
}

/** Specifiers and tokens of many files, read in the worker. */
export function parseFiles(files) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(SCAN.worker, { workerData: { files }, execArgv: [...SCAN.execArgv] })
    worker.once('message', (m) => { resolve(m.results); worker.terminate() })
    worker.once('error', reject)
  })
}

/** The Fishball package a file of the repository lies in (the innermost folder). */
function ownerOf(file, dirs) {
  return dirs.find((d) => inside(d.dir, file))?.name
}

let cache
/**
 * Every Fishball package as shipped, once per process: Map<name, Unit>, Unit = { name, dir, manifest,
 * files (shipped, own: a nested package's files are not its owner's), js, digests: Map<file, sha256>,
 * parseErrors, tokens: Map<file, {names, strings}>, refs: Ref[] }, Ref = { file, kind, specifier,
 * target? (another Fishball package it lands in, by name or by path), outside? (a path leaving the
 * package into none), libraryModule? (the fishball-shared file it lands on) }.
 */
export function observe() {
  cache ??= observeOnce()
  return cache
}
async function observeOnce() {
  const dirs = NAMES.map((name) => ({ name, dir: dirOf(name) })).sort((a, b) => b.dir.length - a.dir.length)
  const units = new Map()
  for (const { name, dir } of dirs) {
    const listed = await packedFiles(name)
    // A file of a nested package (fishball-ui inside fishball-core) is the nested package's.
    const files = listed.filter((f) => ownerOf(path.join(dir, f), dirs) === name)
    units.set(name, { name, dir, manifest: readManifest(dir), files })
  }
  const libraryDir = dirOf(FISHBALL.library)
  for (const unit of units.values()) {
    const js = unit.files.filter((f) => SCAN.js.test(f) && !f.split('/').includes(PACK.nodeModules))
    unit.js = js
    const abs = js.map((f) => path.join(unit.dir, f))
    const parsed = await parseFiles(abs)
    unit.digests = new Map(js.map((f, i) => [f, createHash(SCAN.digest).update(fs.readFileSync(abs[i])).digest('hex')]))
    unit.tokens = new Map(js.map((f, i) => [f, parsed[abs[i]]]))
    unit.parseErrors = js.filter((f, i) => parsed[abs[i]].error).map((f, i) => f + ': ' + parsed[abs[js.indexOf(f)]].error)
    unit.refs = []
    for (const [i, f] of js.entries()) {
      for (const ref of parsed[abs[i]].refs) {
        const entry = { file: f, kind: ref.kind, specifier: ref.specifier }
        if (ref.specifier === null) { unit.refs.push(entry); continue }
        let resolved
        if (isPath(ref.specifier)) {
          const at = path.resolve(path.dirname(abs[i]), ref.specifier)
          resolved = fs.existsSync(at) ? fs.realpathSync(at) : at
        }
        const named = isPath(ref.specifier) ? undefined : NAMES.find((n) => n === bareName(ref.specifier))
        const landed = resolved === undefined ? undefined : ownerOf(resolved, dirs)
        const target = named ?? landed
        if (target !== undefined && target !== unit.name) entry.target = target
        if (resolved !== undefined && landed === undefined && !inside(unit.dir, resolved)) entry.outside = true
        if (target === FISHBALL.library || landed === FISHBALL.library) entry.libraryModule = libraryModuleOf(ref.specifier, resolved, libraryDir)
        unit.refs.push(entry)
      }
    }
  }
  return units
}

/** The fishball-shared file a reference lands on: by its path, or by the library's published export. */
function libraryModuleOf(specifier, resolved, libraryDir) {
  if (resolved !== undefined) return posix(path.relative(libraryDir, resolved))
  const sub = specifier === FISHBALL.library ? '.' : '.' + specifier.slice(FISHBALL.library.length)
  const target = readManifest(libraryDir)?.exports?.[sub]
  return typeof target === 'string' ? posix(path.normalize(target)) : undefined
}

export const edgesTo = (unit, name) => (unit?.refs ?? []).filter((r) => r.target === name)
export const describeRef = (r) => `${r.file}: ${r.kind} ${JSON.stringify(r.specifier)}`
/** Every package name a manifest names in the given fields, with the field. */
export function manifestNames(manifest, fields) {
  return fields.flatMap((field) => {
    const value = manifest?.[field]
    if (Array.isArray(value)) return value.map((name) => ({ field, name }))
    if (value && typeof value === 'object') return Object.keys(value).map((name) => ({ field, name }))
    return []
  })
}
