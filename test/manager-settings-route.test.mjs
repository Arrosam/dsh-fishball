/**
 * P12 (DESIGN §10d "Settings for Fishball", "Values and merging", "Host API"): POST
 * /api/fishball/plugins/settings, your settings for a plugin Fishball runs in its private tree.
 * One host with the settings fixtures (MANAGER_ENV); fbtest-settings and fbtest-only are turned on
 * for Fishball first. Cases run in order (state transitions on the stored values).
 *
 * | id     | technique | requirement | expected |
 * |--------|-----------|-------------|----------|
 * | SET-01 | EP/BVA (body shapes) | 400 bad-body | invalid JSON, array, {}, plugin/row missing or not strings, neither values nor reset, values null/array/string/number, reset not an array, a path not an array, a segment not a string: 400 {ok:false, code:'bad-body'}; nothing stored |
 * | SET-02 | EP (unknown) | 409 unknown (plugin or row) | unknown plugin, dsh-fishball, unknown row, a row of another plugin, the Messenger look (no rows): 409 {ok:false, code:'unknown'} |
 * | SET-03 | EP (on in DSH) | 409 shared-with-dsh | fbtest-settings-dsh and fbtest-tools: 409 shared-with-dsh; nothing stored |
 * | SET-04 | EP (no form) | 409 no-settings | the row without a schema; the Compaction engine row: 409 no-settings |
 * | SET-05 | ST idle: default -save-> changed | an ordinary field applies at the idle phase, restarting only that row | 200 {ok:true, state}; user {limit:7}; settings changed; the row's apply gets limit 7; the side row and fbtest-only are not restarted; audited settings/user/ok; stored record changedBy user |
 * | SET-06 | BVA (limit min 1, max 10; 0, 1, 10, 11) and EP (wrong type, fraction, choice, nested, switch) | the Host checks the complete config | 1 and 10: 200; 0, 11, 2.5, "many": 400 {code:'invalid', path:['limit']}; mode, nested.b, enabled: their paths; stored values unchanged after each refusal |
 * | SET-06b | EP (rejected data) | errors leaving the Host repeat no rejected data | invalid limit "<rejected>": 400 [limit], the answer lacks the value; fbtest-settings-leak {note:2}: 400 [pin], no secret, no "but got" |
 * | SET-07 | EP (objects merge, arrays replace) | deep merge | nested.a then nested.b: both stored; tags [x,y,z] then [q]: [q] |
 * | SET-08 | ST changed -reset path-> | a reset returns the plugin's own value | reset nested.a: value x (schema default); reset greeting after A: value hello (the patch's, not the schema's hi), and the plugin receives hello |
 * | SET-09 | DT (values and reset together) | merge first, then reset | {values:{greeting:B, limit:4}, reset:[[greeting]]}: user has limit 4 and no greeting |
 * | SET-10 | ST changed -reset []-> default | the empty path removes all; an empty record is deleted | user {}; settings default; no stored record; the plugin receives the base config |
 * | SET-11 | BVA (empty values / empty reset) | valid shapes that change nothing | {values:{}} and {reset:[]}: 200; still no stored record; no audit entry |
 * | SET-12 | EP (secret) | you can set a secret; it never leaves the Host | 200; the answer, detail and state carry no secret; secrets set; the plugin receives it; reset gives back the patch's |
 * | SET-13 | ST (Fishball mid-turn) | a change never lands mid-turn | saved at once (detail shows it) but not applied while the turn is held; applied after the turn ends |
 * | SET-13b | ST (mid-turn save, then a listing mount in the same turn) | listing mounts keep the last idle-phase settings | save {limit:5} while Fishball is held, then Fishball's set_plugin_enabled mounts fbtest-only-b to list its tool (prompt held): the settings row never gets 5 mid-turn; after Reject and the turn end it does |
 * | SET-14 | EP (volatile field) | reaches the plugin without a restart | the plugin's live config shows two; no new apply of the row or the side row |
 * | SET-15 | ST on -save(valid, fails to mount)-> off row-failed | stored values stay to fix | plugin off with lastError row-failed; user keeps the value; after a reset it mounts again with the patch value |
 * | SET-16a-e | ST (invalid patch config) | a save is refused until the whole config is valid; removing all values never is | {size:3}: 400 invalid [name]; {name:n}: 200, error null; {size:3}: 200; reset [name] (leaves {size:3}): 400 invalid [name], values kept; reset [name],[size] (leaves none): 200, error again, record deleted; {name:m} then reset []: 200 (A118) |
 * | SET-19 | EP (no-change saves) | a save that changes nothing stores and audits nothing | {limit:7} again, a reset of an unset field, both together: 200; no audit entry; stored record identical (changedAt included) |
 * | SET-17 | EP (no cookie; foreign origin) | browser authentication and same-origin fence | not 200; nothing stored |
 * | SET-18 | EP | no manager action changes the profile | package.json, cordis.patch.yml and lockfile byte-identical after every case |
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import {
  API, APPROVER_HOLDS, AUDIT_OUTCOME, CHANGED_BY, COMPACTION, FIXTURE_BUNDLE, MANAGER_API, MANAGER_BUNDLES, MANAGER_CODE, MANAGER_ENV, MESSENGER, ONLY_BUNDLES,
  OUTCOME, PACKAGE_NAME, SETTINGS_FIXTURE, SETTINGS_STATE,
} from './support/constants.mjs'
import {
  HOOK, T, assertNoSecret, callScript, catalogSettled, withoutSecrets, detailOf, holdFishball, pathText, pluginIn, privateApplies, profileSnapshot, quiet, rowIn, saveSettings, settingsAudit,
  settle, settledIdle, storedRecord, untilApply, untilCatalog, userOf, valueOf,
} from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const SET = MANAGER_BUNDLES.settings
const DSH = MANAGER_BUNDLES.dsh
const BAD = MANAGER_BUNDLES.bad
const LEAK = MANAGER_BUNDLES.leak
const ONLY_B = ONLY_BUNDLES.b
const ONLY = ONLY_BUNDLES.a
const MAIN = SET.rows.main
const SIDE = SET.rows.side
/** How long a negative check waits for something that must not happen. */
const QUIET_MS = 1500

