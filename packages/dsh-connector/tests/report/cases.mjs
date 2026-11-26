/**
 * CONN-REPORT B black-box rows (the user's approved requirements, 2026-11-21): turn-finished is the
 * end signal and the report in one event, produced by the session source for a ROOT session when
 * its agents and queues are idle. Integration rows run the real session source over fake DSH
 * edges. The mailbox row also runs real routing and mailbox storage without a server.
 *
 * Techniques:
 * - DT  CONN-REPORT-DT-02: DSH turn-end reason → outcome / finalMessage / stop.
 * - BVA CONN-REPORT-BVA-02: final message bytes around TURN_FINISHED.finalMessageBytes, with 1-, 2-,
 *   3- and 4-byte characters at the cut, and the exact marker.
 * - EP  CONN-REPORT-EP-03: which text is the final message (last assistant, none, user only).
 * - ST  CONN-REPORT-ST-01: root/subagent running or queued → held; agents and queues idle → exactly
 *   one, regardless of running or stopping jobs; job settlement alone → no duplicate.
 * - ST  CONN-REPORT-ST-02: manager stop (marked stop → none; the next turn → one; a mark while idle
 *   does not swallow a later user Stop).
 * - DT  CONN-TREE-STOP-DT-01 (the user's decision of 2026-11-21: the manager's session_stop and the
 *   cancel of session_redirect stop the session's subagents and background jobs too, so it truly
 *   stands still; a manager stop still reports no turn-finished): which members are cancelled and
 *   which jobs killed, over the same fake DSH; ST-01 the tree then reaches its standstill unreported.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { expectNone, expectOne, manage } from '../routing/cases.mjs'
import { EVENT_TYPE, FIXTURE as ROUTE } from '../routing/constants.mjs'
import { routeWorld } from '../routing/subject.mjs'
import { DSH, FIXTURE as F, TURN_FINISHED as L, TURN_OUTCOME as O, WAIT } from './constants.mjs'
import { FakeDsh, reportWorld, settle, sourceModule, treeStopModule } from './subject.mjs'

const T = Object.freeze({ timeout: WAIT.testMs })
const row = (sdk, id, part, title, fn, options) => test(caseName(sdk, id, part, title), T, async (t) => fn(await reportWorld(t, sdk, options), t))
const bytes = (s) => Buffer.byteLength(s, 'utf8')
const MARKER_BYTES = bytes(L.truncationMarker)
/** The widest UTF-8 character: a cut may give up at most this many bytes less one. */
const MAX_CHAR_BYTES = 4
/** `n` bytes of `unit`, padded with one-byte characters (the pad first, so `unit` sits at the cut). */
function ofBytes(n, unit = F.pad) {
  const width = bytes(unit)
  const text = F.pad.repeat(n % width) + unit.repeat(Math.floor(n / width))
  assert.equal(bytes(text), n, 'harness: text size')
  return text
}

/** Exactly the reports heard after the edges settle. */
async function reports(w) { await settle(); return w.heard }
/** Exactly one report, for the root, equal to `want`. */
async function one(w, want, root = F.root) {
  assert.deepEqual(await reports(w), [[root, want]])
}
async function none(w, why) { assert.deepEqual(await reports(w), [], why) }
const completed = (text, truncated = false) => (text === undefined ? { outcome: O.completed } : { outcome: O.completed, finalMessage: { text, truncated } })

/** A stopped report: outcome stopped, stop {kind, message} (message holding each of `words`), no finalMessage. */
function assertStopped(facts, kind, words) {
  assert.deepEqual(Object.keys(facts).sort(), ['outcome', 'stop'], JSON.stringify(facts))
  assert.equal(facts.outcome, O.stopped)
  assert.deepEqual(Object.keys(facts.stop).sort(), ['kind', 'message'])
  assert.equal(facts.stop.kind, kind)
  assert.equal(typeof facts.stop.message, 'string')
  for (const word of words) assert.ok(facts.stop.message.includes(word), `stop.message ${JSON.stringify(facts.stop.message)} does not say ${word}`)
}

