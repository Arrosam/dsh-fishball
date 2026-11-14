/**
 * Watchdog's health for one generation (task WD-ROUTE; R-WD-07, R-WD-08, R-INT-07; design §7.3;
 * WD-ST-01). A generation is the life of one bound fishball-core: the plugin row starts a new one
 * whenever it binds a (new) `fishballInstance`.
 *
 * Failure = off: `fail(cause)` is synchronous. It runs every `onOff` listener at once (the
 * registrations are disposed, so core sends what Watchdog was offered or had accepted and not
 * decided to Fishball; claims are released), then sends ONE "watchdog is down" notice for the
 * episode through in-session communication (X10 `manager.notify`, never MCP; R-WD-08). It stops or
 * restarts no session: nothing here can reach one.
 */
import { randomUUID } from 'node:crypto'
import { HEALTH, NOTICE, TEXT } from './constants.js'

export { HEALTH, CAUSE } from './constants.js'

/** An error as the background log may name it: its code or class, never its message (R-INT-09). */
export const codeOf = (error) => error?.code ?? error?.name

/** States a generation leaves only once: from them, a failure or a disable makes Watchdog effective off. */
const LIVE = Object.freeze([HEALTH.starting, HEALTH.healthy])

/**
 * @param options.pluginId - X10's `pluginId` (the notice's source).
 * @param options.notify - X10 `manager.notify(input)` of the bound core, or undefined.
 * @param options.logger - `{info, warn}`, the background log.
 * @param options.newKey - a fresh unique string per episode (default `randomUUID`); X10's dedupe is
 *   durable across restarts, so a reused key would silence a later episode.
 * @returns the health of one generation: `state()`, `isHealthy()`, `isLive()`, `ready()`,
 *   `fail(cause)`, `off()`, `onOff(listener)`.
 */
export function createHealth({ pluginId, notify, logger, newKey = randomUUID }) {
  let state = HEALTH.starting
  const listeners = new Set()
  const live = () => LIVE.includes(state)

  /** Leave the live states once: every listener runs, and one that throws does not stop the rest. */
  function leave(next, cause) {
    state = next
    for (const listener of [...listeners]) {
      try { listener(next, cause) } catch (error) { logger?.warn(TEXT.logListenerFailed, codeOf(error)) }
    }
    listeners.clear()
  }

  /**
   * X10 is durable once it accepted the notice. It refuses only while the manager session is being
   * set up (`manager-not-ready`, inside a setup callback) or after core closed; Watchdog's failures
   * happen outside both, so that refusal is only logged here, with no retry timer (R-WD-05).
   */
  async function sendNotice(cause) {
    try {
      if (typeof notify !== 'function') throw new TypeError(TEXT.notifyMissing)
      await notify({ pluginId, dedupeKey: NOTICE.dedupePrefix + newKey(), text: TEXT.down(cause), wake: NOTICE.wake })
    } catch (error) { logger?.warn(TEXT.logNoticeFailed, codeOf(error)) }
  }

  return Object.freeze({
    state: () => state,
    isHealthy: () => state === HEALTH.healthy,
    /** Neither down nor off: the generation may still register and act. */
    isLive: live,
    /** starting → healthy (both registrations live, WD-ST-01 row 1); no effect in any other state. */
    ready() {
      if (state === HEALTH.starting) state = HEALTH.healthy
    },
    /**
     * Any failure kind (R-WD-07). The first one of the generation is the episode: effective off at
     * once, one notice. A later failure while down only logs (WD-ST-01 row 4); after `off()` it
     * does nothing.
     */
    fail(cause) {
      if (!live()) {
        if (state === HEALTH.down) logger?.warn(TEXT.logAgain, cause)
        return
      }
      leave(HEALTH.down, cause)
      logger?.warn(TEXT.logDown, cause)
      void sendNotice(cause)
    },
    /** The owner disabled Watchdog, or its row is disposed (WD-ST-01 row 7): off, with no notice. */
    off() {
      if (live()) leave(HEALTH.off)
      else state = HEALTH.off
    },
    /**
     * `listener(state, cause)` runs once, synchronously, when the generation leaves the live
     * states; registered after that, it runs at once. Returns its remover.
     */
    onOff(listener) {
      if (!live()) { listener(state); return () => {} }
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })
}
