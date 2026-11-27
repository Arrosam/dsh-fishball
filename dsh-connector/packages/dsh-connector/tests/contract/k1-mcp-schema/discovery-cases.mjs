/**
 * Requirements-first DISCOVERY-TOOLS contract rows (oracles: discovery-constants.mjs): the K1
 * definitions of models_list and workspaces_list, read through the public mcp-schema exports and
 * checked with each SDK's own validator.
 * EP: the two new names vs the unchanged sessions_list; accepted vs refused result shapes.
 * BVA: empty / one / several list items; optional fields absent / present; the input with zero
 * properties vs one argument; 22 tools, not 20 or 23.
 * DT: success branch vs refusal branch of the oneOf output (each admits only its own shape).
 */
import assert from 'node:assert/strict'
import { caseTest, declarationText } from './cases.mjs'
import { DISCOVERY_FIXTURE as F, DISCOVERY_TOOLS as D } from './discovery-constants.mjs'
import { validatorFor } from './schema-module.mjs'

const SPECS = Object.freeze([
  { key: 'modelsList', fixtures: F.models },
  { key: 'workspacesList', fixtures: F.workspaces },
])

export function registerDiscoveryContractCases(sdk) {
  caseTest(sdk, 'DISCOVERY-EP-01', 'names', `TOOL names both tools; TOOL_NAMES / TOOLS are exactly the ${D.count} core tools in tools/list order, the new two right after ${D.after}`, (mod) => {
    for (const { key } of SPECS) assert.equal(mod.TOOL[key], D.names[key], key)
    assert.equal(D.all.length, D.count)
    assert.deepEqual([...mod.TOOL_NAMES], [...D.all])
    assert.deepEqual(mod.TOOLS.map((t) => t.name), [...D.all])
    const at = mod.TOOL_NAMES.indexOf(D.after)
    assert.deepEqual(mod.TOOL_NAMES.slice(at + 1, at + 3), [D.names.workspacesList, D.names.modelsList])
  })
  caseTest(sdk, 'DISCOVERY-EP-01', 'declarations', 'the public TOOL declaration names both tools', () => {
    const [, text] = declarationText()
    const declaration = text.match(/export declare const TOOL:\s*\{([^}]+)\}/)?.[1] ?? ''
    for (const { key } of SPECS) assert.ok(declaration.includes(`${key}: ${JSON.stringify(D.names[key])}`), key)
  })
  caseTest(sdk, 'DISCOVERY-EP-02', 'sessions_list unchanged', 'sessions_list keeps its description and its {limit, workspaceId?} input', (mod) => {
    const def = mod.toolDefinition(D.after)
    assert.equal(def.description, D.sessionsListDescription)
    assert.deepEqual(Object.keys(def.inputSchema.properties).sort(), ['limit', 'workspaceId'])
  })
  for (const { key, fixtures } of SPECS) {
    const name = D.names[key]
    caseTest(sdk, 'DISCOVERY-BVA-01', `${name} input`, 'the input is exactly the closed empty object: {} admitted, any argument refused', async (mod) => {
      const def = mod.toolDefinition(name)
      assert.ok(def, 'no definition for ' + name)
      assert.deepEqual(def.inputSchema, D.emptyInput)
      assert.equal(typeof def.description, 'string')
      const validate = (await validatorFor(sdk))(def.inputSchema)
      assert.equal(validate({}), true)
      for (const args of F.arguments) assert.equal(validate(args), false, JSON.stringify(args))
    })
    caseTest(sdk, 'DISCOVERY-DT-01', `${name} output`, 'the output is a oneOf of the success shape and the refusal envelope', async (mod) => {
      const out = mod.toolDefinition(name).outputSchema
      assert.ok(Array.isArray(out?.oneOf), 'not a oneOf root')
      const compile = await validatorFor(sdk)
      assert.equal(compile(out)({ ok: false, code: mod.REFUSAL.featureOff }), true, 'feature-off refusal')
      assert.equal(compile(out)({ ok: false, code: mod.REFUSAL.operationFailed, message: 'text' }), true, 'refusal with message')
      assert.equal(compile(mod.refusalSchema())({ ok: false, code: mod.REFUSAL.featureOff }), true)
    })
    for (const [label, value] of fixtures.accepted) {
      caseTest(sdk, 'DISCOVERY-BVA-02', `${name} admits (${label})`, 'the output schema admits the success shape', async (mod) => {
        assert.equal((await validatorFor(sdk))(mod.toolDefinition(name).outputSchema)(value), true, JSON.stringify(value))
      })
    }
    for (const [label, value] of fixtures.refused) {
      caseTest(sdk, 'DISCOVERY-BVA-03', `${name} refuses (${label})`, 'the output schema refuses a result outside the success and refusal shapes', async (mod) => {
        assert.equal((await validatorFor(sdk))(mod.toolDefinition(name).outputSchema)(value), false, JSON.stringify(value))
      })
    }
  }
}
