/**
 * Constants of fishball-core's interception service and acceptance ledger (task F-INTERCEPT;
 * K3 `packages/core/contracts/events.d.ts`; design §6.4; requirements R-INT-01…09, R-EVT-03;
 * spikes V3-S2 `a499141`, V3-S3 `b4dca86`).
 *
 * Two kinds of value live here, kept apart on purpose:
 * - CONTRACT: values the K3 freeze states in prose and types (`events.d.ts`) but exports no runtime
 *   constant for, because K3 is types only. They are reproduced once, here, until K3 gains a
 *   runtime module; a K3 amendment changes `events.d.ts` and this object together.
 * - Everything else is this module's own internal vocabulary (ledger layout, record states, the
 *   background log) or a DSH host value it reads (session event types, the Cordis fiber state).
 */

/**
 * PROPOSED (Fishball 2026-11-14): values K3 states in `events.d.ts` but exports no runtime constant
 * for. They live here once until task K-VALUES moves them into `packages/core/contracts`.
 */
export const CONTRACT = Object.freeze({
  /** `InterceptRegistration.priority` default (R-INT-01). */
  defaultPriority: 0,
  /** `CommitResult` code when the handler no longer holds the event as accepted. */
  fenced: 'fenced',
  /** `CommitSendResult` code of an answer that never reached the connector (design §6.3). */
  disconnected: 'disconnected',
})

/**
 * The acceptance ledger: one DSH storage-domain table in the Fishball DSH, one record per
 * `eventId` (design §6.4, S2 §2.2). The record is a small state machine; every move is a
 * read-modify-write on the domain's single write chain, so two moves never interleave (S3).
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000
export const LEDGER = Object.freeze({
  domain: 'fishball_core_events',
  table: 'acceptance',
  version: 1,
  /**
   * PROPOSED (Fishball 2026-11-14, under the user's review): a finished record (closed, admitted
   * or discarded) that the connector has acked is deleted this long after it finished. Only acked
   * records go: the connector never returns an acked event to a poll (K1 MAILBOX), so a deleted
   * id cannot come back and be handled twice; an unacked one is kept so its replay stays a duplicate.
   */
  finishedRetentionMs: 30 * MS_PER_DAY,
})

/**
 * Record states.
 * - offered: handed to one interceptor (`plugin`, `attempt`), not yet accepted; never acked.
 * - open: the interceptor's `ctl.accept()` resolved; durable, acked, undecided.
 * - committing: `ctl.commit(send)` began; the event stays with the interceptor from here on.
 * - closed: the interceptor's handler settled; log only (R-INT-09).
 * - fishball: accepted for the Fishball agent, in core's delivery list (R-INT-08, R-EVT-03).
 * - admitted: `Agent.followup` admitted it; the one wake happened (S2-Q2 A: never again).
 * - discarded: the user stopped the claiming turn or removed it from the inbox before admission
 *   (S2-Q3 A): acked, never retried.
 */
export const STATE = Object.freeze({
  offered: 'offered',
  open: 'open',
  committing: 'committing',
  closed: 'closed',
  fishball: 'fishball',
  admitted: 'admitted',
  discarded: 'discarded',
})

/** States that hold the event for an interceptor and that a fallback may still move to Fishball. */
export const UNDECIDED = Object.freeze([STATE.offered, STATE.open])
/** States in which an interceptor's handler is still running (the record is "open", S2-Q1 B). */
export const INTERCEPTOR_HELD = Object.freeze([STATE.offered, STATE.open, STATE.committing])
/** End states: nothing more happens to the event (the retention clock starts here). */
export const FINISHED = Object.freeze([STATE.closed, STATE.admitted, STATE.discarded])
/** Every state but `offered` is a durable acceptance by one side, so core may ack (R-INT-08). */
export const ACKABLE = Object.freeze(Object.values(STATE).filter((state) => state !== STATE.offered))

/** Why an event went to Fishball, or how an interceptor's record ended; background log only. */
export const REASON = Object.freeze({
  noMatch: 'no-match',
  notAccepted: 'not-accepted',
  handlerFailed: 'handler-failed',
  pluginNotLive: 'plugin-not-live',
  disposed: 'registration-disposed',
  released: 'released',
  sendNotDelivered: 'send-not-delivered',
  restartBeforeAccept: 'restart-before-accept',
  restartPluginOff: 'restart-plugin-off',
  handled: 'handled',
  commitInterrupted: 'commit-interrupted',
  userStopped: 'user-stopped',
})

/** What `intake` did with one polled event. */
export const DISPATCH = Object.freeze({ interceptor: 'interceptor', fishball: 'fishball', duplicate: 'duplicate' })

/**
 * The message an event becomes in Fishball's session. Its id is derived from the `eventId`, so
 * startup reconciliation can find it in the durable session log without a "woken" bit (S2 §2.2).
 */
export const MESSAGE = Object.freeze({
  idPrefix: 'fbe_',
  role: 'user',
  sourceKind: 'fishball-event',
})

/**
 * DSH host vocabulary read by the delivery list (dsh-agent / dsh-session types, the same on
 * 0.2.1-rc.5 and 0.2.2-rc.1).
 */
export const HOST = Object.freeze({
  userMessage: 'user/message',
  inboxSpliced: 'agent/inbox/spliced',
  turnEnd: 'turn/end',
  agentStatus: 'agent/status',
  idle: 'idle',
  /** The closer resume appends to a turn a crash left open; a user Stop writes another kind. */
  interrupted: 'interrupted',
  canceled: 'canceled',
  inboxTargets: Object.freeze(['next-turn', 'next-step']),
  /** Cordis `FiberState.ACTIVE` (a const enum, so not exported at runtime; 4.0.5 and 4.1.0). */
  fiberActive: 2,
  /**
   * Cordis's tracker key (`symbols.tracker`, 4.0.5 and 4.1.0). A service object carrying it is
   * traced: inside its methods `this.ctx` is the caller's context (spike V3-S5 I1), which is how
   * the events service learns the registering plugin's fiber without a `ctx` argument.
   */
  tracker: Symbol.for('cordis.tracker'),
  trackerOptions: Object.freeze({ property: 'ctx', noShadow: true }),
  disposerLabel: 'fishball-core-events: interception',
})

/** Where one message id stands in a session log (S2 `classify`). */
export const DELIVERY = Object.freeze({
  absent: 'absent',
  pending: 'pending',
  claimed: 'claimed',
  admitted: 'admitted',
  canceled: 'canceled',
})

/**
 * The background log (R-INT-09): one line per acceptance, commit and outcome, with the event id,
 * its type and a reason only. No payload, token or answer is ever logged (R-SEC-02).
 */
export const LOG = Object.freeze({
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
})

/** `TypeError` texts of an invalid registration or call (K3 PROPOSED rule). */
export const MISUSE = Object.freeze({
  pluginId: 'intercept: pluginId must be a non-empty string',
  types: 'intercept: types must be a non-empty array of non-empty strings',
  filter: 'intercept: filter must be a function',
  priority: 'intercept: priority must be a finite number',
  handler: 'intercept: onEvent must be a function',
  release: 'release: options must be {toFishball: true}',
  record: 'acceptance ledger: malformed record',
})
