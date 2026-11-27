/**
 * A process-wide record of outbound network attempts, for "refused before any request; no TCP
 * connection opened" (REM-EP-01 row 6). It listens on Node's public diagnostics channels, so it
 * sees `fetch` (undici), `node:http(s)` and raw `net` sockets alike, whatever the link uses:
 * - `undici:request:create`: a fetch request's origin;
 * - `http.client.request.start`: a node:http(s) request's host;
 * - `net.client.socket`: a client socket; its `lookup` (DNS name) and `connectionAttempt` (address)
 *   events give the host it dials.
 * The link runs in this process (unit level), so its attempts are recorded here.
 */
import dc from 'node:diagnostics_channel'

const CHANNEL = Object.freeze({
  undici: 'undici:request:create',
  http: 'http.client.request.start',
  socket: 'net.client.socket',
})
const KIND = Object.freeze({ request: 'request', lookup: 'lookup', connect: 'connect' })

const attempts = []
let installed = false

const hostOf = (origin) => { try { return new URL(origin).hostname } catch { return String(origin) } }
/** `[::1]` and `::1` name one host; compare without brackets. */
const bare = (host) => String(host ?? '').replace(/^\[|\]$/g, '').toLowerCase()

function install() {
  if (installed) return
  installed = true
  dc.subscribe(CHANNEL.undici, ({ request }) => attempts.push({ kind: KIND.request, host: bare(hostOf(request.origin)), at: Date.now() }))
  dc.subscribe(CHANNEL.http, ({ request }) => attempts.push({ kind: KIND.request, host: bare(request.host), at: Date.now() }))
  dc.subscribe(CHANNEL.socket, ({ socket }) => {
    socket.once('lookup', (error, address, family, host) => attempts.push({ kind: KIND.lookup, host: bare(host), at: Date.now() }))
    socket.on('connectionAttempt', (address, port) => attempts.push({ kind: KIND.connect, host: bare(address), port, at: Date.now() }))
  })
}

/**
 * Starts recording (idempotent), then waits until a full `quietMs` passes with no attempt at all, so
 * traffic an earlier test's teardown started (a stopped client's last cancellation, a reconnect)
 * cannot be counted against this one. The wait is bounded by `settleMs`; then it returns a window of
 * the attempts recorded from that point on.
 */
export async function watchNetwork({ quietMs, settleMs }) {
  install()
  const end = Date.now() + settleMs
  for (let seen = attempts.length; ; seen = attempts.length) {
    await new Promise((resolve) => setTimeout(resolve, quietMs))
    if (attempts.length === seen || Date.now() >= end) break
  }
  const since = attempts.length
  return {
    /** Every attempt since the window opened. */
    all: () => attempts.slice(since),
    /** Attempts that name `host` (a DNS name or an address). */
    to: (host) => attempts.slice(since).filter((a) => a.host === bare(host)),
  }
}
