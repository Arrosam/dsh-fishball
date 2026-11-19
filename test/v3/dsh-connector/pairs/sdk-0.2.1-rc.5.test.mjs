// C-PAIR (pair store, pair / set_name, names; AUTH and NAME cases of v3-tasks.md row C-PAIR; the page bind and reconnect of C-PAGE-ID) registered for DSH 0.2.1-rc.5; see cases.mjs.
import { registerCPairCases } from './cases.mjs'
import { registerCPairReconnectCases } from './reconnect-cases.mjs'
import { registerCPairSucceedCases } from './succeed-cases.mjs'

registerCPairCases('0.2.1-rc.5')
registerCPairSucceedCases('0.2.1-rc.5')
registerCPairReconnectCases('0.2.1-rc.5')
