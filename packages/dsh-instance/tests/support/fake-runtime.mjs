/**
 * A stand-in for `src/native-runtime/index.js`, which host-row.mjs loads in place of the real module
 * for one host-row world (its URL carries the world's tag). It plays only the runtime's documented
 * surface (index.js JSDoc and exports): `RUNTIME_LIMITS` and `createNativeRuntime(options)` with
 * `start`, `stop`, `shutdown`, `parentExit`, `health`, `mintTicket`, `childOrigin`, `hostId`,
 * `limits`, `onCredentialTransport` and `onProviderSyncTransport`; no child process is launched.
 *
 * A start calls `options.child()` once as it prepares the launch (the overlay's `{targetUrl}`, kept
 * in `launches`), even while queued behind an earlier step; it may wait on the world's `startGate`
 * (`holdStarts`), and a stop or shutdown aborts a start in progress, which ends `START_INTERRUPTED`
 * once the world opens `cleanupGate`; `failNext` makes the next start reject with that error. A
 * ready start offers the world's provider-sync transport (when it has one) and, when the world has
 * a child store, the credential channel of a new in-memory wire whose child end is the package's
 * real credential receiver over that store. The package modules it needs (RUNTIME_LIMITS,
 * createCredentialReceiver) come from the world, which imported them bound to the case's SDK.
 */
import { worldOf } from '@dsh-instance/test-helpers/swap'
import { ROW } from './constants.mjs'
import { memoryWire } from './fakes.mjs'

const world = () => worldOf(ROW.tag, import.meta.url)
const interrupted = () => Object.assign(new Error(ROW.interrupted), { code: ROW.interrupted })

export const RUNTIME_LIMITS = world().runtimeLimits

class FakeRuntime {
  #ctl = world()
  #credentialListeners = new Set()
  #syncListeners = new Set()
  #wire
  #receiver
  #pending = Promise.resolve()
  #abort
  #ready = false
  constructor(options) {
    this.options = options
    this.hostId = this.#ctl.hostId
    this.limits = RUNTIME_LIMITS
    this.#ctl.instances.push(this)
  }
  onCredentialTransport(listener) {
    this.#credentialListeners.add(listener)
    if (this.#wire?.open) listener(this.#wire.host, { instanceId: this.#ctl.generation })
    return () => this.#credentialListeners.delete(listener)
  }
  onProviderSyncTransport(listener) {
    this.#syncListeners.add(listener)
    return () => this.#syncListeners.delete(listener)
  }
  childOrigin() { return this.#ready ? this.#ctl.childOrigin : undefined }
  async mintTicket(claims) { this.#ctl.minted.push(claims); return this.#ctl.launchToken }
  async health() { return { state: this.#ready ? ROW.state.ready : ROW.state.stopped, warnings: [] } }
  #serial(action) {
    const next = this.#pending.then(action, action)
    this.#pending = next.catch(() => {})
    return next
  }
  start() {
    const ctl = this.#ctl
    ctl.calls.start += 1
    // The launch is prepared at once (the overlay's child-side setting), even while queued.
    ctl.launches.push({ child: this.options.child?.() })
    let aborted
    const abort = new Promise((resolve) => { aborted = resolve })
    this.#abort = aborted
    const held = ctl.holdStarts > 0
    if (held) ctl.holdStarts -= 1
    const failure = ctl.failNext
    ctl.failNext = undefined
    return this.#serial(async () => {
      if (failure !== undefined) throw failure
      if (held) {
        const outcome = await Promise.race([ctl.startGate.promise.then(() => 'go'), abort.then(() => 'abort')])
        if (outcome === 'abort') { await ctl.cleanupGate.promise; throw interrupted() }
      }
      this.#publish()
      this.#ready = true
      return { state: ROW.state.ready, hostId: this.hostId, warnings: [] }
    })
  }
  #publish() {
    this.#drop()
    const ctl = this.#ctl
    if (ctl.syncTransport !== undefined) for (const listener of [...this.#syncListeners]) listener(ctl.syncTransport, { instanceId: this.hostId })
    if (ctl.credentials === undefined) return
    const wire = memoryWire()
    this.#receiver = ctl.createCredentialReceiver({ credentials: ctl.credentials })
    this.#receiver.attach(wire.child)
    this.#wire = wire
    ctl.wires.push(wire)
    for (const listener of [...this.#credentialListeners]) listener(wire.host, { instanceId: ctl.generation })
  }
  #drop() {
    this.#ready = false
    this.#receiver?.close()
    this.#wire?.lose()
  }
  #halt(kind) {
    this.#ctl.calls[kind] += 1
    this.#abort?.()
    return this.#serial(async () => { this.#drop(); return { state: ROW.state.stopped, warnings: [] } })
  }
  stop() { return this.#halt('stop') }
  shutdown() { return this.#halt('shutdown') }
  parentExit() { this.#ctl.calls.parentExit += 1; this.#abort?.() }
}

export function createNativeRuntime(options) { return new FakeRuntime(options) }
