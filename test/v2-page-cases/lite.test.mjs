/**
 * LITE black-box cases (docs/test-design/v2-origin-lite-set-cases.md §2), executable per SDK.
 *
 * Oracles come from the requirements (docs/planning/v2-final-scope.md §4 LITE row, §4.3, §5) and
 * the public contract (docs/planning/v2-lite.md). The product is never read:
 * - The page client runs unread in a real headless Chromium at a loopback "child" origin
 *   (lite-browser.mjs, lite-harness.js), over the SELECTED SDK's real dsh-client-shortcuts
 *   ShortcutsService and real localStorage. A separate loopback "main" origin holds main sentinels.
 * - The launch overlay is composed with the SDK's real dsh-base + dsh-web-app patch layers by
 *   dsh-app-boot's own composeEntries.
 * The observable oracle is pre-activation reachability/authority, never a model that navigates
 * back or archives after the prohibited action already happened.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { loadInstance } from '../support/body-soul-env.mjs'
import { chromeBinary, keyFor, sdkRuntime, startEnvironment } from './lite-browser.mjs'
import { SDK_VERSIONS } from './support.mjs'

const CONTEXT = Object.freeze({
  task: 'LITE',
  source: 'docs/planning/v2-final-scope.md §4 LITE, §4.3 all; docs/plugins/instance-extension-points.md §11 retained clauses; docs/test-design/v2-origin-lite-set-cases.md §2',
})
const FIXTURE = Object.freeze({
  manager: 'session-fishball-case',
  ordinary: 'session-other-case',
  mainSentinelKey: 'fbtest.main.sentinel',
  childSentinelKey: 'fbtest.child.unrelated',
})

// ---------------------------------------------------------------------------------------------
// Requirement vocabulary (contract §3 table; native SDK ids and defaults of both SDKs)
// ---------------------------------------------------------------------------------------------
const ALL_FOUR = Object.freeze(['control', 'alt', 'shift', 'meta'])
const DESIRED = Object.freeze({
  'session.new': 'F13', 'session.search': 'F14', 'session.fork': 'F15', 'session.archive': 'F16',
  'workspace.add': 'F17', 'session.rename': 'F18', 'sidebar.left.toggle': 'F19',
})
const RELEVANT = Object.freeze(Object.keys(DESIRED))
const ALLOWED = Object.freeze(['settings.open', 'shortcuts.open'])
const web = (code, modifiers) => Object.freeze({ 'web:macos': { code, modifiers }, 'web:windows': { code, modifiers } })
/** Native defaults as registered by ui-workspace / ui-layout / ui-settings-general / ui-shortcuts. */
const NATIVE = Object.freeze({
  'session.new': web('KeyN', ['primary', 'alt']),
  'session.search': web('KeyK', ['primary', 'alt']),
  'workspace.add': web('KeyO', ['primary', 'alt']),
  'session.rename': web('KeyG', ['primary', 'alt']),
  'session.fork': web('KeyF', ['primary', 'shift']),
  'session.archive': web('KeyA', ['primary', 'alt']),
  'sidebar.left.toggle': web('KeyB', ['primary', 'alt']),
  'settings.open': web('Comma', ['primary', 'alt']),
  'shortcuts.open': Object.freeze({ 'web:macos': { code: 'Slash', modifiers: ['primary'] }, 'web:windows': { code: 'Slash', modifiers: ['primary'] }, 'web:linux': { code: 'Slash', modifiers: ['primary'] } }),
})
const command = (id) => ({ id, defaults: NATIVE[id] })
const commands = (ids) => ids.map(command)
const desired = (id) => ({ code: DESIRED[id], modifiers: [...ALL_FOUR] })
const STATUS = Object.freeze({ en: 'Fishball shortcut protection unavailable', zh: 'Fishball 快捷键保护不可用', retry: 'Retry', fishball: 'Fishball', plugins: 'Plugins' })
const PLUGINS_PANEL = 'plugins'
const MAC = 'web:macos'
const LINUX_PLATFORM = 'Linux x86_64'
/** Bounded wait for asynchronous page work (host-side only; never a product readiness oracle). */
const WAIT = Object.freeze({ budgetMs: 4000, pollMs: 25, quietMs: 400 })
/** Tab presses per traversal: more than the focusable controls of the fixture document. */
const TAB_WALK = 30

// ---------------------------------------------------------------------------------------------
// Native dictionaries (contract §4: labels come from the SDK's localized dictionaries)
// ---------------------------------------------------------------------------------------------
function nativeDictionary(runtime, pkg, key) {
  const source = readFileSync(path.join(runtime, '@deepseek-ai', pkg, 'lib', 'client.js'), 'utf8')
  const pick = (lang) => {
    const at = source.indexOf(`const ${lang} = {`)
    const block = source.slice(at, source.indexOf('};', at))
    const match = new RegExp(`"${key.replace(/\./g, '\\.')}":\\s*"([^"]*)"`).exec(block)
    if (at < 0 || !match) throw new Error(`native ${lang} label ${key} not found in ${pkg}`)
    return match[1]
  }
  return { en: { [key]: pick('en') }, zh: { [key]: pick('zh') } }
}
const merge = (a, b) => ({ en: { ...a.en, ...b.en }, zh: { ...a.zh, ...b.zh } })
function dictionaries(runtime) {
  return {
    sidebar: nativeDictionary(runtime, 'dsh-client-ui-sidebar', 'session.new.label'),
    chat: nativeDictionary(runtime, 'dsh-client-ui-chat', 'message.branch'),
    conversation: merge(nativeDictionary(runtime, 'dsh-client-ui-conversation', 'session.hierarchy'), nativeDictionary(runtime, 'dsh-client-ui-conversation', 'hero.chooseWorkspace')),
  }
}

// ---------------------------------------------------------------------------------------------
// Browser scenario helpers
// ---------------------------------------------------------------------------------------------
let env = null
let envError = null
/** Browser-backed cases skip (never fail) on a machine without a local headless Chromium. */
const BROWSER_SKIP = chromeBinary() ? null : 'no local headless Chromium (set FBTEST_CHROME or install the Playwright chromium_headless_shell under ~/Library/Caches/ms-playwright); browser-backed LITE case not run'
before(async () => {
  if (BROWSER_SKIP) return
  try { env = await startEnvironment() } catch (error) { envError = error }
})
after(async () => { await env?.stop() })
/** Why browser-backed cases cannot run here, or null: no binary, or a binary that failed to start. */
const browserSkip = () => BROWSER_SKIP ?? (envError ? 'local headless Chromium failed to start (' + envError.message + '); browser-backed LITE case not run' : null)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(read, what) {
  const start = Date.now()
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() - start > WAIT.budgetMs) throw new Error('timed out: ' + what)
    await sleep(WAIT.pollMs)
  }
}

const OPEN_VIEWS = new WeakMap()
/** Open a fresh child view running the page over the selected SDK's real shortcut service. */
async function scenario(t, sdk, options = {}) {
  if (!env) throw envError ?? new Error('LITE browser environment unavailable')
  const runtime = sdkRuntime(sdk)
  // Views of one origin share localStorage and react to each other's storage events. A scenario
  // that models a fresh store closes this case's earlier views first; keepStorage models a second
  // concurrent view of the same store and keeps them.
  const open = OPEN_VIEWS.get(t) ?? []
  OPEN_VIEWS.set(t, open)
  // Assertions on an earlier view run before the next fresh scenario starts, so disposing its page
  // (stopping its reactions) keeps its handle valid while isolating the new store.
  if (!options.keepStorage) for (const view of open.splice(0)) await view.evaluate('__lite.disposePage?.(), true').catch(() => {})
  const tab = await env.openChild({ sdk, hash: options.hash, platform: options.platform })
  open.push(tab)
  t.after(() => tab.close())
  const { hash: _hash, platform: _platform, ...start } = options
  await tab.evaluate(`__lite.start(${JSON.stringify({ dicts: dictionaries(runtime), ...start })})`)
  const page = {
    tab,
    eval: (expression) => tab.evaluate(expression),
    state: () => tab.evaluate('__lite.state()'),
    log: () => tab.evaluate('__lite.log'),
    calls: async (service, method) => (await tab.evaluate('__lite.log.calls')).filter((call) => call.service === service && (method === undefined || call.method === method)),
    async settled() {
      // Quiet period: no new edit and no new call for WAIT.quietMs.
      let last = ''
      let since = Date.now()
      const start = Date.now()
      for (;;) {
        const now = JSON.stringify(await tab.evaluate('[__lite.log.edits.length, __lite.log.calls.length, __lite.log.editResults.length]'))
        if (now !== last) { last = now; since = Date.now() }
        if (Date.now() - since >= WAIT.quietMs) return
        if (Date.now() - start > WAIT.budgetMs * 2) return
        await sleep(WAIT.pollMs)
      }
    },
    // The marker also needs the manager selected, so 'protected' is read after the page went quiet.
    async protected() { await waitFor(async () => (await tab.evaluate('__lite.state()')).protectedMarker, 'protected marker'); await page.settled() },
    failed: (lang = 'en') => waitFor(async () => (await tab.evaluate('__lite.state()')).statuses.includes(STATUS[lang]), 'failed-gate status'),
    click: (text) => tab.evaluate(`__lite.clickSlotButton(${JSON.stringify(text)})`),
    binding: async (id) => { const row = (await tab.evaluate('__lite.state()')).catalog.find((entry) => entry.id === id); return row === undefined ? 'absent' : row.binding },
  }
  return page
}

