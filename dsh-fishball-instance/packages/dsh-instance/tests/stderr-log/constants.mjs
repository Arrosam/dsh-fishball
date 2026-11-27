/**
 * Vocabulary of the child-stderr log cases (the requirement table in README.md beside this file).
 * The mask is the redactor's own contract (src/lib/redact.js: "every private span replaced by
 * `[redacted]`"); the file names and marks are captureChildStderr's (stderr-log.js JSDoc:
 * `child-stderr.log`, rotated once to `child-stderr.log.1`, a cut line ends `[truncated]`).
 */
export const MASK = '[redacted]'
export const LOG = Object.freeze({ file: 'child-stderr.log', rotated: 'child-stderr.log.1', truncated: '[truncated]', newline: '\n', tempPrefix: 'dshi-stderr-log-' })

/** No file ever holds U+FFFD (cuts are on a UTF-8 character boundary); the mark and its newline are 12 bytes. */
export const OVERSIZE = Object.freeze({ replacement: '\uFFFD', markBytes: Buffer.byteLength(LOG.truncated + LOG.newline) })

/** The small cap of the BVA and state rows; fix F4's report uses the real one. */
export const CAP = 64
/** Fix F4's report reproduction, verbatim. */
export const F4 = Object.freeze({ cap: 65536, token: 'dsht_Zq9xW2vB7nM4kL1pR8sT3uY6aD5fG0hJAbCdEfGhIjk', fillUnit: 'x ', fillRepeat: 32756, splitAt: 24 })
/** The review's probe at F4's cap. */
export const REVIEW_PROBE = Object.freeze({ earlier: Object.freeze(['EARLIER DIAGNOSTIC 1\n', 'EARLIER 2\n']), lineChars: 131072, writes: 2, after: 'after\n' })

/** `bytes` UTF-8 bytes of `unit`; throws on a row-authoring slip. */
export function fill(unit, bytes) {
  const size = Buffer.byteLength(unit)
  if (bytes % size !== 0) throw new Error(bytes + ' bytes is not a multiple of ' + JSON.stringify(unit))
  return unit.repeat(bytes / size)
}
/** Words separated by spaces, `bytes` long, ending in a space: no redaction rule matches it. */
export const words = (bytes) => fill('w ', bytes)

/**
 * R-FIX-INSTANCE F03: masking a sensitive container must not depend on how stderr is chunked. The
 * texts and what redact gives for each whole text (redactContinued JSDoc: threading carry through
 * whole-line pieces joins to exactly redact of the whole; R3b: whole containers, nested, multi-line,
 * unbalanced to the end).
 */
const continued = (id, title, text, expected, secrets, openAtEnd = false) => Object.freeze({ id: 'RFI-F03-' + id, title, text, expected, secrets: Object.freeze(secrets), openAtEnd })
export const CONTINUED = Object.freeze([
  continued('probe', 'the probe: a three-line object', "credentials: {\n  provider: 'small-secret',\n}\n", `credentials: ${MASK}\n`, ['small-secret', 'provider']),
  continued('nested', 'depth 2+: an array holding an array and an object; later lines redacted normally',
    'token = [\n  [\n    "a1",\n  ],\n  { secret: "b2" }\n]\napi_key=abc\nafter line\n', `token = ${MASK}\napi_key=${MASK}\nafter line\n`, ['"a1"', 'b2', 'abc']),
  continued('inspect', "util.inspect style: a nested object with a '…' string holding }",
    "{ credentials: {\n    user: 'bob',\n    pass: 'x}y-secret'\n  },\n  n: 1 }\nnext\n", `{ credentials: ${MASK},\n  n: 1 }\nnext\n`, ['bob', 'x}y', 'y-secret']),
  continued('json', 'a pretty-printed JSON member with a quoted key',
    '{\n  "credentials": {\n    "user": "u1",\n    "pass": "p1"\n  },\n  "name": "n"\n}\n', `{\n  "credentials": ${MASK},\n  "name": "n"\n}\n`, ['u1', 'p1']),
  continued('two', 'two containers one after the other, plain lines between',
    "secrets={\n  a: 1\n}\nok\n'token': [\n  'x',\n]\ndone\n", `secrets=${MASK}\nok\n'token': ${MASK}\ndone\n`, ['a: 1', "'x'"]),
  continued('unbalanced', 'a container still open at the end masks every following line', 'tokens=[1, 2\nnext line\nmore\n', `tokens=${MASK}`, ['1, 2', 'next line', 'more'], true),
])

export const F03 = Object.freeze({
  probe: Object.freeze({ writes: Object.freeze(['credentials: {\n', "  provider: 'small-secret',\n", '}\n']), log: `credentials: ${MASK}\n`, secret: 'small-secret' }),
  open: 'token = [\n',
  inside: Object.freeze(['  plain inside line\n', '  api_key=abc\n']),
  close: ']\n',
  after: 'visible after\n',
  overCap: 'a b c ' + 'z'.repeat(CAP + 8),
  hidden: Object.freeze(['zzz', 'visible after', 'plain inside', 'abc']),
  /** A cut that leaves a container's end unknown seals the stream with this line, once. */
  sealed: '[redacted: rest of stream]\n',
  sealProbe: Object.freeze({ cap: 100, writes: Object.freeze(['a '.repeat(80), ' credentials: {\n', "  provider: 'small-secret',\n", '}\n']), secret: 'small-secret' }),
  plainCut: Object.freeze({ cap: 100, writes: Object.freeze(['a '.repeat(80), ' just words\n', 'next line\n']), next: 'next line\n' }),
})

/** R-FIX-INSTANCE F04: the waiting blocks hold at most one limit; the oldest dropped first, `[dropped]` before the first block after a gap. */
export const F04 = Object.freeze({
  marker: '[dropped]\n',
  limit: 1024,
  overFactor: 4,
  hugeLines: 60000,
  later: 'later line\n',
  line: (n) => `burst ${String(n).padStart(6, '0')} ok\n`,
  linePattern: /^burst (\d+) ok$/,
  /** How much more memory a huge burst may retain than a small one (a bounded queue holds about one limit; an unbounded one ~1 MB). */
  heapBudgetBytes: 512 * 1024,
})
