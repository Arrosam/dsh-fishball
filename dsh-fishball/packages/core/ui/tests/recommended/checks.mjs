/**
 * Executable T-RP checks (component/public-seam and fishball-ui's own manifest), keyed by catalogue case id.
 *
 * Oracles come from docs/test-design/v2-recommendation-tab.md (AC1–AC11, §3 EP, §4 BVA, §5 decision
 * table, §6 state transitions), the relayed user decisions and each SDK's own public contract files.
 * Implementation bodies are not read; the product is driven only through its contract: the shipped
 * data module, the Node half's registered route and the browser half under ../support/recommend-world.mjs.
 * Expected values never come from the product's own output. Each check receives `{sdk, sdkModules}`:
 * the current DSH's version and node_modules (its plugin manager's slot contract).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CJK, RP, byAttr, contains, createWorld, deferred, findAll, loadNodeRoute, loadUi, openTab, settle, subtree, textOf } from '../support/recommend-world.mjs'
import { UI } from '../support/ui-page.mjs'
import { RECOMMENDATION_TEST_DATA } from './data.mjs'

function freezeData(value) {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freezeData); Object.freeze(value) }
  return value
}

const C = RECOMMENDATION_TEST_DATA.contract
export const RP_CHECK = freezeData({
  nodeModules: 'node_modules',
  sdkFiles: {
    slotContract: ['@deepseek-ai', 'dsh-client-ui-plugin-manager', 'lib', 'types', 'client', 'slot-contract.d.ts'],
    managerClient: ['@deepseek-ai', 'dsh-client-ui-plugin-manager', 'lib', 'client.js'],
    managerReadme: ['@deepseek-ai', 'dsh-client-ui-plugin-manager', 'README.md'],
  },
  sdkPatterns: {
    tabSlot: /'plugins\.tab':\s*\{\s*kind:\s*'list';\s*scope:\s*'root';\s*owner:\s*PluginTabProps;/,
    ownerInstall: /readonly install:\s*\(target:\s*PluginTabInstall\)\s*=>\s*void;/,
    ownerOpen: /readonly openPackage:\s*\(packageName:\s*string\)\s*=>\s*void;/,
    installTarget: ['readonly spec: string;', 'readonly registry?: string;', 'readonly title: string;', 'readonly version: string;'],
    /** DSH's page renders the tab with the owner's install (0.2.2-rc.5 minifies to backtick strings and adds `update`). */
    renderTab: /renderSlot\(["`]plugins\.tab["`],\s*\{\s*install:\s*props\.installFrom,/,
    readmeTab: /`plugins\.tab`/,
  },
  plugin: {
    name: 'fishball-recommend-plugins',
    platform: 'web',
    clientExport: './client',
    managerInject: '@deepseek-ai/dsh-client-ui-plugin-manager',
    /**
     * V3 F-UI (R-FB-14): the tab is part of fishball-ui (its own package folder
     * `fishball-recommend-plugins/`, data `src/recommended.js`), and fishball-ui ships both in its `files`.
     */
    ownerPackage: 'fishball-ui',
    ownerDir: UI.dir,
    shippedFiles: ['fishball-recommend-plugins/index.js', 'fishball-recommend-plugins/client.js', 'fishball-recommend-plugins/package.json', 'src/recommended.js'],
  },
  /** Historical checked versions (DESIGN §10f): not new install pins (AC2). */
  historicalVersions: ['0.3.0', '2.4.1', '0.3.15', '0.3.12', '0.32.4', '0.31.1', '3.3.17', '0.1.8', '0.1.7', '1.0.21', '1.0.17', '0.2.3', '0.1.0'],
  sourceUrl: /^https?:\/\//,
  /**
   * AC9 re-baselined for V3 (REMOVE-WD; R-FB-01 as amended, design §1.0): the instance places
   * fishball-core and fishball-ui whatever the tab does (fishball-board no longer: SHELVE-BOARD, the
   * user 2026-11-18, "先封存…不要预留在子实例的Fishball内"), so a board row or a
   * `bundled/` path is no longer evidence against AC9. What AC9 still forbids is anything placed,
   * inserted or depended on *because of* the tab: a recommended package, the recommendation module
   * as a standalone bundle, or a feature plugin the tab would need (install matrix row 13b: core
   * alone is a full Fishball DSH, so the tab cannot require the board).
   */
  featurePlugins: ['fishball-board'],
  dependencyFields: ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies'],
  manifest: 'package.json',
  noteKeyOwner: 'meow-memory',
  /** Semantics of the meow-memory note (AC8), per locale; not exact prose. */
  note: {
    en: { memory: /memor/i, optional: /optional|not required|don'?t need/i, recommended: /recommend/i, builtIn: /built-?in|own memory|no memory/i, board: /\bboard\b/i },
    zh: { memory: /记忆/, optional: /可选|非必需|不是必须|无需|不必/, recommended: /推荐|建议/, builtIn: /内置|自带|没有.*记忆/, board: /看板|白板|board/i },
  },
  /** Stale Pet copy that must be gone (AC2): the native child has a browser part. */
  staleBrowserPart: { en: /browser part|no browser|has no browser/i, zh: /浏览器/ },
  linkTags: ['a'],
  linkProp: 'href',
  marketFixture: { id: 'discover', name: 'unrelated-market-plugin', label: 'Discover' },
  unrelatedChildBundle: 'rp-unrelated-child-bundle',
  changeReasons: { install: 'install', remove: 'remove', bundle: 'bundle' },
  inspectRefusal: { status: 'refused', problem: 'not-found', reason: 'rp fixture: nothing by that name' },
  inspectError: { message: 'rp fixture: inspection transport failed' },
  listError: { message: 'rp fixture: listing failed' },
  httpFailure: 500,
})

// ---------------------------------------------------------------------------------------------
// Shared helpers (one implementation each)
// ---------------------------------------------------------------------------------------------

const sdkFile = (ctx, parts) => path.join(ctx.sdkModules, ...parts)
const readSdk = (ctx, parts) => readFileSync(sdkFile(ctx, parts), 'utf8')
const loadData = () => loadUi(RP.dataModule)
const allIds = () => C.categoryOrder.flatMap((alias) => C.entryIds[alias])
const pkgOf = (row) => row.props[RP.attr.pkg]
const catOf = (node) => node.props[RP.attr.category]

/** Requirement aliases mapped to the product's category ids by the required display order (§2). */
async function categoryMap() {
  const { recommendedList } = await loadData()
  const list = recommendedList()
  assert.equal(list.categories.length, C.categoryOrder.length, 'four curated categories')
  return Object.fromEntries(C.categoryOrder.map((alias, i) => [alias, list.categories[i].category]))
}

/** Assert each listed row's state: `present` names are Installed with no Install; all others offer Install. */
function assertRowStates(world, present) {
  const rows = world.page.rows()
  assert.deepEqual(rows.map(pkgOf), allIds(), 'the fixed curated list is always rendered in order')
  for (const row of rows) {
    const name = pkgOf(row)
    if (present.includes(name)) {
      assert.ok(world.isInstalled(row), name + ' must show Installed')
      assert.equal(world.installButtons(row).length, 0, name + ' must offer no Install')
    } else {
      assert.ok(!world.isInstalled(row), name + ' must not show Installed')
      assert.ok(world.installButtons(row).length >= 1, name + ' must offer Install')
    }
  }
}
const present = (...names) => names.map((name) => ({ name, installed: true, enabled: true }))

/** Update the child inventory and announce a completed manager operation, as the Host does. */
async function nativeChanged(world, bundles, reason) {
  world.bundles = bundles
  world.emitRemote(RP.events.changed, { reason })
  await settle()
}

function noteNode(world) {
  return byAttr(world.page.tree(), RP.attr.note)
}
function assertNoLink(node, label) {
  for (const n of subtree(node)) {
    assert.ok(!RP_CHECK.linkTags.includes(n.tag), label + ' contains a link element')
    assert.equal(n.props[RP_CHECK.linkProp], undefined, label + ' carries an href')
  }
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

export const CHECKS = Object.freeze({
  // EP: actual shipped data (AC2, AC8); the one product-data unit case, never the catalogue itself.
  async 'TC-20'(ctx, t) {
    const { RECOMMENDED_CATEGORY, RECOMMENDED_PLUGINS, recommendedList } = await loadData()
    const list = recommendedList()
    const ids = await categoryMap()
    assert.deepEqual(new Set(Object.values(RECOMMENDED_CATEGORY)), new Set(Object.values(ids)), 'category constants are the four listed categories')
    assert.deepEqual(list.highlighted, C.highlightedCategories.map((alias) => ids[alias]), 'Context and Memory highlighted, Channel and Pet not')
    for (const [i, alias] of C.categoryOrder.entries()) {
      assert.deepEqual(list.categories[i].plugins.map((p) => p.packageName), C.entryIds[alias], alias + ' ids in order')
    }
    assert.equal(list.categories[C.categoryOrder.indexOf('pet')].plugins.length, 0, 'Pet is empty')
    const flat = list.categories.flatMap((c) => c.plugins)
    assert.equal(new Set(flat.map((p) => p.packageName)).size, allIds().length, 'ten unique entries')
    for (const plugin of flat) {
      assert.equal(typeof plugin.spec, 'string'); assert.ok(plugin.spec.trim(), plugin.packageName + ' spec nonempty')
      for (const version of RP_CHECK.historicalVersions) assert.ok(!plugin.spec.endsWith('@' + version), plugin.packageName + ' pinned to historical ' + version)
      assert.match(plugin.source, RP_CHECK.sourceUrl, plugin.packageName + ' source link')
    }
    const withNote = flat.filter((p) => p.noteKey !== undefined)
    assert.deepEqual(withNote.map((p) => p.packageName), [RP_CHECK.noteKeyOwner], 'only meow-memory carries a note')
    // Frozen shipped constants; recommendedList() is a fresh copy each call.
    assert.ok(Object.isFrozen(RECOMMENDED_PLUGINS) && RECOMMENDED_PLUGINS.every(Object.isFrozen), 'RECOMMENDED_PLUGINS entries frozen')
    assert.equal(RECOMMENDED_PLUGINS.length, allIds().length)
    const again = recommendedList()
    assert.notEqual(again, list); assert.notEqual(again.categories, list.categories)
    list.categories[0].plugins.length = 0
    list.highlighted.length = 0
    assert.deepEqual(recommendedList(), again, 'mutating one result does not change the next')
    // Node route answers the same list (contract 2).
    const { routes } = await loadNodeRoute()
    const route = routes.find((r) => r.path === RP.routePath)
    assert.ok(route, 'GET route registered'); assert.deepEqual(route.methods, ['GET'])
    const response = await route.fetch(new Request(new URL(RP.listPath, RP.baseURI), { method: 'GET' }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), again)
    // Nonempty en/zh resources for the note and the empty-category note (localized, not keys).
    const { world } = await openTab()
    const [registration] = world.locale.dictionaries()
    assert.ok(registration && registration.dicts.en && registration.dicts.zh, 'en and zh dictionaries registered')
    for (const locale of Object.values(RP.locales)) {
      world.locale.set(locale)
      const noteKey = withNote[0].noteKey
      const text = world.locale.translate(registration.ns, noteKey)
      assert.ok(text.trim() && text !== noteKey, locale + ' note resource nonempty')
      if (locale === RP.locales.zh) assert.match(text, CJK)
    }
  },

  // EP + ST: documented root/list owner seam on this SDK; registration through it (AC1, AC4, AC11).
  async 'TC-21'(ctx) {
    const contract = readSdk(ctx, RP_CHECK.sdkFiles.slotContract)
    assert.match(contract, RP_CHECK.sdkPatterns.tabSlot, ctx.sdk + ': plugins.tab is a root list slot with PluginTabProps')
    assert.match(contract, RP_CHECK.sdkPatterns.ownerInstall); assert.match(contract, RP_CHECK.sdkPatterns.ownerOpen)
    for (const field of RP_CHECK.sdkPatterns.installTarget) assert.ok(contract.includes(field), ctx.sdk + ' PluginTabInstall ' + field)
    assert.match(readSdk(ctx, RP_CHECK.sdkFiles.managerClient), RP_CHECK.sdkPatterns.renderTab, ctx.sdk + ': page renders tabs with install: installFrom')
    assert.match(readSdk(ctx, RP_CHECK.sdkFiles.managerReadme), RP_CHECK.sdkPatterns.readmeTab)

    const pkg = JSON.parse(readFileSync(path.join(RP.pluginDir, 'package.json'), 'utf8'))
    assert.equal(pkg.name, RP_CHECK.plugin.name)
    assert.equal(pkg.dsh?.client?.platform, RP_CHECK.plugin.platform)
    assert.ok(pkg.exports?.[RP_CHECK.plugin.clientExport], './client export')
    assert.ok(pkg.dsh.client.inject?.includes(RP_CHECK.plugin.managerInject), 'injects the plugin manager that declares plugins.tab')

    const world = await createWorld()
    assert.equal(world.slots.ours().length, 0, 'no contribution before activation')
    await world.activate()
    const injections = world.slots.state.injections.filter((i) => i.key === RP.slot)
    assert.equal(injections.length, 1, 'registers through ctx.slots.inject(plugins.tab)')
    const [entry] = world.slots.ours()
    assert.ok(entry, 'one fishball-recommended entry'); assert.equal(entry.options.name, RP.slot)
    assert.equal(typeof entry.options.label, 'function', 'label resolves at render time')
    for (const [locale, label] of Object.entries(C.labels)) { world.locale.set(locale); assert.equal(entry.options.label(), label, locale + ' tab label') }
    world.locale.set(RP.locales.en)
    world.page.show(); await settle()
    assert.ok(world.page.root(), 'renders with the owner props alone')
    await world.clickInstall(C.fixtures.absentPackage)
    assert.equal(world.installs.length, 1, 'install goes through the owner install prop')
    assert.deepEqual(world.otherRemoteCalls, [], 'no raw/global installer remote is called')
    assert.ok(world.remoteAccess.every((name) => RP.remoteAllowed.some((m) => name === RP.remoteNs + '.' + m)), 'only listBundles/inspect: ' + world.remoteAccess)
  },

  // UC + ST1: listed spec -> native inspection -> already-confirmed exact target to owner.install (AC4).
  async 'TC-22'() {
    const { recommendedList } = await loadData()
    const spec = recommendedList().categories.flatMap((c) => c.plugins).find((p) => p.packageName === C.fixtures.absentPackage).spec
    const { world } = await openTab()
    await world.clickInstall(C.fixtures.absentPackage)
    assert.equal(world.inspects.length, 1, 'one native inspection of the listed spec')
    assert.equal(world.inspects[0].spec, spec)
    assert.equal(world.installs.length, 1)
    const [target] = world.installs
    assert.equal(target.version, RP.fixture.version, 'exact version the native inspection confirmed')
    assert.ok(target.spec.includes(C.fixtures.absentPackage) && target.spec.includes(RP.fixture.version), 'spec names the confirmed package and version: ' + target.spec)
    assert.equal(typeof target.title, 'string'); assert.ok(target.title.trim(), 'display title')
    if (target.registry !== undefined) assert.equal(target.registry, RP.fixture.registry, 'registry, if passed, is the one that answered')
    assert.ok(!world.isInstalled(world.page.row(C.fixtures.absentPackage)), 'no optimistic Installed after handoff (ST1)')
    assert.deepEqual(world.otherRemoteCalls, [])
  },

  // DT R1–R3 + BVA 0↔1 + EP enabled/disabled/main-only (AC1, AC3).
  async 'TC-23'(ctx, t) {
    // R1 (main context: no main-side source names the tab) scanned dsh-connector / dsh-connector-ui,
    // which left this repository (6b7c53bf); it is theirs to keep, not fishball-ui's.
    const name = C.fixtures.absentPackage
    const rules = [
      { rule: 'R2 child count 0 (main-only presence is not in the child inventory)', bundles: [], installed: false },
      { rule: 'R2 child bundle row not declared (installed:false)', bundles: [{ name, installed: false, enabled: false }], installed: false },
      { rule: 'R3 child count 1, enabled', bundles: [{ name, installed: true, enabled: true }], installed: true },
      { rule: 'R3 child count 1, disabled', bundles: [{ name, installed: true, enabled: false }], installed: true },
    ]
    for (const { rule, bundles, installed } of rules) {
      await t.test(rule, async () => {
        const { world } = await openTab({ bundles })
        assert.ok(world.page.root(), 'tab present in child')
        assertRowStates(world, installed ? [name] : [])
      })
    }
  },

  // BVA 0↔1, EP 2 interior: row-local Installed (AC2, AC3).
  async 'TC-24'(ctx, t) {
    const steps = [[], [C.fixtures.absentPackage], [C.fixtures.absentPackage, C.fixtures.secondDistinctPackage]]
    for (const names of steps) {
      await t.test(names.length + ' distinct installed', async () => {
        const { world } = await openTab({ bundles: present(...names) })
        assertRowStates(world, names)
        assert.ok(!names.includes(C.fixtures.notePackage))
      })
    }
  },

  // BVA 0/1/2 activations and re-entries + ST10 (AC1, AC7, AC11).
  async 'TC-25'() {
    const world = await createWorld()
    const live = () => ({ entries: world.slots.ours().length, changed: world.subs.live(world.subs.remote, RP.events.changed), reset: world.subs.live(world.subs.ctx, RP.events.reset) })
    assert.deepEqual(live(), { entries: 0, changed: 0, reset: 0 }, '0 activations')
    const first = await world.activate()
    assert.deepEqual(live(), { entries: 1, changed: 1, reset: 1 }, '1 activation: one entry, one subscription each')
    world.page.show(); await settle(); world.page.hide(); await settle(); world.page.show(); await settle()
    assert.deepEqual(live(), { entries: 1, changed: 1, reset: 1 }, 'leave/re-enter the tab')
    world.slots.redeclare(); await settle()
    assert.deepEqual(live(), { entries: 1, changed: 1, reset: 1 }, 'slot re-declaration (supported same-id re-registration)')
    assert.ok(world.page.root())
    first.dispose(); await settle()
    await world.activate()
    assert.deepEqual(live(), { entries: 1, changed: 1, reset: 1 }, '2nd activation after disposal')
    assert.ok(world.page.root(), 'replacement renders')
  },

  // BVA 0/1/2 disposer calls + ST11 (AC7).
  async 'TC-26'() {
    const { world, generation } = await openTab()
    const own = (list) => list.filter((s) => s.generation === generation.index)
    assert.ok(own(world.subs.remote).length >= 1 && own(world.subs.ctx).length >= 1, 'subscriptions recorded')
    assert.ok(own(world.subs.remote).every((s) => s.live && s.removed === 0), '0 disposals: active')
    const callbacks = own(world.subs.remote).map((s) => s.callback)
    generation.dispose(); await settle()
    assert.ok([...own(world.subs.remote), ...own(world.subs.ctx)].every((s) => !s.live && s.removed === 1), '1 disposal: each removed once')
    assert.equal(world.slots.ours().length, 0, 'contribution removed')
    assert.equal(world.page.root(), undefined, 'disposed tab not rendered')
    // Second disposal through the owner, as Cordis does: ctx.effect's returned disposer is
    // idempotent and the fiber runs each raw disposer once (cordis lib/index.js effect()), so
    // calling the plugin's raw effect disposer twice would be outside the SDK contract.
    generation.dispose(); await settle()
    assert.ok(own(world.subs.remote).every((s) => s.removed === 1), '2 disposals: repeat inert')
    assert.equal(world.slots.ours().length, 0)
    const calls = world.listCalls
    world.bundles = present(C.fixtures.absentPackage)
    for (const callback of callbacks) callback({ reason: RP_CHECK.changeReasons.install })
    await settle()
    // AC7 (owner decision 2026-11-11): a disposed owner starts no Host work, so a callback captured
    // before disposal and fired after it must not re-read the inventory.
    assert.equal(world.listCalls, calls, 'callback from a disposed owner starts no work')
    assert.equal(world.slots.ours().length, 0, 'disposed callback re-registers nothing')
    assert.equal(world.page.root(), undefined, 'and updates no UI')
    assert.equal(world.installs.length + world.inspects.length, 0)
  },

  // ST12: late generation-A settlement cannot touch B; B reads current inventory (AC5, AC7).
  async 'TC-27'() {
    const world = await createWorld()
    const stale = deferred()
    world.onListBundles = (index) => (index === 0 ? stale.promise : undefined)
    const a = await world.activate()
    world.page.show(); await settle()
    a.dispose(); await settle()
    world.onListBundles = undefined
    world.bundles = present(C.fixtures.absentPackage)
    await world.activate(); await settle()
    assertRowStates(world, [C.fixtures.absentPackage])
    stale.resolve({ ok: true, value: [] })
    await settle()
    assertRowStates(world, [C.fixtures.absentPackage])
    assert.equal(world.slots.ours().length, 1)
    assert.deepEqual(world.otherRemoteCalls, [], 'disposal cancels no native install')
  },

  // BVA 0/1/2 invocations + ST7 (AC5, AC6): native owns pending/dedup; no Fishball lock or retry.
  async 'TC-28'(ctx, t) {
    for (const clicks of [0, 1, 2]) {
      await t.test(clicks + ' invocations while native pending', async () => {
        const { world } = await openTab()
        for (let i = 0; i < clicks; i++) await world.clickInstall(C.fixtures.absentPackage)
        await settle()
        assert.equal(world.installs.length, clicks, 'each invocation reaches the native owner, no extra or blocked handoff')
        assert.ok(world.inspects.length <= clicks)
        assert.deepEqual(world.otherRemoteCalls, [])
        assert.ok(!world.isInstalled(world.page.row(C.fixtures.absentPackage)), 'pending is not Installed')
      })
    }
    await t.test('two rapid invocations before the inspection answers', async () => {
      const { world } = await openTab()
      const gate = deferred()
      world.onInspect = () => gate.promise.then(() => ({ ok: true, value: { status: 'accepted', kind: RP.fixture.kind, name: C.fixtures.absentPackage, version: RP.fixture.version, registry: RP.fixture.registry, bundle: true } }))
      const row = world.page.row(C.fixtures.absentPackage)
      const [button] = world.installButtons(row)
      for (let i = 0; i < 2; i++) if (!button.props.disabled) button.props.onClick?.({ preventDefault() {}, stopPropagation() {} })
      gate.resolve(); await settle()
      assert.ok(world.installs.length >= 1 && world.installs.length <= 2, 'no competing operation beyond the invocations')
      assert.deepEqual(world.otherRemoteCalls, [])
    })
    await t.test('explicit settlement: native change + inventory present', async () => {
      const { world } = await openTab()
      await world.clickInstall(C.fixtures.absentPackage)
      await settle()
      assert.equal(world.installs.length, 1, 'no automatic retry')
      await nativeChanged(world, present(C.fixtures.absentPackage), RP_CHECK.changeReasons.install)
      assertRowStates(world, [C.fixtures.absentPackage])
    })
  },

  // EP outcomes × inventory + ST2–ST6 (AC3, AC5).
  async 'TC-29'(ctx, t) {
    const name = C.fixtures.absentPackage
    await t.test('check failure (refused) + absent: alert, Install remains, no handoff or retry', async () => {
      const { world } = await openTab()
      world.onInspect = () => ({ ok: true, value: RP_CHECK.inspectRefusal })
      await world.clickInstall(name); await settle()
      assert.ok(world.page.alerts().length >= 1, 'refusal shown as role=alert')
      assert.equal(world.installs.length, 0); assert.equal(world.inspects.length, 1, 'no automatic retry')
      assertRowStates(world, [])
    })
    await t.test('inspection transport error + absent: alert, Install remains', async () => {
      const { world } = await openTab()
      world.onInspect = () => ({ ok: false, error: RP_CHECK.inspectError })
      await world.clickInstall(name); await settle()
      assert.ok(world.page.alerts().length >= 1)
      assert.equal(world.installs.length, 0)
      assertRowStates(world, [])
    })
    await t.test('package failure + listing absent: Install follows absence', async () => {
      const { world } = await openTab()
      await world.clickInstall(name)
      await nativeChanged(world, [], RP_CHECK.changeReasons.install)
      assertRowStates(world, [])
      assert.equal(world.installs.length, 1)
    })
    await t.test('application failure + listing present: Installed, no inferred absence', async () => {
      const { world } = await openTab()
      await world.clickInstall(name)
      await nativeChanged(world, [{ name, installed: true, enabled: false }], RP_CHECK.changeReasons.install)
      assertRowStates(world, [name])
    })
    await t.test('unresolved (no settlement): never optimistic Installed', async () => {
      const { world } = await openTab()
      await world.clickInstall(name); await settle()
      assertRowStates(world, [])
    })
    await t.test('reconnect (connection/reset): inventory re-read', async () => {
      const { world } = await openTab()
      world.bundles = present(name)
      world.emitCtx(RP.events.reset); await settle()
      assertRowStates(world, [name])
    })
    await t.test('native removal then reinstall: Installed -> Install -> Installed (ST8/ST9)', async () => {
      const { world } = await openTab({ bundles: present(name) })
      await nativeChanged(world, [{ name, installed: true, enabled: false }], RP_CHECK.changeReasons.bundle)
      assertRowStates(world, [name])
      await nativeChanged(world, [], RP_CHECK.changeReasons.remove)
      assertRowStates(world, [])
      await world.clickInstall(name)
      await nativeChanged(world, present(name), RP_CHECK.changeReasons.install)
      assertRowStates(world, [name])
    })
    await t.test('inventory listing fails: alert, no row claims Installed', async () => {
      const world = await createWorld()
      world.onListBundles = () => ({ ok: false, error: RP_CHECK.listError })
      await world.activate(); world.page.show(); await settle()
      assert.ok(world.page.alerts().length >= 1)
      assert.ok(world.page.rows().every((row) => !world.isInstalled(row)))
    })
    await t.test('list route fails (HTTP error): alert', async () => {
      const world = await createWorld({ respond: () => new Response(null, { status: RP_CHECK.httpFailure }) })
      await world.activate(); world.page.show(); await settle()
      assert.ok(world.page.alerts().length >= 1)
    })
    await t.test('list request rejects (network): alert', async () => {
      const world = await createWorld({ respond: () => Promise.reject(new TypeError('rp fixture: network down')) })
      await world.activate(); world.page.show(); await settle()
      assert.ok(world.page.alerts().length >= 1)
    })
  },

  // EP: only curated rows/specs; no discovery request or market row (AC2, AC4).
  async 'TC-30'() {
    const world = await createWorld({ bundles: present(RP_CHECK.unrelatedChildBundle) })
    const market = RP_CHECK.marketFixture
    world.slots.registerNative({ id: market.id, label: () => market.label, locale: market.id }, function Discover() {
      return world.React.createElement('div', { 'data-recommended-package': market.name }, market.name)
    })
    await world.activate(); world.page.show(); await settle()
    const root = world.page.root()
    const rows = findAll(root.children, (n) => n.props[RP.attr.pkg] !== undefined)
    assert.deepEqual(rows.map(pkgOf), allIds(), 'exactly the curated rows')
    assert.ok(!textOf(root).includes(market.name) && !textOf(root).includes(RP_CHECK.unrelatedChildBundle))
    const listUrl = new URL(RP.listPath, RP.baseURI).href
    assert.ok(world.fetches.every((f) => f.url === listUrl && f.method === 'GET'), 'only the instance list GET: ' + world.fetches.map((f) => f.url))
    const { recommendedList } = await loadData()
    const listed = recommendedList().categories.flatMap((c) => c.plugins).find((p) => p.packageName === C.fixtures.notePackage)
    await world.clickInstall(C.fixtures.notePackage)
    assert.equal(world.inspects[0].spec, listed.spec, 'listed spec goes to the native flow')
    assert.ok(world.remoteAccess.every((name) => name.startsWith(RP.remoteNs + '.')), 'no market remote')
  },

  // AC1 / AC9 within fishball-ui (UC-06): fishball-ui ships the tab's files. The placed copy in a
  // hosted child and the main-side absence checks were dsh-instance's and dsh-connector's (6b7c53bf).
  async 'TC-31'() {
    const owner = JSON.parse(readFileSync(path.join(RP_CHECK.plugin.ownerDir, RP_CHECK.manifest), 'utf8'))
    assert.equal(owner.name, RP_CHECK.plugin.ownerPackage)
    for (const file of RP_CHECK.plugin.shippedFiles) {
      assert.ok(owner.files.some((f) => file === f || file.startsWith(f.replace(/\/?$/, '/'))), 'fishball-ui does not ship ' + file)
    }
  },

  // AC9 within fishball-ui: opt-in only. Neither the tab's manifest nor fishball-ui's depends on a
  // recommended package or a feature plugin; the Node half needs only its route; activation installs
  // nothing. The hosted child's profile and overlay composition were dsh-instance's (6b7c53bf).
  async 'TC-32'() {
    const listed = new Set(allIds())
    for (const dir of [RP.pluginDir, RP_CHECK.plugin.ownerDir]) {
      const pkg = JSON.parse(readFileSync(path.join(dir, RP_CHECK.manifest), 'utf8'))
      for (const field of RP_CHECK.dependencyFields) {
        const deps = Array.isArray(pkg[field]) ? pkg[field] : Object.keys(pkg[field] ?? {})
        for (const dep of deps) assert.ok(!listed.has(dep) && !RP_CHECK.featurePlugins.includes(dep), pkg.name + ' ' + field + ' ' + dep)
      }
    }
    const { accessed } = await loadNodeRoute()
    assert.ok(accessed.every((name) => name === 'connection' || name === 'effect'), 'Node half needs only its route at startup: ' + accessed)
    const { world } = await openTab()
    assert.equal(world.installs.length + world.inspects.length, 0, 'activation installs nothing without an explicit Install')
  },

  // EP en/zh, meow absent/present, Pet empty (AC2, AC8).
  async 'TC-33'(ctx, t) {
    const ids = await categoryMap()
    const texts = {}
    for (const locale of Object.values(RP.locales)) {
      for (const meowPresent of [false, true]) {
        await t.test(locale + ' meow-memory ' + (meowPresent ? 'present' : 'absent'), async () => {
          const { world } = await openTab({ locale, bundles: meowPresent ? present(C.fixtures.notePackage) : [] })
          const meow = world.page.row(C.fixtures.notePackage)
          const notes = noteNode(world)
          assert.equal(notes.length, 1, 'one note')
          assert.ok(contains(meow, notes[0]), 'note under the meow-memory row')
          const text = textOf(notes[0]).trim()
          assert.ok(text && text !== notes[0].props[RP.attr.note], 'nonempty localized note')
          const sem = RP_CHECK.note[locale]
          for (const key of ['memory', 'optional', 'recommended', 'builtIn']) assert.match(text, sem[key], locale + ' note conveys ' + key + ': ' + text)
          assert.doesNotMatch(text, sem.board, 'no board mention'); assertNoLink(notes[0], 'note')
          assert.equal(world.isInstalled(meow), meowPresent)
          texts[locale] = text
          const categories = world.page.categories()
          assert.deepEqual(categories.map(catOf), C.categoryOrder.map((a) => ids[a]), 'category order')
          for (const node of categories) {
            const alias = C.categoryOrder[C.categoryOrder.map((a) => ids[a]).indexOf(catOf(node))]
            assert.equal(node.props[RP.attr.highlighted], String(C.highlightedCategories.includes(alias)), alias + ' highlight flag')
            const pkgRows = byAttr(node.children, RP.attr.pkg)
            assert.deepEqual(pkgRows.map(pkgOf), C.entryIds[alias], alias + ' rows inside their category')
            const empty = subtree(node).filter((n) => n.props[RP.attr.empty] !== undefined)
            if (C.entryIds[alias].length === 0) {
              assert.equal(empty.length, 1, alias + ' empty note'); assert.equal(empty[0].props[RP.attr.empty], catOf(node))
              const emptyText = textOf(empty[0]).trim()
              assert.ok(emptyText, 'nonempty empty-category note')
              assert.doesNotMatch(emptyText, RP_CHECK.staleBrowserPart[locale], 'no stale no-browser-part claim')
              if (locale === RP.locales.zh) assert.match(emptyText, CJK)
            } else assert.equal(empty.length, 0, alias + ' has no empty note')
          }
          if (locale === RP.locales.zh) assert.match(text, CJK)
        })
      }
    }
    assert.notEqual(texts.en, texts.zh, 'en and zh notes are distinct resources')
  },

  // ST10/ST11 with native tabs retained (AC1, AC7, AC11).
  async 'TC-34'() {
    const world = await createWorld()
    const nativeOptions = { id: RP_CHECK.marketFixture.id, label: () => RP_CHECK.marketFixture.label, locale: RP_CHECK.marketFixture.id }
    world.slots.registerNative(nativeOptions, function Discover() { return null })
    const [native] = world.slots.entries()
    const nativeSnapshot = { ...native.options }
    const snapshot = () => world.slots.entries().map((e) => e.options.id)
    const first = await world.activate()
    assert.deepEqual(snapshot(), [RP_CHECK.marketFixture.id, RP.tabId])
    first.dispose(); await settle()
    assert.deepEqual(snapshot(), [RP_CHECK.marketFixture.id], 'only the owned contribution removed')
    assert.equal(world.slots.entries()[0], native); assert.deepEqual({ ...native.options }, nativeSnapshot, 'native entry untouched')
    await world.activate()
    assert.deepEqual(snapshot(), [RP_CHECK.marketFixture.id, RP.tabId], 'one restored')
    assert.equal(world.slots.entries()[0], native)
  },
})
