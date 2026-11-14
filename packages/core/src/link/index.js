/**
 * `fishball-core/link`: core's MCP link to its target connector (task F-LINK, design §6.3).
 * - `createLink(options)` / `McpLink`: the one logical link (connect, listen, poll, backoff, status);
 * - `checkTarget(url)`: the target URL rule, applied before any request (REM-EP-01);
 * - `failureStatus`, `STATUS`, `refusedTarget`: the target status table (REM-DT-01);
 * - `backoffDelayMs(n)`: the bounded reconnect delay;
 * - the link's values: its own (`./constants.js`), K1's target words and K3's backoff, re-exported.
 */
export { McpLink, createLink, backoffDelayMs } from './link.js'
export { checkTarget } from './target.js'
export { STATUS, failureStatus, refusedTarget } from './status.js'
export { TARGET_STATE, TARGET_CODE, LINK_REFUSAL } from './schema.js'
export { LINK_BACKOFF } from '../../contracts/constants.js'
export { LINK_MCP, REFUSED_OAUTH_ERRORS } from './constants.js'
