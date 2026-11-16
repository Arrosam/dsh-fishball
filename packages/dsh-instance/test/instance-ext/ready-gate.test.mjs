/**
 * READY gate for page-open `fishballInstance.manager.ensureSession()`, black-box from the
 * requirements only: docs/planning/v2-final-scope.md §4 READY row and §4.2, the cases in
 * docs/test-design/v2-page-ready-cases.md §4.4, and X1a in docs/plugins/instance-extension-points.md.
 *
 * Two drivers:
 * - PORT: `createExtensions(ctx)` with a fake chat port whose activation completion the case
 *   holds and releases. It drives the gate through the INTERNAL seam `markReady()`, which the
 *   parent supplied as a product-internal contract (the app row's `appReady.onReady` listener
 *   calls it); PORT cases therefore do not prove the app row wires that listener. `close()` is
 *   disposal (a failed generation also disposes).
 * - BOOT: `bootChild` with the fake launcher `appReady` withheld (`ready: false`) and committed
 *   by the case: the real app row's `appReady.onReady` path. `close()` is disposal; a new boot
 *   over the same home and session logs is a restart (new generation). Stale continuations are
 *   replayed from the captured listeners.
 *
 * "Still pending" is an event-ordering checkpoint (flush microtasks and check-phase turns), never
 * a wall-clock deadline: every PORT case that asserts "no activation yet" uses the same
 * checkpoint that, after the signal, is shown to be enough to observe the activation (UC-01).
 * Techniques: Use Case, EP, BVA, Decision Table (R1–R5), State Transition (R-T*, R-X*).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SERVICES, bootChild, tempDir } from '../../../../test/support/instance-ext.mjs'
import { loadCore, loadInstance } from '../../../../test/support/body-soul-env.mjs'

const C = Object.freeze({
  alphaId: 'ready-gate-manager-alpha',
  betaId: 'ready-gate-manager-beta',
  // Two check-phase turns: every microtask chain and one I/O poll between them have run.
  checkpointRounds: 2,
  state: Object.freeze({ pending: 'pending', resolved: 'resolved', rejected: 'rejected' }),
  turnEvents: Object.freeze(['turn/start', 'user/message']),
  activationFailure: 'held activation failed',
  route: Object.freeze({
    origin: 'http://127.0.0.1:1',
    path: '/api/fishball/session',
    post: 'POST',
    body: '{}',
    ok: 200,
    unavailable: 503,
    unavailableBody: Object.freeze({ code: 'MANAGER_UNAVAILABLE' }),
  }),
  timers: Object.freeze(['setTimeout', 'setInterval']),
  services: Object.freeze({ profile: 'profileContext', agents: 'agents' }),
  tempPrefix: 'fbtest-ready-gate-',
  idType: 'string',
  // The existing notice path (X10) is outside the READY gate; queued is its documented wake outcome.
  notice: Object.freeze({ pluginId: 'fbtest-plugin', dedupeKey: 'ready-gate-scope', text: 'a notice', wake: true }),
  noticeQueued: 'queued',
})

// ---------------------------------------------------------------------------------------------
// Observation helpers
// ---------------------------------------------------------------------------------------------

/** Attach settlement observers at once, so a later read never races the promise itself. */
function track(promise) {
  const tracked = { state: C.state.pending, value: undefined, error: undefined, promise }
  promise.then(
    (value) => { tracked.state = C.state.resolved; tracked.value = value },
    (error) => { tracked.state = C.state.rejected; tracked.error = error },
  )
  return tracked
}

/** Event-driven checkpoint: let every queued microtask and check-phase continuation run. */
async function checkpoint() {
  for (let round = 0; round < C.checkpointRounds; round++) await new Promise((resolve) => setImmediate(resolve))
}

/** Settle-and-read: the tracked promise's final state after it settles. */
async function settled(tracked) {
  await tracked.promise.catch(() => {})
  return tracked
}

function ensure(service) { return track(service.manager.ensureSession()) }

// ---------------------------------------------------------------------------------------------
// PORT driver: createExtensions with a held fake chat port
// ---------------------------------------------------------------------------------------------

