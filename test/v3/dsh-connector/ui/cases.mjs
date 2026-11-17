/**
 * C-UI-BACKEND black-box cases: the connector's UI backend (marks, Hand over targets and lights,
 * the attention latch, notify, the owner-only routes and the event stream, the contributed tools).
 * Requirements R-UI-05 / Q-G5, R-UI-10, R-ROUTE-05 / K3, design §13.6, R-FN-01 (Q-N1, Q-N3 = A),
 * R-EXT-13, Q-U2, Q-G4, and the surface the dev session relayed (subject.mjs, constants.mjs SURFACE).
 * Nothing under packages/dsh-connector/src/ui/ was read.
 *
 * The use cases come first and the tables are derived from them: see USE-CASES.md beside this file
 * (UIB-UC-01…07, UIB-EP-01…07, UIB-BVA-01…04, UIB-DT-01…04, UIB-ST-01…04). One test per row; a
 * test's name is its id and row. Rows whose outcome the requirements left open were first `todo` with a question; they are now written from the dev session's answers
 * (constants.mjs DECIDED), and each cites the answer it relies on.
 *
 * Levels:
 * - unit / integration with fakes: a FakeHandover (K3), a FakeCtx, real Request / Response objects,
 *   an SSE reader, and the tool definitions `contribute` hands to a capturing `register`;
 * - integration with the real contribution service (C-EXT) in a real Cordis loader, embed-UI a real
 *   `dsh-connector-ui` package (world.mjs contribWorld);
 * - integration with the real K3 hand-over service of C-ROUTE (world.mjs routedBackend).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { until } from '../../../support/util.mjs'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { DECIDED, EXPECT, FIXTURE, K2, K3, SURFACE, WAIT } from './constants.mjs'
import { FakeCtx, captureRegister, requestOf, row as principalRow, sseReader } from './fakes.mjs'
import { unitBackend } from './subject.mjs'
import { contribWorld, routedBackend } from './world.mjs'
import { registerCuiBackendCases } from './cui-cases.mjs'

const T = { timeout: WAIT.testMs }
const TR = { timeout: WAIT.routeTestMs }
const { p: P, q: Q, d: D, x: X, u: U } = FIXTURE
const S = FIXTURE.sessions
const TOOL = SURFACE.tools
const ST = SURFACE.status
const CODE = SURFACE.code
const json = (value) => JSON.stringify(value)
const ref = ({ key, name, id }) => ({ key, name, id })
const target = ({ key, name, id, online }) => ({ key, name, id, online })
/**
 * C-WIRE-2 (the user's q5, "Remove agentToken entirely"): there is no designated principal, so the
 * attention latch resets only on window open and embed-UI unload; a principal's connection loss keeps it.
 */
const NO_DESIGNATED = 'withdrawn by C-WIRE-2: the user (q5) "Remove agentToken entirely" — no designated principal; the latch resets only on window open and embed-UI unload'
const withdrawnRow = (sdk, id, part, title) => test(caseName(sdk, id, part, title), { skip: NO_DESIGNATED }, () => {})

/** One test per case row; `todo` carries the open question. */
function row(sdk, id, part, title, fn, todo, options = T) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, options, fn)
}

/** Waits for `predicate` (a harness wait, not an oracle) and fails naming `what`. */
async function eventually(predicate, what) {
  assert.ok(await until(predicate, WAIT.settleMs, WAIT.pollMs), 'timed out: ' + what)
}
const quiet = () => new Promise((resolve) => setTimeout(resolve, WAIT.quietMs))

// ------------------------------------------------------------------------------------------------
// The unit world: a provided, contributed backend over FakeHandover.

/**
 * `{handover, backend, ctx, tools, snapshot, route(key, body), stream(), notify, signal, state, …}`.
 * The backend is provided on a FakeCtx and contributed to a capturing register before the case
 * sets any principal row, so it follows the hand-over service from the first change on.
 */
export async function unit(t, sdk, { contribute = true } = {}) {
  const u = await unitBackend(t, sdk)
  const ctx = new FakeCtx()
  u.backend.provide(ctx)
  t.after(() => ctx.dispose())
  const tools = captureRegister()
  const streams = []
  t.after(async () => { for (const s of streams) await s.cancel() })
  const world = {
    ...u, ctx, tools,
    dispose: contribute ? u.backend.service.contribute(tools.register) : undefined,
    snapshot: () => u.backend.snapshot(),
    /** One route call: the Response. */
    route: (key, body, signal) => ctx.route(key).fetch(requestOf(key, body, signal)),
    /** Opens the events route: `{response, sse}`. */
    async stream(signal) {
      const response = await world.route('events', undefined, signal)
      const sse = sseReader(response)
      streams.push(sse)
      return { response, sse }
    },
    exec: (local, args) => tools.byName(local).execute(args, callOf()),
    notify: (args) => world.exec(TOOL.notify, args),
    signal: (important) => world.exec(TOOL.signal, { important }),
    state: () => world.exec(TOOL.state, {}),
  }
  return world
}
/** A K2 ContributedCall for a direct `execute`. */
const callOf = () => ({ principal: FIXTURE.caller, protocolVersion: K2.TOOLS_API.protocolVersion, signal: new AbortController().signal })

const ACCEPTED = Object.freeze({ ok: true, data: Object.freeze({ accepted: true }) })
/** A JSON answer: status and the two headers every JSON answer has (relayed surface). */
export async function jsonAnswer(response, status) {
  assert.equal(response.status, status, 'status')
  assert.equal(response.headers.get('content-type'), SURFACE.headers.contentType)
  assert.equal(response.headers.get('cache-control'), SURFACE.headers.cacheControl)
  return response.json()
}
const assertKeys = (value, keys) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort())
/** 400 `invalid-request`, exactly, and the service never called. */
async function assertInvalid(w, key, body) {
  const answer = await jsonAnswer(await w.route(key, body), ST.invalid)
  assert.deepEqual(answer, { ok: false, code: CODE.invalidRequest })
  assert.deepEqual(w.handover.calls, { handOver: [], takeBack: [] }, 'the service was called for an invalid body')
}
/** A refused tool call: its code, and the snapshot unchanged. */
async function assertToolRefused(w, act, code) {
  const before = w.snapshot()
  const result = await act()
  assert.equal(result.ok, false, 'not refused: ' + json(result))
  assert.equal(result.code, code)
  assert.deepEqual(w.snapshot(), before, 'a refused call changed the state')
}
const latchOf = (w) => w.snapshot().attention
const noticeOf = (w) => w.snapshot().notice
/** A message of `n` code points made of `unit`. */
const message = (n, unit = FIXTURE.ascii) => unit.repeat(n)

/** A handOver body of exactly `bytes` UTF-8 bytes; `multibyte` pads with three-byte characters. */
function handOverBodyOf(bytes, multibyte) {
  const base = { sessionId: S.s1, principalKey: P.key }
  const room = bytes - Buffer.byteLength(json({ ...base, note: '' }))
  const wide = multibyte ? Math.floor(room / EXPECT.euroBytes) : 0
  const note = FIXTURE.euro.repeat(wide) + FIXTURE.padChar.repeat(room - wide * EXPECT.euroBytes)
  const text = json({ ...base, note })
  assert.equal(Buffer.byteLength(text), bytes, 'harness: the body has the wrong size')
  return text
}

// ------------------------------------------------------------------------------------------------

export function registerCUiBackendCases(sdk) {
  useCases(sdk)
  partitions(sdk)
  boundaries(sdk)
  decisions(sdk)
  transitions(sdk)
  contribution(sdk)
  routed(sdk)
  registerCuiBackendCases(sdk)
}

