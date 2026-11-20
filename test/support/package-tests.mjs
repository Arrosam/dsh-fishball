/**
 * Per-package test discovery. Each package keeps its suites in its own folder and describes them in
 * <package>/tests/test.config.mjs (default export: { dir, suffix }, dir relative to the package).
 * The config lives inside tests/ so it never ships: the release and npm pack drop test folders.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './constants.mjs'

export const PACKAGE_TESTS = Object.freeze({ config: path.join('tests', 'test.config.mjs'), packagesDir: 'packages', manifest: 'package.json', skipDirs: Object.freeze(['node_modules', 'tests']) })

/** Repo-relative POSIX paths of one package's suite files, sorted. */
export async function packageSuiteFiles(packageDir) {
  const { default: config } = await import(pathToFileURL(path.join(packageDir, PACKAGE_TESTS.config)).href)
  const root = path.join(packageDir, config.dir)
  return fs.readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith(config.suffix)).sort()
    .map((f) => path.relative(REPO, path.join(root, f)).split(path.sep).join('/'))
}

/** Every package folder under packages/ (nested packages such as dsh-connector/ui included) that has a test config. */
export function packagesWithTests(dir = path.join(REPO, PACKAGE_TESTS.packagesDir)) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || PACKAGE_TESTS.skipDirs.includes(entry.name)) continue
    const sub = path.join(dir, entry.name)
    if (fs.existsSync(path.join(sub, PACKAGE_TESTS.manifest)) && fs.existsSync(path.join(sub, PACKAGE_TESTS.config))) found.push(sub)
    found.push(...packagesWithTests(sub))
  }
  return found.sort()
}
