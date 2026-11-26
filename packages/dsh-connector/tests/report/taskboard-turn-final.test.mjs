/** Black-box turn-finished assertions at the manager's mailbox, using DSH's journal event shape. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { expectNone, expectOne, manage } from '../routing/cases.mjs'
import { EVENT_TYPE, FIXTURE as ROUTE } from '../routing/constants.mjs'
import { routeWorld } from '../routing/subject.mjs'
import { DSH, FIXTURE as F, TURN_OUTCOME, WAIT } from './constants.mjs'
import { FakeDsh, sourceModule } from './subject.mjs'

const SDK = '0.2.2-rc.3'
const CASE = 'CONN-TURN-FINAL'
const TIMEOUT = Object.freeze({ timeout: WAIT.testMs })
const TURN = Object.freeze({ version: 1, firstSeq: 20, firstStep: 1, timestamp: 1_800_000_000_000 })
const ROOT = F.root
const message = (text) => ({ text, truncated: false })

/** Reuse the DSH edges/agent states, but give each session a native, sequenced journal. */
class JournalDsh extends FakeDsh {
  add(id, header) {
    super.add(id, header)
    const { events } = this.sessionsById.get(id)
    let turn = 0
    events.push = (event) => {
      if (event.type === DSH.sessionEvent.turnStart) turn += 1
      event.seq = TURN.firstSeq + events.length
      event.time = TURN.timestamp + events.length
      event.data.turn = turn
      if (event.type === DSH.sessionEvent.assistant) {
        event.data.step = TURN.firstStep
        event.data.stream = []
      }
      return Array.prototype.push.call(events, event)
    }
    return id
  }

  journal(id) { return this.sessionsById.get(id).snapshotEvents() }
}

function row(part, title, body, Dsh = JournalDsh) {
  test(caseName(SDK, CASE, part, title), TIMEOUT, async (t) => {
    const dsh = new Dsh()
    const { createSessionSource } = await sourceModule(SDK)
    const w = await routeWorld(t, SDK, { sessions: createSessionSource(dsh.ctx) })
    const manager = w.principal(ROUTE.ids.p)
    w.principal(ROUTE.ids.q)
    dsh.add(ROOT)
    await manage(w, ROOT, manager)
    await body(w, dsh, manager)
  })
}

async function completed(w, manager, act, legacyText) {
  const { event } = await expectOne(w, act, manager, EVENT_TYPE.turnFinished)
  assert.equal(event.sourceSessionId, ROOT)
  const { turnFinal, ...legacy } = event.payload
  assert.deepEqual(legacy, {
    sessionId: ROOT, outcome: TURN_OUTCOME.completed,
    ...(legacyText === undefined ? {} : { finalMessage: message(legacyText) }),
  })
  return turnFinal
}

function assertTurnFinal(final, journal, text) {
  const end = journal.at(-1)
  const assistant = journal.findLast(({ type }) => type === DSH.sessionEvent.assistant)
  assert.ok(final, 'manager mailbox omitted turnFinal for a completed journaled root turn')
  assert.deepEqual(final, {
    version: TURN.version, turnId: String(end.data.turn), sequence: end.seq, reason: end.data.reason.kind,
    ...(text === undefined ? {} : { messageSeq: assistant.seq, message: message(text) }),
  })
}

row('completed', 'root turn identity uses the end sequence, not its start or assistant message', async (w, dsh, manager) => {
  const earlier = F.text(1)
  const text = F.text(2)
  const final = await completed(w, manager, () => {
    dsh.start(ROOT)
    dsh.say(ROOT, earlier)
    dsh.say(ROOT, text)
    dsh.end(ROOT)
  }, text)
  assertTurnFinal(final, dsh.journal(ROOT), text)
})

row('queued → empty', 'waits for standstill; empty current turn cannot inherit text, while legacy finalMessage stays unchanged', async (w, dsh, manager) => {
  const previous = F.text(3)
  const queued = { role: 'user', content: [] }
  await expectNone(w, () => {
    dsh.queue(ROOT, { nextTurn: [queued] })
    dsh.turn(ROOT, previous)
  })
  const final = await completed(w, manager, () => {
    dsh.queue(ROOT)
    dsh.start(ROOT)
    dsh.userSays(ROOT, F.text(4))
    dsh.end(ROOT)
  }, previous)
  assertTurnFinal(final, dsh.journal(ROOT))
})

row('max-tokens', 'max-tokens still reports completed but preserves its actual journal reason', async (w, dsh, manager) => {
  const text = F.text(5)
  const final = await completed(w, manager, () => dsh.turn(ROOT, text, DSH.reason.maxTokens()), text)
  assertTurnFinal(final, dsh.journal(ROOT), text)
})

row('unsequenced', 'legacy completion with no journal sequence does not mint turnFinal', async (w, dsh, manager) => {
  const text = F.text(6)
  const final = await completed(w, manager, () => dsh.turn(ROOT, text), text)
  assert.equal(final, undefined)
}, FakeDsh)

row('stopped', 'a journaled provider error keeps the legacy stop report and has no turnFinal', async (w, dsh, manager) => {
  const { event } = await expectOne(w, () => {
    dsh.turn(ROOT, F.text(7), DSH.reason.error(F.errorCode, F.errorMessage))
  }, manager, EVENT_TYPE.turnFinished)
  assert.deepEqual(Object.keys(event.payload).sort(), ['outcome', 'sessionId', 'stop'])
  assert.equal(event.payload.sessionId, ROOT)
  assert.equal(event.payload.outcome, TURN_OUTCOME.stopped)
  assert.equal(event.payload.stop.kind, DSH.kinds.error)
  assert.ok(event.payload.stop.message.includes(F.errorMessage))
})
