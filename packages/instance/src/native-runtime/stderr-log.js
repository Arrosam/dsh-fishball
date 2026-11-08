import path from 'node:path'
import { constants } from 'node:fs'
import { open, rename } from 'node:fs/promises'
import { RUNTIME } from './constants.js'
import { exists } from './files.js'

/**
 * Secret shapes masked before a line reaches disk. The child never prints its bearer or the
 * control secret on purpose; these are defence in depth for a library or crash that prints one:
 * an Authorization value, a key/token/secret/password assignment, and any long opaque run (the
 * bearer and the control secret are 64 hex characters, API keys are long word runs). The run
 * excludes '/' and '.' so file paths in stack traces stay readable.
 */
const REDACTION = Object.freeze([
  Object.freeze({ pattern: /\bbearer\s+[^\s"',;]+/gi, replacement: 'Bearer [redacted]' }),
  Object.freeze({ pattern: /\b(token|key|secret|password|credential|authorization)(s?["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi, replacement: '$1$2[redacted]' }),
  Object.freeze({ pattern: /[A-Za-z0-9_+=-]{32,}/g, replacement: '[redacted]' }),
])
const NEWLINE = '\n'
const APPEND_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW

/** Mask the secret shapes above; also used for provider-sync failure diagnostics (src/provider-sync-host.js). */
export function redact(text) {
  return REDACTION.reduce((value, { pattern, replacement }) => value.replace(pattern, replacement), text)
}

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

/**
 * Copy the child's stderr into `<runtime root>/child-stderr.log` (B6) so a child that fails to
 * mount a row is diagnosable without instrumenting code. Whole lines are written in order and
 * redacted first; the file rotates once to `child-stderr.log.1` at `limitBytes`. Logging never
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
  let firstLine
  let queue = Promise.resolve()
  const write = (text) => { queue = queue.then(() => append(file, text, limitBytes)).catch(() => {}) }
  // Create the file at spawn, so its path exists even while a healthy child writes nothing.
  write('')
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    // Retain only one bounded line in memory for failed startup; the public boundary sanitizes it.
    if (firstLine === undefined && pending.includes(NEWLINE)) firstLine = pending.slice(0, pending.lastIndexOf(NEWLINE)).split(NEWLINE).find(line => line.trim())?.slice(0, limitBytes)
    const end = pending.lastIndexOf(NEWLINE)
    if (end >= 0) { write(pending.slice(0, end + 1)); pending = pending.slice(end + 1) }
    // An unterminated run is flushed at the cap so memory stays bounded too.
    else if (Buffer.byteLength(pending) > limitBytes) { firstLine ??= pending.slice(0, limitBytes); write(pending + NEWLINE); pending = '' }
  })
  stream.once('end', () => { firstLine ??= pending.slice(0, limitBytes); if (pending !== '') write(pending + NEWLINE); pending = '' })
  stream.on('error', () => {})
  stream.unref?.()
  return () => firstLine ?? pending.slice(0, limitBytes)
}
