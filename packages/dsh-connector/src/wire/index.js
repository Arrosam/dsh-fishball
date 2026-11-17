/**
 * The connector, mounted in the `dsh-connector` row (tasks C-WIRE, C-WIRE-2; design §3, §5, §13).
 * Since C-WIRE-2 it is the only path: the V2 broker is gone, and permission requests, questions,
 * plan reviews, prompts, grants and `message_agent` route session → the agent that manages it →
 * the user (src/domain/, bound in domain.js).
 *
 * `openV3(ctx, {config, storageDomain, limits, volatileEvent, namespace, logger})` → `{close, …}`
 * opens every V3 module once per row life
 * and composes them through the ports their own headers name. The order matters where noted:
 * 1. storage: tokens, pairs, mailbox, routing, OAuth, hosted (one domain each);
 * 2. the token registry with the settings module's writer and write-back; then revocation and the
 *    OAuth revocation follower, **before** the registry's start sync, so no revocation it
 *    announces is missed (revocation/index.js);
 * 3. the start sync; then `revocation.start()` and `hosted.resume()` (both "after the start
 *    sync"), and the settings follower, so later saves reach the registry;
 * 4. the domain (its grants table, DSH's approval and question listeners, the managed sessions'
 *    tool); HTTP: the one request gate with DSH's listener facts, the token endpoint with
 *    C-OAUTH-WEB's two grants registered, the MCP endpoint with C-TOOLS' and C-EXT's tools, the
 *    approval listener on DSH's host and the `approval.port` setting;
 * 5. the host services: dshConnectorHandover, dshConnectorTools, dshConnectorTokens, dshConnectorUi,
 *    and the settings page's routes.
 * Every module's close and every provided service's disposer is one entry of `closers`, run last
 * opened first, when the row unloads or a later step fails: the services and routes leave before
 * the modules behind them close, and the settings chain drains before the modules it feeds.
 *
 * `inbox_ack` goes through routing's mailbox port (routing/index.js: "C-WIRE and C-TOOLS must route
 * every `inbox_ack` through this port"): the mailbox C-TOOLS and C-HTTP get is the one whose
 * `ack` fires `onAcked`, so an ack marks offers acked.
 */
import { readFile } from 'node:fs/promises'
import https from 'node:https'
import { hostname } from 'node:os'
import { resolve } from 'node:path'
import { APPROVAL_LISTENER, HOSTS, PATHS } from '../../mcp-schema/index.js'
import { createContributions } from '../contrib/index.js'
import { diagnosticOf } from '../errors.js'
import { HOSTED_SERVICE, createHostedTokens, openHostedStore } from '../hosted/index.js'
import { createMailbox, openMailboxTables, readEventsResource } from '../mailbox/index.js'
import { createMcpEndpoint, createRequestGate } from '../mcp/http/index.js'
import { HOSTNAME_WATCH } from '../mcp/http/constants.js'
import { createBearerVerifier, createFailureLimiter, createTokenEndpoint, followRevocations, openOAuthTokenStore, originOf } from '../mcp/oauth/index.js'
import {
  approvalOriginFor, createApprovalHandler, createApprovalListener, createAuthorizationCodeGrant, createCimdFetcher, createRefreshTokenGrant,
} from '../mcp/oauth-web/index.js'
import { createCoreTools } from '../mcp/tools/index.js'
import { openPairStore } from '../pairs/index.js'
import { createRevocation } from '../revocation/index.js'
import { openRouting } from '../routing/index.js'
import { registerSettingsPage } from '../settings-page/index.js'
import { createSettings } from '../settings/index.js'
import { createTokenRegistry } from '../tokens/index.js'
import { createUiBackend } from '../ui/index.js'
import { WEB_SERVICE } from '../constants.js'
import { LABEL, LOG, MISUSE, OPTIONAL_WIRE_SERVICE, ROUTE_KIND, TLS_FILE } from './constants.js'
import { createSessionDomain } from './domain.js'
import { withAckSignal } from './mailbox.js'
import { createSessionNotes, createSessionSource, sessionExistsIn } from './sessions.js'

