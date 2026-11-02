/**
 * Helpers shared by the start_session test files (messaging-start-title, messaging-start-halfmade): a booted host with
 * a `start` shortcut, and the assertions about what a start leaves behind (the first message, the outbox entry, the
 * title outcome, a failed delivery, a refusal). Moved out of messaging-start-title.test.mjs; assertDelivered gained an
 * optional `folder` argument (a start in a workspace names the workspace's path, not the argument).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before } from 'node:test'
import { OUTBOX_KEYS, OUTBOX_OPTIONAL, P5_CODE, RELAY, TITLE } from './constants.mjs'
import { HOOK, fishballCall, outboxNow, settledIdle } from './expect.mjs'
import { bootLive, newHome } from './host.mjs'

export const TOOL = 'start_session'
export const TOOL_ERROR = 'tool-error'

let seq = 0
export const tok = (label) => 'TOK' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 8)

/**
 * One booted host with the helpers every describe below uses. Registers its own before/after hooks, so call it
 * at the top of a describe. `limits` are settings applied once after the boot; `env` goes to the worker.
 */
export function useHost(label, { env, limits } = {}) {
  const w = { host: null, home: null, fb: null }
  before(async () => {
    w.home = newHome(label)
    const booted = await bootLive(w.home, { env })
    w.host = booted.host
    w.fb = booted.state?.sessionId
    if (limits) await w.setLimit(limits)
    await settledIdle(w.host, w.fb)
  }, HOOK)
  after(async () => { await w.host?.stop() }, HOOK)

  w.setLimit = async (patch) => {
    const r = await w.host.call('settingsUpdate', { patch })
    assert.equal(r.ok, true, JSON.stringify(r.error))
  }
  /** An existing folder under the host's home (created on demand). */
  w.folder = (name) => { const dir = path.join(w.home, 'work', name); fs.mkdirSync(dir, { recursive: true }); return dir }
  /** A path that is never created: the tool must not create folders. */
  w.missing = () => path.join(w.home, 'work', 'never-created-sst')
  /**
   * start_session as Fishball. Arguments default to a valid call (plain title, fresh message token); a key given as
   * undefined is left out. With `probe` the host's calls are recorded (and made to fail as asked): see startProbe.
   */
  w.start = async (args = {}, probe = null) => {
    const call = { folder: w.folder('default'), title: TITLE.plain, message: tok('sst'), ...args }
    if (probe) await w.host.call('startProbe', probe)
    try {
      const answer = await fishballCall(w.host, w.fb, TOOL, call)
      const events = probe ? await w.host.call('probeEvents') : []
      return { ...answer, call, events }
    } finally {
      if (probe) await w.host.call('stopProbe')
    }
  }
  /** Messages a session received that contain needle (null while the session is not live). */
  w.received = async (sessionId, needle) => {
    const msgs = await w.host.call('userMessages', { sessionId })
    return msgs ? msgs.filter((m) => m.text.includes(needle)) : null
  }
  w.titleOf = (sessionId) => w.host.call('sessionTitle', { sessionId })
  w.sessionCount = async () => (await w.host.call('allSessions')).length
  /** The outbox entry of one target session (the newest), or undefined. */
  w.outboxFor = async (sessionId) => (await outboxNow(w.host)).find((e) => e.targetSessionId === sessionId)
  return w
}

export const eventsOf = (events, sessionId, type) => events.filter((e) => e.sessionId === sessionId && (!type || e.type === type))
/** The probe's event types for one session, in the order they happened. */
export const orderOf = (events, sessionId) => eventsOf(events, sessionId).map((e) => e.type)
/** R3: the session is renamed exactly once, and before its first message is steered. */
export function assertRenamedBeforeSteer(events, sessionId) {
  const order = orderOf(events, sessionId)
  assert.equal(events.filter((e) => e.type === 'rename').length, 1, 'rename is called exactly once')
  assert.equal(order.filter((t) => t === 'rename').length, 1, 'on the new session')
  assert.ok(order.indexOf('rename') < order.indexOf('steer'), 'rename before the steer: ' + order)
}

