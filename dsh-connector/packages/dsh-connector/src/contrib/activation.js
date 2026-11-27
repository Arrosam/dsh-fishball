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
import { randomUUID } from 'node:crypto'
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
    namespace: who.namespace,
    root: who.root,
    ended: false,
    quarantined: false,
    /** The last QUARANTINE.windowOutcomes counted outcomes, oldest first; `true` is a failure. */
    outcomes: [],
    /**
     * The opaque K1 `EventDraft.activationTag` of every event this activation commits. A fresh
     * random one per activation, so `Mailbox.retireContributor(namespace, tag)` retires this
     * activation's events and never those of the contributor's next activation (a reload). The
     * activation therefore keeps no list of what it committed, however many events it emits.
     */
    tag: randomUUID(),
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
  retireCommitted(act)
  for (const registry of [...act.registries]) registry.activationEnded(act)
  act.registries.clear()
}

/**
 * Retire every pending event the activation committed (R-EXT-19), through the mailbox of each
 * registry attached to it now. Each open registry is one connector activation's, with that
 * activation's live mailbox, and every mailbox reads the one durable ledger, so events committed
 * before a connector reload are retired through the new connector's mailbox. A closed registry
 * has detached itself (its mailbox is closed with it). A commit that lands after this (it raced a
 * withdrawal) is retired by emit.js through its own mailbox.
 */
export function retireCommitted(act) {
  for (const registry of act.registries) registry.retireEvents(act)
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
