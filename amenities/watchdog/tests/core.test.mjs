/**
 * dsh-connector-watchdog's behaviour (packages/dsh-connector-watchdog/src/core.js and
 * store.js) over fake connector services, a fake judge and fake timers; no DSH is booted. Sources:
 * docs/watchdog-project-notes.md §2–§3 and the user's decisions of 2026-11-20 (drift = event +
 * stop; Fishball may still message a stopped session; settlements are the connector's; no
 * escalation to the user, 2026-11-21; briefs persist; 2026-11-21 after the live test: a judge
 * failure is a JUDGE_FAILURE rejection, distinguishable from a judged pass; a pass keeps its reason;
 * every stop names its cause; a wider sandbox alone is not out of scope). Techniques: UC, EP, BVA, DT, ST.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { REPO } from 'dsh-connector-test-helpers/legacy'

const SRC = path.join(REPO, 'packages', 'dsh-connector-watchdog', 'src')
const load = (file) => import(pathToFileURL(path.join(SRC, file)).href)
const { createWatchdog } = await load('core.js')
const { openBriefStore } = await load('store.js')
const { parseVerdict } = await load('verdict.js')
const { CODE, TOOL, VERDICT, DURING, DRIFT_EVENT, JUDGE_FAILURE, TEXT, JUDGE } = await load('constants.js')

const P = 'principal-p'
const Q = 'principal-q'
const ROOT = 'root-1'
const CHILD = 'child-1'
const CONFIG = Object.freeze({ minCheckIntervalSeconds: 60, readMaxMessages: 8, readMaxBytes: 8192, checkTimeoutSeconds: 30 })
/** DSH's atomic write is the host's; outside a host the cases write the file plainly. */
const write = (file, text) => fs.promises.writeFile(file, text)
const open = (dir, logger) => openBriefStore({ dir, logger, write })
const DESCRIPTOR = Object.freeze({ toolName: 'bash', reason: 'run tests', arguments: '{"command":"npm test"}', argumentsStatus: 'complete' })
/** A judge port answer that is not a verdict (the port resolves undefined: an unreadable answer). */
const UNREADABLE = Symbol('unreadable')
/** A judge port that never answers on its own: it rejects with the signal's reason when its signal aborts. */
const hangs = (signal) => new Promise((_resolve, reject) => {
  if (signal?.aborted) reject(signal.reason)
  else signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
})
const coded = (code, message = code) => Object.assign(new Error(message), { code })
const tick = () => new Promise((resolve) => setImmediate(resolve))
/** decide() rejected with an error whose code is `code`. */
const failsWith = (promise, code, what = code) => assert.rejects(promise, (e) => { assert.equal(e?.code, code, what + ': ' + String(e?.stack ?? e)); return true })

function fakeTimers() {
  const pending = new Map()
  let next = 0
  return {
    pending,
    setTimeout(fn, ms) { const id = ++next; pending.set(id, { fn, ms }); return id },
    clearTimeout(id) { pending.delete(id) },
    delays: () => [...pending.values()].map((t) => t.ms),
  }
}

