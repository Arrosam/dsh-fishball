/**
 * The packages of this repository that have tests: their names, folders and test folders, read from
 * the root manifest's workspaces (and fishball-ui, which is a package inside fishball-core's folder).
 */
import fs from 'node:fs'
import path from 'node:path'

export const REPO = path.resolve(import.meta.dirname, '..', '..')
// Moved amenities are siblings of this component, so their workspace imports resolve at this common root.
export const WORKSPACE_ROOT = path.dirname(REPO)
const LAYOUT = Object.freeze({ manifest: 'package.json', tests: 'tests', testSuffix: '.test.mjs', wildcard: '*', integrationPrefix: 'integration-' })
/**
 * fishball-ui is its own package (own manifest, own bundle) inside fishball-core's folder, and ships
 * inside fishball-core's tarball (core's `files` lists `ui/`). npm exposes it as a root
 * workspace, while this catalogue tracks its nesting for boundary checks and test selection.
 */
const NESTED = Object.freeze([Object.freeze({ dir: 'packages/core/ui', parent: 'packages/core' })])

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const rootManifest = () => readJson(path.join(REPO, LAYOUT.manifest))

/** Workspace folders with globs expanded (`packages/integration-*`), repo-relative. */
function workspaceDirs() {
  const out = []
  for (const entry of rootManifest().workspaces ?? []) {
    if (!entry.endsWith(LAYOUT.wildcard)) { out.push(entry); continue }
    const parent = path.dirname(entry)
    const prefix = path.basename(entry).slice(0, -LAYOUT.wildcard.length)
    for (const name of fs.readdirSync(path.join(REPO, parent)).sort()) if (name.startsWith(prefix) && fs.existsSync(path.join(REPO, parent, name, LAYOUT.manifest))) out.push(path.posix.join(parent, name))
  }
  return out
}

function describe(dir, parent) {
  const manifest = readJson(path.join(REPO, dir, LAYOUT.manifest))
  const parentManifest = parent ? readJson(path.join(REPO, parent, LAYOUT.manifest)) : null
  return Object.freeze({
    name: manifest.name,
    dir,
    abs: path.join(REPO, dir),
    tests: path.join(REPO, dir, LAYOUT.tests),
    integration: path.basename(dir).startsWith(LAYOUT.integrationPrefix),
    manifest,
    /** Package names this package may use by name: its dependencies and peers (and its parent's, for a nested package). */
    uses: Object.freeze([...new Set([manifest, parentManifest].filter(Boolean).flatMap((m) => [...Object.keys(m.dependencies ?? {}), ...Object.keys(m.peerDependencies ?? {})]))]),
    /** Folders inside this package that belong to another package (fishball-core holds fishball-ui). */
    excludes: Object.freeze(NESTED.filter((n) => n.parent === dir).map((n) => path.join(REPO, n.dir))),
  })
}

let cached
/** Every package with a manifest, by name. */
export function packages() {
  cached ??= new Map([...workspaceDirs().map((d) => describe(d)), ...NESTED.map((n) => describe(n.dir, n.parent))].map((p) => [p.name, p]))
  return cached
}

export function packageByName(name) {
  const pkg = packages().get(name)
  if (!pkg) throw new Error('unknown package ' + name + '; known: ' + [...packages().keys()].join(' '))
  return pkg
}

/** The package that holds `file` (the innermost one). */
export function packageOf(file) {
  const abs = path.resolve(file)
  return [...packages().values()].filter((p) => abs === p.abs || abs.startsWith(p.abs + path.sep)).sort((a, b) => b.abs.length - a.abs.length)[0]
}

/** Every `*.test.mjs` under a package's tests folder, repo-relative and sorted. */
export function testFiles(pkg) {
  if (!fs.existsSync(pkg.tests)) return []
  return fs.readdirSync(pkg.tests, { recursive: true }).map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith(LAYOUT.testSuffix)).sort().map((f) => path.posix.join(pkg.dir, LAYOUT.tests, f))
}

/**
 * The file a package exports under `subpath` (`'.'`, `'./client'`, …), absolute: how an integration
 * package reaches another package, by its published surface only.
 */
export function exportPath(name, subpath = '.') {
  const pkg = packageByName(name)
  const target = pkg.manifest.exports?.[subpath] ?? (subpath === '.' ? pkg.manifest.main : undefined)
  if (typeof target !== 'string') throw new Error(name + ' exports no ' + subpath)
  return path.join(pkg.abs, target)
}
