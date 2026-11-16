/**
 * Values of core's MCP link (task F-LINK; design §6.3, §9.1; requirements R-FB-03, R-FB-04,
 * R-REM-04; cases REM-EP-01, REM-DT-01, REM-UC-02) that are the link's own.
 *
 * The contract values live in core's frozen K3 contracts (`contracts/constants.js`): the target
 * states and codes and the `disconnected` answer in `LINK`, the connector's MCP surface in `MCP`
 * (core's own copy, design §1.0b row 1), the reconnect backoff in `LINK_BACKOFF`.
 */
import { createRequire } from 'node:module'
import { MCP } from '../../contracts/constants.js'

// Core's own manifest is the one owner of its version, which the link reports as its clientInfo.
const CORE_VERSION = createRequire(import.meta.url)('../../package.json').version

/**
 * MCP client settings of the link (design §6.3, Q12): modern-only at the connector's one revision, listening
 * on the one events resource and on tool-list changes (the bridge façade re-lists, design §13.4).
 */
export const LINK_MCP = Object.freeze({
  // Core's own packaged client (design §5a.1, §9.1), never the host's transitive copy.
  clientPackage: '@modelcontextprotocol/client',
  clientInfo: Object.freeze({ name: 'fishball-core', version: CORE_VERSION }),
  versionPin: MCP.protocolVersion,
  eventsUri: MCP.events.uri,
  resourceUpdated: 'notifications/resources/updated',
  toolsListChanged: 'notifications/tools/list_changed',
  // A client-credentials client cannot widen its scope by re-authorizing, so a 403
  // insufficient_scope is reported, not retried (the SDK's own advice for m2m clients).
  onInsufficientScope: 'throw',
  // No request follows a redirect: a credential never travels to a redirect target (design §6.3).
  redirect: 'error',
})

/**
 * Core's saved credential and Connect (task F-LINK-SAVE; requirements 1.29 R7, 1.30 R9, 1.31 R10,
 * 1.32 R12–R14; Q-LS1 = A; design §5.4, §6.3, §6.3a). The published names are K3a's
 * (`HOSTED_IMPORT`, `CONNECT`); these are the module's own.
 * - `hostedPayload`: the payload of `HOSTED_IMPORT.savedRecord` (K3a: "core's own format"): a
 *   version and the accepted token value per target origin (R9: "keyed by target origin");
 * - `grantRecordIdPrefix` / `originEncoding`: the id segment of Connect's grant record for one
 *   target origin (K3a leaves it to core): DSH's key grammar is `[a-z][a-z0-9-]*`, an origin holds
 *   `:` `/` `.` and upper case, so the origin's UTF-8 bytes go in lowercase hex (the adapter's way);
 * - `credentialId`: the non-secret id of one credential, which F-PAIR keys its records on
 *   (decided item 13): a token by the SHA-256 of its value, the connector's own digest (K1
 *   `TOKEN_VALUE.digestAlgorithm`), so the token in the reference and its saved copy are one
 *   credential; a Connect grant by the random id it was saved with;
 * - `refreshLeadMs`: a Connect access token is refreshed this long before it expires, the adapter's
 *   K value (S7c; the connector's access token lives 3600 s, Q27);
 * - `attemptTimeoutMs`: one Connect attempt's lifetime, the connector's pending-request lifetime
 *   (R-OA-15), the most an approval can take;
 * - `flow`: the `ctx.authorization` flow core registers per grant record (one method: the browser);
 * - `events`: DSH's credential events (dsh-credentials, both SDKs);
 * - `logger`, `text`: background log lines (a code, never a value) and the notice of the approval URL.
 */
export const LINK_SAVE = Object.freeze({
  hostedPayload: Object.freeze({ version: 1 }),
  grantRecordIdPrefix: 'connect-',
  originEncoding: 'hex',
  credentialId: Object.freeze({ tokenPrefix: 'token:', grantPrefix: 'grant:', digest: 'sha256', digestEncoding: 'hex' }),
  refreshLeadMs: 300_000,
  attemptTimeoutMs: 600_000,
  flow: Object.freeze({ label: 'Fishball Connect', method: Object.freeze({ id: 'browser', label: 'Connect with the browser' }) }),
  events: Object.freeze({ referenceUpdated: 'credentials/reference-updated', recordUpdated: 'credentials/record-updated' }),
  logger: 'fishball-link',
  text: Object.freeze({
    approval: 'Open this URL in your browser and enter a token freshly generated in the target DSH\'s connector settings. The URL holds no secret and stops working once this Connect ends.',
    failed: '%s failed (%s)',
    save: 'saving the accepted credential',
    unset: 'clearing the imported token reference',
    read: 'reading the saved credential',
    forget: 'removing the replaced credential',
  }),
})

/**
 * OAuth error codes that mean the target refused the credential (RFC 6749 §5.2). The first two are
 * the connector's (`MCP.oauth.error`). `unauthorized_client` is not in its vocabulary (the
 * connector never sends it); it is kept so a refusal by any RFC 6749 server still reads as
 * `token-refused`.
 */
export const REFUSED_OAUTH_ERRORS = Object.freeze([MCP.oauth.error.invalidClient, MCP.oauth.error.invalidGrant, 'unauthorized_client'])