/**
 * A chat port with the chat's own singleton semantics (concurrent `activate()` joins one
 * in-flight activation; a live session is returned at once). `activateAttached()` (the page
 * path's member) delegates to the same `activate()`. Completion is held until
 * `release()`/`fail()` unless `held` is false. `created` counts sessions the port made.
 */
function chatPort({ id = C.alphaId, held = true } = {}) {
  const counts = { activate: 0, created: 0 }
  let live
  let inflight
  let gate
  const port = {
    counts,
    sessionId: () => live?.id,
    activate() {
      counts.activate++
      if (live) return Promise.resolve(live)
      if (inflight === undefined) {
        gate = Promise.withResolvers()
        inflight = gate.promise.then(
          () => { counts.created++; live = { id, followup() {} }; return live },
          (error) => { inflight = undefined; throw error },
        )
        if (!held) gate.resolve()
      }
      return inflight
    },
    // The page path's activation: same singleton semantics, counted in counts.activate.
    activateAttached: () => port.activate(),
    release() { gate.resolve() },
    fail() { gate.reject(new Error(C.activationFailure)) },
  }
  return port
}

/** One generation of the extensions over `home`, bound to its own port. */
async function generation(home, portOptions) {
  const { createExtensions } = await loadCore('src/slim/child/extensions.js')
  const quiet = () => ({ info() {}, warn() {}, error() {}, debug() {} })
  const ext = createExtensions({
    on: () => () => {},
    effect: (execute) => execute(),
    get: (name) => (name === C.services.profile ? { home } : undefined),
    logger: quiet,
  })
  const port = chatPort(portOptions)
  ext.bind(port)
  return { ext, port, service: ext.service }
}

async function portDriver(t, portOptions) {
  const home = await tempDir(t, C.tempPrefix)
  const alpha = await generation(home, portOptions)
  t.after(() => alpha.ext.close())
  return { home, ...alpha }
}

// ---------------------------------------------------------------------------------------------
// BOOT driver: bootChild with the launcher appReady withheld
// ---------------------------------------------------------------------------------------------

function bootWithheld(t, options = {}) { return bootChild(t, { ready: false, ...options }) }

/** The next generation over the same home and durable session logs, readiness withheld. */
function restart(t, previous) { return bootWithheld(t, { home: previous.home, sessionLogs: previous.sessionLogs }) }

/**
 * Deliver a disposed generation's stale continuations: a late launcher commit, then every
 * listener it ever registered (the SDK never does the latter; it is the documented driver
 * technique for stale callbacks). A stale listener may refuse by throwing; only its effect is
 * asserted, so throws are collected, not propagated.
 */
function replayStale(h) {
  const refused = []
  h.appReady.commit()
  for (const listener of h.appReady.captured) {
    try { listener() } catch (error) { refused.push(error) }
  }
  return refused
}

/**
 * A ready BOOT generation whose page-open activation is held inside the SDK `agents.create`
 * seam (before the fake SDK creates anything). Resolves once the activation is held there.
 */
async function heldBootActivation(t) {
  const h = await bootWithheld(t)
  const service = h.requireInstance()
  const agents = h.ctx.get(C.services.agents)
  const create = agents.create
  const hold = Promise.withResolvers()
  const entered = Promise.withResolvers()
  agents.create = async (options) => { entered.resolve(); await hold.promise; return create.call(agents, options) }
  h.appReady.commit()
  const call = ensure(service)
  // Either the activation reaches the held seam or the call settles; never an unbounded wait.
  let held = false
  await Promise.race([entered.promise.then(() => { held = true }), call.promise.catch(() => {})])
  assert.ok(held, 'the activation went through agents.create and is held there')
  return { h, service, call, hold }
}

function turnEvents(h) {
  return h.agents.flatMap(({ live }) => live.session.snapshotEvents().map(({ type }) => type)).filter((type) => C.turnEvents.includes(type))
}

function assertNoTurn(h) {
  assert.deepEqual(turnEvents(h), [], 'ensuring a session never starts a turn')
  assert.equal(h.agents.reduce((count, { live }) => count + live.followups.length, 0), 0, 'no message queued')
}

