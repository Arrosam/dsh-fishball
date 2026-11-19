#!/usr/bin/env node
/**
 * REL-PACK: one command that turns a clean checkout into the V3 release (task REL-PACK items 2,
 * 3, 5, 6; the user's release brief of 2026-11-17).
 *
 *   node scripts/pack-v3.mjs [--out <dir>]            pack the eight tarballs, the checksums, the
 *                                                     offline pnpm store and the two documents
 *   node scripts/pack-v3.mjs --check [--out <dir>]    re-verify an existing release, offline
 *
 * Output (default `.runtime/release/<version>/`): `<name>-<version>.tgz` for every package,
 * SHA256SUMS, INSTALL.md, PUBLISH.md, and `pnpm-store/` + `pnpm-cache/`, which let
 * `dsh plugin add <tarballs> --offline --store-dir=… --cache-dir=…` run with no registry. The store
 * is a source, not the store to install with: INSTALL.md's `offline-store.mjs` copies it into the
 * profile's own store first (scripts/release/offline-store.mjs says why).
 *
 * Only one step needs the registry: fetching the declared third-party dependencies (fishball-core's
 * bundled closure and the store). No lockfile is committed (the user's rule), so the closure takes
 * the newest versions its pinned packages' own ranges allow at pack time: two packs on different
 * days can bundle different patch versions; SHA256SUMS records what one pack shipped. Nothing is
 * published; every npm and pnpm run is isolated from the user's own configuration
 * (scripts/release/tools.mjs) and ignores lifecycle scripts.
 */
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { CLI, COMMAND, DIST_TAG, HOSTED_SET, ISOLATION, LAYOUT, MANIFEST, PACKAGES, RELEASE_DIR, REPO, SCRATCH, SET_CARRIER, VERSION } from './release/constants.mjs'
import { isolate, npm, pnpm } from './release/tools.mjs'
import { bundleInto, bundledNames, stagePackage } from './release/stage.mjs'
import { writeDocuments } from './release/documents.mjs'

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const tarballsIn = (out) => fs.readdirSync(out).filter((name) => name.endsWith(LAYOUT.tarballSuffix)).sort()
const tar = (args) => execFileSync(LAYOUT.tar, args, { maxBuffer: ISOLATION.maxOutputBytes })

/** Every package with its checkout manifest, keyed as PACKAGES. */
function catalogue() {
  return Object.fromEntries(PACKAGES.map((entry) => [entry.key, { ...entry, root: path.join(REPO, entry.folder), manifest: readJson(path.join(REPO, entry.folder, SCRATCH.manifest)) }]))
}

/**
 * The manifest a package ships with. The checkout's manifest is the source: REL-PACK sets the
 * release fields there (the user's 2026-11-17 list), so this refuses a manifest that drifted from
 * them rather than rewriting it silently.
 */
function releaseManifest(entry, names) {
  const manifest = entry.manifest
  const problems = []
  if (manifest.version !== VERSION) problems.push('version ' + manifest.version)
  if (manifest.private) problems.push('private')
  if (!manifest.description) problems.push('description')
  if (manifest.license !== MANIFEST.license) problems.push('license')
  if (manifest.repository?.url !== MANIFEST.repository.url || manifest.repository?.directory !== entry.folder) problems.push('repository')
  if (manifest.publishConfig?.tag !== DIST_TAG) problems.push('publishConfig.tag')
  if (manifest.engines?.node !== MANIFEST.engines.node) problems.push('engines.node')
  if (!entry.library && manifest.engines?.dsh !== MANIFEST.engines.dsh) problems.push('engines.dsh')
  if (entry.library && manifest.engines?.dsh !== undefined) problems.push('engines.dsh on a library')
  for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
    if (names.has(dependency) && range !== VERSION) problems.push('dependency ' + dependency + '@' + range)
    if (Object.hasOwn(MANIFEST.peersOnly, dependency)) problems.push(dependency + ' must be a peer')
  }
  for (const name of bundledNames(manifest)) if (!manifest.dependencies?.[name]) problems.push('bundles undeclared ' + name)
  if (problems.length) throw new Error(entry.folder + '/package.json is not release-ready: ' + problems.join(', '))
  return manifest
}

/** One map of third-party dependencies; two packages asking for one name at different ranges is refused. */
function mergeDependencies(sets) {
  const merged = {}
  for (const [owner, dependencies] of sets) for (const [name, range] of Object.entries(dependencies)) {
    if (merged[name] !== undefined && merged[name] !== range) throw new Error(owner + ' asks for ' + name + '@' + range + ', another package for ' + merged[name])
    merged[name] = range
  }
  return merged
}

