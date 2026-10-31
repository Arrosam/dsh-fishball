/**
 * Plugin statuses feature: the three statuses (installed-in-fishball, dsh-enabled, dsh-disabled) plus
 * built-ins, the actions each offers, Fishball-installed plugins (add_plugin into Fishball's own folder,
 * remove_plugin, POST plugins/remove; revision 10a: POST install, and POST plugins/install removed). One new-install host, cases in order
 * (state transitions); a second host whose store is unreadable checks 'unavailable'.
 * Requirements: the plugin-statuses brief (see CASES.md "Plugin statuses cases"); never the implementation.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | STA-01 | EP | every catalog entry (list_plugins, GET state, first SSE frame) has the 12 keys; status/actions/removing follow the decision table (expectedStatus/expectedActions) |
 * | STA-02 ×n | DT (kind × on) at defaults | built-ins: builtin, [disable] when on, [enable] when off; profile-enabled fbtest-tools and fishball-only fbtest-only: off, dsh-disabled, [enable] |
 * | STA-03 | ST dsh-disabled -user on-> dsh-enabled -set_plugin_enabled off-> dsh-disabled | [disable] then [enable]; profile files and listBundles enabled flags unchanged; ordinary session keeps the fixture tools |
 * | STA-04 ×13 | DT (remove route × plugin kind) | DSH plugin on/off, built-in on/off: 409 refused; unknown, fishball:<unknown>, dsh-fishball: 409 unknown; 5 malformed bodies: 400 bad-body; catalog and profile unchanged |
 * | STA-05 ×5 | DT (remove_plugin × kind) | unknown keys: unknown-plugin; DSH plugin on/off, built-in: not-removable; no prompt |
 * | STA-06 ×4 | EP + BVA (invalid spec: '', blanks, ./rel, ../rel) | install-failed / invalid-spec; no prompt; nothing installed |
 * | STA-07 | DT (add_plugin × Reject) | one prompt (add_plugin, reason has spec and reason); rejected; nothing in Fishball's folder or the profile |
 * | STA-08 | DT (add_plugin × Allow) | {ok:true, plugin, on:true, installed: fishball:fbtest-added}; package in Fishball's folder, profile files byte-identical, listBundles unchanged; entry kind fishball-installed, installed-in-fishball, on, [disable, uninstall], removing false |
 * | STA-09 | EP (isolation) | its code runs; its tool is in Fishball's next request and runs for Fishball; not global; not in an ordinary session |
 * | STA-10 | EP (same package again) | install-failed / already-installed; still one entry |
 * | STA-11 | ST on -off-> off -user on-> on | [enable, uninstall] then [disable, uninstall]; tool gone then back; code disposed then applied |
 * | STA-12 | BVA (maxFishballOnlyPlugins 1) | with fishball:fbtest-added on, a fishball-only plugin is refused (409 refused / limit-reached); with it off, accepted |
 * | STA-13 | DT (remove_plugin × Reject) | one prompt with toolName remove_plugin; rejected; still installed and on |
 * | STA-14 | ST on -remove (Allow)-> removing -turn ends-> gone | answer {ok:true, plugin, removing:true}; a list_plugins later in the same turn shows removing true, actions []; after the turn the entry and the package are gone, the tool too; audit action remove |
 * | STA-15 | ST gone -add again-> installed | re-adding after the uninstall succeeds (not already-installed) |
 * | STA-16 | EP (package without a bundle patch) | install-failed / not-bundle; not kept in Fishball's folder; no entry |
 * | STA-17 | EP (removed route, revision 10a) | POST plugins/install answers as a path no route serves (not 200); Fishball receives nothing |
 * | STA-19 | ST (user install route, revision 10a) | POST install {spec, requestId}: 200 {ok, plugin: fishball:fbtest-added-b, name, version, on:true}; no prompt; installed, on and applied, changedBy user; profile files byte-identical |
 * | STA-20 | ST on -user remove while Fishball runs-> removing -turn ends-> gone | 200; no prompt; removing true, actions [] in GET state and in an SSE frame while the turn runs, package still there; gone after the turn |
 * | STA-21 | ST on -user remove while idle-> gone | 200; the entry and the package go without a Fishball turn |
 * | STA-22 | DT (same name as a DSH plugin) | fishball:fbtest-added-c is a separate entry; the DSH entry fbtest-added-c keeps kind fishball-only, off; the remove route refuses the DSH entry; removing the Fishball one leaves the DSH one |
 * | STA-24 | EP (no cookie) | the remove route and the three install routes are not 200 |
 * | STA-25 ×2 | EP (store unreadable: core failed) | POST install/inspect and POST install answer 409 unavailable; nothing installed |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  ACTION, ADDED_BUNDLE, ADDED_BUNDLE_B, ADDED_BUNDLE_C, API, BUILTINS, CATALOG_KEYS, CODE, FIXTURE_BUNDLE, FIXTURE_UNCHECKED, INSTALL_API, INSTALL_REASON,
  INSTALLED_KEY, KIND, LIMITS, NOT_BUNDLE, ONLY_BUNDLES, OUTCOME, P5_CODE, PACKAGE_NAME, PLUGIN_KEYS, PLUGIN_STATUS, PRESET, STATUS, STORE,
} from './support/constants.mjs'
import {
  HOOK, INSTALL_MS, LONG_T, T, addPlugin, assertEntryContract, auditRows, callScript, catalogSettled, fishballMessages, holdFishball,
  inFishballFolder, inProfile, listPlugins, nextTools, pluginIn, profileFiles, profileSnapshot, removePlugin, scriptedTurn, setPlugin,
  settle, settledIdle, toolNames, turn, untilCatalog,
} from './support/expect.mjs'
import { bootHost, bootLive, newHome, sleep, until } from './support/host.mjs'

const FIX = FIXTURE_BUNDLE.name
const KEY = INSTALLED_KEY(ADDED_BUNDLE.name)
const KEY_B = INSTALLED_KEY(ADDED_BUNDLE_B.name)
const KEY_C = INSTALLED_KEY(ADDED_BUNDLE_C.name)
/** listBundles as names with their DSH enabled flags: a Fishball change must leave it as it was. */
const bundleFlags = async (host) => (await host.call('allBundles')).map((b) => b.name + ':' + b.enabled + ':' + b.installed).sort()

