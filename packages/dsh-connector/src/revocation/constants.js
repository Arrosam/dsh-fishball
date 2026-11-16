/**
 * C-REVOKE's own constants (design §5.3; R-TOK-05, R-ROUTE-06; W4 briefs C-REVOKE, G8). The
 * retention itself (`MAILBOX.disabledRetentionMs`) and the revocation kinds (`REVOCATION_KIND`)
 * are K1's and are imported where they are used.
 */
import { TIME_UNIT } from '../../mcp-schema/index.js'

const SECOND_MS = TIME_UNIT.msPerSecond
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

/**
 * Timers (Fishball's implementation choice, W4: PROPOSED values, no requirement fixes them).
 * - expirySweepMs: how often `Mailbox.expireHolds(now)` runs. The mailbox does not expose when a
 *   hold began, and an expired box also drops later events 30 days after their own commit, so the
 *   expiry is a periodic sweep rather than one timer per hold; an event is dropped at most this
 *   long after its 30 days. It is far below setTimeout's 2^31-1 ms cap (G8), so one delay never
 *   overflows. The sweep only drops events, it never settles an offer (R-CON-05).
 * - retryMs: the wait before a failed step of a revocation (or a re-enable's release) is tried
 *   again. Steps are retried until they succeed or the module closes; a failed drop is never
 *   skipped, because a box dropped before its retirements ran would lose them (W3-merge decision a).
 */
export const REVOCATION_TIMING = Object.freeze({
  expirySweepMs: HOUR_MS,
  retryMs: 30 * SECOND_MS,
})

/**
 * The `system` note each formerly managed session gets (R-ROUTE-06; SessionNotes, K1d). Model-facing
 * text, English only (W4 Q7); it starts no turn (Q2 = A), so it reads as a fact for the next turn.
 */
export const REVOCATION_NOTE = Object.freeze({
  text: 'The agent that managed this session lost its access: its token entry was switched off or deleted. '
    + 'This session is no longer managed, and its permission requests, questions and plan reviews now go to the user in this session.',
})

/** Background log lines: `logger.warn(LOG.format, line, diagnostic code)`; never a key, id or value. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  stepFailed: 'revocation: a step failed and is retried',
  noteFailed: 'revocation: a system note could not be written',
  cardFailed: 'revocation: a withdrawn offer could not be handed to the user',
  expiryFailed: 'revocation: the hold-expiry sweep failed; the next sweep retries it',
  closeEntryFailed: 'revocation: closing the entry\'s listen streams failed',
})

/** The step names a failure log names (one per retried step). */
export const STEP = Object.freeze({
  hold: 'hold',
  endPrincipal: 'endPrincipal',
  drop: 'drop',
  removePair: 'removePair',
  clearDesignated: 'clearDesignated',
  release: 'release',
  askDropped: 'askDropped',
})
