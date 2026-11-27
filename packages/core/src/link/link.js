/**
 * Core's one logical MCP link to its target connector (task F-LINK; design §5.8 steps 1–2, §6.3,
 * §6.5; requirements R-FB-03, R-FB-04, R-FB-05, R-REM-04, R-OA-19; cases REM-EP-01, REM-DT-01,
 * REM-UC-02).
 *
 * One attempt, in order:
 * 1. the target URL rule (`checkTarget`), before anything else, so a refused URL causes no request
 *    and no token read;
 * 2. the credentials for the target (`credentials.js`, F-LINK-SAVE): a token, or a Connect grant;
 *    nothing to connect with is reported `target-unset`;
 * 3. a token goes through the stock `ClientCredentialsProvider` with `expectedIssuer` pinned to the
 *    target origin's K1 issuer, so the secret goes only to that origin's token endpoint (spike S7
 *    T4); a grant brings its own `authProvider` (access token only, refreshed by core's token
 *    manager); once the token endpoint accepted a token, `credentials.accepted()` saves it (R9);
 *    a refused credential is told so (`credentials.refused()`) before the status is reported;
 * 4. `server/discover` at the pinned revision (modern only, Q12), `tools/list`, the gate's `admit`,
 *    `tools/list` again (R-FIX F02: a first `pair` turns the pair-only list into the full one, and
 *    the connector sends no list change for it), `resources/list`, then a `subscriptions/listen`
 *    stream on `dsh-agent://events`, `dsh-agent://identity` (MULTI-1) and tool-list changes;
 * 4a. MULTI-1 (PLAN-MULTI §4.3): the server's name is the `_meta` `serverInfo.name` of a
 *    `server/discover` result: the connect-time one, then a rediscovery after every listen
 *    acknowledgement and on every `notifications/resources/updated` for the identity resource
 *    (coalesced, generation-fenced; `#rediscover`). No polling and no retry timer;
 * 5. a drain of the mailbox on every (re)connect and on every events hint (hints may drop; polls
 *    recover them, design §6.5): `inbox_poll` pages followed by `nextCursor` while `hasMore`, one
 *    drain at a time (R-FIX F03: one page per hint stranded a backlog above one page).
 * A failure is classified (`failureStatus`) and retried with bounded backoff; Fishball keeps
 * running whatever the link does (R-FB-04, R-REM-04). A blank or refused target and a missing
 * token are not retried: nothing changes until the caller's `reconnect()` after a settings change.
 * A call or poll of the open link that the target refuses as unauthenticated (the same
 * classification, R-FIX F04: an OAuth chain revoked under a live listen stream) ends the link
 * exactly as a refused attempt does: teardown, the credential's `refused()`, the refused status,
 * the backoff retry. Any other call failure leaves the link connected.
 *
 * Status while not connected (the user's decision, 2026-11-14): `stop()` and `reconnect()` turn a
 * `connected` status into `target-unreachable` / `TARGET_UNREACHABLE` until the next attempt
 * classifies; any other status is kept. There is no "connecting" word in the status (K3
 * `TargetState`); MULTI-1's `detail().connecting` says an attempt is in flight instead, from its
 * first request until it is classified (MULTI-0 `TargetView.connecting`).
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
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { LINK, LINK_BACKOFF, MCP } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { LINK_MCP, LINK_SAVE } from './constants.js'
import { checkTarget } from './target.js'
import { OffTargetRequest, STATUS, failureStatus } from './status.js'
import { emitIsolated, subscribe } from './listeners.js'

/**
 * Imports core's packaged MCP client (design §9.1). A failed import is logged on `logger` (the
 * error's code only, F-FIX-3) and rethrown: the caller still fails as before, but the log tells a
 * broken install from a target that cannot be reached. Not cached here: each caller keeps its own
 * module, so a later import is tried (and logged) again. Shared by the link and by the credentials'
 * Connect and saved grants (credentials.js `loadSdk`, E-FIX-3).
 * @param {{warn: Function}} [logger]
 */
export async function importMcpClient(logger) {
  try {
    return await import(LINK_MCP.clientPackage)
  } catch (error) {
    logger?.warn(LINK_SAVE.text.failed, LINK_MCP.clientImport, codeOf(error))
    throw error
  }
}

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

