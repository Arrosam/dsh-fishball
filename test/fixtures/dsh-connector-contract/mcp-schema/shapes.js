/**
 * Shared JSON Schema shapes of the core tools and events (task K1). They restate the V2 domain's
 * payloads (contract 1.2 §4–§5; the vocabularies moved into constants.js with C-WIRE-2) as MCP tool
 * schemas, timer-free (no `expiresAt` on a descriptor, D1) and without the V2 watch fields
 * (R-WATCH-03). Bounds that the subset cannot express (lengths, counts, bytes) stay the domain's
 * checks against PAYLOAD_LIMITS and the connector settings, with the codes contract 1.2 names.
 */
import {
  ANSWER_DECISIONS, APPROVAL_KIND, ARGUMENTS_STATUS, DECISION_KIND, DELIVERY, EVENT_TYPE, GRANT_KIND, IMAGE_TYPES, PLAN_REVIEW,
  PROMPT_DECISIONS, READ_ROLE, RETIREMENT_REASON, RISK, SETTLED_BY, SETTLEMENT_OUTCOME,
} from './constants.js'
import { anyValue, array, boolean, constant, integer, nullable, object, oneOfStrings, string } from './schema.js'

/** Milliseconds since the Unix epoch (WIRE). */
export const time = () => integer('milliseconds since the Unix epoch')
const sessionId = () => string('a main-DSH session id')

export const imageRef = () => object({
  attachmentId: string(), mediaType: oneOfStrings(IMAGE_TYPES), width: integer(), height: integer(), bytes: integer(),
})

export const questionItem = () => object(
  { id: string(), question: string() },
  {
    detail: string(),
    header: string(),
    options: array(object({ label: string() }, { description: string() })),
    multiSelect: boolean(),
    intent: object({ kind: constant(PLAN_REVIEW), approve: string() }, { callId: string() }),
  },
)

export const questionAnswerItem = () => object({ id: string(), selected: array(string()) }, { custom: string() })

/**
 * The live request a principal decides (contract 1.2 §5.1, timer-free). `offerId` is
 * `<approvalId>.r<revision>` (OFFER_ID); a `question` kind carries `questions`.
 */
export const descriptor = () => object(
  {
    approvalId: string(), offerId: string(), kind: oneOfStrings(Object.values(APPROVAL_KIND)), prompt: string(),
    choices: array(string()), title: string(), at: time(), toolName: string(), callId: nullable(string()),
    reason: string(), quotes: array(string()),
  },
  { arguments: string(), argumentsStatus: oneOfStrings(Object.values(ARGUMENTS_STATUS)), questions: array(questionItem()) },
)

export const sessionSummary = () => object({
  sessionId: sessionId(), title: string(), workspaceId: nullable(string()), running: boolean(), pendingInteraction: boolean(),
})

export const readMessage = () => object({
  seq: integer(), role: oneOfStrings(Object.values(READ_ROLE)), author: string(), text: string(), images: array(imageRef()),
})

export const grantSpec = () => object(
  { kind: oneOfStrings(Object.values(GRANT_KIND)), expiresAt: time() },
  { prefix: string() },
)

/**
 * `approval_answer`'s answer. The decisions a principal may send are APPROVAL_DECISION without
 * `ask`, and there is no `question` field (X-SEC X-02; the user's answer, 2026-11-17: an `ask` is
 * refused; there is no ask_agent to carry it back): a schema-level `invalid-arguments`.
 */
export const approvalAnswer = () => object(
  { decision: oneOfStrings(ANSWER_DECISIONS) },
  { risk: oneOfStrings(Object.values(RISK)), reason: string(), grant: grantSpec() },
)

export const promptSummary = () => object({
  promptId: string(), sessionId: sessionId(), title: string(), toolName: string(),
  argumentsStatus: oneOfStrings(Object.values(ARGUMENTS_STATUS)), since: time(), managed: boolean(),
})

export const grantSummary = () => object(
  {
    grantId: string(), sessionId: sessionId(), toolName: string(), kind: oneOfStrings(Object.values(GRANT_KIND)),
    expiresAt: time(), uses: integer(), paused: boolean(),
  },
  { prefix: string(), lastUsedAt: time() },
)

export const delivery = () => oneOfStrings(Object.values(DELIVERY))
export const promptDecision = () => oneOfStrings(PROMPT_DECISIONS)

/** The pending summary of the caller's own mailbox (design §3.3): `resources/read dsh-agent://events`. */
export const mailboxSummary = () => object({ pending: integer(), headSequence: integer(), mailboxGeneration: string() })

/**
 * One mailbox event (R-EVT-02, design §3.4). `type` is an EVENT_TYPE or
 * `contributed:<namespace>.<event>`; `payload` follows EVENT_PAYLOAD_SCHEMA for its type.
 * `sequence` grows by one per commit within one `mailboxGeneration`. `offer` is present exactly on
 * the answerable types (ANSWERABLE_TYPES). A replay has the same `eventId` and `payloadDigest`.
 */
export const mailboxEvent = () => object(
  {
    eventId: string(), mailboxGeneration: string(), sequence: integer(), type: string(), at: time(),
    sourceSessionId: nullable(sessionId()), correlationId: nullable(string()), payload: anyValue(), payloadDigest: string(),
  },
  { offer: object({ offerId: string(), revision: integer(), decisionKind: oneOfStrings(Object.values(DECISION_KIND)) }) },
)

/**
 * Event payloads by type (R-EVS-02). Offers carry the descriptor the matching `approvals_list`
 * row has, so a client never needs a second read to decide. `turn-finished` says whether the
 * session still runs and whether anything is queued for it (R-EVS-02). A `settlement` carries
 * `answers` for an answered session question or plan review.
 */
export const EVENT_PAYLOAD_SHAPES = Object.freeze({
  [EVENT_TYPE.permission]: descriptor,
  [EVENT_TYPE.question]: descriptor,
  [EVENT_TYPE.planReview]: descriptor,
  [EVENT_TYPE.ask]: descriptor,
  [EVENT_TYPE.settlement]: () => object(
    { approvalId: string(), outcome: oneOfStrings(Object.values(SETTLEMENT_OUTCOME)), by: oneOfStrings(Object.values(SETTLED_BY)) },
    { answers: array(questionAnswerItem()) },
  ),
  [EVENT_TYPE.retirement]: () => object({ retiredEventId: string(), reason: oneOfStrings(Object.values(RETIREMENT_REASON)) }),
  [EVENT_TYPE.turnFinished]: () => object({ sessionId: sessionId(), running: boolean(), queued: boolean() }),
  [EVENT_TYPE.state]: () => object({ sessionId: sessionId(), running: boolean(), pendingInteraction: boolean() }),
  [EVENT_TYPE.message]: () => object({ text: string(), images: array(imageRef()) }),
  [EVENT_TYPE.handover]: () => object({ sessionId: sessionId(), note: string() }),
  [EVENT_TYPE.takeback]: () => object({ sessionId: sessionId(), note: string() }),
  [EVENT_TYPE.notice]: () => object({ code: string(), text: string() }),
})

/** A contributor event's payload (design §13.5a): the public event name, its data and summary. */
export const contributedPayload = () => object(
  { namespace: string(), event: string(), data: anyValue() },
  { summary: string() },
)
