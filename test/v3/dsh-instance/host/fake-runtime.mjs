/**
 * A stand-in for `src/native-runtime/index.js` that row.mjs loads in place of the real module for
 * one host-row world (its URL carries `?fbrow=<world id>`). It plays only the runtime's documented
 * surface (index.js and its JSDoc): `createNativeRuntime(options)` with `start`, `stop`,
 * `shutdown`, `parentExit`, `health`, `mintTicket`, `childOrigin`, `hostId`, `limits`,
 * `onCredentialTransport`, `onProviderSyncTransport`; a start calls `options.child()` once as it
 * prepares the launch (the launch overlay's `{targetUrl}`, index.js), then may wait on the world's
 * gate; a stop or shutdown aborts a start in progress, which ends `START_INTERRUPTED` once the
 * world lets its cleanup finish. A ready start offers the credential channel of a new in-memory
 * wire whose child end is the real credential receiver over the world's child store.
 * Nothing here reads or imitates the runtime's implementation.
 */
import { RUNTIME_LIMITS } from '../../../../packages/dsh-instance/src/native-runtime/constants.js'
import { createCredentialReceiver } from '../../../../packages/dsh-instance/src/native-runtime/credential.js'
import { memoryWire } from './fakes.mjs'
import { FIXTURE, RFI } from './constants.mjs'

export { RUNTIME_LIMITS }

const WORLDS = Symbol.for(RFI.worldsKey)
const world = () => globalThis[WORLDS].get(new URL(import.meta.url).searchParams.get(RFI.worldParam))
const interrupted = () => Object.assign(new Error(RFI.code.interrupted), { code: RFI.code.interrupted })

class FakeRuntime {
  #ctl = world()
  #listeners = new Set()
  #wire
  #receiver
  #pending = Promise.resolve()
  #abort
  #ready = false
  constructor(options) {
    this.options = options
    this.hostId = FIXTURE.runtimeId
    this.limits = RUNTIME_LIMITS
    this.#ctl.instances.push(this)
  }
  onCredentialTransport(listener) {
    this.#listeners.add(listener)
    if (this.#wire?.open) listener(this.#wire.host, { instanceId: FIXTURE.generation })
    return () => this.#listeners.delete(listener)
  }
  onProviderSyncTransport() { return () => {} }
  childOrigin() { return this.#ready ? FIXTURE.hostOrigin : undefined }
  async mintTicket() { return FIXTURE.launchToken }
  async health() { return { state: this.#ready ? 'ready' : 'stopped', warnings: [] } }
  #serial(action) {
    const next = this.#pending.then(action, action)
    this.#pending = next.catch(() => {})
    return next
  }
  start() {
    const ctl = this.#ctl
    ctl.calls.start += 1
    // The launch is prepared at once (the overlay's child-side setting), even while queued.
    const launch = { child: this.options.child?.() }
    ctl.launches.push(launch)
    let aborted
    const abort = new Promise((resolve) => { aborted = resolve })
    this.#abort = aborted
    const held = ctl.holdStarts > 0
    if (held) ctl.holdStarts -= 1
    return this.#serial(async () => {
      if (held) {
        const outcome = await Promise.race([ctl.startGate.promise.then(() => 'go'), abort.then(() => 'abort')])
        if (outcome === 'abort') { await ctl.cleanupGate.promise; throw interrupted() }
      }
      this.#publish()
      this.#ready = true
      return { state: 'ready', hostId: this.hostId, warnings: [] }
    })
  }
  #publish() {
    this.#drop()
    const wire = memoryWire()
    this.#receiver = createCredentialReceiver({ credentials: this.#ctl.credentials })
    this.#receiver.attach(wire.child)
    this.#wire = wire
    this.#ctl.wires.push(wire)
    for (const listener of [...this.#listeners]) listener(wire.host, { instanceId: FIXTURE.generation })
  }
  #drop() {
    this.#ready = false
    this.#receiver?.close()
    this.#wire?.lose()
  }
  #halt(kind) {
    this.#ctl.calls[kind] += 1
    this.#abort?.()
    return this.#serial(async () => { this.#drop(); return { state: 'stopped', warnings: [] } })
  }
  stop() { return this.#halt('stop') }
  shutdown() { return this.#halt('shutdown') }
  parentExit() { this.#ctl.calls.parentExit += 1; this.#abort?.() }
}

export function createNativeRuntime(options) { return new FakeRuntime(options) }
