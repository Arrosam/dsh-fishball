/**
 * DELEGATE-OUTCOME K1 rows (oracles: delegate-outcome-constants.mjs, from the user's requirement of
 * 2026-11-21, not the implementation), through the public mcp-schema exports and each SDK's validator.
 * EP: DELEGATE_OUTCOME's words; the permission payload with no delegate / passed / failed × reason
 * present or absent, and the refused shapes (closed object, enum, required members, types).
 */
import assert from 'node:assert/strict'
import { caseTest } from './cases.mjs'
import { DELEGATE_OUTCOME_CASES as D, DELEGATE_PAYLOADS as P } from './delegate-outcome-constants.mjs'
import { validatorFor } from './schema-module.mjs'

export function registerDelegateOutcomeContractCases(sdk) {
  caseTest(sdk, D.id.ep, 'vocabulary', 'DELEGATE_OUTCOME is exactly {passed, failed}, frozen', (mod) => {
    assert.deepEqual({ ...mod.DELEGATE_OUTCOME }, D.outcomes)
    assert.ok(Object.isFrozen(mod.DELEGATE_OUTCOME))
  })
  caseTest(sdk, D.id.ep, 'optional', 'the permission payload declares delegate and does not require it', (mod) => {
    const schema = mod.payloadSchemaOf(D.permissionType)
    assert.ok(schema.properties.delegate, 'no delegate property')
    assert.ok(!(schema.required ?? []).includes('delegate'), 'delegate is required')
    assert.deepEqual([...schema.properties.delegate.properties.outcome.enum].sort(), Object.values(D.outcomes).sort())
  })
  for (const [label, payload] of P.accepted) {
    caseTest(sdk, D.id.bva, `admits (${label})`, 'the permission payload schema admits it', async (mod) => {
      assert.equal((await validatorFor(sdk))(mod.payloadSchemaOf(D.permissionType))(payload), true, JSON.stringify(payload))
    })
  }
  for (const [label, payload] of P.refused) {
    caseTest(sdk, D.id.bva, `refuses (${label})`, 'the permission payload schema refuses it', async (mod) => {
      assert.equal((await validatorFor(sdk))(mod.payloadSchemaOf(D.permissionType))(payload), false, JSON.stringify(payload))
    })
  }
}
