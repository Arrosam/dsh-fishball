/**
 * The V3 wiring's own fixed values (task C-WIRE): the DSH events and services it binds the V3
 * modules to, the source of a `system` note, and log lines. Every MCP and OAuth value is K1's and
 * every module tunable its owner's; they are imported where used, never restated.
 */

/**
 * DSH services read with `ctx.get` only, because the row must load without them:
 * - webStartup: the `--trusted-host` authorities (dsh-web-app startup), absent without the web profile;
 * - webApp: none is read; the approval page shows DSH's advertised name from the listener origin.
 */
export const OPTIONAL_WIRE_SERVICE = Object.freeze({ webStartup: 'webStartup' })

/** DSH session events and the facts read from them (dsh-session, dsh-agent; both SDKs). */
export const SESSION_EVENT = Object.freeze({
  /** Every appended session event (`(session, event)`). */
  sessionEvent: 'session/event',
  /** A turn of a session ended. */
  turnEnd: 'turn/end',
  /** An agent's status changed (`{agent, status}`). */
  agentStatus: 'agent/status',
  /** An agent inbox boundary: the next turn (dsh-agent InboxTarget). */
  nextTurn: 'next-turn',
  /** A published subagent started / settled (dsh-subagent; `{runId, parentSessionId, …}`). */
  subagentStart: 'subagent/start',
  subagentEnd: 'subagent/end',
  /** The assistant message event a session's final output is read from. */
  assistantMessage: 'assistant/message',
})

/**
 * DSH's `turn/end` reason kinds (dsh-session TurnEndReasonMap): `completed` and `max-tokens`
 * end a turn that produced its output; every other kind is a stop.
 */
export const TURN_END_REASON = Object.freeze({
  completedKinds: Object.freeze(['completed', 'max-tokens']),
  aborted: 'aborted',
  error: 'error',
})

/** `stop.message` of a turn-finished `stopped` (English; data for the agent, never shown as UI). */
export const STOP_TEXT = Object.freeze({
  error: (error) => [error?.code, error?.message].filter((part) => typeof part === 'string' && part.length > 0).join(': ') || 'the turn failed',
  aborted: (cause) => `the turn was cancelled (${cause?.kind ?? 'unknown'}${typeof cause?.reason === 'string' ? ': ' + cause.reason : ''})`,
  blocked: 'a hook blocked the turn',
  interrupted: 'the turn was cut off (DSH stopped while it ran)',
  other: (kind) => `the turn ended: ${kind}`,
})

/**
 * A `system` note (K1d SessionNotes; W4 Q2 = A: a transcript entry the session's agent reads at
 * its next turn, starting no turn). Its source kind names the connector, so DSH shows it as a
 * notice and the agent tells it from the user's own words. `wake: false` is Agent.send's third
 * argument: delivered to the next turn without waking the driver.
 */
export const SYSTEM_NOTE = Object.freeze({
  source: Object.freeze({ kind: 'dsh-connector-note', form: 'notice' }),
  summary: 'dsh-connector: management changed',
  wake: false,
  /** The rejection for a session DSH does not know (K1d-3: `system` rejects for an unknown session). */
  unknownSession: 'unknown-session',
})

/**
 * The V3 session domain (domain.js). `senderId` is the `senderSessionId` of every message a
 * principal sends through the V3 tools (`session_start`, `session_message`, `session_redirect`):
 * the V2 port stamps its relays with the sender it is given, and a read names that sender's
 * messages `fishball` (session-info.js `senderOf`), which the domain reads back as K1's
 * `principal`. It is not V2's isolated-Fishball id, so the V2 broker never takes a V3 principal's
 * message for its own child's.
 */
export const DOMAIN = Object.freeze({ senderId: 'dsh-connector' })

/** Log lines: `logger.warn(LOG.format, line, code)`; never a token, key, id or value. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  /** The row effect that closes the V3 modules. */
  label: 'dsh-connector: v3 modules',
  openFailed: 'v3 wiring: a module could not be opened; the V3 connector stays off until the next start',
  noWebServer: 'v3 wiring: DSH has no web server here; the V3 connector stays off and the V2 path runs alone',
  closeFailed: 'v3 wiring: a module did not close cleanly',
  sessionReadFailed: 'v3 wiring: a session state read failed',
  ackListenerFailed: 'v3 wiring: an inbox_ack listener failed; the ack stands',
})

/** DSH's TLS PEM files (dsh-host-webserver TlsConfig), read as DSH reads them. */
export const TLS_FILE = Object.freeze({ encoding: 'utf8' })

/** DSH WebRoute kind of the MCP route (design §3.1: `exact` beats DSH's `/api` prefix, spike S1 F3). */
export const ROUTE_KIND = 'exact'

/** Programming errors (thrown, never shown to a user). */
export const MISUSE = Object.freeze({
  noTlsFiles: 'v3 wiring: DSH\'s listener is TLS but its certificate and key files are not readable here',
})

/** Row effect labels. */
export const LABEL = Object.freeze({ services: 'dsh-connector: v3 services' })
