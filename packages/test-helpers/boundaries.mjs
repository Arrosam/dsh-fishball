/**
 * The independence rule, checked before a package's tests run (docs/testing/README.md "Independence,
 * enforced"). A file under a package's `tests/` may reach only:
 * - `node:` modules;
 * - files inside its own package folder (not a nested package's folder: fishball-core's tests never
 *   reach fishball-ui's files);
 * - `fishball-test-helpers` and its subpaths;
 * - by name, the packages its manifest lists as dependencies or peers (their published exports).
 * Integration packages list the packages they integrate as dependencies and reach them the same way
 * (by name, or through fishball-test-helpers/packages' `exportPath`).
 *
 * Paths built from strings are checked too: a string literal naming `packages/<folder>` of another
 * package is refused, so a file cannot sidestep the import rule with path.join(REPO, 'packages', …).
 * fishball-test-helpers itself is checked by the same rule and depends on no package under test.
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO, packageOf, packages } from './packages.mjs'

const RULE = Object.freeze({
  helpers: 'fishball-test-helpers',
  nodeScheme: 'node:',
  source: /\.(m?js|cjs)$/,
  blockComment: /\/\*[\s\S]*?\*\//g,
  lineComment: /^\s*\/\/.*$/gm,
  specifier: /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g,
  literal: /(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g,
  packagesPath: /(?:^|[^\w.-])packages\/([\w.-]+)(?:\/([\w.-]+))?/g,
  packagesWord: 'packages',
})

const bareName = (specifier) => (specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0])
const insideOwn = (pkg, abs) => (abs === pkg.abs || abs.startsWith(pkg.abs + path.sep)) && !pkg.excludes.some((x) => abs === x || abs.startsWith(x + path.sep))
const folderOf = (rel) => [...packages().values()].find((p) => p.dir === rel)

function sourceFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter((f) => RULE.source.test(f) && fs.statSync(f).isFile())
}

/** Every violation in one file of `pkg`: `{file, line, text, why}`. */
export function checkFile(pkg, file) {
  const problems = []
  const raw = fs.readFileSync(file, 'utf8')
  const code = raw.replace(RULE.blockComment, (m) => m.replace(/[^\n]/g, ' ')).replace(RULE.lineComment, '')
  const lineAt = (index) => code.slice(0, index).split('\n').length
  const report = (index, text, why) => problems.push({ file: path.relative(REPO, file), line: lineAt(index), text, why })
  const allowed = new Set([RULE.helpers, ...pkg.uses, pkg.name])
  for (const m of code.matchAll(RULE.specifier)) {
    const spec = m[2]
    if (spec.startsWith(RULE.nodeScheme)) continue
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const abs = spec.startsWith('/') ? spec : path.resolve(path.dirname(file), spec)
      if (!insideOwn(pkg, abs)) report(m.index, spec, 'leaves ' + pkg.name + "'s folder")
      continue
    }
    if (!allowed.has(bareName(spec))) report(m.index, spec, bareName(spec) + ' is not a dependency or peer of ' + pkg.name)
  }
  // The helpers' catalogue (packages.mjs) names package folders by design; its imports are still checked.
  if (pkg.name === RULE.helpers) return problems
  for (const m of code.matchAll(RULE.literal)) {
    const text = m[2]
    if (text === RULE.packagesWord) { report(m.index, text, "builds a path into packages/: locate your own package with import.meta.dirname, another one only by name"); continue }
    for (const p of text.matchAll(RULE.packagesPath)) {
      const target = folderOf(path.posix.join(RULE.packagesWord, p[1], p[2] ?? '')) ?? folderOf(path.posix.join(RULE.packagesWord, p[1]))
      if (target && target.name !== pkg.name) report(m.index, text, 'names ' + target.name + "'s folder")
    }
  }
  return problems
}

/** Every violation in a package's tests (and, for fishball-test-helpers, in all of its files). */
export function checkPackage(pkg) {
  const files = pkg.name === RULE.helpers ? sourceFiles(pkg.abs) : sourceFiles(pkg.tests)
  return files.flatMap((f) => (packageOf(f)?.name === pkg.name ? checkFile(pkg, f) : []))
}

export const formatProblems = (problems) => problems.map((p) => `  ${p.file}:${p.line}  ${JSON.stringify(p.text)}  (${p.why})`).join('\n')
