/**
 * Values of core's status (task F-STATUS; design §5a.2, §6.3a step 1, §8.2; requirements R-FB-03,
 * R-FB-04, R-FB-10, R-BND-05 (TQ-17), R-EXT-14, 1.41 Q-G1) that are this module's own.
 *
 * The link's words are `contracts/constants.js` `LINK` (core's own copy since K3a), Connect's
 * `CONNECT`. Not here on purpose:
 * - no Watchdog member or "watchdog is down" check (R-FB-07 withdrawn, requirements 1.37);
 * - no `fishball-ui` member: core runs normally without it and reports nothing (Q-G1);
 * - no `fishball-hosted-settings` member: removed (1.34) and never reported (HOST-DT-03 rule 10).
 */
import { SEAM_BRAND, SEAM_STATUS, UI_STATUS } from 'fishball-shared/ui-seam'

export const STATUS_MODEL = Object.freeze({
  // The snapshot words fishball-ui's strip draws: defined once in the seam (fishball-shared), since
  // fishball-ui cannot import core (Q-G2).
  fishball: SEAM_STATUS.fishball,
  set: SEAM_STATUS.set,
  reason: SEAM_STATUS.reason,
  /**
   * LOGO-BUTTON: the sidebar logo's theme, normalized to one of `SEAM_BRAND.style`'s words. The
   * setting is core's (config `brandStyle`); this module only reports it in the snapshot.
   */
  brand: SEAM_BRAND,
  /**
   * The set members core checks (requirements 1.34, 1.37, 1.41). Empty in 1.0.0-alpha.1: its one
   * member, fishball-board, is shelved from this release (SHELVE-BOARD, the user, 2026-11-18), so the
   * check finds nothing to report and the set is always `ok`. The check itself stays for a later
   * member; add fishball-board back here when it is released again.
   */
  members: Object.freeze([]),
  control: SEAM_STATUS.control,
  /** The Cordis service core's main row provides with `createStatus`'s object (the seam's name, read by fishball-ui's strip). */
  serviceName: UI_STATUS.service,
  /** The DSH services and events the status reads (none injected: a missing one is "nothing to read"). */
  services: Object.freeze({ appReady: 'appReady', pluginManager: 'pluginManager', loader: 'loader' }),
  // The DSH events the status reacts to, named one by one because it reacts to each differently
  // (a set check after one, a re-read of the target after the other). `volatileUpdate` is the
  // loader's live settings commit (cordis-plugin-loader, both SDKs): LOGO-BUTTON's brandStyle is
  // volatile, and the strip must see a saved choice without a restart.
  events: Object.freeze({ pluginsChanged: 'plugin-manager/changed', settingsUpdated: 'settings/document-updated', volatileUpdate: 'loader/volatile-update' }),
  /** cordis `FiberState.FAILED` (both SDKs: cordis/lib/types/fiber.d.ts, a const enum, so not importable). */
  fiberFailed: 3,
  logger: 'fishball-status',
  text: Object.freeze({
    setFailed: 'the plugin set check failed (%s)',
  }),
})
