/** Owner-page entrypoints for the dedicated sync capability. Never mounted as agent tools. */
import { randomUUID } from 'node:crypto'
import { ProviderSyncChannel } from './provider-sync-channel.js'
import { ProviderSyncEngine, ProviderSyncError } from './provider-sync.js'
import { ProviderSyncCoordinator } from './provider-sync-coordinator.js'
import { createProviderSyncCodec, providerSyncIdentity, PROVIDER_SYNC_TARGET } from './slim/child/provider-sync-target.js'

export const SYNC_PAGE = Object.freeze({ path: '/api/fishball/provider-sync', schemaVersion: '1',
  maxBodyBytes: 16384, method: 'POST', contentType: 'application/json',
  actions: Object.freeze(['status', 'invite', 'begin', 'approve', 'finish', 'preview', 'confirm', 'close']),
  action: Object.freeze({ status: 'status', invite: 'invite', begin: 'begin', approve: 'approve',
    finish: 'finish', preview: 'preview', confirm: 'confirm', close: 'close' }),
  state: Object.freeze({ inactive: 'inactive', closed: 'closed' }),
  code: Object.freeze({ closed: 'sync-closed', profile: 'profile-unavailable', action: 'invalid-action',
    inactive: 'sync-inactive', origin: 'sync-origin-refused', large: 'sync-request-too-large', refused: 'provider-sync-refused' }),
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  allowedSites: Object.freeze(['same-origin', 'none']), originHeader: 'origin', siteHeader: 'sec-fetch-site',
  hash: 'sha256', hashEncoding: 'hex', cleanupEffect: 'fishball: provider sync cleanup',
  routeEffect: 'fishball: provider sync owner route', requestBody: 'buffered', profileContext: 'profileContext',
  inventory: 'inventory', import: 'import', initialGeneration: 0,
  ok: 200, refused: 409, forbidden: 403, bad: 400,
})
const P = SYNC_PAGE
const A = P.action
const fail = (code) => { throw new ProviderSyncError(code) }
const defaultCreateHost = async (ctx, options) => {
  const { createProviderSyncHost } = await import('./provider-sync-host.js')
  return createProviderSyncHost(ctx, options)
}
const defaultCreateChannel = (options) => new ProviderSyncChannel(options)

/**
 * Internal test seam only: createHost(ctx,{identity}) and createChannel({identity,handle})
 * may be async factories. Supplying a safe identity avoids path/version lookup in fixtures.
 * Merely registering/status never creates a host, reads configuration or opens a listener;
 * only the explicit owner invite/begin actions may initialize the capability.
 */