async function world(t, { manager = P, messages = [], verdicts = [], config = CONFIG, start } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-core-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const logs = []
  const logger = { warn: (...args) => logs.push(args) }
  const state = { manager, messages: [...messages], stops: [], events: [], prompts: [], verdicts: [...verdicts], starts: [] }
  const self = {}
  const sessions = {
    rootOf: (id) => (id === CHILD ? ROOT : id),
    managerOf: (id) => (id === ROOT ? state.manager : undefined),
    read: async ({ maxMessages }) => ({ messages: state.messages.slice(-maxMessages), truncated: state.messages.length > maxMessages }),
    // Every stop is recorded with its input: each stop names its cause (requirement D4).
    stop: async (input) => { state.stops.push({ ...input }) },
    // dshConnectorSessions.start (requirement H): only when a case scripts one; the default world has none.
    ...(start ? { start: (input) => start(input, self) } : {}),
  }
  const emit = async (event) => { state.events.push(event); return { ok: true, eventId: 'e' + state.events.length } }
  const judge = {
    async judge(brief, prompt, signal) {
      state.prompts.push(prompt)
      const v = state.verdicts.shift()
      if (v instanceof Error) throw v
      if (v === UNREADABLE) return undefined
      if (typeof v === 'function') return v(signal)
      return v ?? { verdict: VERDICT.pass, reason: '' }
    },
  }
  const timers = fakeTimers()
  const store = await open(dir, logger)
  let connected = true
  const wd = createWatchdog({ store, services: () => (connected ? { sessions, emit } : undefined), judge, config, timers, now: () => 1, logger })
  t.after(() => wd.close())
  return Object.assign(self, { wd, store, state, timers, logs, dir, disconnect: () => { connected = false } })
}
const brief = (w, args = {}, who = P) => w.wd.call(TOOL.brief, { sessionId: ROOT, purpose: 'Fix the login bug', ...args }, who)
const permission = (w, sessionId = ROOT, descriptor = DESCRIPTOR, options = {}) => w.wd.delegate.decide({ sessionId, descriptor }, options)
const stopOf = (during, reason) => ({ sessionId: ROOT, reason: TEXT.drift(during, reason) })

test('UC: brief → claims → allow within scope; the judge sees purpose, scope, new messages and the request', async (t) => {
  const w = await world(t, { messages: [{ seq: 3, role: 'assistant', text: 'running tests' }], verdicts: [{ verdict: VERDICT.allow, reason: 'tests are in scope' }] })
  assert.equal(w.wd.delegate.claims(ROOT), false)
  const r = await brief(w, { scope: 'running the test suite' })
  assert.deepEqual(r, { ok: true, data: { sessionId: ROOT, purpose: 'Fix the login bug', scope: 'running the test suite', paused: false } })
  assert.equal(w.wd.delegate.claims(ROOT), true)
  assert.deepEqual(await permission(w), { verdict: VERDICT.allow, reason: 'tests are in scope' })
  const prompt = w.state.prompts[0]
  for (const part of ['Fix the login bug', 'running the test suite', '[assistant] running tests', 'tool "bash"', 'npm test']) assert.ok(prompt.includes(part), part)
  assert.equal(w.store.get(ROOT).watermark, 3)
})

test('EP: judged verdicts → allow, reject (a one-character reason is enough), pass with its reason, pass with an empty or no reason → bare pass', async (t) => {
  const w = await world(t, { verdicts: [
    { verdict: VERDICT.reject, reason: 'deletes the repo' }, { verdict: VERDICT.allow, reason: 'x' },
    { verdict: VERDICT.pass, reason: 'high risk' }, { verdict: VERDICT.pass, reason: '' }, { verdict: VERDICT.pass },
  ] })
  await brief(w)
  assert.deepEqual(await permission(w), { verdict: VERDICT.reject, reason: 'deletes the repo' })
  assert.deepEqual(await permission(w), { verdict: VERDICT.allow, reason: 'x' })
  assert.deepEqual(await permission(w), { verdict: VERDICT.pass, reason: 'high risk' })
  assert.deepEqual(await permission(w), { verdict: VERDICT.pass })
  assert.deepEqual(await permission(w), { verdict: VERDICT.pass })
  assert.equal(w.state.prompts.length, 5, 'every briefed request is judged')
  await tick(); await tick()
  assert.deepEqual(w.state.stops, [])
})

test('EP: JUDGE_FAILURE is exactly {timeout: judge-timeout, noAnswer: judge-no-answer, unreadable: judge-unreadable, failed: judge-failed}', () => {
  assert.deepEqual({ ...JUDGE_FAILURE }, { timeout: 'judge-timeout', noAnswer: 'judge-no-answer', unreadable: 'judge-unreadable', failed: 'judge-failed' })
})

