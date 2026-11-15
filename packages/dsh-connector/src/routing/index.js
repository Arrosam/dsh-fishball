/**
 * The connector's routing module (task C-ROUTE): managed state, the router, watch = manage, the
 * `message_agent` / `ask_agent` routing with the no-recipient rules, the live-offer ledger and
 * the host-only hand-over service (`../handover/`). Composition only; C-WIRE mounts it.
 *
 * `openRouting(ctx, {defineDomain, domainTable}, ports)` → `Routing`. Every port is injected, so the
 * module depends on the frozen K1/K3 interfaces only:
 * - `mailbox`: K1 `Mailbox` plus `onAcked(listener(principalKey, receipts)) → dispose`, fired after
 *   each successful `inbox_ack` with its receipts (the signal that frees room for held messages and
 *   marks offers acked). **C-WIRE and C-TOOLS must route every `inbox_ack` through this port.**
 * - `pairs` K1 `PairStore`; `tokens` K1 `TokenRegistry` (read only: `get`; routing does not
 *   subscribe to `onRevoked`, C-REVOKE calls `endPrincipal` from its own handler); `presence` K1
 *   `Presence`;
 * - `settings`: `{get() → {agentToken?, maxQueuedInputs?}, onChange(fn) → dispose}`, the live
 *   `routing.agentToken` and `maxQueuedInputs` (unset = K1 QUEUE.maxQueuedInputs). K1
 *   `TokenRegistry` has no change event besides `onRevoked`, so a re-enable, an added or a removed
 *   entry reaches this module only through this port: **C-WIRE fires `settings.onChange` after
 *   `TokenRegistry.apply` has resolved**, so the K3 listeners and the held-queue flush read the new
 *   entries. (C-MAILBOX reads `maxQueuedInputs` once at creation, this queue reads it live: C-WIRE
 *   aligns the two when it builds them.)
 * - `sessions`: `{exists(id), onTurnFinished(fn(id, {running, queued})), onState(fn(id, {running,
 *   pendingInteraction}))}` over root session ids (binding it to DSH is C-WIRE's);
 * - `logger` (`{warn}`).
 *
 * One commit path (`produce`): every event C-ROUTE produces asks the router first and commits to the
 * one recipient it names, or to nobody (R-EVS-03, EVT-DT-01 rule 9: exactly one mailbox entry).
 * `message` routing and the held-queue flush share one serial chain, so a new message never
 * overtakes a held one (K1c-3). Every ledger change (offer and ask commits, `settle`, `withdraw`,
 * `askDropped`) and every management change share the managed chain (`managed.withState`), so
 * none of them lands halfway through another (K1c-2).
 */
import { randomUUID } from 'node:crypto'
import { DECISION_KIND_OF, EVENT_TYPE, OFFER_TYPES, QUEUE, REFUSAL, RETIREMENT_REASON, parseOfferId } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { createHandover } from '../handover/index.js'
import { isNonEmptyString } from '../mailbox/draft.js'
import { HELD_MINIMUM, LOG, MISUSE } from './constants.js'
import { createHeldQueue } from './held.js'
import { createManagedState } from './managed.js'
import { createOfferLedger } from './offers.js'
import { createRouter } from './router.js'
import { openRoutingTables } from './store.js'
import { checkedFields, listenerSet, serialChain } from './support.js'

export { createRouter } from './router.js'
export { ROUTE_FALLBACK } from './constants.js'

const UNAVAILABLE = Object.freeze({ ok: false, code: REFUSAL.unavailable })
const OK = Object.freeze({ ok: true })
/** `endPrincipal`'s answer for an entry with no current or last-seen pair: nothing was managed or live. */
const NOBODY_ENDED = Object.freeze({ principalKey: undefined, sessions: Object.freeze([]), offers: Object.freeze([]) })

