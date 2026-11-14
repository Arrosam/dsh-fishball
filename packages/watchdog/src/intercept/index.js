/**
 * Watchdog as an interceptor of fishball-core's events (task WD-ROUTE; K3 `fishballInstance.events`,
 * packages/core/contracts/events.d.ts; R-INT-04, R-INT-07, R-INT-09, R-WD-02, R-WD-07, R-WD-12;
 * design §6.4, §7.1).
 *
 * One routing per generation (one bound fishball-core). It registers EXACTLY two interceptions,
 * at core's default priority (K3 `INTERCEPT.defaultPriority`, design §6.4):
 * 1. `permission` of a session Watchdog claims, while it is healthy;
 * 2. `settlement` / `retirement` of an offer Watchdog held or escalated, while it is healthy.
 * Nothing else: every other event, and everything while Watchdog is down or off, reaches Fishball
 * (R-WD-12). Watchdog has no token, subscription or MCP call of its own (R-WD-02): its answers go
 * through `ctl.commit(send)` over core's link, which W4's WD-DECIDE supplies as `decide`.
 *
 * Failure = off (R-WD-07): a contract that cannot load, a registration that throws, a `decide` or
 * `onOutcome` that throws, or any `health.fail(cause)` disposes both registrations synchronously.
 * Core then sends what Watchdog was offered, or had accepted with no commit begun, to Fishball once;
 * an answer whose commit began stays Watchdog's, committed or fenced, never both (R-INT-04). That
 * fence is core's (F-INTERCEPT).
 */
import { CAUSE, codeOf, createHealth } from '../health/index.js'
import { LOG, RELEASE } from './constants.js'
import { loadContract } from './contract.js'
import { createSupervision } from './supervision.js'

/**
 * The default `decide` until WD-DECIDE (W4) supplies the judgement: Watchdog cannot decide, so the
 * accepted request goes back to Fishball, which is woken once for it (R-INT-05, R-WD-09 rule 4).
 */
const cannotDecide = (event, ctl) => ctl.release(event, RELEASE)

/**
 * @param options.instance - the bound `fishballInstance` (apiVersion 1): `events.intercept` (K3)
 *   and `manager.notify` (X10).
 * @param options.pluginId - the registrations' `pluginId` in core's ledger and the notice's source.
 * @param options.logger - `{info, warn}`, the background log (R-INT-09); never given a payload.
 * @param options.decide - `(event, ctl) => Promise<void>` for a supervised `permission`, called after
 *   `ctl.accept()` resolved true (WD-DECIDE). It answers through `ctl.commit(send)` or hands back
 *   with `ctl.release`. Default: release to Fishball.
 * @param options.onOutcome - `(event) => Promise<void> | void` for a held offer's `settlement` or
 *   `retirement`, after `accept` (WD-DECIDE's non-waking note). Default: nothing; log only.
 * @param options.newKey - forwarded to the health (a fresh notice key per episode).
 * @returns {{health, supervision, dispose, started}} at once. `started` resolves (never rejects)
 *   once the registrations are made or the attempt failed. Synchronous on purpose, for the plugin
 *   row: `dispose()` (the plugin disabled, or core went away) must make Watchdog off at once and
 *   without a notice even while core's contract is still loading; the load's tail then registers
 *   nothing and raises nothing (R-WD-07 "at once", WD-ST-01 row 7). `health.fail(cause)` is for
 *   every W4 failure kind; `supervision` holds the claims and held offers.
 */
export function openRouting({ instance, pluginId, logger, decide = cannotDecide, onOutcome, newKey }) {
  const health = createHealth({ pluginId, notify: instance?.manager?.notify, logger, newKey })
  const supervision = createSupervision()
  const disposers = []

  // Effective off at once: both filters are false from here on, the registrations are gone, the
  // claims released and stale callbacks fenced by core (their record is no longer theirs).
  health.onOff(() => {
    supervision.clear()
    for (const dispose of disposers.splice(0)) {
      try { dispose() } catch (error) { logger?.warn(LOG.disposeFailed, codeOf(error)) }
    }
  })

  /**
   * A handler wraps one activation: `await ctl.accept()` first, and nothing at all unless it
   * resolves true (K3: an effect before it counts as not accepted). A throw is a Watchdog failure:
   * Watchdog goes effective off, and core falls the event back to Fishball unless a commit began.
   */
  const handle = (act) => async (event, ctl) => {
    if (!(await ctl.accept())) return
    try { await act(event, ctl) } catch (error) {
      health.fail(CAUSE.runtime)
      throw error
    }
  }

  /** The two registrations, unless the generation ended while the contract was loading. */
  function register({ EVENT_TYPE, INTERCEPT }) {
    if (!health.isLive()) return
    try {
      // Built inside the try: a contract module that resolved but lacks a word fails registration
      // here, rather than leaving the generation starting forever with an unhandled rejection.
      const registrations = [
        [
          { types: [EVENT_TYPE.permission], priority: INTERCEPT.defaultPriority, filter: (event) => health.isHealthy() && supervision.isClaimed(event.sourceSessionId) },
          handle(decide),
        ],
        [
          { types: [EVENT_TYPE.settlement, EVENT_TYPE.retirement], priority: INTERCEPT.defaultPriority, filter: (event) => health.isHealthy() && supervision.holds(event.correlationId) },
          handle(async (event) => {
            // A settlement or retirement ends its offer: no later event of it is Watchdog's.
            supervision.forget(event.correlationId)
            await onOutcome?.(event)
          }),
        ],
      ]
      for (const [registration, onEvent] of registrations) {
        disposers.push(instance.events.intercept({ pluginId, ...registration }, onEvent))
      }
    } catch (error) {
      logger?.warn(LOG.registerFailed, codeOf(error))
      health.fail(CAUSE.registration)
      return
    }
    health.ready()
  }

  // A generation disposed while loading neither registers nor reports the load (off() wins).
  const started = loadContract().then(register, (error) => {
    if (!health.isLive()) return
    logger?.warn(LOG.loadFailed, codeOf(error))
    health.fail(CAUSE.load)
  })
  return Object.freeze({ health, supervision, dispose: () => health.off(), started })
}

/**
 * The relayed surface (Fishball 2026-11-15): `openRouting`, resolved once it has started, so the
 * routing it yields is already registered (healthy) or already down.
 * @returns {Promise<{health, supervision, dispose, started}>}
 */
export async function createRouting(options) {
  const routing = openRouting(options)
  await routing.started
  return routing
}
