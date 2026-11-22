/**
 * Reinstall succession, the instance's half (README "Reinstall": when the child lost its credential
 * and hosted.json already lists an entry the instance made, the new entry becomes that entry's
 * successor; once the new Fishball has paired the instance asks the connector (`retire`) to move the
 * old entry to it; until then it is retried at each start and whenever the connector's pairs change;
 * a Reconnect meanwhile makes its new entry the successor; a deleted or user-made entry is never
 * succeeded. "Retry never creates a token … Reconnect creates one new entry … it moves and deletes
 * nothing". hosted.js JSDoc: the successor is always the newest entry; operation-failed is retried
 * at the next start only; a reinstall is a new child runtime id; close() ends the subscription and
 * later steps run nothing; a failed record write is replayed before any retire. K3 tokens.d.ts:
 * RetireRefusalCode.)
 *
 * Techniques: decision tables ISUCC-DT-01 (the start rule; BVA 0/1/2 earlier entries), ISUCC-DT-02
 * (retire's answer → pending kept or dropped, and what retries it), ISUCC-DT-03 (runtime then × now);
 * state transitions ISUCC-ST-01 / HOST-ST-02 (pending), ISUCC-ST-02 (record write failures),
 * ISUCC-ST-03 (close); EP ISUCC-EP-01 (where a token value may appear), ISUCC-EP-02 (older
 * connectors); RFI-F06 (only a definite import answer counts).
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { leakHits } from '@dsh-instance/test-helpers/scratch'
import { ENTRY, FIXTURE, K3, OUTCOME, RECORD, RETIRE, RUNTIME } from './constants.mjs'
import { extraCredentialsKept, gate, seedExtraCredentials } from './fakes.mjs'
import { assertPending, reinstalled, settled, successionWorld, until } from './world.mjs'

const E12 = [ENTRY.e1, ENTRY.e2]

/** `n` entries the instance created earlier, as past starts recorded them (no runtime recorded). */
async function seed(w, n) {
  for (let i = 0; i < n; i++) await w.record.add((await w.tokens.service.createHosted(FIXTURE.instanceId)).entryKey)
}

