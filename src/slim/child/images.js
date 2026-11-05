/**
 * Images and attachments in the isolated child (§6.3, §6.4, §6.6, §15 T06).
 *
 * Three jobs, all on the child's own store and the one shared bridge client:
 * - receive(): pull the images of an inbox item by id (attachment.read), verify them and save
 *   them into the child's store, returning the image blocks for Fishball's own user message;
 * - upload(): admit one browser upload into the child's store through /api/upload;
 * - prepare()/send(): turn the child's own image or file refs into attachment.put hostRefs and
 *   hand a session.start/message/redirect request the refs, never bytes and never a path.
 *
 * The two model rules are explicit here:
 * - a Fishball model whose declared modalities omit "image" is refused with the contract's
 *   images-unsupported before an inbound image is stored or queued (Q2, §6.3 step 4);
 * - a user's own upload is still admitted for a text-only model (§6.6): DSH's request assembly
 *   projects the image to text and the UI shows the notice, so nothing is silently lost.
 *
 * The bridge is the session-tools row's fishballBridge service; this module opens no second
 * channel and never retries. A file has no media type in DSH's FileAttachmentRef, so it travels
 * as application/octet-stream and reaches a model only as DSH's own file handle text.
 */
import { randomUUID } from 'node:crypto'
import { ERROR, LIMITS, MEDIA, OPERATION, ROUTES, ContractError } from '../contract.js'
import {
  chunksOf, fromBase64, isImageMediaType, maxChunkedBytes, sha256Hex, verifyTransfer,
} from '../attachment-transfer.js'

/** The child API this module serves, and the bounds the browser and the module share. */
export const IMAGES = Object.freeze({
  plugin: 'fishball-native-images',
  service: 'fishballImages',
  /** The child's unprefixed tail of the broker's /fishball/embed/api/upload route (§3.1). */
  uploadPath: ROUTES.api.slice(ROUTES.prefix.length) + 'upload',
  uploadMethods: Object.freeze(['POST']),
  /** The upload POST is the one route the T04 proxy admits at 8 MiB (§3.6). */
  maxUploadBytes: LIMITS.embedUploadBodyBytes,
  maxImageBytes: LIMITS.imageBytes,
  maxAttachments: LIMITS.attachmentsPerMessage,
  /** Files have no DSH media type; the octet-stream label keeps the contract's text rule. */
  fileMediaType: 'application/octet-stream',
  /** A declared media type is a label, never a path; control characters are refused. */
  mediaTypeChars: 200,
})

/** The bridge operations this module needs the main host to implement (the handshake set). */
export const IMAGES_REQUIRED = Object.freeze([OPERATION.attachmentRead, OPERATION.attachmentPut])

/** The two attachment kinds the child stores and later sends. */
export const ATTACHMENT_KIND = Object.freeze({ image: 'image', file: 'file' })

/** The image modality 0.2.2 declares on a model that accepts pictures. */
const IMAGE_MODALITY = 'image'

/** Upload refusals: the child API's own status/body vocabulary, mirroring the reminder route. */
export const UPLOAD_STATUS = Object.freeze({ ok: 200, badRequest: 400, tooLarge: 413, unsupportedType: 415, failed: 500 })
export const UPLOAD_ERROR = Object.freeze({
  invalid: 'invalid-input',
  unsupportedType: 'unsupported-media-type',
  tooLarge: 'too-large',
  failed: 'operation-failed',
})

const UPLOAD_KEYS = Object.freeze(['mediaType', 'data', 'name'])
const UPLOAD_REQUIRED = Object.freeze(['mediaType', 'data'])
const CONTROL = /[\u0000-\u001f\u007f]/u
const BRIDGE_SERVICE = 'fishballBridge'

const MESSAGE = Object.freeze({
  invalid: 'The upload is not a valid attachment request.',
  unsupportedType: 'Only png, jpeg, webp and gif images are accepted; other content must be sent as a file.',
  tooLarge: 'The attachment exceeds its size limit.',
  failed: 'The attachment could not be stored.',
})

/** One typed upload refusal; the server turns status and body into the HTTP answer. */
export class ImageApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'ImageApiError'
    this.status = status
    this.code = code
    this.body = Object.freeze({ code, message })
  }
}

/** DSH attachment refusals, routed to the upload vocabulary. */
const ATTACHMENT_ERROR = Object.freeze({
  tooLarge: new Set([
    'IMAGE_TOO_LARGE', 'IMAGES_TOO_LARGE', 'IMAGE_TOO_MANY_PIXELS', 'IMAGE_DIMENSION_TOO_LARGE',
  ]),
  unsupported: new Set(['UNSUPPORTED_IMAGE_TYPE', 'IMAGE_TYPE_MISMATCH', 'INVALID_IMAGE']),
})

