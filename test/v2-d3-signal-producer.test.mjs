/** D3 producer behavior through existing in-process public service fixture.
 * No implementation inspection; the fake host records real outbound requests.
 * Semantic capability is explicitly supplied: old fixture defaults are legacy.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootChild, contract } from './support/instance-ext.mjs'

const C = Object.freeze({
  // Any plugin id: attention.signal takes the caller's id as given (X8).
  owner: 'fbtest-plugin', signal: 'attention.signal', semantic: 'interaction.timerfree',
  accepted: Object.freeze({ accepted: true }),
})
const capabilities = (signal) => [
  ...Object.keys(contract.OPERATIONS).filter((operation) => operation !== C.signal),
  C.semantic, ...(signal ? [C.signal] : []),
]
const frames = (h) => h.host.requests.filter((request) => request.operation === C.signal)
async function ready(t, signal = true) {
  const h = await bootChild(t)
  await h.reconnect({ capabilities: capabilities(signal) })
  h.host.responses.set(C.signal, C.accepted)
  return h
}

describe('V2 D3 stateless optional signal producer', () => {
  for (const important of [false, true]) {
    it(`D3-PRODUCER-${important} sends only importance, not counts or timestamps`, async (t) => {
      const h = await ready(t)
      await h.requireInstance().attention.signal(C.owner, { important })
      assert.equal(frames(h).length, 1)
      assert.deepEqual(frames(h)[0].payload, { important })
    })
  }
  it('D3-PRODUCER-OPTIONAL absent capability emits no wire request', async (t) => {
    const h = await ready(t, false)
    // Optionality specifies no wire signal, not whether the caller receives a local refusal.
    await Promise.resolve().then(() => h.requireInstance().attention.signal(C.owner, { important: true })).catch(() => {})
    assert.equal(frames(h).length, 0)
  })
  it('D3-PRODUCER-RECONNECT does not replay prior important signal', async (t) => {
    const h = await ready(t)
    await h.requireInstance().attention.signal(C.owner, { important: true })
    assert.equal(frames(h).length, 1)
    await h.reconnect({ capabilities: capabilities(true) })
    assert.equal(frames(h).length, 0, 'new transport gets no replay or synthesized clearing frame')
  })
})
