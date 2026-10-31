/**
 * Revision 10c on an EXISTING install: a home first booted with the version before revision 10c (PRE_OWN_PLUGINS,
 * extracted under .runtime with git archive, as messenger-upgrade does), where the user turned the Messenger
 * look off, then booted with this version. The store has no choice for the four new plugins.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | UPO-00 | precondition | the old version has no builtin:session-messages entry and no features field |
 * | UPO-01 ×4 | DT (existing install × no stored choice) | each new own plugin: on, applied, dsh fishball, status builtin, [disable], changedBy null |
 * | UPO-02 | DT (existing install × stored choice for the Messenger look) | the Messenger look stays off (changedBy user) and now reports dsh fishball |
 * | UPO-03 | EP | features all true; message_fishball registered for other sessions; otherTools has none of Fishball's own tools |
 * | UPO-04 | ST (user off → restart) | Session watching stays off: changedBy user, features.watching false, POST watches 409 feature-off |
 * | UPO-05 | ST (user on → restart) | on again after the restart; features.watching true |
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { ACTION, API, CHANGED_BY, DSH_STATE, FEATURE_OFF, INBOUND_TOOL, KIND, MESSENGER, OWN_PLUGINS, PLUGIN_STATUS, PRE_OWN_PLUGINS, PRESET, REPO, STATUS, TEST_HOMES, WATCH_API } from './support/constants.mjs'
import { HOOK, T, catalogSettled, pluginIn, settle, settledIdle, turn } from './support/expect.mjs'
import { bootHost, newHome } from './support/host.mjs'

const LONG = { timeout: 150000 }
const ALL_OWN_TOOLS = Object.values(OWN_PLUGINS).flatMap((p) => p.tools)

describe('Revision 10c on an existing install (upgrade from the version before it)', () => {
  let host
  let home
  let fb
  let oldDir
  let oldState

  const boot = async (env = {}) => {
    host = await bootHost(home, { env })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'live: ' + JSON.stringify(st))
    await settle(host)
    return st
  }
  const restart = async (env) => { await settledIdle(host, fb); await host.stop(); const st = await boot(env); assert.equal(st.sessionId, fb, 'same session') }

  before(async () => {
    oldDir = path.join(path.dirname(TEST_HOMES), 'fbtest-preownplugins-' + process.pid)
    fs.rmSync(oldDir, { recursive: true, force: true })
    fs.mkdirSync(oldDir, { recursive: true })
    const tar = oldDir + '.tar'
    execFileSync('git', ['-C', REPO, 'archive', '--output', tar, PRE_OWN_PLUGINS.commit])
    execFileSync('tar', ['-x', '-f', tar, '-C', oldDir])
    fs.rmSync(tar, { force: true })
    home = newHome('own-plugins-upgrade')
    const old = await boot({ FBTEST_PLUGIN_DIR: oldDir })
    fb = old.sessionId
    assert.equal((await host.post(API.plugins, { plugin: MESSENGER.key, on: false })).status, 200)
    await catalogSettled(host)
    oldState = await host.state()
    await restart({})
  }, { timeout: 240000 })
  after(async () => {
    await host?.stop()
    if (oldDir && path.basename(path.dirname(oldDir)) === '.runtime') fs.rmSync(oldDir, { recursive: true, force: true })
  }, HOOK)

  it('UPO-00 precondition: the old version has no own plugins and no features', T, () => {
    assert.equal(pluginIn(oldState.catalog, OWN_PLUGINS.messages.key), undefined)
    assert.equal(Object.hasOwn(oldState, 'features'), false)
  })

  for (const spec of Object.values(OWN_PLUGINS)) {
    it('UPO-01 ' + spec.key + ' is on after the upgrade, with no stored choice', T, async () => {
      const p = pluginIn(await catalogSettled(host), spec.key)
      assert.ok(p, 'listed')
      assert.equal(p.kind, KIND.builtin)
      assert.equal(p.dsh, DSH_STATE.fishball)
      assert.equal(p.status, PLUGIN_STATUS.builtin)
      assert.equal(p.on, true)
      assert.equal(p.applied, true)
      assert.deepEqual(p.actions, [ACTION.disable])
      assert.equal(p.changedBy, null)
    })
  }

  it('UPO-02 the Messenger look keeps the user\'s off and moves to the Fishball group', T, async () => {
    const p = pluginIn(await catalogSettled(host), MESSENGER.key)
    assert.equal(p.on, false)
    assert.equal(p.changedBy, CHANGED_BY.user)
    assert.equal(p.dsh, DSH_STATE.fishball)
  })

  it('UPO-03 every feature runs; message_fishball is registered; no own tool in otherTools', T, async () => {
    const s = await host.state()
    assert.deepEqual(s.features, { approvals: true, messages: true, plugins: true, watching: true })
    assert.ok((await host.call('globalToolNames')).includes(INBOUND_TOOL))
    for (const n of ALL_OWN_TOOLS) assert.equal(s.catalog.otherTools.some((t) => t.name === n), false, n + ' in otherTools')
  })

  it('UPO-04 Session watching turned off by the user stays off after a restart', LONG, async () => {
    const key = OWN_PLUGINS.watching.key
    assert.equal((await host.post(API.plugins, { plugin: key, on: false })).status, 200)
    await restart({})
    const p = pluginIn(await catalogSettled(host), key)
    assert.equal(p.on, false)
    assert.equal(p.changedBy, CHANGED_BY.user)
    assert.equal((await host.state()).features.watching, false)
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder: 'upo-04' })).sessionId
    await turn(host, sid, [[{ text: 'x' }]])
    const r = await host.post(WATCH_API.add, { sessionId: sid })
    assert.equal(r.status, 409, r.text)
    assert.equal(r.json?.code, FEATURE_OFF)
  })

  it('UPO-05 turned on again, it is on after a restart', LONG, async () => {
    const key = OWN_PLUGINS.watching.key
    assert.equal((await host.post(API.plugins, { plugin: key, on: true })).status, 200)
    await restart({})
    assert.equal(pluginIn(await catalogSettled(host), key)?.on, true)
    assert.equal((await host.state()).features.watching, true)
  })
})
