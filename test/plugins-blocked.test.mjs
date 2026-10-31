/**
 * Revision 10b (DESIGN §4 "Auditing" → "Known before trying"; §10d snapshot field `blocked`; S1, S32).
 * One host with the defective fixtures (FBTEST_REVIEW_BUNDLES), cases in order (state transitions).
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | BLK-01 ×N | DT (patch shape × kind) | GET state and list_plugins: fbtest-edits and fbtest-idinsert blocked edits-other-rows, fbtest-norows no-rows, each off with actions []; fbtest-only, fbtest-leak (not tried yet), fbtest-tools (profile) and every built-in blocked null with their usual actions |
 * | BLK-01b | EP (DSH's own bundles, S32) | agent-team and session-titles, when shipped: edits-other-rows, actions [] |
 * | BLK-02 ×2 | DT (blocked from the patch × route / tool) | fbtest-edits and fbtest-norows: POST plugins on 409 {ok:false, code:'refused'}; set_plugin_enabled {ok:false, code: its blocked value}, no prompt; still off, blocked, actions []; its code never ran |
 * | BLK-03 | ST null -user on-> off, leaks-service | fbtest-leak: ends off with lastError and blocked leaks-service, actions []; every apply disposed; its service not left in DSH's root realm; fbtest-only keeps running; assistant live; profile unchanged |
 * | BLK-04 | ST blocked leaks-service -on-> refused | POST plugins on 409 refused; set_plugin_enabled {ok:false, code:'leaks-service'}; no new apply; still blocked, actions [] |
 * | BLK-05 | ST (Fishball turns it on) | fbtest-leak-b with set_plugin_enabled and Allow: the answer is ok:false leaks-service or ok:true (A132); either way it ends off with lastError and blocked leaks-service, actions [] |
 * | BLK-06 | DT (installed for Fishball only × edits other rows) | install 200, on false; entry fishball-installed, blocked edits-other-rows, actions [uninstall]; its code never ran; uninstall route 200 and the entry goes; profile files unchanged |
 * | BLK-07 | ST (restart) | fbtest-leak still blocked leaks-service, off, actions [] after a restart |
 * | BLK-08 | ST leaks-service -removed and installed again-> null | fbtest-installed-leak installed (not enabled) in the profile through DSH's plugin manager, turned on: blocked leaks-service; removed and installed again: blocked null, off, actions [enable] |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  ACTION, API, BLOCKED, BUILTINS, CODE, DSH_BLOCKED_BUNDLES, FIXTURE_BUNDLE, INSTALLED_EDITS_BUNDLE, INSTALLED_KEY, INSTALLED_LEAK_BUNDLE, INSTALL_API, KIND,
  ONLY_BUNDLES, OUTCOME, REVIEW_BUNDLES, STATUS,
} from './support/constants.mjs'
import { HOOK, INSTALL_MS, T, catalogSettled, expectedActions, listPlugins, pluginIn, profileSnapshot, setPlugin, settle, settledIdle, untilCatalog } from './support/expect.mjs'
import { bootHost, newHome, until } from './support/host.mjs'

const L = REVIEW_BUNDLES.leak
const LB = REVIEW_BUNDLES.leakB
const A = ONLY_BUNDLES.a
const E = ONLY_BUNDLES.edits
const INSTALLED = INSTALLED_KEY(INSTALLED_EDITS_BUNDLE.name)
const INSTALL_T = { timeout: INSTALL_MS + 30000 }
const PROFILE_INSTALL_T = { timeout: 300000 }
const PROFILE_INSTALL_MS = 120000
const APPLY_MS = 10000

/** BLK-01's decision table: plugin key → the `blocked` value its entry must report before anything is tried. */
const BLOCKED_TABLE = [
  [E.name, BLOCKED.editsOtherRows],
  [REVIEW_BUNDLES.idinsert.name, BLOCKED.editsOtherRows],
  [REVIEW_BUNDLES.norows.name, BLOCKED.noRows],
  [A.name, null],
  [L.name, null],
  [FIXTURE_BUNDLE.name, null],
  ...Object.keys(BUILTINS).map((key) => [key, null]),
]

