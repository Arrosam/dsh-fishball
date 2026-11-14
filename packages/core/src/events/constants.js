/**
 * Internal vocabulary of fishball-core's interception service and acceptance ledger (task
 * F-INTERCEPT; K3 `packages/core/contracts/events.d.ts`; design §6.4; requirements R-INT-01…09,
 * R-EVT-03; spikes V3-S2 `a499141`, V3-S3 `b4dca86`).
 *
 * The contract's values (default priority, `fenced`, the ledger, its states and reasons, the
 * presenter retry, the given-up notice, the message id) are K3's, in `contracts/constants.js`; the
 * `disconnected` answer is K1's `LINK_REFUSAL`. What stays here is this module's own vocabulary
 * (state groups, dispatch outcomes, the background log, misuse texts) and the DSH host values it
 * reads (session event types, the Cordis fiber state).
 */

import { STATE } from '../../contracts/constants.js'

/** States that hold the event for an interceptor and that a fallback may still move to Fishball. */
export const UNDECIDED = Object.freeze([STATE.offered, STATE.open])
/** States in which an interceptor's handler is still running (the record is "open", S2-Q1 B). */
export const INTERCEPTOR_HELD = Object.freeze([STATE.offered, STATE.open, STATE.committing])
/** End states: nothing more happens to the event (the retention clock starts here). */
export const FINISHED = Object.freeze([STATE.closed, STATE.admitted, STATE.discarded])
/** Every state but `offered` is a durable acceptance by one side, so core may ack (R-INT-08). */
export const ACKABLE = Object.freeze(Object.values(STATE).filter((state) => state !== STATE.offered))

/** What `intake` did with one polled event. */
export const DISPATCH = Object.freeze({ interceptor: 'interceptor', fishball: 'fishball', duplicate: 'duplicate', closed: 'closed' })

/**
 * DSH host vocabulary the delivery list observes live (dsh-agent / dsh-session types, the same on
 * 0.2.1-rc.5 and 0.2.2-rc.1). It is read from the agent's own session events as they are appended,
 * never from the session log (decision 4.A).
 */
export const HOST = Object.freeze({
  userMessage: 'user/message',
  turnEnd: 'turn/end',
  /** A turn took a pending message, `{agent, message, turn}`. */
  inboxClaimed: 'agent/inbox/claimed',
  /** A pending message was removed from the inbox unrun, `{agent, message}`. */
  inboxDiscarded: 'agent/inbox/discarded',
  agentStatus: 'agent/status',
  /** Each appended session event, `(session, event)`, scoped to the agent's context. */
  sessionEvent: 'session/event',
  /** The awaited durability checkpoint DSH runs before every model request (checkpoint policy). */
  sessionFlush: 'session/flush',
  idle: 'idle',
  /** `turn/end` of a cancelled turn; its `reason.kind` is the cancel cause. */
  aborted: 'aborted',
  /** Cancel causes (dsh-session `AgentCancelCause`): the user's Stop, and owner teardown. */
  causeUser: 'user',
  causeDisposed: 'disposed',
  /** Cordis `FiberState.ACTIVE` (a const enum, so not exported at runtime; 4.0.5 and 4.1.0). */
  fiberActive: 2,
  /**
   * Options of Cordis's tracker (`symbols.tracker`, 4.0.5 and 4.1.0). A service object carrying it
   * is traced: inside its methods `this.ctx` is the caller's context (spike V3-S5 I1), which is how
   * the events service learns the registering plugin's fiber without a `ctx` argument.
   * `Symbol.for` gives the very symbol cordis exports as `symbols.tracker`; it is not imported
   * because `@deepseek-ai/cordis` is not one of core's peers, and core's manifest belongs to F-LINK
   * this wave.
   */
  tracker: Symbol.for('cordis.tracker'),
  trackerOptions: Object.freeze({ property: 'ctx', noShadow: true }),
  disposerLabel: 'fishball-core-events: interception',
})

/**
 * The background log (R-INT-09): one line per acceptance, commit and outcome, with the event id,
 * its type and a reason only. No payload, token or answer is ever logged (R-SEC-02).
 */
export const LOG = Object.freeze({
  /** The logger name the wiring row (F-WIRE) gives this module's `logger` port. */
  name: 'fishball-core-events',
  twin: 'interception: %s registered the same types and priority %s as %s',
  accepted: 'event %s (%s) accepted by interceptor %s',
  committing: 'event %s (%s) commit began by interceptor %s',
  closed: 'event %s (%s) closed by interceptor %s (%s)',
  toFishball: 'event %s (%s) goes to Fishball (%s)',
  admitted: 'event %s (%s) admitted to Fishball',
  discarded: 'event %s (%s) discarded before admission (%s)',
  replay: 'event %s replayed; dropped',
  ackFailed: 'event %s could not be acked (%s)',
  deliverFailed: 'event %s could not be delivered to Fishball yet (%s)',
  pruneFailed: 'acceptance ledger retention failed (%s)',
  presentFailed: 'event %s (%s) could not be presented to Fishball; retrying (%s)',
  presentGivenUp: 'event %s (%s) given up (%s): it could not be presented to Fishball (%s)',
  recoverFailed: 'event recovery failed (%s); intake continues',
})

/** `TypeError` texts of an invalid registration or call (K3 rule, DECIDED #17). */
export const MISUSE = Object.freeze({
  pluginId: 'intercept: pluginId must be a non-empty string',
  types: 'intercept: types must be a non-empty array of non-empty strings',
  filter: 'intercept: filter must be a function',
  priority: 'intercept: priority must be a finite number',
  handler: 'intercept: onEvent must be a function',
  release: 'release: options must be {toFishball: true}',
  record: 'acceptance ledger: malformed record',
})
