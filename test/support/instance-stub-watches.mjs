/**
 * Group H (watches) on the H-STUB harness: the watch vocabulary of the contract and DESIGN.md §5c,
 * and the helpers the three watches-*.test.mjs files share. Every value here comes from the docs
 * (contract §4.1, §4.5, §5, §6; DESIGN.md §5c, §10, §16), never from the connector's code.
 *
 * Observation points (all public): the stub's contract requests (`session.watch`, `session.watches`,
 * `session.unwatch`, `session.message`, `session.start`, `session.read`), the `inbox.push` items and
 * events it receives, the managed session's own `message_fishball` result, and the connector's
 * user routes under /api/fishball.
 */
import { ENVELOPE, WATCH_ERROR, WATCH_MODE, WATCH_STATE, WATCH_STATUS, makeEnvelope } from 'fishball-connector/contract'
import { API, CONNECTOR, LIMITS_R11, PRESET } from './constants.mjs'
import { turn, untrustedBlock } from './expect.mjs'
import { KIND, OPERATION, STUB, bootStub, managedSession, restartStub } from './instance-stub.mjs'
import { sleep, until } from './util.mjs'

export const WATCHES = Object.freeze({
  mode: WATCH_MODE,
  status: WATCH_STATUS,
  state: WATCH_STATE,
  error: WATCH_ERROR,
  /** contract §4.1: the four keys of one `session.watches` entry. */
  listKeys: Object.freeze(['mode', 'sessionId', 'status', 'watchId']),
  /** DESIGN §5c: the reasons a finished turn records; `interrupted` (a crash) never counts. */
  reason: Object.freeze({ completed: 'completed', error: 'error', aborted: 'aborted', blocked: 'blocked', maxTokens: 'max-tokens', interrupted: 'interrupted' }),
  /** DESIGN §5c "Notice": the first line says a watched session finished and names who set the watch up. */
  text: Object.freeze({ finished: 'a session you are watching finished' }),
  /** DESIGN §5c "Who can register one" / §9 `createdBy.kind`. */
  creator: Object.freeze({ user: 'user', assistant: 'assistant', agent: 'agent' }),
  /** DESIGN §10 "Host API" (P6) and the 409/400 codes of those routes (§5c, §10). */
  route: Object.freeze({ add: '/api/fishball/watches', remove: '/api/fishball/watches/remove' }),
  routeCode: Object.freeze({ badBody: 'bad-body', unavailable: 'unavailable', unknownSession: 'unknown-session', isFishball: 'is-fishball', archived: 'archived', limit: 'limit-reached', unknownWatch: 'unknown-watch' }),
  /** A session id DSH never made. */
  missingSession: 'session-fbtest-no-such-watch',
  /** DESIGN §16: watchesShown bounds the list `list_watches` (now `session.watches`) shows. */
  shown: LIMITS_R11.watchesShown.default,
  /** DESIGN §10 P5 forward route: Hand over with a note (slim §8.3). */
  sendRoute: API.send,
  /** How long a case waits for a notice that a catch-up or a re-scan must produce. */
  catchUpMs: 20000,
  /** A longer quiet period where a second notice could only come late (a busy stretch, a catch-up). */
  longQuietMs: 2500,
  /** A turn in a durable case may resume its session first. */
  longCase: Object.freeze({ timeout: 150000 }),
})

let tokenCounter = 0
/** A unique answer text, so a notice's last_answer names exactly one turn. */
export const tok = (label) => 'TOK' + label + 'x' + ++tokenCounter + Math.random().toString(36).slice(2, 8)

/** One connector setting, through DSH's settings service (the connector row is the only place limits live). */
export async function setLimit(host, patch) {
  const r = await host.call('settingsUpdate', { patch })
  if (!r.ok) throw new Error('settings update refused: ' + JSON.stringify(r.error))
}

/** session.watch (scoped: the envelope carries the target). */
export const watchOp = (stub, sessionId, mode = WATCH_MODE.once) => stub.op(OPERATION.sessionWatch, { sessionId, mode }, sessionId)
export const unwatchOp = (stub, watchId) => stub.op(OPERATION.sessionUnwatch, { watchId })

