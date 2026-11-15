/**
 * The built-in `client_credentials` grant (K1b GRANT_DISPATCH.builtIn; R-OA-03, R-OA-04, R-OA-05,
 * R-OA-07, R-ID-02, R-ID-08; design §5.5 token endpoint steps 3–6), as a K1b `GrantHandler`.
 *
 * Order (nothing past a refusal runs): the client secret is checked against the enabled, usable
 * entries (C-TOKENS' constant-time `match`), then the client id's grammar, then that the entry was
 * not bound on the approval page, then `resource`. A refusal says nothing about ids or pairs
 * (R-TOK-00): every credential refusal is the same `invalid_client`. Counted toward FAILURE_LIMIT
 * (Fishball 2026-11-14, #7): a secret that matches no entry, a matching secret with an invalid id
 * (the credential is token + id, R-ID-01), and a matching secret of an entry the approval page
 * bound (K1d: an entry bound on the page refuses `client_credentials`, so one token never serves two
 * client types; decided item 4). The last is counted for the reason the invalid id is: the secret
 * is right but the credential, as a machine client presents it, is not one this entry accepts; an
 * uncounted answer would let a caller tell a page-bound entry from an unknown token. Not counted: no secret at all, a malformed Basic header, and `invalid_target`, none of which guesses
 * a credential.
 *
 * No refresh token (Q27, R-OA-07). The requested `scope` is ignored: the granted one follows the
 * pair (R-OA-04, OAuth 2.1 §1.4.1 narrowing), and the response says which.
 */
import { GRANT, OAUTH_ERROR, isAgentId, oauthUrls, tokenResponse } from '../../../mcp-schema/index.js'
import { isPageBound, powerOf } from '../../pairs/index.js'
import { TOKEN_FORM } from './constants.js'
import { secretCandidates } from './client-auth.js'
import { digestOf, newOpaqueValue } from './digest.js'

const refused = (error, countedFailure) => Object.freeze({ ok: false, error, countedFailure })
const UNAUTHENTICATED = refused(OAUTH_ERROR.invalidClient, false)
const BAD_CREDENTIAL = refused(OAUTH_ERROR.invalidClient, true)
const BAD_TARGET = refused(OAUTH_ERROR.invalidTarget, false)

/**
 * The entry and id of the first candidate whose secret matches an entry and whose id is a
 * fishball id, else `undefined`. Every candidate is tried, so trying the form-decoded pair takes
 * the same work whether or not the raw one matched.
 */
function authenticate(tokenRegistry, client) {
  let found
  for (const candidate of secretCandidates(client)) {
    const entry = tokenRegistry.match(candidate.secret)
    if (found === undefined && entry !== undefined && isAgentId(candidate.clientId)) found = { entry, clientId: candidate.clientId }
  }
  return found
}

/**
 * @param deps.tokenStore - the K1 `OAuthTokenStore` (`putAccess`)
 * @param deps.tokenRegistry - C-TOKENS' K1 `TokenRegistry` (`match`)
 * @param deps.pairStore - C-PAIR's K1 `PairStore` (`pairOf`)
 * @returns the K1b `GrantHandler` of `client_credentials`
 */
export function createClientCredentialsGrant({ tokenStore, tokenRegistry, pairStore }) {
  return Object.freeze({
    grantType: GRANT.clientCredentials,

    async handle(form, ctx) {
      if (ctx.client.secret === undefined || ctx.client.clientId === undefined) return UNAUTHENTICATED
      const found = authenticate(tokenRegistry, ctx.client)
      if (found === undefined) return BAD_CREDENTIAL
      const { entry, clientId } = found
      // A credential refusal, so it comes before `resource` as the others do.
      const pair = pairStore.pairOf(entry.entryKey)
      if (isPageBound(pair)) return BAD_CREDENTIAL
      // TQ-3 A: `resource` is required and must be this host's canonical MCP URI (R-OA-05).
      const audience = oauthUrls(ctx.origin).resource
      if (form[TOKEN_FORM.fields.resource] !== audience) return BAD_TARGET
      const accessToken = newOpaqueValue()
      tokenStore.putAccess(digestOf(accessToken), { entryKey: entry.entryKey, clientId, audience, generation: entry.generation, issuedAt: ctx.now })
      const { scope } = powerOf(pair, clientId)
      return Object.freeze({ ok: true, body: tokenResponse({ accessToken, scope }) })
    },
  })
}
