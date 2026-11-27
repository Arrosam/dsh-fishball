/**
 * R-FIX-CORE black-box rows for core's manager (review findings F05, F06, F07, F08, F15, F17, F18;
 * acceptance criteria in the task's requirements, .rfix-requirements.md). In-process DSH
 * (inproc.mjs); no DSH process is started.
 * - F05: a record naming a session whose log does not exist is created under that id; other resume
 *   failures still refuse `chat-session` and never create;
 * - F06: overlapping applyModel() calls and an activation during a setting change end on the newest setting;
 * - F07: the reminder store is bounded (4,194,304 bytes; R-FIX-CORE-2: a create or update is refused
 *   `schedule-store-full` once its result would pass 90% of it, 3,774,873 bytes), fails
 *   closed (`schedule-unavailable`, never overwritten), and ended reminders are removed at once;
 * - F08: a due reminder is handed over only when truly idle, settled on admission, dropped on a
 *   user Stop or removal, delivered again after owner teardown or restart, never fired twice;
 * - F15: impossible RFC 3339 strings are refused `invalid_rule`;
 * - F17: the persona's acquisition wording;
 * - F18: the manager's scope shadows `harness:source` (section and runtime context) with empty text.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { caseName } from 'fishball-test-helpers/cases'
import { INPROC, coreModule, eventually, gate, openInproc, recurringClock } from './inproc.mjs'

export const name = (id, row, text) => caseName(id, row, text)

/**
 * Removes the durable log directory of `sessionId` under DSH's JSONL root (`<sessions>/<project
 * key>/<session id>/`), as a lost or never-written log; returns how many directories it removed.
 */
