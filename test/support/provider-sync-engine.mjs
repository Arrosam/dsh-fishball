/** Requirement-derived fixtures for the public engine seam; no production implementation is inspected. */
import assert from 'node:assert/strict'
import { officialCredentials } from './provider-sync-official.mjs'

export const CASE = Object.freeze({
  owner: '@deepseek-ai/dsh-llm-pi-ai', ns: 'llm-pi-ai', schema: 'provider-schema-v1', generation: 'owner-1',
  revision: 7, time: 1700000000000, ttlMs: 1000, mask: '••••••••',
  source: { runtimeId: 'source-runtime-1', profileId: 'source-profile', schemaVersion: '1', version: '0.2.1-rc.3' },
  target: { runtimeId: 'target-runtime-1', profileId: 'target-profile', schemaVersion: '1', version: '0.2.1-rc.3' },
  profile: { displayName: 'Fixture provider', api: 'openai-completions', baseURL: 'https://models.example.invalid/v1', models: [{ id: 'model-one', name: 'Model One', contextWindow: 128000, maxTokens: 4096, input: ['text'] }] },
  ids: { add: 'new-provider', exists: 'existing-provider', conflict: 'conflict-provider', unsupported: 'unsupported-provider', second: 'second-provider', missing: 'not-previewed' },
})
export const clone = (value) => structuredClone(value)
export function provider(id = CASE.ids.add, changes = {}) {
  return { id, settingsNs: CASE.ns, settingsPath: ['providers', id], owner: CASE.owner, schema: CASE.schema, ownerGeneration: CASE.generation, declared: true, profile: clone(CASE.profile), credential: { configured: true, kind: 'api-key', writable: true }, supported: true, apiKeyMethod: true, ...clone(changes) }
}
export function inventory(identity = CASE.source, providers = [provider()]) {
  return { identity: clone(identity), revision: { [CASE.ns]: CASE.revision }, schemas: { [CASE.ns]: CASE.schema }, owners: { [CASE.ns]: CASE.generation }, namespaces: [{ ns: CASE.ns, schema: CASE.schema, ownerGeneration: CASE.generation }], providers: clone(providers) }
}
export async function engineFixture(t, source = inventory(), target = inventory(CASE.target, [])) {
  const credentials = await officialCredentials()
  t.after(() => credentials.close())
  const calls = { inventory: 0, reads: 0, additions: [], imports: [], verifies: [] }
  const state = { source: clone(source), target: clone(target), now: CASE.time, configFailure: null, recordFailure: null, importBarrier: null, inventoryHook: null, importHook: null }
  const host = {
    async inventory() { calls.inventory++; if (state.inventoryHook) await state.inventoryHook(calls.inventory); return clone(state.target) },
    async readRecord() { calls.reads++; throw new Error('target engine must never resolve a source or target key') },
    async addProvider(id, profile, expectedRevision) {
      calls.additions.push({ id, profile: clone(profile), expectedRevision })
      if (state.configFailure) throw state.configFailure
      assert.equal(expectedRevision, state.target.revision[CASE.ns], 'configuration must be guarded by current namespace revision')
      assert.equal(state.target.providers.some((entry) => entry.id === id && entry.profile !== null), false, 'configuration mutation must not replace an existing provider')
      state.target.providers = state.target.providers.filter((entry) => entry.id !== id)
      state.target.providers.push(provider(id, { profile, credential: { configured: false, writable: true } }))
      const revision = ++state.target.revision[CASE.ns]
      return { revision }
    },
    async importRecord(id, record) {
      calls.imports.push({ id })
      if (state.importBarrier) await state.importBarrier
      if (state.recordFailure) throw state.recordFailure
      const result = await credentials.import(id, record)
      if (state.importHook) await state.importHook(id)
      return result
    },
    async verify(id) { calls.verifies.push(id); return { catalogAdvertised: true } },
  }
  const { ProviderSyncEngine } = await import('../../packages/instance/src/provider-sync.js')
  const engine = new ProviderSyncEngine({ host, ttlMs: CASE.ttlMs, now: () => state.now })
  // Check every observable result/error before node:test can format it in a failure diagnostic.
  const safe = async (operation) => {
    try {
      const value = await operation()
      credentials.assertNoLeak(value)
      return value
    } catch (error) {
      credentials.assertNoLeak([error?.message, error?.stack])
      throw error
    }
  }
  const preview = () => safe(() => engine.preview(clone(state.source), clone(state.source.identity)))
  const confirm = (plan, items, identity = state.source.identity, options = {}) => safe(() => engine.confirm({ token: plan.token, sourceFingerprint: plan.sourceFingerprint, items }, clone(identity), options))
  return { engine, host, state, calls, credentials, preview, confirm }
}
export const groupedIds = (plan, group) => plan.groups[group].map((entry) => entry.id).sort()
export function assertNoWrites(fixture) {
  assert.equal(fixture.calls.reads, 0, 'no credential resolution is permitted at preview')
  assert.equal(fixture.calls.additions.length, 0, 'preview/invalid confirmation must not mutate configuration')
  assert.equal(fixture.calls.imports.length, 0, 'preview/invalid confirmation must not write credentials')
}
export async function outcome(operation) {
  try { return { ok: true, value: await operation() } }
  catch (error) { return { ok: false, error: { code: error?.code, message: error?.message } } }
}
export function assertRejected(result) {
  assert.equal(result.ok, false, 'request must be rejected rather than silently accepted')
}
