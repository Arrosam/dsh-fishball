/**
 * Fishball's chat view for the slim shell (T07).
 *
 * A no-build ES module the shell imports. It owns the timeline and the model picker, mounts the
 * read-only composer (src/slim/ui/composer.js), and reads the child's own API with relative
 * URLs, so the same module works at the child's "/" and behind the broker's
 * "/fishball/embed/" (Section 3.1).
 *
 * Deliberate limits at v1:
 * - The composer is fixed to Read Only (D8): there is no permission control, no preset change
 *   and no request that could carry one. The label is text, not a selector.
 * - Messages are plain text, never HTML: Fishball's chat renders untrusted content from other
 *   sessions as text.
 * - Attachments (T06) and decision labels (T08, via T09) are not built here. The composer is
 *   its own module (src/slim/ui/composer.js) because T06 owns its image parts; a message without
 *   text still gets its bubble, and a tool row with only its call id still renders, so those
 *   seams can fill the same structures instead of replacing them.
 *
 * Classes are the only styling hook, because the CSP admits no inline style; dynamic state is a
 * class or a data attribute, never element.style. Server entries are partial records merged by
 * id, so a tool/result completes the row its tool/call started.
 */
import { createComposer } from './composer.js'

/** Same resources as the child's CHAT; the broker strips its prefix before forwarding. */
const API = Object.freeze({ chat: 'api/chat', model: 'api/model', media: 'application/json' })

/** Entry kinds the server sends; an unknown value is ignored rather than rendered as HTML. */
const KIND = Object.freeze({ user: 'user', assistant: 'assistant', tool: 'tool', notice: 'notice' })

const CLASS = Object.freeze({
  timeline: 'timeline',
  entry: 'entry',
  entryUser: 'entry-user',
  entryAssistant: 'entry-assistant',
  entryTool: 'entry-tool',
  entryNotice: 'entry-notice',
  pending: 'is-pending',
  author: 'entry-author',
  text: 'entry-text',
  time: 'entry-time',
  tool: 'tool',
  toolName: 'tool-name',
  toolState: 'tool-state',
  toolArguments: 'tool-arguments',
  toolOutput: 'tool-output',
  state: 'chat-state',
  notice: 'chat-notice',
  picker: 'picker',
  pickerLabel: 'picker-label',
  modelSelect: 'model-select',
  effortSelect: 'effort-select',
})

const COPY = Object.freeze({
  you: 'You',
  fishball: 'Fishball',
  tool: 'Tool',
  working: 'Fishball is working…',
  idle: 'Ready',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  model: 'Model',
  effort: 'Reasoning effort',
  defaultEffort: 'Default effort',
  chooseModel: 'Choose a model',
  noModels: 'No models',
  loadFailed: 'The conversation could not be loaded.',
  sendFailed: 'The message could not be sent.',
  modelFailed: 'The model choice could not be applied.',
})

/** Client-side transcript cap, matching the child's own view bound; the oldest row goes first. */
const LIMIT = Object.freeze({ entries: 300, scrollThresholdPx: 48 })

const ARIA = Object.freeze({ live: 'aria-live', label: 'aria-label', role: 'role', status: 'status', alert: 'alert', polite: 'polite' })

function textOf(value) { return typeof value === 'string' ? value : '' }

function isSelection(value) {
  return typeof value?.provider === 'string' && value.provider !== '' && typeof value?.model === 'string' && value.model !== ''
}

function selectionOf(value) {
  if (!isSelection(value)) return undefined
  return {
    provider: value.provider,
    model: value.model,
    ...(typeof value.reasoningEffort === 'string' && value.reasoningEffort !== '' ? { reasoningEffort: value.reasoningEffort } : {}),
  }
}

/** A request that failed with the child's typed JSON answer; the message is the child's copy. */
class RequestError extends Error {}

async function request(path, options = {}) {
  const headers = { accept: API.media }
  if (options.body !== undefined) headers['content-type'] = API.media
  const response = await fetch(path, { method: options.method ?? 'GET', headers, body: options.body, cache: 'no-store' })
  let answer
  try { answer = await response.json() } catch { answer = undefined }
  if (!response.ok) throw new RequestError(typeof answer?.message === 'string' && answer.message !== '' ? answer.message : COPY.sendFailed)
  return answer
}

/** One formatted time; an absent timestamp renders nothing instead of an invented clock. */
function timeNode(at) {
  const time = document.createElement('time')
  time.className = CLASS.time
  if (typeof at !== 'number' || !Number.isFinite(at)) return time
  time.dateTime = new Date(at).toISOString()
  time.textContent = new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return time
}

