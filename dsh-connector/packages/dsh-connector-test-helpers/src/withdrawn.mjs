/**
 * Rows a later decision withdrew, kept visible as skipped under their own case names with the reason.
 * The reasons are the decisions that withdrew them (they moved here from test/support/withdrawn.mjs
 * and test/v3/dsh-instance/host/withdrawn.mjs).
 */
import { withdrawnCase as skipped } from './cases.mjs'

export const WITHDRAWN = 'withdrawn: requirements 1.34 item 4 (fishball-hosted-settings removed; core\'s settings are its own Plugins-page settings) and R-HOST-11 withdrawn; F-SETTINGS, test/v3/fishball-core/settings'

/** The decisions that withdraw rows elsewhere (I-HOST; design/v3-token-reveal; remove-v2-followups D14; REMOVE-V2b). */
export const WITHDRAWN_BY = Object.freeze({
  page: "withdrawn by I-HOST (QD1 = B, R-ARCH-05 amended by 1.33): the instance's status, Retry, Reconnect, model sync and Open Fishball are its own settings page (dsh-instance client.js, client.status.js, client.models.js); dsh-connector-ui no longer draws the instance card, and the status-line symlink and the ./status-line export are gone; successor test/v3/dsh-instance/host HOST-EP-01 row 4",
  halves: "withdrawn by I-HOST: core's child halves moved into dsh-instance (src/child/), fishball-shared's interim copies were deleted, and provider-sync-host took the neutral names (design §1.0b row 5, §1.0c)",
  offCode: 'withdrawn by I-HOST (Q4 = A, R-FB-10 amended by 1.39): the instance never reports fishball-off',
  sharedSingleUsers: 'withdrawn by REMOVE-V2b (R-ARCH-08 rule 5 strict, Fishball 2026-11-16: a library module only one package of its side uses moves into that package): fishball-shared\'s files and oauth-client had one user, fishball-core, and moved into it; fishball-shared holds only ./ui-seam, so it has no files copy to keep, compare or load',
  adminProtocol: "withdrawn by remove-v2-followups D14 (R-ARCH-08 strict: a library module needs a user on its side): I-READY deleted dsh-instance's admin relay (the user's decision 2026-11-16, \"Delete it\"), so nothing imports admin-protocol and dsh-connector-shared no longer holds it (no file, no ./admin-protocol export)",
})

/** A row withdrawn by requirements 1.34 item 4 (F-SETTINGS). */
export const withdrawnCase = (version, id, row, title) => skipped(version, id, row, title, WITHDRAWN)
/** A row withdrawn by one of WITHDRAWN_BY's decisions. */
export const withdrawnRow = (version, id, row, title, reason) => skipped(version, id, row, title, reason)
