/**
 * fishball-core's frozen contracts for plugins of the same Fishball DSH (task K3; design §5a, §6.4;
 * R-INT-01, R-HOST-11, R-FB-09, R-FB-11). Types only; the prose freeze is `README.md`.
 *
 * - `fishballInstance.events`: the interception service (`events.d.ts`). `fishballInstance` keeps
 *   its X1–X19 members and `apiVersion: 1` (design §1.2); K3 freezes only its `events` member.
 * - `fishballSettingsSections`: the settings-section extension point (`settings-sections.d.ts`).
 * - the ask card's fields (`ask-card.d.ts`) and the guard vocabulary (`guards.d.ts`).
 */
export type {
  FishballInstanceEvents, InterceptRegistration, InterceptHandler, InterceptControl, InterceptedEvent,
  CommitSendResult, CommitResult,
} from './events.js'
export type { FishballSettingsSections, SettingsSection, SectionTitle, SettingsSectionClasses, SettingsSectionsServiceName } from './settings-sections.js'
export type { AskCard, AskCardAnswer } from './ask-card.js'
export type {
  GuardedRow, ShippedPresetRow, FishballAgentPreset, IntendedPolicy, ManagerTool, OverriddenGuard,
  GuardCheckTrigger, GuardReport, ReorderOutcome,
} from './guards.js'

import type { FishballInstanceEvents } from './events.js'
import type { FishballSettingsSections } from './settings-sections.js'

/**
 * The `fishballInstance` service as far as K3 freezes it: `apiVersion` and the `events` member.
 * Its other members (manager, bridge, inbox, attention, sideAgents, approvals, supervision,
 * sessionStarts) are the X1–X19 contract and are not restated here.
 */
export interface FishballInstance {
  readonly apiVersion: 1
  readonly events: FishballInstanceEvents
}

/**
 * The services as DSH declares its own: members of the cordis `Context`, injected by name.
 * `fishballInstance` is provided by core's app row (Node); `fishballSettingsSections` by core's
 * settings panel (browser, through the client context's `reflect`). Inject both optionally
 * (`'fishballInstance?'`), so a missing core never fails a plugin's load (R-FB-06).
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    fishballInstance: FishballInstance
    fishballSettingsSections: FishballSettingsSections
  }
}
