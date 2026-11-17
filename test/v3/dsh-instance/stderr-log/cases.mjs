/**
 * R-FIX-REDACT black-box cases for `captureChildStderr(stream, paths, limitBytes)` (dsh-instance
 * src/native-runtime/stderr-log.js): line buffering through the redactor, one rotation at the
 * limit, and fix F4's cut of an over-long unterminated buffer. The rows are data in rows.mjs; the
 * case list with techniques is in cases.md.
 *
 * Level: integration over the real module and the real redactor, driven by a synthetic PassThrough
 * (no child process) into a scratch directory under the OS temp dir. Writes are async and queued,
 * so every step waits for the files to reach the expected text and then to stay unchanged
 * (SETTLE): a later, unexpected write still fails the row.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { REPO } from '../../../support/constants.mjs'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { CAP, LOG, OVERSIZE, SETTLE } from './constants.mjs'
import { STDERR_ROWS, line } from './rows.mjs'

const MODULE = path.join(REPO, 'packages', 'dsh-instance', 'src', 'native-runtime', 'stderr-log.js')
const subject = async () => (await import(pathToFileURL(MODULE).href)).captureChildStderr
const show = (v) => JSON.stringify(v.length > 200 ? v.slice(0, 80) + `…(${v.length} chars)…` + v.slice(-80) : v)

/** A scratch runtime root, removed when the test ends (guarded: only a directory this file made). */
function scratchRoot(t) {
  const base = fs.realpathSync(os.tmpdir())
  const root = fs.mkdtempSync(path.join(base, LOG.tempPrefix))
  t.after(() => {
    if (path.dirname(root) !== base || !path.basename(root).startsWith(LOG.tempPrefix)) throw new Error('unexpected temp dir ' + root)
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}
const readOr = (file, missing) => { try { return fs.readFileSync(file, 'utf8') } catch (error) { if (error.code === 'ENOENT') return missing; throw error } }
/** Both files' text, the rotated one first (null for a file that does not exist). */
const files = (root) => ({ rotated: readOr(path.join(root, LOG.rotated), null), current: readOr(path.join(root, LOG.file), null) })
const sameFiles = (a, b) => a.rotated === b.rotated && a.current === b.current

/**
 * Wait until `read()` satisfies `done`, then until it stays the same for SETTLE.stableReads reads;
 * return the last value. A timeout returns what was there, so the caller's assertion shows it.
 */
async function settle(read, done) {
  const deadline = Date.now() + SETTLE.timeoutMs
  let last = read()
  while (!done(last) && Date.now() < deadline) { await sleep(SETTLE.pollMs); last = read() }
  for (let stable = 0; stable < SETTLE.stableReads && Date.now() < deadline;) {
    await sleep(SETTLE.pollMs)
    const now = read()
    stable = sameFiles(now, last) ? stable + 1 : 0
    last = now
  }
  return last
}
/** For a check that expects no change: no target text, only the files staying the same. */
const STABLE_ONLY = () => true
const joined = (f) => (f.rotated ?? '') + (f.current ?? '')

/** A capture over a fresh root and PassThrough. */
async function start(t, limitBytes) {
  const root = scratchRoot(t)
  const stream = new PassThrough()
  ;(await subject())(stream, { root }, limitBytes)
  return { root, stream }
}

/** Feed one row's steps, checking what the log gained after each chunk and at the end. */
async function runRow(t, { cap, steps, atEnd, secrets, files: expectedFiles }) {
  const { root, stream } = await start(t, cap)
  let expected = ''
  const check = async (label, gained) => {
    expected += gained
    const got = await settle(() => files(root), (f) => joined(f) === expected)
    assert.equal(joined(got), expected, `${label}: log ${show(joined(got))}, expected ${show(expected)}`)
    return got
  }
  assert.notEqual((await check('created', '')).current, null, LOG.file + ' is not created at once')
  for (const [index, [chunk, written, dropped = '']] of steps.entries()) {
    assert.ok(expected.startsWith(dropped), 'row slip: dropped text is not the front of the log')
    expected = expected.slice(dropped.length)
    stream.write(chunk)
    await check(`after chunk ${index} ${show(chunk)}`, written)
  }
  stream.end()
  const final = await check('after end', atEnd)
  if (expectedFiles) assert.deepEqual(final, expectedFiles)
  for (const secret of [...secrets, OVERSIZE.replacement]) for (const [name, text] of Object.entries(final)) assert.equal((text ?? '').includes(secret), false, `${show(secret)} in the ${name} file`)
}

/** Feed lines one chunk at a time and settle on the two files (the rotation rows). */
async function feedLines(t, lines, cap = CAP) {
  const { root, stream } = await start(t, cap)
  let written = ''
  for (const text of lines) {
    stream.write(text)
    written += text
    // A rotation drops the older text, so wait on the newest line arriving at the current file's end.
    await settle(() => files(root), (f) => (f.current ?? '').endsWith(text))
  }
  stream.end()
  return settle(() => files(root), STABLE_ONLY)
}

export function registerStderrLogCases(sdk) {
  for (const r of STDERR_ROWS) caseTest(sdk, r.id, r.part, r.title, (t) => runRow(t, r))

  // ---------------------------------------------------------------- STDERR-EP-03: the stream argument and the file at start
  for (const [label, stream] of [['null', null], ['undefined', undefined]]) {
    caseTest(sdk, 'STDERR-EP-03', `${label} stream`, `a ${label} stream is a no-op: no throw, no file`, async (t) => {
      const root = scratchRoot(t)
      const capture = await subject()
      assert.doesNotThrow(() => capture(stream, { root }, CAP))
      const got = await settle(() => files(root), STABLE_ONLY)
      assert.deepEqual(got, { rotated: null, current: null })
    })
  }
  caseTest(sdk, 'STDERR-EP-03', 'missing root', 'errors are swallowed: a root that does not exist throws nothing, now or on write', async (t) => {
    const root = path.join(scratchRoot(t), 'absent')
    const stream = new PassThrough()
    const capture = await subject()
    // An unhandled rejection or an 'error' event without a listener would fail the run, so getting past settle is the check.
    assert.doesNotThrow(() => capture(stream, { root }, CAP))
    assert.doesNotThrow(() => { stream.write('line' + LOG.newline); stream.end() })
    await settle(() => files(root), STABLE_ONLY)
    assert.equal(fs.existsSync(root), false)
  })

  // ---------------------------------------------------------------- STDERR-BVA-03 / ST-02: one rotation at the limit
  const half = (n) => line(n, CAP / 2)
  caseTest(sdk, 'STDERR-BVA-03', 'at the limit', `two ${CAP / 2}-byte lines fill the file to exactly ${CAP} bytes: no rotation`, async (t) => {
    assert.deepEqual(await feedLines(t, [half(1), half(2)]), { rotated: null, current: half(1) + half(2) })
  })
  caseTest(sdk, 'STDERR-BVA-03', 'past the limit', `a third line would pass ${CAP}: the file becomes ${LOG.rotated}, the line starts a new file`, async (t) => {
    assert.deepEqual(await feedLines(t, [half(1), half(2), half(3)]), { rotated: half(1) + half(2), current: half(3) })
  })
  caseTest(sdk, 'STDERR-BVA-03', 'one byte past', `two ${CAP / 2 + 1}-byte lines (${CAP + 2} bytes): the second rotates the first`, async (t) => {
    const big = (n) => line(n, CAP / 2 + 1)
    assert.deepEqual(await feedLines(t, [big(1), big(2)]), { rotated: big(1), current: big(2) })
  })
  caseTest(sdk, 'STDERR-ST-02', 'second rotation', `one rotation only: a second one replaces ${LOG.rotated}`, async (t) => {
    assert.deepEqual(await feedLines(t, [1, 2, 3, 4, 5].map(half)), { rotated: half(3) + half(4), current: half(5) })
  })
}
