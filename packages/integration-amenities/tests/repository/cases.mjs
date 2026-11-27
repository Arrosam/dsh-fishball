/**
 * The repository's layout (AM-EP-07; old test/v3/fishball-amenities/packages): the amenities split
 * (the user's decision, 2026-11-21) made each amenity its own package, and fishball-shared is their
 * library, so the root package.json's workspaces list each of their folders (an npm workspace install
 * then links them by name), and every folder the workspaces list holds a package.json. A repository
 * fact, not a package's: no single package's tests own it.
 *
 * Technique: EP, one partition per member folder, the umbrella's and the library's; the second clause
 * of the library row covers every listed entry (globs expanded, as npm does).
 * Observed: the root package.json, and each package's folder from fishball-test-helpers/packages (by name).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { MANIFEST_FILE, PKG, REPO, SUBJECTS, workspaceOf } from '../support/packages.mjs'

const WORKSPACES = Object.freeze({ field: 'workspaces', wildcard: '*' })
const rootWorkspaces = () => JSON.parse(fs.readFileSync(path.join(REPO, MANIFEST_FILE), 'utf8'))[WORKSPACES.field] ?? []
/** The listed entries with a trailing `*` expanded to the folders it matches (npm's own reading). */
function expanded(entries) {
  return entries.flatMap((entry) => {
    if (!entry.endsWith(WORKSPACES.wildcard)) return [entry]
    const parent = path.posix.dirname(entry)
    const prefix = path.posix.basename(entry).slice(0, -WORKSPACES.wildcard.length)
    return fs.readdirSync(path.join(REPO, parent)).filter((name) => name.startsWith(prefix)).map((name) => path.posix.join(parent, name))
  })
}

export function registerWorkspaceCases() {
  for (const pkg of SUBJECTS) {
    caseTest('AM-EP-07', pkg.name, `the root workspaces list ${pkg.name}'s folder (${workspaceOf(pkg)})`, () => {
      assert.ok(rootWorkspaces().includes(workspaceOf(pkg)), 'root workspaces: ' + JSON.stringify(rootWorkspaces()))
    })
  }
  caseTest('AM-EP-07', 'library', `the root workspaces list ${PKG.shared.name}'s folder, and every listed workspace folder has a package.json`, () => {
    const listed = rootWorkspaces()
    assert.ok(listed.includes(workspaceOf(PKG.shared)), 'root workspaces: ' + JSON.stringify(listed))
    assert.deepEqual(expanded(listed).filter((w) => !fs.existsSync(path.join(REPO, w, MANIFEST_FILE))), [])
  })
}
