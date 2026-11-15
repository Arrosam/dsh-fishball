/**
 * The fishball-core / fishball-ui split seam (gate K3a; requirements 1.38 Q-N2, 1.41 Q-G1/Q-G2;
 * R-FB-14; design §1.0). Types only; the values are `constants.js`'s `UI_SEAM`.
 *
 * Core is the backend and keeps every state; fishball-ui draws it and holds none of its own
 * (requirements 1.38 item 4: "core只负责做后端"). They meet only here:
 * - fishball-ui's Node row reads core's `fishballInstance.ui` (`UI_SEAM.member`) at runtime with
 *   `ctx.get`, never through `inject` (a missing core must not fail its load); its browser half
 *   reaches that row through fishball-ui's own routes, which are fishball-ui's business;
 * - no `fishballInstance` (or another `apiVersion`): fishball-ui logs `UI_SEAM.coreMissing` once and
 *   changes nothing (Q-G2 = A);
 * - no fishball-ui: core runs normally and reports nothing about it (Q-G1).
 *
 * Every member reads or acts on state core already owns (F-LINK, F-PAIR, F-GUARDS, F-ASKCARD,
 * F-LINK-SAVE); the seam adds no behaviour. Each `onChange` returns its disposer and calls its
 * listener after each change of the matching read, never with a token value.
 */
import type { LinkStatus } from './link.js'
import type { FishballConnect } from './connect.js'
import type { GuardReport } from './guards.js'
import type { AskCard, AskCardAnswer } from './ask-card.js'

/** A listener's disposer. */
export type Dispose = () => void

/**
 * The pairing warning the Fishball page shows (F-PAIR's `PairingView`, AUTH-ST-03).
 * `state` is F-PAIR's `PAIRING_STATE` word; `choices` are the warning's choices, empty without one.
 */
export interface UiPairingView {
  readonly state: string
  readonly warning: object | null
  readonly choices: readonly string[]
  readonly nameIssue: object | null
}

/** A refusal: nothing changed. */
export type UiResult = { readonly ok: true } | { readonly ok: false; readonly code: string }

/** `fishballInstance.ui`: everything fishball-ui draws, read from core. */
export interface FishballUi {
  /** The manager session's id once it exists (X1), so the page opens it. */
  managerSessionId(): string | undefined

  /** The status strip: the link (`target-unset`, `token-refused`, …). */
  readonly link: { status(): LinkStatus; onChange(fn: (status: LinkStatus) => void): Dispose }

  /** The Connect control of the status strip (design §6.3a step 1). */
  readonly connect: FishballConnect

  /** The pairing warning and its choices (R-ID-07); `choose` is F-PAIR's, with its refusals. */
  readonly pairing: {
    state(): UiPairingView
    onChange(fn: (view: UiPairingView) => void): Dispose
    choose(choice: string, options?: { readonly confirmed?: boolean }): Promise<UiResult>
  }

  /** The `guards-overridden` line of the status strip (R-FB-09). */
  readonly guards: { report(): GuardReport; onChange(fn: (report: GuardReport) => void): Dispose }

  /**
   * The ask cards in Fishball's conversation (R-FB-11). `answer` commits once through core's link;
   * a late answer on a card that is not `open` changes nothing and answers the K1 refusal.
   */
  readonly asks: {
    list(): readonly AskCard[]
    onChange(fn: (cards: readonly AskCard[]) => void): Dispose
    answer(approvalId: string, answer: AskCardAnswer): Promise<UiResult>
  }
}
