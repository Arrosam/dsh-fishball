// C-OAUTH (token store, FailureLimiter, BearerVerifier, token endpoint dispatch, client_credentials, metadata; C-PAGE-ID's no chain cap and page-bound refusal); see cases.mjs and chain-cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerCOAuthAmendCases } from './amend-cases.mjs'
import { registerCOAuthCases } from './cases.mjs'
import { registerChainCases } from './chain-cases.mjs'
import { registerXsecTokenCases } from './xsec-cases.mjs'

forEachVersion((version) => {
  registerCOAuthCases(version)
  registerCOAuthAmendCases(version)
  registerChainCases(version)
  registerXsecTokenCases(version)
})
