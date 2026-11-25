import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import * as K1 from '../../../test/fixtures/dsh-connector-contract/mcp-schema/index.js'
import { until } from '../../../test/support/util.mjs'
import { expectedCard } from '../../../test/v3/fishball-core/asks/world.mjs'
import { C, FAKE_DSH, MULTI } from '../../../test/v3/fishball-core/wire/constants.mjs'
import { multiWorld } from '../../../test/v3/fishball-core/wire/multi-world.mjs'
import { askHandle, askToolNameOf, connectorTools, toolNameOf } from '../../../test/v3/fishball-core/wire/targets-oracle.mjs'

const HANDOFF = Object.freeze({
  sdk: '0.2.2-rc.3', noticeCode: 'permission-escalated', notify: 'embed-ui.notify',
  noticeText: 'This permission needs your decision.', reason: 'Not needed for this task.',
  barrierCode: 'fbtest-replay-barrier',
  office: 'Office DSH', lab: 'Lab DSH', open: 'open', answered: 'answered',
  eventPrefix: 'fbtest-handoff-event-', approvalPrefix: 'fbtest-handoff-approval-',
  digestAlgorithm: 'sha256', digestEncoding: 'hex', settledMs: 8000,
  wake: Object.freeze({ window: ['wake', 'quietWindowSeconds'], deferredSeconds: 120, classes: ['wake', 'classes'], silent: 'silent' }),
})
const { EVENT_TYPE: EVENT, TOOL, APPROVAL_DECISION: DECISION, RISK } = K1
const testOptions = { timeout: C.budget.boot + C.budget.call }
const standalone = multiWorld(HANDOFF.sdk)
const notifyTool = {
  name: HANDOFF.notify, description: 'Show a notice to the user.',
  inputSchema: {
    type: 'object', required: ['message'], additionalProperties: false,
    properties: { message: { type: 'string' }, important: { type: 'boolean' } },
  },
}
const tools = [...connectorTools(K1.TOOLS), notifyTool]
const sourceOf = ({ targetId, endpointEpoch, serverName, name }) => ({ targetId, endpointEpoch, serverName, name })
const cards = (world) => world.h.call('askCards')
const calls = (target, name) => target.callsOf(name).map(({ args }) => args)
const handleOf = (source, event) => askHandle(source, event.payload.approvalId)

function mailbox() {
  let sequence = 0
  const event = (type, sourceSessionId, correlationId, payload) => ({
    type, sourceSessionId, correlationId, payload, at: Date.now(), sequence: ++sequence,
    eventId: HANDOFF.eventPrefix + sequence, mailboxGeneration: FAKE_DSH.generation,
    payloadDigest: createHash(HANDOFF.digestAlgorithm).update(JSON.stringify(payload)).digest(HANDOFF.digestEncoding),
  })
  return {
    offer(label, autoEscalatePermissions, type = EVENT.permission, revision = K1.OFFER_ID.firstRevision) {
      const approvalId = HANDOFF.approvalPrefix + label
      const offerId = K1.formatOfferId(approvalId, revision)
      const question = type !== EVENT.permission
      const payload = {
        approvalId, offerId, kind: question ? K1.APPROVAL_KIND.question : K1.APPROVAL_KIND.approval,
        title: MULTI.event.prompt, prompt: label, choices: [], toolName: MULTI.event.toolName,
        at: Date.now(), callId: null, reason: HANDOFF.reason, quotes: [],
        ...(autoEscalatePermissions === undefined ? {} : { autoEscalatePermissions }),
      }
      return {
        ...event(type, MULTI.event.session, offerId, payload),
        offer: { offerId, revision, decisionKind: K1.DECISION_KIND_OF[type] },
      }
    },
    notice({ sourceSessionId, correlationId }) {
      return event(EVENT.notice, sourceSessionId, correlationId, { code: HANDOFF.noticeCode, text: HANDOFF.noticeText })
    },
    barrier() {
      return event(EVENT.notice, null, null, { code: HANDOFF.barrierCode, text: HANDOFF.barrierCode })
    },
    retire(offer) {
      return event(EVENT.retirement, offer.sourceSessionId, offer.correlationId, {
        retiredEventId: offer.eventId, reason: K1.RETIREMENT_REASON.withdrawn,
      })
    },
  }
}

