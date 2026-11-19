/**
 * The DSH-connector check (R-OA-21 rule 2, Q-S7C-5 = A, design §5.5b; names per design §1.0c):
 * the adapter serves `dsh-connector` endpoints only, and recognises one by the metadata it already
 * serves, with no connector change. It runs on the discovered metadata before any authorization,
 * registration or token request is sent.
 */
import { DSH_CONNECTOR, SERVER_URL } from './constants.js'

const parse = (value) => {
  try { return new URL(value) } catch { return undefined }
}
const sameUrl = (a, b) => a !== undefined && b !== undefined && a.href === b.href

/** Rule 7 of AUTH-DT-11, checkable before any read: the configured URL's path is the connector's MCP path. */
export function isConnectorUrl(serverUrl) {
  return parse(serverUrl)?.pathname === DSH_CONNECTOR.mcpPath
}

/** The server URL rule (S8): https, or http on a loopback host only. */
export function isAllowedServerUrl(serverUrl) {
  const url = parse(serverUrl)
  if (url === undefined) return false
  return url.protocol === SERVER_URL.secureProtocol || (url.protocol === SERVER_URL.loopbackProtocol && SERVER_URL.loopbackHosts.includes(url.hostname))
}

/**
 * The protected-resource half: `resource` equals the configured URL, `authorization_servers[0]` (the
 * first entry decides, as the SDK's discovery uses it) is the same origin plus the connector's
 * issuer path, and `scopes_supported` includes the connector's scope.
 */
/**
 * The authorization server's two endpoints (X-SEC X-06): the approval page, where the user types the
 * connector token, and the token endpoint, which gets the code, verifier and refresh token. Each must
 * follow the server URL rule (https, or http on a loopback host), and the token endpoint must be the
 * configured connector's own origin, where a connector serves it.
 */
export function isConnectorAuthorizationServer(serverUrl, metadata) {
  const token = parse(metadata?.token_endpoint)
  return isAllowedServerUrl(metadata?.authorization_endpoint) && isAllowedServerUrl(metadata?.token_endpoint)
    && token !== undefined && token.origin === parse(serverUrl)?.origin
}

export function isConnectorResource(serverUrl, resourceMetadata) {
  if (!isConnectorUrl(serverUrl)) return false
  const configured = parse(serverUrl)
  const expectedIssuer = parse(configured.origin + DSH_CONNECTOR.issuerPath)
  return sameUrl(parse(resourceMetadata?.resource), configured)
    && sameUrl(parse(resourceMetadata?.authorization_servers?.[0]), expectedIssuer)
    && Array.isArray(resourceMetadata?.scopes_supported) && resourceMetadata.scopes_supported.includes(DSH_CONNECTOR.scope)
}
