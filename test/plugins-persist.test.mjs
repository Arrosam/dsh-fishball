/**
 * P3 R10 (persistence across a restart, audit retention) and R12 (add_plugin).
 *
 * | id     | technique              | requirement                                                | expected |
 * |--------|------------------------|------------------------------------------------------------|----------|
 * | PER-01 | ST (choices -restart-> same choices) | plugin choices and allowances survive a restart | catalog (plugin, kind, on, changedBy, tool statuses) and allowedTools equal before and after; Fishball's request lists the same tools; the Fishball-only plugin runs again |
 * | PER-02 | EP                     | storage tables                                             | $DSH_HOME/storages/fishball.json has tables plugins, tool_approvals and plugin_changes, each non-empty |
 * | PER-03 | BVA (auditEntriesKept = 2, three more changes) | audit keeps the newest N               | plugin_changes has at most 2 entries; the newest change is kept, the oldest of the three is gone |
 * | ADD-01 | DT (answer rejected)   | add_plugin installs nothing without Allow once             | one approval, toolName add_plugin, reason contains the spec and the reason; {ok:false, code:'rejected'}; profile package.json byte-identical; package not installed in the profile or Fishball's folder |
 * | ADD-02 | DT (answer allowed-once) | add_plugin installs into Fishball's own folder (plugin statuses) | Fishball's folder has it; the profile package.json is byte-identical and lacks it; listBundles unchanged; catalog lists fishball:fbtest-added, kind fishball-installed, on |
 * | ADD-03 | ST (added -> on, by add_plugin itself) | it runs for Fishball only                         | its code runs; its tool appears in Fishball's next request only |
 * | ADD-04 | ST (restart) | a Fishball-installed plugin survives a restart                          | still listed, on, and running after a restart |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { ADDED_BUNDLE, API, CODE, FIXTURE_BUNDLE, INSTALLED_KEY, KIND, LIMITS, ONLY_BUNDLES, OUTCOME, PRESET, PROFILE, STATUS, STORE } from './support/constants.mjs'
import { HOOK, LONG_T, T, addPlugin, allowFixtures, fishballTool, inFishballFolder, inProfile, listPlugins, nextTools, pluginIn, setPlugin, settle, toolNames, turn } from './support/expect.mjs'
import { bootHost, bootLive, newHome, until } from './support/host.mjs'

const readStore = (home) => JSON.parse(fs.readFileSync(STORE.file(home), 'utf8'))
/** The parts of a catalog that must survive a restart. */
const persistent = (catalog) => ({
  plugins: catalog.plugins.map((p) => ({ plugin: p.plugin, kind: p.kind, on: p.on, changedBy: p.changedBy, tools: p.tools.map((t) => t.name + ':' + t.status).sort() })),
  allowedTools: catalog.allowedTools.map((a) => a.key).sort(),
})

describe('P3 persistence', () => {
  let host
  let home
  let fb
  let before1
  let toolsBefore

  before(async () => {
    home = newHome('plugins-persist')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    await settle(host)
    // One choice of each kind: allowances, Fishball turning a built-in on, a Fishball-only plugin, a user toggle off.
    await allowFixtures(host, fb)
    assert.equal((await setPlugin(host, fb, 'builtin:shell', true)).json?.ok, true)
    assert.equal((await setPlugin(host, fb, ONLY_BUNDLES.a.name, true, OUTCOME.allow)).json?.ok, true)
    assert.equal((await host.post(API.plugins, { plugin: 'builtin:reminders', on: false })).status, 200)
    await settle(host)
    before1 = await listPlugins(host, fb)
    toolsBefore = await nextTools(host, fb)
    await host.stop()
    host = await bootHost(home)
    assert.equal((await host.waitStatus(STATUS.live))?.sessionId, fb)
    await settle(host)
  }, { timeout: 120000 })
  after(async () => { await host?.stop() }, HOOK)

  it('PER-01 plugin states, tool visibility and allowances are the same after a restart', T, async () => {
    const after1 = await listPlugins(host, fb)
    assert.deepEqual(persistent(after1), persistent(before1))
    assert.deepEqual((await nextTools(host, fb)).sort(), [...toolsBefore].sort())
    assert.ok(toolsBefore.includes('demo_echo') && toolsBefore.includes('bash') && toolsBefore.includes(ONLY_BUNDLES.a.tool), 'precondition: the choices were in effect')
    assert.equal(toolsBefore.includes('schedule_create'), false)
    assert.equal((await host.call('bundleEvents', { bundle: ONLY_BUNDLES.a.name })).at(-1)?.type, 'apply', 'the Fishball-only plugin runs again')
  })

  it('PER-02 the choices live in fishball.json tables plugins, tool_approvals and plugin_changes', T, () => {
    const tables = readStore(home).tables ?? {}
    for (const t of ['plugins', 'tool_approvals', 'plugin_changes']) {
      assert.equal(typeof tables[t], 'object', 'table ' + t)
      assert.ok(Object.keys(tables[t]).length > 0, 'table ' + t + ' is empty')
    }
  })

  it('PER-03 plugin_changes keeps at most auditEntriesKept newest entries', T, async () => {
    const KEEP = 2
    const r = await host.call('settingsUpdate', { patch: { auditEntriesKept: KEEP } })
    assert.equal(r.ok, true, JSON.stringify(r.error))
    try {
      const order = ['builtin:ask-user', 'builtin:skills', 'builtin:time']
      for (const key of order) {
        const on = key === 'builtin:time' ? false : true
        assert.equal((await host.post(API.plugins, { plugin: key, on })).status, 200, key)
        await settle(host)
      }
      const entries = await until(() => {
        const rows = Object.values(readStore(home).tables?.plugin_changes ?? {})
        return rows.some((e) => JSON.stringify(e).includes('builtin:time')) && rows.length <= KEEP ? rows : false
      }, 5000, 100)
      const rows = Object.values(readStore(home).tables?.plugin_changes ?? {})
      assert.ok(entries, 'at most ' + KEEP + ' entries including the newest: ' + JSON.stringify(rows))
      assert.equal(rows.some((e) => JSON.stringify(e).includes('builtin:ask-user')), false, 'the oldest of the three was dropped')
    } finally {
      await host.call('settingsUpdate', { patch: { auditEntriesKept: LIMITS.auditEntriesKept.default } })
    }
  })
})