function useCases(sdk) {
  const id = 'UIB-UC-01'
  row(sdk, id, 'main', 'targets list the enabled, paired principals; handover → handOver(s, key) with the note omitted; 200 {ok, principal, state}; the session is marked', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(P), principalRow(Q, { online: true })] })
    const read = await jsonAnswer(await w.route('state'), ST.ok)
    assert.deepEqual(read, { ok: true, state: w.snapshot() })
    assert.deepEqual(read.state.targets, [target(principalRow(P)), target(principalRow(Q, { online: true }))])
    const answer = await jsonAnswer(await w.route('handOver', { sessionId: S.s1, principalKey: P.key }), ST.ok)
    assert.equal(w.handover.calls.handOver.length, 1)
    const [args] = w.handover.calls.handOver
    assert.deepEqual(args.slice(0, EXPECT.noteArg), [S.s1, P.key])
    assert.equal(args[EXPECT.noteArg], undefined, 'an omitted note must be passed as omitted')
    assertKeys(answer, ['ok', 'principal', 'state'])
    assert.equal(answer.ok, true)
    assert.deepEqual(answer.principal, ref(P))
    assert.deepEqual(answer.state.marks, [{ sessionId: S.s1, principal: ref(P) }])
    assert.deepEqual(answer.state, w.snapshot())
  })
  row(sdk, id, 'A1', 'a note is passed to handOver as given', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(P)] })
    await jsonAnswer(await w.route('handOver', { sessionId: S.s1, principalKey: P.key, note: FIXTURE.note }), ST.ok)
    assert.deepEqual(w.handover.calls.handOver, [[S.s1, P.key, FIXTURE.note]])
  })
  row(sdk, id, 'E1', 'a K3 refusal → 409 {ok: false, code, state}; nothing changes', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(P)] })
    const before = w.snapshot()
    w.handover.script.handOver = { ok: false, code: K3.handOverCodes[0] }
    const answer = await jsonAnswer(await w.route('handOver', { sessionId: S.unknown, principalKey: P.key }), ST.refused)
    assert.deepEqual(answer, { ok: false, code: K3.handOverCodes[0], state: before })
    assert.deepEqual(w.snapshot(), before)
  })
  row(sdk, id, 'E2', 'a body that is not JSON → 400 invalid-request; the service is not called', async (t) => {
    await assertInvalid(await unit(t, sdk), 'handOver', FIXTURE.notJson)
  })
  row(sdk, id, 'E3', 'the service throws → 500 {ok: false, code: operation-failed}', async (t) => {
    const w = await unit(t, sdk)
    w.handover.script.handOver = { throws: new Error(FIXTURE.failure) }
    const answer = await jsonAnswer(await w.route('handOver', { sessionId: S.s1, principalKey: P.key }), ST.failed)
    assert.deepEqual(answer, { ok: false, code: CODE.operationFailed })
  })

  const id2 = 'UIB-UC-02'
  row(sdk, id2, 'main', 'takeback → takeBack(s) with the note omitted; 200 {ok, state} exactly; the mark goes', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(P)], managed: [{ sessionId: S.s1, principal: P }] })
    assert.deepEqual(w.snapshot().marks, [{ sessionId: S.s1, principal: ref(P) }])
    const answer = await jsonAnswer(await w.route('takeBack', { sessionId: S.s1 }), ST.ok)
    assert.equal(w.handover.calls.takeBack.length, 1)
    assert.equal(w.handover.calls.takeBack[0][0], S.s1)
    assert.equal(w.handover.calls.takeBack[0][1], undefined, 'an omitted note must be passed as omitted')
    assert.deepEqual(answer, { ok: true, state: w.snapshot() })
    assert.deepEqual(answer.state.marks, [])
  })
  row(sdk, id2, 'A1', 'a note is passed to takeBack as given', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ managed: [{ sessionId: S.s1, principal: P }] })
    await jsonAnswer(await w.route('takeBack', { sessionId: S.s1, note: FIXTURE.note }), ST.ok)
    assert.deepEqual(w.handover.calls.takeBack, [[S.s1, FIXTURE.note]])
  })
  row(sdk, id2, 'E1', 'a K3 refusal → 409 {ok: false, code, state}; nothing changes', async (t) => {
    const w = await unit(t, sdk)
    const before = w.snapshot()
    w.handover.script.takeBack = { ok: false, code: K3.takeBackCodes.at(-1) }
    const answer = await jsonAnswer(await w.route('takeBack', { sessionId: S.s2 }), ST.refused)
    assert.deepEqual(answer, { ok: false, code: K3.takeBackCodes.at(-1), state: before })
  })
  row(sdk, id2, 'E2', 'a body that is not the closed shape → 400; the service is not called', async (t) => {
    await assertInvalid(await unit(t, sdk), 'takeBack', { sessionId: S.s1, principalKey: P.key })
  })
  row(sdk, id2, 'E3', 'the service rejects → 500 operation-failed', async (t) => {
    const w = await unit(t, sdk)
    w.handover.script.takeBack = { rejects: new Error(FIXTURE.failure) }
    assert.deepEqual(await jsonAnswer(await w.route('takeBack', { sessionId: S.s1 }), ST.failed), { ok: false, code: CODE.operationFailed })
  })

  const id3 = 'UIB-UC-03'
  row(sdk, id3, 'main', 'notify {message} → {ok, data: {accepted}}; notice {message, important: false, count: 1}; the light is on', async (t) => {
    const w = await unit(t, sdk)
    assert.equal(noticeOf(w), null)
    assert.deepEqual(await w.notify({ message: FIXTURE.message }), ACCEPTED)
    assert.deepEqual(noticeOf(w), { message: FIXTURE.message, important: false, count: EXPECT.firstNotice })
    assert.deepEqual(w.snapshot().light, EXPECT.light.on)
  })
  row(sdk, id3, 'A1', 'important: true → the notice and the light are important', async (t) => {
    const w = await unit(t, sdk)
    await w.notify({ message: FIXTURE.message, important: true })
    assert.equal(noticeOf(w).important, true)
    assert.deepEqual(w.snapshot().light, EXPECT.light.important)
  })
  row(sdk, id3, 'A2', 'a newer notice replaces the message; the count shows 2', async (t) => {
    const w = await unit(t, sdk)
    await w.notify({ message: FIXTURE.message })
    await w.notify({ message: FIXTURE.message2 })
    assert.deepEqual(noticeOf(w), { message: FIXTURE.message2, important: false, count: EXPECT.secondNotice })
  })
  row(sdk, id3, 'A3', 'dismiss → 200 {ok, state}; notice null; the latch untouched', async (t) => {
    const w = await unit(t, sdk)
    await w.signal(true)
    await w.notify({ message: FIXTURE.message })
    const answer = await jsonAnswer(await w.route('dismiss'), ST.ok)
    assert.deepEqual(answer, { ok: true, state: w.snapshot() })
    assert.equal(answer.state.notice, null)
    assert.deepEqual(answer.state.attention, EXPECT.latch.setImportant)
  })
  row(sdk, id3, 'A4', 'opened → 200 {ok, state}; the notice and the latch are cleared; the light is off', async (t) => {
    const w = await unit(t, sdk)
    await w.signal(true)
    await w.notify({ message: FIXTURE.message, important: true })
    const answer = await jsonAnswer(await w.route('opened'), ST.ok)
    assert.deepEqual(answer, { ok: true, state: w.snapshot() })
    assert.equal(answer.state.notice, null)
    assert.deepEqual(answer.state.attention, EXPECT.latch.clear)
    assert.deepEqual(answer.state.light, EXPECT.light.off)
  })
  row(sdk, id3, 'E1', 'a message empty after trim → message-empty; nothing changes', async (t) => {
    const w = await unit(t, sdk)
    await assertToolRefused(w, () => w.notify({ message: FIXTURE.trimmable }), CODE.messageEmpty)
  })
  row(sdk, id3, 'E2', `over ${SURFACE.maxMessageChars} code points → limit-exceeded; nothing changes`, async (t) => {
    const w = await unit(t, sdk)
    await w.notify({ message: FIXTURE.message })
    await assertToolRefused(w, () => w.notify({ message: message(SURFACE.maxMessageChars + EXPECT.oneChar) }), CODE.limitExceeded)
  })

  const id4 = 'UIB-UC-04'
  row(sdk, id4, 'main', 'signal {important} → {ok, data: {accepted}}; state reads {count: 1, important} and changes nothing', async (t) => {
    const w = await unit(t, sdk)
    assert.deepEqual(await w.state(), { ok: true, data: EXPECT.latch.clear })
    assert.deepEqual(await w.signal(false), ACCEPTED)
    const before = w.snapshot()
    assert.deepEqual(await w.state(), { ok: true, data: EXPECT.latch.set })
    assert.deepEqual(w.snapshot(), before, 'attention.state changed the state')
  })
  row(sdk, id4, 'A1', 'the window opens → the latch is cleared', async (t) => {
    const w = await unit(t, sdk)
    await w.signal(true)
    await jsonAnswer(await w.route('opened'), ST.ok)
    assert.deepEqual(await w.state(), { ok: true, data: EXPECT.latch.clear })
  })
  row(sdk, id4, 'A2', 'the contribution ends → the latch is reset', async (t) => {
    const w = await unit(t, sdk)
    await w.signal(true)
    w.dispose()
    assert.deepEqual(latchOf(w), EXPECT.latch.clear)
  })
  // Re-baselined by C-WIRE-2 (q5): no designated principal; a connection loss resets nothing.
  row(sdk, id4, 'A3', 'a connected principal goes offline → the latch is kept (it resets only on open and unload)', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(D, { online: true })] })
    await w.signal(true)
    w.handover.patch(D.key, { online: false })
    await quiet()
    assert.deepEqual(latchOf(w), EXPECT.latch.setImportant)
  })

  const id5 = 'UIB-UC-05'
  row(sdk, id5, 'main', 'events → 200 text/event-stream; the first frame is the snapshot; a change sends the new one', async (t) => {
    const w = await unit(t, sdk)
    const { response, sse } = await w.stream()
    assert.equal(response.status, ST.ok)
    assert.ok(response.headers.get('content-type')?.startsWith(SURFACE.headers.eventStream), 'content-type ' + response.headers.get('content-type'))
    assert.deepEqual(await sse.next(), w.snapshot())
    w.handover.set({ principals: [principalRow(P, { online: true })], managed: [{ sessionId: S.s1, principal: P }] })
    const frame = await sse.next()
    assert.deepEqual(frame, w.snapshot())
    assert.deepEqual(frame.marks, [{ sessionId: S.s1, principal: ref(P) }])
    assert.deepEqual(frame.targets, [target(principalRow(P, { online: true }))])
  })
  row(sdk, id5, 'E1', 'aborting the request ends its stream', async (t) => {
    const w = await unit(t, sdk)
    const abort = new AbortController()
    const { sse } = await w.stream(abort.signal)
    await sse.next()
    abort.abort()
    assert.ok(await sse.ended(), 'the stream did not end after its request was aborted')
  })
  row(sdk, id5, 'E2', 'close() ends every open stream', async (t) => {
    const w = await unit(t, sdk)
    const a = await w.stream()
    const b = await w.stream()
    await a.sse.next()
    await b.sse.next()
    w.backend.close()
    assert.ok(await a.sse.ended(), 'stream 1 did not end on close()')
    assert.ok(await b.sse.ended(), 'stream 2 did not end on close()')
  })
}

