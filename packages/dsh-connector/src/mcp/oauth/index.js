/**
 * The connector's authorization server (task C-OAUTH; design §5.5, §5.6; K1 / K1a / K1b seams in
 * `../../../mcp-schema/index.d.ts`). C-WIRE mounts it once per connector life:
 * - `openOAuthTokenStore(ctx, {defineDomain, domainTable})` → `{store, close}`: the one K1
 *   `OAuthTokenStore` (C-OAUTH-WEB uses this instance); `followRevocations(tokenRegistry, store)`
 *   applies C-TOKENS' revocations to it;
 * - `createFailureLimiter()`: the one K1a `FailureLimiter`, shared with C-OAUTH-WEB and C-HTTP;
 * - `createBearerVerifier({tokenStore, tokenRegistry, pairStore})`: the K1 `BearerVerifier` for C-HTTP;
 * - `createTokenEndpoint({...})`: the token endpoint and both metadata documents, with the K1b
 *   `GrantRegistry` (`register`) for C-OAUTH-WEB's `authorization_code` and `refresh_token`;
 * - `originOf(req, {secure})`: the one host → origin rule, shared with C-HTTP and C-OAUTH-WEB.
 * The storage layout and the module's constants stay private.
 */
export { createOAuthTokenStore, followRevocations, openOAuthTokenStore } from './token-store.js'
export { createFailureLimiter } from './failure-limiter.js'
export { createBearerVerifier } from './bearer-verifier.js'
export { createTokenEndpoint } from './token-endpoint.js'
export { originOf } from './origin.js'
