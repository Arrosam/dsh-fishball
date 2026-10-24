/**
 * P3 R11: the settings-page API for plugins and tool allowances, and the catalog in the state stream.
 *
 * | id     | technique              | requirement                                                | expected |
 * |--------|------------------------|------------------------------------------------------------|----------|
 * | PHT-01 | EP                     | GET state includes the catalog                             | key catalog with {plugins, allowedTools, otherTools}, equal in content to list_plugins |
 * | PHT-02 | ST on -user off-> off (idle) | user toggle of a profile plugin                      | 200 {ok:true, state}; changedBy user; applied at once while idle; tools plugin-off; next request lacks them; no approval asked |
 * | PHT-02b | ST on -user off-> off -user on-> on (built-in) | visible tools of an off plugin    | schedule_create plugin-off or unlisted (A23) and absent from the request; back after on |
 * | PHT-03 | ST off -user on-> on   | user toggle never asks and never allows unchecked tools    | 200; no approval; changedBy user; unchecked tools stay unchecked and hidden |
 * | PHT-04 | ST (SSE)               | a frame follows a plugin change                            | after POST, a new frame whose catalog shows the new state |
 * | PHT-05 | DT (unknown plugin)    | unknown key, dsh-fishball itself, wrong case               | 409 {ok:false, code:'unknown'}; nothing changes |
 * | PHT-06 | DT body validation     | invalid JSON, array, {}, missing on, on "true", on 1, on null, plugin missing, plugin 1 | 400 {ok:false, code:'bad-body'} |
 * | PHT-07 | ST (fishball-only, user on) | mounted for Fishball only, tools wait for approval    | 200; its code runs; its tool unchecked and not in Fishball's request; no approval |
 * | PHT-08 | BVA (limit = running count) | refused by the limit                                  | 409 {ok:false, code:'refused'}; stays off; code never runs |
 * | PHT-09 | EP (edits other rows)  | refused                                                    | 409 {ok:false, code:'refused'}; code never runs (A24) |
 * | PHT-10 | ST allowed -remove-> unchecked | remove one allowance                               | 200; after the next idle the tool is hidden and unchecked; allowedTools lacks it; the other allowances stay |
 * | PHT-11 | DT (remove body)       | unknown key / malformed bodies                             | 409 {ok:false, code:'unknown'}; 400 bad-body for invalid JSON, array, {}, toolKey 1 |
 * | PHT-12 | EP (no cookie)         | both routes behind browser auth                            | not 200; nothing changes |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, CATALOG_KEYS, CHANGED_BY, CODE, FIXTURE_BUNDLE, FIXTURE_UNCHECKED, LIMITS, MS, ONLY_BUNDLES, PACKAGE_NAME, STATE_KEYS, TOOL_STATUS } from './support/constants.mjs'
import { HOOK, T, allowFixtures, listPlugins, nextTools, pluginIn, settle, toolIn } from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const FIX = FIXTURE_BUNDLE.name
// P4 adds 'contextWindow', P5 'intake' and 'outbox' (STATE_KEYS, 11 keys).

describe('P3 settings-page API', () => {
  let host
  let fb

  const toggle = (plugin, on) => host.post(API.plugins, { plugin, on })
  const approvalsSoFar = async () => (await host.call('approvals')).length
  /** The catalog as the state endpoint reports it, once the change is in effect. */
  const catalogNow = async () => { await settle(host); return (await host.state()).catalog }

  before(async () => {
    const booted = await bootLive(newHome('plugins-http'))
    host = booted.host
    fb = booted.state?.sessionId
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('PHT-01 GET state includes the catalog with the shape of list_plugins', T, async () => {
    const s = await host.state()
    assert.deepEqual(Object.keys(s).sort(), STATE_KEYS)
    assert.deepEqual(Object.keys(s.catalog).sort(), CATALOG_KEYS)
    const listed = await listPlugins(host, fb)
    const s2 = await host.state()
    assert.deepEqual(s2.catalog, listed)
  })

  it('PHT-02 a user toggle off applies while idle, is marked user and asks nobody', T, async (t) => {
    const asked = await approvalsSoFar()
    const res = await toggle(FIX, false)
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    assert.equal(typeof res.json?.state, 'object')
    assert.equal(pluginIn(res.json.state.catalog, FIX)?.on, false, 'state in the answer shows the change')
    // Idle Fishball: applied at once, with no Fishball turn.
    assert.ok(await until(async () => pluginIn((await host.state()).catalog, FIX)?.applied === false, 3000, 50), 'applied while idle')
    const c = (await host.state()).catalog
    assert.equal(pluginIn(c, FIX).changedBy, CHANGED_BY.user)
    // These tools are unchecked AND their plugin is off; which status wins is unspecified (CASES.md A22).
    const statuses = FIXTURE_UNCHECKED.map((n) => toolIn(c, FIX, n)?.status)
    t.diagnostic('statuses of unchecked tools of an off plugin: ' + JSON.stringify([...new Set(statuses)]))
    for (const [i, n] of FIXTURE_UNCHECKED.entries()) assert.ok([TOOL_STATUS.pluginOff, TOOL_STATUS.unchecked].includes(statuses[i]), n + ': ' + statuses[i])
    const names = await nextTools(host, fb)
    for (const n of FIXTURE_UNCHECKED) assert.equal(names.includes(n), false, n)
    assert.equal(await approvalsSoFar(), asked)
  })

  it('PHT-02b a user toggle off of a built-in with visible tools marks them plugin-off and removes them', T, async () => {
    const key = 'builtin:reminders'
    const res = await toggle(key, false)
    assert.equal(res.status, 200, res.text)
    const c = await catalogNow()
    assert.equal(pluginIn(c, key).on, false)
    assert.equal(pluginIn(c, key).changedBy, CHANGED_BY.user)
    // An off built-in is not mounted, so its tools may simply be unlisted (CASES.md A23).
    const status = toolIn(c, key, 'schedule_create')?.status
    assert.ok(status === undefined || status === TOOL_STATUS.pluginOff, 'schedule_create status ' + status)
    assert.equal((await nextTools(host, fb)).includes('schedule_create'), false)
    assert.equal((await toggle(key, true)).status, 200)
    assert.ok((await nextTools(host, fb)).includes('schedule_create'), 'back after on')
  })

  it('PHT-03 a user toggle on asks nobody and leaves unchecked tools hidden', T, async () => {
    const asked = await approvalsSoFar()
    const res = await toggle(FIX, true)
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    const c = await catalogNow()
    assert.equal(pluginIn(c, FIX).on, true)
    assert.equal(pluginIn(c, FIX).changedBy, CHANGED_BY.user)
    for (const n of FIXTURE_UNCHECKED) assert.equal(toolIn(c, FIX, n)?.status, TOOL_STATUS.unchecked, n)
    const names = await nextTools(host, fb)
    for (const n of FIXTURE_UNCHECKED) assert.equal(names.includes(n), false, n)
    assert.equal(await approvalsSoFar(), asked, 'no approval question')
  })

  it('PHT-04 the event stream sends a new frame after a plugin change', T, async () => {
    const key = 'builtin:ask-user'
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, MS.sseFirstFrame, 20))
      assert.equal(pluginIn(stream.frames.at(-1).catalog, key)?.on, false, 'precondition')
      const count = stream.frames.length
      assert.equal((await toggle(key, true)).status, 200)
      const frame = await until(() => stream.frames.slice(count).find((f) => pluginIn(f.catalog, key)?.on === true), MS.sseChange, 20)
      assert.ok(frame, 'a frame with the change arrives')
      assert.deepEqual(Object.keys(frame).sort(), STATE_KEYS)
    } finally {
      stream.close()
      await toggle(key, false)
    }
  })

  for (const plugin of ['fbtest-no-such-plugin', PACKAGE_NAME, FIX.toUpperCase()]) {
    it('PHT-05 toggling the unknown plugin ' + JSON.stringify(plugin) + ' answers 409 unknown', T, async () => {
      const before = (await host.state()).catalog
      const res = await toggle(plugin, true)
      assert.equal(res.status, 409, res.text)
      assert.deepEqual(res.json, { ok: false, code: CODE.unknown })
      assert.deepEqual((await host.state()).catalog, before)
    })
  }

  const badBodies = [
    ['invalid JSON', '{plugin:', true],
    ['a JSON array', JSON.stringify([FIX, true]), true],
    ['{}', {}, false],
    ['missing on', { plugin: FIX }, false],
    ['on as the string "true"', { plugin: FIX, on: 'true' }, false],
    ['on as 1', { plugin: FIX, on: 1 }, false],
    ['on null', { plugin: FIX, on: null }, false],
    ['missing plugin', { on: true }, false],
    ['plugin as a number', { plugin: 1, on: true }, false],
  ]
  for (const [label, body, raw] of badBodies) {
    it('PHT-06 POST plugins with ' + label + ' answers 400 bad-body', T, async () => {
      const res = await host.post(API.plugins, body, { raw })
      assert.equal(res.status, 400, res.text)
      assert.deepEqual(res.json, { ok: false, code: CODE.badBody })
    })
  }

  describe('Fishball-only plugins through the API', () => {
    const A = ONLY_BUNDLES.a
    const B = ONLY_BUNDLES.b
    const events = async (bundle) => (await host.call('bundleEvents', { bundle })).map((e) => e.type)
    after(async () => { await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: LIMITS.maxFishballOnlyPlugins.default } }) }, HOOK)

    it('PHT-07 a user toggle mounts a Fishball-only plugin with its tool waiting for approval', T, async () => {
      const asked = await approvalsSoFar()
      const res = await toggle(A.name, true)
      assert.equal(res.status, 200, res.text)
      const c = await catalogNow()
      assert.equal(pluginIn(c, A.name).on, true)
      assert.equal((await events(A.name)).at(-1), 'apply', 'its code runs')
      assert.equal(toolIn(c, A.name, A.tool)?.status, TOOL_STATUS.unchecked)
      assert.equal((await nextTools(host, fb)).includes(A.tool), false)
      assert.equal((await host.call('globalToolNames')).includes(A.tool), false)
      assert.equal(await approvalsSoFar(), asked)
    })

    it('PHT-08 with the limit equal to the running count, another is refused 409 refused', T, async () => {
      const r = await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: 1 } })
      assert.equal(r.ok, true, JSON.stringify(r.error))
      const res = await toggle(B.name, true)
      assert.equal(res.status, 409, res.text)
      assert.deepEqual(res.json, { ok: false, code: CODE.refused })
      const c = await catalogNow()
      assert.equal(pluginIn(c, B.name).on, false)
      assert.deepEqual(await events(B.name), [])
    })

    it('PHT-09 a bundle that edits other rows is refused 409 refused', T, async () => {
      const r = await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: LIMITS.maxFishballOnlyPlugins.default } })
      assert.equal(r.ok, true)
      const E = ONLY_BUNDLES.edits
      const res = await toggle(E.name, true)
      assert.equal(res.status, 409, res.text)
      assert.deepEqual(res.json, { ok: false, code: CODE.refused })
      await settle(host)
      assert.deepEqual(await events(E.name), [])
      assert.equal(pluginIn((await host.state()).catalog, E.name).on, false)
    })
  })

  describe('tool allowances', () => {
    let allowed

    before(async () => {
      await allowFixtures(host, fb)
      allowed = (await listPlugins(host, fb)).allowedTools
    }, HOOK)

    it('PHT-10 removing one allowance hides that tool again after the next idle', T, async () => {
      const entry = allowed.find((a) => a.toolName === 'demo_echo')
      assert.ok(entry, 'precondition: demo_echo allowed: ' + JSON.stringify(allowed))
      const res = await host.post(API.removeApproval, { toolKey: entry.key })
      assert.equal(res.status, 200, res.text)
      assert.equal(res.json?.ok, true)
      const c = await catalogNow()
      assert.equal(c.allowedTools.some((a) => a.key === entry.key), false)
      assert.equal(c.allowedTools.length, allowed.length - 1, 'the other allowances stay')
      assert.ok(await until(async () => toolIn((await host.state()).catalog, FIX, 'demo_echo')?.status === TOOL_STATUS.unchecked, 3000, 50), 'unchecked again')
      const names = await nextTools(host, fb)
      assert.equal(names.includes('demo_echo'), false)
      assert.ok(names.includes('pwsh'), 'another allowed tool stays visible')
    })

    const badRemoves = [
      ['invalid JSON', '{toolKey:', true, 400],
      ['a JSON array', '["x"]', true, 400],
      ['{}', {}, false, 400],
      ['toolKey as a number', { toolKey: 1 }, false, 400],
      ['an unknown key', { toolKey: 'fbtest#no_such_tool#0000' }, false, 409],
    ]
    for (const [label, body, raw, status] of badRemoves) {
      it('PHT-11 remove with ' + label + ' answers ' + status, T, async () => {
        const before = (await host.state()).catalog.allowedTools
        const res = await host.post(API.removeApproval, body, { raw })
        assert.equal(res.status, status, res.text)
        assert.deepEqual(res.json, { ok: false, code: status === 400 ? CODE.badBody : CODE.unknown })
        assert.deepEqual((await host.state()).catalog.allowedTools, before)
      })
    }
  })

  it('PHT-12 both routes refuse a request without the browser cookie', T, async () => {
    const before = (await host.state()).catalog
    for (const [route, body] of [[API.plugins, { plugin: FIX, on: false }], [API.removeApproval, { toolKey: before.allowedTools[0]?.key ?? 'x' }]]) {
      const res = await fetch(host.origin + route, { method: 'POST', headers: { origin: host.origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      await res.text()
      assert.notEqual(res.status, 200, route)
    }
    await settle(host)
    assert.deepEqual((await host.state()).catalog, before)
  })
})
