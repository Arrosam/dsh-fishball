/**
 * The sender an intake message records in its source (`source.author`, DESIGN §10c). The
 * Messenger look reads it in the browser to show a name and avatar; DSH stores a message's
 * source as given and the browser receives it whole (spike S26).
 *
 * `{ kind, name?, seed? }`: kind is the INTAKE_KIND, name the session or source title at
 * arrival (bounded), seed the session id or source identity the avatar colour comes from.
 * Absent parts are left out, never `undefined`: DSH refuses a session event that is not plain
 * JSON.
 */
import { AUTHOR, SESSION_INFO } from './constants.js'
import { cutToBytes } from './text.js'

/**
 * @param kind - INTAKE_KIND of the input.
 * @param sender - { name?, seed? }; an empty name is treated as absent.
 * @returns the author record.
 */
export function authorOf(kind, { name, seed } = {}) {
  const author = { kind }
  if (typeof name === 'string' && name.length > 0) author.name = cutToBytes(name, AUTHOR.nameBytes, SESSION_INFO.ellipsis)
  if (typeof seed === 'string' && seed.length > 0) author.seed = seed
  return author
}

/** The author of a session's message: its title at arrival, seeded by its id. */
export const sessionAuthor = (kind, info) => authorOf(kind, { name: info.title, seed: info.id })
