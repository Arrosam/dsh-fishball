/**
 * I-SUCCEED black-box cases: the instance's half of reinstall succession (Q24 A). Written from the
 * requirements only: R-HOST-02 (hosted.json kept for reinstall succession), R-HOST-05 (create only
 * when the child holds no credential; the value never stored on the host), R-HOST-09 (succession
 * after a reinstall; "the instance retries at its next start"), R-HOST-10 (Retry creates nothing;
 * replacing moves nothing), R-NAME-07 (the name moves with the succession); design §5.4; HOST-UC-03,
 * HOST-DT-01 rows 5–7, HOST-DT-02, HOST-ST-02 (docs/test-design/v3/08-hosted.md); K3 tokens.d.ts
 * as amended by I-SUCCEED (`onChange`, the user's Q1 = C, 2026-11-17); the user's Q2 (2026-11-17,
 * "Retarget to the newest"); and the clarifications relayed with the task (record.add's
 * `{succession: true}`, an older connector, a remote target, a hand-edited record, `close()`).
 *
 * Techniques:
 * - Decision table ISUCC-DT-01 (the start rule): earlier entries in the record × child credential
 *   × succession pending × connector members × target → createHosted count and retire calls.
 *   BVA on the earlier entries: 0 (first install) / 1 / 2 (old = the newest listed before).
 * - Decision table ISUCC-DT-02: retire's answer (ok, successor-unpaired, operation-failed, a
 *   rejection, unknown-entry, not-hosted) → pending kept or dropped, and what retries it (the
 *   connector's onChange, the next start).
 * - State transition ISUCC-ST-01 / HOST-ST-02: none → reinstall → pending(old → newest) →
 *   {ok → none; refused → pending; Reconnect / a second reinstall → pending(old → the newer
 *   newest)}; a host-row restart keeps it (hosted.json); close() ends the onChange retry.
 * - EP ISUCC-EP-01 (where the token value may appear) and ISUCC-EP-02 (no connector, one without
 *   retire, one without onChange).
 * - Integration ISUCC-INT-01: the instance over the REAL connector hosted service
 *   (test/v3/dsh-connector/hosted's world): the successor pairs, onChange fires, and the retried
 *   retire moves the session and the name.
 *
 * Levels: integration over the real hosted record on disk, the real credential client/receiver and
 * the real hosted-token logic; a scripted fake connector (fakes.mjs) or the real one. No child DSH
 * is launched: rows that need one are todo, naming E2E.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caseName, caseTest } from '../../contract/package-boundaries/cases.mjs'
import { FIXTURE as CONNECTOR_FIXTURE, k3Literals } from '../../dsh-connector/hosted/constants.mjs'
import { succeedWorld } from '../../dsh-connector/hosted/subject.mjs'
import { until } from '../../dsh-connector/routing/cases.mjs'
import { textOf } from '../host/subject.mjs'
import { CASE, E2E, ENTRY, HOST_FIXTURE, HOST_K3, OUTCOME, RELAYED, RETIRE, RFI, RUNTIME, WAIT } from './constants.mjs'
import { gate } from './fakes.mjs'
import { expectRetired, successionWorld } from './subject.mjs'

const T = { timeout: WAIT.testMs }
const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)
const todo = (sdk, id, part, title, reason) => caseTest(sdk, id, part, title, null, reason)

/** `n` entries the instance created earlier (no succession), as the record lists them after past starts. */
async function seed(w, n) {
  for (let i = 0; i < n; i++) await w.record.add((await w.tokens.service.createHosted(HOST_FIXTURE.instanceId)).entryKey)
}
/** First install, then a reinstall whose retire calls answer `outcomes` in order (then `{ok: true}`). */
async function reinstalled(t, sdk, outcomes = [], options = {}) {
  const w = await successionWorld(t, sdk, options)
  await w.start()
  w.tokens.answer(...outcomes)
  await w.reinstall()
  return w
}
/** The pending old entry both as the live record reads it and as a reopened record reads the file. */
async function assertPending(w, expected, message) {
  assert.equal(w.record.pending(), expected, message + ' (the live record)')
  assert.equal(await w.pendingOnDisk(), expected, message + ' (hosted.json reopened)')
}

