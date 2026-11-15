/**
 * Round-2 BUG 5 (B4) — the child page's way back to Fishball stays usable over the native Plugins
 * page and Fishball's own settings panel, in the REAL SDK web boot (both SDKs).
 *
 * Requirement (round-2 brief, with the implementer's clarifications of "Settings"):
 * on the child's native Plugins page (after the navigation's 'Plugins' button, which selects the
 * plugins panel) and with Fishball's own settings panel open (the `view=settings` continuation), the
 * navigation's 'Fishball' button is visible; it is the hit target at its centre
 * (document.elementFromPoint is the button or inside it); a real click returns to the manager
 * conversation; it is a button named 'Fishball' in the accessibility tree; it is DSH's design-system
 * Button (the primitives' button class, not default UA styling); and its box does not intersect the
 * bottom-left Settings launcher (class fishball-settings-launcher). The 'Plugins' button has the same
 * properties. While DSH's native Settings dialog is open (aria-modal, page inert by design) only the
 * no-overlap clause is asserted.
 *
 * Harness: child-boot-host.mjs boots the SDK's own `web` profile with the child rows (as
 * child-boot.test.mjs), plus two fixture rows: an empty nativeRuntime (fishball-settings needs it)
 * and child-manager-session-row.mjs, a stand-in for the manager behind api/fishball/session that
 * creates one real session through the SDK's sessionController. Headless Chromium at a fixed
 * 1280×800 viewport; first-run modals are dismissed before any hit-testing oracle.
 * The primitives' button class is read from the SDK's own built web CSS (hashed per build).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | B4-EP-01 | EP (manager view, control) | Fishball/Plugins/launcher: visible, own hit target, AX button, primitives class, no overlap |
 * | B4-ST-01 | ST manager → Plugins page | same properties on the Plugins page |
 * | B4-ST-02 | ST Plugins page → click Fishball | real click returns to the manager conversation (plugins page left, marker set) |
 * | B4-ST-03 | ST manager → Fishball settings panel (view=settings) | same properties with the panel open |
 * | B4-DT-01 | DT (native Settings dialog open) | no nav button intersects the launcher (inert page: nothing else asserted) |
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NODE, REPO, TEST_HOMES } from '../support/constants.mjs'
import { newHome } from '../support/host.mjs'
import { sleep, until } from '../support/util.mjs'
import { launchChromium, sdkRuntime } from './lite-browser.mjs'
import { SDK_VERSIONS } from './support.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(REPO, 'test', 'support', 'fixtures')

const NAV = Object.freeze({
  hostScript: path.join(HERE, 'child-boot-host.mjs'),
  pluginRoot: process.env.FBTEST_PLUGIN_DIR ? path.resolve(process.env.FBTEST_PLUGIN_DIR) : REPO,
  instancePackage: Object.freeze(['packages', 'dsh-instance']),
  connectorPackage: Object.freeze(['packages', 'dsh-connector']),
  connectorName: 'dsh-connector',
  stageSkip: Object.freeze(['node_modules', 'test']),
  stageDir: 'dsh-instance-stage',
  rowModule: (row) => ['child-web', row, 'index.js'],
  homeLabel: 'child-boot-nav',
  urlLine: /dsh web: (http\S+)/,
  tokenParam: /([?&]token=)[^\s&]+/g,
  redacted: '$1<redacted>',
  outputTailChars: 3000,
  runtimeProbe: path.join('@deepseek-ai', 'dsh', 'lib', 'profile-boot.js'),
  /** The SDK's built web shell CSS, where the primitives' Button class is defined. */
  frontendAssets: Object.freeze(['@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets']),
  cssFile: /^index-.*\.css$/,
  /** Primitives Button root rule: `._button_<hash>_<n>{...border:none...}`. */
  buttonRule: /\.(_button_[a-z0-9]+_\d+)\{[^}]*border:none/,
  viewport: Object.freeze({ width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }),
  settingsHash: '#view=settings',
})
/** modalQuietMs: first-run modals (Preview Notice, sign-in) can appear late; dismissed until none shows for this long. */
const BUDGET = Object.freeze({ hostStartMs: 90000, hostStopMs: 10000, bootSettleMs: 45000, stateMs: 15000, pollMs: 100, settleMs: 600, modalRounds: 12, modalQuietMs: 2500, caseMs: 240000 })
const ROW = Object.freeze({ page: 'fishball-page', settings: 'fishball-settings', recommend: 'fishball-recommend-plugins' })
const FIXTURE_ROWS = Object.freeze([
  Object.freeze({ id: 'fbtest-child-native-runtime', name: path.join(FIXTURES, 'child-native-runtime-row.mjs') }),
  Object.freeze({ id: 'fbtest-child-manager-session', name: path.join(FIXTURES, 'child-manager-session-row.mjs') }),
])
/** Requirement and product vocabulary (page markers of the brief; settings panel of docs/planning/v2-set.md). */
const UI = Object.freeze({
  nav: 'nav[aria-label="fishball-page"]',
  fishball: 'Fishball',
  plugins: 'Plugins',
  retry: 'Retry',
  launcher: '.fishball-settings-launcher',
  protectedAttribute: 'data-fishball-session',
  modal: '[role="dialog"][aria-modal="true"]',
  /** Root of Fishball's settings panel (docs/planning/v2-set.md "Panel"). */
  settingsPanel: '[data-fishball-settings]',
  /** The child-only RP tab on the native Plugins page (docs/plugins/instance-extension-points.md RP). */
  pluginsPageMarker: 'Fishball Recommended',
  axButtonRole: 'button',
  escape: Object.freeze({ key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }),
})
const NAV_BUTTONS = Object.freeze([UI.fishball, UI.plugins])