/** The documented session route over a live instance lookup (the CHILD-WEB route's input). */
async function sessionRoute(instance) {
  const { registerSessionRoute } = await loadCore('src/session/route.js')
  const routes = []
  registerSessionRoute({
    on: () => () => {},
    connection: { fetch: { register(route) { routes.push(route); return () => {} } } },
    get: (name) => (name === SERVICES.instance ? instance() : undefined),
  })
  return async function post() {
    const response = await routes[0].fetch(new Request(C.route.origin + C.route.path, { method: C.route.post, body: C.route.body }))
    return { status: response.status, body: await response.json() }
  }
}

// ---------------------------------------------------------------------------------------------
// Use Cases
// ---------------------------------------------------------------------------------------------

describe('READY Use Cases', () => {
  it('READY-UC-01 [PORT] before-ready ensure waits; the signal then dispatches one activation', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const call = ensure(service)
    await checkpoint()
    assert.equal(call.state, C.state.pending, 'no signal yet: the call stays pending')
    assert.equal(port.counts.activate, 0, 'no activation before the signal')
    ext.markReady()
    await checkpoint()
    assert.ok(port.counts.activate >= 1, 'the same checkpoint observes dispatch once the signal arrived')
    port.release()
    assert.equal((await settled(call)).value, C.alphaId)
    assert.equal(port.counts.created, 1)
  })

  it('READY-UC-01 [BOOT] boot settles without the signal; ensure waits, then resolves once ready', async (t) => {
    // bootChild returning at all proves rows applied and the host attached without appReady.
    const h = await bootWithheld(t)
    assert.equal(h.appReady.committed, false)
    const call = ensure(h.requireInstance())
    await checkpoint()
    assert.equal(call.state, C.state.pending)
    assert.equal(h.agents.length, 0, 'no session before the signal')
    h.appReady.commit()
    const id = (await settled(call)).value
    assert.equal(typeof id, C.idType)
    assert.equal(h.agents.length, 1)
    assert.equal(id, h.manager().id)
    assertNoTurn(h)
  })

  it('READY-UC-02 [PORT] after the signal ensure proceeds with no second signal', async (t) => {
    const { ext, port, service } = await portDriver(t, { held: false })
    ext.markReady()
    const call = ensure(service)
    assert.equal((await settled(call)).value, C.alphaId)
    assert.equal(port.counts.created, 1)
  })

  it('READY-UC-02 [BOOT] after the launcher commit ensure resolves with no further signal', async (t) => {
    const h = await bootWithheld(t)
    h.appReady.commit()
    const call = await settled(ensure(h.requireInstance()))
    assert.equal(call.state, C.state.resolved, 'resolved: ' + call.error?.message)
    assert.equal(h.agents.length, 1)
    assert.equal(h.requireInstance().manager.sessionId(), call.value)
    assertNoTurn(h)
  })

  it('READY-UC-03 [PORT] two waiters before ready share one held activation and id', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const first = ensure(service)
    const second = ensure(service)
    await checkpoint()
    assert.deepEqual([first.state, second.state], [C.state.pending, C.state.pending])
    assert.equal(port.counts.activate, 0)
    ext.markReady()
    await checkpoint()
    assert.deepEqual([first.state, second.state], [C.state.pending, C.state.pending], 'activation held: no early settlement')
    port.release()
    assert.equal((await settled(first)).value, C.alphaId)
    assert.equal((await settled(second)).value, C.alphaId)
    assert.equal(port.counts.created, 1, 'one session for both waiters')
  })

  it('READY-UC-03 [BOOT] two waiters before ready resolve the same single manager', async (t) => {
    const h = await bootWithheld(t)
    const service = h.requireInstance()
    const calls = [ensure(service), ensure(service)]
    await checkpoint()
    assert.deepEqual(calls.map(({ state }) => state), [C.state.pending, C.state.pending])
    h.appReady.commit()
    const ids = (await Promise.all(calls.map(settled))).map(({ value }) => value)
    assert.equal(ids[0], ids[1])
    assert.equal(h.agents.length, 1, 'never two manager sessions')
    assertNoTurn(h)
  })

  it('READY-UC-04 [PORT] dispose rejects the pending wait; the late signal is inert', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const call = ensure(service)
    await ext.close()
    await checkpoint()
    assert.equal(call.state, C.state.rejected, 'disposal refuses the pending call')
    ext.markReady()
    await checkpoint()
    assert.equal(port.counts.activate, 0, 'the disposed generation never activates')
    assert.equal(port.counts.created, 0)
  })

  it('READY-UC-04 [BOOT] dispose rejects the pending wait; replayed old listeners create nothing', async (t) => {
    const h = await bootWithheld(t)
    const call = ensure(h.requireInstance())
    assert.ok(h.appReady.pending > 0, 'precondition: the app row registered an unfired onReady listener')
    await h.close()
    assert.equal((await settled(call)).state, C.state.rejected)
    // DSH AppReady API: the onReady disposer cancels a pending listener; disposal must call it.
    assert.equal(h.appReady.pending, 0, 'disposal cancels the unfired onReady listener')
    replayStale(h)
    await checkpoint()
    assert.equal(h.agents.length, 0, 'no session for the disposed generation')
  })

  it('READY-UC-04 [BOOT+ROUTE] a pending POST api/fishball/session answers 503 MANAGER_UNAVAILABLE on disposal', async (t) => {
    const h = await bootWithheld(t)
    const instance = h.requireInstance()
    const post = await sessionRoute(() => instance)
    const answer = track(post())
    await checkpoint()
    assert.equal(answer.state, C.state.pending, 'the route waits with the gated ensure')
    await h.close()
    const { value } = await settled(answer)
    assert.equal(value.status, C.route.unavailable)
    assert.deepEqual(value.body, C.route.unavailableBody)
    assert.equal(h.agents.length, 0)
  })

  it('READY-UC-05 [PORT] restart: beta has its own gate; alpha signal cannot open it', async (t) => {
    const alpha = await portDriver(t)
    const alphaCall = ensure(alpha.service)
    await alpha.ext.close()
    assert.equal((await settled(alphaCall)).state, C.state.rejected)
    const beta = await generation(alpha.home, { id: C.betaId, held: false })
    t.after(() => beta.ext.close())
    const betaCall = ensure(beta.service)
    alpha.ext.markReady()
    await checkpoint()
    assert.equal(betaCall.state, C.state.pending, 'beta does not inherit alpha readiness')
    assert.equal(beta.port.counts.activate, 0)
    assert.equal(alpha.port.counts.activate, 0)
    beta.ext.markReady()
    assert.equal((await settled(betaCall)).value, C.betaId)
    assert.equal(beta.port.counts.created, 1)
  })

  it('READY-UC-05 [BOOT] restart: alpha refused, beta waits for its own signal then activates once', async (t) => {
    const alpha = await bootWithheld(t)
    const alphaCall = ensure(alpha.requireInstance())
    await alpha.close()
    assert.equal((await settled(alphaCall)).state, C.state.rejected)
    const beta = await restart(t, alpha)
    const betaCall = ensure(beta.requireInstance())
    replayStale(alpha)
    await checkpoint()
    assert.equal(betaCall.state, C.state.pending, 'old-generation callbacks are inert for beta')
    assert.equal(beta.agents.length, 0)
    beta.appReady.commit()
    assert.equal((await settled(betaCall)).state, C.state.resolved)
    assert.equal(beta.agents.length, 1)
    assert.equal(alpha.agents.length, 0)
    assertNoTurn(beta)
  })

  it('READY-UC-06 [BOOT] failed generation (never committed, disposed) refuses the wait; a later commit is inert', async (t) => {
    const h = await bootWithheld(t)
    const call = ensure(h.requireInstance())
    // A failed startup never commits and goes through disposal.
    await h.close()
    assert.equal((await settled(call)).state, C.state.rejected)
    h.appReady.commit()
    await checkpoint()
    assert.equal(h.agents.length, 0, 'no false-ready session after failure')
  })
})

