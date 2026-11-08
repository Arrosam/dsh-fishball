/**
 * Group E (managed sessions, limits-live) on the H-STUB harness: the vocabulary and the helpers the six
 * files share (each file's retired cases are listed in its own header). Everything goes through public surfaces only: the
 * contract frames the stub receives and sends, the managed session's own model requests and tool
 * results, the connector's /api/fishball routes and feed, DSH's settings service and the worker's
 * stock-prompt stand-in (FBTEST_APPROVER_AFTER=1: the scripted answerer sits after the connector's
 * broker, and the asking tool fbtest_ask asks DSH for approval in its body).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { API, APPROVER_AFTER_ENV, ASK_REASON, ASK_TOOL, ELLIPSIS, MANAGED_API, MANAGED_ENTRY_KEYS, MANAGED_IDENTITY, OUTCOME } from './constants.mjs'
import { askSettled, callScript, settledIdle, startAsk, stockSeen, toolNames, turn, untrustedBlock } from './expect.mjs'
import { CARD_CLOSED, DECISION, EVENT, QUESTION_ANSWER, RECORD_ITEM, RISK } from 'fishball-connector/contract'
import { OPERATION, STUB, bootStub, restartStub } from './instance-stub.mjs'
import { sleep, until } from './util.mjs'

export const MANAGED_STUB = Object.freeze({
  env: APPROVER_AFTER_ENV,
  /** A pass-through reaches the stock prompt at once; a request routed to the instance would wait for it first. */
  atOnceMs: 1000,
  /** How long "nothing more happens" is watched for. */
  quietMs: 1500,
  /** How long a change may take to reach the snapshot or the events feed (it is pushed, not polled). */
  publishMs: 8000,
  /** A `since` must lie within this of the moment of the change (clock and write skew). */
  sinceSlackMs: 2000,
  /** One long case (a restart, a bundle switch). */
  long: Object.freeze({ timeout: 180000 }),
  /** The instance's reject reason that frees a session waiting on an offered request. */
  rejectReason: 'fbtest: stop waiting',
  /** The reason a session.release carries when the case is not about the reason. */
  releaseReason: 'fbtest: the work is done',
  /** Contract §8 reasonChars: the release reason's upper bound. */
  reasonChars: 500,
  /** The asking session's turn text, so a request carries a known latest user message. */
  askTurn: 'fbtest ask turn',
  /** The client-side words that the requirement is about (DESIGN §10e, slim §8.3). */
  labels: Object.freeze({
    handOver: 'Hand over to Fishball', takeBack: 'Take back from Fishball', banner: 'Managed by Fishball',
    /** slim §8.3: the two header buttons Hand over replaced. */
    gone: Object.freeze(['Send to Fishball', 'Tell Fishball when finished']),
  }),
  /** A session id DSH never made. */
  unknownSession: 'session-fbtest-no-such-session',
  /** Who changed management, as the note says it (DESIGN §5e item 5): the user's clicks, or the instance's own release. */
  byUser: /\buser\b/i,
  byInstance: /release/i,
})

// ---- hosts ----

/**
 * An H-STUB host for this group: the stock-prompt stand-in sits after the connector's broker and
 * rejects, so a request that reaches it settles at once with a known outcome. Returns bootStub's
 * {host, home, stub} plus the id the connector reports for the instance's own session.
 */
export async function bootManaged(label, opts = {}) {
  return prepared(await bootStub(label, { env: MANAGED_STUB.env, ...opts }))
}
/** Stop DSH and boot the same home again (attached), prepared as bootManaged's host. */
export async function restartManaged(booted) {
  return prepared(await restartStub(booted, { env: MANAGED_STUB.env }))
}
async function prepared(booted) {
  await booted.host.call('setApprover', { outcome: OUTCOME.reject })
  booted.fb = (await booted.host.state()).sessionId
  return booted
}

