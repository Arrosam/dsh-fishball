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
// K1 keeps its day length private (mcp-schema constants.js DAY_MS) and exports only
// TIME_UNIT.msPerSecond; this is the same unit, named for the one value below.
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
  /**
   * The turn that claimed the event ended before admitting it in another way than a user Stop or
   * an owner teardown (`error`, `blocked`, an `aborted` by `parent` or `hook`): discarded (the
   * user's decision 2026-11-14 1.B).
   */
  claimTurnEnded: 'claim-turn-ended',
  /** Every attempt to present the event failed; Fishball got a notice instead (decision 3.A). */
  presentGivenUp: 'present-given-up',
})

/**
 * PROPOSED (the user's decision 2026-11-14 3.A, values under review): how often core tries to turn
 * an event into Fishball's message before it gives up. Attempt n (1-based) that fails, with
 * n < attempts, is followed by a wait of backoffMs × backoffFactor^(n−1) before attempt n + 1.
 */
export const PRESENT_RETRY = Object.freeze({ attempts: 3, backoffMs: 1000, backoffFactor: 2 })

/**
 * PROPOSED (decision 3.A): the short notice Fishball gets for an event core could not present.
 * It names the event only; no payload.
 */
export const TEXT = Object.freeze({
  blockType: 'text',
  presentGivenUp: (eventId, type) => `Fishball notice: event ${eventId} (${type}) could not be shown to you and was given up.`,
})

/** What `intake` did with one polled event. */
export const DISPATCH = Object.freeze({ interceptor: 'interceptor', fishball: 'fishball', duplicate: 'duplicate', closed: 'closed' })

/**
 * The message an event becomes in Fishball's session. Its id is derived from the `eventId`, so the
 * live admission (`user/message` with that id) is recognised as this event's.
 */
export const MESSAGE = Object.freeze({
  idPrefix: 'fbe_',
  role: 'user',
  sourceKind: 'fishball-event',
})

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
