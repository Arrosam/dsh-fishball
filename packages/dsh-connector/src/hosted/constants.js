/**
 * C-SUCCEED's own constants (task C-SUCCEED; K3 `dshConnectorTokens`, host-services/tokens.d.ts;
 * design §5.4; R-HOST-05, R-HOST-09). The refusal words are K3's, typed without a runtime value
 * except the two K1/K2 already own (`successor-unpaired`, `operation-failed`), which come from them.
 */
import { REFUSAL, TIME_UNIT } from '../../mcp-schema/index.js'

/** The Cordis service name and its version (K3 host-services/index.d.ts `Context`, README). C-WIRE provides it. */
export const HOSTED_SERVICE = Object.freeze({ name: 'dshConnectorTokens', apiVersion: 1 })

/** K3 `RetireRefusalCode` (DECIDED #13, kept), checked in this order before anything moves. */
export const RETIRE_REFUSAL = Object.freeze({
  unknownEntry: 'unknown-entry',
  notHosted: 'not-hosted',
  successorUnpaired: REFUSAL.successorUnpaired,
  operationFailed: REFUSAL.operationFailed,
})

/** K3 `CreateHostedErrorCode` (DECIDED #14, kept): `createHosted` rejects with it, creating nothing. */
export const CREATE_HOSTED_ERROR = Object.freeze({ operationFailed: REFUSAL.operationFailed })

/** K3 `HostedEntryState` (decided 1 = A; K1d). */
export const HOSTED_ENTRY_STATE = Object.freeze({ enabled: 'enabled', disabled: 'disabled', deleted: 'deleted' })

/**
 * The hosted records: which instance each `createHosted` entry was made for (K3: `retire` refuses
 * entries made for different instances), and, once a succession has passed its commit point, the
 * successor's entry key (`succeededBy`): the old entry is then deleted, at once or at the next start.
 * One storage domain of the connector, one record per entry keyed by its EntryKey (base64url,
 * path-safe). Authoritative: a bad record fails the open.
 */
export const HOSTED_STORE = Object.freeze({
  domain: 'dsh_connector_hosted',
  version: 1,
  layout: 'per-record',
  table: 'entries',
})

/**
 * The wait before a failed post-succession step (deleting the old entry, a note) is tried again
 * (Fishball's choice, PROPOSED; the same value as C-REVOKE's own retry, but its own setting: a
 * different step with its own reason). The name and the sessions have moved by then, so a step
 * is retried until it succeeds or the connector stops; the old entry's delete is also finished at
 * the next start (its hosted record is marked `succeededBy` before the commit point).
 */
export const HOSTED_TIMING = Object.freeze({ retryMs: 30 * TIME_UNIT.msPerSecond })

/**
 * The `system` note each moved session gets (R-HOST-09 step 7), naming the new principal by its
 * label (its name, or `ID: <id>` when it has none: K1 `principalLabel`). Model-facing text, English
 * only (W4 Q7); it starts no turn (Q2 = A).
 */
export const SUCCESSION_NOTE = Object.freeze({
  text: (label) => `The agent managing this session was reinstalled. It is now the agent ${label}: `
    + 'it keeps managing this session, and its permission requests, questions and plan reviews go to it as before.',
})

/** Background log lines: `logger.warn(LOG.format, line, diagnostic code)`; never a key, id or value. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  createFailed: 'hosted: creating the hosted token entry failed; nothing was created',
  recordFailed: 'hosted: the hosted record could not be written; the new entry is removed again',
  undoFailed: 'hosted: undoing a failed step failed; it is retried or reported',
  retireFailed: 'hosted: a succession step failed and was rolled back',
  cleanupFailed: 'hosted: deleting the succeeded entry failed; it is retried',
  noteFailed: 'hosted: a succession note could not be written',
  recoveryFailed: 'hosted: a succession interrupted by a stop could not be completed; it is tried at the next start',
})

/** Programming-error messages (a caller bug, thrown as TypeError; never shown to a client). */
export const MISUSE = Object.freeze({
  instanceId: 'dshConnectorTokens: createHosted needs an instance id, a non-empty string',
  sameEntry: 'dshConnectorTokens: retire needs two different entry keys',
  listener: 'dshConnectorTokens: onChange needs a function',
  record: 'dshConnectorTokens: invalid hosted record',
})
