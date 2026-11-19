#!/usr/bin/env node
/**
 * V3-S7c probe: the adapter plugin in a disposable *client* DSH, stock `dsh-mcp-client` rows, and the
 * S7b connector prototype in a disposable *connector* DSH. Usage: node probe.mjs <version>.
 * Both DSHs run the same version. Homes live under the OS temp dir (S7_RUNTIME). Writes
 * evidence-<version>.json with every secret replaced by a marker. Throwaway spike code.
 */
import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
process.env.S7_RUNTIME ??= path.join(os.tmpdir(), 'dsh-s7c-runtime')
mkdirSync(process.env.S7_RUNTIME, { recursive: true })
const { S7B } = await import('../v3-s7b/constants.mjs')
const { launch } = await import('../v3-s7b/launch.mjs')
const { startWorld, clientIdFor } = await import('../v3-s7b/world.mjs')
const { approve } = await import('../v3-s7b/browser.mjs')
const { S7C } = await import('./constants.mjs')

const version = process.argv[2]
assert(S7B.versions.includes(version), 'usage: node probe.mjs <version>')
const hostRoot = path.join(S7B.versionsRoot, version, 'node_modules')
const hostModules = {
  sdk: path.join(hostRoot, '@modelcontextprotocol', 'client', 'dist', 'index.mjs'),
  mcpClient: path.join(hostRoot, '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js'),
}

