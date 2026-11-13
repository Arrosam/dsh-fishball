/**
 * V3-S6 scenario E (browser): reboot an installed standalone home (S6_HOME) with an empty owner
 * patch and load its own web UI in headless Chromium. Checks that core's ONE dsh.client module
 * applies and registers the page overlay, the recommended tab and the settings panel slots, and
 * that the guarded native UI modules are not in the served graph. Playwright is imported read-only
 * from another local checkout (none is installed here). Env: SDK, S6_HOME, S6_LABEL.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, isolateHome, profilePatchPath, REAL_HOME, record, until } from './harness.mjs'

const PLAYWRIGHT = '/Volumes/SSD1/GitHub/graph-memory/node_modules/playwright-core/index.mjs'
/** The already-installed headless shell; the isolated HOME hides Playwright's default cache. */
const HEADLESS_SHELL = path.join(REAL_HOME, 'Library', 'Caches', 'ms-playwright', 'chromium_headless_shell-1217', 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell')
const LABEL = process.env.S6_LABEL ?? 'standalone'
const SHOT = path.join(import.meta.dirname, 'results', `browser-${LABEL}-${process.env.SDK}.png`)
const iso = isolateHome('standalone', process.env.S6_HOME)
fs.writeFileSync(profilePatchPath(iso), '[]\n')
globalThis.__s6 = { checks: [] }
const booted = await boot(iso)
const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href)
const browser = await chromium.launch({ headless: true, executablePath: HEADLESS_SHELL })
const evidence = {}
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(booted.url(), { waitUntil: 'load' })
  await page.waitForFunction(() => window.__s6Client?.applied === true, null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2000)
  evidence.client = await page.evaluate(() => window.__s6Client ?? null)
  evidence.overlayMarked = await page.locator('[data-s6="page-overlay"]').count()
  evidence.bootGraph = await page.evaluate(() => (window.__DSH_BOOT__?.entries ?? []).map((entry) => entry.id).filter((id) => /fishball|client-ui-(subagent|schedule|permission-presets|agent-preset|open-in-app|entry-customization|sidebar-terminal)/.test(id)))
  evidence.pageErrors = errors
  await page.screenshot({ path: SHOT })
  evidence.screenshot = path.basename(SHOT)
} finally {
  await browser.close()
}
await until(() => true, 1)
record(`browser-${LABEL}`, evidence)
process.exit(0)
