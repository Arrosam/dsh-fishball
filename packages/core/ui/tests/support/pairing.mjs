/**
 * Core's `ui.pairing` view as fishball-ui's pairing view model (src/pairing) and the sidebar target
 * details draw it (F-PAIR, R-ID-07, R-ID-10, R-NAME-03, R-NAME-08): `{state, warning, choices,
 * nameIssue}`. The words are the seam's (ui-seam SEAM_PAIRING, ./seam.mjs); the refusal codes are
 * core's choose answers (K3a). Fixture values only.
 */
import { SEAM_PAIRING } from './seam.mjs'

export const STATE = SEAM_PAIRING.state
export const CHOICE = SEAM_PAIRING.choice
export const NAME_CODE = Object.freeze({ taken: SEAM_PAIRING.nameRefusal.nameTaken, invalid: SEAM_PAIRING.nameRefusal.nameInvalid })
/** Core's refusals of a choice (F-PAIR `choose`). */
export const REFUSAL = Object.freeze({ notOffered: 'not-offered', notConfirmed: 'not-confirmed', notSaved: 'not-saved' })
/** A nameless bound pair is shown by its id behind this prefix (the requirement). */
export const ID_PREFIX = 'ID: '

export const PAIRING_FIXTURE = Object.freeze({
  boundId: 'fbtest-bound-id',
  otherBoundId: 'fbtest-other-bound',
  name: 'Fbtest Navigator',
  otherName: 'Fbtest Other',
  pairedAt: 1_790_000_000_000,
  /** A last-seen time whose calendar date differs between FIXTURE.zones. */
  lastSeenAt: 1_800_000_000_000,
  source: 'fbtest-source',
})

/** The choices core offers per state (the requirement's table). */
const OFFERED = Object.freeze({
  [STATE.warnMatch]: Object.freeze([CHOICE.continue, CHOICE.newTokenAndId]),
  [STATE.warnMismatch]: Object.freeze([CHOICE.newToken]),
})

/** A warning as core's view carries it; `inUse` is `{name}` or, nameless, `{prefix, id}`. */
export const warningOf = ({ idMatches = true, lastSeenAt = PAIRING_FIXTURE.lastSeenAt, nameless = false, name = PAIRING_FIXTURE.name, boundId = PAIRING_FIXTURE.boundId } = {}) => Object.freeze({
  boundId, name: nameless ? null : name, pairedAt: PAIRING_FIXTURE.pairedAt, lastSeenAt, idMatches, advice: null,
  inUse: Object.freeze(nameless ? { prefix: ID_PREFIX, id: boundId } : { name }),
})
/** A name issue (its `source` is core's and is not drawn). */
export const nameIssueOf = (code, { nameless = false, name = PAIRING_FIXTURE.name } = {}) => Object.freeze({
  source: PAIRING_FIXTURE.source, code, inUse: Object.freeze(nameless ? { prefix: ID_PREFIX, id: PAIRING_FIXTURE.boundId } : { name }),
})
/** One core view; the warn states get their default warning unless one is given. */
export function coreView(state, { warning = null, nameIssue = null } = {}) {
  const defaultWarning = state === STATE.warnMatch ? warningOf() : state === STATE.warnMismatch ? warningOf({ idMatches: false }) : null
  return Object.freeze({ state, warning: warning ?? defaultWarning, choices: OFFERED[state] ?? Object.freeze([]), nameIssue })
}
