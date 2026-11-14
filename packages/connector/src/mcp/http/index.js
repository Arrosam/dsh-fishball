/**
 * The connector's MCP HTTP module (task C-HTTP). C-WIRE builds, once per connector life:
 *
 * - `createRequestGate(facts, {originOf, logger})` → the one K1 `RequestGate` (`check` on the `mcp`,
 *   `token` and `approval` surfaces, `admit` on `mcp`), handed to C-OAUTH and C-OAUTH-WEB too; an
 *   insecure listener is logged once, when the gate is built;
 * - `createMcpEndpoint({gate, verifier, failures, pairs, originOf, secure, readEvents, populate?,
 *   now, logger})` → `{handler, hints, presence, toolsChanged, closeEntry, close}`:
 *   - `handler`: the raw `exact` route for PATHS.mcp on DSH's `webServer`;
 *   - `hints`: the K1 `HintSink` C-MAILBOX calls after each commit;
 *   - `presence`: the K1 `Presence` (CONNECTED);
 *   - `toolsChanged()`: `notifications/tools/list_changed` to every pair's streams (C-EXT);
 *   - `closeEntry(entryKey)`: a revocation closes that entry's listen streams only (R-TOK-05);
 *   - `close()`: on dispose.
 *
 * `originOf` is C-OAUTH's (`src/mcp/oauth/`, `originOf(req, {secure})`); C-WIRE passes it in so
 * this module needs no import of a sibling W2 task.
 */
export { createRequestGate } from './gate.js'
export { createMcpEndpoint } from './endpoint.js'
