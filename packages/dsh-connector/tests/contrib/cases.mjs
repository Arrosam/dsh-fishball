/**
 * C-EXT black-box cases (v3-tasks.md row C-EXT, wave W2; docs/test-design/v3/07-contributors.md):
 * EXT-UC-01, EXT-UC-02, EXT-UC-03, EXT-EP-01…04, EXT-BVA-01…04, EXT-DT-01, EXT-DT-02, EXT-ST-01,
 * plus the C-EXT rows of EXT-DT-03 and the K2 suite's C-EXT `todo` rows (packages/dsh-connector/tests/contract/k2-tools/cases.mjs),
 * which run here. Requirements R-EXT-01…20, R-SEC-04; design §13; K2 `dsh-agent-connector/tools`.
 *
 * Techniques, and only these, in this order: Use Case (each test names its flow), then Equivalence
 * Partitioning (one test per row), Boundary Value Analysis (one test per value), Decision Table
 * (one test per rule) and State Transition (one test per transition row). Every value is read from
 * K2 (and K1 for the fakes' words); fixture data is in constants.mjs.
 *
 * Level: unit and integration as the cases state, over the installed SDK's real cordis and loader
 * with real contributor packages as loader rows (world.mjs) and fakes of the K1 interfaces. The
 * tests fail until C-EXT's module exists (subject.mjs names the assumed seam). Rows that need a later
 * task are `todo` and name it.
 *
 * Common refusal oracle (README): a refusal returns its code, changes nothing and leaks nothing.
 *
 * C-EXT's decisions relayed by Fishball (2026-11-14), cited as "decision 2026-11-14":
 * - success merges `data` into the result, `{...data, ok: true}`; `data` that is not a plain
 *   object, or that carries its own `ok`, is `contributor-failed`; an `outputSchema` declaring
 *   `ok` is `tool-invalid`;
 * - a call aborted by the client returns `operation-failed` and is not counted toward quarantine;
 * - quarantine counts crashes, timeouts, bad shapes, schema mismatches and oversize results; emit
 *   counts only `event-invalid` and `payload-too-large`;
 * - an unknown `sessionId` is `event-invalid`; a failing mailbox port is `queue-full`;
 * - a contributor package with no version gets `_meta.version` "".
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { FIXTURE, K1, K2, LATER, SERVICE_MEMBERS, WAIT } from './constants.mjs'
import { eventually, gate, mcpCore, ok, worldFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({
  uc01: 'EXT-UC-01', uc02: 'EXT-UC-02', uc03: 'EXT-UC-03', uc04: 'EXT-UC-04',
  ep01: 'EXT-EP-01', ep02: 'EXT-EP-02', ep03: 'EXT-EP-03', ep04: 'EXT-EP-04',
  bva01: 'EXT-BVA-01', bva02: 'EXT-BVA-02', bva03: 'EXT-BVA-03', bva04: 'EXT-BVA-04',
  dt01: 'EXT-DT-01', dt02: 'EXT-DT-02', dt03: 'EXT-DT-03', st01: 'EXT-ST-01',
})
const { CALL_CODE, EMIT_REFUSAL, REGISTER_REFUSAL, TOOL_LIMITS, EVENT_LIMITS, QUARANTINE, ABORT_REASON } = K2
const D = FIXTURE.pairs.d
const E2 = FIXTURE.pairs.e2
const ARGS = Object.freeze({ key: FIXTURE.marker })
const LOOKUP = FIXTURE.tool.lookup
/** The 5th failure among the last 10 counted outcomes quarantines (R-EXT-09, K2 QUARANTINE). */
const QUARANTINING_FAILURES = QUARANTINE.moreThanFailures + 1
/** One token refills every this many ms (K2 EVENT_LIMITS: 30 per 60 s). */
const REFILL_MS = EVENT_LIMITS.rateWindowMs / EVENT_LIMITS.ratePerMinute
/** EXT-BVA-03 row 4's "1.9 s": just under one refill. */
const JUST_BEFORE_REFILL_MS = REFILL_MS - REFILL_MS / (EVENT_LIMITS.rateBurst * 2)

/** One test per case row, named as every V3 suite names them; `todo` names the owning task. */
export function row(sdk, id, part, title, fn, todo, options = T) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, options, fn)
}
/** A row C-WIRE-2 withdrew (the user's q5, "Remove agentToken entirely"): listed, skipped with the decision. */
const NO_DESIGNATED = 'withdrawn by C-WIRE-2: the user (q5) "Remove agentToken entirely" — no designated agent; an emit with no session or an unmanaged one is no-agent'
const withdrawnRow = (sdk, id, part, title) => test(caseName(sdk, id, part, title), { skip: NO_DESIGNATED }, () => {})

// ------------------------------------------------------------------------------------------------
// Shared steps and oracles (each states one requirement oracle once).

const pub = (namespace, local) => namespace + K2.NAMESPACE.separator + local
export const nsOf = (c) => K2.namespaceOf(c.pkg)
const toolOf = (c, local = c.tools[0]) => pub(nsOf(c), local)
const json = (value) => JSON.stringify(value)
const throwing = () => { throw new Error(FIXTURE.secretPath) }
/** Strings that must never reach a contributor, a client or a log line (R-SEC-02, R-EXT-10). */
const SECRETS = Object.values(FIXTURE.pairs).flatMap((p) => [p.token, p.label, p.id, p.entryKey])

/** The structured result of a call that reached the tool table (not a protocol error). */
function structured(reply) {
  assert.ok(reply.result, '"unknown tool" where a tool result was expected')
  return reply.result.structuredContent
}
/** R-CON-02 / R-EXT-07: the envelope is the spec's CallToolResult, the text is the same JSON, isError iff !ok. */
async function assertEnvelope(sdk, reply) {
  const core = await mcpCore(sdk)
  core.CallToolResultSchema.parse(reply.result)
  const sc = structured(reply)
  assert.equal(reply.result.content.length, 1, 'one text block')
  assert.equal(reply.result.content[0].type, 'text')
  assert.deepEqual(JSON.parse(reply.result.content[0].text), sc, 'the text block is the structured JSON')
  assert.equal(reply.result.isError, sc.ok !== true, 'isError exactly when ok is false')
  return sc
}
const assertNoLeak = (value, extra = []) => {
  const text = json(value)
  for (const s of [...SECRETS, FIXTURE.secretPath, ...extra]) assert.ok(!text.includes(s), 'leaked ' + s)
}
/** Success: `{...data, ok: true}` (decision 2026-11-14). */
async function assertOkResult(sdk, reply, data) {
  const sc = await assertEnvelope(sdk, reply)
  assert.equal(sc.ok, true, 'refused: ' + json(sc))
  if (data !== undefined) assert.deepEqual(sc, { ...data, ok: true })
  return sc
}
async function assertRefusedResult(sdk, reply, code) {
  const sc = await assertEnvelope(sdk, reply)
  assert.equal(sc.ok, false)
  assert.equal(sc.code, code)
  assertNoLeak(reply)
  return sc
}
/** `contributor-failed` carries nothing else: no stack, message or path (R-EXT-08). */
async function assertContained(sdk, reply) {
  const sc = await assertRefusedResult(sdk, reply, CALL_CODE.contributorFailed)
  assert.deepEqual(Object.keys(sc).sort(), ['code', 'ok'])
}
/** "unknown tool": the registry answers `undefined`; the endpoint turns it into JSON-RPC -32602 (C-HTTP). */
const assertUnknownTool = (reply) => assert.deepEqual(reply, { unknown: true }, 'expected "unknown tool", got ' + json(reply))
/** A register refusal: the code, nothing listed, nothing in `mine()` (the common refusal oracle). */
function assertRegisterRefused(world, c, def, code, svc = c.svc) {
  const before = { names: world.names(), mine: json(svc.mine()) }
  const result = c.register(def, svc)
  assert.equal(result.code, code, 'register returned ' + json(result))
  assert.deepEqual(world.names(), before.names, 'a refused registration changed tools/list')
  assert.equal(json(svc.mine()), before.mine, 'a refused registration changed mine()')
}
const assertRegisterInvalid = (world, c, overrides) => assertRegisterRefused(world, c, c.tool(FIXTURE.tool.second, overrides), REGISTER_REFUSAL.toolInvalid)
/** A refused emit: the returned code and nothing committed. */
async function assertEmitRefused(world, c, event, code, svc = c.svc) {
  const commits = world.mailbox.commits.length
  const result = await c.emit(event, svc)
  assert.deepEqual(result, { ok: false, code })
  assert.equal(world.mailbox.commits.length, commits, 'a refused emit committed an event')
}
export async function assertEmitOk(world, c, event, svc = c.svc) {
  const result = await c.emit(event, svc)
  assert.equal(result.ok, true, 'emit refused: ' + json(result))
  assert.deepEqual(Object.keys(result).sort(), ['eventId', 'ok'])
  return result
}
export const note = (extra = {}) => ({ event: FIXTURE.event.note, payload: { marker: FIXTURE.marker }, ...extra })
/** A string payload whose JSON text is exactly `bytes` UTF-8 bytes. */
const payloadOf = (bytes) => FIXTURE.pad(bytes - FIXTURE.stringOverheadBytes)
const lastCommit = (world) => world.mailbox.commits.at(-1)
/** Plain-object `data` (decision 2026-11-14) whose JSON text is exactly `bytes` UTF-8 bytes, holding `base`. */
function dataOf(bytes, base = {}) {
  const overhead = json({ ...base, [FIXTURE.padKey]: '' }).length
  return { ...base, [FIXTURE.padKey]: FIXTURE.pad(bytes - overhead) }
}

