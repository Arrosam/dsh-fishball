/**
 * Independent review cases (RV-*) for the T-RP recommendation tab, written from the review
 * requirements RV-A..RV-E only (registry:null handoff, inspect network/transport failures, native
 * already-installed refusal, presence = declared AND files available, first-read loading status).
 *
 * Black box: the product (packages/fishball-ui/fishball-recommend-plugins client.js, moved from core by F-UI) is driven only through test/support/rp-recommend.mjs;
 * its body was not read. Expected values come from the requirements and the SDK types
 * (`Registry = string | null`, `BundleInfo.availability`, `PluginSpecInspection`), never from the
 * product's own output.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { RP, openTab, createWorld, settle, deferred, textOf, contains, buttons } from '../support/rp-recommend.mjs'
import { RECOMMENDATION_TEST_DATA } from './cases.mjs'

function freezeData(value) {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freezeData); Object.freeze(value) }
  return value
}

const C = RECOMMENDATION_TEST_DATA.contract
const F = C.fixtures

export const RV = freezeData({
  specSeparator: '@',
  registryField: 'registry',
  /** SDK `Registry = string | null`: null stands for pnpm's own configured registry. */
  nullRegistry: null,
  availability: { installation: 'installation', profile: 'profile', missing: 'missing' },
  /** BundleInfo fields the review rows do not vary (SDK types.d.ts). */
  bundleDefaults: { official: false, optional: false, removable: true, rows: [], overrides: [] },
  changeReasons: { install: 'install', bundle: 'bundle' },
  inspect: {
    network: { status: 'refused', problem: 'network', reason: 'rv fixture: registry unreachable (ECONNRESET)' },
    alreadyInstalledProblem: 'already-installed',
    alreadyInstalledReasonTail: ' is already installed',
    transportError: { message: 'rv fixture: inspection transport failed' },
    thrown: 'rv fixture: inspection threw',
    rejected: 'rv fixture: inspection rejected',
  },
  listError: { message: 'rv fixture: listing failed' },
  /** The Loading status copy ("Loading…" / "正在加载…"), matched by meaning, not exact prose. */
  loading: { en: /loading/i, zh: /加载/ },
  cases: [
    { id: 'RV-01', intent: 'accepted inspection with registry:null hands off a target with no registry field' },
    { id: 'RV-02', intent: 'accepted inspection with a registry URL hands that URL through unchanged' },
    { id: 'RV-03', intent: 'network refusal shows an alert, keeps Install enabled, never retries itself, and one re-click runs one inspect' },
    { id: 'RV-04', intent: 'inspect transport failure, throw and rejection each show an alert and keep Install enabled' },
    { id: 'RV-05', intent: 'native already-installed refusal is shown verbatim, with no handoff or retry' },
    { id: 'RV-06', intent: 'presence requires declared AND available files (decision table over installed x availability x enabled)' },
    { id: 'RV-07', intent: 'files missing <-> available transitions follow the inventory after plugin-manager/changed' },
    { id: 'RV-08', intent: 'rows show only a Loading status, no button, until the first inventory read answers (en, zh)' },
    { id: 'RV-09', intent: 'a failed first inventory read leaves no Loading status and no Installed, with an inventory alert' },
    { id: 'RV-10', intent: 'a pending background refresh after the first read does not bring Loading back' },
  ],
})

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const allIds = () => C.categoryOrder.flatMap((alias) => C.entryIds[alias])
const specOf = (name, version) => name + RV.specSeparator + version
const row = (world, name) => {
  const found = world.page.row(name)
  assert.ok(found, 'row rendered for ' + name)
  return found
}
const rowAlerts = (world, name) => world.page.alerts().filter((alert) => contains(row(world, name), alert))
/** One BundleInfo row; `installed`, `availability` and `enabled` are the varied fields. */
const bundle = (name, { installed = true, availability = RV.availability.profile, enabled = true } = {}) => ({ ...RV.bundleDefaults, name, installed, availability, enabled })
const answer = (bundles) => ({ ok: true, value: bundles.map((b) => ({ ...b })) })
const accepted = (name, registry) => ({ ok: true, value: { status: 'accepted', kind: RP.fixture.kind, name, version: RP.fixture.version, registry, bundle: true } })
const loadingPattern = (world) => RV.loading[world.locale.state.active]

