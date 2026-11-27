/**
 * The rules core derives from its own copy of the connector's public MCP surface (design §1.0b
 * row 1, decided item D1; requirements R-ARCH-10). The values are K3a's `MCP` in
 * `contracts/constants.js`. That file is data only by the K3 freeze, so the pure rules built on
 * those values live here, in the one module that derives them. Core reads nothing of the DSH side,
 * neither at runtime nor at build time: no import, no vendored copy, no generator.
 *
 * Each rule restates the connector's rule of the same name (its `mcp-schema` rules.js and
 * oauth.js) from core's values, because the two sides share no code (requirements 1.39, 1.40).
 * So a K1 change on the connector side shows up as a failing contract test (K3a, F-OWN-SCHEMA),
 * never as a silent change here.
 * Every function is total: none throws, whatever the input.
 */
import { MCP } from '../../contracts/constants.js'

// Compiled once from the copy's pattern strings (the copy keeps them as strings to stay data only).
const AGENT_ID = new RegExp(MCP.id.pattern)
const WHITESPACE_RUN = new RegExp(MCP.name.whitespaceRun, MCP.name.patternFlags)
const NAMESPACE_OUTSIDE = new RegExp(MCP.namespace.outside)
const NAMESPACE_IDENTIFYING = new RegExp(MCP.namespace.identifying)
const LOCAL_NAME = new RegExp(MCP.namespace.localName)
const FIXED_EVENT_TYPES = Object.freeze(Object.values(MCP.eventTypes))

/** Every core tool name `tools/list` lists. Core tells core tools from contributed ones by this list (design §13.3). */
export const TOOL_NAMES = Object.freeze(Object.values(MCP.tools))

/** Whether a value is a valid agent id (R-ID-02): 1–64 of `A–Z a–z 0–9 _ -`, no dot. */
export const isAgentId = (value) => typeof value === 'string' && AGENT_ID.test(value)

/**
 * A name as the connector stores and shows it (R-NAME-02): every run of Unicode White_Space becomes
 * one space, the ends are trimmed, then NFC. Returns `undefined` for a non-string.
 */
export function normaliseName(value) {
  if (typeof value !== 'string') return undefined
  return value.split(WHITESPACE_RUN).filter((part) => part.length > 0).join(MCP.name.space).normalize(MCP.name.normalForm)
}

/** How a principal is shown (R-NAME-08): its name as plain text, or `{prefix: 'ID: ', id}` with the prefix drawn bold. */
export const principalLabel = (name, id) => (name === null ? Object.freeze({ prefix: MCP.name.namelessPrefix, id }) : Object.freeze({ name }))

/**
 * Whether a value is an event `type` (R-EVS-02): a fixed type, or `contributed:<namespace>.<name>`
 * whose namespace is one a contributor may hold (K2's alphabet, not reserved) and whose public name
 * keeps K2's local-name grammar and length bound.
 */
export function isEventType(value) {
  if (typeof value !== 'string') return false
  if (FIXED_EVENT_TYPES.includes(value)) return true
  if (!value.startsWith(MCP.contributedTypePrefix)) return false
  const publicName = value.slice(MCP.contributedTypePrefix.length)
  // A namespace holds no separator, so the first separator ends it (K2 NAMESPACE).
  const separator = publicName.indexOf(MCP.namespace.separator)
  if (separator <= 0) return false
  const namespace = publicName.slice(0, separator)
  if (NAMESPACE_OUTSIDE.test(namespace) || !NAMESPACE_IDENTIFYING.test(namespace) || MCP.namespace.reserved.includes(namespace)) return false
  return LOCAL_NAME.test(publicName.slice(separator + 1)) && publicName.length <= MCP.namespace.publicMaxChars
}

/**
 * The OAuth issuer the connector at `origin` names (R-OA-01). `origin` is `<scheme>://<host>[:port]`
 * with no path, as the link dials it.
 */
export const issuerOf = (origin) => origin + MCP.paths.issuer