function partitions(sdk) {
  // UIB-EP-01: the targets filter (R-UI-10); one principal row per partition.
  const ep1 = [
    ['1', 'enabled, paired, online → listed, online', P, { online: true }, true],
    ['2', 'enabled, paired, offline → listed, offline', P, {}, true],
    ['3', 'disabled → not listed', X, { enabled: false, online: true }, false],
    ['4', 'not paired → not listed', U, { paired: false }, false],
    ['5', 'disabled and not paired → not listed', U, { paired: false, enabled: false }, false],
    ['6', 'nameless → listed with name null', Q, {}, true],
    ['7', 'any principal (no designated role since C-WIRE-2, q5) → listed like any', D, { online: true }, true],
  ]
  for (const [part, title, p, over, listed] of ep1) {
    row(sdk, 'UIB-EP-01', part, title, async (t) => {
      const w = await unit(t, sdk)
      const r = principalRow(p, over)
      w.handover.set({ principals: [r] })
      assert.deepEqual(w.snapshot().targets, listed ? [target(r)] : [])
    })
  }
  row(sdk, 'UIB-EP-01', '8', 'order = principals() order, the filtered rows skipped', async (t) => {
    const w = await unit(t, sdk)
    const rows = [principalRow(Q), principalRow(X, { enabled: false }), principalRow(D, { online: true }), principalRow(U, { paired: false }), principalRow(P)]
    w.handover.set({ principals: rows })
    assert.deepEqual(w.snapshot().targets, [rows[0], rows[2], rows[4]].map(target))
  })

  // UIB-EP-02: the handOver body.
  const valid = { sessionId: S.s1, principalKey: P.key }
  const ep2Invalid = [
    ['3', 'not JSON', FIXTURE.notJson],
    ['4', 'JSON but not an object (an array)', json([S.s1, P.key])],
    ['5', 'sessionId missing', { principalKey: P.key }],
    ['6', 'principalKey missing', { sessionId: S.s1 }],
    ['7', 'sessionId not a string', { ...valid, sessionId: FIXTURE.wrongType }],
    ['8', 'principalKey not a string', { ...valid, principalKey: FIXTURE.wrongType }],
    ['9', 'note not a string', { ...valid, note: FIXTURE.wrongType }],
    ['10', 'an extra key', { ...valid, [FIXTURE.extraKey]: FIXTURE.marker }],
    ['11', 'an empty body', ''],
    ['11b', 'JSON null', json(null)],
  ]
  row(sdk, 'UIB-EP-02', '1', 'valid without note → 200, the service called once', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(P)] })
    await jsonAnswer(await w.route('handOver', valid), ST.ok)
    assert.equal(w.handover.calls.handOver.length, 1)
  })
  row(sdk, 'UIB-EP-02', '2', 'valid with note → 200, the note passed', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(P)] })
    await jsonAnswer(await w.route('handOver', { ...valid, note: FIXTURE.note }), ST.ok)
    assert.equal(w.handover.calls.handOver[0][EXPECT.noteArg], FIXTURE.note)
  })
  for (const [part, title, body] of ep2Invalid) {
    row(sdk, 'UIB-EP-02', part, `${title} → 400 invalid-request; the service is not called`, async (t) => assertInvalid(await unit(t, sdk), 'handOver', body))
  }
  for (const [part, field] of [['12', 'sessionId'], ['12b', 'principalKey']]) {
    row(sdk, 'UIB-EP-02', part, `an empty-string ${field} is a valid body: passed unchanged; the service's refusal → 409 (${DECIDED.emptyIds})`, async (t) => {
      const w = await unit(t, sdk)
      const body = { ...valid, [field]: '' }
      const code = K3.handOverCodes[0]
      w.handover.script.handOver = { ok: false, code }
      const answer = await jsonAnswer(await w.route('handOver', body), ST.refused)
      assert.deepEqual(w.handover.calls.handOver.map((a) => a.slice(0, EXPECT.noteArg)), [[body.sessionId, body.principalKey]])
      assert.equal(answer.code, code)
    })
  }
  row(sdk, 'UIB-EP-03', '9', `an empty-string sessionId is passed to takeBack unchanged (${DECIDED.emptyIds})`, async (t) => {
    const w = await unit(t, sdk)
    w.handover.script.takeBack = { ok: false, code: K3.takeBackCodes[0] }
    await jsonAnswer(await w.route('takeBack', { sessionId: '' }), ST.refused)
    assert.equal(w.handover.calls.takeBack[0][0], '')
  })

  // UIB-EP-03: the takeBack body.
  const ep3Invalid = [
    ['3', 'not JSON', FIXTURE.notJson],
    ['4', 'JSON but not an object (a string)', json(S.s1)],
    ['5', 'sessionId missing', {}],
    ['6', 'sessionId not a string', { sessionId: FIXTURE.wrongType }],
    ['7', 'note not a string', { sessionId: S.s1, note: FIXTURE.wrongType }],
    ['8', 'an extra key (principalKey)', { sessionId: S.s1, principalKey: P.key }],
    ['8b', 'an extra key (other)', { sessionId: S.s1, [FIXTURE.extraKey]: FIXTURE.marker }],
  ]
  row(sdk, 'UIB-EP-03', '1', 'valid → 200, takeBack called once', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ managed: [{ sessionId: S.s1, principal: P }] })
    await jsonAnswer(await w.route('takeBack', { sessionId: S.s1 }), ST.ok)
    assert.equal(w.handover.calls.takeBack.length, 1)
  })
  row(sdk, 'UIB-EP-03', '2', 'valid with note → 200, the note passed', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ managed: [{ sessionId: S.s1, principal: P }] })
    await jsonAnswer(await w.route('takeBack', { sessionId: S.s1, note: FIXTURE.note }), ST.ok)
    assert.deepEqual(w.handover.calls.takeBack, [[S.s1, FIXTURE.note]])
  })
  for (const [part, title, body] of ep3Invalid) {
    row(sdk, 'UIB-EP-03', part, `${title} → 400 invalid-request; the service is not called`, async (t) => assertInvalid(await unit(t, sdk), 'takeBack', body))
  }

  // UIB-EP-06: the surface.
  row(sdk, 'UIB-EP-06', '1', 'the service is frozen with exactly apiVersion 1, routes = UI_ROUTE (frozen, the six paths) and contribute', async (t) => {
    const { mod, backend } = await unitBackend(t, sdk)
    const { service } = backend
    assert.ok(Object.isFrozen(service), 'the service is not frozen')
    assertKeys(service, ['apiVersion', 'contribute', 'routes'])
    assert.equal(service.apiVersion, SURFACE.apiVersion)
    assert.equal(service.routes, mod.UI_ROUTE)
    assert.ok(Object.isFrozen(mod.UI_ROUTE), 'UI_ROUTE is not frozen')
    assert.deepEqual({ ...mod.UI_ROUTE }, Object.fromEntries(Object.entries(SURFACE.routes).map(([k, [, p]]) => [k, p])))
    assert.equal(mod.UI_SERVICE.name, SURFACE.serviceName)
    assert.equal(mod.NOTIFY.maxChars, SURFACE.maxMessageChars)
  })
  row(sdk, 'UIB-EP-06', '2', 'provide: the service as dshConnectorUi and the six routes (methods, buffered), each inside an effect', async (t) => {
    const { backend } = await unitBackend(t, sdk)
    const ctx = new FakeCtx()
    backend.provide(ctx)
    t.after(() => ctx.dispose())
    assert.equal(ctx.provided.length, 1)
    assert.equal(ctx.provided[0].name, SURFACE.serviceName)
    assert.equal(ctx.provided[0].value, backend.service)
    assert.ok(ctx.provided[0].inEffect, 'provide ran outside an effect')
    assert.equal(ctx.routes.length, Object.keys(SURFACE.routes).length)
    for (const [key, [method, routePath]] of Object.entries(SURFACE.routes)) {
      const r = ctx.route(key)
      assert.deepEqual([...r.methods], [method], routePath + ' methods')
      assert.equal(r.requestBody, SURFACE.requestBody)
      assert.equal(typeof r.fetch, 'function')
      assert.ok(ctx.routes.find((x) => x.route === r).inEffect, routePath + ' registered outside an effect')
    }
  })
  row(sdk, 'UIB-EP-06', '3', 'contribute: three valid K2 tools, closed schemas; notify declares message-empty', async (t) => {
    const w = await unit(t, sdk)
    assert.equal(w.tools.defs.length, EXPECT.toolCount)
    assert.deepEqual(w.tools.defs.map((d) => d.name).sort(), Object.values(TOOL).sort())
    for (const def of w.tools.defs) {
      K2.defineTool(def)
      assert.equal(def.inputSchema.type, SURFACE.schema.object)
      assert.equal(def.inputSchema.additionalProperties, false, def.name + ' input schema is not closed')
    }
    const notify = w.tools.byName(TOOL.notify).inputSchema
    assert.equal(notify.properties.message.type, SURFACE.schema.string)
    assert.equal(notify.properties.important.type, SURFACE.schema.boolean)
    assert.deepEqual(notify.required, ['message'])
    assert.ok(w.tools.byName(TOOL.notify).codes?.includes(CODE.messageEmpty), 'notify does not declare message-empty')
    const signal = w.tools.byName(TOOL.signal).inputSchema
    assert.equal(signal.properties.important.type, SURFACE.schema.boolean)
    assert.deepEqual(signal.required, ['important'])
    assert.deepEqual(Object.keys(w.tools.byName(TOOL.state).inputSchema.properties ?? {}), [])
  })
  row(sdk, 'UIB-EP-06', '4', 'no card and no inline-record surface (Q-U2, Q-G4): only the six routes and the five snapshot parts', async (t) => {
    const w = await unit(t, sdk)
    assert.deepEqual(Object.keys(w.backend.service.routes).sort(), Object.keys(SURFACE.routes).sort())
    assertKeys(w.snapshot(), SURFACE.snapshotKeys)
  })
  row(sdk, 'UIB-EP-06', '5', 'the snapshot shape: marks, targets, attention, notice, light with their keys', async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(P)], managed: [{ sessionId: S.s1, principal: P }] })
    await w.notify({ message: FIXTURE.message })
    const s = w.snapshot()
    assertKeys(s, SURFACE.snapshotKeys)
    assertKeys(s.marks[0], ['principal', 'sessionId'])
    assertKeys(s.marks[0].principal, SURFACE.refKeys)
    assertKeys(s.targets[0], SURFACE.targetKeys)
    assertKeys(s.attention, ['count', 'important'])
    assertKeys(s.notice, SURFACE.noticeKeys)
    assertKeys(s.light, ['important', 'on'])
  })
  row(sdk, 'UIB-EP-06', '6', 'marks = managed() in its order, names as managed() gives them', async (t) => {
    const w = await unit(t, sdk)
    const managed = [{ sessionId: S.s2, principal: Q }, { sessionId: S.s1, principal: P }, { sessionId: S.s3, principal: { ...P, name: FIXTURE.renamed } }]
    w.handover.set({ managed })
    assert.deepEqual(w.snapshot().marks, managed.map((m) => ({ sessionId: m.sessionId, principal: ref(m.principal) })))
  })

  // UIB-EP-07: ignored bodies.
  for (const [part, key] of [['1', 'dismiss'], ['2', 'opened']]) {
    row(sdk, 'UIB-EP-07', part, `${key} with a body that is not JSON → 200 (the body is ignored)`, async (t) => {
      const w = await unit(t, sdk)
      const answer = await jsonAnswer(await w.route(key, FIXTURE.notJson), ST.ok)
      assert.deepEqual(answer, { ok: true, state: w.snapshot() })
    })
  }
}

