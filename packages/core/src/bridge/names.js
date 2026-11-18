/**
 * Which of the link's listed tools the model is offered, and under which name (task F-FACADE;
 * design §6.3, §13.3; R-EXT-14; Q-8). Pure: the same list always gives the same offer.
 *
 * MULTI-1 (PLAN-MULTI §4.4): the façade name (`modelNameOf`, the rules below) is only the middle
 * of the name the model sees; the caller's `finalName` maps it to the target-qualified name
 * (`targets/names.js` `toolNameOf`), whose uniqueness is then checked. Without one (a single
 * link's caller) the façade name is the final name.
 */
import { TOOL_NAMES } from '../link/schema.js'
import { FACADE, LOG, MODEL_NAME } from './constants.js'

const isCoreTool = (name) => TOOL_NAMES.includes(name)

/** The model-facing name of one listed tool (MODEL_NAME), before the uniqueness check. */
export const modelNameOf = (name) => (isCoreTool(name) ? name : name.split(MODEL_NAME.dot).join(MODEL_NAME.separator))

/**
 * Why a listed tool cannot be offered under the façade name `modelName`, or `undefined` when it can.
 * `namespaced`: the final name is target-qualified (MULTI-0 `TARGETS.toolName`), which cuts the façade
 * to fit and carries the digest, so only the façade's grammar counts, not its length, and an `mcp__`
 * façade is no longer a raw DSH MCP name.
 */
function unusable(name, modelName, namespaced) {
  if (!isCoreTool(name) && !name.includes(MODEL_NAME.dot)) return LOG.reason.notNamespaced
  if (!namespaced && modelName.startsWith(MODEL_NAME.refusedPrefix)) return LOG.reason.mcpPrefix
  if ((!namespaced && modelName.length > MODEL_NAME.maxChars) || !MODEL_NAME.allowed.test(modelName)) return LOG.reason.invalid
  return undefined
}

/** The façade name as the final name (no namespace). */
const BARE = (facade) => Object.freeze({ name: facade, valid: true })

/**
 * @typedef {object} Offered
 * @property {string} name the tool's name at the connector, sent on every call
 * @property {string} facade the façade name (`modelNameOf`)
 * @property {string} modelName the name the model sees
 * @property {string | undefined} tuple the binding tuple of a namespaced name (`toolNameOf`)
 * @property {object} tool the MCP `Tool` as the link listed it
 * @property {boolean} contributed whether a contributor plugin, not the connector, provides it
 */

/**
 * The offer for one listed set, in the link's order (core tools first, then contributed ones by
 * public name, R-EXT-12), so the first of two clashing names is the one kept.
 * @param {readonly object[]} tools `link.tools()`
 * @param {(facade: string, name: string) => {name: string, tuple?: string, valid: boolean}} [finalName]
 * @returns {{offered: readonly Offered[], refused: readonly {name: string, modelName: string, reason: string}[]}}
 */
export function offerOf(tools, finalName = BARE) {
  const offered = []
  const refused = []
  const taken = new Set()
  for (const tool of tools) {
    const { name } = tool
    if (typeof name !== 'string' || FACADE.withheld.includes(name)) continue
    const facade = modelNameOf(name)
    const final = finalName(facade, name)
    const reason = unusable(name, facade, finalName !== BARE) ?? (final.valid ? undefined : LOG.reason.invalid) ?? (taken.has(final.name) ? LOG.reason.duplicate : undefined)
    if (reason !== undefined) { refused.push(Object.freeze({ name, modelName: final.name, reason })); continue }
    taken.add(final.name)
    offered.push(Object.freeze({ name, facade, modelName: final.name, tuple: final.tuple, tool, contributed: !isCoreTool(name) }))
  }
  return Object.freeze({ offered: Object.freeze(offered), refused: Object.freeze(refused) })
}
