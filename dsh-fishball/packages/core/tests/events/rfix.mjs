/**
 * R-FIX-CORE black-box rows for core's events (review findings F11, F14; acceptance criteria in the
 * task's requirements, .rfix-requirements.md):
 * - F11: recovering E1, E2 (ledger state fishball) with an old pending copy of E1 in DSH's inbox:
 *   core's own removal of the stale copy is no user discard; both are handed over (one per idle),
 *   both end `admitted`; none is discarded / user-stopped;
 * - F14: if moving the record to `committing` fails, `commit` resolves `{ok: false, code: 'fenced'}`
 *   without calling `send` and never rejects; no unhandled rejection anywhere; after the handler
 *   settles the event goes to Fishball once (reason `send-not-delivered`); a failing fallback
 *   write is logged, not thrown.
 *
 * Level: F-INTERCEPT's world (world.mjs) with its `ledgerWrite` seam; F11 is a crash window
 * (crash.mjs, two real processes over one root).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from 'fishball-test-helpers/cases'
import { runCrash } from './crash.mjs'
import { CORE, FIXTURE, K3, PROCESS_EVENT, TOOL, WAIT } from './constants.mjs'
import { contributedType as contributed, eventually, makeEvent, newRoot, removeRoot, worldFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const row = (id, part, title, fn) => test(caseName(id, part, title), T, fn)
let counter = 9000
const nextEvent = () => makeEvent(contributed(), ++counter)

/** Every unhandledRejection raised while `act` runs (listener scoped to it). */
async function unhandledDuring(act) {
  const seen = []
  const on = (reason) => { seen.push(String(reason?.message ?? reason)) }
  process.on(PROCESS_EVENT.unhandledRejection, on)
  try {
    await act()
    // Let a detached tail settle before the listener goes.
    await new Promise((resolve) => setTimeout(resolve, WAIT.quietMs))
  } finally { process.off(PROCESS_EVENT.unhandledRejection, on) }
  return seen
}

/** The ledger write that moves a record to `committing` (the seam's view of a write). */
function movesTo(write, state) {
  const { op, args, table } = write
  const next = op === 'put' ? args[1] : op === 'update' ? args[1](table.get(args[0])) : undefined
  return next !== null && typeof next === 'object' && Object.values(next).includes(state)
}

