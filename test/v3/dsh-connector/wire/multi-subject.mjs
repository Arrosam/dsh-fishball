/** MULTI-2 requirements-only system assertions. See README-MULTI-2.md for rows and rationale. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { until } from '../../../support/util.mjs'
import { BUDGET, ENV, FILES, FIXTURE, HTTP, K1, SURFACE } from './constants.mjs'
import { scenario, sdkClient } from './world.mjs'
import { MULTI as M } from './multi-constants.mjs'

export const clientInfo = Object.freeze({ name: 'multi-black-box', version: '1.0.0' })
let counter = 0
export const freshClientId = (kind = M.idPrefix) => `${kind}-${process.pid}-${++counter}`
export const quiet = () => new Promise((resolve) => setTimeout(resolve, BUDGET.quietMs))
export const eventually = async (predicate, label) => assert.ok(await until(predicate, BUDGET.readyMs, BUDGET.pollMs), label)
export const multiWorld = (sdk) => scenario(sdk, M.scenario, {
  env: { [ENV.extension]: path.join(import.meta.dirname, 'multi-extension.mjs') },
})

export async function saveName(w, value) {
  const op = value === undefined ? { op: 'unset', path: ['approval', 'dshName'] } : { op: 'set', path: ['approval', 'dshName'], value }
  const saved = await w.call('settingsMutate', { ops: [op] })
  assert.equal(saved.ok, true, 'native settings rejected the configured name: ' + JSON.stringify(saved))
}
export const info = (discovery) => {
  assert.equal(discovery.serverInfo, undefined, 'legacy top-level serverInfo must not substitute for standard metadata')
  const implementation = discovery._meta?.[M.infoKey]
  assert.equal(typeof implementation?.name, 'string', 'server/discover lacks standard Implementation.name')
  assert.equal(typeof implementation?.version, 'string', 'server/discover lacks standard Implementation.version')
  return implementation
}
const version = () => JSON.parse(fs.readFileSync(FILES.manifest, 'utf8')).version
export const expectedInfo = (name) => ({ name: name + M.suffix, version: version() })
export const discovered = async (client) => info(await client.discover({ timeout: BUDGET.rpcMs }))
export async function identity(client) {
  // Cacheable SDK verbs require a fresh read to test the server's live getter, not client cache.
  const answer = await client.readResource({ uri: M.identityUri }, { timeout: BUDGET.rpcMs, cacheMode: 'refresh' })
  assert.equal(answer.contents.length, 1, 'identity resource must be a real single Implementation document')
  const [content] = answer.contents
  assert.equal(content.uri, M.identityUri)
  assert.equal(content.mimeType, M.mimeType)
  return JSON.parse(content.text)
}
export const toolDefinitions = async (client) => (await client.listTools({}, { timeout: BUDGET.rpcMs, cacheMode: 'refresh' })).tools

/** Ordinary owner-issued credential and installed SDK; observe network, never connector internals. */
export async function observer(t, w, filter) {
  const made = await w.owner('POST', SURFACE.route.create, { label: M.label })
  assert.equal(made.status, HTTP.ok, made.text)
  assert.equal(made.json?.ok, true, made.text)
  const { Client, ClientCredentialsProvider, StreamableHTTPClientTransport } = await sdkClient(w.sdk)
  const urls = w.urls()
  const requests = []
  const notices = []
  const toolHints = []
  const provider = new ClientCredentialsProvider({ clientId: freshClientId(), clientSecret: made.json.value, expectedIssuer: urls.issuer })
  const transport = new StreamableHTTPClientTransport(new URL(urls.resource), {
    authProvider: provider,
    fetch: async (input, init) => {
      let message
      try { message = JSON.parse(init?.body) } catch { /* OAuth metadata/token HTTP is not MCP. */ }
      requests.push({ url: String(input), method: message?.method ?? null })
      return fetch(input, init)
    },
  })
  const client = new Client(clientInfo, { capabilities: {}, versionNegotiation: { mode: { pin: K1.PROTOCOL.version } } })
  client.setNotificationHandler(M.updated, (notice) => notices.push(notice))
  client.setNotificationHandler(M.toolsChanged, (notice) => toolHints.push(notice))
  await client.connect(transport, { timeout: BUDGET.rpcMs })
  const paired = await client.callTool({ name: K1.TOOL.pair, arguments: {} }, undefined, { timeout: BUDGET.rpcMs })
  assert.equal(paired.structuredContent?.ok, true, JSON.stringify(paired))
  t.after(() => client.close().catch(() => {}))
  let subscription
  if (filter !== undefined) subscription = await client.listen(filter, { timeout: BUDGET.rpcMs })
  return { client, transport, requests, notices, toolHints, made: made.json, get subscription() { return subscription }, async reopen() { subscription = await client.listen(filter, { timeout: BUDGET.rpcMs }); return subscription } }
}
export const identityNotices = (o) => o.notices.filter((n) => n.params.uri === M.identityUri)
export const bothResources = Object.freeze({ resourceSubscriptions: [K1.RESOURCE.events.uri, M.identityUri] })
export function assertStandardIdentityHint(notice) {
  assert.equal(notice.method, M.updated)
  // MCP 2026-07-28 requires the SDK to stamp the originating listen request ID in _meta.
  // That transport routing metadata is not an identity payload; forbid all custom business fields.
  const { _meta, ...payload } = notice.params
  assert.deepEqual(payload, { uri: M.identityUri }, 'identity hint must contain only standard {uri}, never a custom name/version payload')
  assert.ok(_meta && typeof _meta === 'object', 'stream notification lacks standard subscription routing metadata')
  assert.deepEqual(Object.keys(_meta), [M.subscriptionKey], 'identity hint added nonstandard notification metadata')
  assert.ok(typeof _meta[M.subscriptionKey] === 'string' || typeof _meta[M.subscriptionKey] === 'number', 'subscription ID must retain the originating JSON-RPC ID type')
}
export async function oauthSnapshot(w) {
  const paths = [K1.PATHS.protectedResourcePrefix + K1.PATHS.mcp, K1.PATHS.authorizationServerPrefix + K1.PATHS.issuer]
  const documents = []
  for (const endpoint of paths) {
    const response = await w.raw('GET', endpoint)
    assert.equal(response.status, HTTP.ok, response.text)
    documents.push(response.json)
  }
  return documents
}
