/**
 * fishball-taskboard's row (docs/plugins/fishball-taskboard.md): Fishball's own task board and memo
 * pad. It opens the board's store, serves the UI's routes (they work without core: the user can
 * always see and edit the board), and, while a compatible `fishballInstance` is bound, gives the
 * manager its tools, its prompt guide and the compaction reminder through X2, and puts the board on
 * core's page stream as its topic (`HOST.pageTopic`), so the Task board tab opens no connection of
 * its own beside core.
 * Its browser half is client.js.
 */
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { followInstance, reportCoreMissing } from 'fishball-shared/instance-follower'
import { HOST, LOG, NAMESPACE } from './src/constants.js'
import { openStore } from './src/store.js'
import { viewOf } from './src/board.js'
import { createTools } from './src/tools.js'
import { registerRoutes } from './src/routes.js'
import { registerReminder } from './src/reminder.js'
import { registerGuide } from './src/guide.js'
import { createAutoModel } from './src/auto-model.js'
import { createAutoUpdate } from './src/auto-update.js'
import { AUTO_PATH } from './src/auto-constants.js'

export const name = NAMESPACE
// `storage` + `storageDomain` for the board's table (as fishball-core's main row), `connection` for
// the routes. `fishballInstance` is looked up, never injected (R-FB-06; as fishball-board's row).
export const inject = ['storage', 'storageDomain', 'connection']

export async function apply(ctx) {
  const now = Date.now
  const store = await openStore(ctx, { defineDomain })
  ctx.effect(() => () => store.close())
  const auto = createAutoUpdate({ store, now, modelPort: createAutoModel(ctx) })
  ctx.effect(() => registerRoutes(ctx, store, now, auto))
  const binding = followInstance(ctx, HOST, (instance) => {
    const sessionId = () => instance.manager.sessionId()
    const disposeAuto = auto.bind(instance)
    const disposeSetup = instance.manager.registerSetup(NAMESPACE, (agentCtx, live) => {
      for (const tool of createTools({ store, sessionId, now })) agentCtx.tools.register(tool)
      registerGuide(agentCtx, auto.isEnabled)
      registerReminder(agentCtx, live, store)
    })
    // The board on core's one page stream (fishball-shared SEAM_PAGE_STREAM): the same view as the
    // GET board route; a read that throws (a quarantined domain) skips that frame.
    const disposeTopic = instance[HOST.pageMember]?.register(HOST.pageTopic, { frame: () => viewOf(store.read()), onChange: (fn) => store.onChange(() => fn()) })
    const disposeAutoTopic = instance[HOST.pageMember]?.register(AUTO_PATH.topic, {
      frame: store.auditFrame, onChange: store.onAutoChange,
    })
    return () => { disposeAuto(); disposeAutoTopic?.(); disposeTopic?.(); disposeSetup?.() }
  })
  reportCoreMissing(ctx, HOST, binding, () => ctx.logger(NAMESPACE).warn(LOG.coreMissing))
}
