/**
 * One way to keep a withdrawn row visible: registered as skipped under its own case name with the
 * reason its suite gives (the fishball-core F-SETTINGS text, copied here when fishball-core moved to
 * the dsh-fishball repository in the repo split 6b7c53bf).
 */
import { test } from 'node:test'
import { caseName } from '../v3/contract/package-boundaries/cases.mjs'

export const WITHDRAWN = 'withdrawn: requirements 1.34 item 4 (fishball-hosted-settings removed; core\'s settings are its own Plugins-page settings) and R-HOST-11 withdrawn; F-SETTINGS, test/v3/fishball-core/settings'

export function withdrawnCase(sdk, id, row, title) {
  test(caseName(sdk, id, row, title), { skip: WITHDRAWN }, () => {})
}
