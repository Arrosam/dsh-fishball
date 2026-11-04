import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { carrierPair } from './native-production-control-fixture.mjs'
import { assertDisposableEnvironment, bounded, deferred } from './native-production-helpers.mjs'

await assertDisposableEnvironment()
const { createControlHost, createControlClient, encodeEnvelope, decodeEnvelope } = await import('../src/native-control/index.js')

const SPEC = Object.freeze({
  host: 'host-alpha', otherHost: 'host-beta', session: 'managed-session', otherSession: 'unmanaged-session',
  principal: 'private-fishball', connection: 'connection-', message: 'message-', text: 'hello host',
  approval: 'approval-', prompt: 'Allow managed action?', choices: ['allow', 'reject'],
  status: { state: 'idle', lastSequence: 0 }, expiry: 1000, initialTime: 500,
  limits: { maxEnvelopeBytes: 4096, maxInflight: 2, maxWatches: 2, maxConnections: 2,
    maxPendingApprovals: 2, maxDedupeEntries: 2, requestTimeoutMs: 2000, handshakeTimeoutMs: 2000 },
})

// Shared with host-adapter tests; serialized carrier behavior is unchanged.

function fixture(t, overrides = {}) {
  const calls = { authorize: [], deliver: [], status: [], watch: [], answers: [] }
  const wire = [], clients = [], connections = []
  let clock = SPEC.initialTime, sequence = 0
  const host = createControlHost({
    hostId: SPEC.host, limits: SPEC.limits, now: () => clock,
    authorizeTarget: input => { calls.authorize.push(input); return input.sessionId === SPEC.session },
    deliverMessage: async input => { calls.deliver.push(input); return { status: 'delivered' } },
    getStatus: async input => { calls.status.push(input); return SPEC.status },
    watchSession: (input, emit) => { calls.watch.push({ input, emit, closed: false }); const entry = calls.watch.at(-1); return () => { entry.closed = true } },
    ...overrides,
  })
  const attach = async (options = {}) => {
    const [hostCarrier, clientCarrier] = carrierPair(wire)
    const connectionId = SPEC.connection + ++sequence
    connections.push(host.attach(hostCarrier, { connectionId, principalId: options.principalId ?? SPEC.principal }))
    const client = createControlClient({ hostId: options.hostId ?? SPEC.host, limits: SPEC.limits, ...options })
    clients.push(client)
    await bounded(client.attach(clientCarrier), 'control handshake did not settle')
    return client
  }
  t.after(() => { for (const client of clients) client.close(); for (const connection of connections) connection.close() })
  return { host, calls, wire, attach, setTime: value => { clock = value } }
}
const send = (client, messageId = SPEC.message + 'one', text = SPEC.text, sessionId = SPEC.session) =>
  client.request('message.send', sessionId, { messageId, text })
const status = (client, sessionId = SPEC.session) => client.request('session.status', sessionId, {})
const listApprovals = client => client.request('approval.list', SPEC.session, {})
const answerApproval = (client, offer, answer = { decision: 'allow' }, sessionId = SPEC.session) =>
  client.request('approval.answer', sessionId, { approvalId: offer.approvalId, offerId: offer.offerId, answer })
function registerApproval(f, suffix = 'one', overrides = {}) {
  let live = true
  const cancel = f.host.registerApproval({
    sessionId: SPEC.session, approvalId: SPEC.approval + suffix, kind: 'approval',
    prompt: SPEC.prompt, choices: SPEC.choices, expiresAt: SPEC.expiry,
    isLive: () => live, answer: answer => { f.calls.answers.push(answer) }, ...overrides,
  })
  return { cancel, expire: () => { live = false } }
}
const rejected = operation => assert.rejects(async () => operation())

// Equivalence partitions: only intentional host-local managed operations can pass.
test('PROTO-01 managed status/message cross a serialized explicitly host-addressed channel', async t => {
  const f = fixture(t), client = await f.attach()
  await status(client)
  await send(client)
  assert.equal(f.calls.status.length, 1)
  assert.equal(f.calls.deliver.length, 1)
  assert.equal(f.calls.deliver[0].sessionId, SPEC.session)
  assert.equal(f.calls.deliver[0].text, SPEC.text)
  for (const { value } of f.wire) {
    assert.equal(value.hostId, SPEC.host, 'every wire envelope addresses the intended host')
    assert.ok(Object.hasOwn(value, 'version'), 'every wire envelope carries protocol version')
  }
})

for (const operation of ['model.call', 'file.read', 'tool.execute', 'unknown.operation']) {
  test('PROTO-02 rejects out-of-scope ' + operation + ' before host callbacks', async t => {
    const f = fixture(t), client = await f.attach()
    await rejected(() => client.request(operation, SPEC.session, {}))
    assert.deepEqual(f.calls.deliver, [])
    assert.deepEqual(f.calls.status, [])
  })
}