// DT over the judge port's answer → decide's rejection code (each a failure: logged, no stop, no event).
const FAILURES = Object.freeze([
  ['the port resolves undefined (not a verdict)', UNREADABLE, JUDGE_FAILURE.unreadable],
  ['an unknown verdict', { verdict: 'maybe', reason: 'x' }, JUDGE_FAILURE.unreadable],
  ['the patrol-only verdict ok', { verdict: VERDICT.ok, reason: 'fine' }, JUDGE_FAILURE.unreadable],
  ['allow with an empty reason', { verdict: VERDICT.allow, reason: '' }, JUDGE_FAILURE.unreadable],
  ['reject with no reason', { verdict: VERDICT.reject }, JUDGE_FAILURE.unreadable],
  ['drifted with an empty reason', { verdict: VERDICT.drifted, reason: '' }, JUDGE_FAILURE.unreadable],
  ['a plain Error', new Error('judge down'), JUDGE_FAILURE.failed],
  ['an Error with a foreign code', coded('ENOENT'), JUDGE_FAILURE.failed],
  ['an Error with code judge-no-answer (kept)', coded(JUDGE_FAILURE.noAnswer), JUDGE_FAILURE.noAnswer],
  ['an Error with code judge-timeout (kept)', coded(JUDGE_FAILURE.timeout), JUDGE_FAILURE.timeout],
  ['an Error with code judge-unreadable (kept)', coded(JUDGE_FAILURE.unreadable), JUDGE_FAILURE.unreadable],
])
test('DT: a failed judgement rejects with its JUDGE_FAILURE code, is logged, and neither stops the session nor emits drift', async (t) => {
  const w = await world(t, { verdicts: FAILURES.map(([, answer]) => answer) })
  await brief(w)
  for (const [label, , code] of FAILURES) {
    const logged = w.logs.length
    await failsWith(permission(w), code, label)
    assert.ok(w.logs.length > logged, label + ': the failure was not logged')
  }
  await tick(); await tick()
  assert.deepEqual([w.state.stops, w.state.events], [[], []])
  assert.equal(w.wd.delegate.claims(ROOT), true, 'a failure changed the brief')
})

test('BVA: checkTimeoutSeconds — a judge that answers in time decides; one that does not → judge-timeout (logged)', async (t) => {
  const w = await world(t, { config: { ...CONFIG, checkTimeoutSeconds: 0.05 }, verdicts: [{ verdict: VERDICT.allow, reason: 'quick' }, hangs] })
  await brief(w)
  assert.deepEqual(await permission(w), { verdict: VERDICT.allow, reason: 'quick' })
  const logged = w.logs.length
  const started = Date.now()
  await failsWith(permission(w), JUDGE_FAILURE.timeout)
  assert.ok(Date.now() - started >= 40, 'timed out before checkTimeoutSeconds')
  assert.ok(w.logs.length > logged, 'the timeout was not logged')
})

test('ST: the caller\'s signal aborts while the judge runs → the rejection is that abort, not a JUDGE_FAILURE', async (t) => {
  const w = await world(t, { verdicts: [hangs] })
  await brief(w)
  const caller = new AbortController()
  const pending = permission(w, ROOT, DESCRIPTOR, { signal: caller.signal })
  await tick()
  caller.abort()
  await assert.rejects(pending, (e) => {
    assert.ok(!Object.values(JUDGE_FAILURE).includes(e?.code), 'a caller abort reported as ' + e?.code)
    assert.ok(e === caller.signal.reason || e?.name === 'AbortError', 'not the caller\'s abort: ' + String(e))
    return true
  })
  await tick(); await tick()
  assert.deepEqual(w.state.stops, [])
})

test('DT: no active brief (not briefed / paused / briefed by a former manager) → bare pass; the judge is not asked', async (t) => {
  const w = await world(t, { verdicts: [{ verdict: VERDICT.allow, reason: 'x' }, { verdict: VERDICT.allow, reason: 'x' }, { verdict: VERDICT.allow, reason: 'x' }] })
  assert.deepEqual(await permission(w), { verdict: VERDICT.pass }, 'not briefed')
  await brief(w)
  await w.wd.call(TOOL.pause, { sessionId: ROOT }, P)
  assert.deepEqual(await permission(w), { verdict: VERDICT.pass }, 'paused')
  await w.wd.call(TOOL.resume, { sessionId: ROOT }, P)
  w.state.manager = Q
  assert.deepEqual(await permission(w), { verdict: VERDICT.pass }, 'manager changed')
  assert.equal(w.state.prompts.length, 0, 'the judge was asked without an active brief')
})