const redact = (text) => text.replace(NAV.tokenParam, NAV.redacted)

function primitivesButtonClass(runtime) {
  const dir = path.join(runtime, ...NAV.frontendAssets)
  for (const name of fs.readdirSync(dir).filter((file) => NAV.cssFile.test(file))) {
    const match = NAV.buttonRule.exec(fs.readFileSync(path.join(dir, name), 'utf8'))
    if (match) return match[1]
  }
  return null
}

function stageInstance(home) {
  const source = path.join(NAV.pluginRoot, ...NAV.instancePackage)
  const stage = path.join(home, NAV.stageDir)
  fs.cpSync(source, stage, { recursive: true, filter: (from) => !NAV.stageSkip.includes(path.relative(source, from).split(path.sep)[0]) })
  // R-EMBED (4): the instance ships its status line in src/child-settings/ itself; no client copy.
  fs.mkdirSync(path.join(stage, 'node_modules'), { recursive: true })
  fs.symlinkSync(path.join(NAV.pluginRoot, ...NAV.connectorPackage), path.join(stage, 'node_modules', NAV.connectorName))
  return stage
}
const stageRow = (stage, id) => ({ id, name: path.join(stage, ...NAV.rowModule(id)) })
const rowsFor = (stage) => [...FIXTURE_ROWS, { ...stageRow(stage, ROW.page), required: true }, stageRow(stage, ROW.settings), stageRow(stage, ROW.recommend)]

