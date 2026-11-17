/**
 * Values of core's own settings page, Node half (task F-SETTINGS; requirements 1.34 item 4,
 * R-FB-03; design §6.3a step 1). The page's browser half is `client.settings.js`; it restates
 * `SETTINGS` and `CONNECT_ROUTE.path` because a browser chunk cannot import a Node module (keep the
 * two in step).
 *
 * The Connect states, `begin` outcomes and configuration codes are K3a's (`contracts/constants.js`
 * `CONNECT`, `connect.d.ts`); the service and its `apiVersion` are K3's (`GUARDS.services.instance`).
 */
import { CONNECT } from '../../contracts/constants.js'

/**
 * Core's settings as its page edits them. F-WIRE gives core's row this id and a schema with these
 * fields, so the page and the row cannot disagree.
 * - `namespace`: the settings namespace of core's row (DSH addresses a row's settings by its id).
 *   It is spelled as core's bundle name, but it is a different fact: the page's slot key and
 *   `pluginNavigation.openBundle` use the bundle name (`GUARDS.bundleName`);
 * - `fields`: the page's fields in display order. A dotted name is a NESTED path in the namespace
 *   (`target.url` is `{target: {url}}`), the shape every design text uses for these settings
 *   (R-FB-03 `target.url`, R-ID-10 `identity.id`, R12 `connect.clientMetadataUrl`).
 */
export const SETTINGS = Object.freeze({
  namespace: 'fishball-core',
  fields: Object.freeze(['target.url', CONNECT.setting, 'identity.id', 'identity.name']),
})

/**
 * The page's Connect route: the browser cannot reach `fishballInstance.ui.connect` itself, so it
 * reads the status and starts an attempt through this one owner-only route (DSH's exact Fetch
 * routes answer only owner peers, `dsh-client-connection` `ConnectionFetchRoute`).
 * - GET: `200 ConnectStatus`, exactly `{state, code}`;
 * - POST: `200 ConnectBegin`, exactly its outcome's members (the request body is ignored; the
 *   request's `Origin` and `Host` headers pick the callback, link/web-callback.js);
 * - POST `cancelPath`: `cancel()`, then `200 ConnectStatus` (fishball-ui's strip Cancel, design
 *   §6.3a step 2);
 * - no compatible `fishballInstance.ui.connect`, or it threw: `503 {code: unavailableCode}`, with no
 *   error detail, so nothing about a credential can leave through an exception message (a throw is
 *   logged by its code alone, `connectFailed`, so it is told apart from a missing service). The page
 *   reads any non-200 as "unavailable"; the code names the cause for a reader of the network log.
 * - `instanceApiVersion`: K3's `fishballInstance.apiVersion`, the only service version this route
 *   understands (another version may shape `ui.connect` differently).
 */
export const CONNECT_ROUTE = Object.freeze({
  path: '/api/fishball/connect',
  cancelPath: '/api/fishball/connect/cancel',
  /** The cancel route's one method. */
  cancel: 'POST',
  read: 'GET',
  begin: 'POST',
  requestBody: 'buffered',
  instanceApiVersion: 1,
  ok: 200,
  unavailable: 503,
  unavailableCode: 'CONNECT_UNAVAILABLE',
  /**
   * The background-log reason of a 503 for a throw (F-FIX-3), on the link's logger with its line
   * (`LINK_SAVE.logger`, `LINK_SAVE.text.failed`) and the error's code only.
   */
  connectFailed: 'answering the Connect route',
  headers: Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store' }),
  /** The `ConnectBegin` members each outcome carries besides `outcome` (connect.d.ts). */
  beginMembers: Object.freeze({
    authorized: Object.freeze([]),
    'approval-url': Object.freeze(['url']),
    'needs-configuration': Object.freeze(['code']),
  }),
})
