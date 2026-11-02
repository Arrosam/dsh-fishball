/**
 * P3 R5-R9, R14: set_plugin_enabled, approval of unchecked tools, parameter change,
 * Fishball-only plugins and their limit. One host, cases run in order (state transitions).
 *
 * | id     | technique              | requirement                                                | expected |
 * |--------|------------------------|------------------------------------------------------------|----------|
 * Plugin statuses: fbtest-tools starts off on a new install, so before() turns it on by the user route first.
 * | TOG-01 | DT (unchecked tools x answer rejected) | on with unchecked tools, Reject             | exactly one approval, toolName set_plugin_enabled, reason has "- name: first line" per unchecked tool and no second line; {ok:false, code:'rejected', unchecked}; tools stay hidden; no allowance |
 * | TOG-02 | DT (answer unavailable) | same, unavailable                                         | {ok:false, code:'rejected'}; nothing changes |
 * | TOG-03 | DT (answer cancelled)  | same, cancelled                                            | same |
 * | TOG-04 | DT (answer allowed-once) | Allow once                                               | {ok:true, on:true, allowedTools:[the unchecked names]}; not in the same turn's next request; in Fishball's next request; allowedTools lists each; status visible |
 * | TOG-05 | ST on -off-> off       | off for a profile plugin                                   | {ok:true, plugin, on:false, note}; same turn still has the tools; next request lacks them (status plugin-off); ordinary session keeps and runs them; profile package.json and cordis.patch.yml byte-identical |
 * | TOG-06 | EP (guard, plugin-off) | direct call of a plugin-off tool                           | tool error; body never runs |
 * | TOG-07 | ST off -on-> on (allowed before) | on again                                         | no approval; tools back in the next request |
 * | TOG-08 | ST (allowed -schema change-> unchecked) | R7 parameter change                       | the re-registered tool is hidden and unchecked; other allowed tools stay visible; ordinary session sees the new schema |
 * | TOG-09 | ST (unchecked -allow-> visible) | allow the changed tool again                     | one approval listing only that tool; visible again with the new schema |
 * | TOG-10 | EP (no unchecked tools) | on for a plugin whose tools are all allowed               | no approval; {ok:true} |
 * | ONLY-01 | ST off -on, allow-> on (fishball-only) | mount for Fishball only                      | its code runs (apply recorded); approval lists only_echo; {ok:true, allowedTools:['only_echo']}; in Fishball's next request; not in the global list nor an ordinary request; a call runs in Fishball |
 * | ONLY-02 | ST on -off-> off       | unmount                                                    | dispose recorded; only_echo gone from Fishball's request; direct call refused |
 * | ONLY-03 | ST off -on, reject-> off | Reject unmounts again                                    | {ok:false, code:'rejected', unchecked:['only_b_echo']}; mounted then disposed; catalog off; tool absent |
 * | ONLY-04 | EP (bundle edits another row) | fbtest-edits                                      | {ok:false, code:'edits-other-rows'}; its code never ran; no approval |
 * | LIM-01 | BVA (running 1, limit 2) | one below the limit                                     | turning a second on is accepted |
 * | LIM-02 | BVA (running 2, limit 2) | at the limit                                            | a third (fbtest-only-c) is refused limit-reached; no approval; its code never runs; stays off |
 * | LIM-03 | ST (limit lowered below running) | running ones keep running                        | with 2 running, limit 1: no dispose, both on, tools visible |
 * | LIM-04 | BVA (running 1, limit 1) | at the limit after one is turned off                    | on again is limit-reached; not mounted |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, CODE, FIXTURE_BUNDLE, FIXTURE_DESCRIPTION, FIXTURE_UNCHECKED, KIND, LIMITS, ONLY_BUNDLES, OUTCOME, PRESET, TOOL_STATUS } from './support/constants.mjs'
import { GENERIC_PARAMETERS } from './support/fixture-tools.mjs'
import { HOOK, T, callTool, listPlugins, nextTools, pluginIn, profileFiles, setPlugin, settle, toolIn, toolNames, toolSchema, turn } from './support/expect.mjs'
import { bootLive, newHome } from './support/host.mjs'

const FIX = FIXTURE_BUNDLE.name
const sorted = (a) => [...a].sort()
const CHANGED = { ...GENERIC_PARAMETERS, properties: { ...GENERIC_PARAMETERS.properties, extra: { type: 'string', description: 'added by an update' } } }

/** Check one approval reason lists each tool as "- name: first description line" and never the second line. */
function expectReason(reason, names) {
  assert.equal(typeof reason, 'string')
  for (const n of names) assert.ok(reason.includes('- ' + n + ': ' + FIXTURE_DESCRIPTION.first(n)), 'reason lacks the line for ' + n + ':\n' + reason)
  assert.equal(reason.includes(FIXTURE_DESCRIPTION.second), false, 'reason carries a second description line')
}

