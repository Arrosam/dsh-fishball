// C-OAUTH-WEB (approval listener, page, CIMD, PKCE, code and refresh grants; the page id and reconnect of C-PAGE-ID; the UI-POLISH-D page markup and CSP; the ICON-SET inline icon; v3-tasks.md rows C-OAUTH-WEB, C-PAGE-ID) registered for DSH 0.2.2-rc.1; see cases.mjs and page-id-cases.mjs.
import { registerCOAuthWebAmendCases } from './amend-cases.mjs'
import { registerCOAuthWebCases } from './cases.mjs'
import { registerIconWebCases } from './icon-cases.mjs'
import { registerPageIdCases } from './page-id-cases.mjs'
import { registerPolishWebCases } from './polish-cases.mjs'
import { registerXsecWebCases } from './xsec-cases.mjs'
import { registerReviewXWebCases } from './review-x-cases.mjs'

registerCOAuthWebCases('0.2.2-rc.1')
registerCOAuthWebAmendCases('0.2.2-rc.1')
registerPageIdCases('0.2.2-rc.1')
registerXsecWebCases('0.2.2-rc.1')
registerPolishWebCases('0.2.2-rc.1')
registerIconWebCases('0.2.2-rc.1')
registerReviewXWebCases('0.2.2-rc.1')

import { registerMultiApprovalCases } from './multi-cases.mjs'
registerMultiApprovalCases('0.2.2-rc.1')