/**
 * DSH's listener facts (K1 GateListenerFacts): its bind host, TLS and `--trusted-host`, read once,
 * because DSH rebinds by restarting (gate.js); `approvalPort` is the one live port function.
 */
function listenerFacts(webServer, ctx, approvalPort) {
  return Object.freeze({
    host: webServer.host,
    secure: webServer.protocol === HOSTS.remoteScheme,
    trustedHosts: ctx.get(OPTIONAL_WIRE_SERVICE.webStartup)?.trustedHosts ?? [],
    approvalPort,
    now: Date.now,
  })
}

/**
 * The approval listener's server: plain node:http, or node:https with DSH's own certificate when
 * DSH's listener is TLS (the user's decision 2026-11-14: both listeners share host and TLS). DSH's
 * web server has no public accessor for its TLS material; it keeps the two PEM file paths of its
 * config (`tls.certFile`, `tls.keyFile`, dsh-host-webserver Config) and reads them once before it
 * binds, so the same files are read here, once, relative to the process working directory as DSH
 * resolves them. This reads a private field of the web server (`tlsConfig`) on both SDKs:
 * revisit if DSH ever exposes the material. Unreadable files make every bind fail, which the
 * listener reports as `approval-port-in-use` while the MCP endpoint keeps working (R-OA-20).
 */
async function serverFactory(webServer, secure) {
  if (!secure) return undefined
  const tls = webServer.tlsConfig
  const material = tls?.certFile === undefined || tls?.keyFile === undefined
    ? new Error(MISUSE.noTlsFiles)
    : await Promise.all([readFile(resolve(tls.certFile), TLS_FILE.encoding), readFile(resolve(tls.keyFile), TLS_FILE.encoding)]).catch((error) => error)
  // The listener counts a throwing factory as a failed bind (listener.js `bind`), so the status
  // says so and the retry keeps trying; it never serves plain HTTP in place of TLS.
  return (handler) => {
    if (material instanceof Error) throw material
    const [cert, key] = material
    return https.createServer({ cert, key }, handler)
  }
}

/** Blank settings use the OS device name; nonblank values retain all whitespace and Unicode. */
const configuredName = (settings) => {
  const named = settings.read().dshName
  return typeof named === 'string' && named.trim().length > 0 ? named : undefined
}

/**
 * One live base-name getter for MCP and the approval page. Fishball's decision: Node has no
 * portable hostname-change event, so check locally every 30 s only while that fallback is used.
 * Reads also detect a rename immediately; neither path polls the network or changes authorization.
 */
function followDshName(settings, changed) {
  let previous
  let timer
  const read = () => {
    const name = configuredName(settings) ?? hostname()
    const renamed = previous !== undefined && previous !== name
    previous = name
    if (renamed) changed()
    return name
  }
  const follow = () => {
    read()
    if (configuredName(settings) === undefined) {
      if (timer === undefined) {
        timer = setInterval(read, HOSTNAME_WATCH.intervalMs)
        timer.unref?.()
      }
    } else {
      clearInterval(timer)
      timer = undefined
    }
  }
  follow()
  const unsubscribe = settings.onChange(follow)
  return { read, close() { unsubscribe(); clearInterval(timer) } }
}

/**
 * @param ctx - the connector row's context
 * @param deps.config - the row's Config
 * @param deps.storageDomain - `{defineDomain, domainTable}` of the running SDK
 * @param deps.limits - `() => readLimits(config)`
 * @param deps.volatileEvent - DSH's loader volatile-update event name
 * @param deps.namespace - the row id (settings namespace)
 * @param deps.logger - the row's logger
 * @returns {Promise<{close: () => Promise<void>}>}
 */
