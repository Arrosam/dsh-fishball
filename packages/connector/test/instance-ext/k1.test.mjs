/**
 * W0 / K1 — connector contract 1.2 and the `state.unread` view.
 *
 * Source: docs/plugins/instance-extension-points.md §3 (the two additions), fold-notify §6a and
 * §9.1 (exact files and payload), and docs/connector-contract.md. The connector is the owner:
 * `instance.attention` is a child→main request with capability `instance.attention`; the
 * connector's state view is `unread = {count, important}`.
 *
 * Observation points: the contract's own exports and validators, the host bridge's capabilities
 * and wire answers, and the connector's real state endpoint on the H-STUB harness (a real DSH
 * boot with a stub instance; the only place `state.unread` is observable end to end).
 *
 * Techniques: P, EP, DT, ST, BVA.
 */
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { loadConnector } from '../../../../test/support/body-soul-env.mjs'

// The H-STUB homes must stay under /private/tmp (the W0 rule); os.tmpdir() is read when the
// harness loads, so set it before the dynamic import below.
process.env.TMPDIR = process.env.FBTEST_STUB_TMP ?? '/private/tmp'

const contract = await loadConnector('contract/index.js')
const { CONNECTOR_CONTRACT, ENVELOPE, ENVELOPE: { type }, LIMITS, OPERATION, SIDE, checkHandshake, decodeEnvelope, encodeEnvelope, makeEnvelope, negotiateContract, validateRequest, validateResponse } = contract
const ATTENTION = 'instance.attention'

const VALID = Object.freeze({ unread: 3, importantUnread: 1, latestAt: 1_700_000_000_123 })

function requestFrame(payload, { operation = ATTENTION, sessionId = null, requestId = 'k1-1' } = {}) {
  return makeEnvelope('host-k1', sessionId, requestId, ENVELOPE.type.request, operation, payload)
}

