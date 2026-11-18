/**
 * Values of core's MCP link (task F-LINK; design §6.3, §9.1; requirements R-FB-03, R-FB-04,
 * R-REM-04; cases REM-EP-01, REM-DT-01, REM-UC-02) that are the link's own.
 *
 * The contract values live in core's frozen K3 contracts (`contracts/constants.js`): the target
 * states and codes and the `disconnected` answer in `LINK`, the connector's MCP surface in `MCP`
 * (core's own copy, design §1.0b row 1), the reconnect backoff in `LINK_BACKOFF`.
 */
import { createRequire } from 'node:module'
import { CONNECT, MCP } from '../../contracts/constants.js'

// Core's credential-record scope (K3a: Connect's grants and the hosted copy live under it).
const CORE_RECORD_SCOPE = CONNECT.grantRecordScope

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
  // MULTI-0: the identity resource the same listen stream also subscribes to, and where
  // `server/discover` carries the server's name (PLAN-MULTI §4.3).
  identityUri: MCP.identity.uri,
  serverInfoKey: MCP.serverIdentity.discoverMetaKey,
  // `inbox_poll`'s page argument (K1 `inbox_poll({cursor?, limit?})`); no limit is sent, so each
  // page is the connector's default size.
  cursorArgument: 'cursor',
  resourceUpdated: MCP.serverIdentity.updatedNotification,
  toolsListChanged: 'notifications/tools/list_changed',
  // A client-credentials client cannot widen its scope by re-authorizing, so a 403
  // insufficient_scope is reported, not retried (the SDK's own advice for m2m clients).
  onInsufficientScope: 'throw',
  // No request follows a redirect: a credential never travels to a redirect target (design §6.3).
  redirect: 'error',
  // The SDK's `invalidateCredentials` scope for the client's own credentials, and the message of
  // the refusal its retry ends with (link.js `clientCredentialsOnce`; no value in it).
  invalidatedClient: 'client',
  refusedOnce: 'the target refused this client secret',
  // The background-log reason when this package cannot be imported (a broken install): without it
  // the attempt reads only as `target-unreachable` (F-FIX-3). Logged with `LINK_SAVE.text.failed`.
  clientImport: 'loading the MCP client package',
})

/**
 * Core's saved credential and Connect (task F-LINK-SAVE; requirements 1.29 R7, 1.30 R9, 1.31 R10,
 * 1.32 R12–R14; Q-LS1 = A; design §5.4, §6.3, §6.3a). The published names are K3a's
 * (`HOSTED_IMPORT`, `CONNECT`); these are the module's own.
 * - `hostedPayload`: the payload of a saved token copy (`HOSTED_IMPORT.savedRecord` for the parent,
 *   K3a: "core's own format"; an added target's own record): a version, the accepted value and its
 *   `TargetCredentialBinding` (MULTI-0 security amendment);
 * - Connect's grant record is one per target epoch since MULTI-0 (`TARGETS.credentials`,
 *   `credentials.js` `credentialNames`), no longer one per hex-encoded origin;
 * - `credentialId`: the non-secret id of one credential, which F-PAIR keys its records on
 *   (decided item 13): a token by a SHA-256 of its value under core's `domain` prefix (so it never
 *   equals the connector's own lookup digest), so the token in the reference and its saved copy are
 *   one credential; a Connect grant by the random id it was saved with;
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
  /**
   * The parent epoch a value in the hosted reference was put there for (R-FIX F01; MULTI-0 security
   * amendment): each `{ref, binding}` pairs a value's non-secret id (`credentialId`) with its
   * `TargetCredentialBinding` (parent epoch, origin, agent id). Keep masked bindings until their
   * epoch retires, and retired ids separately, so replacing an active binding cannot make a
   * retired fallback usable again.
   * The parent's alone: an added target's reference name holds its epoch.
   */
  pendingOrigin: Object.freeze({ key: CORE_RECORD_SCOPE + '/pending-token-origin', kind: 'grant', version: 1 }),
  // The grant payload field holding the fishball id Connect passed as `agent_id` (R-FIX F10).
  grantAgentIdField: 'agentId',
  credentialId: Object.freeze({ tokenPrefix: 'token:', grantPrefix: 'grant:', domain: 'fishball-core credential id\n', digest: 'sha256', digestEncoding: 'hex' }),
  /** The `ConnectBegin` outcome with an approval URL (`connect.d.ts`), and DSH's `begin()` status word for a committed grant (dsh-authorization `AuthorizationStatus`). */
  approvalUrlOutcome: 'approval-url',
  authorizationAuthorized: 'authorized',
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
    // A TypeError (programming error) of createLinkCredentials, never shown to a user.
    names: 'fishball-core link: credentials need a target epoch\'s names (credentialNames)',
  }),
})

/**
 * OAuth error codes that mean the target refused the credential (RFC 6749 §5.2). The first two are
 * the connector's (`MCP.oauth.error`). `unauthorized_client` is not in its vocabulary (the
 * connector never sends it); it is kept so a refusal by any RFC 6749 server still reads as
 * `token-refused`.
 */
export const REFUSED_OAUTH_ERRORS = Object.freeze([MCP.oauth.error.invalidClient, MCP.oauth.error.invalidGrant, 'unauthorized_client'])

/**
 * Connect's web callback route (web-callback.js; Q-A3 = B). Its path is K3a's
 * `CONNECT.callback.webPath`; these are the route's own values:
 * - `routeKind` / `method`: one exact DSH web-server route (dsh-host-webserver `WebRouteKind`), GET
 *   only, as the authorization response redirect is (RFC 6749 §4.1.2);
 * - `base`: the base URL a request target is parsed against (only its query is read);
 * - `hostHeader` / `originHeader`: the Fetch request headers the Connect route decides from;
 * - `scheme`: prefixed to a bare `Host` header so it parses as a URL (only its hostname is read).
 */
export const WEB_CALLBACK = Object.freeze({
  routeKind: 'exact',
  method: 'GET',
  base: 'http://web-callback.invalid',
  hostHeader: 'host',
  originHeader: 'origin',
  scheme: 'http://',
  /** The body of a refused callback request. */
  emptyBody: '',
})
