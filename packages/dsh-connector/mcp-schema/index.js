/**
 * `dsh-connector/mcp-schema`: the frozen contract of the connector's MCP surface (task K1;
 * design §3, §5.5, §5.5a, §5.8, §9.1, §11 V3-K). Data, pure builders and pure rules only: no DSH
 * import, no service, no state, no I/O. It loads in plain Node, because `fishball-core` vendors a
 * copy of it (design §9.1). The internal module interfaces W2 builds against are types only, in
 * the sibling `index.d.ts`; the prose freeze is `README.md`.
 *
 * Frozen export names (renaming one is a K1 amendment):
 * - constants.js: PROTOCOL, SDK_PINS, PATHS, RESOURCE, SERVER_IDENTITY (MULTI-0), CONNECTED, SCOPE, GRANT, CLIENT_AUTH,
 *   GRANT_DISPATCH, RESPONSE_TYPE, PKCE, TOKEN_TYPE, OAUTH_ERROR, HTTP_STATUS, OAUTH_ERROR_STATUS,
 *   BEARER_CHALLENGE, INSUFFICIENT_SCOPE_REASON, PAIR_ONLY, TOKEN_VALUE, LIFETIME, RATE_LIMITS,
 *   FAILURE_LIMIT, ENDPOINT_LIMITS, TOKEN_ENDPOINT_LIMITS, HTTP_METHOD, HTTP_REFUSAL, HOSTS, GATE_SURFACE, ORIGIN_RULE,
 *   REQUEST_GATE, APPROVAL_LISTENER, CIMD_LIMITS,
 *   ID_GRAMMAR, AUTHORIZE_EXTENSION, DERIVED_AGENT_ID, NAME_RULES, PAIR_TIMING, PAIR_ADVICE, OFFER_ID, EVENT_TYPE, CONTRIBUTED_TYPE_PREFIX, OFFER_TYPES,
 *   ANSWERABLE_TYPES, DECISION_KIND, DECISION_KIND_OF, QUEUE, MAILBOX, RESYNC_REASON,
 *   SETTLEMENT_OUTCOME, SETTLED_BY, DELEGATE_OUTCOME, READ_ROLE, RETIREMENT_REASON, ENTRY_STATUS, SETTINGS_REFUSAL, REVOCATION_KIND, PAIR_STATE,
 *   CONNECTOR_STATUS, TARGET_STATE, TARGET_CODE, LINK_REFUSAL, TOOL, REFUSAL, MANAGED_REFUSAL, ID_REFUSAL, NOTICE,
 *   WIRE;
 * - tools.js: TOOLS, TOOL_NAMES, toolDefinition, refusalSchema;
 * - events.js: EVENT_PAYLOAD_SCHEMA, CONTRIBUTED_PAYLOAD_SCHEMA, MAILBOX_EVENT_SCHEMA,
 *   MAILBOX_SUMMARY_SCHEMA, payloadSchemaOf;
 * - envelope.js: okResult, refusalResult;
 * - oauth.js: oauthUrls, protectedResourceMetadata, authorizationServerMetadata, tokenResponse,
 *   oauthErrorBody, bearerChallenge, invalidTokenChallenge, insufficientScopeChallenge;
 * - rules.js: isAgentId, normaliseName, checkName, nameKey, principalLabel, formatOfferId,
 *   parseOfferId, isEventType (K1d withdrew isTokenLongEnough: every token value is generated).
 */
export * from './constants.js'
export { TOOLS, TOOL_NAMES, toolDefinition, refusalSchema } from './tools.js'
export { EVENT_PAYLOAD_SCHEMA, CONTRIBUTED_PAYLOAD_SCHEMA, MAILBOX_EVENT_SCHEMA, MAILBOX_SUMMARY_SCHEMA, payloadSchemaOf } from './events.js'
export { okResult, refusalResult } from './envelope.js'
export {
  oauthUrls, protectedResourceMetadata, authorizationServerMetadata, tokenResponse, oauthErrorBody, bearerChallenge,
  invalidTokenChallenge, insufficientScopeChallenge,
} from './oauth.js'
export {
  isAgentId, normaliseName, checkName, nameKey, principalLabel, formatOfferId, parseOfferId, isEventType,
} from './rules.js'
