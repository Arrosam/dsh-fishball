/**
 * Group G of the H-STUB rewrite: session.start / session.message / session.redirect / session.stop
 * over the connector bridge (contract §4.1, §3.3, §7; slim-native-design §5.2), the titles and the
 * half-made session of DESIGN §5d, and a start with a model (DESIGN §5d "Model and effort",
 * docs/start-session-model-validation.md).
 *
 * The in-process Fishball and its start_session / message_session tools are gone (slim §12): the
 * stub instance now sends the contract requests itself. What a start leaves behind is observed on
 * the main side only: DSH's sessions, the worker's host probes (startProbe, failAttach, failCreate)
 * and the start-session-model fixture's own probe, `/api/fishball/state`, and the frames the stub
 * receives. Nothing here reads connector code.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before } from 'node:test'
import { ENVELOPE, ERROR, makeEnvelope } from 'fishball-connector/contract'
import { HOOK } from './expect.mjs'
import { RELAY } from './constants.mjs'
import { bootStub, managedSession, OPERATION, quietPushes, restartStub, STUB, stopStub } from './instance-stub.mjs'
import { START_MODEL } from './start-session-model-data.mjs'
import { until } from './util.mjs'

/** Group G vocabulary: reply fields, codes, fault switches and timings. */
export const G = Object.freeze({
  /** The response fields contract §4.1 names for session.start (any other key is not in the contract). */
  startKeys: Object.freeze(['sessionId', 'managed', 'titleError', 'workspaceError', 'watchId', 'watchError']),
  messageKeys: Object.freeze(['status', 'watchId', 'watchError']),
  /** A plain title DSH keeps as given (single line, short, no edge whitespace). */
  title: 'Fbtest started session',
  /** DESIGN §5d title outcomes and the half-made marker. */
  titleError: Object.freeze({ unavailable: 'title-unavailable', invalid: 'title-invalid', failed: 'title-failed' }),
  workspaceError: 'workspace-attach-failed',
  dshAttachCode: 'session/workspace-attach-failed',
  /** The by-field of a managed entry made by a start (state.managed[].by). */
  managedBy: 'start',
  /** Text of a watch notice push (kind watch) for a finished target. */
  watchFinished: 'a session you are watching finished',
  finishedReason: (reason) => 'reason: "' + reason + '"',
  /** DSH's turn-end reason of a cancelled turn (the Stop button's path, DESIGN §7a.12). */
  aborted: 'aborted',
  /** How long a case waits for a started session to settle into its first turn. */
  settleMs: 20000,
  /** Quiet period used to show that a refused request delivered nothing. */
  quietMs: 1500,
  /** Fault switches of the worker's startProbe (support/worker.mjs). */
  probe: Object.freeze({ renameInvalid: 'invalid', renameFail: 'fail', flushThrow: 'throw', flushFalse: 'false' }),
  /** A folder name that is neither a workspace id nor a path. */
  notAWorkspace: 'fbtest-no-such-workspace',
  /** A preset id no row provides (a stored session DSH cannot resume). */
  noSuchPreset: 'fbtest-no-such-preset',
  /** Connector limits that went with the in-process agent (conn-OQ-20). */
  removedCaps: Object.freeze(['messagesPerHour', 'sessionsPerHour', 'wakeupsPerHour']),
  /** The start-session-model fixture (linked into the stub host through bootStub's `link`). */
  modelFixture: Object.freeze({ name: START_MODEL.fixture.name, dir: path.resolve(import.meta.dirname, '..', 'fixtures', 'start-session-model') }),
  /** A bounded session.read and a one-shot session.watch (contract §4.1; the connector's default read limits). */
  read: Object.freeze({ maxMessages: 12, maxBytes: 12288 }),
  watchOnce: 'once',
})

export { ERROR, OPERATION }

let seq = 0
/** A fresh marker text for one case. */
export const tok = (label) => 'TOK' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 8)

/**
 * One H-STUB host for a describe (registers its own before/after hooks). `env` and `link` go to
 * bootStub. Returns a handle filled in by the before hook, with the start/message helpers below.
 */
