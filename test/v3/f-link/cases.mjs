/**
 * F-LINK black-box cases (v3-tasks.md row F-LINK; v3-remaining-plan.md W2): REM-UC-02 (Fishball
 * side), REM-EP-01 and REM-DT-01 (docs/test-design/v3/09-standalone-remote.md), plus the row's
 * definition of done: "core never sends a token to another origin; it refuses plain http: to
 * non-loopback targets itself" (R-FB-04; spike V3-S7 §4.4), the modern-only pin (R-CON-01, Q12)
 * and the vendored `./mcp-schema` (design §9.1). Requirements R-FB-03, R-FB-04, R-REM-04, R-CON-04,
 * R-CON-05.
 *
 * Techniques: Use Case first (REM-UC-02 main flow, A1 and postconditions; each test names its
 * step), then EP (REM-EP-01, one test per row) and Decision Table (REM-DT-01, one test per rule).
 * The definition-of-done rows are EP over where a credential may go.
 *
 * Level: unit, as the cases say ("one module with fakes"): core's link module (link-driver.mjs
 * names its assumed entry) against a fake connector on loopback (fake-connector.mjs) that speaks
 * K1's frozen surface, with every outbound attempt of this process recorded (net-probe.mjs). Rows
 * that need a later task are `todo` and name it. Every tunable value is K1's (constants.mjs).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { caseTest } from '../shared/cases.mjs'
import { SDK, V3 } from '../shared/constants.mjs'
import { readManifest } from '../shared/packages.mjs'
import { specifiers } from '../k3/declarations.mjs'
import {
  ANSWER, CLIENT_PIN, CODE, DISCONNECTED, HARNESS, K1, LATER, LINK, OFFER, OFFER_PAYLOAD, PRINCIPAL, RPC, SETTLEMENT_PAYLOAD, STATE,
  STOPPING_TOOLS, TARGET, VENDOR, WEB, mcpUrl,
} from './constants.mjs'
import { MODE, freePort, mailboxEvent, startFakeConnector, startRecorder } from './fake-connector.mjs'
import { defer, openLink, untilState, untilTrue } from './link-driver.mjs'
import { watchNetwork } from './net-probe.mjs'

const JS = /\.(?:c|m)?js$/
const MCP_CLIENT = CLIENT_PIN.name
const CONNECTOR_PREFIX = V3.connector.name

/** A fake connector stopped after the test. */
async function fake(t, options = {}) {
  const f = await startFakeConnector({ clientId: PRINCIPAL.clientId, secret: PRINCIPAL.secret, ...options })
  defer(t, () => f.stop())
  return f
}
/** A link to `url` as the cases' principal; `secret` defaults to the accepted one. */
const link = (t, sdk, url, secret = PRINCIPAL.secret) => openLink(t, sdk, { url, clientId: PRINCIPAL.clientId, secret })
/** A connected link to a fresh fake connector on 127.0.0.1. */
async function connected(t, sdk, options) {
  const f = await fake(t, options)
  const l = await link(t, sdk, mcpUrl(K1.HOSTS.loopbackScheme, TARGET.anyLoopback, f.port))
  await untilState(l, STATE.connected)
  return { f, l }
}

/** Every recorded request carrying the secret anywhere (header, path, query or body). */
const carryingSecret = (requests, secret = PRINCIPAL.secret) => requests.filter((r) => {
  const basic = Buffer.from(`${PRINCIPAL.clientId}:${secret}`).toString('base64')
  const text = JSON.stringify(r)
  return text.includes(secret) || text.includes(basic) || text.includes(encodeURIComponent(secret))
})
/** Listen streams opened on the events resource (R-CON-04, CONNECTED). */
const eventListens = (f) => f.listens.filter((l) => (l.filter.resourceSubscriptions ?? []).includes(K1.CONNECTED.listenResource))

/** A refused target: nothing reaches `host`, and the link never reports connected (REM-EP-01 rows 6–8). */
async function assertRefusedBeforeAnyRequest(t, sdk, url, host) {
  const net = await watchNetwork(HARNESS)
  const l = await link(t, sdk, url)
  await sleep(HARNESS.quietMs)
  const reached = host === undefined ? net.all() : net.to(host)
  assert.deepEqual(reached, [], `the link reached the network for ${JSON.stringify(url)}: ${JSON.stringify(reached)}`)
  assert.notEqual(l.status()?.state, STATE.connected, `a refused target reports ${JSON.stringify(l.status())}`)
  // The refusal's code is owned by K1 TARGET_CODE (09 row 8); any code is accepted here, but there must be one.
  assert.ok(l.status()?.state, `no target status for a refused target: ${JSON.stringify(l.status())}`)
}

