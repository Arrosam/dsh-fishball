// C-REVOKE step 1 (routing endPrincipal / askDropped, Mailbox.retire misuse) and step 2 (the revocation module) registered for DSH 0.2.1-rc.5; see cases.mjs and handler-cases.mjs.
import { registerRevocationCases } from './cases.mjs'
import { registerRevocationHandlerCases } from './handler-cases.mjs'

registerRevocationCases('0.2.1-rc.5')
registerRevocationHandlerCases('0.2.1-rc.5')