export function registerProviderSync(ctx, { createHost = defaultCreateHost,
  createChannel = defaultCreateChannel, identity: suppliedIdentity } = {}) {
  let current; let initializing; let disposed = false; let generation = P.initialGeneration
  const runtimeId = randomUUID()
  const fixtureIdentity = suppliedIdentity === undefined ? undefined : Object.freeze({ ...suppliedIdentity })
  const assertCurrent = (record) => {
    if (disposed || record.generation !== generation || record.abort.signal.aborted) fail(P.code.closed)
  }
  const release = (record) => {
    if (!record) return Promise.resolve()
    record.abort.abort()
    record.coordinator?.close(); record.engine?.close()
    // A factory may still be pending during close. Do not cache an empty cleanup: if it
    // later returns a channel, the stale initializer must close that local channel too.
    if (!record.channel) return Promise.resolve()
    record.closing ??= Promise.resolve().then(() => record.channel.close())
    return record.closing
  }
  const runtimeIdentity = async () => {
    if (fixtureIdentity !== undefined) return fixtureIdentity
    const profile = ctx.get(P.profileContext)
    if (!profile?.dir) fail(P.code.profile)
    // Only canonical path identity is read, not profile/config/credential contents. The same
    // helper is the child target's identity, so both ends describe a profile one way.
    return providerSyncIdentity(profile, runtimeId)
  }
  const initialize = () => {
    if (disposed) fail(P.code.closed)
    if (initializing) return initializing.promise
    if (current) return Promise.resolve(current)
    const record = { generation, abort: new AbortController() }
    initializing = record
    record.promise = Promise.resolve().then(async () => {
      try {
        assertCurrent(record)
        const identity = await runtimeIdentity()
        assertCurrent(record)
        const host = await createHost(ctx, { identity })
        assertCurrent(record)
        record.engine = new ProviderSyncEngine({ host })
        record.channel = await createChannel({ identity, handle: (action, payload, peer, context) => {
          assertCurrent(record)
          if (action === P.inventory) return record.engine.preview(payload.source, peer)
          if (action === P.import) return record.engine.confirm(payload, peer, context)
          fail(P.code.action)
        } })
        assertCurrent(record)
        record.coordinator = new ProviderSyncCoordinator({ host, channel: record.channel })
        await record.channel.start()
        assertCurrent(record)
        current = record
        return record
      } catch (cause) {
        await release(record)
        throw cause
      } finally {
        // Never clear a newer initializer or dispose its resources from an older catch.
        if (initializing === record) initializing = undefined
      }
    })
    return record.promise
  }
  const close = async () => {
    generation++
    const prior = current; const pending = initializing
    current = undefined; initializing = undefined
    // Invalidate synchronously. Late factories can finish, but cannot start/publish a
    // listener; a channel already starting is closed via its owned cancellation path.
    await Promise.all([release(prior), release(pending)])
  }
  ctx.effect(() => () => { disposed = true; void close().catch(() => {}) }, P.cleanupEffect)
  const execute = async (input, signal) => {
    if (input.action === A.close) { await close(); return { state: P.state.closed } }
    if (disposed) fail(P.code.closed)
    if (input.action === A.status) return current ? current.channel.status() : { state: P.state.inactive }
    if (!current && !initializing && input.action !== A.invite && input.action !== A.begin) fail(P.code.inactive)
    const record = await initialize()
    assertCurrent(record)
    const { channel, coordinator } = record
    switch (input.action) {
      case A.invite: return { ...channel.status(), invitation: channel.invitation() }
      case A.begin: {
        const result = await channel.beginPair(input.invitation)
        assertCurrent(record)
        return result
      }
      case A.approve: return channel.approvePair(input.pairId)
      case A.finish:
        await channel.finishPair(input.pairId)
        assertCurrent(record)
        return channel.status()
      case A.preview: return coordinator.preview()
      case A.confirm: return coordinator.confirm({ previewId: input.previewId, ids: input.ids, confirmed: input.confirmed }, { signal })
      default: fail(P.code.action)
    }
  }

  ctx.effect(() => ctx.connection.fetch.register({ path: P.path, methods: [P.method], requestBody: P.requestBody,
    fetch: async (request) => {
      const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: P.headers })
      const requestUrl = new URL(request.url)
      const origin = request.headers.get(P.originHeader)
      const site = request.headers.get(P.siteHeader)
      if ((origin && origin !== requestUrl.origin) || (site && !P.allowedSites.includes(site))) {
        return reply(P.forbidden, { ok: false, code: P.code.refused })
      }
      try {
        const body = await request.text()
        if (Buffer.byteLength(body) > P.maxBodyBytes) fail(P.code.large)
        const input = JSON.parse(body)
        if (!input || typeof input !== 'object' || Array.isArray(input) || !P.actions.includes(input.action)) fail(P.code.action)
        // The DSH connection gateway authenticates the owner page. No secret-read tool or
        // browser payload is registered; credential transfer uses only the paired listener.
        return reply(P.ok, { ok: true, result: await execute(input, request.signal) })
      } catch {
        // Plugin/credential exceptions may contain data: never log, retain or echo them.
        return reply(P.refused, { ok: false, code: P.code.refused })
      }
    },
  }), P.routeEffect)
  return { close }
}

/* ---------------------------------------------------------------- the child target bridge */

