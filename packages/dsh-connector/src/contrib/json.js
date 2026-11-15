/**
 * JSON helpers the call and emit pipelines share (task C-EXT).
 *
 * A contributor's value may be hostile or simply reused after it was handed over (a getter that
 * answers differently on each read, or an object changed after `emit()` returned its promise).
 * Each pipeline therefore takes **one snapshot** of it and checks, measures and sends only that
 * snapshot, as K2's `defineTool` does for definitions. `structuredClone` reads every getter once
 * and refuses functions and symbols. What survives is then checked with the shared validator, so
 * only lossless JSON (no Date, Map, BigInt, -0, cycle or class instance) passes.
 */
import { validateValue } from '../schema-value/index.js'

const UTF8 = new TextEncoder()

/** UTF-8 bytes of a text. */
export const byteLength = (text) => UTF8.encode(text).length

/**
 * One lossless-JSON snapshot of `value` that matches `schema`, with its JSON text, or undefined
 * when the value is not lossless JSON or fails the schema. Never throws.
 *
 * Both the value and its snapshot are checked. `structuredClone` turns a class instance into a
 * plain object of its fields and keeps a Date as a Date, so checking only the copy would accept
 * data the validator refuses as given. Checking only the original would leave the copy
 * unchecked. The snapshot is the only thing measured and sent.
 * @returns {{value: unknown, text: string} | undefined}
 */
export function snapshotJson(value, schema) {
  try {
    if (!validateValue(schema, value).ok) return undefined
    const copy = structuredClone(value)
    if (!validateValue(schema, copy).ok) return undefined
    return { value: copy, text: JSON.stringify(copy) }
  } catch {
    // A getter or proxy that throws is not JSON data.
    return undefined
  }
}
