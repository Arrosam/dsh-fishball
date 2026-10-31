/**
 * P12 (DESIGN §10d "Host API"): GET /api/fishball/plugins/detail and GET /api/fishball/plugins/icon.
 * One host with the settings fixtures (MANAGER_ENV); cases run in order.
 *
 * | id     | technique | requirement | expected |
 * |--------|-----------|-------------|----------|
 * | DET-01 | EP | the answer's shape | 200 {ok:true, detail:{plugin, shared, settings, rows, history}}; rows one per leaf row, in patch order, each with the 9 keys |
 * | DET-02 | EP (row with a schema) | schema, base, user, value, secrets, error, editable | schema = toJSON (rebuilds with new Schema and resolves base); base = the patch config resolved, both secrets (top-level and nested) removed; user {}; value = base; secrets [{auth.key, set:true}, {token, set:true}]; error null; editable true |
 * | DET-03 | EP (row without a schema) | no form | schema null; editable false |
 * | DET-04 | EP (secret) | a secret value never appears in the detail route | neither secret anywhere in the answer, before and after the user sets one; secrets says set |
 * | DET-05 | EP | reading imports, nothing is mounted | detail of an off plugin records no private-tree apply; it stays off and unapplied |
 * | DET-06 | DT (plugin on in DSH) | shared, settings none, nothing editable | fbtest-settings-dsh: shared true, settings none, every row editable false |
 * | DET-07 | DT (Compaction engine row) | not editable | builtin:compaction lists compaction-basic with editable false; shared false |
 * | DET-08 | EP (no rows) | the Messenger look | rows []; settings none |
 * | DET-09 | EP (invalid patch config) | the row's own error | error is a non-empty string; editable true; schema present |
 * | DET-10 | BVA (0, 9, 10, 11 changes) | history: newest 10, newest first, {action, by, at, outcome} | lengths 0, 9, 10, 10; the 11th change drops the oldest; order newest first; by user; outcome ok |
 * | DET-11 | EP (bad request) | 400 bad-body without plugin | no query and a wrong parameter name: 400 {ok:false, code:'bad-body'}; an empty plugin: 400 bad-body or 404 unknown (A117) |
 * | DET-12 | EP (unknown) | 404 unknown for a plugin not in the catalog | unknown key, dsh-fishball itself, wrong case: 404 {ok:false, code:'unknown'} |
 * | DET-13 | DT (icon / no icon / unknown) | the icon route | fbtest-settings: 200 image/svg+xml with its file; fbtest-settings-dsh and an unknown key: 404 {ok:false, code:'unknown'} |
 * | DET-14 | EP (no cookie) | behind browser authentication | detail and icon without the cookie are not 200 |
 * | DET-15 | EP | the profile is untouched | package.json, cordis.patch.yml and lockfile byte-identical |
 * | DET-16 | EP (error with rejected secret data) | an error message leaving the Host is cut before " but got " | fbtest-settings-leak: rows[].error a non-empty message without "but got" or the secret; the whole answer carries neither |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  API, AUDIT_OUTCOME, CHANGED_BY, COMPACTION, DETAIL_KEYS, DETAIL_ROW_KEYS, HISTORY_KEYS, HISTORY_MAX, MANAGER_API, MANAGER_BUNDLES, MANAGER_CODE,
  MANAGER_ENV, MESSENGER, PACKAGE_NAME, SETTINGS_FIXTURE, SETTINGS_STATE,
} from './support/constants.mjs'
import {
  HOOK, T, Schema, assertCutError, assertNoSecret, auditRows, catalogSettled, detailOf, getDetail, getIcon, pathText, pluginIn, privateApplies, profileSnapshot, quiet, rowIn, saveSettings, settle,
} from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const SET = MANAGER_BUNDLES.settings
const DSH = MANAGER_BUNDLES.dsh
const BAD = MANAGER_BUNDLES.bad
const LEAK = MANAGER_BUNDLES.leak
/** A row's secrets as sorted {path (dotted), set}. */
const secretsOf = (row) => row.secrets.map((s) => ({ path: pathText(s.path), set: s.set })).sort((a, b) => a.path.localeCompare(b.path))
const time = (at) => (typeof at === 'number' ? at : Date.parse(at))

