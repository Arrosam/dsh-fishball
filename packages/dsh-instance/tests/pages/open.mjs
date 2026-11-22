/**
 * The two surfaces the pages area mounts: the instance's settings page (its plugins.bundle.config
 * entry keyed by the package name, DSH plugin-manager README "Configuration pages"; view 'page') and
 * the Fishball tab (its plugins.tab entry, README "Plugins for Fishball"; DSH's owner props).
 */
import assert from 'node:assert/strict'
import { PAGE_UI, SLOT } from './constants.mjs'
import { scriptedInstance } from './fakes.mjs'
import { openInstancePage } from './page.mjs'

/** The settings page entry, or a failure naming what was registered instead. */
export function settingsEntry(page) {
  const entry = page.entriesOf(SLOT.bundleConfig).find((e) => e.options.key === PAGE_UI.id)
  assert.ok(entry, 'no ' + SLOT.bundleConfig + ' entry keyed ' + PAGE_UI.id + '; slots ' + JSON.stringify(page.slotNames()) + '; errors ' + page.errors.join('; '))
  return entry
}

/** Open the page over a scripted instance and mount the settings page. */
export async function openSettings(t, sdk, { lang, world = scriptedInstance(), mainBundles } = {}) {
  const page = await openInstancePage(t, { sdk, lang, respond: world.respond, mainBundles })
  const tree = await page.mount('settings', settingsEntry(page), { view: 'page', t: page.services.locale.bind(PAGE_UI.id) })
  return { page, world, tree }
}

/** Open the page over a scripted instance and mount the Fishball tab. */
export async function openTab(t, sdk, { lang, world = scriptedInstance(), mainBundles } = {}) {
  const page = await openInstancePage(t, { sdk, lang, respond: world.respond, mainBundles })
  const entries = page.entriesOf(SLOT.tab)
  assert.equal(entries.length, 1, 'plugins.tab entries: ' + entries.length + '; errors ' + page.errors.join('; '))
  const [entry] = entries
  const tree = await page.mount('tab', entry, { t: page.services.locale.bind(entry.options.locale), install() {}, update() {}, openPackage() {} })
  return { page, world, tree, entry }
}

/** Mount the per-bundle action entry (plugins.detail.actions) with `subject`. */
export async function openDetail(t, sdk, { world = scriptedInstance(), mainBundles = [], subject }) {
  const page = await openInstancePage(t, { sdk, respond: world.respond, mainBundles })
  const [entry] = page.entriesOf(SLOT.detailActions)
  assert.ok(entry, 'no ' + SLOT.detailActions + ' entry; errors ' + page.errors.join('; '))
  const tree = await page.mount('detail', entry, { subject, t: page.services.locale.bind(entry.options.locale) })
  return { page, world, tree }
}
