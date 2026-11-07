/**
 * H-STUB, the test side (docs/test-design/connector.md "H-STUB details"). bootStub() boots the real
 * DSH worker with only `fishball-connector` and the fake instance `fbtest-stub-instance` (no
 * `fishball-instance`), on a throwaway OS-temp home, and returns the host handle plus a client
 * for the stub's operations. Everything a case observes goes through public surfaces: the
 * contract frames the stub received, the managed session's own tool results, the connector's
 * /api/fishball routes, DSH's settings service and the session logs.
 *
 * FBTEST_PLUGIN_DIR names the connector package alone: the worker then links that one package
 * (a checkout without `workspaces`), so the built-in instance is never installed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ENVELOPE, INBOX_KIND, OPERATION } from 'fishball-connector/contract'
import { CONNECTOR, PRESET } from './constants.mjs'
import { callScript, jsonOf, turn } from './expect.mjs'
import { bootHost } from './host.mjs'
import { STUB, STUB_HOMES } from './instance-stub-data.mjs'
import { sleep, until } from './util.mjs'

export { STUB } from './instance-stub-data.mjs'

let homeCounter = 0
/** A fresh home under the OS temp folder (removed by removeStubHomes or the OS). */
export function stubHome(label) {
  const home = path.join(STUB_HOMES.root, label + '-' + Date.now() + '-' + ++homeCounter)
  fs.mkdirSync(home, { recursive: true })
  return home
}
/** Remove one temp home; the guard refuses any path that is not below this process's own temp folder. */
export function removeStubHome(home) {
  const resolved = path.resolve(home)
  if (!resolved.startsWith(STUB_HOMES.root + path.sep) || !path.basename(STUB_HOMES.temp).startsWith(STUB_HOMES.prefix)) throw new Error('refusing to remove ' + resolved)
  fs.rmSync(resolved, { recursive: true, force: true })
}
/** Stop an H-STUB host and remove its home (an after() hook). */
export async function stopStub(booted) {
  if (!booted) return
  await booted.host?.stop()
  if (booted.home) removeStubHome(booted.home)
}

/** The worker environment of an H-STUB host: the connector alone, plus the stub linked and enabled. */
export function stubEnv(env = {}) {
  return {
    FBTEST_PLUGIN_DIR: CONNECTOR.dir,
    FBTEST_LINK: JSON.stringify([{ name: STUB.row, dir: STUB.dir, enabled: true }]),
    ...env,
  }
}

/** The client of one stub inside a booted host. */
export function stubClient(host) {
  let ipcId = 0
  const call = (op, args = {}) => new Promise((resolve, reject) => {
    const id = ++ipcId
    const timer = setTimeout(() => { host.child.off('message', listener); reject(new Error('stub op timed out: ' + op)) }, STUB.ipcTimeoutMs)
    const listener = (message) => {
      if (message?.type !== STUB.ipc.response || message.id !== id) return
      clearTimeout(timer)
      host.child.off('message', listener)
      if (message.ok) resolve(message.value)
      else reject(new Error('stub op ' + op + ' failed: ' + message.error))
    }
    host.child.on('message', listener)
    host.child.send({ type: STUB.ipc.request, id, op, args })
  })
  const client = {
    call,
    attach: (args) => call('attach', args),
    detach: (index) => call('detach', { index }),
    fireClose: (index) => call('fireClose', { index }),
    send: (frame, index) => call('send', { frame, index }),
    request: (input) => call('request', input),
    handshake: (args) => call('handshake', args),
    received: (index) => call('received', { index }),
    transportCalls: (index) => call('transportCalls', { index }),
    ackPolicy: (n = null) => call('ackPolicy', { n }),
    errorPolicy: (code) => call('errorPolicy', { code }),
    setStatus: (value, mode) => call('setStatus', { value, mode }),
    retryCalls: () => call('retryCalls'),
    service: () => call('service'),
    /** The inbox.push requests received on one attachment (default: the newest), oldest first. */
    async pushes(index) { return (await client.received(index)).filter((f) => f.type === ENVELOPE.type.request && f.operation === OPERATION.inboxPush) },
    /** The events of one name received on one attachment. */
    async events(operation, index) { return (await client.received(index)).filter((f) => f.type === ENVELOPE.type.event && (!operation || f.operation === operation)) },
    /** Wait for an inbox item whose text contains needle (and of a kind, when given); returns its payload or undefined. */
    async waitPush(needle, { kind, index, timeoutMs = STUB.waitMs } = {}) {
      const find = async () => (await client.pushes(index)).map((f) => f.payload).find((p) => p.text.includes(needle) && (!kind || p.kind === kind))
      return (await until(find, timeoutMs, STUB.pollMs)) || undefined
    },
    /** Wait for an event of one name whose payload matches pred; returns the frame or undefined. */
    async waitEvent(operation, pred = () => true, { index, timeoutMs = STUB.waitMs } = {}) {
      const find = async () => (await client.events(operation, index)).find((f) => pred(f.payload, f))
      return (await until(find, timeoutMs, STUB.pollMs)) || undefined
    },
    /** Every inbox item text received so far whose text contains needle. */
    async pushTexts(needle, index) { return (await client.pushes(index)).map((f) => f.payload).filter((p) => p.text.includes(needle)) },
    /** One instance-to-connector request on the newest attachment; resolves {type, payload|code}. */
    op(operation, payload, sessionId = null, extra = {}) { return call('request', { operation, payload, sessionId, ...extra }) },
  }
  return client
}

