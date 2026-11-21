/**
 * The connector's routing module (task C-ROUTE; C-WIRE-2): managed state, the router, watch =
 * manage, `message_agent` routing, the live-offer ledger and the host-only hand-over service
 * (`../handover/`). Composition only; C-WIRE mounts it. Since C-WIRE-2 there is no designated
 * agent, no no-recipient queue and no `ask` (the user, 2026-11-17: "不给ask_agent工具"; q5 "Remove
 * agentToken entirely"): an event naming no managed session reaches no principal.
 *
 * `openRouting(ctx, {defineDomain, domainTable}, ports)` → `Routing`. Every port is injected, so the
 * module depends on the frozen K1/K3 interfaces, plus the C-MAILBOX extension `stage` named below:
 * - `mailbox`: K1 `Mailbox` plus C-MAILBOX's `stage` (C-SUCCEED's staged transfer) and
 *   `onAcked(listener(principalKey, receipts)) → dispose`, fired after
 *   each successful `inbox_ack` with its receipts (the signal that marks offers acked).
 *   **C-WIRE and C-TOOLS must route every `inbox_ack` through this port.**
 * - `pairs` K1 `PairStore`; `tokens` K1 `TokenRegistry` (read only: `get`; routing does not
 *   subscribe to `onRevoked`, C-REVOKE calls `endPrincipal` from its own handler); `presence` K1
 *   `Presence`;
 * - `settings`: `{onChange(fn) → dispose}`. K1 `TokenRegistry` has no change event besides
 *   `onRevoked`, so a re-enable, an added or a removed entry reaches this module only through this
 *   port: **C-WIRE fires `settings.onChange` after `TokenRegistry.apply` has resolved**, so the K3
 *   listeners read the new entries. `maxQueuedInputs` is the mailbox's own bound (C-MAILBOX).
 * - `sessions`: `{exists(id), rootOf?(id), onTurnFinished(fn(id, facts))}` over root session ids
 *   (binding it to DSH is C-WIRE's; `facts` is the turn-finished payload without its sessionId). `rootOf(id)` →
 *   `Promise<root id | undefined>` (undefined: no such session) is what Hand over and Take back act
 *   on (review UI-01). C-WIRE's source always has it; a source without it (the routing suites' fakes
 *   of sessions that have no subagents) makes each existing session its own root;
 * - `logger` (`{warn}`).
 *
 * One commit path (`produce`): every event C-ROUTE produces asks the router first and commits to the
 * one recipient it names, or to nobody (R-EVS-03, EVT-DT-01 rule 9: exactly one mailbox entry).
 * Every ledger change (offer commits, `settle`, `withdraw`) and every management change share the
 * managed chain (`managed.withState`), so none of them lands halfway through another (K1c-2).
 */
import { DECISION_KIND_OF, EVENT_TYPE, OFFER_TYPES, REFUSAL, RETIREMENT_REASON, SETTLED_BY, formatOfferId, parseOfferId } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { createHandover } from '../handover/index.js'
import { isNonEmptyString } from '../mailbox/draft.js'
import { LOG, MISUSE, OFFER_REVISION } from './constants.js'
import { createManagedState } from './managed.js'
import { createOfferLedger } from './offers.js'
import { createRouter } from './router.js'
import { openRoutingTables } from './store.js'
import { checkedFields, listenerSet } from './support.js'

export { createRouter } from './router.js'
export { ROUTE_FALLBACK } from './constants.js'

const OK = Object.freeze({ ok: true })
/** `message_agent` from a session nobody manages: it has no recipient (no designated agent since C-WIRE-2). */
const NOT_MANAGED = Object.freeze({ ok: false, code: REFUSAL.notManaged })
/** `endPrincipal`'s answer for an entry with no current or last-seen pair: nothing was managed or live. */
const NOBODY_ENDED = Object.freeze({ principalKey: undefined, sessions: Object.freeze([]), offers: Object.freeze([]) })

/**
 * A detached copy of a caller's payload, taken as C-MAILBOX snapshots a draft (`structuredClone`).
 * A value that cannot be copied is not a valid payload: a caller bug, like any other bad draft.
 * C-MAILBOX's private `snapshotOf` is the same copy; it is not exported and its folder is outside
 * C-ROUTE's, so a later task may move both into one shared helper (as `serialChain`, ../serial.js).
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
 *   `provide`, `messageAgent`, `offer`, `settle`, `withdraw`, `liveOffers`, `succeedPrincipal`,
 *   `endPrincipal`, `close`.
 */
