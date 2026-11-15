/**
 * Vocabulary of fishball-core's ask cards (task F-ASKCARD; K3 `contracts/ask-card.d.ts`, `ui.d.ts`
 * `asks`; R-FB-11, R-UI-12, R-CON-05, R-CON-06; PLAT-UC-07).
 *
 * K1's values (event types, the answer tool, refusal codes, `disconnected`) are read through core's
 * one K1 seam (`../link/schema.js`), and the V2 answer words (`DECISION`, `RISK`) from core's
 * vendored V2 contract, as the bridge façade reads `OPERATION`; nothing K1 owns is restated here.
 * What is left is this module's own: the card states, its storage domain, the filing tool, the
 * answer mapping the user chose, its owner-only routes and its log lines.
 */
import { REFUSAL } from '../link/schema.js'
import { DECISION, RISK } from '../../vendor/contract/contract.js'

/** `AskCard.state` (K3 PROPOSED, kept as proposed: v3-proposed-values.md row 52). */
export const CARD_STATE = Object.freeze({ open: 'open', answered: 'answered', closed: 'closed' })

/**
 * The filing tool's name table. It is core's own model tool on the manager, so GUARDS.coreTools
 * must list `{module: '../asks/constants.js', table: 'ASK_TOOL'}` for the R-FB-13 check to leave it
 * out (contracts/constants.js is K3's; relayed to F-WIRE).
 */
export const ASK_TOOL = Object.freeze({ fileCard: 'ask_user' })

export const ASKS = Object.freeze({
  /** One DSH storage-domain table in the Fishball DSH: one record per ask `approvalId`. */
  domain: 'fishball_core_asks',
  table: 'cards',
  version: 1,
  tool: ASK_TOOL.fileCard,
  /** The filing tool's one argument. */
  offerArgument: 'offer_id',
  /**
   * Q3 = A (the user, 2026-11-15): the card offers exactly Allow and Reject, each with an optional
   * reason; free text goes into the reason. They are the two final `approval_answer` decisions an
   * `ask` accepts (the connector's broker), so the choice is the K1 decision word itself.
   */
  choices: Object.freeze([DECISION.allow, DECISION.reject]),
  /**
   * The risk each choice is sent with. The connector's broker refuses an allow without risk `low`
   * and a reject without any risk (`risk-required`), and the card has no risk field, so core fills
   * it in (the user's choice, 2026-11-16): the user decided it, so an allow is low risk to them and
   * a reject is sent as high.
   */
  riskOf: Object.freeze({ [DECISION.allow]: RISK.low, [DECISION.reject]: RISK.high }),
  /**
   * The reason sent when the user gave none (the broker requires a non-empty one for both; the
   * user's choice, 2026-11-16). Model- and audit-facing English, like every K1 reason (Q7).
   */
  defaultReason: 'The user answered on Fishball\'s card.',
  /** Connector answers that mean the ask is no longer open there: the card closes. */
  closingCodes: Object.freeze([REFUSAL.alreadySettled, REFUSAL.expired]),
})

/** The filing tool's own refusal: no `ask` event with that offer id was seen. PROPOSED spelling. */
export const ASK_CODE = Object.freeze({ unknownOffer: 'unknown-offer' })

/** The filing tool's model-facing texts (English only, Q7). PROPOSED wording. */
export const ASK_TEXT = Object.freeze({
  description: 'Show an ask (an `ask` event) you cannot decide to the user as a card in your own conversation. '
    + 'Give the event\'s offer id. The user answers Allow or Reject, with an optional reason; their answer is sent for you, '
    + 'and the ask\'s settlement event tells you the outcome. Do not answer the ask yourself after filing it.',
  offerArgument: 'The `offer.offerId` of the ask event to show.',
})

/**
 * The tool in the raw form `ctx.tools.register` takes (JSON Schema, as the bridge façade registers
 * its tools), so it needs no `defineTool` and no dsh-tools import here. A raw definition gets no
 * argument validation from DSH, so `execute` checks `offer_id` itself; any other argument is
 * ignored. The output schema is empty (any JSON: a card or a refusal), as the façade's TOOL_OUTPUT.
 */
export const ASK_TOOL_DEFINITION = Object.freeze({
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({ [ASKS.offerArgument]: Object.freeze({ type: 'string', description: ASK_TEXT.offerArgument }) }),
    required: Object.freeze([ASKS.offerArgument]),
    additionalProperties: false,
  }),
  schema: Object.freeze({}),
  blockType: 'text',
  jsonIndent: 2,
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
  conflict: 409,
  json: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  eventStream: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
  frame: (json) => `data: ${json}\n\n`,
})

/** Background log lines (printf format); never a question, reason or token. */
export const ASK_LOG = Object.freeze({
  malformed: 'ask event %s ignored: malformed payload',
  commitFailed: 'ask card %s: the answer could not be sent (%s)',
  writeFailed: 'ask card store write failed (%s)',
})

export const ASK_MISUSE = Object.freeze({
  record: 'fishball asks: malformed card record',
  link: 'fishball asks: link must provide onPoll and callTool',
})
