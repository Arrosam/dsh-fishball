/**
 * A scripted K3 `dshConnectorTokens` for the I-SUCCEED cases, built on the I-HOST suite's fake
 * (`fakeTokens`: createHosted / entryState, planted values, recorded calls) from the frozen contract
 * (tokens.d.ts as amended by I-SUCCEED, the user's Q1 = C, 2026-11-17), never from the implementation.
 *
 * - `retire` answers from a queue (`answer(...)`), then the fallback (`answerAlways`, default
 *   `{ok: true}`); `OUTCOME.reject` makes that call reject; a function item is awaited for the
 *   answer (a row holds the call open, or plays a pair change during it). Every call is recorded in
 *   `calls.retired` as `[old, successor]`, and `onRetire(old, successor)` (a row's observer) runs
 *   when the call arrives, before it answers.
 * - `onChange(fn) → dispose`; `emit()` plays the connector's pair-store change (K1
 *   `PairStore.onChange`: "Listeners run once after a change").
 * - `retire: false` / `onChange: false` leave the member out: an older connector (behaviour 8).
 */
import { fakeTokens } from '../host/fakes.mjs'
import { OUTCOME, RETIRE, TOKENS_MEMBERS } from './constants.mjs'

export function scriptedTokens({ retire = true, onChange = true } = {}) {
  const base = fakeTokens()
  const listeners = new Set()
  const queue = []
  let fallback = OUTCOME.ok
  const service = { apiVersion: base.apiVersion, createHosted: base.createHosted, entryState: base.entryState }
  if (retire) {
    service[TOKENS_MEMBERS.retire] = async (oldKey, successorKey) => {
      base.calls.retired.push([oldKey, successorKey])
      made.onRetire?.(oldKey, successorKey)
      const item = queue.length > 0 ? queue.shift() : fallback
      const next = typeof item === 'function' ? await item() : item
      if (next === OUTCOME.reject) throw Object.assign(new Error('fbtest retire rejected'), { code: RETIRE.operationFailed })
      return next
    }
  }
  if (onChange) {
    service[TOKENS_MEMBERS.onChange] = (fn) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    }
  }
  const made = {
    service: Object.freeze(service),
    /** Set by a world: runs when a retire call arrives. */
    onRetire: undefined,
    calls: base.calls,
    values: base.values,
    setState: base.setState,
    /** The next retire calls answer these, in order. */
    answer(...outcomes) { queue.push(...outcomes) },
    /** Every retire call after the queue answers `outcome`. */
    answerAlways(outcome) { fallback = outcome },
    /** One pair-store change: every listener once, no argument. */
    emit() { for (const fn of [...listeners]) fn() },
    listeners: () => listeners.size,
  }
  return made
}

/** A gate a scripted answer waits on: `wait(outcome)` is the answer item, `open()` lets it answer. */
export function gate() {
  let open
  const opened = new Promise((resolve) => { open = resolve })
  let arrived
  const reached = new Promise((resolve) => { arrived = resolve })
  return { wait: (outcome) => async () => { arrived(); await opened; return outcome }, reached, open: () => open() }
}