/** Each listed row: names in `presentNames` are Installed with no Install; every other offers Install. */
function assertRowStates(world, presentNames) {
  assert.deepEqual(world.page.rows().map((r) => r.props[RP.attr.pkg]), allIds(), 'the fixed curated list is rendered in order')
  for (const name of allIds()) {
    const r = row(world, name)
    if (presentNames.includes(name)) {
      assert.ok(world.isInstalled(r), name + ' must show Installed')
      assert.equal(world.installButtons(r).length, 0, name + ' must offer no Install')
    } else {
      assert.ok(!world.isInstalled(r), name + ' must not show Installed')
      assert.ok(world.installButtons(r).length >= 1, name + ' must offer Install')
    }
  }
}
function assertNoLoading(world) {
  for (const name of allIds()) assert.doesNotMatch(textOf(row(world, name)), loadingPattern(world), name + ' shows no Loading status')
}
/** Install is visible with its normal label (installButtons matches the label) and not disabled. */
function assertInstallEnabled(world, name) {
  const [button] = world.installButtons(row(world, name))
  assert.ok(button, name + ' still offers Install')
  assert.ok(!button.props.disabled, name + ' Install is enabled')
}
async function nativeChanged(world, bundles, reason) {
  world.bundles = bundles
  world.emitRemote(RP.events.changed, { reason })
  await settle()
}
/** Click Install with the given inspection answer; the failure contract: alert in the row, no handoff, Install enabled. */
async function assertFailedInspect(world, name, onInspect) {
  world.onInspect = onInspect
  await world.clickInstall(name)
  await settle()
  const alerts = rowAlerts(world, name)
  assert.ok(alerts.length >= 1, 'the row shows a role=alert with text')
  assert.equal(world.installs.length, 0, 'nothing handed to owner.install')
  assert.ok(!world.isInstalled(row(world, name)), 'the row is not Installed')
  assertInstallEnabled(world, name)
  return alerts
}
/** Open the tab with the first listBundles call (index 0) held on a deferred promise. */
async function openWithPendingFirstRead(locale) {
  const world = await createWorld({ locale })
  const first = deferred()
  world.onListBundles = (index) => (index === 0 ? first.promise : undefined)
  await world.activate()
  world.page.show()
  await settle()
  return { world, first }
}

// ---------------------------------------------------------------------------------------------
// Checks, keyed by RV case id
// ---------------------------------------------------------------------------------------------

const name = F.absentPackage
const other = F.secondDistinctPackage

