/**
 * Supplementary FN-1/B1 framework verification, not real tools/agents host API evidence.
 * Oracles: instance-ext-w0-decisions.md §4 and instance-ext-w0-skeleton-use-cases.md
 * FN1-UC-LOAD/B1-UC-LOAD only. No product implementation is inspected by this test.
 *
 * EP/DT: optional public service present/absent; required tools present/absent.
 * ST: real Cordis plugin activation -> ACTIVE -> DISPOSED, or PENDING -> DISPOSED.
 * Peripheral services only retain registrations in memory; setup callbacks, tools, models,
 * profiles, launchers, persistence, UI and wakes are deliberately not exercised.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'
import { loadInstance } from '../support/body-soul-env.mjs'
import { RUNTIME_PARENT_URL } from '../support/provider-sync-sdk.mjs'
import { installNetworkTripwire } from '../fixtures/runtime-isolation-support.mjs'

const PROBE = Object.freeze({
  versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  timeoutMs: 5_000,
  emptyCount: 0,
  warningCount: 1,
  apiVersion: 1,
  sessionId: 'w0-cordis-memory-manager',
  fixtureName: 'w0-cordis-memory-services',
  missingHooks: 'instance-hooks-missing',
  statusEvent: 'internal/status',
  errorLevel: 'error',
  warningLevel: 'warn',
  loggerDebugLevel: 3,
  // Installed .d.ts declares this const enum; the JS package does not export it.
  state: Object.freeze({ PENDING: 0, ACTIVE: 2, DISPOSED: 4 }),
  point: Object.freeze({ tool: 'tool', setup: 'setup', batcher: 'batcher', claim: 'claim', attention: 'attention' }),
  service: Object.freeze({ tools: 'tools', instance: 'fishballInstance' }),
  plugins: Object.freeze([
    Object.freeze({ id: 'FN1', entry: '../fold-notify/index.js' }),
    Object.freeze({ id: 'B1', entry: '../board/index.js' }),
  ]),
})

let host
let network
const rows = new Map()

before(async () => {
  network = installNetworkTripwire()
  // No default-runtime fallback: each TAP run must explicitly select an installed pinned host.
  assert.ok(process.env.FBTEST_DSH_RUNTIME, 'set FBTEST_DSH_RUNTIME to a pinned installed node_modules directory')
  const runtimeRequire = createRequire(RUNTIME_PARENT_URL)
  const manifest = async (name) => JSON.parse(await readFile(runtimeRequire.resolve(name + '/package.json'), 'utf8'))
  const dsh = await manifest('@deepseek-ai/dsh')
  const cordis = await manifest('@deepseek-ai/cordis')
  assert.ok(PROBE.versions.includes(dsh.version), 'only the two requested installed DSH versions are eligible')
  const sdk = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/cordis')).href)
  host = { ...sdk, dshVersion: dsh.version, cordisVersion: cordis.version }
  // Reuse only the resolver hook. Do not import source-reading/linking package helpers.
  for (const plugin of PROBE.plugins) rows.set(plugin.id, await loadInstance(plugin.entry))
})

after(() => {
  if (!network) return
  try {
    assert.equal(network.attempts.length, PROBE.emptyCount, 'no network entry point was attempted')
  } finally {
    network.restore()
  }
})

/** The same minimal public surface as existing safe W0 fixtures, with observable disposers. */
function memoryServices() {
  const registrations = new Set()
  const register = (point, value) => {
    const record = { point, value }
    registrations.add(record)
    return () => { registrations.delete(record) }
  }
  return {
    registrations,
    tools: { register: (definition) => register(PROBE.point.tool, definition) },
    instance: {
      apiVersion: PROBE.apiVersion,
      manager: {
        sessionId: () => PROBE.sessionId,
        registerSetup: (pluginId, callback) => register(PROBE.point.setup, { pluginId, callback }),
      },
      inbox: {
        setBatcher: (batcher) => register(PROBE.point.batcher, batcher),
        claim: (claim) => register(PROBE.point.claim, claim),
      },
      attention: { set: (state) => register(PROBE.point.attention, state) },
    },
  }
}

