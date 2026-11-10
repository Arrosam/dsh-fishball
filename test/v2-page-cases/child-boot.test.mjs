/**
 * CHILD-BOOT: the Fishball child page boots in the REAL SDK web runtime (regression for
 * "Failed to load plugins / web boot: 1 entry did not activate / fishball-page: failed" with
 * dozens of `cannot get required service "…" in inactive context` errors, seen in Chrome).
 *
 * Black box. Nothing here reads or fakes the product's client code or the SDK client context:
 * - child-boot-host.mjs boots the selected SDK's own `web` profile (profile-boot runProfile) on a
 *   throwaway home, with an overlay that appends the child-web rows after the native rows, as the
 *   instance's launch overlay does. DSH's native web boot then serves each row's browser half.
 * - The rows load from a staged copy of `<plugin>/packages/instance` (FBTEST_PLUGIN_DIR picks the
 *   checkout; default this repo), with `fishball-settings/client.instance.js` copied from the
 *   instance's client.js the way the product's install does, and fishball-connector linked beside it.
 * - A headless Chromium opens DSH's own URL over DevTools and records every console call and
 *   uncaught exception of that tab.
 *
 * Oracles come from the requirements only: R1 boot completes and mounts; R2 the documented page
 * markers; R3 no inactive-context / locale-subscriber errors; R4 a forced real setup failure leaves
 * nothing of the page running. Techniques: EP over the row sets (native only, page only, all three
 * Fishball rows), a decision table over (rows × forced refusal), and the state transition
 * setup → failed → disposed for R4.
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

const CHILD_BOOT = Object.freeze({
  hostScript: path.join(HERE, 'child-boot-host.mjs'),
  /** Checkout whose packages/instance and packages/connector are booted (baseline runs). */
  pluginRoot: process.env.FBTEST_PLUGIN_DIR ? path.resolve(process.env.FBTEST_PLUGIN_DIR) : REPO,
  instancePackage: Object.freeze(['packages', 'instance']),
  connectorPackage: Object.freeze(['packages', 'connector']),
  connectorName: 'fishball-connector',
  /** Not part of a shipped snapshot; never copied into the stage. */
  stageSkip: Object.freeze(['node_modules', 'test']),
  stageDir: 'fishball-instance-stage',
  instanceClient: 'client.js',
  settingsChunk: Object.freeze(['child-web', 'fishball-settings', 'client.instance.js']),
  rowModule: (row) => ['child-web', row, 'index.js'],
  homeLabel: 'child-boot',
  urlLine: /dsh web: (http\S+)/,
  /** Redacts the admission token from any host output a failure message may quote. */
  tokenParam: /([?&]token=)[^\s&]+/g,
  redacted: '$1<redacted>',
  outputTailChars: 3000,
  runtimeProbe: path.join('@deepseek-ai', 'dsh', 'lib', 'profile-boot.js'),
})

/** Harness budgets (host-side waiting only; none of them is a product oracle). */
const BUDGET = Object.freeze({
  hostStartMs: 90000,
  hostStopMs: 10000,
  /** DSH's first page load builds and serves every client bundle of the profile. */
  bootSettleMs: 45000,
  pollMs: 100,
  /**
   * R3/R4 observation window: how long the tab keeps being watched after the boot settled. The bug
   * kept producing locale/layout errors on every locale or layout notification after the failed
   * setup; a few seconds covers the boot's own follow-up notifications. Harness budget only.
   */
  observeAfterBootMs: 5000,
  caseMs: 180000,
})

/** Vocabulary of the requirement and of the SDK's native web boot (both SDKs). */
const NATIVE_BOOT = Object.freeze({
  bootScreen: '[data-dsh-boot]',
  failureTitle: 'Failed to load plugins',
  notActivated: 'did not activate',
  /** RootOutlet's anchor: present only once DSH mounted the application. */
  mounted: '[data-slot="root"]',
  overlaySlot: '[data-slot="shell.overlay"]',
})
const PAGE_MARKERS = Object.freeze({
  htmlAttribute: 'data-fishball-page',
  nav: 'nav[aria-label="fishball-page"]',
  navClass: 'fishball-page-navigation',
  button: 'Fishball',
})
/** Error texts that mean something kept running against a context that is no longer active. */
const INACTIVE_PATTERNS = Object.freeze(['in inactive context', 'locale subscriber crashed'])
const FAILED_ENTRY = (id) => `${id}: failed`

const ROW = Object.freeze({ page: 'fishball-page', settings: 'fishball-settings', recommend: 'fishball-recommend-plugins' })
/**
 * fishball-settings' Node half needs `nativeRuntime`, which only the instance's native child rows
 * provide (they need a main DSH to attach to). This fixture row provides an empty one so the row
 * can activate; see the fixture's comment for what that leaves unobserved.
 */