async function openTarget(world, name, box) {
  const live = new Map()
  const escalated = new Set()
  const remote = await world.fake({ name, tools, onTool(tool, args) {
    if (tool === TOOL.approvalsList) return { approvals: [...live.values()].filter((event) => event.sourceSessionId === args.sessionId).map((event) => event.payload) }
    if (tool === TOOL.approvalAnswer) {
      const offer = live.get(args.offerId)
      assert.equal(offer?.payload.approvalId, args.approvalId, 'answer did not name a live approval')
      assert.equal(offer.sourceSessionId, args.sessionId)
      if (args.answer.decision === DECISION.escalate) {
        // Escalation retains the live offer for the eventual card answer.
        if (!escalated.has(args.offerId) && offer.payload.autoEscalatePermissions === true) remote.enqueue(box.notice(offer))
        escalated.add(args.offerId)
      } else {
        live.delete(args.offerId)
      }
      return { accepted: true }
    }
  } })
  const { view } = await world.connect(remote)
  async function receive(events, receiptEvents = events) {
    const from = remote.acked.length
    remote.enqueue(...events)
    const ids = receiptEvents.map(({ eventId }) => eventId)
    const acked = await until(() => ids.every((id) => remote.acked.slice(from).some((r) => r.eventId === id)), HANDOFF.settledMs, C.budget.poll)
    assert.ok(acked, 'Fishball did not take mailbox page: ' + ids.join(', '))
  }
  return {
    remote, source: sourceOf(view),
    enqueueReplay: (previous, marker) => receive([previous, marker], [marker]),
    async enqueue(...events) {
      for (const event of events) {
        if (event.offer !== undefined) {
          for (const previous of live.values()) if (previous.payload.approvalId === event.payload.approvalId) live.delete(previous.offer.offerId)
          live.set(event.offer.offerId, event)
        }
        if (event.type === EVENT.retirement) live.delete(event.correlationId)
      }
      await receive(events)
    },
  }
}

async function runTool(world, tool, args) {
  const { offered, result } = await world.h.call('managerCall', { tool, args })
  assert.ok(offered.includes(tool), 'manager did not see ' + tool)
  assert.equal(result?.isError, false, JSON.stringify(result))
  return JSON.parse(result.text)
}

function answerArgs(offer) {
  return {
    sessionId: offer.sourceSessionId, approvalId: offer.payload.approvalId, offerId: offer.offer.offerId,
    answer: { decision: DECISION.reject, risk: RISK.high, reason: HANDOFF.reason },
  }
}

async function waitForCard(world, target, event, failure) {
  const handle = handleOf(target.source, event)
  const filed = await until(async () => (await cards(world)).find((card) => card.handle === handle), HANDOFF.settledMs, C.budget.poll)
  assert.ok(filed, failure)
  assert.deepEqual(filed, expectedCard(event, HANDOFF.open, target.source))
  return filed
}

function assertImportantNotice(target) {
  const sent = calls(target.remote, HANDOFF.notify)
  assert.equal(sent.length, 1, "expected exactly one notice on the card's target")
  assert.equal(sent[0].important, true)
  assert.ok(sent[0].message?.trim(), 'expected a user-facing message')
}

function endTurn(world) { return world.h.call('turn') }
const setWake = (world, path, value) => world.h.call('mutate', { path, value })

test('explicit escalation files only the correlated target offer, notifies once, and uses the existing card answer path', testOptions, async () => {
  const world = await standalone()
  await setWake(world, HANDOFF.wake.classes, { [EVENT.permission]: HANDOFF.wake.silent, [EVENT.notice]: HANDOFF.wake.silent })
  const box = mailbox()
  const office = await openTarget(world, HANDOFF.office, box)
  const lab = await openTarget(world, HANDOFF.lab, box)
  const offer = box.offer('explicit', true)
  // Match the offerId across targets so correlation alone cannot authorize routing.
  await Promise.all([office.enqueue(offer), lab.enqueue(box.offer('explicit', false))])
  assert.deepEqual(await cards(world), [], 'receipt of a permission is not explicit escalation')

  const committed = box.notice(offer)
  await office.enqueue(committed)
  const card = await waitForCard(world, office, offer, 'the correlated permission-escalated notice did not file a card')
  assert.ok(await until(() => calls(office.remote, HANDOFF.notify).length, HANDOFF.settledMs, C.budget.poll), 'the target received no notify call')

  // The first receipt was already accepted; the next event's receipt fences replay intake.
  await office.enqueueReplay(committed, box.barrier())
  const manual = await runTool(world, askToolNameOf(office.source, MULTI.ask), { [MULTI.askArg]: offer.offer.offerId })
  assert.equal(manual.ok, true)
  assert.deepEqual(manual.card, card, 'ask_user did not return the card already filed by escalation')
  assert.deepEqual(await cards(world), [card])
  assertImportantNotice(office)
  assert.deepEqual(calls(lab.remote, HANDOFF.notify), [], 'another target received the notice')

  const result = await world.route(MULTI.askAnswerRoute, { handle: card.handle, choice: DECISION.reject, text: HANDOFF.reason })
  assert.equal(result.json?.ok, true, result.text)
  assert.deepEqual(calls(office.remote, TOOL.approvalAnswer), [answerArgs(offer)])
  assert.deepEqual(calls(lab.remote, TOOL.approvalAnswer), [])
  assert.deepEqual(await cards(world), [{ ...card, state: HANDOFF.answered }])
})

