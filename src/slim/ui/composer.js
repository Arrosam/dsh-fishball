/**
 * Fishball's composer for the slim shell (T07) with its attachment seam (T06, §6.6).
 *
 * The composer itself is T07's: fixed to Read Only (D8), the badge is text, not a permission
 * control, Enter sends and Shift+Enter starts a new line, and the owner's send callback decides
 * whether the prompt is cleared. T06 adds the image and file parts of the same module: drag and
 * drop, paste and a file picker; one chip per pending attachment; a thumbnail from a data URL
 * (the §3.3 CSP admits data: but not blob:); and the one upload call to the child's own
 * api/upload. The accepted attachment descriptors travel to the same onSubmit callback, which
 * the chat view turns into the message's image and file blocks.
 *
 * A path is never sent: bytes go as canonical base64 to the child API, which admits them into
 * the child's own store under the contract's limits. A failed upload leaves the files in place
 * so the user can retry after fixing the cause.
 *
 * Classes are the only styling hook (the CSP admits no inline style); the form's states are the
 * disabled attribute and a data attribute, never element.style. The attachment render helpers
 * are shared with the chat timeline (a pending chip and a rendered message part), so the two
 * surfaces cannot drift.
 *
 * The client limits below mirror src/slim/limits.js. They are copies only because the child
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

/** The most attachments one message may carry; the composer stops adding past it. */
export const MAX_ATTACHMENTS = LIMITS_UI.attachments