/** Core's own source files under `dir` (relative), JS only. */
const sourceFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => JS.test(f)) : [])
/** Every regular file under `dir`, as sorted paths relative to it ([] when `dir` is missing). */
const treeFiles = (dir) => (fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name))).sort()
  : [])

export function registerFLinkCases(sdk) {
  // ---------------------------------------------------------------- REM-UC-02 (Use Case, first)
  caseTest(sdk, 'REM-UC-02', 'precondition', 'on connect the link opens one agent-events listen stream and polls the inbox once', async (t) => {
    const { f } = await connected(t, sdk)
    assert.ok(await untilTrue(() => eventListens(f).length > 0), `no subscriptions/listen on ${K1.CONNECTED.listenResource}: ${JSON.stringify(f.listens)}`)
    assert.ok(await untilTrue(() => f.callsOf(K1.TOOL.inboxPoll).length > 0), 'no inbox_poll after connect')
    await sleep(HARNESS.quietMs)
    assert.equal(f.callsOf(K1.TOOL.inboxPoll).length, 1, 'polls on one connect with no hint (design §6.3: poll once)')
  })

  caseTest(sdk, 'REM-UC-02', 'main 1–2', 'the network drops: the link settles nothing by itself and stops no session', async (t) => {
    const { f, l } = await connected(t, sdk)
    f.enqueue(mailboxEvent(1, K1.EVENT_TYPE.permission, OFFER_PAYLOAD, OFFER))
    await f.drop()
    await untilState(l, STATE.unreachable)
    assert.equal(l.status().code, CODE.unreachable)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(f.callsOf(K1.TOOL.approvalAnswer), [], 'the link answered an offer on its own (R-CON-05: no timer settles it)')
  })

  caseTest(sdk, 'REM-UC-02', 'main 3', `an answer attempted while the link is down resolves ${DISCONNECTED} and sends nothing`, async (t) => {
    const { f, l } = await connected(t, sdk)
    await f.drop()
    await untilState(l, STATE.unreachable)
    const before = f.requests.length
    const result = await l.call(K1.TOOL.approvalAnswer, ANSWER)
    assert.equal(result?.ok, false, `answer while down: ${JSON.stringify(result)}`)
    assert.equal(result.code, DISCONNECTED)
    assert.equal(f.requests.length, before, 'a request reached the (dropped) target')
  })

  caseTest(sdk, 'REM-UC-02', 'main 4', 'the link returns: core re-listens, polls once and its answer is sent', async (t) => {
    const { f, l } = await connected(t, sdk)
    await untilTrue(() => f.callsOf(K1.TOOL.inboxPoll).length > 0)
    const listensBefore = eventListens(f).length
    const pollsBefore = f.callsOf(K1.TOOL.inboxPoll).length
    await f.drop()
    await untilState(l, STATE.unreachable)
    f.enqueue(mailboxEvent(1, K1.EVENT_TYPE.permission, OFFER_PAYLOAD, OFFER))
    await f.restore()
    await untilState(l, STATE.connected)
    assert.ok(await untilTrue(() => eventListens(f).length > listensBefore), 'no new listen stream after the link returned')
    assert.ok(await untilTrue(() => f.callsOf(K1.TOOL.inboxPoll).length > pollsBefore), 'no inbox_poll after the link returned')
    await sleep(HARNESS.quietMs)
    assert.equal(f.callsOf(K1.TOOL.inboxPoll).length - pollsBefore, 1, 'polls on one reconnect with no hint')
    const result = await l.call(K1.TOOL.approvalAnswer, ANSWER)
    assert.equal(result?.ok, true, `answer after the link returned: ${JSON.stringify(result)}`)
    assert.deepEqual(f.callsOf(K1.TOOL.approvalAnswer).map((c) => c.args), [ANSWER])
  })

  caseTest(sdk, 'REM-UC-02', 'main 4 (delivery)', 'the offer polled after the link returns reaches core\'s dispatch exactly once', null, LATER.intercept)
  caseTest(sdk, 'REM-UC-02', 'A1', 'the user answered in S1 while F was offline: F later gets the settlement', null, LATER.intercept)

  caseTest(sdk, 'REM-UC-02', 'post', 'across a drop and a return the link calls no tool that stops or releases a session', async (t) => {
    const { f, l } = await connected(t, sdk)
    f.enqueue(mailboxEvent(1, K1.EVENT_TYPE.permission, OFFER_PAYLOAD, OFFER))
    await f.drop()
    await untilState(l, STATE.unreachable)
    f.enqueue(mailboxEvent(2, K1.EVENT_TYPE.settlement, SETTLEMENT_PAYLOAD))
    await f.restore()
    await untilState(l, STATE.connected)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(f.calls.filter((c) => STOPPING_TOOLS.includes(c.name)), [], 'R-REM-04: losing the link never stops a managed session')
  })

  // ---------------------------------------------------------------- REM-EP-01 (Equivalence Partitioning)
  caseTest(sdk, 'REM-EP-01', 1, 'a blank target is target-unset and opens no connection', async (t) => {
    const net = await watchNetwork(HARNESS)
    const l = await link(t, sdk, TARGET.blank)
    await untilState(l, STATE.unset)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(net.all(), [], 'a blank target reached the network')
  })

  for (const host of K1.HOSTS.loopbackNames) {
    caseTest(sdk, 'REM-EP-01', `${TARGET.loopbackRows} (${host})`, `http://${host}:port${K1.PATHS.mcp} is allowed (loopback) and connects`, async (t) => {
      const f = await fake(t)
      const l = await link(t, sdk, mcpUrl(K1.HOSTS.loopbackScheme, host, f.port))
      await untilState(l, STATE.connected)
      assert.equal(l.status().code, null)
      assert.ok(f.tokenRequests().length > 0, 'connected without a token request')
    })
  }

  caseTest(sdk, 'REM-EP-01', 5, `${K1.HOSTS.remoteScheme}//${TARGET.remoteHost}/… is allowed: the link tries it (and finds it unreachable)`, async (t) => {
    const net = await watchNetwork(HARNESS)
    const l = await link(t, sdk, mcpUrl(K1.HOSTS.remoteScheme, TARGET.remoteHost))
    // `.example` never resolves (RFC 2606), so an allowed target can only end unreachable here.
    await untilState(l, STATE.unreachable)
    assert.ok(net.to(TARGET.remoteHost).length > 0, `an https target was refused without being tried: ${JSON.stringify(net.all())}`)
  })

  const REFUSED_ROWS = [
    [6, mcpUrl(K1.HOSTS.loopbackScheme, TARGET.remoteHost), TARGET.remoteHost, 'plain http to a non-loopback name'],
    [7, mcpUrl(K1.HOSTS.loopbackScheme, TARGET.privateHost), TARGET.privateHost, 'plain http to a private address'],
    ['8 (ftp)', mcpUrl(TARGET.ftpScheme, TARGET.remoteHost), TARGET.remoteHost, 'an ftp: URL'],
    ['8 (malformed)', TARGET.malformed, undefined, 'a malformed URL'],
  ]
  for (const [row, url, host, what] of REFUSED_ROWS) {
    caseTest(sdk, 'REM-EP-01', row, `${what} is refused by core before any request: no lookup, no TCP connection, not connected`, (t) => assertRefusedBeforeAnyRequest(t, sdk, url, host))
  }

  // ---------------------------------------------------------------- REM-DT-01 (Decision Table)
  caseTest(sdk, 'REM-DT-01', 'rule 1', 'target not set → target-unset', async (t) => {
    const l = await link(t, sdk, TARGET.blank)
    await untilState(l, STATE.unset)
  })

  caseTest(sdk, 'REM-DT-01', 'rule 2', `set, not reachable → target-unreachable (${CODE.unreachable})`, async (t) => {
    const l = await link(t, sdk, mcpUrl(K1.HOSTS.loopbackScheme, TARGET.anyLoopback, await freePort()))
    const status = await untilState(l, STATE.unreachable)
    assert.equal(status.code, CODE.unreachable)
  })

  caseTest(sdk, 'REM-DT-01', 'rule 3', 'reachable, no token configured → target-unset (K3 PROPOSED), and no token request is sent', async (t) => {
    const f = await fake(t)
    const l = await link(t, sdk, mcpUrl(K1.HOSTS.loopbackScheme, TARGET.anyLoopback, f.port), HARNESS.noSecret)
    await untilState(l, STATE.unset)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(f.tokenRequests(), [], 'a token request was sent with no token configured')
  })

  caseTest(sdk, 'REM-DT-01', 'rule 4', `token not accepted → token-refused (${CODE.refused})`, async (t) => {
    const f = await fake(t)
    const l = await link(t, sdk, mcpUrl(K1.HOSTS.loopbackScheme, TARGET.anyLoopback, f.port), PRINCIPAL.wrongSecret)
    const status = await untilState(l, STATE.refused)
    assert.equal(status.code, CODE.refused)
  })

  caseTest(sdk, 'REM-DT-01', 'rule 5', 'token accepted → connected, no code', async (t) => {
    const { l } = await connected(t, sdk)
    assert.equal(l.status().code, null)
  })

  caseTest(sdk, 'REM-DT-01', 'rule 6', `a V2 connector (404 on the route) → ${CODE.incompatible}`, async (t) => {
    const f = await fake(t, { mode: MODE.v2 })
    const l = await link(t, sdk, mcpUrl(K1.HOSTS.loopbackScheme, TARGET.anyLoopback, f.port))
    // K3 child.d.ts: "target-unreachable: the target did not answer, or is not a V3 connector".
    const status = await untilState(l, STATE.unreachable)
    assert.equal(status.code, CODE.incompatible)
  })

  // ---------------------------------------------------------------- F-LINK definition of done
  caseTest(sdk, 'F-LINK', 'done 1', 'the secret goes only to the target\'s token endpoint; MCP requests carry only the access token', async (t) => {
    const { f } = await connected(t, sdk)
    const withSecret = carryingSecret(f.requests)
    assert.ok(withSecret.length > 0, 'no request carried the secret (connected without client credentials?)')
    assert.deepEqual(withSecret.filter((r) => r.path !== K1.PATHS.token || r.method !== WEB.post).map((r) => `${r.method} ${r.path}`), [], 'the secret went elsewhere than POST token')
    assert.deepEqual(withSecret.filter((r) => r.query !== ''), [], 'the secret was put in a URL query')
    const mcp = f.requests.filter((r) => r.path === K1.PATHS.mcp)
    assert.ok(mcp.length > 0, 'no MCP request')
    assert.ok(mcp.some((r) => r.headers.authorization?.startsWith(WEB.bearer)), 'no MCP request carried a bearer access token')
    // An unauthenticated first request (answered 401 with the challenge) is allowed; any other scheme is not.
    assert.deepEqual(mcp.filter((r) => r.headers.authorization !== undefined && !r.headers.authorization.startsWith(WEB.bearer)).map((r) => r.headers.authorization.split(' ')[0]), [], 'an MCP request carried a non-bearer credential')
  })

  caseTest(sdk, 'F-LINK', 'done 2 (REM-UC-01 E4)', 'the target redirects to another origin: no credential reaches that origin', async (t) => {
    const other = await startRecorder()
    defer(t, () => other.stop())
    // Another origin: the same loopback port space under a different name (origins differ by host).
    const f = await fake(t, { mode: MODE.redirect, redirectTo: other.origin(TARGET.otherLoopback) + K1.PATHS.mcp })
    await link(t, sdk, mcpUrl(K1.HOSTS.loopbackScheme, TARGET.anyLoopback, f.port))
    await untilTrue(() => f.requests.some((r) => r.path === K1.PATHS.mcp))
    await sleep(HARNESS.quietMs)
    assert.deepEqual(other.requests.filter((r) => r.headers.authorization !== undefined), [], 'an Authorization header followed the redirect')
    assert.deepEqual(carryingSecret(other.requests), [], 'the secret followed the redirect')
  })

  caseTest(sdk, 'F-LINK', 'done 3', 'protected resource metadata naming a foreign authorization server: the secret is never sent there', async (t) => {
    const other = await startRecorder()
    defer(t, () => other.stop())
    const f = await fake(t, { issuerOrigin: other.origin(TARGET.otherLoopback) })
    const l = await link(t, sdk, mcpUrl(K1.HOSTS.loopbackScheme, TARGET.anyLoopback, f.port))
    await untilTrue(() => f.requests.length > 0)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(carryingSecret(other.requests), [], 'R-FB-04: the token went to an origin other than the target\'s')
    assert.notEqual(l.status()?.state, STATE.connected)
  })

  caseTest(sdk, 'F-LINK', 'done 4', `the link is modern-only: every MCP request is pinned to ${K1.PROTOCOL.version}, never initialize`, async (t) => {
    const { f } = await connected(t, sdk)
    const mcp = f.requests.filter((r) => r.path === K1.PATHS.mcp && r.method === WEB.post)
    assert.deepEqual(mcp.filter((r) => JSON.parse(r.body || '{}').method === RPC.legacyInitialize), [], 'a legacy initialize was sent (Q12)')
    assert.deepEqual([...new Set(mcp.map((r) => r.headers[RPC.protocolHeader]))], [K1.PROTOCOL.version])
  })

  caseTest(sdk, 'F-LINK', 'done 5', `core's link imports nothing from ${CONNECTOR_PREFIX} (it uses the vendored ./mcp-schema, design §9.1)`, () => {
    const files = sourceFiles(LINK.dir)
    assert.ok(files.length > 0, `no link module in ${LINK.dir}`)
    const edges = files.flatMap((f) => specifiers(fs.readFileSync(path.join(LINK.dir, f), 'utf8')).filter((s) => s === CONNECTOR_PREFIX || s.startsWith(CONNECTOR_PREFIX + '/')).map((s) => `${f}: ${s}`))
    assert.deepEqual(edges, [])
  })

  caseTest(sdk, 'F-LINK', 'done 6', `core packages its own ${MCP_CLIENT}, pinned exactly to this SDK's client line (design §9.1, §9.2)`, async () => {
    const manifest = readManifest(V3.core.dir)
    const pin = manifest?.dependencies?.[MCP_CLIENT]
    assert.ok(pin, `${MCP_CLIENT} is not a runtime dependency of ${V3.core.name}`)
    assert.match(pin, CLIENT_PIN.exactVersion, `${MCP_CLIENT} is not pinned exactly: ${pin}`)
    const host = JSON.parse(fs.readFileSync(path.join(SDK.versionsDir, sdk, CLIENT_PIN.nodeModules, MCP_CLIENT, CLIENT_PIN.manifest), 'utf8')).version
    assert.equal(CLIENT_PIN.line(pin), CLIENT_PIN.line(host), `core pins ${pin}; DSH ${sdk} carries ${host}`)
    assert.equal(manifest?.peerDependencies?.[MCP_CLIENT], undefined, 'the client must be packaged, not a DSH peer')
  })

  caseTest(sdk, 'F-LINK', 'done 7', 'the vendored ./mcp-schema generator runs at pack time and its copy equals the connector\'s source', async (t) => {
    // A fresh core folder, so the generator never writes into the checkout.
    const coreDir = fs.mkdtempSync(path.join(os.tmpdir(), VENDOR.tempPrefix))
    t.after(() => fs.rmSync(coreDir, { recursive: true, force: true }))
    const run = spawnSync(process.execPath, [VENDOR.generator, coreDir], { encoding: 'utf8', timeout: VENDOR.timeoutMs })
    assert.equal(run.status, 0, `generator failed: ${run.stderr || run.error}`)
    const outDir = path.join(coreDir, VENDOR.directory)
    const written = treeFiles(outDir)
    assert.ok(written.includes(VENDOR.entry), `the generator wrote no ${VENDOR.entry}: ${JSON.stringify(written)}`)
    const differs = (a, b) => !fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b))
    assert.deepEqual(written.filter((f) => differs(path.join(outDir, f), path.join(VENDOR.connectorDir, f))), [], 'copied files that differ from the connector\'s source')
    assert.deepEqual(treeFiles(VENDOR.committedDir), written, 'the committed vendor/ file set is not the generator\'s')
    assert.deepEqual(written.filter((f) => differs(path.join(outDir, f), path.join(VENDOR.committedDir, f))), [], 'committed vendor/ files that differ from a fresh run')
  })
}
