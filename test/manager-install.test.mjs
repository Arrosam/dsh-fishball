/**
 * Revision 10a (DESIGN §10d "Install for Fishball", §4 "Who changes what", S31): the install routes.
 * Installs go into Fishball's own package folder through DSH's inherited install process; your call is
 * the approval (no prompt). One new-install host, cases in order (state transitions).
 *
 * | id     | technique | requirement | expected |
 * |--------|-----------|-------------|----------|
 * | INS-01 | EP/BVA (body shapes) | 400 bad-body for a malformed body | inspect: invalid JSON, array, {}, spec missing/1/null/''/blanks; install: the same for spec, requestId missing/''/1, approvedBuilds a string/an object/[1]/['']; cancel: invalid JSON, {}, requestId ''/1. Nothing installed |
 * | INS-02 | EP (inspect accepted) | DSH's inspection, nothing installed | local bundle folder: {ok:true, inspection:{status:accepted, kind:path, name, version, bundle:true}}; not in Fishball's folder; no entry |
 * | INS-03 | DT (inspect refused by DSH) | refused with problem and reason | a missing absolute folder: not-found or not-a-package (A129); a package without a bundle: not-a-bundle; reason a string; nothing installed |
 * | INS-04 | EP (Fishball's own spec check) | 409 invalid-spec | ./rel and ../rel: 409 {ok:false, code:'invalid-spec'} |
 * | INS-05 | ST (not installed -install-> installed, on) | installed as a copy into Fishball's folder, on for Fishball by you, audited add | 200 {ok, plugin: fishball:fbtest-added, name, version, on:true} with approvedBuilds []; a file: dependency resolving inside Fishball's folder, not the source; entry kind fishball-installed, dsh none, runs fishball, on, changedBy user; its unchecked tool stays unchecked; one audit add/user; no prompt; DSH's bundle list unchanged |
 * | INS-06 | EP (progress events) | install-state and install-log carry the caller's request id | both kinds seen for fbtest-ins-05 |
 * | INS-07 | ST installed -install again-> | already-installed | inspect and install: 409 already-installed; still one entry |
 * | INS-08 | EP (package without a bundle) | not-bundle, removed again | 409 not-bundle; gone from Fishball's folder within 30 s (A130); no entry |
 * | INS-09 | EP (nothing at the path) | a refusal with a PACKAGE_ERROR code | 409 with a code from the list; nothing installed |
 * | INS-10 | EP (cancel) | DSH's answer for an unknown request | 200 {ok:true, outcome:'not-running'} |
 * | INS-11 | DT (installed, turning on refused) | on:false with code | maxFishballOnlyPlugins 1 with fishball:fbtest-added on: 200 {ok, plugin, name, version, on:false, code:'limit-reached'}; installed and off |
 * | INS-12 | EP (afterEach) | the DSH profile never changes | package.json, lockfile, cordis.patch.yml byte-identical after every case |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, afterEach, before, describe, it } from 'node:test'
import {
  ADDED_BUNDLE, ADDED_BUNDLE_B, ADDED_BUNDLE_C, ADD_ACTION, CANCEL_OUTCOMES, CODE, DSH_STATE, FISHBALL_PLUGINS_DIR, INSPECT_PROBLEM, INSPECT_STATUS,
  INSTALL_API, INSTALL_EVENTS, INSTALLED_KEY, KIND, LIMITS, NOT_BUNDLE, PACKAGE_ERRORS, RUNS, TOOL_STATUS,
} from './support/constants.mjs'
import { HOOK, INSTALL_MS, T, auditRows, catalogSettled, fishballDeps, inFishballFolder, pluginIn, profileSnapshot, settledIdle, toolIn, untilCatalog } from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const KEY = INSTALLED_KEY(ADDED_BUNDLE.name)
const KEY_B = INSTALLED_KEY(ADDED_BUNDLE_B.name)
const REQUEST = 'fbtest-ins-05'
const INSTALL_T = { timeout: INSTALL_MS + 30000 }
const UNDO_MS = 30000

describe('Install for Fishball routes (revision 10a)', () => {
  let host
  let home
  let fb
  let profile

  const inspect = (spec) => host.post(INSTALL_API.inspect, { spec })
  const install = (body) => host.post(INSTALL_API.install, body)
  const bundleList = async () => (await host.call('allBundles')).map((b) => b.name + ':' + b.enabled + ':' + b.installed).sort()
  const approvals = async () => (await host.call('approvals')).length
  const refusedWith = (res, code) => {
    assert.equal(res.status, 409, res.text)
    assert.equal(res.json?.ok, false)
    assert.equal(res.json?.code, code)
  }

  before(async () => {
    home = newHome('manager-install')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    await settledIdle(host, fb)
    profile = profileSnapshot(home)
  }, HOOK)
  afterEach(() => { if (profile) assert.deepEqual(profileSnapshot(home), profile, 'INS-12: the DSH profile files changed') })
  after(async () => { await host?.stop() }, HOOK)

  const SPEC = ADDED_BUNDLE_C.dir
  const badBodies = [
    ...[['invalid JSON', '{spec:', true], ['a JSON array', '["x"]', true], ['{}', {}], ['spec 1', { spec: 1 }], ['spec null', { spec: null }], ['spec empty', { spec: '' }], ['spec blanks', { spec: '   ' }]]
      .map(([label, body, raw]) => [INSTALL_API.inspect, label, body, raw]),
    ...[
      ['invalid JSON', '{spec:', true], ['a JSON array', JSON.stringify([SPEC, 'r']), true], ['{}', {}],
      ['spec missing', { requestId: 'fbtest-bad' }], ['spec empty', { spec: '', requestId: 'fbtest-bad' }], ['spec blanks', { spec: '   ', requestId: 'fbtest-bad' }], ['spec 1', { spec: 1, requestId: 'fbtest-bad' }],
      ['requestId missing', { spec: SPEC }], ['requestId empty', { spec: SPEC, requestId: '' }], ['requestId 1', { spec: SPEC, requestId: 1 }],
      ['approvedBuilds a string', { spec: SPEC, requestId: 'fbtest-bad', approvedBuilds: 'esbuild' }], ['approvedBuilds an object', { spec: SPEC, requestId: 'fbtest-bad', approvedBuilds: { esbuild: true } }],
      ['approvedBuilds [1]', { spec: SPEC, requestId: 'fbtest-bad', approvedBuilds: [1] }], ['approvedBuilds [\'\']', { spec: SPEC, requestId: 'fbtest-bad', approvedBuilds: [''] }],
    ].map(([label, body, raw]) => [INSTALL_API.install, label, body, raw]),
    ...[['invalid JSON', '{requestId:', true], ['{}', {}], ['requestId empty', { requestId: '' }], ['requestId 1', { requestId: 1 }]]
      .map(([label, body, raw]) => [INSTALL_API.cancel, label, body, raw]),
  ]
  for (const [route, label, body, raw] of badBodies) {
    it('INS-01 ' + route + ' with ' + label + ' answers 400 bad-body', T, async () => {
      const res = await host.post(route, body, { raw })
      assert.equal(res.status, 400, res.text)
      assert.deepEqual(res.json, { ok: false, code: CODE.badBody })
      assert.equal(inFishballFolder(home, ADDED_BUNDLE_C.name), false, 'nothing installed')
    })
  }

  it('INS-02 inspect of a local bundle folder answers DSH\'s accepted inspection and installs nothing', T, async () => {
    const res = await inspect(ADDED_BUNDLE.dir)
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.ok, true)
    const i = res.json.inspection
    assert.equal(i?.status, INSPECT_STATUS.accepted, res.text)
    assert.equal(i.kind, 'path')
    assert.equal(i.name, ADDED_BUNDLE.name)
    assert.equal(i.version, '0.0.1')
    assert.equal(i.bundle, true)
    assert.ok(Object.hasOwn(i, 'registry'), 'registry is part of the inspection')
    assert.equal(inFishballFolder(home, ADDED_BUNDLE.name), false, 'nothing installed')
    assert.equal(pluginIn(await catalogSettled(host), KEY), undefined)
  })

  // A missing folder is classified by DSH (not-found or not-a-package, A129); a folder without a bundle is not-a-bundle.
  for (const [label, spec, problems] of [['a missing absolute folder', '/nonexistent/fbtest-ins-03', [INSPECT_PROBLEM.notFound, INSPECT_PROBLEM.notAPackage]], ['a package without a bundle', NOT_BUNDLE.dir, [INSPECT_PROBLEM.notABundle]]]) {
    it('INS-03 inspect of ' + label + ' is refused ' + problems.join(' or ') + ' with a reason', T, async () => {
      const res = await inspect(spec)
      assert.equal(res.status, 200, res.text)
      assert.equal(res.json?.ok, true)
      assert.equal(res.json.inspection?.status, INSPECT_STATUS.refused, res.text)
      assert.ok(problems.includes(res.json.inspection.problem), 'problem ' + res.json.inspection.problem)
      assert.equal(typeof res.json.inspection.reason, 'string')
      assert.equal(inFishballFolder(home, NOT_BUNDLE.name), false)
    })
  }

  for (const spec of ['./fbtest-rel', '../fbtest-rel']) {
    it('INS-04 inspect of the relative spec ' + spec + ' is refused 409 invalid-spec by Fishball\'s own check', T, async () => {
      refusedWith(await inspect(spec), INSPECT_PROBLEM.invalidSpec)
    })
  }

  it('INS-05 POST install puts a copy into Fishball\'s folder and turns it on for Fishball, with no prompt', INSTALL_T, async () => {
    const asked = await approvals()
    const bundles = await bundleList()
    const audits = auditRows(home).length
    const res = await install({ spec: ADDED_BUNDLE.dir, requestId: REQUEST, approvedBuilds: [] })
    assert.equal(res.status, 200, res.text)
    assert.deepEqual(res.json, { ok: true, plugin: KEY, name: ADDED_BUNDLE.name, version: '0.0.1', on: true })
    // A local folder is installed as a copy (file:), resolving inside Fishball's folder, not to the source.
    assert.ok(String(fishballDeps(home)[ADDED_BUNDLE.name] ?? '').startsWith('file:'), 'a file: dependency: ' + JSON.stringify(fishballDeps(home)))
    const installed = fs.realpathSync(path.join(FISHBALL_PLUGINS_DIR(home), 'node_modules', ADDED_BUNDLE.name))
    assert.ok(installed.startsWith(fs.realpathSync(FISHBALL_PLUGINS_DIR(home)) + path.sep), 'inside Fishball\'s folder: ' + installed)
    assert.notEqual(installed, fs.realpathSync(ADDED_BUNDLE.dir), 'a copy, not a link to the source')
    const c = await untilCatalog(host, (x) => pluginIn(x, KEY)?.applied === true, INSTALL_MS)
    assert.ok(c, 'on and applied')
    const p = pluginIn(c, KEY)
    assert.equal(p.kind, KIND.installed)
    assert.equal(p.dsh, DSH_STATE.none)
    assert.equal(p.runs, RUNS.fishball)
    assert.equal(p.on, true)
    assert.equal(p.changedBy, 'user')
    assert.equal(toolIn(c, KEY, ADDED_BUNDLE.tool)?.status, TOOL_STATUS.unchecked, 'a tool nobody checked stays hidden')
    const audit = auditRows(home).slice(audits).filter((r) => r.plugin === KEY)
    assert.ok(audit.some((r) => r.action === ADD_ACTION && r.by === 'user'), 'audited add by you: ' + JSON.stringify(audit))
    assert.equal(await approvals(), asked, 'no prompt')
    assert.deepEqual(await bundleList(), bundles, 'DSH\'s own plugin manager is unaffected')
  })

  it('INS-06 the progress events carry the caller\'s request id', T, async () => {
    const events = await host.call('installEvents', { requestId: REQUEST })
    assert.ok(events.some((e) => e.type === INSTALL_EVENTS.state), 'an install-state event with the request id: ' + JSON.stringify((await host.call('installEvents')).slice(0, 5)))
    assert.ok(events.some((e) => e.type === INSTALL_EVENTS.log), 'an install-log event with the request id')
  })

  it('INS-07 a second install of the same package is refused already-installed', T, async () => {
    refusedWith(await inspect(ADDED_BUNDLE.dir), 'already-installed')
    refusedWith(await install({ spec: ADDED_BUNDLE.dir, requestId: 'fbtest-ins-07' }), 'already-installed')
    assert.equal((await catalogSettled(host)).plugins.filter((p) => p.plugin === KEY).length, 1)
  })

  it('INS-08 a package without a bundle is refused not-bundle and removed again', INSTALL_T, async () => {
    refusedWith(await install({ spec: NOT_BUNDLE.dir, requestId: 'fbtest-ins-08' }), 'not-bundle')
    // "Refused and undone" (A130): the removal may still be finishing when the refusal answers.
    assert.ok(await until(() => !inFishballFolder(home, NOT_BUNDLE.name), UNDO_MS, 200), 'not kept')
    assert.equal(pluginIn(await catalogSettled(host), INSTALLED_KEY(NOT_BUNDLE.name)), undefined)
  })

  it('INS-09 an install of a missing folder is refused with a package error code', INSTALL_T, async () => {
    const res = await install({ spec: '/nonexistent/fbtest-ins-09', requestId: 'fbtest-ins-09' })
    assert.equal(res.status, 409, res.text)
    assert.ok(PACKAGE_ERRORS.includes(res.json?.code), 'code ' + res.json?.code)
  })

  it('INS-10 cancel of a request that is not running answers not-running', T, async () => {
    const res = await host.post(INSTALL_API.cancel, { requestId: 'fbtest-never-started' })
    assert.equal(res.status, 200, res.text)
    assert.deepEqual(res.json, { ok: true, outcome: 'not-running' })
    assert.ok(CANCEL_OUTCOMES.includes(res.json.outcome))
  })

  describe('maxFishballOnlyPlugins 1', () => {
    const setLimit = async (n) => { const r = await host.call('settingsUpdate', { patch: { maxFishballOnlyPlugins: n } }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
    // The limit is the fishball row's config in the profile patch (§9), so the profile is snapshotted again after it.
    before(async () => { await setLimit(1); profile = profileSnapshot(home) }, HOOK)
    after(async () => { await setLimit(LIMITS.maxFishballOnlyPlugins.default) }, HOOK)

    it('INS-11 an install whose turning on is refused answers on:false with the code and stays installed, off', INSTALL_T, async () => {
      assert.equal(pluginIn(await catalogSettled(host), KEY)?.on, true, 'precondition: fishball:fbtest-added is on')
      const res = await install({ spec: ADDED_BUNDLE_B.dir, requestId: 'fbtest-ins-11' })
      assert.equal(res.status, 200, res.text)
      assert.deepEqual(res.json, { ok: true, plugin: KEY_B, name: ADDED_BUNDLE_B.name, version: '0.0.1', on: false, code: 'limit-reached' })
      assert.ok(inFishballFolder(home, ADDED_BUNDLE_B.name))
      const c = await untilCatalog(host, (x) => pluginIn(x, KEY_B), 15000)
      assert.equal(pluginIn(c, KEY_B).on, false)
    })
  })
})
