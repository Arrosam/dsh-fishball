/**
 * Plugin statuses feature, defaults on a NEW install: every DSH plugin starts off in Fishball, also
 * one installed later (while DSH runs or while it is down), and one removed and installed again.
 * Built-ins keep their defaults. One host, cases in order (state transitions across restarts).
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | DEF-01 ×2 | DT (new install × present at first start × profile-enabled / disabled) | fbtest-tools (kind profile) and fbtest-only (kind fishball-only): on false, dsh-disabled, changedBy null; listBundles still shows fbtest-tools enabled |
 * | DEF-02 | DT (DSH-optional bundles) | each listed DSH-optional bundle is off |
 * | DEF-03 | EP | Fishball's setup request and a later one lack every fbtest-tools tool; an ordinary session has them |
 * | DEF-04 | ST (restart, no choice) | still off after a restart |
 * | DEF-05 | ST (user on -> restart) | a stored choice survives: on, dsh-enabled, changedBy user |
 * | DEF-06 | DT (installed while DSH runs, enabled in the profile) | fbtest-added-c: kind profile, off, dsh-disabled; its tool not in Fishball's request; an ordinary session has it |
 * | DEF-07 | DT (installed while DSH runs, not enabled) | fbtest-added-b: kind fishball-only, off |
 * | DEF-08 | DT (installed while DSH was down, enabled) | fbtest-added linked between two boots: kind profile, off |
 * | DEF-09 | ST (on -> removed from the profile -> installed again) | fbtest-added-c turned on by the user, removed (leaves the catalog), installed again enabled: off, changedBy null (the choice is forgotten) |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ADDED_BUNDLE, ADDED_BUNDLE_B, ADDED_BUNDLE_C, API, CHANGED_BY, FIXTURE_BUNDLE, FIXTURE_UNCHECKED, KIND, ONLY_BUNDLES, PACKAGE_NAME, PLUGIN_STATUS, PRESET, STATUS } from './support/constants.mjs'
import { HOOK, LONG_T, T, catalogSettled, expectedActions, nextTools, pluginIn, settle, settledIdle, toolNames, turn, untilCatalog } from './support/expect.mjs'
import { bootHost, bootLive, newHome } from './support/host.mjs'

/** Off for Fishball, as a DSH plugin: dsh-disabled with [enable], or no action when it is blocked (revision 10b). */
function assertOff(p, label) {
  assert.ok(p, label + ' listed')
  assert.equal(p.on, false, label + ' on: ' + JSON.stringify(p))
  assert.equal(p.status, PLUGIN_STATUS.dshDisabled, label)
  assert.deepEqual(p.actions, expectedActions(p), label)
}

