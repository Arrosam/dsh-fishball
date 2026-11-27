import fs from 'node:fs'
import path from 'node:path'
import { ROOT, MANIFEST, owner, workspaces } from './test-workspaces.mjs'
import { runWorker } from './test.mjs'

// Old component entries accepted a package directory (or npm's cwd), then node:test arguments.
export function legacyPackage(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv]
  const list = args.includes('--list')
  const dir = args[0] && !args[0].startsWith('-') && fs.existsSync(path.resolve(args[0], MANIFEST)) ? path.resolve(args.shift()) : process.cwd()
  const catalog = workspaces(ROOT)
  const pkg = owner(catalog, dir)
  if (!pkg || pkg.dir === '.') throw new Error('Name one workspace directory')
  const paths = dir === pkg.abs ? [] : [dir]
  const flags = args.filter((arg) => {
    if (arg === '--list') return false
    if (arg.startsWith('-') || !fs.existsSync(path.resolve(dir, arg))) return true
    paths.push(path.resolve(dir, arg))
    return false
  })
  return runWorker(pkg, catalog, { paths, args: flags, list })
}
