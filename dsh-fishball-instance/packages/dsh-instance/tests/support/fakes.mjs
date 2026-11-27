/**
 * In-process stand-ins for what dsh-instance's host modules talk to, shared by the areas that need
 * them. Each is written from its contract, never from the implementation, and records what it was
 * asked:
 * - `fakeTokens`: the connector's K3 `dshConnectorTokens` (tokens.d.ts): apiVersion, createHosted,
 *   entryState, retire (answers scripted), onChange (`emit()` plays a pair-store change);
 * - `fakeChildCredentials`: the child DSH's `credentials` service (dsh-credentials
 *   CredentialProvider: describe, describeRecord, set, ...);
 * - `memoryWire`: one relayed transport pair `{send(text), onMessage(fn) → dispose, onClose(fn) →
 *   dispose}`, delivering on the microtask queue like a socket, every frame recorded;
 * - `fakeLifecycle`: the child lifecycle the locator takes (locator.js JSDoc);
 * - the MULTI-2 additional targets' credentials, planted in a child store.
 */
import { EXTRA_CREDENTIALS, FAKE, GRANT, HOSTED_IMPORT, TOKENS } from './constants.mjs'

/**
 * A fake K3 `dshConnectorTokens`, itself the service handed to the instance. `createHosted` makes a
 * new enabled entry `{entryKey: <entryPrefix><n>, label, value: <planted><n>}` from `fixture`;
 * `entryState` answers `deleted` for an unknown key; `setState` switches an entry (the user's
 * disable / delete); `failNextCreate` makes the next createHosted reject operation-failed.
 * `retire` / `onChange`: false leaves that member out (an older connector). `answer(...outcomes)`
 * queues the next retire answers, then `answerAlways` (default ok) answers; a function item is
 * awaited for its answer, TOKENS.reject makes the call reject. `onRetire(old, successor)` observes
 * each call first. `emit()` calls every onChange listener once; `listeners()` counts them.
 */
export function fakeTokens({ fixture, apiVersion = TOKENS.apiVersion, retire = true, onChange = true }) {
  const states = new Map()
  const subscribers = new Set()
  const queue = []
  const calls = { created: [], retired: [], states: [] }
  let counter = 0
  let failNext = false
  let fallback = TOKENS.ok
  const failure = (message) => Object.assign(new Error(message), { code: TOKENS.operationFailed })
  const tokens = {
    apiVersion,
    async createHosted(instanceId) {
      calls.created.push(instanceId)
      if (failNext) { failNext = false; throw failure(FAKE.createFailed) }
      counter += 1
      const entry = { entryKey: fixture.entryPrefix + counter, label: fixture.label, value: fixture.planted + counter }
      states.set(entry.entryKey, TOKENS.entry.enabled)
      return entry
    },
    entryState(entryKey) { calls.states.push(entryKey); return states.get(entryKey) ?? TOKENS.entry.deleted },
    calls,
    onRetire: undefined,
    setState(entryKey, state) { states.set(entryKey, state) },
    failNextCreate() { failNext = true },
    answer(...outcomes) { queue.push(...outcomes) },
    answerAlways(outcome) { fallback = outcome },
    emit() { for (const fn of [...subscribers]) fn() },
    listeners: () => subscribers.size,
    /** Every value handed out so far. */
    values: () => Array.from({ length: counter }, (_, i) => fixture.planted + (i + 1)),
  }
  if (retire) {
    tokens.retire = async (oldKey, successorKey) => {
      calls.retired.push([oldKey, successorKey])
      await tokens.onRetire?.(oldKey, successorKey)
      const item = queue.length > 0 ? queue.shift() : fallback
      const outcome = typeof item === 'function' ? await item() : item
      if (outcome === TOKENS.reject) throw failure(FAKE.retireRejected)
      return outcome
    }
  }
  if (onChange) tokens.onChange = (fn) => { subscribers.add(fn); return () => { subscribers.delete(fn) } }
  return tokens
}

const grant = (payload) => ({ kind: GRANT, payload })

/**
 * The child DSH's credential store as `ctx.credentials`: one reference table and one record table.
 * `ref` / `record` start it holding the reserved parent's reference / saved record. `failSet`
 * (also settable later) makes `set` throw (an unwritable store). `coreSaves()` plays core's part
 * (K3a HOSTED_IMPORT): the imported value moves to the saved record and the reference is unset.
 * `wipe()` is a reinstall: the child home, and with it its store, is gone.
 */
