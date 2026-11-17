/**
 * Connect: core as a browser OAuth client of the target connector's approval page (task
 * F-LINK-SAVE; requirements 1.31 R10, 1.32 R12–R14; design §6.3a; K3a `connect.d.ts`
 * `FishballConnect`, `CONNECT`). Built on `./oauth-client.js`, the Fishball side's copy
 * of the S7c token manager (requirements 1.40). Core never sees a token value here: the user pastes
 * it on the connector's page, and core gets only the grant, which the token manager commits once,
 * after the first successful code exchange (R9), in the target origin's grant record.
 *
 * One `begin()`, in the order of the status below, sending nothing before each check passes:
 * 1. a pending attempt answers its approval URL again;
 * 2. a usable saved credential for the target origin answers `authorized` (nothing to do; so a
 *    hosted child's saved import needs no `clientMetadataUrl`);
 * 3. `connect.clientMetadataUrl` (R12 = B: required, user-hosted, no default) is an https URL with a
 *    non-root path, else `needs-configuration` with the failing rule's code;
 * 4. the connector check (Q-S7C-5 A, names per design §1.0c): the target's path is `MCP.paths.mcp`,
 *    and its protected-resource metadata names exactly the target URL, the same origin plus
 *    `MCP.paths.issuer` as its first authorization server, and the `MCP.scope.full` scope; and its
 *    authorization-server metadata names the target origin's `MCP.paths.token` as the token
 *    endpoint and an https or loopback-http authorization endpoint (X-SEC X-11, X-12); else
 *    `needs-configuration` / `not-a-connector`, before any authorization request;
 * 5. one `ctx.authorization` attempt: PKCE S256, `state`, `resource`, `iss`, the callback, and
 *    `agent_id` = `identity.id` (R13, R-OA-22) so the page binds core's id. The callback is the
 *    Connect route's choice (`control[BEGIN_VIA](via)`): by default the loopback one on a fresh OS port; for a
 *    browser on another machine (Q-A3 B) core's web callback (`web-callback.js`), which the
 *    Connect route picks from the page's own origin; a page whose origin cannot take it is
 *    answered `needs-configuration` / `web-callback-insecure` before anything is sent (R-OA-14).
 *
 * Status (`ConnectStatus`), first match: an attempt pending → `authorizing`; a saved credential for
 * the origin that the target has not refused since → `authorized` (a hosted child's saved token
 * included, `connect.d.ts`); an unusable `clientMetadataUrl` → `needs-configuration` with its
 * code; a target that fails the connector check (none usable, its path, or the last check of this
 * very URL) →
 * `needs-configuration` / `not-a-connector`; the last attempt for this target ended without a
 * grant (denied or cancelled included: nothing was connected) → `failed`, code `null` (no OAuth
 * word, value or code is kept); otherwise `needs-authorization` (so after `invalid_grant` dropped
 * the tokens: Connect again, once). The status follows a change of the target, of
 * `clientMetadataUrl` or of `identity.id` (read on every `status()` and every link attempt), so a
 * new origin is a new first connection (R9), and a grant approved for another id is not
 * `authorized` (R-FIX F10).
 *
 * One attempt is for the settings it began with (R-FIX F16): `begin()` snapshots the target, the
 * client metadata URL and the id, and gives up without an authorization request when any of them
 * changed while it awaited the store or discovery; a pending attempt whose settings changed is
 * withdrawn at the next recomputation (the link's next attempt makes one, F-WIRE reconnects it on
 * each of those changes). The id the approval page binds (`agent_id`) is the snapshot's, and the
 * grant records it (`agentId`). After `dispose()` no attempt starts and a pending one is withdrawn.
 */
import { OAUTH_CLIENT, OAuthAttemptError, clientMetadataUrlProblem, discoverServer } from './oauth-client.js'

/** The key of Connect's route-only begin (see `control[BEGIN_VIA]`); exported for core's Connect route alone. */
export const BEGIN_VIA = Symbol('fishball-core connect: begin with a callback choice')
import { CONNECT, MCP } from '../../contracts/constants.js'
import { issuerOf } from './schema.js'
import { checkTarget, isSecureOrLoopback } from './target.js'
import { LINK_SAVE } from './constants.js'
import { emitIsolated, subscribe } from './listeners.js'

