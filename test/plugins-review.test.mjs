/**
 * P3 post-review requirement changes 1-13 (numbers in the ids' notes refer to that list).
 *
 * Host A boots with the defective Fishball-only fixtures (FBTEST_REVIEW_BUNDLES), host rows with
 * private-tree-like ids (FBTEST_SPOOF_ROWS) and a tool registered in every agent's own scope
 * (FBTEST_AGENT_SCOPE_TOOL). Host B checks turn-time behaviour; host C checks installs.
 *
 * | id     | technique              | change | expected |
 * |--------|------------------------|--------|----------|
 * | REV-01 | ST off -on-> waiting -service-> running | 1 | on, waiting true, lastError null, code not run; after the service is provided: code runs, waiting false; every other entry waiting false |
 * | REV-02 | EP (agent-scope tool)  | 2 | Fishball's call is a tool error and the body never runs; an ordinary session runs it |
 * | REV-03 | EP (run_code inner call) | 2 | an unchecked tool called inside run_code never runs for Fishball (weak, A30) |
 * | REV-04 | EP (main file missing) | 3 | row-failed in the answer or lastError (A31), never a raw code; not running; assistant live |
 * | REV-05 | EP (patch inserts nothing) | 3 | answer code no-rows; lastError null (A31 answered); not running |
 * | REV-06 | EP (entry with id AND insert) | 4 | {ok:false, code:'edits-other-rows'}; no approval; code never ran |
 * | REV-07 | EP (two rows, same id) | 5 | answer code row-id-conflict; lastError null (A31 answered); off; code never ran; another Fishball-only plugin keeps running; assistant live |
 * | REV-08 | EP (leaking service)   | 3 | outcome is a documented one (A33): running with lastError null, or off with leaks-service; assistant live |
 * | REV-09 ×2 | EP (host row id fb-web--x / fbo-fbtest-only--x) | 11 | its tool is unchecked, not under the built-in or Fishball-only plugin, absent from Fishball's request even after that plugin is on; direct call refused; ordinary session has it |
 * | REV-10 | ST (on and applied -on-> on, same turn) | 6 | {ok:true}; no approval; its tool stays in the same turn's next request and in the next turn |
 * | REV-11 | ST (X off, then Y on, same turn) | 7 | X's tools stay in the turn's later requests; gone in the next turn; Y's tool visible in the next turn |
 * | REV-12 ×2 | DT (answerer throws / unavailable) | 8 | {ok:false, code:'rejected'}; apply then dispose recorded; off; tool absent |
 * | REV-13 | BVA (limit 1, 1 Fishball-only + 3 built-ins on) | 12 | built-ins on are accepted; another Fishball-only is refused; with 0 Fishball-only running it is accepted although 3 built-ins are on |
 * | REV-14 | EP                     | 10 | every plugin_changes and tool_approvals key matches [A-Za-z0-9_-]+, also after a toggle of an @scope/name plugin |
 * | REV-15 | DT (add rejected)      | 9 | plugin_changes never contains the raw spec; the add entry's plugin is spec:<16 hex> or the bundle name |
 * | REV-16 | DT (install ok, enable refused by the limit) | 9 | {ok:false, installed:'fbtest-added-b'}; the dependency was added; no raw spec in the audit |
 * | REV-17a | ST (bundle installed and enabled while DSH runs) | 13 | GET state's catalog lists it, kind profile, on, with its tool, within 10 s and with no other action |
 * | REV-17b | ST (same bundle)       | 13 | its tool is unchecked and hidden; ordinary session has it; after allowance it is visible |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  ADDED_BUNDLE, ADDED_BUNDLE_B, ADDED_BUNDLE_C, AGENT_SCOPE_TOOL, API, APPROVER_THROWS, BUILTINS, CODE, FIXTURE_BUNDLE, KIND,
  LAST_ERRORS, LIMITS, ONLY_BUNDLES, OUTCOME, PRESET, PROFILE, REVIEW_BUNDLES, SPOOF_ROWS, STATUS, STORE, STORE_KEY, TOOL_STATUS,
} from './support/constants.mjs'
import {
  HOOK, T, allowFixtures, callTool, fishballTool, listPlugins, nextTools, pluginIn, scriptedTurn, setPlugin, settle, statusIn, toolIn, toolNames, turn,
} from './support/expect.mjs'
import { bootHost, newHome, until } from './support/host.mjs'

const readTables = (home) => JSON.parse(fs.readFileSync(STORE.file(home), 'utf8')).tables ?? {}
const bootReady = async (label, env = {}) => {
  const home = newHome(label)
  const host = await bootHost(home, { env })
  const st = await host.waitStatus(STATUS.live)
  assert.equal(st?.status, STATUS.live, 'precondition: live: ' + JSON.stringify(st))
  await settle(host)
  return { home, host, fb: st.sessionId }
}
const eventsOf = async (host, bundle) => (await host.call('bundleEvents', { bundle })).map((e) => e.type)
const runningOf = async (host, bundle) => (await eventsOf(host, bundle)).at(-1) === 'apply'
const ordinaryTools = async (host, sessionId) => toolNames((await turn(host, sessionId, [[{ text: 'hi' }]])).requests.at(-1))
const step = (tool, args) => [{ tool, args }]

describe('P3 review: defective plugins, guard, spoofed rows (host A)', () => {
  let host
  let fb
  let bare

  before(async () => {
    ;({ host, fb } = await bootReady('review-a', { FBTEST_REVIEW_BUNDLES: '1', FBTEST_SPOOF_ROWS: '1', FBTEST_AGENT_SCOPE_TOOL: '1' }))
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })
    assert.equal(created.error, null)
    bare = created.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('REV-01 a plugin waiting for a host service stays on, waiting, until the service appears', T, async () => {
    const W = REVIEW_BUNDLES.waits
    for (const p of (await host.state()).catalog.plugins) assert.equal(p.waiting, false, p.plugin + ' waiting at rest')
    const res = await host.post(API.plugins, { plugin: W.name, on: true })
    assert.equal(res.status, 200, res.text)
    const waiting = await until(async () => { const p = pluginIn((await host.state()).catalog, W.name); return p?.waiting === true ? p : false }, 5000, 50)
    assert.ok(waiting, 'reported waiting: ' + JSON.stringify(pluginIn((await host.state()).catalog, W.name)))
    assert.equal(waiting.on, true, 'not turned off')
    assert.equal(waiting.lastError, null, 'not marked with an error')
    assert.deepEqual(await eventsOf(host, W.name), [], 'its code has not run yet')
    assert.equal((await host.state()).status, STATUS.live)
    await host.call('provideService', { name: W.service })
    assert.ok(await until(() => runningOf(host, W.name), 5000, 50), 'its code runs once the service is there')
    assert.ok(await until(async () => pluginIn((await host.state()).catalog, W.name)?.waiting === false, 5000, 50), 'no longer waiting')
    const p = pluginIn((await host.state()).catalog, W.name)
    assert.equal(p.on, true)
    assert.equal(p.lastError, null)
    assert.equal(toolIn((await host.state()).catalog, W.name, W.tool)?.status, TOOL_STATUS.unchecked, 'its tool waits for approval')
    assert.equal((await host.post(API.plugins, { plugin: W.name, on: false })).status, 200)
    assert.ok(await until(async () => !(await runningOf(host, W.name)), 5000, 50), 'off disposes it')
  })

  it('REV-02 a tool registered in Fishball\'s own agent scope never runs for Fishball', T, async (t) => {
    const scoped = await host.call('agentScoped')
    assert.ok(scoped.includes(bare), 'precondition: the fixture registered the tool for an ordinary agent')
    if (!scoped.includes(fb)) t.diagnostic('the fixture did not see agent/created for Fishball; the call then only checks the mask')
    const offered = toolNames((await host.call('requests', { sessionId: fb })).at(-1)).includes(AGENT_SCOPE_TOOL)
    t.diagnostic('offered to Fishball: ' + offered + '; catalog status: ' + statusIn((await host.state()).catalog, AGENT_SCOPE_TOOL))
    const before = (await host.call('fixtureCalls', { name: AGENT_SCOPE_TOOL, sessionId: fb })).length
    const { result } = await callTool(host, fb, AGENT_SCOPE_TOOL, { text: 'x' })
    assert.equal(result.isError, true, result.text)
    assert.equal((await host.call('fixtureCalls', { name: AGENT_SCOPE_TOOL, sessionId: fb })).length, before, 'never runs')
    const ordinary = (await host.call('fixtureCalls', { name: AGENT_SCOPE_TOOL, sessionId: bare })).length
    assert.equal((await callTool(host, bare, AGENT_SCOPE_TOOL, { text: 'x' })).result.isError, false, 'an ordinary session runs it')
    assert.equal((await host.call('fixtureCalls', { name: AGENT_SCOPE_TOOL, sessionId: bare })).length, ordinary + 1)
  })

  it('REV-03 an unchecked tool called inside run_code never runs for Fishball', T, async () => {
    const before = (await host.call('fixtureCalls', { name: 'demo_echo', sessionId: fb })).length
    await turn(host, fb, [step('run_code', { code: "return await tools.demo_echo({ text: 'inner' })", description: 'fbtest' }), [{ text: 'done' }]])
    assert.equal((await host.call('fixtureCalls', { name: 'demo_echo', sessionId: fb })).length, before)
  })

  /** Turn a defective plugin on through Fishball and return the answer and its catalog entry once settled. */
  async function tryOn(plugin) {
    const r = await setPlugin(host, fb, plugin, true, OUTCOME.allow)
    await settle(host)
    return { r, entry: pluginIn(await listPlugins(host, fb), plugin) }
  }
  /**
   * The refusal code is reported in the answer or as the entry's lastError (CASES.md A31);
   * whichever field carries a value must be a documented one.
   */
  const expectRefusal = (r, entry, code) => {
    assert.ok(r.json?.code === code || entry.lastError === code, 'neither the answer ' + JSON.stringify(r.json) + ' nor lastError of ' + JSON.stringify(entry) + ' is ' + code)
    assert.ok(entry.lastError === null || LAST_ERRORS.includes(entry.lastError), 'lastError ' + entry.lastError)
    if (r.json?.code !== undefined) assert.ok(LAST_ERRORS.includes(r.json.code) || r.json.code === CODE.rejected, 'answer code ' + r.json.code)
  }
  const expectAlive = async () => {
    assert.equal((await host.state()).status, STATUS.live)
    assert.equal(pluginIn((await host.state()).catalog, 'builtin:web').applied, true, 'other plugins keep running')
  }

  it('REV-04 fbtest-broken (main file missing) reports row-failed, never a raw code', T, async () => {
    const { r, entry } = await tryOn(REVIEW_BUNDLES.broken.name)
    assert.equal(r.json?.ok, false, r.result.text)
    expectRefusal(r, entry, 'row-failed')
    assert.equal(entry.applied, false)
    await expectAlive()
  })

  it('REV-05 fbtest-norows is refused no-rows in the answer, before anything is mounted (lastError null)', T, async () => {
    const { r, entry } = await tryOn(REVIEW_BUNDLES.norows.name)
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, 'no-rows')
    assert.equal(entry.lastError, null, 'A31: a refusal before mounting leaves lastError null')
    assert.equal(entry.applied, false)
    await expectAlive()
  })

  it('REV-06 a patch entry with an id and an insert is refused edits-other-rows', T, async () => {
    const B = REVIEW_BUNDLES.idinsert
    const { r, entry } = await tryOn(B.name)
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, CODE.editsOtherRows)
    assert.equal(r.approvals.length, 0)
    assert.deepEqual(await eventsOf(host, B.name), [])
    assert.equal(entry.on, false)
    assert.equal(entry.lastError, null, 'A31: a refusal before mounting leaves lastError null')
  })

  it('REV-07 two rows mapping to one id: that plugin is refused row-id-conflict, the rest keeps running', T, async () => {
    const A = ONLY_BUNDLES.a
    assert.equal((await setPlugin(host, fb, A.name, true, OUTCOME.allow)).json?.ok, true, 'precondition: another Fishball-only plugin runs')
    await settle(host)
    const D = REVIEW_BUNDLES.dup
    const { r, entry } = await tryOn(D.name)
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, 'row-id-conflict')
    assert.equal(entry.lastError, null, 'A31: found while reading rows, so lastError stays null')
    assert.equal(entry.on, false)
    assert.equal(await runningOf(host, D.name), false)
    assert.ok(await runningOf(host, A.name), 'the other Fishball-only plugin keeps running')
    assert.ok((await nextTools(host, fb)).includes(A.tool))
    await expectAlive()
  })

  it('REV-08 a plugin providing its own service ends in a documented state', T, async (t) => {
    const L = REVIEW_BUNDLES.leak
    const { r, entry } = await tryOn(L.name)
    t.diagnostic('leak: answer ' + JSON.stringify(r.json) + '; entry ' + JSON.stringify({ on: entry.on, applied: entry.applied, lastError: entry.lastError }))
    const running = entry.on && entry.lastError === null
    const refused = !entry.on && entry.lastError === 'leaks-service'
    assert.ok(running || refused, 'documented outcome: ' + JSON.stringify(entry))
    if (refused) assert.equal(await runningOf(host, L.name), false, 'reverted')
    await expectAlive()
  })

  for (const row of SPOOF_ROWS) {
    it('REV-09 a host row with id ' + row.id + ' is not a private-tree plugin: ' + row.tool + ' stays unchecked', T, async () => {
      const c = await listPlugins(host, fb)
      assert.equal(statusIn(c, row.tool), TOOL_STATUS.unchecked, 'status of ' + row.tool)
      for (const key of ['builtin:web', ONLY_BUNDLES.a.name]) assert.equal(toolIn(c, key, row.tool), undefined, 'listed under ' + key)
      assert.ok(pluginIn(c, ONLY_BUNDLES.a.name).on && BUILTINS['builtin:web'].on, 'precondition: both look-alike owners are on')
      assert.equal((await nextTools(host, fb)).includes(row.tool), false)
      const before = (await host.call('fixtureCalls', { name: row.tool, sessionId: fb })).length
      assert.equal((await callTool(host, fb, row.tool, { text: 'x' })).result.isError, true)
      assert.equal((await host.call('fixtureCalls', { name: row.tool, sessionId: fb })).length, before)
      assert.ok((await ordinaryTools(host, bare)).includes(row.tool), 'ordinary session has it')
    })
  }
})

