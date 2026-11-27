/**
 * C-WIRE black-box cases: the connector row wired in a real DSH web profile (worker.mjs) on each
 * SDK, beside the V2 path. Requirements: the brief's R1–R21 (task C-WIRE, W4b), AUTH-UC-09
 * (integration part), PLAT-EP-03 row 1 (reworded, static), EVT-EP-04 end to end, and the REMOVE-V2
 * gap check's (B) rows the wiring can show now (.runtime/reports/remove-v2-gapcheck.md).
 *
 * Levels: system rows boot a real DSH (no hosted child: dsh-instance is never installed); static
 * rows read the manifest and client.js. Techniques per row: Use Case (UC), Equivalence Partitioning
 * (EP), Boundary Value Analysis (BVA), Decision Table (DT), State Transition (ST); each name says
 * which. Rows another task owns are `todo` naming it (constants.mjs LATER).
 *
 * Shared boots: one DSH per scenario per SDK file (`scenario`). Every case makes its own entries,
 * ids and sessions, so no case reads another's state; a case that changes a limit restores it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { BUDGET, FILES, FIXTURE, HTTP, K1, K2, LATER, MAX_ARGUMENT_ENTRIES, PACKAGES, SURFACE, UNKNOWN_TOOL_CODE } from 'dsh-connector-test-helpers/connector-world/constants'
import { pluginEntry, resolveConfig, revocationNoteText, settingsPageRoutes, uiRoutes } from './subject.mjs'
import { freePort, holdPort, scenario, sdkClient } from 'dsh-connector-test-helpers/connector-world/world'
import { until } from 'dsh-connector-test-helpers/wait'
import { okCall as wireSuccess, refusedCall as wireRefusal } from 'dsh-connector-test-helpers/connector-world/steps'

const T = { timeout: BUDGET.testMs }
const { TOOL, REFUSAL, SCOPE, PATHS, RESOURCE, EVENT_TYPE, READ_ROLE, OAUTH_METADATA, GRANT, APPROVAL_LISTENER, CONNECTOR_STATUS, SETTINGS_REFUSAL, PAIR_ONLY, PROTOCOL, MAILBOX, OAUTH_ERROR } = K1
const S = SURFACE.settings
let counter = 0
/** A fresh fixture id (ids are unique per connector, R-ID-13). */
const fresh = (base) => `${base}-${process.pid}-${++counter}`

function row(sdk, id, part, title, fn, todo, skip) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else if (skip !== undefined) test(name, { skip }, () => {})
  else test(name, T, fn)
}

// ---------------------------------------------------------------------------------------------
// Steps shared by the system rows (each states one oracle once).
// ---------------------------------------------------------------------------------------------

/** The settings value of the row (DSH's settings service). */
const settingsValue = async (w) => (await w.settings())?.value ?? {}
const tokensOf = async (w) => (await settingsValue(w))[S.tokens] ?? []
/** Polls `predicate` (a harness wait). */
const eventually = (predicate, ms = BUDGET.readyMs) => until(predicate, ms, BUDGET.pollMs)
const quiet = () => new Promise((resolve) => setTimeout(resolve, BUDGET.quietMs))

/** New token through the settings page's create route, as the owner's page does (R8). */
async function createToken(w, label) {
  const answer = await w.owner('POST', SURFACE.route.create, { label })
  assert.equal(answer.status, HTTP.ok, 'create: ' + answer.text)
  assert.equal(answer.json?.ok, true, answer.text)
  return answer.json
}
/** GET state (R13). */
async function settingsState(w) {
  const answer = await w.owner('GET', SURFACE.route.state)
  assert.equal(answer.status, HTTP.ok, 'state: ' + answer.text)
  return answer
}
const stateOf = async (w) => (await settingsState(w)).json
const entryOf = async (w, key) => (await stateOf(w)).entries.find((e) => e.key === key)
/** One settings edit of the tokens list (the user's save through DSH's settings service). */
const saveTokens = (w, list) => w.call('settingsMutate', { ops: [{ op: 'set', path: [S.tokens], value: list }] })
/** The user's edit of one limit (DSH's settings service). */
const setLimit = (w, field, value) => w.call('settingsUpdate', { patch: { [field]: value } })

/**
 * A stock MCP client of this SDK, authenticated with the stock ClientCredentialsProvider
 * (client_id = the agent id, client_secret = the token value; R8, R17), connected to the MCP
 * endpoint and pinned to the K1 protocol revision. `hints` collects resources/updated URIs.
 */
async function machineClient(t, w, { id, value }) {
  const { Client, ClientCredentialsProvider, StreamableHTTPClientTransport } = await sdkClient(w.sdk)
  const urls = w.urls()
  const provider = new ClientCredentialsProvider({ clientId: id, clientSecret: value, expectedIssuer: urls.issuer })
  const transport = new StreamableHTTPClientTransport(new URL(urls.resource), { authProvider: provider })
  const client = new Client(FIXTURE.clientInfo, { capabilities: {}, versionNegotiation: { mode: { pin: PROTOCOL.version } } })
  const hints = []
  client.setNotificationHandler('notifications/resources/updated', (n) => { hints.push(n.params.uri) })
  await client.connect(transport, { timeout: BUDGET.rpcMs })
  t.after(() => client.close().catch(() => {}))
  return { client, provider, hints }
}
const toolNames = async (client) => (await client.listTools({}, { timeout: BUDGET.rpcMs })).tools.map((tool) => tool.name)
/** One tool call; the structured envelope (K1: every result carries `ok`). */
async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: BUDGET.rpcMs })
  assert.equal(typeof result.structuredContent?.ok, 'boolean', `${name}: no envelope: ${JSON.stringify(result)}`)
  return result.structuredContent
}
const okCall = async (client, name, args) => { const s = await call(client, name, args); assert.equal(s.ok, true, `${name} refused: ${JSON.stringify(s)}`); return s }
const refused = async (client, name, args, code) => { const s = await call(client, name, args); assert.deepEqual([s.ok, s.code], [false, code], `${name}: ${JSON.stringify(s)}`); return s }

/** A paired principal: New token, a stock client, `pair` (name optional). */
async function pairedPrincipal(t, w, { label = FIXTURE.label.a, name } = {}) {
  const made = await createToken(w, label)
  const id = fresh(FIXTURE.id.a)
  const agent = await machineClient(t, w, { id, value: made.value })
  const paired = await okCall(agent.client, TOOL.pair, name === undefined ? {} : { name })
  const principal = (await w.service(SURFACE.service.handover, 'principals')).value.find((p) => p.id === id)
  assert.ok(principal, 'the paired entry is not among principals()')
  return { ...agent, id, made, paired, principalKey: principal.key, entryKey: made.entryKey }
}
/** Opens a listen stream on dsh-agent://events (the "connected" definition, K1 CONNECTED). */
const listen = (client) => client.listen({ resourceSubscriptions: [RESOURCE.events.uri] }, { timeout: BUDGET.rpcMs })
const principalsOf = async (w) => (await w.service(SURFACE.service.handover, 'principals')).value
/** Every pending event of the caller, polled until `want(events)` holds. */
async function pollUntil(client, want = (e) => e.length > 0) {
  let events = []
  await eventually(async () => {
    const s = await call(client, TOOL.inboxPoll, {})
    events = s.ok ? s.events : []
    return want(events)
  })
  return events
}
const receipts = (events) => events.map((e) => ({ eventId: e.eventId, payloadDigest: e.payloadDigest }))
/** session_start in a fresh folder of the DSH home; waits for its first turn to end. */
async function startSession(w, client, extra = {}) {
  const folder = await w.call('folder', { name: fresh(FIXTURE.folder) })
  const s = await okCall(client, TOOL.sessionStart, { folder, title: FIXTURE.title, message: FIXTURE.message, attachments: [], ...extra })
  await w.call('waitIdle', { sessionId: s.sessionId })
  return { ...s, folder }
}
/** A UI route as the owner's page posts it (R12). */
const uiPost = (w, route, body) => w.owner('POST', route, body)
/** A note of exactly `bytes` UTF-8 bytes, built from `unit`. */
function noteOfBytes(bytes, unit = FIXTURE.pad) {
  const n = Buffer.byteLength(unit)
  const note = unit.repeat(Math.floor(bytes / n)) + FIXTURE.pad.repeat(bytes % n)
  assert.equal(Buffer.byteLength(note), bytes, 'harness: note size')
  return note
}

// ---------------------------------------------------------------------------------------------
// The scenarios (one boot each per SDK file).
// ---------------------------------------------------------------------------------------------

const MAIN = 'main'
const UI = 'ui'
const CONTRIB = 'contrib'
const mainFixtures = new Map()
const approvalPortPatch = (port) => ({ [S.approval]: { [S.port]: port } })
function mainFixture(sdk) {
  if (!mainFixtures.has(sdk)) {
    mainFixtures.set(sdk, (async () => {
      // Keep the explicit settings input as the oracle; state and metadata are both product output.
      const port = await freePort()
      const w = await scenario(sdk, MAIN, { rowConfig: () => approvalPortPatch(port) })
      return { w, port }
    })())
  }
  return mainFixtures.get(sdk)
}
const main = async (sdk) => (await mainFixture(sdk)).w
const withUi = (sdk) => scenario(sdk, UI, { env: { FBWIRE_LINK: JSON.stringify([{ name: PACKAGES.ui.name, dir: PACKAGES.ui.dir }]) } })
const withContrib = (sdk) => scenario(sdk, CONTRIB, { env: { FBWIRE_CONTRIBUTORS: JSON.stringify([FIXTURE.contributorName]) } })

export function registerWireCases(sdk) {
  staticRows(sdk)
  loadRows(sdk)
  settingsRows(sdk)
  writerRows(sdk)
  refusedSaveRows(sdk)
  httpRows(sdk)
  machineRows(sdk)
  isolationRows(sdk)
  sessionRows(sdk)
  placementRows(sdk)
  readRows(sdk)
  uiRows(sdk)
  tokensServiceRows(sdk)
  revocationRows(sdk)
  embedUiRows(sdk)
  cimdRow(sdk)
  laterRows(sdk)
}

