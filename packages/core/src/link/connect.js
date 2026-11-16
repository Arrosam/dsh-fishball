/**
 * Connect: core as a browser OAuth client of the target connector's approval page (task
 * F-LINK-SAVE; requirements 1.31 R10, 1.32 R12–R14; design §6.3a; K3a `connect.d.ts`
 * `FishballConnect`, `CONNECT`). Built on `fishball-shared/oauth-client`, the Fishball side's copy
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
 *    `MCP.paths.issuer` as its first authorization server, and the `MCP.scope.full` scope; else
 *    `needs-configuration` / `not-a-connector`, before any authorization request;
 * 5. one `ctx.authorization` attempt: PKCE S256, `state`, `resource`, `iss`, the loopback callback
 *    on a fresh OS port, and `agent_id` = `identity.id` (R13, R-OA-22) so the page binds core's id.
 *
 * Status (`ConnectStatus`), first match: an attempt pending → `authorizing`; a saved credential for
 * the origin that the target has not refused since → `authorized` (a hosted child's saved token
 * included, `connect.d.ts`); an unusable `clientMetadataUrl` → `needs-configuration`; the last
 * attempt failed → `failed` (code `null`: no OAuth word, value or code is kept); otherwise
 * `needs-authorization` (so after `invalid_grant` dropped the tokens: Connect again, once).
 *
 * Not built here: the web callback for a browser on another machine (Q-A3 B,
 * `CONNECT.callback.webPath`, `web-callback-insecure`): it needs core's owner-only web route and
 * the browser's own address, which no current caller passes; see the task report.
 */
import { OAUTH_CLIENT, OAuthAttemptError, clientMetadataUrlProblem, discoverServer } from 'fishball-shared/oauth-client'
import { CONNECT, MCP } from '../../contracts/constants.js'
import { issuerOf } from './schema.js'
import { checkTarget } from './target.js'
import { LINK_SAVE } from './constants.js'
import { emitIsolated, subscribe } from './listeners.js'

const STATE = CONNECT.state
const CONFIGURATION_OF = Object.freeze({
  [OAUTH_CLIENT.urlProblem.missing]: CONNECT.configuration.metadataUrlMissing,
  [OAUTH_CLIENT.urlProblem.notHttps]: CONNECT.configuration.metadataUrlNotHttps,
  [OAUTH_CLIENT.urlProblem.rootPath]: CONNECT.configuration.metadataUrlRootPath,
})
/**
 * Attempt ends that leave `needs-authorization`, as the adapter's (the user denied, a response that
 * failed the state or issuer check, a lapsed attempt); any other end is `failed`.
 */
const ENDS_QUIETLY = Object.freeze([OAUTH_CLIENT.attemptEnd.denied, OAUTH_CLIENT.attemptEnd.rejected, OAUTH_CLIENT.attemptEnd.expired])

const status = (state, code = null) => Object.freeze({ state, code })
const AUTHORIZED = Object.freeze({ outcome: STATE.authorized })
const needsConfiguration = (code) => Object.freeze({ outcome: STATE.needsConfiguration, code })
const approval = (url) => Object.freeze({ outcome: 'approval-url', url })

const sameUrl = (value, expected) => URL.canParse(value) && new URL(value).href === expected
/** The connector check's protected-resource half (step 4 of the module header). */
function isConnectorResource(url, resourceMetadata) {
  return sameUrl(resourceMetadata?.resource, url.href)
    && sameUrl(resourceMetadata?.authorization_servers?.[0], new URL(issuerOf(url.origin)).href)
    && Array.isArray(resourceMetadata?.scopes_supported) && resourceMetadata.scopes_supported.includes(MCP.scope.full)
}

/**
 * @param {object} ctx core's row context (`authorization`)
 * @param {object} deps from `createLinkCredentials`: the saved `store` (with `grantKey(origin)`), the `target`, `clientId`,
 *   `clientMetadataUrl` and `sdk` / `fetch` / `timers` options, `isRefused(ref)`, `credentialIdOf(saved)`,
 *   `usableGrant(grant, url)`, and `onSaved(origin)` (after a grant was committed)
 * @returns {{control: object, refresh: () => void, dispose: () => void}} `control` is K3a's
 *   `FishballConnect`; `refresh()` recomputes the status after a credential changed
 */
