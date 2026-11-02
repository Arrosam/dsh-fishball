/**
 * P12 (DESIGN §10d "Stored values", Q-manager-stale): a plugin with stored Fishball settings that
 * you move to "on in DSH" keeps them, does not use them, and uses them again once it runs only in
 * Fishball. The values survive a restart. One home with the settings fixtures (MANAGER_ENV); the
 * moves are your own action on DSH's Installed tab (DSH's plugin manager), cases run in order.
 *
 * | id     | technique | requirement | expected |
 * |--------|-----------|-------------|----------|
 * | STL-01 | ST fishball-only default -save-> changed | precondition: values in use | settings changed; the private-tree row receives limit 6 |
 * | STL-02 | ST fishball-only -select in DSH-> profile | kept but not used | kind profile, dsh on, settings unused; detail shared, settings unused, user {limit:6} kept, nothing editable; the row now running for every session gets the plugin's own limit 3, never 6 |
 * | STL-03 | EP (refusals while shared) | the route and the tool refuse | route 409 shared-with-dsh; set_plugin_settings shared-with-dsh with no prompt; stored values unchanged; profile files unchanged by these actions |
 * | STL-04 | ST profile -deselect-> fishball-only | used again | kind fishball-only, settings changed, user {limit:6}; on for Fishball, the private-tree row receives limit 6 |
 * | STL-05 | ST restart | stored values survive a restart | after a restart: settings changed, user {limit:6}; the private-tree row receives limit 6 once it is on |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, DSH_STATE, KIND, MANAGER_BUNDLES, MANAGER_CODE, MANAGER_ENV, OUTCOME, PRIVATE_ROW_PREFIX, SETTINGS_FIXTURE, SETTINGS_STATE, SETTINGS_TOOLS } from './support/constants.mjs'
import {
  HOOK, T, detailOf, fishballTool, pluginIn, privateApplies, profileSnapshot, quiet, saveSettings, settledIdle, untilApply, untilCatalog, userOf,
} from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const SET = MANAGER_BUNDLES.settings
const MAIN = SET.rows.main
const STORED = { limit: 6 }
const MOVE_MS = 20000

describe('P12 stored settings of a plugin moved to DSH and back', () => {
  let host
  let home
  let fb

  const boot = async () => {
    const booted = await bootLive(home, { env: MANAGER_ENV })
    host = booted.host
    fb = booted.state?.sessionId
  }
  const turnOn = async () => {
    assert.equal((await host.post(API.plugins, { plugin: SET.name, on: true })).status, 200, 'turn fbtest-settings on')
  }
  /** Your move on DSH's Installed tab; precondition: DSH applies it live. */
  const move = async (enabled) => {
    const r = await host.call('setBundleEnabled', { name: SET.name, enabled }, 60000)
    assert.equal(r.error, null, 'precondition: DSH moved the bundle: ' + JSON.stringify(r))
    return r
  }

  before(async () => {
    home = newHome('manager-stale')
    await boot()
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('STL-01 precondition: values stored for a plugin that runs only in Fishball are in use', T, async () => {
    await turnOn()
    assert.ok(await untilCatalog(host, (c) => pluginIn(c, SET.name)?.applied === true, 10000), 'mounted')
    const skip = (await privateApplies(host, SET.name, MAIN)).length
    assert.equal((await saveSettings(host, { plugin: SET.name, row: MAIN, values: STORED })).status, 200)
    assert.ok(await untilApply(host, SET.name, MAIN, skip, (c) => c.limit === STORED.limit), 'the private row receives limit 6')
    assert.equal(pluginIn((await host.state()).catalog, SET.name).settings, SETTINGS_STATE.changed)
  })

  let movedAt
  it('STL-02 moved to on in DSH, the stored values are kept but not used', T, async () => {
    movedAt = Date.now()
    const r = await move(true)
    const catalog = await untilCatalog(host, (c) => pluginIn(c, SET.name)?.kind === KIND.profile, MOVE_MS)
    assert.ok(catalog, 'reclassified as a profile plugin: ' + JSON.stringify(r))
    const p = pluginIn(catalog, SET.name)
    assert.equal(p.dsh, DSH_STATE.on)
    assert.equal(p.settings, SETTINGS_STATE.unused)
    const d = await detailOf(host, SET.name)
    assert.equal(d.shared, true)
    assert.equal(d.settings, SETTINGS_STATE.unused)
    assert.deepEqual(d.rows.find((x) => x.row === MAIN)?.user, STORED, 'kept')
    for (const row of d.rows) assert.equal(row.editable, false, row.row)
    // The row now runs for every session from DSH's own config: the plugin's value, not Fishball's.
    if (r.application === 'applied') {
      const hostApplies = async () => (await host.call('settingsEvents', { plugin: SET.name, row: MAIN })).filter((e) => e.type === 'apply' && e.at >= movedAt && !String(e.entryId ?? '').startsWith(PRIVATE_ROW_PREFIX))
      assert.ok(await until(async () => (await hostApplies()).length > 0, MOVE_MS, 100), 'DSH runs the row')
      await quiet(1000)
      for (const e of await hostApplies()) assert.equal(e.config.limit, SETTINGS_FIXTURE.base.limit, 'the stored value is not used')
    }
    const late = (await privateApplies(host, SET.name, MAIN)).filter((e) => e.at >= movedAt)
    assert.deepEqual(late.map((e) => e.config.limit), [], 'no private-tree mount while it runs in DSH')
  })

  it('STL-03 while it runs in DSH the route and the tool refuse shared-with-dsh and change nothing', T, async () => {
    const profile = profileSnapshot(home)
    const route = await saveSettings(host, { plugin: SET.name, row: MAIN, values: { limit: 2 } })
    assert.equal(route.status, 409, route.text)
    assert.deepEqual(route.json, { ok: false, code: MANAGER_CODE.sharedWithDsh })
    await settledIdle(host, fb)
    const tool = await fishballTool(host, fb, SETTINGS_TOOLS.set, { plugin: SET.name, row: MAIN, values: { limit: 2 }, reason: 'fbtest stale' }, OUTCOME.allow)
    assert.equal(tool.approvals.length, 0, 'no prompt')
    assert.equal(tool.json?.code, MANAGER_CODE.sharedWithDsh)
    assert.deepEqual(await userOf(host, SET.name, MAIN), STORED)
    assert.deepEqual(profileSnapshot(home), profile, 'the manager left the profile as DSH wrote it')
  })

  it('STL-04 moved back to Fishball only, the stored values are used again', T, async () => {
    // Counted before the move: a stored "on" may mount the row as soon as it is fishball-only again.
    const skip = (await privateApplies(host, SET.name, MAIN)).length
    await move(false)
    const catalog = await untilCatalog(host, (c) => pluginIn(c, SET.name)?.kind === KIND.only, MOVE_MS)
    assert.ok(catalog, 'reclassified as fishball-only')
    assert.equal(pluginIn(catalog, SET.name).settings, SETTINGS_STATE.changed)
    assert.deepEqual(await userOf(host, SET.name, MAIN), STORED)
    if (!pluginIn(catalog, SET.name).on) await turnOn()
    assert.ok(await untilApply(host, SET.name, MAIN, skip, (c) => c.limit === STORED.limit), 'the private row receives limit 6 again')
  })

  it('STL-05 the stored values survive a restart', { timeout: 120000 }, async () => {
    await host.stop()
    await boot()
    const catalog = await untilCatalog(host, (c) => pluginIn(c, SET.name)?.kind === KIND.only, MOVE_MS)
    assert.ok(catalog)
    assert.equal(pluginIn(catalog, SET.name).settings, SETTINGS_STATE.changed)
    assert.deepEqual(await userOf(host, SET.name, MAIN), STORED)
    if (!pluginIn(catalog, SET.name).on) await turnOn()
    assert.ok(await untilApply(host, SET.name, MAIN, 0, (c) => c.limit === STORED.limit), 'the private row receives limit 6 after the restart')
  })
})
