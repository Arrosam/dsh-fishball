import assert from 'node:assert/strict'

/** Test-only serialized carrier; never passes context objects or shared callbacks. */
export function carrierPair(wire) {
  const ends = [0, 1].map(() => ({ messages: new Set(), closures: new Set(), closed: false }))
  return ends.map((end, index) => ({
    send(text) {
      assert.equal(typeof text, 'string', 'production transport must serialize envelopes')
      const peer = ends[1 - index]
      if (end.closed || peer.closed) throw new Error('test carrier closed')
      wire.push({ sender: index, value: JSON.parse(text) })
      queueMicrotask(() => { if (!peer.closed) for (const receive of peer.messages) receive(text) })
    },
    onMessage(listener) { end.messages.add(listener); return () => end.messages.delete(listener) },
    onClose(listener) { end.closures.add(listener); return () => end.closures.delete(listener) },
    close() {
      for (const candidate of ends) {
        if (candidate.closed) continue
        candidate.closed = true
        for (const listener of candidate.closures) listener()
      }
    },
  }))
}

