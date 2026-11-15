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
 *    `subscriptions/listen` stream on `dsh-agent://events` and tool-list changes;
 * 5. one `inbox_poll` on every (re)connect and on every events hint (hints may drop; polls
 *    recover them, design §6.5).
 * A failure is classified (`failureStatus`) and retried with bounded backoff; Fishball keeps
 * running whatever the link does (R-FB-04, R-REM-04). A blank or refused target and a missing
 * token are not retried: nothing changes until the caller's `reconnect()` after a settings change.
 *
 * Status while not connected (the user's decision, 2026-11-14): `stop()` and `reconnect()` turn a
 * `connected` status into `target-unreachable` / `TARGET_UNREACHABLE` until the next attempt
 * classifies; any other status is kept. There is no "connecting" word (K3 `TargetState`).
 *
 * Every request goes through one fetch wrapper that refuses any URL outside the target origin and
 * follows no redirect, so neither the client secret nor an access token can reach another origin
 * (design §6.3 "credentials are never forwarded on a redirect").
 *
 * The pairing gate (F-PAIR, AUTH-UC-05 E1): an optional `gate` decides, per attempt, before any
 * request (`hold`) and between `tools/list` and `subscriptions/listen` (`admit`), whether the link
 * may go on. A held attempt closes its client, reports the gate's status and is not retried, so
 * nothing more reaches the target until the caller's `reconnect()`. The gate also says whether a
 * refused credential was paired before (`paired`), which turns `TOKEN_REFUSED` into
 * `token-revoked` (status rule 4a). The link knows nothing about pairing beyond these three calls.
 *
 * What the link does **not** do: pairing and names (F-PAIR, through the gate), acking and
 * dispatching events (F-INTERCEPT), the bridge façade (F-FACADE), the status display (F-STATUS),
 * wiring (F-WIRE).
 */
import { LINK, LINK_BACKOFF, MCP } from '../../contracts/constants.js'
import { LINK_MCP } from './constants.js'
import { checkTarget } from './target.js'
import { OffTargetRequest, STATUS, failureStatus } from './status.js'
import { emitIsolated, subscribe } from './listeners.js'

/** Delay before the n-th consecutive retry (from 0), bounded by `LINK_BACKOFF.maxMs`. */
export const backoffDelayMs = (attempt) => Math.min(LINK_BACKOFF.initialMs * LINK_BACKOFF.factor ** attempt, LINK_BACKOFF.maxMs)

/** The connection failed in a way `failureStatus` cannot see from the error alone. */
class LinkFailure extends Error {
  constructor(status) {
    super(status.code)
    this.status = status
  }
}

/** The pairing gate held the attempt: reported like a failure, but never retried. */
class LinkHold extends LinkFailure {}

/**
 * A tool call's `structuredContent` (`undefined` when the result carries none). `signal`, when
 * given, is the SDK's per-request `RequestOptions.signal`: aborting it rejects the call.
 */
const callStructured = async (client, name, args, signal) => (await client.callTool({ name, arguments: args }, signal === undefined ? undefined : { signal })).structuredContent

/** Admits every attempt: the link without pairing (F-LINK's behaviour). */
const OPEN_GATE = Object.freeze({ hold: () => null, admit: async () => null, paired: async () => false })

/**
 * @typedef {object} LinkOptions
 * @property {() => unknown} target the configured target URL (R-FB-03)
 * @property {() => Promise<{clientId: string, secret: string, ref?: string} | null | undefined>} credentials
 *   the fishball id, the token value and, for the gate, the token's non-secret reference; `null`,
 *   `undefined` or an empty secret is "no token"
 * @property {PairingGate} [gate] the pairing gate; defaults to one that admits every attempt
 * @property {object} [sdk] the `@modelcontextprotocol/client` module; defaults to core's packaged
 *   copy (§9.1). A caller may pass another 2.2.x copy (both hosts' copies are byte-identical).
 * @property {typeof fetch} [fetch] the network fetch; defaults to the global one
 * @property {(fn: () => void, ms: number) => unknown} [setTimer] defaults to `setTimeout`
 * @property {(handle: unknown) => void} [clearTimer] defaults to `clearTimeout`
 */

/**
 * @typedef {{origin: string, clientId: string, ref: string | undefined}} LinkAttempt what one
 *   attempt connects with: the target origin, the fishball id and the token reference; never the secret
 * @typedef {object} PairingGate
 * @property {(attempt: LinkAttempt) => {state: string, code: string | null} | null | Promise<{state: string, code: string | null} | null>} hold
 *   before any request: a status holds the attempt (no request at all), `null` lets it connect
 * @property {(attempt: LinkAttempt, session: {scope: string | undefined, call: (name: string, args?: object) => Promise<unknown>}) => Promise<{state: string, code: string | null} | null>} admit
 *   after `tools/list`: `scope` is the access token's granted scope, `call` reaches this attempt's
 *   client (resolving to `structuredContent`); a status holds the attempt, `null` lets it listen.
 *   A rejection fails the attempt like any other failure (classified, retried)
 * @property {(attempt: LinkAttempt) => Promise<boolean>} paired whether the target refused a
 *   credential the gate holds a paired record for (status rule 4a)
 */

export class McpLink {
  #options
  #status = STATUS.unset
  #listeners = { status: new Set(), poll: new Set(), tools: new Set() }
  #generation = 0
  #failures = 0
  #timer
  // The attempt's client from its creation, so a stop or restart mid-attempt closes it too.
  #client
  // The client of the open link only: set once the listen stream is acknowledged, cleared on any
  // teardown. Calls and polls go through it alone, so nothing is sent on a half-made connection.
  #connected
  #subscription
  #tools = Object.freeze([])
  #started = false

  /** @param {LinkOptions} options */
  constructor(options) {
    this.#options = {
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle),
      fetch: (...args) => globalThis.fetch(...args),
      gate: OPEN_GATE,
      ...options,
    }
  }

  /** `{state, code}` as K3's `TargetStatus`. */
  status() { return this.#status }

  /** The target's tools as last listed (core tools first, then contributed ones, R-EXT-12). */
  tools() { return this.#tools }

  /** Calls `fn(status)` after each status change. Returns its disposer. A throwing listener affects no other. */
  onStatus(fn) { return subscribe(this.#listeners.status, fn) }

  /** Calls `fn(result)` with each `inbox_poll` result (`structuredContent`) the link fetched. */
  onPoll(fn) { return subscribe(this.#listeners.poll, fn) }

  /** Calls `fn(tools)` after each `tools/list` the link made. */
  onTools(fn) { return subscribe(this.#listeners.tools, fn) }

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

  /** Stops the link: no request is sent and no status is emitted after this. */
  async stop() {
    this.#started = false
    this.#generation += 1
    this.#cancelTimer()
    this.#leaveConnected()
    await this.#teardown()
  }

  /**
   * Calls one tool of the target and resolves to its `structuredContent` (`undefined` when the
   * result carries none). While the link is not connected it sends nothing and resolves
   * `{ok: false, code: 'disconnected'}`: the answer never reached the connector, and the offer
   * waits there (design §6.3, R-REM-04). A call that fails after it was sent rejects: whether it
   * reached the connector is then unknown, and the caller decides (K3 `commit` treats a rejected
   * send as `disconnected`). An aborted `signal` rejects the call like any failure after sending
   * (F-FACADE: a caller that gives up on a call).
   * @param {string} name
   * @param {object} [args]
   * @param {{signal?: AbortSignal}} [options]
   */
  async callTool(name, args = {}, { signal } = {}) {
    const client = this.#connected
    if (client === undefined) return { ok: false, code: LINK.disconnected }
    return callStructured(client, name, args, signal)
  }

  #setStatus(next) {
    if (next === this.#status) return
    this.#status = next
    emitIsolated(this.#listeners.status, next)
  }

  /** The user's decision: a link that stops being connected says so until it is classified again. */
  #leaveConnected() {
    if (this.#status === STATUS.connected) this.#setStatus(STATUS.unreachable)
  }

  #restart() {
    this.#failures = 0
    this.#cancelTimer()
    this.#leaveConnected()
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
    this.#connected = undefined
    // Closing is best effort: the peer may already be gone.
    await subscription?.close().catch(() => {})
    await client?.close().catch(() => {})
  }

  #current(generation) { return this.#started && generation === this.#generation }

  /**
   * One connection attempt. It never rejects. Every await is followed by a generation check, so an
   * attempt overtaken by `stop()` or `reconnect()` neither emits a status nor schedules a retry.
   */
  async #attempt(generation) {
    if (!this.#current(generation)) return
    const seen = { mcpStatus: undefined }
    let attempt
    try {
      const target = checkTarget(this.#options.target())
      if (!target.ok) return this.#setStatus(target.status)
      const credentials = await this.#options.credentials()
      if (!this.#current(generation)) return
      if (!credentials?.secret) return this.#setStatus(STATUS.unset)
      attempt = Object.freeze({ origin: target.origin, clientId: credentials.clientId, ref: credentials.ref })
      const held = await this.#options.gate.hold(attempt)
      if (!this.#current(generation)) return
      if (held) return this.#setStatus(held)
      const sdk = await this.#sdk()
      if (!this.#current(generation)) return
      const client = await this.#connect(sdk, target, credentials, attempt, seen, generation)
      if (!this.#current(generation)) return
      this.#connected = client
      this.#failures = 0
      this.#setStatus(STATUS.connected)
      void this.#poll(generation)
    } catch (error) {
      if (!this.#current(generation)) return
      await this.#teardown()
      if (!this.#current(generation)) return
      const status = await this.#failed(error, attempt, seen)
      if (!this.#current(generation)) return
      this.#setStatus(status)
      if (!(error instanceof LinkHold)) this.#retryLater(generation)
    }
  }

  /** The status of a failed or held attempt (status rules 2, 4, 4a, 6, or the gate's hold). */
  async #failed(error, attempt, seen) {
    if (error instanceof LinkFailure) return error.status
    // Without a loaded client module (a broken install) every failure is `target-unreachable`.
    const status = failureStatus(this.#options.sdk ?? {}, error, seen.mcpStatus)
    if (status !== STATUS.refused || attempt === undefined) return status
    // A gate that cannot read its records keeps the plain refusal: the target's answer stands.
    const paired = await this.#options.gate.paired(attempt).catch(() => false)
    return paired ? STATUS.revoked : status
  }

  /** Core's packaged MCP client (design §9.1), unless the caller supplied one. */
  async #sdk() {
    this.#options.sdk ??= await import(LINK_MCP.clientPackage)
    return this.#options.sdk
  }

  async #connect(sdk, target, credentials, attempt, seen, generation) {
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
    // A failed re-list keeps the previous list; the next change or (re)connect lists again.
    client.setNotificationHandler(LINK_MCP.toolsListChanged, () => { this.#listTools(client, generation).catch(() => {}) })
    this.#client = client
    await client.connect(transport)
    await this.#listTools(client, generation)
    // An attempt overtaken by stop() or reconnect() asks the gate nothing: `admit` may send `pair`.
    if (!this.#current(generation)) return client
    // The gate sees the attempt between the tool list and the listen stream: nothing that needs a
    // full access token has been sent yet, and a held attempt sends nothing more (AUTH-UC-05 E1).
    const held = await this.#options.gate.admit(attempt, {
      scope: provider.tokens()?.scope,
      call: (name, args = {}) => callStructured(client, name, args),
    })
    if (held) throw new LinkHold(held)
    // `admit` may have waited on `pair`: an attempt overtaken meanwhile sends no listen request.
    if (!this.#current(generation)) return client
    const subscription = await client.listen({ resourceSubscriptions: [LINK_MCP.eventsUri], toolsListChanged: true })
    this.#subscription = subscription
    // Connected means a listen stream on agent-events (K3 TargetState). A V3 connector always
    // honours it, so a target that does not is not one (the user's decision, 2026-11-14).
    if (!subscription.honoredFilter?.resourceSubscriptions?.includes(LINK_MCP.eventsUri)) throw new LinkFailure(STATUS.incompatible)
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
    emitIsolated(this.#listeners.tools, this.#tools)
  }

  async #poll(generation) {
    const client = this.#connected
    if (client === undefined || !this.#current(generation)) return
    let result
    try {
      result = await callStructured(client, MCP.tools.inboxPoll, {})
    } catch {
      // A failed poll loses nothing: pending events stay at the connector until acked, and the
      // next (re)connect or hint polls again.
      return
    }
    if (this.#current(generation)) emitIsolated(this.#listeners.poll, result)
  }

  /**
   * The listen stream ended without our asking. The link is down until the next attempt, which
   * runs after the backoff delay. The failure count restarts at every successful connect, so a
   * target that keeps accepting and then closing the stream is retried every `LINK_BACKOFF.initialMs`.
   */
  #lost(generation, subscription) {
    if (!this.#current(generation) || this.#subscription !== subscription) return
    const next = ++this.#generation
    this.#setStatus(STATUS.unreachable)
    void this.#teardown().then(() => { if (this.#current(next)) this.#retryLater(next) })
  }

  #retryLater(generation) {
    this.#cancelTimer()
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
