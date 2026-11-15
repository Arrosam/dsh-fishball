/**
 * Vocabulary for the C-OAUTH-WEB cases (v3-tasks.md row C-OAUTH-WEB): AUTH-UC-10, AUTH-DT-07,
 * AUTH-DT-08, AUTH-DT-09, AUTH-ST-04, AUTH-ST-05, AUTH-BVA-07, AUTH-BVA-08, AUTH-EP-08, AUTH-EP-10,
 * and K1b-DT-07 (the approval listener over the gate).
 *
 * Every product value comes from K1, `dsh-connector/mcp-schema` (`index.js`, typed by the
 * frozen `index.d.ts`). Nothing comes from `packages/dsh-connector/src/mcp/oauth-web/`. The rest is case
 * data (the documents, ids, names and values the case tables name), the page wording the
 * requirements quote (R-OA-11, R-OA-12, R-OA-15) and fixture keys, which are not product values.
 */
import path from 'node:path'
import {
  APPROVAL_LISTENER, CIMD_LIMITS, CLIENT_AUTH, CONNECTOR_STATUS, ENTRY_STATUS, FAILURE_LIMIT, GATE_SURFACE, GRANT, GRANT_DISPATCH, HOSTS,
  HTTP_METHOD, HTTP_STATUS, ID_REFUSAL, LIFETIME, OAUTH_ERROR, PATHS, PKCE, REFUSAL, REQUEST_GATE, RESPONSE_TYPE, SCOPE, TIME_UNIT,
  TOKEN_VALUE, checkName, isAgentId, nameKey, oauthUrls,
} from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { REPO } from '../../../support/constants.mjs'

export {
  APPROVAL_LISTENER, CIMD_LIMITS, CLIENT_AUTH, CONNECTOR_STATUS, ENTRY_STATUS, FAILURE_LIMIT, GATE_SURFACE, GRANT, GRANT_DISPATCH, HOSTS,
  HTTP_METHOD, HTTP_STATUS, ID_REFUSAL, LIFETIME, OAUTH_ERROR, PATHS, PKCE, REFUSAL, REQUEST_GATE, RESPONSE_TYPE, SCOPE, TIME_UNIT,
  TOKEN_VALUE, checkName, isAgentId, nameKey, oauthUrls,
}

/**
 * The C-OAUTH-WEB entry and its exports, as Fishball relayed the dev session's surface
 * (2026-11-14); nothing else of the module is read. subject.mjs binds them.
 * FBTEST_C_OAUTH_WEB_ENTRY moves the entry (e.g. to the dev checkout).
 */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_OAUTH_WEB_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'mcp', 'oauth-web', 'index.js'),
  handler: 'createApprovalHandler',
  listener: 'createApprovalListener',
  fetcher: 'createCimdFetcher',
  codeGrant: 'createAuthorizationCodeGrant',
  refreshGrant: 'createRefreshTokenGrant',
  listenerMembers: Object.freeze(['start', 'setPort', 'close']),
  /** Listener statuses (relayed): `ok`, or K1's CONNECTOR_STATUS.approvalPortInUse. */
  statusOk: 'ok',
})

/**
 * Fishball's relayed decisions (2026-11-14) that K1 does not hold as a value, and that the relayed
 * surface exports no constant for, so the cases test the behaviour against the relayed value. Each
 * is stated here once, with its meaning:
 * - decisionBodyBytes: the decision form's body cap (8 KiB); one byte more is 413 with no body;
 * - pendingMax / cimdCacheMax: 256 each, the oldest evicted first; an evicted pending request reads
 *   as expired;
 * - tokenAutocomplete: the token field's `autocomplete`, which meets R-OA-11's "no autofill";
 * - embeddedIpv4: the IPv6 forms that embed an IPv4 address, all refused by the SSRF guard; each
 *   sample embeds a loopback or private IPv4, so it is refused whichever way the guard reads it.
 */
export const RELAYED = Object.freeze({
  decisionBodyBytes: 8 * 1024,
  pendingMax: 256,
  cimdCacheMax: 256,
  tokenAutocomplete: 'new-password',
  embeddedIpv4: Object.freeze([
    ['::/96 (IPv4-compatible)', '::7f00:1'],
    ['64:ff9b::/96 (NAT64)', '64:ff9b::a00:1'],
    ['2002::/16 (6to4)', '2002:c0a8:101::1'],
    ['::ffff:0:0:0/96 (IPv4-translated)', '::ffff:0:a00:1'],
  ]),
  /** The relayed GrantHandler answers to a client secret on each public grant (both counted). */
  secretOnGrant: Object.freeze({ refresh_token: 'invalid_grant', authorization_code: 'invalid_client' }),
})

