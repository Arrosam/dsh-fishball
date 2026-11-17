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
 * credential the cut would split (R-FIX-REDACT F4). So the log keeps the line's head through its
 * last whitespace, which ends any bare run there, marks the cut, and drops everything after it up
 * to the line's real newline. A cut inside a quoted value or an Authorization header is still safe:
 * the redactor masks an unterminated one through the end of the head.
 */
const CUT = Object.freeze({ marker: '[truncated]', whitespace: /\s/, notFound: -1 })
const APPEND_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW

/** Append one block, rotating first when it would cross the cap; a block over the cap keeps its tail. */
async function append(file, text, limitBytes) {
  let data = Buffer.from(redact(text))
  if (data.length > limitBytes) data = data.subarray(data.length - limitBytes)
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
 * redacted first; a line over `limitBytes` keeps only its head, ending `[truncated]` (CUT above);
 * the file rotates once to `child-stderr.log.1` at `limitBytes`. Logging never
 * fails the lifecycle: every write error is dropped. The stream is unreferenced like the
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
  const write = (text) => { queue = queue.then(() => append(file, text, limitBytes)).catch(() => {}) }
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
    // An unterminated run is cut at the cap so memory stays bounded too.
    else if (Buffer.byteLength(pending) > limitBytes) {
      // Two blocks: the redactor masks an unterminated quoted or Authorization value through its
      // block's end, which must be the head's end, so the marker is not masked with it.
      write(pending.slice(0, lastWhitespace(pending) + 1))
      write(CUT.marker + NEWLINE)
      pending = ''
      discarding = true
    }
  })
  stream.once('end', () => { if (pending !== '') write(pending + NEWLINE); pending = '' })
  stream.on('error', () => {})
  stream.unref?.()
}
