/** Requirements-only list-bump TDD; canonical cases/results: docs/test-design/list-bump.md. */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { HOOK, T } from './support/expect.mjs'
import { STARTED_BY, TURN_BY } from './support/constants.mjs'
import { OPERATION, restartStub } from './support/instance-stub.mjs'
import { APPROVALS, escalateAndSettle, itemFor, offerFor } from './support/instance-stub-approvals.mjs'
import { ActivityListContract, LIST_ACTIVITY as C, activityHost, deliveredActivity, noActivity } from './support/session-list-activity.mjs'

const fixture = { name: C.fixture.name, dir: new URL('./support/fixtures/fbtest-session-list-activity/', import.meta.url).pathname, enabled: true }
const response = reply => { assert.equal(reply.type, 'response', JSON.stringify(reply)); return reply.payload }
const rejected = reply => assert.equal(reply.type, 'error', JSON.stringify(reply))

// Use Case FIRST: a connected user sees the session Fishball just messaged rise.
// Only the delivery/bus is real here; automatic row ordering is explicitly modeled.
describe('Fishball activity: real safe-host delivery → modeled live list', () => {
  let w
  before(async () => { w = await activityHost() }, HOOK)
  after(async () => { await w?.stop() }, HOOK)

  it('TC-01 Use Case: just-messaged session rises above its newer peer without reload', T, async () => {
    const target = await w.target('uc-target')
    const peer = await w.user('uc-peer')
    const rows = await w.list()
    const targetRow = rows.find(row => row.sessionId === target)
    const peerRow = rows.find(row => row.sessionId === peer)
    assert.ok(targetRow.updatedAt < peerRow.updatedAt, 'precondition: target starts below peer')
    const client = new ActivityListContract([targetRow, peerRow])
    assert.deepEqual(client.ids(), [peer, target])
    const offset = await w.mark(peer)
    assert.equal(response(await w.message(target)).status, 'delivered')
    await w.relays(target, C.text.message)
    for (const event of await deliveredActivity(w, offset, target)) client.receive(event)
    assert.ok(client.at(target) > targetRow.updatedAt, 'received timestamp must advance target cache in this safely-later-clock scenario')
    assert.deepEqual(client.ids(), [target, peer], 'MODEL, not browser: target rises live from actual connector bus event')
  })

  it('TC-02 Decision Table R2: successful start emits target activity', T, async () => {
    const offset = await w.mark()
    const sessionId = response(await w.start()).sessionId
    await w.relays(sessionId, C.text.message)
    await deliveredActivity(w, offset, sessionId)
  })

  it('TC-03 Decision Table R3 / State Transition: running redirect emits activity after replacement delivery', T, async () => {
    const target = await w.target('redirect-success')
    await w.running(target)
    const offset = (await w.events()).length
    try {
      assert.equal(response(await w.redirect(target)).status, 'delivered')
    } finally { await w.host.call('releaseHold', { sessionId: target }) }
    await w.relays(target, C.text.message, OPERATION.sessionRedirect)
    assert.ok((await w.host.call('turnEnds', { sessionId: target })).includes('aborted'), 'old turn was cancelled')
    await deliveredActivity(w, offset, target)
  })

  for (const [id, rule, operation] of [
    ['TC-04', 'R4', OPERATION.sessionMessage],
    ['TC-05', 'R5', OPERATION.sessionStart],
  ]) {
    it(id + ' Decision Table ' + rule + ': ' + operation + ' failed steer emits nothing', T, async () => {
      const target = operation === OPERATION.sessionStart ? null : await w.cold(id)
      const offset = await w.mark(target)
      await w.host.call('startProbe', C.probe)
      let reply
      let events
      try {
        reply = operation === OPERATION.sessionStart ? await w.start() : await w.scoped(operation, target)
        events = await w.host.call('probeEvents')
      } finally { await w.host.call('stopProbe') }
      const failedId = reply.payload?.sessionId ?? events.find(event => event.type === 'steer')?.sessionId ?? target
      assert.ok(events.some(event => event.type === 'steer' && event.sessionId === failedId), 'precondition: delivery reached the throwing steer probe')
      // session.start may return the created half-made session. The new activity
      // requirement specifies absence on failure, not a different reply policy.
      if (operation !== OPERATION.sessionStart) rejected(reply)
      await noActivity(w, offset, failedId)
      assert.deepEqual(await w.host.call('userMessages', { sessionId: failedId }), [], 'throwing steer delivered nothing')
    })
  }

  it('TC-06 Decision Table R6: redirect failed followup emits nothing', T, async () => {
    const target = await w.target('redirect-failure')
    const offset = await w.mark(target)
    await w.probe('failFollowup', { sessionId: target, on: true })
    try {
      rejected(await w.redirect(target))
      assert.equal(await w.probe('followupFailures'), C.counts.one, 'precondition: replacement delivery reached throwing followup boundary')
    } finally { await w.probe('failFollowup', { sessionId: target, on: false }) }
    await noActivity(w, offset, target)
    assert.equal((await w.host.call('userMessages', { sessionId: target })).some(message => message.text === C.text.message), false)
  })

  for (const [id, operation, archived] of [
    ['TC-07', OPERATION.sessionMessage, false], ['TC-08', OPERATION.sessionMessage, true],
    ['TC-09', OPERATION.sessionRedirect, false], ['TC-10', OPERATION.sessionRedirect, true],
  ]) {
    it(id + ' EP / Decision Table ' + (archived ? 'R8' : 'R7') + ': ' + operation + ' to ' + (archived ? 'archived' : 'unknown') + ' target emits nothing', T, async () => {
      const target = archived ? await w.target(id) : C.id.unknown
      if (archived) assert.equal((await w.host.call('archive', { sessionId: target, stopActivity: true })).ok, true)
      const offset = await w.mark(target)
      rejected(await w.scoped(operation, target))
      await noActivity(w, offset, target)
    })
  }

  for (const [id, operation] of [
    ['TC-11', OPERATION.sessionMessage], ['TC-12', OPERATION.sessionStart], ['TC-13', OPERATION.sessionRedirect],
  ]) {
    it(id + ' EP: ' + operation + ' preserves Fishball agent-message identity and text', T, async () => {
      const target = operation === OPERATION.sessionStart ? null : await w.target(id)
      const marker = C.text.message + ' ' + id
      const payload = response(operation === OPERATION.sessionStart ? await w.start(marker) : await w.scoped(operation, target, marker))
      const sessionId = payload.sessionId ?? target
      await w.relays(sessionId, marker, operation)
    })
  }

  for (const [id, operation] of [
    ['TC-14', OPERATION.sessionMessage], ['TC-15', OPERATION.sessionStart], ['TC-16', OPERATION.sessionRedirect],
  ]) {
    it(id + ' EP: ' + operation + ' keeps approval provenance Fishball, never human', T, async () => {
      const target = operation === OPERATION.sessionStart ? null : await w.target(id)
      const marker = C.text.message + ' ' + id
      const answer = await w.askOnDelivery(operation, target, marker)
      response(answer.reply)
      const frame = await offerFor(w.stub, marker)
      assert.ok(frame, 'approval triggered by actual Fishball delivery')
      const item = await itemFor(w.stub, frame.payload.approvalId)
      assert.ok(item, 'approval notice available')
      try {
        assert.equal(item.started, operation === OPERATION.sessionStart ? STARTED_BY.fishball : STARTED_BY.user)
        assert.equal(item.turnBy, operation === OPERATION.sessionRedirect ? C.provenance.redirect : TURN_BY.fishball)
        if (operation !== OPERATION.sessionStart) assert.equal(item.fields.latest_user_message, C.text.firstUser, 'Fishball text is not latest human message')
      } finally {
        await escalateAndSettle(w, { sessionId: answer.sessionId, descriptor: frame.payload }, marker)
      }
    })
  }

  it('TC-22 EP: message does not change authoritative host updatedAt', T, async () => {
    const target = await w.target('projection-invariant')
    const before = await w.row(target)
    assert.equal(response(await w.message(target)).status, 'delivered')
    await w.relays(target, C.text.message)
    assert.equal((await w.row(target)).updatedAt, before.updatedAt, 'live-only event must not alter the persisted/projection ordering value')
  })

  it('TC-23 EP: successful message preserves durable manual session order and pins', T, async () => {
    const created = await w.host.call('ordinary', { folder: C.order.folder })
    const cwd = (await w.host.call('header', { sessionId: created.sessionId })).cwd
    const workspace = await w.host.call('createWorkspace', { dir: cwd })
    const first = response(await w.start(C.text.message + C.order.target, workspace.id)).sessionId
    const second = response(await w.start(C.text.message + C.order.peer, workspace.id)).sessionId
    await w.wait(first)
    await w.wait(second)
    await w.probe('order', { workspaceId: workspace.id, sessionId: second, beforeSessionId: first })
    await w.probe('pin', { sessionId: second })
    const before = await w.host.call('workspaces')
    const order = before.list.find(item => item.id === workspace.id).sessionIds
    assert.ok(order.indexOf(second) < order.indexOf(first), 'precondition: messaged target is behind peer in durable accounting order')
    assert.ok(before.pinned.includes(second), 'precondition: peer is pinned')
    assert.equal(response(await w.message(first)).status, 'delivered')
    await w.relays(first, C.text.message)
    assert.deepEqual(await w.host.call('workspaces'), before, 'no manual order, membership, archive or pin changes')
  })

  it('TC-24 State Transition: stop without a message emits no delivery activity', T, async () => {
    const target = await w.target('stop-no-delivery')
    const offset = await w.mark(target)
    assert.equal(response(await w.stub.op(OPERATION.sessionStop, { sessionId: target }, target)).stopped, true)
    await noActivity(w, offset, target)
  })

  it('TC-25 EP / State Transition: cold managed message resumes and emits activity', T, async () => {
    const target = await w.cold('cold-success')
    const offset = await w.mark(target)
    assert.equal(response(await w.message(target)).status, 'delivered')
    await w.relays(target, C.text.message)
    await deliveredActivity(w, offset, target)
  })

  it('TC-26 State Transition: restart may return to persisted ordering without durable bump', T, async () => {
    const target = await w.target('restart-invariant')
    const before = await w.row(target)
    assert.equal(response(await w.message(target)).status, 'delivered')
    await w.relays(target, C.text.message)
    const rebooted = await restartStub(w, { env: APPROVALS.env, link: [fixture] })
    Object.assign(w, rebooted)
    assert.equal((await w.row(target)).updatedAt, before.updatedAt, 'restart reads persisted user-message ordering, not a durable synthetic activity')
  })
})

