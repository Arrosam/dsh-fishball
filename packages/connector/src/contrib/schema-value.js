/**
 * INTERIM local stand-in for C-MAILBOX's shared value validator (`packages/connector/src/schema-value/`),
 * with the same call shape: `validateValue(schema, value)` → `{ok: true}` or
 * `{ok: false, path, reason}`. Decided by Fishball (2026-11-14): C-EXT must not write its own
 * K2-subset value validator; this is the thin adapter over DSH's own `validateJsonSchemaValue`
 * (`@deepseek-ai/dsh-tools`, already a connector peer; the same `lib/types/json-schema.js` on
 * 0.2.1-rc.5 and 0.2.2-rc.1) that C-MAILBOX's module is also asked to be. Replace this file's
 * import in `calls.js` with that module once it is merged, then delete this file.
 *
 * DSH's validator returns path-qualified violation texts, not a separate path, so `path` is the
 * root and `reason` the first violation. C-EXT never shows either to a client or a log (a refusal
 * carries its code only), so the difference cannot leak.
 */
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

const ROOT_PATH = ''
const OK = Object.freeze({ ok: true })

/**
 * @param {object} schema a schema already accepted by K2's `defineTool` (DSH's subset)
 * @param {unknown} value
 * @returns {{ok: true} | {ok: false, path: string, reason: string}}
 */
export function validateValue(schema, value) {
  const violations = validateJsonSchemaValue(schema, value, ROOT_PATH)
  return violations.length === 0 ? OK : Object.freeze({ ok: false, path: ROOT_PATH, reason: violations[0] })
}
