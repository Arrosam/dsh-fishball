/**
 * P11 R1 and R2: the Messenger look's catalog entry (builtin:messenger) and `look` in the state snapshot.
 * One new-install host, cases in order (state transitions); a second host whose store is unreadable
 * (core failed) and a third whose setup turn is held (the snapshot before and after the catalog exists).
 * Requirements: the P11 brief (CASES.md "P11 cases"); expected values never come from the implementation.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | MSL-01 | EP (fresh install, GET state + first SSE frame) | one entry builtin:messenger: title 'Messenger look', kind builtin, status builtin, on, actions [disable], tools [], removing false, changedBy null; follows the decision table |
 * | MSL-02 | EP (list_plugins) | the same entry in Fishball's own catalog tool |
 * | LOK-01 | EP (normal start) | state.look is exactly {messenger: true} |
 * | LOK-02 | ST on -user off-> off | POST plugins answers {ok:true, state} whose look.messenger is false and whose entry is off, changedBy user, [enable]; GET state agrees; an SSE frame carries false |
 * | LOK-03 | ST off -user on-> on while Fishball is held in a turn | the answer, GET state and an SSE frame show look.messenger true before the turn ends |
 * | MSL-03 ×2 | DT (POST plugins/remove × on/off) | 409 {ok:false, code:'refused'}; entry and look unchanged |
 * | MSL-04 ×2 | DT (remove_plugin × on/off) | {ok:false, code:'not-removable'}; no prompt; entry unchanged |
 * | MSL-05 | ST on -set_plugin_enabled off-> off -on-> on | ok:true without a prompt; changedBy fishball; look follows each time |
 * | MSL-06 | EP (no tools, no rows) | Fishball's request tools, the global tools, dsh-fishball's rows, the profile files and the entry's tools are the same with the look on and off |
 * | MSL-07 | BVA (maxFishballOnlyPlugins 1 reached by fbtest-only) | another fishball-only plugin is refused (precondition); the messenger off then on both answer 200 ok and look follows |
 * | LOK-04 | EP (invariant over every collected frame) | whenever catalog is present, look.messenger equals the entry's on |
 * | MSL-08 | ST off -restart-> off -on-> on -restart-> on | the choice survives restarts (entry on, changedBy user, look) |
 * | LOK-05 | EP (store unreadable: core failed) | status failed; look null in GET state and in the first SSE frame |
 * | LOK-06 | ST (starting -> live, setup request held) | in every snapshot and frame: catalog null => look null; catalog present => look {messenger: entry.on}; once live look is {messenger:true} |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { ACTION, API, CHANGED_BY, CODE, KIND, LIMITS, LOOK_KEYS, MESSENGER, ONLY_BUNDLES, PLUGIN_KEYS, PLUGIN_STATUS, STATUS, STORE } from './support/constants.mjs'
import {
  HOOK, T, assertEntryContract, catalogSettled, holdFishball, listPlugins, nextTools, pluginIn, profileFiles, removePlugin, setPlugin, settle, settledIdle,
} from './support/expect.mjs'
import { bootHost, bootLive, newHome, until } from './support/host.mjs'

const KEY = MESSENGER.key
const LONG = { timeout: 150000 }

/** The look/catalog invariant of one snapshot (R2): null before the catalog exists, else the entry's on/off choice. */
function assertLookFollowsCatalog(s, label) {
  assert.ok(s && Object.hasOwn(s, 'look'), label + ': the snapshot has a top-level look field')
  if (s.catalog === null || s.catalog === undefined) { assert.equal(s.look, null, label + ': look is null without a catalog'); return }
  const p = pluginIn(s.catalog, KEY)
  assert.ok(p, label + ': the catalog lists ' + KEY)
  assert.deepEqual(s.look, { messenger: p.on }, label + ': look.messenger is the current choice')
}

