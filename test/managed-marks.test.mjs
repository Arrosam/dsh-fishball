/**
 * Revision 11 rev11i: managed-session marks (requirements item 30; DESIGN §10e "Managed-session marks", §14 row rev11i,
 * §16 sixth round). The banner and the sidebar icon are drawn in the browser, so these cases check what a client reads to
 * decide them (the snapshot's `managed` list, `features.messages`, `status`, `preferences.brandStyle`), the route the
 * banner's button posts, and that the served client bundle carries the banner's words. The drawing itself is checked by
 * hand (CASES.md "Revision 11 rev11i browser checks"). Expected values come from the requirements, never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | MKS-01 ×4 | EP (way in: Hand over / Send to Fishball / message_session / start_session) | the session is in `managed` with its way's tag (the banner and icon show exactly for these ids); the answer_prompt way is MGD-style, covered by the rev11e files |
 * | MKS-02  | EP (a session that is yours, Fishball's own session) | neither is in `managed` after the others became managed |
 * | MKS-03  | ST (managed –Take back via the banner's route→ yours) | 200 ok; the id leaves the snapshot and the events stream; the others stay |
 * | MKS-04  | ST (managed –release_session→ yours) | the id leaves the snapshot and the events stream |
 * | MKS-05  | DT (Take back refused: Fishball's own id / unknown id / bad body) | 409 is-fishball / 409 unknown-session / 400 bad-body, nothing changes (the banner shows the refusal dialog from these) |
 * | MKS-06  | ST (Session messages on –off→ on) | off: `features.messages` false, every managed entry kept unchanged (the client hides the marks); on: true, the same entries |
 * | MKS-07  | EP (Fishball live) | `status` is live while the managed entries exist (the client's other condition) |
 * | MKS-08  | EP (Sidebar icon setting) | `preferences.brandStyle` is one of fishball / deepseek, 'fishball' by default, and is the only key |
 * | MKS-09  | EP (served client bundle) | carries "Managed by Fishball" and "Take back from Fishball" |
 * | MKS-10  | ST (restart) | managed entries persist, so the marks come back after a reload |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { API, MANAGED_API, MANAGED_BY, OWN_PLUGINS, PREFERENCES, PRESET, RELEASE_TOOL, STATUS, TITLE } from './support/constants.mjs'
import { HOOK, T, catalogSettled, fishballCall, fishballClientBundle, managedEntry, managedNow, setManaged, settledIdle, turn } from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const BANNER_TEXT = 'Managed by Fishball'
const TAKE_BACK = 'Take back from Fishball'
const PUBLISH_MS = 8000
const LONG = { timeout: 150000 }
let seq = 0
const tok = (label) => 'MKS' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)

describe('Revision 11 rev11i: managed-session marks (what the client reads)', () => {
  let host
  let home
  let fb
  const s = {}
  const ids = async () => ((await managedNow(host)) ?? []).map((e) => e.sessionId)
  async function userSession(folder) {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await turn(host, sid, [[{ text: 'hello' }]], 'first words ' + folder)
    return sid
  }
  /** Runs change() with an events stream open; resolves true when a later frame satisfies pick. */
  async function frameAfter(change, pick) {
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, PUBLISH_MS, 20), 'first frame')
      const count = stream.frames.length
      await change()
      return !!(await until(() => stream.frames.slice(count).find(pick), PUBLISH_MS, 20))
    } finally { stream.close() }
  }

  before(async () => {
    home = newHome('managed-marks')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state.sessionId
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('MKS-01a Hand over: listed by hand-over', T, async () => {
    s.hand = await userSession('mks01a')
    const r = await setManaged(host, s.hand, true)
    assert.equal(r.status, 200, r.text)
    await settledIdle(host, fb)
    assert.equal((await managedEntry(host, s.hand))?.by, MANAGED_BY.handOver)
  })
  it('MKS-01b Send to Fishball: listed by send', T, async () => {
    s.send = await userSession('mks01b')
    const r = await host.post(API.send, { sessionId: s.send, note: '' })
    assert.equal(r.status, 200, r.text)
    await settledIdle(host, fb)
    assert.equal((await managedEntry(host, s.send))?.by, MANAGED_BY.send)
  })
  it('MKS-01c message_session: listed by message', T, async () => {
    s.msg = await userSession('mks01c')
    const { json } = await fishballCall(host, fb, 'message_session', { session_id: s.msg, message: tok('c') + ' please look' })
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal((await managedEntry(host, s.msg))?.by, MANAGED_BY.message)
    await settledIdle(host, s.msg)
  })
  it('MKS-01d start_session: listed by start', T, async () => {
    const folder = path.join(home, 'work', 'mks01d')
    fs.mkdirSync(folder, { recursive: true })
    const marker = tok('d')
    await host.call('queueMarker', { marker, except: fb, script: [[{ text: 'started' }]] })
    const { json } = await fishballCall(host, fb, 'start_session', { folder, title: TITLE.plain, message: marker + ' build it' })
    assert.equal(json?.ok, true, JSON.stringify(json))
    s.start = json.sessionId
    assert.equal((await managedEntry(host, s.start))?.by, MANAGED_BY.start)
    await settledIdle(host, s.start)
  })

  it('MKS-02 a session that is yours and Fishball\'s own are never listed', T, async () => {
    s.mine = await userSession('mks02')
    const listed = await ids()
    assert.equal(listed.includes(s.mine), false, 'yours')
    assert.equal(listed.includes(fb), false, 'Fishball\'s own')
    assert.deepEqual([...listed].sort(), [s.hand, s.send, s.msg, s.start].sort())
  })

  it('MKS-03 Take back through the banner\'s route: the id leaves the snapshot and the stream', T, async () => {
    const left = await frameAfter(async () => {
      const r = await setManaged(host, s.hand, false)
      assert.equal(r.status, 200, r.text)
    }, (f) => !(f.managed ?? []).some((e) => e.sessionId === s.hand))
    assert.ok(left, 'a frame without the session')
    assert.equal(await managedEntry(host, s.hand), undefined)
    assert.equal((await ids()).length, 3, 'the others stay')
    await settledIdle(host, fb)
  })

  it('MKS-04 release_session: the id leaves the snapshot and the stream', T, async () => {
    const left = await frameAfter(async () => {
      const { json } = await fishballCall(host, fb, RELEASE_TOOL, { session_id: s.msg, reason: 'fbtest: done' })
      assert.equal(json?.ok, true, JSON.stringify(json))
    }, (f) => !(f.managed ?? []).some((e) => e.sessionId === s.msg))
    assert.ok(left, 'a frame without the session')
    assert.equal(await managedEntry(host, s.msg), undefined)
    await settledIdle(host, fb)
  })

  it('MKS-05 the banner\'s refusals: Fishball\'s own, unknown, bad body', T, async () => {
    const before = await ids()
    const own = await setManaged(host, fb, false)
    assert.equal(own.status, 409, own.text)
    assert.match(own.text, /is-fishball/)
    const unknown = await setManaged(host, 'no-such-session-' + tok('u'), false)
    assert.equal(unknown.status, 409, unknown.text)
    assert.match(unknown.text, /unknown-session/)
    const bad = await host.post(MANAGED_API, { sessionId: s.send })
    assert.equal(bad.status, 400, bad.text)
    assert.deepEqual(await ids(), before)
  })

  it('MKS-06 Session messages off keeps the entries, on brings the same ones', LONG, async () => {
    const before = JSON.stringify(await managedNow(host))
    const key = OWN_PLUGINS.messages.key
    let r = await host.post(API.plugins, { plugin: key, on: false })
    assert.equal(r.status, 200, r.text)
    await catalogSettled(host)
    assert.equal((await host.state()).features.messages, false)
    assert.equal(JSON.stringify(await managedNow(host)), before, 'entries kept while off')
    r = await host.post(API.plugins, { plugin: key, on: true })
    assert.equal(r.status, 200, r.text)
    await catalogSettled(host)
    assert.equal((await host.state()).features.messages, true)
    assert.equal(JSON.stringify(await managedNow(host)), before, 'the same entries when back')
  })

  it('MKS-07 Fishball is live while the entries exist', T, async () => {
    const st = await host.state()
    assert.equal(st.status, STATUS.live)
    assert.ok((st.managed ?? []).length > 0)
  })

  it('MKS-08 the Sidebar icon setting is published as preferences.brandStyle', T, async () => {
    const p = (await host.state()).preferences
    assert.deepEqual(Object.keys(p).sort(), PREFERENCES.keys)
    assert.ok(PREFERENCES.styles.includes(p.brandStyle))
    assert.equal(p.brandStyle, PREFERENCES.defaultStyle)
  })

  it('MKS-09 the client bundle carries the banner\'s words', T, async () => {
    const bundle = await fishballClientBundle(host)
    assert.ok(bundle.found && bundle.status === 200)
    assert.ok(bundle.text.includes(BANNER_TEXT), BANNER_TEXT)
    assert.ok(bundle.text.includes(TAKE_BACK), TAKE_BACK)
  })

  it('MKS-10 managed entries survive a restart', LONG, async () => {
    const before = (await ids()).sort()
    assert.ok(before.length > 0)
    await host.stop()
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state.sessionId
    await settledIdle(host, fb)
    assert.deepEqual((await ids()).sort(), before)
  })
})
