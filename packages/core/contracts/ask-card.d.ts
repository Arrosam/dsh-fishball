/**
 * The ask card: an `ask` event (`ask_agent`) that Fishball cannot decide, shown to the user in
 * Fishball's own conversation (task K3 freezes its fields; R-FB-11, PLAT-UC-07; S4-Q2 decided).
 * Types only. F-ASKCARD builds it in `packages/core/src/asks/` (the store, the `ask_user` filing
 * tool, the answer commit) and `packages/core/client.asks.js` (the card, a flat client chunk: DSH
 * serves no chunk from a folder).
 *
 * The card has no time limit (R-CON-05): it stays open until it is answered here or the ask is
 * settled elsewhere. The main DSH shows no card for it (R-UI-12).
 *
 * R-FB-11 fixes what the card shows: the asking session, the question, and the answer choices or a
 * free answer. The values come from the `ask` event's payload, which is K1's (its V2 descriptor:
 * `approvalId`, `offerId`, `prompt`, `title`, `at`). The field names and `state` values are as
 * proposed (v3-proposed-values.md rows 51–52, DECIDED: keep). Q3 = A (the user, 2026-11-15) fixes
 * the answer: exactly Allow and Reject, each with an optional reason, the free text going into the
 * reason (F-ASKCARD amendment, Fishball's decision 2026-11-16).
 */

/**
 * - `approvalId` / `offerId`: the ask's request id and its current offer id (K1's descriptor);
 *   the answer is committed through core's link on `offerId`, first commit wins (OQ-14);
 * - `sessionId`, `sessionTitle`: the asking session (`sessionTitle` is `null` when unknown);
 * - `question`: the question as the session asked it (the descriptor's `prompt`);
 * - `choices`: the answers offered, always `['allow', 'reject']` (Q3 = A; K1's `approval_answer`
 *   decision words, whatever the descriptor lists);
 * - `askedAt`: epoch milliseconds of the ask;
 * - `state`: `open` until an answer is committed (`answered`) or the ask is settled or withdrawn
 *   elsewhere (`closed`). A late answer on a non-open card changes nothing.
 */
export interface AskCard {
  readonly approvalId: string
  readonly offerId: string
  readonly sessionId: string
  readonly sessionTitle: string | null
  readonly question: string
  readonly choices: readonly ('allow' | 'reject')[]
  readonly askedAt: number
  readonly state: 'open' | 'answered' | 'closed'
}

/**
 * The user's answer (Q3 = A): one of `choices`, and an optional reason. A blank or absent `text` is
 * sent with core's fixed default reason, because the connector requires one (Fishball's decision
 * 2026-11-16).
 */
export type AskCardAnswer = { readonly choice: 'allow' | 'reject'; readonly text?: string }
