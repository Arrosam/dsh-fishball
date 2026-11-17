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
import { CAP, F4, LOG, MASK, OVERSIZE, REVIEW_PROBE, fill, words } from './constants.mjs'

const NL = LOG.newline
const CUT = LOG.truncated + NL
/** A row; `secrets` must be absent from both files at the end. */
const row = (id, part, title, steps, atEnd, secrets = [], cap = CAP) => Object.freeze({ id, part, title, cap, steps: Object.freeze(steps), atEnd, secrets: Object.freeze(secrets) })
/**
 * A step is `[chunk, written]`, or `[chunk, written, dropped]` when the step's write rotates a second
 * time: `dropped` (the old `.1`) leaves the front of the log.
 */
/** A row that also names each file exactly at the end (where a rotation splits the log). */
const withFiles = (r, rotated, current) => Object.freeze({ ...r, files: Object.freeze({ rotated, current }) })

/** A short whitespace-ended prefix no redaction rule matches. */
const SHORT = words(10)
/**
 * SHORT, then the one-byte `tail` repeated to a text of exactly `bytes` bytes. A letter tail is a
 * 32+ opaque run (masked when written), so rows whose text is written whole use KEPT, `.`, which
 * splits runs and matches no rule.
 */
const sized = (bytes, tail = 'z') => SHORT + tail.repeat(bytes - SHORT.length)
const KEPT = '.'
/** A line of `bytes` bytes (newline included) ending in the one-digit `n`, for the rotation rows; an odd length starts with KEPT. */
export const line = (n, bytes) => KEPT.repeat(bytes % 2) + words(bytes - 2 - (bytes % 2)) + n + NL

const F4_CHUNKS = Object.freeze([F4.fillUnit.repeat(F4.fillRepeat) + ' ' + F4.token.slice(0, F4.splitAt), F4.token.slice(F4.splitAt) + NL])
/** The prefix up to and including the last whitespace (the fill and the extra space; no rule matches it). */
const F4_PREFIX = F4.fillUnit.repeat(F4.fillRepeat) + ' '
const F4_SECRETS = Object.freeze([F4.token.slice(0, F4.splitAt), F4.token.slice(F4.splitAt)])

