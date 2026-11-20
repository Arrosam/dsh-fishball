/**
 * R-FIX-CUI black-box rows of the connector's UI backend for two findings of the connector-UI
 * review (.runtime/reports/review-x-dsh-connector-ui.md):
 * - UI-01: the Hand over / Take back routes act on the ROOT of the session they are given (a
 *   subagent child belongs to its root); a session-store read failure is 500 operation-failed;
 * - UI-02: an event stream whose reader does not drain stays bounded: after N changes with no
 *   reads at most CUI.maxQueuedFrames frames are waiting, whatever N is, and the last one is the
 *   current snapshot (intermediate snapshots may be dropped); a draining reader still sees each
 *   change; cancel, abort and close still end the stream.
 * Expected outcomes are the requirements the parent relayed for the task (and the root-port answer
 * of 2026-11-18, routing/fakes.mjs FakeSessions); no file under src/ui/ was read.
 *
 * Levels: UI-01 over the real K3 hand-over service of a C-ROUTE world (world.mjs routedBackend);
 * UI-02 the unit world of cases.mjs (FakeHandover, real Request / Response, the SSE reader).
 * Techniques: Decision Table (route × the given id's kind × the root's state), BVA over N (1, 2,
 * CUI.manyChanges), State Transition (stalled → reading → ended).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { CUI as ROUTE_CUI } from '../routing/constants.mjs'
import { jsonAnswer, unit } from './cases.mjs'
import { CUI, FIXTURE, SURFACE, WAIT } from './constants.mjs'
import { requestOf, sseReader } from './fakes.mjs'
import { routedBackend } from './world.mjs'

const T = { timeout: WAIT.routeTestMs }
const ST = SURFACE.status
const S = ROUTE_CUI.sessions
const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)

// ------------------------------------------------------------------------------------------------ UI-01

/** The UI backend over a routing world with A and B paired, root R, its child C and C's child G. */
async function chainBackend(t, sdk, { managedBy } = {}) {
  const r = await routedBackend(t, sdk)
  const keys = { a: r.w.principal(ROUTE_CUI.ids.a), b: r.w.principal(ROUTE_CUI.ids.b) }
  r.w.sessions.add(S.root)
  r.w.sessions.child(S.child, S.root)
  r.w.sessions.child(S.grandchild, S.child)
  if (managedBy !== undefined) assert.deepEqual(await r.w.managed.manage(S.root, keys[managedBy]), { ok: true }, 'harness: manage refused')
  const send = (key, body) => r.ctx.route(key).fetch(requestOf(key, body))
  const marks = () => r.backend.snapshot().marks.map((m) => [m.sessionId, m.principal.key])
  return { ...r, keys, send, marks }
}

