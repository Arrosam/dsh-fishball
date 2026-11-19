/**
 * dsh-connector-adapter (R-OA-21, design §5.5b; renamed by requirements 1.41): lets a DSH use another
 * DSH's `dsh-connector` through DSH's own stock MCP client, with normal OAuth.
 *
 * Mechanism c2 (spike V3-S7c): per configured server the adapter owns the grant (one
 * `ctx.credentials` record), a route on its loopback proxy, and a stock `dsh-mcp-client` mounted
 * with `ctx.plugin()` and pointed at that route. The user's configuration holds no client row and no
 * `!!js`. The browser leg is a `ctx.authorization` flow; sign-in is the agent tool
 * `dsh_connector_sign_in`. No host file is patched (rule 11).
 *
 * It depends on no other DSH-side plugin and on nothing of the Fishball side (design §1.0): its
 * OAuth browser client is its own src/oauth-client.js (moved out of dsh-connector-shared by C-WIRE-2:
 * R-ARCH-08 strict, the adapter is its only DSH-side user), so it shares no code at all.
 */
import * as defaultSdk from '@modelcontextprotocol/client'
import * as defaultMcpClient from '@deepseek-ai/dsh-mcp-client'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'
import { OAUTH_CLIENT, clientMetadataUrlProblem } from './src/oauth-client.js'
import { isAllowedServerUrl } from './src/connector-check.js'
import { ADAPTER, CONFIG_ERROR, REASON, SERVER_ID, SERVER_NAME_PATTERN, TEXT } from './src/constants.js'
import { startProxy } from './src/proxy.js'
import { createServer } from './src/server.js'
import { signInTool } from './src/sign-in-tool.js'

export const name = ADAPTER.name
export const inject = ['credentials', 'authorization', 'tools']

/** `clientMetadataUrl` is required with no default (Q-S7C-2 = C); its absence is a state, not a config error. */
export const Config = Schema.object({
  clientMetadataUrl: Schema.string().description(TEXT.configClientMetadataUrl),
  servers: Schema.array(Schema.object({
    serverName: Schema.string().pattern(SERVER_NAME_PATTERN).required().description(TEXT.configServerName),
    url: Schema.string().required().description(TEXT.configUrl),
  })).default([]).description(TEXT.configServers),
})

const CONFIG_REASON = Object.freeze({
  [OAUTH_CLIENT.urlProblem.missing]: REASON.clientMetadataUrlMissing,
  [OAUTH_CLIENT.urlProblem.invalid]: REASON.clientMetadataUrlInvalid,
})
const serverId = (serverName) => SERVER_ID.prefix + Buffer.from(serverName, SERVER_ID.textEncoding).toString(SERVER_ID.encoding)

/** A configuration the adapter refuses to start with; `code` is one of CONFIG_ERROR. */
class AdapterConfigError extends Error {
  constructor(code, serverName) {
    super(TEXT.configError(code, serverName))
    this.name = 'AdapterConfigError'
    this.code = code
  }
}

/**
 * The servers the settings name, checked before anything starts: one entry per serverName, and a
 * URL the access token may be sent to (https, or http on a loopback host; Fishball's decision S8).
 */
function serverSpecs(config) {
  const specs = new Map()
  for (const spec of config.servers) {
    if (specs.has(spec.serverName)) throw new AdapterConfigError(CONFIG_ERROR.duplicateServer, spec.serverName)
    if (!isAllowedServerUrl(spec.url)) throw new AdapterConfigError(CONFIG_ERROR.insecureServerUrl, spec.serverName)
    const id = serverId(spec.serverName)
    specs.set(spec.serverName, { spec, id, key: credentialKey(ADAPTER.name, id) })
  }
  return specs
}

/**
 * The plugin with its outside world injected (tests drive a fake clock and fetch through it).
 * @param deps.now epoch ms; deps.timers `{setTimeout, clearTimeout}`; deps.fetch every outbound
 *   request (discovery, token endpoint, proxy upstream); deps.sdk / deps.mcpClient the MCP SDK and
 *   the stock client module (defaults: the pinned dependency and the host's dsh-mcp-client).
 */
export function createAdapterPlugin({ now = Date.now, timers = globalThis, fetch: fetchFn = globalThis.fetch, sdk = defaultSdk, mcpClient = defaultMcpClient } = {}) {
  async function apply(ctx, config) {
    const configProblem = CONFIG_REASON[clientMetadataUrlProblem(config.clientMetadataUrl)]
    const specs = serverSpecs(config)
    const servers = new Map()
    const byRoute = new Map()
    const byKey = new Map()

    const proxy = await startProxy({ servers: byRoute, fetchFn })
    ctx.effect(() => () => proxy.close(), ADAPTER.effect.proxy)
    const host = { ctx, sdk, mcpClient, now, timers, fetchFn, proxy, clientMetadataUrl: config.clientMetadataUrl }
    for (const [serverName, { spec, id, key }] of specs) {
      const server = createServer({ spec, key, routeId: id, configProblem, host })
      servers.set(serverName, server)
      byRoute.set(id, server)
      byKey.set(key, server)
      ctx.effect(() => ctx.authorization.registerFlow(server.flow), `${ADAPTER.effect.flow} ${serverName}`)
      ctx.effect(() => () => server.dispose(), `${ADAPTER.effect.server} ${serverName}`)
    }
    ctx.on('credentials/record-updated', (key) => byKey.get(key)?.onRecordUpdated())
    // A stored grant survives a restart of this DSH: loaded before the tool appears, no browser step.
    for (const server of servers.values()) await server.load()

    ctx.effect(() => ctx.tools.register(defineTool(signInTool(servers))), ADAPTER.effect.tool)
    ctx.provide(ADAPTER.service, Object.freeze({
      status: () => ({ servers: [...servers.values()].map((server) => server.status()) }),
    }))
  }
  return Object.freeze({ name, inject, Config, apply })
}

export const { apply } = createAdapterPlugin()
