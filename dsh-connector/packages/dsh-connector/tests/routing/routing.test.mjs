// C-ROUTE (managed state, router, watch = manage, message/ask routing, the hand-over service); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerRouteCases } from './cases.mjs'

forEachVersion((version) => {
  registerRouteCases(version)
})
