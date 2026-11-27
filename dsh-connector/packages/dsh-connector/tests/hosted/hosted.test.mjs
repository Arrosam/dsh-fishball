// C-SUCCEED (the hosted token service: createHosted, entryState, retire, onChange; the succession step; K1d Mailbox.transfer); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerSucceedCases } from './cases.mjs'

forEachVersion((version) => {
  registerSucceedCases(version)
})
