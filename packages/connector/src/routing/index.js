/**
 * The connector's routing module (task C-ROUTE): managed state, the router, watch = manage, the
 * `message_fishball` / `ask_fishball` routing with the no-recipient rules, the live-offer ledger and
 * the host-only hand-over service (`../handover/`). Composition only; C-WIRE mounts it.
 *
 * `openRouting(ctx, {defineDomain, domainTable}, ports)` → `Routing`. Every port is injected, so the
 * module depends on the frozen K1/K3 interfaces only:
 * - `mailbox`: K1 `Mailbox` plus `onAcked(listener(principalKey, receipts)) → dispose`, fired after
 *   each successful `inbox_ack` with its receipts (the signal that frees room for held messages and
 *   marks offers acked). **C-WIRE and C-TOOLS must route every `inbox_ack` through this port.**
 * - `pairs` K1 `PairStore`; `tokens` K1 `TokenRegistry`; `presence` K1 `Presence`;
 * - `settings`: `{get() → {fishballToken?, maxQueuedInputs?}, onChange(fn) → dispose}`, the live
 *   `routing.fishballToken` and `maxQueuedInputs` (unset = K1 QUEUE.maxQueuedInputs);
 * - `sessions`: `{exists(id), onTurnFinished(fn(id, {running, queued})), onState(fn(id, {running,
 *   pendingInteraction}))}` over root session ids (binding it to DSH is C-WIRE's);
 * - `logger` (`{warn}`), `now` (unused by the rules; kept for C-WIRE's uniform ports).
 *
 * One commit path (`produce`): every event C-ROUTE produces asks the router first and commits to the
 * one recipient it names, or to nobody (R-EVS-03, EVT-DT-01 rule 9: exactly one mailbox entry).
 * `message` routing and the held-queue flush share one serial chain, so a new message never
 * overtakes a held one (K1c-3).
 */
import { randomUUID } from 'node:crypto'
import { DECISION_KIND_OF, EVENT_TYPE, OFFER_TYPES, QUEUE, REFUSAL, RETIREMENT_REASON, parseOfferId } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { createHandover } from '../handover/index.js'
import { assertDraft } from '../mailbox/draft.js'
import { LOG, MISUSE, ROUTE_FALLBACK } from './constants.js'
import { createHeldQueue } from './held.js'
import { createManagedState } from './managed.js'
import { createOfferLedger } from './offers.js'
import { createRouter } from './router.js'
import { openRoutingTables } from './store.js'
import { listenerSet, serialChain } from './support.js'

export { createRouter } from './router.js'
export { ROUTE_FALLBACK } from './constants.js'

const UNAVAILABLE = Object.freeze({ ok: false, code: REFUSAL.unavailable })
const OK = Object.freeze({ ok: true })

/**
 * @returns {Promise<Routing>} see the module comment; members `router`, `managed`, `handover`,
 *   `provide`, `messageFishball`, `askFishball`, `offer`, `settle`, `withdraw`, `close`.
 */
