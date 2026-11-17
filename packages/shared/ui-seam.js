/**
 * The fishball-core / fishball-ui seam (requirements 1.38 Q-N2, 1.41 Q-G1/Q-G2; R-FB-14; design
 * §1.0: "Core and UI meet only through `fishball-shared`'s contract"). fishball-ui loads without
 * core (Q-G2), so it cannot import core's `contracts/constants.js`; both packages read these values
 * from here instead. Data only: frozen strings.
 *
 * - `UI_SEAM` (moved here unchanged from core's K3a constants, as K3a announced): `member` is the
 *   `fishballInstance` member fishball-ui reads (core's `contracts/ui.d.ts`); `coreMissing` is the
 *   one line fishball-ui logs, and then changes nothing, without core (Q-G2 = A; R-FB-06's
 *   word). Core shows no hint of a missing fishball-ui (Q-G1), so there is no value for that.
 * - `UI_STATUS`: the name of core's status service the strip reads (F-WIRE).
 * - `UI_GUARDS`: the service fishball-ui's row provides so core's guard check also reports the UI
 *   guard rows fishball-ui's patch holds (R-FB-09): `{rows}`, that patch's guard-row ids.
 * - `SEAM_STATUS`: the words of core's status snapshot that fishball-ui's strip view draws.
 *   `fishball`, `set`, `reason` and `control` are defined here, once; core's `STATUS_MODEL` takes
 *   them from here. `link`, `connect` and `guards` restate core's K3 `LINK.state`, `CONNECT.state`
 *   and `GUARDS.status`, because that file is data-only and imports nothing (the K3 freeze); the
 *   fishball-ui tests check that both copies are equal.
 * - `SEAM_TARGETS` (MULTI-0, 2026-11-18): the multiple-target list fishball-ui draws in the
 *   sidebar and the owner-only routes it acts through (core's `contracts/targets.d.ts`).
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

/**
 * The multiple-target seam (MULTI-0 freeze, 2026-11-18; PLAN-MULTI §3, §5, §6.1, Q01–Q12; core's
 * `contracts/targets.d.ts`). Defined once here: core and fishball-ui both read it, and neither
 * imports the other.
 *
 * - `snapshotVersion`: `TargetsSnapshot.version`. Core's status snapshot (`UI_STATUS.service`
 *   `snapshot()`) carries it as `targets: {version, targets}` beside the global `fishball`,
 *   `guards` and `set`, which stay once per process; the scalar `link`, `connect`, `line`,
 *   `control` and `contributedTools` move into each `TargetView`. fishball-ui's existing strip SSE
 *   route serves that snapshot; there is no chat-top card any more (D03);
 * - `state`: the four public states (D03). Core derives one from a target's detail, first match
 *   wins: link `connected` is `connected`; an active link attempt or Connect `authorizing` is
 *   `connecting`; link `target-unset`, or Connect `needs-authorization` / `needs-configuration`
 *   with no credential yet, is `not-set`; anything else (`target-unreachable`, `token-refused`,
 *   Connect `failed`, an unknown word) is `failed`, never success;
 * - `kind`: `parent` (a hosted child's reserved, non-removable, URL-read-only first target) or
 *   `remote` (added by the user, standalone and hosted alike);
 * - `identity`: the live-identity capability shown in details (`TargetIdentityState`);
 * - `placeholder`: what to show for `name === null` (Q01), by the copy key fishball-ui owns: no
 *   URL-derived name;
 * - `route`: core's owner-only routes (DSH's exact Fetch routes). Every POST body is JSON with
 *   `targetIdField` and the members named; a missing, unknown or removed id answers 404 with
 *   `refusal.unknownTarget`. `connect` answers K3a `ConnectBegin`; the rest `{ok: true}` or
 *   `{ok: false, code}`. The add/remove/url routes serve core's settings page;
 * - `route.list` (MULTI-0 amendment, MULTI-1's finding, 2026-11-18): `read` (GET), owner-only like
 *   the others, no body; 200 with the `TargetsSnapshot` JSON, exactly what `ui.targets.list()`
 *   returns. Core serves it so its own settings page reads the list without fishball-ui (Q-G1);
 * - `ask`: the ask card's answer body now names an opaque target-qualified `handle`
 *   (`AskCard.handle`), never a raw `approvalId`; `voided` is the state of a card whose target was
 *   removed or whose endpoint retired (Q07): read-only, never answered;
 * - `refusal`: the target actions' own codes (`TargetActionResult`); URL refusals stay K3a's
 *   `target-insecure` / `target-invalid`.
 */
export const SEAM_TARGETS = Object.freeze({
  snapshotVersion: 1,
  member: 'targets',
  state: Object.freeze({ connected: 'connected', connecting: 'connecting', failed: 'failed', notSet: 'not-set' }),
  kind: Object.freeze({ parent: 'parent', remote: 'remote' }),
  identity: Object.freeze({ pending: 'pending', live: 'live', unsupported: 'unsupported', stale: 'stale' }),
  placeholder: Object.freeze({ unnamed: 'name-unavailable', unset: 'not-set' }),
  route: Object.freeze({
    list: '/api/fishball/targets',
    read: 'GET',
    connect: '/api/fishball/targets/connect',
    cancel: '/api/fishball/targets/cancel',
    retry: '/api/fishball/targets/retry',
    pairing: '/api/fishball/targets/pairing',
    add: '/api/fishball/targets/add',
    remove: '/api/fishball/targets/remove',
    url: '/api/fishball/targets/url',
    method: 'POST',
    targetIdField: 'targetId',
    fields: Object.freeze({ url: 'url', choice: 'choice', confirmed: 'confirmed' }),
  }),
  ask: Object.freeze({ handleField: 'handle', voided: 'voided' }),
  refusal: Object.freeze({
    unknownTarget: 'unknown-target',
    targetDuplicate: 'target-duplicate',
    targetReserved: 'target-reserved',
    confirmationRequired: 'confirmation-required',
  }),
})