/**
 * R4: the new session got the first message once, from Fishball as a relay, text unchanged, and the outbox records
 * the start with the documented keys only (the title is not stored there) and the wanted status. `folder` is what the
 * outbox entry must name (default: the folder the call passed).
 */
export async function assertDelivered(w, answer, status = 'delivered', folder = answer.call.folder) {
  const sessionId = answer.json.sessionId
  const got = await w.received(sessionId, answer.call.message)
  assert.equal(got.length, 1, 'exactly one copy of the first message')
  assert.deepEqual(got[0].source, { ...RELAY, senderSessionId: w.fb })
  assert.equal(got[0].text, answer.call.message, 'the text is unchanged')
  const entry = await w.outboxFor(sessionId)
  assert.ok(entry, 'the start is recorded')
  assert.equal(entry.kind, 'start')
  assert.equal(entry.folder, folder)
  assert.equal(entry.status, status)
  assert.equal(typeof entry.messageDigest, 'string')
  for (const k of Object.keys(entry)) assert.ok(OUTBOX_KEYS.includes(k) || OUTBOX_OPTIONAL.includes(k), 'unexpected outbox key ' + k)
}

/** R5: an ok answer that carries titleError instead of title, with the session created and in its folder. */
export function assertTitleError(answer, code) {
  const { json, call } = answer
  assert.equal(json?.ok, true, JSON.stringify(json))
  assert.equal(json.titleError, code)
  assert.equal('title' in json, false, 'no title key next to titleError')
  assert.equal(typeof json.sessionId, 'string')
  assert.equal(json.folder, call.folder)
}

/**
 * R6: a failed delivery is refused delivery-failed with the sessionId and the title outcome as on success (the title
 * DSH accepted, or titleError), without folder. The session exists and the outbox records the start as failed.
 */
export async function assertFailedDelivery(w, answer, titleError) {
  const { json, call } = answer
  assert.equal(json?.ok, false, JSON.stringify(json))
  assert.equal(json.code, P5_CODE.deliveryFailed)
  assert.equal(typeof json.sessionId, 'string')
  assert.equal('folder' in json, false, 'the refusal has no folder')
  if (titleError) {
    assert.equal(json.titleError, titleError)
    assert.equal('title' in json, false, 'no title key next to titleError')
  } else {
    assert.equal(json.title, call.title)
    assert.equal('titleError' in json, false)
  }
  assert.ok((await w.host.call('allSessions')).some((s) => s.id === json.sessionId), 'the session exists')
  const entry = await w.outboxFor(json.sessionId)
  assert.equal(entry?.kind, 'start')
  assert.equal(entry.status, 'failed')
  assert.equal(entry.errorCode, P5_CODE.deliveryFailed)
}

/** A refused start: its answer code (or TOOL_ERROR), with nothing created and nothing recorded. */
export async function refused(w, args) {
  const sessions = await w.sessionCount()
  const outbox = await outboxNow(w.host)
  const { json, result } = await w.start(args)
  assert.deepEqual(await outboxNow(w.host), outbox, 'not recorded')
  assert.equal(await w.sessionCount(), sessions, 'no session created')
  assert.equal(fs.existsSync(w.missing()), false, 'the folder is never created')
  return { code: result.isError ? TOOL_ERROR : json?.code, json, result }
}

/** The refusal must be one of `codes`; a TOOL_ERROR is accepted only when listed (DSH rejects bad arguments first, CASES.md A51). */
export async function assertRefused(w, args, codes, t) {
  const { code, json, result } = await refused(w, args)
  if (code === TOOL_ERROR) t?.diagnostic('answered with a tool error: ' + result.text.slice(0, 200))
  assert.ok(codes.includes(code), 'got ' + result.text.slice(0, 300))
  if (code !== TOOL_ERROR) assert.deepEqual(json, { ok: false, code })
}
