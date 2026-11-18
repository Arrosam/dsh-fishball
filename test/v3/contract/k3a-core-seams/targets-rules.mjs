/**
 * A pure reference reading of the MULTI-0 naming rules, written from the core contracts README
 * ("MULTI-0 amendment", rows "Local keys", "Added credentials", "Duplicate names", "Tool names")
 * and the rule text `constants.js` publishes beside `TARGETS`, never from core's implementation
 * (MULTI-1 builds that). Every parameter comes from the `TARGETS` object passed in, so the README's
 * normative Examples check the frozen values themselves; the rows then hold the slices to them.
 */
import { createHash } from 'node:crypto'

/** `s` with every leading and trailing `ch` removed. */
function trimChar(s, ch) {
  let from = 0
  let to = s.length
  while (from < to && s.startsWith(ch, from)) from += ch.length
  while (to > from && s.endsWith(ch, to)) to -= ch.length
  return s.slice(from, to)
}

/** A generated id of a format (`TARGETS.id` / `.epoch`) from chosen alphabet letters (fixture, not random). */
export const generatedId = (format, letters) => format.prefix + letters

/** README "Local keys": the tuple key, its base64url plain-token handle, and the manager message id. */
export const keyOf = (kind, targetId, endpointEpoch, remoteId) => JSON.stringify([kind, targetId, endpointEpoch, remoteId])
export const handleOf = (T, key) => Buffer.from(key, 'utf8').toString(T.key.encoding)
export const messageIdOf = (MESSAGE, T, key) => MESSAGE.idPrefix + handleOf(T, key)

/** README "Added credentials": the per-target reference (every `-` written `_`) and the two record keys. */
export function tokenRefOf(T, targetId, endpointEpoch) {
  const c = T.credentials
  return (c.tokenRefPrefix + targetId + c.tokenRefSeparator + endpointEpoch).replaceAll(c.refReplaced, c.refReplacement)
}
export const recordIdOf = (T, recordPrefix, targetId, endpointEpoch) => recordPrefix + targetId + T.credentials.recordSeparator + endpointEpoch
export const recordKeyOf = (scope, separator, id) => scope + separator + id

/**
 * The readable key: NFKD, each run outside [A-Za-z0-9] one join character, lower case, join
 * trimmed, cut to `readableMaxChars`, trimmed again; the fallback when nothing is left or no name.
 */
export function readableOf(T, name) {
  const t = T.toolName
  if (name === null) return t.readableFallback
  const joined = name.normalize(t.normalForm).replace(new RegExp(t.readableOutside, 'g'), t.readableJoin).toLowerCase()
  const cut = trimChar(trimChar(joined, t.readableJoin).slice(0, t.readableMaxChars), t.readableJoin)
  return cut === '' ? t.readableFallback : cut
}
/** The facade: a K2 dotted name with each `.` written as `MCP.namespace.externalName.replacement`. */
export const facadeOf = (MCP, rawName) => rawName.replaceAll(MCP.namespace.externalName.replaced, MCP.namespace.externalName.replacement)
/** The digest: the first hex characters of SHA-256 over `JSON.stringify([version, id, epoch, name, origin, rawName])`. */
export function digestOf(T, { targetId, endpointEpoch }, name, origin, rawName) {
  const t = T.toolName
  const text = JSON.stringify([t.digestVersion, targetId, endpointEpoch, name, origin, rawName])
  return createHash(t.digestAlgorithm).update(text, 'utf8').digest('hex').slice(0, t.digestHexChars)
}
/** The fixed characters of a final name besides the readable key and the facade. */
export const fixedChars = (T) => T.toolName.prefix.length + T.toolName.separator.length + T.toolName.digestSeparator.length + T.toolName.digestHexChars
/** The final model-facing name, the facade cut from the end to the room left inside `maxChars`. */
export function toolNameOf(T, MCP, target, name, origin, rawName) {
  const t = T.toolName
  const readable = readableOf(T, name)
  const room = t.maxChars - fixedChars(T) - readable.length
  const facade = facadeOf(MCP, rawName).slice(0, room)
  return t.prefix + readable + t.separator + facade + t.digestSeparator + digestOf(T, target, name, origin, rawName)
}

/**
 * README "Duplicate names" (D07, Q03, PLAN-MULTI §4.2) as a state machine over a profile's targets:
 * an unchanged observed name keeps its allocation; a changed one relinquishes it and claims the raw
 * name if no other target's complete resolved name is it, else the lowest n from `firstSuffix`
 * whose `name + open + n + close` no other target holds. Removal frees a name; nobody renumbers.
 */
export function duplicateAllocator(T) {
  const d = T.duplicate
  const targets = new Map()
  const resolved = ({ serverName, suffix }) => (suffix === null ? serverName : serverName + d.open + suffix + d.close)
  const heldByOthers = (target) => new Set([...targets].filter(([k]) => k !== target).map(([, v]) => resolved(v)))
  return {
    observe(target, serverName) {
      if (targets.get(target)?.serverName === serverName) return
      const held = heldByOthers(target)
      let suffix = null
      if (held.has(serverName)) for (suffix = d.firstSuffix; held.has(serverName + d.open + suffix + d.close); suffix += 1);
      targets.set(target, { serverName, suffix })
    },
    remove(target) { targets.delete(target) },
    names: () => Object.fromEntries([...targets].map(([k, v]) => [k, resolved(v)])),
  }
}
