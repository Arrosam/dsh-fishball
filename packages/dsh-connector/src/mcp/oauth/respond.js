/**
 * Response writing shared by the token endpoint and the two metadata documents. Nothing here
 * decides an outcome; it only serialises one.
 */
import { HTTP_STATUS, OAUTH_ERROR, OAUTH_ERROR_STATUS, TOKEN_RESPONSE_HEADERS, oauthErrorBody } from '../../../mcp-schema/index.js'
import { HEADER, HEADER_VALUE } from './constants.js'

/** Writes `status`, `headers` and a JSON `body`, or no body when it is `null`. */
export function writeJson(res, status, headers, body) {
  if (body === null) {
    res.writeHead(status, headers)
    res.end()
    return
  }
  res.writeHead(status, { ...headers, [HEADER.contentType]: HEADER_VALUE.json })
  res.end(JSON.stringify(body))
}

/** A `RequestGate` refusal as the gate built it (K1b: the caller writes it and runs nothing else). */
export const writeRefusal = (res, refusal) => writeJson(res, refusal.status, refusal.headers, refusal.body)

/**
 * A 403 with no body, the gate's answer to a `Host` it refuses. Used when `check` passed but the
 * `Host` is not one `originOf` can build an origin from, so no issuer can be named for it.
 */
export const writeHostRefused = (res) => writeJson(res, HTTP_STATUS.forbidden, {}, null)

/**
 * Every token-endpoint answer, success or error, is `no-store` (RFC 6749 §5.1 for success; the
 * same for errors, so no cache keeps an answer that depends on a secret).
 */
export const writeToken = (res, status, body, headers = {}) => writeJson(res, status, { ...TOKEN_RESPONSE_HEADERS, ...headers }, body)

/** An OAuth error of the token endpoint with its K1 status (RFC 6749 §5.2). */
export const writeOAuthError = (res, error, headers = {}, description = undefined) =>
  writeToken(res, OAUTH_ERROR_STATUS[error], oauthErrorBody(error, description), headers)

/** 500 `server_error`, for a throw anywhere past the gate. */
export const writeServerError = (res) => {
  if (res.headersSent) { res.destroy(); return }
  writeOAuthError(res, OAUTH_ERROR.serverError)
}
