/**
 * The ask card: an `ask` event (`ask_agent`) that Fishball cannot decide, shown to the user in
 * Fishball's own conversation (task K3 freezes its fields; R-FB-11, PLAT-UC-07; S4-Q2 decided).
 * Types only. F-ASKCARD builds it in `packages/core/ui/asks/` and `packages/core/src/asks/`.
 *
 * The card has no time limit (R-CON-05): it stays open until it is answered here or the ask is
 * settled elsewhere. The main DSH shows no card for it (R-UI-12).
 *
 * R-FB-11 fixes what the card shows: the asking session, the question, and the answer choices or a
 * free answer. Every field name, `state` value and `AskCardAnswer` below is PROPOSED. The values
 * come from the `ask` event's payload, which is K1's (its V2 descriptor: `approvalId`, `offerId`,
 * `prompt`, `choices`, `at`); a V2 `ask_agent` offers no choices, so `choices` is empty for it
 * until a K1 amendment adds any.
 */

/**
 * - `approvalId` / `offerId`: the ask's request id and its current offer id (K1's descriptor);
 *   the answer is committed through core's link on `offerId`, first commit wins (OQ-14);
 * - `sessionId`, `sessionTitle`: the asking session (`sessionTitle` is `null` when unknown);
 * - `question`: the question as the session asked it (the descriptor's `prompt`);
 * - `choices`: the answers offered; when it is empty the user types a free answer instead;
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
  readonly choices: readonly string[]
  readonly askedAt: number
  readonly state: 'open' | 'answered' | 'closed'
}

/** The user's answer: one of `choices`, or free text when `choices` is empty. */
export type AskCardAnswer = { readonly choice: string } | { readonly text: string }
