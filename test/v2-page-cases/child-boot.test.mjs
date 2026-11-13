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
 *   checkout; default this repo), with fishball-connector linked beside it (since R-EMBED the
 *   instance ships its status line in src/child-settings/ itself, so no client file is copied).
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
import path from 'node:path'
import { describe, test } from 'node:test'
import { sleep, until } from '../support/util.mjs'
import { FIXTURES, ROW, childBootEnvironment, openDevtoolsTab, pageRow, stageInstance, stageRow, startHost } from './child-boot-support.mjs'
import { sdkRuntime } from './lite-browser.mjs'
import { SDK_VERSIONS } from './support.mjs'

const CHILD_BOOT_SUITE = Object.freeze({ homeLabel: 'child-boot' })

/** Harness budgets (host-side waiting only; none of them is a product oracle). */
const BUDGET = Object.freeze({
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
  const messages = []
  const tab = await openDevtoolsTab(devtools, url, { onEvent: (event) => { const message = messageText(event); if (message) messages.push(message) } })
  try {
    const read = () => tab.evaluate(STATE_EXPRESSION)
    // Settled: the application mounted, or the native boot screen reports its failure.
    const settled = await until(async () => { const s = await read().catch(() => null); return s && (s.mounted || failed(s)) ? s : null }, BUDGET.bootSettleMs, BUDGET.pollMs)
    const settledAt = messages.length
    await sleep(BUDGET.observeAfterBootMs)
    return { settled: settled ?? null, final: await read(), messages: [...messages], afterSettle: messages.slice(settledAt) }
  } finally {
    await tab.close()
  }
}

// ---------------------------------------------------------------------------------------------
// Shared environment: one Chromium; one observation per (SDK, scenario), memoized
// ---------------------------------------------------------------------------------------------
const { browser, skipReason, cleanups, ownHome } = childBootEnvironment()
const observations = new Map()

function observe(sdk, scenario) {
  const key = sdk + '/' + scenario.key
  if (!observations.has(key)) {
    observations.set(key, (async () => {
      const home = ownHome(CHILD_BOOT_SUITE.homeLabel + '-' + scenario.key)
      const host = await startHost(sdkRuntime(sdk), home, scenario.rows(stageInstance(home)))
      cleanups.push(host.stop)
      try {
        return { ...(await observeInBrowser(browser().devtools, host.url)), hostTail: host.tail }
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
