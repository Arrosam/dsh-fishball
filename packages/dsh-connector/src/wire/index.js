/**
 * The V3 connector, mounted in the `dsh-connector` row beside the V2 path (task C-WIRE; design
 * §3, §5, §13; the user's split, 2026-11-16: the V2 approval broker keeps running and is switched
 * to V3 routing in C-WIRE-2, so in this task no permission request becomes a V3 offer).
 *
 * `openV3(ctx, {config, storageDomain, limits, logger})` opens every V3 module once per row life
 * and composes them through the ports their own headers name. The order matters where noted:
 * 1. storage: tokens, pairs, mailbox, routing, OAuth, hosted (one domain each);
 * 2. the token registry with the settings module's writer and write-back; then revocation and the
 *    OAuth revocation follower, **before** the registry's start sync, so no revocation it
 *    announces is missed (revocation/index.js);
 * 3. the start sync; then `revocation.start()` and `hosted.resume()` (both "after the start
 *    sync"), and the settings follower, so later saves reach the registry;
 * 4. HTTP: the one request gate with DSH's listener facts, the token endpoint with C-OAUTH-WEB's
 *    two grants registered, the MCP endpoint with C-TOOLS' and C-EXT's tools, the approval
 *    listener on DSH's host and the `approval.port` setting;
 * 5. the host services: dshConnectorHandover, dshConnectorTools, dshConnectorTokens, dshConnectorUi.
 * Each module's `close` runs, last opened first, when the row unloads.
 *
 * `inbox_ack` goes through routing's mailbox port (routing/index.js: "C-WIRE and C-TOOLS must route
 * every `inbox_ack` through this port"): the mailbox C-TOOLS and C-HTTP get is the one whose
 * `ack` fires `onAcked`, so an ack frees room for held messages and marks offers acked.
 */
import { readFile } from 'node:fs/promises'
import https from 'node:https'
import { resolve } from 'node:path'
import { APPROVAL_LISTENER, HOSTS, PATHS } from '../../mcp-schema/index.js'
import { createContributions } from '../contrib/index.js'
import { diagnosticOf } from '../errors.js'
import { HOSTED_SERVICE, createHostedTokens, openHostedStore } from '../hosted/index.js'
import { createMailbox, openMailboxTables, readEventsResource } from '../mailbox/index.js'
import { createMcpEndpoint, createRequestGate } from '../mcp/http/index.js'
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
import { LABEL, LOG, OPTIONAL_WIRE_SERVICE, ROUTE_KIND, TLS_FILE } from './constants.js'
import { createSessionDomain } from './domain.js'
import { withAckSignal } from './mailbox.js'
import { createSessionNotes, createSessionSource, sessionExistsIn } from './sessions.js'

/**
 * The cards port of revocation (`toUser`): the split's interim. A V3 offer comes only from the V2
 * broker once C-WIRE-2 switches it, and the broker itself already sends a request to the user when
 * its session leaves management; until then there is no V3 offer to hand over.
 */
const NO_CARDS = Object.freeze({ toUser: () => {} })

/**
 * DSH's listener facts (K1 GateListenerFacts): its bind host, TLS and `--trusted-host`, read once,
 * because DSH rebinds by restarting (gate.js); the approval port is read live from the setting.
 */