export function useStubHost(label, { env = {}, link = [] } = {}) {
  const w = { host: null, home: null, stub: null }
  before(async () => { Object.assign(w, await bootStub(label, { env, link })) }, HOOK)
  // w, not the first boot's object: a restart (useModelHost) swaps in the new host on the same home.
  after(async () => { await stopStub(w.host ? w : null) }, HOOK)

  /** An existing folder under the home (created on demand). */
  w.folder = (name) => { const dir = path.join(w.home, 'work', name); fs.mkdirSync(dir, { recursive: true }); return dir }
  /** A path that must never be created (session.start never creates folders). */
  w.missing = () => path.join(w.home, 'work', 'never-created-g')
  w.sessionIds = async () => (await w.host.call('allSessions')).map((s) => s.id)
  w.state = () => w.host.state()

  /**
   * One instance request with the stub. A connector that closes the channel (a frame that failed
   * validation, contract §3.1) is re-attached at once so the next case starts on a ready channel;
   * the reply still reports what happened.
   */
  w.op = async (operation, payload, sessionId = null, extra = {}) => {
    const reply = await w.stub.op(operation, payload, sessionId, extra)
    if (reply.type === 'none') await reattach(w)
    return reply
  }

  /**
   * session.start with a valid payload by default (an existing folder, the plain title, a fresh
   * message, no attachments); `args` overrides keys, and a key given as undefined is left out.
   * With `probe`, the worker's startProbe records rename / steer / flush and can fail them.
   */
  w.start = async (args = {}, probe = null) => {
    const payload = Object.fromEntries(Object.entries({ folder: w.folder('default'), title: G.title, message: tok('start'), attachments: [], ...args }).filter(([, v]) => v !== undefined))
    if (probe) await w.host.call('startProbe', probe)
    try {
      const reply = await w.op(OPERATION.sessionStart, payload)
      const events = probe ? await w.host.call('probeEvents') : []
      return { ...reply, call: payload, events }
    } finally {
      if (probe) await w.host.call('stopProbe')
    }
  }
  /** A scoped request on one session (session.message / redirect / stop). */
  w.scoped = (operation, sessionId, payload = {}, extra = {}) => w.op(operation, { sessionId, ...payload }, sessionId, extra)
  w.message = (sessionId, message, more = {}, extra) => w.scoped(OPERATION.sessionMessage, sessionId, { message, attachments: [], ...more }, extra)
  w.redirect = (sessionId, message, extra) => w.scoped(OPERATION.sessionRedirect, sessionId, { message, attachments: [] }, extra)
  w.stop = (sessionId, more = {}, extra) => w.scoped(OPERATION.sessionStop, sessionId, more, extra)

  /** user/messages of a live session containing needle (null while not live). */
  w.received = async (sessionId, needle) => {
    const msgs = await w.host.call('userMessages', { sessionId })
    return msgs ? msgs.filter((m) => m.text.includes(needle)) : null
  }
  /** Wait until a session has a message containing needle; returns those messages. */
  w.waitReceived = async (sessionId, needle) => (await until(async () => { const m = await w.received(sessionId, needle); return m?.length ? m : false }, G.settleMs, STUB.pollMs)) || []
  w.titleOf = (sessionId) => w.host.call('sessionTitle', { sessionId })
  w.managedEntry = async (sessionId) => (await w.state()).managed.find((m) => m.sessionId === sessionId)
  /** A managed session (H-MANAGED) in its own folder. */
  w.managedSession = (folder) => managedSession(w.host, folder)
  return w
}

/** Attach again after the connector closed the channel (contract §1.3); the handshake must succeed. */
async function reattach(w) {
  const a = await w.stub.attach()
  if (!a.ok || a.handshake?.type !== ENVELOPE.type.response) throw new Error('re-attach failed: ' + JSON.stringify(a))
}

/** The reply is a response frame; returns its payload. */
export function responseOf(reply) {
  assert.equal(reply.type, ENVELOPE.type.response, 'expected a response, got ' + JSON.stringify(reply))
  return reply.payload
}

/** The reply is an error frame with one of the codes (contract §7: payload exactly {code}). */
export function assertError(reply, codes) {
  const want = [].concat(codes)
  assert.equal(reply.type, ENVELOPE.type.error, 'expected an error ' + want.join('|') + ', got ' + JSON.stringify(reply))
  assert.deepEqual(Object.keys(reply.payload), ['code'])
  assert.ok(want.includes(reply.payload.code), 'got ' + reply.payload.code + ', want ' + want.join('|'))
}

/** The response keys are only those contract §4.1 names. */
export function assertOnlyKeys(payload, keys) {
  for (const k of Object.keys(payload)) assert.ok(keys.includes(k), 'unexpected key ' + k + ' in ' + JSON.stringify(payload))
}

/**
 * A successful start: response {sessionId, managed:true, ...}, the session exists in DSH in the
 * folder, it is listed as managed (by start), and its first message arrived once as a relay with
 * the text unchanged. Returns the payload.
 */
