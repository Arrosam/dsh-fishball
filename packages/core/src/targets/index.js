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
 *   `HOSTED_IMPORT.targetSetting.row`, whatever its value) always has the reserved parent first
 *   (`TARGETS.parentId`, order 0), whose URL is that setting's canonical value and which cannot be
 *   removed or re-pointed (`target-reserved`). Its epoch is generated as any other and renewed when
 *   the canonical value changes, retiring the old epoch as `setUrl` does but without confirmation:
 *   the instance owns the value (`link.d.ts`). A blank or unusable value keeps it `not-set`;
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
import { clearStaleParentCredentials, credentialNames, forgetCredentials } from '../link/credentials.js'
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
// A durable write failed: nothing changed, the caller may try again (the routes' 503, SEAM_TARGETS.unavailableCode).
const UNAVAILABLE = refusal(SEAM_TARGETS.unavailableCode)
// The lane `add` runs in (`serial`). A Symbol, so it can never equal a target id.
const ADD_LANE = Symbol('fishball-core targets: add')

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

/**
 * The instance's child settings, read once: `{hosted, url}`. Hosted exactly when the profile serves
 * that namespace (`link.d.ts`), whatever its value; `url` is its target value.
 */
function instanceOf(ctx) {
  const entry = ctx.settings.describe().find((candidate) => candidate.ns === HOSTED_IMPORT.targetSetting.row)
  return Object.freeze({ hosted: entry !== undefined, url: entry?.value?.[HOSTED_IMPORT.targetSetting.field] })
}

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
  const bindings = createBindings(tables.bindings, { warn: (error) => logger?.warn(TARGET_LOG.failed, TARGET_LOG.saveBinding, codeOf(error)) })
  const records = new Map([...tables.targets.entries()].map(([id, record]) => [id, record]))
  let closed = false
  let snapshot

  const warn = (what) => (error) => logger?.warn(TARGET_LOG.failed, what, codeOf(error))
  /**
   * Writes a record durably, then adopts it (PLAN-MULTI §3.1, review M2): a change that retires an
   * epoch is durable before the retirement runs, so a crash or a refused write can never bring a
   * retired epoch or a removed target back. Rejects when the write fails, adopting nothing.
   */
  async function save(record) {
    const frozen = Object.freeze(record)
    await tables.targets.put(frozen.id, frozen)
    records.set(frozen.id, frozen)
    return frozen
  }
  /** The name allocation of a rename (not a lifecycle change): adopted at once, persisted behind it. */
  const saveName = (record) => { void save(record).catch(warn(TARGET_LOG.save)) }
  const urlOf = (record) => record.url
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
      runningSessions: runtime.runningSessions(),
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
    // Adopted in memory before the write lands, so the façade renames at once; a failed write is
    // logged and the next discovery (any restart included) allocates again.
    const next = Object.freeze({ ...record, serverName, duplicateSuffix: allocateSuffix(serverName, taken) })
    records.set(id, next)
    saveName(next)
    runtimes.get(id)?.bridge.rename()
    refresh()
  }

  function startRuntime(record) {
    // A durable write already in flight may finish after shutdown began.
    if (closed) return
    const runtime = createTargetRuntime(ctx, {
      record, logger, asks, events, bindings, recovered, bridgeOptions, identityRecords,
      names: () => namesOf(records.get(record.id) ?? record),
      url: () => urlOf(record),
      isClosing: () => closed,
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

  /** Whether `source` is the epoch `old`. */
  const isEpoch = (old) => (source) => source?.targetId === old.targetId && source.endpointEpoch === old.endpointEpoch

  /**
   * Retires one epoch `old = {targetId, endpointEpoch}` (removal or endpoint change), after the
   * record change is durable (`save` / delete first, review M2): stops its runtime if it is the one
   * running (its late completions are fenced by their own disposal), drops its events waiting for
   * Fishball and voids its open cards (read-only history), and deletes its token material; nothing
   * remote. Also for an epoch with no runtime (a parent epoch the instance moved while core was
   * down: a cold restart must not adopt its material, MULTI-0 security amendment).
   */
  async function retire(old) {
    if (runtimes.get(old.targetId)?.endpointEpoch === old.endpointEpoch) await stopRuntime(old.targetId)
    events.retire(isEpoch(old))
    await asks.voidWhere(isEpoch(old)).catch(warn(TARGET_LOG.void))
    await forgetCredentials(ctx.credentials, credentialNames(old)).catch(warn(TARGET_LOG.forget))
  }

  /**
   * One target's lifecycle actions run one after another (remove, URL change, the parent's
   * renewal), so a second action never sees a target half way through a retirement (review m8).
   */
  const lanes = new Map()
  function serial(id, task) {
    if (closed) return Promise.resolve(UNAVAILABLE)
    const run = (lanes.get(id) ?? Promise.resolve()).then(task)
    const tail = run.then(() => undefined, () => undefined)
    lanes.set(id, tail)
    void tail.then(() => { if (lanes.get(id) === tail) lanes.delete(id) })
    return run
  }
  /** The URLs actions in flight are moving targets to: an `add` of one of them is a duplicate too (Q04). */
  const claimedUrls = new Set()

  const nextOrder = () => [...records.values()].reduce((highest, record) => Math.max(highest, record.order + 1), 0)
  // The parent is always first (order 0); an added target follows every other.
  const newRecord = (kind, url, id) => ({ id, kind, url, endpointEpoch: generateToken(TARGETS.epoch), order: kind === KIND.parent ? 0 : Math.max(nextOrder(), 1), serverName: null, duplicateSuffix: null })

  async function startCurrent(record) {
    if (closed) return
    // Fixed hosted names can outlive a crash between making a new epoch durable and retirement.
    if (record.kind === KIND.parent) await clearStaleParentCredentials(ctx.credentials, record.endpointEpoch)
    startRuntime(record)
  }

  /** Only a durable replacement retires an epoch. Restore its runtime if the write fails. */
  async function renew(current, url) {
    await stopRuntime(current.id)
    let next
    try { next = await save({ ...current, url, endpointEpoch: generateToken(TARGETS.epoch), serverName: null, duplicateSuffix: null }) } catch (error) {
      await startCurrent(current)
      refresh()
      throw error
    }
    await retire({ targetId: current.id, endpointEpoch: current.endpointEpoch })
    return next
  }

  /** The instance's value as the parent's URL: its canonical endpoint, or `''` when blank or unusable. */
  const parentUrl = (value) => {
    const endpoint = canonical(value)
    return endpoint.ok ? endpoint.href : ''
  }

  /**
   * The parent follows the profile (the module header): present in a hosted child, absent
   * standalone (its record kept, so its name allocation persists), and a new epoch for a new
   * canonical value. Serialised, because a retirement awaits its runtime's stop.
   */
  let parentSync = Promise.resolve()
  function syncParent() {
    parentSync = serial(TARGETS.parentId, async () => {
      if (closed) return
      const instance = instanceOf(ctx)
      const url = parentUrl(instance.url)
      const stored = records.get(TARGETS.parentId)
      if (!instance.hosted) {
        // No longer hosted: the parent leaves the list; its record stays (its name allocation), and
        // its open cards are voided, since nothing can answer them now (review nit 14).
        if (!runtimes.has(TARGETS.parentId)) return
        await stopRuntime(TARGETS.parentId)
        await asks.voidWhere(isEpoch({ targetId: stored.id, endpointEpoch: stored.endpointEpoch })).catch(warn(TARGET_LOG.void))
        refresh()
        return
      }
      // If the very first save fails there is no prior epoch; settingsChanged retries this sync.
      if (stored === undefined) await save(newRecord(KIND.parent, url, TARGETS.parentId))
      else if (stored.url !== url) await renew(stored, url)
      if (!runtimes.has(TARGETS.parentId)) await startCurrent(records.get(TARGETS.parentId))
      // The instance owns the parent's URL, so core cannot refuse a value an added target already
      // has (Q04); both then dial one endpoint, each with its own credentials. Logged so it is seen.
      if (url !== '' && ordered().some((record) => record.id !== TARGETS.parentId && record.url === url)) logger?.warn(TARGET_LOG.parentDuplicate)
      refresh()
    }).catch(warn(TARGET_LOG.save))
    return parentSync
  }

  /** A canonical endpoint some other current target already has (the parent's live URL included). */
  const taken = (href, except) => claimedUrls.has(href) || ordered().some((record) => record.id !== except && canonical(urlOf(record)).href === href)

  // Known: a current target, or one whose lifecycle action is in flight (`serial`).
  const known = (id) => (typeof id === 'string' && (runtimes.has(id) || lanes.has(id)) ? records.get(id) : undefined)

  const service = Object.freeze({
    list: () => snapshot,
    onChange: (fn) => subscribe(listeners, fn),
    async add(url) {
      const endpoint = canonical(url)
      if (!endpoint.ok) return endpoint
      if (taken(endpoint.href)) return refusal(REFUSAL.targetDuplicate)
      claimedUrls.add(endpoint.href)
      // Adds run one after another, so each new record's `order` follows every earlier one, and each
      // answer comes only once its record is durable.
      return serial(ADD_LANE, async () => {
        try {
          const record = await save(newRecord(KIND.remote, endpoint.href, generateToken(TARGETS.id)))
          startRuntime(record)
          refresh()
          return Object.freeze({ ok: true, targetId: record.id })
        } catch (error) { warn(TARGET_LOG.save)(error); return UNAVAILABLE }
      }).finally(() => claimedUrls.delete(endpoint.href))
    },
    remove(targetId, { confirmed = false } = {}) {
      const record = known(targetId)
      if (record === undefined) return Promise.resolve(UNKNOWN)
      if (record.kind === KIND.parent) return Promise.resolve(refusal(REFUSAL.targetReserved))
      if (confirmed !== true) return Promise.resolve(refusal(REFUSAL.confirmationRequired))
      return serial(targetId, async () => {
        const current = records.get(targetId)
        if (current === undefined) return UNKNOWN
        // Durable first (review M2): a failed delete changes nothing at all.
        try { await tables.targets.delete(targetId) } catch (error) { warn(TARGET_LOG.save)(error); return UNAVAILABLE }
        records.delete(targetId)
        await retire({ targetId, endpointEpoch: current.endpointEpoch })
        refresh()
        return OK
      })
    },
    setUrl(targetId, url, { confirmed = false } = {}) {
      const record = known(targetId)
      if (record === undefined) return Promise.resolve(UNKNOWN)
      if (record.kind === KIND.parent) return Promise.resolve(refusal(REFUSAL.targetReserved))
      const endpoint = canonical(url)
      if (!endpoint.ok) return Promise.resolve(endpoint)
      // The same endpoint, however spelled: no new epoch, nothing retired (PLAN-MULTI §3.1).
      if (endpoint.href === canonical(record.url).href) return Promise.resolve(OK)
      if (taken(endpoint.href, targetId)) return Promise.resolve(refusal(REFUSAL.targetDuplicate))
      if (confirmed !== true) return Promise.resolve(refusal(REFUSAL.confirmationRequired))
      claimedUrls.add(endpoint.href)
      return serial(targetId, async () => {
        const current = records.get(targetId)
        if (current === undefined) return UNKNOWN
        let next
        try { next = await renew(current, endpoint.href) } catch (error) { warn(TARGET_LOG.save)(error); return UNAVAILABLE }
        startRuntime(next)
        refresh()
        return OK
      }).finally(() => claimedUrls.delete(endpoint.href))
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
      runtime.reconnect()
      return OK
    },
    async choose(targetId, choice, options) {
      const runtime = known(targetId) && runtimes.get(targetId)
      if (!runtime) return UNKNOWN
      // The choice writes only this epoch's identity table keys. Drain it on close, but do not
      // make retirement wait for it: dispose fences its continuation, even after a failed renewal
      // restores the same epoch with a different runtime.
      return serial(runtime, () => runtime.pairing.choose(choice, options))
    },
  })

  /**
   * One target's Connect press. `via` is core's own Connect route's callback choice
   * (link/web-callback.js), passed through Connect's route-only `BEGIN_VIA`; it is not on the public
   * `service.begin`, so no other plugin reading `fishballInstance.ui.targets` chooses a redirect URI.
   */
  async function beginVia(targetId, via) {
    if (closed) return UNKNOWN
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
   * X12 / X8 bound to one target epoch, captured at creation (MULTI-0 `FishballTargetBound`,
   * `TargetSelector`): the
   * caller's expected `endpointEpoch` when it names one (a handle made from an event's or a card's
   * `source`, so a late one is never retargeted to a newer endpoint), else the epoch current now. A
   * call on a handle whose epoch is not current answers `unknown-target`, sending nothing.
   */
  function bound(target) {
    const runtime = runtimes.get(target?.targetId)
    // `TargetSelector.endpointEpoch`: absent means "the current endpoint"; any other non-string never matches.
    const epoch = target?.endpointEpoch === undefined ? runtime?.endpointEpoch : target.endpointEpoch
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

  /**
   * Core's settings changed (main/index.js): `link` (the client metadata URL or `identity.id`)
   * reconnects every link, `name` asks every pairing to send it; the instance's setting is followed
   * by `syncParent` (a new parent epoch, or the parent's appearance or removal).
   */
  function settingsChanged({ link, name }) {
    void syncParent()
    for (const runtime of runtimes.values()) {
      if (link) runtime.reconnect()
      if (name) void runtime.pairing.nameChanged()
    }
    refresh()
  }

  // Start: the records of this profile, then the parent if hosted (its epoch reconciled with the
  // instance's value before any of its credentials is read), then the sweep of retired epochs.
  for (const record of [...records.values()].sort((a, b) => a.order - b.order)) if (record.kind === KIND.remote) startRuntime(record)
  refresh()
  const startup = syncParent().then(sweep)

  /**
   * Voids every open card of an epoch that is no current record's (review M2): a retirement whose
   * voiding failed, or ended by a crash, is completed at the next start. Its events are never
   * delivered anyway (delivery's `live` check). Sends nothing.
   */
  function sweep() {
    if (closed) return undefined
    const current = (source) => records.get(source?.targetId)?.endpointEpoch === source.endpointEpoch
    return asks.voidWhere((source) => !current(source)).catch(warn(TARGET_LOG.void))
  }

  return Object.freeze({
    service,
    beginVia,
    targetBound,
    mount,
    settingsChanged,
    live: (source) => runtimeOf(source) !== undefined,
    callTool,
    ack: (receipts, source) => callTool(source, MCP.tools.inboxAck, { receipts }),
    /** Resolves once the parent follows the instance's current setting (a start or change in flight). */
    settled: () => parentSync,
    async close() {
      closed = true
      listeners.clear()
      // Stop links before draining writes: a held choice must not leave a retry timer running.
      // A queued retirement can still await disposal of the same runtime before clearing credentials.
      const stopping = [...runtimes.values()].map((runtime) => runtime.dispose())
      await Promise.all([startup, ...lanes.values(), ...stopping])
      await Promise.all([...runtimes.keys()].map(stopRuntime))
    },
  })
}
