import assert from 'node:assert/strict'
import { mkdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { preflight } from '../../src/native-preflight.js'
import { pathsFor } from '../../src/native-runtime/files.js'

const FIXTURE = Object.freeze({
  home: 'main-home', install: 'program', outside: 'outside', alias: 'alias', internalAlias: 'internal-alias', missing: 'missing', other: '-other',
  git: '.git', gitDirPrefix: 'gitdir: ', modules: 'node_modules', manifest: 'package.json', linkedManifest: 'manifest.json',
  package: 'fixture-package', core: '@deepseek-ai/schemastery', coreSlot: '@deepseek-ai/dsh-core', linked: 'linked-plugin',
  version: '1.0.0', privateVersion: '2.0.0', invalidJson: '{',
  legacy: ['fishball', 'assistant'], marker: 'sentinel.txt', sentinel: 'existing synthetic data',
  manifestBytes: 1024 * 1024, entries: 20_000, fileBatch: 64, filePrefix: 'entry-', manifestPadding: ' ',
})
const CODE = Object.freeze({
  path: 'PREFLIGHT_PATH', containment: 'PREFLIGHT_CONTAINMENT', install: 'PREFLIGHT_INSTALL',
  git: 'PREFLIGHT_GIT_ANCESTOR', node: 'PREFLIGHT_NODE_ANCESTOR', visible: 'NESTED_WORKSPACE_VISIBLE',
  resolution: 'PREFLIGHT_RESOLUTION', link: 'PREFLIGHT_LINK', manifest: 'PREFLIGHT_MANIFEST', limit: 'PREFLIGHT_LIMIT', missingTarget: 'ENOENT',
})
const SCOPE = Object.freeze({ installation: 'installation', profile: 'profile' })
const OWNED_PATHS = Object.freeze(['workspace', 'profileDir'])

async function layoutFor(t) {
  const scratch = tempRoot(cleanups(t))
  const mainHome = join(scratch, FIXTURE.home)
  const { root: runtimeRoot, workspace, profile: profileDir } = pathsFor(mainHome)
  const installRoot = join(scratch, FIXTURE.install)
  await Promise.all([workspace, profileDir, installRoot].map(directory => mkdir(directory, { recursive: true })))
  return { scratch, mainHome, runtimeRoot, workspace, profileDir, installRoot }
}

const accept = async options => assert.deepEqual((await preflight(options)).warnings, [])
const refuse = (options, code) => assert.rejects(() => preflight(options), { code })
const slot = (owner, name) => join(owner, FIXTURE.modules, name)
const packageManifest = (name, version = FIXTURE.version) => JSON.stringify({ name, version })
const packageEntry = (scope, name, packageDir) => ({ scope, name, packageDir })
const linkedRoot = (name, realPath) => ({ name, realPath })

async function write(f, content) {
  await mkdir(dirname(f), { recursive: true })
  await writeFile(f, content)
  return f
}
const writeManifest = (directory, content) => write(join(directory, FIXTURE.manifest), content)
const sentinel = directory => write(join(directory, FIXTURE.marker), FIXTURE.sentinel)
const assertPreserved = async (...files) => {
  for (const file of files) assert.equal(await readFile(file, 'utf8'), FIXTURE.sentinel, file)
}

async function directoryLink(target, link) {
  await mkdir(dirname(link), { recursive: true })
  await symlink(target, link, 'dir')
}

async function assertVisibility(layout, mainWorkspaces, paths) {
  const { warnings } = await preflight({ ...layout, mainWorkspaces })
  assert.deepEqual(warnings.map(({ code, path }) => ({ code, path })), paths.map(path => ({ code: CODE.visible, path })))
  for (const { message } of warnings) assert.ok(message.length > 0)
}

describe('native preflight paths and ancestry', () => {
  it('accepts a clean attached tree and preserves existing data on acceptance and refusal', async t => {
    const layout = await layoutFor(t)
    const legacy = join(layout.mainHome, ...FIXTURE.legacy)
    const files = await Promise.all([legacy, layout.workspace, layout.profileDir].map(sentinel))
    await accept(layout)
    await assertPreserved(...files)
    const gitMarker = await sentinel(join(layout.mainHome, FIXTURE.git))
    await refuse(layout, CODE.git)
    await assertPreserved(...files, gitMarker)
  })

  it('refuses a Git worktree marker file without altering it', async t => {
    const layout = await layoutFor(t)
    const gitDir = join(layout.scratch, FIXTURE.outside)
    await mkdir(gitDir)
    const content = FIXTURE.gitDirPrefix + gitDir + '\n'
    const marker = await write(join(layout.mainHome, FIXTURE.git), content)
    await refuse(layout, CODE.git)
    assert.equal(await readFile(marker, 'utf8'), content)
  })

  it('requires an absolute and initialized main home', async t => {
    const layout = await layoutFor(t)
    for (const mainHome of [FIXTURE.home, join(layout.scratch, FIXTURE.missing)]) {
      await refuse({ ...layout, mainHome }, CODE.path)
    }
  })

  it('refuses runtime paths reached through a main home alias', async t => {
    const layout = await layoutFor(t)
    const mainHome = join(layout.scratch, FIXTURE.alias)
    await directoryLink(layout.mainHome, mainHome)
    const { root: runtimeRoot, workspace, profile: profileDir } = pathsFor(mainHome)
    await refuse({ ...layout, mainHome, runtimeRoot, workspace, profileDir }, CODE.containment)
  })

  for (const [marker, code] of [[FIXTURE.git, CODE.git], [FIXTURE.modules, CODE.node]]) {
    it('refuses an ambient ' + marker + ' directory without altering it', async t => {
      const layout = await layoutFor(t)
      const file = await sentinel(join(layout.mainHome, marker))
      await refuse(layout, code)
      await assertPreserved(file)
    })
  }

  it('warns for ancestors, the runtime itself, private descendants and their canonical aliases', async t => {
    const layout = await layoutFor(t)
    const alias = join(layout.scratch, FIXTURE.alias)
    await directoryLink(layout.mainHome, alias)
    const exposed = [layout.scratch, layout.runtimeRoot, layout.workspace]
    await assertVisibility(layout, [...exposed, alias], [...exposed, layout.mainHome])
  })

  it('does not mistake unrelated or sibling-prefix workspaces for exposure', async t => {
    const layout = await layoutFor(t)
    const sibling = layout.runtimeRoot + FIXTURE.other
    await mkdir(sibling)
    await assertVisibility(layout, [sibling, layout.installRoot], [])
  })

  for (const field of OWNED_PATHS) {
    it('requires a canonical in-runtime ' + field + ', not a sibling-prefix path or link', async t => {
      const layout = await layoutFor(t)
      const outside = layout.runtimeRoot + FIXTURE.other
      const file = await sentinel(outside)
      await refuse({ ...layout, [field]: outside }, CODE.containment)
      const link = join(layout.runtimeRoot, FIXTURE.alias)
      await directoryLink(outside, link)
      await refuse({ ...layout, [field]: link }, CODE.containment)
      const internalLink = join(layout.runtimeRoot, FIXTURE.internalAlias)
      await directoryLink(layout[field], internalLink)
      await refuse({ ...layout, [field]: internalLink }, CODE.containment)
      await assertPreserved(file)
    })
  }

  it('refuses installation/home overlap in both directions but accepts a sibling prefix', async t => {
    const layout = await layoutFor(t)
    const nested = join(layout.mainHome, FIXTURE.install)
    const sibling = layout.mainHome + FIXTURE.other
    await Promise.all([nested, sibling].map(directory => mkdir(directory)))
    for (const installRoot of [nested, layout.scratch]) await refuse({ ...layout, installRoot }, CODE.install)
    await accept({ ...layout, installRoot: sibling })
  })
})

describe('native preflight dependency resolution and links', () => {
  it('enforces installation and profile inventory scopes against canonical package locations', async t => {
    const layout = await layoutFor(t)
    const name = FIXTURE.package
    const installed = slot(layout.installRoot, name)
    const attached = slot(layout.profileDir, name)
    const fallback = join(layout.mainHome, FIXTURE.outside, name)
    const external = join(layout.scratch, FIXTURE.outside, name)
    for (const [directory, version] of [[installed, FIXTURE.version], [attached, FIXTURE.privateVersion], [fallback, FIXTURE.version], [external, FIXTURE.version]]) {
      await writeManifest(directory, packageManifest(name, version))
    }
    const installedAlias = join(layout.installRoot, FIXTURE.alias)
    await directoryLink(attached, installedAlias)
    // The profile may use its own version or resolve to the installation, not to ambient data.
    for (const [scope, directory, code] of [
      [SCOPE.installation, installed], [SCOPE.profile, attached], [SCOPE.profile, installed],
      [SCOPE.installation, attached, CODE.resolution], [SCOPE.installation, external, CODE.resolution],
      [SCOPE.installation, installedAlias, CODE.resolution],
      [SCOPE.profile, fallback, CODE.resolution], [SCOPE.profile, external, CODE.resolution],
    ]) {
      const options = { ...layout, resolution: { entries: [packageEntry(scope, name, directory)] } }
      if (code) await refuse(options, code)
      else await accept(options)
    }
  })

  it('accepts private core copies without a package-identity comparison', async t => {
    const layout = await layoutFor(t)
    const core = FIXTURE.core
    const declared = slot(layout.profileDir, core)
    await writeManifest(slot(layout.installRoot, core), packageManifest(core))
    for (const owner of [layout.profileDir, layout.workspace, layout.runtimeRoot]) {
      await writeManifest(slot(owner, core), packageManifest(core, FIXTURE.privateVersion))
    }
    await writeManifest(slot(layout.workspace, FIXTURE.coreSlot), packageManifest(FIXTURE.package))
    await accept(layout)
    await accept({ ...layout, resolution: { entries: [packageEntry(SCOPE.profile, core, declared)] } })
  })

  it('accepts a dependency link into the installation and refuses a link to an external package', async t => {
    const layout = await layoutFor(t)
    const installed = slot(layout.installRoot, FIXTURE.package)
    await writeManifest(installed, packageManifest(FIXTURE.package))
    await directoryLink(installed, slot(layout.profileDir, FIXTURE.coreSlot))
    await accept(layout)
    const external = join(layout.scratch, FIXTURE.outside, FIXTURE.core)
    await writeManifest(external, packageManifest(FIXTURE.core))
    await directoryLink(external, slot(layout.profileDir, FIXTURE.core))
    await refuse(layout, CODE.link)
  })

  it('exempts only an exact live profile slot and does not inspect its external checkout', async t => {
    const layout = await layoutFor(t)
    const name = FIXTURE.linked
    const external = join(layout.scratch, FIXTURE.outside, name)
    const liveLinks = new Map([[name, external]])
    const resolution = { entries: [packageEntry(SCOPE.profile, name, external)], linkedRoots: [linkedRoot(name, external)] }
    await writeManifest(external, FIXTURE.invalidJson)
    const profileSlot = slot(layout.profileDir, name)
    await directoryLink(external, profileSlot)
    await accept({ ...layout, resolution, liveLinks })
    const otherTarget = join(layout.scratch, FIXTURE.outside, FIXTURE.package)
    await writeManifest(otherTarget, packageManifest(name))
    // Test the slot independently of the inventory, which has its own target check.
    await refuse({ ...layout, liveLinks: new Map([[name, otherTarget]]) }, CODE.link)
    assert.equal(await readlink(profileSlot), external)
    await directoryLink(external, slot(layout.workspace, name))
    await refuse({ ...layout, resolution, liveLinks }, CODE.link)
  })

  it('accepts an exact declared dangling link for replacement but leaves it untouched', async t => {
    const layout = await layoutFor(t)
    const name = FIXTURE.linked
    const profileSlot = slot(layout.profileDir, name)
    const missing = join(layout.scratch, FIXTURE.missing)
    const target = relative(dirname(profileSlot), missing)
    await directoryLink(target, profileSlot)
    // Link declarations are absolute; the on-disk link can be relative to its slot.
    await refuse(layout, CODE.missingTarget)
    await refuse({ ...layout, replacingLinks: new Map([[name, missing + FIXTURE.other]]) }, CODE.missingTarget)
    await accept({ ...layout, replacingLinks: new Map([[name, missing]]) })
    assert.equal(await readlink(profileSlot), target)
  })

  it('inspects the nested manifests of a linked plugin inside the runtime', async t => {
    const layout = await layoutFor(t)
    const name = FIXTURE.linked
    const plugin = join(layout.runtimeRoot, name)
    await writeManifest(plugin, packageManifest(name))
    const options = { ...layout, resolution: { entries: [packageEntry(SCOPE.profile, name, plugin)], linkedRoots: [linkedRoot(name, plugin)] } }
    const nested = slot(plugin, FIXTURE.core)
    await accept(options)
    await writeManifest(nested, packageManifest(FIXTURE.core))
    await accept(options)
    await writeManifest(nested, FIXTURE.invalidJson)
    await refuse(options, CODE.manifest)
  })

  it('distinguishes an external inventory entry from an external linked root', async t => {
    const layout = await layoutFor(t)
    const name = FIXTURE.linked
    const plugin = join(layout.scratch, name)
    await writeManifest(plugin, packageManifest(name))
    const linkedRoots = [linkedRoot(name, plugin)]
    await refuse({ ...layout, resolution: { linkedRoots } }, CODE.link)
    await refuse({ ...layout, resolution: { entries: [packageEntry(SCOPE.profile, name, plugin)], linkedRoots } }, CODE.resolution)
  })
})

describe('native preflight manifest and tree limits', () => {
  it('refuses a symlinked manifest even when its target is valid JSON inside the runtime', async t => {
    const layout = await layoutFor(t)
    const directory = slot(layout.profileDir, FIXTURE.package)
    const target = await write(join(layout.runtimeRoot, FIXTURE.linkedManifest), packageManifest(FIXTURE.package))
    await mkdir(directory, { recursive: true })
    await symlink(target, join(directory, FIXTURE.manifest))
    await refuse(layout, CODE.manifest)
  })

  for (const [owner, name] of [['profileDir', FIXTURE.core], ['workspace', FIXTURE.package]]) {
    it('accepts exactly 1 MiB of manifest bytes and refuses one more under ' + owner, async t => {
      const layout = await layoutFor(t)
      const directory = slot(layout[owner], name)
      const text = packageManifest(name)
      // Trailing spaces keep the manifest valid JSON at both sizes.
      const atLimit = text.padEnd(FIXTURE.manifestBytes, FIXTURE.manifestPadding)
      assert.equal(Buffer.byteLength(atLimit), FIXTURE.manifestBytes)
      await writeManifest(directory, atLimit)
      await accept(layout)
      await writeManifest(directory, atLimit + FIXTURE.manifestPadding)
      await refuse(layout, CODE.limit)
    })
  }

  it('accepts 20,000 dependency entries across scan roots and refuses one more', async t => {
    const layout = await layoutFor(t)
    const roots = [layout.workspace, layout.profileDir].map(owner => join(owner, FIXTURE.modules))
    // Split the entries so the overflow checks the aggregate cap, not a single-directory cap.
    const perRoot = FIXTURE.entries / roots.length
    for (const root of roots) {
      await mkdir(root)
      for (let start = 0; start < perRoot; start += FIXTURE.fileBatch) {
        const size = Math.min(perRoot - start, FIXTURE.fileBatch)
        await Promise.all(Array.from({ length: size }, (_, offset) => writeFile(join(root, FIXTURE.filePrefix + (start + offset)), '')))
      }
    }
    await accept(layout)
    await writeFile(join(roots[0], FIXTURE.filePrefix + perRoot), '')
    await refuse(layout, CODE.limit)
  })
})
