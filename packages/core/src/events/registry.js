/**
 * The interception registrations and the choice of one receiver (R-INT-01…03; K3 `events.d.ts`).
 * Pure bookkeeping: no ledger, no I/O. The interception module owns what happens to an event.
 */
import { CONTRACT, HOST, LOG, MISUSE } from './constants.js'

const isNonEmptyString = (value) => typeof value === 'string' && value !== ''

/**
 * Validate one registration (K3 PROPOSED: an invalid registration throws a `TypeError` and
 * registers nothing).
 */
function validate(registration, onEvent) {
  if (registration === null || typeof registration !== 'object' || !isNonEmptyString(registration.pluginId)) throw new TypeError(MISUSE.pluginId)
  const { types, filter, priority } = registration
  if (!Array.isArray(types) || types.length === 0 || !types.every(isNonEmptyString)) throw new TypeError(MISUSE.types)
  if (filter !== undefined && typeof filter !== 'function') throw new TypeError(MISUSE.filter)
  if (priority !== undefined && !Number.isFinite(priority)) throw new TypeError(MISUSE.priority)
  if (typeof onEvent !== 'function') throw new TypeError(MISUSE.handler)
}

const sameTypes = (a, b) => a.size === b.size && [...a].every((type) => b.has(type))

/**
 * @param logger - `{warn}`: the one twin warning per registration (R-INT-03).
 */
export function createRegistry({ logger }) {
  const live = []
  let order = 0

  /**
   * A registration matches when it is live, its plugin's fiber (when known) is active, it wants
   * the type, and its filter returns exactly `true`; a throwing filter is no match (R-INT-02, K3).
   */
  function matches(entry, event) {
    if (!isLive(entry) || !entry.types.has(event.type)) return false
    if (entry.filter === undefined) return true
    try { return entry.filter(event) === true } catch { return false }
  }

  /** Highest priority first, then the earliest registration (R-INT-03). */
  function best(candidates) {
    return candidates.reduce((winner, entry) => (winner === undefined || entry.priority > winner.priority
      || (entry.priority === winner.priority && entry.order < winner.order) ? entry : winner), undefined)
  }

  /**
   * Whether the registration may still receive and accept: not disposed, and its plugin's fiber
   * active. A fiber is UNLOADING before Cordis runs its effect disposers (spike V3-S5 L2), so the
   * state is read on every use rather than trusting the disposer alone ("plugin off or down").
   */
  function isLive(entry) {
    return entry.live && (entry.fiber === undefined || entry.fiber.state === HOST.fiberActive)
  }

  return Object.freeze({
    isLive,
    /** The one receiver for `event`, or undefined: no candidate, so Fishball (R-INT-02). */
    choose: (event) => best(live.filter((entry) => matches(entry, event))),
    /** After a restart: the best matching registration of the same plugin, or undefined (R-INT-04). */
    chooseFor: (pluginId, event) => best(live.filter((entry) => entry.pluginId === pluginId && matches(entry, event))),
    /**
     * Add a registration; returns the entry. `fiber` is the registering plugin's fiber when the
     * caller came through Cordis, else undefined (then only `dispose` ends it).
     */
    add(registration, onEvent, fiber) {
      validate(registration, onEvent)
      const entry = {
        pluginId: registration.pluginId,
        types: new Set(registration.types),
        filter: registration.filter,
        priority: registration.priority ?? CONTRACT.defaultPriority,
        onEvent,
        fiber,
        order: ++order,
        live: true,
        /** eventId → attempt of every event this registration holds undecided or committing. */
        held: new Map(),
      }
      const twin = live.find((other) => isLive(other) && other.priority === entry.priority && sameTypes(other.types, entry.types))
      if (twin !== undefined) logger?.warn(LOG.twin, entry.pluginId, entry.priority, twin.pluginId)
      live.push(entry)
      return entry
    },
    /** Remove a registration synchronously; returns false when it was already gone. */
    remove(entry) {
      if (!entry.live) return false
      entry.live = false
      live.splice(live.indexOf(entry), 1)
      return true
    },
    all: () => [...live],
  })
}
