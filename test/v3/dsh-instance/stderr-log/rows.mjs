/**
 * The child-stderr log rows (cases.md), as data: each row feeds `steps` to a fresh capture one chunk
 * at a time and names what the log gains after each chunk (`[chunk, written]`), then what it gains
 * when the stream ends (`atEnd`). "The log" is `child-stderr.log.1` followed by `child-stderr.log`.
 * Expected text comes from the requirements only; the redacted forms are the ones the redactor's
 * own rows (../../dsh-connector-shared/redact/constants.mjs) fix.
 *
 * `limitBytes` is both the rotation limit and the cap on the unterminated buffer, so a row that
 * rotated twice would lose its oldest text. The cut rows therefore keep their written prefix short
 * (SHORT), so no row rotates more than once.
 */
import { CAP, F4, LOG, MASK, NOT_CUT, fill, words } from './constants.mjs'

const NL = LOG.newline
const CUT = LOG.truncated + NL
/** A row; `secrets` must be absent from both files at the end. */
const row = (id, part, title, steps, atEnd, secrets = [], cap = CAP) => Object.freeze({ id, part, title, cap, steps: Object.freeze(steps), atEnd, secrets: Object.freeze(secrets) })

/** A short whitespace-ended prefix no redaction rule matches. */
const SHORT = words(10)
/**
 * SHORT, then the one-byte `tail` repeated to a text of exactly `bytes` bytes. A letter tail is a
 * 32+ opaque run (masked when written), so rows whose text is written whole use KEPT, `.`, which
 * splits runs and matches no rule.
 */
const sized = (bytes, tail = 'z') => SHORT + tail.repeat(bytes - SHORT.length)
const KEPT = '.'

const F4_CHUNKS = Object.freeze([F4.fillUnit.repeat(F4.fillRepeat) + ' ' + F4.token.slice(0, F4.splitAt), F4.token.slice(F4.splitAt) + NL])
/** The prefix up to and including the last whitespace (the fill and the extra space; no rule matches it). */
const F4_PREFIX = F4.fillUnit.repeat(F4.fillRepeat) + ' '
const F4_SECRETS = Object.freeze([F4.token.slice(0, F4.splitAt), F4.token.slice(F4.splitAt)])

