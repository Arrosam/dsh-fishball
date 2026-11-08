/**
 * WD-1 supplemental black-box verification. Oracles: the delegated WD-1 requirements,
 * not watchdog source or its approved tests. The author inspected only SDK APIs and safe
 * test infrastructure; the parent reviews this file before executing it on both SDKs.
 *
 * AC-N1: actual native Schema.resolve enforces integer defaults and the full cross-field
 * budget. AC-N2: its JSON/new Schema round-trip preserves executable validation.
 * AC-N3: real Cordis activation requires agents/tools/llm/profileContext, never the
 * optional public fishballInstance (including older/mismatched API), and skeleton startup
 * performs no runtime readiness, claim, tool/model, or agent operations.
 *
 * EP: native config vs invalid integer representations; optional absent/compatible/older/
 * incompatible/missing API. BVA: three values around each specified budget threshold,
 * using independent tabulated expected minima (not the product calculation).
 * DT: all required services => ACTIVE for every optional partition; each individual
 * missing service => PENDING even with API1 present. ST: PENDING -> ACTIVE -> PENDING ->
 * ACTIVE -> DISPOSED; optional absent -> older -> compatible -> absent stays ACTIVE.
 * Error guessing: serialized transform closures and standard-schema/native-resolver drift.
 *
 * Observation limits: this is an actual Cordis container and installed Schemastery, NOT
 * a booted DSH app or real tools/agents/LLM implementation. In-memory services fail on any
 * operation; no agent/tool/model callback is executed. No profile, settings mutation, disk
 * atomicity, UI discoverability, live DSH, process restart, or future WD runtime is proven.
 * SDK settings projection is deliberately not instantiated: its constructor schedules a
 * legacy-file import. Schema JSON round-trip is not evidence of a generated settings UI.
 */
import { assertNoForbiddenAttempts } from './wd1-safe-preload.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'
import { resolveOfficialSDK, RUNTIME_PARENT_URL } from '../support/provider-sync-sdk.mjs'

const WD = Object.freeze({
  sdkVersions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  module: '../../packages/watchdog/index.js',
  name: 'fishball-watchdog',
  timeoutMs: 5_000,
  emptyCount: 0,
  first: 0,
  neighbor: 1,
  loggerDebugLevel: 3,
  statusEvent: 'internal/status',
  errorLevel: 'error',
  typeFunction: 'function',
  // Native .d.ts exposes this as a const enum, not a JavaScript export.
  state: Object.freeze({ PENDING: 0, ACTIVE: 2, FAILED: 3, DISPOSED: 4 }),
  services: Object.freeze(['agents', 'tools', 'llm', 'profileContext']),
  optionalService: 'fishballInstance',
  defaults: Object.freeze({ readMaxBytes: 8192, maxOutputTokens: 1024, turnGrowthTokens: 10000, contextRolloverTokens: 64000 }),
  integerFields: Object.freeze(['readMaxBytes', 'maxOutputTokens', 'turnGrowthTokens']),
  invalidIntegers: Object.freeze([
    Object.freeze({ id: 'fraction', make: (valid) => valid + 0.5 }),
    Object.freeze({ id: 'numeric-string', make: (valid) => String(valid) }),
    Object.freeze({ id: 'boolean', value: true }),
    Object.freeze({ id: 'NaN', value: Number.NaN }),
    Object.freeze({ id: 'infinity', value: Number.POSITIVE_INFINITY }),
  ]),
  // 3 * ceil(readMaxBytes / 3) + shared non-read 768 + maxOutputTokens.
  // Explicit requirement values distinguish separately rounded reads from one shared ceil.
  budgets: Object.freeze([
    Object.freeze({ id: 'read8190', readMaxBytes: 8190, maxOutputTokens: 1024, minimum: 9982 }),
    Object.freeze({ id: 'read8191', readMaxBytes: 8191, maxOutputTokens: 1024, minimum: 9985 }),
    Object.freeze({ id: 'read8192', readMaxBytes: 8192, maxOutputTokens: 1024, minimum: 9985 }),
    Object.freeze({ id: 'read8193', readMaxBytes: 8193, maxOutputTokens: 1024, minimum: 9985 }),
    Object.freeze({ id: 'read8194', readMaxBytes: 8194, maxOutputTokens: 1024, minimum: 9988 }),
    Object.freeze({ id: 'output2048', readMaxBytes: 8192, maxOutputTokens: 2048, minimum: 11009 }),
  ]),
  optional: Object.freeze([
    Object.freeze({ id: 'absent', present: false }),
    Object.freeze({ id: 'api1', present: true, apiVersion: 1 }),
    Object.freeze({ id: 'older-api0', present: true, apiVersion: 0 }),
    Object.freeze({ id: 'mismatched-api2', present: true, apiVersion: 2 }),
    Object.freeze({ id: 'string-api1', present: true, apiVersion: '1' }),
    Object.freeze({ id: 'missing-api', present: true }),
  ]),
  operationPaths: Object.freeze({
    agents: Object.freeze(['create', 'resume', 'register', 'enter', 'setFactory']),
    tools: Object.freeze(['register', 'execute']),
    llm: Object.freeze(['stream', 'prepareCall', 'registerAdapter']),
    profileContext: Object.freeze([]),
    fishballInstance: Object.freeze([
      'supervision.register', 'inbox.claim', 'inbox.release', 'inbox.setBatcher',
      'approvals.claim', 'approvals.onSettled', 'approvals.answerApproval',
      'manager.registerSetup', 'manager.notify', 'sideAgents.open', 'sideAgents.runTurn',
      'sideAgents.cancel', 'sessionStarts.register',
    ]),
  }),
})

