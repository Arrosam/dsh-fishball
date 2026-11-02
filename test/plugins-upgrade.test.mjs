/**
 * Plugin statuses feature, defaults on an EXISTING install: a home first booted with the previous
 * version (commit f368ad2, extracted under .runtime with git archive) until Fishball is live, then
 * booted with this version. DSH plugins present at this version's first start keep their previous
 * state (no stored choice: on iff enabled in the profile; a stored choice wins); later ones start off.
 *
 * Profile at the old first boot: fbtest-tools (enabled), fbtest-added (enabled), fbtest-added-b
 * (enabled), fbtest-only, -b, -c, -edits (installed, not enabled). Choices made with the old version:
 * the user turned fbtest-added OFF and fbtest-only ON.
 *
 * | id     | technique (DT: present at upgrade × profile enabled × stored choice) | expected after the upgrade |
 * |--------|-----------|----------|
 * | UPG-00 | precondition | the old version made Fishball live and shows the old defaults and choices; the new boot resumes the same session |
 * | UPG-01 | present × enabled × none | fbtest-tools: on, dsh-enabled, [disable], changedBy null; its tools stay as before (unchecked; nothing turned off) |
 * | UPG-02 | present × disabled × none | fbtest-only-c: off, dsh-disabled, [enable] |
 * | UPG-03 | present × enabled × off | fbtest-added: off |
 * | UPG-04 | present × disabled × on | fbtest-only: on, dsh-enabled, its code runs for Fishball |
 * | UPG-05 | EP | every entry carries status/actions/removing following the decision table |
 * | UPG-06 | ST (installed while this version runs, enabled) | fbtest-added-c: off |
 * | UPG-07 | ST (restart of this version) | UPG-01..04 unchanged; fbtest-added-c still off (the upgrade defaults are not re-applied) |
 * | UPG-08 | ST (installed and enabled while DSH was down, after this version first started) | fbtest-source-only linked between boots: kind profile, off |
 * | UPG-09 | ST (present at upgrade, on by default → removed → installed again, enabled) | fbtest-added-b: on before; after reinstall off, changedBy null |
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { ACTION, ADDED_BUNDLE, ADDED_BUNDLE_B, ADDED_BUNDLE_C, API, FIXTURE_BUNDLE, KIND, OLD_VERSION, ONLY_BUNDLES, PLUGIN_STATUS, REPO, SOURCE_BUNDLES, STATUS, TEST_HOMES } from './support/constants.mjs'
import { HOOK, LONG_T, T, assertEntryContract, catalogSettled, pluginIn, settle, settledIdle, untilCatalog } from './support/expect.mjs'
import { bootHost, newHome } from './support/host.mjs'

const FIRST_LINKS = [ADDED_BUNDLE, ADDED_BUNDLE_B].map((b) => ({ name: b.name, dir: b.dir, enabled: true }))
const DOWN_LINK = [{ name: SOURCE_BUNDLES.only.name, dir: SOURCE_BUNDLES.only.dir, enabled: true }]

function assertState(p, label, on) {
  assert.ok(p, label + ' listed')
  assert.equal(p.on, on, label + ': ' + JSON.stringify(p))
  assert.equal(p.status, on ? PLUGIN_STATUS.dshEnabled : PLUGIN_STATUS.dshDisabled, label)
  assert.deepEqual(p.actions, [on ? ACTION.disable : ACTION.enable], label)
}

describe('Plugin defaults on an existing install (upgrade from the previous version)', () => {
  let host
  let home
  let fb
  let oldDir
  let oldCatalog

  const boot = async (env = {}) => {
    host = await bootHost(home, { env })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'live: ' + JSON.stringify(st))
    await settle(host)
    return st
  }
  const restart = async (env) => { await settledIdle(host, fb); await host.stop(); const st = await boot(env); assert.equal(st.sessionId, fb, 'same session') }
  const eventsOf = async (bundle) => (await host.call('bundleEvents', { bundle })).map((e) => e.type)

  before(async () => {
    // The previous version, extracted (not a worktree, so no branch or git metadata is touched).
    oldDir = path.join(path.dirname(TEST_HOMES), 'fbtest-old-' + process.pid)
    fs.rmSync(oldDir, { recursive: true, force: true })
    fs.mkdirSync(oldDir, { recursive: true })
    const tar = oldDir + '.tar'
    execFileSync('git', ['-C', REPO, 'archive', '--output', tar, OLD_VERSION.commit])
    execFileSync('tar', ['-x', '-f', tar, '-C', oldDir])
    fs.rmSync(tar, { force: true })
    home = newHome('plugins-upgrade')
    const old = await boot({ FBTEST_PLUGIN_DIR: oldDir, FBTEST_LINK: JSON.stringify(FIRST_LINKS) })
    fb = old.sessionId
    assert.equal((await host.post(API.plugins, { plugin: ADDED_BUNDLE.name, on: false })).status, 200)
    assert.equal((await host.post(API.plugins, { plugin: ONLY_BUNDLES.a.name, on: true })).status, 200)
    oldCatalog = await catalogSettled(host)
    await restart({})
  }, { timeout: 240000 })
  after(async () => {
    await host?.stop()
    if (oldDir && path.basename(path.dirname(oldDir)) === '.runtime') fs.rmSync(oldDir, { recursive: true, force: true })
  }, HOOK)

  it('UPG-00 precondition: the old version had the old defaults and the user\'s choices', T, () => {
    assert.equal(pluginIn(oldCatalog, FIXTURE_BUNDLE.name)?.on, true, 'old default: profile-enabled is on')
    assert.equal(pluginIn(oldCatalog, ADDED_BUNDLE_B.name)?.on, true)
    assert.equal(pluginIn(oldCatalog, ONLY_BUNDLES.c.name)?.on, false)
    assert.equal(pluginIn(oldCatalog, ADDED_BUNDLE.name)?.on, false, 'user choice off')
    assert.equal(pluginIn(oldCatalog, ONLY_BUNDLES.a.name)?.on, true, 'user choice on')
    assert.equal(pluginIn(oldCatalog, FIXTURE_BUNDLE.name).status, undefined, 'the old version has no status field (this really is the previous version)')
  })

  it('UPG-01 a profile-enabled plugin with no choice stays on; nothing is turned off', T, async () => {
    const c = (await host.state()).catalog
    const p = pluginIn(c, FIXTURE_BUNDLE.name)
    assertState(p, FIXTURE_BUNDLE.name, true)
    assert.equal(p.changedBy, null)
    const before = pluginIn(oldCatalog, FIXTURE_BUNDLE.name).tools.map((t) => t.name + ':' + t.status).sort()
    assert.deepEqual(p.tools.map((t) => t.name + ':' + t.status).sort(), before, 'tool statuses as before')
    assertState(pluginIn(c, ADDED_BUNDLE_B.name), ADDED_BUNDLE_B.name, true)
  })

  it('UPG-02 a profile-disabled plugin with no choice stays off', T, async () => {
    assertState(pluginIn((await host.state()).catalog, ONLY_BUNDLES.c.name), ONLY_BUNDLES.c.name, false)
  })

  it('UPG-03 a stored off wins over profile-enabled', T, async () => {
    const p = pluginIn((await host.state()).catalog, ADDED_BUNDLE.name)
    assert.equal(p?.kind, KIND.profile)
    assertState(p, ADDED_BUNDLE.name, false)
  })

  it('UPG-04 a stored on wins over profile-disabled, and the plugin runs for Fishball', T, async () => {
    const p = pluginIn((await host.state()).catalog, ONLY_BUNDLES.a.name)
    assert.equal(p?.kind, KIND.only)
    assertState(p, ONLY_BUNDLES.a.name, true)
    assert.equal((await eventsOf(ONLY_BUNDLES.a.name)).at(-1), 'apply')
  })

  it('UPG-05 every entry follows the status/actions table', T, async () => {
    for (const p of (await host.state()).catalog.plugins) assertEntryContract(assert, p)
  })

  it('UPG-06 a bundle installed and enabled while this version runs starts off', { timeout: 180000 }, async () => {
    const r = await host.call('installBundle', { spec: ADDED_BUNDLE_C.dir, enabled: true }, 120000)
    assert.equal(r.error, null, JSON.stringify(r))
    const c = await untilCatalog(host, (x) => pluginIn(x, ADDED_BUNDLE_C.name), 15000)
    assert.ok(c, 'listed')
    assert.equal(pluginIn(c, ADDED_BUNDLE_C.name).kind, KIND.profile)
    assertState(pluginIn(c, ADDED_BUNDLE_C.name), ADDED_BUNDLE_C.name, false)
  })

  it('UPG-07 a restart of this version keeps every state (the upgrade defaults are not applied again)', LONG_T, async () => {
    await restart({})
    const c = (await host.state()).catalog
    assertState(pluginIn(c, FIXTURE_BUNDLE.name), FIXTURE_BUNDLE.name, true)
    assertState(pluginIn(c, ONLY_BUNDLES.c.name), ONLY_BUNDLES.c.name, false)
    assertState(pluginIn(c, ADDED_BUNDLE.name), ADDED_BUNDLE.name, false)
    assertState(pluginIn(c, ONLY_BUNDLES.a.name), ONLY_BUNDLES.a.name, true)
    assertState(pluginIn(c, ADDED_BUNDLE_C.name), ADDED_BUNDLE_C.name, false)
  })

  it('UPG-08 a bundle installed and enabled while DSH was down, after this version first started, starts off', LONG_T, async () => {
    await restart({ FBTEST_LINK: JSON.stringify(DOWN_LINK) })
    const p = pluginIn(await catalogSettled(host), SOURCE_BUNDLES.only.name)
    assert.equal(p?.kind, KIND.profile, 'precondition: enabled in the profile: ' + JSON.stringify(p))
    assertState(p, SOURCE_BUNDLES.only.name, false)
  })

  it('UPG-09 a plugin present at the upgrade, removed and installed again, counts as new: off, choice forgotten', { timeout: 300000 }, async () => {
    const B = ADDED_BUNDLE_B
    assert.equal(pluginIn((await host.state()).catalog, B.name)?.on, true, 'precondition: on by the previous default')
    const removed = await host.call('removeBundle', { name: B.name }, 120000)
    assert.equal(removed.error, null, JSON.stringify(removed))
    assert.ok(await untilCatalog(host, (x) => !pluginIn(x, B.name), 15000), 'left the catalog')
    const again = await host.call('installBundle', { spec: B.dir, enabled: true }, 120000)
    assert.equal(again.error, null, JSON.stringify(again))
    const c = await untilCatalog(host, (x) => pluginIn(x, B.name), 15000)
    assert.ok(c, 'listed again')
    assertState(pluginIn(c, B.name), B.name, false)
    assert.equal(pluginIn(c, B.name).changedBy, null)
  })
})
