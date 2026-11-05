/**
 * The slim Fishball contract, envelope v2 (§15 T01).
 *
 * Contract only: this module imports no DSH package and holds no behaviour beyond validation
 * and constants. The main host and the child app validate every frame with it.
 *
 * Envelope v2 keeps envelope v1's seven-key frame (src/native-control/protocol.js) and replaces
 * v1's operation set with §5.2's: attachment transfer, the full approval, question, prompt and
 * grant answers today's Fishball tools carry, session release, and the inbox/session-state
 * messages. The lifecycle wire owns identity and its HMAC proof; the handshake here negotiates
 * which §5.2 operations each side implements.
 */
import { LIMITS } from './limits.js'
export { LIMITS }

/** Which side is sending or receiving. A request travels from its source side to its target. */
export const SIDE = Object.freeze({ child: 'child', main: 'main' })
export const DIRECTION = Object.freeze({ childToMain: 'child-to-main', mainToChild: 'main-to-child' })

export const ENVELOPE = Object.freeze({
  version: 2,
  handshake: 'handshake',
  keys: Object.freeze(['version', 'hostId', 'sessionId', 'requestId', 'type', 'operation', 'payload']),
  type: Object.freeze({ request: 'request', response: 'response', error: 'error', event: 'event' }),
})

/** The exact §5.2 request allowlist; these names, and no others, may appear in a request frame. */
export const OPERATION = Object.freeze({
  sessionList: 'session.list',
  sessionStart: 'session.start',
  sessionMessage: 'session.message',
  sessionRedirect: 'session.redirect',
  sessionStop: 'session.stop',
  sessionRead: 'session.read',
  sessionWatch: 'session.watch',
  sessionWatches: 'session.watches',
  sessionUnwatch: 'session.unwatch',
  sessionRelease: 'session.release',
  approvalList: 'approval.list',
  approvalAnswer: 'approval.answer',
  questionAnswer: 'question.answer',
  questionAsk: 'question.ask',
  questionAnswerOwn: 'question.answerOwn',
  promptList: 'prompt.list',
  promptAnswer: 'prompt.answer',
  grantList: 'grant.list',
  grantRevoke: 'grant.revoke',
  attachmentRead: 'attachment.read',
  attachmentPut: 'attachment.put',
  inboxPush: 'inbox.push',
})

const spec = (direction, sessionScoped) => Object.freeze({ direction, sessionScoped })

/**
 * Direction and envelope-scope rules for each operation. A session-scoped operation must carry
 * that sessionId both in the envelope (the authorization target) and in its payload (§5.1);
 * a cross-session or instance-scoped operation carries a null envelope sessionId.
 */
export const OPERATIONS = Object.freeze({
  [OPERATION.sessionList]: spec(DIRECTION.childToMain, false),
  [OPERATION.sessionStart]: spec(DIRECTION.childToMain, false),
  [OPERATION.sessionMessage]: spec(DIRECTION.childToMain, true),
  [OPERATION.sessionRedirect]: spec(DIRECTION.childToMain, true),
  [OPERATION.sessionStop]: spec(DIRECTION.childToMain, true),
  [OPERATION.sessionRead]: spec(DIRECTION.childToMain, true),
  [OPERATION.sessionWatch]: spec(DIRECTION.childToMain, true),
  [OPERATION.sessionWatches]: spec(DIRECTION.childToMain, false),
  [OPERATION.sessionUnwatch]: spec(DIRECTION.childToMain, false),
  [OPERATION.sessionRelease]: spec(DIRECTION.childToMain, true),
  [OPERATION.approvalList]: spec(DIRECTION.childToMain, true),
  [OPERATION.approvalAnswer]: spec(DIRECTION.childToMain, true),
  [OPERATION.questionAnswer]: spec(DIRECTION.childToMain, true),
  // Fishball's own question to the user is instance-scoped: its card names no main session, so
  // the envelope's sessionId is null and the payload carries Fishball's own session for the card.
  [OPERATION.questionAsk]: spec(DIRECTION.childToMain, false),
  [OPERATION.questionAnswerOwn]: spec(DIRECTION.childToMain, false),
  [OPERATION.promptList]: spec(DIRECTION.childToMain, false),
  [OPERATION.promptAnswer]: spec(DIRECTION.childToMain, true),
  [OPERATION.grantList]: spec(DIRECTION.childToMain, false),
  [OPERATION.grantRevoke]: spec(DIRECTION.childToMain, false),
  [OPERATION.attachmentRead]: spec(DIRECTION.childToMain, true),
  [OPERATION.attachmentPut]: spec(DIRECTION.childToMain, false),
  [OPERATION.inboxPush]: spec(DIRECTION.mainToChild, false),
})

/** The exact §5.2 event allowlist, plus the one direction every event takes. */
export const EVENT = Object.freeze({
  approvalRequest: 'approval.request',
  approvalSettled: 'approval.settled',
  /** T08: a call ran on an approval Fishball or the user already gave (the "ran on" label). */
  approvalRan: 'approval.ran',
  watchStatus: 'watch.status',
  sessionState: 'session.state',
})
export const EVENTS = Object.freeze([
  EVENT.approvalRequest, EVENT.approvalSettled, EVENT.approvalRan, EVENT.watchStatus, EVENT.sessionState,
])
export const EVENT_DIRECTION = DIRECTION.mainToChild

/**
 * Payload vocabularies, reused from today's main-side services so the child speaks one language:
 * delivery, read_session roles, approval decisions/risk/kinds, prompt decisions, grant kinds,
 * question/plan-review shapes, watch mode/status and the watch event state (v1's "existing"
 * watch.status), intake kinds and the escalation answerer.
 */
