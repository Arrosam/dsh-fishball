/**
 * One configured server: its grant, its sign-in attempt, its refresh timer and its child row
 * (R-OA-21 rules 1–6 and 10, design §5.5b; states AUTH-ST-06, attempt AUTH-ST-07).
 *
 * The grant lives only in the credential record; this object holds the copy last read, so the
 * proxy can read the access token per request without touching the store.
 */
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { OAUTH_CLIENT, OAuthAttemptError, accessTokenOf, createTokenManager, discoverServer, isGrantFor } from './oauth-client.js'
import { isConnectorResource, isConnectorUrl } from './connector-check.js'
import { ADAPTER, CHILD_ROW, LIMIT, REASON, SIGN_IN_TOOL, STATE, TEXT } from './constants.js'

/** An attempt that ends with one of these leaves `needs-authorization` (END); any other end is `failed`. */
const ENDS_QUIETLY = Object.freeze([OAUTH_CLIENT.attemptEnd.denied, OAUTH_CLIENT.attemptEnd.rejected, OAUTH_CLIENT.attemptEnd.expired])
const refusalOf = (status, reason) => ({ status, reason })

/**
 * @param options.spec `{serverName, url}` from the settings.
 * @param options.key the credential-record key (also the authorization flow key).
 * @param options.routeId the proxy route id.
 * @param options.configProblem the `needs-configuration` reason while `clientMetadataUrl` is unusable, else undefined.
 * @param options.host `{ctx, sdk, mcpClient, now, timers, fetchFn, proxy, clientMetadataUrl}`; `proxy.route(routeId)`
 *   gives the child row's URL and local-bearer headers.
 */
