/**
 * `fishballConnectorHandover`: the connector's hand-over service, with no UI and no token (task K3;
 * design §3.6; R-CON-11, R-ROUTE-05, R-UI-05, R-UI-10; Q-HO-1 decided C). Embed-UI's marks, Hand
 * over control and Take back button drive it in-process. Types only.
 */
import type { Dispose, Refusal } from './index.js'

/**
 * A principal as the hand-over service names it.
 * - `key` is an opaque connector-side key, stable for the life of the token entry. It is never a
 *   token value, a credential reference or an entry label.
 * - `name` is the principal's chosen name, unique per connector (R-NAME), or `null` for a nameless
 *   principal (requirements 1.20). A nameless one is shown as `ID: <id>`, prefix bold (R-NAME-08).
 * - `id` is the non-secret fishball id the pair is bound to.
 */
export interface PrincipalRef {
  readonly key: string
  readonly name: string | null
  readonly id: string
}

/** One managed session and the principal managing it (R-ROUTE-01, R-WATCH-01). */
export interface ManagedSession {
  readonly sessionId: string
  readonly principal: PrincipalRef
}

/**
 * One token entry as the Hand over control needs it.
 * - `id` is `null` while the entry is not paired; `paired` says the same.
 * - `online` is true exactly while the principal holds an open `fishball-events` listen stream
 *   (the "connected" definition K1 freezes, design §3.5). Authenticated requests without a listen
 *   stream do not make it online (HAND-ST-02 #4). After a connector restart every principal is
 *   offline until it listens again.
 * - `enabled` is the entry's switch in the connector's native settings.
 * - `designated` marks the designated-Fishball entry (R-ROUTE-04). It plays no part in Hand over.
 *
 * The Hand over control lists only entries with `enabled && paired`, online or not (R-UI-10).
 */
export interface HandoverPrincipal {
  readonly key: string
  readonly name: string | null
  readonly id: string | null
  readonly online: boolean
  readonly enabled: boolean
  readonly paired: boolean
  readonly designated: boolean
}

/**
 * Why `handOver` refuses (data, never thrown; HAND-DT-01).
 * - `unknown-session`: no such session in this DSH.
 * - `conflict`: the session is already managed, by anyone (Q-HO-1 decided C). The manager is
 *   unchanged.
 * - `no-fishball`: the chosen principal cannot take it at call time: its entry is disabled,
 *   deleted, not paired, or its key is unknown. A deleted entry's key is indistinguishable from a
 *   key that never existed, so both answer the same code (HAND-DT-01 rows 2, 6, 7a, 8).
 *
 * When several apply, the first in this order wins: `unknown-session`, `conflict`, `no-fishball`
 * (the order and the merging of rows 2, 6, 7a and 8 into one code are PROPOSED).
 */
export type HandOverRefusalCode = 'unknown-session' | 'conflict' | 'no-fishball'

/**
 * Why `takeBack` refuses (HAND-DT-02).
 * - `unknown-session`: no such session in this DSH.
 * - `not-managed`: the session exists and nobody manages it (decided by the user for K3; V2's
 *   Take back succeeded silently here, and used `not-managed` only for `release`).
 *
 * V2's other Hand over / Take back codes are not carried (PROPOSED): `is-fishball` (in V3 the
 * Fishball manager session never lives in the main DSH, design §1.4) and `feature-off`.
 */
export type TakeBackRefusalCode = 'unknown-session' | 'not-managed'

export type HandOverResult = { readonly ok: true; readonly principal: PrincipalRef } | Refusal<HandOverRefusalCode>
export type TakeBackResult = { readonly ok: true } | Refusal<TakeBackRefusalCode>

export interface FishballConnectorHandover {
  readonly apiVersion: 1

  /** Every managed session of this DSH with its managing principal, in no particular order. */
  managed(): readonly ManagedSession[]

  /**
   * Every token entry of the connector, in one stable order (R-UI-10). PROPOSED: the order of the
   * entries in the connector's native settings list, the order the owner sees and controls there.
   * A rename, a connection change or a pairing never moves an entry.
   */
  principals(): readonly HandoverPrincipal[]

  /**
   * Calls `fn` after any change of the managed set, of a principal's name, connection
   * (`online`), entry state (`enabled`, `paired`, `designated`) or of the entry list. `fn` gets no
   * argument: it reads `managed()` and `principals()` again. A throwing listener does not stop the
   * others (PROPOSED). Returns the disposer of this listener.
   */
  onChange(fn: () => void): Dispose

  /**
   * The user's Hand over to the principal they chose (R-ROUTE-05). On success the chosen
   * principal becomes the managing principal and exactly one `handover` event, carrying `note`
   * (empty when omitted, PROPOSED), is committed to its mailbox; an offline target gets it when it next polls.
   * A refusal changes nothing and commits nothing.
   */
  handOver(sessionId: string, principalKey: string, note?: string): Promise<HandOverResult>

  /**
   * The user's Take back. On success the session becomes unmanaged and exactly one `takeback`
   * event, carrying `note` (empty when omitted, PROPOSED), is committed to the pair that managed it until
   * then (R-EVS-03). Events already queued for that pair stay with it (R-WATCH-04).
   */
  takeBack(sessionId: string, note?: string): Promise<TakeBackResult>
}
