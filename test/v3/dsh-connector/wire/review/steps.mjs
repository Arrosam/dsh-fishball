/** Reusable black-box steps: only native fixture IPC, owner HTTP, raw HTTP, and the stock SDK. */
import assert from 'node:assert/strict'
import { until } from '../../../../support/util.mjs'
import { sdkClient } from '../world.mjs'
import { BUDGET, DATA, EXPECT, FIXTURE, HTTP, K1, LIMITS, OP, SCHEMA_TEXT, SURFACE, V3_SERVICES } from './constants.mjs'

const S = SURFACE.settings
let sequence = 0
export const fresh = (base = DATA.id) => `${base}-${process.pid}-${++sequence}`
export const eventually = (predicate) => until(predicate, BUDGET.readyMs, BUDGET.pollMs)
export const tokensOf = async (w) => (await w.settings()).value[S.tokens]
export const saveTokens = (w, tokens) => w.call(OP.settingsMutate, { ops: [{ op: 'set', path: [S.tokens], value: tokens }] })
export const duplicateOf = (tokens, key, label) => [...tokens, { label, enabled: true, key }]

export async function ownerJson(w, method, route, body) {
  const reply = await w.owner(method, route, body)
  assert.equal(reply.status, HTTP.ok, `${route}: ${reply.text}`)
  assert.equal(reply.json?.ok, true, `${route}: ${reply.text}`)
  return reply.json
}

export const createToken = (w, label = DATA.label) => ownerJson(w, K1.HTTP_METHOD.post, SURFACE.route.create, { label })
export const stateOf = (w) => ownerJson(w, K1.HTTP_METHOD.get, SURFACE.route.state)
export const noticeOf = (w) => ownerJson(w, K1.HTTP_METHOD.get, SURFACE.route.notice)

/** One tool result must preserve K1's structured + text result and its refusal flag. */
export async function call(client, tool, args = {}) {
  const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: BUDGET.rpcMs })
  const value = result.structuredContent
  assert.equal(typeof value?.ok, 'boolean', `${tool}: missing K1 envelope`)
  assert.equal(result.isError === true, !value.ok, `${tool}: wrong isError`)
  assert.equal(result.content?.length, EXPECT.oneTextBlock, `${tool}: expected one JSON text block`)
  assert.equal(result.content.at(0).type, EXPECT.textBlock)
  assert.deepEqual(JSON.parse(result.content.at(0).text), value)
  return value
}
export async function okCall(client, tool, args) {
  const value = await call(client, tool, args)
  assert.equal(value.ok, true, `${tool}: ${JSON.stringify(value)}`)
  return value
}
export async function refusedCall(client, tool, args, code) {
  const value = await call(client, tool, args)
  assert.deepEqual([value.ok, value.code], [false, code], `${tool}: ${JSON.stringify(value)}`)
  return value
}

/** The SDK and OAuth transport are real; client_id is the principal id (K1 client_credentials). */
export async function connect(t, w, { id, value }) {
  const { Client, ClientCredentialsProvider, StreamableHTTPClientTransport } = await sdkClient(w.sdk)
  const provider = new ClientCredentialsProvider({ clientId: id, clientSecret: value, expectedIssuer: w.urls().issuer })
  const transport = new StreamableHTTPClientTransport(new URL(w.urls().resource), { authProvider: provider })
  const client = new Client(FIXTURE.clientInfo, { capabilities: {}, versionNegotiation: { mode: { pin: K1.PROTOCOL.version } } })
  t.after(() => client.close().catch(() => {}))
  await client.connect(transport, { timeout: BUDGET.rpcMs })
  return client
}

export async function paired(t, w) {
  const made = await createToken(w, fresh(DATA.label))
  const id = fresh()
  const client = await connect(t, w, { id, value: made.value })
  assert.equal((await okCall(client, K1.TOOL.pair)).id, id)
  const principals = await w.service(SURFACE.service.handover, 'principals')
  const principal = principals.value.find((entry) => entry.id === id)
  assert.ok(principal, 'pair must already appear in the public handover service')
  return { made, id, client, principalKey: principal.key }
}

