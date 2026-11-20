/**
 * CONN-REPORT (connector event reduction and turn-finished, user-approved 2026-11-21), the K1 part.
 * Values are the requirement's words, never the implementation's:
 * - A1: 'state' stays in EVENT_TYPE (frozen, no producer, like 'ask');
 * - A2: session_start / session_message / session_redirect successes require `running: boolean`;
 * - B: turn-finished is {sessionId, outcome: 'completed' | 'stopped', finalMessage?: {text, truncated},
 *   stop?: {kind, message}}; TURN_FINISHED.finalMessageBytes 4096, truncationMarker '…[truncated]'.
 */
export const REPORT = Object.freeze({
  id: Object.freeze({ ep01: 'CONN-REPORT-EP-01', ep02: 'CONN-REPORT-EP-02', bva01: 'CONN-REPORT-BVA-01', dt01: 'CONN-REPORT-DT-01' }),
  /** A1: the frozen vocabulary keeps both words with no producer. */
  frozenWords: Object.freeze({ state: 'state', ask: 'ask' }),
  turnFinishedType: 'turn-finished',
  outcomes: Object.freeze(['completed', 'stopped']),
  limits: Object.freeze({ finalMessageBytes: 4096, truncationMarker: '\u2026[truncated]' }),
  /** A2: the tools whose success gains a required boolean `running`, and the field. */
  runningTools: Object.freeze(['session_start', 'session_message', 'session_redirect']),
  runningField: 'running',
})

const S = 'fbtest-report-session'
const msg = (text = 'done', truncated = false) => ({ text, truncated })
const stop = (kind = 'error', message = 'FBTEST: provider failure') => ({ kind, message })

/** B: payloads the turn-finished schema admits (EP of outcome × optional members) and refuses. */
export const REPORT_PAYLOADS = Object.freeze({
  accepted: Object.freeze([
    ['completed, no assistant text', { sessionId: S, outcome: 'completed' }],
    ['completed with finalMessage', { sessionId: S, outcome: 'completed', finalMessage: msg() }],
    ['completed with an empty, truncated finalMessage', { sessionId: S, outcome: 'completed', finalMessage: msg('', true) }],
    ['stopped with stop', { sessionId: S, outcome: 'stopped', stop: stop() }],
    ['stopped aborted with stop', { sessionId: S, outcome: 'stopped', stop: stop('aborted', 'user') }],
    ['stopped, no stop', { sessionId: S, outcome: 'stopped' }],
  ]),
  refused: Object.freeze([
    ['the old {running, queued} shape', { sessionId: S, running: false, queued: false }],
    ['the old fields beside outcome', { sessionId: S, outcome: 'completed', running: false }],
    ['outcome missing', { sessionId: S }],
    ['sessionId missing', { outcome: 'completed' }],
    ['outcome not in the vocabulary', { sessionId: S, outcome: 'idle' }],
    ['finalMessage without truncated', { sessionId: S, outcome: 'completed', finalMessage: { text: 'x' } }],
    ['finalMessage without text', { sessionId: S, outcome: 'completed', finalMessage: { truncated: false } }],
    ['finalMessage text not a string', { sessionId: S, outcome: 'completed', finalMessage: { text: 1, truncated: false } }],
    ['finalMessage with an extra member', { sessionId: S, outcome: 'completed', finalMessage: { ...msg(), extra: 1 } }],
    ['stop without message', { sessionId: S, outcome: 'stopped', stop: { kind: 'error' } }],
    ['stop without kind', { sessionId: S, outcome: 'stopped', stop: { message: 'x' } }],
    ['stop with an extra member', { sessionId: S, outcome: 'stopped', stop: { ...stop(), code: 'X' } }],
    ['an extra root member', { sessionId: S, outcome: 'completed', extra: true }],
  ]),
})

/** A2: success results of each tool (the frozen fields plus `running`), and the same without it. */
export const RUNNING_RESULTS = Object.freeze({
  session_start: Object.freeze({ ok: true, sessionId: S, managed: true }),
  session_message: Object.freeze({ ok: true, status: 'delivered' }),
  session_redirect: Object.freeze({ ok: true, status: 'delivered' }),
})
