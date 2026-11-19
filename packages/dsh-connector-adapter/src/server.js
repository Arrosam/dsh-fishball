/**
 * One configured server: its grant, its sign-in attempt, its refresh timer and its child row
 * (R-OA-21 rules 1–6 and 10, design §5.5b; states AUTH-ST-06, attempt AUTH-ST-07).
 *
 * The grant lives only in the credential record; this object holds the copy last read, so the
 * proxy can read the access token per request without touching the store.
 */
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { OAUTH_CLIENT, OAuthAttemptError, accessTokenOf, createTokenManager, discoverServer, isGrantFor } from './oauth-client.js'
import { isConnectorAuthorizationServer, isConnectorResource, isConnectorUrl } from './connector-check.js'
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
  // Bound to this server's URL: the key names the server only, so a grant another process stored for
  // another URL under the same name is never refreshed, dropped or handed to the proxy (review F1).
  const manager = createTokenManager({ sdk, credentials: ctx.credentials, key, now: host.now, refreshLeadMs: LIMIT.refreshLeadMs, fetchFn, upstream: spec.url })
  let grant
  let child
  /**
   * The proxy saw the connector unreachable (no answer, a gateway status, a broken body) and has not
   * seen it answer since. The stock client gives up after its reconnect budget and never tries
   * again, so the next successful grant or refresh mounts a fresh child (Fishball's decision on the
   * review, S6). A child that is talking again has not given up, so a later answer clears the mark;
   * without it a refresh leaves the child running (AUTH-UC-12 step 8: never restarted across token
   * lifetimes).
   */
  let upstreamFailed = false
  let timer
  /**
   * The next timer retry's delay after a scheduled refresh failed (network, 5xx, 429; not
   * `invalid_grant`, which drops the tokens), or `undefined` while timer refreshes succeed. It doubles
   * per consecutive failure up to its cap, so an outage neither ends proactive refresh nor turns an
   * already-due token into a tight loop (review F4; backoff schedule by the user's decision).
   */
  let retryMs
  /**
   * The failure the backoff last stepped for. A timer that fires during a timer refresh joins the
   * same flight (the token manager shares it) and gets the same rejection; it must not step again.
   * Skipping such a timer instead could drop the one an adoption armed just before the flight ended.
   */
  let steppedFor
  /** A pending attempt: `{url}` once the approval URL is known. */
  let attempt
  /** The refusal or failure the last sign-in left, cleared by the next one or by a grant. */
  let outcome
  let signingIn
  /**
   * While this server writes its own record, the store's update events are not re-read: every exit
   * of `own()` adopts the store's current record instead (an event then may also be the store's
   * reconciliation of another process's change, review F7).
   */
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
   * the adoption of the unchanged grant arms it again for the rest. A pending retry delay is a floor:
   * a grant adopted meanwhile that is not yet due keeps its own later time.
   */
  function armTimer() {
    timers.clearTimeout(timer)
    timer = undefined
    const dueInMs = manager.refreshDueInMs(grant)
    if (disposed || configProblem !== undefined || dueInMs === undefined) return
    timer = timers.setTimeout(refreshByTimer, Math.min(MAX_TIMER_DELAY_MS, Math.max(LIMIT.minRefreshDelayMs, dueInMs, retryMs ?? LIMIT.minRefreshDelayMs)))
    timer.unref?.()
  }
  /**
   * The timer's refresh. A success adopts new tokens, and adopt() ends the backoff; the delay stays
   * set during the flight, so an adoption meanwhile (a 401 recovery's re-read) re-arms nothing.
   */
  async function refreshByTimer() {
    const tokenBefore = accessTokenOf(grant)
    try {
      await refresh()
    } catch (error) {
      if (error === steppedFor) return
      steppedFor = error
      warnRefresh(error)
      // Tokens another process stored meanwhile were adopted with their own schedule.
      if (accessTokenOf(grant) !== tokenBefore) return
      retryMs = retryMs === undefined ? LIMIT.refreshRetryFirstMs : Math.min(LIMIT.refreshRetryMaxMs, retryMs * LIMIT.refreshRetryFactor)
      armTimer()
    }
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
      // New tokens (a 401 refresh, another process, a sign-in) end an outage's backoff. Without them
      // a pending retry keeps its time: re-arming from now would push it later on every failed 401.
      if (after !== before) retryMs = undefined
      if (retryMs === undefined) armTimer()
      if (after === undefined || configProblem !== undefined) { await disposeChild(); return }
      if (upstreamFailed && after !== before) await disposeChild()
      mountChild()
    })
    adopting = run.catch(() => undefined)
    return run
  }

  /**
   * Write this server's record through the token manager. The store's update events are not re-read
   * during the write, but the store reconciles another process's change of the file inside
   * `modifyRecord`, before our mutation runs, and reports it then. A write that succeeds returns
   * that reconciled record; one that throws (a refresh's network error) returns nothing, so the
   * record is read once the lock is released, or the change would never reach memory (review F7).
   */
  async function own(write) {
    writing += 1
    try {
      return await write()
    } catch (error) {
      await adopt(await manager.read())
      throw error
    } finally {
      writing -= 1
    }
  }
  /**
   * @returns the access token of the grant adopted afterwards, never one from a grant adoption
   *   refused (another upstream or record version, review F1).
   */
  async function refresh(failedAccessToken) {
    const result = await own(() => manager.refresh({ failedAccessToken }))
    await adopt(result.grant, { lost: result.outcome === OAUTH_CLIENT.refreshOutcome.invalidGrant })
    return accessTokenOf(grant)
  }

  /** Discovery and the DSH-connector check (rule 2), before any authorization request. */
  async function discover() {
    if (!isConnectorUrl(spec.url)) return refusalOf(STATE.needsConfiguration, REASON.notADshConnector)
    try {
      const discovery = await discoverServer({ sdk, serverUrl: spec.url, fetchFn, acceptResource: (prm) => isConnectorResource(spec.url, prm) })
      if (discovery === undefined || !isConnectorAuthorizationServer(spec.url, discovery.authorizationServerMetadata)) return refusalOf(STATE.needsConfiguration, REASON.notADshConnector)
      return discovery
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
    /**
     * The proxy could not reach the connector for the child (no answer, a gateway status, a broken
     * body, a redirect, a failed 401 refresh: each reaches the child as an error that counts against
     * its reconnect budget; not the child's own abort).
     */
    unreachable: () => { if (child !== undefined) upstreamFailed = true },
    /** The connector answered the child through the proxy: the child is not stuck in its reconnect budget. */
    reachable: () => { upstreamFailed = false },

    async dispose() {
      disposed = true
      timers.clearTimeout(timer)
      await disposeChild()
    },
  })
}
