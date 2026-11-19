/**
 * Attachment transfer helpers (§6.2, §15 T06), the connector's own since C-WIRE-2 deleted
 * `./contract` (no other package imports them: core's copy went with its V2 child path).
 *
 * Bytes only: no DSH import. It owns no authorization and no storage; those are the image port's
 * (images.js), which knows the session log.
 *
 * The rules are §6.2's: canonical base64 in chunks of at most PAYLOAD_LIMITS.chunkBytes, a sha256 the
 * receiver recomputes, 4 MiB for an image, and the 8 MiB frame bound for a file that travels
 * through the same frame. A frame is larger than its decoded bytes because base64 expands by
 * 4/3; TRANSFER.frameReserveBytes keeps the request's own JSON keys inside the body bound.
 */
import { createHash } from 'node:crypto'
import { IMAGE_TYPES, PAYLOAD_LIMITS, REFUSAL } from '../../mcp-schema/index.js'
import { RefusalError } from '../errors.js'

const TRANSFER = Object.freeze({
  encoding: 'base64',
  hex: 'hex',
  digest: 'sha256',
  /** Envelope keys, quotes and chunk delimiters; base64 characters never need JSON escaping. */
  frameReserveBytes: 4096,
  /** 4 encoded characters per 3 decoded bytes. */
  base64Ratio: Object.freeze({ encoded: 4, decoded: 3 }),
})

/** 0.2.2's image vocabulary; any other media type is a file (§6.2). */
export function isImageMediaType(mediaType) { return IMAGE_TYPES.includes(mediaType) }

export function sha256Hex(bytes) {
  return createHash(TRANSFER.digest).update(bytes).digest(TRANSFER.hex)
}

/** The largest file whose base64 chunks still fit one attachment.put frame. */
export function maxChunkedBytes() {
  const encodedBudget = PAYLOAD_LIMITS.attachmentEnvelopeBytes - TRANSFER.frameReserveBytes
  return Math.floor((encodedBudget * TRANSFER.base64Ratio.decoded) / TRANSFER.base64Ratio.encoded)
}

/** Decode canonical base64 only, so both sides send the exact string the payload rules admit. */
function fromBase64(value) {
  if (typeof value !== 'string' || value.length === 0) throw new RefusalError(REFUSAL.invalidArguments)
  const bytes = Buffer.from(value, TRANSFER.encoding)
  if (bytes.toString(TRANSFER.encoding) !== value) throw new RefusalError(REFUSAL.invalidArguments)
  return bytes
}

function toBase64(bytes) { return Buffer.from(bytes).toString(TRANSFER.encoding) }

/** One positive payload split into PAYLOAD_LIMITS-sized base64 chunks, in order. */
export function chunksOf(bytes) {
  const buffer = Buffer.from(bytes)
  if (buffer.length === 0) throw new RefusalError(REFUSAL.invalidArguments)
  const chunks = []
  for (let offset = 0; offset < buffer.length; offset += PAYLOAD_LIMITS.chunkBytes) {
    chunks.push(toBase64(buffer.subarray(offset, offset + PAYLOAD_LIMITS.chunkBytes)))
  }
  return chunks
}

/**
 * Rebuild one transfer and verify every receiver-side rule: canonical chunks, K1's
 * chunk ceiling, the declared total, the declared sha256, and the caller's own size bound.
 *
 * @param {{total: number, sha256: string, chunks: string[]}} payload - schema-checked arguments.
 * @param {{maxBytes?: number}} [options] - imageBytes for an image, maxChunkedBytes for a file.
 * @returns {Buffer} the verified bytes.
 */
export function verifyTransfer(payload, options = {}) {
  const { total, sha256, chunks } = payload ?? {}
  const maxBytes = options.maxBytes ?? maxChunkedBytes()
  if (!Number.isSafeInteger(total) || total <= 0) throw new RefusalError(REFUSAL.invalidArguments)
  if (total > maxBytes) throw new RefusalError(REFUSAL.tooLarge)
  if (!Array.isArray(chunks) || chunks.length === 0) throw new RefusalError(REFUSAL.invalidArguments)
  const parts = []
  let sum = 0
  for (const chunk of chunks) {
    const bytes = fromBase64(chunk)
    if (bytes.length > PAYLOAD_LIMITS.chunkBytes) throw new RefusalError(REFUSAL.limitExceeded)
    sum += bytes.length
    parts.push(bytes)
  }
  if (sum !== total) throw new RefusalError(REFUSAL.invalidArguments)
  const data = Buffer.concat(parts)
  if (sha256Hex(data) !== sha256) throw new RefusalError(REFUSAL.invalidArguments)
  return data
}