/** Main-origin sentinels: nonempty shortcut preference and unrelated value, compared byte-for-byte. */
async function mainSentinels(t) {
  const main = await env.openMain()
  t.after(() => main.close())
  const doc = JSON.stringify({ schemaVersion: 1, profiles: { [MAC]: { 'session.new': { code: 'KeyN', modifiers: ['primary', 'alt'] }, 'fbtest.mainOnly': null } } }, null, 2) + '\n'
  await main.evaluate(`localStorage.setItem('dsh.keybindings.v1', ${JSON.stringify(doc)}); localStorage.setItem(${JSON.stringify(FIXTURE.mainSentinelKey)}, 'main-unrelated'); window.__events = 0; addEventListener('storage', () => window.__events++); true`)
  const snapshot = () => main.evaluate('JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]))')
  const beforeBytes = await snapshot()
  return {
    async assertUnchanged() {
      assert.equal(await snapshot(), beforeBytes, 'main localStorage must stay byte-identical')
      assert.equal(await main.evaluate('window.__events'), 0, 'main must receive no child-caused storage event')
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Shared assertions (one authoritative copy of each requirement clause)
// ---------------------------------------------------------------------------------------------
/** "No reset, reset-all or direct localStorage write" (contract §3; final §4.3 (5).2). */
async function assertOnlyServiceSetEdits(page) {
  const log = await page.log()
  for (const edit of log.edits) {
    assert.equal(edit.operation.type, 'set', 'only set edits through ctx.shortcuts.edit')
    assert.ok(!ALLOWED.includes(edit.operation.id), 'allowed destination edited: ' + edit.operation.id)
    assert.ok(RELEVANT.includes(edit.operation.id), 'untargeted command edited: ' + edit.operation.id)
  }
  const direct = log.storageWrites.filter((write) => write.by === 'page')
  assert.deepEqual(direct, [], 'page wrote localStorage directly')
}
/** Accepted binding of each relevant command: desired distinct complex binding or explicit null. */
async function assertMappedSafely(page, ids) {
  const { catalog } = await page.state()
  const seen = new Set()
  for (const id of ids) {
    const row = catalog.find((entry) => entry.id === id)
    assert.ok(row, 'command missing ' + id)
    if (row.binding !== null) {
      assert.deepEqual(row.binding, desired(id), id + ' must be the contract binding or null')
      assert.equal(row.issue, null)
      assert.deepEqual(row.conflicts, [])
      const key = JSON.stringify(row.binding)
      assert.ok(!seen.has(key), 'duplicate binding ' + key)
      seen.add(key)
    }
    assert.equal(row.modified, true, id + ' must be an explicit child preference')
  }
}
/** "Zero corrective openSession/selectPanel calls and zero automatic archive cleanup". */
async function assertNoCorrection(page, { opensAllowed = 1 } = {}) {
  const calls = (await page.log()).calls
  const opens = calls.filter((call) => call.service === 'uiWorkspace' && call.method === 'openSession')
  assert.ok(opens.length <= opensAllowed, `openSession called ${opens.length} times; allowed ${opensAllowed}`)
  for (const call of opens) assert.deepEqual(call.args, [FIXTURE.manager], 'openSession only for the assigned manager')
  // Correction = navigation after a drift with no user action (Fishball/Retry) in between.
  let drifted = false
  const corrective = []
  for (const entry of (await page.log()).timeline) {
    if (entry.kind === 'drift') drifted = true
    else if (entry.kind === 'user') drifted = false
    else if (drifted && entry.kind === 'call' && ((entry.service === 'layout' && entry.method === 'selectPanel') || (entry.service === 'uiWorkspace' && entry.method === 'openSession'))) corrective.push(entry)
  }
  assert.deepEqual(corrective, [], 'no corrective openSession/selectPanel after drift')
  assert.deepEqual(calls.filter((call) => /archive/i.test(call.method)), [], 'no archive call')
}
async function assertNoTimers(page) {
  assert.deepEqual((await page.log()).timers, [], 'page scheduled a timer')
}
/** Former binding gesture delivered by the browser must not run the native command. */
async function assertFormerGestureInert(page, id, { inComposer = false } = {}) {
  const [binding] = Object.values(NATIVE[id])
  const modifiers = binding.modifiers.map((name) => (name === 'primary' ? 'meta' : name))
  if (inComposer) await page.eval(`document.getElementById('fb-composer').focus(), true`)
  else await page.eval('document.activeElement?.blur(), document.body.focus(), true')
  await page.tab.press(keyFor(binding.code, modifiers))
  await sleep(WAIT.pollMs * 4)
  const handlers = (await page.log()).handlers
  assert.ok(!handlers.includes('command:' + id), `former ${id} gesture ran the native command`)
}

/** §11.3: the page's occupant is the rendered entry of the single conversation.hero.workspace slot. */
async function assertHeroPickerShadowed(page) {
  assert.equal(await page.eval('__lite.heroActive()'), 'page', 'page occupant must shadow the native hero workspace picker (single slot, lowest priority renders)')
  assert.ok(!(await page.log()).handlers.includes('native-picker-render'), 'native hero workspace picker rendered')
}
/** No native picker opened or reachable, no workspace picked, no other session opened. */
async function assertNoHeroPicker(page) {
  const log = await page.log()
  assert.ok(!log.handlers.includes('native-picker-open'), 'native hero workspace picker opened')
  assert.equal(await page.eval(`document.getElementById('fb-native-picker-menu') !== null`), false, 'picker menu present in document.body')
  assert.deepEqual(log.handlers.filter((name) => name.startsWith('hero-pick:')), [], 'a workspace was picked (creates/opens another blank session)')
  for (const call of await page.calls('uiWorkspace', 'openSession')) assert.deepEqual(call.args, [FIXTURE.manager], 'only the manager is opened')
}

/** A gate that is pending (not failed, not protected) is visible as a status, with Retry. */
async function assertVisiblePending(page, why) {
  const honest = await page.eval('__lite.honest()')
  assert.ok(honest.statuses.length > 0, `${why}: a pending gate must show a visible status, not a blank page`)
  assert.ok(honest.retry, `${why}: a pending gate must offer a visible Retry`)
}

/**
 * Hidden-and-unreachable proof for a whole subtree: no descendant is visible-and-hit-testable,
 * none receives focus from a 30-step Tab walk or from focus(), and real click/Enter/Space at each
 * one's pre-protection position reaches none of the given handlers.
 */
async function assertSubtreeUnreachable(page, selector, ids, handlerNames) {
  assert.deepEqual(await page.eval(`__lite.reachableUnder(${JSON.stringify(selector)})`), [], selector + ' has a reachable descendant')
  const rects = await page.eval('__lite.rects')
  await page.eval('__lite.log.focused.length = 0, document.activeElement?.blur(), true')
  for (let index = 0; index < TAB_WALK; index++) await page.tab.press(keyFor('Tab'))
  for (const id of ids) {
    await page.eval(`document.getElementById(${JSON.stringify(id)}).focus(), true`)
    await page.tab.press(keyFor('Enter'))
    await page.tab.press(keyFor('Space'))
    await page.tab.click(rects[id].x, rects[id].y)
  }
  await page.settled()
  const log = await page.log()
  for (const id of ids) assert.ok(!log.focused.includes(id), `${id} under ${selector} received focus`)
  for (const name of handlerNames) assert.ok(!log.handlers.includes(name), `${name} handler reached under ${selector}`)
}

const commonUnchanged = async (page, main) => {
  await assertOnlyServiceSetEdits(page)
  await main.assertUnchanged()
}

// ---------------------------------------------------------------------------------------------
// Overlay (contract "Launch overlay"; final §4 LITE: effective read-only, removed surfaces)
// ---------------------------------------------------------------------------------------------
const OVERLAY = Object.freeze({
  disabledRows: Object.freeze(['ui-subagent', 'ui-schedule', 'schedule', 'ui-permission', 'ui-agent-preset', 'entry-customization', 'ui-open-in-app', 'open-in-app', 'ui-sidebar-terminal', 'terminal-controller']),
  // V3 (design §5a.2 as amended at 32fca3c5, S6 round 2; Q-S6-2 B): the session-creating tools sit
  // inside the shipped presets' config.plugins, which no patch reaches; the shipped presets are
  // switched off, not deleted, so they leave the model as a whole.
  shippedPresets: Object.freeze(['preset-standard', 'preset-ptc', 'preset-cordis', 'preset-minimal']),
  permission: Object.freeze({ presets: { 'read-only': { sandbox: 'read-only', approval: 'ask' } }, defaultPreset: 'read-only' }),
  base: path.join(os.tmpdir(), 'fbtest-lite-overlay'),
  saved: Object.freeze({ id: 'sandbox-policy', config: { mode: 'danger-full-access' } }),
  savedPermission: Object.freeze({ id: 'permission', config: { presets: { 'workspace-write': { sandbox: 'workspace-write', approval: 'never' } }, defaultPreset: 'workspace-write' } }),
})

async function overlayComposition(sdk, { profileLayer = [] } = {}) {
  const runtime = sdkRuntime(sdk)
  const boot = await import(pathToFileURL(path.join(runtime, '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js')).href)
  const layers = ['dsh-base', 'dsh-web-app'].map((name) => {
    const dir = path.join(runtime, '@deepseek-ai', name)
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return boot.bundlePatchPaths(dir, manifest.dsh.bundle).flatMap((file) => boot.loadOverlayPatches('fbtest', file))
  })
  // V3 rule (design e1e5577 §5a.2, §6.2): the guards come from fishball-core's own bundle patch,
  // composed after the bundles it guards (R-FB-12); then the profile patch file; then the launch
  // overlays, which carry no guard row. Core's patch is read by the SDK's own loader.
  layers.push(boot.loadOverlayPatches('fbtest', path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'packages', 'core', 'cordis.patch.yml')))
  const entries = boot.composeEntries([...layers, profileLayer])
  const { launchOverlay } = await loadInstance('src/native-runtime/overlay.js')
  const paths = { home: path.join(OVERLAY.base, 'home'), agentsHome: path.join(OVERLAY.base, 'agents'), workspace: path.join(OVERLAY.base, 'workspace'), mainHome: path.join(OVERLAY.base, 'main') }
  const childModule = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'packages', 'instance', 'native-child.js')
  const operations = launchOverlay(paths, { hostId: 'fbtest-host', instanceId: 'fbtest-instance' }, childModule, {}, {}, entries)
  const effective = boot.composeEntries([...layers, profileLayer, operations])
  return { entries, operations, effective, mainEntries: boot.composeEntries([...layers, profileLayer]) }
}
function findRows(rows, id, out = []) {
  for (const row of rows) {
    if (row.id === id) out.push(row)
    if (row.group && Array.isArray(row.config)) findRows(row.config, id, out)
    if (Array.isArray(row.config?.plugins)) findRows(row.config.plugins, id, out)
  }
  return out
}
function assertReadOnlyAuthority(effective, entries) {
  assert.deepEqual(Object.keys(findRows(effective, 'permission')[0]?.config?.presets ?? {}), Object.keys(OVERLAY.permission.presets), 'permission presets read-only only')
  assert.equal(findRows(effective, 'permission')[0]?.config?.defaultPreset, OVERLAY.permission.defaultPreset)
  assert.equal(findRows(effective, 'sandbox-policy')[0]?.config?.mode, 'read-only', 'sandbox-policy read-only kept')
  assert.equal(findRows(effective, 'approval')[0]?.config?.policy, 'ask', 'approval ask kept')
  for (const id of OVERLAY.disabledRows) for (const row of findRows(effective, id)) assert.equal(row.disabled, true, 'row must be disabled: ' + id)
  const presets = OVERLAY.shippedPresets.flatMap((id) => findRows(effective, id))
  assert.ok(presets.length > 0, 'the SDK ships its agent presets (switched off, not deleted)')
  for (const row of presets) assert.equal(row.disabled, true, 'shipped preset must be disabled: ' + row.id)
  // Present-only: no disabled row is invented for a row the profile does not have.
  for (const id of [...OVERLAY.disabledRows, ...OVERLAY.shippedPresets]) assert.equal(findRows(effective, id).length, findRows(entries, id).length, 'overlay must not add row ' + id)
}
/**
 * V3 Q20 "can override" (design e1e5577 §5a.2): the owner's own profile patch composes after core's
 * bundle patch, so a saved wider value wins; core keeps running and reports guards-overridden
 * (R-FB-09, checked by test/v3/f-guards). The launch overlay adds nothing that narrows it again.
 */
function assertOwnerOverrideWins(effective) {
  assert.equal(findRows(effective, 'sandbox-policy')[0]?.config?.mode, OVERLAY.saved.config.mode, 'the owner\'s saved sandbox wins over core\'s guard (Q20)')
  assert.equal(findRows(effective, 'permission')[0]?.config?.defaultPreset, OVERLAY.savedPermission.config.defaultPreset, 'the owner\'s saved permission default wins (Q20)')
}

// ---------------------------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------------------------
const CASES = []
/** Cases observed through the composed overlay only (no browser needed). */
const BROWSERLESS = Object.freeze(['LITE-UC-03', 'LITE-EP-13'])
/** Cases that compose the overlay with dsh-app-boot (needs that SDK as the selected runtime). */
const COMPOSING = Object.freeze(['LITE-UC-03', 'LITE-EP-12', 'LITE-EP-13'])
/**
 * The instance's module hooks resolve every `@deepseek-ai/*` import from FBTEST_DSH_RUNTIME, so one
 * process can compose the real profile only for that SDK; the other SDK's composition runs when the
 * file is run with that SDK selected (both runs are required, see the case document).
 */
const selectedSdk = (sdk) => sdkRuntime(sdk) !== null && path.resolve(sdkRuntime(sdk)) === path.resolve(process.env.FBTEST_DSH_RUNTIME ?? '')
const lite = (id, title, technique, run, todo) => CASES.push({ id, title, technique, run, todo, browser: !BROWSERLESS.includes(id) })

lite('LITE-UC-01', 'Reconcile child native shortcuts before relevant input becomes usable', 'Use Case', async (t, sdk) => {
  const main = await mainSentinels(t)
  // Main flow: config/catalog ready, every relevant command plus allowed destinations registered.
  const page = await scenario(t, sdk, { commands: commands([...RELEVANT, ...ALLOWED]), extraStorage: { [FIXTURE.childSentinelKey]: 'child-unrelated' } })
  await page.protected()
  await page.settled()
  await assertMappedSafely(page, RELEVANT)
  const log = await page.log()
  // Edits complete before the conversation is marked ready.
  assert.ok(log.timeline.filter((entry) => entry.kind === 'edit').every((entry) => entry.protectedMarker === false), 'conversation marked ready before reconciliation finished')
  assert.equal(log.maxInFlight, 1, 'edits must be serialized')
  // Manager selected once.
  assert.deepEqual((await page.calls('uiWorkspace', 'openSession')).map((call) => call.args), [[FIXTURE.manager]])
  // No duplicate registration override of native commands.
  assert.deepEqual(log.registerCalls.filter((id) => [...RELEVANT, ...ALLOWED].includes(id)), [], 'page re-registered a native command')
  assert.equal(await page.eval(`localStorage.getItem(${JSON.stringify(FIXTURE.childSentinelKey)})`), 'child-unrelated')
  await assertNoTimers(page)
  await assertNoCorrection(page)
  await commonUnchanged(page, main)
  // Prohibited launcher not reachable.
  const reach = await page.eval('__lite.reach("fb-sidebar-new")')
  assert.equal(reach.focused, false)
  assert.equal(reach.visible, false)
  // Alternative: already satisfied -> zero writes on a second view of the same store.
  const second = await scenario(t, sdk, { keepStorage: true, commands: commands([...RELEVANT, ...ALLOWED]) })
  await second.protected()
  await second.settled()
  assert.equal((await second.log()).edits.length, 0, 'satisfied preferences must cause zero edits')
  // Exception: write failure is never called protection.
  const failing = await scenario(t, sdk, { commands: commands(RELEVANT), faults: { results: ['write-failed'] } })
  await failing.failed()
  assert.equal((await failing.state()).protectedMarker, false)
  assert.ok((await failing.state()).buttons.includes(STATUS.retry))
})

lite('LITE-UC-02', 'Preserve native Settings and Plugins with explicit Fishball return', 'Use Case', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands([...RELEVANT, ...ALLOWED]) })
  await page.protected()
  // Plugins is allowed and reachable from the page.
  assert.ok(await page.click(STATUS.plugins), 'Plugins button present')
  await page.settled()
  assert.equal(await page.eval('__lite.panel()'), PLUGINS_PANEL, 'Plugins opens the native plugins panel')
  // Native Settings reachable through the native launcher seat (not hidden).
  const launcher = await page.eval(`(() => { const b = document.querySelector('[data-fbtest-slot="settings.launcher"] button, [data-fbtest-portal="settings.launcher"] button'); if (!b) return null; const r = b.getBoundingClientRect(); b.focus(); const f = document.activeElement === b; return { f, w: r.width, h: r.height, x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  assert.ok(launcher && launcher.f && launcher.w > 0, 'Settings launcher focusable and visible')
  const settingsBefore = (await page.log()).openSettings
  await page.tab.click(launcher.x, launcher.y)
  assert.ok((await page.log()).openSettings > settingsBefore, 'Settings launcher opens native Settings')
  // Explicit return to Fishball selects the same manager.
  assert.ok(await page.click(STATUS.fishball), 'Fishball button present')
  await page.settled()
  const opens = await page.calls('uiWorkspace', 'openSession')
  assert.ok(opens.length >= 1 && opens.every((call) => call.args[0] === FIXTURE.manager), 'explicit return opens the same manager')
  assert.notEqual(await page.eval('__lite.panel()'), PLUGINS_PANEL, 'return leaves the Plugins panel')
  // Harmless ecosystem contributions stay reachable.
  for (const id of ['fb-dock', 'fb-header-action']) assert.equal((await page.eval(`__lite.reach(${JSON.stringify(id)})`)).focused, true, id + ' must stay usable')
  await assertNoCorrection(page, { opensAllowed: opens.length })
  await commonUnchanged(page, main)
})

lite('LITE-UC-03', 'Keep effective read-only with sole narrow private Skills exception', 'Use Case', async (_t, sdk) => {
  const { effective, entries, operations } = await overlayComposition(sdk)
  assertReadOnlyAuthority(effective, entries)
  // V3 (design e1e5577 §6.2, R-HOST-04): the launch overlay carries no guard row.
  assert.deepEqual(operations.filter((op) => ['sandbox-policy', 'approval', 'permission'].includes(op?.id) || OVERLAY.disabledRows.includes(op?.id)).map((op) => op.id), [], 'guard rows in the launch overlay')
  // V3 (Q20): a saved wider value in the owner's profile layer wins over core's guard, and is reported.
  const widened = await overlayComposition(sdk, { profileLayer: [OVERLAY.saved, OVERLAY.savedPermission] })
  assertOwnerOverrideWins(widened.effective)
}, 'Private Skills exception and connector-mediated main-session work need the SK suite / a live child agent; only the overlay authority boundary is asserted here.')

lite('LITE-EP-01', 'Protect editable session.new on page and composer', 'EP', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(['session.new', ...ALLOWED]) })
  await page.protected()
  await assertMappedSafely(page, ['session.new'])
  await assertFormerGestureInert(page, 'session.new')
  await assertFormerGestureInert(page, 'session.new', { inComposer: true })
  // Custom saved binding variant: a user's own earlier binding is also remapped.
  const custom = await scenario(t, sdk, { commands: commands(['session.new']), preEdits: [{ id: 'session.new', binding: { code: 'KeyJ', modifiers: ['primary', 'alt'] } }] })
  await custom.protected()
  await assertMappedSafely(custom, ['session.new'])
  await assertNoCorrection(page)
  await commonUnchanged(page, main)
})

lite('LITE-EP-02', 'Protect editable session.search and its launcher', 'EP', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(['session.search']) })
  await page.protected()
  await assertMappedSafely(page, ['session.search'])
  await assertFormerGestureInert(page, 'session.search')
  const search = await page.eval('__lite.reach("fb-sidebar-search")')
  assert.equal(search.focused, false, 'session search launcher must not be focusable')
  assert.equal(search.visible, false, 'session search launcher must not be visible')
  await assertNoCorrection(page)
  await commonUnchanged(page, main)
})

lite('LITE-EP-03', 'Protect editable session.fork for nonblank manager', 'EP', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(['session.fork']) })
  await page.protected()
  await assertMappedSafely(page, ['session.fork'])
  await assertFormerGestureInert(page, 'session.fork')
  // Reply branch launcher (forks and opens a new session) is unreachable.
  const branch = await page.eval('__lite.reach("fb-branch")')
  assert.equal(branch.focused, false)
  assert.equal(branch.visible, false)
  assert.deepEqual(await page.calls('sessions', 'fork'), [])
  await assertNoCorrection(page)
  await commonUnchanged(page, main)
})

lite('LITE-EP-04', 'Protect editable session.archive without archive fallback', 'EP', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(['session.archive']) })
  await page.protected()
  await assertMappedSafely(page, ['session.archive'])
  await assertFormerGestureInert(page, 'session.archive')
  // Even when an ordinary session is in the main view, nothing is archived.
  await page.eval(`__lite.drift(${JSON.stringify(FIXTURE.ordinary)}), true`)
  await page.settled()
  await assertNoCorrection(page)
  await commonUnchanged(page, main)
})

lite('LITE-EP-05', 'Protect editable workspace.add', 'EP', async (t, sdk) => {
  const main = await mainSentinels(t)
  const unrelated = { id: 'fbtest.unrelated', binding: { code: 'KeyU', modifiers: ['primary', 'alt'] } }
  const page = await scenario(t, sdk, { commands: [...commands(['workspace.add']), { id: unrelated.id, defaults: {} }], preEdits: [unrelated], extraStorage: { [FIXTURE.childSentinelKey]: 'child-unrelated' } })
  await page.protected()
  await assertMappedSafely(page, ['workspace.add'])
  await assertFormerGestureInert(page, 'workspace.add')
  assert.deepEqual(await page.binding(unrelated.id), { code: 'KeyU', modifiers: ['alt', 'meta'] }, 'unrelated child preference preserved')
  assert.equal(await page.eval(`localStorage.getItem(${JSON.stringify(FIXTURE.childSentinelKey)})`), 'child-unrelated')
  const hero = await page.eval('__lite.reach("fb-hero-workspace")')
  assert.equal(hero.focused, false, 'hero workspace picker must not be focusable')
  await assertNoCorrection(page)
  await commonUnchanged(page, main)
})

lite('LITE-EP-06', 'Include editable session.rename in targeted inventory', 'EP', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(['session.rename', 'sidebar.left.toggle']) })
  await page.protected()
  await assertMappedSafely(page, ['session.rename', 'sidebar.left.toggle'])
  await assertFormerGestureInert(page, 'session.rename')
  await assertFormerGestureInert(page, 'sidebar.left.toggle')
  await commonUnchanged(page, main)
})

lite('LITE-EP-07', 'Account for settings.open and shortcuts.open without banning allowed settings', 'EP', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(['session.new', ...ALLOWED]) })
  await page.protected()
  await page.settled()
  for (const id of ALLOWED) {
    const row = (await page.state()).catalog.find((entry) => entry.id === id)
    assert.equal(row.modified, false, id + ' must not be edited')
  }
  // Late registration of an allowed destination is also left alone.
  const late = await scenario(t, sdk, { commands: commands(['session.new']) })
  await late.protected()
  await late.eval(`__lite.register('settings.open', ${JSON.stringify(NATIVE['settings.open'])}), true`)
  await late.settled()
  assert.deepEqual((await late.log()).edits.filter((edit) => ALLOWED.includes(edit.operation.id)), [])
  assert.equal((await late.state()).protectedMarker, true, 'allowed late command keeps protection')
  // The native Settings binding still reaches its handler.
  await page.eval('document.body.focus(), true')
  await page.tab.press(keyFor('Comma', ['meta', 'alt']))
  await sleep(WAIT.pollMs * 4)
  assert.ok((await page.log()).handlers.includes('command:settings.open'), 'native Settings shortcut still works')
  await commonUnchanged(page, main)
})

lite('LITE-EP-08', 'Make sidebar session and new-chat handlers unreachable', 'EP', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT) })
  await page.protected()
  const rects = await page.eval('__lite.rects')
  for (const id of ['fb-sidebar-new', 'fb-sidebar-search', 'fb-sidebar-row', 'fb-new-elsewhere', 'fb-shell-toggle', 'fb-mask']) {
    const reach = await page.eval(`__lite.reach(${JSON.stringify(id)})`)
    assert.equal(reach.focused, false, id + ' must not be focusable')
    assert.equal(reach.hit, false, id + ' must not be pointer-reachable')
    // A real pointer click at the element's former position must not reach its handler.
    await page.tab.click(rects[id].x, rects[id].y)
  }
  // Tab traversal from the document start never lands on a prohibited control.
  const visited = await page.eval(`(async () => { document.body.focus(); return true })()`)
  assert.ok(visited)
  for (let index = 0; index < 20; index++) await page.tab.press(keyFor('Tab'))
  const focusable = await page.eval(`[...document.querySelectorAll('#fb-sidebar-new,#fb-sidebar-search,#fb-sidebar-row,#fb-new-elsewhere,#fb-shell-toggle,#fb-mask')].includes(document.activeElement)`)
  assert.equal(focusable, false)
  await page.tab.press(keyFor('Enter'))
  await page.tab.press(keyFor('Space'))
  const handlers = (await page.log()).handlers
  for (const name of ['sidebar-new', 'sidebar-search', 'row-open', 'new-elsewhere', 'shell-toggle', 'mask', 'fb-sidebar-row-key']) assert.ok(!handlers.includes(name), 'owner-local handler fired: ' + name)
  assert.equal(await page.eval('__lite.gridTracks().split(" ")[0]'), '0px', 'the 56 px rail track must be 0 px')
  // A sidebar descendant that sets its own visibility:visible (native ui-workspace
  // .bhn1Oq_headerActions, holding Add workspace) is still unreachable: the whole subtree is.
  await assertSubtreeUnreachable(page, '.pI_x6G_sidebarCol', ['fb-add-workspace', 'fb-sidebar-actions'], ['add-workspace', 'add-workspace-key'])
  await assertSubtreeUnreachable(page, '[data-slot="sidebar"]', ['fb-add-workspace'], ['add-workspace', 'add-workspace-key'])
  // Hero row (native ConversationRoot heroWorkspaceRow): the "Choose workspace" chip is a SIBLING of
  // the conversation.hero.workspace slot, whose picker menu is portalled to document.body and whose
  // pick creates/opens another blank session. §11.3: the page's empty occupant shadows the native
  // picker (single slot, lowest priority renders), and the chip is not focusable or clickable.
  await assertHeroPickerShadowed(page)
  await assertSubtreeUnreachable(page, '#fb-hero-workspace', ['fb-hero-workspace'], ['hero-workspace'])
  await assertNoHeroPicker(page)
  // Label matching follows the active native dictionary: zh labels are hidden as well.
  const zh = await scenario(t, sdk, { locale: 'zh', commands: commands(RELEVANT) })
  await zh.protected()
  for (const id of ['fb-new-elsewhere', 'fb-branch', 'fb-crumb', 'fb-hero-workspace']) assert.equal((await zh.eval(`__lite.reach(${JSON.stringify(id)})`)).focused, false, id + ' (zh label) must not be focusable')
  await assertNoCorrection(page)
})

lite('LITE-EP-09', 'Make lineage and catalogue tree session-open handlers unreachable', 'EP', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT) })
  await page.protected()
  const rects = await page.eval('__lite.rects')
  for (const id of ['fb-crumb', 'fb-lineage', 'fb-lineage-tree', 'fb-header-leading']) {
    const reach = await page.eval(`__lite.reach(${JSON.stringify(id)})`)
    assert.equal(reach.focused, false, id + ' must not be focusable')
    assert.equal(reach.visible, false, id + ' must not be visible')
    await page.tab.click(rects[id].x, rects[id].y)
  }
  const handlers = (await page.log()).handlers
  for (const name of ['crumb-open', 'lineage-open', 'fb-lineage-tree-key', 'header-leading']) assert.ok(!handlers.includes(name), 'handler fired: ' + name)
  // rc.1 crumb segments (span tabIndex=0, including the current title) open the session menu
  // (Fork/Archive/Rename/Pin) on right-click, ContextMenu and Shift+F10: the whole top
  // navigation is unreachable, not only its buttons.
  await assertSubtreeUnreachable(page, '#fb-nav', ['fb-crumb-seg', 'fb-crumb-current', 'fb-crumb'], ['crumb-open'])
  for (const id of ['fb-crumb-seg', 'fb-crumb-current']) {
    await page.tab.click(rects[id].x, rects[id].y, 'right')
    await page.eval(`document.getElementById(${JSON.stringify(id)}).focus(), true`)
    await page.tab.press(keyFor('ContextMenu'))
    await page.tab.press(keyFor('F10', ['shift']))
  }
  await page.settled()
  const menu = (await page.log()).handlers.filter((name) => /-menu/.test(name))
  assert.deepEqual(menu, [], 'hierarchy session context menu reachable')
  await assertNoCorrection(page)
})

lite('LITE-EP-10', 'Prevent fixed Enter and contributed commands from opening prohibited surfaces', 'EP', async (t, sdk) => {
  // Empty-session hero with no workspace title: the inert composer becomes a tabIndex 0 "Choose
  // workspace" trigger (native InputBar); card click and Enter/Space request the slot's picker.
  const page = await scenario(t, sdk, { heroEmpty: true, commands: commands(RELEVANT) })
  await page.protected()
  await assertHeroPickerShadowed(page)
  const card = await page.eval('__lite.reach("fb-inert-card")')
  await page.eval(`document.getElementById('fb-inert-composer').focus(), true`)
  await page.tab.press(keyFor('Enter'))
  await page.eval(`document.getElementById('fb-inert-composer').focus(), true`)
  await page.tab.press(keyFor('Space'))
  if (card.rect.w > 0) await page.tab.click(card.rect.x, card.rect.y)
  await page.settled()
  await assertNoHeroPicker(page)
  await assertNoCorrection(page)
}, 'Only the hero inert-composer trigger is asserted; the reachable contributed-command inventory (ui-commands popup Enter/Tab, slash commands, fixed.select menus) needs the full native composition.')

lite('LITE-EP-11', 'Retain harmless send newline dismiss stop and approval actions', 'EP', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT) })
  await page.protected()
  await page.eval(`document.getElementById('fb-composer').focus(), true`)
  const harmless = [keyFor('Enter'), keyFor('Enter', ['shift']), keyFor('Escape'), keyFor('Escape'), keyFor('Enter', ['meta']), keyFor('Enter', ['control']), keyFor('Slash')]
  for (const key of harmless) await page.tab.press(key)
  const keys = (await page.log()).keys
  const composer = keys.filter((entry) => entry.where === 'composer')
  assert.equal(composer.length, harmless.length, 'every harmless key reaches the composer')
  for (const entry of composer) assert.equal(entry.prevented, false, `${entry.key} must not be suppressed`)
  assert.equal(keys.filter((entry) => entry.where === 'window-bubble').length, harmless.length, 'harmless keys propagate to native window handlers')
})

lite('LITE-EP-12', 'Preserve child native ecosystem contributions and untouched main composition', 'EP', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT) })
  await page.protected()
  // Harmless chat/dock/header contributions stay rendered and usable.
  for (const id of ['fb-dock', 'fb-header-action', 'fb-transcript-text']) assert.equal((await page.eval(`__lite.reach(${JSON.stringify(id)})`)).visible, true, id + ' retained')
  await page.eval(`document.getElementById('fb-dock').click(), true`)
  assert.ok((await page.log()).handlers.includes('dock'))
  // Main composition: no page row; the overlay inserts it only for the child.
  const { operations, mainEntries } = await overlayComposition(sdk)
  assert.deepEqual(findRows(mainEntries, 'fishball-page'), [], 'main composition has no page row')
  const inserted = operations.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert)
  assert.equal(inserted.filter((row) => row.id === 'fishball-page').length, 1, 'child overlay inserts the page row once')
  // Main manifest never declares the page client.
  const manifest = JSON.parse(readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'packages', 'instance', 'package.json'), 'utf8'))
  assert.ok(!JSON.stringify(manifest.dsh?.client ?? {}).includes('fishball-page'))
  // Disabled child rows are limited to the contract list (no unrelated removal).
  const disabledByOverlay = operations.filter((op) => op?.disabled === true).map((op) => op.id).filter((id) => id !== 'hmr')
  for (const id of disabledByOverlay) assert.ok([...OVERLAY.disabledRows].includes(id), 'unexpected disabled row ' + id)
})

lite('LITE-EP-13', 'Refuse ordinary child creation and general agent write escapes', 'EP', async (_t, sdk) => {
  const { effective, entries } = await overlayComposition(sdk)
  assertReadOnlyAuthority(effective, entries)
  assert.deepEqual(Object.keys(findRows(effective, 'permission')[0].config.presets), ['read-only'], '/permission accepts only read-only')
  // V3 (Q20): the owner may override in their own profile; that is reported, not refused.
  const widened = await overlayComposition(sdk, { profileLayer: [OVERLAY.saved, OVERLAY.savedPermission] })
  assertOwnerOverrideWins(widened.effective)
}, 'Runtime refusal by a live child agent (tool calls, escalation prompt, private Skills exception) needs a booted child; only the composed overlay authority is asserted.')

const FRAME_GUARD = Object.freeze({
  leaving: Object.freeze([
    ['fb-top-link', 'https://example.invalid/top'],
    ['fb-parent-link', 'https://example.invalid/parent'],
    ['fb-named-link', 'https://example.invalid/named'],
    ['fb-self-link', 'https://example.invalid/self'],
  ]),
  svgHref: 'https://example.invalid/svg',
})

lite('LITE-EP-14', 'Keep transcript session-reference and ui-reference from opening other sessions', 'EP', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT) })
  await page.protected()
  const before = await page.state()
  const at = async (id) => (await page.eval(`__lite.reach(${JSON.stringify(id)})`)).rect
  const ref = await at('fb-ref-link')
  await page.tab.click(ref.x, ref.y)
  await page.eval(`document.getElementById('fb-ref-link').focus(), true`)
  await page.tab.press(keyFor('Enter'))
  await page.settled()
  const after = await page.state()
  assert.equal(after.current, before.current, 'the child document stayed on Fishball')
  assert.equal((await page.eval('__lite.reach("fb-transcript-text")')).visible, true, 'harmless transcript content retained')
  // External link opens in a new window instead (noopener,noreferrer).
  const ext = await at('fb-ext-link')
  await page.tab.click(ext.x, ext.y)
  await page.settled()
  const opens = (await page.log()).opens
  assert.ok(opens.some((args) => args[0] === 'https://example.invalid/out' && /noopener/.test(args[2] ?? '') && /noreferrer/.test(args[2] ?? '')), 'external link opens a new window with noopener,noreferrer')
  assert.equal((await page.state()).current, before.current)
  // Same-document hash passes.
  const same = await at('fb-hash-link')
  await page.tab.click(same.x, same.y)
  await page.settled()
  assert.ok((await page.state()).current.endsWith('#fb-transcript'), 'same-document hash navigation passes')
  // Script (non-user) navigation leaving the document: cancelled by the Navigation API guard and
  // not turned into a new window (only user-initiated ones are).
  const opensBefore = (await page.log()).opens.length
  await page.eval(`location.assign(${JSON.stringify(env.closedOrigin + '/escape')}), true`)
  await page.settled()
  assert.ok((await page.state()).current.startsWith(env.childOrigin), 'script navigation away is cancelled')
  assert.equal((await page.log()).opens.length, opensBefore, 'non-user navigation opens no window')
  await page.eval(`location.hash = 'fbtest-hash', true`)
  await page.settled()
  assert.ok((await page.state()).current.endsWith('#fbtest-hash'), 'script hash change passes')
  // _top, _parent, _self and a named target that is no frame of this document all leave the
  // Fishball document: prevented and opened aside (http/https). _blank already opens aside: pass.
  for (const [id, href] of FRAME_GUARD.leaving) {
    const before = (await page.log()).opens.length
    const point = await at(id)
    await page.tab.click(point.x, point.y)
    await page.settled()
    assert.ok((await page.state()).current.startsWith(env.childOrigin), `${id} navigation away is prevented`)
    const opened = (await page.log()).opens.slice(before)
    assert.equal(opened.length, 1, `${id} opens exactly one window aside`)
    assert.equal(opened[0][0], href, `${id} opens its own destination`)
    assert.match(opened[0][2] ?? '', /noopener/, `${id} window is noopener`)
    assert.match(opened[0][2] ?? '', /noreferrer/, `${id} window is noreferrer`)
  }
  // _blank is not intercepted: no extra window.open from the page, and this document stays.
  await page.eval(`window.__blankDefault = null; document.addEventListener('click', (event) => { if (event.target.closest?.('#fb-blank-link')) { window.__blankDefault = event.defaultPrevented; event.preventDefault() } }, false), true`)
  const blankBefore = (await page.log()).opens.length
  const blank = await at('fb-blank-link')
  await page.tab.click(blank.x, blank.y)
  await page.settled()
  assert.equal(await page.eval('window.__blankDefault'), false, '_blank click must not be prevented by the guard')
  assert.equal((await page.log()).opens.length, blankBefore, '_blank is not re-opened by the guard')
  // An SVG <a> (href is an SVGAnimatedString) must not produce a garbage window.open.
  const svgBefore = (await page.log()).opens.length
  const svg = await at('fb-svg-link')
  await page.tab.click(svg.x, svg.y)
  await page.settled()
  assert.ok((await page.state()).current.startsWith(env.childOrigin), 'SVG anchor navigation away is prevented')
  for (const args of (await page.log()).opens.slice(svgBefore)) assert.equal(args[0], FRAME_GUARD.svgHref, 'SVG anchor opens only its real destination')
  await assertNoCorrection(page)
}, 'Native session-reference/ui-reference rendering is owned by SDK chat packages not composed here; the frame-guard behaviour on a transcript link is asserted.')

lite('LITE-BVA-01', 'Open protection gate only when no relevant command remains unsatisfied', 'BVA', async (t, sdk) => {
  // Unsatisfied count 2 -> 1 -> 0 with edits released one at a time.
  const page = await scenario(t, sdk, { commands: commands(['session.new', 'session.search']), faults: { holdEdits: true } })
  await waitFor(() => page.eval('__lite.facade.pendingEdits() === 1'), 'first edit')
  assert.equal((await page.state()).protectedMarker, false, 'count 2: not protected')
  await page.eval('__lite.facade.releaseEdit(), true')
  await waitFor(() => page.eval('__lite.facade.pendingEdits() === 1'), 'second edit')
  assert.equal((await page.state()).protectedMarker, false, 'count 1: not protected')
  await page.eval('__lite.facade.stopHolding(), true')
  await page.protected()
  await assertMappedSafely(page, ['session.new', 'session.search'])
  // Count zero from the start: zero edits and no revision bump.
  const zero = await scenario(t, sdk, { keepStorage: true, commands: commands(['session.new', 'session.search']) })
  await zero.protected()
  await zero.settled()
  assert.equal((await zero.log()).edits.length, 0)
  assert.equal((await zero.state()).config.revision, await zero.eval('__lite.beforeRevision'), 'no revision bump when satisfied')
  await assertNoTimers(zero)
})

lite('LITE-BVA-02', 'Respect Web single-key validation and distinct-binding conflict boundary', 'BVA', async (t, sdk) => {
  // macOS Web: one physical key + four modifiers is native-valid -> distinct bindings accepted.
  const mac = await scenario(t, sdk, { commands: commands(['session.new', 'session.search']) })
  await mac.protected()
  const rows = (await mac.state()).catalog
  assert.notDeepEqual(rows.find((row) => row.id === 'session.new').binding, rows.find((row) => row.id === 'session.search').binding, 'distinct bindings')
  await assertMappedSafely(mac, ['session.new', 'session.search'])
  for (const edit of (await mac.log()).edits) assert.equal(edit.operation.binding?.secondCode, undefined, 'never a two-key chord')
  // Linux Web: three or more modifiers are not admitted -> explicit null for both, no collision.
  // Native defaults have no web:linux binding, so a saved Linux-valid custom binding is used.
  const linuxSaved = { code: 'Comma', modifiers: ['primary', 'shift'] }
  const linux = await scenario(t, sdk, { platform: LINUX_PLATFORM, commands: commands(['session.new', 'session.search']), preEdits: [{ id: 'session.new', binding: linuxSaved }, { id: 'session.search', binding: { code: 'Period', modifiers: ['primary', 'shift'] } }] })
  await linux.protected()
  for (const id of ['session.new', 'session.search']) {
    const row = (await linux.state()).catalog.find((entry) => entry.id === id)
    assert.equal(row.binding, null, id + ' unbound on Web Linux')
    assert.equal(row.modified, true)
  }
  // A candidate occupied by another (unrelated) command becomes explicit null, not a displacement.
  const occupied = await scenario(t, sdk, { commands: [...commands(['session.new']), { id: 'fbtest.occupant', defaults: { [MAC]: { code: 'F13', modifiers: [...ALL_FOUR] } } }] })
  await occupied.protected()
  assert.equal(await occupied.binding('session.new'), null, 'conflicting candidate becomes null')
  assert.deepEqual(await occupied.binding('fbtest.occupant'), desired('session.new'), 'other command keeps its binding')
})

lite('LITE-DT-01', 'Reconciliation R1 forbids writes before isolated current origin proof', 'Decision Table', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { holdSession: true, commands: commands(RELEVANT) })
  await page.settled()
  assert.deepEqual((await page.log()).edits, [], 'no edit before the session route answered')
  assert.equal((await page.state()).protectedMarker, false)
  await page.eval('__lite.releaseSession(), true')
  await page.protected()
  await commonUnchanged(page, main)
})

lite('LITE-DT-02', 'Reconciliation R2 waits for real config and catalogue events', 'Decision Table', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), faults: { holdConfig: true } })
  await page.settled()
  assert.deepEqual((await page.log()).edits, [], 'no edit while config is loading')
  assert.equal((await page.state()).protectedMarker, false, 'loading is not protection')
  await assertNoTimers(page)
  // Honest state: the manager is known but the gate is pending, so a status is visible, with Retry.
  await assertVisiblePending(page, 'config loading')
  await page.eval('__lite.facade.release(), true')
  await page.protected()
  await assertMappedSafely(page, RELEVANT)
  await assertNoTimers(page)
  // An edit answered not-ready waits for the next native event (no timer, no immediate retry).
  const notReady = await scenario(t, sdk, { commands: commands(['session.new']), faults: { results: ['not-ready'] } })
  await notReady.settled()
  assert.equal((await notReady.log()).edits.length, 1, 'no retry before a native event')
  assert.equal((await notReady.state()).protectedMarker, false)
  await assertNoTimers(notReady)
  await assertVisiblePending(notReady, 'edit not-ready')
  await notReady.eval('__lite.facade.notify(), true')
  await notReady.protected()
  assert.equal((await notReady.log()).edits.length, 2)
})

lite('LITE-DT-03', 'Reconciliation R3 holds gate on unreadable accepted preferences', 'Decision Table', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { storage: '{not json', commands: commands(RELEVANT) })
  await page.failed()
  const state = await page.state()
  assert.equal(state.config.status, 'unreadable')
  assert.equal(state.protectedMarker, false)
  assert.ok(state.buttons.includes(STATUS.retry))
  assert.equal(state.raw, '{not json', 'unreadable document is not overwritten')
  await commonUnchanged(page, main)
  // zh status text.
  const zh = await scenario(t, sdk, { locale: 'zh', storage: '{not json', commands: commands(RELEVANT) })
  await zh.failed('zh')
})

lite('LITE-DT-04', 'Reconciliation R4 skips already normalized desired bindings', 'Decision Table', async (t, sdk) => {
  const main = await mainSentinels(t)
  const first = await scenario(t, sdk, { commands: commands(RELEVANT) })
  await first.protected()
  for (let round = 0; round < 2; round++) {
    const again = await scenario(t, sdk, { keepStorage: true, commands: commands(RELEVANT) })
    await again.protected()
    await again.eval('__lite.facade.notify(), __lite.facade.notify(), true')
    await again.settled()
    assert.equal((await again.log()).edits.length, 0, 'zero edits when satisfied')
    assert.equal((await again.state()).config.revision, await again.eval('__lite.beforeRevision'))
    assert.deepEqual((await again.log()).registerCalls, [])
  }
  await commonUnchanged(first, main)
})

lite('LITE-DT-05', 'Reconciliation R5 serializes successful current-revision edits', 'Decision Table', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), preEdits: [{ id: 'session.new', binding: desired('session.new') }] })
  await page.protected()
  await page.settled()
  const log = await page.log()
  assert.ok(!log.edits.some((edit) => edit.operation.id === 'session.new'), 'satisfied command skipped')
  for (const edit of log.edits) assert.equal(edit.revision, edit.liveRevision, 'each edit uses the current revision')
  assert.equal(log.maxInFlight, 1)
  await assertMappedSafely(page, RELEVANT)
  await assertNoCorrection(page)
  // A 'saved' that does not satisfy the command is reread once; a second one is a failure.
  const noop = await scenario(t, sdk, { commands: commands(['session.new']), faults: { results: ['saved', 'saved'] } })
  await noop.failed()
  assert.equal((await noop.log()).edits.length, 2, 'one reread retry, then failure')
  assert.equal((await noop.state()).protectedMarker, false)
  await commonUnchanged(page, main)
})

lite('LITE-DT-06', 'Reconciliation R6 rereads stale revision before reevaluating', 'Decision Table', async (t, sdk) => {
  const main = await mainSentinels(t)
  const unrelated = { id: 'fbtest.unrelated', binding: { code: 'KeyU', modifiers: ['primary', 'alt'] } }
  const page = await scenario(t, sdk, { commands: [...commands(['session.new']), { id: unrelated.id, defaults: {} }], faults: { results: ['stale-by-concurrent-edit'], concurrentId: unrelated.id, concurrentBinding: unrelated.binding } })
  await page.protected()
  const log = await page.log()
  assert.equal(log.editResults[0], 'stale')
  const retries = log.edits.slice(1)
  assert.ok(retries.length >= 1)
  for (const edit of retries) assert.equal(edit.revision, edit.liveRevision, 'retry uses the reread revision, not a blind replay')
  assert.notEqual(retries[0].revision, log.edits[0].revision)
  assert.deepEqual(await page.binding(unrelated.id), { code: 'KeyU', modifiers: ['alt', 'meta'] }, 'concurrent unrelated edit kept')
  // Stale where the concurrent writer already satisfied the command: skip, no further edit.
  const satisfied = await scenario(t, sdk, { commands: commands(['session.new']), faults: { results: ['stale-by-concurrent-edit'] } })
  await satisfied.protected()
  await satisfied.settled()
  assert.equal((await satisfied.log()).edits.length, 1, 'no further edit once satisfied after stale')
  await commonUnchanged(page, main)
})

lite('LITE-DT-07', 'Reconciliation R7 holds gate on native invalid or conflicting candidate', 'Decision Table', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), faults: { results: ['conflict'] } })
  await page.failed()
  assert.equal((await page.state()).protectedMarker, false)
  assert.equal((await page.log()).edits.length, 1, 'no displacement retry after conflict')
  await assertNoCorrection(page, { opensAllowed: 0 })
  await commonUnchanged(page, main)
})

lite('LITE-DT-08', 'Reconciliation R8 holds gate after write failure', 'Decision Table', async (t, sdk) => {
  const main = await mainSentinels(t)
  // Real native write failure: child localStorage.setItem throws inside the SDK's own persistence.
  const failing = await scenario(t, sdk, { commands: commands(['session.new']), failWrite: true })
  await failing.failed()
  const state = await failing.state()
  assert.equal((await failing.log()).editResults[0], 'write-failed', 'native persistence reported write-failed')
  assert.equal(state.protectedMarker, false)
  assert.ok(state.buttons.includes(STATUS.retry))
  assert.equal(state.raw, null, 'accepted (empty) preferences preserved')
  assert.equal(state.catalog.find((row) => row.id === 'session.new').modified, false, 'accepted binding unchanged')
  // Hold unavailable: storage recovers, then unrelated catalog/config notifications arrive
  // (a late unrelated registration and a real edit by someone else). No edit, no write, and the
  // status stays until the user presses Retry.
  await failing.eval('__lite.storageFaults.failWrite = false, true')
  const editsAtFailure = (await failing.log()).edits.length
  await failing.eval(`__lite.register('fbtest.unrelated.late', {}), true`)
  assert.equal(await failing.eval(`__lite.externalEdit('fbtest.unrelated.late', null)`), 'saved')
  await failing.eval('__lite.facade.notify(), true')
  await failing.settled()
  assert.equal((await failing.log()).edits.length, editsAtFailure, 'no edit after a gate failure until Retry')
  assert.deepEqual((await failing.log()).storageWrites.filter((write) => write.by === 'page'), [], 'no page write after failure')
  assert.ok((await failing.state()).statuses.includes(STATUS.en), 'status still unavailable after unrelated notifications')
  assert.equal((await failing.state()).protectedMarker, false, 'still not protected before Retry')
  // Retry after the storage recovers reconciles and protects.
  assert.ok(await failing.click(STATUS.retry))
  await failing.protected()
  await assertMappedSafely(failing, ['session.new'])
  await assertNoCorrection(failing)
  await commonUnchanged(failing, main)
})

lite('LITE-DT-09', 'Reconciliation R9 handles catalogue publication failure honestly', 'Decision Table', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), faults: { results: ['throw'] } })
  await page.failed()
  const log = await page.log()
  assert.equal(log.edits.length, 1, 'no blind replay after a thrown edit')
  assert.equal((await page.state()).protectedMarker, false)
  assert.ok((await page.state()).buttons.includes(STATUS.retry))
  await assertNoCorrection(page, { opensAllowed: 0 })
  await commonUnchanged(page, main)
})

lite('LITE-ST-01', 'Make duplicate startup and catalogue notifications write-idempotent', 'State Transition', async (t, sdk) => {
  const main = await mainSentinels(t)
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), faults: { holdConfig: true } })
  await page.eval('__lite.facade.notify(), __lite.facade.notify(), __lite.facade.notify(), true')
  await page.settled()
  assert.equal((await page.log()).edits.length, 0)
  const listenersWaiting = (await page.state()).listeners
  await page.eval('__lite.facade.release(), __lite.facade.notify(), __lite.facade.notify(), true')
  await page.protected()
  await page.settled()
  const editsAfter = (await page.log()).edits
  assert.equal(new Set(editsAfter.map((edit) => edit.operation.id)).size, editsAfter.length, 'each command edited at most once')
  assert.equal(editsAfter.length, RELEVANT.length)
  assert.equal((await page.log()).maxInFlight, 1)
  await page.eval('__lite.facade.notify(), __lite.facade.notify(), true')
  await page.settled()
  assert.equal((await page.log()).edits.length, RELEVANT.length, 'repeat notifications after satisfied cause no edits')
  assert.ok((await page.state()).listeners <= Math.max(listenersWaiting, 2), 'subscriptions not duplicated')
  await commonUnchanged(page, main)
})

lite('LITE-ST-02', 'Gate late registration reload and disposal without stale writes', 'State Transition', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(['session.new']) })
  await page.protected()
  // Late relevant registration with its native default: gate holds while unsatisfied.
  await page.eval('__lite.facade.hold(), true')
  await page.eval(`__lite.register('session.search', ${JSON.stringify(NATIVE['session.search'])}), true`)
  await waitFor(() => page.eval('__lite.facade.pendingEdits() === 1'), 'late edit')
  assert.equal((await page.state()).protectedMarker, false, 'unsatisfied late command is not called protected')
  // The former gesture of the late command is stopped while unsatisfied.
  await page.eval('document.body.focus(), true')
  await page.tab.press(keyFor('KeyK', ['meta', 'alt']))
  await sleep(WAIT.pollMs * 4)
  assert.ok(!(await page.log()).handlers.includes('command:session.search'), 'former binding of unsatisfied command stopped')
  await page.eval('__lite.facade.stopHolding(), true')
  await page.protected()
  await assertMappedSafely(page, ['session.new', 'session.search'])
  // Dispose: subscriptions released; a late callback cannot write or regain readiness.
  await page.eval('__lite.disposePage(), true')
  assert.equal((await page.state()).listeners, 0, 'disposal unsubscribes')
  const editsBefore = (await page.log()).edits.length
  await page.eval(`__lite.register('workspace.add', ${JSON.stringify(NATIVE['workspace.add'])}), __lite.facade.notify(), true`)
  await page.settled()
  assert.equal((await page.log()).edits.length, editsBefore, 'no write after disposal')
  await assertNoTimers(page)
  await assertNoCorrection(page)
})

lite('LITE-ST-03', 'Reconcile concurrent child views through current revisions', 'State Transition', async (t, sdk) => {
  const main = await mainSentinels(t)
  const unrelated = { id: 'fbtest.unrelated', binding: { code: 'KeyU', modifiers: ['primary', 'alt'] } }
  const one = await scenario(t, sdk, { commands: [...commands(['session.new', 'session.search']), { id: unrelated.id, defaults: {} }], faults: { results: ['stale-by-concurrent-edit'], concurrentId: unrelated.id, concurrentBinding: unrelated.binding } })
  await one.protected()
  const two = await scenario(t, sdk, { keepStorage: true, commands: [...commands(['session.new', 'session.search']), { id: unrelated.id, defaults: {} }] })
  await two.protected()
  await two.settled()
  for (const page of [one, two]) {
    await assertMappedSafely(page, ['session.new', 'session.search'])
    assert.deepEqual(await page.binding(unrelated.id), { code: 'KeyU', modifiers: ['alt', 'meta'] }, 'unrelated concurrent preference kept')
  }
  assert.equal((await two.log()).edits.length, 0, 'second view converges without rewriting')
  await commonUnchanged(one, main)
})

lite('LITE-ST-04', 'Allow initial selection and explicit return but never corrective navigation', 'State Transition', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT) })
  await page.protected()
  assert.deepEqual((await page.calls('uiWorkspace', 'openSession')).map((call) => call.args), [[FIXTURE.manager]], 'initial selection once')
  // Allowed Plugins panel, then unreachable drift to an ordinary session.
  await page.click(STATUS.plugins)
  await page.eval(`__lite.showPanel('fbtest-other-panel'), __lite.drift(${JSON.stringify(FIXTURE.ordinary)}), true`)
  await page.settled()
  assert.equal((await page.calls('uiWorkspace', 'openSession')).length, 1, 'no corrective openSession on drift')
  assert.equal((await page.state()).protectedMarker, false, 'drifted view is not marked ready')
  await assertNoCorrection(page)
  // Explicit user return.
  await page.click(STATUS.fishball)
  await page.protected()
  const opens = await page.calls('uiWorkspace', 'openSession')
  assert.equal(opens.length, 2)
  await assertNoCorrection(page, { opensAllowed: 2 })
  // The initial openSession(manager) rejects: unavailable + Retry stays visible even after later
  // background refreshes succeed (sessions-list notification, window focus).
  const rejected = await scenario(t, sdk, { commands: commands(RELEVANT), openFails: 1 })
  await rejected.settled()
  const failedOpen = await rejected.eval('__lite.honest()')
  assert.ok(failedOpen.statuses.length > 0, 'rejected initial open shows a visible status')
  assert.ok(failedOpen.retry, 'rejected initial open offers Retry')
  await rejected.eval('__lite.notifyList(), __lite.focusWindow(), __lite.notifyList(), true')
  await rejected.settled()
  const afterRefresh = await rejected.eval('__lite.honest()')
  assert.deepEqual(afterRefresh.statuses, failedOpen.statuses, 'status unchanged by background refresh')
  assert.ok(afterRefresh.retry, 'Retry still visible after background refresh')
  assert.equal((await rejected.state()).protectedMarker, false, 'not marked ready after a rejected open')
  // Retry then selects the manager.
  assert.ok(await rejected.click(STATUS.retry))
  await rejected.protected()
  assert.ok((await rejected.calls('uiWorkspace', 'openSession')).every((call) => call.args[0] === FIXTURE.manager))
})

// ---------------------------------------------------------------------------------------------
// B3 (round-2 bug 4, requirement R4): a reopen/reload where DSH itself already shows (or restores)
// the manager made the one-time openSession(manager) reject, and the navigation kept showing
// "Fishball session unavailable" + Retry next to the manager's own conversation.
// R4: while the main view shows the manager AND the gate is protected (<html data-fishball-session>),
// the navigation (nav[aria-label="fishball-page"]) holds no role=status node and no Retry button,
// whatever openSession answered. A rejected open while the view shows another session still shows
// the status and Retry. Technique: State Transition over (open outcome, what the view shows, order),
// with a decision table over (view shows manager?, open rejected?) as the oracle:
//   shows manager | open rejected | expected nav
//   yes           | yes (early)   | no status, no Retry        (B3-ST-01, B3-EP-01)
//   yes           | yes (late)    | no status, no Retry        (B3-ST-02)
//   no            | yes           | "Fishball session unavailable" + Retry  (B3-ST-03)
//   yes (Retry)   | no            | no status, no Retry        (B3-ST-04)
// ---------------------------------------------------------------------------------------------
const B3 = Object.freeze({
  unavailable: 'Fishball session unavailable',
  retry: STATUS.retry,
  /** Host-side wait before a "nothing appears" read (harness budget, not a product oracle). */
  quietMs: WAIT.quietMs,
})
/** R4 positive oracle: protected marker set, and the nav shows no status line and no Retry. */
async function assertNoSessionStatus(page, why) {
  await page.protected()
  await sleep(B3.quietMs)
  const nav = await page.eval('__lite.navStatus()')
  assert.ok(nav, `${why}: the page navigation is rendered`)
  assert.deepEqual(nav.statuses, [], `${why}: no role=status line in the navigation (saw ${JSON.stringify(nav.statuses)})`)
  assert.equal(nav.buttons.includes(B3.retry), false, `${why}: no Retry button in the navigation (buttons ${JSON.stringify(nav.buttons)})`)
  assert.equal(nav.text.includes(B3.unavailable), false, `${why}: "${B3.unavailable}" is not shown`)
  assert.equal((await page.state()).protectedMarker, true, `${why}: the gate stays protected`)
}

lite('B3-ST-01', 'R4 rejected openSession(manager), then the main view shows the manager → no status line, no Retry', 'State Transition: open rejected → view shows manager', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), openFails: 1 })
  await page.settled()
  // Precondition: the rejection really happened (the one open was refused).
  assert.equal((await page.calls('uiWorkspace', 'openSession')).length, 1, 'precondition: the one-time open was attempted')
  await page.eval(`__lite.drift(${JSON.stringify(FIXTURE.manager)}), true`)
  await assertNoSessionStatus(page, 'view shows the manager after a rejected open')
})

lite('B3-EP-01', 'R4 reload: DSH already restored the manager in the main view and openSession(manager) rejects → no status line, no Retry', 'EP: view already shows manager partition', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), openFails: 1, restoredSession: FIXTURE.manager })
  await assertNoSessionStatus(page, 'restored manager with a rejected open')
  // R4 does not require the open when the view already shows the manager; when made, it is the one
  // allowed open of the manager (any rejection of it is the injected one).
  const opens = await page.calls('uiWorkspace', 'openSession')
  assert.ok(opens.length <= 1 && opens.every((call) => call.args[0] === FIXTURE.manager), 'at most the one open of the manager: ' + JSON.stringify(opens))
})

lite('B3-ST-02', 'R4 view shows the manager, then the pending openSession rejects late → still no status line, no Retry', 'State Transition: view shows manager → late rejection', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), holdOpen: true })
  await waitFor(async () => (await page.calls('uiWorkspace', 'openSession')).length === 1, 'the one-time open is pending')
  await page.eval(`__lite.drift(${JSON.stringify(FIXTURE.manager)}), true`)
  await page.protected()
  assert.equal(await page.eval('__lite.rejectHeldOpen()'), true, 'precondition: the held open was rejected')
  await page.settled()
  await assertNoSessionStatus(page, 'late rejection while the manager is shown')
})

lite('B3-ST-03', 'R4 rejected openSession while the main view shows ANOTHER session → "Fishball session unavailable" + Retry', 'State Transition: open rejected, view shows other session (negative partition)', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), openFails: 1, restoredSession: FIXTURE.ordinary })
  await page.settled()
  const nav = await waitFor(async () => { const n = await page.eval('__lite.navStatus()'); return n && n.statuses.some((text) => text.includes(B3.unavailable)) ? n : null }, 'session-unavailable status in the navigation')
  assert.ok(nav.buttons.includes(B3.retry), 'a Retry button in the navigation: ' + JSON.stringify(nav.buttons))
  assert.equal((await page.state()).protectedMarker, false, 'not marked protected while another session is shown')
})

lite('B3-ST-04', 'R4 rejected open → Retry → open succeeds → no status line, no Retry', 'State Transition: unavailable → Retry → shown', async (t, sdk) => {
  const page = await scenario(t, sdk, { commands: commands(RELEVANT), openFails: 1 })
  await waitFor(async () => (await page.eval('__lite.navStatus()'))?.buttons.includes(B3.retry), 'Retry offered after the rejected open')
  assert.ok(await page.click(B3.retry), 'Retry pressed')
  await assertNoSessionStatus(page, 'after a successful Retry')
  assert.ok((await page.calls('uiWorkspace', 'openSession')).every((call) => call.args[0] === FIXTURE.manager), 'Retry opens only the manager')
})

// ---------------------------------------------------------------------------------------------
// Hash continuation (contract §1) — kept as its own checks under LITE-UC-02 to preserve the case
// catalogue. Since instance-extension-points §11.8 (superseding LITE's earlier "opens native
// Settings"), `view=settings` never opens native DSH Settings: it requests Fishball's slim
// `fishball-settings` main panel, owned by fishball-core's chunk packages/core/client.settings.js.
// This harness loads only fishball-page, so here only the 0 native opens is observable; the slim
// panel opening is a todo verified in browser e2e.
// ---------------------------------------------------------------------------------------------
const HASH_CASES = Object.freeze([
  { hash: '#view=settings&lang=zh', settings: 0, locale: ['zh'] },
  { hash: '#lang=en', settings: 0, locale: [] },
  { hash: '#view=plugins&lang=fr', settings: 0, locale: [] },
  { hash: '', settings: 0, locale: [] },
])

for (const sdk of SDK_VERSIONS) {
  describe(`LITE [${sdk}]`, () => {
    for (const entry of CASES) {
      const title = `${CONTEXT.task} ${entry.id} [${sdk}] ${entry.title}`
      if (!entry.run) { test.todo(`${title} — ${entry.todo}`); continue }
      test(title, async (t) => {
        if (!sdkRuntime(sdk)) { t.skip(`SDK ${sdk} runtime not found beside FBTEST_DSH_RUNTIME`); return }
        if (entry.browser && browserSkip()) { t.skip(browserSkip()); return }
        if (COMPOSING.includes(entry.id) && !selectedSdk(sdk)) { t.skip(`profile composition for ${sdk} runs with FBTEST_DSH_RUNTIME set to that SDK`); return }
        await entry.run(t, sdk)
      })
      if (entry.todo) test.todo(`${title} — residual: ${entry.todo}`)
    }
    test(`${CONTEXT.task} LITE-UC-02 [${sdk}] hash continuation view/lang`, async (t) => {
      if (!sdkRuntime(sdk)) { t.skip(`SDK ${sdk} runtime not found`); return }
      if (browserSkip()) { t.skip(browserSkip()); return }
      for (const item of HASH_CASES) {
        const page = await scenario(t, sdk, { hash: item.hash, commands: commands(RELEVANT) })
        await page.protected()
        await page.settled()
        const log = await page.log()
        assert.equal(log.openSettings, item.settings, `${item.hash}: native Settings opens ${item.settings} time(s)`)
        assert.deepEqual(log.setLocale, item.locale, `${item.hash}: setLocale calls`)
        await page.eval('__lite.facade.notify(), true')
        await page.click(STATUS.fishball)
        await page.settled()
        assert.equal((await page.log()).openSettings, item.settings, `${item.hash}: native Settings opens ${item.settings} time(s) after the Fishball button`)
      }
    })
    test.todo(`${CONTEXT.task} LITE-UC-02 [${sdk}] hash continuation view=settings opens the slim fishball-settings panel — verified in browser e2e (superseded by SET §11.8)`)
  })
}
