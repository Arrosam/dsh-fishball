/**
 * DISCOVERY-TOOLS black-box rows (the user's decision, 2026-11-21): two full-scope core tools that
 * tell a manager what session_start accepts, read live from DSH through the domain port.
 * Requirements (written from the decision, not from src/domain/discovery.js or the handlers):
 * - models_list and workspaces_list are listed for a full caller, right after sessions_list, each
 *   with the closed empty input {type: object, properties: {}, additionalProperties: false};
 * - any argument → invalid-arguments and the domain is never reached;
 * - success passes the port's answer through K1's envelope: models_list {ok, models,
 *   defaultModel, unavailableProviders} (optional defaultReasoningEffort / reasoningEffort only
 *   when present), workspaces_list {ok, workspaces} in registry order (duplicate titles allowed);
 * - a port RefusalError with a K1 code → that refusal (feature-off: the catalog cannot be read);
 *   a non-K1 code or a plain error → operation-failed, without its text; an answer that does not
 *   fit the output schema → operation-failed;
 * - a pair-only caller lists [pair] only, and calling either tool is refused like any other
 *   non-pair core tool (HTTP 403 insufficient_scope, not-paired), nothing reached.
 *
 * Level: integration. The real core tools on C-HTTP's real endpoint, the installed SDK's stock MCP
 * client over real HTTP (subject.mjs toolsWorld), with a FAKE domain port answering
 * `models.list()` / `workspaces.list()` as the internal port contract states.
 *
 * Techniques: Equivalence Partitioning (power partitions, argument partitions, port outcome
 * classes), Boundary Value Analysis (zero / one / several items; optional fields absent / present),
 * Decision Table (port outcome × tool → result code).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { caseTest } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { INSTANCE, REPO } from '../../../../test/support/constants.mjs'
import { importInstance } from '../../../../test/private-skills/support/sdk.mjs'
import { SCOPE_HINT } from '../contract/k1-mcp-schema/constants.mjs'
import { sdkClient } from '../mcp-http/subject.mjs'
import { assertRefusal, assertSuccess } from './cases.mjs'
import { DISCOVERY as D, FIXTURE, PAIR_ONLY, REFUSAL, SCOPE, TOOL } from './constants.mjs'
import { toolsWorld } from './subject.mjs'

const ID = Object.freeze({ ep: 'DISCOVERY-EP', bva: 'DISCOVERY-BVA', dt: 'DISCOVERY-DT' })
/** The connector's errors module, bound to the SDK under test as the tools module imports it. */
const ERRORS_FILE = path.join(REPO, 'packages', 'dsh-connector', 'src', 'errors.js')
const refusalError = async (sdk) => (await importInstance(sdk, path.relative(INSTANCE.dir, ERRORS_FILE))).RefusalError
/** A code no K1 refusal has. */
const NOT_A_CODE = 'fbtest-not-a-refusal-code'

/** The two tools, each with the port member it reads and how its success wraps the port answer. */
const SPECS = Object.freeze([
  { tool: TOOL.modelsList, port: 'models', wrap: (answer) => ({ ok: true, ...answer }), answer: () => ({ models: [D.effortModel], defaultModel: D.defaultWithEffort, unavailableProviders: [] }) },
  { tool: TOOL.workspacesList, port: 'workspaces', wrap: (answer) => ({ ok: true, workspaces: answer }), answer: () => [D.workspaces[0]] },
])

/** A fake domain port: `list()` answers (or throws) `outcome()` per port member, and every call is recorded. */
function fakeDomain(outcomes) {
  const calls = []
  const member = (port) => ({ async list(...args) { calls.push([port, args.length]); return outcomes[port]() } })
  return { calls, domain: { models: member('models'), workspaces: member('workspaces') } }
}
/** P paired with a full token over the fake domain; `outcomes` default to each spec's ordinary answer. */
async function world(t, sdk, outcomes = {}) {
  const fake = fakeDomain({ ...Object.fromEntries(SPECS.map((s) => [s.port, s.answer])), ...outcomes })
  const w = await toolsWorld(t, sdk, { domain: fake.domain })
  const p = await w.full(FIXTURE.idP, FIXTURE.nameP)
  return { w, fake, client: await w.connect(p.token) }
}
const callTool = (client, name, args) => client.callTool({ name, ...(args === undefined ? {} : { arguments: args }) })