async function startHost(runtime, home, rows) {
  const child = spawn(NODE, [NAV.hostScript], {
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', DSH_HOME: home,
      ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
      DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1', FBTEST_CHILD_RUNTIME: runtime, FBTEST_CHILD_ROWS: JSON.stringify(rows),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let output = ''
  let exited = null
  for (const stream of [child.stdout, child.stderr]) stream.setEncoding('utf8').on('data', (d) => { output += d })
  child.on('exit', (code, signal) => { exited = { code, signal } })
  const stop = async () => {
    if (exited) return
    const gone = new Promise((resolve) => child.once('exit', resolve))
    child.stdin.end()
    const forced = setTimeout(() => { if (!exited) child.kill('SIGKILL') }, BUDGET.hostStopMs)
    await gone
    clearTimeout(forced)
  }
  const line = await until(() => exited || NAV.urlLine.exec(output), BUDGET.hostStartMs, BUDGET.pollMs)
  if (!line || exited) { await stop(); throw new Error('child DSH host did not start:\n' + redact(output.slice(-NAV.outputTailChars))) }
  return { url: line[1], stop }
}

/** Geometry, hit-testing and styling of one nav button / the launcher, read in the page. */
const PROBE = `(() => {
  const nav = document.querySelector(${JSON.stringify(UI.nav)});
  const launcher = document.querySelector(${JSON.stringify(UI.launcher)});
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } };
  const read = (el) => {
    if (!el) return null;
    const b = box(el);
    const hit = b.w > 0 && b.h > 0 ? document.elementFromPoint(b.cx, b.cy) : null;
    const style = getComputedStyle(el);
    return { box: b, visible: el.checkVisibility({ visibilityProperty: true, opacityProperty: true }), hit: hit !== null && (hit === el || el.contains(hit)), hitTag: hit ? hit.tagName + '.' + hit.className : null, classes: [...el.classList], borderTop: style.borderTopWidth, tag: el.tagName };
  };
  const buttons = nav ? [...nav.querySelectorAll('button')] : [];
  const byText = (text) => buttons.find((b) => b.textContent.trim() === text) ?? null;
  return {
    protected: document.documentElement.hasAttribute(${JSON.stringify(UI.protectedAttribute)}),
    modals: document.querySelectorAll(${JSON.stringify(UI.modal)}).length,
    navText: nav ? nav.innerText : null,
    pluginsPage: document.body.innerText.includes(${JSON.stringify(UI.pluginsPageMarker)}),
    settingsPanel: document.querySelector(${JSON.stringify(UI.settingsPanel)}) !== null,
    buttons: Object.fromEntries(${JSON.stringify(NAV_BUTTONS)}.map((t) => [t, read(byText(t))])),
    launcher: read(launcher),
  };
})()`
const DISMISS_ONE_MODAL = `(() => { const d = document.querySelector(${JSON.stringify(UI.modal)}); if (!d) return null; const b = [...d.querySelectorAll('button')]; const pick = b.find((x) => /close|关闭/i.test(x.getAttribute('aria-label') ?? '')) ?? b.at(-1); const label = (pick?.getAttribute('aria-label') || pick?.textContent || '').trim(); pick?.click(); return label || '(no button)'; })()`
const CLICK_NAV = (text) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(UI.nav + ' button')})].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); b?.click(); return Boolean(b) })()`

async function openTab(devtools, url) {
  const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
  await devtools.send('Emulation.setDeviceMetricsOverride', NAV.viewport, sessionId)
  const evaluate = async (expression) => {
    const answer = await devtools.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (answer.exceptionDetails) throw new Error('page evaluation failed: ' + (answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text))
    return answer.result.value
  }
  const tab = {
    evaluate,
    probe: () => evaluate(PROBE),
    navigate: (target) => devtools.send('Page.navigate', { url: target }, sessionId),
    async click(x, y) { for (const type of ['mousePressed', 'mouseReleased']) await devtools.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sessionId) },
    async press(key) { for (const type of ['rawKeyDown', 'keyUp']) await devtools.send('Input.dispatchKeyEvent', { type, ...key, nativeVirtualKeyCode: key.windowsVirtualKeyCode }, sessionId) },
    /** Names of the role=button nodes in the page's accessibility tree. */
    async axButtons() {
      const { nodes } = await devtools.send('Accessibility.getFullAXTree', {}, sessionId)
      return nodes.filter((node) => !node.ignored && node.role?.value === UI.axButtonRole).map((node) => String(node.name?.value ?? '').trim())
    },
    close: () => devtools.send('Target.closeTarget', { targetId }).catch(() => {}),
  }
  await tab.navigate(url)
  return tab
}

/** Dismiss first-run modals until none has shown for BUDGET.modalQuietMs; returns the clicked labels. */
async function dismissModals(tab) {
  const dismissed = []
  let quietSince = Date.now()
  for (let round = 0; round < BUDGET.modalRounds; ) {
    const label = await tab.evaluate(DISMISS_ONE_MODAL)
    if (label !== null) { dismissed.push(label); round++; quietSince = Date.now() }
    else if (Date.now() - quietSince >= BUDGET.modalQuietMs) break
    await sleep(label !== null ? BUDGET.settleMs : BUDGET.pollMs)
  }
  return dismissed
}

/** Bring the page to the manager view: dismiss first-run modals; Retry once if the first open failed. */
async function managerView(tab) {
  const ready = await until(async () => (await tab.evaluate(`document.querySelector(${JSON.stringify(UI.nav)}) !== null`).catch(() => false)), BUDGET.bootSettleMs, BUDGET.pollMs)
  assert.ok(ready, 'precondition: the fishball-page navigation rendered')
  const dismissed = await dismissModals(tab)
  let state = await tab.probe()
  assert.equal(state.modals, 0, 'precondition: every first-run modal dismissed (clicked ' + JSON.stringify(dismissed) + ')')
  if (!state.protected && state.navText?.includes(UI.retry)) await tab.evaluate(CLICK_NAV(UI.retry))
  const shown = await until(async () => { state = await tab.probe(); return state.protected }, BUDGET.stateMs, BUDGET.pollMs)
  assert.ok(shown, 'precondition: the manager conversation is shown (protected marker); nav ' + JSON.stringify(state.navText))
  return state
}

/** The requirement's properties for each nav button plus the launcher non-overlap, in one state. */
async function assertNavUsable(tab, buttonClass, why) {
  await sleep(BUDGET.settleMs)
  const state = await tab.probe()
  const ax = await tab.axButtons()
  assert.ok(state.launcher, why + ': the Settings launcher is present')
  for (const text of NAV_BUTTONS) {
    const button = state.buttons[text]
    assert.ok(button, `${why}: the nav has a "${text}" button (nav ${JSON.stringify(state.navText)})`)
    assert.equal(button.visible, true, `${why}: "${text}" is visible`)
    assert.ok(button.box.w > 0 && button.box.h > 0, `${why}: "${text}" has a box`)
    assert.equal(button.hit, true, `${why}: "${text}" is the hit target at its centre (hit ${button.hitTag})`)
    assert.ok(ax.includes(text), `${why}: a button named "${text}" in the accessibility tree (saw ${JSON.stringify(ax)})`)
    assert.ok(button.classes.includes(buttonClass), `${why}: "${text}" carries the primitives' button class ${buttonClass} (classes ${JSON.stringify(button.classes)})`)
    assert.equal(button.borderTop, '0px', `${why}: "${text}" is not UA-styled (primitives border:none)`)
    assertDisjoint(button.box, state.launcher.box, `${why}: "${text}" and the Settings launcher`)
  }
  assert.equal(state.launcher.hit, true, `${why}: the Settings launcher is the hit target at its centre (hit ${state.launcher.hitTag})`)
  return state
}
function assertDisjoint(a, b, why) {
  const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
  assert.ok(apart, why + ' do not intersect: ' + JSON.stringify({ a, b }))
}