// ============================================================ static (R1, PLAT-EP-03 row 1 reworded, R13 client)
function staticRows(sdk) {
  const manifest = () => JSON.parse(fs.readFileSync(FILES.manifest, 'utf8'))
  row(sdk, 'C-WIRE-R1', 'engines', `package.json engines.dsh is "${SURFACE.engines}" (design §9.1)`, () => {
    assert.equal(manifest().engines?.dsh, SURFACE.engines)
  })
  row(sdk, 'PLAT-EP-03', '1 (reworded, manifest)', 'the connector has one dsh.client: platform web, its ./client export is client.js, shipped in files', () => {
    const m = manifest()
    assert.equal(m.dsh?.client?.platform, SURFACE.clientPlatform, JSON.stringify(m.dsh?.client))
    const target = m.exports?.['./client']
    assert.equal(path.posix.basename(String(typeof target === 'string' ? target : target?.default)), SURFACE.clientEntry)
    assert.ok((m.files ?? []).some((f) => f === SURFACE.clientEntry || f === './' + SURFACE.clientEntry), 'client.js is not in files: ' + JSON.stringify(m.files))
  })
  row(sdk, 'PLAT-EP-03', '1 (reworded, slot)', `client.js names only the ${SURFACE.slot} slot, under ${SURFACE.slotKey}; no sidebar, other slot or global style`, () => {
    const source = fs.readFileSync(FILES.client, 'utf8')
    assert.ok(source.includes(SURFACE.slot), 'client.js does not name ' + SURFACE.slot)
    const quoted = [...source.matchAll(/['"`]((?:sidebar|conversation|tool|plugins|main|header|chat)\.[a-z.]+)['"`]/g)].map((m) => m[1])
    assert.deepEqual([...new Set(quoted)].filter((s) => s !== SURFACE.slot), [], 'other slot names in client.js')
  })
  // Re-baselined by C-WIRE-2: no designated agent (the user's q5); the page shows the DSH name (decision list item 8).
  row(sdk, 'AUTH-UC-09', 'page (static)', 'client.js reads the state route and shows the tokens list, New token, the approval port, the DSH name and the limits; no designated agent', async () => {
    const source = fs.readFileSync(FILES.client, 'utf8')
    const routes = await settingsPageRoutes()
    assert.equal(routes.state, SURFACE.route.state, 'SETTINGS_PAGE.route.state')
    assert.ok(source.includes(routes.state.replace(/^\//, '')) || source.includes(routes.state), 'client.js never calls the state route')
    for (const word of [S.tokens, S.approval, S.port, S.dshName, S.maxQueuedInputs, S.maxMessageBytes]) assert.ok(source.includes(word), 'client.js does not name ' + word)
    assert.equal(source.includes(S.agentToken), false, 'client.js still names ' + S.agentToken)
  })
  row(sdk, 'C-WIRE-R21', 'entry', 'the plugin entry exports name, inject, Config and apply; its name is the row id', async () => {
    const entry = await pluginEntry(sdk)
    assert.equal(entry.name, SURFACE.rowId)
    assert.equal(typeof entry.apply, 'function')
    assert.ok(entry.Config, 'no Config')
    assert.ok(entry.inject !== undefined, 'no inject')
  })
  // Re-baselined by C-WIRE-2 (q5: no routing object; item 8: approval.dshName optional, unset; item 9: the removed fields).
  row(sdk, 'C-WIRE-R2', 'schema', 'Config resolves {} to exactly tokens [], approval {port: APPROVAL_LISTENER.defaultPort, dshName: undefined}, requests {autoEscalatePermissions: true, autoRejectIncompleteArguments: true}, and the kept limits at their defaults; no routing, no removed field', async () => {
    const value = await resolveConfig(sdk, {})
    assert.deepEqual(value[S.tokens], [])
    // Unset optional dshName resolves to a present key with value undefined (Schemastery; relayed 2026-11-17).
    assert.deepEqual(value[S.approval], { [S.port]: APPROVAL_LISTENER.defaultPort, [S.dshName]: undefined })
    assert.deepEqual(value[S.requests], { [S.autoEscalatePermissions]: true, [S.autoRejectIncompleteArguments]: true })
    for (const [k, d] of Object.entries(S.limits)) assert.equal(value[k], d, 'default of ' + k)
    assert.deepEqual(Object.keys(value).sort(), [S.tokens, S.approval, S.requests, ...Object.keys(S.limits)].sort())
  })
  for (const [label, name, ok] of [['a name', FIXTURE.name.a, true], ['\'\'', '', true], ['a number', 1, false]]) {
    row(sdk, 'C-WIRE-R2', `dshName EP (${label})`, `approval.dshName ${JSON.stringify(name)} is ${ok ? 'accepted' : 'refused'} by the schema (decision list item 8)`, async () => {
      const input = { [S.approval]: { [S.port]: APPROVAL_LISTENER.defaultPort, [S.dshName]: name } }
      if (ok) assert.equal((await resolveConfig(sdk, input))[S.approval][S.dshName], name)
      else await assert.rejects(resolveConfig(sdk, input))
    })
  }
  // BVA on approval.port: 0..65535 (R2).
  for (const [label, port, ok] of [['min 0', S.portMin, true], ['1', 1, true], ['max 65535', S.portMax, true], ['-1', -1, false], ['65536', S.portMax + 1, false], ['1.5', 1.5, false], ['"80"', '80', false]]) {
    row(sdk, 'C-WIRE-R2', `port BVA (${label})`, `approval.port ${JSON.stringify(port)} is ${ok ? 'accepted' : 'refused'} by the schema`, async () => {
      if (ok) assert.equal((await resolveConfig(sdk, { [S.approval]: { [S.port]: port } }))[S.approval][S.port], port)
      else await assert.rejects(resolveConfig(sdk, { [S.approval]: { [S.port]: port } }))
    })
  }
  // EP on a token item: {label: string, enabled: boolean, key: string}.
  for (const [label, item, ok] of [
    ['valid', { label: FIXTURE.label.a, enabled: true, key: 'k1' }, true],
    ['enabled not boolean', { label: FIXTURE.label.a, enabled: 'yes', key: 'k1' }, false],
    ['label not string', { label: 1, enabled: true, key: 'k1' }, false],
    ['key not string', { label: FIXTURE.label.a, enabled: true, key: 1 }, false],
  ]) {
    row(sdk, 'C-WIRE-R2', `tokens item EP (${label})`, `a tokens item ${ok ? 'is accepted' : 'is refused'} by the schema`, async () => {
      if (ok) assert.deepEqual((await resolveConfig(sdk, { [S.tokens]: [item] }))[S.tokens], [item])
      else await assert.rejects(resolveConfig(sdk, { [S.tokens]: [item] }))
    })
  }
  row(sdk, 'C-WIRE-R12', 'routes (static)', 'UI_ROUTE lists the UI backend\'s routes under /api/dsh-connector/ui/', async () => {
    const routes = await uiRoutes()
    assert.ok(Object.values(routes).length > 0)
    assert.deepEqual(Object.values(routes).filter((p) => !p.startsWith(SURFACE.route.uiPrefix)), [])
    assert.equal(routes.handOver, SURFACE.route.uiHandOver)
  })
  row(sdk, 'C-WIRE-R11', 'K1', 'K1 READ_ROLE is {user, assistant, principal, agent, context}; no fishball role', () => {
    assert.deepEqual(Object.values(READ_ROLE).sort(), ['agent', 'assistant', 'context', 'principal', 'user'])
  })
}

// ============================================================ R1, R21: the row loads, services provided
function loadRows(sdk) {
  row(sdk, 'C-WIRE-R1', 'load', 'the row loads and is active in a real DSH web profile; app ready fires', async () => {
    const w = await main(sdk)
    const r = await w.call('row')
    assert.deepEqual([r.present, r.active], [true, true], JSON.stringify(r))
  })
  row(sdk, 'C-WIRE-R1', 'services', 'the row provides dshConnectorHandover, dshConnectorTools, dshConnectorTokens and dshConnectorUi, each with apiVersion 1', async () => {
    const w = await main(sdk)
    const names = [SURFACE.service.handover, SURFACE.service.tools, SURFACE.service.tokens, SURFACE.service.ui]
    const got = await w.call('services', { names })
    for (const n of names) assert.deepEqual([got[n].present, got[n].apiVersion], [true, SURFACE.apiVersion], n + ': ' + JSON.stringify(got[n]))
  })
  // Re-baselined by C-WIRE-2 (decision list item 9: the V2 broker is removed; 第三版其实就是第一版).
  row(sdk, 'C-WIRE-R21', 'V2 removed', 'the row provides neither the V2 dshConnector nor the fishballSessionState service', async () => {
    const w = await main(sdk)
    const got = await w.call('services', { names: [SURFACE.service.v2, SURFACE.service.v2SessionState] })
    assert.equal(got[SURFACE.service.v2].present, false)
    assert.equal(got[SURFACE.service.v2SessionState].present, false)
  })
  row(sdk, 'C-WIRE-R1', 'no child', 'no hosted child is launched: dshInstanceChild is absent (dsh-instance not installed)', async () => {
    const w = await main(sdk)
    assert.equal((await w.call('services', { names: ['dshInstanceChild'] })).dshInstanceChild.present, false)
  })
  row(sdk, 'C-WIRE-R1', 'boot log', 'no error line was logged by the connector at boot', async () => {
    const w = await main(sdk)
    const errors = (await w.call('logs')).filter((l) => l.type === 'error' && /connector/i.test(l.name ?? ''))
    assert.deepEqual(errors, [])
  })
}

// ============================================================ R2, R4: native settings, volatile, live
function settingsRows(sdk) {
  row(sdk, 'C-WIRE-R2', 'describe', 'DSH describes the row\'s settings: tokens, approval.port and the kept limits; no routing and no removed field (C-WIRE-2)', async () => {
    const w = await main(sdk)
    const d = await w.settings()
    assert.ok(d, 'the row has no settings')
    const v = d.value
    assert.ok(Array.isArray(v[S.tokens]), 'tokens')
    assert.equal(typeof v[S.approval]?.[S.port], 'number')
    for (const k of Object.keys(S.limits)) assert.equal(typeof v[k], 'number', k)
    for (const k of [S.routing, ...S.removed]) assert.equal(Object.hasOwn(v, k), false, k + ' is still a setting')
  })
  // Re-baselined by C-WIRE-2: the designated entry edit became the DSH name edit (q5; decision list item 8).
  row(sdk, 'C-WIRE-R2', 'volatile (ST)', 'Mounted --edit a limit, the approval port, the DSH name and the tokens list--> Mounted: the row\'s fiber is the same (never remounted)', async () => {
    const { w, port } = await mainFixture(sdk)
    const before = (await w.call('row')).fiber
    const was = (await settingsValue(w))[S.maxMessageBytes]
    try {
      assert.equal((await setLimit(w, S.maxMessageBytes, was + 1)).ok, true)
      assert.equal((await w.call('settingsUpdate', { patch: { [S.approval]: { [S.port]: await freePort(), [S.dshName]: FIXTURE.name.a } } })).ok, true)
      await createToken(w, FIXTURE.label.c)
      assert.equal((await w.call('settingsMutate', { ops: [{ op: 'unset', path: [S.approval, S.dshName] }] })).ok, true)
      assert.equal((await setLimit(w, S.maxMessageBytes, was)).ok, true)
      await quiet()
      const after = await w.call('row')
      assert.deepEqual([after.active, after.fiber], [true, before], 'the row was remounted by a settings edit')
    } finally {
      assert.equal((await w.call('settingsUpdate', { patch: approvalPortPatch(port) })).ok, true)
    }
  })
  // CFG / L rows of the gap report: the kept limits (BVA min 1, refusals, no upper bound).
  for (const field of Object.keys(S.limits)) {
    for (const [label, bad] of [['0', 0], ['-1', -1], ['0.5', 0.5], ['"5"', '5']]) {
      row(sdk, 'C-WIRE-R2', `limit ${field} refused ${label}`, `${field} = ${JSON.stringify(bad)} is refused and the value stays`, async () => {
        const w = await main(sdk)
        const before = (await settingsValue(w))[field]
        assert.equal((await setLimit(w, field, bad)).ok, false)
        assert.equal((await settingsValue(w))[field], before)
      })
    }
    row(sdk, 'C-WIRE-R2', `limit ${field} BVA min / 10× default`, `${field} accepts 1 and ten times its default; the default is accepted again`, async () => {
      const w = await main(sdk)
      for (const v of [1, S.limits[field] * 10, S.limits[field]]) {
        assert.equal((await setLimit(w, field, v)).ok, true, field + '=' + v)
        assert.equal((await settingsValue(w))[field], v)
      }
    })
  }
}

// ============================================================ R3: SettingsWriter through its callers
function writerRows(sdk) {
  row(sdk, 'C-WIRE-R3', 'addToken (create route)', 'the create route appends one {label, enabled: true, key} item at the end of tokens, and the answer resolves after it is listed', async () => {
    const w = await main(sdk)
    const before = await tokensOf(w)
    const made = await createToken(w, FIXTURE.label.a)
    const after = await tokensOf(w)
    assert.equal(after.length, before.length + 1)
    assert.deepEqual(after.at(-1), { label: FIXTURE.label.a, enabled: true, key: made.entryKey })
    assert.deepEqual(after.slice(0, -1), before, 'earlier items changed')
  })
  row(sdk, 'C-WIRE-R3', 'addToken (createHosted)', 'createHosted appends the hosted item; on resolve the list and principals() already hold it (R4)', async () => {
    const w = await main(sdk)
    const r = await w.call('createHosted', { instanceId: FIXTURE.instanceId })
    assert.ok(r.made, JSON.stringify(r))
    assert.deepEqual(r.tokens.at(-1), { label: SURFACE.k3.hostedLabel, enabled: true, key: r.made.entryKey })
    assert.ok(r.principals.some((p) => p.key === r.made.entryKey || (p.paired === false && p.enabled === true)), 'principals() lacks the new entry right after the save')
    assert.equal(r.principals.length, r.before + 1)
  })
  row(sdk, 'C-WIRE-R3', 'call order', 'three createHosted calls started together resolve with three distinct entries, listed in call order', async () => {
    const w = await main(sdk)
    const r = await w.call('createHostedMany', { instanceId: FIXTURE.instanceId, n: 3 })
    assert.deepEqual(r.results.filter((x) => x.threw), [])
    const keys = r.results.map((x) => x.entryKey)
    assert.equal(new Set(keys).size, 3)
    assert.deepEqual(r.tokens.slice(-3).map((i) => i.key), keys)
  })
  row(sdk, 'C-WIRE-R3', 'setDesignated(undefined) (delete)', 'deleting the designated entry from the list unsets routing.agentToken', null, undefined, LATER.withdrawnDesignated)
  // removeToken's only caller is C-SUCCEED's retire, which needs a paired hosted successor (I-SUCCEED drives it end to end).
  row(sdk, 'C-WIRE-R3', 'removeToken (absent key)', 'removeToken of an absent key resolves with nothing changed', null, 'I-SUCCEED (retire through the real SettingsWriter on a real DSH)')
}

// ============================================================ R5: refused save and restore
function refusedSaveRows(sdk) {
  row(sdk, 'C-WIRE-R5', 'duplicate key (DT)', 'a save with a duplicate key is refused: the previous list is written back; the notice names the labels', async () => {
    const w = await main(sdk)
    const made = await createToken(w, FIXTURE.label.a)
    const before = await tokensOf(w)
    const bad = [...before, { label: FIXTURE.label.copy, enabled: true, key: made.entryKey }]
    await saveTokens(w, bad)
    assert.ok(await eventually(async () => JSON.stringify(await tokensOf(w)) === JSON.stringify(before)), 'the previous list was not written back')
    const notice = (await w.owner('GET', SURFACE.route.notice)).json
    assert.equal(notice?.notice?.code, SETTINGS_REFUSAL.tokenDuplicate, JSON.stringify(notice))
    assert.ok(JSON.stringify(notice.notice.labels).includes(FIXTURE.label.copy), 'the notice does not name the copy\'s label')
    assert.ok(!JSON.stringify(notice).includes(made.entryKey), 'the notice names an entry key')
  })
  row(sdk, 'C-WIRE-R5', 'item with no record (DT)', 'a save adding a hand-made item (no record) is refused the same way', async () => {
    const w = await main(sdk)
    const before = await tokensOf(w)
    await saveTokens(w, [...before, { label: FIXTURE.label.hand, enabled: true, key: fresh(FIXTURE.handKey) }])
    assert.ok(await eventually(async () => JSON.stringify(await tokensOf(w)) === JSON.stringify(before)), 'the previous list was not written back')
    const notice = (await w.owner('GET', SURFACE.route.notice)).json
    assert.ok(JSON.stringify(notice?.notice?.labels ?? []).includes(FIXTURE.label.hand), JSON.stringify(notice))
  })
  row(sdk, 'C-WIRE-R5', 'next user save (ST)', 'Refused → a second, different user save right after (a valid disable) → accepted as a user save', async () => {
    const w = await main(sdk)
    const made = await createToken(w, FIXTURE.label.a)
    const before = await tokensOf(w)
    const dup = [...before, { label: FIXTURE.label.copy, enabled: true, key: made.entryKey }]
    const disabled = before.map((i) => (i.key === made.entryKey ? { ...i, enabled: false } : i))
    const r = await w.call('settingsTwice', { first: [{ op: 'set', path: [S.tokens], value: dup }], second: [{ op: 'set', path: [S.tokens], value: disabled }] })
    assert.equal(r[1].ok, true, JSON.stringify(r))
    assert.ok(await eventually(async () => (await tokensOf(w)).find((i) => i.key === made.entryKey)?.enabled === false), 'the second save did not stand')
    await quiet()
    assert.deepEqual(await tokensOf(w), disabled, 'the write-back of the first save overwrote the second')
    assert.equal((await entryOf(w, made.entryKey))?.enabled, false)
  })
  row(sdk, 'C-WIRE-R5', 'next user save refused (ST)', 'Refused → a second, different user save right after with a new problem → refused too (judged as a user save)', async () => {
    const w = await main(sdk)
    const made = await createToken(w, FIXTURE.label.a)
    const before = await tokensOf(w)
    const dup = [...before, { label: FIXTURE.label.copy, enabled: true, key: made.entryKey }]
    const hand = [...before, { label: FIXTURE.label.hand, enabled: true, key: fresh(FIXTURE.handKey) }]
    await w.call('settingsTwice', { first: [{ op: 'set', path: [S.tokens], value: dup }], second: [{ op: 'set', path: [S.tokens], value: hand }] })
    assert.ok(await eventually(async () => JSON.stringify(await tokensOf(w)) === JSON.stringify(before)), 'a refused list stayed')
    const notice = (await w.owner('GET', SURFACE.route.notice)).json
    assert.ok(JSON.stringify(notice?.notice?.labels ?? []).includes(FIXTURE.label.hand), 'the second problem was not refused as a user save: ' + JSON.stringify(notice))
  })
  row(sdk, 'C-WIRE-R5', 'write-back not refused', 'the write-back itself is never refused: after it the list is the previous one and every earlier entry still authenticates', async () => {
    const w = await main(sdk)
    const made = await createToken(w, FIXTURE.label.a)
    const before = await tokensOf(w)
    await saveTokens(w, [...before, { label: FIXTURE.label.copy, enabled: true, key: made.entryKey }])
    assert.ok(await eventually(async () => JSON.stringify(await tokensOf(w)) === JSON.stringify(before)))
    const res = await tokenRequest(w, { clientId: fresh(FIXTURE.id.a), secret: made.value })
    assert.equal(res.status, HTTP.ok, 'the entry no longer authenticates after the write-back: ' + res.text)
  })
}

/** A client_credentials token request (HTTP Basic), as a stock client sends it. */
function tokenRequest(w, { clientId, secret, form = {} }) {
  const body = new URLSearchParams({ grant_type: GRANT.clientCredentials, resource: w.urls().resource, ...form }).toString()
  const auth = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString('base64')
  return w.raw('POST', PATHS.token, { headers: { authorization: `${HTTP.basic} ${auth}`, 'content-type': HTTP.formType }, body })
}

// ============================================================ R6, R7: HTTP mounting, approval listener
function httpRows(sdk) {
  const PRM = PATHS.protectedResourcePrefix + PATHS.mcp
  const ASM = PATHS.authorizationServerPrefix + PATHS.issuer
  row(sdk, 'C-WIRE-R6', 'metadata (UC)', `GET ${PRM} and ${ASM} on DSH's listener: the K1 documents for this host`, async () => {
    const w = await main(sdk)
    const prm = await w.raw('GET', PRM)
    assert.equal(prm.status, HTTP.ok, prm.text)
    assert.deepEqual(prm.json, { ...K1.protectedResourceMetadata(w.origin) })
    const asm = await w.raw('GET', ASM)
    assert.equal(asm.status, HTTP.ok, asm.text)
    assert.equal(asm.json.issuer, w.urls().issuer)
    assert.equal(asm.json.token_endpoint, w.urls().tokenEndpoint)
  })
  row(sdk, 'C-WIRE-R6', 'authorization_endpoint (DSH port)', 'a request to DSH\'s own port: authorization_endpoint is <scheme>//<same host name>:<approval port>/authorize', async () => {
    const { w, port } = await mainFixture(sdk)
    const asm = (await w.raw('GET', ASM)).json
    assert.equal(asm.authorization_endpoint, `http://${new URL(w.origin).hostname}:${port}${PATHS.authorize}`)
  })
  row(sdk, 'C-WIRE-R6', 'authorization_endpoint (localhost)', 'the same under Host localhost:<DSH port>: the endpoint names localhost on the approval port', async () => {
    const { w, port } = await mainFixture(sdk)
    const asm = (await w.raw('GET', ASM, { hostHeader: `localhost:${w.port}` })).json
    assert.equal(asm?.authorization_endpoint, `http://localhost:${port}${PATHS.authorize}`)
  })
  row(sdk, 'C-WIRE-R6', 'authorization_endpoint (tunnel)', 'through another origin port (a trusted tunnel host): the request\'s own origin + /authorize', async () => {
    const w = await main(sdk)
    const host = `${FIXTURE.tunnelHost}:${FIXTURE.tunnelPort}`
    const asm = await w.raw('GET', ASM, { hostHeader: host })
    assert.equal(asm.status, HTTP.ok, asm.text)
    assert.equal(asm.json.authorization_endpoint, `https://${host}${PATHS.authorize}`)
  })
  row(sdk, 'C-WIRE-R6', 'MCP POST', `POST ${PATHS.mcp} without a token → 401 with the Bearer challenge naming the protected-resource metadata`, async () => {
    const w = await main(sdk)
    const res = await w.raw('POST', PATHS.mcp, { headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} }) })
    assert.equal(res.status, 401, res.text)
    assert.match(String(res.headers['www-authenticate']), new RegExp(K1.oauthUrls(w.origin).protectedResourceMetadata.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })
  row(sdk, 'C-WIRE-R6', 'approval listener bound', 'the approval listener answers on approval.port of DSH\'s host: GET /authorize without parameters is the connector\'s page (an error page, not a socket error)', async () => {
    const { w, port } = await mainFixture(sdk)
    const page = await w.approval('GET', PATHS.authorize, { port })
    assert.ok(page.status >= HTTP.badRequest && page.status < 500, 'status ' + page.status)
    assert.equal(page.headers['cache-control'], APPROVAL_LISTENER.headers['cache-control'])
    const other = await w.approval('GET', '/fbtest-other', { port })
    assert.equal(other.status, 404)
  })
  row(sdk, 'C-WIRE-R6', 'rebind (ST)', 'Bound(p1) --approval.port := p2--> Bound(p2): the listener answers on p2 at once, p1 is released; the metadata follows; state.approval reports it', async () => {
    const { w, port: p1 } = await mainFixture(sdk)
    assert.equal((await settingsValue(w))[S.approval][S.port], p1)
    const originalEndpointAnswers = async () => {
      const page = await w.approval('GET', PATHS.authorize, { port: p1 }).catch(() => null)
      return page && page.status >= HTTP.badRequest && page.status < 500 && page.headers['cache-control'] === APPROVAL_LISTENER.headers['cache-control']
    }
    assert.ok(await eventually(originalEndpointAnswers), 'the connector never answered on the original fixture port')
    const p2 = await freePort()
    try {
      assert.equal((await w.call('settingsUpdate', { patch: approvalPortPatch(p2) })).ok, true)
      assert.ok(await eventually(async () => (await w.approval('GET', '/fbtest-other', { port: p2 }).catch(() => ({}))).status === 404), 'nothing answers on the new port')
      const asm = (await w.raw('GET', ASM)).json
      assert.equal(new URL(asm.authorization_endpoint).port, String(p2))
      assert.deepEqual([(await stateOf(w)).approval.port, (await stateOf(w)).approval.status], [p2, SURFACE.approvalStatusOk])
      await assert.rejects(w.approval('GET', '/fbtest-other', { port: p1 }), { code: 'ECONNREFUSED' }, 'the old port was not released')
    } finally {
      assert.equal((await w.call('settingsUpdate', { patch: approvalPortPatch(p1) })).ok, true)
      assert.ok(await eventually(originalEndpointAnswers), 'the connector did not recover on the original fixture port')
    }
  })
  row(sdk, 'C-WIRE-R6', 'clash (DT)', `approval.port held by another listener → state.approval.status ${CONNECTOR_STATUS.approvalPortInUse}; the MCP endpoint and the token endpoint keep working; the metadata keeps authorization_endpoint`, async (t) => {
    const w = await main(sdk)
    const originalPortSetting = (await settingsValue(w))[S.approval][S.port]
    const holder = await holdPort()
    const held = holder.port
    try {
      assert.equal((await w.call('settingsUpdate', { patch: { [S.approval]: { [S.port]: held } } })).ok, true)
      assert.ok(await eventually(async () => (await stateOf(w)).approval.status === CONNECTOR_STATUS.approvalPortInUse), 'status: ' + JSON.stringify((await stateOf(w)).approval))
      const asm = (await w.raw('GET', ASM)).json
      assert.equal(asm.authorization_endpoint, `http://${new URL(w.origin).hostname}:${held}${PATHS.authorize}`)
      const made = await createToken(w, FIXTURE.label.a)
      const agent = await machineClient(t, w, { id: fresh(FIXTURE.id.a), value: made.value })
      assert.deepEqual(await toolNames(agent.client), [...PAIR_ONLY.tools])
    } finally {
      await w.call('settingsUpdate', { patch: { [S.approval]: { [S.port]: originalPortSetting } } })
      await holder.close()
    }
    assert.ok(await eventually(async () => (await stateOf(w)).approval.status === SURFACE.approvalStatusOk), 'the status did not recover after the port changed')
  })
  // R7: grant_types_supported work end to end at the token endpoint.
  row(sdk, 'C-WIRE-R7', 'grants listed', 'the AS metadata lists K1 grant_types_supported exactly', async () => {
    const w = await main(sdk)
    assert.deepEqual((await w.raw('GET', ASM)).json.grant_types_supported, [...OAUTH_METADATA.authorizationServer.grant_types_supported])
  })
  for (const grant of [GRANT.authorizationCode, GRANT.refreshToken]) {
    row(sdk, 'C-WIRE-R7', `${grant} registered (EP)`, `grant_type=${grant} with a bad ${grant === GRANT.authorizationCode ? 'code' : 'refresh token'} → invalid_grant (the grant is registered), never unsupported_grant_type`, async () => {
      const w = await main(sdk)
      const form = grant === GRANT.authorizationCode
        ? { grant_type: grant, code: 'fbtest-no-such-code', redirect_uri: 'http://127.0.0.1:7777/cb', code_verifier: 'v'.repeat(43), client_id: FIXTURE.remoteClientId, resource: w.urls().resource }
        : { grant_type: grant, refresh_token: 'fbtest-no-such-rt', client_id: FIXTURE.remoteClientId, resource: w.urls().resource }
      const res = await w.raw('POST', PATHS.token, { headers: { 'content-type': HTTP.formType }, body: new URLSearchParams(form).toString() })
      assert.notEqual(res.json?.error, OAUTH_ERROR.unsupportedGrantType, res.text)
      assert.equal(res.json?.error, OAUTH_ERROR.invalidGrant, res.text)
    })
  }
  row(sdk, 'C-WIRE-R7', 'client_credentials', 'grant_type=client_credentials with a created token → 200, scope agent:pair before pairing, no refresh_token', async () => {
    const w = await main(sdk)
    const made = await createToken(w, FIXTURE.label.a)
    const res = await tokenRequest(w, { clientId: fresh(FIXTURE.id.a), secret: made.value })
    assert.equal(res.status, HTTP.ok, res.text)
    assert.equal(res.json.scope, SCOPE.pair)
    assert.equal(res.json.refresh_token, undefined)
  })
  row(sdk, 'C-WIRE-R7', 'other grant', 'grant_type=password → unsupported_grant_type', async () => {
    const w = await main(sdk)
    const res = await w.raw('POST', PATHS.token, { headers: { 'content-type': HTTP.formType }, body: new URLSearchParams({ grant_type: 'password', resource: w.urls().resource }).toString() })
    assert.equal(res.json?.error, OAUTH_ERROR.unsupportedGrantType, res.text)
  })
}

// ============================================================ R8, R17, R9, AUTH-UC-09, R13
function machineRows(sdk) {
  row(sdk, 'MCP-ARGS-BVA', 'core and contributed', 'argument entries: the inclusive boundary reaches schema validation; one more returns limit-exceeded', async (t) => {
    const w = await withUi(sdk)
    const { client } = await pairedPrincipal(t, w)
    const notify = K2.publicNameOf(K2.namespaceOf(PACKAGES.ui.name), FIXTURE.uiNotify)
    const listed = await toolNames(client)
    assert.ok(listed.includes(notify), `linked UI must contribute ${notify}; listed: ${listed.join(', ')}`)
    // Two root/nested keys (sample, values) plus the primitive items; neither schema admits sample.
    const argsOf = (entries) => ({ sample: { values: Array(entries - 2).fill(0) } })
    const atLimit = argsOf(MAX_ARGUMENT_ENTRIES)
    const overLimit = argsOf(MAX_ARGUMENT_ENTRIES + 1)
    for (const name of [TOOL.setName, notify]) {
      await wireRefusal(client, name, atLimit, REFUSAL.invalidArguments)
      await wireRefusal(client, name, overLimit, REFUSAL.limitExceeded)
    }
    assert.ok(!listed.includes(FIXTURE.unknownTool), 'unknown-tool fixture must not be registered')
    await assert.rejects(client.callTool({ name: FIXTURE.unknownTool, arguments: overLimit }, undefined, { timeout: BUDGET.rpcMs }), { code: UNKNOWN_TOOL_CODE })
  })
  row(sdk, 'C-WIRE-R8', 'main (UC)', 'create → stock ClientCredentialsProvider (client_id = agent id) → pair-only tools/list → pair → the full core tool list', async (t) => {
    const w = await main(sdk)
    const made = await createToken(w, FIXTURE.label.a)
    const id = fresh(FIXTURE.id.a)
    const { client, provider } = await machineClient(t, w, { id, value: made.value })
    assert.ok(provider.tokens()?.access_token, 'no access token')
    assert.deepEqual(await toolNames(client), [...PAIR_ONLY.tools])
    const paired = await okCall(client, TOOL.pair, { name: fresh(FIXTURE.name.a) })
    assert.equal(paired.id, id)
    const names = await toolNames(client)
    assert.deepEqual(K1.TOOL_NAMES.filter((n) => !names.includes(n)), [], 'core tools missing after pair')
    assert.deepEqual(names.slice(0, K1.TOOL_NAMES.length), [...K1.TOOL_NAMES], 'core tools are not first, in K1 order')
  })
  row(sdk, 'C-WIRE-R17', 'agent_id (e2e-style)', 'a stock MCP SDK client passing agent_id (its client_id) against the wired connector in process: pair binds that id; no dsh-instance child', async (t) => {
    const w = await main(sdk)
    const made = await createToken(w, FIXTURE.label.a)
    const id = fresh(FIXTURE.id.b)
    const { client } = await machineClient(t, w, { id, value: made.value })
    assert.equal((await okCall(client, TOOL.pair, {})).id, id)
    assert.equal((await w.call('services', { names: ['dshInstanceChild'] })).dshInstanceChild.present, false)
    assert.ok((await principalsOf(w)).some((p) => p.id === id && p.paired && p.enabled))
  })
  row(sdk, 'C-WIRE-R8', 'inbox_poll', 'inbox_poll after pair → ok with events [] (no event produced yet), hasMore false', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await okCall(p.client, TOOL.inboxPoll, {})
    assert.deepEqual([s.events, s.hasMore], [[], false])
  })
  row(sdk, 'C-WIRE-R8', 'online (ST)', `Offline --listen on ${RESOURCE.events.uri}--> Online in principals() --stream closed--> Offline`, async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    assert.equal((await principalsOf(w)).find((x) => x.key === p.principalKey).online, false)
    const sub = await listen(p.client)
    assert.ok(await eventually(async () => (await principalsOf(w)).find((x) => x.key === p.principalKey)?.online === true), 'not online with a listen stream')
    await sub.close()
    assert.ok(await eventually(async () => (await principalsOf(w)).find((x) => x.key === p.principalKey)?.online === false), 'still online after the stream closed')
  })
  row(sdk, 'C-WIRE-R8', 'owner-only create', 'the create route without the owner\'s login is refused and creates nothing', async () => {
    const w = await main(sdk)
    const before = await tokensOf(w)
    const res = await w.raw('POST', SURFACE.route.create, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: FIXTURE.label.a }) })
    assert.notEqual(res.status, HTTP.ok)
    assert.deepEqual(await tokensOf(w), before)
  })
  // AUTH-UC-09 (integration part) / R13: the state route.
  row(sdk, 'AUTH-UC-09', 'main (R13)', 'GET state: owner-only JSON no-store {ok, entries, approval} (no designated since C-WIRE-2, q5); entries in settings order with {key, label, enabled, paired, id, name, lastSeenAt, connected}', async (t) => {
    const w = await main(sdk)
    const e1 = await createToken(w, FIXTURE.label.a)
    const e2 = await pairedPrincipal(t, w, { label: FIXTURE.label.b, name: fresh(FIXTURE.name.a) })
    const sub = await listen(e2.client)
    t.after(() => sub.close().catch(() => {}))
    const e3 = await pairedPrincipal(t, w, { label: FIXTURE.label.c })
    await saveTokens(w, (await tokensOf(w)).map((i) => (i.key === e3.entryKey ? { ...i, enabled: false } : i)))
    await eventually(async () => (await entryOf(w, e2.entryKey))?.connected === true && (await entryOf(w, e3.entryKey))?.enabled === false)
    const answer = await settingsState(w)
    assert.match(answer.headers.get(HTTP.contentType) ?? '', HTTP.json)
    assert.match(answer.headers.get(HTTP.cacheControl) ?? '', HTTP.noStore)
    const json = answer.json
    assert.deepEqual(Object.keys(json).sort(), [...SURFACE.stateKeys])
    assert.equal(json.ok, true)
    assert.deepEqual(json.entries.map((e) => e.key), (await tokensOf(w)).map((i) => i.key), 'entries are not in settings order')
    for (const e of json.entries) assert.deepEqual(Object.keys(e).sort(), [...SURFACE.stateEntryKeys])
    const r1 = json.entries.find((e) => e.key === e1.entryKey)
    assert.deepEqual([r1.paired, r1.id, r1.name, r1.lastSeenAt, r1.connected], [false, null, null, null, false])
    const r2 = json.entries.find((e) => e.key === e2.entryKey)
    assert.deepEqual([r2.paired, r2.id, r2.name, r2.connected, r2.enabled], [true, e2.id, e2.paired.name, true, true])
    assert.equal(typeof r2.lastSeenAt, 'number')
    const r3 = json.entries.find((e) => e.key === e3.entryKey)
    // e3 paired without a name: since the user's decision of 2026-11-21 it holds a generated name.
    assert.deepEqual([r3.paired, r3.id, r3.name, r3.enabled, r3.connected], [true, e3.id, e3.paired.name, false, false], 'a disabled entry paired without a name')
    assert.deepEqual(Object.keys(json.approval).sort(), [...SURFACE.approvalKeys])
  })
  row(sdk, 'AUTH-UC-09', 'post (no secret)', 'no token value or digest anywhere in the state answer', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const text = (await settingsState(w)).text
    assert.ok(!text.includes(p.made.value), 'the value')
    assert.ok(!new RegExp(K1.TOKEN_VALUE.generatedPrefix + '[A-Za-z0-9_-]{20,}').test(text), 'a token value')
    const digest = (await import('node:crypto')).createHash(K1.TOKEN_VALUE.digestAlgorithm).update(p.made.value).digest()
    for (const enc of ['hex', 'base64', 'base64url']) assert.ok(!text.includes(digest.toString(enc)), 'the digest (' + enc + ')')
  })
  row(sdk, 'AUTH-UC-09', 'A1', 'set_name → the state answer shows the new name on the next read', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w, { name: fresh(FIXTURE.name.a) })
    const renamed = fresh(FIXTURE.name.renamed)
    await okCall(p.client, TOOL.setName, { name: renamed })
    assert.equal((await entryOf(w, p.entryKey)).name, renamed)
  })
  row(sdk, 'AUTH-UC-09', 'E1', 'the read-only fields are not settings: saving the list never changes paired, id or name', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w, { name: fresh(FIXTURE.name.a) })
    const before = await entryOf(w, p.entryKey)
    await saveTokens(w, (await tokensOf(w)).map((i) => (i.key === p.entryKey ? { ...i, label: FIXTURE.label.copy } : i)))
    await eventually(async () => (await entryOf(w, p.entryKey))?.label === FIXTURE.label.copy)
    const after = await entryOf(w, p.entryKey)
    assert.deepEqual([after.paired, after.id, after.name], [before.paired, before.id, before.name])
    assert.ok((await tokensOf(w)).every((i) => Object.keys(i).sort().join() === [...S.itemKeys].join()), 'the tokens items gained a read-only field')
  })
  row(sdk, 'AUTH-UC-09', 'owner-only', 'GET state without the owner\'s login is refused', async () => {
    const w = await main(sdk)
    assert.notEqual((await w.raw('GET', SURFACE.route.state)).status, HTTP.ok)
  })
}

