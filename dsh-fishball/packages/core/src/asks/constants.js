/**
 * Vocabulary of fishball-core's ask cards (task F-ASKCARD; K3 `contracts/ask-card.d.ts`, `ui.d.ts`
 * `asks`; R-FB-11, R-UI-12, R-CON-05, R-CON-06; PLAT-UC-07).
 *
 * The connector's values (event types, the answer tool, refusal codes, `disconnected`, the answer
 * words) are read from core's own copy of its MCP surface in `contracts/constants.js` (K3a `MCP`,
 * `LINK`, and `APPROVAL` for the decision and risk words; F-OWN-SCHEMA, design §1.0b row 1), as the
 * bridge façade reads them; nothing the connector owns is restated here.
 * What is left is this module's own: the card states, its storage domain, the filing tool, the
 * answer mapping the user chose, its owner-only routes and its log lines.
 */
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { APPROVAL, MCP } from '../../contracts/constants.js'

const REFUSAL = MCP.refusal
const DECISION = APPROVAL.decision
const RISK = APPROVAL.risk

/** `AskCard.state` (K3 PROPOSED, kept as proposed: v3-proposed-values.md row 52). */
export const CARD_STATE = Object.freeze({ open: 'open', answered: 'answered', closed: 'closed', voided: SEAM_TARGETS.ask.voided })

/** The manager’s filing tool name. */
export const ASK_TOOL = Object.freeze({ fileCard: 'ask_user' })

export const QUESTION_CARD = Object.freeze({
  kind: 'question',
  idPrefix: 'question-',
  nativeTool: 'ask_user_question',
  domain: 'fishball_core_questions',
  table: 'questions',
  version: 1,
  replySource: Object.freeze({ kind: 'user' }),
  event: Object.freeze({ session: 'session/event', admitted: 'user/message' }),
  services: Object.freeze({ sessions: 'sessions', agents: 'agents' }),
  running: 'running',
  description: 'Show a question card in Fishball and return its cardId immediately. Do not wait or poll; the user’s reply arrives later as a normal user message carrying that cardId and the question ids.',
  answerPrefix: 'Fishball question card answer: ',
  answerUnavailable: 'Fishball question answer could not be durably queued',
  invalidQuestions: 'Provide a nonempty list of questions with distinct IDs and valid options.',
  fileUnavailable: 'Fishball question card could not be saved',
  malformed: 'fishball-core: malformed local question card',
})

export const ASKS = Object.freeze({
  /** One DSH storage-domain table in the Fishball DSH: one record per ask `approvalId`. */
  domain: 'fishball_core_asks',
  table: 'cards',
  version: 1,
  tool: ASK_TOOL.fileCard,
  /**
   * The offer events a card can be filed for. `permission`: the user's answer of 2026-11-17 (F-FIX),
   * after C-WIRE-2 removed `ask_agent` ("不给ask_agent工具"), which left no producer of `ask`: a
   * permission request Fishball cannot decide may become a card on the Fishball page (e2e R2-06),
   * answered Allow once / Reject as Fishball's `approval_answer`. `ask` stays: K1 keeps the type
   * frozen. Managed-session questions and plan reviews are not cards in this layer yet.
   */
  eventTypes: Object.freeze([MCP.eventTypes.permission, MCP.eventTypes.ask]),
  /** The filing tool's one argument. */
  offerArgument: 'offer_id',
  /** The K1 `approval_answer` arguments that name the answered request and offer (connector input schema). */
  answerArguments: Object.freeze({ approvalId: 'approvalId', offerId: 'offerId' }),
  /**
   * Q3 = A (the user, 2026-11-15): the card offers exactly Allow and Reject, each with an optional
   * reason; free text goes into the reason. They are two final `approval_answer` decisions a
   * permission offer accepts (the connector's broker), so the choice is the K1 decision word itself.
   */
  choices: Object.freeze([DECISION.allow, DECISION.reject]),
  /** The choices of a card whose call arguments are not complete: the connector refuses an allow then (`arguments-incomplete`), so only Reject is offered (the user, 2026-11-17). */
  incompleteChoices: Object.freeze([DECISION.reject]),
  /**
   * The risk each choice is sent with. The connector's broker refuses an allow without risk `low`
   * and a reject without any risk (`risk-required`), and the card has no risk field, so core fills
   * it in (the user's choice, 2026-11-16): the user decided it, so an allow is low risk to them and
   * a reject is sent as high.
   */
  riskOf: Object.freeze({ [DECISION.allow]: RISK.low, [DECISION.reject]: RISK.high }),
  /** Correlated connector notice and the user-facing text for its action notification. */
  permissionEscalated: 'permission-escalated',
  automaticNotice: 'A permission request needs your decision in Fishball.',
  /** The connector requires a reason, even when the user leaves it blank. */
  defaultReason: 'The user answered on Fishball\'s card.',
  /** Connector answers that mean the ask is no longer open there: the card closes. */
  closingCodes: Object.freeze([REFUSAL.alreadySettled, REFUSAL.expired]),
  /**
   * `approvals_list` refusals that mean every ask of that session ended (the session is gone). Any
   * other refusal (`not-managed`, `forbidden`, `disconnected`, a failure) says nothing about the
   * call, so its asks are kept for the next start.
   */
  endedCodes: Object.freeze([APPROVAL.refusal.unknownSession]),
})

