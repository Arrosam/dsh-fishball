#!/usr/bin/env node
/**
 * REL-PACK: one command that turns a clean checkout into the V3 release (task REL-PACK items 2,
 * 3, 5, 6; the user's release brief of 2026-11-17).
 *
 *   node scripts/pack-v3.mjs [--out <dir>]            pack the nine tarballs, the checksums, the
 *                                                     offline pnpm store and the two documents
 *   node scripts/pack-v3.mjs --check [--out <dir>]    re-verify an existing release, offline
 *
 * Output (default `.runtime/release/<version>/`): `<name>-<version>.tgz` for every package,
 * SHA256SUMS, INSTALL.md, PUBLISH.md, and `pnpm-store/` + `pnpm-cache/`, which let
 * `dsh plugin add <tarballs> --offline --store-dir=… --cache-dir=…` run with no registry.
 *
 * Only one step needs the registry: resolving the declared third-party dependencies (fishball-core's
 * bundled closure and the store). Nothing is published; every npm and pnpm run is isolated from the
 * user's own configuration (scripts/release/tools.mjs) and ignores lifecycle scripts.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { CLI, COMMAND, HOSTED_SET, LAYOUT, MANIFEST, PACKAGES, RELEASE_DIR, REPO, SET_CARRIER, VERSION } from './release/constants.mjs'
import { isolate, npm, pnpm } from './release/tools.mjs'
import { bundleInto, bundledNames, stagePackage } from './release/stage.mjs'
import { writeDocuments } from './release/documents.mjs'

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

/** Every package with its checkout manifest, keyed as PACKAGES. */
function catalogue() {
  return Object.fromEntries(PACKAGES.map((entry) => [entry.key, { ...entry, root: path.join(REPO, entry.folder), manifest: readJson(path.join(REPO, entry.folder, 'package.json')) }]))
}

/**
 * The manifest a package ships with. The checkout's manifest is the source: REL-PACK sets the
 * release fields there (version, engines, repository, publishConfig, internal pins), so this only
 * refuses a manifest that drifted from them rather than rewriting it silently.
 */
function releaseManifest(entry, names) {
  const manifest = entry.manifest
  const problems = []
  if (manifest.version !== VERSION) problems.push('version ' + manifest.version)
  if (manifest.private) problems.push('private')
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

/**
 * Resolve and install `dependencies` (third-party only) into `directory` with pnpm, hoisted like a
 * DSH profile (dsh-app-boot PROFILE_PNPM_WORKSPACE), filling `store` and `cache` as it goes.
 */
function installThirdParty(directory, dependencies, store, cache, env) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'rel-pack-closure', private: true, dependencies }, null, 2) + '\n')
  fs.writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  pnpm(['install', COMMAND.registry, '--store-dir=' + store, '--cache-dir=' + cache, '--config.lockfile=false'], { cwd: directory, env })
  return path.join(directory, 'node_modules')
}

/** Pack a staged package into `out`; returns the tarball's path. */
function pack(stage, out, env) {
  const [report] = JSON.parse(npm(['pack', '--json', '--pack-destination', out], { cwd: stage, env }))
  return path.join(out, report.filename)
}

/**
 * Build the release into `out`:
 * 1. stage each package from npm's own file list, copying its bundled libraries in as real folders;
 * 2. give fishball-core its whole third-party closure (REL-PACK item 2), so an offline add needs no
 *    registry for it;
 * 3. pack the hosted set first, then put those tarballs into dsh-instance's `bundled/` (item 5);
 * 4. pack the rest, write SHA256SUMS, warm the offline store with every declared dependency, and
 *    write the documents.
 */
