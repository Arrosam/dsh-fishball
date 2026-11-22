/**
 * The instance's own manifest, files and exports, and its boundary (README intro: "It imports no
 * Fishball-side code and has no dsh-connector peer"; R-ARCH-10; requirements 1.40; design §1.0b),
 * read through what the package publishes: its package.json, its files, its exports and what
 * `npm pack` would ship.
 *
 * - EP MOVED: the modules I-HOST moved in are present, what left is gone, the moved exports hold;
 * - EP BOUNDARY R-ARCH-10: no file imports a Fishball-side or connector package; no dependency
 *   field names one; the packed instance ships its page and child row and no Fishball-side copy;
 * - EP MANIFEST: every export and every files entry names a real file (bundled/ is pack output).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { show } from '@dsh-instance/test-helpers/json'
import { importInstance, PACKAGE_DIR, packageFile } from '../support/instance.mjs'
import {
  ABSENT, CHILD_ROW, CONNECTOR_SIDE, DEPENDENCY_FIELDS, FISHBALL_SIDE, GONE, INSTANCE, MANIFEST, NPM_PACK, PACK_OUTPUT, PAGE, PRESENT, SCAN, SECRET_LIKE,
  PACKAGE_NAME, SESSION_ROUTE, SPECIFIERS, SYNC_TARGET,
} from './constants.mjs'

const manifest = () => JSON.parse(fs.readFileSync(packageFile(MANIFEST), 'utf8'))
const posix = (file) => file.split(path.sep).join('/')
/** The package a bare specifier names (`@scope/name/sub` → `@scope/name`, `name/sub` → `name`). */
const packageOf = (specifier) => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')

/** Every source file of the package (relative, POSIX), its tests and node_modules left out. */
function sourceFiles(dir = PACKAGE_DIR, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SCAN.skip.includes(entry.name)) continue
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(file, out)
    else if (SCAN.extensions.includes(path.extname(entry.name))) out.push(posix(path.relative(PACKAGE_DIR, file)))
  }
  return out
}
/** [file, package] for every bare module specifier of the package's code. */
const importedPackages = () => sourceFiles().flatMap((file) => [...fs.readFileSync(packageFile(file), 'utf8').matchAll(SPECIFIERS)]
  .map((match) => match[2]).filter((specifier) => PACKAGE_NAME.test(specifier) && !specifier.startsWith('node:')).map((specifier) => [file, packageOf(specifier)]))
/** Every package name the manifest's dependency fields name. */
const declaredPackages = (m) => DEPENDENCY_FIELDS.flatMap((field) => (Array.isArray(m[field]) ? m[field] : Object.keys(m[field] ?? {})))