describe('Known DSH live-client boundary: deterministic CONTRACT MODEL, not real UI', () => {
  for (const [id, label, timestamp, expected] of [
    ['TC-17', 'T−1', C.clock.less, C.clock.cached],
    ['TC-18', 'T', C.clock.equal, C.clock.cached],
    ['TC-19', 'T+1', C.clock.greater, C.clock.greater],
  ]) {
    it(id + ' BVA 3-value: incoming ' + label + ' with cached T=' + C.clock.cached, () => {
      const client = new ActivityListContract([{ sessionId: C.id.target, updatedAt: C.clock.cached }])
      const clock = { now: () => timestamp }
      client.receive({ sessionId: C.id.target, timestamp: clock.now() })
      assert.equal(client.at(C.id.target), expected)
    })
  }

  it('TC-20 State Transition: greater → equal → older never regresses modeled cached activity', () => {
    const client = new ActivityListContract([{ sessionId: C.id.target, updatedAt: C.clock.cached }])
    for (const timestamp of [C.clock.greater, C.clock.greater, C.clock.less]) client.receive({ sessionId: C.id.target, timestamp })
    assert.equal(client.at(C.id.target), C.clock.greater)
  })

  it('TC-21 State Transition: modeled reload/reconnect re-seeds persisted ordering', () => {
    const baseline = [{ sessionId: C.id.target, updatedAt: C.clock.peer }, { sessionId: C.id.peer, updatedAt: C.clock.cached }]
    const connected = new ActivityListContract(baseline)
    connected.receive({ sessionId: C.id.target, timestamp: C.clock.greater })
    assert.deepEqual(connected.ids(), [C.id.target, C.id.peer])
    const reconnected = new ActivityListContract(baseline)
    assert.deepEqual(reconnected.ids(), [C.id.peer, C.id.target])
    assert.equal(baseline[C.counts.none].updatedAt, C.clock.peer, 'live contract model did not mutate authoritative baseline')
  })
})
