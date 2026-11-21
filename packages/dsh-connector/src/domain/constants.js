/**
 * The V3 domain's own fixed values (task C-WIRE-2): DSH's waterfalls, events and outcomes it binds
 * to, the request ids it mints, the texts a managed session's agent reads, its storage layout and
 * its log lines. Every MCP word is K1's (`../../mcp-schema`) and is imported where it is used; the
 * live limits are the connector's settings (src/config.js).
 */
import { TOOL } from '../../mcp-schema/index.js'

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
  /**
   * A cancelled turn (Stop, session_stop, session_redirect) aborts its calls with the turn's cause,
   * an object with a string `kind` (dsh-agent-loop `cancel(cause)`; wire/constants.js reads the same
   * field). Any other abort of a question's call, such as a `run_code` program ending at its
   * deadline (its nested calls abort with a string), ends the call but not the turn.
   */
  turnCauseKind: 'kind',
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
export const GRANT_STORE = Object.freeze({
  domain: 'dsh_connector_grants', version: 1, layout: 'per-record', table: 'grants',
  /**
   * A record's optional durable `state` (review F01/F04; absent = active, so earlier records read
   * as before): `pending` until its answer's settlement is stored, `ended` once it ends, written
   * before its delete. Neither covers or lists, and the start sweep deletes both, so neither a
   * failed answer's grant nor a revoked grant whose delete failed can revive after a restart.
   */
  state: Object.freeze({ pending: 'pending', ended: 'ended' }),
})

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
 * The `kind` of a late answer's message. A different word from DSH's own `answer_to_pending_question`
 * (a timed call's pending reply), because this call did not return `pending`: it failed, and the
 * session's agent must not look for a pending call to match it to.
 */
const QUESTION_TEXT_KIND = Object.freeze({ lateAnswer: 'answer_to_ended_question' })

/**
 * A question answered by the managing agent closes the session's own card with this rejection, as
 * DSH's gateway forwards it (S36 Q2).
 */
export const QUESTION_TEXT = Object.freeze({
  answeredElsewhere: 'answered by the managing agent',
  aborted: 'aborted before the question was answered',
  /** The `question-call-ended` notice's text to the manager (mcp-schema NOTICE.codes). */
  callEnded: (toolName, cause) => `The session's ${toolName} call ended before anyone answered it (${cause}). The question stays open: answer it with ${TOOL.questionAnswer} and the answer is delivered into the session as a message.`,
  /** What the cause of an ended call reads as when DSH gave no text for it. */
  unknownCause: 'no reason given',
  /**
   * The message a question's late answer reaches its session as. JSON, as DSH's own
   * `answer_to_pending_question` reply, so the session's agent reads which call and questions it answers.
   */
  lateAnswer: (toolName, callId, questions, answers) => JSON.stringify({ kind: QUESTION_TEXT_KIND.lateAnswer, tool: toolName, callId: callId ?? null, questions, answers }),
})

/** Why a question batch was refused (`bad-answer`); domain words only, never shown as the code. */
export const ANSWER_RULE = Object.freeze({
  items: 'items', ids: 'ids', labels: 'labels', custom: 'custom', single: 'single',
  planOnly: 'plan-only', questionOnly: 'question-only', planBoth: 'plan-both', feedback: 'feedback',
  nothing: 'nothing',
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
  noticeFailed: 'domain: the manager could not be told that a question\'s call ended',
  lateAnswerFailed: 'domain: an ended question\'s answer could not be delivered into its session',
  frozenRequest: 'domain: a request could not be routed: its signal cannot be replaced',
  toolsFailed: 'domain: a managed session\'s tool could not be applied',
  toolsRemovalFailed: 'domain: a managed session\'s tool could not be removed',
  closeFailed: 'domain: a part did not close cleanly',
})
