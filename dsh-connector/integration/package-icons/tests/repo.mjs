/**
 * dsh-connector's bindings of the package-icon rows (constants.mjs, observe.mjs and cases.mjs are
 * the same files in dsh-fishball): which packages the rows read, the shared ICON-SET reader
 * (../package-boundaries/icon-set.mjs) and the layout rows' Chromium.
 * The subjects are the three amenities packages (the requirement); dsh-agent-connector's icon is
 * the family reference; the DSH side's library declares none. dsh-connector-ui (the connector's
 * inner package) ships assets/connector-ui-icon.svg without a manifest icon, so that asset joins
 * only the distinctness row (`asset`), as the family's other drawn icon.
 */
import path from 'node:path'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { versionsDir } from 'dsh-connector-test-helpers/config'
import { launch } from 'dsh-connector-test-helpers/page/chrome'
import { packageDir } from 'dsh-connector-test-helpers/repo'
import { NPM, V3 } from 'dsh-connector-test-helpers/static/constants'
import { baseOf, glyphPaths, iconMismatch, parseXml, walk } from 'dsh-connector-test-helpers/static/icon-set'
import { RENDER } from './constants.mjs'

const pkg = (name, folder) => Object.freeze({ name, dir: packageDir(folder) })
export const PACKAGES = Object.freeze({
  subjects: Object.freeze([pkg('dsh-connector-amenities', 'dsh-connector-amenities'), V3.adapter, pkg('dsh-connector-watchdog', 'dsh-connector-watchdog')]),
  reference: V3.connector,
  others: Object.freeze([Object.freeze({ ...V3.embed, asset: path.join(V3.embed.dir, 'assets', 'connector-ui-icon.svg') })]),
  libraries: Object.freeze([V3.dshShared]),
})
export const NPM_PATH = NPM.path
export const VERSIONS_DIR = versionsDir
export { baseOf, caseName, glyphPaths, iconMismatch, parseXml, walk }

/** A Chromium whose evaluate(scheme, expression) runs in a fresh blank tab under that scheme; null when none is installed. */
export async function openBrowser() {
  const b = await launch()
  if (!b) return null
  return {
    async evaluate(scheme, expression) {
      const tab = await b.open(RENDER.blank, { ...RENDER.viewport, colorScheme: scheme })
      try { return await tab.evaluate(expression) } finally { await tab.close() }
    },
    stop: () => b.stop(),
  }
}