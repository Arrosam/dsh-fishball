// K1d (W4 contract gate: token amendment, page id, no chain cap, Mailbox.transfer, SettingsWriter, SessionNotes, neutral names); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerK1dCases } from './cases.mjs'

forEachVersion((version) => {
  registerK1dCases(version)
})
