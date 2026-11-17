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
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { REDACT_ROWS } from './constants.mjs'

const subject = async () => (await import('dsh-connector-shared/redact')).redact
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

  caseTest(sdk, 'RED-ST-01', 'stateless', 'a call never changes the next one (masked → plain → masked → plain)', async () => {
    const redact = await subject()
    const masked = REDACT_ROWS.find((r) => r.expected !== r.input)
    const plain = REDACT_ROWS.find((r) => r.expected === r.input && r.input !== '')
    for (const r of [masked, plain, masked, plain]) assert.equal(redact(r.input), r.expected, show(r.input))
  })
}
