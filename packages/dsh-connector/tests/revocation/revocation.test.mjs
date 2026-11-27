// C-REVOKE step 1 (routing endPrincipal / askDropped, Mailbox.retire misuse) and step 2 (the revocation module); see cases.mjs and handler-cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerRevocationCases } from './cases.mjs'
import { registerRevocationHandlerCases } from './handler-cases.mjs'

forEachVersion((version) => {
  registerRevocationCases(version)
  registerRevocationHandlerCases(version)
})
