/**
 * I1c — the instance's status in the contract's vocabulary (docs/slim-native-design.md §0.6,
 * §18.2 I1c R2/R4, §18.5 inst-OQ-03, conn-OQ-53; contract §1.1 `status`, §6 STATUS/STATUS_CODES).
 * Observation point: packages/instance/src/host/binding.js `contractStatus` (what the attachment's
 * `status()` answers) and `INSTANCE_STATES` / `INSTANCE_CODES` (what the instance itself may show
 * on its card and status route). The card, the status route and Retry need a DSH boot (E1).
 *
 * Expected values from the design:
 * - `status()` gives `state` in STATUS and `code` in STATUS_CODES or null (R2);
 * - `connector-missing` is the instance's own state (D25) and `NATIVE_INSTANCE_BUSY` /
 *   `NATIVE_CONTRACT_VERSION` its own codes; they "appear only on its card and status route,
 *   never in `status()`" (R4, inst-OQ-03);
 * - the instance's own states and codes are the contract's plus those three (inst-OQ-03).
 * The design does not say which contract value an instance-only value maps to, so those cases
 * assert only that the answer stays inside the contract and never carries the instance's own value.
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | I1c-ST-P-01 ×7 | EP (each STATUS state, code null) | answered unchanged |
 * | I1c-ST-P-02 ×6 | EP (failed × each STATUS_CODES code) | answered unchanged |
 * | I1c-ST-EP-01 | EP | `connector-missing` → a contract state, never `connector-missing` |
 * | I1c-ST-EP-02/03 | EP | failed + NATIVE_INSTANCE_BUSY / NATIVE_CONTRACT_VERSION → a contract code or null, never those two |
 * | I1c-ST-EP-04 | EP | an unknown state / an unknown code → inside the contract vocabulary |
 * | I1c-ST-P-03 | P | the answer has exactly the keys `state` and `code`, and is a new object |
 * | I1c-ST-DT-01 | DT (every instance state × every instance code and null) | always inside STATUS × (STATUS_CODES ∪ null) |
 * | I1c-V-01 | P | INSTANCE_STATES = STATUS values ∪ {connector-missing} |
 * | I1c-V-02 | P | INSTANCE_CODES = STATUS_CODES values ∪ {NATIVE_INSTANCE_BUSY, NATIVE_CONTRACT_VERSION} |
 * | I1c-V-03 | P | the contract's STATUS / STATUS_CODES are exactly contract §6's lists |
 * | I1c-V-04 | P | the three instance-only values are not in the contract vocabulary |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadInstance } from './support/body-soul-env.mjs'

const { contractStatus, INSTANCE_STATES, INSTANCE_CODES } = await loadInstance('src/host/binding.js')

/** Contract §6, verbatim. */
const STATUS = Object.freeze(['disabled', 'waiting', 'starting', 'ready', 'stopping', 'stopped', 'failed'])
const STATUS_CODES = Object.freeze(['NATIVE_START_FAILED', 'NATIVE_STOP_FAILED', 'NATIVE_CHILD_EXITED', 'NATIVE_UNAVAILABLE', 'NATIVE_TIMEOUT', 'NATIVE_DISABLED'])
/** The instance's own values (D25, inst-OQ-03). */
const OWN = Object.freeze({ state: 'connector-missing', codes: Object.freeze(['NATIVE_INSTANCE_BUSY', 'NATIVE_CONTRACT_VERSION']) })

function assertInContract(answer) {
  assert.ok(STATUS.includes(answer.state), 'state ' + answer.state + ' is a STATUS value')
  assert.ok(answer.code === null || STATUS_CODES.includes(answer.code), 'code ' + answer.code + ' is a STATUS_CODES value or null')
  assert.notEqual(answer.state, OWN.state)
  assert.ok(!OWN.codes.includes(answer.code))
}

describe('I1c contractStatus', () => {
  for (const state of STATUS) {
    it('I1c-ST-P-01 ' + state + ' / null is answered unchanged', () => assert.deepEqual(contractStatus({ state, code: null }), { state, code: null }))
  }
  for (const code of STATUS_CODES) {
    it('I1c-ST-P-02 failed / ' + code + ' is answered unchanged', () => assert.deepEqual(contractStatus({ state: 'failed', code }), { state: 'failed', code }))
  }
  it('I1c-ST-EP-01 connector-missing never reaches status()', () => assertInContract(contractStatus({ state: OWN.state, code: null })))
  for (const [id, code] of [['I1c-ST-EP-02', OWN.codes[0]], ['I1c-ST-EP-03', OWN.codes[1]]]) {
    it(id + ' failed / ' + code + ' never reaches status()', () => assertInContract(contractStatus({ state: 'failed', code })))
  }
  for (const value of [{ state: 'fbtest-state', code: null }, { state: 'failed', code: 'FBTEST_CODE' }, { state: 'ready', code: 'FBTEST_CODE' }]) {
    it('I1c-ST-EP-04 out of vocabulary ' + JSON.stringify(value) + ' → inside the contract', () => assertInContract(contractStatus(value)))
  }
  it('I1c-ST-P-03 the answer is a new object with exactly state and code', () => {
    const input = { state: 'ready', code: null, enabled: true, detail: 'x' }
    const answer = contractStatus(input)
    assert.deepEqual(Object.keys(answer).sort(), ['code', 'state'])
    assert.notEqual(answer, input)
  })
  it('I1c-ST-DT-01 every instance state × every instance code (and null) stays inside the contract', () => {
    for (const state of INSTANCE_STATES) for (const code of [null, ...INSTANCE_CODES]) assertInContract(contractStatus({ state, code }))
  })
})

describe('I1c vocabularies', () => {
  it('I1c-V-01 INSTANCE_STATES = the contract states plus connector-missing', () => {
    assert.deepEqual([...INSTANCE_STATES].sort(), [...STATUS, OWN.state].sort())
  })
  it('I1c-V-02 INSTANCE_CODES = the contract codes plus the two refused-attach codes', () => {
    assert.deepEqual([...INSTANCE_CODES].sort(), [...STATUS_CODES, ...OWN.codes].sort())
  })
  it('I1c-V-03 the contract exports exactly §6\'s STATUS and STATUS_CODES', async () => {
    const contract = await import('fishball-connector/contract')
    assert.deepEqual(Object.values(contract.STATUS).sort(), [...STATUS].sort())
    assert.deepEqual(Object.values(contract.STATUS_CODES).sort(), [...STATUS_CODES].sort())
  })
  it('I1c-V-04 the instance-only values are not contract values', async () => {
    const contract = await import('fishball-connector/contract')
    assert.ok(!Object.values(contract.STATUS).includes(OWN.state))
    for (const code of OWN.codes) assert.ok(!Object.values(contract.STATUS_CODES).includes(code))
  })
})
