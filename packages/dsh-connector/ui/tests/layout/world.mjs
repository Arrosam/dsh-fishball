/**
 * The UI-FIX-D world: real DSH processes in real Chromium tabs, so every layout row measures real CSS.
 *
 * - Connector DSH (R1, R2): the connector world of dsh-connector-test-helpers (`scenario`) with
 *   dsh-agent-connector and dsh-connector-ui installed as bundles; principals are paired through the
 *   stock MCP client (connector-world/steps.mjs), sessions are real DSH sessions, hand-overs go through
 *   the connector's own handover service. One boot per scenario per SDK file.
 * - (R3, the failed-child window, needs the dsh-instance package of another repository: withdrawn here.)
 * - The browser: one headless Chromium per file (browser.mjs); each case opens its own tab, logged in
 *   with the boot's owner cookie, and closes it.
 *
 * Navigation goes through DSH's own UI as a user does (sidebar tree, Plugins page, Fishball entry),
 * at a wide viewport; the width under test is set after the page is open (DSH keeps its view).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after } from 'node:test'
import { K1, PACKAGES, SURFACE } from 'dsh-connector-test-helpers/connector-world/constants'
import { connect, createToken, fresh, okCall, userSession } from 'dsh-connector-test-helpers/connector-world/steps'
import { scenario } from 'dsh-connector-test-helpers/connector-world/world'
import { launch } from './browser.mjs'
import { CHROME, FIXTURE, NAV, SETTINGS, WIDTH, WINDOW } from './constants.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const LINK_UI = JSON.stringify([{ name: PACKAGES.ui.name, dir: PACKAGES.ui.dir, enabled: true }])

// ------------------------------------------------------------------------------------------ browser

let browser = null
/** The file's Chromium (started once); null when none is installed. */
export async function chromium() {
  browser ??= launch()
  return browser
}
after(async () => { const b = await browser?.catch(() => null); await b?.stop() })

/** The reason a browser row cannot run here, or null. */
export async function noBrowser() {
  return (await chromium()) ? null : 'no local Chromium (set FBTEST_CHROME or install the Playwright chromium_headless_shell under ~/Library/Caches/ms-playwright): no real layout engine, so this layout row cannot run'
}

// ------------------------------------------------------------------------------------------ worlds

/** Close hooks of the pairing clients; each already swallows a failure (a DSH already stopped refuses fast). */
const clients = []
after(async () => { for (const close of clients.splice(0)) await close() })

/**
 * A connector DSH whose paired principals are `names` (one entry each, switched on, in this order).
 * `labels[i]` is entry i's label (default a fresh one). Returns `{w, principals: [{key, name, label}]}`.
 */
export function connectorWorld(sdk, label, names, labels = []) {
  return (async () => {
    const w = await scenario(sdk, FIXTURE.scenario + '-' + label, { env: { FBWIRE_LINK: LINK_UI } })
    w.layout ??= (async () => {
      const principals = []
      for (const [i, name] of names.entries()) {
        const made = await createToken(w, labels[i] ?? fresh(FIXTURE.labelBase))
        const id = fresh(FIXTURE.idBase)
        // The clients stay open for the file's life and close after it (clients below).
        const client = await connect({ after: (fn) => clients.push(fn) }, w, { id, value: made.value })
        await okCall(client, K1.TOOL.pair, { name })
        const principal = (await w.service(SURFACE.service.handover, 'principals')).value.find((p) => p.id === id)
        assert.ok(principal, 'harness: the paired entry is not among principals()')
        principals.push({ key: principal.key, name, label: labels[i] ?? null, entryKey: made.entryKey })
      }
      return principals
    })()
    return { w, principals: await w.layout }
  })()
}

/** A fresh ordinary session; handed over to `principalKey` when given. */
export async function sessionIn(w, principalKey) {
  const session = await userSession(w)
  if (principalKey) {
    const r = await w.service(SURFACE.service.handover, 'handOver', session.sessionId, principalKey)
    assert.equal(r.value?.ok, true, 'harness: hand over ' + JSON.stringify(r))
  }
  return session.sessionId
}

// ------------------------------------------------------------------------------------------ pages

/** Page-side: click the last element whose collapsed text is exactly `text` (under `scope`). */
const clickText = (text, scope = 'document') => `(() => { const el = [...${scope}.querySelectorAll('*')].filter((e) => e.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(text)}).at(-1); if (!el) return false; el.click(); return true })()`

/**
 * A logged-in tab on DSH at `origin`, at the wide width, with DSH's first-run notice dismissed.
 * `scheme` is the prefers-color-scheme (light / dark).
 */
export async function openDsh(t, origin, cookie, { scheme = SETTINGS.themes[0] } = {}) {
  const b = await chromium()
  await b.login(origin, cookie)
  const tab = await b.open(origin + '/', { width: WIDTH.wide, colorScheme: scheme })
  t.after(() => tab.close())
  await b.waitFor(tab, `document.querySelectorAll(${JSON.stringify(NAV.tree)}).length > 0`, CHROME.loadMs, 'DSH sidebar')
  // DSH's first-run notice comes up shortly after the sidebar on a fresh profile; dismiss it when it does.
  await b.waitFor(tab, `(() => { const d = [...document.querySelectorAll('[role=dialog]')].find((x) => ${NAV.findText(NAV.firstRun).replace('document', 'x')}); if (!d) return false; return ${clickText(NAV.firstRun, 'd')} })()`, CHROME.firstRunMs, 'the first-run notice').catch(() => false)
  return { tab, b }
}

/** Opens session `sessionId` from DSH's sidebar tree, and waits for the header slot to draw `ready` (a selector). */
export async function openSession(t, w, sessionId, ready) {
  const { tab, b } = await openDsh(t, w.origin, w.dsh.cookie)
  const row = `[data-row-key="${NAV.sessionKey}${sessionId}"]`
  await b.waitFor(tab, `(() => {
    if (document.querySelector('${row}')) return true
    for (const item of document.querySelectorAll('[data-row-key^="${NAV.workspaceKey}"][aria-expanded="false"]')) item.click()
    return false
  })()`, CHROME.loadMs, 'the session row in the sidebar')
  await tab.evaluate(`document.querySelector('${row}').click()`)
  await b.waitFor(tab, `!!document.querySelector('${NAV.headerSlot} ${ready}')`, CHROME.loadMs, 'the session header with ' + ready)
  return { tab, b }
}

/** Opens the connector's own settings page (Plugins → Fishball connector → its component). */
export async function openConnectorPage(t, w, scheme) {
  const { tab, b } = await openDsh(t, w.origin, w.dsh.cookie, { scheme })
  // Plugins → the connector's card → its one component (the row whose page is the settings page).
  await tab.evaluate(clickText(NAV.plugins))
  await b.waitFor(tab, clickText(NAV.connectorCard), CHROME.loadMs, 'the connector on the Plugins page')
  await b.waitFor(tab, `!!${NAV.findText(NAV.components)}`, CHROME.loadMs, 'the connector\'s components')
  await tab.evaluate(clickText(NAV.connectorCard))
  await b.waitFor(tab, `!!document.querySelector('[${SETTINGS.tokens}]')`, CHROME.loadMs, 'the connector settings page')
  return { tab, b }
}

/** Sets the viewport width and lets layout settle (a harness wait). */
export async function at(tab, width) {
  await tab.resize(width)
  await sleep(CHROME.settleMs)
}