export async function openRouting(ctx, storageDomain, { mailbox, pairs, tokens, presence, settings, sessions, logger }) {
  const { tables, close: closeTables } = await openRoutingTables(ctx, storageDomain)
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  const routeSerial = serialChain()
  const disposers = []

  /** The live `maxQueuedInputs` (K1c-3), checked: a bad setting is a wiring bug, not a client's refusal. */
  function maxQueuedInputs() {
    const value = settings.get().maxQueuedInputs ?? QUEUE.maxQueuedInputs
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(MISUSE.maxQueuedInputs)
    return value
  }
  const designatedEntry = () => settings.get().fishballToken
  /**
   * The designated Fishball's principal, only while `routing.fishballToken` names an entry that is
   * paired (K1c-3) and enabled: a paired but disabled designated entry counts as no designated
   * Fishball (Fishball 2026-11-14 #6), so held messages wait and an `ask` is `unavailable`.
   */
  const designated = () => {
    const entryKey = designatedEntry()
    if (entryKey === undefined || tokens.get(entryKey)?.enabled !== true) return undefined
    return pairs.pairOf(entryKey)?.principalKey
  }

  const held = createHeldQueue({ table: tables.held, newKey: randomUUID, limit: maxQueuedInputs })
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
    if (route.recipient === null) {
      if (subject.type === EVENT_TYPE.notice && route.fallback === ROUTE_FALLBACK.dropped) logger.warn(LOG.format, LOG.noticeDropped, route.fallback)
      return { route }
    }
    const committed = await mailbox.commit(route.recipient, { type: subject.type, ...draft })
    if (!committed.ok) logger.warn(LOG.format, LOG.commitRefused, committed.code)
    return { route, committed }
  }

  const ledger = createOfferLedger({ mailbox, produce })
  managed = createManagedState({
    table: tables.managed,
    logger,
    // The change stands even if a retirement fails (it is logged): the session is unmanaged either way.
    leave: (sessionId, manager, reason) => ledger.retireSession(sessionId, manager, reason).catch(warn(LOG.retireFailed)),
  })

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
  disposers.push(managed.state.onChange(changed), presence.onChange(changed))
  disposers.push(pairs.onChange(() => { changed(); flush() }))
  disposers.push(settings.onChange(() => { changed(); flush() }))

  /**
   * The pair each entry was last seen bound to, so a revocation still finds the manager after the
   * pair itself has been removed in the same sync (a delete frees the pair, R-ID-13).
   */
  const lastPair = new Map()
  const remember = () => { for (const pair of pairs.list()) lastPair.set(pair.entryKey, pair.principalKey) }
  remember()
  disposers.push(pairs.onChange(remember))
  // W3 (Fishball 2026-11-14 #1): a revoked entry's sessions become unmanaged and its live offers are
  // retired `revoked` (R-ROUTE-06, R-TOK-05). The `system` note and the rest are C-REVOKE's.
  disposers.push(tokens.onRevoked((entryKey) => {
    changed()
    const principalKey = pairs.pairOf(entryKey)?.principalKey ?? lastPair.get(entryKey)
    if (principalKey !== undefined) managed.endAllOf(principalKey, RETIREMENT_REASON.revoked).catch(warn(LOG.retireFailed))
  }))

  disposers.push(mailbox.onAcked((principalKey, receipts) => {
    ledger.markAcked(principalKey, receipts)
    if (principalKey === designated()) flush()
  }))

  // Watch = manage (R-WATCH-01/02): produced for managed sessions only; the router drops the rest.
  const watch = (type) => (sessionId, facts) => {
    produce({ type, sessionId }, { sourceSessionId: sessionId, correlationId: null, payload: { sessionId, ...facts } }).catch(warn(LOG.watchFailed))
  }
  disposers.push(sessions.onTurnFinished(watch(EVENT_TYPE.turnFinished)), sessions.onState(watch(EVENT_TYPE.state)))

  /** An answerable draft for `descriptor` (its offer id is the offer and the correlation id). */
  function answerable(type, sessionId, descriptor) {
    const parsed = parseOfferId(descriptor?.offerId)
    if (parsed === undefined || ledger.has(descriptor.offerId)) throw new TypeError(MISUSE.offer)
    const draft = {
      type, sourceSessionId: sessionId, correlationId: descriptor.offerId,
      offer: { offerId: descriptor.offerId, revision: parsed.revision, decisionKind: DECISION_KIND_OF[type] }, payload: descriptor,
    }
    assertDraft(draft)
    return draft
  }

  /** Commits an answerable event and records it as live; `answer` resolves an ask's waiting call. */
  async function commitAnswerable(type, sessionId, descriptor, answer) {
    const { type: ignored, ...draft } = answerable(type, sessionId, descriptor)
    const { route, committed } = await produce({ type, sessionId }, draft)
    if (route.recipient !== null && committed.ok) {
      ledger.record(descriptor.offerId, { type, sessionId, principalKey: route.recipient, eventId: committed.eventId, answer })
    }
    return { route, committed }
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
     * `message_fishball` (R-ROUTE-03, R-CON-09, K1c-3): to the manager, else the designated paired
     * Fishball, else held. `queue-full` is the mailbox's bound or the held queue's.
     */
    messageFishball(sessionId, payload) {
      const draft = { type: EVENT_TYPE.message, sourceSessionId: sessionId ?? null, correlationId: null, payload }
      assertDraft(draft)
      return routeSerial(async () => {
        const { route, committed } = await produce({ type: EVENT_TYPE.message, sessionId: draft.sourceSessionId }, draft)
        if (route.recipient === null) return held.hold(draft.sourceSessionId, payload)
        return committed.ok ? OK : Object.freeze({ ok: false, code: committed.code })
      })
    },

    /**
     * `ask_fishball` (R-CON-08/09, R-ROUTE-03/04): `unavailable` at once when the session is
     * unmanaged and no designated paired Fishball is connected; otherwise one `ask` offer, and the
     * call stays pending until `settle` (an answer) or `withdraw` resolves it.
     */
    async askFishball(sessionId, descriptor) {
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
     * @returns `{recipient, eventId}` or the K1 `NoRecipient`
     */
    async offer(sessionId, type, descriptor) {
      if (!OFFER_TYPES.includes(type)) throw new TypeError(MISUSE.produce)
      const { route, committed } = await commitAnswerable(type, sessionId, descriptor)
      if (route.recipient === null) return route
      return committed.ok ? Object.freeze({ recipient: route.recipient, eventId: committed.eventId }) : Object.freeze({ ok: false, code: committed.code })
    },

    /**
     * An offer's or ask's outcome (C-TOOLS' first committed answer, or the user's): one `settlement`
     * to the pair that held it (R-EVS-03 follow-up); a waiting `ask_fishball` gets `{ok: true, settlement}`.
     * @param settlement - the K1 settlement payload `{approvalId, outcome, by, answers?}`
     * @returns whether the offer was live
     */
    async settle(offerId, settlement) {
      const holder = ledger.holderOf(offerId)
      if (holder === undefined) return false
      ledger.settle(offerId, Object.freeze({ ok: true, settlement }))
      await produce({ type: EVENT_TYPE.settlement, sessionId: holder.sessionId, followsPrincipal: holder.principalKey },
        { sourceSessionId: holder.sessionId, correlationId: offerId, payload: settlement })
      return true
    },

    /**
     * The session's call ended before an answer (or the ask's event was dropped, R-TOK-05): an offer
     * is retired `withdrawn` from its pair; a waiting `ask_fishball` answers `unavailable`.
     * @returns whether the offer was live
     */
    withdraw: (offerId) => ledger.withdraw(offerId, RETIREMENT_REASON.withdrawn, UNAVAILABLE),

    async close() {
      for (const dispose of disposers.splice(0)) dispose?.()
      await managed.drain()
      await routeSerial(async () => {})
      await closeTables()
    },
  }
}
