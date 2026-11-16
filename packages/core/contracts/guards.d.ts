/**
 * Core's guards and their override report (task K3 freezes the vocabulary; design §5a.2;
 * R-FB-02, R-FB-09, R-FB-12, R-FB-13; spike V3-S6 `86800d2` + round 2 `7c2230e`).
 * Types; the runtime spellings are `constants.js`'s `GUARDS` beside this file (a change to one
 * changes both). F-GUARDS builds the patch rows, the self-reorder and the check, in
 * `packages/core/cordis.patch.yml` and `packages/core/src/guards/`; since F-UI the UI-only guard rows
 * (`ui-*`, `entry-customization`) are in `packages/fishball-ui/cordis.patch.yml`, reported by core's
 * check through `fishball-shared/ui-seam` `UI_GUARDS`.
 *
 * The row lists, presets, policy and manager tools are as decided (design §5a.2, 1.24, S6 round 2).
 * They are the same on DSH 0.2.1-rc.5 and 0.2.2-rc.1: both ship the four agent presets with these
 * ids (`dsh-web-app/presets/`). The report's spelling (`OverriddenGuard`, `GuardReport`) and
 * `ReorderOutcome` are PROPOSED; S6's probe spelled rows by id and policy as `policy.<key>`.
 */

/**
 * Root rows the Fishball guards disable (session-creating rows, and no nested hosted Fishball), all
 * reported by core's check. Since F-UI the `ui-*` rows and `entry-customization` are fishball-ui's
 * patch rows, the others core's; the report's `row:<id>` vocabulary is unchanged.
 */
export type GuardedRow =
  | 'ui-subagent' | 'ui-schedule' | 'schedule' | 'ui-permission' | 'ui-agent-preset' | 'entry-customization'
  | 'ui-open-in-app' | 'open-in-app' | 'ui-sidebar-terminal' | 'terminal-controller' | 'dsh-instance'

/** DSH-shipped agent preset rows: switched off by core's patch, never deleted (1.24, Q-S6-2 B). */
export type ShippedPresetRow = 'preset-standard' | 'preset-ptc' | 'preset-cordis' | 'preset-minimal'

/** The one agent preset a guarded DSH offers: core's, the default (design `9a531192` §1.0, §7; requirements 1.37). */
export type FishballAgentPreset = 'fishball'

/** The policy core's patch sets, read back through public services only (S6 §3.5). */
export interface IntendedPolicy {
  /** `ctx.sandboxPolicy.defaultMode`. */
  readonly sandbox: 'read-only'
  /** `ctx.approval.config.policy`, read directly (1.24 item 4). */
  readonly approval: 'ask'
  /** `ctx.permissionPresets.names` and `.defaultPreset`. */
  readonly permissionPresets: readonly ['read-only']
  readonly defaultPermissionPreset: 'read-only'
  /** `ctx.agentPresets.defaultId`. */
  readonly defaultAgentPreset: 'fishball'
}

/** The manager session's model tools, exactly; checked on resume instead of its preset name (R-FB-13). */
export type ManagerTool = 'read' | 'read_image' | 'working_directory'

/**
 * One overridden guard, as the report names it.
 * - `row:<id>`: a guarded row or a shipped preset row is enabled. An absent row counts as held,
 *   because it cannot run (S6's probe);
 * - `policy:<key>`: one `IntendedPolicy` value differs;
 * - `agent-presets`: `agentPresets.list()` offers a preset other than `fishball`;
 * - `bundle-order`: core is not last in `dsh.profile.bundles`, so its patch may miss rows (R-FB-12);
 * - `manager-tools`: the resumed manager session's tools are not exactly `ManagerTool`.
 */
export type OverriddenGuard =
  | `row:${GuardedRow | ShippedPresetRow}`
  | `policy:${keyof IntendedPolicy}`
  | 'agent-presets'
  | 'bundle-order'
  | 'manager-tools'

/** When core checks: at app ready, then on each of these events; never before app ready (S6 §3.5). */
export type GuardCheckTrigger = 'app-ready' | 'settings/document-updated' | 'plugin-manager/changed'

/**
 * Core's guard status. `overridden` is empty exactly when `status` is `ok`. A later check that
 * finds every guard held clears it. Core keeps running and changes nothing back (R-FB-09).
 */
export type GuardReport =
  | { readonly status: 'ok'; readonly overridden: readonly [] }
  | { readonly status: 'guards-overridden'; readonly overridden: readonly OverriddenGuard[] }

/**
 * The outcome of core's one standalone reorder at its first start in a DSH (R-FB-12): `moved`
 * (core was moved to the end of `dsh.profile.bundles`), `unchanged` (it already was last, or this
 * DSH had recorded the reorder before; core never moves itself back after the owner moves it), or
 * `failed`.
 */
export type ReorderOutcome = 'moved' | 'unchanged' | 'failed'
// 'failed': the lock or the manifest write failed; nothing was written, and the report keeps
// `bundle-order` until a later start succeeds. PROPOSED, like the rest of this type.