export function fakeChildCredentials({ ref = false, record = false, failSet = false } = {}) {
  const refs = new Map(ref ? [[HOSTED_IMPORT.credentialRef, FAKE.preexisting]] : [])
  const records = new Map(record ? [[HOSTED_IMPORT.savedRecord, grant({})]] : [])
  const calls = { describe: [], describeRecord: [], set: [], unset: [], resolve: [], other: [] }
  const other = (name) => async () => { calls.other.push(name) }
  const store = {
    calls, refs, records, failSet,
    async describe(name) { calls.describe.push(String(name)); return { configured: refs.has(String(name)), writable: true } },
    async describeRecord(key) { calls.describeRecord.push(String(key)); return { configured: records.has(String(key)), writable: true } },
    async set(name, value) {
      calls.set.push([String(name), value])
      if (store.failSet) throw new Error(FAKE.readOnly)
      refs.set(String(name), value)
    },
    async unset(name) { calls.unset.push(String(name)); refs.delete(String(name)) },
    async resolve(name) { calls.resolve.push(String(name)); const value = refs.get(String(name)); return value === undefined ? undefined : { value, source: 'file' } },
    readRecord: other('readRecord'),
    modifyRecord: other('modifyRecord'),
    deleteRecord: other('deleteRecord'),
    listRecords: async () => [],
    coreSaves() {
      if (!refs.has(HOSTED_IMPORT.credentialRef)) return
      records.set(HOSTED_IMPORT.savedRecord, grant({}))
      refs.delete(HOSTED_IMPORT.credentialRef)
    },
    wipe() { refs.clear(); records.clear() },
  }
  return store
}

/** One additional target's three credentials as Fishball stores them: reference value, token record, grant record. */
const plantedOf = (entry) => [entry.value, grant({ origin: entry.origin, value: entry.value }), grant({ origin: entry.origin, accessToken: entry.value })]

/** MULTI-2: plant the additional targets' credentials in a child store. */
export function seedExtraCredentials(credentials) {
  for (const entry of EXTRA_CREDENTIALS) {
    const [value, token, connect] = plantedOf(entry)
    credentials.refs.set(entry.ref, value)
    credentials.records.set(entry.tokenRecord, token)
    credentials.records.set(entry.grantRecord, connect)
  }
}
/** The additional targets' credentials as a store holds them now, in plantedExtraCredentials' shape. */
export const extraCredentialsOf = (credentials) => EXTRA_CREDENTIALS.map((entry) => [credentials.refs.get(entry.ref), credentials.records.get(entry.tokenRecord), credentials.records.get(entry.grantRecord)])
/** The additional targets' credentials exactly as planted. */
export const plantedExtraCredentials = () => EXTRA_CREDENTIALS.map(plantedOf)
/** Whether every additional target's value is still where it was planted. */
export const extraCredentialsKept = (credentials) => EXTRA_CREDENTIALS.every((entry) => credentials.refs.get(entry.ref) === entry.value
  && credentials.records.get(entry.tokenRecord)?.payload?.value === entry.value
  && credentials.records.get(entry.grantRecord)?.payload?.accessToken === entry.value)

/**
 * One in-memory wire with a host end and a child end, delivered asynchronously like a socket, with
 * every frame recorded per direction (`frames.toChild`, `frames.toHost`). `lose()` closes both ends.
 */
export function memoryWire() {
  const handlers = { host: { message: new Set(), close: new Set() }, child: { message: new Set(), close: new Set() } }
  const frames = { toChild: [], toHost: [] }
  let open = true
  const end = (self, other, log) => ({
    send(text) {
      if (!open) throw new Error(FAKE.wireClosed)
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

/** The child lifecycle states the fake moves through (K3 ChildStatus). */
const LIFECYCLE = Object.freeze({ ready: 'ready', failed: 'failed', starting: 'starting' })

/**
 * The child lifecycle as the locator takes it: `retry` restarts a failed child only (K3), `set`
 * drives a transition; `origin()` is the child's own `http://127.0.0.1:<port>` while ready.
 * `initial` is the first status (default ready).
 */
export function fakeLifecycle({ initial = { state: LIFECYCLE.ready, code: null }, port }) {
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
      if (status.state === LIFECYCLE.failed) { status = { state: LIFECYCLE.starting, code: null }; emit() }
    },
    set(next) { status = { ...next }; emit() },
    origin: () => (status.state === LIFECYCLE.ready ? `http://127.0.0.1:${port}` : undefined),
  }
}