/**
 * Create the child image service over a Cordis context.
 *
 * @param {object} ctx - child context carrying attachments (and llm for the modality gate).
 * @param {object} [options]
 * @param {object} [options.bridge] - the fishballBridge service; default ctx.get('fishballBridge').
 * @returns the service; see the methods below for the exact contract.
 */
export function createImages(ctx, options = {}) {
  const attachments = ctx?.attachments
  for (const method of ['readImage', 'saveImage', 'saveFile', 'readFileStream']) {
    if (typeof attachments?.[method] !== 'function') throw new TypeError('fishball child images: the attachment store must implement ' + method)
  }
  const bridgeOf = () => {
    const bridge = options.bridge ?? (typeof ctx.get === 'function' ? ctx.get(BRIDGE_SERVICE) : undefined)
    if (bridge === undefined) throw new ContractError(ERROR.disconnected)
    if (typeof bridge.request !== 'function') throw new TypeError('fishball child images: the bridge must implement request')
    // Idempotent: the session-tools row's client advertises every required operation at hello.
    if (typeof bridge.require === 'function') bridge.require(IMAGES_REQUIRED)
    return bridge
  }

  /** Whether Fishball's current model admits image input; absent modalities mean unknown. */
  async function supportsImages(selection) {
    // An unknown selection or an adapter that declares no modalities means "unknown", which
    // 0.2.2's own gate treats as allowed; only an explicit omission is a refusal.
    if (typeof selection?.provider !== 'string' || typeof selection?.model !== 'string') return true
    if (typeof ctx.llm?.resolveModelInfo !== 'function') return true
    const model = await ctx.llm.resolveModelInfo(selection.provider, selection.model)
    return model?.inputModalities === undefined || model.inputModalities.includes(IMAGE_MODALITY)
  }

  /** Q2's typed refusal: no silent drop, no model switch. */
  async function assertImagesSupported(selection) {
    if (!(await supportsImages(selection))) throw new ContractError(ERROR.imagesUnsupported)
  }

  /** Admit one browser upload. Images go through saveImage; everything else is a file. */
  async function upload(body) {
    const request = uploadRequest(body)
    const image = isImageMediaType(request.mediaType)
    let data
    try {
      data = fromBase64(request.data)
    } catch {
      // The child API answers a malformed base64 body as 400, not as a thrown handler failure.
      throw invalidUpload()
    }
    if (data.length === 0) throw invalidUpload()
    if (image) {
      if (data.length > IMAGES.maxImageBytes) throw new ImageApiError(UPLOAD_STATUS.tooLarge, UPLOAD_ERROR.tooLarge, MESSAGE.tooLarge)
    } else if (data.length > maxChunkedBytes()) {
      throw new ImageApiError(UPLOAD_STATUS.tooLarge, UPLOAD_ERROR.tooLarge, MESSAGE.tooLarge)
    }
    try {
      if (image) {
        const attachment = await attachments.saveImage({
          data, mediaType: request.mediaType,
          ...(request.name === undefined ? {} : { name: request.name }),
        })
        return { kind: ATTACHMENT_KIND.image, attachment }
      }
      const attachment = await attachments.saveFile({
        data,
        ...(request.name === undefined ? {} : { name: request.name }),
      })
      return { kind: ATTACHMENT_KIND.file, attachment }
    } catch (error) {
      throw uploadRefusal(error)
    }
  }

  /**
   * Pull one inbox item's images by id, verify and store them. Refuses a text-only Fishball
   * model before any bytes are stored, so a refusal leaves the child's store untouched.
   *
   * @param {{sourceSessionId: string, images: object[]}} item - contract inbox.push payload.
   * @param {{selection?: object, agent?: object}} [options] - Fishball's current model selection
   *   (or the live agent whose model.current() supplies it).
   * @returns {Promise<{blocks: object[], images: object[]}>} image blocks and their child refs.
   */
  async function receiveInbox(item, options = {}) {
    const images = Array.isArray(item?.images) ? item.images : []
    if (images.length === 0) return { blocks: [], images: [] }
    if (images.length > LIMITS.imagesPerMessage) throw new ContractError(ERROR.tooLarge)
    if (typeof item?.sourceSessionId !== 'string' || item.sourceSessionId.length === 0) throw new ContractError(ERROR.invalid)
    await assertImagesSupported(selectionOf(options))
    const bridge = bridgeOf()
    const blocks = []
    const stored = []
    for (const image of images) {
      const ref = imageMetadataOf(image)
      const payload = await bridge.request(OPERATION.attachmentRead, {
        sessionId: item.sourceSessionId,
        attachmentId: ref.attachmentId,
      })
      const data = verifyTransfer(payload, { maxBytes: LIMITS.imageBytes })
      if (payload.attachmentId !== ref.attachmentId || payload.mediaType !== ref.mediaType || data.length !== ref.bytes) {
        throw new ContractError(ERROR.invalid)
      }
      let saved
      try {
        saved = await attachments.saveImage({ data, mediaType: payload.mediaType })
      } catch (error) {
        throw refusalOf(error)
      }
      stored.push(saved)
      blocks.push({ type: ATTACHMENT_KIND.image, attachment: saved })
    }
    return { blocks, images: stored }
  }

  /**
   * Stream the child's own attachments to the main host as single-use hostRefs, in order.
   * The list is bounded by the same 20-per-message rule the contract applies.
   */
  async function prepare(attachmentsForMessage = []) {
    if (!Array.isArray(attachmentsForMessage)) throw new ContractError(ERROR.invalid)
    if (attachmentsForMessage.length > IMAGES.maxAttachments) throw new ContractError(ERROR.tooLarge)
    if (attachmentsForMessage.length === 0) return []
    const bridge = bridgeOf()
    const hostRefs = []
    for (const descriptor of attachmentsForMessage) {
      const { kind, attachment } = attachmentDescriptorOf(descriptor)
      const transfer = kind === ATTACHMENT_KIND.image
        ? await imageTransferOf(attachment)
        : await fileTransferOf(attachment)
      const response = await bridge.request(OPERATION.attachmentPut, transfer)
      hostRefs.push(response.hostRef)
    }
    return hostRefs
  }

  async function message({ sessionId, message: text, attachments: list = [] }) {
    const hostRefs = await prepare(list)
    return bridgeOf().request(OPERATION.sessionMessage, { sessionId, message: text, attachments: hostRefs })
  }

  async function redirect({ sessionId, message: text, attachments: list = [] }) {
    const hostRefs = await prepare(list)
    return bridgeOf().request(OPERATION.sessionRedirect, { sessionId, message: text, attachments: hostRefs })
  }

  async function start({ folder, title, message: text, attachments: list = [], model, reasoningEffort } = {}) {
    const hostRefs = await prepare(list)
    return bridgeOf().request(OPERATION.sessionStart, {
      folder, title, message: text, attachments: hostRefs,
      ...(model === undefined ? {} : { model }),
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    })
  }

  async function imageTransferOf(ref) {
    let stored
    try {
      stored = await attachments.readImage(ref)
    } catch (error) {
      throw refusalOf(error)
    }
    const data = stored.data
    if (data.length > LIMITS.imageBytes) throw new ContractError(ERROR.tooLarge)
    return transferOf(data, stored.ref.mediaType, stored.ref.name)
  }

  async function fileTransferOf(ref) {
    const parts = []
    let total = 0
    try {
      for await (const part of attachments.readFileStream(ref)) {
        total += part.length
        if (total > maxChunkedBytes()) throw new ContractError(ERROR.tooLarge)
        parts.push(Buffer.from(part))
      }
    } catch (error) {
      throw refusalOf(error)
    }
    return transferOf(Buffer.concat(parts), IMAGES.fileMediaType, ref.name)
  }

  return Object.freeze({
    supportsImages,
    assertImagesSupported,
    upload,
    receiveInbox,
    prepare,
    message,
    redirect,
    start,
  })
}