let host
let row
const schemas = new Map()

before(async () => {
  assert.ok(process.env.FBTEST_DSH_RUNTIME, 'explicitly select one pinned installed node_modules directory')
  const runtimeRequire = createRequire(RUNTIME_PARENT_URL)
  const manifest = async (name) => JSON.parse(await readFile(runtimeRequire.resolve(name + '/package.json'), 'utf8'))
  const dsh = await manifest('@deepseek-ai/dsh')
  const cordis = await manifest('@deepseek-ai/cordis')
  assert.ok(WD.sdkVersions.includes(dsh.version), 'only the requested installed SDK versions may run this suite')
  resolveOfficialSDK()
  const [native, schemaModule] = await Promise.all([
    import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/cordis')).href),
    import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/schemastery')).href),
  ])
  host = { ...native, Schema: schemaModule.default, dshVersion: dsh.version, cordisVersion: cordis.version }
  // Import only the public row; no package-linking helper or DSH launcher is invoked.
  row = await import(WD.module)
  assert.equal(typeof row.Config, WD.typeFunction, 'public Config is a callable native Schema')
  schemas.set('native', row.Config)
  // The SDK restores callback text in new Schema(json); this intentionally exercises it
  // without module closure bindings. A missing binding must fail, not become a skip.
  schemas.set('json-restored', new host.Schema(JSON.parse(JSON.stringify(row.Config))))
})

after(() => assertNoForbiddenAttempts())

function resolveConfig(schema, input) {
  return host.Schema.resolve(structuredClone(input), schema, {})[WD.first]
}

function isConfigRejection(error) {
  // WD-1 specifies rejection, not an error subclass. Closure/driver failures must not
  // masquerade as validation; positive neighbors independently prove schema wiring.
  return error instanceof Error && !(error instanceof ReferenceError) && !(error instanceof SyntaxError)
}

function expectInvalid(operation, message) {
  assert.throws(operation, isConfigRejection, message)
}

function assertKnownFields(actual, expected) {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, key + ' is normalized without changing valid input')
}

