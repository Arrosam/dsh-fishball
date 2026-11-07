/** Public source coordinator fixture, with a real official target record store and in-memory safe inventories. */
import { CASE, clone, engineFixture, inventory, provider } from './provider-sync-engine.mjs'
import { officialCredentials } from './provider-sync-official.mjs'

export async function coordinatorFixture(t, source = inventory(CASE.source, [provider(), provider(CASE.ids.second)])) {
  const target = await engineFixture(t, source)
  const sourceCredentials = await officialCredentials()
  t.after(() => sourceCredentials.close())
  for (const entry of source.providers) await sourceCredentials.seed(entry.id, sourceCredentials.record())
  const state = { source: clone(source), peerIdentity: clone(CASE.target), unpaired: false, readFailure: null, recordOverride: undefined, planToken: null, inventoryHook: null, readHook: null, importFailure: null }
  const calls = { sourceInventory: 0, sourceReads: [], requests: [] }
  const host = {
    async inventory() { calls.sourceInventory++; if (state.inventoryHook) await state.inventoryHook(calls.sourceInventory); return clone(state.source) },
    async readRecord(id) {
      calls.sourceReads.push(id)
      if (state.readHook) return state.readHook(id)
      if (state.readFailure) throw state.readFailure
      return state.recordOverride === undefined ? sourceCredentials.read(id) : state.recordOverride
    },
  }
  const peer = {
    get identity() { return clone(state.peerIdentity) },
    async request(action, payload) {
      calls.requests.push({ action })
      if (action === 'inventory') {
        const plan = await target.engine.preview(clone(payload.source), clone(state.source.identity))
        state.planToken = plan.token
        return plan
      }
      if (action === 'import') {
        if (state.importFailure) throw state.importFailure
        return target.engine.confirm(payload, clone(state.source.identity))
      }
      throw new Error('only dedicated inventory/import actions are permitted')
    },
  }
  const channel = { peer: () => state.unpaired ? null : peer }
  const { ProviderSyncCoordinator } = await import('../../packages/instance/src/provider-sync-coordinator.js')
  const coordinator = new ProviderSyncCoordinator({ host, channel, ttlMs: CASE.ttlMs, now: () => target.state.now })
  t.after(() => coordinator.close())
  const safe = async (operation) => {
    try {
      const value = await operation()
      sourceCredentials.assertNoLeak(value)
      target.credentials.assertNoLeak(value)
      return value
    } catch (error) {
      sourceCredentials.assertNoLeak([error?.message, error?.stack])
      target.credentials.assertNoLeak([error?.message, error?.stack])
      throw error
    }
  }
  return { target, sourceCredentials, state, calls, coordinator,
    preview: () => safe(() => coordinator.preview()),
    confirm: (plan, ids = [CASE.ids.add], changes = {}, options = {}) => safe(() => coordinator.confirm({ previewId: plan.previewId, ids, confirmed: true, ...changes }, options)),
  }
}
