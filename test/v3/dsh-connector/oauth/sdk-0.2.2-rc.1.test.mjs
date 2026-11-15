// C-OAUTH (token store, chainsOf, FailureLimiter, BearerVerifier, token endpoint dispatch, client_credentials, metadata) registered for DSH 0.2.2-rc.1; see cases.mjs.
import { registerCOAuthAmendCases } from './amend-cases.mjs'
import { registerCOAuthCases } from './cases.mjs'

registerCOAuthCases('0.2.2-rc.1')
registerCOAuthAmendCases('0.2.2-rc.1')
