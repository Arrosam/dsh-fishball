/**
 * In-process stand-ins for what the host modules talk to, each written from its contract, never from
 * the implementation: the connector's K3 `dshConnectorTokens` (apiVersion, createHosted, entryState,
 * retire), the child DSH's `credentials` service (dsh-credentials CredentialProvider: describe,
 * describeRecord, set, ...), the relayed transport `{send(text), onMessage(fn) → dispose,
 * onClose(fn) → dispose}`, the hosted record (hosted-record.js JSDoc), the child lifecycle the
 * locator takes (locator.js JSDoc) and DSH's Fetch registry (`connection.fetch.register`). Every
 * fake records what it was asked, so a case observes calls and the values they carried.
 */
import { EXTRA_CREDENTIALS, FIXTURE, IMPORT, K3 } from './constants.mjs'

/** A promise with its opener: `{promise, open()}`. */
export function gate() {
  let open
  const promise = new Promise((resolve) => { open = resolve })
  return { promise, open: () => open() }
}

/** One event-loop turn (setImmediate is never mocked by the cases' timer mocks). */
export const turn = () => new Promise((resolve) => setImmediate(resolve))
/** Wait, turn by turn, until `cond()` holds. No deadline: a hang shows as a hang. */
export async function until(cond) { while (!(await cond())) await turn() }
/** Let every already queued step run: a fixed number of event-loop turns. */
export async function drain(turns = 20) { for (let i = 0; i < turns; i++) await turn() }

/** What an async call did: `{value}` or `{error}`. */
export async function settle(fn) {
  try { return { value: await fn() } } catch (error) { return { error } }
}

/** A deep text of any value, for leak sweeps. */
export const textOf = (value) => JSON.stringify(value, (_, v) => (Buffer.isBuffer(v) ? v.toString('hex') : v)) ?? ''
export const parseFrame = (text) => { try { return JSON.parse(text) } catch { return undefined } }

/**
 * A fake K3 `dshConnectorTokens`: `createHosted` makes a new enabled entry with a planted value;
 * `entryState` answers `deleted` for an unknown key; the case switches an entry with `setState`
 * (the user's disable / delete); `failNextCreate` makes the next createHosted reject operation-failed.
 */
export function fakeTokens({ apiVersion = K3.tokensApiVersion } = {}) {
  const states = new Map()
  const calls = { created: [], retired: [], states: [] }
  let counter = 0
  let failNext = false
  return {
    apiVersion,
    async createHosted(instanceId) {
      calls.created.push(instanceId)
      if (failNext) { failNext = false; throw Object.assign(new Error('fbtest createHosted failed'), { code: K3.refusal.failed }) }
      counter += 1
      const entry = { entryKey: FIXTURE.entryPrefix + counter, label: FIXTURE.label, value: FIXTURE.planted + counter }
      states.set(entry.entryKey, K3.entry.enabled)
      return entry
    },
    entryState(entryKey) { calls.states.push(entryKey); return states.get(entryKey) ?? K3.entry.deleted },
    async retire(oldKey, newKey) { calls.retired.push([oldKey, newKey]); return { ok: true } },
    calls,
    setState(entryKey, state) { states.set(entryKey, state) },
    failNextCreate() { failNext = true },
    /** Every value handed out so far. */
    values: () => Array.from({ length: counter }, (_, i) => FIXTURE.planted + (i + 1)),
  }
}

/**
 * The child DSH's credential store as `ctx.credentials`: one reference table and one record table.
 * `failSet` makes `set` throw (an unwritable store). `coreSaves()` plays core's part (K3a
 * HOSTED_IMPORT): the imported value moves to the saved record and the reference is unset.
 * `wipe()` is a reinstall: the child home, and with it its store, is gone.
 */
