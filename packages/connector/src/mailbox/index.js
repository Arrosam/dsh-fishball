/**
 * The connector's mailbox module (task C-MAILBOX). Composition only: C-WIRE opens the tables from
 * the connector row and hands C-HTTP's `HintSink` in. C-HTTP and C-TOOLS call the handlers below
 * from their `inbox_poll` / `inbox_ack` tools and from `resources/read fishball://events`.
 *
 * - `openMailboxTables(ctx, {defineDomain, domainTable})` → `{tables, close}`.
 * - `createMailbox({tables, hints, now?, newId?, maxQueuedInputs?, logger?})` → the K1 `Mailbox`
 *   plus `expireHolds(now)`.
 * - `inboxPollTool`, `inboxAckTool` → K1 `CallToolResult`s. `readEventsResource` → the summary
 *   JSON text (design §3.3: never event bodies).
 */
import { RESOURCE, okResult, refusalResult } from '../../mcp-schema/index.js'

export { createMailbox } from './mailbox.js'
export { openMailboxTables } from './store.js'

/** `{ok: true, …}` → `okResult`, `{ok: false, code}` → `refusalResult` (K1 envelope). */
const asToolResult = ({ ok, code, ...fields }) => (ok ? okResult(fields) : refusalResult(code))

/** `inbox_poll({cursor?, limit?})` for an authenticated full-power principal. */
export const inboxPollTool = async (mailbox, principalKey, args = {}) => asToolResult(await mailbox.poll(principalKey, args.cursor, args.limit))

/** `inbox_ack({receipts})` for an authenticated full-power principal. */
export const inboxAckTool = async (mailbox, principalKey, args = {}) => asToolResult(await mailbox.ack(principalKey, args.receipts))

/** `resources/read fishball://events`: one JSON text content of the caller's own summary. */
export async function readEventsResource(mailbox, principalKey) {
  const summary = await mailbox.summary(principalKey)
  return { contents: [{ uri: RESOURCE.events.uri, mimeType: RESOURCE.events.mimeType, text: JSON.stringify(summary) }] }
}
