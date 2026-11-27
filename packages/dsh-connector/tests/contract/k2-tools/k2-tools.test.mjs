// K2 (freeze of dsh-agent-connector/tools; K-flagged EXT cases; K2 amendments); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerExternalNameCases, registerK2Cases } from './cases.mjs'

forEachVersion((version) => {
  registerK2Cases(version)
  registerExternalNameCases(version)
})
