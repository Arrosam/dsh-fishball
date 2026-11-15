/**
 * The token store's one hash (Fishball 2026-11-14, shared with C-OAUTH-WEB): every code, access
 * token and refresh token is keyed by the lowercase hex SHA-256 digest of its UTF-8 value (K1
 * TOKEN_VALUE.digestAlgorithm, WIRE.digestPattern). The bearer verifier hashes the same way, so a
 * token minted by either module is found by the other.
 */
import { createHash, randomBytes } from 'node:crypto'
import { TOKEN_VALUE } from '../../../mcp-schema/index.js'
import { DIGEST_ENCODING, OPAQUE_ENCODING, TEXT_ENCODING } from './constants.js'

/** The store key of an opaque value. */
export const digestOf = (value) => createHash(TOKEN_VALUE.digestAlgorithm).update(value, TEXT_ENCODING).digest(DIGEST_ENCODING)

/** A new opaque value: TOKEN_VALUE.opaqueBytes (256 bits) of randomness, base64url (design §5.5 step 6). */
export const newOpaqueValue = () => randomBytes(TOKEN_VALUE.opaqueBytes).toString(OPAQUE_ENCODING)
