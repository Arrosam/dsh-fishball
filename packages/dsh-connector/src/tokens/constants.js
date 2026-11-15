/**
 * The token module's own constants (design §5.1–§5.3, §5.6, §5.9; R-TOK-03/04/08/09/11). The token
 * tunables (prefix, byte count, digest algorithm) and the status, refusal and revocation words are
 * K1's (`TOKEN_VALUE`, `ENTRY_STATUS`, `SETTINGS_REFUSAL`, `REVOCATION_KIND`, `REFUSAL`) and are
 * imported, never restated here.
 */
import { REFUSAL } from '../../mcp-schema/constants.js'

/**
 * The durable entry records: one storage domain of the connector (`$DSH_HOME/storages/…`).
 * - `version` 2 (C-TOKENS-REVEAL): the record holds a SHA-256 digest and no credential reference.
 * - `layout: 'per-record'`: one document per entry, so a store left at version 1 by a W2
 *   development build is opened fresh: DSH's per-record backend bootstraps only from a legacy
 *   whole-unit file whose version it accepts and leaves any other one alone (dsh-storage-json,
 *   both SDKs). No V3 token entry has shipped, so nothing is migrated (open questions, decided 44).
 *   A single-document unit would instead refuse to open (`version-mismatch`) and fail closed for
 *   good. Entry keys are base64url, which the per-record backend's path-safe key rule admits.
 */
export const TOKEN_STORE = Object.freeze({
  // DSH requires /^[a-z][a-z0-9_]*$/ for domain and table names.
  domain: 'dsh_connector_tokens',
  // A changed record shape must bump this.
  version: 2,
  layout: 'per-record',
  table: 'entries',
})

/** Opaque, non-secret entry keys (K1 `EntryKey`): random, never derived from the value or label. */
export const ENTRY_KEY = Object.freeze({ bytes: 16, encoding: 'base64url' })

/** Encoding of a generated token value after `TOKEN_VALUE.generatedPrefix` (design §5.2). */
export const VALUE_ENCODING = 'base64url'

/** K1 `TokenEntry.generation`: a new entry's first, and what each revocation adds. */
export const GENERATION = Object.freeze({ first: 0, step: 1 })

/** A settings field that is absent or not a string reads as this. */
export const NO_TEXT = ''

/**
 * The entry the hosted create makes (K3 `host-services/tokens.d.ts`: "Fishball (hosted)"). The
 * label is the K3 contract's, fixed here once; C-SUCCEED imports it.
 */
export const HOSTED_TOKEN = Object.freeze({ label: 'Fishball (hosted)' })

/**
 * Why a sync runs. Only `settings` counts as "the user saved the settings", so only a save is
 * refused and undone for a duplicate (design §5.9, R3, R5); one found at `start` cannot be undone
 * and makes the entries involved refuse service instead.
 */
export const SYNC_REASON = Object.freeze({ start: 'start', settings: 'settings' })

/**
 * Why `create` / `createHosted` reject. `operationFailed` is the code when the record or the
 * settings item could not be written (K3 `CreateHostedErrorCode`); nothing was created and no
 * value was returned.
 */
export const CREATE_ERROR = Object.freeze({
  operationFailed: REFUSAL.operationFailed,
  /** The TypeError's message for a label that is not a non-empty string (nothing is created). */
  invalidLabel: 'a token label must be a non-empty string',
})

/** Log lines: labels and codes only, never a value, a digest or a key (R-TOK-04). */
export const LOG = Object.freeze({
  duplicate: 'token entries %s are duplicated or were added by hand (token-duplicate); %s',
  duplicateRefused: 'the save was refused',
  duplicateUnusable: 'they refuse service until this is fixed',
  restoreFailed: 'previous token settings not restored (%s)',
  listenerFailed: 'token revocation listener failed (%s)',
  storeWriteFailed: 'token entry record not written yet; the entry stays unusable until it is (%s)',
  createFailed: 'token entry "%s" not created (%s)',
  invalidRecord: 'invalid token entry record',
  labelSeparator: ', ',
})
