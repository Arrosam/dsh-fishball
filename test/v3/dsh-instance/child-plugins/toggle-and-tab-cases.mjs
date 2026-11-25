/**
 * Phase 2 tests for `child-plugins`:
 *   1. Host `createChildPlugins(...).setEnabled(name, nextEnabled)` and
 *      `POST /api/dsh-instance/plugins/toggle` (`CHILD_PLUGIN_ROUTE.toggle`).
 *   2. Browser `FishballTab` (`client.fishball.js`): recommended section removal,
 *      per-plugin enable/disable Switch, DSH card layout, and uninstall flow.
 *
 * Designed strictly from requirements using EP, BVA, DT, and ST.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { BOOT, runtimeOf } from '../../fishball-core/package/constants.mjs'
import { routeContext } from '../host/fakes.mjs'
import { APPLIED, CHILD, CODE, FIXTURE, HTTP, PAGE, PROTECTED, ROUTE } from './constants.mjs'
import { detailEntry, openPage, tabEntries, wordsOf } from './page.mjs'

const TOGGLE = Object.freeze({
  route: '/api/dsh-instance/plugins/toggle',
  unknownCode: 'unknown-bundle',
  maxBodyBytes: 16384,
  host: '127.0.0.1:47011',
  origin: 'http://127.0.0.1:47011',
  foreignOrigin: 'https://evil.example',
  tempPrefix: 'fbtest-cp-toggle-',
  pluginA: 'demo-plugin-alpha',
  pluginB: 'demo-plugin-beta',
  unknownPlugin: 'fbtest-never-installed-plugin',
  attr: Object.freeze({
    toggle: 'data-fishball-toggle',
    uninstall: 'data-fishball-uninstall',
    recCategory: 'data-recommended-category',
    recPackage: 'data-recommended-package',
  }),
})

const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

const parseJson = (text) => { try { return JSON.parse(text) } catch { return undefined } }

/** Build an isolated temp home with a child profile manifest and installed bundle fixtures. */
async function createPluginsWorld(t, sdk, {
  installed = [{ name: TOGGLE.pluginA, version: '1.0.0', description: 'Alpha plugin', enabled: true }],
  instanceEnabled = true,
  restart,
} = {}) {
  const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), BOOT.cordisEntry)).href)
  const { createChildPlugins } = await importInstance(sdk, 'src/host/child-plugins.js')

  const home = fs.mkdtempSync(path.join(os.tmpdir(), TOGGLE.tempPrefix))
  const profileDir = path.join(home, ...CHILD.profile)
  fs.mkdirSync(profileDir, { recursive: true })

  const dependencies = {}
  const bundles = []
  for (const item of installed) {
    dependencies[item.name] = item.version ?? '1.0.0'
    if (item.enabled) bundles.push(item.name)
    const pkgDir = path.join(profileDir, CHILD.nodeModules, ...item.name.split('/'))
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, CHILD.manifest), JSON.stringify({
      name: item.name,
      version: item.version ?? '1.0.0',
      description: item.description ?? '',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2))
    fs.writeFileSync(path.join(pkgDir, 'cordis.patch.yml'), '[]\n')
  }
  const manifestPath = path.join(profileDir, CHILD.manifest)
  fs.writeFileSync(manifestPath, JSON.stringify({
    name: 'fishball-profile',
    dependencies,
    dsh: { profile: { bundles } },
  }, null, 2))

  const installAnchor = path.join(path.dirname(runtimeOf(sdk)), 'package.json')
  const ctx = new Context()
  ctx.provide('loader', { config: [], entries: () => [], list: () => [] })
  ctx.provide('profileContext', {
    name: 'main',
    dir: path.join(home, 'profiles', 'main'),
    patchPath: path.join(home, 'profiles', 'main', 'cordis.patch.yml'),
    installAnchor,
    cwd: home,
    home,
    startedBundles: [],
    overlays: [],
    telemetryDisabledEnv: '1',
  })

  const restarts = []
  const warnings = []
  let isEnabled = instanceEnabled
  const plugins = createChildPlugins({
    ctx,
    restart: async () => {
      restarts.push(Date.now())
      if (restart) return restart()
    },
    enabled: () => isEnabled,
    warn: (...a) => warnings.push(a),
  })

  t.after(async () => {
    await plugins.dispose?.().catch?.(() => {})
    await ctx.fiber.dispose?.().catch?.(() => {})
    fs.rmSync(home, { recursive: true, force: true })
  })

  const readManifest = () => JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  return {
    plugins,
    restarts,
    warnings,
    readManifest,
    setInstanceEnabled: (next) => { isEnabled = next },
  }
}

