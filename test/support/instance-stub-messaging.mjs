/**
 * Group F of the H-STUB rewrite (messaging): message_fishball inbound, Hand over with a note
 * (POST /api/fishball/send), intake durability, session.read roles and bounds, and the persona rule.
 * Helpers on top of support/instance-stub.mjs; every expectation comes from the docs the test files
 * name (contract, test design, DESIGN.md, slim design), never from the connector's code.
 */
import assert from 'node:assert/strict'
import { INBOX_KIND, OPERATION, ROLE } from 'fishball-connector/contract'
import { API, PRESET, READ_MAX } from './constants.mjs'
import { jsonOf, turn, untrustedBlock } from './expect.mjs'
import { handOver, managedSession, quietPushes } from './instance-stub.mjs'
import { until } from './util.mjs'

export const MSGF = Object.freeze({
  /** Skip reasons of what no stub can show. */
  skip: Object.freeze({
    readSettingsCap: 'open question (parent to decide): DESIGN §16 says readSessionMessages/readSessionBytes bound what read_session returns and conn-OQ-20 keeps them as connector settings, but contract §4.1 lets the instance name maxMessages/maxBytes per request; observed, the connector ignores both settings (0.2.2-rc.1). Un-skip once the docs say whether the settings cap a session.read',
    personaPrompt: "the persona is the instance's own system prompt (packages/instance, slim §0.5, §12): no model request of Fishball's session exists on the main side, and the built-in instance does not boot under H-STUB, so no black-box path reaches it",
  }),
  /** Calls per scripted model response when a case needs many message_fishball calls (kept below DSH's step limits). */
  batch: 50,
  /** Waits: an intake change, a watch notice after a turn end, and the long budget of restart and 200-item cases. */
  waitMs: 10000,
  watchWaitMs: 15000,
  long: Object.freeze({ timeout: 180000 }),
  /** Poll step of the group's waits. */
  pollMs: 100,
  /** A whole-number bound far above anything a case writes, for reads that must not be cut by the request. */
  wide: Object.freeze({ maxMessages: 100, maxBytes: 1 << 20 }),
  /** DESIGN §5c: the user source kinds (DSH's web prompt records kind 'user' with an rpc id; 'user-rpc' is named too). */
  userKinds: Object.freeze(['user', 'user-rpc']),
  relayKind: 'agent-message',
  relayForm: 'relay',
  /** A sender id that is not Fishball's (ROL rows). */
  otherSession: 'session-fbtest-another-agent',
})

let seq = 0
/** A unique ASCII token a case can find again in a push or a log. */
export const tok = (label) => 'TOK' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 8)
export const bytes = (s) => Buffer.byteLength(s)
export const textBytes = (messages) => messages.reduce((n, m) => n + bytes(m.text), 0)
/** A text of exactly n UTF-8 bytes that starts with the token, padded with ASCII. */
export const padded = (token, n) => token + 'a'.repeat(n - bytes(token))

// ---- limits (DSH's settings service is what the Plugins form saves through, contract §0) ----

export async function setLimit(host, patch) {
  const r = await host.call('settingsUpdate', { patch })
  assert.equal(r.ok, true, JSON.stringify(r.error))
}

// ---- intake (GET /api/fishball/state's intake) ----

export const intakeNow = async (host) => (await host.state()).intake
export const queuedNow = async (host) => (await intakeNow(host)).queued
/** Wait until the intake has exactly n open items; returns whether it did. */
export const untilQueued = async (host, n, timeoutMs = MSGF.waitMs) => Boolean(await until(async () => (await queuedNow(host)) === n, timeoutMs, MSGF.pollMs))

// ---- message_fishball from a managed session ----

/** One model response with several message_fishball calls ({args, id}), then a closing answer. */
export const manyCalls = (calls) => [calls.map((c) => ({ tool: 'message_fishball', args: c.args, ...(c.id ? { id: c.id } : {}) })), [{ text: 'done' }]]
/** Several message_fishball calls in one turn; returns their parsed answers in call order. */
export async function sendCalls(host, sessionId, calls) {
  const r = await turn(host, sessionId, manyCalls(calls))
  assert.equal(r.results.length, calls.length, 'one result per call: ' + JSON.stringify(r.results))
  return r.results.map(jsonOf)
}
/** Messages with these texts, MSGF.batch calls per turn; returns every answer in order. */
export async function sendTexts(host, sessionId, texts) {
  const answers = []
  for (let i = 0; i < texts.length; i += MSGF.batch) answers.push(...await sendCalls(host, sessionId, texts.slice(i, i + MSGF.batch).map((message) => ({ args: { message } }))))
  return answers
}

// ---- inbox pushes ----

/** The inbox items of one attachment (default: the newest), oldest first. */
export const pushedItems = async (stub, index) => (await stub.pushes(index)).map((f) => f.payload)
/** Items whose text contains needle, of one kind when given. */
export const pushedWith = async (stub, needle, { kind, index } = {}) => (await pushedItems(stub, index)).filter((p) => p.text.includes(needle) && (!kind || p.kind === kind))
/** The message field of a session item's untrusted block. */
export const messageOf = (item) => untrustedBlock(item.text)?.fields.message
/** Session items from one sender, as their message texts, in push order. */
export const sessionMessages = async (stub, sessionId, index) => (await pushedItems(stub, index)).filter((p) => p.kind === INBOX_KIND.session && p.sourceSessionId === sessionId).map(messageOf)
/** Wait until the attachment has received at least n inbox items, then until it is quiet; returns the items. */
export async function pushesSettled(stub, n, index, timeoutMs = MSGF.waitMs) {
  await until(async () => (await stub.pushes(index)).length >= n, timeoutMs, MSGF.pollMs)
  await quietPushes(stub, index)
  return pushedItems(stub, index)
}

