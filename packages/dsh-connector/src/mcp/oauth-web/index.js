/**
 * The connector's browser authorization (task C-OAUTH-WEB; design §5.5a; R-OA-11…20). C-WIRE mounts
 * it: builds the approval handler with C-HTTP's `RequestGate`, C-OAUTH's `originOf`,
 * `OAuthTokenStore` and `FailureLimiter`, C-TOKENS' `TokenRegistry` and C-PAIR's `PairStore`; binds
 * it with `createApprovalListener`; and registers the two grants with C-OAUTH's `GrantRegistry`
 * (K1b). The CIMD fetcher is shared by nothing else.
 */
export { createApprovalHandler } from './approval.js'
export { approvalOriginFor } from './origin.js'
export { createApprovalListener } from './listener.js'
export { createCimdFetcher } from './cimd.js'
export { createAuthorizationCodeGrant, createRefreshTokenGrant } from './grants.js'