// ============================================================ EVT-EP-04 end to end, R4 re-enable
function isolationRows(sdk) {
  /** One event committed to `p` through a real producer: a Hand over of a fresh session to `p` (the UI route). */
  async function handOverTo(w, p) {
    const { sessionId } = await w.call('createSession', { name: fresh(FIXTURE.folder) })
    const r = await uiPost(w, SURFACE.route.uiHandOver, { sessionId, principalKey: p.principalKey })
    assert.equal(r.status, HTTP.ok, r.text)
    return sessionId
  }
  row(sdk, 'EVT-EP-04', '1–2, 5', 'P and Q each listening: an event to P hints only P\'s stream; to Q only Q\'s; Q\'s mailbox holds nothing of P\'s', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w, { label: FIXTURE.label.a })
    const q = await pairedPrincipal(t, w, { label: FIXTURE.label.b })
    const ps = await listen(p.client); t.after(() => ps.close().catch(() => {}))
    const qs = await listen(q.client); t.after(() => qs.close().catch(() => {}))
    const sp = await handOverTo(w, p)
    assert.ok(await eventually(() => p.hints.length >= 1), 'no hint on P')
    await quiet()
    assert.deepEqual(q.hints, [], 'Q got P\'s hint')
    assert.deepEqual((await pollUntil(q.client, () => true)).filter((e) => e.sourceSessionId === sp), [], 'Q polled P\'s event')
    const hintsP = p.hints.length
    await handOverTo(w, q)
    assert.ok(await eventually(() => q.hints.length >= 1), 'no hint on Q')
    await quiet()
    assert.equal(p.hints.length, hintsP, 'P got Q\'s hint')
    assert.ok(p.hints.every((u) => u === RESOURCE.events.uri))
  })
  row(sdk, 'EVT-EP-04', '3', 'ids differing only in case (agent / Agent) stay separate pairs: hints per pair', async (t) => {
    const w = await main(sdk)
    const base = fresh('case')
    const pm = await createToken(w, FIXTURE.label.a)
    const qm = await createToken(w, FIXTURE.label.b)
    const p = await machineClient(t, w, { id: base.toLowerCase(), value: pm.value })
    const q = await machineClient(t, w, { id: base.toUpperCase(), value: qm.value })
    await okCall(p.client, TOOL.pair, {})
    await okCall(q.client, TOOL.pair, {})
    const keys = await principalsOf(w)
    const pk = keys.find((x) => x.id === base.toLowerCase()).key
    const ps = await listen(p.client); t.after(() => ps.close().catch(() => {}))
    const qs = await listen(q.client); t.after(() => qs.close().catch(() => {}))
    await handOverTo(w, { principalKey: pk })
    assert.ok(await eventually(() => p.hints.length >= 1))
    await quiet()
    assert.deepEqual(q.hints, [])
  })
  row(sdk, 'EVT-EP-04', '4', 'P\'s entry disabled: P\'s stream closes; Q\'s stays open and keeps receiving its own hints', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w, { label: FIXTURE.label.a })
    const q = await pairedPrincipal(t, w, { label: FIXTURE.label.b })
    const ps = await listen(p.client)
    const qs = await listen(q.client); t.after(() => qs.close().catch(() => {}))
    await saveTokens(w, (await tokensOf(w)).map((i) => (i.key === p.entryKey ? { ...i, enabled: false } : i)))
    const closed = await Promise.race([ps.closed.then(() => true), new Promise((r) => setTimeout(() => r(false), BUDGET.readyMs))])
    assert.equal(closed, true, 'P\'s stream stayed open')
    const qClosed = await Promise.race([qs.closed.then(() => true), new Promise((r) => setTimeout(() => r(false), BUDGET.quietMs))])
    assert.equal(qClosed, false, 'Q\'s stream closed')
    await handOverTo(w, q)
    assert.ok(await eventually(() => q.hints.length >= 1), 'Q got no hint after P\'s disable')
  })
  row(sdk, 'EVT-EP-04', '6', 'a burst of handovers to P: at least one hint, never more hints than commits; Q nothing', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w, { label: FIXTURE.label.a })
    const q = await pairedPrincipal(t, w, { label: FIXTURE.label.b })
    const ps = await listen(p.client); t.after(() => ps.close().catch(() => {}))
    const qs = await listen(q.client); t.after(() => qs.close().catch(() => {}))
    for (let i = 0; i < FIXTURE.burst; i++) await handOverTo(w, p)
    assert.ok(await eventually(() => p.hints.length >= 1))
    await quiet()
    assert.ok(p.hints.length <= FIXTURE.burst, 'more hints than commits: ' + p.hints.length)
    assert.deepEqual(q.hints, [])
  })
  row(sdk, 'C-WIRE-R4', 're-enable (ST)', 'Enabled(held events) --disable--> Held (not pollable) --re-enable--> Enabled: the same eventIds are pollable again', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    await handOverTo(w, p)
    const first = await pollUntil(p.client)
    const ids = first.map((e) => e.eventId)
    const set = async (enabled) => saveTokens(w, (await tokensOf(w)).map((i) => (i.key === p.entryKey ? { ...i, enabled } : i)))
    await set(false)
    assert.ok(await eventually(async () => (await entryOf(w, p.entryKey))?.enabled === false))
    await set(true)
    assert.ok(await eventually(async () => (await entryOf(w, p.entryKey))?.enabled === true))
    // The old access token died with the disable (R-OA-06): a new client exchanges again.
    const again = await machineClient(t, w, { id: p.id, value: p.made.value })
    const back = await pollUntil(again.client)
    assert.deepEqual(back.map((e) => e.eventId).filter((id) => ids.includes(id)).sort(), [...ids].sort(), 'held events changed identity')
  })
  row(sdk, 'C-WIRE-R4', 'designate moves held messages', 'designating a paired entry moves held no-recipient messages into its mailbox', null, undefined, LATER.withdrawnDesignated)
  row(sdk, 'C-WIRE-R9', 'ack frees room', 'inbox_ack frees room for the designated agent\'s held messages (maxQueuedInputs small)', null, undefined, LATER.withdrawnDesignated)
  row(sdk, 'C-WIRE-R8', 'inbox_ack', 'inbox_ack of polled events with their digests → acked n; the next poll no longer returns them', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    await handOverTo(w, p)
    const events = await pollUntil(p.client)
    const acked = await okCall(p.client, TOOL.inboxAck, { receipts: receipts(events) })
    assert.equal(acked.acked, events.length)
    const after = await okCall(p.client, TOOL.inboxPoll, {})
    assert.deepEqual(after.events.filter((e) => events.some((x) => x.eventId === e.eventId)), [])
  })
  row(sdk, 'C-WIRE-R8', 'inbox_ack unknown', 'inbox_ack with an unknown event id → unknown-event, nothing acked', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    await refused(p.client, TOOL.inboxAck, { receipts: [{ eventId: 'fbtest-unknown', payloadDigest: '0'.repeat(64) }] }, REFUSAL.unknownEvent)
  })
}