/** Detach the newest attachment and wait until the connector reports no instance. */
export async function detachStub(booted) {
  await booted.stub.detach()
  assert.ok(await until(async () => (await booted.host.state())?.instance?.attached === false, STUB.waitMs, STUB.pollMs), 'the connector reports no instance')
}
/** Attach the stub again with the default descriptor and handshake (after a detach or a closed channel). */
export async function reattach(booted) {
  const a = await booted.stub.attach()
  assert.ok(a.ok, 'attach: ' + JSON.stringify(a))
  assert.equal(a.handshake?.type, 'response', 'handshake: ' + JSON.stringify(a.handshake))
  return a
}

// ---- sessions, tools, requests ----

/** The tools of a session's next model request (one plain turn). */
export const nextRequest = async (host, sid) => (await turn(host, sid, [[{ text: 'next' }]])).requests.at(-1)
export const hasTool = (req, name) => toolNames(req).includes(name)

/** The snapshot's managed entries (what the client reads), and one of them. */
export const managedNow = async (host) => (await host.state())?.managed ?? []
export const entryOf = async (host, sid) => (await managedNow(host)).find((e) => e.sessionId === sid)
const sinceMs = (since) => (typeof since === 'number' ? since : Date.parse(since))

/** The entry is exactly {sessionId, title, since, by}, with by and a since taken at the change (§10e "Snapshot"). */
export async function expectEntry(host, sid, by, t0) {
  const e = await entryOf(host, sid)
  assert.ok(e, sid + ' listed in managed: ' + JSON.stringify(await managedNow(host)))
  assert.deepEqual(Object.keys(e).sort(), MANAGED_ENTRY_KEYS)
  assert.equal(e.by, by)
  const since = sinceMs(e.since)
  assert.ok(Number.isFinite(since), 'since is a time: ' + e.since)
  assert.ok(since >= t0 - MANAGED_STUB.sinceSlackMs && since <= Date.now() + MANAGED_STUB.sinceSlackMs, 'since at the change: ' + e.since)
  return e
}

/** Hand over with a note: the forward route the client's one Hand over button posts (slim §8.3, T14). */
export const handOverWithNote = (host, sessionId, note = '') => host.post(API.send, { sessionId, note })
/** POST the managed route with any body (raw: a string body as is). */
export const postManaged = (host, body, opts) => host.post(MANAGED_API, body, opts)

/** Apply one settings patch to the connector row through DSH's settings service; it must be accepted. */
export async function setLimit(host, patch) {
  const r = await host.call('settingsUpdate', { patch })
  assert.equal(r.ok, true, 'update refused: ' + JSON.stringify(r.error))
}

// ---- contract operations ----

/** A scoped operation on one session (envelope sessionId equal to the payload's, contract §4). */
export const scoped = (stub, operation, payload) => stub.op(operation, payload, payload.sessionId)
export const release = (stub, sessionId, reason = MANAGED_STUB.releaseReason) => scoped(stub, OPERATION.sessionRelease, { sessionId, reason })
export const messageSession = (stub, sessionId, message) => scoped(stub, OPERATION.sessionMessage, { sessionId, message, attachments: [] })

/** An existing folder under the home (session.start never creates one). */
export function folderIn(home, name) {
  const dir = path.join(home, 'work', name)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * session.start from the stub. `probe` arms the worker's start probe (rename / steer / flush stamps,
 * and the failures it can inject); `store` makes writes to the connector's managed table fail
 * ('reject': nothing stored; 'after': stored, then the call rejects). Returns the reply, the probe's
 * events and the managed-table writes tried while armed.
 */
export async function startSession(booted, { folder = folderIn(booted.home, 'started'), title, message, extra = {}, probe = null, store = null } = {}) {
  const { host, stub } = booted
  const writes = (await host.call('storeWriteCalls')).length
  if (probe) await host.call('startProbe', probe)
  if (store) await host.call('failStoreTable', { table: 'managed', mode: store })
  let reply
  let events = []
  try {
    reply = await stub.op(OPERATION.sessionStart, { folder, title, message, attachments: [], ...extra })
    if (probe) events = await host.call('probeEvents')
  } finally {
    if (store) await host.call('failStoreTable', { mode: null })
    if (probe) await host.call('stopProbe')
  }
  return { reply, events, writes: (await host.call('storeWriteCalls')).slice(writes), call: { folder, title, message } }
}

