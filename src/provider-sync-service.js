/** Owner-page entrypoints for the dedicated sync capability. Never mounted as agent tools. */
import { createHash, randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { ProviderSyncChannel } from './provider-sync-channel.js'
import { ProviderSyncEngine, ProviderSyncError } from './provider-sync.js'
import { ProviderSyncCoordinator } from './provider-sync-coordinator.js'

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
    // Only canonical path identity is read, not profile/config/credential contents.
    const canonical = await realpath(profile.dir)
    return { runtimeId, profileId: createHash(P.hash).update(canonical).digest(P.hashEncoding),
      schemaVersion: P.schemaVersion, version: getDshRuntimeVersion() }
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
