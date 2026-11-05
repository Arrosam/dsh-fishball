/**
 * Fishball's composer for the slim shell (T07; T06 extends it with attachments).
 *
 * The composer is fixed to Read Only (D8): the badge is text, not a permission control, and no
 * prop or request here can change the session's preset. Enter sends, Shift+Enter starts a new
 * line, and the owner's send callback decides whether the prompt is cleared.
 *
 * T06 owns the image and attachment parts of this module: the composer will accept drag and
 * drop, paste and a file picker, post bytes to the child's own api/upload, and pass the accepted
 * attachment ids to the same onSubmit callback. Nothing in this task's version posts files, so
 * the text-only path is the whole contract today.
 *
 * Classes are the only styling hook (the CSP admits no inline style); the form's states are the
 * disabled attribute and a data attribute, never element.style.
 */
const CLASS = Object.freeze({ composer: 'composer', mode: 'composer-mode', prompt: 'prompt', send: 'send' })
const ARIA = Object.freeze({ label: 'aria-label' })
const COPY = Object.freeze({
  readOnly: 'Read Only',
  readOnlyHint: 'Fishball\'s session is read-only. The composer has no permission control.',
  prompt: 'Message Fishball',
  send: 'Send',
})
const KEY = Object.freeze({ enter: 'Enter' })

/**
 * Mount the composer.
 *
 * @param {object} options
 * @param {Document} options.document - the page document.
 * @param {(text: string) => Promise<boolean>} options.onSubmit - sends one prompt; resolves
 *   true when it was accepted (the composer then clears), false when the owner already reported
 *   the failure, or rejects on an unexpected failure.
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
  const prompt = document.createElement('textarea')
  prompt.className = CLASS.prompt
  prompt.rows = 2
  prompt.placeholder = COPY.prompt
  prompt.setAttribute(ARIA.label, COPY.prompt)
  const send = document.createElement('button')
  send.className = CLASS.send
  send.type = 'submit'
  send.textContent = COPY.send
  form.append(mode, prompt, send)

  let sending = false

  async function submit() {
    if (sending) return
    const value = prompt.value
    if (value.trim() === '') return
    sending = true
    send.disabled = true
    try {
      // The owner reports a refusal; the prompt stays so the user can retry or edit it.
      if (await onSubmit(value)) prompt.value = ''
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

  return Object.freeze({
    element: form,
    /** The session's actual mode, for tests and diagnostics; the visible badge stays Read Only. */
    setMode(value) {
      if (typeof value === 'string' && value !== '') mode.dataset.mode = value
    },
    focus() { prompt.focus() },
  })
}
