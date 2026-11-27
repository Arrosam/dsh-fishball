/**
 * dsh-connector-ui, host half (tasks U-SHELL, U-DRAW; design §1.0, §4.2, §13.6; R-ARCH-04,
 * R-UI-01/02/03/09, R-HOST-06, R-FN-01, R-EXT-13; requirements 1.34, 1.38 Q-U1). The connector is
 * the backend and this package its frontend: DSH composes the browser half (src/client/client.js)
 * only while this row is in the profile, and the host half only connects it to the services.
 *
 * - Looks up `dshConnectorUi`, `dshInstanceChild` and `dshConnectorTools` at runtime, never in
 *   `inject` (K3: a listed key gates the row, and `?` is literal). Once the app is ready it logs
 *   one `connector-missing` error without a local connector (Q-U1), else one `instance-missing`
 *   warning without a usable locator (src/host/services.js).
 * - Declares the notify and attention tools through the connector's UI backend and contribution
 *   service; their handlers and state are the connector's (R-EXT-13 amended by 1.34).
 * - Offers the connector's UI backend the hosted child's agent as the one whose window this DSH
 *   can open (src/host/services.js `offerWindows`), which decides the sidebar entries.
 * - Registers its own owner-only Fetch routes for availability, the child's status and admission
 *   (src/host/routes.js), which re-serve the locator to embed-UI's web client.
 * It holds no state and stores nothing (R-UI-06).
 *
 * `connection` is the only inject: the Fetch registry is read as a property, which Cordis refuses
 * without it, and it is a dsh-base row on both SDKs, so it never gates this row in practice.
 */
import { ROW } from './src/host/constants.js'
import { contributeTools, offerWindows, reportMissing } from './src/host/services.js'
import { registerRoutes } from './src/host/routes.js'

export const name = ROW.name
export const inject = ['connection']

export function apply(ctx) {
  const logger = ctx.logger(ROW.logger)
  registerRoutes(ctx, logger)
  reportMissing(ctx, logger)
  contributeTools(ctx, logger)
  offerWindows(ctx)
}