describe('K1 contract 1.2 (§3)', () => {
  it('K1-P-01 the connector contract is still major 1, now minor 2', () => {
    assert.equal(CONNECTOR_CONTRACT.id, 'fishball-connector')
    assert.equal(CONNECTOR_CONTRACT.major, 1)
    assert.equal(CONNECTOR_CONTRACT.minor, 2)
  })

  it('K1-P-02 LIMITS.unreadMax is 9999', () => {
    assert.equal(LIMITS.unreadMax, 9999)
  })

  it('K1-P-03 instance.attention exists, is child→main and is not session-scoped', () => {
    assert.equal(OPERATION.instanceAttention, ATTENTION)
    assert.deepEqual(contract.OPERATIONS[ATTENTION], { direction: 'child-to-main', sessionScoped: false })
  })

  it('K1-P-04 a valid attention request and its accepted response validate and round-trip', () => {
    assert.doesNotThrow(() => validateRequest(ATTENTION, VALID))
    assert.doesNotThrow(() => validateResponse(ATTENTION, { accepted: true }))
    const encoded = encodeEnvelope(requestFrame(VALID), 'host-k1')
    const decoded = decodeEnvelope(encoded, { receivingSide: SIDE.main, expectedHostId: 'host-k1' })
    assert.deepEqual(decoded.payload, VALID)
  })

  it('K1-EP-01 a malformed attention payload is refused', () => {
    assert.equal(OPERATION.instanceAttention, ATTENTION, 'the operation exists first')
    const malformed = [
      {},
      { unread: 3, importantUnread: 1 },
      { unread: 3, importantUnread: 1, latestAt: null, extra: true },
      { unread: '3', importantUnread: 1, latestAt: null },
      { unread: 3, importantUnread: '1', latestAt: null },
      { unread: 1, importantUnread: 2, latestAt: null },
      { unread: -1, importantUnread: 0, latestAt: null },
      { unread: 0, importantUnread: 0, latestAt: 1.5 },
    ]
    for (const payload of malformed) assert.throws(() => validateRequest(ATTENTION, payload), JSON.stringify(payload))
  })

  it('K1-BVA-01 unread −1, 0, 1, 9999 and 10000', () => {
    for (const unread of [0, 1, 9999]) {
      assert.doesNotThrow(() => validateRequest(ATTENTION, { unread, importantUnread: 0, latestAt: null }), 'unread ' + unread)
    }
    for (const unread of [-1, 10_000]) {
      assert.throws(() => validateRequest(ATTENTION, { unread, importantUnread: 0, latestAt: null }), 'unread ' + unread)
    }
  })

  it('K1-BVA-02 importantUnread 0, = unread, unread+1 and −1', () => {
    assert.doesNotThrow(() => validateRequest(ATTENTION, { unread: 5, importantUnread: 0, latestAt: null }))
    assert.doesNotThrow(() => validateRequest(ATTENTION, { unread: 5, importantUnread: 5, latestAt: null }))
    assert.throws(() => validateRequest(ATTENTION, { unread: 5, importantUnread: 6, latestAt: null }))
    assert.throws(() => validateRequest(ATTENTION, { unread: 5, importantUnread: -1, latestAt: null }))
  })

  it('K1-BVA-03 latestAt is null, 0 or an epoch-ms integer; a float is refused', () => {
    assert.doesNotThrow(() => validateRequest(ATTENTION, { unread: 1, importantUnread: 0, latestAt: null }))
    assert.doesNotThrow(() => validateRequest(ATTENTION, { unread: 1, importantUnread: 0, latestAt: 0 }))
    assert.doesNotThrow(() => validateRequest(ATTENTION, { unread: 1, importantUnread: 0, latestAt: 1_700_000_000_123 }))
    assert.throws(() => validateRequest(ATTENTION, { unread: 1, importantUnread: 0, latestAt: 1.5 }))
  })

  it('K1-DT-01 a 1.1 instance still attaches; the common minor is the lower one', () => {
    assert.deepEqual(negotiateContract({ id: 'fishball-connector', major: 1, minor: 1 }), { id: 'fishball-connector', major: 1, minor: 1 })
    assert.deepEqual(negotiateContract({ id: 'fishball-connector', major: 1, minor: 2 }), { id: 'fishball-connector', major: 1, minor: 2 })
    assert.throws(() => negotiateContract({ id: 'fishball-connector', major: 2, minor: 2 }))
  })

  it('K1-EP-02 attention is an added capability, never one the connector requires', () => {
    assert.equal(OPERATION.instanceAttention, ATTENTION, 'the operation exists first')
    const served = [OPERATION.inboxPush]
    assert.doesNotThrow(() => checkHandshake({ capabilities: [OPERATION.inboxPush, ATTENTION], requiredCapabilities: [] }, served))
    assert.throws(() => checkHandshake({ capabilities: [OPERATION.inboxPush], requiredCapabilities: [ATTENTION] }, served))
  })
})