/** `n` failing calls of `c`'s tool; each one is `contributor-failed`. */
async function fail(sdk, world, c, n, local = c.tools[0]) {
  c.behaviour[local] = throwing
  for (let i = 0; i < n; i++) await assertContained(sdk, await world.call(D, toolOf(c, local), ARGS))
  delete c.behaviour[local]
}
export const quarantine = (sdk, world, c) => fail(sdk, world, c, QUARANTINING_FAILURES)
/** The observable state of a quarantined contributor (R-EXT-09, R-EXT-19). */
async function assertQuarantined(world, c, local = c.tools[0]) {
  assert.ok(!world.listed(toolOf(c, local)), 'a quarantined tool is listed')
  assertUnknownTool(await world.call(D, toolOf(c, local), ARGS))
  await assertEmitRefused(world, c, note(), EMIT_REFUSAL.contributorUnavailable)
}
/** Two events of `c` in D's mailbox, the first acked by the client (EXT-UC-03 actor). */
export async function pendingAndAcked(world, c) {
  const acked = await assertEmitOk(world, c, note())
  const pending = await assertEmitOk(world, c, note())
  world.mailbox.ackEvent(D.principalKey, acked.eventId)
  return { acked: acked.eventId, pending: pending.eventId }
}
/** R-EXT-19: the pending event is retired, the acked one stays with its client. */
export async function assertRetired(world, { acked, pending }) {
  await eventually(() => world.mailbox.retirements.some((r) => r.eventId === pending), 'the pending event is retired')
  const retirement = world.mailbox.retirements.find((r) => r.eventId === pending)
  assert.equal(retirement.pk, D.principalKey)
  assert.equal(retirement.reason, K1.RETIREMENT_REASON.contributorWithdrawn)
  // The acked event is checked by outcome, not by whether `retire` was called for it: K1 gives the
  // contributor no ack signal, so C-EXT may call `retire` on it, and that is a no-op. K1
  // (mcp-schema/index.d.ts:202): retire "Replaces a pending event by a `retirement` naming it";
  // R-EXT-19: "Events a client has already acked stay with that client."
  assert.deepEqual(world.mailbox.retirementsOf(acked), [], 'a retirement names the acked event')
  assert.ok(world.mailbox.isAcked(D.principalKey, acked), 'the acked event left its client')
  assert.ok(!world.mailbox.pending(D.principalKey).some((e) => e.eventId === pending), 'the retired event is still pending')
}
/** A service member name, over the prototype chain, that is not a cordis `Service` base member. */
function serviceMembers(world, svc) {
  const keys = (o) => {
    const out = new Set()
    for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Reflect.ownKeys(p)) if (typeof k === 'string') out.add(k)
    return out
  }
  // A bare cordis Service on a throwaway context: its members are the base class's, not the contract's.
  const base = keys(new world.Service(new world.Context(), FIXTURE.marker))
  return [...keys(svc)].filter((k) => !base.has(k)).sort()
}
/** R-EXT-11: the service offers exactly the three contributor operations and its version. */
function assertOnlyContributorMembers(world, svc) {
  assert.deepEqual(serviceMembers(world, svc), [...SERVICE_MEMBERS].sort())
  assert.equal(svc.apiVersion, K2.apiVersion)
}
/** A call that holds until released; returns its pending reply and the contributor's `call`. */
async function heldCall(world, c, pair = D, local = c.tools[0], signal) {
  const g = gate()
  c.behaviour[local] = g.behaviour
  const reply = world.call(pair, toolOf(c, local), ARGS, signal)
  const call = await g.reached
  return { reply, call, release: g.release }
}
/** A call that returns `result` after `ms` of real time. */
const after = (ms, result) => (_args, call) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(result), ms)
  call.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(result) }, { once: true })
})
/** The arguments `{key}` whose JSON text is exactly `bytes` UTF-8 bytes. */
const argsOf = (bytes) => ({ key: FIXTURE.pad(bytes - FIXTURE.argumentOverheadBytes) })
/** register from a context with no loader entry: code evaluated outside any profile row (S5 A6). */
async function unidentifiedRegister(world, def) {
  const service = K2.TOOLS_API.service
  let outcome
  await world.ctx.plugin({
    inject: [service],
    apply(ctx) {
      try { outcome = { dispose: ctx[service].register(def) } } catch (error) { outcome = { code: error.code, name: error.name } }
    },
  })
  assert.ok(outcome, 'harness: the service was not reachable from the root context')
  return outcome
}

export function registerCExtCases(sdk) {
  registerUseCases(sdk)
  registerPartitions(sdk)
  registerBoundaries(sdk)
  registerDecisionTables(sdk)
  registerStateTransitions(sdk)
}

// ------------------------------------------------------------------------------------------------
// Use Cases