describe('P12 detail and icon routes', () => {
  let host
  let home
  let profile

  before(async () => {
    home = newHome('manager-detail')
    const booted = await bootLive(home, { env: MANAGER_ENV })
    host = booted.host
    await settle(host)
    profile = profileSnapshot(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('DET-01 the detail answers {ok, detail:{plugin, shared, settings, rows, history}} with one row per leaf row in patch order', T, async () => {
    const r = await getDetail(host, SET.name)
    assert.equal(r.status, 200, r.text)
    assert.equal(r.json?.ok, true)
    const d = r.json.detail
    assert.deepEqual(Object.keys(d).sort(), DETAIL_KEYS)
    assert.equal(d.plugin, SET.name)
    assert.equal(d.shared, false)
    assert.equal(d.settings, SETTINGS_STATE.default)
    assert.deepEqual(d.rows.map((x) => x.row), [SET.rows.main, SET.rows.side], 'patch order')
    for (const row of d.rows) {
      assert.deepEqual(Object.keys(row).sort(), DETAIL_ROW_KEYS, 'keys of row ' + row.row)
      assert.equal(typeof row.module, 'string')
      assert.ok(row.module.includes(SET.name), row.row + ' module ' + row.module)
    }
    assert.ok(Array.isArray(d.history))
  })

  it('DET-02 a row with a schema carries its JSON schema, resolved base, stored values, secrets and no error', T, async () => {
    const row = rowIn(await detailOf(host, SET.name), SET.rows.main)
    assert.ok(row.schema && typeof row.schema === 'object', 'schema is toJSON()')
    // The browser rebuilds the schema as DSH's settings view does; it must resolve the base value.
    const rebuilt = new Schema(row.schema)
    assert.deepEqual(Object.keys(rebuilt.dict ?? {}).sort(), ['accounts', 'auth', 'enabled', 'greeting', 'limit', 'live', 'mode', 'nested', 'servers', 'tags', 'token'])
    assert.doesNotThrow(() => rebuilt(row.base))
    assert.deepEqual(row.base, SETTINGS_FIXTURE.base, 'the patch config resolved, secret removed')
    assert.equal(Object.hasOwn(row.base, 'token'), false, 'the secret field is removed from base')
    assert.deepEqual(row.user ?? {}, {}, 'nothing stored yet')
    assert.deepEqual(row.value, SETTINGS_FIXTURE.base, 'value = base when nothing is stored')
    assert.equal(Object.hasOwn(row.base.auth ?? {}, 'key'), false, 'the nested secret is removed from base')
    assert.deepEqual(secretsOf(row), SETTINGS_FIXTURE.secretPaths.map((path) => ({ path, set: true })))
    assert.equal(row.error, null)
    assert.equal(row.editable, true)
  })

  it('DET-03 a row without a schema has no form', T, async () => {
    const row = rowIn(await detailOf(host, SET.name), SET.rows.side)
    assert.equal(row.schema, null)
    assert.equal(row.editable, false)
    assert.equal(row.error, null)
  })

  it('DET-04 no secret value appears in the detail, before or after you set one', T, async () => {
    assertNoSecret(assert, (await getDetail(host, SET.name)).text, 'detail with the patch secret')
    const saved = await saveSettings(host, { plugin: SET.name, row: SET.rows.main, values: { token: SETTINGS_FIXTURE.userSecret } })
    assert.equal(saved.status, 200, saved.text)
    const r = await getDetail(host, SET.name)
    assertNoSecret(assert, r.text, 'detail with your secret')
    const row = rowIn(r.json.detail, SET.rows.main)
    for (const k of ['base', 'user', 'value']) assert.equal(Object.hasOwn(row[k] ?? {}, 'token'), false, k + ' has the secret field removed')
    assert.deepEqual(secretsOf(row), SETTINGS_FIXTURE.secretPaths.map((path) => ({ path, set: true })))
    assert.equal((await saveSettings(host, { plugin: SET.name, row: SET.rows.main, reset: [[]] })).status, 200)
  })

  it('DET-05 reading an off plugin\'s detail mounts nothing', T, async () => {
    for (const plugin of [SET.name, BAD.name]) {
      const before = (await host.call('settingsEvents', { plugin })).length
      await detailOf(host, plugin)
      await quiet(500)
      const events = (await host.call('settingsEvents', { plugin })).slice(before)
      assert.deepEqual(events.map((e) => e.type + ':' + e.entryId), [], plugin + ' was mounted')
      const p = pluginIn(await catalogSettled(host), plugin)
      assert.equal(p.on, false)
      assert.equal(p.applied, false)
    }
    assert.deepEqual(await privateApplies(host, SET.name, SET.rows.main), [])
  })

  it('DET-06 a plugin on in DSH is shared, has settings none and no editable row', T, async () => {
    const d = await detailOf(host, DSH.name)
    assert.equal(d.shared, true)
    assert.equal(d.settings, SETTINGS_STATE.none)
    assert.ok(d.rows.length >= 1, 'its row is listed')
    for (const row of d.rows) assert.equal(row.editable, false, row.row)
  })

  it('DET-07 the Compaction built-in\'s engine row is not editable', T, async () => {
    const d = await detailOf(host, COMPACTION.plugin)
    assert.equal(d.shared, false)
    const engine = rowIn(d, COMPACTION.engineRow)
    assert.ok(engine, 'the engine row is listed: ' + JSON.stringify(d.rows.map((x) => x.row)))
    assert.equal(engine.editable, false)
  })

  it('DET-08 the Messenger look has no rows and settings none', T, async () => {
    const d = await detailOf(host, MESSENGER.key)
    assert.deepEqual(d.rows, [])
    assert.equal(d.settings, SETTINGS_STATE.none)
  })

  it('DET-09 a row whose own patch config is invalid shows the schema\'s error', T, async () => {
    const row = rowIn(await detailOf(host, BAD.name), BAD.rows.main)
    assert.ok(row, 'the row is listed')
    assert.equal(typeof row.error, 'string')
    assert.ok(row.error.length > 0)
    assert.ok(row.schema, 'schema present')
    assert.equal(row.editable, true)
  })

  it('DET-10 history keeps the newest 10 changes, newest first', T, async () => {
    const history = async () => (await detailOf(host, DSH.name)).history
    assert.deepEqual(await history(), [], 'BVA 0: no change yet')
    const made = []
    const change = async () => {
      const on = made.length % 2 === 0
      const before = auditRows(home).length
      const r = await host.post(API.plugins, { plugin: DSH.name, on })
      assert.equal(r.status, 200, r.text)
      made.push(on ? 'on' : 'off')
      await until(() => auditRows(home).length > before, 5000, 50)
      await settle(host)
    }
    const expectNewest = async (n) => {
      const h = await history()
      assert.equal(h.length, Math.min(n, HISTORY_MAX), 'length after ' + n + ' changes')
      for (const e of h) {
        assert.deepEqual(Object.keys(e).sort(), HISTORY_KEYS)
        assert.equal(e.by, CHANGED_BY.user)
        assert.equal(e.outcome, AUDIT_OUTCOME.ok)
      }
      assert.deepEqual(h.map((e) => e.action), made.slice(-HISTORY_MAX).reverse(), 'newest first')
      for (let i = 1; i < h.length; i++) assert.ok(time(h[i - 1].at) >= time(h[i].at), 'at is non-increasing')
      return h
    }
    for (let i = 0; i < 9; i++) await change()
    await expectNewest(9)
    await change()
    const ten = await expectNewest(10)
    await change()
    const eleven = await expectNewest(11)
    assert.deepEqual(eleven.slice(1), ten.slice(0, HISTORY_MAX - 1), 'the 11th change drops the oldest')
  })

  for (const [label, query] of [['no query', ''], ['a wrong parameter name', '?plugins=' + SET.name]]) {
    it('DET-11 detail with ' + label + ' answers 400 bad-body', T, async () => {
      const r = await host.get(MANAGER_API.detail + query)
      assert.equal(r.status, 400, r.text)
      assert.deepEqual(r.json, { ok: false, code: MANAGER_CODE.badBody })
    })
  }
  it('DET-11 detail with an empty plugin is refused (400 bad-body or 404 unknown)', T, async () => {
    const r = await host.get(MANAGER_API.detail + '?plugin=')
    assert.ok([400, 404].includes(r.status), r.status + ' ' + r.text)
    assert.equal(r.json?.ok, false)
    assert.ok([MANAGER_CODE.badBody, MANAGER_CODE.unknown].includes(r.json?.code), r.text)
  })

  for (const plugin of ['fbtest-no-such-plugin', PACKAGE_NAME, SET.name.toUpperCase()]) {
    it('DET-12 detail of ' + JSON.stringify(plugin) + ' answers 404 unknown', T, async () => {
      const r = await getDetail(host, plugin)
      assert.equal(r.status, 404, r.text)
      assert.deepEqual(r.json, { ok: false, code: MANAGER_CODE.unknown })
    })
  }

  it('DET-13 the icon route serves the package icon, or 404 unknown without one', T, async () => {
    const r = await getIcon(host, SET.name)
    assert.equal(r.status, 200, r.text.slice(0, 300))
    assert.ok(r.contentType.startsWith('image/svg+xml'), 'content type ' + r.contentType)
    assert.ok(r.text.includes(SETTINGS_FIXTURE.iconMarker), 'the fixture\'s own icon file')
    for (const plugin of [DSH.name, 'fbtest-no-such-plugin']) {
      const none = await getIcon(host, plugin)
      assert.equal(none.status, 404, plugin + ': ' + none.text)
      assert.deepEqual(none.json, { ok: false, code: MANAGER_CODE.unknown })
    }
  })

  it('DET-14 detail and icon are behind DSH\'s browser authentication', T, async () => {
    for (const p of [MANAGER_API.detail, MANAGER_API.icon]) {
      const res = await fetch(host.origin + p + '?plugin=' + encodeURIComponent(SET.name))
      const text = await res.text()
      assert.notEqual(res.status, 200, p + ' answered without a cookie')
      assertNoSecret(assert, text, p + ' without a cookie')
    }
  })

  it('DET-16 a row whose patch config is invalid shows the error cut before " but got ", with no secret', T, async () => {
    const r = await getDetail(host, LEAK.name)
    assert.equal(r.status, 200, r.text)
    assertCutError(assert, rowIn(r.json.detail, LEAK.rows.main)?.error, 'detail rows[].error')
    assertNoSecret(assert, r.text, 'the detail of a plugin whose patch puts a secret in the rejected value')
    assert.equal(r.text.includes(SETTINGS_FIXTURE.errorCut.trim()), false, 'no rejected data anywhere in the detail')
  })

  it('DET-15 the profile files are byte-identical after every action of this file', T, () => {
    assert.deepEqual(profileSnapshot(home), profile)
  })
})
