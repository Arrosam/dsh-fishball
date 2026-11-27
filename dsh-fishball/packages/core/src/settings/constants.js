/**
 * Values of core's own settings page, Node half (task F-SETTINGS; requirements 1.34 item 4,
 * R-FB-03; design §6.3a step 1). The page's browser half is `client.settings.js`; it restates
 * `SETTINGS` because a browser chunk cannot import a Node module (keep the two in step). The
 * target list and its routes are MULTI-0's `SEAM_TARGETS` (MULTI-1 removed `target.url`: targets
 * are records of core's own, added on the page, PLAN-MULTI §3.1).
 */
import { CONNECT } from '../../contracts/constants.js'

/**
 * Core's settings as its page edits them. F-WIRE gives core's row this id and a schema with these
 * fields, so the page and the row cannot disagree.
 * - `namespace`: the settings namespace of core's row (DSH addresses a row's settings by its id).
 *   It is spelled as core's bundle name, but it is a different fact: the page's slot key and
 *   `pluginNavigation.openBundle` use the bundle name (`GUARDS.bundleName`);
 * - `fields`: the page's fields in display order. A dotted name is a NESTED path in the namespace
 *   (`identity.id` is `{identity: {id}}`), the shape every design text uses for these settings
 *   (R-ID-10 `identity.id`, R12 `connect.clientMetadataUrl`, one global URL, Q06).
 */
export const SETTINGS = Object.freeze({
  namespace: 'fishball-core',
  fields: Object.freeze([CONNECT.setting, 'identity.id', 'identity.name']),
})
