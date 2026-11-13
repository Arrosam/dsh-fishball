/**
 * Core's one logical MCP link to its target connector (task F-LINK; design §5.8 steps 1–2, §6.3,
 * §6.5; requirements R-FB-03, R-FB-04, R-FB-05, R-REM-04, R-OA-19; cases REM-EP-01, REM-DT-01,
 * REM-UC-02).
 *
 * One attempt, in order:
 * 1. the target URL rule (`checkTarget`), before anything else, so a refused URL causes no request
 *    and no token read;
 * 2. the credentials: `{clientId, secret}` (hosted: in memory from the lifecycle wire; standalone:
 *    `ctx.credentials.resolve`, design §6.3), with nothing to connect with reported `target-unset`;
 * 3. the stock `ClientCredentialsProvider` with `expectedIssuer` pinned to the target origin's K1
 *    issuer, so the secret goes only to that origin's token endpoint (spike S7 T4);
 * 4. `server/discover` at the pinned revision (modern only, Q12), `tools/list`, then a
 *    `subscriptions/listen` stream on `fishball://events` and tool-list changes;
 * 5. one `inbox_poll` on every (re)connect and on every events hint (hints may drop; polls
 *    recover them, design §6.5).
 * A failure is classified (`failureStatus`) and retried with bounded backoff; Fishball keeps
 * running whatever the link does (R-FB-04, R-REM-04).
 *
 * Every request goes through one fetch wrapper that refuses any URL outside the target origin and
 * follows no redirect, so neither the client secret nor an access token can reach another origin
 * (design §6.3 "credentials are never forwarded on a redirect").
 *
 * What the link does **not** do: pairing and names (F-PAIR), acking and dispatching events
 * (F-INTERCEPT), the bridge façade (F-FACADE), the status display (F-STATUS), wiring (F-WIRE).
 */
import { TOOL } from './schema.js'
import { BACKOFF, LINK_MCP, LINK_REFUSAL } from './constants.js'
import { checkTarget } from './target.js'
import { STATUS, failureStatus, refusedTarget } from './status.js'

/** Delay before the n-th consecutive retry (from 0), bounded by `BACKOFF.maxMs`. */
export const backoffDelayMs = (attempt) => Math.min(BACKOFF.initialMs * BACKOFF.factor ** attempt, BACKOFF.maxMs)

/** Why a request is refused locally; it never leaves the process. */
class OffTargetRequest extends Error {}

/**
 * @typedef {object} LinkOptions
 * @property {() => unknown} target the configured target URL (R-FB-03)
 * @property {() => Promise<{clientId: string, secret: string} | null | undefined>} credentials
 *   the fishball id and the token value; `null`, `undefined` or an empty secret is "no token"
 * @property {object} [sdk] the `@modelcontextprotocol/client` module; defaults to core's packaged
 *   copy (§9.1). A caller may pass another 2.2.x copy (both hosts' copies are byte-identical).
 * @property {typeof fetch} [fetch] the network fetch; defaults to the global one
 * @property {(fn: () => void, ms: number) => unknown} [setTimer] defaults to `setTimeout`
 * @property {(handle: unknown) => void} [clearTimer] defaults to `clearTimeout`
 */

export class McpLink {
  #options
  #status = STATUS.unset
  #listeners = { status: new Set(), poll: new Set(), tools: new Set() }
  #generation = 0
  #failures = 0
  #timer
  #client
  #subscription
  #tools = Object.freeze([])
  #started = false

