/**
 * Vocabulary of the live-settings cases (USE-CASES.md beside this file), from the requirement R1
 * relayed by the lead (2026-11-22) and DSH's own Loader contract (cordis-plugin-loader README: a
 * volatile-only config change commits into the running references and emits
 * 'loader/volatile-update' on the row's fiber). Nothing comes from live-settings.js. The Fishball-side helper is fishball-heartbeat's own module (the
 * implementer's correction of 2026-11-22: its only Fishball-side user), with the same contract.
 */
import path from 'node:path'

/** The module under test and its exports (R1); tests/live-settings/ is two levels below the package. */
export const SUBJECT = Object.freeze({
  file: path.join(import.meta.dirname, '..', '..', 'src', 'live-settings.js'),
  exports: Object.freeze(['settingsSnapshot', 'runWithSettings']),
})

/** The current DSH's packages the cases mount rows on (fishball-test-helpers/dsh importDsh names). */
export const DSH = Object.freeze({
  cordis: 'cordis',
  loader: 'cordis-plugin-loader',
  schemastery: 'schemastery',
  builtinPrefix: 'cordis:',
  /** cordis FiberState.ACTIVE (the enum is not exported). */
  fiberActive: 2,
})

/** The fixture row: one bounded volatile number, one volatile string, one ordinary string. */
export const ROW = Object.freeze({
  name: 'fbtest-live-row',
  other: 'fbtest-live-other',
  min: 1,
  max: 10,
  initial: 3,
  next: 7,
  label: 'fbtest-label',
  ordinary: 'fbtest-ordinary',
  ordinaryDefault: 'fbtest-default',
  failMarker: 9,
})

export const WAIT = Object.freeze({ testMs: 30_000, settleRounds: 40, asyncBodyMs: 20 })