function registerUseCases(sdk) {
  // ---- EXT-UC-01: a plugin contributes a tool and a principal calls it ----
  row(sdk, ID.uc01, 'main 1', 'board-helper registers lookup at runtime, with no connector restart', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    assert.equal(typeof c.registrations.get(LOOKUP).dispose, 'function', 'register refused: ' + json(c.registrations.get(LOOKUP)))
    assert.equal(world.connectorActivations, 1, 'the connector restarted')
    assert.deepEqual(c.svc.mine(), [{ name: LOOKUP, publicName: toolOf(c), state: K2.REGISTRATION_STATE.active }])
  })
  row(sdk, ID.uc01, 'main 2', 'the registration sends list_changed', async (t) => {
    const world = await worldFor(t, sdk)
    const before = world.listChanges
    await world.add(FIXTURE.pkg.board)
    assert.ok(await world.listChangedSince(before), 'no list_changed after register')
  })
  row(sdk, ID.uc01, 'main 3', 'tools/list shows board-helper.lookup with the _meta contributor field and only the declared hints', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { definition: () => ({ annotations: FIXTURE.hint }) })
    const tool = world.list().find((x) => x.name === toolOf(c))
    assert.ok(tool, 'not listed: ' + json(world.names()))
    ;(await mcpCore(sdk)).ToolSchema.parse(tool)
    assert.deepEqual(tool._meta?.[K2.CONTRIBUTOR_META_KEY], { plugin: FIXTURE.pkg.board, version: FIXTURE.version })
    assert.deepEqual(tool.annotations, FIXTURE.hint)
    assert.equal(tool.description, FIXTURE.description)
    assert.deepEqual(tool.inputSchema, FIXTURE.inputSchema)
  })
  row(sdk, ID.uc01, 'main 3 (order)', 'contributed tools are sorted by public name', async (t) => {
    const world = await worldFor(t, sdk)
    await world.add(FIXTURE.pkg.board, { tools: [LOOKUP, FIXTURE.tool.go] })
    await world.add(FIXTURE.pkg.acme, { tools: [LOOKUP, FIXTURE.tool.go] })
    assert.equal(world.names().length, 4)
    assert.deepEqual(world.names(), [...world.names()].sort())
  })
  row(sdk, ID.uc01, 'main 3 (core first)', 'core tools come before every contributed tool in tools/list', null, LATER.tools)
  row(sdk, ID.uc01, 'main 4', 'a call with valid arguments runs execute once, after the checks', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    await assertOkResult(sdk, await world.call(D, toolOf(c), ARGS))
    assert.equal(c.calls.length, 1)
    assert.deepEqual(c.calls[0].args, ARGS)
  })
  row(sdk, ID.uc01, 'main 5', 'execute gets principal {key, name} (current name), a signal and protocolVersion 2026-07-28', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    await world.call(D, toolOf(c), ARGS)
    const { call } = c.calls[0]
    assert.deepEqual(Object.keys(call).sort(), ['principal', 'protocolVersion', 'signal'])
    assert.deepEqual({ ...call.principal }, { key: D.principalKey, name: D.name })
    assert.ok(call.signal instanceof AbortSignal)
    assert.equal(call.protocolVersion, K2.TOOLS_API.protocolVersion)
    world.principalNames.set(D.principalKey, E2.name)
    await world.call(D, toolOf(c), ARGS)
    assert.equal(c.calls[1].call.principal.name, E2.name, 'the principal\'s current name')
  })
  row(sdk, ID.uc01, 'main 6', '{ok: true, data} → structuredContent {ok: true, …}, the same JSON as text, isError false', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    const data = { found: FIXTURE.marker }
    c.behaviour[LOOKUP] = () => ok(data)
    await assertOkResult(sdk, await world.call(D, toolOf(c), ARGS), data)
  })
  row(sdk, ID.uc01, 'main 7', 'one log line names the namespace on registration; no arguments or results are logged', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    assert.equal(world.logsWith(FIXTURE.pkg.board).length, 1, 'registration log lines: ' + json(world.logs))
    c.behaviour[LOOKUP] = () => ok({ secret: FIXTURE.marker })
    await world.call(D, toolOf(c), ARGS)
    assert.deepEqual(world.logsWith(FIXTURE.marker), [], 'arguments or results were logged')
  })
  row(sdk, ID.uc01, 'A1', 'dispose → unlisted before the next request; a call gets "unknown tool"; list_changed', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    const before = world.listChanges
    c.registrations.get(LOOKUP).dispose()
    assert.ok(!world.listed(toolOf(c)), 'still listed right after dispose')
    assertUnknownTool(await world.call(D, toolOf(c), ARGS))
    assert.ok(await world.listChangedSince(before), 'no list_changed after dispose')
  })
  for (const [flow, how, act] of [
    ['A2 (disabled)', 'the plugin is disabled', (w, c) => w.disable(c)],
    ['A2 (uninstalled)', 'the plugin is uninstalled', (w, c) => w.uninstall(c)],
  ]) {
    row(sdk, ID.uc01, flow, `${how} → as A1, without calling the disposer`, async (t) => {
      const world = await worldFor(t, sdk)
      const c = await world.add(FIXTURE.pkg.board)
      const before = world.listChanges
      await act(world, c)
      assert.ok(!world.listed(toolOf(c)))
      assertUnknownTool(await world.call(D, toolOf(c), ARGS))
      assert.ok(await world.listChangedSince(before), 'no list_changed')
    })
  }
  row(sdk, ID.uc01, 'A2 (reloaded)', 'the plugin is reloaded → its old registration is withdrawn (in-flight call tool-withdrawn) and the new one listed', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    const held = await heldCall(world, c)
    const before = world.listChanges
    await world.restart(c)
    await assertRefusedResult(sdk, await held.reply, CALL_CODE.toolWithdrawn)
    assert.ok(await world.listChangedSince(before), 'no list_changed')
    assert.ok(world.listed(toolOf(c)), 'the new activation\'s tool is not listed')
  })
  row(sdk, ID.uc01, 'A2 (hot-reloaded)', 'a dsh-hmr hot reload → as A1, then listed again', null, LATER.matrix)
  row(sdk, ID.uc01, 'A3', 'P cancels the call → call.signal fires (reason cancelled)', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    const cancel = new AbortController()
    const held = await heldCall(world, c, D, LOOKUP, cancel.signal)
    cancel.abort(ABORT_REASON.cancelled)
    await eventually(() => held.call.signal.aborted, 'the contributor\'s signal fires')
    assert.equal(held.call.signal.reason, ABORT_REASON.cancelled)
    await assertRefusedResult(sdk, await held.reply, CALL_CODE.operationFailed)
  })
  row(sdk, ID.uc01, 'A3 (not counted)', 'cancelled calls do not count toward quarantine (decision 2026-11-14)', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    await fail(sdk, world, c, QUARANTINE.moreThanFailures)
    for (let i = 0; i < QUARANTINE.windowOutcomes; i++) {
      const cancel = new AbortController()
      const held = await heldCall(world, c, D, LOOKUP, cancel.signal)
      cancel.abort(ABORT_REASON.cancelled)
      await assertRefusedResult(sdk, await held.reply, CALL_CODE.operationFailed)
    }
    await fail(sdk, world, c, 1)
    await assertQuarantined(world, c)
  })
  row(sdk, ID.uc01, 'A3 (disconnect)', 'P disconnects → call.signal fires (reason disconnected)', null, LATER.http)
  row(sdk, ID.uc01, 'E1', 'invalid arguments → invalid-arguments; execute never runs', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    for (const args of [{}, { key: 1 }]) await assertRefusedResult(sdk, await world.call(D, toolOf(c), args), CALL_CODE.invalidArguments)
    assert.equal(c.calls.length, 0, 'execute ran')
  })
  row(sdk, ID.uc01, 'E2 (401)', 'an unauthenticated request → 401 before any MCP processing', null, LATER.http)
  row(sdk, ID.uc01, 'E2 (pair-only)', 'a pair-only access token does not see the tool', null, LATER.tools)
  row(sdk, ID.uc01, 'E3', 'register with no loader entry → contributor-unidentified; nothing registered', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { tools: [] })
    const outcome = await unidentifiedRegister(world, c.tool(LOOKUP))
    assert.deepEqual(outcome, { code: REGISTER_REFUSAL.contributorUnidentified, name: K2.ToolContributionError.name })
    assert.deepEqual(world.names(), [])
  })
  row(sdk, ID.uc01, 'E4', 'the owner is being disposed, disposer not yet run → not listed, "unknown tool"', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    const disabling = world.beginDisable(c)
    const listedNow = world.listed(toolOf(c))
    const callNow = world.call(D, toolOf(c), ARGS)
    await disabling
    assert.ok(!listedNow, 'listed while its owner is disposing')
    assertUnknownTool(await callNow)
    assert.equal(c.calls.length, 0)
  })
  row(sdk, ID.uc01, 'post', 'board-helper gained no Fishball authority (service and call carry nothing more)', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    await world.call(D, toolOf(c), ARGS)
    assertOnlyContributorMembers(world, c.svc)
    assertNoLeak({ principal: c.calls[0].call.principal, mine: c.svc.mine() }, [D.token])
  })

  // ---- EXT-UC-02: a contributor emits an event ----
  row(sdk, ID.uc02, 'main 1–2', 'emit with S1 → {ok, eventId}; one contributed:ci-watch.build.failed event to P(E2) only', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.ci, { tools: [] })
    const data = { build: FIXTURE.marker }
    const result = await assertEmitOk(world, c, { event: FIXTURE.event.build, payload: data, summary: FIXTURE.summary, sessionId: FIXTURE.session.managed })
    assert.equal(world.mailbox.commits.length, 1, 'one emit, one event')
    const { recipient, event } = lastCommit(world)
    assert.equal(recipient, E2.principalKey)
    assert.equal(event.eventId, result.eventId)
    const publicEvent = pub(nsOf(c), FIXTURE.event.build)
    assert.equal(event.type, K2.CONTRIBUTED_EVENT.typePrefix + publicEvent)
    assert.equal(event.sourceSessionId, FIXTURE.session.managed)
    assert.deepEqual(event.payload, { namespace: nsOf(c), event: publicEvent, data, summary: FIXTURE.summary })
    assert.ok(K1.isEventType(event.type))
    assert.deepEqual(world.mailbox.pending(D.principalKey), [], 'D got the event too')
  })
  // A1 / A2 re-baselined by C-WIRE-2 (the user's q5, "Remove agentToken entirely"): no designated D, so
  // an emit with no session or an unmanaged session has no recipient → no-agent, nothing queued.
  row(sdk, ID.uc02, 'A1', 'no sessionId → no-agent (no designated agent since C-WIRE-2, q5); nothing queued', async (t) => {
    const world = await worldFor(t, sdk, { designated: null })
    const c = await world.add(FIXTURE.pkg.ci, { tools: [] })
    await assertEmitRefused(world, c, note(), EMIT_REFUSAL.noAgent)
  })
  row(sdk, ID.uc02, 'A2', 'sessionId of an unmanaged session → no-agent (C-WIRE-2, q5); nothing queued', async (t) => {
    const world = await worldFor(t, sdk, { designated: null })
    const c = await world.add(FIXTURE.pkg.ci, { tools: [] })
    await assertEmitRefused(world, c, note({ sessionId: FIXTURE.session.unmanaged }), EMIT_REFUSAL.noAgent)
  })
  row(sdk, ID.uc02, 'A3', 'in HF\'s Fishball DSH the event reaches the Fishball agent through X9', null, LATER.facade)
  row(sdk, ID.uc02, 'E1', 'no recipient (no D, no manager) → no-agent, nothing queued', async (t) => {
    const world = await worldFor(t, sdk, { designated: null })
    const c = await world.add(FIXTURE.pkg.ci, { tools: [] })
    await assertEmitRefused(world, c, note(), EMIT_REFUSAL.noAgent)
  })

  // ---- EXT-UC-03: a failing contributor is contained, then quarantined, then restored ----
  row(sdk, ID.uc03, 'main 1', 'execute throws → contributor-failed only; other tools and clients unaffected; one log line per kind', async (t) => {
    const world = await worldFor(t, sdk)
    const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go] })
    const other = await world.add(FIXTURE.pkg.other)
    const held = await heldCall(world, other, E2)
    await fail(sdk, world, flaky, 1)
    const lines = world.logsWith(nsOf(flaky)).length
    await fail(sdk, world, flaky, 1)
    assert.equal(world.logsWith(nsOf(flaky)).length, lines, 'a second failure of the same kind was logged again')
    assert.deepEqual(world.logsWith(FIXTURE.secretPath), [], 'the thrown message reached the log')
    held.release(ok())
    await assertOkResult(sdk, await held.reply)
    await assertOkResult(sdk, await world.call(D, toolOf(other), ARGS))
    assert.ok(world.listed(toolOf(flaky)), 'two failures are below the quarantine')
  })
  row(sdk, ID.uc03, 'main 2', `the ${QUARANTINING_FAILURES}th failure (more than ${QUARANTINE.moreThanFailures} of ${QUARANTINE.windowOutcomes}) quarantines: unlisted, list_changed, "unknown tool", emit unavailable, pending retired`, async (t) => {
    const world = await worldFor(t, sdk)
    const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go] })
    const events = await pendingAndAcked(world, flaky)
    await fail(sdk, world, flaky, QUARANTINE.moreThanFailures)
    assert.ok(world.listed(toolOf(flaky)), `${QUARANTINE.moreThanFailures} failures quarantined`)
    const before = world.listChanges
    await fail(sdk, world, flaky, 1)
    assert.ok(await world.listChangedSince(before), 'no list_changed on quarantine')
    await assertQuarantined(world, flaky)
    await assertRetired(world, events)
  })
  row(sdk, ID.uc03, 'main 2 (window)', `a failure that left the last ${QUARANTINE.windowOutcomes} outcomes no longer counts`, async (t) => {
    const world = await worldFor(t, sdk)
    const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go] })
    await fail(sdk, world, flaky, QUARANTINE.moreThanFailures)
    for (let i = 0; i < QUARANTINE.windowOutcomes - QUARANTINE.moreThanFailures; i++) await assertOkResult(sdk, await world.call(D, toolOf(flaky), ARGS))
    await fail(sdk, world, flaky, 1)
    assert.ok(world.listed(toolOf(flaky)), `the oldest failure left the window, so ${QUARANTINE.moreThanFailures} remain`)
  })
  for (const [flow, how, act] of [
    ['main 3 (disable + enable)', 'the user disables and re-enables flaky', async (w, c) => { await w.disable(c); await w.enable(c) }],
    ['main 3 (reload)', 'the user reloads flaky', (w, c) => w.restart(c)],
  ]) {
    row(sdk, ID.uc03, flow, `${how} → its new registrations are accepted and listed again`, async (t) => {
      const world = await worldFor(t, sdk)
      const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go] })
      await quarantine(sdk, world, flaky)
      await act(world, flaky)
      assert.equal(typeof flaky.registrations.get(FIXTURE.tool.go).dispose, 'function')
      assert.ok(world.listed(toolOf(flaky)))
      await assertOkResult(sdk, await world.call(D, toolOf(flaky), ARGS))
      await assertEmitOk(world, flaky, note())
    })
  }
  row(sdk, ID.uc03, 'A1', 'emits that keep failing validation count toward the same quarantine', async (t) => {
    const world = await worldFor(t, sdk)
    const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go] })
    for (let i = 0; i < QUARANTINING_FAILURES; i++) await assertEmitRefused(world, flaky, note({ event: FIXTURE.badEventNames[1] }), EMIT_REFUSAL.eventInvalid)
    await assertQuarantined(world, flaky)
  })
  row(sdk, ID.uc03, 'main 2 (kinds)', 'crash, timeout, bad shape, schema mismatch and oversize result each count toward quarantine (decision 2026-11-14)', async (t) => {
    const world = await worldFor(t, sdk)
    const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go], definition: () => ({ outputSchema: FIXTURE.outputSchema, limits: FIXTURE.declared }) })
    const go = toolOf(flaky)
    const kinds = [throwing, () => new Promise(() => {}), () => FIXTURE.marker, () => ok({ count: FIXTURE.marker }), () => ok(dataOf(FIXTURE.declared.resultBytes + 1, { count: 1 }))]
    assert.equal(kinds.length, QUARANTINING_FAILURES)
    for (const kind of kinds) {
      flaky.behaviour[FIXTURE.tool.go] = kind
      await assertContained(sdk, await world.call(D, go, ARGS))
    }
    await assertQuarantined(world, flaky)
  })
  row(sdk, ID.uc03, 'A1 (other refusals)', 'emit refusals other than event-invalid / payload-too-large do not count (decision 2026-11-14)', async (t) => {
    const world = await worldFor(t, sdk, { designated: null })
    const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go] })
    for (let i = 0; i < QUARANTINE.windowOutcomes; i++) await assertEmitRefused(world, flaky, note(), EMIT_REFUSAL.noAgent)
    await fail(sdk, world, flaky, QUARANTINE.moreThanFailures)
    assert.ok(world.listed(toolOf(flaky)), 'no-agent refusals were counted')
  })
  row(sdk, ID.uc03, 'A1 (mixed)', 'failed calls and failed emits count toward one quarantine', async (t) => {
    const world = await worldFor(t, sdk)
    const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go] })
    await fail(sdk, world, flaky, QUARANTINE.moreThanFailures)
    await assertEmitRefused(world, flaky, note({ payload: payloadOf(EVENT_LIMITS.payloadBytes + 1) }), EMIT_REFUSAL.payloadTooLarge)
    await assertQuarantined(world, flaky)
  })
  row(sdk, ID.uc03, 'E1', 'a connector setting change does not lift the quarantine', async (t) => {
    const world = await worldFor(t, sdk)
    const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go] })
    await quarantine(sdk, world, flaky)
    await world.reconfigureConnector({ [FIXTURE.connectorSetting]: FIXTURE.marker })
    await assertQuarantined(world, flaky)
  })
  row(sdk, ID.uc03, 'E1 (form)', 'the connector settings form has no per-contributor rows and no quarantine control', null, LATER.wire)
  row(sdk, ID.uc03, 'post', 'the connector and every other client kept working throughout', async (t) => {
    const world = await worldFor(t, sdk)
    const flaky = await world.add(FIXTURE.pkg.flaky, { tools: [FIXTURE.tool.go] })
    const other = await world.add(FIXTURE.pkg.other)
    await quarantine(sdk, world, flaky)
    for (const pair of [D, E2]) await assertOkResult(sdk, await world.call(pair, toolOf(other), ARGS))
    await assertEmitOk(world, other, note())
  })

  // ---- EXT-UC-04: embed-UI contributes the attention tools (U-ATTN, FEAT-PEERS) ----
  row(sdk, ID.uc04, 'main 1', 'tools/list shows embed-ui.attention.signal and .state', null, LATER.attention)
  row(sdk, ID.uc04, 'main 2', 'a plugin\'s signal({important: true}) → {ok: true, accepted: true}; latch count 1, important', null, LATER.attention)
  row(sdk, ID.uc04, 'main 3', 'opening the Fishball page clears the latch once', null, LATER.attention)
}