/** Build an in-process route harness for `registerChildPluginRoutes`. */
async function createRoutesWorld(sdk, plugins, { withRequestRejection = true } = {}) {
  const { registerChildPluginRoutes, CHILD_PLUGIN_ROUTE } = await importInstance(sdk, 'src/host/child-plugin-routes.js')
  const rc = routeContext()
  if (withRequestRejection) {
    rc.ctx.connection.requestRejection = ({ headers } = {}) => {
      const get = (k) => (typeof headers?.get === 'function' ? headers.get(k) : headers?.[k])
      const origin = get('origin')
      const host = get('host')
      if (!origin) return undefined
      try {
        return new URL(origin).host === host ? undefined : { status: HTTP.forbidden, reason: 'cross-origin' }
      } catch {
        return { status: HTTP.forbidden, reason: 'invalid-origin' }
      }
    }
  }
  registerChildPluginRoutes(rc.ctx, plugins)
  const handlerOf = (r) => r.fetch ?? r.handler

  async function call(method, routePath, {
    body,
    host = TOGGLE.host,
    origin = TOGGLE.origin,
    secFetchSite = 'same-origin',
  } = {}) {
    const route = rc.routes.find((r) => r.path === routePath)
    assert.ok(route, `route not registered: ${routePath}`)
    const headers = { host }
    if (origin !== undefined) headers.origin = origin
    if (secFetchSite !== undefined) headers['sec-fetch-site'] = secFetchSite
    if (body !== undefined) headers['content-type'] = 'application/json'
    const rawBody = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    const req = new Request(`http://${TOGGLE.host}${routePath}`, {
      method,
      headers,
      ...(rawBody === undefined ? {} : { body: rawBody }),
    })
    const res = await handlerOf(route)(req)
    const text = await res.text()
    return { status: res.status, json: parseJson(text), text }
  }

  return { call, routes: rc.routes, CHILD_PLUGIN_ROUTE }
}

/** Trigger a Switch primitive regardless of whether it binds onChange / onCheckedChange / onClick. */
async function triggerSwitch(page, node) {
  assert.ok(node, 'missing Switch node')
  if (node.props.disabled) return
  const next = !Boolean(node.props.checked)
  if (typeof node.props.onCheckedChange === 'function') {
    node.props.onCheckedChange(next)
  } else if (typeof node.props.onChange === 'function') {
    node.props.onChange(next)
  } else if (typeof node.props.onClick === 'function') {
    node.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
  } else {
    assert.fail('Switch node has no interactive handler prop: ' + JSON.stringify(Object.keys(node.props)))
  }
  await page.settle()
}

/** Open the Fishball tab in the scripted Plugins page harness. */
async function openFishballTab(t, sdk, { lang = 'en', fishball = [], respond } = {}) {
  const page = await openPage(t, sdk, { lang, fishball, respond })
  const entries = tabEntries(page)
  assert.ok(entries.length > 0, 'no plugins.tab entry registered')
  let tabKey
  for (const entry of entries) {
    const key = 'tab:' + entry.options.id
    await page.mount(key, entry.Component, {
      t: page.services.locale.bind(entry.options.locale),
      install() {},
      update() {},
      openPackage() {},
    })
    if (page.byAttr(key, PAGE.tab.rootAttr).length > 0) { tabKey = key; break }
    await page.unmount(key)
  }
  assert.ok(tabKey, 'no plugins.tab entry rendered [' + PAGE.tab.rootAttr + ']')
  return { page, tabKey }
}