function boundaries(sdk) {
  const id = 'UIB-BVA-01'
  const max = SURFACE.maxMessageChars
  const accepted = [
    ['3', '1 code point', message(1), message(1)],
    ['4', '1 code point inside whitespace → trimmed', FIXTURE.trimmable + message(1) + FIXTURE.trimmable, message(1)],
    ['5', `exactly ${max} code points`, message(max), message(max)],
    ['7', `exactly ${max} astral code points (${max * 2} UTF-16 units)`, message(max, FIXTURE.astral), message(max, FIXTURE.astral)],
    ['10', `${max} code points inside whitespace (whitespace not counted)`, FIXTURE.trimmable + message(max) + FIXTURE.trimmable, message(max)],
  ]
  const refused = [
    ['1', '0 code points', '', CODE.messageEmpty],
    ['2', 'whitespace only', FIXTURE.trimmable, CODE.messageEmpty],
    ['6', `${max + 1} code points`, message(max + 1), CODE.limitExceeded],
    ['8', `${max + 1} astral code points`, message(max + 1, FIXTURE.astral), CODE.limitExceeded],
    ['9', `${max - 1} + 1 astral = ${max} code points but ${max + 1} UTF-16 units → accepted`, null, null],
  ]
  for (const [part, title, input, stored] of accepted) {
    row(sdk, id, part, `${title} → accepted, the stored message is the trimmed text`, async (t) => {
      const w = await unit(t, sdk)
      assert.deepEqual(await w.notify({ message: input }), ACCEPTED)
      assert.equal(noticeOf(w).message, stored)
    })
  }
  for (const [part, title, input, code] of refused.filter((r) => r[2] !== null)) {
    row(sdk, id, part, `${title} → ${code}; nothing changes`, async (t) => {
      const w = await unit(t, sdk)
      await assertToolRefused(w, () => w.notify({ message: input }), code)
    })
  }
  row(sdk, id, '9', refused.at(-1)[1], async (t) => {
    const w = await unit(t, sdk)
    const input = message(max - 1) + FIXTURE.astral
    assert.deepEqual(await w.notify({ message: input }), ACCEPTED)
    assert.equal(noticeOf(w).message, input)
  })

  const id2 = 'UIB-BVA-02'
  const limit = SURFACE.maxBodyBytes
  row(sdk, id2, '1', `a handOver body of exactly ${limit} ASCII bytes → accepted (the service called)`, async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(P)] })
    await jsonAnswer(await w.route('handOver', handOverBodyOf(limit, false)), ST.ok)
    assert.equal(w.handover.calls.handOver.length, 1)
  })
  row(sdk, id2, '2', `${limit + 1} ASCII bytes → 400 invalid-request`, async (t) => {
    await assertInvalid(await unit(t, sdk), 'handOver', handOverBodyOf(limit + EXPECT.oneByte, false))
  })
  row(sdk, id2, '3', `exactly ${limit} UTF-8 bytes of mostly three-byte characters → accepted`, async (t) => {
    const w = await unit(t, sdk)
    w.handover.set({ principals: [principalRow(P)] })
    await jsonAnswer(await w.route('handOver', handOverBodyOf(limit, true)), ST.ok)
    assert.equal(w.handover.calls.handOver.length, 1)
  })
  row(sdk, id2, '4', `${limit + 1} UTF-8 bytes in far fewer than ${limit} UTF-16 units → 400 (bytes are counted, not characters)`, async (t) => {
    const body = handOverBodyOf(limit + EXPECT.oneByte, true)
    assert.ok(body.length < limit, 'harness: the body is not short in UTF-16 units')
    await assertInvalid(await unit(t, sdk), 'handOver', body)
  })
  row(sdk, id2, '5', `a takeBack body of ${limit + 1} bytes → 400`, async (t) => {
    const room = limit + EXPECT.oneByte - Buffer.byteLength(json({ sessionId: S.s1, note: '' }))
    await assertInvalid(await unit(t, sdk), 'takeBack', json({ sessionId: S.s1, note: FIXTURE.padChar.repeat(room) }))
  })
  for (const [part, key] of [['6', 'dismiss'], ['6b', 'opened']]) {
    row(sdk, id2, part, `${key} with a body of ${limit + 1} bytes → 200 (${DECIDED.ignoredBodyLimit})`, async (t) => {
      const w = await unit(t, sdk)
      await w.notify({ message: FIXTURE.message })
      const answer = await jsonAnswer(await w.route(key, handOverBodyOf(limit + EXPECT.oneByte, false)), ST.ok)
      assert.deepEqual(answer, { ok: true, state: w.snapshot() })
      assert.equal(answer.state.notice, null)
    })
  }

  const id3 = 'UIB-BVA-03'
  for (const [part, n] of [['0', EXPECT.noTargets], ['1', EXPECT.oneTarget], ['2', EXPECT.twoTargets]]) {
    row(sdk, id3, part, `${n} enabled, paired principal(s) (beside a disabled and an unpaired one) → ${n} target(s)`, async (t) => {
      const w = await unit(t, sdk)
      const eligible = [principalRow(P), principalRow(Q, { online: true })].slice(0, n)
      w.handover.set({ principals: [principalRow(X, { enabled: false }), ...eligible, principalRow(U, { paired: false })] })
      assert.deepEqual(w.snapshot().targets, eligible.map(target))
    })
  }

  const id4 = 'UIB-BVA-04'
  row(sdk, id4, '1', 'the first notice → count 1', async (t) => {
    const w = await unit(t, sdk)
    await w.notify({ message: FIXTURE.message })
    assert.equal(noticeOf(w).count, EXPECT.firstNotice)
  })
  row(sdk, id4, '2', 'the second → count 2', async (t) => {
    const w = await unit(t, sdk)
    await w.notify({ message: FIXTURE.message })
    await w.notify({ message: FIXTURE.message2 })
    assert.equal(noticeOf(w).count, EXPECT.secondNotice)
  })
  row(sdk, id4, '3', 'a notice after a dismiss → count 1 again', async (t) => {
    const w = await unit(t, sdk)
    await w.notify({ message: FIXTURE.message })
    await w.notify({ message: FIXTURE.message })
    await jsonAnswer(await w.route('dismiss'), ST.ok)
    await w.notify({ message: FIXTURE.message2 })
    assert.equal(noticeOf(w).count, EXPECT.firstNotice)
  })
  row(sdk, id4, '4', 'a notice after the window opened → count 1 again', async (t) => {
    const w = await unit(t, sdk)
    await w.notify({ message: FIXTURE.message })
    await w.notify({ message: FIXTURE.message })
    await jsonAnswer(await w.route('opened'), ST.ok)
    await w.notify({ message: FIXTURE.message2 })
    assert.equal(noticeOf(w).count, EXPECT.firstNotice)
  })
}

