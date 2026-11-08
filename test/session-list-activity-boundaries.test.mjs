/** Requirements-derived BVA/EP/decision/state checks on the real connector producer. */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { HOOK, T } from './support/expect.mjs'
import { RELAY, RELAY_REDIRECT, RUNTIME } from './support/constants.mjs'
import { boundariesHost, LIST_BOUNDARIES as C } from './support/session-list-boundaries.mjs'

const assertConfirmed = (snapshot, expectedTimestamp) => {
  assert.equal(snapshot.flushCalls, C.counts.one, 'the actual connector handover flush was reached exactly once')
  assert.equal(snapshot.realFlushResult, true, 'real host durability flush confirmed true')
  assert.equal(snapshot.result.ok, true, JSON.stringify(snapshot.result))
  assert.equal(snapshot.events.length, C.counts.one, 'one target delivery activity')
  for (const event of snapshot.events) {
    assert.equal(event.confirmed, true, 'activity is emitted only after real true confirmation, not while pending')
    assert.equal(event.phase, C.phase.confirmed)
    assert.ok(Number.isFinite(event.timestamp), 'producer emits a finite numeric timestamp')
    if (expectedTimestamp !== undefined) assert.equal(event.timestamp, expectedTimestamp)
  }
}
const assertDelivered = (snapshot, operation) => {
  assert.equal(snapshot.result.ok, true, JSON.stringify(snapshot.result))
  if (operation === C.operation.start) assert.equal(snapshot.result.value.sessionId, snapshot.sessionId, 'start reply matches exact learned flush target')
  else assert.equal(snapshot.result.value.status, C.status.delivered)
}
const actualRelay = async (w, sessionId, marker, operation) => {
  await w.wait(sessionId)
  const messages = (await w.host.call('userMessages', { sessionId })).filter(message => message.text === marker)
  assert.equal(messages.length, C.counts.one, 'one unchanged actual message reached the target')
  const source = messages[C.counts.none].source
  const expected = operation === C.operation.redirect ? RELAY_REDIRECT : RELAY
  assert.deepEqual({ kind: source.kind, form: source.form, via: source.via }, expected, 'delivery preserves Fishball agent-message identity')
}
const settledSnapshot = async w => {
  const result = await w.probe('settled')
  await w.wait(result.sessionId)
  return w.probe('snapshot')
}

// Existing 26 tests and their contract model remain untouched; these drive the producer itself.
describe('Fishball real connector: deterministic producer boundaries and confirmation gates', () => {
  let w
  before(async context => {
    w = await boundariesHost()
    context.diagnostic('disposable child PID=' + w.host.child.pid + '; SDK root=' + RUNTIME)
  }, HOOK)
  after(async () => { await w?.stop() }, HOOK)

  for (const [label, clockOffsetMs] of [['T−1', C.clock.beforeMs], ['T', C.clock.tieMs], ['T+1', C.clock.afterMs]]) {
    it('BVA producer clock ' + label + ': emitted timestamp is exactly baseline T+1ms', T, async () => {
      const sessionId = await w.target('boundaries-clock-' + label)
      const before = await w.row(sessionId)
      const marker = C.text.marker + ' clock ' + label
      await w.probe('configure', { now: before.updatedAt + clockOffsetMs })
      try {
        await w.probe('begin', { operation: C.operation.message, sessionId, marker })
        const done = await settledSnapshot(w)
        assertConfirmed(done, before.updatedAt + C.clock.firstAdvanceMs)
        assertDelivered(done, C.operation.message)
        await actualRelay(w, sessionId, marker, C.operation.message)
        assert.equal((await w.row(sessionId)).updatedAt, before.updatedAt, 'live activity does not write authoritative ordering')
      } finally { assert.equal(await w.probe('cleanup'), true) }
    })
  }

  it('State Transition: frozen clock uses previous emitted watermark T+1 then T+2 without durable writes', T, async () => {
    const sessionId = await w.target('boundaries-repeat')
    const before = await w.row(sessionId)
    const workspaces = await w.host.call('workspaces')
    await w.probe('configure', { now: before.updatedAt })
    try {
      for (const step of [C.clock.firstAdvanceMs, C.clock.secondAdvanceMs]) {
        const marker = C.text.marker + ' repeated ' + step
        await w.probe('begin', { operation: C.operation.message, sessionId, marker })
        const done = await settledSnapshot(w)
        assertConfirmed(done, before.updatedAt + step)
        assertDelivered(done, C.operation.message)
        await actualRelay(w, sessionId, marker, C.operation.message)
        assert.equal((await w.row(sessionId)).updatedAt, before.updatedAt, 'both baselines remain authoritative T despite live watermarks')
      }
      assert.deepEqual(await w.host.call('workspaces'), workspaces, 'manual accounting order and pins remain unchanged')
    } finally { assert.equal(await w.probe('cleanup'), true) }
  })

  for (const operation of Object.values(C.operation)) {
    for (const outcome of Object.values(C.outcome)) {
      it('Decision/State ' + operation + ': pending → ' + outcome + ' emits only after confirmed true', T, async () => {
        const prepared = await w.target('boundaries-' + operation + '-' + outcome)
        const before = await w.row(prepared)
        const cwd = operation === C.operation.start ? (await w.host.call('header', { sessionId: prepared })).cwd : undefined
        const marker = C.text.marker + ' ' + operation + ' ' + outcome
        await w.probe('configure', { now: before.updatedAt })
        try {
          await w.probe('begin', { operation, ...(operation === C.operation.start ? { cwd } : { sessionId: prepared }), marker, pending: true })
          const reached = await w.probe('reached')
          assert.equal(reached.flushCalls, C.counts.one)
          assert.equal(reached.reached.portOnly, true, 'checkpoint came from the tested connector facade, never agent runtime barriers')
          assert.equal(reached.reached.sessionId, reached.sessionId)
          if (operation !== C.operation.start) assert.equal(reached.sessionId, prepared, 'exact scoped target reached')
          const pending = await w.probe('checkpoint')
          assert.equal(pending.phase, C.phase.pending)
          assert.equal(pending.settled, false, 'delivery cannot settle before explicit confirmation')
          assert.equal(pending.realFlushResult, null)
          assert.deepEqual(pending.allEvents, [], 'no activity for any target while actual delivery checkpoint remains pending after public-list/event-loop progress')
          await w.probe('confirm', { outcome })
          const settled = await settledSnapshot(w)
          if (operation === C.operation.start && settled.result.ok) assert.equal(settled.result.value.sessionId, reached.sessionId, 'start flush target matches returned target')
          await actualRelay(w, settled.sessionId, marker, operation)
          const done = await w.probe('snapshot')
          if (outcome === C.outcome.confirmed) {
            assertConfirmed(done)
            assertDelivered(done, operation)
          } else {
            assert.deepEqual(done.allEvents, [], 'false or rejected flush never confirms delivery and emits zero activity for any target after settlement/idle')
            assert.equal(done.realFlushResult, null, 'probe never supplied real true confirmation')
            assert.equal(done.phase, outcome === C.outcome.rejected ? C.phase.rejected : C.phase.unconfirmed)
          }
        } finally { assert.equal(await w.probe('cleanup'), true, 'restore facade and prove real flush descriptors unchanged') }
      })
    }
  }
})
