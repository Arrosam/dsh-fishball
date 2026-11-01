/**
 * Revision 10c (DESIGN §10d "Fishball's own plugins", "Off removes the whole feature"; Q-own-plugins-open):
 * Session messages and Session watching switched off by the user. One new-install host; cases in order.
 * Requirements: the revision 10c brief (CASES.md "Revision 10c cases"); never the implementation.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | OFM-01 | EP (precondition, on) | message_fishball is in the global tool list and an ordinary request; Send to Fishball answers 200 |
 * | OFM-02 | ST on -user off-> off | features.messages false; message_fishball leaves the global tool list and the ordinary request; message_session and start_session plugin-off and absent from Fishball's request |
 * | OFM-03 | EP (route while off) | POST send: 409 feature-off; Fishball receives nothing |
 * | OFM-04 | EP (guard while off) | Fishball's direct message_session call is a tool error; nothing reaches the target |
 * | OFM-05 | ST off -user on-> on | message_fishball back (global and ordinary request); a call answers ok; Send 200; features.messages true |
 * | OFW-01 | ST on -user off-> off | features.watching false; the 4 watch tools plugin-off and absent from Fishball's request; a direct watch_session call is a tool error |
 * | OFW-02 | EP (route while off) | POST watches: 409 feature-off; no watch added |
 * | OFW-03 ×3 | DT (message tool × notify_when_finished × watching off) | message_session, start_session, message_fishball: ok:true, watchError feature-off, no watch key, the message is still delivered |
 * | OFW-04 | ST (active watch, target finishes while off) | no notice; the watch stays active, firedCount 0 |
 * | OFW-05 | EP (remove route while off) | POST watches/remove: 200, that watch closed |
 * | OFW-06 | ST off -user on-> on (turn end passed over) | no late notice for the turn end that happened while off; the watch is still active |
 * | OFW-07 | ST (on, target finishes again) | exactly one notice for the watch; it closes |
 * | OFM-06 | ST (an ordinary session's model request made while on, held; Session messages off; then it calls message_fishball) | answer {ok:false, code:'feature-off'}, or (not reachable black-box) DSH refuses the unregistered tool itself; Fishball receives nothing either way |
 * | OFP-01 | ST (Plugin management off; the user turns on fbtest-tools, which has unchecked tools) | no unchecked-tools notice (no notice naming set_plugin_enabled and a fixture tool) |
 * | OFP-02 | ST (Plugin management on again; a fixture tool's schema changes) | behaviour unchanged: one new notice naming the changed tool |
 * | OFW-08 | DT (Session watching off × Fishball archived) | POST watches 409 feature-off (feature-off before unavailable); after unarchive and retry Fishball is live |
 * | OFU-01 | EP (client bundle) | the served client refers to the snapshot's features (the browser hides the buttons; manual otherwise) |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { API, FEATURE_OFF, FIXTURE_BUNDLE, FIXTURE_UNCHECKED, INBOUND_TOOL, NOTICE, OWN_PLUGINS, PRESET, STATUS, TITLE, TOOL_STATUS, WATCH_API, WATCH_STATUS } from './support/constants.mjs'
import { GENERIC_PARAMETERS } from './support/fixture-tools.mjs'
import {
  HOOK, T, callTool, catalogSettled, fishballCall, fishballClientBundle, fishballMessages, jsonOf, callScript, messageFishball, nextTools, noticesSettled,
  resultOfCall, settle, settledIdle, toolIn, toolNames, turn, untilSeen, watchById, watchNotices, watchesNow, watchesOn,
} from './support/expect.mjs'
import { bootLive, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'OWN' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 8)
const LONG = { timeout: 120000 }

describe('Revision 10c: Session messages and Session watching off', () => {
  let host
  let home
  let fb
  const ordinary = async (folder) => (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
  const toggle = async (key, on) => {
    const r = await host.post(API.plugins, { plugin: key, on })
    assert.equal(r.status, 200, r.text)
    return catalogSettled(host)
  }
  const features = async () => (await host.state()).features
  const globalHas = async () => (await host.call('globalToolNames')).includes(INBOUND_TOOL)
  const ordinaryTools = async (sid) => toolNames((await turn(host, sid, [[{ text: 'hi' }]])).requests.at(-1))
  const delivered = (sid, needle) => until(async () => (await host.call('requestsContaining', { needle })).some((r) => r.sessionId === sid), 10000, 100)

  before(async () => {
    home = newHome('own-plugins-features')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  describe('Session messages', () => {
    const spec = OWN_PLUGINS.messages
    let bare
    let target
    before(async () => {
      bare = await ordinary('ofm-bare')
      target = await ordinary('ofm-target')
      await turn(host, target, [[{ text: 'target answer' }]])
    }, HOOK)

    it('OFM-01 precondition: message_fishball and Send to Fishball work while on', T, async () => {
      assert.ok(await globalHas())
      assert.ok((await ordinaryTools(bare)).includes(INBOUND_TOOL))
      const r = await host.post(API.send, { sessionId: target, note: tok('ofm01') })
      assert.equal(r.status, 200, r.text)
      await settledIdle(host, fb)
    })

    it('OFM-02 off removes message_fishball from other sessions and masks Fishball\'s tools', LONG, async () => {
      const catalog = await toggle(spec.key, false)
      assert.equal((await features()).messages, false)
      for (const n of ['message_session', 'start_session']) assert.equal(toolIn(catalog, spec.key, n)?.status, TOOL_STATUS.pluginOff, n)
      assert.ok(await until(async () => !(await globalHas()), 5000, 100), 'message_fishball unregistered')
      assert.equal((await ordinaryTools(bare)).includes(INBOUND_TOOL), false, 'an ordinary session no longer has it')
      const names = await nextTools(host, fb)
      for (const n of ['message_session', 'start_session']) assert.equal(names.includes(n), false, 'Fishball request lists ' + n)
    })

    it('OFM-03 Send to Fishball answers 409 feature-off and delivers nothing', T, async () => {
      const note = tok('ofm03')
      const r = await host.post(API.send, { sessionId: target, note })
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, FEATURE_OFF)
      await sleep(1000)
      assert.deepEqual(await fishballMessages(host, fb, note), [])
    })

    it('OFM-04 a direct message_session call from Fishball is refused and reaches nobody', T, async () => {
      const text = tok('ofm04')
      await settledIdle(host, fb)
      const { result } = await callTool(host, fb, 'message_session', { session_id: target, message: text })
      assert.equal(result.isError, true, result.text)
      await sleep(1500)
      assert.equal((await host.call('requestsContaining', { needle: text })).some((r) => r.sessionId === target), false)
    })

    it('OFM-05 on again brings message_fishball and Send to Fishball back', LONG, async () => {
      await toggle(spec.key, true)
      assert.equal((await features()).messages, true)
      assert.ok(await until(globalHas, 5000, 100), 'message_fishball registered again')
      assert.ok((await ordinaryTools(bare)).includes(INBOUND_TOOL))
      const text = tok('ofm05')
      const m = await messageFishball(host, bare, { message: text })
      assert.equal(m.json?.ok, true, m.result.text)
      assert.ok(await untilSeen(host, fb, text), 'Fishball read it')
      const r = await host.post(API.send, { sessionId: target, note: tok('ofm05send') })
      assert.equal(r.status, 200, r.text)
      await settledIdle(host, fb)
    })

    it('OFM-06 a message_fishball call that runs after the off is refused with feature-off', LONG, async (t) => {
      const text = tok('ofm06')
      const callId = 'call_ofm06'
      await settledIdle(host, bare)
      await host.call('holdNext', { sessionId: bare })
      await host.call('driveStart', { sessionId: bare, text: 'tell Fishball', script: callScript(INBOUND_TOOL, { message: text }, callId) })
      assert.ok(await until(() => host.call('isHeld', { sessionId: bare }), 5000, 50), 'precondition: the request (with message_fishball) is held')
      try {
        await toggle(spec.key, false)
        assert.ok(await until(async () => !(await globalHas()), 5000, 100), 'precondition: unregistered while the call waits')
      } finally {
        await host.call('releaseHold', { sessionId: bare })
      }
      const r = await resultOfCall(host, bare, callId, 15000)
      await settledIdle(host, bare)
      assert.ok(r, 'the call has a result')
      await sleep(1000)
      assert.deepEqual(await fishballMessages(host, fb, text), [], 'Fishball receives nothing')
      if (r.json && Object.hasOwn(r.json, 'ok')) {
        assert.deepEqual({ ok: r.json.ok, code: r.json.code }, { ok: false, code: FEATURE_OFF })
      } else {
        t.diagnostic('DSH answered the call itself (the definition was not kept past the unregister): ' + r.text.slice(0, 300))
        t.skip('not reachable black-box: DSH refused the unregistered tool before Fishball\'s code ran')
      }
      await toggle(spec.key, true)
      assert.ok(await until(globalHas, 5000, 100))
    })
  })

  describe('Session watching', () => {
    const spec = OWN_PLUGINS.watching
    let watched
    let watch
    let spare
    before(async () => {
      watched = await ordinary('ofw-watched')
      await turn(host, watched, [[{ text: 'warm-up' }]])
      const spareSid = await ordinary('ofw-spare')
      await turn(host, spareSid, [[{ text: 'warm-up' }]])
      await settledIdle(host, fb)
      for (const sid of [watched, spareSid]) assert.equal((await host.post(WATCH_API.add, { sessionId: sid })).status, 200, 'precondition: a user watch')
      watch = (await watchesOn(host, watched)).find((w) => w.status === WATCH_STATUS.active)
      spare = (await watchesOn(host, spareSid)).find((w) => w.status === WATCH_STATUS.active)
      assert.ok(watch && spare, 'precondition: two active watches')
    }, HOOK)

    it('OFW-01 off masks the four watch tools and sets features.watching false', LONG, async () => {
      const catalog = await toggle(spec.key, false)
      assert.equal((await features()).watching, false)
      for (const n of spec.tools) assert.equal(toolIn(catalog, spec.key, n)?.status, TOOL_STATUS.pluginOff, n)
      const names = await nextTools(host, fb)
      for (const n of spec.tools) assert.equal(names.includes(n), false, 'Fishball request lists ' + n)
      const { result } = await callTool(host, fb, 'watch_session', { session_id: watched })
      assert.equal(result.isError, true, result.text)
      assert.equal((await watchesOn(host, watched)).length, 1, 'no watch added by a refused call')
    })

    it('OFW-02 POST watches answers 409 feature-off and adds nothing', T, async () => {
      const sid = await ordinary('ofw-02')
      await turn(host, sid, [[{ text: 'x' }]])
      const before = await watchesNow(host)
      const r = await host.post(WATCH_API.add, { sessionId: sid })
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, FEATURE_OFF)
      assert.deepEqual(await watchesNow(host), before)
    })

    describe('OFW-03 notify_when_finished while off: delivered, watchError feature-off', () => {
      it('message_session', T, async () => {
        const sid = await ordinary('ofw-03a')
        await turn(host, sid, [[{ text: 'x' }]])
        const text = tok('ofw03a')
        const { json } = await fishballCall(host, fb, 'message_session', { session_id: sid, message: text, notify_when_finished: true })
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.watchError, FEATURE_OFF)
        assert.equal('watch' in json, false)
        assert.ok(await delivered(sid, text), 'delivered')
        await settledIdle(host, sid)
        assert.equal((await watchesOn(host, sid)).length, 0)
      })
      it('start_session', T, async () => {
        const folder = path.join(home, 'work', 'ofw-03b')
        fs.mkdirSync(folder, { recursive: true })
        const text = tok('ofw03b')
        const { json } = await fishballCall(host, fb, 'start_session', { folder, title: TITLE.plain, message: text, notify_when_finished: true })
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.watchError, FEATURE_OFF)
        assert.equal('watch' in json, false)
        assert.ok(await delivered(json.sessionId, text), 'the new session got the message')
        await settledIdle(host, json.sessionId)
        assert.equal((await watchesOn(host, json.sessionId)).length, 0)
      })
      it('message_fishball', T, async () => {
        const sid = await ordinary('ofw-03c')
        const text = tok('ofw03c')
        const r = await turn(host, sid, callScript(INBOUND_TOOL, { message: text, notify_when_finished: true }))
        const json = jsonOf(r.results[0])
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.watchError, FEATURE_OFF)
        assert.equal('watch' in json, false)
        assert.ok(await untilSeen(host, fb, text), 'Fishball got the message')
        assert.equal((await watchesOn(host, sid)).length, 0)
      })
    })

    it('OFW-04 a watched session that finishes while off sends no notice; the watch stays active', LONG, async () => {
      await turn(host, watched, [[{ text: tok('ofw04') }]])
      const got = await noticesSettled(host, fb, watch.id, 0, { quietMs: 2500 })
      assert.equal(got.length, 0, 'no notice while off')
      const w = await watchById(host, watch.id)
      assert.equal(w.status, WATCH_STATUS.active)
      assert.equal(w.firedCount, 0)
    })

    it('OFW-05 removing a watch still works while off', T, async () => {
      const r = await host.post(WATCH_API.remove, { watchId: spare.id })
      assert.equal(r.status, 200, r.text)
      assert.equal((await watchById(host, spare.id)).status, WATCH_STATUS.closed)
    })

    it('OFW-06 turned on again, the turn end that happened while off is passed over', LONG, async () => {
      await toggle(spec.key, true)
      assert.equal((await features()).watching, true)
      const got = await noticesSettled(host, fb, watch.id, 0, { quietMs: 3000 })
      assert.equal(got.length, 0, 'no late notice')
      const w = await watchById(host, watch.id)
      assert.equal(w.status, WATCH_STATUS.active)
      assert.equal(w.firedCount, 0)
    })

    it('OFW-07 the next turn end after on gives exactly one notice and closes the watch', LONG, async () => {
      await turn(host, watched, [[{ text: tok('ofw07') }]])
      const got = await noticesSettled(host, fb, watch.id, 1)
      assert.equal(got.length, 1)
      const w = await watchById(host, watch.id)
      assert.equal(w.status, WATCH_STATUS.closed)
      assert.equal(w.firedCount, 1)
      assert.equal((await watchNotices(host, fb, spare.id)).length, 0, 'the removed watch never fired')
    })
  })

  describe('Plugin management and the unchecked-tools notice', () => {
    const spec = OWN_PLUGINS.plugins
    /** Fishball's unchecked-tools notices: fishball-notice messages that name set_plugin_enabled and a fixture tool. */
    const uncheckedNotices = async () => ((await host.call('inspect', { sessionId: fb, events: true })).events ?? [])
      .filter((e) => e.type === 'user/message' && e.source?.kind === NOTICE.kind && e.text.includes('set_plugin_enabled') && FIXTURE_UNCHECKED.some((n) => new RegExp('\\b' + n + '\\b').test(e.text)))
    const quietCount = async (ms = 4000) => { await sleep(ms); await settledIdle(host, fb); return (await uncheckedNotices()).length }

    it('OFP-01 with Plugin management off, a plugin with unchecked tools brings no notice', LONG, async () => {
      const before = (await uncheckedNotices()).length
      await toggle(spec.key, false)
      assert.equal((await features()).plugins, false)
      await toggle(FIXTURE_BUNDLE.name, true)
      assert.equal(await quietCount(), before, 'no unchecked-tools notice while Plugin management is off')
    })

    it('OFP-02 with Plugin management on again, a changed tool brings its notice as before', LONG, async (t) => {
      await toggle(spec.key, true)
      assert.equal((await features()).plugins, true)
      const before = await quietCount()
      t.diagnostic('notices right after turning Plugin management on: ' + before)
      const changed = 'demo_echo'
      await host.call('reregisterFixture', { name: changed, parameters: { ...GENERIC_PARAMETERS, properties: { ...GENERIC_PARAMETERS.properties, fbtest_own: { type: 'string' } } } })
      assert.ok(await until(async () => (await uncheckedNotices()).length > before, 15000, 200), 'a new notice')
      assert.match((await uncheckedNotices()).at(-1).text, new RegExp('\\b' + changed + '\\b'))
      await settledIdle(host, fb)
      await toggle(FIXTURE_BUNDLE.name, false)
    })
  })

  it('OFW-08 Session watching off while Fishball is archived: POST watches answers feature-off, not unavailable', LONG, async () => {
    const sid = await ordinary('ofw-08')
    await turn(host, sid, [[{ text: 'x' }]])
    await toggle(OWN_PLUGINS.watching.key, false)
    await settledIdle(host, fb)
    const archived = await host.call('archive', { sessionId: fb, stopActivity: true })
    assert.equal(archived.ok, true, JSON.stringify(archived))
    try {
      assert.equal((await host.waitStatus(STATUS.archived, 10000))?.status, STATUS.archived, 'precondition: archived')
      const r = await host.post(WATCH_API.add, { sessionId: sid })
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, FEATURE_OFF)
    } finally {
      await host.call('unarchive', { sessionId: fb })
      const retry = await host.post(API.recovery, { action: 'retry' })
      assert.equal(retry.status, 200, retry.text)
      assert.equal((await host.waitStatus(STATUS.live))?.status, STATUS.live)
      await settledIdle(host, fb)
    }
    await toggle(OWN_PLUGINS.watching.key, true)
  })

  it('OFU-01 the served client refers to the snapshot\'s features', T, async () => {
    const bundle = await fishballClientBundle(host)
    assert.ok(bundle.found, 'client bundle served')
    assert.ok(bundle.text.includes('features'), 'the client reads state.features')
  })
})
