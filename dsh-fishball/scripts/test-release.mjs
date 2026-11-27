#!/usr/bin/env node
/**
 * Release tests: every package's own tests and every integration package, all in parallel, over the
 * DSH release matrix (docs/testing/README.md "The release matrix").
 *
 *   node scripts/test-release.mjs [--dsh=matrix|current|<v>[,<v>…]] [--only=<package>[,…]] [--list]
 *
 * One worker per package and one per integration package start at once. A worker runs its package's
 * tests once per DSH version of the matrix, one version after another, each in a fresh isolated
 * environment (fishball-test-helpers/runner); inside one run its files go one at a time, so the
 * workers' parallelism is the only one and a booted DSH never competes with a sibling file of the same
 * package. The independence check of every package runs first; a violation stops the release run.
 * No per-package time limit (the user's rule). Logs: .runtime/test-release/<stamp>/<worker>.<dsh>.log.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { checkPackage, formatProblems } from '../packages/test-helpers/boundaries.mjs'
import { DSH_VERSION, RELEASE_MATRIX, isInstalled } from '../packages/test-helpers/dsh.mjs'
import { REPO, packageByName, packages, testFiles } from '../packages/test-helpers/packages.mjs'
import { linkWorkspaces, runFiles } from '../packages/test-helpers/runner.mjs'

const RELEASE = Object.freeze({
  logs: path.join('.runtime', 'test-release'), separator: ',', matrix: 'matrix', current: 'current',
  /** Files at once inside one worker's run: one, so the parallel workers are the run's only concurrency. */
  filesPerWorker: 1,
  summary: Object.freeze({ pass: /^ℹ pass (\d+)/m, fail: /^ℹ fail (\d+)/m, tests: /^ℹ tests (\d+)/m }),
})

function parse(argv) {
  const { values } = parseArgs({ args: argv, options: { dsh: { type: 'string', default: RELEASE.matrix }, only: { type: 'string' }, list: { type: 'boolean' } } })
  const versions = values.dsh === RELEASE.matrix ? [...RELEASE_MATRIX] : values.dsh === RELEASE.current ? [DSH_VERSION] : values.dsh.split(RELEASE.separator)
  for (const v of versions) if (!isInstalled(v)) throw new Error('DSH ' + v + ' is not installed')
  const all = [...packages().values()].filter((p) => testFiles(p).length > 0)
  const workers = values.only ? values.only.split(RELEASE.separator).map(packageByName) : all
  return { versions, workers, list: values.list }
}

/** One worker: its package on every version in turn; resolves to one result per version. */
async function worker(pkg, versions, dir) {
  const results = []
  for (const version of versions) {
    const log = path.join(dir, `${pkg.name}.${version}.log`)
    const out = fs.openSync(log, 'w')
    const started = Date.now()
    let status
    try {
      status = await runFiles(testFiles(pkg).map((f) => path.join(REPO, f)), version, { concurrency: RELEASE.filesPerWorker, stdio: ['ignore', out, out] })
    } finally { fs.closeSync(out) }
    const text = fs.readFileSync(log, 'utf8')
    const count = (re) => Number(re.exec(text)?.[1] ?? NaN)
    results.push({ pkg: pkg.name, version, status, tests: count(RELEASE.summary.tests), pass: count(RELEASE.summary.pass), fail: count(RELEASE.summary.fail), seconds: Math.round((Date.now() - started) / 1000), log: path.relative(REPO, log) })
    console.log(`  ${status === 0 ? 'ok  ' : 'FAIL'} ${pkg.name} on DSH ${version}: ${results.at(-1).pass}/${results.at(-1).tests} in ${results.at(-1).seconds} s`)
  }
  return results
}

async function main(argv) {
  const { versions, workers, list } = parse(argv)
  console.log(`release run: ${workers.length} worker(s) in parallel × DSH ${versions.join(', ')}`)
  const problems = workers.flatMap(checkPackage)
  if (problems.length) { console.error('the independence rule is broken (docs/testing/README.md):\n' + formatProblems(problems)); return 1 }
  if (list) { for (const p of workers) console.log(`  ${p.name}${p.integration ? ' (integration)' : ''}: ${testFiles(p).length} file(s)`); return 0 }
  linkWorkspaces()
  const dir = path.join(REPO, RELEASE.logs, new Date().toISOString().replace(/[:.]/g, '-'))
  fs.mkdirSync(dir, { recursive: true })
  const results = (await Promise.all(workers.map((p) => worker(p, versions, dir)))).flat()
  console.log('\n| package | DSH | tests | pass | fail | seconds | log |\n|---|---|---|---|---|---|---|')
  for (const r of results) console.log(`| ${r.pkg} | ${r.version} | ${r.tests} | ${r.pass} | ${r.fail} | ${r.seconds} | ${r.log} |`)
  const failed = results.filter((r) => r.status !== 0)
  console.log(failed.length ? `\n${failed.length} worker run(s) failed` : '\nevery worker passed')
  return failed.length ? 1 : 0
}

process.exitCode = await main(process.argv.slice(2)).catch((error) => { console.error(error.message); return 1 })