test('AUTH-01 local management registry rejects an unmanaged target', async t => {
  const f = fixture(t), client = await f.attach()
  await rejected(() => send(client, SPEC.message + 'other', SPEC.text, SPEC.otherSession))
  await rejected(() => status(client, SPEC.otherSession))
  assert.deepEqual(f.calls.deliver, [])
  assert.deepEqual(f.calls.status, [])
  assert.ok(f.calls.authorize.length > 0)
  for (const input of f.calls.authorize) {
    assert.equal(input.hostId, SPEC.host)
    assert.equal(input.principalId, SPEC.principal)
    assert.equal(input.sessionId, SPEC.otherSession)
  }
})

test('PROTO-03 wrong-host handshake cannot reach host operations', async t => {
  const f = fixture(t)
  await rejected(() => f.attach({ hostId: SPEC.otherHost }))
  assert.deepEqual(f.calls.deliver, [])
  assert.deepEqual(f.calls.status, [])
})

for (const payload of [null, [], { text: SPEC.text }, { messageId: '', text: SPEC.text },
  { messageId: SPEC.message, text: SPEC.text, managed: true },
  { messageId: SPEC.message, text: SPEC.text, hostId: SPEC.otherHost },
  { messageId: SPEC.message, text: '界'.repeat(SPEC.limits.maxEnvelopeBytes) }]) {
  test('PROTO-03/04 malformed or oversized message is rejected without delivery', async t => {
    const f = fixture(t), client = await f.attach()
    await rejected(() => client.request('message.send', SPEC.session, payload))
    assert.deepEqual(f.calls.deliver, [])
  })
}

test('AUTH-03 reconnect reconciles acknowledged message IDs without duplicate delivery', async t => {
  const f = fixture(t), first = await f.attach()
  await send(first)
  first.close()
  const second = await f.attach()
  await status(second)
  await send(second)
  assert.equal(f.calls.deliver.length, 1)
  assert.equal(f.calls.status.length, 1, 'fresh connection can obtain host-local snapshot')
  await rejected(() => send(second, SPEC.message + 'one', 'changed-content'))
  assert.equal(f.calls.deliver.length, 1, 'conflicting dedupe identity cannot change original effect')
})

test('PROTO-04 dedupe saturation does not evict old authority and replay side effects', async t => {
  const f = fixture(t), client = await f.attach()
  for (let index = 0; index < SPEC.limits.maxDedupeEntries; index++) await send(client, SPEC.message + index)
  await rejected(() => send(client, SPEC.message + 'overflow'))
  await send(client, SPEC.message + 0)
  assert.equal(f.calls.deliver.length, SPEC.limits.maxDedupeEntries)
})

test('AUTH-02 a live offer can be answered once, never replayed as a grant', async t => {
  const f = fixture(t), client = await f.attach()
  registerApproval(f)
  const { approvals } = await listApprovals(client)
  assert.equal(approvals.length, 1)
  const offer = approvals[0]
  assert.equal(offer.approvalId, SPEC.approval + 'one')
  assert.equal(typeof offer.offerId, 'string')
  await answerApproval(client, offer)
  await rejected(() => answerApproval(client, offer))
  assert.deepEqual(f.calls.answers, [{ decision: 'allow' }])
})

for (const disposition of ['cancelled', 'expired', 'wrong-target', 'missing-offer', 'grant', 'extra-authority']) {
  test('AUTH-02/04 rejects ' + disposition + ' approval without calling host answer', async t => {
    const f = fixture(t), client = await f.attach()
    const pending = registerApproval(f)
    const { approvals: [offer] } = await listApprovals(client)
    let target = SPEC.session, answer = { decision: 'allow' }
    if (disposition === 'cancelled') pending.expire()
    if (disposition === 'expired') f.setTime(SPEC.expiry)
    if (disposition === 'wrong-target') target = SPEC.otherSession
    if (disposition === 'missing-offer') delete offer.offerId
    if (disposition === 'grant') answer = { decision: 'grant' }
    if (disposition === 'extra-authority') answer = { decision: 'allow', reusable: true }
    await rejected(() => answerApproval(client, offer, answer, target))
    assert.deepEqual(f.calls.answers, [])
  })
}

test('AUTH-02 expiry boundary accepts immediately before, rejects exactly at deadline', async t => {
  const f = fixture(t), client = await f.attach()
  registerApproval(f, 'before')
  const { approvals: [before] } = await listApprovals(client)
  f.setTime(SPEC.expiry - 1)
  await answerApproval(client, before)
  registerApproval(f, 'at')
  const { approvals: [at] } = await listApprovals(client)
  f.setTime(SPEC.expiry)
  await rejected(() => answerApproval(client, at))
  assert.equal(f.calls.answers.length, 1)
})

