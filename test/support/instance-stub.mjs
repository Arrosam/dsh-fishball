/**
 * H-STUB, the test side (docs/test-design/connector.md "H-STUB details"). bootStub() boots the real
 * DSH worker with only `dsh-connector` and the fake instance `fbtest-stub-instance` (no
 * `dsh-instance`), on a throwaway OS-temp home, and returns the host handle plus a client
 * for the stub's operations. Everything a case observes goes through public surfaces: the
 * contract frames the stub received, the managed session's own tool results, the connector's
 * /api/fishball routes, DSH's settings service and the session logs.
 *
 * FBTEST_PLUGIN_DIR names the connector package alone: the worker then links that one package
 * (a checkout without `workspaces`), so the built-in instance is never installed.
 */
import fs from 'node:fs'
import { tempPath } from './temp-path.mjs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { CONNECTOR_CONTRACT, ENVELOPE, INBOX_KIND, OPERATION } from 'dsh-connector/contract'
import { CONNECTOR, LEGACY_INTERACTION, PRESET, ROW_ID, RUNTIME } from './constants.mjs'
import { callScript, jsonOf, patchFile, turn } from './expect.mjs'
import { bootHost } from './host.mjs'
import { STUB, STUB_HOMES } from './instance-stub-data.mjs'
import { sleep, until } from './util.mjs'

export { STUB } from './instance-stub-data.mjs'

const YAML = createRequire(path.join(RUNTIME, 'noop.js'))('yaml')
const LEGACY_ATTACHMENT = Object.freeze({
  capabilities: STUB.legacy.capabilities,
  fields: Object.freeze({ contract: Object.freeze({ ...CONNECTOR_CONTRACT, minor: STUB.legacy.minor }) }),
})
const bootOptions = new WeakMap()

let homeCounter = 0
/** A fresh home under the OS temp folder (removed by removeStubHomes or the OS). */
export function stubHome(label) {
  const home = tempPath(path.join(STUB_HOMES.root, label + '-' + Date.now() + '-' + ++homeCounter), { root: STUB_HOMES.root })
  fs.mkdirSync(home, { recursive: true })
  return home
}
/** Remove one temp home; the guard refuses any path that is not below this process's own temp folder. */
export function removeStubHome(home) {
  const resolved = tempPath(home, { root: STUB_HOMES.root })
  if (!resolved.startsWith(STUB_HOMES.root + path.sep) || !path.basename(STUB_HOMES.temp).startsWith(STUB_HOMES.prefix)) throw new Error('refusing to remove ' + resolved)
  fs.rmSync(resolved, { recursive: true, force: true })
}
/** Stop an H-STUB host and remove its home (an after() hook). */
export async function stopStub(booted) {
  if (!booted) return
  await booted.host?.stop()
  if (booted.home) removeStubHome(booted.home)
}

/**
 * The worker environment of an H-STUB host: the connector alone, plus the stub linked and enabled.
 * `link` adds further bundles ({name, dir, enabled}) to the same FBTEST_LINK list.
 */
export function stubEnv(env = {}, link = []) {
  return {
    FBTEST_PLUGIN_DIR: CONNECTOR.dir,
    ...env,
    FBTEST_LINK: JSON.stringify([{ name: STUB.row, dir: STUB.dir, enabled: true }, ...link]),
  }
}