// ============================================================ workspace placement through stock MCP
function placementRows(sdk) {
  const suite = 'workspace-placement'
  const args = (message, folder) => ({ title: FIXTURE.title, message, attachments: [], ...(folder === undefined ? {} : { folder }) })
  const register = (w, title) => w.call('registerWorkspace', { name: fresh(suite), title })
  const folderHelp = (text) => {
    assert.match(text ?? '', /workspace[\s_-]*(?:id|identifier)/i, 'does not explain the workspace ID form')
    assert.match(text ?? '', /absolute(?:[\s-]+(?:existing|directory|filesystem|folder))*[\s-]+(?:path|director(?:y|ies)|folder)/i, 'does not explain the absolute path form')
  }
  row(sdk, suite, 'discovery', 'the published session_start guidance distinguishes workspace IDs and existing absolute directories from names', async (t) => {
    const w = await scenario(sdk, suite)
    const { client } = await pairedPrincipal(t, w)
    const start = (await client.listTools()).tools.find(({ name }) => name === TOOL.sessionStart)
    assert.ok(start?.inputSchema.required.includes('folder'), 'folder is not advertised as required')
    assert.equal(start.inputSchema.properties.folder.type, 'string')
    const guidance = [start.description, start.inputSchema.properties.folder.description].filter(Boolean).join(' ')
    folderHelp(guidance)
    const naming = /\b(?:(?:workspace|display)[\s-]+)*(?:names?|titles?)\b/i
    const exclusion = /\b(?:not|never|reject\w*|unsupported|invalid|cannot|instead of|rather than)\b/i
    assert.ok(guidance.split(/[.!?;]/).some((clause) => naming.test(clause) && exclusion.test(clause)), 'no warning that display names are not accepted')
  })
  row(sdk, suite, 'placement DT', 'ID and canonical path attach to the exact group; an explicitly requested unregistered directory stays ungrouped', async (t) => {
    const w = await scenario(sdk, suite)
    const { client } = await pairedPrincipal(t, w)
    const title = fresh('Same display title')
    const first = await register(w, title)
    const second = await register(w, title)
    assert.notEqual(first.id, second.id)
    const alias = path.join(w.home, fresh('directory-alias'))
    fs.symlinkSync(second.path, alias, 'dir')
    const loose = await w.call('folder', { name: fresh('ungrouped') })
    for (const [folder, cwd, group] of [[first.id, first.path, first.id], [second.path, second.path, second.id], [alias, second.path, second.id], [loose, loose, null]]) {
      const before = await w.call('placementState')
      const message = fresh(FIXTURE.message)
      const s = await wireSuccess(client, TOOL.sessionStart, args(message, folder))
      assert.equal(s.managed, true)
      assert.equal(s.workspaceError, undefined)
      await w.call('waitIdle', { sessionId: s.sessionId })
      const after = await w.call('placementState')
      const added = after.sessions.filter(({ id }) => !before.sessions.some((old) => old.id === id))
      assert.deepEqual(added.map(({ id }) => id), [s.sessionId], 'not exactly one new persisted session')
      assert.equal(fs.realpathSync(added[0].cwd), fs.realpathSync(cwd), 'wrong working directory')
      assert.deepEqual(after.groups.filter(({ members }) => members.includes(s.sessionId)).map(({ id }) => id), group === null ? [] : [group], 'wrong workspace membership')
      const seen = await w.call('session', { sessionId: s.sessionId })
      assert.ok(seen.requests > 0 && seen.events.some((e) => e.type === 'user/message' && e.text.includes(message)), 'first message did not reach the new session')
    }
  })
  row(sdk, suite, 'refusal EP/BVA', 'invalid form, unresolved selector and unusable location: explain accepted forms; never create, attach or send', async (t) => {
    const w = await scenario(sdk, suite)
    const { client } = await pairedPrincipal(t, w)
    const named = await register(w, 'Default workspace')
    const ordinary = await register(w, fresh('Ordinary title'))
    const stale = await register(w, fresh('Stale title'))
    // Remove only this disposable, empty fixture directory, never a user workspace.
    assert.equal(path.dirname(stale.path), path.join(w.home, 'work'))
    fs.rmdirSync(stale.path)
    const missing = path.join(w.home, fresh('missing'))
    const file = path.join(w.home, fresh('regular-file'))
    fs.writeFileSync(file, '', { flag: 'wx' })
    const { forbidden, invalidArguments, unknownSession } = REFUSAL
    const privateId = fresh('private-unresolved-selector')
    const privateValues = [privateId, ordinary.title, stale.id, stale.path, w.home, path.basename(missing), path.basename(file)]
    for (const [folder, code] of [[undefined, invalidArguments], ['', invalidArguments], [false, invalidArguments], [null, invalidArguments],
      ['x', forbidden], [privateId, forbidden], ['relative/directory', forbidden], [named.title, forbidden], [ordinary.title, forbidden],
      [missing, unknownSession], [file, unknownSession], [stale.id, unknownSession]]) {
      const before = await w.call('placementState')
      const result = await wireRefusal(client, TOOL.sessionStart, args(fresh(FIXTURE.message), folder), code)
      folderHelp(result.message)
      // wireRefusal also checks that the sole text block decodes to this exact structured envelope.
      for (const sentinel of privateValues) assert.ok(!JSON.stringify(result).includes(sentinel), 'refusal disclosed a private selector or host path')
      assert.deepEqual(await w.call('placementState'), before, 'refusal created a session, changed group membership or sent a turn')
      assert.equal(fs.existsSync(missing), false)
      assert.equal(fs.existsSync(stale.path), false)
    }
  })
}

