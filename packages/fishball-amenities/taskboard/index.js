/**
 * fishball-taskboard's row (docs/plugins/fishball-taskboard.md): Fishball's own task board and memo
 * pad. It opens the board's store, serves the UI's routes (they work without core: the user can
 * always see and edit the board), and, while a compatible `fishballInstance` is bound, gives the
 * manager its tools and the compaction reminder through X2. Its browser half is client.js.
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { followInstance, reportCoreMissing } from '../board/src/instance.js'
import { HOST, LOG, NAMESPACE } from './src/constants.js'
import { openStore } from './src/store.js'
import { createTools } from './src/tools.js'
import { registerRoutes } from './src/routes.js'
import { createReminder } from './src/reminder.js'

export const name = NAMESPACE
// `storage` + `storageDomain` for the board's table (as fishball-core's main row), `connection` for
// the routes. `fishballInstance` is looked up, never injected (R-FB-06; board/index.js).
export const inject = ['storage', 'storageDomain', 'connection']

export async function apply(ctx) {
  const now = Date.now
  const store = await openStore(ctx, { defineDomain, domainTable })
  ctx.effect(() => () => store.close())
  ctx.effect(() => registerRoutes(ctx, store, now))
  const reminder = createReminder(ctx, store)
  const binding = followInstance(ctx, HOST, (instance) => {
    const sessionId = () => instance.manager.sessionId()
    return instance.manager.registerSetup(NAMESPACE, (agentCtx, live) => {
      // X2 disposal removes the tools with the fiber; the reminder stops following this agent then too.
      for (const tool of createTools({ store, sessionId, now })) agentCtx.tools.register(tool)
      agentCtx.effect(() => reminder.watch(live))
    })
  })
  reportCoreMissing(ctx, HOST, binding, () => ctx.logger(NAMESPACE).warn(LOG.coreMissing))
}
