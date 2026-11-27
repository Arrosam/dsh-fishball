import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createConsultant } from '../src/consultant.js'
import { createLedger } from '../src/ledger.js'

const OWNER = 'profile-owner'
const PLUGIN = 'fishball-consultant'
const RECEIPT = PLUGIN + '.receipt.v1'
const GUARANTEES = { authorizedBriefOnly: true, requestBoundReceipts: true, noExecution: true }
const PLACEMENT = { targetId: 'review-target', endpointEpoch: 'epoch-1', workspaceId: 'neutral-space' }
const MODEL = 'demo/review-v1'
const OTHER_MODEL = 'alternate/review-v1'
const EFFORT = 'medium'
const CATALOG = {
  complete: true,
  models: [MODEL, OTHER_MODEL].map((id) => ({ id, reasoningEfforts: [EFFORT] })),
}
const LIMITS = { subject: 3, day: 10 }
const CLOCK = { before: Date.parse('2026-11-28T23:59:59.999Z'), after: Date.parse('2026-11-29T00:00:00.000Z') }
const TEXT = {
  title: 'Local-only migration title',
  question: 'Which approach is easier to roll back?',
  evidence: 'Option A keeps the old schema for a week.\nOption B switches immediately.',
  followup: 'What should we verify before the switch?',
  advice: 'Verify rollback against a snapshot first.',
  close: 'No further review is needed.',
  foreign: 'This text belongs to another turn or owner.',
}
const CODE = {
  config: 'CONFIGURE_MODEL', unavailable: 'UNAVAILABLE', disabled: 'DISABLED',
  input: 'INVALID_INPUT', unknown: 'UNKNOWN_SUBJECT', busy: 'BUSY',
  budget: 'BUDGET_EXCEEDED', binding: 'BINDING_CHANGED', closed: 'CLOSED',
}

const identity = ({ ownerId, targetId, endpointEpoch, workspaceId }) => ({ ownerId, targetId, endpointEpoch, workspaceId })
const receipt = (ref, status, extra = {}) => ({ ...ref, event: RECEIPT, status, ...extra })
const withoutEvent = ({ event, ...reply }) => reply
const nonDelivery = (envelope, extra) => receipt({ ...identity(envelope.destination), requestId: envelope.requestId }, 'not-delivered', extra)
const completeAdvice = (text = TEXT.advice) => ({ text, truncated: false })
const clone = structuredClone

function world() {
  const calls = Object.fromEntries(['discover', 'capability', 'card', 'send', 'status', 'close', 'notify'].map((name) => [name, []]))
  const refs = new Map()
  const records = new Map()
  const accepted = (envelope) => {
    const bindingId = envelope.bindingId ?? 'binding-' + envelope.requestId
    const sessionId = envelope.sessionId ?? 'session-' + envelope.requestId
    const ref = { ...identity(envelope.destination), requestId: envelope.requestId, bindingId, sessionId, turnId: 'turn-' + envelope.requestId }
    refs.set(ref.requestId, ref)
    return { event: RECEIPT, status: 'accepted', ref: clone(ref) }
  }
  const state = {
    config: { ...PLACEMENT, model: MODEL, reasoningEffort: EFFORT },
    time: CLOCK.before,
    discover: () => clone(CATALOG),
    capability: (channel) => channel,
    send: accepted,
    status: (ref) => records.get(ref.requestId),
    close: (ref) => receipt(ref, 'archived'),
    notify: () => ({ status: 'queued' }),
  }
  const record = (name) => async (input) => {
    calls[name].push(clone(input))
    return state[name](input)
  }
  const channel = { version: 1, guarantees: { ...GUARANTEES }, send: record('send'), status: record('status'), close: record('close') }
  const create = async (file) => createConsultant({
    ledger: await createLedger(file === undefined ? {} : { file }),
    getConfig: () => state.config,
    now: () => state.time,
    discover: record('discover'),
    capability: async (destination) => {
      calls.capability.push(clone(destination))
      return state.capability(channel)
    },
    disclosure: {
      open: (payload, decide) => {
        const cardId = 'card-' + (calls.card.length + 1)
        calls.card.push({ payload: clone(payload), decide, cardId })
        return { cardId }
      },
    },
    notify: record('notify'),
  })
  return { calls, state, refs, records, create, accepted }
}

