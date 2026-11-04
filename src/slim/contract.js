/**
 * The slim Fishball contract, envelope v2 (§15 T01).
 *
 * Contract only: this module imports no DSH package and holds no behaviour beyond validation
 * and constants. The main host and the child app validate every frame with it.
 *
 * Envelope v2 keeps envelope v1's seven-key frame (src/native-control/protocol.js) and replaces
 * v1's operation set with §5.2's, which adds attachment.read/put and the inbox/session-state
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
  approvalList: 'approval.list',
  approvalAnswer: 'approval.answer',
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
  [OPERATION.approvalList]: spec(DIRECTION.childToMain, true),
  [OPERATION.approvalAnswer]: spec(DIRECTION.childToMain, true),
  [OPERATION.attachmentRead]: spec(DIRECTION.childToMain, true),
  [OPERATION.attachmentPut]: spec(DIRECTION.childToMain, false),
  [OPERATION.inboxPush]: spec(DIRECTION.mainToChild, false),
})

/** The exact §5.2 event allowlist, plus the one direction every event takes. */
export const EVENT = Object.freeze({
  approvalRequest: 'approval.request',
  approvalSettled: 'approval.settled',
  watchStatus: 'watch.status',
  sessionState: 'session.state',
})
export const EVENTS = Object.freeze([
  EVENT.approvalRequest, EVENT.approvalSettled, EVENT.watchStatus, EVENT.sessionState,
])
export const EVENT_DIRECTION = DIRECTION.mainToChild

/**
 * Payload vocabularies, reused from today's main-side services so the child speaks one language:
 * delivery (§5.2), read_session roles, approval decisions and kinds, watch mode/status, the
 * watch event state (v1's "existing" watch.status), intake kinds and the escalation answerer.
 */
export const DELIVERY = Object.freeze({ delivered: 'delivered', unconfirmed: 'unconfirmed' })
export const ROLE = Object.freeze({ user: 'user', assistant: 'assistant', fishball: 'fishball', agent: 'agent', context: 'context' })
export const DECISION = Object.freeze({ allow: 'allow', grant: 'grant', reject: 'reject', ask: 'ask', escalate: 'escalate' })
export const APPROVAL_KIND = Object.freeze({ approval: 'approval', question: 'question' })
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
 * refusal codes are §5.2's (expired, conflict, not-referenced, too-large) and §6.3's
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

function approvalDescriptor(value) {
  exact(value, ['approvalId', 'offerId', 'kind', 'prompt', 'choices', 'expiresAt'])
  text(value.approvalId)
  text(value.offerId)
  member(value.kind, Object.values(APPROVAL_KIND))
  text(value.prompt)
  uniqueStrings(value.choices)
  natural(value.expiresAt)
}

/** The existing watch registry's identity and state; §5.2 leaves the list record to this contract. */
function watchRecord(value) {
  exact(value, ['watchId', 'sessionId', 'mode', 'status'])
  text(value.watchId)
  text(value.sessionId)
  member(value.mode, Object.values(WATCH_MODE))
  member(value.status, Object.values(WATCH_STATUS))
}

/** A decision word for approvals, or the answer text for a question (§5.2). */
function answerValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  if (Object.hasOwn(value, 'decision')) {
    exact(value, ['decision'])
    member(value.decision, Object.values(DECISION))
  } else {
    exact(value, ['text'])
    text(value.text)
  }
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

/** The four acknowledgement results are one true flag and nothing else. */
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

function requestSessionWatches(payload) { exact(payload, []) }

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
}

function requestApprovalAnswer(payload) {
  exact(payload, ['sessionId', 'approvalId', 'offerId', 'answer'])
  text(payload.sessionId)
  text(payload.approvalId)
  text(payload.offerId)
  answerValue(payload.answer)
}

function responseApprovalAnswer(payload) { trueFlag(payload, 'accepted') }

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
    [OPERATION.sessionWatches]: requestSessionWatches,
    [OPERATION.sessionUnwatch]: requestSessionUnwatch,
    [OPERATION.approvalList]: requestApprovalList,
    [OPERATION.approvalAnswer]: requestApprovalAnswer,
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
    [OPERATION.approvalList]: responseApprovalList,
    [OPERATION.approvalAnswer]: responseApprovalAnswer,
    [OPERATION.attachmentRead]: responseAttachmentRead,
    [OPERATION.attachmentPut]: responseAttachmentPut,
    [OPERATION.inboxPush]: responseInboxPush,
  }),
  [ENVELOPE.type.event]: Object.freeze({
    [EVENT.approvalRequest]: approvalDescriptor,
    [EVENT.approvalSettled]: eventApprovalSettled,
    [EVENT.watchStatus]: eventWatchStatus,
    [EVENT.sessionState]: eventSessionState,
  }),
})

function validatePayload(kind, operation, payload) {
  const group = VALIDATORS[kind]
  if (!Object.hasOwn(group, operation)) fail(ERROR.operation)
  group[operation](payload)
  return payload
}

export function validateRequest(operation, payload) { return validatePayload(ENVELOPE.type.request, operation, payload) }
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
 * options.expectedHostId rejects a frame from another host (§5.1).
 */
export function validateEnvelope(envelope, options = {}) {
  const { expectedHostId, receivingSide } = options ?? {}
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
    validateRequest(envelope.operation, envelope.payload)
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
