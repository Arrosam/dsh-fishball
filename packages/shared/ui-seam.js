/**
 * The fishball-core / fishball-ui seam (requirements 1.38 Q-N2, 1.41 Q-G1/Q-G2; R-FB-14; design
 * §1.0: "Core and UI meet only through `fishball-shared`'s contract"). fishball-ui loads without
 * core (Q-G2), so it cannot import core's `contracts/constants.js`; both packages read these values
 * from here instead. Data only: frozen strings.
 *
 * - `UI_SEAM` (moved here unchanged from core's K3a constants, as K3a announced): `member` is the
 *   `fishballInstance` member fishball-ui reads (core's `contracts/ui.d.ts`); `coreMissing` is the
 *   one line fishball-ui logs, and then changes nothing, without core (Q-G2 = A; the board's R-FB-06
 *   word). Core shows no hint of a missing fishball-ui (Q-G1), so there is no value for that.
 * - `UI_STATUS`: the name of core's status service the strip reads (F-WIRE).
 * - `UI_GUARDS`: the service fishball-ui's row provides so core's guard check also reports the UI
 *   guard rows fishball-ui's patch holds (R-FB-09): `{rows}`, that patch's guard-row ids.
 * - `SEAM_STATUS`: the words of core's status snapshot that fishball-ui's strip view draws.
 *   `fishball`, `set`, `reason` and `control` are defined here, once; core's `STATUS_MODEL` takes
 *   them from here. `link`, `connect` and `guards` restate core's K3 `LINK.state`, `CONNECT.state`
 *   and `GUARDS.status`, because that file is data-only and imports nothing (the K3 freeze); the
 *   fishball-ui tests check that both copies are equal.
 */
export const UI_SEAM = Object.freeze({
  member: 'ui',
  coreMissing: 'fishball-core-missing',
})

/**
 * Core's status service (F-STATUS `createStatus`, provided by core's main row, F-WIRE): fishball-ui's
 * strip route draws its snapshot; without it the strip reads `SEAM_STATUS.fishball.off`. Core's
 * `STATUS_MODEL.serviceName` takes it from here, so the two cannot differ. Its own object, because
 * `UI_SEAM` is K3a's frozen set.
 */
export const UI_STATUS = Object.freeze({
  service: 'fishballStatus',
})

export const UI_GUARDS = Object.freeze({
  service: 'fishballUiGuards',
})

export const SEAM_STATUS = Object.freeze({
  /** Whether Fishball is on in this DSH; `off` is what a reader sees without core (R-FB-10). */
  fishball: Object.freeze({ on: 'on', off: 'fishball-off' }),
  /** Set completeness (design §8.2 `plugin-set-incomplete`). */
  set: Object.freeze({ ok: 'ok', incomplete: 'plugin-set-incomplete' }),
  /** Why a set member is missing: its layer was skipped at load, or one of its rows failed to start. */
  reason: Object.freeze({ skipped: 'skipped', failed: 'failed' }),
  /** The strip's one control (design §6.3a steps 1–2). */
  control: Object.freeze({ connect: 'connect', cancel: 'cancel' }),
  /** Core's `LINK.state` (K3a). */
  link: Object.freeze({ connected: 'connected', unreachable: 'target-unreachable', refused: 'token-refused', unset: 'target-unset' }),
  /** Core's `CONNECT.state` (K3a). */
  connect: Object.freeze({
    needsConfiguration: 'needs-configuration',
    needsAuthorization: 'needs-authorization',
    authorizing: 'authorizing',
    authorized: 'authorized',
    failed: 'failed',
  }),
  /** Core's `GUARDS.status` (K3, `GuardReport.status`). */
  guards: Object.freeze({ ok: 'ok', overridden: 'guards-overridden' }),
})
