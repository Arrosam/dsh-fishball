/**
 * Core's `identity.id` and `identity.name` rules (R-ID-02, R-ID-10, R-NAME-03). Pure, except that
 * `generateId` reads randomness. The settings rows that hold the two values are F-WIRE's.
 */
import { randomBytes } from 'node:crypto'
import { ID_REFUSAL, isFishballId, normaliseName } from '../link/schema.js'
import { IDENTITY } from './constants.js'

// 32 letters: a byte masked to 0–31 picks each one with equal probability (see IDENTITY).
const LETTER_MASK = IDENTITY.idAlphabet.length - 1

/**
 * A new `identity.id` for the first start (R-ID-10): `fb-` and 16 random lowercase base32
 * characters, so it is always a valid fishball id (R-ID-02).
 * @param {(size: number) => Uint8Array} [random] random bytes; defaults to `crypto.randomBytes`
 */
export function generateId(random = randomBytes) {
  const letters = [...random(IDENTITY.idRandomChars)].map((byte) => IDENTITY.idAlphabet[byte & LETTER_MASK])
  return IDENTITY.idPrefix + letters.join('')
}

/**
 * The save rule of `identity.id` (R-ID-02, R-ID-10): a valid fishball id replaces the previous
 * one; anything else (a dot included) is refused with `id-invalid`, the previous id stays, and
 * core never sends the refused value.
 * @returns {{ok: true, id: string} | {ok: false, code: string, id: unknown}} `id` is the value in force
 */
export function acceptId(next, previous) {
  if (isFishballId(next)) return Object.freeze({ ok: true, id: next })
  return Object.freeze({ ok: false, code: ID_REFUSAL.idInvalid, id: previous })
}

/**
 * The name core asks the connector for, from the `identity.name` setting (R-NAME-03, NAME-UC-02 E3):
 * absent is the local default "Fishball"; the empty string is a cleared name (`null`); any other
 * value goes to the connector as set, which alone decides `name-invalid` (R-NAME-02).
 */
export function requestedName(setting) {
  if (setting === undefined || setting === null) return IDENTITY.defaultName
  return setting === IDENTITY.clearedName ? null : setting
}

/**
 * Whether the connector's name already is the requested one: the connector stores names
 * normalised (R-NAME-02), so the request is compared normalised, letter case included (a
 * case-only change is a change, NAME-UC-02 A1).
 */
export const sameName = (requested, held) => (requested === null ? held === null : normaliseName(requested) === held)
