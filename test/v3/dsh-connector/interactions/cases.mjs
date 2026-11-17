/**
 * C-WIRE-2 black-box cases: the interactions of managed sessions on a real booted DSH (USE-CASES.md).
 * One file per use case; this module registers them all for one SDK. No connector module is read.
 */
import { registerApprovalCases } from './approval-cases.mjs'
import { registerGrantCases } from './grant-cases.mjs'
import { registerMessagingCases } from './messaging-cases.mjs'
import { registerPromptCases } from './prompt-cases.mjs'
import { registerQuestionCases } from './question-cases.mjs'
import { registerRestartCases } from './restart-cases.mjs'
import { registerXsecInteractionCases } from './xsec-cases.mjs'

export function registerInteractionCases(sdk) {
  registerMessagingCases(sdk)
  registerApprovalCases(sdk)
  registerQuestionCases(sdk)
  registerGrantCases(sdk)
  registerPromptCases(sdk)
  registerRestartCases(sdk)
  registerXsecInteractionCases(sdk)
}
