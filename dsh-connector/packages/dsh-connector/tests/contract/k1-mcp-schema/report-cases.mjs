/**
 * CONN-REPORT K1 rows (oracles: report-constants.mjs, from the user-approved requirements of
 * 2026-11-21, not the implementation), through the public mcp-schema exports and each SDK's validator.
 * EP: outcome completed / stopped × finalMessage / stop present or absent; the old payload shape.
 * BVA: the TURN_FINISHED limit and marker values; running present / absent / non-boolean.
 * DT: each of the three tools × running (true, false, missing, wrong type) → admitted or refused.
 */
import assert from 'node:assert/strict'
import { caseTest } from './cases.mjs'
import { REPORT as R, REPORT_PAYLOADS as P, RUNNING_RESULTS } from './report-constants.mjs'
import { validatorFor } from './schema-module.mjs'

export function registerReportContractCases(sdk) {
  caseTest(sdk, R.id.ep01, 'A1 vocabulary', 'EVENT_TYPE still lists state and ask (frozen, no producer) and turn-finished', (mod) => {
    const types = Object.values(mod.EVENT_TYPE)
    for (const word of [...Object.values(R.frozenWords), R.turnFinishedType]) assert.ok(types.includes(word), word)
  })
  caseTest(sdk, R.id.bva01, 'B limits', `TURN_FINISHED is exactly {finalMessageBytes: ${R.limits.finalMessageBytes}, truncationMarker: ${JSON.stringify(R.limits.truncationMarker)}}`, (mod) => {
    assert.deepEqual({ ...mod.TURN_FINISHED }, R.limits)
    assert.ok(Object.isFrozen(mod.TURN_FINISHED), 'TURN_FINISHED is not frozen')
  })
  caseTest(sdk, R.id.ep01, 'B outcomes', `the turn-finished outcome enum is exactly ${R.outcomes.join(', ')}`, (mod) => {
    assert.deepEqual([...mod.payloadSchemaOf(R.turnFinishedType).properties.outcome.enum].sort(), [...R.outcomes].sort())
  })
  for (const [label, payload] of P.accepted) {
    caseTest(sdk, R.id.ep02, `B admits (${label})`, 'the turn-finished payload schema admits it', async (mod) => {
      assert.equal((await validatorFor(sdk))(mod.payloadSchemaOf(R.turnFinishedType))(payload), true, JSON.stringify(payload))
    })
  }
  for (const [label, payload] of P.refused) {
    caseTest(sdk, R.id.ep02, `B refuses (${label})`, 'the turn-finished payload schema refuses it', async (mod) => {
      assert.equal((await validatorFor(sdk))(mod.payloadSchemaOf(R.turnFinishedType))(payload), false, JSON.stringify(payload))
    })
  }
  for (const tool of R.runningTools) {
    const base = RUNNING_RESULTS[tool]
    for (const [label, value, admitted] of [
      ['running true', { ...base, [R.runningField]: true }, true],
      ['running false', { ...base, [R.runningField]: false }, true],
      ['running missing', base, false],
      ['running a string', { ...base, [R.runningField]: 'true' }, false],
      ['running null', { ...base, [R.runningField]: null }, false],
    ]) {
      caseTest(sdk, R.id.dt01, `A2 ${tool} (${label})`, `the output schema ${admitted ? 'admits' : 'refuses'} the success with ${label}`, async (mod) => {
        assert.equal((await validatorFor(sdk))(mod.toolDefinition(tool).outputSchema)(value), admitted, JSON.stringify(value))
      })
    }
    caseTest(sdk, R.id.dt01, `A2 ${tool} (refusal)`, 'the refusal envelope needs no running', async (mod) => {
      assert.equal((await validatorFor(sdk))(mod.toolDefinition(tool).outputSchema)({ ok: false, code: mod.REFUSAL.notManaged }), true)
    })
  }
}
