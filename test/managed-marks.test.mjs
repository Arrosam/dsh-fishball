/**
 * Managed-session marks (DESIGN §10e "Managed-session marks"; slim-native-design §8.2, §8.3; contract §9 "managed-row
 * marks are shown from the connector's own state"; connector.md C1-P-04, C3-P-10), on the H-STUB harness. The banner and
 * the sidebar mark are drawn in the browser, so these cases check what the client reads to decide them: the snapshot's
 * `managed` list and the events feed (/api/fishball/state, /api/fishball/events), the route the banner's button posts,
 * and, where the requirement is about the client's own words, the served client bundle. The drawing itself is a browser
 * check. Expected values come from the requirements, never the implementation.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | MKS-01 ×3 | EP (way in: Hand over / Hand over with a note / session.start) | §10e, slim §8.3, contract §4.1 | the session is in `managed` with its way's tag (by hand-over / hand-over / start), and a feed frame carries it |
 * | MKS-02  | EP (a session that is yours, the instance's own session) | §10e "never in a session that is yours or in Fishball's own" | neither is in `managed` after the others became managed |
 * | MKS-03  | ST (managed –Take back via the banner's route→ yours) | §10e | 200 ok; the id leaves the snapshot and the feed; the others stay |
 * | MKS-04  | ST (managed –session.release→ yours) | contract §4.1 | the id leaves the snapshot and the feed |
 * | MKS-05 ×3 | DT (Take back refused: the instance's own id / unknown id / bad body) | §10e | 409 is-fishball / 409 unknown-session / 400 bad-body, nothing changes (the banner shows the refusal dialog from these) |
 * | MKS-06  | ST (no instance: Hand over → idle → Take back) | contract §9, C1-P-04 | with no instance attached both answer 200 with no error about a missing instance; the feed shows the mark's entry, then not; the snapshot says no instance is attached |
 * | MKS-07  | DT (instance attached × not attached) | C3-P-10 | the same Hand over and Take back give the same managed list in both instance states |
 * | MKS-09  | EP (served client bundle) | §10e, slim §8.3 | carries "Managed by Fishball", "Hand over to Fishball" and "Take back from Fishball" |
 * | MKS-10  | ST (restart) | §5e "Durable" | managed entries persist, so the marks come back after a reload |
 *
 * Retired:
 * - MKS-01 (message_session, by message): session.message serves managed sessions only (contract §4.1) and refuses one that is yours with not-managed, so messaging is no longer a way in.
 * - MKS-06 (Session messages on/off): the four feature switches are gone; Hand over, watches and permission requests are always on (slim-native-design §12).
 * - MKS-07 (Fishball live while entries exist): the marks are shown from the connector's own state with or without an instance (contract §9); MKS-06/07 cover both instance states instead.
 * - MKS-08 (preferences.brandStyle): the brand-style preference is gone: the icon is fixed (slim conn-OQ-21, conn-OQ-22).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { MANAGED_BY, MANAGED_CODE, P5_CODE, TITLE } from './support/constants.mjs'
import { HOOK, T, fishballClientBundle, settledIdle } from './support/expect.mjs'
import { handOver, stopStub, takeBack, userSession } from './support/instance-stub.mjs'
import {
  MANAGED_STUB, bootManaged, restartManaged, detachStub, entryOf, folderIn, frameAfter, frameEntry, handOverWithNote, managedNow, postManaged, reattach, release, startSession,
} from './support/instance-stub-managed.mjs'

let seq = 0
const tok = (label) => 'MKS' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
/** A missing-instance error would name the instance; the user's own action must not (C1-P-04). */
const NO_INSTANCE_WORDS = /instance|unattached|unavailable/i

