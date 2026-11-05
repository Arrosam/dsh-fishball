/**
 * The main host's half of provider sync into the isolated Fishball (§10).
 *
 * The page never selects anything: "Refresh models" asks `sync()`, which previews and confirms on
 * the host in one step (src/slim/host/provider-sync-routes.js). The browser receives only provider
 * names, outcomes and reason codes — never a preview id, an endpoint, a key or a mask.
 */
import { randomUUID } from 'node:crypto'
import { ProviderSyncError } from './provider-sync.js'
import { ProviderSyncCoordinator } from './provider-sync-coordinator.js'
import { createProviderSyncCodec, providerSyncIdentity, PROVIDER_SYNC_TARGET } from './slim/child/provider-sync-target.js'

/** The owner route's transport rules; the slim route module reads them (provider-sync-routes.js). */
export const SYNC_PAGE = Object.freeze({
  maxBodyBytes: 16384,
  code: Object.freeze({ profile: 'profile-unavailable', large: 'sync-request-too-large', refused: 'provider-sync-refused' }),
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  allowedSites: Object.freeze(['same-origin', 'none']), originHeader: 'origin', siteHeader: 'sec-fetch-site',
  profileContext: 'profileContext',
})
const P = SYNC_PAGE
const defaultCreateHost = async (ctx, options) => {
  const { createProviderSyncHost } = await import('./provider-sync-host.js')
  return createProviderSyncHost(ctx, options)
}

/* ---------------------------------------------------------------- the child target bridge */

/**
 * Host half of §10: the shared preview/confirm rules with the isolated child as the target.
 *
 * The child is started and owned by this host, so there is no pairing: the bridge's `peer()` is a
 * transport view of the authenticated lifecycle wire. The source host (this process) reads a
 * selected record only inside the shared coordinator's confirmation, and the child's endpoint runs
 * the same ProviderSyncEngine over its own services.
 *
 * `nativeFishballRuntime.providerSync`:
 * - `status()` → `{state: 'inactive'|'ready', instanceId?}`
 * - `sync()` → `{ok:true, result:{items:[{id, name, outcome, reason?}]}}` or `{ok:false, error:{code}}`.
 *   It previews, then confirms every "will add" item in one step: the user asked for "Refresh
 *   models" to bring DSH's API-key providers over with no extra step (§10). Each item is `added`,
 *   `present` (Fishball already has it), `skipped` (with a reason: conflict, OAuth login, ...) or
 *   `failed` (with a reason). Concurrent calls share one run.
 *
 * Wiring: src/native-runtime/wire.js carries the `provider-sync` payload channel;
 * src/native-runtime/index.js and child.js publish each end through `onProviderSyncTransport`;
 * native-host.js attaches this bridge and exposes it as `service.providerSync`;
 * src/native-runtime/overlay.js mounts src/slim/child/provider-sync-target.js in the child; and
 * src/native-runtime/installation.js copies src/provider-sync.js and src/provider-sync-host.js
 * beside the child's src/slim tree.
 */
export const CHILD_SYNC = Object.freeze({
  state: Object.freeze({ inactive: 'inactive', ready: 'ready' }),
  code: Object.freeze({
    failed: 'child-sync-failed',
    timeout: 'child-sync-timeout',
    disconnected: 'child-sync-disconnected',
    invalidResponse: 'child-sync-invalid-response',
    limit: 'child-sync-too-large',
    cancelled: 'child-sync-cancelled',
    unavailable: 'child-sync-unavailable',
    closed: 'sync-closed',
    busy: 'sync-busy',
    selection: 'invalid-selection',
  }),
  /** What the page shows per provider; the engine's finer config/key outcomes stay on the host. */
  outcome: Object.freeze({ added: 'added', present: 'present', skipped: 'skipped', failed: 'failed' }),
  /** The engine's per-item statuses (src/provider-sync.js confirm). */
  status: Object.freeze({ succeeded: 'succeeded', skipped: 'skipped', partial: 'partial', unknown: 'unknown' }),
  /** Reasons the bridge adds when the engine's item carries none. */
  reason: Object.freeze({ unknown: 'result-unknown', keyNotSaved: 'key-not-saved', failed: 'sync-failed' }),
  timeoutMs: PROVIDER_SYNC_TARGET.limits.requestTimeoutMs,
  transportMethods: Object.freeze(['send', 'onMessage', 'onClose']),
})
const O = CHILD_SYNC.outcome
const CHILD_ACTIONS = Object.freeze(Object.values(PROVIDER_SYNC_TARGET.actions))
const CHILD_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const childCode = (value) => typeof value === 'string' && value.length <= 128 && CHILD_CODE.test(value)
const childRefusal = (error) => ({ ok: false, error: { code: childCode(error?.code) ? error.code : CHILD_SYNC.code.failed } })

