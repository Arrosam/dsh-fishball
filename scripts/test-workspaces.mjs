import fs from 'node:fs'
import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '..')
export const MANIFEST = 'package.json'
const TESTS = 'tests'
const MODULES = 'node_modules'
const SUITE = '.test.mjs'
const DEPENDENCIES = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
const HELPERS = new Set(['fishball-test-helpers', 'dsh-connector-test-helpers', '@dsh-instance/test-helpers'])
const RELEASE_PATH = /(?:^|\/)integration\/[^/]+$|(?:^|\/)packages\/integration-[^/]+$/
export const within = (dir, file) => file === dir || file.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep)
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

function expand(root, patterns) {
  return patterns.flatMap((entry) => {
    if (!entry.endsWith('*')) return [entry]
    const folder = path.dirname(entry)
    const prefix = path.basename(entry).slice(0, -1)
    const absolute = path.join(root, folder)
    return fs.existsSync(absolute) ? fs.readdirSync(absolute).filter((name) => name.startsWith(prefix)).map((name) => path.join(folder, name)) : []
  }).filter((dir) => fs.existsSync(path.join(root, dir, MANIFEST)))
}

export function workspaces(root) {
  const manifest = readJson(path.join(root, MANIFEST))
  const dirs = ['.', ...new Set(expand(root, manifest.workspaces ?? []).map((dir) => path.normalize(dir)))]
  return dirs.map((dir) => {
    const abs = path.join(root, dir)
    const own = dir === '.' ? manifest : readJson(path.join(abs, MANIFEST))
    return { root, dir, abs, name: own.name, manifest: own, integration: RELEASE_PATH.test(dir), helper: HELPERS.has(own.name),
      uses: new Set(DEPENDENCIES.flatMap((field) => Object.keys(own[field] ?? {}))),
      excludes: dirs.map((d) => path.join(root, d)).filter((d) => d !== abs && within(abs, d)) }
  })
}

export function owner(catalog, file) {
  return catalog.filter((pkg) => within(pkg.abs, file)).sort((a, b) => b.abs.length - a.abs.length)[0]
}

// Connector ships a non-workspace UI with its own tests. Real nested workspaces never belong to a parent run.
export function testTree(pkg, includeHelperSource = false) {
  const walked = []
  const walk = (dir, inTests) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === MODULES || entry.name.startsWith('.')) continue
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!pkg.excludes.includes(file)) walk(file, inTests || entry.name === TESTS)
      } else if (inTests || includeHelperSource) walked.push(file)
    }
  }
  if (pkg.dir === '.') walk(path.join(pkg.abs, TESTS), true)
  else walk(pkg.abs, false)
  return walked.sort()
}

export const suites = (pkg) => testTree(pkg).filter((file) => file.endsWith(SUITE))

export function linkWorkspaces(catalog) {
  for (const pkg of catalog) {
    if (pkg.dir === '.') continue
    const target = path.join(pkg.root, MODULES, pkg.name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    try { fs.symlinkSync(pkg.abs, target) } catch (error) {
      // A link into another checkout would run the wrong code (possibly the live staging checkout).
      if (error.code !== 'EEXIST') throw error
      if (fs.realpathSync(target) !== fs.realpathSync(pkg.abs)) throw new Error('unexpected workspace link: ' + target)
    }
  }
}
