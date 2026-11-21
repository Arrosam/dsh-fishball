/**
 * dsh-fishball's bindings of the package-icon rows (constants.mjs, observe.mjs and cases.mjs are
 * the same files in dsh-connector): which packages the rows read, the ICON-SET reader
 * (icon-set.mjs, this side's own copy: the Fishball side imports nothing of the DSH side) and the
 * LITE rows' Chromium. The subjects are the four amenities packages (the requirement);
 * fishball-core's icon is the family reference; the Fishball side's library declares none.
 * fishball-ui (core's inner package) ships assets/fishball-ui-icon.svg without a manifest icon, so
 * that asset joins only the distinctness row (`asset`), as the family's other drawn icon.
 */
import path from 'node:path'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { NPM, SDK, V3 } from '../../contract/package-boundaries/constants.mjs'
import { launchChromium } from '../../../v2-page-cases/lite-browser.mjs'
import { baseOf, glyphPaths, iconMismatch, parseXml, walk } from './icon-set.mjs'
import { RENDER } from './constants.mjs'

export const PACKAGES = Object.freeze({
  subjects: Object.freeze([V3.amenities, V3.board, V3.heartbeat, V3.taskboard]),
  reference: V3.core,
  others: Object.freeze([Object.freeze({ ...V3.ui, asset: path.join(V3.ui.dir, 'assets', 'fishball-ui-icon.svg') })]),
  libraries: Object.freeze([V3.shared]),
})
export const NPM_PATH = NPM.path
export const VERSIONS_DIR = SDK.versionsDir
export { baseOf, caseName, glyphPaths, iconMismatch, parseXml, walk }

/** A Chromium whose evaluate(scheme, expression) runs in a fresh blank tab under that scheme; null when none is installed. */
export async function openBrowser() {
  const started = await launchChromium()
  if (!started) return null
  const { devtools } = started
  return {
    async evaluate(scheme, expression) {
      const { targetId } = await devtools.send('Target.createTarget', { url: RENDER.blank })
      try {
        const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
        await devtools.send('Emulation.setDeviceMetricsOverride', { ...RENDER.viewport, deviceScaleFactor: 1, mobile: false }, sessionId)
        await devtools.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, sessionId)
        const r = await devtools.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
        if (r.exceptionDetails) throw new Error('page evaluation failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
        return r.result.value
      } finally {
        await devtools.send('Target.closeTarget', { targetId }).catch(() => {})
      }
    },
    stop: () => started.stop(),
  }
}