const REVIEW_CHECKS = Object.freeze({
  // RV-A, EP partition "registry is null": the optional field is omitted, not null, not a string.
  async 'RV-01'() {
    const { world } = await openTab()
    world.onInspect = () => accepted(name, RV.nullRegistry)
    await world.clickInstall(name)
    assert.equal(world.installTargets.length, 1, 'one owner.install handoff')
    const [target] = world.installTargets
    assert.ok(!Object.hasOwn(target, RV.registryField), 'no registry field at all (got ' + String(target[RV.registryField]) + ')')
    assert.equal(target.spec, specOf(name, RP.fixture.version), 'spec is name@version')
    assert.equal(target.version, RP.fixture.version)
    assert.equal(typeof target.title, 'string'); assert.ok(target.title.trim(), 'non-empty title')
  },

  // RV-A, contrast EP partition "registry is a URL string": passed through unchanged.
  async 'RV-02'() {
    const { world } = await openTab()
    world.onInspect = () => accepted(name, RP.fixture.registry)
    await world.clickInstall(name)
    assert.equal(world.installTargets.length, 1, 'one owner.install handoff')
    const [target] = world.installTargets
    assert.equal(target[RV.registryField], RP.fixture.registry, 'registry passed through unchanged')
    assert.equal(target.spec, specOf(name, RP.fixture.version))
    assert.equal(target.version, RP.fixture.version)
    assert.ok(typeof target.title === 'string' && target.title.trim(), 'non-empty title')
  },

  // RV-B, State Transition: idle -> (click) failed[network] -> (no click) failed -> (click) accepted -> handed off.
  async 'RV-03'() {
    const { world } = await openTab()
    await assertFailedInspect(world, name, () => ({ ok: true, value: RV.inspect.network }))
    await settle(); await settle()
    assert.equal(world.inspects.length, 1, 'no automatic retry: inspect called exactly once')
    assert.equal(world.installs.length, 0)
    world.onInspect = () => accepted(name, RP.fixture.registry)
    await world.clickInstall(name)
    await settle()
    assert.equal(world.inspects.length, 2, 'one explicit re-click runs exactly one new inspect')
    assert.equal(world.installs.length, 1, 'the accepted second answer hands off exactly once')
    assert.equal(world.installs[0].spec, specOf(name, RP.fixture.version))
  },

  // RV-B, EP: transport failure, synchronous throw and rejection are equivalent failure partitions.
  async 'RV-04'(t) {
    const partitions = [
      { label: 'transport failure {ok:false}', onInspect: () => ({ ok: false, error: { ...RV.inspect.transportError } }) },
      { label: 'inspect throws', onInspect: () => { throw new Error(RV.inspect.thrown) } },
      { label: 'inspect rejects', onInspect: () => Promise.reject(new Error(RV.inspect.rejected)) },
    ]
    for (const { label, onInspect } of partitions) {
      await t.test(label, async () => {
        const { world } = await openTab()
        await assertFailedInspect(world, name, onInspect)
      })
    }
  },

  // RV-C, EP partition "refused: already-installed": shown with the Host's reason verbatim.
  async 'RV-05'() {
    const { world } = await openTab()
    const reason = name + RV.inspect.alreadyInstalledReasonTail
    world.onInspect = () => ({ ok: true, value: { status: 'refused', problem: RV.inspect.alreadyInstalledProblem, reason } })
    await world.clickInstall(name)
    await settle(); await settle()
    const alerts = rowAlerts(world, name)
    assert.ok(alerts.some((alert) => textOf(alert).includes(reason)), 'a row alert carries the reason verbatim: ' + alerts.map(textOf).join(' / '))
    assert.equal(world.installs.length, 0, 'no handoff')
    assert.equal(world.inspects.length, 1, 'no automatic retry')
    assert.ok(!world.isInstalled(row(world, name)), 'presence follows listBundles only')
  },

  // RV-D, Decision Table: present <=> installed AND availability != missing; enabled is irrelevant.
  // `other` is a present row in every rule, proving the rule stays row-local.
  async 'RV-06'(t) {
    const { installation, profile, missing } = RV.availability
    const rules = [
      { installed: true, availability: missing, enabled: true, present: false },
      { installed: true, availability: missing, enabled: false, present: false },
      { installed: true, availability: profile, enabled: true, present: true },
      { installed: true, availability: installation, enabled: true, present: true },
      { installed: false, availability: installation, enabled: false, present: false },
      { installed: false, availability: profile, enabled: false, present: false },
      { installed: false, availability: missing, enabled: false, present: false },
    ]
    for (const rule of rules) {
      const label = 'installed=' + rule.installed + ' availability=' + rule.availability + ' enabled=' + rule.enabled + ' -> ' + (rule.present ? 'Installed' : 'Install')
      await t.test(label, async () => {
        const { world } = await openTab({ bundles: [bundle(name, rule), bundle(other)] })
        assertRowStates(world, rule.present ? [name, other] : [other])
      })
    }
  },

  // RV-D, State Transition: missing -> available (changed) -> Installed; available -> missing (changed) -> Install.
  async 'RV-07'(t) {
    await t.test('missing -> profile + changed(install) -> Installed', async () => {
      const { world } = await openTab({ bundles: [bundle(name, { availability: RV.availability.missing }), bundle(other)] })
      assertRowStates(world, [other])
      await nativeChanged(world, [bundle(name), bundle(other)], RV.changeReasons.install)
      assertRowStates(world, [name, other])
    })
    await t.test('profile -> files missing + changed -> Install', async () => {
      const { world } = await openTab({ bundles: [bundle(name), bundle(other)] })
      assertRowStates(world, [name, other])
      await nativeChanged(world, [bundle(name, { availability: RV.availability.missing }), bundle(other)], RV.changeReasons.bundle)
      assertRowStates(world, [other])
    })
  },

  // RV-E, State Transition loading -> loaded, EP locale en/zh.
  async 'RV-08'(t) {
    for (const locale of Object.values(RP.locales)) {
      await t.test(locale, async () => {
        const { world, first } = await openWithPendingFirstRead(locale)
        assert.ok(world.listCalls >= 1, 'the first inventory read was started')
        for (const id of allIds()) {
          const r = row(world, id)
          assert.match(textOf(r), loadingPattern(world), id + ' shows a Loading status')
          assert.equal(buttons(r).length, 0, id + ' shows no button while loading')
          assert.ok(!world.isInstalled(r), id + ' is not Installed while loading')
        }
        first.resolve(answer([bundle(other)]))
        await settle()
        assertNoLoading(world)
        assertRowStates(world, [other])
      })
    }
  },

  // RV-E, EP partition "first read fails".
  async 'RV-09'() {
    const world = await createWorld()
    world.onListBundles = () => ({ ok: false, error: { ...RV.listError } })
    await world.activate(); world.page.show(); await settle()
    assert.ok(world.page.alerts().length >= 1, 'an inventory alert exists')
    assertNoLoading(world)
    assert.ok(allIds().every((id) => !world.isInstalled(row(world, id))), 'no row claims Installed')
  },

  // RV-E, State Transition loaded -> (changed, refresh pending) -> still loaded.
  async 'RV-10'() {
    const { world } = await openTab({ bundles: [bundle(other)] })
    assertRowStates(world, [other])
    const refresh = deferred()
    const firstRefresh = world.listCalls
    world.onListBundles = (index) => (index >= firstRefresh ? refresh.promise : undefined)
    world.emitRemote(RP.events.changed, { reason: RV.changeReasons.install })
    await settle()
    assert.ok(world.listCalls > firstRefresh, 'the background refresh read was started')
    assertNoLoading(world)
    assertRowStates(world, [other])
    refresh.resolve(answer([bundle(other)]))
    await settle()
    assertRowStates(world, [other])
  },
})

/** Register the RV cases for one SDK, with the same SDK-selection rule as cases.mjs. */
export async function registerReviewCases(sdk) {
  const data = RECOMMENDATION_TEST_DATA
  const sdkModules = process.env.FBTEST_DSH_RUNTIME
  const selected = Boolean(sdkModules) && sdkModules.split(path.sep).includes(sdk)
  for (const { id, intent } of RV.cases) {
    const title = [data.feature, id, data.title.sdk + sdk, intent].join(data.title.separator)
    if (!selected) { test(title, { skip: data.title.sdk + sdk + ' not selected by FBTEST_DSH_RUNTIME' }); continue }
    test(title, (t) => REVIEW_CHECKS[id](t))
  }
}
