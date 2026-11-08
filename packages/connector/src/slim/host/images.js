/**
 * Image authorization, storage and hostRefs, main-host half (§6.2, §6.4, §15 T06).
 *
 * 0.2.2's attachment RPC reads a supplied reference without consulting Session history
 * (dsh-api-session-controller/lib/index.js:886-895), so the bridge cannot delegate the ownership
 * check to it. This module owns that check: attachment.read resolves an image only when the
 * named Session is already authorized by the bridge (managed or watched) AND the complete
 * Session log references that attachment id. The scan mirrors 0.2.1's referencedImage rule
 * (the last DSH release that made the check itself), over 0.2.2's full-log read.
 *
 * attachment.put has no session to authorize: it is the authenticated child instance admitting
 * its own bytes. The store validates and normalizes images; files are stored verbatim and are
 * later addressed to a target session as a file block, whose model representation is handle
 * text (DSH's own projectFilesToText). The returned hostRef is an opaque single-use uuid with
 * a ten-minute life (§6.4); it is never persisted, never a path, and never travels to a model.
 *
 * This module deliberately knows no DSH service beyond the attachment store and the session
 * query engine; bridge.js owns framing and the managed/related authorization, and
 * session-port.js wires the methods below into the SessionService it exposes.
 */
import { randomUUID } from 'node:crypto'
import { assistantStreamChunks } from '@deepseek-ai/dsh-llm'
import { ERROR, LIMITS, ContractError } from '../contract.js'
import { chunksOf, isImageMediaType, maxChunkedBytes, sha256Hex, verifyTransfer } from '../attachment-transfer.js'

/** Runtime ceilings of the host-side hostRef table; the contract owns the TTL. */
export const HOST_IMAGES = Object.freeze({
  /** Unconsumed hostRefs one host process may hold; beyond it a put is refused, never evicted. */
  maxHostRefs: 256,
})

/** Session event types whose declared content can carry an image block (0.2.1's imageInEvent). */
const EVENT = Object.freeze({
  userMessage: 'user/message',
  systemMessage: 'system/message',
  developerMessage: 'developer/message',
  toolResult: 'tool/result',
  ptcDispatch: 'tool/ptc-dispatch',
  teamQueued: 'team/message/queued',
  inboxSpliced: 'agent/inbox/spliced',
  compactionSummary: 'compaction/summary',
  assistantMessage: 'assistant/message',
  assistantAttempt: 'assistant/attempt',
  blockEnd: 'block-end',
})

/** Content block tags this port may build for a target message. */
const BLOCK = Object.freeze({ image: 'image', file: 'file' })

/** DSH's store refusals, routed to the nearest contract code. */
const ATTACHMENT_ERROR = Object.freeze({
  tooLarge: new Set([
    'IMAGE_TOO_LARGE', 'IMAGES_TOO_LARGE', 'IMAGE_TOO_MANY_PIXELS', 'IMAGE_DIMENSION_TOO_LARGE',
  ]),
  invalid: new Set([
    'UNSUPPORTED_IMAGE_TYPE', 'IMAGE_TYPE_MISMATCH', 'INVALID_IMAGE', 'INVALID_IMAGE_BASE64',
    'TOO_MANY_IMAGES', 'INVALID_FILE_BASE64', 'INVALID_ATTACHMENT_REF',
  ]),
})

const STORE_METHODS = Object.freeze(['readImage', 'saveImage', 'saveFile'])
const QUERY_METHODS = Object.freeze(['readSession'])

/**
 * Create the host-side image port.
 *
 * @param {object} options
 * @param {object} options.attachments - ctx.attachments (dsh-attachment's AttachmentStore).
 * @param {{ readSession: (sessionId: string) => Promise<{events: object[]}> }} options.sessionQuery
 *   - ctx.sessionQuery; readSession returns the complete live-preferred log.
 * @param {() => number} [options.now] - clock for hostRef expiry, pinned by a test.
 * @returns {{ read: Function, put: Function, resolve: Function }} the image port.
 */
export function createImagePort(options) {
  const { attachments, sessionQuery, now = Date.now } = options ?? {}
  for (const method of STORE_METHODS) {
    if (typeof attachments?.[method] !== 'function') throw new TypeError('fishball host images: the attachment store must implement ' + method)
  }
  for (const method of QUERY_METHODS) {
    if (typeof sessionQuery?.[method] !== 'function') throw new TypeError('fishball host images: the session query must implement ' + method)
  }
  if (typeof now !== 'function') throw new TypeError('fishball host images: now must be a function')
  return createPort({ attachments, sessionQuery, now })
}

