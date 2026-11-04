/**
 * The shell's only job at T03 is to prove the authenticated page and its SSE stream are live.
 *
 * This is a same-origin /ui/ file, not inline code: the shell must satisfy the §3.3 CSP
 * (default-src 'self', with no hashes or nonces) both at the child's "/" and behind the broker's
 * "/fishball/embed/". The chat timeline and composer arrive in a later task.
 */
const COPY = {
  connected: { status: 'Connected', message: 'Fishball is ready.' },
  reconnecting: { status: 'Reconnecting…', message: 'Connection lost. Reconnecting…' },
}
const status = document.getElementById('status')
const message = document.getElementById('message')
function show(state) {
  const next = COPY[state]
  status.textContent = next.status
  status.dataset.state = state
  message.textContent = next.message
}
// Relative, so one shell works both directly at the child's "/" and under the broker's
// "/fishball/embed/" document URL (§3.1). EventSource reconnects on its own; no token or URL
// capability is ever added here.
const events = new EventSource('api/events')
events.addEventListener('open', () => show('connected'))
events.addEventListener('error', () => show('reconnecting'))
