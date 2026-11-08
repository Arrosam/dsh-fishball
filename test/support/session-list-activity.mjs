import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import vm from 'node:vm'
import { LIST_ACTIVITY as C } from './session-list-activity-data.mjs'
import { ASK_TOOL, PRESET, RELAY, RELAY_REDIRECT, RUNTIME } from './constants.mjs'
import { callScript, settledIdle } from './expect.mjs'
import { bootStub, handOver, managedSession, OPERATION, stopStub, userSession } from './instance-stub.mjs'
import { sleep, until } from './util.mjs'
export { LIST_ACTIVITY } from './session-list-activity-data.mjs'

const fixture = Object.freeze({ name: C.fixture.name, dir: path.join(import.meta.dirname, 'fixtures', C.fixture.name), enabled: true })

export async function activityHost() {
  const w = await bootStub(C.fixture.name, { link: [fixture], env: { FBTEST_APPROVER_AFTER: '1' } })
  let nextId = C.counts.none
  w.probe = (op, args = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { w.host.child.off('message', listener); reject(new Error('activity probe timeout: ' + op)) }, C.ms.ipc)
    const listener = message => {
      if (message?.type !== C.fixture.response || message.id !== id) return
      clearTimeout(timer)
      w.host.child.off('message', listener)
      if (message.ok) resolve(message.value)
      else reject(new Error(message.error))
    }
    w.host.child.on('message', listener)
    w.host.child.send({ type: C.fixture.request, id, op, args })
  })
  w.stop = () => stopStub(w)
  w.fb = (await w.host.state()).sessionId
  w.target = label => managedSession(w.host, label)
  w.user = label => userSession(w.host, label)
  w.list = async () => (await w.probe('list')).items
  w.row = async sessionId => (await w.list()).find(row => row.sessionId === sessionId)
  w.events = () => w.probe('events')
  w.eventsSince = async (offset, sessionId) => (await w.events()).slice(offset).filter(event => event.sessionId === sessionId)
  w.wait = async sessionId => assert.ok(await settledIdle(w.host, sessionId), 'target becomes idle')
  w.mark = async sessionId => {
    if (sessionId && await w.host.call('agentStatus', { sessionId })) await w.wait(sessionId)
    const row = sessionId ? await w.row(sessionId) : null
    // Unambiguous success cases use a real clock safely beyond the observed row;
    // equal/backward connector clock policy is intentionally not chosen by this fixture.
    if (row) assert.ok(await until(() => Date.now() > row.updatedAt, C.ms.settle, C.ms.poll), 'delivery clock later than target cached updatedAt')
    return (await w.events()).length
  }
  w.scoped = (operation, sessionId, message = C.text.message) => w.stub.op(operation, { sessionId, message, attachments: [] }, sessionId)
  w.message = (sessionId, message) => w.scoped(OPERATION.sessionMessage, sessionId, message)
  w.redirect = (sessionId, message) => w.scoped(OPERATION.sessionRedirect, sessionId, message)
  w.start = async (message = C.text.message, folder) => {
    const ordinary = folder ? null : await w.host.call('ordinary', { folder: C.order.target })
    const cwd = folder ?? (await w.host.call('header', { sessionId: ordinary.sessionId })).cwd
    return w.stub.op(OPERATION.sessionStart, { folder: cwd, title: C.text.title, message, attachments: [] })
  }
  w.cold = async label => {
    const seed = await w.host.call('ordinary', { folder: label })
    const cwd = (await w.host.call('header', { sessionId: seed.sessionId })).cwd
    const sessionId = C.id.target + '-' + label
    await w.host.call('seedBlankSession', { sessionId, cwd, agentPreset: PRESET.bare })
    assert.equal((await handOver(w.host, sessionId)).status, 200)
    assert.equal(await w.host.call('agentStatus', { sessionId }), null)
    return sessionId
  }
  w.running = async sessionId => {
    await w.host.call('holdNext', { sessionId })
    await w.host.call('driveStart', { sessionId, text: C.text.busy })
    assert.ok(await until(() => w.host.call('isHeld', { sessionId }), C.ms.settle, C.ms.poll), 'precondition: target turn running')
  }
  w.relays = async (sessionId, text, operation = OPERATION.sessionMessage) => {
    assert.ok(await until(async () => ((await w.host.call('userMessages', { sessionId })) ?? []).some(message => message.text === text), C.ms.settle, C.ms.poll), 'message was delivered to target')
    await w.wait(sessionId)
    const messages = (await w.host.call('userMessages', { sessionId })).filter(message => message.text === text)
    assert.equal(messages.length, C.counts.one, 'one unchanged message')
    assert.deepEqual(messages[C.counts.none].source, { ...(operation === OPERATION.sessionRedirect ? RELAY_REDIRECT : RELAY), senderSessionId: w.fb }, 'source remains Fishball agent-message; never user')
    return messages
  }
  w.askOnDelivery = async (operation, sessionId, marker) => {
    await w.host.call('queueMarker', { marker, script: callScript(ASK_TOOL, { text: marker }) })
    const reply = operation === OPERATION.sessionStart ? await w.start(marker) : await w.scoped(operation, sessionId, marker)
    const sid = reply.payload?.sessionId ?? sessionId
    return { reply, sessionId: sid }
  }
  return w
}

