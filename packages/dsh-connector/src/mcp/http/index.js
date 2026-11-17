/**
 * The connector's MCP HTTP module (task C-HTTP). C-WIRE builds, once per connector life:
 *
 * - `createRequestGate(facts, {logger})` → the one K1 `RequestGate` (`check` on the `mcp`,
 *   `token` and `approval` surfaces, `admit` on `mcp`), handed to C-OAUTH and C-OAUTH-WEB too; an
 *   insecure listener is logged once, when the gate is built;
 * - `createMcpEndpoint({gate, verifier, failures, pairs, secure, readEvents, dshName?, populate?, now,
 *   logger})` → `{handler, hints, presence, toolsChanged, closeEntry, close}`:
 *   - `dshName()`: the live configured/OS base name; the endpoint appends the literal `-DSH`;
 *   - `handler`: the raw `exact` route for PATHS.mcp on DSH's `webServer`;
 *   - `hints`: the K1 `HintSink` C-MAILBOX calls after each commit;
 *   - `presence`: the K1 `Presence` (CONNECTED);
 *   - `toolsChanged()`: `notifications/tools/list_changed` to every pair's streams (C-EXT);
 *   - `closeEntry(entryKey)`: a revocation closes that entry's listen streams only (R-TOK-05);
 *   - `close()`: on dispose.
 *
 * The request's origin (audience, `resource_metadata`, the approval page's own origin) is C-OAUTH's
 * one rule, `originOf(req, {secure})` from `../oauth/`, imported rather than re-derived.
 */
export { createRequestGate } from './gate.js'
export { createMcpEndpoint } from './endpoint.js'