function removeSessionLog(sessionsDir, sessionId) {
  if (!fs.existsSync(sessionsDir)) return 0
  let removed = 0
  for (const project of fs.readdirSync(sessionsDir)) {
    const dir = path.join(sessionsDir, project, sessionId)
    if (!fs.existsSync(dir)) continue
    assert.ok(dir.startsWith(sessionsDir + path.sep) && path.basename(dir) === sessionId, 'refusing to remove ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
    removed += 1
  }
  return removed
}
export const T = { timeout: 120000 }
const M = INPROC.models
const sel = (model) => Object.freeze({ provider: INPROC.provider, model })

/** Words of these rows (the requirements' codes and the schedule tool's parameters). */
export const RFIX = Object.freeze({
  chatSession: 'chat-session',
  storeFull: 'schedule-store-full',
  /**
   * R-FIX-CORE-2: a create or update is refused once its resulting store would pass 90% of the
   * 4 MiB limit (the rest is kept for delivery's bookkeeping): 3,774,873 bytes is the largest
   * resulting file a create or update may write (90% of 4,194,304 is 3,774,873.6).
   */
  createSharePercent: 90,
  percent: 100,
  unavailable: 'schedule-unavailable',
  invalidRule: 'invalid_rule',
  ended: 'ended',
  tool: Object.freeze({ create: 'schedule_create', list: 'schedule_list', update: 'schedule_update', delete: 'schedule_delete' }),
  /** A prompt of 8 KiB (the report's ordinary prompt) and a title per index. */
  promptBytes: 8 * 1024,
  title: (i) => 'fbtest-rfix-rem-' + i,
  harnessSource: 'harness:source',
  harnessText: 'FBTEST-RFIX harness source checkout text',
  harnessContextText: 'FBTEST-RFIX harness source runtime context',
  sandboxContext: 'sandbox:policy',
  approvalContext: 'approval:policy',
  persistenceNotFound: 'SessionPersistenceNotFoundError',
  writerHeld: 'SessionAlreadyOwnedError',
})

/** schedule tool result fields the rows read. */
export const codeOf = (r) => r.json?.code ?? r.json?.error?.code ?? (r.text.match(/"code"\s*:\s*"([^"]+)"/)?.[1])
export const listOf = (r) => (Array.isArray(r.json) ? r.json : r.json?.reminders ?? r.json?.tasks ?? [])

// F08 helpers, shared with the R-FIX-CORE-2 rows (rfix2.mjs).
/** A one-shot reminder `seconds` from now with a prompt marker; returns the marker. */
export async function oneShot(w, title, seconds = 1) {
  const marker = 'FBTEST-RFIX-REMINDER-' + title
  const r = await w.tool(RFIX.tool.create, { title, prompt: marker, after_seconds: seconds })
  assert.equal(codeOf(r), undefined, 'harness: create refused ' + r.text.slice(0, 200))
  return marker
}
export const listedTitles = async (w) => listOf(await w.tool(RFIX.tool.list, {})).map((e) => e.title)
export const storeText = (w) => (fs.existsSync(w.storeFile()) ? fs.readFileSync(w.storeFile(), 'utf8') : '')
/** A model hook holding the turn carrying `needle` (and nothing else) until released or stopped. */
export function busyOn(needle) {
  const reached = Promise.withResolvers()
  const released = Promise.withResolvers()
  let held = false
  return {
    onRequest: async (options) => {
      if (held || !JSON.stringify(options.messages ?? []).includes(needle)) return undefined
      held = true
      reached.resolve()
      const aborted = new Promise((resolve) => options.signal?.addEventListener('abort', () => resolve('aborted'), { once: true }))
      return Promise.race([released.promise.then(() => undefined), aborted])
    },
    reached: reached.promise,
    release: () => released.resolve(),
  }
}
export const userTurn = (w, agent, text) => agent.followup(w.p[INPROC.llm].freezeMessage({ id: 'fbtest-rfix-busy-' + Math.random().toString(36).slice(2), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }))

/** The largest resulting store a create or update may write (R-FIX-CORE-2). */
export const CREATE_BOUND_BYTES = Math.floor(INPROC.store.maxBytes * RFIX.createSharePercent / RFIX.percent)

export function registerRfixManagerCases() {
  registerF05()
  registerF06()
  registerF07()
  registerF08()
  registerF15()
  registerPersona()
}

// ================================================================== F05: a dangling manager record
function registerF05() {
  /** A first create that fails before the host created the session (a transient factory failure). */
  const failFirstCreate = () => {
    let failed = false
    return { create: async (o, base) => { if (!failed) { failed = true; throw new Error('fbtest-rfix transient create failure') } return base(o) } }
  }
  test(name('RFIX-F05-ST-01', 1, 'the first create fails; the next activation creates the session under the recorded id and works'), T, async (t) => {
    const w = await openInproc(t, { faults: failFirstCreate() })
    await assert.rejects(w.activate(), 'harness: the first activation did not fail')
    const recorded = w.calls.create[0]
    assert.equal(typeof recorded, 'string', 'harness: no create call')
    const agent = await w.activate()
    assert.equal(agent.id ?? agent.session?.id, recorded, 'the manager is not the recorded id')
    assert.equal(w.calls.create.at(-1), recorded, 'the repair did not create under the recorded id')
    assert.equal(await w.nextModel() !== undefined, true, 'the repaired manager made no model request')
  })
  test(name('RFIX-F05-ST-01', 2, 'the first create fails, DSH restarts: the next start creates the session under the recorded id'), T, async (t) => {
    const first = await openInproc(t, { faults: failFirstCreate() })
    await assert.rejects(first.activate())
    const recorded = first.calls.create[0]
    await first.close()
    const second = await openInproc(t, { root: first.root })
    const agent = await second.activate()
    assert.equal(agent.id ?? agent.session?.id, recorded)
  })
  const RESUME_FAILURES = [
    ['writer held', (p) => { const E = p[INPROC.sessionPersistence][RFIX.writerHeld]; return (o) => { throw new E(o.resumeSessionId) } }],
    ['any other failure', () => () => { throw new Error('fbtest-rfix resume failure') }],
  ]
  for (const [label, makeFault] of RESUME_FAILURES) {
    test(name('RFIX-F05-DT-01', label, `resume fails (${label}) for a recorded session → ${RFIX.chatSession}, and no session is created`), T, async (t) => {
      const first = await openInproc(t)
      const agent = await first.activate()
      const recorded = agent.id ?? agent.session?.id
      await first.close()
      const holder = {}
      const second = await openInproc(t, { root: first.root, faults: { resume: async (o) => holder.fault(o) } })
      holder.fault = makeFault(second.p)
      await assert.rejects(second.activate(), (e) => e?.code === RFIX.chatSession, `not refused ${RFIX.chatSession}`)
      assert.deepEqual(second.calls.create, [], 'a session was created after a resume failure that is not "not found"')
      assert.ok(second.calls.resume.includes(recorded), 'harness: the recorded session was not resumed')
    })
  }
  test(name('RFIX-F05-DT-01', 'not found', `resume answers ${RFIX.persistenceNotFound} → the session is created under that id (read-only, ask)`), T, async (t) => {
    const first = await openInproc(t)
    const agent = await first.activate()
    const recorded = agent.id ?? agent.session?.id
    await first.close()
    // The record names a session whose log does not exist: the log is removed, so DSH's own resume
    // answers not-found (a fake throw would leave the log there and the create would collide).
    const removed = removeSessionLog(first.sessionsDir(), recorded)
    assert.ok(removed > 0, 'harness: no session directory to remove for ' + recorded)
    const second = await openInproc(t, { root: first.root })
    const created = await second.activate()
    assert.equal(created.id ?? created.session?.id, recorded)
    assert.deepEqual(second.calls.create, [recorded])
    assert.ok(second.calls.resume.includes(recorded), 'harness: the recorded session was not tried by resume first')
  })
}

// ================================================================== F06: last write wins
function registerF06() {
  test(name('RFIX-F06-ST-01', 'overlap', 'setting B validated slowly, then C validated fast → the live manager ends on C'), T, async (t) => {
    let setting = sel(M.a)
    const w = await openInproc(t, { model: () => setting })
    await w.activate()
    assert.equal(await w.nextModel(), M.a, 'harness: the manager does not run on A')
    const slowB = gate()
    w.state.holdNext = slowB.wait()
    setting = sel(M.b)
    const applyB = w.manager.applyModel()
    await sleep(INPROC.wait.quietMs)
    assert.equal(w.state.holdNext, undefined, 'harness: B\'s validation made no catalog call')
    setting = sel(M.c)
    // C's validation is fast; an implementation that waits for B's first may only finish after B.
    const applyC = w.manager.applyModel()
    await sleep(INPROC.wait.quietMs)
    slowB.open()
    await applyB
    await applyC
    await sleep(INPROC.wait.quietMs)
    assert.deepEqual(w.manager.currentModel?.(), sel(M.c), 'currentModel after both applies')
    assert.equal(await w.nextModel(), M.c, 'the model of the next request')
  })
  test(name('RFIX-F06-ST-01', 'activation', 'the setting changes from B to C while the activation validates B → the manager ends on C'), T, async (t) => {
    let setting = sel(M.b)
    const slowB = gate()
    const w = await openInproc(t, { model: () => setting })
    w.state.holdNext = slowB.wait()
    const activation = w.activate()
    await sleep(INPROC.wait.quietMs)
    setting = sel(M.c)
    const apply = w.manager.applyModel()
    slowB.open()
    await activation
    await apply
    assert.equal(await w.nextModel(), M.c)
  })
}

// ================================================================== F07: store bounds and fail-closed
function registerF07() {
  const prompt = (i) => 'p' + String(i) + 'x'.repeat(RFIX.promptBytes)
  const create = (w, i, extra = {}) => w.tool(RFIX.tool.create, { title: RFIX.title(i), prompt: prompt(i), after_seconds: 3600, ...extra })
  /** Fills the store with 8-KiB reminders until a create is refused; returns `{count, refused}`. */
  async function fill(w) {
    let i = 0
    for (;;) {
      const r = await create(w, i)
      if (r.isError || codeOf(r) !== undefined) return { count: i, refused: r }
      i += 1
      assert.ok(fs.statSync(w.storeFile()).size <= CREATE_BOUND_BYTES, `creates grew the store past ${CREATE_BOUND_BYTES} bytes (90% of the limit) at ${i} reminders`)
      assert.ok(i < 1000, 'harness: no refusal after 1000 reminders')
    }
  }
  test(name('RFIX-F07-BVA-01', 'create over the bound', `creates up to the byte bound are kept; the create that would pass ${CREATE_BOUND_BYTES} bytes (90% of ${INPROC.store.maxBytes}) is refused ${RFIX.storeFull}; nothing written; the previous tasks stay, also after a restart`), T, async (t) => {
    const w = await openInproc(t, { reminders: true })
    const { count, refused } = await fill(w)
    assert.equal(codeOf(refused), RFIX.storeFull, 'the refusal: ' + refused.text.slice(0, 200))
    const before = fs.readFileSync(w.storeFile())
    assert.ok(before.length + RFIX.promptBytes > CREATE_BOUND_BYTES, 'harness: the refused create would have fitted under 90%')
    assert.equal(listOf(await w.tool(RFIX.tool.list, {})).length, count, 'reminders listed after the refusal')
    await w.close()
    const again = await openInproc(t, { root: w.root, reminders: true })
    assert.equal(listOf(await again.tool(RFIX.tool.list, {})).length, count, 'reminders listed after a restart')
  })
  test(name('RFIX-F07-BVA-01', 'update over the bound', `an update whose result would pass the bound (${CREATE_BOUND_BYTES} bytes, 90%) is refused ${RFIX.storeFull}; the reminder keeps its old prompt`), T, async (t) => {
    const w = await openInproc(t, { reminders: true })
    const { count } = await fill(w)
    const [first] = listOf(await w.tool(RFIX.tool.list, {}))
    const r = await w.tool(RFIX.tool.update, { id: first.id, prompt: prompt(0) + 'y'.repeat(RFIX.promptBytes * 2) })
    assert.equal(codeOf(r), RFIX.storeFull, r.text.slice(0, 200))
    const after = listOf(await w.tool(RFIX.tool.list, {}))
    assert.equal(after.length, count)
    assert.equal(after.find((e) => e.id === first.id)?.prompt, first.prompt)
  })

  /** A store file written before core starts; `text` may be anything. */
  const preStore = async (t, text) => {
    const w = await openInproc(t, { reminders: true })
    const root = w.root
    await w.close()
    fs.mkdirSync(path.join(root, INPROC.store.dir), { recursive: true })
    fs.writeFileSync(path.join(root, INPROC.store.dir, INPROC.store.file), text)
    return root
  }
  const UNREADABLE = [
    ['over the byte limit', () => JSON.stringify({ version: 1, tasks: [], pad: 'x'.repeat(INPROC.store.maxBytes) })],
    ['not JSON', () => '{ this is not json'],
    ['an unexpected shape', () => JSON.stringify({ version: 1, tasks: 'not a list' })],
  ]
  for (const [label, text] of UNREADABLE) {
    test(name('RFIX-F07-EP-01', label, `a store ${label} → every schedule tool answers ${RFIX.unavailable}; the file is never overwritten`), T, async (t) => {
      const body = text()
      const root = await preStore(t, body)
      const w = await openInproc(t, { root, reminders: true })
      const results = [
        await w.tool(RFIX.tool.list, {}),
        await w.tool(RFIX.tool.create, { title: RFIX.title(0), prompt: 'p', after_seconds: 3600 }),
        await w.tool(RFIX.tool.update, { id: 'fbtest-none', title: 'x' }),
        await w.tool(RFIX.tool.delete, { id: 'fbtest-none' }),
      ]
      assert.deepEqual(results.map(codeOf), [RFIX.unavailable, RFIX.unavailable, RFIX.unavailable, RFIX.unavailable], results.map((r) => r.text.slice(0, 120)).join(' | '))
      assert.equal(fs.readFileSync(w.storeFile(), 'utf8'), body, 'the unreadable store was overwritten')
    })
  }
  test(name('RFIX-F07-EP-01', 'missing file', 'no store file → an empty store: list answers no reminders, create works'), T, async (t) => {
    const w = await openInproc(t, { reminders: true })
    assert.deepEqual(listOf(await w.tool(RFIX.tool.list, {})), [])
    const r = await w.tool(RFIX.tool.create, { title: RFIX.title(0), prompt: 'p', after_seconds: 3600 })
    assert.equal(codeOf(r), undefined, r.text.slice(0, 200))
  })
  test(name('RFIX-F07-EP-02', 'ended on load', `ended tasks already in a stored file are dropped on load; ${RFIX.tool.list} never shows ${RFIX.ended}`), T, async (t) => {
    const w = await openInproc(t, { reminders: true })
    await w.tool(RFIX.tool.create, { title: RFIX.title(1), prompt: 'p1', after_seconds: 3600 })
    await w.tool(RFIX.tool.create, { title: RFIX.title(2), prompt: 'p2', after_seconds: 3600 })
    const root = w.root
    await w.close()
    const file = path.join(root, INPROC.store.dir, INPROC.store.file)
    const store = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.ok(Array.isArray(store.tasks) && store.tasks.length === 2, 'harness: the store shape is not {tasks: [..]}')
    store.tasks[0] = { ...store.tasks[0], status: RFIX.ended }
    fs.writeFileSync(file, JSON.stringify(store))
    const again = await openInproc(t, { root, reminders: true })
    const listed = listOf(await again.tool(RFIX.tool.list, {}))
    assert.deepEqual(listed.map((e) => e.title), [RFIX.title(2)])
    assert.deepEqual(listed.filter((e) => e.status === RFIX.ended), [])
  })
}

// ================================================================== F08: the delivery boundary
function registerF08() {
  test(name('RFIX-F08-ST-01', 'idle → admitted', 'a due one-shot while idle is its own turn; admitted once; then removed (not listed)'), T, async (t) => {
    const w = await openInproc(t, { reminders: true })
    const title = RFIX.title('idle')
    const marker = await oneShot(w, title)
    assert.ok(await eventually(async () => (await w.admissions(marker)).length === 1), 'the reminder was not admitted')
    await sleep(INPROC.wait.quietMs * 2)
    assert.equal((await w.admissions(marker)).length, 1, 'admissions')
    assert.deepEqual(await listedTitles(w), [], 'a delivered one-shot is still listed')
  })
  test(name('RFIX-F08-ST-01', 'busy → held', 'a reminder due while the manager is busy is not handed over into that turn; it is its own turn after it, admitted once'), T, async (t) => {
    const busy = busyOn(INPROC.busyText)
    const w = await openInproc(t, { reminders: true, onRequest: busy.onRequest })
    const agent = await w.activate()
    userTurn(w, agent, INPROC.busyText)
    await busy.reached
    const title = RFIX.title('busy')
    const marker = await oneShot(w, title)
    await sleep(2000)
    const log = await w.sessionLog()
    const queued = log.filter((e) => e.type === INPROC.inboxSpliced && JSON.stringify(e.data).includes(marker))
    assert.deepEqual(queued, [], 'the reminder was queued into the busy turn')
    assert.equal(storeText(w).includes('"pending"'), true, 'the due occurrence is not recorded pending')
    busy.release()
    assert.ok(await eventually(async () => (await w.admissions(marker)).length === 1), 'not admitted after the busy turn')
    await sleep(INPROC.wait.quietMs * 2)
    assert.equal((await w.admissions(marker)).length, 1)
    assert.deepEqual(await listedTitles(w), [])
  })
  for (const [how, cause, redelivered] of [['user Stop', INPROC.userCancel, false], ['owner teardown', INPROC.disposedCancel, true]]) {
    test(name('RFIX-F08-DT-01', how, `the turn claiming a one-shot ends by ${how} before admission → ${redelivered ? 'delivered again: one admission' : 'dropped: no admission, removed, not redelivered'}`), T, async (t) => {
      const w = await openInproc(t, { reminders: true })
      const title = RFIX.title(how.replace(/\W/g, ''))
      const marker = 'FBTEST-RFIX-REMINDER-' + title
      const agent = await w.activate()
      let done = false
      agent.ctx.on(INPROC.preStep, (input, next) => {
        if (done || !JSON.stringify(input.messages).includes(marker)) return next()
        done = true
        agent.cancel(cause)
        return next()
      })
      await oneShot(w, title)
      assert.ok(await eventually(() => done), 'harness: no turn claimed the reminder')
      await sleep(3000)
      assert.equal((await w.admissions(marker)).length, redelivered ? 1 : 0, 'admissions')
      if (!redelivered) assert.deepEqual(await listedTitles(w), [], 'a dropped one-shot is still listed')
    })
  }
  test(name('RFIX-F08-DT-01', 'removed from the inbox', 'the queued reminder message is removed from the inbox before admission → dropped: no admission, removed'), T, async (t) => {
    const w = await openInproc(t, { reminders: true })
    const agent = await w.activate()
    const title = RFIX.title('removed')
    const marker = 'FBTEST-RFIX-REMINDER-' + title
    let removed = false
    agent.ctx.on(INPROC.agentStatus, ({ status }) => {
      if (removed || status !== INPROC.running) return
      const queued = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].find((m) => JSON.stringify(m.content).includes(marker))
      if (queued === undefined) return
      removed = true
      agent.inbox.remove(queued.id)
    })
    await oneShot(w, title)
    await sleep(4000)
    assert.ok(removed, 'harness: the reminder was never queued while the turn started')
    assert.equal((await w.admissions(marker)).length, 0)
    assert.deepEqual(await listedTitles(w), [])
  })
  test(name('RFIX-F08-ST-02', 'restart while pending', 'DSH stops with an occurrence pending (busy) → the next start delivers it: one admission in total'), T, async (t) => {
    const busy = busyOn(INPROC.busyText)
    const w = await openInproc(t, { reminders: true, onRequest: busy.onRequest })
    const agent = await w.activate()
    userTurn(w, agent, INPROC.busyText)
    await busy.reached
    const title = RFIX.title('restart')
    const marker = await oneShot(w, title)
    await eventually(() => storeText(w).includes('"pending"'))
    assert.ok(storeText(w).includes('"pending"'), 'harness: the occurrence was never pending')
    const root = w.root
    await w.close()
    const stored = fs.readFileSync(path.join(root, INPROC.store.dir, INPROC.store.file), 'utf8')
    assert.ok(stored.includes('"pending"'), 'harness: the occurrence is no longer pending after the stop: ' + stored.slice(0, 300))
    const again = await openInproc(t, { root, reminders: true })
    await again.activate()
    const delivered = await eventually(async () => (await again.admissions(marker)).length >= 1)
    assert.ok(delivered, 'the pending occurrence was not delivered after the restart')
    await sleep(INPROC.wait.quietMs * 2)
    assert.equal((await again.admissions(marker)).length, 1)
  })
  test(name('RFIX-F08-ST-02', 'recurring', 'a recurring reminder (cron every minute) delivered and admitted → lastDelivery recorded, the next occurrence scheduled later, still listed'), { timeout: 180000 }, async (t) => {
    const w = await openInproc(t, { reminders: true })
    const clock = await recurringClock(t, w)
    const title = RFIX.title('cron')
    const marker = 'FBTEST-RFIX-REMINDER-' + title
    const r = await w.tool(RFIX.tool.create, { title, prompt: marker, cron: { expression: '* * * * *', time_zone: 'UTC' } })
    assert.equal(codeOf(r), undefined, r.text.slice(0, 200))
    const [before] = listOf(await w.tool(RFIX.tool.list, {}))
    assert.equal(before?.lastDelivery, undefined, 'lastDelivery before any delivery')
    clock.makeDue()
    assert.ok(await clock.eventually(async () => (await w.admissions(marker)).length === 1, 90000), 'the first occurrence was not admitted')
    assert.ok(await clock.eventually(async () => listOf(await w.tool(RFIX.tool.list, {}))[0]?.lastDelivery !== undefined), 'no lastDelivery after the admission')
    const [after] = listOf(await w.tool(RFIX.tool.list, {}))
    assert.equal(after.title, title, 'a recurring reminder is no longer listed')
    assert.ok(Date.parse(after.scheduledAt) > Date.parse(before.scheduledAt), `the next occurrence is not later: ${before.scheduledAt} → ${after.scheduledAt}`)
  })
}

