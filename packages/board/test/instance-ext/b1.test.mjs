/**
 * W0 / B1 — the `fishball-board` skeleton: package, row, typed config and constants.
 *
 * Source: docs/plugins/board-design.md §9 (Config ranges), §13 (package), §14 B1 ("the row loads
 * with and without the points; the Config ranges are as in §9"), §8 (the four instance points),
 * and pinned 15d6f1f214144db3575f9bc0ba15238b1450c2a7 U19/§12.6:
 * 30-day board visibility, never installed archive pruning; local W0 has no MCP transport dependency.
 * doneWindowHours may remain for a recent-done count only; its presence is not required.
 *
 * Observation points: the package files, the row exports, the Config schema, `src/constants.js`
 * and `apply` over a stub context with and without `fishballInstance`.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PACKAGE, configDefault, packageFile, packageJson, packageModule } from '../../../../test/support/instance-ext-plugins.mjs'

const BOARD = PACKAGE.board
const OPTIONAL_SERVICES = Object.freeze(['fishballInstance', 'fishballInstance?', 'fishballChat', 'fishballChat?'])

function stubContext({ withInstance = true } = {}) {
  const provided = new Map()
  const logs = []
  const services = {
    tools: { register: () => () => {} },
  }
  if (withInstance) {
    services.fishballInstance = {
      apiVersion: 1,
      manager: {
        sessionId: () => 'session-fishball',
        registerSetup: () => () => {},
      },
    }
  }
  return {
    get: (name) => services[name] ?? provided.get(name),
    provide: (name, value) => { provided.set(name, value); return () => provided.delete(name) },
    effect: (execute) => execute(),
    logger: () => ({ info() {}, warn: (...args) => logs.push(args.join(' ')), error() {}, debug() {} }),
    on: () => () => {},
    ...services,
    services,
    logs,
  }
}

describe('B1 package and row', () => {
  it('B1-EP-V-01 Samuel keeps his Fishball work board available — W0: the package is fishball-board 0.1.0-alpha.0 with the designed files and bounds', async () => {
    const manifest = await packageJson(BOARD)
    assert.equal(manifest.name, 'fishball-board')
    assert.equal(manifest.version, '0.1.0-alpha.0')
    assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
    assert.match(manifest.engines?.dsh ?? '', />=0\.2\.1-rc\.5/)
    // V3 realignment: docs/planning/v3-design.md §9.1 (line 1217) drops the `fishball-instance` peer;
    // the plugin finds fishball-core at runtime (R-FB-06), so no Fishball package is a peer.
    assert.equal(manifest.peerDependencies?.['fishball-instance'], undefined, 'no fishball-instance peer (design §9.1)')
    for (const file of ['index.js', 'src/constants.js', 'src/config.js', 'README.md']) await packageFile(BOARD, file)
  })

  it('B1-EP-V-02 Samuel keeps his Fishball work board available — W0: the row exports name, inject, Config and apply', async () => {
    const row = await packageModule(BOARD, 'index.js')
    assert.equal(row.name, 'fishball-board')
    assert.ok(Array.isArray(row.inject), 'inject is a list')
    assert.ok(row.inject.includes('tools'), 'inject tools')
    // Runtime lookup is optional; Cordis treats '?' as a literal required-service name.
    for (const service of OPTIONAL_SERVICES) assert.ok(!row.inject.includes(service), service + ' must not gate activation')
    assert.equal(typeof row.apply, 'function')
    assert.equal(typeof row.Config, 'function', 'DSH reads the Config schema export')
  })

  it('B1-UC-CONFIG-M Samuel keeps his Fishball work board available — W0: [formerly B1-EP-V-03] required defaults are inject true and contextCards 20; optional recent-done count is not visibility', async () => {
    const { Config } = await packageModule(BOARD, 'index.js')
    assert.equal(configDefault(Config, 'inject'), true)
    assert.equal(configDefault(Config, 'contextCards'), 20)
    if (Config.dict?.doneWindowHours !== undefined) assert.equal(configDefault(Config, 'doneWindowHours'), 24)
  })

  it('B1-BVA-01 Samuel keeps his Fishball work board available — W0: contextCards is an integer 0…30 (0 = the counts line only)', async () => {
    const { Config } = await packageModule(BOARD, 'index.js')
    for (const value of [0, 1, 30]) assert.doesNotThrow(() => Config({ contextCards: value }))
    for (const value of [-1, 31]) assert.throws(() => Config({ contextCards: value }))
    assert.throws(() => Config({ contextCards: 1.5 }))
  })

  it('B1-BVA-02 Samuel keeps his Fishball work board available — W0: if retained, recent-done count doneWindowHours is an integer 0…168, never the panel cutoff', async () => {
    const { Config } = await packageModule(BOARD, 'index.js')
    if (Config.dict?.doneWindowHours === undefined) return // U19 permits removal or count-only retention.
    for (const value of [0, 1, 168]) assert.doesNotThrow(() => Config({ doneWindowHours: value }))
    for (const value of [-1, 169]) assert.throws(() => Config({ doneWindowHours: value }))
  })

  it('B1-UC-CONFIG-A Samuel keeps his Fishball work board available — W0: [formerly B1-EP-01] inject is a boolean', async () => {
    const { Config } = await packageModule(BOARD, 'index.js')
    assert.doesNotThrow(() => Config({ inject: true }))
    assert.doesNotThrow(() => Config({ inject: false }))
  })

  it('B1-EP-V-04 Samuel keeps his Fishball work board available — W0: the constants carry the six statuses and the frozen limits', async () => {
    const constants = await packageModule(BOARD, 'src/constants.js')
    assert.equal(constants.NAMESPACE, 'fishball-board')
    assert.deepEqual(Object.values(constants.STATUS).sort(), ['done', 'dropped', 'in_progress', 'paused', 'todo', 'waiting'])
    assert.equal(constants.BOARD_LIMITS.cards, 300)
    assert.equal(constants.BOARD_LIMITS.links, 8)
    assert.equal(constants.BOARD_LIMITS.contextChars, 2000)
    assert.equal(constants.BOARD_LIMITS.guideChars, 900)
  })
})

describe('B1 loading with and without the instance points (§8)', () => {
  it('B1-UC-LOAD-M Samuel keeps his Fishball work board available — W0: [formerly B1-DT-01] the row loads with a stub fishballInstance', async () => {
    const row = await packageModule(BOARD, 'index.js')
    await assert.doesNotReject(async () => row.apply(stubContext({ withInstance: true }), {}))
  })

  // V3 realignment: R-FB-06 (docs/planning/v3-requirements.md line 869) replaces W0's
  // `instance-hooks-missing` with one `fishball-core-missing` line; without an appReady service the
  // line is logged at load.
  it('B1-UC-LOAD-A Samuel keeps his Fishball work board available — V3: without fishball-core the row loads and logs fishball-core-missing once (R-FB-06)', async () => {
    const row = await packageModule(BOARD, 'index.js')
    const ctx = stubContext({ withInstance: false })
    await assert.doesNotReject(async () => row.apply(ctx, {}))
    assert.equal(ctx.logs.filter((line) => line.includes('fishball-core-missing')).length, 1)
  })
})

// Flows defined before these tests in docs/test-design/instance-ext-w0-skeleton-use-cases.md.
describe('B1 user configuration and deferred bundle journeys', () => {
  it('B1-UC-CONFIG-E Samuel keeps his Fishball work board available — W0: user submits an invalid setting and Config rejects it', async () => {
    const { Config } = await packageModule(BOARD, 'index.js')
    assert.throws(() => Config({ inject: 'true' }))
  })
  it.todo('B1-UC-BUNDLE-M Samuel keeps his Fishball work board available — deferred: [X0-B] user enables the bundled plugin')
  it.todo('B1-UC-BUNDLE-A Samuel keeps his Fishball work board available — deferred: [X0-B] user disables and restart preserves the choice')
  it.todo('B1-UC-BUNDLE-E Samuel keeps his Fishball work board available — deferred: [X0-B] unavailable placement permits child startup')
})

// Defined story continuations, not skeleton proof of storage, tools, context or UI.
describe('B1 Samuel revisits completed work — U19 deferred archive journeys', () => {
  it.todo('B1-UC-HISTORY-M Samuel revisits completed work — deferred: [B2/B3/B5] Done and Dropped stay on board/panel/context at 30 days−1ms and day30, leave at +1ms; archive remains')
  it.todo('B1-UC-HISTORY-A Samuel clears and later reopens finished work — deferred: [B2/B3/B4/B5] clear Done or Dropped early, keep archive, reopen off-board card and restore open panel/context together')
  it.todo('B1-UC-HISTORY-E Samuel cannot clear unfinished work — deferred: [B2/B4] clear each open status refuses not-closed and changes neither board nor archive')
  it.todo('B1-UC-SEARCH-M Samuel finds old work by keyword — deferred: [B11] board_search finds title/note keyword in a year-old off-board or cleared card without changing visibility')
  it.todo('B1-UC-UNINSTALL-M Samuel keeps an archive before uninstall — deferred: [B10] accepted complete archive export finishes outside runtime before deletion, including off-board/cleared history')
  it.todo('B1-UC-UNINSTALL-A Samuel declines archive export — deferred: [B10] explicit decline permits runtime and archive deletion')
  it.todo('B1-UC-UNINSTALL-E Samuel retries failed archive export — deferred: [B10] export failure preserves runtime and archive; explicit decline may later permit deletion')
})
