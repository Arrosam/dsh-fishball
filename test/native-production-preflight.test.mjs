import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CASE, assertDisposableEnvironment, sandbox, sentinel } from './native-production-helpers.mjs'

await assertDisposableEnvironment()
const { preflight } = await import('../packages/instance/src/native-preflight.js')

const FIXTURE = Object.freeze({
  git: '.git', modules: 'node_modules', outside: 'outside',
  legacy: ['fishball', 'assistant'], marker: 'sentinel.txt',
})
const expectRefusal = operation => assert.rejects(operation, error => {
  assert.ok(error instanceof Error, 'refusal is an Error')
  assert.equal(typeof error.code, 'string', 'refusal has an actionable stable code')
  assert.ok(error.code.length > 0)
  assert.ok(error.message.length > 0)
  return true
})

// Equivalence partitions: ordinary clean layout, each independent ancestor hazard,
// alias escape, and sibling-prefix lookalikes. No implementation tree inspection.
test('PREF-01 clean attached layout passes without a fabricated Git root', async t => {
  const layout = await sandbox(t)
  const result = await preflight(layout)
  assert.deepEqual(result.warnings, [])
})

for (const marker of [FIXTURE.git, FIXTURE.modules]) {
  test('PREF-01/02 refuses unintended outer ' + marker + ' before evaluation', async t => {
    const layout = await sandbox(t)
    await mkdir(join(layout.mainHome, marker))
    const preserved = await sentinel(join(layout.mainHome, marker, FIXTURE.marker))
    await expectRefusal(() => preflight(layout))
    assert.equal(await readFile(preserved, 'utf8'), CASE.sentinel)
  })
}

test('PREF-01 Git worktree file is also an ancestor repository marker', async t => {
  const layout = await sandbox(t)
  await sentinel(join(layout.mainHome, FIXTURE.git))
  await expectRefusal(() => preflight(layout))
})

for (const select of [layout => layout.mainHome, layout => layout.root, layout => layout.runtimeRoot]) {
  test('PREF-03 workspace exposing attached paths produces an explicit warning', async t => {
    const layout = await sandbox(t)
    const result = await preflight({ ...layout, mainWorkspaces: [select(layout)] })
    assert.ok(Array.isArray(result.warnings))
    assert.ok(result.warnings.length > 0, 'nested path exposure cannot be silently accepted')
    assert.ok(JSON.stringify(result.warnings).length > 2)
  })
}

test('PREF-03 unrelated workspace and sibling prefix do not imply ancestry', async t => {
  const layout = await sandbox(t)
  const sibling = layout.runtimeRoot + '-other'
  await mkdir(sibling)
  const result = await preflight({ ...layout, mainWorkspaces: [sibling, layout.installRoot] })
  assert.deepEqual(result.warnings, [])
})

test('PREF-03 workspace symlink alias cannot hide nested visibility', async t => {
  const layout = await sandbox(t)
  const alias = join(layout.root, 'main-home-alias')
  await symlink(layout.mainHome, alias, 'dir')
  const result = await preflight({ ...layout, mainWorkspaces: [alias] })
  assert.ok(result.warnings.length > 0)
})

test('PREF-04 refuses private workspace symlink escape without touching outside data', async t => {
  const layout = await sandbox(t)
  const outside = join(layout.root, FIXTURE.outside)
  await mkdir(outside)
  const preserved = await sentinel(join(outside, FIXTURE.marker))
  const escaped = join(layout.runtimeRoot, 'escaped-workspace')
  await symlink(outside, escaped, 'dir')
  await expectRefusal(() => preflight({ ...layout, workspace: escaped }))
  assert.equal(await readFile(preserved, 'utf8'), CASE.sentinel)
})

test('PREF-04 sibling prefix is not canonical runtime containment', async t => {
  const layout = await sandbox(t)
  const outside = layout.runtimeRoot + '-unowned'
  await mkdir(outside)
  await expectRefusal(() => preflight({ ...layout, workspace: outside }))
})

for (const scope of ['installation', 'profile']) {
  test('PREF-02 permits declared ' + scope + ' package inventory inside its owner', async t => {
    const layout = await sandbox(t)
    const owner = scope === 'installation' ? layout.installRoot : layout.profileDir
    const packageDir = join(owner, FIXTURE.modules, 'fixture-package')
    await mkdir(packageDir, { recursive: true })
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: 'fixture-package', version: '1.0.0' }))
    const result = await preflight({ ...layout, resolution: { entries: [{ name: 'fixture-package', packageDir, scope }], linkedRoots: [] } })
    assert.deepEqual(result.warnings, [])
  })
}

test('PREF-02 refuses resolution inventory falling back to mutable main-home packages', async t => {
  const layout = await sandbox(t)
  const packageDir = join(layout.mainHome, 'unintended-packages', 'fixture-package')
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: 'fixture-package', version: '1.0.0' }))
  await expectRefusal(() => preflight({ ...layout, resolution: {
    entries: [{ name: 'fixture-package', packageDir, scope: 'profile' }], linkedRoots: [],
  } }))
})