eachSdk((sdk) => {
  caseTest(sdk, 'MULTI-2', 'host ST succession with extra credentials', 'reinstall provisions actual parent and retires its predecessor while extra target credentials remain isolated', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.tokens.answer(OUTCOME.failed)
    // A reinstall whose new child already holds additional targets' credentials, but no parent one.
    w.setRuntime(RUNTIME.r2)
    w.credentials.wipe()
    seedExtraCredentials(w.credentials)
    await w.start()
    assert.equal(w.created(), 2, 'additional target credentials suppressed the parent import')
    assert.deepEqual(w.retired(), [E12])
    assert.ok(extraCredentialsKept(w.credentials))
    await w.start()
    assert.equal(w.created(), 2, 'the retry created another parent token')
    assert.deepEqual(w.retired(), [E12, E12])
    await assertPending(w, undefined, 'the parent succession settled')
    assert.ok(extraCredentialsKept(w.credentials))
  })
  caseTest(sdk, 'ISUCC-DT-02', 'K3', 'the retire answers this suite scripts are exactly K3 RetireRefusalCode', () => {
    // K3 tokens.d.ts: RetireRefusalCode = 'unknown-entry' | 'not-hosted' | 'successor-unpaired' | 'operation-failed'.
    const scripted = Object.values(OUTCOME).filter((o) => typeof o === 'object' && o.ok === false).map((o) => o.code)
    assert.deepEqual([...scripted].sort(), Object.values(RETIRE).sort())
  })

  // ===================================================================== ISUCC-DT-01: the start rule
  for (const [rule, title, earlier, expected] of [
    ['1 (BVA 0)', 'first-ever install: record empty, no credential → one new entry; no succession, retire never called', 0, []],
    ['2 (BVA 1)', 'reinstall: record lists E1, no credential → E2 created; retire(E1, E2)', 1, [E12]],
    ['3 (BVA 2)', 'reinstall: record lists E1, E2 → E3 created; old = the newest listed before (E2): retire(E2, E3)', 2, [[ENTRY.e2, ENTRY.e3]]],
  ]) {
    caseTest(sdk, 'ISUCC-DT-01', rule, title, async (t) => {
      const w = await successionWorld(t, sdk)
      await seed(w, earlier)
      await w.start()
      assert.equal(w.created() - earlier, 1, 'createHosted calls at this start')
      assert.deepEqual(w.retired(), expected)
    })
  }
  caseTest(sdk, 'ISUCC-DT-01', '2 (record)', 'the reinstall records the pending succession in hosted.json: the old entry until retire answers', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    assert.deepEqual(w.retired(), [E12])
    await assertPending(w, ENTRY.e1, 'pending after a refused retire')
    assert.deepEqual([...w.record.entries()], E12, 'newest last')
  })
  caseTest(sdk, 'ISUCC-DT-01', '4', 'restart (child holds its credential), nothing pending → creates nothing, retire not called (HOST-DT-02 row 5)', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    await w.start()
    await w.restartHost()
    assert.equal(w.created(), 1)
    assert.deepEqual(w.retired(), [])
  })
  caseTest(sdk, 'ISUCC-DT-01', '5', 'restart (child holds its credential), succession pending → creates nothing; retire(old, newest) retried', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    assert.deepEqual(w.retired(), [E12])
    await w.start()
    assert.equal(w.created(), 2, 'a restart created an entry')
    assert.deepEqual(w.retired(), [E12, E12])
    await assertPending(w, undefined, 'after the retried retire answered ok')
  })
  caseTest(sdk, 'ISUCC-DT-01', '6 (MULTI-2)', 'extra remote field cannot suppress actual-parent pending succession retry', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    assert.deepEqual(w.retired(), [E12])
    // The child gains additional targets (inside Fishball); the parent succession is still retried.
    seedExtraCredentials(w.credentials)
    await w.start()
    assert.deepEqual(w.retired(), [E12, E12], 'additional targets suppressed the parent succession')
    await assertPending(w, undefined, 'a successful parent succession clears pending')
  })
  caseTest(sdk, 'ISUCC-DT-01', '7', 'a hand-edited record whose newest entry is the pending old one → the pending succession is dropped; retire not called', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    assert.deepEqual(w.retired(), [E12])
    w.editFile((json) => { json[RECORD.entries] = [ENTRY.e1] })
    await w.restartHost()
    assert.deepEqual(w.retired(), [E12], 'retire(old, old) or a retry after the edit')
    await assertPending(w, undefined, 'after the hand edit')
  })
  caseTest(sdk, 'ISUCC-DT-01', '8 (no entries)', 'a record with a pending succession but no entries → the pending one is dropped; no retire(old, undefined)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    assert.deepEqual(w.retired(), [E12])
    w.editFile((json) => { json[RECORD.entries] = [] })
    await w.restartHost()
    await w.pairChange()
    assert.equal(w.retired().some(([, successor]) => successor === undefined), false)
    await assertPending(w, undefined, 'a pending succession with no entries')
  })

  // ===================================================================== ISUCC-DT-02: retire's answer → the pending succession
  for (const [rule, title, outcome, keep, pairRetry] of [
    [1, 'ok → pending cleared; never retried (a connector change and a restart call nothing)', OUTCOME.ok, false, false],
    [2, "successor-unpaired → stays pending; retried when the connector's onChange fires", OUTCOME.unpaired, true, true],
    [3, 'operation-failed → stays pending; a pair change does NOT retry it (S4: only the next start / Reconnect, row 3b)', OUTCOME.failed, true, false],
    [4, 'retire rejects → stays pending, like operation-failed: no retry on a pair change', OUTCOME.reject, true, false],
    [5, 'unknown-entry (the user deleted an entry) → pending dropped; never retried', OUTCOME.unknown, false, false],
    [6, 'not-hosted (a user-made entry) → pending dropped; never retried', OUTCOME.notHosted, false, false],
  ]) {
    caseTest(sdk, 'ISUCC-DT-02', rule, title, async (t) => {
      const w = await reinstalled(t, sdk, [outcome])
      assert.deepEqual(w.retired(), [E12])
      await assertPending(w, keep ? ENTRY.e1 : undefined, 'after ' + JSON.stringify(outcome))
      await w.pairChange()
      assert.deepEqual(w.retired(), pairRetry ? [E12, E12] : [E12], 'after a connector change')
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
    caseTest(sdk, 'ISUCC-DT-02', rule, title, async (t) => {
      const w = await reinstalled(t, sdk, [outcome])
      assert.deepEqual(w.retired(), [E12])
      await w.restartHost()
      assert.equal(w.created(), 2, 'the next start created an entry')
      assert.deepEqual(w.retired(), retried ? [E12, E12] : [E12])
    })
  }
  caseTest(sdk, 'ISUCC-DT-02', '2c', 'successor-unpaired twice, then ok on the second onChange → cleared; a third change calls nothing', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired, OUTCOME.unpaired])
    assert.deepEqual(w.retired(), [E12])
    await w.pairChange()
    assert.deepEqual(w.retired(), [E12, E12])
    await assertPending(w, ENTRY.e1, 'after the second refusal')
    await w.pairChange()
    assert.deepEqual(w.retired(), [E12, E12, E12])
    await assertPending(w, undefined, 'after ok')
    await w.pairChange()
    assert.deepEqual(w.retired(), [E12, E12, E12])
  })
  caseTest(sdk, 'ISUCC-DT-02', '3c (Reconnect)', 'operation-failed → no retry on a pair change; the next Reconnect retries it, retargeted to its new entry: retire(E1, E3)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    await w.pairChange()
    assert.deepEqual(w.retired(), [E12], 'a pair change retried operation-failed')
    assert.deepEqual(await w.reconnect(), { ok: true })
    assert.deepEqual(w.retired(), [E12, [ENTRY.e1, ENTRY.e3]])
  })
  caseTest(sdk, 'ISUCC-DT-02', '3d (then unpaired)', 'operation-failed, then at the next start successor-unpaired → a pair change retries again', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed, OUTCOME.unpaired])
    assert.deepEqual(w.retired(), [E12])
    await w.start()
    assert.deepEqual(w.retired(), [E12, E12])
    await w.pairChange()
    assert.deepEqual(w.retired(), [E12, E12, E12])
  })

  // ===================================================================== ISUCC-ST-01 / HOST-ST-02: the pending succession
  caseTest(sdk, 'HOST-ST-02', '1–2', 'Old(E1) → reinstall → Old + New provisional → succession ok → New only (pending none)', async (t) => {
    const w = await reinstalled(t, sdk)
    assert.deepEqual(w.retired(), [E12])
    await assertPending(w, undefined, 'after ok')
  })
  caseTest(sdk, 'HOST-ST-02', '3–4', 'succession fails → still pending (hosted.json) → host-row restart (record reopened) → retried at the next start → ok', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed])
    assert.equal(await w.pendingOnDisk(), ENTRY.e1)
    await w.restartHost()
    assert.deepEqual(w.retired(), [E12, E12])
    await assertPending(w, undefined, 'after the retry succeeded')
  })
  caseTest(sdk, 'ISUCC-ST-01', 'reconnect, none', 'nothing pending → Reconnect creates and imports one entry, moves nothing: retire never called, even after a connector change', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    assert.deepEqual(await w.reconnect(), { ok: true })
    assert.equal(w.created(), 2)
    assert.equal(w.imports().length, 2)
    await w.pairChange()
    assert.deepEqual(w.retired(), [])
    await assertPending(w, undefined, 'after a Reconnect')
  })
  caseTest(sdk, 'ISUCC-ST-01', 'reconnect, pending', 'pending(E1 → E2) → Reconnect creates E3 → the succession retargets to the newest: retire(E1, E3); no retire(E1, E2) after it (Q2)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    w.tokens.answerAlways(OUTCOME.unpaired)
    assert.deepEqual(await w.reconnect(), { ok: true })
    await w.pairChange()
    const after = w.retired().slice(1)
    assert.ok(after.length > 0, 'no retire after the Reconnect')
    assert.deepEqual(after.filter(([o, s]) => !(o === ENTRY.e1 && s === ENTRY.e3)), [], 'a retire not aimed at (E1, E3): ' + JSON.stringify(w.retired()))
    await assertPending(w, ENTRY.e1, 'the old entry stays the original')
  })
  caseTest(sdk, 'ISUCC-ST-01', 'second reinstall', 'pending(E1 → E2) → a second reinstall creates E3 → retire(E1, E3): the original old kept, the intermediate E2 left alone', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await w.reinstall()
    assert.equal(w.created(), 3)
    assert.deepEqual(w.retired(), [E12, [ENTRY.e1, ENTRY.e3]])
    await assertPending(w, undefined, 'after ok')
  })
  caseTest(sdk, 'HOST-DT-02', 4, 'user delete + Retry: Retry creates no token and starts no succession (R-HOST-10)', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.tokens.setState(ENTRY.e1, K3.entry.deleted)
    await w.start()
    await w.retry()
    assert.equal(w.created(), 1, 'Retry or the restart created a token')
    await w.pairChange()
    assert.deepEqual(w.retired(), [])
    await assertPending(w, undefined, 'after delete + Retry')
  })
  caseTest(sdk, 'HOST-DT-02', '4 (Reconnect)', 'user delete + Retry + Reconnect: a new entry, nothing pending, no retire (replacing moves nothing, Q-B1 B)', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.tokens.setState(ENTRY.e1, K3.entry.deleted)
    await w.retry()
    assert.deepEqual(await w.reconnect(), { ok: true })
    await w.pairChange()
    assert.deepEqual(w.retired(), [])
    await assertPending(w, undefined, 'after Reconnect')
  })
  caseTest(sdk, 'ISUCC-ST-01', 'close', 'close() disposes the onChange subscription: a connector change afterwards calls no retire', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await w.hosted.close()
    assert.equal(w.tokens.listeners(), 0, 'a listener is still subscribed after close()')
    await w.pairChange()
    assert.deepEqual(w.retired(), [E12])
  })
  caseTest(sdk, 'ISUCC-ST-01', 'one listener', 'host-row restarts (close, reopen) leave at most one onChange subscription: one change → one retire', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired, OUTCOME.unpaired])
    await w.restartHost()
    assert.deepEqual(w.retired(), [E12, E12])
    assert.ok(w.tokens.listeners() <= 1, 'subscriptions: ' + w.tokens.listeners())
    await w.pairChange()
    assert.deepEqual(w.retired(), [E12, E12, E12])
  })
  caseTest(sdk, 'ISUCC-ST-01', 'subscribe first', 'the onChange subscription exists when retire is first called', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    const listening = []
    w.tokens.onRetire = () => { listening.push(w.tokens.listeners()) }
    await w.reinstall()
    assert.deepEqual(w.retired(), [E12])
    assert.ok(listening[0] >= 1, 'no onChange listener when retire was called')
  })
  caseTest(sdk, 'ISUCC-ST-01', 'pair during the call', 'a pair change that lands while retire is in flight (answered successor-unpaired) is not missed: retire is called again', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.tokens.answer(async () => { w.tokens.emit(); return OUTCOME.unpaired })
    await w.reinstall()
    await until(async () => (await w.pendingOnDisk()) === undefined)
    assert.deepEqual(w.retired(), [E12, E12])
    await assertPending(w, undefined, 'after the second call answered ok')
  })

  // ===================================================================== ISUCC-EP-01: the token value
  caseTest(sdk, 'ISUCC-EP-01', 1, 'through reinstall, a refused and a retried retire, Reconnect and a host restart: no token value in hosted.json, the warnings or the retire arguments', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.failed, OUTCOME.unpaired])
    await w.restartHost()
    await w.reconnect()
    await w.pairChange()
    assert.ok(w.tokens.values().length >= 3, 'fewer values than entries')
    const places = { record: w.fileText(), warnings: JSON.stringify(w.warnings), retire: JSON.stringify(w.retired()), notice: JSON.stringify(w.hosted.notice()) }
    assert.deepEqual(leakHits(w.tokens.values(), { places }), [])
  })
  caseTest(sdk, 'ISUCC-EP-01', 2, "each value is passed once, to the child's import only (one import frame per created entry)", async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    await w.reconnect()
    assert.deepEqual(w.imports().map((frame) => frame.value), w.tokens.values())
  })

  // ===================================================================== ISUCC-EP-02: older connectors
  caseTest(sdk, 'ISUCC-EP-02', 'none', 'no connector: first start, restart and Reconnect do not throw; nothing is retired', async (t) => {
    const w = await successionWorld(t, sdk, { tokens: false })
    await w.start()
    await w.start()
    // README "Without the connector": Reconnect answers connector-missing.
    assert.deepEqual(await w.reconnect(), { ok: false, code: 'connector-missing' })
    assert.deepEqual([...w.record.entries()], [])
  })
  caseTest(sdk, 'ISUCC-EP-02', 'no retire', 'a connector without retire (or onChange): the reinstall creates and imports, and nothing throws', async (t) => {
    const w = await successionWorld(t, sdk, { tokens: { retire: false, onChange: false } })
    await w.start()
    await w.reinstall()
    await w.restartHost()
    assert.equal(w.created(), 2)
    assert.equal(w.imports().length, 2)
    assert.deepEqual(w.retired(), [])
  })
  caseTest(sdk, 'ISUCC-EP-02', 'no onChange', 'a connector with retire but without onChange: successor-unpaired → retried at each start (no prompt retry)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired, OUTCOME.unpaired], { tokens: { onChange: false } })
    assert.deepEqual(w.retired(), [E12])
    await w.restartHost()
    assert.deepEqual(w.retired(), [E12, E12])
    await w.start()
    assert.deepEqual(w.retired(), [E12, E12, E12])
    await assertPending(w, undefined, 'after ok')
  })

  // ===================================================================== ISUCC-DT-03: runtime then × runtime now
  for (const [rule, title, act, succession] of [
    [1, 'earlier R1, now R2 (uninstall / runtime reset) → succession: retire(E1, E2)', (w) => w.reinstall(), true],
    [2, 'earlier R1, now R1 (core dropped its copy: a Connect in the child) → no succession (R-HOST-10: never a replace)', (w) => w.sameRuntimeFirstStart(), false],
    [3, 'earlier runtime not recorded (a pre-I-SUCCEED record), now R2 → succession', async (w) => { w.editFile((json) => { delete json[RECORD.runtime] }); await w.restartHost(); await w.reinstall() }, true],
    [4, 'earlier R1, runtimeId() now undefined → no succession', async (w) => { w.setRuntime(undefined); await w.sameRuntimeFirstStart() }, false],
    ['4b', 'earlier runtime not recorded, runtimeId() now undefined → no succession', async (w) => { w.editFile((json) => { delete json[RECORD.runtime] }); await w.restartHost(); w.setRuntime(undefined); await w.sameRuntimeFirstStart() }, false],
  ]) {
    caseTest(sdk, 'ISUCC-DT-03', rule, title, async (t) => {
      const w = await successionWorld(t, sdk)
      await w.start()
      await act(w)
      assert.equal(w.created(), 2, 'the first start created no new entry')
      assert.deepEqual(await w.entriesOnDisk(), E12, 'the new entry is recorded, newest last')
      await w.pairChange()
      assert.deepEqual(w.retired(), succession ? [E12] : [])
      await assertPending(w, undefined, succession ? 'after retire ok' : 'no succession was started')
    })
  }
  caseTest(sdk, 'ISUCC-DT-03', '5 (record)', "the new entry's runtime is always recorded: the first install, a same-runtime first start and a reinstall each leave the runtime now in hosted.json", async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    assert.equal(await w.runtimeOnDisk(), RUNTIME.r1, 'after the first install')
    await w.sameRuntimeFirstStart()
    assert.equal(await w.runtimeOnDisk(), RUNTIME.r1, 'after a same-runtime first start')
    await w.reinstall()
    assert.equal(await w.runtimeOnDisk(), RUNTIME.r2, 'after a reinstall')
  })
  caseTest(sdk, 'ISUCC-DT-03', '6 (Reconnect)', 'Reconnect under a new runtime id records it and starts no succession; a first start under that runtime then starts none either', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.setRuntime(RUNTIME.r2)
    assert.deepEqual(await w.reconnect(), { ok: true })
    assert.equal(await w.runtimeOnDisk(), RUNTIME.r2)
    await w.sameRuntimeFirstStart()
    assert.equal(w.created(), 3)
    await w.pairChange()
    assert.deepEqual(w.retired(), [])
    await assertPending(w, undefined, 'Reconnect is never a succession')
  })
  caseTest(sdk, 'ISUCC-DT-03', '7 (no runtime id at install)', 'runtimeId() undefined throughout: first install and a later first start → two entries, no succession', async (t) => {
    const w = await successionWorld(t, sdk, { runtime: undefined })
    await w.start()
    await w.reinstall()
    assert.equal(w.created(), 2)
    assert.deepEqual(w.retired(), [])
  })

  // ===================================================================== ISUCC-ST-02: hosted.json cannot be written
  /** First install under R1, then a reinstall while hosted.json cannot be written. */
  async function unrecorded(t) {
    const w = await successionWorld(t, sdk)
    await w.start()
    w.breakWrites()
    await w.reinstall()
    assert.equal(w.created(), 2, 'the reinstall created no entry')
    assert.equal(w.imports().length, 2, 'the new value was not imported')
    return w
  }
  caseTest(sdk, 'ISUCC-ST-02', 1, 'write fails → no retire while the successor is unrecorded, not even on a pair change; hosted.json still lists E1 only', async (t) => {
    const w = await unrecorded(t)
    await w.pairChange()
    assert.deepEqual(w.retired(), [])
    assert.deepEqual(await w.entriesOnDisk(), [ENTRY.e1])
  })
  for (const [part, title, trigger] of [
    ['2 (next start)', 'the next start', (w) => w.start()],
    ['2 (pair change)', 'a pair change', (w) => w.pairChange()],
  ]) {
    caseTest(sdk, 'ISUCC-ST-02', part, `writes recover → ${title} replays the add (E2, its pending succession) before retire(E1, E2); nothing new is created`, async (t) => {
      const w = await unrecorded(t)
      w.mendWrites()
      await trigger(w)
      assert.deepEqual(w.retired(), [E12])
      assert.equal(w.created(), 2, 'the replay created an entry')
      assert.deepEqual(await w.entriesOnDisk(), E12)
      await assertPending(w, undefined, 'after retire ok')
    })
  }
  caseTest(sdk, 'ISUCC-ST-02', '2 (replay first)', 'the replayed add reaches hosted.json before retire is called (the successor is recorded when retire runs)', async (t) => {
    const w = await unrecorded(t)
    w.mendWrites()
    const seen = []
    w.tokens.onRetire = async () => { seen.push(await w.entriesOnDisk()) }
    await w.start()
    assert.deepEqual(w.retired(), [E12])
    assert.deepEqual(seen[0], E12, 'hosted.json when retire was called')
  })
  caseTest(sdk, 'ISUCC-ST-02', '3 (Reconnect)', 'writes recover → Reconnect replays E2 first, then records its own E3, in creation order; the succession keeps old E1 and targets the newest E3', async (t) => {
    const w = await unrecorded(t)
    w.mendWrites()
    assert.deepEqual(await w.reconnect(), { ok: true })
    assert.deepEqual(await w.entriesOnDisk(), [ENTRY.e1, ENTRY.e2, ENTRY.e3])
    assert.deepEqual(w.retired().at(-1), [ENTRY.e1, ENTRY.e3], 'the last retire: ' + JSON.stringify(w.retired()))
    assert.deepEqual(w.retired().filter(([o]) => o !== ENTRY.e1), [], 'an old entry other than E1')
  })
  caseTest(sdk, 'ISUCC-ST-02', '4 (queue)', "two unrecorded entries (the reinstall's E2, then a Reconnect's E3 while writes still fail) → once writes succeed both are written in creation order; pending old E1, successor E3", async (t) => {
    const w = await unrecorded(t)
    await w.reconnect()
    assert.equal(w.created(), 3, 'the Reconnect created no entry while the record was down')
    assert.deepEqual(w.retired(), [], 'retire while the successor is unrecorded')
    w.mendWrites()
    await w.start()
    assert.deepEqual(w.retired(), [[ENTRY.e1, ENTRY.e3]])
    assert.deepEqual(await w.entriesOnDisk(), [ENTRY.e1, ENTRY.e2, ENTRY.e3])
    await assertPending(w, undefined, 'after retire ok')
  })
  caseTest(sdk, 'ISUCC-ST-02', 5, 'the settle write fails after retire ok → nothing is created then, nor at the next start (the child holds its credential, R-HOST-05)', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    w.breakWrites()
    await w.pairChange()
    assert.deepEqual(w.retired(), [E12, E12])
    w.mendWrites()
    await w.start()
    assert.equal(w.created(), 2)
  })

  // ===================================================================== ISUCC-ST-03: close() while a step is queued or in flight
  caseTest(sdk, 'ISUCC-ST-03', 1, 'close() while retire is in flight → when it answers ok, nothing more is written to hosted.json and no retire follows', async (t) => {
    const w = await successionWorld(t, sdk)
    await w.start()
    const held = gate()
    w.tokens.answer(held.wait(OUTCOME.ok))
    const reinstall = w.reinstall()
    await held.reached
    const closing = w.hosted.close()
    const [calls, writes] = [w.retired().length, w.writes.length]
    held.open()
    await reinstall
    await closing
    await w.pairChange()
    assert.equal(w.retired().length, calls, 'a retire after close()')
    assert.deepEqual(w.writes.slice(writes), [], 'hosted.json written after close()')
  })
  caseTest(sdk, 'ISUCC-ST-03', 2, 'close() with a pair-change retry queued behind an in-flight retire → the queued step calls no retire and writes nothing', async (t) => {
    const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
    const held = gate()
    w.tokens.answer(held.wait(OUTCOME.unpaired))
    w.tokens.emit()
    await held.reached
    w.tokens.emit()
    const closing = w.hosted.close()
    const [calls, writes] = [w.retired().length, w.writes.length]
    held.open()
    await closing
    await settled()
    assert.equal(w.retired().length, calls, 'a retire after close()')
    assert.deepEqual(w.writes.slice(writes), [], 'hosted.json written after close()')
  })

  // ===================================================================== RFI-F06: only a definite import answer counts
  for (const [part, title, play] of [
    ['unanswered', 'the wire closes while the store write hangs (no answer)', (w) => {
      w.credentials.set = async () => { w.wires.at(-1).lose(); await new Promise(() => {}) }
    }],
    ['refused', 'the child answers its own refusal', (w) => { w.credentials.failSet = true }],
  ]) {
    caseTest(sdk, 'RFI-F06', part, `F06 pending(E1 → E2), old credential present, Reconnect's import: ${title} → ${K3.unwritable}; E3 not recorded; no retire aimed at E3; the pending old entry kept`, async (t) => {
      const w = await reinstalled(t, sdk, [OUTCOME.unpaired])
      w.tokens.answerAlways(OUTCOME.unpaired)
      play(w)
      assert.deepEqual(await w.reconnect(), { ok: false, code: K3.unwritable })
      assert.deepEqual(await w.entriesOnDisk(), E12, 'hosted.json entries')
      await w.pairChange()
      assert.deepEqual(w.retired().filter(([, successor]) => successor === ENTRY.e3), [], 'retargeted to an entry the child never stored: ' + JSON.stringify(w.retired()))
      await assertPending(w, ENTRY.e1, 'the pending old entry')
    })
  }
})
