/**
 * The `mcp-credential` channel of the lifecycle wire (design §5.4; requirements 1.28 R1, 1.39,
 * 1.41 Q-G6; constants.js HOSTED). Two requests, each answered once:
 * - `probe`: does the child hold a credential? DSH alone answers it, through the child's own
 *   `credentials` service: the import reference is set, or core's saved record exists
 *   (`describe(credentialRef).configured || describeRecord(savedRecord).configured`, K3a);
 * - `import {value}`: write the value to the import reference, once. The receiver keeps nothing.
 * Frames are JSON strings `{id, op, value?}`; replies `{id, ok: true, present?}` or
 * `{id, ok: false, code}`. The channel rides the authenticated lifecycle wire (mutual HMAC proof,
 * wire.js), so nobody else can write to it. No value is ever logged, and a refusal carries a code only.
 */
import { randomUUID } from 'node:crypto'
import { HOSTED, NativeRuntimeError } from './constants.js'

const { op: OP, code: CODE } = HOSTED
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const parse = (text) => { try { return JSON.parse(text) } catch { return undefined } }
const unavailable = () => new NativeRuntimeError(CODE.unavailable)

/**
 * The host's end, over the current wire's transport.
 * @param transport - `{send(text), onMessage(fn) → dispose, onClose(fn) → dispose}`
 * @param {{timeoutMs: number}} options - one bound for each request
 * @returns {{probe(): Promise<boolean>, importToken(value: string): Promise<{ok: true}|{ok: false, code: string}>, close(): void}}
 *   A request with no answer in time, on a closed transport or after `close()` rejects with the
 *   code `CREDENTIAL_CHANNEL_UNAVAILABLE`: an unanswered probe is not "absent".
 */
export function createCredentialClient(transport, { timeoutMs }) {
  const pending = new Map()
  let closed = false
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
  function request(frame) {
    if (closed) return Promise.reject(unavailable())
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => settle(id, (entry) => entry.reject(unavailable())), timeoutMs)
      timer.unref?.()
      pending.set(id, { resolve, reject, timer })
      try { transport.send(JSON.stringify({ id, ...frame })) } catch { settle(id, (entry) => entry.reject(unavailable())) }
    })
  }
  return Object.freeze({
    async probe() {
      const reply = await request({ op: OP.probe })
      if (reply.ok !== true || typeof reply.present !== 'boolean') throw unavailable()
      return reply.present
    },
    async importToken(value) {
      const reply = await request({ op: OP.import, value })
      return reply.ok === true ? { ok: true } : { ok: false, code: typeof reply.code === 'string' ? reply.code : CODE.unwritable }
    },
    close() {
      closed = true
      for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* the wire is gone */ } }
      failAll()
    },
  })
}

/**
 * The child's end (the child-side row, instance code in the child). It answers on the transport a
 * request came in on, so a reply never crosses to a newer wire.
 * @param {{credentials: object}} deps - the child DSH's `credentials` service
 * @returns {{attach(transport): void, close(): void}}
 */
export function createCredentialReceiver({ credentials }) {
  let detach = () => {}
  let closed = false
  async function answer(request) {
    if (request.op === OP.probe) {
      const [reference, record] = await Promise.all([credentials.describe(HOSTED.credentialRef), credentials.describeRecord(HOSTED.savedRecord)])
      return { ok: true, present: reference?.configured === true || record?.configured === true }
    }
    if (request.op !== OP.import || typeof request.value !== 'string' || request.value === '') return { ok: false, code: CODE.invalid }
    try { await credentials.set(HOSTED.credentialRef, request.value) } catch { return { ok: false, code: CODE.unwritable } }
    return { ok: true }
  }
  function receive(transport, text) {
    const request = parse(text)
    if (closed || !isRecord(request) || typeof request.id !== 'string') return
    answer(request)
      .catch(() => ({ ok: false, code: request.op === OP.import ? CODE.unwritable : CODE.invalid }))
      .then((outcome) => { try { transport.send(JSON.stringify({ id: request.id, ...outcome })) } catch { /* the wire is gone */ } })
  }
  return Object.freeze({
    attach(transport) {
      detach()
      const off = transport.onMessage((text) => receive(transport, text))
      detach = () => { try { off() } catch { /* the wire is gone */ } }
    },
    close() { closed = true; detach() },
  })
}