test('PREF-02 refuses private dependencies shadowing the installed DSH core identity', async t => {
  const layout = await sandbox(t)
  const name = '@deepseek-ai/dsh-llm', packageDir = join(layout.profileDir, FIXTURE.modules, name)
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name, version: '0.0.0-shadow' }))
  await expectRefusal(() => preflight({ ...layout, resolution: {
    entries: [{ name, packageDir, scope: 'profile' }], linkedRoots: [],
  } }))
})

for (const location of ['workspace', 'runtimeRoot']) {
  test('PREF-02 rejects core shadow under ' + location + ' node_modules even without inventory entry', async t => {
    const layout = await sandbox(t)
    const name = '@deepseek-ai/dsh-llm', packageDir = join(layout[location], FIXTURE.modules, name)
    await mkdir(packageDir, { recursive: true })
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name, version: '0.0.0-shadow' }))
    await expectRefusal(() => preflight(layout))
  })
}

test('PREF-02 declared linked plugin cannot hide its own nested core dependency', async t => {
  const layout = await sandbox(t)
  const plugin = join(layout.root, 'linked-plugin')
  const core = join(plugin, FIXTURE.modules, '@deepseek-ai/dsh-llm')
  await mkdir(core, { recursive: true })
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ name: 'linked-plugin', version: '1.0.0' }))
  await writeFile(join(core, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-llm', version: '0.0.0-shadow' }))
  await expectRefusal(() => preflight({ ...layout, resolution: {
    entries: [{ name: 'linked-plugin', packageDir: plugin, scope: 'profile' }],
    linkedRoots: [{ name: 'linked-plugin', realPath: plugin }],
  } }))
})

test('PREF-02 symlinked package manifest cannot conceal a private core identity', async t => {
  const layout = await sandbox(t)
  const name = '@deepseek-ai/dsh-llm', packageDir = join(layout.profileDir, FIXTURE.modules, name)
  const manifest = join(layout.root, 'core-manifest.json')
  await mkdir(packageDir, { recursive: true })
  await writeFile(manifest, JSON.stringify({ name, version: '0.0.0-shadow' }))
  await symlink(manifest, join(packageDir, 'package.json'))
  await expectRefusal(() => preflight({ ...layout, resolution: { entries: [{ name, packageDir, scope: 'profile' }], linkedRoots: [] } }))
})

test('PREF-02 physical core package slot cannot be disguised by an innocent manifest name', async t => {
  const layout = await sandbox(t)
  const packageDir = join(layout.workspace, FIXTURE.modules, '@deepseek-ai/dsh-core')
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: 'innocent-package', version: '1.0.0' }))
  await expectRefusal(() => preflight(layout))
})

test('PREF-02 physical core slot cannot alias a different installed package', async t => {
  const layout = await sandbox(t)
  const installed = join(layout.installRoot, FIXTURE.modules, 'ordinary-package')
  const namespace = join(layout.profileDir, FIXTURE.modules, '@deepseek-ai')
  await mkdir(installed, { recursive: true })
  await mkdir(namespace, { recursive: true })
  await writeFile(join(installed, 'package.json'), JSON.stringify({ name: 'ordinary-package', version: '1.0.0' }))
  await symlink(installed, join(namespace, 'dsh-core'), 'dir')
  await expectRefusal(() => preflight(layout))
})

test('PREF-02 non-core private library may legitimately differ from installed library', async t => {
  const layout = await sandbox(t)
  const name = 'debug', installed = join(layout.installRoot, FIXTURE.modules, name), privateCopy = join(layout.profileDir, FIXTURE.modules, name)
  for (const [packageDir, version] of [[installed, '1.0.0'], [privateCopy, '2.0.0']]) {
    await mkdir(packageDir, { recursive: true })
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name, version }))
  }
  const result = await preflight({ ...layout, resolution: { entries: [
    { name, packageDir: installed, scope: 'installation' }, { name, packageDir: privateCopy, scope: 'profile' },
  ], linkedRoots: [] } })
  assert.deepEqual(result.warnings, [])
})

test('DATA-01 refusal preserves legacy workspace and private data', async t => {
  const layout = await sandbox(t)
  const legacy = join(layout.mainHome, ...FIXTURE.legacy)
  await mkdir(legacy, { recursive: true })
  const paths = await Promise.all([legacy, layout.profileDir, layout.workspace].map(path => sentinel(join(path, FIXTURE.marker))))
  await mkdir(join(layout.mainHome, FIXTURE.git))
  await expectRefusal(() => preflight(layout))
  for (const path of paths) assert.equal(await readFile(path, 'utf8'), CASE.sentinel)
})