const NATIVE_RUNTIME_ROW = Object.freeze({ id: 'fbtest-child-native-runtime', name: path.join(FIXTURES, 'child-native-runtime-row.mjs') })
/** R4 trigger: takes fishball-page's shell.overlay entry id at the same priority first, a native refusal (fixture comment). */
const SLOT_OCCUPANT_ROW = Object.freeze({ id: 'fbtest-slot-occupant', name: path.join(FIXTURES, 'fbtest-slot-occupant', 'index.js') })

/** The equivalence partitions of the child's row set (decision table rows). */
const SCENARIO = Object.freeze({
  native: Object.freeze({ key: 'native', rows: (stage) => [] }),
  pageOnly: Object.freeze({ key: 'page-only', rows: (stage) => [pageRow(stage)] }),
  fishball: Object.freeze({ key: 'fishball', rows: (stage) => [NATIVE_RUNTIME_ROW, pageRow(stage), stageRow(stage, ROW.settings), stageRow(stage, ROW.recommend)] }),
  refused: Object.freeze({ key: 'refused', rows: (stage) => [SLOT_OCCUPANT_ROW, pageRow(stage)] }),
})

const stageRow = (stage, id) => ({ id, name: path.join(stage, ...CHILD_BOOT.rowModule(id)) })
/** The launch overlay marks fishball-page required (product fact). */
const pageRow = (stage) => ({ ...stageRow(stage, ROW.page), required: true })

const redact = (text) => text.replace(CHILD_BOOT.tokenParam, CHILD_BOOT.redacted)

// ---------------------------------------------------------------------------------------------
// Stage: the shipped instance files with the install-time chunk, outside every checkout
// ---------------------------------------------------------------------------------------------
function stageInstance(home) {
  const source = path.join(CHILD_BOOT.pluginRoot, ...CHILD_BOOT.instancePackage)
  const stage = path.join(home, CHILD_BOOT.stageDir)
  fs.cpSync(source, stage, { recursive: true, filter: (from) => !CHILD_BOOT.stageSkip.includes(path.relative(source, from).split(path.sep)[0]) })
  // The product copies the instance's client.js next to the settings client at install time.
  fs.copyFileSync(path.join(source, CHILD_BOOT.instanceClient), path.join(stage, ...CHILD_BOOT.settingsChunk))
  // The instance imports fishball-connector/contract; in an install it is a sibling package.
  fs.mkdirSync(path.join(stage, 'node_modules'), { recursive: true })
  fs.symlinkSync(path.join(CHILD_BOOT.pluginRoot, ...CHILD_BOOT.connectorPackage), path.join(stage, 'node_modules', CHILD_BOOT.connectorName))
  return stage
}