describe('managed-session marks: what the client reads (H-STUB)', () => {
  let booted
  let host
  const s = {}
  const ids = async () => (await managedNow(host)).map((e) => e.sessionId)

  /** Runs change() and requires a later feed frame to show sid with the tag `by` (a mark appears). */
  async function markAppears(sid, change, by) {
    const f = await frameAfter(host, change, (fr) => frameEntry(fr, sid)?.by === by)
    assert.ok(f, 'a feed frame carries ' + sid + ' by ' + by)
    assert.equal((await entryOf(host, sid))?.by, by)
  }
  /** Runs change() and requires a later feed frame without sid (the mark leaves). */
  async function markLeaves(sid, change) {
    const f = await frameAfter(host, change, (fr) => !frameEntry(fr, sid))
    assert.ok(f, 'a feed frame without ' + sid)
    assert.equal(await entryOf(host, sid), undefined)
  }
  const ok200 = (r) => assert.equal(r.status, 200, r.text)

  before(async () => {
    booted = await bootManaged('managed-marks')
    host = booted.host
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  it('MKS-01a Hand over: listed by hand-over', T, async () => {
    s.hand = await userSession(host, 'mks01a')
    await markAppears(s.hand, async () => ok200(await handOver(host, s.hand)), MANAGED_BY.handOver)
  })
  it('MKS-01b Hand over with a note: listed by hand-over', T, async () => {
    s.note = await userSession(host, 'mks01b')
    await markAppears(s.note, async () => ok200(await handOverWithNote(host, s.note, tok('note'))), MANAGED_BY.handOver)
  })
  it('MKS-01c session.start: listed by start', T, async () => {
    let reply
    const f = await frameAfter(host, async () => {
      ;({ reply } = await startSession(booted, { folder: folderIn(booted.home, 'mks01c'), title: TITLE.plain, message: tok('c') }))
    }, (fr) => reply && frameEntry(fr, reply.payload?.sessionId)?.by === MANAGED_BY.start)
    assert.equal(reply.payload?.managed, true, JSON.stringify(reply))
    s.start = reply.payload.sessionId
    assert.ok(f, 'a feed frame carries the started session by start')
    await settledIdle(host, s.start)
  })

  it('MKS-02 a session that is yours and the instance\'s own are never listed', T, async () => {
    s.mine = await userSession(host, 'mks02')
    const listed = await ids()
    assert.equal(listed.includes(s.mine), false, 'yours')
    assert.equal(listed.includes(booted.fb), false, 'the instance\'s own')
    assert.deepEqual([...listed].sort(), [s.hand, s.note, s.start].sort())
  })

  it('MKS-03 Take back through the banner\'s route: the id leaves the snapshot and the feed', T, async () => {
    await markLeaves(s.hand, async () => {
      const r = await takeBack(host, s.hand)
      ok200(r)
      assert.equal(r.json?.ok, true, r.text)
    })
    assert.deepEqual((await ids()).sort(), [s.note, s.start].sort(), 'the others stay')
  })

  it('MKS-04 session.release: the id leaves the snapshot and the feed', T, async () => {
    await markLeaves(s.start, async () => {
      const r = await release(booted.stub, s.start)
      assert.deepEqual(r.payload, { sessionId: s.start, managed: false }, JSON.stringify(r))
    })
  })

  describe('MKS-05 the banner\'s refusals', () => {
    const rows = [
      ['the instance\'s own session: 409 is-fishball', () => ({ sessionId: booted.fb, managed: false }), 409, MANAGED_CODE.isFishball],
      ['an unknown session: 409 unknown-session', () => ({ sessionId: MANAGED_STUB.unknownSession, managed: false }), 409, MANAGED_CODE.unknownSession],
      ['a body without managed: 400 bad-body', () => ({ sessionId: s.note }), 400, P5_CODE.badBody],
    ]
    for (const [label, body, status, code] of rows) {
      it(label, T, async () => {
        const before = await managedNow(host)
        const r = await postManaged(host, body())
        assert.equal(r.status, status, r.text)
        assert.equal(r.json?.code, code)
        assert.deepEqual(await managedNow(host), before)
      })
    }
  })

  /** Hand over, let it go idle, Take back: the entries the feed shows after each step (C1-P-04 / C3-P-10). */
  async function handOverAndBack(sid) {
    const steps = {}
    await markAppears(sid, async () => {
      const r = await handOver(host, sid)
      ok200(r)
      assert.equal(NO_INSTANCE_WORDS.test(JSON.stringify(r.json?.code ?? '')), false, 'no error about the instance: ' + r.text.slice(0, 200))
    }, MANAGED_BY.handOver)
    await settledIdle(host, sid)
    steps.managed = (await ids()).includes(sid)
    await markLeaves(sid, async () => ok200(await takeBack(host, sid)))
    steps.yours = !(await ids()).includes(sid)
    return steps
  }

  let unattached
  it('MKS-06 with no instance attached Hand over and Take back work and the feed shows the mark from the connector\'s own state', T, async () => {
    await detachStub(booted)
    try {
      assert.equal((await host.state()).instance.attached, false, 'precondition: no instance')
      unattached = await handOverAndBack(await userSession(host, 'mks06'))
      assert.deepEqual(unattached, { managed: true, yours: true })
    } finally {
      await reattach(booted)
    }
  })

  it('MKS-07 the instance state does not change the marks: attached gives what unattached gave', T, async () => {
    assert.ok(unattached, 'precondition: MKS-06')
    assert.equal((await host.state()).instance.attached, true, 'precondition: attached')
    assert.deepEqual(await handOverAndBack(await userSession(host, 'mks07')), unattached)
  })

  it('MKS-09 the client bundle carries the banner\'s and the header\'s words', T, async () => {
    const bundle = await fishballClientBundle(host)
    assert.ok(bundle.found && bundle.status === 200, 'index references fishball-connector/client.js')
    for (const word of [MANAGED_STUB.labels.banner, MANAGED_STUB.labels.handOver, MANAGED_STUB.labels.takeBack]) assert.ok(bundle.text.includes(word), word)
  })

  it('MKS-10 managed entries survive a restart', MANAGED_STUB.long, async () => {
    const before = (await ids()).sort()
    assert.ok(before.length > 0)
    for (const sid of before) await host.call('flush', { sessionId: sid })
    booted = await restartManaged(booted)
    host = booted.host
    assert.deepEqual((await ids()).sort(), before)
  })
})
