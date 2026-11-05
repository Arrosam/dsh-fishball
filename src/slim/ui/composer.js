/**
 * The attachment parts of the slim composer (§6.6, §15 T06).
 *
 * T07 owns the chat page and the composer itself; this no-build module is the image/file seam it
 * imports: a chip for pending attachments, a preview for a rendered message (a caller-supplied
 * URL and the "from <session>" caption live with the timeline), and the one upload call.
 *
 * The browser talks to the child only through the broker's /fishball/embed/ path, so the upload
 * URL is relative to the page and carries no token (§3.2). Bytes go as canonical base64 to the
 * child's /api/upload, which admits them into the child's own store; a path is never sent.
 *
 * The client-side limits below mirror src/slim/limits.js. They are copies only because the child
 * serves /ui/* from this directory and a browser module cannot import '../limits.js' (it would
 * 404 behind the broker); the child still enforces the same rules authoritatively, so a stale
 * copy can only refuse early, never admit too much.
 */
const API = Object.freeze({ upload: 'api/upload', media: 'application/json', method: 'POST' })

const LIMITS_UI = Object.freeze({
  imageBytes: 4 * 1024 * 1024,
  uploadBodyBytes: 8 * 1024 * 1024,
  attachments: 20,
  /** The JSON envelope and the base64 expansion need room inside the 8 MiB upload body. */
  uploadReserveBytes: 4096,
})

const BASE64 = Object.freeze({ encoded: 4, decoded: 3 })
const DEFAULT_FILE_MEDIA_TYPE = 'application/octet-stream'
const IMAGE_KINDS = Object.freeze(new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']))
const STEP_BYTES = 0x8000

/** The two attachment kinds, matching the child's ATTACHMENT_KIND. */
export const KIND = Object.freeze({ image: 'image', file: 'file' })

/** The most attachments one message may carry; T07 disables adding past it. */
export const MAX_ATTACHMENTS = LIMITS_UI.attachments

const CLASS = Object.freeze({
  chip: 'fb-attachment-chip',
  thumb: 'fb-attachment-thumb',
  name: 'fb-attachment-name',
  remove: 'fb-attachment-remove',
  preview: 'fb-attachment-preview',
  caption: 'fb-attachment-caption',
  missing: 'fb-attachment-missing',
  file: 'fb-attachment-file',
  size: 'fb-attachment-size',
})

const COPY = Object.freeze({
  image: 'Image',
  file: 'File',
  remove: 'Remove',
  removeName: (name) => 'Remove attachment: ' + name,
  noPreview: 'Preview unavailable.',
  from: (session) => 'from ' + session,
  bytes: (bytes) => String(bytes) + ' bytes',
})

/** One client-side refusal, in the child API's own code vocabulary. */
const REFUSAL = Object.freeze({
  tooLarge: 'too-large',
  tooMany: 'limit-exceeded',
  failed: 'operation-failed',
})

/** The kind a browser File becomes: only 0.2.2's four image types are images. */
export function fileKind(file) {
  const type = typeof file?.type === 'string' ? file.type : ''
  return IMAGE_KINDS.has(type) ? KIND.image : KIND.file
}

/** Files dropped on the composer. */
export function filesFromDrop(event) {
  const transfer = event?.dataTransfer
  return transfer?.files === undefined ? [] : Array.from(transfer.files)
}

/** Files pasted into the composer; a clipboard image is the usual source. */
export function filesFromPaste(event) {
  const items = event?.clipboardData?.items
  if (items === undefined) return []
  const files = []
  for (const item of items) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file !== null) files.push(file)
  }
  return files
}

/**
 * Build one pending attachment from a browser File. A chip shows its name at once; a thumbnail
 * waits for previewDataUrl(), because the child's CSP admits img-src 'self' data: and not the
 * blob: URL createObjectURL would produce (§3.3). Uploading does not need the preview.
 */
export function pendingAttachment(file) {
  return { kind: fileKind(file), name: file.name, file }
}

/** The data-URL thumbnail the child CSP allows; undefined when the browser cannot read it. */
export function previewDataUrl(file) {
  return new Promise((resolve) => {
    if (file === undefined || file === null || typeof FileReader !== 'function') { resolve(undefined); return }
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : undefined))
    reader.addEventListener('error', () => resolve(undefined))
    reader.readAsDataURL(file)
  })
}

/**
 * Render one attachment chip for the composer.
 *
 * @param {{kind: string, name?: string, previewUrl?: string}} attachment
 * @param {{onRemove?: () => void}} [options]
 * @returns {HTMLElement}
 */
export function attachmentChip(attachment, options = {}) {
  const document = globalThis.document
  const root = document.createElement('span')
  root.className = CLASS.chip
  root.dataset.kind = attachment.kind
  const fallback = attachment.kind === KIND.image ? COPY.image : COPY.file
  const name = typeof attachment.name === 'string' && attachment.name.length > 0 ? attachment.name : fallback
  if (attachment.kind === KIND.image && typeof attachment.previewUrl === 'string') {
    const image = document.createElement('img')
    image.className = CLASS.thumb
    image.src = attachment.previewUrl
    image.alt = ''
    root.append(image)
  }
  const label = document.createElement('span')
  label.className = CLASS.name
  label.textContent = name
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = CLASS.remove
  remove.textContent = COPY.remove
  remove.setAttribute('aria-label', COPY.removeName(name))
  if (typeof options.onRemove === 'function') remove.addEventListener('click', options.onRemove)
  root.append(label, remove)
  return root
}

