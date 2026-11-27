// C-MAILBOX (per-pair durable mailbox, poll/ack, capacity and per-pair hints); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerMailboxAmendCases } from './amend-cases.mjs'
import { registerMailboxCases } from './cases.mjs'

forEachVersion((version) => {
  registerMailboxCases(version)
  registerMailboxAmendCases(version)
})
