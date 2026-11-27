/**
 * The ready area's host row: the shared host-row world (support/host-row.mjs: host.js `apply` over
 * a fake row context, with the fake runtime in place of src/native-runtime/index.js, so no child
 * process starts; everything else the real instance code bound to one SDK). A ready start offers
 * the world's provider-sync transport. The fake ctx adds the main DSH's llm / settings /
 * configEditor / credentials / authorization, which the model sync's source reads.
 * `llm.listConfigurableProviders` is held open by the world, so a case can see the sync's first
 * read and keep it pending.
 */
import { randomUUID } from 'node:crypto'
import { gate } from '@dsh-instance/test-helpers/wait'
import { ROW as SHARED_ROW } from '../support/constants.mjs'
import { hostRowWorld } from '../support/host-row.mjs'
import { ROW } from './constants.mjs'

/**
 * One host row on `sdk` for the canonical main home `home`.
 * @returns {{apply(), fireReady(), service(), warns(), routes, providerReads, providersRead, world}}
 */
export async function rowWorld(scope, sdk, home) {
  const providersRead = gate()
  const providers = gate()
  /** The row's own status at each read of the main DSH's providers (the model sync's first step). */
  const providerReads = []
  const row = await hostRowWorld(scope, sdk, {
    home,
    fields: { [ROW.enabled]: true },
    volatileUpdate: ROW.volatileUpdate,
    syncTransport: Object.freeze({ send() {}, onMessage: () => () => {}, onClose: () => () => {} }),
    hostId: randomUUID(), childOrigin: ROW.childOrigin, webOrigin: ROW.webOrigin, launchToken: ROW.ticket, generation: ROW.ticket,
    members: (services) => ({
      llm: { listConfigurableProviders: () => { providerReads.push(services.get(SHARED_ROW.service)?.status().state); providersRead.open(); return providers.promise } },
      settings: { describe: async () => [] },
      configEditor: { entries: async () => [] },
      credentials: {},
      authorization: {},
    }),
    release: () => providers.open([]),
  })
  const warns = () => row.logs.filter((l) => l.level === ROW.warnLevel)
  return {
    world: row.ctl, routes: row.routes, providerReads, host: row.host,
    /** Resolves at the model sync's first read of the main DSH's providers. */
    providersRead: providersRead.promise,
    apply: () => row.apply(),
    fireReady: () => row.fireReady(),
    service: () => row.serviceOf(SHARED_ROW.service),
    warns,
  }
}