function rootRoutes(sdk) {
  const id = CUI.id.ui01
  row(sdk, id, 'route handOver (child, root unmanaged)', 'POST handover {sessionId: C, principalKey: B} → 200; the answer\'s marks and the snapshot hold R managed by B only, no mark for C', async (t) => {
    const x = await chainBackend(t, sdk)
    const answer = await jsonAnswer(await x.send('handOver', { sessionId: S.child, principalKey: x.keys.b, note: FIXTURE.note }), ST.ok)
    assert.deepEqual(answer.state.marks.map((m) => [m.sessionId, m.principal.key]), [[S.root, x.keys.b]])
    assert.deepEqual(x.marks(), [[S.root, x.keys.b]])
  })
  row(sdk, id, 'route handOver (grandchild, root managed by A)', 'R managed by A; POST handover {sessionId: G, principalKey: B} → 409 conflict; the marks stay [R: A]', async (t) => {
    const x = await chainBackend(t, sdk, { managedBy: 'a' })
    const answer = await jsonAnswer(await x.send('handOver', { sessionId: S.grandchild, principalKey: x.keys.b }), ST.refused)
    assert.equal(answer.code, CUI.code.conflict)
    assert.deepEqual(x.marks(), [[S.root, x.keys.a]])
  })
  row(sdk, id, 'route takeBack (child, root managed by A)', 'R managed by A; POST takeback {sessionId: C} → 200; no mark is left', async (t) => {
    const x = await chainBackend(t, sdk, { managedBy: 'a' })
    const answer = await jsonAnswer(await x.send('takeBack', { sessionId: S.child }), ST.ok)
    assert.deepEqual(answer.state.marks, [])
    assert.deepEqual(x.marks(), [])
  })
  row(sdk, id, 'route takeBack (child, root unmanaged)', 'nobody manages R; POST takeback {sessionId: C} → 409 not-managed', async (t) => {
    const x = await chainBackend(t, sdk)
    const answer = await jsonAnswer(await x.send('takeBack', { sessionId: S.child }), ST.refused)
    assert.equal(answer.code, CUI.code.notManaged)
  })
  row(sdk, id, 'route (root read fails)', 'the session store cannot be read → POST handover / takeback of C → 500 operation-failed; the marks are unchanged', async (t) => {
    const x = await chainBackend(t, sdk, { managedBy: 'a' })
    x.w.sessions.failRoots = true
    for (const [key, body] of [['handOver', { sessionId: S.child, principalKey: x.keys.b }], ['takeBack', { sessionId: S.child }]]) {
      const answer = await jsonAnswer(await x.send(key, body), ST.failed)
      assert.deepEqual([answer.ok, answer.code], [false, SURFACE.code.operationFailed], key + ': ' + JSON.stringify(answer))
      assert.deepEqual(x.marks(), [[S.root, x.keys.a]])
    }
  })
}

// ------------------------------------------------------------------------------------------------ UI-02

/** `n` changes, each a notify (the notice count grows by one each time, so each is a new snapshot). */
async function changes(w, n) {
  for (let i = 0; i < n; i++) assert.equal((await w.notify({ message: FIXTURE.message })).ok, true, 'harness: a notify was refused')
}
/**
 * Every frame a reader that starts only now gets, read until no frame arrives for one quiet window
 * twice in a row (the stream has nothing more for it), parsed.
 */
async function drainNow(response) {
  const sse = sseReader(response)
  let seen = -1
  while (sse.frames.length !== seen) { seen = sse.frames.length; await sse.settle(); await sse.settle() }
  return { sse, frames: sse.rest() }
}

/**
 * A reader that reads only when told (a stalled consumer between reads): `next()` reads one whole
 * frame, parsed; `drain()` reads frames until none arrives within two quiet windows.
 */
function manualReader(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const { prefix, end } = SURFACE.frame
  let buffer = ''
  let pending
  const chunk = () => (pending ??= reader.read().finally(() => { pending = undefined }))
  const parse = (text) => JSON.parse(text.slice(prefix.length))
  async function next(ms = WAIT.settleMs) {
    for (;;) {
      const at = buffer.indexOf(end)
      if (at >= 0) { const frame = buffer.slice(0, at); buffer = buffer.slice(at + end.length); return parse(frame) }
      const got = await Promise.race([chunk(), new Promise((resolve) => setTimeout(() => resolve(null), ms))])
      if (got === null || got.done) return undefined
      buffer += decoder.decode(got.value, { stream: true })
    }
  }
  return {
    next,
    async drain() { const frames = []; for (let f = await next(WAIT.quietMs * 2); f !== undefined; f = await next(WAIT.quietMs * 2)) frames.push(f); return frames },
    cancel: () => reader.cancel().catch(() => {}),
  }
}
/** A snapshot's notice count (0 with no notice): each notify raises it by one, so it orders the snapshots. */
const countOf = (snapshot) => snapshot.notice?.count ?? 0

