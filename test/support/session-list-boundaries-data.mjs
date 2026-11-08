/** Requirements-owned producer boundaries; no copied connector timestamp or delivery algorithm. */
export const LIST_BOUNDARIES = Object.freeze({
  fixture: Object.freeze({ name: 'fbtest-session-list-boundaries', request: 'list-boundaries-probe', response: 'list-boundaries-probe-reply' }),
  event: 'api-session/activity',
  messageEvent: 'user/message',
  relayKind: 'agent-message',
  flushKey: 'flush',
  operation: Object.freeze({ message: 'message', start: 'start', redirect: 'redirect' }),
  outcome: Object.freeze({ confirmed: 'true', unconfirmed: 'false', rejected: 'reject' }),
  phase: Object.freeze({ delivering: 'delivering', pending: 'pending', confirmed: 'confirmed', unconfirmed: 'unconfirmed', rejected: 'rejected' }),
  status: Object.freeze({ delivered: 'delivered', unconfirmed: 'unconfirmed' }),
  counts: Object.freeze({ none: 0, one: 1, two: 2 }),
  progress: Object.freeze({ checkpoints: 3 }),
  clock: Object.freeze({ beforeMs: -1, tieMs: 0, afterMs: 1, firstAdvanceMs: 1, secondAdvanceMs: 2 }),
  ms: Object.freeze({ ipc: 25000 }),
  text: Object.freeze({ title: 'Fishball deterministic activity target', marker: 'Fishball deterministic activity delivery', rejectedFlush: 'fbtest: scoped handover flush rejected', disposedFlush: 'fbtest: scoped handover flush disposed' }),
})
