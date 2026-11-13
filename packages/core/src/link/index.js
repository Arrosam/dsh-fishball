/**
 * `fishball-core/link`: core's MCP link to its target connector (task F-LINK, design §6.3).
 * - `createLink(options)` / `McpLink`: the one logical link (connect, listen, poll, backoff, status);
 * - `checkTarget(url)`: the target URL rule, applied before any request (REM-EP-01);
 * - `failureStatus`, `STATUS`, `refusedTarget`: the target status table (REM-DT-01);
 * - `backoffDelayMs(n)`: the bounded reconnect delay;
 * - the link's constants (`./constants.js`), several PROPOSED until the K-VALUES task owns them.
 */
export { McpLink, createLink, backoffDelayMs } from './link.js'
export { checkTarget } from './target.js'
export { STATUS, failureStatus, refusedTarget } from './status.js'
export { TARGET_STATE, TARGET_CODE, TARGET_REFUSAL, LINK_REFUSAL, BACKOFF, LINK_MCP, REFUSED_OAUTH_ERRORS } from './constants.js'
