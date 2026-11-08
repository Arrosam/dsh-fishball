/**
 * W0 / WD-1 — the `fishball-watchdog` skeleton: package, row, typed config and constants.
 *
 * Source: docs/plugins/watchdog-design.md §9 (settings), §12 (package), §14 WD-1 ("the row loads
 * with a stub fishballInstance; §9 bounds enforced"), reconciled by the final instance design
 * Pinned 15d6f1f214144db3575f9bc0ba15238b1450c2a7 U7/U14/U17/U20/U21:
 * DSH's bundle switch is the configured off switch; only healthy/ready is effective on.
 * Failure hands over without stop/halt, questions always bypass watchdog, approval timers/window sums are removed,
 * and auditEntriesKept bounds non-decision operational audit only, never decision history.
 *
 * Observation points: the package files, the row exports, the Config schema defaults/bounds, and
 * `apply` over a stub child context.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PACKAGE, configDefault, packageJson, packageModule } from '../../../../test/support/instance-ext-plugins.mjs'

const WATCHDOG = PACKAGE.watchdog

/** Final §9 settings: check/guard timers remain; decision history has no bounded audit store. */
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
  ['maxChecksPerHour', 30, 1, 1000],
  ['maxChecksPerDay', 200, 1, 10_000],
  ['maxConcurrentDecisions', 2, 1, 10],
  ['maxQuoteChars', 500, 50, 2048],
  ['maxCriteria', 20, 1, 100],
  ['maxCriteriaChars', 8000, 1000, 32_000],
  ['auditEntriesKept', 2000, 100, 100_000], // Operational audit only (U17); not decisions.
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
      inbox: { claim: () => () => {}, release: () => {}, setBatcher: () => () => {} },
      approvals: { claim: () => () => {}, card: () => undefined, onSettled: () => () => {}, answerApproval: async () => ({ ok: true }) },
      bridge: () => ({ request: async () => ({}) }),
      sideAgents: { open: async () => ({ agent: {}, sessionId: 's', setSection: () => {} }), runTurn: async () => ({}), cancel: () => {} },
      supervision: { register: () => ({ ready: () => {}, fail: () => {}, set: () => {}, clear: () => {}, handedOver: [], dispose: () => {} }), onManagedChange: () => () => {}, endingReason: () => undefined },
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
  it('WD1-EP-V-01 Samuel saves Fishball tokens with a small-context helper — W0: the package is fishball-watchdog 0.1.0-alpha.0 for DSH >=0.2.1-rc.5', async () => {
    const manifest = await packageJson(WATCHDOG)
    assert.equal(manifest.name, 'fishball-watchdog')
    assert.equal(manifest.version, '0.1.0-alpha.0')
    assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
    assert.match(manifest.engines?.dsh ?? '', />=0\.2\.1-rc\.5/)
    assert.ok(manifest.peerDependencies?.['fishball-instance'], 'peerDependencies names the instance')
  })

  it('WD1-EP-V-02 Samuel saves Fishball tokens with a small-context helper — W0: the row exports name, inject, Config and apply', async () => {
    const row = await packageModule(WATCHDOG, 'index.js')
    assert.equal(row.name, 'fishball-watchdog')
    for (const service of ['agents', 'tools', 'llm', 'profileContext', 'fishballInstance?']) {
      assert.ok(row.inject?.includes(service), 'inject ' + service)
    }
    assert.equal(typeof row.apply, 'function')
    assert.equal(typeof row.Config, 'function', 'DSH reads the Config schema export')
  })

  it('WD1-UC-LOAD-M Samuel saves Fishball tokens with a small-context helper — W0: [formerly WD1-DT-01] the row loads over a stub fishballInstance', async () => {
    const row = await packageModule(WATCHDOG, 'index.js')
    await assert.doesNotReject(async () => row.apply(stubContext(), {}))
  })

  // Canonical §1: optional injection treats an absent service as an older instance.
  it('WD1-UC-LOAD-A Samuel saves Fishball tokens with a small-context helper — W0: [formerly WD1-DT-02] the row loads without the optional fishballInstance service', async () => {
    const row = await packageModule(WATCHDOG, 'index.js')
    await assert.doesNotReject(async () => row.apply(stubContext({ withInstance: false }), {}))
  })
})