export async function assertStarted(w, answer, { cwd = answer.call.folder } = {}) {
  const json = responseOf(answer)
  assertOnlyKeys(json, G.startKeys)
  assert.equal(typeof json.sessionId, 'string')
  assert.equal(json.managed, true)
  assert.ok((await w.sessionIds()).includes(json.sessionId), 'the session exists')
  const header = await w.host.call('header', { sessionId: json.sessionId })
  assert.equal(fs.realpathSync(header.cwd), fs.realpathSync(cwd), 'in the folder')
  assert.equal((await w.managedEntry(json.sessionId))?.by, G.managedBy, 'managed, by start')
  await assertRelayedOnce(w, json.sessionId, answer.call.message)
  return json
}

/** One relay message with exactly this text (DESIGN §5d: the relay source, not a user message). */
export async function assertRelayedOnce(w, sessionId, text) {
  const got = await until(async () => {
    const all = (await w.host.call('userMessages', { sessionId })) ?? []
    const mine = all.filter((m) => m.text === text && m.source?.kind === RELAY.kind)
    return mine.length ? mine : false
  }, G.settleMs, STUB.pollMs)
  assert.ok(got, 'the message reached ' + sessionId)
  assert.equal(got.length, 1, 'exactly one copy')
  // The relay names Fishball's session as the sender: the state's sessionId on the main side.
  assert.deepEqual(got[0].source, { ...RELAY, senderSessionId: (await w.state()).sessionId })
}

/** Wait until n watch notices name the watch, then a quiet period; returns them (no more arrive). */
export async function watchNoticesSettled(w, watchId, n) {
  await until(async () => (await watchNotices(w, watchId)).length >= n, G.settleMs, STUB.pollMs)
  await quietPushes(w.stub)
  return watchNotices(w, watchId)
}

/** A refused start leaves nothing: no new session, no folder created. */
export async function assertNothingStarted(w, sessionsBefore) {
  assert.deepEqual(await w.sessionIds(), sessionsBefore, 'no session created')
  assert.equal(fs.existsSync(w.missing()), false, 'the folder is never created')
}

/** Probe event helpers (see the worker's startProbe). */
export const eventsOf = (events, sessionId, type) => events.filter((e) => e.sessionId === sessionId && (!type || e.type === type))
export const orderOf = (events, sessionId) => eventsOf(events, sessionId).map((e) => e.type)
/** R3: renamed exactly once, before the first message is steered. */
export function assertRenamedBeforeSteer(events, sessionId) {
  const order = orderOf(events, sessionId)
  assert.equal(order.filter((t) => t === 'rename').length, 1, 'renamed once: ' + order)
  assert.ok(order.indexOf('rename') < order.indexOf('steer'), 'rename before the steer: ' + order)
}

/**
 * Send one raw request frame twice back to back with the same requestId, so the second arrives while
 * the first is still running. Returns the requestId and the replies seen for it after a quiet period.
 */
export async function sendTwice(w, operation, payload, sessionId = null) {
  const requestId = tok('dup')
  const frame = makeEnvelope(STUB.descriptor.id, sessionId, requestId, ENVELOPE.type.request, operation, payload)
  await w.stub.send(frame)
  await w.stub.send(frame)
  const repliesFor = async () => (await w.stub.received()).filter((f) => f.requestId === requestId)
  await until(async () => (await repliesFor()).length > 0, STUB.replyTimeoutMs, STUB.pollMs)
  await new Promise((resolve) => setTimeout(resolve, G.quietMs))
  return { requestId, replies: await repliesFor() }
}

/** Watch notices (inbox kind watch) that name a watch id. */
export const watchNotices = async (w, watchId) => (await w.stub.pushes()).map((f) => f.payload).filter((p) => p.kind === 'watch' && p.text.includes(watchId))
/** The instance's watches on one session (session.watches, contract §4.1). */
export const watchesOn = async (w, sessionId) => responseOf(await w.op(OPERATION.sessionWatches, {})).watches.filter((x) => x.sessionId === sessionId)

// ---- start with a model (the start-session-model fixture) ----

/**
 * A stub host with the start-session-model fixture linked (its adapter `start-selection-probe`, and
 * its probe on the `start-model-probe` IPC channel, driven the way support/start-session-model.mjs
 * drives it). `restart()` stops DSH and boots the same home again (a genuine cold resume).
 */