export const DELIVERY = Object.freeze({ delivered: 'delivered', unconfirmed: 'unconfirmed' })
export const ROLE = Object.freeze({ user: 'user', assistant: 'assistant', fishball: 'fishball', agent: 'agent', context: 'context' })
export const DECISION = Object.freeze({ allow: 'allow', grant: 'grant', reject: 'reject', ask: 'ask', escalate: 'escalate' })
export const RISK = Object.freeze({ low: 'low', high: 'high' })
export const GRANT_KIND = Object.freeze({ exact: 'exact', prefix: 'prefix' })
export const PROMPT_DECISIONS = Object.freeze([DECISION.allow, DECISION.reject])
export const APPROVAL_KIND = Object.freeze({ approval: 'approval', question: 'question' })
export const PLAN_REVIEW = 'plan-review'
export const ARGUMENTS_STATUS = Object.freeze({ complete: 'complete', truncated: 'truncated', unavailable: 'unavailable' })
export const WATCH_MODE = Object.freeze({ once: 'once', repeat: 'repeat' })
export const WATCH_STATUS = Object.freeze({ active: 'active', closed: 'closed', targetMissing: 'target-missing' })
export const WATCH_STATE = Object.freeze({ idle: 'idle', running: 'running', waiting: 'waiting', closed: 'closed' })
export const WATCH_ERROR = Object.freeze({
  unknownSession: 'unknown-session',
  archived: 'archived',
  isFishball: 'is-fishball',
  limitReached: 'limit-reached',
  unknownWatch: 'unknown-watch',
  notRelated: 'not-related',
  featureOff: 'feature-off',
})
export const SETTLED_BY = Object.freeze({ user: 'user', fishball: 'fishball' })
/**
 * What let a call run without asking (T08's decision label, §8.1): a one-time approval Fishball
 * or the user gave, or Fishball's standing grant. The label says which and who gave it.
 */
export const RAN_VIA = Object.freeze({ pass: 'pass', grant: 'grant' })
/** Mirrors today's intake ledger kinds (§4, INTAKE_KIND). */
export const INBOX_KIND = Object.freeze({
  session: 'session', user: 'user', system: 'system', watch: 'watch', approval: 'approval', plugin: 'plugin',
})

/** 0.2.2's allowed image media types (§6.2); other media types travel as files. */
export const MEDIA = Object.freeze({ prefix: 'image/', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })
export const IMAGE_TYPES = Object.freeze([MEDIA.png, MEDIA.jpeg, MEDIA.webp, MEDIA.gif])
export const DIGEST = Object.freeze({ algorithm: 'sha256', hex: '0123456789abcdef', hexLength: 64 })
/** A bridge display name is never a path or a URL; the attachment store still sanitizes it (§6.5). */
const NAME = Object.freeze({ nul: '\0', separators: Object.freeze(['/', '\\']), scheme: '://' })

/**
 * Stable error codes. Envelope and authorization codes come from v1; the operation-specific
 * refusals mirror §5.2's approvals, questions, prompts, grants and release, plus §6.3's
 * images-unsupported. operation-failed is the only code for an unexpected host failure.
 */
export const ERROR = Object.freeze({
  invalid: 'invalid-envelope',
  version: 'unsupported-version',
  host: 'wrong-host',
  operation: 'unsupported-operation',
  capability: 'unsupported-capability',
  handshakeRequired: 'handshake-required',
  forbidden: 'forbidden',
  limit: 'limit-exceeded',
  disconnected: 'disconnected',
  timeout: 'timeout',
  conflict: 'conflict',
  expired: 'expired',
  notReferenced: 'not-referenced',
  tooLarge: 'too-large',
  imagesUnsupported: 'images-unsupported',
  failed: 'operation-failed',
  duplicate: 'duplicate-request',
  // Answer and management refusals mirror today's tool codes (§5.2).
  unknownSession: 'unknown-session',
  isFishball: 'is-fishball',
  notManaged: 'not-managed',
  featureOff: 'feature-off',
  invalidDecision: 'invalid-decision',
  riskRequired: 'risk-required',
  reasonRequired: 'reason-required',
  allowNeedsLowRisk: 'allow-needs-low-risk',
  argumentsIncomplete: 'arguments-incomplete',
  questionRequired: 'question-required',
  modeUser: 'mode-user',
  badAnswer: 'bad-answer',
  alreadySettled: 'already-settled',
  sessionNotLive: 'session-not-live',
  grantInvalid: 'grant-invalid',
  prefixNotShellTool: 'prefix-not-shell-tool',
  prefixEmpty: 'prefix-empty',
  prefixNotInCall: 'prefix-not-in-call',
  expiresRequired: 'expires-at-required',
  expiresInvalid: 'expires-at-invalid',
  expiresPast: 'expires-at-past',
  grantUnknown: 'unknown',
  grantEnded: 'ended',
})

/**
 * Lifecycle states and safe status codes the main page may show (§11). The removed legacy
 * open route's NATIVE_OPEN_FAILED is deliberately absent.
 */
export const STATUS = Object.freeze({
  disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'ready',
  stopping: 'stopping', stopped: 'stopped', failed: 'failed',
})
export const STATUS_CODES = Object.freeze({
  startFailed: 'NATIVE_START_FAILED',
  stopFailed: 'NATIVE_STOP_FAILED',
  childExited: 'NATIVE_CHILD_EXITED',
  unavailable: 'NATIVE_UNAVAILABLE',
  timeout: 'NATIVE_TIMEOUT',
  disabled: 'NATIVE_DISABLED',
})

/**
 * The main DSH routes the browser uses; the child port is never addressed by the browser (§3.1).
 * /fishball/embed is the registered prefix and /fishball/embed/ the document the iframe loads —
 * the trailing slash keeps relative UI URLs under /fishball/embed/ui/ (§3.6, §7).
 */
export const ROUTES = Object.freeze({
  prefix: '/fishball/embed',
  document: '/fishball/embed/',
  ui: '/fishball/embed/ui/',
  api: '/fishball/embed/api/',
  events: '/fishball/embed/api/events',
  methods: Object.freeze(['GET', 'HEAD', 'POST']),
})

/** The embed route admits only same-origin page fetches before it forwards (§3.1). */
export const ADMISSION = Object.freeze({ siteHeader: 'sec-fetch-site', sameOrigin: 'same-origin' })

/**
 * Bearer rules (§3.2): a 256-bit per-instance token minted by the child, returned over the
 * authenticated lifecycle wire, held only in main-process memory and attached to every proxied
 * child request. It is never persisted, never in a URL and never readable by page JavaScript;
 * the child answers 401 to anything else.
 */
