/**
 * session.start makes the new session managed, and still starts a session it could not make managed (DESIGN §5b
 * "Managed", §5e; contract §4.1 `session.start` → `{sessionId, managed, titleError?, workspaceError?, watchId? or
 * watchError?}`; Q-start-half-made), on the H-STUB harness. The instance's start_session tool is now the stub's
 * session.start request (slim §12), and its `managedError: 'manage-failed'` is the response's `managed: false`.
 *
 * session.start names the new session, makes it managed and only then delivers the first message. If making it managed
 * fails (the connector's write of the managed registry fails) and the session is not managed afterwards, the start
 * carries on: it names the session, delivers the first message once, and sets up the watch. The response says
 * `managed: false`; the session is then the user's: not listed, no managed tool, and its permission requests go to its
 * own stock prompt. If the failure comes only after the session became managed, the response says `managed: true` and
 * the session is managed. It combines with the other outcomes (titleError, workspaceError).
 *
 * Fault injection (support/worker.mjs): `failStoreTable` makes writes to one table of the connector's store (here the
 * `managed` registry) fail: 'reject' before anything is stored, 'after' once it is stored. The start probe stamps the
 * rename, the first steer and the flushes, and can make one of them fail; `failAttach` makes a workspace refuse the
 * session. The first message makes the new session call the asking tool at once, so where its request goes shows
 * whether it is yours (its own stock prompt, the scripted answerer after the broker) or managed (approval.request).
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | MST-01  | EP (control: the store works) | contract §4.1, §5e | response exactly {sessionId, managed:true}; listed by 'start'; every request has the three managed tools; its permission request goes to the instance |
 * | MST-02  | EP (the write fails before storing) | Q-start-half-made | {sessionId, managed:false}; the write was tried after the rename and before the first message; renamed once, first message delivered once as a relay from the instance's session, the session ran its first turn; not listed or stored; no managed tool in any request; its permission request goes to the stock prompt and is not offered |
 * | MST-03  | EP (the write is stored, then the call fails) | Q-start-half-made | managed:true; listed by 'start'; its permission request goes to the instance |
 * | MST-04 ×2 | DT (notifyWhenFinished × write fails) | contract §4.1 | watchId and one watch item after the first turn, or neither without the flag; managed:false either way |
 * | MST-05 ×3 | DT (write fails × rename ok / invalid / fails) | contract §4.1 titleError | managed:false next to no titleError / title-invalid / title-failed; delivered once; yours |
 * | MST-06 ×2 | DT (flush rejects / answers false × write fails) | §5b "never twice" | a response with managed:false; steered once, so never delivered twice; yours |
 * | MST-07 ×2 | DT (steer throws × write fails / stored then fails) | §5e "managed before the message is delivered" | the session is yours (first) or managed (second); the reply is recorded |
 * | MST-08  | EP (control: steer throws, store works) | §5e | the session is managed (the managed step comes before the delivery) |
 * | MST-09 ×2 | DT (workspace attach fails × write fails / works) | contract §4.1 workspaceError | workspaceError with managed:false (yours, in no workspace) / workspaceError with managed:true (managed) |
 * | MST-10  | ST (a session that is yours after a failed write → Hand over) | §5e | 200, managed by 'hand-over', and its next request has the tools |
 *
 * Retired:
 * - MST-06/07/08 (ok/unconfirmed/delivery-failed answer fields and outbox status): contract §4.1 gives session.start no delivered/unconfirmed/delivery-failed answer; those outcomes were start_session tool results of the removed in-process session (slim §12). The managed half of each case is kept.
 * - MST-20..22: sessionsPerHour is removed from the connector (slim conn-OQ-20).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { HALF_MADE, MANAGED_BY, MANAGED_TOOLS, RELAY, TITLE } from './support/constants.mjs'
import { HOOK, T, settledIdle } from './support/expect.mjs'
import { KIND, handOver, stopStub } from './support/instance-stub.mjs'
import {
  MANAGED_STUB, bootManaged, entryOf, expectStock, expectToInstance, folderIn, hasTool, intakeIds, itemsAbout, nextRequest, startAsking,
} from './support/instance-stub-managed.mjs'
import { sleep, until } from './support/util.mjs'

let seq = 0
const tok = (label) => 'MST' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const STORE = Object.freeze({ reject: 'reject', after: 'after' })
const START_KEYS = ['managed', 'sessionId']
const RUN_MS = 10000

describe('session.start makes the session managed, and carries on when it cannot (H-STUB)', () => {
  let booted
  let host

  before(async () => {
    booted = await bootManaged('managed-start')
    host = booted.host
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  /** A start whose first message is a fresh marker that makes the new session ask for permission at once. */
  async function start(opts = {}) {
    const marker = tok('m')
    const ids = await intakeIds(host)
    const answer = await startAsking(booted, marker, { title: TITLE.plain, ...opts })
    assert.equal(answer.reply.type, 'response', JSON.stringify(answer.reply))
    return { ...answer, marker, ids, payload: answer.reply.payload, sid: answer.reply.payload.sessionId }
  }
  const eventsOf = (events, sid, type) => events.filter((e) => e.sessionId === sid && e.type === type)

  /** The first message reached the new session once, as a relay from the instance's session, text unchanged. */
  async function assertDelivered(answer) {
    const copies = async () => ((await host.call('userMessages', { sessionId: answer.sid })) ?? []).filter((m) => m.text.includes(answer.marker))
    // The response may come before the new agent's log shows the steered message; wait for it, then for any second copy.
    await until(async () => (await copies()).length > 0, RUN_MS, 50)
    await sleep(MANAGED_STUB.quietMs)
    const got = await copies()
    assert.equal(got.length, 1, 'exactly one copy of the first message')
    assert.deepEqual(got[0].source, { ...RELAY, senderSessionId: booted.fb })
    assert.equal(got[0].text, answer.marker, 'the text is unchanged')
  }
  /** The registry write was tried for this session, after the rename and before the first steer; renamed once. */
  function assertOrder(answer) {
    const [rename] = eventsOf(answer.events, answer.sid, 'rename')
    const [steer] = eventsOf(answer.events, answer.sid, 'steer')
    assert.equal(eventsOf(answer.events, answer.sid, 'rename').length, 1, 'renamed once')
    const write = answer.writes.find((x) => x.key === answer.sid)
    assert.ok(write, 'the registry tried to record this session')
    assert.ok(rename.at <= write.at && write.at <= steer.at, 'rename → managed → first message: ' + [rename.at, write.at, steer.at])
  }

  /** The session is the user's: not listed, not stored, no managed tool, and its request went to its own stock prompt. */
  async function expectYours(answer, { ran = true, allowKinds } = {}) {
    assert.equal(await entryOf(host, answer.sid), undefined, 'not in the managed list')
    assert.equal(await host.call('storeRecord', { table: 'managed', key: answer.sid }), null, 'not in the registry')
    for (const [i, r] of (await host.call('requests', { sessionId: answer.sid })).entries()) {
      for (const n of MANAGED_TOOLS) assert.equal(hasTool(r, n), false, 'request ' + i + ' has ' + n)
    }
    if (ran) await expectStock(booted, answer.sid, { asked: answer.marker, intakeBefore: answer.ids, allowKinds })
  }
  /** The session is managed (listed by 'start'): its permission request goes to the instance, not to the stock prompt. */
  async function expectManaged(answer, { ran = true } = {}) {
    assert.equal((await entryOf(host, answer.sid))?.by, MANAGED_BY.start, 'in the managed list by start')
    if (ran) await expectToInstance(booted, answer.sid, { asked: answer.marker })
  }
  const ranFirstTurn = (answer) => until(async () => (await host.call('markerState', { marker: answer.marker })).left === 0, RUN_MS, 100)

  it('MST-01 control: managed:true, listed by start, every request has the tools, its requests go to the instance', T, async () => {
    const answer = await start({ probe: {} })
    assert.deepEqual(Object.keys(answer.payload).sort(), START_KEYS)
    assert.equal(answer.payload.managed, true)
    await assertDelivered(answer)
    await expectManaged(answer)
    const reqs = await host.call('requests', { sessionId: answer.sid })
    assert.ok(reqs.length > 0)
    for (const r of reqs) for (const n of MANAGED_TOOLS) assert.ok(hasTool(r, n), n + ' in every request')
  })

  it('MST-02 the write fails before storing: the session starts as the user\'s and the answer says managed:false', T, async () => {
    const answer = await start({ store: STORE.reject, probe: {} })
    assert.deepEqual(answer.payload, { sessionId: answer.sid, managed: false })
    assertOrder(answer)
    await assertDelivered(answer)
    assert.ok(await ranFirstTurn(answer), 'the new session ran its first turn')
    await expectYours(answer)
    assert.equal(await host.call('sessionTitle', { sessionId: answer.sid }), TITLE.plain, 'DSH reports the title')
  })

  it('MST-03 the write is stored and then the call fails: managed:true', T, async () => {
    const answer = await start({ store: STORE.after, probe: {} })
    assert.deepEqual(answer.payload, { sessionId: answer.sid, managed: true })
    assert.ok(answer.writes.some((x) => x.key === answer.sid), 'precondition: the registry wrote this session')
    await assertDelivered(answer)
    await expectManaged(answer)
  })

  describe('MST-04 the watch from notifyWhenFinished', () => {
    for (const notify of [true, false]) {
      it(notify ? 'flag: a watch on the new session and one watch item after its first turn' : 'no flag: no watch', T, async () => {
        const answer = await start({ store: STORE.reject, extra: notify ? { notifyWhenFinished: true } : {} })
        assert.equal(answer.payload.managed, false, JSON.stringify(answer.payload))
        assert.equal('watchError' in answer.payload, false, JSON.stringify(answer.payload))
        await expectYours(answer, { allowKinds: [KIND.watch] })
        const watchItems = () => itemsAbout(booted.stub, answer.sid, KIND.watch)
        if (notify) {
          assert.equal(typeof answer.payload.watchId, 'string', JSON.stringify(answer.payload))
          assert.ok(await until(async () => (await watchItems()).length > 0, RUN_MS, 100), 'a watch item after the first turn')
          assert.equal((await watchItems()).length, 1, 'one watch item')
        } else {
          assert.equal('watchId' in answer.payload, false)
          assert.deepEqual(await watchItems(), [])
        }
      })
    }
  })

  describe('MST-05 naming still happens when the write fails', () => {
    const rows = [['named', null, null], ['title-invalid', 'invalid', TITLE.invalid], ['title-failed', 'fail', TITLE.failed]]
    for (const [label, rename, titleError] of rows) {
      it(label, T, async () => {
        const answer = await start({ store: STORE.reject, probe: { rename } })
        assert.deepEqual(answer.payload, { sessionId: answer.sid, managed: false, ...(titleError ? { titleError } : {}) })
        assertOrder(answer)
        await assertDelivered(answer)
        await expectYours(answer)
      })
    }
  })

  describe('MST-06 a flush that cannot be confirmed never delivers twice', () => {
    for (const [id, flush] of [['MST-06', 'throw'], ['MST-06b', 'false']]) {
      it(id + ' the flush ' + (flush === 'throw' ? 'rejects' : 'answers false'), T, async (t) => {
        const answer = await start({ store: STORE.reject, probe: { flush } })
        t.diagnostic('reply: ' + JSON.stringify(answer.payload))
        assert.equal(answer.payload.managed, false)
        assert.equal(eventsOf(answer.events, answer.sid, 'steer').length, 1, 'steered once, so never delivered twice')
        await assertDelivered(answer)
        await expectYours(answer)
      })
    }
  })

  describe('MST-07 a failed delivery: the managed step came first', () => {
    for (const [label, store, managed] of [['the write fails: the session is yours', STORE.reject, false], ['the write is stored, then fails: managed', STORE.after, true]]) {
      it(label, T, async (t) => {
        const marker = tok('07')
        const { reply } = await startAsking(booted, marker, { title: TITLE.plain, store, probe: { steer: true } })
        t.diagnostic('reply: ' + JSON.stringify(reply))
        const sid = reply.payload?.sessionId
        assert.ok(sid, 'the session was created: ' + JSON.stringify(reply))
        const answer = { sid, marker }
        if (managed) await expectManaged(answer, { ran: false })
        else await expectYours(answer, { ran: false })
      })
    }
  })

  it('MST-08 control: a failed delivery with a working registry leaves the session managed', T, async (t) => {
    const marker = tok('08')
    const { reply } = await startAsking(booted, marker, { title: TITLE.plain, probe: { steer: true } })
    t.diagnostic('reply: ' + JSON.stringify(reply))
    assert.ok(reply.payload?.sessionId, JSON.stringify(reply))
    await expectManaged({ sid: reply.payload.sessionId, marker }, { ran: false })
  })

  describe('MST-09 together with a workspace that did not take the session', () => {
    const ws = { id: null }
    const failing = (on) => host.call('failAttach', { workspaceId: ws.id, on })
    /** A start into the workspace while it refuses the session. */
    async function startInWorkspace(store) {
      await failing(true)
      try { return await start({ folder: ws.id, store }) } finally { await failing(false) }
    }
    it('the write fails too: workspaceError and managed:false; the session is yours and in no workspace', T, async () => {
      Object.assign(ws, await host.call('createWorkspace', { dir: folderIn(booted.home, 'mst-ws') }))
      const answer = await startInWorkspace(STORE.reject)
      assert.deepEqual(answer.payload, { sessionId: answer.sid, managed: false, workspaceError: HALF_MADE.workspaceError })
      assert.equal((await host.call('workspaces')).list.some((x) => x.sessionIds.includes(answer.sid)), false, 'in no workspace')
      await assertDelivered(answer)
      await expectYours(answer)
    })
    it('only the workspace fails: workspaceError and managed:true', T, async () => {
      const answer = await startInWorkspace(null)
      assert.deepEqual(answer.payload, { sessionId: answer.sid, managed: true, workspaceError: HALF_MADE.workspaceError })
      await expectManaged(answer)
    })
  })

  it('MST-10 a session that is the user\'s after a failed write can be handed over later', T, async () => {
    const answer = await start({ store: STORE.reject })
    await expectYours(answer)
    const r = await handOver(host, answer.sid)
    assert.equal(r.status, 200, r.text)
    assert.equal((await entryOf(host, answer.sid))?.by, MANAGED_BY.handOver)
    await settledIdle(host, answer.sid)
    const req = await nextRequest(host, answer.sid)
    for (const n of MANAGED_TOOLS) assert.ok(hasTool(req, n), n + ' after the hand over')
  })
})