/** The child app row can mount this plugin; the chat row may also call createImages directly. */
export const name = IMAGES.plugin
export const inject = ['attachments', 'llm']
export function apply(ctx) {
  const images = createImages(ctx)
  // The session-tools row may mount the shared client before or after this row; requiring the
  // two operations as soon as it appears puts them in the hello before the control transport
  // attaches, so a later first use cannot miss the negotiated capability list.
  const requireBridge = (scope) => {
    const bridge = scope?.[BRIDGE_SERVICE] ?? (typeof scope?.get === 'function' ? scope.get(BRIDGE_SERVICE) : undefined)
    if (typeof bridge?.require === 'function') bridge.require(IMAGES_REQUIRED)
  }
  requireBridge(ctx)
  if (typeof ctx.inject === 'function') ctx.inject([BRIDGE_SERVICE], requireBridge)
  ctx.provide(IMAGES.service, images)
  return images
}

/** One transfer frame for verified bytes; the name is a display leaf, never a path. */
function transferOf(data, mediaType, name) {
  if (data.length === 0) throw new ContractError(ERROR.invalid)
  return {
    transferId: randomUUID(),
    total: data.length,
    sha256: sha256Hex(data),
    mediaType,
    ...(typeof name === 'string' && name.length > 0 ? { name } : {}),
    chunks: chunksOf(data),
  }
}