export const BEARER = Object.freeze({
  header: 'authorization',
  scheme: 'Bearer',
  separator: ' ',
  tokenBytes: 32,
  unauthorizedStatus: 401,
  rotatesOnRestart: true,
  persisted: false,
  inUrl: false,
  inBrowserStorage: false,
})

export class ContractError extends Error {
  constructor(code) {
    super(code)
    this.name = 'ContractError'
    this.code = code
  }
}

export function fail(code = ERROR.invalid) { throw new ContractError(code) }

const NUMBER = Object.freeze({ zero: 0, one: 1 })
const NO_KEYS = Object.freeze([])

/** Plain, dense, data-only containers: accessors and extra own keys cannot smuggle values past a check. */
function exact(value, required, optional = NO_KEYS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail()
  const allowed = new Set([...required, ...optional])
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) fail()
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail()
  }
  for (const key of required) if (!Object.hasOwn(value, key)) fail()
}

function list(values) {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype) fail()
  // Own keys are the indices plus 'length'; holes and extra properties are rejected.
  if (Reflect.ownKeys(values).length !== values.length + NUMBER.one) fail()
  for (let index = NUMBER.zero; index < values.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail()
  }
}

function text(value) { if (typeof value !== 'string' || value.length === NUMBER.zero) fail() }
function string(value) { if (typeof value !== 'string') fail() }
function natural(value) { if (!Number.isSafeInteger(value) || value < NUMBER.zero) fail() }
function positive(value) { if (!Number.isSafeInteger(value) || value < NUMBER.one) fail() }
function boolean(value) { if (typeof value !== 'boolean') fail() }
function member(value, values, code = ERROR.invalid) { if (!values.includes(value)) fail(code) }

function uniqueStrings(values, code = ERROR.invalid) {
  list(values)
  if (new Set(values).size !== values.length) fail(code)
  for (const value of values) text(value)
}

function uniqueBy(values, keyOf) {
  const seen = new Set()
  for (const value of values) {
    const key = keyOf(value)
    if (seen.has(key)) fail()
    seen.add(key)
  }
}

/** A character cap (code points), not a byte cap; used for the fields a person reads. */
function chars(value, max) {
  string(value)
  if ([...value].length > max) fail(ERROR.limit)
}

function bytes(value, max) {
  string(value)
  if (Buffer.byteLength(value, 'utf8') > max) fail(ERROR.limit)
}

/** The validation clock; a caller may pin it so a future expiresAt is checked deterministically. */
function nowMs(context) {
  const value = context?.now ?? Date.now()
  if (!Number.isSafeInteger(value) || value < NUMBER.zero) fail()
  return value
}

function digest(value) {
  text(value)
  if (value.length !== DIGEST.hexLength) fail()
  for (const character of value) if (!DIGEST.hex.includes(character)) fail()
}

/** Canonical padded base64 only, so both sides decode exactly the same bytes. */
function base64Size(value) {
  text(value)
  let bytes
  try { bytes = Buffer.from(value, 'base64') } catch { fail() }
  if (bytes.toString('base64') !== value) fail()
  return bytes.length
}

function chunks(values, total) {
  list(values)
  if (values.length === NUMBER.zero) fail()
  let sum = NUMBER.zero
  for (const chunk of values) {
    const size = base64Size(chunk)
    if (size > LIMITS.chunkBytes) fail(ERROR.limit)
    sum += size
  }
  if (sum !== total) fail()
}

function isImage(mediaType) { return mediaType.startsWith(MEDIA.prefix) }

function transferMediaType(value) {
  text(value)
  if (isImage(value)) member(value, IMAGE_TYPES)
}

function displayName(value) {
  text(value)
  if (value.includes(NAME.nul) || value.includes(NAME.scheme)) fail()
  if (NAME.separators.some((separator) => value.includes(separator))) fail()
}

/** Image metadata only — no path, URL or bytes (§6.1, §6.5). */
function imageRef(value) {
  exact(value, ['attachmentId', 'mediaType', 'width', 'height', 'bytes'])
  text(value.attachmentId)
  member(value.mediaType, IMAGE_TYPES)
  positive(value.width)
  positive(value.height)
  if (value.width * value.height > LIMITS.imagePixels) fail(ERROR.limit)
  positive(value.bytes)
  if (value.bytes > LIMITS.imageBytes) fail(ERROR.limit)
}

function arrayOf(values, validate) {
  list(values)
  for (const value of values) validate(value)
}

function images(values) {
  arrayOf(values, imageRef)
  if (values.length > LIMITS.imagesPerMessage) fail(ERROR.limit)
}

/** hostRefs from attachment.put: single-use, so a repeated ref cannot be consumed twice (§5.2, §6.4). */
function attachments(values) {
  list(values)
  if (values.length > LIMITS.attachmentsPerMessage) fail(ERROR.limit)
  const seen = new Set()
  for (const reference of values) {
    text(reference)
    if (seen.has(reference)) fail()
    seen.add(reference)
  }
}

function sessionSummary(value) {
  exact(value, ['sessionId', 'title', 'workspaceId', 'running', 'pendingInteraction'])
  text(value.sessionId)
  string(value.title)
  if (value.workspaceId !== null) text(value.workspaceId)
  boolean(value.running)
  boolean(value.pendingInteraction)
}

/** One read_session message: role plus the writer identity, never image bytes by default (§6.1). */
function readMessage(value) {
  exact(value, ['seq', 'role', 'author', 'text', 'images'])
  natural(value.seq)
  member(value.role, Object.values(ROLE))
  text(value.author)
  string(value.text)
  images(value.images)
}

/**
 * The live request approval.list and approval.request carry. It keeps v1's fields and adds the
 * decision-label snapshot (§8.1); a question also carries its DSH question items, which the child
 * renders and answers with question.answer. T08 adds the call's exact arguments as an optional
 * pair (a label expands to the request the user is deciding), so a host that does not read them
 * still offers a valid descriptor.
 */