describe('Revision 10b: blocked plugins', () => {
  let host
  let home
  let fb
  let profile

  const boot = async () => {
    host = await bootHost(home, { env: { FBTEST_REVIEW_BUNDLES: '1' } })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'precondition: live: ' + JSON.stringify(st))
    await settle(host)
    return st.sessionId
  }
  const eventsOf = async (bundle) => (await host.call('bundleEvents', { bundle })).map((e) => e.type)
  const runningOf = async (bundle) => (await eventsOf(bundle)).at(-1) === 'apply'
  const toggle = (plugin, on) => host.post(API.plugins, { plugin, on })
  const inRoot = async (service) => (await host.call('rootServices', { names: [service] }))[service]
  /** The entry once its lastError is set (or the latest entry after APPLY_MS). */
  const untilError = async (plugin) => pluginIn(await untilCatalog(host, (c) => pluginIn(c, plugin)?.lastError, APPLY_MS) || (await host.state()).catalog, plugin)
  /** Blocked and off: the reason, no enable (installed in Fishball only: uninstall stays). */
  const expectBlocked = (p, blocked, label = p?.plugin) => {
    assert.ok(p, label + ' listed')
    assert.equal(p.on, false, label + ' ' + JSON.stringify(p))
    assert.equal(p.blocked, blocked, label + ' ' + JSON.stringify(p))
    assert.deepEqual(p.actions, p.kind === KIND.installed ? [ACTION.uninstall] : [], label + ' actions')
  }
  /** The route answers 409 refused and set_plugin_enabled refuses with the blocked code, asking nobody. */
  const expectRefused = async (plugin, code) => {
    const res = await toggle(plugin, true)
    assert.equal(res.status, 409, res.text)
    assert.deepEqual(res.json, { ok: false, code: CODE.refused })
    const r = await setPlugin(host, fb, plugin, true, OUTCOME.allow)
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, code, r.result.text)
    assert.equal(r.approvals.length, 0, 'no prompt')
  }
  const expectLeaked = (p) => {
    assert.equal(p.lastError, CODE.leaksService, JSON.stringify(p))
    expectBlocked(p, BLOCKED.leaksService)
  }

  before(async () => {
    home = newHome('plugins-blocked')
    fb = await boot()
    profile = profileSnapshot(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  describe('known from the patch', () => {
    let listed
    let state
    before(async () => { listed = await listPlugins(host, fb); state = (await host.state()).catalog }, HOOK)

    for (const [key, blocked] of BLOCKED_TABLE) {
      it('BLK-01 ' + key + ' reports blocked ' + blocked + ' with the matching actions', T, () => {
        for (const [label, catalog] of [['GET state', state], ['list_plugins', listed]]) {
          const p = pluginIn(catalog, key)
          assert.ok(p, label + ' lists ' + key)
          assert.equal(p.blocked, blocked, label + ' ' + JSON.stringify(p))
          assert.deepEqual(p.actions, expectedActions(p), label + ' actions')
          if (blocked !== null) expectBlocked(p, blocked, label + ' ' + key)
        }
      })
    }

    it('BLK-01b DSH\'s own bundles that edit other rows are blocked with no action (S32)', T, (t) => {
      const shipped = DSH_BLOCKED_BUNDLES.filter((key) => pluginIn(state, key))
      if (shipped.length === 0) t.diagnostic('this installation ships none of ' + DSH_BLOCKED_BUNDLES.join(', '))
      for (const key of shipped) expectBlocked(pluginIn(state, key), BLOCKED.editsOtherRows)
    })

    for (const [plugin, blocked] of [[E.name, BLOCKED.editsOtherRows], [REVIEW_BUNDLES.norows.name, BLOCKED.noRows]]) {
      it('BLK-02 turning ' + plugin + ' on is refused, and it stays blocked ' + blocked, T, async () => {
        await expectRefused(plugin, blocked)
        expectBlocked(pluginIn(await catalogSettled(host), plugin), blocked)
        assert.deepEqual(await eventsOf(plugin), [], 'its code never ran')
      })
    }
  })

  describe('found when Fishball turned it off for publishing a service', () => {
    it('BLK-03 a plugin publishing a service ends off with lastError and blocked leaks-service', T, async () => {
      assert.equal((await toggle(A.name, true)).status, 200)
      assert.ok(await untilCatalog(host, (c) => pluginIn(c, A.name)?.applied === true, APPLY_MS), 'precondition: another Fishball-only plugin runs')
      assert.equal((await toggle(L.name, true)).status, 200)
      expectLeaked(await untilError(L.name))
      await settle(host)
      const events = await eventsOf(L.name)
      assert.ok(events.length > 0, 'precondition: it was mounted')
      assert.equal(events.filter((e) => e === 'apply').length, events.filter((e) => e === 'dispose').length, 'every apply disposed: ' + JSON.stringify(events))
      assert.ok(await until(async () => !(await inRoot(L.service)), APPLY_MS, 50), 'its service is not left in DSH\'s root realm')
      assert.ok(await runningOf(A.name), 'the other Fishball-only plugin keeps running')
      assert.equal(pluginIn((await host.state()).catalog, A.name).applied, true)
      assert.equal((await host.state()).status, STATUS.live)
      assert.deepEqual(profileSnapshot(home), profile, 'the DSH profile files are unchanged')
    })

    it('BLK-04 turning it on again is refused with leaks-service; its code does not run again', T, async () => {
      const before = (await eventsOf(L.name)).length
      await expectRefused(L.name, CODE.leaksService)
      await settle(host)
      assert.equal((await eventsOf(L.name)).length, before, 'no new apply')
      expectLeaked(pluginIn((await host.state()).catalog, L.name))
    })

    it('BLK-05 Fishball turning a service-publishing plugin on also ends blocked leaks-service', T, async (t) => {
      const r = await setPlugin(host, fb, LB.name, true, OUTCOME.allow)
      t.diagnostic('answer: ' + r.result.text.slice(0, 300))
      if (r.json?.ok === false) assert.equal(r.json.code, CODE.leaksService, r.result.text)
      else assert.equal(r.json?.ok, true, r.result.text)
      expectLeaked(await untilError(LB.name))
      await settle(host)
      assert.equal(await runningOf(LB.name), false, 'not running')
      assert.equal(await inRoot(LB.service), false)
    })

    it('BLK-06 a plugin installed for Fishball only whose patch edits other rows is blocked but can be uninstalled', INSTALL_T, async () => {
      await settledIdle(host, fb)
      const res = await host.post(INSTALL_API.install, { spec: INSTALLED_EDITS_BUNDLE.dir, requestId: 'fbtest-blk-06', approvedBuilds: [] })
      assert.equal(res.status, 200, res.text)
      assert.equal(res.json?.ok, true)
      assert.equal(res.json.plugin, INSTALLED)
      assert.equal(res.json.on, false, 'turning it on is refused: ' + res.text)
      const c = await untilCatalog(host, (x) => pluginIn(x, INSTALLED), INSTALL_MS)
      const p = pluginIn(c, INSTALLED)
      assert.equal(p?.kind, KIND.installed, JSON.stringify(p))
      expectBlocked(p, BLOCKED.editsOtherRows)
      assert.deepEqual(await eventsOf(INSTALLED_EDITS_BUNDLE.name), [], 'its code never ran')
      const removed = await host.post(API.pluginsRemove, { plugin: INSTALLED })
      assert.equal(removed.status, 200, removed.text)
      assert.ok(await untilCatalog(host, (x) => !pluginIn(x, INSTALLED), INSTALL_MS), 'the entry goes')
      assert.deepEqual(profileSnapshot(home), profile, 'the DSH profile files are unchanged')
    })

    it('BLK-07 leaks-service stays after a restart', T, async () => {
      await settledIdle(host, fb)
      await host.stop()
      assert.equal(await boot(), fb, 'same Fishball session')
      expectLeaked(pluginIn(await catalogSettled(host), L.name))
      assert.deepEqual(await eventsOf(L.name), [], 'its code did not run at the boot')
    })

    it('BLK-08 removing the plugin and installing it again clears leaks-service', PROFILE_INSTALL_T, async () => {
      const D = INSTALLED_LEAK_BUNDLE
      const r = await host.call('installBundle', { spec: D.dir, enabled: false }, PROFILE_INSTALL_MS)
      assert.equal(r.error, null, JSON.stringify(r))
      assert.ok(await untilCatalog(host, (x) => pluginIn(x, D.name), 15000), 'precondition: listed')
      assert.equal((await toggle(D.name, true)).status, 200)
      expectLeaked(await untilError(D.name))
      const removed = await host.call('removeBundle', { name: D.name }, PROFILE_INSTALL_MS)
      assert.equal(removed.error, null, JSON.stringify(removed))
      assert.ok(await untilCatalog(host, (x) => !pluginIn(x, D.name), 15000), 'leaves the catalog')
      const again = await host.call('installBundle', { spec: D.dir, enabled: false }, PROFILE_INSTALL_MS)
      assert.equal(again.error, null, JSON.stringify(again))
      const c = await untilCatalog(host, (x) => pluginIn(x, D.name), 15000)
      const p = pluginIn(c, D.name)
      assert.equal(p?.blocked, null, JSON.stringify(p))
      assert.equal(p.on, false)
      assert.deepEqual(p.actions, [ACTION.enable])
    })
  })
})
