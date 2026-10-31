/**
 * P12 (revision 10, DESIGN §10d "Host API"): the catalog fields the plugin manager adds to every
 * state-snapshot entry (dsh, runs, packageName, version, description, meta, hasIcon, settings).
 * One host with the settings fixtures (MANAGER_ENV); cases run in order (state transitions).
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | MCAT-01 | EP | every entry carries the eight new fields with their types | 20 keys; dsh/runs/settings from their enums; packageName/version/description string or null; meta null or {title?, description?} as DSH's LocalizedText; hasIcon boolean |
 * | MCAT-02 | DT (kind × Fishball on/off) | dsh from the kind, runs from both desired states | every entry: profile→on, fishball-only→off, builtin→builtin (the Fishball group→fishball, revision 10c), fishball-installed→none; runs everywhere/dsh/fishball/nowhere |
 * | MCAT-03 | ST off→on per kind (user route) | runs follows the desired state at once | fbtest-settings-dsh dsh→everywhere; fbtest-settings nowhere→fishball; builtin:ask-user nowhere→fishball; and back |
 * | MCAT-04 | EP (built-in) | packageName and version are null for built-ins | every builtin entry; dsh builtin, or fishball for the Fishball group (revision 10c) |
 * | MCAT-05 | EP (DSH plugin with package fields) | packageName, version, description, hasIcon from the package | fbtest-settings: name, 1.2.3, its description, hasIcon true; fbtest-settings-dsh: name, 0.0.1, description null, hasIcon false |
 * | MCAT-06 | DT (settings state) | none / default / changed | fbtest-settings-dsh none (on in DSH, nothing stored); builtin:messenger none (no rows); builtin:time and fbtest-settings default; a save makes fbtest-settings changed; reset all makes it default again |
 * | MCAT-07 | EP (secret) | a secret value never appears in the snapshot | GET state, the first SSE frame and list_plugins carry neither the patch's nor the user's secret |
 * | MCAT-08 | EP (installed in Fishball only) | dsh none, runs from on/off, package fields | after add_plugin (Allow once): dsh none, runs fishball, packageName fbtest-added, version 0.0.1; off → nowhere |
 * | MCAT-09 | EP | no manager action changes the profile | package.json, cordis.patch.yml and lockfile byte-identical to the snapshot taken after boot |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  ADDED_BUNDLE, API, DSH_STATE, INSTALLED_KEY, KIND, MANAGER_BUNDLES, MANAGER_ENV, MESSENGER, MS, OUTCOME, PLUGIN_KEYS, RUNS,
  SETTINGS_FIXTURE, SETTINGS_STATE,
} from './support/constants.mjs'
import {
  HOOK, INSTALL_MS, LONG_T, T, addPlugin, assertNoSecret, catalogSettled, expectedDsh, expectedRuns, listPlugins, pluginIn, profileSnapshot, saveSettings, settle, untilCatalog,
} from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const SET = MANAGER_BUNDLES.settings
const DSH = MANAGER_BUNDLES.dsh

describe('P12 catalog fields', () => {
  let host
  let home
  let fb
  let profile

  const toggle = async (plugin, on) => {
    const r = await host.post(API.plugins, { plugin, on })
    assert.equal(r.status, 200, 'toggle ' + plugin + ': ' + r.text)
    return catalogSettled(host)
  }
  const assertFieldTypes = (p) => {
    assert.deepEqual(Object.keys(p).sort(), PLUGIN_KEYS, 'keys of ' + p.plugin)
    assert.ok(Object.values(DSH_STATE).includes(p.dsh), p.plugin + ' dsh ' + p.dsh)
    assert.ok(Object.values(RUNS).includes(p.runs), p.plugin + ' runs ' + p.runs)
    assert.ok(Object.values(SETTINGS_STATE).includes(p.settings), p.plugin + ' settings ' + p.settings)
    for (const k of ['packageName', 'version', 'description']) assert.ok(p[k] === null || typeof p[k] === 'string', p.plugin + ' ' + k + ' ' + JSON.stringify(p[k]))
    assert.equal(typeof p.hasIcon, 'boolean', p.plugin + ' hasIcon')
    if (p.meta !== null) {
      assert.equal(typeof p.meta, 'object', p.plugin + ' meta')
      for (const [k, v] of Object.entries(p.meta)) {
        assert.ok(['title', 'description'].includes(k), p.plugin + ' meta key ' + k)
        // DSH's LocalizedText: a string, or translations by language with a required English one (A115).
        const text = typeof v === 'string' || (v !== null && typeof v === 'object' && typeof v.en === 'string' && Object.values(v).every((x) => typeof x === 'string'))
        assert.ok(text, p.plugin + ' meta.' + k + ' is localized text: ' + JSON.stringify(v))
      }
    }
  }
  const assertDecisionTable = (catalog, label) => {
    for (const p of catalog.plugins) {
      assert.equal(p.dsh, expectedDsh(p), label + ': ' + p.plugin + ' dsh for kind ' + p.kind)
      assert.equal(p.runs, expectedRuns(p), label + ': ' + p.plugin + ' runs for kind ' + p.kind + ', on ' + p.on)
    }
  }

  before(async () => {
    home = newHome('manager-catalog')
    const booted = await bootLive(home, { env: MANAGER_ENV })
    host = booted.host
    fb = booted.state?.sessionId
    await settle(host)
    profile = profileSnapshot(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('MCAT-01 every catalog entry carries the plugin-manager fields with their documented types', T, async () => {
    const catalog = await catalogSettled(host)
    assert.ok(pluginIn(catalog, SET.name), 'precondition: the fishball-only settings fixture is listed')
    assert.equal(pluginIn(catalog, SET.name).kind, KIND.only, 'precondition: fbtest-settings is fishball-only')
    assert.equal(pluginIn(catalog, DSH.name)?.kind, KIND.profile, 'precondition: fbtest-settings-dsh is on in DSH')
    for (const p of catalog.plugins) assertFieldTypes(p)
  })

  it('MCAT-02 dsh follows the kind and runs follows both desired states, for every entry', T, async () => {
    assertDecisionTable(await catalogSettled(host), 'defaults')
  })

  const transitions = [
    [DSH.name, RUNS.dsh, RUNS.everywhere],
    [SET.name, RUNS.nowhere, RUNS.fishball],
    ['builtin:ask-user', RUNS.nowhere, RUNS.fishball],
  ]
  for (const [key, off, on] of transitions) {
    it('MCAT-03 runs of ' + key + ' moves ' + off + ' -> ' + on + ' -> ' + off + ' with Fishball\'s switch', T, async () => {
      assert.equal(pluginIn(await catalogSettled(host), key)?.runs, off, 'precondition: off for Fishball')
      const turnedOn = await toggle(key, true)
      assert.equal(pluginIn(turnedOn, key).runs, on)
      assertDecisionTable(turnedOn, key + ' on')
      const turnedOff = await toggle(key, false)
      assert.equal(pluginIn(turnedOff, key).runs, off)
    })
  }

  it('MCAT-04 built-ins have no package name and no version', T, async () => {
    const builtins = (await catalogSettled(host)).plugins.filter((p) => p.kind === KIND.builtin)
    assert.ok(builtins.length > 0)
    for (const p of builtins) {
      assert.equal(p.packageName, null, p.plugin + ' packageName')
      assert.equal(p.version, null, p.plugin + ' version')
      // Revision 10c: the Fishball group's built-ins report dsh 'fishball', every other built-in 'builtin'.
      assert.equal(p.dsh, expectedDsh(p), p.plugin + ' dsh')
    }
  })

  it('MCAT-05 a DSH plugin reports its package name, version, description and icon', T, async () => {
    const catalog = await catalogSettled(host)
    const set = pluginIn(catalog, SET.name)
    assert.equal(set.packageName, SET.name)
    assert.equal(set.version, SETTINGS_FIXTURE.version)
    assert.equal(set.description, SETTINGS_FIXTURE.description)
    assert.equal(set.hasIcon, true)
    const dsh = pluginIn(catalog, DSH.name)
    assert.equal(dsh.packageName, DSH.name)
    assert.equal(dsh.version, '0.0.1')
    assert.equal(dsh.description, null, 'a package without a description')
    assert.equal(dsh.hasIcon, false, 'a package without an icon')
  })

  it('MCAT-06 settings is none, default or changed as the stored values and the kind say', T, async () => {
    let catalog = await catalogSettled(host)
    assert.equal(pluginIn(catalog, DSH.name).settings, SETTINGS_STATE.none, 'on in DSH with no stored values')
    assert.equal(pluginIn(catalog, MESSENGER.key).settings, SETTINGS_STATE.none, 'a plugin with no rows')
    assert.equal(pluginIn(catalog, 'builtin:time').settings, SETTINGS_STATE.default, 'a built-in with rows')
    assert.equal(pluginIn(catalog, SET.name).settings, SETTINGS_STATE.default, 'fishball-only, nothing stored')
    const saved = await saveSettings(host, { plugin: SET.name, row: SET.rows.main, values: { limit: 5 } })
    assert.equal(saved.status, 200, saved.text)
    catalog = await untilCatalog(host, (c) => pluginIn(c, SET.name)?.settings === SETTINGS_STATE.changed, 5000)
    assert.ok(catalog, 'stored values in use: changed')
    const reset = await saveSettings(host, { plugin: SET.name, row: SET.rows.main, reset: [[]] })
    assert.equal(reset.status, 200, reset.text)
    catalog = await untilCatalog(host, (c) => pluginIn(c, SET.name)?.settings === SETTINGS_STATE.default, 5000)
    assert.ok(catalog, 'reset all: default again')
  })

  it('MCAT-07 a secret value never appears in the snapshot, the event stream or list_plugins', T, async () => {
    const saved = await saveSettings(host, { plugin: SET.name, row: SET.rows.main, values: { token: SETTINGS_FIXTURE.userSecret } })
    assert.equal(saved.status, 200, saved.text)
    assertNoSecret(assert, saved.text, 'the settings route answer')
    assertNoSecret(assert, (await host.get(API.state)).text, 'GET state')
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, MS.sseFirstFrame, 20), 'a first frame')
      assertNoSecret(assert, JSON.stringify(stream.frames), 'the event stream')
    } finally { stream.close() }
    assertNoSecret(assert, JSON.stringify(await listPlugins(host, fb)), 'list_plugins')
    assert.equal((await saveSettings(host, { plugin: SET.name, row: SET.rows.main, reset: [[]] })).status, 200)
  })

  it('MCAT-08 a plugin installed in Fishball only reports dsh none and runs from its switch', LONG_T, async () => {
    const r = await addPlugin(host, fb, ADDED_BUNDLE.dir, OUTCOME.allow)
    assert.equal(r.json?.ok, true, 'precondition: add_plugin installed it: ' + r.result.text.slice(0, 500))
    const key = INSTALLED_KEY(ADDED_BUNDLE.name)
    const catalog = await untilCatalog(host, (c) => pluginIn(c, key)?.on === true, INSTALL_MS)
    assert.ok(catalog, 'listed and on')
    const p = pluginIn(catalog, key)
    assertFieldTypes(p)
    assert.equal(p.dsh, DSH_STATE.none)
    assert.equal(p.runs, RUNS.fishball)
    assert.equal(p.packageName, ADDED_BUNDLE.name)
    assert.equal(p.version, '0.0.1')
    assert.equal(p.settings, SETTINGS_STATE.default)
    assert.equal(pluginIn(await toggle(key, false), key).runs, RUNS.nowhere)
  })

  it('MCAT-09 the profile files are byte-identical after every manager action of this file', T, () => {
    assert.deepEqual(profileSnapshot(home), profile)
  })
})