test('AUTH-03 reconnect needs a fresh approval offer and cannot reuse old nonce', async t => {
  const f = fixture(t), first = await f.attach()
  registerApproval(f)
  const { approvals: [oldOffer] } = await listApprovals(first)
  first.close()
  const second = await f.attach()
  await rejected(() => answerApproval(second, oldOffer))
  const { approvals: [newOffer] } = await listApprovals(second)
  assert.notEqual(newOffer.offerId, oldOffer.offerId)
  await answerApproval(second, newOffer)
  assert.equal(f.calls.answers.length, 1)
})

test('AUTH-01 a question settles only with text, not approval authority', async t => {
  const f = fixture(t), client = await f.attach()
  registerApproval(f, 'question', { kind: 'question', choices: [] })
  const { approvals: [offer] } = await listApprovals(client)
  await rejected(() => answerApproval(client, offer, { decision: 'allow' }))
  await answerApproval(client, offer, { text: SPEC.text })
  assert.deepEqual(f.calls.answers, [{ text: SPEC.text }])
})

test('PROTO-04 watch limit releases on close and disconnect', async t => {
  const f = fixture(t), client = await f.attach()
  for (let index = 0; index < SPEC.limits.maxWatches; index++) {
    await client.request('watch.open', SPEC.session, { watchId: 'watch-' + index })
  }
  await rejected(() => client.request('watch.open', SPEC.session, { watchId: 'watch-overflow' }))
  await client.request('watch.close', SPEC.session, { watchId: 'watch-0' })
  assert.equal(f.calls.watch[0].closed, true)
  await client.request('watch.open', SPEC.session, { watchId: 'watch-reused' })
  client.close()
  assert.ok(f.calls.watch.every(watch => watch.closed), 'all connection-bound watches disposed')
})

test('PROTO-04 connection limit releases when a client disconnects', async t => {
  const f = fixture(t), first = await f.attach(), second = await f.attach()
  await rejected(() => f.attach())
  first.close()
  const replacement = await f.attach()
  await status(replacement)
  second.close()
})

function statusEnvelope(overrides = {}) {
  return { version: 1, hostId: SPEC.host, sessionId: SPEC.session, requestId: 'raw-request',
    type: 'request', operation: 'session.status', payload: {}, ...overrides }
}

for (const overrides of [{ version: 0 }, { version: 2 }, { hostId: SPEC.otherHost },
  { sessionId: null }, { requestId: '' }, { type: 'unknown' }, { operation: 'model.call' }, { extra: true }]) {
  test('PROTO-03 codec rejects wrong version/host/schema before dispatch', () => {
    assert.throws(() => decodeEnvelope(JSON.stringify(statusEnvelope(overrides)), SPEC.limits, SPEC.host))
  })
}

test('PROTO-04 wire bound is UTF-8 bytes at exactly maximum and one over', () => {
  const envelope = statusEnvelope()
  const serialized = JSON.stringify(envelope)
  const length = Buffer.byteLength(serialized)
  const exact = { ...SPEC.limits, maxEnvelopeBytes: length }
  assert.deepEqual(decodeEnvelope(encodeEnvelope(envelope, exact, SPEC.host), exact, SPEC.host), envelope)
  assert.throws(() => decodeEnvelope(serialized, { ...exact, maxEnvelopeBytes: length - 1 }, SPEC.host))
  const unicode = statusEnvelope({ operation: 'message.send', payload: { messageId: 'unicode-id', text: '界' } })
  const text = JSON.stringify(unicode)
  assert.ok(Buffer.byteLength(text) > text.length)
  assert.throws(() => decodeEnvelope(text, { ...SPEC.limits, maxEnvelopeBytes: text.length }, SPEC.host))
})

test('PROTO-03 codec rejects nonserializable authority objects', () => {
  const cyclic = statusEnvelope()
  cyclic.payload.cycle = cyclic
  assert.throws(() => encodeEnvelope(cyclic, SPEC.limits, SPEC.host))
  assert.throws(() => decodeEnvelope('null', SPEC.limits, SPEC.host))
  assert.throws(() => decodeEnvelope('[]', SPEC.limits, SPEC.host))
  assert.throws(() => decodeEnvelope('{broken', SPEC.limits, SPEC.host))
})