export function registerSuccessionCases(sdk) {
  // ===================================================================== K3: the codes this suite scripts are tokens.d.ts's
  caseTest(sdk, CASE.outcome, 'K3', 'the retire answers this suite scripts are exactly K3 RetireRefusalCode', () => {
    const scripted = [RETIRE.unknownEntry, RETIRE.notHosted, RETIRE.successorUnpaired, RETIRE.operationFailed]
    assert.deepEqual([...scripted].sort(), k3Literals(RETIRE.type).sort())
  })

  // ===================================================================== ISUCC-DT-01: the start rule (HOST-DT-01 rows 1, 2, 6; HOST-DT-02 rows 1, 5)
  // Columns: earlier entries in the record, child credential, pending → createHosted count, retire calls.
  for (const [rule, title, earlier, expectCreated, expectRetire] of [
    ['1 (BVA 0)', 'first-ever install: record empty, no credential → one new entry; no succession, retire never called', 0, 1, []],
    ['2 (BVA 1)', 'reinstall: record lists E1, no credential → E2 created; retire(E1, E2)', 1, 1, [[ENTRY.e1, ENTRY.e2]]],
    ['3 (BVA 2)', 'reinstall: record lists E1, E2 → E3 created; old = the newest listed before (E2): retire(E2, E3)', 2, 1, [[ENTRY.e2, ENTRY.e3]]],
  ]) {
    row(sdk, CASE.start, rule, title, async (t) => {
      const w = await successionWorld(t, sdk)
      await seed(w, earlier)
      const before = w.created()
      await w.start()
      assert.equal(w.created() - before, expectCreated, 'createHosted calls at this start')
      await expectRetired(w.retired, expectRetire)
    })
  }
  row(sdk, CASE.start, '2 (record)', 'the reinstall records the pending succession in hosted.json: the old entry until retire answers', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    await assertPending(w, ENTRY.e1, 'pending after a refused retire')
    assert.deepEqual(w.record.entries(), [ENTRY.e1, ENTRY.e2], 'newest last')
  })
  row(sdk, CASE.start, '4', 'restart (child holds its credential), nothing pending → creates nothing, retire not called (HOST-DT-02 row 5)', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    await w.start()
    await w.restartHost()
    assert.equal(w.created(), 1)
    await expectRetired(w.retired, [])
  })
  row(sdk, CASE.start, '5', 'restart (child holds its credential), succession pending → creates nothing; retire(old, newest) retried', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    await w.start()
    assert.equal(w.created(), 2, 'a restart created an entry')
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2], [ENTRY.e1, ENTRY.e2]])
    await assertPending(w, undefined, 'after the retried retire answered ok')
  })
  row(sdk, CASE.start, '6', 'a succession pending and targetUrl now names a remote target → retire not called at the start', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    w.setRemote(HOST_FIXTURE.remote)
    await w.start()
    w.tokens.emit()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]], 'retire called for a remote target')
  })
  row(sdk, CASE.start, '7', 'a hand-edited record whose newest entry is the pending old one → the pending succession is dropped; retire not called', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    // The user removes E2 from the list by hand: the newest entry is now the pending old entry E1.
    w.editFile((json) => { json[RELAYED.entriesKey] = [ENTRY.e1] })
    await w.restartHost()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]], 'retire(old, old) or a retry after the edit')
    await assertPending(w, undefined, 'after the hand edit')
  })

  // ===================================================================== ISUCC-DT-02: retire's answer → the pending succession
  for (const [rule, title, outcome, keep, promptRetry] of [
    [1, 'ok → pending cleared; never retried (a connector change and a restart call nothing)', OUTCOME.ok, false, false],
    [2, 'successor-unpaired → stays pending; retried when the connector\'s onChange fires', OUTCOME.unpaired, true, true],
    [3, 'operation-failed → stays pending; a pair change does NOT retry it (S4: only the next start / Reconnect, row 3b)', OUTCOME.failed, true, false],
    [4, 'retire rejects → stays pending, like operation-failed: no retry on a pair change', OUTCOME.reject, true, false],
    [5, 'unknown-entry (the user deleted an entry) → pending dropped; never retried', OUTCOME.unknown, false, false],
    [6, 'not-hosted (a user-made entry) → pending dropped; never retried', OUTCOME.notHosted, false, false],
  ]) {
    row(sdk, CASE.outcome, rule, title, async (t) => {
      const w = await reinstalled(t, sdk, [outcome])
      const first = [[ENTRY.e1, ENTRY.e2]]
      await expectRetired(w.retired, first)
      await assertPending(w, keep ? ENTRY.e1 : undefined, 'after ' + JSON.stringify(outcome))
      // S4: a pair change retries successor-unpaired only.
      w.tokens.emit()
      await expectRetired(w.retired, promptRetry ? [...first, ...first] : first, 'after a connector change')
    })
  }
  for (const [rule, title, outcome, retried] of [
    ['1b', 'ok, then the next start → no retire', OUTCOME.ok, false],
    ['2b', 'successor-unpaired, then the next start → retried (R-HOST-09 "at its next start")', OUTCOME.unpaired, true],
    ['3b', 'operation-failed, then the next start → retried', OUTCOME.failed, true],
    ['4b', 'a rejection, then the next start → retried', OUTCOME.reject, true],
    ['5b', 'unknown-entry, then the next start → no retire, nothing created', OUTCOME.unknown, false],
    ['6b', 'not-hosted, then the next start → no retire, nothing created', OUTCOME.notHosted, false],
  ]) {
    row(sdk, CASE.outcome, rule, title, async (t) => {
      const w = await reinstalled(t, sdk, [outcome])
      const first = [[ENTRY.e1, ENTRY.e2]]
      await expectRetired(w.retired, first)
      await w.restartHost()
      assert.equal(w.created(), 2, 'the next start created an entry')
      await expectRetired(w.retired, retried ? [...first, ...first] : first)
    })
  }
  row(sdk, CASE.outcome, '2c', 'successor-unpaired twice, then ok on the second onChange → cleared; a third change calls nothing', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired, OUTCOME.unpaired])
    const call = [ENTRY.e1, ENTRY.e2]
    await expectRetired(w.retired, [call])
    w.tokens.emit()
    await expectRetired(w.retired, [call, call])
    await assertPending(w, ENTRY.e1, 'after the second refusal')
    w.tokens.emit()
    await expectRetired(w.retired, [call, call, call])
    await assertPending(w, undefined, 'after ok')
    w.tokens.emit()
    await expectRetired(w.retired, [call, call, call])
  })

  // ===================================================================== ISUCC-ST-01 / HOST-ST-02: the pending succession's transitions
  row(sdk, CASE.st02, '1–2', 'Old(E1) → reinstall → Old + New provisional → succession ok → New only (pending none)', async (t) => {
    const w = await reinstalled(t, sdk)
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    await assertPending(w, undefined, 'after ok')
  })
  row(sdk, CASE.st02, '3–4', 'succession fails → still pending (hosted.json) → host-row restart (record reopened) → retried at the next start → ok', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    assert.equal(await w.pendingOnDisk(), ENTRY.e1)
    await w.restartHost()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2], [ENTRY.e1, ENTRY.e2]])
    await assertPending(w, undefined, 'after the retry succeeded')
  })
  row(sdk, CASE.pending, 'reconnect, none', 'nothing pending → Reconnect creates and imports one entry, moves nothing: retire never called, even after a connector change', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.equal(w.created(), 2)
    assert.equal(w.link.imports().length, 2)
    w.tokens.emit()
    await expectRetired(w.retired, [])
    await assertPending(w, undefined, 'after a Reconnect')
  })
  row(sdk, CASE.pending, 'reconnect, pending', 'pending(E1 → E2) → Reconnect creates E3 → the succession retargets to the newest: retire(E1, E3); no retire(E1, E2) after it (Q2)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    w.tokens.answerAlways(OUTCOME.unpaired)
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    // Whether the Reconnect itself tries at once is not stated; a connector change surely prompts one.
    w.tokens.emit()
    await until(() => w.retired().length > 1, 'a retire after the Reconnect')
    await expectRetired(w.retired, w.retired())
    assert.deepEqual(w.retired().slice(1).filter(([o, s]) => !(o === ENTRY.e1 && s === ENTRY.e3)), [], 'a retire not aimed at (E1, E3): ' + JSON.stringify(w.retired()))
    await assertPending(w, ENTRY.e1, 'the old entry stays the original')
  })
  row(sdk, CASE.pending, 'second reinstall', 'pending(E1 → E2) → a second reinstall creates E3 → retire(E1, E3): the original old kept, the intermediate E2 left alone', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    await w.reinstall()
    assert.equal(w.created(), 3)
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2], [ENTRY.e1, ENTRY.e3]])
    assert.equal(w.retired().some(([o]) => o === ENTRY.e2), false, 'the intermediate entry was retired as an old entry')
    await assertPending(w, undefined, 'after ok')
  })
  row(sdk, CASE.dt02, 4, 'user delete + Retry: Retry creates no token and starts no succession (R-HOST-10)', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.tokens.setState(ENTRY.e1, HOST_K3.entry.deleted)
    await w.start()
    await w.locator.retry()
    assert.equal(w.created(), 1, 'Retry or the restart created a token')
    w.tokens.emit()
    await expectRetired(w.retired, [])
    await assertPending(w, undefined, 'after delete + Retry')
  })
  row(sdk, CASE.dt02, '4 (Reconnect)', 'user delete + Retry + Reconnect: a new entry, nothing pending, no retire (replacing moves nothing, Q-B1 B)', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.tokens.setState(ENTRY.e1, HOST_K3.entry.deleted)
    await w.locator.retry()
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    w.tokens.emit()
    await expectRetired(w.retired, [])
    await assertPending(w, undefined, 'after Reconnect')
  })
  row(sdk, CASE.pending, 'close', 'close() disposes the onChange subscription: a connector change afterwards calls no retire', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    w.hosted.close()
    assert.equal(w.tokens.listeners(), 0, 'a listener is still subscribed after close()')
    w.tokens.emit()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
  })
  row(sdk, CASE.pending, 'one listener', 'host-row restarts (close, reopen) leave at most one onChange subscription: one change → one retire', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired, OUTCOME.unpaired])
    const call = [ENTRY.e1, ENTRY.e2]
    await expectRetired(w.retired, [call])
    await w.restartHost()
    await expectRetired(w.retired, [call, call])
    assert.ok(w.tokens.listeners() <= 1, 'subscriptions: ' + w.tokens.listeners())
    w.tokens.emit()
    await expectRetired(w.retired, [call, call, call])
  })

  // ===================================================================== ISUCC-EP-01: the token value (R-TOK-04, R-HOST-05)
  row(sdk, CASE.leak, 1, 'through reinstall, a refused and a retried retire, Reconnect and a host restart: no token value in hosted.json, the warnings or the retire arguments', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed, OUTCOME.unpaired])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    await w.restartHost()
    await w.locator.reconnect()
    w.tokens.emit()
    await expectRetired(w.retired, w.retired())
    const places = { record: w.fileText(), warnings: textOf(w.warnings), retire: textOf(w.retired()), notice: textOf(w.hosted.notice()) }
    assert.ok(w.tokens.values().length >= 3, 'harness: fewer values than entries')
    for (const value of w.tokens.values()) for (const [place, text] of Object.entries(places)) assert.equal(text.includes(value), false, `a token value in ${place}`)
  })
  row(sdk, CASE.leak, 2, 'each value is passed once, to the child\'s import only (one import frame per created entry)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await w.locator.reconnect()
    const imported = w.link.imports().map((f) => f.value)
    assert.deepEqual(imported, w.tokens.values())
  })

  // ===================================================================== ISUCC-EP-02: older connectors (behaviour 8)
  for (const [part, title, options, act] of [
    ['none', 'no connector: first start, restart and Reconnect do not throw; nothing is retired', { tokens: false }, async (w) => { await w.start(); await w.start(); await w.locator.reconnect() }],
    ['no retire', 'a connector without retire (or onChange): the reinstall creates and imports, and nothing throws', { tokens: { retire: false, onChange: false } }, async (w) => { await w.start(); await w.reinstall(); await w.restartHost() }],
  ]) {
    row(sdk, CASE.older, part, title, async (t) => {
      const w = await successionWorld(t, sdk, options)
      await act(w)
      if (w.tokens) assert.equal(w.created(), 2)
      if (w.tokens) await expectRetired(w.retired, [])
    })
  }
  row(sdk, CASE.older, 'no onChange', 'a connector with retire but without onChange: successor-unpaired → retried at each start (no prompt retry)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired, OUTCOME.unpaired], { tokens: { onChange: false } })
    const call = [ENTRY.e1, ENTRY.e2]
    await expectRetired(w.retired, [call])
    await w.restartHost()
    await expectRetired(w.retired, [call, call])
    await w.start()
    await expectRetired(w.retired, [call, call, call])
    await assertPending(w, undefined, 'after ok')
  })

  // ===================================================================== ISUCC-INT-01: over the real connector hosted service
  row(sdk, CASE.real, 'HOST-UC-03', 'reinstall → retire refused successor-unpaired → the successor pairs → onChange → the retried retire moves the session and the name; the old entry is gone', async (t) => {
    const c = await succeedWorld(t, sdk)
    const w = await successionWorld(t, sdk, { service: c.service })
    const { ids, names, sessions } = CONNECTOR_FIXTURE
    await w.start()
    const [eo] = w.record.entries()
    const { key: oldKey } = await c.pair(eo, ids.old, names.navigator)
    c.session(sessions.s1)
    await c.manage(sessions.s1, oldKey)
    await w.reinstall()
    const en = w.record.entries().at(-1)
    assert.notEqual(en, eo, 'the reinstall created no new entry')
    assert.equal(c.service.entryState(eo), HOST_K3.entry.enabled, 'the old entry went before the successor paired')
    assert.equal(w.record.pending(), eo, 'no pending succession after the refused retire')
    const { key: newKey } = await c.pair(en, ids.new, names.navigator)
    await until(() => c.pairs.pairOf(eo) === undefined, 'the retried retire after the pair')
    assert.equal(c.managed.managerOf(sessions.s1), newKey)
    assert.equal(c.pairs.pairOf(en).name, names.navigator, 'the name moved (R-NAME-07)')
    assert.equal(c.service.entryState(eo), HOST_K3.entry.deleted)
    await until(async () => (await w.pendingOnDisk()) === undefined, 'the pending succession cleared')
  })
  row(sdk, CASE.real, 'restart', 'a restart with the successor already paired: no new entry; the pending retire runs at the start', async (t) => {
    const c = await succeedWorld(t, sdk)
    const w = await successionWorld(t, sdk, { service: c.service })
    const { ids, names } = CONNECTOR_FIXTURE
    await w.start()
    const [eo] = w.record.entries()
    await c.pair(eo, ids.old, names.navigator)
    await w.reinstall()
    const en = w.record.entries().at(-1)
    // The instance is closed while the successor pairs, so only its next start can retry.
    w.hosted.close()
    await c.pair(en, ids.new, names.navigator)
    assert.equal(c.service.entryState(eo), HOST_K3.entry.enabled, 'a closed instance retired on a connector change')
    await w.restartHost()
    assert.equal(w.record.entries().length, 2, 'the restart created an entry')
    await until(() => c.service.entryState(eo) === HOST_K3.entry.deleted, 'the retire at the next start')
    assert.equal(c.pairs.pairOf(en).name, names.navigator)
  })
  runtimeRows(sdk)
  recordWriteRows(sdk)
  closeRows(sdk)
  promptRows(sdk)
  todo(sdk, CASE.uc03, 'main 1', 'a real reinstalled child DSH pairs nameless (name-taken), then takes the old name in the succession', E2E.child('HOST-UC-03 main 1'))
  todo(sdk, CASE.dt01, 7, 'pair answers already-paired → create another new entry', E2E.child('HOST-DT-01 rule 7: the pair answer comes from core in a running child'))
}