export function createConnect(ctx, { store, target, clientId, clientMetadataUrl, sdk, fetch, timers, isRefused, credentialIdOf, usableGrant, onSaved }) {
  const listeners = new Set()
  // One flow per grant record, registered on the first attempt for its origin and kept while core
  // runs: DSH refuses a second flow for one key, and a target may come back.
  const flows = new Map()
  let current = status(STATE.needsAuthorization)
  let attempt
  let failed = false
  let generation = 0
  // Concurrent begin() calls share one decision, so two clicks never start two attempts.
  let beginning

  const usableTarget = () => {
    const checked = checkTarget(target())
    return checked.ok ? checked : undefined
  }
  const configurationCode = () => CONFIGURATION_OF[clientMetadataUrlProblem(clientMetadataUrl())]

  /** Whether a saved credential for the target's origin is usable and not refused since. */
  async function authorized(usable) {
    if (usable === undefined) return false
    const saved = await store.read(usable.origin)
    const has = saved.token !== undefined || usableGrant(saved.grant, usable.url.href)
    return has && !isRefused(credentialIdOf(saved))
  }

  async function compute() {
    if (attempt !== undefined) return status(STATE.authorizing)
    if (await authorized(usableTarget())) return status(STATE.authorized)
    const code = configurationCode()
    if (code !== undefined) return status(STATE.needsConfiguration, code)
    return status(failed ? STATE.failed : STATE.needsAuthorization)
  }

  /** Recomputes the status; only the latest computation may set it. A failed read keeps the last one. */
  function refresh() {
    const mine = ++generation
    compute().then((next) => {
      if (mine !== generation || (next.state === current.state && next.code === current.code)) return
      current = next
      emitIsolated(listeners, current)
    }, () => {})
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
        const manager = await store.managerFor(usable.origin)
        return manager.authorize({
          session, serverUrl: attempt.serverUrl, clientMetadataUrl: attempt.clientMetadataUrl, discovery: attempt.discovery,
          authorizationParameters: { [MCP.oauth.agentIdParameter]: clientId() },
          message: LINK_SAVE.text.approval, timeoutMs: LINK_SAVE.attemptTimeoutMs, timers,
        })
      },
    })
    flows.set(key, ctx.authorization.registerFlow(flow))
  }

  /**
   * Starts the attempt; resolves with its approval URL, or `authorized` when it already committed.
   * An attempt that ends before its URL is known without a grant rejects (`connect.d.ts` has no
   * outcome for it): the caller learns "nothing to open", and the status says why.
   */
  function start(usable, discovery) {
    const key = store.grantKey(usable.origin)
    flowFor(usable, key)
    return new Promise((resolve, reject) => {
      // Set before begin(): DSH calls the flow's run() from begin(), and run() reads this attempt.
      const pending = { key, url: undefined, serverUrl: usable.url.href, clientMetadataUrl: clientMetadataUrl(), discovery }
      attempt = pending
      failed = false
      refresh()
      const settle = async (ok, quiet) => {
        if (attempt === pending) attempt = undefined
        failed = !ok && !quiet
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
        // `cancelled`: the user cancelled (here or on the page), which is no failure.
        (outcome) => settle(outcome?.status === STATE.authorized, true),
        (error) => settle(false, ENDS_QUIETLY.includes(error?.code)),
      )
    })
  }

  /** One `begin` decision (see the module header for the order of the checks). */
  async function beginOnce() {
    if (attempt?.url !== undefined) return approval(attempt.url)
    const usable = usableTarget()
    if (await authorized(usable)) return AUTHORIZED
    const code = configurationCode()
    if (code !== undefined) return needsConfiguration(code)
    // A blank, refused or non-connector target fails the connector check: nothing to connect to.
    if (usable === undefined || usable.url.pathname !== MCP.paths.mcp) return needsConfiguration(CONNECT.configuration.notAConnector)
    let discovery
    try {
      discovery = await discoverServer({ sdk: await sdk(), serverUrl: usable.url.href, fetchFn: fetch, acceptResource: (prm) => isConnectorResource(usable.url, prm) })
    } catch (error) {
      failed = true
      refresh()
      throw error
    }
    if (discovery === undefined) return needsConfiguration(CONNECT.configuration.notAConnector)
    return start(usable, discovery)
  }

  refresh()
  return Object.freeze({
    control: Object.freeze({
      status: () => current,
      onChange: (fn) => subscribe(listeners, fn),
      begin: () => (beginning ??= beginOnce().finally(() => { beginning = undefined })),
      cancel: () => { if (attempt !== undefined) ctx.authorization.cancel(attempt.key) },
    }),
    refresh,
    dispose() {
      generation += 1
      for (const dispose of flows.values()) dispose()
      flows.clear()
    },
  })
}
