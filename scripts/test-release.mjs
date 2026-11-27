#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { withWorkers } from './test-workers.mjs'
import { ROOT, suites, workspaces } from './test-workspaces.mjs'
import { family } from './test-sdk.mjs'

export async function release(argv) {
  const end = argv.indexOf('--')
  let options = end < 0 ? argv : argv.slice(0, end)
  const args = end < 0 ? [] : argv.slice(end + 1)
  // Connector and Instance historically accepted node:test flags without a separator.
  if (options.some((arg) => /^--component=dsh-(?:connector|fishball-instance)$/.test(arg))) {
    const isNodeFlag = (arg) => arg.startsWith('--test-')
    args.unshift(...options.filter(isNodeFlag))
    options = options.filter((arg) => !isNodeFlag(arg))
  }
  const { values } = parseArgs({ args: options, options: {
    component: { type: 'string' }, only: { type: 'string' }, list: { type: 'boolean' }, dsh: { type: 'string' }, matrix: { type: 'string' },
  } })
  const components = { 'dsh-fishball': 'fishball', 'dsh-connector': 'connector', 'dsh-fishball-instance': 'instance' }
  const component = Object.hasOwn(components, values.component) ? components[values.component] : undefined
  if (values.component && !component) throw new Error('Unknown component: ' + values.component)
  if (values.dsh && values.matrix) throw new Error('Use either --dsh or --matrix')
  const pick = values.dsh ?? values.matrix ?? 'matrix'
  const mode = pick === 'matrix' ? true : pick === 'current' ? false : pick.split(',')
  const catalog = workspaces(ROOT)
  let targets = catalog.filter((pkg) => !component || family(pkg, true) === component)
  if (values.only) {
    const names = new Set(values.only.split(','))
    for (const name of names) if (!targets.some((pkg) => pkg.name === name)) throw new Error('Unknown release package: ' + name)
    targets = targets.filter((pkg) => names.has(pkg.name))
  }
  if (values.list) {
    for (const pkg of targets) console.log(pkg.name + (pkg.integration ? ' (integration)' : '') + ': ' + suites(pkg).length + ' test file(s)')
    return 0
  }
  if (mode !== true && targets.some((pkg) => family(pkg) === 'instance' && suites(pkg).length)) {
    console.log('Instance suites retain their built-in SDK matrix; --dsh applies to Fishball and Connector only.')
  }
  const logs = path.join(ROOT, '.runtime', 'test-release')
  fs.mkdirSync(logs, { recursive: true })
  const out = fs.mkdtempSync(path.join(logs, new Date().toISOString().replace(/[:.]/g, '-') + '-'))
  console.log('Release: ' + targets.length + ' package workers; logs in ' + path.relative(ROOT, out))
  const { result: results, cancelled } = await withWorkers((run) => Promise.all(targets.map(async (pkg) => {
    const start = Date.now()
    const label = pkg.name.replaceAll('/', '__')
    const log = path.join(out, label + '.log')
    const fd = fs.openSync(log, 'w')
    let status
    try {
      status = await run(pkg, { release: mode, releaseRun: true, args,
        names: family(pkg) === 'connector' ? path.join(out, label + '.jsonl') : undefined }, ['ignore', fd, fd])
    } finally { fs.closeSync(fd) }
    const seconds = (Date.now() - start) / 1000
    const counts = {}
    for (const [, key, count] of fs.readFileSync(log, 'utf8').matchAll(/^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)) counts[key] = (counts[key] ?? 0) + Number(count)
    console.log((status === 0 ? 'ok   ' : 'FAIL ') + pkg.name + ': ' + (counts.tests ?? 0) + ' tests, ' + seconds + 's')
    return { name: pkg.name, status, seconds, counts, log: path.relative(ROOT, log) }
  })))
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ dsh: pick, results }, null, 2) + os.EOL)
  return cancelled || results.some((r) => r.status === 130) ? 130 : results.some((r) => r.status) ? 1 : 0
}

process.exitCode = await release(process.argv.slice(2)).catch((error) => { console.error(error.message); return 1 })