// ================================================================== F15: strict RFC 3339 strings
function registerF15() {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0)
  const ROWS = [
    ['2026-02-30T12:00:00Z', false, 'day 30 of February'],
    ['2026-02-29T12:00:00Z', false, 'non-leap 29 February'],
    ['2028-02-29T12:00:00Z', true, 'leap 29 February'],
    ['2026-13-01T12:00:00Z', false, 'month 13'],
    ['2026-00-10T12:00:00Z', false, 'month 0'],
    ['2026-04-31T12:00:00Z', false, '31 April'],
    ['2026-04-30T12:00:00Z', true, '30 April'],
    ['2026-01-00T12:00:00Z', false, 'day 0'],
    ['2026-03-01T24:00:00Z', false, 'hour 24'],
    ['2026-03-01T23:59:59Z', true, '23:59:59'],
    ['2026-03-01T12:60:00Z', false, 'minute 60'],
    ['2026-03-01T12:00:60Z', false, 'second 60'],
    ['2026-03-01T12:00:00+24:00', false, 'offset hours 24'],
    ['2026-03-01T12:00:00+23:59', true, 'offset +23:59'],
    ['2026-03-01T12:00:00-00:60', false, 'offset minutes 60'],
    ['2026-03-01T12:00:00.123+05:30', true, 'fraction and +05:30'],
  ]
  for (const [at, ok, label] of ROWS) {
    test(name('RFIX-F15-BVA-01', label, `at "${at}" → ${ok ? 'accepted at exactly that instant' : 'refused ' + RFIX.invalidRule}`), T, async () => {
      const mod = await coreModule(INPROC.modules.schedule)
      const run = () => mod.recordFor({ id: 'fbtest-rfix-at', title: 't', prompt: 'p', timing: { kind: mod.KIND.at, at }, now })
      if (ok) assert.equal(run().scheduledAt, new Date(Date.parse(at)).toISOString())
      else assert.throws(run, (e) => e?.code === RFIX.invalidRule, `"${at}" was not refused ${RFIX.invalidRule}`)
    })
  }
}

