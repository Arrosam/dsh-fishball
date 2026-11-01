/**
 * S33 fixture: a prepended host-level approval/request listener that passes every request on to
 * DSH's stock prompt, but keeps a handle that can still answer it from the server.
 *
 * Why two modes: Cordis's waterfall `next()` takes no arguments (it re-calls the next listener
 * with the ORIGINAL argument array), so "call next() with a copy whose signal we control" is
 * not possible as such. The two ways to give the forwarder a signal the plugin controls:
 *  - 'mutate':     set `req.signal = AbortSignal.any([original, ours])` on the request object,
 *                  then `next()`. The request is the asker's object literal (dsh-tools,
 *                  dsh-sandbox); ApprovalService.decide already captured the original signal.
 *  - 'redispatch': run the waterfall again from our listener with a marked COPY carrying the
 *                  combined signal (`ctx.waterfall(this, 'approval/request', copy, fallback)`);
 *                  our listener sees the mark and calls next() for it. Listeners in front of
 *                  ours would run twice.
 * Either way the gateway (dsh-api-gateway startRemoteEvent) watches `request.signal`: its abort
 * runs cancelRemoteEvent, which sends a `cancel` frame to every browser holding the prompt and
 * rejects the forwarder's promise with the abort reason.
 *
 * The registry (`globalThis.__s33.registry`) is the stand-in for list_frozen_sessions: session,
 * tool, exact arguments (src/approvals.js argumentsOf), time. It costs a Map entry; nothing wakes.
 */
import { argumentsOf } from '../../src/approvals.js'

export const name = 'fishball-spike-prompt-closer'
const EVENT = 'approval/request'
const ARGUMENT_BYTES = 8192
export const MODE = Object.freeze({ mutate: 'mutate', redispatch: 'redispatch' })
export const BY = Object.freeze({ plugin: 'plugin', downstream: 'downstream', cancelled: 'cancelled' })

const state = (globalThis.__s33 ??= {
  mode: MODE.mutate,
  /** key -> entry while a request waits; entries move to `settled` afterwards (evidence). */
  registry: new Map(),
  settled: [],
  unhandled: [],
  seq: 0,
  /** Answer a waiting request from the server. Returns false once it is settled (first answer wins). */
  answer(key, outcome) {
    const entry = this.registry.get(key)
    return entry === undefined ? false : entry.answerByPlugin(outcome)
  },
  /** JSON view of the registry, as list_frozen_sessions would show it. */
  list() {
    return [...this.registry.values()].map(({ key, sessionId, toolName, callId, args, at, mode }) => ({ key, sessionId, toolName, callId, args, at, mode }))
  },
})

export function apply(ctx) {
  /** Copies we re-dispatched: our own listener passes them straight on. */
  const copies = new WeakSet()
  ctx.on(EVENT, function route(req, next) {
    if (copies.has(req)) return next()
    const agent = req.agent
    // Kept before 'mutate' replaces req.signal: the asker's own cancellation.
    const original = req.signal
    const own = new AbortController()
    const key = `s33_${++state.seq}`
    const args = agent === undefined ? null : argumentsOf(agent.session, req.callId, req.toolName, ARGUMENT_BYTES)
    const entry = { key, sessionId: agent?.id, toolName: req.toolName, callId: req.callId, args, at: new Date().toISOString(), mode: state.mode, settledBy: null, outcome: null, downstream: null, events: [] }
    let settlePlugin
    const pluginAnswer = new Promise((resolve) => { settlePlugin = resolve })
    const finish = (by, outcome) => {
      if (entry.settledBy !== null) return false
      entry.settledBy = by
      entry.outcome = outcome
      entry.settledAt = new Date().toISOString()
      state.registry.delete(key)
      state.settled.push(entry)
      return true
    }
    entry.answerByPlugin = (outcome) => {
      if (!finish(BY.plugin, outcome)) return false
      entry.events.push('plugin-abort')
      own.abort(new Error('s33: answered by the plugin'))
      settlePlugin(outcome)
      return true
    }
    state.registry.set(key, entry)
    const signal = original === undefined ? own.signal : AbortSignal.any([original, own.signal])
    let downstream
    if (state.mode === MODE.mutate) {
      try { req.signal = signal } catch (error) { entry.events.push('mutate-failed: ' + error.message) }
      downstream = Promise.resolve().then(next)
    } else {
      const copy = { ...req, signal }
      copies.add(copy)
      downstream = Promise.resolve().then(() => ctx.waterfall(this, EVENT, copy, () => Promise.resolve('unavailable')))
    }
    // The stock prompt answered (or failed): the plugin learns it here. A rejection after our
    // own abort is expected and is swallowed, so nothing is left unhandled.
    const fromDownstream = downstream.then(
      (outcome) => { entry.downstream = { resolved: outcome }; finish(BY.downstream, outcome); return entry.outcome },
      (error) => {
        entry.downstream = { rejected: String(error?.message ?? error) }
        finish(BY.cancelled, original?.aborted ? 'cancelled' : 'unavailable')
        return entry.outcome
      },
    )
    // The asker's own cancellation (turn stopped) also clears the entry.
    original?.addEventListener('abort', () => finish(BY.cancelled, 'cancelled'), { once: true })
    return Promise.race([pluginAnswer, fromDownstream])
  }, { prepend: true })
}