/** The task that owns each flow C-OAUTH-WEB cannot run alone (v3-tasks.md). */
export const LATER = Object.freeze({
  metadata: 'C-OAUTH (W2): protected-resource and AS metadata documents, the token endpoint over HTTP',
  verifier: 'C-OAUTH (W2): BearerVerifier answers 401 for a revoked or foreign-audience access token',
  mcp: 'C-HTTP (W2): MCP calls at full power with the code-grant access token',
  wire: 'C-WIRE (W4b): stock SDK clients (both SDKs) and the Python client end to end, metadata authorization_endpoint following the approval port, native settings',
  docs: 'DOCS (W5): the README tunnel note (only DSH\'s listener forwarded)',
  marks: 'U-MARKS (W4): principal shown as ID: <id> wherever it appears',
})

/** R-OA-11/12/15: the page wording the requirements quote. Matched case-insensitively. */
export const PAGE_TEXT = Object.freeze({
  invalid: 'this token is not valid',
  empty: 'enter a token',
  expired: 'this request has expired, start again from your agent',
  createNew: 'create a new token',
  unverified: 'unverified',
  fullRights: 'full manager rights',
  oneAgent: 'one token, one agent',
  localhost: 'localhost',
  authorize: /authori[sz]e/i,
  cancel: /cancel/i,
})

/** RFC 6749 §4.1 / RFC 7636 / RFC 9207 / RFC 8707 parameter names: wire syntax, not product values. */
export const PARAM = Object.freeze({
  responseType: 'response_type', clientId: 'client_id', redirectUri: 'redirect_uri', codeChallenge: 'code_challenge',
  codeChallengeMethod: 'code_challenge_method', state: 'state', resource: 'resource', code: 'code', iss: 'iss', error: 'error',
  grantType: GRANT_DISPATCH.formField, codeVerifier: 'code_verifier', refreshToken: 'refresh_token',
})
/** CIMD draft / RFC 7591 document members. */
export const DOC = Object.freeze({
  clientId: 'client_id', clientName: 'client_name', redirectUris: 'redirect_uris', authMethod: 'token_endpoint_auth_method',
})
export const HTTP_HEADER = Object.freeze({
  location: 'location', origin: 'origin', host: 'host', contentType: 'content-type', cacheControl: 'cache-control',
  forwardedProto: 'x-forwarded-proto', maxAgeCache: 'cache-control',
})
export const FORM_TYPE = 'application/x-www-form-urlencoded'
export const PLAIN_METHOD = 'plain'
export const HTML_FORM = Object.freeze({ password: 'password', text: 'text', hidden: 'hidden', submit: 'submit' })

