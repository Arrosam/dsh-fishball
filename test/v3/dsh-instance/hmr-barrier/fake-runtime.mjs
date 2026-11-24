/**
 * Controllable stand-in for `src/native-runtime/index.js` used by the HMR barrier recovery tests.
 * Each created runtime instance records its own `start` / `shutdown` / `parentExit` calls and
 * consults its per-instance `failShutdown` flag and optional `shutdownGate`.
 */
import { RUNTIME_LIMITS } from '../../../../packages/dsh-instance/src/native-runtime/constants.js'

export { RUNTIME_LIMITS }

const WORLDS_KEY = Symbol.for('dsh-fishball.hmr-barrier-test-worlds.v1')
const world = () => globalThis[WORLDS_KEY].get(new URL(import.meta.url).searchParams.get('fbhmr'))

class ControllableRuntime {
  #ctl = world()
  #ready = false
  constructor(options) {
    this.options = options
    this.hostId = 'hmr-barrier-test-runtime'
    this.limits = RUNTIME_LIMITS
    this.calls = { start: 0, shutdown: 0, parentExit: 0 }
    this.failShutdown = false
    this.shutdownGate = null
    this.shutdownStarted = null
    this.#ctl.instances.push(this)
  }
  onCredentialTransport() { return () => {} }
  onProviderSyncTransport() { return () => {} }
  onChildModelTransport() { return () => {} }
  childOrigin() { return this.#ready ? 'http://127.0.0.1:41999' : undefined }
  async mintTicket() { return 'test-ticket' }
  async health() { return { state: this.#ready ? 'ready' : 'stopped', warnings: [] } }
  async start() {
    this.calls.start += 1
    this.#ready = true
    return { state: 'ready', hostId: this.hostId, warnings: [] }
  }
  async stop() {
    return this.shutdown()
  }
  async shutdown() {
    this.calls.shutdown += 1
    this.shutdownStarted?.()
    if (this.shutdownGate) await this.shutdownGate
    if (this.failShutdown) {
      throw Object.assign(new Error('STOP_TIMEOUT'), { code: 'STOP_TIMEOUT' })
    }
    this.#ready = false
    return { state: 'stopped', hostId: this.hostId, warnings: [] }
  }
  parentExit() {
    this.calls.parentExit += 1
  }
}

export function createNativeRuntime(options) {
  return new ControllableRuntime(options)
}
