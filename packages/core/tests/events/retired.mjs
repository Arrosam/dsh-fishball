/**
 * MULTI-1 regression rows: recovery removes pending inbox copies of retired events without changing
 * read-only history (the lead's requirement, 2026-11-18: "a retired epoch's undelivered events are
 * never presented to the model; they stay in the ledger as history"; PLAN-MULTI §5 "Retired-epoch
 * records never participate in active reconciliation", Q07 "retain labeled read-only history").
 *
 * A real crash: process 1 (`cut`) has two targets A and B; each delivers one event that core accepts
 * and acks; the Fishball agent's wakes are cancelled keeping the inbox (crash.mjs `holdPending`), so
 * both manager messages wait, unclaimed and durable, in its DSH inbox; then SIGKILL. Process 2
 * (`recover`) reopens the same root with A's endpoint epoch retired (A removed / URL changed while
 * down: A's source is no live target), and reports.
 *
 * Techniques: EP over the event's source at recovery (retired / live); ST pending → (restart) →
 * removed-from-inbox vs delivered; the ledger record's history is checked unchanged (BVA: the record
 * before the crash equals the record after recovery, field by field).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import test from 'node:test'
import { caseName } from 'fishball-test-helpers/cases'
import { CORE, EVENT_TYPE, FIXTURE, SOURCE, WAIT, keyOf } from './constants.mjs'
import { holdPending, kill, pendingIn } from './crash.mjs'
import { makeEvent, newRoot, openWorld, removeRoot } from './world.mjs'
import { TARGETS } from '../support/targets-oracle.mjs'
import { until } from 'fishball-test-helpers/wait'

const PHASE = Object.freeze({ cut: 'cut', recover: 'recover' })
const EVENT_NUMBER = Object.freeze({ a: 41, b: 42 })
const json = (v) => JSON.stringify(v)

/** The ledger record of `event` from `source` (TARGETS.key tuple), or undefined. */
function ledgerRecord(world, source, event) {
  return world.ctx.storageDomain.get(CORE.ledger.domain)?.table(CORE.ledger.table)?.get(keyOf(TARGETS.key.kind.event, source, event.eventId))
}

async function child(root, phase) {
  const a = makeEvent(EVENT_TYPE.message, EVENT_NUMBER.a)
  const b = makeEvent(EVENT_TYPE.message, EVENT_NUMBER.b)
  const recovering = phase === PHASE.recover
  let world
  world = await openWorld(root, {
    secondTarget: true,
    seam: recovering ? { retired: [SOURCE.a] } : undefined,
    onOpen: (w) => {
      world = w
      if (!recovering) { holdPending(w, a, true, SOURCE.a); holdPending(w, b, true, SOURCE.b) }
    },
  })
  if (!recovering) {
    world.link.publish(a)
    world.second.publish(b)
    const left = () => world.link.acked(a.eventId) && world.second.acked(b.eventId) && pendingIn(world.agent, a, SOURCE.a) && pendingIn(world.agent, b, SOURCE.b)
    await until(left, WAIT.settleMs, WAIT.pollMs)
    if (left()) {
      fs.writeFileSync(world.file('retired'), json({ recordA: ledgerRecord(world, SOURCE.a, a) ?? null }))
      await world.ctx.sessions.flush(world.agent.session)
      await kill()
    }
    process.stdout.write(json({ error: 'cut point not reached: both messages pending and acked' }) + '\n')
    process.exit(0)
  }
  await world.settle()
  const before = JSON.parse(fs.readFileSync(world.file('retired'), 'utf8'))
  const report = {
    pendingA: pendingIn(world.agent, a, SOURCE.a),
    admissionsA: (await world.admissions(a.marker)).length,
    modelRequestsA: world.modelRequestsWith(a.marker).length,
    admissionsB: (await world.admissions(b.marker)).length,
    recordBefore: before.recordA,
    recordAfter: ledgerRecord(world, SOURCE.a, a) ?? null,
    misrouted: world.core.misrouted.length,
  }
  await world.close()
  process.stdout.write(json(report) + '\n')
  process.exit(0)
}

function runRetired(root) {
  const run = (phase) => spawnSync(process.execPath, [import.meta.filename, root, phase], { encoding: 'utf8', timeout: WAIT.childMs })
  const last = (r) => (r.stdout ?? '').trim().split('\n').filter(Boolean).at(-1)
  const cut = run(PHASE.cut)
  if (cut.signal !== 'SIGKILL') return { error: `cut phase did not crash (${cut.status ?? cut.signal}): ${last(cut) ?? ''} ${cut.stderr ?? ''}`.trim() }
  const recover = run(PHASE.recover)
  if (recover.status !== 0) return { error: `recover phase failed (${recover.status ?? recover.signal}): ${recover.stderr ?? ''}`.trim() }
  return JSON.parse(last(recover))
}

export function registerRetiredRecoveryCases() {
  let result
  const facts = async (t) => {
    if (result === undefined) {
      const root = await newRoot()
      result = runRetired(root)
      await removeRoot(root)
    }
    assert.equal(result.error, undefined, result.error)
    return result
  }
  const row = (part, title, fn) => test(caseName('MULTI-EVT-RETIRED-ST-01', part, title), { timeout: WAIT.testMs }, async (t) => fn(await facts(t)))
  row('1 removed from inbox', 'a pending manager message of a retired endpoint epoch (A) is gone from the DSH inbox after recovery', (r) => {
    assert.equal(r.pendingA, false, 'the retired event\'s copy is still pending')
  })
  row('2 never presented', 'the retired event is never admitted to Fishball nor reaches a model request after recovery', (r) => {
    assert.equal(r.admissionsA, 0, 'the retired event woke Fishball')
    assert.equal(r.modelRequestsA, 0, 'the retired event reached the model')
  })
  row('3 history unchanged', 'the retired event\'s ledger record (read-only history) is kept, and equal to what it was before the crash', (r) => {
    assert.notEqual(r.recordBefore, null, 'harness: no record before the crash')
    assert.deepEqual(r.recordAfter, r.recordBefore, 'the history record changed or was deleted')
  })
  row('4 live target unaffected', 'the live target B\'s pending event is delivered once after recovery; no ack goes to a retired link', (r) => {
    assert.equal(r.admissionsB, 1, 'B\'s pending event was not delivered once')
    assert.equal(r.misrouted, 0, 'an ack was sent for the retired source')
  })
}

if (process.argv[1] === import.meta.filename) {
  const [root, phase] = process.argv.slice(2)
  await child(root, phase)
}