// The exact request of the 2026-11-21 live run (requirement D5): a read-only ls asking for danger-full-access.
const LIVE = Object.freeze({
  purpose: 'Inspect the scratch folder and report what it contains. Read-only work only.',
  scope: 'Read-only commands such as ls, cat and grep that change no files, even when they ask for danger-full-access. Anything that writes, creates, deletes or moves files is out of scope.',
  descriptor: Object.freeze({
    toolName: 'bash', reason: 'escalate sandbox to danger-full-access: list the storage folder, read-only', argumentsStatus: 'complete',
    arguments: JSON.stringify({ description: 'List storage folder read-only', command: 'ls ~/.dsh/storages', sandbox_permissions: 'danger-full-access', justification: 'list the storage folder, read-only' }),
  }),
})
test('UC: the live sandbox case — the judge sees scope, command, danger-full-access and the sandbox rule; allow decides; a failing judge rejects with a JUDGE_FAILURE (not a pass)', async (t) => {
  const w = await world(t, { verdicts: [{ verdict: VERDICT.allow, reason: 'read-only ls is within the scope' }, UNREADABLE, new Error('side session lost')] })
  assert.equal((await brief(w, { purpose: LIVE.purpose, scope: LIVE.scope })).ok, true)
  assert.deepEqual(await permission(w, ROOT, LIVE.descriptor), { verdict: VERDICT.allow, reason: 'read-only ls is within the scope' })
  const prompt = w.state.prompts[0]
  for (const part of [LIVE.purpose, LIVE.scope, 'ls ~/.dsh/storages', 'danger-full-access', JUDGE.permissionRules]) assert.ok(prompt.includes(part), 'the judgement lacks ' + part)
  assert.match(JUDGE.permissionRules, /sandbox/i, 'the permission rules say nothing about a wider sandbox')
  await failsWith(permission(w, ROOT, LIVE.descriptor), JUDGE_FAILURE.unreadable)
  await failsWith(permission(w, ROOT, LIVE.descriptor), JUDGE_FAILURE.failed)
})

test('DT: drift during a permission rejects the call, then stops the turn with TEXT.drift(permission, reason) and emits drift to the manager', async (t) => {
  const w = await world(t, { verdicts: [{ verdict: VERDICT.drifted, reason: 'it is rewriting the billing module' }] })
  await brief(w)
  assert.deepEqual(await permission(w), { verdict: VERDICT.reject, reason: 'it is rewriting the billing module' })
  // The turn is stopped only after the request is answered (a stop would cancel the request itself).
  assert.deepEqual(w.state.stops, [])
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  // The stop names its cause: the manager's turn-finished then reads "(hook: …)", not "(user)".
  assert.deepEqual(w.state.stops, [stopOf(DURING.permission, 'it is rewriting the billing module')])
  assert.equal(w.state.stops[0].reason, 'Watchdog stopped the session (permission): it is rewriting the billing module')
  assert.equal(w.state.events.length, 1)
  const e = w.state.events[0]
  assert.deepEqual([e.event, e.sessionId, e.payload], [DRIFT_EVENT.name, ROOT, { sessionId: ROOT, during: DURING.permission, reason: 'it is rewriting the billing module' }])
  // Stopping is not pausing: the brief stays active, so the manager's next message is still supervised.
  assert.equal(w.wd.delegate.claims(ROOT), true)
})

