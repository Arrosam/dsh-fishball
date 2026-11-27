/**
 * Oracle values of the adapter live-config cases (USE-CASES.md beside this file): R2 (the adapter's
 * Config: clientMetadataUrl string with no default, servers array of {serverName pattern required,
 * url required}, default [], both volatile, descriptions kept) and R3 (a live change of servers re-runs
 * apply: the dshConnectorAdapter service's status() lists the new servers), relayed by the lead on
 * 2026-11-22. The descriptions are the fields' text before this change (git HEAD). index.js was not
 * read; the row is created through its relayed factory createAdapterPlugin({now, timers, fetch}).
 */
export const ADAPTER_ROW = Object.freeze({
  name: 'dsh-connector-adapter',
  service: 'dshConnectorAdapter',
  tool: 'dsh_connector_sign_in',
  needsAuthorization: 'needs-authorization',
  needsConfiguration: 'needs-configuration',
  serverPattern: '^[A-Za-z0-9_-]{1,32}$',
  builtinPrefix: 'cordis:',
  loader: '@deepseek-ai/cordis-plugin-loader',
  fiberActive: 2,
})

export const FIELDS = Object.freeze({
  order: Object.freeze(['clientMetadataUrl', 'servers']),
  clientMetadataUrl: Object.freeze({ type: 'string', absent: Object.freeze(['default']), description: 'The https URL of your Client ID Metadata Document (you host it; there is no default).' }),
  servers: Object.freeze({ type: 'array', default: Object.freeze([]), description: 'The DSH connectors to sign in to: one grant and one MCP client row per entry.' }),
  serverName: Object.freeze({ type: 'string', required: true, description: 'Local name of the server; its tools appear as mcp__<serverName>__<tool>.' }),
  url: Object.freeze({ type: 'string', required: true, description: "The connector's MCP endpoint, ending in /api/agent/mcp; https, or http on a loopback host." }),
})

/** Fixture servers (test data; https on a fixture host, never contacted before a sign-in). */
export const SERVERS = Object.freeze({
  url: (name) => 'https://' + name + '.fbtest.example/api/agent/mcp',
  first: 'm',
  second: 'n2',
  third: 'o3',
  name32: 'n'.repeat(32),
  name33: 'n'.repeat(33),
  badName: 'bad name!',
  otherCimd: 'https://agent.example/fbtest-other.json',
})