describe('Plugin statuses on a new install', () => {
  let host
  let home
  let fb
  let bare
  const toggle = (plugin, on) => host.post(API.plugins, { plugin, on })
  const removeRoute = (plugin) => host.post(API.pluginsRemove, { plugin })
  const approvalsFor = async () => (await host.call('approvals', { sessionId: fb })).length
  const ordinaryTools = async () => toolNames((await turn(host, bare, [[{ text: 'hi' }]])).requests.at(-1))
  const eventsOf = async (bundle) => (await host.call('bundleEvents', { bundle })).map((e) => e.type)
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const gone = (key) => untilCatalog(host, (c) => !pluginIn(c, key), 60000)

  before(async () => {
    home = newHome('plugins-status')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    const created = await host.call('ordinary', { preset: PRESET.bare, folder: 'bare' })
    assert.equal(created.error, null)
    bare = created.sessionId
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('STA-01 every entry has status, actions and removing, following the decision table, in list_plugins, GET state and SSE', T, async () => {
    const listed = await listPlugins(host, fb)
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, 3000, 20), 'a first SSE frame')
      for (const [label, catalog] of [['list_plugins', listed], ['GET state', (await host.state()).catalog], ['SSE', stream.frames[0].catalog]]) {
        assert.deepEqual(Object.keys(catalog).sort(), CATALOG_KEYS, label)
        for (const p of catalog.plugins) {
          assert.deepEqual(Object.keys(p).sort(), PLUGIN_KEYS, label + ' keys of ' + p.plugin)
          assert.ok(Object.values(KIND).includes(p.kind), label + ' kind ' + p.kind)
          assert.ok(Object.values(PLUGIN_STATUS).includes(p.status), label + ' status ' + p.status)
          assert.equal(p.removing, false, label + ' nothing is being removed: ' + p.plugin)
          assertEntryContract(assert, p)
        }
      }
    } finally { stream.close() }
  })

  for (const [key, spec] of Object.entries(BUILTINS)) {
    it('STA-02 built-in ' + key + ': status builtin, actions ' + (spec.on ? '[disable]' : '[enable]') + ' (unchanged defaults)', T, async () => {
      const p = pluginIn((await host.state()).catalog, key)
      assert.equal(p?.on, spec.on)
      assert.equal(p.status, PLUGIN_STATUS.builtin)
      assert.deepEqual(p.actions, [spec.on ? ACTION.disable : ACTION.enable])
    })
  }
  for (const [name, kind] of [[FIX, KIND.profile], [ONLY_BUNDLES.a.name, KIND.only]]) {
    it('STA-02 DSH plugin ' + name + ' (' + kind + ') starts off: dsh-disabled, [enable]', T, async () => {
      const p = pluginIn((await host.state()).catalog, name)
      assert.equal(p?.kind, kind)
      assert.equal(p.on, false)
      assert.equal(p.status, PLUGIN_STATUS.dshDisabled)
      assert.deepEqual(p.actions, [ACTION.enable])
    })
  }

  it('STA-03 dsh-disabled -> dsh-enabled -> dsh-disabled changes Fishball only', T, async () => {
    const files = profileFiles(home)
    const flags = await bundleFlags(host)
    const asked = await approvalsFor()
    const res = await toggle(FIX, true)
    assert.equal(res.status, 200, res.text)
    let p = pluginIn((await catalogSettled(host)), FIX)
    assert.equal(p.on, true)
    assert.equal(p.status, PLUGIN_STATUS.dshEnabled)
    assert.deepEqual(p.actions, [ACTION.disable])
    assert.equal(await approvalsFor(), asked, 'the user toggle asks nobody')
    const off = await setPlugin(host, fb, FIX, false)
    assert.equal(off.json?.ok, true, off.result.text)
    p = pluginIn((await catalogSettled(host)), FIX)
    assert.equal(p.status, PLUGIN_STATUS.dshDisabled)
    assert.deepEqual(p.actions, [ACTION.enable])
    assert.deepEqual(profileFiles(home), files, 'profile package.json and cordis.patch.yml byte-identical')
    assert.deepEqual(await bundleFlags(host), flags, 'listBundles unchanged')
    const names = await ordinaryTools()
    for (const n of FIXTURE_UNCHECKED) assert.ok(names.includes(n), 'ordinary session keeps ' + n)
  })

  describe('no way to uninstall a DSH plugin or a built-in', () => {
    before(async () => { assert.equal((await toggle(FIX, true)).status, 200); await settle(host) }, HOOK)
    const refused = [[FIX, 'DSH plugin on (dsh-enabled)'], [ONLY_BUNDLES.a.name, 'DSH plugin off (dsh-disabled)'], ['builtin:web', 'built-in on'], ['builtin:shell', 'built-in off']]
    for (const [plugin, label] of refused) {
      it('STA-04 POST plugins/remove for a ' + label + ' answers 409 refused and changes nothing', T, async () => {
        const before = (await catalogSettled(host))
        const files = profileSnapshot(home)
        const res = await removeRoute(plugin)
        assert.equal(res.status, 409, res.text)
        assert.deepEqual(res.json, { ok: false, code: CODE.refused })
        await sleep(300)
        assert.deepEqual((await catalogSettled(host)), before)
        assert.deepEqual(profileSnapshot(home), files)
      })
    }
    for (const plugin of ['fbtest-no-such-plugin', INSTALLED_KEY('fbtest-no-such-plugin'), PACKAGE_NAME]) {
      it('STA-04 POST plugins/remove for unknown ' + JSON.stringify(plugin) + ' answers 409 unknown', T, async () => {
        const res = await removeRoute(plugin)
        assert.equal(res.status, 409, res.text)
        assert.deepEqual(res.json, { ok: false, code: CODE.unknown })
      })
    }
    for (const [label, body, raw] of [['invalid JSON', '{plugin:', true], ['a JSON array', '["x"]', true], ['{}', {}, false], ['plugin 1', { plugin: 1 }, false], ['plugin null', { plugin: null }, false]]) {
      it('STA-04 POST plugins/remove with ' + label + ' answers 400 bad-body', T, async () => {
        const res = await host.post(API.pluginsRemove, body, { raw })
        assert.equal(res.status, 400, res.text)
        assert.deepEqual(res.json, { ok: false, code: CODE.badBody })
      })
    }
    for (const [plugin, code] of [['fbtest-no-such-plugin', CODE.unknownPlugin], [INSTALLED_KEY('fbtest-no-such-plugin'), CODE.unknownPlugin], [FIX, CODE.notRemovable], [ONLY_BUNDLES.a.name, CODE.notRemovable], ['builtin:web', CODE.notRemovable]]) {
      it('STA-05 remove_plugin(' + plugin + ') answers ' + code + ' without a prompt', T, async () => {
        const r = await removePlugin(host, fb, plugin, OUTCOME.allow)
        assert.equal(r.approvals.length, 0, 'no prompt')
        assert.equal(r.json?.ok, false, r.result.text)
        assert.equal(r.json?.code, code)
        assert.ok(pluginIn(await catalogSettled(host), plugin) || code === CODE.unknownPlugin, 'still listed')
      })
    }
  })

  for (const [label, spec] of [['empty', ''], ['blanks', '   '], ['./relative', './fbtest-added'], ['../relative', '../fixtures/fbtest-added']]) {
    it('STA-06 add_plugin with an invalid spec (' + label + ') is install-failed/invalid-spec without a prompt', T, async () => {
      const files = profileSnapshot(home)
      const r = await addPlugin(host, fb, spec, OUTCOME.allow)
      assert.equal(r.approvals.length, 0, 'no prompt')
      assert.equal(r.json?.ok, false, r.result.text)
      assert.equal(r.json?.code, CODE.installFailed)
      assert.equal(r.json?.reason, INSTALL_REASON.invalidSpec)
      assert.deepEqual(profileSnapshot(home), files)
    })
  }

  it('STA-07 add_plugin answered Reject installs nothing anywhere', LONG_T, async () => {
    const files = profileSnapshot(home)
    const flags = await bundleFlags(host)
    const reason = 'fbtest wants added_echo'
    const r = await addPlugin(host, fb, ADDED_BUNDLE.dir, OUTCOME.reject, reason)
    assert.equal(r.approvals.length, 1)
    assert.equal(r.approvals[0].toolName, 'add_plugin')
    assert.ok(r.approvals[0].reason.includes(ADDED_BUNDLE.dir) && r.approvals[0].reason.includes(reason), r.approvals[0].reason)
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, CODE.rejected)
    assert.equal(inFishballFolder(home, ADDED_BUNDLE.name), false)
    assert.equal(inProfile(home, ADDED_BUNDLE.name), false)
    assert.deepEqual(profileSnapshot(home), files)
    assert.deepEqual(await bundleFlags(host), flags)
    assert.equal(pluginIn(await catalogSettled(host), KEY), undefined)
  })

  it('STA-08 add_plugin answered Allow installs into Fishball\'s folder and turns it on', LONG_T, async () => {
    const files = profileSnapshot(home)
    const flags = await bundleFlags(host)
    const r = await addPlugin(host, fb, ADDED_BUNDLE.dir, OUTCOME.allow)
    assert.ok(r.approvals.length >= 1)
    assert.equal(r.approvals[0].toolName, 'add_plugin')
    assert.equal(r.json?.ok, true, r.result.text)
    assert.equal(r.json?.plugin, KEY)
    assert.equal(r.json?.on, true)
    assert.equal(r.json?.installed, KEY)
    assert.ok(inFishballFolder(home, ADDED_BUNDLE.name), 'in Fishball\'s own folder')
    assert.equal(inProfile(home, ADDED_BUNDLE.name), false, 'not in the DSH profile')
    assert.deepEqual(profileSnapshot(home), files, 'profile package.json, lockfile and cordis.patch.yml unchanged')
    assert.deepEqual(await bundleFlags(host), flags, 'listBundles unchanged')
    const p = pluginIn(await catalogSettled(host), KEY)
    assert.ok(p, 'listed as ' + KEY)
    assert.equal(p.kind, KIND.installed)
    assert.equal(p.status, PLUGIN_STATUS.installed)
    assert.equal(p.on, true)
    assert.equal(p.removing, false)
    assert.deepEqual(p.actions, [ACTION.disable, ACTION.uninstall])
    assert.equal(pluginIn(await catalogSettled(host), ADDED_BUNDLE.name), undefined, 'no entry under the bare package name')
  })

  it('STA-09 a Fishball-installed plugin that is on runs for Fishball only', T, async () => {
    assert.equal((await eventsOf(ADDED_BUNDLE.name)).at(-1), 'apply', 'its code runs')
    assert.ok((await nextTools(host, fb)).includes(ADDED_BUNDLE.tool), 'in Fishball\'s next request')
    assert.equal((await host.call('globalToolNames')).includes(ADDED_BUNDLE.tool), false, 'not global')
    assert.equal((await ordinaryTools()).includes(ADDED_BUNDLE.tool), false, 'not in an ordinary session')
    const before = (await host.call('fixtureCalls', { name: ADDED_BUNDLE.tool, sessionId: fb })).length
    const { result } = await scriptedTurn(host, fb, callScript(ADDED_BUNDLE.tool, { text: 'x' })).then((t) => ({ result: t.results[0] }))
    assert.equal(result.isError, false, result.text)
    assert.equal((await host.call('fixtureCalls', { name: ADDED_BUNDLE.tool, sessionId: fb })).length, before + 1)
  })

  it('STA-10 adding the same package again is install-failed/already-installed', LONG_T, async () => {
    const r = await addPlugin(host, fb, ADDED_BUNDLE.dir, OUTCOME.allow)
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, CODE.installFailed)
    assert.equal(r.json?.reason, INSTALL_REASON.alreadyInstalled)
    const c = await catalogSettled(host)
    assert.equal(c.plugins.filter((p) => p.plugin === KEY).length, 1)
    assert.equal(pluginIn(c, KEY).on, true)
  })

  it('STA-11 installed-in-fishball on -> off -> on: actions follow, its code stops and starts', T, async () => {
    const off = await setPlugin(host, fb, KEY, false)
    assert.equal(off.json?.ok, true, off.result.text)
    let p = pluginIn(await catalogSettled(host), KEY)
    assert.equal(p.on, false)
    assert.equal(p.status, PLUGIN_STATUS.installed)
    assert.deepEqual(p.actions, [ACTION.enable, ACTION.uninstall])
    assert.equal((await nextTools(host, fb)).includes(ADDED_BUNDLE.tool), false)
    assert.equal((await eventsOf(ADDED_BUNDLE.name)).at(-1), 'dispose')
    assert.ok(inFishballFolder(home, ADDED_BUNDLE.name), 'off is not an uninstall')
    const res = await toggle(KEY, true)
    assert.equal(res.status, 200, res.text)
    p = pluginIn(await catalogSettled(host), KEY)
    assert.equal(p.on, true)
    assert.deepEqual(p.actions, [ACTION.disable, ACTION.uninstall])
    assert.equal((await eventsOf(ADDED_BUNDLE.name)).at(-1), 'apply')
    assert.ok((await nextTools(host, fb)).includes(ADDED_BUNDLE.tool), 'allowed before, visible again')
  })

  describe('maxFishballOnlyPlugins counts Fishball-installed plugins that are on', () => {
    after(async () => {
      await setLimit({ maxFishballOnlyPlugins: LIMITS.maxFishballOnlyPlugins.default })
      await toggle(ONLY_BUNDLES.a.name, false)
      await toggle(KEY, true)
      await settle(host)
    }, HOOK)
    it('STA-12 limit 1 with fishball:fbtest-added on: a fishball-only plugin is refused; with it off, accepted', T, async () => {
      await setLimit({ maxFishballOnlyPlugins: 1 })
      const res = await toggle(ONLY_BUNDLES.a.name, true)
      assert.equal(res.status, 409, res.text)
      assert.deepEqual(res.json, { ok: false, code: CODE.refused })
      const r = await setPlugin(host, fb, ONLY_BUNDLES.a.name, true, OUTCOME.allow)
      assert.equal(r.json?.code, CODE.limit, r.result.text)
      assert.equal((await toggle(KEY, false)).status, 200)
      await settle(host)
      const ok = await toggle(ONLY_BUNDLES.a.name, true)
      assert.equal(ok.status, 200, ok.text)
    })
  })

  it('STA-13 remove_plugin answered Reject changes nothing', LONG_T, async () => {
    const before = pluginIn(await catalogSettled(host), KEY)
    assert.equal(before?.on, true, 'precondition: on')
    const r = await removePlugin(host, fb, KEY, OUTCOME.reject)
    assert.equal(r.approvals.length, 1)
    assert.equal(r.approvals[0].toolName, 'remove_plugin')
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, CODE.rejected)
    await sleep(500)
    assert.deepEqual(pluginIn(await catalogSettled(host), KEY), before)
    assert.ok(inFishballFolder(home, ADDED_BUNDLE.name))
  })

  it('STA-14 remove_plugin answered Allow: removing until the turn ends, then gone', LONG_T, async () => {
    const files = profileSnapshot(home)
    const r = await scriptedTurn(host, fb, [[{ tool: 'remove_plugin', args: { plugin: KEY, reason: 'fbtest remove' } }], [{ tool: 'list_plugins', args: {} }], [{ text: 'done' }]], OUTCOME.allow)
    assert.equal(r.approvals.length, 1)
    assert.equal(r.approvals[0].toolName, 'remove_plugin')
    assert.equal(r.results.length, 2, JSON.stringify(r.results))
    const answer = JSON.parse(r.results[0].text)
    assert.equal(answer.ok, true, r.results[0].text)
    assert.equal(answer.plugin, KEY)
    assert.equal(answer.removing, true)
    const during = pluginIn(JSON.parse(r.results[1].text), KEY)
    assert.ok(during, 'still listed later in the same turn')
    assert.equal(during.removing, true)
    assert.deepEqual(during.actions, [])
    assert.ok(await gone(KEY), 'the entry disappears after the turn')
    assert.ok(await until(() => !inFishballFolder(home, ADDED_BUNDLE.name), 30000, 200), 'the package left Fishball\'s folder')
    assert.deepEqual(profileSnapshot(home), files, 'the DSH profile is untouched')
    assert.equal((await nextTools(host, fb)).includes(ADDED_BUNDLE.tool), false)
    assert.equal((await eventsOf(ADDED_BUNDLE.name)).at(-1), 'dispose')
    const removes = auditRows(home).filter((e) => e?.action === 'remove')
    assert.ok(removes.length >= 1, 'audit records action remove: ' + JSON.stringify(auditRows(home)))
  })

  it('STA-15 after the uninstall the same package can be added again', LONG_T, async () => {
    const r = await addPlugin(host, fb, ADDED_BUNDLE.dir, OUTCOME.allow)
    assert.equal(r.json?.ok, true, r.result.text)
    assert.equal(pluginIn(await catalogSettled(host), KEY)?.on, true)
  })

  it('STA-16 a package without a DSH bundle patch is install-failed/not-bundle and not kept', LONG_T, async () => {
    const files = profileSnapshot(home)
    const r = await addPlugin(host, fb, NOT_BUNDLE.dir, OUTCOME.allow)
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json?.code, CODE.installFailed)
    assert.equal(r.json?.reason, INSTALL_REASON.notBundle)
    // Revision 10a (A130): DSH's inherited process undoes the install; the removal may still be finishing when it answers.
    assert.ok(await until(() => !inFishballFolder(home, NOT_BUNDLE.name), 30000, 200), 'not kept')
    assert.equal(pluginIn(await catalogSettled(host), INSTALLED_KEY(NOT_BUNDLE.name)), undefined)
    assert.deepEqual(profileSnapshot(home), files)
  })

  describe('Install for Fishball (revision 10a)', () => {
    it('STA-17 the removed route POST plugins/install is absent: it answers as an unknown path and reaches nobody', T, async () => {
      await settledIdle(host, fb)
      const spec = '/nonexistent/fbtest-removed-route'
      const unknown = await host.post(API.unknownRoute, { spec })
      const res = await host.post(API.removedPluginsInstall, { spec })
      assert.notEqual(res.status, 200, res.text)
      assert.equal(res.status, unknown.status, 'the same answer as a path no route serves')
      await sleep(1000)
      assert.deepEqual(await fishballMessages(host, fb, spec), [], 'nothing was handed to Fishball')
    })

    it('STA-19 the user installs fbtest-added-b through POST install: no prompt, on for Fishball, changed by the user', LONG_T, async () => {
      await settledIdle(host, fb)
      const asked = await approvalsFor()
      const files = profileSnapshot(home)
      const res = await host.post(INSTALL_API.install, { spec: ADDED_BUNDLE_B.dir, requestId: 'fbtest-sta19' })
      assert.equal(res.status, 200, res.text)
      assert.deepEqual(res.json, { ok: true, plugin: KEY_B, name: ADDED_BUNDLE_B.name, version: '0.0.1', on: true })
      const c = await untilCatalog(host, (x) => pluginIn(x, KEY_B)?.on === true && pluginIn(x, KEY_B)?.applied === true, INSTALL_MS)
      assert.ok(c, 'fishball:fbtest-added-b installed and on')
      assert.equal(pluginIn(c, KEY_B).changedBy, 'user')
      assert.equal(await approvalsFor(), asked, 'your click is the approval: no prompt')
      assert.ok(inFishballFolder(home, ADDED_BUNDLE_B.name))
      assert.deepEqual(profileSnapshot(home), files)
    })
  })

  it('STA-20 the user\'s uninstall while Fishball runs waits for the turn, shown as removing', LONG_T, async () => {
    assert.ok(pluginIn(await catalogSettled(host), KEY_B), 'precondition: installed')
    const asked = (await host.call('approvals')).length
    const stream = await host.sse()
    await holdFishball(host, fb)
    try {
      const res = await removeRoute(KEY_B)
      assert.equal(res.status, 200, res.text)
      assert.equal(res.json?.ok, true)
      const p = pluginIn(res.json.state.catalog, KEY_B)
      assert.equal(p?.removing, true, 'answer state shows removing: ' + JSON.stringify(p))
      assert.deepEqual(p.actions, [])
      await sleep(1500)
      const held = pluginIn((await host.state()).catalog, KEY_B)
      assert.equal(held?.removing, true, 'still removing while the turn runs')
      assert.deepEqual(held.actions, [])
      assert.ok(inFishballFolder(home, ADDED_BUNDLE_B.name), 'not removed during the turn')
      assert.ok(await until(() => stream.frames.some((f) => pluginIn(f.catalog, KEY_B)?.removing === true), 5000, 50), 'an SSE frame shows removing: ' + JSON.stringify(stream.frames.map((f) => pluginIn(f.catalog, KEY_B)?.removing)))
    } finally {
      await host.call('releaseHold', { sessionId: fb })
    }
    await settledIdle(host, fb)
    try {
      assert.ok(await gone(KEY_B), 'gone after the turn')
      assert.ok(await until(() => !inFishballFolder(home, ADDED_BUNDLE_B.name), 30000, 200), 'package removed')
      assert.ok(await until(() => stream.frames.some((f) => f.catalog && !pluginIn(f.catalog, KEY_B)), 5000, 50), 'an SSE frame without the entry')
    } finally { stream.close() }
    assert.equal((await host.call('approvals')).length, asked, 'the user\'s uninstall asks nobody')
  })

  it('STA-21 the user\'s uninstall while Fishball is idle takes effect at once', LONG_T, async () => {
    await settledIdle(host, fb)
    assert.ok(pluginIn(await catalogSettled(host), KEY), 'precondition: installed (STA-15)')
    const requests = (await host.call('requests', { sessionId: fb })).length
    const res = await removeRoute(KEY)
    assert.equal(res.status, 200, res.text)
    assert.ok(await gone(KEY), 'gone with no Fishball turn')
    assert.ok(await until(() => !inFishballFolder(home, ADDED_BUNDLE.name), 30000, 200))
    assert.equal((await host.call('requests', { sessionId: fb })).length, requests, 'no Fishball model request was needed')
  })

  it('STA-22 a Fishball-installed plugin with a DSH plugin\'s name is a separate entry', { timeout: 240000 }, async () => {
    const D = ADDED_BUNDLE_C
    const r0 = await host.call('installBundle', { spec: D.dir, enabled: false }, 120000)
    assert.equal(r0.error, null, JSON.stringify(r0))
    const dsh = await untilCatalog(host, (c) => pluginIn(c, D.name), 15000)
    assert.ok(dsh, 'precondition: the DSH plugin is listed')
    const dshBefore = pluginIn(dsh, D.name)
    assert.equal(dshBefore.kind, KIND.only)
    assert.equal(dshBefore.on, false)
    const files = profileSnapshot(home)
    const r = await addPlugin(host, fb, D.dir, OUTCOME.allow)
    assert.equal(r.json?.ok, true, r.result.text)
    assert.equal(r.json?.plugin, KEY_C)
    let c = await catalogSettled(host)
    assert.equal(pluginIn(c, KEY_C)?.kind, KIND.installed)
    assert.equal(pluginIn(c, D.name)?.kind, KIND.only, 'the DSH entry stays')
    assert.equal(pluginIn(c, D.name).on, false)
    assert.equal(pluginIn(c, D.name).status, PLUGIN_STATUS.dshDisabled)
    assert.deepEqual(profileSnapshot(home), files, 'the profile is untouched by the Fishball install')
    const refusedRes = await removeRoute(D.name)
    assert.equal(refusedRes.status, 409, refusedRes.text)
    assert.deepEqual(refusedRes.json, { ok: false, code: CODE.refused })
    assert.equal((await removeRoute(KEY_C)).status, 200)
    assert.ok(await gone(KEY_C))
    c = await catalogSettled(host)
    assert.equal(pluginIn(c, D.name)?.kind, KIND.only, 'the DSH plugin is still there')
    assert.ok(inProfile(home, D.name), 'still installed in the profile')
  })

  it('STA-24 the remove route and the three install routes refuse a request without the browser cookie', T, async () => {
    for (const [route, body] of [[API.pluginsRemove, { plugin: FIX }], [INSTALL_API.inspect, { spec: '/nonexistent/fbtest-nocookie' }], [INSTALL_API.install, { spec: '/nonexistent/fbtest-nocookie', requestId: 'fbtest-nocookie' }], [INSTALL_API.cancel, { requestId: 'fbtest-nocookie' }]]) {
      const res = await fetch(host.origin + route, { method: 'POST', headers: { origin: host.origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      await res.text()
      assert.notEqual(res.status, 200, route)
    }
  })
})

describe('Plugin statuses while the core failed', () => {
  let host
  before(async () => {
    const home = newHome('plugins-status-failed')
    fs.mkdirSync(path.dirname(STORE.file(home)), { recursive: true })
    fs.writeFileSync(STORE.file(home), '{"unit": {"name": "fishball", "version": 1}, "global": ')
    host = await bootHost(home)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  for (const [route, body] of [[INSTALL_API.inspect, { spec: ADDED_BUNDLE.dir }], [INSTALL_API.install, { spec: ADDED_BUNDLE.dir, requestId: 'fbtest-sta25' }]]) {
    it('STA-25 POST ' + route + ' answers 409 unavailable while Fishball is not ready', T, async () => {
      const st = await host.waitStatus(STATUS.failed)
      assert.equal(st?.status, STATUS.failed, 'precondition: ' + JSON.stringify(st))
      const res = await host.post(route, body)
      assert.equal(res.status, 409, res.text)
      assert.deepEqual(res.json, { ok: false, code: P5_CODE.unavailable })
      assert.equal(inFishballFolder(host.home, ADDED_BUNDLE.name), false, 'nothing installed')
    })
  }
})
