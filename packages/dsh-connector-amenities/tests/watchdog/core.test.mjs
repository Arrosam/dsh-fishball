/**
 * dsh-connector-watchdog's behaviour (packages/dsh-connector-amenities/watchdog/src/core.js and
 * store.js) over fake connector services, a fake judge and fake timers; no DSH is booted. Sources:
 * docs/watchdog-project-notes.md §2–§3 and the user's decisions of 2026-11-20 (drift = event +
 * stop; Fishball may still message a stopped session; settlements are the connector's; escalation
 * deferred; briefs persist). Techniques: UC, EP, DT, ST.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { REPO } from '../../../../test/support/constants.mjs'

const SRC = path.join(REPO, 'packages', 'dsh-connector-amenities', 'watchdog', 'src')
const load = (file) => import(pathToFileURL(path.join(SRC, file)).href)
const { createWatchdog } = await load('core.js')
const { openBriefStore } = await load('store.js')
const { parseVerdict } = await load('verdict.js')
const { CODE, TOOL, VERDICT, DURING, DRIFT_EVENT } = await load('constants.js')

const P = 'principal-p'
const Q = 'principal-q'
const ROOT = 'root-1'
const CHILD = 'child-1'
const CONFIG = Object.freeze({ minCheckIntervalSeconds: 60, readMaxMessages: 8, readMaxBytes: 8192, checkTimeoutSeconds: 30 })
/** DSH's atomic write is the host's; outside a host the cases write the file plainly. */
const write = (file, text) => fs.promises.writeFile(file, text)
const open = (dir, logger) => openBriefStore({ dir, logger, write })
const DESCRIPTOR = Object.freeze({ toolName: 'bash', reason: 'run tests', arguments: '{"command":"npm test"}', argumentsStatus: 'complete' })

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

async function world(t, { manager = P, messages = [], verdicts = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-core-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const logs = []
  const logger = { warn: (...args) => logs.push(args) }
  const state = { manager, messages: [...messages], stops: [], events: [], prompts: [], verdicts: [...verdicts] }
  const sessions = {
    rootOf: (id) => (id === CHILD ? ROOT : id),
    managerOf: (id) => (id === ROOT ? state.manager : undefined),
    read: async ({ maxMessages }) => ({ messages: state.messages.slice(-maxMessages), truncated: state.messages.length > maxMessages }),
    stop: async ({ sessionId }) => { state.stops.push(sessionId) },
  }
  const emit = async (event) => { state.events.push(event); return { ok: true, eventId: 'e' + state.events.length } }
  const judge = {
    async judge(brief, prompt) {
      state.prompts.push(prompt)
      const v = state.verdicts.shift()
      if (v instanceof Error) throw v
      return v ?? { verdict: VERDICT.pass, reason: '' }
    },
  }
  const timers = fakeTimers()
  const store = await open(dir, logger)
  let connected = true
  const wd = createWatchdog({ store, services: () => (connected ? { sessions, emit } : undefined), judge, config: CONFIG, timers, now: () => 1, logger })
  t.after(() => wd.close())
  return { wd, store, state, timers, logs, dir, disconnect: () => { connected = false } }
}
const brief = (w, args = {}, who = P) => w.wd.call(TOOL.brief, { sessionId: ROOT, purpose: 'Fix the login bug', ...args }, who)
const permission = (w, sessionId = ROOT) => w.wd.delegate.decide({ sessionId, descriptor: DESCRIPTOR }, {})

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

test('EP: permission verdicts → allow, reject, pass; nonsense, a throw or an empty reason pass', async (t) => {
  const w = await world(t, { verdicts: [
    { verdict: VERDICT.reject, reason: 'deletes the repo' }, { verdict: VERDICT.pass, reason: 'high risk' },
    { verdict: 'maybe', reason: 'x' }, new Error('judge down'), { verdict: VERDICT.allow, reason: '' },
  ] })
  await brief(w)
  assert.deepEqual(await permission(w), { verdict: VERDICT.reject, reason: 'deletes the repo' })
  for (let i = 0; i < 4; i++) assert.deepEqual(await permission(w), { verdict: VERDICT.pass })
  assert.equal(w.state.stops.length, 0)
})

test('DT: drift during a permission rejects the call, stops the turn and emits drift to the manager', async (t) => {
  const w = await world(t, { verdicts: [{ verdict: VERDICT.drifted, reason: 'it is rewriting the billing module' }] })
  await brief(w)
  assert.deepEqual(await permission(w), { verdict: VERDICT.reject, reason: 'it is rewriting the billing module' })
  assert.deepEqual(w.state.stops, [ROOT])
  assert.equal(w.state.events.length, 1)
  const e = w.state.events[0]
  assert.deepEqual([e.event, e.sessionId, e.payload], [DRIFT_EVENT.name, ROOT, { sessionId: ROOT, during: DURING.permission, reason: 'it is rewriting the billing module' }])
  // Stopping is not pausing: the brief stays active, so the manager's next message is still supervised.
  assert.equal(w.wd.delegate.claims(ROOT), true)
})

test('ST: patrol — armed at brief; nothing new → no judgement; new messages → judged; drift → stop + event; re-armed', async (t) => {
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
  assert.deepEqual(w.state.stops, [ROOT])
  assert.equal(w.state.events[0].payload.during, DURING.patrol)
  assert.equal(w.timers.pending.size, 1, 'one timer per supervised session')
})

test('ST: refine keeps the timer; pause stops the session, disarms and passes; resume re-arms', async (t) => {
  const w = await world(t)
  await brief(w)
  const [timer] = w.timers.pending.keys()
  const refined = await w.wd.call(TOOL.refine, { sessionId: ROOT, scope: 'read-only commands' }, P)
  assert.equal(refined.data.scope, 'read-only commands')
  assert.deepEqual([...w.timers.pending.keys()], [timer], 'a refine moved the patrol timer')
  const paused = await w.wd.call(TOOL.pause, { sessionId: ROOT }, P)
  assert.equal(paused.data.paused, true)
  assert.deepEqual(w.state.stops, [ROOT])
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

test('EP: parseVerdict reads the first JSON object; anything else passes', () => {
  assert.deepEqual(parseVerdict('Here: {"verdict":"allow","reason":"ok"}'), { verdict: 'allow', reason: 'ok' })
  for (const text of ['', 'allow', '{"reason":"no verdict"}', '{broken']) assert.equal(parseVerdict(text).verdict, VERDICT.pass, text)
})