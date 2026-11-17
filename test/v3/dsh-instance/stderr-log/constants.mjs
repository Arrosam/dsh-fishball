/**
 * Vocabulary for the R-FIX-REDACT child-stderr log cases (cases.md). Values come from the task's
 * requirements (relayed 2026-11-18: the log file names, one rotation at `limitBytes`, line
 * buffering, fix F4's cut of an over-long unterminated buffer), never from the implementation.
 */
import { MASK } from '../../dsh-connector-shared/redact/constants.mjs'

export { MASK }
export const LOG = Object.freeze({ file: 'child-stderr.log', rotated: 'child-stderr.log.1', truncated: '[truncated]', newline: '\n', tempPrefix: 'fbtest-stderr-log-' })

/**
 * Writes are async and queued, so a row waits for the two files to stop changing: `stableReads`
 * identical reads `pollMs` apart, or fails after `timeoutMs`.
 */
export const SETTLE = Object.freeze({ pollMs: 10, stableReads: 10, timeoutMs: 5000 })

/**
 * `atEnd` for the rows that buffer exactly the cap: the end then writes cap + 1 bytes (the text and its
 * newline) in one write, more than the whole file may hold. The requirements do not say what a write
 * larger than `limitBytes` does (relayed 2026-11-18: only "rotate before a write would push past"), so
 * those rows check only what is fixed: nothing is written before the end and nothing is cut.
 */
export const NOT_CUT = Symbol('written at the end, not cut')

/** The small cap the BVA and state rows use; F4's report cap is the real one. */
export const CAP = 64
/** Fix F4's report reproduction, verbatim. */
export const F4 = Object.freeze({
  cap: 65536,
  token: 'dsht_Zq9xW2vB7nM4kL1pR8sT3uY6aD5fG0hJAbCdEfGhIjk',
  fillUnit: 'x ',
  fillRepeat: 32756,
  splitAt: 24,
})

/** A text of `bytes` UTF-8 bytes made of `unit`; throws when `unit`'s byte length does not divide `bytes` (a row-authoring slip). */
export function fill(unit, bytes) {
  const size = Buffer.byteLength(unit)
  if (bytes % size !== 0) throw new Error(`${bytes} bytes is not a multiple of ${JSON.stringify(unit)}`)
  return unit.repeat(bytes / size)
}
/** Words separated by spaces, `bytes` long, ending in a space: no redaction rule matches it. */
export const words = (bytes) => fill('w ', bytes)
