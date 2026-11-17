/**
 * The connector's core MCP tools (task C-TOOLS; design §3.2; R-CON-02/05/06/07, R-WATCH-03,
 * R-EXT-13, R-ROUTE-02, requirements 1.23 item 4). Composition only; C-WIRE builds it once per
 * connector life and hands `populate` to C-HTTP's `createMcpEndpoint({…, populate})`.
 *
 *   createCoreTools(ports) → populate(server, caller)
 *
 * Ports (the frozen K1 / K1c interfaces, plus the domain port C-WIRE binds, src/wire/domain.js):
 * - `pairs`: K1 `PairStore` (C-PAIR): `pair`, `setName`, `byPrincipal`;
 * - `mailbox`: K1 `Mailbox` (C-MAILBOX): `poll`, `ack`;
 * - `managed`: K1c `ManagedState` (C-ROUTE): `managerOf`, `managed`, `manage`, `release`;
 * - `domain`: the session and interaction domain, never a DSH service and never reachable over
 *   MCP or HTTP. Every answer is in K1's shapes (shapes.js); a refusal is `{ok: false, code}` or a
 *   thrown `RefusalError` (src/errors.js):
 *   - `domain.sessions`:
 *     - `rootOf(sessionId) → string`: the session the user sees (a subagent's root, V2's
 *       `rootSessionOf`); synchronous;
 *     - `describe(sessionId) → Promise<SessionSummary | undefined>`: undefined for no such (or an
 *       archived) session;
 *     - `start(args, {onCreated}) → Promise<{sessionId, titleError?, workspaceError?}>`: the start
 *       (folder resolution, title, model, first message) with no watch; it awaits
 *       `onCreated(sessionId)` once the session exists and before its first message, so the
 *       caller manages it before its first turn can produce an event (R-ROUTE-01);
 *     - `message`, `redirect({sessionId, message, attachments, admit}) → Promise<{status}>`;
 *     - `stop({sessionId, reason?, admit})`. `admit()` throws a `RefusalError` once the caller no
 *       longer manages the session; the port calls it after each DSH await and right before its
 *       side effect (review F02);
 *     - `read({sessionId, maxMessages, maxBytes}) → Promise<{messages, truncated}>`;
 *   - `domain.interactions`:
 *     - `liveOffers(rootSessionId) → [{principalKey, descriptor}]`: the session's live offers,
 *       each descriptor with its current `offerId` (`<approvalId>.r<revision>`), held by
 *       `principalKey` (C-ROUTE / C-WIRE; Fishball's decision Q1, 2026-11-14);
 *     - `answerApproval({sessionId, approvalId, answer, principalKey})` (the answering holder), `answerQuestion({sessionId, questionId,
 *       answers?, approve?, feedback?, toUser?, note?, principalKey})` (the answering holder) → `{ok, code?, grantId?, expiresAt?}`;
 *     - `listPrompts() → PromptSummary[]` (every open prompt; the tools keep the caller's);
 *       `answerPrompt({promptId, decision, risk?, reason}) → {ok, code?, promptId, decision, managed}`;
 *     - `listGrants() → GrantSummary[]`; `revokeGrant({grantId, reason, principalKey}) → {ok, code?}` (rejects when the revocation could not be stored);
 *   - `domain.attachments`: `put(args) → {hostRef, expiresAt}`, `read({sessionId, attachmentId})`;
 * - `contributions` (optional): C-EXT's `{list, call}`; contributed tools follow the core tools;
 * - `now`: the injected clock (epoch ms); `logger`: `{warn}`.
 *
 * No timer, no watch tool, no attention tool (R-WATCH-03, R-EXT-13).
 */
import { createDispatch } from './dispatch.js'
import { createHandlers } from './handlers.js'
import { createOfferDesk } from './offers.js'
import { createSessionAccess } from './sessions.js'

/** @returns {(server: import('@modelcontextprotocol/server').McpServer, caller: import('../../../mcp-schema/index.js').Caller) => void} */
export function createCoreTools({ pairs, mailbox, managed, domain, contributions, now, logger }) {
  const access = createSessionAccess({ managed, sessions: domain.sessions })
  const offers = createOfferDesk({ interactions: domain.interactions })
  const handlers = createHandlers({ pairs, mailbox, managed, domain, now, logger }, access, offers)
  return createDispatch({ handlers, contributions, pairs, now, logger })
}
