/**
 * R-FIX-REDACT black-box cases for `redact(text)` (dsh-connector-shared/redact). Every row is a
 * requirement row in constants.mjs (REDACT_ROWS); this file checks each one three ways: the exact
 * output, every planted secret absent from it, and idempotence (`redact(redact(x)) === redact(x)`).
 * Purity rows check statelessness across calls. The case list with techniques is in cases.md.
 *
 * Level: unit (the library module loaded on its own; it imports nothing from the SDK, so both SDK
 * entry files run the same module).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'dsh-connector-test-helpers/cases'
import { performance } from 'node:perf_hooks'
import { CONTINUED, PERF, REDACT_ROWS } from './constants.mjs'

const subject = async () => (await import('dsh-connector-shared/redact')).redact
/** R-FIX-INSTANCE F03's new export; a missing export fails the row with its name. */
const continuedSubject = async () => {
  const fn = (await import('dsh-connector-shared/redact')).redactContinued
  assert.equal(typeof fn, 'function', 'dsh-connector-shared/redact exports no redactContinued (R-FIX-INSTANCE F03)')
  return fn
}
/** The text's whole lines (each keeps its newline). */
const linesOf = (text) => text.split(CONTINUED.newline).slice(0, -1).map((l) => l + CONTINUED.newline)
/** Every way to cut `lines` into consecutive non-empty pieces at line boundaries (2^(n-1) splits). */
function splits(lines) {
  const out = []
  for (let mask = 0; mask < 2 ** (lines.length - 1); mask++) {
    const pieces = [lines[0]]
    for (let i = 1; i < lines.length; i++) if (mask & (2 ** (i - 1))) pieces.push(lines[i]); else pieces[pieces.length - 1] += lines[i]
    out.push(pieces)
  }
  return out
}
/** Run the pieces through redactContinued, threading carry: `{outputs, carry}`. */
function thread(redactContinued, pieces) {
  let carry = null
  const outputs = []
  for (const piece of pieces) { const r = redactContinued(piece, carry); outputs.push(r.text); carry = r.carry }
  return { outputs, carry }
}
const show = (v) => JSON.stringify(v)

/** The row's three assertions; shared with the split-shared library row, which checks the same rule. */
export function assertRedactRow(redact, { input, expected, secrets }) {
  const got = redact(input)
  assert.equal(got, expected, show(input))
  for (const secret of secrets) assert.equal(got.includes(secret), false, `${show(secret)} survives in ${show(got)}`)
  assert.equal(redact(got), got, 'not idempotent on ' + show(input))
}

export function registerRedactCases(sdk) {
  for (const r of REDACT_ROWS) caseTest(sdk, r.id, r.part, r.title, async () => assertRedactRow(await subject(), r))

  for (const r of PERF.rows) caseTest(sdk, r.id, r.part, `${r.title}: under ${PERF.budgetMs} ms`, async () => {
    const redact = await subject()
    const started = performance.now()
    const got = redact(r.input)
    const ms = performance.now() - started
    assert.ok(ms < PERF.budgetMs, `${Math.round(ms)} ms`)
    assert.equal(got, r.expected)
    for (const secret of r.secrets) assert.equal(got.includes(secret), false, `${show(secret)} survives`)
  })
  registerContinuedCases(sdk)
  caseTest(sdk, 'RED-ST-01', 'stateless', 'a call never changes the next one (masked → plain → masked → plain)', async () => {
    const redact = await subject()
    const masked = REDACT_ROWS.find((r) => r.expected !== r.input)
    const plain = REDACT_ROWS.find((r) => r.expected === r.input && r.input !== '')
    for (const r of [masked, plain, masked, plain]) assert.equal(redact(r.input), r.expected, show(r.input))
  })
}

/**
 * R-FIX-INSTANCE F03: redactContinued's contract (constants.mjs CONTINUED). Techniques: EP over the
 * container shapes (object, nested array/object, util.inspect, JSON, two containers, unbalanced);
 * exhaustive line-boundary splits (every split of every text, BVA from one piece to one line per
 * piece); state transition of `carry` (null → open → null, or open to the end).
 */
function registerContinuedCases(sdk) {
  for (const r of CONTINUED.texts) {
    caseTest(sdk, r.id, 'one piece', `F03 ${r.title}: with carry null the output equals redact(text); carry is ${r.openAtEnd ? 'open' : 'null'} at the end`, async () => {
      const [redact, redactContinued] = [await subject(), await continuedSubject()]
      assert.equal(redact(r.text), r.expected, 'redact(text) is the requirement value')
      const got = redactContinued(r.text, null)
      assert.equal(got.text, redact(r.text))
      assert.equal(got.carry === null, !r.openAtEnd, 'carry ' + show(got.carry))
      const omitted = redactContinued(r.text)
      assert.equal(omitted.text, got.text, 'carry omitted behaves as null')
    })
    caseTest(sdk, r.id, 'every split', `F03 ${r.title}: every split at line boundaries concatenates to redact(whole); no secret in any piece`, async () => {
      const [redact, redactContinued] = [await subject(), await continuedSubject()]
      const whole = redact(r.text)
      for (const pieces of splits(linesOf(r.text))) {
        const { outputs, carry } = thread(redactContinued, pieces)
        assert.equal(outputs.join(''), whole, 'split ' + show(pieces))
        for (const out of outputs) for (const secret of r.secrets) assert.equal(out.includes(secret), false, `${show(secret)} in ${show(out)} (split ${show(pieces)})`)
        assert.equal(carry === null, !r.openAtEnd, `final carry ${show(carry)} (split ${show(pieces)})`)
      }
    })
  }
  caseTest(sdk, 'RFI-F03-probe', 'pieces', "F03 the probe written as three lines: outputs 'credentials: [redacted]\\n', '' (wholly inside), ''; carry open, open, null", async () => {
    const redactContinued = await continuedSubject()
    const { pieces, expected, inside, secret } = CONTINUED.probe
    let carry = null
    const outputs = []
    const carries = []
    for (const piece of pieces) { const r = redactContinued(piece, carry); outputs.push(r.text); carry = r.carry; carries.push(carry) }
    assert.equal(outputs.join(''), expected)
    assert.equal(outputs[inside], '', 'the piece wholly inside the container')
    assert.deepEqual(carries.map((c) => c === null), [false, false, true], 'carry null only once the container closes')
    for (const out of outputs) assert.equal(out.includes(secret), false)
  })
  caseTest(sdk, 'RFI-F03-plain', 'carry', 'F03 plain lines (no container): each line alone equals redact(line), carry stays null', async () => {
    const [redact, redactContinued] = [await subject(), await continuedSubject()]
    for (const line of linesOf(CONTINUED.plain)) {
      const got = redactContinued(line, null)
      assert.deepEqual(got, { text: redact(line), carry: null }, show(line))
    }
  })
}
