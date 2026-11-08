/**
 * The managed-sessions entries of the connector's snapshot (DESIGN §10e "Snapshot", "Managed sessions list"; contract
 * §4.1, §9), on the H-STUB harness. Each entry is {sessionId, title, since, by}; title is the session's current DSH title
 * (it follows a later retitle, published without a restart) and null while unknown. The page's list renderer is gone
 * (slim §15 T15), but the entries are what the client reads for the managed-row marks, so they are checked here through
 * the snapshot and the events feed. Ways in today: Hand over (empty or with a note, both by 'hand-over', slim §8.3) and
 * the instance's session.start (by 'start', titled by its own title before it becomes managed).
 * Titles: DSH derives a title from the user's messages (the fake model's title answer); a session whose only turn came
 * as a relay has none. DSH's own rename (worker op renameSession) is a retitle; DSH's title service (sessionTitle) is the
 * reference. One home; the cases run in order and the restart comes last.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | MGL-01  | EP (titled session, Hand over) | §10e | entry has exactly {by, sessionId, since, title}; title is DSH's title (a non-empty string), not the id |
 * | MGL-02 ×2 | EP (way in × titled session: Hand over with a note / session.start) | §10e, contract §4.1 | with a note: by hand-over, DSH's title; start: by start, the title the instance gave it |
 * | MGL-02b | BVA (session.start whose rename is refused: no title) | §10e "Reading" (unknown title), contract §4.1 titleError | managed:true with titleError; the entry's title is null |
 * | MGL-03  | BVA (no title yet: '' in DSH) | §10e | title is null, not '' and not the id |
 * | MGL-04  | ST (null –rename A→ A –rename B→ B) | §10e | each title reaches the snapshot and an events frame without a restart; since and by unchanged |
 * | MGL-05  | ST (started with a title –the user's first message→ same) | §10e | the title the instance gave stays |
 * | MGL-06  | EP (title with quotes, markup, CJK, emoji) | §10e | the title verbatim |
 * | MGL-07  | ST (managed –Take back→ yours) | §10e | 200 ok; the entry leaves the snapshot and an events frame; a later rename does not bring it back |
 * | MGL-07b | ST (managed –session.release→ yours) | contract §4.1 | the entry leaves the snapshot and an events frame |
 * | MGL-08  | EP (rename a session that is yours) | §10e | no entry appears |
 * | MGL-09  | EP (several renames) | §10e | each session listed once |
 * | MGL-10  | DT (no instance attached) | contract §9 (managed-row marks from the connector's own state) | the entries stay in the snapshot with their titles; the snapshot says no instance is attached |
 * | MGL-13  | diagnostic | — | the host array order (the client sorts) |
 * | MGL-12  | ST (restart) | §5e "Durable", §11 | titled entries keep their title, an untitled one stays null; since and by unchanged |
 *
 * Retired:
 * - MGL-02 (message_session, by message): session.message serves managed sessions only (contract §4.1) and refuses one that is yours with not-managed, so messaging is no longer a way in.
 * - MGL-02 (Send to Fishball, by send): Hand over with a note posts the forward route, which records by hand-over (slim §8.3, T14 item 3); there is no separate send tag.
 * - MGL-10 (Session messages off): the four feature switches are gone; Hand over, watches and permission requests are always on (slim-native-design §12).
 * - MGL-11 (client bundle carries the list's labels): the settings page lost its managed-sessions list renderer (slim §15 T15 item 2); the snapshot entries it read stay and are checked here.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { MANAGED_BY, MANAGED_ENTRY_KEYS, PRESET, RELAY, TITLE } from './support/constants.mjs'
import { HOOK, T, settledIdle, turn } from './support/expect.mjs'
import { handOver, stopStub, takeBack } from './support/instance-stub.mjs'
import {
  MANAGED_STUB, bootManaged, restartManaged, detachStub, entryOf, folderIn, frameAfter, frameEntry, handOverWithNote, managedNow, reattach, release, startSession,
} from './support/instance-stub-managed.mjs'
import { sleep, until } from './support/util.mjs'

let seq = 0
const tok = (label) => 'MGL' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
/** A title with quotes, markup, CJK and emoji (MGL-06). */
const ODD_TITLE = 'Fix "auth" <b>bug</b> & 修复 🐟'
const RENAMES = 3
const sortById = (list) => [...list].sort((a, b) => a.sessionId.localeCompare(b.sessionId))

