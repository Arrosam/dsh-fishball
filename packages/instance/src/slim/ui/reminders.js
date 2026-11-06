/**
 * The reminder list for the slim shell (§15 T10).
 *
 * A no-build ES module the shell imports; T07 owns the page around it. It reads the child's own
 * list API with a relative URL, so the same module works at the child's "/" and behind the
 * broker's "/fishball/embed/" (§3.1). Creating and editing a reminder stays in chat, where the
 * agent's schedule tools express timing and the delivery target; this view only lists what
 * exists and cancels (deletes) one.
 *
 * The view owns no reminder state: every refresh re-reads the list, and the shell calls
 * `refresh()` when its one EventSource receives the app's "reminders" change event, instead of
 * opening a second stream (§3.6). Classes are the only styling hook, because the §3.3 CSP admits
 * no inline style; T07's stylesheet can style them.
 */
/** Same resource as the child's REMINDERS.relative; the broker strips its prefix before forwarding. */
const API = Object.freeze({ path: 'api/reminders', read: 'GET', write: 'POST', action: 'cancel', media: 'application/json' })

/** Class names, so the shell stylesheet can reach the list without inline styles. */
const CLASS = Object.freeze({
  root: 'reminders',
  heading: 'reminders-heading',
  status: 'reminders-status',
  summary: 'reminders-summary',
  list: 'reminders-list',
  item: 'reminders-item',
  name: 'reminders-name',
  when: 'reminders-when',
  prompt: 'reminders-prompt',
  state: 'reminders-state',
  action: 'reminders-action',
  empty: 'reminders-empty',
})

const ARIA = Object.freeze({ busy: 'aria-busy', label: 'aria-label', role: 'role', status: 'status', true: 'true', false: 'false' })

/** Every visible string in one place. */
const COPY = Object.freeze({
  heading: 'Reminders',
  loading: 'Loading reminders…',
  empty: 'No reminders yet.',
  loadFailed: 'Reminders could not be loaded.',
  cancelFailed: 'The reminder could not be cancelled.',
  cancel: 'Cancel',
  delete: 'Delete',
  cancelName: (title) => `Cancel reminder: ${title}`,
  deleteName: (title) => `Delete reminder: ${title}`,
  showing: (shown, total) => `Showing ${shown} of ${total} reminders.`,
  status: Object.freeze({ active: 'Active', paused: 'Paused', ended: 'Ended' }),
})

/** Schedule task statuses the view distinguishes; the copy map names the same values. */
const STATUS = Object.freeze({ active: 'active' })

const DATE_TIME = Object.freeze({ dateStyle: 'medium', timeStyle: 'short' })
/** A prompt is the delivered instruction, not a title; a row keeps its first line worth reading. */
const LIMIT = Object.freeze({ promptChars: 160 })
const ELLIPSIS = '…'

const text = (value) => (typeof value === 'string' ? value : '')

/** Clamp by code point so a surrogate pair is never cut in half. */
function clamp(value) {
  const characters = Array.from(value)
  return characters.length <= LIMIT.promptChars ? value : characters.slice(0, LIMIT.promptChars).join('') + ELLIPSIS
}

/**
 * Format one occurrence in the record's zone when it names one, otherwise in the viewer's zone.
 * An RRULE keeps its zone inside the rule text, so those rows show the viewer's zone; DSH's own
 * formatter would be needed for more, and it is not part of this no-build module.
 */
function formatWhen(reminder) {
  const raw = text(reminder.scheduledAt)
  const date = new Date(raw)
  if (raw === '' || Number.isNaN(date.getTime())) return raw
  const zone = text(reminder.timeZone)
  try {
    return new Intl.DateTimeFormat(undefined, zone === '' ? DATE_TIME : { ...DATE_TIME, timeZone: zone }).format(date)
  } catch {
    // An unknown IANA zone must still render the instant rather than fail the whole list.
    return new Intl.DateTimeFormat(undefined, DATE_TIME).format(date)
  }
}

/**
 * Mount the reminder list in a container element.
 *
 * @param {object} options
 * @param {Element} options.container - element the section is appended to.
 * @returns {{ refresh: () => Promise<void>, dispose: () => void }} `refresh` re-reads the API
 *   (also used for the SSE change event); `dispose` removes the section and ignores late replies.
 */