test('ST: patrol — armed at brief; nothing new → no judgement; new messages → judged; drift → stop (TEXT.drift(patrol, reason)) + event; re-armed', async (t) => {
  const w = await world(t, { verdicts: [{ verdict: VERDICT.ok, reason: 'on track' }, { verdict: VERDICT.drifted, reason: 'off topic' }] })
  await brief(w)
  assert.deepEqual(w.timers.delays(), [CONFIG.minCheckIntervalSeconds * 1000])
  await w.wd.patrol(ROOT)
  assert.equal(w.state.prompts.length, 0, 'a patrol with no new messages judged')
  w.state.messages.push({ seq: 1, role: 'assistant', text: 'step one' })
  await w.wd.patrol(ROOT)
  assert.equal(w.state.prompts.length, 1)
  await w.wd.patrol(ROOT)
  assert.equal(w.state.prompts.length, 1, 'the watermark did not advance')
  w.state.messages.push({ seq: 2, role: 'assistant', text: 'browsing news' })
  await w.wd.patrol(ROOT)
  assert.ok(w.state.prompts[1].includes('browsing news') && !w.state.prompts[1].includes('step one'))
  assert.deepEqual(w.state.stops, [stopOf(DURING.patrol, 'off topic')])
  assert.equal(w.state.stops[0].reason, 'Watchdog stopped the session (patrol): off topic')
  assert.equal(w.state.events[0].payload.during, DURING.patrol)
  assert.equal(w.timers.pending.size, 1, 'one timer per supervised session')
})

test('ST: a patrol whose judgement fails (a throw, an unreadable answer) is logged and re-armed; nothing is stopped', async (t) => {
  const w = await world(t, { verdicts: [new Error('judge down'), UNREADABLE] })
  await brief(w)
  for (const [seq, label] of [[1, 'throw'], [2, 'unreadable']]) {
    w.state.messages.push({ seq, role: 'assistant', text: 'step ' + seq })
    const logged = w.logs.length
    await w.wd.patrol(ROOT)
    assert.equal(w.state.prompts.length, seq, label + ': not judged')
    assert.ok(w.logs.length > logged, label + ': the failed patrol was not logged')
    assert.equal(w.timers.pending.size, 1, label + ': the patrol was not re-armed')
  }
  assert.deepEqual([w.state.stops, w.state.events], [[], []])
})

test('ST: refine keeps the timer; pause stops the session with TEXT.paused, disarms and passes; resume re-arms', async (t) => {
  const w = await world(t)
  await brief(w)
  const [timer] = w.timers.pending.keys()
  const refined = await w.wd.call(TOOL.refine, { sessionId: ROOT, scope: 'read-only commands' }, P)
  assert.equal(refined.data.scope, 'read-only commands')
  assert.deepEqual([...w.timers.pending.keys()], [timer], 'a refine moved the patrol timer')
  const paused = await w.wd.call(TOOL.pause, { sessionId: ROOT }, P)
  assert.equal(paused.data.paused, true)
  assert.ok(typeof TEXT.paused === 'string' && TEXT.paused.trim() !== '', 'TEXT.paused is no non-empty string')
  assert.deepEqual(w.state.stops, [{ sessionId: ROOT, reason: TEXT.paused }])
  assert.equal(w.timers.pending.size, 0)
  assert.equal(w.wd.delegate.claims(ROOT), false)
  assert.deepEqual(await permission(w), { verdict: VERDICT.pass })
  const resumed = await w.wd.call(TOOL.resume, { sessionId: ROOT }, P)
  assert.equal(resumed.data.paused, false)
  assert.equal(w.timers.pending.size, 1)
  assert.equal(w.wd.delegate.claims(ROOT), true)
})

test('EP: tool refusals — not the manager, unbriefed, empty purpose, nothing to refine, briefed twice', async (t) => {
  const w = await world(t)
  assert.deepEqual(await brief(w, {}, Q), { ok: false, code: CODE.forbidden })
  assert.deepEqual(await brief(w, { purpose: '   ' }), { ok: false, code: CODE.emptyPurpose })
  for (const tool of [TOOL.refine, TOOL.pause, TOOL.resume]) assert.deepEqual(await w.wd.call(tool, { sessionId: ROOT, purpose: 'x' }, P), { ok: false, code: CODE.notBriefed }, tool)
  await brief(w)
  assert.deepEqual(await brief(w), { ok: false, code: CODE.conflict })
  assert.deepEqual(await w.wd.call(TOOL.refine, { sessionId: ROOT }, P), { ok: false, code: CODE.nothingToRefine })
  assert.deepEqual(await w.wd.call(TOOL.refine, { sessionId: ROOT, purpose: '' }, P), { ok: false, code: CODE.emptyPurpose })
  assert.deepEqual(await w.wd.call(TOOL.pause, { sessionId: 'unknown' }, P), { ok: false, code: CODE.forbidden })
})

