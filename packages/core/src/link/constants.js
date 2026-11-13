/**
 * Values of core's MCP link (task F-LINK; design §6.3, §9.1; requirements R-FB-03, R-FB-04,
 * R-REM-04; cases REM-EP-01, REM-DT-01, REM-UC-02).
 *
 * Every value K1 (`fishball-connector/mcp-schema`) owns is imported from it through `./schema.js`.
 * The values below have **no runtime owner yet** in a frozen contract:
 * - the status words exist only as K3 types (`fishball-connector/host-services` child.d.ts
 *   `TargetState`, `TargetCode`), and the `disconnected` answer code only as a K3 type
 *   (`fishball-core/contracts` events.d.ts `CommitSendResult`);
 * - the target-URL refusal codes and the backoff bounds are fixed by no requirement.
 * Each is declared once here, marked PROPOSED, and imported wherever it is used, so the K-VALUES
 * task can move it into the frozen contracts by changing this file alone.
 */
import { createRequire } from 'node:module'
import { OAUTH_ERROR, PROTOCOL, RESOURCE } from './schema.js'

// Core's own manifest is the one owner of its version, which the link reports as its clientInfo.
const CORE_VERSION = createRequire(import.meta.url)('../../package.json').version

/**
 * The link's state words, spelled as K3's `TargetState` (design §4.1). PROPOSED runtime owner: K3
 * froze the spelling as a type only.
 */
export const TARGET_STATE = Object.freeze({
  connected: 'connected',
  unreachable: 'target-unreachable',
  refused: 'token-refused',
  unset: 'target-unset',
})

/**
 * The link's status codes, spelled as K3's `TargetCode` (design §6.1, §9.1; R-MIG-03). PROPOSED
 * runtime owner, as TARGET_STATE. `token-revoked` is not produced here: it needs the persisted
 * paired record, which is F-PAIR's.
 */
export const TARGET_CODE = Object.freeze({
  unreachable: 'TARGET_UNREACHABLE',
  refused: 'TOKEN_REFUSED',
  incompatible: 'TARGET_INCOMPATIBLE',
})

/**
 * Why core refuses a target URL itself, before any request (R-FB-04; REM-EP-01 rows 6–8, "K
 * code"). PROPOSED codes: no requirement or K freeze names them. A refused URL reports
 * `target-unset` with this code, since there is nothing core may connect with (K3 child.d.ts
 * `target-unset`); K3's `TargetCode` type does not list these codes yet.
 */
export const TARGET_REFUSAL = Object.freeze({
  // Plain `http:` to a host that is not a loopback name. The SDK refuses this only for the token
  // endpoint, not for the MCP URL, so core must (spike V3-S7 `8e92b84` §4.4).
  insecure: 'target-insecure',
  // Not a URL, or a scheme other than `http:` / `https:` (for example `ftp:`).
  invalid: 'target-invalid',
})

/**
 * The answer of a call made while the link is down (design §6.3, R-REM-04): the call never
 * reached the connector and the offer waits there. Spelled as K3's `CommitSendResult` code.
 * PROPOSED runtime owner.
 */
export const LINK_REFUSAL = Object.freeze({ disconnected: 'disconnected' })

/**
 * Bounded reconnect backoff (R-FB-04 "retries with bounded backoff"). PROPOSED values: no
 * requirement fixes them. The n-th consecutive failed attempt (from 0) waits
 * `min(initialMs * factor ** n, maxMs)`; a connected link resets the count.
 */
export const BACKOFF = Object.freeze({
  initialMs: 1000,
  factor: 2,
  maxMs: 60 * 1000,
})

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