const APPROVAL_DESCRIPTOR_KEYS = Object.freeze([
  'approvalId', 'offerId', 'kind', 'prompt', 'choices', 'expiresAt',
  'title', 'at', 'toolName', 'callId', 'reason', 'quotes',
])
const APPROVAL_DESCRIPTOR_OPTIONAL = Object.freeze(['arguments', 'argumentsStatus'])

function approvalDescriptor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const questioned = value.kind === APPROVAL_KIND.question
  exact(value, questioned ? [...APPROVAL_DESCRIPTOR_KEYS, 'questions'] : APPROVAL_DESCRIPTOR_KEYS, APPROVAL_DESCRIPTOR_OPTIONAL)
  text(value.approvalId)
  text(value.offerId)
  member(value.kind, Object.values(APPROVAL_KIND))
  text(value.prompt)
  uniqueStrings(value.choices)
  natural(value.expiresAt)
  chars(value.title, LIMITS.titleChars)
  natural(value.at)
  text(value.toolName)
  if (value.callId !== null) text(value.callId)
  chars(value.reason, LIMITS.reasonChars)
  arrayOf(value.quotes, (quote) => bytes(quote, LIMITS.quoteBytes))
  // Both or neither: a status without the text it describes cannot be shown.
  if (Object.hasOwn(value, 'arguments')) {
    chars(value.arguments, LIMITS.argumentChars)
    member(value.argumentsStatus, Object.values(ARGUMENTS_STATUS))
  } else if (Object.hasOwn(value, 'argumentsStatus')) fail()
  if (questioned) questions(value.questions)
}

/** The existing watch registry's identity and state; §5.2 leaves the list record to this contract. */
function watchRecord(value) {
  exact(value, ['watchId', 'sessionId', 'mode', 'status'])
  text(value.watchId)
  text(value.sessionId)
  member(value.mode, Object.values(WATCH_MODE))
  member(value.status, Object.values(WATCH_STATUS))
}

/**
 * answer_approval's grant, as today's tool carries it: an exact call or a shell-command prefix,
 * with an end time that must be in the future (§7a.8). The host still checks that a prefix
 * belongs to the asking call and its tool; that needs the call, not the frame.
 */
function grantSpec(value, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(ERROR.grantInvalid)
  exact(value, [], ['kind', 'prefix', 'expiresAt'])
  if (!Object.hasOwn(value, 'kind')) fail(ERROR.grantInvalid)
  member(value.kind, Object.values(GRANT_KIND), ERROR.grantInvalid)
  if (!Object.hasOwn(value, 'expiresAt')) fail(ERROR.expiresRequired)
  if (!Number.isSafeInteger(value.expiresAt) || value.expiresAt < NUMBER.zero) fail(ERROR.expiresInvalid)
  if (value.expiresAt <= now) fail(ERROR.expiresPast)
  if (value.kind === GRANT_KIND.prefix) {
    if (typeof value.prefix !== 'string') fail(ERROR.prefixEmpty)
    chars(value.prefix, LIMITS.grantPrefixChars)
    if (value.prefix.trim().length === NUMBER.zero) fail(ERROR.prefixEmpty)
  } else if (Object.hasOwn(value, 'prefix')) fail(ERROR.grantInvalid)
}

/** answer_approval's answer object (§5.2): the decision plus the fields that decision uses. */
function approvalAnswer(value, context) {
  exact(value, ['decision'], ['risk', 'reason', 'question', 'grant'])
  member(value.decision, Object.values(DECISION))
  if (Object.hasOwn(value, 'risk')) member(value.risk, Object.values(RISK))
  if (Object.hasOwn(value, 'reason')) chars(value.reason, LIMITS.reasonChars)
  if (Object.hasOwn(value, 'question')) {
    if (value.decision !== DECISION.ask) fail()
    chars(value.question, LIMITS.questionChars)
  }
  if (Object.hasOwn(value, 'grant')) {
    if (value.decision !== DECISION.grant) fail(ERROR.grantInvalid)
    grantSpec(value.grant, nowMs(context))
  }
}

function questionOption(value) {
  exact(value, ['label'], ['description'])
  chars(value.label, LIMITS.labelChars)
  if (Object.hasOwn(value, 'description')) string(value.description)
}

/** DSH's presentation intent (dsh-user-questions): a plan review names the option that approves it. */
function planIntent(value) {
  exact(value, ['kind', 'approve'], ['callId'])
  if (value.kind !== PLAN_REVIEW) fail()
  chars(value.approve, LIMITS.labelChars)
  if (Object.hasOwn(value, 'callId')) text(value.callId)
}

/** One question as DSH asks it; detail (a plan) and description are free text, frame-bounded. */
function questionItem(value) {
  exact(value, ['id', 'question'], ['detail', 'header', 'options', 'multiSelect', 'intent'])
  text(value.id)
  chars(value.question, LIMITS.questionChars)
  if (Object.hasOwn(value, 'detail')) string(value.detail)
  if (Object.hasOwn(value, 'header')) chars(value.header, LIMITS.labelChars)
  if (Object.hasOwn(value, 'options')) arrayOf(value.options, questionOption)
  if (Object.hasOwn(value, 'multiSelect')) boolean(value.multiSelect)
  if (Object.hasOwn(value, 'intent')) planIntent(value.intent)
}

function questions(values) {
  arrayOf(values, questionItem)
  if (values.length === NUMBER.zero || values.length > LIMITS.questionsPerRequest) fail(ERROR.limit)
  uniqueBy(values, (question) => question.id)
}

function capabilities(values) {
  uniqueStrings(values, ERROR.capability)
  for (const capability of values) member(capability, Object.keys(OPERATIONS), ERROR.capability)
}

/** Capabilities are the §5.2 request names a peer implements; the handshake never admits an event. */
export function requireCapabilities(available, required) {
  capabilities(available)
  capabilities(required)
  if (required.some((capability) => !available.includes(capability))) fail(ERROR.capability)
}

function requestSessionList(payload) {
  exact(payload, ['limit'], ['workspaceId'])
  if (Object.hasOwn(payload, 'workspaceId')) text(payload.workspaceId)
  natural(payload.limit)
  if (payload.limit > LIMITS.sessionsListed) fail(ERROR.limit)
}