// ------------------------------------------------------------------------------------------------
// Equivalence Partitioning

function registerPartitions(sdk) {
  // ---- EXT-EP-01: registration validity, through register (defineTool rows are K2's) ----
  const invalid = (part, title, overrides) => row(sdk, ID.ep01, part, title + ' → tool-invalid', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { tools: [] })
    for (const o of overrides) assertRegisterInvalid(world, c, o)
  })
  const outside = FIXTURE.keywordCandidates.filter(([k]) => !K2.SCHEMA_SUBSET.keywords.includes(k))
  row(sdk, ID.ep01, 1, 'valid name, object schema, execute → registered', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    assert.ok(world.listed(toolOf(c)))
  })
  invalid(2, 'name with an upper-case letter / space / `/`', FIXTURE.badNames.characters.map((name) => ({ name })))
  invalid(3, 'name with a leading or trailing `.`', FIXTURE.badNames.dotEdges.map((name) => ({ name })))
  invalid(4, 'input schema root type "array"', [{ inputSchema: FIXTURE.arraySchema }])
  invalid(5, 'input schema not an object (string, null)', FIXTURE.nonObjectSchemas.map((inputSchema) => ({ inputSchema })))
  invalid(6, `an unsupported keyword (${outside.map(([k]) => k).join(', ')}; a remote $ref)`, [
    { inputSchema: { ...FIXTURE.inputSchema, properties: { key: { $ref: FIXTURE.remoteRef } } } },
    ...outside.map(([k, v]) => ({ inputSchema: { ...FIXTURE.inputSchema, [k]: v } })),
  ])
  invalid(7, 'missing execute / not a function', [{ execute: undefined }, { execute: FIXTURE.marker }])
  invalid(8, `empty description / over ${TOOL_LIMITS.descriptionBytes} UTF-8 bytes`, [{ description: '' }, { description: FIXTURE.pad(TOOL_LIMITS.descriptionBytes + 1) }])
  invalid(9, 'limits.timeoutMs over the ceiling', [{ limits: { timeoutMs: TOOL_LIMITS.ceiling.timeoutMs + 1 } }])
  invalid(10, 'a codes entry breaking the grammar', FIXTURE.badCodes.map((code) => ({ codes: [FIXTURE.declaredCode, code] })))
  row(sdk, ID.ep01, 11, 'same public name twice → tool-exists; the first stays', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    assertRegisterRefused(world, c, c.tool(LOOKUP, { execute: throwing }), REGISTER_REFUSAL.toolExists)
    await assertOkResult(sdk, await world.call(D, toolOf(c), ARGS))
    assert.equal(c.calls.length, 1, 'the first registration\'s execute ran')
  })
  row(sdk, ID.ep01, 11, 'a second row of the same package: its duplicate → tool-exists; the first stays', async (t) => {
    const world = await worldFor(t, sdk)
    const first = await world.add(FIXTURE.pkg.board)
    const second = await world.add(FIXTURE.pkg.board)
    assert.equal(second.registrations.get(LOOKUP).code, REGISTER_REFUSAL.toolExists)
    assert.deepEqual(world.names(), [toolOf(first)])
  })
  row(sdk, ID.ep01, 12, `a derived namespace ${K2.NAMESPACE.reserved.join(' / ')} → namespace-reserved`, async (t) => {
    const world = await worldFor(t, sdk)
    for (const pkg of K2.NAMESPACE.reserved) {
      const c = await world.add(pkg)
      assert.equal(c.registrations.get(LOOKUP).code, REGISTER_REFUSAL.namespaceReserved, pkg)
    }
    assert.deepEqual(world.names(), [])
  })
  row(sdk, ID.ep01, 13, 'the connector unloading → registry-closed', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { tools: [] })
    const svc = c.svc
    const unloading = world.disableConnector()
    const result = c.register(c.tool(LOOKUP), svc)
    await unloading
    assert.equal(result.code, REGISTER_REFUSAL.registryClosed)
  })
  row(sdk, ID.ep01, 14, 'any refusal: nothing registered, nothing in tools/list, one log line naming the namespace', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    for (const [def, code] of [[c.tool(FIXTURE.tool.second, { name: FIXTURE.badNames.characters[0] }), REGISTER_REFUSAL.toolInvalid], [c.tool(LOOKUP), REGISTER_REFUSAL.toolExists]]) {
      const lines = world.logsWith(nsOf(c)).length
      assertRegisterRefused(world, c, def, code)
      assert.equal(world.logsWith(nsOf(c)).length, lines + 1, 'log lines for one refusal (' + code + ')')
    }
  })
  row(sdk, ID.ep01, '14a', 'a non-hint annotation key never reaches a client; the declared hints are kept (or the definition is refused)', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { tools: [] })
    const result = c.register(c.tool(LOOKUP, { annotations: { ...FIXTURE.hint, [FIXTURE.nonHint]: FIXTURE.marker } }))
    if (result.code !== undefined) return assert.equal(result.code, REGISTER_REFUSAL.toolInvalid)
    // Added with `tools: []`, so `c.tools[0]` (toolOf's default) is undefined: name the tool registered above.
    const tool = world.list().find((x) => x.name === toolOf(c, LOOKUP))
    assert.deepEqual(tool.annotations, FIXTURE.hint)
    assert.ok(!json(tool).includes(FIXTURE.marker), 'the non-hint value reached tools/list')
  })
  row(sdk, ID.ep01, 15, 'the same name after dispose → registered again', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    c.registrations.get(LOOKUP).dispose()
    assert.equal(typeof c.register(c.tool(LOOKUP)).dispose, 'function')
    assert.ok(world.listed(toolOf(c)))
  })
  row(sdk, ID.ep01, 16, 'the disposer called twice → no-op (a later registration of the name stays)', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    const dispose = c.registrations.get(LOOKUP).dispose
    dispose()
    c.register(c.tool(LOOKUP))
    dispose()
    assert.ok(world.listed(toolOf(c)), 'the stale disposer removed the new registration')
  })

  // ---- EXT-EP-02: namespace derivation ----
  for (const [part, pkg, ns] of [[1, FIXTURE.pkg.board, FIXTURE.pkg.board], [2, FIXTURE.pkg.acme, FIXTURE.ns.acme], [3, FIXTURE.pkg.embed, FIXTURE.ns.embed]]) {
    row(sdk, ID.ep02, part, `package ${pkg} → namespace ${ns}, public name ${pub(ns, LOOKUP)}`, async (t) => {
      const world = await worldFor(t, sdk)
      await world.add(pkg)
      assert.deepEqual(world.names(), [pub(ns, LOOKUP)])
      assert.deepEqual(world.list()[0]._meta[K2.CONTRIBUTOR_META_KEY], { plugin: pkg, version: FIXTURE.version })
    })
  }
  row(sdk, ID.ep02, '1 (no version)', 'a contributor package with no version → _meta.version "" (decision 2026-11-14)', async (t) => {
    const world = await worldFor(t, sdk)
    await world.add(FIXTURE.pkg.board, { version: null })
    assert.deepEqual(world.list()[0]._meta[K2.CONTRIBUTOR_META_KEY], { plugin: FIXTURE.pkg.board, version: FIXTURE.noVersion })
  })
  row(sdk, ID.ep02, 4, 'a definition passing namespace "other" → ignored; the derived namespace is used', async (t) => {
    const world = await worldFor(t, sdk)
    await world.add(FIXTURE.pkg.board, { definition: () => ({ namespace: FIXTURE.chosenNamespace }) })
    assert.deepEqual(world.names(), [pub(FIXTURE.pkg.board, LOOKUP)])
  })
  row(sdk, ID.ep02, 5, 'register through a handle obtained in another plugin\'s scope → that scope\'s namespace (attribution only)', async (t) => {
    const world = await worldFor(t, sdk)
    const holder = await world.add(FIXTURE.pkg.holder, { tools: [] })
    await world.add(FIXTURE.pkg.user, { tools: [], onService: () => { holder.passed = holder.register(holder.tool(FIXTURE.tool.second)) } })
    assert.equal(typeof holder.passed.dispose, 'function')
    assert.deepEqual(world.names(), [pub(FIXTURE.pkg.holder, FIXTURE.tool.second)])
  })
  row(sdk, ID.ep02, '5a', 'a caller with no traceable package → contributor-unidentified', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { tools: [] })
    assert.equal((await unidentifiedRegister(world, c.tool(LOOKUP))).code, REGISTER_REFUSAL.contributorUnidentified)
    assert.deepEqual(world.names(), [])
  })
  row(sdk, ID.ep02, '5b', 'a plugin whose declared name differs from its package name → the package name', async (t) => {
    const world = await worldFor(t, sdk)
    await world.add(FIXTURE.pkg.declared, { declaredName: FIXTURE.declaredName })
    assert.deepEqual(world.names(), [pub(FIXTURE.pkg.declared, LOOKUP)])
  })
  row(sdk, ID.ep02, 6, '`a-b` then `@a/b` → the first keeps a-b; the second is refused namespace-reserved, logged once', async (t) => {
    const world = await worldFor(t, sdk)
    await world.add(FIXTURE.pkg.dash)
    const lines = world.logsWith(FIXTURE.ns.dash).length
    const second = await world.add(FIXTURE.pkg.scoped)
    assert.equal(second.registrations.get(LOOKUP).code, REGISTER_REFUSAL.namespaceReserved)
    assert.equal(world.logsWith(FIXTURE.ns.dash).length, lines + 1)
    assert.deepEqual(world.names(), [pub(FIXTURE.ns.dash, LOOKUP)])
    assert.deepEqual(world.list()[0]._meta[K2.CONTRIBUTOR_META_KEY].plugin, FIXTURE.pkg.dash)
  })

  // ---- EXT-EP-03: result handling ----
  const result = (part, title, behaviour, check, definition) => row(sdk, ID.ep03, part, title, async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { definition })
    c.behaviour[LOOKUP] = behaviour
    await check(await world.call(D, toolOf(c), ARGS))
  })
  result(1, '{ok: true, data} valid → {...data, ok: true}', () => ok({ count: 1 }), (r) => assertOkResult(sdk, r, { count: 1 }))
  row(sdk, ID.ep03, '1a', 'data not a plain object (array, string, null) or carrying its own ok → contributor-failed (decision 2026-11-14)', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    for (const data of FIXTURE.nonObjectData) {
      c.behaviour[LOOKUP] = () => ok(data)
      await assertContained(sdk, await world.call(D, toolOf(c), ARGS))
    }
  })
  row(sdk, ID.ep03, '1b', 'an outputSchema that declares ok → tool-invalid at registration (decision 2026-11-14)', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { tools: [] })
    assertRegisterInvalid(world, c, { outputSchema: FIXTURE.outputSchemaWithOk })
  })
  result(2, '{ok: false, code: <declared>} → that code, isError true', () => ({ ok: false, code: FIXTURE.declaredCode }), (r) => assertRefusedResult(sdk, r, FIXTURE.declaredCode))
  result(3, '{ok: false, code: "forbidden"} (shared, undeclared) → forbidden', () => ({ ok: false, code: K1.REFUSAL.forbidden }), (r) => assertRefusedResult(sdk, r, K1.REFUSAL.forbidden))
  row(sdk, ID.ep03, '3a', 'every other SHARED_CODES member, undeclared → passed through unchanged', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    for (const code of K2.SHARED_CODES.filter((x) => x !== K1.REFUSAL.forbidden)) {
      c.behaviour[LOOKUP] = () => ({ ok: false, code })
      await assertRefusedResult(sdk, await world.call(D, toolOf(c), ARGS), code)
    }
  })
  result(4, '{ok: false, code: "weird"} (undeclared, not shared) → operation-failed', () => ({ ok: false, code: FIXTURE.undeclaredCode }), (r) => assertRefusedResult(sdk, r, CALL_CODE.operationFailed))
  result(5, 'data failing outputSchema → contributor-failed', () => ok({ count: FIXTURE.marker }), (r) => assertContained(sdk, r), (name) => (name === LOOKUP ? { outputSchema: FIXTURE.outputSchema } : {}))
  result('5 (valid)', 'data valid against outputSchema → ok', () => ok({ count: 1 }), (r) => assertOkResult(sdk, r, { count: 1 }), (name) => (name === LOOKUP ? { outputSchema: FIXTURE.outputSchema } : {}))
  row(sdk, ID.ep03, 6, 'not the result shape (a string, its own isError, raw content blocks) → contributor-failed; its flags and blocks never reach the client', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    const raw = [{ type: 'text', text: FIXTURE.marker }]
    for (const value of [FIXTURE.marker, { isError: false, content: raw }, { ok: true, data: {}, isError: false }, { ok: true, data: {}, content: raw }]) {
      c.behaviour[LOOKUP] = () => value
      const reply = await world.call(D, toolOf(c), ARGS)
      await assertContained(sdk, reply)
      assertNoLeak(reply, [FIXTURE.marker])
    }
  })
  row(sdk, ID.ep03, 7, 'execute throws synchronously or rejects → contributor-failed (no stack, message, path)', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    c.register(c.tool(FIXTURE.tool.second, { execute: throwing }))
    c.behaviour[LOOKUP] = async () => { throw new Error(FIXTURE.secretPath) }
    for (const local of [LOOKUP, FIXTURE.tool.second]) await assertContained(sdk, await world.call(D, toolOf(c, local), ARGS))
  })
  row(sdk, ID.ep03, 8, `a ${FIXTURE.messageLength}-character message holding an dsht_ value → scrubbed and cut to ${TOOL_LIMITS.messageChars}`, async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    const token = K1.TOKEN_VALUE.generatedPrefix + FIXTURE.tokenTail
    const message = (FIXTURE.pad(FIXTURE.messageTokenAt) + token).padEnd(FIXTURE.messageLength, FIXTURE.messageFill)
    c.behaviour[LOOKUP] = () => ({ ok: false, code: FIXTURE.declaredCode, message })
    const reply = await world.call(D, toolOf(c), ARGS)
    const sc = await assertRefusedResult(sdk, reply, FIXTURE.declaredCode)
    assert.equal([...sc.message].length, TOOL_LIMITS.messageChars)
    assertNoLeak(reply, [FIXTURE.tokenTail])
  })

  // ---- EXT-EP-04: contributor scope ----
  for (const [part, attempt] of [
    [1, 'read or ack a mailbox'], [2, 'list / answer approvals, questions, prompts'], [3, 'settle an offer, Hand over / Take back'],
    [5, 'call another contributed or core tool through the connector'], [6, 'run anything in a Fishball DSH'],
  ]) {
    row(sdk, ID.ep04, part, `${attempt} → no such member: the service has only apiVersion, register, emit, mine`, async (t) => {
      const world = await worldFor(t, sdk)
      const c = await world.add(FIXTURE.pkg.board)
      assertOnlyContributorMembers(world, c.svc)
      await world.call(D, toolOf(c), ARGS)
      assert.deepEqual(Object.keys(c.calls[0].call).sort(), ['principal', 'protocolVersion', 'signal'], 'the call carries a handle')
    })
  }
  row(sdk, ID.ep04, 4, 'a token, entry label or fishball id → absent from call and the service', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    await world.call(D, toolOf(c), ARGS)
    const { call } = c.calls[0]
    assertNoLeak({ principal: call.principal, protocolVersion: call.protocolVersion, mine: c.svc.mine(), members: serviceMembers(world, c.svc) })
  })
  row(sdk, ID.ep04, 7, 'call.principal.key: stable across two calls of one pair, different between pairs, reveals no token or id', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    for (const pair of [D, D, E2]) await world.call(pair, toolOf(c), ARGS)
    const [k1, k2, k3] = c.calls.map((x) => x.call.principal.key)
    assert.equal(k1, k2)
    assert.notEqual(k1, k3)
    assertNoLeak([k1, k3])
  })
}

