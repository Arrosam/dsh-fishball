/**
 * CONN-REPORT system rows (the user's approved requirements, 2026-11-21) on a real DSH with the
 * scripted fake model, reached only over MCP and DSH's own controls (extension.mjs):
 * - A1: no `state` event for a managed session across start → run → idle;
 * - A2: session_start / session_message / session_redirect successes carry `running: boolean`;
 * - B: one turn-finished per standstill of the root, its outcome and report: completed with the final
 *   text; a provider error and the user's Stop → stopped with {kind, message}; the manager's own stop
 *   (session_stop, the cancel of session_redirect) → none for that turn; a subagent still running
 *   holds the report until it settles. (A background job's hold is the integration row
 *   tests/report CONN-REPORT-ST-01 rows 8–12: this fixture model starts no DSH job cheaply.)
 * A3 (no principal settlement) is the re-baselined APR-04 / APR-05r / FLW-03 / PLN-02 rows; user
 * and delegate settlements still arrive in APR-07, FLW-05, FLW-12, PLN-07 and DLG-01.
 * - CONN-STOP: dshConnectorSessions.stop with / without a reason → hook / user cause in stop.message.
 * Techniques: UC (the cycle), EP (each way a turn ends), DT (stop reason), ST (held → settled; stopped → next turn).
 */
import assert from 'node:assert/strict'
import { A, answer, cid, eventually, free, managed, ofType, okCall, pending, principal, quiet, step, tok, waitEvents, world } from 'dsh-connector-test-helpers/connector-world/interactions'
import { EVENT_TYPE, FIXTURE, IX, K1, TOOL } from 'dsh-connector-test-helpers/connector-world/interactions-constants'
import { row } from 'dsh-connector-test-helpers/connector-world/rows'

const ET = EVENT_TYPE
const { TURN_OUTCOME: O } = K1
/** DSH's words: the turn-end kinds and the user's cancel cause (dsh-session TurnEndReason). */
const KIND = Object.freeze({ error: 'error', aborted: 'aborted', user: 'user', assistant: 'assistant/message' })
/** The fake model's failure (support fake-llm `{fail: code}`: a code DSH's retry does not retry, message 'fbtest model failure'). */
const FAIL = Object.freeze({ code: 'FBTEST_NO_RETRY', message: 'fbtest model failure' })
/** The requirement's words for a cancelled turn's stop.message (sessions.d.ts, the user 2026-11-21). */
const STOP = Object.freeze({ reason: 'fbtest plugin stop: off purpose', hook: (reason) => `the turn was cancelled (hook: ${reason})`, user: 'the turn was cancelled (user)' })

// The native wire suite checks the additive provenance fields separately.
const legacyReportPayload = ({ turnFinal: _turnFinal, assignment: _assignment, ...legacy }) => legacy

const turnsOf = async (p, sid) => ofType(await pending(p.client), ET.turnFinished).filter((e) => e.sourceSessionId === sid)
const statesOf = async (p, sid) => ofType(await pending(p.client), ET.state).filter((e) => e.sourceSessionId === sid || e.payload?.sessionId === sid)
/** Waits for the `n`th turn-finished of `sid`, then a quiet period, and returns them all. */
async function turnsAfter(p, sid, n) {
  await waitEvents(p.client, (e) => ofType(e, ET.turnFinished).filter((x) => x.sourceSessionId === sid).length >= n, `turn-finished #${n} of ${sid}`)
  await quiet()
  return turnsOf(p, sid)
}
/** The text of the session's last assistant message (DSH's log), as the report's oracle. */
async function lastAssistantText(w, sid) {
  const said = (await w.call('events', { sessionId: sid })).filter((e) => e.type === KIND.assistant && e.text.trim() !== '')
  return said.at(-1)?.text.trim()
}
/** A held turn: the model's first request of `sid` waits until releaseHold. */
async function heldTurn(w, sid, script = [[{ text: tok('held') }]]) {
  await free(w, sid)
  await w.call('holdNext', { sessionId: sid })
  await w.call('driveStart', { sessionId: sid, text: tok('u'), script })
  assert.ok(await eventually(() => w.call('isHeld', { sessionId: sid })), 'the turn is not held')
}
const release = (w, sid) => w.call('releaseHold', { sessionId: sid })
/** A stopped report: {sessionId, outcome stopped, stop {kind, message ∋ words}}, no finalMessage. */
function assertStopped(e, sid, kind, words) {
  assert.deepEqual(Object.keys(e.payload).sort(), ['outcome', 'sessionId', 'stop'], JSON.stringify(e.payload))
  assert.deepEqual([e.payload.sessionId, e.payload.outcome, e.payload.stop.kind], [sid, O.stopped, kind])
  for (const word of words) assert.ok(e.payload.stop.message.includes(word), `stop.message ${JSON.stringify(e.payload.stop.message)} lacks ${word}`)
}

