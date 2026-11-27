/**
 * Multiple DSH targets (MULTI-0 freeze, 2026-11-18; PLAN-MULTI `docs/planning/v3-multi-dsh.md`
 * §3–§7, D01–D11, Q01–Q12). Types only; the runtime values are `constants.js`'s `TARGETS` (core
 * internals: ids, keys, credentials, tool names, storage) and `fishball-shared/ui-seam`'s
 * `SEAM_TARGETS` (what fishball-ui reads: states, kinds, routes, refusals), each defined once.
 *
 * One Fishball manager holds a list of ordinary MCP client connections, one per target DSH (D01):
 * no MCP tool gains a `dsh` argument, and no wire value changes except K1's additive identity
 * resource. Every remote-derived local key carries `(targetId, endpointEpoch)`.
 */
import type { LinkStatus } from './link.js'
import type { UiPairingView } from './ui.js'
import type { ConnectBegin, ConnectStatus } from './connect.js'

/**
 * A stable opaque local target id (`TARGETS.id`): `parent` for a hosted child's reserved parent,
 * else `t-` and 16 lowercase base32 letters, generated once by core when the target is added. Never
 * a name, index, URL or remote id; remove + re-add is a new id. It fits DSH's credential-key
 * segment grammar `[a-z][a-z0-9-]*` and contains no `_`, so `TARGETS.key` stays unambiguous.
 */
export type TargetId = string

/**
 * An opaque endpoint epoch (`TARGETS.epoch`): `e-` and 16 lowercase base32 letters, replaced on
 * every change of the target's canonical MCP endpoint (same origin included), never on a purely
 * syntactic edit that canonicalises to the same endpoint. Records of a retired epoch never take
 * part in reconciliation or answering again, also after a restart.
 */
export type EndpointEpoch = string

/** `SEAM_TARGETS.kind`: the hosted child's reserved parent, or a target the user added. */
export type TargetKind = 'parent' | 'remote'

/** `SEAM_TARGETS.state`, the four public states (PLAN-MULTI D03); details keep the codes. */
export type TargetState = 'connected' | 'connecting' | 'failed' | 'not-set'

/**
 * `SEAM_TARGETS.identity`, the live-identity capability (PLAN-MULTI §4.3):
 * - `pending`: no discovery answered yet on this endpoint epoch;
 * - `live`: `resources/list` lists `MCP.identity.uri` and the listen stream honoured it;
 * - `unsupported`: either is missing; the name is still read at each (re)connect, never polled;
 * - `stale`: the last rediscovery failed transiently; the last valid name is kept.
 */
export type TargetIdentityState = 'pending' | 'live' | 'unsupported' | 'stale'

/**
 * Trusted local provenance (PLAN-MULTI §5). Only `targetId` and `endpointEpoch` route anything;
 * `serverName` and `name` are untrusted text (D06): plain text in the UI, framed as untrusted data
 * in model context, never HTML or instructions.
 * - `serverName`: the raw MCP `Implementation.name` last discovered on this epoch (K1
 *   `SERVER_IDENTITY`), unmodified; `null` before any discovery (Q01: no URL-derived name);
 * - `name`: `serverName`, plus ` (n)` when `duplicateSuffix` is `n` (`TARGETS.duplicate`);
 *   `null` exactly when `serverName` is.
 */
export interface TargetSource {
  readonly targetId: TargetId
  readonly endpointEpoch: EndpointEpoch
  readonly serverName: string | null
  readonly name: string | null
}

/**
 * The mandatory non-secret binding of a credential to its target and endpoint (PLAN-MULTI §3.1,
 * §3.3, §5). Core-private credential payloads carry this under `TARGETS.credentials.bindingField`.
 * All four members must match before a credential is used or a captured completion changes it.
 * The fixed hosted record/reference names are NOT an exception to endpoint-epoch isolation:
 * the saved parent token and the pending-reference binding both carry this metadata. The pending
 * record also identifies the reference value by its non-secret credential id, never by a token.
 * This adds no field to the instance's handoff wire or the public target/status snapshots.
 */
export interface TargetCredentialBinding {
  readonly targetId: TargetId
  readonly endpointEpoch: EndpointEpoch
  readonly origin: string
  readonly agentId: string
}

