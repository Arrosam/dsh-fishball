/**
 * W0 / WD-1 — the `fishball-watchdog` skeleton: package, row, typed config and constants.
 *
 * Source: docs/plugins/watchdog-design.md §9 (settings), §12 (package), §14 WD-1 ("the row loads
 * with a stub fishballInstance; §9 bounds enforced, including the window-sum check"), plus the
 * instance design U7 (the row's `enabled` setting is removed; DSH's bundle switch is the off
 * switch).
 *
 * Observation points: the package files, the row exports, the Config schema defaults/bounds, and
 * `apply` over a stub child context.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PACKAGE, configDefault, packageJson, packageModule } from '../../../../test/support/instance-ext-plugins.mjs'

const WATCHDOG = PACKAGE.watchdog

/** §9 table: every numeric setting, its default and its inclusive bounds. */
const NUMBERS = [
  ['maxOutputTokens', 1024, 256, 8192],
  ['contextRolloverTokens', 64_000, 16_000, 200_000],
  ['turnGrowthTokens', 10_000, 4_000, 50_000],
  ['stallSeconds', 3600, 300, 86_400],
  ['readMaxMessages', 8, 1, 100],
  ['readMaxBytes', 8192, 1024, 1_048_576],
  ['minCheckIntervalSeconds', 60, 60, 86_400],
  ['checkTimeoutSeconds', 120, 30, 900],
  ['maxActiveBriefs', 10, 1, 50],
  ['pausedPollSeconds', 30, 10, 300],
  ['guardFailures', 3, 1, 10],
  ['guardSeconds', 900, 300, 7200],
  ['guardRestops', 3, 1, 10],
  ['maxChecksPerHour', 30, 1, 1000],
  ['maxChecksPerDay', 200, 1, 10_000],
  ['decisionTimeoutSeconds', 30, 5, 110],
  ['managerReserveSeconds', 60, 0, 110],
  ['minDecisionSeconds', 10, 1, 60],
  ['maxConcurrentDecisions', 2, 1, 10],
  ['maxQuoteChars', 500, 50, 2048],
  ['maxCriteria', 20, 1, 100],
  ['maxCriteriaChars', 8000, 1000, 32_000],
  ['auditEntriesKept', 2000, 100, 100_000],
]
const BOOLEANS = [['approvalsEnabled', true]]
const TEXTS = [['model', ''], ['reasoningEffort', '']]

function stubContext({ withInstance = true } = {}) {
  const provided = new Map()
  const services = {
    agents: { create: async () => ({ agent: {} }), resume: async () => ({ agent: {} }), get: () => undefined },
    tools: { register: () => () => {}, restrict: () => () => {} },
    llm: { listProviders: () => [], listModels: () => [], resolveModelInfo: () => ({}), resolveCallConfig: (v) => v },
    profileContext: { home: '/private/tmp', name: 'fishball', dir: '/private/tmp/profiles/fishball' },
    fishballInstance: {
      apiVersion: 1,
      manager: { sessionId: () => 'session-fishball', registerSetup: () => () => {}, notify: async () => ({ status: 'queued' }), userTexts: () => [] },
      chat: { registerRecordProjector: () => () => {} },
      inbox: { claim: () => () => {}, release: () => {}, setBatcher: () => () => {} },
      approvals: { claim: () => () => {}, card: () => undefined, onSettled: () => () => {}, answerApproval: async () => ({ ok: true }) },
      bridge: () => ({ request: async () => ({}) }),
      sideAgents: { open: async () => ({ agent: {}, sessionId: 's', setSection: () => {} }), runTurn: async () => ({}), cancel: () => {} },
      supervision: { register: () => ({ set: () => {}, clear: () => {}, handedOver: [], dispose: () => {} }), onManagedChange: () => () => {}, endingReason: () => undefined },
      sessionStarts: { register: () => () => {} },
    },
  }
  if (!withInstance) delete services.fishballInstance
  return {
    get: (name) => services[name] ?? provided.get(name),
    provide: (name, value) => { provided.set(name, value); return () => provided.delete(name) },
    effect: (execute) => execute(),
    logger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
    on: () => () => {},
    ...services,
    services,
    provided,
  }
}