function decisions(sdk) {
  // UIB-DT-01: the light. [rule, signal (undefined: none), notice important (undefined: none), light]
  const dt1 = [
    ['1', undefined, undefined, EXPECT.light.off],
    ['2', false, undefined, EXPECT.light.on],
    ['3', true, undefined, EXPECT.light.important],
    ['4', undefined, false, EXPECT.light.on],
    ['5', undefined, true, EXPECT.light.important],
    ['6', false, false, EXPECT.light.on],
    ['7', false, true, EXPECT.light.important],
    ['8', true, false, EXPECT.light.important],
  ]
  for (const [rule, signal, notice, light] of dt1) {
    row(sdk, 'UIB-DT-01', 'rule ' + rule, `latch ${signal === undefined ? 'clear' : 'important ' + signal}, notice ${notice === undefined ? 'none' : 'important ' + notice} → light ${json(light)}`, async (t) => {
      const w = await unit(t, sdk)
      if (signal !== undefined) await w.signal(signal)
      if (notice !== undefined) await w.notify({ message: FIXTURE.message, important: notice })
      assert.deepEqual(w.snapshot().light, light)
    })
  }

  // UIB-DT-02: latch reset on the designated principal's connection loss. Re-baselined by C-WIRE-2 (q5,
  // "Remove agentToken entirely"): no designated principal exists, so no principals() change resets
  // the latch; the rules about the designation itself are withdrawn.
  const dOn = principalRow(D, { online: true })
  const dOff = principalRow(D)
  const pOn = principalRow(P, { online: true })
  const dt2 = [
    ['1', 'D online → offline', [dOn], [dOff]],
    ['2', 'D offline; another principal renamed', [dOff, principalRow(P)], [dOff, principalRow(P, { name: FIXTURE.renamed })]],
    ['3', 'D offline → online', [dOff], [dOn]],
    ['7', 'D online; another online principal goes offline', [dOn, pOn], [dOn, principalRow(P)]],
    ['8', 'D online; D renamed', [dOn], [{ ...dOn, name: FIXTURE.renamed }]],
    ['9', 'an online principal goes offline', [pOn], [principalRow(P)]],
    ['10', 'D online; its entry deleted (its row leaves principals())', [dOn, principalRow(P)], [principalRow(P)]],
    ['11', 'D online; its entry disabled, still online', [dOn, principalRow(P)], [{ ...dOn, enabled: false }, principalRow(P)]],
  ]
  for (const [rule, title, before, after] of dt2) {
    row(sdk, 'UIB-DT-02', 'rule ' + rule, `${title} → latch and notice kept (C-WIRE-2, q5)`, async (t) => {
      const w = await unit(t, sdk)
      w.handover.set({ principals: before })
      await w.signal(true)
      await w.notify({ message: FIXTURE.message })
      const notice = noticeOf(w)
      w.handover.set({ principals: after })
      await quiet()
      assert.deepEqual(latchOf(w), EXPECT.latch.setImportant)
      assert.deepEqual(noticeOf(w), notice)
    })
  }
  for (const [rule, title] of [['4', 'the designation moves to online P'], ['5', 'no principal designated any more'], ['6', 'D offline; the designation moves to online P']]) withdrawnRow(sdk, 'UIB-DT-02', 'rule ' + rule, title)

  // UIB-DT-03: the hand-over routes.
  const routes = [
    ['handOver', { sessionId: S.s1, principalKey: P.key }, K3.handOverCodes],
    ['takeBack', { sessionId: S.s1 }, K3.takeBackCodes],
  ]
  for (const [key, body, codes] of routes) {
    row(sdk, 'UIB-DT-03', `rule 1 ${key}`, `${key}: valid body, service ok → 200 with exactly the relayed keys`, async (t) => {
      const w = await unit(t, sdk)
      w.handover.set({ principals: [principalRow(P)], managed: key === 'takeBack' ? [{ sessionId: S.s1, principal: P }] : [] })
      const answer = await jsonAnswer(await w.route(key, body), ST.ok)
      assertKeys(answer, key === 'handOver' ? ['ok', 'principal', 'state'] : ['ok', 'state'])
      assert.equal(answer.ok, true)
      assert.deepEqual(answer.state, w.snapshot())
    })
    for (const code of codes) {
      row(sdk, 'UIB-DT-03', `rule 2 ${key} ${code}`, `${key}: service refuses ${code} → 409 {ok: false, code, state}; the snapshot unchanged`, async (t) => {
        const w = await unit(t, sdk)
        w.handover.set({ principals: [principalRow(P)] })
        const before = w.snapshot()
        w.handover.script[key] = { ok: false, code }
        assert.deepEqual(await jsonAnswer(await w.route(key, body), ST.refused), { ok: false, code, state: before })
        assert.deepEqual(w.snapshot(), before)
      })
    }
    row(sdk, 'UIB-DT-03', `rule 3 ${key}`, `${key}: invalid body → 400 exactly; not called`, async (t) => assertInvalid(await unit(t, sdk), key, { ...body, [FIXTURE.extraKey]: true }))
    for (const [rule, how, script] of [['4', 'throws', { throws: new Error(FIXTURE.failure) }], ['5', 'rejects', { rejects: new Error(FIXTURE.failure) }]]) {
      row(sdk, 'UIB-DT-03', `rule ${rule} ${key}`, `${key}: the service ${how} → 500 {ok: false, code: operation-failed} exactly`, async (t) => {
        const w = await unit(t, sdk)
        w.handover.script[key] = script
        const answer = await jsonAnswer(await w.route(key, body), ST.failed)
        assert.deepEqual(answer, { ok: false, code: CODE.operationFailed })
        assert.ok(!json(answer).includes(FIXTURE.failure), 'the error leaked')
      })
    }
  }

  // UIB-DT-04: what each action clears. Precondition: latch hot, a notice pending.
  const dt4 = [
    ['1', 'dismiss', (w) => w.route('dismiss'), true, false],
    ['2', 'opened', (w) => w.route('opened'), false, false],
    ['3', 'the contribution ends', (w) => w.dispose(), false, false],
    ['4', 'a refused notify', (w) => w.notify({ message: '' }), true, true],
    ['5', 'attention.state', (w) => w.state(), true, true],
  ]
  for (const [rule, title, act, keepsLatch, keepsNotice] of dt4) {
    row(sdk, 'UIB-DT-04', 'rule ' + rule, `${title} → latch ${keepsLatch ? 'kept' : 'cleared'}, notice ${keepsNotice ? 'kept' : 'cleared'}`, async (t) => {
      const w = await unit(t, sdk)
      await w.signal(true)
      await w.notify({ message: FIXTURE.message })
      const notice = noticeOf(w)
      await act(w)
      assert.deepEqual(latchOf(w), keepsLatch ? EXPECT.latch.setImportant : EXPECT.latch.clear)
      assert.deepEqual(noticeOf(w), keepsNotice ? notice : null)
    })
  }
}