function build(out) {
  const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rel-pack-'))
  try {
    const env = isolate(scratch)
    const packages = catalogue()
    const names = new Set(Object.values(packages).map((entry) => entry.manifest.name))
    const byName = Object.fromEntries(Object.values(packages).map((entry) => [entry.manifest.name, entry]))
    fs.rmSync(out, { recursive: true, force: true })
    fs.mkdirSync(out, { recursive: true })
    const store = path.join(out, LAYOUT.store)
    const cache = path.join(out, LAYOUT.cache)
    const stages = {}
    for (const entry of Object.values(packages)) {
      const manifest = releaseManifest(entry, names)
      const stage = path.join(scratch, 'stage', entry.key)
      stagePackage(entry.root, stage, manifest, env)
      const thirdParty = {}
      for (const name of bundledNames(manifest)) {
        if (byName[name]) stagePackage(byName[name].root, path.join(stage, 'node_modules', name), releaseManifest(byName[name], names), env)
        else thirdParty[name] = manifest.dependencies[name]
      }
      // A bundled third-party package brings its closure, flattened beside it, as npm reads it.
      if (Object.keys(thirdParty).length) {
        const modules = installThirdParty(path.join(scratch, 'closure', entry.key), thirdParty, store, cache, env)
        for (const name of fs.readdirSync(modules).filter((name) => !name.startsWith('.'))) {
          const scoped = name.startsWith('@') ? fs.readdirSync(path.join(modules, name)).map((inner) => name + '/' + inner) : [name]
          for (const full of scoped) bundleInto(stage, full, path.join(modules, full))
        }
      }
      stages[entry.key] = stage
    }
    const tarballs = {}
    for (const key of HOSTED_SET) tarballs[key] = pack(stages[key], out, env)
    const carrier = path.join(stages[SET_CARRIER.key], SET_CARRIER.folder)
    fs.mkdirSync(carrier, { recursive: true })
    for (const key of HOSTED_SET) fs.copyFileSync(tarballs[key], path.join(carrier, path.basename(tarballs[key])))
    for (const key of Object.keys(packages)) tarballs[key] ??= pack(stages[key], out, env)
    writeSums(out)
    // The store: every declared third-party dependency of every package, as a DSH profile resolves
    // them, so the documented offline add finds them (the user's answer Q5, 2026-11-17).
    const declared = Object.assign({}, ...Object.values(packages).map((entry) => Object.fromEntries(Object.entries(entry.manifest.dependencies ?? {}).filter(([name]) => !names.has(name)))))
    installThirdParty(path.join(scratch, 'closure', 'store'), declared, store, cache, env)
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

const tarballsIn = (out) => fs.readdirSync(out).filter((name) => name.endsWith(LAYOUT.tarballSuffix)).sort()

/**
 * Re-verify a release offline: exactly the expected tarballs, no other, every one with a matching
 * SHA256SUMS line, the documents and the store present.
 * @returns {string[]} the problems found; empty when the release is intact.
 */
function check(out) {
  if (!fs.existsSync(out)) return ['no release at ' + out]
  const expected = PACKAGES.map((entry) => LAYOUT.tarball(readJson(path.join(REPO, entry.folder, 'package.json')).name, VERSION)).sort()
  const present = tarballsIn(out)
  const problems = [
    ...expected.filter((name) => !present.includes(name)).map((name) => 'missing ' + name),
    ...present.filter((name) => !expected.includes(name)).map((name) => 'unexpected ' + name),
    ...[LAYOUT.sums, LAYOUT.install, LAYOUT.publish, LAYOUT.store, LAYOUT.cache].filter((name) => !fs.existsSync(path.join(out, name))).map((name) => 'missing ' + name),
  ]
  if (!fs.existsSync(path.join(out, LAYOUT.sums))) return problems
  const sums = new Map()
  for (const line of fs.readFileSync(path.join(out, LAYOUT.sums), 'utf8').split('\n').filter(Boolean)) {
    const match = LAYOUT.sumPattern.exec(line)
    if (!match) problems.push('bad SHA256SUMS line: ' + line)
    else sums.set(match[2], match[1])
  }
  for (const name of present) if (sums.get(name) !== sha256(path.join(out, name))) problems.push('checksum mismatch ' + name)
  for (const name of sums.keys()) if (!present.includes(name)) problems.push('SHA256SUMS names a missing ' + name)
  return problems
}

function main(argv) {
  let values
  try {
    ({ values } = parseArgs({ args: argv, options: { check: { type: 'boolean' }, out: { type: 'string' } }, strict: true }))
  } catch {
    process.stderr.write(CLI.usage)
    return CLI.exit.usage
  }
  const out = path.resolve(values.out ?? RELEASE_DIR)
  if (values.check) {
    const problems = check(out)
    for (const problem of problems) process.stderr.write(problem + '\n')
    if (!problems.length) process.stdout.write('release ' + out + ' is intact\n')
    return problems.length ? CLI.exit.failed : CLI.exit.ok
  }
  const files = build(out)
  const problems = check(out)
  for (const problem of problems) process.stderr.write(problem + '\n')
  process.stdout.write('packed ' + files.length + ' tarballs into ' + out + '\n' + files.map((name) => '  ' + name).join('\n') + '\n')
  return problems.length ? CLI.exit.failed : CLI.exit.ok
}

process.exitCode = main(process.argv.slice(2))
