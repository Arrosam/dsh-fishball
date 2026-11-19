/**
 * Checks a value against a JSON Schema. The connector has exactly one implementation of this
 * check (Fishball 2026-11-14): C-MAILBOX validates event payloads with it, and C-EXT validates
 * contributed tools' arguments and results with it.
 *
 * The check itself is DSH's own `validateJsonSchemaValue` from `@deepseek-ai/dsh-tools`, a peer of
 * the connector with the same code on 0.2.1-rc.5 and 0.2.2-rc.1. It is the same validator DSH
 * applies to tool arguments and outputs, so a value accepted here is accepted by the host too.
 * This module only reshapes DSH's list of violation strings into one structured answer.
 *
 * Contract of `validateValue(schema, value)`:
 * - `schema` must be accepted by DSH's `assertSupportedJsonSchema`. K1's core-tool and event
 *   schemas and every registered contributed schema are (K2 `SCHEMA_SUBSET`). This module does
 *   not re-assert it per call: doing so is a schema check, not a value check, and the owners of
 *   those schemas run it once.
 * - It returns `{ok: true}`, or `{ok: false, path, reason}` for the first violation in DSH's walk
 *   order. `path` is the location of the failing value: `$` is the root, `$.a.b[2]` is a nested
 *   one. `reason` is DSH's own text of that violation and is meant for logs only, never as a
 *   contract.
 * - It is total and never throws, for any value, including cycles, getters and non-JSON data,
 *   because DSH's validator is total.
 */
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

/**
 * The root label handed to DSH. Its diagnostics put this label in front of every path, so the
 * paths read `$`, `$.key`, `$.list[0]`.
 */
const ROOT_PATH = '$'

/**
 * DSH's violation texts name the failing path in one of two forms (`json-schema.js` `checkValue`,
 * identical on both SDKs): `"<path>" must …` / `"<path>" is not …`, or
 * `missing required property "<path>"`. Both patterns are greedy, because DSH does not escape a
 * `"` inside a property key. A known limit: an `enum` or `const` violation also quotes the
 * expected values, so a value whose JSON text holds `" is ` or `" must ` can stretch the match past
 * the path. That needs a key or value shaped like DSH's own sentence. `reason` always holds DSH's
 * full text, so a log can still tell what happened.
 */
const PATH_FORMS = Object.freeze([
  Object.freeze(/^"(.*)" (?:must|is) /s),
  Object.freeze(/^missing required property "(.*)"$/s),
])

/** The path a DSH violation names. Falls back to the root if DSH ever words a violation differently. */
function pathOf(violation) {
  for (const form of PATH_FORMS) {
    const match = form.exec(violation)
    if (match) return match[1]
  }
  return ROOT_PATH
}

const VALID = Object.freeze({ ok: true })

/**
 * @param {object} schema - a schema accepted by DSH's `assertSupportedJsonSchema`.
 * @param {unknown} value - the candidate value.
 * @returns {{ok: true} | {ok: false, path: string, reason: string}}
 */
export function validateValue(schema, value) {
  const [first] = validateJsonSchemaValue(schema, value, ROOT_PATH)
  return first === undefined ? VALID : Object.freeze({ ok: false, path: pathOf(first), reason: first })
}
