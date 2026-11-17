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

/**
 * R-FIX-INSTANCE F03 (relayed 2026-11-18): masking a sensitive container must not depend on how
 * stderr is chunked. `probe` is the finding's reproduction (three writes, one line each). `cutOpen`
 * opens a container, then an unterminated text over the cap is cut ([truncated]): the depth is lost,
 * so everything after it on that stream stays masked, the closing bracket and later lines included.
 */
export const F03 = Object.freeze({
  probe: Object.freeze({ writes: Object.freeze(['credentials: {\n', "  provider: 'small-secret',\n", '}\n']), log: `credentials: ${MASK}\n`, secret: 'small-secret' }),
  open: 'token = [\n',
  inside: Object.freeze(['  plain inside line\n', '  api_key=abc\n']),
  close: ']\n',
  after: 'visible after\n',
  /** An unterminated text over CAP with whitespace (so the F4 cut keeps a head). */
  overCap: 'a b c ' + 'z'.repeat(CAP + 8),
  /** Text after the cut that must never reach the file while the depth is unknown. */
  hidden: Object.freeze(['zzz', 'visible after', 'plain inside', 'abc']),
  /**
   * The fixer's rule (2026-11-18): a cut whose dropped rest holds an opener ('{' or '['), or that
   * happens while a sensitive container is open, seals the stream: `sealed` is written once and
   * nothing after it from that stream reaches the log.
   */
  sealed: '[redacted: rest of stream]\n',
  /** The fixer's probe at cap 100: 160 bytes with no newline, then a container over three lines. */
  sealProbe: Object.freeze({ cap: 100, writes: Object.freeze(['a '.repeat(80), ' credentials: {\n', "  provider: 'small-secret',\n", '}\n']), secret: 'small-secret' }),
  /** A cut whose dropped rest has no opener: the next line is logged as usual (no seal). */
  plainCut: Object.freeze({ cap: 100, writes: Object.freeze(['a '.repeat(80), ' just words\n', 'next line\n']), next: 'next line\n' }),
})

/**
 * R-FIX-INSTANCE F04 (relayed 2026-11-18, bound corrected by the fixer the same day): redacted
 * blocks waiting to be written hold at most ONE limitBytes of text (plus the block being written);
 * the oldest are dropped first and `marker` is written before the first block after a gap.
 * `limit` is the cap of these rows; a burst line is `burst <6-digit n> ok\n` (no redaction rule matches it).
 */
export const F04 = Object.freeze({
  marker: '[dropped]\n',
  limit: 1024,
  /** BVA over the burst size in bytes, as multiples of the limit: within (no drop) and well over. */
  overFactor: 4,
  /** A burst far beyond the bound: about 1.3 MB of lines in one synchronous loop. */
  hugeLines: 60000,
  later: 'later line\n',
  /** Every burst line is the same size (16 bytes), so a byte count is a whole number of lines. */
  line: (n) => `burst ${String(n).padStart(6, '0')} ok\n`,
  linePattern: /^burst (\d+) ok$/,
})

/**
 * F04's harness bounds (never a product value): how long a burst may take to drain, and how much
 * more heap a huge burst may retain than a small one right after it was written. The huge burst is
 * about 960 KB of text; an unbounded queue holds at least that, a bounded one about one limit.
 */
export const HEAP = Object.freeze({ drainMs: 60000, budgetBytes: 512 * 1024 })
