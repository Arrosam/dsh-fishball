/**
 * W0 / X0-I — one inbox pipeline (X9): claims first, then the batcher, then deliverInbox;
 * release re-enters after the claims; the permission-request marker.
 *
 * Observation points: the items the fake main host pushes and the child's ack/refusal frame,
 * the claim and batcher callbacks the service hands back, and the turns the manager agent gets.
 *
 * Techniques: EP, DT, ST, BVA, P. Every case names its X point.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootChild, messageText, until } from '../support/instance-ext.mjs'
import { loadCore } from '../support/body-soul-env.mjs'

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

describe('X0-I inbox pipeline: claims, batcher, direct delivery (X9)', () => {
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

  it('XI-DT-01 a claimed item goes to its claimant, is acked at once and starts no turn', async (t) => {
    const { h, service } = await live(t)
    const seen = []
    const dispose = service.inbox.claim({
      pluginId: 'fishball-watchdog',
      kind: 'approval',
      match: () => 'approval-key-1',
    }, (item, key) => { seen.push({ item, key }) })
    const frame = await push(h, { kind: 'approval', text: '[permission request apr_1] allow?' })
    assert.equal(acked(frame), true, 'a claimed item is acked at once')
    assert.equal(seen.length, 1)
    assert.equal(seen[0].key, 'approval-key-1')
    assert.equal(textOf(h), '', 'the claimant owns the item; the chat did not deliver it')
    dispose()
  })

  it('XI-DT-02 an item whose claim does not match falls through to the batcher', async (t) => {
    const { h, service } = await live(t)
    const claimed = []
    service.inbox.claim({
      pluginId: 'fishball-watchdog',
      kind: 'approval',
      match: (item) => (item.text.includes('apr_1') ? 'apr_1' : undefined),
    }, (item, key) => claimed.push(key))
    const batched = []
    service.inbox.setBatcher('fishball-fold-notify', (item, deliver) => { batched.push(item); deliver([item]) })
    await push(h, { kind: 'approval', text: '[permission request apr_2] allow?' })
    assert.deepEqual(claimed, [], 'the claim did not match')
    assert.equal(batched.length, 1, 'the batcher saw the item')
    assert.match(textOf(h), /apr_2/)
  })

  it('XI-DT-03 the batcher can deliver several items as one turn', async (t) => {
    const { h, service } = await live(t)
    const pending = []
    service.inbox.setBatcher('fishball-fold-notify', (item, deliver) => { pending.push(item, deliver) })
    // The ack waits for the batcher's delivery, so the pushes are started, not awaited.
    const firstAck = h.host.inbox({ kind: 'user', text: 'first batched' })
    await until(() => pending.length >= 2, 'the first item reached the batcher')
    const secondAck = h.host.inbox({ kind: 'user', text: 'second batched' })
    await until(() => pending.length >= 4, 'the second item reached the batcher')
    assert.equal(h.manager().followups.length, 0, 'the batcher holds until it delivers')
    const deliver = pending[1]
    await deliver([pending[0], pending[2]])
    const text = textOf(h)
    assert.match(text, /first batched/)
    assert.match(text, /second batched/)
    assert.equal(h.manager().followups.length, 1, 'one turn for the batch')
    await Promise.all([firstAck, secondAck])
  })

  it('XI-P-01 a claimed item never reaches the batcher', async (t) => {
    const { h, service } = await live(t)
    service.inbox.claim({ pluginId: 'fishball-watchdog', kind: 'approval', match: () => 'k' }, () => {})
    const batched = []
    service.inbox.setBatcher('fishball-fold-notify', (item, deliver) => { batched.push(item); deliver([item]) })
    await push(h, { kind: 'approval', text: '[permission request apr_3] allow?' })
    assert.deepEqual(batched, [])
    assert.equal(textOf(h), '')
  })

  it('XI-ST-01 release deliver:true re-enters the pipeline after the claims (the batcher sees it)', async (t) => {
    const { h, service } = await live(t)
    const released = []
    service.inbox.claim({ pluginId: 'fishball-watchdog', kind: 'approval', match: () => 'key-1' }, () => {})
    service.inbox.setBatcher('fishball-fold-notify', (item, deliver) => { released.push(item); deliver([item]) })
    await push(h, { kind: 'approval', text: '[permission request apr_4] allow?' })
    assert.equal(textOf(h), '', 'held while claimed')
    await service.inbox.release('key-1', { deliver: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(released.length, 1, 'a released item is batched like any notice')
    assert.match(textOf(h), /apr_4/)
  })

  it('XI-ST-02 release deliver:false delivers nothing', async (t) => {
    const { h, service } = await live(t)
    service.inbox.claim({ pluginId: 'fishball-watchdog', kind: 'approval', match: () => 'key-2' }, () => {})
    await push(h, { kind: 'approval', text: '[permission request apr_5] allow?' })
    await service.inbox.release('key-2', { deliver: false })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(textOf(h), '')
  })

  it('XI-ST-03 a held item is dropped when its card settles', async (t) => {
    const { h, service } = await live(t)
    service.inbox.claim({ pluginId: 'fishball-watchdog', kind: 'approval', match: () => 'apr_settled' }, () => {})
    await push(h, { kind: 'approval', text: '[permission request apr_settled] allow?' })
    h.host.event('approval.settled', { approvalId: 'apr_settled', decision: 'allow', by: 'user' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await service.inbox.release('apr_settled', { deliver: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(textOf(h), '', 'a settled card is never delivered')
  })

  it('XI-P-02 release prepends its prefix to the delivered text', async (t) => {
    const { h, service } = await live(t)
    service.inbox.claim({ pluginId: 'fishball-watchdog', kind: 'approval', match: () => 'key-3' }, () => {})
    await push(h, { kind: 'approval', text: '[permission request apr_6] allow?' })
    await service.inbox.release('key-3', { deliver: true, prefix: 'watchdog says: ' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.match(textOf(h), /^watchdog says: /)
  })

  it('XI-BVA-01 the release prefix is at most 500 characters', async (t) => {
    const { h, service } = await live(t)
    for (const [key, size] of [['key-500', 500], ['key-501', 501]]) {
      service.inbox.claim({ pluginId: 'fishball-watchdog', kind: 'approval', match: () => key }, () => {})
      await push(h, { kind: 'approval', text: '[permission request ' + key + '] allow?' })
      await service.inbox.release(key, { deliver: true, prefix: 'p'.repeat(size) })
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
    const text = textOf(h)
    assert.match(text, /p{500}/, 'the 500-character prefix is delivered')
    assert.doesNotMatch(text, /p{501}/, 'a 501-character prefix is refused whole, never delivered')
  })

  it('XI-EP-03 a second batcher gets owner-busy', async (t) => {
    const { service } = await live(t)
    const first = service.inbox.setBatcher('fishball-fold-notify', () => {})
    assert.equal(typeof first, 'function')
    const second = service.inbox.setBatcher('fishball-board', () => {})
    assert.deepEqual(second, { code: 'owner-busy' })
    first()
  })

  it('XI-P-03 the permission-request marker exists and matches the watchdog notice', async (t) => {
    const markers = await loadCore('src/slim/inbox-markers.js')
    assert.ok(markers.PERMISSION_NOTICE, 'PERMISSION_NOTICE is added to inbox-markers.js')
    const text = markers.PERMISSION_NOTICE.text('apr_42')
    assert.match(text, /^\[permission request apr_42\]/)
    assert.equal(markers.PERMISSION_NOTICE.pattern.exec(text)?.[1], 'apr_42')
  })
})
