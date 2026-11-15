/**
 * `dshConnectorTokens`: hosted token set-up and reinstall succession (task K3; design §5.4;
 * R-HOST-05, R-HOST-09, R-HOST-10; Q8 revised by 1.9, Q24 decided). Only the instance's host row uses it,
 * looked up at runtime (see index.d.ts). Types only.
 *
 * Design §5.4 fixes the two members and `createHosted`'s success value; every refusal code below is
 * the K3 choice the user kept (DECIDED #13, #14). `createHosted` rejects because its success type has no refusal arm in the design;
 * `retire` returns refusals as data, because the instance retries it at its next start.
 */
import type { Refusal } from './index.js'

/**
 * The new hosted entry. Never the token value: the instance resolves the value itself with
 * `ctx.credentials.resolve(ref)` and hands it to the child in memory (R-HOST-05).
 * - `ref` is the credential reference (a POSIX env-var name) that holds the generated value;
 * - `entryKey` is an opaque, non-secret key of the token entry, kept by the instance in its
 *   lifecycle state for a later `retire`;
 * - `label` is the entry's label in the connector's native settings: "Fishball (hosted)".
 */
export interface HostedTokenEntry {
  readonly ref: string
  readonly entryKey: string
  readonly label: string
}

/**
 * Why `createHosted` rejects (`HostServiceError.code`; DECIDED #14, kept). It creates nothing in either case.
 * - `credentials-unwritable`: the credential store refused the generated value (design §5.2's
 *   unwritable store);
 * - `operation-failed`: any other failure.
 */
export type CreateHostedErrorCode = 'credentials-unwritable' | 'operation-failed'

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
 * - `enabled`: the entry is on and its value is the one it was created with;
 * - `disabled`: the user switched it off, or changed or unset its value (design §5.3 treats both
 *   alike). Never replaced: re-enabling restores the same principal;
 * - `deleted`: the entry no longer exists. Replaced only after the user presses Retry.
 */
export type HostedEntryState = 'enabled' | 'disabled' | 'deleted'

export interface DshConnectorTokens {
  readonly apiVersion: 1

  /**
   * Creates a **new** enabled "Fishball (hosted)" token entry with a generated value in the
   * shared credential store, recorded as made for `instanceId` (the instance's own non-secret id).
   * Called only when the child holds no paired credential (first start, reinstall, Retry after
   * the user deleted the entry), never on restart or reconnect (R-HOST-05, R-HOST-10).
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
   * deletes the old entry and unsets its generated credential value, with one `system` note per
   * moved session (design §5.4 steps 1–7). All or nothing.
   */
  retire(oldEntryKey: string, successorEntryKey: string): Promise<RetireResult>
}
