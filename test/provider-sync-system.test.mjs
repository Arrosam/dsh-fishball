/** System boundary: real authenticated localhost transport + source coordinator + target engine + official record store. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CASE as C, clone, engineFixture, inventory, outcome, provider } from './support/provider-sync-engine.mjs'
import { officialCredentials } from './support/provider-sync-official.mjs'
import { hostFixture } from './support/provider-sync-host.mjs'

const SYSTEM = Object.freeze({ ttlMs: 5000, timeoutMs: 1000, testTimeoutMs: 10000 })
async function syncSystem(t) {
  const sourceCredentials = await officialCredentials()
  t.after(() => sourceCredentials.close())
  const source = inventory(C.source, [provider(), provider(C.ids.second)])
  for (const item of source.providers) await sourceCredentials.seed(item.id, sourceCredentials.record())
  const target = await engineFixture(t, source)
  const { ProviderSyncChannel } = await import('../src/provider-sync-channel.js')
  const { ProviderSyncCoordinator } = await import('../src/provider-sync-coordinator.js')
  const calls = { sourceReads: [], actions: [] }
  const targetChannel = new ProviderSyncChannel({ identity: clone(C.target), ttlMs: SYSTEM.ttlMs, timeoutMs: SYSTEM.timeoutMs,
    async handle(action, payload, identity, context) {
      calls.actions.push(action)
      if (action === 'inventory') return target.engine.preview(payload.source, identity)
      if (action === 'import') return target.engine.confirm(payload, identity, context)
      throw new Error('unexpected action')
    },
  })
  const sourceChannel = new ProviderSyncChannel({ identity: clone(C.source), ttlMs: SYSTEM.ttlMs, timeoutMs: SYSTEM.timeoutMs, handle: async () => { throw new Error('source may not import') } })
  t.after(async () => { await sourceChannel.close(); await targetChannel.close() })
  await targetChannel.start()
  await sourceChannel.start()
  const pending = await sourceChannel.beginPair(targetChannel.invitation())
  await targetChannel.approvePair(pending.pairId)
  await sourceChannel.finishPair(pending.pairId)
  const coordinator = new ProviderSyncCoordinator({ ttlMs: C.ttlMs, now: () => target.state.now, channel: sourceChannel,
    host: { inventory: async () => clone(source), async readRecord(id) { calls.sourceReads.push(id); return sourceCredentials.read(id) } },
  })
  t.after(() => coordinator.close())
  const safe = async (operation) => {
    try { const value = await operation(); sourceCredentials.assertNoLeak(value); target.credentials.assertNoLeak(value); return value }
    catch (error) { sourceCredentials.assertNoLeak([error?.message, error?.stack]); target.credentials.assertNoLeak([error?.message, error?.stack]); throw error }
  }
  return { coordinator, source, sourceCredentials, target, calls, safe, sourceChannel, targetChannel }
}

test('PS-S01 system: explicit paired preview/selected confirmation transfers current record without DTO leaks', { timeout: SYSTEM.testTimeoutMs }, async (t) => {
  const fixture = await syncSystem(t)
  const preview = await fixture.safe(() => fixture.coordinator.preview())
  assert.equal(fixture.calls.sourceReads.length, 0)
  assert.equal(fixture.target.calls.imports.length + fixture.target.calls.additions.length, 0)
  assert.equal(Object.hasOwn(preview, 'token'), false)
  const current = fixture.sourceCredentials.record()
  await fixture.sourceCredentials.seed(C.ids.add, current)
  const result = await fixture.safe(() => fixture.coordinator.confirm({ previewId: preview.previewId, ids: [C.ids.add], confirmed: true }))
  assert.equal(result.complete, true)
  assert.deepEqual(fixture.calls.sourceReads, [C.ids.add])
  assert.deepEqual(fixture.calls.actions, ['inventory', 'import'])
  await fixture.target.credentials.assertSame(C.ids.add, current)
  await fixture.target.credentials.assertOwnerOnly()
  fixture.sourceCredentials.assertNoLeak([preview, result, fixture.calls])
})

test('PS-S02 system: source change after preview prevents reads and all target writes', { timeout: SYSTEM.testTimeoutMs }, async (t) => {
  const fixture = await syncSystem(t)
  const preview = await fixture.safe(() => fixture.coordinator.preview())
  fixture.source.revision[C.ns]++
  const result = await outcome(() => fixture.safe(() => fixture.coordinator.confirm({ previewId: preview.previewId, ids: [C.ids.add], confirmed: true })))
  assert.equal(result.ok, false)
  assert.equal(fixture.calls.sourceReads.length, 0)
  assert.equal(fixture.target.calls.imports.length + fixture.target.calls.additions.length, 0)
})

test('PS-S03 system: actual host adapters mutate only selected provider path and official records over authenticated channel', { timeout: SYSTEM.testTimeoutMs }, async (t) => {
  const source = await hostFixture(t)
  const target = await hostFixture(t, { [C.ids.exists]: clone(C.profile) }, C.target)
  const sourceRecord = source.credentials.record()
  const targetRecord = target.credentials.record()
  await source.credentials.seed(C.ids.add, sourceRecord)
  await target.credentials.seed(C.ids.exists, targetRecord)
  const { ProviderSyncEngine } = await import('../src/provider-sync.js')
  const { ProviderSyncCoordinator } = await import('../src/provider-sync-coordinator.js')
  const { ProviderSyncChannel } = await import('../src/provider-sync-channel.js')
  const engine = new ProviderSyncEngine({ host: target.host })
  t.after(() => engine.close())
  const targetChannel = new ProviderSyncChannel({ identity: clone(C.target), ttlMs: SYSTEM.ttlMs, timeoutMs: SYSTEM.timeoutMs,
    handle: (action, payload, peer, context) => action === 'inventory' ? engine.preview(payload.source, peer) : engine.confirm(payload, peer, context),
  })
  const sourceChannel = new ProviderSyncChannel({ identity: clone(C.source), ttlMs: SYSTEM.ttlMs, timeoutMs: SYSTEM.timeoutMs, handle: async () => { throw new Error('no inbound source operations') } })
  t.after(async () => { await sourceChannel.close(); await targetChannel.close() })
  await sourceChannel.start()
  await targetChannel.start()
  const pending = await sourceChannel.beginPair(targetChannel.invitation())
  await targetChannel.approvePair(pending.pairId)
  await sourceChannel.finishPair(pending.pairId)
  const coordinator = new ProviderSyncCoordinator({ host: source.host, channel: sourceChannel })
  t.after(() => coordinator.close())
  const preview = await source.safe(() => coordinator.preview())
  assert.equal(source.calls.recordReads, 0)
  assert.equal(target.calls.recordReads, 0)
  assert.equal(source.calls.mutation.length + target.calls.mutation.length, 0)
  const result = await source.safe(() => coordinator.confirm({ previewId: preview.previewId, ids: [C.ids.add], confirmed: true }))
  assert.equal(result.complete, true)
  assert.equal(source.calls.recordReads, 1)
  assert.equal(source.calls.mutation.length, 0)
  assert.equal(target.calls.mutation.length, 1)
  assert.deepEqual(target.calls.mutation[0].operations, [{ op: 'set', path: ['providers', C.ids.add], value: C.profile }])
  assert.equal(target.calls.mutation[0].expectedRevision, C.revision)
  await target.credentials.assertSame(C.ids.add, sourceRecord)
  await target.credentials.assertSame(C.ids.exists, targetRecord)
  await target.credentials.assertOwnerOnly()
  target.credentials.assertNoLeak([preview, result])
  assert.equal(source.calls.sets + target.calls.sets + source.calls.unsets + target.calls.unsets + source.calls.deletes + target.calls.deletes, 0)
})
