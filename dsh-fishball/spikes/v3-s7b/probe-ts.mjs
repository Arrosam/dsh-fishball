#!/usr/bin/env node
/**
 * V3-S7b probe, stock TypeScript client: `@modelcontextprotocol/client` 2.2.0 loaded read-only from the
 * DSH version under test (`Client`, `StreamableHTTPClientTransport`, `auth()` with an app-side
 * `OAuthClientProvider`, `ClientCredentialsProvider`), against a disposable DSH running the S7b
 * prototype, plus raw HTTP for the refusal tables. Usage: node probe-ts.mjs <version>
 * Writes evidence-ts-<version>.json with every secret replaced by a marker. Throwaway spike code.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { approve, callbackParams, openPage, submit } from './browser.mjs'
import { S7B } from './constants.mjs'
import { launch } from './launch.mjs'
import { CB_PATH, clientIdFor, REGISTERED_CB_PORT, startWorld } from './world.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const version = process.argv[2]
assert(S7B.versions.includes(version), 'usage: node probe-ts.mjs <version>')
const sdk = await import(pathToFileURL(path.join(S7B.versionsRoot, version, 'node_modules', '@modelcontextprotocol', 'client', 'dist', 'index.mjs')).href)
const { Client, ClientCredentialsProvider, StreamableHTTPClientTransport, UnauthorizedError } = sdk

// ---- fixtures: a CA, a public-looking client host serving CIMD documents, the disposable DSH ---------
const world = await startWorld(version, { label: 'ts' })
const { dsh, cimdHost } = world
const clientId = clientIdFor
const callbackPorts = { registered: REGISTERED_CB_PORT }

// ---- evidence plumbing -------------------------------------------------------------------------------
const secrets = new Map()
const remember = (value, marker) => { if (value) secrets.set(value, marker); return value }
const redact = (text) => { let out = String(text); for (const [v, m] of [...secrets].sort((a, b) => b[0].length - a[0].length)) out = out.replaceAll(v, m); return out.replaceAll(dsh.origin, '<dsh>').replaceAll(`127.0.0.1:${dsh.approvalPort}`, '<approval>') }
const results = []
const consoleLines = []
for (const level of ['warn', 'error']) console[level] = (...args) => consoleLines.push(args.map(String).join(' '))
async function check(id, body) {
  const entry = { id }
  results.push(entry)
  try { entry.observed = await body(); entry.status = 'pass' } catch (error) { entry.status = 'fail'; entry.error = `${error?.name}: ${error?.message}`.slice(0, 900) }
  process.stdout.write(`${entry.status === 'pass' ? 'PASS' : 'FAIL'} ${id}${entry.error ? ` — ${redact(entry.error).slice(0, 300)}` : ''}\n`)
}
const E = Object.fromEntries(S7B.entries.map((e) => [e.key, remember(dsh.credential(e.ref), `<token:${e.key}>`)]))
const mcpUrl = dsh.origin + S7B.paths.mcp
const issuer = dsh.origin + S7B.paths.issuer
const asm = await (await fetch(dsh.origin + S7B.paths.asmPrefix + S7B.paths.issuer)).json()
const approvalOrigin = new URL(asm.authorization_endpoint).origin
const recordTokens = (t) => { remember(t?.access_token, '<at>'); remember(t?.refresh_token, '<rt>'); return t }

/**
 * App-side OAuthClientProvider for the SDK's built-in `auth()` flow: CIMD client id, loopback redirect,
 * in-memory state. This is what a host such as DSH would have to supply (DSH 0.2.x ships none, §4.1).
 */
class BrowserProvider {
  constructor({ cimdUrl, redirectPort, onRedirect }) {
    this.clientMetadataUrl = cimdUrl
    this.redirectUrl = `http://127.0.0.1:${redirectPort}${CB_PATH}`
    this._onRedirect = onRedirect
    this._state = undefined
  }
  get clientMetadata() { return { client_name: 'Agent W', redirect_uris: [this.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none' } }
  state() { this._state = `st-${Math.random().toString(36).slice(2)}`; return this._state }
  clientInformation() { return this._client }
  saveClientInformation(info) { this._client = info }
  tokens() { return this._tokens }
  saveTokens(tokens) { this._tokens = recordTokens(tokens) }
  async redirectToAuthorization(url) { this.lastAuthorizationUrl = url; await this._onRedirect?.(url) }
  saveCodeVerifier(v) { this._verifier = v }
  codeVerifier() { return this._verifier }
  saveDiscoveryState(s) { this._discovery = s }
  discoveryState() { return this._discovery }
  invalidateCredentials(scope) { if (scope === 'tokens' || scope === 'all') this._tokens = undefined }
}

/** A loopback callback listener on a free port (the "any port" case) that resolves with the redirect's query. */
function callbackListener() {
  return new Promise((resolve) => {
    let deliver
    const got = new Promise((r) => { deliver = r })
    const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); deliver(new URL(req.url, 'http://127.0.0.1').searchParams) })
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, got, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()) }) }))
  })
}

/**
 * Full browser flow through the stock transport: connect → 401 → auth() discovers PRM + ASM on DSH's
 * listener, picks the CIMD client id, opens the approval page; the scripted user approves; the
 * redirect lands on the loopback listener; transport.finishAuth(params) checks iss and redeems.
 */
