/**
 * One way to keep a withdrawn row visible: registered as skipped under its own case name with the
 * F-SETTINGS reason (constants.mjs WITHDRAWN), so a run still lists it and says why it no longer
 * runs. Used by the suites whose rows asserted the removed slim panel or settings-section point.
 */
import { test } from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { WITHDRAWN } from './constants.mjs'

export function withdrawnCase(sdk, id, row, title) {
  test(caseName(sdk, id, row, title), { skip: WITHDRAWN }, () => {})
}
