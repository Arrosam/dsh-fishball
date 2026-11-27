/**
 * The repository's test-independence rule, checked on every package: a package's tests reach other
 * packages only by package name (their public exports) or through dsh-connector-test-helpers; they
 * never import another package's tests or source files by relative path, and nothing imports the old
 * root test/ folder. Technique: EP over every import specifier of every test file (one case per
 * package).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { workspaceDirs } from '../src/runner/links.mjs'
import { MONOREPO } from '../src/repo.mjs'

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g
const TEST_FILE = /\.(?:mjs|js)$/
const workspaces = workspaceDirs().map((dir) => path.resolve(dir)).sort((a, b) => b.length - a.length)
/** The workspace a file belongs to (the deepest folder holding it). */
const ownerOf = (file) => workspaces.find((dir) => file === dir || file.startsWith(dir + path.sep))

/** Every test-side file of a workspace: files under a tests/ folder (and, for the helpers, all of src/). */
function testFiles(dir) {
  const found = []
  const walk = (folder, inTests) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(folder, entry.name)
      if (entry.isDirectory()) { if (!workspaces.includes(path.resolve(full))) walk(full, inTests || entry.name === 'tests') }
      else if (inTests && TEST_FILE.test(entry.name)) found.push(full)
    }
  }
  walk(dir, false)
  return found
}

for (const dir of workspaces) {
  const name = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name
  test(`INDEP-EP-01 ${name}: its tests import no other package's files by path and nothing of the old root test/ folder`, () => {
    const offending = []
    for (const file of testFiles(dir)) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
        const target = path.resolve(path.dirname(file), m[2])
        const owner = ownerOf(target)
        if (owner !== dir || !target.startsWith(MONOREPO + path.sep)) offending.push(`${path.relative(MONOREPO, file)} → ${m[2]}`)
      }
    }
    assert.deepEqual(offending, [])
  })
}
