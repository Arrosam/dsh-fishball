/**
 * The slim shell's composition root (T07).
 *
 * It owns the page's one EventSource and wires the views that live inside the child app: the
 * chat (T07), the reminder list (T10), the approvals view inside the chat (T09) and the settings
 * view (I6), which the page shows instead of the chat at `?view=settings`. The chat
 * view receives each SSE chat frame; the reminder view re-reads its list when the child says
 * reminders changed; the approvals view re-reads its snapshot on its own event, so no view opens
 * a second stream (Section 3.6).
 *
 * Everything here is a same-origin /ui/ file: the CSP (default-src 'self') admits no inline
 * script or style, and the relative URLs keep the same page working under the broker.
 */
import { APPROVALS_EVENT } from './approvals.js'
import { createChatView } from './chat.js'
import { createRemindersView } from './reminders.js'
import { createSettingsView } from './settings.js'

const COPY = { reconnecting: 'Reconnecting…' }
/**
 * The header actions' words, English and Chinese (D30's rule: the first `lang` parameter, exactly
 * `zh`); I9 moves them into the page's dictionaries.
 */
const VIEW_COPY = Object.freeze({
  en: Object.freeze({ settings: 'Settings', back: 'Back to chat' }),
  zh: Object.freeze({ settings: '设置', back: '返回聊天' }),
})
/**
 * The view switch (design §0.5 "Settings view"): only the first `view` parameter with the exact
 * lowercase value `settings` selects the settings view; anything else shows the chat. Every other
 * parameter (K2's `lang` among them) is kept as it is when the view changes.
 */
const VIEW = Object.freeze({ param: 'view', settings: 'settings', langParam: 'lang', zh: 'zh' })
const VIEW_CLASS = Object.freeze({ action: 'header-action' })

/**
 * DSH's palette switch (dsh-client-ui-theme ThemePresenter): dark is the body attribute that
 * ui/dsh-tokens.css keys its dark tokens on. The page cannot read DSH's own choice across the
 * frame (D27), so until §0.9 U3 is decided it follows the OS scheme, which is what DSH shows
 * with its default `system` preference, and it follows a change live.
 */
const THEME = Object.freeze({ darkAttribute: 'data-ds-dark-theme', darkQuery: '(prefers-color-scheme: dark)' })

const darkScheme = window.matchMedia(THEME.darkQuery)
function applyScheme() { document.body.toggleAttribute(THEME.darkAttribute, darkScheme.matches) }
applyScheme()
darkScheme.addEventListener('change', applyScheme)

// No permanent status tag (D27: the connector's frame shows Fishball's state); a lost stream
// shows the §11 banner only while it lasts.
const banner = document.getElementById('connection-banner')

// The text is written when the banner appears, so its live region announces the loss.
function showConnection(connected) {
  banner.textContent = connected ? '' : COPY.reconnecting
  banner.hidden = connected
}

const chat = createChatView({
  container: document.getElementById('chat'),
  modelSlot: document.getElementById('model-picker'),
})
const reminders = createRemindersView({ container: document.getElementById('reminders') })

const viewCopy = new URLSearchParams(location.search).get(VIEW.langParam) === VIEW.zh ? VIEW_COPY.zh : VIEW_COPY.en
const chatLayout = document.querySelector('.layout')
const modelPicker = document.getElementById('model-picker')
const settingsPage = document.getElementById('settings')
const headerActions = document.getElementById('header-actions')
/** Built on first open, so a page that never opens settings sends no admin request. */
let settings

const settingsSelected = () => new URLSearchParams(location.search).get(VIEW.param) === VIEW.settings

/** Show one view and its header action; the chat's pickers belong to the chat only. */
function showView() {
  const open = settingsSelected()
  chatLayout.hidden = open
  modelPicker.hidden = open
  settingsPage.hidden = !open
  if (open && settings === undefined) settings = createSettingsView({ container: settingsPage })
  const action = document.createElement('button')
  action.type = 'button'
  action.className = VIEW_CLASS.action
  action.textContent = open ? viewCopy.back : viewCopy.settings
  action.addEventListener('click', () => switchView(!open))
  headerActions.replaceChildren(action)
}

/**
 * Settings writes `view=settings`, Back removes the parameter, both with replaceState (§0.5), so
 * a reload keeps the view and the frame's history gains no entry.
 */
function switchView(open) {
  // A view built by this switch reads its blocks itself; an existing one re-reads on reopen.
  const built = settings !== undefined
  const url = new URL(location.href)
  if (open) url.searchParams.set(VIEW.param, VIEW.settings)
  else url.searchParams.delete(VIEW.param)
  history.replaceState(history.state, '', url)
  showView()
  if (open && built) void settings.refresh()
}
showView()

// Relative, so one shell works directly at the child's "/" and under the broker's
// "/fishball/embed/" document URL (Section 3.1). EventSource reconnects on its own.
const events = new EventSource('api/events')
// The views read once when they mount; after a drop, a reconnect must re-read what changed
// while the stream was down, or the page would show a gap in the conversation.
let opened = false

events.addEventListener('open', () => {
  showConnection(true)
  settings?.connected(true)
  if (opened) {
    void chat.refresh()
    void reminders.refresh()
  }
  opened = true
})

events.addEventListener('error', () => {
  showConnection(false)
  settings?.connected(false)
})

events.addEventListener('reminders', () => { void reminders.refresh() })

// The approvals event says only "something changed"; the view re-reads its snapshot, so the
// card the user is typing into is left alone unless the child's data actually changed.
events.addEventListener(APPROVALS_EVENT, () => { void chat.refreshApprovals() })

events.addEventListener('chat', (event) => {
  let payload
  try { payload = JSON.parse(event.data) } catch { return }
  chat.apply(payload)
})