function stalledStreams(sdk) {
  const id = CUI.id.ui02
  for (const n of CUI.changeCounts) {
    row(sdk, id, `BVA (N = ${n}, no reads)`, `a stream nobody reads; ${n} change(s) → a reader that starts then gets at most ${CUI.maxQueuedFrames} frames, the last being the current snapshot (notice count ${n})`, async (t) => {
      const w = await unit(t, sdk)
      const response = await w.route('events')
      t.after(() => response.body.cancel().catch(() => {}))
      await changes(w, n)
      const { frames } = await drainNow(response)
      assert.ok(frames.length >= 1, 'no frame at all')
      assert.ok(frames.length <= CUI.maxQueuedFrames, `${frames.length} frames were queued for a reader that did not read (N = ${n})`)
      assert.deepEqual(frames.at(-1), w.snapshot(), 'the last frame is not the current snapshot')
      assert.equal(frames.at(-1).notice.count, n)
    })
  }
  row(sdk, id, 'ST (stalled → reading → live)', `${CUI.manyChanges} changes unread, then the reader drains; each later change, read as it comes, gives exactly one frame equal to the new snapshot`, async (t) => {
    const w = await unit(t, sdk)
    const response = await w.route('events')
    await changes(w, CUI.manyChanges)
    const { sse } = await drainNow(response)
    t.after(() => sse.cancel())
    for (let i = 0; i < CUI.liveChanges; i++) {
      await changes(w, 1)
      assert.deepEqual(await sse.next(), w.snapshot(), `live change ${i + 1}`)
      await sse.quiet()
    }
  })
  row(sdk, id, 'ST (draining reader)', `a reader that keeps reading sees each of ${CUI.liveChanges} changes, in order (notice count 1…${CUI.liveChanges})`, async (t) => {
    const w = await unit(t, sdk)
    const { sse } = await w.stream()
    await sse.next()
    for (let i = 1; i <= CUI.liveChanges; i++) {
      await changes(w, 1)
      assert.equal((await sse.next()).notice.count, i)
    }
  })
  row(sdk, id, 'ST (read → 1, 2 → read → 3 → drain)', 'read; changes 1 and 2 unread; read; change 3; drain → the last frame read is the latest snapshot (change 3), and no frame older than one already read follows it', async (t) => {
    const w = await unit(t, sdk)
    const r = manualReader(await w.route('events'))
    t.after(() => r.cancel())
    const read = [await r.next()]
    await changes(w, 2)
    read.push(await r.next())
    await changes(w, 1)
    read.push(...(await r.drain()))
    assert.ok(read.every((f) => f !== undefined), 'a read got no frame: ' + JSON.stringify(read.map((f) => f && countOf(f))))
    const counts = read.map(countOf)
    assert.deepEqual(read.at(-1), w.snapshot(), 'the last frame is not the latest snapshot')
    assert.equal(counts.at(-1), CUI.orderChanges)
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], 'a frame older than one already read followed it: ' + JSON.stringify(counts))
  })
  const enders = [
    ['cancel', 'the reader cancels', async (w, response) => { await response.body.cancel() }],
    ['abort', 'the request is aborted', async (w, response, abort) => { abort.abort() }],
    ['close', 'close()', async (w) => { w.backend.close() }],
  ]
  for (const [part, how, end] of enders) {
    row(sdk, id, `ST (stalled → ${part})`, `${CUI.manyChanges} changes unread, then ${how} → the stream ends (a reader gets at most ${CUI.maxQueuedFrames} frames, then done); later changes do not throw`, async (t) => {
      const w = await unit(t, sdk)
      const abort = new AbortController()
      const response = await w.route('events', undefined, abort.signal)
      await changes(w, CUI.manyChanges)
      await end(w, response, abort)
      if (part !== 'cancel') {
        const { sse, frames } = await drainNow(response)
        assert.ok(frames.length <= CUI.maxQueuedFrames, `${frames.length} frames were left queued`)
        assert.ok(await sse.ended(), 'the stream did not end')
      }
      if (part !== 'close') await changes(w, 1)
    })
  }
}

/** Every R-FIX-CUI row of the UI backend suite for `sdk`. */
export function registerCuiBackendCases(sdk) {
  rootRoutes(sdk)
  stalledStreams(sdk)
}