function responseSessionList(payload) {
  exact(payload, ['sessions'])
  arrayOf(payload.sessions, sessionSummary)
  if (payload.sessions.length > LIMITS.sessionsListed) fail(ERROR.limit)
}

function requestSessionStart(payload) {
  exact(payload, ['folder', 'title', 'message', 'attachments'], ['model', 'reasoningEffort'])
  text(payload.folder)
  string(payload.title)
  string(payload.message)
  if (Object.hasOwn(payload, 'model')) text(payload.model)
  if (Object.hasOwn(payload, 'reasoningEffort')) text(payload.reasoningEffort)
  attachments(payload.attachments)
}

/**
 * titleError/workspaceError are the host's typed partial refusals: a start may still have
 * produced its session, so they are result fields rather than frame errors (§5.2).
 */
function responseSessionStart(payload) {
  exact(payload, ['sessionId', 'managed'], ['titleError', 'workspaceError'])
  text(payload.sessionId)
  boolean(payload.managed)
  for (const key of ['titleError', 'workspaceError']) if (Object.hasOwn(payload, key)) text(payload[key])
}

/** session.message and session.redirect send the same payload; redirect runs after a cancel. */
function requestSessionMessage(payload) {
  exact(payload, ['sessionId', 'message', 'attachments'])
  text(payload.sessionId)
  string(payload.message)
  attachments(payload.attachments)
}

/** An unconfirmed delivery is terminal for that messageId: it is never retried (§5.2). */
function responseSessionDelivery(payload) {
  exact(payload, ['status'])
  member(payload.status, Object.values(DELIVERY))
}

function requestSessionStop(payload) {
  exact(payload, ['sessionId'], ['reason'])
  text(payload.sessionId)
  if (Object.hasOwn(payload, 'reason')) string(payload.reason)
}

/** A single-flag acknowledgement is that true flag and nothing else. */
function trueFlag(payload, key) {
  exact(payload, [key])
  if (payload[key] !== true) fail()
}

function responseSessionStop(payload) { trueFlag(payload, 'stopped') }

/** The host honours the caller's bounds and reports whether it cut the read (§5.2). */
function requestSessionRead(payload) {
  exact(payload, ['sessionId', 'maxMessages', 'maxBytes'])
  text(payload.sessionId)
  natural(payload.maxMessages)
  natural(payload.maxBytes)
}

function responseSessionRead(payload) {
  exact(payload, ['messages', 'truncated'])
  arrayOf(payload.messages, readMessage)
  boolean(payload.truncated)
}

function requestSessionWatch(payload) {
  exact(payload, ['sessionId', 'mode'])
  text(payload.sessionId)
  member(payload.mode, Object.values(WATCH_MODE))
}

/** Success mints a watchId; refusal carries the existing watch error vocabulary (§5.2). */
function responseSessionWatch(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail()
  if (Object.hasOwn(payload, 'watchId')) {
    exact(payload, ['watchId'])
    text(payload.watchId)
  } else {
    exact(payload, ['watchError'])
    member(payload.watchError, Object.values(WATCH_ERROR))
  }
}

/** session.watches, prompt.list and grant.list carry no request fields. */
function requestEmpty(payload) { exact(payload, []) }

function responseSessionWatches(payload) {
  exact(payload, ['watches'])
  arrayOf(payload.watches, watchRecord)
}

function requestSessionUnwatch(payload) {
  exact(payload, ['watchId'])
  text(payload.watchId)
}

function responseSessionUnwatch(payload) { trueFlag(payload, 'ok') }

function requestApprovalList(payload) {
  exact(payload, ['sessionId'])
  text(payload.sessionId)
}

function responseApprovalList(payload) {
  exact(payload, ['approvals'])
  arrayOf(payload.approvals, approvalDescriptor)
  uniqueBy(payload.approvals, (approval) => approval.approvalId)
}

function requestApprovalAnswer(payload, context) {
  exact(payload, ['sessionId', 'approvalId', 'offerId', 'answer'])
  text(payload.sessionId)
  text(payload.approvalId)
  text(payload.offerId)
  approvalAnswer(payload.answer, context)
}

/** A grant answer also returns the minted grantId and its end time, as today's tool does. */
function responseApprovalAnswer(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail()
  if (!Object.hasOwn(payload, 'grantId')) { trueFlag(payload, 'accepted'); return }
  exact(payload, ['accepted', 'grantId', 'expiresAt'])
  if (payload.accepted !== true) fail()
  text(payload.grantId)
  natural(payload.expiresAt)
}

function questionAnswerItem(value) {
  exact(value, ['id', 'selected'], ['custom'])
  text(value.id)
  uniqueStrings(value.selected)
  if (value.selected.length > LIMITS.selectedLabelsPerAnswer) fail(ERROR.limit)
  for (const label of value.selected) chars(label, LIMITS.labelChars)
  if (Object.hasOwn(value, 'custom')) chars(value.custom, LIMITS.customChars)
}

/** answer_question's payload (§5.2): structured answers, or a plan review's approve/feedback. */
function requestQuestionAnswer(payload) {
  exact(payload, ['sessionId', 'questionId'], ['answers', 'approve', 'feedback', 'toUser', 'note'])
  text(payload.sessionId)
  text(payload.questionId)
  const parts = ['answers', 'approve', 'feedback', 'toUser', 'note']
  if (!parts.some((key) => Object.hasOwn(payload, key))) fail()
  if (Object.hasOwn(payload, 'answers')) {
    arrayOf(payload.answers, questionAnswerItem)
    if (payload.answers.length === NUMBER.zero || payload.answers.length > LIMITS.questionsPerRequest) fail(ERROR.limit)
    uniqueBy(payload.answers, (item) => item.id)
    if (Object.hasOwn(payload, 'approve') || Object.hasOwn(payload, 'feedback')) fail()
  }
  if (Object.hasOwn(payload, 'approve')) boolean(payload.approve)
  if (Object.hasOwn(payload, 'feedback')) chars(payload.feedback, LIMITS.feedbackChars)
  if (Object.hasOwn(payload, 'toUser')) boolean(payload.toUser)
  if (Object.hasOwn(payload, 'note')) chars(payload.note, LIMITS.noteChars)
}

