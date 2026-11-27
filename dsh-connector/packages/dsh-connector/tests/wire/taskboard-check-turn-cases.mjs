/** Black-box assignment freshness checks through stock MCP and the real DSH connector bundle. */
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { DSH } from '../report/constants.mjs'
import { BUDGET, ENV, FIXTURE, K1, SURFACE } from 'dsh-connector-test-helpers/connector-world/constants'
import { quiet, toolDefinitions } from 'dsh-connector-test-helpers/connector-world/multi'
import { eventually, fresh, handOver, okCall, paired, read, refusedCall } from 'dsh-connector-test-helpers/connector-world/steps'
import { scenario } from 'dsh-connector-test-helpers/connector-world/world'

// The native journal and held-child activation were specified against this host.
const NATIVE_JOURNAL_SDK = '0.2.2-rc.3'
const CASE = 'CONN-CHECK-TURN'
const TIMEOUT = Object.freeze({ timeout: BUDGET.testMs })
const FIXED = Object.freeze({
  noHistory: Object.freeze({ maxMessages: 0, maxBytes: 0 }),
  wireVersion: 1,
  assignmentPurpose: 'work',
  attachmentRefs: Object.freeze([]),
  requiredProofKeys: Object.freeze(['assignmentId', 'turnSeq']),
})
const { EVENT_TYPE, READ_ROLE, TOOL, TURN_OUTCOME } = K1
const world = (sdk) => scenario(sdk, CASE.toLowerCase(), {
  env: { [ENV.extension]: path.join(import.meta.dirname, 'taskboard-check-turn-extension.mjs') },
})
const register = (sdk, part, title, body) => test(caseName(sdk, CASE, part, title), TIMEOUT, async (t) => {
  const w = await world(sdk)
  await body(w, await paired(t, w))
})

async function latestEnd(w, sessionId) {
  const events = await w.call('turnBoundaries', { sessionId })
  const end = events.at(-1)
  assert.equal(end?.type, DSH.sessionEvent.turnEnd, 'fixture needs a settled native turn')
  return end
}

async function pendingReports(client, sessionId, excludedEventIds) {
  const { events } = await okCall(client, TOOL.inboxPoll, {})
  return events.filter((event) => event.type === EVENT_TYPE.turnFinished && event.sourceSessionId === sessionId && !excludedEventIds.includes(event.eventId))
}

async function report(client, sessionId, excludedEventIds = []) {
  let entry
  assert.ok(await eventually(async () => {
    entry = (await pendingReports(client, sessionId, excludedEventIds)).at(0)
    return Boolean(entry)
  }), 'no turn-finished report for the native root')
  assert.equal(entry.payload.sessionId, sessionId)
  assert.equal(entry.payload.outcome, TURN_OUTCOME.completed)
  return entry
}

async function ordinaryRoot(w, client) {
  const folder = await w.call('folder', { name: fresh(FIXTURE.folder) })
  const { sessionId } = await okCall(client, TOOL.sessionStart, {
    folder, title: FIXTURE.title, message: FIXTURE.message, attachments: FIXED.attachmentRefs,
  })
  const entry = await report(client, sessionId)
  return { sessionId, entry, end: await latestEnd(w, sessionId) }
}

function finalOf({ payload }, end) {
  const final = payload.turnFinal
  assert.ok(final, 'missing journal turnFinal on a completed managed root')
  assert.deepEqual([final.version, final.turnId, final.sequence, final.reason], [FIXED.wireVersion, String(end.turn), end.seq, end.reason])
  assert.deepEqual(final.message, payload.finalMessage, 'ordinary assistant text must preserve the legacy report')
  return final
}

function proofOf(entry, end) {
  finalOf(entry, end)
  assert.equal(entry.payload.assignment?.purpose, FIXED.assignmentPurpose)
  const assignmentId = entry.payload.assignment?.id
  assert.equal(typeof assignmentId, 'string', 'ordinary MCP completion lacks assignment.id')
  assert.ok(assignmentId.length > 0)
  return { assignmentId, turnSeq: end.seq }
}

const checkArgs = (sessionId, checkTurn) => ({ sessionId, ...FIXED.noHistory, checkTurn })

async function check(client, sessionId, checkTurn, current) {
  assert.deepEqual(await okCall(client, TOOL.sessionRead, checkArgs(sessionId, checkTurn)), { ok: true, current })
}

const nextTurn = (client, sessionId) => okCall(client, TOOL.sessionMessage, {
  sessionId, message: FIXTURE.userText, attachments: FIXED.attachmentRefs,
})

async function reassign(w, sessionId, principalKey, withoutConsent = async () => {}) {
  assert.deepEqual((await w.service(SURFACE.service.handover, 'takeBack', sessionId)).value, { ok: true })
  await withoutConsent()
  await handOver(w, sessionId, principalKey)
}

