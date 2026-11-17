/**
 * fishball-core's frozen contracts for plugins of the same Fishball DSH (task K3; design §5a, §6.4;
 * R-INT-01, R-FB-09, R-FB-11). Types only here; the runtime values are the data-only
 * `constants.js` beside this file (K3 amendment 2026-11-14); the prose freeze is `README.md`.
 *
 * - `fishballInstance.events`: the interception service (`events.d.ts`). `fishballInstance` keeps
 *   its X1–X19 members and `apiVersion: 1` (design §1.2); K3 freezes only its `events` member.
 * - `fishballSettingsSections` is withdrawn (F-SETTINGS; requirements 1.34 item 4, R-HOST-11): core's
 *   settings are its own plugin settings page, with no settings-section extension point.
 * - the ask card's fields (`ask-card.d.ts`) and the guard vocabulary (`guards.d.ts`).
 * - gate K3a (requirements 1.39–1.41): the link's status and the hosted import's published names
 *   (`link.d.ts`), Connect (`connect.d.ts`), the fishball-ui seam `fishballInstance.ui` (`ui.d.ts`),
 *   and core's own copy of the connector's MCP surface (`constants.js` `MCP`; values only).
 */
export type {
  FishballInstanceEvents, InterceptRegistration, InterceptHandler, InterceptControl, InterceptedEvent,
  CommitSendResult, CommitResult,
} from './events.js'
export type { AskCard, AskCardAnswer } from './ask-card.js'
export type {
  GuardedRow, ShippedPresetRow, FishballAgentPreset, IntendedPolicy, ManagerTool, OverriddenGuard,
  GuardCheckTrigger, GuardReport, ReorderOutcome,
} from './guards.js'
export type { LinkState, LinkCode, LinkStatus, HostedImportNames } from './link.js'
export type {
  ConnectState, ConnectConfigurationCode, ConnectStatus, ConnectBegin, OAuthClientOptions, OAuthClient, CreateOAuthClient,
  FishballConnect,
} from './connect.js'
export type { FishballUi, UiPairingView, UiResult, Dispose } from './ui.js'

import type { FishballInstanceEvents } from './events.js'
import type { FishballUi } from './ui.js'

/**
 * The `fishballInstance` service as far as K3 and K3a freeze it: `apiVersion`, the `events`
 * member and the `ui` member (K3a: what fishball-ui draws, `ui.d.ts`). Its other members are the
 * X1–X19 contract and are not restated here; K3b withdraws the Watchdog-only ones.
 */
export interface FishballInstance {
  readonly apiVersion: 1
  readonly events: FishballInstanceEvents
  readonly ui: FishballUi
}

/**
 * The services as DSH declares its own: members of the cordis `Context`, injected by name.
 * `fishballInstance` is provided by core's app row (Node). A missing core must never fail
 * a plugin's load (R-FB-06), so a plugin looks it up at runtime (`ctx.get(name)` or a
 * `ctx.inject([name], …)` sub-scope) and does not list them in its own `inject`: Cordis treats a
 * trailing `?` literally on both SDKs. Resolving this augmentation needs
 * `@deepseek-ai/cordis` (a DSH peer) in the reader's types.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    fishballInstance: FishballInstance
  }
}
