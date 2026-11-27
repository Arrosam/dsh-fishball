#!/usr/bin/env node
/**
 * The pre-release test run: every package and every integration package, in parallel (one worker
 * each), on every DSH version of the release matrix. Day-to-day runs never use this script; they
 * run one package on the current DSH (npm test --workspace <name>).
 *
 *   npm run test:release [-- --matrix=0.2.1-rc.5,0.2.2-rc.3] [-- --only=<npm name>,...] [-- <node --test args>]
 *
 * Each worker's output goes to .runtime/test-release/<run>/<name>.log, and one JSON line per case to
 * <name>.jsonl. A summary table is printed at the end. Exits 1 if any worker failed. No worker has
 * a time limit.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { RELEASE_MATRIX } from '../packages/dsh-connector-test-helpers/src/constants.mjs'
import { linkWorkspaces, workspaceDirs } from '../packages/dsh-connector-test-helpers/src/runner/links.mjs'
import { suiteFiles } from '../packages/dsh-connector-test-helpers/src/runner/run.mjs'

const REPO = path.resolve(import.meta.dirname, '..')
const CLI = path.join(REPO, 'packages', 'dsh-connector-test-helpers', 'src', 'runner', 'cli.mjs')
const OUT_ROOT = path.join(REPO, '.runtime', 'test-release')
const FLAG = Object.freeze({ matrix: '--matrix=', only: '--only=' })

const argv = process.argv.slice(2)
const pick = (prefix) => argv.find((a) => a.startsWith(prefix))?.slice(prefix.length)
const passThrough = argv.filter((a) => !Object.values(FLAG).some((p) => a.startsWith(p)))
const matrix = (pick(FLAG.matrix) ?? RELEASE_MATRIX.join(',')).split(',').filter(Boolean)
const only = pick(FLAG.only)?.split(',').filter(Boolean)

linkWorkspaces()
const workers = workspaceDirs()
  .map((dir) => ({ dir, name: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name }))
  .filter((w) => suiteFiles(w.dir).length > 0 && (!only || only.includes(w.name)))
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const out = path.join(OUT_ROOT, runId)
fs.mkdirSync(out, { recursive: true })
console.log(`test:release: ${workers.length} workers in parallel, DSH ${matrix.join(', ')}; logs in ${path.relative(REPO, out)}`)

const children = new Set()
const stop = (signal) => { for (const c of children) try { process.kill(-c.pid, signal) } catch {} }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(signal); process.exitCode = 130 })

function runWorker(w) {
  const started = Date.now()
  const log = fs.openSync(path.join(out, w.name + '.log'), 'w')
  const names = path.join(out, w.name + '.jsonl')
  const child = spawn(process.execPath, [CLI, w.dir, ...passThrough], {
    cwd: w.dir, stdio: ['ignore', log, log], detached: true,
    env: { ...process.env, DSH_TEST_MATRIX: matrix.join(','), DSH_TEST_NAMES: names },
  })
  children.add(child)
  return new Promise((resolve) => child.on('close', (status) => {
    children.delete(child)
    fs.closeSync(log)
    const counts = { pass: 0, fail: 0, skip: 0, todo: 0 }
    if (fs.existsSync(names)) for (const line of fs.readFileSync(names, 'utf8').split('\n').filter(Boolean)) counts[JSON.parse(line).status]++
    const seconds = Math.round((Date.now() - started) / 1000)
    console.log(`  ${status === 0 ? 'ok  ' : 'FAIL'} ${w.name} (${seconds}s): ${counts.pass} pass, ${counts.fail} fail, ${counts.skip} skipped, ${counts.todo} todo`)
    resolve({ ...w, status: status ?? 1, counts, seconds })
  }))
}

const results = await Promise.all(workers.map(runWorker))
const failed = results.filter((r) => r.status !== 0)
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ matrix, results: results.map(({ dir, ...r }) => ({ ...r, dir: path.relative(REPO, dir) })) }, null, 2))
console.log(failed.length ? `test:release: ${failed.length} of ${results.length} workers failed: ${failed.map((f) => f.name).join(', ')}` : `test:release: all ${results.length} workers passed`)
process.exitCode = failed.length ? 1 : process.exitCode