export function registerRfixEventCases() {
  // ================================================================== F11
  row('RFIX-F11-ST-01', 1, 'recovery of E1, E2 (fishball) with a stale pending E1 copy → both handed over and admitted once each, both ledger admitted, acked; no user-stopped discard [crash]', async (t) => {
    const root = await newRoot()
    t.after(() => removeRoot(root))
    const r = runCrash(root, 'stalePendingTwo')
    assert.equal(r.error, undefined, r.error)
    assert.equal(r.pendingAtRestart, true, 'harness: the stale E1 copy was not pending at the restart')
    assert.equal(r.modelRequestsTotal - r.modelRequestsAfterRestart, 0, 'harness: E1 reached a model before the crash')
    assert.equal(r.admissions, 1, 'E1 admissions in total')
    assert.equal(r.secondAdmissions, 1, 'E2 admissions in total')
    assert.ok(r.ledgerStates.includes(CORE.admitted), 'E1 ledger: ' + JSON.stringify(r.ledgerStates))
    assert.ok(r.secondLedgerStates.includes(CORE.admitted), 'E2 ledger: ' + JSON.stringify(r.secondLedgerStates))
    assert.equal(r.ledgerStates.includes(CORE.discarded), false, 'E1 was discarded')
    assert.equal(r.secondLedgerStates.includes(CORE.discarded), false, 'E2 was discarded')
    assert.equal(r.userStoppedLogs, 0, 'a user-stopped discard was logged for E1 or E2')
    assert.deepEqual([r.acked, r.secondAcked], [true, true])
  })

  // ================================================================== F14
  /** A world whose ledger write into `committing` rejects (once, or every time with `always`); extra faults by `also`. */
  async function fencedWorld(t, { also } = {}) {
    let failedCommitting = 0
    const seam = {
      ledgerWrite: async (write) => {
        if (movesTo(write, CORE.committing)) { failedCommitting += 1; throw new Error('fbtest-rfix EIO committing') }
        if (also?.(write)) throw new Error('fbtest-rfix EIO fallback')
      },
    }
    const world = await worldFor(t, { seam })
    return { world, failures: () => failedCommitting }
  }
  async function interceptAndCommit(world) {
    const outcome = {}
    let sends = 0
    let settle
    const settled = new Promise((resolve) => { settle = resolve })
    await world.plugin({
      pluginId: FIXTURE.pluginX,
      registrations: [{ types: [contributed()] }],
      handler: async (_e, ctl) => {
        try {
          await ctl.accept()
          outcome.commit = await ctl.commit(async () => { sends += 1; return { ok: true } }).then((v) => ({ resolved: v }), (e) => ({ rejected: String(e?.message ?? e) }))
        } finally { settle() }
      },
    })
    return { outcome, sends: () => sends, settled }
  }
  row('RFIX-F14-DT-01', 'rule 1', `the move to committing fails → commit resolves {ok: false, code: ${K3.fenced}}, send not called, no unhandled rejection; Fishball once`, async (t) => {
    const { world, failures } = await fencedWorld(t)
    const ic = await interceptAndCommit(world)
    const event = nextEvent()
    const unhandled = await unhandledDuring(async () => {
      world.link.publish(event)
      await ic.settled
      await world.settle()
    })
    assert.ok(failures() > 0, 'harness: no write into committing was attempted')
    assert.deepEqual(ic.outcome.commit, { resolved: { ok: false, code: K3.fenced } }, 'commit outcome')
    assert.equal(ic.sends(), 0, 'send was called after the fence write failed')
    assert.deepEqual(unhandled, [], 'unhandled rejections')
    assert.equal((await world.admissions(event.marker)).length, 1, 'Fishball wakes for the event')
    assert.ok(world.logs.some((l) => l.text.includes(event.eventId) && l.text.includes(CORE.sendNotDelivered)), `no ${CORE.sendNotDelivered} log line for the event`)
  })
  row('RFIX-F14-DT-01', 'rule 2', 'the move to committing fails and the fallback write fails too → commit still resolves fenced, nothing rejects unhandled, the failure is logged', async (t) => {
    // The fallback is every later write of the record after the failed fence (its move to Fishball).
    let fenced = false
    const { world } = await fencedWorld(t, { also: () => fenced })
    const ic = await interceptAndCommit(world)
    const event = nextEvent()
    const before = world.logs.length
    const unhandled = await unhandledDuring(async () => {
      world.link.publish(event)
      await eventually(() => ic.outcome.commit !== undefined, 'the handler committed')
      fenced = true
      await ic.settled
      await world.settle()
    })
    assert.deepEqual(ic.outcome.commit, { resolved: { ok: false, code: K3.fenced } })
    assert.equal(ic.sends(), 0)
    assert.deepEqual(unhandled, [], 'unhandled rejections')
    assert.ok(world.logs.slice(before).some((l) => l.text.includes(event.eventId)), 'the failing fallback write was not logged')
  })
  row('RFIX-F14-DT-01', 'rule 3 (control)', 'the move to committing succeeds → send is called once, commit resolves; Fishball gets no turn', async (t) => {
    const world = await worldFor(t)
    const ic = await interceptAndCommit(world)
    const event = nextEvent()
    world.link.publish(event)
    await ic.settled
    await world.settle()
    assert.equal(ic.sends(), 1)
    assert.ok('resolved' in ic.outcome.commit, 'commit rejected: ' + JSON.stringify(ic.outcome.commit))
    assert.equal((await world.admissions(event.marker)).length, 0)
    assert.ok(world.link.calls.some((c) => c.name === TOOL.inboxAck))
  })
}