describe('P11 Messenger look: catalog entry and look on a new install', () => {
  let host
  let home
  let fb
  const frames = []
  let stream
  const toggle = (on) => host.post(API.plugins, { plugin: KEY, on })
  const entry = async () => pluginIn((await host.state()).catalog, KEY)
  const lookNow = async () => (await host.state()).look
  const approvalsFor = async () => (await host.call('approvals', { sessionId: fb })).length
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  /** Wait for an SSE frame (after index from) whose look.messenger is value. */
  const frameWith = (from, value) => until(() => stream.frames.slice(from).find((f) => f.look?.messenger === value), 8000, 20)
  const restart = async () => {
    stream?.close()
    frames.push(...(stream?.frames ?? []))
    await settledIdle(host, fb)
    await host.stop()
    host = await bootHost(home)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live)
    assert.equal(st.sessionId, fb, 'same session after the restart')
    await settle(host)
    stream = await host.sse()
  }

  before(async () => {
    home = newHome('messenger-catalog')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    await settle(host)
    await settledIdle(host, fb)
    stream = await host.sse()
  }, HOOK)
  after(async () => { stream?.close(); await host?.stop() }, HOOK)

  it('MSL-01 a fresh install lists the Messenger look as an on built-in with no tools', T, async () => {
    assert.ok(await until(() => stream.frames.length > 0, 3000, 20), 'a first SSE frame')
    for (const [label, catalog] of [['GET state', (await host.state()).catalog], ['SSE', stream.frames[0].catalog]]) {
      const all = catalog.plugins.filter((p) => p.plugin === KEY)
      assert.equal(all.length, 1, label + ': exactly one ' + KEY + ' entry')
      const p = all[0]
      assert.deepEqual(Object.keys(p).sort(), PLUGIN_KEYS, label + ' keys')
      assert.equal(p.title, MESSENGER.title, label)
      assert.equal(p.kind, KIND.builtin, label)
      assert.equal(p.status, PLUGIN_STATUS.builtin, label)
      assert.equal(p.on, true, label + ': on by default')
      assert.deepEqual(p.actions, [ACTION.disable], label)
      assert.equal(p.removing, false, label)
      assert.equal(p.changedBy, null, label + ': nobody changed it')
      assert.deepEqual(p.tools, [], label + ': it brings Fishball no tools')
      assertEntryContract(assert, p)
    }
  })

  it('MSL-02 Fishball\'s list_plugins shows the same entry', T, async () => {
    const p = pluginIn(await listPlugins(host, fb), KEY)
    assert.ok(p, 'listed by list_plugins')
    assert.equal(p.title, MESSENGER.title)
    assert.equal(p.kind, KIND.builtin)
    assert.equal(p.status, PLUGIN_STATUS.builtin)
    assert.equal(p.on, true)
    assert.deepEqual(p.actions, [ACTION.disable])
    assert.deepEqual(p.tools, [])
  })

  it('LOK-01 state.look is {messenger: true} after a normal start', T, async () => {
    const s = await host.state()
    assert.ok(Object.hasOwn(s, 'look'), 'top-level look')
    assert.deepEqual(Object.keys(s.look ?? {}).sort(), LOOK_KEYS)
    assert.deepEqual(s.look, { messenger: true })
  })

  it('LOK-02 the user switching it off answers with look.messenger false at once, and the stream follows', T, async () => {
    const count = stream.frames.length
    const res = await toggle(false)
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    assert.deepEqual(res.json.state?.look, { messenger: false }, 'the answer\'s state already shows the new choice')
    const p = pluginIn(res.json.state.catalog, KEY)
    assert.equal(p?.on, false)
    assert.equal(p.changedBy, CHANGED_BY.user)
    assert.deepEqual(p.actions, [ACTION.enable])
    assertEntryContract(assert, p)
    assert.deepEqual(await lookNow(), { messenger: false })
    assert.ok(await frameWith(count, false), 'an SSE frame with look.messenger false')
  })

  it('LOK-03 switching it on while Fishball runs a turn shows the new choice before the turn ends', T, async () => {
    await holdFishball(host, fb)
    try {
      const count = stream.frames.length
      const res = await toggle(true)
      assert.equal(res.status, 200, res.text)
      assert.deepEqual(res.json?.state?.look, { messenger: true }, 'answer')
      assert.equal(await host.call('isHeld', { sessionId: fb }), true, 'precondition: the turn is still running')
      assert.deepEqual(await lookNow(), { messenger: true }, 'GET state during the turn')
      assert.ok(await frameWith(count, true), 'an SSE frame during the turn')
      assert.equal(await host.call('isHeld', { sessionId: fb }), true, 'still inside the same turn')
    } finally {
      await host.call('releaseHold', { sessionId: fb })
      await settledIdle(host, fb)
    }
  })

  for (const on of [true, false]) {
    it('MSL-03 POST plugins/remove refuses the Messenger look while ' + (on ? 'on' : 'off') + ' (409 refused)', T, async () => {
      assert.equal((await toggle(on)).status, 200, 'precondition')
      const before = await entry()
      const res = await host.post(API.pluginsRemove, { plugin: KEY })
      assert.equal(res.status, 409, res.text)
      assert.equal(res.json?.ok, false)
      assert.equal(res.json?.code, CODE.refused)
      assert.deepEqual(await entry(), before, 'entry unchanged')
      assert.deepEqual(await lookNow(), { messenger: on })
    })
  }

  for (const on of [true, false]) {
    it('MSL-04 remove_plugin refuses the Messenger look while ' + (on ? 'on' : 'off') + ' (not-removable, no prompt)', T, async () => {
      assert.equal((await toggle(on)).status, 200, 'precondition')
      await settle(host)
      const before = await entry()
      const r = await removePlugin(host, fb, KEY)
      assert.equal(r.json?.ok, false, r.result.text)
      assert.equal(r.json?.code, CODE.notRemovable)
      assert.equal(r.approvals.length, 0, 'no prompt')
      const now = await entry()
      assert.equal(now.on, before.on)
      assert.equal(now.kind, KIND.builtin)
      assert.deepEqual(await lookNow(), { messenger: on })
    })
  }

  it('MSL-05 Fishball switches it off and on with set_plugin_enabled, like other built-ins', T, async () => {
    assert.equal((await toggle(true)).status, 200, 'precondition: on')
    const asked = await approvalsFor()
    for (const on of [false, true]) {
      const r = await setPlugin(host, fb, KEY, on)
      assert.equal(r.json?.ok, true, r.result.text)
      assert.equal(r.approvals.length, 0, 'no prompt for a built-in without tools')
      const p = await entry()
      assert.equal(p.on, on)
      assert.equal(p.changedBy, CHANGED_BY.fishball)
      assert.deepEqual(p.actions, [on ? ACTION.disable : ACTION.enable])
      assert.deepEqual(await lookNow(), { messenger: on })
    }
    assert.equal(await approvalsFor(), asked)
  })

  it('MSL-06 on or off, it adds no tools, no rows and no profile change', T, async () => {
    const snapshot = async () => ({
      fishball: (await nextTools(host, fb)).sort(),
      global: await host.call('globalToolNames'),
      rows: await host.call('fishballRows'),
      profile: profileFiles(home),
      tools: (await entry()).tools,
    })
    assert.equal((await toggle(true)).status, 200)
    await settle(host)
    const on = await snapshot()
    assert.equal((await toggle(false)).status, 200)
    await settle(host)
    const off = await snapshot()
    assert.deepEqual(on.fishball, off.fishball, 'Fishball\'s request tools')
    assert.deepEqual(on.global, off.global, 'global tools')
    assert.deepEqual(on.rows, off.rows, 'dsh-fishball\'s rows')
    assert.deepEqual(on.profile, off.profile, 'profile package.json and cordis.patch.yml')
    assert.deepEqual(on.tools, [])
    assert.deepEqual(off.tools, [])
    assert.equal((await toggle(true)).status, 200)
  })

  it('MSL-07 it does not count toward maxFishballOnlyPlugins', T, async () => {
    await setLimit({ maxFishballOnlyPlugins: 1 })
    try {
      assert.equal((await host.post(API.plugins, { plugin: ONLY_BUNDLES.a.name, on: true })).status, 200, 'one fishball-only plugin on')
      await settle(host)
      const full = await host.post(API.plugins, { plugin: ONLY_BUNDLES.b.name, on: true })
      assert.equal(full.status, 409, 'precondition: the limit is reached: ' + full.text)
      for (const on of [false, true]) {
        const res = await toggle(on)
        assert.equal(res.status, 200, res.text)
        assert.equal(res.json?.ok, true)
        assert.deepEqual(res.json.state?.look, { messenger: on })
        assert.equal((await entry()).on, on)
      }
    } finally {
      await host.post(API.plugins, { plugin: ONLY_BUNDLES.a.name, on: false })
      await setLimit({ maxFishballOnlyPlugins: LIMITS.maxFishballOnlyPlugins.default })
      await settle(host)
    }
  })

  it('LOK-04 in every frame so far, look.messenger is the entry\'s on/off choice', T, async () => {
    const all = [...frames, ...stream.frames]
    assert.ok(all.length > 3, 'frames were collected: ' + all.length)
    for (const [i, f] of all.entries()) assertLookFollowsCatalog(f, 'frame ' + i)
  })

  it('MSL-08 the choice survives restarts (off, then on)', LONG, async () => {
    assert.equal((await toggle(false)).status, 200)
    await restart()
    let p = pluginIn(await catalogSettled(host), KEY)
    assert.equal(p.on, false, 'off after a restart')
    assert.equal(p.changedBy, CHANGED_BY.user)
    assert.deepEqual(await lookNow(), { messenger: false })
    assert.equal((await toggle(true)).status, 200)
    await restart()
    p = pluginIn(await catalogSettled(host), KEY)
    assert.equal(p.on, true, 'on after a restart')
    assert.equal(p.changedBy, CHANGED_BY.user)
    assert.deepEqual(await lookNow(), { messenger: true })
    assert.ok(await until(() => stream.frames.length > 0, 3000, 20))
    assertLookFollowsCatalog(stream.frames[0], 'first frame after the restart')
  })
})

