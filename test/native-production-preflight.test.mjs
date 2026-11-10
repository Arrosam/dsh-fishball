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

// PREF-02 core identity, decision A (the user, 2026-11-11: "插件怎么样就怎么样，如果炸了启动不了就启动不了。As it is.").
// A private @deepseek-ai/* package is no longer a refusal reason: no allow-list, no version check.
// Decision table, one rule per row: an @deepseek-ai name or slot alone is accepted wherever it sits;
// the manifest, link and resolution refusals still apply to such a slot, unchanged (C3).
const DECISION_A = Object.freeze({
  retiredCode: 'PREFLIGHT_CORE_SHADOW',
  manifestCode: 'PREFLIGHT_MANIFEST',
  linkCode: 'PREFLIGHT_LINK',
  /** EP: a dsh-* package, a plugin's usual hoisted dependency (dsh-idle-compact@0.3.0), and the framework. */
  names: Object.freeze(['@deepseek-ai/dsh-llm', '@deepseek-ai/schemastery', '@deepseek-ai/cordis']),
  /** Not a core name: the symlinked-manifest rule refuses it just the same. */
  plainName: 'fixture-package',
  version: '0.0.0-shadow', plainVersion: '1.0.0', invalidManifest: '{',
})
const writeManifest = async (packageDir, manifest) => {
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(packageDir, 'package.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
}
const profileEntry = (name, packageDir) => ({ resolution: { entries: [{ name, packageDir, scope: 'profile' }], linkedRoots: [] } })
/** C3: still refused, with the documented code; never with the retired core-identity code. */
const expectCode = (operation, code) => assert.rejects(operation, error => {
  assert.ok(error instanceof Error, 'refusal is an Error')
  assert.notEqual(error.code, DECISION_A.retiredCode, 'the core-identity refusal is retired')
  if (code !== undefined) assert.equal(error.code, code, 'refusal code: ' + error.message)
  assert.ok(error.message.length > 0)
  return true
})

for (const name of DECISION_A.names) {
  // Decision table rows R1/R2 (C1): profile copy, declared in the resolution inventory or not.
  test('PREF-02 decision A accepts a private ' + name + ' copy declared in the profile inventory', async t => {
    const layout = await sandbox(t)
    const packageDir = join(layout.profileDir, FIXTURE.modules, name)
    await writeManifest(packageDir, { name, version: DECISION_A.version })
    assert.deepEqual((await preflight({ ...layout, ...profileEntry(name, packageDir) })).warnings, [])
  })
  test('PREF-02 decision A accepts an undeclared ' + name + ' copy in the profile node_modules', async t => {
    const layout = await sandbox(t)
    await writeManifest(join(layout.profileDir, FIXTURE.modules, name), { name, version: DECISION_A.version })
    assert.deepEqual((await preflight(layout)).warnings, [])
  })
}

// Rows R3/R4: the old "core shadow outside the profile" partitions. The core-identity check was the
// only reason they refused; with it retired they are accepted as they are.
for (const location of ['workspace', 'runtimeRoot']) {
  test('PREF-02 decision A accepts an @deepseek-ai copy under ' + location + ' node_modules', async t => {
    const layout = await sandbox(t)
    const name = DECISION_A.names[0]
    await writeManifest(join(layout[location], FIXTURE.modules, name), { name, version: DECISION_A.version })
    assert.deepEqual((await preflight(layout)).warnings, [])
  })
}

// Row R5: an @deepseek-ai slot whose manifest names another package (was "disguised core slot").
test('PREF-02 decision A accepts an @deepseek-ai slot whose manifest has another name', async t => {
  const layout = await sandbox(t)
  await writeManifest(join(layout.workspace, FIXTURE.modules, '@deepseek-ai/dsh-core'), { name: 'innocent-package', version: DECISION_A.plainVersion })
  assert.deepEqual((await preflight(layout)).warnings, [])
})

// Row R6: an @deepseek-ai slot linked to a package inside the installation (a link that does not
// leave the runtime or the installation is not a PREFLIGHT_LINK case).
test('PREF-02 decision A accepts an @deepseek-ai slot linked to another installed package', async t => {
  const layout = await sandbox(t)
  const installed = join(layout.installRoot, FIXTURE.modules, 'ordinary-package')
  const namespace = join(layout.profileDir, FIXTURE.modules, '@deepseek-ai')
  await writeManifest(installed, { name: 'ordinary-package', version: DECISION_A.plainVersion })
  await mkdir(namespace, { recursive: true })
  await symlink(installed, join(namespace, 'dsh-core'), 'dir')
  assert.deepEqual((await preflight(layout)).warnings, [])
})

// Row R7 (C3, still refused): a symlinked package manifest, whatever name it carries (EP: core, plain).
for (const name of [DECISION_A.names[0], DECISION_A.plainName]) {
  test('PREF-02 symlinked package manifest is still refused (PREFLIGHT_MANIFEST) for ' + name, async t => {
    const layout = await sandbox(t)
    const packageDir = join(layout.profileDir, FIXTURE.modules, name)
    const manifest = join(layout.root, 'linked-manifest.json')
    await mkdir(packageDir, { recursive: true })
    await writeFile(manifest, JSON.stringify({ name, version: DECISION_A.version }))
    await symlink(manifest, join(packageDir, 'package.json'))
    await expectCode(() => preflight({ ...layout, ...profileEntry(name, packageDir) }), DECISION_A.manifestCode)
  })
}

// Row R8 (C3): an @deepseek-ai slot whose package.json is not JSON.
test('PREF-02 invalid package.json in an @deepseek-ai slot is still refused (PREFLIGHT_MANIFEST)', async t => {
  const layout = await sandbox(t)
  await writeManifest(join(layout.profileDir, FIXTURE.modules, DECISION_A.names[1]), DECISION_A.invalidManifest)
  await expectCode(() => preflight(layout), DECISION_A.manifestCode)
})

// Row R9 (C3): an @deepseek-ai slot linked outside the runtime and the installation.
test('PREF-02 @deepseek-ai slot linked outside runtime and installation is still refused (PREFLIGHT_LINK)', async t => {
  const layout = await sandbox(t)
  const outside = join(layout.root, FIXTURE.outside, 'schemastery')
  const namespace = join(layout.profileDir, FIXTURE.modules, '@deepseek-ai')
  await writeManifest(outside, { name: DECISION_A.names[1], version: DECISION_A.version })
  await mkdir(namespace, { recursive: true })
  await symlink(outside, join(namespace, 'schemastery'), 'dir')
  await expectCode(() => preflight(layout), DECISION_A.linkCode)
})

// Row R10 (C3): a declared linked plugin outside the attached home is refused by the resolution rule,
// with or without a nested @deepseek-ai dependency (EP); the nested copy is not what refuses it.
for (const nested of [true, false]) {
  test('PREF-02 declared linked plugin outside the attached home is still refused (nested @deepseek-ai copy: ' + nested + ')', async t => {
    const layout = await sandbox(t)
    const plugin = join(layout.root, 'linked-plugin')
    await writeManifest(plugin, { name: 'linked-plugin', version: DECISION_A.plainVersion })
    if (nested) await writeManifest(join(plugin, FIXTURE.modules, DECISION_A.names[0]), { name: DECISION_A.names[0], version: DECISION_A.version })
    await expectCode(() => preflight({ ...layout, resolution: {
      entries: [{ name: 'linked-plugin', packageDir: plugin, scope: 'profile' }],
      linkedRoots: [{ name: 'linked-plugin', realPath: plugin }],
    } }))
  })
}

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
