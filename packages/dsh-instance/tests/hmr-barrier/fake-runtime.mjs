/**
 * Controllable stand-in for `src/native-runtime/index.js` used by the HMR barrier recovery tests.
 * Each created runtime instance records its own `start` / `shutdown` / `parentExit` calls and
 * consults its per-instance `failShutdown` flag and optional `shutdownGate`.
 */
import { worldOf } from '@dsh-instance/test-helpers/swap'
import { HMR } from './constants.mjs'

const world = () => worldOf(HMR.tag, import.meta.url)
export const RUNTIME_LIMITS = world().limits

class ControllableRuntime {
  #ctl = world()
  #ready = false
  constructor(options) {
    this.options = options
    this.hostId = HMR.hostId
    this.limits = RUNTIME_LIMITS
    this.calls = { start: 0, shutdown: 0, parentExit: 0 }
    this.failShutdown = false
    this.shutdownGate = null
    this.#ctl.instances.push(this)
  }
  onCredentialTransport() { return () => {} }
  onProviderSyncTransport() { return () => {} }
  onChildModelTransport() { return () => {} }
  childOrigin() { return this.#ready ? HMR.childOrigin : undefined }
  async mintTicket() { return HMR.ticket }
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
    await this.shutdownGate?.()
    if (this.failShutdown) {
      throw Object.assign(new Error(HMR.stopTimeout), { code: HMR.stopTimeout })
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
