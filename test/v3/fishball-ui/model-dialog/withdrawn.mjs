/**
 * A row whose behaviour a later requirement withdrew stays listed: it is registered as skipped under
 * its own case name with the reason (targets-constants.mjs WITHDRAWN), so a run still shows it and
 * says why it no longer runs (as fishball-core/settings/withdrawn.mjs does for F-SETTINGS).
 */
import { test } from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'

export function withdrawnRow(sdk, id, row, title, reason) {
  test(caseName(sdk, id, row, title), { skip: reason }, () => {})
}