async function contextFor(t, { withTools, withInstance }) {
  const root = new host.Context()
  const memory = memoryServices()
  const logs = []
  const transitions = []
  // Cordis 4.0.5 numbers WARN above its default INFO threshold; explicitly observe
  // DEBUG/all severities so an exporter filter cannot masquerade as a missing warning.
  root.logger.exporter({ levels: { default: PROBE.loggerDebugLevel }, export: (message) => { logs.push(message) } })
  root.on(PROBE.statusEvent, (fiber) => { transitions.push({ fiber, state: fiber.state }) })
  let provider
  t.after(async () => {
    // A root fiber's dispose() drains/restarts the root; it does not become DISPOSED.
    // Check the child provider, registry and services instead of assuming root final state.
    await root.fiber.dispose()
    if (provider) assert.equal(provider.state, PROBE.state.DISPOSED)
    assert.equal(root.registry.size, PROBE.emptyCount, 'no child plugin runtime remains')
    for (const name of Object.values(PROBE.service)) assert.equal(root.get(name), undefined, 'fixture service removed')
    assert.equal(memory.registrations.size, PROBE.emptyCount, 'no in-memory contribution remains')
    assert.equal(logs.filter((entry) => entry.type === PROBE.errorLevel).length, PROBE.emptyCount, 'no startup/disposal error logged')
  })
  provider = await root.plugin({
    name: PROBE.fixtureName,
    apply(ctx) {
      if (withTools) ctx.provide(PROBE.service.tools, memory.tools)
      if (withInstance) ctx.provide(PROBE.service.instance, memory.instance)
    },
  })
  assert.equal(provider.state, PROBE.state.ACTIVE)
  t.diagnostic(`Actual Cordis ${host.cordisVersion}, installed DSH ${host.dshVersion}; in-memory peripherals only; no real tools/agents host API.`)
  return { root, memory, logs, transitions }
}

function assertDisposed(harness, fiber, row) {
  assert.equal(fiber.state, PROBE.state.DISPOSED)
  assert.equal(fiber.uid, null)
  assert.equal(fiber.getEffects().length, PROBE.emptyCount, 'plugin effects drained')
  assert.equal(harness.root.registry.has(row), false, 'public row runtime removed')
  assert.equal(harness.memory.registrations.size, PROBE.emptyCount, 'plugin released its peripheral registrations')
  assert.ok(harness.transitions.some((entry) => entry.fiber === fiber && entry.state === PROBE.state.DISPOSED))
}

function missingHooksWarnings(harness) {
  return harness.logs.filter((entry) => entry.type === PROBE.warningLevel
    && entry.args.some((argument) => String(argument).includes(PROBE.missingHooks))).length
}

for (const plugin of PROBE.plugins) {
  for (const withInstance of [true, false]) {
    test(`${plugin.id}-CORDIS-UC-LOAD-${withInstance ? 'M' : 'A'}: actual activation/disposal with optional fishballInstance ${withInstance ? 'present' : 'absent'}`, { timeout: PROBE.timeoutMs }, async (t) => {
      const harness = await contextFor(t, { withTools: true, withInstance })
      const row = rows.get(plugin.id)
      const fiber = await harness.root.plugin(row, {})
      // Await means lifecycle settled, not necessarily ACTIVE: a literal '?' dependency
      // would settle PENDING. Assert the framework state, not just lack of rejection.
      assert.equal(fiber.state, PROBE.state.ACTIVE, 'public plugin actually activated')
      assert.ok(harness.transitions.some((entry) => entry.fiber === fiber && entry.state === PROBE.state.ACTIVE))
      if (!withInstance) assert.equal(harness.root.get(PROBE.service.instance), undefined)
      const expectedWarnings = withInstance ? PROBE.emptyCount : PROBE.warningCount
      if (plugin.id === 'B1') assert.equal(missingHooksWarnings(harness), expectedWarnings)
      await fiber.dispose()
      assertDisposed(harness, fiber, row)
      if (plugin.id === 'B1') assert.equal(missingHooksWarnings(harness), expectedWarnings, 'disposal adds no duplicate absence warning')
    })
  }

  test(`${plugin.id}-CORDIS-DT-TOOLS-MISSING: public instance alone cannot pass the required tools gate`, { timeout: PROBE.timeoutMs }, async (t) => {
    const harness = await contextFor(t, { withTools: false, withInstance: true })
    const row = rows.get(plugin.id)
    const fiber = await harness.root.plugin(row, {})
    assert.equal(fiber.state, PROBE.state.PENDING, 'missing required tools prevents activation')
    assert.equal(harness.transitions.some((entry) => entry.fiber === fiber && entry.state === PROBE.state.ACTIVE), false)
    assert.equal(harness.memory.registrations.size, PROBE.emptyCount, 'a gated row made no contributions')
    assert.equal(missingHooksWarnings(harness), PROBE.emptyCount, 'gated row did not run its absence path')
    await fiber.dispose()
    assertDisposed(harness, fiber, row)
  })
}
