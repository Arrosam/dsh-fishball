/**
 * Core's link, faked to the public API the façade may use (v3-w3-briefs.md O4: `tools()`,
 * `onTools`, `callTool`, `onStatus`; F-LINK's contract as test/v3/fishball-core/link/link-driver.mjs names it):
 *
 *   tools()                → the MCP tool descriptors of the last `tools/list` (K1 core tools plus
 *                            the contributed ones, as the target connector lists them)
 *   onTools(fn)            → dispose; `fn(tools)` after every `tools/list_changed` re-list
 *   status()               → K3 TargetStatus `{state, code?}`
 *   onStatus(fn)           → dispose; `fn(status)` on every change
 *   callTool(name, args)   → Promise<structuredContent>. While the link is not connected it
 *                            resolves `{ok: false, code: 'disconnected'}` (K1 LINK_REFUSAL) and
 *                            nothing reaches the connector (design §6.3, R-REM-04).
 *
 * Every call is recorded with whether it reached the connector, so an oracle can say "no request".
 */
import { FIXTURE, K1 } from './constants.mjs'

const copy = (value) => structuredClone(value)

export class FakeLink {
  #tools
  #status
  #toolListeners = new Set()
  #statusListeners = new Set()
  /** `answers[name](args)` gives a tool's structuredContent; the default echoes a marker. */
  constructor({ tools, status = K1.connected, answers = {} }) {
    this.#tools = copy(tools)
    this.#status = { ...status }
    this.answers = answers
    /** `{name, args, sent}`: every callTool, `sent` false when the link was down. */
    this.calls = []
  }

  tools() { return copy(this.#tools) }
  onTools(fn) { this.#toolListeners.add(fn); return () => this.#toolListeners.delete(fn) }
  status() { return { ...this.#status } }
  onStatus(fn) { this.#statusListeners.add(fn); return () => this.#statusListeners.delete(fn) }

  /** The connector sent `tools/list_changed` and the link re-listed `tools`. */
  listChanged(tools) {
    this.#tools = copy(tools)
    for (const fn of this.#toolListeners) fn(this.tools())
  }
  setStatus(status) {
    this.#status = { ...status }
    for (const fn of this.#statusListeners) fn(this.status())
  }

  async callTool(name, args = {}) {
    const sent = this.#status.state === K1.connected.state
    this.calls.push({ name, args: copy(args), sent })
    if (!sent) return { ok: false, code: K1.disconnected }
    return this.answers[name]?.(args) ?? { ok: true, result: FIXTURE.resultMarker + ' ' + name }
  }
  /** Calls that reached the connector, optionally of one tool. */
  sent(name) { return this.calls.filter((c) => c.sent && (name === undefined || c.name === name)) }
}