/** Fixture data. */
const CLIENT_ID = 'https://agent.example/cimd.json'
const REDIRECT = 'http://127.0.0.1:7777/cb'
export const FIXTURE = Object.freeze({
  loopback: '127.0.0.1',
  tunnelHost: 'fb.example',
  /** The reference instant of the fake clock; times are offsets from it. */
  t0: Date.UTC(2026, 10, 14),
  tempPrefix: 'fbtest-c-oauth-web-',
  /** AUTH-UC-10's client and its Client ID Metadata Document. */
  clientId: CLIENT_ID,
  clientName: 'Agent W',
  redirect: REDIRECT,
  /** AUTH-UC-10 A5 / AUTH-DT-07 rule 4a: the same loopback redirect on another port. */
  redirectOtherPort: 'http://127.0.0.1:50123/cb',
  /** AUTH-ST-05 row 12e: a second redirect URI the client's document lists. */
  redirectSecond: 'http://127.0.0.1:7777/cb2',
  /** AUTH-DT-07 rule 4 / 4c. */
  redirectTrailingSlash: 'http://127.0.0.1:7777/cb/',
  redirectForeign: 'https://other.example/cb',
  redirectLocalhost: 'http://localhost:7777/cb',
  /** AUTH-DT-07 rule 4b: a registered https redirect and the same one on another port. */
  httpsRedirect: 'https://agent.example/cb',
  httpsRedirectOtherPort: 'https://agent.example:8443/cb',
  /** AUTH-DT-07 rule 9. */
  httpNonLoopbackRedirect: 'http://agent.example/cb',
  /** AUTH-ST-05 rows 4 / 12a: another browser client. */
  otherClientId: 'https://other.example/cimd.json',
  otherClientName: 'Agent V',
  /** AUTH-DT-07 rule 2. */
  badClientIds: Object.freeze(['http://agent.example/cimd.json', 'https://agent.example', 'agent-a']),
  /** AUTH-EP-08 row 6b: client-id URLs WHATWG parsing changes. */
  unparsedClientIds: Object.freeze(['https://agent.example/a/../cimd.json', 'https://agent.example/cimd.json#frag', 'https://user@agent.example/cimd.json']),
  state: 'st-0123456789',
  id: Object.freeze({ agentW: 'agent-w-1', dotted: 'agent.w', long: 'a'.repeat(65), other: 'agent-v-1', machine: 'agent-a', caseA: 'Agent-W', caseB: 'agent-w' }),
  name: Object.freeze({ watcher: 'Watcher', fishball: 'Fishball', blank: '   ' }),
  /** Opaque entry keys and token values; each value is long enough unless stated. */
  entry: (n) => `fbtest-entry-${n}`,
  value: (n) => `fbtest-value-${n}-`.padEnd(TOKEN_VALUE.minChars + 8, 'x'),
  shortValue: 'v'.repeat(TOKEN_VALUE.minChars - 1),
  changedValue: (n) => `fbtest-changed-${n}-`.padEnd(TOKEN_VALUE.minChars + 8, 'y'),
  remoteAddress: '127.0.0.1',
  /** DSH's web port as the handler is told it (never bound by these cases: the issuer's port). */
  dshPort: 48_080,
  /** AUTH-EP-08: public and refused addresses (stubbed DNS answers; nothing is resolved for real). */
  publicAddress: '93.184.216.34',
  privateAddresses: Object.freeze({
    loopback: Object.freeze(['127.0.0.1', '::1']),
    rfc1918: Object.freeze(['10.0.0.1', '172.16.0.1', '192.168.1.1']),
    linkLocal: Object.freeze(['169.254.169.254', 'fe80::1']),
    uniqueLocal: Object.freeze(['fc00::1', 'fd12:3456::1']),
  }),
  loopbackClientIds: Object.freeze(['https://127.0.0.1/cimd.json', 'https://[::1]/cimd.json', 'https://localhost/cimd.json']),
  redirectTarget: 'https://10.0.0.1/cimd.json',
  cacheMaxAgeS: 60,
  cacheSecondAtS: 30,
  /** AUTH-BVA-08 row 6: three concurrent presentations, 0.1–0.3 s after the first spend. */
  concurrentOffsetsMs: Object.freeze([100, 200, 300]),
  /** AUTH-BVA-08 rows 1–5 (s after RT1 was spent). */
  graceProbeMs: Object.freeze({ justAfter: 1, justBefore: LIFETIME.refreshGraceMs - 1, at: LIFETIME.refreshGraceMs, after: LIFETIME.refreshGraceMs + 1, middle: LIFETIME.refreshGraceMs / 2 }),
  /** AUTH-DT-09 row 4: how long past one retry period to wait for the rebind. */
  retryMarginMs: 2_000,
  /** AUTH-EP-08 row 6: how much slack the time bound may take. */
  timeoutMarginMs: 2_000,
  /** Cross-process lock for the rows that bind the default port (both SDK files run at once). */
  defaultPortLock: 'fbtest-c-oauth-web-default-port.lock',
  lockPollMs: 100,
  pkceVerifierBytes: 32,
})

/** The fixture CIMD documents. */
export const DOCUMENT = Object.freeze({
  agentW: Object.freeze({ [DOC.clientId]: CLIENT_ID, [DOC.clientName]: FIXTURE.clientName, [DOC.redirectUris]: Object.freeze([REDIRECT]), [DOC.authMethod]: CLIENT_AUTH.none }),
})
/** A CIMD document for `clientId` with the given redirect URIs (and any extra members). */
export const documentFor = (clientId, redirectUris, extra = {}) => ({
  [DOC.clientId]: clientId, [DOC.clientName]: clientId === FIXTURE.clientId ? FIXTURE.clientName : FIXTURE.otherClientName,
  [DOC.redirectUris]: redirectUris, [DOC.authMethod]: CLIENT_AUTH.none, ...extra,
})
/** Fixture strings for the served documents and the stub listeners. */
export const STUB = Object.freeze({
  dshName: 'Fixture DSH',
  notJson: '<html>not json</html>',
  jsonType: 'application/json',
  /** AUTH-DT-09: what the process holding the port answers, so its answer is told from the page. */
  holderMarker: 'fbtest-port-holder',
  serverError: 500,
  found: 302,
  secretMethod: 'client_secret_basic',
  secret: 'fbtest-client-secret',
})