const CLASS = Object.freeze({
  composer: 'composer',
  mode: 'composer-mode',
  prompt: 'prompt',
  send: 'send',
  chips: 'composer-attachments',
  attach: 'composer-attach',
  input: 'composer-input',
  notice: 'composer-notice',
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

const ARIA = Object.freeze({ label: 'aria-label' })
const COPY = Object.freeze({
  readOnly: 'Read Only',
  readOnlyHint: 'Fishball\'s session is read-only. The composer has no permission control.',
  prompt: 'Message Fishball',
  send: 'Send',
  attach: 'Attach',
  attachHint: 'Add images or files',
  image: 'Image',
  file: 'File',
  remove: 'Remove',
  removeName: (name) => 'Remove attachment: ' + name,
  noPreview: 'Preview unavailable.',
  from: (session) => 'from ' + session,
  bytes: (bytes) => String(bytes) + ' bytes',
})
const KEY = Object.freeze({ enter: 'Enter' })
const EVENT = Object.freeze({ dragover: 'dragover', drop: 'drop', paste: 'paste', change: 'change' })
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
 * @param {{document?: Document, onRemove?: () => void}} [options]
 * @returns {HTMLElement}
 */
export function attachmentChip(attachment, options = {}) {
  const document = options.document ?? globalThis.document
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
  remove.setAttribute(ARIA.label, COPY.removeName(name))
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
 * @param {{document?: Document, url?: string, caption?: string}} [options]
 * @returns {HTMLElement}
 */
export function attachmentPreview(attachment, options = {}) {
  const document = options.document ?? globalThis.document
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

/** The caption helper for a session image; the chat view passes the source session's title. */
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

/**
 * Mount the composer.
 *
 * @param {object} options
 * @param {Document} options.document - the page document.
 * @param {(text: string, attachments: Array<{kind: string, attachment: object, previewUrl?: string}>)
 *   => Promise<boolean>} options.onSubmit - sends one prompt with its already-uploaded attachment
 *   descriptors; resolves true when it was accepted (the composer then clears), false when the
 *   owner already reported the failure, or rejects on an unexpected failure.
 * @returns {{ element: Element, setMode: (mode: string) => void, focus: () => void }}
 */
export function createComposer(options = {}) {
  const { document, onSubmit } = options ?? {}
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('fishball chat: a document is required')
  }
  if (typeof onSubmit !== 'function') {
    throw new TypeError('fishball chat: a send callback is required')
  }

  const form = document.createElement('form')
  form.className = CLASS.composer
  form.noValidate = true
  const mode = document.createElement('span')
  mode.className = CLASS.mode
  mode.textContent = COPY.readOnly
  mode.title = COPY.readOnlyHint
  const chips = document.createElement('div')
  chips.className = CLASS.chips
  const attach = document.createElement('button')
  attach.type = 'button'
  attach.className = CLASS.attach
  attach.textContent = COPY.attach
  attach.title = COPY.attachHint
  attach.setAttribute(ARIA.label, COPY.attachHint)
  const input = document.createElement('input')
  input.type = 'file'
  input.className = CLASS.input
  input.hidden = true
  input.multiple = true
  const prompt = document.createElement('textarea')
  prompt.className = CLASS.prompt
  prompt.rows = 2
  prompt.placeholder = COPY.prompt
  prompt.setAttribute(ARIA.label, COPY.prompt)
  const send = document.createElement('button')
  send.className = CLASS.send
  send.type = 'submit'
  send.textContent = COPY.send
  const notice = document.createElement('p')
  notice.className = CLASS.notice
  notice.hidden = true
  notice.setAttribute('role', 'alert')
  form.append(mode, attach, input, prompt, send, chips, notice)

  /** Pending files with their preview; the chip list is rebuilt from this one owner. */
  let pending = []
  let nextId = 0
  let sending = false

  function setNotice(message) {
    notice.textContent = message
    notice.hidden = message === ''
  }

  /** Rebuild the chips from pending; bounded by MAX_ATTACHMENTS, so a full rebuild is cheap. */
  function renderChips() {
    chips.replaceChildren()
    chips.hidden = pending.length === 0
    for (const item of pending) {
      chips.append(attachmentChip(item, { document, onRemove: () => { pending = pending.filter((entry) => entry.id !== item.id); renderChips() } }))
    }
  }

  /**
   * Add files up to the bound. An over-bound file is refused with the API's own code rather
   * than silently dropped; the accepted ones still get their chips.
   */
  function addFiles(files) {
    setNotice('')
    for (const file of files) {
      if (pending.length >= MAX_ATTACHMENTS) { setNotice(REFUSAL.tooMany); break }
      const item = { ...pendingAttachment(file), id: nextId++ }
      pending.push(item)
      // The preview is cosmetic and may be unavailable; the upload never waits for it.
      if (item.kind === KIND.image) {
        void previewDataUrl(file).then((previewUrl) => {
          if (previewUrl === undefined || !pending.some((entry) => entry.id === item.id)) return
          item.previewUrl = previewUrl
          renderChips()
        })
      }
    }
    renderChips()
  }

  /** Upload every pending file in order, or report the first typed refusal. */
  async function uploadPending() {
    const results = await uploadFiles(pending.map((item) => item.file), { existing: 0 })
    const refused = results.find((result) => !result.ok)
    if (refused !== undefined) { setNotice(refused.code); return undefined }
    return pending.map((item, index) => ({
      kind: results[index].kind,
      attachment: results[index].attachment,
      ...(item.previewUrl === undefined ? {} : { previewUrl: item.previewUrl }),
    }))
  }

  async function submit() {
    if (sending) return
    const value = prompt.value
    if (value.trim() === '' && pending.length === 0) return
    sending = true
    send.disabled = true
    setNotice('')
    try {
      const attachments = pending.length === 0 ? [] : await uploadPending()
      if (attachments === undefined) return
      // The owner reports a refusal; the prompt and files stay so the user can retry or edit them.
      if (await onSubmit(value, attachments)) {
        prompt.value = ''
        pending = []
        renderChips()
      }
    } catch { /* the owner owns the failure copy */ } finally {
      sending = false
      send.disabled = false
      prompt.focus()
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void submit()
  })

  prompt.addEventListener('keydown', (event) => {
    if (event.key === KEY.enter && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      void submit()
    }
  })

  // Drag and drop is a hint only: the drop handler owns the files, and the dragover handler
  // must always cancel to tell the browser this target accepts them.
  form.addEventListener(EVENT.dragover, (event) => { event.preventDefault() })
  form.addEventListener(EVENT.drop, (event) => {
    event.preventDefault()
    addFiles(filesFromDrop(event))
  })
  prompt.addEventListener(EVENT.paste, (event) => {
    const files = filesFromPaste(event)
    if (files.length === 0) return
    // A pasted image belongs to the composer, not to the textarea's text; cancel only then.
    event.preventDefault()
    addFiles(files)
  })
  attach.addEventListener('click', () => input.click())
  input.addEventListener(EVENT.change, () => {
    addFiles(Array.from(input.files ?? []))
    // Allow choosing the same file again after removing its chip.
    input.value = ''
  })

  renderChips()
  return Object.freeze({
    element: form,
    /** The session's actual mode, for tests and diagnostics; the visible badge stays Read Only. */
    setMode(value) {
      if (typeof value === 'string' && value !== '') mode.dataset.mode = value
    },
    focus() { prompt.focus() },
  })
}
