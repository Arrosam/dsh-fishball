/**
 * In-process stand-ins for what the I-HOST modules talk to. Each one is built from the frozen
 * contracts (K3 tokens.d.ts, child.d.ts; DSH's CredentialProvider; the relayed transport shape
 * `{send(string), onMessage(fn) → dispose, onClose(fn) → dispose}`), never from the implementation.
 * Every fake records what it was asked, so the cases observe the calls and the values they carried.
 */
import { FIXTURE, IMPORT, K3 } from './constants.mjs'

/**
 * A fake `dshConnectorTokens` (K3 tokens.d.ts): `createHosted` makes a new enabled entry with a
 * planted value; `entryState` answers `deleted` for an unknown key; the test switches an entry with
 * `setState` (the user's disable / delete). `fail` makes the next `createHosted` reject
 * `operation-failed` (HostServiceError shape).
 */
export function fakeTokens({ apiVersion = K3.apiVersion } = {}) {
  const states = new Map()
  const calls = { created: [], retired: [], states: [] }
  let counter = 0
  let failNext = false
  return {
    apiVersion,
    async createHosted(instanceId) {
      calls.created.push(instanceId)
      if (failNext) { failNext = false; throw Object.assign(new Error('fbtest createHosted failed'), { code: K3.reconnect.failed }) }
      counter += 1
      const entry = { entryKey: FIXTURE.entryPrefix + counter, label: FIXTURE.label, value: FIXTURE.planted + counter }
      states.set(entry.entryKey, K3.entry.enabled)
      return entry
    },
    entryState(entryKey) {
      calls.states.push(entryKey)
      return states.get(entryKey) ?? K3.entry.deleted
    },
    async retire(oldKey, newKey) { calls.retired.push([oldKey, newKey]); return { ok: true } },
    calls,
    setState(entryKey, state) { states.set(entryKey, state) },
    failNextCreate() { failNext = true },
    /** Every value handed out so far (the planted values a sweep looks for). */
    values: () => Array.from({ length: counter }, (_, i) => FIXTURE.planted + (i + 1)),
  }
}

/**
 * The child DSH's credential store as `ctx.credentials` (dsh-credentials CredentialProvider): one
 * reference table and one record table. `describe`/`describeRecord` answer `{configured, writable}`.
 * `failSet` makes `set` throw (an unwritable store). `coreSaves()` plays core's part (K3a link.d.ts
 * HOSTED_IMPORT steps 3): the imported value moves to the saved record and the reference is unset.
 */
export function fakeChildCredentials({ ref = false, record = false, failSet = false } = {}) {
  const refs = new Map(ref ? [[IMPORT.credentialRef, FIXTURE.planted + 'preexisting']] : [])
  const records = new Map(record ? [[IMPORT.savedRecord, { kind: 'grant', payload: {} }]] : [])
  const calls = { describe: [], describeRecord: [], set: [], unset: [], resolve: [], other: [] }
  const other = (name) => async () => { calls.other.push(name) }
  return {
    calls,
    refs,
    records,
    failSet,
    async describe(name) { calls.describe.push(String(name)); return { configured: refs.has(String(name)), writable: true } },
    async describeRecord(key) { calls.describeRecord.push(String(key)); return { configured: records.has(String(key)), writable: true } },
    async set(name, value) {
      calls.set.push([String(name), value])
      if (this.failSet) throw new Error('fbtest credential store is read-only')
      refs.set(String(name), value)
    },
    async unset(name) { calls.unset.push(String(name)); refs.delete(String(name)) },
    async resolve(name) { calls.resolve.push(String(name)); const value = refs.get(String(name)); return value === undefined ? undefined : { value, source: 'file' } },
    readRecord: other('readRecord'),
    modifyRecord: other('modifyRecord'),
    deleteRecord: other('deleteRecord'),
    listRecords: async () => [],
    coreSaves() {
      if (!refs.has(IMPORT.credentialRef)) return
      records.set(IMPORT.savedRecord, { kind: 'grant', payload: {} })
      refs.delete(IMPORT.credentialRef)
    },
    /** A reinstall: the child home, and with it its store, is gone. */
    wipe() { refs.clear(); records.clear() },
  }
}

