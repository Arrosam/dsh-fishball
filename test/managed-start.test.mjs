/**
 * Revision 11, R3: start_session makes the new session managed, and still starts a session it could not make managed
 * (DESIGN 5d "Not made managed", 5e, Q-start-half-made; the manager's requirement of 2026-11-02).
 *
 * start_session makes the new session managed (5e) after naming it and before it delivers the first message. If making
 * it managed throws (Fishball's store write for the managed list fails) and the session is not managed afterwards,
 * start_session carries on: it names the session, delivers the first message, records and counts it, and sets up the
 * watch. The ok result, or a delivery-failed refusal, carries `managedError: 'manage-failed'`. The session is then the
 * user's: not in the managed list, no Fishball tool, and its permission requests go to its own stock prompt. If the throw
 * comes only after the session became managed there is no managedError and the session is managed. A normal start has no
 * managedError. It combines with the other outcomes: a start can carry both workspaceError and managedError.
 *
 * Fault injection (support/worker.mjs): `failStoreTable` makes writes to one table of Fishball's own store (here the
 * `managed` registry) fail, leaving its other tables (the outbox the same start writes to) alone. Mode 'reject': the
 * write fails before anything is stored. Mode 'after': the write is stored and then the call rejects. `failAttach` and the
 * startProbe are those of the half-made and title cases. The new session's first message makes it ask for permission at
 * once (the asking fixture tool), so where its request goes shows whether it is yours (its own stock prompt, answered by
 * the scripted approver after the broker) or managed (a permission request to Fishball).
 *
 * Host A: no cap, DSH's session-title service present. Host B: sessionsPerHour 2.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | MST-01  | EP (control: the store works) | no managedError; the session is in the managed list by 'start'; every request has the three managed tools; its permission request goes to Fishball; keys are the reference for the rest |
 * | MST-02  | EP (the write fails before storing) | ok, managedError 'manage-failed', same keys plus managedError; the write was tried after the rename and before the first message; renamed once, first message delivered once as a relay from Fishball, outbox start/delivered, the session ran its first turn; not in the managed list or the store; no Fishball tool in any request; its permission request goes to the stock prompt and Fishball is not told |
 * | MST-03  | EP (the write is stored, then the call fails) | no managedError; same keys as the control; in the managed list by 'start'; its permission request goes to Fishball |
 * | MST-04 ×2 | DT (notify_when_finished × write fails) | the watch (createdBy assistant) and one notice after the first turn, or none without the flag; managedError either way |
 * | MST-05 ×3 | DT (write fails × rename ok / invalid / fails) | managedError next to title or titleError; delivered and recorded |
 * | MST-06 ×2 | DT (flush rejects / answers false × write fails) | ok, unconfirmed, managedError; steered once; outbox unconfirmed |
 * | MST-07 ×2 | DT (write fails × steer throws; write stored-then-fails × steer throws) | delivery-failed with sessionId, title, no folder, and managedError (first) or none (second); outbox failed; the session is yours (first) or managed (second) |
 * | MST-08  | EP (control: steer throws, store works) | delivery-failed without managedError; the session is managed (the managed step comes before the delivery) |
 * | MST-09 ×2 | DT (workspace attach fails × write fails / works) | workspaceError with managedError (the session is yours and in no workspace) / workspaceError alone (the session is managed) |
 * | MST-10  | ST (a session that is yours after a failed write → Hand over) | 200, managed by 'hand-over', and its next request has the tools |
 * | MST-20..22 | ST (sessionsPerHour 2) | a start whose managed write fails succeeds (1 of 2); one whose delivery also fails is refused with managedError (2 of 2); the next start is refused hourly-cap, creating nothing: both were counted |
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { APPROVER_AFTER_ENV, ASK_REASON, ASK_TOOL, HALF_MADE, MANAGED_BY, MANAGED_TOOLS, OUTCOME, P5_CODE, TITLE, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { T, askSettled, callScript, makeManaged, managedEntry, noticesSettled, outboxNow, requestMessages, settledIdle, toolNames, turn, waitRequest, watchesOn } from './support/expect.mjs'
import { until } from './support/host.mjs'
import { assertDelivered, assertFailedDelivery, assertRenamedBeforeSteer, eventsOf, tok, useHost } from './support/start-session.mjs'

const MANAGE_FAILED = 'manage-failed'
const FISHBALL_TOOL = /fishball|list_user_messages/i

function toolkit(w) {
  const seenFor = async (text) => (await w.host.call('approvals', {})).filter((a) => a.reason === ASK_REASON(text))

  /**
   * start_session with the managed registry's writes failing as asked (store: null | 'reject' | 'after'), whose first
   * message (a fresh marker) makes the new session ask for permission at once. Returns the answer, the marker and the
   * writes the registry tried.
   */
  async function start({ store = null, attach = null, ...args } = {}, probe = {}) {
    const marker = tok('mst')
    await w.host.call('queueMarker', { marker, except: w.fb, script: callScript(ASK_TOOL, { text: marker }) })
    const written = (await w.host.call('storeWriteCalls')).length
    await w.host.call('failStoreTable', { table: 'managed', mode: store })
    if (attach) await attach.failing(true)
    let answer
    try { answer = await w.start({ message: marker, ...args }, probe) } finally {
      await w.host.call('failStoreTable', { mode: null })
      if (attach) await attach.failing(false)
    }
    return { ...answer, marker, writes: (await w.host.call('storeWriteCalls')).slice(written) }
  }

  /** The session is the user's: not listed, not stored, no Fishball tool, and its request went to its own stock prompt. */
  async function expectYours(sid, marker, { ran = true } = {}) {
    assert.equal(await managedEntry(w.host, sid), undefined, 'not in the managed list')
    assert.equal(await w.host.call('storeRecord', { table: 'managed', key: sid }), null, 'not in Fishball\'s store')
    for (const [i, r] of (await w.host.call('requests', { sessionId: sid })).entries()) assert.equal(toolNames(r).some((n) => FISHBALL_TOOL.test(n)), false, 'request ' + i + ' has a Fishball tool')
    if (!ran) return
    const done = await askSettled(w.host, marker, 8000)
    assert.equal(done?.outcome, OUTCOME.reject, "its own stock prompt's answer")
    const seen = await seenFor(marker)
    assert.equal(seen.length, 1, 'the stock prompt was asked once')
    assert.equal(seen[0].sessionId, sid)
    assert.deepEqual(await requestMessages(w.host, w.fb, marker), [], 'Fishball is not told')
    await settledIdle(w.host, sid)
  }

  /** The session is managed (listed by 'start'): its permission request goes to Fishball, not to the stock prompt. */
  async function expectManaged(sid, marker, { ran = true } = {}) {
    const entry = await managedEntry(w.host, sid)
    assert.ok(entry, 'in the managed list')
    assert.equal(entry.by, MANAGED_BY.start)
    if (!ran) return
    const req = await waitRequest(w.host, w.fb, marker)
    assert.ok(req, 'a permission request reached Fishball')
    assert.equal(req.block?.fields?.session_id, sid)
    assert.deepEqual(await seenFor(marker), [], 'not at the stock prompt while Fishball decides')
    await w.host.call('cancel', { sessionId: sid })
    await askSettled(w.host, marker, 8000)
    await settledIdle(w.host, sid)
    await settledIdle(w.host, w.fb)
  }
  return { start, expectYours, expectManaged, seenFor }
}