export async function openV3(ctx, { config, storageDomain, limits, volatileEvent, namespace, logger }) {
  const closers = []
  const closeAll = async () => {
    for (const close of closers.splice(0).reverse()) {
      try { await close() } catch (error) { logger.warn(LOG.format, LOG.closeFailed, diagnosticOf(error)) }
    }
  }
  try {
    return await compose()
  } catch (error) {
    await closeAll()
    throw error
  }

  async function compose() {
    // Read with ctx.get: the row does not inject the web server (src/constants.js WEB_SERVICE).
    const webServer = ctx.get(WEB_SERVICE.webServer)
    const settings = createSettings({ ctx, config, namespace, limits, volatileEvent, logger })
    const tokens = createTokenRegistry({ ctx, logger, settings: settings.writer, restoreTokens: settings.restoreTokens })
    settings.bind(tokens)
    closers.push(() => tokens.close())
    const { store: pairs, close: closePairs } = await openPairStore(ctx, storageDomain, { logger })
    closers.push(closePairs)

    // The MCP endpoint is the mailbox's hint sink and routing's presence, and its tools need the
    // routing composition, so its `hints` and `presence` are reached through late-bound ports.
    let endpoint
    const dshName = followDshName(settings, () => endpoint?.identityChanged())
    closers.push(() => dshName.close())
    const hints = Object.freeze({ resourceUpdated: (principalKey, uri) => endpoint?.hints.resourceUpdated(principalKey, uri) })
    const mailboxTables = await openMailboxTables(ctx, storageDomain)
    closers.push(mailboxTables.close)
    // The mailbox reads maxQueuedInputs at each commit, so a change in DSH's form applies live
    // (C-WIRE-2: the routing queue that used to read it live is gone).
    const mailbox = withAckSignal(createMailbox({ tables: mailboxTables.tables, hints, maxQueuedInputs: () => limits().maxQueuedInputs, logger }), logger)

    const sessions = createSessionSource(ctx, logger)
    const presenceListeners = new Set()
    const presence = Object.freeze({
      isConnected: (principalKey) => endpoint?.presence.isConnected(principalKey) === true,
      onChange(listener) {
        presenceListeners.add(listener)
        return () => { presenceListeners.delete(listener) }
      },
    })
    const routing = await openRouting(ctx, storageDomain, { mailbox, pairs, tokens, presence, settings: { onChange: settings.onChange }, sessions, logger })
    closers.push(() => routing.close())

    const { store: oauthStore, close: closeOAuth } = await openOAuthTokenStore(ctx, storageDomain)
    closers.push(closeOAuth)
    closers.push(followRevocations(tokens, oauthStore, { logger }))
    const failures = createFailureLimiter()

    // The approval listener's port as everything else sees it: the bound port once it is bound
    // (setting 0 asks the OS), else the setting. One function for the gate, the metadata and the
    // page (the listener is built in step 4, after this is read).
    let approval
    const approvalPort = () => approval?.port() ?? settings.read().approvalPort
    const facts = listenerFacts(webServer, ctx, approvalPort)
    const gate = createRequestGate(facts, { logger })
    const verifier = createBearerVerifier({ tokenStore: oauthStore, tokenRegistry: tokens, pairStore: pairs, logger })

    const notes = createSessionNotes(ctx)
    const revocation = createRevocation({
      tokens, routing, mailbox, pairs,
      closeEntry: (entryKey) => endpoint?.closeEntry(entryKey),
      settings: { onChange: settings.onChange }, notes, now: Date.now, logger,
    })
    closers.push(() => revocation.close())

    const hostedStore = await openHostedStore(ctx, storageDomain)
    closers.push(hostedStore.close)
    const hosted = createHostedTokens({ table: hostedStore.table, tokens, pairs, routing, writer: settings.writer, notes, logger })
    closers.push(() => hosted.close())

    // Step 3: the start sync, then what runs after it.
    await settings.start()
    await revocation.start()
    await hosted.resume()
    // Pushed before the follower, so on close the follower goes first and then the chain drains,
    // before hosted, revocation and routing (pushed earlier) close: no queued sync reaches them.
    closers.push(() => settings.drain())
    closers.push(settings.follow())

    // Step 4: HTTP.
    const contributions = createContributions({ mailbox, router: routing.router, sessionExists: sessionExistsIn(ctx), onToolsChanged: () => endpoint?.toolsChanged(), logger })
    const domain = await createSessionDomain(ctx, { storageDomain, readLimits: limits, routing, logger })
    closers.push(() => domain.close())
    const populate = createCoreTools({ pairs, mailbox, managed: routing.managed, domain, contributions, now: Date.now, logger })
    endpoint = createMcpEndpoint({
      gate, verifier, failures, pairs, secure: facts.secure,
      readEvents: (principalKey) => readEventsResource(mailbox, principalKey),
      dshName: dshName.read, populate, now: Date.now, logger,
    })
    closers.push(() => endpoint.close())
    closers.push(endpoint.presence.onChange((principalKey, connected) => {
      for (const listener of [...presenceListeners]) listener(principalKey, connected)
    }))

    const dshPort = () => webServer.port
    const tokenEndpoint = createTokenEndpoint({
      gate, failureLimiter: failures, tokenStore: oauthStore, tokenRegistry: tokens, pairStore: pairs, secure: facts.secure,
      approvalOrigin: (req, origin) => approvalOriginFor(origin, dshPort(), approvalPort()),
      now: Date.now, logger,
    })
    const grantDeps = Object.freeze({ store: oauthStore, tokens, pairs })
    tokenEndpoint.register(createAuthorizationCodeGrant(grantDeps))
    tokenEndpoint.register(createRefreshTokenGrant(grantDeps))
    const handler = createApprovalHandler({
      gate, originOf, secure: facts.secure, cimd: createCimdFetcher(), tokens, pairs, store: oauthStore, limiter: failures,
      dshName: dshName.read, dshPort, approvalPort, now: Date.now, logger,
    })
    approval = createApprovalListener({
      handler, host: facts.host, port: settings.read().approvalPort, createServer: await serverFactory(webServer, facts.secure), logger,
    })
    closers.push(() => approval.close())
    void approval.start()
    // A change of `approval.port` rebinds at once (AUTH-DT-09 rule 5).
    closers.push(settings.onChange(() => { void approval.setPort(settings.read().approvalPort) }))

    for (const route of [...tokenEndpoint.routes, Object.freeze({ kind: ROUTE_KIND, path: PATHS.mcp, handler: endpoint.handler })]) {
      closers.push(webServer.register(route))
    }

    // Step 5: the host services and the owner-only pages.
    const ui = createUiBackend({ handover: routing.handover, maxNoteBytes: () => limits().maxMessageBytes, logger })
    closers.push(() => ui.close())
    closers.push(routing.provide(ctx))
    closers.push(contributions.provide(ctx))
    closers.push(ui.provide(ctx))
    closers.push(ctx.effect(() => ctx.provide(HOSTED_SERVICE.name, hosted.service), LABEL.services))
    closers.push(...registerSettingsPage(ctx, {
      tokens,
      state: () => settingsState({ tokens, pairs, presence, settings, approval }),
      logger,
    }))

    return Object.freeze({ close: closeAll, tokens, pairs, routing, approval })
  }
}

/**
 * The settings page's read-only state (R-ID-12, AUTH-UC-09; R-OA-20's status): per token entry,
 * in settings order, its pair state, bound id, name, `lastSeenAt` and whether it is connected
 * now; and the approval listener's status and port. No value or digest: neither reaches here.
 * C-WIRE-2 dropped `designated` with the designated agent (the user's answer q5, 2026-11-17).
 */
function settingsState({ tokens, pairs, presence, settings, approval }) {
  return Object.freeze({
    entries: tokens.list().map((entry) => {
      const pair = pairs.pairOf(entry.entryKey)
      return Object.freeze({
        key: entry.entryKey, label: entry.label, enabled: entry.enabled, paired: pair !== undefined,
        id: pair?.id ?? null, name: pair?.name ?? null, lastSeenAt: pair?.lastSeenAt ?? null,
        connected: pair !== undefined && presence.isConnected(pair.principalKey),
      })
    }),
    approval: Object.freeze({ status: approval.status(), port: approval.port(), defaultPort: APPROVAL_LISTENER.defaultPort }),
  })
}
