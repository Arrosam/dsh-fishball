#!/usr/bin/env node
/**
 * V3-S7b probe, behind the tunnel and with the Python MCP SDK. One world per DSH version:
 * DSH with `--trusted-host fb.example`, the CIMD host, and a local TLS-terminating proxy for
 * `https://fb.example:<port>` that path-routes `/authorize*` to the approval listener and the rest to
 * DSH's listener, and injects `X-Forwarded-Proto: http` / `X-Forwarded-Host` (to prove they are
 * ignored). Runs: the stock TS client through the tunnel, raw checks (AUTH-EP-10), and the Python
 * probe on loopback and through the tunnel. Usage: node probe-tunnel.mjs <version>
 * Writes evidence-tunnel-<version>.json (redacted). Throwaway spike code.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import dns from 'node:dns'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Agent, setGlobalDispatcher } from 'undici'
import { approve, callbackParams } from './browser.mjs'
import { S7B } from './constants.mjs'
import { RUNTIME } from './launch.mjs'
import { CB_PATH, clientIdFor, makeWorldCerts, startWorld, TUNNEL_HOST } from './world.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const version = process.argv[2]
assert(S7B.versions.includes(version), 'usage: node probe-tunnel.mjs <version>')
const sdk = await import(pathToFileURL(path.join(S7B.versionsRoot, version, 'node_modules', '@modelcontextprotocol', 'client', 'dist', 'index.mjs')).href)
const { Client, ClientCredentialsProvider, StreamableHTTPClientTransport, UnauthorizedError } = sdk

const certs = makeWorldCerts()
// The probe process trusts the throwaway CA and resolves fb.example to loopback (public DNS → tunnel).
setGlobalDispatcher(new Agent({ connect: { ca: [readFileSync(certs.ca.cert)], lookup: (host, opts, cb) => (host === TUNNEL_HOST || host === 'evil.example' ? (opts?.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)) : dns.lookup(host, opts, cb)) } }))
const world = await startWorld(version, { label: 'tunnel', tunnel: true, certs, tunnelInject: { 'x-forwarded-proto': 'http', 'x-forwarded-host': 'evil.example', forwarded: 'proto=http;host=evil.example' } })
const { dsh } = world
const T = world.tunnelOrigin
const tunnelMcp = T + S7B.paths.mcp
const tunnelIssuer = T + S7B.paths.issuer

const secrets = new Map()
const remember = (value, marker) => { if (value) secrets.set(value, marker); return value }
const redact = (text) => { let out = String(text); for (const [v, m] of [...secrets].sort((a, b) => b[0].length - a[0].length)) out = out.replaceAll(v, m); return out.replaceAll(dsh.origin, '<dsh>').replaceAll(T, 'https://fb.example:<tunnel>').replace(/127\.0\.0\.1:\d{4,5}/g, '127.0.0.1:<port>') }
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

/** node:http(s) request with an explicit Host, for the Host-check rows (fetch cannot set Host). */
function rawRequest(url, { host, method = 'GET', headers = {}, body } = {}) {
  const u = new URL(url)
  const mod = u.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.request({ host: '127.0.0.1', port: u.port, path: u.pathname + u.search, method, servername: u.hostname, ca: readFileSync(certs.ca.cert), headers: { host: host ?? u.host, ...headers } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

// ---- AUTH-EP-10 and AUTH-EP-09 rows ------------------------------------------------------------------
let tunnelAsm
await check('T1 metadata under https://fb.example: issuer, canonical URI, token and authorization endpoints all https://fb.example (X-Forwarded-* ignored)', async () => {
  const prm = await (await fetch(T + S7B.paths.prmPrefix + S7B.paths.mcp)).json()
  tunnelAsm = await (await fetch(T + S7B.paths.asmPrefix + S7B.paths.issuer)).json()
  assert.equal(prm.resource, tunnelMcp)
  assert.deepEqual(prm.authorization_servers, [tunnelIssuer])
  assert.equal(tunnelAsm.issuer, tunnelIssuer)
  assert.equal(tunnelAsm.token_endpoint, T + S7B.paths.token)
  assert.equal(tunnelAsm.authorization_endpoint, T + S7B.paths.authorize)
  const loop = await (await fetch(dsh.origin + S7B.paths.asmPrefix + S7B.paths.issuer)).json()
  assert.equal(loop.issuer, dsh.origin + S7B.paths.issuer)
  assert.equal(loop.authorization_endpoint, `http://127.0.0.1:${dsh.approvalPort}${S7B.paths.authorize}`)
  return { prm, asm: tunnelAsm, loopbackIssuer: loop.issuer, loopbackAuthorizationEndpoint: loop.authorization_endpoint, forwardedHeadersSeenByDsh: 'x-forwarded-proto: http, x-forwarded-host: evil.example, forwarded: proto=http;host=evil.example' }
})

await check('T2 the same Host over plain http (tunnel host on the loopback socket) is still advertised as https; X-Forwarded-Proto: https on loopback is ignored', async () => {
  const direct = JSON.parse((await rawRequest(dsh.origin + S7B.paths.asmPrefix + S7B.paths.issuer, { host: `${TUNNEL_HOST}:${world.tunnel.port}`, headers: { 'x-forwarded-proto': 'http' } })).body)
  const loopForwarded = JSON.parse((await rawRequest(dsh.origin + S7B.paths.asmPrefix + S7B.paths.issuer, { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': TUNNEL_HOST } })).body)
  assert.equal(direct.issuer, tunnelIssuer)
  assert.equal(loopForwarded.issuer, dsh.origin + S7B.paths.issuer)
  return { tunnelHostOverHttp: direct.issuer.replace(T, 'https://fb.example:<tunnel>'), loopbackWithForwardedHttps: 'issuer stays http://127.0.0.1:<port>' }
})

await check('T3 host not in --trusted-host → 403 before authentication, on DSH routes and on the approval listener', async () => {
  const rows = {}
  for (const [label, url] of [['PRM', dsh.origin + S7B.paths.prmPrefix + S7B.paths.mcp], ['ASM', dsh.origin + S7B.paths.asmPrefix + S7B.paths.issuer], ['token', dsh.origin + S7B.paths.token], ['mcp', dsh.origin + S7B.paths.mcp], ['approval', `http://127.0.0.1:${dsh.approvalPort}${S7B.paths.authorize}?client_id=x`]]) {
    rows[label] = (await rawRequest(url, { host: 'evil.example', method: label === 'token' || label === 'mcp' ? 'POST' : 'GET' })).status
  }
  rows['via tunnel, SNI evil.example'] = (await rawRequest(`https://evil.example:${world.tunnel.port}${S7B.paths.asmPrefix}${S7B.paths.issuer}`)).status
  rows['Origin https://evil.example on token endpoint (tunnel host)'] = (await rawRequest(T + S7B.paths.token, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })).status
  for (const v of Object.values(rows)) assert.equal(v, 403)
  return rows
})

await check('T4 machine exchange through the tunnel (stock ClientCredentialsProvider, expectedIssuer https://fb.example); AT from the tunnel refused on loopback and the reverse', async () => {
  const provider = new ClientCredentialsProvider({ clientId: 'tunnel-machine', clientSecret: E.e1, expectedIssuer: tunnelIssuer })
  const transport = new StreamableHTTPClientTransport(new URL(tunnelMcp), { authProvider: provider })
  const client = new Client({ name: 'cc', version: '0' }, { capabilities: {}, versionNegotiation: { mode: { pin: S7B.protocol } } })
  await client.connect(transport)
  const paired = (await client.callTool({ name: 'pair', arguments: {} })).structuredContent
  const who = (await client.callTool({ name: 'whoami', arguments: {} })).structuredContent
  const at = remember(provider.tokens().access_token, '<at>')
  const onLoop = await fetch(dsh.origin + S7B.paths.mcp, { method: 'POST', headers: { authorization: `Bearer ${at}` }, body: '{}' })
  const loopTok = remember((await (await fetch(dsh.origin + S7B.paths.token, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`tunnel-machine:${E.e1}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', resource: dsh.origin + S7B.paths.mcp }) })).json()).access_token, '<at>')
  const onTunnel = await fetch(tunnelMcp, { method: 'POST', headers: { authorization: `Bearer ${loopTok}` }, body: '{}' })
  await client.close()
  assert.equal(onLoop.status, 401)
  assert.equal(onTunnel.status, 401)
  assert.match(onTunnel.headers.get('www-authenticate'), new RegExp(`resource_metadata="${T.replace(/[.:/]/g, '\\$&')}`))
  return { pair: paired, whoami: who, tunnelAtOnLoopback: onLoop.status, loopbackAtOnTunnel: onTunnel.status }
})

await check('T5 stock TS client: browser authorization through the tunnel (page at https://fb.example/authorize, iss https://fb.example/…)', async () => {
  const cb = await new Promise((resolve) => {
    let deliver
    const got = new Promise((r) => { deliver = r })
    const server = http.createServer((req, res) => { res.end('ok'); deliver(new URL(req.url, 'http://x').searchParams) })
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, got, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()) }) }))
  })
  const pages = []
  const provider = {
    clientMetadataUrl: clientIdFor('/cimd.json'), redirectUrl: `http://127.0.0.1:${cb.port}${CB_PATH}`,
    clientMetadata: { client_name: 'Agent W', redirect_uris: [`http://127.0.0.1:${cb.port}${CB_PATH}`], grant_types: ['authorization_code', 'refresh_token'], token_endpoint_auth_method: 'none' },
    state: () => 'tunnel-state', clientInformation() { return this._c }, saveClientInformation(c) { this._c = c },
    tokens() { return this._t }, saveTokens(t) { remember(t.access_token, '<at>'); remember(t.refresh_token, '<rt>'); this._t = t },
    async redirectToAuthorization(url) { this.url = url; const r = await approve(url, { token: E.e2, id: 'tunnel-browser', name: 'Tunnel Agent' }); pages.push(r); if (r.location) await fetch(r.location) },
    saveCodeVerifier(v) { this._v = v }, codeVerifier() { return this._v }, saveDiscoveryState(s) { this._d = s }, discoveryState() { return this._d },
  }
  const transport = new StreamableHTTPClientTransport(new URL(tunnelMcp), { authProvider: provider })
  const client = new Client({ name: 'w', version: '0' }, { capabilities: {}, versionNegotiation: { mode: { pin: S7B.protocol } } })
  await client.connect(transport).catch((e) => { assert(e instanceof UnauthorizedError, String(e)) })
  const params = await cb.got
  await cb.close()
  await transport.finishAuth(params)
  const c2 = new Client({ name: 'w', version: '0' }, { capabilities: {}, versionNegotiation: { mode: { pin: S7B.protocol } } })
  await c2.connect(new StreamableHTTPClientTransport(new URL(tunnelMcp), { authProvider: provider }))
  const who = (await c2.callTool({ name: 'whoami', arguments: {} })).structuredContent
  await c2.close()
  assert.equal(new URL(provider.url).origin, T)
  assert.equal(params.get('iss'), tunnelIssuer)
  assert.equal(provider._t.scope, S7B.scope.full)
  return { authorizationOrigin: 'https://fb.example:<tunnel>', iss: 'https://fb.example:<tunnel>/api/fishball/oauth', whoami: who, pageCacheControl: pages[0]?.headers?.['cache-control'], tunnelRouting: [...new Set(world.tunnel.seen.map((s) => `${s.path.startsWith('/authorize') ? '/authorize*' : s.path}→${s.to}`))] }
})

await check('T6 only DSH\'s listener forwarded: machine exchange works; the page is unreachable', async () => {
  world.routing.forwardApproval = false
  const page = await fetch(`${T}${S7B.paths.authorize}?client_id=${encodeURIComponent(clientIdFor('/cimd.json'))}`)
  const tok = await fetch(T + S7B.paths.token, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`tunnel-machine-2:${E.e3}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', resource: tunnelMcp }) })
  remember((await tok.clone().json()).access_token, '<at>')
  world.routing.forwardApproval = true
  assert.equal(page.status, 502)
  assert.equal(tok.status, 200)
  return { page: page.status, token: tok.status }
})

// ---- Python MCP SDK, on loopback and through the tunnel ------------------------------------------------
async function runPython(input) {
  const py = path.join(RUNTIME, 'pyenv', 'bin', 'python')
  const child = spawn(py, [path.join(HERE, 'probe_py.py')], { env: { PATH: process.env.PATH, HOME: path.join(RUNTIME, 'pyhome'), PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', (c) => { out += c })
  child.stderr.on('data', (c) => { err += c })
  child.stdin.end(JSON.stringify(input))
  const code = await new Promise((r) => child.once('exit', r))
  const line = out.trim().split('\n').at(-1)
  if (code !== 0 || !line?.startsWith('{')) throw new Error(`python exited ${code}: ${err.slice(-1500)}`)
  return { result: JSON.parse(line), stderr: err }
}

let py
await check('Y0 Python MCP SDK 2.3.0 run (loopback + tunnel)', async () => {
  const mcpUrl = dsh.origin + S7B.paths.mcp
  const run = await runPython({
    mcp: mcpUrl, issuer: dsh.origin + S7B.paths.issuer, cimd: clientIdFor('/cimd.json'), protocol: S7B.protocol,
    control: dsh.origin + S7B.paths.control, controlKey: dsh.controlKey, caFile: certs.ca.cert,
    tunnelMcp, resolve: { [TUNNEL_HOST]: '127.0.0.1' },
    tokens: { first: E.e10, second: E.e14, iss: E.e11, tunnel: E.e12, machine: E.e13 },
  })
  py = run.result
  for (const line of run.stderr.split('\n')) if (line.trim()) consoleLines.push(line)
  return { ran: true }
})
const pyCheck = (id, fn) => check(id, async () => { assert.ok(py, 'python run missing'); return fn(py) })
await pyCheck('Y1 Python: browser flow on plain-http loopback — CIMD client id, page, any-port redirect, iss + state checked, scope fishball, refresh token', (r) => {
  assert.equal(r.browser.ok, true, r.browser.error)
  assert.equal(r.browser.tokenScope, S7B.scope.full)
  assert.equal(r.browser.hasRefresh, true)
  assert.equal(r.browser.whoami.id, 'agent-p-1')
  assert.equal(r.browser.whoami.name, 'Py Agent')
  assert.notEqual(r.browser.callbackPort, 7777)
  return { tools: r.browser.tools, whoami: r.browser.whoami, pages: r.browser.pages }
})
await pyCheck('Y2 Python: expired access token → refresh grant with client_id and resource, rotated, no page', (r) => {
  assert.equal(r.browser.afterExpiry.id, 'agent-p-1')
  assert.equal(r.browser.rotated, true)
  const refresh = r.wire.find((w) => w.grant === 'refresh_token')
  assert.ok(refresh.params.includes('resource') && refresh.params.includes('client_id'))
  const code = r.wire.find((w) => w.grant === 'authorization_code')
  return { codeParams: code.params, refreshParams: refresh.params }
})
await pyCheck('Y2b Python: a server-side 401 with a locally valid token → full re-authorization (page), not a refresh', (r) => {
  assert.equal(r.server401.server401Grants.includes('refresh_token'), false)
  return { outcome: r.server401.server401Outcome, grants: r.server401.server401Grants, discoveryRequests: r.server401.server401Discovery, pages: r.server401.pages }
})
await pyCheck('Y3 Python: wrong iss refused before the code is redeemed', (r) => {
  assert.equal(r.issMismatch.ok, false)
  assert.equal(r.issMismatch.codeRedemptions, 0)
  return { error: r.issMismatch.error }
})
await pyCheck('Y4 Python: Cancel → access_denied reaches the client; re-entering a bound token → already-paired on the page', (r) => {
  assert.equal(r.cancel.ok, false)
  assert.match(r.cancel.error, /access_denied/)
  assert.equal(r.alreadyPaired.ok, false)
  assert.match(r.alreadyPaired.pages[0].alert, /already used by an agent/)
  return { cancel: r.cancel.error, alreadyPaired: r.alreadyPaired.pages[0].alert }
})
await pyCheck('Y5 Python: browser flow through the tunnel (https://fb.example)', (r) => {
  assert.equal(r.tunnel.ok, true, r.tunnel.error)
  assert.equal(r.tunnel.tokenScope, S7B.scope.full)
  return { whoami: r.tunnel.whoami, pages: r.tunnel.pages }
})
await pyCheck('Y6 Python ClientCredentialsOAuthProvider: scope=fishball narrowed to fishball:pair, no refresh token; whoami → 403 → step-up → error; after pair → full', (r) => {
  assert.equal(r.ccUnpaired.scope, S7B.scope.pair)
  assert.equal(r.ccUnpaired.hasRefresh, false)
  assert.deepEqual(r.ccUnpaired.tools, ['pair'])
  assert.ok(r.ccUnpaired.whoamiError)
  assert.equal(r.ccPair.pair.ok, true)
  return { unpaired: r.ccUnpaired, paired: { pair: r.ccPair.pair, whoami: r.ccPair.whoami, whoamiError: r.ccPair.whoamiError } }
})

await check('L1 leak check (DSH home, probe console, Python stdout/stderr)', async () => {
  const exit = await world.close()
  const hits = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name)
      const s = statSync(p)
      if (s.isDirectory()) walk(p)
      else if (name !== '.credentials.yaml') {
        const text = readFileSync(p, 'latin1')
        for (const [value, marker] of secrets) if (value.length >= 16 && text.includes(value)) hits.push(`${path.relative(dsh.home, p)}: ${marker}`)
      }
    }
  }
  walk(dsh.home)
  const pyText = JSON.stringify(py ?? {})
  for (const [value, marker] of secrets) if (value.length >= 16 && (pyText.includes(value) || consoleLines.some((l) => l.includes(value)))) hits.push(`probe output: ${marker}`)
  assert.deepEqual(hits, [])
  return { exit, secretsChecked: secrets.size, consoleWarnings: [...new Set(consoleLines.map((l) => redact(l).slice(0, 200)))].slice(0, 12) }
})

writeFileSync(path.join(HERE, `evidence-tunnel-${version}.json`), redact(JSON.stringify({ version, python: 'mcp 2.3.0', node: process.version, results }, null, 2)))
const failed = results.filter((r) => r.status !== 'pass').length
console.log(`${results.length - failed}/${results.length} pass`)
process.exit(0)