describe('P12 settings route', () => {
  let host
  let home
  let fb
  let profile

  const save = (body) => saveSettings(host, { plugin: SET.name, row: MAIN, ...body })
  const user = () => userOf(host, SET.name, MAIN)
  const value = () => valueOf(host, SET.name, MAIN)
  const mainApplies = () => privateApplies(host, SET.name, MAIN)
  const sideApplies = () => privateApplies(host, SET.name, SIDE)
  /** Save and require 200. */
  const saveOk = async (body) => {
    const r = await save(body)
    assert.equal(r.status, 200, JSON.stringify(body) + ': ' + r.text)
    return r
  }
  /** Refusal with a code and status, and the stored values left as they were. */
  const refused = async (body, status, code) => {
    const before = await user()
    const r = await saveSettings(host, body, typeof body === 'string' ? { raw: true } : undefined)
    assert.equal(r.status, status, JSON.stringify(body) + ': ' + r.text)
    assert.equal(r.json?.ok, false)
    assert.equal(r.json?.code, code)
    assert.deepEqual(await user(), before, 'stored values unchanged')
    return r
  }

  before(async () => {
    home = newHome('manager-settings-route')
    const booted = await bootLive(home, { env: MANAGER_ENV })
    host = booted.host
    fb = booted.state?.sessionId
    for (const plugin of [SET.name, ONLY.name]) assert.equal((await host.post(API.plugins, { plugin, on: true })).status, 200, 'precondition: ' + plugin + ' on')
    const catalog = await untilCatalog(host, (c) => pluginIn(c, SET.name)?.applied === true && pluginIn(c, ONLY.name)?.applied === true, 10000)
    assert.ok(catalog, 'precondition: both mounted in the private tree')
    assert.ok((await mainApplies()).length >= 1, 'precondition: the settings row ran')
    profile = profileSnapshot(home)
  }, HOOK)
  afterEach(() => { if (profile) assert.deepEqual(profileSnapshot(home), profile, 'SET-18: the profile files changed') })
  after(async () => { await host?.stop() }, HOOK)

  const badBodies = [
    ['invalid JSON', '{plugin:'],
    ['a JSON array', JSON.stringify([SET.name, MAIN])],
    ['{}', {}],
    ['plugin missing', { row: MAIN, values: { limit: 2 } }],
    ['plugin a number', { plugin: 1, row: MAIN, values: { limit: 2 } }],
    ['row missing', { plugin: SET.name, values: { limit: 2 } }],
    ['row a number', { plugin: SET.name, row: 1, values: { limit: 2 } }],
    ['neither values nor reset', { plugin: SET.name, row: MAIN }],
    ['values null', { plugin: SET.name, row: MAIN, values: null }],
    ['values an array', { plugin: SET.name, row: MAIN, values: [{ limit: 2 }] }],
    ['values a string', { plugin: SET.name, row: MAIN, values: 'limit=2' }],
    ['values a number', { plugin: SET.name, row: MAIN, values: 2 }],
    ['reset an object', { plugin: SET.name, row: MAIN, reset: { greeting: true } }],
    ['reset a list of strings', { plugin: SET.name, row: MAIN, reset: ['greeting'] }],
    ['reset with a number segment', { plugin: SET.name, row: MAIN, reset: [[1]] }],
    ['reset null', { plugin: SET.name, row: MAIN, reset: null }],
  ]
  for (const [label, body] of badBodies) {
    it('SET-01 a body with ' + label + ' answers 400 bad-body', T, async () => {
      await refused(body, 400, MANAGER_CODE.badBody)
      assert.equal(storedRecord(home, MAIN), undefined, 'nothing stored')
    })
  }

  const unknown = [
    ['an unknown plugin', { plugin: 'fbtest-no-such-plugin', row: MAIN, values: { limit: 2 } }],
    ['dsh-fishball itself', { plugin: PACKAGE_NAME, row: 'fishball', values: { maxQueuedInputs: 5 } }],
    ['an unknown row', { plugin: SET.name, row: 'fbtest-no-such-row', values: { limit: 2 } }],
    ['another plugin\'s row', { plugin: SET.name, row: BAD.rows.main, values: { size: 3 } }],
    ['the Messenger look (no rows)', { plugin: MESSENGER.key, row: 'messenger', values: { a: 1 } }],
  ]
  for (const [label, body] of unknown) {
    it('SET-02 ' + label + ' answers 409 unknown', T, async () => { await refused(body, 409, MANAGER_CODE.unknown) })
  }

  for (const [plugin, row] of [[DSH.name, DSH.rows.main], [FIXTURE_BUNDLE.name, FIXTURE_BUNDLE.name]]) {
    it('SET-03 ' + plugin + ' (on in DSH) answers 409 shared-with-dsh', T, async () => {
      await refused({ plugin, row, values: { greeting: 'x' } }, 409, MANAGER_CODE.sharedWithDsh)
      assert.equal(storedRecord(home, row), undefined, 'nothing stored for ' + row)
      assert.equal(pluginIn(await catalogSettled(host), plugin).settings, SETTINGS_STATE.none)
    })
  }

  for (const [label, plugin, row] of [['the row without a schema', SET.name, SIDE], ['the Compaction engine row', COMPACTION.plugin, COMPACTION.engineRow]]) {
    it('SET-04 ' + label + ' answers 409 no-settings', T, async () => {
      await refused({ plugin, row, values: { limit: 2 } }, 409, MANAGER_CODE.noSettings)
      assert.equal(storedRecord(home, row), undefined)
    })
  }

  it('SET-05 an ordinary field saved while Fishball is idle applies at once and restarts only that row', T, async () => {
    const mains = (await mainApplies()).length
    const sides = (await sideApplies()).length
    const onlyEvents = (await host.call('bundleEvents', { bundle: ONLY.name })).length
    const audits = settingsAudit(home, SET.name).length
    const r = await saveOk({ values: { limit: 7 } })
    assert.equal(r.json?.ok, true)
    assert.equal(typeof r.json?.state?.catalog, 'object', 'answers with the state')
    assert.equal(pluginIn(r.json.state.catalog, SET.name)?.settings, SETTINGS_STATE.changed)
    assert.deepEqual(await user(), { limit: 7 })
    assert.equal((await value()).limit, 7)
    assert.ok(await untilApply(host, SET.name, MAIN, mains, (c) => c.limit === 7), 'the row receives limit 7')
    await quiet(QUIET_MS)
    assert.equal((await sideApplies()).length, sides, 'the plugin\'s other row keeps running')
    assert.deepEqual((await host.call('bundleEvents', { bundle: ONLY.name })).slice(onlyEvents), [], 'another private-tree plugin keeps running')
    const audit = settingsAudit(home, SET.name).slice(audits)
    assert.equal(audit.length, 1, 'one audit entry: ' + JSON.stringify(audit))
    assert.equal(audit[0].by, CHANGED_BY.user)
    assert.equal(audit[0].outcome, AUDIT_OUTCOME.ok)
    const record = await until(() => storedRecord(home, MAIN), 3000, 50)
    assert.ok(record, 'a plugin_settings record')
    assert.deepEqual(record.rows[MAIN], { limit: 7 })
    assert.equal(record.changedBy, CHANGED_BY.user)
  })

  it('SET-19 a save that changes nothing stores and audits nothing', T, async () => {
    const audits = settingsAudit(home, SET.name).length
    const record = storedRecord(home, MAIN)
    assert.deepEqual(record?.rows?.[MAIN], { limit: 7 }, 'precondition: SET-05 stored limit 7')
    for (const body of [{ values: { limit: 7 } }, { reset: [['greeting']] }, { values: { limit: 7 }, reset: [['mode']] }]) {
      await saveOk(body)
      await quiet(300)
      assert.equal(settingsAudit(home, SET.name).length, audits, JSON.stringify(body) + ' was audited')
      assert.deepEqual(storedRecord(home, MAIN), record, JSON.stringify(body) + ' rewrote the stored record')
    }
  })

  for (const limit of [SETTINGS_FIXTURE.limit.min, SETTINGS_FIXTURE.limit.max]) {
    it('SET-06 limit ' + limit + ' (a bound) is accepted', T, async () => {
      await saveOk({ values: { limit } })
      assert.equal((await value()).limit, limit)
    })
  }
  const invalid = [
    ['limit 0 (min - 1)', { limit: SETTINGS_FIXTURE.limit.min - 1 }, ['limit']],
    ['limit 11 (max + 1)', { limit: SETTINGS_FIXTURE.limit.max + 1 }, ['limit']],
    ['limit 2.5 (not whole)', { limit: 2.5 }, ['limit']],
    ['limit "many" (wrong type)', { limit: 'many' }, ['limit']],
    ['mode outside its choices', { mode: 'medium' }, ['mode']],
    ['nested.b negative', { nested: { b: -1 } }, ['nested', 'b']],
    ['enabled a string', { enabled: 'yes' }, ['enabled']],
  ]
  for (const [label, values, path] of invalid) {
    it('SET-06 ' + label + ' answers 400 invalid with its path and keeps the stored values', T, async () => {
      const r = await refused({ plugin: SET.name, row: MAIN, values }, 400, MANAGER_CODE.invalid)
      assert.deepEqual(r.json.path, path)
    })
  }

  it('SET-06b an invalid save\'s answer repeats neither the rejected value nor a secret', T, async () => {
    const r = await refused({ plugin: SET.name, row: MAIN, values: { limit: SETTINGS_FIXTURE.rejected } }, 400, MANAGER_CODE.invalid)
    assert.deepEqual(r.json.path, ['limit'])
    assert.equal(r.text.includes(SETTINGS_FIXTURE.rejected), false, 'the rejected value is repeated: ' + r.text)
    const leak = await saveSettings(host, { plugin: LEAK.name, row: LEAK.rows.main, values: { note: 2 } })
    assert.equal(leak.status, 400, leak.text)
    assert.equal(leak.json?.code, MANAGER_CODE.invalid)
    assert.deepEqual(leak.json.path, ['pin'])
    assertNoSecret(assert, leak.text, 'the answer for a row whose patch holds a secret in the rejected value')
    assert.equal(leak.text.includes(SETTINGS_FIXTURE.errorCut.trim()), false, 'no rejected data: ' + leak.text)
  })

  it('SET-07 objects merge key by key and arrays replace', T, async () => {
    await saveOk({ values: { nested: { a: 'y' } } })
    await saveOk({ values: { nested: { b: 5 } } })
    assert.deepEqual((await user()).nested, { a: 'y', b: 5 })
    assert.deepEqual((await value()).nested, { a: 'y', b: 5 })
    await saveOk({ values: { tags: ['x', 'y', 'z'] } })
    await saveOk({ values: { tags: ['q'] } })
    assert.deepEqual((await user()).tags, ['q'])
    assert.deepEqual((await value()).tags, ['q'])
  })

  it('SET-08 a reset path returns the plugin\'s own value', T, async () => {
    await saveOk({ reset: [['nested', 'a']] })
    assert.equal(Object.hasOwn((await user()).nested ?? {}, 'a'), false)
    assert.equal((await value()).nested.a, SETTINGS_FIXTURE.base.nested.a)
    assert.equal((await user()).nested?.b, 5, 'the sibling stays')
    await saveOk({ values: { greeting: 'A' } })
    const mains = (await mainApplies()).length
    await saveOk({ reset: [['greeting']] })
    assert.equal(Object.hasOwn(await user(), 'greeting'), false)
    assert.equal((await value()).greeting, SETTINGS_FIXTURE.base.greeting, 'the patch value, not the schema default')
    assert.ok(await untilApply(host, SET.name, MAIN, mains, (c) => c.greeting === SETTINGS_FIXTURE.base.greeting), 'the plugin receives its own value')
  })

  it('SET-09 values are merged before reset paths are removed', T, async () => {
    await saveOk({ values: { greeting: 'B', limit: 4 }, reset: [['greeting']] })
    const u = await user()
    assert.equal(u.limit, 4)
    assert.equal(Object.hasOwn(u, 'greeting'), false)
  })

  it('SET-10 reset [] removes all of the row\'s values and deletes the empty record', T, async () => {
    const mains = (await mainApplies()).length
    await saveOk({ reset: [[]] })
    assert.deepEqual(await user(), {})
    assert.deepEqual(await value(), SETTINGS_FIXTURE.base)
    assert.ok(await untilCatalog(host, (c) => pluginIn(c, SET.name)?.settings === SETTINGS_STATE.default, 5000), 'settings default')
    assert.ok(await until(() => storedRecord(home, MAIN) === undefined, 3000, 50), 'the record is deleted')
    const config = (await untilApply(host, SET.name, MAIN, mains, (c) => c.limit === SETTINGS_FIXTURE.base.limit))?.config ?? {}
    assert.deepEqual(withoutSecrets(config), SETTINGS_FIXTURE.base, 'the plugin receives its own config')
    assert.equal(config.token, SETTINGS_FIXTURE.patchSecret)
    assert.equal(config.auth?.key, SETTINGS_FIXTURE.nestedSecret)
    assert.equal(config.accounts?.[0]?.secret, SETTINGS_FIXTURE.listSecret)
  })

  for (const [label, body] of [['values {}', { values: {} }], ['reset []', { reset: [] }]]) {
    it('SET-11 ' + label + ' is a valid body that stores nothing', T, async () => {
      const audits = settingsAudit(home, SET.name).length
      await saveOk(body)
      assert.equal(settingsAudit(home, SET.name).length, audits, 'a save that changes nothing is not audited')
      assert.deepEqual(await user(), {})
      await quiet(300)
      assert.equal(storedRecord(home, MAIN), undefined)
    })
  }

  it('SET-12 you can set a secret; its value never leaves the Host but reaches the plugin', T, async () => {
    const mains = (await mainApplies()).length
    const r = await saveOk({ values: { token: SETTINGS_FIXTURE.userSecret } })
    assertNoSecret(assert, r.text, 'the route answer')
    const d = await host.get(MANAGER_API.detail + '?plugin=' + encodeURIComponent(SET.name))
    assertNoSecret(assert, d.text, 'the detail')
    assertNoSecret(assert, (await host.get(API.state)).text, 'the state')
    const row = rowIn(d.json.detail, MAIN)
    assert.deepEqual(row.secrets.find((s) => pathText(s.path) === 'token')?.set, true)
    assert.ok(await untilApply(host, SET.name, MAIN, mains, (c) => c.token === SETTINGS_FIXTURE.userSecret), 'the plugin receives your secret')
    const later = (await mainApplies()).length
    await saveOk({ reset: [['token']] })
    assert.ok(await untilApply(host, SET.name, MAIN, later, (c) => c.token === SETTINGS_FIXTURE.patchSecret), 'reset gives back the patch\'s secret')
  })

  it('SET-13 a change saved while Fishball is mid-turn applies only after the turn ends', T, async () => {
    const mains = (await mainApplies()).length
    await holdFishball(host, fb)
    try {
      await saveOk({ values: { limit: 9 } })
      assert.equal((await user()).limit, 9, 'saved at once')
      await quiet(QUIET_MS)
      assert.equal((await mainApplies()).slice(mains).some((e) => e.config.limit === 9), false, 'applied mid-turn')
    } finally {
      await host.call('releaseHold', { sessionId: fb })
    }
    assert.ok(await settledIdle(host, fb), 'the turn ended')
    assert.ok(await untilApply(host, SET.name, MAIN, mains, (c) => c.limit === 9), 'applied after the turn')
  })

  it('SET-13b a save made mid-turn still waits for the turn end when Fishball lists another plugin\'s tools in that turn', T, async () => {
    const mains = (await mainApplies()).length
    const onlyB = (await host.call('bundleEvents', { bundle: ONLY_B.name })).length
    await settledIdle(host, fb)
    await host.call('holdNext', { sessionId: fb })
    await host.call('setApprover', { outcome: APPROVER_HOLDS })
    try {
      await host.call('driveStart', { sessionId: fb, text: 'fbtest listing turn', script: callScript('set_plugin_enabled', { plugin: ONLY_B.name, on: true }) })
      assert.ok(await until(() => host.call('isHeld', { sessionId: fb }), 5000, 50), 'Fishball is in its turn')
      await saveOk({ values: { limit: 5 } })
      await host.call('releaseHold', { sessionId: fb })
      // set_plugin_enabled mounts fbtest-only-b to list its unchecked tool, then asks: the prompt is held open.
      assert.ok(await until(async () => (await host.call('heldApprovals')) === 1, 10000, 50), 'the listing prompt is open')
      assert.ok((await host.call('bundleEvents', { bundle: ONLY_B.name })).slice(onlyB).some((e) => e.type === 'apply'), 'precondition: the private tree was mounted for the listing')
      await quiet(QUIET_MS)
      assert.equal((await mainApplies()).slice(mains).some((e) => e.config.limit === 5), false, 'the running plugin got the mid-turn save')
    } finally {
      await host.call('releaseApproval', { outcome: OUTCOME.reject })
      await host.call('setApprover', { outcome: OUTCOME.reject })
      await host.call('releaseHold', { sessionId: fb })
    }
    assert.ok(await settledIdle(host, fb), 'the turn ended')
    assert.ok(await untilApply(host, SET.name, MAIN, mains, (c) => c.limit === 5), 'applied after the turn')
    assert.equal(pluginIn(await catalogSettled(host), ONLY_B.name).on, false, 'Reject left fbtest-only-b off')
  })

  it('SET-14 a volatile field reaches the plugin without restarting it', T, async () => {
    const mains = (await mainApplies()).length
    const sides = (await sideApplies()).length
    await saveOk({ values: { live: 'two' } })
    const live = await until(async () => (await host.call('settingsLive', { plugin: SET.name, row: MAIN }))?.config?.live === 'two', 10000, 100)
    assert.ok(live, 'the plugin\'s live config shows the new value')
    await quiet(QUIET_MS)
    assert.equal((await mainApplies()).length, mains, 'no restart of the row')
    assert.equal((await sideApplies()).length, sides, 'no restart of the other row')
  })

  it('SET-15 a valid value that fails to mount turns the plugin off with row-failed and keeps the stored values', T, async () => {
    await saveOk({ values: { greeting: SETTINGS_FIXTURE.failGreeting } })
    const failed = await untilCatalog(host, (c) => pluginIn(c, SET.name)?.lastError === 'row-failed', 10000)
    assert.ok(failed, 'lastError row-failed')
    assert.equal(pluginIn(failed, SET.name).on, false, 'turned off')
    assert.equal((await user()).greeting, SETTINGS_FIXTURE.failGreeting, 'stored values stay so you can fix them')
    const mains = (await mainApplies()).length
    await saveOk({ reset: [['greeting']] })
    assert.equal((await host.post(API.plugins, { plugin: SET.name, on: true })).status, 200)
    assert.ok(await untilApply(host, SET.name, MAIN, mains, (c) => c.greeting === SETTINGS_FIXTURE.base.greeting), 'mounts again with the plugin\'s own value')
    await settle(host)
  })

  describe('SET-16 a row whose own patch config is invalid (A118)', () => {
    const row = BAD.rows.main
    const bad = (body) => saveSettings(host, { plugin: BAD.name, row, ...body })
    const badUser = async () => rowIn(await detailOf(host, BAD.name), row)?.user ?? {}
    /** A refused save: 400 invalid with path [name], and the row's stored values as they were. */
    const refusedBad = async (body) => {
      const before = await badUser()
      const r = await bad(body)
      assert.equal(r.status, 400, JSON.stringify(body) + ': ' + r.text)
      assert.deepEqual(r.json?.code, MANAGER_CODE.invalid)
      assert.deepEqual(r.json.path, ['name'])
      assert.deepEqual(await badUser(), before, 'stored values unchanged')
    }
    const okBad = async (body) => { const r = await bad(body); assert.equal(r.status, 200, JSON.stringify(body) + ': ' + r.text) }

    it('SET-16a a save that still leaves the config invalid is refused with the path', T, async () => {
      await refusedBad({ values: { size: 3 } })
    })
    it('SET-16b a save that makes the whole config valid is accepted and clears the error', T, async () => {
      await okBad({ values: { name: 'n' } })
      const d = rowIn(await detailOf(host, BAD.name), row)
      assert.equal(d.error, null)
      assert.equal(d.value.name, 'n')
      await okBad({ values: { size: 3 } })
      assert.deepEqual(await badUser(), { name: 'n', size: 3 })
    })
    it('SET-16c a reset that leaves values stored but the config invalid is refused', T, async () => {
      await refusedBad({ reset: [['name']] })
      assert.deepEqual(await badUser(), { name: 'n', size: 3 })
    })
    it('SET-16d resets that leave the row with no values are never refused', T, async () => {
      await okBad({ reset: [['name'], ['size']] })
      assert.deepEqual(await badUser(), {})
      assert.equal(typeof rowIn(await detailOf(host, BAD.name), row).error, 'string', 'the plugin\'s own error again')
      assert.equal(storedRecord(home, row), undefined, 'the empty record is deleted')
    })
    it('SET-16e reset [] on such a row is never refused', T, async () => {
      await okBad({ values: { name: 'm' } })
      await okBad({ reset: [[]] })
      assert.deepEqual(await badUser(), {})
      assert.equal(typeof rowIn(await detailOf(host, BAD.name), row).error, 'string')
    })
  })

  it('SET-17 the settings route is behind DSH\'s browser authentication', T, async () => {
    const before = await user()
    const res = await fetch(host.origin + MANAGER_API.settings, {
      method: 'POST', headers: { origin: host.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ plugin: SET.name, row: MAIN, values: { limit: 2 } }),
    })
    await res.text()
    assert.notEqual(res.status, 200)
    assert.deepEqual(await user(), before)
    // Same-origin fence: the browser cookie from another origin does not save either.
    const foreign = await saveSettings(host, { plugin: SET.name, row: MAIN, values: { limit: 2 } }, { headers: { origin: 'http://fbtest-foreign.example' } })
    assert.notEqual(foreign.status, 200, foreign.text)
    assert.deepEqual(await user(), before)
  })
})