/** The client of one stub inside a booted host; variants share IPC and observation helpers. */
function createStubClient(host, defaults = {}) {
  const attachmentArgs = (base, args = {}) => ({ ...base, ...args, fields: { ...base.fields, ...args.fields } })
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
    attach: (args) => call('attach', attachmentArgs(defaults, args)),
    attachLegacy: (args) => call('attach', attachmentArgs(LEGACY_ATTACHMENT, args)),
    detach: (index) => call('detach', { index }),
    fireClose: (index) => call('fireClose', { index }),
    send: (frame, index) => call('send', { frame, index }),
    request: (input) => call('request', input),
    handshake: (args) => call('handshake', { ...(defaults.capabilities ? { capabilities: defaults.capabilities } : {}), ...args }),
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

/** Contract-current defaults for interaction cases. */
export const stubClient = (host) => createStubClient(host)
/** Contract 1.1 and no semantic marker by default; callers can still override either independently. */
export const legacyStubClient = (host) => createStubClient(host, LEGACY_ATTACHMENT)

/**
 * Boot an H-STUB host (H-BOOT + H-CONN + H-STUB) and wait until the connector row is live.
 * attach: true (default) attaches the stub with the default descriptor and handshake.
 * Returns {host, home, stub}; pass the whole object to stopStub in after().
 */
async function bootStubWithClient(label, { env = {}, link = [], attach = true, home = stubHome(label) } = {}, makeClient = stubClient) {
  home = tempPath(home, { root: STUB_HOMES.root })
  const host = await bootHost(home, { env: stubEnv(env, link) })
  const state = await host.waitStatus('live')
  if (state?.status !== 'live') throw new Error('connector did not become live: ' + JSON.stringify(state) + '\n' + host.output.slice(-2000))
  const stub = makeClient(host)
  await until(async () => (await stub.service()).present, 10000, STUB.pollMs)
  if (attach) {
    const a = await stub.attach()
    if (!a.ok || a.handshake?.type !== ENVELOPE.type.response) throw new Error('stub attach failed: ' + JSON.stringify(a))
  }
  const booted = { host, home, stub }
  // Some group helpers copy {host, home, stub} onto their own context object, so key by the host.
  // Attachment suppression is per boot; a later restart defaults to attaching again.
  bootOptions.set(host, { env: { ...env }, link: [...link], makeClient })
  return booted
}

export const bootStub = (label, options) => bootStubWithClient(label, options)
/** Explicit legacy peer for tests whose purpose is control-only/user-fallback behavior. */
export const bootLegacyStub = (label, options) => bootStubWithClient(label, options, legacyStubClient)

/** Restart DSH on the same home, preserving the fixture environment and peer variant. */
export async function restartStub(old, options = {}) {
  await old.host.stop()
  const { makeClient = stubClient, ...previous } = bootOptions.get(old.host) ?? {}
  return bootStubWithClient('restart', { ...previous, ...options, home: old.home }, makeClient)
}

/**
 * Seed only D2's retired fields into the disposable profile patch while DSH is stopped, then
 * restart with the same environment. The settings editor intentionally cannot write these fields.
 * Mutate the booted handle so existing cleanup hooks and context-bound tools follow the new host.
 * Only explicitly listed session ids are resumed; no session discovery or in-flight turn replay occurs.
 */
export async function seedStoredInteractionConfig(booted, patch, { resume = [] } = {}) {
  const fields = Object.values(LEGACY_INTERACTION.fields)
  if (!patch || Array.isArray(patch) || Object.getPrototypeOf(patch) !== Object.prototype || Object.keys(patch).some((key) => !fields.includes(key))) throw new Error('only retired interaction settings may be seeded')
  if (!Array.isArray(resume) || resume.some((sessionId) => typeof sessionId !== 'string' || sessionId.length === 0)) throw new Error('resume must list non-empty session ids')
  const home = tempPath(booted.home, { root: STUB_HOMES.root })
  await booted.host.stop()
  const file = tempPath(patchFile(home), { root: home })
  const doc = fs.existsSync(file) ? YAML.parse(fs.readFileSync(file, 'utf8')) ?? [] : []
  if (!Array.isArray(doc)) throw new Error('expected a profile patch list')
  const findRow = (rows) => {
    for (const row of rows) {
      if (row?.id === ROW_ID) return row
      const nested = Array.isArray(row?.insert) ? findRow(row.insert) : undefined
      if (nested) return nested
    }
  }
  let row = findRow(doc)
  if (!row) { row = { id: ROW_ID }; doc.push(row) }
  row.config = { ...row.config, ...patch }
  fs.writeFileSync(file, YAML.stringify(doc))
  const { makeClient = stubClient, ...previous } = bootOptions.get(booted.host) ?? {}
  const next = await bootStubWithClient('stored-interaction', { ...previous, home }, makeClient)
  Object.assign(booted, next)
  for (const sessionId of resume) {
    const result = await booted.host.call('resume', { sessionId })
    if (result?.live !== true) throw new Error('session did not resume: ' + sessionId + ' ' + JSON.stringify(result))
  }
  return booted
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

/** A message_agent call from a managed session. */
export const messageFishball = (host, sessionId, args) => sessionCall(host, sessionId, 'message_agent', args)

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
