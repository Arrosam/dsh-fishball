import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CLI = Object.freeze({ worktreePrefix: 'fbtest-against-', tests: 'tests', modules: 'node_modules' })

/**
 * A throwaway copy of this checkout's packages (tests and helpers as they are now) in which the
 * package under test's own files, except its tests, are replaced by their state at `ref` (git
 * archive of that folder; a nested package's folder is left as it is now). node_modules links point
 * into the copy, so a package imported by name is today's, and the old package is the one under test.
 */
export function againstCheckout(ref, pkg, entries) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), CLI.worktreePrefix))
  const root = path.join(dir, 'repo')
  try {
    return { dir, root: prepareCheckout(ref, pkg, entries, root, dir) }
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true })
    throw error
  }
}

function prepareCheckout(ref, pkg, entries, root, dir) {
  const sourceRoot = pkg.root
  for (const current of entries) {
    if (current.dir === '.' || entries.some((entry) => entry.dir !== '.' && entry.excludes.includes(current.abs))) continue
    fs.cpSync(current.abs, path.join(root, current.dir), { recursive: true, filter: (src) => path.basename(src) !== CLI.modules })
  }
  for (const entry of ['package.json', 'scripts', 'dsh-fishball/package.json']) fs.cpSync(path.join(sourceRoot, entry), path.join(root, entry), { recursive: true })
  const own = path.join(root, pkg.dir)
  const keep = new Set([CLI.tests, ...pkg.excludes.map((x) => path.relative(pkg.abs, x).split(path.sep)[0])])
  for (const entry of fs.readdirSync(own)) if (!keep.has(entry)) fs.rmSync(path.join(own, entry), { recursive: true, force: true })
  const archive = path.join(dir, 'old.tar')
  // Pre-move Fishball refs still use the original package directories.
  const current = pkg.dir
  const former = current.startsWith('dsh-fishball/') ? current.slice('dsh-fishball/'.length) : path.join('packages', pkg.name)
  const gitOptions = { cwd: sourceRoot, stdio: ['ignore', 'ignore', 'pipe'] }
  let archived = current
  try {
    execFileSync('git', ['cat-file', '-e', ref + ':' + current + '/package.json'], gitOptions)
  } catch { archived = former }
  try {
    execFileSync('git', ['archive', '--format=tar', '-o', archive, ref, '--', archived], gitOptions)
  } catch (error) { throw new Error(`${pkg.dir} does not exist at ${ref} (${String(error.stderr ?? error.message).trim()})`) }
  const old = path.join(dir, 'old')
  fs.mkdirSync(old)
  execFileSync('tar', ['-xf', archive, '-C', old])
  const oldPkg = path.join(old, archived)
  for (const entry of fs.readdirSync(oldPkg)) if (!keep.has(entry)) fs.cpSync(path.join(oldPkg, entry), path.join(own, entry), { recursive: true })
  linkCheckoutModules(root, sourceRoot, entries)
  return root
}

/**
 * The copy's own node_modules: every package of this repository by name, pointing into the copy;
 * every third-party entry shared from this checkout's node_modules (nothing is installed).
 */
function linkCheckoutModules(root, sourceRoot, entries) {
  const own = path.join(root, CLI.modules)
  fs.mkdirSync(own, { recursive: true })
  const names = new Set(entries.map((p) => p.name))
  for (const pkg of entries.filter((p) => p.dir !== '.')) {
    const target = path.join(own, pkg.name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.symlinkSync(path.join(root, pkg.dir), target)
  }
  const shared = path.join(sourceRoot, CLI.modules)
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
