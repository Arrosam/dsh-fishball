/**
 * Core's target collection (task MULTI-1; PLAN-MULTI §3–§5, D01, D07, D09, Q01–Q12; MULTI-0
 * `contracts/targets.d.ts` `FishballTargets`, `FishballTargetBound`, `link.d.ts` hosted reservation).
 *
 * One Fishball manager holds a list of ordinary MCP client connections, one per target (D01). This
 * module owns that list: the durable records (`store.js`), one runtime per current target epoch
 * (`runtime.js`, the existing link, credentials, pairing and façade composed for it), the display
 * names, and the target-addressed actions. Everything global stays once in core's main row: the
 * manager, the ledger and interception, the ask cards, reminders, guards and the settings.
 *
 * Rules:
 * - standalone starts empty; a hosted child (DSH lists the instance's child settings namespace,
 *   `HOSTED_IMPORT.targetSetting.row`) always has the reserved parent first (`TARGETS.parentId`,
 *   epoch `parentId` too, order 0), whose URL is read live from that setting and which cannot be
 *   removed or re-pointed (`target-reserved`);
 * - `add` refuses a URL the link would refuse (`target-invalid` for anything not usable, blank
 *   included; `target-insecure`) and a canonical MCP URL already in the list (`target-duplicate`,
 *   Q04; the parent's included). No count cap (Q12);
 * - `remove` and an endpoint-changing `setUrl` need `{confirmed: true}` (Q07). Both dispose the old
 *   epoch's runtime, void its open ask cards, delete its token material and keep its history
 *   (ledger records, cards) read-only; nothing is sent remotely. `setUrl` starts a new epoch, with
 *   no name until it is discovered (Q01). A URL that canonicalises to the current endpoint changes
 *   nothing;
 * - names (D07, Q03): a target whose discovered server name changed claims it, or the lowest free
 *   ` (n)`, among the other targets' current resolved names (`names.js`); its record is updated,
 *   its façade renamed; no other target is touched;
 * - `live(source)`: whether `source`'s `(targetId, endpointEpoch)` is a current epoch. Routing of
 *   acks, answers and calls goes through it, so a retired epoch's record is never answered again.
 */
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { CONNECT, HOSTED_IMPORT, LINK, MCP, TARGETS } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { generateToken } from '../identity/identity.js'
import { checkTarget, emitIsolated, subscribe } from '../link/index.js'
import { BEGIN_VIA } from '../link/connect.js'
import { forgetCredentials } from '../link/credentials.js'
import { stripLine } from '../status/line.js'
import { TARGET_LOG } from './constants.js'
import { allocateSuffix, resolvedName } from './names.js'
import { createTargetRuntime } from './runtime.js'
import { createBindings } from './store.js'

const STATE = SEAM_TARGETS.state
const KIND = SEAM_TARGETS.kind
const REFUSAL = SEAM_TARGETS.refusal
const OK = Object.freeze({ ok: true })
const refusal = (code) => Object.freeze({ ok: false, code })
const UNKNOWN = refusal(REFUSAL.unknownTarget)

/** `SEAM_TARGETS.state`'s rule (its comment), first match wins; an unknown word is `failed`, never success. */
function publicState(link, connect, connecting) {
  if (link.state === LINK.state.connected) return STATE.connected
  if (connecting || connect?.state === CONNECT.state.authorizing) return STATE.connecting
  if (link.state === LINK.state.unset) return STATE.notSet
  return STATE.failed
}

/** The canonical MCP endpoint of a usable URL (`checkTarget`), or the refusal of an unusable one. */
function canonical(url) {
  const checked = checkTarget(url)
  if (checked.ok) return Object.freeze({ ok: true, href: checked.url.href })
  return refusal(checked.status.code === LINK.code.insecure ? LINK.code.insecure : LINK.code.invalid)
}

/** Whether the profile serves the instance's child settings namespace: a hosted child (`link.d.ts`). */
const hostedIn = (ctx) => ctx.settings.describe().some((entry) => entry.ns === HOSTED_IMPORT.targetSetting.row)
const instanceUrl = (ctx) => ctx.settings.describe().find((entry) => entry.ns === HOSTED_IMPORT.targetSetting.row)?.value?.[HOSTED_IMPORT.targetSetting.field]

