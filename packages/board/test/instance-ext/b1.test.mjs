/**
 * W0 / B1 — the `fishball-board` skeleton: package, row, typed config and constants.
 *
 * Source: docs/plugins/board-design.md §9 (Config ranges), §13 (package), §14 B1 ("the row loads
 * with and without the points; the Config ranges are as in §9"), §8 (the four instance points).
 *
 * Observation points: the package files, the row exports, the Config schema, `src/constants.js`
 * and `apply` over a stub context with and without `fishballInstance`.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PACKAGE, configDefault, packageFile, packageJson, packageModule } from '../../../../test/support/instance-ext-plugins.mjs'

const BOARD = PACKAGE.board

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
  it('B1-EP-V-01 the package is fishball-board 0.1.0-alpha.0 with the designed files and bounds', async () => {
    const manifest = await packageJson(BOARD)
    assert.equal(manifest.name, 'fishball-board')
    assert.equal(manifest.version, '0.1.0-alpha.0')
    assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
    assert.match(manifest.engines?.dsh ?? '', />=0\.2\.1-rc\.5/)
    assert.ok(manifest.peerDependencies?.['fishball-instance'], 'peerDependencies names the instance')
    for (const file of ['index.js', 'src/constants.js', 'src/config.js', 'README.md']) await packageFile(BOARD, file)
  })

  it('B1-EP-V-02 the row exports name, inject, Config and apply', async () => {
    const row = await packageModule(BOARD, 'index.js')
    assert.equal(row.name, 'fishball-board')
    assert.ok(row.inject?.includes('tools'), 'inject tools')
    assert.ok(row.inject?.includes('fishballInstance?'), 'inject optional public fishballInstance')
    assert.ok(!row.inject?.some((name) => name.replace(/\?$/, '') === 'fishballChat'), 'fishballChat is internal')
    assert.equal(typeof row.apply, 'function')
    assert.equal(typeof row.Config, 'function', 'DSH reads the Config schema export')
  })

  it('B1-EP-V-03 the config defaults are inject true, contextCards 20, doneWindowHours 24', async () => {
    const { Config } = await packageModule(BOARD, 'index.js')
    assert.equal(configDefault(Config, 'inject'), true)
    assert.equal(configDefault(Config, 'contextCards'), 20)
    assert.equal(configDefault(Config, 'doneWindowHours'), 24)
  })

  it('B1-BVA-01 contextCards is an integer 0…30 (0 = the counts line only)', async () => {
    const { Config } = await packageModule(BOARD, 'index.js')
    for (const value of [0, 1, 30]) assert.doesNotThrow(() => Config({ contextCards: value }))
    for (const value of [-1, 31]) assert.throws(() => Config({ contextCards: value }))
    assert.throws(() => Config({ contextCards: 1.5 }))
  })

  it('B1-BVA-02 doneWindowHours is an integer 0…168', async () => {
    const { Config } = await packageModule(BOARD, 'index.js')
    for (const value of [0, 1, 168]) assert.doesNotThrow(() => Config({ doneWindowHours: value }))
    for (const value of [-1, 169]) assert.throws(() => Config({ doneWindowHours: value }))
  })

  it('B1-EP-01 inject is a boolean', async () => {
    const { Config } = await packageModule(BOARD, 'index.js')
    assert.doesNotThrow(() => Config({ inject: true }))
    assert.doesNotThrow(() => Config({ inject: false }))
    assert.throws(() => Config({ inject: 'true' }))
  })

  it('B1-EP-V-04 the constants carry the six statuses and the frozen limits', async () => {
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
  it('B1-DT-01 the row loads with a stub fishballInstance', async () => {
    const row = await packageModule(BOARD, 'index.js')
    await assert.doesNotReject(async () => row.apply(stubContext({ withInstance: true }), {}))
  })

  it('B1-DT-02 without the points the row loads and logs instance-hooks-missing once', async () => {
    const row = await packageModule(BOARD, 'index.js')
    const ctx = stubContext({ withInstance: false })
    await assert.doesNotReject(async () => row.apply(ctx, {}))
    assert.equal(ctx.logs.filter((line) => line.includes('instance-hooks-missing')).length, 1)
  })
})