describe('K1 host bridge serves instance.attention', () => {
  const SESSIONS = Object.freeze({
    enabled: () => true, managedIds: () => [], isManaged: () => false, isFishball: () => false,
    isRelated: async () => false, describe: async () => undefined, workspaces: () => [],
    resolveWorkspacePath: async () => undefined,
    start: async () => ({ sessionId: 's', managed: false }), message: async () => ({ status: 'delivered' }),
    redirect: async () => ({ status: 'delivered' }), stop: async () => ({ stopped: true }),
    read: async () => ({ messages: [], truncated: false }), watch: async () => ({ watchId: 'w' }),
    watches: async () => [], unwatch: async () => ({}), release: async () => ({}),
  })

  function childTransport() {
    const sent = []
    let receive
    return {
      sent,
      transport: {
        send: (encoded) => sent.push(encoded),
        onMessage: (fn) => { receive = fn; return () => { receive = undefined } },
        onClose: () => () => {},
        close() {},
      },
      deliver: (frame) => receive?.(encodeEnvelope(frame, 'host-k1')),
    }
  }

  it('K1-P-05 the host advertises the operation and answers a valid frame accepted', async () => {
    const { createBridgeHost } = await loadConnector('src/slim/host/bridge.js')
    const host = createBridgeHost({ hostId: 'host-k1', sessions: SESSIONS })
    assert.ok(host.capabilities.includes(ATTENTION), 'the welcome lists instance.attention')
    const child = childTransport()
    host.attach(child.transport)
    child.deliver(makeEnvelope('host-k1', null, 'hello-1', type.request, 'handshake', { capabilities: [OPERATION.inboxPush], requiredCapabilities: [] }))
    const welcome = JSON.parse(child.sent.at(-1))
    assert.equal(welcome.type, type.response)
    assert.ok(welcome.payload.capabilities.includes(ATTENTION))
    child.deliver(requestFrame(VALID, { requestId: 'att-1' }))
    const answer = JSON.parse(child.sent.at(-1))
    assert.equal(answer.type, type.response)
    assert.deepEqual(answer.payload, { accepted: true })
    host.close()
  })

  it('K1-EP-03 an invalid attention frame is an error and the connection remains usable for the next valid one', async () => {
    const { createBridgeHost } = await loadConnector('src/slim/host/bridge.js')
    const host = createBridgeHost({ hostId: 'host-k1', sessions: SESSIONS })
    const child = childTransport()
    host.attach(child.transport)
    child.deliver(makeEnvelope('host-k1', null, 'hello-2', type.request, 'handshake', { capabilities: [OPERATION.inboxPush], requiredCapabilities: [] }))
    child.deliver(requestFrame({ unread: 10_000, importantUnread: 0, latestAt: null }, { requestId: 'bad-1' }))
    const bad = JSON.parse(child.sent.at(-1))
    assert.equal(bad.type, type.error)
    child.deliver(requestFrame(VALID, { requestId: 'good-1' }))
    const good = JSON.parse(child.sent.at(-1))
    assert.equal(good.type, type.response)
    assert.deepEqual(good.payload, { accepted: true })
    host.close()
  })
})

describe('K1 connector state.unread (H-STUB, real DSH boot)', () => {
  after(async () => {
    process.env.TMPDIR = process.env.FBTEST_STUB_TMP ?? '/private/tmp'
  })

  it('K1-ST-01 unread follows the last valid value; detach and close reset it to {0,false}', async (t) => {
    const { bootStub, stopStub } = await import('../../../../test/support/instance-stub.mjs')
    const booted = await bootStub('k1-unread')
    t.after(() => stopStub(booted))
    const { host, stub } = booted
    assert.deepEqual((await host.state()).unread, { count: 0, important: false }, 'no report yet')

    const first = await stub.op(ATTENTION, VALID)
    assert.equal(first.type, 'response')
    assert.deepEqual(first.payload, { accepted: true })
    assert.deepEqual((await host.state()).unread, { count: 3, important: true })

    const newer = await stub.op(ATTENTION, { unread: 5, importantUnread: 0, latestAt: 1_700_000_000_999 })
    assert.equal(newer.type, 'response')
    assert.deepEqual(newer.payload, { accepted: true })
    assert.deepEqual((await host.state()).unread, { count: 5, important: false })

    const invalid = await stub.op(ATTENTION, { unread: 10_000, importantUnread: 0, latestAt: null })
    assert.equal(invalid.type, 'error', 'the invalid frame is refused')
    assert.deepEqual((await host.state()).unread, { count: 5, important: false }, 'the last valid value stays')

    await stub.detach()
    assert.deepEqual((await host.state()).unread, { count: 0, important: false }, 'detach')
    await stub.attach()
    assert.deepEqual((await host.state()).unread, { count: 0, important: false }, 'reattach stays zero until a report')
    await stub.op(ATTENTION, { unread: 7, importantUnread: 2, latestAt: 1_700_000_001_000 })
    assert.deepEqual((await host.state()).unread, { count: 7, important: true }, 'the child reports the current value again')
    // Transport loss is a different lifecycle event from an explicit detach.
    await stub.fireClose()
    assert.deepEqual((await host.state()).unread, { count: 0, important: false }, 'transport close resets unread while the host remains observable')
  })
})