/**
 * Boot an H-STUB host (H-BOOT + H-CONN + H-STUB) and wait until the connector row is live.
 * attach: true (default) attaches the stub with the default descriptor and handshake.
 */
export async function bootStub(label, { env = {}, attach = true, home = stubHome(label) } = {}) {
  const host = await bootHost(home, { env: stubEnv(env) })
  const state = await host.waitStatus('live')
  if (state?.status !== 'live') throw new Error('connector did not become live: ' + JSON.stringify(state) + '\n' + host.output.slice(-2000))
  const stub = stubClient(host)
  await until(async () => (await stub.service()).present, 10000, STUB.pollMs)
  if (attach) {
    const a = await stub.attach()
    if (!a.ok || a.handshake?.type !== ENVELOPE.type.response) throw new Error('stub attach failed: ' + JSON.stringify(a))
  }
  return { host, home, stub }
}

/** Restart DSH on the same home (H-STUB again); returns the new host and stub client. */
export async function restartStub(old, { env = {}, attach = true } = {}) {
  await old.host.stop()
  return bootStub('restart', { env, attach, home: old.home })
}

// ---- H-SESS / H-MANAGED ----

/** An ordinary main session S1 in its own folder, after one plain user turn. */
export async function userSession(host, folder, preset = PRESET.bare) {
  const sid = (await host.call('ordinary', { preset, folder })).sessionId
  await turn(host, sid, [[{ text: 'hello' }]], 'first words')
  return sid
}

/** Hand over through the connector's route (the header action), as the client's button does. */
export const handOver = (host, sessionId) => host.post('/api/fishball/managed', { sessionId, managed: true })
export const takeBack = (host, sessionId) => host.post('/api/fishball/managed', { sessionId, managed: false })

/** H-MANAGED: an ordinary session handed over. Its hand-over note (a system item) is drained when a stub is attached. */
export async function managedSession(host, folder, preset = PRESET.bare) {
  const sid = await userSession(host, folder, preset)
  const r = await handOver(host, sid)
  if (r.status !== 200) throw new Error('precondition: hand over ' + sid + ' answered ' + r.status + ' ' + r.text)
  return sid
}

/** One tool call from a session through the scripted model; returns its parsed JSON and raw result. */
export async function sessionCall(host, sessionId, tool, args, { text, timeoutMs } = {}) {
  const r = await turn(host, sessionId, callScript(tool, args), text, timeoutMs)
  if (r.results.length !== 1) throw new Error('expected one ' + tool + ' result, got ' + JSON.stringify(r.results))
  return { json: jsonOf(r.results[0]), result: r.results[0], turn: r }
}

/** A message_fishball call from a managed session. */
export const messageFishball = (host, sessionId, args) => sessionCall(host, sessionId, 'message_fishball', args)

/** Wait until no inbox item arrives for quietMs on the attachment; returns the count. */
export async function quietPushes(stub, index, quietMs = STUB.quietMs) {
  let last = -1
  for (;;) {
    const n = (await stub.pushes(index)).length
    if (n === last) return n
    last = n
    await sleep(quietMs)
  }
}

export const KIND = INBOX_KIND
export { OPERATION, ENVELOPE }
