/**
 * The V3 domain's own fixed values (task C-WIRE-2): DSH's waterfalls, events and outcomes it binds
 * to, the request ids it mints, the texts a managed session's agent reads, its storage layout and
 * its log lines. Every MCP word is K1's (`../../mcp-schema`) and is imported where it is used; the
 * live limits are the connector's settings (src/config.js).
 */

/** DSH's approval service (dsh-user-approval, both SDKs): the answerer waterfall and its outcomes. */
export const APPROVAL = Object.freeze({
  waterfall: 'approval/request',
  outcome: Object.freeze({ allowedOnce: 'allowed-once', rejected: 'rejected', cancelled: 'cancelled', unavailable: 'unavailable' }),
})

/**
 * DSH's question service (dsh-user-questions, spike S36): the answerer waterfall, the two tools,
 * the plan-review intent, the timed-wait claim and its error codes.
 */
export const QUESTION = Object.freeze({
  waterfall: 'user-questions/request',
  askTool: 'ask_user_question',
  planTool: 'exit_plan_mode',
  planIntent: 'plan-review',
  /** DSH's error shape for a rejection the gateway forwards to the session's card. */
  errorName: 'UserQuestionError',
  aborted: 'ASK_ABORTED',
  /** The service that holds a timed question's foreground wait (attachWait, S36). */
  service: 'userQuestions',
})

/** Session log facts read to find a call's arguments and a question's call id (spikes S11, S36). */
export const LOG_EVENT = Object.freeze({
  assistant: 'assistant/message',
  toolCallBlock: 'tool-call',
  ptcDispatch: 'tool/ptc-dispatch-start',
  toolCall: 'tool/call',
  toolResult: 'tool/result',
  turnEnd: 'turn/end',
  sessionEvent: 'session/event',
})

/** dsh-tools' post-execute waterfall and its decisions (spike S35). */
export const POST_EXECUTE = Object.freeze({ event: 'tools/post-execute', block: 'block' })

/** Agent lifecycle events (dsh-agent, spike S34): a managed session's tools follow each new agent. */
export const AGENT_EVENT = Object.freeze({ created: 'agent/created', disposed: 'agent/disposed' })

/** Request ids the domain mints: a prefix plus 32 lowercase hex characters (a UUID without dashes). */
export const REQUEST_ID = Object.freeze({
  permission: 'apr_',
  question: 'qst_',
  prompt: 'prm_',
  grant: 'grt_',
  uuidSeparator: /-/g,
})

/**
 * The descriptor's fixed parts (K1 `descriptor`): the decisions a permission offer lists. `ask` is
 * not offered: there is no `ask_agent` to carry a question back (the user, 2026-11-17), and an
 * `ask` answer is refused `invalid-decision` (the user's answer, 2026-11-17: "Refuse it").
 */
export const OFFERED_DECISIONS = Object.freeze(['allow', 'grant', 'reject', 'escalate'])

/** The one-line summaries a descriptor's `prompt` carries; JSON-quoted, so a tool name cannot break them. */
export const SUMMARY = Object.freeze({
  permission: (toolName) => `Permission request: ${JSON.stringify(toolName)}`,
  question: (toolName) => `Question: ${toolName}`,
})

/** Cut text ends with this (a whole UTF-8 character always precedes it). */
export const ELLIPSIS = '…'

/**
 * Standing grants (design §7a.8 as V3 keeps it): the shell tools a prefix grant may name, each with
 * its command argument; one trailing `*` is notation. setTimeout's limit bounds one wait of the
 * expiry timer, so a far end time is reached in steps.
 */
export const GRANT = Object.freeze({
  commandArgument: Object.freeze({ bash: 'command', pwsh: 'command', terminal_send: 'text' }),
  wildcard: '*',
  maxTimerMs: 2147483647,
  digest: 'sha256',
  digestEncoding: 'hex',
})

/**
 * The grants' durable table: one storage domain of the connector, per-record, so a use writes one
 * record. Keys are the grant ids (path-safe: prefix + hex).
 */
export const GRANT_STORE = Object.freeze({ domain: 'dsh_connector_grants', version: 1, layout: 'per-record', table: 'grants' })

/**
 * `message_agent`, the one tool of a managed session (the user, 2026-11-17: no `ask_agent`, no
 * `list_user_messages`). Model-facing text; neutral names (§1.0c, Q-G8 = B).
 */
export const MESSAGE_AGENT = Object.freeze({
  name: 'message_agent',
  description: 'Send a message to the agent that manages this session. Use it to report something the user should know, to hand over a result, or to ask for something to be passed on. The agent sees which session sent it. Keep it short and self-contained.',
  messageArg: 'The message (plain text or markdown).',
  delivered: 'Delivered to the agent that manages this session.',
  duplicate: 'The managing agent already has this message.',
  /** The dedupe key's parts are joined with this (caller, call id, response seq, text digest). */
  keySeparator: ':',
  /** The log seq of a session with no assistant message yet. */
  noResponse: 0,
})

/** What a session's agent reads when its managing agent rejected its call (DSH's outcome carries no text). */
export const WORDING = Object.freeze({
  rejected: (reason) => `The managing agent rejected this call: ${reason}`,
  keySeparator: '|',
})

/**
 * A question answered by the managing agent closes the session's own card with this rejection, as
 * DSH's gateway forwards it (S36 Q2).
 */
export const QUESTION_TEXT = Object.freeze({
  answeredElsewhere: 'answered by the managing agent',
  aborted: 'aborted before the question was answered',
})

/** Why a question batch was refused (`bad-answer`); domain words only, never shown as the code. */
export const ANSWER_RULE = Object.freeze({
  items: 'items', ids: 'ids', labels: 'labels', custom: 'custom', single: 'single',
  planOnly: 'plan-only', questionOnly: 'question-only', planBoth: 'plan-both', feedback: 'feedback',
  toUserBoth: 'to-user-both', nothing: 'nothing',
})

/** Programming errors (thrown, never shown to a client). */
export const MISUSE = Object.freeze({
  listener: 'dsh-connector domain: a listener must be a function',
})

/** Log lines: `logger.warn(LOG.format, line, code)`; never an argument, a reason or a session's text. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  offerFailed: 'domain: a request could not be offered; it goes to the user',
  settleFailed: 'domain: a settlement could not be committed',
  withdrawFailed: 'domain: a withdrawn offer could not be retired',
  grantWriteFailed: 'domain: a grant could not be written',
  grantExpiryFailed: 'domain: a grant expiry failed',
  holdFailed: 'domain: a timed question\'s wait could not be held',
  frozenRequest: 'domain: a request could not be routed: its signal cannot be replaced',
  toolsFailed: 'domain: a managed session\'s tool could not be applied',
  toolsRemovalFailed: 'domain: a managed session\'s tool could not be removed',
  messageFailed: 'domain: message_agent failed',
  describeFailed: 'domain: a session could not be described',
})