/**
 * The stock `ClientCredentialsProvider`, sending a refused secret once. The SDK's `auth()` answers
 * an `invalid_client` / `unauthorized_client` by calling `invalidateCredentials('client')` and
 * running the token request again with the same secret: a second request that cannot succeed and
 * counts twice against the target's failure limit (R-OA-17). Here the invalidation remembers the
 * refusal and the retry's `prepareTokenRequest` throws that same error before any request, so the
 * attempt fails with it and is classified `token-refused` as before (F-LINK-SAVE, Q-LS1 = A).
 */
const clientCredentialsOnce = (sdk, options) => new (class extends sdk.ClientCredentialsProvider {
  #refused = false
  invalidateCredentials(scope) {
    if (scope === LINK_MCP.invalidatedClient) this.#refused = true
  }
  prepareTokenRequest(scope) {
    if (this.#refused) throw new sdk.OAuthError(sdk.OAuthErrorCode.InvalidClient, LINK_MCP.refusedOnce)
    return super.prepareTokenRequest(scope)
  }
})(options)

/** Admits every attempt: the link without pairing (F-LINK's behaviour). */
const OPEN_GATE = Object.freeze({ hold: () => null, admit: async () => null, paired: async () => false })

/**
 * @typedef {object} LinkOptions
 * @property {() => unknown} target the configured target URL (R-FB-03)
 * @property {(target: {url: URL, origin: string}) => Promise<LinkCredentials | null | undefined>} credentials
 *   what one attempt connects with for the usable target (credentials.js `LinkCredentials`): the
 *   fishball id, the credential's non-secret `ref` (for the gate), and either a token (`secret`) or
 *   a grant's `authProvider` and `scope()`; optional `accepted()` / `refused()` hooks. `null`,
 *   `undefined`, or neither a secret nor an `authProvider` is "no credential"
 * @property {PairingGate} [gate] the pairing gate; defaults to one that admits every attempt
 * @property {object} [sdk] the `@modelcontextprotocol/client` module; defaults to core's packaged
 *   2.4.0 copy (§9.1). A caller may inject the 2.2.0 client shipped by either supported host.
 * @property {typeof fetch} [fetch] the network fetch; defaults to the global one
 * @property {{warn: Function}} [logger] the background log: warned once per failed import of the
 *   MCP client, with the error's code only
 * @property {(fn: () => void, ms: number) => unknown} [setTimer] defaults to `setTimeout`
 * @property {(handle: unknown) => void} [clearTimer] defaults to `clearTimeout`
 */

/**
 * @typedef {{origin: string, clientId: string, ref: string | undefined, kind: string | undefined}} LinkAttempt
 *   what one attempt connects with: the target origin, the fishball id, the credential's non-secret
 *   id and its kind (`CREDENTIAL_KIND`); never the secret
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

/** The live-identity capability words (MULTI-0 `TargetIdentityState`, `SEAM_TARGETS.identity`). */
const IDENTITY_STATE = SEAM_TARGETS.identity

/** The server's MCP `Implementation.name` in a `server/discover` result, or `undefined` (absent or malformed). */
const serverNameOf = (discover) => {
  const name = discover?._meta?.[LINK_MCP.serverInfoKey]?.name
  return typeof name === 'string' ? name : undefined
}

export class McpLink {
  #options
  #status = STATUS.unset
  #listeners = { status: new Set(), poll: new Set(), tools: new Set(), detail: new Set() }
  // MULTI-1 (PLAN-MULTI §4.3): the server's name as last discovered in this link's life (`null`
  // before the first), the identity capability, and whether an attempt is in flight. A failed or
  // malformed rediscovery keeps the last name (`stale`); there is no timer: the next hint or
  // (re)connect discovers again.
  #detail = Object.freeze({ serverName: null, identity: IDENTITY_STATE.pending, connecting: false })
  // The capability the open link found (`live` / `unsupported`), restored after a stale discovery.
  #capability
  // The rediscovery of the open link: one in flight, a hint meanwhile asks for one more.
  #discovering
  #generation = 0
  #failures = 0
  #timer
  // The attempt's client from its creation, so a stop or restart mid-attempt closes it too.
  #client
  // The client of the open link only: set once the listen stream is acknowledged, cleared on any
  // teardown. Calls and polls go through it alone, so nothing is sent on a half-made connection.
  #connected
  #subscription
  // What the open link connected with (its generation, attempt and credentials), so a refusal
  // after connecting is settled as the attempt's own (R-FIX F04).
  #open
  // The running mailbox drain, `{generation, again}` (R-FIX F03): one per link generation.
  #drainer
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

  /**
   * MULTI-1: `{serverName, identity, connecting}`: the server's last discovered MCP name (raw,
   * untrusted; `null` before any discovery), the live-identity capability (`SEAM_TARGETS.identity`)
   * and whether an attempt is in flight (`TargetView.connecting`).
   */
  detail() { return this.#detail }

  /** Calls `fn(detail)` after each change of `detail()`. Returns its disposer. */
  onDetail(fn) { return subscribe(this.#listeners.detail, fn) }

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
    this.#setDetail({ connecting: false })
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
    try {
      return await callStructured(client, name, args, signal)
    } catch (error) {
      this.#refusedWhileOpen(client, error)
      throw error
    }
  }

  /** Optional read-only probe: capability and result belong to the same live connection.
   * A probe refusal must not classify or disconnect the ordinary delivery link. */
  async probeTool(name, args, { signal, capability } = {}) {
    const client = this.#connected
    const generation = this.#generation
    const refused = { ok: false, code: LINK.disconnected }
    if (client === undefined || signal?.aborted || !this.#tools.some((tool) => tool.name === name &&
        Object.hasOwn(tool.inputSchema?.properties ?? {}, capability))) return refused
    try {
      const result = await callStructured(client, name, args, signal)
      return !signal?.aborted && this.#current(generation) && this.#connected === client ? result : refused
    } catch { return refused }
  }

  #setStatus(next) {
    // A classified status ends the attempt (connected, held, refused or failed alike).
    this.#setDetail({ connecting: false })
    if (next === this.#status) return
    this.#status = next
    emitIsolated(this.#listeners.status, next)
  }

  #setDetail(changes) {
    const next = { ...this.#detail, ...changes }
    if (Object.keys(next).every((key) => next[key] === this.#detail[key])) return
    this.#detail = Object.freeze(next)
    emitIsolated(this.#listeners.detail, this.#detail)
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
    this.#open = undefined
    this.#discovering = undefined
    this.#capability = undefined
    // The capability is a fact of an open stream: unknown again until the next one is acknowledged.
    // The last name is kept (a link down is no rename).
    this.#setDetail({ identity: IDENTITY_STATE.pending })
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
    let credentials
    try {
      const target = checkTarget(this.#options.target())
      if (!target.ok) return this.#setStatus(target.status)
      this.#setDetail({ connecting: true })
      credentials = await this.#options.credentials(target)
      if (!this.#current(generation)) return
      if (!credentials?.secret && credentials?.authProvider === undefined) return this.#setStatus(STATUS.unset)
      attempt = Object.freeze({ origin: target.origin, clientId: credentials.clientId, ref: credentials.ref, kind: credentials.kind, ...(credentials.hosted === true ? { hosted: true } : {}) })
      const held = await this.#options.gate.hold(attempt)
      if (!this.#current(generation)) return
      if (held) return this.#setStatus(held)
      const sdk = await this.#sdk()
      if (!this.#current(generation)) return
      const client = await this.#connect(sdk, target, credentials, attempt, seen, generation)
      if (!this.#current(generation)) return
      this.#connected = client
      this.#open = Object.freeze({ generation, attempt, credentials })
      this.#failures = 0
      this.#setStatus(STATUS.connected)
      this.#poll(generation)
    } catch (error) {
      if (!this.#current(generation)) return
      await this.#teardown()
      await this.#settleFailure(generation, error, attempt, seen, credentials)
    }
  }

  /**
   * The end of a failed or held attempt, after its teardown: the status, the credential's
   * `refused()` for a refusal by the target, and the backoff retry. Shared by a failed attempt and
   * a refusal of the open link (`#refusedWhileOpen`). Never rejects.
   */
  async #settleFailure(generation, error, attempt, seen, credentials) {
    if (!this.#current(generation)) return
    const status = await this.#failed(error, attempt, seen)
    if (!this.#current(generation)) return
    // A held attempt was refused by the gate, not by the target; the hook never rejects.
    if (!(error instanceof LinkHold) && (status === STATUS.refused || status === STATUS.revoked)) await credentials?.refused?.()?.catch(() => {})
    if (!this.#current(generation)) return
    this.#setStatus(status)
    if (!(error instanceof LinkHold)) this.#retryLater(generation)
  }

  /**
   * A call or poll of the open link on `client` failed. A refusal of the credential (status rule
   * 4) ends the link as a refused attempt; anything else (network, abort, a server error) leaves
   * it as it is: the call's caller decides about its own failure.
   */
  #refusedWhileOpen(client, error) {
    const open = this.#open
    if (open === undefined || this.#connected !== client || !this.#current(open.generation)) return
    if (failureStatus(this.#options.sdk ?? {}, error, undefined) !== STATUS.refused) return
    const generation = ++this.#generation
    this.#failures = 0
    this.#cancelTimer()
    this.#leaveConnected()
    void this.#teardown().then(() => this.#settleFailure(generation, error, open.attempt, { mcpStatus: undefined }, open.credentials))
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

  /**
   * Core's packaged MCP client, unless the caller supplied one (`importMcpClient`: a failed import
   * is logged and the attempt still fails as `target-unreachable`).
   */
  async #sdk() {
    this.#options.sdk ??= await importMcpClient(this.#options.logger)
    return this.#options.sdk
  }

  async #connect(sdk, target, credentials, attempt, seen, generation) {
    const provider = credentials.authProvider ?? clientCredentialsOnce(sdk, {
      clientId: credentials.clientId,
      clientSecret: credentials.secret,
      expectedIssuer: target.issuer,
    })
    const grantedScope = () => (credentials.authProvider === undefined ? provider.tokens()?.scope : credentials.scope?.())
    const transport = new sdk.StreamableHTTPClientTransport(target.url, {
      authProvider: provider,
      fetch: this.#guardedFetch(target, seen),
      onInsufficientScope: LINK_MCP.onInsufficientScope,
    })
    const client = new sdk.Client(LINK_MCP.clientInfo, { versionNegotiation: { mode: { pin: LINK_MCP.versionPin } } })
    // Installed before the listen stream opens, so no hint can arrive unhandled (PLAN-MULTI §4.3).
    client.setNotificationHandler(LINK_MCP.resourceUpdated, (notification) => {
      const uri = notification?.params?.uri
      if (uri === LINK_MCP.eventsUri) this.#poll(generation)
      else if (uri === LINK_MCP.identityUri) this.#rediscover(client, generation)
    })
    // A failed re-list keeps the previous list; the next change or (re)connect lists again.
    client.setNotificationHandler(LINK_MCP.toolsListChanged, () => { this.#listTools(client, generation).catch(() => {}) })
    this.#client = client
    await client.connect(transport)
    // The connect-time discovery's name (the SDK keeps it as `getDiscoverResult()`), so a target
    // held by pairing still shows its name. Never `getServerVersion()`, which a rediscovery leaves stale.
    this.#takeName(client.getDiscoverResult?.())
    // The token endpoint issued an access token for this token: the target accepted it (K3a step 3, R9).
    if (credentials.authProvider === undefined && provider.tokens() !== undefined) await credentials.accepted?.()
    if (!this.#current(generation)) return client
    await this.#listTools(client, generation)
    // An attempt overtaken by stop() or reconnect() asks the gate nothing: `admit` may send `pair`.
    if (!this.#current(generation)) return client
    // The gate sees the attempt between the tool list and the listen stream: nothing that needs a
    // full access token has been sent yet, and a held attempt sends nothing more (AUTH-UC-05 E1).
    const held = await this.#options.gate.admit(attempt, {
      scope: grantedScope(),
      call: (name, args = {}) => callStructured(client, name, args),
    })
    if (held) throw new LinkHold(held)
    // `admit` may have waited on `pair`: an attempt overtaken meanwhile sends no further request.
    if (!this.#current(generation)) return client
    // The authority the gate admitted may differ from the one the first list ran under (a fresh
    // `pair` grants full power to the same access token, R-ID-03), so the list is taken again.
    await this.#listTools(client, generation)
    if (!this.#current(generation)) return client
    // The identity resource exists only if the server lists it: an honoured filter proves the
    // capability, not the resource (PLAN-MULTI §4.3). A failed list is no listing.
    const listed = await this.#listsIdentity(client)
    if (!this.#current(generation)) return client
    const subscription = await client.listen({ resourceSubscriptions: [LINK_MCP.eventsUri, LINK_MCP.identityUri], toolsListChanged: true })
    this.#subscription = subscription
    // Connected means a listen stream on agent-events (K3 TargetState). A V3 connector always
    // honours it, so a target that does not is not one (the user's decision, 2026-11-14).
    const honored = subscription.honoredFilter?.resourceSubscriptions ?? []
    if (!honored.includes(LINK_MCP.eventsUri)) throw new LinkFailure(STATUS.incompatible)
    this.#capability = listed && honored.includes(LINK_MCP.identityUri) ? IDENTITY_STATE.live : IDENTITY_STATE.unsupported
    this.#setDetail({ identity: this.#capability })
    // After every acknowledgement: closes the gap between the connect-time discovery and the
    // subscription, and recovers a rename missed while the stream was down. An unsupported server
    // is still read once here, never polled.
    this.#rediscover(client, generation)
    // Any end of the stream we did not cause ('graceful' included: a revocation closes it, R-TOK-05)
    // drops the link; the next attempt reports what the target says then.
    void subscription.closed.then(() => this.#lost(generation, subscription))
    return client
  }

  /** A discovery result's name, kept when the result names none (a malformed answer keeps the last). */
  #takeName(discover) {
    const serverName = serverNameOf(discover)
    if (serverName !== undefined) this.#setDetail({ serverName })
    return serverName !== undefined
  }

  /** Whether `resources/list` lists the identity resource (any failure: no). */
  async #listsIdentity(client) {
    try {
      const { resources } = await client.listResources()
      return Array.isArray(resources) && resources.some((resource) => resource?.uri === LINK_MCP.identityUri)
    } catch { return false }
  }

  /**
   * One authoritative `server/discover` on the open client for `generation` (PLAN-MULTI §4.3): one
   * in flight; a hint meanwhile makes exactly one more after it. A result for an overtaken
   * generation is dropped. A failure that refuses the credential ends the link as any refused call
   * (`#refusedWhileOpen`); any other failure, or an answer without a name, keeps the last name and
   * shows `stale` until the next good answer. No retry timer.
   */
  #rediscover(client, generation) {
    if (this.#discovering?.generation === generation) { this.#discovering.again = true; return }
    const run = { generation, again: true }
    this.#discovering = run
    void (async () => {
      while (run.again && this.#current(generation) && this.#client === client) {
        run.again = false
        let result
        try { result = await client.discover() } catch (error) {
          this.#refusedWhileOpen(client, error)
          if (this.#current(generation) && this.#client === client) this.#setDetail({ identity: IDENTITY_STATE.stale })
          continue
        }
        if (!this.#current(generation) || this.#client !== client) return
        this.#setDetail(this.#takeName(result) ? { identity: this.#capability ?? IDENTITY_STATE.pending } : { identity: IDENTITY_STATE.stale })
      }
      if (this.#discovering === run) this.#discovering = undefined
    })()
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

  /**
   * Drains the mailbox for `generation`: one drain at a time per generation; a request while one
   * runs makes exactly one more drain after it (from the start, so nothing the running one passed
   * is missed). A drain of an older generation never blocks the current one's.
   */
  #poll(generation) {
    if (this.#drainer?.generation === generation) { this.#drainer.again = true; return }
    const drainer = { generation, again: true }
    this.#drainer = drainer
    void (async () => {
      while (drainer.again && this.#current(generation)) {
        drainer.again = false
        await this.#drainPages(generation)
      }
      // In the same synchronous step as the last `again` check, so no request falls between them.
      if (this.#drainer === drainer) this.#drainer = undefined
    })()
  }

  /**
   * One drain: `inbox_poll` pages, each handed to the poll listeners in order, following
   * `nextCursor` while `hasMore` (K1 `inbox_poll`). A `resync` answer (the mailbox's storage was
   * reset under the cursor) starts once more from no cursor. A cursor that does not move ends the
   * drain, so a misbehaving target cannot loop it. Never rejects: a failed page loses nothing,
   * since pending events stay at the connector until acked and the next hint or (re)connect drains
   * again; a refusal of the credential ends the link (`#refusedWhileOpen`).
   */
  async #drainPages(generation) {
    let cursor
    let resynced = false
    for (;;) {
      const client = this.#connected
      if (client === undefined || !this.#current(generation)) return
      let result
      try {
        result = await callStructured(client, MCP.tools.inboxPoll, cursor === undefined ? {} : { [LINK_MCP.cursorArgument]: cursor })
      } catch (error) {
        this.#refusedWhileOpen(client, error)
        return
      }
      if (!this.#current(generation)) return
      emitIsolated(this.#listeners.poll, result)
      if (result?.ok !== true) return
      if (result.resync !== undefined) {
        if (resynced) return
        resynced = true
        cursor = undefined
        continue
      }
      if (result.hasMore !== true || typeof result.nextCursor !== 'string' || result.nextCursor === cursor) return
      cursor = result.nextCursor
    }
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
