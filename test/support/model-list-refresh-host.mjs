/** A separate throwaway home and public provider fixture, never the user's live DSH profile. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { bootHost, newHome } from './host.mjs'
import { RUNTIME } from './constants.mjs'
import { HOST_REFRESH as C } from './model-list-refresh-host-data.mjs'
export { HOST_REFRESH } from './model-list-refresh-host-data.mjs'
export async function refreshHost() {
  const home = newHome(C.homeLabel)
  const env = { FBTEST_DSH_RUNTIME: RUNTIME, FBTEST_LINK: JSON.stringify([{ name: C.fixture, dir: path.resolve(import.meta.dirname, '../fixtures/model-list-refresh'), enabled: true }]), HOME: path.join(home, C.osHome), DSH_AGENTS_HOME: path.join(home, C.agentsHome) }
  fs.mkdirSync(env.HOME, { recursive: true })
  fs.mkdirSync(env.DSH_AGENTS_HOME, { recursive: true })
  const host = await bootHost(home, { env })
  try {
    const state = await host.waitStatus(['live'])
    assert.ok(state?.sessionId, host.output)
    let nextId = 0
    const probe = (op, args = {}) => new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => { host.child.off('message', listener); reject(new Error('refresh fixture operation timed out: ' + op)) }, C.ipcTimeoutMs)
      const listener = message => {
        if (message?.type !== C.response || message.id !== id) return
        clearTimeout(timer); host.child.off('message', listener)
        if (message.ok) resolve(message.value); else reject(new Error(message.error))
      }
      host.child.on('message', listener)
      host.child.send({ type: C.request, id, op, args })
    })
    const snapshots = async () => ({ selection: (await host.state()).modelSelection, defaults: await probe(C.operations.defaults), settings: (await host.call('settingsDescribe'))?.value })
    return { host, probe, snapshots }
  } catch (error) { await host.stop(); throw error }
}
