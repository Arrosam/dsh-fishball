/**
 * Vocabulary for the C-OAUTH cases (v3-tasks.md row C-OAUTH, wave W2; docs/test-design/v3/
 * 01-auth-pairing.md): AUTH-UC-03, AUTH-UC-06 (TQ-5's C-OAUTH part), AUTH-UC-07, AUTH-UC-08,
 * AUTH-EP-01, AUTH-EP-02 (rows 1–10), AUTH-EP-05, AUTH-EP-07, AUTH-EP-09, AUTH-BVA-01, AUTH-BVA-02,
 * AUTH-BVA-06, AUTH-DT-01, AUTH-ST-02, the store and limiter parts of AUTH-ST-04 / AUTH-ST-05, the
 * K1b rows K1b-UC-02 and K1b-DT-06, and the C-PAIR rows that named C-OAUTH (AUTH-UC-02, AUTH-UC-04,
 * AUTH-EP-03, AUTH-EP-06 row 9, AUTH-ST-01 row 14).
 *
 * Every product value comes from K1, `fishball-connector/mcp-schema` (index.js; the `RevocationKind`
 * words from the frozen index.d.ts, types only). Nothing comes from `packages/connector/src/mcp/oauth/`.
 * The rest is case data (the ids, hosts and inputs the case tables name), HTTP's own vocabulary and
 * fixture keys, which are not product values.
 */
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  APPROVAL_LISTENER, BEARER_CHALLENGE, CLIENT_AUTH, ENTRY_STATUS, FAILURE_LIMIT, GATE_SURFACE, GRANT, GRANT_DISPATCH, HOSTS, HTTP_METHOD, HTTP_STATUS,
  LIFETIME, OAUTH_ERROR, OAUTH_ERROR_STATUS, OAUTH_METADATA, PATHS, RATE_LIMITS, REQUEST_GATE, SCOPE, TIME_UNIT, TOKEN_ENDPOINT_LIMITS, TOKEN_RESPONSE_HEADERS, TOKEN_VALUE,
  authorizationServerMetadata, isFishballId, oauthErrorBody, oauthUrls, protectedResourceMetadata, tokenResponse,
} from '../../../packages/connector/mcp-schema/index.js'
import { REPO } from '../../support/constants.mjs'

export {
  APPROVAL_LISTENER, BEARER_CHALLENGE, CLIENT_AUTH, ENTRY_STATUS, FAILURE_LIMIT, GATE_SURFACE, GRANT, GRANT_DISPATCH, HOSTS, HTTP_METHOD, HTTP_STATUS,
  LIFETIME, OAUTH_ERROR, OAUTH_ERROR_STATUS, OAUTH_METADATA, PATHS, RATE_LIMITS, REQUEST_GATE, SCOPE, TIME_UNIT, TOKEN_ENDPOINT_LIMITS, TOKEN_RESPONSE_HEADERS, TOKEN_VALUE,
  authorizationServerMetadata, isFishballId, oauthErrorBody, oauthUrls, protectedResourceMetadata, tokenResponse,
}

/**
 * The C-OAUTH entry (its "Owns" folder) and the four factories the cases bind to, each found by
 * meaning as exactly one function export (K1 freezes the interfaces, not the factories; subject.mjs
 * documents the assumed signatures). FBTEST_C_OAUTH_ENTRY moves the entry (e.g. to the dev checkout).
 */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_OAUTH_ENTRY ?? path.join(REPO, 'packages', 'connector', 'src', 'mcp', 'oauth', 'index.js'),
  factories: Object.freeze({
    store: /^(?:open|create)\w*TokenStore$/i,
    limiter: /^(?:open|create)\w*FailureLimiter$/i,
    verifier: /^(?:open|create)\w*BearerVerifier$/i,
    endpoint: /^(?:open|create)\w*TokenEndpoint$/i,
  }),
})

