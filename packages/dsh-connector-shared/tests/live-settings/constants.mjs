/**
 * Vocabulary of the live-settings cases (USE-CASES.md beside this file), from the requirement R1
 * relayed by the lead (2026-11-22) and DSH's own Loader contract (cordis-plugin-loader README: a
 * volatile-only config change commits into the running references and emits
 * 'loader/volatile-update' on the row's fiber). Nothing comes from live-settings.js.
 */
import { versionsDir } from 'dsh-connector-test-helpers/config'
import path from 'node:path'

/** The module under test and its exports (R1). */
export const SUBJECT = Object.freeze({
  specifier: 'dsh-connector-shared/live-settings',
  exports: Object.freeze(['settingsSnapshot', 'runWithSettings']),
})

/** The installed SDKs and the DSH packages the cases mount rows on. */
export const SDK = Object.freeze({
  versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.3']),
  versionsDir: versionsDir,
  cordis: '@deepseek-ai/cordis',
  loader: '@deepseek-ai/cordis-plugin-loader',
  /** schemastery ships lib/index.mjs (no lib/index.js), so it is imported by path. */
  schemastery: path.join('node_modules', '@deepseek-ai', 'schemastery', 'lib', 'index.mjs'),
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