async function topic(api) {
  const result = await api.createTopic(TEXT.title)
  assert.equal(result.ok, true)
  assert.equal(result.subject.kind, 'topic')
  assert.ok(result.subject.id)
  return result.subject
}

const ask = (api, subject, extra = {}) => api.ask({ subject, question: TEXT.question, ...extra })
const decide = (card, overrides = {}) => card.decide({ cardId: card.cardId, decision: 'allow', ownerId: OWNER, ...overrides })

async function open(h, api, subject, extra) {
  const before = h.calls.send.length
  const result = await ask(api, subject, extra)
  assert.equal(result.ok, true)
  assert.equal(result.status, 'awaiting-consent')
  const card = h.calls.card.at(-1)
  assert.equal(card?.payload.requestId, result.requestId)
  assert.equal(h.calls.send.length, before, 'opening a disclosure card cannot send a brief')
  return card
}

async function send(h, api, subject, extra) {
  const card = await open(h, api, subject, extra)
  await decide(card)
  const ref = h.refs.get(card.payload.requestId)
  assert.ok(ref, 'approved request reached the protected channel with its original request ID')
  return ref
}

async function result(h, api, subject, ref, status = 'advice', extra = completeAdvice()) {
  h.records.set(ref.requestId, receipt(ref, status, extra))
  return api.reconcile(subject)
}

async function runAsk(h, api, subject) {
  const ref = await send(h, api, subject)
  await result(h, api, subject, ref)
  return ref
}

function counts(h, expected) {
  for (const [action, count] of Object.entries(expected)) assert.equal(h.calls[action].length, count, action)
}

async function refused(promise, code) {
  const response = await promise
  assert.equal(response?.code, code)
  return response
}

const MISSING_CAPABILITY = [
  ['no protected adapter', () => undefined],
  ['wrong protocol version', (c) => ({ ...c, version: 2 })],
  ...Object.keys(GUARANTEES).map((guarantee) => [guarantee, (c) => ({
    ...c, guarantees: Object.fromEntries(Object.entries(c.guarantees).filter(([key]) => key !== guarantee)),
  })]),
]

for (const [label, capability] of MISSING_CAPABILITY) {
  test('protected capability gate: ' + label, async () => {
    const h = world()
    h.state.capability = capability
    const api = await h.create()
    const response = await refused(ask(api, await topic(api)), CODE.unavailable)
    assert.equal(response.reason, 'missing-guarantee')
    counts(h, { capability: 1, card: 0, send: 0, status: 0, close: 0, notify: 0 })
  })
}

const MODEL_CASES = [
  ['blank model ignores a default', { model: '' }, { ...CATALOG, defaultModel: OTHER_MODEL }, CODE.config],
  ['explicit route removed from complete catalog', {}, { ...CATALOG, models: [CATALOG.models[1]] }, CODE.config],
  ['configured provider offline even with a same-name model', {}, { ...CATALOG, models: [CATALOG.models[1]], unavailableProviders: [{ id: 'demo' }] }, CODE.unavailable],
  ['incomplete catalog cannot prove route removal', {}, { complete: false, models: [] }, CODE.unavailable],
  ['explicitly unavailable route does not fall back', {}, { ...CATALOG, models: [{ ...CATALOG.models[0], available: false }, CATALOG.models[1]] }, CODE.unavailable],
  ['new asks are paused', { paused: true }, CATALOG, CODE.disabled],
]

