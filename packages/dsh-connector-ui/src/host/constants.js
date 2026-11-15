/**
 * dsh-connector-ui host half: its fixed values (tasks U-SHELL, U-DRAW; design §1.0, §4.1, §4.2,
 * §13.6; R-ARCH-04, R-UI-01/02/03/09, R-HOST-06, R-FN-01, R-EXT-13; requirements 1.38 Q-U1,
 * 1.41 Q-G3; S4-Q1 A). Data only.
 *
 * Contract values restated here: K3's `host-services/` is types only (its README: "Types only;
 * nothing here runs"), and the connector package that holds K1 and K2's runtime values is absent in
 * install row 7 (I + U), so embed-UI cannot import them. Each value below names its frozen source;
 * a change there changes it here in the same amendment.
 */

/** The host row (cordis.patch.yml) and its logger. */
export const ROW = Object.freeze({ name: 'dsh-connector-ui', logger: 'dsh-connector-ui' })

/**
 * The host-only services embed-UI looks up at runtime (`ctx.get`), never through its own `inject`
 * (K3 host-services/index.d.ts: a trailing `?` is literal in Cordis and every listed key gates the
 * row). `apiVersion` is the one version each must carry; any other value is the service absent
 * (K3 index.d.ts, README; UIM-EP-01 row 5).
 * - child: K3 `DshInstanceChild` (child.d.ts), the instance's locator;
 * - ui: the connector's UI backend (dsh-connector src/ui/constants.js `UI_SERVICE.name`; K3b has
 *   not frozen it yet, so C-UI-BACKEND's name is restated here): every state and operation embed-UI
 *   draws, the routes it draws them from, and `contribute(register)` for its tools (1.34);
 * - tools: K2 `TOOLS_API.service` (dsh-connector/tools constants.js), the contribution service
 *   embed-UI's tools are registered through (R-EXT-13).
 * The connector's hand-over service is no longer looked up: the UI backend draws on it (1.34).
 */
export const SERVICE = Object.freeze({
  apiVersion: 1,
  child: 'dshInstanceChild',
  ui: 'dshConnectorUi',
  tools: 'dshConnectorTools',
  /**
   * V2's connector service (dsh-connector/contract CONNECTOR_SERVICE), the W3 fallback: until
   * C-WIRE (W4b) wires `ui` into the connector row and removes the V2 path, a V2 connector still
   * counts as the local connector (Q-U1) and shows its V2 frame through it, and nothing else.
   * Remove this name with that path.
   */
  legacyConnector: 'dshConnector',
  /** DSH's app-ready service (dsh profile-boot, both SDKs): `onReady(fn)` also calls a late subscriber. */
  appReady: 'appReady',
})

/**
 * The admission hostname rule (S4-Q1 decided A; K3 child.d.ts `LoopbackHostname`, README "admit
 * hostname"). The frame opens under the main page's own hostname, as a WHATWG URL parses it (so
 * already lower-case: `LOCALHOST` arrives as `localhost`), and only under these three names.
 */
export const LOOPBACK = Object.freeze({
  hostnames: Object.freeze(['127.0.0.1', 'localhost', '[::1]']),
  /** The request header that names the main page's authority, and the scheme its URL parses with. */
  hostHeader: 'host',
  parseScheme: 'http://',
  /**
   * Characters a bare `host[:port]` never holds; a Host with any of them (userinfo, a path, a
   * query or a fragment) is refused before parsing, because the URL parser would read a name out
   * of it (`evil@localhost` → `localhost`).
   */
  notInAuthority: /[@/?#\\]/,
})

/**
 * K3 `AdmitErrorCode` (child.d.ts; DECIDED #15, #16) and K3 `AdmitView` / `AdmitLang`. embed-UI's
 * admit route answers `hostname-refused` itself for any other name, before it calls the locator.
 */
export const ADMIT = Object.freeze({
  code: Object.freeze({ hostnameRefused: 'hostname-refused', notReady: 'not-ready' }),
  views: Object.freeze(['chat', 'settings']),
  langs: Object.freeze(['zh', 'en']),
  /** The admit route's body: exactly these keys (`hostname` is never the client's to choose). */
  bodyKeys: Object.freeze(['view', 'lang']),
})

/**
 * The host half's own authenticated DSH Fetch routes (design §4.2: "its own routes for status,
 * Retry, admission and model sync, re-serving the locator's results to its own web client").
 * DSH's `connection.fetch` registry is exact-path and owner-only, and applies DSH's Host/Origin
 * fence before a handler runs (dsh-client-connection), so a handler checks only its body.
 * `services` answers which services are usable now, so the client registers by availability, and
 * the other routes' page-relative paths (`ROUTE_PREFIX` dropped), so the web client keeps no copy.
 * There is no Retry route: Retry is on the instance's own settings page, which the window's Retry
 * link opens (R-UI-03 amended by 1.33; decided #77).
 */
/** A route path's root part, dropped for the page-relative form the browser resolves against DSH's page. */
export const ROUTE_PREFIX = '/'
export const ROUTE = Object.freeze({
  services: '/api/dsh-connector-ui/services',
  status: '/api/dsh-connector-ui/child/status',
  admit: '/api/dsh-connector-ui/child/admit',
  modelsCheck: '/api/dsh-connector-ui/child/models/check',
  modelsAdd: '/api/dsh-connector-ui/child/models/add',
})

/** The Fetch registration's fixed parts (connection.fetch: methods, requestBody). */
export const FETCH = Object.freeze({ get: 'GET', post: 'POST', body: 'buffered' })

/** HTTP answers. Every body is JSON; nothing here carries a token, a ticket or a URL but admit's own. */
export const HTTP = Object.freeze({
  ok: 200,
  badRequest: 400,
  conflict: 409,
  /** The locator failed without a K3 code: the service behind this route, not the request, failed. */
  badGateway: 502,
  unavailable: 503,
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  /** The largest request body read (admit and Add are small; V2's sync routes used the same bound). */
  maxBodyBytes: 16384,
})

/**
 * The route refusals the host half answers itself (`{ok: false, code}`):
 * - connectorMissing: no local connector (Q-U1: embed-UI does not work without one), checked
 *   before anything else;
 * - unavailable: no usable `dshInstanceChild` (the client then shows the hint);
 * - invalid: a body that is not the route's closed shape;
 * - failed: the locator threw something that is not a K3 code (never echoed: its message may name
 *   a path or a URL).
 */
export const REFUSAL = Object.freeze({
  connectorMissing: 'connector-missing',
  unavailable: 'instance-missing',
  invalid: 'invalid-request',
  failed: 'operation-failed',
})

/**
 * Log lines (the logger's printf format), each at most once per row activation:
 * `connector-missing` is an error (Q-U1: "报错"), `instance-missing` a warning (R-UI-01), and only
 * with a connector, since without one embed-UI does nothing that an instance would complete.
 */
export const LOG = Object.freeze({
  connectorMissing: 'connector-missing: no dshConnectorUi with apiVersion %d; embed-UI needs a local connector and does nothing',
  instanceMissing: 'instance-missing: no dshInstanceChild with apiVersion %d; the window shows the no-instance hint',
  routeUnavailable: 'route %s not registered (%s)',
})

/** Cordis effect labels. */
export const LABEL = Object.freeze({
  ready: 'dsh-connector-ui: connector and instance check',
  tools: 'dsh-connector-ui: notify and attention tools',
})
