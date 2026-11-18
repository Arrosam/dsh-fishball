/**
 * Core's own settings page, Node half (task F-SETTINGS): the page's settings names (`SETTINGS`)
 * for the row schema. Everything else on the page is DSH's own (its fields are the row's settings
 * namespace, its token fields write DSH's credential store through `remote.credentials`) or the
 * target routes (`../targets/routes.js`, MULTI-1), which replaced this module's single Connect and
 * Cancel routes: there is no single target any more (MULTI-0 `ui.d.ts`).
 */
export { SETTINGS } from './constants.js'
