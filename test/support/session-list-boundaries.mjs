import assert from 'node:assert/strict'
import path from 'node:path'
import { LIST_ACTIVITY } from './session-list-activity-data.mjs'
import { LIST_BOUNDARIES as C } from './session-list-boundaries-data.mjs'
import { settledIdle } from './expect.mjs'
import { bootStub, managedSession, stopStub } from './instance-stub.mjs'
export { LIST_BOUNDARIES } from './session-list-boundaries-data.mjs'

const fixture = name => ({ name, dir: path.join(import.meta.dirname, 'fixtures', name), enabled: true })

/** Only the existing H-STUB worker and opt-in fixture IPC channels; no live DSH access. */
export async function boundariesHost() {
  const w = await bootStub(C.fixture.name, { link: [fixture(LIST_ACTIVITY.fixture.name), fixture(C.fixture.name)] })
  let nextId = C.counts.none
  const request = (channel, op, args = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const listener = message => {
      if (message?.type !== channel.response || message.id !== id) return
      clearTimeout(timer)
      w.host.child.off('message', listener)
      if (message.ok) resolve(message.value)
      else reject(new Error(message.error))
    }
    const timer = setTimeout(() => { w.host.child.off('message', listener); reject(new Error('boundaries probe timed out: ' + op)) }, C.ms.ipc)
    w.host.child.on('message', listener)
    w.host.child.send({ type: channel.request, id, op, args })
  })
  w.probe = (op, args) => request(C.fixture, op, args)
  w.activity = (op, args) => request(LIST_ACTIVITY.fixture, op, args)
  w.row = async sessionId => (await w.activity('list')).items.find(row => row.sessionId === sessionId)
  w.target = async label => {
    const sessionId = await managedSession(w.host, label)
    await w.wait(sessionId)
    return sessionId
  }
  w.wait = async sessionId => assert.ok(await settledIdle(w.host, sessionId), 'target reaches idle')
  w.stop = async () => { try { await w.probe('cleanup') } finally { await stopStub(w) } }
  return w
}
