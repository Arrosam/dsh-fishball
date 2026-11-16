import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn as nodeSpawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { RUNTIME, RUNTIME_LIMITS, READY_CAPABILITIES, LIFETIME, UNINSTALL, NativeRuntimeError, fail, runtimeLimits, loopbackOrigin } from './constants.js'
import { pathsFor, prepareLayout, existingLayout, removeRuntime, exists, jsonPrivate, writePrivate, privateDirectory, launchPath, removeLaunch, lifecycleLog, validId } from './files.js'
import { resolveInstallation, isolatedEnvironment, childExecArgv, initializeProfile, copyChildCode, runProbe } from './installation.js'
import { connectWire, ChannelPublisher } from './wire.js'
import { admissionKey, mintTicket } from './ticket.js'
import { launchOverlay } from './overlay.js'
import { captureChildStderr } from './stderr-log.js'
import { preflight as defaultPreflight } from '../native-preflight.js'

// launchOverlay is public so a reader can compute a start's overlay operations from the same
// arguments the start uses (paths, record, childModule, limits, control, composed entries and the
// child-side row's `{targetUrl}`, from `options.child()` at each start); the
// file each start writes (launches/<instanceId>/launch.patch.yml) holds exactly its result.
export { RUNTIME_LIMITS, NativeRuntimeError, launchOverlay }
export { composedProfile, COMPOSE_RECORD } from './compose.js'
export function createNativeRuntime(options, dependencies = {}) { return new NativeRuntime(options, dependencies) }

/**
 * The host's readiness rule for one health answer (I-READY): the child says `ready`, reports every
 * ready capability (READY_CAPABILITIES: the base services, admission and lifecycle; child.js
 * childReadiness), and names its own loopback web origin. The identity checks are authenticateReady's.
 * @param status - the child's `health` payload
 * @returns {string} the child's web origin
 * @throws {NativeRuntimeError} `NOT_READY`, `MISSING_CAPABILITY`, or `UNSAFE_CHILD_ORIGIN` (both fatal at startup)
 */
export function readyHealth(status) {
  if (status?.state !== RUNTIME.healthState.ready) fail('NOT_READY')
  const capabilities = Array.isArray(status.capabilities) ? status.capabilities : []
  if (!READY_CAPABILITIES.every((name) => capabilities.includes(name))) fail('MISSING_CAPABILITY')
  return loopbackOrigin(status.origin)
}

