/** Public host adapter fixture: safe in-memory settings plus official disposable credentials. */
import assert from 'node:assert/strict'
import { CASE, clone } from './provider-sync-engine.mjs'
import { officialCredentials } from './provider-sync-official.mjs'
import { resolveOfficialSDK } from './provider-sync-sdk.mjs'

const HOST = Object.freeze({ schema: { type: 'object', properties: { providers: { type: 'object', additionalProperties: { type: 'object' } } } }, apiKey: { id: 'api-key', label: 'API key' } })
export async function hostFixture(t, profiles = { [CASE.ids.add]: clone(CASE.profile) }, identity = CASE.source) {
  const credentials = await officialCredentials()
  t.after(() => credentials.close())
  const calls = { describe: [], mutation: [], recordReads: 0, resolves: 0, sets: 0, unsets: 0, modifies: [], deletes: 0 }
  const state = { profiles: clone(profiles), revision: CASE.revision, ownerName: CASE.owner, schema: clone(HOST.schema), entriesActive: true, directory: null, mutateAfterCommitError: null, describeAfterMutationError: null, recordAfterCommitError: null, recordBeforeMutate: null, describeAfterRecordError: null, recordWriteAcknowledged: false, ownerStore: undefined }
  const entry = { options: { id: CASE.ns, name: CASE.owner }, fiber: { state: 2, runtime: {} } }
  const directory = () => state.directory ?? Object.keys(state.profiles).map((id) => ({ provider: id, displayName: 'Fixture provider', settingsNs: CASE.ns, settingsPath: ['providers', id], declared: true }))
  const ctx = {
    credentials: {
      describeRecord: (key) => credentials.provider.describeRecord(key),
      listRecords: () => credentials.provider.listRecords(),
      readRecord(key) { calls.recordReads++; return credentials.provider.readRecord(key) },
      resolve() { calls.resolves++; throw new Error('reference resolution is forbidden for sync') },
      set() { calls.sets++; throw new Error('reference writes are forbidden for sync') },
      unset() { calls.unsets++; throw new Error('destructive cleanup is forbidden for sync') },
      deleteRecord() { calls.deletes++; throw new Error('destructive cleanup is forbidden for sync') },
      async modifyRecord(key, mutate) {
        calls.modifies.push(key)
        const result = await credentials.provider.modifyRecord(key, async (current) => {
          if (state.recordBeforeMutate) await state.recordBeforeMutate()
          return mutate(current)
        })
        state.recordWriteAcknowledged = true
        if (state.recordAfterCommitError) throw state.recordAfterCommitError
        return result
      },
    },
    authorization: { describe: async () => ({ methods: [clone(HOST.apiKey)] }) },
    configEditor: { entries() { entry.options.name = state.ownerName; entry.fiber.runtime = state.entriesActive ? entry.fiber.runtime ?? {} : null; entry.fiber.store = state.ownerStore; return [entry] } },
    llm: { listConfigurableProviders: directory, listProviders: () => directory().map((item) => ({ id: item.provider, name: item.displayName })), listModels: () => [] },
    sessionController: { modelCatalog: async () => [] },
    settings: {
      async describe(options) {
        calls.describe.push(clone(options))
        if (calls.mutation.length && state.describeAfterMutationError) throw state.describeAfterMutationError
        if (state.recordWriteAcknowledged && state.describeAfterRecordError) throw state.describeAfterRecordError
        return [{ ns: CASE.ns, revision: state.revision, schema: clone(state.schema), value: { providers: clone(state.profiles) } }]
      },
      async mutate(ns, operations, expectedRevision) {
        calls.mutation.push({ ns, operations: clone(operations), expectedRevision })
        assert.equal(ns, CASE.ns)
        assert.equal(expectedRevision, state.revision, 'minimal settings addition requires expected revision')
        for (const operation of operations) {
          assert.equal(operation.op, 'set')
          assert.equal(operation.path.length, 2)
          assert.equal(operation.path[0], 'providers')
          assert.equal(Object.hasOwn(state.profiles, operation.path[1]), false, 'existing provider configuration must never be replaced')
          state.profiles[operation.path[1]] = clone(operation.value)
        }
        state.revision++
        if (state.mutateAfterCommitError) throw state.mutateAfterCommitError
        return { revision: state.revision }
      },
    },
  }
  resolveOfficialSDK()
  const { createProviderSyncHost } = await import('../../packages/instance/src/provider-sync-host.js')
  const host = createProviderSyncHost(ctx, { identity: clone(identity) })
  const safe = async (operation) => {
    try { const value = await operation(); credentials.assertNoLeak(value); return value }
    catch (error) { credentials.assertNoLeak([error?.message, error?.stack]); throw error }
  }
  return { host, credentials, state, calls, inventory: () => safe(() => host.inventory()), safe }
}
