import net from 'node:net'
import { EventEmitter } from 'node:events'
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import { RUNTIME, NativeRuntimeError, fail } from './constants.js'

/**
 * Payload channels that ride the authenticated lifecycle wire beside its own operations. Each
 * carries one JSON string per frame: the session bridge owns `control` exclusively
 * (src/slim/host/bridge.js, src/slim/child/bridge.js), and the T11 admin protocol owns `admin`
 * (`ADMIN.channel` in src/slim/child/admin.js). Any other channel still closes the connection,
 * so this list is the wire's protocol, not an open tunnel.
 */
const PAYLOAD_CHANNEL = Object.freeze({
  control: Object.freeze({ name: 'control', invalidFrame: 'INVALID_CONTROL_FRAME', ownsClose: true }),
  admin: Object.freeze({ name: 'admin', invalidFrame: 'INVALID_ADMIN_FRAME', ownsClose: false }),
})

export function proof(secret, role, identity, challenge) {
  return createHmac('sha256', secret).update(JSON.stringify([RUNTIME.protocol, role, identity.hostId, identity.instanceId, challenge])).digest('hex')
}
export function sameProof(actual, expected) {
  return typeof actual === 'string' && actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

/** Bounded framed transport. Authentication and lifecycle never enter the control channel. */
export class Wire extends EventEmitter {
  constructor(socket, limits) {
    super()
    this.socket = socket
    this.limits = limits
    this.pending = new Map()
    this.authenticated = false
    // One bounded backlog per payload channel, drained when that protocol attaches.
    this.channels = new Map(Object.values(PAYLOAD_CHANNEL).map((spec) => [spec.name, { spec, backlog: [], bytes: 0 }]))
    this.closed = false
    let buffer = Buffer.alloc(0)
    socket.on('error', () => this.close())
    socket.on('close', () => {
      if (this.closed) return
      this.closed = true
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new NativeRuntimeError('DISCONNECTED')) }
      this.pending.clear()
      this.emit('closed')
    })
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      let boundary
      while ((boundary = buffer.indexOf(10)) >= 0) {
        if (boundary > limits.maxFrameBytes) return this.close()
        const frame = buffer.subarray(0, boundary)
        buffer = buffer.subarray(boundary + 1)
        try {
          const message = JSON.parse(frame.toString('utf8'))
          if (!message || message.protocol !== RUNTIME.protocol) return this.close()
          this.receive(message)
        } catch { return this.close() }
      }
      if (buffer.length > limits.maxFrameBytes) this.close()
    })
  }
  receive(message) {
    if (!this.authenticated) return this.emit('auth', message)
    const channel = this.channels.get(message.channel)
    if (channel !== undefined) return this.receivePayload(channel, message.payload)
    if (message.channel !== 'lifecycle') return this.close()
    if (message.replyTo) {
      const pending = this.pending.get(message.replyTo)
      if (!pending) return
      this.pending.delete(message.replyTo)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new NativeRuntimeError('REMOTE_LIFECYCLE_FAILURE'))
      else pending.resolve(message.payload)
    } else this.emit('request', message)
  }
  /**
   * One payload frame on a protocol channel: its owner receives it, or it waits in a bounded
   * backlog until that owner attaches (a reconnect can outrun it). The per-channel byte ceiling
   * keeps an unattached channel from buffering without bound.
   */
  receivePayload(channel, payload) {
    if (typeof payload !== 'string') return this.close()
    if (this.listenerCount(channel.spec.name)) return this.emit(channel.spec.name, payload)
    channel.bytes += Buffer.byteLength(payload)
    if (channel.bytes > this.limits.maxFrameBytes) return this.close()
    channel.backlog.push(payload)
  }
  send(message) {
    if (this.closed || this.socket.destroyed) fail('DISCONNECTED')
    const frame = JSON.stringify({ ...message, protocol: RUNTIME.protocol }) + '\n'
    if (Buffer.byteLength(frame) > this.limits.maxFrameBytes || this.socket.writableLength + Buffer.byteLength(frame) > this.limits.maxFrameBytes) { this.close(); fail('FRAME_LIMIT') }
    this.socket.write(frame)
  }
  request(operation) {
    if (this.pending.size >= this.limits.maxPendingRequests) return Promise.reject(new NativeRuntimeError('PENDING_LIMIT'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new NativeRuntimeError('REQUEST_TIMEOUT')); this.close() }, this.limits.requestTimeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try { this.send({ channel: 'lifecycle', id, operation }) } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
    })
  }
  /** One protocol's view of its channel; `close` exists only where that protocol owns the wire. */
  payloadTransport(channel) {
    const { spec } = channel
    const subscribe = (event, fn) => { this.on(event, fn); return () => this.off(event, fn) }
    const transport = {
      send: (payload) => { if (typeof payload !== 'string') fail(spec.invalidFrame); this.send({ channel: spec.name, payload }) },
      onMessage: (fn) => {
        const dispose = subscribe(spec.name, fn)
        const queued = channel.backlog.splice(0)
        channel.bytes = 0
        // Defer delivery until the protocol owner has assigned its new channel.
        queueMicrotask(() => { if (!this.closed && this.listeners(spec.name).includes(fn)) for (const payload of queued) fn(payload) })
        return dispose
      },
      onClose: (fn) => subscribe('closed', fn),
    }
    if (spec.ownsClose) transport.close = () => this.close()
    return Object.freeze(transport)
  }
  controlTransport() { return this.payloadTransport(this.channels.get(PAYLOAD_CHANNEL.control.name)) }
  /**
   * The T11 admin channel: the same authenticated wire, its own payload channel. It deliberately
   * has no `close`: the session bridge and the lifecycle share this wire, so an admin problem
   * must never drop delivery.
   */
  adminTransport() { return this.payloadTransport(this.channels.get(PAYLOAD_CHANNEL.admin.name)) }
  close() { this.socket.destroy() }
}

export async function connectWire(endpoint, identity, secret, limits) {
  const socket = net.createConnection(endpoint.kind === 'unix' ? { path: endpoint.path } : { host: RUNTIME.host, port: endpoint.port })
  const wire = new Wire(socket, limits)
  const challenge = randomUUID()
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new NativeRuntimeError('AUTH_TIMEOUT')), limits.requestTimeoutMs)
    const closed = () => finish(new NativeRuntimeError('DISCONNECTED'))
    let nonce
    const auth = (message) => {
      if (message.channel === 'auth' && message.step === 'challenge' && typeof message.nonce === 'string' && !nonce) {
        nonce = message.nonce
        wire.send({ channel: 'auth', step: 'hello', nonce, challenge, hostId: identity.hostId, instanceId: identity.instanceId, proof: proof(secret, 'main', identity, [nonce, challenge]) })
        return
      }
      if (message.channel !== 'auth' || message.step !== 'accepted' || message.nonce !== nonce || message.challenge !== challenge || !sameProof(message.proof, proof(secret, 'child', identity, [nonce, challenge]))) return finish(new NativeRuntimeError('AUTH_FAILED'))
      wire.authenticated = true
      finish()
    }
    const finish = (error) => {
      clearTimeout(timer); wire.off('auth', auth); wire.off('closed', closed)
      if (error) { wire.close(); reject(error) } else resolve()
    }
    wire.on('closed', closed)
    wire.on('auth', auth)
  })
  return wire
}
