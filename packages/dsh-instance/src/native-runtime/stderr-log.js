import path from 'node:path'
import { constants } from 'node:fs'
import { open, rename } from 'node:fs/promises'
import { RUNTIME } from './constants.js'
import { exists } from './files.js'
// The same masking as the main host's provider-sync host adapter (dsh-connector-shared, R-ARCH-08).
import { redact } from 'dsh-connector-shared/redact'

const NEWLINE = '\n'
/**
 * A line longer than the cap cannot be held until its newline, and redaction cannot see a
 * credential the cut would split (R-FIX-REDACT F4). So the log keeps the line's head (its first
 * bytes, so head and mark fit one file) through its last whitespace, which ends any bare run there,
 * marks the cut, and drops everything after it up to the line's real newline. A cut inside a quoted
 * value or an Authorization header is still safe: the head is redacted alone, so the redactor masks
 * an unterminated one through the head's end.
 */
const CUT = Object.freeze({ marker: '[truncated]', whitespace: /\s/, notFound: -1 })
const APPEND_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW
/** A UTF-8 continuation byte is 10xxxxxx: a cut before one would split a character. */
const UTF8 = Object.freeze({ continuationMask: 0xc0, continuation: 0x80 })
const CUT_LINE = Buffer.from(CUT.marker + NEWLINE)

const isContinuation = (data, at) => (data[at] & UTF8.continuationMask) === UTF8.continuation

/** The byte length of data's first at most `bytes` bytes, backed off to a character boundary. */
function headLength(data, bytes) {
  let end = Math.min(Math.max(bytes, 0), data.length)
  while (end > 0 && isContinuation(data, end)) end--
  return end
}

/** A block over the cap keeps its last bytes from a character boundary: the newest lines survive. */
function keepTail(data, limitBytes) {
  if (data.length <= limitBytes) return data
  let start = data.length - limitBytes
  while (start < data.length && isContinuation(data, start)) start++
  return data.subarray(start)
}

/**
 * Data's head on a character boundary, then the cut line, together within the cap. A cap smaller
 * than the cut line itself (12 bytes; the runtime's is 64 KiB) keeps the whole cut line, the one
 * write allowed past the cap, so the file says it was cut rather than holding a broken fragment.
 */
const markCut = (data, limitBytes) => Buffer.concat([
  data.subarray(0, headLength(data, limitBytes - CUT_LINE.length)), CUT_LINE,
])

/** The stream's final unterminated line keeps its head and is marked cut only when over the cap. */
const keepHead = (data, limitBytes) => (data.length <= limitBytes ? data : markCut(data, limitBytes))

/**
 * Append one block, rotating first when it would cross the cap. The block is redacted whole before
 * any cut, so a cut never exposes what the redactor would mask; `fit` then bounds it (keepTail,
 * keepHead or markCut) and so one block rotates the file at most once.
 */
async function append(file, text, limitBytes, fit) {
  const data = fit(Buffer.from(redact(text)), limitBytes)
  const size = (await exists(file))?.size ?? 0
  if (size > 0 && size + data.length > limitBytes) await rename(file, file + RUNTIME.rotatedLogSuffix)
  // O_NOFOLLOW: the runtime root is private, but a planted link must never redirect the log.
  const handle = await open(file, APPEND_FLAGS, RUNTIME.privateFileMode)
  try { await handle.write(data) } finally { await handle.close() }
}

/** The index of the text's last whitespace character, or -1. A backward scan stays linear on a long run. */
function lastWhitespace(text) {
  let at = text.length - 1
  while (at >= 0 && !CUT.whitespace.test(text[at])) at--
  return at
}

/**
 * Copy the child's stderr into `<runtime root>/child-stderr.log` (B6) so a child that fails to
 * mount a row is diagnosable without instrumenting code. Whole lines are written in order and
 * redacted first; a line over `limitBytes` keeps only its head, ending `[truncated]` (CUT above),
 * and no cut ever splits a UTF-8 character; the file rotates once to `child-stderr.log.1` at
 * `limitBytes`. Logging never fails the lifecycle: every write error is dropped. The stream is unreferenced like the
 * lifetime pipe, so it never keeps the main DSH alive.
 *
 * @param {import('node:stream').Readable | null | undefined} stream - the spawned child's stderr.
 * @param {{ root: string }} paths - the runtime layout (files.js pathsFor).
 * @param {number} limitBytes - the size cap of one file.
 */
export function captureChildStderr(stream, paths, limitBytes) {
  if (!stream) return
  const file = path.join(paths.root, RUNTIME.stderrLog)
  let pending = ''
  // True from a cut until the cut line's real newline: that text is dropped, never logged.
  let discarding = false
  let queue = Promise.resolve()
  const write = (text, fit = keepTail) => { queue = queue.then(() => append(file, text, limitBytes, fit)).catch(() => {}) }
  // Create the file at spawn, so its path exists even while a healthy child writes nothing.
  write('')
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    if (discarding) {
      const lineEnd = chunk.indexOf(NEWLINE)
      if (lineEnd === CUT.notFound) return
      discarding = false
      chunk = chunk.slice(lineEnd + NEWLINE.length)
    }
    pending += chunk
    const end = pending.lastIndexOf(NEWLINE)
    if (end >= 0) { write(pending.slice(0, end + 1)); pending = pending.slice(end + 1) }
    // An unterminated run is cut at the cap so memory stays bounded too, also when it follows a
    // newline in the same chunk.
    if (Buffer.byteLength(pending) > limitBytes) {
      const bytes = Buffer.from(pending)
      // Choose the whitespace within the bytes that can fit beside the mark, so the head kept is
      // the line's start; markCut adds the mark after redaction, so it is never masked with an
      // unterminated value, and bounds the head again if a mask lengthened it.
      const head = bytes.subarray(0, headLength(bytes, limitBytes - CUT_LINE.length)).toString()
      write(head.slice(0, lastWhitespace(head) + 1), markCut)
      pending = ''
      discarding = true
    }
  })
  // At most the cap is pending, but its newline, or a mask longer than the value it hides, can
  // still make this write larger than the whole file: keep its head and mark the cut.
  stream.once('end', () => { if (pending !== '') write(pending + NEWLINE, keepHead); pending = '' })
  stream.on('error', () => {})
  stream.unref?.()
}