describe('P3 review: changes within one turn, failed prompts, limit, store keys (host B)', () => {
  let host
  let home
  let fb
  const A = ONLY_BUNDLES.a
  const B = ONLY_BUNDLES.b
  const C = ONLY_BUNDLES.c

  before(async () => {
    ;({ host, home, fb } = await bootReady('review-b'))
    await allowFixtures(host, fb)
    assert.equal((await setPlugin(host, fb, A.name, true, OUTCOME.allow)).json?.ok, true)
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('REV-10 turning on a Fishball-only plugin that is already on keeps its tools in the same turn', T, async () => {
    const r = await scriptedTurn(host, fb, [step('set_plugin_enabled', { plugin: A.name, on: true }), [{ text: 'done' }]])
    assert.equal(r.results.length, 1)
    assert.equal(r.approvals.length, 0, 'nothing unchecked, nothing asked')
    assert.equal(r.requests.length, 2)
    assert.ok(toolNames(r.requests[0]).includes(A.tool), 'precondition: visible at the turn start')
    assert.ok(toolNames(r.requests[1]).includes(A.tool), 'still visible after the call in the same turn')
    assert.ok((await nextTools(host, fb)).includes(A.tool), 'and in the next turn')
    assert.ok(await runningOf(host, A.name))
  })

  it('REV-11 X off then Y on in one turn: X stays until the turn ends, then goes; Y appears after', T, async () => {
    const r = await scriptedTurn(host, fb, [
      step('set_plugin_enabled', { plugin: FIXTURE_BUNDLE.name, on: false }),
      step('set_plugin_enabled', { plugin: B.name, on: true }),
      [{ text: 'done' }],
    ], OUTCOME.allow)
    assert.equal(r.results.length, 2, JSON.stringify(r.results))
    assert.equal(r.requests.length, 3)
    for (const [i, req] of r.requests.entries()) assert.ok(toolNames(req).includes('demo_echo'), 'X\'s tool missing from request ' + i + ' of the turn')
    const names = await nextTools(host, fb)
    assert.equal(names.includes('demo_echo'), false, 'X gone after the turn')
    assert.ok(names.includes(B.tool), 'Y visible after the turn')
    assert.equal((await setPlugin(host, fb, FIXTURE_BUNDLE.name, true)).json?.ok, true, 'X back on')
  })

  for (const answer of [APPROVER_THROWS, OUTCOME.unavailable]) {
    it('REV-12 a failed prompt (' + answer + ') unmounts the listed Fishball-only plugin again', T, async () => {
      const before = (await eventsOf(host, C.name)).length
      const r = await setPlugin(host, fb, C.name, true, answer)
      assert.equal(r.approvals.length, 1, 'the prompt was raised')
      assert.equal(r.json?.ok, false, r.result.text)
      assert.equal(r.json?.code, CODE.rejected)
      await settle(host)
      const events = (await eventsOf(host, C.name)).slice(before)
      assert.deepEqual(events, ['apply', 'dispose'], 'mounted for listing, then disposed')
      assert.equal(pluginIn(await listPlugins(host, fb), C.name).on, false)
      assert.equal((await nextTools(host, fb)).includes(C.tool), false)
    })
  }

  describe('limit counts Fishball-only plugins only', () => {
    after(async () => { await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: LIMITS.maxFishballOnlyPlugins.default } }) }, HOOK)

    it('REV-13 built-ins do not count toward maxFishballOnlyPlugins', T, async () => {
      assert.equal((await setPlugin(host, fb, B.name, false)).json?.ok, true)
      await settle(host)
      const r0 = await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: 1 } })
      assert.equal(r0.ok, true, JSON.stringify(r0.error))
      for (const key of ['builtin:ask-user', 'builtin:skills', 'builtin:shell']) assert.equal((await setPlugin(host, fb, key, true)).json?.ok, true, key + ' on with the limit reached by Fishball-only plugins')
      await settle(host)
      const refused = await setPlugin(host, fb, B.name, true, OUTCOME.allow)
      assert.equal(refused.json?.code, CODE.limit, 'one Fishball-only running, limit 1: ' + refused.result.text)
      assert.equal((await setPlugin(host, fb, A.name, false)).json?.ok, true)
      await settle(host)
      const ok = await setPlugin(host, fb, B.name, true, OUTCOME.allow)
      assert.equal(ok.json?.ok, true, 'none running, three built-ins on, limit 1: ' + ok.result.text)
    })
  })

  it('REV-14 plugin_changes and tool_approvals keys use only [A-Za-z0-9_-]', T, async () => {
    const scoped = (await listPlugins(host, fb)).plugins.find((p) => p.plugin.startsWith('@'))
    assert.ok(scoped, 'precondition: an @scope/name plugin in the catalog')
    await setPlugin(host, fb, scoped.plugin, true, OUTCOME.reject)
    await host.post(API.plugins, { plugin: scoped.plugin, on: false })
    await settle(host)
    const tables = readTables(home)
    for (const t of ['plugin_changes', 'tool_approvals']) {
      const keys = Object.keys(tables[t] ?? {})
      assert.ok(keys.length > 0, 'precondition: ' + t + ' has entries')
      for (const k of keys) assert.match(k, STORE_KEY, t + ' key ' + JSON.stringify(k))
    }
  })
})