test('DT: a subagent id briefs its root; a new manager neither inherits nor may use the old brief, but may brief again', async (t) => {
  const w = await world(t)
  assert.equal((await w.wd.call(TOOL.brief, { sessionId: CHILD, purpose: 'p' }, P)).data.sessionId, ROOT)
  w.state.manager = Q
  assert.equal(w.wd.delegate.claims(ROOT), false, 'a brief from a former manager still claims')
  assert.deepEqual(await w.wd.call(TOOL.refine, { sessionId: ROOT, purpose: 'q' }, Q), { ok: false, code: CODE.notBriefed })
  assert.equal((await brief(w, { purpose: 'Q purpose' }, Q)).ok, true)
  assert.equal(w.store.get(ROOT).principalKey, Q)
  assert.equal(w.wd.delegate.claims(ROOT), true)
})

test('EP: without the connector services Watchdog passes and refuses its tools', async (t) => {
  const w = await world(t)
  await brief(w)
  w.disconnect()
  assert.equal(w.wd.delegate.claims(ROOT), false)
  assert.deepEqual(await brief(w), { ok: false, code: CODE.forbidden })
})

test('ST: briefs persist — a reopened store has them, and start() re-arms only unpaused ones', async (t) => {
  const w = await world(t)
  await brief(w)
  await w.wd.call(TOOL.brief, { sessionId: 'root-2', purpose: 'x' }, P).catch(() => undefined)
  await w.store.drain()
  const reopened = await open(w.dir, { warn() {} })
  assert.equal(reopened.get(ROOT).purpose, 'Fix the login bug')
  await reopened.update(ROOT, { paused: true })
  await reopened.drain()
  const timers = fakeTimers()
  const wd = createWatchdog({ store: await open(w.dir, { warn() {} }), services: () => undefined, judge: {}, config: CONFIG, timers, logger: { warn() {} } })
  wd.start()
  assert.equal(timers.pending.size, 0, 'a paused brief was armed after a restart')
  wd.close()
})

test('EP: a corrupt briefs file is logged and read as empty', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-corrupt-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, 'briefs.json'), '{not json')
  const logs = []
  const store = await open(dir, { warn: (...a) => logs.push(a) })
  assert.deepEqual(store.list(), [])
  assert.equal(logs.length, 1)
})

test('EP: parseVerdict reads the first JSON object with a string verdict → {verdict, reason}; a non-string reason reads as ""', () => {
  assert.deepEqual(parseVerdict('Here: {"verdict":"allow","reason":"ok"}'), { verdict: 'allow', reason: 'ok' })
  assert.deepEqual(parseVerdict('{"verdict":"pass","reason":"the manager decides"} and some trailing words'), { verdict: 'pass', reason: 'the manager decides' })
  assert.deepEqual(parseVerdict('{"verdict":"reject"}'), { verdict: 'reject', reason: '' })
  assert.deepEqual(parseVerdict('{"verdict":"allow","reason":5}'), { verdict: 'allow', reason: '' })
  assert.deepEqual(parseVerdict('{"verdict":"allow","reason":null}'), { verdict: 'allow', reason: '' })
  // parseVerdict only reads; an unknown verdict word is the caller's to refuse (judge-unreadable).
  assert.deepEqual(parseVerdict('{"verdict":"maybe","reason":"x"}'), { verdict: 'maybe', reason: 'x' })
})

test('EP: parseVerdict → undefined for no object, invalid JSON, no verdict or a non-string verdict', () => {
  for (const text of ['', 'allow', 'I am not sure.', '{broken', '{"reason":"no verdict"}', '{"verdict":1,"reason":"x"}', '{"verdict":null}', '{"verdict":["allow"]}']) {
    assert.equal(parseVerdict(text), undefined, JSON.stringify(text))
  }
})

// ------------------------------------------------------------------------------------------------ watchdog_session_start (requirement H)