/**
 * @param {object} ctx core's main row context
 * @param {object} deps
 * @param {{targets: object, bindings: object}} deps.tables the target records and tool bindings (`openTargets`)
 * @param {object} deps.identityRecords the identity records KvTable
 * @param {object} deps.asks the ask cards (asks/index.js)
 * @param {object} deps.events the interception service's intake (events/index.js)
 * @param {Promise<void>} deps.recovered settles once the ledger's recovery ran
 * @param {object} deps.settings `{clientId, clientMetadataUrl, name}` live reads of core's settings
 * @param {object} deps.bridgeOptions the façade options every target shares
 * @param {{warn: Function}} [deps.logger]
 */
export function createTargets(ctx, { tables, identityRecords, asks, events, recovered, settings, bridgeOptions, logger }) {
  const listeners = new Set()
  const runtimes = new Map()
  const mounts = new Set()
  const bindings = createBindings(tables.bindings)
  const records = new Map([...tables.targets.entries()].map(([id, record]) => [id, record]))
  let closed = false
  let snapshot
  let instance = instanceUrl(ctx)

  const warn = (what) => (error) => logger?.warn(TARGET_LOG.failed, what, codeOf(error))
  const save = (record) => {
    records.set(record.id, Object.freeze(record))
    void tables.targets.put(record.id, records.get(record.id)).catch(warn(TARGET_LOG.save))
  }
  const urlOf = (record) => (record.kind === KIND.parent ? instance : record.url)
  const namesOf = (record) => Object.freeze({ serverName: record.serverName, name: resolvedName(record.serverName, record.duplicateSuffix) })
  const ordered = () => [...records.values()].filter((record) => runtimes.has(record.id)).sort((a, b) => a.order - b.order)

  function viewOf(record) {
    const runtime = runtimes.get(record.id)
    const link = runtime.link.status()
    const connect = runtime.connect.status()
    const detail = runtime.link.detail()
    const strip = stripLine(link, urlOf(record), connect)
    const editable = record.kind !== KIND.parent
    return Object.freeze({
      targetId: record.id, endpointEpoch: record.endpointEpoch, ...namesOf(record),
      kind: record.kind, url: typeof urlOf(record) === 'string' ? urlOf(record) : '', order: record.order, duplicateSuffix: record.duplicateSuffix,
      state: publicState(link, connect, detail.connecting), connecting: detail.connecting, link, connect,
      line: strip.line, control: strip.control, pairing: runtime.pairing.state(), identity: detail.identity,
      contributedTools: runtime.listed() ? runtime.bridge.contributedCount() : null, removable: editable, urlEditable: editable,
    })
  }

  /** Rebuilds the snapshot and emits it when it changed. */
  function refresh() {
    if (closed) return
    const next = Object.freeze({ version: SEAM_TARGETS.snapshotVersion, targets: Object.freeze(ordered().map(viewOf)) })
    if (snapshot !== undefined && JSON.stringify(next) === JSON.stringify(snapshot)) return
    snapshot = next
    emitIsolated(listeners, snapshot)
  }

  /** A newly discovered server name of `id` (the module header's naming rule). */
  function named(id, serverName) {
    const record = records.get(id)
    if (record === undefined || record.serverName === serverName) return
    // The other CURRENT targets' complete names (D07 "other current target"): a stored parent record
    // of a profile that is no longer hosted holds no name.
    const taken = new Set(ordered().filter((other) => other.id !== id && other.serverName !== null).map((other) => resolvedName(other.serverName, other.duplicateSuffix)))
    save({ ...record, serverName, duplicateSuffix: allocateSuffix(serverName, taken) })
    runtimes.get(id)?.bridge.rename()
    refresh()
  }

  function startRuntime(record) {
    const runtime = createTargetRuntime(ctx, {
      record, logger, asks, events, bindings, recovered, bridgeOptions, identityRecords,
      names: () => namesOf(records.get(record.id) ?? record),
      url: () => urlOf(records.get(record.id) ?? record),
      clientId: settings.clientId, clientMetadataUrl: settings.clientMetadataUrl, name: settings.name,
      onServerName: (serverName) => named(record.id, serverName),
    })
    runtimes.set(record.id, runtime)
    runtime.onChange(refresh)
    for (const tools of mounts) tools.disposers.set(runtime, runtime.bridge.mount(tools.tools))
    runtime.start()
    return runtime
  }

  async function stopRuntime(id) {
    const runtime = runtimes.get(id)
    if (runtime === undefined) return undefined
    runtimes.delete(id)
    for (const mount of mounts) { mount.disposers.get(runtime)?.(); mount.disposers.delete(runtime) }
    await runtime.dispose()
    return runtime
  }

  /** Retires one epoch (removal or endpoint change): its runtime, open cards and token material; nothing remote. */
  async function retire(id) {
    const runtime = await stopRuntime(id)
    if (runtime === undefined) return
    const { targetId, endpointEpoch } = runtime
    await asks.voidWhere((source) => source.targetId === targetId && source.endpointEpoch === endpointEpoch).catch(warn(TARGET_LOG.reconcile))
    await forgetCredentials(ctx.credentials, runtime.credentialNames).catch(warn(TARGET_LOG.forget))
  }

  const nextOrder = () => [...records.values()].reduce((highest, record) => Math.max(highest, record.order + 1), 0)
  const newRecord = (kind, url, id) => ({ id, kind, url, endpointEpoch: id === TARGETS.parentId ? TARGETS.parentId : generateToken(TARGETS.epoch), order: id === TARGETS.parentId ? 0 : nextOrder(), serverName: null, duplicateSuffix: null })

  /** The parent follows the profile: present in a hosted child, absent standalone (its record kept). */
  function syncParent() {
    const hosted = hostedIn(ctx)
    if (hosted && !runtimes.has(TARGETS.parentId)) {
      if (!records.has(TARGETS.parentId)) save(newRecord(KIND.parent, '', TARGETS.parentId))
      startRuntime(records.get(TARGETS.parentId))
    } else if (!hosted && runtimes.has(TARGETS.parentId)) void stopRuntime(TARGETS.parentId).then(refresh)
  }

  /** A canonical endpoint some other current target already has (the parent's live URL included). */
  const taken = (href, except) => ordered().some((record) => record.id !== except && canonical(urlOf(record)).href === href)

  const known = (id) => (typeof id === 'string' && runtimes.has(id) ? records.get(id) : undefined)

  const service = Object.freeze({
    list: () => snapshot,
    onChange: (fn) => subscribe(listeners, fn),
    async add(url) {
      const endpoint = canonical(url)
      if (!endpoint.ok) return endpoint
      if (taken(endpoint.href)) return refusal(REFUSAL.targetDuplicate)
      const record = newRecord(KIND.remote, endpoint.href, generateToken(TARGETS.id))
      save(record)
      startRuntime(record)
      refresh()
      return Object.freeze({ ok: true, targetId: record.id })
    },
    async remove(targetId, { confirmed = false } = {}) {
      const record = known(targetId)
      if (record === undefined) return UNKNOWN
      if (record.kind === KIND.parent) return refusal(REFUSAL.targetReserved)
      if (confirmed !== true) return refusal(REFUSAL.confirmationRequired)
      await retire(targetId)
      records.delete(targetId)
      await tables.targets.delete(targetId).catch(warn(TARGET_LOG.save))
      refresh()
      return OK
    },
    async setUrl(targetId, url, { confirmed = false } = {}) {
      const record = known(targetId)
      if (record === undefined) return UNKNOWN
      if (record.kind === KIND.parent) return refusal(REFUSAL.targetReserved)
      const endpoint = canonical(url)
      if (!endpoint.ok) return endpoint
      // The same endpoint, however spelled: no new epoch, nothing retired (PLAN-MULTI §3.1).
      if (endpoint.href === canonical(record.url).href) return OK
      if (taken(endpoint.href, targetId)) return refusal(REFUSAL.targetDuplicate)
      if (confirmed !== true) return refusal(REFUSAL.confirmationRequired)
      await retire(targetId)
      const next = { ...record, url: endpoint.href, endpointEpoch: generateToken(TARGETS.epoch), serverName: null, duplicateSuffix: null }
      save(next)
      startRuntime(next)
      refresh()
      return OK
    },
    begin: (targetId) => beginVia(targetId, undefined),
    async cancel(targetId) {
      const runtime = known(targetId) && runtimes.get(targetId)
      if (!runtime) return UNKNOWN
      runtime.connect.cancel()
      return OK
    },
    async retry(targetId) {
      const runtime = known(targetId) && runtimes.get(targetId)
      if (!runtime) return UNKNOWN
      runtime.link.reconnect()
      return OK
    },
    async choose(targetId, choice, options) {
      const runtime = known(targetId) && runtimes.get(targetId)
      if (!runtime) return UNKNOWN
      return runtime.pairing.choose(choice, options)
    },
  })

  /**
   * One target's Connect press. `via` is core's own Connect route's callback choice
   * (link/web-callback.js), passed through Connect's route-only `BEGIN_VIA`; it is not on the public
   * `service.begin`, so no other plugin reading `fishballInstance.ui.targets` chooses a redirect URI.
   */
  async function beginVia(targetId, via) {
    const runtime = known(targetId) && runtimes.get(targetId)
    if (!runtime) return UNKNOWN
    return via === undefined ? runtime.connect.begin() : runtime.connect[BEGIN_VIA](via)
  }

  /** The current runtime of `source`'s epoch, or `undefined` (removed target, retired epoch). */
  const runtimeOf = (source) => {
    const runtime = runtimes.get(source?.targetId)
    return runtime !== undefined && runtime.endpointEpoch === source.endpointEpoch ? runtime : undefined
  }

  /** A call through `source`'s own link; a retired epoch's call never reached any target (`disconnected`). */
  const callTool = (source, name, args) => {
    const runtime = runtimeOf(source)
    return runtime === undefined ? Promise.resolve({ ok: false, code: LINK.disconnected }) : runtime.link.callTool(name, args)
  }

  /**
   * X12 / X8 bound to one target epoch, captured at creation (MULTI-0 `FishballTargetBound`): a
   * later call on a handle whose epoch is no longer current answers `unknown-target`, sending nothing.
   */
  function bound(target) {
    const runtime = runtimes.get(target?.targetId)
    const epoch = runtime?.endpointEpoch
    return () => {
      const current = runtimes.get(target?.targetId)
      return current !== undefined && current.endpointEpoch === epoch ? current : undefined
    }
  }
  const targetBound = Object.freeze({
    bridge(pluginId, operations, target) {
      const current = bound(target)
      // Built on the target's façade at once, so its argument checks throw as X12's always did.
      const scoped = current()?.bridge.bridge(pluginId, operations)
      return Object.freeze({
        supports: (name) => current() !== undefined && scoped !== undefined && scoped.supports(name),
        call: (name, args) => (current() === undefined || scoped === undefined ? Promise.resolve(UNKNOWN) : scoped.call(name, args)),
      })
    },
    attention: Object.freeze({
      signal(pluginId, input, target) {
        const runtime = bound(target)()
        return runtime === undefined ? Promise.resolve(UNKNOWN) : runtime.bridge.attention.signal(pluginId, input)
      },
    }),
  })

  /** Offers every current and future target's tools into one DSH `tools` service (the manager's scope). */
  function mount(tools) {
    if (closed) return () => {}
    const entry = { tools, disposers: new Map() }
    mounts.add(entry)
    for (const runtime of runtimes.values()) entry.disposers.set(runtime, runtime.bridge.mount(tools))
    return () => {
      if (!mounts.delete(entry)) return
      for (const dispose of entry.disposers.values()) dispose()
    }
  }

  /** Core's settings changed: the link's, the pairing's and the instance's inputs (main/index.js). */
  function settingsChanged({ link, name }) {
    const nextInstance = instanceUrl(ctx)
    const parentMoved = nextInstance !== instance
    instance = nextInstance
    syncParent()
    for (const runtime of runtimes.values()) {
      if (link || (parentMoved && runtime.targetId === TARGETS.parentId)) runtime.link.reconnect()
      if (name) void runtime.pairing.nameChanged()
    }
    refresh()
  }

  // Start: the records of this profile, then the parent if hosted.
  for (const record of [...records.values()].sort((a, b) => a.order - b.order)) if (record.kind === KIND.remote) startRuntime(record)
  syncParent()
  refresh()

  return Object.freeze({
    service,
    beginVia,
    targetBound,
    mount,
    settingsChanged,
    live: (source) => runtimeOf(source) !== undefined,
    callTool,
    ack: (receipts, source) => callTool(source, MCP.tools.inboxAck, { receipts }),
    async close() {
      closed = true
      listeners.clear()
      await Promise.all([...runtimes.keys()].map(stopRuntime))
    },
  })
}