for (const mode of ['native', 'json-restored']) {
  test(`WD1-NATIVE-${mode}-DEFAULTS: full Schema.resolve supplies the required integer defaults`, () => {
    const schema = schemas.get(mode)
    assertKnownFields(resolveConfig(schema, {}), WD.defaults)
  })

  for (const boundary of WD.budgets) {
    for (const offset of [-WD.neighbor, WD.emptyCount, WD.neighbor]) {
      const growth = boundary.minimum + offset
      test(`WD1-NATIVE-${mode}-BVA-${boundary.id}-growth${growth}`, () => {
        const input = { readMaxBytes: boundary.readMaxBytes, maxOutputTokens: boundary.maxOutputTokens, turnGrowthTokens: growth }
        const operation = () => resolveConfig(schemas.get(mode), input)
        if (offset < WD.emptyCount) expectInvalid(operation, 'complete native resolve rejects growth below the independently specified minimum')
        else assertKnownFields(operation(), input)
      })
    }
  }

  test(`WD1-NATIVE-${mode}-DEFAULTED-CROSS-FIELD: omitted reads/output still participate in validation`, () => {
    const boundary = WD.budgets.find((entry) => entry.id === 'read8192')
    const operation = (growth) => resolveConfig(schemas.get(mode), { turnGrowthTokens: growth })
    expectInvalid(() => operation(boundary.minimum - WD.neighbor), 'defaulted fields cannot bypass the cross-field budget')
    assertKnownFields(operation(boundary.minimum), { ...WD.defaults, turnGrowthTokens: boundary.minimum })
  })

  for (const field of WD.integerFields) {
    for (const invalid of WD.invalidIntegers) {
      test(`WD1-NATIVE-${mode}-EP-${field}-${invalid.id}`, () => {
        const value = invalid.make ? invalid.make(WD.defaults[field]) : invalid.value
        expectInvalid(() => resolveConfig(schemas.get(mode), { ...WD.defaults, [field]: value }), 'integer field rejects this invalid representation through full native resolve')
      })
    }
  }
}

/** Return only non-executing public sentinels. Any runtime operation is a hard failure. */
function forbiddenService(name, calls, optional) {
  const service = Object.create(null)
  for (const operation of WD.operationPaths[name]) {
    const path = operation.split('.')
    const key = path.pop()
    let target = service
    for (const part of path) target = target[part] ??= Object.create(null)
    target[key] = () => {
      const point = name + '.' + operation
      calls.push(point)
      throw new Error('WD-1 skeleton must not perform runtime operations: ' + point)
    }
  }
  if (optional && Object.hasOwn(optional, 'apiVersion')) service.apiVersion = optional.apiVersion
  return service
}

async function contextFor(t, { missing, optional = WD.optional[WD.first], expectedValidationFailure = false } = {}) {
  const root = new host.Context()
  const calls = []
  const logs = []
  const transitions = []
  const services = new Map()
  root.logger.exporter({ levels: { default: WD.loggerDebugLevel }, export: (message) => { logs.push(message) } })
  root.on(WD.statusEvent, (fiber) => { transitions.push({ fiber, state: fiber.state }) })
  t.after(async () => {
    await root.fiber.dispose()
    assert.equal(root.registry.size, WD.emptyCount, 'all isolated plugin fibers were disposed')
    for (const name of [...WD.services, WD.optionalService]) assert.equal(root.get(name), undefined, 'no fixture service escaped teardown')
    assert.equal(calls.length, WD.emptyCount, 'no runtime operations were attempted, even if caught by product code')
    if (!expectedValidationFailure) assert.equal(logs.filter((entry) => entry.type === WD.errorLevel).length, WD.emptyCount, 'no startup/disposal errors were hidden by Cordis')
    assertNoForbiddenAttempts()
  })
  const provide = async (name, choice) => {
    const service = forbiddenService(name, calls, choice)
    services.set(name, service)
    const provider = await root.plugin({
      name: 'wd1-memory-' + name,
      apply(ctx) { ctx.provide(name, service) },
    })
    assert.equal(provider.state, WD.state.ACTIVE)
    return provider
  }
  for (const name of WD.services) if (name !== missing) await provide(name)
  if (optional.present) await provide(WD.optionalService, optional)
  t.diagnostic(`Installed DSH ${host.dshVersion}; actual Cordis ${host.cordisVersion}; fail-closed in-memory peripherals only.`)
  return { root, calls, logs, transitions, services, provide }
}

function assertActive(harness, fiber) {
  assert.equal(fiber.state, WD.state.ACTIVE, 'the actual native host activated the row, not merely a direct apply call')
  assert.ok(harness.transitions.some((entry) => entry.fiber === fiber && entry.state === WD.state.ACTIVE))
  assert.equal(harness.calls.length, WD.emptyCount, 'active skeleton made no runtime claims or readiness/agent contributions')
}

async function disposeRow(harness, fiber) {
  await fiber.dispose()
  assert.equal(fiber.state, WD.state.DISPOSED)
  assert.equal(fiber.uid, null)
  assert.equal(harness.root.registry.has(row), false, 'native registry removed the public row runtime')
  assert.equal(fiber.getEffects().length, WD.emptyCount, 'row-owned effects were drained')
  assert.equal(harness.calls.length, WD.emptyCount)
}