export async function openRouting(ctx, storageDomain, { mailbox, pairs, tokens, presence, settings, sessions, logger }) {
  const { tables, close: closeTables } = await openRoutingTables(ctx, storageDomain)
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  const disposers = []

  // `managed` is assigned below, before any call can reach the router (the router and the ledger
  // need each other's owner only at call time).
  let managed
  const router = createRouter({ managerOf: (sessionId) => managed.state.managerOf(sessionId) })

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
  /**
   * Fired with the offers every end of management retired (release, Take back, revocation), after
   * the retirements: the domain hands each waiting call to the user's prompt in its session
   * (R-ROUTE-06, K1c-2 "The offers then go to the user in the session"). One listener port for all
   * three ways, so no way is left out; a throwing listener is logged.
   */
  const left = listenerSet(logger, LOG.format, LOG.listenerFailed)
  /**
   * Succession participants `(from, to) => Promise<{undo}>`: awaited inside the succession step as
   * it moves `from`'s sessions to `to`, before the managed table changes (C-WIRE-2: the domain's
   * grants follow their sessions; X-SEC X-08). Awaited, not fired (review F05): a participant's move
   * is part of the all-or-nothing step. `undo()` gives back exactly what it moved (not everything
   * `to` holds: `to` may have grants of its own), and runs in reverse order when a later step
   * fails. A participant that rejects must undo its own partial move (at least queue that undo
   * ahead of anything that could read it); routing undoes only the participants that resolved.
   */
  const succeeding = new Set()
  /** Whether the live request `offerId` names is held by `principalKey` (any holder when it is undefined). */
  const heldBy = (offerId, principalKey) => {
    const holder = ledger.holderOf(offerId)
    return holder !== undefined && (principalKey === undefined || holder.principalKey === principalKey)
  }
  async function leave(...args) {
    const offers = await ledger.retireSession(...args)
    if (offers.length > 0) left.fire(offers)
    return offers
  }
  managed = createManagedState({ table: tables.managed, logger, leave })

  // K3 onChange: managed set, names, connection and entry state (handover.d.ts).
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
  disposers.push(pairs.onChange(() => { remember(); changed() }))
  disposers.push(settings.onChange(changed))
  disposers.push(mailbox.onAcked((principalKey, receipts) => ledger.markAcked(principalKey, receipts)))

  // Watch = manage (R-WATCH-01/02): produced for managed sessions only; the router drops the rest.
  // WAKE-REDUCE (the user, 2026-11-21): no `state` event any more. "Running" is the session tools'
  // own `running` result, "idle" is this `turn-finished`, and a pending interaction is its offer.
  disposers.push(sessions.onTurnFinished((sessionId, facts) => {
    produce({ type: EVENT_TYPE.turnFinished, sessionId }, { sourceSessionId: sessionId, correlationId: null, payload: { sessionId, ...facts } }).catch(warn(LOG.watchFailed))
  }))

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
   * Commits an offer and records it as live.
   * Route, commit and record run as one step on the managed chain (`withState`), so a release, Take
   * back or revocation either runs before it (the offer then routes by the new state) or after it
   * (and then finds and retires the recorded offer); never in between (K1c-2).
   */
  function commitAnswerable(type, sessionId, descriptor) {
    const draft = answerable(type, sessionId, descriptor)
    return managed.withState(async () => {
      // Checked on the chain, so two concurrent offers with one id cannot both pass it. The ledger
      // is keyed by request (offers.js), so any revision of a live request counts: a request is
      // offered once, and only a succession commits its next revision.
      if (ledger.has(descriptor.offerId)) throw new TypeError(MISUSE.offer)
      const { route, committed } = await produce({ type, sessionId }, draft)
      if (route.recipient !== null && committed.ok) {
        // A detached copy of the committed draft: a succession re-issues the offer from it.
        ledger.record(descriptor.offerId, { type, sessionId, principalKey: route.recipient, eventId: committed.eventId, draft: structuredClone(draft) })
      }
      return { route, committed }
    })
  }

  /**
   * What a succession commits to the successor for one live offer it now holds (steps 3, 5): its
   * revision n+1 (R-HOST-09, Q-S3-1), whose old event is retired `reissued` later.
   * @returns `{requestId, type, offerId, draft, oldEventId}` (not frozen: the staged commit adds
   *   its `eventId`)
   */
  function successorDraft(requestId) {
    const record = ledger.current(requestId)
    const revision = record.draft.offer.revision + OFFER_REVISION.step
    const offerId = formatOfferId(requestId, revision)
    if (offerId === undefined) throw new RangeError(MISUSE.revision)
    const draft = checkedFields(record.type, {
      ...record.draft, correlationId: offerId,
      offer: { ...record.draft.offer, offerId, revision }, payload: { ...record.draft.payload, offerId },
    })
    return { requestId, type: record.type, offerId, draft, oldEventId: record.eventId }
  }

  const handover = createHandover({
    managed, produce, pairs, tokens, presence, changes,
    rootOf: sessions.rootOf ?? (async (sessionId) => ((await sessions.exists(sessionId)) ? sessionId : undefined)),
  })

  // Not frozen: this is the composition C-WIRE wires from, not a service handed to another plugin
  // (the K3 service and the K1 objects inside it are frozen).
  return {
    router,
    managed: managed.state,
    /** `onLeft(fn(offers))` → dispose: see `leave` above; `offers` is `[{offerId, sessionId, type}]`. */
    onLeft: left.add,
    /** `onSucceeded(fn(from, to) → Promise<{undo}>)` → dispose: see `succeeding` above (R-HOST-09). */
    onSucceeded(participant) {
      succeeding.add(participant)
      return () => { succeeding.delete(participant) }
    },

    /**
     * Runs `step` on the managed chain, after every change and succession queued so far, so it
     * never sees a succession halfway (review F05: the domain's end-of-management grant sweep reads
     * the managed state here). The same rule as `withState`: `step` must not await a managed-chain call.
     */
    afterChanges: (step) => managed.withState(step),
    handover: handover.service,
    provide: handover.provide,

    /**
     * `message_agent` (R-ROUTE-03 as amended by C-WIRE-2): one `message` to the session's manager,
     * connected or not. A session nobody manages has no recipient and is `not-managed`: the tool
     * exists only in managed sessions (the user, 2026-11-17), so this answers a call that raced a
     * release or a Take back. `queue-full` is the mailbox's bound.
     * @throws TypeError (synchronously) for a bad session id, or a payload that cannot be copied or
     *   is not a valid K1 message payload
     */
    messageAgent(sessionId, payload) {
      if (!isNonEmptyString(sessionId)) throw new TypeError(MISUSE.sessionId)
      // Copied at the call, so a caller that changes its object later cannot change what was checked.
      const draft = checkedFields(EVENT_TYPE.message, { sourceSessionId: sessionId, correlationId: null, payload: detachedPayload(payload) })
      return produce({ type: EVENT_TYPE.message, sessionId }, draft).then(({ route, committed }) => {
        if (route.recipient === null) return NOT_MANAGED
        return committed.ok ? OK : Object.freeze({ ok: false, code: committed.code })
      })
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
     * An offer's outcome (C-TOOLS' first committed answer, or the user's): one `settlement`
     * to the pair that held it (R-EVS-03 follow-up), except for that pair's own answer (`by:
     * principal`), which its tool result already reports (WAKE-REDUCE): the offer only leaves the ledger.
     *
     * Runs on the managed chain, as the offer's own commit and `withdraw` do. Off it, a settle that
     * arrives while its offer's commit is still queued or running there finds nothing live and
     * returns `false`, and the offer then lands in the manager's mailbox with nothing left to settle
     * or retire it. On it, a release or revocation either retires the offer first (settle then finds
     * nothing) or runs after the settle (and finds nothing to retire). The settlement is copied at
     * the call, because the step reads it later; its draft is checked before the offer leaves the
     * ledger, so a bad settlement leaves the offer live instead of dead in the mailbox.
     * The offer leaves the ledger only once the settlement is stored (review F04): a commit that
     * rejects leaves it live, listed and answerable, so the answer can be retried and a release
     * still hands it to the user. No other ledger change can land meanwhile (the managed chain).
     * @param settlement - the K1 settlement payload `{approvalId, outcome, by, answers?}`
     * @param options.principalKey - for a principal's answer: the offer must still be held by this
     *   principal (review F02: a succession or Take back since the answer was checked moved it)
     * @returns whether the offer was live (and held by `principalKey` when given)
     * @throws (rejects) TypeError for a settlement that cannot be copied or is not a valid K1
     *   settlement; the mailbox's storage error (the offer stays live)
     */
    async settle(offerId, settlement, { principalKey } = {}) {
      const payload = detachedPayload(settlement)
      return managed.withState(async () => {
        if (!heldBy(offerId, principalKey)) return false
        const holder = ledger.holderOf(offerId)
        // The current revision's id: after a succession the user's card may still name an older one (E1a).
        const draft = checkedFields(EVENT_TYPE.settlement, { sourceSessionId: holder.sessionId, correlationId: holder.offerId, payload })
        // WAKE-REDUCE (the user, 2026-11-21): the principal's own answer is told by its tool result
        // (approval_answer / question_answer), so no settlement event repeats it to that principal.
        if (payload.by !== SETTLED_BY.principal) {
          await produce({ type: EVENT_TYPE.settlement, sessionId: holder.sessionId, followsPrincipal: holder.principalKey }, draft)
        }
        ledger.settle(offerId)
        return true
      })
    },

    /**
     * A settlement with no offer behind it (`by: delegate`, delegates/index.js): a delegate decided a
     * managed session's request before anything was offered, and its manager is told what was
     * decided (the user, 2026-11-20: "yes send settlements"). On the managed chain, so it goes to
     * the manager of that moment; a session nobody manages any more gets nothing.
     * @returns whether a manager was told
     * @throws (rejects) TypeError for a settlement that is not a valid K1 settlement
     */
    async report(sessionId, settlement) {
      if (!isNonEmptyString(sessionId)) throw new TypeError(MISUSE.sessionId)
      const payload = detachedPayload(settlement)
      return managed.withState(async () => {
        const manager = managed.state.managerOf(sessionId)
        if (manager === undefined) return false
        const draft = checkedFields(EVENT_TYPE.settlement, { sourceSessionId: sessionId, correlationId: null, payload })
        const { committed } = await produce({ type: EVENT_TYPE.settlement, sessionId, followsPrincipal: manager }, draft)
        return committed?.ok === true
      })
    },

    /**
     * A `notice` about one live offer of `sessionId` to its holder (R-EVS-02; K1 NOTICE.codes), e.g.
     * a managed session's question whose call ended while the question stays open (domain/questions.js).
     * On the managed chain, as `report` is, so a succession never sends it to the old holder; its
     * correlation id is the offer's current revision (after a succession `r<n+1>`).
     * @param offerId - any revision of the offer the notice is about
     * @returns whether the holder's mailbox stored it (`false`: the offer is no longer live, or the
     *   mailbox refused it, e.g. `queue-full`)
     * @throws TypeError (rejects) for a bad session id or a payload that is not a K1 notice
     */
    notice(sessionId, offerId, code, text) {
      return managed.withState(async () => {
        if (!isNonEmptyString(sessionId)) throw new TypeError(MISUSE.sessionId)
        const holder = ledger.holderOf(offerId)
        if (holder === undefined || holder.sessionId !== sessionId) return false
        const draft = checkedFields(EVENT_TYPE.notice, { sourceSessionId: sessionId, correlationId: holder.offerId, payload: { code, text } })
        const { committed } = await produce({ type: EVENT_TYPE.notice, sessionId }, draft)
        return committed?.ok === true
      })
    },

    /**
     * Whether the live request `offerId` names is held by `principalKey` now (read synchronously,
     * so a caller that decides in the same step cannot be overtaken by a succession; review F02).
     */
    holds: (offerId, principalKey) => principalKey !== undefined && heldBy(offerId, principalKey),

    /**
     * A principal's `escalate` (C-WIRE-2): the offer is shown to the user too and settles nothing
     * yet (K1); its later `settle` (the user's answer or the principal's) or `withdraw` still goes
     * to the same pair, and the principal still holds it (offers.js).
     * On the managed chain, as `settle` is, so it never lands between a release and its retirements.
     * @param options.principalKey - the escalating principal: the offer must still be its (review F02)
     * @returns whether the offer was live, held by `principalKey`, and not escalated yet
     */
    escalate: (offerId, { principalKey } = {}) => managed.withState(async () => heldBy(offerId, principalKey) && ledger.escalate(offerId)),

    /**
     * The session's call ended before an answer: the offer is retired `withdrawn` from its pair.
     * Runs on the managed chain, as the offer's own commit does: a withdraw that arrives while its
     * offer is still queued there runs after it, and so finds it.
     * @returns whether the offer was live
     */
    withdraw: (offerId) => managed.withState(() => ledger.withdraw(offerId, RETIREMENT_REASON.withdrawn)),

    /**
     * C-TOOLS' `interactions.liveOffers(rootSessionId)` (mcp/tools/index.js): the session's live
     * offers, `{principalKey, descriptor}` each, with the current `offerId` (after a succession
     * `r<n+1>`, so an agent's answer to the old id is `expired`). C-WIRE binds the port to this.
     */
    liveOffers: (sessionId) => ledger.liveOffers(sessionId),

    /**
     * C-SUCCEED (R-HOST-09, R-NAME-07, R-WATCH-04): `to` succeeds `from`, as one step on the managed
     * chain, so no reader of managed state sees a gap between the pair step and the move (the
     * reason at handover/index.js `managed()`). The storage domains give no cross-domain
     * transaction, so "all or nothing" is compensation: every step up to the commit point can be
     * undone, and nothing it does is visible to `to` until then.
     *   1. every session `from` manages is managed by `to` (no session is ever unmanaged);
     *   2. K1d `Mailbox.transfer(from → to)`, staged (C-MAILBOX `stage`): `from`'s pending events
     *      move to `to` with their `eventId`s, behind a barrier that `to` cannot poll or ack past;
     *   3. every live offer of `from` is held by `to`, and is committed again behind the barrier as
     *      `<requestId>.r<n+1>` (`successorDraft`);
     *   4. `commit()`, the caller's steps (C-SUCCEED: `PairStore.succeed`,
     *      the commit point for the name). It resolves `{ok: true}` or a refusal, or rejects.
     * A refusal or a rejection in 1–4 undoes the earlier steps in reverse order (`commit` undoes its
     * own): the staged commits go, the moved events and every event routed to `to` for the moved
     * sessions meanwhile go back to `from`, the offers and sessions are `from`'s again. It is
     * returned (refusal) or rethrown (rejection). Past the commit point:
     *   5. the barrier lifts (`to` gets its hint), the ledger names each offer's r<n+1>, and each
     *      old event is retired `reissued` in `to`'s box. A retire that fails is logged: the request
     *      is current under r<n+1> (an answer to r<n> is `expired`), and its old event stays
     *      pending in `to`'s box, where an answer to it is refused the same way.
     * `commit` runs inside this managed-chain step, so it must never await a managed-chain call
     * (`withState`'s rule); a settings save it makes must not either.
     * @returns `{ok: true, sessions}` (the moved session ids) or `commit`'s refusal
     * @throws TypeError (synchronously) for a bad key, the same key twice, or no `commit` (a caller bug)
     * @throws (rejects) the first failing step's error, after the undo (a failed undo is logged)
     */
    succeedPrincipal(from, to, commit) {
      if (!isNonEmptyString(from) || !isNonEmptyString(to) || from === to) throw new TypeError(MISUSE.succession)
      if (typeof commit !== 'function') throw new TypeError(MISUSE.succession)
      return managed.withState(async () => {
        const undos = []
        const undoAll = async () => {
          for (const undo of undos.reverse()) await Promise.resolve().then(undo).catch(warn(LOG.succeedUndoFailed))
        }
        let moved
        let staged
        let reissued
        try {
          for (const participant of [...succeeding]) undos.push((await participant(from, to)).undo)
          moved = await managed.moveAllNow(from, to)
          undos.push(moved.undo)
          staged = await mailbox.stage(from, to)
          undos.push(() => staged.undo(moved.sessions))
          const holders = ledger.moveHolder(from, to)
          undos.push(holders.undo)
          reissued = holders.requests.map(successorDraft)
          for (const offer of reissued) offer.eventId = await staged.commit({ type: offer.type, ...offer.draft })
          const result = await commit()
          if (result?.ok !== true) {
            await undoAll()
            return result
          }
        } catch (error) {
          await undoAll()
          throw error
        }
        staged.confirm()
        for (const { requestId, offerId, eventId, draft, oldEventId } of reissued) {
          ledger.reissued(requestId, { offerId, eventId, draft })
          await mailbox.retire(to, oldEventId, RETIREMENT_REASON.reissued).catch(warn(LOG.reissueFailed))
        }
        changed()
        return Object.freeze({ ok: true, sessions: moved.sessions })
      })
    },

    /**
     * C-REVOKE step 1 (R-ROUTE-06, R-TOK-05, R-WATCH-01): the revoked entry's principal stops
     * managing every session, and each of their live offers is retired `revoked`. C-REVOKE calls
     * it from its own `onRevoked` handler (routing no longer subscribes, W4 brief G1), because a
     * delete must drop the mailbox only after these retirements, and a listener cannot be awaited.
     * The principal is the entry's pair, or the pair it was last seen bound to when the same sync
     * removed it (`lastPair`).
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
      await closeTables()
    },
  }
}