describe('P11 look while the core failed', () => {
  let host
  before(async () => {
    const home = newHome('messenger-failed')
    fs.mkdirSync(path.dirname(STORE.file(home)), { recursive: true })
    fs.writeFileSync(STORE.file(home), '{"unit": {"name": "fishball", "version": 1}, "global": ')
    host = await bootHost(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('LOK-05 look is null in GET state and the first SSE frame', T, async () => {
    const st = await host.waitStatus(STATUS.failed)
    assert.equal(st?.status, STATUS.failed, 'precondition: ' + JSON.stringify(st))
    assert.ok(Object.hasOwn(st, 'look'), 'the field is present')
    assert.equal(st.look, null)
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, 3000, 20))
      assert.ok(Object.hasOwn(stream.frames[0], 'look'))
      assert.equal(stream.frames[0].look, null)
    } finally { stream.close() }
  })
})

describe('P11 look before and after the catalog exists (first start, setup turn held)', () => {
  let host
  const HOLD_MS = 4000
  before(async () => {
    host = await bootHost(newHome('messenger-starting'), { env: { FBTEST_FIRST_REQUEST_DELAY_MS: String(HOLD_MS) } })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('LOK-06 every snapshot from starting to live: look null without a catalog, else the entry\'s choice', T, async () => {
    const stream = await host.sse()
    const polled = []
    try {
      const live = await until(async () => {
        const s = await host.state()
        if (s) polled.push(s)
        return s?.status === STATUS.live ? s : false
      }, 30000, 100)
      assert.ok(live, 'reached live')
      await until(() => stream.frames.some((f) => f.status === STATUS.live), 3000, 20)
      const all = [...polled, ...stream.frames]
      assert.ok(all.some((s) => s.status === STATUS.starting), 'at least one snapshot while starting: ' + [...new Set(all.map((s) => s.status))])
      for (const [i, s] of all.entries()) assertLookFollowsCatalog(s, 'snapshot ' + i + ' (' + s.status + ')')
      assert.deepEqual(live.look, { messenger: true })
    } finally { stream.close() }
  })
})
