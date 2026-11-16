/**
 * Values of core's status (task F-STATUS; design §5a.2, §6.3a step 1, §8.2; requirements R-FB-03,
 * R-FB-04, R-FB-09, R-FB-10, R-BND-05 (TQ-17), R-EXT-14, 1.41 Q-G1) that are this module's own.
 *
 * The link's words are `contracts/constants.js` `LINK` (core's own copy since K3a), Connect's
 * `CONNECT`, the guard report's `GUARDS`. Not here on purpose:
 * - no Watchdog member or "watchdog is down" check (R-FB-07 withdrawn, requirements 1.37);
 * - no `fishball-ui` member: core runs normally without it and reports nothing (Q-G1);
 * - no `fishball-hosted-settings` member: removed (1.34) and never reported (HOST-DT-03 rule 10).
 */
import { SEAM_STATUS } from 'fishball-shared/ui-seam'
import { GUARDS } from '../../contracts/constants.js'

export const STATUS_MODEL = Object.freeze({
  // The snapshot words fishball-ui's strip draws: defined once in the seam (fishball-shared), since
  // fishball-ui cannot import core (Q-G2).
  fishball: SEAM_STATUS.fishball,
  set: SEAM_STATUS.set,
  reason: SEAM_STATUS.reason,
  /** The set members core checks (requirements 1.34, 1.37, 1.41: the Fishball set is core + board). */
  members: Object.freeze(['fishball-board']),
  control: SEAM_STATUS.control,
  /** The Cordis service F-WIRE provides with `createStatus`'s object. */
  serviceName: 'fishballStatus',
  /** The DSH services and events the status reads (none injected: a missing one is "nothing to read"). */
  services: Object.freeze({ appReady: GUARDS.services.appReady, pluginManager: 'pluginManager', loader: GUARDS.services.loader }),
  // The same two DSH events as GUARDS.triggers, named one by one because status reacts to each
  // differently (a set check after one, a re-read of the target after the other).
  events: Object.freeze({ pluginsChanged: 'plugin-manager/changed', settingsUpdated: 'settings/document-updated' }),
  /** cordis `FiberState.FAILED` (both SDKs: cordis/lib/types/fiber.d.ts, a const enum, so not importable). */
  fiberFailed: 3,
  /** The manager notice of an overridden guard (design §5a.2): once per DSH start. */
  notice: Object.freeze({ pluginId: 'fishball-core', guardsKeyPrefix: 'fishball-status:guards:' }),
  /** The `Symbol.for` name that holds this process's (this DSH start's) notice key on `globalThis`. */
  startSymbol: 'fishball-core.status.start',
  logger: 'fishball-status',
  text: Object.freeze({
    guardsNotice: (list) => `Fishball notice: some of Fishball's guards are overridden in this DSH (${list}). Its guarantees are weaker until the owner restores them.`,
    noticeFailed: 'the guards-overridden notice could not be given to the manager (%s)',
    setFailed: 'the plugin set check failed (%s)',
  }),
})
