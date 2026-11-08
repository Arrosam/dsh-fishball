/**
 * W0 / X0-W — the scoped bridge and attention (X12, X8).
 *
 * Observation points: the fake main host's frame log, the handshake count (no new handshake),
 * and the attention frames the child sends on set, reconnect and dispose.
 *
 * Techniques: EP, DT, ST, P. Every case names its X point.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootChild, contract } from '../support/instance-ext.mjs'

const WATCHDOG = 'fishball-watchdog'
const ATTENTION = 'instance.attention'

const OPERATIONS = Object.keys(contract.OPERATIONS)

async function live(t, { capabilities } = {}) {
  const h = await bootChild(t, { activate: true })
  if (capabilities !== undefined) await h.reconnect({ capabilities })
  return { h, service: h.requireInstance() }
}

const attentionFrames = (h) => h.host.requests.filter((request) => request.operation === ATTENTION)

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
    const client = service.bridge(WATCHDOG, ['session.read'])
    assert.equal(typeof client.request, 'function')
    const result = await client.request('session.read', { sessionId: 's1', maxMessages: 1, maxBytes: 1 })
    assert.deepEqual(result, { messages: [], truncated: false })
    assert.equal(h.host.handshakes.length, handshakes, 'the client reuses the one handshake')
    assert.ok(h.host.requests.some((request) => request.operation === 'session.read'))
  })

  it('XW-EP-01 an operation outside the scope list is refused forbidden, locally', async (t) => {
    const { h, service } = await live(t)
    const client = service.bridge(WATCHDOG, ['session.read'])
    const before = h.host.requests.length
    assert.equal(await refusalOf(() => client.request('session.message', { sessionId: 's1', message: 'x', attachments: [] })), 'forbidden')
    assert.equal(h.host.requests.length, before, 'nothing reached the connector')
  })

  it('XW-EP-02 a scope list outside the instance required set is refused before any client exists', async (t) => {
    const { h, service } = await live(t)
    const before = h.host.requests.length
    const value = await refusalOf(() => service.bridge(WATCHDOG, ['attachment.read']))
    assert.ok(value !== undefined, 'the request is refused')
    assert.equal(h.host.requests.length, before, 'no request reached the connector')
  })

  it('XW-EP-03 two scoped clients are independent', async (t) => {
    const { h, service } = await live(t)
    const read = service.bridge(WATCHDOG, ['session.read'])
    const stop = service.bridge(WATCHDOG, ['session.stop'])
    assert.deepEqual(await read.request('session.read', { sessionId: 's1', maxMessages: 1, maxBytes: 1 }), { messages: [], truncated: false })
    assert.deepEqual(await stop.request('session.stop', { sessionId: 's1' }), { stopped: true })
    assert.equal(await refusalOf(() => stop.request('session.read', { sessionId: 's1', maxMessages: 1, maxBytes: 1 })), 'forbidden')
  })
})

describe('X0-W X8 attention', () => {
  it('XW-DT-01 with the capability, set sends the value at once', async (t) => {
    const { h, service } = await live(t, { capabilities: [...OPERATIONS, ATTENTION] })
    service.attention.set('fishball-fold-notify', { unread: 3, importantUnread: 1, latestAt: 1_700_000_000_123 })
    const frames = attentionFrames(h)
    assert.equal(frames.length, 1, 'one attention frame')
    assert.deepEqual(frames[0].payload, { unread: 3, importantUnread: 1, latestAt: 1_700_000_000_123 })
  })

  it('XW-DT-02 without the capability, nothing is sent', async (t) => {
    const { h, service } = await live(t)
    // Reconnect with a welcome that omits the new capability.
    await h.reconnect({ capabilities: OPERATIONS.filter((operation) => operation !== ATTENTION) })
    service.attention.set('fishball-fold-notify', { unread: 1, importantUnread: 0, latestAt: null })
    assert.equal(attentionFrames(h).length, 0)
  })

  it('XW-ST-01 none → value → reconnect (same value again) → dispose {0,0,null}', async (t) => {
    const { h, service } = await live(t)
    await h.reconnect({ capabilities: [...OPERATIONS, ATTENTION] })
    assert.equal(attentionFrames(h).length, 0, 'nothing before a value')
    const dispose = service.attention.set('fishball-fold-notify', { unread: 5, importantUnread: 2, latestAt: 10 })
    assert.equal(attentionFrames(h).length, 1)
    await h.reconnect({ capabilities: [...OPERATIONS, ATTENTION] })
    assert.equal(attentionFrames(h).length, 2, 'the same value is sent after every handshake')
    assert.deepEqual(attentionFrames(h)[1].payload, { unread: 5, importantUnread: 2, latestAt: 10 })
    dispose()
    assert.equal(attentionFrames(h).length, 3)
    assert.deepEqual(attentionFrames(h)[2].payload, { unread: 0, importantUnread: 0, latestAt: null })
  })

  it('XW-P-02 a second attention owner gets owner-busy', async (t) => {
    const { service } = await live(t)
    const first = service.attention.set('fishball-fold-notify', { unread: 1, importantUnread: 0, latestAt: null })
    assert.equal(typeof first, 'function')
    const second = service.attention.set('fishball-board', { unread: 2, importantUnread: 0, latestAt: null })
    assert.deepEqual(second, { code: 'owner-busy' })
    first()
  })

  it('XW-P-03 attention is never in the instance required capabilities', async (t) => {
    const { h } = await live(t)
    const required = h.host.handshakes.at(-1)?.payload?.requiredCapabilities ?? []
    assert.equal(required.includes(ATTENTION), false, 'the instance must not require it (a 1.1 connector still attaches)')
  })
})