export function createServer({ spec, key, routeId, configProblem, host }) {
  const { ctx, sdk, mcpClient, timers, fetchFn } = host
  const manager = createTokenManager({ sdk, credentials: ctx.credentials, key, now: host.now, refreshLeadMs: LIMIT.refreshLeadMs, fetchFn })
  let grant
  let child
  /**
   * The proxy saw the connector unreachable since the child was mounted. The stock client gives up
   * after its reconnect budget and never tries again, so the next successful grant or refresh mounts
   * a fresh child (Fishball's decision on the review, S6). Without such a failure a refresh leaves
   * the child running (AUTH-UC-12 step 8: never restarted across token lifetimes).
   */
  let upstreamFailed = false
  let timer
  /** A pending attempt: `{url}` once the approval URL is known. */
  let attempt
  /** The refusal or failure the last sign-in left, cleared by the next one or by a grant. */
  let outcome
  let signingIn
  /** While this server writes its own record, the store's update event is ours and is not re-read. */
  let writing = 0
  let adopting = Promise.resolve()
  let disposed = false

  const live = () => accessTokenOf(grant) !== undefined

  function state() {
    if (configProblem !== undefined) return refusalOf(STATE.needsConfiguration, configProblem)
    if (attempt !== undefined) return { status: STATE.authorizing }
    if (live()) return { status: STATE.authorized }
    return outcome ?? { status: STATE.needsAuthorization }
  }

  function mountChild() {
    if (child !== undefined) return
    upstreamFailed = false
    const { url, headers } = host.proxy.route(routeId)
    child = ctx.plugin(mcpClient, {
      transport: CHILD_ROW.transport,
      serverName: spec.serverName,
      url,
      headers,
      failOnStartupError: CHILD_ROW.failOnStartupError,
    })
  }
  async function disposeChild() {
    const fiber = child
    child = undefined
    await fiber?.dispose()
  }

  /** Report a refresh that could not run (network, server error) without any value; the 401 path still recovers. */
  const warnRefresh = (error) => ctx.logger.warn(TEXT.refreshFailed, ADAPTER.logLabel, spec.serverName, error?.code ?? error?.name)

  /**
   * The refresh timer. No timer when no timer refresh applies (the token manager says so for a
   * lifetime no longer than the lead: such a token is refreshed on its first 401). A delay past
   * Node's largest is clamped: the timer then wakes early, the refresh declines (not yet due), and
   * the adoption of the unchanged grant arms it again for the rest.
   */
  function armTimer() {
    timers.clearTimeout(timer)
    timer = undefined
    const dueInMs = manager.refreshDueInMs(grant)
    if (disposed || configProblem !== undefined || dueInMs === undefined) return
    timer = timers.setTimeout(() => { refresh().catch(warnRefresh) }, Math.min(MAX_TIMER_DELAY_MS, Math.max(LIMIT.minRefreshDelayMs, dueInMs)))
    timer.unref?.()
  }

  /**
   * Take a grant into memory, then mount or dispose of the child row and arm the timer. Serialised:
   * the store's update event and our own writes can both adopt the same grant.
   * @param lost true when the connector refused the grant (`invalid_grant`, a second 401): the user
   *   is told once, on the transition from live tokens to none.
   */
  function adopt(next, { lost = false } = {}) {
    const run = adopting.then(async () => {
      if (disposed) return
      const before = accessTokenOf(grant)
      // A grant of another record version, or one issued for a URL this server no longer has, is
      // treated as absent and left in the store; the next sign-in overwrites it (review B2).
      grant = isGrantFor(next, spec.url) ? next : undefined
      const after = accessTokenOf(grant)
      if (after !== undefined) outcome = undefined
      if (lost && before !== undefined && after === undefined) ctx.logger.warn(TEXT.needsAuthorizationAgain, ADAPTER.logLabel, spec.serverName)
      armTimer()
      if (after === undefined || configProblem !== undefined) { await disposeChild(); return }
      if (upstreamFailed && after !== before) await disposeChild()
      mountChild()
    })
    adopting = run.catch(() => undefined)
    return run
  }

  async function own(write) {
    writing += 1
    try { return await write() } finally { writing -= 1 }
  }
  async function refresh(failedAccessToken) {
    const result = await own(() => manager.refresh({ failedAccessToken }))
    await adopt(result.grant, { lost: result.outcome === OAUTH_CLIENT.refreshOutcome.invalidGrant })
    return accessTokenOf(result.grant)
  }

  /** Discovery and the DSH-connector check (rule 2), before any authorization request. */
  async function discover() {
    if (!isConnectorUrl(spec.url)) return refusalOf(STATE.needsConfiguration, REASON.notADshConnector)
    try {
      const discovery = await discoverServer({ sdk, serverUrl: spec.url, fetchFn, acceptResource: (prm) => isConnectorResource(spec.url, prm) })
      return discovery ?? refusalOf(STATE.needsConfiguration, REASON.notADshConnector)
    } catch (error) {
      if (!(error instanceof OAuthAttemptError)) throw error
      return refusalOf(STATE.failed, REASON.discoveryFailed)
    }
  }

  /** Start one `ctx.authorization` attempt; resolves with its approval URL, or the outcome it ended with first. */
  function begin(discovery) {
    return new Promise((resolve) => {
      // Set before begin(): the host calls the flow's run() synchronously from begin(), and run()
      // reads this attempt's discovery.
      const pending = { url: undefined, discovery }
      attempt = pending
      const settle = async (ended) => {
        if (attempt === pending) attempt = undefined
        outcome = ended
        if (!live()) await adopt(await manager.read())
        resolve(pending.url === undefined ? ended ?? state() : undefined)
      }
      ctx.authorization.begin({
        key,
        interaction: {
          notify: (notice) => {
            if (notice.url === undefined || pending.url !== undefined) return
            pending.url = notice.url
            resolve(pending)
          },
          // This flow asks nothing: the approval happens on the connector's page.
          prompt: () => Promise.reject(new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed)),
        },
      }).then(
        () => settle(undefined),
        (error) => settle(ENDS_QUIETLY.includes(error?.code) ? undefined : refusalOf(STATE.failed, REASON.authorizationFailed)),
      )
    })
  }

  /**
   * AUTH-DT-12: a configuration problem or live tokens answer at once; a pending attempt answers
   * with its URL; otherwise the check runs again (every sign-in without live tokens) and a new
   * attempt starts.
   */
  async function signInOnce() {
    if (configProblem !== undefined || live()) return state()
    if (attempt?.url !== undefined) return attempt
    outcome = undefined
    const discovery = await discover()
    if (discovery.status !== undefined) { outcome = discovery; return discovery }
    return begin(discovery)
  }

  return Object.freeze({
    serverName: spec.serverName,
    upstream: spec.url,
    /** The service's view: `{serverName, url, state, reason?}`, never a value. */
    status() {
      const { status, reason } = state()
      return { serverName: spec.serverName, url: spec.url, state: status, ...(reason === undefined ? {} : { reason }) }
    },

    /** The authorization flow this server registers (one per key, S7c F4). */
    flow: Object.freeze({
      key,
      label: TEXT.flowLabel(spec.serverName),
      methods: Object.freeze([ADAPTER.method]),
      // Only the sign-in tool starts an attempt: it runs the DSH-connector check first and hands over
      // the checked discovery. An attempt begun by anything else (a surface listing every flow) has
      // passed no check, so it ends at once without a request.
      run: (session) => (attempt === undefined
        ? Promise.reject(new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed))
        : manager.authorize({
          session, serverUrl: spec.url, clientMetadataUrl: host.clientMetadataUrl, discovery: attempt.discovery,
          message: TEXT.approval, timeoutMs: LIMIT.attemptTimeoutMs, timers,
        })),
    }),

    /** Load the stored grant at start: no browser and no request (rule 6). */
    load: async () => adopt(await manager.read()),
    /** The store changed under us (another process refreshed, the user removed the record). */
    async onRecordUpdated() {
      if (writing === 0) await adopt(await manager.read())
    },

    /** The sign-in tool's answer (AUTH-DT-12). Concurrent calls share one decision. */
    async signIn() {
      signingIn ??= signInOnce().finally(() => { signingIn = undefined })
      const result = await signingIn
      if (result.url !== undefined) return { status: SIGN_IN_TOOL.status.approvalUrl, url: result.url, message: TEXT.approval }
      return result
    },

    // ---- what the proxy needs (proxy.js) ----
    accessToken: () => accessTokenOf(grant),
    recover: (failedAccessToken) => refresh(failedAccessToken),
    lose: async (failedAccessToken) => adopt(await own(() => manager.dropTokens({ failedAccessToken })), { lost: true }),
    /** The proxy could not reach the connector (its request failed, not the child's own abort). */
    unreachable: () => { if (child !== undefined) upstreamFailed = true },

    async dispose() {
      disposed = true
      timers.clearTimeout(timer)
      await disposeChild()
    },
  })
}