// ===================================================================== ISUCC-DT-03 (Q3 = A): a first start's new entry, ≥1 earlier entry
// Columns: runtime the newest earlier entry was created under × runtimeId() now → succession?
function runtimeRows(sdk) {
  for (const [rule, title, act, succession] of [
    [1, 'earlier R1, now R2 (uninstall / runtime reset) → succession: retire(E1, E2)', (w) => w.reinstall(), true],
    [2, 'earlier R1, now R1 (core dropped its copy: a Connect in the child) → no succession (R-HOST-10: never a replace)', (w) => w.sameRuntimeFirstStart(), false],
    [3, 'earlier runtime not recorded (a pre-I-SUCCEED record), now R2 → succession', async (w) => { w.editFile((json) => { delete json[RUNTIME.field] }); await w.reinstall() }, true],
    [4, 'earlier R1, runtimeId() now undefined → no succession', async (w) => { w.setRuntime(undefined); await w.sameRuntimeFirstStart() }, false],
    ['4b', 'earlier runtime not recorded, runtimeId() now undefined → no succession', async (w) => { w.editFile((json) => { delete json[RUNTIME.field] }); w.setRuntime(undefined); await w.sameRuntimeFirstStart() }, false],
  ]) {
    row(sdk, CASE.runtime, rule, title, async (t) => {
      const w = await successionWorld(t, sdk)
      await w.start()
      await act(w)
      assert.equal(w.created(), 2, 'the first start created no new entry')
      assert.deepEqual(await w.entriesOnDisk(), [ENTRY.e1, ENTRY.e2], 'the new entry is recorded, newest last')
      w.tokens.emit()
      await expectRetired(w.retired, succession ? [[ENTRY.e1, ENTRY.e2]] : [])
      await assertPending(w, undefined, succession ? 'after retire ok' : 'no succession was started')
    })
  }
  row(sdk, CASE.runtime, '5 (record)', 'the new entry\'s runtime is always recorded: the first install, a same-runtime first start and a reinstall each leave the runtime now in hosted.json', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    assert.equal(await w.runtimeOnDisk(), RUNTIME.r1, 'after the first install')
    await w.sameRuntimeFirstStart()
    assert.equal(await w.runtimeOnDisk(), RUNTIME.r1, 'after a same-runtime first start')
    await w.reinstall()
    assert.equal(await w.runtimeOnDisk(), RUNTIME.r2, 'after a reinstall')
  })
  row(sdk, CASE.runtime, '6 (Reconnect)', 'Reconnect under a new runtime id records it and starts no succession; a first start under that runtime then starts none either', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.setRuntime(RUNTIME.r2)
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.equal(await w.runtimeOnDisk(), RUNTIME.r2)
    await w.sameRuntimeFirstStart()
    assert.equal(w.created(), 3)
    w.tokens.emit()
    await expectRetired(w.retired, [])
    await assertPending(w, undefined, 'Reconnect is never a succession')
  })
  row(sdk, CASE.runtime, '7 (no runtime id at install)', 'runtimeId() undefined throughout: first install and a later first start → two entries, no succession', async (t) => {
    const w = await successionWorld(t, sdk, { runtime: undefined })
    await w.start()
    await w.reinstall()
    assert.equal(w.created(), 2)
    await expectRetired(w.retired, [])
  })
}