/**
 * Host half of §10: the same preview/confirm flow with the isolated child as the target.
 *
 * The pairing channel cannot reach the child (it pairs two user-visible profiles over loopback),
 * so this bridge replaces its `peer()` with a transport view of the authenticated lifecycle wire:
 * the source host (this process) reads a selected record only inside the shared coordinator's
 * confirmation, and the child's endpoint runs the same ProviderSyncEngine over its own services.
 * The browser still receives only the preview metadata and per-item outcomes.
 *
 * T12 calls `nativeFishballRuntime.providerSync`:
 * - `status()` → `{state: 'inactive'|'ready', instanceId?}`
 * - `preview()` → `{ok:true, result:{previewId, source, target, groups, expiresAt}}`
 *   or `{ok:false, error:{code}}`
 * - `confirm({previewId, ids, confirmed:true}, {signal?})` →
 *   `{ok:true, result:{results, complete}}` or `{ok:false, error:{code}}`
 * Never retry an item whose status is `unknown`; start a fresh preview instead.
 *
 * Merge hooks (none of these files belong to T16):
 * 1. src/native-runtime/wire.js adds `provider-sync` as a payload channel beside `control` and
 *    `admin`, with the same per-channel backlog and byte bound.
 * 2. src/native-runtime/index.js exposes `onProviderSyncTransport(listener)` on the main runtime
 *    and publishes each authenticated wire's transport (with `{instanceId}` metadata).
 * 3. src/native-runtime/child.js exposes the same hook on the child runtime and publishes its end
 *    when the authenticated `control` request arrives.
 * 4. native-host.js creates one bridge, attaches it from `owner.onProviderSyncTransport`, exposes
 *    it as `service.providerSync`, and closes it in shutdown.
 * 5. src/native-runtime/overlay.js inserts the child row for src/slim/child/provider-sync-target.js.
 * 6. src/native-runtime/installation.js copyChildCode also copies src/provider-sync.js and
 *    src/provider-sync-host.js beside the snapshot's src/slim tree.
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
  }),
  timeoutMs: PROVIDER_SYNC_TARGET.limits.requestTimeoutMs,
  transportMethods: Object.freeze(['send', 'onMessage', 'onClose']),
})
const CHILD_ACTIONS = Object.freeze(Object.values(PROVIDER_SYNC_TARGET.actions))
const CHILD_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const childCode = (value) => typeof value === 'string' && value.length <= 128 && CHILD_CODE.test(value)
const childRefusal = (error) => ({ ok: false, error: { code: childCode(error?.code) ? error.code : CHILD_SYNC.code.failed } })

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
  #pairId
  #instanceId
  #targetIdentity
  #pending = new Map()
  #busy = false
  #sourceIdentityPromise
  #sourceHostPromise
  #coordinatorPromise

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
    this.#pairId = randomUUID()
    this.#instanceId = typeof metadata?.instanceId === 'string' && metadata.instanceId !== '' ? metadata.instanceId : undefined
    this.#targetIdentity = undefined
    this.#disposers.push(next.onMessage((encoded) => { this.#receive(encoded) }))
    this.#disposers.push(next.onClose(() => { if (this.#transport === next) this.detach() }))
  }

  detach() {
    for (const dispose of this.#disposers.splice(0)) { try { dispose() } catch { /* the wire is already gone */ } }
    this.#transport = undefined
    this.#pairId = undefined
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
   * the child the plan names.
   */
  peer() {
    if (this.#closed) throw new ProviderSyncError('sync-closed')
    if (this.#transport === undefined) return undefined
    const self = this
    return Object.freeze({
      pairId: this.#pairId,
      get identity() { return self.#targetIdentity },
      request: (action, payload, options) => self.request(action, payload, options),
    })
  }

  request(action, payload, options = {}) {
    if (this.#closed) return Promise.reject(new ProviderSyncError('sync-closed'))
    if (!CHILD_ACTIONS.includes(action)) return Promise.reject(new ProviderSyncError('invalid-selection'))
    if (this.#transport === undefined) return Promise.reject(new ProviderSyncError('not-paired'))
    if (this.#busy) return Promise.reject(new ProviderSyncError('sync-busy'))
    this.#busy = true
    return this.#exchange(action, payload, options).finally(() => { this.#busy = false })
  }

  async preview() {
    try { return { ok: true, result: await (await this.#coordinator()).preview() } }
    catch (error) { return childRefusal(error) }
  }

  async confirm(input, options = {}) {
    try {
      const coordinator = await this.#coordinator()
      return { ok: true, result: await coordinator.confirm({
        previewId: input?.previewId,
        ids: input?.ids,
        confirmed: input?.confirmed,
      }, options) }
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
    if (this.#closed) throw new ProviderSyncError('sync-closed')
    if (this.#transport === undefined) throw new ProviderSyncError('not-paired')
    this.#coordinatorPromise ??= (async () => new ProviderSyncCoordinator({ host: await this.#sourceHost(), channel: this }))()
    return this.#coordinatorPromise
  }

  async #exchange(action, payload, { signal } = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw new ChildSyncError(CHILD_SYNC.code.failed)
    const peer = await this.#sourceIdentity()
    if (signal?.aborted) throw new ProviderSyncError('cancelled')
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
