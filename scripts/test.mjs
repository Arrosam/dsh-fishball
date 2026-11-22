#!/usr/bin/env node
/**
 * Day-to-day tests: one package's own tests on the current DSH (docs/testing/README.md).
 *
 *   node scripts/test.mjs <package> [--file=<entry>]… [--list] [--serial] [--against=<git-ref>] [-- <node --test args>]
 *
 * <package> is a package name (fishball-core, fishball-ui, fishball-heartbeat, …) or its folder.
 * The independence rule is checked first; a violation stops the run.
 * --file=<entry> runs only that entry file of the package (its name, e.g. `link` or `link.test.mjs`,
 * or a path under tests/); repeat it for several. Without it every entry file of the package runs.
 * --against=<ref> runs this package's tests (as they are now) on the package code at <ref>, in a
 * throwaway git worktree: the regression technique, a new case shown to fail on the old code.
 * There is deliberately no "all packages" mode: the release run is scripts/test-release.mjs.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { checkPackage, formatProblems } from '../packages/test-helpers/boundaries.mjs'
import { DSH_VERSION } from '../packages/test-helpers/dsh.mjs'
import { REPO, packageByName, packageOf, packages, testFiles } from '../packages/test-helpers/packages.mjs'
import { linkWorkspaces, runFiles } from '../packages/test-helpers/runner.mjs'

const CLI = Object.freeze({ testSuffix: '.test.mjs', separator: '--', worktreePrefix: 'fbtest-against-', helpers: 'packages/test-helpers', tests: 'tests', modules: 'node_modules' })

function parse(argv) {
  const end = argv.indexOf(CLI.separator)
  const own = end === -1 ? argv : argv.slice(0, end)
  const rest = end === -1 ? [] : argv.slice(end + 1)
  const { values, positionals } = parseArgs({ args: own, allowPositionals: true, options: { list: { type: 'boolean' }, serial: { type: 'boolean' }, against: { type: 'string' }, file: { type: 'string', multiple: true } } })
  if (positionals.length !== 1) throw new Error('name one package: node scripts/test.mjs <package>; known: ' + [...packages().keys()].join(' '))
  return { ...values, target: positionals[0], rest }
}

function resolvePackage(target) {
  if (packages().has(target)) return packageByName(target)
  const byFolder = packageOf(path.resolve(REPO, target))
  if (byFolder && byFolder.abs === path.resolve(REPO, target)) return byFolder
  return packageByName(target)
}

/** The entry files `wanted` names (by base name with or without the suffix, or by path); all when none. */
function pickFiles(files, wanted) {
  if (!wanted?.length) return files
  const name = (w) => (w.endsWith(CLI.testSuffix) ? w : w + CLI.testSuffix)
  const picked = wanted.map((w) => { const hit = files.filter((f) => f.endsWith('/' + name(w))); if (hit.length !== 1) throw new Error(`--file=${w} matches ${hit.length} entry files; entries: ${files.map((f) => path.basename(f)).join(' ')}`); return hit[0] })
  return [...new Set(picked)]
}

/** A detached worktree of `ref` holding today's tests of `pkg` and today's helpers; removed by the caller. */
function againstCheckout(ref, pkg) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), CLI.worktreePrefix))
  execFileSync('git', ['worktree', 'add', '--detach', dir, ref], { cwd: REPO, stdio: 'ignore' })
  const copy = (rel) => { fs.rmSync(path.join(dir, rel), { recursive: true, force: true }); fs.cpSync(path.join(REPO, rel), path.join(dir, rel), { recursive: true }) }
  copy(path.join(pkg.dir, CLI.tests))
  copy(CLI.helpers)
  linkCheckoutModules(dir)
  return dir
}

/**
 * The old checkout's own node_modules: its workspace packages by name point into it (so
 * `fishball-shared` is the old one too), every third-party entry is shared from this checkout's
 * node_modules (nothing is installed).
 */
function linkCheckoutModules(dir) {
  const own = path.join(dir, CLI.modules)
  fs.mkdirSync(own, { recursive: true })
  const names = new Set(packages().keys())
  for (const pkg of packages().values()) {
    const target = path.join(own, pkg.name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (fs.existsSync(path.join(dir, pkg.dir))) fs.symlinkSync(path.join(dir, pkg.dir), target)
  }
  const shared = path.join(REPO, CLI.modules)
  if (!fs.existsSync(shared)) return
  for (const entry of fs.readdirSync(shared)) {
    const scoped = entry.startsWith('@') ? fs.readdirSync(path.join(shared, entry)).map((inner) => entry + '/' + inner) : [entry]
    for (const name of scoped) {
      if (names.has(name) || fs.existsSync(path.join(own, name))) continue
      fs.mkdirSync(path.dirname(path.join(own, name)), { recursive: true })
      fs.symlinkSync(fs.realpathSync(path.join(shared, name)), path.join(own, name))
    }
  }
}

async function main(argv) {
  const opts = parse(argv)
  const pkg = resolvePackage(opts.target)
  const files = pickFiles(testFiles(pkg), opts.file)
  console.log(`${pkg.name} (${pkg.dir}): ${files.length} test file(s) on DSH ${DSH_VERSION}`)
  const problems = checkPackage(pkg)
  if (problems.length) { console.error(`${pkg.name}'s tests break the independence rule (docs/testing/README.md):\n${formatProblems(problems)}`); return 1 }
  if (opts.list) { for (const f of files) console.log('  ' + f); return 0 }
  if (files.length === 0) { console.log('nothing to run'); return 0 }
  const concurrency = opts.serial ? 1 : undefined
  if (!opts.against) {
    linkWorkspaces()
    return runFiles(files.map((f) => path.join(REPO, f)), DSH_VERSION, { concurrency, args: opts.rest })
  }
  const dir = againstCheckout(opts.against, pkg)
  console.log(`against ${opts.against}: ${pkg.name}'s current tests on the package code at that ref (${dir})`)
  try {
    return await runFiles(files.map((f) => path.join(dir, f)), DSH_VERSION, { cwd: dir, concurrency, args: opts.rest })
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO, stdio: 'ignore' })
  }
}

process.exitCode = await main(process.argv.slice(2)).catch((error) => { console.error(error.message); return 1 })