// ---------------------------------------------------------------------------------------------
// Equivalence partitions
// ---------------------------------------------------------------------------------------------

describe('READY equivalence partitions', () => {
  it('READY-EP-01 [PORT] no signal, failure or disposal: the call remains pending at every checkpoint', async (t) => {
    const { port, service } = await portDriver(t)
    const call = ensure(service)
    for (let round = 0; round < C.checkpointRounds; round++) {
      await checkpoint()
      assert.equal(call.state, C.state.pending)
    }
    assert.equal(port.counts.activate, 0, 'no timer-success or substitute activation')
  })

  it('READY-EP-01 [BOOT] no signal: pending with no session while the child is otherwise live', async (t) => {
    const h = await bootWithheld(t)
    const call = ensure(h.requireInstance())
    await checkpoint()
    assert.equal(call.state, C.state.pending)
    assert.equal(h.agents.length, 0)
    assert.equal(h.requireInstance().manager.sessionId(), undefined)
  })

  it('READY-EP-02 [BOOT] install/apply/boot plus readiness with no request create no manager', async (t) => {
    const h = await bootChild(t)
    assert.equal(h.appReady.committed, true)
    await checkpoint()
    assert.equal(h.agents.length, 0, 'readiness alone is lazy')
    assert.equal(h.requireInstance().manager.sessionId(), undefined)
  })

  it('READY-EP-03 [BOOT] host attach before and after readiness creates no manager', async (t) => {
    const h = await bootWithheld(t)
    await h.reconnect()
    assert.equal(h.agents.length, 0, 'attach before ready')
    h.appReady.commit()
    await h.reconnect()
    await checkpoint()
    assert.equal(h.agents.length, 0, 'attach after ready')
    assert.equal(h.requireInstance().manager.sessionId(), undefined)
  })

  it('READY-EP-04 [BOOT] child server listening and bridge handshakes are not the child ready signal', async (t) => {
    const h = await bootWithheld(t)
    const call = ensure(h.requireInstance())
    assert.equal(h.bridge.status.ready, true, 'transport attached and handshaken')
    assert.equal(typeof h.app.origin, 'string', 'child app server listening')
    await h.reconnect()
    await checkpoint()
    assert.equal(call.state, C.state.pending, 'no substitute readiness')
    assert.equal(h.agents.length, 0)
    h.appReady.commit()
    assert.equal((await settled(call)).state, C.state.resolved)
  })

  it('READY-EP-05 [PORT] the wait schedules no timer across wait, signal and failure', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const scheduled = Object.fromEntries(C.timers.map((name) => [name, 0]))
    const originals = Object.fromEntries(C.timers.map((name) => [name, globalThis[name]]))
    for (const name of C.timers) globalThis[name] = (...args) => { scheduled[name]++; return originals[name](...args) }
    try {
      const call = ensure(service)
      await checkpoint()
      ext.markReady()
      await checkpoint()
      port.fail()
      await settled(call)
    } finally {
      for (const name of C.timers) globalThis[name] = originals[name]
    }
    assert.deepEqual(scheduled, Object.fromEntries(C.timers.map((name) => [name, 0])), 'readiness is the signal, not a timer')
  })

  it('READY-EP-SCOPE [BOOT] the notice path is not gated: notify(wake) before ready keeps its existing behaviour', async (t) => {
    const h = await bootWithheld(t)
    const result = await h.requireInstance().manager.notify({ ...C.notice })
    assert.equal(result.status ?? result, C.noticeQueued, 'only page-open ensure waits for readiness')
    assert.equal(h.agents.length, 1)
  })
})