// ---- attach states (C1 "N" and "A") ----

/**
 * Back to no instance with an empty queue: detach the newest attachment (a no-op when it is gone),
 * attach once more with the default ack policy so every open item is delivered and acked, then detach.
 */
export async function drainedDetached(booted) {
  const { host, stub } = booted
  await stub.ackPolicy(null)
  await stub.detach()
  const a = await stub.attach()
  assert.equal(a.ok, true, 'precondition: attach to drain: ' + JSON.stringify(a))
  assert.ok(await untilQueued(host, 0), 'precondition: the queue drained: ' + JSON.stringify(await intakeNow(host)))
  await quietPushes(stub)
  await stub.detach()
}
/** A managed session whose hand-over note has been delivered and acked (stub attached). */
export async function managedDrained(booted, folder, preset = PRESET.bare) {
  const sid = await managedSession(booted.host, folder, preset)
  assert.ok(await booted.stub.waitPush(sid, { kind: INBOX_KIND.user }), 'precondition: the hand-over note reached the stub')
  assert.ok(await untilQueued(booted.host, 0), 'precondition: the hand-over note was acked')
  return sid
}

// ---- Hand over with a note ----

/** POST /api/fishball/send, the Hand over dialog's route (slim §8.3, T14). */
export const forward = (host, sessionId, note, opts) => host.post(API.send, { sessionId, note }, opts)

// ---- session.read (contract §4.1) ----

/** The request bounds of READ_MAX (12 messages, 12288 bytes), the default the settings carry too. */
export const READ_DEFAULT = Object.freeze({ maxMessages: READ_MAX.messages, maxBytes: READ_MAX.bytes })
/** One session.read through the stub; resolves the reply ({type, payload|code}). */
export const readSession = (stub, sessionId, bounds = READ_DEFAULT) => stub.op(OPERATION.sessionRead, { sessionId, ...bounds }, sessionId)
/** A session.read that must succeed; returns its payload. */
export async function readOk(stub, sessionId, bounds = READ_DEFAULT) {
  const r = await readSession(stub, sessionId, bounds)
  assert.equal(r.type, 'response', 'session.read answered ' + JSON.stringify(r))
  return r.payload
}
/** A blank live session (no turn), handed over so it is related; returns its id. */
export async function blankManaged(host, folder) {
  const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
  const r = await handOver(host, sid)
  assert.equal(r.status, 200, 'precondition: hand over ' + r.text)
  return sid
}
/** Append one user/message with a source straight into a live session's log (no turn). */
export const inject = (host, sessionId, text, source, omitSource = false) => host.call('injectUserMessage', { sessionId, text, source, omitSource })
export const relay = (senderSessionId) => ({ kind: MSGF.relayKind, form: MSGF.relayForm, senderSessionId })
export const notice = (kind) => ({ kind, form: 'notice', summary: 'fbtest ' + kind })
/** Fishball's session id as the connector names it (GET state sessionId; relays from the instance carry it). */
export const fishballId = async (host) => (await host.state()).sessionId

/**
 * DESIGN §5c "Who wrote each message": the role of one user/message from the source DSH recorded with
 * it. A kind that is not exactly 'user'/'user-rpc'/'agent-message' (or no kind) is context, never user.
 */
export function roleOf(source, fbId) {
  const kind = source?.kind
  if (MSGF.userKinds.includes(kind)) return ROLE.user
  if (kind === MSGF.relayKind) return source.senderSessionId === fbId ? ROLE.fishball : ROLE.agent
  return ROLE.context
}
/**
 * Reading (the old result's `from` and `source` keys, DESIGN §5c, folded into the contract's one
 * `author` field): an agent message's author is its sender's session id when that is a non-empty
 * string, and a context message's author is its DSH source kind when that is one. Other authors are
 * only required to be non-empty strings (contract §4.1 "author", validated as non-empty text).
 */
export function expectedAuthor(source, fbId) {
  const role = roleOf(source, fbId)
  const named = (v) => (typeof v === 'string' && v.length > 0 ? v : undefined)
  if (role === ROLE.agent) return named(source.senderSessionId)
  if (role === ROLE.context) return named(source?.kind)
  return undefined
}
/** The role/text pairs DESIGN §5c gives a session's log (worker event summaries), empty texts skipped. */
export function expectedFromLog(events, fbId) {
  return events.flatMap((e) => {
    if (e.type === 'assistant/message') return [{ role: ROLE.assistant, text: e.text }]
    if (e.type === 'user/message') return [{ role: roleOf(e.source, fbId), text: e.text }]
    return []
  }).filter((m) => m.text !== '')
}
/** A read's messages reduced to role and text. */
export const rolesAndTexts = (messages) => messages.map(({ role, text }) => ({ role, text }))
/** Every message has the contract's five keys, a known role, a non-empty author and no images; seq rises. */
export function assertMessageShape(messages) {
  let last = -1
  for (const m of messages) {
    assert.deepEqual(Object.keys(m).sort(), ['author', 'images', 'role', 'seq', 'text'])
    assert.ok(Object.values(ROLE).includes(m.role), m.role)
    assert.equal(typeof m.author, 'string')
    assert.ok(m.author.length > 0, 'author is non-empty')
    assert.ok(Number.isInteger(m.seq) && m.seq > last, 'seq rises: ' + m.seq)
    last = m.seq
    assert.deepEqual(m.images, [])
  }
}
/** The worker's event summaries of one session's log. */
export const eventsOf = async (host, sessionId) => (await host.call('inspect', { sessionId, events: true })).events
