/**
 * Attachment transfer helpers (§6.2, §15 T06).
 *
 * Bytes only: this module imports the frozen contract and nothing from DSH, so the host and the
 * child verify one transfer with the same rules and a checksum or chunk policy cannot drift
 * between them. It owns no authorization and no storage; those stay with the side that knows
 * the session log (host) or the child's own attachment store (child).
 *
 * The rules are §6.2's: canonical base64 in chunks of at most LIMITS.chunkBytes, a sha256 the
 * receiver recomputes, 4 MiB for an image, and the 8 MiB frame bound for a file that travels
 * through the same frame. A frame is larger than its decoded bytes because base64 expands by
 * 4/3; TRANSFER.frameReserveBytes keeps the envelope's own JSON keys inside the frame bound.
 */
import { createHash } from 'node:crypto'
import { DIGEST, ERROR, IMAGE_TYPES, LIMITS, ContractError } from './contract.js'

export const TRANSFER = Object.freeze({
  encoding: 'base64',
  hex: 'hex',
  /** Envelope keys, quotes and chunk delimiters; base64 characters never need JSON escaping. */
  frameReserveBytes: 4096,
  /** 4 encoded characters per 3 decoded bytes. */
  base64Ratio: Object.freeze({ encoded: 4, decoded: 3 }),
})

/** 0.2.2's image vocabulary; any other media type is a file (§6.2). */
export function isImageMediaType(mediaType) { return IMAGE_TYPES.includes(mediaType) }

export function sha256Hex(bytes) {
  return createHash(DIGEST.algorithm).update(bytes).digest(TRANSFER.hex)
}

/** The largest file whose base64 chunks still fit one attachment.put frame. */
export function maxChunkedBytes() {
  const encodedBudget = LIMITS.attachmentEnvelopeBytes - TRANSFER.frameReserveBytes
  return Math.floor((encodedBudget * TRANSFER.base64Ratio.decoded) / TRANSFER.base64Ratio.encoded)
}

/** Decode canonical base64 only, so both sides send the exact string the contract validates. */
export function fromBase64(value) {
  if (typeof value !== 'string' || value.length === 0) throw new ContractError(ERROR.invalid)
  const bytes = Buffer.from(value, TRANSFER.encoding)
  if (bytes.toString(TRANSFER.encoding) !== value) throw new ContractError(ERROR.invalid)
  return bytes
}

export function toBase64(bytes) { return Buffer.from(bytes).toString(TRANSFER.encoding) }

/** One positive payload split into contract-sized base64 chunks, in order. */
export function chunksOf(bytes) {
  const buffer = Buffer.from(bytes)
  if (buffer.length === 0) throw new ContractError(ERROR.invalid)
  const chunks = []
  for (let offset = 0; offset < buffer.length; offset += LIMITS.chunkBytes) {
    chunks.push(toBase64(buffer.subarray(offset, offset + LIMITS.chunkBytes)))
  }
  return chunks
}

/**
 * Rebuild one transfer and verify every receiver-side rule: canonical chunks, the contract's
 * chunk ceiling, the declared total, the declared sha256, and the caller's own size bound.
 *
 * @param {{total: number, sha256: string, chunks: string[]}} payload - contract-validated frame.
 * @param {{maxBytes?: number}} [options] - imageBytes for an image, maxChunkedBytes for a file.
 * @returns {Buffer} the verified bytes.
 */
export function verifyTransfer(payload, options = {}) {
  const { total, sha256, chunks } = payload ?? {}
  const maxBytes = options.maxBytes ?? maxChunkedBytes()
  if (!Number.isSafeInteger(total) || total <= 0) throw new ContractError(ERROR.invalid)
  if (total > maxBytes) throw new ContractError(ERROR.tooLarge)
  if (!Array.isArray(chunks) || chunks.length === 0) throw new ContractError(ERROR.invalid)
  const parts = []
  let sum = 0
  for (const chunk of chunks) {
    const bytes = fromBase64(chunk)
    if (bytes.length > LIMITS.chunkBytes) throw new ContractError(ERROR.limit)
    sum += bytes.length
    parts.push(bytes)
  }
  if (sum !== total) throw new ContractError(ERROR.invalid)
  const data = Buffer.concat(parts)
  if (sha256Hex(data) !== sha256) throw new ContractError(ERROR.invalid)
  return data
}
