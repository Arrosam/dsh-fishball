/**
 * `src/settings-page`: the host half of the connector's own plugin settings page (task
 * C-TOKENS-REVEAL; design §5.9; R-ARCH-03, R-CON-10, R-TOK-03, R-TOK-11). The browser half is the
 * package's client.js (the Plugins page's `plugins.row.config` entry for `dsh-connector#dsh-connector`).
 * - `routes({tokens, logger})`: the page's two routes as `{path, methods, fetch}`;
 * - `registerSettingsPage(ctx, {tokens, logger})`: registers them for the row's life.
 * Nothing is mounted yet: C-WIRE calls `registerSettingsPage` from the connector row and adds the
 * package's `dsh.client` field (W4b).
 */
import { diagnosticOf } from '../errors.js'
import { REQUEST_BODY_BUFFERED } from '../constants.js'
import { LOG } from './constants.js'
import { routes } from './routes.js'

export { SETTINGS_PAGE } from './constants.js'
export { routes }

/**
 * Registers the page's routes on DSH's owner-only Fetch registry, each as a row effect, so they go
 * with the row. A path the registry refuses is left out and logged; it never fails the row (the
 * page then reads the route as unavailable), as dsh-connector-ui's host routes do.
 * @param ctx - the connector row's context (needs `connection.fetch` and `effect`).
 */
export function registerSettingsPage(ctx, { tokens, logger }) {
  for (const route of routes({ tokens, logger })) {
    ctx.effect(() => {
      try { return ctx.connection.fetch.register({ ...route, requestBody: REQUEST_BODY_BUFFERED }) } catch (error) {
        logger.warn(LOG.routeUnavailable, route.path, diagnosticOf(error))
        return () => {}
      }
    }, LOG.effect + route.path)
  }
}
