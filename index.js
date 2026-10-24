/**
 * Fishball host half: one DSH host row that owns the always-on assistant session.
 *
 * Wiring only; each responsibility lives in its own module:
 * - src/config.js        safety limits (live plugin config)
 * - src/store.js         durable assistant record (fails closed)
 * - src/composition.js   scope P, persona, tool mask, bsk_inspect copy, file-write guard
 * - src/lifecycle.js     create / resume / recovery / archive of the one session
 * - src/http.js          /api/fishball/* for the settings page and the brand button
 */
import { Config, readLimits } from './src/config.js'
import { PLUGIN, ERROR, STATUS, EVENT, SERVICE } from './src/constants.js'
import { diagnosticOf } from './src/errors.js'
import { StateFeed } from './src/state-feed.js'
import { Store } from './src/store.js'
import { AssistantComposition } from './src/composition.js'
import { AssistantLifecycle, InactiveLifecycle } from './src/lifecycle.js'
import { registerRoutes } from './src/http.js'
import { HIDDEN_TOOLS } from './src/tool-rules.js'

export const name = PLUGIN.name
export { Config }

/** Services the row cannot work without; see SERVICE for why each is needed. */
export const inject = Object.values(SERVICE)

export async function apply(ctx, config) {
  const logger = ctx.logger(PLUGIN.logger)
  const feed = new StateFeed((error) => logger.warn('state listener failed (%s)', diagnosticOf(error)))
  let lifecycle = new InactiveLifecycle(STATUS.starting)
  const snapshot = () => ({ ...lifecycle.snapshot(), limits: readLimits(config), hiddenTools: [...HIDDEN_TOOLS] })
  const publish = () => feed.publish(snapshot())
  /** Replace the active lifecycle (the stand-ins and the real one share one contract). */
  const use = (next) => { lifecycle = next; publish() }
  registerRoutes(ctx, {
    snapshot,
    subscribe: (listener) => feed.subscribe(listener),
    recover: (action) => lifecycle.recover(action),
  })
  // A limit edited on the Plugins page reaches this row without a remount (spike S21).
  ctx.on(EVENT.volatileUpdate, publish)

  let store
  try {
    store = await Store.open(ctx)
  } catch (error) {
    logger.warn('store could not be opened (%s)', diagnosticOf(error))
    return use(new InactiveLifecycle(STATUS.failed, ERROR.storeUnreadable))
  }

  const composition = new AssistantComposition(ctx, logger)
  try {
    await composition.mount()
  } catch (error) {
    logger.warn('composition failed (%s)', diagnosticOf(error))
    return use(new InactiveLifecycle(STATUS.failed, ERROR.composeFailed, store.assistant()))
  }
  const assistant = new AssistantLifecycle(ctx, store, composition, logger, publish)
  ctx.effect(() => () => assistant.stop(), 'fishball: assistant session')
  use(assistant)
  // Start without blocking the host tree: a slow resume must not delay other rows.
  void assistant.start().catch((error) => logger.warn('assistant start failed (%s)', diagnosticOf(error)))
}