/**
 * Mount the chat view in the shell.
 *
 * @param {object} options
 * @param {Element} options.container - element the timeline and composer are appended to.
 * @param {Element} options.modelSlot - element the model picker is appended to.
 * @returns {{ refresh: () => Promise<void>, apply: (payload: object) => void, dispose: () => void }}
 */
export function createChatView(options = {}) {
  const { container, modelSlot } = options ?? {}
  if (!container || typeof container.append !== 'function' || typeof container.ownerDocument?.createElement !== 'function') {
    throw new TypeError('fishball chat: a container element is required')
  }
  if (!modelSlot || typeof modelSlot.append !== 'function') {
    throw new TypeError('fishball chat: a model picker slot is required')
  }
  const document = container.ownerDocument

  const timeline = document.createElement('ol')
  timeline.className = CLASS.timeline
  timeline.setAttribute(ARIA.live, ARIA.polite)

  const state = document.createElement('p')
  state.className = CLASS.state
  state.setAttribute(ARIA.role, ARIA.status)
  state.setAttribute(ARIA.live, ARIA.polite)
  state.textContent = COPY.idle

  const notice = document.createElement('p')
  notice.className = CLASS.notice
  notice.setAttribute(ARIA.role, ARIA.alert)
  notice.hidden = true

  const composer = createComposer({ document, onSubmit: (value) => sendPrompt(value) })
  container.append(timeline, state, composer.element, notice)

  const modelLabel = document.createElement('label')
  modelLabel.className = CLASS.picker
  const modelCaption = document.createElement('span')
  modelCaption.className = CLASS.pickerLabel
  modelCaption.textContent = COPY.model
  const modelSelect = document.createElement('select')
  modelSelect.className = CLASS.modelSelect
  modelSelect.setAttribute(ARIA.label, COPY.model)
  modelLabel.append(modelCaption, modelSelect)

  const effortLabel = document.createElement('label')
  effortLabel.className = CLASS.picker
  const effortCaption = document.createElement('span')
  effortCaption.className = CLASS.pickerLabel
  effortCaption.textContent = COPY.effort
  const effortSelect = document.createElement('select')
  effortSelect.className = CLASS.effortSelect
  effortSelect.setAttribute(ARIA.label, COPY.effort)
  effortLabel.append(effortCaption, effortSelect)
  effortLabel.hidden = true
  modelSlot.append(modelLabel, effortLabel)

  /** Entry data by id, and the rendered row, so a partial update replaces one row in place. */
  const entries = new Map()
  const rows = new Map()
  let providers = []
  let models = []
  let current = undefined
  let pendingRow
  let disposed = false
  let generation = 0

  function clearNotice() {
    notice.textContent = ''
    notice.hidden = true
  }

  function setNotice(message) {
    notice.textContent = message
    notice.hidden = message === ''
  }

  function setRunning(running) {
    state.textContent = running ? COPY.working : COPY.idle
    state.dataset.state = running ? 'running' : 'idle'
  }

  /** Scroll only when the reader was already at the end, so reading history is not yanked. */
  function nearBottom() {
    return timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < LIMIT.scrollThresholdPx
  }

  function scrollToEnd(wasNearBottom) {
    if (wasNearBottom) timeline.scrollTop = timeline.scrollHeight
  }

  /** Build one row; text is always assigned as textContent, never as markup. */
  function buildEntry(entry) {
    const row = document.createElement('li')
    row.className = CLASS.entry + ' ' + (CLASS['entry' + entry.kind[0].toUpperCase() + entry.kind.slice(1)] ?? '')
    row.dataset.entryKind = entry.kind
    const author = document.createElement('span')
    author.className = CLASS.author
    const body = document.createElement('p')
    body.className = CLASS.text
    if (entry.kind === KIND.user) {
      author.textContent = textOf(entry.author) || COPY.you
      body.textContent = textOf(entry.text)
      row.append(author, body, timeNode(entry.at))
      return row
    }
    if (entry.kind === KIND.assistant) {
      author.textContent = COPY.fishball
      body.textContent = textOf(entry.text)
      row.append(author, body, timeNode(entry.at))
      return row
    }
    if (entry.kind === KIND.notice) {
      body.textContent = textOf(entry.text)
      row.append(body)
      return row
    }
    // Tool: a collapsed row that still names the tool and its outcome, expanding to arguments
    // and the bounded result.
    const details = document.createElement('details')
    details.className = CLASS.tool
    const summary = document.createElement('summary')
    const name = document.createElement('span')
    name.className = CLASS.toolName
    name.textContent = textOf(entry.name) || COPY.tool
    const toolState = document.createElement('span')
    toolState.className = CLASS.toolState
    toolState.textContent = entry.state === 'running' ? COPY.running : entry.isError ? COPY.failed : COPY.done
    summary.append(name, toolState)
    details.append(summary)
    if (typeof entry.arguments === 'string' && entry.arguments !== '') {
      const args = document.createElement('pre')
      args.className = CLASS.toolArguments
      args.textContent = entry.arguments
      details.append(args)
    }
    if (typeof entry.output === 'string' && entry.output !== '') {
      const output = document.createElement('pre')
      output.className = CLASS.toolOutput
      output.textContent = entry.output
      details.append(output)
    }
    row.dataset.toolName = textOf(entry.name)
    row.dataset.toolState = textOf(entry.state)
    row.append(details)
    return row
  }

  function trimTimeline() {
    while (timeline.children.length > LIMIT.entries) {
      const oldest = timeline.firstElementChild
      if (oldest === null) return
      const id = oldest.dataset.entryId
      oldest.remove()
      if (typeof id === 'string') { entries.delete(id); rows.delete(id) }
    }
  }

  /** Merge one entry by id: a tool/result and a user twin update the row they belong to. */
  function upsert(entry) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || entry.id === '') return
    if (!Object.values(KIND).includes(entry.kind)) return
    const prior = entries.get(entry.id)
    const merged = prior === undefined ? entry : { ...prior, ...entry }
    entries.set(entry.id, merged)
    // A committed assistant message finalises the live stream; the durable row replaces it.
    if (merged.kind === KIND.assistant) clearPending()
    const next = buildEntry(merged)
    next.dataset.entryId = merged.id
    const wasNearBottom = nearBottom()
    const existing = rows.get(merged.id)
    if (existing !== undefined) existing.replaceWith(next)
    else timeline.append(next)
    rows.set(merged.id, next)
    trimTimeline()
    scrollToEnd(wasNearBottom)
  }

  function clearPending() {
    if (pendingRow !== undefined) pendingRow.remove()
    pendingRow = undefined
  }

  function appendStream(value) {
    if (typeof value !== 'string' || value === '') return
    const wasNearBottom = nearBottom()
    if (pendingRow === undefined) {
      pendingRow = document.createElement('li')
      pendingRow.className = CLASS.entry + ' ' + CLASS.entryAssistant + ' ' + CLASS.pending
      pendingRow.dataset.entryKind = KIND.assistant
      pendingRow.dataset.pending = 'true'
      const author = document.createElement('span')
      author.className = CLASS.author
      author.textContent = COPY.fishball
      const body = document.createElement('p')
      body.className = CLASS.text
      pendingRow.append(author, body)
      timeline.append(pendingRow)
    }
    const body = pendingRow.querySelector('.' + CLASS.text)
    if (body !== null) body.textContent += value
    trimTimeline()
    scrollToEnd(wasNearBottom)
  }

  function applySelection(selection) {
    const next = selectionOf(selection)
    if (next === undefined) return
    current = next
    syncModelSelect()
    syncEffortSelect()
  }

  function rebuildModelSelect() {
    modelSelect.replaceChildren()
    if (models.length === 0) {
      const option = document.createElement('option')
      option.textContent = COPY.noModels
      option.value = '-1'
      modelSelect.append(option)
      modelSelect.disabled = true
      return
    }
    modelSelect.disabled = false
    const placeholder = document.createElement('option')
    placeholder.textContent = COPY.chooseModel
    placeholder.value = '-1'
    modelSelect.append(placeholder)
    const groups = new Map()
    for (const model of models) {
      if (!groups.has(model.provider)) groups.set(model.provider, [])
      groups.get(model.provider).push(model)
    }
    for (const [providerId, list] of groups) {
      const group = document.createElement('optgroup')
      const provider = providers.find((candidate) => candidate.id === providerId)
      group.label = textOf(provider?.name) || providerId
      for (const model of list) {
        const index = models.indexOf(model)
        const option = document.createElement('option')
        option.value = String(index)
        option.textContent = textOf(model.name) || model.id
        group.append(option)
      }
      modelSelect.append(group)
    }
  }

  function selectedModel() {
    if (current === undefined) return undefined
    return models.find((model) => model.provider === current.provider && model.id === current.model)
  }

  function syncModelSelect() {
    const model = selectedModel()
    if (model === undefined) { modelSelect.value = '-1'; return }
    modelSelect.value = String(models.indexOf(model))
  }

  /** The effort select follows the chosen model's advertised efforts; none means no control. */
  function syncEffortSelect() {
    const model = selectedModel()
    const efforts = Array.isArray(model?.efforts) ? model.efforts.filter((effort) => typeof effort?.id === 'string' && effort.id !== '') : []
    effortSelect.replaceChildren()
    effortLabel.hidden = efforts.length === 0
    if (efforts.length === 0) return
    const fallback = document.createElement('option')
    fallback.value = ''
    fallback.textContent = COPY.defaultEffort
    effortSelect.append(fallback)
    for (const effort of efforts) {
      const option = document.createElement('option')
      option.value = effort.id
      option.textContent = textOf(effort.name) || effort.id
      effortSelect.append(option)
    }
    effortSelect.value = current?.reasoningEffort !== undefined && efforts.some((effort) => effort.id === current.reasoningEffort)
      ? current.reasoningEffort
      : ''
  }

  function renderModel(page) {
    if (!page || typeof page !== 'object') return
    providers = Array.isArray(page.providers)
      ? page.providers.filter((provider) => typeof provider?.id === 'string' && provider.id !== '')
      : []
    models = Array.isArray(page.models)
      ? page.models.filter((model) => typeof model?.id === 'string' && model.id !== '' && typeof model.provider === 'string' && model.provider !== '')
      : []
    current = selectionOf(page.selection)
    rebuildModelSelect()
    syncModelSelect()
    syncEffortSelect()
  }

  function renderPage(page) {
    if (!page || !Array.isArray(page.entries)) throw new TypeError('fishball chat: the page has no entries')
    const wasNearBottom = nearBottom()
    entries.clear()
    rows.clear()
    timeline.replaceChildren()
    for (const entry of page.entries) upsert(entry)
    setRunning(Boolean(page.running))
    composer.setMode(typeof page.permission?.mode === 'string' ? page.permission.mode : 'read-only')
    clearPending()
    scrollToEnd(wasNearBottom)
  }

  async function commitSelection(selection) {
    clearNotice()
    try {
      const answer = await request(API.model, { method: 'POST', body: JSON.stringify(selection) })
      if (selectionOf(answer?.selection) === undefined) throw new RequestError(COPY.modelFailed)
      applySelection(answer.selection)
    } catch (error) {
      setNotice(error instanceof RequestError ? error.message : COPY.modelFailed)
      syncModelSelect()
      syncEffortSelect()
    }
  }

  async function refresh() {
    if (disposed) return
    const currentGeneration = ++generation
    const [chatPage, modelPage] = await Promise.allSettled([request(API.chat), request(API.model)])
    if (disposed || currentGeneration !== generation) return
    if (chatPage.status === 'fulfilled') {
      try { renderPage(chatPage.value) } catch { setNotice(COPY.loadFailed) }
    } else {
      setNotice(COPY.loadFailed)
    }
    if (modelPage.status === 'fulfilled') renderModel(modelPage.value)
  }

  /** Send one prompt through the composer's callback; false keeps the text for a retry. */
  async function sendPrompt(value) {
    clearNotice()
    try {
      const answer = await request(API.chat, { method: 'POST', body: JSON.stringify({ text: value }) })
      if (typeof answer?.messageId === 'string' && answer.messageId !== '') {
        // The optimistic row shares the durable message id, so the committed user/message
        // replaces it instead of appearing twice.
        upsert({ id: 'm:' + answer.messageId, kind: KIND.user, at: Date.now(), author: COPY.you, text: value })
      }
      return true
    } catch (error) {
      setNotice(error instanceof RequestError ? error.message : COPY.sendFailed)
      return false
    }
  }

  modelSelect.addEventListener('change', () => {
    const model = models[Number(modelSelect.value)]
    if (model === undefined) return
    void commitSelection({ provider: model.provider, model: model.id })
  })

  effortSelect.addEventListener('change', () => {
    const model = selectedModel()
    if (model === undefined) return
    const effort = effortSelect.value
    void commitSelection({ provider: model.provider, model: model.id, ...(effort === '' ? {} : { reasoningEffort: effort }) })
  })

  /** Apply one SSE chat frame; unknown types and malformed entries are ignored. */
  function apply(payload) {
    if (disposed || !payload || typeof payload !== 'object') return
    if (payload.type === 'entry') { upsert(payload.entry); return }
    if (payload.type === 'stream') { appendStream(payload.text); return }
    if (payload.type === 'stream-end') { clearPending(); return }
    if (payload.type === 'state') { setRunning(Boolean(payload.running)); return }
    if (payload.type === 'model') { applySelection(payload.selection) }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    container.replaceChildren()
    modelSlot.replaceChildren()
  }

  void refresh()
  return Object.freeze({ refresh, apply, dispose })
}
