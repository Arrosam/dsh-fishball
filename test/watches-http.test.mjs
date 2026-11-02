/**
 * P6 W1, W2, W9: the watches in the state, the GUI routes POST /api/fishball/watches and
 * /api/fishball/watches/remove, and the client bundle. Requirements in CASES.md (P6 cases);
 * expected values never come from the implementation.
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | WCH-01 | EP | W1 | GET state and the first SSE frame have watches = {active, watches}; a fresh home has {active:0, watches:[]} |
 * | WCH-02 | EP (valid, ordinary session) | W1, W2 | 200 {ok:true, state}; one new watch with exactly the 10 keys: condition finished, mode once, createdBy {kind:'user'}, status active, firedCount 0, lastFiredAt null, lastReason null; active +1 |
 * | WCH-03 | ST (active watch –same session again→) | W2 | no second watch: active and the watches on that session unchanged |
 * | WCH-04 ×7 | DT (body) | W2 | invalid JSON, array, string, {}, sessionId 1, '', null → 400 bad-body; nothing added |
 * | WCH-05 ×3 | DT (target) | W2 | unknown → 409 unknown-session; Fishball's own → is-fishball; archived → archived; nothing added |
 * | WCH-06 | BVA (maxActiveWatches 2) + ST | W2 | active 1 (limit−1): accepted; active 2 (= limit): 409 limit-reached; after one is removed (closed) a new one is accepted |
 * | WCH-07 | BVA (maxActiveWatches 1, the minimum) | W2 | one accepted, the second refused limit-reached |
 * | WCH-08 | ST (active –remove→ closed –remove→) | W2 | 200 and status closed, active −1; removing again 409 unknown-watch; unknown id 409 unknown-watch |
 * | WCH-09 ×5 | DT (remove body) | W2 | invalid JSON, array, {}, watchId 1, '' → 400 bad-body |
 * | WCH-10 | ST (removed watch, target finishes) | W2, W3 | no notice for a removed watch |
 * | WCH-11 | BVA (52 watches) | W1, W11 | the state lists 50; active first, each group newest first |
 * | WCH-12 | EP (no cookie) | W2 | neither route answers 200; nothing changes |
 * | WCH-13 | ST (SSE) | W1 | a frame with the new watch follows an add |
 * | WCH-14 | EP | W9 | the client bundle carries 'Tell Fishball when finished', a 'Watches' section, 'Remove', the Queue label 'Watched session' and 'Fishball is watching' (when it shows is not driven, A72) |
 * | WCH-15 | EP (Fishball archived: not running) | W2 | 409 unavailable |
 * | WCH-17 | BVA (auditEntriesKept 3, 5 closed) + EP (oldest watch active) | W11 | at most 3 closed kept, the newest kept and the oldest gone; the active watch is listed first |
 * | WCH-18 | ST (watched target –archive→), observed | review | the watch stays active (archiving is not detected, A70) |
 * | WCH-16 | EP (store unreadable: core failed) | W2 | 409 unavailable |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { LIMITS, PRESET, STATUS, STORE, WATCH_API, WATCH_CODE, WATCH_KEYS, WATCH_LIST_MAX, WATCH_STATUS, WATCHES_KEYS } from './support/constants.mjs'
import { HOOK, T, fishballClientBundle, noticesSettled, settledIdle, turn, watchById, watchesNow, watchesOn } from './support/expect.mjs'
import { bootHost, bootLive, newHome, until } from './support/host.mjs'

describe('P6 watch routes', () => {
  let host
  let fb
  let target
  const ordinary = async (folder) => (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
  const add = (body, opts) => host.post(WATCH_API.add, body, opts)
  const remove = (body, opts) => host.post(WATCH_API.remove, body, opts)
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  /** Close every active watch, so a limit case starts from active 0. */
  async function closeAll() {
    for (const w of (await watchesNow(host)).watches.filter((x) => x.status === WATCH_STATUS.active)) assert.equal((await remove({ watchId: w.id })).status, 200)
    assert.equal((await watchesNow(host)).active, 0)
  }

  before(async () => {
    const booted = await bootLive(newHome('watch-http'))
    host = booted.host
    fb = booted.state?.sessionId
    target = await ordinary('w-target')
    await turn(host, target, [[{ text: 'hello' }]])
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('WCH-01 the state has watches {active, watches}, empty in a fresh home', T, async () => {
    const s = await host.state()
    assert.deepEqual(Object.keys(s.watches ?? {}).sort(), WATCHES_KEYS)
    assert.deepEqual(s.watches, { active: 0, watches: [] })
    const sse = await host.sse()
    try {
      assert.ok(await until(() => sse.frames.length > 0, 3000, 50), 'a first frame')
      assert.deepEqual(sse.frames[0].watches, s.watches)
    } finally { sse.close() }
  })

  let first
  it('WCH-02 POST watches adds one active user watch with the documented shape', T, async () => {
    const before = await watchesNow(host)
    const t0 = Date.now() - 1000
    const res = await add({ sessionId: target })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    assert.ok(res.json.state?.watches, 'the answer carries the state')
    const now = res.json.state.watches
    assert.equal(now.active, before.active + 1)
    const w = now.watches.find((x) => x.targetSessionId === target)
    assert.ok(w, 'a watch on the session')
    assert.deepEqual(Object.keys(w).sort(), WATCH_KEYS)
    assert.equal(typeof w.id, 'string')
    assert.ok(w.id.length > 0)
    assert.equal(w.condition, 'finished')
    assert.equal(w.mode, 'once')
    assert.deepEqual(w.createdBy, { kind: 'user' })
    assert.equal(w.status, WATCH_STATUS.active)
    assert.equal(w.firedCount, 0)
    assert.equal(w.lastFiredAt, null)
    assert.equal(w.lastReason, null)
    assert.ok(Date.parse(w.createdAt) >= t0, w.createdAt)
    assert.deepEqual(await watchById(host, w.id), w, 'GET state shows the same watch')
    first = w
  })

  it('WCH-03 the same session again while its watch is active adds no second watch', T, async (t) => {
    assert.ok(first, 'precondition: WCH-02')
    const before = await watchesNow(host)
    const res = await add({ sessionId: target })
    t.diagnostic('answer to the repeat: ' + res.status + ' ' + JSON.stringify(res.json?.ok ?? res.json))
    const now = await watchesNow(host)
    assert.equal(now.active, before.active)
    assert.equal((await watchesOn(host, target)).length, 1)
  })

  const badBodies = [
    ['invalid JSON', '{sessionId:', true],
    ['a JSON array', '["x"]', true],
    ['a JSON string', '"x"', true],
    ['{}', {}, false],
    ['sessionId as a number', { sessionId: 1 }, false],
    ['an empty sessionId', { sessionId: '' }, false],
    ['sessionId null', { sessionId: null }, false],
  ]
  for (const [label, body, raw] of badBodies) {
    it('WCH-04 ' + label + ' → 400 bad-body', T, async () => {
      const before = await watchesNow(host)
      const res = await add(body, { raw })
      assert.equal(res.status, 400, res.text)
      assert.deepEqual(res.json, { ok: false, code: WATCH_CODE.badBody })
      assert.deepEqual(await watchesNow(host), before)
    })
  }

  describe('WCH-05 refused targets', () => {
    let archivedId
    before(async () => {
      archivedId = await ordinary('w-archived')
      assert.equal((await host.call('archive', { sessionId: archivedId, stopActivity: true })).ok, true)
    }, HOOK)
    const rows = [
      ['an unknown session', () => 'session-fbtest-no-such-watch', WATCH_CODE.unknownSession],
      ["Fishball's own session", () => fb, WATCH_CODE.isFishball],
      ['an archived session', () => archivedId, WATCH_CODE.archived],
    ]
    for (const [label, sid, code] of rows) {
      it(label + ' → 409 ' + code, T, async () => {
        const before = await watchesNow(host)
        const res = await add({ sessionId: sid() })
        assert.equal(res.status, 409, res.text)
        assert.deepEqual(res.json, { ok: false, code })
        assert.deepEqual(await watchesNow(host), before)
      })
    }
  })

  describe('WCH-06/07 maxActiveWatches', () => {
    let s1
    let s2
    let s3
    before(async () => { s1 = await ordinary('w-lim1'); s2 = await ordinary('w-lim2'); s3 = await ordinary('w-lim3') }, HOOK)
    after(async () => { await setLimit({ maxActiveWatches: LIMITS.maxActiveWatches.default }) }, HOOK)

    it('WCH-06 limit 2: limit−1 accepted, at the limit refused, a closed watch frees a place', T, async () => {
      await closeAll()
      await setLimit({ maxActiveWatches: 2 })
      assert.equal((await add({ sessionId: s1 })).status, 200, 'active 0 → 1')
      const second = await add({ sessionId: s2 })
      assert.equal(second.status, 200, 'active 1 (limit − 1) → 2: ' + second.text)
      assert.equal((await watchesNow(host)).active, 2)
      const third = await add({ sessionId: s3 })
      assert.equal(third.status, 409, third.text)
      assert.deepEqual(third.json, { ok: false, code: WATCH_CODE.limit })
      assert.equal((await watchesOn(host, s3)).length, 0)
      const w1 = (await watchesOn(host, s1))[0]
      assert.equal((await remove({ watchId: w1.id })).status, 200)
      const again = await add({ sessionId: s3 })
      assert.equal(again.status, 200, 'closed watches do not count: ' + again.text)
      assert.equal((await watchesNow(host)).active, 2)
    })

    it('WCH-07 limit 1 (the minimum): one accepted, the next refused', T, async () => {
      await closeAll()
      await setLimit({ maxActiveWatches: 1 })
      assert.equal((await add({ sessionId: s1 })).status, 200)
      const res = await add({ sessionId: s2 })
      assert.equal(res.status, 409)
      assert.deepEqual(res.json, { ok: false, code: WATCH_CODE.limit })
      await closeAll()
    })
  })

  let removed
  it('WCH-08 remove closes an active watch; a second remove and an unknown id answer unknown-watch', T, async () => {
    await closeAll()
    assert.equal((await add({ sessionId: target })).status, 200)
    const w = (await watchesOn(host, target)).find((x) => x.status === WATCH_STATUS.active)
    const before = await watchesNow(host)
    const res = await remove({ watchId: w.id })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    assert.equal((await watchById(host, w.id))?.status, WATCH_STATUS.closed)
    assert.equal((await watchesNow(host)).active, before.active - 1)
    for (const id of [w.id, 'fbtest-no-such-watch']) {
      const r = await remove({ watchId: id })
      assert.equal(r.status, 409, r.text)
      assert.deepEqual(r.json, { ok: false, code: WATCH_CODE.unknownWatch })
    }
    removed = w
  })

  const badRemove = [
    ['invalid JSON', '{watchId', true],
    ['a JSON array', '[]', true],
    ['{}', {}, false],
    ['watchId as a number', { watchId: 1 }, false],
    ['an empty watchId', { watchId: '' }, false],
  ]
  for (const [label, body, raw] of badRemove) {
    it('WCH-09 remove with ' + label + ' → 400 bad-body', T, async () => {
      const res = await remove(body, { raw })
      assert.equal(res.status, 400, res.text)
      assert.deepEqual(res.json, { ok: false, code: WATCH_CODE.badBody })
    })
  }

  it('WCH-10 a removed watch never fires', T, async () => {
    assert.ok(removed, 'precondition: WCH-08')
    await turn(host, target, [[{ text: 'after removal' }]])
    assert.equal((await noticesSettled(host, fb, removed.id, 0)).length, 0)
    const w = await watchById(host, removed.id)
    assert.equal(w.status, WATCH_STATUS.closed)
    assert.equal(w.firedCount, 0)
  })

  it('WCH-11 the state lists at most 50 watches, newest first', T, async () => {
    const s = await ordinary('w-many')
    for (let i = 0; i < WATCH_LIST_MAX + 2; i++) {
      assert.equal((await add({ sessionId: s })).status, 200, 'add ' + i)
      const w = (await watchesOn(host, s)).find((x) => x.status === WATCH_STATUS.active)
      assert.equal((await remove({ watchId: w.id })).status, 200, 'remove ' + i)
    }
    const { watches } = await watchesNow(host)
    assert.equal(watches.length, WATCH_LIST_MAX)
    // W11: active watches first; within each group newest first.
    for (const group of [watches.filter((w) => w.status === WATCH_STATUS.active), watches.filter((w) => w.status !== WATCH_STATUS.active)]) {
      const times = group.map((w) => Date.parse(w.createdAt))
      for (let i = 1; i < times.length; i++) assert.ok(times[i - 1] >= times[i], 'newest first at ' + i)
    }
  })

  it('WCH-12 both routes refuse a request without the browser cookie', T, async () => {
    const before = await watchesNow(host)
    for (const [url, body] of [[WATCH_API.add, { sessionId: target }], [WATCH_API.remove, { watchId: 'x' }]]) {
      const res = await fetch(host.origin + url, { method: 'POST', headers: { origin: host.origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      await res.text()
      assert.notEqual(res.status, 200, url)
    }
    assert.deepEqual(await watchesNow(host), before)
  })

  it('WCH-13 an add produces an SSE frame with the new watch', T, async () => {
    const s = await ordinary('w-sse')
    const sse = await host.sse()
    try {
      assert.ok(await until(() => sse.frames.length > 0, 3000, 50))
      assert.equal((await add({ sessionId: s })).status, 200)
      assert.ok(await until(() => sse.frames.some((f) => f.watches?.watches?.some((w) => w.targetSessionId === s)), 8000, 50), 'a frame shows the watch')
    } finally { sse.close() }
  })

  it('WCH-14 the client bundle has the menu entry, the Watches section and Remove', T, async () => {
    const bundle = await fishballClientBundle(host)
    assert.ok(bundle.found)
    assert.equal(bundle.status, 200)
    assert.ok(bundle.text.includes('Tell Fishball when finished'), 'entry label')
    assert.ok(bundle.text.includes('Watches'), 'settings section')
    assert.ok(bundle.text.includes('Remove'), 'Remove action')
    assert.ok(bundle.text.includes('Watched session'), "the Queue section's label for watch notices")
    assert.ok(bundle.text.includes('Fishball is watching'), "the entry's watching state")
  })

  it('WCH-17 closed watches are kept up to auditEntriesKept; active watches are listed first', T, async () => {
    const s = await ordinary('w-keep')
    const keeper = await ordinary('w-keep-active')
    await closeAll()
    // The active watch is the OLDEST, so newest-first alone would push it below the closed ones.
    assert.equal((await add({ sessionId: keeper })).status, 200)
    const active = (await watchesOn(host, keeper)).find((w) => w.status === WATCH_STATUS.active)
    await setLimit({ auditEntriesKept: 3 })
    try {
      const closedIds = []
      for (let i = 0; i < 5; i++) {
        assert.equal((await add({ sessionId: s })).status, 200)
        const w = (await watchesOn(host, s)).find((x) => x.status === WATCH_STATUS.active)
        assert.equal((await remove({ watchId: w.id })).status, 200)
        closedIds.push(w.id)
      }
      const { watches } = await watchesNow(host)
      const closed = watches.filter((w) => w.status !== WATCH_STATUS.active)
      assert.ok(closed.length <= 3, 'at most 3 closed kept: ' + closed.length)
      assert.ok(closed.some((w) => w.id === closedIds.at(-1)), 'the newest closed one is kept')
      assert.equal(closed.some((w) => w.id === closedIds[0]), false, 'the oldest closed one is gone')
      assert.equal(watches[0].id, active.id, 'the active watch is listed first')
      const firstClosed = watches.findIndex((w) => w.status !== WATCH_STATUS.active)
      assert.ok(watches.slice(firstClosed).every((w) => w.status !== WATCH_STATUS.active), 'every active watch comes before the closed ones')
    } finally { await setLimit({ auditEntriesKept: LIMITS.auditEntriesKept.default }) }
  })

  it('WCH-18 (observed) archiving a watched session leaves its watch active', T, async (t) => {
    const s = await ordinary('w-arch-later')
    assert.equal((await add({ sessionId: s })).status, 200)
    const w = (await watchesOn(host, s)).find((x) => x.status === WATCH_STATUS.active)
    assert.equal((await host.call('archive', { sessionId: s, stopActivity: true })).ok, true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const now = await watchById(host, w.id)
    t.diagnostic('watch after archiving its target: ' + now?.status)
    // Not a requirement: the implementer reports archiving is not detected (CASES.md A70).
    assert.equal(now?.status, WATCH_STATUS.active)
    assert.equal((await remove({ watchId: w.id })).status, 200)
  })

  it('WCH-15 while Fishball is archived (not running) an add answers 409 unavailable', T, async (t) => {
    const s = await ordinary('w-unavail')
    await settledIdle(host, fb)
    assert.equal((await host.call('archive', { sessionId: fb, stopActivity: true })).ok, true)
    await host.waitStatus(STATUS.archived)
    const res = await add({ sessionId: s })
    const added = (res.json?.state?.watches?.watches ?? []).filter((w) => w.targetSessionId === s).length
    assert.equal(res.status, 409, 'answered ' + res.status + ' ' + JSON.stringify({ ok: res.json?.ok, code: res.json?.code, status: res.json?.state?.status, watchesAddedOnTarget: added }))
    assert.deepEqual(res.json, { ok: false, code: WATCH_CODE.unavailable })
    const rm = await remove({ watchId: 'fbtest-x' })
    t.diagnostic('remove while archived: ' + rm.status + ' ' + rm.text)
  })
})

describe('P6 watch route while the core failed', () => {
  let host
  before(async () => {
    const home = newHome('watch-failed')
    fs.mkdirSync(path.dirname(STORE.file(home)), { recursive: true })
    fs.writeFileSync(STORE.file(home), '{"unit": {"name": "fishball", "version": 1}, "global": ')
    host = await bootHost(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('WCH-16 POST watches answers 409 unavailable', T, async (t) => {
    const st = await host.waitStatus(STATUS.failed)
    assert.equal(st?.status, STATUS.failed, 'precondition: ' + JSON.stringify(st))
    t.diagnostic('watches while failed: ' + JSON.stringify(st.watches))
    const s = (await host.call('ordinary', { preset: PRESET.bare, folder: 'f' })).sessionId
    const res = await host.post(WATCH_API.add, { sessionId: s })
    assert.equal(res.status, 409, res.text)
    assert.deepEqual(res.json, { ok: false, code: WATCH_CODE.unavailable })
  })
})
