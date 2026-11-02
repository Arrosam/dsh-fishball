/**
 * P3 second post-review round: R1 shadowing, R2 a listing mount that throws, R3 all-or-nothing
 * enable, R4 repeated breakage in one apply. (R5 and R6 stay REV-01 and REV-17a.)
 *
 * Host D boots with the defective fixtures (FBTEST_REVIEW_BUNDLES) and fbtest-tools registering
 * demo_echo and schedule_list again in every new agent's own scope (FBTEST_AGENT_SCOPE_SHADOW).
 *
 * | id     | technique              | req | expected |
 * |--------|------------------------|-----|----------|
 * | SHD-01 | EP (agent-scope copy of a visible fixture tool, demo_echo allowed) | R1 | Fishball's call is a tool error; no body runs for Fishball |
 * | SHD-02 | EP (agent-scope copy of a visible built-in tool, schedule_list) | R1 | tool error; the agent-scope body does not run for Fishball |
 * | SHD-03 | EP (ordinary session)  | R1  | the same names run normally in an ordinary session |
 * | SHD-04 | EP (control)           | R1  | a visible tool nobody shadows (web_fetch's neighbour schedule_create) is not refused as masked |
 * | THR-01 ×2 | EP (apply throws / module import throws) | R2 | set_plugin_enabled answers ok:false; not applied; every recorded apply is followed by a dispose; assistant and other plugins keep running |
 * | THR-02 ×2 | ST (later apply)       | R2  | after another plugin change is applied, the plugin is still not applied and no new apply is recorded |
 * | ATM-01 | ST (approved, then refused by the limit before the write) | R3 | {ok:false}; allowedTools in GET state unchanged; its tool stays hidden; its code is not running |
 * | BRK-01 | ST (two leaking plugins applied together at one idle) | R4 | both off with lastError leaks-service; their code disposed; another Fishball-only plugin and the built-ins keep running; assistant live |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, APPROVER_HOLDS, CODE, LIMITS, ONLY_BUNDLES, OUTCOME, PRESET, REVIEW_BUNDLES, STATUS } from './support/constants.mjs'
import { HOOK, T, allowFixtures, callScript, callTool, listPlugins, nextTools, pluginIn, setPlugin, settle, toolNames } from './support/expect.mjs'
import { bootHost, newHome, until } from './support/host.mjs'

describe('P3 review round 2 (host D)', () => {
  let host
  let fb
  let bare

  const eventsOf = async (bundle) => (await host.call('bundleEvents', { bundle })).map((e) => e.type)
  const runningOf = async (bundle) => (await eventsOf(bundle)).at(-1) === 'apply'
  /** Every apply is followed by its dispose. */
  const expectDisposed = (events, label) => {
    assert.equal(events.filter((e) => e === 'apply').length, events.filter((e) => e === 'dispose').length, label + ' events ' + JSON.stringify(events))
    assert.notEqual(events.at(-1), 'apply', label + ' still running')
  }
  const expectAlive = async () => {
    const s = await host.state()
    assert.equal(s.status, STATUS.live)
    assert.equal(pluginIn(s.catalog, 'builtin:web').applied, true, 'built-ins keep running')
  }
  const fbCalls = async (name) => (await host.call('fixtureCalls', { name, sessionId: fb })).length

  before(async () => {
    host = await bootHost(newHome('review-d'), { env: { FBTEST_REVIEW_BUNDLES: '1', FBTEST_AGENT_SCOPE_SHADOW: 'demo_echo,schedule_list' } })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    assert.equal(typeof fb, 'string', 'precondition: live')
    await settle(host)
    await allowFixtures(host, fb)
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })
    assert.equal(created.error, null)
    bare = created.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  describe('R1 a same-name tool in Fishball\'s agent scope', () => {
    it('precondition: the fixture registered the shadow names for Fishball and the tools are visible in the catalog', T, async () => {
      assert.ok((await host.call('agentScoped')).includes(fb), 'shadow registered in Fishball\'s scope')
      const c = await listPlugins(host, fb)
      assert.equal(c.plugins.find((p) => p.plugin === 'fbtest-tools').tools.find((t) => t.name === 'demo_echo')?.status, 'visible')
      assert.equal(c.plugins.find((p) => p.plugin === 'builtin:reminders').tools.find((t) => t.name === 'schedule_list')?.status, 'visible')
    })

    it('SHD-01 calling the shadowed demo_echo is refused and no definition runs for Fishball', T, async (t) => {
      t.diagnostic('demo_echo in Fishball\'s request: ' + (await nextTools(host, fb)).includes('demo_echo'))
      const before = await fbCalls('demo_echo')
      const { result } = await callTool(host, fb, 'demo_echo', { text: 'x' })
      assert.equal(result.isError, true, result.text)
      assert.equal(await fbCalls('demo_echo'), before, 'a demo_echo body ran for Fishball')
    })

    it('SHD-02 calling the shadowed schedule_list is refused and the agent-scope body does not run', T, async () => {
      const before = await fbCalls('schedule_list')
      const { result } = await callTool(host, fb, 'schedule_list', {})
      assert.equal(result.isError, true, result.text)
      assert.equal(await fbCalls('schedule_list'), before)
    })

    it('SHD-03 an ordinary session runs the same names normally', T, async () => {
      for (const name of ['demo_echo', 'schedule_list']) {
        const before = (await host.call('fixtureCalls', { name, sessionId: bare })).length
        const { result } = await callTool(host, bare, name, { text: 'x' })
        assert.equal(result.isError, false, name + ': ' + result.text)
        assert.equal((await host.call('fixtureCalls', { name, sessionId: bare })).length, before + 1, name)
      }
    })

    it('SHD-04 control: a visible tool that nobody shadows still runs for Fishball', T, async () => {
      const before = await fbCalls('pwsh')
      const { result } = await callTool(host, fb, 'pwsh', { command: 'echo fbtest', description: 'fbtest' })
      assert.equal(result.isError, false, result.text)
      assert.equal(await fbCalls('pwsh'), before + 1)
    })
  })

  describe('R2 a listing mount that throws', () => {
    for (const key of ['throws', 'importThrows']) {
      const B = REVIEW_BUNDLES[key]
      it('THR-01 ' + B.name + ': not applied after set_plugin_enabled and its code disposed', T, async (t) => {
        const r = await setPlugin(host, fb, B.name, true, OUTCOME.allow)
        t.diagnostic(B.name + ' answer: ' + r.result.text.slice(0, 200))
        assert.equal(r.json?.ok, false, r.result.text)
        await settle(host)
        const entry = pluginIn((await host.state()).catalog, B.name)
        t.diagnostic(B.name + ' entry: ' + JSON.stringify({ on: entry.on, applied: entry.applied, lastError: entry.lastError }))
        assert.equal(entry.applied, false)
        const events = await eventsOf(B.name)
        t.diagnostic(B.name + ' events: ' + JSON.stringify(events))
        // Precondition: the mount was really attempted (its module was imported or its apply ran).
        assert.ok(events.includes(key === 'throws' ? 'apply' : 'import'), 'mount attempted: ' + JSON.stringify(events))
        expectDisposed(events, B.name)
        assert.equal((await nextTools(host, fb)).includes(B.tool), false)
        await expectAlive()
      })

      it('THR-02 ' + B.name + ': a later apply does not mount it again', T, async () => {
        const before = (await eventsOf(B.name)).filter((e) => e === 'apply' || e === 'import').length
        // Any later apply: a built-in toggled by the user, applied at once while Fishball is idle.
        assert.equal((await host.post(API.plugins, { plugin: 'builtin:ask-user', on: true })).status, 200)
        await settle(host)
        assert.equal((await host.post(API.plugins, { plugin: 'builtin:ask-user', on: false })).status, 200)
        await settle(host)
        await turn1()
        const events = await eventsOf(B.name)
        assert.equal(events.filter((e) => e === 'apply' || e === 'import').length, before, 'mounted again: ' + JSON.stringify(events))
        assert.equal(pluginIn((await host.state()).catalog, B.name).applied, false)
        await expectAlive()
      })
    }
  })
  const turn1 = () => nextTools(host, fb)

  describe('R3 approved, then refused before the write', () => {
    after(async () => { await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: LIMITS.maxFishballOnlyPlugins.default } }) }, HOOK)

    it('ATM-01 no allowance is stored when the enable is refused after approval', T, async (t) => {
      const A = ONLY_BUNDLES.a
      const B = ONLY_BUNDLES.b
      const Cc = ONLY_BUNDLES.c
      assert.equal((await setPlugin(host, fb, A.name, true, OUTCOME.allow)).json?.ok, true, 'precondition: one Fishball-only running')
      await settle(host)
      const lim = await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: 2 } })
      assert.equal(lim.ok, true, JSON.stringify(lim.error))
      const allowedBefore = (await host.state()).catalog.allowedTools
      await host.call('setApprover', { outcome: APPROVER_HOLDS })
      const driving = host.call('drive', { sessionId: fb, script: callScript('set_plugin_enabled', { plugin: B.name, on: true }) })
      try {
        assert.ok(await until(async () => (await host.call('heldApprovals')) > 0, 10000, 50), 'the prompt is open')
        // The race: the user turns another Fishball-only plugin on, then the limit drops so B no longer fits either way.
        const racing = await host.post(API.plugins, { plugin: Cc.name, on: true })
        t.diagnostic('racing toggle answered ' + racing.status + ' ' + racing.text.slice(0, 120))
        assert.equal((await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: 1 } })).ok, true)
        assert.equal(await host.call('releaseApproval', { outcome: OUTCOME.allow }), true)
      } finally {
        await host.call('setApprover', { outcome: OUTCOME.reject })
      }
      const r = await driving
      assert.equal(r.idle, true)
      const result = r.results[0]
      t.diagnostic('answer: ' + result?.text?.slice(0, 200))
      assert.equal(JSON.parse(result.text).ok, false, result.text)
      await settle(host)
      assert.deepEqual((await host.state()).catalog.allowedTools, allowedBefore, 'allowedTools unchanged')
      assert.equal(pluginIn((await host.state()).catalog, B.name).on, false)
      assert.equal(await runningOf(B.name), false, 'B not running')
      assert.equal((await nextTools(host, fb)).includes(B.tool), false)
      // Clean up for the next case: turn C off again if the racing toggle succeeded.
      await host.post(API.plugins, { plugin: Cc.name, on: false })
      await settle(host)
    })
  })

  describe('R4 two broken plugins in one apply', () => {
    it('BRK-01 both leaking plugins end off with lastError set; the rest keeps running', T, async () => {
      const L1 = REVIEW_BUNDLES.leak
      const L2 = REVIEW_BUNDLES.leakB
      const A = ONLY_BUNDLES.a
      assert.ok(await runningOf(A.name), 'precondition: another Fishball-only plugin runs')
      // Keep Fishball busy on a held prompt, so both user toggles wait for the same idle and apply together.
      await host.call('setApprover', { outcome: APPROVER_HOLDS })
      const driving = host.call('drive', { sessionId: fb, script: callScript('add_plugin', { spec: '/nonexistent/fbtest-never-installed', reason: 'hold Fishball busy' }) })
      try {
        assert.ok(await until(async () => (await host.call('heldApprovals')) > 0, 10000, 50), 'Fishball is busy on a prompt')
        for (const L of [L1, L2]) assert.equal((await host.post(API.plugins, { plugin: L.name, on: true })).status, 200, L.name)
        assert.equal(await host.call('releaseApproval', { outcome: OUTCOME.reject }), true)
      } finally {
        await host.call('setApprover', { outcome: OUTCOME.reject })
      }
      assert.equal((await driving).idle, true)
      const done = await until(async () => {
        const c = (await host.state()).catalog
        return [L1, L2].every((L) => pluginIn(c, L.name).on === false) ? c : false
      }, 8000, 100)
      const c = done || (await host.state()).catalog
      for (const L of [L1, L2]) {
        const e = pluginIn(c, L.name)
        assert.equal(e.on, false, L.name + ' ' + JSON.stringify(e))
        assert.equal(e.lastError, 'leaks-service', L.name + ' ' + JSON.stringify(e))
        expectDisposed(await eventsOf(L.name), L.name)
      }
      assert.ok(await runningOf(A.name), 'the other Fishball-only plugin keeps running')
      assert.equal(pluginIn(c, A.name).applied, true)
      assert.ok((await nextTools(host, fb)).includes(A.tool))
      await expectAlive()
    })
  })
})