test('manager turn end auto-files the still-live opted-in permission only', testOptions, async () => {
  const world = await standalone()
  // Defer the mailbox wake so the controlled user turn takes the queued offers into its model step.
  await setWake(world, HANDOFF.wake.window, HANDOFF.wake.deferredSeconds)
  await world.h.call('ensure')
  const box = mailbox()
  const target = await openTarget(world, HANDOFF.office, box)
  const decided = box.offer('decided', true)
  await target.enqueue(decided)
  const result = await runTool(world, toolNameOf(target.source, TOOL.approvalAnswer), answerArgs(decided))
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(calls(target.remote, TOOL.approvalAnswer), [answerArgs(decided)])
  assert.deepEqual(await cards(world), [], 'an accepted manager decision became a card')

  const eligible = box.offer('undecided', true)
  const optedOut = box.offer('opt-out', false)
  const omitted = box.offer('legacy-no-flag', undefined)
  const withdrawn = box.offer('withdrawn', true)
  const question = box.offer('question', true, EVENT.question)
  const plan = box.offer('plan-review', true, EVENT.planReview)
  await target.enqueue(eligible, optedOut, omitted, question, plan, withdrawn, box.retire(withdrawn))
  assert.deepEqual(await cards(world), [], 'received offers auto-filed before a manager turn ended')
  const requests = await endTurn(world)
  assert.ok(requests.some((request) => request.texts.includes(eligible.offer.offerId)), 'the opted-in offer did not reach the manager turn')
  const card = await waitForCard(world, target, eligible, 'manager turn end did not file the live opted-in request')
  assert.ok(await until(() => calls(target.remote, HANDOFF.notify).length, HANDOFF.settledMs, C.budget.poll), 'the auto-filed card did not notify its target')
  await endTurn(world)
  assert.deepEqual(await cards(world), [card], 'other offers auto-filed or the next turn duplicated the card')
  assertImportantNotice(target)
  const decisions = calls(target.remote, TOOL.approvalAnswer).map(({ offerId, answer }) => ({ offerId, decision: answer.decision }))
  assert.deepEqual(decisions, [
    { offerId: decided.offer.offerId, decision: DECISION.reject },
    { offerId: eligible.offer.offerId, decision: DECISION.escalate },
  ], 'only the still-live opted-in permission should be escalated, without a final decision')
})

test('a stale escalation correlation and question/plan offers leave the card list unchanged', testOptions, async () => {
  const world = await standalone()
  await setWake(world, HANDOFF.wake.window, HANDOFF.wake.deferredSeconds)
  const box = mailbox()
  const target = await openTarget(world, HANDOFF.office, box)
  const expired = box.offer('revised', true)
  const current = box.offer('revised', false, EVENT.permission, expired.offer.revision + 1)
  const question = box.offer('question', true, EVENT.question)
  const plan = box.offer('plan-review', true, EVENT.planReview)
  await target.enqueue(expired, current, question, plan, box.notice(expired))
  await world.h.call('ensure')
  await endTurn(world)
  // Give async delivery a bounded chance to produce an unexpected card or notification.
  await sleep(MULTI.budget.quietMs)
  assert.deepEqual(await cards(world), [])
  assert.deepEqual(calls(target.remote, HANDOFF.notify), [])
  assert.deepEqual(calls(target.remote, TOOL.approvalAnswer), [])
})
