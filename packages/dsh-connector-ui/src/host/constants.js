/**
 * dsh-connector-ui host half: its fixed values (task U-SHELL; design §4.1, §4.2; R-UI-01/02/03,
 * R-HOST-06, S4-Q1 A). Data only.
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
 * - handover: K3 `DshConnectorHandover` (handover.d.ts), the connector's;
 * - tools: K2 `TOOLS_API.service` (dsh-connector/tools constants.js), the connector's.
 */
export const SERVICE = Object.freeze({
  apiVersion: 1,
  child: 'dshInstanceChild',
  handover: 'dshConnectorHandover',
  tools: 'dshConnectorTools',
  /**
   * V2's connector service (dsh-connector/contract CONNECTOR_SERVICE), the W3 fallback: until
   * C-WIRE (W4b) wires the two services above into the connector row and removes the V2 path, a
   * connector shows its marks and its V2 frame through it. Remove this name with that path.
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
 */
/** A route path's root part, dropped for the page-relative form the browser resolves against DSH's page. */
export const ROUTE_PREFIX = '/'
export const ROUTE = Object.freeze({
  services: '/api/dsh-connector-ui/services',
  status: '/api/dsh-connector-ui/child/status',
  retry: '/api/dsh-connector-ui/child/retry',
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
 * - unavailable: no usable `dshInstanceChild` (the client then shows no page);
 * - invalid: a body that is not the route's closed shape;
 * - failed: the locator threw something that is not a K3 code (never echoed: its message may name
 *   a path or a URL).
 */
export const REFUSAL = Object.freeze({
  unavailable: 'instance-missing',
  invalid: 'invalid-request',
  failed: 'operation-failed',
})

/** Log lines (the logger's printf format). `instance-missing` once per row activation (R-UI-01). */
export const LOG = Object.freeze({
  instanceMissing: 'instance-missing: no dshInstanceChild with apiVersion %d; no Fishball page or frame',
  routeUnavailable: 'route %s not registered (%s)',
})

/** Cordis effect labels. */
export const LABEL = Object.freeze({
  ready: 'dsh-connector-ui: instance-missing check',
})