/**
 * Install `dependencies` (third-party only) into the project `directory` with pnpm, laid out as a
 * DSH profile (SCRATCH.workspaceText), filling `store` and `cache`, with no lockfile.
 */
function installThirdParty(directory, dependencies, { store, cache, env }) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, SCRATCH.manifest), JSON.stringify({ name: SCRATCH.projectName, private: true, dependencies }, null, 2) + '\n')
  fs.writeFileSync(path.join(directory, SCRATCH.workspace), SCRATCH.workspaceText)
  pnpm(['install', COMMAND.registry, '--store-dir=' + store, '--cache-dir=' + cache, COMMAND.noLockfile], { cwd: directory, env })
  return path.join(directory, SCRATCH.modules)
}

/** Every installed package folder in a hoisted node_modules, by name (scoped names included). */
function installedPackages(modules) {
  return fs.readdirSync(modules).filter((name) => !name.startsWith(SCRATCH.hidden)).flatMap((name) =>
    name.startsWith(SCRATCH.scope) ? fs.readdirSync(path.join(modules, name)).map((inner) => name + '/' + inner) : [name])
}

/** Pack a staged package into `out`; returns the tarball's path. */
function pack(stage, out, env) {
  const [report] = JSON.parse(npm(['pack', '--json', '--pack-destination', out], { cwd: stage, env }))
  return path.join(out, report.filename)
}

/** Whether `out` may be replaced by a pack: missing, empty, or an earlier release (it holds SHA256SUMS). */
function replaceable(out) {
  if (!fs.existsSync(out)) return true
  return fs.readdirSync(out).length === 0 || fs.existsSync(path.join(out, LAYOUT.sums))
}

/**
 * Build the release into `out`:
 * 1. stage each package from npm's own file list, copying its bundled libraries in as real folders;
 * 2. give fishball-core its third-party closure (REL-PACK item 2), so an offline add needs no
 *    registry for it;
 * 3. pack the hosted set first, then put those tarballs into dsh-instance's `bundled/` (item 5);
 * 4. pack the rest, write SHA256SUMS, warm the offline store with every declared dependency, and
 *    write the documents.
 */