let browser = null
let browserError = null
const cleanups = []
before(async () => { try { browser = await launchChromium() } catch (error) { browserError = error } })
after(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => {})
  await browser?.stop()
})

function skipReason(sdk) {
  if (!process.env.FBTEST_DSH_RUNTIME) return 'FBTEST_DSH_RUNTIME is not set (no SDK to boot)'
  const runtime = sdkRuntime(sdk)
  if (!runtime || !fs.existsSync(path.join(runtime, NAV.runtimeProbe))) return `SDK ${sdk} runtime not found beside FBTEST_DSH_RUNTIME`
  if (browserError) return 'headless Chromium could not start: ' + browserError.message
  if (!browser) return 'no local headless Chromium (FBTEST_CHROME or the Playwright headless shell)'
  return null
}

/** One host per SDK, shared by its cases (they run in order inside the describe). */
const hosts = new Map()
function hostFor(sdk) {
  if (!hosts.has(sdk)) {
    hosts.set(sdk, (async () => {
      const home = newHome(NAV.homeLabel)
      cleanups.push(async () => { if (path.dirname(home) === TEST_HOMES) fs.rmSync(home, { recursive: true, force: true }) })
      const host = await startHost(sdkRuntime(sdk), home, rowsFor(stageInstance(home)))
      cleanups.push(host.stop)
      return host
    })())
  }
  return hosts.get(sdk)
}