function responseQuestionAnswer(payload) { trueFlag(payload, 'accepted') }

/**
 * question.ask (§15 T09): Fishball's own question to the user. The main host files it as a card
 * in the user's pile and answers at once with the card's id, so the call never waits; the answer
 * reaches the child later through the inbox. The payload names Fishball's own session (the card's
 * author) because the card belongs to no main session.
 */
function requestQuestionAsk(payload) {
  exact(payload, ['sessionId', 'questions'])
  text(payload.sessionId)
  questions(payload.questions)
}

function responseQuestionAsk(payload) {
  exact(payload, ['questionId'])
  text(payload.questionId)
}

/**
 * question.answerOwn: the user answered Fishball's own question on the child's copy of its card
 * instead of the main pile. The host settles the same pile card, so one card has one answer
 * whichever card the user used, and the words still travel back through the inbox.
 */
function requestQuestionAnswerOwn(payload) {
  exact(payload, ['questionId', 'answers'])
  text(payload.questionId)
  arrayOf(payload.answers, questionAnswerItem)
  if (payload.answers.length === NUMBER.zero || payload.answers.length > LIMITS.questionsPerRequest) fail(ERROR.limit)
  uniqueBy(payload.answers, (item) => item.id)
}

function responseQuestionAnswerOwn(payload) { trueFlag(payload, 'accepted') }

function promptSummary(value) {
  exact(value, ['promptId', 'sessionId', 'title', 'toolName', 'argumentsStatus', 'since', 'managed'])
  text(value.promptId)
  text(value.sessionId)
  chars(value.title, LIMITS.titleChars)
  text(value.toolName)
  member(value.argumentsStatus, Object.values(ARGUMENTS_STATUS))
  natural(value.since)
  boolean(value.managed)
}

function responsePromptList(payload) {
  exact(payload, ['prompts'])
  arrayOf(payload.prompts, promptSummary)
  uniqueBy(payload.prompts, (prompt) => prompt.promptId)
}

/** answer_prompt (§7a.9): allow or reject a frozen prompt, with the same rules as an approval. */
function requestPromptAnswer(payload) {
  exact(payload, ['sessionId', 'promptId', 'decision', 'reason'], ['risk'])
  text(payload.sessionId)
  text(payload.promptId)
  member(payload.decision, PROMPT_DECISIONS, ERROR.invalidDecision)
  if (Object.hasOwn(payload, 'risk')) member(payload.risk, Object.values(RISK))
  chars(payload.reason, LIMITS.reasonChars)
}

function responsePromptAnswer(payload) {
  exact(payload, ['promptId', 'decision', 'managed'])
  text(payload.promptId)
  member(payload.decision, PROMPT_DECISIONS)
  boolean(payload.managed)
}

function grantSummary(value) {
  exact(value, ['grantId', 'sessionId', 'toolName', 'kind', 'expiresAt', 'uses', 'paused'], ['prefix', 'lastUsedAt'])
  text(value.grantId)
  text(value.sessionId)
  text(value.toolName)
  member(value.kind, Object.values(GRANT_KIND))
  if (value.kind === GRANT_KIND.prefix) {
    text(value.prefix)
    chars(value.prefix, LIMITS.grantPrefixChars)
  } else if (Object.hasOwn(value, 'prefix')) fail()
  natural(value.expiresAt)
  natural(value.uses)
  if (Object.hasOwn(value, 'lastUsedAt')) natural(value.lastUsedAt)
  boolean(value.paused)
}

function responseGrantList(payload) {
  exact(payload, ['grants'])
  arrayOf(payload.grants, grantSummary)
  uniqueBy(payload.grants, (grant) => grant.grantId)
}

function requestGrantRevoke(payload) {
  exact(payload, ['grantId', 'reason'])
  text(payload.grantId)
  chars(payload.reason, LIMITS.reasonChars)
}

function responseGrantRevoke(payload) {
  exact(payload, ['grantId', 'revoked'])
  text(payload.grantId)
  if (payload.revoked !== true) fail()
}

/** release_session (§5.2): Fishball gives a managed session back; the reason is audited. */
function requestSessionRelease(payload) {
  exact(payload, ['sessionId', 'reason'])
  text(payload.sessionId)
  chars(payload.reason, LIMITS.reasonChars)
}

function responseSessionRelease(payload) {
  exact(payload, ['sessionId', 'managed'])
  text(payload.sessionId)
  if (payload.managed !== false) fail()
}

function requestAttachmentRead(payload) {
  exact(payload, ['sessionId', 'attachmentId'])
  text(payload.sessionId)
  text(payload.attachmentId)
}

/**
 * §5.2 says "chunked bytes"; the fields are what the child needs to verify and store the image:
 * its media type, the sha256 it must recompute, the total length and canonical base64 chunks.
 */
function responseAttachmentRead(payload) {
  exact(payload, ['attachmentId', 'mediaType', 'total', 'sha256', 'chunks'])
  text(payload.attachmentId)
  member(payload.mediaType, IMAGE_TYPES)
  positive(payload.total)
  if (payload.total > LIMITS.imageBytes) fail(ERROR.tooLarge)
  digest(payload.sha256)
  chunks(payload.chunks, payload.total)
}

/**
 * One transfer per message (§6.2). Images are capped at 4 MiB; files travel through the same
 * frame but carry an arbitrary media type. The host admits the bytes into its own store and
 * returns a single-use hostRef.
 */
function requestAttachmentPut(payload) {
  exact(payload, ['transferId', 'total', 'sha256', 'mediaType', 'chunks'], ['name'])
  text(payload.transferId)
  positive(payload.total)
  digest(payload.sha256)
  transferMediaType(payload.mediaType)
  if (isImage(payload.mediaType) && payload.total > LIMITS.imageBytes) fail(ERROR.tooLarge)
  if (Object.hasOwn(payload, 'name')) displayName(payload.name)
  chunks(payload.chunks, payload.total)
}