// ---------------------------------------------------------------------------------------------
// Boundary values (waiter cardinality 0↔1↔2 and the ready event boundary)
// ---------------------------------------------------------------------------------------------

describe('READY boundary values', () => {
  it('READY-BVA-01 [PORT] zero waiters: the signal activates nothing; a later request uses remembered readiness', async (t) => {
    const { ext, port, service } = await portDriver(t, { held: false })
    ext.markReady()
    await checkpoint()
    assert.equal(port.counts.activate, 0, 'zero waiters, zero activation')
    assert.equal((await settled(ensure(service))).value, C.alphaId, 'no second signal needed')
    assert.equal(port.counts.created, 1)
  })

  it('READY-BVA-01 [BOOT] zero waiters: no session at ready; a later request resolves without a second commit', async (t) => {
    const h = await bootWithheld(t)
    h.appReady.commit()
    await checkpoint()
    assert.equal(h.agents.length, 0)
    assert.equal((await settled(ensure(h.requireInstance()))).state, C.state.resolved)
    assert.equal(h.agents.length, 1)
  })

  it('READY-BVA-02 [PORT] one waiter registered before the signal is not missed', async (t) => {
    const { ext, port, service } = await portDriver(t, { held: false })
    const call = ensure(service)
    await checkpoint()
    assert.equal(call.state, C.state.pending)
    ext.markReady()
    assert.equal((await settled(call)).value, C.alphaId)
    assert.equal(port.counts.created, 1)
  })

  it('READY-BVA-03 [PORT] a second concurrent waiter joins the first, not a duplicate manager', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const first = ensure(service)
    await checkpoint()
    const second = ensure(service)
    ext.markReady()
    await checkpoint()
    port.release()
    const values = [(await settled(first)).value, (await settled(second)).value]
    assert.deepEqual(values, [C.alphaId, C.alphaId])
    assert.equal(port.counts.created, 1)
  })

  it('READY-BVA-04 [PORT] callers across the ready boundary join the one in-flight activation', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const before = ensure(service)
    ext.markReady()
    await checkpoint()
    assert.ok(port.counts.activate >= 1, 'activation in flight (held)')
    const after = ensure(service)
    await checkpoint()
    assert.equal(after.state, C.state.pending, 'joins the held activation')
    port.release()
    assert.equal((await settled(before)).value, C.alphaId)
    assert.equal((await settled(after)).value, C.alphaId)
    assert.equal(port.counts.created, 1, 'no second activation')
  })

  it('READY-BVA-04 [BOOT] a caller just after the commit joins the before-ready caller', async (t) => {
    const h = await bootWithheld(t)
    const service = h.requireInstance()
    const before = ensure(service)
    h.appReady.commit()
    const after = ensure(service)
    const ids = [(await settled(before)).value, (await settled(after)).value]
    assert.equal(ids[0], ids[1])
    assert.equal(h.agents.length, 1)
  })
})

