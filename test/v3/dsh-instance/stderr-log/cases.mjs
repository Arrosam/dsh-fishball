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
import { CAP, F03, F04, HEAP, LOG, MASK, OVERSIZE, SETTLE } from './constants.mjs'
import { CONTINUED } from '../../dsh-connector-shared/redact/constants.mjs'
import v8 from 'node:v8'
import vm from 'node:vm'
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
  registerFixInstanceCases(sdk)
}

// ===================================================================== R-FIX-INSTANCE F03 / F04
/** Write `writes` one chunk each (waiting for nothing between them), end, and settle: the joined log. */
async function logOf(t, writes, cap = CAP) {
  const { root, stream } = await start(t, cap)
  for (const chunk of writes) stream.write(chunk)
  stream.end()
  return joined(await settle(() => files(root), STABLE_ONLY))
}
/** Write `writes` one at a time, letting each settle before the next (a slow child). */
async function slowLogOf(t, writes, cap = CAP) {
  const { root, stream } = await start(t, cap)
  for (const chunk of writes) { stream.write(chunk); await settle(() => files(root), STABLE_ONLY) }
  stream.end()
  return joined(await settle(() => files(root), STABLE_ONLY))
}
const wholeLines = (text) => text.split(LOG.newline).slice(0, -1).map((l) => l + LOG.newline)
/** Wait (up to `ms`) until the joined log satisfies `done`, then until it is stable. */
async function settleLong(root, done, ms) {
  const deadline = Date.now() + ms
  let last = files(root)
  while (!done(joined(last)) && Date.now() < deadline) { await sleep(SETTLE.pollMs); last = files(root) }
  return joined(await settle(() => files(root), STABLE_ONLY))
}
/** The burst line numbers in a log, and whether every gap in them is announced by the drop marker. */
function burstShape(log) {
  const lines = log.split(LOG.newline).slice(0, -1)
  const problems = []
  let previous
  let markerBefore = false
  for (const text of lines) {
    if (text + LOG.newline === F04.marker) { markerBefore = true; continue }
    const match = F04.linePattern.exec(text)
    if (!match) { problems.push('unexpected line ' + show(text)); continue }
    const n = Number(match[1])
    if (previous !== undefined && n <= previous) problems.push(`line ${n} after ${previous} (order)`)
    if (previous !== undefined && n !== previous + 1 && !markerBefore) problems.push(`gap ${previous} → ${n} with no ${show(F04.marker)} before it`)
    if (previous !== undefined && n === previous + 1 && markerBefore) problems.push(`${show(F04.marker)} before ${n} with no gap`)
    previous = n
    markerBefore = false
  }
  return { last: previous, problems, markers: lines.filter((l) => l + LOG.newline === F04.marker).length }
}
const burst = (count, from = 0) => Array.from({ length: count }, (_, i) => F04.line(from + i))
/** Retained memory (heap and external bytes) right after `fn` ran, measured after a full GC. */
function retainedAfter(fn) {
  v8.setFlagsFromString('--expose-gc')
  const gc = vm.runInNewContext('gc')
  gc(); gc()
  const used = () => { const m = process.memoryUsage(); return m.heapUsed + m.external }
  const before = used()
  fn()
  gc(); gc()
  return used() - before
}