describe('start_session makes the session managed, and carries on when it cannot', { skip: NEEDS_INSTANCE_STUB }, () => {
  const w = useHost('mst-main', { env: APPROVER_AFTER_ENV, limits: { sessionsPerHour: 0 } })
  const t = toolkit(w)
  /** The control start: the registry works. Its keys are the reference for every answer below. */
  let control

  it('MST-01 control: a normal start has no managedError, the session is managed by start and its requests go to Fishball', T, async () => {
    control = await t.start()
    const { json, marker } = control
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal('managedError' in json, false)
    await assertDelivered(w, control)
    await t.expectManaged(json.sessionId, marker)
    const reqs = await w.host.call('requests', { sessionId: json.sessionId })
    assert.ok(reqs.length > 0)
    for (const r of reqs) for (const tool of MANAGED_TOOLS) assert.ok(toolNames(r).includes(tool), tool + ' in every request')
    assert.ok(control.writes.length === 0, 'precondition: no write was armed')
  })

  /** The answer is the control's plus managedError, and everything else a start does was done. */
  async function assertCarriedOn(answer, { sameKeys = true } = {}) {
    const { json, call, events, writes, marker } = answer
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal(json.managedError, MANAGE_FAILED)
    assert.equal(typeof json.sessionId, 'string')
    assert.equal(json.folder, call.folder)
    assert.equal(json.title, call.title)
    if (sameKeys) assert.deepEqual(Object.keys(json).sort(), [...Object.keys(control.json), 'managedError'].sort())
    assert.ok(writes.some((x) => x.key === json.sessionId), 'the registry tried to record this session')
    assertRenamedBeforeSteer(events, json.sessionId)
    const [rename] = eventsOf(events, json.sessionId, 'rename')
    const [steer] = eventsOf(events, json.sessionId, 'steer')
    const write = writes.find((x) => x.key === json.sessionId)
    assert.ok(rename.at <= write.at && write.at <= steer.at, 'rename → managed → first message: ' + [rename.at, write.at, steer.at])
    await assertDelivered(w, answer)
    assert.ok(await until(async () => (await w.host.call('markerState', { marker })).left === 0, 10000, 100), 'the new session ran its first turn')
  }

  it('MST-02 the write fails before storing: the session starts as the user\'s and the answer says manage-failed', T, async () => {
    const answer = await t.start({ store: 'reject' })
    await assertCarriedOn(answer)
    await t.expectYours(answer.json.sessionId, answer.marker)
    assert.equal(await w.titleOf(answer.json.sessionId), answer.call.title, 'DSH reports the title')
  })

  it('MST-03 the write is stored and then the call fails: managed, and not reported', T, async () => {
    const answer = await t.start({ store: 'after' })
    const { json, marker, writes } = answer
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.equal('managedError' in json, false)
    assert.deepEqual(Object.keys(json).sort(), Object.keys(control.json).sort())
    assert.ok(writes.some((x) => x.key === json.sessionId), 'precondition: the registry wrote this session')
    assertRenamedBeforeSteer(answer.events, json.sessionId)
    await assertDelivered(w, answer)
    await t.expectManaged(json.sessionId, marker)
  })

  describe('MST-04 the watch from notify_when_finished', () => {
    for (const notify of [true, false]) {
      it(notify ? 'flag: a watch on the new session and one notice after its first turn' : 'no flag: no watch', T, async () => {
        const answer = await t.start({ store: 'reject', ...(notify ? { notify_when_finished: true } : {}) })
        const { json } = answer
        await assertCarriedOn(answer, { sameKeys: !notify })
        if (notify) {
          assert.equal(json.watch?.targetSessionId, json.sessionId, JSON.stringify(json))
          assert.deepEqual(json.watch.createdBy, { kind: 'assistant' })
          assert.equal('watchError' in json, false)
          assert.equal((await noticesSettled(w.host, w.fb, json.watch.id, 1)).length, 1, 'one notice after its first turn')
        } else {
          assert.equal('watch' in json, false)
          assert.equal((await watchesOn(w.host, json.sessionId)).length, 0)
        }
        await t.expectYours(json.sessionId, answer.marker)
      })
    }
  })

  describe('MST-05 naming still happens when the write fails', () => {
    const rows = [['named', null, null], ['title-invalid', 'invalid', TITLE.invalid], ['title-failed', 'fail', TITLE.failed]]
    for (const [label, rename, titleError] of rows) {
      it(label, T, async () => {
        const answer = await t.start({ store: 'reject' }, { rename })
        const { json, call } = answer
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.managedError, MANAGE_FAILED)
        if (titleError) {
          assert.equal(json.titleError, titleError)
          assert.equal('title' in json, false, 'no title key next to titleError')
        } else {
          assert.equal(json.title, call.title)
          assert.equal('titleError' in json, false)
        }
        assertRenamedBeforeSteer(answer.events, json.sessionId)
        await assertDelivered(w, answer)
        await t.expectYours(json.sessionId, answer.marker)
      })
    }
  })

  describe('MST-06 a flush that cannot be confirmed still answers ok, unconfirmed', () => {
    for (const [id, flush] of [['MST-06', 'throw'], ['MST-06b', 'false']]) {
      it(id + ' the flush ' + (flush === 'throw' ? 'rejects' : 'answers false'), T, async () => {
        // The same unconfirmed start with a working registry is the reference for the answer's fields.
        const normal = await t.start({}, { flush })
        assert.equal(normal.json?.unconfirmed, true, JSON.stringify(normal.json))
        await t.expectManaged(normal.json.sessionId, normal.marker)
        const answer = await t.start({ store: 'reject' }, { flush })
        const { json } = answer
        assert.equal(json?.ok, true, JSON.stringify(json))
        assert.equal(json.unconfirmed, true)
        assert.equal(json.managedError, MANAGE_FAILED)
        assert.deepEqual(Object.keys(json).sort(), [...Object.keys(normal.json), 'managedError'].sort())
        assert.equal(eventsOf(answer.events, json.sessionId, 'steer').length, 1, 'steered once, so never delivered twice')
        await assertDelivered(w, answer, 'unconfirmed')
        await t.expectYours(json.sessionId, answer.marker)
      })
    }
  })

  describe('MST-07 a failed delivery is refused delivery-failed', () => {
    it('the write fails: the refusal carries managedError, the session is the user\'s', T, async () => {
      const normal = await t.start({}, { steer: true })
      await assertFailedDelivery(w, normal, null)
      const answer = await t.start({ store: 'reject' }, { steer: true })
      await assertFailedDelivery(w, answer, null)
      assert.equal(answer.json.managedError, MANAGE_FAILED)
      assert.deepEqual(Object.keys(answer.json).sort(), [...Object.keys(normal.json), 'managedError'].sort())
      assertRenamedBeforeSteer(answer.events, answer.json.sessionId)
      await t.expectYours(answer.json.sessionId, answer.marker, { ran: false })
    })
    it('the write is stored, then the call fails: no managedError, the session is managed', T, async () => {
      const answer = await t.start({ store: 'after' }, { steer: true })
      await assertFailedDelivery(w, answer, null)
      assert.equal('managedError' in answer.json, false)
      await t.expectManaged(answer.json.sessionId, answer.marker, { ran: false })
    })
  })

  it('MST-08 control: a failed delivery with a working registry has no managedError and the session is managed', T, async () => {
    const answer = await t.start({}, { steer: true })
    await assertFailedDelivery(w, answer, null)
    assert.equal('managedError' in answer.json, false)
    await t.expectManaged(answer.json.sessionId, answer.marker, { ran: false })
  })

  describe('MST-09 together with a workspace that did not take the session', () => {
    const ws = { id: null, path: null, failing: (on) => w.host.call('failAttach', { workspaceId: ws.id, on }) }
    it('the write fails too: both markers; the session is the user\'s and in no workspace', T, async () => {
      Object.assign(ws, await w.host.call('createWorkspace', { dir: path.join(w.home, 'work', 'mst-ws') }))
      const answer = await t.start({ store: 'reject', attach: ws, folder: ws.id })
      const { json } = answer
      assert.equal(json?.ok, true, JSON.stringify(json))
      assert.equal(json.workspaceError, HALF_MADE.workspaceError)
      assert.equal(json.managedError, MANAGE_FAILED)
      assert.equal((await w.host.call('workspaces')).list.some((x) => x.sessionIds.includes(json.sessionId)), false, 'in no workspace')
      await assertDelivered(w, answer, 'delivered', json.folder)
      await t.expectYours(json.sessionId, answer.marker)
    })
    it('only the workspace fails: workspaceError alone; the session is managed', T, async () => {
      const answer = await t.start({ attach: ws, folder: ws.id })
      const { json } = answer
      assert.equal(json?.ok, true, JSON.stringify(json))
      assert.equal(json.workspaceError, HALF_MADE.workspaceError)
      assert.equal('managedError' in json, false)
      await t.expectManaged(json.sessionId, answer.marker)
    })
  })

  it('MST-10 a session that is the user\'s after a failed write can be handed over later', T, async () => {
    const answer = await t.start({ store: 'reject' })
    const sid = answer.json.sessionId
    await assertCarriedOn(answer)
    await t.expectYours(sid, answer.marker)
    await makeManaged(w.host, w.fb, sid)
    assert.equal((await managedEntry(w.host, sid))?.by, MANAGED_BY.handOver)
    const req = (await turn(w.host, sid, [[{ text: 'next' }]])).requests.at(-1)
    for (const tool of MANAGED_TOOLS) assert.ok(toolNames(req).includes(tool), tool + ' after the hand over')
  })
})