export function registerReportSystemCases(sdk) {
  const w0 = () => world(sdk)

  row(sdk, 'CONN-REPORT-UC-01', 'UC (session_start → run → idle)', 'session_start → {sessionId, managed: true, running: boolean}; the first turn ends → exactly one turn-finished {sessionId, outcome completed, finalMessage = the last assistant text, truncated false}; no state event at all (A1)', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const folder = await w.call('folder', { name: tok('rep') })
    const s = await okCall(p.client, TOOL.sessionStart, { folder, title: FIXTURE.title, message: tok('first'), attachments: [] })
    assert.equal(s.managed, true)
    assert.equal(typeof s.running, 'boolean', 'session_start has no running boolean (A2)')
    await w.call('waitIdle', { sessionId: s.sessionId })
    const [e, ...more] = await turnsAfter(p, s.sessionId, 1)
    assert.deepEqual(more, [], 'more than one turn-finished for one standstill')
    assert.deepEqual(legacyReportPayload(e.payload), { sessionId: s.sessionId, outcome: O.completed, finalMessage: { text: await lastAssistantText(w, s.sessionId), truncated: false } })
    assert.deepEqual(await statesOf(p, s.sessionId), [], 'a state event was produced (A1)')
  })
  row(sdk, 'CONN-REPORT-UC-01', 'ST (session_message to an idle session → its turn ends)', 'session_message on an idle managed session → {status, running: true} (its turn is running, held); released → one more turn-finished, completed; no state event', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await free(w, sid)
    const before = (await turnsOf(p, sid)).length
    await w.call('holdNext', { sessionId: sid })
    const r = await okCall(p.client, TOOL.sessionMessage, { sessionId: sid, message: tok('msg'), attachments: [] })
    assert.equal(r.running, true, `session_message's running after a delivery that started a turn: ${JSON.stringify(r)}`)
    await release(w, sid)
    await w.call('idle', { sessionId: sid })
    const all = await turnsAfter(p, sid, before + 1)
    assert.equal(all.length, before + 1)
    assert.equal(all.at(-1).payload.outcome, O.completed)
    assert.deepEqual(await statesOf(p, sid), [])
  })
  row(sdk, 'CONN-REPORT-UC-01', 'EP (session_message while running)', 'session_message while the turn runs (held) → running true; when everything settles, exactly one turn-finished for both inputs', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await heldTurn(w, sid)
    const before = (await turnsOf(p, sid)).length
    const r = await okCall(p.client, TOOL.sessionMessage, { sessionId: sid, message: tok('more'), attachments: [] })
    assert.equal(r.running, true)
    await release(w, sid)
    await w.call('idle', { sessionId: sid })
    const all = await turnsAfter(p, sid, before + 1)
    assert.equal(all.length, before + 1, 'a turn end with the message still queued was reported (B2)')
    assert.equal(all.at(-1).payload.outcome, O.completed)
  })

  // B5: unexpected stops.
  row(sdk, 'CONN-REPORT-EP-05', 'EP (provider error)', 'the model fails (a non-retried code) → one turn-finished {outcome stopped, stop {kind error, message with the code and message}}, no finalMessage', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await free(w, sid)
    const before = (await turnsOf(p, sid)).length
    await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [[{ text: tok('partial') }, { fail: FAIL.code }]] })
    await w.call('idle', { sessionId: sid })
    const all = await turnsAfter(p, sid, before + 1)
    assert.equal(all.length, before + 1)
    assertStopped(all.at(-1), sid, KIND.error, [FAIL.code, FAIL.message])
  })
  row(sdk, 'CONN-REPORT-EP-05', 'EP (the user\'s Stop)', 'the user stops the turn in DSH (not via MCP) → one turn-finished {outcome stopped, stop {kind aborted, message naming the user}}', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await heldTurn(w, sid)
    const before = (await turnsOf(p, sid)).length
    await w.call('cancel', { sessionId: sid })
    await release(w, sid)
    await w.call('idle', { sessionId: sid })
    const all = await turnsAfter(p, sid, before + 1)
    assert.equal(all.length, before + 1)
    assertStopped(all.at(-1), sid, KIND.aborted, [KIND.user])
  })

  // The plugin-facing Stop (dshConnectorSessions.stop, the user 2026-11-21): a non-empty reason cancels
  // with DSH's {kind: 'hook', reason} cause, so the manager can tell a plugin's stop from the user's.
  // DT over reason: non-empty → hook; absent, empty or whitespace-only → user (the implementer's
  // stated rule for '' / whitespace, 2026-11-21).
  for (const [label, input, message] of [
    ['a reason', { reason: STOP.reason }, STOP.hook(STOP.reason)],
    ['no reason', {}, STOP.user],
    ['an empty reason', { reason: '' }, STOP.user],
    ['a whitespace-only reason', { reason: '   ' }, STOP.user],
  ]) {
    row(sdk, 'CONN-STOP-DT-01', `DT (dshConnectorSessions.stop with ${label})`, `a plugin stops a running managed turn → one turn-finished {outcome stopped, stop {kind aborted, message ${JSON.stringify(message)}}}`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      await heldTurn(w, sid)
      const before = (await turnsOf(p, sid)).length
      const r = await w.service(IX.delegate.service, 'stop', { sessionId: sid, ...input })
      assert.ok(!r.threw && !r.absent, JSON.stringify(r))
      await release(w, sid)
      await w.call('idle', { sessionId: sid })
      const all = await turnsAfter(p, sid, before + 1)
      assert.equal(all.length, before + 1)
      assertStopped(all.at(-1), sid, KIND.aborted, [])
      assert.equal(all.at(-1).payload.stop.message, message)
      // The session still takes messages after a plugin's stop (sessions.d.ts).
      assert.equal((await okCall(p.client, TOOL.sessionMessage, { sessionId: sid, message: tok('after'), attachments: [] })).ok, true)
      await free(w, sid)
    })
  }

  // B4: the manager's own stop.
  row(sdk, 'CONN-REPORT-ST-03', 'ST (session_stop)', 'session_stop of a running turn → {stopped: true}; that turn end produces no turn-finished at all', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await heldTurn(w, sid)
    const before = (await turnsOf(p, sid)).length
    assert.equal((await okCall(p.client, TOOL.sessionStop, { sessionId: sid })).stopped, true)
    await release(w, sid)
    await w.call('idle', { sessionId: sid })
    await quiet(); await quiet()
    assert.equal((await turnsOf(p, sid)).length, before, 'the manager\'s own stop produced a turn-finished (B4)')
  })
  row(sdk, 'CONN-REPORT-ST-03', 'ST (session_redirect)', 'session_redirect of a running turn → {status, running: true}; none for the cancelled turn; the redirected message\'s turn ends → exactly one turn-finished, completed, with its final text', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await heldTurn(w, sid)
    const before = (await turnsOf(p, sid)).length
    const r = await okCall(p.client, TOOL.sessionRedirect, { sessionId: sid, message: tok('redirect'), attachments: [] })
    assert.equal(typeof r.running, 'boolean', 'session_redirect has no running boolean (A2)')
    await release(w, sid)
    await w.call('idle', { sessionId: sid })
    const all = await turnsAfter(p, sid, before + 1)
    assert.equal(all.length, before + 1, 'not exactly one turn-finished across the cancel and the redirected turn')
    assert.deepEqual(legacyReportPayload(all.at(-1).payload), { sessionId: sid, outcome: O.completed, finalMessage: { text: await lastAssistantText(w, sid), truncated: false } })
  })
  row(sdk, 'CONN-REPORT-ST-03', 'ST (session_redirect of an idle session)', 'session_redirect on an idle session → running boolean; its turn ends → exactly one turn-finished, completed', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await free(w, sid)
    const before = (await turnsOf(p, sid)).length
    const r = await okCall(p.client, TOOL.sessionRedirect, { sessionId: sid, message: tok('redirect'), attachments: [] })
    assert.equal(typeof r.running, 'boolean')
    await w.call('idle', { sessionId: sid })
    const all = await turnsAfter(p, sid, before + 1)
    assert.equal(all.length, before + 1)
    assert.equal(all.at(-1).payload.outcome, O.completed)
  })

  // The user's decision of 2026-11-21: the manager's stop stops the whole tree (subagents and jobs), so the
  // session truly stands still; a manager stop still emits no turn-finished.
  for (const rootRunning of [false, true]) {
    row(sdk, 'CONN-TREE-STOP-UC-01', rootRunning ? 'root running' : 'root idle, subagent running', `session_stop while ${rootRunning ? 'the root\'s turn and its subagent run' : 'only its subagent runs (the root\'s turn already ended)'} → {stopped: true}; the subagent stops, the whole tree goes idle and stays idle; no turn-finished`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p, IX.dsh.standardPreset)
      await w.call('askInNewAgents', { on: true })
      t.after(() => w.call('askInNewAgents', { on: false }))
      const marker = tok('tsub')
      const text = tok('tstop')
      await w.call('queueMarker', { marker, except: sid, script: [step(IX.fixture.askTool, { text }, cid('tsub')), [{ text: 'sub done' }]] })
      await free(w, sid)
      const before = (await turnsOf(p, sid)).length
      // The root spawns the subagent, then (rootRunning) its next model request is held, so its turn stays open.
      await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(IX.dsh.subagentTool, { description: tok('d'), prompt: marker }, cid('tspawn')), [{ text: 'root done' }]] })
      await waitEvents(p.client, (e) => ofType(e, ET.permission).find((x) => x.payload.reason === IX.fixture.reason(text)), 'the subagent\'s permission request')
      const child = (await w.call('markerState', { marker })).sessions[0]
      assert.equal(await w.call('status', { sessionId: child }), 'running', 'the subagent is not running before the stop')
      assert.ok(await w.call('idle', { sessionId: sid }), 'the root\'s turn did not end')
      // rootRunning: the user speaks to the root again and its model request is held, so the root's turn is open too.
      if (rootRunning) {
        await w.call('holdNext', { sessionId: sid })
        await w.call('driveStart', { sessionId: sid, text: tok('u2'), script: [[{ text: 'root again' }]] })
        assert.ok(await eventually(() => w.call('isHeld', { sessionId: sid })), 'the root\'s turn is not held open')
      }
      assert.equal((await okCall(p.client, TOOL.sessionStop, { sessionId: sid })).stopped, true)
      if (rootRunning) await release(w, sid)
      assert.ok(await eventually(async () => (await w.call('status', { sessionId: child })) !== 'running'), 'the subagent still runs after session_stop')
      assert.ok(await w.call('idle', { sessionId: sid }), 'the root is not idle after session_stop')
      await quiet(); await quiet()
      assert.equal(await w.call('status', { sessionId: sid }), 'idle', 'the stopped root runs again')
      assert.notEqual(await w.call('status', { sessionId: child }), 'running', 'the subagent runs again')
      assert.equal((await turnsOf(p, sid)).length, before, 'the manager\'s tree stop produced a turn-finished: ' + JSON.stringify((await turnsOf(p, sid)).slice(before).map((e) => e.payload)))
      // The stop's notice is history now: the next real turn reports as usual.
      await w.call('driveStart', { sessionId: sid, text: tok('after'), script: [[{ text: 'after stop' }]] })
      await w.call('idle', { sessionId: sid })
      const all = await turnsAfter(p, sid, before + 1)
      assert.equal(all.length, before + 1)
      assert.equal(all.at(-1).payload.outcome, O.completed)
    })
  }

  // B2: a subagent of the tree still runs.
  row(sdk, 'CONN-REPORT-ST-04', 'ST (pending subagent)', 'the root\'s turn ends while its subagent waits on a permission request → no turn-finished; P allows, the subagent finishes and the tree settles → exactly one turn-finished, for the root, completed', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p, IX.dsh.standardPreset)
    await w.call('askInNewAgents', { on: true })
    t.after(() => w.call('askInNewAgents', { on: false }))
    const marker = tok('sub')
    const text = tok('rsub')
    await w.call('queueMarker', { marker, except: sid, script: [step(IX.fixture.askTool, { text }, cid('sub')), [{ text: 'sub done' }]] })
    await free(w, sid)
    const before = (await turnsOf(p, sid)).length
    await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(IX.dsh.subagentTool, { description: tok('d'), prompt: marker }, cid('spawn')), [{ text: 'root done' }]] })
    const ev = await waitEvents(p.client, (e) => ofType(e, ET.permission).find((x) => x.payload.reason === IX.fixture.reason(text)), 'the subagent\'s permission request')
    await w.call('idle', { sessionId: sid })
    await quiet(); await quiet()
    assert.equal((await turnsOf(p, sid)).length, before, 'turn-finished while a subagent of the tree still runs (B2)')
    const child = (await w.call('markerState', { marker })).sessions[0]
    assert.deepEqual((await turnsOf(p, child)), [], 'a turn-finished named the subagent (B1: the root\'s only)')
    assert.equal((await answer(p, { sid, d: ev.payload, offer: ev.offer }, A.allow())).ok, true)
    const all = await turnsAfter(p, sid, before + 1)
    assert.equal(all.length, before + 1, 'not exactly one turn-finished once the tree settled: ' + JSON.stringify(all.slice(before).map((e) => e.payload)))
    assert.equal(all.at(-1).payload.outcome, O.completed)
    assert.deepEqual(await turnsOf(p, child), [])
    await free(w, sid)
  })
}