/** K1's declaration file: `RevocationKind` is a type there, so its words are read from the text. */
const K1_DTS = path.join(REPO, 'packages', 'connector', 'mcp-schema', 'index.d.ts')
function revocationKind(stem) {
  const m = /export type RevocationKind\s*=\s*([^\n]+)/.exec(fs.readFileSync(K1_DTS, 'utf8'))
  const found = m && [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).find((k) => k.startsWith(stem))
  if (!found) throw new Error(`K1 index.d.ts declares no RevocationKind starting "${stem}"`)
  return found
}
/** `TokenRegistry.onRevoked`'s `kind` (K1), for the fake registry. */
export const REVOCATION = Object.freeze({
  get disabled() { return revocationKind('disabl') },
  get deleted() { return revocationKind('delet') },
  get valueChanged() { return revocationKind('value') },
})

/** `BearerVerifier.verify`'s two refusals (K1 index.d.ts): no Bearer value, or an invalid one. */
export const VERIFY_ERROR = Object.freeze({ missing: 'missing', invalidToken: OAUTH_ERROR.invalidToken })
/** `OAuthTokenStore.chainsOf`'s answers (K1 `ChainsState`). */
export const CHAINS = Object.freeze({ none: 'none', live: 'live', ended: 'ended', revoked: 'revoked' })
/** The fields of K1's `Caller` the cases compare. */
export const CALLER_FIELDS = Object.freeze(['entryKey', 'clientId', 'principalKey', 'scope', 'audience', 'generation'])
/** The fields of K1's `GrantContext` and `FailureKey`. */
export const GRANT_CONTEXT = Object.freeze({ fields: Object.freeze(['origin', 'client', 'failureKey', 'now']), keyFields: Object.freeze(['remoteAddress', 'clientId']) })
/** `oauthErrorBody`'s members: an error body carries nothing else. */
export const ERROR_BODY_FIELDS = Object.freeze(Object.keys(oauthErrorBody(OAUTH_ERROR.invalidRequest, OAUTH_ERROR.invalidRequest)))

/** HTTP's own vocabulary (RFC 9110, RFC 6749 §2.3.1, §4.4.2), not product values. */
export const HTTP_WIRE = Object.freeze({
  authorization: 'authorization',
  contentType: 'content-type',
  wwwAuthenticate: 'www-authenticate',
  form: 'application/x-www-form-urlencoded',
  form_: Object.freeze({ clientId: 'client_id', clientSecret: 'client_secret', resource: 'resource', scope: 'scope', code: 'code', refreshToken: 'refresh_token' }),
  /** The one response header that differs between two otherwise identical responses. */
  date: 'date',
  basicSeparator: ':',
  queryStart: '?',
})

const DAY_MS = 24 * 60 * 60 * TIME_UNIT.msPerSecond

