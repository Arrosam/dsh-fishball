/**
 * captureChildStderr (src/native-runtime/stderr-log.js): line buffering through the redactor, one
 * rotation at the limit, fix F4's cut of an over-long unterminated buffer, the F03 seal and the F04
 * bound. The requirement table is README.md beside this file; the rows are data in rows.mjs.
 *
 * Techniques: use case (F4's report), EP (buffering, end of stream, the stream argument), BVA (cap,
 * UTF-8 bytes, the refined head, the final write, a terminated block, the rotation limit), decision
 * table (where a secret sits relative to the cut), state transitions (discarding; rotations).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import v8 from 'node:v8'
import vm from 'node:vm'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { showClipped as show } from '@dsh-instance/test-helpers/json'
import { settled, untilQuiet as until } from '@dsh-instance/test-helpers/wait'
import { importInstance } from '../support/instance.mjs'
import { CAP, CONTINUED, F03, F04, LOG, MASK, OVERSIZE } from './constants.mjs'
import { STDERR_ROWS, line } from './rows.mjs'

const readOr = (file) => { try { return fs.readFileSync(file, 'utf8') } catch (error) { if (error.code === 'ENOENT') return null; throw error } }
/** Both files' text, the rotated one first (null for a file that does not exist). */
const files = (root) => ({ rotated: readOr(path.join(root, LOG.rotated)), current: readOr(path.join(root, LOG.file)) })
const joined = (f) => (f.rotated ?? '') + (f.current ?? '')
const logNow = async (root) => { await settled(); return files(root) }