/** One confirmed item's page outcome. A `skipped` item without a reason lost a race to an existing entry. */
function resultOutcome(result) {
  const S = CHILD_SYNC.status
  const R = CHILD_SYNC.reason
  if (result.status === S.succeeded) return [O.added]
  if (result.status === S.skipped) return result.reason ? [O.skipped, result.reason] : [O.present]
  // An unknown result may have committed. It is never retried here; the next Refresh previews
  // afresh, and the engine then lists it as present or offers its missing key again.
  if (result.status === S.unknown) return [O.failed, R.unknown]
  if (result.status === S.partial) return [O.failed, result.reason ?? R.keyNotSaved]
  return [O.failed, result.reason ?? R.failed]
}

/**
 * The browser's view of one sync: provider id, display name, outcome and reason code only. The
 * preview's endpoints, protocols, model lists and fixed key mask stay on this host.
 */
function syncSummary(groups, results) {
  const names = new Map(Object.values(groups).flat().map((item) => [item.id, item.name]))
  const entry = (id, outcome, reason) => ({ id, name: names.get(id) ?? id, outcome, ...(reason ? { reason } : {}) })
  return [
    ...results.map((result) => entry(result.id, ...resultOutcome(result))),
    ...groups.existsSkip.map((item) => entry(item.id, O.present)),
    ...[...groups.conflictSkip, ...groups.unsupported].map((item) => entry(item.id, O.skipped, item.reason)),
  ]
}

/** A transport failure, deliberately not a ProviderSyncError: a sent write may have committed. */
class ChildSyncError extends Error {
  constructor(code) {
    super('Fishball child provider sync failed.')
    this.name = 'ChildSyncError'
    this.code = code
  }
}

/** Create the main-side bridge. Pass `identity` in fixtures to avoid profile lookup. */
export function createChildProviderSync(options = {}) { return new ChildProviderSync(options) }

class ChildProviderSync {
  #ctx
  #createHost
  #suppliedIdentity
  #codec
  #closed = false
  #transport
  #disposers = []
  #connectionId
  #instanceId
  #targetIdentity
  #pending = new Map()
  #busy = false
  #sourceIdentityPromise
  #sourceHostPromise
  #coordinatorPromise
  #running

  constructor({ ctx, identity, createHost = defaultCreateHost } = {}) {
    if (typeof createHost !== 'function') throw new TypeError('fishball child provider sync: createHost must be a function')
    this.#ctx = ctx
    this.#createHost = createHost
    this.#suppliedIdentity = identity
    this.#codec = createProviderSyncCodec()
  }