function listenerFacts(ctx, approvalPort) {
  return Object.freeze({
    host: ctx.webServer.host,
    secure: ctx.webServer.protocol === HOSTS.remoteScheme,
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
async function serverFactory(ctx, secure) {
  if (!secure) return undefined
  const tls = ctx.webServer.tlsConfig
  const material = await Promise.all([readFile(resolve(tls?.certFile ?? ''), TLS_FILE.encoding), readFile(resolve(tls?.keyFile ?? ''), TLS_FILE.encoding)])
    .catch((error) => error)
  // The listener counts a throwing factory as a failed bind (listener.js `bind`), so the status
  // says so and the retry keeps trying; it never serves plain HTTP in place of TLS.
  return (handler) => {
    if (material instanceof Error) throw material
    const [cert, key] = material
    return https.createServer({ cert, key }, handler)
  }
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
    const settings = createSettings({ ctx, config, namespace, limits, volatileEvent, logger })
    const tokens = createTokenRegistry({ ctx, logger, settings: settings.writer, restoreTokens: settings.restoreTokens })
    settings.bind(tokens)
    closers.push(() => tokens.close())
    const { store: pairs, close: closePairs } = await openPairStore(ctx, storageDomain, { logger })
    closers.push(closePairs)

    // The MCP endpoint is the mailbox's hint sink and routing's presence, and its tools need the
    // routing composition, so its `hints` and `presence` are reached through late-bound ports.
    let endpoint
    const hints = Object.freeze({ resourceUpdated: (principalKey, uri) => endpoint?.hints.resourceUpdated(principalKey, uri) })
    const mailboxTables = await openMailboxTables(ctx, storageDomain)
    closers.push(mailboxTables.close)
    // C-MAILBOX reads maxQueuedInputs once at creation; routing reads it live (routing/index.js:
    // "C-WIRE aligns the two when it builds them"): both start from the one setting.
    const mailbox = withAckSignal(createMailbox({ tables: mailboxTables.tables, hints, maxQueuedInputs: limits().maxQueuedInputs, logger }), logger)

    const sessions = createSessionSource(ctx, logger)
    const presenceListeners = new Set()
    const presence = Object.freeze({
      isConnected: (principalKey) => endpoint?.presence.isConnected(principalKey) === true,
      onChange(listener) {
        presenceListeners.add(listener)
        return () => { presenceListeners.delete(listener) }
      },
    })
    const routing = await openRouting(ctx, storageDomain, { mailbox, pairs, tokens, presence, settings: { get: settings.read, onChange: settings.onChange }, sessions, logger })
    closers.push(() => routing.close())

    const { store: oauthStore, close: closeOAuth } = await openOAuthTokenStore(ctx, storageDomain)
    closers.push(closeOAuth)
    closers.push(followRevocations(tokens, oauthStore, { logger }))
    const failures = createFailureLimiter()

    const facts = listenerFacts(ctx, () => settings.read().approvalPort)
    const gate = createRequestGate(facts, { logger })
    const verifier = createBearerVerifier({ tokenStore: oauthStore, tokenRegistry: tokens, pairStore: pairs, logger })

    const notes = createSessionNotes(ctx)
    const revocation = createRevocation({
      tokens, routing, mailbox, pairs,
      closeEntry: (entryKey) => endpoint?.closeEntry(entryKey),
      settings: { get: settings.read, onChange: settings.onChange },
      writer: settings.writer, notes, cards: NO_CARDS, now: Date.now, logger,
    })
    closers.push(() => revocation.close())

    const hostedStore = await openHostedStore(ctx, storageDomain)
    closers.push(hostedStore.close)
    const hosted = createHostedTokens({ table: hostedStore.table, tokens, pairs, routing, writer: settings.writer, notes, settings: { get: settings.read }, logger })
    closers.push(() => hosted.close())

    // Step 3: the start sync, then what runs after it.
    await settings.start()
    await revocation.start()
    await hosted.resume()
    closers.push(settings.follow())

    // Step 4: HTTP.
    const contributions = createContributions({ mailbox, router: routing.router, sessionExists: sessionExistsIn(ctx), onToolsChanged: () => endpoint?.toolsChanged(), logger })
    const domain = createSessionDomain(ctx, { readLimits: limits, routing })
    const populate = createCoreTools({ pairs, mailbox, managed: routing.managed, domain, contributions, now: Date.now, logger })
    endpoint = createMcpEndpoint({
      gate, verifier, failures, pairs, secure: facts.secure,
      readEvents: (principalKey) => readEventsResource(mailbox, principalKey),
      populate, now: Date.now, logger,
    })
    closers.push(() => endpoint.close())
    closers.push(endpoint.presence.onChange((principalKey, connected) => {
      for (const listener of [...presenceListeners]) listener(principalKey, connected)
    }))

    let approval
    const dshPort = () => ctx.webServer.port
    const approvalPort = () => approval?.port() ?? settings.read().approvalPort
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
      dshName: ctx.webServer.getOrigin(), dshPort, approvalPort, now: Date.now, logger,
    })
    approval = createApprovalListener({
      handler, host: facts.host, port: settings.read().approvalPort, createServer: await serverFactory(ctx, facts.secure), logger,
    })
    closers.push(() => approval.close())
    void approval.start()
    // A change of `approval.port` rebinds at once (AUTH-DT-09 rule 5).
    closers.push(settings.onChange(() => { void approval.setPort(settings.read().approvalPort) }))

    for (const route of [...tokenEndpoint.routes, Object.freeze({ kind: ROUTE_KIND, path: PATHS.mcp, handler: endpoint.handler })]) {
      closers.push(ctx.webServer.register(route))
    }

    // Step 5: the host services and the owner-only pages.
    const ui = createUiBackend({ handover: routing.handover, maxNoteBytes: () => limits().maxMessageBytes, logger })
    closers.push(() => ui.close())
    routing.provide(ctx)
    contributions.provide(ctx)
    ui.provide(ctx)
    ctx.effect(() => ctx.provide(HOSTED_SERVICE.name, hosted.service), LABEL.services)
    registerSettingsPage(ctx, {
      tokens,
      state: () => settingsState({ tokens, pairs, presence, settings, approval }),
      logger,
    })

    return Object.freeze({ close: closeAll, tokens, pairs, routing, approval })
  }
}

/**
 * The settings page's read-only state (R-ID-12, AUTH-UC-09; R-OA-20's status): per token entry,
 * in settings order, its pair state, bound id, name, `lastSeenAt` and whether it is connected
 * now; and the approval listener's status and port. No value or digest: neither reaches here.
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
    designated: settings.read().agentToken ?? null,
  })
}
