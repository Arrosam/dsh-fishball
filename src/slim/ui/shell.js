/**
 * The slim shell's composition root (T07).
 *
 * It owns the page's one EventSource and wires the two views that live inside the child app:
 * the chat (this task) and the reminder list (T10). The chat view receives each SSE chat frame;
 * the reminder view re-reads its list when the child says reminders changed, so neither view
 * opens a second stream (Section 3.6).
 *
 * Everything here is a same-origin /ui/ file: the CSP (default-src 'self') admits no inline
 * script or style, and the relative URLs keep the same page working under the broker.
 */
import { createChatView } from './chat.js'
import { createRemindersView } from './reminders.js'

const COPY = {
  connected: { status: 'Connected', message: 'Fishball is ready.' },
  reconnecting: { status: 'Reconnecting…', message: 'Connection lost. Reconnecting…' },
}

const status = document.getElementById('status')

function show(state) {
  const next = COPY[state]
  status.textContent = next.status
  status.dataset.state = state
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
  show('connected')
  if (opened) {
    void chat.refresh()
    void reminders.refresh()
  }
  opened = true
})

events.addEventListener('error', () => show('reconnecting'))

events.addEventListener('reminders', () => { void reminders.refresh() })

events.addEventListener('chat', (event) => {
  let payload
  try { payload = JSON.parse(event.data) } catch { return }
  chat.apply(payload)
})