test('PROTO-01 watch notifications carry host/version and stop after disconnect', async t => {
  const f = fixture(t), client = await f.attach(), next = deferred(), events = []
  client.onEvent(event => { events.push(event); next.resolve(event) })
  await client.request('watch.open', SPEC.session, { watchId: 'observed-watch' })
  f.calls.watch[0].emit({ state: 'running', lastSequence: 1 })
  const event = await bounded(next.promise, 'watch status notification missing')
  assert.equal(event.hostId, SPEC.host)
  assert.equal(event.version, 1)
  assert.equal(event.type, 'event')
  assert.equal(event.operation, 'watch.status')
  assert.equal(event.payload.watchId, 'observed-watch')
  assert.deepEqual(event.payload.status, { state: 'running', lastSequence: 1 })
  client.close()
  f.calls.watch[0].emit({ state: 'closed', lastSequence: 2 })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(events.length, 1)
})

test('PROTO-01 missing required capability prevents readiness', async t => {
  const f = fixture(t)
  await rejected(() => f.attach({ requiredCapabilities: ['model.call'] }))
  assert.deepEqual(f.calls.deliver, [])
})

test('PROTO-04 inflight capacity rejects one over and releases after settlement', async t => {
  const pending = [], started = deferred()
  const f = fixture(t, { getStatus: () => {
    const request = deferred()
    pending.push(request)
    if (pending.length === SPEC.limits.maxInflight) started.resolve()
    return request.promise
  } })
  const client = await f.attach()
  const requests = Array.from({ length: SPEC.limits.maxInflight }, () => status(client))
  await bounded(started.promise, 'capacity requests did not reach host')
  await rejected(() => status(client))
  for (const request of pending) request.resolve(SPEC.status)
  await Promise.all(requests)
  const resumed = status(client)
  await new Promise(resolve => setImmediate(resolve))
  pending.at(-1).resolve(SPEC.status)
  await resumed
})

test('AUTH-03 disconnect aborts a pending delivery and rejects old client reuse', async t => {
  const started = deferred(), completion = deferred()
  const f = fixture(t, { deliverMessage: input => { started.resolve(input); return completion.promise } })
  const client = await f.attach()
  const request = send(client)
  const failure = rejected(() => request)
  const context = await bounded(started.promise, 'host delivery did not begin')
  client.close()
  await failure
  assert.equal(context.signal.aborted, true, 'connection-bound work must invalidate immediately')
  await rejected(() => status(client))
  completion.resolve({ status: 'unconfirmed' })
})


test('PROTO-01 welcome and immediately adjacent valid event are processed in one carrier callback batch', async t => {
  const f = fixture(t), [hostCarrier, rawClientCarrier] = carrierPair([])
  const next = deferred()
  const event = encodeEnvelope({ version: 1, hostId: SPEC.host, sessionId: SPEC.session, requestId: randomUUID(), type: 'event', operation: 'approval.request', payload: {
    approvalId: SPEC.approval + 'adjacent', offerId: randomUUID(), kind: 'approval', prompt: SPEC.prompt,
    choices: SPEC.choices, expiresAt: Date.now() + 60000,
  } }, SPEC.limits, SPEC.host)
  const clientCarrier = { ...rawClientCarrier, onMessage(listener) {
    return rawClientCarrier.onMessage(text => {
      listener(text)
      const value = JSON.parse(text)
      if (value.type === 'response' && value.operation === 'handshake') listener(event)
    })
  } }
  const connection = f.host.attach(hostCarrier, { connectionId: 'adjacent-events', principalId: SPEC.principal })
  const client = createControlClient({ hostId: SPEC.host, limits: SPEC.limits })
  t.after(() => { client.close(); connection.close() })
  client.onEvent(value => next.resolve(value))
  await client.attach(clientCarrier)
  assert.equal((await bounded(next.promise, 'adjacent approval event was lost')).operation, 'approval.request')
  assert.deepEqual(await status(client), SPEC.status, 'valid same-batch event cannot invalidate ready connection')
})

test('PROTO-04 aggregate approval-list bytes reject overflow before accepted offers become inaccessible', async t => {
  const boundary = { ...SPEC.limits, maxEnvelopeBytes: 65536 }
  const f = fixture(t, { limits: boundary }), prompt = 'p'.repeat(40000)
  registerApproval(f, 'large-first', { prompt })
  assert.throws(() => registerApproval(f, 'large-second', { prompt }), 'second descriptor would overflow non-paginated approval.list')
  const client = await f.attach({ limits: boundary })
  const { approvals } = await listApprovals(client)
  assert.equal(approvals.length, 1)
  assert.equal(approvals[0].approvalId, SPEC.approval + 'large-first')
  assert.equal(approvals[0].prompt, prompt)
  await answerApproval(client, approvals[0])
  assert.equal(f.calls.answers.length, 1)
  assert.deepEqual(await status(client), SPEC.status)
})
