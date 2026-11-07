/**
 * H-STUB (docs/test-design/connector.md): a fake Fishball instance in the main profile. It reaches
 * the connector only through the public contract: it injects `fishballConnector` in an optional
 * sub-scope (contract §1, as any instance must, so a missing connector never fails the boot),
 * calls `attachInstance` with a descriptor the test builds, and speaks envelope-v2 frames over the
 * transport it hands over (contract §3). It never attaches by itself.
 *
 * The test drives it over its own IPC messages (STUB.ipc), beside the worker's: attach, detach,
 * fireClose, send (a raw frame), request (one request and its reply), handshake, received,
 * ackPolicy, errorPolicy, setStatus, retryCalls, transportCalls, plus current/members of the
 * service. Every attachment is kept, so a stale handle or a stale transport can be exercised.
 *
 * The frame host id is the descriptor's `id`: the contract (§3.1) names a host id on every frame
 * and the binding (§1) declares no other identity for the peer, so the descriptor id is the one
 * value both sides know.
 */
import { randomUUID } from 'node:crypto'
import {
  CONNECTOR_CONTRACT, CONNECTOR_SERVICE, ENVELOPE, OPERATION, TRANSPORT_METHODS, ContractError, makeEnvelope,
} from 'fishball-connector/contract'
import { STUB } from '../../instance-stub-data.mjs'

export const name = STUB.row
export const inject = []

const clone = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)))

