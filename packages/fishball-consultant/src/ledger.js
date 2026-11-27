import { readFileSync } from 'node:fs'
import { open, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DOMAIN, S } from './constants.js'
import { record, isSubject, id } from './shapes.js'

export const emptyLedger = () => ({ version: DOMAIN.version, bindings: [], requests: [], outbox: [] })
export function checkedLedger(value) {
  if (value?.version !== DOMAIN.version || !Array.isArray(value.bindings) || !Array.isArray(value.requests) || !Array.isArray(value.outbox)
    || !value.bindings.every((row) => isSubject(row?.subject) && [S.open, S.cleanup, S.archived].includes(row.status))
    || !value.requests.every((row) => isSubject(row?.subject) && id(row.requestId) && record(row.brief) && record(row.destination) && Object.values(S).includes(row.status))
    || !value.outbox.every((row) => id(row?.requestId) && record(row.notice))) throw new TypeError('Invalid consultant ledger; no state was replaced.')
  return value
}

function readFile(file) {
  try { return checkedLedger(JSON.parse(readFileSync(file, 'utf8'))) }
  catch (error) { if (error.code !== 'ENOENT') throw error; return emptyLedger() }
}

async function replaceFile(file, value) {
  const next = file + '.' + randomUUID()
  const handle = await open(next, 'wx', 0o600)
  try {
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync() } finally { await handle.close() }
    await rename(next, file)
    const directory = await open(dirname(file), 'r')
    try { await directory.sync() } finally { await directory.close() }
  } finally { await unlink(next).catch(() => {}) }
}

/** A single durable commit covers topic ownership, daily/subject reservation, receipt and outbox.
 * Storage domain handles are exclusive; the file adapter is for single-owner standalone tests. */
export function createLedger({ file, initial, commit } = {}) {
  let snapshot = structuredClone(initial === undefined ? (file ? readFile(file) : emptyLedger()) : checkedLedger(initial))
  const persist = commit ?? (file ? (value) => replaceFile(file, value) : async () => {})
  let tail = Promise.resolve(), poisoned = false
  return Object.freeze({
    read: () => { if (poisoned) throw new Error('Consultant ledger needs recovery.'); return structuredClone(snapshot) },
    transact(fn) {
      const run = tail.then(async () => {
        if (poisoned) throw new Error('Consultant ledger needs recovery.')
        const draft = structuredClone(snapshot)
        const result = fn(draft)
        if (JSON.stringify(draft) !== JSON.stringify(snapshot)) {
          try { await persist(draft) } catch (error) { poisoned = true; throw error }
          snapshot = draft
        }
        return structuredClone(result)
      })
      tail = run.catch(() => {})
      return run
    },
    drain: () => tail,
  })
}
