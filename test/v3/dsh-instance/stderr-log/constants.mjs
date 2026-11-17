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
 * The user's rule for a single write larger than `limitBytes` after redaction (relayed 2026-11-18):
 * cuts are on a UTF-8 character boundary, so no file ever holds U+FFFD or a partial character
 * (`replacement`). The final write at the end keeps its head plus the mark; a newline-terminated
 * block keeps its last bytes. Below `markBytes` the final write is the mark alone.
 */
export const OVERSIZE = Object.freeze({ replacement: '\uFFFD', markBytes: Buffer.byteLength(LOG.truncated + LOG.newline) })

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
/** The review's probe at F4's cap: two earlier lines, a 131072-character line in two writes, then the newline and one more line. */
export const REVIEW_PROBE = Object.freeze({
  earlier: Object.freeze(['EARLIER DIAGNOSTIC 1\n', 'EARLIER 2\n']),
  lineChars: 131072,
  writes: 2,
  after: 'after\n',
})

/** A text of `bytes` UTF-8 bytes made of `unit`; throws when `unit`'s byte length does not divide `bytes` (a row-authoring slip). */
export function fill(unit, bytes) {
  const size = Buffer.byteLength(unit)
  if (bytes % size !== 0) throw new Error(`${bytes} bytes is not a multiple of ${JSON.stringify(unit)}`)
  return unit.repeat(bytes / size)
}
/** Words separated by spaces, `bytes` long, ending in a space: no redaction rule matches it. */
export const words = (bytes) => fill('w ', bytes)