export function useModelHost(label) {
  const link = [{ ...G.modelFixture, enabled: true }]
  const w = useStubHost(label, { link })
  let ipcId = 0
  w.probe = (op, args = {}) => new Promise((resolve, reject) => {
    const id = ++ipcId
    const timer = setTimeout(() => { w.host.child.off('message', listener); reject(new Error('selection probe timed out: ' + op)) }, START_MODEL.fixture.timeoutMs)
    const listener = (message) => {
      if (message?.type !== START_MODEL.ipc.response || message.id !== id) return
      clearTimeout(timer)
      w.host.child.off('message', listener)
      if (message.ok) resolve(message.value)
      else reject(new Error(message.error))
    }
    w.host.child.on('message', listener)
    w.host.child.send({ type: START_MODEL.ipc.request, id, op, args })
  })
  w.arm = (options = {}) => w.probe('arm', options)
  w.disarm = () => w.probe('disarm')
  w.events = () => w.probe('read')
  /** The target's own conversation requests the fixture saw (no auxiliary calls). */
  w.requests = async (sessionId) => (await w.events()).filter((e) => e.type === 'request' && e.sessionId === sessionId && !e.purpose)
  /** The sessions the fixture saw DSH create while armed. */
  w.created = async () => (await w.events()).filter((e) => e.type === 'created').map((e) => e.sessionId)
  /** DSH's profile default model and the connector's settings, which a start must never change. */
  w.snapshots = async () => ({ defaults: await w.probe('defaults'), settings: (await w.host.call('settingsDescribe'))?.value })
  w.noMutation = async (before) => assert.deepEqual(await w.snapshots(), before, "a target selection must not change DSH's default model or the connector's settings")
  w.wait = (sessionId) => until(async () => (await w.host.call('agentStatus', { sessionId })) === 'idle' && (await w.requests(sessionId)).length > 0, G.settleMs, STUB.pollMs)
  w.restart = async () => {
    const next = await restartStub({ host: w.host, home: w.home }, { link })
    Object.assign(w, next)
  }
  return w
}

/** A start with a model armed in the fixture; the fixture is disarmed afterwards. */
export async function armedStart(w, args, arm = {}) {
  await w.arm(arm)
  try { return { ...(await w.start(args)), events: await w.events() } } finally { await w.disarm() }
}

/**
 * A successful start with a model: response, the first message delivered once, every request of
 * the target (first and later) on the chosen route and effort (null when the model has none), and
 * the selection appended before the first message was steered (DESIGN §5d "Before the first message").
 */
export async function assertModelStart(w, answer, { model, effort = null }) {
  const json = await assertStarted(w, answer)
  assert.ok(await w.wait(json.sessionId), 'the target reached its first request')
  const requests = await w.requests(json.sessionId)
  for (const r of requests) {
    assert.equal(r.provider, START_MODEL.provider)
    assert.equal(r.model, model)
    assert.equal(r.reasoningEffort, effort)
  }
  const events = await w.events()
  const selectAt = events.findIndex((e) => e.type === 'select' && e.sessionId === json.sessionId)
  const steerAt = events.findIndex((e) => e.type === 'steer' && e.sessionId === json.sessionId)
  assert.ok(selectAt >= 0 && selectAt < steerAt, 'the selection is appended before the first message')
  return json
}

/**
 * A start refused before anything was created (DESIGN §5d "Invalid choices fail before creation"):
 * an error frame whose code is a contract code (§7: the frame carries only {code}, so the old
 * availableModels / availableReasoningEfforts lists cannot travel), no session created, nothing
 * changed. `closes` marks a payload that breaks the frame rules (§3.1: the channel closes).
 */
export async function assertRefusedBeforeCreate(w, args, { arm = {}, closes = false } = {}) {
  const before = { sessions: await w.sessionIds(), state: await w.snapshots() }
  await w.arm(arm)
  let answer
  try { answer = await w.start({ notifyWhenFinished: true, ...args }) } finally { await w.disarm() }
  if (closes) assert.deepEqual([answer.type, answer.code], ['none', STUB.noReply.closed], 'the frame fails validation and the channel closes: ' + JSON.stringify(answer))
  else assertError(answer, Object.values(ERROR))
  await assertNothingStarted(w, before.sessions)
  await w.noMutation(before.state)
  return answer
}

/**
 * A start that DSH created but whose selection failed (DESIGN §5d: never run the wrong model):
 * refused with an error frame, and the created session got no first message, made no request
 * and has no watch. Returns the created session id (from the fixture: an error frame carries
 * only {code}, contract §7).
 */
export async function assertSelectionRefused(w, answer) {
  assertError(answer, Object.values(ERROR))
  const created = answer.events.filter((e) => e.type === 'created').map((e) => e.sessionId)
  assert.equal(created.length, 1, 'DSH created the target once')
  const [sessionId] = created
  assert.ok((await w.sessionIds()).includes(sessionId))
  assert.deepEqual((await w.received(sessionId, answer.call.message)) ?? [], [], 'no first message after a failed selection')
  assert.deepEqual(answer.events.filter((e) => e.type === 'request' && e.sessionId === sessionId), [], 'no model request')
  assert.deepEqual(await watchesOn(w, sessionId), [], 'no watch for a failed start')
  return sessionId
}
