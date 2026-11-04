import net from 'node:net'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpath, readFile, chmod, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { registerParentShutdown } from './parent-watch.js'
import { RUNTIME, runtimeLimits, fail, NativeRuntimeError, appAccess } from './constants.js'
import { BEARER, ROUTES } from '../slim/contract.js'
import { jsonPrivate, readPrivate, writePrivate, privateDirectory, launchPath, snapshotPath, pathsFor, inside, lifecycleLog } from './files.js'
import { Wire, proof, sameProof } from './wire.js'

const HTTP = Object.freeze({ success: 200 })
async function probeHttp(url, timeoutMs, bearer) {
  return new Promise((resolve, reject) => {
    const headers = bearer === undefined ? {} : { [BEARER.header]: BEARER.scheme + BEARER.separator + bearer }
    const request = http.get(url, { headers, agent: false }, response => {
      const result = { status: response.statusCode }
      response.resume()
      response.on('end', () => resolve(result))
      response.on('error', () => reject(new NativeRuntimeError('APP_AUTH_NOT_READY')))
    })
    request.setTimeout(timeoutMs, () => request.destroy())
    request.on('error', () => reject(new NativeRuntimeError('APP_AUTH_NOT_READY')))
  })
}

/** The child owns the contract routes without the broker prefix, exactly as the app server does (§3.1). */
const HEALTH_PATH = ROUTES.api.slice(ROUTES.prefix.length) + 'health'

/**
 * The slim readiness gate (§2.3): the base core services are mounted, the app row published its
 * loopback service while booting, and that server accepts the bearer it minted. The previous gate
 * exchanged the DSH Web UI's own login cookie, which only exists when the Web bundle runs.
 */
async function authenticatedReadiness(ctx, limits) {
  for (const service of RUNTIME.requiredServices) if (ctx.get(service) === undefined) fail('MISSING_CAPABILITY')
  const app = ctx.get(RUNTIME.appService)
  if (app === undefined) fail('APP_NOT_PUBLISHED')
  const access = appAccess(app)
  const health = new URL(HEALTH_PATH, access.origin).href
  const anonymous = await probeHttp(health, limits.requestTimeoutMs)
  if (anonymous.status !== BEARER.unauthorizedStatus) fail('APP_AUTH_NOT_READY')
  const authenticated = await probeHttp(health, limits.requestTimeoutMs, access.bearer)
  if (authenticated.status !== HTTP.success) fail('APP_AUTH_NOT_READY')
  return { access, capabilities: [...RUNTIME.requiredServices, RUNTIME.capabilities.authenticatedApp, RUNTIME.capabilities.lifecycle, RUNTIME.capabilities.control] }
}

/** Mounted only by the explicit private CLI overlay, not the legacy Fishball entrypoint. */
export async function applyNativeChild(ctx, config) {
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
  const listeners = new Set()
  let current
  let ready
  let stopped = false
  const identity = { hostId: marker.hostId, instanceId: record.instanceId }
  const service = {
    ...identity,
    onControlTransport(listener) {
      listeners.add(listener)
      if (current) listener(current.transport, current.metadata)
      return () => listeners.delete(listener)
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
        if (message.operation === 'health') payload = { state: ready ? 'ready' : 'starting', ...identity, pid: process.pid, version: manifest.version, installAnchor: record.installAnchor, capabilities: ready?.capabilities ?? [], access: ready?.access ?? null }
        else if (message.operation === 'control') {
          if (!ready || current) fail('CONTROL_BUSY')
          const metadata = { ...identity, connectionId: randomUUID() }
          current = { wire, transport: wire.controlTransport(), metadata }
          // Register receivers before the main logical host emits its protocol greeting.
          for (const listener of listeners) listener(current.transport, metadata)
          payload = metadata
        } else if (message.operation === 'stop') payload = { stopping: true }
        else fail('UNKNOWN_LIFECYCLE_OPERATION')
        wire.send({ channel: 'lifecycle', replyTo: message.id, payload })
        if (message.operation === 'stop') setImmediate(() => ctx.appExit(0))
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
  const cancelReady = ctx.appReady.onReady(() => {
    authenticatedReadiness(ctx, limits).then(async result => { if (!stopped) { ready = result; await lifecycleLog(paths, 'CHILD_READY', limits.maxLogBytes) } }).catch(async () => { await lifecycleLog(paths, 'CHILD_FAILED', limits.maxLogBytes).catch(() => {}); ctx.appExit(1) })
  })
  ctx.on('dispose', async () => {
    stopped = true; ready = undefined; cancelReady(); listeners.clear()
    for (const wire of connections) wire.close()
    await new Promise(resolve => server.close(resolve))
    await unlink(path.join(directory, RUNTIME.endpoint)).catch(error => { if (error.code !== 'ENOENT') throw error })
    // net.Server removes its own Unix socket; no PID is ever used as signal authority.
  })
  return service
}
