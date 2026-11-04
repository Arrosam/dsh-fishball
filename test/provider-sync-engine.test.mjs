/** EP/DT: preview partitions. ST/BVA: single-use authorization and stale-state boundaries. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CASE as C, assertNoWrites, assertRejected, clone, engineFixture, groupedIds, inventory, outcome, provider } from './support/provider-sync-engine.mjs'

const groups = Object.freeze(['add', 'existsSkip', 'conflictSkip', 'unsupported'])

test('PS-E01 DT: preview separates additions, existing, conflicts and unsupported without reads or writes', async (t) => {
  const source = inventory(C.source, [provider(C.ids.add), provider(C.ids.exists), provider(C.ids.conflict), provider(C.ids.unsupported, { supported: false, reason: 'reference-auth' })])
  const targetConflict = provider(C.ids.conflict, { profile: { ...clone(C.profile), baseURL: 'https://other.example.invalid/v1' } })
  const fixture = await engineFixture(t, source, inventory(C.target, [provider(C.ids.exists), targetConflict]))
  const before = clone(fixture.state.target)
  const plan = await fixture.preview()
  for (const [group, id] of [['add', C.ids.add], ['existsSkip', C.ids.exists], ['conflictSkip', C.ids.conflict], ['unsupported', C.ids.unsupported]]) assert.deepEqual(groupedIds(plan, group), [id])
  for (const entry of groups.flatMap((group) => plan.groups[group])) assert.equal(entry.keyMask, C.mask)
  assert.deepEqual(plan.source, C.source)
  assert.deepEqual(plan.target, C.target)
  assertNoWrites(fixture)
  assert.deepEqual(fixture.state.target, before)
  fixture.credentials.assertNoLeak(plan)
})

test('PS-E02 ST: same actual profile is a no-op even under a different runtime identity', async (t) => {
  const targetIdentity = { ...C.target, profileId: C.source.profileId }
  const fixture = await engineFixture(t, inventory(), inventory(targetIdentity, []))
  const plan = await fixture.preview()
  assert.equal(plan.groups.add.length, 0)
  assertNoWrites(fixture)
})

test('PS-E03 EP: custom declaration colliding with a dormant built-in route is a conflict', async (t) => {
  const dormant = provider(C.ids.add, { declared: false, profile: null, credential: { configured: false, writable: true } })
  const fixture = await engineFixture(t, inventory(), inventory(C.target, [dormant]))
  assert.deepEqual(groupedIds(await fixture.preview(), 'conflictSkip'), [C.ids.add])
  assertNoWrites(fixture)
})

test('PS-E04 ST: confirm imports only selected additions using official create-only records', async (t) => {
  const fixture = await engineFixture(t, inventory(C.source, [provider(), provider(C.ids.second)]))
  const record = fixture.credentials.record()
  const plan = await fixture.preview()
  const result = await fixture.confirm(plan, [{ id: C.ids.add, record }])
  assert.equal(result.complete, true)
  assert.deepEqual(result.results.map((entry) => entry.id), [C.ids.add])
  assert.equal(result.results[0].status, 'succeeded')
  assert.equal(result.results[0].config, 'added')
  assert.equal(result.results[0].key, 'imported')
  assert.deepEqual(fixture.calls.additions.map((entry) => entry.id), [C.ids.add])
  assert.deepEqual(fixture.calls.imports, [{ id: C.ids.add }])
  assert.deepEqual(fixture.calls.additions[0].profile, C.profile)
  assert.equal(fixture.calls.additions[0].expectedRevision, C.revision)
  await fixture.credentials.assertSame(C.ids.add, record)
  await fixture.credentials.assertOwnerOnly()
  fixture.credentials.assertNoLeak([plan, result, fixture.calls])
})

for (const [label, change] of [
  ['runtime', (state) => { state.target.identity.runtimeId += '-changed' }],
  ['profile', (state) => { state.target.identity.profileId += '-changed' }],
  ['version', (state) => { state.target.identity.version += '-changed' }],
  ['identity schema', (state) => { state.target.identity.schemaVersion += '-changed' }],
  ['namespace schema', (state) => { state.target.schemas[C.ns] += '-changed' }],
  ['owner generation', (state) => { state.target.owners[C.ns] += '-changed' }],
  ['revision', (state) => { state.target.revision[C.ns]++ }],
  ['new conflict', (state) => { state.target.providers.push(provider(C.ids.add)) }],
]) test('PS-E05 ST: changed target ' + label + ' requires a fresh preview before any side effect', async (t) => {
  const fixture = await engineFixture(t)
  const plan = await fixture.preview()
  change(fixture.state)
  const result = await outcome(() => fixture.confirm(plan, [{ id: C.ids.add, record: fixture.credentials.record() }]))
  assertRejected(result)
  assertNoWrites(fixture)
  fixture.credentials.assertNoLeak(result)
})

for (const elapsed of [C.ttlMs, C.ttlMs + 1]) test('PS-E06 BVA: expired preview at +' + elapsed + 'ms cannot authorize a write', async (t) => {
  const fixture = await engineFixture(t)
  const plan = await fixture.preview()
  fixture.state.now += elapsed
  assertRejected(await outcome(() => fixture.confirm(plan, [{ id: C.ids.add, record: fixture.credentials.record() }])))
  assertNoWrites(fixture)
})

test('PS-E07 BVA: preview just before expiry remains usable', async (t) => {
  const fixture = await engineFixture(t)
  const plan = await fixture.preview()
  fixture.state.now += C.ttlMs - 1
  assert.equal((await fixture.confirm(plan, [{ id: C.ids.add, record: fixture.credentials.record() }])).complete, true)
})

for (const selection of ['unlisted', 'duplicate', 'wrong-fingerprint', 'wrong-peer']) test('PS-E08 DT: ' + selection + ' confirmation cannot broaden authorization', async (t) => {
  const fixture = await engineFixture(t)
  const plan = await fixture.preview()
  const item = { id: selection === 'unlisted' ? C.ids.missing : C.ids.add, record: fixture.credentials.record() }
  const items = selection === 'duplicate' ? [item, item] : [item]
  if (selection === 'wrong-fingerprint') plan.sourceFingerprint += '-forged'
  const identity = selection === 'wrong-peer' ? { ...C.source, runtimeId: 'wrong-peer' } : C.source
  assertRejected(await outcome(() => fixture.confirm(plan, items, identity)))
  assertNoWrites(fixture)
})

test('PS-E09 ST: consumed preview cannot be confirmed twice, including concurrently', async (t) => {
  const fixture = await engineFixture(t)
  const plan = await fixture.preview()
  const items = [{ id: C.ids.add, record: fixture.credentials.record() }]
  const results = await Promise.all([outcome(() => fixture.confirm(plan, items)), outcome(() => fixture.confirm(plan, items))])
  assert.equal(results.filter((result) => result.ok).length, 1)
  assert.equal(fixture.calls.additions.length, 1)
  assert.equal(fixture.calls.imports.length, 1)
  assertRejected(await outcome(() => fixture.confirm(plan, items)))
  fixture.credentials.assertNoLeak(results)
})

test('PS-E10 DT: a credential created concurrently is preserved by official locked mutation', async (t) => {
  const fixture = await engineFixture(t)
  const plan = await fixture.preview()
  const original = fixture.credentials.record()
  await fixture.credentials.seed(C.ids.add, original)
  const result = await fixture.confirm(plan, [{ id: C.ids.add, record: fixture.credentials.record() }])
  assert.equal(result.results[0].key, 'exists')
  await fixture.credentials.assertSame(C.ids.add, original)
  fixture.credentials.assertNoLeak(result)
})

for (const fault of ['configFailure', 'recordFailure']) test('PS-E11 ST: ' + fault + ' is accurately reported, consumes authorization and never rolls back', async (t) => {
  const fixture = await engineFixture(t)
  const record = fixture.credentials.record()
  const failure = new Error(fixture.credentials.opaque())
  fixture.state[fault] = failure
  const plan = await fixture.preview()
  const result = await fixture.confirm(plan, [{ id: C.ids.add, record }])
  assert.equal(result.complete, false)
  assert.equal(result.results[0].config, fault === 'configFailure' ? 'failed' : 'added')
  assert.equal(result.results[0].key, fault === 'configFailure' ? 'not-attempted' : 'failed')
  assert.equal(fixture.calls.additions.length, 1)
  assert.equal(fixture.calls.imports.length, fault === 'configFailure' ? 0 : 1)
  if (fault === 'recordFailure') assert.equal(fixture.state.target.providers.some((entry) => entry.id === C.ids.add), true)
  assertRejected(await outcome(() => fixture.confirm(plan, [{ id: C.ids.add, record }])))
  fixture.credentials.assertNoLeak(result)
})

for (const partition of ['missing target namespace', 'incompatible schema', 'foreign owner', 'source not configured', 'source grant', 'unsupported auth method']) test('PS-E12 EP: ' + partition + ' is never an eligible addition', async (t) => {
  const source = inventory()
  const target = inventory(C.target, [])
  if (partition === 'missing target namespace') target.namespaces = []
  if (partition === 'incompatible schema') { target.schemas[C.ns] += '-other'; target.namespaces[0].schema += '-other' }
  if (partition === 'foreign owner') source.providers[0].owner = '@other/adapter'
  if (partition === 'source not configured') source.providers[0].credential = { configured: false, writable: true }
  if (partition === 'source grant') source.providers[0].credential.kind = 'grant'
  if (partition === 'unsupported auth method') { source.providers[0].apiKeyMethod = false; source.providers[0].declared = false }
  const fixture = await engineFixture(t, source, target)
  const plan = await fixture.preview()
  assert.equal(plan.groups.add.length, 0)
  assert.equal(plan.groups.unsupported.length + plan.groups.conflictSkip.length, 1)
  assertNoWrites(fixture)
})

test('PS-E13 ST: two distinct previews cannot both write while one confirmation is awaiting inventory', async (t) => {
  const fixture = await engineFixture(t)
  const first = await fixture.preview()
  const second = await fixture.preview()
  const reached = Promise.withResolvers()
  const release = Promise.withResolvers()
  let held = false
  fixture.state.inventoryHook = async () => {
    if (!held) { held = true; reached.resolve(); await release.promise }
  }
  const one = outcome(() => fixture.confirm(first, [{ id: C.ids.add, record: fixture.credentials.record() }]))
  await reached.promise
  const two = await outcome(() => fixture.confirm(second, [{ id: C.ids.add, record: fixture.credentials.record() }]))
  assertRejected(two)
  release.resolve()
  assert.equal((await one).ok, true)
  assert.equal(fixture.calls.additions.length, 1)
  assert.equal(fixture.calls.imports.length, 1)
})

for (const mode of ['abort', 'close']) test('PS-E14 ST: ' + mode + ' while target inventory is deferred prevents all later writes', async (t) => {
  const fixture = await engineFixture(t)
  const plan = await fixture.preview()
  const reached = Promise.withResolvers()
  const release = Promise.withResolvers()
  const controller = new AbortController()
  fixture.state.inventoryHook = async () => { reached.resolve(); await release.promise }
  const pending = outcome(() => fixture.confirm(plan, [{ id: C.ids.add, record: fixture.credentials.record() }], C.source, { signal: controller.signal }))
  await reached.promise
  if (mode === 'abort') controller.abort()
  else await fixture.engine.close()
  release.resolve()
  const result = await pending
  assert.equal(result.ok ? result.value.complete : false, false)
  assertNoWrites(fixture)
})

test('PS-E15 ST: unrelated target revision after first import stops remaining selected items without rollback', async (t) => {
  const fixture = await engineFixture(t, inventory(C.source, [provider(), provider(C.ids.second)]))
  const plan = await fixture.preview()
  fixture.state.importHook = async (id) => { if (id === C.ids.add) fixture.state.target.revision[C.ns]++ }
  const first = fixture.credentials.record()
  const second = fixture.credentials.record()
  const result = await fixture.confirm(plan, [{ id: C.ids.add, record: first }, { id: C.ids.second, record: second }])
  assert.equal(result.complete, false)
  assert.deepEqual(fixture.calls.additions.map((entry) => entry.id), [C.ids.add])
  assert.deepEqual(fixture.calls.imports, [{ id: C.ids.add }])
  await fixture.credentials.assertSame(C.ids.add, first)
  assert.equal(result.results.find((entry) => entry.id === C.ids.add).status, 'succeeded')
  assert.equal(result.results.some((entry) => entry.id === C.ids.second && entry.status !== 'succeeded'), true)
})

test('PS-E16 DT: existing target API-key record is skipped without comparing or filling configuration', async (t) => {
  const target = provider(C.ids.add, { profile: null, declared: true, credential: { configured: true, kind: 'api-key', writable: true } })
  const fixture = await engineFixture(t, inventory(), inventory(C.target, [target]))
  const plan = await fixture.preview()
  assert.equal(plan.groups.add.length, 0)
  assert.equal(plan.groups.existsSkip.length + plan.groups.conflictSkip.length, 1)
  assertNoWrites(fixture)
})

for (const group of ['existing', 'conflict', 'unsupported']) test('PS-E17 DT: forced selection of ' + group + ' preview item cannot authorize a write', async (t) => {
  const sourceProvider = provider(C.ids.add, group === 'unsupported' ? { supported: false } : {})
  const targetProvider = provider(C.ids.add, group === 'conflict' ? { profile: { ...clone(C.profile), api: 'anthropic-messages' } } : {})
  const fixture = await engineFixture(t, inventory(C.source, [sourceProvider]), inventory(C.target, group === 'unsupported' ? [] : [targetProvider]))
  const plan = await fixture.preview()
  assert.equal(plan.groups.add.length, 0)
  assertRejected(await outcome(() => fixture.confirm(plan, [{ id: C.ids.add, record: fixture.credentials.record() }])))
  assertNoWrites(fixture)
})