for (const [label, config, catalog, code] of MODEL_CASES) {
  test('model preflight: ' + label, async () => {
    const h = world()
    Object.assign(h.state.config, config)
    h.state.discover = () => clone(catalog)
    const api = await h.create()
    await refused(ask(api, await topic(api)), code)
    counts(h, { card: 0, send: 0, status: 0, close: 0, notify: 0 })
    assert.equal(h.state.config.model, config.model ?? MODEL, 'preflight does not rewrite configuration')
  })
}

test('manager input cannot forge a card, choose routing, or consult a task', async () => {
  const h = world()
  const api = await h.create()
  const subject = await topic(api)
  assert.equal(typeof api.confirm, 'undefined')
  for (const extra of [
    { cardId: 'ordinary-ask-user-card' }, { model: OTHER_MODEL }, { sessionId: 'someone-elses-session' },
    { subject: { ...subject, targetId: PLACEMENT.targetId } }, { question: '' }, { evidence: 'é'.repeat(64 * 1024) },
  ]) await refused(ask(api, subject, extra), CODE.input)
  await refused(ask(api, { ...subject, id: 'not-registered' }), CODE.unknown)
  assert.equal((await ask(api, { kind: 'task', id: subject.id })).ok, false)
  counts(h, { card: 0, send: 0, notify: 0 })
})

test('only the matching owner and card can approve once, with the exact brief and history', async () => {
  const h = world()
  const api = await h.create()
  const subject = await topic(api)
  const another = await topic(api)
  assert.notEqual(another.id, subject.id, 'same title does not merge topics')
  const first = await open(h, api, subject, { evidence: TEXT.evidence })
  const otherCard = await open(h, api, another)
  assert.notEqual(first.payload.requestId, otherCard.payload.requestId)
  await decide(first, { ownerId: 'another-owner' })
  await decide(first, { cardId: otherCard.cardId })
  counts(h, { send: 0 })
  await Promise.all([decide(first), decide(first)])
  counts(h, { send: 1, notify: 0 })
  const ref = h.refs.get(first.payload.requestId)
  const expected = { question: TEXT.question, evidence: TEXT.evidence, history: [] }
  assert.deepEqual(first.payload.brief, expected)
  assert.deepEqual(identity(first.payload.destination), { ownerId: OWNER, ...PLACEMENT })
  assert.equal(first.payload.destination.model, MODEL)
  assert.equal(first.payload.destination.reasoningEffort, EFFORT)
  assert.ok(first.payload.digest)
  for (const key of ['requestId', 'destination', 'brief', 'digest']) assert.deepEqual(h.calls.send[0][key], first.payload[key], key)
  assert.ok(!JSON.stringify(h.calls.send[0]).includes(TEXT.title))
  await result(h, api, subject, ref)
  const second = await open(h, api, subject, { question: TEXT.followup })
  assert.deepEqual(second.payload.brief, {
    question: TEXT.followup,
    history: [{ question: TEXT.question, evidence: TEXT.evidence, result: { status: 'advice', text: TEXT.advice } }],
  })
  assert.deepEqual(otherCard.payload.brief.history, [])
  assert.notEqual(second.payload.digest, first.payload.digest)
  await decide(first)
  counts(h, { send: 1 })
  await decide(second)
  counts(h, { send: 2 })
  const outbound = h.calls.send[1]
  assert.deepEqual(outbound.brief, second.payload.brief)
  assert.equal(outbound.digest, second.payload.digest)
  assert.equal(outbound.requestId, second.payload.requestId)
  assert.equal(outbound.bindingId, ref.bindingId)
  assert.equal(outbound.sessionId, ref.sessionId)
})

for (const decision of ['decline', 'skip']) {
  test(decision + ' cannot be replayed as approval or consume an ask', async () => {
    const h = world()
    h.state.config.asksPerSubject = 1
    const api = await h.create()
    const subject = await topic(api)
    const card = await open(h, api, subject)
    await decide(card, { decision })
    await decide(card)
    counts(h, { send: 0, notify: 0 })
    assert.notEqual((await send(h, api, subject)).requestId, card.payload.requestId)
  })
}