export const STDERR_ROWS = Object.freeze([
  // ---------------------------------------------------------------- STDERR-UC-01: fix F4's report
  row('STDERR-UC-01', 'F4 report', "fix F4's reproduction: no fragment of the split token in either file, [truncated] written",
    [[F4_CHUNKS[0], F4_PREFIX + CUT], [F4_CHUNKS[1], '']], '', F4_SECRETS, F4.cap),
  row('STDERR-UC-01', 'F4 report, then a line', 'after the discarded newline the next line is written normally',
    [[F4_CHUNKS[0], F4_PREFIX + CUT], [F4_CHUNKS[1], ''], ['next line' + NL, 'next line' + NL]], '', F4_SECRETS, F4.cap),

  // ---------------------------------------------------------------- STDERR-EP-01: newline buffering and redaction
  row('STDERR-EP-01', 'one line', 'a newline-terminated line is written as it is', [['hello' + NL, 'hello' + NL]], ''),
  row('STDERR-EP-01', 'held to the newline', 'text without a newline is held until the newline', [['hel', ''], ['lo', ''], [NL, 'hello' + NL]], ''),
  row('STDERR-EP-01', 'token split across chunks', 'a token split across chunks but ended by a newline is masked whole',
    [['pass', ''], ['word=hun', ''], ['ter2' + NL, `password=${MASK}` + NL]], '', ['hunter2', 'hun', 'ter2']),
  row('STDERR-EP-01', 'several lines in one chunk', 'every complete line is redacted; the unterminated rest waits',
    [['a=1' + NL + 'api_key=abc' + NL + 'rest', 'a=1' + NL + `api_key=${MASK}` + NL], [NL, 'rest' + NL]], '', ['abc']),
  row('STDERR-EP-01', 'Authorization line', 'a header line is masked to its end, the next line kept',
    [['Authorization: Basic dXNlcjpwYXNz' + NL + 'ok' + NL, `Authorization: ${MASK}` + NL + 'ok' + NL]], '', ['dXNlcjpwYXNz']),

  // ---------------------------------------------------------------- STDERR-EP-02: the stream ends
  row('STDERR-EP-02', 'remainder', 'buffered text is written with a newline at the end', [['abc', '']], 'abc' + NL),
  row('STDERR-EP-02', 'remainder with a secret', 'the remainder is redacted', [['api_key=xyz', '']], `api_key=${MASK}` + NL, ['xyz']),
  row('STDERR-EP-02', 'nothing buffered', 'ending after a full line writes nothing more', [['done' + NL, 'done' + NL]], ''),
  row('STDERR-EP-02', 'no data', 'a stream that ends with no data leaves the log empty', [], ''),

  // ---------------------------------------------------------------- STDERR-BVA-01: the cap on the unterminated buffer (bytes)
  row('STDERR-BVA-01', 'cap-1', `${CAP - 1} buffered bytes: never force-flushed`, [[sized(CAP - 1, KEPT), '']], sized(CAP - 1, KEPT) + NL),
  row('STDERR-BVA-01', 'cap', `${CAP} buffered bytes: never force-flushed`, [[sized(CAP, KEPT), '']], NOT_CUT),
  row('STDERR-BVA-01', 'cap+1', `${CAP + 1} buffered bytes: the prefix to the last whitespace, then the mark; the end adds nothing`,
    [[sized(CAP + 1), SHORT + CUT]], '', ['zzz']),
  row('STDERR-BVA-01', 'cap over chunks, then +1', 'cap bytes over two chunks stay buffered; one more byte cuts',
    [[sized(CAP / 2), ''], ['z'.repeat(CAP / 2), ''], ['q', SHORT + CUT]], '', ['zzz', 'q']),
  row('STDERR-BVA-01', 'cap+1, no whitespace', 'no whitespace at all: only the mark', [['z'.repeat(CAP + 1), CUT]], '', ['zzz']),
  row('STDERR-BVA-01', 'cap+1, whitespace first', 'only the leading whitespace survives', [[' ' + 'z'.repeat(CAP), ' ' + CUT]], '', ['zzz']),
  row('STDERR-BVA-01', 'cap+1, tab is whitespace', 'a tab is a whitespace character to cut at',
    [[fill('w', 10) + '\t' + 'z'.repeat(CAP - 10), fill('w', 10) + '\t' + CUT]], '', ['zzz']),
  // Bytes, not characters: é and ü are 2 UTF-8 bytes, € 3, so these cut with fewer characters than the cap.
  row('STDERR-BVA-02', 'two-byte at cap', `${CAP / 2} two-byte characters (${CAP} bytes): kept buffered`, [['é'.repeat(CAP / 2), '']], NOT_CUT),
  row('STDERR-BVA-02', 'two-byte cap+2', `${CAP / 2 + 1} two-byte characters (${CAP + 2} bytes): cut, no whitespace → only the mark`,
    [['é'.repeat(CAP / 2 + 1), CUT]], '', ['éé']),
  row('STDERR-BVA-02', 'two-byte, space, next chunk', '63 bytes (32 characters) stay; one more ü (65 bytes) cuts after the space',
    [['é'.repeat(5) + ' ' + 'ü'.repeat(26), ''], ['ü', 'é'.repeat(5) + ' ' + CUT]], '', ['üü']),
  row('STDERR-BVA-02', 'three-byte', '21 three-byte characters (63 bytes) stay; 22 (66 bytes) cut', [['€'.repeat(21), ''], ['€', CUT]], '', ['€']),

  // ---------------------------------------------------------------- STDERR-DT-01: what of a cut line is written
  row('STDERR-DT-01', 'secret in the prefix', 'the prefix before the cut is redacted',
    [['password: hunter2 ' + 'z'.repeat(CAP - 17), `password: ${MASK} ` + CUT]], '', ['hunter2', 'zzz']),
  row('STDERR-DT-01', 'secret after the last space', 'a credential after the last whitespace is discarded, not written in any form',
    [[SHORT + 'token=' + 'a'.repeat(CAP + 1 - SHORT.length - 'token='.length), SHORT + CUT], ['lmn' + NL, '']], '', ['token', 'aaa', 'lmn', MASK]),

  // ---------------------------------------------------------------- STDERR-ST-01: normal → discarding → newline → normal → end
  row('STDERR-ST-01', 'discard lasts to the newline', 'later chunks with no newline are discarded too, with no second mark',
    [[sized(CAP + 1), SHORT + CUT], ['y'.repeat(CAP * 2), ''], [' more words', ''], [NL + 'ok' + NL, 'ok' + NL]], '', ['zzz', 'yyy', 'more']),
  row('STDERR-ST-01', 'two cut lines in a row', 'normal → cut → newline → normal → cut → newline → normal → end',
    [['ok1' + NL, 'ok1' + NL], [sized(CAP + 1, 'a'), SHORT + CUT], ['tail1' + NL + 'ok2' + NL, 'ok2' + NL],
      [sized(CAP + 1, 'b'), SHORT + CUT], ['tail2' + NL, ''], ['last', '']], 'last' + NL, ['aaa', 'tail1', 'bbb', 'tail2']),
  row('STDERR-ST-01', 'cut right after a cut', 'a new over-cap line straight after the discarding newline is cut again',
    [[sized(CAP + 1, 'a'), SHORT + CUT], ['x' + NL + sized(CAP + 1, 'b'), SHORT + CUT], [NL, '']], '', ['aaa', 'bbb']),
  row('STDERR-ST-01', 'buffering after a discard', 'text after the discarding newline is buffered normally and written at the end',
    [[sized(CAP + 1), SHORT + CUT], ['gone' + NL + 'kept', '']], 'kept' + NL, ['zzz', 'gone']),
  row('STDERR-ST-01', 'end while discarding', 'the stream ends while discarding: nothing more is written',
    [[sized(CAP + 1), SHORT + CUT], ['more', '']], '', ['zzz', 'more']),
])

/** A line of `bytes` bytes (newline included) ending in the one-digit `n`, for the rotation rows; an odd length starts with KEPT. */
export const line = (n, bytes) => KEPT.repeat(bytes % 2) + words(bytes - 2 - (bytes % 2)) + n + NL
