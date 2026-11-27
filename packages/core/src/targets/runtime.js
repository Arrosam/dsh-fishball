/**
 * One target epoch's runtime (task MULTI-1; PLAN-MULTI §3.1, §4, §5): the existing link (with its
 * pairing gate), credentials and Connect, bridge façade and poll pipeline, composed once for one
 * `(targetId, endpointEpoch)` and disposed alone. Nothing here is shared with another target but the
 * collection's stores and services passed in; a failure of one target never stalls another.
 *
 * The poll pipeline (F-WIRE "store the card before the ack", unchanged): every `inbox_poll` page is
 * first taken by the ask cards and only then handed to the interception service event by event, with
 * this epoch's trusted `source`. A page waits for the ledger's recovery before any intake.
 */
import { APPROVAL, MCP, TARGETS } from '../../contracts/constants.js'
import { createBridge } from '../bridge/index.js'
import { codeOf } from '../events/diagnostics.js'
import { createPairing, createRecords } from '../identity/index.js'
import { LINK, LINK_SAVE, createLinkCredentials, emitIsolated, subscribe } from '../link/index.js'
import { credentialNames } from '../link/credentials.js'
import { ASK_TOOL } from '../asks/index.js'
import { TARGET_LOG } from './constants.js'
import { toolNameOf } from './names.js'
import { createRunningSessions } from './sessions.js'

const ORIGIN = TARGETS.toolName.origin

/**
 * @param {object} ctx core's main row context (`credentials`, `authorization`, `on`, `logger`)
 * @param {object} options
 * @param {{id: string, endpointEpoch: string}} options.record the target record at creation
 * @param {() => {serverName: string | null, name: string | null}} options.names the target's current names
 * @param {() => unknown} options.url the endpoint captured for this epoch
 * @param {() => boolean} options.isClosing whether the collection has begun draining its writes
 * @param {() => string} options.clientId `identity.id`; `options.clientMetadataUrl`, `options.name` the settings
 * @param {object} options.identityRecords the identity records KvTable (scoped here)
 * @param {object} options.asks the ask cards (`take`, `toolFor`, `reconcile`, `answered`, `drained`)
 * @param {object} options.events the interception (`intake`)
 * @param {{admit(name: string, tuple: string): boolean}} options.bindings the tool bindings
 * @param {Promise<void>} options.recovered settles once the ledger's recovery ran
 * @param {object} options.bridgeOptions the façade's shared options (logger, attachments, imagesSupported)
 * @param {(serverName: string) => void} options.onServerName the link discovered a (new) server name
 * @param {object} [options.watch] whether a Fishball page watches (targets/index.js `deps.watch`)
 */