function responseAttachmentPut(payload) {
  exact(payload, ['hostRef', 'expiresAt'])
  text(payload.hostRef)
  natural(payload.expiresAt)
}

/** One managed session's message to Fishball's inbox; the ledger remains the durable queue (§5.2). */
function requestInboxPush(payload) {
  exact(payload, ['messageId', 'kind', 'sourceSessionId', 'text', 'images', 'dedupeKey', 'at'])
  text(payload.messageId)
  member(payload.kind, Object.values(INBOX_KIND))
  text(payload.sourceSessionId)
  string(payload.text)
  images(payload.images)
  text(payload.dedupeKey)
  natural(payload.at)
}

function responseInboxPush(payload) { trueFlag(payload, 'acked') }

/** v1's watch status shape, kept because §5.2 calls the event "existing". */
function eventWatchStatus(payload) {
  exact(payload, ['watchId', 'status'])
  text(payload.watchId)
  exact(payload.status, ['state', 'lastSequence'])
  member(payload.status.state, Object.values(WATCH_STATE))
  natural(payload.status.lastSequence)
}

function eventApprovalSettled(payload) {
  exact(payload, ['approvalId', 'decision', 'by'])
  text(payload.approvalId)
  member(payload.decision, Object.values(DECISION))
  member(payload.by, Object.values(SETTLED_BY))
}

/**
 * T08: one call ran without asking. It is not a decision by Fishball at that moment; it is the
 * consequence of one it (or the user) already made, and the label says which approval let it run.
 * The arguments are the exact call as the user's card shows it.
 */
function eventApprovalRan(payload) {
  exact(payload, ['approvalId', 'via', 'by', 'toolName', 'reason', 'at', 'argumentsStatus'], ['arguments'])
  text(payload.approvalId)
  member(payload.via, Object.values(RAN_VIA))
  member(payload.by, Object.values(SETTLED_BY))
  text(payload.toolName)
  chars(payload.reason, LIMITS.reasonChars)
  natural(payload.at)
  member(payload.argumentsStatus, Object.values(ARGUMENTS_STATUS))
  if (Object.hasOwn(payload, 'arguments')) chars(payload.arguments, LIMITS.argumentChars)
}

function eventSessionState(payload) {
  exact(payload, ['sessionId', 'running', 'pendingInteraction'])
  text(payload.sessionId)
  boolean(payload.running)
  boolean(payload.pendingInteraction)
}

function requestHandshake(payload) {
  exact(payload, ['capabilities', 'requiredCapabilities'])
  requireCapabilities(payload.capabilities, payload.requiredCapabilities)
}

function responseHandshake(payload) {
  exact(payload, ['capabilities', 'hostInstanceId'])
  capabilities(payload.capabilities)
  text(payload.hostInstanceId)
}

/** Every request, response and event validator, addressable by wire name. */
export const VALIDATORS = Object.freeze({
  [ENVELOPE.type.request]: Object.freeze({
    [ENVELOPE.handshake]: requestHandshake,
    [OPERATION.sessionList]: requestSessionList,
    [OPERATION.sessionStart]: requestSessionStart,
    [OPERATION.sessionMessage]: requestSessionMessage,
    [OPERATION.sessionRedirect]: requestSessionMessage,
    [OPERATION.sessionStop]: requestSessionStop,
    [OPERATION.sessionRead]: requestSessionRead,
    [OPERATION.sessionWatch]: requestSessionWatch,
    [OPERATION.sessionWatches]: requestEmpty,
    [OPERATION.sessionUnwatch]: requestSessionUnwatch,
    [OPERATION.sessionRelease]: requestSessionRelease,
    [OPERATION.approvalList]: requestApprovalList,
    [OPERATION.approvalAnswer]: requestApprovalAnswer,
    [OPERATION.questionAnswer]: requestQuestionAnswer,
    [OPERATION.questionAsk]: requestQuestionAsk,
    [OPERATION.questionAnswerOwn]: requestQuestionAnswerOwn,
    [OPERATION.promptList]: requestEmpty,
    [OPERATION.promptAnswer]: requestPromptAnswer,
    [OPERATION.grantList]: requestEmpty,
    [OPERATION.grantRevoke]: requestGrantRevoke,
    [OPERATION.attachmentRead]: requestAttachmentRead,
    [OPERATION.attachmentPut]: requestAttachmentPut,
    [OPERATION.inboxPush]: requestInboxPush,
  }),
  [ENVELOPE.type.response]: Object.freeze({
    [ENVELOPE.handshake]: responseHandshake,
    [OPERATION.sessionList]: responseSessionList,
    [OPERATION.sessionStart]: responseSessionStart,
    [OPERATION.sessionMessage]: responseSessionDelivery,
    [OPERATION.sessionRedirect]: responseSessionDelivery,
    [OPERATION.sessionStop]: responseSessionStop,
    [OPERATION.sessionRead]: responseSessionRead,
    [OPERATION.sessionWatch]: responseSessionWatch,
    [OPERATION.sessionWatches]: responseSessionWatches,
    [OPERATION.sessionUnwatch]: responseSessionUnwatch,
    [OPERATION.sessionRelease]: responseSessionRelease,
    [OPERATION.approvalList]: responseApprovalList,
    [OPERATION.approvalAnswer]: responseApprovalAnswer,
    [OPERATION.questionAnswer]: responseQuestionAnswer,
    [OPERATION.questionAsk]: responseQuestionAsk,
    [OPERATION.questionAnswerOwn]: responseQuestionAnswerOwn,
    [OPERATION.promptList]: responsePromptList,
    [OPERATION.promptAnswer]: responsePromptAnswer,
    [OPERATION.grantList]: responseGrantList,
    [OPERATION.grantRevoke]: responseGrantRevoke,
    [OPERATION.attachmentRead]: responseAttachmentRead,
    [OPERATION.attachmentPut]: responseAttachmentPut,
    [OPERATION.inboxPush]: responseInboxPush,
  }),
  [ENVELOPE.type.event]: Object.freeze({
    [EVENT.approvalRequest]: approvalDescriptor,
    [EVENT.approvalSettled]: eventApprovalSettled,
    [EVENT.approvalRan]: eventApprovalRan,
    [EVENT.watchStatus]: eventWatchStatus,
    [EVENT.sessionState]: eventSessionState,
  }),
})

