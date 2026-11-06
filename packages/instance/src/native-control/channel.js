import { CONTROL, WIRE, ControlError, fail } from './constants.js'
import { decodeEnvelope, encodeEnvelope } from './protocol.js'

/**
 * Already-authenticated carrier contract: send(string), onMessage(fn), onClose(fn), close().
 * Subscription methods return disposers. Framing, local authentication and socket ownership
 * belong to the lifecycle transport. This channel never opens a socket or trusts wire identity.
 */
export class ControlChannel {
  constructor({ transport, hostId, limits, onEnvelope, onClose }) {
    for (const name of ['send', 'onMessage', 'onClose', 'close']) if (typeof transport?.[name] !== 'function') fail()
    this.transport = transport
    this.hostId = hostId
    this.limits = limits
    this.onClose = onClose
    this.closed = false
    this.sending = WIRE.zero
    this.disposers = []
    try {
      this.subscribe(transport.onClose(() => this.close()))
      if (!this.closed) this.subscribe(transport.onMessage((encoded) => {
        if (this.closed) return
        try { onEnvelope(decodeEnvelope(encoded, limits, hostId)) }
        catch (error) { this.close(error) }
      }))
    } catch (error) {
      this.close(error)
      throw error
    }
  }

  subscribe(dispose) {
    if (typeof dispose !== 'function') fail()
    if (this.closed) { try { dispose() } catch {} }
    else this.disposers.push(dispose)
  }

  send(envelope) {
    if (this.closed) fail(CONTROL.error.disconnected)
    const encoded = encodeEnvelope(envelope, this.limits, this.hostId)
    try {
      // Do not let a slow carrier accumulate an unbounded set of outgoing writes.
      if (this.sending >= this.limits.maxInflight) fail(CONTROL.error.limit)
      const sent = this.transport.send(encoded)
      if (sent && typeof sent.then === 'function') {
        this.sending++
        Promise.resolve(sent).catch((error) => this.close(error)).finally(() => { this.sending-- })
      }
    } catch (error) {
      this.close(error)
      throw error
    }
  }

  close(error = new ControlError(CONTROL.error.disconnected)) {
    if (this.closed) return
    this.closed = true
    for (const dispose of this.disposers.splice(WIRE.zero)) { try { dispose() } catch {} }
    try { this.transport.close() } catch {}
    this.onClose(error instanceof ControlError ? error : new ControlError(CONTROL.error.disconnected))
  }
}


/** Adapt an authenticated object carrier without changing the operation schema. */
export function serializedTransport(transport, limits) {
  return {
    send: (encoded) => transport.send(decodeEnvelope(encoded, limits)),
    onMessage: (listener) => transport.onMessage((envelope) => {
      try { listener(encodeEnvelope(envelope, limits)) } catch { transport.close() }
    }),
    onClose: (listener) => transport.onClose(listener),
    close: () => transport.close(),
  }
}