function transitions(sdk) {
  // UIB-ST-01: the latch. Each row reaches `from` then fires the event.
  const to = { clear: EXPECT.latch.clear, set: EXPECT.latch.set, hot: EXPECT.latch.setImportant }
  const reach = { clear: async () => {}, set: (w) => w.signal(false), hot: (w) => w.signal(true) }
  // Re-baselined by C-WIRE-2 (q5): a principal's connection loss is no latch event any more.
  const principalLoss = async (w) => {
    w.handover.patch(D.key, { online: false })
    await quiet()
  }
  const st1 = [
    ['1', 'clear', 'signal(false)', (w) => w.signal(false), 'set'],
    ['2', 'clear', 'signal(true)', (w) => w.signal(true), 'hot'],
    ['3', 'set', 'signal(false)', (w) => w.signal(false), 'set'],
    ['4', 'set', 'signal(true)', (w) => w.signal(true), 'hot'],
    ['5', 'hot', 'signal(false) (important stays)', (w) => w.signal(false), 'hot'],
    ['6', 'hot', 'opened', (w) => w.route('opened'), 'clear'],
    ['7', 'set', 'a principal\'s connection loss (C-WIRE-2, q5)', principalLoss, 'set'],
    ['8', 'hot', 'contribution end', (w) => w.dispose(), 'clear'],
    ['9', 'set', 'dismiss', (w) => w.route('dismiss'), 'set'],
    ['10', 'clear', 'opened', (w) => w.route('opened'), 'clear'],
  ]
  for (const [n, from, event, act, end] of st1) {
    row(sdk, 'UIB-ST-01', '#' + n, `${from} --${event}--> ${end}`, async (t) => {
      const w = await unit(t, sdk)
      w.handover.set({ principals: [principalRow(D, { online: true })] })
      await reach[from](w)
      assert.deepEqual(latchOf(w), to[from], 'harness: not in ' + from)
      await act(w)
      assert.deepEqual(latchOf(w), to[end])
    })
  }
  row(sdk, 'UIB-ST-01', '#11', 'a signal after a reset sets the latch again (no replay, a fresh signal counts)', async (t) => {
    const w = await unit(t, sdk)
    await w.signal(true)
    await w.route('opened')
    await w.signal(false)
    assert.deepEqual(latchOf(w), EXPECT.latch.set)
  })

  // UIB-ST-02: the notice.
  const n1 = { message: FIXTURE.message, important: true }
  const st2 = [
    ['1', 'None --notify--> Pending(1)', async () => {}, (w) => w.notify({ message: FIXTURE.message }), { message: FIXTURE.message, important: false, count: EXPECT.firstNotice }],
    ['2', 'Pending(1) --notify (not important)--> Pending(2), message and important replaced', (w) => w.notify(n1), (w) => w.notify({ message: FIXTURE.message2 }), { message: FIXTURE.message2, important: false, count: EXPECT.secondNotice }],
    ['3', 'Pending --dismiss--> None', (w) => w.notify(n1), (w) => w.route('dismiss'), null],
    ['4', 'Pending --opened--> None', (w) => w.notify(n1), (w) => w.route('opened'), null],
    ['5', 'Pending --contribution end--> None', (w) => w.notify(n1), (w) => w.dispose(), null],
    ['6', 'Pending(1) --refused notify--> Pending(1) unchanged', (w) => w.notify(n1), (w) => w.notify({ message: message(SURFACE.maxMessageChars + EXPECT.oneChar) }), { ...n1, count: EXPECT.firstNotice }],
    ['7', 'None --dismiss--> None', async () => {}, (w) => w.route('dismiss'), null],
    ['8', 'None (after a dismiss) --notify--> Pending(1)', async (w) => { await w.notify(n1); await w.route('dismiss') }, (w) => w.notify({ message: FIXTURE.message2 }), { message: FIXTURE.message2, important: false, count: EXPECT.firstNotice }],
  ]
  for (const [n, title, setup, act, end] of st2) {
    row(sdk, 'UIB-ST-02', '#' + n, title, async (t) => {
      const w = await unit(t, sdk)
      await setup(w)
      const answer = await act(w)
      if (answer instanceof Response) assert.equal(answer.status, ST.ok)
      assert.deepEqual(noticeOf(w), end)
    })
  }

  // UIB-ST-03: the backend lifecycle.
  const id = 'UIB-ST-03'
  row(sdk, id, '#1', 'provided --ctx disposal--> the service and every route disposed', async (t) => {
    const { backend } = await unitBackend(t, sdk)
    const ctx = new FakeCtx()
    backend.provide(ctx)
    ctx.dispose()
    const expected = ['provide:' + SURFACE.serviceName, ...Object.values(SURFACE.routes).map(([, p]) => 'route:' + p)]
    assert.deepEqual([...ctx.disposed].sort(), expected.sort())
  })
  row(sdk, id, '#2', 'provided --provide again--> throws', async (t) => {
    const { backend } = await unitBackend(t, sdk)
    const ctx = new FakeCtx()
    backend.provide(ctx)
    t.after(() => ctx.dispose())
    assert.throws(() => backend.provide(new FakeCtx()))
  })
  for (const [part, value] of [['#3', undefined], ['#3b', FIXTURE.marker]]) {
    row(sdk, id, part, `contribute(${json(value) ?? 'undefined'}) → TypeError`, async (t) => {
      const { backend } = await unitBackend(t, sdk)
      assert.throws(() => backend.service.contribute(value), TypeError)
    })
  }
  row(sdk, id, '#4', 'register throws on the second tool → the first registration disposed, the same error rethrown', async (t) => {
    const { backend } = await unitBackend(t, sdk)
    const capture = captureRegister({ throwAt: EXPECT.throwOnSecond })
    assert.throws(() => backend.service.contribute(capture.register), (error) => error?.message === FIXTURE.failure)
    assert.equal(capture.defs.length, EXPECT.throwOnSecond)
    assert.deepEqual(capture.disposals, [EXPECT.disposedOnce])
  })
  row(sdk, id, '#5', 'contributed --dispose, dispose--> each registration disposed exactly once', async (t) => {
    const w = await unit(t, sdk)
    w.dispose()
    w.dispose()
    assert.deepEqual(w.tools.disposals, Array(EXPECT.toolCount).fill(EXPECT.disposedOnce))
  })
  row(sdk, id, '#6', 'close: streams end, no hand-over listener is left, registrations disposed', async (t) => {
    const w = await unit(t, sdk)
    const { sse } = await w.stream()
    await sse.next()
    assert.deepEqual(w.tools.disposals, Array(EXPECT.toolCount).fill(EXPECT.notDisposed))
    w.backend.close()
    assert.ok(await sse.ended(), 'the stream did not end')
    assert.equal(w.handover.listeners.size, EXPECT.noListeners, 'close() left an onChange listener')
    assert.deepEqual(w.tools.disposals, Array(EXPECT.toolCount).fill(EXPECT.disposedOnce))
  })
  row(sdk, id, '#7', 'closed --close--> no throw; a later contribution dispose is still a no-op', async (t) => {
    const w = await unit(t, sdk)
    w.backend.close()
    w.backend.close()
    w.dispose()
    assert.deepEqual(w.tools.disposals, Array(EXPECT.toolCount).fill(EXPECT.disposedOnce))
  })
  row(sdk, id, '#8', `contributed --contribute again--> both registered; ending one resets latch and notice, the other's registrations stay (${DECIDED.secondContribute})`, async (t) => {
    const w = await unit(t, sdk)
    const second = captureRegister()
    const disposeSecond = w.backend.service.contribute(second.register)
    assert.equal(second.defs.length, EXPECT.toolCount)
    await w.signal(true)
    await w.notify({ message: FIXTURE.message })
    w.dispose()
    assert.deepEqual(latchOf(w), EXPECT.latch.clear)
    assert.equal(noticeOf(w), null)
    assert.deepEqual(second.disposals, Array(EXPECT.toolCount).fill(EXPECT.notDisposed), 'ending the first disposed the second')
    disposeSecond()
    assert.deepEqual(second.disposals, Array(EXPECT.toolCount).fill(EXPECT.disposedOnce))
  })

  // UIB-ST-04: the stream, one frame per change.
  const id4 = 'UIB-ST-04'
  const changes = [
    ['#2a', 'a hand-over onChange', (w) => w.handover.fire()],
    ['#2b', 'a signal (from a clear latch)', (w) => w.signal(false), true],
    ['#2c', 'a notify', (w) => w.notify({ message: FIXTURE.message })],
    ['#2d', 'a dismiss', (w) => w.route('dismiss')],
    ['#2e', 'an open', (w) => w.route('opened')],
    ['#2f', 'a contribution end', (w) => w.dispose()],
  ]
  row(sdk, id4, '#1', 'open → the first frame at once is the snapshot, then nothing without a change', async (t) => {
    const w = await unit(t, sdk)
    const { sse } = await w.stream()
    assert.deepEqual(await sse.next(), w.snapshot())
    await sse.quiet()
  })
  // Each change starts from a state it changes (a notice pending; the latch set, except for the
  // signal row, which starts clear), so a frame is owed whatever Q-UIB-7's answer is.
  for (const [n, title, act, latchClear] of changes) {
    row(sdk, id4, n, `${title} → exactly one frame, the new snapshot`, async (t) => {
      const w = await unit(t, sdk)
      if (!latchClear) await w.signal(true)
      await w.notify({ message: FIXTURE.message })
      const { sse } = await w.stream()
      await sse.next()
      await act(w)
      await sse.settle()
      const frames = sse.rest()
      assert.equal(frames.length, EXPECT.oneFrame, 'frames: ' + json(frames))
      assert.deepEqual(frames[0], w.snapshot())
    })
  }
  withdrawnRow(sdk, id4, '#2g', 'a latch reset by the designated loss → a frame showing the cleared latch')
  // Q-UIB-7: a change that leaves the snapshot as it was sends no frame; onChange always sends one.
  const noOps = [
    ['#2i', 'a signal on a set latch with the same importance', async (w) => w.signal(true), (w) => w.signal(true)],
    ['#2j', 'a dismiss with no notice', async () => {}, (w) => w.route('dismiss')],
    ['#2k', 'an open with latch and notice clear', async () => {}, (w) => w.route('opened')],
    ['#2l', 'a contribution end with latch and notice clear', async () => {}, (w) => w.dispose()],
  ]
  for (const [n, title, setup, act] of noOps) {
    row(sdk, id4, n, `${title} → no frame (${DECIDED.noOpFrame})`, async (t) => {
      const w = await unit(t, sdk)
      await setup(w)
      const { sse } = await w.stream()
      await sse.next()
      await act(w)
      await sse.quiet()
    })
  }
  row(sdk, id4, '#2m', `a hand-over onChange with nothing changed → still exactly one frame (${DECIDED.noOpFrame})`, async (t) => {
    const w = await unit(t, sdk)
    const { sse } = await w.stream()
    const first = await sse.next()
    w.handover.fire()
    await sse.settle()
    assert.deepEqual(sse.rest(), [first])
  })
  row(sdk, id4, '#2h', 'a refused notify → no frame', async (t) => {
    const w = await unit(t, sdk)
    const { sse } = await w.stream()
    await sse.next()
    await w.notify({ message: '' })
    await sse.quiet()
  })
  row(sdk, id4, '#5', 'two streams each get every change', async (t) => {
    const w = await unit(t, sdk)
    const a = await w.stream()
    const b = await w.stream()
    await a.sse.next()
    await b.sse.next()
    await w.signal(true)
    assert.deepEqual(await a.sse.next(), w.snapshot())
    assert.deepEqual(await b.sse.next(), w.snapshot())
  })
  row(sdk, id4, '#3', 'an aborted stream gets no more frames; the others go on', async (t) => {
    const w = await unit(t, sdk)
    const abort = new AbortController()
    const a = await w.stream(abort.signal)
    const b = await w.stream()
    await a.sse.next()
    await b.sse.next()
    abort.abort()
    assert.ok(await a.sse.ended(), 'the aborted stream did not end')
    await w.signal(false)
    assert.deepEqual(await b.sse.next(), w.snapshot())
  })
}

