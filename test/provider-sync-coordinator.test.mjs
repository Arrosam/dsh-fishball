/** ST/EP/BVA: source consent and changes must be checked before resolving any API-key record. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CASE as C, assertRejected, inventory, outcome, provider } from './support/provider-sync-engine.mjs'
import { coordinatorFixture } from './support/provider-sync-coordinator.mjs'

const noReads = (fixture) => assert.equal(fixture.calls.sourceReads.length, 0, 'no source key resolution before valid explicit confirmation')

test('PS-C01 ST: preview and same-profile no-op never resolve values or expose target authorization token', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  noReads(fixture)
  assert.equal(typeof plan.previewId, 'string')
  assert.equal(Object.hasOwn(plan, 'token'), false)
  assert.equal(JSON.stringify(plan).includes(fixture.state.planToken), false, 'target capability token must stay host-only')
  assert.equal(fixture.target.calls.additions.length, 0)
  assert.equal(fixture.target.calls.imports.length, 0)
})

test('PS-C02 ST: confirmation resolves only selected CURRENT official source record', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  const current = fixture.sourceCredentials.record()
  await fixture.sourceCredentials.seed(C.ids.add, current)
  const result = await fixture.confirm(plan)
  assert.equal(result.complete, true)
  assert.deepEqual(fixture.calls.sourceReads, [C.ids.add])
  await fixture.target.credentials.assertSame(C.ids.add, current)
  fixture.sourceCredentials.assertNoLeak(result)
})

for (const [label, change] of [
  ['runtime', (state) => { state.source.identity.runtimeId += '-changed' }],
  ['profile', (state) => { state.source.identity.profileId += '-changed' }],
  ['version', (state) => { state.source.identity.version += '-changed' }],
  ['identity schema', (state) => { state.source.identity.schemaVersion += '-changed' }],
  ['namespace schema', (state) => { state.source.schemas[C.ns] += '-changed' }],
  ['owner generation', (state) => { state.source.owners[C.ns] += '-changed' }],
  ['revision', (state) => { state.source.revision[C.ns]++ }],
  ['provider protocol', (state) => { state.source.providers[0].profile.api = 'anthropic-messages' }],
  ['paired target', (state) => { state.peerIdentity.runtimeId += '-changed' }],
  ['pairing', (state) => { state.pairId += '-changed' }],
]) test('PS-C03 ST: changed source/peer ' + label + ' rejects before key resolution', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  change(fixture.state)
  assertRejected(await outcome(() => fixture.confirm(plan)))
  noReads(fixture)
  assert.equal(fixture.target.calls.additions.length, 0)
  assert.equal(fixture.target.calls.imports.length, 0)
})

for (const [label, changes, ids] of [
  ['missing consent', { confirmed: false }, [C.ids.add]],
  ['unpreviewed item', {}, [C.ids.missing]],
  ['duplicate item', {}, [C.ids.add, C.ids.add]],
  ['forged handle', { previewId: 'unknown-handle' }, [C.ids.add]],
]) test('PS-C04 DT: ' + label + ' cannot authorize record reads', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  assertRejected(await outcome(() => fixture.confirm(plan, ids, changes)))
  noReads(fixture)
})

for (const elapsed of [C.ttlMs, C.ttlMs + 1]) test('PS-C05 BVA: local confirmation expires at +' + elapsed + 'ms without resolving values', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  fixture.target.state.now += elapsed
  assertRejected(await outcome(() => fixture.confirm(plan)))
  noReads(fixture)
})

test('PS-C06 ST: duplicate concurrent source confirmations resolve each approved record once', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  const results = await Promise.all([outcome(() => fixture.confirm(plan)), outcome(() => fixture.confirm(plan))])
  assert.equal(results.filter((result) => result.ok).length, 1)
  assert.deepEqual(fixture.calls.sourceReads, [C.ids.add])
  assert.equal(fixture.target.calls.imports.length, 1)
})

for (const invalid of ['ambient', 'environment', 'grant']) test('PS-C07 EP: current ' + invalid + ' record cannot be transferred as an API key', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  fixture.state.recordOverride = invalid === 'ambient' ? { kind: 'api-key' } : invalid === 'environment' ? { kind: 'api-key', key: fixture.sourceCredentials.opaque(), env: { AWS_PROFILE: 'fixture-profile' } } : { kind: 'grant', payload: fixture.sourceCredentials.opaque() }
  const result = await fixture.confirm(plan)
  assert.equal(result.complete, false)
  assert.equal(fixture.target.calls.imports.length, 0)
  assert.equal(fixture.target.calls.additions.length, 0)
})

test('PS-C08 ST: source close and lost pairing revoke pending previews without reading keys', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  await fixture.coordinator.close()
  assertRejected(await outcome(() => fixture.confirm(plan)))
  noReads(fixture)
})

test('PS-C09 EP: actual same profile never reads or transfers a key', async (t) => {
  const fixture = await coordinatorFixture(t, inventory(C.source, [provider()]))
  fixture.target.state.target.identity.profileId = C.source.profileId
  fixture.state.peerIdentity.profileId = C.source.profileId
  const plan = await fixture.preview()
  assert.equal(plan.groups.add.length, 0)
  noReads(fixture)
})

for (const timing of ['first inventory', 'final inventory']) test('PS-C10 ST: cancellation at deferred ' + timing + ' prevents transfer with no retry', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  const controller = new AbortController()
  const reached = Promise.withResolvers()
  const release = Promise.withResolvers()
  const before = fixture.calls.sourceInventory
  const targetCall = before + (timing === 'first inventory' ? 1 : 2)
  fixture.state.inventoryHook = async (count) => {
    if (count === targetCall) { reached.resolve(); await release.promise }
  }
  const running = outcome(() => fixture.confirm(plan, [C.ids.add], {}, { signal: controller.signal }))
  await reached.promise
  controller.abort()
  release.resolve()
  const result = await running
  assert.equal(result.ok ? result.value.complete : false, false)
  assert.equal(fixture.target.calls.imports.length, 0)
  assert.equal(fixture.target.calls.additions.length, 0)
  if (timing === 'first inventory') noReads(fixture)
})

test('PS-C11 ST: close during deferred source check prevents any later key transfer', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  const reached = Promise.withResolvers()
  const release = Promise.withResolvers()
  fixture.state.inventoryHook = async () => { reached.resolve(); await release.promise }
  const running = outcome(() => fixture.confirm(plan))
  await reached.promise
  await fixture.coordinator.close()
  release.resolve()
  const result = await running
  assert.equal(result.ok ? result.value.complete : false, false)
  noReads(fixture)
  assert.equal(fixture.target.calls.imports.length, 0)
})

test('PS-C12 ST: one source read failure reports that item while a selected valid item succeeds without rollback', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  const failure = new Error(fixture.sourceCredentials.opaque())
  fixture.state.readHook = async (id) => {
    if (id === C.ids.second) throw failure
    return fixture.sourceCredentials.read(id)
  }
  const result = await fixture.confirm(plan, [C.ids.add, C.ids.second])
  assert.equal(result.complete, false)
  assert.equal(result.results.length, 2)
  assert.equal(result.results.find((item) => item.id === C.ids.add).status, 'succeeded')
  assert.equal(result.results.find((item) => item.id === C.ids.second).status, 'failed')
  assert.deepEqual(fixture.target.calls.imports, [{ id: C.ids.add }])
  fixture.sourceCredentials.assertNoLeak(result)
})

test('PS-C13 ST: unknown transport outcome is reported per selected item and never automatically retried', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  fixture.state.importFailure = new Error(fixture.sourceCredentials.opaque())
  const result = await fixture.confirm(plan, [C.ids.add, C.ids.second])
  assert.equal(result.complete, false)
  assert.equal(result.results.length, 2)
  assert.equal(result.results.every((item) => item.status === 'unknown'), true)
  assert.equal(fixture.calls.requests.filter((request) => request.action === 'import').length, 1)
  assertRejected(await outcome(() => fixture.confirm(plan)))
  assert.equal(fixture.calls.requests.filter((request) => request.action === 'import').length, 1)
  fixture.sourceCredentials.assertNoLeak(result)
})

test('PS-C14 ST: attempting confirmation on same-profile no-op still never resolves a key', async (t) => {
  const fixture = await coordinatorFixture(t)
  fixture.target.state.target.identity.profileId = C.source.profileId
  fixture.state.peerIdentity.profileId = C.source.profileId
  const plan = await fixture.preview()
  const result = await outcome(() => fixture.confirm(plan))
  assert.equal(result.ok ? result.value.complete === true && result.value.results.some((item) => item.key === 'imported') : false, false)
  noReads(fixture)
  assert.equal(fixture.target.calls.additions.length + fixture.target.calls.imports.length, 0)
})

test('PS-C15 ST: lost transport response preserves known source failure while only sent item becomes unknown', async (t) => {
  const fixture = await coordinatorFixture(t)
  const plan = await fixture.preview()
  const sourceFailure = new Error(fixture.sourceCredentials.opaque())
  fixture.state.readHook = async (id) => {
    if (id === C.ids.second) throw sourceFailure
    return fixture.sourceCredentials.read(id)
  }
  fixture.state.importFailure = new Error(fixture.sourceCredentials.opaque())
  const result = await fixture.confirm(plan, [C.ids.add, C.ids.second])
  assert.equal(result.complete, false)
  assert.equal(result.results.length, 2)
  const sent = result.results.find((item) => item.id === C.ids.add)
  const failed = result.results.find((item) => item.id === C.ids.second)
  assert.equal(sent.status, 'unknown')
  assert.equal(sent.config, 'unknown')
  assert.equal(sent.key, 'unknown')
  assert.equal(failed.status, 'failed')
  assert.equal(failed.config, 'unchanged')
  assert.equal(failed.key, 'not-attempted')
  assert.equal(fixture.calls.requests.filter((request) => request.action === 'import').length, 1)
  assert.equal(fixture.target.calls.additions.length + fixture.target.calls.imports.length, 0)
  fixture.sourceCredentials.assertNoLeak(result)
})