// ------------------------------------------------------------------------------------------------
// Boundary Value Analysis

function registerBoundaries(sdk) {
  // ---- EXT-BVA-01: public tool name length (MCP 1–128) ----
  const nameRow = (part, title, pkg, local, code) => row(sdk, ID.bva01, part, title, async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(pkg, { tools: [] })
    if (code !== undefined) return assertRegisterRefused(world, c, c.tool(local), code)
    assert.equal(typeof c.register(c.tool(local)).dispose, 'function')
    assert.deepEqual(world.names(), [pub(nsOf(c), local)])
  })
  nameRow(1, `public name ${K2.NAME_GRAMMAR.publicMaxChars} characters → registered`, FIXTURE.pkg.long128, FIXTURE.pad(FIXTURE.localMax))
  nameRow(2, `public name ${K2.NAME_GRAMMAR.publicMaxChars + 1} characters → tool-invalid`, FIXTURE.pkg.long129, FIXTURE.pad(FIXTURE.localMax), REGISTER_REFUSAL.toolInvalid)
  nameRow(3, 'local name length 1 (`ns.a`) → registered', FIXTURE.pkg.short, FIXTURE.pad(1))
  nameRow(4, 'local name length 0 → tool-invalid', FIXTURE.pkg.short, '', REGISTER_REFUSAL.toolInvalid)
  nameRow(5, `local name ${FIXTURE.localMax} (grammar max) → registered`, FIXTURE.pkg.short, FIXTURE.pad(FIXTURE.localMax))
  nameRow(6, `local name ${FIXTURE.localMax + 1} → tool-invalid`, FIXTURE.pkg.short, FIXTURE.pad(FIXTURE.localMax + 1), REGISTER_REFUSAL.toolInvalid)

  // ---- EXT-BVA-02: event payload and summary size ----
  const emitRow = (part, title, event, code) => row(sdk, ID.bva02, part, title, async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.ci, { tools: [] })
    for (const e of [event].flat()) {
      if (code === undefined) await assertEmitOk(world, c, e)
      else await assertEmitRefused(world, c, e, code)
    }
  })
  const bytes = EVENT_LIMITS.payloadBytes
  emitRow(1, `payload ${bytes - 1} UTF-8 JSON bytes → ok`, note({ payload: payloadOf(bytes - 1) }))
  emitRow(2, `payload ${bytes} (8 KiB) → ok`, note({ payload: payloadOf(bytes) }))
  emitRow(3, `payload ${bytes + 1} → payload-too-large, nothing queued`, note({ payload: payloadOf(bytes + 1) }), EMIT_REFUSAL.payloadTooLarge)
  emitRow(4, `payload ${FIXTURE.euroCount} × € + quotes (${FIXTURE.euroCount * Buffer.byteLength(FIXTURE.euro) + FIXTURE.stringOverheadBytes} bytes) → payload-too-large`,
    note({ payload: FIXTURE.euro.repeat(FIXTURE.euroCount) }), EMIT_REFUSAL.payloadTooLarge)
  const cycle = {}
  cycle.self = cycle
  emitRow(5, 'payload not JSON-serialisable (cycle, BigInt) → event-invalid', [note({ payload: cycle }), note({ payload: BigInt(1) })], EMIT_REFUSAL.eventInvalid)
  const chars = EVENT_LIMITS.summaryChars
  emitRow(6, `summary ${chars - 1} characters → ok`, note({ summary: FIXTURE.pad(chars - 1) }))
  emitRow(7, `summary ${chars} → ok`, note({ summary: FIXTURE.pad(chars) }))
  emitRow(8, `summary ${chars + 1} → event-invalid (K2)`, note({ summary: FIXTURE.pad(chars + 1) }), EMIT_REFUSAL.eventInvalid)
  emitRow('8 (code points)', `summary of ${chars} three-byte characters → ok (characters, not bytes)`, note({ summary: FIXTURE.euro.repeat(chars) }))
  row(sdk, ID.bva02, 9, 'summary with HTML/markdown → kept as given, plain text (K2: never interpreted)', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.ci, { tools: [] })
    await assertEmitOk(world, c, note({ summary: FIXTURE.summaryHtml }))
    assert.equal(lastCommit(world).event.payload.summary, FIXTURE.summaryHtml)
  })
  emitRow(10, 'event name "" or "A B" → event-invalid', FIXTURE.badEventNames.map((event) => note({ event })), EMIT_REFUSAL.eventInvalid)

  // ---- EXT-BVA-03: event rate per contributor and recipient (fake clock) ----
  const burst = async (world, c, extra) => { for (let i = 0; i < EVENT_LIMITS.rateBurst; i++) await assertEmitOk(world, c, note(extra)) }
  const rateRow = (part, title, body) => row(sdk, ID.bva03, part, title, async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.ci, { tools: [] })
    await body(world, c)
  })
  rateRow(1, `${EVENT_LIMITS.rateBurst} emits at t = 0 → all ok`, (w, c) => burst(w, c))
  rateRow(2, `the ${EVENT_LIMITS.rateBurst + 1}th at t = 0 → rate-limited`, async (w, c) => {
    await burst(w, c)
    await assertEmitRefused(w, c, note(), EMIT_REFUSAL.rateLimited)
  })
  rateRow(3, `after the burst, one emit at t = ${REFILL_MS} ms → ok (one token refilled)`, async (w, c) => {
    await burst(w, c)
    w.clock.advance(REFILL_MS)
    await assertEmitOk(w, c, note())
  })
  rateRow(4, `after the burst, one emit at t = ${JUST_BEFORE_REFILL_MS} ms → rate-limited`, async (w, c) => {
    await burst(w, c)
    w.clock.advance(JUST_BEFORE_REFILL_MS)
    await assertEmitRefused(w, c, note(), EMIT_REFUSAL.rateLimited)
  })
  rateRow(5, `one emit every ${REFILL_MS} ms for 2 minutes → all ok (${EVENT_LIMITS.ratePerMinute}/min)`, async (w, c) => {
    for (let at = 0; at < 2 * EVENT_LIMITS.rateWindowMs; at += REFILL_MS) {
      w.clock.advance(REFILL_MS)
      await assertEmitOk(w, c, note())
      w.mailbox.ackEvent(D.principalKey, lastCommit(w).event.eventId)
    }
  })
  rateRow(6, `burst spent, then ${EVENT_LIMITS.ratePerMinute} emits evenly over 60 s → ok; a ${EVENT_LIMITS.ratePerMinute + 1}st in that minute → rate-limited`, async (w, c) => {
    await burst(w, c)
    for (let i = 0; i < EVENT_LIMITS.ratePerMinute; i++) {
      w.clock.advance(REFILL_MS)
      await assertEmitOk(w, c, note())
    }
    await assertEmitRefused(w, c, note(), EMIT_REFUSAL.rateLimited)
  })
  rateRow(7, `${EVENT_LIMITS.rateBurst} to recipient A and ${EVENT_LIMITS.rateBurst} to recipient B at t = 0 → all ok (separate buckets)`, async (w, c) => {
    await burst(w, c)
    await burst(w, c, { sessionId: FIXTURE.session.managed })
    assert.equal(w.mailbox.pending(E2.principalKey).length, EVENT_LIMITS.rateBurst)
  })
  row(sdk, ID.bva03, 8, `two contributors, ${EVENT_LIMITS.rateBurst} each to A at t = 0 → all ok`, async (t) => {
    const world = await worldFor(t, sdk)
    for (const pkg of [FIXTURE.pkg.ci, FIXTURE.pkg.other]) await burst(world, await world.add(pkg, { tools: [] }))
  })
  rateRow(9, 'a refused emit takes no token, whatever its code', async (w, c) => {
    for (let i = 1; i < EVENT_LIMITS.rateBurst; i++) await assertEmitOk(w, c, note())
    await assertEmitRefused(w, c, note({ payload: payloadOf(EVENT_LIMITS.payloadBytes + 1) }), EMIT_REFUSAL.payloadTooLarge)
    await assertEmitOk(w, c, note())
    for (let i = 0; i < EVENT_LIMITS.rateBurst; i++) await assertEmitRefused(w, c, note(), EMIT_REFUSAL.rateLimited)
    w.clock.advance(REFILL_MS)
    await assertEmitOk(w, c, note())
    await assertEmitRefused(w, c, note(), EMIT_REFUSAL.rateLimited)
  })

  // ---- EXT-BVA-04: per-call limits ----
  const ceiling = TOOL_LIMITS.ceiling
  const callRow = (part, title, body, { definition, options } = {}) => row(sdk, ID.bva04, part, title, async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { definition })
    await body(world, c, t)
  }, undefined, options)
  const argRow = (part, bytes, refused, definition) => callRow(part, `argument bytes ${bytes}${definition ? ' (declared ' + FIXTURE.declared.argumentBytes + ')' : ', no declared limit'} → ${refused ? 'limit-exceeded, execute not called' : 'runs'}`, async (w, c) => {
    const reply = await w.call(D, toolOf(c), argsOf(bytes))
    if (refused) await assertRefusedResult(sdk, reply, CALL_CODE.limitExceeded)
    else await assertOkResult(sdk, reply)
    assert.equal(c.calls.length, refused ? 0 : 1)
  }, { definition })
  const declaredArgs = () => ({ limits: { argumentBytes: FIXTURE.declared.argumentBytes } })
  argRow('0a', ceiling.argumentBytes, false)
  argRow('0b', ceiling.argumentBytes + 1, true)
  argRow(1, FIXTURE.declared.argumentBytes, false, declaredArgs)
  argRow(2, FIXTURE.declared.argumentBytes + 1, true, declaredArgs)
  const resultRow = (part, bytes, refused, definition) => callRow(part, `result bytes ${bytes}${definition ? ' (declared R = ' + FIXTURE.declared.resultBytes + ')' : ', no declared limit'} → ${refused ? 'contributor-failed' : 'ok'}`, async (w, c) => {
    c.behaviour[LOOKUP] = () => ok(dataOf(bytes))
    const reply = await w.call(D, toolOf(c), ARGS)
    if (refused) await assertContained(sdk, reply)
    else await assertOkResult(sdk, reply)
  }, { definition })
  const declaredResult = () => ({ limits: { resultBytes: FIXTURE.declared.resultBytes } })
  resultRow('0c', ceiling.resultBytes, false)
  resultRow('0c', ceiling.resultBytes + 1, true)
  resultRow(4, FIXTURE.declared.resultBytes, false, declaredResult)
  resultRow(5, FIXTURE.declared.resultBytes + 1, true, declaredResult)
  const timeRow = (part, limitMs, late, definition, options) => callRow(part, late
    ? `still running at ${limitMs} ms → contributor-failed; call.signal.reason = timeout`
    : `returns at ${limitMs - FIXTURE.earlyMs} ms (T − ε) → ok`, async (w, c, t) => {
    if (definition === undefined) {
      // Virtualize only the default deadline pair; the declared deadline still runs in real time.
      t.mock.timers.enable({ apis: ['setTimeout'] })
      let held
      try {
        held = await heldCall(w, c)
        t.mock.timers.tick(limitMs - (late ? WAIT.deadlineTickMs : FIXTURE.earlyMs))
        assert.equal(held.call.signal.aborted, false)
        if (late) {
          t.mock.timers.tick(WAIT.deadlineTickMs)
          assert.equal(held.call.signal.reason, ABORT_REASON.timeout)
          await assertContained(sdk, await held.reply)
        } else {
          held.release(ok())
          await assertOkResult(sdk, await held.reply)
        }
      } finally {
        held?.release(ok())
        t.mock.timers.reset()
      }
      return
    }
    if (late) {
      const held = await heldCall(w, c)
      await assertContained(sdk, await held.reply)
      assert.equal(held.call.signal.reason, ABORT_REASON.timeout)
    } else {
      c.behaviour[LOOKUP] = after(limitMs - FIXTURE.earlyMs, ok())
      await assertOkResult(sdk, await w.call(D, toolOf(c), ARGS))
    }
  }, { definition, options })
  const slow = { timeout: WAIT.ceilingTestMs }
  timeRow('0d', ceiling.timeoutMs, false, undefined, slow)
  timeRow('0d', ceiling.timeoutMs, true, undefined, slow)
  const declaredTime = () => ({ limits: { timeoutMs: FIXTURE.declared.timeoutMs } })
  timeRow(6, FIXTURE.declared.timeoutMs, false, declaredTime)
  timeRow(7, FIXTURE.declared.timeoutMs, true, declaredTime)
  callRow('0e', `${TOOL_LIMITS.contributorInFlightCalls} calls of one contributor in flight → a ${TOOL_LIMITS.contributorInFlightCalls + 1}th gets queue-full; the ${TOOL_LIMITS.contributorInFlightCalls} continue`, async (w, c) => {
    const hold = Promise.withResolvers()
    c.behaviour[LOOKUP] = () => hold.promise
    const replies = Array.from({ length: TOOL_LIMITS.contributorInFlightCalls }, () => w.call(D, toolOf(c), ARGS))
    try {
      await eventually(() => c.calls.length === TOOL_LIMITS.contributorInFlightCalls, 'every call reached execute')
      await assertRefusedResult(sdk, await w.call(E2, toolOf(c), ARGS), CALL_CODE.queueFull)
      assert.equal(c.calls.length, TOOL_LIMITS.contributorInFlightCalls, 'the refused call reached execute')
    } finally {
      hold.resolve(ok())
    }
    for (const reply of replies) await assertOkResult(sdk, await reply)
  })
  row(sdk, ID.bva04, 3, 'each limit declared above its ceiling → tool-invalid at registration; at the ceiling → registered', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board, { tools: [] })
    for (const key of Object.keys(ceiling)) {
      assertRegisterInvalid(world, c, { limits: { [key]: ceiling[key] + 1 } })
      const registered = c.register(c.tool(FIXTURE.tool.second, { limits: { [key]: ceiling[key] } }))
      assert.equal(typeof registered.dispose, 'function', key + ' at the ceiling was refused')
      registered.dispose()
    }
  })
}

