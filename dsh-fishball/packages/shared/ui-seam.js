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
 * - `UI_GUARDS`: legacy service name, kept for compatibility; no service is provided.
 * - `UI_INSTANCE`, `SEAM_PAIRING`: core's service and the pairing words fishball-ui's pairing card
 *   draws (R-FIX-FUI).
 * - `SEAM_STATUS`: the words of core's status snapshot that fishball-ui's strip view draws.
 *   `fishball`, `set`, `reason` and `control` are defined here, once; core's `STATUS_MODEL` takes
 *   them from here. `link` and `connect` restate core's K3 `LINK.state` and `CONNECT.state`.
 *   `guards` is retained for compatibility with readers of the old snapshot vocabulary.
 * - `SEAM_TARGETS` (MULTI-0, 2026-11-18): the multiple-target list fishball-ui draws in the
 *   sidebar and the owner-only routes it acts through (core's `contracts/targets.d.ts`).
 * - `SEAM_PAGE_STREAM`: the Fishball page's one live connection, which carries every topic
 *   (core's own, fishball-ui's and the amenities').
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

/** @deprecated Legacy name; the UI no longer provides a guard reporting service. */
export const UI_GUARDS = Object.freeze({
  service: 'fishballUiGuards',
})

/**
 * Core's `fishballInstance` service and the `apiVersion` whose `ui` member (`UI_SEAM.member`)
 * fishball-ui draws (K3 `index.d.ts`). fishball-ui reads the pairing from it (R-FIX-FUI); core's main
 * row takes both values from here. Its own object, because `UI_SEAM` is K3a's frozen set.
 */
export const UI_INSTANCE = Object.freeze({
  service: 'fishballInstance',
  apiVersion: 1,
})

/**
 * The words of core's `ui.pairing` view and choices that fishball-ui's pairing card draws (F-PAIR,
 * AUTH-ST-03; R-ID-07). `state` and `choice` are defined here, once: core's identity constants
 * (`PAIRING_STATE`, `CHOICE`) take them from here. `nameRefusal` restates core's K3 `MCP.refusal`
 * name codes, a view's `nameIssue.code`, because that file is data-only and imports nothing (the K3
 * freeze, as `SEAM_STATUS.link` below).
 */
export const SEAM_PAIRING = Object.freeze({
  state: Object.freeze({
    unpaired: 'unpaired',
    paired: 'paired',
    warnMatch: 'warn-match',
    warnMismatch: 'warn-mismatch',
    needToken: 'need-token',
    needId: 'need-id',
    idMismatch: 'id-mismatch',
  }),
  choice: Object.freeze({ continue: 'continue', newTokenAndId: 'new-token-and-id', newToken: 'new-token' }),
  nameRefusal: Object.freeze({ nameTaken: 'name-taken', nameInvalid: 'name-invalid' }),
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
  /** @deprecated Legacy snapshot words; guard status is no longer published. */
  guards: Object.freeze({ ok: 'ok', overridden: 'guards-overridden' }),
})

/**
 * The sidebar logo's theme (LOGO-BUTTON): one choice, owned by core's settings page, drawn by
 * fishball-ui's brand part. Both packages read the words and the default from here; core stores it
 * in its own config as `setting`, fishball-ui receives it in the strip frame as `brandStyle`.
 *
 * The two artwork themes are Fishball's own (the DeepSeek theme uses Fishball's whale drawing, not
 * DeepSeek's official artwork). An absent or unknown stored value means `default`; the settings
 * control offers exactly the two values.
 */
export const SEAM_BRAND = Object.freeze({
  setting: 'brandStyle',
  default: 'fishball',
  style: Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' }),
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
 * - `placeholder`: what to show for `name === null` (Q01), by the copy key fishball-ui owns, never a
 *   URL-derived name: `unset` ("Not set") when the target has no URL (a parent whose instance
 *   value is blank), `unnamed` ("Name unavailable") when it has one but no discovery answered yet;
 * - `route`: core's owner-only routes (DSH's exact Fetch routes). Every POST (`method`) body is
 *   JSON with `targetIdField` and the members named (`add` has `url` and no id). Answers (review
 *   S5; the ask routes' convention), each with a JSON body `{ok: true, …}` or `{ok: false, code}`:
 *   `http.ok`; `http.badRequest` for a malformed body or field (K1 `invalid-arguments`) and the URL
 *   refusals `target-insecure` / `target-invalid`; `http.notFound` for a missing, unknown or
 *   removed id (`refusal.unknownTarget`); `http.conflict` for every other refusal (`target-duplicate`,
 *   `target-reserved`, `confirmation-required`, a delegated Connect/pairing code);
 *   `http.unavailable` with `{code: unavailableCode}` and no detail when core's
 *   `fishballInstance` is absent, not `apiVersion` 2, or threw. The K3a routes
 *   `/api/fishball/connect` and `/api/fishball/connect/cancel` are withdrawn (review S6); `connect` answers K3a `ConnectBegin`; the rest `{ok: true}` or
 *   `{ok: false, code}`. The add/remove/url routes serve core's settings page;
 * - `route.list` (MULTI-0 amendment, MULTI-1's finding, 2026-11-18): `read` (GET), owner-only like
 *   the others, no body; 200 with the `TargetsSnapshot` JSON, exactly what `ui.targets.list()`
 *   returns. Core serves it so its own settings page reads the list without fishball-ui (Q-G1);
 * - `ask`: the ask card's answer body now names an opaque target-qualified `handle`
 *   (`AskCard.handle`), never a raw `approvalId`; `voided` is the state of a card whose target was
 *   removed or whose endpoint retired (Q07): read-only, never answered. The answer route keeps its
 *   statuses (200, 400 `invalid-arguments`, 409 for a refusal) and adds 404 `unknown-target` for an
 *   unknown handle; a `voided` card answers K1 `expired` (409), as a closed one does;
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
  http: Object.freeze({ ok: 200, badRequest: 400, notFound: 404, conflict: 409, unavailable: 503 }),
  unavailableCode: 'TARGETS_UNAVAILABLE',
  ask: Object.freeze({ handleField: 'handle', voided: 'voided' }),
  refusal: Object.freeze({
    unknownTarget: 'unknown-target',
    targetDuplicate: 'target-duplicate',
    targetReserved: 'target-reserved',
    confirmationRequired: 'confirmation-required',
  }),
})

/**
 * The Fishball page's one live connection (the user, 2026-11-21: "合并数据流，全部都走一个链接").
 *
 * Why one: a browser opens at most 6 HTTP/1.1 connections per host (Chrome, Firefox by default),
 * shared by every tab of the profile, and a loopback DSH serves no HTTP/2. Each open EventSource
 * holds one for as long as it is open, and DSH's own calls (sending a message, uploads, history
 * pages) are ordinary fetches that queue behind them. With one stream per panel the page reached 6
 * (DSH's `/plugins/events`, the strip twice, the ask cards twice, the task board) and every send
 * stayed "sending" until the user left the page. So every live view of the page is a topic of one
 * stream, and adding a panel or an amenity adds a topic, never a connection: the page holds
 * `perPage` Fishball connections whatever it draws, beside DSH's own.
 *
 * A DSH stream Remote on DSH's WebSocket would not count against the limit at all, but a plugin can
 * contribute one only with the strict descriptors `dsh-typert-generator` writes at build time
 * (`ctx.remote.$mount` refuses a contribution without strict codecs, both SDKs), and the Fishball
 * packages ship plain JS with no build step.
 *
 * - `route`: core's owner-only SSE route (`connection.fetch`). Its query carries the reader's
 *   `lang` and IANA time zone `tz`, which a topic may use (`frame(url)`); it never names topics:
 *   the stream always carries every registered topic, so mounting a panel never reopens it;
 * - each SSE message is `{[field.topic]: <name>, [field.frame]: <the topic's own frame>}`: every
 *   topic's frame when the stream opens, then one per change; an unchanged frame is not sent again;
 * - `member`: `fishballInstance.page` (`apiVersion`, core's MULTI-0 version; the member is additive): `register(topic, provider)`
 *   returns its dispose; `provider` is `{frame(url), onChange(fn) => dispose}`. A topic name is
 *   registered once; an amenity registers its topics while it is bound to the instance;
 * - `topic`: the built-in topics;
 * - `client`: the browser service fishball-ui provides, `{subscribe(topic, {frame, health}) =>
 *   unsubscribe}`; an amenity's browser half reads its topic through it, and falls back to its own
 *   route only where the service is absent (no fishball-ui), so a standalone install keeps working.
 */
export const SEAM_PAGE_STREAM = Object.freeze({
  perPage: 1,
  route: '/api/fishball/page/events',
  apiVersion: 2,
  langParameter: 'lang',
  zoneParameter: 'tz',
  field: Object.freeze({ topic: 'topic', frame: 'frame' }),
  member: 'page',
  topic: Object.freeze({ asks: 'asks', strip: 'strip' }),
  client: 'fishballPageStream',
})
