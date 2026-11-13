/**
 * Static observations for the R-CORE cases, on top of the R-SHARED layer (../shared/packages.mjs):
 * what each package ships, the names and strings a file holds, and the files that make up the
 * generic settings panel. Black box: manifests, packed listings and source tokens only; no product
 * module is loaded.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { V3, WORKER } from '../shared/constants.mjs'
import { observe, readManifest } from '../shared/packages.mjs'
import { CORE, HOSTING_WORDS, MARK, TOKENS_WORKER, runtimeOf } from './constants.mjs'

export const has = (pkg) => readManifest(pkg.dir) !== null
export const unitOf = async (name) => (await observe()).units.get(name)
export const describeRef = (r) => `${r.file}: ${r.kind} ${JSON.stringify(r.specifier)}`
/** A package's own shipped files (a bundled node_modules copy is another package's). */
export const ownFiles = (unit) => (unit?.files ?? []).filter((f) => !f.split('/').includes('node_modules'))

/** Names and strings of many files at once (tokens-worker.mjs). */
export function readTokens(files) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(TOKENS_WORKER, { workerData: { files }, execArgv: [...WORKER.execArgv] })
    worker.once('message', (m) => { resolve(m.results); worker.terminate() })
    worker.once('error', reject)
  })
}

/** The JS files of a unit with their tokens, relative path → { names, strings, error? }. */
export async function tokensOf(dir, files) {
  const absolute = files.map((f) => path.join(dir, f))
  const results = await readTokens(absolute)
  return new Map(files.map((f, i) => [f, results[absolute[i]]]))
}

/** Every token of `entry` that names hosting (HOSTING_WORDS), as "kind value". */
export function hostingTokens(entry) {
  const hit = (value) => HOSTING_WORDS.some((word) => word.test(value))
  return [...entry.names.filter(hit).map((n) => 'name ' + n), ...entry.strings.filter(hit).map((s) => 'string ' + JSON.stringify(s))]
}

/**
 * The files of core's generic settings panel: every shipped core JS file that names the panel's
 * own page marker or registers into the panel slot under the V2 panel's marker. The panel is
 * found by its public marker (MARK.panel), wherever core puts it.
 */
export async function panelFiles() {
  const unit = await unitOf(V3.core.name)
  const js = ownFiles(unit).filter((f) => /\.(?:c|m)?js$/.test(f))
  const tokens = await tokensOf(fs.realpathSync(V3.core.dir), js)
  return [...tokens].filter(([, t]) => t.strings.includes(MARK.panel)).map(([f, t]) => ({ file: f, ...t }))
}

export const corePatchFile = () => path.join(V3.core.dir, CORE.patchFile)

/** Core's bundle patch as `sdk`'s DSH parses it (it throws on an unparsable or non-list file). */
export async function corePatchRows(sdk) {
  const { loadOverlayPatches } = await import(pathToFileURL(path.join(runtimeOf(sdk), CORE.patchLoader)).href)
  return loadOverlayPatches(CORE.patchLabel, corePatchFile())
}

/**
 * Every row a patch list inserts, nested rows included: an inserted row's children are a group's
 * `config` list or an agent preset's `config.plugins` (a module there loads too).
 */
export function insertedRows(patches) {
  const walk = (row) => {
    const children = Array.isArray(row?.config) ? row.config : Array.isArray(row?.config?.plugins) ? row.config.plugins : []
    return [row, ...children.flatMap(walk)]
  }
  return patches.flatMap((p) => (p?.insert ?? []).flatMap(walk))
}

/** Whether a row's module `name` is a module of package `pkg` (by package name, or a file inside its folder). */
export function isModuleOf(name, pkg) {
  if (typeof name !== 'string') return false
  if (name === pkg.name || name.startsWith(pkg.name + '/')) return true
  const file = name.startsWith(CORE.fileScheme) ? fileURLToPath(name) : path.isAbsolute(name) ? name : null
  if (file === null) return false
  const inside = (dir) => { const rel = path.relative(dir, file); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) }
  return inside(pkg.dir) || (fs.existsSync(pkg.dir) && inside(fs.realpathSync(pkg.dir)))
}

