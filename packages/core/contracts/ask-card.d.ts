/**
 * The ask card: a request Fishball cannot decide, shown to the user in Fishball's own conversation
 * (task K3 freezes its fields; R-FB-11, PLAT-UC-07; S4-Q2 decided). Types only. F-ASKCARD builds it
 * in `packages/core/src/asks/` (the store, the `ask_user` filing tool, the answer commit); the card
 * itself is drawn by fishball-ui's `client.asks.js` (F-UI; a flat client chunk: DSH serves no chunk
 * from a folder), over core's routes.
 *
 * Amended by F-FIX (the user, 2026-11-17): with `ask_agent` removed (C-WIRE-2), a card is filed for
 * a `permission` offer (and for the frozen `ask` type, which nothing produces today). The user's
 * answer "Show arguments and reason" adds `arguments`, `argumentsStatus` and `reason`, and a call
 * whose arguments are not complete offers Reject only (the connector refuses an allow then).
 *
 * The card has no time limit (R-CON-05): it stays open until it is answered here or the request is
 * settled elsewhere. The main DSH shows no card for it (R-UI-12).
 *
 * R-FB-11 fixes what the card shows: the asking session, the question, and the answer choices. The
 * values come from the offer event's payload, which is K1's descriptor (`approvalId`, `offerId`,
 * `prompt`, `title`, `at`, `arguments`, `argumentsStatus`, `reason`). The field names and `state`
 * values are as proposed (v3-proposed-values.md rows 51–52, DECIDED: keep). Q3 = A (the user,
 * 2026-11-15) fixes the answer: Allow and Reject, each with an optional reason, the free text going
 * into the reason (F-ASKCARD amendment, Fishball's decision 2026-11-16).
 */

/**
 * - `approvalId` / `offerId`: the request id and its current offer id (K1's descriptor); the
 *   answer is committed through core's link on `offerId`, first commit wins (OQ-14). A newer offer
 *   of the same request replaces the card, unfiled, until Fishball files it again;
 * - `sessionId`, `sessionTitle`: the asking session (`sessionTitle` is `null` when unknown);
 * - `question`: the request as the connector summarises it (the descriptor's `prompt`);
 * - `arguments`: the call's arguments as the connector sent them (text, possibly truncated), or
 *   `null` when the descriptor has none; `argumentsStatus`: K1's `complete` / `truncated` /
 *   `unavailable`, or `null`;
 * - `reason`: the session's own reason for the call, or `null` when it gave none;
 * - `choices`: the answers offered: `['allow', 'reject']` (Q3 = A; K1's `approval_answer` decision
 *   words, whatever the descriptor lists), or `['reject']` when `argumentsStatus` is set and not
 *   `complete`;
 * - `askedAt`: epoch milliseconds of the request;
 * - `state`: `open` until an answer is committed (`answered`) or the request is settled or withdrawn
 *   elsewhere (`closed`). A late answer on a non-open card changes nothing.
 */
export interface AskCard {
  readonly approvalId: string
  readonly offerId: string
  readonly sessionId: string
  readonly sessionTitle: string | null
  readonly question: string
  readonly arguments: string | null
  readonly argumentsStatus: 'complete' | 'truncated' | 'unavailable' | null
  readonly reason: string | null
  readonly choices: readonly ('allow' | 'reject')[]
  readonly askedAt: number
  readonly state: 'open' | 'answered' | 'closed'
}

/**
 * The user's answer (Q3 = A): one of the card's `choices`, and an optional reason. A blank or absent
 * `text` is sent with core's fixed default reason, because the connector requires one (Fishball's
 * decision 2026-11-16). A choice the card does not offer is refused `invalid-arguments`.
 */
export type AskCardAnswer = { readonly choice: 'allow' | 'reject'; readonly text?: string }