// ---------------------------------------------------------------------------------------------
// Decision table R3 (invalid owner) and R1 for the new generation
// ---------------------------------------------------------------------------------------------

describe('READY decision table', () => {
  it('READY-DT-01 [PORT] failure before dispatch: refused, and the old signal delivered later dispatches nothing', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const call = ensure(service)
    await checkpoint()
    // A failed generation goes through disposal.
    await ext.close()
    assert.equal((await settled(call)).state, C.state.rejected)
    ext.markReady()
    await checkpoint()
    assert.equal(port.counts.activate, 0)
  })

  it('READY-DT-02 [PORT] dispose right after the signal, before dispatch: zero activation, refused', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const call = ensure(service)
    await checkpoint()
    // Same synchronous turn: the signal's continuation has not run when disposal starts.
    ext.markReady()
    const closing = ext.close()
    await closing
    await checkpoint()
    assert.equal((await settled(call)).state, C.state.rejected, 'no stale success')
    assert.equal(port.counts.activate, 0, 'the disposed generation never dispatches')
  })

  it('READY-DT-03 [BOOT] restart does not inherit readiness; one beta activation resumes the durable id', async (t) => {
    const alpha = await bootChild(t)
    const id = (await settled(ensure(alpha.requireInstance()))).value
    await alpha.close()
    const beta = await restart(t, alpha)
    const call = ensure(beta.requireInstance())
    replayStale(alpha)
    await checkpoint()
    assert.equal(call.state, C.state.pending, 'alpha was ready; beta still waits for its own signal')
    assert.equal(beta.agents.length, 0)
    beta.appReady.commit()
    assert.equal((await settled(call)).value, id, 'the same durable manager is resumed')
    assert.equal(beta.agents.length, 1, 'one activation')
    assertNoTurn(beta)
  })

  it('READY-DT-03 [PORT] alpha ready does not open beta over the same home', async (t) => {
    const alpha = await portDriver(t, { held: false })
    alpha.ext.markReady()
    assert.equal((await settled(ensure(alpha.service))).value, C.alphaId)
    await alpha.ext.close()
    const beta = await generation(alpha.home, { id: C.betaId, held: false })
    t.after(() => beta.ext.close())
    const call = ensure(beta.service)
    await checkpoint()
    assert.equal(call.state, C.state.pending)
    beta.ext.markReady()
    assert.equal((await settled(call)).value, C.betaId)
  })
})

