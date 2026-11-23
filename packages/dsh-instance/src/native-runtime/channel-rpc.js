/**
 * Shared request/reply RPC framing over one authenticated lifecycle wire payload channel
 * (used by both `mcp-credential` and `child-model`). Frames are JSON strings `{id, ...payload}`;
 * replies are `{id, ok, ...}` sent back on the transport that delivered the request.
 */
import { randomUUID } from 'node:crypto'
import { NativeRuntimeError } from './constants.js'

export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const parse = (text) => { try { return JSON.parse(text) } catch { return undefined } }

/**
 * The host's end of a payload channel: correlates `{id}` frames with bounded per-request timers
 * and rejects every pending request with `unavailableCode` on timeout, disconnect or close.
 * @param transport - `{send(text), onMessage(fn) → dispose, onClose(fn) → dispose}`
 * @param {string} unavailableCode - `NativeRuntimeError.code` rejected when the channel cannot answer
 * @returns {{request(frame: object, boundMs: number): Promise<object>, close(): void}}
 */
export function createChannelClient(transport, unavailableCode) {
  const pending = new Map()
  let closed = false
  const unavailable = () => new NativeRuntimeError(unavailableCode)
  const settle = (id, settleWith) => {
    const entry = pending.get(id)
    if (entry === undefined) return
    pending.delete(id)
    clearTimeout(entry.timer)
    settleWith(entry)
  }
  const failAll = () => { for (const id of [...pending.keys()]) settle(id, (entry) => entry.reject(unavailable())) }
  const disposers = [
    transport.onMessage((text) => {
      const reply = parse(text)
      if (isRecord(reply) && typeof reply.id === 'string') settle(reply.id, (entry) => entry.resolve(reply))
    }),
    transport.onClose(() => { closed = true; failAll() }),
  ]
  return Object.freeze({
    request(frame, boundMs) {
      if (closed) return Promise.reject(unavailable())
      const id = randomUUID()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => settle(id, (entry) => entry.reject(unavailable())), boundMs)
        timer.unref?.()
        pending.set(id, { resolve, reject, timer })
        try { transport.send(JSON.stringify({ ...frame, id })) } catch { settle(id, (entry) => entry.reject(unavailable())) }
      })
    },
    close() {
      closed = true
      for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* the wire is already gone */ } }
      failAll()
    },
  })
}

/**
 * The child's end of a payload channel: dispatches each `{id}` request to `answer(request)` and
 * writes the reply back on the transport that received it so replies never cross generations.
 * @param {(request: object) => Promise<object>} answer
 * @param {(request: object) => object} onError - fallback reply when `answer` throws
 * @returns {{attach(transport): void, close(): void}}
 */
export function createChannelReceiver(answer, onError) {
  let detach = () => {}
  let closed = false
  function receive(transport, text) {
    const request = parse(text)
    if (closed || !isRecord(request) || typeof request.id !== 'string') return
    Promise.resolve().then(() => answer(request))
      .catch(() => onError(request))
      .then((outcome) => {
        if (closed) return
        try { transport.send(JSON.stringify({ ...outcome, id: request.id })) } catch { /* the wire is gone */ }
      })
  }
  return Object.freeze({
    attach(transport) {
      if (closed) return
      detach()
      const off = transport.onMessage((text) => receive(transport, text))
      detach = () => { try { off() } catch { /* the wire is gone */ } }
    },
    close() { closed = true; detach() },
  })
}