/**
 * The current model selection of a live Fishball agent, for callers that hold the agent rather
 * than the selection. AgentModel.current() is the same source DSH's own image gate reads.
 */
function selectionOf(options) {
  if (options.selection !== undefined) return options.selection
  return typeof options.agent?.model?.current === 'function' ? options.agent.model.current() : undefined
}

/** Exact upload body: mediaType and canonical base64 data, with an optional display name. */
function uploadRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalidUpload()
  for (const key of Object.keys(body)) if (!UPLOAD_KEYS.includes(key)) throw invalidUpload()
  for (const key of UPLOAD_REQUIRED) if (!Object.hasOwn(body, key)) throw invalidUpload()
  if (typeof body.mediaType !== 'string' || body.mediaType.length === 0) throw invalidUpload()
  if (body.mediaType.length > IMAGES.mediaTypeChars || CONTROL.test(body.mediaType)) throw invalidUpload()
  // An image/ label must be one of 0.2.2's four; SVG and every other image type are files only
  // by refusing them here, never by passing them to the image store (§6.2, §6.5).
  if (body.mediaType.startsWith(MEDIA.prefix) && !isImageMediaType(body.mediaType)) {
    throw new ImageApiError(UPLOAD_STATUS.unsupportedType, UPLOAD_ERROR.unsupportedType, MESSAGE.unsupportedType)
  }
  if (typeof body.data !== 'string' || body.data.length === 0) throw invalidUpload()
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length === 0)) throw invalidUpload()
  return body
}

function invalidUpload() {
  return new ImageApiError(UPLOAD_STATUS.badRequest, UPLOAD_ERROR.invalid, MESSAGE.invalid)
}

/** Map one DSH store failure to the upload vocabulary; an unknown failure is typed, not thrown. */
function uploadRefusal(error) {
  if (error instanceof ImageApiError) return error
  const code = error?.code
  if (ATTACHMENT_ERROR.tooLarge.has(code)) return new ImageApiError(UPLOAD_STATUS.tooLarge, UPLOAD_ERROR.tooLarge, MESSAGE.tooLarge)
  if (ATTACHMENT_ERROR.unsupported.has(code)) return new ImageApiError(UPLOAD_STATUS.unsupportedType, UPLOAD_ERROR.unsupportedType, MESSAGE.unsupportedType)
  return new ImageApiError(UPLOAD_STATUS.failed, UPLOAD_ERROR.failed, MESSAGE.failed)
}

/** Map one child-side store failure to the contract's transfer refusals. */
function refusalOf(error) {
  if (error instanceof ContractError) return error
  const code = error?.code
  if (ATTACHMENT_ERROR.tooLarge.has(code)) return new ContractError(ERROR.tooLarge)
  return new ContractError(ERROR.failed)
}

/** One image metadata record as inbox.push carries it (contract imageRef). */
function imageMetadataOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractError(ERROR.invalid)
  const { attachmentId, mediaType, width, height, bytes } = value
  if (typeof attachmentId !== 'string' || attachmentId.length === 0) throw new ContractError(ERROR.invalid)
  if (!isImageMediaType(mediaType)) throw new ContractError(ERROR.invalid)
  for (const number of [width, height, bytes]) if (!Number.isSafeInteger(number) || number < 1) throw new ContractError(ERROR.invalid)
  if (width * height > LIMITS.imagePixels || bytes > LIMITS.imageBytes) throw new ContractError(ERROR.tooLarge)
  return { attachmentId, mediaType, width, height, bytes }
}

/** One child attachment descriptor: the ref plus which store it came from. */
function attachmentDescriptorOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractError(ERROR.invalid)
  if (value.kind !== ATTACHMENT_KIND.image && value.kind !== ATTACHMENT_KIND.file) throw new ContractError(ERROR.invalid)
  const attachment = value.attachment
  if (!attachment || typeof attachment !== 'object' || typeof attachment.attachmentId !== 'string') throw new ContractError(ERROR.invalid)
  return { kind: value.kind, attachment }
}