// ============================================================ the V3 domain through MCP (gap report B rows)
function sessionRows(sdk) {
  row(sdk, 'MGD-07 / OUT-05', 'session_start (UC)', 'session_start in an absolute folder → {sessionId, managed: true}; the session exists and its first turn ran; managed() names the principal', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    assert.equal(s.managed, true)
    assert.ok((await w.call('sessionIds')).includes(s.sessionId))
    const managed = (await w.service(SURFACE.service.handover, 'managed')).value
    assert.deepEqual(managed.filter((m) => m.sessionId === s.sessionId).map((m) => m.principal.key), [p.principalKey])
    assert.ok((await w.call('session', { sessionId: s.sessionId })).requests >= 1, 'the first message started no turn')
  })
  for (const [label, folder] of [['relative', 'relative/folder'], ['missing', '/fbtest-wire-no-such-folder-' + process.pid]]) {
    row(sdk, 'OUT-07', `session_start folder EP (${label})`, `a ${label} folder → refused; nothing created; the folder is never created`, async (t) => {
      const w = await main(sdk)
      const p = await pairedPrincipal(t, w)
      const before = (await w.call('sessionIds')).length
      const s = await call(p.client, TOOL.sessionStart, { folder, title: FIXTURE.title, message: FIXTURE.message, attachments: [] })
      assert.equal(s.ok, false, JSON.stringify(s))
      assert.equal((await w.call('sessionIds')).length, before)
      if (path.isAbsolute(folder)) assert.equal(fs.existsSync(folder), false)
    })
  }
  for (const [label, title, code] of [['empty title', '', REFUSAL.limitExceeded], ['invisible title', '\u200b\u200b', REFUSAL.limitExceeded]]) {
    row(sdk, 'ORD-02', `session_start title EP (${label})`, `${label} → ${code} before anything is created`, async (t) => {
      const w = await main(sdk)
      const p = await pairedPrincipal(t, w)
      const before = (await w.call('sessionIds')).length
      const folder = await w.call('folder', { name: fresh(FIXTURE.folder) })
      await refused(p.client, TOOL.sessionStart, { folder, title, message: FIXTURE.message, attachments: [] }, code)
      assert.equal((await w.call('sessionIds')).length, before)
    })
  }
  row(sdk, 'SSM-02', 'session_start model', 'session_start with model → every model request of the session uses that model', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client, { model: FIXTURE.otherRoute })
    const requests = await w.call('requests', { sessionId: s.sessionId })
    assert.ok(requests.length >= 1)
    assert.deepEqual([...new Set(requests.map((r) => r.model))], [FIXTURE.otherModel])
  })
  row(sdk, 'SSM-10', 'session_start bad model', 'an unknown model → refused before creation', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const before = (await w.call('sessionIds')).length
    const folder = await w.call('folder', { name: fresh(FIXTURE.folder) })
    const s = await call(p.client, TOOL.sessionStart, { folder, title: FIXTURE.title, message: FIXTURE.message, attachments: [], model: 'fbtest-no-such-model' })
    assert.equal(s.ok, false, JSON.stringify(s))
    assert.equal((await w.call('sessionIds')).length, before)
  })
  // OUT-13 (BVA on maxMessageBytes), applied live: a small bound so the case stays cheap.
  row(sdk, 'OUT-13', 'session_message BVA', `maxMessageBytes = L: a message of L bytes is delivered; L+1 → ${REFUSAL.limitExceeded}, nothing delivered`, async (t) => {
    const w = await main(sdk)
    const was = (await settingsValue(w))[S.maxMessageBytes]
    t.after(() => setLimit(w, S.maxMessageBytes, was))
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    assert.equal((await setLimit(w, S.maxMessageBytes, FIXTURE.smallLimit)).ok, true)
    const ok = await okCall(p.client, TOOL.sessionMessage, { sessionId: s.sessionId, message: noteOfBytes(FIXTURE.smallLimit, FIXTURE.euro), attachments: [] })
    assert.ok(['delivered', 'unconfirmed'].includes(ok.status))
    await w.call('waitIdle', { sessionId: s.sessionId })
    const before = (await w.call('session', { sessionId: s.sessionId })).events.length
    await refused(p.client, TOOL.sessionMessage, { sessionId: s.sessionId, message: noteOfBytes(FIXTURE.smallLimit + 1), attachments: [] }, REFUSAL.limitExceeded)
    await quiet()
    assert.equal((await w.call('session', { sessionId: s.sessionId })).events.length, before, 'something was delivered')
  })
  row(sdk, 'OUT-01', 'session_message (UC)', 'session_message to an idle managed session → {status: delivered}; the text reaches the session verbatim and a turn runs', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    const text = fresh(FIXTURE.message)
    assert.equal((await okCall(p.client, TOOL.sessionMessage, { sessionId: s.sessionId, message: text, attachments: [] })).status, 'delivered')
    assert.ok(await eventually(async () => (await w.call('session', { sessionId: s.sessionId })).events.some((e) => e.type === 'user/message' && e.text.includes(text))))
  })
  row(sdk, 'OUT-03 / C-WIRE-R10', 'unknown session (EP)', `session_message / redirect / stop / read / release of a nonexistent session → ${REFUSAL.unknownSession}`, async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const sid = FIXTURE.unknownSession
    for (const [tool, args] of [
      [TOOL.sessionMessage, { sessionId: sid, message: FIXTURE.message, attachments: [] }],
      [TOOL.sessionRedirect, { sessionId: sid, message: FIXTURE.message, attachments: [] }],
      [TOOL.sessionStop, { sessionId: sid }],
      [TOOL.sessionRead, { sessionId: sid, maxMessages: 5, maxBytes: 1024 }],
      [TOOL.sessionRelease, { sessionId: sid, reason: FIXTURE.reason }],
    ]) await refused(p.client, tool, args, REFUSAL.unknownSession)
  })
  row(sdk, 'OUT-03 / STP-07', 'not managed (EP)', `session_message / stop / redirect of the user's own session → ${REFUSAL.notManaged}; nothing delivered`, async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const { sessionId } = await w.call('createSession', { name: fresh(FIXTURE.folder) })
    for (const [tool, args] of [
      [TOOL.sessionMessage, { sessionId, message: FIXTURE.message, attachments: [] }],
      [TOOL.sessionRedirect, { sessionId, message: FIXTURE.message, attachments: [] }],
      [TOOL.sessionStop, { sessionId }],
    ]) await refused(p.client, tool, args, REFUSAL.notManaged)
    assert.equal((await w.call('session', { sessionId })).requests, 0)
  })
  row(sdk, 'OUT-03', 'other principal (EP)', `session_message / read of a session another principal manages → ${REFUSAL.forbidden}`, async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w, { label: FIXTURE.label.a })
    const q = await pairedPrincipal(t, w, { label: FIXTURE.label.b })
    const s = await startSession(w, p.client)
    await refused(q.client, TOOL.sessionMessage, { sessionId: s.sessionId, message: FIXTURE.message, attachments: [] }, REFUSAL.forbidden)
    await refused(q.client, TOOL.sessionRead, { sessionId: s.sessionId, maxMessages: 5, maxBytes: 1024 }, REFUSAL.forbidden)
  })
  row(sdk, 'PLAT-EP-02', '4a (sessions_list)', 'sessions_list lists the caller\'s own managed session and omits one another principal manages (1.23)', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w, { label: FIXTURE.label.a })
    const q = await pairedPrincipal(t, w, { label: FIXTURE.label.b })
    const sp = await startSession(w, p.client)
    const sq = await startSession(w, q.client)
    const listed = (await okCall(p.client, TOOL.sessionsList, { limit: 100 })).sessions.map((x) => x.sessionId)
    assert.ok(listed.includes(sp.sessionId), 'own session not listed')
    assert.ok(!listed.includes(sq.sessionId), 'another principal\'s session listed')
  })
  row(sdk, 'OUT-10b', 'session_stop idle', 'session_stop on an idle managed session → {stopped: true}; still managed', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    assert.equal((await okCall(p.client, TOOL.sessionStop, { sessionId: s.sessionId })).stopped, true)
    assert.ok((await w.service(SURFACE.service.handover, 'managed')).value.some((m) => m.sessionId === s.sessionId))
  })
  row(sdk, 'RDR-06', 'session_redirect idle', 'session_redirect on an idle managed session starts a turn with the message', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    const text = fresh(FIXTURE.message)
    const r = await okCall(p.client, TOOL.sessionRedirect, { sessionId: s.sessionId, message: text, attachments: [] })
    assert.ok(['delivered', 'unconfirmed'].includes(r.status))
    assert.ok(await eventually(async () => (await w.call('session', { sessionId: s.sessionId })).events.some((e) => e.type === 'user/message' && e.text.includes(text))))
  })
  row(sdk, 'MGD-08 / MGD-09b', 'session_release (ST)', 'Managed(P) --session_release(reason)--> Unmanaged: {sessionId, managed: false}; managed() no longer lists it; a second release → not-managed', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    const r = await okCall(p.client, TOOL.sessionRelease, { sessionId: s.sessionId, reason: FIXTURE.reason })
    assert.deepEqual([r.sessionId, r.managed], [s.sessionId, false])
    assert.ok(!(await w.service(SURFACE.service.handover, 'managed')).value.some((m) => m.sessionId === s.sessionId))
    await refused(p.client, TOOL.sessionRelease, { sessionId: s.sessionId, reason: FIXTURE.reason }, REFUSAL.notManaged)
  })
  row(sdk, 'MGD-09b', 'release reason empty', 'session_release with reason \'\' → reason-required; the session stays managed', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    await refused(p.client, TOOL.sessionRelease, { sessionId: s.sessionId, reason: '' }, REFUSAL.reasonRequired)
    assert.ok((await w.service(SURFACE.service.handover, 'managed')).value.some((m) => m.sessionId === s.sessionId))
  })
  row(sdk, 'RDR-07 / PLAT-EP-02', '5 (expired hostRef)', `session_message with an unknown attachment hostRef → ${REFUSAL.expired}; nothing sent`, async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    await refused(p.client, TOOL.sessionMessage, { sessionId: s.sessionId, message: FIXTURE.message, attachments: ['fbtest-no-such-hostref'] }, REFUSAL.expired)
  })
  row(sdk, 'C-TOOLS', 'attachment_put', 'attachment_put of a small PNG in one chunk → {hostRef, expiresAt}; it delivers once with session_message, and a second use → expired', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    const bytes = Buffer.from(FIXTURE.png, 'base64')
    const sha256 = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')
    const put = await okCall(p.client, TOOL.attachmentPut, { transferId: fresh('xfer'), total: bytes.length, sha256, mediaType: FIXTURE.pngType, chunks: [FIXTURE.png] })
    assert.equal(typeof put.hostRef, 'string')
    await okCall(p.client, TOOL.sessionMessage, { sessionId: s.sessionId, message: FIXTURE.message, attachments: [put.hostRef] })
    await w.call('waitIdle', { sessionId: s.sessionId })
    await refused(p.client, TOOL.sessionMessage, { sessionId: s.sessionId, message: FIXTURE.message, attachments: [put.hostRef] }, REFUSAL.expired)
  })
  // CONN-REPORT A1/B (user-approved 2026-11-21): the turn end reaches the manager as the report {sessionId, outcome, ...}; no state event.
  row(sdk, 'WATCH-UC-01', 'turn-finished (DSH)', 'a managed session\'s turn end reaches its manager as one turn-finished event naming the session, outcome completed; no state event', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    const events = await pollUntil(p.client, (e) => e.some((x) => x.type === EVENT_TYPE.turnFinished && x.sourceSessionId === s.sessionId))
    const turns = events.filter((x) => x.type === EVENT_TYPE.turnFinished && x.sourceSessionId === s.sessionId)
    assert.deepEqual(turns.map((x) => [x.payload.sessionId, x.payload.outcome]), [[s.sessionId, K1.TURN_OUTCOME.completed]])
    assert.deepEqual(events.filter((x) => x.type === EVENT_TYPE.state), [])
  })
}

