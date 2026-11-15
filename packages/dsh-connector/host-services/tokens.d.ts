/**
 * `dshConnectorTokens`: hosted token set-up and reinstall succession (task K3; design §5.4;
 * R-HOST-05, R-HOST-09, R-HOST-10; Q8 revised by 1.9, Q24 decided). Only the instance's host row uses it,
 * looked up at runtime (see index.d.ts). Types only.
 *
 * Design §5.4 fixes the members and `createHosted`'s success value; every refusal code below is
 * the K3 choice the user kept (DECIDED #13, #14). `createHosted` rejects because its success type has no refusal arm in the design;
 * `retire` returns refusals as data, because the instance retries it at its next start.
 *
 * K1d token amendment (design §5.4, §5.9; requirements 1.27, 1.28 R1, R2): `createHosted` returns
 * the generated value once, in process, to the instance, and the host stores no token value at all.
 * The connector's `create(label)` for the settings page's New token is connector-internal (its own
 * owner-only route, R2), not a member of this service.
 */
import type { Refusal } from './index.js'

/**
 * The new hosted entry and its value, returned **once** (R-HOST-05, R1; K1d).
 * - `entryKey` is an opaque, non-secret key of the token entry, kept by the instance in its
 *   lifecycle state for a later `retire`;
 * - `label` is the entry's label in the connector's native settings: "Fishball (hosted)";
 * - `value` is the generated token value (K1 TOKEN_VALUE). The connector keeps only its digest, and
 *   nothing can read it back. The instance sends it once over the lifecycle wire into the child's
 *   credential store and keeps no copy: not in the host's credential store, its state, overlays,
 *   argv, env or logs. It never reaches a UI.
 */
export interface HostedTokenEntry {
  readonly entryKey: string
  readonly label: string
  readonly value: string
}

/**
 * Why `createHosted` rejects (`HostServiceError.code`; DECIDED #14, kept). It creates nothing.
 * - `operation-failed`: the digest record or the settings item could not be written; any record
 *   already written is removed again, and no value was returned (design §5.2).
 * `credentials-unwritable` moved to the instance (K1d, design §5.4, PROPOSED): only the child can
 * fail to store the value, so the instance reports it and deletes the new entry itself.
 */
export type CreateHostedErrorCode = 'operation-failed'

/**
 * Why `retire` refuses (DECIDED #13, kept). Every refusal moves nothing and deletes nothing (R-HOST-09).
 * - `unknown-entry`: either key names no token entry;
 * - `not-hosted`: either entry was not made by `createHosted`, or the two were made for different
 *   `instanceId`s. A user-made entry is never retired (R-HOST-09, HOST-UC-03 E3);
 * - `successor-unpaired`: the successor has not paired yet (succession runs only after the new
 *   pairing succeeds, HOST-DT-02 #2);
 * - `operation-failed`: the storage step failed and was rolled back; the instance retries at its
 *   next start (HOST-UC-03 E2).
 */
export type RetireRefusalCode = 'unknown-entry' | 'not-hosted' | 'successor-unpaired' | 'operation-failed'

export type RetireResult = { readonly ok: true } | Refusal<RetireRefusalCode>

/**
 * A hosted entry's state, as the instance needs it to decide whether Retry may replace it
 * (R-HOST-10; decided 1 = A):
 * - `enabled`: the entry is on;
 * - `disabled`: the user switched it off (K1d: a value can no longer change or be unset). Never
 *   replaced: re-enabling restores the same principal;
 * - `deleted`: the entry no longer exists. Replaced only after the user presses Retry.
 */
export type HostedEntryState = 'enabled' | 'disabled' | 'deleted'

export interface DshConnectorTokens {
  readonly apiVersion: 1

  /**
   * Creates a **new** enabled "Fishball (hosted)" token entry with a generated value, recorded as
   * made for `instanceId` (the instance's own non-secret id), and resolves its value once (K1d).
   * The connector keeps only the value's digest (design §5.1). Called when the child holds no
   * credential for this target (first start, reinstall) or on the instance's Reconnect, never on
   * restart or on Retry (R-HOST-05, R-HOST-10; R6 = B, R11). The only caller is the instance's host
   * row, in process; the value is never logged.
   * Rejects with `HostServiceError<CreateHostedErrorCode>`.
   */
  createHosted(instanceId: string): Promise<HostedTokenEntry>

  /**
   * Read-only: the state of an entry `createHosted` returned. A key that names no entry (or not a
   * hosted one) answers `deleted`. Never creates, changes or reveals anything.
   */
  entryState(entryKey: string): HostedEntryState

  /**
   * Reinstall succession (Q24): in one storage transaction, makes the successor's principal take
   * over the old hosted entry's managed sessions (with their watch), the designated role, the name,
   * the live offers (re-issued with new offer ids) and the pending events (same `eventId`s), then
   * deletes the old entry (its digest record; no value is stored on the host to unset), with one
   * `system` note per moved session (design §5.4 steps 1–7). All or nothing.
   */
  retire(oldEntryKey: string, successorEntryKey: string): Promise<RetireResult>
}
