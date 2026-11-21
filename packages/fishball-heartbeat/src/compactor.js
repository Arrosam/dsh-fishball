import { HOST, LOG, reasonOf } from './constants.js'

/**
 * The compaction a cooling triggers (the user's requirement, 2026-11-21): when the heartbeat stops
 * warming the cache, Fishball's context is compacted once if it is longer than the user's
 * threshold. A cold cache is paid for in full by the next real turn anyway, so this is the cheap
 * moment to shrink the context that turn re-reads.
 *
 * Everything is DSH's own: the length is `tokenMeter.measure(session).totalTokens`, the request
 * size DSH's compaction compares its own threshold against; the compaction is the engine's
 * `compactNow`, the idle, below-threshold compaction DSH's `/compact` command runs. compactNow
 * claims the agent's true idle (runMaintenance) and refuses `busy` otherwise, so this first waits
 * for the agent to finish the turn whose end started the cooling.
 *
 * The caller owns "once per cooling": `cooling.current()` says whether this cooling still stands
 * (no turn started since, no compaction yet), `cooling.claim()` records the attempt, called right
 * before compactNow with no await in between. An abandoned check (a turn started, below threshold,
 * a service missing) claims nothing. A failure is logged and not retried: a retry would be a
 * schedule the user did not set, and the next cooling tries again.
 *
 * @param {object} options
 * @param {{get(name: string): any}} options.agentCtx - the X2 scope; DSH's services are read from it.
 * @param {object} options.agent - the manager's live Agent (`session`, `whenIdle()`, `ctx`).
 * @param {number} options.thresholdTokens - compact only above this.
 * @param {{info: Function, warn: Function}} options.logger
 * @param {AbortSignal} options.signal - aborted when the heartbeat's scope is disposed.
 * @returns {(cooling: {current(): boolean, claim(): void}) => Promise<void>} never rejects.
 */
export function createCompactor({ agentCtx, agent, thresholdTokens, logger, signal }) {
  // A missing service is a composition fact, not an event: reported once per setup, not per cooling.
  const reported = new Set()
  const unavailable = (service) => {
    if (reported.has(service)) return
    reported.add(service)
    logger.warn(LOG.compactionUnavailable, service)
  }

  /** The manager's context length in tokens, or undefined (already reported) when unknown. */
  function measure() {
    const meter = agentCtx.get(HOST.tokenMeter)
    if (meter === undefined) return unavailable(HOST.tokenMeter)
    try { return meter.measure(agent.session).totalTokens } catch (error) { logger.warn(LOG.measureFailed, reasonOf(error)) }
  }

  // The manager's own composition first (its preset's isolated group), then a host-plane engine.
  const engine = () => agentCtx.get(HOST.agentPresets)?.serviceFor?.(agent, HOST.compaction) ?? agentCtx.get(HOST.compaction)

  return async function compactOnce(cooling) {
    try {
      await agent.whenIdle()
      if (signal.aborted || !cooling.current()) return
      const tokens = measure()
      if (tokens === undefined || tokens <= thresholdTokens) return
      const compaction = engine()
      if (compaction === undefined) return unavailable(HOST.compaction)
      cooling.claim()
      const result = await compaction.compactNow(agent, signal)
      if (result === null) logger.info(LOG.nothingToCompact, tokens, thresholdTokens)
      else logger.info(LOG.compacted, tokens, thresholdTokens, result.shadowedSeqs.length, result.shadowedTokenCount)
    } catch (error) {
      // A disposal aborts the compaction on purpose; that is not a failure to report.
      if (!signal.aborted) logger.warn(LOG.compactionFailed, reasonOf(error))
    }
  }
}
