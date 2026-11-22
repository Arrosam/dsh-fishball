/**
 * Worker for the static checks: the names and string values one JS file holds.
 *
 * Runs with `--expose-internals` (WORKER.execArgv) for Node's built-in acorn (acorn.mjs).
 * Input (workerData): { files: string[] (absolute) }.
 * Output (one message): { results: { [file]: { error?: string, names: string[], strings: string[] } } }
 * where `names` are identifiers and `strings` are string literals and template parts.
 */
import fs from 'node:fs'
import { parentPort, workerData } from 'node:worker_threads'
import { tokens } from './acorn.mjs'

const LABEL = Object.freeze({ name: 'name', string: 'string', template: 'template', privateId: 'privateId' })

const results = {}
for (const file of workerData.files) {
  try {
    const names = new Set()
    const strings = new Set()
    for (const token of tokens(fs.readFileSync(file, 'utf8'))) {
      const label = token.type.label
      if (label === LABEL.name || label === LABEL.privateId) names.add(token.value)
      else if ((label === LABEL.string || label === LABEL.template) && typeof token.value === 'string') strings.add(token.value)
    }
    results[file] = { names: [...names], strings: [...strings] }
  } catch (error) {
    results[file] = { error: error.message, names: [], strings: [] }
  }
}
parentPort.postMessage({ results })