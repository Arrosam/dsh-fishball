/**
 * Vocabulary for the I-SUCCEED cases (the instance's half of reinstall succession). Every value
 * comes from the requirements (R-HOST-02, R-HOST-05, R-HOST-09, R-HOST-10, R-NAME-07), design §5.4,
 * the K3 contract (packages/dsh-connector/host-services/tokens.d.ts as amended by I-SUCCEED: the
 * user's Q1 = C, 2026-11-17), the user's decisions relayed with the task (Q24 A, Q-B1 B, Q2
 * "Retarget to the newest", 2026-11-17) and the seam the dev session relayed (RELAYED). Product
 * values the I-HOST suite already names are imported from it, not restated.
 */
import { FIXTURE as HOST_FIXTURE, K3 as HOST_K3, RELAYED as HOST_RELAYED } from '../host/constants.mjs'

export { HOST_FIXTURE, HOST_K3 }

/** K3 RetireRefusalCode (tokens.d.ts; types only, so restated here and checked against the declaration text). */
export const RETIRE = Object.freeze({
  type: 'RetireRefusalCode',
  unknownEntry: 'unknown-entry',
  notHosted: 'not-hosted',
  successorUnpaired: 'successor-unpaired',
  operationFailed: 'operation-failed',
})

/** K3 DshConnectorTokens members: before the I-SUCCEED amendment, and the one it adds. */
export const TOKENS_MEMBERS = Object.freeze({
  retire: 'retire',
  onChange: 'onChange',
})

/** The seam the dev session relayed for I-SUCCEED (2026-11-17). */
export const RELAYED = Object.freeze({
  /** The hosted.json field that lists the entries (the I-HOST suite's RELAYED.record.key). */
  entriesKey: HOST_RELAYED.record.key,
})

/**
 * What a scripted `retire` answers. `reject` makes the call reject (a connector bug or a lost
 * service), which the requirement treats like `operation-failed` (retried at the next start).
 */
export const OUTCOME = Object.freeze({
  ok: Object.freeze({ ok: true }),
  unpaired: Object.freeze({ ok: false, code: RETIRE.successorUnpaired }),
  failed: Object.freeze({ ok: false, code: RETIRE.operationFailed }),
  unknown: Object.freeze({ ok: false, code: RETIRE.unknownEntry }),
  notHosted: Object.freeze({ ok: false, code: RETIRE.notHosted }),
  reject: 'reject',
})

/** The entry keys the fake connector hands out, newest last (HOST fakes' `entryPrefix + n`). */
export const ENTRY = Object.freeze({
  e1: HOST_FIXTURE.entryPrefix + 1,
  e2: HOST_FIXTURE.entryPrefix + 2,
  e3: HOST_FIXTURE.entryPrefix + 3,
  e4: HOST_FIXTURE.entryPrefix + 4,
})

/** Case ids: the test-design ids this suite covers, and its own tables. */
export const CASE = Object.freeze({
  uc03: 'HOST-UC-03',
  dt01: 'HOST-DT-01',
  dt02: 'HOST-DT-02',
  st02: 'HOST-ST-02',
  /** The instance's succession decision table: record × child credential × pending × connector × target. */
  start: 'ISUCC-DT-01',
  /** retire's answer → what the instance does with the pending succession. */
  outcome: 'ISUCC-DT-02',
  /** The pending succession's state transitions (none / pending(old → successor)). */
  pending: 'ISUCC-ST-01',
  /** Where the token value may appear (R-TOK-04, R-HOST-05). */
  leak: 'ISUCC-EP-01',
  /** A connector without the amendment, or none (behaviour 8). */
  older: 'ISUCC-EP-02',
  /** The instance over the real connector hosted service. */
  real: 'ISUCC-INT-01',
  /** Q3 = A: does a first start's new entry start a succession? (the child runtime id then and now) */
  runtime: 'ISUCC-DT-03',
  /** S2: a hosted.json write fails after a successful import (the unrecorded-entry queue). */
  write: 'ISUCC-ST-02',
  /** S3: close() while a step is queued or in flight. */
  close: 'ISUCC-ST-03',
})

/**
 * Child runtime ids (`runtimeId()`, the runtime owner marker's `hostId`; the user's Q3 = A,
 * 2026-11-17: uninstall or a runtime reset makes a new one). Fixture values.
 */
export const RUNTIME = Object.freeze({
  r1: 'fbtest-runtime-1',
  /** The id a reinstall's n-th new runtime gets (n = 2, 3, …). */
  next: (n) => `fbtest-runtime-${n}`,
  r2: 'fbtest-runtime-2',
  r3: 'fbtest-runtime-3',
  /** hosted.json's optional field: the runtime id the newest entry was created under (relayed; named in the I-HOST record constants). */
  field: HOST_RELAYED.record.runtimeKey,
})

/** The record members that write hosted.json (relayed record contract). */
export const RECORD_WRITES = Object.freeze(['add', 'settle'])

/** Harness waits (never a product oracle). */
export const WAIT = Object.freeze({
  /** How long a row watches for a retire that must not come (the instance may retry asynchronously). */
  quietMs: 150,
  /** The fake record's injected write failure. */
  writeFailure: 'fbtest hosted.json write failed',
  testMs: 120000,
})

/** Rows that need a real hosted child DSH (this suite launches none). */
export const E2E = Object.freeze({
  child: (row) => `E2E: needs a real hosted child DSH launch (${row})`,
})

/** R-FIX-INSTANCE rows of this suite (relayed 2026-11-18; F06 as corrected by the fixer that day: no retry). */
export const RFI = Object.freeze({
  f06: 'RFI-F06',
  /** The child receiver's refusal when the store write fails (the I-HOST suite's RELAYED.receiver.unwritable). */
  unwritable: HOST_RELAYED.receiver.unwritable,
})
