/**
 * Revocation (task C-REVOKE step 2; design §5.3; R-TOK-05, R-TOK-09, R-ROUTE-04, R-ROUTE-06,
 * R-WATCH-01, R-CON-05; W4 briefs C-REVOKE, G8). What a disable or a delete of a token entry does
 * beyond what its owners already do themselves: C-TOKENS bumps the generation and C-OAUTH revokes
 * the entry's OAuth tokens (both on their own `onRevoked`), so this module touches neither.
 *
 * `createRevocation(ports)` → `{start, close}`. It subscribes to `tokens.onRevoked` and
 * `settings.onChange` at once, so C-WIRE builds it **before** the token registry's start sync and
 * no revocation that sync announces is missed; `start()` then runs after that sync (see `start`).
 *
 * One job per revocation, serial per entry: two jobs of one entry never overlap (a disable and the
 * delete that follows it run in order), jobs of different entries may.
 * - Always: the entry's listen streams close (`closeEntry`); routing ends the principal's
 *   management and retires its live offers (`endPrincipal`), which hands each waiting call to the
 *   user in its session (routing `onLeft`, the one port every end of management fires, C-WIRE-2);
 *   then one `system` note per ended session. A note that fails is logged, never retried: the
 *   management change stands either way.
 * - Disable: the pair's box is held **before** `endPrincipal` (`freshRetirements: true`), so the
 *   fresh retirements land in the held box with no hint and are pollable on re-enable.
 * - Delete: `endPrincipal` (`freshRetirements: false`), and only once it has resolved the box is
 *   dropped (the user's decision at the W3 merge: the drop never runs before the `revoked`
 *   retirements of that pair); then the pair is removed (its id and name are free).
 * C-WIRE-2 removed the designated agent (the user's answer q5, 2026-11-17: "Remove agentToken
 * entirely") and `ask_agent`, so a delete clears no designated role and answers no ask; the
 * mailbox's `droppedAsks` is always empty and is not read.
 * - A step that rejects is logged and retried from that step after `REVOCATION_TIMING.retryMs`;
 *   earlier steps are not repeated, later ones wait. So a rejected `endPrincipal` never drops.
 *   Limit: when `endPrincipal` rejects partway, the sessions it ended before the failure are not
 *   in the retry's answer, so they get no note (the retry ends and notes the rest); routing does
 *   not report a partial end (routing/index.js `endPrincipal`).
 * - Re-enable (TokenRegistry has no event for it, so `settings.onChange`, which C-WIRE fires after
 *   `TokenRegistry.apply`, as routing's own port): a held entry that is enabled again gets
 *   `Mailbox.release`, on the entry's chain, so after the disable job that held it.
 * - Hold expiry (G8): `Mailbox.expireHolds(now)` at start and then every
 *   `REVOCATION_TIMING.expirySweepMs`. It only drops events; no timer settles an offer (R-CON-05).
 */
import { REVOCATION_KIND } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { serialChain } from '../serial.js'
import { RETRY_CLOSED, createRetrier, writeNotes } from '../background.js'
import { LOG, REVOCATION_NOTE, REVOCATION_TIMING, STEP } from './constants.js'

export { LOG as REVOCATION_LOG, REVOCATION_NOTE, REVOCATION_TIMING } from './constants.js'

const LEAVE = Object.freeze({
  [REVOCATION_KIND.disabled]: Object.freeze({ freshRetirements: true }),
  [REVOCATION_KIND.deleted]: Object.freeze({ freshRetirements: false }),
})

/**
 * @param {object} ports
 * @param ports.tokens - K1 `TokenRegistry` (`get`, `onRevoked`)
 * @param ports.routing - the routing composition: `endPrincipal`
 * @param ports.mailbox - K1 `Mailbox` plus `expireHolds(at)` (C-MAILBOX): `hold`, `release`, `drop`, `expireHolds`
 * @param ports.pairs - K1 `PairStore`: `pairOf`, `list`, `remove`
 * @param {(entryKey: string) => void} ports.closeEntry - C-HTTP's: closes the entry's listen streams
 * @param ports.settings - `{onChange(fn) → dispose}`, the port routing takes (re-enables)
 * @param ports.notes - K1d `SessionNotes`
 * @param {() => number} ports.now - epoch ms
 * @param ports.timers - `{setTimeout, clearTimeout}`, the globals by default
 * @param ports.logger - `{warn}`
 * @returns `{start, close}`
 */
