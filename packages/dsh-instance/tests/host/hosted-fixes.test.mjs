/**
 * R-FIX-INSTANCE rows of the hosted-token rules alone (the findings relayed 2026-11-18, with the
 * fixer's corrections that day; hosted.js JSDoc):
 * - F01: a credential client replaced while createHosted is in flight → the value reaches neither
 *   client, nothing is recorded, Reconnect answers not-ready;
 * - F05: close() returns a Promise that settles after the running step, its record write included;
 *   steps after close do nothing;
 * - F06: only the child's answer to this import counts; an unanswered import is
 *   credentials-unwritable at once (no retry), whatever the probe says.
 * Real createHostedToken over a fake connector, a scripted client and an in-memory record.
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { drain, hold, settle } from '@dsh-instance/test-helpers/wait'
import { fakeTokens } from '../support/fakes.mjs'
import { FIXTURE, K3, NOTICE } from './constants.mjs'
import { ANSWER, memoryRecord, scriptedClient } from './fakes.mjs'
import { load, scopeOf } from './worlds.mjs'

const entry = (n) => FIXTURE.entryPrefix + n

/** The real rules over a fake connector, a replaceable scripted client and an in-memory record. */
async function tokenWorld(t, sdk, { client = scriptedClient(), record = memoryRecord() } = {}) {
  const { createHostedToken } = await load(sdk, 'hosted')
  const tokens = fakeTokens({ fixture: FIXTURE, onChange: false })
  let current = client
  const hosted = createHostedToken({ tokens: () => tokens, record, credentials: () => current, instanceId: () => FIXTURE.instanceId, runtimeId: () => FIXTURE.runtimeId, changed: () => {} })
  scopeOf(t).defer(() => hosted.close())
  return { hosted, tokens, record, setClient(next) { current = next } }
}
/** createHosted that waits on a gate; `reached` resolves when a call arrives. */
function holdCreate(tokens) {
  const create = tokens.createHosted.bind(tokens)
  const held = hold()
  tokens.createHosted = async (id) => { await held.enter(); return create(id) }
  return { reached: held.reached, open: held.open }
}
/** A record whose add waits on a gate; `done` lists the keys whose add finished. */
function heldRecord() {
  const record = memoryRecord()
  const add = record.add.bind(record)
  const held = hold()
  const done = []
  record.add = async (key, options) => { await held.enter(); await add(key, options); done.push(key) }
  return { record, done, reached: held.reached, open: held.open }
}

eachSdk((sdk) => {
  for (const step of ['reconnect', 'firstStart']) {
    caseTest(sdk, 'RFI-F01', 'wire replaced, ' + step, `${step}: the credential client is replaced while createHosted is in flight → the value reaches neither client; nothing recorded${step === 'reconnect' ? '; not-ready' : ''}`, async (t) => {
      const first = scriptedClient()
      const second = scriptedClient()
      const w = await tokenWorld(t, sdk, { client: first })
      const held = holdCreate(w.tokens)
      const result = settle(() => w.hosted[step]())
      await held.reached
      w.setClient(second)
      held.open()
      const outcome = await result
      if (step === 'reconnect') assert.deepEqual(outcome.value, { ok: false, code: K3.refusal.notReady })
      assert.deepEqual([first.calls.imports, second.calls.imports], [[], []])
      assert.deepEqual(w.record.added, [])
    })
  }

  caseTest(sdk, 'RFI-F05', 'promise', 'close() returns a Promise; with nothing running it settles', async (t) => {
    const w = await tokenWorld(t, sdk)
    const closed = w.hosted.close()
    assert.equal(typeof closed?.then, 'function')
    await closed
  })
  caseTest(sdk, 'RFI-F05', 'drain', 'close() during a Reconnect whose record write is pending settles only after that write finished', async (t) => {
    const held = heldRecord()
    const w = await tokenWorld(t, sdk, { record: held.record })
    const reconnect = w.hosted.reconnect()
    await held.reached
    let settled = false
    const closed = w.hosted.close().then(() => { settled = true })
    await drain()
    assert.equal(settled, false, 'close() settled while the record write was pending')
    held.open()
    await closed
    assert.deepEqual(held.done, [entry(1)])
    await reconnect
  })
  caseTest(sdk, 'RFI-F05', 'after close', 'steps after close do nothing: Reconnect → not-ready, firstStart creates nothing, nothing imported or recorded', async (t) => {
    const client = scriptedClient()
    const w = await tokenWorld(t, sdk, { client })
    await w.hosted.close()
    assert.deepEqual(await w.hosted.reconnect(), { ok: false, code: K3.refusal.notReady })
    await settle(() => w.hosted.firstStart())
    assert.deepEqual([w.tokens.calls.created, client.calls.imports, w.record.added], [[], [], []])
  })

  // F06 decision table: old credential present (probe) × the child's answer to the import.
  for (const [part, present, answer, expected, recorded] of [
    ['present, unanswered', true, ANSWER.none, { ok: false, code: K3.refusal.unwritable }, []],
    ['absent, unanswered', false, ANSWER.none, { ok: false, code: K3.refusal.unwritable }, []],
    ['present, ok', true, ANSWER.ok, { ok: true }, [entry(1)]],
    ['absent, ok', false, ANSWER.ok, { ok: true }, [entry(1)]],
    ['present, refused', true, ANSWER.refused, { ...ANSWER.refused }, []],
  ]) {
    caseTest(sdk, 'RFI-F06', part, `Reconnect: old credential ${present ? 'present' : 'absent'}, import ${answer === ANSWER.none ? 'unanswered' : JSON.stringify(answer)} → ${JSON.stringify(expected)}; one import, no retry; recorded ${JSON.stringify(recorded)}`, async (t) => {
      const client = scriptedClient([answer, ANSWER.ok], { present })
      const w = await tokenWorld(t, sdk, { client })
      assert.deepEqual(await w.hosted.reconnect(), expected)
      assert.equal(client.calls.imports.length, 1)
      assert.deepEqual(w.record.added, recorded)
    })
  }
  caseTest(sdk, 'RFI-F06', 'notice kept', 'an unanswered Reconnect import keeps the hosted-entry-deleted notice and records nothing', async (t) => {
    const client = scriptedClient([ANSWER.ok, ANSWER.none, ANSWER.ok])
    const w = await tokenWorld(t, sdk, { client })
    assert.deepEqual(await w.hosted.reconnect(), { ok: true })
    w.tokens.setState(entry(1), K3.entry.deleted)
    w.hosted.retryNotice()
    assert.equal(w.hosted.notice(), NOTICE)
    assert.deepEqual(await w.hosted.reconnect(), { ok: false, code: K3.refusal.unwritable })
    assert.equal(w.hosted.notice(), NOTICE)
    assert.deepEqual(w.record.added, [entry(1)])
  })
  for (const [part, answer, recorded] of [['unanswered', ANSWER.none, []], ['ok', ANSWER.ok, [entry(1)]], ['refused', ANSWER.refused, []]]) {
    caseTest(sdk, 'RFI-F06', 'first start ' + part, `the first-start import ${part}: one import (no retry), recorded ${JSON.stringify(recorded)}`, async (t) => {
      const client = scriptedClient([answer, ANSWER.ok])
      const w = await tokenWorld(t, sdk, { client })
      await settle(() => w.hosted.firstStart())
      assert.equal(client.calls.imports.length, 1)
      assert.deepEqual(w.record.added, recorded)
    })
  }
})
