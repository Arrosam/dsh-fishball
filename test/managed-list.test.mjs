/**
 * Revision 11 rev11a follow-up: the managed-sessions list on the settings page (DESIGN §10e "Settings page",
 * "Snapshot"). The user's decisions: each snapshot entry is {sessionId, title, since, by}; title is the session's
 * current DSH title (it follows a later retitle, published without a restart) and null while unknown; the list
 * always shows (Take back only while Session messages is on and Fishball is live, a browser concern); Take back
 * posts the existing route. The browser's order (newest first) and the unknown-title fallback cannot be checked
 * here; the browser half is checked only through the served client bundle.
 * Titles: DSH derives a title from the user's messages; a session whose only turn came from Fishball's message_session has none.
 * start_session names the session itself (its required title, set through DSH's rename), so a started session is titled from the start.
 * DSH's own rename (worker op renameSession) is a retitle; DSH's title service (sessionTitle) is the reference.
 * One home; the cases run in order and the restart comes last.
 * Expected values come from the requirements (CASES.md "rev11a follow-up: managed sessions list").
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | MGL-01  | EP (titled session, Hand over) | entry has exactly {by, sessionId, since, title}; title is DSH's title (a non-empty string), not the id |
 * | MGL-02 ×3 | EP (way in × titled session: send / message / start) | send and message: title is DSH's title; start: the title Fishball gave it |
 * | MGL-03  | BVA (no title yet: '' in DSH) | title is null, not '' and not the id |
 * | MGL-04  | ST (null –rename A→ A –rename B→ B) | each title reaches the snapshot and an events frame without a restart; since and by unchanged |
 * | MGL-05  | ST (started with a title –the user's first message→ same) | the title Fishball gave stays: DSH pins an explicit title, so the user's message does not replace it |
 * | MGL-06  | EP (title with quotes, markup, CJK, emoji) | the title verbatim |
 * | MGL-07  | ST (managed –Take back (list path)→ yours) | same route: 200 ok; the entry leaves the snapshot and an events frame; a later rename does not bring it back |
 * | MGL-08  | EP (rename a session that is yours) | no entry appears |
 * | MGL-09  | EP (several renames) | each session listed once |
 * | MGL-10 ×2 | DT (Session messages off / Fishball not live) | the list is still in the snapshot with the titles (features.messages false / status not live) |
 * | MGL-11  | EP (served client bundle) | carries "Managed sessions", the four by-tags, "Take back from Fishball" and "Nothing yet" (the route's literal path: diagnostic) |
 * | MGL-12  | ST (restart) | titled entries keep their title, an untitled one stays null; since and by unchanged |
 * | MGL-13  | diagnostic | the host array order (the browser sorts newest first) |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { API, MANAGED_API, MANAGED_BY, MANAGED_ENTRY_KEYS, MANAGED_LABELS, MANAGED_LIST_LABELS, OWN_PLUGINS, PRESET, RELAY, STATUS, TITLE, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, fishballCall, fishballClientBundle, managedEntry, managedNow, pluginIn, setManaged, settledIdle, turn, untilCatalog } from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'MGL' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
/** How long a title change may take to reach the snapshot (it is pushed, not polled by DSH). */
const PUBLISH_MS = 8000
/** How long "nothing appears" is watched for. */
const QUIET_MS = 1200
const LONG = { timeout: 150000 }