async function browserConnect({ cimdPath = '/cimd.json', fields, transportOptions = {} }) {
  const cb = await callbackListener()
  const pages = []
  const provider = new BrowserProvider({
    cimdUrl: clientId(cimdPath), redirectPort: cb.port,
    onRedirect: async (url) => {
      const decided = await approve(url, fields)
      pages.push(decided)
      if (decided.location) await fetch(decided.location)   // the browser follows the redirect to the client
    },
  })
  const client = new Client({ name: 'agent-w', version: '0.0.0' }, { capabilities: {}, versionNegotiation: { mode: { pin: S7B.protocol } } })
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { authProvider: provider, ...transportOptions })
  let firstError
  try { await client.connect(transport) } catch (error) { firstError = error }
  assert(firstError instanceof UnauthorizedError, `expected UnauthorizedError before approval, got ${firstError}`)
  const params = await Promise.race([cb.got, new Promise((_, rej) => setTimeout(() => rej(new Error('no callback')), 5000))])
  await cb.close()
  await transport.finishAuth(params)
  const client2 = new Client({ name: 'agent-w', version: '0.0.0' }, { capabilities: {}, versionNegotiation: { mode: { pin: S7B.protocol } } })
  const transport2 = new StreamableHTTPClientTransport(new URL(mcpUrl), { authProvider: provider, ...transportOptions })
  await client2.connect(transport2)
  return { client: client2, transport: transport2, provider, params: Object.fromEntries(params), page: pages[0], callbackPort: cb.port }
}