/** The filing tool's own refusal: no offer event of `ASKS.eventTypes` with that offer id was seen. PROPOSED spelling. */
export const ASK_CODE = Object.freeze({ unknownOffer: 'unknown-offer' })

/** The filing tool's model-facing texts (English only, Q7). PROPOSED wording. */
export const ASK_TEXT = Object.freeze({
  description: 'Legacy fallback: show a permission request in this chat only if its offer does not enable automatic permission cards. If automatic cards are enabled, escalate instead; do not call this tool for the same request. '
    + 'Give the event\'s offer id. The user answers Allow once or Reject, with an optional reason; their answer is sent for you, '
    + 'and the request\'s settlement event tells you the outcome. Do not answer the request yourself after filing it.',
  offerArgument: 'The `offer.offerId` of the permission event to show.',
})

/**
 * The tool in the raw form `ctx.tools.register` takes (JSON Schema, as the bridge façade registers
 * its tools), so it needs no `defineTool` and no dsh-tools import here. A raw definition gets no
 * argument validation from DSH, so `execute` checks `offer_id` itself; any other argument is
 * ignored. The output schema is empty (any JSON: a card or a refusal), as the façade's TOOL_OUTPUT;
 * the result renders as core's other JSON tools do (src/tool-output.js).
 */
export const ASK_TOOL_DEFINITION = Object.freeze({
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({ [ASKS.offerArgument]: Object.freeze({ type: 'string', description: ASK_TEXT.offerArgument }) }),
    required: Object.freeze([ASKS.offerArgument]),
    additionalProperties: false,
  }),
  schema: Object.freeze({}),
})

/**
 * The owner-only Fetch routes of the Fishball DSH the card is drawn from (core's own page; the main
 * DSH registers nothing, R-UI-12, Q-U2). Paths are relative to DSH's page in the browser half.
 */
export const ASK_ROUTE = Object.freeze({
  events: '/api/fishball/asks/events',
  answer: '/api/fishball/asks/answer',
  get: 'GET',
  post: 'POST',
  requestBody: 'buffered',
})

export const ASK_HTTP = Object.freeze({
  ok: 200,
  badRequest: 400,
  // An unknown card handle (MULTI-0 `SEAM_TARGETS.http`, the answer route's own status for it).
  notFound: SEAM_TARGETS.http.notFound,
  conflict: 409,
  json: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  eventStream: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
  frame: (json) => `data: ${json}\n\n`,
})

/** Background log lines (printf format); never a question, reason or token. */
export const ASK_LOG = Object.freeze({
  malformed: 'offer event %s ignored: malformed payload',
  commitFailed: 'ask card %s: the answer could not be sent (%s)',
  handoffFailed: 'permission handoff failed (%s)',
  noticeFailed: 'permission action notice failed (%s)',
  writeFailed: 'ask card store write failed (%s)',
  reconciled: 'ask card reconciliation: %d ended unfiled ask(s) deleted, %d kept',
  reconcileFailed: 'ask card reconciliation: a session\'s asks were kept (%s)',
})

export const ASK_MISUSE = Object.freeze({
  record: 'fishball asks: malformed card record',
  targets: 'fishball asks: targets must provide callTool and live',
})