describe('P3 add_plugin', () => {
  let host
  let home
  let fb
  let bare
  const profileJson = () => fs.readFileSync(path.join(home, 'profiles', PROFILE, 'package.json'), 'utf8')
  const REASON = 'fbtest wants the added echo tool'

  before(async () => {
    home = newHome('plugins-add')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })
    assert.equal(created.error, null)
    bare = created.sessionId
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('ADD-01 add_plugin answered Reject installs nothing', T, async () => {
    const pkg = profileJson()
    const r = await fishballTool(host, fb, 'add_plugin', { spec: ADDED_BUNDLE.dir, reason: REASON }, OUTCOME.reject)
    assert.equal(r.approvals.length, 1, 'one approval question')
    assert.equal(r.approvals[0].toolName, 'add_plugin')
    assert.ok(r.approvals[0].reason.includes(ADDED_BUNDLE.dir), 'reason names the spec: ' + r.approvals[0].reason)
    assert.ok(r.approvals[0].reason.includes(REASON), 'reason carries the given reason')
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, CODE.rejected)
    assert.equal(profileJson(), pkg, 'profile package.json byte-identical')
    assert.equal(fs.existsSync(path.join(home, 'profiles', PROFILE, 'node_modules', ADDED_BUNDLE.name)), false)
    assert.equal(inFishballFolder(home, ADDED_BUNDLE.name), false)
  })

  it('ADD-02 add_plugin answered Allow once installs into Fishball\'s own folder, not the profile', LONG_T, async () => {
    const before = profileJson()
    const bundles = JSON.stringify(await host.call('allBundles'))
    const r = await addPlugin(host, fb, ADDED_BUNDLE.dir, OUTCOME.allow, REASON)
    assert.ok(r.approvals.length >= 1)
    assert.equal(r.approvals[0].toolName, 'add_plugin')
    assert.equal(r.json?.ok, true, r.result.text)
    assert.ok(inFishballFolder(home, ADDED_BUNDLE.name), 'in Fishball\'s folder')
    assert.equal(profileJson(), before, 'profile package.json byte-identical')
    assert.equal(inProfile(home, ADDED_BUNDLE.name), false)
    assert.equal(JSON.stringify(await host.call('allBundles')), bundles, 'listBundles unchanged')
    assert.equal((await host.call('globalToolNames')).includes(ADDED_BUNDLE.tool), false)
    assert.equal(toolNames((await turn(host, bare, [[{ text: 'hi' }]])).requests.at(-1)).includes(ADDED_BUNDLE.tool), false)
    await settle(host)
    const p = pluginIn(await listPlugins(host, fb), INSTALLED_KEY(ADDED_BUNDLE.name))
    assert.equal(p?.kind, KIND.installed)
    assert.equal(p.on, true)
  })

  it('ADD-03 the added plugin, on after add_plugin, runs for Fishball only', T, async () => {
    assert.ok((await nextTools(host, fb)).includes(ADDED_BUNDLE.tool))
    assert.equal((await host.call('bundleEvents', { bundle: ADDED_BUNDLE.name })).at(-1)?.type, 'apply')
    assert.equal((await host.call('globalToolNames')).includes(ADDED_BUNDLE.tool), false)
    assert.equal(toolNames((await turn(host, bare, [[{ text: 'hi' }]])).requests.at(-1)).includes(ADDED_BUNDLE.tool), false)
  })

  it('ADD-04 a Fishball-installed plugin survives a restart: listed, on and running', LONG_T, async () => {
    await host.stop()
    host = await bootHost(home)
    assert.equal((await host.waitStatus(STATUS.live))?.sessionId, fb)
    await settle(host)
    const p = pluginIn((await host.state()).catalog, INSTALLED_KEY(ADDED_BUNDLE.name))
    assert.equal(p?.on, true, JSON.stringify(p))
    assert.equal((await host.call('bundleEvents', { bundle: ADDED_BUNDLE.name })).at(-1)?.type, 'apply')
    assert.ok((await nextTools(host, fb)).includes(ADDED_BUNDLE.tool))
  })
})