// ============================================================ R11 session_read roles
function readRows(sdk) {
  row(sdk, 'C-WIRE-R11', 'principal role (UC)', `a message the principal sent with session_message reads back with role ${READ_ROLE.principal}, never fishball; the user's and the assistant's keep theirs`, async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    const text = fresh(FIXTURE.message)
    await okCall(p.client, TOOL.sessionMessage, { sessionId: s.sessionId, message: text, attachments: [] })
    await w.call('waitIdle', { sessionId: s.sessionId })
    await w.call('drive', { sessionId: s.sessionId, text: FIXTURE.userText })
    const read = await okCall(p.client, TOOL.sessionRead, { sessionId: s.sessionId, maxMessages: 50, maxBytes: 65536 })
    const roles = read.messages.map((m) => m.role)
    assert.ok(read.messages.some((m) => m.role === READ_ROLE.principal && m.text.includes(text)), 'the principal\'s message: ' + JSON.stringify(read.messages))
    assert.ok(!roles.includes('fishball'), 'a fishball role')
    assert.ok(read.messages.some((m) => m.role === READ_ROLE.user && m.text.includes(FIXTURE.userText)), 'the user\'s message')
    assert.ok(roles.includes(READ_ROLE.assistant), 'no assistant message')
    assert.deepEqual(roles.filter((r) => !Object.values(READ_ROLE).includes(r)), [])
  })
  row(sdk, 'ROL-20 / ROL-22', 'bounds (BVA)', 'session_read maxMessages 1 → at most one message, the newest, truncated true; maxMessages 0 → none, truncated', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    await w.call('drive', { sessionId: s.sessionId })
    const one = await okCall(p.client, TOOL.sessionRead, { sessionId: s.sessionId, maxMessages: 1, maxBytes: 65536 })
    assert.equal(one.messages.length, 1)
    assert.equal(one.truncated, true)
    const all = await okCall(p.client, TOOL.sessionRead, { sessionId: s.sessionId, maxMessages: 50, maxBytes: 65536 })
    assert.equal(one.messages[0].seq, all.messages.at(-1).seq, 'not the newest')
    const none = await call(p.client, TOOL.sessionRead, { sessionId: s.sessionId, maxMessages: 0, maxBytes: 65536 })
    if (none.ok) assert.deepEqual([none.messages, none.truncated], [[], true])
    else assert.equal(none.code, REFUSAL.limitExceeded)
  })
  // The two read caps stay in the row's schema (Config({}) lists them: readSessionMessages 12, readSessionBytes 12288).
  row(sdk, 'LRR-01 / L50', 'readSessionMessages live (ST)', 'readSessionMessages := 1 → a session_read asking 50 messages gets at most 1, truncated; restored → more again', async (t) => {
    const w = await main(sdk)
    const field = 'readSessionMessages'
    const was = (await settingsValue(w))[field]
    t.after(() => setLimit(w, field, was))
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    await w.call('drive', { sessionId: s.sessionId })
    assert.equal((await setLimit(w, field, 1)).ok, true)
    const capped = await call(p.client, TOOL.sessionRead, { sessionId: s.sessionId, maxMessages: 50, maxBytes: 65536 })
    if (capped.ok) assert.deepEqual([capped.messages.length <= 1, capped.truncated], [true, true], JSON.stringify(capped))
    else assert.equal(capped.code, REFUSAL.limitExceeded)
    assert.equal((await setLimit(w, field, was)).ok, true)
    assert.ok((await okCall(p.client, TOOL.sessionRead, { sessionId: s.sessionId, maxMessages: 50, maxBytes: 65536 })).messages.length > 1)
  })
}

