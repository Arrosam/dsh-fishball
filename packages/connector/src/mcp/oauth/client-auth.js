/**
 * Client authentication at the token endpoint (RFC 6749 §2.3; K1 `ClientAuthentication`,
 * CLIENT_AUTH). Pure: reads the `Authorization` header and the parsed form, never a token store.
 */
import { BEARER_CHALLENGE, CLIENT_AUTH } from '../../../mcp-schema/index.js'
import { credentialsOf } from './auth-header.js'
import { AUTH_HEADER, EMPTY_VALUE, TEXT_ENCODING, TOKEN_FORM } from './constants.js'

const FIELD = TOKEN_FORM.fields
const TWO_METHODS = Object.freeze({ twoMethods: true })

/** `{name: value}` when `value` is present, else `{}`: an empty value is absent, as in the form (RFC 6749 §3.1). */
const present = (name, value) => (value === undefined || value === EMPTY_VALUE ? {} : { [name]: value })

/** `{clientId?, secret?}` of Basic credentials; a malformed value (no colon after decoding) is `{}`. */
function basicCredentials(credentials) {
  const decoded = Buffer.from(credentials, AUTH_HEADER.basicEncoding).toString(TEXT_ENCODING)
  const colon = decoded.indexOf(AUTH_HEADER.basicSeparator)
  if (colon < 0) return {}
  return { ...present('clientId', decoded.slice(0, colon)), ...present('secret', decoded.slice(colon + 1)) }
}

/**
 * How the client authenticated.
 * - Basic: the header's raw id and secret (see `secretCandidates` for the decoding).
 * - `client_secret_post`: the form's `client_id` and `client_secret`.
 * - `none`: the form's `client_id` only (a public client, or a client that sent no secret).
 * An `Authorization` header of another scheme authenticates nothing and is ignored here.
 * @returns `{client}` (K1 ClientAuthentication) or `{twoMethods: true}`: Basic together with a form
 *   `client_secret`, or a form `client_id` that differs from the Basic one, which RFC 6749 §2.3
 *   forbids ("MUST NOT use more than one authentication method"): 400 `invalid_request`
 *   (Fishball 2026-11-14, #8).
 */
export function clientAuthOf(authorization, form) {
  const credentials = credentialsOf(authorization, BEARER_CHALLENGE.basicScheme)
  if (credentials !== undefined) {
    const basic = basicCredentials(credentials)
    if (form[FIELD.clientSecret] !== undefined) return TWO_METHODS
    if (form[FIELD.clientId] !== undefined && form[FIELD.clientId] !== basic.clientId) return TWO_METHODS
    return { client: Object.freeze({ method: CLIENT_AUTH.basic, ...basic }) }
  }
  const secret = form[FIELD.clientSecret]
  return {
    client: Object.freeze({
      method: secret === undefined ? CLIENT_AUTH.none : CLIENT_AUTH.post,
      ...present('clientId', form[FIELD.clientId]),
      ...present('secret', secret),
    }),
  }
}

/** RFC 6749 Appendix B form decoding, or `undefined` for a malformed `%` escape. */
function formDecoded(value) {
  try { return decodeURIComponent(value.replaceAll(AUTH_HEADER.formSpace, AUTH_HEADER.space)) } catch { return undefined }
}

const hasFormMarks = (value) => AUTH_HEADER.formEncodedMarks.some((mark) => value.includes(mark))

/**
 * The `{clientId, secret}` pairs to try, in order (Fishball 2026-11-14, #12). RFC 6749 §2.3.1 has
 * the client form-encode both Basic parts before base64, but the stock TS `ClientCredentialsProvider`
 * of both DSH SDKs sends `btoa(id:secret)` with no encoding (`@modelcontextprotocol/client`
 * 2.2.0 dist index.mjs:514), while openid-client does encode. So the raw values come first, and the
 * form-decoded ones only for Basic and only when a raw value holds `%` or `+` (the only characters
 * the decoding changes). The caller counts at most one failure for the whole list.
 * @param client - a K1 ClientAuthentication with both `clientId` and `secret`
 */
export function secretCandidates(client) {
  const raw = { clientId: client.clientId, secret: client.secret }
  if (client.method !== CLIENT_AUTH.basic || !(hasFormMarks(raw.clientId) || hasFormMarks(raw.secret))) return [raw]
  const decoded = { clientId: formDecoded(raw.clientId), secret: formDecoded(raw.secret) }
  return decoded.clientId === undefined || decoded.secret === undefined ? [raw] : [raw, decoded]
}
