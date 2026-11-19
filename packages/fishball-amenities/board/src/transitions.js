import { BOARD_LIMITS, REFUSAL, RELATION, STATUS, TRANSITIONS } from './constants.js'
import { parseRef } from './ids.js'

const RULE = Object.freeze({
  waitingUser: 'user',
  sessionKind: 'session',
  boardKind: 'board',
  relationByKind: Object.freeze({ session: RELATION.about, event: RELATION.source, board: RELATION.blocks }),
  minimumTime: 0,
})

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const refuse = code => { throw Object.assign(new Error(code), { code }) }

/** Undefined is the creation source; all other sources must be actual statuses. */
export function canMove(from, to) {
  const targets = from === undefined ? TRANSITIONS.new
    : Object.values(STATUS).includes(from) ? TRANSITIONS[from] : undefined
  return targets?.includes(to) ?? false
}

export function isOpen(status) {
  return TRANSITIONS.new.includes(status)
}

const validWaitingTarget = value => value === RULE.waitingUser || parseRef(value)?.kind === RULE.sessionKind

/**
 * Pure card transition; returns a new card and copies link objects. `previous`
 * is undefined for creation, otherwise the latest card (including archive lookup).
 * `changes` is a caller-validated card/patch; status is required. `at` is an
 * explicit nonnegative safe-integer epoch millisecond timestamp. Omitted patch
 * fields retain their values. Identity/creation time cannot be changed by a patch.
 * Throws invalid-input, bad-transition, waiting-target or link-invalid with a
 * `code` property.
 *
 * The caller owns title/note validation, new ids, full-board omission/uniqueness,
 * link graph validation and persistence. No clock ordering is imposed here.
 */
export function transitionCard(previous, changes, at) {
  if (!isRecord(changes) || (previous !== undefined && !isRecord(previous)) ||
      !Number.isSafeInteger(at) || at < RULE.minimumTime) refuse(REFUSAL.invalidInput)
  if ((previous !== undefined && !Object.values(STATUS).includes(previous.status)) ||
      !canMove(previous?.status, changes.status)) refuse(REFUSAL.badTransition)
  const card = { ...previous, ...changes, updatedAt: at }
  if (previous !== undefined) {
    card.id = previous.id
    card.createdAt = previous.createdAt
  } else {
    card.createdAt = at
  }
  if (card.status === STATUS.waiting) {
    if (!validWaitingTarget(card.waitingOn)) refuse(REFUSAL.waitingTarget)
  } else {
    // A stale supplied target must not survive leaving waiting.
    delete card.waitingOn
  }
  if (isOpen(card.status)) delete card.closedAt
  else card.closedAt = previous?.status === card.status ? previous.closedAt : at
  if (card.links !== undefined) {
    if (!Array.isArray(card.links) || card.links.some(link => !isRecord(link))) refuse(REFUSAL.linkInvalid)
    card.links = card.links.map(link => ({ ...link }))
  }
  return card
}

/**
 * Return null or link-invalid. `cards` is the resolved candidate graph, including
 * this card and any archived targets needed by the caller. Resolve all changes
 * before checking each card so newly introduced reciprocal edges are detected.
 * Only direct self-links and two-card cycles are forbidden by the contract.
 * No I/O, graph mutation, deduplication or longer-cycle policy is introduced.
 */
export function validateLinks(card, cards) {
  if (!isRecord(card) || parseRef(card.id)?.kind !== RULE.boardKind || !Array.isArray(cards)) {
    return REFUSAL.linkInvalid
  }
  const links = card.links
  if (links === undefined) return null
  if (!Array.isArray(links) || links.length > BOARD_LIMITS.links) return REFUSAL.linkInvalid
  for (const link of links) {
    if (!isRecord(link)) return REFUSAL.linkInvalid
    const ref = parseRef(link.to)
    if (!ref || link.relation !== RULE.relationByKind[ref.kind]) return REFUSAL.linkInvalid
    if (ref.kind !== RULE.boardKind) continue
    const target = cards.find(candidate => candidate?.id === ref.id)
    if (!target || ref.id === card.id || !cards.some(candidate => candidate?.id === card.id)) {
      return REFUSAL.linkInvalid
    }
    if (target.links !== undefined && !Array.isArray(target.links)) return REFUSAL.linkInvalid
    if (target.links?.some(edge => edge?.relation === RELATION.blocks && edge.to === card.id)) {
      return REFUSAL.linkInvalid
    }
  }
  return null
}