for (const sdk of SDK_VERSIONS) {
  describe(`B4 [${sdk}] the Fishball way back in the real SDK web boot`, () => {
    const navCase = (id, title, technique, body) => test(`${id} [${sdk}] ${title} (${technique})`, { timeout: BUDGET.caseMs }, async (t) => {
      const reason = skipReason(sdk)
      if (reason) { t.skip(reason); return }
      const buttonClass = primitivesButtonClass(sdkRuntime(sdk))
      assert.ok(buttonClass, 'precondition: the SDK web CSS defines the primitives Button class')
      const host = await hostFor(sdk)
      const tab = await openTab(browser.devtools, host.url)
      t.after(() => tab.close())
      await body({ t, tab, host, buttonClass })
    })

    navCase('B4-EP-01', 'manager view: Fishball and Plugins usable, DSH-styled, clear of the Settings launcher', 'EP: manager-view partition (control)', async ({ tab, buttonClass }) => {
      await managerView(tab)
      await assertNavUsable(tab, buttonClass, 'manager view')
    })

    navCase('B4-ST-01/02', 'Plugins page: buttons usable; a real click on Fishball returns to the manager conversation', 'State Transition: manager → Plugins page → Fishball', async ({ tab, buttonClass }) => {
      const start = await managerView(tab)
      const plugins = start.buttons[UI.plugins]
      assert.ok(plugins, 'a Plugins button')
      await tab.click(plugins.box.cx, plugins.box.cy)
      const onPlugins = await until(async () => (await tab.probe()).pluginsPage, BUDGET.stateMs, BUDGET.pollMs)
      assert.ok(onPlugins, `precondition: the native Plugins page is shown ("${UI.pluginsPageMarker}" tab)`)
      const state = await assertNavUsable(tab, buttonClass, 'B4-ST-01 Plugins page')
      // B4-ST-02: a real (trusted) click at the Fishball button's centre.
      await tab.click(state.buttons[UI.fishball].box.cx, state.buttons[UI.fishball].box.cy)
      let back
      const returned = await until(async () => { back = await tab.probe(); return back.protected && !back.pluginsPage }, BUDGET.stateMs, BUDGET.pollMs)
      assert.ok(returned, 'B4-ST-02: the click returns to the manager conversation (Plugins page left, marker set): ' + JSON.stringify({ protected: back?.protected, pluginsPage: back?.pluginsPage }))
    })

    navCase('B4-ST-03', "Fishball's settings panel open (view=settings): buttons usable and clear of the launcher", 'State Transition: load with view=settings → settings panel', async ({ t, tab: first, host, buttonClass }) => {
      let tab = first
      // A fresh document with the continuation (a hash-only navigation would not reload the page).
      const settingsTab = await openTab(browser.devtools, new URL(host.url).origin + '/' + NAV.settingsHash)
      t.after(() => settingsTab.close())
      await tab.close()
      tab = settingsTab
      await managerView(tab)
      let panelState
      const open = await until(async () => { panelState = await tab.probe(); return panelState.settingsPanel }, BUDGET.stateMs, BUDGET.pollMs)
      assert.ok(open, "precondition: Fishball's settings panel is open: " + JSON.stringify({ modals: panelState?.modals, protected: panelState?.protected, url: await tab.evaluate('location.pathname + location.hash') }))
      const state = await assertNavUsable(tab, buttonClass, 'B4-ST-03 settings panel')
      await tab.click(state.buttons[UI.fishball].box.cx, state.buttons[UI.fishball].box.cy)
      const returned = await until(async () => (await tab.probe()).protected, BUDGET.stateMs, BUDGET.pollMs)
      assert.ok(returned, 'a real click on Fishball returns to the manager conversation')
    })

    navCase('B4-DT-01', 'native Settings dialog open: no nav button intersects the Settings launcher', 'Decision Table: modal open → only the geometry clause', async ({ tab }) => {
      await managerView(tab)
      await dismissModals(tab)
      const start = await tab.probe()
      assert.equal(start.modals, 0, 'precondition: no modal before the launcher click')
      assert.equal(start.launcher.hit, true, 'precondition: the launcher is the hit target before the click (hit ' + start.launcher.hitTag + ')')
      await tab.click(start.launcher.box.cx, start.launcher.box.cy)
      const opened = await until(async () => (await tab.probe()).modals > 0, BUDGET.stateMs, BUDGET.pollMs)
      assert.ok(opened, 'precondition: a real click on the Settings launcher opens the native Settings dialog: ' + JSON.stringify({ launcher: start.launcher, now: (await tab.probe()).launcher }))
      const state = await tab.probe()
      for (const text of NAV_BUTTONS) {
        assert.ok(state.buttons[text], `the "${text}" button still exists`)
        assertDisjoint(state.buttons[text].box, state.launcher.box, `"${text}" and the Settings launcher`)
      }
      await tab.press(UI.escape)
    })
  })
}
