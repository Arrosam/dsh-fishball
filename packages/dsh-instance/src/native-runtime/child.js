import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpath, readFile, chmod, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { RUNTIME, runtimeLimits, fail, loopbackOrigin } from './constants.js'
import { jsonPrivate, readPrivate, writePrivate, privateDirectory, launchPath, snapshotPath, pathsFor, lifecycleLog } from './files.js'
import { inside } from 'dsh-connector-shared/files'
import { Wire, ChannelPublisher, proof, sameProof } from './wire.js'
import { admissionKey, createTicketRedeemer } from './ticket.js'

/** What a ready child reports beside its origin (the host checks the same list, index.js readyHealth). */
const READY_CAPABILITIES = Object.freeze([...RUNTIME.requiredServices, RUNTIME.capabilities.admission, RUNTIME.capabilities.lifecycle])

/**
 * The base DSH services a hosted child must have mounted (RUNTIME.requiredServices).
 * @param ctx - `{get(name)}`, the lifecycle row's context
 * @throws {NativeRuntimeError} `MISSING_CAPABILITY` when one is absent
 */
export function requireBaseServices(ctx) {
  for (const service of RUNTIME.requiredServices) if (ctx.get(service) === undefined) fail('MISSING_CAPABILITY')
}

/**
 * The V3 readiness gate (I-READY), on generic DSH signals in the child only: the base services are
 * mounted, the child's `appReady` has fired, and the child-side row `dsh-instance-child` has
 * registered its admission route and published the web server, which answers its origin (it does
 * only once it listens). F-WIRE (2026-11-16): core offers no readiness signal to the instance, by
 * design (R-ARCH-10; R-FB-10 as amended by 1.39), so nothing of core is read here and no HTTP probe
 * is made: V2's gate needed core's own loopback app server, a bearer probe of it and a
 * launch-token cookie probe, and V2 was never deployed. The K3 vocabulary is unchanged (child.d.ts:
 * "The child's lifecycle state (V2 STATUS, unchanged)", `ChildState = 'disabled' | 'waiting' |
 * 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed'`); a child that never becomes ready is a
 * failed start, `NATIVE_START_FAILED` or `NATIVE_TIMEOUT` (K3 `LifecycleCode`), as before.
 * @param state - `{ctx: {get(name)}, appReady: boolean, web: (() => string) | undefined, stopped: boolean}`
 * @returns `{origin, capabilities}` while ready, else null (the child answers `starting`)
 */
export function childReadiness({ ctx, appReady, web, stopped }) {
  if (stopped || !appReady || web === undefined) return null
  try {
    requireBaseServices(ctx)
    return { origin: loopbackOrigin(web()), capabilities: READY_CAPABILITIES }
  } catch { return null }
}

