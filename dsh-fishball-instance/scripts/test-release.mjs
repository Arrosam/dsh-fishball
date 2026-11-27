#!/usr/bin/env node
/**
 * The release check: every package's own tests and every integration package's tests, all at once,
 * one worker process per package (each in its own throwaway environment, packages/test-helpers
 * src/runner.mjs). Day to day, test one package instead (scripts/test-package.mjs).
 *
 * Each worker's output goes to .runtime/test-release/<run>/<package>.log; the summary lists every
 * package with its exit status and the totals node --test reported. Exit status 0 only when every
 * worker passed. There is no time limit.
 *
 *   node scripts/test-release.mjs [node --test flags]
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from '../packages/test-helpers/src/constants.mjs'
import { cancelOnSignal, linkWorkspaces, runPackage, testFiles, workspaceDirs } from '../packages/test-helpers/src/runner.mjs'

const OUT = Object.freeze({ dir: path.join(REPO, '.runtime', 'test-release'), suffix: '.log', totals: /^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm })
const args = process.argv.slice(2)
const targets = workspaceDirs().filter((dir) => testFiles(dir).length > 0)
const run = path.join(OUT.dir, new Date().toISOString().replace(/[:.]/g, '-'))
fs.mkdirSync(run, { recursive: true })
linkWorkspaces()

const children = new Set()
let cancelled = false
const stopHandlers = cancelOnSignal(children, () => { cancelled = true })
const label = (dir) => path.relative(REPO, dir)
console.log('release check: ' + targets.length + ' workers in parallel; logs in ' + path.relative(REPO, run))
const results = await Promise.all(targets.map(async (dir) => {
  const log = path.join(run, label(dir).replaceAll(path.sep, '__') + OUT.suffix)
  const fd = fs.openSync(log, 'w')
  try {
    const status = await runPackage(dir, args, { stdio: fd, children })
    console.log((status === 0 ? 'pass ' : 'FAIL ') + label(dir))
    return { dir, status, log }
  } finally { fs.closeSync(fd) }
}))
stopHandlers()

const totalsOf = (log) => Object.fromEntries([...fs.readFileSync(log, 'utf8').matchAll(OUT.totals)].map(([, key, value]) => [key, Number(value)]))
console.log('')
for (const { dir, status, log } of results) {
  const t = totalsOf(log)
  console.log(`${status === 0 ? 'pass' : 'FAIL'}  ${label(dir).padEnd(32)} tests ${t.tests ?? 0}  pass ${t.pass ?? 0}  fail ${t.fail ?? 0}  skipped ${t.skipped ?? 0}  todo ${t.todo ?? 0}  ${path.relative(REPO, log)}`)
}
const failed = results.filter((r) => r.status !== 0)
process.exitCode = cancelled ? 130 : failed.length > 0 ? 1 : 0