describe('WD-1 config defaults and bounds (§9, U7/U14/U17)', () => {
  it('WD1-UC-CONFIG-M Samuel saves Fishball tokens with a small-context helper — W0: [formerly WD1-EP-V-04] remaining settings declare designed defaults; operational audit retention is not decision retention', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    for (const [key, value] of [...BOOLEANS, ...TEXTS, ...NUMBERS.map(([key, value]) => [key, value])]) {
      assert.equal(configDefault(Config, key), value, key)
    }
  })

  it('WD1-BVA-01 Samuel saves Fishball tokens with a small-context helper — W0: each numeric field schema accepts its bounds and refuses min−1 and max+1 independently of growth cross-field validation', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    for (const [key, , min, max] of NUMBERS) {
      const field = Config.dict?.[key]
      assert.equal(typeof field, 'function', key + ' exposes its public field schema')
      // A valid field endpoint may be incoherent with another field's default (§9 growth rule).
      // Isolate the declared field bound, rather than invent companion token/read budgets.
      assert.doesNotThrow(() => field(min), key + ' min')
      assert.doesNotThrow(() => field(max), key + ' max')
      assert.throws(() => field(min - 1), key + ' min-1')
      assert.throws(() => field(max + 1), key + ' max+1')
    }
  })

  it('WD1-EP-01 Samuel saves Fishball tokens with a small-context helper — W0: no enabled control or approval-time settings remain (U7/U14)', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    for (const key of ['enabled', 'decisionTimeoutSeconds', 'managerReserveSeconds', 'minDecisionSeconds']) {
      assert.equal(Config.dict?.[key], undefined, key + ' is removed')
    }
  })
})

// Flows defined before these tests in docs/test-design/instance-ext-w0-skeleton-use-cases.md.
describe('WD1 token-saving helper configuration and deferred bundle journeys', () => {
  it('WD1-UC-CONFIG-A Samuel saves Fishball tokens with a small-context helper — W0: user chooses supported non-default maxOutputTokens', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    assert.doesNotThrow(() => Config({ maxOutputTokens: 2048 }))
  })

  it('WD1-UC-CONFIG-E Samuel saves Fishball tokens with a small-context helper — W0: user submits an invalid setting and Config rejects it', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    const [key, , min] = NUMBERS[0]
    assert.throws(() => Config({ [key]: min - 1 }))
  })
  it.todo('WD1-UC-BUNDLE-M Samuel saves Fishball tokens with a small-context helper — deferred: [X0-B/X0-S] configured bundle membership is not readiness; enabled-unregistered is effective off, pass sends and route permissions to Fishball regardless of user presence')
  it.todo('WD1-UC-BUNDLE-A Samuel saves Fishball tokens with a small-context helper — deferred: [X0-B/X0-S/WD-13] user disable invalidates generation and hands over once without stop/halt/unwatch or erasing briefs')
  it.todo('WD1-UC-BUNDLE-E Samuel saves Fishball tokens with a small-context helper — deferred: [X0-B/X0-S] enabled failed placement is plugin-gone, immediate effective-off Fishball handover and visible fault even for zero sessions; sends pass, setting unchanged')
  it.todo('WD1-UC-BUNDLE-R Samuel saves Fishball tokens with a small-context helper — deferred: [X0-S/WD-13] model/store/hook checks and persisted dormant briefs precede ready; no automatic resume/reclaim, stale generation cannot set/claim/answer')
  it.todo('WD1-UC-BUNDLE-F Samuel saves Fishball tokens with a small-context helper — deferred: [X0-C/X0-S/WD-13] disposal/reload while enabled has failure endingReason but same immediate Fishball handover, no grace or stop; storage fault opens routes/gate in memory first, one stable retryable notice')
  it.todo('WD1-UC-QUESTION-M Samuel gets an answer from Fishball without waking the permission helper — deferred: [X0-I/X0-A/WD-10/WD-11/WD-12] active/paused claims never receive independent questions or plan reviews in onCard, decision queue or context')
  it.todo('WD1-UC-QUESTION-A Samuel refines direction separately while Fishball answers — deferred: [X0-A/WD-3/WD-4/WD-6/WD-11/WD-12] refinement failure never withholds/repeats answer; paused/dormant refinement cannot check/resume/claim')
})

it.todo('WD1-DT-GROWTH Samuel chooses coherent helper read/output budgets — [owner: WD-1] retained growth cross-field rule below/equal/above readMaxBytes*(1+readsPerTurn)/3 + card + maxOutputTokens; readsPerTurn is 2; freeze card-token measurement and rounding, no invented companion vector')

// Story continuation only: W0 config/load does not exercise connector or rendered cards.
it.todo('WD1-UC-APPROVAL-M Samuel relies on the token-saving helper while present or away — deferred: [WD-8/WD-10/K2/PANELS] decide or escalate immediately on decision-turn end, no approval timers/R4 expiresAt budget; user card waits without time limit, resolved cards clear with reached-layer transcript result')