/**
 * The refusal code of a reply: a response's `watchError`, or an error frame's `code`. The contract
 * answers a refused watch `{watchError}` (§4.1); codes that are also frame codes (unknown-session,
 * is-fishball, §7) may come as an error frame, so both carriers are read. `archived` and
 * `not-related` are not frame codes, so they can only match as `watchError`.
 */
export function refusalOf(reply) {
  if (reply?.type === 'response') return reply.payload?.watchError
  if (reply?.type === 'error') return reply.payload?.code
  return reply?.code
}

/** session.watch that must succeed; returns the watch id. */
export async function watchOk(stub, sessionId, mode) {
  const r = await watchOp(stub, sessionId, mode)
  if (r.type !== 'response' || typeof r.payload?.watchId !== 'string') throw new Error('precondition: session.watch ' + sessionId + ' answered ' + JSON.stringify(r))
  return r.payload.watchId
}

/** session.watches; throws on anything but a response. */
export async function watchList(stub) {
  const r = await stub.op(OPERATION.sessionWatches, {})
  if (r.type !== 'response') throw new Error('session.watches answered ' + JSON.stringify(r))
  return r.payload.watches
}
export const watchEntry = async (stub, watchId) => (await watchList(stub)).find((w) => w.watchId === watchId)
export const watchesOn = async (stub, sessionId) => (await watchList(stub)).filter((w) => w.sessionId === sessionId)
export const activeCount = async (stub) => (await watchList(stub)).filter((w) => w.status === WATCH_STATUS.active).length

/** Close every active watch, so a limit case starts from 0 active. */
export async function closeAll(stub) {
  for (const w of await watchList(stub)) if (w.status === WATCH_STATUS.active) await unwatchOp(stub, w.watchId)
}

/** The inbox items of every attachment made in this host, oldest attachment first. */
export async function allPushes(stub) {
  const attachments = await stub.call('attachments')
  const out = []
  for (const a of attachments) out.push(...(await stub.pushes(a.index)).map((f) => f.payload))
  return out
}

const isNoticeOf = (watchId) => (p) => p.kind === KIND.watch && p.text.includes(watchId)

/**
 * Every `watch` inbox push that names the watch id, across every attachment of this host and the
 * pushes kept from earlier hosts of the same home (`history`, see restartKeeping), not deduplicated:
 * a case that must show an acked item is never pushed again counts these.
 */
export async function noticePushes(stub, watchId, history = []) {
  return [...history, ...(await allPushes(stub))].filter(isNoticeOf(watchId))
}

/**
 * The watch notices of one watch, one per dedupeKey (contract §4.5: a re-push after a reconnect
 * keeps its dedupeKey and is the same item; DESIGN §5c: one turn end has one dedupe key).
 */
export async function watchNotices(stub, watchId, history = []) {
  const seen = new Map()
  for (const p of await noticePushes(stub, watchId, history)) if (!seen.has(p.dedupeKey)) seen.set(p.dedupeKey, p)
  return [...seen.values()]
}

/** Wait until at least n notices of the watch exist (n may be 0), then for a quiet period; returns them. */
export async function noticesSettled(stub, watchId, n, { timeoutMs = STUB.waitMs, quietMs = STUB.quietMs, history = [] } = {}) {
  if (n > 0) await until(async () => (await watchNotices(stub, watchId, history)).length >= n, timeoutMs, STUB.pollMs)
  await sleep(quietMs)
  return watchNotices(stub, watchId, history)
}

/**
 * Restart DSH on the same home and keep what the old host's stub received in `history` (the new
 * worker starts with an empty stub journal). Returns the new booted object.
 */
export async function restartKeeping(booted, history, opts = {}) {
  history.push(...(await allPushes(booted.stub)))
  return restartStub(booted, opts)
}

/** The notice's untrusted block fields (session_id, session_title, session_folder, last_answer). */
export const noticeBlock = (notice) => untrustedBlock(notice?.text ?? '')

/** A managed session with one finished turn and a watch on it; returns {sid, watchId}. */
export async function watched(host, stub, folder, mode = WATCH_MODE.once) {
  const sid = await managedSession(host, folder)
  return { sid, watchId: await watchOk(stub, sid, mode) }
}

