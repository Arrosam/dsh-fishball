// C-OAUTH-WEB (approval listener, page, CIMD, PKCE, code and refresh grants; the page id and reconnect of C-PAGE-ID; v3-tasks.md rows C-OAUTH-WEB, C-PAGE-ID) registered for DSH 0.2.1-rc.5; see cases.mjs and page-id-cases.mjs.
import { registerCOAuthWebAmendCases } from './amend-cases.mjs'
import { registerCOAuthWebCases } from './cases.mjs'
import { registerPageIdCases } from './page-id-cases.mjs'
import { registerXsecWebCases } from './xsec-cases.mjs'

registerCOAuthWebCases('0.2.1-rc.5')
registerCOAuthWebAmendCases('0.2.1-rc.5')
registerPageIdCases('0.2.1-rc.5')
registerXsecWebCases('0.2.1-rc.5')
