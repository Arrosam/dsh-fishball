/**
 * Vocabulary for the dsh-connector-adapter cases (USE-CASES.md beside this file). The shared values
 * (K values, OAuth / MCP / HTTP words, fixtures, the K1 connector values) are declared once in
 * ../../dsh-connector-adapter/oauth-client/constants.mjs and re-exported here; this file adds only
 * the adapter's relayed contract (test brief "Relayed interface"). Nothing comes from the code.
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'

export { DSH, FIXTURE, K, K1, MARK, OAUTH, RPC, SDK, WAIT, WEB } from '../../dsh-connector-adapter/oauth-client/constants.mjs'

/** The plugin under test and its relayed named exports. */
export const ADAPTER = Object.freeze({
  task: 'C-MCP-ADAPTER',
  entry: path.join(REPO, 'packages', 'dsh-connector-adapter', 'index.js'),
  exports: Object.freeze(['name', 'inject', 'Config', 'apply', 'createAdapterPlugin']),
  name: 'dsh-connector-adapter',
  inject: Object.freeze(['credentials', 'authorization', 'tools']),
  service: 'dshConnectorAdapter',
  tool: 'dsh_connector_sign_in',
  toolParam: 'server',
  /** The credential key: scope = the plugin name, id = `server-<lowercase hex of the UTF-8 name>`. */
  keyScope: 'dsh-connector-adapter',
  /** The stock client's tool names: `mcp__<serverName>__<tool>` (dsh-mcp-client naming contract). */
  mcpTool: (serverName, tool) => `mcp__${serverName}__${tool}`,
  /** The child row's transport. */
  transport: 'streamable-http',
  /** The proxy route per server. */
  proxyRoute: (serverName) => '/mcp/server-' + Buffer.from(serverName, 'utf8').toString('hex'),
  /** `serverName`'s pattern (dsh-mcp-client): 1..32 of [A-Za-z0-9_-]. */
  serverNameMax: 32,
  /** The logger name cordis derives from the plugin's name. */
  loggerName: 'dsh-connector-adapter',
  /** The stock client's logger name (its plugin name). */
  childLoggerName: 'mcp-client',
})

/** Start refusal codes (review decision S8, 2026-11-16): `apply` rejects with an Error carrying `.code`. */
export const START_ERROR = Object.freeze({ insecureUrl: 'insecure-server-url', duplicate: 'duplicate-server' })

/** States per server (R-OA-21; K: END = needs-authorization). */
export const STATE = Object.freeze({
  needsConfiguration: 'needs-configuration',
  needsAuthorization: 'needs-authorization',
  authorizing: 'authorizing',
  authorized: 'authorized',
  failed: 'failed',
})
export const END = STATE.needsAuthorization

/** `reason` of `needs-configuration` and `failed` (relayed). */
export const REASON = Object.freeze({
  missing: 'client-metadata-url-missing',
  invalid: 'client-metadata-url-invalid',
  notDsh: 'not-a-dsh-connector',
  discoveryFailed: 'discovery-failed',
  authorizationFailed: 'authorization-failed',
})

/** The sign-in tool's result `status` values (relayed). */
export const RESULT = Object.freeze({
  authorized: 'authorized',
  /** S3 (review decision 2026-11-16): the attempt ended before its approval URL was known. */
  needsAuthorization: 'needs-authorization',
  approvalUrl: 'approval-url',
  needsConfiguration: 'needs-configuration',
  failed: 'failed',
  unknownServer: 'unknown-server',
})

/**
 * What the `approval-url` message must tell the user (R-OA-21 rule 4, design §5.5b: "open it in your
 * browser and enter a token from the connector's settings"); matched by meaning, not wording.
 */
export const APPROVAL_MESSAGE = Object.freeze([/browser/i, /token/i, /setting/i])

/** Hop-by-hop request headers the proxy must not forward (AUTH-EP-14 row 7), with fixture values. */
export const HOP = Object.freeze({
  /** A custom header the `connection` header names (RFC 9110 §7.6.1: it is hop-by-hop too). */
  named: 'x-fbtest-hop',
  headers: Object.freeze({
    'keep-alive': 'timeout=5',
    upgrade: 'h2c',
    te: 'trailers',
    trailer: 'x-fbtest-trailer',
    'proxy-authorization': 'Basic ZmJ0ZXN0OnByb3h5',
  }),
  /** The end-to-end MCP header sent beside them, which the connector needs (a control: forwarding works). */
  endToEnd: 'mcp-protocol-version',
})

/** Fixture servers and settings of the adapter rows (test data). */
export const ROWS = Object.freeze({
  m: 'm',
  x: 'x',
  /** AUTH-EP-12 rows 3–6: invalid settings. */
  invalidUrls: Object.freeze([
    [3, 'not a URL', 'fb-adapter'],
    [4, 'http: with a path', 'http://agent.example/fb-adapter.json'],
    [5, 'https: with the root path', 'https://agent.example/'],
    [6, 'https: with no path', 'https://agent.example'],
  ]),
  /** A fake caller-provided Authorization for EP-14 row 6. */
  callerToken: 'fbtest-caller-own-token',
  /** A tool-call JSON-RPC id range for raw proxy requests. */
  rawId: 9000,
  /** A server name of exactly 32 and of 33 characters (BVA). */
  name32: 'n'.repeat(32),
  name33: 'n'.repeat(33),
  /** UC-12 step 8: lifetimes walked through on the fake clock. */
  lifetimes: 3,
  /** S8 EP: server URLs (`{port}` is replaced by a loopback port). */
  serverUrls: Object.freeze({
    ok: Object.freeze([
      ['https', 'https://example.com/api/agent/mcp'],
      ['http 127.0.0.1', 'http://127.0.0.1:{port}/api/agent/mcp'],
      ['http localhost', 'http://localhost:{port}/api/agent/mcp'],
      ['http [::1]', 'http://[::1]:{port}/api/agent/mcp'],
    ]),
    refused: Object.freeze([
      ['http on a public host', 'http://example.com/api/agent/mcp'],
      ['ftp', 'ftp://example.com/api/agent/mcp'],
      ['not a URL', 'not a url'],
    ]),
  }),
  /** UC-12 A4: concurrent calls on a dead access token. */
  concurrentCalls: 8,
  /** E1 / ST-19: how far the clock is moved to prove "no further refresh". */
  quietHours: 6,
  hourMs: 3600 * 1000,
})

/** `lsof` lists this process's listening TCP sockets (EP-14 row 8, ST-07 row 2). */
export const LSOF = Object.freeze({
  bin: '/usr/sbin/lsof',
  args: (pid) => ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-Fn'],
})

/** X-SEC rows (xsec-cases.mjs; x-sec-audit.md X-05/06/07/13, relayed 2026-11-17). Fixture data and wire words. */
export const XSEC = Object.freeze({
  id: Object.freeze({ x05: 'X-SEC X-05', x06: 'X-SEC X-06', x07: 'X-SEC X-07', x13: 'X-SEC X-13' }),
  httpRemote: 'http://agent.example',
  localhostName: 'https://fbtest.localhost',
  /** RFC 8414 `code_challenge_methods_supported`, and a method that is not S256. */
  pkceField: 'code_challenge_methods_supported',
  plainMethod: 'plain',
  whoami: 'whoami',
})