// ===================================================================== ISUCC-ST-02 (S2): the record write fails after a successful import
function recordWriteRows(sdk) {
  /** First install under R1, then a reinstall while hosted.json cannot be written. */
  async function unrecorded(t, options) {
    const w = await successionWorld(t, sdk, options)
    await w.start()
    w.breakWrites()
    await w.reinstall()
    assert.equal(w.created(), 2, 'the reinstall created no entry')
    assert.equal(w.link.imports().length, 2, 'the new value was not imported')
    return w
  }
  row(sdk, CASE.write, 1, 'write fails → no retire while the successor is unrecorded, not even on a pair change; hosted.json still lists E1 only', async (t) => {
    const w = await unrecorded(t)
    w.tokens.emit()
    await expectRetired(w.retired, [])
    assert.deepEqual(await w.entriesOnDisk(), [ENTRY.e1])
  })
  for (const [part, title, trigger] of [
    ['2 (next start)', 'the next start', (w) => w.start()],
    ['2 (pair change)', 'a pair change', (w) => { w.tokens.emit() }],
  ]) {
    row(sdk, CASE.write, part, `writes recover → ${title} replays the add (E2, its pending succession) before retire(E1, E2); nothing new is created`, async (t) => {
      const w = await unrecorded(t)
      w.mendWrites()
      await trigger(w)
      await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
      assert.equal(w.created(), 2, 'the replay created an entry')
      assert.deepEqual(await w.entriesOnDisk(), [ENTRY.e1, ENTRY.e2])
      await assertPending(w, undefined, 'after retire ok')
    })
  }
  row(sdk, CASE.write, '2 (replay first)', 'the replayed add reaches hosted.json before retire is called (the successor is recorded when retire runs)', async (t) => {
    const w = await unrecorded(t)
    w.mendWrites()
    const seen = []
    w.tokens.onRetire = async () => { seen.push(await w.entriesOnDisk()) }
    await w.start()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    assert.deepEqual(seen[0], [ENTRY.e1, ENTRY.e2], 'hosted.json when retire was called')
  })
  row(sdk, CASE.write, '3 (Reconnect)', 'writes recover → Reconnect replays E2 first, then records its own E3, in creation order; the succession keeps old E1 and targets the newest E3', async (t) => {
    const w = await unrecorded(t)
    w.mendWrites()
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    await until(() => w.retired().length > 0, 'a retire after the Reconnect')
    await expectRetired(w.retired, w.retired())
    assert.deepEqual(await w.entriesOnDisk(), [ENTRY.e1, ENTRY.e2, ENTRY.e3])
    assert.deepEqual(w.retired().at(-1), [ENTRY.e1, ENTRY.e3], 'the last retire: ' + JSON.stringify(w.retired()))
    assert.deepEqual(w.retired().filter(([o]) => o !== ENTRY.e1), [], 'an old entry other than E1')
  })
  row(sdk, CASE.write, '4 (queue)', 'two unrecorded entries (the reinstall\'s E2, then a Reconnect\'s E3 while writes still fail) → once writes succeed both are written in creation order; pending old E1, successor E3', async (t) => {
    const w = await unrecorded(t)
    await w.locator.reconnect()
    assert.equal(w.created(), 3, 'the Reconnect created no entry while the record was down')
    await expectRetired(w.retired, [], 'retire while the successor is unrecorded')
    w.mendWrites()
    await w.start()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e3]])
    assert.deepEqual(await w.entriesOnDisk(), [ENTRY.e1, ENTRY.e2, ENTRY.e3])
    await assertPending(w, undefined, 'after retire ok')
  })
  row(sdk, CASE.write, 5, 'the settle write fails after retire ok → nothing is created then, nor at the next start (the child holds its credential, R-HOST-05)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    w.breakWrites()
    w.tokens.emit()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2], [ENTRY.e1, ENTRY.e2]])
    w.mendWrites()
    await w.start()
    assert.equal(w.created(), 2)
  })
}

