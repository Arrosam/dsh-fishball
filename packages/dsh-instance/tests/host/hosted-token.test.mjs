/**
 * The hosted token's rules (README "The hosted token"; hosted.js JSDoc; R1, R6 = B, R11, Q-B1/Q-B3,
 * MULTI-2 §3.3): when the instance asks the connector for a hosted entry and imports its value into
 * the child, what the locator reports as the target status, and where the value may appear.
 * Real createHostedToken + createChildLocator + the real credential client and receiver over an
 * in-memory wire; fake connector, child store and lifecycle (worlds.mjs hostedWorld).
 *
 * Techniques: use cases HOST-UC-01/02/04/05; EP HOST-EP-02 (where the value may appear); state
 * transitions HOST-ST-03 (the value's lifecycle); decision tables HOST-DT-01 (does it create?),
 * HOST-DT-targetStatus, HOST-DT-reconnect; MULTI-2 rows (extra targets' credentials).
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { leakHits } from '@dsh-instance/test-helpers/scratch'
import { FIXTURE, IMPORT, K3, NOTICE, RECORD, TARGET } from './constants.mjs'
import { extraCredentialsOf, parseFrame, plantedExtraCredentials, seedExtraCredentials, settle, textOf, until } from './fakes.mjs'
import { hostedWorld, recordFile } from './worlds.mjs'
import fs from 'node:fs'

const entry = (n) => FIXTURE.entryPrefix + n

eachSdk((sdk) => {
  // ============================================================ HOST-UC-01: first hosted start
  caseTest(sdk, 'HOST-UC-01', 'main 2–3', 'no credential in the child (connector usable) → exactly one createHosted(instanceId), its value imported once on the wire', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(w.tokens.calls.created, [FIXTURE.instanceId])
    assert.deepEqual(w.imports().map((f) => f.value), [w.tokens.values()[0]])
  })
  caseTest(sdk, 'HOST-UC-01', 'main 3', "the child-side receiver writes exactly credentials.set('DSH_AGENT_TOKEN', value) and nothing else", async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(w.credentials.calls.set, [[IMPORT.credentialRef, w.tokens.values()[0]]])
    assert.deepEqual([w.credentials.calls.unset, w.credentials.calls.other], [[], []])
  })
  caseTest(sdk, 'HOST-UC-01', 'main 2', "the presence question is DSH's own: describe(DSH_AGENT_TOKEN) / describeRecord(fishball-core/hosted-agent); no value is resolved", async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.ok(w.credentials.calls.describe.includes(IMPORT.credentialRef), JSON.stringify(w.credentials.calls.describe))
    assert.ok(w.credentials.calls.describeRecord.every((key) => key === IMPORT.savedRecord))
    assert.deepEqual(w.credentials.calls.resolve, [])
  })
  caseTest(sdk, 'HOST-UC-01', 'main 2', 'the entry key is recorded only after the child stored the value (store write before the record add)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(w.record.entries(), [entry(1)])
    assert.deepEqual(w.order, ['child-set', 'record-add'])
  })
  caseTest(sdk, 'HOST-UC-01', 'main 6', 'after the first start the locator reports target status connected (last entry enabled)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(w.locator.targetStatus(), TARGET.connected)
  })
  caseTest(sdk, 'HOST-UC-01', 'main 2 record', 'the record file is <mainHome>/fishball/hosted.json, mode 0600, {format: 1, instanceId, entries: [key], runtime}, with no token value', async (t) => {
    const w = await hostedWorld(t, sdk, { record: 'file' })
    await w.hosted.firstStart()
    const file = recordFile(w.mainHome)
    assert.equal(fs.statSync(file).mode & 0o777, RECORD.mode)
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(typeof json.instanceId, 'string')
    assert.deepEqual(json, { format: RECORD.format, instanceId: json.instanceId, entries: [entry(1)], runtime: FIXTURE.runtimeId })
    assert.deepEqual(leakHits(w.tokens.values(), { places: { record: fs.readFileSync(file, 'utf8') } }), [])
  })

  // ============================================================ HOST-UC-02: restarts and reconnects create nothing
  for (const [part, title, act] of [
    ['main restart', 'a child restart (new wire, credential present)', (w) => w.restart()],
    ['main core-saved', 'a crash and restart after core saved its copy (reference unset, record present)', async (w) => { w.credentials.coreSaves(); await w.restart() }],
    ['A1', 'a host DSH restart (a new wire again)', (w) => w.restart()],
    ['main link', 'a reconnect of the link (the wire drops and comes back, credential present)', async (w) => { w.wire.lose(); await w.restart() }],
    ['main retry', 'Retry while the child is ready', (w) => w.locator.retry()],
  ]) {
    caseTest(sdk, 'HOST-UC-02', part, `${title} → no createHosted, no import frame`, async (t) => {
      const w = await hostedWorld(t, sdk)
      await w.hosted.firstStart()
      await act(w)
      assert.equal(w.tokens.calls.created.length, 1)
      assert.equal(w.imports().length, 1)
    })
  }
  caseTest(sdk, 'HOST-UC-02', 'post', 'after three restarts the record holds exactly the one entry it had', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    for (let i = 0; i < 3; i++) await w.restart()
    assert.deepEqual(w.record.entries(), [entry(1)])
  })

  // ============================================================ HOST-UC-04: the user disables or deletes the entry
  caseTest(sdk, 'HOST-UC-04', 'main disabled', 'disabled → targetStatus token-refused / token-revoked; a restart and a Retry create no replacement', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(entry(1), K3.entry.disabled)
    assert.deepEqual(w.locator.targetStatus(), TARGET.revoked)
    await w.restart()
    await w.locator.retry()
    assert.equal(w.tokens.calls.created.length, 1)
  })
  caseTest(sdk, 'HOST-UC-04', 'main re-enabled', 'disabled then re-enabled → connected again with the same entry (no replacement)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(entry(1), K3.entry.disabled)
    await w.locator.retry()
    w.tokens.setState(entry(1), K3.entry.enabled)
    assert.deepEqual(w.locator.targetStatus(), TARGET.connected)
    assert.deepEqual(w.record.entries(), [entry(1)])
  })
  caseTest(sdk, 'HOST-UC-04', 'A1 deleted', 'deleted → no automatic createHosted; Retry creates none either (R6 = B) and leaves the notice hosted-entry-deleted', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(entry(1), K3.entry.deleted)
    await w.restart()
    assert.equal(w.tokens.calls.created.length, 1)
    await w.locator.retry()
    assert.equal(w.tokens.calls.created.length, 1)
    assert.equal(w.hosted.notice(), NOTICE)
  })
  caseTest(sdk, 'HOST-UC-04', 'A1 reconnect', 'after a delete, Reconnect creates exactly one new entry and imports it once; the notice clears; connected', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(entry(1), K3.entry.deleted)
    await w.locator.retry()
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.equal(w.tokens.calls.created.length, 2)
    assert.equal(w.imports().length, 2)
    assert.equal(w.hosted.notice(), null)
    assert.deepEqual(w.locator.targetStatus(), TARGET.connected)
  })
  caseTest(sdk, 'HOST-UC-04', 'E1', 'a delete is never a reinstall: Retry and Reconnect ask the connector to retire nothing', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(entry(1), K3.entry.deleted)
    await w.locator.retry()
    await w.locator.reconnect()
    assert.deepEqual(w.tokens.calls.retired, [])
  })

  // ============================================================ HOST-UC-05 (MULTI-2): no remote override
  caseTest(sdk, 'HOST-UC-05', 'post (MULTI-2)', 'an extra remoteTarget dependency cannot suppress actual-parent first-start provisioning', async (t) => {
    const w = await hostedWorld(t, sdk, { remote: FIXTURE.remote })
    await w.hosted.firstStart()
    assert.deepEqual(w.tokens.calls.created, [FIXTURE.instanceId])
    assert.equal(w.imports().length, 1)
  })
  caseTest(sdk, 'HOST-UC-05', 'E1 (MULTI-2)', 'an extra remoteTarget dependency cannot replace the reserved parent target status', async (t) => {
    const w = await hostedWorld(t, sdk, { remote: FIXTURE.remote })
    assert.deepEqual(w.locator.targetStatus(), TARGET.unset)
    await w.hosted.firstStart()
    assert.deepEqual(w.locator.targetStatus(), TARGET.connected)
  })
  caseTest(sdk, 'HOST-UC-05', 'main (MULTI-2)', 'Reconnect always provisions the actual parent; no target-remote refusal exists', async (t) => {
    const w = await hostedWorld(t, sdk, { remote: FIXTURE.remote })
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.deepEqual(w.tokens.calls.created, [FIXTURE.instanceId])
    assert.equal(w.imports().length, 1)
  })

  // ============================================================ HOST-EP-02 (R1): where the hosted value may appear
  caseTest(sdk, 'HOST-EP-02', '1, 7', 'the value is in the child credential store and in one import frame on the channel, nowhere else on the wire', async (t) => {
    const w = await hostedWorld(t, sdk, { record: 'file' })
    await w.hosted.firstStart()
    const value = w.tokens.values()[0]
    assert.equal(w.credentials.refs.get(IMPORT.credentialRef), value)
    const carrying = w.frames().filter((f) => f.text.includes(value))
    assert.deepEqual(carrying.map((f) => [f.dir, parseFrame(f.text)?.op]), [['toChild', IMPORT.ops.import]])
  })
  caseTest(sdk, 'HOST-EP-02', 3, "never in the hosted record, the host's files, the locator's answers, the notice or the child's replies", async (t) => {
    const w = await hostedWorld(t, sdk, { record: 'file' })
    await w.hosted.firstStart()
    await w.restart()
    w.tokens.setState(entry(1), K3.entry.deleted)
    await w.locator.retry()
    await w.locator.reconnect()
    const places = {
      status: textOf(w.locator.status()), target: textOf(w.locator.targetStatus()), notice: textOf(w.hosted.notice()),
      agentEntry: textOf(w.locator.agentEntry()), replies: w.wires.flatMap((x) => x.frames.toHost).join('\n'),
    }
    assert.deepEqual(leakHits(w.tokens.values(), { places, dirs: [w.mainHome] }), [])
  })

  // ============================================================ HOST-ST-03: the hosted value's lifecycle
  caseTest(sdk, 'HOST-ST-03', 1, 'none → first start → imported once; the child store holds it', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.equal(w.credentials.refs.get(IMPORT.credentialRef), w.tokens.values()[0])
    assert.equal(w.imports().length, 1)
  })
  caseTest(sdk, 'HOST-ST-03', 2, 'imported → core saves its copy (reference unset, record present) → restart: present, nothing created', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.credentials.coreSaves()
    await w.restart()
    assert.equal(w.tokens.calls.created.length, 1)
  })
  caseTest(sdk, 'HOST-ST-03', 3, 'saved → reinstall (child home gone) → a first start again: one new createHosted, imported once, recorded newest last', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.credentials.coreSaves()
    await w.reinstall()
    assert.equal(w.tokens.calls.created.length, 2)
    assert.equal(w.imports().length, 2)
    assert.deepEqual(w.record.entries(), [entry(1), entry(2)])
  })
  caseTest(sdk, 'HOST-ST-03', 4, 'saved → the user deletes the entry → Retry: no token, notice hosted-entry-deleted; targetStatus token-refused/token-revoked', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.credentials.coreSaves()
    w.tokens.setState(entry(1), K3.entry.deleted)
    assert.deepEqual(w.locator.targetStatus(), TARGET.revoked)
    await w.locator.retry()
    assert.equal(w.tokens.calls.created.length, 1)
    assert.equal(w.hosted.notice(), NOTICE)
  })
  caseTest(sdk, 'HOST-ST-03', 5, 'notice → Reconnect → a new entry imported once, recorded last; the notice clears; nothing retired', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(entry(1), K3.entry.deleted)
    await w.locator.retry()
    await w.locator.reconnect()
    assert.equal(w.record.entries().at(-1), entry(2))
    assert.equal(w.hosted.notice(), null)
    assert.deepEqual(w.tokens.calls.retired, [])
  })
  caseTest(sdk, 'HOST-ST-03', 6, 'a working entry → Reconnect (rotate in one click): one createHosted, one import; the old entry stays recorded', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.equal(w.tokens.calls.created.length, 2)
    assert.equal(w.imports().length, 2)
    assert.deepEqual(w.record.entries(), [entry(1), entry(2)])
  })
  caseTest(sdk, 'HOST-ST-03', 7, 'disabled → Retry → nothing (no notice, no token)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(entry(1), K3.entry.disabled)
    await w.locator.retry()
    assert.equal(w.hosted.notice(), null)
    assert.equal(w.tokens.calls.created.length, 1)
  })

  // ============================================================ HOST-DT-01: does the instance create a hosted token?
  // Conditions: connector usable × credential present × last entry state × trigger → createHosted count.
  for (const [rule, title, setup, trigger, expected] of [
    [1, 'connector, no credential, no entry, first start → create one', {}, 'start', 1],
    [2, 'connector, credential present (reference), entry enabled, start → nothing', { credentials: { ref: true }, seed: K3.entry.enabled }, 'start', 0],
    ['2b', 'connector, credential present (saved record only), start → nothing', { credentials: { record: true } }, 'start', 0],
    [3, 'connector, credential present, entry disabled, start → nothing', { credentials: { ref: true }, seed: K3.entry.disabled }, 'start', 0],
    [4, 'connector, stale credential, entry deleted, start (no Retry) → nothing', { credentials: { record: true }, seed: K3.entry.deleted }, 'start', 0],
    [5, 'connector, stale credential, entry deleted, Retry → nothing, the notice (R6 = B)', { credentials: { record: true }, seed: K3.entry.deleted }, 'retry', 0],
    [8, 'no connector, no credential, start → nothing', { tokens: false }, 'start', 0],
    ['8b', 'a connector with another apiVersion (unusable), no credential, start → nothing', { tokens: 2 }, 'start', 0],
    [9, 'MULTI-2 extra remote dependency, parent connector, no credential, start → one parent import', { remote: FIXTURE.remote }, 'start', 1],
    ['9b', 'MULTI-2 extra remote dependency, reserved credential present, Retry → no replacement', { remote: FIXTURE.remote, credentials: { ref: true } }, 'retry', 0],
  ]) {
    caseTest(sdk, 'HOST-DT-01', rule, title, async (t) => {
      const w = await hostedWorld(t, sdk, setup)
      if (setup.seed) await w.seedEntry(setup.seed)
      await w.hosted.firstStart()
      if (trigger === 'retry') await w.locator.retry()
      assert.equal(w.tokens?.calls.created.length ?? 0, expected)
      assert.equal(w.imports().length, expected)
      assert.equal(w.hosted.notice(), rule === 5 ? NOTICE : null)
    })
  }
  caseTest(sdk, 'HOST-DT-01', 'probe', 'a probe with no answer (the channel bound passes) is not "absent": nothing is created', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const w = await hostedWorld(t, sdk, { receiver: false })
    const started = settle(() => w.hosted.firstStart())
    await until(() => w.wire.frames.toChild.length === 1)
    t.mock.timers.tick(FIXTURE.timeoutMs)
    await started
    assert.deepEqual(w.tokens.calls.created, [])
  })
  caseTest(sdk, 'HOST-DT-01', 'store', 'the child cannot store the value → the entry key is not recorded', async (t) => {
    const w = await hostedWorld(t, sdk, { credentials: { failSet: true } })
    await settle(() => w.hosted.firstStart())
    assert.equal(w.tokens.calls.created.length, 1)
    assert.deepEqual(w.record.entries(), [])
  })

  // ============================================================ HOST-DT-targetStatus (the host's own state, Q3 = A)
  for (const [rule, title, setup, expected] of [
    [1, 'MULTI-2 an extra remote dependency cannot replace an absent parent entry → target-unset', { remote: FIXTURE.remote }, TARGET.unset],
    ['1b', 'MULTI-2 a one-character extra dependency cannot replace an absent parent entry → target-unset', { remote: 'x' }, TARGET.unset],
    [2, 'no dshConnectorTokens → target-unset', { tokens: false }, TARGET.unset],
    ['2b', 'dshConnectorTokens apiVersion 2 (unusable) → target-unset', { tokens: 2 }, TARGET.unset],
    [3, 'connector, no recorded entry → target-unset', {}, TARGET.unset],
    [4, 'last entry deleted → token-refused / token-revoked', { last: K3.entry.deleted }, TARGET.revoked],
    [5, 'last entry disabled → token-refused / token-revoked', { last: K3.entry.disabled }, TARGET.revoked],
    [6, 'last entry enabled → connected', { last: K3.entry.enabled }, TARGET.connected],
    [7, 'an older entry deleted, the newest enabled → connected (the LAST entry decides)', { older: K3.entry.deleted, last: K3.entry.enabled }, TARGET.connected],
    ['BVA', "an extra dependency of spaces only ('   ') → target-unset", { remote: FIXTURE.spaces }, TARGET.unset],
  ]) {
    caseTest(sdk, 'HOST-DT-targetStatus', rule, title, async (t) => {
      const w = await hostedWorld(t, sdk, setup)
      if (setup.older) await w.seedEntry(setup.older)
      if (setup.last) await w.seedEntry(setup.last)
      assert.deepEqual(w.locator.targetStatus(), expected)
      assert.deepEqual(w.hosted.targetStatus(), expected)
    })
  }

  // ============================================================ HOST-DT-reconnect: Reconnect's answers (K3 ReconnectRefusalCode)
  for (const [rule, title, setup, expected, created] of [
    [1, 'child not ready → not-ready, nothing created', { lifecycle: { state: K3.state.stopped, code: null } }, { ok: false, code: K3.refusal.notReady }, 0],
    [2, 'no dshConnectorTokens → connector-missing', { tokens: false }, { ok: false, code: K3.refusal.connectorMissing }, 0],
    ['2b', 'dshConnectorTokens apiVersion 2 → connector-missing', { tokens: 2 }, { ok: false, code: K3.refusal.connectorMissing }, 0],
    [3, 'MULTI-2 an extra remote dependency cannot refuse the parent Reconnect → ok', { remote: FIXTURE.remote }, { ok: true }, 1],
    [4, 'createHosted rejects → operation-failed; nothing imported or recorded', { failCreate: true }, { ok: false, code: K3.refusal.failed }, 1],
    [5, 'the child cannot store it → credentials-unwritable; not recorded', { credentials: { failSet: true } }, { ok: false, code: K3.refusal.unwritable }, 1],
    [7, 'ready, connector, writable → ok, one createHosted, recorded', {}, { ok: true }, 1],
  ]) {
    caseTest(sdk, 'HOST-DT-reconnect', rule, title, async (t) => {
      const w = await hostedWorld(t, sdk, setup)
      if (setup.failCreate) w.tokens.failNextCreate()
      assert.deepEqual(await w.locator.reconnect(), expected)
      assert.equal(w.tokens?.calls.created.length ?? 0, created)
      assert.deepEqual(w.record.entries(), expected.ok ? [entry(1)] : [])
      if (setup.failCreate) assert.equal(w.imports().length, 0)
    })
  }
  caseTest(sdk, 'HOST-DT-reconnect', 6, 'no answer on the channel within its bound → credentials-unwritable; not recorded', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const w = await hostedWorld(t, sdk, { receiver: false })
    const answer = w.locator.reconnect()
    await until(() => w.imports().length === 1)
    t.mock.timers.tick(FIXTURE.timeoutMs)
    assert.deepEqual(await answer, { ok: false, code: K3.refusal.unwritable })
    assert.deepEqual(w.record.entries(), [])
  })

  // ============================================================ MULTI-2: additional targets' credentials
  for (const reserved of ['absent', 'reference', 'record']) {
    caseTest(sdk, 'MULTI-2', `host DT H2/H3/H4 ${reserved}`, `reserved parent credential ${reserved}: extra targets' credentials neither satisfy the probe nor change the parent import`, async (t) => {
      const w = await hostedWorld(t, sdk, { credentials: { ref: reserved === 'reference', record: reserved === 'record' } })
      seedExtraCredentials(w.credentials)
      await w.hosted.firstStart()
      const made = reserved === 'absent' ? 1 : 0
      assert.equal(w.tokens.calls.created.length, made)
      assert.equal(w.imports().length, made)
      assert.deepEqual(extraCredentialsOf(w.credentials), plantedExtraCredentials())
      assert.ok(w.credentials.calls.describe.every((key) => key === IMPORT.credentialRef))
      assert.ok(w.credentials.calls.describeRecord.every((key) => key === IMPORT.savedRecord))
      assert.deepEqual(w.credentials.calls.set, made ? [[IMPORT.credentialRef, w.tokens.values()[0]]] : [])
      assert.deepEqual(w.credentials.calls.resolve, [])
    })
  }
  caseTest(sdk, 'MULTI-2', 'host ST import/core-save/restart/reconnect', 'extra credentials survive the first import, core save, a restart and an explicit Reconnect', async (t) => {
    const w = await hostedWorld(t, sdk)
    seedExtraCredentials(w.credentials)
    await w.hosted.firstStart()
    w.credentials.coreSaves()
    await w.restart()
    assert.equal(w.tokens.calls.created.length, 1)
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.equal(w.tokens.calls.created.length, 2)
    assert.equal(w.imports().length, 2)
    assert.deepEqual(extraCredentialsOf(w.credentials), plantedExtraCredentials())
  })
})
