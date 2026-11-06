import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn as nodeSpawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { RUNTIME, RUNTIME_LIMITS, LIFETIME, NativeRuntimeError, fail, runtimeLimits, appAccess } from './constants.js'
import { pathsFor, prepareLayout, exists, jsonPrivate, writePrivate, privateDirectory, launchPath, removeLaunch, lifecycleLog, validId } from './files.js'
import { resolveInstallation, isolatedEnvironment, verifyNode, initializeProfile, copyChildCode, runProbe } from './installation.js'
import { connectWire } from './wire.js'
import { launchOverlay } from './overlay.js'
import { captureChildStderr } from './stderr-log.js'
import { preflight as defaultPreflight } from '../native-preflight.js'

export { RUNTIME_LIMITS, NativeRuntimeError }
export function createNativeRuntime(options, dependencies = {}) { return new NativeRuntime(options, dependencies) }

class NativeRuntime {
  constructor(options, dependencies) {
    if (process.platform === 'win32') fail('UNSUPPORTED_PLATFORM', 'Attached native lifecycle currently requires POSIX.')
    this.options = options
    this.spawn = dependencies.spawn ?? nodeSpawn
    this.limits = runtimeLimits(options.limits)
    this.listeners = new Set()
    // The T11 admin channel is attached once per authenticated wire, beside the control transport.
    this.adminListeners = new Set()
    // T16's provider-sync channel rides the same wire on its own payload channel.
    this.providerSyncListeners = new Set()
    this.pending = Promise.resolve()
    this.warnings = []
    this.paths = pathsFor(options.mainHome)
  }
  get hostId() { return this.marker?.hostId }
  onControlTransport(listener) {
    this.listeners.add(listener)
    if (this.control) listener(this.control.transport, this.control.metadata)
    return () => this.listeners.delete(listener)
  }
  /**
   * The admin transport of the attached wire (T11). It exists only after the same mutual HMAC
   * proof as every lifecycle request, so admin frames inherit that authentication (§5.1).
   */
  onAdminTransport(listener) {
    this.adminListeners.add(listener)
    if (this.admin && !this.admin.wire.closed) listener(this.admin.transport)
    return () => this.adminListeners.delete(listener)
  }
  /**
   * The provider-sync transport of the attached wire (T16). Its frames are authenticated by the
   * same mutual HMAC proof as every lifecycle request; the instance id is offered beside the
   * transport so the host's bridge can name the child a preview belongs to.
   */
  onProviderSyncTransport(listener) {
    this.providerSyncListeners.add(listener)
    if (this.providerSync && !this.providerSync.wire.closed) listener(this.providerSync.transport, this.providerSync.metadata)
    return () => this.providerSyncListeners.delete(listener)
  }
  serial(action) {
    const next = this.pending.then(action, action)
    this.pending = next.catch(() => {})
    return next
  }
  start() {
    const startup = new AbortController()
    this.startup = startup
    return this.serial(() => this.startInternal(startup.signal))
  }
  stop() { this.startup?.abort(); return this.serial(() => this.stopInternal()) }
  // Synchronous process-exit hook can close a private pipe but cannot await.
  // EOF lets the child request graceful appExit and enforce its own deadline.
  parentExit() { this.startup?.abort(); this.parentPipe?.destroy() }
  forceOwned() {
    const identity = this.childIdentity
    const child = this.child
    if (!identity || !this.owns(identity, identity.pid) || child.exitCode !== null || child.signalCode !== null) return
    try { child.kill(LIFETIME.forceSignal) } catch { /* Retain ownership; never substitute a PID signal. */ }
  }
  shutdown() {
    this.startup?.abort()
    this.parentExit()
    const began = Date.now()
    let forceTimer, deadlineTimer
    const deadline = new Promise((_, reject) => {
      forceTimer = setTimeout(() => this.forceOwned(), LIFETIME.forceAfterMs)
      deadlineTimer = setTimeout(() => { this.forceOwned(); reject(new NativeRuntimeError('STOP_TIMEOUT')) }, LIFETIME.shutdownTimeoutMs)
    })
    const stopped = this.stop().catch(async error => {
      // Metadata/transport failure cannot cancel escalation or skip pipe grace.
      await delay(Math.max(0, LIFETIME.forceAfterMs - (Date.now() - began)))
      this.forceOwned()
      if (this.childIdentity && this.owns(this.childIdentity, this.childIdentity.pid)) {
        await this.waitOwnedDead()
      }
      throw error
    })
    return Promise.race([stopped, deadline]).finally(() => { clearTimeout(forceTimer); clearTimeout(deadlineTimer) })
  }
  restart() {
    this.startup?.abort()
    const startup = new AbortController()
    this.startup = startup
    return this.serial(async () => { await this.stopInternal(); return this.startInternal(startup.signal) })
  }
  detach() { return this.serial(async () => {
    this.dropControl()
    this.child?.unref()
    if (this.marker) await this.log('DETACH')
  }) }
  health() { return this.serial(async () => {
    if (!await exists(path.join(this.paths.root, RUNTIME.marker))) return { state: 'stopped', warnings: [] }
    await this.prepare()
    const record = await this.active()
    if (!record) return this.stopped()
    try { return this.publicHealth(await this.authenticateReady(record)) } catch { return { state: 'unavailable', hostId: this.hostId, instanceId: record.instanceId, warnings: [...this.warnings] } }
  }) }
  /**
   * The child's loopback origin and the bearer it minted, for the main-side embed broker (§3.1,
   * §3.2). Main-process only: publicHealth never carries it, so no page can read the token.
   */
  embedAccess() { return this.serial(async () => {
    await this.prepare()
    const record = await this.active()
    if (!record) fail('NOT_RUNNING')
    const status = await this.authenticateReady(record)
    return appAccess(status.access)
  }) }
  async prepare() {
    const layout = await prepareLayout(this.options.mainHome)
    Object.assign(this, layout)
  }
  stopped() { return { state: 'stopped', hostId: this.hostId, warnings: [...this.warnings] } }
  log(code) { return lifecycleLog(this.paths, code, this.limits.maxLogBytes) }
  async active() {
    const file = path.join(this.paths.root, RUNTIME.active)
    if (!await exists(file)) return undefined
    const record = await jsonPrivate(file)
    if (record.format !== RUNTIME.format || record.hostId !== this.hostId || !validId(record.instanceId) || typeof record.installAnchor !== 'string') fail('INVALID_INSTANCE_RECORD')
    return record
  }
  async pid(record) {
    const file = path.join(launchPath(this.paths, record.instanceId), RUNTIME.pid)
    if (!await exists(file)) return undefined
    const info = await jsonPrivate(file)
    if (info.instanceId !== record.instanceId || info.hostId !== this.hostId || !Number.isSafeInteger(info.pid) || info.pid <= 0) fail('INVALID_PID_RECORD')
    return info.pid
  }
  async alive(pid) {
    if (!pid) return undefined
    try {
      const result = await runProbe(this.spawn, '/bin/ps', ['-p', String(pid), '-o', 'pid='], { env: {}, cwd: this.paths.workspace }, this.limits.requestTimeoutMs, this.limits.maxMetadataBytes)
      if (result.code === 0 && result.output.trim() === String(pid)) return true
      if (result.code === 1 && !result.output.trim()) return false
    } catch { /* Unknown is not dead. */ }
    return undefined
  }
  async connect(record) {
    const directory = launchPath(this.paths, record.instanceId)
    const metadata = await jsonPrivate(path.join(directory, RUNTIME.endpoint))
    const endpoint = metadata.endpoint
    if (metadata.hostId !== this.hostId || metadata.instanceId !== record.instanceId) fail('ENDPOINT_IDENTITY_MISMATCH')
    if (endpoint.kind === 'unix') {
      if (endpoint.path !== path.join(directory, RUNTIME.socketName)) fail('INVALID_ENDPOINT')
    } else if (endpoint.kind !== 'tcp' || endpoint.host !== RUNTIME.host || !Number.isSafeInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) fail('INVALID_ENDPOINT')
    return connectWire(endpoint, record, this.secret, this.limits)
  }
  async query(record, operation) {
    const wire = await this.connect(record)
    try { return await wire.request(operation) } finally { wire.close() }
  }
  publicHealth(status) {
    return { state: status.state, hostId: status.hostId, instanceId: status.instanceId, pid: status.pid, version: status.version, capabilities: [...status.capabilities], warnings: [...this.warnings] }
  }
  async authenticateReady(record) {
    const status = await this.query(record, 'health')
    if (status.hostId !== this.hostId || status.instanceId !== record.instanceId || status.pid !== await this.pid(record) || status.version !== record.version || status.installAnchor !== record.installAnchor) fail('CHILD_IDENTITY_MISMATCH')
    if (status.state !== 'ready') fail('NOT_READY')
    if (!RUNTIME.requiredServices.every(service => status.capabilities.includes(service)) || !status.capabilities.includes(RUNTIME.capabilities.authenticatedApp)) fail('MISSING_CAPABILITY')
    // A ready child always reports the app surface it is reachable through; validate it here so
    // the startup loop and the embed broker share one rule (§2.3, §3.2).
    appAccess(status.access)
    return status
  }
  dropControl() {
    this.control?.wire.close()
    this.control = undefined
    this.admin = undefined
    this.providerSync = undefined
  }
  async attach(record) {
    if (this.control && !this.control.wire.closed && this.control.metadata.instanceId === record.instanceId) return
    this.dropControl()
    const wire = await this.connect(record)
    try {
      const metadata = await wire.request('control')
      const transport = wire.controlTransport()
      // The admin channel is the same authenticated wire, so it comes up with the control
      // transport and never adds an operation to health, readiness or stop.
      const admin = wire.adminTransport()
      // T16's provider-sync target comes up with the control transport on the same wire.
      const providerSync = wire.providerSyncTransport()
      this.control = { wire, transport, metadata }
      this.admin = { wire, transport: admin }
      this.providerSync = { wire, transport: providerSync, metadata: { instanceId: metadata.instanceId } }
      for (const listener of this.listeners) listener(transport, metadata)
      for (const listener of this.adminListeners) listener(admin)
      for (const listener of this.providerSyncListeners) listener(providerSync, this.providerSync.metadata)
    } catch (error) { wire.close(); throw error }
  }
  async startInternal(signal) {
    if (signal?.aborted) fail('START_INTERRUPTED')
    await this.prepare()
    this.installation = await resolveInstallation(this.options.installAnchor)
    let record = await this.active()
    if (record) {
      let status
      try { status = await this.authenticateReady(record) } catch (error) {
        await this.retirePredecessor(record)
        record = undefined
      }
      if (record) {
        if (this.owns(record, this.childIdentity?.pid)) {
          await this.attach(record)
          return this.publicHealth(status)
        }
        // A previous parent owns any lifetime pipe. Authenticate, stop and confirm
        // exit before replacing it; never inherit a raw PID as signal authority.
        await this.stopInternal()
        record = undefined
      }
    }
    const env = isolatedEnvironment(this.paths, this.options.executableSearchPath)
    const executable = await verifyNode(this.options.nodeExecutable, this.spawn, env, this.paths, this.limits)
    if (signal?.aborted) fail('START_INTERRUPTED')
    record = { format: RUNTIME.format, hostId: this.hostId, instanceId: randomUUID(), installAnchor: this.installation.installAnchor, installRoot: this.installation.installRoot, version: this.installation.version }
    try { await writePrivate(path.join(this.paths.root, RUNTIME.active), record, true) } catch (error) { if (error.code === 'EEXIST') fail('OWNERSHIP_BUSY'); throw error }
    const directory = launchPath(this.paths, record.instanceId)
    try {
      await privateDirectory(directory)
      await writePrivate(path.join(directory, RUNTIME.marker), record, true)
      const profile = await initializeProfile(this.paths, this.installation, this.options.preflight ?? defaultPreflight, this.options.mainWorkspaces ?? [])
      this.warnings = profile.warnings
      const childModule = await copyChildCode(this.paths, record)
      const overlay = path.join(directory, 'launch.patch.yml')
      await writePrivate(overlay, launchOverlay(this.paths, record, childModule, this.limits, this.options.control ?? {}, profile.entries), true)
      const preload = pathToFileURL(path.join(path.dirname(childModule), 'src/native-runtime/parent-watch.js')).href
      const args = ['--import', preload, this.installation.bin, '--profile', RUNTIME.profileName, '--patch', overlay, '--host', RUNTIME.host, '--port', '0', '--no-open']
      if (signal?.aborted) fail('START_INTERRUPTED')
      // stderr is piped into a bounded, redacted private log (B6) so a row that fails to mount is
      // diagnosable; stdout stays ignored as before.
      const child = this.spawn(executable, args, { cwd: this.paths.workspace, env, detached: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe'] })
      captureChildStderr(child.stderr, this.paths, this.limits.maxLogBytes)
      this.child = child
      this.parentPipe = child.stdio[LIFETIME.parentFd]
      this.parentPipe?.on('error', () => {})
      this.parentPipe?.unref()
      this.childIdentity = { hostId: record.hostId, instanceId: record.instanceId, pid: child.pid }
      let spawnFailed = false
      child.once('error', () => { spawnFailed = true })
      child.once('exit', () => {
        if (this.child === child) this.options.onExit?.()
      })
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(new NativeRuntimeError('SPAWN_FAILED'))) })
      child.unref()
      await writePrivate(path.join(directory, RUNTIME.pid), { hostId: this.hostId, instanceId: record.instanceId, pid: child.pid })
      await this.log('START')
      const deadline = Date.now() + this.limits.startupTimeoutMs
      let status
      while (Date.now() < deadline) {
        if (signal?.aborted) fail('START_INTERRUPTED')
        if (spawnFailed || child.exitCode !== null || child.signalCode !== null) fail('CHILD_EXITED')
        try { status = await this.authenticateReady(record); break } catch (error) {
          if (RUNTIME.fatalStartupCodes.includes(error.code)) throw error
        }
        await delay(this.limits.pollIntervalMs)
      }
      if (!status) fail('STARTUP_TIMEOUT')
      await this.attach(record)
      await this.log('READY')
      if (signal?.aborted) fail('START_INTERRUPTED')
      if (child.exitCode !== null || child.signalCode !== null) fail('CHILD_EXITED')
      return this.publicHealth(status)
    } catch (error) {
      await this.log('FAILED').catch(() => {})
      if (this.owns(record, this.childIdentity?.pid) && Number.isSafeInteger(this.childIdentity?.pid)) await this.stopOwned(record).catch(() => {})
      else if (await exists(path.join(directory, RUNTIME.marker))) await removeLaunch(this.paths, record)
      throw error instanceof NativeRuntimeError ? error : new NativeRuntimeError(error.code ?? 'START_FAILED', 'Attached runtime startup failed; private state retained.')
    }
  }
  /**
   * Retire a recorded instance that is not a ready slim child, before this owner starts its own.
   *
   * Upgrade from the old native build reaches this every time: the previous main DSH exits without
   * stopping its child, and that child is still inside its parent-loss exit window
   * (parent-watch.js, at most LIFETIME.childExitTimeoutMs) when this main reaches appReady. It
   * answers the HMAC wire but never reports the slim capabilities, so authenticateReady refuses it.
   * Refusing outright left Fishball failed on every upgrade start, so the authenticated stop that
   * stopInternal already sends to a ready predecessor is sent here too. Its exit is then confirmed
   * by passive polling only: no PID is ever signalled. The wait covers the exit window, which is
   * longer than the host's stop bound (that bound is for shutdown inside DSH's exit grace; startup
   * has its own, longer budget). A process that is still alive after it remains a refusal.
   */
  async retirePredecessor(record) {
    const pid = await this.pid(record)
    if (!pid) fail('OWNERSHIP_UNCERTAIN', 'An interrupted launch has no process identity; refusing automatic takeover.')
    if (await this.alive(pid) !== false) {
      try { await this.query(record, 'stop') } catch { /* already closing its endpoint: wait below */ }
      try { await this.waitDead(record, Math.max(this.limits.stopTimeoutMs, LIFETIME.childExitTimeoutMs)) } catch {
        fail('CHILD_UNREACHABLE', 'An existing instance did not exit; refusing a duplicate writer.')
      }
    }
    await removeLaunch(this.paths, record)
    await this.log('RECOVER')
  }
  owns(record, pid) {
    return this.child && this.childIdentity?.hostId === record.hostId && this.childIdentity?.instanceId === record.instanceId && this.childIdentity?.pid === pid && this.child.pid === pid
  }
  async waitOwnedDead() {
    const child = this.child
    const deadline = Date.now() + this.limits.stopTimeoutMs
    do {
      if (child.exitCode !== null || child.signalCode !== null) return
      await delay(this.limits.pollIntervalMs)
    } while (Date.now() < deadline)
    fail('STOP_TIMEOUT')
  }
  async waitDead(record, timeoutMs = this.limits.stopTimeoutMs) {
    if (this.owns(record, this.childIdentity?.pid)) return this.waitOwnedDead()
    const deadline = Date.now() + timeoutMs
    const pid = await this.pid(record) ?? (this.owns(record, this.childIdentity?.pid) ? this.childIdentity.pid : undefined)
    do {
      if (this.owns(record, pid)) {
        if (this.child.exitCode !== null || this.child.signalCode !== null) return
      } else if (await this.alive(pid) === false) return
      await delay(this.limits.pollIntervalMs)
    } while (Date.now() < deadline)
    fail('STOP_TIMEOUT', 'Private process exit is not confirmed; its ownership record is retained.')
  }
  async stopOwned(record) {
    const child = this.child
    if (!this.owns(record, this.childIdentity?.pid)) fail('CHILD_UNREACHABLE')
    if (child.exitCode === null && child.signalCode === null) child.kill(LIFETIME.gracefulSignal)
    try { await this.waitDead(record) } catch {
      this.forceOwned()
      await this.waitDead(record)
    }
    await removeLaunch(this.paths, record)
    this.child = undefined
  }
  async stopInternal() {
    if (!await exists(path.join(this.paths.root, RUNTIME.marker))) return { state: 'stopped', warnings: [] }
    await this.prepare()
    const record = await this.active()
    this.dropControl()
    if (!record) return this.stopped()
    try { await this.query(record, 'stop') } catch {
      if (this.owns(record, this.childIdentity?.pid)) {
        await this.stopOwned(record)
        await this.log('STOP')
        return this.stopped()
      }
      if (await this.alive(await this.pid(record)) !== false) fail('CHILD_UNREACHABLE', 'No authenticated stop endpoint or owned ChildProcess; refusing PID-only signals.')
    }
    try { await this.waitDead(record) } catch (error) {
      if (!this.owns(record, this.childIdentity?.pid)) throw error
      await this.stopOwned(record)
      await this.log('STOP')
      return this.stopped()
    }
    await removeLaunch(this.paths, record)
    this.child = undefined
    await this.log('STOP')
    return this.stopped()
  }
}
