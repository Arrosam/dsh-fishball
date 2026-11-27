import { followInstance, reportCoreMissing } from 'fishball-shared/instance-follower'
import { snapshotConfig } from './src/config.js'
import { HOST, ID } from './src/constants.js'
import { createConsultant } from './src/consultant.js'
import { createDiscovery } from './src/discovery.js'
import { mountTools, openLedger, ownerCards, registerRoutes } from './src/host.js'

export { Config } from './src/config.js'
export const name = ID
export const inject = ['storage', 'storageDomain', 'connection']

export async function apply(ctx, config) {
  const { ledger, close } = await openLedger(ctx)
  // Today's connector does not supply a protected advisory port. Do not discover a similarly
  // named MCP tool or accept connector claims via the ordinary worker bridge.
  const ownerId = 'profile-owner'
  let instance
  const cards = ownerCards(ownerId)
  const discover = createDiscovery(() => instance)
  const getConfig = () => snapshotConfig(config)
  const consultant = createConsultant({ ledger, ownerId, getConfig, discover, disclosure: cards, notify: (notice) => instance?.manager.notify(notice) })
  ctx.effect(() => async () => { consultant.stop(); cards.clear(); await close() })
  // No production port exists, and initial recovery never dispatches an ask.
  await consultant.recover()
  const binding = followInstance(ctx, HOST, (next) => {
    instance = next
    const detach = next.manager.registerSetup(ID, (agentCtx) => mountTools(agentCtx, consultant))
    const drain = () => {
      if (instance === next) void consultant.drainNotices().catch(() => {})
    }
    const ready = ctx.get(HOST.appReady)
    const cancel = ready?.onReady(drain)
    if (!ready) drain()
    return () => { instance = undefined; cancel?.(); detach() }
  })
  ctx.effect(() => registerRoutes(ctx.connection.fetch, { consultant, discover, cards }))
  reportCoreMissing(ctx, HOST, binding, () => ctx.logger(ID).warn('No compatible Fishball core: consultant manager tools were not registered.'))
}
