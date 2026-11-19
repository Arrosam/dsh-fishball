#!/usr/bin/env node
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

function catalogue() {
  return Object.fromEntries(PACKAGES.map((entry) => [entry.key, { ...entry, root: path.join(REPO, entry.folder), manifest: readJson(path.join(REPO, entry.folder, SCRATCH.manifest)) }]))
}

function releaseManifest(entry) {
  const manifest = entry.manifest
  const problems = []
  if (manifest.version !== VERSION) problems.push('version ' + manifest.version)
  if (manifest.private) problems.push('private')
  if (!manifest.description) problems.push('description')
  if (manifest.license !== MANIFEST.license) problems.push('license')
  if (manifest.repository?.url !== MANIFEST.repository.url || manifest.repository?.directory !== entry.folder) problems.push('repository')
  if (manifest.publishConfig?.tag !== DIST_TAG) problems.push('publishConfig.tag')
  if (manifest.engines?.node !== MANIFEST.engines.node) problems.push('engines.node')
  if (manifest.engines?.dsh !== MANIFEST.engines.dsh) problems.push('engines.dsh')
  if (problems.length) throw new Error(entry.folder + '/package.json is not release-ready: ' + problems.join(', '))
  return manifest
}

function pack(stage, out, env) {
  const [report] = JSON.parse(npm(['pack', '--json', '--pack-destination', out], { cwd: stage, env }))
  return path.join(out, report.filename)
}

function replaceable(out) {
  if (!fs.existsSync(out)) return true
  return fs.readdirSync(out).length === 0 || fs.existsSync(path.join(out, LAYOUT.sums))
}

function resolveFishballRelease(flagValue) {
  if (flagValue) return path.resolve(flagValue)
  if (process.env.FISHBALL_RELEASE_DIR) return path.resolve(process.env.FISHBALL_RELEASE_DIR)
  const sibling = path.resolve(REPO, '..', 'dsh-fishball', '.runtime', 'release', VERSION)
  return fs.existsSync(sibling) ? sibling : null
}

function build(out, fishballRelease) {
  const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), SCRATCH.prefix))
  try {
    const env = isolate(scratch)
    const packages = catalogue()
    fs.rmSync(out, { recursive: true, force: true })
    fs.mkdirSync(out, { recursive: true })
    fs.mkdirSync(path.join(out, LAYOUT.store), { recursive: true })
    fs.mkdirSync(path.join(out, LAYOUT.cache), { recursive: true })
    const entry = packages.instance
    const manifest = releaseManifest(entry)
    const stage = path.join(scratch, SCRATCH.stage, entry.key)
    stagePackage(entry.root, stage, manifest, env)
    if (fishballRelease) {
      const carrier = path.join(stage, SET_CARRIER.folder)
      fs.mkdirSync(carrier, { recursive: true })
      for (const name of HOSTED_SET) {
        const tgz = LAYOUT.tarball(name, VERSION)
        const src = path.join(fishballRelease, tgz)
        if (!fs.existsSync(src)) throw new Error('missing Fishball tarball: ' + src)
        fs.copyFileSync(src, path.join(carrier, tgz))
      }
    }
    const tarball = pack(stage, out, env)
    const lines = tarballsIn(out).map((name) => LAYOUT.sumLine(sha256(path.join(out, name)), name))
    fs.writeFileSync(path.join(out, LAYOUT.sums), lines.join('\n') + '\n')
    writeDocuments(out, packages)
    return [path.basename(tarball)]
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

function check(out) {
  if (!fs.existsSync(out)) return ['no release at ' + out]
  const expected = [LAYOUT.tarball('dsh-instance', VERSION)]
  const present = tarballsIn(out)
  const problems = [
    ...expected.filter((name) => !present.includes(name)).map((name) => 'missing ' + name),
    ...present.filter((name) => !expected.includes(name)).map((name) => 'unexpected ' + name),
    ...[LAYOUT.sums, LAYOUT.install, LAYOUT.publish, LAYOUT.offlineStore, LAYOUT.store, LAYOUT.cache].filter((name) => !fs.existsSync(path.join(out, name))).map((name) => 'missing ' + name),
  ]
  for (const name of present) {
    let listing
    try { listing = tar(['-tvzf', path.join(out, name)]).toString('utf8') } catch { problems.push('unreadable ' + name); continue }
    for (const line of listing.split('\n').filter((row) => LAYOUT.linkEntry.test(row))) problems.push('link in ' + name + ': ' + line)
  }
  return problems
}

function main(argv) {
  let values
  try {
    ({ values } = parseArgs({ args: argv, options: { [CLI.check]: { type: 'boolean' }, [CLI.out]: { type: 'string' }, [CLI.fishballRelease]: { type: 'string' } }, strict: true }))
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
  const files = build(out, resolveFishballRelease(values[CLI.fishballRelease]))
  const problems = check(out)
  for (const problem of problems) process.stderr.write(problem + '\n')
  process.stdout.write('packed ' + files.length + ' tarballs into ' + out + '\n' + files.map((name) => '  ' + name).join('\n') + '\n')
  return problems.length ? CLI.exit.failed : CLI.exit.ok
}

process.exitCode = main(process.argv.slice(2))