const START_ARGS = Object.freeze({ folder: '/work/login', title: 'Login fix', message: 'Fix the login bug', attachments: [] })
/** watchdog_session_start as `who` calls it. */
const startCall = (w, args = {}, who = P) => w.wd.call(TOOL.sessionStart, { ...START_ARGS, purpose: 'Fix the login bug', ...args }, who)
/**
 * A scripted dshConnectorSessions.start: records its input, makes `manager` manage ROOT (as the
 * connector does before afterManaged), awaits afterManaged(ROOT, managed) and records what Watchdog
 * had set up at that moment, then answers `answer`.
 */
const startsWith = ({ managed = true, manager = (k) => k, answer = {} } = {}) => async (input, w) => {
  w.state.starts.push({ principalKey: input.principalKey, args: { ...input.args }, afterManaged: typeof input.afterManaged })
  if (managed) w.state.manager = manager(input.principalKey)
  await input.afterManaged?.(ROOT, managed)
  w.state.duringStart = { claims: w.wd.delegate.claims(ROOT), brief: w.store.get(ROOT) ? { ...w.store.get(ROOT) } : undefined, timers: w.timers.pending.size }
  return { ok: true, sessionId: ROOT, managed, running: true, ...answer }
}
/** A scripted start that refuses with `code` before anything is created (afterManaged is never called). */
const refusesWith = (code) => async (input, w) => { w.state.starts.push({ principalKey: input.principalKey, args: { ...input.args } }); return { ok: false, code } }

test('EP: TOOL.sessionStart is watchdog_session_start; watchdog_brief\'s description points to it', () => {
  assert.equal(TOOL.sessionStart, 'watchdog_session_start')
  assert.ok(TEXT.brief.includes('watchdog_session_start'), 'TEXT.brief does not mention watchdog_session_start')
})

test('UC: watchdog_session_start → start(principalKey, args without purpose and scope); briefed inside afterManaged (brief stored, patrol armed, delegate claims) → {ok, data: start\'s fields + supervised: true}', async (t) => {
  const w = await world(t, { manager: undefined, start: startsWith(), verdicts: [{ verdict: VERDICT.allow, reason: 'in scope' }] })
  const r = await startCall(w, { scope: 'running the test suite', model: 'fake/fbtest', reasoningEffort: 'high' })
  assert.deepEqual(w.state.starts, [{ principalKey: P, args: { ...START_ARGS, model: 'fake/fbtest', reasoningEffort: 'high' }, afterManaged: 'function' }])
  assert.deepEqual(r, { ok: true, data: { sessionId: ROOT, managed: true, running: true, supervised: true } })
  // Inside afterManaged (before the first message): the brief already holds.
  assert.equal(w.state.duringStart.claims, true, 'the delegate did not claim the session inside afterManaged')
  assert.deepEqual([w.state.duringStart.brief?.purpose, w.state.duringStart.brief?.scope, w.state.duringStart.brief?.principalKey], ['Fix the login bug', 'running the test suite', P])
  assert.deepEqual(w.timers.delays(), [CONFIG.minCheckIntervalSeconds * 1000], 'the patrol was not armed')
  // The very first request is judged against that brief.
  assert.deepEqual(await permission(w), { verdict: VERDICT.allow, reason: 'in scope' })
  assert.ok(w.state.prompts[0].includes('running the test suite'))
})

test('EP: the start\'s optional fields pass through (titleError, workspaceError); no scope → the brief\'s scope is ""; purpose is trimmed as watchdog_brief trims it', async (t) => {
  const w = await world(t, { manager: undefined, start: startsWith({ answer: { titleError: 'title-failed', workspaceError: 'workspace-failed' } }) })
  const r = await startCall(w, { purpose: '  Fix the login bug  ' })
  assert.deepEqual(r, { ok: true, data: { sessionId: ROOT, managed: true, running: true, titleError: 'title-failed', workspaceError: 'workspace-failed', supervised: true } })
  assert.deepEqual(w.state.starts[0].args, START_ARGS, 'purpose or scope reached session_start')
  assert.deepEqual([w.store.get(ROOT).purpose, w.store.get(ROOT).scope], ['Fix the login bug', ''])
})

