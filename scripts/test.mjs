#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { changedPackages, git } from './test-changes.mjs'
import { withWorkers } from './test-workers.mjs'
import { checkPackage, formatProblems } from './test-independence.mjs'
import { ROOT, MANIFEST, linkWorkspaces, suites, within, workspaces } from './test-workspaces.mjs'

const OPTIONS = { changed: { type: 'boolean' }, base: { type: 'string' }, list: { type: 'boolean' }, serial: { type: 'boolean' }, against: { type: 'string' }, file: { type: 'string', multiple: true } }

function pickFiles(pkg, wanted, paths) {
  let files = suites(pkg)
  if (wanted?.length) files = [...new Set(wanted.map((name) => {
    const filename = name.endsWith('.test.mjs') ? name : name + '.test.mjs'
    const picked = files.filter((f) => f.endsWith('/' + filename))
    if (picked.length !== 1) throw new Error('--file=' + name + ' matches ' + picked.length + ' test files')
    return picked[0]
  }))]
  for (const entry of paths) {
    if (!within(pkg.abs, path.resolve(pkg.abs, entry))) throw new Error('test selection leaves ' + pkg.name + ': ' + entry)
  }
  return paths.length ? files.filter((f) => paths.some((entry) => within(path.resolve(pkg.abs, entry), f))) : files
}

export async function runPackage(pkg, catalog, opts = {}) {
  const problems = checkPackage(pkg, catalog)
  if (problems.length) throw new Error(formatProblems(problems))
  if (opts.args?.some((arg) => !arg.startsWith('-') || arg === '--')) throw new Error('Pass Node test options as --option=value and select files with --file')
  const files = pickFiles(pkg, opts.file, opts.paths ?? [])
  if (opts.list) {
    console.log(pkg.name + ': ' + files.length + ' test file(s)')
    for (const file of files) console.log('  ' + path.relative(pkg.root, file))
    return 0
  }
  if (!files.length) { console.log(pkg.name + ': no test files'); return 0 }
  const { family, profiles } = await import('./test-sdk.mjs')
  const { runFiles } = await import('./test-execution.mjs')
  const kind = family(pkg, opts.releaseRun)
  const sdkProfiles = await profiles(pkg, opts.release)
  linkWorkspaces(catalog)
  let copy
  try {
    if (opts.against) {
      if (kind !== 'fishball') throw new Error('--against is supported for Fishball component packages only')
      const ref = git(pkg.root, ['rev-parse', '--verify', '--end-of-options', opts.against + '^{commit}']).trim()
      const { againstCheckout } = await import('./test-against.mjs')
      copy = againstCheckout(ref, pkg, catalog)
    }
    const rebase = (file) => copy ? path.join(copy.root, path.relative(pkg.root, file)) : file
    const cwd = rebase(kind === 'fishball' ? path.join(pkg.root, 'dsh-fishball') : pkg.abs)
    let status = 0
    for (const { label, env } of sdkProfiles) {
      console.log(pkg.name + ': ' + files.length + ' test file(s)' + (label ? ' on DSH ' + label : ''))
      const result = await runFiles(files.map(rebase), env, { cwd, args: opts.args, stdio: opts.stdio, omitDshHome: kind === 'instance',
        concurrency: opts.serial || opts.releaseRun && kind === 'fishball' ? 1 : kind === 'plain' ? undefined : 3,
        names: opts.names ?? (kind === 'connector' && process.env.DSH_TEST_NAMES ? path.resolve(cwd, process.env.DSH_TEST_NAMES) : undefined) })
      if (result === 130) return result
      status ||= result
    }
    return status
  } finally {
    if (copy) fs.rmSync(copy.dir, { recursive: true, force: true })
  }
}

export async function runWorker(pkg, catalog, opts) {
  try { return await runPackage(pkg, catalog, opts) }
  catch (error) { console.error(pkg.name + ': ' + error.message); return 1 }
}

export async function main(argv, root = !within(ROOT, process.cwd()) && fs.existsSync(path.resolve(MANIFEST)) ? process.cwd() : ROOT) {
  const end = argv.indexOf('--')
  const { values, positionals } = parseArgs({ args: end < 0 ? argv : argv.slice(0, end), allowPositionals: true, options: OPTIONS })
  const args = end < 0 ? [] : argv.slice(end + 1)
  const catalog = workspaces(root)
  if (values.changed) {
    if (positionals.length || args.length || values.serial || values.against !== undefined || values.file) throw new Error('Usage: node scripts/test.mjs --changed [--base <ref>] [--list]')
    const selected = changedPackages(root, catalog, values.base)
    if (values.list) { for (const pkg of selected) console.log(pkg.name); return 0 }
    if (!selected.length) { console.log('No changed package tests selected'); return 0 }
    console.log('Testing changed packages: ' + selected.map((pkg) => pkg.name).join(', '))
    if (process.env.DSH_TEST_NAMES) throw new Error('DSH_TEST_NAMES requires a single package run')
    const { result: results, cancelled } = await withWorkers((run) => Promise.all(selected.map((pkg) => run(pkg, {}))))
    return cancelled || results.includes(130) ? 130 : results.some(Boolean) ? 1 : 0
  }
  if (values.base !== undefined || positionals.length !== 1) throw new Error('Usage: node scripts/test.mjs <package> [--list] [--file=<entry>] [-- <node --test flags>]')
  const target = positionals[0]
  const pkg = catalog.find((p) => p.name === target || p.abs === path.resolve(root, target))
  if (!pkg) throw new Error('Unknown package: ' + target)
  return runWorker(pkg, catalog, { ...values, args })
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) process.exitCode = await main(process.argv.slice(2)).catch((error) => { console.error(error.message); return 1 })
