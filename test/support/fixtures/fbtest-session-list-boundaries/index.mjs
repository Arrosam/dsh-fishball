/** Opt-in deterministic probes around the real connector on the disposable H-STUB host. */
import assert from 'node:assert/strict'
import { createSessionPort } from '../../../../packages/connector/src/slim/host/session-port.js'
import { LIST_BOUNDARIES as C } from '../../session-list-boundaries-data.mjs'
import { textOf } from '../../util.mjs'

export const name = C.fixture.name
export const inject = ['sessions', 'sessionController', 'agents', 'workspaceRegistry', 'fishballSessionState']

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const flushDescriptors = service => {
  const descriptors = []
  for (let owner = service; owner; owner = Object.getPrototypeOf(owner)) descriptors.push(Object.getOwnPropertyDescriptor(owner, C.flushKey))
  return descriptors
}
const containsRelay = (session, marker) => session.snapshotEvents().some(event => {
  if (event.type !== C.messageEvent) return false
  const message = event.data?.message ?? event.data
  return message?.source?.kind === C.relayKind && textOf(message.content) === marker
})

export function apply(ctx) {
  const events = []
  const sessions = ctx.sessions
  const originalFlush = sessions.flush
  const originalDescriptors = flushDescriptors(sessions)
  const facadeTarget = {}
  // Only this port receives the facade: agent runtime barriers retain the real service.
  const facade = new Proxy(facadeTarget, {
    get(target, key) {
      if (Object.hasOwn(target, key)) return Reflect.get(target, key)
      const value = Reflect.get(sessions, key, sessions)
      return typeof value === 'function' ? value.bind(sessions) : value
    },
  })
  const portContext = {
    sessions: facade,
    sessionController: ctx.sessionController,
    agents: ctx.agents,
    workspaceRegistry: ctx.workspaceRegistry,
    get: ctx.get.bind(ctx),
    on: ctx.on.bind(ctx),
    emit: ctx.emit.bind(ctx),
    logger: ctx.logger,
  }
  let clock
  let port
  let active
  let restoreFacade

  const assertUntouched = () => {
    // Cordis may return a freshly bound method on access; descriptors prove no mutation.
    assert.deepEqual(flushDescriptors(sessions), originalDescriptors, 'real own/prototype flush descriptors stay unchanged')
    return true
  }
  const releaseFacade = () => { restoreFacade?.(); restoreFacade = null; return assertUntouched() }
  const snapshot = () => ({
    sessionId: active.sessionId,
    marker: active.marker,
    phase: active.phase,
    reached: active.reach,
    flushCalls: active.flushCalls,
    realFlushResult: active.realFlushResult,
    settled: active.settled,
    result: active.result,
    allEvents: events.slice(active.offset),
    events: events.slice(active.offset).filter(event => event.sessionId === active.sessionId),
  })

  ctx.on(C.event, (sessionId, timestamp) => {
    events.push({ sessionId, timestamp, phase: active?.phase ?? null, confirmed: active?.phase === C.phase.confirmed && active?.realFlushResult === true })
  })

  function begin({ operation, sessionId = null, cwd, marker, pending = false }) {
    assert.ok(port, 'configure the injected-clock port first')
    assert.ok(!active || active.settled, 'one scoped delivery at a time')
    releaseFacade()
    const state = active = {
      operation, sessionId, marker, phase: C.phase.delivering, offset: events.length,
      flushCalls: C.counts.none, realFlushResult: null, settled: false, result: null,
      gate: deferred(), reached: deferred(), reach: null,
    }
    const ownDescriptor = Object.getOwnPropertyDescriptor(facadeTarget, C.flushKey)
    Object.defineProperty(facadeTarget, C.flushKey, {
      configurable: true,
      value: async (session, ...rest) => {
        const exactTarget = state.sessionId === null || state.sessionId === session?.id
        if (!exactTarget) return originalFlush.call(sessions, session, ...rest)
        state.sessionId ??= session.id
        state.flushCalls += C.counts.one
        assert.equal(state.flushCalls, C.counts.one, 'one connector delivery checkpoint for the exact target/marker')
        state.phase = C.phase.pending
        state.reach = { sessionId: session.id, marker: state.marker, relayPresent: containsRelay(session, state.marker), portOnly: true }
        state.reached.resolve(state.reach)
        const outcome = pending ? await state.gate.promise : C.outcome.confirmed
        if (outcome === C.outcome.rejected) {
          state.phase = C.phase.rejected
          throw new Error(C.text.rejectedFlush)
        }
        if (outcome === C.outcome.unconfirmed) {
          state.phase = C.phase.unconfirmed
          return false
        }
        // Record confirmation only after the actual host durability promise returns true.
        state.realFlushResult = await originalFlush.call(sessions, session, ...rest)
        state.phase = state.realFlushResult === true ? C.phase.confirmed : C.phase.unconfirmed
        return state.realFlushResult
      },
    })
    restoreFacade = () => {
      if (ownDescriptor) Object.defineProperty(facadeTarget, C.flushKey, ownDescriptor)
      else Reflect.deleteProperty(facadeTarget, C.flushKey)
      assert.deepEqual(Object.getOwnPropertyDescriptor(facadeTarget, C.flushKey), ownDescriptor, 'restore the facade own/prototype shape')
    }
    const args = { sessionId, message: marker, attachments: [] }
    if (operation === C.operation.start) Object.assign(args, { target: { cwd }, title: C.text.title })
    // Both handlers are attached immediately: an explicitly rejected gate never leaks a rejection.
    state.done = Promise.resolve().then(() => port[operation](args)).then(
      value => { state.result = { ok: true, value } },
      error => { state.result = { ok: false, error: String(error?.message ?? error) } },
    ).finally(() => { state.settled = true; releaseFacade() })
    return true
  }

  const operations = {
    configure({ now }) {
      assert.ok(!active || active.settled, 'finish the prior delivery before configuring another port')
      clock = now
      port = createSessionPort(portContext, { now: () => clock })
      return assertUntouched()
    },
    begin,
    async reached() {
      const reach = await Promise.race([
        active.reached.promise,
        active.done.then(() => { if (!active.reach) throw new Error('delivery settled before the scoped handover flush was reached'); return active.reach }),
      ])
      return { ...reach, ...snapshot() }
    },
    async checkpoint() {
      assert.ok(active.reach, 'checkpoint requires the actual handover flush to be reached')
      assert.equal(active.phase, C.phase.pending, 'confirmation gate remains pending')
      // Give any incorrectly early async list lookup real public-list/event-loop progress.
      for (let count = C.counts.none; count < C.progress.checkpoints; count += C.counts.one) {
        await ctx.sessionController.list({}, new AbortController().signal)
        await new Promise(setImmediate)
      }
      return snapshot()
    },
    confirm({ outcome }) {
      assert.equal(active.phase, C.phase.pending, 'only release a reached pending checkpoint')
      assert.ok(Object.values(C.outcome).includes(outcome), 'explicit true/false/rejected outcome')
      active.gate.resolve(outcome)
      return true
    },
    async settled() { await active.done; return snapshot() },
    snapshot,
    async cleanup() {
      if (active) { active.gate.resolve(C.outcome.rejected); await active.done }
      return releaseFacade()
    },
    untouched: assertUntouched,
  }
  const listener = async message => {
    if (message?.type !== C.fixture.request) return
    try {
      const value = await operations[message.op](message.args ?? {})
      process.send({ type: C.fixture.response, id: message.id, ok: true, value })
    } catch (error) {
      process.send({ type: C.fixture.response, id: message.id, ok: false, error: String(error?.message ?? error) })
    }
  }
  process.on('message', listener)
  ctx.effect(() => () => { active?.gate.resolve(C.outcome.rejected); releaseFacade(); process.off('message', listener) })
}
