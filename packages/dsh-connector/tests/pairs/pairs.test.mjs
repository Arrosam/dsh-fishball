// C-PAIR (pair store, pair / set_name, names; AUTH and NAME cases of v3-tasks.md row C-PAIR; the page bind and reconnect of C-PAGE-ID); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerCPairCases } from './cases.mjs'
import { registerCPairNameCases } from './names-cases.mjs'
import { registerCPairReconnectCases } from './reconnect-cases.mjs'
import { registerCPairSucceedCases } from './succeed-cases.mjs'

forEachVersion((version) => {
  registerCPairCases(version)
  registerCPairSucceedCases(version)
  registerCPairReconnectCases(version)
  registerCPairNameCases(version)
})
