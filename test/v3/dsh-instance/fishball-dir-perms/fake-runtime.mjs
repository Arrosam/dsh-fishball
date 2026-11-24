/**
 * Standalone fake for `src/native-runtime/index.js` scoped per `?fbdirrow=<id>` world.
 * Allows testing `host.js` boot, status routes, and failure transitions without spawning a child.
 */
import { RUNTIME_LIMITS } from '../../../../packages/dsh-instance/src/native-runtime/constants.js'
import { createCredentialReceiver } from '../../../../packages/dsh-instance/src/native-runtime/credential.js'
import { memoryWire } from '../host/fakes.mjs'
import { HARNESS } from './constants.mjs'

export { RUNTIME_LIMITS }

const WORLDS = Symbol.for(HARNESS.worldsKey)
const world = () => globalThis[WORLDS].get(new URL(import.meta.url).searchParams.get(HARNESS.worldParam))

class FakeRuntime {
  #ctl = world()
  #credentialListeners = new Set()
  #wire
  #receiver
  #ready = false

  constructor(options) {
    this.options = options
    this.hostId = HARNESS.runtimeId
    this.limits = RUNTIME_LIMITS
    this.#ctl.instances.push(this)
  }

  onCredentialTransport(listener) {
    this.#credentialListeners.add(listener)
    if (this.#wire?.open) listener(this.#wire.host, { instanceId: HARNESS.generation })
    return () => this.#credentialListeners.delete(listener)
  }

  onProviderSyncTransport() { return () => {} }

  onChildModelTransport() { return () => {} }

  childOrigin() { return this.#ready ? HARNESS.hostOrigin : undefined }

  async mintTicket() { return HARNESS.launchToken }

  async health() { return { state: this.#ready ? 'ready' : 'stopped', warnings: [] } }

  async start() {
    this.#ctl.calls.start += 1
    if (this.#ctl.startError) {
      this.#drop()
      throw this.#ctl.startError
    }
    this.#publish()
    this.#ready = true
    return { state: 'ready', hostId: this.hostId, warnings: [] }
  }

  #publish() {
    this.#drop()
    const wire = memoryWire()
    this.#receiver = createCredentialReceiver({ credentials: this.#ctl.credentials })
    this.#receiver.attach(wire.child)
    this.#wire = wire
    for (const listener of [...this.#credentialListeners]) {
      listener(wire.host, { instanceId: HARNESS.generation })
    }
  }

  #drop() {
    this.#ready = false
    this.#receiver?.close()
    this.#wire?.lose()
  }

  async stop() {
    this.#ctl.calls.stop += 1
    this.#drop()
    return { state: 'stopped', warnings: [] }
  }

  async shutdown() {
    this.#ctl.calls.shutdown += 1
    this.#drop()
    return { state: 'stopped', warnings: [] }
  }

  parentExit() {
    this.#ctl.calls.parentExit += 1
    this.#drop()
  }
}

export function createNativeRuntime(options) {
  return new FakeRuntime(options)
}
