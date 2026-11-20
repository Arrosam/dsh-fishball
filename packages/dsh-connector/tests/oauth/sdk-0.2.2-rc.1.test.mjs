// C-OAUTH (token store, FailureLimiter, BearerVerifier, token endpoint dispatch, client_credentials, metadata; C-PAGE-ID's no chain cap and page-bound refusal) registered for DSH 0.2.2-rc.1; see cases.mjs and chain-cases.mjs.
import { registerCOAuthAmendCases } from './amend-cases.mjs'
import { registerCOAuthCases } from './cases.mjs'
import { registerChainCases } from './chain-cases.mjs'
import { registerXsecTokenCases } from './xsec-cases.mjs'

registerCOAuthCases('0.2.2-rc.1')
registerCOAuthAmendCases('0.2.2-rc.1')
registerChainCases('0.2.2-rc.1')
registerXsecTokenCases('0.2.2-rc.1')