// ------------------------------------------------------------------------------------------------
// Decision Tables

function registerDecisionTables(sdk) {
  // ---- EXT-DT-01: emit outcome (K2 EMIT_CHECK_ORDER) ----
  const rule = (part, title, body, worldOptions) => row(sdk, ID.dt01, part, title, async (t) => {
    const world = await worldFor(t, sdk, worldOptions)
    const c = await world.add(FIXTURE.pkg.ci, { tools: [FIXTURE.tool.go] })
    await body(world, c)
  })
  const exhaust = async (world, c) => { for (let i = 0; i < EVENT_LIMITS.rateBurst; i++) await assertEmitOk(world, c, note({ sessionId: FIXTURE.session.managed })) }
  rule('1 (quarantined)', 'contributor quarantined → contributor-unavailable', async (w, c) => {
    await quarantine(sdk, w, c)
    await assertEmitRefused(w, c, note(), EMIT_REFUSAL.contributorUnavailable)
  })
  rule('1 (withdrawn)', 'contributor withdrawn (disabled; a saved handle) → contributor-unavailable', async (w, c) => {
    const svc = c.svc
    await w.disable(c)
    await assertEmitRefused(w, c, note(), EMIT_REFUSAL.contributorUnavailable, svc)
  })
  rule(2, 'active, name invalid → event-invalid', (w, c) => assertEmitRefused(w, c, note({ event: FIXTURE.badEventNames[1] }), EMIT_REFUSAL.eventInvalid))
  rule(3, 'name valid, size over → payload-too-large', (w, c) => assertEmitRefused(w, c, note({ payload: payloadOf(EVENT_LIMITS.payloadBytes + 1) }), EMIT_REFUSAL.payloadTooLarge))
  rule(4, 'size ok, no recipient → no-agent', (w, c) => assertEmitRefused(w, c, note(), EMIT_REFUSAL.noAgent), { designated: null })
  rule(5, 'recipient exists, rate over → rate-limited', async (w, c) => {
    await exhaust(w, c)
    await assertEmitRefused(w, c, note({ sessionId: FIXTURE.session.managed }), EMIT_REFUSAL.rateLimited)
  })
  rule(6, 'rate ok, a pending event with the same dedupeKey → duplicate', async (w, c) => {
    await assertEmitOk(w, c, note({ dedupeKey: FIXTURE.dedupeKey }))
    await assertEmitRefused(w, c, note({ dedupeKey: FIXTURE.dedupeKey }), EMIT_REFUSAL.duplicate)
  })
  rule(7, 'not a duplicate, the recipient\'s queue full → queue-full', async (w, c) => {
    w.mailbox.fill(D.principalKey, K1.QUEUE.maxQueuedInputs)
    await assertEmitRefused(w, c, note(), EMIT_REFUSAL.queueFull)
  })
  rule('7 (port)', 'the mailbox port fails → queue-full (decision 2026-11-14)', async (w, c) => {
    w.mailbox.failNext = true
    const result = await c.emit(note())
    assert.deepEqual(result, { ok: false, code: EMIT_REFUSAL.queueFull })
    assert.deepEqual(w.mailbox.contributed(), [])
  })
  rule(8, 'every check passes → {ok: true, eventId}', async (w, c) => {
    const result = await assertEmitOk(w, c, note())
    assert.equal(lastCommit(w).event.eventId, result.eventId)
  })
  rule(9, 'same dedupeKey, the earlier one already acked → ok', async (w, c) => {
    const first = await assertEmitOk(w, c, note({ dedupeKey: FIXTURE.dedupeKey }))
    w.mailbox.ackEvent(D.principalKey, first.eventId)
    await assertEmitOk(w, c, note({ dedupeKey: FIXTURE.dedupeKey }))
  })
  rule(10, 'same dedupeKey from a different contributor → ok', async (w, c) => {
    await assertEmitOk(w, c, note({ dedupeKey: FIXTURE.dedupeKey }))
    const other = await w.add(FIXTURE.pkg.other, { tools: [] })
    await assertEmitOk(w, other, note({ dedupeKey: FIXTURE.dedupeKey }))
  })
  rule(11, 'the connector unloaded (a saved handle) → registry-closed', async (w, c) => {
    const svc = c.svc
    await w.disableConnector()
    await assertEmitRefused(w, c, note(), EMIT_REFUSAL.registryClosed, svc)
  })
  rule('order', 'two failing checks → the earlier one in EMIT_CHECK_ORDER wins', async (w, c) => {
    const order = K2.EMIT_CHECK_ORDER
    assert.ok(order.indexOf(EMIT_REFUSAL.eventInvalid) < order.indexOf(EMIT_REFUSAL.payloadTooLarge))
    await assertEmitRefused(w, c, note({ event: FIXTURE.badEventNames[1], payload: payloadOf(EVENT_LIMITS.payloadBytes + 1) }), EMIT_REFUSAL.eventInvalid)
    await assertEmitOk(w, c, note({ dedupeKey: FIXTURE.dedupeKey }))
    await assertEmitRefused(w, c, note({ dedupeKey: FIXTURE.dedupeKey, payload: payloadOf(EVENT_LIMITS.payloadBytes + 1) }), EMIT_REFUSAL.payloadTooLarge)
    w.mailbox.fill(D.principalKey, K1.QUEUE.maxQueuedInputs)
    await assertEmitRefused(w, c, note({ dedupeKey: FIXTURE.dedupeKey }), EMIT_REFUSAL.duplicate)
    await exhaust(w, c)
    await assertEmitRefused(w, c, note({ sessionId: FIXTURE.session.managed, dedupeKey: FIXTURE.marker }), EMIT_REFUSAL.rateLimited)
  })
  rule('order (unavailable first)', 'a quarantined contributor\'s invalid event → contributor-unavailable', async (w, c) => {
    await quarantine(sdk, w, c)
    await assertEmitRefused(w, c, note({ event: FIXTURE.badEventNames[1] }), EMIT_REFUSAL.contributorUnavailable)
  })
  rule('all', 'every rule returns a code, never a throw (a non-object event too)', async (w, c) => {
    for (const event of [null, undefined, FIXTURE.marker, {}]) await assertEmitRefused(w, c, event, EMIT_REFUSAL.eventInvalid)
  })

  // ---- EXT-DT-02: contributor event recipient ----
  /** `expected` is `{to: principalKey}` or `{code}`. */
  const recipient = (part, title, extra, expected, worldOptions) => row(sdk, ID.dt02, part, title, async (t) => {
    const world = await worldFor(t, sdk, worldOptions)
    const c = await world.add(FIXTURE.pkg.ci, { tools: [] })
    if (expected.code !== undefined) return assertEmitRefused(world, c, note(extra), expected.code)
    await assertEmitOk(world, c, note(extra))
    assert.equal(lastCommit(world).recipient, expected.to)
  })
  const none = { designated: null }
  recipient(1, 'sessionId given, managed by M → M', { sessionId: FIXTURE.session.managed }, { to: E2.principalKey })
  // Rules 2 and 4 (a designated D) are withdrawn by C-WIRE-2 (the user's q5); rules 3 and 5 are the V3 rule.
  withdrawnRow(sdk, ID.dt02, 2, 'sessionId given, unmanaged, D designated → D')
  recipient(3, 'sessionId given, unmanaged, none designated → no-agent', { sessionId: FIXTURE.session.unmanaged }, { code: EMIT_REFUSAL.noAgent }, none)
  withdrawnRow(sdk, ID.dt02, 4, 'no sessionId, D designated → D')
  recipient(5, 'no sessionId, none designated → no-agent', {}, { code: EMIT_REFUSAL.noAgent }, none)
  recipient(6, 'sessionId of no session of this DSH → event-invalid, nothing queued (TQ-14)', { sessionId: FIXTURE.session.unknown }, { code: EMIT_REFUSAL.eventInvalid })

  // ---- EXT-DT-03: contributed tools in tools/list (C-EXT's rows; the matrix is X-MATRIX's) ----
  row(sdk, ID.dt03, 'E1', 'C alone, full AT → no contributed tools', async (t) => {
    const world = await worldFor(t, sdk)
    assert.deepEqual(world.list(), [])
  })
  row(sdk, ID.dt03, 'E2', 'C + X, full AT → X\'s tools', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    assert.deepEqual(world.names(), [toolOf(c)])
  })
  row(sdk, ID.dt03, 'E2p', 'C + X, pair-only AT → none', null, LATER.tools)
  for (const part of ['E3', 'E4']) row(sdk, ID.dt03, part, 'embed-ui present → embed-ui.attention.*', null, LATER.attention)
  row(sdk, ID.dt03, 'E5', 'C + I + U + X → both, core tools first, then sorted by public name', null, LATER.attention)
  for (const part of ['E6', 'E8']) row(sdk, ID.dt03, part, 'a Fishball model on a remote / standalone target sees that connector\'s contributions', null, LATER.facade)
  row(sdk, ID.dt03, 'E7', 'X, no C → none; X loads normally', async (t) => {
    const world = await worldFor(t, sdk, { connector: false })
    const c = await world.add(FIXTURE.pkg.board)
    assert.equal(c.activations, 1, 'X did not load')
    assert.equal(c.scopes, 0, 'the optional inject activated without a connector')
    assert.deepEqual(world.list(), [])
  })
  row(sdk, ID.dt03, 'E9', 'C + X, X disabled → none', async (t) => {
    const world = await worldFor(t, sdk)
    const c = await world.add(FIXTURE.pkg.board)
    await world.disable(c)
    assert.deepEqual(world.list(), [])
  })
}