let packed
/** The files `npm pack` would put in the instance's tarball (POSIX, relative), listed once per process; nothing is written. */
function packedFiles() {
  packed ??= JSON.parse(execFileSync(NPM_PACK.command, NPM_PACK.args, { cwd: PACKAGE_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].files.map((f) => f.path)
  return packed
}

eachSdk((sdk) => {
  // ============================================================== MOVED
  for (const rel of PRESENT) caseTest(sdk, 'MOVED', 'present', `dsh-instance/${posix(rel)} exists`, () => assert.ok(fs.statSync(packageFile(rel)).isFile(), rel))
  for (const rel of ABSENT) caseTest(sdk, 'MOVED', 'absent', `dsh-instance/${posix(rel)} is gone`, () => assert.equal(fs.existsSync(packageFile(rel)), false, rel))
  caseTest(sdk, 'MOVED', 'core', `the instance brings back no child half that left core: no ${GONE.rows.join(' / ')} row in its patch, no ${GONE.exports.join(' / ')} export`, () => {
    const patch = fs.readFileSync(packageFile(INSTANCE.patch), 'utf8')
    assert.deepEqual(GONE.rows.filter((id) => patch.includes(id)), [])
    assert.deepEqual(Object.keys(manifest().exports ?? {}).filter((key) => GONE.exports.includes(key)), [])
  })
  caseTest(sdk, 'MOVED', 'session', `no instance file serves ${SESSION_ROUTE.path} (fishball-core publishes the manager-session route itself)`, () => {
    const hits = sourceFiles().filter((file) => SESSION_ROUTE.words.some((word) => fs.readFileSync(packageFile(file), 'utf8').includes(word)))
    assert.deepEqual(hits, [])
  })
  caseTest(sdk, 'MOVED', 'sync-target', `the moved provider-sync target keeps its exports (${SYNC_TARGET.exports.join(', ')})`, async () => {
    const module = await importInstance(sdk, SYNC_TARGET.file)
    assert.deepEqual(SYNC_TARGET.exports.filter((name) => module[name] === undefined), [], 'missing exports')
  })
  caseTest(sdk, 'MOVED', 'child-row', `child-row.js (export ${CHILD_ROW.export}) is row ${CHILD_ROW.name}, with config ${CHILD_ROW.field} and no secret-like field`, async () => {
    assert.equal(manifest().exports?.[CHILD_ROW.export], './' + CHILD_ROW.file)
    const row = await importInstance(sdk, CHILD_ROW.file)
    assert.equal(row.name, CHILD_ROW.name)
    assert.equal(typeof row.apply, 'function', 'the row has no apply')
    const fields = Object.keys(row.Config?.dict ?? {})
    assert.ok(fields.includes(CHILD_ROW.field), 'no ' + CHILD_ROW.field + ': ' + show(fields))
    assert.deepEqual(fields.filter((key) => SECRET_LIKE.test(key)), [], 'a secret-like child config field')
  })

  // ============================================================== BOUNDARY R-ARCH-10
  caseTest(sdk, 'BOUNDARY', 'R-ARCH-10', `no packages/dsh-instance file imports ${FISHBALL_SIDE.join(', ')}`, () => {
    const imports = importedPackages()
    assert.ok(imports.length > 0, 'precondition: the scan finds the package\'s imports')
    assert.deepEqual(imports.filter(([, name]) => FISHBALL_SIDE.includes(name)).map(([file, name]) => file + ' → ' + name), [])
  })
  caseTest(sdk, 'BOUNDARY', 'G5', `no packages/dsh-instance file imports a connector package (${CONNECTOR_SIDE.join(', ')}): its services are looked up at runtime`, () => {
    assert.deepEqual(importedPackages().filter(([, name]) => CONNECTOR_SIDE.includes(name)).map(([file, name]) => file + ' → ' + name), [])
  })
  caseTest(sdk, 'BOUNDARY', 'R-ARCH-10', "the instance's manifest names no Fishball-side or connector package in any dependency field", () => {
    const named = declaredPackages(manifest())
    assert.deepEqual(named.filter((name) => FISHBALL_SIDE.includes(name) || CONNECTOR_SIDE.includes(name)), [])
  })
  caseTest(sdk, 'BOUNDARY', 'imports declared', 'every package the instance\'s code imports is a node builtin, react (the page platform) or a declared peer of the running DSH', () => {
    const m = manifest()
    const declared = new Set([...declaredPackages(m), ...(m.dsh?.client?.inject ?? [])])
    const undeclared = importedPackages().filter(([, name]) => !declared.has(name) && name !== 'react' && !name.startsWith('@deepseek-ai/dsh-client-'))
    assert.deepEqual(undeclared.map(([file, name]) => file + ' → ' + name), [])
  })
  // The old case read a packed release (REL-PACK output); `npm pack --dry-run` lists the same files from the manifest without one.
  caseTest(sdk, 'BOUNDARY', 'packed', 'the packed instance ships child-row.js and the settings page with its chunks, and no Fishball-side package copy', () => {
    const files = packedFiles()
    for (const file of [CHILD_ROW.file, PAGE.entry, ...PAGE.chunks]) assert.ok(files.includes(file), 'not packed: ' + file)
    assert.deepEqual(files.filter((file) => FISHBALL_SIDE.some((name) => file.startsWith(NPM_PACK.modules + name + '/') || file.split('/').includes(name))), [])
    assert.deepEqual(files.filter((file) => file.startsWith('tests/')), [], 'the package tests are packed')
  })

  // ============================================================== MANIFEST
  caseTest(sdk, 'MANIFEST', 'exports', 'every export of the instance names a file the package holds and ships', () => {
    const m = manifest()
    const targets = Object.entries(m.exports ?? {}).filter(([key]) => !key.includes('*')).map(([key, target]) => [key, target.replace(/^\.\//, '')])
    assert.deepEqual(targets.filter(([, target]) => !fs.existsSync(packageFile(target))).map(([key]) => key), [], 'exports naming no file')
    const files = packedFiles()
    assert.deepEqual(targets.filter(([, target]) => !files.includes(target)).map(([key]) => key), [], 'exports not shipped')
    for (const lang of INSTANCE.locales) assert.ok(files.includes(`locale/${lang}.json`), lang + ' locale not shipped')
  })
  caseTest(sdk, 'MANIFEST', 'files', 'every files entry names a path the checkout holds, except bundled/ (REL-PACK output, never committed)', () => {
    const missing = (manifest().files ?? []).filter((entry) => entry !== PACK_OUTPUT && !entry.includes('*') && !fs.existsSync(packageFile(entry)))
    assert.deepEqual(missing, [])
    assert.equal(fs.existsSync(packageFile(PACK_OUTPUT)), false, PACK_OUTPUT + ' is committed in the checkout')
  })
  caseTest(sdk, 'MANIFEST', 'bundle', 'the instance is a DSH bundle whose patch inserts only its own row dsh-instance, with engines.dsh at the supported floor', () => {
    const m = manifest()
    assert.equal(m.name, INSTANCE.name)
    assert.equal(m.engines?.dsh, INSTANCE.engine)
    assert.equal(m.dsh?.bundle?.patch, './' + INSTANCE.patch)
    const ids = [...fs.readFileSync(packageFile(INSTANCE.patch), 'utf8').matchAll(/^\s*-?\s*id:\s*([\w-]+)/gm)].map((match) => match[1])
    assert.deepEqual(ids, [INSTANCE.name])
  })
})
