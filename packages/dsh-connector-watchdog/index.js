/**
 * dsh-connector-watchdog (docs/watchdog-project-notes.md; the user's decisions of 2026-11-20): a
 * helper of the agent that manages a session. It takes that manager's two instructions per session
 * (the purpose, required; the approvable scope, optional), patrols the session against its purpose
 * on its own timer and at each permission request, and answers the requests within the scope for
 * the manager, so fewer approvals reach it. A drift stops the session's turn and is reported to
 * the manager.
 *
 * It needs dsh-agent-connector's `dshConnectorSessions` (its permission delegate, reads, Stop) and
 * `dshConnectorTools` (its four tools and its drift event), both looked up at runtime: without them
 * the row loads and stays idle (host-services README: a consumer never lists them in `inject`).
 * It depends on nothing of the Fishball side.
 */
import path from 'node:path'
import { runWithSettings } from 'dsh-connector-shared/live-settings'
import { Config } from './src/config.js'
import { createWatchdog } from './src/core.js'
import { createJudge } from './src/judge.js'
import { openBriefStore } from './src/store.js'
import { watchdogTools } from './src/tools.js'
import { LOG, STORE, WATCHDOG } from './src/constants.js'

export const name = WATCHDOG.name
export const inject = ['sessionController']
export { Config }

const PROFILE_CONTEXT = 'profileContext'
const usable = (service) => service?.apiVersion === WATCHDOG.service.apiVersion

/**
 * The row's settings are volatile (src/config.js): `runWithSettings` runs the body below with their
 * plain values and runs it again after a live change, so the timers and bounds are re-read as when
 * a settings change remounted the row. The briefs persist in the store, so a re-run re-arms them.
 * `async`, as before: Cordis awaits an async apply, and runs a plain function as a constructor,
 * discarding its result (cordis isConstructor).
 */
export async function apply(ctx, config) {
  await runWithSettings(ctx, config, applyWith)
}

async function applyWith(ctx, config) {
  const logger = ctx.logger(WATCHDOG.name)
  const home = ctx.get(PROFILE_CONTEXT)?.home ?? process.env.DSH_HOME
  const store = await openBriefStore({ dir: path.join(home, STORE.directory), logger })
  /** The connector's services while both are there: set by the sub-scope below. */
  let connector
  const watchdog = createWatchdog({ store, services: () => connector, judge: createJudge(ctx, { home, store }), config, logger })
  ctx.effect(() => () => watchdog.close(), WATCHDOG.effect.close)
  watchdog.start()

  ctx.inject([WATCHDOG.service.sessions, WATCHDOG.service.tools], (scope) => {
    const sessions = scope[WATCHDOG.service.sessions]
    const contributions = scope[WATCHDOG.service.tools]
    if (!usable(sessions) || !usable(contributions)) {
      logger.warn(LOG.format, WATCHDOG.name, LOG.servicesMissing, 'api-version')
      return
    }
    // Bound to the sub-scope's own handle, so the connector traces this package as the contributor.
    const emit = (event) => scope[WATCHDOG.service.tools].emit(event)
    scope.effect(() => {
      connector = Object.freeze({ sessions, emit })
      return () => { connector = undefined }
    }, WATCHDOG.effect.services)
    scope.effect(() => sessions.delegates.register(watchdog.delegate), WATCHDOG.effect.delegate)
    scope.effect(() => {
      const disposers = []
      try {
        // watchdog_session_start only when this connector offers a plugin start (dshConnectorSessions.start).
        const startInput = typeof sessions.start === 'function' ? sessions.startInput : undefined
        for (const definition of watchdogTools(watchdog.call, startInput)) disposers.push(scope[WATCHDOG.service.tools].register(definition))
      } catch (error) {
        logger.warn(LOG.format, WATCHDOG.name, LOG.toolsRefused, error?.code ?? error?.message)
      }
      return () => { for (const dispose of disposers.splice(0).reverse()) dispose() }
    }, WATCHDOG.effect.tools)
  })
}