// ---------------------------------------------------------------------------------------------
// One real DSH web host per (SDK, scenario)
// ---------------------------------------------------------------------------------------------
async function startHost(runtime, home, rows) {
  const child = spawn(NODE, [CHILD_BOOT.hostScript], {
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', DSH_HOME: home,
      ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
      DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1',
      FBTEST_CHILD_RUNTIME: runtime, FBTEST_CHILD_ROWS: JSON.stringify(rows),
    },
    // stdin is a pipe that is never written: DSH's launcher shuts down on stdin EOF.
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
  const line = await until(() => exited || CHILD_BOOT.urlLine.exec(output), BUDGET.hostStartMs, BUDGET.pollMs)
  if (!line || exited) {
    await stop()
    throw new Error('child DSH host did not start (exit ' + JSON.stringify(exited) + '):\n' + redact(output.slice(-CHILD_BOOT.outputTailChars)))
  }
  return { url: line[1], stop, tail: () => redact(output.slice(-CHILD_BOOT.outputTailChars)) }
}

// ---------------------------------------------------------------------------------------------
// The browser tab: console/exception capture and DOM observation
// ---------------------------------------------------------------------------------------------
const STATE_EXPRESSION = `(() => {
  const boot = document.querySelector(${JSON.stringify(NATIVE_BOOT.bootScreen)});
  const nav = document.querySelector(${JSON.stringify(PAGE_MARKERS.nav)});
  return {
    bootText: boot ? boot.innerText : null,
    mounted: document.querySelector(${JSON.stringify(NATIVE_BOOT.mounted)}) !== null,
    pageAttribute: document.documentElement.hasAttribute(${JSON.stringify(PAGE_MARKERS.htmlAttribute)}),
    nav: nav ? {
      classes: [...nav.classList],
      buttons: [...nav.querySelectorAll('button')].map((b) => b.textContent.trim()),
      inOverlay: nav.closest(${JSON.stringify(NATIVE_BOOT.overlaySlot)}) !== null,
    } : null,
  };
})()`

const failed = (state) => Boolean(state?.bootText?.includes(NATIVE_BOOT.failureTitle))

function messageText(event) {
  if (event.method === 'Runtime.consoleAPICalled') return { kind: 'console.' + event.params.type, text: event.params.args.map((a) => a.value ?? a.description ?? '').join(' ') }
  if (event.method === 'Runtime.exceptionThrown') {
    const details = event.params.exceptionDetails
    return { kind: 'exception', text: details.exception?.description ?? details.text }
  }
  return null
}

async function observeInBrowser(devtools, url) {
  const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
  const messages = []
  const off = devtools.onEvent((event) => {
    if (event.sessionId !== sessionId) return
    const message = messageText(event)
    if (message) messages.push(message)
  })
  try {
    await devtools.send('Runtime.enable', {}, sessionId)
    await devtools.send('Page.navigate', { url }, sessionId)
    const read = async () => (await devtools.send('Runtime.evaluate', { expression: STATE_EXPRESSION, returnByValue: true }, sessionId)).result?.value
    // Settled: the application mounted, or the native boot screen reports its failure.
    const settled = await until(async () => { const s = await read().catch(() => null); return s && (s.mounted || failed(s)) ? s : null }, BUDGET.bootSettleMs, BUDGET.pollMs)
    const settledAt = messages.length
    await sleep(BUDGET.observeAfterBootMs)
    return { settled: settled ?? null, final: await read(), messages: [...messages], afterSettle: messages.slice(settledAt) }
  } finally {
    off()
    await devtools.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

// ---------------------------------------------------------------------------------------------
// Shared environment: one Chromium; one observation per (SDK, scenario), memoized
// ---------------------------------------------------------------------------------------------
let browser = null
let browserError = null
const observations = new Map()
const cleanups = []

before(async () => {
  try { browser = await launchChromium() } catch (error) { browserError = error }
})
after(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => {})
  await browser?.stop()
})

function skipReason(sdk) {
  if (!process.env.FBTEST_DSH_RUNTIME) return 'FBTEST_DSH_RUNTIME is not set (no SDK to boot)'
  const runtime = sdkRuntime(sdk)
  if (!runtime || !fs.existsSync(path.join(runtime, CHILD_BOOT.runtimeProbe))) return `SDK ${sdk} runtime not found beside FBTEST_DSH_RUNTIME`
  if (browserError) return 'headless Chromium could not start: ' + browserError.message
  if (!browser) return 'no local headless Chromium (FBTEST_CHROME or the Playwright headless shell)'
  return null
}

function observe(sdk, scenario) {
  const key = sdk + '/' + scenario.key
  if (!observations.has(key)) {
    observations.set(key, (async () => {
      const home = newHome(CHILD_BOOT.homeLabel + '-' + scenario.key)
      // Remove only the home this suite created under the test-homes root.
      cleanups.push(async () => { if (path.dirname(home) === TEST_HOMES) fs.rmSync(home, { recursive: true, force: true }) })
      const host = await startHost(sdkRuntime(sdk), home, scenario.rows(stageInstance(home)))
      cleanups.push(host.stop)
      try {
        return { ...(await observeInBrowser(browser.devtools, host.url)), hostTail: host.tail }
      } finally {
        await host.stop()
      }
    })())
  }
  return observations.get(key)
}

/** Every recorded console call / exception whose text contains one of the patterns. */
const matching = (messages, patterns) => messages.filter((m) => patterns.some((p) => m.text.includes(p)))
const summary = (messages) => {
  const counts = new Map()
  for (const m of messages) { const line = m.kind + ': ' + m.text.split('\n')[0]; counts.set(line, (counts.get(line) ?? 0) + 1) }
  return [...counts].map(([line, n]) => `[${n}x] ${line}`).join('\n')
}

// ---------------------------------------------------------------------------------------------
// Assertions shared by the boot partitions (R1, R2, R3)
// ---------------------------------------------------------------------------------------------
function assertBootCompletes(o) {
  assert.ok(o.settled, `web boot neither mounted nor failed within ${BUDGET.bootSettleMs} ms`)
  assert.equal(failed(o.final), false, 'native boot failure screen shown: ' + JSON.stringify(o.final?.bootText))
  const notActivated = matching(o.messages.filter((m) => m.kind !== 'console.log'), [NATIVE_BOOT.notActivated])
  assert.deepEqual(notActivated.map((m) => m.text), [], 'console reports entries that did not activate')
  assert.equal(o.final.mounted, true, 'the application mounted (root slot rendered)')
}
function assertPageMarkers(o) {
  assert.equal(o.final.pageAttribute, true, `<html> has ${PAGE_MARKERS.htmlAttribute}`)
  assert.ok(o.final.nav, `${PAGE_MARKERS.nav} is rendered`)
  assert.ok(o.final.nav.classes.includes(PAGE_MARKERS.navClass), `the nav has class ${PAGE_MARKERS.navClass}`)
  assert.ok(o.final.nav.buttons.includes(PAGE_MARKERS.button), `the nav holds a "${PAGE_MARKERS.button}" button (saw ${JSON.stringify(o.final.nav.buttons)})`)
  assert.equal(o.final.nav.inOverlay, true, 'the nav is rendered inside the shell overlay slot')
}
function assertNoInactiveErrors(messages, when) {
  const bad = matching(messages, INACTIVE_PATTERNS)
  assert.equal(bad.length, 0, `${bad.length} inactive-context errors ${when}:\n${summary(bad)}`)
}

// ---------------------------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------------------------
function childCase(id, sdk, title, technique, body) {
  test(`${id} [${sdk}] ${title} (${technique})`, { timeout: BUDGET.caseMs }, async (t) => {
    const reason = skipReason(sdk)
    if (reason) { t.skip(reason); return }
    await body(t)
  })
}

for (const sdk of SDK_VERSIONS) {
  describe(`CHILD-BOOT [${sdk}] Fishball child page in the real SDK web boot`, () => {
    childCase('CHILD-BOOT-01', sdk, 'control: the native web profile without Fishball rows boots clean', 'EP: native partition', async () => {
      // Guards the oracles: the SDK itself mounts and logs no inactive-context errors here, so a
      // failure in the Fishball partitions is caused by the Fishball rows.
      const o = await observe(sdk, SCENARIO.native)
      assertBootCompletes(o)
      assertNoInactiveErrors(o.messages, 'in the native profile')
      assert.equal(o.final.pageAttribute, false, 'no Fishball page marker without the Fishball rows')
    })

    childCase('CHILD-BOOT-02', sdk, 'R1: with all three Fishball rows, web boot completes and the application mounts', 'EP: full Fishball row set', async () => {
      assertBootCompletes(await observe(sdk, SCENARIO.fishball))
    })

    childCase('CHILD-BOOT-03', sdk, 'R2: fishball-page activates and renders its documented markers', 'EP: full Fishball row set', async () => {
      const o = await observe(sdk, SCENARIO.fishball)
      assert.equal(failed(o.final), false, 'boot failed: ' + JSON.stringify(o.final?.bootText))
      assertPageMarkers(o)
    })

    childCase('CHILD-BOOT-04', sdk, `R3: no inactive-context or locale-subscriber error during boot and ${BUDGET.observeAfterBootMs} ms after`, 'EP: full Fishball row set', async () => {
      const o = await observe(sdk, SCENARIO.fishball)
      assertNoInactiveErrors(o.messages, 'during boot and the observation window')
    })

    childCase('CHILD-BOOT-05', sdk, 'R1–R3 with fishball-page as the only Fishball row (smallest row set)', 'BVA: minimum row set', async () => {
      const o = await observe(sdk, SCENARIO.pageOnly)
      assertBootCompletes(o)
      assertPageMarkers(o)
      assertNoInactiveErrors(o.messages, 'with fishball-page alone')
    })

    childCase('CHILD-BOOT-06', sdk, 'R4: a real setup failure (its shell.overlay entry id already taken at the same priority) leaves nothing of the page running', 'State transition: setup → failed → disposed', async () => {
      const o = await observe(sdk, SCENARIO.refused)
      // Precondition: the forced refusal really hit fishball-page (the native boot names it failed),
      // and the occupying fixture itself activated. Otherwise the trigger did not happen.
      assert.ok(o.settled, `web boot neither mounted nor failed within ${BUDGET.bootSettleMs} ms`)
      assert.ok(o.final.bootText?.includes(FAILED_ENTRY(ROW.page)), 'precondition: native boot reports fishball-page failed; boot screen: ' + JSON.stringify(o.final.bootText))
      assert.equal(o.final.bootText.includes(FAILED_ENTRY(SLOT_OCCUPANT_ROW.id)), false, 'precondition: the occupying fixture activated')
      // Disposed: nothing the failed setup mounted keeps running or stays applied.
      assertNoInactiveErrors(o.afterSettle, `in the ${BUDGET.observeAfterBootMs} ms after the failed setup`)
      assertNoInactiveErrors(o.messages, 'at any time of the failed boot')
      assert.equal(o.final.pageAttribute, false, `<html> does not keep ${PAGE_MARKERS.htmlAttribute} after the failed setup`)
      assert.equal(o.final.nav, null, 'no fishball-page navigation stays rendered after the failed setup')
    })
  })
}
