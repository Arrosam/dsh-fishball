/**
 * Vocabulary of the rows added after Sol's review rows (added-cases.mjs): requirement facts the
 * parent relayed (C-WIRE brief items 1, 6, 7, 8) and fixture data. No product implementation is read.
 */
import path from 'node:path'
import { SURFACE } from 'dsh-connector-test-helpers/connector-world/constants'

/** The create route's answer (brief item 1: "answers 200 with {ok, entryKey, label, value}"). */
export const CREATE_FIELDS = Object.freeze(['entryKey', 'label', 'ok', 'value'])

/** Brief item 1: after a remount, no line saying a listener is "already open" or a route is a "duplicate route". */
export const REMOUNT_ERRORS = Object.freeze([/already open/i, /duplicate route/i])

/** Brief item 7 (UIM-DT-01, connector half): embed-UI's availability route and its diagnostic. */
export const UI_AVAILABILITY = Object.freeze({ route: SURFACE.uiServicesRoute, connectorField: 'connector', missing: SURFACE.connectorMissing })

/**
 * Brief item 6: the rows C-WIRE-2 owned. They are real since C-WIRE-2 (review/cases.mjs "C-WIRE future"
 * describes, and dsh-connector.interactions RTE-02 / MSG-01); listed as skipped with where they run.
 */
export const LATER_ROWS = Object.freeze([
  'no maxPendingApprovals cap — C-WIRE-2',
  'list_user_messages deleted — C-WIRE-2',
])
export const MOVED = 'covered since C-WIRE-2 by review/cases.mjs (C-WIRE future describes) and dsh-connector.interactions (RTE-02 / MSG-01)'

/** Brief item 8: a plain `node --test` (no --test-force-exit) of a wire file must exit by itself. */
export const EXIT = Object.freeze({
  fixture: path.join(import.meta.dirname, 'exit-fixture.mjs'),
  /** The fixture's environment: which SDK, and which boot (ok: a normal boot; fail: a boot that fails after the worker started). */
  sdkEnv: 'FBWIRE_EXIT_SDK',
  modeEnv: 'FBWIRE_EXIT_MODE',
  mode: Object.freeze({ ok: 'ok', fail: 'fail' }),
  /** The harness guard's message when the row provides no services after app ready (world.mjs bootWorker). */
  guardFailure: /provided no services after app ready/,
  /** A schema-refused approval port (R2: -1 is below the 0..65535 range), so the row never provides its services. */
  refusedPort: SURFACE.settings.portMin - 1,
  exitedOk: 0,
})

/** Fixture data only. */
export const ADDED = Object.freeze({
  scenario: Object.freeze({ b1: 'review-b1-remount-log', ui: 'review-uim-dt-01', exitOk: 'review-exit-ok', exitFail: 'review-exit-fail' }),
  label: 'Review remount token',
})
