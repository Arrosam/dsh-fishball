/**
 * The agent id a browser authorization binds (R-OA-22, R-ID-01, R-ID-08; design §5.5a; K1d-4,
 * K1d-5). The page asks for no id: a Fishball-like agent passes its own as the authorization-request
 * parameter AUTHORIZE_EXTENSION.agentIdParam, and a client that passes none gets the fixed id
 * DERIVED_AGENT_ID derives from its client id URL, so a generic MCP client works with no extra step.
 */
import { createHash } from 'node:crypto'
import { DERIVED_AGENT_ID } from '../../../mcp-schema/index.js'
import { BASE32, SECRET_ENCODING } from './constants.js'

const CHAR_MASK = DERIVED_AGENT_ID.alphabet.length - 1

/**
 * `prefix` + the first `chars` characters of the unpadded RFC 4648 base32 of the raw digest of the
 * UTF-8 `clientIdUrl`, exactly as the request carried it (K1d-5 pins the input: no normalisation,
 * so every implementation derives the same id). Node has no base32 codec, so it is encoded here,
 * and only as far as `chars` needs. The result is deterministic, holds no dot and fits ID_GRAMMAR.
 */
export function derivedAgentId(clientIdUrl) {
  const digest = createHash(DERIVED_AGENT_ID.digestAlgorithm).update(clientIdUrl, SECRET_ENCODING.text).digest()
  let chars = ''
  let buffer = 0
  let bits = 0
  for (const byte of digest) {
    buffer = (buffer << BASE32.bitsPerByte) | byte
    bits += BASE32.bitsPerByte
    while (bits >= BASE32.bitsPerChar) {
      bits -= BASE32.bitsPerChar
      chars += DERIVED_AGENT_ID.alphabet[(buffer >> bits) & CHAR_MASK]
    }
    // Only the unread low bits are kept, so the buffer never outgrows one byte plus a partial char.
    buffer &= (1 << bits) - 1
    if (chars.length >= DERIVED_AGENT_ID.chars) break
  }
  return DERIVED_AGENT_ID.prefix + chars.slice(0, DERIVED_AGENT_ID.chars)
}

/**
 * The id a pending request binds or reconnects with: the passed `agent_id`, or the derived one when
 * none was passed. RFC 6749 §3.1: "parameters sent without a value MUST be treated as if they were
 * omitted", so an empty `agent_id` derives too. A passed id is not checked here: an invalid one is
 * `id-invalid` on the page at Authorize (R-OA-22), after the token, like every other bind refusal.
 */
export const requestedAgentId = (passed, clientIdUrl) =>
  (passed === undefined || passed === '' ? derivedAgentId(clientIdUrl) : passed)
