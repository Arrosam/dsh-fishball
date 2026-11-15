/**
 * W0 / X0-W — the scoped bridge and attention (X12, X8).
 *
 * Observation points: the fake main host's frame log, the handshake count (no new handshake),
 * and stateless attention frames on signal, reconnect and dispose.
 *
 * Techniques: EP, DT, ST, P. Every case names its X point.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootChild, contract } from '../support/instance-ext.mjs'

// Any plugin id: the scoped bridge and attention.signal take the caller's id as given (X12, X8).
const PLUGIN = 'fbtest-plugin'
const ATTENTION = 'attention.signal'
const TIMERFREE = 'interaction.timerfree'
const ACCEPTED = Object.freeze({ accepted: true })

const OPERATIONS = [...Object.keys(contract.OPERATIONS), TIMERFREE]

async function live(t, { capabilities } = {}) {
  const h = await bootChild(t, { activate: true })
  if (capabilities !== undefined) await h.reconnect({ capabilities })
  h.host.responses.set(ATTENTION, ACCEPTED)
  return { h, service: h.requireInstance() }
}

const attentionFrames = (h) => h.host.requests.filter((request) => request.operation === ATTENTION)
// Raw capture precedes validation: malformed replay/clear frames must not disappear from negative assertions.
const attentionWire = (host) => host.raw.filter((frame) => frame.operation === ATTENTION)

/** The scoped client's refusal shape: forbidden, locally, never a wire request. */
async function refusalOf(run) {
  try {
    const value = await run()
    return value?.code ?? value
  } catch (error) {
    return error?.code ?? error?.name
  }
}

describe('X0-W X12 scoped bridge', () => {
  it('XW-P-01 an operation in the scope list reaches the host, with no new handshake', async (t) => {
    const { h, service } = await live(t)
    const handshakes = h.host.handshakes.length
    const client = service.bridge(PLUGIN, ['session.read'])
    assert.equal(typeof client.request, 'function')
    const result = await client.request('session.read', { sessionId: 's1', maxMessages: 1, maxBytes: 1 })
    assert.deepEqual(result, { messages: [], truncated: false })
    assert.equal(h.host.handshakes.length, handshakes, 'the client reuses the one handshake')
    assert.ok(h.host.requests.some((request) => request.operation === 'session.read'))
  })

  it('XW-EP-01 an operation outside the scope list is refused forbidden, locally', async (t) => {
    const { h, service } = await live(t)
    const client = service.bridge(PLUGIN, ['session.read'])
    const before = h.host.requests.length
    assert.equal(await refusalOf(() => client.request('session.message', { sessionId: 's1', message: 'x', attachments: [] })), 'forbidden')
    assert.equal(h.host.requests.length, before, 'nothing reached the connector')
  })

  it('XW-EP-02 a scope list outside the instance required set is refused before any client exists', async (t) => {
    const { h, service } = await live(t)
    const before = h.host.requests.length
    const value = await refusalOf(() => service.bridge(PLUGIN, ['attachment.read']))
    assert.ok(value !== undefined, 'the request is refused')
    assert.equal(h.host.requests.length, before, 'no request reached the connector')
  })

  it('XW-EP-03 two scoped clients are independent', async (t) => {
    const { h, service } = await live(t)
    const read = service.bridge(PLUGIN, ['session.read'])
    const stop = service.bridge(PLUGIN, ['session.stop'])
    assert.deepEqual(await read.request('session.read', { sessionId: 's1', maxMessages: 1, maxBytes: 1 }), { messages: [], truncated: false })
    assert.deepEqual(await stop.request('session.stop', { sessionId: 's1' }), { stopped: true })
    assert.equal(await refusalOf(() => stop.request('session.read', { sessionId: 's1', maxMessages: 1, maxBytes: 1 })), 'forbidden')
  })
})

describe('X0-W X8 stateless attention', () => {
  it('XW-DT-01 with the capability, signal sends only importance and acknowledges acceptance', async (t) => {
    const { h, service } = await live(t, { capabilities: OPERATIONS })
    assert.deepEqual(await service.attention.signal(PLUGIN, { important: true }), ACCEPTED)
    const frames = attentionFrames(h)
    assert.equal(frames.length, 1, 'one attention frame')
    assert.deepEqual(frames[0].payload, { important: true })
  })

  it('XW-DT-02 without the capability, signal is refused and nothing is sent', async (t) => {
    const { h, service } = await live(t, { capabilities: OPERATIONS.filter((operation) => operation !== ATTENTION) })
    assert.equal(await refusalOf(() => service.attention.signal(PLUGIN, { important: false })), 'unsupported-operation')
    assert.equal(attentionWire(h.host).length, 0)
  })

  it('XW-ST-01 none → signal → reconnect without replay → dispose without clear', async (t) => {
    const { h, service } = await live(t, { capabilities: OPERATIONS })
    assert.equal(attentionWire(h.host).length, 0, 'nothing before a signal')
    assert.deepEqual(await service.attention.signal(PLUGIN, { important: true }), ACCEPTED)
    const original = h.host
    assert.equal(attentionFrames(h).length, 1)
    await h.reconnect({ capabilities: OPERATIONS })
    assert.equal(attentionWire(h.host).length, 0, 'new transport gets no replay or synthetic clear')
    const reconnected = h.host
    await h.close()
    for (const host of [original, reconnected]) {
      const payloads = attentionWire(host).map((frame) => frame.payload)
      assert.deepEqual(payloads, host === original ? [{ important: true }] : [], 'dispose adds no zero/clear signal')
    }
  })

  // XW-P-02 retired: stateless signal has no exclusive unread owner or unset disposer.
  it('XW-P-03 attention is optional while timerfree interactions are required', async (t) => {
    const { h } = await live(t, { capabilities: OPERATIONS.filter((operation) => operation !== ATTENTION) })
    const required = h.host.handshakes.at(-1)?.payload?.requiredCapabilities
    assert.ok(required, 'the instance sent its handshake')
    assert.equal(required.includes(ATTENTION), false)
    assert.equal(required.includes(TIMERFREE), true, 'built-in requires explicit timerfree semantics, not a minor number')
    assert.equal(h.bridge.status.ready, true, 'attention absence does not prevent attachment')
  })
})