function partitions(sdk) {
  caseTest(sdk, ID.ep, 'tools/list (full)', 'a full caller lists workspaces_list and models_list right after sessions_list, each with the closed empty input', async (t) => {
    const { client } = await world(t, sdk)
    const listed = (await client.listTools()).tools
    const names = listed.map((x) => x.name)
    const at = names.indexOf(TOOL.sessionsList)
    assert.deepEqual(names.slice(at, at + 3), [TOOL.sessionsList, TOOL.workspacesList, TOOL.modelsList])
    for (const spec of SPECS) {
      const tool = listed.find((x) => x.name === spec.tool)
      assert.deepEqual(tool.inputSchema, D.emptyInput, spec.tool)
      assert.ok(tool.outputSchema, spec.tool + ' has no outputSchema')
    }
  })
  for (const spec of SPECS) {
    caseTest(sdk, ID.ep, `${spec.tool} success`, 'no arguments and an empty arguments object both answer the port\'s list in K1\'s envelope, as given; the port is read once per call', async (t) => {
      const { client, fake } = await world(t, sdk)
      for (const args of [undefined, {}]) assert.deepEqual(assertSuccess(await callTool(client, spec.tool, args)), spec.wrap(spec.answer()))
      assert.deepEqual(fake.calls, [[spec.port, 0], [spec.port, 0]])
    })
    caseTest(sdk, ID.ep, `${spec.tool} arguments`, `any undeclared argument → ${REFUSAL.invalidArguments}; the domain is never reached`, async (t) => {
      const { client, fake } = await world(t, sdk)
      for (const args of D.extraArguments) assertRefusal(await callTool(client, spec.tool, args), REFUSAL.invalidArguments)
      assert.deepEqual(fake.calls, [])
    })
    caseTest(sdk, ID.ep, `${spec.tool} pair-only`, 'a pair-only caller lists pair only; calling the tool is HTTP 403 insufficient_scope (not-paired), the domain never reached', async (t) => {
      const { w, fake } = await world(t, sdk)
      const client = await w.connect(w.pairOnly(FIXTURE.idQ))
      assert.deepEqual((await client.listTools()).tools.map((x) => x.name), [...PAIR_ONLY.tools])
      const { InsufficientScopeError } = await sdkClient(sdk)
      await assert.rejects(callTool(client, spec.tool, {}), (error) => {
        assert.ok(error instanceof InsufficientScopeError, `${error.name}: ${error.message}`)
        assert.equal(error.requiredScope, SCOPE.full)
        assert.equal(error.errorDescription, SCOPE_HINT.notPaired)
        return true
      })
      assert.deepEqual(fake.calls, [])
      assert.equal(w.pairs.pairOf(FIXTURE.entry(FIXTURE.idQ)), undefined)
    })
  }
}

function boundaries(sdk) {
  const modelsRows = [
    ['empty catalog', { models: [], defaultModel: D.defaultWithoutEffort, unavailableProviders: [] }],
    ['one model with efforts and a default effort; default with effort', { models: [D.effortModel], defaultModel: D.defaultWithEffort, unavailableProviders: [] }],
    ['one model without reasoning metadata ([] efforts, no default effort); default without effort', { models: [D.plainModel], defaultModel: D.defaultWithoutEffort, unavailableProviders: [] }],
    ['several models across providers in catalog order, one unavailable provider', { models: [D.effortModel, D.plainModel, D.noDefaultModel], defaultModel: D.defaultWithEffort, unavailableProviders: [D.unavailable] }],
    ['no models, every provider unavailable', { models: [], defaultModel: D.defaultWithoutEffort, unavailableProviders: [D.unavailable] }],
  ]
  for (const [label, answer] of modelsRows) {
    caseTest(sdk, ID.bva, `${TOOL.modelsList} (${label})`, 'passes through exactly: order kept, optional fields absent stay absent', async (t) => {
      const { client } = await world(t, sdk, { models: () => answer })
      const s = assertSuccess(await callTool(client, TOOL.modelsList, {}))
      assert.deepEqual(s, { ok: true, ...answer })
      for (const m of s.models) if (!Object.hasOwn(answer.models.find((x) => x.model === m.model), 'defaultReasoningEffort')) assert.equal(Object.hasOwn(m, 'defaultReasoningEffort'), false, m.model)
      if (!Object.hasOwn(answer.defaultModel, 'reasoningEffort')) assert.equal(Object.hasOwn(s.defaultModel, 'reasoningEffort'), false)
    })
  }
  for (const [label, list] of [['empty registry', []], ['one workspace', D.workspaces.slice(0, 1)], ['two with one title, distinct ids, one unavailable', D.workspaces], ['registry order reversed', [...D.workspaces].reverse()]]) {
    caseTest(sdk, ID.bva, `${TOOL.workspacesList} (${label})`, 'passes through exactly, in registry order', async (t) => {
      const { client } = await world(t, sdk, { workspaces: () => list })
      assert.deepEqual(assertSuccess(await callTool(client, TOOL.workspacesList, {})), { ok: true, workspaces: list })
    })
  }
}

