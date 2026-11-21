/**
 * HIGH-RISK-APPROVAL K1 rows (the user, 2026-11-21: a manager may approve high-risk requests; it
 * must give a reason; the record says what was approved at which risk and why), through the public
 * mcp-schema exports and each SDK's validator. EP over the settlement payload's optional fields, the
 * new refusal code, and what a connected agent reads in approval_answer / prompt_answer.
 */
import assert from 'node:assert/strict'
import { caseTest } from './cases.mjs'
import { validatorFor } from './schema-module.mjs'

const ID = 'K1-HR'
const SETTLEMENT = 'settlement'
const base = Object.freeze({ approvalId: 'apr_00000000000000000000000000000000', outcome: 'allowed', by: 'principal' })
/** What the descriptions must tell a connected agent (the requirement's words, not the implementation's). */
const TOLD = Object.freeze({ approval_answer: [/high/i, /reason/i, /grant/i, /allow-needs-low-risk/, /grant-needs-low-risk/], prompt_answer: [/high/i, /reason/i, /allow-needs-low-risk/] })

export function registerHighRiskContractCases(sdk) {
  caseTest(sdk, ID, 'refusal', 'REFUSAL.grantNeedsLowRisk is grant-needs-low-risk; allow-needs-low-risk stays (the owner\'s strict setting)', (mod) => {
    assert.equal(mod.REFUSAL.grantNeedsLowRisk, 'grant-needs-low-risk')
    assert.equal(mod.REFUSAL.allowNeedsLowRisk, 'allow-needs-low-risk')
  })
  for (const [label, payload, admitted] of [
    ['risk high and a reason', { ...base, risk: 'high', reason: 'deploy needed' }, true],
    ['risk low and a reason', { ...base, risk: 'low', reason: 'read only' }, true],
    ['a reason only (a reject with no risk)', { ...base, outcome: 'rejected', reason: 'no' }, true],
    ['neither (a user or delegate settlement)', base, true],
    ['an unknown risk', { ...base, risk: 'medium', reason: 'x' }, false],
    ['a non-string reason', { ...base, risk: 'high', reason: 1 }, false],
  ]) {
    caseTest(sdk, ID, `settlement (${label})`, `the settlement payload schema ${admitted ? 'admits' : 'refuses'} it`, async (mod) => {
      assert.equal((await validatorFor(sdk))(mod.payloadSchemaOf(SETTLEMENT))(payload), admitted, JSON.stringify(payload))
    })
  }
  for (const [tool, words] of Object.entries(TOLD)) {
    caseTest(sdk, ID, `${tool} description`, 'tells a connected agent that a high-risk allow is accepted, needs a reason, and what refuses it', (mod) => {
      const definition = mod.toolDefinition(tool)
      for (const word of words) assert.match(definition.description, word)
      const risk = tool === 'approval_answer' ? definition.inputSchema.properties.answer.properties.risk : definition.inputSchema.properties.risk
      assert.deepEqual([...risk.enum].sort(), ['high', 'low'])
      assert.match(risk.description, /high/i)
    })
  }
}