test('WD1-NATIVE-METADATA: native host declares mandatory services but never gates on the optional instance', () => {
  assert.equal(row.name, WD.name)
  const dependencies = Array.isArray(row.inject) ? row.inject : Object.keys(row.inject ?? {})
  for (const name of WD.services) assert.ok(dependencies.includes(name), 'mandatory dependency is declared: ' + name)
  assert.equal(dependencies.includes(WD.optionalService), false, 'optional service must not become a Cordis gate')
  assert.equal(dependencies.includes(WD.optionalService + '?'), false, 'question-mark spelling is not an optional native Cordis dependency')
})

for (const optional of WD.optional) {
  test(`WD1-NATIVE-DT-${optional.id}: all mandatory services activate without runtime registrations`, { timeout: WD.timeoutMs }, async (t) => {
    const harness = await contextFor(t, { optional })
    const fiber = await harness.root.plugin(row, {})
    assertActive(harness, fiber)
    // rc.1 exposes activation output as effectiveConfig; rc.5 stores it in config.
    // Both are public native SDK surfaces, selected without product-version branching.
    assertKnownFields('effectiveConfig' in fiber ? fiber.effectiveConfig : fiber.config, WD.defaults)
    if (!optional.present) assert.equal(harness.root.get(WD.optionalService), undefined)
    await disposeRow(harness, fiber)
  })
}

for (const missing of WD.services) {
  test(`WD1-NATIVE-DT-ST-${missing}: mandatory absence gates activation and native availability drives lifecycle`, { timeout: WD.timeoutMs }, async (t) => {
    const compatible = WD.optional.find((entry) => entry.id === 'api1')
    const harness = await contextFor(t, { missing, optional: compatible })
    const fiber = await harness.root.plugin(row, {})
    assert.equal(fiber.state, WD.state.PENDING)
    assert.equal(harness.calls.length, WD.emptyCount)
    assert.equal(harness.transitions.some((entry) => entry.fiber === fiber && entry.state === WD.state.ACTIVE), false)
    const firstProvider = await harness.provide(missing)
    await fiber.await()
    assertActive(harness, fiber)
    await firstProvider.dispose()
    await fiber.await()
    assert.equal(fiber.state, WD.state.PENDING, 'loss of a mandatory service deactivates the row')
    const replacement = await harness.provide(missing)
    await fiber.await()
    assertActive(harness, fiber)
    await disposeRow(harness, fiber)
    await replacement.dispose()
    await harness.provide(missing)
    assert.equal(fiber.state, WD.state.DISPOSED, 'service recovery cannot resurrect an explicitly disposed row')
  })
}

test('WD1-NATIVE-ST-OPTIONAL: optional service arrival, upgrade, and disappearance never gate the active skeleton', { timeout: WD.timeoutMs }, async (t) => {
  const harness = await contextFor(t)
  const fiber = await harness.root.plugin(row, {})
  assertActive(harness, fiber)
  for (const id of ['older-api0', 'api1']) {
    const choice = WD.optional.find((entry) => entry.id === id)
    const provider = await harness.provide(WD.optionalService, choice)
    await fiber.await()
    assertActive(harness, fiber)
    await provider.dispose()
    await fiber.await()
    assertActive(harness, fiber)
  }
  await disposeRow(harness, fiber)
})

test('WD1-NATIVE-HOST-CONFIG: actual Cordis rejects insufficient full config before row activation', { timeout: WD.timeoutMs }, async (t) => {
  const harness = await contextFor(t, { expectedValidationFailure: true })
  const boundary = WD.budgets.find((entry) => entry.id === 'read8192')
  const fiber = harness.root.plugin(row, { turnGrowthTokens: boundary.minimum - WD.neighbor })
  await assert.rejects(fiber.await(), isConfigRejection, 'native standard-schema validation rejects the under-budget startup')
  assert.equal(fiber.state, WD.state.FAILED)
  assert.equal(harness.transitions.some((entry) => entry.fiber === fiber && entry.state === WD.state.ACTIVE), false)
  assert.equal(harness.calls.length, WD.emptyCount)
  await disposeRow(harness, fiber)
})