const raw = (p, init) => fetch(dsh.origin + p, init)
/** node:http GET with an explicit Host header (WHATWG fetch may not override Host). Returns the status. */
const rawHost = (url, host, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET', headers: { host, ...headers } }, (res) => { res.resume(); resolve(res.statusCode) })
  req.on('error', reject); req.end()
})
const tokenForm = (fields, headers = {}) => raw(S7B.paths.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields) })
const pkce = async () => {
  const { createHash, randomBytes } = await import('node:crypto')
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}
const authUrl = (params) => { const u = new URL(asm.authorization_endpoint); for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v); return u }
const baseParams = async (over = {}) => { const p = await pkce(); return { p, params: { response_type: 'code', client_id: clientId('/cimd.json'), redirect_uri: `http://127.0.0.1:7777${CB_PATH}`, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'xyz', resource: mcpUrl, ...over } } }
/** Drive the page by hand and redeem the code with raw HTTP; returns {tokens, location}. */
async function manualCode(entryKey, id, over = {}) {
  const { p, params } = await baseParams(over)
  const decided = await approve(authUrl(params), { token: E[entryKey], id })
  const cbp = callbackParams(decided.location)
  remember(cbp.code, '<code>')
  const res = await tokenForm({ grant_type: 'authorization_code', code: cbp.code, code_verifier: p.verifier, redirect_uri: params.redirect_uri, client_id: params.client_id, resource: mcpUrl })
  return { status: res.status, tokens: recordTokens(await res.json()), cbp, p, params }
}
const mcpRaw = (at, method = 'tools/list', params = {}) => raw(S7B.paths.mcp, {
  method: 'POST', headers: { authorization: `Bearer ${at}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': S7B.protocol, 'mcp-method': method, ...(params.name ? { 'mcp-name': params.name } : {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': S7B.protocol, 'io.modelcontextprotocol/clientInfo': { name: 'raw', version: '0' }, 'io.modelcontextprotocol/clientCapabilities': {} } } }),
})
const refresh = (rt, over = {}) => tokenForm({ grant_type: 'refresh_token', refresh_token: rt, client_id: clientId('/cimd.json'), resource: mcpUrl, ...over })

// ======================================================================================================
// 1. Discovery
await check('D1 metadata: one issuer, endpoints, authorization_endpoint on the approval listener', async () => {
  const prmDoc = await (await raw(S7B.paths.prmPrefix + S7B.paths.mcp)).json()
  assert.equal(prmDoc.authorization_servers.length, 1)
  assert.equal(prmDoc.authorization_servers[0], issuer)
  assert.equal(asm.issuer, issuer)
  assert.equal(new URL(asm.token_endpoint).origin, dsh.origin)
  assert.notEqual(approvalOrigin, dsh.origin)
  assert.equal(new URL(asm.authorization_endpoint).port, String(dsh.approvalPort))
  assert.equal(asm.registration_endpoint, undefined)
  assert.deepEqual(asm.code_challenge_methods_supported, ['S256'])
  return { prm: prmDoc, asm }
})

// 2–4. Stock client: full browser flow, CIMD, S256, loopback any-port redirect, iss, state, resource, refresh
let w1
await check('B1 stock client: 401 → PRM/ASM → CIMD client_id → page → approve (id agent-w-1, no name) → finishAuth → scope fishball + refresh token', async () => {
  w1 = await browserConnect({ fields: { token: E.e1, id: 'agent-w-1', name: '' } })
  const u = w1.provider.lastAuthorizationUrl
  const q = Object.fromEntries(u.searchParams)
  assert.equal(u.origin, approvalOrigin)
  assert.equal(q.client_id, clientId('/cimd.json'))
  assert.equal(q.code_challenge_method, 'S256')
  assert.equal(q.resource, mcpUrl)
  assert.equal(q.redirect_uri, `http://127.0.0.1:${w1.callbackPort}${CB_PATH}`)
  assert.notEqual(w1.callbackPort, callbackPorts.registered)   // any-port loopback redirect accepted
  assert.equal(w1.params.iss, issuer)
  assert.equal(w1.params.state, w1.provider._state)
  const t = w1.provider.tokens()
  assert.equal(t.scope, S7B.scope.full)
  assert.ok(t.refresh_token)
  const tools = (await w1.client.listTools()).tools.map((x) => x.name).sort()
  const who = (await w1.client.callTool({ name: 'whoami', arguments: {} })).structuredContent
  assert.equal(who.id, 'agent-w-1')
  assert.equal(who.name, null)
  const st = await dsh.control('state')
  assert.equal(st.bindings.e1.binding.kind, 'browser')
  assert.equal(st.bindings.e1.binding.clientIdUrl, clientId('/cimd.json'))
  return { authorizeParams: Object.keys(q).sort(), scopeRequested: q.scope ?? null, tools, whoami: who, binding: st.bindings.e1.binding, tokenKeys: Object.keys(t).sort(), pageHeaders: { cacheControl: w1.page?.headers['cache-control'] } }
})

await check('B2 stock client: expired access token → refresh_token grant (rotated) with same client_id and resource, no page', async () => {
  const before = (await dsh.control('state')).stats.tokenForms.length
  const rt1 = w1.provider.tokens().refresh_token
  await dsh.control('expireAll')
  const who = (await w1.client.callTool({ name: 'whoami', arguments: {} })).structuredContent
  const st = await dsh.control('state')
  const forms = st.stats.tokenForms.slice(before)
  assert.equal(who.id, 'agent-w-1')
  assert.deepEqual(forms.map((f) => f.grant), ['refresh_token'])
  assert.ok(forms[0].params.includes('resource') && forms[0].params.includes('client_id'))
  assert.notEqual(w1.provider.tokens().refresh_token, rt1)
  const reuse = await refresh(rt1)
  assert.equal(reuse.status, 400)
  assert.equal((await reuse.json()).error, 'invalid_grant')
  // The chain is revoked: the live access token now gets 401 and the newest refresh token is dead.
  assert.equal((await mcpRaw(w1.provider.tokens().access_token)).status, 401)
  const rt2 = await refresh(w1.provider.tokens().refresh_token)
  assert.equal((await rt2.json()).error, 'invalid_grant')
  return { refreshForm: forms[0], reuse: 'invalid_grant', chainRevoked: true }
})

await check('B3 SDK reaction to a revoked chain: next call re-authorizes (new page), re-entering the bound token → already-paired', async () => {
  const opened = []
  w1.provider._onRedirect = async (url) => { const r = await approve(url, { token: E.e1, id: 'agent-w-1' }); opened.push(r) }
  let error
  try { await w1.client.callTool({ name: 'whoami', arguments: {} }) } catch (e) { error = e }
  assert.ok(error, 'expected the call to fail')
  assert.equal(opened.length, 1)
  assert.equal(opened[0].status, 200)
  assert.match(opened[0].alert, /already used by an agent/)
  assert.match(opened[0].alert, /ID: agent-w-1/)
  return { error: `${error.name}`, alert: opened[0].alert }
})

await check('B4 stock client: a second agent, any-port redirect, typed name; then entry disable / re-enable / delete', async () => {
  const w2 = await browserConnect({ fields: { token: E.e2, id: 'agent-w-2', name: '  Watcher   Two ' } })
  const who = (await w2.client.callTool({ name: 'whoami', arguments: {} })).structuredContent
  assert.equal(who.name, 'Watcher Two')
  const at = w2.provider.tokens().access_token
  const rt = w2.provider.tokens().refresh_token
  await dsh.control('enable', { entry: 'e2', value: false })
  assert.equal((await mcpRaw(at)).status, 401)
  assert.equal((await (await refresh(rt)).json()).error, 'invalid_grant')
  await dsh.control('enable', { entry: 'e2', value: true })
  assert.equal((await mcpRaw(at)).status, 401, 're-enable must not revive the access token')
  assert.equal((await (await refresh(rt)).json()).error, 'invalid_grant', 're-enable must not revive the refresh token')
  const stillBound = (await dsh.control('state')).bindings.e2.binding.id
  await dsh.control('delete', { entry: 'e2' })
  return { name: who.name, afterDisable: '401 / invalid_grant', afterReenable: '401 / invalid_grant', stillBoundAfterReenable: stillBound, afterDelete: (await dsh.control('state')).bindings.e2 }
})

await check('B7 stock client race, R-OA-16 as written: three concurrent calls after expiry each refresh with the same RT → reuse detection revokes the chain', async () => {
  const w = await browserConnect({ fields: { token: E.e17, id: 'agent-race' } })
  const before = (await dsh.control('state')).stats.tokenForms.length
  await dsh.control('expireAll')
  const settled = await Promise.allSettled([w.client.callTool({ name: 'whoami', arguments: {} }), w.client.callTool({ name: 'whoami', arguments: {} }), w.client.listTools()])
  const st = await dsh.control('state')
  const forms = st.stats.tokenForms.slice(before).map((f) => f.grant)
  return { outcomes: settled.map((x) => x.status === 'fulfilled' ? 'ok' : `${x.reason?.name}`), tokenRequests: forms, refreshReuse: st.stats.refused['refresh-reuse'] ?? 0, laterCall: await w.client.callTool({ name: 'whoami', arguments: {} }).then(() => 'ok', (e) => e.name) }
})

await check('B7b same race with a 10 s idempotent refresh grace (Q-S7B-1 option B): all calls succeed, chain kept, later reuse still revokes', async () => {
  await dsh.control('refreshGrace', { ms: 10_000 })
  const w = await browserConnect({ fields: { token: E.e19, id: 'agent-race-grace' } })
  const rt0 = w.provider.tokens().refresh_token
  const before = (await dsh.control('state')).stats
  await dsh.control('expireAll')
  const settled = await Promise.allSettled([w.client.callTool({ name: 'whoami', arguments: {} }), w.client.callTool({ name: 'whoami', arguments: {} }), w.client.listTools()])
  const st = (await dsh.control('state')).stats
  const later = await w.client.callTool({ name: 'whoami', arguments: {} }).then(() => 'ok', (e) => e.name)
  await dsh.control('advance', { ms: 10_001 })
  const lateReuse = (await (await refresh(rt0)).json()).error
  await dsh.control('refreshGrace', { ms: 0 })
  assert.deepEqual(settled.map((x) => x.status), ['fulfilled', 'fulfilled', 'fulfilled'])
  assert.equal(later, 'ok')
  assert.equal(lateReuse, 'invalid_grant')
  return { outcomes: settled.map((x) => x.status), tokenRequests: st.tokenForms.slice(before.tokenForms.length).map((f) => f.grant), graceReplays: (st.refused['refresh-grace-replay'] ?? 0) - (before.refused['refresh-grace-replay'] ?? 0), laterCall: later, reuseAfterWindow: lateReuse }
})

await check('B5 iss enforcement by the stock client: a wrong iss on the redirect is refused before the code is sent', async () => {
  await dsh.control('issOverride', { value: 'https://evil.example/oauth' })
  const before = (await dsh.control('state')).stats.tokenForms.length
  let error
  try { await browserConnect({ fields: { token: E.e3, id: 'agent-w-3' } }) } catch (e) { error = e }
  await dsh.control('issOverride', { value: undefined })
  const after = (await dsh.control('state')).stats.tokenForms.length
  assert.ok(error)
  assert.equal(after, before, 'no token request after a mismatched iss')
  return { error: `${error.name}: ${error.message}`.slice(0, 200), tokenRequests: after - before }
})

await check('B6 Cancel → access_denied with iss and state; nothing bound', async () => {
  const { params } = await baseParams({ client_id: clientId('/cimd.json') })
  const opened = await openPage(authUrl(params))
  const cancelled = await submit(opened, { action: 'cancel' })
  const q = callbackParams(cancelled.location)
  assert.deepEqual(q, { error: 'access_denied', state: 'xyz', iss: issuer })
  assert.equal((await dsh.control('state')).bindings.e4.binding, undefined)
  return q
})

// 2. Authorization request validation table (AUTH-DT-07) and CIMD fetch limits (AUTH-EP-08)
await check('V1 authorization request validation (AUTH-DT-07)', async () => {
  const rows = {}
  const run = async (label, over) => {
    const { params } = await baseParams(over)
    const r = await openPage(authUrl(params))
    rows[label] = r.status === 302 ? { redirect: callbackParams(r.location) } : { status: r.status, page: r.alert ?? (r.form ? 'form' : 'other'), noStore: r.headers['cache-control'] === 'no-store' }
  }
  await run('1 valid', {})
  await run('1a no state', { state: undefined })
  await run('2 http client_id', { client_id: 'http://agent.example/cimd.json' })
  await run('2 no path', { client_id: 'https://agent.example' })
  await run('2 bare id', { client_id: 'agent-a' })
  await run('3 not json', { client_id: clientId('/not-json.json') })
  await run('3 client_id mismatch', { client_id: clientId('/mismatch.json') })
  await run('3 no client_name', { client_id: clientId('/no-name.json') })
  await run('3 unreachable (404)', { client_id: clientId('/missing.json') })
  await run('3 secret auth method', { client_id: clientId('/secret.json') })
  await run('4 trailing slash', { redirect_uri: 'http://127.0.0.1:7777/cb/' })
  await run('4 other host', { redirect_uri: 'https://other.example/cb' })
  await run('4 localhost vs 127.0.0.1', { redirect_uri: 'http://localhost:7777/cb' })
  await run('4a loopback other port', { redirect_uri: 'http://127.0.0.1:50123/cb' })
  await run('4b https other port', { client_id: clientId('/https-redirect.json'), redirect_uri: 'https://app.agent.example:8443/cb' })
  await run('4b https exact', { client_id: clientId('/https-redirect.json'), redirect_uri: 'https://app.agent.example/cb' })
  await run('5 response_type token', { response_type: 'token' })
  await run('6 PKCE missing', { code_challenge: undefined, code_challenge_method: undefined })
  await run('7 PKCE plain', { code_challenge_method: 'plain' })
  await run('8 resource missing', { resource: undefined })
  await run('8 resource foreign', { resource: 'http://127.0.0.1:1/api/fishball/mcp' })
  await run('9 http non-localhost redirect registered', { client_id: clientId('/bad-http.json'), redirect_uri: 'http://agent.example/cb' })
  const expectRedirect = { '5 response_type token': 'unsupported_response_type', '6 PKCE missing': 'invalid_request', '7 PKCE plain': 'invalid_request', '8 resource missing': 'invalid_target', '8 resource foreign': 'invalid_target' }
  for (const [label, error] of Object.entries(expectRedirect)) { assert.equal(rows[label].redirect?.error, error, label); assert.equal(rows[label].redirect.iss, issuer, `${label} iss`) }
  for (const label of ['1 valid', '1a no state', '4a loopback other port', '4b https exact']) assert.equal(rows[label].page, 'form', label)
  for (const label of Object.keys(rows).filter((l) => /^(2|3|4 |4b https other|9)/.test(l))) assert.equal(rows[label].status, 400, label)
  assert.equal(rows['5 response_type token'].redirect.state, 'xyz')
  return rows
})

await check('V2 CIMD fetch limits (AUTH-EP-08)', async () => {
  const rows = {}
  const run = async (label, cid) => {
    const { params } = await baseParams({ client_id: cid })
    const r = await openPage(authUrl(params))
    rows[label] = r.form ? 'fetched' : `refused (${r.status})`
  }
  const hitsBefore = cimdHost.hits.length
  await dsh.control('clearCimdCache')
  await run('1 public host', clientId('/cimd.json'))
  await run('7 cached (max-age=60, second request)', clientId('/cimd.json'))
  await run('2 127.0.0.1 literal', 'https://127.0.0.1/cimd.json')
  await run('2 [::1] literal', 'https://[::1]/cimd.json')
  await run('2 name → 127.0.0.1', 'https://loop.example/cimd.json')
  await run('3 name → 10.0.0.7', 'https://private.example/cimd.json')
  await run('3 name → 169.254.10.10', 'https://linklocal.example/cimd.json')
  await run('3 name → fd00::1', 'https://ula.example/cimd.json')
  await run('4 public name → redirect', clientId('/redirect.json'))
  await run('6 body over 5 KiB', clientId('/big.json'))
  await run('6 slower than the bound', clientId('/slow.json'))
  const fetchedPaths = cimdHost.hits.slice(hitsBefore).map((h) => h.path)
  const st = (await dsh.control('state')).stats
  assert.equal(rows['1 public host'], 'fetched')
  assert.equal(rows['7 cached (max-age=60, second request)'], 'fetched')
  assert.equal(fetchedPaths.filter((p) => p === '/cimd.json').length, 1, 'second request served from cache')
  for (const [k, v] of Object.entries(rows)) if (!/^(1|7)/.test(k)) assert.match(v, /^refused/, k)
  assert.ok(!fetchedPaths.includes('/private.json'))
  return { rows, hostHits: fetchedPaths, refusedBeforeConnect: st.cimd.refusedBeforeConnect, refusals: Object.fromEntries(Object.entries(st.refused).filter(([k]) => k.startsWith('cimd:'))) }
})

// 3. The page (AUTH-DT-08), uniform refusal, failure limit, POST-only, no-store
await check('P1 page outcomes (AUTH-DT-08)', async () => {
  await dsh.control('resetLimits')
  // A short user-set value (TQ-4) and a disabled / deleted entry for the uniform rows.
  await dsh.control('setValue', { entry: 'e9', value: 'short-value-under-32' })
  remember('short-value-under-32', '<short>')
  const deletedValue = E.e10
  await dsh.control('delete', { entry: 'e10' })
  await dsh.control('enable', { entry: 'e11', value: false })
  // Hold names and ids: e12 machine-paired as "Fishball", id "taken-id".
  const cc = await (await tokenForm({ grant_type: 'client_credentials', resource: mcpUrl }, { authorization: `Basic ${Buffer.from(`taken-id:${E.e12}`).toString('base64')}` })).json()
  remember(cc.access_token, '<at>')
  const pairRes = await (await mcpRaw(cc.access_token, 'tools/call', { name: 'pair', arguments: { name: 'Fishball' } })).text()
  const { params } = await baseParams()
  let pageState = await openPage(authUrl(params))
  const rows = {}
  const attempt = async (label, fields) => {
    const r = await submit(pageState, { action: 'authorize', ...fields })
    rows[label] = r.location ? { redirect: Object.keys(callbackParams(r.location)).sort() } : { status: r.status, alert: r.alert, noStore: r.headers['cache-control'] === 'no-store', bodyLength: r.html.length }
    if (r.form) pageState = r
    return r
  }
  const unknown = await attempt('1 unknown value', { token: `fbt_${'A'.repeat(43)}`, id: 'agent-x' })
  const disabled = await attempt('2 disabled entry', { token: E.e11, id: 'agent-x' })
  const deleted = await attempt('3 deleted entry', { token: deletedValue, id: 'agent-x' })
  await dsh.control('resetLimits')
  const short = await attempt('4 value under 32 chars', { token: 'short-value-under-32', id: 'agent-x' })
  await attempt('10 empty field', { token: '', id: 'agent-x' })
  await attempt('6 paired to a machine client', { token: E.e12, id: 'agent-x' })
  await attempt('5b id with a dot', { token: E.e5, id: 'agent.w' })
  await attempt('5b id 65 chars', { token: E.e5, id: 'a'.repeat(65) })
  await attempt('5c id held by another entry', { token: E.e5, id: 'taken-id' })
  await attempt('5c id held by a disabled entry', { token: E.e5, id: 'agent-w-1' })
  await attempt('5e name held (case-insensitive)', { token: E.e5, id: 'agent-x', name: 'fishBALL' })
  await attempt('name invalid (65 chars)', { token: E.e5, id: 'agent-x', name: 'n'.repeat(65) })
  const bound = await attempt('5d id differing only in case + 5f whitespace name', { token: E.e5, id: 'Taken-ID', name: '   ' })
  const st = await dsh.control('state')
  // Rules 1–4 return the same text; bodies differ only by the per-render form nonce (same length).
  const uniform = [unknown, disabled, deleted, short].map((r) => r.html.replace(/name="form" value="[^"]*"/, ''))
  assert.ok(uniform.every((b) => b === uniform[0]), 'uniform invalid-token page')
  assert.equal(rows['1 unknown value'].alert, S7B.page.invalidToken)
  assert.match(rows['6 paired to a machine client'].alert, /already used by an agent.*Fishball/)
  assert.equal(rows['5b id with a dot'].alert, S7B.page.idInvalid)
  assert.equal(rows['5c id held by another entry'].alert, S7B.page.idTaken)
  assert.equal(rows['5c id held by a disabled entry'].alert, S7B.page.idTaken)
  assert.equal(rows['5e name held (case-insensitive)'].alert, S7B.page.nameTaken)
  assert.equal(rows['name invalid (65 chars)'].alert, S7B.page.nameInvalid)
  assert.ok(bound.location)
  assert.equal(st.bindings.e5.binding.id, 'Taken-ID')
  assert.equal(st.bindings.e5.binding.name, null)
  assert.equal(st.bindings.e12.binding.name, 'Fishball')
  assert.equal(st.bindings.e11.binding, undefined)
  return { rows, machinePair: JSON.parse(pairRes.match(/\{.*\}/s)?.[0] ?? '{}')?.result?.structuredContent ?? null, uniformBodies: true, e5: st.bindings.e5.binding }
})

await check('P2 failure limit shared by the page and the token endpoint', async () => {
  await dsh.control('resetLimits')
  const { params } = await baseParams()
  let pageState = await openPage(authUrl(params))
  const seq = []
  for (let i = 0; i < S7B.failureLimit.max - 2; i += 1) {
    const r = await submit(pageState, { action: 'authorize', token: `fbt_wrong_${'x'.repeat(40)}${i}`, id: 'agent-y' })
    seq.push(`page:${r.status}`); pageState = r
  }
  for (let i = 0; i < 2; i += 1) {
    const r = await tokenForm({ grant_type: 'client_credentials', resource: mcpUrl }, { authorization: `Basic ${Buffer.from('agent-y:wrong-secret-value-xxxxxxxxxxxxxxxxxxxxx').toString('base64')}` })
    seq.push(`token:${r.status}`)
  }
  const blockedPage = await submit(pageState, { action: 'authorize', token: E.e6, id: 'agent-y' })
  seq.push(`page:${blockedPage.status}`)
  const blockedToken = await tokenForm({ grant_type: 'client_credentials', resource: mcpUrl }, { authorization: `Basic ${Buffer.from(`agent-y:${E.e6}`).toString('base64')}` })
  seq.push(`token:${blockedToken.status}`)
  assert.equal(blockedPage.status, 429)
  assert.equal(blockedPage.alert, S7B.page.rateLimited)
  assert.equal(blockedToken.status, 429)
  assert.equal((await dsh.control('state')).bindings.e6.binding, undefined, 'a valid token is not accepted while limited')
  await dsh.control('advance', { ms: S7B.failureLimit.windowMs + 1 })
  await dsh.control('resetLimits')
  return { sequence: seq }
})

await check('P3 value only in the POST body; cross-site and replayed forms refused; no-store; other paths 404', async () => {
  const { params } = await baseParams()
  const opened = await openPage(authUrl(params))
  const getDecision = await fetch(`${approvalOrigin}${S7B.paths.decision}?token=${encodeURIComponent(E.e7)}&request=${opened.request}`)
  const crossOrigin = await submit(opened, { action: 'authorize', token: E.e7, id: 'agent-z' }, { origin: 'https://evil.example' })
  const crossSite = await submit(opened, { action: 'authorize', token: E.e7, id: 'agent-z' }, { extraHeaders: { 'sec-fetch-site': 'cross-site' } })
  const forged = await submit({ ...opened, form: 'forged' }, { action: 'authorize', token: E.e7, id: 'agent-z' })
  const ok = await submit(opened, { action: 'authorize', token: E.e7, id: 'agent-z' })
  const replay = await submit(opened, { action: 'authorize', token: E.e7, id: 'agent-z2' })
  const paths = {}
  for (const p of ['/', '/api/fishball/mcp', '/.well-known/oauth-authorization-server/api/fishball/oauth', '/authorize/x']) paths[p] = (await fetch(approvalOrigin + p)).status
  const foreignHost = await rawHost(authUrl(params), 'evil.example')
  const foreignHostDsh = await rawHost(new URL(dsh.origin + S7B.paths.asmPrefix + S7B.paths.issuer), 'evil.example')
  assert.equal(foreignHost, 403)
  assert.equal(foreignHostDsh, 403)
  assert.equal(getDecision.status, 404)
  assert.equal(crossOrigin.status, 403)
  assert.equal(crossSite.status, 403)
  assert.equal(forged.status, 403)
  assert.equal(ok.status, 303)
  assert.equal(replay.status, 400)   // the pending request is consumed; replays get the expiry page
  assert.equal(opened.headers['cache-control'], 'no-store')
  assert.ok(!ok.location.includes(E.e7))
  assert.ok(!opened.html.includes('fbt_'))
  return { getDecision: getDecision.status, crossOrigin: crossOrigin.status, crossSite: crossSite.status, forgedFormValue: forged.status, firstSubmit: ok.status, replayedForm: replay.status, otherPaths: paths,
    foreignHostHeader: { approval: foreignHost, dshMetadata: foreignHostDsh }, pageHeaders: { 'cache-control': opened.headers['cache-control'], 'referrer-policy': opened.headers['referrer-policy'], csp: opened.headers['content-security-policy'] } }
})

await check('P4 pending request expires after 10 min; restart loses pending requests and codes', async () => {
  const { params } = await baseParams()
  const opened = await openPage(authUrl(params))
  await dsh.control('advance', { ms: S7B.pendingLifetimeMs })
  const late = await submit(opened, { action: 'authorize', token: E.e8, id: 'agent-late' })
  const opened2 = await openPage(authUrl((await baseParams()).params))
  await dsh.control('simulateRestart')
  const afterRestart = await submit(opened2, { action: 'authorize', token: E.e8, id: 'agent-late' })
  assert.equal(late.alert, S7B.page.expired)
  assert.equal(afterRestart.alert, S7B.page.expired)
  assert.equal((await dsh.control('state')).bindings.e8.binding, undefined)
  return { at600s: late.alert, afterRestart: afterRestart.alert }
})

// 4. Codes and refresh tokens, raw HTTP (AUTH-ST-04 rows 8–11, AUTH-ST-05)
await check('C1 code: wrong verifier / redirect / client / resource; 60 s expiry; replay revokes', async () => {
  const rows = {}
  const fresh = async (key, id) => {
    const { p, params } = await baseParams()
    const decided = await approve(authUrl(params), { token: E[key], id })
    const cbp = callbackParams(decided.location)
    remember(cbp.code, '<code>')
    return { code: cbp.code, p, params }
  }
  const redeem = (c, over = {}) => tokenForm({ grant_type: 'authorization_code', code: c.code, code_verifier: c.p.verifier, redirect_uri: c.params.redirect_uri, client_id: c.params.client_id, resource: mcpUrl, ...over })
  const c = await fresh('e13', 'agent-code')
  rows['wrong verifier'] = (await (await redeem(c, { code_verifier: 'A'.repeat(43) })).json()).error
  rows['wrong redirect'] = (await (await redeem(c, { redirect_uri: 'http://127.0.0.1:7778/cb' })).json()).error
  rows['wrong client'] = (await (await redeem(c, { client_id: clientId('/other.json') })).json()).error
  rows['client secret presented (public client)'] = (await (await redeem(c, { client_secret: 'some-secret' })).json()).error
  rows['missing resource'] = (await (await redeem(c, { resource: '' })).json()).error
  const okRes = await redeem(c)
  const t = recordTokens(await okRes.json())
  rows['correct'] = { status: okRes.status, scope: t.scope, expires_in: t.expires_in, hasRefresh: Boolean(t.refresh_token) }
  rows['replay'] = (await (await redeem(c)).json()).error
  rows['AT after replay'] = (await mcpRaw(t.access_token)).status
  rows['RT after replay'] = (await (await refresh(t.refresh_token)).json()).error
  const late = await fresh('e14', 'agent-late-code')
  await dsh.control('advance', { ms: S7B.codeLifetimeMs })
  rows['redeemed at 60 s'] = (await (await redeem(late)).json()).error
  assert.equal(rows.correct.status, 200)
  assert.equal(rows.correct.scope, S7B.scope.full)
  assert.equal(rows.replay, 'invalid_grant')
  assert.equal(rows['AT after replay'], 401)
  assert.equal(rows['RT after replay'], 'invalid_grant')
  assert.equal(rows['redeemed at 60 s'], 'invalid_grant')
  return rows
})

await check('R1 refresh chain (AUTH-ST-05): rotation, other client_id, foreign resource, value change, restart, machine RT', async () => {
  const rows = {}
  const a = await manualCode('e15', 'agent-rt')
  let rt = a.tokens.refresh_token
  const r1 = recordTokens(await (await refresh(rt)).json())
  rows['1 rotate'] = { new: r1.refresh_token !== rt, scope: r1.scope }
  rows['4 other client_id'] = (await (await refresh(r1.refresh_token, { client_id: clientId('/other.json') })).json()).error
  rows['5 foreign resource'] = (await (await refresh(r1.refresh_token, { resource: 'http://127.0.0.1:1/api/fishball/mcp' })).json()).error
  rows['5 missing resource'] = (await (await refresh(r1.refresh_token, { resource: '' })).json()).error
  const r2 = recordTokens(await (await refresh(r1.refresh_token)).json())
  rows['2 rotate again after refusals'] = Boolean(r2.refresh_token)
  await dsh.control('rotate', { entry: 'e15' })
  rows['6 value changed → refresh'] = (await (await refresh(r2.refresh_token)).json()).error
  rows['6 value changed → AT'] = (await mcpRaw(r2.access_token)).status
  const d = await manualCode('e20', 'agent-rt-del')
  await dsh.control('delete', { entry: 'e20' })
  rows['6 entry deleted → refresh'] = (await (await refresh(d.tokens.refresh_token)).json()).error
  rows['6 entry deleted → AT'] = (await mcpRaw(d.tokens.access_token)).status
  const b = await manualCode('e16', 'agent-rt2')
  await dsh.control('simulateRestart')
  rows['8 restart → refresh'] = (await (await refresh(b.tokens.refresh_token)).json()).error
  const cc = recordTokens(await (await tokenForm({ grant_type: 'client_credentials', resource: mcpUrl }, { authorization: `Basic ${Buffer.from(`machine-1:${E.e3}`).toString('base64')}` })).json())
  rows['9 machine token response keys'] = Object.keys(cc).sort()
  rows['9 machine refresh_token grant'] = (await (await tokenForm({ grant_type: 'refresh_token', refresh_token: cc.access_token, client_id: 'machine-1', resource: mcpUrl })).json()).error
  assert.equal(rows['1 rotate'].new, true)
  assert.equal(rows['4 other client_id'], 'invalid_grant')
  assert.equal(rows['5 foreign resource'], 'invalid_target')
  assert.equal(rows['6 value changed → refresh'], 'invalid_grant')
  assert.equal(rows['6 value changed → AT'], 401)
  assert.equal(rows['8 restart → refresh'], 'invalid_grant')
  assert.equal(rows['6 entry deleted → refresh'], 'invalid_grant')
  assert.equal(rows['6 entry deleted → AT'], 401)
  assert.ok(!rows['9 machine token response keys'].includes('refresh_token'))
  assert.equal(rows['9 machine refresh_token grant'], 'invalid_grant')
  return rows
})

// 8. Pair-only tokens: 403 insufficient_scope; narrowing; stock CC client
await check('S1 pair-only: scope=fishball narrowed; tools/list lists pair only; other calls 403 insufficient_scope; pair upgrades', async () => {
  const basic = { authorization: `Basic ${Buffer.from(`agent-cc:${E.e4}`).toString('base64')}` }
  const narrowed = recordTokens(await (await tokenForm({ grant_type: 'client_credentials', resource: mcpUrl, scope: 'fishball' }, basic)).json())
  const unknownScope = recordTokens(await (await tokenForm({ grant_type: 'client_credentials', resource: mcpUrl, scope: 'fishball offline_access' }, basic)).json())
  const list = await (await mcpRaw(narrowed.access_token, 'tools/list')).text()
  const deny = await mcpRaw(narrowed.access_token, 'tools/call', { name: 'whoami', arguments: {} })
  const pairRes = await (await mcpRaw(narrowed.access_token, 'tools/call', { name: 'pair', arguments: {} })).text()
  const after = await mcpRaw(narrowed.access_token, 'tools/call', { name: 'whoami', arguments: {} })
  const mismatch = recordTokens(await (await tokenForm({ grant_type: 'client_credentials', resource: mcpUrl }, { authorization: `Basic ${Buffer.from(`other-id:${E.e4}`).toString('base64')}` })).json())
  const mismatchDeny = await mcpRaw(mismatch.access_token, 'tools/call', { name: 'whoami', arguments: {} })
  assert.equal(narrowed.scope, S7B.scope.pair)
  assert.equal(unknownScope.scope, S7B.scope.pair)
  assert.ok(list.includes('"pair"') && !list.includes('"whoami"'))
  assert.equal(deny.status, 403)
  assert.match(deny.headers.get('www-authenticate'), /error="insufficient_scope", scope="fishball", resource_metadata=".*", error_description="not-paired"/)
  assert.equal(after.status, 200)
  assert.equal(mismatch.scope, S7B.scope.pair)
  assert.match(mismatchDeny.headers.get('www-authenticate'), /error_description="id-mismatch"/)
  return { narrowedScope: narrowed.scope, withOfflineAccess: unknownScope.scope, tokenKeys: Object.keys(narrowed).sort(), denyHeader: redact(deny.headers.get('www-authenticate')), pairedThenFull: after.status, mismatchDescription: 'id-mismatch' }
})

await check('S2 stock ClientCredentialsProvider: pair-only → 403 → SDK step-up retries once with the same pair-only scope → surfaces 403; after pair works', async () => {
  const forms0 = (await dsh.control('state')).stats.tokenForms.length
  const provider = new ClientCredentialsProvider({ clientId: 'cc-step', clientSecret: E.e7, expectedIssuer: issuer })
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { authProvider: provider })
  const client = new Client({ name: 'cc', version: '0' }, { capabilities: {}, versionNegotiation: { mode: { pin: S7B.protocol } } })
  await client.connect(transport)
  remember(provider.tokens()?.access_token, '<at>')
  const tools = (await client.listTools()).tools.map((t) => t.name)
  let error
  try { await client.callTool({ name: 'whoami', arguments: {} }) } catch (e) { error = e }
  const forms = (await dsh.control('state')).stats.tokenForms.slice(forms0)
  assert.ok(error, 'expected a 403 to surface')
  return { tools, error: `${error.name}: ${error.message}`.slice(0, 200), tokenRequests: forms.map((f) => ({ grant: f.grant, scope: f.scope, params: f.params })) }
})

// 5. Plain HTTP on loopback with the stock client was B1 (http://127.0.0.1 AS and page). Recorded here explicitly.
await check('H1 plain-http loopback AS accepted by the stock client (assertSecureTokenEndpoint exempts loopback)', async () => {
  assert.equal(new URL(asm.token_endpoint).protocol, 'http:')
  assert.equal(new URL(asm.authorization_endpoint).protocol, 'http:')
  assert.equal(results.find((r) => r.id.startsWith('B1')).status, 'pass')
  const remote = (u) => u.replace(/127\.0\.0\.1:\d+/, 'dsh.example')
  const refused = await sdk.exchangeAuthorization(remote(issuer), { metadata: { ...asm, issuer: remote(asm.issuer), token_endpoint: remote(asm.token_endpoint) }, clientInformation: { client_id: clientId('/cimd.json') }, authorizationCode: 'x', codeVerifier: 'y', redirectUri: 'http://127.0.0.1:1/cb', iss: remote(asm.issuer) }).then(() => 'sent', (e) => e.name)
  assert.equal(refused, 'InsecureTokenEndpointError')
  return { tokenEndpoint: 'http loopback: accepted', nonLoopbackHttp: refused }
})

// ======================================================================================================
// Stock DSH MCP client (dsh-mcp-client) against the same server: a second disposable DSH with one row.
await check('M1 stock dsh-mcp-client row: no OAuth (one 401, no discovery, no token request); only a static Authorization header works', async () => {
  const row = (extra) => ({ id: 's7b-mcp-client', name: '@deepseek-ai/dsh-mcp-client', config: { transport: 'streamable-http', serverName: 'fishball', url: mcpUrl, failOnStartupError: false, reconnect: { enabled: false }, ...extra } })
  const snap = async () => { const st = (await dsh.control('state')).stats; return { r401: st.refused['401'] ?? 0, metadata: st.metadataFetches, tokens: st.tokenRequests, mcp: { ...st.mcp } } }
  const a0 = await snap()
  const plain = await launch(version, { label: 'mcp-client', extraRows: [row({})] })
  await new Promise((r) => setTimeout(r, 4000))
  await plain.stop()
  const a1 = await snap()
  // A full access token obtained out of band (machine exchange + pair), pasted as a static header.
  const basic = { authorization: `Basic ${Buffer.from(`static-row:${E.e18}`).toString('base64')}` }
  const t0 = recordTokens(await (await tokenForm({ grant_type: 'client_credentials', resource: mcpUrl }, basic)).json())
  await mcpRaw(t0.access_token, 'tools/call', { name: 'pair', arguments: {} })
  const withHeader = await launch(version, { label: 'mcp-client-header', extraRows: [row({ headers: { Authorization: `Bearer ${t0.access_token}` } })] })
  await new Promise((r) => setTimeout(r, 4000))
  const headerHomeLeak = readFileSync(path.join(withHeader.home, 's7b.patch.yml'), 'utf8').includes(t0.access_token)
  await withHeader.stop()
  const a2 = await snap()
  const calls = Object.fromEntries(Object.entries(a2.mcp).filter(([k]) => k.startsWith('static-row:')).map(([k, v]) => [k, v - (a1.mcp[k] ?? 0)]))
  assert.equal(a1.tokens - a0.tokens, 0, 'the stock row sends no token request')
  assert.equal(a1.metadata - a0.metadata, 0, 'the stock row fetches no OAuth metadata')
  assert.ok(a1.r401 - a0.r401 >= 1)
  assert.ok((calls['static-row:tools/list'] ?? 0) >= 1, 'with a static header the row lists tools')
  return { withoutHeader: { http401: a1.r401 - a0.r401, metadataFetches: a1.metadata - a0.metadata, tokenRequests: a1.tokens - a0.tokens }, withStaticBearer: { mcpCalls: calls, tokenRequests: a2.tokens - a1.tokens, accessTokenStoredInRowConfig: headerHomeLeak } }
})

// ======================================================================================================
// Leak check: every token value / AT / RT / code must be absent from DSH's logs, storage and probe console.
await check('L1 no token value, access token, refresh token or code in any file of the DSH home (except the credential store) or console', async () => {
  const stopped = await world.close()
  const hits = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name)
      const s = statSync(p)
      if (s.isDirectory()) walk(p)
      else if (name !== '.credentials.yaml' && s.size < 50_000_000) {
        const text = readFileSync(p, 'latin1')
        for (const [value, marker] of secrets) if (value.length >= 16 && text.includes(value)) hits.push(`${path.relative(dsh.home, p)}: ${marker}`)
      }
    }
  }
  walk(dsh.home)
  for (const line of consoleLines) for (const [value, marker] of secrets) if (value.length >= 16 && line.includes(value)) hits.push(`console: ${marker}`)
  assert.deepEqual(hits, [])
  return { exit: stopped, secretsChecked: secrets.size, consoleWarnings: consoleLines.map((l) => redact(l).slice(0, 240)) }
})

const evidence = { version, sdk: '@modelcontextprotocol/client 2.2.0 (installed copy, read only)', node: process.version, results }
writeFileSync(path.join(HERE, `evidence-ts-${version}.json`), redact(JSON.stringify(evidence, null, 2)))
const failed = results.filter((r) => r.status !== 'pass').length
console.log(`${results.length - failed}/${results.length} pass`)
process.exit(0)
