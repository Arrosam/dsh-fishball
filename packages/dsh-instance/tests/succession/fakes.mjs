/**
 * In-process stand-ins for what the hosted-token logic talks to, each written from its contract,
 * never from the implementation, and each recording what it was asked:
 * - `fakeTokens`: K3 `dshConnectorTokens` (tokens.d.ts): createHosted, entryState, retire (answers
 *   scripted), onChange (`emit()` plays a pair-store change: every listener once);
 * - `fakeChildCredentials`: the child DSH's `credentials` service (describe, describeRecord, set, …);
 * - `memoryWire`: one transport pair `{send(text), onMessage(fn) → dispose, onClose(fn) → dispose}`,
 *   delivering on the microtask queue like a socket, frames recorded;
 * - `fakeLifecycle`: the locator's lifecycle `{status(), onChange(fn), retry()}`.
 */
import { EXTRA_CREDENTIALS, FIXTURE, IMPORT, K3, OUTCOME, RETIRE } from './constants.mjs'

/**
 * @param options.retire / options.onChange - false leaves that member out (an older connector).
 * `answer(...outcomes)` queues the next retire answers; then `answerAlways` (default ok) answers.
 * A function item is awaited for its answer. `onRetire(old, successor)` observes each call first.
 */
export function fakeTokens({ retire = true, onChange = true } = {}) {
  const states = new Map()
  const listeners = new Set()
  const queue = []
  const calls = { created: [], retired: [] }
  let counter = 0
  let fallback = OUTCOME.ok
  const service = {
    apiVersion: K3.apiVersion,
    async createHosted(instanceId) {
      calls.created.push(instanceId)
      counter += 1
      const entry = { entryKey: FIXTURE.entryPrefix + counter, label: FIXTURE.label, value: FIXTURE.planted + counter }
      states.set(entry.entryKey, K3.entry.enabled)
      return entry
    },
    entryState: (key) => states.get(key) ?? K3.entry.deleted,
  }
  const made = {
    calls,
    onRetire: undefined,
    answer(...outcomes) { queue.push(...outcomes) },
    answerAlways(outcome) { fallback = outcome },
    emit() { for (const fn of [...listeners]) fn() },
    listeners: () => listeners.size,
    setState: (key, state) => states.set(key, state),
    values: () => Array.from({ length: counter }, (_, i) => FIXTURE.planted + (i + 1)),
  }
  if (retire) {
    service.retire = async (oldKey, successorKey) => {
      calls.retired.push([oldKey, successorKey])
      await made.onRetire?.(oldKey, successorKey)
      const item = queue.length > 0 ? queue.shift() : fallback
      const outcome = typeof item === 'function' ? await item() : item
      if (outcome === OUTCOME.reject) throw Object.assign(new Error('dshi retire rejected'), { code: RETIRE.operationFailed })
      return outcome
    }
  }
  if (onChange) service.onChange = (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }
  made.service = Object.freeze(service)
  return made
}

/** The child's credential store: a reference table and a record table; `failSet` makes `set` throw. */
export function fakeChildCredentials() {
  const refs = new Map()
  const records = new Map()
  const store = {
    refs, records, failSet: false,
    async describe(name) { return { configured: refs.has(String(name)), writable: true } },
    async describeRecord(key) { return { configured: records.has(String(key)), writable: true } },
    async set(name, value) {
      if (store.failSet) throw new Error('dshi credential store is read-only')
      refs.set(String(name), value)
    },
    async unset(name) { refs.delete(String(name)) },
    async resolve(name) { const value = refs.get(String(name)); return value === undefined ? undefined : { value, source: 'file' } },
    /** A reinstall: the child home, its store with it, is gone. */
    wipe() { refs.clear(); records.clear() },
  }
  return store
}

/** Additional targets' credentials, stored as Fishball stores them. */
export function seedExtraCredentials(credentials) {
  for (const entry of EXTRA_CREDENTIALS) {
    credentials.refs.set(entry.ref, entry.value)
    credentials.records.set(entry.tokenRecord, { kind: 'grant', payload: { origin: entry.origin, value: entry.value } })
    credentials.records.set(entry.grantRecord, { kind: 'grant', payload: { origin: entry.origin, accessToken: entry.value } })
  }
}
/** The additional targets' credentials, exactly as seeded. */
export function extraCredentialsKept(credentials) {
  return EXTRA_CREDENTIALS.every((entry) => credentials.refs.get(entry.ref) === entry.value
    && credentials.records.get(entry.tokenRecord)?.payload?.value === entry.value
    && credentials.records.get(entry.grantRecord)?.payload?.accessToken === entry.value)
}

export function memoryWire() {
  const handlers = { host: { message: new Set(), close: new Set() }, child: { message: new Set(), close: new Set() } }
  const frames = { toChild: [], toHost: [] }
  let open = true
  const end = (self, other, log) => ({
    send(text) {
      if (!open) throw new Error('dshi wire closed')
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
    lose() { if (!open) return; open = false; for (const side of ['host', 'child']) for (const fn of [...handlers[side].close]) fn() },
  }
}

/** A ready child's lifecycle (`retry` restarts only a failed child, K3). */
export function fakeLifecycle() {
  const status = { ...K3.ready }
  return { status: () => ({ ...status }), onChange: () => () => {}, retry: async () => {}, origin: () => 'http://127.0.0.1:43129' }
}

/** A gate a scripted retire waits on: `wait(outcome)` is the answer item, `reached` when called, `open()`. */
export function gate() {
  let open
  const opened = new Promise((resolve) => { open = resolve })
  let arrived
  const reached = new Promise((resolve) => { arrived = resolve })
  return { wait: (outcome) => async () => { arrived(); await opened; return outcome }, reached, open: () => open() }
}

export { IMPORT }
