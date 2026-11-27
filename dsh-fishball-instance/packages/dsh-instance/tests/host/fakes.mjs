/**
 * The host area's own stand-ins, beside the shared ones (../support/fakes.mjs): the hosted record in
 * memory (hosted-record.js JSDoc), a K3 ProviderSync member, a route module's context over DSH's
 * Fetch registry and a scripted credential client. Each is written from its contract, never from
 * the implementation, and records what it was asked.
 */
import { fetchRegistry } from '@dsh-instance/test-helpers/routes'
import { FIXTURE, K3 } from './constants.mjs'

/**
 * The hosted record in memory, as openHostedRecord's contract says: entries newest last,
 * `runtime` of the newest entry, a pending succession and `settle`. `added` lists every add.
 */
export function memoryRecord(entries = []) {
  const list = [...entries]
  const added = []
  let pending
  let runtime
  return {
    entries: () => [...list],
    runtime: () => runtime,
    async add(key, options) {
      added.push(key)
      if (options?.succession === true && pending === undefined) pending = list.at(-1)
      if (options?.runtime !== undefined) runtime = options.runtime
      list.push(key)
    },
    pending: () => pending,
    async settle(old) { if (old === pending) pending = undefined },
    added,
  }
}

/** A fake K3 ProviderSync member; the locator passes it through. */
export function fakeProviderSync() {
  return {
    status: () => ({ state: 'ready', instanceId: FIXTURE.instanceId }),
    async check() { return { ok: true, result: { checkId: 'fbtest-check', missing: [], notOffered: [], present: 0 } } },
    async add() { return { ok: true, result: { items: [] } } },
  }
}

/** A route module's ctx over DSH's Fetch registry stand-in, with the members a route module touches. */
export function routeContext() {
  const { routes, fetch } = fetchRegistry()
  const ctx = {
    connection: { fetch },
    effect(fn) { return fn() },
    on: () => () => {},
    logger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
    get: () => undefined,
  }
  return { ctx, routes }
}

/**
 * A scripted credential client (credential.js client contract: `probe() → boolean`,
 * `importToken(value) → {ok:true} | {ok:false, code}`, rejecting CREDENTIAL_CHANNEL_UNAVAILABLE
 * when no answer comes). `answers` are the import answers in order (`'unanswered'` = no answer).
 */
export const ANSWER = Object.freeze({
  none: 'unanswered',
  ok: Object.freeze({ ok: true }),
  refused: Object.freeze({ ok: false, code: K3.refusal.unwritable }),
})
export function scriptedClient(answers = [], { present = false } = {}) {
  const queue = [...answers]
  const calls = { probe: 0, imports: [] }
  return {
    calls,
    async probe() { calls.probe += 1; return present },
    async importToken(value) {
      calls.imports.push(value)
      const answer = queue.length > 0 ? queue.shift() : ANSWER.ok
      if (answer === ANSWER.none) throw Object.assign(new Error('CREDENTIAL_CHANNEL_UNAVAILABLE'), { code: 'CREDENTIAL_CHANNEL_UNAVAILABLE' })
      return { ...answer }
    },
    close() {},
  }
}
