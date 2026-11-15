/** D1 black-box bridge checks: requirements + public contract, no SDK or live DSH. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createBridgeHost } from '../packages/dsh-connector/src/slim/host/bridge.js'
import {
  CONNECTOR_CONTRACT, ENVELOPE, OPERATION, EVENT, ERROR, SEMANTIC_CAPABILITY,
  makeEnvelope,
} from '../packages/dsh-connector/contract/contract.js'
import { until } from './support/util.mjs'

const DATA = Object.freeze({
  hostId: 'd1-black-box-host', hostInstanceId: 'd1-black-box-incarnation', sessionId: 'd1-session',
  approvalId: 'd1-approval', offerId: 'd1-offer', questionId: 'd1-question', promptId: 'd1-prompt',
  title: 'D1 test session', timeoutMs: 2000, pollMs: 5, at: 1,
})
const MARKER = SEMANTIC_CAPABILITY.interactionTimerfree
const descriptor = () => ({
  approvalId: DATA.approvalId, offerId: DATA.offerId, kind: 'approval', prompt: 'Allow this?',
  choices: ['allow', 'reject'], title: DATA.title, at: DATA.at, toolName: 'test_tool',
  callId: null, reason: 'Independent test', quotes: [],
})
const gatedRequests = [
  [OPERATION.approvalAnswer, DATA.sessionId, { sessionId: DATA.sessionId, approvalId: DATA.approvalId, offerId: DATA.offerId, answer: { decision: 'reject', reason: 'Test rejection' } }],
  [OPERATION.questionAnswer, DATA.sessionId, { sessionId: DATA.sessionId, questionId: DATA.questionId, toUser: true }],
  [OPERATION.questionAsk, null, { sessionId: DATA.sessionId, questions: [{ id: DATA.questionId, question: 'Continue?' }] }],
  [OPERATION.questionAnswerOwn, null, { questionId: DATA.questionId, answers: [{ id: DATA.questionId, selected: [] }] }],
  [OPERATION.promptList, null, {}],
  [OPERATION.promptAnswer, DATA.sessionId, { sessionId: DATA.sessionId, promptId: DATA.promptId, decision: 'reject', reason: 'Test rejection' }],
]

function fixture(t) {
  const sessions = {
    enabled: () => true, managedIds: () => [DATA.sessionId], isManaged: () => true,
    isFishball: () => false, isRelated: () => true,
    describe: () => ({ sessionId: DATA.sessionId, title: DATA.title, workspaceId: null, running: false, pendingInteraction: false }),
    workspaces: () => [], resolveWorkspacePath: () => null,
    start: async () => ({ sessionId: DATA.sessionId, managed: true }),
    message: async () => ({ status: 'delivered' }), redirect: async () => ({ status: 'delivered' }),
    stop: async () => ({ stopped: true }), read: async () => ({ messages: [], truncated: false }),
    watch: async () => ({ watchId: 'd1-watch' }), watches: () => [], unwatch: () => ({ ok: true }),
    release: () => ({ sessionId: DATA.sessionId, managed: false }),
  }
  const host = createBridgeHost({ hostId: DATA.hostId, hostInstanceId: DATA.hostInstanceId, sessions })
  t.after(() => host.close())
  function attach() {
    const frames = []
    const messages = new Set()
    const closes = new Set()
    const deliver = (frame) => { for (const fn of messages) fn(JSON.stringify(frame)) }
    const handle = host.attach({
      send: (text) => { frames.push(JSON.parse(text)) },
      onMessage: (fn) => { messages.add(fn); return () => messages.delete(fn) },
      onClose: (fn) => { closes.add(fn); return () => closes.delete(fn) },
      close: () => {},
    })
    return {
      frames, handle, deliver,
      async request(operation, payload, sessionId = null) {
        const requestId = randomUUID()
        deliver(makeEnvelope(DATA.hostId, sessionId, requestId, ENVELOPE.type.request, operation, payload))
        const reply = await until(() => frames.find((frame) => frame.requestId === requestId), DATA.timeoutMs, DATA.pollMs)
        assert.ok(reply, `Expected reply for ${operation}`)
        return reply
      },
      handshake(timerfree) {
        return this.request(ENVELOPE.handshake, {
          capabilities: [OPERATION.inboxPush, ...(timerfree ? [MARKER] : [])],
          requiredCapabilities: timerfree ? [MARKER] : [],
        })
      },
      ack(frame) {
        deliver(makeEnvelope(DATA.hostId, null, frame.requestId, ENVELOPE.type.response, OPERATION.inboxPush, { acked: true }))
      },
    }
  }
  return { host, attach }
}

function expectResponse(frame, payload) {
  assert.equal(frame.type, ENVELOPE.type.response)
  if (payload !== undefined) assert.deepEqual(frame.payload, payload)
}

async function ordinaryControl(peer) {
  const frame = await peer.request(OPERATION.sessionRead, { sessionId: DATA.sessionId, maxMessages: 1, maxBytes: 128 }, DATA.sessionId)
  expectResponse(frame, { messages: [], truncated: false })
}

function inbox(kind) {
  return { messageId: randomUUID(), kind, sourceSessionId: DATA.sessionId, text: 'Independent inbox item', images: [], dedupeKey: randomUUID(), at: DATA.at }
}

for (const advertise of [false, true]) {
  test(`D1 host advertises marker; peer marker=${advertise} decides interaction readiness`, async (t) => {
    const { host, attach } = fixture(t)
    const states = []
    host.onConnection((state) => states.push({ ...state, observedReady: host.interactionReady }))
    assert.equal(CONNECTOR_CONTRACT.minor, 2)
    assert.ok(host.capabilities.includes(MARKER))
    assert.equal(host.interactionReady, false)
    const peer = attach()
    const premature = await peer.request(OPERATION.approvalList, { sessionId: DATA.sessionId }, DATA.sessionId)
    assert.equal(premature.payload.code, ERROR.handshakeRequired)
    expectResponse(await peer.handshake(advertise))
    assert.ok(peer.frames.find((frame) => frame.operation === ENVELOPE.handshake).payload.capabilities.includes(MARKER))
    const ready = states.find((state) => state.ready)
    assert.ok(ready, 'Ready notification must occur')
    assert.equal(ready.interactionTimerfree, advertise)
    assert.equal(ready.observedReady, advertise, 'Negotiation is installed before ready subscribers run')
    assert.equal(host.interactionReady, advertise)
    await ordinaryControl(peer)
  })
}

test('D1 legacy channel gates all six interaction operations and lists no approvals without invoking handlers', async (t) => {
  const { host, attach } = fixture(t)
  const invoked = []
  for (const operation of [OPERATION.approvalList, ...gatedRequests.map(([operation]) => operation)]) {
    host.register(operation, () => { invoked.push(operation); throw new Error('Legacy interaction handler must not run') })
  }
  const peer = attach()
  expectResponse(await peer.handshake(false))
  expectResponse(await peer.request(OPERATION.approvalList, { sessionId: DATA.sessionId }, DATA.sessionId), { approvals: [] })
  for (const [operation, sessionId, payload] of gatedRequests) {
    const frame = await peer.request(operation, payload, sessionId)
    assert.equal(frame.type, ENVELOPE.type.error, operation)
    assert.equal(frame.payload.code, ERROR.featureOff, operation)
    await ordinaryControl(peer)
  }
  assert.deepEqual(invoked, [])
})

test('D1 negotiated channel routes the six interaction operations to their handlers', async (t) => {
  const { host, attach } = fixture(t)
  const invoked = []
  const responses = new Map([
    [OPERATION.approvalAnswer, { accepted: true }],
    [OPERATION.questionAnswer, { accepted: true }],
    [OPERATION.questionAsk, { questionId: DATA.questionId }],
    [OPERATION.questionAnswerOwn, { accepted: true }],
    [OPERATION.promptList, { prompts: [] }],
    [OPERATION.promptAnswer, { promptId: DATA.promptId, decision: 'reject', managed: true }],
  ])
  for (const [operation] of gatedRequests) {
    host.register(operation, ({ payload }) => {
      invoked.push({ operation, payload })
      return responses.get(operation)
    })
  }
  const peer = attach()
  expectResponse(await peer.handshake(true))
  for (const [operation, sessionId, payload] of gatedRequests) {
    expectResponse(await peer.request(operation, payload, sessionId), responses.get(operation))
  }
  assert.deepEqual(invoked, gatedRequests.map(([operation, , payload]) => ({ operation, payload })))
})

test('D1 capable channel emits deadline-free descriptors immediately on ready and in list response', async (t) => {
  const { host, attach } = fixture(t)
  host.register(OPERATION.approvalList, () => ({ approvals: [descriptor()] }))
  const published = []
  host.onConnection((state) => {
    if (state.ready) published.push(host.publish(EVENT.approvalRequest, DATA.sessionId, descriptor()))
  })
  const peer = attach()
  expectResponse(await peer.handshake(true))
  assert.deepEqual(published, [true])
  const event = peer.frames.find((frame) => frame.operation === EVENT.approvalRequest)
  assert.ok(event, 'Timer-free event is deliverable inside ready callback')
  assert.equal(event.type, ENVELOPE.type.event)
  assert.deepEqual(event.payload, descriptor())
  assert.equal(Object.hasOwn(event.payload, 'expiresAt'), false)
  expectResponse(await peer.request(OPERATION.approvalList, { sessionId: DATA.sessionId }, DATA.sessionId), { approvals: [descriptor()] })
})

test('D1 approval inbox remains pending through legacy connection and is replayed unchanged to capable reconnect', async (t) => {
  const { host, attach } = fixture(t)
  const legacy = attach()
  expectResponse(await legacy.handshake(false))
  const item = inbox('approval')
  let settled = false
  // Capture rejection immediately too: teardown must not leave an unhandled pending promise.
  const outcome = host.pushInbox(item).then(
    (value) => { settled = true; return { value } },
    (error) => { settled = true; return { error } },
  )
  await ordinaryControl(legacy)
  assert.equal(settled, false, 'Legacy must neither ack nor reject the retained approval')
  assert.equal(legacy.frames.some((frame) => frame.operation === OPERATION.inboxPush), false)
  legacy.handle.close()
  assert.equal(host.interactionReady, false)
  assert.equal(settled, false)
  const capable = attach()
  assert.equal(capable.frames.length, 0, 'Attach alone must not enable interaction delivery')
  expectResponse(await capable.handshake(true))
  const pushed = await until(() => capable.frames.find((frame) => frame.operation === OPERATION.inboxPush), DATA.timeoutMs, DATA.pollMs)
  assert.ok(pushed, 'Pending approval is delivered after capable handshake without re-enqueue')
  assert.deepEqual(pushed.payload, item)
  assert.equal(settled, false, 'Delivery without acknowledgement is still pending')
  capable.ack(pushed)
  assert.ok(await until(() => settled, DATA.timeoutMs, DATA.pollMs), 'Acknowledgement settles pending inbox')
  assert.deepEqual(await outcome, { value: { acked: true } })
})

test('D1 legacy suppresses every approval event while ordinary inbox remains usable', async (t) => {
  const { host, attach } = fixture(t)
  const peer = attach()
  expectResponse(await peer.handshake(false))
  const events = [
    [EVENT.approvalRequest, descriptor()],
    [EVENT.approvalSettled, { approvalId: DATA.approvalId, decision: 'reject', by: 'user' }],
    [EVENT.approvalRan, { approvalId: DATA.approvalId, via: 'pass', by: 'user', toolName: 'test_tool', reason: 'Test', at: DATA.at, argumentsStatus: 'unavailable' }],
  ]
  for (const [operation, payload] of events) assert.equal(host.publish(operation, DATA.sessionId, payload), false, operation)
  for (const kind of ['session', 'user', 'system', 'watch', 'plugin']) {
    const item = inbox(kind)
    let settled = false
    const result = host.pushInbox(item).then(
      (value) => { settled = true; return { value } },
      (error) => { settled = true; return { error } },
    )
    const frame = await until(() => peer.frames.find((frame) => frame.operation === OPERATION.inboxPush && frame.payload.messageId === item.messageId), DATA.timeoutMs, DATA.pollMs)
    assert.ok(frame, kind)
    assert.deepEqual(frame.payload, item)
    peer.ack(frame)
    assert.ok(await until(() => settled, DATA.timeoutMs, DATA.pollMs), `Acknowledgement settles ${kind} inbox`)
    assert.deepEqual(await result, { value: { acked: true } })
  }
  assert.equal(peer.frames.some((frame) => events.some(([operation]) => frame.operation === operation)), false)
})
