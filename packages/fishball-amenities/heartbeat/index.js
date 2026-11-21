import { followInstance, reportCoreMissing } from '../board/src/instance.js'
import { Config, enabled } from './src/config.js'
import { HOST, LOG, NAMESPACE } from './src/constants.js'
import { createFocusStore } from './src/focus.js'
import { startHeartbeat } from './src/heartbeat.js'
import { createFocusTool } from './src/tool.js'

export { Config }
export const name = NAMESPACE
// fishballInstance is looked up at runtime, never injected: both supported Cordis versions treat
// every injected name as required, and this row must load without fishball-core (R-FB-06).
export const inject = []

/**
 * The followInstance/reportCoreMissing pair is imported from the board row, not copied: it is the
 * one implementation of "bind to a compatible fishballInstance, report its absence once" in this
 * package (extension points §1).
 */
export function apply(ctx, config) {
  const logger = ctx.logger(NAMESPACE)
  // One store per row, shared by every manager setup so its writes queue in one place. Opened on
  // the first attach, never at row load: a row without core has no use for the profile home.
  let store
  const openStore = () => store ??= createFocusStore({ home: ctx.get(HOST.profile).home })
  const on = enabled(config)
  const binding = followInstance(ctx, HOST, (instance) => {
    // Off until the user sets both settings: no tool, no timer, nothing sent. A settings change
    // re-applies the row (DSH's loader reloads a row on a non-volatile config change).
    if (!on) return () => {}
    const { manager } = instance
    return manager.registerSetup(NAMESPACE, (agentCtx, live) => {
      const focus = openStore()
      // X2 disposal removes the tool and, through agentCtx.effect, the timer.
      agentCtx.tools.register(createFocusTool({ store: focus, sessionId: live.session.id }))
      startHeartbeat({
        agentCtx, session: live.session, config, logger, now: Date.now,
        notify: (input) => manager.notify(input),
        readFocus: () => focus.read(),
      })
    })
  })
  reportCoreMissing(ctx, HOST, binding, () => logger.warn(LOG.coreMissing))
}
