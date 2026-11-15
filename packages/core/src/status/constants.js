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
export const STATUS_MODEL = Object.freeze({
  /** Whether Fishball is on in this DSH; `off` is what a reader sees without core (R-FB-10). */
  fishball: Object.freeze({ on: 'on', off: 'fishball-off' }),
  /** Set completeness (design §8.2 `plugin-set-incomplete`). */
  set: Object.freeze({ ok: 'ok', incomplete: 'plugin-set-incomplete' }),
  /** Why a member is missing: its layer was skipped at load, or one of its rows failed to start. */
  reason: Object.freeze({ skipped: 'skipped', failed: 'failed' }),
  /** The set members core checks (requirements 1.34, 1.37, 1.41: the Fishball set is core + board). */
  members: Object.freeze(['fishball-board']),
  /** The strip's one control (design §6.3a steps 1–2). */
  control: Object.freeze({ connect: 'connect', cancel: 'cancel' }),
  /** The Cordis service F-WIRE provides with `createStatus`'s object. */
  serviceName: 'fishballStatus',
  /** The DSH services and events the status reads (none injected: a missing one is "nothing to read"). */
  services: Object.freeze({ appReady: 'appReady', pluginManager: 'pluginManager', loader: 'loader' }),
  events: Object.freeze({ pluginsChanged: 'plugin-manager/changed', settingsUpdated: 'settings/document-updated' }),
  /** cordis `FiberState.FAILED` (both SDKs: cordis/lib/types/fiber.d.ts, a const enum, so not importable). */
  fiberFailed: 3,
  /** The manager notice of an overridden guard (design §5a.2): once per DSH start. */
  notice: Object.freeze({ pluginId: 'fishball-core', guardsKeyPrefix: 'fishball-status:guards:' }),
  logger: 'fishball-status',
  text: Object.freeze({
    listSeparator: ', ',
    guardsNotice: (list) => `Fishball notice: some of Fishball's guards are overridden in this DSH (${list}). Its guarantees are weaker until the owner restores them.`,
    noticeFailed: 'the guards-overridden notice could not be given to the manager (%s)',
    setFailed: 'the plugin set check failed (%s)',
  }),
})