/** The probe's line, 'w0 w1 w2 …', cut to its length and split into equal writes. */
const PROBE_LINE = Array.from({ length: REVIEW_PROBE.lineChars }, (_, i) => 'w' + i + ' ').join('').slice(0, REVIEW_PROBE.lineChars)
const PROBE_WRITES = Object.freeze(Array.from({ length: REVIEW_PROBE.writes }, (_, i) => PROBE_LINE.slice(i * REVIEW_PROBE.lineChars / REVIEW_PROBE.writes, (i + 1) * REVIEW_PROBE.lineChars / REVIEW_PROBE.writes)))
/** The refined cut's head applied by hand: the first (cap − mark) bytes (ASCII here), cut after their last space. */
const PROBE_PREFIX = PROBE_LINE.slice(0, F4.cap - OVERSIZE.markBytes)
const PROBE_HEAD = PROBE_PREFIX.slice(0, PROBE_PREFIX.lastIndexOf(' ') + 1)

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
  // At the cap the end writes cap + 1 bytes (text and newline): the head that fits beside the mark, then the mark.
  row('STDERR-BVA-01', 'cap', `${CAP} buffered bytes: never force-flushed; the ${CAP + 1}-byte final write keeps its ${CAP - OVERSIZE.markBytes}-byte head and the mark`,
    [[sized(CAP, KEPT), '']], sized(CAP - OVERSIZE.markBytes, KEPT) + CUT),
  row('STDERR-BVA-01', 'cap+1', `${CAP + 1} buffered bytes: the prefix to the last whitespace, then the mark; the end adds nothing`,
    [[sized(CAP + 1), SHORT + CUT]], '', ['zzz']),
  row('STDERR-BVA-01', 'cap over chunks, then +1', 'cap bytes over two chunks stay buffered; one more byte cuts',
    [[sized(CAP / 2), ''], ['z'.repeat(CAP / 2), ''], ['q', SHORT + CUT]], '', ['zzz', 'q']),
  row('STDERR-BVA-01', 'cap+1, no whitespace', 'no whitespace at all: only the mark', [['z'.repeat(CAP + 1), CUT]], '', ['zzz']),
  row('STDERR-BVA-01', 'cap+1, whitespace first', 'only the leading whitespace survives', [[' ' + 'z'.repeat(CAP), ' ' + CUT]], '', ['zzz']),
  row('STDERR-BVA-01', 'cap+1, tab is whitespace', 'a tab is a whitespace character to cut at',
    [[fill('w', 10) + '\t' + 'z'.repeat(CAP - 10), fill('w', 10) + '\t' + CUT]], '', ['zzz']),
  // Bytes, not characters: é and ü are 2 UTF-8 bytes, € 3, so these cut with fewer characters than the cap.
  row('STDERR-BVA-02', 'two-byte at cap', `${CAP / 2} two-byte characters (${CAP} bytes): kept buffered; the final write is 26 of them and the mark (${CAP} bytes)`,
    [['é'.repeat(CAP / 2), '']], 'é'.repeat(26) + CUT),
  row('STDERR-BVA-02', 'two-byte cap+2', `${CAP / 2 + 1} two-byte characters (${CAP + 2} bytes): cut, no whitespace → only the mark`,
    [['é'.repeat(CAP / 2 + 1), CUT]], '', ['éé']),
  row('STDERR-BVA-02', 'two-byte, space, next chunk', '63 bytes (32 characters) stay; one more ü (65 bytes) cuts after the space',
    [['é'.repeat(5) + ' ' + 'ü'.repeat(26), ''], ['ü', 'é'.repeat(5) + ' ' + CUT]], '', ['üü']),
  row('STDERR-BVA-02', 'three-byte', '21 three-byte characters (63 bytes) stay; 22 (66 bytes) cut', [['€'.repeat(21), ''], ['€', CUT]], '', ['€']),

  // ---------------------------------------------------------------- STDERR-BVA-06: the refined cut (the review, 2026-11-18)
  // The head is the first (limit − mark) bytes on a character boundary, cut after that prefix's last
  // whitespace, redacted on its own, cut again if redaction lengthened it; head and mark are one write.
  row('STDERR-BVA-06', 'remainder after a newline', 'the cut fires on what follows a newline in the same chunk',
    [['ok' + NL + sized(CAP + 1), 'ok' + NL + SHORT + CUT]], '', ['zzz']),
  row('STDERR-BVA-06', 'whitespace past the head prefix', `a whitespace after the first ${CAP - OVERSIZE.markBytes} bytes is not a cut point`,
    [['a b' + 'z'.repeat(CAP - OVERSIZE.markBytes - 3) + 'zzz ' + 'y'.repeat(9), 'a ' + CUT]], '', ['zzz', 'yyy']),
  row('STDERR-BVA-06', 'whitespace at the last prefix byte', `whitespace at byte ${CAP - OVERSIZE.markBytes}: the head is the whole prefix (${CAP} bytes with the mark)`,
    [[KEPT.repeat(CAP - OVERSIZE.markBytes - 1) + ' ' + 'z'.repeat(OVERSIZE.markBytes + 1), KEPT.repeat(CAP - OVERSIZE.markBytes - 1) + ' ' + CUT]], '', ['zzz']),
  row('STDERR-BVA-06', 'whitespace one past the prefix', `whitespace at byte ${CAP - OVERSIZE.markBytes + 1}: no whitespace in the prefix, only the mark`,
    [[KEPT.repeat(CAP - OVERSIZE.markBytes) + ' ' + 'z'.repeat(OVERSIZE.markBytes), CUT]], '', ['zzz', KEPT.repeat(4)]),
  row('STDERR-BVA-06', 'prefix ends mid character', 'two-byte text across the prefix end: cut at the last whitespace, no partial character',
    [[KEPT.repeat(10) + ' ' + 'é'.repeat(27), KEPT.repeat(10) + ' ' + CUT]], '', ['éé']),
  // cap 30: an 18-byte head 'key=a key=a key=a ' redacts to 45 bytes, so it is cut again to 18 bytes.
  row('STDERR-BVA-06', 'redaction lengthens the head', 'the redacted head is cut again so head and mark fit the limit',
    [['key=a key=a key=a ' + 'z'.repeat(13), `key=${MASK} key` + CUT]], '', ['zzz'], 30),
  row('STDERR-BVA-06', 'second cut mid character', 'the second cut backs off to a character boundary too',
    [['key=a éé ' + 'z'.repeat(20), `key=${MASK} é` + CUT]], '', ['zzz'], 30),
  // The review's cap-40 probe: the head 'abc password="x y ' redacts to an unterminated quoted value (24 bytes).
  withFiles(row('STDERR-BVA-06', 'review probe, cap 40', 'the head is redacted on its own; the next line rotates head and mark together',
    [['abc password="x y zzzzzz', ''], ['z'.repeat(58), 'abc password="' + MASK + CUT], ['more' + NL + 'next' + NL, 'next' + NL]], '', ['x y', 'zzz', 'more'], 40),
  'abc password="' + MASK + CUT, 'next' + NL),
  // Earlier 50 bytes + the 10-byte head fit; with the mark they do not: one write rotates, so head and mark share a file.
  withFiles(row('STDERR-BVA-06', 'head and mark rotate together', 'head and mark are one write: they rotate together and sit in the same file',
    [[line(1, 50), line(1, 50)], [sized(CAP + 1), SHORT + CUT]], '', ['zzz']), line(1, 50), SHORT + CUT),
  // The probe at F4's cap: head + mark (one write) rotates the earlier lines out; `after` then rotates again (one rotation kept).
  withFiles(row('STDERR-BVA-06', 'review probe, cap 65536', 'a 131072-character line: head and mark rotate together, then the next line rotates them whole into .1',
    [...REVIEW_PROBE.earlier.map((text) => [text, text]), [PROBE_WRITES[0], ''], [PROBE_WRITES[1], PROBE_HEAD + CUT], [NL + REVIEW_PROBE.after, REVIEW_PROBE.after, REVIEW_PROBE.earlier.join('')]],
    '', [PROBE_LINE.slice(PROBE_HEAD.length, PROBE_HEAD.length + 16)], F4.cap), PROBE_HEAD + CUT, REVIEW_PROBE.after),

  // ---------------------------------------------------------------- STDERR-BVA-04: a final write larger than the limit (the user's rule 2)
  row('STDERR-BVA-04', 'head cut mid two-byte', 'the head backs off to a character boundary (51 of 52 bytes)',
    [['w' + 'é'.repeat(31) + 'w', '']], 'w' + 'é'.repeat(25) + CUT),
  row('STDERR-BVA-04', 'head cut mid four-byte', 'the head backs off to a character boundary (50 of 52 bytes)',
    [['ww' + '😀'.repeat(15) + 'ww', '']], 'ww' + '😀'.repeat(12) + CUT),
  row('STDERR-BVA-04', `limit ${OVERSIZE.markBytes + 1}`, `a ${OVERSIZE.markBytes + 1}-byte limit: a one-byte head and the mark`,
    [['abcdefghijklm', '']], 'a' + CUT, [], OVERSIZE.markBytes + 1),
  row('STDERR-BVA-04', `limit ${OVERSIZE.markBytes}`, `a ${OVERSIZE.markBytes}-byte limit: no room for a head, only the mark`,
    [['abcdefghijkl', '']], CUT, [], OVERSIZE.markBytes),
  row('STDERR-BVA-04', `limit ${OVERSIZE.markBytes - 1}`, `a limit below the mark (${OVERSIZE.markBytes - 1}): the final write is exactly the mark`,
    [['abcdefghijk', '']], CUT, [], OVERSIZE.markBytes - 1),
  row('STDERR-BVA-04', 'limit 4, two-byte', 'limit 4, "éé" (at the cap) then the end: exactly the mark', [['éé', '']], CUT, [], 4),
  row('STDERR-BVA-04', 'limit 4, over the cap', 'limit 4, "ééé" then the end: exactly the mark (the F4 cut, no whitespace)', [['ééé', CUT]], '', ['é'], 4),

  // ---------------------------------------------------------------- STDERR-BVA-05: a newline-terminated block larger than the limit (the user's rule 3)
  row('STDERR-BVA-05', 'block at the limit', `a ${CAP}-byte line in one chunk is written whole`, [[words(CAP - 2) + 'x' + NL, words(CAP - 2) + 'x' + NL]], ''),
  row('STDERR-BVA-05', 'block one past', `a ${CAP + 1}-byte line keeps its last ${CAP} bytes`,
    [['y' + words(CAP - 2) + 'x' + NL, words(CAP - 2) + 'x' + NL]], '', ['y']),
  row('STDERR-BVA-05', 'three-byte block', '30 three-byte characters and a newline in one chunk: the last 21 and the newline (64 bytes)',
    [['€'.repeat(30) + NL, '€'.repeat(21) + NL]], ''),
  row('STDERR-BVA-05', 'two-byte block, mid character', '40 two-byte characters and a newline: the tail starts on a boundary (31 of them, 63 bytes)',
    [['é'.repeat(40) + NL, 'é'.repeat(31) + NL]], ''),
  row('STDERR-BVA-05', 'ascii block', 'a 105-byte line keeps its newest 64 bytes',
    [['head ' + words(96) + 'end' + NL, ('head ' + words(96) + 'end' + NL).slice(-CAP)]], '', ['head']),
  row('STDERR-BVA-05', 'over the limit before redaction only', 'the limit applies after redaction: a masked line that fits is written whole',
    [['api_key: ' + 'a.'.repeat(40) + NL, `api_key: ${MASK}` + NL]], '', ['a.a.']),

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

