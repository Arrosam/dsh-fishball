import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bareName, specifiers, stripComments } from './module-specifiers.mjs'

const POLICY = Object.freeze({
  fishball: Object.freeze(['amenities/board', 'amenities/heartbeat', 'amenities/taskboard', 'amenities/consultant']),
  connector: Object.freeze(['dsh-connector/packages/dsh-connector-adapter', 'amenities/watchdog']),
  bundles: Object.freeze(['amenities/fishball-amenities', 'amenities/connector-amenities']),
  environment: Object.freeze({ fishball: ['fishball-core', 'fishball-shared', 'fishball-ui', 'fishball-page', 'fishball-child-plugins', 'fishball-recommend-plugins'], connector: ['dsh-agent-connector', 'dsh-connector-shared'] }),
  manifest: 'package.json', installed: 'node_modules',
  dependencies: Object.freeze(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']),
  bundled: Object.freeze(['bundleDependencies', 'bundledDependencies']),
  npmAlias: /^npm:(@[^/]+\/[^@]+|[^@]+)(?:@.*)?$/,
  localDependency: /^(?:file|link|workspace):(?=\.|\/)/,
  source: /\.[cm]?[jt]sx?$/,
})

function* sourceFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === POLICY.installed || entry.name.startsWith('.')) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* sourceFiles(file)
    else if (entry.isFile() && POLICY.source.test(file)) yield file
  }
}

/** One-way boundary: packages in an umbrella must work without each other or the umbrella. */
export function checkAmenity(root, directory) {
  const relative = path.relative(root, directory).split(path.sep).join('/')
  const side = ['fishball', 'connector'].find((key) => POLICY[key].includes(relative))
  if (!side) return []
  const forbiddenDirectories = [...POLICY.fishball, ...POLICY.connector, ...POLICY.bundles].filter((dir) => dir !== relative)
  const forbiddenNames = new Set(Object.entries(POLICY.environment).flatMap(([key, names]) => key === side ? [] : names))
  for (const dir of forbiddenDirectories) {
    const file = path.join(root, dir, POLICY.manifest)
    if (fs.existsSync(file)) forbiddenNames.add(JSON.parse(fs.readFileSync(file, 'utf8')).name)
  }
  const manifestFile = path.join(directory, POLICY.manifest)
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const problems = []
  const checkName = (name) => forbiddenNames.has(name)
  const leaves = (base, target) => {
    const rel = path.relative(base, target)
    return rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)
  }
  const checkPath = (from, specifier) => {
    const target = specifier.startsWith('file://') ? fileURLToPath(specifier) : path.resolve(from, specifier)
    if (leaves(directory, target)) return true
    // A checked-in symlink is still a package crossing when its real destination is outside.
    return fs.existsSync(target) && leaves(fs.realpathSync(directory), fs.realpathSync(target))
  }
  const report = (file, line, text) => problems.push({ file: path.relative(root, file), line, text, why: manifest.name + ' may only use its own environment, not other amenities or their bundles' })
  for (const field of POLICY.dependencies) {
    for (const [name, value] of Object.entries(manifest[field] ?? {})) {
      const alias = POLICY.npmAlias.exec(value)?.[1]
      const local = POLICY.localDependency.exec(value)?.[0]
      if (checkName(name) || checkName(alias) || (local && checkPath(directory, value.slice(local.length)))) report(manifestFile, 1, field + ': ' + name + ' = ' + value)
    }
  }
  for (const field of POLICY.bundled) {
    if (!Array.isArray(manifest[field])) continue
    for (const name of manifest[field]) if (checkName(name)) report(manifestFile, 1, field + ': ' + name)
  }
  for (const file of sourceFiles(directory)) {
    const code = stripComments(fs.readFileSync(file, 'utf8'))
    for (const match of specifiers(code, { commonJS: true })) {
      const specifier = match[2]
      const local = specifier.startsWith('.') || path.isAbsolute(specifier) || specifier.startsWith('file:')
      if (local ? checkPath(path.dirname(file), specifier) : checkName(bareName(specifier))) report(file, code.slice(0, match.index).split('\n').length, specifier)
    }
  }
  return problems
}