eachSdk((sdk) => {
  const capture = async () => (await importInstance(sdk, 'src/native-runtime/stderr-log.js')).captureChildStderr
  const scratch = (t) => tempRoot(cleanups(t), LOG.tempPrefix)
  async function start(t, limitBytes) {
    const root = scratch(t)
    const stream = new PassThrough()
    ;(await capture())(stream, { root }, limitBytes)
    return { root, stream }
  }

  /** Feed one row's steps, checking exactly what the log gained after each chunk and at the end. */
  async function runRow(t, { cap, steps, atEnd, secrets, files: expectedFiles }) {
    const { root, stream } = await start(t, cap)
    let expected = ''
    const check = async (label, gained) => {
      expected += gained
      const got = await logNow(root)
      assert.equal(joined(got), expected, label + ': log ' + show(joined(got)) + ', expected ' + show(expected))
      return got
    }
    assert.notEqual((await check('created', '')).current, null, LOG.file + ' is not created at once')
    for (const [index, [chunk, written, dropped = '']] of steps.entries()) {
      expected = expected.slice(dropped.length)
      stream.write(chunk)
      await check('after chunk ' + index + ' ' + show(chunk), written)
    }
    stream.end()
    const final = await check('after end', atEnd)
    if (expectedFiles) assert.deepEqual(final, expectedFiles)
    for (const secret of [...secrets, OVERSIZE.replacement]) for (const [name, text] of Object.entries(final)) assert.equal((text ?? '').includes(secret), false, show(secret) + ' in the ' + name + ' file')
  }
  for (const r of STDERR_ROWS) caseTest(sdk, r.id, r.part, r.title, (t) => runRow(t, r))

  // ---------------------------------------------------------------- STDERR-EP-03: the stream argument; errors swallowed
  for (const [label, stream] of [['null', null], ['undefined', undefined]]) {
    caseTest(sdk, 'STDERR-EP-03', label + ' stream', 'a ' + label + ' stream is a no-op: no throw, no file', async (t) => {
      const root = scratch(t)
      const run = await capture()
      assert.doesNotThrow(() => run(stream, { root }, CAP))
      assert.deepEqual(await logNow(root), { rotated: null, current: null })
    })
  }
  caseTest(sdk, 'STDERR-EP-03', 'missing root', 'errors are swallowed: a root that does not exist throws nothing, now or on write', async (t) => {
    const root = path.join(scratch(t), 'absent')
    const stream = new PassThrough()
    const run = await capture()
    // An unhandled rejection or an unlistened 'error' would fail the run, so settling is the check.
    assert.doesNotThrow(() => run(stream, { root }, CAP))
    assert.doesNotThrow(() => { stream.write('line' + LOG.newline); stream.end() })
    await settled()
    assert.equal(fs.existsSync(root), false)
  })

  // ---------------------------------------------------------------- STDERR-BVA-03 / ST-02: one rotation at the limit
  async function feedLines(t, lines) {
    const { root, stream } = await start(t, CAP)
    for (const text of lines) { stream.write(text); await settled() }
    stream.end()
    return logNow(root)
  }
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

  // ---------------------------------------------------------------- RFI-F03-LOG: masking does not depend on chunking
  /** Write `writes` at once (a fast child), end, and settle: the joined log. */
  async function logOf(t, writes, cap = CAP) {
    const { root, stream } = await start(t, cap)
    for (const chunk of writes) stream.write(chunk)
    stream.end()
    return joined(await logNow(root))
  }
  /** Write `writes` one at a time, each settling before the next (a slow child). */
  async function slowLogOf(t, writes, cap = CAP) {
    const { root, stream } = await start(t, cap)
    for (const chunk of writes) { stream.write(chunk); await settled() }
    stream.end()
    return joined(await logNow(root))
  }
  const wholeLines = (text) => text.split(LOG.newline).slice(0, -1).map((l) => l + LOG.newline)

  caseTest(sdk, 'RFI-F03-LOG', 'probe', `F03 the probe in three writes: the log is exactly ${show(F03.probe.log)} and never holds ${show(F03.probe.secret)}`, async (t) => {
    for (const log of [await logOf(t, F03.probe.writes), await slowLogOf(t, F03.probe.writes)]) {
      assert.equal(log, F03.probe.log)
      assert.equal(log.includes(F03.probe.secret), false)
    }
  })
  for (const r of CONTINUED.filter((x) => !x.openAtEnd)) {
    caseTest(sdk, 'RFI-F03-LOG', r.id, `F03 ${r.title}: one write per line (fast and slow) logs exactly what one write of the whole text logs`, async (t) => {
      const whole = await logOf(t, [r.text])
      assert.equal(whole, r.expected, 'the one-chunk log')
      for (const [label, log] of [['fast', await logOf(t, wholeLines(r.text))], ['slow', await slowLogOf(t, wholeLines(r.text))]]) {
        assert.equal(log, whole, label + ' per-line log')
        for (const secret of r.secrets) assert.equal(log.includes(secret), false, show(secret) + ' in the ' + label + ' log')
      }
    })
  }
  const unbalanced = CONTINUED.find((x) => x.openAtEnd)
  caseTest(sdk, 'RFI-F03-LOG', 'still open', 'F03 a container never closed: one write per line logs what one write does; no later line is written', async (t) => {
    const whole = await logOf(t, [unbalanced.text])
    assert.equal(whole, unbalanced.expected, 'the one-chunk log')
    for (const [label, log] of [['fast', await logOf(t, wholeLines(unbalanced.text))], ['slow', await slowLogOf(t, wholeLines(unbalanced.text))]]) {
      assert.equal(log, whole, label + ' per-line log')
      for (const secret of unbalanced.secrets) assert.equal(log.includes(secret), false, show(secret) + ' in the ' + label + ' log')
    }
  })
  caseTest(sdk, 'RFI-F03-LOG', 'open → close', 'F03 open container: lines written inside it add nothing; after it closes the next line is logged', async (t) => {
    const { root, stream } = await start(t, CAP)
    stream.write(F03.open)
    const opened = joined(await logNow(root))
    for (const text of F03.inside) {
      stream.write(text)
      assert.equal(joined(await logNow(root)), opened, 'a line inside the open container changed the log')
    }
    stream.write(F03.close)
    stream.write(F03.after)
    stream.end()
    assert.equal(joined(await logNow(root)), `token = ${MASK}\n` + F03.after)
  })
  caseTest(sdk, 'RFI-F03-LOG', 'cut while open', `F03 a line over the cap is cut while a container is open: the stream is sealed with one ${show(F03.sealed)} and nothing after it`, async (t) => {
    const log = await slowLogOf(t, [F03.open, F03.overCap, LOG.newline, ...F03.inside, F03.close, F03.after])
    assert.ok(log.startsWith('token = ' + MASK), 'the log ' + show(log))
    assert.ok(log.endsWith(F03.sealed), 'the log does not end with the seal: ' + show(log))
    assert.equal(log.split(F03.sealed).length - 1, 1, 'the seal is written once')
    for (const hidden of F03.hidden) assert.equal(log.includes(hidden), false, show(hidden) + ' in ' + show(log))
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

  // ---------------------------------------------------------------- RFI-F04: the waiting blocks are bounded
  /** The burst line numbers of a log and whether every gap is announced by the drop marker. */
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
      if (previous !== undefined && n !== previous + 1 && !markerBefore) problems.push(`gap ${previous} → ${n} with no marker before it`)
      if (previous !== undefined && n === previous + 1 && markerBefore) problems.push(`marker before ${n} with no gap`)
      previous = n
      markerBefore = false
    }
    return { last: previous, problems, markers: lines.filter((l) => l + LOG.newline === F04.marker).length }
  }
  const burst = (count) => Array.from({ length: count }, (_, i) => F04.line(i))
  const within = F04.limit / Buffer.byteLength(F04.line(0))
  caseTest(sdk, 'RFI-F04', 'within', `F04 a synchronous burst of exactly ${F04.limit} bytes (${within} lines, limit ${F04.limit}): every line written, no ${show(F04.marker)}`, async (t) => {
    const { root, stream } = await start(t, F04.limit)
    const lines = burst(within)
    for (const text of lines) stream.write(text)
    await until(() => joined(files(root)).endsWith(lines.at(-1)))
    assert.equal(joined(files(root)), lines.join(''))
  })
  for (const [label, count] of [['over', within * F04.overFactor], ['huge', F04.hugeLines]]) {
    caseTest(sdk, 'RFI-F04', label, `F04 a synchronous burst of ${count} lines (limit ${F04.limit}): logging does not throw; the log ends with the newest line, holds ${show(F04.marker)} before the first line after the gap, and keeps order`, async (t) => {
      const { root, stream } = await start(t, F04.limit)
      const lines = burst(count)
      assert.doesNotThrow(() => { for (const text of lines) stream.write(text) })
      await until(() => joined(files(root)).endsWith(lines.at(-1)))
      const shape = burstShape(joined(files(root)))
      assert.deepEqual(shape.problems, [])
      assert.equal(shape.last, count - 1, 'the newest line is the last one logged')
      assert.ok(shape.markers >= 1, 'no drop marker')
      // After the burst drained, a later line is logged as usual with no new marker.
      stream.write(F04.later)
      stream.end()
      await until(() => joined(files(root)).endsWith(F04.later))
      assert.ok(joined(files(root)).endsWith(lines.at(-1) + F04.later), 'the later line')
    })
  }
  caseTest(sdk, 'RFI-F04', 'heap', `F04 retained heap after a ${F04.hugeLines}-line burst is within ${F04.heapBudgetBytes} bytes of a ${within}-line burst's`, async (t) => {
    const run = await capture()
    v8.setFlagsFromString('--expose-gc')
    const gc = vm.runInNewContext('gc')
    const used = () => { const m = process.memoryUsage(); return m.heapUsed + m.external }
    const burstInto = (count) => {
      const root = scratch(t)
      const stream = new PassThrough()
      run(stream, { root }, F04.limit)
      const lines = burst(count)
      gc(); gc()
      const before = used()
      for (const text of lines) stream.write(text)
      gc(); gc()
      return { root, stream, retained: used() - before, last: lines.at(-1) }
    }
    const small = burstInto(within)
    const huge = burstInto(F04.hugeLines)
    for (const b of [small, huge]) { b.stream.end(); await until(() => joined(files(b.root)).endsWith(b.last)) }
    assert.ok(huge.retained - small.retained < F04.heapBudgetBytes, `retained ${huge.retained} vs ${small.retained} bytes`)
  })
})