// ---- the connector DSH (S7b prototype), with the adapter's CIMD document on the stand-in client host ---
const ADAPTER_CIMD = '/dsh-mcp-oauth-adapter.json'
const CLIENT_NAME = 'DSH MCP OAuth adapter (spike)'
const world = await startWorld(version, {
  label: 's7c-connector',
  extraDocs: { [ADAPTER_CIMD]: { body: { client_id: clientIdFor(ADAPTER_CIMD), client_name: CLIENT_NAME, redirect_uris: [`http://127.0.0.1:7777${S7C.callbackPath}`], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' } } },
})
const { dsh: connector, certs } = world
const upstream = connector.origin + S7B.paths.mcp

// ---- evidence plumbing (shared shape with S7b) ----------------------------------------------------
const secrets = new Map()
const remember = (value, marker) => { if (value) secrets.set(value, marker); return value }
/** Learn every token value the client's record store holds now, so later checks and redaction know it. */
const learnStoredTokens = (home) => {
  const text = readFileSync(path.join(home, '.credentials.yaml'), 'utf8')
  for (const m of text.matchAll(/(access_token|refresh_token):\s*(\S+)/g)) remember(m[2].replace(/^["']|["']$/g, ''), `<${m[1]}>`)
  return text
}
const redact = (text) => { let out = String(text); for (const [v, m] of [...secrets].sort((a, b) => b[0].length - a[0].length)) out = out.replaceAll(v, m); return out }
const results = []
const consoleLines = []
for (const level of ['warn', 'error']) console[level] = (...args) => consoleLines.push(args.map(String).join(' '))
async function check(id, body) {
  if (clientHome) try { learnStoredTokens(clientHome) } catch { /* not written yet */ }
  const entry = { id }
  results.push(entry)
  try { entry.observed = await body(); entry.status = 'pass' } catch (error) { entry.status = 'fail'; entry.error = `${error?.name}: ${error?.message}`.slice(0, 900) }
  process.stdout.write(`${entry.status === 'pass' ? 'PASS' : 'FAIL'} ${id}${entry.error ? ` — ${redact(entry.error).slice(0, 400)}` : ''}\n`)
}
const E = Object.fromEntries(S7B.entries.map((e) => [e.key, remember(connector.credential(e.ref), `<token:${e.key}>`)]))

// ---- the client DSH: adapter + one stock dsh-mcp-client row per mechanism ---------------------------
const ADAPTER_ROW = 'mcp-oauth-adapter'
const svc = (fn, id) => ({ __jsExpr: `mcpOAuthAdapter.${fn}('${id}')` })
const stockRow = (id, serverName, config, extra = {}) => ({
  id, name: '@deepseek-ai/dsh-mcp-client', ...extra,
  config: { transport: 'streamable-http', serverName, failOnStartupError: false, reconnect: { enabled: true, initialDelayMs: 200, maxDelayMs: 1000, maxAttempts: 3 }, ...config },
})
// Rows referencing the adapter's service inject it, so they start after it and restart with it.
const injected = { inject: ['mcpOAuthAdapter'] }
const ROWS = [
  { id: 'a1', serverName: 'fb_a1', mechanism: 'config-editor', row: null },   // lives in the profile patch (ConfigEditor-editable)
  { id: 'a2', serverName: 'fb_a2', mechanism: 'live-object', row: stockRow('mcp-a2', 'fb_a2', { url: upstream, headers: svc('headers', 'a2') }, injected) },
  { id: 'a3', serverName: 'fb_a3', mechanism: 'js-restart', row: stockRow('mcp-a3', 'fb_a3', { url: upstream, headers: svc('headers', 'a3') }, injected) },
  { id: 'c', serverName: 'fb_c', mechanism: 'proxy', row: stockRow('mcp-c', 'fb_c', { url: svc('url', 'c'), headers: svc('localHeaders', 'c') }, injected) },
  { id: 'c2', serverName: 'fb_c2', mechanism: 'child-row', row: null },   // mounted by the adapter itself
  { id: 'd', serverName: 'fb_d', mechanism: 'own-client', row: null },
]
const entryOf = (r) => r.row?.id ?? (r.id === 'a1' ? 'mcp-a1' : undefined)
const adapterConfig = {
  hostModules, clientMetadataUrl: clientIdFor(ADAPTER_CIMD), clientName: CLIENT_NAME,
  proxyMaxBodyBytes: 1_048_576, callTimeoutMs: 15_000,
  rows: ROWS.map((r) => ({ id: r.id, entry: entryOf(r), serverName: r.serverName, mechanism: r.mechanism, upstream })),
}
// An `insert` row in the profile's own patch layer, where DSH's ConfigEditor may write its config.
const profilePatch = `${JSON.stringify([{ insert: [stockRow('mcp-a1', 'fb_a1', { url: upstream, headers: {} })] }], null, 2)}\n`
let clientHome
async function startClient() {
  const client = await launch(version, {
    label: 's7c-client', home: clientHome, readyFile: S7C.spikeFile, profilePatch,
    // The adapter must trust the throwaway CA for the CIMD host only through the connector; the client
    // DSH itself talks plain-http loopback to the connector, which the SDK allows (S7b H1).
    baseRows: [{ id: ADAPTER_ROW, name: path.join(HERE, 'adapter-plugin.mjs'), config: adapterConfig }, ...ROWS.filter((r) => r.row).map((r) => r.row)],
  })
  clientHome = client.home
  const info = JSON.parse(readFileSync(path.join(client.home, S7C.spikeFile), 'utf8'))
  const control = async (action, extra = {}) => (await fetch(info.origin + info.controlPath, { method: 'POST', headers: { 'x-s7c-control': info.controlKey }, body: JSON.stringify({ action, ...extra }) })).json()
  return { ...client, info, control }
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(predicate, { timeoutMs = 15_000, stepMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await predicate()
    if (value) return value
    if (Date.now() > deadline) throw new Error('timed out waiting')
    await settle(stepMs)
  }
}
const toolsOf = async (client, serverName) => (await client.control('state')).tools.filter((t) => t.startsWith(`mcp__${serverName}__`))
const mcpStats = async () => (await connector.control('state')).stats
const tokenGrants = (stats, from) => stats.tokenForms.slice(from).map((f) => f.grant)

let client = await startClient()

// ---- 1. before authorization -------------------------------------------------------------------------
await check('N0 before authorization: stock rows get 401 and register no tools; nothing is stored', async () => {
  await settle(2000)
  const state = await client.control('state')
  assert.deepEqual(state.tools, [])
  for (const r of ROWS) assert.equal(state.rows[r.id].status, S7C.status.needsAuthorization)
  return { tools: state.tools, rows: Object.fromEntries(ROWS.map((r) => [r.id, state.rows[r.id].status])) }
})

// ---- 2. the browser flow, once per row ---------------------------------------------------------------
const firstForms = (await mcpStats()).tokenForms.length
for (const [index, r] of ROWS.entries()) {
  await check(`B-${r.id} browser flow for ${r.mechanism}: discovery, CIMD, PKCE, loopback redirect, iss/state; tools appear`, async () => {
    const { url, error } = await client.control('authorize', { row: r.id })
    assert(url, `no authorization URL: ${error}`)
    const u = new URL(url)
    const query = Object.fromEntries(u.searchParams)
    // The user approves the connector's page with a fresh connector token entry, as for any browser agent.
    const decided = await approve(u, { token: E[`e${index + 1}`], id: `dsh-${r.id}` })
    assert.equal(decided.status, 303, `page answered ${decided.status}: ${decided.alert}`)
    await fetch(decided.location)   // the browser follows the redirect to the adapter's loopback listener
    const outcome = await client.control('awaitAuthorized', { row: r.id })
    assert.equal(outcome.status, 'authorized', JSON.stringify(outcome))
    const tools = await waitFor(async () => { const t = await toolsOf(client, r.serverName); return t.length >= 2 && t })
    const call = await client.control('call', { tool: `mcp__${r.serverName}__whoami` })
    assert(call.ok, JSON.stringify(call))
    return {
      authorizeQuery: { ...query, code_challenge: '<challenge>', state: '<state>' },
      redirectHost: new URL(query.redirect_uri).host.replace(/:\d+$/, ':<os-port>'),
      tools, whoami: call.value.structuredContent,
    }
  })
}
await check('B-forms token requests: one authorization_code per row, public client, resource sent', async () => {
  const forms = (await mcpStats()).tokenForms.slice(firstForms)
  assert.equal(forms.filter((f) => f.grant === 'authorization_code').length, ROWS.length)
  for (const f of forms) assert(f.params.includes('resource') && !f.basic)
  return forms
})

// ---- 3. secure storage ---------------------------------------------------------------------------------
await check('S1 grant stored only in .credentials.yaml as records (mode 0600), refresh token never in the patch, logs or state', async () => {
  const file = path.join(client.home, '.credentials.yaml')
  const text = learnStoredTokens(client.home)
  const mode = (statSync(file).mode & 0o777).toString(8)
  assert.equal(mode, '600')
  for (const r of ROWS) assert(text.includes(`${S7C.recordScope}/${r.id}`))
  const state = JSON.stringify(await client.control('state'))
  for (const [value] of secrets) assert(!state.includes(value))
  return { mode, records: ROWS.map((r) => `${S7C.recordScope}/${r.id}`), recordKind: /kind:\s*grant/.test(text) ? 'grant' : 'unknown' }
})
await check('S2 a1 writes the access token into the profile patch (cordis.patch.yml); a2, a3, c and d do not', async () => {
  const patchText = readFileSync(path.join(client.home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
  const bearerInPatch = /Authorization:\s*Bearer\s+\S+/.test(patchText)
  assert(bearerInPatch, 'expected a1 to persist the bearer')
  const launchPatch = readFileSync(path.join(client.home, 's7b.patch.yml'), 'utf8')
  assert(!/Bearer [A-Za-z0-9_-]{20,}/.test(launchPatch))
  return { profilePatchHoldsBearer: bearerInPatch, profilePatchMode: (statSync(path.join(client.home, 'profiles', 'web', 'cordis.patch.yml')).mode & 0o777).toString(8), launchPatchHoldsBearer: false }
})
await check('S3 settings.mutate cannot write headers (not a volatile field): the Settings form API is not a path', async () => {
  const { outcome } = await client.control('settingsMutate', { row: 'a1' })
  assert.notEqual(outcome, 'accepted')
  return { outcome: redact(outcome) }
})

// ---- 4. keeping the token fresh -------------------------------------------------------------------------
await check('R1 proactive refresh before expiry: one refresh_token grant per row, tools keep working', async () => {
  const before = (await mcpStats()).tokenForms.length
  const state0 = await client.control('state')
  // Advance both clocks to inside the refresh lead (the adapter's timer is set from its own clock).
  await connector.control('advance', { ms: (S7B.accessLifetimeSeconds - S7C.refreshLeadSeconds + 10) * 1000 })
  await client.control('advance', { ms: (S7B.accessLifetimeSeconds - S7C.refreshLeadSeconds + 10) * 1000 })
  await waitFor(async () => tokenGrants(await mcpStats(), before).filter((g) => g === 'refresh_token').length >= ROWS.length, { timeoutMs: 20_000 })
  await settle(3000)
  const calls = {}
  for (const r of ROWS) calls[r.id] = (await client.control('call', { tool: `mcp__${r.serverName}__whoami` })).ok
  const state1 = await client.control('state')
  const grants = tokenGrants(await mcpStats(), before)
  assert.equal(grants.filter((g) => g === 'refresh_token').length, ROWS.length)
  for (const r of ROWS) assert(calls[r.id], `${r.id} call failed after refresh`)
  return {
    grants, calls,
    rowRestarts: Object.fromEntries(ROWS.map((r) => [r.id, state1.rows[r.id].stats.rowRestarts - state0.rows[r.id].stats.rowRestarts])),
    reuse: (await mcpStats()).refused['refresh-reuse'] ?? 0,
  }
})
await check('R2 401 path: server drops the access token early; each mechanism recovers (or not) through a public path', async () => {
  // Expire every access token on the connector; the adapter's clock still says they are valid.
  await connector.control('expireAll')
  const before = (await mcpStats()).tokenForms.length
  const state0 = await client.control('state')
  const first = {}
  for (const r of ROWS) first[r.id] = await client.control('call', { tool: `mcp__${r.serverName}__whoami` })
  await settle(3000)
  const second = {}
  for (const r of ROWS) second[r.id] = await client.control('call', { tool: `mcp__${r.serverName}__whoami` })
  const state1 = await client.control('state')
  return {
    firstCall: Object.fromEntries(Object.entries(first).map(([k, v]) => [k, v.ok ? 'ok' : redact(v.error).slice(0, 160)])),
    secondCall: Object.fromEntries(Object.entries(second).map(([k, v]) => [k, v.ok ? 'ok' : redact(v.error).slice(0, 160)])),
    refreshGrants: tokenGrants(await mcpStats(), before).filter((g) => g === 'refresh_token').length,
    adapterSaw401: Object.fromEntries(ROWS.map((r) => [r.id, (state1.rows[r.id].stats.proxy401 - state0.rows[r.id].stats.proxy401) + (state1.rows[r.id].stats.ownClient401 - state0.rows[r.id].stats.ownClient401)])),
  }
})
await check('R3 refresh race: 8 concurrent calls on an expired token (c, c2, d) refresh once each, no reuse revocation', async () => {
  await connector.control('expireAll')
  const before = await mcpStats()
  const out = {}
  for (const r of ROWS.filter((x) => ['proxy', 'child-row', 'own-client'].includes(x.mechanism))) {
    const calls = await client.control('callMany', { tool: `mcp__${r.serverName}__whoami`, n: 8 })
    out[r.id] = calls.filter((c) => c.ok).length
  }
  const after = await mcpStats()
  const refreshes = tokenGrants(after, before.tokenForms.length).filter((g) => g === 'refresh_token').length
  const reuse = (after.refused['refresh-reuse'] ?? 0) - (before.refused['refresh-reuse'] ?? 0)
  assert.equal(reuse, 0)
  assert.deepEqual(out, { c: 8, c2: 8, d: 8 })
  return { okCalls: out, refreshes, reuse }
})

await check('R4 (a) gets no 401 signal: it recovers only when the adapter\'s own expiry timer fires', async () => {
  // R2 and R3 left the a-rows on server-dead tokens. Move only the adapter's clock into the refresh lead.
  const before = (await mcpStats()).tokenForms.length
  const state0 = await client.control('state')
  await client.control('advance', { ms: (S7B.accessLifetimeSeconds - S7C.refreshLeadSeconds + 10) * 1000 })
  await waitFor(async () => tokenGrants(await mcpStats(), before).filter((g) => g === 'refresh_token').length >= ROWS.length, { timeoutMs: 20_000 })
  const calls = {}
  for (const r of ROWS) calls[r.id] = (await waitFor(async () => { const c = await client.control('call', { tool: `mcp__${r.serverName}__whoami` }); return c.ok && c }, { timeoutMs: 6_000 }).catch(() => ({ ok: false }))).ok
  const state1 = await client.control('state')
  const diag = {}
  for (const r of ROWS.filter((x) => x.id.startsWith('a'))) diag[r.id] = await client.control('rowDiag', { row: r.id })
  for (const r of ROWS.filter((x) => x.id !== 'a2')) assert(calls[r.id], `${r.id} did not recover`)
  return {
    calls, diag, refreshGrants: tokenGrants(await mcpStats(), before).length,
    rowRestarts: Object.fromEntries(ROWS.map((r) => [r.id, state1.rows[r.id].stats.rowRestarts - state0.rows[r.id].stats.rowRestarts])),
    a2LiveObjectUnreachable: state1.rows.a2.stats.liveObjectUnreachable,
  }
})

// ---- 5. restart of the client DSH: the stored grant carries over ------------------------------------------
await check('P1 client DSH restart: every row comes back from the stored grant, no browser', async () => {
  const before = (await mcpStats()).tokenForms.length
  await client.stop()
  client = await startClient()
  await settle(3000)
  const calls = {}
  for (const r of ROWS) calls[r.id] = (await client.control('call', { tool: `mcp__${r.serverName}__whoami` })).ok
  const state = await client.control('state')
  const diag = {}
  for (const r of ROWS.filter((x) => x.id.startsWith('a'))) diag[r.id] = await client.control('rowDiag', { row: r.id })
  for (const r of ROWS) assert(calls[r.id], `${r.id} did not come back: ${JSON.stringify(diag)}`)
  return { calls, diag, statuses: Object.fromEntries(ROWS.map((r) => [r.id, state.rows[r.id].status])), tokenGrants: tokenGrants(await mcpStats(), before) }
})
await check('P2 connector restart (tokens in memory, S7b TQ-5): refresh gets invalid_grant; adapter falls back to needs-authorization', async () => {
  await connector.control('simulateRestart')
  const before = (await mcpStats()).tokenForms.length
  const calls = {}
  for (const r of ROWS) calls[r.id] = await client.control('call', { tool: `mcp__${r.serverName}__whoami` })
  await settle(2000)
  const state = await client.control('state')
  return {
    calls: Object.fromEntries(Object.entries(calls).map(([k, v]) => [k, v.ok ? 'ok' : redact(v.error).slice(0, 120)])),
    statuses: Object.fromEntries(ROWS.map((r) => [r.id, state.rows[r.id].status])),
    grants: tokenGrants(await mcpStats(), before),
  }
})

await check('P3 re-authorization after P2 needs a new connector token (old entry stays bound, S7b Q-S7B-3); the row then comes back', async () => {
  const { url } = await client.control('authorize', { row: 'c' })
  const old = await approve(new URL(url), { token: E.e4, id: 'dsh-c' })
  const alreadyPaired = old.alert?.startsWith(S7B.page.alreadyPaired) === true
  const decided = await approve(new URL(url), { token: E.e10, id: 'dsh-c-2' })
  assert.equal(decided.status, 303, decided.alert)
  await fetch(decided.location)
  assert.equal((await client.control('awaitAuthorized', { row: 'c' })).status, 'authorized')
  const call = await waitFor(async () => { const c = await client.control('call', { tool: 'mcp__fb_c__whoami' }); return c.ok && c })
  return { oldTokenRefused: alreadyPaired, whoami: call.value.structuredContent }
})

// ---- 6. leak check ---------------------------------------------------------------------------------
await check('L1 no access token, refresh token, code or connector token in any file of either home (except .credentials.yaml and the a1 patch) or the probe console', async () => {
  learnStoredTokens(clientHome)
  await client.stop()
  const exit = await world.close()
  const hits = []
  const walk = (dir, base, allowed) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name)
      const s = statSync(p)
      if (s.isDirectory()) walk(p, base, allowed)
      else if (!allowed(path.relative(base, p)) && s.size < 50_000_000) {
        const text = readFileSync(p, 'latin1')
        for (const [value, marker] of secrets) if (value.length >= 16 && text.includes(value)) hits.push(`${path.relative(base, p)}: ${marker}`)
      }
    }
  }
  walk(clientHome, clientHome, (rel) => rel === '.credentials.yaml' || rel === path.join('profiles', 'web', 'cordis.patch.yml'))
  walk(connector.home, connector.home, (rel) => rel === '.credentials.yaml')
  for (const line of consoleLines) for (const [value, marker] of secrets) if (value.length >= 16 && line.includes(value)) hits.push(`console: ${marker}`)
  assert.deepEqual(hits, [])
  return { exit, secretsChecked: secrets.size, consoleWarnings: consoleLines.map((l) => redact(l).slice(0, 240)) }
})

const evidence = { version, sdk: '@modelcontextprotocol/client (installed copy, read only)', node: process.version, results }
writeFileSync(path.join(HERE, `evidence-${version}.json`), redact(JSON.stringify(evidence, null, 2)))
const failed = results.filter((r) => r.status !== 'pass').length
console.log(`${results.length - failed}/${results.length} pass`)
process.exit(0)
