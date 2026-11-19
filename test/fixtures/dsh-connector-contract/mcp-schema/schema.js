/**
 * Small builders for the JSON Schemas of the core tools and events (task K1).
 *
 * Every schema they build stays inside DSH's enforced subset, K2's SCHEMA_SUBSET
 * (`../tools/constants.js`): `type` or an exact-one `oneOf`, object `properties` / `required` /
 * boolean `additionalProperties`, array `items`, scalar `enum` / `const`, annotations. The reason
 * is the stock client: `dsh-mcp-client` registers a tool's `inputSchema` through DSH's tool
 * registry, which refuses any other keyword, and one refused tool makes it register **none**
 * (`syncTools`, both SDKs). So no length, pattern or range keyword appears; those bounds are the
 * domain's checks (design §3.2: "byte limits are checked in domain code").
 *
 * Every object is closed (`additionalProperties: false`): an undeclared argument is
 * `invalid-arguments` [spec: server/tools § Security Considerations; TQ-12].
 */
import { SCHEMA_SUBSET } from '../tools/constants.js'

const { type: TYPE } = SCHEMA_SUBSET

const described = (node, description) => (description === undefined ? node : { ...node, description })

/** A closed object. `optional` keys are declared but not required. */
export function object(required, optional = {}, description) {
  const properties = { ...required, ...optional }
  const node = { type: TYPE.object, properties, additionalProperties: false }
  const requiredKeys = Object.keys(required)
  return described(requiredKeys.length > 0 ? { ...node, required: requiredKeys } : node, description)
}

export const string = (description) => described({ type: TYPE.string }, description)
export const integer = (description) => described({ type: TYPE.integer }, description)
export const boolean = (description) => described({ type: TYPE.boolean }, description)
export const array = (items, description) => described({ type: TYPE.array, items }, description)
export const nullType = () => ({ type: TYPE.null })
/** Any JSON value: an annotation-only node, DSH's "any". */
export const anyValue = (description) => described({}, description)
export const constant = (value, description) => described({ type: typeof value === 'boolean' ? TYPE.boolean : TYPE.string, const: value }, description)
export const oneOfStrings = (values, description) => described({ type: TYPE.string, enum: [...values] }, description)
/** `null` or the given node; the branches never overlap, so exactly one matches. */
export const nullable = (node, description) => described({ oneOf: [nullType(), node] }, description)

/** Recursively frozen copy of plain schema data. */
export function frozen(value) {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) frozen(child)
    return Object.freeze(value)
  }
  return value
}