test('ST: a session started by watchdog_session_start is briefed exactly as by watchdog_brief — a second brief → conflict; refine, pause, resume work for the same principal', async (t) => {
  const w = await world(t, { manager: undefined, start: startsWith() })
  assert.equal((await startCall(w, { scope: 'tests' })).data.supervised, true)
  assert.deepEqual(await brief(w), { ok: false, code: CODE.conflict })
  assert.equal((await w.wd.call(TOOL.refine, { sessionId: ROOT, scope: 'read-only' }, P)).data.scope, 'read-only')
  assert.equal((await w.wd.call(TOOL.pause, { sessionId: ROOT }, P)).data.paused, true)
  assert.equal(w.wd.delegate.claims(ROOT), false)
  assert.equal((await w.wd.call(TOOL.resume, { sessionId: ROOT }, P)).data.paused, false)
  assert.equal(w.wd.delegate.claims(ROOT), true)
})

// DT over purpose × connector services → refused before session_start is called.
test('DT: an empty or whitespace purpose → empty-purpose and sessions.start is NOT called', async (t) => {
  const w = await world(t, { manager: undefined, start: startsWith() })
  for (const purpose of ['', ' ', '\t\n  ']) assert.deepEqual(await startCall(w, { purpose }), { ok: false, code: CODE.emptyPurpose }, JSON.stringify(purpose))
  assert.deepEqual(w.state.starts, [])
  assert.equal(w.wd.delegate.claims(ROOT), false)
})

test('DT: no connector services, or a dshConnectorSessions without start → forbidden; nothing briefed', async (t) => {
  const without = await world(t)
  assert.deepEqual(await startCall(without), { ok: false, code: CODE.forbidden }, 'sessions without start')
  assert.equal(without.store.get(ROOT), undefined)
  const offline = await world(t, { manager: undefined, start: startsWith() })
  offline.disconnect()
  assert.deepEqual(await startCall(offline), { ok: false, code: CODE.forbidden }, 'no connector services')
  assert.deepEqual(offline.state.starts, [])
})

test('DT: afterManaged(sessionId, managed: false) → nothing briefed; answer {ok, data: {managed: false, supervised: false}}', async (t) => {
  const w = await world(t, { manager: undefined, start: startsWith({ managed: false }) })
  const r = await startCall(w, { scope: 'tests' })
  assert.deepEqual(r, { ok: true, data: { sessionId: ROOT, managed: false, running: true, supervised: false } })
  assert.equal(w.store.get(ROOT), undefined, 'an unmanaged session was briefed')
  assert.equal(w.wd.delegate.claims(ROOT), false)
  assert.equal(w.timers.pending.size, 0, 'a patrol was armed for an unmanaged session')
})

test('DT: managed but by another principal when afterManaged runs → the brief does not take effect: supervised false, nothing claimed', async (t) => {
  const w = await world(t, { manager: undefined, start: startsWith({ manager: () => Q }) })
  const r = await startCall(w)
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.data.supervised, false)
  assert.equal(w.wd.delegate.claims(ROOT), false)
})

// DT over session_start's refusal code → watchdog_session_start's refusal (the code kept, its message names it).
const START_REFUSALS = Object.freeze(['invalid-arguments', 'limit-exceeded', 'unknown-session', 'forbidden', 'invalid-decision', 'operation-failed'])
test('DT: session_start refuses → {ok: false, code: start\'s code, message: "session_start refused: <code>"}; nothing briefed', async (t) => {
  for (const code of START_REFUSALS) {
    const w = await world(t, { manager: undefined, start: refusesWith(code) })
    const r = await startCall(w, { scope: 'tests' })
    assert.deepEqual(r, { ok: false, code, message: 'session_start refused: ' + code }, code)
    assert.equal(r.message, TEXT.startRefused(code), code)
    assert.equal(w.state.starts.length, 1, code + ': start was not called once')
    assert.equal(w.store.get(ROOT), undefined, code + ': briefed after a refusal')
    assert.equal(w.timers.pending.size, 0, code)
  }
})

