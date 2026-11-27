/**
 * `dshConnectorUi`: the connector's UI backend for dsh-connector-ui (K3 amendment by I-HOST,
 * 2026-11-16, freezing C-UI-BACKEND's choices unchanged; requirements 1.34 "connector当后端，embed
 * UI当前端", 1.38 Q-N1/Q-N3/Q-U2, 1.41 Q-G4/Q-G5; R-ARCH-04, R-UI-05, R-UI-10, R-FN-01,
 * R-EXT-13; design §1.0, §3.6, §13.6). Provided by the connector row, looked up at runtime by
 * dsh-connector-ui (see index.d.ts). Types only; the runtime values are the connector's
 * `src/ui/constants.js` (`UI_SERVICE`, `UI_ROUTE`), and a change here changes them in the same
 * amendment.
 *
 * Every operation and all state behind what dsh-connector-ui draws are the connector's; embed-UI
 * holds none. There are no cards (Q-U2) and no inline records (Q-G4). The routes' marks, targets,
 * handover and takeback are drawn by the connector's own marks part (client.marks.js, DESIGN.md
 * §28), which reads them directly, with or without dsh-connector-ui; embed-UI draws the light and
 * the notice.
 */
import type { Dispose } from './index.js'

/** One managed-session mark (R-UI-05): `managed()` as it is, so a name always matches it. */
export interface UiMark {
  readonly sessionId: string
  readonly principal: { readonly key: string; readonly name: string | null; readonly id: string }
}

/** One Hand over target (R-UI-10): an enabled and paired principal, online or not, in `principals()` order. */
export interface UiTarget {
  readonly key: string
  readonly name: string | null
  readonly id: string
  readonly online: boolean
}

/**
 * One agent with a window here (the user, 2026-11-21: by capability, not identity): an enabled,
 * paired and online principal whose token entry an offered `WindowSource` names, in
 * `principals()` order. dsh-connector-ui draws one sidebar entry per row.
 */
export interface UiWindow {
  readonly key: string
  readonly name: string | null
  readonly id: string
}

/**
 * What a row that can open agents' windows in this DSH offers (`offerWindows`): the connector
 * token entry keys whose agent it can open now, and a change signal. `entries` is read at every
 * snapshot; `onChange` returns its disposer.
 */
export interface WindowSource {
  entries(): Iterable<string>
  onChange(listener: () => void): Dispose
}

/** The attention latch (§13.6, D3): count 0 or 1, with importance; no timer. */
export interface UiAttention {
  readonly count: 0 | 1
  readonly important: boolean
}

/** The notify prompt (R-FN-01): the newest message, its importance, and how many arrived since the last click or open. */
export interface UiNotice {
  readonly message: string
  readonly important: boolean
  readonly count: number
}

/** The state snapshot every route and every stream frame carries. `light` is on for a set latch or a pending notice. */
export interface UiSnapshot {
  readonly marks: readonly UiMark[]
  readonly targets: readonly UiTarget[]
  readonly windows: readonly UiWindow[]
  readonly attention: UiAttention
  readonly notice: UiNotice | null
  readonly light: { readonly on: boolean; readonly important: boolean }
}

/**
 * The owner-only DSH Fetch routes the connector's marks part and embed-UI's browser half call (DSH's `connection.fetch`:
 * owner-only, Host/Origin fenced). Each answers JSON, no-store:
 * - `state` (GET) → `{ok: true, state}`;
 * - `events` (GET) → server-sent events, one `UiSnapshot` at once and one per change. A reader that
 *   does not keep up gets the latest snapshot, not every one in between (R-FIX-CUI, review UI-02);
 * - `handover` (POST `{sessionId, principalKey, note?}`) → `{ok: true, principal, state}` or a K3
 *   refusal `{ok: false, code, state}` (409);
 * - `takeback` (POST `{sessionId, note?}`) → `{ok: true, state}` or a K3 refusal (409);
 * - `notice/dismiss` (POST, no body): the user clicked the prompt → `{ok: true, state}`;
 * - `opened` (POST, no body): the window opened; clears the latch once and the prompt → `{ok: true, state}`.
 * A body outside the closed shape answers 400 `invalid-request`; a service failure 500 `operation-failed`.
 */
export interface UiRoutes {
  readonly state: '/api/dsh-connector/ui/state'
  readonly events: '/api/dsh-connector/ui/events'
  readonly handOver: '/api/dsh-connector/ui/handover'
  readonly takeBack: '/api/dsh-connector/ui/takeback'
  readonly dismiss: '/api/dsh-connector/ui/notice/dismiss'
  readonly opened: '/api/dsh-connector/ui/opened'
}

export interface DshConnectorUi {
  readonly apiVersion: 1
  readonly routes: UiRoutes
  /**
   * Registers the notify and attention tools through the caller's own bound
   * `dshConnectorTools.register` (so they carry the caller's namespace and leave with it, Q-N3 = A)
   * and returns their disposer. The disposer is idempotent and resets the latch and the notice. A
   * register that throws part-way disposes what it registered and rethrows.
   */
  contribute(register: (definition: object) => Dispose): Dispose
  /**
   * Offers a window source; its entries are united with every other offered source's. Returns an
   * idempotent disposer. Offering, a source's change and its disposal each publish a snapshot.
   * Throws TypeError for a value that is not a `WindowSource`, and Error after the backend closed.
   */
  offerWindows(source: WindowSource): Dispose
}
