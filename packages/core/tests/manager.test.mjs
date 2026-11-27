// fishball-core's manager area, registered once on the current DSH (fishball-test-helpers/dsh DSH_VERSION):
// reminders, the manager singleton and setup, the generated identity and Fishball's model in a real DSH
// (manager/cases.mjs), the R-FIX-CORE rows in-process (rfix.mjs, rfix2.mjs) and the Watchdog persona
// (watchdog-persona.mjs). See manager/README.md.
import { registerManagerCases } from './manager/cases.mjs'

import './manager/ptc.mjs'
import './manager/question-cards.mjs'

registerManagerCases()