describe('start_session whose managed write fails counts against sessionsPerHour (2)', { skip: NEEDS_INSTANCE_STUB }, () => {
  const w = useHost('mst-cap', { env: APPROVER_AFTER_ENV, limits: { sessionsPerHour: 2 } })
  const t = toolkit(w)

  it('MST-20 the first (the write fails) succeeds', T, async () => {
    const answer = await t.start({ store: 'reject' })
    assert.equal(answer.json?.ok, true, JSON.stringify(answer.json))
    assert.equal(answer.json.managedError, MANAGE_FAILED)
  })
  it('MST-21 the second (the write fails and the delivery fails) is refused with managedError', T, async () => {
    const answer = await t.start({ store: 'reject' }, { steer: true })
    await assertFailedDelivery(w, answer, null)
    assert.equal(answer.json.managedError, MANAGE_FAILED)
  })
  it('MST-22 the cap is spent: the next start is refused hourly-cap and creates nothing', T, async () => {
    const sessions = await w.sessionCount()
    const outbox = await outboxNow(w.host)
    const answer = await t.start({})
    assert.deepEqual(answer.json, { ok: false, code: P5_CODE.hourlyCap })
    assert.equal(await w.sessionCount(), sessions)
    assert.deepEqual(await outboxNow(w.host), outbox)
  })
})
