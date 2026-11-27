#!/usr/bin/env node
/**
 * V3-S7b probe, approval-port clash (R-OA-20, AUTH-DT-09 rules 3–6): a separate process holds the
 * configured approval port before DSH starts. Checks: status `approval-port-in-use` with one
 * diagnostic; metadata still lists `authorization_endpoint`; the stock TS ClientCredentialsProvider and
 * the Python ClientCredentialsOAuthProvider connect, pair and call; DSH's own UI still answers; the page
 * is unreachable (the holder answers, not the connector). Then: rule 6 (port = DSH's own web port),
 * rule 5 (rebind to a free port: metadata follows), rule 4 (holder exits, rebind on the old port).
 * Usage: node probe-clash.mjs <version>. Writes evidence-clash-<version>.json. Throwaway spike code.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { S7B } from './constants.mjs'
import { launch, RUNTIME } from './launch.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const version = process.argv[2]
assert(S7B.versions.includes(version), 'usage: node probe-clash.mjs <version>')
const sdk = await import(pathToFileURL(path.join(S7B.versionsRoot, version, 'node_modules', '@modelcontextprotocol', 'client', 'dist', 'index.mjs')).href)
const { Client, ClientCredentialsProvider, StreamableHTTPClientTransport } = sdk

/** A free loopback port, found by binding 0 and releasing it. */
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, S7B.host, () => { const { port } = s.address(); s.close(() => resolve(port)) }) })