// ===================================================================== ISUCC-ST-03 (S3): close() while a step is queued or in flight
function closeRows(sdk) {
  row(sdk, CASE.close, 1, 'close() while retire is in flight → when it answers ok, nothing more is written to hosted.json and no retire follows', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    const held = gate()
    w.tokens.answer(held.wait(OUTCOME.ok))
    const reinstall = w.reinstall()
    await held.reached
    w.hosted.close()
    const [calls, writes] = [w.retired().length, w.writes.length]
    held.open()
    await reinstall.catch(() => {})
    w.tokens.emit()
    await expectRetired(w.retired, w.retired())
    assert.equal(w.retired().length, calls, 'a retire after close()')
    assert.deepEqual(w.writes.slice(writes), [], 'hosted.json written after close()')
  })
  row(sdk, CASE.close, 2, 'close() with a pair-change retry queued behind an in-flight retire → the queued step calls no retire and writes nothing', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    const held = gate()
    w.tokens.answer(held.wait(OUTCOME.unpaired))
    w.tokens.emit()
    await held.reached
    w.tokens.emit()
    w.hosted.close()
    const [calls, writes] = [w.retired().length, w.writes.length]
    held.open()
    await expectRetired(w.retired, w.retired())
    assert.equal(w.retired().length, calls, 'a retire after close()')
    assert.deepEqual(w.writes.slice(writes), [], 'hosted.json written after close()')
  })
}