function validatePayload(kind, operation, payload, context) {
  const group = VALIDATORS[kind]
  if (!Object.hasOwn(group, operation)) fail(ERROR.operation)
  group[operation](payload, context)
  return payload
}

/** The answer validators take an optional { now } so a future grant expiry is checked deterministically. */
export function validateRequest(operation, payload, context = {}) { return validatePayload(ENVELOPE.type.request, operation, payload, context) }
export function validateResponse(operation, payload) { return validatePayload(ENVELOPE.type.response, operation, payload) }
export function validateEvent(operation, payload) { return validatePayload(ENVELOPE.type.event, operation, payload) }

function sourceSide(direction) { return direction === DIRECTION.childToMain ? SIDE.child : SIDE.main }
function targetSide(direction) { return direction === DIRECTION.childToMain ? SIDE.main : SIDE.child }

/** Errors may echo a sessionId; a malformed frame may not have one, so both null and text are legal. */
function errorPayload(payload) {
  exact(payload, ['code'])
  member(payload.code, Object.values(ERROR))
}

function validateHandshakeEnvelope(envelope) {
  if (envelope.sessionId !== null) fail()
  if (envelope.type === ENVELOPE.type.request) validateRequest(ENVELOPE.handshake, envelope.payload)
  else if (envelope.type === ENVELOPE.type.response) validateResponse(ENVELOPE.handshake, envelope.payload)
  else if (envelope.type === ENVELOPE.type.error) errorPayload(envelope.payload)
  else fail(ERROR.operation)
  return envelope
}

function validateEventEnvelope(envelope) {
  if (!EVENTS.includes(envelope.operation)) fail(ERROR.operation)
  text(envelope.sessionId)
  validateEvent(envelope.operation, envelope.payload)
  return envelope
}

/**
 * Validate one complete envelope. options.receivingSide additionally enforces direction:
 * requests arrive at their target, responses and errors at their source, events at the child.
 * options.expectedHostId rejects a frame from another host (§5.1); options.now pins the clock
 * for a grant answer's future expiresAt.
 */
export function validateEnvelope(envelope, options = {}) {
  const { expectedHostId, receivingSide, now } = options ?? {}
  if (receivingSide !== undefined) member(receivingSide, Object.values(SIDE))
  if (expectedHostId !== undefined) text(expectedHostId)
  exact(envelope, ENVELOPE.keys)
  if (envelope.version !== ENVELOPE.version) fail(ERROR.version)
  text(envelope.hostId)
  text(envelope.requestId)
  if (expectedHostId !== undefined && envelope.hostId !== expectedHostId) fail(ERROR.host)
  member(envelope.type, Object.values(ENVELOPE.type))
  if (envelope.type === ENVELOPE.type.event) {
    if (receivingSide !== undefined && targetSide(EVENT_DIRECTION) !== receivingSide) fail(ERROR.forbidden)
    return validateEventEnvelope(envelope)
  }
  if (envelope.operation === ENVELOPE.handshake) return validateHandshakeEnvelope(envelope)
  if (typeof envelope.operation !== 'string' || !Object.hasOwn(OPERATIONS, envelope.operation)) fail(ERROR.operation)
  const operation = OPERATIONS[envelope.operation]
  if (envelope.type === ENVELOPE.type.request) {
    if (receivingSide !== undefined && targetSide(operation.direction) !== receivingSide) fail(ERROR.forbidden)
    validateRequest(envelope.operation, envelope.payload, { now })
    if (operation.sessionScoped) {
      text(envelope.sessionId)
      if (envelope.sessionId !== envelope.payload.sessionId) fail()
    } else if (envelope.sessionId !== null) fail()
    return envelope
  }
  if (receivingSide !== undefined && sourceSide(operation.direction) !== receivingSide) fail(ERROR.forbidden)
  if (envelope.type === ENVELOPE.type.error) {
    if (envelope.sessionId !== null) text(envelope.sessionId)
    errorPayload(envelope.payload)
    return envelope
  }
  validateResponse(envelope.operation, envelope.payload)
  if (operation.sessionScoped) text(envelope.sessionId)
  else if (envelope.sessionId !== null) fail()
  return envelope
}

export function makeEnvelope(hostId, sessionId, requestId, type, operation, payload) {
  return { version: ENVELOPE.version, hostId, sessionId, requestId, type, operation, payload }
}

/** attachment frames get the 8 MiB bound; every other frame gets the 1 MiB bound (§5.2, §3.6). */
function frameBytes(operation, type) {
  if (operation === OPERATION.attachmentPut) return LIMITS.attachmentEnvelopeBytes
  if (operation === OPERATION.attachmentRead && type === ENVELOPE.type.response) return LIMITS.attachmentEnvelopeBytes
  return LIMITS.envelopeBytes
}

export function encodeEnvelope(envelope, expectedHostId) {
  validateEnvelope(envelope, { expectedHostId })
  let encoded
  try { encoded = JSON.stringify(envelope) } catch { fail() }
  if (Buffer.byteLength(encoded, 'utf8') > frameBytes(envelope.operation, envelope.type)) fail(ERROR.limit)
  // Getters and toJSON must not smuggle a shape past the validated one.
  decodeEnvelope(encoded, { expectedHostId })
  return encoded
}

export function decodeEnvelope(encoded, options = {}) {
  if (typeof encoded !== 'string') fail()
  // Bound before parsing. The attachment ceiling is the largest legal frame, so a smaller
  // operation's frame is rejected after the operation is known.
  if (Buffer.byteLength(encoded, 'utf8') > LIMITS.attachmentEnvelopeBytes) fail(ERROR.limit)
  let envelope
  try { envelope = JSON.parse(encoded) } catch { fail() }
  const operation = envelope?.operation
  const type = envelope?.type
  if (Buffer.byteLength(encoded, 'utf8') > frameBytes(operation, type)) fail(ERROR.limit)
  return validateEnvelope(envelope, options)
}
