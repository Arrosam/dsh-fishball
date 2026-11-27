/**
 * The dsh-connector row: this DSH as an MCP server for the agents that manage its sessions
 * (design §3, §5, §13; tasks C-WIRE, C-WIRE-2). One composition, src/wire/: the MCP endpoint at
 * /api/agent/mcp, the OAuth server and approval listener, tokens, pairs, mailbox, routing and
 * revocation, the hosted-token service, the session domain (src/domain/: permission requests,
 * questions and plan reviews, prompts already showing, standing grants and the managed sessions'
 * `message_agent`), the UI backend, the contribution service, and the connector's own settings
 * page (client.js). Its settings are src/config.js's, edited only in DSH's form and that page.
 *
 * Routing is session → the agent that manages it → the user (the user, 2026-11-17). C-WIRE-2
 * removed the V2 broker, the `./contract` export, `attachInstance` and the `dshConnector` service
 * with its provider path (V2 was never deployed: "第三版其实就是第一版").
 *
 * The row requires dsh-web-app (the user, 2026-11-17): its injected web-app services keep it
 * pending without the web app (src/constants.js WEB_SERVICE).
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { Config, readLimits } from './src/config.js'
import { EVENT, PLUGIN, SERVICE, WEB_SERVICE } from './src/constants.js'
import { diagnosticOf } from './src/errors.js'
import { openV3 } from './src/wire/index.js'
import { LOG } from './src/wire/constants.js'

export const name = PLUGIN.name
export { Config }

/** Services the row cannot work without; see SERVICE for why each is needed. */
export const inject = Object.values(SERVICE)

export async function apply(ctx, config) {
  const logger = ctx.logger(PLUGIN.logger)
  const limits = () => readLimits(config)
  if (ctx.get(WEB_SERVICE.webServer) === undefined) {
    logger.warn(LOG.format, LOG.noWebServer, WEB_SERVICE.webServer)
    return
  }
  // The close is the row's effect from the start, so a row that unloads while the connector is
  // still opening closes it once it has opened; the effect returns that close's promise, which
  // Cordis awaits, so a remount opens its storage domains and routes only once these are released.
  // apply awaits the open: DSH's app ready waits for every row's apply, so the services and routes
  // (dshConnectorUi among them) exist by then, and a plugin that checks for them at app ready
  // finds them. A failure to open is logged, and the connector stays off until the next start.
  let active = true
  let opened = Promise.resolve()
  ctx.effect(() => {
    opened = openV3(ctx, { config, storageDomain: { defineDomain, domainTable }, limits, volatileEvent: EVENT.volatileUpdate, namespace: PLUGIN.name, logger })
      .catch((error) => { if (active) logger.warn(LOG.format, LOG.openFailed, diagnosticOf(error)) })
    return () => {
      active = false
      return opened.then((connector) => connector?.close())
    }
  }, LOG.label)
  await opened
}