export function apply(ctx) {
  /** The service while the connector row provides it. */
  let service
  /** Every attachment made, oldest first; the newest is the one the ops act on unless told otherwise. */
  const attachments = []
  const newest = () => attachments.at(-1)
  /** Inbox acknowledgement: how many pushes may still be acked (Infinity = all), and a one-shot error code. */
  const ack = { left: Infinity, errorNext: null }
  let statusValue = { ...STUB.status }
  let statusMode = null
  let retryCount = 0

  ctx.inject([CONNECTOR_SERVICE], (scope) => {
    service = scope[CONNECTOR_SERVICE]
    return () => { service = undefined }
  })

  /** One attachment's channel: what the connector sent, the handlers it registered, the calls it made. */
  function channel(id, { omit = [], notFunction = [] } = {}) {
    const record = { id, received: [], calls: [], messageHandlers: [], closeHandlers: [], closedByConnector: false, waiting: new Map(), handle: null, attached: false }
    const methods = {
      send(text) {
        record.calls.push('send')
        let frame
        try { frame = JSON.parse(text) } catch { frame = { unparsable: String(text) } }
        record.received.push({ ...frame, at: Date.now() })
        onFrame(record, frame)
      },
      onMessage(fn) { record.calls.push('onMessage'); record.messageHandlers.push(fn); return () => { record.messageHandlers = record.messageHandlers.filter((h) => h !== fn) } },
      onClose(fn) { record.calls.push('onClose'); record.closeHandlers.push(fn); return () => { record.closeHandlers = record.closeHandlers.filter((h) => h !== fn) } },
      close() { record.calls.push('close'); record.closedByConnector = true; settleWaiting(record, STUB.noReply.closed) },
    }
    const transport = {}
    for (const method of TRANSPORT_METHODS) {
      if (omit.includes(method)) continue
      transport[method] = notFunction.includes(method) ? STUB.notAFunction : methods[method]
    }
    record.transport = transport
    return record
  }

  function settleWaiting(record, code) {
    for (const [requestId, resolve] of record.waiting) { record.waiting.delete(requestId); resolve({ type: 'none', code }) }
  }

  /** A frame from the connector: a reply the test waits for, or an inbox.push to acknowledge. */
  function onFrame(record, frame) {
    if (frame?.type !== ENVELOPE.type.request) {
      const resolve = record.waiting.get(frame?.requestId)
      if (resolve) { record.waiting.delete(frame.requestId); resolve({ type: frame.type, payload: frame.payload }) }
      return
    }
    if (frame.operation !== OPERATION.inboxPush) return
    // Answer on the next tick, as a real channel would: never inside the connector's own send.
    setImmediate(() => {
      if (ack.errorNext !== null) {
        const code = ack.errorNext
        ack.errorNext = null
        deliver(record, makeEnvelope(record.id, null, frame.requestId, ENVELOPE.type.error, frame.operation, { code }))
        return
      }
      if (ack.left <= 0) return
      ack.left -= 1
      deliver(record, makeEnvelope(record.id, null, frame.requestId, ENVELOPE.type.response, frame.operation, { acked: true }))
    })
  }

  /** Hand one frame (an object, or a raw string) to the connector's onMessage handlers. */
  function deliver(record, frame) {
    const text = typeof frame === 'string' ? frame : JSON.stringify(frame)
    for (const handler of [...record.messageHandlers]) handler(text)
  }

  function request(record, { operation, payload, sessionId = null, requestId = randomUUID(), hostId = record.id, type = ENVELOPE.type.request, version = ENVELOPE.version }) {
    const reply = new Promise((resolve) => {
      record.waiting.set(requestId, resolve)
      setTimeout(() => { if (record.waiting.delete(requestId)) resolve({ type: 'none', code: STUB.noReply.timeout }) }, STUB.replyTimeoutMs)
    })
    deliver(record, { ...makeEnvelope(hostId, sessionId, requestId, type, operation, payload), version })
    return reply.then((answer) => ({ requestId, ...answer }))
  }

  function statusFunction() {
    if (statusMode === STUB.statusMode.throws) return () => { throw new Error('fbtest status throws') }
    return () => ({ ...statusValue })
  }

  const ops = {
    /** current() and the service's own and inherited member names (conn-OQ-49), or null without the service. */
    service() {
      if (!service) return { present: false }
      const names = new Set()
      for (let o = service; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) for (const k of Reflect.ownKeys(o)) names.add(String(k))
      return { present: true, members: [...names].sort(), current: clone(service.current?.()) }
    },
    /**
     * Attach with a descriptor built from the defaults and the test's fields. `omit` drops
     * descriptor keys, `transport` shapes the transport ({omit, notFunction} or a non-object
     * `value`), `status` false gives no status function, `retry` false none, and `handshake`
     * (default true) sends the handshake request right after an accepted attach.
     */
    async attach({ fields = {}, omit = [], transport = {}, status = true, retry = true, handshake = true, capabilities = STUB.capabilities, required = [] } = {}) {
      if (!service) return { ok: false, code: 'fbtest-no-service' }
      const id = fields.id ?? STUB.descriptor.id
      const record = channel(typeof id === 'string' && id.length > 0 ? id : STUB.descriptor.id, transport)
      const descriptor = {
        id: STUB.descriptor.id, name: STUB.descriptor.name, contract: { ...CONNECTOR_CONTRACT }, transport: record.transport,
        ...(status && statusMode !== STUB.statusMode.none ? { status: statusFunction() } : {}),
        ...(retry ? { retry: async () => { retryCount += 1 } } : {}),
        ...fields,
      }
      if (Object.hasOwn(transport, 'value')) descriptor.transport = transport.value
      for (const key of omit) delete descriptor[key]
      try {
        record.handle = service.attachInstance(descriptor)
      } catch (error) {
        return { ok: false, code: error instanceof ContractError || error?.code ? error.code : 'fbtest-threw', calls: record.calls, handleKeys: null }
      }
      record.attached = true
      attachments.push(record)
      const index = attachments.length - 1
      const answer = { ok: true, index, handleKeys: Object.keys(record.handle), detachIsFunction: typeof record.handle.detach === 'function' }
      if (handshake) answer.handshake = await request(record, { operation: ENVELOPE.handshake, payload: { capabilities: [...capabilities], requiredCapabilities: [...required] } })
      return answer
    },
    detach({ index } = {}) { const record = index === undefined ? newest() : attachments[index]; record?.handle?.detach(); return Boolean(record) },
    fireClose({ index } = {}) { const record = index === undefined ? newest() : attachments[index]; for (const h of [...(record?.closeHandlers ?? [])]) h(); return Boolean(record) },
    /** Deliver a raw frame (an object, or a string) as the instance would. */
    send({ frame, index }) { const record = index === undefined ? newest() : attachments[index]; deliver(record, frame); return true },
    /** One request and its reply ({type, payload} or {type:'none', code}). */
    request({ index, ...input }) { return request(index === undefined ? newest() : attachments[index], input) },
    handshake({ capabilities = STUB.capabilities, required = [], index } = {}) {
      return request(index === undefined ? newest() : attachments[index], { operation: ENVELOPE.handshake, payload: { capabilities: [...capabilities], requiredCapabilities: [...required] } })
    },
    received({ index } = {}) { return clone((index === undefined ? newest() : attachments[index])?.received ?? []) },
    transportCalls({ index } = {}) { const r = index === undefined ? newest() : attachments[index]; return clone({ calls: r?.calls ?? [], closedByConnector: r?.closedByConnector ?? false }) },
    attachments() { return attachments.map((r, index) => ({ index, id: r.id, closedByConnector: r.closedByConnector, received: r.received.length })) },
    ackPolicy({ n = null } = {}) { ack.left = n === null ? Infinity : n; return true },
    errorPolicy({ code }) { ack.errorNext = code; return true },
    setStatus({ value, mode = null }) { if (value) statusValue = { ...value }; statusMode = mode; return true },
    retryCalls() { return retryCount },
  }

  const listener = async (message) => {
    if (message?.type !== STUB.ipc.request) return
    try {
      const op = ops[message.op]
      if (!op) throw new Error('unknown stub op ' + message.op)
      process.send({ type: STUB.ipc.response, id: message.id, ok: true, value: clone(await op(message.args ?? {})) })
    } catch (error) { process.send({ type: STUB.ipc.response, id: message.id, ok: false, error: String(error?.message ?? error) }) }
  }
  process.on('message', listener)
  ctx.effect(() => () => process.off('message', listener), 'fbtest stub instance ipc')
}
