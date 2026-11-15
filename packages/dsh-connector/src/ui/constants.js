/**
 * The connector's UI backend: its fixed values (task C-UI-BACKEND; requirements 1.34, 1.38 Q-N1,
 * Q-N3, Q-U2, 1.41 Q-G4, Q-G5; R-UI-04/05/10, R-FN-01, R-EXT-13; design §1.0, §3.6, §13.6).
 * Data only. Contract values that have a runtime owner (K1 `mcp-schema`, K2 `tools`, the
 * connector's shared HTTP constants) are imported where they are used, never restated here.
 *
 * Not frozen by a K task yet: K3b (the UI-backend service freeze, plan §4) has not landed, so the
 * service name, the routes and the snapshot shape below are this task's. K3b adopts or amends them.
 */

/** The in-process service embed-UI's host half looks up (`ctx.get`), as K3's other services. */
export const UI_SERVICE = Object.freeze({
  name: 'dshConnectorUi',
  apiVersion: 1,
  label: 'dsh-connector: dshConnectorUi',
})

/**
 * The owner-only DSH Fetch routes embed-UI's browser half calls (the connector is the backend,
 * embed-UI draws: requirements 1.34). DSH's `connection.fetch` is owner-only and applies its
 * Host/Origin fence before a handler runs, so a handler checks only its body.
 * - state: the snapshot now; events: the snapshot as server-sent events, one at once and one per change;
 * - handOver / takeBack: the K3 hand-over operations (R-UI-05, R-UI-10, R-ROUTE-05);
 * - dismiss: the user clicked the notify prompt (R-FN-01);
 * - opened: the window opened, which clears the attention latch once and the prompt (§13.6, R-FN-01).
 */
export const UI_ROUTE = Object.freeze({
  state: '/api/dsh-connector/ui/state',
  events: '/api/dsh-connector/ui/events',
  handOver: '/api/dsh-connector/ui/handover',
  takeBack: '/api/dsh-connector/ui/takeback',
  dismiss: '/api/dsh-connector/ui/notice/dismiss',
  opened: '/api/dsh-connector/ui/opened',
})

/**
 * The route bodies: each closed, every other key refused. `maxBytes` bounds one body: a Hand over
 * note is the largest field, and V2's own limit for one message to Fishball is 64 KiB
 * (config.js `maxMessageBytes` default), so a note within it always fits.
 */
export const UI_BODY = Object.freeze({
  maxBytes: 65536,
  handOver: Object.freeze({ required: Object.freeze(['sessionId', 'principalKey']), optional: Object.freeze(['note']) }),
  takeBack: Object.freeze({ required: Object.freeze(['sessionId']), optional: Object.freeze(['note']) }),
})

/** The route refusals the backend answers itself (a K3 refusal keeps its own code). */
export const UI_CODE = Object.freeze({
  invalid: 'invalid-request',
  /** Declared by the notify tool (K2 `codes`): the message is empty after trimming. */
  messageEmpty: 'message-empty',
})

/** R-FN-01: a notify message is 1–4000 code points after trimming (fold-notify's `NOTIFY.maxChars`). */
export const NOTIFY = Object.freeze({ maxChars: 4000 })

/**
 * The tools embed-UI declares through the contribution service (R-EXT-13). The local names are
 * embed-UI's; the namespace comes from the caller (`dsh-connector-ui`, K2's alias `embed-ui`), so
 * the public names are `embed-ui.notify`, `embed-ui.attention.signal`, `embed-ui.attention.state`.
 * The descriptions are model-facing text; fold-notify's own notify wording is kept where it still
 * applies (REMOVE-FN: "its notify text and limits move to C-UI-BACKEND's constants").
 */
export const UI_TOOL = Object.freeze({
  notify: Object.freeze({
    name: 'notify',
    title: 'Notify the user',
    description: 'Show the user a short notice in this DSH: a prompt beside the sidebar fish that stays until they click it or open the window. A newer notice replaces the one shown. Set important to true only when the user must act (approve, answer, decide or fix something); it animates the fish.',
    message: `The whole message for the user, as plain text; after trimming, 1 to ${NOTIFY.maxChars} Unicode code points.`,
    important: 'True only when the user must act; defaults to false.',
  }),
  signal: Object.freeze({
    name: 'attention.signal',
    title: 'Light the fish',
    description: 'Light the user\'s sidebar fish until they next open the window. Stateless: no count, no replay. important makes it animate.',
    important: 'True when the user must act.',
  }),
  state: Object.freeze({
    name: 'attention.state',
    title: 'Read the fish light',
    description: 'Read the attention latch: count 0 or 1, and whether it is important.',
  }),
})

/** The latch's empty state (design §13.6, D3: a 0/1 latch with importance). */
export const LATCH = Object.freeze({ clear: 0, set: 1 })

/** Server-sent event framing (the HTML event-stream format V2's state stream uses too). */
export const SSE = Object.freeze({ prefix: 'data: ', suffix: '\n\n' })

/** Log lines (the connector's `'%s (%s)'` format: a line and a diagnostic code only). */
export const LOG = Object.freeze({
  format: '%s (%s)',
  handoverFailed: 'ui: the hand-over service failed',
})

/** Effect labels, shown in Cordis's own diagnostics. */
export const LABEL = Object.freeze({
  route: 'dsh-connector: ui route',
  streams: 'dsh-connector: ui event streams',
})

/** Programming-error messages (a caller bug, thrown; never shown to a client). */
export const MISUSE = Object.freeze({
  register: 'dsh-connector ui: contribute(register) needs a function',
  provideTwice: 'dsh-connector ui: provide() called twice; create one backend per connector activation',
})