// The "other process": a separate node child that binds the port and answers every request with its own marker.
const clashPort = await freePort()
const holder = spawn(process.execPath, ['-e', `require('http').createServer((q, r) => r.end('held-by-another-process')).listen(${clashPort}, '${S7B.host}', () => console.log('ready'))`], { stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((r) => holder.stdout.once('data', r))

const results = []
const secrets = new Map()
const remember = (v, m) => { if (v) secrets.set(v, m); return v }
const redact = (text) => { let out = String(text); for (const [v, m] of secrets) out = out.replaceAll(v, m); return out.replace(/127\.0\.0\.1:\d{4,5}/g, '127.0.0.1:<port>') }
async function check(id, body) {
  const entry = { id }
  results.push(entry)
  try { entry.observed = await body(); entry.status = 'pass' } catch (error) { entry.status = 'fail'; entry.error = `${error?.name}: ${error?.message}`.slice(0, 900) }
  process.stdout.write(`${entry.status === 'pass' ? 'PASS' : 'FAIL'} ${id}${entry.error ? ` — ${redact(entry.error).slice(0, 300)}` : ''}\n`)
}

const dsh = await launch(version, { label: 'clash', plugin: { approvalPort: clashPort } })
const E = Object.fromEntries(S7B.entries.map((e) => [e.key, remember(dsh.credential(e.ref), `<token:${e.key}>`)]))
const mcpUrl = dsh.origin + S7B.paths.mcp
const issuer = dsh.origin + S7B.paths.issuer
const asmUrl = dsh.origin + S7B.paths.asmPrefix + S7B.paths.issuer

await check('K3 port held by another process: status approval-port-in-use, one diagnostic, metadata keeps authorization_endpoint', async () => {
  const st = await dsh.control('state')
  const asm = await (await fetch(asmUrl)).json()
  assert.equal(st.approval.status, S7B.status.portInUse)
  assert.equal(st.approval.listening, false)
  assert.equal(st.approval.diagnostics.length, 1)
  assert.equal(asm.authorization_endpoint, `http://127.0.0.1:${clashPort}${S7B.paths.authorize}`)
  const page = await (await fetch(asm.authorization_endpoint)).text()
  assert.equal(page, 'held-by-another-process')
  return { status: st.approval.status, diagnostic: redact(st.approval.diagnostics[0]), authorizationEndpointListed: true, pageAnswer: page }
})

await check('K3 stock TS ClientCredentialsProvider: connect, pair, whoami while the port is taken', async () => {
  const provider = new ClientCredentialsProvider({ clientId: 'clash-ts', clientSecret: E.e1, expectedIssuer: issuer })
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { authProvider: provider })
  const client = new Client({ name: 'cc', version: '0' }, { capabilities: {}, versionNegotiation: { mode: { pin: S7B.protocol } } })
  await client.connect(transport)
  remember(provider.tokens()?.access_token, '<at>')
  const pair = (await client.callTool({ name: 'pair', arguments: {} })).structuredContent
  const who = (await client.callTool({ name: 'whoami', arguments: {} })).structuredContent
  await client.close()
  assert.equal(pair.ok, true)
  assert.equal(who.id, 'clash-ts')
  return { pair, whoami: who }
})

await check('K3 Python ClientCredentialsOAuthProvider: connect, pair, whoami while the port is taken', async () => {
  const child = spawn(path.join(RUNTIME, 'pyenv', 'bin', 'python'), [path.join(HERE, 'probe_py.py')], { env: { PATH: process.env.PATH, HOME: path.join(RUNTIME, 'pyhome'), PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', (c) => { out += c })
  child.stderr.on('data', (c) => { err += c })
  child.stdin.end(JSON.stringify({ mode: 'cc', mcp: mcpUrl, issuer, protocol: S7B.protocol, clientId: 'clash-py', tokens: { machine: E.e2 } }))
  const code = await new Promise((r) => child.once('exit', r))
  assert.equal(code, 0, err.slice(-800))
  const r = JSON.parse(out.trim().split('\n').at(-1)).cc
  assert.equal(r.ok, true, r.error)
  assert.equal(r.whoami.id, 'clash-py')
  return { tools: r.tools, scope: r.scope, pair: r.pair, whoami: r.whoami }
})

/** DSH's own web UI answers as usual: its login gate (401 without the startup ticket) and its static bundle. */
async function dshUi() {
  const root = await fetch(dsh.origin + '/')
  const body = await root.text()
  return { rootStatus: root.status, servedByDsh: !body.includes('held-by-another-process'), wwwAuthenticate: root.headers.get('www-authenticate') }
}
await check('K3 DSH\'s own web UI still answers', async () => {
  const ui = await dshUi()
  assert.ok([200, 401].includes(ui.rootStatus) && ui.servedByDsh)
  return ui
})

await check('K6 approval port equal to DSH\'s own web port → approval-port-in-use; DSH UI unaffected', async () => {
  const st = await dsh.control('rebind', { port: dsh.port })
  const asm = await (await fetch(asmUrl)).json()
  const ui = await dshUi()
  const machine = await fetch(dsh.origin + S7B.paths.token, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`clash-k6:${E.e3}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', resource: mcpUrl }) })
  remember((await machine.clone().json()).access_token, '<at>')
  assert.equal(st.approval.status, S7B.status.portInUse)
  assert.equal(new URL(asm.authorization_endpoint).port, String(dsh.port))
  assert.ok(ui.servedByDsh && [200, 401].includes(ui.rootStatus))
  assert.equal(machine.status, 200)
  return { status: st.approval.status, ui, machineExchange: machine.status }
})

await check('K5 change to a free port → rebinds, status ok, metadata follows, page answers', async () => {
  const port = await freePort()
  const st = await dsh.control('rebind', { port })
  const asm = await (await fetch(asmUrl)).json()
  const notFound = await fetch(`http://127.0.0.1:${port}/other`)
  const page = await fetch(asm.authorization_endpoint)
  assert.equal(st.approval.status, S7B.status.ok)
  assert.equal(asm.authorization_endpoint, `http://127.0.0.1:${port}${S7B.paths.authorize}`)
  assert.equal(notFound.status, 404)
  assert.equal(page.status, 400)   // the connector's page: no client_id → error on the page
  return { status: st.approval.status, followed: true, otherPath: notFound.status, pageWithoutParams: page.status }
})

await check('K4 the holder exits; rebinding the original port succeeds', async () => {
  holder.kill('SIGTERM')
  await new Promise((r) => holder.once('exit', r))
  const st = await dsh.control('rebind', { port: clashPort })
  const asm = await (await fetch(asmUrl)).json()
  assert.equal(st.approval.status, S7B.status.ok)
  assert.equal(new URL(asm.authorization_endpoint).port, String(clashPort))
  return { status: st.approval.status, note: 'the spike rebinds on a settings change; product timing (retry or next start) stays K' }
})

const exit = await dsh.stop()
if (holder.exitCode === null) holder.kill('SIGTERM')
results.push({ id: 'exit', observed: exit, status: exit.code === 0 ? 'pass' : 'fail' })
writeFileSync(path.join(HERE, `evidence-clash-${version}.json`), redact(JSON.stringify({ version, results }, null, 2)))
const failed = results.filter((r) => r.status !== 'pass').length
console.log(`${results.length - failed}/${results.length} pass`)
process.exit(0)
