/**
 * W0 / WD-1 — the `fishball-watchdog` skeleton: package, row, typed config and constants.
 *
 * Source: docs/plugins/watchdog-design.md §9 (settings), §12 (package), §14 WD-1 ("the row loads
 * with a stub fishballInstance; §9 bounds enforced"), reconciled by the final instance design
 * Pinned 9cafd921be8a8e67f828ab225bf5fe636887c5c5 §2.8 and U7/U14/U17/U20/U21:
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
const BUDGET = Object.freeze({
  defaultReadBytes: 8192,
  defaultOutputTokens: 1024,
  defaultGrowthSamples: [[9984, false], [9985, true], [9986, true]],
  // Fixed requirement-derived values: never calculate the oracle with product/test predicates.
  readRounding: [[8190, 2730, 9982], [8191, 2731, 9985], [8192, 2731, 9985], [8193, 2731, 9985], [8194, 2732, 9988]],
  alternateOutputTokens: 2048,
  alternateMinimumGrowthTokens: 11_009,
  alternateGrowthSamples: [[10_000, false], [11_008, false], [11_009, true], [11_010, true]],
  fieldValidButIncoherent: { readMaxBytes: 1_048_576, maxOutputTokens: 256, turnGrowthTokens: 50_000 },
  integerFields: ['readMaxBytes', 'maxOutputTokens', 'turnGrowthTokens', 'contextRolloverTokens'],
  fraction: 0.5,
  neighbourOffsets: [-1, 0, 1],
})
const OPTIONAL_SERVICES = Object.freeze(['fishballInstance', 'fishballInstance?', 'fishballChat', 'fishballChat?'])

async function assertBudgetSamples(companions, samples) {
  const { Config } = await packageModule(WATCHDOG, 'index.js')
  for (const [turnGrowthTokens, accepts] of samples) {
    const parse = () => Config({ ...companions, turnGrowthTokens })
    const label = JSON.stringify({ ...companions, turnGrowthTokens })
    if (accepts) assert.doesNotThrow(parse, label)
    else assert.throws(parse, label)
  }
}

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
    assert.ok(manifest.peerDependencies?.['dsh-instance'], 'peerDependencies names the instance')
  })

  it('WD1-EP-V-02 Samuel saves Fishball tokens with a small-context helper — W0: the row exports name, inject, Config and apply', async () => {
    const row = await packageModule(WATCHDOG, 'index.js')
    assert.equal(row.name, 'fishball-watchdog')
    assert.ok(Array.isArray(row.inject), 'inject is a list')
    for (const service of ['agents', 'tools', 'llm', 'profileContext']) {
      assert.ok(row.inject.includes(service), 'inject ' + service)
    }
    // Cordis treats '?' literally; optional public lookup must not gate row activation.
    for (const service of OPTIONAL_SERVICES) assert.ok(!row.inject.includes(service), service + ' must not gate activation')
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
    assert.doesNotThrow(() => Config({ maxOutputTokens: BUDGET.alternateOutputTokens, turnGrowthTokens: BUDGET.alternateMinimumGrowthTokens }))
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

describe('WD1 deterministic budget Config acceptance (§2.8)', () => {
  for (const [growth, accepts] of BUDGET.defaultGrowthSamples) {
    it(`WD1-BVA-GROWTH-DEFAULT-${growth} Samuel saves coherent default budgets — W0: growth ${growth} ${accepts ? 'passes' : 'fails'} required 9985`, async () => {
      await assertBudgetSamples({ readMaxBytes: BUDGET.defaultReadBytes, maxOutputTokens: BUDGET.defaultOutputTokens }, [[growth, accepts]])
    })
  }
  for (const [readMaxBytes, perReadTokens, minimumGrowth] of BUDGET.readRounding) {
    it(`WD1-BVA-GROWTH-READ-${readMaxBytes} Samuel saves rounded read budgets — W0: each read is ${perReadTokens} tokens, growth ${minimumGrowth - 1}/${minimumGrowth}/${minimumGrowth + 1} rejects/accepts/accepts`, async () => {
      await assertBudgetSamples({ readMaxBytes, maxOutputTokens: BUDGET.defaultOutputTokens }, BUDGET.neighbourOffsets.map((offset) => [minimumGrowth + offset, offset >= 0]))
    })
  }
  it('WD1-DT-GROWTH-OUTPUT Samuel raises output to 2048 — W0: R1/R2 growth10000/11008 reject, R3/R4 growth11009/11010 pass', async () => {
    await assertBudgetSamples({ readMaxBytes: BUDGET.defaultReadBytes, maxOutputTokens: BUDGET.alternateOutputTokens }, BUDGET.alternateGrowthSamples)
  })
  it('WD1-DT-GROWTH-FIELD-VALID Samuel cannot combine every valid field — W0: R5 read1048576/output256/growth50000 individually pass but full Config needs1049602 and rejects', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    for (const [key, value] of Object.entries(BUDGET.fieldValidButIncoherent)) assert.doesNotThrow(() => Config.dict[key](value), key)
    assert.throws(() => Config({ ...BUDGET.fieldValidButIncoherent }))
  })
  it('WD1-EP-BUDGET-INTEGER Samuel supplies numeric budget/byte settings — W0: fractions reject independently with otherwise coherent companions', async () => {
    const { Config } = await packageModule(WATCHDOG, 'index.js')
    for (const key of BUDGET.integerFields) assert.throws(() => Config({ [key]: configDefault(Config, key) + BUDGET.fraction }), key)
  })
})

// Defined oracle, future-owned API/fixtures: never substitute a self-testing measurement predicate.
// Concrete serialized data and all boundary vectors precede these cases in the story document.
describe('WD1 fully specified later budget journeys, not W0 runtime evidence', () => {
  it.todo('WD1-ST-BUDGET-SAVE Samuel corrects a rejected save — [WD-1/WD-12] saved growth10000, reject9984 atomically retaining10000, accept9985; read8192/output1024')
  it.todo('WD1-EP-BUDGET-MEASURE Samuel counts canonical UTF8 bytes — [WD-8/WD-10/WD-12] bytes0/1/2/3/4/6/7/9/10 => tokens0/1/1/1/2/2/3/3/4; canonical primitives and objects in story; no provider usage oracle')
  it.todo('WD1-EP-BUDGET-CANONICAL Samuel keeps Unicode evidence intact — [WD-8/WD-10/WD-12] key order canonicalizes to16bytes/6tokens; composed é4bytes vs decomposed e+U0301 5bytes, emoji6bytes; no normalization or UTF16 measurement')
  it.todo('WD1-UC-BUDGET-CONTEXT-M Samuel pays for one full context — [WD-8/WD-10/WD-12] system/brief/criteria/tools/digest/messages/calls/results/proposed input once; C60000 then63000 atR64000 keeps epoch, not sum123000; provider usage1/999999 irrelevant')
  it.todo('WD1-BVA-CARD-2303 Samuel submits an intact bounded card — [WD-10/WD-12] canonical complete127byte wrapper plus2176 ASCII bytes =>2303bytes/768tokens fits including all fields, labels and multibyte quotes')
  it.todo('WD1-BVA-CARD-2304 Samuel submits an exact-limit card — [WD-10/WD-12] same127byte wrapper plus2177 =>2304bytes/768tokens fits inclusive')
  it.todo('WD1-BVA-CARD-2305 Samuel submits an oversized card — [WD-10/WD-12] same127byte wrapper plus2178 =>2305bytes/769tokens; intact Fishball route, zero model calls/truncation/plugin fault')
  it.todo('WD1-DT-BUDGET-NONREAD Samuel shares one turn allowance — [WD-8/WD-10/WD-12] complete measured nonread total2304 fits,2305 does not despite independent field validity; no allowance per quote/reply/trigger; card intact to Fishball vs check fails off; read caps include wrappers')
  it.todo('WD1-BVA-CONTEXT-MIN Samuel saves a resolvable model budget — [WD-1/WD-8/WD-12] rollover64000/growth10000/output1024 windows27023/27024/27025 =>R15999/16000/16001; reject model-context-too-small/pass/pass, no invented model-window setting')
  it.todo('WD1-ST-BUDGET-ROLLOVER Samuel continues after a full turn — [WD-8/WD-12] R64000 largestC63999/64000/64001 keeps/rotates/rotates; finish turn, new epoch before next; rebuiltC1000, no midturn rotation or65536 threshold')
  it.todo('WD1-ST-BUDGET-PREFLIGHT Samuel adds input or revises a brief — [WD-8/WD-12] priorC63000 then proposed nextC63999/64000/64001 keeps/rotates/rotates before dispatch; rebuild once to1000, no boundary skip')
  it.todo('WD1-ST-BUDGET-FRESH Samuel cannot fit a fresh epoch — [WD-8/WD-12] rebuiltC63999 dispatches;64000/64001 atR64000 fail off once, no loop/dispatch/stop, release claims/pass sends/recover dormant, no compacted decisions in digest')
  it.todo('WD1-BVA-CONTEXT-TURN Samuel finishes one decision without midturn rotation — [WD-8/WD-10/WD-12] R64000+growth10000 ceiling74000 fits C73999/74000, refuses74001; with initial63999 independent growth10000/10001/10002 means full conjunction pass/fail/fail')
  it.todo('WD1-BVA-BUDGET-GROWTH Samuel bounds measured turn growth — [WD-8/WD-10/WD-12] initialC63000 later72999/73000/73001 =>growth9999/10000/10001 pass/pass/fail off before request; same-turn crossingR64000 does not rotate')
  it.todo('WD1-BVA-BUDGET-OUTPUT Samuel bounds all responses in a turn — [WD-8/WD-10/WD-12] canonical response bytes1535 then1533/1536/1539 separately round512+511/512/513 =>sum1023/1024/1025 pass/pass/fail before request or verdict; discriminator1535+1537bytes =>512+513=1025fails though combined rounding1024; include tool calls')
  it.todo('WD1-DT-BUDGET-FAILURE Samuel retains Fishball supervision on budget failure — [WD-8/WD-9/WD-10/WD-12/X0-S/WD-13] measurement failure/window unresolved or noninteger/provider context rejection/exceeded check-growth-output allowance fail whole plugin off, release claims/pass sends/recovery dormant, no stop/halt; normal rollover and oversized individual card not faults')
})

// Story continuation only: W0 config/load does not exercise connector or rendered cards.
it.todo('WD1-UC-APPROVAL-M Samuel relies on the token-saving helper while present or away — deferred: [WD-8/WD-10/K2/PANELS] decide or escalate immediately on decision-turn end, no approval timers/R4 expiresAt budget; user card waits without time limit, resolved cards clear with reached-layer transcript result')
