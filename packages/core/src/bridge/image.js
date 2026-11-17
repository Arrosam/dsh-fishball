/**
 * The model-facing content of a successful `attachment_read` (R-FIX F13; design §6.5; the
 * connector contract §4.4). The connector answers `{attachmentId, mediaType, total, sha256,
 * chunks}`, the image in canonical base64 chunks; rendered as JSON text that would put megabytes of
 * base64 into the model's text and no image. Here the chunks are checked against the transfer rules
 * (canonical base64, decoded size = `total`, SHA-256 = `sha256`, an image media type, at most
 * `IMAGE.maxBytes`), saved once through DSH's attachment store (`attachments.saveImages`, both
 * SDKs, as dsh-mcp-client admits an MCP image) and shown to the model as one DSH image block after
 * a short text block of the metadata. A result that fails a check, or no store, is shown as text
 * saying why: never the base64. The structured result itself is unchanged, so a scoped
 * programmatic client (X12) still gets the chunks.
 *
 * The values are the connector contract's (§4.4), restated because the two sides share no package
 * (requirements 1.39); a change there shows as a failing contract case.
 */
import { createHash } from 'node:crypto'

export const IMAGE = Object.freeze({
  /** Contract §4.4 `IMAGE_TYPES`: the image media types a transfer may carry. */
  mediaTypes: Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  /** Contract §4.4 `LIMITS.imageBytes`: 4 MiB. */
  maxBytes: 4 * 1024 * 1024,
  /** Canonical padded base64 (dsh-mcp-client's own test, both SDKs). */
  canonicalBase64: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  encoding: 'base64',
  digest: 'sha256',
  digestEncoding: 'hex',
  /** The metadata fields the model sees beside the image. */
  metadataFields: Object.freeze(['attachmentId', 'mediaType', 'total', 'sha256']),
  textBlock: 'text',
  imageBlock: 'image',
  jsonIndent: 2,
})

/** Why an image was not shown (model-facing, appended to `TEXT.unavailable`). */
export const IMAGE_PROBLEM = Object.freeze({
  shape: 'the result is not an image transfer',
  mediaType: 'its media type is not PNG, JPEG, WebP or GIF',
  base64: 'a chunk is not canonical base64',
  size: 'its decoded size does not match its total',
  tooLarge: 'it is larger than 4 MiB',
  digest: 'its SHA-256 does not match its bytes',
  noStore: 'this DSH has no attachment store',
  store: 'the attachment store refused it',
})

const TEXT = Object.freeze({
  unavailable: (reason) => `[image unavailable: ${reason}; the image data was not shown]`,
})

class ImageProblem extends Error {}
const problem = (reason) => { throw new ImageProblem(reason) }

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The checked image bytes of an `attachment_read` result (the module header's rules). */
function bytesOf(result) {
  if (!isRecord(result) || !Array.isArray(result.chunks) || !Number.isSafeInteger(result.total) || typeof result.sha256 !== 'string') problem(IMAGE_PROBLEM.shape)
  if (!IMAGE.mediaTypes.includes(result.mediaType)) problem(IMAGE_PROBLEM.mediaType)
  if (result.total > IMAGE.maxBytes) problem(IMAGE_PROBLEM.tooLarge)
  const parts = result.chunks.map((chunk) => {
    if (typeof chunk !== 'string' || !IMAGE.canonicalBase64.test(chunk)) problem(IMAGE_PROBLEM.base64)
    return Buffer.from(chunk, IMAGE.encoding)
  })
  const data = Buffer.concat(parts)
  if (data.length !== result.total) problem(IMAGE_PROBLEM.size)
  if (createHash(IMAGE.digest).update(data).digest(IMAGE.digestEncoding) !== result.sha256) problem(IMAGE_PROBLEM.digest)
  return data
}

const metadataBlock = (result) => ({
  type: IMAGE.textBlock,
  text: JSON.stringify(Object.fromEntries(IMAGE.metadataFields.map((field) => [field, result[field]])), null, IMAGE.jsonIndent),
})

/**
 * The model-facing content of one successful `attachment_read` result. Never rejects.
 * @param {unknown} result the tool's structured result (`{ok: true, …}`)
 * @param {{saveImages: Function} | undefined} attachments DSH's attachment store
 * @returns {Promise<object[]>} content blocks
 */
export async function imageContent(result, attachments) {
  let data
  try {
    data = bytesOf(result)
    if (typeof attachments?.saveImages !== 'function') problem(IMAGE_PROBLEM.noStore)
  } catch (error) {
    return [{ type: IMAGE.textBlock, text: TEXT.unavailable(error instanceof ImageProblem ? error.message : IMAGE_PROBLEM.shape) }]
  }
  try {
    const [attachment] = await attachments.saveImages([{ data: new Uint8Array(data), mediaType: result.mediaType }])
    return [metadataBlock(result), { type: IMAGE.imageBlock, attachment }]
  } catch {
    return [metadataBlock(result), { type: IMAGE.textBlock, text: TEXT.unavailable(IMAGE_PROBLEM.store) }]
  }
}
