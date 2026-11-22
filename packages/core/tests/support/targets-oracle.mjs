/**
 * MULTI-1 oracles derived only from the MULTI-0 freeze (core's contracts/constants.js
 * `TARGETS`, `MESSAGE`, `MCP`; README "MULTI-0 amendment" and its normative examples). No value
 * here is read from core's implementation: each function restates a frozen rule so a case can
 * compute the expected id, key, credential name, alias or tool name independently.
 *
 * Shared by every fishball-core test area that needs a target-qualified expectation (events, asks,
 * bridge, link-save, status, settings, wire, manager), so each rule is written once. Owned by the
 * wire area (packages/core/tests/support/ is port-core-wire's); ported unchanged from the old
 * test/v3/fishball-core/wire/targets-oracle.mjs, same export names.
 */
import { createHash } from 'node:crypto'
// Core's own published contract (inside this package) and fishball-shared's seam by name (core's dependency).
import { APPROVAL, CONNECT, HOSTED_IMPORT, LINK, MCP, MESSAGE, TARGETS } from '../../contracts/constants.js'
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'

export { APPROVAL, CONNECT, HOSTED_IMPORT, LINK, MCP, MESSAGE, SEAM_TARGETS, TARGETS }

const KIND = TARGETS.key.kind
const ID_LETTERS = `[${TARGETS.id.alphabet}]{${TARGETS.id.randomChars}}`
const EPOCH_LETTERS = `[${TARGETS.epoch.alphabet}]{${TARGETS.epoch.randomChars}}`
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The connector tools core knows (CONN-TOOLS, the user's decision relayed 2026-11-18: question_ask and
 * question_answer_own are removed from dsh-connector; core's MCP.tools copy no longer has them). K1's
 * definitions restricted to core's own copy of the names, so neither removed name is ever expected.
 */
export const connectorTools = (k1Tools) => k1Tools.filter((t) => Object.values(MCP.tools).includes(t.name))

/** Generated id / epoch grammars (README "Ids"): prefix + 16 lowercase base32 letters. */
export const ID_PATTERN = Object.freeze({
  target: new RegExp(`^${escape(TARGETS.id.prefix)}${ID_LETTERS}$`),
  epoch: new RegExp(`^${escape(TARGETS.epoch.prefix)}${EPOCH_LETTERS}$`),
  toolName: new RegExp(TARGETS.toolName.allowed),
})

/** `JSON.stringify([kind, targetId, endpointEpoch, remoteId])` (README "Local keys"). */
export const keyOf = (kind, source, remoteId) => JSON.stringify([kind, source.targetId, source.endpointEpoch, remoteId])
/** The plain-token form: base64url of that JSON's UTF-8 bytes. */
export const handleOf = (kind, source, remoteId) => Buffer.from(keyOf(kind, source, remoteId), 'utf8').toString(TARGETS.key.encoding)
/** The tuple a handle encodes (for oracle checks of a handle core produced). */
export const tupleOfHandle = (handle) => JSON.parse(Buffer.from(handle, TARGETS.key.encoding).toString('utf8'))
/** An event's manager message id: `fbe_` + handle of its event tuple (two targets' `event-1` never meet). */
export const eventMessageId = (source, eventId) => MESSAGE.idPrefix + handleOf(KIND.event, source, eventId)
/** An ask card's handle (`AskCard.handle`, kind `approval`). */
export const askHandle = (source, approvalId) => handleOf(KIND.approval, source, approvalId)

/** Per-target credential names (README "Added credentials"; `TARGETS.credentials`). */
export function credentialNamesOf({ targetId, endpointEpoch }) {
  const c = TARGETS.credentials
  const refPart = (text) => text.split(c.refReplaced).join(c.refReplacement)
  const record = (prefix) => CONNECT.grantRecordScope + '/' + prefix + targetId + c.recordSeparator + endpointEpoch
  return Object.freeze({
    tokenRef: c.tokenRefPrefix + refPart(targetId) + c.tokenRefSeparator + refPart(endpointEpoch),
    tokenRecord: record(c.tokenRecordPrefix),
    grantRecord: record(c.grantRecordPrefix),
  })
}
/**
 * The parent's reserved names (README "Hosted reservation"; contracts README notes the pending
 * record `fishball-core/pending-token-origin` is core-internal but still the parent's alone).
 */
export const PARENT_NAMES = Object.freeze({
  tokenRef: HOSTED_IMPORT.credentialRef,
  savedRecord: HOSTED_IMPORT.savedRecord.key,
  pendingRecord: CONNECT.grantRecordScope + '/pending-token-origin',
})

/** The resolved display name of a raw name and its persisted suffix (`TargetSource.name`). */
export const resolvedName = (serverName, suffix) => (serverName === null ? null : suffix === null ? serverName : serverName + TARGETS.duplicate.open + suffix + TARGETS.duplicate.close)
/**
 * Lowest-free allocation (D07, Q03): `held` are the complete resolved names other current targets
 * hold. Returns the suffix (`null` = the raw name itself).
 */
export function allocateSuffix(serverName, held) {
  if (!held.includes(serverName)) return null
  for (let n = TARGETS.duplicate.firstSuffix; ; n += 1) if (!held.includes(resolvedName(serverName, n))) return n
}

/** The readable part of a model-facing tool name (`TARGETS.toolName` readable rule). */
export function readableOf(name) {
  const t = TARGETS.toolName
  if (name === null) return t.readableFallback
  const trim = (s) => s.replace(new RegExp(`^${escape(t.readableJoin)}+|${escape(t.readableJoin)}+$`, 'g'), '')
  const cut = trim(trim(name.normalize(t.normalForm).replace(new RegExp(t.readableOutside, 'g'), t.readableJoin).toLowerCase()).slice(0, t.readableMaxChars))
  return cut === '' ? t.readableFallback : cut
}
/** The facade part: K2 dotted public name with `.` → `__`, or a core / local name unchanged. */
export const facadeOf = (rawName) => rawName.split(MCP.namespace.externalName.replaced).join(MCP.namespace.externalName.replacement)
/** The 12-hex digest over `[digestVersion, targetId, endpointEpoch, name, origin, rawName]`. */
export function digestOf(source, origin, rawName) {
  const t = TARGETS.toolName
  return createHash(t.digestAlgorithm).update(JSON.stringify([t.digestVersion, source.targetId, source.endpointEpoch, source.name, origin, rawName]), 'utf8').digest('hex').slice(0, t.digestHexChars)
}
/**
 * The model-facing name (README "Tool names"): `mcp__<readable>__<facade>_<digest>`, the facade
 * cut from the end to fit `maxChars`. `source.name` is the resolved name.
 */
export function toolNameOf(source, rawName, origin = TARGETS.toolName.origin.remote) {
  const t = TARGETS.toolName
  const head = t.prefix + readableOf(source.name) + t.separator
  const tail = t.digestSeparator + digestOf(source, origin, rawName)
  const room = t.maxChars - head.length - tail.length
  return head + facadeOf(rawName).slice(0, room) + tail
}
/** The local `ask_user` helper's name for one target (origin `local`). */
export const askToolNameOf = (source, askTool) => toolNameOf(source, askTool, TARGETS.toolName.origin.local)

/** Two fixed, grammar-valid sources for unit worlds (test data, not product ids). */
const fixedId = (prefix, letter) => prefix + letter.repeat(TARGETS.id.randomChars)
export const SOURCE = Object.freeze({
  a: Object.freeze({ targetId: fixedId(TARGETS.id.prefix, 'a'), endpointEpoch: fixedId(TARGETS.epoch.prefix, 'a'), serverName: 'Office-DSH', name: 'Office-DSH' }),
  b: Object.freeze({ targetId: fixedId(TARGETS.id.prefix, 'b'), endpointEpoch: fixedId(TARGETS.epoch.prefix, 'b'), serverName: 'Office-DSH', name: 'Office-DSH (2)' }),
  /** Target a after an endpoint change: same id, new epoch. */
  aNext: Object.freeze({ targetId: fixedId(TARGETS.id.prefix, 'a'), endpointEpoch: fixedId(TARGETS.epoch.prefix, 'c'), serverName: 'Office-DSH', name: 'Office-DSH' }),
})