// ============================================================ R12, R10: the UI backend in the row
function uiRows(sdk) {
  row(sdk, 'C-WIRE-R12', 'state route', 'GET /api/dsh-connector/ui/state (owner) answers JSON with the snapshot keys', async () => {
    const w = await main(sdk)
    const r = await w.owner('GET', SURFACE.route.uiState)
    assert.equal(r.status, HTTP.ok, r.text)
    assert.equal(typeof r.json, 'object')
  })
  row(sdk, 'C-WIRE-R10', 'unknown session (DT)', `Hand over / Take back of a nonexistent session id → ${SURFACE.k3.unknownSession} (DSH's real sessions)`, async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const h = await w.service(SURFACE.service.handover, 'handOver', FIXTURE.unknownSession, p.principalKey)
    assert.deepEqual(h.value, { ok: false, code: SURFACE.k3.unknownSession })
    const tb = await w.service(SURFACE.service.handover, 'takeBack', FIXTURE.unknownSession)
    assert.deepEqual(tb.value, { ok: false, code: SURFACE.k3.unknownSession })
    const route = await uiPost(w, SURFACE.route.uiHandOver, { sessionId: FIXTURE.unknownSession, principalKey: p.principalKey })
    assert.equal(route.json?.code, SURFACE.k3.unknownSession, route.text)
  })
  /** maxMessageBytes set to L; a fresh session handed over (or not) with a note of `bytes`. */
  async function noteCase(t, w, bytes, unit) {
    const was = (await settingsValue(w))[S.maxMessageBytes]
    t.after(() => setLimit(w, S.maxMessageBytes, was))
    assert.equal((await setLimit(w, S.maxMessageBytes, FIXTURE.smallLimit)).ok, true)
    const p = await pairedPrincipal(t, w)
    const { sessionId } = await w.call('createSession', { name: fresh(FIXTURE.folder) })
    const r = await uiPost(w, SURFACE.route.uiHandOver, { sessionId, principalKey: p.principalKey, note: noteOfBytes(bytes, unit) })
    const managed = (await w.service(SURFACE.service.handover, 'managed')).value.some((m) => m.sessionId === sessionId)
    return { p, r, managed, sessionId }
  }
  row(sdk, 'C-WIRE-R12', 'note BVA (L)', 'maxMessageBytes = L: a Hand over note of exactly L UTF-8 bytes (multi-byte) is accepted; the session is managed and one handover event carries it', async (t) => {
    const w = await main(sdk)
    const { p, r, managed } = await noteCase(t, w, FIXTURE.smallLimit, FIXTURE.euro)
    assert.equal(r.status, HTTP.ok, r.text)
    assert.equal(managed, true)
    const events = await pollUntil(p.client, (e) => e.some((x) => x.type === EVENT_TYPE.handover))
    assert.equal(events.filter((x) => x.type === EVENT_TYPE.handover).length, 1)
  })
  row(sdk, 'C-WIRE-R12 / SND-08', 'note BVA (L+1)', `a note of L+1 bytes → 400 {ok: false, code: ${K2.CALL_CODE.limitExceeded}}; not managed; no event`, async (t) => {
    const w = await main(sdk)
    const { p, r, managed } = await noteCase(t, w, FIXTURE.smallLimit + 1)
    assert.deepEqual([r.status, r.json?.ok, r.json?.code], [HTTP.badRequest, false, K2.CALL_CODE.limitExceeded], r.text)
    assert.equal(managed, false)
    await quiet()
    assert.deepEqual((await okCall(p.client, TOOL.inboxPoll, {})).events, [])
  })
  row(sdk, 'C-WIRE-R12', 'note bound live (ST)', 'L --raise maxMessageBytes to L+1--> the L+1 note is accepted without a restart', async (t) => {
    const w = await main(sdk)
    const was = (await settingsValue(w))[S.maxMessageBytes]
    t.after(() => setLimit(w, S.maxMessageBytes, was))
    const p = await pairedPrincipal(t, w)
    assert.equal((await setLimit(w, S.maxMessageBytes, FIXTURE.smallLimit)).ok, true)
    const s1 = (await w.call('createSession', { name: fresh(FIXTURE.folder) })).sessionId
    assert.equal((await uiPost(w, SURFACE.route.uiHandOver, { sessionId: s1, principalKey: p.principalKey, note: noteOfBytes(FIXTURE.smallLimit + 1) })).status, HTTP.badRequest)
    assert.equal((await setLimit(w, S.maxMessageBytes, FIXTURE.smallLimit + 1)).ok, true)
    const r = await uiPost(w, SURFACE.route.uiHandOver, { sessionId: s1, principalKey: p.principalKey, note: noteOfBytes(FIXTURE.smallLimit + 1) })
    assert.equal(r.status, HTTP.ok, r.text)
  })
  row(sdk, 'C-WIRE-R12', 'takeback note', `Take back with a note over maxMessageBytes → 400 ${K2.CALL_CODE.limitExceeded}; still managed`, async (t) => {
    const w = await main(sdk)
    const was = (await settingsValue(w))[S.maxMessageBytes]
    t.after(() => setLimit(w, S.maxMessageBytes, was))
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    assert.equal((await setLimit(w, S.maxMessageBytes, FIXTURE.smallLimit)).ok, true)
    const r = await uiPost(w, SURFACE.route.uiTakeBack, { sessionId: s.sessionId, note: noteOfBytes(FIXTURE.smallLimit + 1) })
    assert.deepEqual([r.status, r.json?.code], [HTTP.badRequest, K2.CALL_CODE.limitExceeded], r.text)
    assert.ok((await w.service(SURFACE.service.handover, 'managed')).value.some((m) => m.sessionId === s.sessionId))
  })
  row(sdk, 'SND-09', 'owner-only', 'the Hand over route without the owner\'s login is not 200 and hands nothing over', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const { sessionId } = await w.call('createSession', { name: fresh(FIXTURE.folder) })
    const r = await w.raw('POST', SURFACE.route.uiHandOver, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, principalKey: p.principalKey }) })
    assert.notEqual(r.status, HTTP.ok)
    assert.ok(!(await w.service(SURFACE.service.handover, 'managed')).value.some((m) => m.sessionId === sessionId))
  })
  row(sdk, 'C-WIRE-R10', 'contributor emit (EP)', `a contributor's emit naming a nonexistent session → ${K2.EMIT_REFUSAL.eventInvalid}`, async () => {
    const w = await withContrib(sdk)
    const r = await w.call('emit', { contributor: FIXTURE.contributorName, event: { event: FIXTURE.contributorEvent, payload: {}, sessionId: FIXTURE.unknownSession } })
    assert.ok(!r.absent, 'the contributor fixture did not reach dshConnectorTools')
    assert.deepEqual(r.value, { ok: false, code: K2.EMIT_REFUSAL.eventInvalid })
  })
}

