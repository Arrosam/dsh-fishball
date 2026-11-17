/**
 * `src/settings-page`: the host half of the connector's own plugin settings page (task
 * C-TOKENS-REVEAL; design §5.9; R-ARCH-03, R-CON-10, R-TOK-03, R-TOK-11). The browser half is the
 * package's client.js (the Plugins page's `plugins.row.config` entry for `dsh-agent-connector#dsh-connector`).
 * - `routes({tokens, state?, logger})`: the page's routes as `{path, methods, fetch}`;
 * - `registerSettingsPage(ctx, {tokens, state?, logger})`: registers them for the row's life; with
 *   `state`, also the read-only state route (C-WIRE).
 * C-WIRE calls `registerSettingsPage` from the connector row (src/wire/index.js) and the package's
 * `dsh.client` field serves client.js.
 */
import { diagnosticOf } from '../errors.js'
import { REQUEST_BODY_BUFFERED } from '../constants.js'
import { LOG, SETTINGS_PAGE } from './constants.js'
import { routes } from './routes.js'

export { SETTINGS_PAGE }
export { routes }

/**
 * Registers the page's routes on DSH's owner-only Fetch registry, each as a row effect, so they go
 * with the row. A path the registry refuses is left out and logged; it never fails the row (the
 * page then reads the route as unavailable), as dsh-connector-ui's host routes do.
 * @param ctx - the connector row's context (needs `connection.fetch` and `effect`).
 * @returns each route's effect disposer, so an owner that composes the page (C-WIRE) can remove
 *   the routes before the modules behind them close
 */
export function registerSettingsPage(ctx, { tokens, state, logger }) {
  return routes({ tokens, state, logger }).map((route) => ctx.effect(() => {
    try { return ctx.connection.fetch.register({ ...route, requestBody: REQUEST_BODY_BUFFERED }) } catch (error) {
      logger.warn(LOG.routeUnavailable, route.path, diagnosticOf(error))
      return () => {}
    }
  }, SETTINGS_PAGE.effectLabel + route.path))
}
