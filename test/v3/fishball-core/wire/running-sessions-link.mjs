/**
 * A scripted link for the running-sessions rows: the real link module's exports, but `createLink`
 * answers a link that never dials. A case drives its status and polled pages and answers its
 * `sessions_list` calls by hand (`linkScope` holds the links a world made, in order).
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { STATUS } from '../../../../packages/core/src/link/status.js'
import { MCP } from './targets-oracle.mjs'

export * from '../../../../packages/core/src/link/link.js'
export const linkScope = new AsyncLocalStorage()

// The link's own status objects: the pairing compares them by identity.
const CONNECTED = STATUS.connected
const UNREACHABLE = STATUS.unreachable

/**
 * A link whose status, pages and calls the case scripts. Each `sessions_list` call waits in
 * `calls` until the case answers it (`answer(i, value)` or `fail(i, error)`); other tools answer `{ok: true}`.
 */
export function scriptedLink() {
  const sets = { status: new Set(), poll: new Set(), tools: new Set(), detail: new Set() }
  const on = (set) => (fn) => { set.add(fn); return () => set.delete(fn) }
  const emit = (set, value) => { for (const fn of [...set]) fn(value) }
  let status = UNREACHABLE
  const calls = []
  const link = {
    status: () => status,
    tools: () => [],
    detail: () => Object.freeze({ serverName: null, identity: 'pending', connecting: false }),
    onStatus: on(sets.status), onPoll: on(sets.poll), onTools: on(sets.tools), onDetail: on(sets.detail),
    start() {}, reconnect() {}, async stop() {},
    callTool(name, args) {
      if (name !== MCP.tools.sessionsList) return Promise.resolve({ ok: true })
      const call = { name, args, ...Promise.withResolvers() }
      calls.push(call)
      return call.promise
    },
  }
  return {
    link, calls,
    /** Listener counts, to prove a disposal unsubscribed. */
    listening: () => sets.status.size + sets.poll.size,
    connect() { status = CONNECTED; emit(sets.status, status) },
    drop() { status = UNREACHABLE; emit(sets.status, status) },
    page(...types) { emit(sets.poll, { ok: true, events: types.map((type, i) => ({ eventId: 'fbtest-ev-' + i, type })), hasMore: false }) },
    /** Any value as a polled page (a refusal, a malformed answer). */
    pageRaw(value) { emit(sets.poll, value) },
    answer(i, value) { calls[i].resolve(value) },
    fail(i, error) { calls[i].reject(error) },
  }
}

/** The module's `createLink`: a scripted link, recorded in the current `linkScope`. */
export function createLink() {
  const scripted = scriptedLink()
  linkScope.getStore()?.links.push(scripted)
  return scripted.link
}