const STATE = CONNECT.state
const CONFIGURATION_OF = Object.freeze({
  [OAUTH_CLIENT.urlProblem.missing]: CONNECT.configuration.metadataUrlMissing,
  [OAUTH_CLIENT.urlProblem.notHttps]: CONNECT.configuration.metadataUrlNotHttps,
  [OAUTH_CLIENT.urlProblem.rootPath]: CONNECT.configuration.metadataUrlRootPath,
})

const status = (state, code = null) => Object.freeze({ state, code })
const AUTHORIZED = Object.freeze({ outcome: STATE.authorized })
const needsConfiguration = (code) => Object.freeze({ outcome: STATE.needsConfiguration, code })
const approval = (url) => Object.freeze({ outcome: LINK_SAVE.approvalUrlOutcome, url })

const sameUrl = (value, expected) => URL.canParse(value) && new URL(value).href === expected
/** The connector check's protected-resource half (step 4 of the module header). */
function isConnectorResource(url, resourceMetadata) {
  return sameUrl(resourceMetadata?.resource, url.href)
    && sameUrl(resourceMetadata?.authorization_servers?.[0], new URL(issuerOf(url.origin)).href)
    && Array.isArray(resourceMetadata?.scopes_supported) && resourceMetadata.scopes_supported.includes(MCP.scope.full)
}

/**
 * The connector check's authorization-server half (step 4 of the module header; X-SEC X-11, X-12).
 * The token endpoint, which receives the code and verifier and later the refresh token, must be the
 * target origin's connector endpoint (`MCP.paths.token`): the link keeps the hosted import's
 * requests on the target origin, and Connect's own exchange and refresh must not leave it either.
 * Grants saved before this check keep the token endpoint they were saved with (only a new Connect
 * is checked). The authorization endpoint, the page on which the user types a connector token, must
 * be https or loopback http (`isSecureOrLoopback`): it is the connector's own approval listener, which
 * may be on another loopback port, so only its transport is checked, not its origin.
 */
function isConnectorServer(url, serverMetadata) {
  const endpoint = serverMetadata?.authorization_endpoint
  return sameUrl(serverMetadata?.token_endpoint, new URL(url.origin + MCP.paths.token).href)
    && URL.canParse(endpoint) && isSecureOrLoopback(new URL(endpoint))
}

/**
 * @param {object} ctx core's row context (`authorization`)
 * @param {object} deps from `createLinkCredentials`: the saved `store` (`read`, `hasSaved`,
 *   `grantKey`, `managerFor`), the `target`, `clientId`, `clientMetadataUrl` and `sdk` / `fetch` /
 *   `timers` options, `isRefused(ref)`, `credentialIdOf(saved)`, and `onSaved(origin)` (after a
 *   grant was committed)
 * @returns {{control: object, refresh: () => void, dispose: () => void}} `control` is K3a's
 *   `FishballConnect`; `refresh()` recomputes the status after a credential changed
 */