// ============================================================ R14 dshConnectorTokens
function tokensServiceRows(sdk) {
  row(sdk, 'C-WIRE-R14', 'createHosted', 'createHosted(instanceId) → {entryKey, label "Fishball (hosted)", value} once; the value authenticates; entryState enabled', async () => {
    const w = await main(sdk)
    const r = await w.call('createHosted', { instanceId: FIXTURE.instanceId })
    assert.deepEqual(Object.keys(r.made).sort(), [...SURFACE.k3.hostedFields])
    assert.equal(r.made.label, SURFACE.k3.hostedLabel)
    assert.match(r.made.value, new RegExp('^' + K1.TOKEN_VALUE.generatedPrefix))
    assert.equal((await tokenRequest(w, { clientId: fresh(FIXTURE.id.c), secret: r.made.value })).status, HTTP.ok)
    assert.equal((await w.service(SURFACE.service.tokens, 'entryState', r.made.entryKey)).value, SURFACE.k3.entryState.enabled)
  })
  row(sdk, 'C-WIRE-R14', 'entryState (ST)', 'enabled --disable--> disabled --delete--> deleted; an unknown key → deleted', async () => {
    const w = await main(sdk)
    const { made } = await w.call('createHosted', { instanceId: FIXTURE.instanceId })
    const st = async () => (await w.service(SURFACE.service.tokens, 'entryState', made.entryKey)).value
    await saveTokens(w, (await tokensOf(w)).map((i) => (i.key === made.entryKey ? { ...i, enabled: false } : i)))
    assert.ok(await eventually(async () => (await st()) === SURFACE.k3.entryState.disabled))
    await saveTokens(w, (await tokensOf(w)).filter((i) => i.key !== made.entryKey))
    assert.ok(await eventually(async () => (await st()) === SURFACE.k3.entryState.deleted))
    assert.equal((await w.service(SURFACE.service.tokens, 'entryState', 'fbtest-no-such-entry')).value, SURFACE.k3.entryState.deleted)
  })
  row(sdk, 'C-WIRE-R14', 'start sync (ST)', 'an entry disabled while DSH is down keeps its events held after the start; one re-enabled while down gets them back at start', async (t) => {
    const w = await scenario(sdk, 'restart')
    const p = await pairedPrincipal(t, w)
    const { sessionId } = await w.call('createSession', { name: fresh(FIXTURE.folder) })
    assert.equal((await uiPost(w, SURFACE.route.uiHandOver, { sessionId, principalKey: p.principalKey })).status, HTTP.ok)
    const ids = (await pollUntil(p.client)).map((e) => e.eventId)
    await p.client.close().catch(() => {})
    const flip = (enabled) => (config) => ({ ...config, [S.tokens]: config[S.tokens].map((i) => (i.key === p.entryKey ? { ...i, enabled } : i)) })
    await w.restart(flip(false))
    // A user-made entry: K3 entryState answers only for hosted ones, so the state route is read.
    assert.equal((await entryOf(w, p.entryKey))?.enabled, false)
    assert.equal((await tokenRequest(w, { clientId: p.id, secret: p.made.value })).status === HTTP.ok, false, 'a disabled entry authenticates')
    await w.restart(flip(true))
    const again = await machineClient(t, w, { id: p.id, value: p.made.value })
    const back = await pollUntil(again.client)
    assert.deepEqual(back.map((e) => e.eventId).filter((id) => ids.includes(id)).sort(), [...ids].sort(), 'held events were not released at start')
  })
}

// ============================================================ R15 revocation note (SessionNotes.system)
function revocationRows(sdk) {
  row(sdk, 'C-WIRE-R15', 'note (UC)', 'revoking (disabling) a managing entry writes one system note into each formerly managed session, starting no turn; the next turn carries it', async (t) => {
    const w = await main(sdk)
    const noteText = await revocationNoteText(sdk)
    const p = await pairedPrincipal(t, w)
    const s1 = await startSession(w, p.client)
    const s2 = await startSession(w, p.client)
    const requestsBefore = await Promise.all([s1, s2].map(async (s) => (await w.call('session', { sessionId: s.sessionId })).requests))
    await saveTokens(w, (await tokensOf(w)).map((i) => (i.key === p.entryKey ? { ...i, enabled: false } : i)))
    assert.ok(await eventually(async () => !(await w.service(SURFACE.service.handover, 'managed')).value.some((m) => [s1.sessionId, s2.sessionId].includes(m.sessionId))), 'still managed after the revocation')
    await quiet()
    for (const [i, s] of [s1, s2].entries()) {
      const view = await w.call('session', { sessionId: s.sessionId })
      assert.equal(view.requests, requestsBefore[i], 'the note started a turn in ' + s.sessionId)
      assert.equal(view.status, 'idle')
      await w.call('drive', { sessionId: s.sessionId })
      const notes = (await w.call('session', { sessionId: s.sessionId })).events.filter((e) => e.type === 'user/message' && e.sourceKind === SURFACE.noteSourceKind)
      assert.equal(notes.length, 1, 'system notes in ' + s.sessionId + ': ' + JSON.stringify(notes))
      assert.equal(notes[0].text, noteText)
    }
  })
  row(sdk, 'C-WIRE-R15', 'unknown session rejects', 'SessionNotes.system of an unknown session rejects (connector-internal: not reachable through a public surface)', null, 'C-REVOKE (module level: the revocation suite\'s port journal)')
}

// ============================================================ R16: the connector half (the embed-UI half is U-WIRE's)
function embedUiRows(sdk) {
  row(sdk, 'C-WIRE-R16', 'timing (connector half)', 'at app ready the row already provides dshConnectorUi, dshConnectorHandover, dshConnectorTools and dshConnectorTokens, and its owner routes answer', async () => {
    for (const w of [await main(sdk), await withUi(sdk)]) {
      const at = w.dsh.atReady
      // C-WIRE-2 (decision list item 9): the V2 services the probe also samples are gone, so they must be absent.
      const v2 = [SURFACE.service.v2, SURFACE.service.v2SessionState]
      for (const [name, s] of Object.entries(at.services)) assert.equal(s.present, !v2.includes(name), name + (v2.includes(name) ? ' (V2) was present' : ' was missing') + ' at app ready')
      assert.equal(at.createStatus, HTTP.ok, 'the notice route answered ' + at.createStatus + ' at app ready')
    }
  })
  row(sdk, 'C-WIRE-R16', 'no connector-missing (with embed-UI)', 'with the V3 connector loaded, embed-UI logs no connector-missing line', null, 'U-WIRE (owns dsh-connector-ui and its tests)')
  row(sdk, 'C-WIRE-R16', 'availability (no legacy)', 'embed-UI\'s availability answer has no legacy field; services {connector: true}', null, 'U-WIRE (owns dsh-connector-ui and its tests)')
  row(sdk, 'C-WIRE-R16', 'no V2 frame', 'embed-UI never draws the V2 frame and no longer reaches the V2 dshConnector service', null, 'U-WIRE (owns dsh-connector-ui and its tests)')
  row(sdk, 'C-WIRE-R16', 'V2 only = no connector', 'with only the V2 dshConnector, embed-UI logs one connector-missing error and registers nothing (Q-U1)', null, 'U-WIRE (owns dsh-connector-ui and its tests)')
  row(sdk, 'C-WIRE-R16', 'no limits card', 'embed-UI registers no connector Plugins card (the limits moved to the connector\'s settings page)', null, 'U-WIRE (owns dsh-connector-ui and its tests)')
}

// ============================================================ R20 CIMD with a non-loopback https redirect
function cimdRow(sdk) {
  row(sdk, 'C-WIRE-R20', 'remote https redirect (UC)', 'a CIMD whose redirect_uris holds https://remote.example/cb: /authorize shows the page; Authorize redirects there with a code', async (t) => {
    const { webWorld, authorizeParams, pkce } = await import('../oauth-web/subject.mjs')
    const { FIXTURE: WEB, PATHS: WP, PARAM } = await import('../oauth-web/constants.mjs')
    const w = await webWorld(t, sdk)
    w.cimd.document(FIXTURE.remoteClientId, { client_id: FIXTURE.remoteClientId, client_name: FIXTURE.remoteClientName, redirect_uris: [FIXTURE.remoteRedirect], token_endpoint_auth_method: 'none' })
    w.tokens.add(9, WEB.value(9))
    const { challenge } = pkce()
    const b = w.browser()
    const page = await b.open(WP.authorize, authorizeParams(w, challenge, { [PARAM.clientId]: FIXTURE.remoteClientId, [PARAM.redirectUri]: FIXTURE.remoteRedirect }))
    assert.equal(page.status, HTTP.ok, page.body)
    const res = await b.authorize({ token: WEB.value(9) })
    const location = new URL(res.headers.location)
    assert.equal(location.origin + location.pathname, FIXTURE.remoteRedirect)
    assert.equal(typeof location.searchParams.get(PARAM.code), 'string')
    assert.equal(res.status, APPROVAL_LISTENER.redirectStatus)
  })
}

// ============================================================ rows other tasks own (gap report (B), not coverable here)
function laterRows(sdk) {
  // C-WIRE-2 made these real in packages/dsh-connector/tests/interactions (suite dsh-connector.interactions, USE-CASES.md);
  // they are listed here as skipped with their new home so a run of this suite still says where each went.
  for (const [id, title, home] of [
    ['APR-*', 'permission requests of managed sessions become offers; approval_answer and its refusals, settlements, retirements', 'approval-cases.mjs'],
    ['FLW-* / PLN-* / VAL-* / HLD-* / RST-*', 'questions and plan reviews through question_answer', 'question-cases.mjs, restart-cases.mjs'],
    ['GRT-* / END-*', 'grants', 'grant-cases.mjs'],
    ['FRZ-* / prompt APR-*', 'prompts already showing (prompts_list, prompt_answer)', 'prompt-cases.mjs'],
    ['MSG-*', 'message_agent as the main-session tool of V3-managed sessions', 'messaging-cases.mjs'],
    ['MGD-04/05/15, MGD-14, DUR-01/06', 'the managed session\'s next model request has the managed tools', 'messaging-cases.mjs, restart-cases.mjs'],
  ]) row(sdk, id, 'C-WIRE-2', title, null, undefined, LATER.movedTo(home))
  // The user (2026-11-16/17): "不给ask_agent工具"; "list_user_messages is deleted".
  row(sdk, 'ASK-* / DIR-* / QUO-* / PAS-*', 'C-WIRE-2', 'ask_agent, its direct-call hints, quotes and passes', null, undefined, LATER.withdrawnAsk)
  row(sdk, 'LUM-*', 'C-WIRE-2', 'list_user_messages as a main-session tool', null, undefined, LATER.withdrawnList)
  row(sdk, 'PLAT-EP-02', '6 (wire-2 tools)', 'approvals_list of a real managed session with nothing pending, prompts_list and grants_list → []', async (t) => {
    const w = await main(sdk)
    const p = await pairedPrincipal(t, w)
    const s = await startSession(w, p.client)
    assert.deepEqual((await okCall(p.client, TOOL.approvalsList, { sessionId: s.sessionId })).approvals, [])
    assert.deepEqual((await okCall(p.client, TOOL.promptsList, {})).prompts, [])
    assert.deepEqual((await okCall(p.client, TOOL.grantsList, {})).grants, [])
  })
  row(sdk, 'HOST-*', 'hosted child', 'a launched hosted child pairing with createHosted\'s value', null, LATER.hostedChild)
}