export function registerTaskboardCheckTurnCases(sdk) {
  if (sdk !== NATIVE_JOURNAL_SDK) return
  const row = (...args) => register(sdk, ...args)

  row('discover', 'tools/list advertises optional checkTurn with both proof keys required', async (_w, { client }) => {
    const schema = (await toolDefinitions(client)).find(({ name }) => name === TOOL.sessionRead)?.inputSchema
    const checkTurn = schema?.properties?.checkTurn
    assert.ok(checkTurn, 'session_read does not advertise checkTurn')
    assert.equal(schema.required?.includes('checkTurn') ?? false, false)
    assert.deepEqual([...(checkTurn.required ?? [])].sort(), FIXED.requiredProofKeys)
    assert.equal(checkTurn.properties?.assignmentId?.type, 'string')
    assert.ok(['integer', 'number'].includes(checkTurn.properties?.turnSeq?.type))
  })

  row('settled and stale', 'returns only current for a settled turn; a newer open or completed turn makes old proof stale', async (w, { client }) => {
    const { sessionId, entry, end } = await ordinaryRoot(w, client)
    const before = await read(client, sessionId)
    const assistant = before.messages.findLast(({ role }) => role === READ_ROLE.assistant)
    assert.ok(assistant, 'legacy session_read has no assistant message')
    assert.equal(assistant.text, entry.payload.finalMessage.text)
    assert.notEqual(assistant.seq, end.seq)
    assert.equal(entry.payload.turnFinal?.messageSeq, assistant.seq)
    const proof = proofOf(entry, end)
    await check(client, sessionId, proof, true)
    await check(client, sessionId, { ...proof, turnSeq: assistant.seq }, false)
    assert.deepEqual(await read(client, sessionId), before, 'proof checks changed legacy session_read')

    await w.call('holdModel', { sessionId })
    try {
      await nextTurn(client, sessionId)
      assert.ok(await eventually(() => w.call('modelHeld', { sessionId })), 'the next native turn did not reach the model gate')
      const open = (await w.call('turnBoundaries', { sessionId })).at(-1)
      assert.equal(open?.type, DSH.sessionEvent.turnStart)
      assert.ok(open.seq > end.seq)
      await check(client, sessionId, proof, false)
    } finally {
      await w.call('releaseModel', { sessionId })
    }
    const next = await report(client, sessionId, [entry.eventId])
    await check(client, sessionId, proof, false)
    await check(client, sessionId, proofOf(next, await latestEnd(w, sessionId)), true)
  })

  row('reassign', 'take-back and same-principal handover retire the generation; an old sequence stays stale', async (w, { client, principalKey }) => {
    const { sessionId, entry, end } = await ordinaryRoot(w, client)
    const old = proofOf(entry, end)
    await reassign(w, sessionId, principalKey, () => refusedCall(client, TOOL.sessionRead, checkArgs(sessionId, old), K1.REFUSAL.forbidden))
    await check(client, sessionId, old, false)

    await nextTurn(client, sessionId)
    const next = await report(client, sessionId, [entry.eventId])
    const active = proofOf(next, await latestEnd(w, sessionId))
    assert.notEqual(active.assignmentId, old.assignmentId)
    await check(client, sessionId, { ...active, turnSeq: old.turnSeq }, false)
    await check(client, sessionId, { ...active, assignmentId: old.assignmentId }, false)
    await check(client, sessionId, active, true)
  })

  row('held reassignment', 'a root that ended before reassignment cannot gain proof when its child finally settles', async (w, { client, principalKey }) => {
    const { sessionId, entry, end } = await ordinaryRoot(w, client)
    const childId = await w.call('spawnHeldChild', { sessionId })
    const ignored = [entry.eventId]
    let heldEnd
    try {
      assert.ok(await eventually(() => w.call('modelHeld', { sessionId: childId })), 'native child did not reach the model gate')
      await nextTurn(client, sessionId)
      assert.equal(await w.call('waitIdle', { sessionId }), DSH.status.idle)
      heldEnd = await latestEnd(w, sessionId)
      assert.ok(heldEnd.seq > end.seq)
      await quiet()
      assert.deepEqual(await pendingReports(client, sessionId, ignored), [], 'root reported before its child settled')
      await reassign(w, sessionId, principalKey)
    } finally {
      await w.call('finishHeldChild', { sessionId: childId })
    }
    const held = await report(client, sessionId, ignored)
    finalOf(held, heldEnd)
    assert.equal(Object.hasOwn(held.payload, 'assignment'), false)
  })

  row('owner handover', 'an arbitrary owner-created session has journal facts but no certified assignment', async (w, { client, principalKey }) => {
    const { sessionId } = await w.call('createSession', { name: fresh(FIXTURE.folder) })
    await handOver(w, sessionId, principalKey)
    await nextTurn(client, sessionId)
    const entry = await report(client, sessionId)
    finalOf(entry, await latestEnd(w, sessionId))
    assert.equal(Object.hasOwn(entry.payload, 'assignment'), false)
  })
}
