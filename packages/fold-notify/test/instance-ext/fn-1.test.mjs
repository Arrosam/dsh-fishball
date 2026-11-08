/**
 * W0 / FN-1 — the `fishball-fold-notify` skeleton: package, row, typed config and constants.
 *
 * Source: docs/plugins/fold-notify-design.md §10 (config and fixed constants), §13 (package and
 * bundling), §14 FN-1 ("loads in a test child profile; config bounds enforced").
 *
 * Observation points: the package's own files, the row's public exports, the Config schema and
 * its defaults, and `apply` over a stub child context. No product code is imported through an
 * implementation helper.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PACKAGE, configDefault, packageFile, packageJson, packageModule } from '../../../../test/support/instance-ext-plugins.mjs'

const FOLD = PACKAGE.fold

function stubContext({ withInstance = true } = {}) {
  const provided = new Map()
  const services = {
    tools: { register: () => () => {} },
    fishballInstance: {
      apiVersion: 1,
      manager: { sessionId: () => 'session-fishball', registerSetup: () => () => {} },
      chat: { registerRecordProjector: () => () => {} },
      inbox: { setBatcher: () => () => {}, claim: () => () => {} },
      attention: { set: () => () => {} },
    },
  }
  if (!withInstance) delete services.fishballInstance
  return {
    get: (name) => services[name] ?? provided.get(name),
    provide: (name, value) => { provided.set(name, value); return () => provided.delete(name) },
    effect: (execute) => { const dispose = execute(); return dispose },
    logger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
    on: () => () => {},
    ...services,
    provided,
    services,
  }
}

describe('FN-1 package and row', () => {
  it('FN1-P-01 the package is fishball-fold-notify 0.1.0-alpha.0 with the designed files and bounds', async () => {
    const manifest = await packageJson(FOLD)
    assert.equal(manifest.name, 'fishball-fold-notify')
    assert.equal(manifest.version, '0.1.0-alpha.0')
    assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
    for (const file of ['index.js', 'src/constants.js', 'src/config.js', 'cordis.patch.yml']) {
      assert.ok(manifest.files?.includes(file) || (file.startsWith('src/') && manifest.files?.includes('src/')), 'package.json files list covers ' + file)
    }
    assert.match(manifest.engines?.dsh ?? '', />=0\.2\.1-rc\.5/)
    assert.ok(manifest.peerDependencies?.['fishball-instance'], 'peerDependencies names the instance')
  })

  it('FN1-P-02 the row exports name, inject, Config and apply', async () => {
    const row = await packageModule(FOLD, 'index.js')
    assert.equal(row.name, 'fishball-fold-notify')
    assert.ok(Array.isArray(row.inject), 'inject is a list')
    assert.ok(row.inject.includes('tools'), 'inject tools')
    assert.ok(row.inject.includes('fishballInstance?'), 'inject optional public fishballInstance')
    assert.ok(!row.inject.some((name) => name.replace(/\?$/, '') === 'fishballChat'), 'fishballChat is internal')
    assert.equal(typeof row.apply, 'function')
    assert.equal(typeof row.Config, 'function', 'DSH reads the Config schema export')
  })

  it('FN1-P-03 the config defaults are foldDefault true, systemNotification when-hidden, batchWindowMs 1500', async () => {
    const { Config } = await packageModule(FOLD, 'index.js')
    assert.equal(configDefault(Config, 'foldDefault'), true)
    assert.equal(configDefault(Config, 'systemNotification'), 'when-hidden')
    assert.equal(configDefault(Config, 'batchWindowMs'), 1500)
  })

  it('FN1-BVA-01 batchWindowMs is an integer 0…10000 (0 = off)', async () => {
    const { Config } = await packageModule(FOLD, 'index.js')
    assert.doesNotThrow(() => Config({ batchWindowMs: 0 }))
    assert.doesNotThrow(() => Config({ batchWindowMs: 1 }))
    assert.doesNotThrow(() => Config({ batchWindowMs: 10_000 }))
    assert.throws(() => Config({ batchWindowMs: -1 }))
    assert.throws(() => Config({ batchWindowMs: 10_001 }))
    assert.throws(() => Config({ batchWindowMs: 1.5 }))
  })

  it('FN1-EP-02 systemNotification is off or when-hidden', async () => {
    const { Config } = await packageModule(FOLD, 'index.js')
    assert.doesNotThrow(() => Config({ systemNotification: 'off' }))
    assert.doesNotThrow(() => Config({ systemNotification: 'when-hidden' }))
    assert.throws(() => Config({ systemNotification: 'always' }))
  })

  it('FN1-EP-03 foldDefault is a boolean', async () => {
    const { Config } = await packageModule(FOLD, 'index.js')
    assert.doesNotThrow(() => Config({ foldDefault: true }))
    assert.doesNotThrow(() => Config({ foldDefault: false }))
    assert.throws(() => Config({ foldDefault: 'true' }))
  })
})

describe('FN-1 constants and loading', () => {
  it('FN1-P-04 the fixed constants are the designed values', async () => {
    const constants = await packageModule(FOLD, 'src/constants.js')
    assert.equal(constants.NOTIFY.maxChars, 4000)
    assert.equal(constants.NOTIFY.systemChars, 140)
    assert.equal(constants.FOLD.previewChars, 80)
    assert.equal(constants.FOLD.previewTools, 3)
    assert.equal(constants.BATCH.maxItems, 20)
    assert.equal(constants.SEEN.dwellMs, 600)
    assert.equal(constants.SEEN.threshold, 0.5)
  })

  it('FN1-P-05 the row loads over a stub fishballInstance', async () => {
    const row = await packageModule(FOLD, 'index.js')
    const ctx = stubContext()
    await assert.doesNotReject(async () => row.apply(ctx, {}))
  })

  it('FN1-EP-01 the row also loads without the optional instance service', async () => {
    const row = await packageModule(FOLD, 'index.js')
    const ctx = stubContext({ withInstance: false })
    await assert.doesNotReject(async () => row.apply(ctx, {}))
  })
})