/**
 * A detached copy of a caller's payload, taken as C-MAILBOX snapshots a draft (`structuredClone`).
 * A value that cannot be copied is not a valid payload: a caller bug, like any other bad draft.
 * C-MAILBOX's private `snapshotOf` is the same copy; it is not exported and its folder is outside
 * C-ROUTE's, so a later task may move both into one shared helper (as `serialChain`, support.js).
 */
function detachedPayload(payload) {
  try {
    return structuredClone(payload)
  } catch {
    throw new TypeError(MISUSE.payload)
  }
}

/**
 * @returns {Promise<Routing>} see the module comment; members `router`, `managed`, `handover`,
 *   `provide`, `messageAgent`, `askAgent`, `offer`, `settle`, `withdraw`, `askDropped`,
 *   `endPrincipal`, `close`.
 */
export async function openRouting(ctx, storageDomain, { mailbox, pairs, tokens, presence, settings, sessions, logger }) {
  const { tables, close: closeTables } = await openRoutingTables(ctx, storageDomain)
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  const routeSerial = serialChain()
  const disposers = []

  /** The live `maxQueuedInputs` (K1c-3), checked: a bad setting is a wiring bug, not a client's refusal. */
  function maxQueuedInputs() {
    const value = settings.get().maxQueuedInputs ?? QUEUE.maxQueuedInputs
    if (!Number.isSafeInteger(value) || value < HELD_MINIMUM.queuedInputs) throw new TypeError(MISUSE.maxQueuedInputs)
    return value
  }
  const designatedEntry = () => settings.get().agentToken
  /**
   * The designated agent's principal, only while `routing.agentToken` names an entry that is
   * paired (K1c-3) and enabled: a paired but disabled designated entry counts as no designated
   * agent (Fishball 2026-11-14 #6), so held messages wait and an `ask` is `unavailable`.
   */
  const designated = () => {
    const entryKey = designatedEntry()
    if (entryKey === undefined || tokens.get(entryKey)?.enabled !== true) return undefined
    return pairs.pairOf(entryKey)?.principalKey
  }

  const held = createHeldQueue({ table: tables.held, newKey: randomUUID, limit: maxQueuedInputs, onDeleteFailed: warn(LOG.heldDeleteFailed) })
  // `managed` is assigned below, before any call can reach the router (the router and the ledger
  // need each other's owner only at call time).
  let managed
  const router = createRouter({
    managerOf: (sessionId) => managed.state.managerOf(sessionId),
    designated,
    isConnected: (principalKey) => presence.isConnected(principalKey),
    heldCount: held.count,
  })

  /**
   * The one commit path: routes `subject`, then commits `{type, ...draft}` to its recipient.
   * @returns `{route, committed?}`: `committed` is the mailbox's CommitResult when there was a recipient.
   */
  async function produce(subject, draft) {
    const route = router.recipientFor(subject)
    if (route.recipient === null) return { route }
    const committed = await mailbox.commit(route.recipient, { type: subject.type, ...draft })
    if (!committed.ok) logger.warn(LOG.format, LOG.commitRefused, committed.code)
    return { route, committed }
  }

  // The change stands even if a retirement fails (it is logged): the session is unmanaged either way.
  const ledger = createOfferLedger({ mailbox, produce, onRetireFailed: warn(LOG.retireFailed) })
  managed = createManagedState({ table: tables.managed, logger, leave: ledger.retireSession })

  /** Moves held messages into the designated mailbox, in order, as far as they fit (K1c-3). */
  function flush() {
    return routeSerial(async () => {
      const recipient = designated()
      if (recipient !== undefined) await held.flushTo(recipient, (to, draft) => mailbox.commit(to, draft))
    }).catch(warn(LOG.flushFailed))
  }

  // K3 onChange: managed set, names, connection, entry state and designation (handover.d.ts).
  const changes = listenerSet(logger, LOG.format, LOG.listenerFailed)
  const changed = () => changes.fire()
  /**
   * The pair each entry was last seen bound to, so a revocation still finds the manager after the
   * pair itself has been removed in the same sync (a delete frees the pair, R-ID-13). An entry is
   * forgotten once `endPrincipal` has ended its sessions and the registry no longer lists it. A
   * `pairs.onChange` between that and the pair's removal (C-REVOKE removes it after the drop)
   * remembers it again; it then stays as one stale record, tolerated because a deleted entry's key
   * is never listed again, so nothing reads it.
   */
  const lastPair = new Map()
  const remember = () => { for (const pair of pairs.list()) lastPair.set(pair.entryKey, pair.principalKey) }
  remember()
  disposers.push(managed.state.onChange(changed), presence.onChange(changed))
  disposers.push(pairs.onChange(() => { remember(); changed(); flush() }))
  disposers.push(settings.onChange(() => { changed(); flush() }))

  disposers.push(mailbox.onAcked((principalKey, receipts) => {
    ledger.markAcked(principalKey, receipts)
    if (principalKey === designated()) flush()
  }))

  // Watch = manage (R-WATCH-01/02): produced for managed sessions only; the router drops the rest.
  const watch = (type) => (sessionId, facts) => {
    produce({ type, sessionId }, { sourceSessionId: sessionId, correlationId: null, payload: { sessionId, ...facts } }).catch(warn(LOG.watchFailed))
  }
  disposers.push(sessions.onTurnFinished(watch(EVENT_TYPE.turnFinished)), sessions.onState(watch(EVENT_TYPE.state)))

  /** An answerable draft's fields for `descriptor` (its offer id is the offer and the correlation id). */
  function answerable(type, sessionId, descriptor) {
    const parsed = parseOfferId(descriptor?.offerId)
    if (parsed === undefined) throw new TypeError(MISUSE.offer)
    return checkedFields(type, {
      sourceSessionId: sessionId, correlationId: descriptor.offerId,
      offer: { offerId: descriptor.offerId, revision: parsed.revision, decisionKind: DECISION_KIND_OF[type] }, payload: descriptor,
    })
  }

  /**
   * Commits an answerable event and records it as live; `answer` resolves an ask's waiting call.
   * Route, commit and record run as one step on the managed chain (`withState`), so a release, Take
   * back or revocation either runs before it (the offer then routes by the new state) or after it
   * (and then finds and retires the recorded offer); never in between (K1c-2).
   */
  function commitAnswerable(type, sessionId, descriptor, answer) {
    const draft = answerable(type, sessionId, descriptor)
    return managed.withState(async () => {
      // Checked on the chain, so two concurrent offers with one id cannot both pass it.
      if (ledger.has(descriptor.offerId)) throw new TypeError(MISUSE.offer)
      const { route, committed } = await produce({ type, sessionId }, draft)
      if (route.recipient !== null && committed.ok) {
        ledger.record(descriptor.offerId, { type, sessionId, principalKey: route.recipient, eventId: committed.eventId, answer })
      }
      return { route, committed }
    })
  }

  await flush()
  const handover = createHandover({
    managed, produce, pairs, tokens, presence, designatedEntry, changes,
    sessionExists: (sessionId) => sessions.exists(sessionId),
  })

  // Not frozen: this is the composition C-WIRE wires from, not a service handed to another plugin
  // (the K3 service and the K1 objects inside it are frozen).
  return {
    router,
    managed: managed.state,
    handover: handover.service,
    provide: handover.provide,

    /**
     * `message_agent` (R-ROUTE-03, R-CON-09, K1c-3): to the manager, else the designated paired
     * agent, else held. `queue-full` is the mailbox's bound or the held queue's.
     * @throws TypeError (synchronously) for a bad session id, or a payload that cannot be copied or
     *   is not a valid K1 message payload
     */
    messageAgent(sessionId, payload) {
      // A held record must pass its schema at the next open (store.js), so a bad id is refused here.
      if (sessionId !== undefined && sessionId !== null && !isNonEmptyString(sessionId)) throw new TypeError(MISUSE.sessionId)
      // The payload is copied at the call, and only the copy is checked, routed and held. The step
      // below runs later on the chain and a held message waits until a flush: a caller that changed
      // its object meanwhile would change what was checked, and could turn the head of the held
      // queue into a draft the mailbox refuses, which would block every message behind it.
      const draft = checkedFields(EVENT_TYPE.message, { sourceSessionId: sessionId ?? null, correlationId: null, payload: detachedPayload(payload) })
      return routeSerial(async () => {
        const { route, committed } = await produce({ type: EVENT_TYPE.message, sessionId: draft.sourceSessionId }, draft)
        if (route.recipient === null) return held.hold(draft.sourceSessionId, draft.payload)
        return committed.ok ? OK : Object.freeze({ ok: false, code: committed.code })
      })
    },

    /**
     * `ask_agent` (R-CON-08/09, R-ROUTE-03/04): `unavailable` at once when the session is
     * unmanaged and no designated paired agent is connected; otherwise one `ask` offer, and the
     * call stays pending until `settle` (an answer) or `withdraw` resolves it.
     */
    async askAgent(sessionId, descriptor) {
      let answer
      const answered = new Promise((resolve) => { answer = resolve })
      const { route, committed } = await commitAnswerable(EVENT_TYPE.ask, sessionId, descriptor, answer)
      if (route.recipient === null) return UNAVAILABLE
      return committed.ok ? answered : Object.freeze({ ok: false, code: committed.code })
    },

    /**
     * The approval hook: a `permission`, `question` or `plan-review` of `sessionId`. A managed
     * session's offer goes to its manager, connected or not (PLAT-UC-03 E2); an unmanaged one's is
     * the user's (`to-user`, R-CON-09).
     * @returns `{recipient, eventId}` or the K1 `NoRecipient`. (`{ok: false, code}` only if the
     *   mailbox refused the commit, which K1 QUEUE never does for an offer.)
     */
    async offer(sessionId, type, descriptor) {
      if (!OFFER_TYPES.includes(type)) throw new TypeError(MISUSE.offerType)
      const { route, committed } = await commitAnswerable(type, sessionId, descriptor)
      if (route.recipient === null) return route
      return committed.ok ? Object.freeze({ recipient: route.recipient, eventId: committed.eventId }) : Object.freeze({ ok: false, code: committed.code })
    },

    /**
     * An offer's or ask's outcome (C-TOOLS' first committed answer, or the user's): one `settlement`
     * to the pair that held it (R-EVS-03 follow-up); a waiting `ask_agent` gets `{ok: true, settlement}`.
     *
     * Runs on the managed chain, as the offer's own commit and `withdraw` do. Off it, a settle that
     * arrives while its offer's commit is still queued or running there finds nothing live and
     * returns `false`, and the offer then lands in the manager's mailbox with nothing left to settle
     * or retire it. On it, a release or revocation either retires the offer first (settle then finds
     * nothing) or runs after the settle (and finds nothing to retire). The settlement is copied at
     * the call, because the step reads it later; its draft is checked before the offer leaves the
     * ledger, so a bad settlement leaves the offer live instead of dead in the mailbox.
     * @param settlement - the K1 settlement payload `{approvalId, outcome, by, answers?}`
     * @returns whether the offer was live
     * @throws (rejects) TypeError for a settlement that cannot be copied or is not a valid K1 settlement
     */
    async settle(offerId, settlement) {
      const payload = detachedPayload(settlement)
      return managed.withState(async () => {
        const holder = ledger.holderOf(offerId)
        if (holder === undefined) return false
        const draft = checkedFields(EVENT_TYPE.settlement, { sourceSessionId: holder.sessionId, correlationId: offerId, payload })
        ledger.settle(offerId, Object.freeze({ ok: true, settlement: payload }))
        await produce({ type: EVENT_TYPE.settlement, sessionId: holder.sessionId, followsPrincipal: holder.principalKey }, draft)
        return true
      })
    },

    /**
     * The session's call ended before an answer: the offer (or ask) is retired `withdrawn` from its
     * pair; a waiting `ask_agent` answers `unavailable`.
     * Runs on the managed chain, as the offer's own commit does: a withdraw that arrives while its
     * offer is still queued there runs after it, and so finds it.
     * @returns whether the offer was live
     */
    withdraw: (offerId) => managed.withState(() => ledger.withdraw(offerId, RETIREMENT_REASON.withdrawn, UNAVAILABLE)),

    /**
     * C-REVOKE: an `ask` event was dropped with its mailbox (delete, or the end of the 30 days;
     * K1 `Mailbox.drop` / `expireHolds` `droppedAsks`). Its asker answers `unavailable` at once
     * (R-TOK-05); nothing is retired or committed, because the pair that held it is gone.
     * @returns whether the ask was live
     */
    askDropped: (offerId) => managed.withState(async () => ledger.settle(offerId, UNAVAILABLE)),

    /**
     * C-REVOKE step 1 (R-ROUTE-06, R-TOK-05, R-WATCH-01): the revoked entry's principal stops
     * managing every session, and each of their live offers is retired `revoked`. C-REVOKE calls
     * it from its own `onRevoked` handler (routing no longer subscribes, W4 brief G1), because a
     * delete must drop the mailbox only after these retirements, and a listener cannot be awaited.
     * The principal is the entry's pair, or the pair it was last seen bound to when the same sync
     * removed it (`lastPair`). An `ask` is not retired: on disable its asker keeps waiting; on a
     * delete C-REVOKE answers it through `askDropped` after the drop.
     * @param options.freshRetirements - `true` for a disable (an acked offer gets a fresh
     *   `retirement` in the held box, pollable on re-enable); `false` for a delete (the box is
     *   dropped next, so nothing is committed for an acked offer; offers.js)
     * @returns once every retirement has run (a failed one is logged and still listed):
     *   `{principalKey, sessions, offers}`, the sessions it ended and their retired offers
     *   (`{offerId, sessionId, type}`), so C-REVOKE writes one note per session and hands each offer
     *   to the user;
     *   `{principalKey: undefined, sessions: [], offers: []}` when it knows no current or last-seen pair
     * @throws TypeError (synchronously) for a bad entry key or options (a caller bug)
     * @throws (rejects) the managed table's storage error (`endAllOf`): the sessions before it are
     *   ended, the rest stay managed, and the entry's last pair is kept, so a repeat call finds them.
     *   C-REVOKE must then not drop the mailbox (the drop follows the retirements only).
     */
    endPrincipal(entryKey, options) {
      if (!isNonEmptyString(entryKey)) throw new TypeError(MISUSE.entryKey)
      if (typeof options?.freshRetirements !== 'boolean') throw new TypeError(MISUSE.freshRetirements)
      // The entry's state changed (K3 onChange: entry state), and a revocation from a credential-store
      // sync (TokenRegistry.refresh) never passes `settings.onChange`, so this is its only signal.
      changed()
      const principalKey = pairs.pairOf(entryKey)?.principalKey ?? lastPair.get(entryKey)
      // Forgotten only once handled, so a call that rejects can be repeated (see lastPair).
      const forget = () => { if (tokens.get(entryKey) === undefined) lastPair.delete(entryKey) }
      if (principalKey === undefined) return Promise.resolve(NOBODY_ENDED)
      const leaveOptions = Object.freeze({ freshRetirements: options.freshRetirements })
      return managed.endAllOf(principalKey, RETIREMENT_REASON.revoked, leaveOptions).then((ended) => {
        forget()
        return Object.freeze({
          principalKey,
          sessions: Object.freeze(ended.map(({ sessionId }) => sessionId)),
          offers: Object.freeze(ended.flatMap(({ left }) => left)),
        })
      })
    },

    async close() {
      for (const dispose of disposers.splice(0)) dispose?.()
      await managed.drain()
      await routeSerial(async () => {})
      await closeTables()
    },
  }
}
