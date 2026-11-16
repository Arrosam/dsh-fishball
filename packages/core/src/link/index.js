/**
 * `fishball-core/link`: core's MCP link to its target connector (task F-LINK, design §6.3).
 * - `createLink(options)` / `McpLink`: the one logical link (connect, listen, poll, backoff, status);
 * - `checkTarget(url)`: the target URL rule, applied before any request (REM-EP-01);
 * - `failureStatus`, `STATUS`, `refusedTarget`: the target status table (REM-DT-01);
 * - `backoffDelayMs(n)`: the bounded reconnect delay;
 * - `createLinkCredentials(ctx, options)`: the link's credential source over DSH's credential store,
 *   the saved credential (R7, R9) and Connect (F-LINK-SAVE); `CREDENTIAL_KIND`, `tokenCredentialId`
 *   and `grantRecordKey` name what it saves;
 * - `subscribe`, `emitIsolated`: the listener sets the link and modules built on it (F-PAIR) share;
 * - the link's values: its own (`./constants.js`), and K3's target words (`LINK`, core's own copy
 *   since K3a) and backoff, re-exported.
 */
export { McpLink, createLink, backoffDelayMs } from './link.js'
export { checkTarget } from './target.js'
export { createLinkCredentials, CREDENTIAL_KIND, tokenCredentialId, grantRecordKey } from './credentials.js'
export { subscribe, emitIsolated } from './listeners.js'
export { STATUS, failureStatus, refusedTarget } from './status.js'
export { LINK, LINK_BACKOFF } from '../../contracts/constants.js'
export { LINK_MCP, LINK_SAVE, REFUSED_OAUTH_ERRORS } from './constants.js'
