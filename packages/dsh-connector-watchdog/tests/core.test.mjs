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
import { REPO } from '../../../test/support/constants.mjs'

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

async function world(t, { manager = P, messages = [], verdicts = [], config = CONFIG } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-core-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const logs = []
  const logger = { warn: (...args) => logs.push(args) }
  const state = { manager, messages: [...messages], stops: [], events: [], prompts: [], verdicts: [...verdicts] }
  const sessions = {
    rootOf: (id) => (id === CHILD ? ROOT : id),
    managerOf: (id) => (id === ROOT ? state.manager : undefined),
    read: async ({ maxMessages }) => ({ messages: state.messages.slice(-maxMessages), truncated: state.messages.length > maxMessages }),
    // Every stop is recorded with its input: each stop names its cause (requirement D4).
    stop: async (input) => { state.stops.push({ ...input }) },
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
  return { wd, store, state, timers, logs, dir, disconnect: () => { connected = false } }
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