/**
 * Render one attachment in the timeline. A session image carries the caller's "from <session>"
 * caption and is never used as an avatar or an icon (§6.5). A file is a name and size only: the
 * browser never receives a path, and no URL is invented for a file.
 *
 * @param {{kind: string, name?: string, bytes?: number}} attachment
 * @param {{url?: string, caption?: string}} [options]
 * @returns {HTMLElement}
 */
export function attachmentPreview(attachment, options = {}) {
  const document = globalThis.document
  const root = document.createElement('figure')
  root.className = CLASS.preview
  root.dataset.kind = attachment.kind
  if (attachment.kind === KIND.image) {
    if (typeof options.url === 'string' && options.url.length > 0) {
      const image = document.createElement('img')
      image.className = CLASS.thumb
      image.src = options.url
      image.alt = typeof attachment.name === 'string' ? attachment.name : COPY.image
      image.loading = 'lazy'
      root.append(image)
    } else {
      const missing = document.createElement('span')
      missing.className = CLASS.missing
      missing.textContent = COPY.noPreview
      root.append(missing)
    }
  } else {
    const file = document.createElement('div')
    file.className = CLASS.file
    file.textContent = typeof attachment.name === 'string' && attachment.name.length > 0 ? attachment.name : COPY.file
    if (Number.isSafeInteger(attachment.bytes) && attachment.bytes > 0) {
      const size = document.createElement('span')
      size.className = CLASS.size
      size.textContent = COPY.bytes(attachment.bytes)
      file.append(size)
    }
    root.append(file)
  }
  const caption = typeof options.caption === 'string' && options.caption.length > 0
    ? options.caption
    : undefined
  if (caption !== undefined) {
    const figcaption = document.createElement('figcaption')
    figcaption.className = CLASS.caption
    figcaption.textContent = caption
    root.append(figcaption)
  }
  return root
}

/** The caption helper for a session image; T07 passes the source session's title. */
export function fromCaption(source) { return COPY.from(String(source)) }

/**
 * Upload one browser File to the child's store. Never throws: a refusal is a typed {ok:false}.
 *
 * @param {File} file
 * @returns {Promise<{ok:true, kind: string, attachment: object}|{ok:false, code: string}>}
 */
export async function uploadAttachment(file) {
  if (file === undefined || file === null || typeof file.arrayBuffer !== 'function') return { ok: false, code: REFUSAL.failed }
  const kind = fileKind(file)
  if (kind === KIND.image && file.size > LIMITS_UI.imageBytes) return { ok: false, code: REFUSAL.tooLarge }
  if (encodedSize(file.size) > LIMITS_UI.uploadBodyBytes) return { ok: false, code: REFUSAL.tooLarge }
  let data
  try {
    data = base64Of(await file.arrayBuffer())
  } catch {
    return { ok: false, code: REFUSAL.failed }
  }
  const mediaType = typeof file.type === 'string' && file.type.length > 0 ? file.type : DEFAULT_FILE_MEDIA_TYPE
  const body = { mediaType, data, ...(typeof file.name === 'string' && file.name.length > 0 ? { name: file.name } : {}) }
  let response
  try {
    response = await fetch(API.upload, {
      method: API.method,
      headers: { accept: API.media, 'content-type': API.media },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, code: REFUSAL.failed }
  }
  let answer
  try {
    answer = await response.json()
  } catch {
    return { ok: false, code: REFUSAL.failed }
  }
  if (!response.ok) return { ok: false, code: typeof answer?.code === 'string' ? answer.code : REFUSAL.failed }
  if (!answer || !answer.attachment || typeof answer.attachment.attachmentId !== 'string') return { ok: false, code: REFUSAL.failed }
  return { ok: true, kind: answer.kind, attachment: answer.attachment }
}

/**
 * Upload several Files in order, stopping at the message's attachment bound. Each result keeps
 * the input order, so the composer can show the first refused file beside its own chip.
 */
export async function uploadFiles(files, options = {}) {
  const existing = Number.isSafeInteger(options.existing) ? options.existing : 0
  const results = []
  for (const file of files) {
    if (existing + results.length >= LIMITS_UI.attachments) {
      results.push({ ok: false, code: REFUSAL.tooMany })
      continue
    }
    results.push(await uploadAttachment(file))
  }
  return results
}

/** The base64 body is 4 encoded characters per 3 bytes plus the JSON envelope. */
function encodedSize(bytes) {
  return Math.ceil(bytes / BASE64.decoded) * BASE64.encoded + LIMITS_UI.uploadReserveBytes
}

/** Browser-safe base64 without spreading a whole image over the call stack. */
function base64Of(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += STEP_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + STEP_BYTES))
  }
  return btoa(binary)
}
