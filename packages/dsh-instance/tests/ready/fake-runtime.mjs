/**
 * A stand-in for src/native-runtime/index.js, loaded in its place for one host-row world
 * (row.mjs): its URL carries the world's id, and the world object (globalThis registry) holds the
 * runtime limits and records what the row asked. It plays only the documented surface host.js uses
 * (index.js JSDoc and exports): `RUNTIME_LIMITS`, `createNativeRuntime(options)` with `start`,
 * `shutdown`, `parentExit`, `health`, `childOrigin`, `mintTicket`, `hostId`, `limits`,
 * `onProviderSyncTransport` and `onCredentialTransport`. A start resolves ready at once and offers
 * the world's provider-sync transport to its listeners.
 */
const world = globalThis[Symbol.for('dshi-ready-row-worlds')].get(new URL(import.meta.url).searchParams.get('dshirow'))

export const RUNTIME_LIMITS = world.limits

class FakeRuntime {
  #syncListeners = new Set()
  #ready = false
  constructor(options) {
    this.options = options
    this.hostId = world.hostId
    this.limits = world.limits
    world.runtimes.push(this)
  }
  onProviderSyncTransport(listener) {
    this.#syncListeners.add(listener)
    return () => this.#syncListeners.delete(listener)
  }
  onCredentialTransport() { return () => {} }
  childOrigin() { return this.#ready ? world.childOrigin : undefined }
  async mintTicket() { return 'ticket' }
  async health() { return { state: this.#ready ? 'ready' : 'stopped', warnings: [] } }
  async start() {
    world.calls.start += 1
    for (const listener of [...this.#syncListeners]) listener(world.syncTransport, { instanceId: world.hostId })
    this.#ready = true
    return { state: 'ready', hostId: this.hostId, warnings: [] }
  }
  async stop() { this.#ready = false; return { state: 'stopped', warnings: [] } }
  async shutdown() { world.calls.shutdown += 1; this.#ready = false; return { state: 'stopped', warnings: [] } }
  parentExit() {}
}

export function createNativeRuntime(options) { return new FakeRuntime(options) }
