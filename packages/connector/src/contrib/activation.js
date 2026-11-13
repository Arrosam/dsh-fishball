/**
 * A contributor's activation record (R-EXT-09, R-EXT-19; spike V3-S5 Q2, Q-b, Q-c).
 *
 * Every reload is a new activation: unload runs all effects, then load runs again. Disable and
 * enable, a config remount (`fiber.restart()`, which keeps the same Fiber object and uid, S5 Q-b),
 * uninstall and HMR all count. The record therefore lives **on the contributor's root fiber** and
 * an effect on that fiber ends it. As a result:
 * - the quarantine it holds lifts with a new activation and with nothing else;
 * - it survives a reload of the connector, because the record is the contributor's, not the
 *   registry's (EXT-ST-01 #8a, #9).
 * Every registry (one per connector activation) that touched the contributor attaches itself. On
 * the activation's end, each attached registry withdraws what it holds.
 */
import { QUARANTINE } from '../../tools/index.js'
import { HOST } from './constants.js'

/**
 * The contributor's current activation, created on first contact. Returns undefined when its root
 * fiber can no longer take an effect, i.e. it is unloading or gone (cordis `INACTIVE_EFFECT`).
 * @param {{pkg: string, version: string, namespace: string, root: object}} who from contributorOf
 */
export function activationOf(who) {
  const current = who.root[HOST.activationKey]
  if (current !== undefined) return current
  const act = {
    pkg: who.pkg,
    version: who.version,
    namespace: who.namespace,
    root: who.root,
    ended: false,
    quarantined: false,
    /** The last QUARANTINE.windowOutcomes counted outcomes, oldest first; `true` is a failure. */
    outcomes: [],
    /**
     * Every event this activation committed, as `{recipient, eventId}`, so a quarantine or the
     * activation's end can retire the pending ones (R-EXT-19). Retiring an acked one is a no-op
     * (C-MAILBOX, confirmed by Fishball 2026-11-14). K1 gives C-EXT no ack signal, so this list is
     * unbounded for the activation's life (up to EVENT_LIMITS.ratePerMinute per recipient). The
     * K1 follow-up `Mailbox.retireContributor(namespace, activationTag)`, on the amendment list
     * after W2, replaces it.
     */
    committed: [],
    /** Failure kinds already logged for this activation (R-EXT-08: once per contributor and kind). */
    loggedFailures: new Set(),
    /** Registries attached to this activation; each withdraws its own state at the end. */
    registries: new Set(),
  }
  try {
    who.root.effect(() => () => endActivation(act), HOST.labels.activation)
  } catch {
    return undefined
  }
  who.root[HOST.activationKey] = act
  return act
}

/** Whether `act` is still its root fiber's activation (it ends once, and is never reused). */
export const isCurrent = (act) => !act.ended && act.root[HOST.activationKey] === act

function endActivation(act) {
  act.ended = true
  if (act.root[HOST.activationKey] === act) delete act.root[HOST.activationKey]
  for (const registry of [...act.registries]) registry.activationEnded(act)
  act.registries.clear()
}

/**
 * Record one counted outcome. Returns true exactly when this outcome quarantines the activation:
 * among its last QUARANTINE.windowOutcomes counted outcomes, the failures are now **more than**
 * QUARANTINE.moreThanFailures (design §13.5; DECIDED #44, #45: the 5th failure in the last 10).
 * @param {object} act
 * @param {boolean} failed
 */
export function recordOutcome(act, failed) {
  if (act.quarantined || act.ended) return false
  act.outcomes.push(failed)
  if (act.outcomes.length > QUARANTINE.windowOutcomes) act.outcomes.shift()
  const failures = act.outcomes.filter(Boolean).length
  if (failures <= QUARANTINE.moreThanFailures) return false
  act.quarantined = true
  return true
}

/** Take the activation's committed events, for retirement; the list is then empty. */
export const takeCommitted = (act) => act.committed.splice(0)
