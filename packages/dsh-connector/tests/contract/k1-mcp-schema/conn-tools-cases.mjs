/**
 * Requirements-first CONN-TOOLS rows: withdraw only question_ask / question_answer_own.
 * EP: withdrawn vs retained tools, question vs plan-review descriptors, generic settlement answers.
 * BVA: zero / one / multiple answer items; missing required answer-item members.
 * DT: valid typed batches vs malformed nested fields. Schema checks deliberately do not impose
 * semantic/count limits that belong to the domain. Both SDK validators consume public K1 exports.
 */
import assert from 'node:assert/strict'
import { caseTest, declarationText } from './cases.mjs'
import { CONN_FIXTURE as F, CONN_TOOLS as C } from './conn-tools-constants.mjs'
import { validatorFor } from './schema-module.mjs'

const sorted = (items) => [...items].sort()
const answerArgs = (rest) => ({ sessionId: F.sessionId, questionId: F.questionId, offerId: F.offerId, ...rest })

export function registerConnToolsContractCases(sdk) {
  caseTest(sdk, 'CONN-TOOLS-EP-01', 'public names', 'exactly the retained 20 tools are exported and withdrawn definitions are unavailable', (mod) => {
    assert.deepEqual(sorted(mod.TOOL_NAMES), sorted(C.retained))
    assert.deepEqual(sorted(mod.TOOLS.map((tool) => tool.name)), sorted(C.retained))
    assert.deepEqual(sorted(Object.values(mod.TOOL)), sorted(C.retained))
    for (const name of C.removed) assert.equal(mod.toolDefinition(name), undefined, name)
  })
  caseTest(sdk, 'CONN-TOOLS-EP-02', 'declarations', 'the public TOOL declaration no longer offers either withdrawn name', () => {
    const [, text] = declarationText()
    const declaration = text.match(/export declare const TOOL:\s*\{([^}]+)\}/)?.[1]
    assert.ok(declaration, 'missing public TOOL declaration')
    for (const name of C.removed) assert.equal(declaration.includes(JSON.stringify(name)), false, name)
    assert.ok(declaration.includes(JSON.stringify(C.answer)))
  })
  caseTest(sdk, 'CONN-TOOLS-DT-01', 'question_answer', 'ordinary answers, plan approval/feedback, and toUser remain valid typed inputs', async (mod) => {
    const compile = await validatorFor(sdk)
    const tool = mod.toolDefinition(C.answer)
    assert.ok(tool, 'question_answer was removed with the unsupported tools')
    const validate = compile(tool.inputSchema)
    for (const rest of [{ answers: F.answers }, { approve: true }, { approve: false, feedback: 'Revise the plan' }, { toUser: true, note: 'User decision needed' }]) {
      assert.equal(validate(answerArgs(rest)), true, JSON.stringify(rest))
    }
    const output = compile(tool.outputSchema)
    assert.equal(output({ ok: true, accepted: true }), true)
    assert.equal(output({ ok: false, code: 'bad-answer' }), true)
  })
  caseTest(sdk, 'CONN-TOOLS-BVA-01', 'answer batch shape', 'zero, one and multiple answer items remain schema-valid; missing or mistyped item fields remain invalid', async (mod) => {
    const compile = await validatorFor(sdk)
    const input = compile(mod.toolDefinition(C.answer).inputSchema)
    const settlement = compile(mod.payloadSchemaOf(C.settlement))
    for (const answers of [[], F.answers.slice(0, 1), F.answers]) {
      assert.equal(input(answerArgs({ answers })), true)
      assert.equal(settlement({ ...F.settlement, answers }), true)
    }
    for (const answers of [[{ selected: [] }], [{ id: 'choice' }], [{ id: 'choice', selected: 'Blue' }], [{ id: 'choice', selected: [false] }], [{ id: 'choice', selected: [], custom: false }], [{ id: 'choice', selected: [], extra: true }]]) {
      assert.equal(input(answerArgs({ answers })), false, JSON.stringify(answers))
      assert.equal(settlement({ ...F.settlement, answers }), false, JSON.stringify(answers))
    }
    assert.equal(settlement(F.settlement), true, 'generic settlements need not carry answers')
  })
  caseTest(sdk, 'CONN-TOOLS-DT-02', 'shared question shapes', 'question and plan-review event descriptors keep the shared question validator', async (mod) => {
    const compile = await validatorFor(sdk)
    for (const type of C.events) {
      const validate = compile(mod.payloadSchemaOf(type))
      for (const question of [F.question, F.plan]) assert.equal(validate({ ...F.descriptor, questions: [question] }), true, type)
      for (const question of [{ question: 'Missing id' }, { id: 'choice', question: false }, { ...F.question, options: [{ label: false }] }, { ...F.question, multiSelect: 'yes' }]) {
        assert.equal(validate({ ...F.descriptor, questions: [question] }), false, type + ': ' + JSON.stringify(question))
      }
    }
  })
}
