// C-MAILBOX (per-pair durable mailbox, poll/ack, capacity and per-pair hints) registered for DSH 0.2.1-rc.5; see cases.mjs.
import { registerMailboxAmendCases } from './amend-cases.mjs'
import { registerMailboxCases } from './cases.mjs'

registerMailboxCases('0.2.1-rc.5')
registerMailboxAmendCases('0.2.1-rc.5')