  /** @param {LinkOptions} options */
  constructor(options) {
    this.#options = {
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle),
      fetch: (...args) => globalThis.fetch(...args),
      ...options,
    }
  }

  /** `{state, code}` as K3's `TargetStatus`. */
  status() { return this.#status }

  /** The target's tools as last listed (core tools first, then contributed ones, R-EXT-12). */
  tools() { return this.#tools }

  /** Calls `fn(status)` after each status change. Returns its disposer. */
  onStatus(fn) { return this.#subscribe(this.#listeners.status, fn) }

  /** Calls `fn(result)` with each `inbox_poll` result (`structuredContent`) the link fetched. */
  onPoll(fn) { return this.#subscribe(this.#listeners.poll, fn) }

  /** Calls `fn(tools)` after each `tools/list` the link made. */
  onTools(fn) { return this.#subscribe(this.#listeners.tools, fn) }

  /** Starts connecting. Idempotent. */
  start() {
    if (this.#started) return
    this.#started = true
    this.#restart()
  }

  /**
   * Drops the current connection and connects again at once with the current target and
   * credentials (a settings change, a new token). The backoff count starts over.
   */
  reconnect() {
    if (!this.#started) return this.start()
    this.#restart()
  }

  /** Stops the link: no request is sent after this. */
  async stop() {
    this.#started = false
    this.#generation += 1
    this.#cancelTimer()
    await this.#teardown()
  }

  /**
   * Calls one tool of the target and resolves to its `structuredContent`. While the link is not
   * connected it sends nothing and resolves `{ok: false, code: 'disconnected'}`: the answer never
   * reached the connector, and the offer waits there (design §6.3, R-REM-04). A call that fails
   * after it was sent rejects: whether it reached the connector is then unknown, and the caller
   * decides (K3 `commit` treats a rejected send as `disconnected`).
   * @param {string} name
   * @param {object} [args]
   */
  async callTool(name, args = {}) {
    const client = this.#connectedClient()
    if (client === undefined) return { ok: false, code: LINK_REFUSAL.disconnected }
    const result = await client.callTool({ name, arguments: args })
    return result.structuredContent
  }

  #connectedClient() { return this.#status === STATUS.connected ? this.#client : undefined }

  #subscribe(set, fn) {
    set.add(fn)
    return () => { set.delete(fn) }
  }

  #emit(set, value) { for (const fn of [...set]) fn(value) }

  #setStatus(next) {
    if (next === this.#status) return
    this.#status = next
    this.#emit(this.#listeners.status, next)
  }

  #restart() {
    this.#failures = 0
    this.#cancelTimer()
    const generation = ++this.#generation
    void this.#teardown().then(() => this.#attempt(generation))
  }

  #cancelTimer() {
    if (this.#timer !== undefined) this.#options.clearTimer(this.#timer)
    this.#timer = undefined
  }

  async #teardown() {
    const subscription = this.#subscription
    const client = this.#client
    this.#subscription = undefined
    this.#client = undefined
    // Closing is best effort: the peer may already be gone.
    await subscription?.close().catch(() => {})
    await client?.close().catch(() => {})
  }

  #current(generation) { return this.#started && generation === this.#generation }

  /** One connection attempt; stale attempts (an older generation) stop at their next step. */
  async #attempt(generation) {
    if (!this.#current(generation)) return
    const target = checkTarget(this.#options.target())
    // A refused or blank target is not retried: nothing changes until the user edits it.
    if (!target.ok) return this.#setStatus(target.code === null ? STATUS.unset : refusedTarget(target.code))
    const credentials = await this.#options.credentials()
    if (!this.#current(generation)) return
    if (!credentials?.secret) return this.#setStatus(STATUS.unset)
    const seen = { mcpStatus: undefined }
    try {
      const sdk = await this.#sdk()
      if (!this.#current(generation)) return
      await this.#connect(sdk, target, credentials, seen, generation)
      if (!this.#current(generation)) return
      this.#failures = 0
      this.#setStatus(STATUS.connected)
      void this.#poll(generation)
    } catch (error) {
      if (!this.#current(generation)) return
      await this.#teardown()
      // Without a loaded client module (a broken install) every failure is `target-unreachable`.
      this.#setStatus(failureStatus(this.#options.sdk ?? {}, error, seen.mcpStatus))
      this.#retryLater(generation)
    }
  }

  /** Core's packaged MCP client (design §9.1), unless the caller supplied one. */
  async #sdk() {
    this.#options.sdk ??= await import(LINK_MCP.clientPackage)
    return this.#options.sdk
  }

  async #connect(sdk, target, credentials, seen, generation) {
    const provider = new sdk.ClientCredentialsProvider({
      clientId: credentials.clientId,
      clientSecret: credentials.secret,
      expectedIssuer: target.issuer,
    })
    const transport = new sdk.StreamableHTTPClientTransport(target.url, {
      authProvider: provider,
      fetch: this.#guardedFetch(target, seen),
      onInsufficientScope: LINK_MCP.onInsufficientScope,
    })
    const client = new sdk.Client(LINK_MCP.clientInfo, { versionNegotiation: { mode: { pin: LINK_MCP.versionPin } } })
    client.setNotificationHandler(LINK_MCP.resourceUpdated, (notification) => {
      if (notification?.params?.uri === LINK_MCP.eventsUri) void this.#poll(generation)
    })
    client.setNotificationHandler(LINK_MCP.toolsListChanged, () => { void this.#listTools(client, generation) })
    // Held before connecting, so a stop or restart during the attempt closes it too.
    this.#client = client
    await client.connect(transport)
    await this.#listTools(client, generation)
    const subscription = await client.listen({ resourceSubscriptions: [LINK_MCP.eventsUri], toolsListChanged: true })
    if (!this.#current(generation)) return void subscription.close().catch(() => {})
    this.#subscription = subscription
    // Any end of the stream we did not cause ('graceful' included: a revocation closes it, R-TOK-05)
    // drops the link; the next attempt reports what the target says then.
    void subscription.closed.then(() => this.#lost(generation, subscription))
    return client
  }

  /** Fetch for this attempt: target origin only, no redirects, and the MCP URL's last status recorded. */
  #guardedFetch(target, seen) {
    return async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.origin !== target.origin) throw new OffTargetRequest(url.origin)
      const response = await this.#options.fetch(input, { ...init, redirect: LINK_MCP.redirect })
      if (url.pathname === target.url.pathname) seen.mcpStatus = response.status
      return response
    }
  }

  async #listTools(client, generation) {
    const { tools } = await client.listTools()
    if (!this.#current(generation)) return
    this.#tools = Object.freeze([...tools])
    this.#emit(this.#listeners.tools, this.#tools)
  }

  async #poll(generation) {
    const client = this.#connectedClient()
    if (client === undefined || !this.#current(generation)) return
    try {
      const result = await client.callTool({ name: TOOL.inboxPoll, arguments: {} })
      if (this.#current(generation)) this.#emit(this.#listeners.poll, result.structuredContent)
    } catch {
      // A failed poll loses nothing: pending events stay at the connector until acked, and the
      // next (re)connect or hint polls again.
    }
  }

  /**
   * The listen stream ended without our asking. The link is down until the next attempt, which
   * runs after the backoff delay (not at once), so a target that keeps closing the stream is
   * retried at a bounded rate.
   */
  #lost(generation, subscription) {
    if (!this.#current(generation) || this.#subscription !== subscription) return
    const next = ++this.#generation
    this.#setStatus(STATUS.unreachable)
    void this.#teardown().then(() => { if (this.#current(next)) this.#retryLater(next) })
  }

  #retryLater(generation) {
    const delay = backoffDelayMs(this.#failures)
    this.#failures += 1
    this.#timer = this.#options.setTimer(() => {
      this.#timer = undefined
      void this.#attempt(generation)
    }, delay)
  }
}

/** @param {LinkOptions} options */
export const createLink = (options) => new McpLink(options)