/** Fixture data: an injected clock, the case tables' ids and hosts, and value makers. */
export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-c-oauth-',
  /** The reference instant of the fake clock (README "clock"); times are offsets from it. */
  t0: Date.UTC(2026, 10, 14),
  day: DAY_MS,
  /** A user-set or generated token value: `fbt_` + 32 random bytes, as C-TOKENS generates (R-TOK-08). */
  value: () => TOKEN_VALUE.generatedPrefix + randomBytes(TOKEN_VALUE.generatedBytes).toString('base64url'),
  /** A value one character under the minimum (AUTH-DT-01 rule 8). */
  shortValue: () => FIXTURE.value().slice(0, TOKEN_VALUE.minChars - 1),
  /** The first generation of a fake token entry; disable, delete and value change bump it (K1 TokenEntry). */
  firstGeneration: 1,
  /** The fake registry's entry keys (K1 `EntryKey` is opaque). */
  entryKey: (n) => `fbtest-entry-${n}`,
  principalKey: (entryKey) => `fbtest-principal-${entryKey}`,
  /** Opaque store keys and chain ids for the OAuthTokenStore unit rows (the store never sees a value). */
  digest: (n) => `fbtest-digest-${n}`,
  chain: (n) => `fbtest-chain-${n}`,
  id: Object.freeze({ agentA: 'agent-a', a: 'a', n123: '123', n999: '999', x: 'x', y: 'y', dotted: 'fb.1' }),
  name: Object.freeze({ fishball: 'Fishball' }),
  /** AUTH-EP-09 / AUTH-EP-10: an allowed `--trusted-host` (a tunnel) and a refused one (DNS rebinding). */
  host: Object.freeze({ loopback: HOSTS.loopbackNames[1], localhost: HOSTS.loopbackNames[0], trusted: 'fb.example', evil: 'evil.example' }),
  /** FailureLimiter keys (K1 FailureKey): two documentation addresses (RFC 5737). */
  address: '192.0.2.1',
  otherAddress: '192.0.2.2',
  /** AUTH-EP-01 row 7. */
  foreignResource: 'https://other.example/api/fishball/mcp',
  /** AUTH-EP-01 row 4: a grant nobody serves. */
  unsupportedGrant: 'password',
  /** The browser client of the fake code and refresh grants (AUTH-UC-10's fixture). */
  cimd: 'https://agent.example/cimd.json',
  fakeAccess: 'fbtest-fake-access-token',
  fakeRefresh: 'fbtest-fake-refresh-token',
  fakeCode: 'fbtest-fake-code',
  /** AUTH-EP-05 row 5. */
  failedAttempts: 100,
  /** AUTH-BVA-01 row 4: 3599.999 s. */
  justUnderMs: 1,
  /** AUTH-BVA-02: the filler character of an id of a given length. */
  idFill: 'a',
  idDot: '.',
})

/** Fixture data of the K1-amendment rows (amend-cases.mjs). */
export const AMEND = Object.freeze({
  /** A form parameter no grant knows, used to pad a form to an exact size (RFC 6749 §3.2: unknown parameters are ignored). */
  padParameter: 'fbtest_pad',
  padChar: 'p',
  /** Fishball ids of the per-address rows: one per (address, client id) bucket. */
  addressClient: (n) => `fbtest-addr-${n}`,
})

/** AUTH-EP-03 rows 1–6 and AUTH-BVA-02: whether the id grammar accepts the id (R-ID-02). */
export const ID_CLASSES = Object.freeze([
  ['1', 'letters', ['abc'], true],
  ['2', 'all allowed chars', ['Az_09-'], true],
  ['2a', 'dot inside', ['fb.1'], false],
  ['2b', 'leading / trailing dot, dot only', ['.fb', 'fb.', '.'], false],
  ['3', 'space', ['a b'], false],
  ['4', 'slash, colon, @', ['a/b', 'a:b', 'a@b'], false],
  ['5', 'non-ASCII', ['é', 'ｆｂ'], false],
  ['6', 'control char', ['a\u0000b'], false],
])
/** AUTH-BVA-02: [row, length, accepted]; row 7 is 64 with one dot. */
export const ID_LENGTHS = Object.freeze([['1', 0, false], ['2', 1, true], ['3', 2, true], ['4', 63, true], ['5', 64, true], ['6', 65, false]])
export const ID_MAX = 64

/** The tasks that own the flows C-OAUTH cannot run alone (v3-tasks.md). */
export const LATER = Object.freeze({
  http: 'C-HTTP (W2): the MCP endpoint (401 / 403, query tokens, the id header, which requests count toward the failure limit)',
  web: 'C-OAUTH-WEB (W2): the refresh_token GrantHandler answers invalid_grant for any value not issued to a browser client',
  tools: 'C-TOOLS (W3): server/discover, tools/list, a tool call and subscriptions/listen with the access token',
  wire: 'C-WIRE (W4b): the connector settings (no directAccess switch) and the wired endpoint',
  revoke: 'C-REVOKE (W4): what a disable or delete does to streams, offers, sessions and events',
  tokens: 'C-TOKENS (W2): TokenRegistry.match is the constant-time comparator (R-TOK-06)',
})
