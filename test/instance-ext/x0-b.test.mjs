/**
 * W0 / X0-B — bundling and the admin switch (X17, X18, §2.2).
 *
 * Observation points: `RUNTIME.bundledPlugins`, `packages/instance/package.json`'s dependencies,
 * the admin wire the settings page uses (`admin.plugins.get`, disable, remove) and a real
 * `initializeProfile` run over a fake DSH boot (the start-up placement and the skipped-bundle
 * check). The three plugin packages are fixture packages; the real ones arrive with the plugin
 * waves.
 *
 * Techniques: P, DT, ST, EP, BVA. Every case names its X point.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { bootChild, tempDir } from '../support/instance-ext.mjs'
import { loadInstance } from '../support/body-soul-env.mjs'
import { REPO } from '../support/constants.mjs'

const BUNDLED = ['fishball-fold-notify', 'fishball-board', 'fishball-watchdog']
const WATCHDOG = 'fishball-watchdog'

async function live(t) {
  const h = await bootChild(t, { activate: true })
  return { h, service: h.requireInstance() }
}

function operations(h) { return h.rows.admin.ADMIN_OPERATION }

describe('X0-B X17/X18 bundled plugin identity', () => {
  it('XB-P-01 RUNTIME.bundledPlugins names the three plugins in order', async (t) => {
    const { RUNTIME } = await loadInstance('src/native-runtime/constants.js')
    assert.deepEqual(RUNTIME.bundledPlugins, BUNDLED.map((name) => ({ name })))
  })

  it('XB-P-02 the instance declares each bundled plugin as an exact-version dependency', async (t) => {
    const manifest = JSON.parse(await readFile(path.join(REPO, 'packages', 'instance', 'package.json'), 'utf8'))
    const dependencies = manifest.dependencies ?? {}
    for (const name of BUNDLED) {
      assert.equal(typeof dependencies[name], 'string', name + ' is a dependency')
      assert.doesNotMatch(dependencies[name], /^[\^~]/, name + ' is an exact version')
    }
  })

  it('XB-P-03 admin.plugins.get marks the three built in and not removable', async (t) => {
    const { h } = await live(t)
    const result = await h.admin(operations(h).pluginsGet, {})
    assert.equal(result.ok, true)
    for (const name of BUNDLED) {
      const bundle = result.result.bundles.find((candidate) => candidate.name === name)
      assert.equal(bundle?.bundled, true, name + ' bundled')
      assert.equal(bundle?.removable, false, name + ' not removable')
    }
  })

  it('XB-P-04 enable and disable work on a bundled plugin; a disable is not a removal', async (t) => {
    const { h } = await live(t)
    const op = operations(h)
    const first = await h.admin(op.pluginsGet, {})
    const disabled = await h.admin(op.pluginDisable, { name: WATCHDOG, inventoryRevision: first.result.inventoryRevision })
    assert.equal(disabled.ok, true)
    assert.equal(disabled.result.enabled, false)
    const second = await h.admin(op.pluginsGet, {})
    const enabled = await h.admin(op.pluginEnable, { name: WATCHDOG, inventoryRevision: second.result.inventoryRevision })
    assert.equal(enabled.ok, true)
    assert.equal(enabled.result.enabled, true)
  })

  it('XB-EP-01 admin.plugin.remove refuses a bundled plugin with bundled-plugin', async (t) => {
    const { h } = await live(t)
    const op = operations(h)
    const snapshot = await h.admin(op.pluginsGet, {})
    const removed = await h.admin(op.pluginRemove, { name: WATCHDOG, inventoryRevision: snapshot.result.inventoryRevision })
    assert.equal(removed.ok, false)
    assert.equal(removed.error.code, 'bundled-plugin')
    assert.ok(h.bundles.some((bundle) => bundle.name === WATCHDOG), 'the package stayed installed')
  })
})

describe('X0-B X18 disable is a hand-over (§2.4 step 1)', () => {
  async function disable(h) {
    const op = operations(h)
    const snapshot = await h.admin(op.pluginsGet, {})
    return h.admin(op.pluginDisable, { name: WATCHDOG, inventoryRevision: snapshot.result.inventoryRevision })
  }

  it('XB-DT-01 disable with a non-empty supervised set → hand-over, gate off, no stop', async (t) => {
    const { h, service } = await live(t)
    const reg = service.supervision.register(WATCHDOG)
    reg.set('session-1', 'paused', 'brief-1')
    const result = await disable(h)
    assert.equal(result.ok, true)
    reg.dispose()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const send = await h.tool('message_session', { session_id: 'session-1', message: 'hello' })
    assert.equal(send.ok, true, 'the send gate is off after hand-over')
    assert.equal(h.host.requests.some((request) => request.operation === 'session.stop'), false, 'nothing is stopped')
  })

  it('XB-DT-02 a failed setBundleEnabled changes nothing', async (t) => {
    const { h, service } = await live(t)
    const reg = service.supervision.register(WATCHDOG)
    reg.set('session-1', 'paused', 'brief-1')
    const watchdog = h.bundles.find((bundle) => bundle.name === WATCHDOG)
    watchdog.canFail = true
    const result = await disable(h)
    assert.equal(result.ok, false)
    const send = await h.tool('message_session', { session_id: 'session-1', message: 'hello' })
    assert.equal(send.code, 'supervision-paused', 'the gate still holds the paused session')
    reg.dispose()
  })
})

describe('X0-B §2.2 placement at child start', () => {
  async function instanceNodeModules(t) {
    const dir = path.join(REPO, 'packages', 'instance', 'node_modules')
    await mkdir(dir, { recursive: true })
    const made = []
    for (const name of ['fishball-fold-notify', 'fishball-board']) {
      const target = path.join(dir, name)
      await rm(target, { recursive: true, force: true })
      await symlink(path.join(REPO, 'test', 'fixtures', 'bundled', name), target)
      made.push(target)
    }
    t.after(async () => { for (const target of made) await rm(target, { recursive: true, force: true }) })
    return dir
  }

  async function start(t, { skipped } = {}) {
    const { initializeProfile } = await loadInstance('src/native-runtime/installation.js')
    const home = await tempDir(t, 'fbtest-bundled-start-')
    const profile = path.join(home, 'profiles', 'fishball')
    const paths = { mainHome: home, root: path.join(home, 'runtime'), workspace: path.join(home, 'workspace'), profile, home }
    const installation = {
      bootPath: path.join(REPO, 'test', 'fixtures', 'fake-dsh-boot.mjs'),
      installRoot: path.dirname(path.dirname(REPO)),
      installAnchor: path.join(REPO, 'packages', 'instance'),
    }
    const warnings = []
    const preflight = async () => ({ warnings })
    // The fake boot's skipped list is driven by the profile manifest, which lists the three names.
    await mkdir(paths.workspace, { recursive: true })
    const result = { paths, warnings }
    result.entries = await initializeProfile(paths, installation, preflight, [])
    return result
  }

  it('XB-ST-01 one failed placement leaves the others: both directories are written per name, and the start goes on', async (t) => {
    await instanceNodeModules(t)
    const { paths } = await start(t)
    for (const name of ['fishball-fold-notify', 'fishball-board']) {
      assert.equal(await readFile(path.join(paths.profile, 'vendor', name, 'package.json'), 'utf8').then(() => true).catch(() => false), true, name + ' in vendor/')
      assert.equal(await readFile(path.join(paths.profile, 'node_modules', name, 'package.json'), 'utf8').then(() => true).catch(() => false), true, name + ' in node_modules/')
    }
    assert.equal(await readFile(path.join(paths.profile, 'node_modules', WATCHDOG, 'package.json'), 'utf8').then(() => true).catch(() => false), false, 'the missing placement is absent')
  })

  it('XB-DT-03 a skipped bundled name whose placement failed this start does not fail the start', async (t) => {
    await instanceNodeModules(t)
    // fishball-watchdog has no fixture package, so its placement fails; the fake boot skips it.
    const { entries } = await start(t)
    assert.ok(Array.isArray(entries), 'the start went on')
  })

  it('XB-DT-04 any other skipped bundle stays fatal, after the bundled names are placed', async (t) => {
    await instanceNodeModules(t)
    // The manifest also names an unplaced, non-bundled bundle. Its skip stays fatal; the two
    // bundled names must still have been placed before that decision.
    const { initializeProfile } = await loadInstance('src/native-runtime/installation.js')
    const home = await tempDir(t, 'fbtest-bundled-start-')
    const profile = path.join(home, 'profiles', 'fishball')
    await mkdir(path.join(profile, 'node_modules'), { recursive: true })
    await mkdir(path.join(home, 'workspace'), { recursive: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path.join(profile, 'package.json'), JSON.stringify({ name: 'fishball', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', WATCHDOG, 'some-other-bundle'] } } }))
    const installation = {
      bootPath: path.join(REPO, 'test', 'fixtures', 'fake-dsh-boot.mjs'),
      installRoot: path.dirname(path.dirname(REPO)),
      installAnchor: path.join(REPO, 'packages', 'instance'),
    }
    await assert.rejects(
      () => initializeProfile({ mainHome: home, root: path.join(home, 'runtime'), workspace: path.join(home, 'workspace'), profile, home }, installation, async () => ({ warnings: [] }), []),
      (error) => error?.code === 'PROFILE_INCOMPATIBLE',
    )
    for (const name of ['fishball-fold-notify', 'fishball-board']) {
      assert.equal(await readFile(path.join(profile, 'vendor', name, 'package.json'), 'utf8').then(() => true).catch(() => false), true, name + ' was placed before the fatal decision')
    }
  })
})