/** A plain answer turn of a session; returns the answer text. */
export async function answerTurn(host, sessionId, label) {
  const answer = tok(label)
  await turn(host, sessionId, [[{ text: answer }]])
  return answer
}

/** session.message with a marker the fake model answers in the target; resolves the reply. */
export async function messageWith(host, stub, sessionId, { label, script, notifyWhenFinished } = {}) {
  const marker = tok(label)
  await host.call('queueMarker', { marker, script })
  const payload = { sessionId, message: marker, attachments: [], ...(notifyWhenFinished === undefined ? {} : { notifyWhenFinished }) }
  return { marker, reply: await stub.op(OPERATION.sessionMessage, payload, sessionId) }
}

/** session.start in a fresh folder under the home, with a marker the new session's first turn answers. */
export async function startWith(host, stub, folderPath, { label, script, notifyWhenFinished, title = 'Fbtest watched start' } = {}) {
  const marker = tok(label)
  await host.call('queueMarker', { marker, script })
  const payload = { folder: folderPath, title, message: marker, attachments: [], ...(notifyWhenFinished === undefined ? {} : { notifyWhenFinished }) }
  return { marker, reply: await stub.op(OPERATION.sessionStart, payload) }
}

/** session.read (scoped). */
export const readOp = (stub, sessionId, maxMessages, maxBytes) => stub.op(OPERATION.sessionRead, { sessionId, maxMessages, maxBytes }, sessionId)

/**
 * Ack, late and by hand, the newest inbox.push whose text contains needle (one the stub held back
 * with ackPolicy(0)), without a reconnect: a plain `response` frame as the stub's own ack would be.
 * The frame host id is the descriptor id (see the fixture's header), as on every stub frame.
 */
export async function ackLate(stub, needle) {
  const frame = (await stub.pushes()).filter((f) => f.payload.text.includes(needle)).at(-1)
  if (!frame) throw new Error('precondition: no push containing ' + needle)
  await stub.send({ ...makeEnvelope(STUB.descriptor.id, null, frame.requestId, ENVELOPE.type.response, frame.operation, { acked: true }), version: ENVELOPE.version })
}

/** Attach the stub with the default descriptor and handshake; throws unless the handshake was answered. */
export async function attachReady(stub) {
  const a = await stub.attach()
  if (!a.ok || a.handshake?.type !== 'response') throw new Error('precondition: attach ' + JSON.stringify(a))
  return a
}

/** Kill DSH (a crash, no shutdown) and boot the same home again on H-STUB, keeping the old pushes in `history`. */
export async function crashKeeping(old, history, opts = {}) {
  history.push(...(await allPushes(old.stub)))
  await old.host.kill()
  return bootStub('crash', { ...opts, home: old.home })
}

/**
 * Notice checks shared by the cases that read one notice (DESIGN §5c "Notice"; contract §4.5):
 * kind `watch` from the target, the first line says a watched session finished, the JSON-quoted
 * reason, the watch id and who set it up, then one untrusted block with the four fields.
 */
export function assertNotice(assert, notice, { sid, watchId, reason, creator, folder, answer }) {
  assert.equal(notice.kind, KIND.watch)
  assert.equal(notice.sourceSessionId, sid)
  const block = noticeBlock(notice)
  assert.ok(block?.inner, 'an untrusted block: ' + notice.text.slice(0, 300))
  assert.equal(block.closes, 1, 'one closing tag')
  const header = block.header
  assert.ok(header.toLowerCase().includes(WATCHES.text.finished), header)
  if (reason) assert.ok(header.includes(JSON.stringify(reason)), 'the JSON-quoted reason: ' + header)
  assert.ok(header.includes(watchId), 'the watch id: ' + header)
  if (creator) assert.match(header, new RegExp('\\b' + creator + '\\b'), 'who set it up: ' + header)
  assert.equal(block.fields.session_id, sid)
  assert.equal(typeof block.fields.session_title, 'string')
  if (folder) assert.equal(block.fields.session_folder, folder)
  if (answer !== undefined) assert.equal(block.fields.last_answer, answer)
}

/** The stored cwd of a session (the notice's session_folder). */
export const folderOf = async (host, sessionId) => (await host.call('header', { sessionId })).cwd

export { CONNECTOR, PRESET }