export function createRevocation({ tokens, routing, mailbox, pairs, closeEntry, settings, notes, now, timers = globalThis, logger }) {
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  /** entryKey → its serial chain (created on first use; entries are few, so none is ever removed). */
  const chains = new Map()
  const chainOf = (entryKey) => chains.get(entryKey) ?? chains.set(entryKey, serialChain()).get(entryKey)
  /** entryKey → principalKey of every entry whose box this module holds (disabled), until released or deleted. */
  const held = new Map()
  const sweeps = serialChain()
  const retrier = createRetrier({ timers, logger, format: LOG.format, retryMs: REVOCATION_TIMING.retryMs })
  /** Runs one step until it resolves (`../background.js`); its failures are logged with the step's name. */
  const untilDone = (name, step) => retrier.untilDone(`${LOG.stepFailed}: ${name}`, step)
  let sweepTimer
  let closed = false

  /** Queues `job` on the entry's chain; a job stopped by `close` ends quietly, any other failure is logged. */
  function enqueue(entryKey, job) {
    chainOf(entryKey)(job).catch((error) => { if (error !== RETRY_CLOSED) warn(LOG.stepFailed)(error) })
  }

  /** One note per ended session (failures logged, not retried); routing handed the offers to the user. */
  const tellEnded = ({ sessions }) => writeNotes(notes, sessions, REVOCATION_NOTE.text, warn(LOG.noteFailed))

  /** End the principal's management (retried until it resolves) and tell the sessions and the user. */
  async function endManagement(entryKey, kind) {
    const ended = await untilDone(STEP.endPrincipal, () => routing.endPrincipal(entryKey, LEAVE[kind]))
    await tellEnded(ended)
    return ended
  }

  /** `at`: the time of the disable, read once, so a retried hold keeps the 30 days from the disable (K1 `hold`). */
  async function disable(entryKey, principalKey, at) {
    if (principalKey !== undefined) await untilDone(STEP.hold, () => mailbox.hold(principalKey, at))
    await endManagement(entryKey, REVOCATION_KIND.disabled)
  }

  async function remove(entryKey) {
    // The principal routing ended is the one whose box goes: it knows the pair even when the same
    // sync already removed it (routing `lastPair`).
    const { principalKey } = await endManagement(entryKey, REVOCATION_KIND.deleted)
    if (principalKey !== undefined) await untilDone(STEP.drop, () => mailbox.drop(principalKey))
    await untilDone(STEP.removePair, () => pairs.remove(entryKey))
  }

  function onRevoked(entryKey, kind) {
    if (closed || LEAVE[kind] === undefined) return
    try { closeEntry(entryKey) } catch (error) { warn(LOG.closeEntryFailed)(error) }
    if (kind === REVOCATION_KIND.disabled) {
      const principalKey = pairs.pairOf(entryKey)?.principalKey
      // Recorded now, not inside the job, so a re-enable that arrives before the job runs is
      // queued behind it and releases the box the job holds.
      if (principalKey !== undefined) held.set(entryKey, principalKey)
      const at = now()
      enqueue(entryKey, () => disable(entryKey, principalKey, at))
    } else {
      held.delete(entryKey)
      enqueue(entryKey, () => remove(entryKey))
    }
  }

  /** Releases every held entry that is enabled again (checked again on its chain, after its earlier jobs). */
  function releaseEnabled() {
    for (const [entryKey, principalKey] of held) {
      if (tokens.get(entryKey)?.enabled !== true) continue
      held.delete(entryKey)
      enqueue(entryKey, async () => {
        const entry = tokens.get(entryKey)
        if (entry?.enabled === true) await untilDone(STEP.release, () => mailbox.release(principalKey))
        // Switched off again meanwhile: still held. Deleted meanwhile: its delete job drops the box.
        else if (entry !== undefined) held.set(entryKey, principalKey)
      })
    }
  }

  /** One hold-expiry sweep. A failure is logged; the next sweep retries. */
  const sweep = () => sweeps(async () => { await mailbox.expireHolds(now()) }).catch((error) => { if (error !== RETRY_CLOSED) warn(LOG.expiryFailed)(error) })

  function armSweep() {
    if (closed) return
    sweepTimer = timers.setTimeout(() => { sweepTimer = undefined; void sweep().then(armSweep) }, REVOCATION_TIMING.expirySweepMs)
  }

  const disposers = [tokens.onRevoked(onRevoked), settings.onChange(releaseEnabled)]

  return Object.freeze({
    /**
     * Run once after the token registry's start sync (C-WIRE): every listed, paired entry is
     * recorded as held; the disabled ones stay so until their re-enable, the enabled ones are
     * released at once (a no-op for a box that is not held; it frees one an entry re-enabled
     * while the connector was stopped, which fires no event). Then the first expiry sweep runs and
     * the periodic one is armed.
     */
    async start() {
      for (const pair of pairs.list()) {
        if (tokens.get(pair.entryKey) !== undefined && !held.has(pair.entryKey)) held.set(pair.entryKey, pair.principalKey)
      }
      releaseEnabled()
      await sweep()
      armSweep()
    },

    /** Stops: no new job, no sweep, every pending retry ends; resolves once running jobs stopped. */
    async close() {
      closed = true
      for (const dispose of disposers.splice(0)) dispose?.()
      if (sweepTimer !== undefined) timers.clearTimeout(sweepTimer)
      retrier.close()
      await Promise.all([...chains.values()].map((chain) => chain(async () => {})))
      await sweeps(async () => {})
    },
  })
}
