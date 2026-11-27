/**
 * Standalone fake for `src/native-runtime/index.js` scoped per `?fbdirrow=<id>` world.
 * Allows testing `host.js` boot, status routes, and failure transitions without spawning a child.
 */
import { worldOf } from '@dsh-instance/test-helpers/swap'
import { memoryWire } from '../support/fakes.mjs'
import { HARNESS } from './constants.mjs'

const world = () => worldOf(HARNESS.worldParam, import.meta.url)
export const RUNTIME_LIMITS = world().runtimeLimits

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
    this.#receiver = this.#ctl.createCredentialReceiver({ credentials: this.#ctl.credentials })
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
    this.#drop()
    return { state: 'stopped', warnings: [] }
  }

  async shutdown() {
    this.#drop()
    return { state: 'stopped', warnings: [] }
  }

  parentExit() {
    this.#drop()
  }
}

export function createNativeRuntime(options) {
  return new FakeRuntime(options)
}