describe('P3 review: installs (host C)', () => {
  let host
  let home
  let fb
  let bare
  const profilePkg = () => JSON.parse(fs.readFileSync(path.join(home, 'profiles', PROFILE, 'package.json'), 'utf8'))
  const addEntries = () => Object.values(readTables(home).plugin_changes ?? {}).filter((e) => e?.action === 'add')
  /** The raw spec never appears in the audit, keys or values. */
  const expectNoSpec = (spec) => assert.equal(JSON.stringify(readTables(home).plugin_changes ?? {}).includes(spec), false, 'plugin_changes holds the raw spec')
  const SPEC_DIGEST = /^spec:[0-9a-f]{16}$/
  const expectAddPlugin = (e, bundles) => assert.ok(bundles.includes(e.plugin) || SPEC_DIGEST.test(e.plugin), 'add entry plugin ' + JSON.stringify(e.plugin))

  before(async () => {
    ;({ host, home, fb } = await bootReady('review-c'))
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })
    assert.equal(created.error, null)
    bare = created.sessionId
  }, HOOK)
  after(async () => {
    await host?.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: LIMITS.maxFishballOnlyPlugins.default } }).catch(() => {})
    await host?.stop()
  }, HOOK)

  it('REV-15 a rejected add_plugin leaves no raw spec in the audit', T, async () => {
    const r = await fishballTool(host, fb, 'add_plugin', { spec: ADDED_BUNDLE.dir, reason: 'fbtest' }, OUTCOME.reject)
    assert.equal(r.json?.code, CODE.rejected, r.result.text)
    expectNoSpec(ADDED_BUNDLE.dir)
    const entries = addEntries()
    assert.ok(entries.length >= 1, 'an add entry is audited: ' + JSON.stringify(readTables(home).plugin_changes))
    for (const e of entries) expectAddPlugin(e, [ADDED_BUNDLE.name])
  })

  it('REV-16 install succeeds, enable is refused by the limit: the answer still names the installed bundle', T, async () => {
    assert.equal((await host.post(API.plugins, { plugin: ONLY_BUNDLES.a.name, on: true })).status, 200, 'precondition: one Fishball-only running')
    await settle(host)
    const lim = await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: 1 } })
    assert.equal(lim.ok, true, JSON.stringify(lim.error))
    const r = await fishballTool(host, fb, 'add_plugin', { spec: ADDED_BUNDLE_B.dir, reason: 'fbtest' }, OUTCOME.allow)
    assert.ok(Object.hasOwn(profilePkg().dependencies ?? {}, ADDED_BUNDLE_B.name), 'precondition: installed')
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.installed, ADDED_BUNDLE_B.name)
    expectNoSpec(ADDED_BUNDLE_B.dir)
    for (const e of addEntries()) expectAddPlugin(e, [ADDED_BUNDLE.name, ADDED_BUNDLE_B.name])
  })

  it('REV-17a a bundle installed and enabled while DSH runs appears in state.catalog with no other action', T, async () => {
    const D = ADDED_BUNDLE_C
    const r = await host.call('installBundle', { spec: D.dir, enabled: true }, 90000)
    assert.equal(r.error, null, JSON.stringify(r))
    assert.equal(r.application, 'applied', 'precondition: applied live: ' + JSON.stringify(r))
    // No Fishball turn, no toggle: only the install happened.
    const entry = await until(async () => { const c = (await host.state()).catalog; return pluginIn(c, D.name) && toolIn(c, D.name, D.tool) ? pluginIn(c, D.name) : false }, 10000, 100)
    assert.ok(entry, 'GET state catalog lists ' + D.name + ' with its tool within 10 s: ' + JSON.stringify(pluginIn((await host.state()).catalog, D.name)))
    assert.equal(entry.kind, KIND.profile)
    assert.equal(entry.on, true)
  })

  it('REV-17b its tools follow its state: unchecked and hidden, then visible after allowance', T, async () => {
    const D = ADDED_BUNDLE_C
    const c = await listPlugins(host, fb)
    assert.equal(pluginIn(c, D.name)?.kind, KIND.profile, 'list_plugins lists it: ' + JSON.stringify(pluginIn(c, D.name)))
    assert.equal(pluginIn(c, D.name).on, true)
    assert.equal(toolIn(c, D.name, D.tool)?.status, TOOL_STATUS.unchecked)
    assert.equal((await nextTools(host, fb)).includes(D.tool), false)
    assert.ok((await ordinaryTools(host, bare)).includes(D.tool), 'ordinary session has it')
    const on = await setPlugin(host, fb, D.name, true, OUTCOME.allow)
    assert.equal(on.json?.ok, true, on.result.text)
    assert.ok((await nextTools(host, fb)).includes(D.tool), 'visible after allowance')
  })
})
