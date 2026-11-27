import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { randomInt } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { MONOREPO, REPO as COMPONENT } from 'dsh-connector-test-helpers/repo'
import { workspaceDirs } from 'dsh-connector-test-helpers/runner/links'

const CONNECTOR = 'dsh-agent-connector'
const FIXTURE = Object.freeze({
  prefix: '.pack-manifest-test-',
  component: path.relative(MONOREPO, COMPONENT),
  packages: Object.freeze([
    CONNECTOR, 'dsh-connector-shared', 'dsh-connector-adapter',
    'dsh-connector-watchdog', 'dsh-connector-amenities',
  ]),
  prereleaseSequence: Object.freeze({ min: 1_000, maxExclusive: 10_000 }),
  manifest: 'package.json',
  scripts: 'scripts',
  entrypoint: 'pack.mjs',
  releaseModules: 'release',
  releaseFolder: '.runtime/release',
  installGuide: 'INSTALL.md',
  publishGuide: 'PUBLISH.md',
  bin: 'bin',
  storeBuilder: 'pnpm',
  textEncoding: 'utf8',
  timeoutMs: 30_000,
})

// Emulate pnpm's install directories without a registry; npm still makes the real tarballs.
const STORE_STUB = `#!/bin/sh
set -eu
[ "$1" = install ]
/bin/mkdir -p node_modules
for arg do
  case "$arg" in
    --store-dir=*|--cache-dir=*) /bin/mkdir -p "\${arg#*=}" ;;
  esac
done
`

const readText = (file) => fs.readFileSync(file, FIXTURE.textEncoding)
const tarballName = ({ name, version }) => `${name}-${version}.tgz`

function releaseFixture(root) {
  const scripts = path.join(root, FIXTURE.component, FIXTURE.scripts)
  for (const name of [FIXTURE.entrypoint, FIXTURE.releaseModules]) {
    fs.cpSync(path.join(COMPONENT, FIXTURE.scripts, name), path.join(scripts, name), { recursive: true })
  }

  const workspaceManifests = new Map(workspaceDirs().map((dir) => {
    const source = path.join(dir, FIXTURE.manifest)
    const manifest = JSON.parse(readText(source))
    return [manifest.name, { source, manifest }]
  }))
  const manifests = new Map()
  for (const name of FIXTURE.packages) {
    const workspace = workspaceManifests.get(name)
    assert.ok(workspace, `missing workspace manifest: ${name}`)
    const { source, manifest } = workspace
    // Change only the connector so this detects a hardcoded release version and a forced lockstep bump.
    if (name === CONNECTOR) {
      const { min, maxExclusive } = FIXTURE.prereleaseSequence
      manifest.version = `1.0.0-alpha.fixture.${randomInt(min, maxExclusive)}`
    }
    // The pack script expects its input manifests at their original checkout-relative paths.
    const target = path.join(root, path.relative(MONOREPO, source))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(manifest))
    manifests.set(name, manifest)
  }

  const bin = path.join(root, FIXTURE.bin)
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, FIXTURE.storeBuilder), STORE_STUB, { mode: 0o755 })
  const env = { ...process.env, TMPDIR: root, PATH: [bin, process.env.PATH].join(path.delimiter) }
  return { manifests, env, script: path.join(scripts, FIXTURE.entrypoint) }
}

test('pack derives the release version from the connector manifest and keeps each package version', (t) => {
  const root = fs.mkdtempSync(path.join(COMPONENT, FIXTURE.prefix))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const { manifests, env, script } = releaseFixture(root)
  const connector = manifests.get(CONNECTOR)
  const run = (...args) => {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: root, env, encoding: FIXTURE.textEncoding, timeout: FIXTURE.timeoutMs,
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0, `Pack failed for connector manifest version ${connector.version}:\n${result.stderr}${result.stdout}`)
    return result.stdout
  }

  const stdout = run()
  const release = path.join(root, FIXTURE.component, FIXTURE.releaseFolder, connector.version)
  const tarballs = [...manifests.values()].map(tarballName).sort()
  assert.deepEqual(fs.readdirSync(release).filter((name) => name.endsWith('.tgz')).sort(), tarballs)

  const publish = readText(path.join(release, FIXTURE.publishGuide))
  const install = readText(path.join(release, FIXTURE.installGuide)).split(/\s+/)
  for (const manifest of manifests.values()) {
    const name = tarballName(manifest)
    assert.ok(stdout.split(/\r?\n/).some((line) => line.trim() === name), `pack output lists ${name}: ${JSON.stringify(stdout)}`)
    assert.ok(publish.includes(`npm publish ${name} `), `publish guide names ${name}`)
    const packed = JSON.parse(execFileSync('tar', ['-xOzf', path.join(release, name), 'package/package.json']))
    assert.equal(packed.version, manifest.version, `version inside ${name}`)
    if (manifest.dsh?.bundle) {
      const spec = `${manifest.name}@${manifest.version}`
      assert.ok(install.includes(spec), `online install guide names ${spec}`)
      assert.ok(install.includes(`"$PWD/${name}"`), `offline install guide names ${name}`)
    }
  }
  assert.equal(run('--check').trim(), `release ${release} is intact`)
})