export function registerToggleAndTabCases(sdk) {
  describe(`child-plugins Phase 2: host setEnabled & toggle route (SDK ${sdk})`, () => {
    describe('createChildPlugins.setEnabled (EP + DT + ST)', () => {
      test('EP: refuses every protected Fishball own bundle with code "protected" without mutating manifest or restarting', async (t) => {
        const w = await createPluginsWorld(t, sdk)
        const before = JSON.stringify(w.readManifest())

        for (const name of PROTECTED) {
          for (const nextEnabled of [false, true]) {
            const res = await w.plugins.setEnabled(name, nextEnabled)
            assert.deepEqual(res, { ok: false, code: CODE.protected }, `${name} -> ${nextEnabled}`)
          }
        }
        assert.equal(JSON.stringify(w.readManifest()), before)
        assert.equal(w.restarts.length, 0)
      })

      test('EP: refuses unknown / uninstalled bundle names with code "unknown-bundle"', async (t) => {
        const w = await createPluginsWorld(t, sdk)
        const before = JSON.stringify(w.readManifest())

        for (const bad of [TOGGLE.unknownPlugin, '', '   ']) {
          for (const nextEnabled of [false, true]) {
            const res = await w.plugins.setEnabled(bad, nextEnabled)
            assert.deepEqual(res, { ok: false, code: TOGGLE.unknownCode }, `${JSON.stringify(bad)} -> ${nextEnabled}`)
          }
        }
        assert.equal(JSON.stringify(w.readManifest()), before)
        assert.equal(w.restarts.length, 0)
      })

      test('DT: disable & enable when instance enabled=true updates dsh.profile.bundles without uninstalling, calls restart, returns applied="restarting"', async (t) => {
        const w = await createPluginsWorld(t, sdk, {
          installed: [
            { name: TOGGLE.pluginA, version: '1.0.0', enabled: true },
            { name: TOGGLE.pluginB, version: '2.0.0', enabled: false },
          ],
          instanceEnabled: true,
        })

        // Disable installed+enabled pluginA
        const off = await w.plugins.setEnabled(TOGGLE.pluginA, false)
        assert.deepEqual(off, { ok: true, name: TOGGLE.pluginA, enabled: false, applied: APPLIED.restarting })
        assert.equal(w.restarts.length, 1)
        const afterOff = w.readManifest()
        assert.equal(afterOff.dependencies[TOGGLE.pluginA], '1.0.0', 'dependency must remain installed (no pnpm uninstall)')
        assert.equal(afterOff.dsh.profile.bundles.includes(TOGGLE.pluginA), false, 'removed from dsh.profile.bundles')

        // Wait for background restart settlement if restart runs asynchronously
        await new Promise((r) => setTimeout(r, 20))

        // Enable installed+disabled pluginB
        const on = await w.plugins.setEnabled(TOGGLE.pluginB, true)
        assert.deepEqual(on, { ok: true, name: TOGGLE.pluginB, enabled: true, applied: APPLIED.restarting })
        assert.equal(w.restarts.length, 2)
        const afterOn = w.readManifest()
        assert.equal(afterOn.dependencies[TOGGLE.pluginB], '2.0.0')
        assert.deepEqual(afterOn.dsh.profile.bundles, [TOGGLE.pluginB])
      })

      test('DT: disable & enable when instance enabled=false skips restart and returns applied="next-start"', async (t) => {
        const w = await createPluginsWorld(t, sdk, {
          installed: [{ name: TOGGLE.pluginA, version: '1.0.0', enabled: true }],
          instanceEnabled: false,
        })

        const off = await w.plugins.setEnabled(TOGGLE.pluginA, false)
        assert.deepEqual(off, { ok: true, name: TOGGLE.pluginA, enabled: false, applied: APPLIED.nextStart })
        assert.equal(w.restarts.length, 0)
        assert.deepEqual(w.readManifest().dsh.profile.bundles, [])

        const on = await w.plugins.setEnabled(TOGGLE.pluginA, true)
        assert.deepEqual(on, { ok: true, name: TOGGLE.pluginA, enabled: true, applied: APPLIED.nextStart })
        assert.equal(w.restarts.length, 0)
        assert.deepEqual(w.readManifest().dsh.profile.bundles, [TOGGLE.pluginA])
      })

      test('ST: idempotent same-state toggles succeed without duplicating entries in dsh.profile.bundles', async (t) => {
        const w = await createPluginsWorld(t, sdk, {
          installed: [
            { name: TOGGLE.pluginA, version: '1.0.0', enabled: true },
            { name: TOGGLE.pluginB, version: '1.0.0', enabled: false },
          ],
          instanceEnabled: false,
        })

        // true when already enabled
        const sameOn = await w.plugins.setEnabled(TOGGLE.pluginA, true)
        assert.equal(sameOn.ok, true)
        assert.equal(sameOn.name, TOGGLE.pluginA)
        assert.equal(sameOn.enabled, true)
        assert.deepEqual(
          w.readManifest().dsh.profile.bundles.filter((b) => b === TOGGLE.pluginA),
          [TOGGLE.pluginA],
          'must not duplicate bundle in dsh.profile.bundles',
        )

        // false when already disabled
        const sameOff = await w.plugins.setEnabled(TOGGLE.pluginB, false)
        assert.equal(sameOff.ok, true)
        assert.equal(sameOff.name, TOGGLE.pluginB)
        assert.equal(sameOff.enabled, false)
        assert.equal(w.readManifest().dsh.profile.bundles.includes(TOGGLE.pluginB), false)
      })

      test('ST: exclusive lock returns { ok: false, code: "busy" } while another operation is in flight, then unlocks', async (t) => {
        const gate = deferred()
        const w = await createPluginsWorld(t, sdk, {
          installed: [
            { name: TOGGLE.pluginA, version: '1.0.0', enabled: true },
            { name: TOGGLE.pluginB, version: '1.0.0', enabled: false },
          ],
          instanceEnabled: true,
          restart: () => gate.promise,
        })

        // First toggle starts and holds lock while restart() is pending
        const first = await w.plugins.setEnabled(TOGGLE.pluginA, false)
        assert.equal(first.ok, true)
        assert.equal(first.applied, APPLIED.restarting)

        // Concurrent toggle while restart is in flight must return busy
        const concurrent = await w.plugins.setEnabled(TOGGLE.pluginB, true)
        assert.deepEqual(concurrent, { ok: false, code: CODE.busy })

        // Release restart -> lock frees -> next toggle succeeds
        gate.resolve()
        await new Promise((r) => setTimeout(r, 20))
        const after = await w.plugins.setEnabled(TOGGLE.pluginB, true)
        assert.equal(after.ok, true)
        assert.equal(after.enabled, true)
      })

      test('ST: full cycle enabled -> disabled -> enabled is reflected in list()', async (t) => {
        const w = await createPluginsWorld(t, sdk, {
          installed: [{ name: TOGGLE.pluginA, version: '1.0.0', enabled: true }],
          instanceEnabled: false,
        })

        const l1 = await w.plugins.list()
        assert.equal(l1.bundles.find((b) => b.name === TOGGLE.pluginA)?.enabled, true)

        await w.plugins.setEnabled(TOGGLE.pluginA, false)
        const l2 = await w.plugins.list()
        assert.equal(l2.bundles.find((b) => b.name === TOGGLE.pluginA)?.enabled, false)

        await w.plugins.setEnabled(TOGGLE.pluginA, true)
        const l3 = await w.plugins.list()
        assert.equal(l3.bundles.find((b) => b.name === TOGGLE.pluginA)?.enabled, true)
      })
    })

    describe('POST /api/dsh-instance/plugins/toggle route (EP + BVA + DT)', () => {
      test('EP: CHILD_PLUGIN_ROUTE.toggle path is exported and registered', async () => {
        const w = await createRoutesWorld(sdk, { setEnabled: async () => ({ ok: true }) })
        assert.equal(w.CHILD_PLUGIN_ROUTE.toggle, TOGGLE.route)
        assert.ok(w.routes.some((r) => r.path === TOGGLE.route))
      })

      test('DT security: same-origin fence rejects cross-origin, disallowed sec-fetch-site, and missing requestRejection with 403', async () => {
        let called = 0
        const stub = { setEnabled: async () => { called += 1; return { ok: true } } }
        const w = await createRoutesWorld(sdk, stub)

        for (const opts of [
          { secFetchSite: 'cross-site', origin: TOGGLE.origin },
          { secFetchSite: 'same-site', origin: TOGGLE.origin },
          { secFetchSite: 'same-origin', origin: TOGGLE.foreignOrigin },
        ]) {
          const res = await w.call('POST', TOGGLE.route, { ...opts, body: { name: TOGGLE.pluginA, enabled: false } })
          assert.equal(res.status, HTTP.forbidden)
        }

        const noFence = await createRoutesWorld(sdk, stub, { withRequestRejection: false })
        const resNoFence = await noFence.call('POST', TOGGLE.route, { body: { name: TOGGLE.pluginA, enabled: false } })
        assert.equal(resNoFence.status, HTTP.forbidden)
        assert.equal(called, 0, 'rejected requests must not invoke setEnabled')
      })

      test('EP & BVA body validation: malformed JSON, oversized body, invalid name, and non-boolean enabled -> HTTP 400', async () => {
        let called = 0
        const stub = { setEnabled: async () => { called += 1; return { ok: true } } }
        const w = await createRoutesWorld(sdk, stub)

        const badBodies = [
          '{bad-json',
          '[]',
          'null',
          '42',
          '"str"',
          JSON.stringify({}),
          JSON.stringify({ enabled: true }),
          JSON.stringify({ name: '', enabled: true }),
          JSON.stringify({ name: '   ', enabled: false }),
          JSON.stringify({ name: 123, enabled: true }),
          JSON.stringify({ name: null, enabled: true }),
          // Strict boolean checks for `enabled`
          JSON.stringify({ name: TOGGLE.pluginA }),
          JSON.stringify({ name: TOGGLE.pluginA, enabled: 'true' }),
          JSON.stringify({ name: TOGGLE.pluginA, enabled: 'false' }),
          JSON.stringify({ name: TOGGLE.pluginA, enabled: 1 }),
          JSON.stringify({ name: TOGGLE.pluginA, enabled: 0 }),
          JSON.stringify({ name: TOGGLE.pluginA, enabled: null }),
          JSON.stringify({ name: TOGGLE.pluginA, enabled: {} }),
          JSON.stringify({ name: TOGGLE.pluginA, enabled: [] }),
        ]

        for (const raw of badBodies) {
          const res = await w.call('POST', TOGGLE.route, { body: raw })
          assert.equal(res.status, HTTP.badRequest, `expected 400 for body: ${raw}`)
          assert.equal(res.json?.ok, false)
        }

        // BVA body size: 1 byte over 16384 -> 400
        const base = JSON.stringify({ name: TOGGLE.pluginA, enabled: false })
        const over = base + ' '.repeat(TOGGLE.maxBodyBytes + 1 - Buffer.byteLength(base, 'utf8'))
        const overRes = await w.call('POST', TOGGLE.route, { body: over })
        assert.equal(overRes.status, HTTP.badRequest)

        assert.equal(called, 0, 'invalid bodies must never reach setEnabled')
      })

      test('DT valid delegation: trims name, passes strict boolean enabled, returns 200 with service JSON', async () => {
        const calls = []
        const stub = {
          async setEnabled(name, enabled) {
            calls.push({ name, enabled })
            if (name === 'protected-pkg') return { ok: false, code: CODE.protected }
            return { ok: true, name, enabled, applied: APPLIED.restarting }
          },
        }
        const w = await createRoutesWorld(sdk, stub)

        const r1 = await w.call('POST', TOGGLE.route, { body: { name: '  demo-plugin-alpha  ', enabled: false } })
        assert.equal(r1.status, HTTP.ok)
        assert.deepEqual(r1.json, { ok: true, name: TOGGLE.pluginA, enabled: false, applied: APPLIED.restarting })

        const r2 = await w.call('POST', TOGGLE.route, { body: { name: TOGGLE.pluginA, enabled: true } })
        assert.equal(r2.status, HTTP.ok)
        assert.deepEqual(r2.json, { ok: true, name: TOGGLE.pluginA, enabled: true, applied: APPLIED.restarting })

        const r3 = await w.call('POST', TOGGLE.route, { body: { name: 'protected-pkg', enabled: false } })
        assert.equal(r3.status, HTTP.ok)
        assert.deepEqual(r3.json, { ok: false, code: CODE.protected })

        assert.deepEqual(calls, [
          { name: TOGGLE.pluginA, enabled: false },
          { name: TOGGLE.pluginA, enabled: true },
          { name: 'protected-pkg', enabled: false },
        ])
      })
    })
  })

  describe(`child-plugins Phase 2: FishballTab UI (SDK ${sdk})`, () => {
    test('EP: FishballTab removes Recommended plugins section and client.fishball.js no longer exports recommendedPlugins', async (t) => {
      for (const lang of PAGE.langs) {
        const { page, tabKey } = await openFishballTab(t, sdk, {
          lang,
          fishball: [{ name: TOGGLE.pluginA, version: '1.0.0', description: 'Alpha', enabled: true }],
        })

        assert.equal(page.byAttr(tabKey, TOGGLE.attr.recCategory).length, 0, 'no [data-recommended-category] in FishballTab')
        assert.equal(page.byAttr(tabKey, TOGGLE.attr.recPackage).length, 0, 'no [data-recommended-package] in FishballTab')
        const txt = wordsOf(page.tree(tabKey))
        assert.equal(/\brecommended\b/i.test(txt), false, `unexpected Recommended section text in ${lang}: ${txt}`)
        assert.equal(txt.includes('推荐插件'), false, `unexpected Chinese Recommended section text in ${lang}: ${txt}`)
        assert.deepEqual(page.world.errors, [])
      }
    })

    test('DT / ST: plugin cards render title, optional version, description, toggle Switch & uninstall button; toggling posts /plugins/toggle, disables while busy, and refreshes', async (t) => {
      let inventory = [
        { name: TOGGLE.pluginA, version: '1.2.3', description: 'Alpha desc', enabled: true },
        { name: TOGGLE.pluginB, description: 'Beta desc', enabled: false },
      ]
      let holdToggle = null

      const { page, tabKey } = await openFishballTab(t, sdk, {
        fishball: inventory,
        respond: (method, pathname, body) => {
          if (pathname === ROUTE.list && method === 'GET') {
            return { ok: true, bundles: structuredClone(inventory), protected: [...PROTECTED] }
          }
          if (pathname === TOGGLE.route && method === 'POST') {
            const parsed = JSON.parse(body ?? '{}')
            const complete = () => {
              inventory = inventory.map((b) => (b.name === parsed.name ? { ...b, enabled: parsed.enabled } : b))
              return { ok: true, name: parsed.name, enabled: parsed.enabled, applied: APPLIED.restarting }
            }
            return holdToggle ? holdToggle.promise.then(complete) : complete()
          }
          return undefined
        },
      })

      // Wait until both cards render
      assert.ok(await page.until(() => page.byAttr(tabKey, TOGGLE.attr.toggle).length === 2), 'expected 2 toggle switches')

      const txt = wordsOf(page.tree(tabKey))
      assert.ok(txt.includes(TOGGLE.pluginA), 'card shows pluginA title')
      assert.ok(txt.includes('1.2.3'), 'card shows optional version tag')
      assert.ok(txt.includes('Alpha desc'), 'card shows pluginA description')
      assert.ok(txt.includes(TOGGLE.pluginB), 'card shows pluginB title')
      assert.ok(txt.includes('Beta desc'), 'card shows pluginB description')

      const switchOf = (name) => page.byAttr(tabKey, TOGGLE.attr.toggle).find((n) => n.props[TOGGLE.attr.toggle] === name)
      const uninstallOf = (name) => page.byAttr(tabKey, TOGGLE.attr.uninstall).find((n) => n.props[TOGGLE.attr.uninstall] === name)

      assert.equal(Boolean(switchOf(TOGGLE.pluginA).props.checked), true)
      assert.equal(Boolean(switchOf(TOGGLE.pluginB).props.checked), false)
      assert.ok(uninstallOf(TOGGLE.pluginA))
      assert.ok(uninstallOf(TOGGLE.pluginB))

      // Hold toggle request to observe in-flight busy disabling
      holdToggle = deferred()
      const listGetsBefore = page.world.requests.filter((r) => r.method === 'GET' && r.path === ROUTE.list).length
      await triggerSwitch(page, switchOf(TOGGLE.pluginA))

      assert.ok(await page.until(() => page.world.requests.some((r) => r.method === 'POST' && r.path === TOGGLE.route)))
      const togglePost = page.world.requests.find((r) => r.method === 'POST' && r.path === TOGGLE.route)
      assert.deepEqual(JSON.parse(togglePost.body), { name: TOGGLE.pluginA, enabled: false })

      // While toggle is in flight, switches are disabled
      assert.equal(Boolean(switchOf(TOGGLE.pluginA).props.disabled), true, 'switch must be disabled while toggle is in flight')
      assert.equal(Boolean(switchOf(TOGGLE.pluginB).props.disabled), true, 'other switches disabled while busy')

      // Resolve toggle -> refreshes inventory and updates checked state to false
      holdToggle.resolve()
      holdToggle = null
      assert.ok(await page.until(() => page.world.requests.filter((r) => r.method === 'GET' && r.path === ROUTE.list).length > listGetsBefore))
      assert.ok(await page.until(() => Boolean(switchOf(TOGGLE.pluginA).props.checked) === false), 'switchA reflects disabled after refresh')
      assert.equal(Boolean(switchOf(TOGGLE.pluginA).props.disabled), false)

      // Toggle pluginB from false -> true
      await triggerSwitch(page, switchOf(TOGGLE.pluginB))
      assert.ok(await page.until(() => Boolean(switchOf(TOGGLE.pluginB).props.checked) === true), 'switchB reflects enabled after refresh')
      const posts = page.world.requests.filter((r) => r.method === 'POST' && r.path === TOGGLE.route).map((r) => JSON.parse(r.body))
      assert.deepEqual(posts, [
        { name: TOGGLE.pluginA, enabled: false },
        { name: TOGGLE.pluginB, enabled: true },
      ])
      assert.deepEqual(page.world.errors, [])
    })

    test('EP: toggle refusal reports error feedback and restores interactive state', async (t) => {
      const { page, tabKey } = await openFishballTab(t, sdk, {
        fishball: [{ name: TOGGLE.pluginA, version: '1.0.0', enabled: true }],
        respond: (method, pathname) => {
          if (pathname === TOGGLE.route && method === 'POST') return { ok: false, code: CODE.busy }
          return undefined
        },
      })

      assert.ok(await page.until(() => page.byAttr(tabKey, TOGGLE.attr.toggle).length === 1))
      const switchA = () => page.byAttr(tabKey, TOGGLE.attr.toggle)[0]
      await triggerSwitch(page, switchA())

      assert.ok(await page.until(() => page.find(tabKey, (n) => n.props.role === PAGE.tab.alertRole).length >= 1), 'expected error alert on toggle refusal')
      assert.equal(Boolean(switchA().props.disabled), false, 'switch must re-enable after refusal')
      assert.deepEqual(page.world.errors, [])
    })

    test('ST: uninstall confirmation dialog posts /plugins/uninstall only after confirm and refreshes inventory', async (t) => {
      let inventory = [{ name: TOGGLE.pluginA, version: '1.0.0', enabled: true }]
      const { page, tabKey } = await openFishballTab(t, sdk, {
        fishball: inventory,
        respond: (method, pathname, body) => {
          if (pathname === ROUTE.list && method === 'GET') {
            return { ok: true, bundles: structuredClone(inventory), protected: [...PROTECTED] }
          }
          if (pathname === ROUTE.uninstall && method === 'POST') {
            const { name } = JSON.parse(body ?? '{}')
            inventory = inventory.filter((b) => b.name !== name)
            return { ok: true, name, applied: APPLIED.restarting }
          }
          return undefined
        },
      })

      assert.ok(await page.until(() => page.byAttr(tabKey, TOGGLE.attr.uninstall).length === 1))
      await page.press(page.byAttr(tabKey, TOGGLE.attr.uninstall)[0])

      // Confirm dialog opens; nothing posted yet
      assert.equal(page.world.requests.filter((r) => r.path === ROUTE.uninstall).length, 0)
      assert.ok(await page.until(() => page.find(tabKey, (n) => n.props.open === true).length >= 1), 'uninstall confirmation dialog opened')

      // Find confirm button inside the open dialog (button whose label mentions Uninstall, excluding the card's uninstall button)
      const dialogNode = page.find(tabKey, (n) => n.props.open === true)[0]
      const confirmBtn = page.find(tabKey, (n) => n.tag === 'button' && !n.props[TOGGLE.attr.uninstall] && /\buninstall\b/i.test(wordsOf(n)))[0]
      assert.ok(dialogNode && confirmBtn, 'expected confirm button in uninstall dialog')
      await page.press(confirmBtn)

      assert.ok(await page.until(() => page.world.requests.some((r) => r.method === 'POST' && r.path === ROUTE.uninstall)))
      assert.deepEqual(JSON.parse(page.world.requests.find((r) => r.path === ROUTE.uninstall).body), { name: TOGGLE.pluginA })
      assert.ok(await page.until(() => page.byAttr(tabKey, TOGGLE.attr.uninstall).length === 0), 'uninstalled plugin removed after refresh')
      assert.deepEqual(page.world.errors, [])
    })

    describe('Strict Cordis proxy regression: client.fishball.js DetailAction & inventory (ctx.remote.pluginManager throws)', () => {
      test('EP: DetailAction reads main bundles via ctx.get("remote.pluginManager") and renders [data-fishball-use] for official shipped bundle', async (t) => {
        const name = FIXTURE.shippedOfficial
        const info = {
          name, version: '1.0.0', official: true, availability: 'installation',
          installed: false, enabled: true, optional: true, removable: false, rows: [], overrides: [],
        }
        const page = await openPage(t, sdk, {
          strictRemoteProxy: true,
          provideRemotePluginManager: true,
          mainBundles: [info],
          fishball: [],
        })
        const subject = { kind: 'bundle', pkg: { name, version: '1.0.0', installed: false, availability: 'installation', official: true, enabled: true, rows: [] } }
        await page.mount('detail', detailEntry(page).Component, { subject })

        const useReady = await page.until(() => page.byAttr('detail', 'data-fishball-use').length === 1)
        assert.ok(useReady, 'expected [data-fishball-use] rendered via ctx.get("remote.pluginManager")')
        const [useBtn] = page.byAttr('detail', 'data-fishball-use')
        assert.equal(wordsOf(useBtn), PAGE.button.use)
        await page.press(useBtn)
        assert.ok(await page.until(() => page.world.requests.some((r) => r.method === 'POST' && r.path === ROUTE.use)))
        assert.deepEqual(JSON.parse(page.world.requests.find((r) => r.path === ROUTE.use).body), { name })
        assert.deepEqual(page.world.errors, [])
      })

      test('EP: DetailAction reads main bundles via ctx.get("remote.pluginManager") and renders [data-fishball-install-to] for third-party bundle with source', async (t) => {
        const name = 'fbtest-strict-proxy-pkg'
        const info = {
          name, version: '1.0.0', official: false, availability: 'profile',
          installed: true, enabled: true, optional: false, removable: true,
          source: '/fbtest/source/strict-proxy-pkg.tgz', rows: [], overrides: [],
        }
        const page = await openPage(t, sdk, {
          strictRemoteProxy: true,
          provideRemotePluginManager: true,
          mainBundles: [info],
          fishball: [],
        })
        const subject = { kind: 'bundle', pkg: { name, version: '1.0.0', installed: true, availability: 'profile', official: false, enabled: true, rows: [] } }
        await page.mount('detail', detailEntry(page).Component, { subject })

        const installReady = await page.until(() => page.byAttr('detail', 'data-fishball-install-to').length === 1)
        assert.ok(installReady, 'expected [data-fishball-install-to] rendered via ctx.get("remote.pluginManager")')
        assert.equal(wordsOf(page.byAttr('detail', 'data-fishball-install-to')[0]), PAGE.button.install)
        assert.deepEqual(page.world.errors, [])
      })

      test('BVA: throwing ctx.remote.pluginManager with ctx.get("remote.pluginManager") === undefined activates and renders cleanly without crashing', async (t) => {
        const name = 'fbtest-strict-proxy-absent'
        const page = await openPage(t, sdk, {
          strictRemoteProxy: true,
          provideRemotePluginManager: false,
          mainBundles: [],
          fishball: [{ name: TOGGLE.pluginA, version: '1.0.0', enabled: true }],
        })
        const subject = { kind: 'bundle', pkg: { name, version: '1.0.0', installed: true, availability: 'profile', official: false, enabled: true, rows: [] } }
        await page.mount('detail', detailEntry(page).Component, { subject })
        await page.settle()
        assert.equal(page.byAttr('detail', 'data-fishball-use').length, 0)
        assert.equal(page.byAttr('detail', 'data-fishball-install-to').length, 0)
        assert.deepEqual(page.world.errors, [])
      })
    })
  })
}