// ---------------------------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------------------------

describe('READY state transitions', () => {
  it('READY-ST-01 [PORT] alpha stale signal and cleanup after beta success leave beta intact', async (t) => {
    const alpha = await portDriver(t)
    const alphaCall = ensure(alpha.service)
    await alpha.ext.close()
    await settled(alphaCall)
    const beta = await generation(alpha.home, { id: C.betaId, held: false })
    t.after(() => beta.ext.close())
    beta.ext.markReady()
    assert.equal((await settled(ensure(beta.service))).value, C.betaId)
    alpha.ext.markReady()
    await alpha.ext.close()
    await checkpoint()
    assert.equal(beta.service.manager.sessionId(), C.betaId)
    assert.equal((await settled(ensure(beta.service))).value, C.betaId, 'beta not cancelled')
    assert.equal(beta.port.counts.created, 1)
    assert.equal(alpha.port.counts.activate, 0)
  })

  it('READY-ST-01 [BOOT] alpha stale callbacks and cleanup after beta success leave beta intact', async (t) => {
    const alpha = await bootWithheld(t)
    const alphaCall = ensure(alpha.requireInstance())
    await alpha.close()
    await settled(alphaCall)
    const beta = await restart(t, alpha)
    beta.appReady.commit()
    const id = (await settled(ensure(beta.requireInstance()))).value
    replayStale(alpha)
    await alpha.close()
    await checkpoint()
    assert.equal(beta.requireInstance().manager.sessionId(), id)
    assert.equal((await settled(ensure(beta.requireInstance()))).value, id)
    assert.equal(beta.agents.length, 1, 'no duplicate')
    assert.equal(alpha.agents.length, 0)
  })

  it('READY-ST-02 [PORT] repeated readiness before and after completion: no duplicate activation or settlement', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const call = ensure(service)
    ext.markReady()
    ext.markReady()
    await checkpoint()
    const dispatched = port.counts.activate
    port.release()
    assert.equal((await settled(call)).value, C.alphaId)
    ext.markReady()
    await checkpoint()
    assert.equal(port.counts.activate, dispatched, 'a repeated signal with no waiter dispatches nothing')
    assert.equal(port.counts.created, 1)
  })

  it('READY-ST-02 [BOOT] replayed current ready listeners before and after activation: one manager, no turn', async (t) => {
    const h = await bootWithheld(t)
    const call = ensure(h.requireInstance())
    h.appReady.commit()
    for (const listener of h.appReady.captured) listener()
    const id = (await settled(call)).value
    for (const listener of h.appReady.captured) listener()
    await checkpoint()
    assert.equal(h.agents.length, 1)
    assert.equal(h.requireInstance().manager.sessionId(), id)
    assertNoTurn(h)
  })

  it('READY-ST-03 [PORT] dispose during a held activation refuses the in-flight call (completion still held)', async (t) => {
    const { ext, port, service } = await portDriver(t)
    ext.markReady()
    const call = ensure(service)
    await checkpoint()
    assert.ok(port.counts.activate >= 1, 'activation in flight')
    await ext.close()
    await checkpoint()
    // Requirement: disposal rejects in-flight calls; an orphan wait on a completion that a
    // disposed chat may never deliver is not "released".
    assert.equal(call.state, C.state.rejected, 'disposal refuses the in-flight call without waiting for completion')
    port.release()
  })

  it('READY-ST-03 [PORT] a late activation completion after dispose never turns into success', async (t) => {
    const { ext, port, service } = await portDriver(t)
    ext.markReady()
    const call = ensure(service)
    await checkpoint()
    await ext.close()
    port.release()
    assert.equal((await settled(call)).state, C.state.rejected, 'no stale success for the disposed generation')
  })

  it('READY-ST-03 [BOOT] dispose during a held agents.create refuses the in-flight call (completion still held)', async (t) => {
    const { h, call, hold } = await heldBootActivation(t)
    t.after(() => hold.resolve())
    // close() resolving is the event that disposal has finished; the completion is still held.
    await h.close()
    await checkpoint()
    assert.equal(call.state, C.state.rejected, 'disposal refuses the in-flight call without waiting for completion')
  })

  it('READY-ST-03 [BOOT] a late agents.create completion after dispose reports no session', async (t) => {
    const { h, service, call, hold } = await heldBootActivation(t)
    // Release only after disposal finished, so the completion is unambiguously late.
    await h.close()
    hold.resolve()
    assert.equal((await settled(call)).state, C.state.rejected, 'the late completion is not reported as success')
    assert.equal(service.manager.sessionId(), undefined, 'no session reported for the disposed generation')
    assert.equal(h.agents.length, 0, 'no session created for the disposed generation')
  })

  it('READY-ST-04 [PORT] activation failure in flight refuses the call with no automatic retry', async (t) => {
    const { ext, port, service } = await portDriver(t)
    ext.markReady()
    const call = ensure(service)
    await checkpoint()
    const dispatched = port.counts.activate
    port.fail()
    assert.equal((await settled(call)).state, C.state.rejected, 'no false success')
    await checkpoint()
    assert.equal(port.counts.activate, dispatched, 'no automatic retry')
    assert.equal(port.counts.created, 0)
  })

  it('READY-ST-04 [PORT] generation failure during a held activation refuses the waiter (completion still held)', async (t) => {
    const { ext, port, service } = await portDriver(t)
    const call = ensure(service)
    ext.markReady()
    await checkpoint()
    // A failed generation goes through disposal; the activation completion is still held.
    await ext.close()
    await checkpoint()
    assert.equal(call.state, C.state.rejected, 'failure refuses the waiter without waiting for completion')
    port.release()
  })

  it('READY-ST-05 [BOOT+ROUTE] failed alpha answers 503; Retry on beta waits for beta readiness, then 200', async (t) => {
    const alpha = await bootWithheld(t)
    const alphaInstance = alpha.requireInstance()
    const alphaAnswer = track((await sessionRoute(() => alphaInstance))())
    await alpha.close()
    const failed = (await settled(alphaAnswer)).value
    assert.equal(failed.status, C.route.unavailable)
    assert.deepEqual(failed.body, C.route.unavailableBody)
    const beta = await restart(t, alpha)
    const retry = track((await sessionRoute(() => beta.requireInstance()))())
    replayStale(alpha)
    await checkpoint()
    assert.equal(retry.state, C.state.pending, 'Retry is not fake-ready')
    beta.appReady.commit()
    const answer = (await settled(retry)).value
    assert.equal(answer.status, C.route.ok)
    assert.equal(answer.body.sessionId, beta.manager().id)
    assert.equal(beta.agents.length, 1)
  })

  it('READY-ST-06 [PORT] alpha activation completing after beta success cannot fulfil or overwrite beta', async (t) => {
    const alpha = await portDriver(t)
    alpha.ext.markReady()
    const alphaCall = ensure(alpha.service)
    await checkpoint()
    assert.ok(alpha.port.counts.activate >= 1, 'alpha activation held in flight')
    await alpha.ext.close()
    const beta = await generation(alpha.home, { id: C.betaId, held: false })
    t.after(() => beta.ext.close())
    beta.ext.markReady()
    assert.equal((await settled(ensure(beta.service))).value, C.betaId)
    alpha.port.release()
    await checkpoint()
    assert.equal((await settled(alphaCall)).state, C.state.rejected, 'alpha never publishes stale success')
    assert.equal(beta.service.manager.sessionId(), C.betaId)
    assert.equal((await settled(ensure(beta.service))).value, C.betaId)
    assert.equal(beta.port.counts.created, 1)
  })
})
