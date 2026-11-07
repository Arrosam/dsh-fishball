/**
 * P6 W1, W2, W11 on H-STUB: setting up and removing watches, through the user's routes
 * POST /api/fishball/watches and /api/fishball/watches/remove (DESIGN.md §5c "As built", §10 "Host
 * API"; slim §9 "their services and HTTP routes stay") and through the instance's contract
 * operations session.watch / session.watches / session.unwatch (contract §4.1, §6), with the bounds
 * maxActiveWatches, watchesShown and auditEntriesKept (DESIGN.md §16, §5c "Kept").
 * The in-process Fishball session is gone (slim §12), so the watches are read through
 * `session.watches` ({watchId, sessionId, mode, status}), not through `state.watches`.
 *
 * | id     | technique | requirement | expected |
 * |--------|-----------|-------------|----------|
 * | WCH-02 | EP (valid, a session that is the user's) | DESIGN §5c, §10 | POST watches → 200 {ok:true}; session.watches lists one new watch on it: mode once, status active |
 * | WCH-03 | ST (active watch –session.watch again→) | DESIGN §5c "An identical active watch is returned" | the same watchId; one active watch on the session |
 * | WCH-03b | ST (active route watch –POST again→) | DESIGN §5c | still one active watch on the session |
 * | WCH-04 ×7 | DT (body) | DESIGN §10 | invalid JSON, array, string, {}, sessionId 1, '', null → 400 bad-body; nothing added |
 * | WCH-05 ×3 | DT (target) | DESIGN §5c "Checks at registration" | unknown → 409 unknown-session; Fishball's own → is-fishball; archived → archived; nothing added |
 * | WCH-05c ×4 | DT (target of session.watch) | contract §4.1, §6 WATCH_ERROR, §7; DESIGN §5c checks | unknown → unknown-session; Fishball's own → is-fishball (as `watchError` or as an error frame, since §7 lists both as frame codes); archived → `watchError` archived; unrelated → `watchError` not-related (neither is a frame code); nothing added |
 * | WCH-06 | BVA (maxActiveWatches 2) + ST | DESIGN §16, contract §4.1 | active 1 (limit−1): accepted; active 2 (= limit): {watchError:'limit-reached'}; after an unwatch (closed) a new one is accepted |
 * | WCH-07 | BVA (maxActiveWatches 1, the minimum) | DESIGN §16 | one accepted, the second limit-reached |
 * | WCH-08 | ST (active –remove→ closed –remove→) | DESIGN §10 | 200 and status closed; removing again 409 unknown-watch; unknown id 409 unknown-watch |
 * | WCH-09 ×5 | DT (remove body) | DESIGN §10 | invalid JSON, array, {}, watchId 1, '' → 400 bad-body |
 * | WCH-10 | ST (watch –session.unwatch→ closed, target finishes) | DESIGN §5c, contract §4.1 | no notice for a removed watch; it stays closed |
 * | WCH-11 | BVA (52 closed watches) | DESIGN §16 watchesShown 50 | session.watches lists 50: the newest kept, the two oldest left out |
 * | WCH-12 | EP (no cookie) | DESIGN §10 "behind DSH's browser authentication" | neither route answers 200; nothing changes |
 * | WCH-15 | EP (no instance attached) | slim §5.2 "Child down: queue, never refuse" (replaces "Fishball archived → 409") | POST watches answers 200, not 409; the watch is listed after the next attach |
 * | WCH-16 | EP (store unreadable: core failed) | DESIGN §5c "not live (… failed)", §9 fails closed | POST watches answers 409 unavailable |
 * | WCH-17 | BVA (auditEntriesKept 3, 5 closed) + EP (oldest watch active) | DESIGN §5c "Kept" | at most 3 closed listed, newest kept, oldest gone; the active watch is listed first |
 * | WCH-18 | ST (watched target –archive→), observed | DESIGN §5c "Archiving a target is not detected" | the watch stays active |
 *
 * Retired:
 * - WCH-01: `state.watches` and its SSE frame fed the settings page's Watches section, removed (slim §9 "No legacy sections"); the list is session.watches now (WCH-11).
 * - WCH-13: the SSE frame of an add is `state.watches`, removed with that section (slim §9).
 * - WCH-14: the client's "Tell Fishball when finished" entry, Watches section and Remove were removed (slim T14 / §9: hand-over replaces watch-only).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { LIMITS, STATUS, STORE } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { bootHost } from './support/host.mjs'
import { bootStub, managedSession, stopStub, stubEnv, stubHome, userSession } from './support/instance-stub.mjs'
import {
  WATCHES, activeCount, answerTurn, attachReady, closeAll, noticesSettled, refusalOf, setLimit, unwatchOp, watchEntry, watchList, watchOk, watchOp, watchesOn,
} from './support/instance-stub-watches.mjs'

const { route, routeCode, status: WSTATUS, mode: WMODE } = WATCHES

describe('P6 watch routes and the watch list (H-STUB)', () => {
  let booted
  let host
  let stub
  let fb
  /** A session that is the user's (never handed over), with one finished turn. */
  let target
  const add = (body, opts) => host.post(route.add, body, opts)
  const remove = (body, opts) => host.post(route.remove, body, opts)
  const activeOn = async (sid) => (await watchesOn(stub, sid)).filter((w) => w.status === WSTATUS.active)

  before(async () => {
    booted = await bootStub('watch-http')
    ;({ host, stub } = booted)
    fb = (await host.state()).sessionId
    target = await userSession(host, 'w-target')
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  let routeWatch
  it('WCH-02 POST watches adds one active watch on a session that is the user\'s', T, async () => {
    const before = await watchesOn(stub, target)
    const res = await add({ sessionId: target })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    const now = await watchesOn(stub, target)
    assert.equal(now.length, before.length + 1, 'one new watch on the session')
    const w = now.find((x) => !before.some((b) => b.watchId === x.watchId))
    assert.deepEqual(Object.keys(w).sort(), WATCHES.listKeys)
    assert.equal(w.mode, WMODE.once)
    assert.equal(w.status, WSTATUS.active)
    routeWatch = w
  })

  it('WCH-03 session.watch on a session with an identical active watch returns that watch', T, async () => {
    const sid = await managedSession(host, 'w-same')
    const first = await watchOk(stub, sid, WMODE.once)
    assert.equal(await watchOk(stub, sid, WMODE.once), first, 'session.watch answers the same watchId')
    assert.equal((await activeOn(sid)).length, 1)
  })

  it('WCH-03b the route adds no second active watch on the same session', T, async () => {
    assert.ok(routeWatch, 'precondition: WCH-02')
    await add({ sessionId: target })
    assert.equal((await activeOn(target)).length, 1)
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
      const before = await watchList(stub)
      const res = await add(body, { raw })
      assert.equal(res.status, 400, res.text)
      assert.deepEqual(res.json, { ok: false, code: routeCode.badBody })
      assert.deepEqual(await watchList(stub), before)
    })
  }

  describe('WCH-05 refused targets', () => {
    let archivedId
    before(async () => {
      archivedId = await userSession(host, 'w-archived')
      assert.equal((await host.call('archive', { sessionId: archivedId, stopActivity: true })).ok, true)
    }, HOOK)
    const rows = [
      ['an unknown session', () => WATCHES.missingSession, routeCode.unknownSession],
      ["Fishball's own session", () => fb, routeCode.isFishball],
      ['an archived session', () => archivedId, routeCode.archived],
    ]
    for (const [label, sid, code] of rows) {
      it(label + ' → 409 ' + code, T, async () => {
        const before = await watchList(stub)
        const res = await add({ sessionId: sid() })
        assert.equal(res.status, 409, res.text)
        assert.deepEqual(res.json, { ok: false, code })
        assert.deepEqual(await watchList(stub), before)
      })
    }
  })

  describe('WCH-05c session.watch refusals', () => {
    let archivedId
    let unrelated
    before(async () => {
      archivedId = await managedSession(host, 'w-c-archived')
      assert.equal((await host.call('archive', { sessionId: archivedId, stopActivity: true })).ok, true)
      unrelated = await userSession(host, 'w-c-unrelated')
    }, HOOK)
    const rows = [
      ['an unknown session', () => WATCHES.missingSession, WATCHES.error.unknownSession],
      ["Fishball's own session", () => fb, WATCHES.error.isFishball],
      ['an archived (managed) session', () => archivedId, WATCHES.error.archived],
      // contract §4.1 "related session": a session that is the user's, never watched, messaged or forwarded.
      ['a session that is not related', () => unrelated, WATCHES.error.notRelated],
    ]
    for (const [label, sid, code] of rows) {
      it(label + ' → ' + code + ', nothing added', T, async () => {
        const before = await watchList(stub)
        const reply = await watchOp(stub, sid())
        assert.equal(refusalOf(reply), code, JSON.stringify(reply))
        assert.deepEqual(await watchList(stub), before)
      })
    }
  })

  describe('WCH-06/07 maxActiveWatches', () => {
    const s = []
    before(async () => { for (const f of ['w-lim1', 'w-lim2', 'w-lim3']) s.push(await managedSession(host, f)) }, HOOK)
    after(() => setLimit(host, { maxActiveWatches: LIMITS.maxActiveWatches.default }), HOOK)
    const limitReached = async (sid) => (await watchOp(stub, sid)).payload?.watchError

    it('WCH-06 limit 2: limit−1 accepted, at the limit refused, a closed watch frees a place', T, async () => {
      await closeAll(stub)
      assert.equal(await activeCount(stub), 0, 'precondition: no active watch')
      await setLimit(host, { maxActiveWatches: 2 })
      const w1 = await watchOk(stub, s[0])
      await watchOk(stub, s[1])
      assert.equal(await activeCount(stub), 2)
      assert.equal(await limitReached(s[2]), WATCHES.error.limitReached)
      assert.equal((await watchesOn(stub, s[2])).length, 0)
      assert.deepEqual((await unwatchOp(stub, w1)).payload, { ok: true })
      await watchOk(stub, s[2])
      assert.equal(await activeCount(stub), 2, 'closed watches do not count')
    })

    it('WCH-07 limit 1 (the minimum): one accepted, the next refused', T, async () => {
      await closeAll(stub)
      await setLimit(host, { maxActiveWatches: 1 })
      await watchOk(stub, s[0])
      assert.equal(await limitReached(s[1]), WATCHES.error.limitReached)
      await closeAll(stub)
    })
  })

  it('WCH-08 remove closes an active watch; a second remove and an unknown id answer unknown-watch', T, async () => {
    const sid = await userSession(host, 'w-remove')
    assert.equal((await add({ sessionId: sid })).status, 200, 'precondition: the route adds a watch')
    const w = (await activeOn(sid))[0]
    const res = await remove({ watchId: w.watchId })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    assert.equal((await watchEntry(stub, w.watchId))?.status, WSTATUS.closed)
    for (const id of [w.watchId, 'fbtest-no-such-watch']) {
      const r = await remove({ watchId: id })
      assert.equal(r.status, 409, r.text)
      assert.deepEqual(r.json, { ok: false, code: routeCode.unknownWatch })
    }
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
      assert.deepEqual(res.json, { ok: false, code: routeCode.badBody })
    })
  }

  // Removed through session.unwatch, so this case does not depend on the user route (WCH-08).
  it('WCH-10 a removed watch never fires', T, async () => {
    const sid = await managedSession(host, 'w-removed')
    const id = await watchOk(stub, sid)
    assert.deepEqual((await unwatchOp(stub, id)).payload, { ok: true })
    await answerTurn(host, sid, 'wch10')
    assert.equal((await noticesSettled(stub, id, 0)).length, 0)
    assert.equal((await watchEntry(stub, id)).status, WSTATUS.closed)
  })

  it('WCH-11 session.watches lists at most watchesShown (50) watches; the oldest closed ones are left out', T, async () => {
    const sid = await managedSession(host, 'w-many')
    const ids = []
    for (let i = 0; i < WATCHES.shown + 2; i++) {
      const id = await watchOk(stub, sid)
      assert.ok(!ids.includes(id), 'a closed watch is never returned again')
      ids.push(id)
      await unwatchOp(stub, id)
    }
    const list = await watchList(stub)
    assert.equal(list.length, WATCHES.shown)
    const listed = new Set(list.map((w) => w.watchId))
    assert.ok(listed.has(ids.at(-1)), 'the newest is listed')
    assert.equal(listed.has(ids[0]) || listed.has(ids[1]), false, 'the two oldest of this batch are left out')
  })

  it('WCH-12 both routes refuse a request without the browser cookie', T, async () => {
    const before = await watchList(stub)
    for (const [url, body] of [[route.add, { sessionId: target }], [route.remove, { watchId: 'x' }]]) {
      const res = await fetch(host.origin + url, { method: 'POST', headers: { origin: host.origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      await res.text()
      assert.notEqual(res.status, 200, url)
    }
    assert.deepEqual(await watchList(stub), before)
  })

  it('WCH-17 closed watches are kept up to auditEntriesKept; active watches are listed first', T, async () => {
    const s = await managedSession(host, 'w-keep')
    const keeper = await managedSession(host, 'w-keep-active')
    await closeAll(stub)
    // The active watch is the OLDEST, so newest-first alone would put it below the closed ones.
    const active = await watchOk(stub, keeper)
    await setLimit(host, { auditEntriesKept: 3 })
    try {
      const closedIds = []
      for (let i = 0; i < 5; i++) { const id = await watchOk(stub, s); await unwatchOp(stub, id); closedIds.push(id) }
      const list = await watchList(stub)
      const closed = list.filter((w) => w.status !== WSTATUS.active)
      assert.ok(closed.length <= 3, 'at most 3 closed kept: ' + closed.length)
      assert.ok(closed.some((w) => w.watchId === closedIds.at(-1)), 'the newest closed one is kept')
      assert.equal(closed.some((w) => w.watchId === closedIds[0]), false, 'the oldest closed one is gone')
      assert.equal(list[0].watchId, active, 'the active watch is listed first')
      const firstClosed = list.findIndex((w) => w.status !== WSTATUS.active)
      assert.ok(list.slice(firstClosed).every((w) => w.status !== WSTATUS.active), 'every active watch comes before the closed ones')
    } finally { await setLimit(host, { auditEntriesKept: LIMITS.auditEntriesKept.default }) }
  })

  it('WCH-18 (observed) archiving a watched session leaves its watch active', T, async (t) => {
    const s = await managedSession(host, 'w-arch-later')
    const id = await watchOk(stub, s)
    assert.equal((await host.call('archive', { sessionId: s, stopActivity: true })).ok, true)
    await new Promise((resolve) => setTimeout(resolve, WATCHES.longQuietMs))
    const now = await watchEntry(stub, id)
    t.diagnostic('watch after archiving its target: ' + now?.status)
    assert.equal(now?.status, WSTATUS.active)
    await unwatchOp(stub, id)
  })

  it('WCH-15 with no instance attached POST watches still answers 200 (queue, never refuse)', T, async () => {
    const s = await userSession(host, 'w-noinstance')
    await stub.detach()
    const res = await add({ sessionId: s })
    assert.notEqual(res.status, 409, 'answered ' + res.status + ' ' + res.text)
    assert.equal(res.status, 200, res.text)
    await attachReady(stub)
    assert.equal((await activeOn(s)).length, 1, 'the watch is there after the next attach')
  })
})

describe('P6 watch route while the core failed (H-STUB)', () => {
  let host
  let home
  before(async () => {
    home = stubHome('watch-failed')
    fs.mkdirSync(path.dirname(STORE.file(home)), { recursive: true })
    // A store the connector cannot read: it must fail closed (DESIGN §9, §11).
    fs.writeFileSync(STORE.file(home), '{"unit": {"name": "fishball", "version": 1}, "global": ')
    host = await bootHost(home, { env: stubEnv() })
  }, HOOK)
  after(() => stopStub({ host, home }), HOOK)

  it('WCH-16 POST watches answers 409 unavailable', T, async () => {
    const st = await host.waitStatus(STATUS.failed)
    assert.equal(st?.status, STATUS.failed, 'precondition: ' + JSON.stringify(st))
    const s = (await host.call('ordinary', { folder: 'f' })).sessionId
    const res = await host.post(route.add, { sessionId: s })
    assert.equal(res.status, 409, res.text)
    assert.deepEqual(res.json, { ok: false, code: routeCode.unavailable })
  })
})