/**
 * One in-memory wire with a host end and a child end, delivered asynchronously like a socket, with
 * every frame recorded per direction (the observation point for "only on the mcp-credential
 * channel, at the first start only"). `lose()` closes both ends.
 */
export function memoryWire() {
  const handlers = { host: { message: new Set(), close: new Set() }, child: { message: new Set(), close: new Set() } }
  const frames = { toChild: [], toHost: [] }
  let open = true
  const end = (self, other, log) => ({
    send(text) {
      if (!open) throw new Error('fbtest wire closed')
      frames[log].push(text)
      queueMicrotask(() => { if (open) for (const fn of [...handlers[other].message]) fn(text) })
    },
    onMessage(fn) { handlers[self].message.add(fn); return () => handlers[self].message.delete(fn) },
    onClose(fn) { handlers[self].close.add(fn); return () => handlers[self].close.delete(fn) },
  })
  return {
    host: end('host', 'child', 'toChild'),
    child: end('child', 'host', 'toHost'),
    frames,
    get open() { return open },
    lose() { if (!open) return; open = false; for (const side of ['host', 'child']) for (const fn of [...handlers[side].close]) fn() },
  }
}

/**
 * The hosted entries record in memory (a fake of openHostedRecord's result):
 * `{entries(), runtime(), pending(), add(entryKey, {runtime?, succession?}), settle(oldEntryKey)}`.
 * I-SUCCEED: record contract gains pending/settle (and runtime, the user's Q3 = A, 2026-11-17).
 * `add` lists the key newest last and records `runtime` (the child runtime id the newest entry was
 * created under) when given. `succession: true` marks the entry listed before `key` as the pending
 * succession's old entry unless one is already pending (the original old entry is kept, the
 * user's Q2). `settle(old)` clears the pending succession only when `old` is the pending one. This
 * suite's world gives the instance one runtime id throughout, so its rows never start a succession.
 */
export function memoryRecord(entries = []) {
  const list = [...entries]
  const added = []
  let pending
  let runtime
  return {
    entries: () => [...list],
    runtime: () => runtime,
    async add(key, options) {
      added.push(key)
      if (options?.succession === true && pending === undefined) pending = list.at(-1)
      if (options?.runtime !== undefined) runtime = options.runtime
      list.push(key)
    },
    pending: () => pending,
    async settle(old) { if (old === pending) pending = undefined },
    added,
  }
}

/**
 * The child lifecycle as the locator takes it (relayed: `{status(), onChange(fn), retry()}`):
 * `retry` restarts a failed child only, as K3 says the lifecycle does; `set` drives a transition.
 * `origin()` is the child's own `http://127.0.0.1:<port>` while ready, else null.
 */
export function fakeLifecycle(initial = { state: K3.state.ready, code: null }, port = FIXTURE.port) {
  let status = { ...initial }
  const listeners = new Set()
  const calls = { retry: 0 }
  const emit = () => { for (const fn of [...listeners]) fn() }
  return {
    calls,
    status: () => ({ ...status }),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async retry() {
      calls.retry += 1
      if (status.state === K3.state.failed) { status = { state: K3.state.starting, code: null }; emit() }
    },
    set(next) { status = { ...next }; emit() },
    origin: () => (status.state === K3.state.ready ? `http://127.0.0.1:${port}` : null),
    listeners: () => listeners.size,
  }
}

/** A fake providerSync member (K3 ProviderSync), recording calls; the locator passes it through. */
export function fakeProviderSync() {
  const calls = { check: 0, add: [] }
  return {
    calls,
    status: () => ({ state: 'ready', instanceId: FIXTURE.instanceId }),
    async check() { calls.check += 1; return { ok: true, result: { checkId: 'fbtest-check', missing: [], notOffered: [], present: 0 } } },
    async add(request) { calls.add.push(request); return { ok: true, result: { items: [] } } },
  }
}

/** A DSH Fetch registry stand-in (`ctx.connection.fetch.register`), with the context members a row may touch. */
export function routeContext() {
  const routes = []
  const logs = []
  const logger = (name) => Object.fromEntries(['debug', 'info', 'warn', 'error'].map((level) => [level, (...args) => logs.push({ name, level, args })]))
  const ctx = {
    connection: { fetch: { register(route) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } } } },
    effect(fn) { return fn() },
    on: () => () => {},
    logger,
    get: () => undefined,
  }
  return { ctx, routes, logs }
}