export function createTargetRuntime(ctx, options) {
  const { record, names, url, clientId, clientMetadataUrl, name, identityRecords, asks, events, bindings, recovered, bridgeOptions, onServerName, watch, logger } = options
  const targetId = record.id
  const endpointEpoch = record.endpointEpoch
  const listeners = new Set()
  const disposers = []
  const changed = () => emitIsolated(listeners, undefined)
  const source = () => Object.freeze({ targetId, endpointEpoch, ...names() })
  let disposed = false
  let disposal
  const isRetired = () => disposed || options.isClosing()

  const credentialNamesOf = credentialNames({ targetId, endpointEpoch })
  const credentials = createLinkCredentials(ctx, { target: url, clientId, clientMetadataUrl, names: credentialNamesOf })
  const pairing = createPairing({
    records: createRecords(identityRecords, { targetId, endpointEpoch }),
    isRetired, name, target: url, credentials: credentials.credentials, logger: ctx.logger?.(LINK_SAVE.logger),
  })
  const { link } = pairing
  const reconnect = () => { if (!isRetired()) link.reconnect() }
  disposers.push(credentials.onChange(reconnect))

  /** The naming of this epoch's façade (bridge/index.js header): target-qualified, binding-checked. */
  const naming = Object.freeze({
    finalName: (facade, rawName) => toolNameOf(source(), facade, rawName, ORIGIN.remote),
    localName: (facade) => toolNameOf(source(), facade, facade, ORIGIN.local),
    admit: (entry) => {
      const admitted = bindings.admit(entry.modelName, entry.tuple)
      if (!admitted) logger?.warn(TARGET_LOG.binding, JSON.stringify(entry.modelName))
      return admitted
    },
    label: () => Object.freeze({ name: names().name, targetId }),
  })
  // This epoch's `ask_user`: files offers of this target epoch only (asks/index.js `toolFor`).
  const locals = Object.freeze([Object.freeze({ facade: ASK_TOOL.fileCard, build: (modelName) => asks.toolFor(source(), modelName) })])
  // The sidebar's running managed sessions of this epoch (sessions.js): refreshed on connect, on a
  // polled session event, after Fishball's own session calls and, while a page watches, on an
  // interval; fenced by this disposal. Subscribed
  // before the view's own status listener, so a link that leaves `connected` has cleared its list
  // before the view is rebuilt.
  const sessions = createRunningSessions(link, { onChange: changed, watch, logger })
  disposers.push(sessions.dispose)

  // Fishball's own accepted answer settles its request; the connector sends no settlement for it (asks/index.js `answered`).
  const called = (toolName, args, result) => {
    if (toolName === MCP.tools.approvalAnswer && args.answer?.decision !== APPROVAL.decision.escalate && result?.ok === true) {
      void asks.answered(source(), args)
    }
    sessions.called(toolName)
  }
  const bridge = createBridge({ link, naming, locals, called, ...bridgeOptions })
  disposers.push(bridge.onChange(changed))

  let listed = false
  disposers.push(link.onTools(() => { listed = true }))
  disposers.push(link.onStatus(changed), link.onDetail(changed), pairing.onChange(changed), credentials.connect.onChange(changed))

  // A newly discovered server name is the collection's to allocate (names.js); it then renames the façade.
  let lastName = null
  disposers.push(link.onDetail((detail) => {
    if (detail.serverName === null || detail.serverName === lastName) return
    lastName = detail.serverName
    onServerName(detail.serverName)
  }))

  // The pipeline of this epoch's pages (the module header).
  let pipeline = recovered
  disposers.push(link.onPoll((result) => {
    // Each page is its own link of the chain and ends caught, so one failed page never stops the
    // pages after it (a page left untaken is polled again: nothing was acked for it).
    pipeline = pipeline.then(async () => {
      if (disposed) return
      const at = source()
      const unstored = new Set(await asks.take(result, at))
      if (result?.ok !== true || !Array.isArray(result.events)) return
      for (const event of result.events) {
        if (disposed || unstored.has(event?.eventId)) continue
        try { await events.intake(event, at) } catch (error) { logger?.warn(TARGET_LOG.failed, TARGET_LOG.intake, codeOf(error)) }
      }
    }).catch((error) => logger?.warn(TARGET_LOG.failed, TARGET_LOG.page, codeOf(error)))
  }))

  // The ask cards' reconciliation of this epoch, once, at its first `connected` (as F-WIRE's).
  let reconciled = false
  disposers.push(link.onStatus((status) => {
    if (status.state !== LINK.state.connected) return
    void pipeline.then(() => asks.retryHandoffs?.(source())).catch((error) => logger?.warn(TARGET_LOG.failed, TARGET_LOG.reconcile, codeOf(error)))
    if (reconciled) return
    reconciled = true
    void pipeline.then(() => asks.drained()).then(() => asks.reconcile(source())).catch((error) => logger?.warn(TARGET_LOG.failed, TARGET_LOG.reconcile, codeOf(error)))
  }))

  return Object.freeze({
    targetId,
    endpointEpoch,
    link,
    pairing,
    connect: credentials.connect,
    bridge,
    credentialNames: credentialNamesOf,
    source,
    /** Whether the bridge listed tools at least once on this epoch (`TargetView.contributedTools` is `null` before). */
    listed: () => listed,
    /** This epoch's running managed sessions, `null` before the first answer on the current connection (`TargetView.runningSessions`). */
    runningSessions: sessions.list,
    start: () => { if (!isRetired()) link.start() },
    reconnect,
    /** Calls `fn()` after any change of what this epoch's view shows. Returns its disposer. */
    onChange: (fn) => subscribe(listeners, fn),
    /** Stops everything of this epoch: no request, status or registration after it. */
    dispose() {
      if (disposed) return disposal
      disposed = true
      // Shutdown and a queued retirement can both need to wait for credential writes to settle.
      disposal = (async () => {
        for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* one disposer's fault never stops the rest */ } }
        listeners.clear()
        bridge.close()
        await Promise.all([link.stop(), credentials.dispose()])
      })()
      return disposal
    },
  })
}