// ------------------------------------------------------------------------------------------------
// State Transitions

function registerStateTransitions(sdk) {
  // ---- EXT-ST-01: a contributor's registration ----
  const st = (part, title, body, extra = {}) => row(sdk, ID.st01, part, title, async (t) => {
    const world = await worldFor(t, sdk, extra.world)
    const c = await world.add(FIXTURE.pkg.board)
    await body(world, c)
  }, extra.todo)
  st(1, 'Absent → register → Active: listed; list_changed; mine() active', async (w, c) => {
    const before = w.listChanges
    c.registrations.get(LOOKUP).dispose()
    c.register(c.tool(LOOKUP))
    assert.ok(w.listed(toolOf(c)))
    assert.ok(await w.listChangedSince(before))
    assert.deepEqual(c.svc.mine(), [{ name: LOOKUP, publicName: toolOf(c), state: K2.REGISTRATION_STATE.active }])
  })
  st(2, 'Active → dispose → Absent: unlisted before the next answer; list_changed; mine() empty', async (w, c) => {
    const before = w.listChanges
    c.registrations.get(LOOKUP).dispose()
    assert.ok(!w.listed(toolOf(c)))
    assertUnknownTool(await w.call(D, toolOf(c), ARGS))
    assert.ok(await w.listChangedSince(before))
    assert.deepEqual(c.svc.mine(), [])
  })
  for (const [part, how, act, relisted] of [
    ['3 (disabled)', 'plugin disabled', (w, c) => w.disable(c), false],
    ['3 (uninstalled)', 'plugin uninstalled', (w, c) => w.uninstall(c), false],
    ['3 (reloaded)', 'plugin reloaded', (w, c) => w.restart(c), true],
  ]) {
    st(part, `Active → ${how} → Absent: unlisted, list_changed, pending events retired`, async (w, c) => {
      const events = await pendingAndAcked(w, c)
      const before = w.listChanges
      await act(w, c)
      assert.ok(await w.listChangedSince(before))
      await assertRetired(w, events)
      assert.equal(w.listed(toolOf(c)), relisted)
    })
  }
  st('3 (hot-reloaded)', 'Active → hot reload → Absent, then Active', null, { todo: LATER.matrix })
  for (const [part, how, act] of [['4 (dispose)', 'disposed', (w, c) => c.registrations.get(LOOKUP).dispose()], ['4 (disable)', 'its plugin disabled', (w, c) => w.disable(c)]]) {
    st(part, `an in-flight call when the tool is ${how} → tool-withdrawn; signal reason tool-withdrawn`, async (w, c) => {
      const held = await heldCall(w, c)
      await act(w, c)
      await assertRefusedResult(sdk, await held.reply, CALL_CODE.toolWithdrawn)
      assert.equal(held.call.signal.reason, ABORT_REASON.withdrawn)
    })
  }
  st(5, 'Active → failures beyond the threshold → Quarantined: unlisted; emit contributor-unavailable; pending retired', async (w, c) => {
    const events = await pendingAndAcked(w, c)
    await quarantine(sdk, w, c)
    await assertQuarantined(w, c)
    await assertRetired(w, events)
  })
  st(6, 'Quarantined → register again in the same activation → accepted with a normal disposer, not listed; mine() quarantined', async (w, c) => {
    await quarantine(sdk, w, c)
    const again = c.register(c.tool(FIXTURE.tool.second))
    assert.equal(typeof again.dispose, 'function')
    assert.ok(!w.listed(toolOf(c, FIXTURE.tool.second)))
    const mine = c.svc.mine()
    assert.ok(mine.length > 0 && mine.every((r) => r.state === K2.REGISTRATION_STATE.quarantined), json(mine))
    again.dispose()
  })
  st(7, 'Quarantined → plugin disabled + re-enabled → Absent → (register) Active', async (w, c) => {
    await quarantine(sdk, w, c)
    await w.disable(c)
    assert.ok(!w.listed(toolOf(c)))
    await w.enable(c)
    assert.ok(w.listed(toolOf(c)))
    assert.deepEqual(c.svc.mine().map((r) => r.state), [K2.REGISTRATION_STATE.active])
  })
  st(8, 'Quarantined → plugin reloaded (a new activation) → Active', async (w, c) => {
    await quarantine(sdk, w, c)
    await w.restart(c)
    assert.ok(w.listed(toolOf(c)))
    await assertOkResult(sdk, await w.call(D, toolOf(c), ARGS))
  })
  st('8 (hot-reloaded)', 'Quarantined → hot reload → Active', null, { todo: LATER.matrix })
  st('8a', 'Quarantined → the connector reloads → still Quarantined', async (w, c) => {
    await quarantine(sdk, w, c)
    await w.restartConnector()
    assert.ok(c.live, 'the contributor\'s sub-scope is back with the connector')
    await assertQuarantined(w, c)
  })
  st('8b', 'Active, owner fiber disposing → tools/list / tools/call → Absent before the disposer runs', async (w, c) => {
    const disabling = w.beginDisable(c)
    const listedNow = w.listed(toolOf(c))
    const callNow = w.call(D, toolOf(c), ARGS)
    await disabling
    assert.ok(!listedNow)
    assertUnknownTool(await callNow)
  })
  st(9, 'Quarantined → any connector setting change → still Quarantined', async (w, c) => {
    await quarantine(sdk, w, c)
    await w.reconfigureConnector({ [FIXTURE.connectorSetting]: FIXTURE.marker })
    await assertQuarantined(w, c)
  })
  st(10, 'Active → connector unloads → Closed: service gone, the contributor stays loaded, a later register → registry-closed', async (w, c) => {
    const svc = c.svc
    const registry = w.registry
    await w.disableConnector()
    assert.equal(c.live, false, 'the optional sub-scope is still active without the service')
    assert.equal(c.activations, 1, 'the contributor itself was reloaded')
    assert.deepEqual(registry.list(), [], 'the closed registry still lists tools')
    const result = c.register(c.tool(FIXTURE.tool.second), svc)
    assert.equal(result.code, REGISTER_REFUSAL.registryClosed)
  })
  st(11, 'Absent (C missing) → contributor loads → Absent: the optional inject never activates; the contributor loads fine', async (w, c) => {
    assert.equal(c.activations, 1)
    assert.equal(c.scopes, 0)
    assert.equal(c.svc, undefined)
  }, { world: { connector: false } })
}