function contribution(sdk) {
  const id = 'UIB-UC-06'
  const structured = (result) => {
    assert.ok(result, 'the tool is unknown to the registry')
    return result.structuredContent
  }
  row(sdk, id, 'main', 'embed-UI loaded → tools/list holds the three public names (K2 namespaceOf / publicNameOf); calls reach the handlers with the C-EXT envelope', async (t) => {
    const w = await contribWorld(t, sdk)
    const names = Object.values(TOOL).map(w.publicName)
    for (const name of names) assert.ok(w.names().includes(name), name + ' is not listed: ' + json(w.names()))
    const notify = await w.call(TOOL.notify, { message: FIXTURE.trimmable + FIXTURE.message })
    assert.deepEqual(structured(notify), { accepted: true, ok: true })
    assert.equal(notify.isError, false)
    assert.deepEqual(w.backend.snapshot().notice, { message: FIXTURE.message, important: false, count: EXPECT.firstNotice })
    assert.deepEqual(structured(await w.call(TOOL.signal, { important: true })), { accepted: true, ok: true })
    assert.deepEqual(structured(await w.call(TOOL.state, {})), { ...EXPECT.latch.setImportant, ok: true })
  }, undefined, TR)
  row(sdk, id, 'A1', 'embed-UI unloads → the three are gone, latch and notice reset (Q-N3); reload → listed again', async (t) => {
    const w = await contribWorld(t, sdk)
    await w.call(TOOL.signal, { important: true })
    await w.call(TOOL.notify, { message: FIXTURE.message })
    await w.disableEmbed()
    const names = Object.values(TOOL).map(w.publicName)
    await eventually(() => names.every((n) => !w.names().includes(n)), 'the UI tools leave tools/list')
    assert.deepEqual(w.backend.snapshot().attention, EXPECT.latch.clear)
    assert.equal(w.backend.snapshot().notice, null)
    await w.enableEmbed()
    await eventually(() => names.every((n) => w.names().includes(n)), 'the UI tools are listed again')
  }, undefined, TR)
  row(sdk, id, 'E1', 'no dsh-connector-ui loaded → none of the three is listed (no notify tool)', async (t) => {
    const w = await contribWorld(t, sdk, { embed: false })
    for (const local of Object.values(TOOL)) assert.ok(!w.names().includes(w.publicName(local)), local + ' is listed without embed-UI')
    assert.equal(await w.call(TOOL.notify, { message: FIXTURE.message }), undefined, 'notify answered without embed-UI')
  }, undefined, TR)
  row(sdk, 'UIB-ST-03', '#8b', `a second contribution from embed-UI's scope is refused by C-EXT (tool-exists): rethrown, nothing left registered by it, the first unaffected (${DECIDED.secondContribute})`, async (t) => {
    const w = await contribWorld(t, sdk)
    await w.call(TOOL.signal, { important: true })
    const before = w.names()
    assert.throws(() => w.contributeAgain(), (error) => error?.name === 'ToolContributionError' && error.code === K2.REGISTER_REFUSAL.toolExists)
    assert.deepEqual(w.names(), before)
    assert.deepEqual(w.backend.snapshot().attention, EXPECT.latch.setImportant, 'the refused contribution reset the latch')
    assert.deepEqual(structured(await w.call(TOOL.state, {})), { ...EXPECT.latch.setImportant, ok: true })
  }, undefined, TR)
  row(sdk, id, 'E2', 'a refusal through C-EXT: message-empty is an error result with its code', async (t) => {
    const w = await contribWorld(t, sdk)
    const result = await w.call(TOOL.notify, { message: FIXTURE.trimmable })
    assert.equal(structured(result).ok, false)
    assert.equal(structured(result).code, CODE.messageEmpty)
    assert.equal(result.isError, true)
    assert.equal(w.backend.snapshot().notice, null)
  }, undefined, TR)
  row(sdk, id, 'E3', 'limit-exceeded passes through C-EXT unchanged', async (t) => {
    const w = await contribWorld(t, sdk)
    const result = await w.call(TOOL.notify, { message: message(SURFACE.maxMessageChars + EXPECT.oneChar) })
    assert.equal(structured(result).code, CODE.limitExceeded)
  }, undefined, TR)
  row(sdk, id, 'A2', 'notify keeps markup as plain text (UIB-EP-04 row 4)', async (t) => {
    const w = await contribWorld(t, sdk)
    await w.call(TOOL.notify, { message: FIXTURE.markup })
    assert.equal(w.backend.snapshot().notice.message, FIXTURE.markup)
  }, undefined, TR)

  // UIB-EP-04 / UIB-EP-05 rows checked by the closed schemas through C-EXT.
  const invalid = [
    ['UIB-EP-04', '5', TOOL.notify, 'important not a boolean', { message: FIXTURE.message, important: FIXTURE.marker }],
    ['UIB-EP-04', '6', TOOL.notify, 'message missing', { important: true }],
    ['UIB-EP-04', '7', TOOL.notify, 'an extra key', { message: FIXTURE.message, [FIXTURE.extraKey]: true }],
    ['UIB-EP-05', '3', TOOL.signal, 'signal {} (important required)', {}],
    ['UIB-EP-05', '4', TOOL.signal, 'signal with an extra key', { important: true, [FIXTURE.extraKey]: true }],
    ['UIB-EP-05', '6', TOOL.state, 'state with an extra key', { [FIXTURE.extraKey]: true }],
  ]
  for (const [rid, part, local, title, args] of invalid) {
    row(sdk, rid, part, `${title} → invalid-arguments; nothing changes`, async (t) => {
      const w = await contribWorld(t, sdk)
      const before = w.backend.snapshot()
      assert.equal(structured(await w.call(local, args)).code, K2.CALL_CODE.invalidArguments)
      assert.deepEqual(w.backend.snapshot(), before)
    }, undefined, TR)
  }
  const valid = [
    ['UIB-EP-04', '1', TOOL.notify, { message: FIXTURE.message }, (s) => assert.deepEqual(s.notice, { message: FIXTURE.message, important: false, count: EXPECT.firstNotice })],
    ['UIB-EP-04', '2', TOOL.notify, { message: FIXTURE.message, important: true }, (s) => assert.equal(s.notice.important, true)],
    ['UIB-EP-04', '3', TOOL.notify, { message: FIXTURE.message, important: false }, (s) => assert.equal(s.notice.important, false)],
    ['UIB-EP-05', '1', TOOL.signal, { important: true }, (s) => assert.deepEqual(s.attention, EXPECT.latch.setImportant)],
    ['UIB-EP-05', '2', TOOL.signal, { important: false }, (s) => assert.deepEqual(s.attention, EXPECT.latch.set)],
    ['UIB-EP-05', '5', TOOL.state, {}, (s) => assert.deepEqual(s.attention, EXPECT.latch.clear)],
  ]
  for (const [rid, part, local, args, check] of valid) {
    row(sdk, rid, part, `${local} ${json(args)} → ok through C-EXT`, async (t) => {
      const w = await contribWorld(t, sdk)
      assert.equal(structured(await w.call(local, args)).ok, true)
      check(w.backend.snapshot())
    }, undefined, TR)
  }
}