export async function deliveredActivity(w, offset, sessionId) {
  // The event may be emitted after a successful flush but before the bridge reply.
  // Polling observes it only; never make a missing event pass by synthesizing one.
  await until(async () => (await w.eventsSince(offset, sessionId)).length > C.counts.none, C.ms.quiet, C.ms.poll)
  const events = await w.eventsSince(offset, sessionId)
  assert.ok(events.length > C.counts.none, 'successful delivery must emit api-session/activity for its target')
  for (const event of events) assert.ok(Number.isFinite(event.timestamp), 'finite numeric activity timestamp')
  return events
}

export async function noActivity(w, offset, sessionId) {
  await sleep(C.ms.quiet)
  assert.deepEqual((await w.events()).slice(offset), [], 'no activity event for an unsuccessful delivery or an unrelated target: ' + sessionId)
}

/**
 * Run the exact installed pure list reducer without its unavailable client-only
 * dependencies. A changed source shape fails closed; this is NOT a copied or
 * reimplemented rule, complete SessionManager, remote stream, or browser UI.
 */
function installedActivityReducer() {
  const source = fs.readFileSync(path.join(RUNTIME, C.reducer.file), 'utf8')
  const start = source.indexOf(C.reducer.declaration)
  assert.ok(start >= C.counts.none && source.indexOf(C.reducer.declaration, start + C.counts.one) < C.counts.none, 'one installed applyMutation declaration')
  const end = source.indexOf('\n}', start)
  assert.ok(end > start && end - start < C.reducer.maxSourceChars, 'bounded top-level pure reducer extraction; inspect DSH source shape if changed')
  const body = source.slice(start, end + '\n}'.length)
  assert.ok(body.includes("case 'activity':") && body.includes('mutation.updatedAt'), 'installed reducer includes activity branch')
  return vm.runInNewContext('(' + body + ')', Object.create(null), { timeout: C.reducer.timeoutMs })
}
const reduce = installedActivityReducer()

/** Automatic display order is an explicit test-owned UI model; reducer is real DSH. */
export class ActivityListContract {
  constructor(rows) { this.rows = structuredClone(rows) }
  receive({ sessionId, timestamp }) {
    this.rows = structuredClone(reduce(this.rows, { kind: C.reducer.kind, sessionId, updatedAt: timestamp }))
  }
  ids() { return [...this.rows].sort((left, right) => right.updatedAt - left.updatedAt).map(row => row.sessionId) }
  at(sessionId) { return this.rows.find(row => row.sessionId === sessionId)?.updatedAt }
}
