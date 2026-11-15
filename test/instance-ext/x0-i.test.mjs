/**
 * W0 / X0-I — inbox delivery (X9): an item nothing claims is delivered straight to the manager.
 * V3 drops the claim, batcher, release and permission-marker cases with the plugins that
 * consumed them (REMOVE-WD, design §1.0); only the core-delivery cases XI-EP-01/02 stay.
 *
 * Observation points: the items the fake main host pushes and the child's ack frame, and the
 * turns the manager agent gets.
 *
 * Techniques: EP. Every case names its X point.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootChild, messageText } from '../support/instance-ext.mjs'

async function live(t) {
  const h = await bootChild(t, { activate: true })
  return { h, service: h.requireInstance() }
}

/** Push one item and wait a tick so the child's pipeline can finish before the assertions. */
async function push(h, item) {
  const frame = await h.host.inbox(item)
  await new Promise((resolve) => setTimeout(resolve, 20))
  return frame
}

const acked = (frame) => frame?.type === 'response' && frame?.payload?.acked === true
const textOf = (h) => h.manager().followups.map(messageText).join('\n')

describe('X0-I inbox pipeline: direct delivery (X9)', () => {
  it('XI-EP-01 an unclaimed ordinary item is delivered directly', async (t) => {
    const { h } = await live(t)
    const frame = await push(h, { kind: 'user', text: 'plain user note' })
    assert.equal(acked(frame), true)
    assert.match(textOf(h), /plain user note/)
  })

  it('XI-EP-02 every contract item kind reaches the manager when nothing claims it', async (t) => {
    const { h } = await live(t)
    const kinds = ['session', 'user', 'system', 'watch', 'approval', 'plugin']
    for (const kind of kinds) await push(h, { kind, text: 'item-' + kind })
    const text = textOf(h)
    for (const kind of kinds) assert.match(text, new RegExp('item-' + kind), 'the ' + kind + ' item is delivered')
  })
})