export function createConnect(ctx, { store, target, clientId, clientMetadataUrl, sdk, fetch, timers, isRefused, credentialIdOf, onSaved }) {
  const listeners = new Set()
  // One flow per grant record, registered on the first attempt for its origin and kept while core
  // runs: DSH refuses a second flow for one key, and a target may come back.
  const flows = new Map()
  let current = status(STATE.needsAuthorization)
  let attempt
  // The target URL (`href`) whose last attempt ended without a grant, and the one whose
  // protected-resource metadata failed the connector check: each holds for that URL only.
  let failedFor
  let notAConnectorFor
  let generation = 0
  // The settings the current status was computed for (see `status()`).
  let computedFor
  // Concurrent begin() calls share one decision, so two clicks never start two attempts.
  let beginning
  // cancel() came while begin() was still deciding (discovery runs before any attempt exists).
  let cancelled = false
  // dispose() ran: no attempt may start or register a flow from now on.
  let disposed = false

  const usableTarget = () => {
    const checked = checkTarget(target())
    return checked.ok ? checked : undefined
  }
  const configurationCode = () => CONFIGURATION_OF[clientMetadataUrlProblem(clientMetadataUrl())]

  /** Whether a saved credential for the target's origin is usable and not refused since. */
  async function authorized(usable) {
    if (usable === undefined) return false
    const saved = await store.read(usable.origin)
    return store.hasSaved(saved, usable.url.href) && !isRefused(credentialIdOf(saved))
  }

  /**
   * Whether the target fails the connector check as far as it is known without a request: no
   * usable target, a path other than the MCP path, or the last check of this very URL failed.
   */
  const notAConnector = (usable) => usable === undefined || usable.url.pathname !== MCP.paths.mcp || notAConnectorFor === usable.url.href

  async function compute() {
    if (attempt !== undefined) return status(STATE.authorizing)
    const usable = usableTarget()
    if (await authorized(usable)) return status(STATE.authorized)
    const code = configurationCode()
    if (code !== undefined) return status(STATE.needsConfiguration, code)
    if (notAConnector(usable)) return status(STATE.needsConfiguration, CONNECT.configuration.notAConnector)
    return status(failedFor === usable.url.href ? STATE.failed : STATE.needsAuthorization)
  }

  /** The settings the status and an attempt depend on besides the store, as one comparable value. */
  const settingsKey = () => JSON.stringify([target(), clientMetadataUrl(), clientId()])

  /** Sets the status and reports a change. */
  function show(next) {
    if (next.state === current.state && next.code === current.code) return
    current = next
    emitIsolated(listeners, current)
  }

  /** Recomputes the status; only the latest computation may set it. A failed read keeps the last one. */
  function refresh() {
    computedFor = settingsKey()
    // An attempt begun for other settings is not for these ones (the module header).
    if (attempt !== undefined && attempt.settings !== computedFor) ctx.authorization.cancel(attempt.key)
    const mine = ++generation
    compute().then((next) => { if (mine === generation) show(next) }, () => {})
  }

  /**
   * `begin` decided a configuration problem without the store: shown at once, so the status a
   * caller reads right after `begin` resolved agrees with its answer (an older pending
   * recomputation is overtaken).
   */
  function answer(code) {
    computedFor = settingsKey()
    generation += 1
    show(status(STATE.needsConfiguration, code))
    return needsConfiguration(code)
  }

  function flowFor(usable, key) {
    if (flows.has(key)) return
    const flow = Object.freeze({
      key,
      label: LINK_SAVE.flow.label,
      methods: Object.freeze([LINK_SAVE.flow.method]),
      // Only core's own begin() starts an attempt: it ran the checks and holds the discovery. An
      // attempt begun from anywhere else (a surface listing every flow) passed no check and ends at once.
      run: async (session) => {
        if (attempt?.key !== key) throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed)
        const { serverUrl, clientMetadataUrl: metadataUrl, discovery, agentId, callback } = attempt
        const manager = await store.managerFor(usable.origin)
        return manager.authorize({
          session, serverUrl, clientMetadataUrl: metadataUrl, discovery,
          authorizationParameters: { [MCP.oauth.agentIdParameter]: agentId },
          payloadFields: { [LINK_SAVE.grantAgentIdField]: agentId },
          message: LINK_SAVE.text.approval, timeoutMs: LINK_SAVE.attemptTimeoutMs, timers, callback,
        })
      },
    })
    flows.set(key, ctx.authorization.registerFlow(flow))
  }

  /** A failed start or discovery: shown as `failed` for this target, and rejected to the caller. */
  function fail(serverUrl, error) {
    failedFor = serverUrl
    refresh()
    throw error
  }

  /**
   * Starts the attempt; resolves with its approval URL, or `authorized` when it already committed.
   * An attempt that ends before its URL is known without a grant rejects (`connect.d.ts` has no
   * outcome for it): the caller learns "nothing to open", and the status says why.
   */
  function start(usable, discovery, callback, snapshot) {
    const key = store.grantKey(usable.origin)
    // No `ctx.authorization` (a profile without dsh-authorization) or a key another plugin claimed
    // (`DUPLICATE_FLOW`): no attempt can run, so Connect reports `failed` rather than a bare TypeError.
    try { flowFor(usable, key) } catch (error) { return fail(usable.url.href, error) }
    return new Promise((resolve, reject) => {
      // Set before begin(): DSH calls the flow's run() from begin(), and run() reads this attempt.
      const pending = { key, url: undefined, serverUrl: usable.url.href, clientMetadataUrl: snapshot.clientMetadataUrl, agentId: snapshot.agentId, settings: snapshot.settings, discovery, callback }
      attempt = pending
      failedFor = undefined
      refresh()
      const settle = async (ok) => {
        if (attempt === pending) attempt = undefined
        failedFor = ok ? undefined : pending.serverUrl
        if (ok) await onSaved(usable.origin)
        refresh()
        if (pending.url !== undefined) return
        if (ok) resolve(AUTHORIZED)
        else reject(new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed))
      }
      ctx.authorization.begin({
        key,
        interaction: {
          notify: (notice) => {
            if (notice.url === undefined || pending.url !== undefined) return
            pending.url = notice.url
            resolve(approval(notice.url))
          },
          // This flow asks nothing: the approval happens on the connector's page.
          prompt: () => Promise.reject(new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed)),
        },
      }).then(
        // `cancelled` (the user withdrew) ends without a grant too: `failed`, as any other end.
        (outcome) => settle(outcome?.status === LINK_SAVE.authorizationAuthorized),
        () => settle(false),
      )
    })
  }

  /**
   * One `begin` decision (see the module header for the order of the checks).
   * @param {{callback?: () => Promise<object>, refused?: string}} [via] the Connect route's callback
   *   choice: a listener factory for `oauth-client`'s `authorize` (undefined: the loopback one), or
   *   `refused`, the configuration code of a page that can take no callback
   */
  async function beginOnce(via = {}) {
    cancelled = false
    const snapshot = Object.freeze({ settings: settingsKey(), clientMetadataUrl: clientMetadataUrl(), agentId: clientId() })
    // Overtaken: disposed, or a setting this attempt is for changed while it awaited.
    const overtaken = () => disposed || settingsKey() !== snapshot.settings
    const usable = usableTarget()
    if (attempt !== undefined) {
      // A pending attempt for this target's grant answers its URL again; one for another origin
      // (the target changed) is withdrawn: a new origin is a new first connection (R9).
      // An attempt begun for other settings (another id or metadata URL) is withdrawn too (R-FIX F16).
      if (attempt.key === (usable && store.grantKey(usable.origin)) && attempt.serverUrl === usable.url.href && attempt.settings === snapshot.settings) {
        if (attempt.url !== undefined) return approval(attempt.url)
      } else ctx.authorization.cancel(attempt.key)
    }
    if (await authorized(usable)) return AUTHORIZED
    if (overtaken()) throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed)
    const code = configurationCode() ?? via.refused
    if (code !== undefined) return answer(code)
    // A blank, refused or non-connector target fails the connector check: nothing to connect to.
    if (notAConnector(usable) && usable?.url.href !== notAConnectorFor) return answer(CONNECT.configuration.notAConnector)
    // Each begin checks the target again: the user may have fixed it since.
    notAConnectorFor = undefined
    let discovery
    try {
      discovery = await discoverServer({ sdk: await sdk(), serverUrl: usable.url.href, fetchFn: fetch, acceptResource: (prm) => isConnectorResource(usable.url, prm) })
    } catch (error) {
      return fail(usable.url.href, error)
    }
    if (discovery === undefined || !isConnectorServer(usable.url, discovery.authorizationServerMetadata)) {
      notAConnectorFor = usable.url.href
      return answer(CONNECT.configuration.notAConnector)
    }
    if (cancelled) return fail(usable.url.href, new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.denied))
    if (overtaken()) throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed)
    return start(usable, discovery, via.callback, snapshot)
  }

  const begin = (via) => (beginning ??= beginOnce(via).finally(() => { beginning = undefined }))

  refresh()
  return Object.freeze({
    control: Object.freeze({
      /**
       * The last computed status. A changed target or `clientMetadataUrl` (F-WIRE may not tell
       * core) starts a recomputation, which `onChange` reports; this call answers the last one.
       */
      status: () => {
        if (settingsKey() !== computedFor) refresh()
        return current
      },
      onChange: (fn) => subscribe(listeners, fn),
      /** K3a `begin()`: the loopback callback; concurrent calls share the first's decision. */
      begin: () => begin(),
      /**
       * Core's own Connect route only (`BEGIN_VIA`, a symbol nothing outside core holds): `begin`
       * with the press's callback choice (`beginOnce`). Kept off K3a's `begin()`, so no other plugin
       * reading `fishballInstance.ui.connect` can choose the redirect URI.
       */
      [BEGIN_VIA]: (via) => begin(via),
      cancel: () => {
        if (attempt !== undefined) ctx.authorization.cancel(attempt.key)
        else if (beginning !== undefined) cancelled = true
      },
    }),
    refresh,
    dispose() {
      disposed = true
      generation += 1
      if (attempt !== undefined) ctx.authorization.cancel(attempt.key)
      for (const dispose of flows.values()) dispose()
      flows.clear()
    },
  })
}
