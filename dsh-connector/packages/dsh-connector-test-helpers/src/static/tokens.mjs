/**
 * Static observations on top of packages.mjs: what a package ships and the names and strings its
 * files hold. Manifests, packed listings and source tokens only; no product module is loaded.
 */
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { WORKER } from './constants.mjs'
import { observe, readManifest } from './packages.mjs'

export const has = (pkg) => readManifest(pkg.dir) !== null
export const unitOf = async (name) => (await observe()).units.get(name)
export const describeRef = (r) => `${r.file}: ${r.kind} ${JSON.stringify(r.specifier)}`
/** A package's own shipped files (a bundled node_modules copy is another package's). */
export const ownFiles = (unit) => (unit?.files ?? []).filter((f) => !f.split('/').includes('node_modules'))

/** Names and strings of many files at once (tokens-worker.mjs). */
export function readTokens(files) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER.tokens, { workerData: { files }, execArgv: [...WORKER.execArgv] })
    worker.once('message', (m) => { resolve(m.results); worker.terminate() })
    worker.once('error', reject)
  })
}

/** The JS files of a unit with their tokens: relative path → { names, strings, error? }. */
export async function tokensOf(dir, files) {
  const absolute = files.map((f) => path.join(dir, f))
  const results = await readTokens(absolute)
  return new Map(files.map((f, i) => [f, results[absolute[i]]]))
}