/** Mounted only by the explicit private CLI overlay, not the legacy Fishball entrypoint. */
export async function applyNativeChild(ctx, config) {
  // Imported here, not at the top: the module opens the parent pipe (fd 3) as it loads, so a static
  // import would make this file's pure readiness rule unloadable outside a hosted child. In the
  // child the launch's `--import` preload has already loaded it, so this is the same instance; the
  // snapshot copies it as a listed entry (RUNTIME.snapshot.entries), not as a static import.
  const { registerParentShutdown } = await import('./parent-watch.js')
  registerParentShutdown(code => ctx.appExit(code))
  process.umask(RUNTIME.privateDirectoryMode ^ 0o777)
  const limits = runtimeLimits(config.limits)
  const paths = pathsFor(config.mainHome)
  const directory = launchPath(paths, config.instanceId)
  await privateDirectory(paths.root)
  await lifecycleLog(paths, 'CHILD_BOOT', limits.maxLogBytes)
  await privateDirectory(directory)
  const marker = await jsonPrivate(path.join(paths.root, RUNTIME.marker))
  const record = await jsonPrivate(path.join(paths.root, RUNTIME.active))
  if (marker.hostId !== config.hostId || record.hostId !== marker.hostId || record.instanceId !== config.instanceId) fail('CHILD_IDENTITY_MISMATCH')
  const launchOwner = await jsonPrivate(path.join(directory, RUNTIME.marker))
  if (launchOwner.instanceId !== record.instanceId || launchOwner.hostId !== record.hostId) fail('CHILD_IDENTITY_MISMATCH')
  const snapshot = snapshotPath(paths, record.instanceId)
  if (fileURLToPath(new URL('../../native-child.js', import.meta.url)) !== path.join(snapshot, 'native-child.js') || await realpath(snapshot) !== snapshot) fail('CHILD_SNAPSHOT_MISMATCH')
  await privateDirectory(snapshot)
  const snapshotOwner = await jsonPrivate(path.join(snapshot, RUNTIME.marker))
  if (snapshotOwner.hostId !== record.hostId || snapshotOwner.instanceId !== record.instanceId || snapshotOwner.installAnchor !== record.installAnchor || snapshotOwner.version !== record.version) fail('CHILD_SNAPSHOT_MISMATCH')
  if (await realpath(ctx.profileContext.installAnchor) !== record.installAnchor || ctx.profileContext.home !== paths.home || ctx.profileContext.dir !== paths.profile || process.cwd() !== paths.workspace) fail('CHILD_PROFILE_MISMATCH')
  const manifest = JSON.parse(await readFile(record.installAnchor, 'utf8'))
  if (manifest.name !== RUNTIME.packageName || manifest.version !== record.version) fail('CHILD_VERSION_MISMATCH')
  const resolution = ctx.pluginPackages.resolution
  if (!resolution || resolution.profileDir !== paths.profile) fail('CHILD_RESOLUTION_MISMATCH')
  const core = new Map()
  for (const entry of resolution.entries) {
    const physical = await realpath(entry.packageDir)
    if (entry.scope === 'installation') {
      if (!inside(record.installRoot, physical)) fail('CHILD_RESOLUTION_MISMATCH')
      core.set(entry.name, physical)
    } else if (core.has(entry.name) && core.get(entry.name) !== physical) fail('CHILD_RESOLUTION_MISMATCH')
  }
  const secret = await readPrivate(path.join(paths.root, RUNTIME.secret))
  // T16's provider-sync target and the hosted token's probe and one import (credential.js), each
  // on its own payload channel of the host's attached wire.
  const channels = Object.freeze({ providerSync: new ChannelPublisher(), credential: new ChannelPublisher() })
  // The host's one attached connection (operation `attach`).
  let current
  // The readiness signals (childReadiness): appReady fired, and the web published by the child-side row.
  let appReady = false
  let web
  let readyLogged = false
  let stopped = false
  const readiness = () => childReadiness({ ctx, appReady, web, stopped })
  /** One CHILD_READY line, at the first health or signal that finds the child ready. */
  const noteReady = () => {
    if (readyLogged || readiness() === null) return
    readyLogged = true
    void lifecycleLog(paths, 'CHILD_READY', limits.maxLogBytes).catch(() => {})
  }
  const identity = { hostId: marker.hostId, instanceId: record.instanceId }
  // The frame's tickets: the key comes from the lifecycle secret, never from an overlay.
  const tickets = createTicketRedeemer(admissionKey(secret), identity.instanceId)
  const service = {
    ...identity,
    /**
     * The provider-sync transport of the current authenticated connection (T16). It exists only
     * after the mutual HMAC proof and carries no operation of its own; the child-side row's
     * target attaches its endpoint when this fires.
     */
    onProviderSyncTransport: (listener) => channels.providerSync.subscribe(listener),
    /** The `mcp-credential` transport of the current authenticated connection; same rules as above. */
    onCredentialTransport: (listener) => channels.credential.subscribe(listener),
    /** Redeems one admission ticket for this generation (design §4.1; ticket.js createTicketRedeemer). */
    redeemTicket: (ticket, audience) => tickets.redeem(ticket, audience),
    /**
     * The child-side row's readiness signal (I-READY): its admission route is registered and
     * `origin()` reads the child's web server origin (`webServer.getOrigin()`, which throws until it
     * listens). Only the latest publication counts.
     * @param origin - `() => string`
     * @returns its disposer, which withdraws readiness (the child answers `starting` again)
     */
    publishWeb(origin) {
      web = origin
      noteReady()
      return () => { if (web === origin) web = undefined }
    },
  }
  ctx.provide('nativeRuntime', service)
  const connections = new Set()
  const server = net.createServer(socket => {
    if (connections.size >= limits.maxConnections) return socket.destroy()
    const wire = new Wire(socket, limits)
    connections.add(wire)
    const nonce = randomUUID()
    const timer = setTimeout(() => wire.close(), limits.requestTimeoutMs)
    wire.once('closed', () => {
      clearTimeout(timer); connections.delete(wire)
      if (current?.wire === wire) current = undefined
      for (const channel of Object.values(channels)) channel.drop(wire)
    })
    wire.on('auth', message => {
      if (message.channel !== 'auth' || message.step !== 'hello' || message.nonce !== nonce || message.hostId !== identity.hostId || message.instanceId !== identity.instanceId || typeof message.challenge !== 'string' || !sameProof(message.proof, proof(secret, 'main', identity, [nonce, message.challenge]))) return wire.close()
      clearTimeout(timer)
      wire.authenticated = true
      wire.send({ channel: 'auth', step: 'accepted', challenge: message.challenge, nonce, proof: proof(secret, 'child', identity, [nonce, message.challenge]) })
    })
    wire.on('request', async message => {
      try {
        let payload
        if (message.operation === RUNTIME.operation.health) {
          const ready = readiness()
          noteReady()
          payload = { state: ready ? RUNTIME.healthState.ready : RUNTIME.healthState.starting, ...identity, pid: process.pid, version: manifest.version, installAnchor: record.installAnchor, capabilities: ready?.capabilities ?? [], origin: ready?.origin ?? null }
        } else if (message.operation === RUNTIME.operation.attach) {
          if (readiness() === null || current) fail('ATTACH_BUSY')
          const metadata = { ...identity, connectionId: randomUUID() }
          current = { wire, metadata }
          // T16's target and the hosted token's channel come up with the attach on the same
          // authenticated wire; their frames are buffered until their child-side parts attach, so
          // publishing here, before the reply lets the host send one, is enough.
          channels.providerSync.publish(wire, wire.providerSyncTransport())
          channels.credential.publish(wire, wire.credentialTransport())
          payload = metadata
        } else if (message.operation === RUNTIME.operation.stop) {
          stopped = true
          payload = { stopping: true }
        }
        else fail('UNKNOWN_LIFECYCLE_OPERATION')
        wire.send({ channel: 'lifecycle', replyTo: message.id, payload })
        if (message.operation === RUNTIME.operation.stop) setImmediate(() => ctx.appExit(0))
      } catch { if (!wire.closed) wire.send({ channel: 'lifecycle', replyTo: message.id, error: true }) }
    })
    wire.send({ channel: 'auth', step: 'challenge', nonce })
  })
  server.on('error', () => { if (!stopped) ctx.appExit(1) })
  const socketPath = path.join(directory, RUNTIME.socketName)
  const unix = Buffer.byteLength(socketPath) <= RUNTIME.socketPathBytes
  const endpoint = unix ? { kind: 'unix', path: socketPath } : { kind: 'tcp', host: RUNTIME.host, port: 0 }
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(unix ? socketPath : { host: RUNTIME.host, port: 0 }, () => { server.off('error', reject); resolve() })
  })
  if (unix) await chmod(socketPath, RUNTIME.privateFileMode)
  else endpoint.port = server.address().port
  await writePrivate(path.join(directory, RUNTIME.pid), { ...identity, pid: process.pid })
  await writePrivate(path.join(directory, RUNTIME.endpoint), { ...identity, endpoint })
  await lifecycleLog(paths, 'CHILD_LISTEN', limits.maxLogBytes)
  // A base service missing once the child's app is ready can never appear later: fail at once.
  const cancelReady = ctx.appReady.onReady(() => {
    try { requireBaseServices(ctx) } catch {
      void lifecycleLog(paths, 'CHILD_FAILED', limits.maxLogBytes).catch(() => {}).then(() => ctx.appExit(1))
      return
    }
    appReady = true
    noteReady()
  })
  // Cordis 4 has no 'dispose' event: a listener registered there never runs, and the lifecycle
  // server then keeps the event loop alive after appExit, so the parent waited out its whole
  // stopTimeout. The row's teardown must be an effect.
  ctx.effect(() => async () => {
    stopped = true; web = undefined; cancelReady(); for (const channel of Object.values(channels)) channel.clear()
    for (const wire of connections) wire.close()
    await new Promise(resolve => server.close(resolve))
    await unlink(path.join(directory, RUNTIME.endpoint)).catch(error => { if (error.code !== 'ENOENT') throw error })
    // net.Server removes its own Unix socket; no PID is ever used as signal authority.
  })
  return service
}
