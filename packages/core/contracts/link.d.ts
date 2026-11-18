/**
 * Core's link to its target connector, as other parts of the Fishball side and the DSH side see it
 * (gate K3a; requirements 1.39–1.41; design §1.0b rows 1 and 4, §5.4, §6.3, §6.3a). Types only;
 * the runtime values are `constants.js`'s `LINK`, `HOSTED_IMPORT`, `CONNECT` and `MCP`.
 *
 * The two sides share no code (requirements 1.39): the hosted import is DSH state written under
 * published names, and the link reads the connector only over MCP, with core's own copy of the
 * surface constants (`MCP`), checked against the connector by a contract test (decided D1).
 */

/** `LINK.state` (REM-DT-01). */
export type LinkState = 'connected' | 'target-unreachable' | 'token-refused' | 'target-unset'

/** `LINK.code`; `null` when there is nothing to report. */
export type LinkCode =
  | 'TARGET_UNREACHABLE' | 'TOKEN_REFUSED' | 'TARGET_INCOMPATIBLE' | 'token-revoked' | 'target-insecure' | 'target-invalid'

/** The link's status: the same words as the instance locator's `TargetStatus` (design §4.1), each side its own copy. */
export interface LinkStatus {
  readonly state: LinkState
  readonly code: LinkCode | null
}

/**
 * The hosted import (design §5.4; requirements 1.41 Q-G6 = A). Written by the instance's child-side
 * row (DSH side) in the child; read by core. Nobody calls the other side.
 *
 * Instance (writer), at the child's first start only (no credential present, see below):
 * 1. writes the target URL to the child setting `<targetSetting.row>.<targetSetting.field>`;
 * 2. writes the token value with `ctx.credentials.set(credentialRef, value)`; it stores it nowhere
 *    else, in the host or the child.
 *
 * Core (reader), per connection attempt:
 * 1. a saved copy for the target origin wins (`savedRecord`, R9); otherwise
 * 2. `ctx.credentials.resolve(credentialRef)` is the client secret, sent with `client_credentials`
 *    and `identity.id` as the client id;
 * 3. once the target accepted it in a token request, core writes `savedRecord` (the value, keyed by
 *    target origin, inside its payload) and then `ctx.credentials.unset(credentialRef)`;
 * 4. a refused value is not saved and stays where it is (R9); the instance's Reconnect overwrites it.
 *
 * "The child holds a credential" (the instance's one question, answered by DSH alone):
 * `(await credentials.describe(credentialRef)).configured || (await credentials.describeRecord(savedRecord.key)).configured`.
 * Core changes nothing about `credentialRef` except reading it and unsetting it after step 3, and
 * never writes a reference the user owns (R-FB-03).
 */
/*
 * MULTI-0 (2026-11-18; PLAN-MULTI §3.3, D09): the hosted reservation.
 * - Hosted signal (URL-independent, review S1): the child is hosted exactly when DSH's settings
 *   service lists the namespace `targetSetting.row` (`dsh-instance-child`, the instance's
 *   child-side row, which only a hosted child's profile holds), whatever its `targetUrl` value.
 *   Standalone has no reserved target.
 * - A hosted child's list always begins with one reserved target: id `TARGETS.parentId`
 *   (`parent`), kind `parent`, URL = the canonical `targetSetting` value, read-only and
 *   not removable (`target-reserved`). A blank or absent value keeps the parent `not-set`; it is never
 *   replaced by a user URL, and Q01's placeholder shows.
 * - The parent's `endpointEpoch` is generated like any other and replaced whenever the canonical
 *   `targetUrl` changes (same rule as `setUrl`, without confirmation: the instance owns the value).
 *   Its `TargetRecord.url` is the last canonical value core observed (`''` when none).
 * - The parent may also use Connect (the instance's Retry notice lists it); its grant record is
 *   the per-target one, `fishball-core/connect-parent-<epoch>` (`TARGETS.credentials`). The
 *   origin-keyed `connect-<hex origin>` record is withdrawn (fresh install).
 * - Core's user setting `target.url` and `settings/target.js`'s user fallback are withdrawn:
 *   targets live in `TARGETS.store`, edited through `ui.targets`. The names
 * below (`credentialRef`, `savedRecord`, and core's own pending-origin record) belong to the
 * parent alone: an added target never reads, writes or unsets them (`TARGETS.credentials`), so the
 * instance's "the child holds a credential" probe answers for the parent only. The instance's wire
 * and these names are unchanged; the instance's own remote-target override is withdrawn.
 *
 * Independent-review security amendment (additive; supersedes the origin-only reader above):
 * - Both fixed core-private saved/pending records carry `TargetCredentialBinding` under
 *   `TARGETS.credentials.bindingField`: `{targetId, endpointEpoch, origin, agentId}`. Before any
 *   use, all four must match the current parent; the pending record additionally binds the
 *   reference value's non-secret credential id. An origin match alone is never sufficient.
 * - On startup recover the durable parent epoch and reconcile the instance setting BEFORE reading
 *   the fixed reference or saved token. On every canonical endpoint change, same-origin included,
 *   durably retire the old binding and delete its token material and pending reference before the
 *   new epoch can connect. Cold restart must not adopt or relabel a retired/unmatched binding.
 *   A fresh first handoff may establish its pending binding only after that reconciliation;
 *   absence of a binding never permits reuse of saved/retired material as a fresh handoff.
 * - Each read/authorization attempt captures its binding and runtime generation. A late completion
 *   after retirement cannot save, unset or rebind the fixed reference/records, including when the
 *   new endpoint has the same origin. Saving/unsetting also checks the reference value still
 *   belongs to that attempt; a newer parent handoff remains untouched.
 * - Q-LS1 still applies within that binding: a new unrefused reference value is tried before the
 *   saved copy, and replaces it only once accepted. Refusal does not save the new value.
 * These are core-private binding/retirement obligations, not changes to the instance's published
 * names, credential probe, or handoff wire. Fresh install only; no legacy payload fallback.
 */
export interface HostedImportNames {
  /** DSH's reference grammar `^[A-Za-z_][A-Za-z0-9_]*$` (both SDKs). */
  readonly credentialRef: 'DSH_AGENT_TOKEN'
  readonly targetSetting: { readonly row: 'dsh-instance-child'; readonly field: 'targetUrl' }
  /** A DSH credential record key `<scope>/<id>`, `kind: grant`; its payload is core's own format. */
  readonly savedRecord: { readonly key: 'fishball-core/hosted-agent'; readonly kind: 'grant' }
}
