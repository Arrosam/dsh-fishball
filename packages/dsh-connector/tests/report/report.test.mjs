// CONN-REPORT B (turn-finished: the session source's standstill and report); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerReportCases } from './cases.mjs'
import { registerTaskboardTurnFinalCases } from './taskboard-turn-final-cases.mjs'

forEachVersion((version) => {
  registerReportCases(version)
  registerTaskboardTurnFinalCases(version)
})