class NativeRuntime {
  constructor(options, dependencies) {
    if (process.platform === 'win32') fail('UNSUPPORTED_PLATFORM', 'Attached native lifecycle currently requires POSIX.')
    this.options = options
    this.spawn = dependencies.spawn ?? nodeSpawn
    // The process whose launch the child copies (D28): its execPath, execArgv, env and versions.
    this.host = dependencies.host ?? process
    this.limits = runtimeLimits(options.limits)
    // The attached wire's payload channels (wire.js), offered to the host row's parts.
    this.channels = Object.freeze({ providerSync: new ChannelPublisher(), credential: new ChannelPublisher() })
    this.pending = Promise.resolve()
    this.warnings = []
    this.paths = pathsFor(options.mainHome)
  }
  get hostId() { return this.marker?.hostId }
  /**
   * The provider-sync transport of the attached wire (T16). Its frames are authenticated by the
   * same mutual HMAC proof as every lifecycle request; the instance id is offered beside the
   * transport so the host's bridge can name the child a preview belongs to.
   */
  onProviderSyncTransport(listener) { return this.channels.providerSync.subscribe(listener) }
  /** The `mcp-credential` transport of the attached wire; same authentication as every channel. */
  onCredentialTransport(listener) { return this.channels.credential.subscribe(listener) }
  /**
   * The ready child's own web origin (`http://127.0.0.1:<port>`), from the attached generation's
   * health answer, or undefined. It is not a secret: the port alone admits nobody.
   */
  childOrigin() { return this.attached && !this.attached.wire.closed ? this.attached.origin : undefined }
  /**
   * A single-use admission ticket for the attached generation (design §4.1; ticket.js). Rejects
   * when no child is attached. The key is derived from the lifecycle secret, as the child does.
   */
  async mintTicket({ audience, view, lang }) {
    const attached = this.attached
    if (!attached || attached.wire.closed || this.secret === undefined) fail('NOT_READY')
    return mintTicket(admissionKey(this.secret), { generation: attached.metadata.instanceId, audience, view, lang })
  }
  serial(action) {
    const next = this.pending.then(action, action)
    this.pending = next.catch(() => {})
    return next
  }
  start() { return this.serial(this.beginStartup(signal => this.startInternal(signal))) }
  /** One start's abort signal; a later start, stop or parentExit aborts it. */
  beginStartup(action) {
    const startup = new AbortController()
    this.startup = startup
    return () => action(startup.signal)
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
    return this.serial(this.beginStartup(async signal => { await this.stopInternal(); return this.startInternal(signal) }))
  }
  detach() { return this.serial(async () => {
    this.dropAttached()
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
   * Delete this home's runtime tree, `<home>/fishball/runtime` (uninstall, design §0.10). Nothing
   * is created when the tree is absent. The tree must first be proven this home's: no symbolic
   * link in its path or its layout directories, and an owner marker naming this home
   * (existingLayout, then prepareLayout, which throws for a missing or foreign marker).
   *
   * The child must be stopped already: a recorded child that is alive, or whose state is unknown
   * (no pid record, `ps` unreadable), is refused with CHILD_RUNNING and nothing is removed.
   * Quitting DSH stops it: the parent pipe closes and the child exits by itself
   * (parent-watch.js, LIFETIME.childExitTimeoutMs). The command does not stop the child itself:
   * a main DSH that still runs owns it and could start it again into the tree being deleted.
   * @returns {Promise<{removed: boolean, root: string}>}
   */
  uninstall() { return this.serial(async () => {
    if (!await existingLayout(this.options.mainHome)) return { removed: false, root: this.paths.root }
    await this.prepare()
    const record = await this.active()
    if (record && await this.alive(await this.pid(record)) !== false) fail(UNINSTALL.childRunning)
    await removeRuntime(this.paths)
    return { removed: true, root: this.paths.root }
  }) }
  async prepare() {
    const layout = await prepareLayout(this.options.mainHome)
    Object.assign(this, layout)
  }
  stopped() { return { state: 'stopped', hostId: this.hostId, warnings: [...this.warnings] } }
  log(code, reason) { return lifecycleLog(this.paths, code, this.limits.maxLogBytes, reason) }
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
    const status = await this.query(record, RUNTIME.operation.health)
    if (status.hostId !== this.hostId || status.instanceId !== record.instanceId || status.pid !== await this.pid(record) || status.version !== record.version || status.installAnchor !== record.installAnchor) fail('CHILD_IDENTITY_MISMATCH')
    return { ...status, origin: readyHealth(status) }
  }
  dropAttached() {
    this.attached?.wire.close()
    this.attached = undefined
    for (const channel of Object.values(this.channels)) channel.drop()
  }
  /**
   * Attach the host's one connection to a ready child (operation `attach`): its payload channels
   * come up on that authenticated wire, and the generation's web origin is the one its health
   * answer named (`status` from authenticateReady, whose origin is already checked).
   */
  async attach(record, status) {
    if (this.attached && !this.attached.wire.closed && this.attached.metadata.instanceId === record.instanceId) return
    this.dropAttached()
    const wire = await this.connect(record)
    try {
      const metadata = await wire.request(RUNTIME.operation.attach)
      const providerSync = wire.providerSyncTransport()
      const credential = wire.credentialTransport()
      this.attached = { wire, metadata, origin: status.origin }
      wire.once('closed', () => { if (this.attached?.wire === wire) this.dropAttached() })
      const channelMetadata = { instanceId: metadata.instanceId }
      this.channels.providerSync.publish(wire, providerSync, channelMetadata)
      this.channels.credential.publish(wire, credential, channelMetadata)
    } catch (error) { wire.close(); throw error }
  }
  /**
   * One start: every failure after the layout proof is logged once as FAILED with its specific
   * code as the reason, including the refusals before the launch directory exists (OWNERSHIP_BUSY,
   * OWNERSHIP_UNCERTAIN, INVALID_INSTALLATION), which used to leave no line at all. A failed
   * layout proof (INVALID_MAIN_HOME, UNSAFE_DIRECTORY, UNOWNED_RUNTIME) means "do not write here",
   * so it is thrown before the logged region; the row still reports it (host.js). The message
   * is not logged: the row publishes it only through its own sanitizer.
   */
  async startInternal(signal) {
    if (signal?.aborted) fail('START_INTERRUPTED')
    await this.prepare()
    try { return await this.launch(signal) } catch (error) {
      const failure = error instanceof NativeRuntimeError ? error : new NativeRuntimeError(error?.code ?? RUNTIME.startFailedCode, String(error?.message ?? ''))
      await this.log('FAILED', failure.code).catch(() => {})
      throw failure
    }
  }
  async launch(signal) {
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
          await this.attach(record, status)
          return this.publicHealth(status)
        }
        // A previous parent owns any lifetime pipe. Authenticate, stop and confirm
        // exit before replacing it; never inherit a raw PID as signal authority.
        await this.stopInternal()
        record = undefined
      }
    }
    // Launched as the main DSH is (D28, HOST_LAUNCH): its own executable and exec arguments, so
    // there is nothing to look up or verify.
    const env = isolatedEnvironment(this.paths, this.host)
    const executable = this.host.execPath
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
      await writePrivate(overlay, launchOverlay(this.paths, record, childModule, this.limits, this.options.control ?? {}, profile.entries, this.options.child?.() ?? undefined), true)
      const preload = pathToFileURL(path.join(path.dirname(childModule), 'src/native-runtime/parent-watch.js')).href
      const args = [...childExecArgv(this.host.execArgv), '--import', preload, this.installation.bin, '--profile', RUNTIME.profileName, '--patch', overlay, '--host', RUNTIME.host, '--port', '0', '--no-open']
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
      await this.attach(record, status)
      await this.log('READY')
      if (signal?.aborted) fail('START_INTERRUPTED')
      if (child.exitCode !== null || child.signalCode !== null) fail('CHILD_EXITED')
      return this.publicHealth(status)
    } catch (error) {
      if (this.owns(record, this.childIdentity?.pid) && Number.isSafeInteger(this.childIdentity?.pid)) await this.stopOwned(record).catch(() => {})
      else if (await exists(path.join(directory, RUNTIME.marker))) await removeLaunch(this.paths, record)
      throw error
    }
  }
  /**
   * Retire a recorded instance that is not a ready child, before this owner starts its own.
   *
   * Upgrade from the old native build reaches this every time: the previous main DSH exits without
   * stopping its child, and that child is still inside its parent-loss exit window
   * (parent-watch.js, at most LIFETIME.childExitTimeoutMs) when this main reaches appReady. It
   * answers the HMAC wire but never reports the current capabilities, so authenticateReady refuses it.
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
      try { await this.query(record, RUNTIME.operation.stop) } catch { /* already closing its endpoint: wait below */ }
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
    this.dropAttached()
    if (!record) return this.stopped()
    try { await this.query(record, RUNTIME.operation.stop) } catch {
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