function createPort({ attachments, sessionQuery, now }) {
  /** hostRef -> {block, expiresAt}; single-use and in memory only (§6.4). */
  const refs = new Map()

  function pruneExpired(at) {
    for (const [hostRef, entry] of refs) if (entry.expiresAt <= at) refs.delete(hostRef)
  }

  /**
   * Read one referenced image as chunks. The bridge has already refused a Session that is not
   * managed or watched; this refuses an attachment the Session's own log never referenced.
   */
  async function read({ sessionId, attachmentId }) {
    const ref = await referencedImage(sessionQuery, sessionId, attachmentId)
    let stored
    try {
      stored = await attachments.readImage(ref)
    } catch (error) {
      throw refusalOf(error, ERROR.failed)
    }
    const bytes = stored.data
    if (bytes.length > LIMITS.imageBytes) throw new ContractError(ERROR.tooLarge)
    const verified = stored.ref ?? ref
    return {
      attachmentId: verified.attachmentId,
      mediaType: verified.mediaType,
      total: bytes.length,
      sha256: sha256Hex(bytes),
      chunks: chunksOf(bytes),
    }
  }

  /**
   * Admit one transferred image or file into the host's own store and return a single-use
   * hostRef. The contract has already bounded an image at 4 MiB and the whole frame at 8 MiB;
   * this recomputes the digest and applies the store's image policy.
   */
  async function put(payload) {
    const image = isImageMediaType(payload.mediaType)
    const maxBytes = image ? LIMITS.imageBytes : maxChunkedBytes()
    const data = verifyTransfer(payload, { maxBytes })
    const name = payload.name
    let block
    try {
      if (image) {
        const ref = await attachments.saveImage({ data, mediaType: payload.mediaType, ...(name === undefined ? {} : { name }) })
        block = { type: BLOCK.image, attachment: ref }
      } else {
        const ref = await attachments.saveFile({ data, ...(name === undefined ? {} : { name }) })
        block = { type: BLOCK.file, attachment: ref }
      }
    } catch (error) {
      throw refusalOf(error, ERROR.failed)
    }
    const at = now()
    pruneExpired(at)
    if (refs.size >= HOST_IMAGES.maxHostRefs) throw new ContractError(ERROR.limit)
    const hostRef = randomUUID()
    const expiresAt = at + LIMITS.hostRefTtlMs
    refs.set(hostRef, { block, expiresAt })
    return { hostRef, expiresAt }
  }

  /**
   * Consume hostRefs while building one message's content blocks. Every ref is checked before
   * any is removed, so a refused list leaves the other refs usable; a successful consume is
   * atomic and single-use.
   */
  function resolve(hostRefs) {
    const at = now()
    const blocks = []
    for (const hostRef of hostRefs) {
      const entry = refs.get(hostRef)
      if (entry === undefined || entry.expiresAt <= at) {
        if (entry !== undefined) refs.delete(hostRef)
        throw new ContractError(ERROR.expired)
      }
      blocks.push(entry.block)
    }
    for (const hostRef of hostRefs) refs.delete(hostRef)
    return blocks
  }

  return Object.freeze({ read, put, resolve })
}

/** The nearest contract refusal for one DSH attachment failure. */
function refusalOf(error, fallback) {
  if (error instanceof ContractError) return error
  const code = error?.code
  if (ATTACHMENT_ERROR.tooLarge.has(code)) return new ContractError(ERROR.tooLarge)
  if (ATTACHMENT_ERROR.invalid.has(code)) return new ContractError(ERROR.invalid)
  return new ContractError(fallback)
}

/**
 * The image the given Session's complete log references, or not-referenced. The scan follows
 * 0.2.1's referencedImage (dsh-api-session-controller/lib/index.js:1186): only first-party
 * declared content fields are read, so an opaque or future event shape is never guessed at.
 */
async function referencedImage(sessionQuery, sessionId, attachmentId) {
  let snapshot
  try {
    snapshot = await sessionQuery.readSession(sessionId)
  } catch {
    throw new ContractError(ERROR.notReferenced)
  }
  for (const event of snapshot?.events ?? []) {
    const ref = imageInEvent(event, attachmentId)
    if (ref !== undefined) return ref
  }
  throw new ContractError(ERROR.notReferenced)
}

function isImageBlock(block, attachmentId) {
  if (!block || typeof block !== 'object' || block.type !== BLOCK.image) return undefined
  const ref = block.attachment
  if (!ref || typeof ref !== 'object' || String(ref.attachmentId) !== attachmentId) return undefined
  return ref
}

function imageInContent(content, attachmentId) {
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    const ref = isImageBlock(block, attachmentId)
    if (ref !== undefined) return ref
  }
  return undefined
}

function imageInEvent(event, attachmentId) {
  const data = event?.data
  if (!data || typeof data !== 'object') return undefined
  switch (event.type) {
    case EVENT.userMessage:
    case EVENT.ptcDispatch:
      return imageInContent(data.content, attachmentId)
    case EVENT.systemMessage:
    case EVENT.developerMessage:
    case EVENT.toolResult:
    case EVENT.teamQueued:
      return imageInContent(data.message?.content, attachmentId)
    case EVENT.inboxSpliced: {
      if (!Array.isArray(data.inserted)) return undefined
      for (const message of data.inserted) {
        const found = imageInContent(message?.content, attachmentId)
        if (found !== undefined) return found
      }
      return undefined
    }
    case EVENT.compactionSummary:
      return imageInContent(data.summary, attachmentId) ?? imageInContent(data.rawOutput, attachmentId)
    case EVENT.assistantMessage: {
      const found = imageInContent(data.message?.content, attachmentId)
      if (found !== undefined) return found
      break
    }
    case EVENT.assistantAttempt:
      break
    default:
      return undefined
  }
  // A settled assistant message also keeps the streamed block-end chunks; the block is in
  // either place, so the stream is the second place to look (0.2.1's rule).
  if (!Array.isArray(data.stream)) return undefined
  for (const chunk of assistantStreamChunks(data.stream, EVENT.blockEnd)) {
    const found = imageInContent([chunk.block], attachmentId)
    if (found !== undefined) return found
  }
  return undefined
}
