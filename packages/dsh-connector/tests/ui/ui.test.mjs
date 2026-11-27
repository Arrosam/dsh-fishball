// C-UI-BACKEND (the connector's UI backend: marks, Hand over targets and lights, attention latch, notify, routes and stream); see cases.mjs and USE-CASES.md.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerCUiBackendCases } from './cases.mjs'

forEachVersion((version) => {
  registerCUiBackendCases(version)
})
