// C-MCP-ADAPTER: the adapter's oauth-client module (dsh-connector-adapter/src/oauth-client.js since C-WIRE-2) black-box cases (USE-CASES.md),.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerOAuthClientCases } from './cases.mjs'
import { registerOAuthClientReviewFixCases } from './review-fix-cases.mjs'

forEachVersion((version) => {
  registerOAuthClientCases(version)
  registerOAuthClientReviewFixCases(version)
})