// ================================================================== F17, F18: the persona
function registerPersona() {
  const personaText = async () => {
    const mod = await import(pathToFileURL(INPROC.modules.personaText).href)
    const role = mod.PERSONA_ROLE
    return Array.isArray(role) ? role.join('\n') : String(role)
  }
  test(name('RFIX-F17-EP-01', 1, 'the persona names the managed sessions: the ones Fishball starts and the ones the user hands over'), T, async () => {
    const text = await personaText()
    assert.match(text, /\b(?:start|starts|started)\b[^.\n]*\bhand(?:s|ed)? (?:it |them )?over\b|\bhand(?:s|ed)? (?:it |them )?over\b[^.\n]*\bstart/i, 'no acquisition sentence naming start and hand-over')
  })
  test(name('RFIX-F17-EP-01', 2, 'the persona says messaging a session or answering its prompt never makes it managed'), T, async () => {
    const text = await personaText()
    const rule = text.split(/\n+/).find((line) => /\bmessag\w*\b/i.test(line) && /\b(?:answer\w*|prompt)\b/i.test(line) && /\bmanag\w*\b/i.test(line))
    assert.ok(rule, 'no managed-session rule covers both messaging and answering')
    assert.match(rule, /\b(?:never|not|no|only|neither)\b/i, 'no restriction on acquiring managed sessions')
    assert.doesNotMatch(text, /(?:sessions? (?:you )?(?:message|messaged)|whose prompt you answer)[^.\n]*(?:are|become) (?:yours|managed)/i, 'the V2 acquisition wording is still there')
  })

  test(name('RFIX-F18-EP-01', 'manager scope', `a global ${RFIX.harnessSource} section and context reach an ordinary agent but not the manager's model; sandbox and approval contexts stay`), T, async (t) => {
    const w = await openInproc(t, {
      globalPrompt: (ctx) => {
        ctx.systemPrompt.section({ name: RFIX.harnessSource, order: ctx.systemPrompt.getSectionOrder('HARNESS_SOURCE'), interpolate: false, text: RFIX.harnessText })
        ctx.systemPrompt.context({ name: RFIX.harnessSource, order: ctx.systemPrompt.getContextOrder('HARNESS_SOURCE'), interpolate: false, text: RFIX.harnessContextText })
      },
    })
    await w.activate()
    const from = w.state.requests.length
    await w.nextModel()
    const request = w.state.requests[from]
    const all = request.system + '\n' + request.messages
    assert.equal(all.includes(RFIX.harnessText), false, 'the harness:source section reached the manager')
    assert.equal(all.includes(RFIX.harnessContextText), false, 'the harness:source runtime context reached the manager')
    // Harness: the same global entries reach a plain agent of the same DSH, so their absence above is the shadow.
    const cwd = path.join(w.root, 'plain')
    fs.mkdirSync(cwd, { recursive: true })
    const plain = await w.ctx.agentLoop.createAgent(w.ctx, { sessionId: 'fbtest-rfix-plain', agentOptions: { provider: INPROC.provider, model: M.dshDefault }, meta: { cwd } })
    w.defer(() => plain.dispose())
    const plainFrom = w.state.requests.length
    plain.agent.followup(w.p[INPROC.llm].freezeMessage({ id: 'fbtest-rfix-plain-u', role: 'user', content: [{ type: 'text', text: INPROC.userText }], source: { kind: 'user' } }))
    await eventually(() => w.state.requests.length > plainFrom)
    await plain.agent.whenIdle()
    const plainAll = w.state.requests.slice(plainFrom).map((r) => r.system + '\n' + r.messages).join('\n')
    assert.ok(plainAll.includes(RFIX.harnessText) || plainAll.includes(RFIX.harnessContextText), 'harness: the global harness:source entries reach no agent at all')
  })
  test(name('RFIX-F18-EP-01', 'registrations', `applyPersona registers an empty section and an empty context named ${RFIX.harnessSource} in the given scope`), T, async () => {
    const mod = await coreModule(INPROC.modules.persona)
    const sections = []
    const contexts = []
    const registry = {
      section: (s) => { sections.push(s); return () => {} },
      context: (c) => { contexts.push(c); return () => {} },
      getSectionOrder: () => 0,
      getContextOrder: () => 0,
      suppressRuntimeContext: () => () => {},
    }
    mod.applyPersona(registry)
    const text = (entry) => (typeof entry?.text === 'function' ? entry.text({}) : entry?.text)
    assert.equal(text(sections.find((s) => s.name === RFIX.harnessSource)), '', `no empty ${RFIX.harnessSource} section: ${JSON.stringify(sections.map((s) => s.name))}`)
    assert.equal(text(contexts.find((c) => c.name === RFIX.harnessSource)), '', `no empty ${RFIX.harnessSource} context: ${JSON.stringify(contexts.map((c) => c.name))}`)
    for (const kept of [RFIX.sandboxContext, RFIX.approvalContext]) assert.equal(contexts.some((c) => c.name === kept), false, `${kept} is shadowed`)
  })
}