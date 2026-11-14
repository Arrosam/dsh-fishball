/**
 * Constants of the connector's browser authorization (task C-OAUTH-WEB; design §5.5a; R-OA-11…20;
 * spike V3-S7b `141ac3b`). Every tunable (lifetimes, CIMD limits, the approval listener's port, retry
 * and headers, the id grammar, the PKCE method, the gate's routes) is K1's and is imported from
 * `../../../mcp-schema`; this file holds only this module's own wire names, protocol grammars,
 * page copy and log lines.
 */

/** The query parameters of `GET /authorize` [spec: RFC 6749 §4.1.1, RFC 7636 §4.3, RFC 8707 §2]. */
export const AUTHORIZE_PARAM = Object.freeze({
  responseType: 'response_type',
  clientId: 'client_id',
  redirectUri: 'redirect_uri',
  codeChallenge: 'code_challenge',
  codeChallengeMethod: 'code_challenge_method',
  resource: 'resource',
  state: 'state',
})

/** The authorization response's query parameters [spec: RFC 6749 §4.1.2, §4.1.2.1; RFC 9207 `iss`]. */
export const RESPONSE_PARAM = Object.freeze({ code: 'code', state: 'state', iss: 'iss', error: 'error' })

/** The token request's form fields the two grants read [spec: RFC 6749 §4.1.3, §6; RFC 7636 §4.5; RFC 8707]. */
export const TOKEN_FIELD = Object.freeze({
  code: 'code',
  codeVerifier: 'code_verifier',
  redirectUri: 'redirect_uri',
  clientId: 'client_id',
  resource: 'resource',
  refreshToken: 'refresh_token',
})

/** The approval form's fields and its two buttons' values (R-OA-11). */
export const FORM_FIELD = Object.freeze({
  request: 'request',
  nonce: 'form',
  token: 'token',
  id: 'id',
  name: 'name',
  action: 'action',
})
export const FORM_ACTION = Object.freeze({ authorize: 'authorize', cancel: 'cancel' })

/**
 * PKCE grammars [spec: RFC 7636 §4.1 (verifier: 43–128 unreserved characters), §4.2 (an S256
 * challenge is the unpadded base64url of a SHA-256 digest: exactly 43 characters)].
 */
export const PKCE_RULES = Object.freeze({
  verifier: Object.freeze(/^[A-Za-z0-9._~-]{43,128}$/),
  challenge: Object.freeze(/^[A-Za-z0-9_-]{43}$/),
  digestAlgorithm: 'sha256',
  verifierEncoding: 'ascii',
  challengeEncoding: 'base64url',
})

/** How codes, refresh tokens, access tokens, pending ids and form nonces are minted and held. */
export const SECRET_ENCODING = Object.freeze({
  // The opaque value's text form (RFC 6749 §A: any visible ASCII; base64url needs no URL escaping).
  value: 'base64url',
  // Every text the module hashes or reads from a body is UTF-8.
  text: 'utf8',
  // OAuthTokenStore keys: lowercase hex SHA-256 (64 characters, K1 WIRE.digestHexChars), the
  // convention agreed with C-OAUTH through Fishball (2026-11-14), so a bearer the verifier hashes
  // finds the access token this module stored.
  digest: 'hex',
})

/** The CIMD request and response facts (R-OA-13; [spec] CIMD draft §4.4: the document is JSON). */
export const CIMD_HTTP = Object.freeze({
  method: 'GET',
  accept: 'application/json',
  // `application/json` or any `+json` type, with optional parameters.
  jsonType: Object.freeze(/^application\/([a-z0-9.+-]*\+)?json\s*(;|$)/i),
  okStatus: 200,
  // Every fetch opens its own connection to the addresses just checked: a pooled keep-alive socket
  // would reach an address no check of this fetch ran on.
  agent: false,
  // Redirects are refused, never followed (R-OA-13).
  redirectStatuses: Object.freeze({ min: 300, max: 399 }),
  headers: Object.freeze({ accept: 'accept', contentType: 'content-type', cacheControl: 'cache-control' }),
  // RFC 9111 §5.2.2: these forbid reuse of the stored response without revalidation.
  noReuseDirectives: Object.freeze(/(^|,)\s*(no-store|no-cache|private)\s*(=|,|$)/i),
  maxAge: Object.freeze(/(^|,)\s*max-age\s*=\s*"?(\d+)"?\s*(,|$)/i),
  // The document's fields this module reads [spec: CIMD draft §4.1].
  clientIdField: 'client_id',
  clientNameField: 'client_name',
  redirectUrisField: 'redirect_uris',
  authMethodField: 'token_endpoint_auth_method',
})

