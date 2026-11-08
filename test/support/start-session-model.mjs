import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { bootLive, newHome } from './host.mjs'
import { RUNTIME, FAKE, FAKE_MODELS, RELAY } from './constants.mjs'
import { fishballCall, outboxNow, watchesOn, settledIdle } from './expect.mjs'
import { START_MODEL as C, route } from './start-session-model-data.mjs'
export { START_MODEL, route } from './start-session-model-data.mjs'

const fixture = path.resolve(import.meta.dirname, '../fixtures/start-session-model')
let sequence = 0

export async function selectionHost(label, { home = newHome(label), limits = { sessionsPerHour: 0 } } = {}) {
  const env = { FBTEST_DSH_RUNTIME: RUNTIME, FBTEST_LINK: JSON.stringify([{ name: C.fixture.name, dir: fixture, enabled: true }]),
    HOME: path.join(home, 'os-home'), DSH_AGENTS_HOME: path.join(home, 'agents-home') }
  fs.mkdirSync(env.HOME, { recursive: true })
  fs.mkdirSync(env.DSH_AGENTS_HOME, { recursive: true })
  const { host, state } = await bootLive(home, { env })
  assert.ok(state?.sessionId, host.output)
  assert.equal((await host.call('settingsUpdate', { patch: limits })).ok, true)
  await settledIdle(host, state.sessionId)
  let ipcId = 0
  const probe = (op, args = {}) => new Promise((resolve, reject) => {
    const id = ++ipcId
    const timer = setTimeout(() => { host.child.off('message', listener); reject(new Error('selection probe timed out: ' + op)) }, C.fixture.timeoutMs)
    const listener = message => {
      if (message?.type !== C.ipc.response || message.id !== id) return
      clearTimeout(timer); host.child.off('message', listener)
      if (message.ok) resolve(message.value); else reject(new Error(message.error))
    }
    host.child.on('message', listener)
    host.child.send({ type: C.ipc.request, id, op, args })
  })
  const w = { host, home, fb: state.sessionId, probe, defaults: () => probe('defaults'),
    folder(label = 'target') { const folder = path.join(home, 'work', label); fs.mkdirSync(folder, { recursive: true }); return folder },
    arm: options => probe('arm', options ?? {}),
    events: () => probe('read'),
    disarm: () => probe('disarm'),
    async stop() { await host.stop() },
    async snapshots() { return { defaults: await probe('defaults'), dedicated: (await host.state()).modelSelection, settings: (await host.call('settingsDescribe'))?.value } },
  }
  w.start = async (args = {}) => {
    const call = { folder: w.folder(), title: C.text.title, message: C.text.message + ' ' + ++sequence, ...args }
    return { ...await fishballCall(host, w.fb, 'start_session', call), call }
  }
  w.wait = sessionId => settledIdle(host, sessionId)
  w.requests = async sessionId => (await w.events()).filter(event => event.type === 'request' && event.sessionId === sessionId && !event.purpose)
  w.noMutation = async before => assert.deepEqual(await w.snapshots(), before, 'target selection must not mutate DSH defaults, dedicated Fishball selection, or Fishball settings')
  w.created = async () => (await host.call('allSessions')).map(item => item.id)
  w.failedBeforeCreate = async (args, expected, choiceKey, choices) => {
    const before = { sessions: await w.created(), outbox: await outboxNow(host), state: await w.snapshots() }
    const answer = await w.start({ notify_when_finished: true, ...args })
    assert.equal(answer.json?.ok, false, answer.result?.text)
    assert.equal(answer.json?.code, expected, answer.result?.text)
    if (choiceKey) {
      assert.ok(Array.isArray(answer.json[choiceKey]), 'error must include dynamic choices: ' + answer.result?.text)
      assert.deepEqual([...answer.json[choiceKey]].sort(), [...choices].sort(), 'choices belong to the current catalog and selected model')
    }
    assert.deepEqual(await w.created(), before.sessions, 'validation failure cannot create a target')
    assert.deepEqual(await outboxNow(host), before.outbox, 'validation failure cannot audit an uncreated target')
    await w.noMutation(before.state)
    return answer
  }
  w.assertSuccess = async (answer, { model, effort, selectedEffort = effort, selected = true } = {}) => {
    assert.equal(answer.json?.ok, true, answer.result?.text)
    const sid = answer.json.sessionId
    assert.equal(answer.json.folder, answer.call.folder)
    assert.equal(answer.json.title, answer.call.title)
    if (selected) assert.deepEqual(answer.json.selected, { provider: C.provider, model, ...(selectedEffort == null ? {} : { reasoningEffort: selectedEffort }) })
    else assert.equal('selected' in answer.json, false, 'legacy call keeps its exact response shape')
    await w.wait(sid)
    const requests = await w.requests(sid)
    assert.ok(requests.length, 'new target must reach a first request')
    for (const request of requests) {
      assert.equal(request.model, model, 'very first and every later request use chosen model')
      if (selected) { assert.equal(request.provider, C.provider); assert.equal(request.reasoningEffort, effort ?? null) }
    }
    const received = (await host.call('userMessages', { sessionId: sid })).filter(item => item.text === answer.call.message)
    assert.equal(received.length, 1)
    assert.deepEqual(received[0].source, { ...RELAY, senderSessionId: w.fb })
    const outbox = (await outboxNow(host)).find(item => item.targetSessionId === sid)
    assert.equal(outbox?.kind, 'start'); assert.equal(outbox?.status, 'delivered')
    if (selected) {
      const events = await w.events()
      const selectedAt = events.findIndex(event => event.type === 'select' && event.sessionId === sid)
      const steerAt = events.findIndex(event => event.type === 'steer' && event.sessionId === sid)
      assert.ok(selectedAt >= 0 && selectedAt < steerAt, 'official local selection precedes first message')
      assert.ok(events.slice(selectedAt + 1, steerAt).some(event => event.type === 'flushed' && event.sessionId === sid && event.result !== false), 'chosen selection is durable before first message')
    }
    return sid
  }
  w.assertFailedCreated = async answer => {
    assert.equal(answer.json?.ok, false, answer.result?.text)
    assert.equal(answer.json.code, C.error.selection, answer.result?.text)
    const sid = answer.json.sessionId
    assert.ok(sid, 'created target identity must be returned on selection/flush failure')
    assert.ok((await w.created()).includes(sid))
    assert.deepEqual(await host.call('userMessages', { sessionId: sid }), [], 'no first message after selection failure')
    assert.deepEqual(await w.requests(sid), [], 'no model request after selection failure')
    assert.deepEqual(await watchesOn(host, sid), [], 'no completion watch for failed starts')
    const audit = (await outboxNow(host)).find(item => item.targetSessionId === sid)
    assert.ok(audit, 'created but failed start remains audited'); assert.equal(audit.kind, 'start'); assert.equal(audit.status, 'failed')
    return sid
  }
  w.defaultModel = FAKE.model
  w.dedicatedModel = FAKE_MODELS.b
  w.selectedRoute = route(C.models.analysis)
  return w
}