function build(out) {
  const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), SCRATCH.prefix))
  try {
    const env = isolate(scratch)
    const packages = catalogue()
    const names = new Set(Object.values(packages).map((entry) => entry.manifest.name))
    const byName = Object.fromEntries(Object.values(packages).map((entry) => [entry.manifest.name, entry]))
    fs.rmSync(out, { recursive: true, force: true })
    fs.mkdirSync(out, { recursive: true })
    const shared = { store: path.join(out, LAYOUT.store), cache: path.join(out, LAYOUT.cache), env }
    const stages = {}
    for (const entry of Object.values(packages)) {
      const manifest = releaseManifest(entry, names)
      const stage = path.join(scratch, SCRATCH.stage, entry.key)
      stagePackage(entry.root, stage, manifest, env)
      const thirdParty = {}
      for (const name of bundledNames(manifest)) {
        if (byName[name]) stagePackage(byName[name].root, path.join(stage, SCRATCH.modules, name), releaseManifest(byName[name], names), env)
        else thirdParty[name] = manifest.dependencies[name]
      }
      // A bundled third-party package brings its closure, flattened beside it as npm reads it.
      if (Object.keys(thirdParty).length) {
        const modules = installThirdParty(path.join(scratch, SCRATCH.closure, entry.key), thirdParty, shared)
        for (const name of installedPackages(modules)) bundleInto(stage, name, path.join(modules, name))
      }
      stages[entry.key] = stage
    }
    const tarballs = {}
    for (const key of HOSTED_SET) tarballs[key] = pack(stages[key], out, env)
    if (SET_CARRIER && HOSTED_SET.length) {
      const carrier = path.join(stages[SET_CARRIER.key], SET_CARRIER.folder)
      fs.mkdirSync(carrier, { recursive: true })
      for (const key of HOSTED_SET) fs.copyFileSync(tarballs[key], path.join(carrier, path.basename(tarballs[key])))
    }
    for (const key of Object.keys(packages)) tarballs[key] ??= pack(stages[key], out, env)
    writeSums(out)
    // The store: every declared third-party dependency of every package, as a DSH profile resolves
    // them, so the documented offline add finds them (the user's answer Q5, 2026-11-17).
    const declared = mergeDependencies(Object.values(packages).map((entry) => [entry.manifest.name, Object.fromEntries(Object.entries(entry.manifest.dependencies ?? {}).filter(([name]) => !names.has(name)))]))
    installThirdParty(path.join(scratch, SCRATCH.closure, SCRATCH.storeProject), declared, shared)
    writeDocuments(out, packages)
    return Object.values(tarballs).map((file) => path.basename(file)).sort()
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

/** SHA256SUMS over every tarball in `out`, one sorted line each. */
function writeSums(out) {
  const lines = tarballsIn(out).map((name) => LAYOUT.sumLine(sha256(path.join(out, name)), name))
  fs.writeFileSync(path.join(out, LAYOUT.sums), lines.join('\n') + '\n')
}

/**
 * Re-verify a release offline: exactly the expected tarballs and no other, each with a matching
 * SHA256SUMS line; the documents, the offline helper and the store present; no link in any tarball; the hosted set in
 * dsh-instance's `bundled/` byte-identical to the top-level tarballs. The store's contents are not
 * checked: the documented offline add writes into it (pnpm records each local tarball), and it is a
 * local aid that is never published.
 * @returns {string[]} the problems found; empty when the release is intact.
 */
function check(out) {
  if (!fs.existsSync(out)) return ['no release at ' + out]
  const nameOf = Object.fromEntries(PACKAGES.map((entry) => [entry.key, readJson(path.join(REPO, entry.folder, SCRATCH.manifest)).name]))
  const tarball = (key) => LAYOUT.tarball(nameOf[key], VERSION)
  const expected = PACKAGES.map((entry) => tarball(entry.key)).sort()
  const present = tarballsIn(out)
  const problems = [
    ...expected.filter((name) => !present.includes(name)).map((name) => 'missing ' + name),
    ...present.filter((name) => !expected.includes(name)).map((name) => 'unexpected ' + name),
    ...[LAYOUT.sums, LAYOUT.install, LAYOUT.publish, LAYOUT.offlineStore, LAYOUT.store, LAYOUT.cache].filter((name) => !fs.existsSync(path.join(out, name))).map((name) => 'missing ' + name),
  ]
  if (fs.existsSync(path.join(out, LAYOUT.sums))) {
    const sums = new Map()
    for (const line of fs.readFileSync(path.join(out, LAYOUT.sums), 'utf8').split('\n').filter(Boolean)) {
      const match = LAYOUT.sumPattern.exec(line)
      if (!match) problems.push('bad SHA256SUMS line: ' + line)
      else sums.set(match[2], match[1])
    }
    for (const name of present) if (sums.get(name) !== sha256(path.join(out, name))) problems.push('checksum mismatch ' + name)
    for (const name of sums.keys()) if (!present.includes(name)) problems.push('SHA256SUMS names a missing ' + name)
  }
  for (const name of present) {
    let listing
    try { listing = tar(['-tvzf', path.join(out, name)]).toString('utf8') } catch { problems.push('unreadable ' + name); continue }
    for (const line of listing.split('\n').filter((row) => LAYOUT.linkEntry.test(row))) problems.push('link in ' + name + ': ' + line)
  }
  if (SET_CARRIER && present.includes(tarball(SET_CARRIER.key))) for (const key of HOSTED_SET) {
    const member = path.posix.join(LAYOUT.packageRoot, SET_CARRIER.folder, tarball(key))
    let bytes
    try { bytes = tar(['-xOzf', path.join(out, tarball(SET_CARRIER.key)), member]) } catch { problems.push('missing ' + member + ' in ' + tarball(SET_CARRIER.key)); continue }
    if (present.includes(tarball(key)) && !bytes.equals(fs.readFileSync(path.join(out, tarball(key))))) problems.push(member + ' differs from ' + tarball(key))
  }
  return problems
}

function main(argv) {
  let values
  try {
    ({ values } = parseArgs({ args: argv, options: { [CLI.check]: { type: 'boolean' }, [CLI.out]: { type: 'string' } }, strict: true }))
  } catch {
    process.stderr.write(CLI.usage)
    return CLI.exit.usage
  }
  const out = path.resolve(values[CLI.out] ?? RELEASE_DIR)
  if (values[CLI.check]) {
    const problems = check(out)
    for (const problem of problems) process.stderr.write(problem + '\n')
    if (!problems.length) process.stdout.write('release ' + out + ' is intact\n')
    return problems.length ? CLI.exit.failed : CLI.exit.ok
  }
  if (!replaceable(out)) {
    process.stderr.write(CLI.refuseOut(out))
    return CLI.exit.usage
  }
  const files = build(out)
  const problems = check(out)
  for (const problem of problems) process.stderr.write(problem + '\n')
  process.stdout.write('packed ' + files.length + ' tarballs into ' + out + '\n' + files.map((name) => '  ' + name).join('\n') + '\n')
  return problems.length ? CLI.exit.failed : CLI.exit.ok
}

process.exitCode = main(process.argv.slice(2))
