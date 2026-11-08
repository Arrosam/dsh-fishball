/**
 * Managed status across agent re-creation, no instance, a restart and the connector's bundle switch (DESIGN §5b, §5e
 * "Tools per session", "Durable", §9 managed registry, §11 "Restart"; contract §9; connector.md C1-EP-04), on the H-STUB
 * harness. Host boots with FBTEST_APPROVER_AFTER=1 (the scripted answerer stands in for the stock prompt after the
 * connector's broker). One home; the cases run in order; the restart and the bundle switch come last.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | DUR-01  | ST (managed –agent disposed→ –resume→ new agent) | §5e "New agents" | a new agent is created; its next request has the three managed tools again; the entry is unchanged |
 * | DUR-05  | ST (no instance –Hand over→ managed –attach→) | contract §9, C1-EP-04 | Hand over answers 200 with no instance (never unavailable); the entry is listed; the note is queued and delivered once as `user` after the attach; entries otherwise unchanged |
 * | DUR-06  | ST (restart) | §5e "Durable", §11 | the snapshot lists the same entries (same since, by and title); resumed managed sessions (hand-over, start) have the tools and their requests reach the instance; a taken-back session and a session that is yours have none and reach the stock prompt |
 * | DUR-07  | ST (the connector's bundle off → on) | §5e "Ownership" | while off, a managed session's next request lacks the tools; back on (instance attached again), the session is still managed and has them again; a session that is yours still has none |
 *
 * Retired:
 * - DUR-02, DUR-03 (Session messages off / on), DUR-04 (Permission requests off): the four feature switches are gone; Hand over, watches and permission requests are always on (slim-native-design §12).
 * - DUR-05 (409 unavailable while Fishball is not live): replaced by contract §9: with no instance Hand over and Take back work; there is no in-process Fishball to archive (slim §12).
 * - DUR-06 (message_session, by message): session.message serves managed sessions only (contract §4.1) and refuses one that is yours with not-managed, so messaging is no longer a way in; the restart case uses session.start instead.
 */
import assert from 'node:assert/strict'
import { after, before, it, describe } from 'node:test'
import { MANAGED_BY, MANAGED_TOOLS, PACKAGE_NAME, TITLE } from './support/constants.mjs'
import { HOOK, T, settledIdle, turn } from './support/expect.mjs'
import { KIND, STUB, handOver, quietPushes, stopStub, takeBack, userSession } from './support/instance-stub.mjs'
import {
  MANAGED_STUB, bootManaged, restartManaged, detachStub, entryOf, expectStock, expectToInstance, folderIn, hasTool, itemsAbout, managedNow, nextRequest, reattach, startSession,
} from './support/instance-stub-managed.mjs'
import { until } from './support/util.mjs'

let seq = 0
const tok = (label) => 'DUR' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const hasAll = (req) => MANAGED_TOOLS.every((n) => hasTool(req, n))
const hasAny = (req) => MANAGED_TOOLS.some((n) => hasTool(req, n))
const sortById = (list) => [...list].sort((a, b) => a.sessionId.localeCompare(b.sessionId))
/** DSH's plugin manager reloads the profile when a bundle is switched; that takes a while. */
const BUNDLE_MS = 90000
/** How long a switched bundle may take to show in a session's next request. */
const SWITCH_MS = 15000
const SWITCH_POLL_MS = 500

