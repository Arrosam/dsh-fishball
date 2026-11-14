/**
 * Which of the link's listed tools the model is offered, and under which name (task F-FACADE;
 * design §6.3, §13.3; R-EXT-14; Q-8). Pure: the same list always gives the same offer.
 */
import { TOOL_NAMES } from '../link/schema.js'
import { FACADE, LOG, MODEL_NAME } from './constants.js'

const isCoreTool = (name) => TOOL_NAMES.includes(name)

/** The model-facing name of one listed tool (MODEL_NAME), before the uniqueness check. */
export const modelNameOf = (name) => (isCoreTool(name) ? name : name.split(MODEL_NAME.dot).join(MODEL_NAME.separator))

/** Why a model-facing name cannot be offered, or `undefined` when it can. */
function unusable(modelName, taken) {
  if (modelName.startsWith(MODEL_NAME.refusedPrefix)) return LOG.reason.mcpPrefix
  if (modelName.length > MODEL_NAME.maxChars || !MODEL_NAME.allowed.test(modelName)) return LOG.reason.invalid
  return taken.has(modelName) ? LOG.reason.duplicate : undefined
}

/**
 * @typedef {object} Offered
 * @property {string} name the tool's name at the connector, sent on every call
 * @property {string} modelName the name the model sees
 * @property {object} tool the MCP `Tool` as the link listed it
 * @property {boolean} contributed whether a contributor plugin, not the connector, provides it
 */

/**
 * The offer for one listed set, in the link's order (core tools first, then contributed ones by
 * public name, R-EXT-12), so the first of two clashing names is the one kept.
 * @param {readonly object[]} tools `link.tools()`
 * @returns {{offered: readonly Offered[], refused: readonly {name: string, modelName: string, reason: string}[]}}
 */
export function offerOf(tools) {
  const offered = []
  const refused = []
  const taken = new Set()
  for (const tool of tools) {
    const { name } = tool
    if (typeof name !== 'string' || FACADE.withheld.includes(name)) continue
    const modelName = modelNameOf(name)
    const reason = unusable(modelName, taken)
    if (reason !== undefined) { refused.push(Object.freeze({ name, modelName, reason })); continue }
    taken.add(modelName)
    offered.push(Object.freeze({ name, modelName, tool, contributed: !isCoreTool(name) }))
  }
  return Object.freeze({ offered: Object.freeze(offered), refused: Object.freeze(refused) })
}
