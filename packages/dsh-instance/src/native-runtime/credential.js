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
import { HOSTED, REFUSAL, NativeRuntimeError } from './constants.js'
import { createChannelClient, createChannelReceiver } from './channel-rpc.js'

const { op: OP, code: CODE } = HOSTED
const unavailable = () => new NativeRuntimeError(CODE.unavailable)

/**
 * The host's end, over the current wire's transport.
 * @param transport - `{send(text), onMessage(fn) → dispose, onClose(fn) → dispose}`
 * @param {{timeoutMs: number, importTimeoutMs?: number}} options - the probe's bound, and the
 *   import's (default `timeoutMs`; the host gives it the credential lock wait too, constants.js)
 * @returns {{probe(): Promise<boolean>, importToken(value: string): Promise<{ok: true}|{ok: false, code: string}>, close(): void}}
 *   A request with no answer in time, on a closed transport or after `close()` rejects with the
 *   code `CREDENTIAL_CHANNEL_UNAVAILABLE`: an unanswered probe is not "absent", and an unanswered
 *   import is not "not stored". Only the receiver's own `{ok: false, code}` means not stored.
 */
export function createCredentialClient(transport, { timeoutMs, importTimeoutMs = timeoutMs }) {
  const rpc = createChannelClient(transport, CODE.unavailable)
  return Object.freeze({
    async probe() {
      const reply = await rpc.request({ op: OP.probe }, timeoutMs)
      if (reply.ok !== true || typeof reply.present !== 'boolean') throw unavailable()
      return reply.present
    },
    async importToken(value) {
      const reply = await rpc.request({ op: OP.import, value }, importTimeoutMs)
      return reply.ok === true ? { ok: true } : { ok: false, code: typeof reply.code === 'string' ? reply.code : REFUSAL.unwritable }
    },
    close: () => rpc.close(),
  })
}

/**
 * The child's end (the child-side row, instance code in the child). It answers on the transport a
 * request came in on, so a reply never crosses to a newer wire.
 * @param {{credentials: object}} deps - the child DSH's `credentials` service
 * @returns {{attach(transport): void, close(): void}}
 */
export function createCredentialReceiver({ credentials }) {
  async function answer(request) {
    if (request.op === OP.probe) {
      const [reference, record] = await Promise.all([credentials.describe(HOSTED.credentialRef), credentials.describeRecord(HOSTED.savedRecord)])
      return { ok: true, present: reference?.configured === true || record?.configured === true }
    }
    if (request.op !== OP.import || typeof request.value !== 'string' || request.value === '') return { ok: false, code: REFUSAL.invalid }
    try { await credentials.set(HOSTED.credentialRef, request.value) } catch { return { ok: false, code: REFUSAL.unwritable } }
    return { ok: true }
  }
  return createChannelReceiver(answer, (request) => ({ ok: false, code: request.op === OP.import ? REFUSAL.unwritable : REFUSAL.invalid }))
}
