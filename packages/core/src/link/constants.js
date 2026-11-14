/**
 * Values of core's MCP link (task F-LINK; design §6.3, §9.1; requirements R-FB-03, R-FB-04,
 * R-REM-04; cases REM-EP-01, REM-DT-01, REM-UC-02) that are the link's own.
 *
 * The contract values live in their frozen contracts: the target states and codes and the
 * `disconnected` answer in K1 (`TARGET_STATE`, `TARGET_CODE`, `LINK_REFUSAL`, read through
 * `./schema.js`), the reconnect backoff in K3 (`contracts/constants.js` `LINK_BACKOFF`).
 */
import { createRequire } from 'node:module'
import { OAUTH_ERROR, PROTOCOL, RESOURCE } from './schema.js'

// Core's own manifest is the one owner of its version, which the link reports as its clientInfo.
const CORE_VERSION = createRequire(import.meta.url)('../../package.json').version

/**
 * MCP client settings of the link (design §6.3, Q12): modern-only at K1's one revision, listening
 * on the one events resource and on tool-list changes (the bridge façade re-lists, design §13.4).
 */
export const LINK_MCP = Object.freeze({
  // Core's own packaged client (design §5a.1, §9.1), never the host's transitive copy.
  clientPackage: '@modelcontextprotocol/client',
  clientInfo: Object.freeze({ name: 'fishball-core', version: CORE_VERSION }),
  versionPin: PROTOCOL.version,
  eventsUri: RESOURCE.events.uri,
  resourceUpdated: 'notifications/resources/updated',
  toolsListChanged: 'notifications/tools/list_changed',
  // A client-credentials client cannot widen its scope by re-authorizing, so a 403
  // insufficient_scope is reported, not retried (the SDK's own advice for m2m clients).
  onInsufficientScope: 'throw',
  // No request follows a redirect: a credential never travels to a redirect target (design §6.3).
  redirect: 'error',
})

/**
 * OAuth error codes that mean the target refused the credential (RFC 6749 §5.2). K1 owns the
 * first two. `unauthorized_client` is not in K1's vocabulary (the connector never sends it); it is
 * kept so a refusal by any RFC 6749 server still reads as `token-refused`.
 */
export const REFUSED_OAUTH_ERRORS = Object.freeze([OAUTH_ERROR.invalidClient, OAUTH_ERROR.invalidGrant, 'unauthorized_client'])