/**
 * Addresses a CIMD fetch never connects to, checked after resolution (R-OA-13; [spec] CIMD draft
 * §6.5; S7b's list): unspecified, private (RFC 1918), shared CGNAT, loopback, link-local,
 * IETF-protocol, benchmarking, multicast and reserved IPv4; unspecified, loopback, unique-local,
 * link-local and multicast IPv6. Node's BlockList also matches an IPv4-mapped IPv6 address against
 * the IPv4 rules, so `::ffff:127.0.0.1` is refused too. The IPv6 forms that carry an IPv4 address
 * whose real destination this check cannot see are refused whole (Fishball 2026-11-14, review item
 * B, beyond S7b's list; as DSH's own dsh-web-fetch-http does): IPv4-compatible `::/96`, NAT64
 * `64:ff9b::/96` (RFC 6052), 6to4 `2002::/16` (RFC 3056) and SIIT `::ffff:0:0:0/96` (RFC 6145).
 * Documentation ranges are deliberately not listed: they are not private, and S7b's simulated
 * public client host used one.
 */
export const BLOCKED_SUBNETS = Object.freeze({
  ipv4: Object.freeze([
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
    ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ]),
  ipv6: Object.freeze([
    ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
    ['::', 96], ['64:ff9b::', 96], ['2002::', 16], ['::ffff:0:0:0', 96],
  ]),
  family: Object.freeze({ ipv4: 'ipv4', ipv6: 'ipv6' }),
})

/** Why a CIMD fetch or validation failed (internal only: the page shows one message, never these). */
export const CIMD_REFUSAL = Object.freeze({
  clientIdInvalid: 'client-id-invalid',
  unresolvable: 'unresolvable',
  privateAddress: 'private-address',
  redirect: 'redirect',
  status: 'status',
  notJson: 'not-json',
  tooLarge: 'too-large',
  timeout: 'timeout',
  fetchFailed: 'fetch-failed',
  documentInvalid: 'document-invalid',
  clientIdMismatch: 'client-id-mismatch',
  clientNameMissing: 'client-name-missing',
  redirectUrisInvalid: 'redirect-uris-invalid',
  secretNotAllowed: 'secret-not-allowed',
})

/** URL facts of the redirect and approval-origin rules. */
export const URL_RULES = Object.freeze({
  querySeparator: '?',
  fragment: '#',
  rootPath: '/',
  // `<scheme>//<authority>`, as C-OAUTH's `originOf` returns it.
  origin: Object.freeze(/^([a-z][a-z0-9+.-]*:)\/\/(.+)$/i),
  // An authority's host (a bracketed IPv6 literal or a name) and optional port.
  authority: Object.freeze(/^(\[[^\]]*\]|[^:]*)(?::(\d+))?$/),
  schemeSeparator: '//',
  portSeparator: ':',
  // A URL authority without a port uses its scheme's default (RFC 9110 §4.2).
  defaultPorts: Object.freeze({ 'http:': 80, 'https:': 443 }),
  // IPv4 loopback is the whole 127.0.0.0/8 (RFC 1122 §3.2.1.3), not only 127.0.0.1.
  ipv4Loopback: Object.freeze(/^127(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/),
})

/** A FailureLimiter key needs an address; a socket that already closed has none (never shared with a real address). */
export const ADDRESS = Object.freeze({ unknown: 'unknown' })

/** Response facts of the approval listener beyond K1's APPROVAL_LISTENER.headers. */
export const PAGE_HTTP = Object.freeze({
  contentType: Object.freeze({ 'content-type': 'text/html; charset=utf-8' }),
  locationHeader: 'location',
  fetchSiteHeader: 'sec-fetch-site',
  // A browser's own marker of a cross-site form POST (S7b: refused 403 with the form nonce check).
  crossSite: 'cross-site',
})

