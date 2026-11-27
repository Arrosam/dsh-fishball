/**
 * The Fishball-local names of a target (task MULTI-1; PLAN-MULTI §4.2, §4.4; MULTI-0 `TARGETS.duplicate`,
 * `TARGETS.toolName`, the normative examples in `contracts/README.md`). Pure.
 *
 * - `allocateSuffix`: the duplicate display alias (D07, Q03). A target claims its raw server name
 *   when no other current target's complete resolved name equals it, else the lowest `n` from
 *   `firstSuffix` whose ` (n)` form is free. Only the target whose server name changed calls it, so
 *   no other target is ever renumbered (the caller keeps every other allocation as persisted).
 * - `toolNameOf`: the model-facing name of one exposed remote tool or target-bound local helper.
 *   The readable part is derived from the untrusted resolved name, but only `[a-z0-9-]` of it
 *   survives; the digest carries the trusted target id and epoch, so the name is a safe key, never
 *   the display identity.
 */
import { createHash } from 'node:crypto'
import { TARGETS } from '../../contracts/constants.js'

const DUP = TARGETS.duplicate
const TOOL = TARGETS.toolName
const OUTSIDE = new RegExp(TOOL.readableOutside, 'g')
const ALLOWED = new RegExp(TOOL.allowed)
const JOIN = TOOL.readableJoin

/** `name` with the display suffix `n`, or `name` itself for `null` (TargetSource.name). */
export const resolvedName = (serverName, suffix) => (serverName === null ? null : suffix === null ? serverName : serverName + DUP.open + suffix + DUP.close)

/**
 * The suffix the target that just observed `serverName` holds: `null` when that exact name is free
 * among `taken` (the other current targets' resolved names), else the lowest free `n`.
 * @param {string} serverName
 * @param {ReadonlySet<string>} taken
 * @returns {number | null}
 */
export function allocateSuffix(serverName, taken) {
  if (!taken.has(serverName)) return null
  let n = DUP.firstSuffix
  while (taken.has(resolvedName(serverName, n))) n += 1
  return n
}

/** `-` trimmed at both ends of a readable part. */
const trimJoin = (text) => {
  let start = 0
  let end = text.length
  while (start < end && text[start] === JOIN) start += 1
  while (end > start && text[end - 1] === JOIN) end -= 1
  return text.slice(start, end)
}

/** The readable part of a resolved name (the `TARGETS.toolName` comment's steps, in order). */
export function readableOf(name) {
  if (typeof name !== 'string') return TOOL.readableFallback
  const slug = trimJoin(name.normalize(TOOL.normalForm).replace(OUTSIDE, JOIN).toLowerCase())
  return trimJoin(slug.slice(0, TOOL.readableMaxChars)) || TOOL.readableFallback
}

/** The digest of one binding tuple (`[digestVersion, targetId, endpointEpoch, name, origin, rawName]`). */
const digestOf = (tuple) => createHash(TOOL.digestAlgorithm).update(JSON.stringify(tuple), 'utf8').digest('hex').slice(0, TOOL.digestHexChars)

/**
 * The binding of one tool: its final name and the tuple it is bound to (the tool-bindings record).
 * @param {{targetId: string, endpointEpoch: string, name: string | null}} source the target epoch
 * @param {string} facade the façade name (a core tool, `__`-mapped contributed name, or local helper)
 * @param {string} rawName the name sent to the connector (or the local helper's own name)
 * @param {string} origin `TOOL.origin.remote` or `TOOL.origin.local`
 * @returns {{name: string, tuple: string, valid: boolean}} `valid` false when the result breaks the
 *   model-facing grammar (a façade with a character outside it): never registered
 */
export function toolNameOf(source, facade, rawName, origin) {
  const tuple = [TOOL.digestVersion, source.targetId, source.endpointEpoch, source.name, origin, rawName]
  const readable = readableOf(source.name)
  const head = TOOL.prefix + readable + TOOL.separator
  const tail = TOOL.digestSeparator + digestOf(tuple)
  const name = head + facade.slice(0, TOOL.maxChars - head.length - tail.length) + tail
  return Object.freeze({ name, tuple: JSON.stringify(tuple), valid: ALLOWED.test(name) })
}