describe('Revision 11 rev11a follow-up: the managed sessions list', { skip: NEEDS_INSTANCE_STUB }, () => {
  let host
  let home
  let fb
  const boot = async () => {
    host = await bootHost(home)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'live: ' + JSON.stringify(st?.status))
    fb = st.sessionId
    await settledIdle(host, fb)
  }
  const dshTitle = (sid) => host.call('sessionTitle', { sessionId: sid })
  const rename = async (sid, title) => {
    const r = await host.call('renameSession', { sessionId: sid, title })
    assert.equal(r.ok, true, 'rename: ' + JSON.stringify(r.error))
    assert.equal(await dshTitle(sid), title, 'precondition: DSH reports the title as given')
  }
  /** A session the user started, with one turn from the user, so DSH has titled it. */
  async function titled(folder) {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await turn(host, sid, [[{ text: 'ok' }]], 'Please refactor the parser module ' + folder)
    assert.ok(await until(async () => (await dshTitle(sid)) !== '', PUBLISH_MS, 100), 'precondition: DSH titled the session')
    return sid
  }
  /** A session whose only turn came from another session (a relay), so DSH never derived a title. */
  async function untitled(folder) {
    const other = (await host.call('ordinary', { preset: PRESET.bare, folder: folder + '-other' })).sessionId
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await host.call('driveStart', { sessionId: sid, text: 'relay words', script: [[{ text: 'ok' }]], source: { ...RELAY, senderSessionId: other } })
    assert.ok(await host.call('waitIdle', { sessionId: sid }))
    assert.equal(await dshTitle(sid), '', 'precondition: the session has no title')
    return sid
  }
  async function handOver(sid) {
    const r = await setManaged(host, sid, true)
    assert.equal(r.status, 200, r.text)
    await settledIdle(host, fb)
  }
  /** Waits until the snapshot's entry for sid has the given title; returns the entry. */
  async function entryTitled(sid, title) {
    let e
    await until(async () => { e = await managedEntry(host, sid); return e?.title === title }, PUBLISH_MS, 100)
    assert.equal(e?.title, title, 'snapshot title for ' + sid + ': ' + JSON.stringify(e))
    return e
  }
  /** Runs change() with an events stream open and returns the first later frame that matches pick. */
  async function frameAfter(change, pick) {
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, PUBLISH_MS, 20), 'first frame')
      const count = stream.frames.length
      await change()
      return await until(() => stream.frames.slice(count).find(pick), PUBLISH_MS, 20)
    } finally { stream.close() }
  }
  const frameEntry = (f, sid) => (f.managed ?? []).find((e) => e.sessionId === sid)

  before(async () => {
    home = newHome('managed-list')
    await boot()
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  const s = {}
  it('MGL-01 a handed-over session is listed with its DSH title', T, async () => {
    s.hand = await titled('mgl01')
    await handOver(s.hand)
    const e = await entryTitled(s.hand, await dshTitle(s.hand))
    assert.deepEqual(Object.keys(e).sort(), MANAGED_ENTRY_KEYS)
    assert.equal(typeof e.title, 'string')
    assert.notEqual(e.title, '')
    assert.notEqual(e.title, s.hand, 'the title, not the id')
    assert.equal(e.by, MANAGED_BY.handOver)
  })

  describe('MGL-02 every way in lists the title', () => {
    it('Send to Fishball: by send, DSH\'s title', T, async () => {
      s.send = await titled('mgl02-send')
      const r = await host.post(API.send, { sessionId: s.send, note: '' })
      assert.equal(r.status, 200, r.text)
      await settledIdle(host, fb)
      const e = await entryTitled(s.send, await dshTitle(s.send))
      assert.equal(e.by, MANAGED_BY.send)
    })
    it('message_session: by message, DSH\'s title', T, async () => {
      s.msg = await titled('mgl02-msg')
      const { json } = await fishballCall(host, fb, 'message_session', { session_id: s.msg, message: tok('02') + ' please look' })
      assert.equal(json?.ok, true, JSON.stringify(json))
      await settledIdle(host, s.msg)
      const e = await entryTitled(s.msg, await dshTitle(s.msg))
      assert.equal(e.by, MANAGED_BY.message)
    })
    it('start_session: by start, the title Fishball gave it', T, async () => {
      const folder = path.join(home, 'work', 'mgl02-start')
      fs.mkdirSync(folder, { recursive: true })
      const marker = tok('02s')
      await host.call('queueMarker', { marker, except: fb, script: [[{ text: 'started' }]] })
      const { json } = await fishballCall(host, fb, 'start_session', { folder, title: TITLE.plain, message: marker + ' build it' })
      assert.equal(json?.ok, true, JSON.stringify(json))
      s.start = json.sessionId
      assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, 10000, 100), 'the new session ran a turn')
      await settledIdle(host, s.start)
      assert.equal(await dshTitle(s.start), TITLE.plain, "precondition: DSH reports the title Fishball gave (its only message came from Fishball)")
      const e = await entryTitled(s.start, TITLE.plain)
      assert.equal(e.by, MANAGED_BY.start)
    })
  })

  it('MGL-03 a session DSH has not titled is listed with title null', T, async () => {
    s.none = await untitled('mgl03')
    await handOver(s.none)
    const e = await managedEntry(host, s.none)
    assert.ok(e, 'listed')
    assert.ok(Object.hasOwn(e, 'title'), 'the key is present')
    assert.equal(e.title, null, 'null, not "" and not the id')
  })

  it('MGL-04 a retitle reaches the snapshot without a restart; since and by stay', T, async () => {
    const before = await managedEntry(host, s.none)
    assert.equal(before?.title, null, 'precondition: untitled (MGL-03)')
    for (const title of ['First ' + tok('a'), 'Second ' + tok('b')]) {
      const f = await frameAfter(() => rename(s.none, title), (fr) => frameEntry(fr, s.none)?.title === title)
      assert.ok(f, 'an events frame carries the title ' + title)
      const e = await entryTitled(s.none, title)
      assert.equal(e.since, before.since)
      assert.equal(e.by, before.by)
    }
  })

  it('MGL-05 a started session keeps the title Fishball gave it when the user writes to it', T, async () => {
    assert.equal((await managedEntry(host, s.start))?.title, TITLE.plain, 'precondition: titled by start_session (MGL-02 start)')
    await turn(host, s.start, [[{ text: 'ok' }]], 'Please write the release notes for version two')
    await settledIdle(host, s.start)
    // DSH pins an explicit title: the user's first message does not schedule an automatic one. Give it time to (wrongly) change.
    await sleep(QUIET_MS)
    assert.equal(await dshTitle(s.start), TITLE.plain)
    await entryTitled(s.start, TITLE.plain)
  })

  it('MGL-06 a title with quotes, markup, CJK and emoji is listed verbatim', T, async () => {
    const title = 'Fix "auth" <b>bug</b> & 修复 🐟'
    await rename(s.hand, title)
    await entryTitled(s.hand, title)
  })

  it('MGL-07 Take back from the list posts the same route and the entry leaves', T, async () => {
    s.back = await titled('mgl07')
    await handOver(s.back)
    await entryTitled(s.back, await dshTitle(s.back))
    let r
    const f = await frameAfter(async () => { r = await host.post(MANAGED_API, { sessionId: s.back, managed: false }) }, (fr) => !frameEntry(fr, s.back))
    assert.equal(r.status, 200, r.text)
    assert.equal(r.json?.ok, true, r.text)
    assert.ok(f, 'an events frame without the entry')
    assert.equal(await managedEntry(host, s.back), undefined)
    await settledIdle(host, fb)
    await rename(s.back, 'After take back ' + tok('7'))
    await sleep(QUIET_MS)
    assert.equal(await managedEntry(host, s.back), undefined, 'a rename does not list it again')
  })

  it('MGL-08 renaming a session that is yours lists nothing', T, async () => {
    const mine = await titled('mgl08')
    const before = await managedNow(host)
    await rename(mine, 'Mine ' + tok('8'))
    await sleep(QUIET_MS)
    assert.equal(await managedEntry(host, mine), undefined)
    assert.equal((await managedNow(host)).length, before.length)
  })

  it('MGL-09 each managed session is listed once, however often it is renamed', T, async () => {
    for (let i = 0; i < 3; i++) await rename(s.send, 'Again ' + i + ' ' + tok('9'))
    await entryTitled(s.send, await dshTitle(s.send))
    const ids = (await managedNow(host)).map((e) => e.sessionId)
    assert.equal(new Set(ids).size, ids.length, 'no duplicates: ' + JSON.stringify(ids))
  })

  describe('MGL-10 the list stays while Take back is unavailable', () => {
    it('Session messages off: listed with titles, features.messages false', T, async () => {
      const spec = OWN_PLUGINS.messages
      const before = await managedNow(host)
      await settledIdle(host, fb)
      const off = await host.post(API.plugins, { plugin: spec.key, on: false })
      assert.equal(off.status, 200, off.text)
      try {
        assert.ok(await untilCatalog(host, (c) => pluginIn(c, spec.key)?.applied === false), 'applied off')
        const st = await host.state()
        assert.equal(st.features.messages, false)
        assert.deepEqual(st.managed, before, 'the same entries with the same titles')
      } finally {
        const on = await host.post(API.plugins, { plugin: spec.key, on: true })
        assert.equal(on.status, 200, on.text)
        assert.ok(await untilCatalog(host, (c) => pluginIn(c, spec.key)?.applied === true), 'applied on')
        await settledIdle(host, fb)
      }
    })
    it('Fishball not live (archived): listed with titles', LONG, async () => {
      const before = await managedNow(host)
      const archived = await host.call('archive', { sessionId: fb, stopActivity: true })
      assert.equal(archived.ok, true, JSON.stringify(archived))
      try {
        const st = await host.waitStatus(STATUS.archived)
        assert.notEqual(st?.status, STATUS.live)
        assert.deepEqual(st.managed, before, 'the same entries with the same titles')
      } finally {
        await host.call('unarchive', { sessionId: fb })
        const rec = await host.post(API.recovery, { action: 'retry' })
        assert.equal(rec.status, 200, rec.text)
        await host.waitStatus(STATUS.live)
        await settledIdle(host, fb)
      }
    })
  })

  it('MGL-11 the client bundle carries the list\'s labels', T, async (t) => {
    const bundle = await fishballClientBundle(host)
    assert.ok(bundle.found, 'index references fishball-connector/client.js')
    assert.equal(bundle.status, 200)
    const labels = [MANAGED_LIST_LABELS.heading, ...Object.values(MANAGED_LIST_LABELS.by), MANAGED_LABELS.takeBack, MANAGED_LIST_LABELS.empty]
    for (const l of labels) assert.ok(bundle.text.includes(l), 'bundle lacks ' + JSON.stringify(l))
    // The bundle may compose the route from a shared base, so its literal path is recorded only (as in MGD-16).
    t.diagnostic('bundle names ' + MANAGED_API + ': ' + bundle.text.includes(MANAGED_API))
  })

  it('MGL-13 (diagnostic) the host array order', T, async (t) => {
    t.diagnostic('host order (by, since): ' + JSON.stringify((await managedNow(host)).map((e) => [e.by, e.since])))
  })

  it('MGL-12 titles survive a restart; an untitled entry stays null', LONG, async () => {
    s.later = await untitled('mgl12')
    await handOver(s.later)
    const entries = await managedNow(host)
    const byId = Object.fromEntries(entries.map((e) => [e.sessionId, e]))
    assert.equal(byId[s.later]?.title, null, 'precondition: an untitled entry')
    assert.equal(typeof byId[s.hand]?.title, 'string', 'precondition: a titled entry')
    for (const sid of entries.map((e) => e.sessionId)) await host.call('flush', { sessionId: sid })
    await host.stop()
    await boot()
    const sort = (list) => [...list].sort((a, b) => a.sessionId.localeCompare(b.sessionId))
    let now
    await until(async () => { now = await managedNow(host); return JSON.stringify(sort(now)) === JSON.stringify(sort(entries)) }, PUBLISH_MS, 200)
    assert.deepEqual(sort(now), sort(entries), 'the same entries: same title, since and by')
  })
})