/**
 * The page's copy (R-OA-11, R-OA-12, R-OA-15; S7b's wording). English only, as the rest of the
 * connector's server-side text. `{…}` slots are filled by `page.js` after HTML escaping.
 */
export const PAGE_TEXT = Object.freeze({
  lang: 'en',
  title: 'Authorize {client} (unverified)',
  errorTitle: 'Authorization error',
  client: 'Client: {client} (unverified), client id host {host}.',
  redirectHost: 'Redirect host: {host}.',
  localhostOnly: 'Warning: this client only redirects to this computer (localhost). Any program on it could claim this name.',
  dsh: 'DSH: {dsh}, {resource}.',
  rights: 'Authorizing gives this agent full manager rights over this DSH\'s sessions, delegated approvals and questions included.',
  oneAgent: 'One token, one agent: a token can be used for one agent only. The id must be unique and cannot be changed later; the name can.',
  tokenLabel: 'Token',
  idLabel: 'Fishball id',
  nameLabel: 'Name (optional)',
  authorize: 'Authorize',
  cancel: 'Cancel',
  invalidToken: 'This token is not valid.',
  enterToken: 'Enter a token.',
  rateLimited: 'Too many attempts. Wait a minute and try again.',
  alreadyPaired: 'This token is already used by an agent. Create a new token in the connector\'s settings.',
  boundTo: 'Bound to {name}, last seen {lastSeen}.',
  neverSeen: 'never',
  idInvalid: 'id-invalid: the id must be 1-64 characters of A-Z, a-z, 0-9, _ or -.',
  idTaken: 'id-taken: another agent on this DSH already uses this id.',
  nameInvalid: 'name-invalid: the name must be 1-64 characters with no control or invisible characters.',
  nameTaken: 'name-taken: another agent on this DSH already uses this name.',
  // R-OA-15's wording.
  expired: 'This request has expired, start again from your agent.',
  badClient: 'The client id is not a valid client metadata document URL, or its document could not be used.',
  badRedirect: 'The redirect URI is not registered for this client.',
})

/**
 * HTML attributes of the page (R-OA-11: the token is masked, never autofilled or echoed). Browsers
 * ignore `autocomplete="off"` on a password input, so the token field asks for `new-password`,
 * which they never fill (Fishball 2026-11-14, review item C); the other fields keep `off`.
 */
export const FORM_INPUT = Object.freeze({
  password: 'password',
  text: 'text',
  hidden: 'hidden',
  autocompleteOff: 'off',
  autocompleteNewPassword: 'new-password',
})
export const PAGE_ROLE = Object.freeze({ alert: 'alert', note: 'note' })

/** Background log lines (never a token, code, id, name or URL; diagnostic codes only). */
export const LOG = Object.freeze({
  format: '%s (%s)',
  bindFailed: 'approval listener: could not bind its port; status approval-port-in-use',
  handlerFailed: 'approval listener: a request failed',
  listenerFailed: 'approval listener: a bind or close failed',
})

/** Programming-error messages (wiring misuse, never shown to a client). */
export const MISUSE = Object.freeze({
  port: 'fishball approval listener: the port must be an integer from 0 to 65535',
})

/**
 * The approval listener's status (R-OA-20, AUTH-DT-09 "Status"): `ok` while open; K1's
 * CONNECTOR_STATUS.approvalPortInUse while it cannot bind (any listen error, Fishball 2026-11-14,
 * item 11). The status column is C-WIRE's; it reads this.
 */
export const LISTENER_STATUS = Object.freeze({ ok: 'ok' })

/** The `OAuthTokenStore.chainsOf` state (K1 ChainsState) in which alone the page renews (R-OA-16 (7)). */
export const CHAINS_STATE = Object.freeze({ ended: 'ended' })

/** Node event names the listener (net.Server) and the CIMD request (ClientRequest) handle. */
export const SERVER_EVENT = Object.freeze({ error: 'error', listening: 'listening' })

/** The TCP port range a port setting must fall in. */
export const PORT_RANGE = Object.freeze({ min: 0, max: 65535 })