/** A start whose first message makes the new session call the asking tool at once (a fresh marker per start). */
export async function startAsking(booted, marker, opts = {}) {
  await booted.host.call('queueMarker', { marker, except: null, script: callScript(ASK_TOOL, { text: marker }) })
  return startSession(booted, { message: marker, ...opts })
}

// ---- inbox ----

/** The inbox items about one session (sourceSessionId), optionally of one kind, oldest first. */
export async function itemsAbout(stub, sid, kind) {
  return (await stub.pushes()).map((f) => f.payload).filter((p) => p.sourceSessionId === sid && (!kind || p.kind === kind))
}
/**
 * The management notes about one session: its items without the contract's marker items (contract §4.5: a card
 * closed or recorded, a question answer), which a request that was waiting for the instance leaves behind.
 */
const MARKERS = [CARD_CLOSED, RECORD_ITEM, QUESTION_ANSWER].map((m) => m.pattern)
export async function notesAbout(stub, sid) {
  return (await itemsAbout(stub, sid)).filter((p) => !MARKERS.some((re) => re.test(p.text)))
}
/** The intake rows of the connector's management notes about one session (source fishball/managed/<id>, §5e item 5). */
export const noteRows = async (host, sid) => ((await host.state())?.intake?.items ?? []).filter((i) => i.sourceIdentity === MANAGED_IDENTITY(sid))

/**
 * Exactly one new management note about sid (beyond `before` notes), of the kind that says who did it
 * (user: your click; system: the instance's release, contract §4.5), naming the session and its folder
 * in the untrusted block, and nothing more within the quiet period.
 */
export async function expectOneNote(stub, sid, before, kind, who, cwd) {
  const got = await until(async () => (await notesAbout(stub, sid)).length > before, STUB.waitMs, STUB.pollMs)
  assert.ok(got, 'a note about ' + sid)
  await sleep(MANAGED_STUB.quietMs)
  const items = (await notesAbout(stub, sid)).slice(before)
  assert.equal(items.length, 1, 'exactly one note: ' + JSON.stringify(items.map((i) => i.text.slice(0, 120))))
  const note = items[0]
  assert.equal(note.kind, kind, 'the kind says who did it')
  // The first line says what changed and who did it; later lines are fixed framing that also names the user.
  assert.match(note.text.split('\n')[0], who, 'the note says who did it: ' + note.text.slice(0, 300))
  const fields = untrustedBlock(note.text)?.fields ?? {}
  assert.equal(fields.session_id, sid)
  if (cwd) assert.equal(fields.session_folder, cwd, 'the note names the folder')
  return note
}

/** No note about sid beyond `before` within the quiet period. */
export async function expectNoNote(stub, sid, before) {
  await sleep(MANAGED_STUB.quietMs)
  assert.deepEqual((await notesAbout(stub, sid)).slice(before).map((i) => i.kind + ': ' + i.text.slice(0, 120)), [], 'no further item about the session')
}

// ---- where a permission request goes ----

let askSeq = 0
const askToken = (label) => 'E' + label + 'x' + (++askSeq) + Math.random().toString(36).slice(2, 7)
/**
 * The offer of the asking tool's call with this text: the descriptor's reason is the call's reason, or a cut prefix of it
 * (a limit may shorten it), and an offer is taken by one call only, so two texts with the same cut prefix never share one.
 */
const taken = new Set()
const bareText = (s) => (s.endsWith(ELLIPSIS) ? s.slice(0, -ELLIPSIS.length) : s)
const requestFor = (text) => (payload) => !taken.has(payload.approvalId) && payload.reason.length > 0 && ASK_REASON(text).startsWith(bareText(payload.reason))

/** The ids of the intake rows now, so a case can tell which rows a step added. */
export const intakeIds = async (host) => new Set(((await host.state()).intake?.items ?? []).map((i) => i.intakeId))

/**
 * Start a permission request from sid (the asking tool with a fresh text), unless `asked` names the text of one the
 * session already made (a started session's first turn); returns the text and the intake rows before it.
 * expectStock's `allowKinds` names intake kinds the case itself expects meanwhile (a watch notice it asked for).
 */