export function registerReportCases(sdk) {
  // ---------------------------------------------------------------------------- DT: outcome
  // B3: "outcome 'completed' (the root's last turn ended completed, or max-tokens): finalMessage is the root
  // session's last assistant message text ... stop absent." B5: any other end → 'stopped', stop {kind, message}, finalMessage absent.
  row(sdk, 'CONN-REPORT-DT-02', '1 completed', 'completed with assistant text → {outcome completed, finalMessage {text, truncated false}}', async (w) => {
    w.dsh.add(F.root)
    w.dsh.turn(F.root, F.text(1))
    await one(w, completed(F.text(1)))
  })
  row(sdk, 'CONN-REPORT-DT-02', '2 max-tokens', 'max-tokens counts as completed: {outcome completed, finalMessage}', async (w) => {
    w.dsh.add(F.root)
    w.dsh.turn(F.root, F.text(2), DSH.reason.maxTokens())
    await one(w, completed(F.text(2)))
  })
  row(sdk, 'CONN-REPORT-DT-02', '3 error', 'a provider error → {outcome stopped, stop {kind error, message with the error code and message}}; no finalMessage even with assistant text', async (w) => {
    w.dsh.add(F.root)
    w.dsh.turn(F.root, F.text(3), DSH.reason.error(F.errorCode, F.errorMessage))
    const [[root, facts]] = await reports(w)
    assert.equal(root, F.root)
    assertStopped(facts, DSH.kinds.error, [F.errorCode, F.errorMessage])
    assert.equal(w.heard.length, 1)
  })
  row(sdk, 'CONN-REPORT-DT-02', '4 aborted by the user', 'the user\'s Stop (not via MCP) → {outcome stopped, stop {kind aborted, message naming the user}}', async (w) => {
    w.dsh.add(F.root)
    w.dsh.turn(F.root, F.text(4), DSH.reason.aborted(DSH.cause.user()))
    const [[, facts], ...rest] = await reports(w)
    assertStopped(facts, DSH.kinds.aborted, [DSH.causeWords.user])
    assert.deepEqual(rest, [])
  })
  row(sdk, 'CONN-REPORT-DT-02', '5 aborted by a hook', 'aborted by anything other than the manager (a hook) → stopped, kind aborted, the message says who', async (w) => {
    w.dsh.add(F.root)
    w.dsh.turn(F.root, undefined, DSH.reason.aborted(DSH.cause.hook(F.hookReason)))
    const [[, facts], ...rest] = await reports(w)
    assertStopped(facts, DSH.kinds.aborted, [DSH.causeWords.hook])
    assert.deepEqual(rest, [])
  })
  for (const [part, reason, kind] of [['6 blocked', DSH.reason.blocked(), DSH.kinds.blocked], ['7 interrupted', DSH.reason.interrupted(), DSH.kinds.interrupted]]) {
    row(sdk, 'CONN-REPORT-DT-02', part, `a turn ${kind} → {outcome stopped, stop {kind ${kind}, message}}; no finalMessage`, async (w) => {
      w.dsh.add(F.root)
      w.dsh.turn(F.root, F.text(6), reason)
      const [[, facts], ...rest] = await reports(w)
      assertStopped(facts, kind, [])
      assert.deepEqual(rest, [])
    })
  }

  // ---------------------------------------------------------------------------- EP: the final message
  row(sdk, 'CONN-REPORT-EP-03', '1 none', 'no assistant text in the session → {outcome completed} with finalMessage absent', async (w) => {
    w.dsh.add(F.root)
    w.dsh.turn(F.root)
    await one(w, completed())
  })
  row(sdk, 'CONN-REPORT-EP-03', '2 user text only', 'only a user message → finalMessage absent (a user\'s text is never the report)', async (w) => {
    w.dsh.add(F.root)
    w.dsh.start(F.root)
    w.dsh.userSays(F.root, F.text(20))
    w.dsh.end(F.root)
    await one(w, completed())
  })
  row(sdk, 'CONN-REPORT-EP-03', '3 the last of several', 'two assistant messages in the turn → the last one is the final message', async (w) => {
    w.dsh.add(F.root)
    w.dsh.start(F.root)
    w.dsh.say(F.root, F.text(21))
    w.dsh.say(F.root, F.text(22))
    w.dsh.end(F.root)
    await one(w, completed(F.text(22)))
  })
  row(sdk, 'CONN-REPORT-EP-03', '4 the root\'s, not a subagent\'s', 'a subagent\'s later assistant text is not the root\'s final message', async (w) => {
    w.dsh.add(F.root)
    w.dsh.child(F.child, F.root)
    w.dsh.start(F.root)
    w.dsh.say(F.root, F.text(23))
    w.dsh.start(F.child)
    w.dsh.end(F.root)
    w.dsh.say(F.child, F.text(24))
    w.dsh.end(F.child)
    w.dsh.subagentEnds(F.child, F.root)
    await one(w, completed(F.text(23)))
  })

  // ---------------------------------------------------------------------------- BVA: truncation
  // B3: "at most TURN_FINISHED.finalMessageBytes UTF-8 bytes; when longer it is cut so the whole text, including the
  // marker TURN_FINISHED.truncationMarker at its end, fits in the limit, and truncated is true; otherwise truncated is false."
  const LIMIT = L.finalMessageBytes
  for (const [label, text] of [
    ['1 byte', 'x'],
    [`${LIMIT - 1} bytes`, ofBytes(LIMIT - 1)],
    [`${LIMIT} bytes (= limit)`, ofBytes(LIMIT)],
    [`${LIMIT} bytes of 2-byte characters`, ofBytes(LIMIT, F.twoByte)],
    [`${LIMIT} bytes ending in a 3-byte character`, ofBytes(LIMIT - 3) + F.euro],
    [`${LIMIT} bytes of 4-byte characters`, ofBytes(LIMIT, F.astral)],
    [`${LIMIT} bytes already ending in the marker`, ofBytes(LIMIT - MARKER_BYTES) + L.truncationMarker],
  ]) {
    row(sdk, 'CONN-REPORT-BVA-02', `kept (${label})`, 'at most the limit → the text unchanged, truncated false', async (w) => {
      w.dsh.add(F.root)
      w.dsh.turn(F.root, text)
      await one(w, completed(text, false))
    })
  }
  for (const [label, text] of [
    [`${LIMIT + 1} bytes`, ofBytes(LIMIT + 1)],
    [`${LIMIT - 1} bytes + one 2-byte character (${LIMIT + 1})`, ofBytes(LIMIT - 1) + F.twoByte],
    [`${LIMIT + 1} bytes of 2-byte characters (odd pad)`, ofBytes(LIMIT + 1, F.twoByte)],
    [`${LIMIT + 2} bytes of 3-byte characters`, ofBytes(LIMIT + 2, F.euro)],
    [`${LIMIT + 4} bytes of 4-byte characters`, ofBytes(LIMIT + 4, F.astral)],
    [`${LIMIT * 4} bytes`, ofBytes(LIMIT * 4)],
  ]) {
    row(sdk, 'CONN-REPORT-BVA-02', `cut (${label})`, `over the limit → truncated true; the text ends in the exact marker and is at most ${LIMIT} bytes with it; the rest is a prefix of the original, cut on a character boundary`, async (w) => {
      w.dsh.add(F.root)
      w.dsh.turn(F.root, text)
      const [[root, facts], ...rest] = await reports(w)
      assert.deepEqual(rest, [])
      assert.equal(root, F.root)
      assert.deepEqual(Object.keys(facts).sort(), ['finalMessage', 'outcome'])
      assert.equal(facts.outcome, O.completed)
      const { text: cut, truncated } = facts.finalMessage
      assert.equal(truncated, true)
      assert.ok(cut.endsWith(L.truncationMarker), 'the cut text does not end in the marker')
      assert.ok(bytes(cut) <= LIMIT, `the cut text is ${bytes(cut)} bytes, over ${LIMIT}`)
      const kept = cut.slice(0, cut.length - L.truncationMarker.length)
      assert.ok(text.startsWith(kept), 'the kept part is not a prefix of the final message')
      assert.ok(!kept.includes('\uFFFD') && kept.isWellFormed(), 'the cut split a character')
      // "cut so the whole text ... fits": no more is given up than one character can need.
      assert.ok(bytes(kept) >= LIMIT - MARKER_BYTES - (MAX_CHAR_BYTES - 1), `only ${bytes(kept)} bytes kept`)
    })
  }

  // ---------------------------------------------------------------------------- ST: standstill
  test(caseName(sdk, 'CONN-REPORT-ST-01', 'mailbox with live jobs', 'the manager receives the root’s final output once before the jobs settle'), T, async (t) => {
    const dsh = new FakeDsh()
    const { createSessionSource } = await sourceModule(sdk)
    const w = await routeWorld(t, sdk, { sessions: createSessionSource(dsh.ctx) })
    const manager = w.principal(ROUTE.ids.p)
    w.principal(ROUTE.ids.q)
    dsh.add(F.root)
    dsh.child(F.child, F.root)
    await manage(w, F.root, manager)

    const rootJob = F.job(6)
    const childJob = F.job(7)
    dsh.job(rootJob, F.root)
    dsh.job(childJob, F.child, DSH.jobs.stopping)
    await expectNone(w, () => {
      dsh.queue(F.root, { nextTurn: [{ role: 'user', content: [] }] })
      dsh.turn(F.root, F.text(47))
    })

    const text = F.text(48)
    const { event } = await expectOne(w, () => {
      dsh.queue(F.root)
      dsh.turn(F.root, text)
    }, manager, EVENT_TYPE.turnFinished)
    assert.equal(event.sourceSessionId, F.root)
    assert.deepEqual(event.payload, { sessionId: F.root, ...completed(text) })

    await expectNone(w, () => {
      dsh.jobSettles(rootJob)
      dsh.jobSettles(childJob, DSH.jobs.killed)
    })
  })

  // Report once the root and its subagents are idle with no queued input, even while jobs are in flight.
  row(sdk, 'CONN-REPORT-ST-01', '1 root still running', 'the turn ends while the root agent still runs → nothing; it goes idle → exactly one', async (w) => {
    w.dsh.add(F.root)
    w.dsh.start(F.root)
    w.dsh.say(F.root, F.text(30))
    w.dsh.end(F.root, DSH.reason.completed(), { staysRunning: true })
    await none(w, 'reported while the root still runs')
    w.dsh.queue(F.root)
    w.dsh.agent(F.root).status = DSH.status.running
    w.dsh.end(F.root)
    await one(w, completed(F.text(30)))
  })
  for (const [part, slot] of [['2 next turn queued', 'nextTurn'], ['3 next step queued', 'nextStep']]) {
    row(sdk, 'CONN-REPORT-ST-01', part, `the turn ends with input queued (${slot}) → nothing; the next turn ends with nothing queued → exactly one, with that turn's text`, async (w) => {
      w.dsh.add(F.root)
      w.dsh.start(F.root)
      w.dsh.say(F.root, F.text(31))
      w.dsh.queue(F.root, { [slot]: [{ role: 'user', content: [{ type: DSH.textBlock, text: 'more' }] }] })
      w.dsh.end(F.root)
      await none(w, 'reported with input queued')
      w.dsh.queue(F.root)
      w.dsh.turn(F.root, F.text(32))
      await one(w, completed(F.text(32)))
    })
  }
  row(sdk, 'CONN-REPORT-ST-01', '4 subagent running', 'the root\'s turn ends while its subagent runs → nothing; the subagent ends → exactly one, for the root, with the root\'s final text', async (w) => {
    w.dsh.add(F.root)
    w.dsh.child(F.child, F.root)
    w.dsh.start(F.root)
    w.dsh.start(F.child)
    w.dsh.say(F.root, F.text(33))
    w.dsh.end(F.root)
    await none(w, 'reported while a subagent runs')
    w.dsh.end(F.child)
    w.dsh.subagentEnds(F.child, F.root)
    await one(w, completed(F.text(33)))
  })
  row(sdk, 'CONN-REPORT-ST-01', '5 grandchild running', 'a subagent of a subagent still runs → nothing; it settles → exactly one, for the root', async (w) => {
    w.dsh.add(F.root)
    w.dsh.child(F.child, F.root)
    w.dsh.child(F.grandchild, F.child)
    w.dsh.start(F.root)
    w.dsh.start(F.grandchild)
    w.dsh.say(F.root, F.text(34))
    w.dsh.end(F.root)
    await none(w, 'reported while a grandchild runs')
    w.dsh.end(F.grandchild)
    w.dsh.subagentEnds(F.grandchild, F.child)
    await one(w, completed(F.text(34)))
  })
  row(sdk, 'CONN-REPORT-ST-01', '6 subagent has queued input', 'an idle subagent with queued input → nothing; it runs that input and ends → exactly one', async (w) => {
    w.dsh.add(F.root)
    w.dsh.child(F.child, F.root)
    w.dsh.queue(F.child, { nextTurn: [{ role: 'user', content: [] }] })
    w.dsh.turn(F.root, F.text(35))
    await none(w, 'reported while a subagent has queued input')
    w.dsh.queue(F.child)
    w.dsh.turn(F.child)
    w.dsh.subagentEnds(F.child, F.root)
    await one(w, completed(F.text(35)))
  })
  row(sdk, 'CONN-REPORT-ST-01', '7 an unrelated session runs', 'another tree\'s running agent and job do not hold the root\'s report', async (w) => {
    w.dsh.add(F.root)
    w.dsh.add(F.other)
    w.dsh.start(F.other)
    w.dsh.job(F.job(1), F.other)
    w.dsh.turn(F.root, F.text(36))
    await one(w, completed(F.text(36)))
  })
  for (const [part, owner, status] of [
    ['8 root job running', F.root, DSH.jobs.running],
    ['9 root job stopping', F.root, DSH.jobs.stopping],
    ['10 subagent job running', F.child, DSH.jobs.running],
    ['18 subagent job stopping', F.child, DSH.jobs.stopping],
  ]) {
    row(sdk, 'CONN-REPORT-ST-01', part, `a background job of the tree (${owner === F.root ? 'the root' : 'a subagent'}, ${status}) stays in flight at turn end → exactly one report with final output; job settlement produces no duplicate`, async (w) => {
      w.dsh.add(F.root)
      w.dsh.child(F.child, F.root)
      const jobId = F.job(2)
      w.dsh.job(jobId, owner)
      if (status === DSH.jobs.stopping) w.dsh.stopping(jobId)
      const text = F.text(37)
      w.dsh.turn(F.root, text)
      await one(w, completed(text))
      w.dsh.jobSettles(jobId, status === DSH.jobs.stopping ? DSH.jobs.killed : DSH.jobs.completed)
      await one(w, completed(text))
    })
  }
  row(sdk, 'CONN-REPORT-ST-01', '11 settled job', 'a job already settled at the turn end does not hold the report', async (w) => {
    w.dsh.add(F.root)
    w.dsh.job(F.job(3), F.root)
    w.dsh.jobSettles(F.job(3))
    w.dsh.turn(F.root, F.text(38))
    await one(w, completed(F.text(38)))
  })
  row(sdk, 'CONN-REPORT-ST-01', '12 subagent and job in flight', 'a subagent still runs → nothing; the subagent ends with a job still running → exactly one', async (w) => {
    w.dsh.add(F.root)
    w.dsh.child(F.child, F.root)
    w.dsh.start(F.child)
    w.dsh.job(F.job(4), F.root)
    w.dsh.turn(F.root, F.text(39))
    await none(w, 'reported while a subagent still runs')
    w.dsh.end(F.child)
    w.dsh.subagentEnds(F.child, F.root)
    await one(w, completed(F.text(39)))
  })
  row(sdk, 'CONN-REPORT-ST-01', '13 exactly one', 'after the report, more idle edges (status, a subagent end, a job) produce no second report', async (w) => {
    w.dsh.add(F.root)
    w.dsh.child(F.child, F.root)
    w.dsh.turn(F.root, F.text(40))
    await one(w, completed(F.text(40)))
    w.dsh.subagentEnds(F.child, F.root)
    w.dsh.job(F.job(5), F.root)
    w.dsh.jobSettles(F.job(5))
    await one(w, completed(F.text(40)))
  })
  row(sdk, 'CONN-REPORT-ST-01', '14 a new turn', 'a later new turn and its standstill produce a new report with that turn\'s text', async (w) => {
    w.dsh.add(F.root)
    w.dsh.turn(F.root, F.text(41))
    // Harness: DSH never starts the next turn in the same tick as the last turn end; let the first standstill be seen.
    await settle()
    w.dsh.turn(F.root, F.text(42))
    assert.deepEqual(await reports(w), [[F.root, completed(F.text(41))], [F.root, completed(F.text(42))]])
  })
  row(sdk, 'CONN-REPORT-ST-01', '15 the final output at that point', 'held behind a subagent, the report carries the root\'s text as it is when everything settled', async (w) => {
    w.dsh.add(F.root)
    w.dsh.child(F.child, F.root)
    w.dsh.start(F.child)
    w.dsh.turn(F.root, F.text(43))
    w.dsh.queue(F.root, { nextTurn: [{ role: 'user', content: [] }] })
    w.dsh.end(F.child)
    w.dsh.subagentEnds(F.child, F.root)
    await none(w, 'reported with the root\'s next turn queued (the subagent\'s result)')
    w.dsh.queue(F.root)
    w.dsh.turn(F.root, F.text(44))
    await one(w, completed(F.text(44)))
  })
  row(sdk, 'CONN-REPORT-ST-01', '16 a subagent\'s own turn', 'a subagent\'s turn end while the root is idle reports for the root (never the child id), once', async (w) => {
    w.dsh.add(F.root)
    w.dsh.child(F.child, F.root)
    w.dsh.start(F.child)
    w.dsh.turn(F.root, F.text(45))
    await none(w, 'reported while the subagent runs')
    w.dsh.end(F.child)
    await settle()
    w.dsh.subagentEnds(F.child, F.root)
    await one(w, completed(F.text(45)))
  })
  row(sdk, 'CONN-REPORT-ST-01', '17 no jobs service', 'a DSH without the jobs service still reports at the standstill', async (w) => {
    w.dsh.add(F.root)
    w.dsh.turn(F.root, F.text(46))
    await one(w, completed(F.text(46)))
  }, { jobs: false })

  // ---------------------------------------------------------------------------- ST: manager stop
  // B4: "if the managing agent itself stopped the session (session_stop, or the cancel part of session_redirect), the
  // turn end caused by that stop produces NO turn-finished at all. (After session_redirect, the redirected message's own
  // turn later ends normally and that standstill does produce a turn-finished.)"
  row(sdk, 'CONN-REPORT-ST-02', '1 session_stop', 'stoppedByManager while running, the turn ends aborted → no report at all', async (w) => {
    w.dsh.add(F.root)
    w.dsh.start(F.root)
    w.dsh.say(F.root, F.text(50))
    w.source.stoppedByManager(F.root)
    w.dsh.end(F.root, DSH.reason.aborted(DSH.cause.user()))
    await none(w, 'the manager\'s own stop was reported')
  })
  row(sdk, 'CONN-REPORT-ST-02', '2 session_redirect', 'the manager\'s cancel → none; the redirected message\'s turn ends → exactly one, completed, with its text', async (w) => {
    w.dsh.add(F.root)
    w.dsh.start(F.root)
    w.source.stoppedByManager(F.root)
    w.dsh.queue(F.root, { nextTurn: [{ role: 'user', content: [] }] })
    w.dsh.end(F.root, DSH.reason.aborted(DSH.cause.user()))
    await none(w, 'the cancelled turn was reported')
    w.dsh.queue(F.root)
    w.dsh.turn(F.root, F.text(51))
    await one(w, completed(F.text(51)))
  })
  row(sdk, 'CONN-REPORT-ST-02', '3 redirect, idle between', 'the cancel ends with nothing queued (delivery after) → none for it; the redirected turn → one', async (w) => {
    w.dsh.add(F.root)
    w.dsh.start(F.root)
    w.source.stoppedByManager(F.root)
    w.dsh.end(F.root, DSH.reason.aborted(DSH.cause.user()))
    await none(w, 'the cancelled turn was reported')
    w.dsh.turn(F.root, F.text(52))
    await one(w, completed(F.text(52)))
  })
  row(sdk, 'CONN-REPORT-ST-02', '4 the next stop is the user\'s', 'after a manager stop, a later turn the user stops → reported stopped (aborted): the mark covers one stop only', async (w) => {
    w.dsh.add(F.root)
    w.dsh.start(F.root)
    w.source.stoppedByManager(F.root)
    w.dsh.end(F.root, DSH.reason.aborted(DSH.cause.user()))
    await settle()
    w.dsh.turn(F.root, undefined, DSH.reason.aborted(DSH.cause.user()))
    const got = await reports(w)
    assert.equal(got.length, 1, JSON.stringify(got))
    assertStopped(got[0][1], DSH.kinds.aborted, [DSH.causeWords.user])
  })
  row(sdk, 'CONN-REPORT-ST-02', '5 stop of an idle session', 'session_stop on an idle session ends no turn; a later user Stop of a new turn is reported stopped (aborted)', async (w) => {
    w.dsh.add(F.root)
    w.source.stoppedByManager(F.root)
    w.dsh.turn(F.root, undefined, DSH.reason.aborted(DSH.cause.user()))
    const got = await reports(w)
    assert.equal(got.length, 1, JSON.stringify(got))
    assertStopped(got[0][1], DSH.kinds.aborted, [DSH.causeWords.user])
  })
  row(sdk, 'CONN-REPORT-ST-02', '6 manager stop held behind a subagent', 'manager stop while a subagent runs, the subagent then ends → still no report for the stopped turn', async (w) => {
    w.dsh.add(F.root)
    w.dsh.child(F.child, F.root)
    w.dsh.start(F.root)
    w.dsh.start(F.child)
    w.source.stoppedByManager(F.root)
    w.dsh.end(F.root, DSH.reason.aborted(DSH.cause.user()))
    w.dsh.end(F.child, DSH.reason.aborted(DSH.cause.parent()))
    w.dsh.subagentEnds(F.child, F.root)
    await none(w, 'the manager\'s stop was reported once the tree settled')
  })

  // ---------------------------------------------------------------------------- the manager's tree stop
  // The user (2026-11-21): "Fishball's stop (session_stop, and the cancel part of session_redirect) must also stop
  // all of that session's subagents and background jobs, so the session truly comes to a standstill ... a manager
  // stop still emits no turn-finished." DSH's own cause for a subagent stopped with its parent is {kind: 'parent'}.
  const PARENT = DSH.cause.parent()
  const stopRow = (part, title, fn, options) => row(sdk, 'CONN-TREE-STOP-DT-01', part, title, async (w) => fn(w, (await treeStopModule(sdk)).stopTree), options)
  stopRow('1 running subagents at every depth', 'a running child and grandchild → both cancelled {kind: parent}; the root is left to the caller; idle members untouched', async (w, stopTree) => {
    w.dsh.add(F.root); w.dsh.child(F.child, F.root); w.dsh.child(F.grandchild, F.child)
    w.dsh.start(F.root); w.dsh.start(F.child); w.dsh.start(F.grandchild)
    const done = stopTree(w.dsh.ctx, F.root)
    assert.deepEqual(w.dsh.cancels.map(([id, cause]) => [id, cause]).sort(), [[F.child, PARENT], [F.grandchild, PARENT]].sort())
    assert.equal(done.subagents, 2)
  })
  stopRow('2 idle subagent', 'an idle subagent is not cancelled (nothing runs)', async (w, stopTree) => {
    w.dsh.add(F.root); w.dsh.child(F.child, F.root)
    stopTree(w.dsh.ctx, F.root)
    assert.deepEqual(w.dsh.cancels, [])
  })
  stopRow('3 another tree', 'a running agent and job of another root are untouched', async (w, stopTree) => {
    w.dsh.add(F.root); w.dsh.add(F.other); w.dsh.start(F.other); w.dsh.job(F.job(70), F.other)
    stopTree(w.dsh.ctx, F.root)
    assert.deepEqual([w.dsh.cancels, w.dsh.kills], [[], []])
  })
  stopRow('4 jobs of the tree', 'running jobs of the root and of a subagent are killed, each with its owner as caller and a reason; a stopping or settled job is not', async (w, stopTree) => {
    w.dsh.add(F.root); w.dsh.child(F.child, F.root)
    w.dsh.job(F.job(71), F.root); w.dsh.job(F.job(72), F.child)
    w.dsh.job(F.job(73), F.root); w.dsh.stopping(F.job(73))
    w.dsh.job(F.job(74), F.root); w.dsh.jobSettles(F.job(74))
    const done = stopTree(w.dsh.ctx, F.root)
    assert.deepEqual(w.dsh.kills.map(([id, caller]) => [id, caller]).sort(), [[F.job(71), F.root], [F.job(72), F.child]].sort())
    assert.ok(w.dsh.kills.every(([, , reason]) => typeof reason === 'string' && reason.length > 0), 'a kill without a reason')
    assert.equal(done.jobs, 2)
  })
  stopRow('5 one failure', 'a member whose cancel throws does not stop the rest; the failure is logged with a code only', async (w, stopTree) => {
    w.dsh.add(F.root); w.dsh.child(F.child, F.root); w.dsh.child(F.grandchild, F.root)
    w.dsh.start(F.child); w.dsh.start(F.grandchild)
    w.dsh.agent(F.child).cancel = () => { throw Object.assign(new Error('secret text'), { code: 'FBTEST_CANCEL' }) }
    w.dsh.job(F.job(75), F.root)
    const warned = []
    stopTree(w.dsh.ctx, F.root, { warn: (...args) => warned.push(args) })
    assert.deepEqual(w.dsh.cancels.map(([id]) => id), [F.grandchild])
    assert.deepEqual(w.dsh.kills.map(([id]) => id), [F.job(75)])
    assert.equal(warned.length, 1)
    assert.ok(warned[0].includes('FBTEST_CANCEL') && !warned[0].some((x) => String(x).includes('secret text')), JSON.stringify(warned))
  })
  stopRow('6 no jobs service', 'a DSH without the jobs service: subagents still stop, nothing throws', async (w, stopTree) => {
    w.dsh.add(F.root); w.dsh.child(F.child, F.root); w.dsh.start(F.child)
    assert.deepEqual(stopTree(w.dsh.ctx, F.root), { subagents: 1, jobs: 0 })
  }, { jobs: false })
  row(sdk, 'CONN-TREE-STOP-ST-01', 'manager stop of the tree', 'stoppedByManager + tree stop while the root, a subagent and a job run; the root ends aborted, the subagent ends (parent), the job settles killed → the tree stands still and no turn-finished is reported', async (w) => {
    const { stopTree } = await treeStopModule(sdk)
    w.dsh.add(F.root); w.dsh.child(F.child, F.root)
    w.dsh.start(F.root); w.dsh.start(F.child); w.dsh.job(F.job(76), F.child)
    w.source.stoppedByManager(F.root)
    stopTree(w.dsh.ctx, F.root)
    w.dsh.end(F.root, DSH.reason.aborted(DSH.cause.user()))
    w.dsh.end(F.child, DSH.reason.aborted(PARENT))
    w.dsh.subagentEnds(F.child, F.root)
    w.dsh.jobSettles(F.job(76), DSH.jobs.killed)
    await none(w, 'the manager\'s tree stop was reported')
    assert.deepEqual(w.dsh.cancels.map(([id]) => id), [F.child])
    assert.deepEqual(w.dsh.kills.map(([id]) => id), [F.job(76)])
  })

  row(sdk, 'CONN-TREE-STOP-ST-01', 'root turn already held', 'the root\'s turn ended while its subagent runs (report held); the manager then stops the tree; the subagent ends → no turn-finished (the standstill is the manager\'s)', async (w) => {
    const { stopTree } = await treeStopModule(sdk)
    w.dsh.add(F.root); w.dsh.child(F.child, F.root)
    w.dsh.start(F.child)
    w.dsh.turn(F.root, F.text(77))
    await none(w, 'reported while the subagent runs')
    w.source.stoppedByManager(F.root)
    stopTree(w.dsh.ctx, F.root, undefined, w.source.stoppedByManager)
    w.dsh.end(F.child, DSH.reason.aborted(PARENT))
    w.dsh.subagentEnds(F.child, F.root)
    await none(w, 'the held turn was reported after the manager\'s tree stop')
    w.dsh.turn(F.root, F.text(78))
    await one(w, completed(F.text(78)))
  })

  // ---------------------------------------------------------------------------- the listener interface
  row(sdk, 'CONN-REPORT-EP-04', 'dispose', 'disposing the last onTurnFinished listener releases every DSH subscription; later turns reach nobody', async (w) => {
    w.dsh.add(F.root)
    w.dsh.job(F.job(6), F.root)
    assert.equal(typeof w.dispose, 'function', 'onTurnFinished returned no disposer')
    w.dispose()
    assert.equal(w.dsh.subscriptions.live, 0, 'a DSH subscription outlived the last listener')
    w.dsh.jobSettles(F.job(6))
    w.dsh.turn(F.root, F.text(60))
    await none(w, 'a disposed listener heard a turn')
  })
}