// ===================================================================== S4: what retries which refusal; the subscription comes first; nit 5
function promptRows(sdk) {
  row(sdk, CASE.outcome, '3c (Reconnect)', 'operation-failed → no retry on a pair change; the next Reconnect retries it, retargeted to its new entry: retire(E1, E3)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    w.tokens.emit()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]], 'a pair change retried operation-failed')
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2], [ENTRY.e1, ENTRY.e3]])
  })
  row(sdk, CASE.outcome, '3d (then unpaired)', 'operation-failed, then at the next start successor-unpaired → a pair change retries again', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed, OUTCOME.unpaired])
    const call = [ENTRY.e1, ENTRY.e2]
    await expectRetired(w.retired, [call])
    await w.start()
    await expectRetired(w.retired, [call, call])
    w.tokens.emit()
    await expectRetired(w.retired, [call, call, call])
  })
  row(sdk, CASE.pending, 'subscribe first', 'the onChange subscription exists when retire is first called', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    const listening = []
    w.tokens.onRetire = () => { listening.push(w.tokens.listeners()) }
    await w.reinstall()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    assert.ok(listening[0] >= 1, 'no onChange listener when retire was called')
  })
  row(sdk, CASE.pending, 'pair during the call', 'a pair change that lands while retire is in flight (answered successor-unpaired) is not missed: retire is called again', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.tokens.answer(async () => { w.tokens.emit(); return OUTCOME.unpaired })
    await w.reinstall()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2], [ENTRY.e1, ENTRY.e2]])
    await assertPending(w, undefined, 'after the second call answered ok')
  })
  row(sdk, CASE.start, '8 (no entries)', 'a record with a pending succession but no entries → the pending one is dropped; no retire(old, undefined)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    w.editFile((json) => { json[RELAYED.entriesKey] = [] })
    await w.restartHost()
    w.tokens.emit()
    await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
    assert.equal(w.retired().some(([, successor]) => successor === undefined), false)
    await assertPending(w, undefined, 'a pending succession with no entries')
  })

  // ===================================================================== R-FIX-INSTANCE F06: only a definite import answer counts
  // pending(E1 → E2), the old credential still present in the child; Reconnect's import gets no
  // answer (the wire closes while the child's store write hangs) or a definite refusal: either way
  // credentials-unwritable, E3 is not recorded and the succession is not retargeted to it.
  for (const [part, title, play] of [
    ['unanswered', 'the wire closes while the store write hangs (no answer)', (w) => {
      w.credentials.set = async () => { w.link.wires.at(-1).lose(); await new Promise(() => {}) }
    }],
    ['refused', 'the child answers its own refusal', (w) => { w.credentials.failSet = true }],
  ]) {
    row(sdk, RFI.f06, part, `F06 pending(E1 → E2), old credential present, Reconnect's import: ${title} → ${RFI.unwritable}; E3 not recorded; no retire aimed at E3; the pending old entry kept`, async (t) => {
      const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
      await expectRetired(w.retired, [[ENTRY.e1, ENTRY.e2]])
      w.tokens.answerAlways(OUTCOME.unpaired)
      play(w)
      assert.deepEqual(await w.locator.reconnect(), { ok: false, code: RFI.unwritable })
      assert.deepEqual(await w.entriesOnDisk(), [ENTRY.e1, ENTRY.e2], 'hosted.json entries')
      w.tokens.emit()
      await expectRetired(w.retired, w.retired())
      assert.deepEqual(w.retired().filter(([, successor]) => successor === ENTRY.e3), [], 'retargeted to an entry the child never stored: ' + JSON.stringify(w.retired()))
      await assertPending(w, ENTRY.e1, 'the pending old entry')
    })
  }
}
