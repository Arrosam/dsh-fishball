/**
 * C-TOKENS' own constants (design §5.1–§5.3, §5.6; R-TOK-04/05/08/09). The token tunables
 * (prefix, byte count, minimum length, digest algorithm) and the status and refusal words are K1's
 * (`TOKEN_VALUE`, `ENTRY_STATUS`, `SETTINGS_REFUSAL`) and are imported, never restated here.
 */
import { PLUGIN } from '../constants.js'

/** The durable entry records: one storage domain of the connector (`$DSH_HOME/storages/…`). */
export const TOKEN_STORE = Object.freeze({
  // DSH requires /^[a-z][a-z0-9_]*$/ for domain and table names.
  domain: 'fishball_tokens',
  // A changed record shape must bump this (DSH refuses to open a version it does not know).
  version: 1,
  table: 'entries',
})

/**
 * The fingerprint key (Fishball's decision 2026-11-14, question 2 = A): an HMAC key kept in a
 * credential record the connector owns, so a value changed or unset while the connector was down
 * is detected at the next start without the storage file holding anything a low-entropy user
 * value could be brute-forced from. `scope/id` is DSH's CredentialKey grammar (the owner's
 * registered name, then its own unit); the plain string is the branded key at runtime.
 * `grant` because DSH stores only `api-key` and `grant` records, and a grant's payload is the
 * owner's own JSON that DSH never reads or reshapes; an api-key record is read as a provider key.
 */
export const DIGEST_KEY = Object.freeze({
  recordKey: `${PLUGIN.name}/token-digest-key`,
  recordKind: 'grant',
  keyBytes: 32,
  idBytes: 16,
  encoding: 'base64url',
})

/** Opaque, non-secret entry keys (K1 `EntryKey`): random, never derived from the ref or label. */
export const ENTRY_KEY = Object.freeze({ bytes: 16, encoding: 'base64url' })

/** Encoding of a generated token value after `TOKEN_VALUE.generatedPrefix` (design §5.2). */
export const VALUE_ENCODING = 'base64url'
/** Encoding of a stored fingerprint. */
export const FINGERPRINT_ENCODING = 'hex'

/**
 * DSH's CredentialRef grammar (`@deepseek-ai/dsh-credentials` REF_PATTERN, a POSIX shell
 * identifier), checked here because a ref outside it can hold no value: `credentials.*` would
 * throw. Its `isCredentialRefName` is the authoritative rule, but that package is not among the
 * connector's declared peers and the manifest is not C-TOKENS' to change (v3-tasks W2), so the
 * grammar is restated here; C-WIRE may swap this for the import when it owns the manifest.
 */
export const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** K1 `TokenEntry.generation`: a new entry's first, and what each revocation adds. */
export const GENERATION = Object.freeze({ first: 0, step: 1 })

/** A settings field that is absent or not a string reads as this. */
export const NO_TEXT = ''

/**
 * K1 `RevocationKind` (a type only in K1, so the words are written once here; a K1 runtime
 * constant would be a K1 amendment). When one sync sees a disable and a value change, `disabled`
 * is reported.
 */
export const REVOCATION = Object.freeze({ deleted: 'deleted', disabled: 'disabled', valueChanged: 'value-changed' })

/**
 * dsh-credentials' event for a committed change of a stored reference value. The other layers
 * (the process environment, `.env` files) are read once at DSH's launch and cannot change while it
 * runs, so a change there is seen by the fingerprint check of the start sync.
 */
export const CREDENTIALS_UPDATED = 'credentials/reference-updated'

/**
 * Why a sync runs. Only `settings` counts as "the user saved the settings": only a save is refused
 * and undone for a value duplicate (Q4 = A), and only a save ends an unset value's wait for a
 * generated one (Q5 = B); see registry.js.
 */
export const SYNC_REASON = Object.freeze({ start: 'start', settings: 'settings', credentials: 'credentials' })

/** Log lines: labels only, never a value, a fingerprint or a key (R-TOK-04). */
export const LOG = Object.freeze({
  digestKeyEphemeral: 'token fingerprint key not stored (%s); changes made while the connector is down go undetected this run',
  credentialRead: 'token entry "%s": credential not readable (%s)',
  generateFailed: 'token entry "%s": generated value not stored (%s)',
  unsetFailed: 'deleted token entry: generated value not removed yet (%s)',
  refDuplicate: 'token entries %s share one ref (ref-duplicate); %s',
  refDuplicateRefused: 'the save was refused',
  refDuplicateLeftOut: 'they are left out until the refs differ',
  valueDuplicate: 'token entries %s hold the same value (value-duplicate); %s',
  valueDuplicateRestored: 'the save was undone',
  valueDuplicateUnusable: 'they stay unusable until the values differ',
  restoreFailed: 'previous token settings not restored (%s)',
  listenerFailed: 'token revocation listener failed (%s)',
  syncFailed: 'token sync failed (%s)',
  storeWriteFailed: 'token entry record not written yet; the entry stays unusable until it is (%s)',
  repairedRef: 'token entry records sharing one ref were found at start; they are treated as deleted',
  invalidRecord: 'invalid token entry record',
  labelSeparator: ', ',
})
