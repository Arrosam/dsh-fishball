// C-OAUTH-WEB (approval listener, page, CIMD, PKCE, code and refresh grants; the page id and reconnect of C-PAGE-ID; the UI-POLISH-D page markup and CSP; the ICON-SET inline icon; v3-tasks.md rows C-OAUTH-WEB, C-PAGE-ID); see cases.mjs and page-id-cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerCOAuthWebAmendCases } from './amend-cases.mjs'
import { registerCOAuthWebCases } from './cases.mjs'
import { registerIconWebCases } from './icon-cases.mjs'
import { registerPageIdCases } from './page-id-cases.mjs'
import { registerPolishWebCases } from './polish-cases.mjs'
import { registerXsecWebCases } from './xsec-cases.mjs'
import { registerReviewXWebCases } from './review-x-cases.mjs'
import { registerMultiApprovalCases } from './multi-cases.mjs'

forEachVersion((version) => {
  registerCOAuthWebCases(version)
  registerCOAuthWebAmendCases(version)
  registerPageIdCases(version)
  registerXsecWebCases(version)
  registerPolishWebCases(version)
  registerIconWebCases(version)
  registerReviewXWebCases(version)
  registerMultiApprovalCases(version)
})