/** Creates a real ordinary session and one user turn, without session_start or any child. */
export async function userSession(w) {
  const session = await w.call(OP.createSession, { name: fresh(DATA.folder) })
  const turn = await w.call(OP.userDrive, { sessionId: session.sessionId, text: DATA.userText })
  assert.equal(turn.status, EXPECT.idle)
  return session
}
export async function handOver(w, sessionId, principalKey) {
  const result = await w.service(SURFACE.service.handover, 'handOver', sessionId, principalKey)
  assert.equal(result.value?.ok, true, JSON.stringify(result))
}
export async function managedSession(w, principalKey) {
  const session = await userSession(w)
  await handOver(w, session.sessionId, principalKey)
  return session
}
export const managedOf = async (w) => (await w.service(SURFACE.service.handover, 'managed')).value
export const read = (client, sessionId) => okCall(client, K1.TOOL.sessionRead, { sessionId, ...DATA.read })
export const listedIds = async (client) => (await okCall(client, K1.TOOL.sessionsList, { limit: LIMITS.sessionsListed })).sessions.map((row) => row.sessionId)

/** Native disable/re-enable, never a process restart, token-entry switch, or direct apply call. */
export async function remount(w) {
  const before = await w.call(OP.row)
  assert.equal(before.active, true)
  await w.call(OP.bundleEnabled, { enabled: false })
  assert.ok(await eventually(async () => (await w.call(OP.row)).active !== true), 'bundle disable did not deactivate its row')
  assert.ok(await eventually(async () => {
    const disabled = await w.call(OP.services, { names: V3_SERVICES })
    return V3_SERVICES.every((name) => disabled[name]?.present === false)
  }), 'a V3 service survived bundle disable')
  await w.call(OP.bundleEnabled, { enabled: true })
  assert.ok(await eventually(async () => {
    const row = await w.call(OP.row)
    const services = await w.call(OP.services, { names: V3_SERVICES })
    return row.active && row.fiber !== before.fiber && V3_SERVICES.every((name) => services[name]?.present)
  }), 'real bundle remount did not return a new active fiber and every V3 service')
  const after = await w.call(OP.row)
  assert.notEqual(after.fiber, before.fiber, 'the test must exercise a real remount, not a no-op toggle')
  const services = await w.call(OP.services, { names: V3_SERVICES })
  for (const name of V3_SERVICES) assert.equal(services[name].apiVersion, SURFACE.apiVersion, name)
}

export async function assertMetadata(w) {
  const metadata = await w.raw(K1.HTTP_METHOD.get, SCHEMA_TEXT.protectedResource)
  assert.equal(metadata.status, K1.HTTP_STATUS.ok, metadata.text)
  assert.deepEqual(metadata.json, K1.protectedResourceMetadata(w.origin))
  const authorization = await w.raw(K1.HTTP_METHOD.get, SCHEMA_TEXT.authorizationServer)
  assert.equal(authorization.status, K1.HTTP_STATUS.ok, authorization.text)
  assert.equal(authorization.json.issuer, w.urls().issuer)
  assert.equal(authorization.json.token_endpoint, w.urls().tokenEndpoint)
  assert.equal(typeof authorization.json.authorization_endpoint, 'string')
  return metadata.json
}

/** Await the new notice before accepting restoration; a stale previous list cannot make it pass. */
export async function assertDuplicateRefused(w, expected, label) {
  assert.ok(await eventually(async () => {
    const notice = (await noticeOf(w)).notice
    return notice?.code === K1.SETTINGS_REFUSAL.tokenDuplicate && notice.labels?.flat().includes(label)
  }), 'duplicate was not REFUSED with a notice naming the attempted copy')
  assert.ok(await eventually(async () => JSON.stringify(await tokensOf(w)) === JSON.stringify(expected)), 'previous list was not written back to describe().value.tokens')
  assert.deepEqual(await tokensOf(w), expected)
  const settingsItem = ({ key, label: itemLabel, enabled }) => ({ key, label: itemLabel, enabled })
  assert.deepEqual((await stateOf(w)).entries.map(settingsItem), expected.map(settingsItem), 'the duplicate key, label or enabled flag reached the live public registry')
}

/** Native event bus only: never synthesize a bump or inspect connector activity implementation. */
export async function activityAfter(w, offset, sessionId) {
  assert.ok(await eventually(async () => (await w.call(OP.activity)).slice(offset).some((event) => event.sessionId === sessionId)), `${EXPECT.activityEvent} missing for the delivered target`)
  const events = (await w.call(OP.activity)).slice(offset)
  assert.ok(events.length > 0)
  for (const event of events) {
    assert.equal(event.sessionId, sessionId, 'delivery bumped an unrelated session')
    assert.equal(Number.isFinite(event.timestamp), true, 'activity timestamp must be finite')
  }
  return events
}
