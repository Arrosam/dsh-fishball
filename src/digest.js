/**
 * Short digests: of a tool's parameter schema, and (digestOf) of any text such as an install
 * spec the audit must not store raw. Schema digests (DESIGN §7 "Tools nobody has checked"): a checked
 * tool whose parameters change in a plugin update counts as unchecked, because an update
 * can add a save option; the digest is how a change is noticed.
 *
 * Canonical form: JSON with object keys sorted at every level, so key order in a plugin's
 * source never changes the digest. Hex SHA-256, cut to DIGEST_HEX_CHARS.
 */
import { createHash } from 'node:crypto'

const DIGEST_ALGORITHM = 'sha256'
const DIGEST_HEX_CHARS = 16

/** JSON with sorted object keys; arrays keep their order (it is meaningful in schemas and in call arguments). */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** @returns the short hex digest of one string. */
export function digestOf(text) {
  return createHash(DIGEST_ALGORITHM).update(text).digest('hex').slice(0, DIGEST_HEX_CHARS)
}

/** @returns the digest of `parameters` (an absent schema digests as `null`). */
export function parametersDigest(parameters) {
  return digestOf(canonical(parameters ?? null))
}
