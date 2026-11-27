import fs from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkAmenity } from './amenity-boundaries.mjs'
import { bareName, specifiers, stripComments } from './module-specifiers.mjs'
import { owner, testTree } from './test-workspaces.mjs'

const SOURCE = /\.[cm]?[jt]sx?$/
const FILE_URL = /\bnew\s+URL\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/g
const LITERAL = /(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g
// The old checker remains solely for its historical decision-table tests.
const LEGACY_CHECKER = 'dsh-fishball/packages/test-helpers/boundaries.mjs'
const LEGACY_POLICY = new Set(['../../../scripts/module-specifiers.mjs', '../../../scripts/amenity-boundaries.mjs'])
const REPOSITORY_METADATA = 'dsh-fishball-instance/integration/release/tests/pack.test.mjs'
const REPO_PATH = /(?:^|[\/\s])(?:packages|amenities|integration)\/[\w./-]+/

function checkSource(pkg, catalog, file) {
  const code = stripComments(fs.readFileSync(file, 'utf8'))
  const problems = []
  const report = (index, text, why) => problems.push({ file: path.relative(pkg.root, file), line: code.slice(0, index).split('\n').length, text, why })
  const ownPath = (index, spec) => {
    const filePath = spec.startsWith('file:') ? fileURLToPath(spec) : path.resolve(path.dirname(file), spec)
    const resolved = fs.existsSync(filePath) ? fs.realpathSync(filePath) : filePath
    if (owner(catalog, filePath) !== pkg || owner(catalog, resolved) !== pkg) report(index, spec, 'leaves ' + pkg.name + "'s folder; use a declared package name")
  }
  for (const match of specifiers(code, { commonJS: true })) {
    const spec = match[2]
    if (path.relative(pkg.root, file) === LEGACY_CHECKER && LEGACY_POLICY.has(spec)) continue
    if (spec.startsWith('.') || path.isAbsolute(spec) || spec.startsWith('file:')) ownPath(match.index, spec)
    else if (!isBuiltin(spec) && bareName(spec) !== pkg.name && !pkg.uses.has(bareName(spec))) report(match.index, spec, 'not declared by ' + pkg.name)
  }
  for (const match of code.matchAll(FILE_URL)) ownPath(match.index, match[2])
  // Shared fixtures and runner self-tests describe checkout layouts, but their imports are checked above.
  if (pkg.helper || pkg.dir === '.') return problems
  for (const match of code.matchAll(LITERAL)) {
    const text = match[2]
    if (!REPO_PATH.test(text)) continue
    if (path.relative(pkg.root, file) === REPOSITORY_METADATA && text === 'dsh-fishball-instance/packages/dsh-instance' && /\bdirectory:\s*$/.test(code.slice(0, match.index))) continue
    const relative = text.replace(/^\.\//, '')
    const component = pkg.dir.startsWith('amenities/') ? 'dsh-fishball' : pkg.dir.split('/')[0]
    const direct = owner(catalog, path.resolve(pkg.root, relative))
    const target = direct?.dir !== '.' ? direct : owner(catalog, path.resolve(pkg.root, component, relative))
    if (target && target.dir !== '.' && target !== pkg) report(match.index, text, 'names ' + target.name + "'s folder; use a declared package name")
  }
  return problems
}

export function checkPackage(pkg, catalog) {
  return [...checkAmenity(pkg.root, pkg.abs), ...testTree(pkg, pkg.helper).filter((file) => SOURCE.test(file)).flatMap((file) => checkSource(pkg, catalog, file))]
}

export const formatProblems = (problems) => problems.map(({ file, line, text, why }) => file + ':' + line + ': ' + JSON.stringify(text) + ' (' + why + ')').join('\n')