async function ask(host, sid, { asked, intakeBefore } = {}) {
  if (asked) return { text: asked, ids: intakeBefore ?? new Set() }
  const ids = await intakeIds(host)
  return { text: await askFrom(host, sid), ids }
}

/**
 * A permission request from sid reaches its own stock prompt at once: the stock prompt's answer is the call's outcome,
 * no approval.request is offered to the instance and nothing new enters the intake (contract §9, DESIGN §5e item 3).
 */
export async function expectStock(booted, sid, opts = {}) {
  const { host, stub } = booted
  const { text, ids } = await ask(host, sid, opts)
  const done = await askSettled(host, text)
  assert.equal(done?.outcome, OUTCOME.reject, "the stock prompt's answer is the call's outcome")
  const seen = await stockSeen(host, text)
  assert.equal(seen.length, 1, 'the stock prompt was asked once')
  assert.equal(seen[0].sessionId, sid)
  assert.ok(seen[0].at - done.askedAt < MANAGED_STUB.atOnceMs, 'at once: ' + (seen[0].at - done.askedAt) + ' ms')
  await sleep(MANAGED_STUB.quietMs)
  assert.deepEqual((await stub.events(EVENT.approvalRequest)).filter((f) => requestFor(text)(f.payload)), [], 'not offered to the instance')
  assert.deepEqual(((await host.state()).intake?.items ?? []).filter((i) => !ids.has(i.intakeId) && !(opts.allowKinds ?? []).includes(i.kind)), [], 'nothing new in the intake')
  await settledIdle(host, sid)
}

/**
 * A permission request from sid is offered to the instance (approval.request) and not to the stock prompt while it
 * waits; the stub then rejects it so the session is free again.
 */
export async function expectToInstance(booted, sid, opts) {
  const { host } = booted
  const { text } = await ask(host, sid, opts)
  const offer = await offerOf(booted, text)
  assert.deepEqual(await stockSeen(host, text), [], 'not at the stock prompt while the instance decides')
  await answerOffer(booted, sid, offer, { decision: DECISION.reject, risk: RISK.high, reason: MANAGED_STUB.rejectReason })
  await askSettled(host, text)
  await settledIdle(host, sid)
  return offer
}

/** The approval.request offered for the asking tool's call with this text (its payload); it must arrive. */
export async function offerOf(booted, text) {
  const frame = await booted.stub.waitEvent(EVENT.approvalRequest, requestFor(text))
  assert.ok(frame, 'an approval.request reached the instance')
  taken.add(frame.payload.approvalId)
  return frame.payload
}
/** approval.answer for one offer; it must be accepted unless `expectCode` names the refusal. Returns the reply. */
export async function answerOffer(booted, sid, offer, answer, expectCode) {
  const r = await scoped(booted.stub, OPERATION.approvalAnswer, { sessionId: sid, approvalId: offer.approvalId, offerId: offer.offerId, answer })
  if (expectCode) assert.equal(r.payload?.code, expectCode, JSON.stringify(r))
  else assert.equal(r.type, 'response', JSON.stringify(r))
  return r
}
/** Start a permission request from sid with a fresh text and the given turn text; returns the text (does not wait). */
export async function askFrom(host, sid, turnText = MANAGED_STUB.askTurn) {
  await settledIdle(host, sid)
  const text = askToken('ask')
  await startAsk(host, sid, ASK_TOOL, { text }, turnText)
  return text
}

// ---- the events feed ----

/** Runs change() with an events stream open; returns the first later frame that matches pick (or undefined). */
export async function frameAfter(host, change, pick) {
  const stream = await host.sse()
  try {
    assert.ok(await until(() => stream.frames.length > 0, MANAGED_STUB.publishMs, STUB.pollMs), 'first frame')
    const count = stream.frames.length
    await change()
    return (await until(() => stream.frames.slice(count).find(pick), MANAGED_STUB.publishMs, STUB.pollMs)) || undefined
  } finally { stream.close() }
}
export const frameEntry = (frame, sid) => (frame?.managed ?? []).find((e) => e.sessionId === sid)