export function fakeChildCredentials({ ref = false, record = false, failSet = false } = {}) {
  const refs = new Map(ref ? [[IMPORT.credentialRef, FIXTURE.planted + 'preexisting']] : [])
  const records = new Map(record ? [[IMPORT.savedRecord, { kind: 'grant', payload: {} }]] : [])
  const calls = { describe: [], describeRecord: [], set: [], unset: [], resolve: [], other: [] }
  const other = (name) => async () => { calls.other.push(name) }
  return {
    calls, refs, records, failSet,
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
    wipe() { refs.clear(); records.clear() },
  }
}

/** MULTI-2: plant the additional targets' credentials in a child store. */
export function seedExtraCredentials(credentials) {
  for (const entry of EXTRA_CREDENTIALS) {
    credentials.refs.set(entry.ref, entry.value)
    credentials.records.set(entry.tokenRecord, { kind: 'grant', payload: { origin: entry.origin, value: entry.value } })
    credentials.records.set(entry.grantRecord, { kind: 'grant', payload: { origin: entry.origin, accessToken: entry.value } })
  }
}
/** The additional targets' credentials exactly as planted. */
export function extraCredentialsOf(credentials) {
  return EXTRA_CREDENTIALS.map((entry) => [credentials.refs.get(entry.ref), credentials.records.get(entry.tokenRecord), credentials.records.get(entry.grantRecord)])
}
export const plantedExtraCredentials = () => EXTRA_CREDENTIALS.map((entry) => [entry.value, { kind: 'grant', payload: { origin: entry.origin, value: entry.value } }, { kind: 'grant', payload: { origin: entry.origin, accessToken: entry.value } }])

/**
 * One in-memory wire with a host end and a child end, delivered asynchronously like a socket, with
 * every frame recorded per direction. `lose()` closes both ends.
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
 * The hosted record in memory, as openHostedRecord's contract says: entries newest last,
 * `runtime` of the newest entry, a pending succession and `settle`. `added` lists every add.
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
 * The child lifecycle as the locator takes it: `retry` restarts a failed child only (K3), `set`
 * drives a transition; `origin()` is the child's own `http://127.0.0.1:<port>` while ready.
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
    origin: () => (status.state === K3.state.ready ? `http://127.0.0.1:${port}` : undefined),
  }
}

/** A fake K3 ProviderSync member; the locator passes it through. */
export function fakeProviderSync() {
  return {
    status: () => ({ state: 'ready', instanceId: FIXTURE.instanceId }),
    async check() { return { ok: true, result: { checkId: 'fbtest-check', missing: [], notOffered: [], present: 0 } } },
    async add() { return { ok: true, result: { items: [] } } },
  }
}

/** DSH's Fetch registry stand-in (`ctx.connection.fetch.register`) with the members a route module touches. */
export function routeContext() {
  const routes = []
  const ctx = {
    connection: { fetch: { register(route) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } } } },
    effect(fn) { return fn() },
    on: () => () => {},
    logger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
    get: () => undefined,
  }
  return { ctx, routes }
}

/**
 * A scripted credential client (credential.js client contract: `probe() → boolean`,
 * `importToken(value) → {ok:true} | {ok:false, code}`, rejecting CREDENTIAL_CHANNEL_UNAVAILABLE
 * when no answer comes). `answers` are the import answers in order (`'unanswered'` = no answer).
 */
export const ANSWER = Object.freeze({
  none: 'unanswered',
  ok: Object.freeze({ ok: true }),
  refused: Object.freeze({ ok: false, code: K3.refusal.unwritable }),
})
export function scriptedClient(answers = [], { present = false } = {}) {
  const queue = [...answers]
  const calls = { probe: 0, imports: [] }
  return {
    calls,
    async probe() { calls.probe += 1; return present },
    async importToken(value) {
      calls.imports.push(value)
      const answer = queue.length > 0 ? queue.shift() : ANSWER.ok
      if (answer === ANSWER.none) throw Object.assign(new Error('CREDENTIAL_CHANNEL_UNAVAILABLE'), { code: 'CREDENTIAL_CHANNEL_UNAVAILABLE' })
      return { ...answer }
    },
    close() {},
  }
}