/** Port answers that do not fit each tool's output schema (missing, mistyped or undeclared members). */
const MALFORMED = Object.freeze({
  [TOOL.modelsList]: [
    ['not an object', () => null],
    ['models missing', () => ({ defaultModel: D.defaultWithoutEffort, unavailableProviders: [] })],
    ['defaultModel missing', () => ({ models: [], unavailableProviders: [] })],
    ['a model without its model string', () => ({ models: [{ ...D.plainModel, model: undefined }], defaultModel: D.defaultWithoutEffort, unavailableProviders: [] })],
    ['reasoningEfforts not a list', () => ({ models: [{ ...D.plainModel, reasoningEfforts: 'low' }], defaultModel: D.defaultWithoutEffort, unavailableProviders: [] })],
    ['an effort id not a string', () => ({ models: [{ ...D.plainModel, reasoningEfforts: [1] }], defaultModel: D.defaultWithoutEffort, unavailableProviders: [] })],
    ['an undeclared model member', () => ({ models: [{ ...D.plainModel, fbtestExtra: true }], defaultModel: D.defaultWithoutEffort, unavailableProviders: [] })],
  ],
  [TOOL.workspacesList]: [
    ['not a list', () => ({ workspaces: D.workspaces })],
    ['available not a boolean', () => [{ ...D.workspaces[0], available: 'yes' }]],
    ['path missing', () => [{ ...D.workspaces[0], path: undefined }]],
    ['an undeclared workspace member', () => [{ ...D.workspaces[0], fbtestExtra: true }]],
  ],
})

function decisionTable(sdk) {
  for (const spec of SPECS) {
    const rows = [
      [`RefusalError(${REFUSAL.featureOff})`, async () => { const E = await refusalError(sdk); return () => { throw new E(REFUSAL.featureOff) } }, REFUSAL.featureOff],
      ['RefusalError(non-K1 code)', async () => { const E = await refusalError(sdk); return () => { throw new E(NOT_A_CODE) } }, REFUSAL.operationFailed],
      ['plain Error', async () => () => { throw new Error(D.secret + ' at ' + REPO) }, REFUSAL.operationFailed],
      ['rejected non-Error', async () => () => Promise.reject(D.secret), REFUSAL.operationFailed],
      ...MALFORMED[spec.tool].map(([label, answer]) => [`malformed answer: ${label}`, async () => answer, REFUSAL.operationFailed]),
    ]
    for (const [label, outcome, code] of rows) {
      caseTest(sdk, ID.dt, `${spec.tool} × ${label}`, `→ ${code}; no thrown text, code or path in the result`, async (t) => {
        const { client, fake } = await world(t, sdk, { [spec.port]: await outcome() })
        assertRefusal(await callTool(client, spec.tool, {}), code, [D.secret, NOT_A_CODE])
        assert.deepEqual(fake.calls, [[spec.port, 0]])
      })
    }
  }
  caseTest(sdk, ID.dt, `${TOOL.modelsList} × failure message`, 'an unavailable provider is listed by provider and providerName only; a failure message is never returned', async (t) => {
    const answer = { models: [], defaultModel: D.defaultWithoutEffort, unavailableProviders: [D.unavailable] }
    const { client } = await world(t, sdk, { models: () => answer })
    const result = await callTool(client, TOOL.modelsList, {})
    assert.deepEqual(assertSuccess(result).unavailableProviders, [D.unavailable])
    assert.ok(!JSON.stringify(result).includes(D.secret))
  })
}

/** Every DISCOVERY-TOOLS row of the mcp-tools suite for `sdk`. */
export function registerDiscoveryToolsCases(sdk) {
  partitions(sdk)
  boundaries(sdk)
  decisionTable(sdk)
}
