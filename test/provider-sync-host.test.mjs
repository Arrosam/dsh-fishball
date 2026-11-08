/** EP/security: only whitelisted llm-pi-ai API-key records may leave the host metadata boundary. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CASE as C, clone, outcome } from './support/provider-sync-engine.mjs'
import { hostFixture } from './support/provider-sync-host.mjs'

// apiKeyEnv is no longer refused: the user decided on 2026-11-06 that Refresh models copies such a provider with
// its key (119c4e5, slim-native-design §10); the remaining partitions still carry a secret in the config.
const rawPartitions = Object.freeze(['header', 'URL userinfo', 'URL query', 'model header', 'model endpoint', 'unknown secret-bearing field'])
const noSecretReads = (fixture) => {
  assert.equal(fixture.calls.recordReads, 0)
  assert.equal(fixture.calls.resolves, 0)
  assert.equal(fixture.calls.sets + fixture.calls.unsets + fixture.calls.deletes, 0)
  assert.equal(fixture.calls.modifies.length, 0)
}

test('PS-H01 EP: official record presence preview is redacted, allowlisted and read-only', async (t) => {
  const fixture = await hostFixture(t)
  await fixture.credentials.seed(C.ids.add, fixture.credentials.record())
  const dto = await fixture.inventory()
  assert.equal(dto.providers.length, 1)
  const item = dto.providers[0]
  assert.equal(item.supported, true)
  assert.equal(item.credential.kind, 'api-key')
  assert.equal(item.credential.configured, true)
  assert.deepEqual(item.profile, C.profile)
  assert.equal(item.settingsNs, C.ns)
  assert.deepEqual(item.settingsPath, ['providers', C.ids.add])
  assert.equal(fixture.calls.describe.every((options) => options.redactSecrets === true), true)
  assert.equal(fixture.calls.mutation.length, 0)
  noSecretReads(fixture)
})

for (const partition of rawPartitions) test('PS-H02 EP/security: reject ' + partition + ' without reading values or echoing secret config', async (t) => {
  const fixture = await hostFixture(t)
  const secret = fixture.credentials.opaque()
  const profile = fixture.state.profiles[C.ids.add]
  if (partition === 'header') profile.headers = { Authorization: secret }
  if (partition === 'URL userinfo') profile.baseURL = 'https://user:' + secret + '@models.example.invalid/v1'
  if (partition === 'URL query') profile.baseURL += '?access_token=' + secret
  if (partition === 'model header') profile.models[0].headers = { Authorization: secret }
  if (partition === 'model endpoint') profile.models[0].baseURL = 'https://models.example.invalid/v1?key=' + secret
  if (partition === 'unknown secret-bearing field') profile.customSecret = secret
  const dto = await fixture.inventory()
  assert.equal(dto.providers[0].supported, false)
  assert.equal(dto.providers[0].profile, null)
  fixture.credentials.assertNoLeak(dto)
  noSecretReads(fixture)
})

for (const partition of ['grant', 'foreign owner', 'inactive owner']) test('PS-H03 EP: ' + partition + ' is not a compatible record provider', async (t) => {
  const fixture = await hostFixture(t)
  if (partition === 'grant') await fixture.credentials.seed(C.ids.add, { kind: 'grant', payload: fixture.credentials.opaque() })
  if (partition === 'foreign owner') fixture.state.ownerName = '@other/adapter'
  if (partition === 'inactive owner') fixture.state.entriesActive = false
  const dto = await fixture.inventory()
  assert.equal(dto.providers.every((item) => item.supported === false), true)
  noSecretReads(fixture)
})

test('PS-H04 ST: official import uses modifyRecord and preserves an existing record', async (t) => {
  const fixture = await hostFixture(t)
  const original = fixture.credentials.record()
  await fixture.credentials.seed(C.ids.add, original)
  await fixture.inventory()
  const result = await fixture.safe(() => fixture.host.importRecord(C.ids.add, fixture.credentials.record()))
  assert.equal(result.status, 'exists')
  await fixture.credentials.assertSame(C.ids.add, original)
  assert.equal(fixture.calls.modifies.length, 1)
  assert.equal(fixture.calls.sets + fixture.calls.unsets + fixture.calls.deletes, 0)
  await fixture.credentials.assertOwnerOnly()
})

test('PS-H05 ST: adding provider emits only smallest revision-guarded settings mutation', async (t) => {
  const existing = clone(C.profile)
  const fixture = await hostFixture(t, { [C.ids.exists]: existing })
  await fixture.inventory()
  await fixture.safe(() => fixture.host.addProvider(C.ids.add, clone(C.profile), C.revision, C.ns))
  assert.equal(fixture.calls.mutation.length, 1)
  const write = fixture.calls.mutation[0]
  assert.equal(write.expectedRevision, C.revision)
  assert.deepEqual(write.operations, [{ op: 'set', path: ['providers', C.ids.add], value: C.profile }])
  assert.deepEqual(fixture.state.profiles[C.ids.exists], existing)
  noSecretReads(fixture)
})

test('PS-H06 DT: adding an already configured provider never invokes mutate', async (t) => {
  const fixture = await hostFixture(t)
  await fixture.inventory()
  const result = await outcome(() => fixture.host.addProvider(C.ids.add, clone(C.profile), C.revision, C.ns))
  assert.equal(result.ok, false)
  assert.equal(fixture.calls.mutation.length, 0)
  noSecretReads(fixture)
})

test('PS-H07 EP: unconfigured credential metadata cannot claim an existing transferable record', async (t) => {
  const fixture = await hostFixture(t)
  const dto = await fixture.inventory()
  assert.equal(dto.providers[0].credential.configured, false)
  assert.equal(dto.providers[0].credential.kind, undefined)
  noSecretReads(fixture)
})

const STAGE = Object.freeze({
  cases: [
    { name: 'settings rejection after write', hook: 'mutateAfterCommitError', config: 'unknown', key: 'not-attempted', status: 'unknown', imports: 0 },
    { name: 'post-mutation verification failure', hook: 'describeAfterMutationError', config: 'added', key: 'not-attempted', status: 'partial', imports: 0 },
    { name: 'credential rejection after official write', hook: 'recordAfterCommitError', config: 'added', key: 'unknown', status: 'unknown', imports: 1 },
    { name: 'metadata failure after acknowledged key import', hook: 'describeAfterRecordError', config: 'added', key: 'imported', status: 'partial', imports: 1 },
  ],
})
for (const stage of STAGE.cases) test('PS-H08 ST: ' + stage.name + ' is reported without destructive rollback or implicit retry', async (t) => {
  const source = await hostFixture(t)
  const target = await hostFixture(t, { [C.ids.exists]: clone(C.profile) }, C.target)
  const record = source.credentials.record()
  const originalTarget = target.credentials.record()
  await source.credentials.seed(C.ids.add, record)
  await target.credentials.seed(C.ids.exists, originalTarget)
  const { ProviderSyncEngine } = await import('../packages/instance/src/provider-sync.js')
  const engine = new ProviderSyncEngine({ host: target.host })
  t.after(() => engine.close())
  const plan = await engine.preview(await source.inventory(), clone(C.source))
  target.state[stage.hook] = new Error(target.credentials.opaque())
  const request = { token: plan.token, sourceFingerprint: plan.sourceFingerprint, items: [{ id: C.ids.add, record }] }
  const result = await target.safe(() => engine.confirm(request, clone(C.source)))
  source.credentials.assertNoLeak(result)
  assert.equal(result.complete, false)
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].config, stage.config)
  assert.equal(result.results[0].key, stage.key)
  assert.equal(result.results[0].status, stage.status)
  assert.equal(target.calls.mutation.length, 1)
  assert.equal(target.calls.modifies.length, stage.imports)
  assert.deepEqual(target.state.profiles[C.ids.add], C.profile, 'configuration written before failure must remain intact')
  await target.credentials.assertSame(C.ids.exists, originalTarget)
  if (stage.imports) { await target.credentials.assertSame(C.ids.add, record); await target.credentials.assertOwnerOnly() }
  assert.equal(target.calls.unsets + target.calls.deletes, 0)
  const replay = await outcome(() => target.safe(() => engine.confirm(request, clone(C.source))))
  assert.equal(replay.ok, false)
  assert.equal(target.calls.mutation.length, 1)
  assert.equal(target.calls.modifies.length, stage.imports)
})

for (const kind of ['api-key', 'grant']) test('PS-H09 DT: orphan target ' + kind + ' record skips a custom provider before configuration filling', async (t) => {
  const source = await hostFixture(t)
  const target = await hostFixture(t, { [C.ids.exists]: clone(C.profile) }, C.target)
  await source.credentials.seed(C.ids.add, source.credentials.record())
  const original = kind === 'api-key' ? target.credentials.record() : { kind, payload: target.credentials.opaque() }
  await target.credentials.seed(C.ids.add, original)
  const { ProviderSyncEngine } = await import('../packages/instance/src/provider-sync.js')
  const engine = new ProviderSyncEngine({ host: target.host })
  t.after(() => engine.close())
  const preview = await source.safe(async () => engine.preview(await source.inventory(), clone(C.source)))
  target.credentials.assertNoLeak(preview)
  assert.deepEqual(preview.groups.existsSkip.map((item) => item.id), [C.ids.add])
  assert.equal(preview.groups.add.length, 0)
  assert.equal(target.calls.mutation.length, 0)
  assert.equal(target.calls.modifies.length, 0)
  assert.equal(source.calls.recordReads + target.calls.recordReads + source.calls.resolves + target.calls.resolves, 0)
  assert.equal(Object.hasOwn(target.state.profiles, C.ids.add), false)
  await target.credentials.assertSame(C.ids.add, original)
})

test('PS-H10 ST: orphan record appearing after preview blocks configuration mutation at confirm', async (t) => {
  const source = await hostFixture(t)
  const target = await hostFixture(t, { [C.ids.exists]: clone(C.profile) }, C.target)
  const sourceRecord = source.credentials.record()
  await source.credentials.seed(C.ids.add, sourceRecord)
  const { ProviderSyncEngine } = await import('../packages/instance/src/provider-sync.js')
  const engine = new ProviderSyncEngine({ host: target.host })
  t.after(() => engine.close())
  const preview = await source.safe(async () => engine.preview(await source.inventory(), clone(C.source)))
  assert.deepEqual(preview.groups.add.map((item) => item.id), [C.ids.add])
  const original = target.credentials.record()
  await target.credentials.seed(C.ids.add, original)
  const result = await target.safe(() => engine.confirm({ token: preview.token, sourceFingerprint: preview.sourceFingerprint, items: [{ id: C.ids.add, record: sourceRecord }] }, clone(C.source)))
  source.credentials.assertNoLeak(result)
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].status, 'skipped')
  assert.equal(target.calls.mutation.length, 0)
  assert.equal(target.calls.modifies.length, 0)
  assert.equal(Object.hasOwn(target.state.profiles, C.ids.add), false)
  assert.equal(source.calls.recordReads + target.calls.recordReads, 0)
  await target.credentials.assertSame(C.ids.add, original)
})

test('PS-H11 ST: owner activation store replacement invalidates preview despite stable entry fiber and runtime', async (t) => {
  const source = await hostFixture(t)
  const target = await hostFixture(t, { [C.ids.exists]: clone(C.profile) }, C.target)
  source.state.ownerStore = {}
  target.state.ownerStore = {}
  const record = source.credentials.record()
  await source.credentials.seed(C.ids.add, record)
  const { ProviderSyncEngine } = await import('../packages/instance/src/provider-sync.js')
  const engine = new ProviderSyncEngine({ host: target.host })
  t.after(() => engine.close())
  const sourceInventory = await source.inventory()
  const before = await target.inventory()
  const preview = await engine.preview(sourceInventory, clone(C.source))
  target.state.ownerStore = {}
  const after = await target.inventory()
  assert.equal(before.owners[C.ns] !== after.owners[C.ns], true, 'owner activation token must change when the official fiber store changes')
  assert.deepEqual(before.identity, after.identity)
  assert.deepEqual(before.revision, after.revision)
  assert.deepEqual(before.schemas, after.schemas)
  const result = await outcome(() => target.safe(() => engine.confirm({ token: preview.token, sourceFingerprint: preview.sourceFingerprint, items: [{ id: C.ids.add, record }] }, clone(C.source))))
  source.credentials.assertNoLeak(result)
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'repreview-required')
  assert.equal(target.calls.mutation.length + target.calls.modifies.length, 0)
  assert.equal(source.calls.recordReads + target.calls.recordReads + source.calls.resolves + target.calls.resolves, 0)
  assert.equal(Object.hasOwn(target.state.profiles, C.ids.add), false)
})