function registerFixInstanceCases(sdk) {
  // ---------------------------------------------------------------- F03: masking does not depend on chunking
  caseTest(sdk, 'RFI-F03-LOG', 'probe', `F03 the probe in three writes: the log is exactly ${show(F03.probe.log)} and never holds ${show(F03.probe.secret)}`, async (t) => {
    for (const log of [await logOf(t, F03.probe.writes), await slowLogOf(t, F03.probe.writes)]) {
      assert.equal(log, F03.probe.log)
      assert.equal(log.includes(F03.probe.secret), false)
    }
  })
  for (const r of CONTINUED.texts.filter((x) => !x.openAtEnd)) {
    caseTest(sdk, 'RFI-F03-LOG', r.id, `F03 ${r.title}: one write per line (fast and slow) logs exactly what one write of the whole text logs`, async (t) => {
      const whole = await logOf(t, [r.text])
      assert.equal(whole, r.expected, 'the one-chunk log')
      const lines = wholeLines(r.text)
      for (const [label, log] of [['fast', await logOf(t, lines)], ['slow', await slowLogOf(t, lines)]]) {
        assert.equal(log, whole, label + ' per-line log')
        for (const secret of r.secrets) assert.equal(log.includes(secret), false, `${show(secret)} in the ${label} log`)
      }
    })
  }
  const unbalanced = CONTINUED.texts.find((x) => x.openAtEnd)
  caseTest(sdk, 'RFI-F03-LOG', 'still open', 'F03 a container never closed: one write per line logs what one write does; no later line is written', async (t) => {
    const whole = await logOf(t, [unbalanced.text])
    const lines = wholeLines(unbalanced.text)
    for (const [label, log] of [['fast', await logOf(t, lines)], ['slow', await slowLogOf(t, lines)]]) {
      assert.equal(log, whole, label + ' per-line log')
      for (const secret of unbalanced.secrets) assert.equal(log.includes(secret), false, `${show(secret)} in the ${label} log`)
    }
  })
  caseTest(sdk, 'RFI-F03-LOG', 'open → close', 'F03 open container: lines written inside it add nothing; after it closes the next line is logged', async (t) => {
    const { root, stream } = await start(t, CAP)
    stream.write(F03.open)
    const opened = joined(await settle(() => files(root), STABLE_ONLY))
    for (const text of F03.inside) {
      stream.write(text)
      assert.equal(joined(await settle(() => files(root), STABLE_ONLY)), opened, 'a line inside the open container changed the log')
    }
    stream.write(F03.close)
    stream.write(F03.after)
    stream.end()
    const log = joined(await settle(() => files(root), (f) => joined(f).endsWith(F03.after)))
    assert.equal(log, `token = ${MASK}\n` + F03.after)
  })
  caseTest(sdk, 'RFI-F03-LOG', 'cut while open', `F03 a line over the cap is cut while a container is open: the stream is sealed with one ${show(F03.sealed)} and nothing after it`, async (t) => {
    const { root, stream } = await start(t, CAP)
    for (const chunk of [F03.open, F03.overCap, LOG.newline, ...F03.inside, F03.close, F03.after]) {
      stream.write(chunk)
      await settle(() => files(root), STABLE_ONLY)
    }
    stream.end()
    const log = joined(await settle(() => files(root), STABLE_ONLY))
    assert.ok(log.startsWith('token = ' + MASK), 'the log ' + show(log))
    assert.ok(log.endsWith(F03.sealed), 'the log does not end with the seal: ' + show(log))
    assert.equal(log.split(F03.sealed).length - 1, 1, 'the seal is written once')
    for (const hidden of F03.hidden) assert.equal(log.includes(hidden), false, `${show(hidden)} in ${show(log)}`)
  })
  caseTest(sdk, 'RFI-F03-LOG', 'seal probe', `F03 the fixer's probe (cap ${F03.sealProbe.cap}): a cut whose dropped rest opens a container seals the stream; ${show(F03.sealProbe.secret)} never logged`, async (t) => {
    for (const log of [await logOf(t, F03.sealProbe.writes, F03.sealProbe.cap), await slowLogOf(t, F03.sealProbe.writes, F03.sealProbe.cap)]) {
      assert.equal(log.includes(F03.sealProbe.secret), false, show(log))
      assert.ok(log.endsWith(F03.sealed), 'the log does not end with the seal: ' + show(log))
      assert.equal(log.split(F03.sealed).length - 1, 1, 'the seal is written once')
    }
  })
  caseTest(sdk, 'RFI-F03-LOG', 'plain cut', 'F03 a cut whose dropped rest has no opener does not seal: the next line is logged as usual', async (t) => {
    const log = await slowLogOf(t, F03.plainCut.writes, F03.plainCut.cap)
    assert.equal(log.includes(F03.sealed), false, show(log))
    assert.ok(log.endsWith(LOG.truncated + LOG.newline + F03.plainCut.next), show(log))
  })

  // ---------------------------------------------------------------- F04: the waiting blocks are bounded (one limitBytes)
  const within = F04.limit / Buffer.byteLength(F04.line(0))
  caseTest(sdk, 'RFI-F04', 'within', `F04 a synchronous burst of exactly ${F04.limit} bytes (${within} lines, limit ${F04.limit}): every line written, no ${show(F04.marker)}`, async (t) => {
    const { root, stream } = await start(t, F04.limit)
    const lines = burst(within)
    for (const text of lines) stream.write(text)
    const log = await settleLong(root, (l) => l.endsWith(lines.at(-1)), HEAP.drainMs)
    assert.equal(log, lines.join(''))
  })
  for (const [label, count] of [['over', within * F04.overFactor], ['huge', F04.hugeLines]]) {
    caseTest(sdk, 'RFI-F04', label, `F04 a synchronous burst of ${count} lines (limit ${F04.limit}): logging does not throw; the log ends with the newest line, holds ${show(F04.marker)} before the first line after the gap, and keeps order`, async (t) => {
      const { root, stream } = await start(t, F04.limit)
      const lines = burst(count)
      assert.doesNotThrow(() => { for (const text of lines) stream.write(text) })
      const log = await settleLong(root, (l) => l.endsWith(lines.at(-1)), HEAP.drainMs)
      const shape = burstShape(log)
      assert.deepEqual(shape.problems, [])
      assert.equal(shape.last, count - 1, 'the newest line is the last one logged')
      assert.ok(shape.markers >= 1, 'no ' + show(F04.marker) + ' in ' + show(log))
      // After the burst drained, a later line is logged as usual with no new marker.
      stream.write(F04.later)
      stream.end()
      const after = await settleLong(root, (l) => l.endsWith(F04.later), HEAP.drainMs)
      assert.ok(after.endsWith(lines.at(-1) + F04.later), 'the later line ' + show(after.slice(-80)))
    })
  }
  caseTest(sdk, 'RFI-F04', 'heap', `F04 retained heap after a ${F04.hugeLines}-line burst is within ${HEAP.budgetBytes} bytes of a ${within}-line burst's`, async (t) => {
    const capture = await subject()
    const burstInto = (count) => {
      const root = scratchRoot(t)
      const stream = new PassThrough()
      capture(stream, { root }, F04.limit)
      const lines = burst(count)
      return { root, retained: retainedAfter(() => { for (const text of lines) stream.write(text) }), stream, last: lines.at(-1) }
    }
    const small = burstInto(within)
    const huge = burstInto(F04.hugeLines)
    for (const b of [small, huge]) { b.stream.end(); await settleLong(b.root, (l) => l.endsWith(b.last), HEAP.drainMs) }
    assert.ok(huge.retained - small.retained < HEAP.budgetBytes, `retained ${huge.retained} vs ${small.retained} bytes`)
  })
}