describe('managed status is durable (H-STUB)', () => {
  let booted
  let host

  before(async () => {
    booted = await bootManaged('managed-durable')
    host = booted.host
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  async function hand(sid) {
    const r = await handOver(host, sid)
    assert.equal(r.status, 200, r.text)
  }

  it('DUR-01 a managed session whose agent is re-created by resume has the tools again', T, async () => {
    const { sessionId: sid } = await host.call('createKept', { folder: 'dur01' })
    await turn(host, sid, [[{ text: 'hello' }]], 'first words')
    await hand(sid)
    const entry = await entryOf(host, sid)
    assert.ok(hasAll(await nextRequest(host, sid)), 'precondition: the managed agent has the tools')
    const created = (await host.call('lifecycle')).filter((e) => e.type === 'created' && e.id === sid).length
    const d = await host.call('disposeKept', { sessionId: sid })
    assert.equal(d.disposed, true)
    assert.equal(d.live, false, 'the agent is gone')
    const r = await host.call('resume', { sessionId: sid })
    assert.equal(r.live, true, JSON.stringify(r))
    assert.equal((await host.call('lifecycle')).filter((e) => e.type === 'created' && e.id === sid).length, created + 1, 'a new agent was created')
    assert.ok(hasAll(await nextRequest(host, sid)), 'the new agent has ' + MANAGED_TOOLS)
    assert.deepEqual(await entryOf(host, sid), entry)
  })

  it('DUR-05 with no instance attached Hand over works and its note waits for the next attach', T, async () => {
    const sid = await userSession(host, 'dur05')
    await quietPushes(booted.stub)
    const before = await managedNow(host)
    await detachStub(booted)
    let r
    try {
      r = await handOver(host, sid)
      assert.equal(r.status, 200, 'never unavailable with no instance: ' + r.text)
      assert.equal(r.json?.ok, true)
      assert.equal((await entryOf(host, sid))?.by, MANAGED_BY.handOver)
      assert.deepEqual(sortById((await managedNow(host)).filter((e) => e.sessionId !== sid)), sortById(before), 'the other entries unchanged')
    } finally {
      await reattach(booted)
    }
    assert.ok(await until(async () => (await itemsAbout(booted.stub, sid)).length > 0, STUB.waitMs, 100), 'the queued note arrives after the attach')
    await quietPushes(booted.stub)
    const items = await itemsAbout(booted.stub, sid)
    assert.deepEqual(items.map((i) => i.kind), [KIND.user], 'delivered once, as the user\'s')
  })

  /** The sessions the restart case and the bundle case read back. */
  const s = {}

  it('DUR-06 managed status survives a restart', MANAGED_STUB.long, async () => {
    s.handed = await userSession(host, 'dur06-handed')
    await hand(s.handed)
    const marker = tok('06')
    await host.call('queueMarker', { marker, except: null, script: [[{ text: 'started' }]] })
    const { reply } = await startSession(booted, { folder: folderIn(booted.home, 'dur06-started'), title: TITLE.plain, message: marker })
    assert.equal(reply.payload?.managed, true, JSON.stringify(reply))
    s.started = reply.payload.sessionId
    await until(async () => (await host.call('markerState', { marker })).left === 0, STUB.waitMs, 100)
    await settledIdle(host, s.started)
    s.taken = await userSession(host, 'dur06-taken')
    await hand(s.taken)
    assert.equal((await takeBack(host, s.taken)).status, 200)
    s.mine = await userSession(host, 'dur06-mine')
    const entries = await managedNow(host)
    const byId = Object.fromEntries(entries.map((e) => [e.sessionId, e]))
    assert.equal(byId[s.handed]?.by, MANAGED_BY.handOver)
    assert.equal(byId[s.started]?.by, MANAGED_BY.start)
    assert.equal(byId[s.taken], undefined)
    const all = [s.handed, s.started, s.taken, s.mine]
    for (const sid of all) await host.call('flush', { sessionId: sid })

    booted = await restartManaged(booted)
    host = booted.host

    // The titles are read fresh for each snapshot (§10e), so they may take a moment after the boot.
    let now
    await until(async () => { now = sortById(await managedNow(host)); return JSON.stringify(now) === JSON.stringify(sortById(entries)) }, MANAGED_STUB.publishMs, 200)
    assert.deepEqual(now, sortById(entries), 'the same entries, same since, by and title')
    for (const sid of all) {
      const r = await host.call('resume', { sessionId: sid })
      assert.equal(r.live, true, sid + ': ' + JSON.stringify(r))
    }
    for (const sid of [s.handed, s.started]) assert.ok(hasAll(await nextRequest(host, sid)), sid + ' lacks the tools after the restart')
    for (const sid of [s.taken, s.mine]) assert.equal(hasAny(await nextRequest(host, sid)), false, sid + ' has a managed tool after the restart')
    await expectToInstance(booted, s.handed)
    await expectToInstance(booted, s.started)
    await expectStock(booted, s.taken)
    await expectStock(booted, s.mine)
  })

  it('DUR-07 turning the connector\'s bundle off removes the tools everywhere; back on, they return', MANAGED_STUB.long, async () => {
    assert.ok(await entryOf(host, s.handed), 'precondition: managed (DUR-06)')
    const off = await host.call('setBundleEnabled', { name: PACKAGE_NAME, enabled: false }, BUNDLE_MS)
    assert.equal(off.error, null, JSON.stringify(off))
    assert.ok(await until(async () => !hasAny(await nextRequest(host, s.handed)), SWITCH_MS, SWITCH_POLL_MS), 'the tools are gone from the managed session')
    assert.equal(hasAny(await nextRequest(host, s.started)), false)
    const on = await host.call('setBundleEnabled', { name: PACKAGE_NAME, enabled: true }, BUNDLE_MS)
    assert.equal(on.error, null, JSON.stringify(on))
    assert.ok(await until(async () => (await booted.stub.service()).present, SWITCH_MS, SWITCH_POLL_MS), 'the connector service is back')
    await reattach(booted)
    assert.ok((await managedNow(host)).some((e) => e.sessionId === s.handed), 'still managed')
    assert.ok(await until(async () => hasAll(await nextRequest(host, s.handed)), SWITCH_MS, SWITCH_POLL_MS), 'the tools are back in the managed session')
    assert.equal(hasAny(await nextRequest(host, s.mine)), false, 'and still not in yours')
  })
})