function routed(sdk) {
  const id = 'UIB-UC-07'
  const R = FIXTURE.routeIds
  const N = FIXTURE.routeNames
  const targetOf = (b, key) => b.snapshot().targets.find((x) => x.key === key)
  row(sdk, id, '1', 'real hand-over service: a principal connects → green; disconnects → red (no reload)', async (t) => {
    const { w, backend } = await routedBackend(t, sdk)
    const p = w.principal(R.p, { name: N.p })
    await eventually(() => targetOf(backend, p)?.online === false, 'P listed offline')
    w.presence.connect(p)
    await eventually(() => targetOf(backend, p)?.online === true, 'P online')
    w.presence.disconnect(p)
    await eventually(() => targetOf(backend, p)?.online === false, 'P offline again')
  }, undefined, TR)
  row(sdk, id, '2', 'a rename shows in targets and in marks', async (t) => {
    const { w, backend, ctx } = await routedBackend(t, sdk)
    const p = w.principal(R.p, { name: N.p })
    w.session(S.s1)
    const answer = await jsonAnswer(await ctx.route('handOver').fetch(requestOf('handOver', { sessionId: S.s1, principalKey: p })), ST.ok)
    assert.deepEqual(answer.state.marks.map((m) => [m.sessionId, m.principal.key]), [[S.s1, p]])
    await w.pairs.setName(p, N.renamed)
    await eventually(() => targetOf(backend, p)?.name === N.renamed && backend.snapshot().marks[0]?.principal.name === N.renamed, 'the new name in targets and marks')
  }, undefined, TR)
  row(sdk, id, '3', 'a disabled entry leaves the targets', async (t) => {
    const { w, backend } = await routedBackend(t, sdk)
    const p = w.principal(R.p, { name: N.p })
    await eventually(() => targetOf(backend, p), 'P listed')
    w.tokens.disable(R.p)
    await eventually(() => targetOf(backend, p) === undefined, 'P leaves the targets')
  }, undefined, TR)
  row(sdk, id, '4', 'an entry that pairs joins the targets; an unpaired one is not listed', async (t) => {
    const { w, backend } = await routedBackend(t, sdk)
    w.principal(R.later, { paired: false })
    await quiet()
    assert.deepEqual(backend.snapshot().targets, [])
    const key = w.pairs.bind(R.later, N.later)
    await eventually(() => targetOf(backend, key)?.name === N.later, 'the paired principal listed')
  }, undefined, TR)
  row(sdk, id, '5', 'hand over then take back through the routes: the mark comes and goes; a second hand over is 409 conflict', async (t) => {
    const { w, backend, ctx } = await routedBackend(t, sdk)
    const p = w.principal(R.p, { name: N.p })
    const q = w.principal(R.q)
    w.session(S.s1)
    const send = (key, body) => ctx.route(key).fetch(requestOf(key, body))
    await jsonAnswer(await send('handOver', { sessionId: S.s1, principalKey: p }), ST.ok)
    const conflict = await jsonAnswer(await send('handOver', { sessionId: S.s1, principalKey: q }), ST.refused)
    assert.equal(conflict.ok, false)
    assert.ok(K3.handOverCodes.includes(conflict.code), 'not a K3 code: ' + conflict.code)
    assert.deepEqual(conflict.state.marks.map((m) => m.principal.key), [p])
    const back = await jsonAnswer(await send('takeBack', { sessionId: S.s1 }), ST.ok)
    assert.deepEqual(back.state.marks, [])
    assert.deepEqual(backend.snapshot().marks, [])
    const again = await jsonAnswer(await send('takeBack', { sessionId: S.s1 }), ST.refused)
    assert.ok(K3.takeBackCodes.includes(again.code), 'not a K3 code: ' + again.code)
  }, undefined, TR)
  // Re-baselined by C-WIRE-2 (q5): no designated principal; a disconnect keeps the latch.
  row(sdk, id, '6', 'a connected principal disconnects → the latch is kept (real hand-over service)', async (t) => {
    const { w, backend } = await routedBackend(t, sdk)
    const capture = captureRegister()
    const dispose = backend.service.contribute(capture.register)
    t.after(dispose)
    const d = w.principal(R.d, { name: N.d, connected: true })
    await eventually(() => targetOf(backend, d)?.online === true, 'D online')
    await capture.byName(TOOL.signal).execute({ important: true }, callOf())
    assert.deepEqual(backend.snapshot().attention, EXPECT.latch.setImportant)
    w.presence.disconnect(d)
    await eventually(() => targetOf(backend, d)?.online === false, 'D offline')
    await quiet()
    assert.deepEqual(backend.snapshot().attention, EXPECT.latch.setImportant)
  }, undefined, TR)
}
