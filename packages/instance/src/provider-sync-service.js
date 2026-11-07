/**
 * The main host's half of provider sync into the isolated Fishball (§10, D26).
 *
 * The "Model for Fishball" block on the instance's Plugins card (client.js) has one button, Check
 * for new models. `check()` previews once and lists only what the child lacks; the user ticks
 * whole providers and `add({checkId, ids})` confirms exactly those
 * (src/slim/host/provider-sync-routes.js). The browser receives provider ids, names, model ids,
 * outcomes, reason codes and the opaque one-use check id — never an endpoint, a protocol, a key, a
 * mask or an environment variable's name.
 */
import { randomUUID } from 'node:crypto'
import { ProviderSyncError } from './provider-sync.js'
import { ProviderSyncCoordinator } from './provider-sync-coordinator.js'
import { createProviderSyncCodec, providerSyncIdentity, PROVIDER_SYNC_TARGET } from './slim/child/provider-sync-target.js'

/** The owner route's transport rules; the slim route module reads them (provider-sync-routes.js). */
export const SYNC_PAGE = Object.freeze({
  maxBodyBytes: 16384,
  code: Object.freeze({ profile: 'profile-unavailable', large: 'sync-request-too-large', refused: 'provider-sync-refused', payload: 'invalid-payload' }),
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  allowedSites: Object.freeze(['same-origin', 'none']), siteHeader: 'sec-fetch-site',
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
 * - `check()` → `{ok:true, result:{checkId, missing:[{id, name, models}], notOffered:[{id, name,
 *   reason}], present}}` or `{ok:false, error:{code}}`. One preview: `missing` is the engine's
 *   `add` group, `notOffered` its conflict and unsupported groups, `present` the count of what the
 *   child already has. Concurrent calls share the check in flight (D26: "Concurrent presses share
 *   the check in flight").
 * - `add({checkId, ids})` → `{ok:true, result:{items:[{id, outcome, reason?}]}}` or
 *   `{ok:false, error:{code}}`. Confirms exactly `ids` of that check; each is `added`, `skipped`
 *   or `failed`. Unchosen entries are neither written nor reported.
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
  /** What the page shows per chosen provider (§10); the engine's finer config/key outcomes stay on the host. */
  outcome: Object.freeze({ added: 'added', skipped: 'skipped', failed: 'failed' }),
  /** The engine's per-item statuses (src/provider-sync.js confirm). */
  status: Object.freeze({ succeeded: 'succeeded', skipped: 'skipped', partial: 'partial', unknown: 'unknown' }),
  /** Reasons the bridge adds when the engine's item carries none. */
  reason: Object.freeze({ unknown: 'result-unknown', keyNotSaved: 'key-not-saved', failed: 'sync-failed', exists: 'provider-exists' }),
  timeoutMs: PROVIDER_SYNC_TARGET.limits.requestTimeoutMs,
  transportMethods: Object.freeze(['send', 'onMessage', 'onClose']),
})
const O = CHILD_SYNC.outcome
const CHILD_ACTIONS = Object.freeze(Object.values(PROVIDER_SYNC_TARGET.actions))
const CHILD_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const childCode = (value) => typeof value === 'string' && value.length <= 128 && CHILD_CODE.test(value)
const childRefusal = (error) => ({ ok: false, error: { code: childCode(error?.code) ? error.code : CHILD_SYNC.code.failed } })

/**
 * One confirmed item's page outcome. The engine reports an entry created meanwhile (it lost the
 * create-only race) as `skipped` with no reason; the page names that `provider-exists`, the
 * engine's own refusal code for it.
 */
function resultOutcome(result) {
  const S = CHILD_SYNC.status
  const R = CHILD_SYNC.reason
  if (result.status === S.succeeded) return [O.added]
  if (result.status === S.skipped) return [O.skipped, result.reason ?? R.exists]
  // An unknown result may have committed. It is never retried here; the next Check previews
  // afresh, and the engine then counts it as present or offers its missing key again.
  if (result.status === S.unknown) return [O.failed, R.unknown]
  if (result.status === S.partial) return [O.failed, result.reason ?? R.keyNotSaved]
  return [O.failed, result.reason ?? R.failed]
}

/** The browser's view of one check (§10): names and model ids only, never an endpoint or a mask. */
function checkSummary(plan) {
  const { add, existsSkip, conflictSkip, unsupported } = plan.groups
  return {
    checkId: plan.previewId,
    missing: add.map(({ id, name, models }) => ({ id, name, models: [...models] })),
    notOffered: [...conflictSkip, ...unsupported].map(({ id, name, reason }) => ({ id, name, reason })),
    present: existsSkip.length,
  }
}

const itemOf = (result) => {
  const [outcome, reason] = resultOutcome(result)
  return { id: result.id, outcome, ...(reason ? { reason } : {}) }
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
  #checking

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
   * Fetch once (§10 step 1): one preview against the child. The engine computes what the child
   * lacks at this moment; nothing about a past check is kept, so each press lists only what is
   * missing now. Concurrent calls (a double click, two tabs) share the check in flight.
   */
  check() {
    this.#checking ??= this.#runCheck().finally(() => { this.#checking = undefined })
    return this.#checking
  }

  async #runCheck() {
    try { return { ok: true, result: checkSummary(await (await this.#coordinator()).preview()) } }
    catch (error) { return childRefusal(error) }
  }

  /**
   * Write only the chosen ones (§10 step 3). The coordinator consumes the check id, refuses an id
   * outside its `add` group (`invalid-selection`), an expired or unknown id (`preview-expired`), a
   * child that restarted since the check (`repreview-required`) and a second Add while one runs
   * (`sync-busy`), all before any key is read. A lost answer to the import makes each sent entry
   * `failed` `result-unknown`, never retried.
   *
   * An empty selection is refused here, before the coordinator, so it does not consume the check:
   * the card disables Add while nothing is ticked, and an empty write has nothing to confirm.
   *
   * No caller signal is taken: abandoning a page mid-write would only turn committed writes into
   * "unknown". Each wire request is bounded by CHILD_SYNC.timeoutMs, and close() aborts the rest.
   */
  async add({ checkId, ids } = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return childRefusal({ code: CHILD_SYNC.code.selection })
    try {
      const { results } = await (await this.#coordinator()).confirm({ previewId: checkId, ids, confirmed: true })
      return { ok: true, result: { items: results.map(itemOf) } }
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
