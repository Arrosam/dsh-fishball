/**
 * dsh-connector-ui, host half (task U-SHELL; design §4.2; R-UI-01/02/03, R-HOST-06). DSH composes
 * this package's browser half (src/client/client.js) only while this row is in the profile.
 *
 * - Looks up `dshInstanceChild`, `dshConnectorHandover` and `dshConnectorTools` at runtime,
 *   never in `inject` (K3: a listed key gates the row, and `?` is literal), and logs one
 *   `instance-missing` when no usable locator exists once the app is ready (src/host/services.js).
 * - Registers its own owner-only Fetch routes for availability, status, Retry, admission and
 *   model sync (src/host/routes.js), which re-serve the locator to embed-UI's web client.
 * It holds no state and stores nothing (R-UI-06).
 *
 * `connection` is the only inject: the Fetch registry is read as a property, which Cordis refuses
 * without it, and it is a dsh-base row on both SDKs, so it never gates this row in practice.
 */
import { ROW } from './src/host/constants.js'
import { reportInstanceMissing } from './src/host/services.js'
import { registerRoutes } from './src/host/routes.js'

export const name = ROW.name
export const inject = ['connection']

export function apply(ctx) {
  const logger = ctx.logger(ROW.logger)
  registerRoutes(ctx, logger)
  reportInstanceMissing(ctx, logger)
}
