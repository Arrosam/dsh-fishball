// The marks part (DESIGN.md §28: Hand over / Take back, Managed by, the managed row mark in dsh-agent-connector's browser half); see cases.mjs and moved-cases.mjs.
// Registered once per DSH version of the run: the current DSH day to day, the release matrix at release.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerMarksCases } from './cases.mjs'
import { registerMovedMarksCases } from './moved-cases.mjs'
import { registerMultiMarksCases } from './multi-cases.mjs'

forEachVersion((version) => {
  registerMarksCases(version)
  registerMovedMarksCases(version)
  registerMultiMarksCases(version)
})
