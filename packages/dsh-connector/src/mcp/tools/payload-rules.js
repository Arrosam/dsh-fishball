/**
 * The core tools' payload rules (task C-WIRE-2; design §3.2: "Input schemas come from the frozen
 * `LIMITS`; byte limits are checked in domain code"). K1's closed input schema has already checked
 * every field's type (dispatch.js step 3); these are the bounds and required texts the schema
 * subset cannot express, V2's contract 1.2 §8 rules unchanged, now keyed by K1 tool name. They
 * moved here from `./contract`'s `validateRequest` when C-WIRE-2 deleted it.
 *
 * `payloadRefusal(name, args, now)` → a K1 REFUSAL code, or undefined when the arguments pass. A
 * rule that finds a shape K1's schema already admits but V2 refused as a malformed frame (an
 * empty session id, a duplicate list entry) answers `invalid-arguments`, as dispatch.js did for
 * V2's `invalid-envelope`.
 */
import { APPROVAL_DECISION, GRANT_KIND, IMAGE_MEDIA, IMAGE_TYPES, PAYLOAD_LIMITS, REFUSAL, TOOL } from '../../../mcp-schema/index.js'

/** A refusal raised by a rule; caught once in `payloadRefusal`. */
class PayloadRefusal extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}
const fail = (code = REFUSAL.invalidArguments) => { throw new PayloadRefusal(code) }

const codePoints = (text) => [...text].length
const nonEmpty = (text) => { if (text.length === 0) fail() }
const chars = (text, max) => { if (codePoints(text) > max) fail(REFUSAL.limitExceeded) }
const has = (value, key) => Object.hasOwn(value, key)
const unique = (values, keyOf = (value) => value) => { if (new Set(values.map(keyOf)).size !== values.length) fail() }

/** A reason the domain requires: within its bound, and with a visible character (V2's rule). */
function requiredReason(reason) {
  chars(reason, PAYLOAD_LIMITS.reasonChars)
  if (reason.trim().length === 0) fail(REFUSAL.reasonRequired)
}

/** hostRefs from attachment_put: single-use, so a repeated ref could not be consumed twice. */
function attachments(refs) {
  if (refs.length > PAYLOAD_LIMITS.attachmentsPerMessage) fail(REFUSAL.limitExceeded)
  refs.forEach(nonEmpty)
  unique(refs)
}

const delivery = (args) => { nonEmpty(args.sessionId); attachments(args.attachments) }

/** An option label or a header: non-empty and within the label bound. */
const label = (text) => { nonEmpty(text); chars(text, PAYLOAD_LIMITS.labelChars) }

function answerItems(items) {
  if (items.length === 0 || items.length > PAYLOAD_LIMITS.questionsPerRequest) fail(REFUSAL.limitExceeded)
  unique(items, (item) => item.id)
  for (const item of items) {
    nonEmpty(item.id)
    unique(item.selected)
    if (item.selected.length > PAYLOAD_LIMITS.selectedLabelsPerAnswer) fail(REFUSAL.limitExceeded)
    item.selected.forEach(label)
    if (has(item, 'custom')) chars(item.custom, PAYLOAD_LIMITS.customChars)
  }
}

/** `approval_answer`'s grant (§7a.8): an exact call or a shell-command prefix with a future end. */
function grantSpec(grant, now) {
  if (!Number.isSafeInteger(grant.expiresAt) || grant.expiresAt < 0) fail(REFUSAL.expiresInvalid)
  if (grant.expiresAt <= now) fail(REFUSAL.expiresPast)
  if (grant.kind !== GRANT_KIND.prefix) {
    if (has(grant, 'prefix')) fail(REFUSAL.grantInvalid)
    return
  }
  if (!has(grant, 'prefix')) fail(REFUSAL.prefixEmpty)
  chars(grant.prefix, PAYLOAD_LIMITS.grantPrefixChars)
  if (grant.prefix.trim().length === 0) fail(REFUSAL.prefixEmpty)
}

/** The decisions whose reason is required when given; `escalate` may carry an empty one. */
const REASONED = Object.freeze([APPROVAL_DECISION.allow, APPROVAL_DECISION.grant, APPROVAL_DECISION.reject])

function approvalAnswer({ sessionId, approvalId, offerId, answer }, now) {
  [sessionId, approvalId, offerId].forEach(nonEmpty)
  if (has(answer, 'reason')) {
    if (REASONED.includes(answer.decision)) requiredReason(answer.reason)
    else chars(answer.reason, PAYLOAD_LIMITS.reasonChars)
  }
  if (has(answer, 'question')) {
    if (answer.decision !== APPROVAL_DECISION.ask) fail()
    chars(answer.question, PAYLOAD_LIMITS.questionChars)
  }
  if (answer.decision === APPROVAL_DECISION.grant && !has(answer, 'grant')) fail(REFUSAL.grantInvalid)
  if (has(answer, 'grant')) {
    if (answer.decision !== APPROVAL_DECISION.grant) fail(REFUSAL.grantInvalid)
    grantSpec(answer.grant, now)
  }
}