describe('the managed sessions entries of the snapshot (H-STUB)', () => {
  let booted
  let host
  const dshTitle = (sid) => host.call('sessionTitle', { sessionId: sid })
  async function rename(sid, title) {
    const r = await host.call('renameSession', { sessionId: sid, title })
    assert.equal(r.ok, true, 'rename: ' + JSON.stringify(r.error))
    assert.equal(await dshTitle(sid), title, 'precondition: DSH reports the title as given')
  }
  /** A session the user started, with one turn from the user, so DSH has titled it. */
  async function titled(folder) {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await turn(host, sid, [[{ text: 'ok' }]], 'Please refactor the parser module ' + folder)
    assert.ok(await until(async () => (await dshTitle(sid)) !== '', MANAGED_STUB.publishMs, 100), 'precondition: DSH titled the session')
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
  async function hand(sid) {
    const r = await handOver(host, sid)
    assert.equal(r.status, 200, r.text)
  }
  /** Waits until the snapshot's entry for sid has the given title; returns the entry. */
  async function entryTitled(sid, title) {
    let e
    await until(async () => { e = await entryOf(host, sid); return e?.title === title }, MANAGED_STUB.publishMs, 100)
    assert.equal(e?.title, title, 'snapshot title for ' + sid + ': ' + JSON.stringify(e))
    return e
  }

  before(async () => {
    booted = await bootManaged('managed-list')
    host = booted.host
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  const s = {}
  it('MGL-01 a handed-over session is listed with its DSH title', T, async () => {
    s.hand = await titled('mgl01')
    await hand(s.hand)
    const e = await entryTitled(s.hand, await dshTitle(s.hand))
    assert.deepEqual(Object.keys(e).sort(), MANAGED_ENTRY_KEYS)
    assert.equal(typeof e.title, 'string')
    assert.notEqual(e.title, '')
    assert.notEqual(e.title, s.hand, 'the title, not the id')
    assert.equal(e.by, MANAGED_BY.handOver)
  })

  describe('MGL-02 every way in lists the title', () => {
    it('Hand over with a note: by hand-over, DSH\'s title', T, async () => {
      s.note = await titled('mgl02-note')
      const r = await handOverWithNote(host, s.note, tok('note'))
      assert.equal(r.status, 200, r.text)
      const e = await entryTitled(s.note, await dshTitle(s.note))
      assert.equal(e.by, MANAGED_BY.handOver)
    })
    it('session.start: by start, the title the instance gave it', T, async () => {
      const marker = tok('02s')
      await host.call('queueMarker', { marker, except: null, script: [[{ text: 'started' }]] })
      const { reply } = await startSession(booted, { folder: folderIn(booted.home, 'mgl02-start'), title: TITLE.plain, message: marker + ' build it' })
      assert.equal(reply.payload?.managed, true, JSON.stringify(reply))
      s.start = reply.payload.sessionId
      assert.ok(await until(async () => (await host.call('markerState', { marker })).left === 0, MANAGED_STUB.publishMs, 100), 'the new session ran a turn')
      await settledIdle(host, s.start)
      assert.equal(await dshTitle(s.start), TITLE.plain, 'precondition: DSH reports the title the instance gave')
      const e = await entryTitled(s.start, TITLE.plain)
      assert.equal(e.by, MANAGED_BY.start)
    })
  })

  it('MGL-02b a started session whose title DSH refused is listed with title null', T, async () => {
    const { reply } = await startSession(booted, { folder: folderIn(booted.home, 'mgl02b'), title: TITLE.plain, message: tok('02b'), probe: { rename: 'invalid' } })
    assert.equal(reply.payload?.managed, true, JSON.stringify(reply))
    assert.equal(reply.payload.titleError, TITLE.invalid)
    const e = await entryOf(host, reply.payload.sessionId)
    assert.ok(e && Object.hasOwn(e, 'title'), 'listed with a title key: ' + JSON.stringify(e))
    assert.equal(e.title, null)
    await settledIdle(host, reply.payload.sessionId)
  })

  it('MGL-03 a session DSH has not titled is listed with title null', T, async () => {
    s.none = await untitled('mgl03')
    await hand(s.none)
    const e = await entryOf(host, s.none)
    assert.ok(e, 'listed')
    assert.ok(Object.hasOwn(e, 'title'), 'the key is present')
    assert.equal(e.title, null, 'null, not "" and not the id')
  })

  it('MGL-04 a retitle reaches the snapshot and the feed without a restart; since and by stay', T, async () => {
    const before = await entryOf(host, s.none)
    assert.equal(before?.title, null, 'precondition: untitled (MGL-03)')
    for (const title of ['First ' + tok('a'), 'Second ' + tok('b')]) {
      const f = await frameAfter(host, () => rename(s.none, title), (fr) => frameEntry(fr, s.none)?.title === title)
      assert.ok(f, 'an events frame carries the title ' + title)
      const e = await entryTitled(s.none, title)
      assert.equal(e.since, before.since)
      assert.equal(e.by, before.by)
    }
  })

  it('MGL-05 a started session keeps the title the instance gave it when the user writes to it', T, async () => {
    assert.equal((await entryOf(host, s.start))?.title, TITLE.plain, 'precondition: titled by session.start (MGL-02)')
    await turn(host, s.start, [[{ text: 'ok' }]], 'Please write the release notes for version two')
    await settledIdle(host, s.start)
    // DSH pins an explicit title: the user's first message does not schedule an automatic one. Give it time to (wrongly) change.
    await sleep(MANAGED_STUB.quietMs)
    assert.equal(await dshTitle(s.start), TITLE.plain)
    await entryTitled(s.start, TITLE.plain)
  })

  it('MGL-06 a title with quotes, markup, CJK and emoji is listed verbatim', T, async () => {
    await rename(s.hand, ODD_TITLE)
    await entryTitled(s.hand, ODD_TITLE)
  })

  it('MGL-07 Take back: the entry leaves the snapshot and the feed, and a rename does not bring it back', T, async () => {
    s.back = await titled('mgl07')
    await hand(s.back)
    await entryTitled(s.back, await dshTitle(s.back))
    let r
    const f = await frameAfter(host, async () => { r = await takeBack(host, s.back) }, (fr) => !frameEntry(fr, s.back))
    assert.equal(r.status, 200, r.text)
    assert.equal(r.json?.ok, true, r.text)
    assert.ok(f, 'an events frame without the entry')
    assert.equal(await entryOf(host, s.back), undefined)
    await rename(s.back, 'After take back ' + tok('7'))
    await sleep(MANAGED_STUB.quietMs)
    assert.equal(await entryOf(host, s.back), undefined, 'a rename does not list it again')
  })

  it('MGL-07b session.release: the entry leaves the snapshot and the feed', T, async () => {
    const sid = await titled('mgl07b')
    await hand(sid)
    let r
    const f = await frameAfter(host, async () => { r = await release(booted.stub, sid) }, (fr) => !frameEntry(fr, sid))
    assert.deepEqual(r.payload, { sessionId: sid, managed: false }, JSON.stringify(r))
    assert.ok(f, 'an events frame without the entry')
    assert.equal(await entryOf(host, sid), undefined)
  })

  it('MGL-08 renaming a session that is yours lists nothing', T, async () => {
    const mine = await titled('mgl08')
    const before = await managedNow(host)
    await rename(mine, 'Mine ' + tok('8'))
    await sleep(MANAGED_STUB.quietMs)
    assert.equal(await entryOf(host, mine), undefined)
    assert.equal((await managedNow(host)).length, before.length)
  })

  it('MGL-09 each managed session is listed once, however often it is renamed', T, async () => {
    for (let i = 0; i < RENAMES; i++) await rename(s.note, 'Again ' + i + ' ' + tok('9'))
    await entryTitled(s.note, await dshTitle(s.note))
    const ids = (await managedNow(host)).map((e) => e.sessionId)
    assert.equal(new Set(ids).size, ids.length, 'no duplicates: ' + JSON.stringify(ids))
  })

  it('MGL-10 with no instance attached the entries stay, with their titles', T, async () => {
    const before = await managedNow(host)
    await detachStub(booted)
    try {
      const st = await host.state()
      assert.equal(st.instance.attached, false)
      assert.deepEqual(st.managed, before, 'the same entries with the same titles')
    } finally {
      await reattach(booted)
    }
  })

  it('MGL-13 (diagnostic) the host array order', T, async (t) => {
    t.diagnostic('host order (by, since): ' + JSON.stringify((await managedNow(host)).map((e) => [e.by, e.since])))
  })

  it('MGL-12 titles survive a restart; an untitled entry stays null', MANAGED_STUB.long, async () => {
    s.later = await untitled('mgl12')
    await hand(s.later)
    const entries = await managedNow(host)
    const byId = Object.fromEntries(entries.map((e) => [e.sessionId, e]))
    assert.equal(byId[s.later]?.title, null, 'precondition: an untitled entry')
    assert.equal(typeof byId[s.hand]?.title, 'string', 'precondition: a titled entry')
    for (const e of entries) await host.call('flush', { sessionId: e.sessionId })
    booted = await restartManaged(booted)
    host = booted.host
    let now
    await until(async () => { now = await managedNow(host); return JSON.stringify(sortById(now)) === JSON.stringify(sortById(entries)) }, MANAGED_STUB.publishMs, 200)
    assert.deepEqual(sortById(now), sortById(entries), 'the same entries: same title, since and by')
  })
})