/**
 * Core's durable record of one target (storage `TARGETS.store`, keyed by `id`). Core alone writes
 * it, through the actions below; it holds no token value. The reserved parent's record is kept
 * too (its allocation must persist), but its `url` is always read from the instance's child
 * setting (`HOSTED_IMPORT.targetSetting`), never from this record or the user.
 * - `order`: display order, ascending, assigned on add; never renumbered;
 * - `duplicateSuffix`: the persisted allocation (PLAN-MULTI §4.2, Q03): `null`, or an integer ≥
 *   `TARGETS.duplicate.firstSuffix`. A refresh/reconnect with an unchanged `serverName` keeps it;
 *   only a changed `serverName` reallocates, and no other target is ever renumbered.
 */
export interface TargetRecord {
  readonly id: TargetId
  readonly kind: TargetKind
  readonly url: string
  readonly endpointEpoch: EndpointEpoch
  readonly order: number
  readonly serverName: string | null
  readonly duplicateSuffix: number | null
}

/**
 * One target as fishball-ui and core's settings page see it (`SEAM_TARGETS.snapshotVersion`).
 * `url` is shown in details only (Q01). Nothing here carries a credential, token, code or grant.
 * - `state`: derived from `link`, `connect` and `connecting` by the rule of `SEAM_TARGETS.state`'s comment;
 * - `connecting`: a link attempt (connect, list, pair, listen) is in flight;
 * - `connect`: this target's Connect status; the parent's reports `authorized` once the hosted
 *   credential is saved (connect.d.ts). `null` only where core has no Connect control (none today);
 * - `line` (MULTI-0 amendment, MULTI-3's finding): this target's status line, exactly core's
 *   existing `stripLine(link, url, connect).line` for it (`kind` a `LINK.state` / `CONNECT.state`
 *   word, `code` its code or `null`), so fishball-ui draws it without re-deriving core's rule;
 * - `control`: the one control (`SEAM_STATUS.control`), as the old strip's `control`;
 * - `contributedTools`: the contributed tools on offer from this target, zero included; `null`
 *   before the first list;
 * - `removable` / `urlEditable`: `false` for the parent (PLAN-MULTI §3.3), `true` otherwise;
 * - `runningSessions` (additive, the sidebar's nested list): the sessions this Fishball manages on
 *   this target (K1 `sessions_list`: its managed root sessions, started or handed over) that are
 *   running, in the connector's order. Read on each `connected` and after a polled `state`,
 *   `turn-finished`, `handover`, `takeback` or `retirement` event, never polled on a timer.
 *   `null` (unknown) while not connected and before the first answer on the current connection; a
 *   failed read keeps the last list. `title` is untrusted remote text (as `name`, D06), `''` when
 *   the connector sent none.
 */
export interface TargetView extends TargetSource {
  readonly kind: TargetKind
  readonly url: string
  readonly order: number
  readonly duplicateSuffix: number | null
  readonly state: TargetState
  readonly connecting: boolean
  readonly link: LinkStatus
  readonly connect: ConnectStatus | null
  readonly line: { readonly kind: string; readonly code: string | null }
  readonly control: 'connect' | 'cancel' | null
  readonly pairing: UiPairingView
  readonly identity: TargetIdentityState
  readonly contributedTools: number | null
  readonly removable: boolean
  readonly urlEditable: boolean
  readonly runningSessions: readonly RunningSession[] | null
}

/** One running managed session of a target (`TargetView.runningSessions`); `sessionId` is the remote id. */
export interface RunningSession {
  readonly sessionId: string
  readonly title: string
}

/** The whole list, in ascending `order` (Q12: no count cap). An empty list is valid (standalone first run). */
export interface TargetsSnapshot {
  readonly version: 1
  readonly targets: readonly TargetView[]
}

/** The set check (`SEAM_STATUS.set`, `reason`). */
export interface SetStatus {
  readonly status: 'ok' | 'plugin-set-incomplete'
  readonly missing: readonly { readonly name: string; readonly reason: 'skipped' | 'failed'; readonly code: string | null }[]
}

/**
 * Core's status service snapshot (`UI_STATUS.service` `snapshot()`), as fishball-ui's strip route
 * serves it (review S4). The global parts stay once per process; everything per target is in
 * `targets`. K3a's scalar `link`, `connect`, `line`, `control` and `contributedTools` members are
 * withdrawn. LOGO-BUTTON adds `brand`, always one of the two seam themes (`SEAM_BRAND`), normalized
 * from the stored `brandStyle`. Without core, a reader sees exactly `{fishball: 'fishball-off'}`,
 * with no `targets` and no `brand`.
 */