describe('P3 set_plugin_enabled', () => {
  let host
  let home
  let fb
  let bare

  const ordinaryRequest = async () => (await turn(host, bare, [[{ text: 'hi' }]])).requests.at(-1)

  before(async () => {
    home = newHome('plugins-toggle')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })
    assert.equal(created.error, null)
    bare = created.sessionId
    // Plugin statuses: DSH plugins start off on a new install. TOG-01..10 are about a profile plugin that is
    // on with unchecked tools, so the user turns it on first (no allowance, no prompt).
    assert.equal((await host.post(API.plugins, { plugin: FIX, on: true })).status, 200, 'precondition: fbtest-tools on')
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  const refusals = [['TOG-01', OUTCOME.reject], ['TOG-02', OUTCOME.unavailable], ['TOG-03', OUTCOME.cancelled]]
  for (const [id, outcome] of refusals) {
    it(id + ' on with unchecked tools answered ' + outcome + ' is rejected and changes nothing', T, async () => {
      const r = await setPlugin(host, fb, FIX, true, outcome)
      assert.equal(r.approvals.length, 1, 'exactly one approval question')
      assert.equal(r.approvals[0].toolName, 'set_plugin_enabled')
      expectReason(r.approvals[0].reason, FIXTURE_UNCHECKED)
      assert.equal(r.json?.ok, false, r.result.text)
      assert.equal(r.json?.code, CODE.rejected)
      assert.deepEqual(sorted(r.json?.unchecked ?? []), sorted(FIXTURE_UNCHECKED))
      const names = await nextTools(host, fb)
      for (const n of FIXTURE_UNCHECKED) assert.equal(names.includes(n), false, n + ' became visible')
      const c = await listPlugins(host, fb)
      assert.deepEqual(c.allowedTools, [])
      for (const n of FIXTURE_UNCHECKED) assert.equal(toolIn(c, FIX, n)?.status, TOOL_STATUS.unchecked, n)
      assert.equal(pluginIn(c, FIX).on, true, 'a profile plugin that was on stays on')
    })
  }

  it('TOG-04 Allow once makes the unchecked tools visible after the turn and stores the allowances', T, async () => {
    const r = await setPlugin(host, fb, FIX, true, OUTCOME.allow)
    assert.equal(r.approvals.length, 1)
    assert.equal(r.json?.ok, true, r.result.text)
    assert.equal(r.json?.on, true)
    assert.deepEqual(sorted(r.json?.allowedTools ?? []), sorted(FIXTURE_UNCHECKED))
    assert.equal(toolNames(r.requests.at(-1)).includes('demo_echo'), false, 'applied only when the turn ends')
    const names = await nextTools(host, fb)
    for (const n of FIXTURE_UNCHECKED) assert.ok(names.includes(n), n + ' missing from the next request')
    const c = await listPlugins(host, fb)
    assert.deepEqual(sorted(c.allowedTools.map((a) => a.toolName)), sorted(FIXTURE_UNCHECKED))
    for (const a of c.allowedTools) {
      assert.equal(typeof a.key, 'string')
      assert.equal(typeof a.module, 'string')
    }
    for (const n of FIXTURE_UNCHECKED) assert.equal(toolIn(c, FIX, n)?.status, TOOL_STATUS.visible, n)
  })

  it('TOG-05 off hides the plugin\'s tools from Fishball only, after the turn, without touching the profile', T, async () => {
    const files = profileFiles(home)
    const r = await setPlugin(host, fb, FIX, false)
    assert.equal(r.approvals.length, 0)
    assert.equal(r.json?.ok, true, r.result.text)
    assert.equal(r.json?.plugin, FIX)
    assert.equal(r.json?.on, false)
    assert.equal(typeof r.json?.note, 'string')
    assert.ok(toolNames(r.requests.at(-1)).includes('demo_echo'), 'still visible until the turn ends')
    const names = await nextTools(host, fb)
    for (const n of FIXTURE_UNCHECKED) assert.equal(names.includes(n), false, n + ' still visible')
    const c = await listPlugins(host, fb)
    assert.equal(pluginIn(c, FIX).on, false)
    for (const n of FIXTURE_UNCHECKED) assert.equal(toolIn(c, FIX, n)?.status, TOOL_STATUS.pluginOff, n)
    assert.ok(toolNames(await ordinaryRequest()).includes('demo_echo'), 'ordinary session keeps demo_echo')
    const before = (await host.call('fixtureCalls', { name: 'demo_echo', sessionId: bare })).length
    assert.equal((await callTool(host, bare, 'demo_echo', { text: 'x' })).result.isError, false)
    assert.equal((await host.call('fixtureCalls', { name: 'demo_echo', sessionId: bare })).length, before + 1)
    assert.deepEqual(profileFiles(home), files, 'profile files byte-identical')
  })

  it('TOG-06 a direct call of a plugin-off tool is a tool error and never runs', T, async () => {
    const before = (await host.call('fixtureCalls', { name: 'demo_echo', sessionId: fb })).length
    const { result } = await callTool(host, fb, 'demo_echo', { text: 'x' })
    assert.equal(result.isError, true, result.text)
    assert.equal((await host.call('fixtureCalls', { name: 'demo_echo', sessionId: fb })).length, before)
  })

  it('TOG-07 on again does not ask again and restores the allowed tools', T, async () => {
    const files = profileFiles(home)
    const r = await setPlugin(host, fb, FIX, true, OUTCOME.reject)
    assert.equal(r.approvals.length, 0, 'no second question')
    assert.equal(r.json?.ok, true, r.result.text)
    const names = await nextTools(host, fb)
    for (const n of FIXTURE_UNCHECKED) assert.ok(names.includes(n), n)
    assert.deepEqual(profileFiles(home), files)
  })

  it('TOG-08 a changed parameter schema makes an allowed tool unchecked and hidden again', T, async () => {
    await host.call('reregisterFixture', { name: 'demo_echo', parameters: CHANGED })
    const names = await nextTools(host, fb)
    assert.equal(names.includes('demo_echo'), false, 'changed demo_echo still visible')
    assert.ok(names.includes('pwsh'), 'other allowed tools stay visible')
    const c = await listPlugins(host, fb)
    assert.equal(toolIn(c, FIX, 'demo_echo')?.status, TOOL_STATUS.unchecked)
    assert.deepEqual(toolSchema(await ordinaryRequest(), 'demo_echo'), CHANGED)
  })

  it('TOG-09 allowing the changed tool asks once, for it alone, and shows the new schema', T, async () => {
    const r = await setPlugin(host, fb, FIX, true, OUTCOME.allow)
    assert.equal(r.approvals.length, 1)
    expectReason(r.approvals[0].reason, ['demo_echo'])
    assert.equal(r.approvals[0].reason.includes('- pwsh:'), false, 'only the changed tool is listed')
    assert.equal(r.json?.ok, true, r.result.text)
    assert.deepEqual(r.json?.allowedTools, ['demo_echo'])
    await settle(host)
    const req = (await turn(host, fb, [[{ text: 'x' }]])).requests.at(-1)
    assert.deepEqual(toolSchema(req, 'demo_echo'), CHANGED)
  })

  it('TOG-10 on for a plugin with no unchecked tools asks nobody', T, async () => {
    const r = await setPlugin(host, fb, FIX, true, OUTCOME.reject)
    assert.equal(r.approvals.length, 0)
    assert.equal(r.json?.ok, true, r.result.text)
  })

  describe('Fishball-only plugins', () => {
    const A = ONLY_BUNDLES.a
    const B = ONLY_BUNDLES.b
    const events = async (bundle) => (await host.call('bundleEvents', { bundle })).map((e) => e.type)
    const running = async (bundle) => (await events(bundle)).at(-1) === 'apply'

    it('ONLY-01 on mounts the plugin for Fishball only, after approval of its tools', T, async () => {
      assert.deepEqual(await events(A.name), [], 'precondition: its code has not run')
      const r = await setPlugin(host, fb, A.name, true, OUTCOME.allow)
      assert.equal(r.approvals.length, 1)
      assert.equal(r.approvals[0].toolName, 'set_plugin_enabled')
      expectReason(r.approvals[0].reason, [A.tool])
      assert.equal(r.json?.ok, true, r.result.text)
      assert.deepEqual(r.json?.allowedTools, [A.tool])
      assert.ok(await running(A.name), 'its code runs')
      assert.ok((await nextTools(host, fb)).includes(A.tool), 'visible to Fishball')
      assert.equal((await host.call('globalToolNames')).includes(A.tool), false, 'not global')
      assert.equal(toolNames(await ordinaryRequest()).includes(A.tool), false, 'not in an ordinary session')
      const c = await listPlugins(host, fb)
      assert.equal(pluginIn(c, A.name).kind, KIND.only)
      assert.equal(pluginIn(c, A.name).on, true)
      assert.equal(toolIn(c, A.name, A.tool)?.status, TOOL_STATUS.visible)
      const before = (await host.call('fixtureCalls', { name: A.tool, sessionId: fb })).length
      assert.equal((await callTool(host, fb, A.tool, { text: 'x' })).result.isError, false)
      assert.equal((await host.call('fixtureCalls', { name: A.tool, sessionId: fb })).length, before + 1)
    })

    it('ONLY-02 off unmounts it: its code stops and its tool is gone', T, async () => {
      const r = await setPlugin(host, fb, A.name, false)
      assert.equal(r.json?.ok, true, r.result.text)
      assert.equal((await nextTools(host, fb)).includes(A.tool), false)
      assert.equal(await running(A.name), false, 'disposed')
      const before = (await host.call('fixtureCalls', { name: A.tool })).length
      assert.equal((await callTool(host, fb, A.tool, { text: 'x' })).result.isError, true)
      assert.equal((await host.call('fixtureCalls', { name: A.tool })).length, before)
    })

    it('ONLY-03 Reject in the prompt unmounts it again', T, async () => {
      const r = await setPlugin(host, fb, B.name, true, OUTCOME.reject)
      assert.equal(r.approvals.length, 1)
      expectReason(r.approvals[0].reason, [B.tool])
      assert.equal(r.json?.ok, false, r.result.text)
      assert.equal(r.json?.code, CODE.rejected)
      assert.deepEqual(r.json?.unchecked, [B.tool])
      await settle(host)
      assert.equal(await running(B.name), false, 'not running after Reject: ' + JSON.stringify(await events(B.name)))
      const c = await listPlugins(host, fb)
      assert.equal(pluginIn(c, B.name).on, false)
      assert.equal((await nextTools(host, fb)).includes(B.tool), false)
    })

    it('ONLY-04 a bundle whose patch edits another row is refused edits-other-rows', T, async () => {
      const E = ONLY_BUNDLES.edits
      const r = await setPlugin(host, fb, E.name, true, OUTCOME.allow)
      assert.equal(r.json?.ok, false, r.result.text)
      assert.equal(r.json?.code, CODE.editsOtherRows)
      assert.equal(r.approvals.length, 0)
      assert.deepEqual(await events(E.name), [], 'its code never ran')
      assert.equal(pluginIn(await listPlugins(host, fb), E.name).on, false)
    })

    describe('maxFishballOnlyPlugins', () => {
      const setLimit = async (n) => { const r = await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: n } }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
      after(async () => { await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: LIMITS.maxFishballOnlyPlugins.default } }) }, HOOK)

      it('LIM-01 running 1 with limit 2: a second one is accepted', T, async () => {
        await setLimit(2)
        assert.equal((await setPlugin(host, fb, A.name, true, OUTCOME.reject)).json?.ok, true, 'A again (allowed before)')
        const r = await setPlugin(host, fb, B.name, true, OUTCOME.allow)
        assert.equal(r.json?.ok, true, r.result.text)
        await settle(host)
        assert.ok(await running(A.name))
        assert.ok(await running(B.name))
      })

      it('LIM-02 running 2 with limit 2: another is refused limit-reached and nothing is mounted', T, async () => {
        const C = ONLY_BUNDLES.c
        const r = await setPlugin(host, fb, C.name, true, OUTCOME.allow)
        assert.equal(r.json?.ok, false, r.result.text)
        assert.equal(r.json?.code, CODE.limit)
        assert.equal(r.approvals.length, 0, 'refused before any prompt')
        await settle(host)
        assert.deepEqual(await events(C.name), [], 'its code never ran')
        assert.equal(pluginIn(await listPlugins(host, fb), C.name).on, false)
      })

      it('LIM-03 lowering the limit below the running count stops nothing', T, async () => {
        await setLimit(1)
        await settle(host)
        assert.ok(await running(A.name))
        assert.ok(await running(B.name))
        const names = await nextTools(host, fb)
        assert.ok(names.includes(A.tool) && names.includes(B.tool))
        const c = await listPlugins(host, fb)
        assert.equal(pluginIn(c, A.name).on, true)
        assert.equal(pluginIn(c, B.name).on, true)
      })

      it('LIM-04 with 1 running and limit 1, turning the other on again is refused', T, async () => {
        assert.equal((await setPlugin(host, fb, B.name, false)).json?.ok, true)
        await settle(host)
        assert.equal(await running(B.name), false)
        const r = await setPlugin(host, fb, B.name, true, OUTCOME.allow)
        assert.equal(r.json?.ok, false, r.result.text)
        assert.equal(r.json?.code, CODE.limit)
        await settle(host)
        assert.equal(await running(B.name), false, 'not mounted')
      })
    })
  })
})
