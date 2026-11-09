/** D3 connector boolean projection through public attachment/transport boundaries.
 * Factory/fixture signatures supplied by coordinator; no implementation read.
 */
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { loadConnector } from './support/body-soul-env.mjs'
const { provideConnectorService } = await loadConnector('src/connector-service.js')
const contract = await loadConnector('contract/index.js')
const C = Object.freeze({ signal: 'attention.signal', semantic: 'interaction.timerfree', id: 'd3-fixture', name: 'D3 fixture' })
function fixture(t) {
  const cleanups = []
  let service
  const ctx = { sessions: {}, sessionController: {}, agents: {}, workspaceRegistry: { list: () => [] }, on: () => () => {}, get() {}, provide(name, value) { service = value }, effect(fn) { const dispose = fn(); if (typeof dispose === 'function') cleanups.push(dispose) }, logger: () => ({ warn() {} }) }
  const connector = { ...provideConnectorService(ctx, { onChange() {} }), get service() { return service } }
  t.after(() => { for (const dispose of cleanups.reverse()) dispose() })
  return connector
}
function attach(connector) {
  let receive
  const outbound = []
  const transport = { send: (encoded) => outbound.push(JSON.parse(encoded)), onMessage(fn) { receive = fn; return () => {} }, onClose() { return () => {} }, close() {} }
  const handle = connector.service.attachInstance({ id: C.id, name: C.name, contract: { ...contract.CONNECTOR_CONTRACT }, transport })
  let sequence = 0
  function request(operation, payload) {
    const id = 'd3-request-' + (++sequence)
    const frame = contract.makeEnvelope(C.id, null, id, contract.ENVELOPE.type.request, operation, payload)
    receive(contract.encodeEnvelope(frame, C.id))
    return outbound.find((entry) => entry.requestId === id)
  }
  return { handle, request, outbound }
}
it('D3-CONNECTOR-LATCH normal→important→normal stays sticky; page clear resets both', async (t) => {
  const connector = fixture(t)
  assert.deepEqual(connector.attention(), { count: 0, important: false })
  const peer = attach(connector)
  peer.request(contract.ENVELOPE.handshake, { requiredCapabilities: [C.semantic], capabilities: [C.semantic, C.signal, 'inbox.push'] })
  await new Promise(setImmediate)
  assert.equal(peer.outbound.at(-1)?.type, contract.ENVELOPE.type.response, JSON.stringify(peer.outbound))
  for (const [important, expected] of [[false, false], [true, true], [false, true]]) {
    peer.request(C.signal, { important })
    await new Promise(setImmediate)
    assert.deepEqual(peer.outbound.at(-1)?.payload, { accepted: true }, JSON.stringify(peer.outbound))
    assert.deepEqual(connector.attention(), { count: 1, important: expected })
  }
  connector.clearAttention()
  assert.deepEqual(connector.attention(), { count: 0, important: false })
  peer.request(C.signal, { important: true })
  await new Promise(setImmediate)
  assert.deepEqual(connector.attention(), { count: 1, important: true })
  peer.handle.detach()
  assert.deepEqual(connector.attention(), { count: 0, important: false })
  const next = attach(connector)
  next.request(contract.ENVELOPE.handshake, { requiredCapabilities: [C.semantic], capabilities: [C.semantic, C.signal, 'inbox.push'] })
  await new Promise(setImmediate)
  next.request(C.signal, { important: false })
  await new Promise(setImmediate)
  peer.handle.detach()
  assert.deepEqual(connector.attention(), { count: 1, important: false }, 'stale detach cannot clear replacement attachment')
  next.handle.detach()
})