  /** The page's availability probe; the lifecycle's own status stays service.status(). */
  status() {
    return Object.freeze({
      state: this.#transport === undefined ? CHILD_SYNC.state.inactive : CHILD_SYNC.state.ready,
      ...(this.#instanceId === undefined ? {} : { instanceId: this.#instanceId }),
    })
  }

  /**
   * Attach the provider-sync transport of one authenticated child connection. A replaced
   * transport rejects whatever was in flight: the child restarted, so an answer cannot belong
   * to this connection and is never retried.
   */
  attach(next, metadata = {}) {
    if (this.#closed) throw new Error('fishball child provider sync: the bridge is closed')
    for (const method of CHILD_SYNC.transportMethods) {
      if (typeof next?.[method] !== 'function') throw new TypeError('fishball child provider sync: the transport must implement ' + method)
    }
    this.detach()
    this.#transport = next
    this.#connectionId = randomUUID()
    this.#instanceId = typeof metadata?.instanceId === 'string' && metadata.instanceId !== '' ? metadata.instanceId : undefined
    this.#targetIdentity = undefined
    this.#disposers.push(next.onMessage((encoded) => { this.#receive(encoded) }))
    this.#disposers.push(next.onClose(() => { if (this.#transport === next) this.detach() }))
  }

  detach() {
    for (const dispose of this.#disposers.splice(0)) { try { dispose() } catch { /* the wire is already gone */ } }
    this.#transport = undefined
    this.#connectionId = undefined
    this.#instanceId = undefined
    this.#targetIdentity = undefined
    this.#rejectPending(CHILD_SYNC.code.disconnected)
  }

  close() {
    if (this.#closed) return
    this.#closed = true
    this.detach()
    const coordinator = this.#coordinatorPromise
    this.#coordinatorPromise = undefined
    if (coordinator !== undefined) coordinator.then((value) => value.close()).catch(() => {})
  }

  /**
   * The coordinator's channel view. The target identity is learned from the target engine's own
   * inventory answer, so the preview's fingerprint check compares the child that answered with
   * the child the plan names. `connectionId` changes with every attached wire, so a child restart
   * between preview and confirm voids the preview.
   */
  peer() {
    if (this.#closed) throw new ProviderSyncError(CHILD_SYNC.code.closed)
    if (this.#transport === undefined) return undefined
    const self = this
    return Object.freeze({
      connectionId: this.#connectionId,
      get identity() { return self.#targetIdentity },
      request: (action, payload, options) => self.request(action, payload, options),
    })
  }

  request(action, payload, options = {}) {
    if (this.#closed) return Promise.reject(new ProviderSyncError(CHILD_SYNC.code.closed))
    if (!CHILD_ACTIONS.includes(action)) return Promise.reject(new ProviderSyncError(CHILD_SYNC.code.selection))
    if (this.#transport === undefined) return Promise.reject(new ProviderSyncError(CHILD_SYNC.code.unavailable))
    if (this.#busy) return Promise.reject(new ProviderSyncError(CHILD_SYNC.code.busy))
    this.#busy = true
    return this.#exchange(action, payload, options).finally(() => { this.#busy = false })
  }

  /**
   * Bring the main DSH's API-key providers into the child: preview, then confirm every "will add"
   * item. The engine still re-checks both sides' identity, versions and revisions right before
   * each write, and skips anything Fishball already has. Concurrent calls (a double click, two
   * tabs) share the run in flight instead of being refused.
   *
   * No caller signal is taken: abandoning a page mid-write would only turn committed writes into
   * "unknown". Each wire request is bounded by CHILD_SYNC.timeoutMs, and close() aborts the rest.
   */
  sync() {
    this.#running ??= this.#runSync().finally(() => { this.#running = undefined })
    return this.#running
  }

  async #runSync() {
    try {
      const coordinator = await this.#coordinator()
      const plan = await coordinator.preview()
      const ids = plan.groups.add.map((item) => item.id)
      const results = ids.length === 0 ? []
        : (await coordinator.confirm({ previewId: plan.previewId, ids, confirmed: true })).results
      return { ok: true, result: { items: syncSummary(plan.groups, results) } }
    } catch (error) { return childRefusal(error) }
  }

  async #sourceIdentity() {
    this.#sourceIdentityPromise ??= (async () => {
      if (this.#suppliedIdentity !== undefined) return Object.freeze({ ...this.#suppliedIdentity })
      const profile = this.#ctx?.get(P.profileContext)
      if (!profile?.dir) throw new ProviderSyncError(P.code.profile)
      return providerSyncIdentity(profile, randomUUID())
    })()
    return this.#sourceIdentityPromise
  }

  #sourceHost() {
    this.#sourceHostPromise ??= (async () => this.#createHost(this.#ctx, { identity: await this.#sourceIdentity() }))()
    return this.#sourceHostPromise
  }

  async #coordinator() {
    if (this.#closed) throw new ProviderSyncError(CHILD_SYNC.code.closed)
    if (this.#transport === undefined) throw new ProviderSyncError(CHILD_SYNC.code.unavailable)
    this.#coordinatorPromise ??= (async () => new ProviderSyncCoordinator({ host: await this.#sourceHost(), channel: this }))()
    return this.#coordinatorPromise
  }

  async #exchange(action, payload, { signal } = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw new ChildSyncError(CHILD_SYNC.code.failed)
    const peer = await this.#sourceIdentity()
    if (signal?.aborted) throw new ProviderSyncError(CHILD_SYNC.code.cancelled)
    const id = randomUUID()
    let encoded
    try { encoded = this.#codec.encode(this.#codec.request(action, peer, payload, id)) }
    catch (error) {
      throw new ChildSyncError(error?.code === PROVIDER_SYNC_TARGET.code.limit ? CHILD_SYNC.code.limit : CHILD_SYNC.code.failed)
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, action, timer: undefined, signal, abort: undefined }
      entry.timer = setTimeout(() => {
        if (!this.#pending.delete(id)) return
        this.#detachAbort(entry)
        reject(new ChildSyncError(CHILD_SYNC.code.timeout))
      }, CHILD_SYNC.timeoutMs)
      entry.timer.unref?.()
      if (signal !== undefined) {
        entry.abort = () => {
          if (!this.#pending.delete(id)) return
          clearTimeout(entry.timer)
          // A request already sent may still commit; the coordinator reports that item as unknown.
          reject(new ChildSyncError(CHILD_SYNC.code.cancelled))
        }
        signal.addEventListener('abort', entry.abort, { once: true })
      }
      this.#pending.set(id, entry)
      if (signal?.aborted) { entry.abort(); return }
      try { this.#transport.send(encoded) } catch {
        if (!this.#pending.delete(id)) return
        clearTimeout(entry.timer)
        this.#detachAbort(entry)
        reject(new ChildSyncError(CHILD_SYNC.code.disconnected))
      }
    })
  }

  #receive(encoded) {
    if (this.#closed) return
    let frame
    try { frame = this.#codec.decode(encoded) } catch { return }
    if (!frame || typeof frame !== 'object' || typeof frame.id !== 'string') return
    const entry = this.#pending.get(frame.id)
    // A reply to nothing: a late answer to a timed-out request, or another instance's frame.
    // Dropping it is the only safe answer; nothing is retried.
    if (entry === undefined) return
    this.#pending.delete(frame.id)
    clearTimeout(entry.timer)
    this.#detachAbort(entry)
    let outcome
    try { outcome = this.#codec.acceptReply(frame, entry.action) } catch {
      entry.reject(new ChildSyncError(CHILD_SYNC.code.invalidResponse))
      return
    }
    if (!outcome.ok) {
      const code = outcome.error.code
      entry.reject(code === PROVIDER_SYNC_TARGET.code.failed ? new ChildSyncError(code) : new ProviderSyncError(code))
      return
    }
    if (entry.action === PROVIDER_SYNC_TARGET.actions.inventory) {
      this.#targetIdentity = Object.freeze({ ...outcome.result.target })
    }
    entry.resolve(outcome.result)
  }

  #rejectPending(code) {
    for (const [id, entry] of [...this.#pending]) {
      this.#pending.delete(id)
      clearTimeout(entry.timer)
      this.#detachAbort(entry)
      entry.reject(new ChildSyncError(code))
    }
  }

  #detachAbort(entry) {
    if (entry.abort === undefined) return
    try { entry.signal?.removeEventListener('abort', entry.abort) } catch { /* already aborted */ }
    entry.abort = undefined
  }
}