export type StatusSnapshot =
  | {
    readonly fishball: 'on'
    readonly targets: TargetsSnapshot
    readonly set: SetStatus | null
    readonly brand: BrandStatus
  }
  | { readonly fishball: 'fishball-off' }

/** The sidebar logo's theme (LOGO-BUTTON); the two words are `SEAM_BRAND.style`. */
export interface BrandStatus {
  readonly style: 'fishball' | 'deepseek'
}

/** `SEAM_TARGETS.refusal`, or a K3a code the delegated part answers (Connect, pairing). */
export type TargetActionResult = { readonly ok: true; readonly targetId?: TargetId } | { readonly ok: false; readonly code: string }

/**
 * `fishballInstance.ui.targets` (replaces K3a's scalar `ui.link`, `ui.connect` and `ui.pairing`).
 * Every action names a stable `targetId`; an unknown or removed id answers `unknown-target` and
 * changes nothing. Selecting a target in the UI is a view selection only (Q09) and has no action.
 * - `add(url)`: canonicalises with the link's URL rule; refuses `target-insecure` /
 *   `target-invalid` (K3a `LINK.code`) and `target-duplicate` for a canonical MCP URL already in
 *   the list, parent included (Q04); answers the new `targetId`;
 * - `remove(id, {confirmed: true})` and `setUrl(id, url, {confirmed: true})`: without
 *   `confirmed` they answer `confirmation-required` (Q07); the parent answers `target-reserved`.
 *   Both void this target's pending ask cards, keep its history read-only, delete its retired token
 *   material, and send nothing remote (no allow/reject, no revocation);
 * - `begin` / `cancel`: this target's Connect (K3a `ConnectBegin`); one pending attempt per target,
 *   concurrent across targets (Q05). The parent may begin too (link.d.ts), answering `authorized`
 *   when its hosted credential is saved;
 * - `retry`: a new link attempt now (backoff reset), nothing else;
 * - `choose`: this target's pairing choice (K3a `ui.pairing.choose`).
 */
export interface FishballTargets {
  list(): TargetsSnapshot
  onChange(fn: (snapshot: TargetsSnapshot) => void): () => void
  add(url: string): Promise<TargetActionResult>
  remove(targetId: TargetId, options?: { readonly confirmed?: boolean }): Promise<TargetActionResult>
  setUrl(targetId: TargetId, url: string, options?: { readonly confirmed?: boolean }): Promise<TargetActionResult>
  begin(targetId: TargetId): Promise<ConnectBegin | { readonly ok: false; readonly code: string }>
  cancel(targetId: TargetId): Promise<TargetActionResult>
  retry(targetId: TargetId): Promise<TargetActionResult>
  choose(targetId: TargetId, choice: string, options?: { readonly confirmed?: boolean }): Promise<TargetActionResult>
}

/**
 * A local target selector. Source-derived event/history callers MUST pass that source's
 * `endpointEpoch`, even when constructing a new handle after asynchronous work: `targetId` alone
 * would capture a replacement endpoint and silently retarget old remote ids. Target-id-only
 * selectors remain valid for callers deliberately addressing the current endpoint, not old data.
 */
export interface TargetSelector {
  readonly targetId: TargetId
  readonly endpointEpoch?: EndpointEpoch
}

/**
 * The target-bound feature seams (PLAN-MULTI §4.4, §5): X12 `bridge` and X8 `attention` gain an
 * explicit target, captured with its epoch when the handle is made. A call on a handle whose target
 * was removed or whose epoch retired answers `unknown-target` and sends nothing; it never follows a
 * new URL or name. An expected `target.endpointEpoch` mismatch also fails closed at handle
 * creation/attention dispatch, with `supports` false and calls answering `unknown-target`; it must
 * not silently capture the current epoch instead. Source-derived selectors include that expected
 * epoch (above), closing the late-handle-creation race. Remote tool names and arguments are unchanged.
 */
export interface FishballTargetBound {
  bridge(pluginId: string, operations: readonly string[], target: TargetSelector): {
    supports(name: string): boolean
    call(name: string, args?: object): Promise<unknown>
  }
  readonly attention: {
    signal(pluginId: string, input: { readonly important: boolean }, target: TargetSelector): Promise<unknown>
  }
}
