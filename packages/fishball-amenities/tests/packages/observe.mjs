/**
 * Observation layer of the AM rows: manifests, the bundle patch as the current DSH's own overlay
 * loader parses it, DSH's own path inspection (the Plugins page's "add" check), and the specifiers
 * each member's JS files name (specifiers-worker.mjs). No product module is loaded.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { importDsh } from 'fishball-test-helpers/dsh'
import { MEMBERS, dirOf, manifestOf } from '../support/packages.mjs'
import { tempDir } from '../support/temp.mjs'
import { DSH, MANIFEST, SOURCE, WORKER } from './constants.mjs'

export const json = (value) => JSON.stringify(value)
export const inside = (dir, file) => { const rel = path.relative(dir, file); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)) }
export const isPath = (specifier) => specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')
export const bareName = (specifier) => { const parts = specifier.split('/'); return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] }
export const bundledOf = (manifest) => MANIFEST.bundled.flatMap((f) => manifest[f] ?? [])
export const dependencyOf = (manifest, name) => manifest[MANIFEST.dependencies]?.[name]

/**
 * Every row a patch list inserts, nested rows included: an inserted row's children are a group's
 * `config` list or an agent preset's `config.plugins` (a module there loads too).
 */
function insertedRows(patches) {
  const walkRow = (row) => {
    const children = Array.isArray(row?.config) ? row.config : Array.isArray(row?.config?.plugins) ? row.config.plugins : []
    return [row, ...children.flatMap(walkRow)]
  }
  return patches.flatMap((p) => (p?.insert ?? []).flatMap(walkRow))
}

/** The bundle patch the manifest names (dsh.bundle.patch), as the current DSH parses it: its inserted rows. */
export async function patchRows(pkg) {
  const relative = manifestOf(pkg)[MANIFEST.dsh]?.[MANIFEST.bundle]?.[MANIFEST.patchField]
  assert.equal(typeof relative, 'string', pkg.name + ' names no dsh.bundle.patch')
  const file = path.join(dirOf(pkg), relative)
  assert.ok(fs.existsSync(file), pkg.name + ': ' + relative + ' does not exist')
  const { loadOverlayPatches } = await importDsh(DSH.patchLoader)
  return insertedRows(loadOverlayPatches(DSH.patchLabel, file))
}

/** DSH's own path inspection (the Plugins page's "add" check) of a package folder, offline, against a throwaway profile. */
export async function dshInspect(dir) {
  const { PluginManager } = await importDsh(DSH.manager)
  const scratch = tempDir(DSH.inspectPrefix)
  fs.writeFileSync(path.join(scratch, DSH.profile.manifest), json({ name: DSH.profile.name, dependencies: {} }))
  fs.writeFileSync(path.join(scratch, DSH.profile.anchor), json({ dependencies: {} }))
  // Only the fields inspect() reads for a local path; registries are answered empty, so nothing is fetched.
  const self = { profile: { dir: scratch, installAnchor: path.join(scratch, DSH.profile.anchor) }, registries: async () => ({ registry: null, fallbackRegistries: [], resolved: null }) }
  return PluginManager.prototype.inspect.call(self, dir)
}

/** Every JS file under a package folder on disk (a bundled node_modules copy is another package's). */
function sourcesOf(dir) {
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && SOURCE.js.test(e.name) && !path.relative(dir, e.parentPath).split(path.sep).some((part) => SOURCE.skip.includes(part)))
    .map((e) => path.join(e.parentPath, e.name))
}
function specifiersOf(files) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER.file, { workerData: { files }, execArgv: [...WORKER.execArgv] })
    worker.once('message', (m) => { resolve(m.results); worker.terminate() })
    worker.once('error', reject)
  })
}

let scanned
/** Each member's references: { member, file (member-relative), specifier, at? (absolute target of a path) }. */
export function memberRefs() {
  scanned ??= (async () => {
    const out = []
    for (const m of MEMBERS) {
      const dir = dirOf(m)
      for (const [file, { error, specifiers }] of Object.entries(await specifiersOf(sourcesOf(dir)))) {
        assert.equal(error, undefined, m.name + ': ' + path.relative(dir, file) + ' does not parse: ' + error)
        for (const specifier of specifiers) {
          if (specifier === null) continue
          out.push({ member: m, file: m.name + '/' + path.relative(dir, file), specifier, ...(isPath(specifier) ? { at: path.resolve(path.dirname(file), specifier) } : {}) })
        }
      }
    }
    return out
  })()
  return scanned
}
export const describeRef = (r) => r.file + ': ' + json(r.specifier)