const ANSWER_PARTS = Object.freeze(['answers', 'approve', 'feedback', 'toUser', 'note'])
function questionAnswer(args) {
  [args.sessionId, args.questionId, args.offerId].forEach(nonEmpty)
  if (!ANSWER_PARTS.some((key) => has(args, key))) fail()
  if (has(args, 'answers')) {
    answerItems(args.answers)
    if (has(args, 'approve') || has(args, 'feedback')) fail()
  }
  if (has(args, 'feedback')) chars(args.feedback, PAYLOAD_LIMITS.feedbackChars)
  if (has(args, 'note')) chars(args.note, PAYLOAD_LIMITS.noteChars)
}

function questions(items) {
  if (items.length === 0 || items.length > PAYLOAD_LIMITS.questionsPerRequest) fail(REFUSAL.limitExceeded)
  unique(items, (item) => item.id)
  for (const item of items) {
    nonEmpty(item.id)
    chars(item.question, PAYLOAD_LIMITS.questionChars)
    if (has(item, 'header')) label(item.header)
    for (const option of item.options ?? []) label(option.label)
    if (has(item, 'intent')) chars(item.intent.approve, PAYLOAD_LIMITS.labelChars)
  }
}

/** A display name is never a path or a URL (V2 §6.5); the attachment store still sanitizes it. */
const NAME_FORBIDDEN = Object.freeze(['\0', '/', '\\', '://'])

/** attachment_put: one image of at most 4 MiB, or a file; canonical chunks are the image port's. */
function attachmentPut(args) {
  nonEmpty(args.transferId)
  if (has(args, 'name')) {
    nonEmpty(args.name)
    if (NAME_FORBIDDEN.some((part) => args.name.includes(part))) fail()
  }
  if (args.total < 1) fail()
  if (args.mediaType.startsWith(IMAGE_MEDIA.prefix)) {
    if (!IMAGE_TYPES.includes(args.mediaType)) fail()
    if (args.total > PAYLOAD_LIMITS.imageBytes) fail(REFUSAL.tooLarge)
  }
  if (args.chunks.length === 0) fail()
}

/** One rule per tool; a tool absent here has nothing the schema leaves unchecked. */
const RULES = Object.freeze({
  [TOOL.sessionsList]: (args) => {
    if (args.limit < 0) fail()
    if (args.limit > PAYLOAD_LIMITS.sessionsListed) fail(REFUSAL.limitExceeded)
    if (has(args, 'workspaceId')) nonEmpty(args.workspaceId)
  },
  [TOOL.sessionStart]: (args) => {
    nonEmpty(args.folder)
    if (has(args, 'model')) nonEmpty(args.model)
    if (has(args, 'reasoningEffort')) nonEmpty(args.reasoningEffort)
    attachments(args.attachments)
  },
  [TOOL.sessionMessage]: delivery,
  [TOOL.sessionRedirect]: delivery,
  [TOOL.sessionStop]: (args) => nonEmpty(args.sessionId),
  [TOOL.sessionRead]: (args) => { nonEmpty(args.sessionId); if (args.maxMessages < 0 || args.maxBytes < 0) fail() },
  [TOOL.sessionRelease]: (args) => { nonEmpty(args.sessionId); requiredReason(args.reason) },
  [TOOL.approvalsList]: (args) => nonEmpty(args.sessionId),
  [TOOL.approvalAnswer]: approvalAnswer,
  [TOOL.questionAnswer]: questionAnswer,
  // Fishball's decision R5 (2026-11-14): the question counts and character limits apply before
  // `unsupported-operation` (handlers.js).
  [TOOL.questionAsk]: (args) => questions(args.questions),
  [TOOL.questionAnswerOwn]: (args) => { nonEmpty(args.questionId); answerItems(args.answers) },
  [TOOL.promptAnswer]: (args) => { nonEmpty(args.sessionId); nonEmpty(args.promptId); requiredReason(args.reason) },
  [TOOL.grantRevoke]: (args) => { nonEmpty(args.grantId); requiredReason(args.reason) },
  [TOOL.attachmentPut]: attachmentPut,
  [TOOL.attachmentRead]: (args) => { nonEmpty(args.sessionId); nonEmpty(args.attachmentId) },
})

/**
 * @param {string} name a core tool name
 * @param {object} args arguments that passed the tool's K1 input schema
 * @param {number} now epoch ms (a grant's end must be in the future)
 * @returns {string | undefined} the refusal code, or undefined
 */
export function payloadRefusal(name, args, now) {
  try {
    RULES[name]?.(args, now)
    return undefined
  } catch (error) {
    if (error instanceof PayloadRefusal) return error.code
    throw error
  }
}
