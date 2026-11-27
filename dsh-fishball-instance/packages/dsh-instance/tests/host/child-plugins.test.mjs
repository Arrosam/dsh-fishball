/** Toggle the child's installed bundle list on the SDK's real plugin manager, without booting a child. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { SDK } from '@dsh-instance/test-helpers/constants'
import { cordisOf } from '@dsh-instance/test-helpers/sdk'
import { gate, turn } from '@dsh-instance/test-helpers/wait'
import { MANIFEST } from '../placement/constants.mjs'
import { childProfile, installAnchor, writeFile } from '../placement/subject.mjs'
import { PROTECTED } from '../support/constants.mjs'
import { FIXTURE, TOGGLE } from './constants.mjs'
import { load, scopeOf, scratch } from './worlds.mjs'

const PATCH = 'cordis.patch.yml'
const DEPENDENCIES = Object.freeze({ [TOGGLE.name]: TOGGLE.version })
const REFUSED_NAMES = Object.freeze([
  ...PROTECTED.map((name) => [name, TOGGLE.protected]),
  ...[TOGGLE.unknownName, FIXTURE.blank, FIXTURE.spaces].map((name) => [name, TOGGLE.unknown]),
])

async function pluginWorld(t, sdk, { enabled = false, restart } = {}) {
  const Context = await cordisOf(sdk)
  const { createChildPlugins } = await load(sdk, 'childPlugins')
  const home = scratch(t)
  const profile = childProfile(home)
  const manifest = path.join(profile, MANIFEST)
  const plugin = path.join(profile, SDK.nodeModules, TOGGLE.name)
  writeFile(manifest, { name: 'fishball-profile', dependencies: DEPENDENCIES, dsh: { profile: { bundles: [TOGGLE.name] } } })
  writeFile(path.join(plugin, MANIFEST), { name: TOGGLE.name, version: TOGGLE.version, dsh: { bundle: { patch: './' + PATCH } } })
  writeFile(path.join(plugin, PATCH), '[]\n')

  const ctx = new Context()
  scopeOf(t).defer(() => ctx.fiber.dispose())
  ctx.provide('loader', { config: [], entries: () => [], list: () => [] })
  ctx.provide('profileContext', {
    name: 'main', home, cwd: home, dir: home, patchPath: path.join(home, PATCH),
    installAnchor: installAnchor(sdk), startedBundles: [], overlays: [], telemetryDisabledEnv: '1',
  })
  const warnings = []
  let restarts = 0
  const plugins = createChildPlugins({ ctx, enabled: () => enabled, restart: () => { restarts++; return restart?.() }, warn: (...args) => warnings.push(args) })
  const text = () => fs.readFileSync(manifest, 'utf8')
  return { plugins, text, warnings, restarts: () => restarts }
}

async function toggle({ plugins, text, warnings }, enabled, applied) {
  const answer = await plugins.setEnabled(TOGGLE.name, enabled)
  assert.deepEqual(answer, { ok: true, name: TOGGLE.name, enabled, applied }, JSON.stringify(warnings))
  const manifest = JSON.parse(text())
  assert.deepEqual(manifest.dependencies, DEPENDENCIES, 'the dependency must stay installed')
  assert.deepEqual(manifest.dsh.profile.bundles, enabled ? [TOGGLE.name] : [])
  const list = await plugins.list()
  assert.equal(list.bundles?.find((b) => b.name === TOGGLE.name)?.enabled, enabled, JSON.stringify(list))
}

eachSdk((sdk) => {
  caseTest(sdk, 'CP-EP-TOGGLE', 'refused names', 'protected and unknown packages are refused in either direction without a write or restart', async (t) => {
    const w = await pluginWorld(t, sdk, { enabled: true })
    const before = w.text()
    for (const [name, code] of REFUSED_NAMES) for (const enabled of [false, true]) {
      assert.deepEqual(await w.plugins.setEnabled(name, enabled), { ok: false, code }, JSON.stringify([name, enabled, w.warnings]))
    }
    assert.equal(w.text(), before)
    assert.equal(w.restarts(), 0)
  })

  caseTest(sdk, 'CP-ST-TOGGLE', 'instance on', 'only changed states restart; the lock stays held until restart settles', async (t) => {
    const held = gate()
    const w = await pluginWorld(t, sdk, { enabled: true, restart: () => held.promise })
    scopeOf(t).defer(() => held.open())
    const before = w.text()
    await toggle(w, true, TOGGLE.nextStart)
    assert.equal(w.text(), before)
    assert.equal(w.restarts(), 0)

    await toggle(w, false, TOGGLE.restarting)
    assert.equal(w.restarts(), 1)
    assert.equal(w.plugins.busy(), true)
    assert.deepEqual(await w.plugins.setEnabled(TOGGLE.name, true), { ok: false, code: TOGGLE.busy })
    held.open()
    await turn() // only the restart promise's settlement handlers remain, no clocks or I/O
    assert.equal(w.plugins.busy(), false)
    await toggle(w, true, TOGGLE.restarting)
    assert.equal(w.restarts(), 2)
  })

  caseTest(sdk, 'CP-ST-TOGGLE', 'instance off', 'disable and re-enable for next start, without a restart or duplicate bundle entries', async (t) => {
    const w = await pluginWorld(t, sdk)
    await toggle(w, false, TOGGLE.nextStart)
    const before = w.text()
    await toggle(w, false, TOGGLE.nextStart)
    assert.equal(w.text(), before)
    await toggle(w, true, TOGGLE.nextStart)
    assert.equal(w.restarts(), 0)
  })
})
