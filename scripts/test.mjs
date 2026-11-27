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
 * --against=<ref> runs this package's tests (as they are now) on the package's own code at <ref>: the
 * regression technique, a new case shown to fail on the old code. Only the package under test is old;
 * every other package (its dependencies, fishball-test-helpers) is today's, so today's tests load
 * whatever the package's code was at <ref>. The old code comes from a throwaway git worktree; its
 * package folder is put in place of today's for the run, inside a throwaway copy of this checkout.
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

const CLI = Object.freeze({ testSuffix: '.test.mjs', copied: Object.freeze(['package.json', 'packages', 'scripts']), separator: '--', worktreePrefix: 'fbtest-against-', helpers: 'packages/test-helpers', tests: 'tests', modules: 'node_modules' })

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

/**
 * A throwaway copy of this checkout's packages (tests and helpers as they are now) in which the
 * package under test's own files, except its tests, are replaced by their state at `ref` (git
 * archive of that folder; a nested package's folder is left as it is now). node_modules links point
 * into the copy, so a package imported by name is today's, and the old package is the one under test.
 */
function againstCheckout(ref, pkg) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), CLI.worktreePrefix))
  const root = path.join(dir, 'repo')
  fs.mkdirSync(root)
  for (const entry of CLI.copied) fs.cpSync(path.join(REPO, entry), path.join(root, entry), { recursive: true, filter: (src) => !src.includes(path.sep + CLI.modules) })
  const own = path.join(root, pkg.dir)
  const keep = new Set([CLI.tests, ...pkg.excludes.map((x) => path.relative(pkg.abs, x).split(path.sep)[0])])
  for (const entry of fs.readdirSync(own)) if (!keep.has(entry)) fs.rmSync(path.join(own, entry), { recursive: true, force: true })
  const archive = path.join(dir, 'old.tar')
  try {
    execFileSync('git', ['archive', '--format=tar', '-o', archive, ref, '--', pkg.dir], { cwd: REPO, stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (error) { throw new Error(`${pkg.dir} does not exist at ${ref} (${String(error.stderr ?? error.message).trim()})`) }
  const old = path.join(dir, 'old')
  fs.mkdirSync(old)
  execFileSync('tar', ['-xf', archive, '-C', old])
  const oldPkg = path.join(old, pkg.dir)
  for (const entry of fs.readdirSync(oldPkg)) if (!keep.has(entry)) fs.cpSync(path.join(oldPkg, entry), path.join(own, entry), { recursive: true })
  linkCheckoutModules(root)
  return { dir, root }
}

/**
 * The copy's own node_modules: every package of this repository by name, pointing into the copy;
 * every third-party entry shared from this checkout's node_modules (nothing is installed).
 */
function linkCheckoutModules(root) {
  const own = path.join(root, CLI.modules)
  fs.mkdirSync(own, { recursive: true })
  const names = new Set(packages().keys())
  for (const pkg of packages().values()) {
    const target = path.join(own, pkg.name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.symlinkSync(path.join(root, pkg.dir), target)
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
  const { dir, root } = againstCheckout(opts.against, pkg)
  console.log(`against ${opts.against}: ${pkg.name}'s current tests on its own code at that ref, every other package as it is now (${root})`)
  try {
    return await runFiles(files.map((f) => path.join(root, f)), DSH_VERSION, { cwd: root, concurrency, args: opts.rest })
  } finally {
    // Only the private mkdtemp folder this run made.
    if (path.basename(dir).startsWith(CLI.worktreePrefix)) fs.rmSync(dir, { recursive: true, force: true })
  }
}

process.exitCode = await main(process.argv.slice(2)).catch((error) => { console.error(error.message); return 1 })