export function createRemindersView(options = {}) {
  const { container } = options ?? {}
  if (!container || typeof container.append !== 'function' || typeof container.ownerDocument?.createElement !== 'function') {
    throw new TypeError('fishball-native-app: a container element is required')
  }
  const document = container.ownerDocument
  const root = document.createElement('section')
  root.className = CLASS.root
  const heading = document.createElement('h2')
  heading.className = CLASS.heading
  heading.textContent = COPY.heading
  const status = document.createElement('p')
  status.className = CLASS.status
  status.setAttribute(ARIA.role, ARIA.status)
  const summary = document.createElement('p')
  summary.className = CLASS.summary
  const list = document.createElement('ul')
  list.className = CLASS.list
  const empty = document.createElement('p')
  empty.className = CLASS.empty
  empty.textContent = COPY.empty
  empty.hidden = true
  root.append(heading, status, summary, list, empty)
  container.append(root)

  // Disposal and the generation counter keep a reply from an older refresh away from the DOM.
  let disposed = false
  let generation = 0

  function setStatus(message) {
    status.textContent = message
    status.hidden = message === ''
  }

  function setBusy(busy) {
    root.setAttribute(ARIA.busy, busy ? ARIA.true : ARIA.false)
  }

  async function refresh() {
    if (disposed) return
    const current = ++generation
    setBusy(true)
    setStatus(COPY.loading)
    try {
      const response = await fetch(API.path, { method: API.read, headers: { accept: API.media }, cache: 'no-store' })
      if (!response.ok) throw new Error(String(response.status))
      const page = await response.json()
      if (!Array.isArray(page?.items)) throw new TypeError('reminders: the list response has no items')
      if (disposed || current !== generation) return
      render(page)
      setStatus('')
    } catch {
      if (disposed || current !== generation) return
      setStatus(COPY.loadFailed)
    } finally {
      if (!disposed && current === generation) setBusy(false)
    }
  }

  function render(page) {
    list.replaceChildren(...page.items.map(renderReminder))
    empty.hidden = page.items.length !== 0
    summary.textContent = Number.isSafeInteger(page.total) && page.total > page.items.length
      ? COPY.showing(page.items.length, page.total)
      : ''
  }

  function renderReminder(reminder) {
    const title = text(reminder.title)
    const item = document.createElement('li')
    item.className = CLASS.item
    item.setAttribute('data-reminder-id', text(reminder.id))
    const name = document.createElement('span')
    name.className = CLASS.name
    name.textContent = title
    const when = document.createElement('time')
    when.className = CLASS.when
    when.dateTime = text(reminder.scheduledAt)
    when.textContent = formatWhen(reminder)
    when.title = text(reminder.scheduledAt)
    const state = document.createElement('span')
    state.className = CLASS.state
    state.textContent = Object.hasOwn(COPY.status, reminder.status) ? COPY.status[reminder.status] : text(reminder.status)
    const prompt = document.createElement('span')
    prompt.className = CLASS.prompt
    prompt.textContent = clamp(text(reminder.prompt))
    const action = document.createElement('button')
    action.type = 'button'
    action.className = CLASS.action
    // Paused and ended reminders cannot fire again; deleting them is the same request with a
    // label that says what the user is doing.
    const cancellable = reminder.status === STATUS.active
    action.textContent = cancellable ? COPY.cancel : COPY.delete
    action.setAttribute(ARIA.label, cancellable ? COPY.cancelName(title) : COPY.deleteName(title))
    action.addEventListener('click', () => { void cancel(text(reminder.id), action) })
    item.append(name, when, state, prompt, action)
    return item
  }

  async function cancel(id, action) {
    if (disposed) return
    action.disabled = true
    try {
      const response = await fetch(API.path, {
        method: API.write,
        headers: { accept: API.media, 'content-type': API.media },
        body: JSON.stringify({ action: API.action, id }),
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(String(response.status))
      // A miss (an already removed reminder) is also a successful outcome; the re-read shows it.
      await refresh()
    } catch {
      if (disposed) return
      setStatus(COPY.cancelFailed)
      action.disabled = false
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    root.remove()
  }

  void refresh()
  return Object.freeze({ refresh, dispose })
}