for (const [label, mutate] of [
  ['new route', (h) => { h.state.config.model = OTHER_MODEL }],
  ['new endpoint', (h) => { h.state.config.endpointEpoch = 'epoch-2' }],
  ['lost guarantee', (h) => { h.state.capability = () => undefined }],
  ['catalog outage', (h) => { h.state.discover = () => ({ complete: false, models: [] }) }],
]) {
  test('an open card stops authorizing dispatch after ' + label, async () => {
    const h = world()
    const api = await h.create()
    const card = await open(h, api, await topic(api))
    mutate(h)
    await decide(card)
    counts(h, { card: 1, send: 0, notify: 0 })
  })
}

for (const [label, extra] of [
  ['truncated advice', { ...completeAdvice(), truncated: true }],
  ['advice with no truncation marker', { text: TEXT.advice }],
]) {
  test(label + ' cannot be represented as complete replay history', async () => {
    const h = world()
    const api = await h.create()
    const subject = await topic(api)
    await result(h, api, subject, await send(h, api, subject), 'advice', extra)
    const next = await ask(api, subject, { question: TEXT.followup })
    assert.equal(next.ok, false)
    counts(h, { card: 1, send: 1 })
  })
}

async function persistentFile(t) {
  const dir = await mkdtemp(join(tmpdir(), 'consultant-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return join(dir, 'ledger.json')
}

test('request-bound results survive restart; stale, foreign and duplicate receipts do not wake the manager', async (t) => {
  const file = await persistentFile(t)
  const h = world()
  let api = await h.create(file)
  const subject = await topic(api)
  const first = await runAsk(h, api, subject)
  const notification = h.calls.notify[0]
  assert.equal(notification.pluginId, PLUGIN)
  assert.equal(notification.wake, true)
  assert.ok(notification.dedupeKey.includes(first.requestId))
  assert.ok(notification.text.includes(TEXT.advice))
  await api.reconcile(subject)
  api = await h.create(file)
  await api.reconcile(subject)
  counts(h, { send: 1, notify: 1 })
  const second = await send(h, api, subject, { question: TEXT.followup })
  assert.notEqual(second.requestId, first.requestId)
  assert.equal(second.sessionId, first.sessionId)
  assert.notEqual(second.turnId, first.turnId)
  const malformed = [receipt(first, 'advice', completeAdvice()), ...Object.keys(second).map((field) =>
    receipt(second, 'advice', { ...completeAdvice(TEXT.foreign), [field]: 'mismatched-' + field })),
    receipt(second, 'advice', { ...completeAdvice(TEXT.foreign), event: 'turn-finished' }),
    withoutEvent(receipt(second, 'advice', completeAdvice(TEXT.foreign))),
  ]
  for (const response of malformed) {
    h.records.set(second.requestId, response)
    await api.reconcile(subject)
    counts(h, { send: 2, notify: 1 })
  }
  await result(h, api, subject, second, 'empty', {})
  await api.reconcile(subject)
  counts(h, { send: 2, notify: 2 })
  assert.notEqual(h.calls.notify[1].dedupeKey, notification.dedupeKey)
  assert.ok(!h.calls.notify[1].text.includes(TEXT.advice))
  assert.ok(!h.calls.notify[1].text.includes(TEXT.foreign))
  assert.equal(h.calls.status.at(-1).requestId, second.requestId)
})

test('acknowledgement loss holds the original request across restart; reconciliation never sends again', async (t) => {
  const file = await persistentFile(t)
  const h = world()
  h.state.config.asksPerSubject = 1
  h.state.send = (envelope) => {
    h.accepted(envelope)
    throw new Error('lost send acknowledgement')
  }
  let api = await h.create(file)
  const subject = await topic(api)
  const card = await open(h, api, subject)
  await decide(card)
  api = await h.create(file)
  const blocked = await ask(api, subject)
  assert.ok([CODE.busy, CODE.budget].includes(blocked.code), 'unconfirmed request still occupies the topic')
  const ref = h.refs.get(card.payload.requestId)
  await result(h, api, subject, ref)
  await api.reconcile(subject)
  await decide(card)
  counts(h, { card: 1, send: 1, notify: 1 })
  assert.equal(h.calls.status[0].requestId, ref.requestId)
  await refused(ask(api, subject), CODE.budget)
})

test('only authenticated matching non-delivery releases a reservation, without an automatic retry', async () => {
  const h = world()
  h.state.config.asksPerSubject = 1
  h.state.send = nonDelivery
  const api = await h.create()
  const subject = await topic(api)
  const card = await open(h, api, subject)
  await decide(card)
  await api.reconcile(subject)
  await decide(card)
  counts(h, { card: 1, send: 1, notify: 0 })
  h.state.send = h.accepted
  assert.notEqual((await send(h, api, subject)).requestId, card.payload.requestId)
  counts(h, { card: 2, send: 2 })
})

for (const [label, sendReply] of [
  ['a bare non-delivery', () => ({ status: 'not-delivered' })],
  ['a mismatched non-delivery', (envelope) => nonDelivery(envelope, { endpointEpoch: 'other-epoch' })],
  ['an acceptance with no protocol event', (envelope, h) => withoutEvent(h.accepted(envelope))],
]) {
  test(label + ' remains unconfirmed and preserves the daily reservation', async () => {
    const h = world()
    h.state.config.asksPerDay = 1
    h.state.send = (envelope) => sendReply(envelope, h)
    const api = await h.create()
    const subject = await topic(api)
    const decision = await decide(await open(h, api, subject))
    assert.equal(decision.status, 'unconfirmed')
    await api.reconcile(subject)
    await refused(ask(api, await topic(api)), CODE.budget)
    counts(h, { card: 1, send: 1, notify: 0 })
  })
}

for (const [label, invalid] of [
  ['missing', withoutEvent],
  ['wrong', (reply) => ({ ...reply, event: 'ordinary-worker-event' })],
]) {
  test('a ' + label + ' protocol event cannot prove remote archival', async () => {
    const h = world()
    const api = await h.create()
    const subject = await topic(api)
    await send(h, api, subject)
    h.state.close = (ref) => invalid(receipt(ref, 'archived'))
    assert.equal((await api.discard(subject)).status, 'cleanup-pending')
    assert.equal((await ask(api, subject)).ok, false)
    h.state.close = (ref) => receipt(ref, 'archived')
    await api.reconcile(subject)
    await refused(ask(api, subject), CODE.closed)
    counts(h, { send: 1, close: 2, notify: 0 })
  })
}

test('simultaneous first asks on one topic do not create competing disclosure cards', async () => {
  const h = world()
  const api = await h.create()
  const subject = await topic(api)
  const answers = await Promise.all([ask(api, subject), ask(api, subject)])
  assert.equal(answers.filter((answer) => answer.status === 'awaiting-consent').length, 1)
  assert.equal(answers.filter((answer) => answer.code === CODE.busy).length, 1)
  counts(h, { card: 1, send: 0 })
  await decide(h.calls.card[0])
  await refused(ask(api, subject), CODE.busy)
  counts(h, { card: 1, send: 1 })
})

test('default quotas allow the last ask, block the next, and reset only the profile count at UTC midnight', async () => {
  const h = world()
  const api = await h.create()
  const subject = await topic(api)
  for (let n = 0; n < LIMITS.subject; n++) await runAsk(h, api, subject)
  await refused(ask(api, subject), CODE.budget)
  for (let n = LIMITS.subject; n < LIMITS.day - 1; n++) await runAsk(h, api, await topic(api))
  const last = await topic(api)
  const inFlight = await send(h, api, last)
  const next = await topic(api)
  await refused(ask(api, next), CODE.budget)
  counts(h, { send: LIMITS.day })
  h.state.time = CLOCK.after
  await result(h, api, last, inFlight)
  await refused(ask(api, subject), CODE.budget)
  for (let n = 0; n < LIMITS.day; n++) await runAsk(h, api, n === 0 ? next : await topic(api))
  await refused(ask(api, await topic(api)), CODE.budget)
  counts(h, { send: LIMITS.day * 2 })
})

test('competing approvals cannot spend the same final profile slot', async () => {
  const h = world()
  h.state.config.asksPerDay = 1
  const api = await h.create()
  const first = await open(h, api, await topic(api))
  const second = await open(h, api, await topic(api))
  await Promise.all([decide(first), decide(second)])
  counts(h, { send: 1 })
  await refused(ask(api, await topic(api)), CODE.budget)
})

test('a bound topic never follows a changed endpoint or model into another conversation', async () => {
  const h = world()
  const api = await h.create()
  const subject = await topic(api)
  await runAsk(h, api, subject)
  for (const patch of [{ endpointEpoch: 'epoch-2' }, { model: OTHER_MODEL }]) {
    h.state.config = { ...PLACEMENT, model: MODEL, reasoningEffort: EFFORT, ...patch }
    await refused(ask(api, subject, { question: TEXT.followup }), CODE.binding)
    counts(h, { card: 1, send: 1, notify: 1 })
  }
})

test('discard seals the thread but cannot report archival while X10 handoff is unsettled', async () => {
  const h = world()
  const api = await h.create()
  const subject = await topic(api)
  const ref = await send(h, api, subject)
  const started = Promise.withResolvers()
  const settle = Promise.withResolvers()
  h.state.notify = () => { started.resolve(); return settle.promise }
  const receiving = result(h, api, subject, ref)
  await Promise.race([started.promise, receiving.then(() => assert.fail('receipt must attempt X10 handoff'))])
  let beforeSettle
  try {
    beforeSettle = await api.discard(subject)
    assert.equal(beforeSettle.status, 'cleanup-pending')
    assert.equal((await ask(api, subject)).ok, false, 'the topic is already sealed')
  } finally {
    settle.resolve({ status: 'queued' })
    await receiving
  }
  await api.reconcile(subject)
  await refused(ask(api, subject), CODE.closed)
  counts(h, { send: 1, notify: 1 })
})

test('manager close cannot archive; owner discard seals before cleanup, and archived topics cannot reopen', async (t) => {
  const h = world()
  const file = await persistentFile(t)
  let api = await h.create(file)
  const subject = await topic(api)
  const first = await runAsk(h, api, subject)
  await api.close({ subject, reason: TEXT.close })
  counts(h, { send: 1, close: 0 })
  const second = await send(h, api, subject, { question: TEXT.followup })
  h.state.config.model = ''
  h.state.close = () => { throw new Error('target offline') }
  await api.discard(subject)
  counts(h, { close: 1 })
  api = await h.create(file)
  h.state.config.model = MODEL
  assert.equal((await ask(api, subject)).ok, false, 'cleanup pending already seals the topic')
  h.records.set(second.requestId, receipt(second, 'advice', completeAdvice(TEXT.foreign)))
  h.state.close = (ref) => receipt(ref, 'archived')
  await api.reconcile(subject)
  assert.ok(h.calls.close.length >= 2, 'reconciliation retries disposal, not consultation')
  counts(h, { send: 2, notify: 1 })
  for (const ref of h.calls.close) {
    assert.deepEqual(identity(ref), identity(second))
    assert.equal(ref.bindingId, first.bindingId)
    assert.equal(ref.sessionId, first.sessionId)
  }
  api = await h.create(file)
  await refused(ask(api, subject), CODE.closed)
  assert.ok(JSON.stringify(await api.detail(subject)).includes(TEXT.advice), 'archive retains previous advice')
  const fresh = await open(h, api, await topic(api))
  assert.deepEqual(fresh.payload.brief.history, [])
})
