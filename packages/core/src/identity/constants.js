/**
 * Values of core's identity and pairing (task F-PAIR; R-ID-05, R-ID-07, R-ID-10, R-NAME-03;
 * cases AUTH-UC-05, AUTH-DT-06, AUTH-ST-03, NAME-UC-02, NAME-DT-03) that are this module's own.
 *
 * The contract words are core's own copy of the connector's (K3a `MCP`, design §1.0b row 1): the
 * scopes (`MCP.scope`), the tool names (`MCP.tools`), the refusal codes (`MCP.refusal.alreadyPaired`,
 * `idTaken`, `nameTaken`, `nameInvalid`, `idInvalid`), and, through `../link/schema.js`, the id
 * grammar (`isAgentId`) and the name rules (`normaliseName`, `principalLabel`). The link's statuses
 * are the link's (`STATUS`).
 *
 * The settings rows are F-WIRE's (W3 brief, F-PAIR notes), so the defaults they need are exported
 * here as `IDENTITY`.
 */
import { SEAM_PAIRING } from 'fishball-shared/ui-seam'
import { STATUS } from '../link/index.js'

/**
 * `identity.id` and `identity.name` (R-ID-10, R-NAME-03, Q-NAME-1 B).
 * - the generated id is `idPrefix` plus `idRandomChars` characters of `idAlphabet`, the lowercase
 *   RFC 4648 base32 alphabet. Its 32 letters divide 256, so one random byte per character, masked
 *   to `idAlphabet.length - 1`, picks each letter with equal probability;
 * - `defaultName` is the local default only: the connector never assigns a name (R-NAME-04).
 */
export const IDENTITY = Object.freeze({
  idPrefix: 'fb-',
  idRandomChars: 16,
  idAlphabet: 'abcdefghijklmnopqrstuvwxyz234567',
  defaultName: 'Fishball',
  // An `identity.name` set to the empty string is a cleared name: `set_name({name: null})` and a
  // `pair` without a name (NAME-UC-02 E3). An absent setting is the default instead.
  clearedName: '',
})

/**
 * The pairing states of AUTH-ST-03, as `pairing.state().state` reports them.
 * - unpaired: no paired record for the current target and credential (NoRecord); the next
 *   attempt calls `pair`;
 * - paired: a record exists, and the last attempt was admitted (or none has run yet);
 * - warnMatch / warnMismatch: `pair` answered `already-paired` with `idMatches` true / false; the
 *   warning is open and the link sends nothing (AUTH-UC-05 E1);
 * - needToken: the user chose a new token; held, also after a restart (a declined record),
 *   until the credential changes (row 7);
 * - needId: `pair` answered `id-taken`; held until `identity.id` changes, the token stays (row 13);
 * - idMismatch: a record exists but the token request returned the pair-only scope (R-ID-10,
 *   row 9): a new token is needed, and `pair` is never called.
 * The words are fishball-shared's `SEAM_PAIRING.state` (R-FIX-FUI), so fishball-ui's pairing card
 * draws the same ones without importing core.
 */
export const PAIRING_STATE = SEAM_PAIRING.state

/** The states in which the link is held: the attempt ends before the next request. */
export const HELD_STATES = Object.freeze([
  PAIRING_STATE.warnMatch, PAIRING_STATE.warnMismatch, PAIRING_STATE.needToken, PAIRING_STATE.needId, PAIRING_STATE.idMismatch,
])

/**
 * The link status while pairing holds it. The link's target states (`LINK.state`) have no pairing word, so a held link
 * reports that the target does not let this token work (`token-refused`, `TOKEN_REFUSED`); the
 * pairing state says why. Not retried: the hold lasts until a choice or a settings change.
 */
export const HOLD_STATUS = STATUS.refused

/**
 * The warning's choices (R-ID-07), as `pairing.state().choices` lists them; fishball-shared's
 * `SEAM_PAIRING.choice` (R-FIX-FUI).
 * - continue: Continue with this pairing, only with `idMatches: true`, and only once the box is ticked;
 * - newTokenAndId: Use a new token and a new id (`idMatches: true`): the id stays held by the bound entry;
 * - newToken: Use a new token (`idMatches: false`).
 */
export const CHOICE = SEAM_PAIRING.choice

/** The choices of a state with no warning. */
export const NO_CHOICES = Object.freeze([])

/** The choices each warning offers, in display order. */
export const CHOICES_OF = Object.freeze({
  [PAIRING_STATE.warnMatch]: Object.freeze([CHOICE.continue, CHOICE.newTokenAndId]),
  [PAIRING_STATE.warnMismatch]: Object.freeze([CHOICE.newToken]),
})

/** A choice's refusal (`{ok: false, code}`); nothing changes. */
export const CHOICE_REFUSAL = Object.freeze({
  /** Continue without the tick "No other Fishball or agent uses this id with this token" (row 3). */
  notConfirmed: 'not-confirmed',
  /** The choice is not one the current state offers. */
  notOffered: 'not-offered',
  /** Continue could not write its paired record; the warning stays open. */
  notSaved: 'not-saved',
})

/**
 * The granted `scope` of a token response is a list separated by single spaces (RFC 6749 §3.3);
 * core is fully paired only when it holds `MCP.scope.full` (R-OA-04, R-OA-18).
 */
export const SCOPE_LIST = Object.freeze({ separator: ' ' })

/** Where a name refusal came from (NAME-DT-03 "Source"). */
export const NAME_SOURCE = Object.freeze({ pair: 'pair', setName: 'set_name' })

/**
 * Core's identity records: one DSH storage-domain table in the Fishball DSH, at most one
 * non-secret record of each kind per (target origin, credential id), never a token value
 * (`records.js`):
 * - paired: core paired, or chose Continue, with this token; it holds the fishball id, the
 *   connector's name for the pair, the name core last asked for with the connector's answer, and
 *   when core wrote it;
 * - declined: the user chose "Use a new token" for this token (Fishball's decision 2026-11-15,
 *   question 5: it survives a restart), so core never uses it again; it holds when.
 */
export const RECORDS = Object.freeze({
  domain: 'fishball_core_identity',
  table: 'records',
  version: 1,
  kind: Object.freeze({ paired: 'paired', declined: 'declined' }),
})

/** Error messages, never shown to a user. */
export const MISUSE = Object.freeze({
  /** A `TypeError`: a stored record is malformed, so the records table does not open. */
  record: 'fishball-core identity: malformed paired record',
  /** A `TypeError`: the records were opened without their target epoch (MULTI-1). */
  scope: 'fishball-core identity: records need a target id and endpoint epoch',
  /** A `TypeError`: the link's credentials carry no credential id (`ref`, a string). */
  ref: 'fishball-core identity: credentials need a credential id',
  /** A `PairingFailed` (retried like any failure): `pair` answered nothing the decision table knows. */
  pairResult: 'fishball-core identity: pair answered no result',
})
