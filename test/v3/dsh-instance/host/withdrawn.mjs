/**
 * One way to keep a row I-HOST's requirements withdrew visible in other suites: registered as
 * skipped under its own case name with the reason, so a run still lists it and says why.
 */
import { test } from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'

/** The decisions that withdraw rows elsewhere (user decisions for I-HOST; requirements at design/v3-token-reveal). */
export const WITHDRAWN_BY = Object.freeze({
  page: "withdrawn by I-HOST (QD1 = B, R-ARCH-05 amended by 1.33): the instance's status, Retry, Reconnect, model sync and Open Fishball are its own settings page (dsh-instance client.js, client.status.js, client.models.js); dsh-connector-ui no longer draws the instance card, and the status-line symlink and the ./status-line export are gone; successor test/v3/dsh-instance/host HOST-EP-01 row 4",
  halves: "withdrawn by I-HOST: core's child halves moved into dsh-instance (src/child/), fishball-shared's interim copies were deleted, and provider-sync-host took the neutral names (design §1.0b row 5, §1.0c)",
  offCode: 'withdrawn by I-HOST (Q4 = A, R-FB-10 amended by 1.39): the instance never reports fishball-off',
})

export function withdrawnRow(sdk, id, row, title, reason) {
  test(caseName(sdk, id, row, title), { skip: reason }, () => {})
}
