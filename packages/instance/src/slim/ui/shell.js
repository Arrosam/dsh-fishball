/**
 * The slim shell's composition root (T07).
 *
 * It owns the page's one EventSource and wires the views that live inside the child app: the
 * chat (T07), the reminder list (T10) and the approvals view inside the chat (T09). The chat
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

const COPY = { reconnecting: 'Reconnecting…' }

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

// Relative, so one shell works directly at the child's "/" and under the broker's
// "/fishball/embed/" document URL (Section 3.1). EventSource reconnects on its own.
const events = new EventSource('api/events')
// The views read once when they mount; after a drop, a reconnect must re-read what changed
// while the stream was down, or the page would show a gap in the conversation.
let opened = false

events.addEventListener('open', () => {
  showConnection(true)
  if (opened) {
    void chat.refresh()
    void reminders.refresh()
  }
  opened = true
})

events.addEventListener('error', () => showConnection(false))

events.addEventListener('reminders', () => { void reminders.refresh() })

// The approvals event says only "something changed"; the view re-reads its snapshot, so the
// card the user is typing into is left alone unless the child's data actually changed.
events.addEventListener(APPROVALS_EVENT, () => { void chat.refreshApprovals() })

events.addEventListener('chat', (event) => {
  let payload
  try { payload = JSON.parse(event.data) } catch { return }
  chat.apply(payload)
})
