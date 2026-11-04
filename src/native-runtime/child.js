import net from 'node:net'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpath, readFile, chmod, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { registerParentShutdown } from './parent-watch.js'
import { RUNTIME, runtimeLimits, fail, NativeRuntimeError } from './constants.js'
import { jsonPrivate, readPrivate, writePrivate, privateDirectory, launchPath, snapshotPath, pathsFor, inside, lifecycleLog } from './files.js'
import { Wire, proof, sameProof } from './wire.js'

const HTTP = Object.freeze({ unauthorized: 401, redirect: 303, success: 200 })
async function probeHttp(url, timeoutMs, cookie) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: cookie ? { cookie } : {}, agent: false }, response => {
      const result = { status: response.statusCode, cookie: response.headers['set-cookie'] }
      response.resume()
      response.on('end', () => resolve(result))
      response.on('error', () => reject(new NativeRuntimeError('WEB_AUTH_NOT_READY')))
    })
    request.setTimeout(timeoutMs, () => request.destroy())
    request.on('error', () => reject(new NativeRuntimeError('WEB_AUTH_NOT_READY')))
  })
}

async function authenticatedReadiness(ctx, limits) {
  for (const service of RUNTIME.requiredServices) if (ctx.get(service) === undefined) fail('MISSING_CAPABILITY')
  const origin = new URL(ctx.webServer.getOrigin())
  if (origin.protocol !== 'http:' || origin.hostname !== RUNTIME.host || !origin.port || origin.username || origin.password) fail('UNSAFE_WEB_BIND')
  const url = ctx.connection.authenticatedUrl(origin.href)
  const authenticated = new URL(url)
  if (authenticated.origin !== origin.origin || !authenticated.search || authenticated.pathname !== '/') fail('INVALID_WEB_AUTH')
  const anonymous = await probeHttp(origin.href, limits.requestTimeoutMs)
  const exchanged = await probeHttp(url, limits.requestTimeoutMs)
  const cookie = exchanged.cookie?.map(value => value.split(';')[0]).join('; ')
  if (anonymous.status !== HTTP.unauthorized || exchanged.status !== HTTP.redirect || !cookie) fail('WEB_AUTH_NOT_READY')
  const page = await probeHttp(origin.href, limits.requestTimeoutMs, cookie)
  if (page.status !== HTTP.success) fail('WEB_AUTH_NOT_READY')
  return { capabilities: [...RUNTIME.requiredServices, 'authenticated-web', 'lifecycle-v1', 'control-transport-v1'] }
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
        if (message.operation === 'health') payload = { state: ready ? 'ready' : 'starting', ...identity, pid: process.pid, version: manifest.version, installAnchor: record.installAnchor, capabilities: ready?.capabilities ?? [] }
        else if (message.operation === 'open-url') { if (!ready) fail('NOT_READY'); payload = { url: ctx.connection.authenticatedUrl(ctx.webServer.getOrigin()) } }
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