describe('WD-1 package and row', () => {
  it('WD1-EP-V-01 Samuel keeps supervision under his control — W0: the package is fishball-watchdog 0.1.0-alpha.0 for DSH >=0.2.1-rc.5', async () => {
    const manifest = await packageJson(WATCHDOG)
    assert.equal(manifest.name, 'fishball-watchdog')
    assert.equal(manifest.version, '0.1.0-alpha.0')
    assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
    assert.match(manifest.engines?.dsh ?? '', />=0\.2\.1-rc\.5/)
    assert.ok(manifest.peerDependencies?.['fishball-instance'], 'peerDependencies names the instance')
  })

  it('WD1-EP-V-02 Samuel keeps supervision under his control — W0: the row exports name, inject, Config and apply', async () => {
    const row = await packageModule(WATCHDOG, 'index.js')
    assert.equal(row.name, 'fishball-watchdog')
    for (const service of ['agents', 'tools', 'llm', 'profileContext', 'fishballInstance?']) {
      assert.ok(row.inject?.includes(service), 'inject ' + service)
    }
    assert.equal(typeof row.apply, 'function')
    assert.equal(typeof row.Config, 'function', 'DSH reads the Config schema export')
  })

  it('WD1-UC-LOAD-M Samuel keeps supervision under his control — W0: [formerly WD1-DT-01] the row loads over a stub fishballInstance', async () => {
    const row = await packageModule(WATCHDOG, 'index.js')
    await assert.doesNotReject(async () => row.apply(stubContext(), {}))
  })

  // Canonical §1: optional injection treats an absent service as an older instance.
  it('WD1-UC-LOAD-A Samuel keeps supervision under his control — W0: [formerly WD1-DT-02] the row loads without the optional fishballInstance service', async () => {
    const row = await packageModule(WATCHDOG, 'index.js')
    await assert.doesNotReject(async () => row.apply(stubContext({ withInstance: false }), {}))
  })
})

describe('WD-1 config defaults and bounds (§9, U7)', () => {
  it('WD1-UC-CONFIG-M Samuel keeps supervision under his control — W0: [formerly WD1-EP-V-04] every §9 default is the designed value', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    for (const [key, value] of [...BOOLEANS, ...TEXTS, ...NUMBERS.map(([key, value]) => [key, value])]) {
      assert.equal(configDefault(Config, key), value, key)
    }
  })

  it('WD1-BVA-01 Samuel keeps supervision under his control — W0: every numeric setting accepts its bounds and refuses min−1 and max+1', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    for (const [key, , min, max] of NUMBERS) {
      assert.doesNotThrow(() => Config({ [key]: min }), key + ' min')
      assert.doesNotThrow(() => Config({ [key]: max }), key + ' max')
      if (key !== NUMBERS[0][0]) assert.throws(() => Config({ [key]: min - 1 }), key + ' min-1')
      assert.throws(() => Config({ [key]: max + 1 }), key + ' max+1')
    }
  })

  it('WD1-EP-01 Samuel keeps supervision under his control — W0: the row has no `enabled` setting (U7: DSH bundle switch is the off switch)', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    assert.equal(Config.dict?.enabled, undefined, '§9 enabled is removed')
  })

  // No authoritative Config relation or invalid-input outcome is specified (test design §7.2).
  it.skip('WD1-BVA-02 Samuel keeps supervision under his control — W0: BLOCKED: define the window-sum Config rules and refusal behavior', () => {})
})

// Flows defined before these tests in docs/test-design/instance-ext-w0-skeleton-use-cases.md.
describe('WD1 user configuration and deferred bundle journeys', () => {
  it('WD1-UC-CONFIG-A Samuel keeps supervision under his control — W0: user chooses supported non-default maxOutputTokens', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    assert.doesNotThrow(() => Config({ maxOutputTokens: 2048 }))
  })

  it('WD1-UC-CONFIG-E Samuel keeps supervision under his control — W0: user submits an invalid setting and Config rejects it', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    const [key, , min] = NUMBERS[0]
    assert.throws(() => Config({ [key]: min - 1 }))
  })
  it.todo('WD1-UC-BUNDLE-M Samuel keeps supervision under his control — deferred: [X0-B/X0-S] enabled iff fishball-watchdog is in child dsh.profile.bundles; enabled-unregistered gate refuses')
  it.todo('WD1-UC-BUNDLE-A Samuel keeps supervision under his control — deferred: [X0-B/X0-S/WD-13] user disable hands over without stopping or unwatching')
  it.todo('WD1-UC-BUNDLE-E Samuel keeps supervision under his control — deferred: [X0-B/X0-S] enabled failed placement is plugin-gone; gated sends refuse')
  it.todo('WD1-UC-BUNDLE-R Samuel keeps supervision under his control — deferred: [X0-S/WD-13] re-enable restores dormant briefs without automatic resume')
  it.todo('WD1-UC-BUNDLE-F Samuel keeps supervision under his control — deferred: [X0-S/WD-13] disposal while bundle remains enabled is failure not hand-over')
})