describe('Plugin defaults on a new install', () => {
  let host
  let home
  let fb
  let bare
  const LATE_LINK = JSON.stringify([{ name: ADDED_BUNDLE.name, dir: ADDED_BUNDLE.dir, enabled: true }])
  const reboot = async (env = {}) => {
    await host.stop()
    host = await bootHost(home, { env })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.sessionId, fb, 'same Fishball session')
    await settle(host)
  }
  const ordinaryTools = async () => toolNames((await turn(host, bare, [[{ text: 'hi' }]])).requests.at(-1))

  before(async () => {
    home = newHome('plugins-defaults')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  for (const [name, kind] of [[FIXTURE_BUNDLE.name, KIND.profile], [ONLY_BUNDLES.a.name, KIND.only]]) {
    it('DEF-01 ' + name + ' (' + kind + ', present at first start) is off for Fishball', T, async () => {
      const p = pluginIn((await host.state()).catalog, name)
      assertOff(p, name)
      assert.equal(p.kind, kind)
      assert.equal(p.changedBy, null)
    })
  }

  it('DEF-01 Fishball\'s default leaves DSH\'s profile alone: fbtest-tools is still enabled there', T, async () => {
    const b = (await host.call('allBundles')).find((x) => x.name === FIXTURE_BUNDLE.name)
    assert.equal(b?.enabled, true)
  })

  it('DEF-02 every DSH-optional bundle starts off', T, async (t) => {
    const optional = (await host.call('allBundles')).filter((b) => b.optional && b.name !== PACKAGE_NAME)
    if (optional.length === 0) t.diagnostic('no DSH-optional bundle in this installation')
    const c = (await host.state()).catalog
    for (const b of optional) assertOff(pluginIn(c, b.name), b.name)
  })

  it('DEF-03 fbtest-tools\' tools are absent from Fishball\'s requests and present for an ordinary session', T, async () => {
    const requests = await host.call('requests', { sessionId: fb })
    for (const r of [requests[0], requests.at(-1)]) for (const n of FIXTURE_UNCHECKED) assert.equal(toolNames(r).includes(n), false, n)
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })
    assert.equal(created.error, null)
    bare = created.sessionId
    const names = await ordinaryTools()
    for (const n of FIXTURE_UNCHECKED) assert.ok(names.includes(n), 'ordinary session has ' + n)
  })

  it('DEF-04 a restart keeps them off', LONG_T, async () => {
    await reboot()
    const c = (await host.state()).catalog
    assertOff(pluginIn(c, FIXTURE_BUNDLE.name), FIXTURE_BUNDLE.name)
    assertOff(pluginIn(c, ONLY_BUNDLES.a.name), ONLY_BUNDLES.a.name)
  })

  it('DEF-05 a user\'s choice survives a restart', LONG_T, async () => {
    assert.equal((await host.post(API.plugins, { plugin: FIXTURE_BUNDLE.name, on: true })).status, 200)
    await settle(host)
    await settledIdle(host, fb)
    await reboot()
    const p = pluginIn((await host.state()).catalog, FIXTURE_BUNDLE.name)
    assert.equal(p.on, true)
    assert.equal(p.status, PLUGIN_STATUS.dshEnabled)
    assert.equal(p.changedBy, CHANGED_BY.user)
  })

  it('DEF-06 a bundle installed and enabled in the profile while DSH runs starts off for Fishball', { timeout: 180000 }, async () => {
    const D = ADDED_BUNDLE_C
    const r = await host.call('installBundle', { spec: D.dir, enabled: true }, 120000)
    assert.equal(r.error, null, JSON.stringify(r))
    const c = await untilCatalog(host, (x) => pluginIn(x, D.name), 15000)
    assert.ok(c, 'listed within 15 s')
    const p = pluginIn(c, D.name)
    assert.equal(p.kind, KIND.profile)
    assertOff(p, D.name)
    bare ??= (await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })).sessionId
    await host.call('resume', { sessionId: bare })
    assert.equal((await nextTools(host, fb)).includes(D.tool), false, 'not in Fishball\'s request')
    assert.ok((await ordinaryTools()).includes(D.tool), 'an ordinary session has it')
  })

  it('DEF-07 a bundle installed but not enabled while DSH runs starts off', { timeout: 180000 }, async () => {
    const D = ADDED_BUNDLE_B
    const r = await host.call('installBundle', { spec: D.dir, enabled: false }, 120000)
    assert.equal(r.error, null, JSON.stringify(r))
    const c = await untilCatalog(host, (x) => pluginIn(x, D.name), 15000)
    assert.ok(c, 'listed')
    assert.equal(pluginIn(c, D.name).kind, KIND.only)
    assertOff(pluginIn(c, D.name), D.name)
  })

  it('DEF-08 a bundle installed and enabled while DSH was down starts off', LONG_T, async () => {
    await settledIdle(host, fb)
    await reboot({ FBTEST_LINK: LATE_LINK })
    const p = pluginIn(await catalogSettled(host), ADDED_BUNDLE.name)
    assert.equal(p?.kind, KIND.profile, 'precondition: enabled in the profile: ' + JSON.stringify(p))
    assertOff(p, ADDED_BUNDLE.name)
  })

  it('DEF-09 removed from the profile and installed again: off, the earlier choice forgotten', { timeout: 300000 }, async () => {
    const D = ADDED_BUNDLE_C
    assert.equal((await host.post(API.plugins, { plugin: D.name, on: true })).status, 200)
    const on = pluginIn(await catalogSettled(host), D.name)
    assert.equal(on.on, true, 'precondition: on for Fishball')
    const removed = await host.call('removeBundle', { name: D.name }, 120000)
    assert.equal(removed.error, null, JSON.stringify(removed))
    assert.ok(await untilCatalog(host, (x) => !pluginIn(x, D.name), 15000), 'leaves the catalog')
    const again = await host.call('installBundle', { spec: D.dir, enabled: true }, 120000)
    assert.equal(again.error, null, JSON.stringify(again))
    const c = await untilCatalog(host, (x) => pluginIn(x, D.name), 15000)
    assert.ok(c, 'listed again')
    const p = pluginIn(c, D.name)
    assertOff(p, D.name)
    assert.equal(p.changedBy, null, 'no stored choice')
  })
})
