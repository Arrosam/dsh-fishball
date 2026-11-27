// C-WIRE-2 (managed sessions' message_agent, permission requests, questions, grants and prompts on a real DSH); see cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerInteractionCases } from './cases.mjs'

forEachVersion((version) => {
  registerInteractionCases(version)
})
